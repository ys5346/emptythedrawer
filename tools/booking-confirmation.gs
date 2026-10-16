/**
 * Empty the Drawer — bookings backend (Google Apps Script web app).
 *
 * The website talks to this script for three things:
 *   1. New booking  (POST)  → adds a row to the "Bookings" tab and emails the
 *                              customer their confirmation number.
 *   2. Look up      (GET ?action=lookup&code=AB12C) → returns only that booking's
 *                              status and dates for the "Manage your booking" page —
 *                              never the customer's name, address, contact details or items.
 *   3. Request      (POST type=request) → acts on a customer's request: a cancel
 *                              cancels the booking (and emails them), a reschedule clears
 *                              the pickup day so it goes back to To Schedule, and a change
 *                              is noted on the row for the crew.
 *   4. Crew app     (POST type=crew + passcode) → lists every pickup with full
 *                              details and updates status, pickup date and crew notes
 *                              for the ETD Crew iPhone app. Customers get an email when
 *                              their pickup is scheduled and picked up. When marking a
 *                              pickup done, the crew can record how many items were
 *                              collected and a photo, saved to a private Drive folder.
 *                              The crew can also add bookings that came in elsewhere
 *                              (Marketplace, WhatsApp, a phone call).
 *
 * The crew passcode lives in Project Settings → Script properties → CREW_PASSCODE.
 * `setup` creates one the first time and prints it in the log.
 *
 * "On the way" texts go through Twilio. Add these Script properties (never put
 * them in code): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (your Twilio
 * number, e.g. +16045550100). Without them, customers get an email instead.
 *
 * You run pickups from the sheet: set each booking's Status (New, Scheduled,
 * Picked up, Recycled, Cancelled) and its Pickup date. The website shows
 * whatever is in the sheet.
 *
 * Opening the web app URL with no parameters shows a status check (no personal data).
 *
 * Setup (once): attach this to the bookings Google Sheet (Extensions → Apps Script),
 * paste this file, Save, run `setup`, then Deploy → Web app (Execute as: Me,
 * Who has access: Anyone) and put the URL in CONFIRM_URL in site/common.js.
 * After any code change: Deploy → Manage deployments → Edit → New version.
 *
 * Deploy it while signed in as emptythedrawer@gmail.com. Confirmations are sent
 * as donations@emptythedrawer.org when that address is a Gmail "Send mail as"
 * address; otherwise they come from the Gmail address with replies to donations@.
 */

const CONFIG = {
  fromName: 'Empty the Drawer',
  fromAddress: 'donations@emptythedrawer.org',
  phone: '(604) 953-9883',
  sheetTab: 'Bookings',
  sheetName: 'Empty the Drawer bookings',
  timeZone: 'America/Vancouver',
  siteUrl: 'https://emptythedrawer.org/',
  notifyCustomers: true,          // email customers when a pickup is scheduled and when it's picked up
};

const VERSION = '2026-10-15a';

const CODE_RE = /^[A-HJ-NP-Z]{2}\d{2}[A-HJ-NP-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// Columns are found by their header text, so they can be reordered in the sheet.
const COL = {
  bookedAt: 'Booked at', code: 'Code', status: 'Status', pickupDate: 'Pickup date',
  name: 'Name', email: 'Email', phone: 'Mobile', address: 'Address', load: 'Load',
  notes: 'Driver notes', requests: 'Customer requests', crewNotes: 'Crew notes',
  itemCount: 'Items collected', photo: 'Pickup photo', source: 'Source',
  pickupTime: 'Pickup time',
};
const HEADERS = ['bookedAt', 'code', 'status', 'pickupDate', 'name', 'email', 'phone', 'address', 'load', 'notes', 'requests', 'crewNotes', 'itemCount', 'photo', 'source', 'pickupTime'];
const STATUS_KEYS = { new: 'New', scheduled: 'Scheduled', on_the_way: 'On the way', picked_up: 'Picked up', recycled: 'Recycled', cancelled: 'Cancelled' };
const STATUSES = ['New', 'Scheduled', 'On the way', 'Picked up', 'Recycled', 'Cancelled'];


// ---------- web app entry points ----------

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (d._honey) return json_({ ok: true });                       // bot filled the hidden field
    if (d.type === 'crew') return json_(crew_(d));
    const code = String(d.code || '').toUpperCase();
    if (!CODE_RE.test(code)) return json_({ ok: true });
    if (d.type === 'request') {
      try { noteRequest_(code, d); } catch (err) { recordError_('request', err); }
      return json_({ ok: true });
    }
    newBooking_(code, d);
  } catch (err) {
    recordError_('post', err);
  }
  return json_({ ok: true });
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') return json_(lookup_(String(p.code || '').toUpperCase()));
  return json_(status_());
}


