// Shared by the booking form and the manage-booking page.
window.ETD = (() => {
  // Where bookings and change requests are emailed, via FormSubmit (https://formsubmit.co).
  // The first message to a new address sends a one-time "Activate form" email there.
  const INBOX = 'emptythedrawer@gmail.com';

  // Google Apps Script web app that emails customers their confirmation and logs
  // each booking to a Google Sheet (see tools/booking-confirmation.gs). Empty = off.
  const CONFIRM_URL = '';

  // Fire-and-forget: a failed confirmation email must never block a booking.
  function confirm(booking) {
    if (!CONFIRM_URL) return false;
    try {
      fetch(CONFIRM_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(booking) }).catch(() => {});
    } catch (e) { /* ignore */ }
    return true;
  }

  async function send(fields) {
    const res = await fetch('https://formsubmit.co/ajax/' + INBOX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _template: 'table', _captcha: 'false', ...fields })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || 'Send failed');
  }

  // Confirmation codes look like AB12C (no I or O, to avoid mix-ups with 1 and 0).
  const CODE_RE = /^[A-HJ-NP-Z]{2}\d{2}[A-HJ-NP-Z]$/;
  const normCode = v => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const newCode = () => {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const r = () => L[Math.floor(Math.random() * L.length)], d = () => Math.floor(Math.random() * 10);
    return r() + r() + d() + d() + r();
  };

  // Bookings made in this browser are remembered here so the manage page can
  // show their details. Only this device can see them; storage may be blocked.
  const KEY = 'etd-bookings';
  const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const writeAll = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ } };
  const saveBooking = (code, data) => { const all = readAll(); all[code] = { ...data, bookedAt: new Date().toISOString() }; writeAll(all); };
  const findBooking = code => readAll()[code] || null;
  const updateBooking = (code, patch) => { const all = readAll(); if (all[code]) { all[code] = { ...all[code], ...patch }; writeAll(all); } };

  return { send, confirm, CODE_RE, normCode, newCode, saveBooking, findBooking, updateBooking };
})();
