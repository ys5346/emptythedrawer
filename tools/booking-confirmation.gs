/**
 * Empty the Drawer — bookings backend (Google Apps Script web app).
 *
 * The website talks to this script for three things:
 *   1. New booking  (POST)  → adds a row to the "Bookings" tab and emails the
 *                              customer their confirmation number.
 *   2. Look up      (GET ?action=lookup&code=AB12C) → returns only that booking's
 *                              status and dates for the "Manage your booking" page —
 *                              never the customer's name, address, contact details or items.
 *   3. Request      (POST type=request) → notes a cancel / reschedule / change
 *                              request on the booking's row.
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
};

const VERSION = '2026-10-14d';

const CODE_RE = /^[A-HJ-NP-Z]{2}\d{2}[A-HJ-NP-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// Columns are found by their header text, so they can be reordered in the sheet.
const COL = {
  bookedAt: 'Booked at', code: 'Code', status: 'Status', pickupDate: 'Pickup date',
  name: 'Name', email: 'Email', phone: 'Mobile', address: 'Address', load: 'Load',
  notes: 'Driver notes', requests: 'Customer requests',
};
const HEADERS = ['bookedAt', 'code', 'status', 'pickupDate', 'name', 'email', 'phone', 'address', 'load', 'notes', 'requests'];
const STATUSES = ['New', 'Scheduled', 'Picked up', 'Recycled', 'Cancelled'];


// ---------- web app entry points ----------

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (d._honey) return json_({ ok: true });                       // bot filled the hidden field
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
    status,                                                          // new | scheduled | picked_up | recycled | cancelled
    pickupDate: pickup ? fmt_(pickup, 'yyyy-MM-dd') : null,
    pickupLabel: pickup ? fmt_(pickup, 'EEEE, MMMM d') : null,
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
}


// ---------- the sheet ----------

/** The attached spreadsheet's Bookings tab, or a spreadsheet created in Drive on first use. */
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

  const opts = { name: CONFIG.fromName, htmlBody, replyTo: CONFIG.fromAddress };
  if (GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1) {
    GmailApp.sendEmail(b.email, subject, text, { ...opts, from: CONFIG.fromAddress });
  } else {
    MailApp.sendEmail(b.email, subject, text, opts);
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
    emailsLeftToday: MailApp.getRemainingDailyQuota(),
    lastError: JSON.parse(props.getProperty('LAST_ERROR') || 'null'),
  };
}

/** Run once from the editor: grants permissions, sets up the sheet columns, shows where bookings go. */
function setup() {
  const sh = sheet_();
  formatColumns_(sh);
  console.log('Bookings sheet: ' + sh.getParent().getUrl());
  console.log('Send as ' + CONFIG.fromAddress + ': ' + (GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1 ? 'ready' : 'NOT set up in Gmail yet'));
  console.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
  PropertiesService.getScriptProperties().deleteProperty('LAST_ERROR');
}

function recordError_(where, err) {
  console.error(where, err);
  PropertiesService.getScriptProperties().setProperty('LAST_ERROR',
    JSON.stringify({ at: new Date().toISOString(), where, message: String(err && err.message || err) }));
}

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