// ---------- new bookings ----------

function newBooking_(code, d) {
  const b = {
    code,
    name: clip_(d.name, 80),
    email: clip_(d.email, 120),
    phone: clip_(d.phone, 30),
    address: clip_(d.address, 200),
    load: clip_(d.load, 200),
    notes: clip_(d.notes, 500),
    manageUrl: /^https?:\/\//.test(d.manageUrl || '') ? clip_(d.manageUrl, 300) : '',
  };

  // Logging and emailing are independent: a problem with one never stops the other.
  try { logRow_(b); } catch (err) { recordError_('sheet', err); }

  // One email per address per 10 minutes, so the endpoint can't be used to spam someone.
  if (EMAIL_RE.test(b.email)) {
    const cache = CacheService.getScriptCache();
    const key = 'sent:' + b.email.toLowerCase();
    if (!cache.get(key)) {
      try {
        sendConfirmation_(b);
        cache.put(key, '1', 600);
      } catch (err) { recordError_('email', err); }
    }
  }
}

function logRow_(b) {
  const sh = sheet_();
  if (findRow_(sh, b.code)) return;                                 // same booking sent twice
  const c = columns_(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  const set = (k, v) => { row[c[k] - 1] = v; };
  set('bookedAt', new Date()); set('code', b.code); set('status', 'New'); set('pickupDate', '');
  set('name', b.name); set('email', b.email); set('phone', b.phone); set('address', b.address);
  set('load', b.load); set('notes', b.notes); set('requests', '');
  if (c.source) set('source', 'Website');
  sh.appendRow(row);
}


// ---------- lookups for the "Manage your booking" page ----------

function lookup_(code) {
  if (!CODE_RE.test(code)) return { found: false };

  // Slow down anyone trying to guess codes: at most 60 lookups a minute in total.
  const cache = CacheService.getScriptCache();
  const minuteKey = 'lk:' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(minuteKey) || 0) + 1;
  cache.put(minuteKey, String(count), 120);
  if (count > 60) return { found: false, busy: true };

  const sh = sheet_();
  const r = findRow_(sh, code);
  if (!r) return { found: false };
  const c = columns_(sh);
  const v = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
  const get = k => v[c[k] - 1];

  const pickup = get('pickupDate') instanceof Date ? get('pickupDate') : null;
  let status = normStatus_(get('status'));
  if (status === 'new' && pickup) status = 'scheduled';
  const requests = String(get('requests') || '').split('\n').filter(Boolean);
  const booked = get('bookedAt') instanceof Date ? get('bookedAt') : null;

  // Status and dates only. Nothing that identifies the customer leaves the sheet.
  return {
    found: true,
    code,
    status,                                                          // new | scheduled | on_the_way | picked_up | recycled | cancelled
    pickupDate: pickup ? fmt_(pickup, 'yyyy-MM-dd') : null,
    pickupLabel: pickup ? fmt_(pickup, 'EEEE, MMMM d') : null,
    pickupTime: pickup && c.pickupTime ? clip_(get('pickupTime'), 40) || null : null,
    bookedLabel: booked ? fmt_(booked, 'MMMM d') : null,
    // e.g. "Oct 14: Cancel requested" — the request type and date, never what they wrote.
    lastRequest: requests.length ? requests[requests.length - 1].split(' — ')[0] : null,
  };
}

function normStatus_(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t.startsWith('cancel')) return 'cancelled';
  if (t.startsWith('recycl') || t.startsWith('refurb') || t.startsWith('done') || t.startsWith('complete')) return 'recycled';
  if (t.startsWith('picked')) return 'picked_up';
  if (t.startsWith('on the way') || t.startsWith('on_the_way') || t.startsWith('en route')) return 'on_the_way';
  if (t.startsWith('sched') || t.startsWith('confirm')) return 'scheduled';
  return 'new';
}


