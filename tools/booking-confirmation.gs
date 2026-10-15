/**
 * Empty the Drawer — booking confirmation emails + bookings sheet.
 *
 * The website posts each new booking here. This script:
 *   1. adds a row to the "Bookings" tab of the bookings Google Sheet
 *      (the sheet it's attached to, or one it creates in Drive the first time)
 *   2. emails the customer their confirmation number and what happens next
 *
 * Opening the web app URL in a browser shows a status check (no personal data).
 *
 * Setup (once):
 *   1. Create a Google Sheet (e.g. "Empty the Drawer bookings").
 *   2. Extensions → Apps Script. Delete what's there, paste this whole file, save.
 *   3. Deploy → New deployment → type "Web app".
 *        Execute as: Me      Who has access: Anyone
 *      Click Deploy, allow the permissions, copy the Web app URL.
 *   4. Put that URL in CONFIRM_URL at the top of site/common.js.
 *
 * Deploy it while signed in as emptythedrawer@gmail.com. Confirmations are sent
 * as donations@emptythedrawer.org once that address is added in this Gmail under
 * Settings → Accounts → "Send mail as"; until then they come from the Gmail
 * address with replies going to donations@. Gmail allows about 100 a day.
 */

const CONFIG = {
  fromName: 'Empty the Drawer',
  fromAddress: 'donations@emptythedrawer.org',
  phone: '(604) 953-9883',
  sheetTab: 'Bookings',
  sheetName: 'Empty the Drawer bookings',
};

const VERSION = '2026-10-14b';

const CODE_RE = /^[A-HJ-NP-Z]{2}\d{2}[A-HJ-NP-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

function doPost(e) {
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (d._honey) return ok_();                                    // bot filled the hidden field
    const code = String(d.code || '').toUpperCase();
    if (!CODE_RE.test(code)) return ok_();
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
  } catch (err) {
    recordError_('request', err);
  }
  return ok_();
}

/** Status check for whoever maintains the site. Contains no booking data. */
function doGet() {
  const props = PropertiesService.getScriptProperties();
  let sendAsReady = null;
  try { sendAsReady = GmailApp.getAliases().indexOf(CONFIG.fromAddress) !== -1; } catch (err) { sendAsReady = 'error: ' + err.message; }
  const status = {
    ok: true,
    version: VERSION,
    attachedToSheet: !!SpreadsheetApp.getActiveSpreadsheet(),
    createdSheet: !!props.getProperty('SHEET_ID'),
    sendAsDonationsReady: sendAsReady,
    emailsLeftToday: MailApp.getRemainingDailyQuota(),
    lastError: JSON.parse(props.getProperty('LAST_ERROR') || 'null'),
  };
  return ContentService.createTextOutput(JSON.stringify(status)).setMimeType(ContentService.MimeType.JSON);
}

function recordError_(where, err) {
  console.error(where, err);
  PropertiesService.getScriptProperties().setProperty('LAST_ERROR',
    JSON.stringify({ at: new Date().toISOString(), where, message: String(err && err.message || err) }));
}

/** The attached spreadsheet, or one created in Drive on first use (remembered after that). */
function bookingsSheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SHEET_ID');
    ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create(CONFIG.sheetName);
    if (!id) props.setProperty('SHEET_ID', ss.getId());
  }
  return ss;
}

/** Run once from the editor: grants every permission the script needs and shows where bookings go. */
function setup() {
  const ss = bookingsSheet_();
  const aliases = GmailApp.getAliases();
  console.log('Bookings sheet: ' + ss.getUrl());
  console.log('Send as ' + CONFIG.fromAddress + ': ' + (aliases.indexOf(CONFIG.fromAddress) !== -1 ? 'ready' : 'NOT set up in Gmail yet'));
  console.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
  PropertiesService.getScriptProperties().deleteProperty('LAST_ERROR');
}

function logRow_(b) {
  const ss = bookingsSheet_();
  const sh = ss.getSheetByName(CONFIG.sheetTab) || ss.insertSheet(CONFIG.sheetTab);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Booked at', 'Code', 'Name', 'Email', 'Mobile', 'Address', 'Load', 'Driver notes', 'Status']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), b.code, b.name, b.email, b.phone, b.address, b.load, b.notes, 'New']);
}

function sendConfirmation_(b) {
  const first = b.name.split(' ')[0] || 'there';
  const subject = `You're booked — pickup ${b.code}`;
  const manageLine = b.manageUrl ? `\nNeed to cancel or change something? ${b.manageUrl}\n` : '';
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

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
      ${b.manageUrl ? `<p style="margin:22px 0 0"><a href="${esc(b.manageUrl)}" style="display:inline-block;background:#0A2E2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">Manage your booking</a></p>` : ''}
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

function clip_(v, n) { return String(v == null ? '' : v).slice(0, n).trim(); }
function ok_() { return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON); }

/** Run this once from the editor to send yourself a sample email and check it looks right. */
function testConfirmation() {
  sendConfirmation_({
    code: 'AB12C', name: 'Test Person', email: Session.getActiveUser().getEmail(), phone: '',
    address: '13060 80 Ave, Unit 108, Surrey, V3W 3B2', load: '3 items — Laptops, Phones', notes: '',
    manageUrl: 'https://example.com/manage.html?code=AB12C',
  });
}
