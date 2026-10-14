# Empty the Drawer

Website for Empty the Drawer — free drop-off and doorstep pickup of old phones, laptops and electronics in Surrey, BC, in partnership with the Electronic Recycling Association (ERA).

Live at https://emptythedrawer.org

## Layout

- `site/` — the website (plain HTML, CSS and JavaScript; no build step). Pushing to `main` publishes it via GitHub Pages.
- `tools/make_logo.py` — regenerates the logo, profile pictures and WhatsApp cover in `site/logo/`.
- `tools/booking-confirmation.gs` — Google Apps Script that emails customers their booking confirmation and logs bookings to a Google Sheet.

## Settings to check before launch

- `site/common.js` → `INBOX`: the inbox that receives bookings (emptythedrawer@gmail.com).
- `site/common.js` → `CONFIRM_URL`: web-app URL of the deployed confirmation script (empty = off).

## Preview locally

```bash
python3 -m http.server 8000 --directory site
```