// ---------- change requests ----------

function noteRequest_(code, d) {
  const sh = sheet_();
  const r = findRow_(sh, code);
  if (!r) return;
  const c = columns_(sh);
  const label = { cancel: 'Cancel requested', reschedule: 'Reschedule requested', change: 'Change requested' }[d.action] || 'Request';
  const detail = [clip_(d.choices, 200), clip_(d.details, 400)].filter(Boolean).join(' — ');
  const line = `${fmt_(new Date(), 'MMM d')}: ${label}${detail ? ' — ' + detail : ''}`;
  const cell = sh.getRange(r, c.requests);
  const prev = String(cell.getValue() || '');
  cell.setValue((prev ? prev + '\n' : '') + line);

  // Act on it while the pickup is still ahead, so nobody has to clear a flag by hand.
  const v = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
  const get = k => v[c[k] - 1];
  if (['new', 'scheduled', 'on_the_way'].indexOf(normStatus_(get('status'))) === -1) return;
  if (d.action === 'cancel') {
    sh.getRange(r, c.status).setValue('Cancelled');
    const email = String(get('email') || '');
    if (CONFIG.notifyCustomers && EMAIL_RE.test(email)) {
      try { sendStatusEmail_({ code, name: String(get('name') || ''), email }, 'cancelled'); }
      catch (err) { recordError_('cancel-email', err); }
    }
  } else if (d.action === 'reschedule') {
    sh.getRange(r, c.status).setValue('New');
    sh.getRange(r, c.pickupDate).clearContent();
    if (c.pickupTime) sh.getRange(r, c.pickupTime).clearContent();
  }
}


// ---------- crew app ----------

function crew_(d) {
  const auth = crewAuth_(d.passcode);
  if (auth !== true) return { ok: false, error: auth };
  try {
    if (d.op === 'list') return { ok: true, today: fmt_(new Date(), 'yyyy-MM-dd'), bookings: crewList_() };
    if (d.op === 'update') return crewUpdate_(String(d.code || '').toUpperCase(), d.set || {});
    if (d.op === 'create') return crewCreate_(String(d.code || '').toUpperCase(), d.set || {});
    return { ok: true };
  } catch (err) {
    recordError_('crew', err);
    return { ok: false, error: 'server' };
  }
}

/** true, or 'passcode' / 'locked' / 'not_set_up'. 20 wrong passcodes lock it for 10 minutes. */
function crewAuth_(given) {
  const real = PropertiesService.getScriptProperties().getProperty('CREW_PASSCODE');
  if (!real) return 'not_set_up';
  const cache = CacheService.getScriptCache();
  const key = 'crewfail:' + Math.floor(Date.now() / 600000);
  const fails = Number(cache.get(key) || 0);
  if (fails >= 20) return 'locked';
  if (String(given || '') === real) return true;
  cache.put(key, String(fails + 1), 900);
  return 'passcode';
}

/** Every booking in the sheet, newest first, for the crew app. */
function crewList_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const c = columns_(sh);
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().map(v => {
    const get = k => (c[k] ? v[c[k] - 1] : '');
    const pickup = get('pickupDate') instanceof Date ? get('pickupDate') : null;
    let status = normStatus_(get('status'));
    if (status === 'new' && pickup) status = 'scheduled';
    return {
      code: String(get('code')).toUpperCase(),
      status,
      pickupDate: pickup ? fmt_(pickup, 'yyyy-MM-dd') : null,
      bookedAt: get('bookedAt') instanceof Date ? fmt_(get('bookedAt'), 'MMM d, h:mm a') : '',
      bookedIso: get('bookedAt') instanceof Date ? get('bookedAt').toISOString() : '',
      name: String(get('name') || ''),
      email: String(get('email') || ''),
      phone: String(get('phone') || ''),
      address: String(get('address') || ''),
      load: String(get('load') || ''),
      notes: String(get('notes') || ''),
      requests: String(get('requests') || ''),
      crewNotes: String(get('crewNotes') || ''),
      itemCount: Number(get('itemCount')) > 0 ? Number(get('itemCount')) : null,
      photoUrl: String(get('photo') || ''),
      source: String(get('source') || ''),
      pickupTime: String(get('pickupTime') || ''),
    };
  }).filter(b => CODE_RE.test(b.code)).reverse();
}

