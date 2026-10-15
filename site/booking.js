// Four-step pickup booking form on the Book a Pickup page.
// Needs React, ReactDOM, htm and common.js.
(() => {
const { useState, useRef } = React;
const html = htm.bind(React.createElement);

const POSTAL_RE = /^[a-z]\d[a-z][ -]?\d[a-z]\d$/i;
// Forward sortation areas inside a 90 km radius of 13060 80 Ave, Surrey BC
const SERVICE_FSAS = new Set((
  'V3R V3S V3T V3V V3W V3X V3Z V4A V4N V4P V4B V4C V4E V4G V4K V4L V4M ' + // Surrey, Delta, White Rock
  'V2Y V2Z V3A V1M V4W ' +                                                  // Langley
  'V3B V3C V3E V3H V3J V3K V5A V5B V5C V5E V5G V5H V5J V5K ' +             // Tri-Cities, Burnaby
  'V3L V3M ' +                                                              // New Westminster
  'V2W V2X V4R ' +                                                          // Maple Ridge, Pitt Meadows
  'V5L V5M V5N V5P V5R V5S V5T V5V V5W V5X V5Y V5Z ' +                      // Vancouver east/south
  'V6A V6B V6C V6E V6G V6H V6J V6K V6L V6M V6N V6P V6R V6S V6T V6Z ' +      // Vancouver west
  'V6V V6W V6X V6Y V7A V7C V7E ' +                                          // Richmond
  'V7G V7H V7J V7K V7L V7M V7N V7P V7R V7S V7T V7V V7W ' +                  // North & West Vancouver
  'V2P V2R V2S V2T V3G V4S V2V ' +                                          // Abbotsford, Mission, Chilliwack
  'V8B'                                                                     // Squamish
).split(' '));
const inRange = p => SERVICE_FSAS.has(p.trim().slice(0, 3).toUpperCase());

const FIELDS = [
  { key: 'name', label: 'Full name', req: true, span: 2, ac: 'name' },
  { key: 'email', label: 'Email', type: 'email', ac: 'email',
    check: v => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim()) || 'Enter a valid email address' },
  { key: 'phone', label: 'Mobile', type: 'tel', ac: 'tel',
    check: v => v.replace(/\D/g, '').length >= 10 || 'Enter a 10-digit number' },
  { key: 'addr', label: 'Street address', req: true, span: 2, ac: 'address-line1' },
  { key: 'unit', label: 'Unit / buzzer', ac: 'address-line2' },
  { key: 'city', label: 'City', req: true, ac: 'address-level2' },
  { key: 'postal', label: 'Postal code', req: true, ac: 'postal-code',
    check: v => {
      if (!POSTAL_RE.test(v.trim())) return 'Use the format A1A 1A1';
      return inRange(v) || 'Outside our 90 km radius — use a depot or shipping label';
    } },
  { key: 'count', label: 'Number of items', req: true, type: 'number', ac: 'off' }
];

const LOAD_TYPES = ['Laptops', 'Desktops', 'Phones', 'Tablets', 'Servers', 'Monitors', 'Networking gear', 'Gaming consoles', 'TVs'];

const STEPS = [
  { name: 'your details', q: 'Who should the driver ask for?', help: 'Give us an email or a mobile number — whichever you check. We only use it to reach you about the pickup.', keys: ['name', 'email', 'phone'] },
  { name: 'the address', q: 'Where are we picking up?', help: 'Our truck runs a 90 km radius around the drop box at 13060 80 Ave, Surrey — roughly Squamish to Chilliwack.', keys: ['addr', 'unit', 'city', 'postal'] },
  { name: 'the load', q: "What's in the load?", help: "A rough count is fine — we're not going to hold you to it.", keys: ['count'] },
  { name: 'checking it over', q: 'Have a quick look', help: 'Check these are right before you book. Use Back to fix anything.', keys: [] }
];

const fieldsFor = n => FIELDS.filter(f => STEPS[n - 1].keys.includes(f.key));
const EMPTY = { name: '', email: '', phone: '', addr: '', unit: '', city: '', postal: '', count: '' };

const LOCK = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style=${{ flex: 'none', marginTop: '3px' }}><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5"/></svg>`;

function Booked({ code, reset, home, emailedTo }) {
  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '34px' }}>
      <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px', padding: '8px 0 4px' }}>
        <span style=${{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#0A2E2C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        <div style=${{ fontFamily: 'var(--sg)', fontWeight: 700, fontSize: '28px', letterSpacing: '-.025em', lineHeight: 1.1, marginTop: '4px' }}>You're booked</div>
        <div style=${{ fontSize: '15.5px', lineHeight: 1.55, color: 'rgba(10,46,44,.72)', maxWidth: '380px' }}>We'll be in touch within one business day to confirm your pickup date.${emailedTo && html` A copy of this confirmation is on its way to <strong style=${{ color: 'var(--ink)', fontWeight: 600 }}>${emailedTo}</strong>.`}</div>
      </div>
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', border: '1px solid rgba(10,46,44,.14)', borderRadius: '10px', padding: '16px 20px', flexWrap: 'wrap' }}>
        <span style=${{ fontSize: '14.5px', color: 'rgba(10,46,44,.72)' }}>Confirmation number</span>
        <span style=${{ fontFamily: 'var(--sg)', fontWeight: 700, fontSize: '24px', letterSpacing: '.08em' }}>${code}</span>
      </div>
      <div style=${{ display: 'flex', flexDirection: 'column' }}>
        <div style=${{ fontFamily: 'var(--sg)', fontWeight: 600, fontSize: '17px', letterSpacing: '-.01em', paddingBottom: '4px' }}>What happens next</div>
        ${[['Day before', "We'll send you a reminder of your pickup time."],
           ['Pickup day', "Leave everything by your door. You don't need to be home."],
           ['On the way', 'A heads-up when the truck is a few stops away.']].map(([k, v], i) => html`
          <div key=${k} style=${{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: '16px', padding: '14px 0', borderBottom: i < 2 ? '1px solid rgba(10,46,44,.1)' : 'none' }}>
            <span style=${{ fontFamily: 'var(--sg)', fontWeight: 600, fontSize: '13px', paddingTop: '2px' }}>${k}</span>
            <span style=${{ fontSize: '15px', lineHeight: 1.55, color: 'rgba(10,46,44,.78)', textWrap: 'pretty' }}>${v}</span>
          </div>`)}
      </div>
      <div style=${{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
        <a href=${home} style=${{ background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--sg)', fontWeight: 600, fontSize: '15px', padding: '13px 22px', borderRadius: '999px' }}>Back to the site</a>
        <button type="button" onClick=${reset} style=${{ background: 'none', border: 'none', fontFamily: 'var(--plex)', fontSize: '14.5px', color: 'rgba(10,46,44,.72)', cursor: 'pointer', textDecoration: 'underline' }}>Book another pickup</button>
      </div>
      <p style=${{ margin: '-8px 0 0', textAlign: 'center', fontSize: '14px', lineHeight: 1.55, color: 'rgba(10,46,44,.62)' }}>
        Keep your confirmation number. Need to cancel or change something? <a class="u" href=${'manage.html?code=' + code}>Manage this booking</a>
      </p>
    </div>`;
}

function Booking({ home, scrollTarget }) {
  const [vals, setVals] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState('fwd');
  const [load, setLoad] = useState({});
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailedTo, setEmailedTo] = useState('');
  const [booked, setBooked] = useState(null);
  const [sugg, setSugg] = useState([]);
  const [suggOpen, setSuggOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [honey, setHoney] = useState('');
  const addrT = useRef(0), addrReq = useRef(0);

  const touch = keys => setTouched(t => { const n = { ...t }; keys.forEach(k => { n[k] = true; }); return n; });

  const fieldError = f => {
    const raw = vals[f.key] || '';
    if (!raw.trim()) return f.req && touched[f.key] ? 'Required' : '';
    if (f.check) { const r = f.check(raw); if (r !== true) return r; }
    return '';
  };

  const invalidIn = n => {
    const missingContact = n === 1 && !vals.email.trim() && !vals.phone.trim()
      ? [{ key: 'email', label: 'an email or mobile number' }] : [];
    return missingContact.concat(fieldsFor(n).filter(f => {
      const raw = (vals[f.key] || '').trim();
      if (!raw) return !!f.req;
      return f.check ? f.check(raw) !== true : false;
    }));
  };

  const lookupAddr = q => {
    clearTimeout(addrT.current);
    if (q.trim().length < 4) { setSugg([]); setSuggOpen(false); return; }
    addrT.current = setTimeout(async () => {
      const id = ++addrReq.current;
      try {
        const url = 'https://photon.komoot.io/api/?limit=6&lang=en&lat=49.19&lon=-122.85&bbox=-124.3,48.9,-120.9,50.3&q=' + encodeURIComponent(q);
        const data = await (await fetch(url)).json();
        if (id !== addrReq.current) return;
        const seen = {};
        const list = (data.features || []).map(ft => {
          const pr = ft.properties || {};
          if (pr.countrycode && pr.countrycode !== 'CA') return null;
          const street = [pr.housenumber, pr.street].filter(Boolean).join(' ') || pr.name || '';
          const city = pr.city || pr.town || pr.village || pr.district || '';
          const postal = (pr.postcode || '').toUpperCase();
          const sub = [city, pr.state, postal].filter(Boolean).join(', ');
          if (!street || seen[street + sub]) return null;
          seen[street + sub] = 1;
          return { main: street, sub, street, city, postal };
        }).filter(Boolean).slice(0, 5);
        setSugg(list); setSuggOpen(true);
      } catch (e) { setSugg([]); setSuggOpen(false); }
    }, 250);
  };

  const pickAddr = g => {
    const postalOk = /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(g.postal);
    setVals(v => ({ ...v, addr: g.street, city: g.city || v.city, postal: postalOk ? g.postal : v.postal }));
    setTouched(t => ({ ...t, addr: true, city: true, postal: !!g.postal || t.postal }));
    setSugg([]); setSuggOpen(false);
  };

  const last = step === 4;
  const cur = STEPS[step - 1];
  const allInvalid = [1, 2, 3].flatMap(invalidIn);
  const stepInvalid = invalidIn(step);
  const ready = last ? allInvalid.length === 0 && consent : stepInvalid.length === 0;
  const picked = LOAD_TYPES.filter(t => load[t]);

  let cta;
  if (last) {
    cta = sending ? 'Sending…' : ready ? 'Book the pickup' : allInvalid.length
      ? `${allInvalid.length} field${allInvalid.length > 1 ? 's' : ''} still empty — go back`
      : 'Confirm the wipe consent above';
  } else {
    const b = stepInvalid[0];
    if (!b) cta = 'Continue';
    else {
      const raw = (vals[b.key] || '').trim();
      if (!raw) cta = `Fill in ${b.label.toLowerCase()} to continue`;
      else {
        const msg = b.check ? b.check(raw) : true;
        cta = typeof msg === 'string' ? msg : `Fix ${b.label.toLowerCase()} to continue`;
      }
    }
  }

  const sendBooking = async code => {
    const address = [vals.addr.trim(), vals.unit.trim() && 'Unit ' + vals.unit.trim()].filter(Boolean).join(', ');
    await ETD.send({
      _subject: `New pickup booking ${code} — ${vals.city.trim() || 'no city'}`,
      _honey: honey,
      'Confirmation': code,
      'Name': vals.name.trim(),
      'Email': vals.email.trim() || '—',
      'Mobile': vals.phone.trim() || '—',
      'Address': address,
      'City': vals.city.trim(),
      'Postal code': vals.postal.trim().toUpperCase(),
      'Number of items': vals.count.trim(),
      'Item types': picked.join(', ') || '—',
      'Driver notes': notes.trim() || '—',
      'Wipe consent': 'Yes',
    });
    const saved = {
      name: vals.name.trim(), email: vals.email.trim(), phone: vals.phone.trim(),
      address: [address, vals.city.trim(), vals.postal.trim().toUpperCase()].filter(Boolean).join(', '),
      load: [vals.count.trim() + ' items', picked.join(', ')].filter(Boolean).join(' — '),
      notes: notes.trim()
    };
    ETD.saveBooking(code, saved);
    const manageUrl = new URL('manage.html?code=' + code, location.href).href;
    // Always record the booking in the sheet; the script only emails when there's an address.
    const recorded = ETD.confirm({ ...saved, code, manageUrl, _honey: honey });
    return recorded && saved.email ? saved.email : '';
  };

  const submit = async e => {
    e.preventDefault();
    if (sending) return;
    if (!ready) { touch((last ? FIELDS : fieldsFor(step)).map(f => f.key)); return; }
    if (!last) { setStep(s => s + 1); setDir('fwd'); return; }
    const code = ETD.newCode();
    setSending(true); setSendErr('');
    try {
      setEmailedTo(await sendBooking(code));
      setBooked(code);
      if (scrollTarget) scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setSendErr("We couldn't send your booking. Please try again, or call us at (604) 953-9883.");
    } finally { setSending(false); }
  };

  const reset = () => {
    setVals(EMPTY); setTouched({}); setLoad({}); setNotes(''); setConsent(false);
    setStep(1); setDir('fwd'); setBooked(null); setSendErr(''); setEmailedTo('');
  };

  if (booked) return html`<${Booked} code=${booked} reset=${reset} home=${home} emailedTo=${emailedTo} />`;

  const review = [
    ['contact', [vals.email.trim(), vals.phone.trim()].filter(Boolean).join(' · ')],
    ['address', [vals.addr.trim(), vals.unit.trim() && '#' + vals.unit.trim(), vals.city.trim(), vals.postal.trim().toUpperCase()].filter(Boolean).join(', ')],
    ['load', [vals.count.trim() ? vals.count.trim() + ' items' : '', picked.join(', ')].filter(Boolean).join(' — ')]
  ];

  return html`
    <div class="eyebrow" style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: 'rgba(10,46,44,.62)' }}>
      <span>Step ${step} of 4 — ${cur.name}</span><span style=${{ color: 'var(--olive)' }}>${step * 25}%</span>
    </div>
    <div style=${{ marginTop: '10px', height: '3px', borderRadius: '2px', background: 'rgba(10,46,44,.16)', overflow: 'hidden' }}
         role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow=${step}>
      <div style=${{ height: '100%', width: step * 25 + '%', background: 'var(--ink)', borderRadius: '2px', transition: 'width .35s cubic-bezier(.4,0,.2,1)' }}></div>
    </div>

    <form onSubmit=${submit} noValidate style=${{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '22px' }}>
      <div key=${step} style=${{ animation: `${dir === 'back' ? 'etd-pane-back' : 'etd-pane-in'} .3s cubic-bezier(.2,.7,.3,1) both` }}>
        <h2 style=${{ fontFamily: 'var(--sg)', fontWeight: 700, fontSize: '28px', letterSpacing: '-.025em', margin: '0 0 4px' }}>${cur.q}</h2>
        <p style=${{ fontSize: '15px', lineHeight: 1.55, color: 'rgba(10,46,44,.65)', margin: '0 0 16px' }}>${cur.help}</p>

        ${fieldsFor(step).length > 0 && html`
          <div class="fields">
            ${fieldsFor(step).map(f => {
              const err = fieldError(f);
              const showSugg = f.key === 'addr' && suggOpen && sugg.length > 0;
              return html`
                <label key=${f.key} class=${'field' + (f.span === 2 ? ' span2' : '')}>
                  <span class="field-label">${f.label}${f.req && html`<span style=${{ color: 'var(--olive)' }}>*</span>`}</span>
                  <input class=${'inp' + (err ? ' bad' : '')} type=${f.type || 'text'} autoComplete=${f.ac}
                    min=${f.type === 'number' ? 1 : undefined} inputMode=${f.type === 'number' ? 'numeric' : undefined}
                    aria-invalid=${!!err}
                    value=${vals[f.key]}
                    onChange=${e => {
                      const v = e.target.value;
                      setVals(s => ({ ...s, [f.key]: v }));
                      touch([f.key]);
                      if (f.key === 'addr') lookupAddr(v);
                    }}
                    onBlur=${() => { touch([f.key]); if (f.key === 'addr') setSuggOpen(false); }} />
                  ${err && html`<span class="err-text" role="alert">${err}</span>`}
                  ${showSugg && html`
                    <div class="sugg">
                      ${sugg.map(g => html`
                        <button type="button" key=${g.main + g.sub} onMouseDown=${e => { e.preventDefault(); pickAddr(g); }}>
                          <span class="m">${g.main}</span><span class="s">${g.sub}</span>
                        </button>`)}
                    </div>`}
                </label>`;
            })}
          </div>`}

        ${step === 2 && POSTAL_RE.test(vals.postal.trim()) && !inRange(vals.postal) && html`
          <div style=${{ marginTop: '14px', border: '1px solid rgba(180,35,24,.35)', borderRadius: '9px', padding: '15px 17px' }}>
            <div style=${{ fontFamily: 'var(--sg)', fontWeight: 600, fontSize: '16px', color: 'var(--err)' }}>That's a bit far for the truck</div>
            <div style=${{ fontSize: '14.5px', lineHeight: 1.55, color: 'rgba(10,46,44,.75)', marginTop: '6px' }}>
              No problem though — drop it at any <a class="ext" href="https://www.era.ca/recycling-depots/" target="_blank" rel="noopener">ERA depot</a>, or request a free <a class="ext" href="https://www.era.ca/shippinglabel/" target="_blank" rel="noopener">prepaid shipping label</a> and mail it in.
            </div>
          </div>`}

        ${step === 3 && html`
          <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
            ${LOAD_TYPES.map(t => html`
              <button type="button" key=${t} class=${'chip' + (load[t] ? ' on' : '')} aria-pressed=${!!load[t]}
                onClick=${() => setLoad(l => ({ ...l, [t]: !l[t] }))}>${t}</button>`)}
          </div>
          <label style=${{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
            <span class="field-label">Anything the driver should know <span class="eyebrow" style=${{ letterSpacing: '.06em', color: 'rgba(10,46,44,.62)' }}>optional</span></span>
            <textarea class="inp" rows="2" value=${notes} onChange=${e => setNotes(e.target.value)}></textarea>
          </label>`}

        ${last && html`
          <div style=${{ display: 'flex', flexDirection: 'column', borderTop: '1px solid rgba(10,46,44,.16)' }}>
            ${review.map(([k, v]) => html`
              <div key=${k} style=${{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid rgba(10,46,44,.16)' }}>
                <span class="eyebrow" style=${{ letterSpacing: '.1em', color: 'rgba(10,46,44,.62)', flex: 'none', paddingTop: '3px' }}>${k}</span>
                <span style=${{ fontSize: '15px', lineHeight: 1.5, textAlign: 'right', color: v ? 'var(--ink)' : 'var(--err)' }}>${v || 'Missing'}</span>
              </div>`)}
          </div>
          <label style=${{ display: 'flex', gap: '11px', alignItems: 'flex-start', padding: '13px 15px', marginTop: '14px', border: '1px solid rgba(10,46,44,.22)', borderRadius: '9px', fontSize: '14.5px', lineHeight: 1.5, color: 'rgba(10,46,44,.82)', cursor: 'pointer' }}>
            <input type="checkbox" checked=${consent} onChange=${() => setConsent(c => !c)} style=${{ marginTop: '3px', accentColor: 'var(--ink)', width: '16px', height: '16px', flex: 'none' }} />
            <span>I understand every hard drive will be erased or destroyed at ERA, and I have downloaded everything I want to keep.</span>
          </label>`}
      </div>

      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
        ${step > 1 && html`<button type="button" class="btn-back" onClick=${() => { setStep(s => Math.max(1, s - 1)); setDir('back'); }}>Back</button>`}
        <button type="submit" class=${'btn-go' + (ready && !sending ? ' ready' : '')} aria-disabled=${!ready || sending}>${cta}</button>
      </div>
      ${sendErr && html`<p role="alert" style=${{ margin: '-6px 0 0', textAlign: 'center', fontSize: '14.5px', lineHeight: 1.5, color: 'var(--err)' }}>${sendErr}</p>`}
      <input type="text" name="_honey" tabIndex="-1" autoComplete="off" aria-hidden="true" value=${honey}
        onChange=${e => setHoney(e.target.value)} style=${{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} />
      <p class="card-foot" style=${{ borderTop: '1px solid rgba(10,46,44,.1)', display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13.5px', lineHeight: 1.55, color: 'rgba(10,46,44,.66)' }}>
        ${LOCK}<span>Sent securely and used only to arrange this pickup. Never sold or shared.</span>
      </p>
    </form>`;
}

window.mountBooking = (el, opts = {}) => {
  ReactDOM.createRoot(el).render(html`<${Booking} home=${opts.home || 'index.html'} scrollTarget=${opts.scrollTarget || el} />`);
};
})();
