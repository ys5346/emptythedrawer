// Manage-booking flow: confirmation code → live status from the bookings sheet →
// cancel / reschedule / change while the pickup is still ahead. Requests go to the
// bookings inbox and onto the booking's row. Needs React, ReactDOM, htm and common.js.
(() => {
const { useState, useRef, useEffect } = React;
const html = htm.bind(React.createElement);

const ICONS = {
  cancel: html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>`,
  reschedule: html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>`,
  change: html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5l4 4L9 19H5v-4z"/></svg>`
};
const CHECK = html`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

const ACTIONS = [
  { key: 'cancel', label: 'Cancel pickup', sub: "We won't send the truck", cta: 'Cancel Pickup', subject: 'Cancel request', tint: '#B42318' },
  { key: 'reschedule', label: 'Reschedule', sub: 'Choose a time that suits you better', cta: 'Request New Time', subject: 'Reschedule request', tint: '#4F6B12' },
  { key: 'change', label: 'Change details', sub: 'Address, items or contact info', cta: 'Send Changes', subject: 'Change request', tint: '#0A2E2C' }
];
const OPTIONS = {
  cancel: { title: 'Reason', hint: 'Optional', items: ['Already dropped it off', "Don't need it anymore", 'Booked by mistake', 'Something else'] },
  reschedule: { title: 'Times that work', items: ['Weekday mornings', 'Weekday afternoons', 'Weekday evenings', 'Saturdays', 'Any time'] },
  change: { title: 'What to change', hint: 'Optional', items: ['Pickup address', "What's in the load", 'Contact details', 'Driver notes'] }
};
const NOTE = {
  cancel: { title: 'Anything else?', ph: 'Optional' },
  reschedule: { title: 'Dates to avoid', ph: 'Optional — e.g. away 20–24 Oct' },
  change: { title: 'New details', ph: 'e.g. New address is 456 Main St, Unit 2' }
};
const DONE = {
  cancel: ['Cancellation sent', "We'll take you off the truck run and confirm within one business day."],
  reschedule: ['Request sent', "We'll find a new slot and confirm it within one business day."],
  change: ['Changes sent', "We'll update your booking and confirm within one business day."]
};

// Five boxes backed by one real input, so typing, deleting and pasting all work.
function CodeInput({ value, onChange, invalid }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!value && ref.current) ref.current.focus(); }, []);
  return html`
    <div class=${'code' + (invalid ? ' bad' : '')} onClick=${() => ref.current && ref.current.focus()}>
      ${[0, 1, 2, 3, 4].map(i => html`
        <span key=${i} class=${'code-box' + (value[i] ? ' filled' : '') + (focused && i === Math.min(value.length, 4) ? ' active' : '')}>
          ${value[i] || ''}
        </span>`)}
      <input ref=${ref} class="code-input" value=${value} aria-label="Confirmation number"
        autoComplete="one-time-code" autoCapitalize="characters" spellCheck="false" inputMode="text"
        onFocus=${() => setFocused(true)} onBlur=${() => setFocused(false)}
        onChange=${e => onChange(ETD.normCode(e.target.value))} />
    </div>`;
}

function Group({ title, hint, children }) {
  return html`
    <section class="group">
      ${title && html`<div class="group-title">${title}${hint && html`<span>${hint}</span>`}</div>`}
      <div class="group-body">${children}</div>
    </section>`;
}

const STEPS = [
  { key: 'new', label: 'Booked' },
  { key: 'scheduled', label: 'Pickup scheduled' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'recycled', label: 'Recycled' }
];
const STATUS_TEXT = {
  new: ['Booked', "We'll confirm your pickup day within one business day."],
  scheduled: ['Pickup scheduled', 'Leave everything by your door on pickup day. You don\u2019t need to be home.'],
  on_the_way: ['On the way', 'The truck is a few stops away. Please make sure everything is by your door.'],
  picked_up: ['Picked up', 'Your devices are on their way to ERA to be wiped and refurbished.'],
  recycled: ['Recycled', 'Every drive was wiped or shredded, and your devices have been refurbished or recycled. Thank you!'],
  cancelled: ['Cancelled', 'This pickup was cancelled.']
};

function Timeline({ booking }) {
  const at = STEPS.findIndex(s => s.key === booking.status);
  return html`
    <ol class="timeline">
      ${STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'next';
        let sub = '';
        if (s.key === 'new' && booking.bookedLabel) sub = booking.bookedLabel;
        if (s.key === 'scheduled') sub = booking.pickupLabel || (i >= at ? 'We\u2019ll confirm your day' : '');
        return html`
          <li key=${s.key} class=${'tl-step ' + state}>
            <span class="tl-dot">${state === 'done' && CHECK}</span>
            <span class="tl-text"><span class="tl-label">${s.label}</span>${sub && html`<span class="tl-sub">${sub}</span>`}</span>
          </li>`;
      })}
    </ol>`;
}

function Manage({ initialCode }) {
  const [code, setCode] = useState(ETD.normCode(initialCode || ''));
  const [look, setLook] = useState({ state: 'idle' });
  const [action, setAction] = useState(null);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [done, setDone] = useState(null);
  const [honey, setHoney] = useState('');
  const lookId = useRef(0);

  const complete = code.length === 5;
  const valid = ETD.CODE_RE.test(code);
  const act = ACTIONS.find(a => a.key === action);

  // Check the code against the bookings sheet as soon as it's complete.
  useEffect(() => {
    setAction(null); setPicked([]); setNote(''); setSendErr('');
    if (!valid) { setLook({ state: 'idle' }); return; }
    const id = ++lookId.current;
    setLook({ state: 'loading' });
    ETD.lookup(code).then(r => {
      if (id !== lookId.current) return;
      if (r === null) setLook({ state: 'error' });
      else if (r.busy) setLook({ state: 'busy' });
      else if (!r.found) setLook({ state: 'missing' });
      else setLook({ state: 'found', booking: r });
    });
  }, [code]);

  const booking = look.state === 'found' ? look.booking : null;
  // Changes are allowed while the pickup hasn't happened, or if we couldn't reach the sheet.
  const canChange = (booking && (booking.status === 'new' || booking.status === 'scheduled')) || look.state === 'error';

  const ready = valid && canChange && act &&
    (action !== 'reschedule' || picked.length > 0 || note.trim()) &&
    (action !== 'change' || note.trim());

  const choose = key => { if (key !== action) { setAction(key); setPicked([]); setNote(''); setSendErr(''); } };
  const togglePick = v => setPicked(l => l.includes(v) ? l.filter(x => x !== v) : [...l, v]);

  const submit = async e => {
    e.preventDefault();
    if (!ready || sending) return;
    const fields = {
      _subject: `${act.subject} — booking ${code}`,
      _honey: honey,
      'Confirmation': code,
      'Request': act.label,
      [OPTIONS[action].title]: picked.join(', ') || '—',
      'Details': note.trim() || '—'
    };
    if (booking) {
      fields['Booking status'] = [STATUS_TEXT[booking.status][0], booking.pickupLabel && 'pickup ' + booking.pickupLabel].filter(Boolean).join(' · ');
    } else {
      fields['Booking status'] = "Couldn't check the bookings sheet — look it up by code";
    }
    setSending(true); setSendErr('');
    try {
      await ETD.send(fields);
      ETD.request({ code, action, choices: picked.join(', '), details: note.trim(), _honey: honey });
      setDone(action);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSendErr("Couldn't send your request. Check your connection and try again.");
    } finally { setSending(false); }
  };

  const startOver = () => { setCode(''); setAction(null); setPicked([]); setNote(''); setDone(null); setSendErr(''); };

  if (done) {
    const [title, body] = DONE[done];
    return html`
      <div class="done">
        <div class="done-mark">${CHECK}</div>
        <h1 class="title">${title}</h1>
        <p class="subtitle">${body}</p>
        <div class="done-code"><span>Booking</span><strong>${code}</strong></div>
        <a class="btn-primary" href="index.html">Done</a>
        <button type="button" class="btn-plain" onClick=${startOver}>Manage another booking</button>
      </div>`;
  }

  let help = 'For example, AB12C';
  let helpBad = false;
  if (complete && !valid) { help = "That doesn't look like a confirmation number. It's 2 letters, 2 numbers, then a letter."; helpBad = true; }
  else if (look.state === 'loading') help = 'Looking up your booking…';
  else if (look.state === 'missing') { help = "We can't find a booking with that number. Check it against your confirmation email, or contact us."; helpBad = true; }
  else if (look.state === 'busy') { help = 'Lots of lookups right now. Try again in a minute.'; helpBad = true; }
  else if (look.state === 'error') help = "Couldn't check your booking right now, but you can still send us a request.";
  else if (booking) help = '';

  return html`
    <form onSubmit=${submit} noValidate>
      <header class="intro">
        <h1 class="title">Manage your booking</h1>
        <p class="subtitle">Enter the five-character confirmation number from when you booked.</p>
      </header>

      <${CodeInput} value=${code} onChange=${v => { setCode(v); setSendErr(''); }} invalid=${(complete && !valid) || look.state === 'missing'} />
      <p class=${'code-help' + (helpBad ? ' bad' : '')} aria-live="polite">
        ${look.state === 'loading' && html`<span class="spinner dark" aria-hidden="true"></span> `}${help}
      </p>

      ${booking && html`
        <div class="reveal">
          <${Group} title="Your booking">
            <div class="status-head">
              <span class=${'status-pill ' + booking.status}>${STATUS_TEXT[booking.status][0]}</span>
              <p>${STATUS_TEXT[booking.status][1]}</p>
            </div>
            ${booking.status !== 'cancelled' && html`<${Timeline} booking=${booking} />`}
            ${booking.lastRequest && html`
              <div class="row static">
                <div class="row-text"><div class="row-label">Your latest request</div><div class="row-sub">${booking.lastRequest} · we'll confirm by email or text</div></div>
              </div>`}
          <//>
          ${booking.status === 'cancelled' && html`<p class="after-note"><a href="book.html">Book a new pickup</a></p>`}
          ${(booking.status === 'picked_up' || booking.status === 'recycled') && html`<p class="after-note">Questions about your donation? <a href="contact.html">Contact us</a>.</p>`}
        </div>`}

      ${valid && canChange && html`
        <div class="reveal">
          <${Group} title="What would you like to do?">
            ${ACTIONS.map(a => html`
              <button type="button" key=${a.key} class=${'row' + (action === a.key ? ' selected' : '')}
                role="radio" aria-checked=${action === a.key} onClick=${() => choose(a.key)}>
                <span class="row-icon" style=${{ background: a.tint }}>${ICONS[a.key]}</span>
                <span class="row-text"><span class="row-label">${a.label}</span><span class="row-sub">${a.sub}</span></span>
                <span class="row-check">${action === a.key && CHECK}</span>
              </button>`)}
          <//>

          ${act && html`
            <div class="reveal" key=${action}>
              <${Group} title=${OPTIONS[action].title} hint=${OPTIONS[action].hint}>
                ${OPTIONS[action].items.map(o => html`
                  <button type="button" key=${o} class=${'row compact' + (picked.includes(o) ? ' selected' : '')}
                    role="checkbox" aria-checked=${picked.includes(o)} onClick=${() => togglePick(o)}>
                    <span class="row-text"><span class="row-label">${o}</span></span>
                    <span class="row-check">${picked.includes(o) && CHECK}</span>
                  </button>`)}
              <//>
              <${Group} title=${NOTE[action].title}>
                <textarea class="note" rows="3" value=${note} placeholder=${NOTE[action].ph}
                  aria-label=${NOTE[action].title} onChange=${e => setNote(e.target.value)}></textarea>
              <//>

              <button type="submit" class=${'btn-primary' + (action === 'cancel' ? ' destructive' : '')} disabled=${!ready || sending}>
                ${sending ? html`<span class="spinner" aria-hidden="true"></span> Sending` : act.cta}
              </button>
              ${sendErr && html`<p class="send-err" role="alert">${sendErr}</p>`}
            </div>`}
        </div>`}

      <input type="text" name="_honey" tabIndex="-1" autoComplete="off" aria-hidden="true" value=${honey}
        onChange=${e => setHoney(e.target.value)} class="honey" />
    </form>`;
}

window.mountManage = (el, opts = {}) => {
  ReactDOM.createRoot(el).render(html`<${Manage} initialCode=${opts.code || ''} />`);
};
})();