/**
 * A booking that came in somewhere else, added from the crew app. Every field is optional.
 * The app makes the code (so it works offline); a retry with the same code is ignored.
 */
function crewCreate_(code, f) {
  if (!CODE_RE.test(code)) return { ok: false, error: 'code' };
  const day = String(f.pickupDate || '');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'date' };
  const sh = sheet_();
  if (findRow_(sh, code)) return { ok: true, notified: 'none' };
  const b = {
    code,
    name: clip_(f.name, 80), email: clip_(f.email, 120), phone: clip_(f.phone, 30),
    address: clip_(f.address, 200), load: clip_(f.load, 200), notes: clip_(f.notes, 500),
    manageUrl: CONFIG.siteUrl + 'manage.html?code=' + code,
  };
  const [y, m, dd] = day ? day.split('-').map(Number) : [];
  const c = columns_(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  const put = (k, v) => { if (c[k]) row[c[k] - 1] = v; };
  put('bookedAt', new Date()); put('code', code); put('status', day ? 'Scheduled' : 'New');
  put('pickupDate', day ? new Date(y, m - 1, dd, 12) : '');
  const time = day ? clip_(f.pickupTime, 40) : '';
  put('pickupTime', time);
  put('name', b.name); put('email', b.email); put('phone', b.phone); put('address', b.address);
  put('load', b.load); put('notes', b.notes); put('source', clip_(f.source, 40) || 'Crew app');
  sh.appendRow(row);

  // Email the customer only when the crew asks to: the confirmation, or the pickup date if there is one.
  let notified = 'none';
  if (f.sendEmail === '1' && CONFIG.notifyCustomers && EMAIL_RE.test(b.email)) {
    try {
      if (day) sendStatusEmail_(Object.assign({ pickupLabel: fmt_(new Date(y, m - 1, dd, 12), 'EEEE, MMMM d'), pickupTime: time }, b), 'scheduled');
      else sendConfirmation_(b);
      notified = 'email';
    } catch (err) { recordError_('create-email', err); }
  }
  return { ok: true, notified };
}

