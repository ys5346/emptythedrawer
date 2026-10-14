"""Build Empty the Drawer logo SVGs with text converted to outlines.

Usage: python3 -I make_logo.py <font.ttf> <out_dir>
"""
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

INK, LIME, PAPER = '#0A2E2C', '#D8F14A', '#F4EFE4'

font_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
font = instantiateVariableFont(TTFont(font_path), {'wght': 700})
gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
UPM = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight


def word(text, size, track=-0.015):
    """Return (path_d, width, cap_height) for text at size, baseline at y=0, x starting 0."""
    scale = size / UPM
    pen = SVGPathPen(gs)
    x = 0.0
    names = [cmap[ord(c)] for c in text]
    for i, n in enumerate(names):
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[n].draw(tp)
        x += hmtx[n][0] * scale
        if i < len(names) - 1:
            x += track * size
    # tight ink bounds for optical centering
    bp = BoundsPen(gs)
    xx = 0.0
    xmin = xmax = None
    for i, n in enumerate(names):
        b = BoundsPen(gs); gs[n].draw(b)
        if b.bounds:
            l, _, r, _ = b.bounds
            l, r = xx + l * scale, xx + r * scale
            xmin = l if xmin is None else min(xmin, l)
            xmax = r if xmax is None else max(xmax, r)
        xx += hmtx[n][0] * scale + (track * size if i < len(names) - 1 else 0)
    return pen.getCommands(), xmin, xmax, CAP * scale


def placed(text, size, cx=None, left=None, baseline=0, fill=INK, track=-0.015):
    d, x0, x1, cap = word(text, size, track)
    w = x1 - x0
    tx = (cx - w / 2 - x0) if cx is not None else (left - x0)
    return f'<path fill="{fill}" transform="translate({tx:.2f} {baseline:.2f})" d="{d}"/>', w, cap


def stacked(size_canvas, bg, fg, box, box_text, circle_safe=True):
    """Stacked EMPTY / THE / [DRAWER] mark centred in a square canvas."""
    C = size_canvas
    fs = C * 0.205            # start large, shrink until the box corners clear the circle crop
    while True:
        _, dx0, dx1, cap = word('DRAWER', fs)
        bw = (dx1 - dx0) + fs * 0.40
        bh = cap + fs * 0.60
        total = cap + fs * 0.80 + fs * 0.14 + bh
        box_bottom = (C + total) / 2
        corner = ((bw / 2) ** 2 + (box_bottom - C / 2) ** 2) ** 0.5
        if corner <= C * 0.43:
            break
        fs *= 0.98
    lead = fs * 0.80          # baseline-to-baseline for the plain lines
    _, ex0, ex1, cap = word('EMPTY', fs)
    _, dx0, dx1, _ = word('DRAWER', fs)
    pad_x, pad_y = fs * 0.20, fs * 0.20
    box_w = (dx1 - dx0) + pad_x * 2
    box_h = cap + pad_y * 2 + fs * 0.20          # extra room for the handle
    gap = fs * 0.14
    total_h = cap + lead + gap + box_h            # top of EMPTY to bottom of box (cap-based)
    top = (C - total_h) / 2 + C * 0.005
    cx = C / 2
    b1 = top + cap
    b2 = b1 + lead
    box_y = b2 + gap
    b3 = box_y + pad_y + cap
    parts = [f'<rect width="{C}" height="{C}" fill="{bg}"/>']
    p, _, _ = placed('EMPTY', fs, cx=cx, baseline=b1, fill=fg); parts.append(p)
    p, _, _ = placed('THE', fs, cx=cx, baseline=b2, fill=fg); parts.append(p)
    r = fs * 0.16
    parts.append(f'<rect x="{cx - box_w/2:.2f}" y="{box_y:.2f}" width="{box_w:.2f}" height="{box_h:.2f}" rx="{r:.2f}" fill="{box}"/>')
    p, _, _ = placed('DRAWER', fs, cx=cx, baseline=b3, fill=box_text); parts.append(p)
    hw, hh = fs * 0.62, fs * 0.085
    parts.append(f'<rect x="{cx - hw/2:.2f}" y="{box_y + box_h - pad_y*0.55 - hh:.2f}" width="{hw:.2f}" height="{hh:.2f}" rx="{hh/2:.2f}" fill="{box_text}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {C} {C}" width="{C}" height="{C}">' + ''.join(parts) + '</svg>'


def horizontal(fg, box, box_text, height=40):
    """One-line lockup: EMPTY THE [DRAWER] for headers."""
    fs = height * 0.62
    _, ex0, ex1, cap = word('EMPTY THE', fs, track=-0.01)
    _, dx0, dx1, _ = word('DRAWER', fs, track=-0.01)
    pad_x = fs * 0.24
    box_h = height
    gap = fs * 0.30
    base = (height + cap) / 2
    parts = []
    p, w1, _ = placed('EMPTY THE', fs, left=0, baseline=base, fill=fg, track=-0.01); parts.append(p)
    bx = w1 + gap
    bw = (dx1 - dx0) + pad_x * 2
    parts.append(f'<rect x="{bx:.2f}" y="0" width="{bw:.2f}" height="{box_h:.2f}" rx="{height*0.2:.2f}" fill="{box}"/>')
    p, _, _ = placed('DRAWER', fs, left=bx + pad_x, baseline=base, fill=box_text, track=-0.01); parts.append(p)
    W = bx + bw
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.2f} {height}" width="{W:.0f}" height="{height}" role="img" aria-label="Empty the Drawer">' + ''.join(parts) + '</svg>'


def favicon():
    """Drawer front with handle on ink, readable at 16px."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" rx="14" fill="{INK}"/>'
            f'<rect x="10" y="17" width="44" height="30" rx="7" fill="{LIME}"/>'
            f'<rect x="22" y="36" width="20" height="5" rx="2.5" fill="{INK}"/>'
            '</svg>')


def banner(W=1211, H=681):
    """WhatsApp Business cover.

    WhatsApp shows roughly the band y=76..605 of a 1211x681 image and puts the
    round profile photo over the lower middle (from about y=286 down), so the
    headline sits in the clear strip above it. Lime makes the dark avatar pop.
    """
    parts = [f'<rect width="{W}" height="{H}" fill="{LIME}"/>']
    text, size = 'Old phones and laptops get a second life.', 60
    while True:  # one line, at most ~82% of the width so phone crops keep a margin
        _, x0, x1, cap = word(text, size, -0.02)
        if x1 - x0 <= W * 0.82:
            break
        size -= 1
    mid = (76 + 286) / 2  # centre of the clear strip above the profile photo
    p, _, _ = placed(text, size, cx=W / 2, baseline=mid + cap / 2, fill=INK, track=-0.02); parts.append(p)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">' + ''.join(parts) + '</svg>'


files = {
    'whatsapp-cover.svg': banner(),
    'avatar-lime.svg': stacked(1080, LIME, INK, INK, LIME),
    'avatar-ink.svg': stacked(1080, INK, PAPER, LIME, INK),
    'logo-on-dark.svg': horizontal(PAPER, LIME, INK),
    'logo-on-light.svg': horizontal(INK, INK, LIME),
    'favicon.svg': favicon(),
}
for name, svg in files.items():
    with open(os.path.join(out, name), 'w') as f:
        f.write(svg)
    print(name, len(svg))