function crewUpdate_(code, set) {
  if (!CODE_RE.test(code)) return { ok: false, error: 'code' };
  const sh = sheet_();
  const r = findRow_(sh, code);
  if (!r) return { ok: false, error: 'missing' };
  const c = columns_(sh);
  const v = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
  const get = k => v[c[k] - 1];
  const beforeStatus = normStatus_(get('status'));
  const beforeDate = get('pickupDate') instanceof Date ? fmt_(get('pickupDate'), 'yyyy-MM-dd') : '';
  const beforeTime = c.pickupTime ? String(get('pickupTime') || '') : '';
  let afterTime = beforeTime;
  let notify = null;

  if (set.pickupDate !== undefined) {
    const day = String(set.pickupDate || '');
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'date' };
    const cell = sh.getRange(r, c.pickupDate);
    if (day) {
      const [y, m, dd] = day.split('-').map(Number);
      cell.setValue(new Date(y, m - 1, dd, 12));                     // noon, so time zones never shift the day
      if (day !== beforeDate) notify = 'scheduled';
    } else {
      cell.clearContent();
      if (c.pickupTime) sh.getRange(r, c.pickupTime).clearContent();   // no day, no time
      afterTime = '';
    }
  }
  if (set.pickupTime !== undefined && c.pickupTime) {
    afterTime = clip_(set.pickupTime, 40);
    sh.getRange(r, c.pickupTime).setValue(afterTime);
    // A new time on the same day is still news for the customer.
    if (afterTime !== beforeTime && (set.pickupDate || beforeDate) && !notify) notify = 'scheduled';
  }
  if (set.status) {
    const label = STATUS_KEYS[set.status];
    if (!label) return { ok: false, error: 'status' };
    sh.getRange(r, c.status).setValue(label);
    // Only a real pickup emails the customer — undoing a "Recycled" mark never re-sends the thank-you.
    if (set.status === 'picked_up' && ['new', 'scheduled', 'on_the_way'].indexOf(beforeStatus) !== -1) notify = 'picked_up';
    if (set.status === 'on_the_way' && beforeStatus !== 'on_the_way') notify = 'on_the_way';
    if (set.status !== 'scheduled' && notify === 'scheduled') notify = null;
  }
  if (set.itemCount !== undefined) {
    const n = parseInt(set.itemCount, 10);
    const cell = sh.getRange(r, c.itemCount);
    if (n > 0 && n < 1000) cell.setValue(n); else cell.clearContent();
  }
  if (set.photo) {
    try {
      const bytes = Utilities.base64Decode(String(set.photo).slice(0, 8000000));
      const file = photoFolder_().createFile(
        Utilities.newBlob(bytes, 'image/jpeg', `${code} ${fmt_(new Date(), 'yyyy-MM-dd HHmm')}.jpg`));
      sh.getRange(r, c.photo).setValue(file.getUrl());
    } catch (err) { recordError_('photo', err); }
  }
  if (set.crewNote) {
    const cell = sh.getRange(r, c.crewNotes);
    const prev = String(cell.getValue() || '');
    cell.setValue((prev ? prev + '\n' : '') + `${fmt_(new Date(), 'MMM d')}: ${clip_(set.crewNote, 300)}`);
  }

  // How the customer was told: 'sms', 'email' or 'none'. "On the way" prefers a text.
  let notified = 'none';
  if (notify && CONFIG.notifyCustomers) {
    const name = String(get('name') || '');
    if (notify === 'on_the_way' && twilioReady_() && toE164_(get('phone'))) {
      try {
        sendSms_(toE164_(get('phone')), `Hi ${name.split(' ')[0] || 'there'}, it's Empty the Drawer. We're a few stops away to pick up your electronics (${code}). Please make sure they're by the door. Thanks!`);
        notified = 'sms';
      } catch (err) { recordError_('sms', err); }
    }
    if (notified === 'none' && EMAIL_RE.test(String(get('email') || ''))) {
      try {
        const day = (set.pickupDate || beforeDate) ? (set.pickupDate || beforeDate).split('-').map(Number) : null;
        sendStatusEmail_({
          code, name, email: String(get('email')),
          pickupLabel: day ? fmt_(new Date(day[0], day[1] - 1, day[2], 12), 'EEEE, MMMM d') : '',
          pickupTime: afterTime,
          itemCount: parseInt(set.itemCount, 10) || 0,
        }, notify);
        notified = 'email';
      } catch (err) { recordError_('status-email', err); }
    }
  }
  return { ok: true, notified };
}


// ---------- text messages (Twilio) ----------

function twilioReady_() {
  const p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('TWILIO_ACCOUNT_SID') && p.getProperty('TWILIO_AUTH_TOKEN') && p.getProperty('TWILIO_FROM'));
}

/** Canadian/US numbers to +1XXXXXXXXXX; anything else is skipped. */
function toE164_(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '';
}

function sendSms_(to, body) {
  const p = PropertiesService.getScriptProperties();
  const sid = p.getProperty('TWILIO_ACCOUNT_SID');
  const res = UrlFetchApp.fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'post',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + p.getProperty('TWILIO_AUTH_TOKEN')) },
    payload: { To: to, From: p.getProperty('TWILIO_FROM'), Body: body },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Twilio ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
}


// ---------- the sheet ----------

/** The attached spreadsheet's Bookings tab, or a spreadsheet created in Drive on first use. */
/** Private Drive folder for pickup photos (only the owner of this script can open them). */
function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* deleted — make a new one */ } }
  const folder = DriveApp.createFolder('Empty the Drawer pickup photos');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function sheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SHEET_ID');
    ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create(CONFIG.sheetName);
    if (!id) props.setProperty('SHEET_ID', ss.getId());
  }
  const sh = ss.getSheetByName(CONFIG.sheetTab) || ss.insertSheet(CONFIG.sheetTab);
  ensureColumns_(sh);
  return sh;
}

/** Adds any missing header (keeps existing columns and data where they are). */
function ensureColumns_(sh) {
  const width = Math.max(sh.getLastColumn(), 1);
  const have = sh.getLastRow() ? sh.getRange(1, 1, 1, width).getValues()[0].map(String) : [];
  const missing = HEADERS.filter(k => have.indexOf(COL[k]) === -1);
  if (!missing.length) return;
  const start = have.filter(Boolean).length ? width + 1 : 1;
  sh.getRange(1, start, 1, missing.length).setValues([missing.map(k => COL[k])]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  formatColumns_(sh);
}

function formatColumns_(sh) {
  const c = columns_(sh);
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, c.status, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build());
  sh.getRange(2, c.pickupDate, rows, 1).setNumberFormat('ddd, mmm d, yyyy').setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
      .setHelpText('Pick the pickup date (double-click for a calendar).').build());
  sh.getRange(2, c.bookedAt, rows, 1).setNumberFormat('mmm d, yyyy h:mm am/pm');
  sh.getRange(2, c.requests, rows, 1).setWrap(true);
}

function columns_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const c = {};
  HEADERS.forEach(k => { c[k] = head.indexOf(COL[k]) + 1; });
  return c;
}

function findRow_(sh, code) {
  if (sh.getLastRow() < 2) return 0;
  const c = columns_(sh);
  const hits = sh.getRange(2, c.code, sh.getLastRow() - 1, 1).createTextFinder(code).matchEntireCell(true).findAll();
  return hits.length ? hits[hits.length - 1].getRow() : 0;
}


// ---------- email ----------

function sendConfirmation_(b) {
  const first = b.name.split(' ')[0] || 'there';
  const subject = `You're booked — pickup ${b.code}`;
  const manageLine = b.manageUrl ? `\nCheck your pickup status, or cancel or change it: ${b.manageUrl}\n` : '';
  const text =
`Hi ${first},

Thanks for booking a free pickup with Empty the Drawer.

Confirmation number: ${b.code}
Pickup address: ${b.address}
What's in the load: ${b.load}

What happens next
- Within one business day: we'll confirm your pickup day.
- Pickup day: leave everything by your door. You don't need to be home.
- On the way: you'll get a heads-up when the truck is a few stops away.
${manageLine}
Every drive is wiped or shredded by the Electronic Recycling Association, so you don't need to erase anything first. Just take out SIM and SD cards.

Questions? Reply to this email or call ${CONFIG.phone}.

Empty the Drawer`;

  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const row = (k, v) => `<tr><td style="padding:10px 0;color:#5b6b69;font-size:14px;width:150px;vertical-align:top">${k}</td><td style="padding:10px 0;font-size:15px;color:#0A2E2C">${esc(v)}</td></tr>`;
  const htmlBody = `
<div style="background:#F4EFE4;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ddd0">
    <div style="background:#0A2E2C;padding:22px 26px">
      <span style="color:#F4EFE4;font-weight:700;font-size:17px;letter-spacing:-.01em">EMPTY THE </span><span style="background:#D8F14A;color:#0A2E2C;font-weight:700;font-size:17px;padding:3px 8px;border-radius:6px">DRAWER</span>
    </div>
    <div style="padding:28px 26px 8px">
      <h1 style="margin:0;font-size:24px;line-height:1.2;color:#0A2E2C">You're booked, ${esc(first)}</h1>
      <p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#3d4f4d">Thanks for booking a free pickup. We'll confirm your pickup day within one business day.</p>
      <div style="margin:22px 0 6px;padding:16px 18px;background:#F4EFE4;border-radius:10px">
        <div style="font-size:13px;color:#5b6b69">Confirmation number</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:.1em;color:#0A2E2C;margin-top:2px">${b.code}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:8px">${row('Pickup address', b.address)}${row("What's in the load", b.load)}</table>
      <h2 style="margin:22px 0 6px;font-size:16px;color:#0A2E2C">What happens next</h2>
      <table style="width:100%;border-collapse:collapse">
        ${row('Within a day', "We'll confirm your pickup day.")}
        ${row('Pickup day', "Leave everything by your door. You don't need to be home.")}
        ${row('On the way', 'A heads-up when the truck is a few stops away.')}
      </table>
      ${b.manageUrl ? `<p style="margin:22px 0 0"><a href="${esc(b.manageUrl)}" style="display:inline-block;background:#0A2E2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Check status or manage booking</a></p>` : ''}
      <p style="margin:22px 0 0;font-size:14px;line-height:1.55;color:#5b6b69">Every drive is wiped or shredded by the Electronic Recycling Association, so you don't need to erase anything first. Just take out SIM and SD cards.</p>
    </div>
    <div style="padding:18px 26px 24px;font-size:13px;line-height:1.55;color:#5b6b69;border-top:1px solid #eee8dc;margin-top:22px">
      Questions? Reply to this email or call ${CONFIG.phone}.
    </div>
  </div>
</div>`;

  sendMail_(b.email, subject, text, htmlBody);
}

/** Short update emails sent when the crew schedules a pickup or marks it picked up. */
function sendStatusEmail_(b, kind) {
  const first = b.name.split(' ')[0] || 'there';
  const manageUrl = CONFIG.siteUrl + 'manage.html?code=' + b.code;
  const copy = kind === 'cancelled' ? {
    subject: `Your pickup is cancelled (${b.code})`,
    title: 'Pickup cancelled',
    lines: [
      `We've cancelled your pickup (${b.code}), so the truck won't come by.`,
      `Changed your mind? You can book again any time at <a href="${CONFIG.siteUrl}book.html" style="color:#0A2E2C">emptythedrawer.org</a>.`,
    ],
  } : kind === 'on_the_way' ? {
    subject: `We're on our way (${b.code})`,
    title: "We're on our way",
    lines: [
      `The truck is a few stops away to pick up your electronics (${b.code}).`,
      "Please make sure everything is by your door, in your lobby or by the garage. You don't need to be home.",
    ],
  } : kind === 'scheduled' ? {
    subject: `Your pickup is on ${b.pickupLabel}${b.pickupTime ? ', ' + b.pickupTime : ''}`,
    title: `See you ${b.pickupLabel}`,
    lines: [
      `Your free pickup (${b.code}) is scheduled for <strong>${b.pickupLabel}${b.pickupTime ? ', ' + esc_(b.pickupTime) : ''}</strong>.`,
      b.pickupTime
        ? "Before then, leave everything by your door, in your lobby or by the garage. You don't need to be home."
        : "That morning, leave everything by your door, in your lobby or by the garage. You don't need to be home.",
      "We'll text you when the truck is a few stops away.",
    ],
  } : {
    subject: `Picked up — thank you! (${b.code})`,
    title: `Thank you, ${first}`,
    lines: [
      b.itemCount ? `We've picked up your ${b.itemCount} item${b.itemCount === 1 ? '' : 's'} (${b.code}).` : `We've picked up your devices (${b.code}).`,
      "They're going to the Electronic Recycling Association, where every drive is wiped or shredded and what can be fixed is refurbished for charities, schools and care homes.",
    ],
  };
  const text = `Hi ${first},\n\n` + copy.lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n\n') +
    `\n\nCheck your pickup status: ${manageUrl}\n\nQuestions? Reply to this email or call ${CONFIG.phone}.\n\nEmpty the Drawer`;
  const htmlBody = `
<div style="background:#F4EFE4;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ddd0">
    <div style="background:#0A2E2C;padding:22px 26px">
      <span style="color:#F4EFE4;font-weight:700;font-size:17px;letter-spacing:-.01em">EMPTY THE </span><span style="background:#D8F14A;color:#0A2E2C;font-weight:700;font-size:17px;padding:3px 8px;border-radius:6px">DRAWER</span>
    </div>
    <div style="padding:28px 26px 26px">
      <h1 style="margin:0;font-size:24px;line-height:1.2;color:#0A2E2C">${copy.title}</h1>
      ${copy.lines.map(l => `<p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#3d4f4d">${l}</p>`).join('')}
      <p style="margin:22px 0 0"><a href="${manageUrl}" style="display:inline-block;background:#0A2E2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Check pickup status</a></p>
    </div>
    <div style="padding:18px 26px 24px;font-size:13px;line-height:1.55;color:#5b6b69;border-top:1px solid #eee8dc">
      Questions? Reply to this email or call ${CONFIG.phone}.
    </div>
  </div>
</div>`;
  sendMail_(b.email, copy.subject, text, htmlBody);
}

/** Sends as donations@ when that's a Gmail "Send mail as" address, otherwise from the Gmail account. */
function sendMail_(to, subject, text, htmlBody) {
  const opts = { name: CONFIG.fromName, htmlBody, replyTo: CONFIG.fromAddress };
  if (GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1) {
    GmailApp.sendEmail(to, subject, text, { ...opts, from: CONFIG.fromAddress });
  } else {
    MailApp.sendEmail(to, subject, text, opts);
  }
}


// ---------- status, setup, helpers ----------

/** Status check for whoever maintains the site. Contains no booking data. */
function status_() {
  const props = PropertiesService.getScriptProperties();
  let sendAsReady = null;
  try { sendAsReady = GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1; } catch (err) { sendAsReady = 'error: ' + err.message; }
  let bookings = null;
  try { bookings = Math.max(sheet_().getLastRow() - 1, 0); } catch (err) { bookings = 'error: ' + err.message; }
  return {
    ok: true,
    version: VERSION,
    attachedToSheet: !!SpreadsheetApp.getActiveSpreadsheet(),
    bookingsInSheet: bookings,
    sendAsDonationsReady: sendAsReady,
    crewPasscodeSet: !!props.getProperty('CREW_PASSCODE'),
    photoFolderReady: !!props.getProperty('PHOTO_FOLDER_ID'),
    itemsCollected: itemsCollected_(),
    twilioReady: twilioReady_(),
    emailsLeftToday: MailApp.getRemainingDailyQuota(),
    lastError: JSON.parse(props.getProperty('LAST_ERROR') || 'null'),
  };
}

/** Run once from the editor: grants permissions, sets up the sheet columns, shows where bookings go. */
function setup() {
  const sh = sheet_();
  formatColumns_(sh);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CREW_PASSCODE')) {
    props.setProperty('CREW_PASSCODE', String(Math.floor(100000 + Math.random() * 900000)));
  }
  console.log('Crew app passcode: ' + props.getProperty('CREW_PASSCODE') + '  (change it in Project Settings → Script properties)');
  console.log('Twilio texts: ' + (twilioReady_() ? 'ready' : 'not set up — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM in Script properties'));
  console.log('Bookings sheet: ' + sh.getParent().getUrl());
  console.log('Pickup photos: ' + photoFolder_().getUrl());
  console.log('Send as ' + CONFIG.fromAddress + ': ' + (GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1 ? 'ready' : 'NOT set up in Gmail yet'));
  console.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
  PropertiesService.getScriptProperties().deleteProperty('LAST_ERROR');
}

/** Total items collected across all pickups (a number, no booking data). */
function itemsCollected_() {
  try {
    const sh = sheet_();
    const c = columns_(sh);
    if (sh.getLastRow() < 2 || !c.itemCount) return 0;
    return sh.getRange(2, c.itemCount, sh.getLastRow() - 1, 1).getValues()
      .reduce((sum, [v]) => sum + (Number(v) > 0 ? Number(v) : 0), 0);
  } catch (err) { return null; }
}

function recordError_(where, err) {
  console.error(where, err);
  PropertiesService.getScriptProperties().setProperty('LAST_ERROR',
    JSON.stringify({ at: new Date().toISOString(), where, message: String(err && err.message || err) }));
}

function esc_(v) { return String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function fmt_(d, pattern) { return Utilities.formatDate(d, CONFIG.timeZone, pattern); }
function clip_(v, n) { return String(v == null ? '' : v).slice(0, n).trim(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run from the editor to email yourself a sample confirmation. */
function testConfirmation() {
  sendConfirmation_({
    code: 'AB12C', name: 'Test Person', email: Session.getActiveUser().getEmail(), phone: '',
    address: '13060 80 Ave, Unit 108, Surrey, V3W 3B2', load: '3 items — Laptops, Phones', notes: '',
    manageUrl: 'https://emptythedrawer.org/manage.html?code=AB12C',
  });
}
