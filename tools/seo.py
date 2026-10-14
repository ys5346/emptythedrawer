"""Write SEO tags (title, description, canonical, Open Graph, structured data)
into the <head> of each page in site/. Safe to rerun: it replaces its own block.

Usage: python3 tools/seo.py
"""
import re, json, html, os

SITE = os.path.join(os.path.dirname(__file__), '..', 'site')
BASE = 'https://emptythedrawer.org/'
OG = BASE + 'og-image.png'
AREAS = ['Surrey', 'Delta', 'White Rock', 'Langley', 'Burnaby', 'New Westminster', 'Coquitlam',
         'Port Coquitlam', 'Port Moody', 'Maple Ridge', 'Pitt Meadows', 'Vancouver', 'Richmond',
         'North Vancouver', 'West Vancouver', 'Abbotsford', 'Mission', 'Chilliwack', 'Squamish']
CITIES = [{"@type": "City", "name": f"{a}, BC"} for a in AREAS]

ORG = {
    "@type": ["RecyclingCenter", "LocalBusiness"],
    "@id": BASE + "#org",
    "name": "Empty the Drawer",
    "url": BASE,
    "logo": BASE + "logo/profile-lime-1080.png",
    "image": OG,
    "description": "Free drop-off and doorstep pickup for old laptops, phones, computers, monitors, TVs and other "
                   "electronics in Surrey and Metro Vancouver, BC. Every device goes to the Electronic Recycling "
                   "Association (ERA), which wipes or shreds every drive, refurbishes what it can for charities and "
                   "schools, and recycles the rest.",
    "telephone": "+1-604-953-9883",
    "email": "emptythedrawer@gmail.com",
    "priceRange": "Free",
    "address": {"@type": "PostalAddress", "streetAddress": "13060 80 Ave #108", "addressLocality": "Surrey",
                "addressRegion": "BC", "postalCode": "V3W 3B2", "addressCountry": "CA"},
    "geo": {"@type": "GeoCoordinates", "latitude": 49.1480043, "longitude": -122.8602604},
    "hasMap": "https://www.google.com/maps/search/?api=1&query=13060+80+Ave+%23108+Surrey+BC+V3W+3B2",
    "openingHoursSpecification": [
        {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
         "opens": "09:00", "closes": "16:00"},
        {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "10:00", "closes": "16:00"},
    ],
    "areaServed": CITIES,
    "knowsAbout": ["electronics recycling", "e-waste recycling", "computer recycling", "laptop donation",
                   "phone recycling", "data destruction", "hard drive wiping"],
    "makesOffer": [
        {"@type": "Offer", "price": "0", "priceCurrency": "CAD",
         "itemOffered": {"@type": "Service", "name": "Free electronics drop-off",
                         "description": "Locked drop box at 13060 80 Ave #108, Surrey, emptied every evening."}},
        {"@type": "Offer", "price": "0", "priceCurrency": "CAD", "url": BASE + "book.html",
         "itemOffered": {"@type": "Service", "name": "Free doorstep electronics pickup",
                         "description": "Free pickup of old electronics within about 90 km of Surrey, BC."}},
    ],
}

PAGES = {
    'index.html': dict(path='', title='Free Electronics Recycling in Surrey, BC | Empty the Drawer',
                       desc='Free drop-off and doorstep pickup for old laptops, phones, computers and TVs in Surrey '
                            'and Metro Vancouver. Every drive wiped, then refurbished for charities.'),
    'book.html': dict(path='book.html', title='Free Electronics Pickup in Metro Vancouver | Empty the Drawer',
                      desc='Book a free doorstep pickup for old laptops, phones, monitors and TVs anywhere within '
                           '90 km of Surrey, BC, from Vancouver to Chilliwack. Takes two minutes.'),
    'contact.html': dict(path='contact.html', title='Contact Empty the Drawer — Ask What We Accept',
                         desc='Not sure if we take it? Call (604) 953-9883, email or WhatsApp us about recycling or '
                              'donating old electronics in Surrey and Metro Vancouver.'),
    'manage.html': dict(path='manage.html', title='Manage Your Booking | Empty the Drawer',
                        desc='Cancel, reschedule or change your Empty the Drawer pickup with your confirmation number.',
                        noindex=True),
}


def faq_from(page_html):
    items = re.findall(r'<details name="faq"[^>]*><summary>(.*?)</summary><p>(.*?)</p></details>', page_html, re.S)
    clean = lambda t: html.unescape(re.sub(r'<[^>]+>', '', t)).strip()
    return {"@type": "FAQPage", "@id": BASE + "#faq", "mainEntity": [
        {"@type": "Question", "name": clean(q), "acceptedAnswer": {"@type": "Answer", "text": clean(a)}}
        for q, a in items]}


def structured(name, page):
    org_ref = {"@type": "RecyclingCenter", "@id": BASE + "#org", "name": "Empty the Drawer", "url": BASE}
    if name == 'index.html':
        return [{"@type": "WebSite", "@id": BASE + "#website", "url": BASE, "name": "Empty the Drawer",
                 "inLanguage": "en-CA", "publisher": {"@id": BASE + "#org"}}, ORG, faq_from(page)]
    if name == 'book.html':
        return [{"@type": "Service", "@id": BASE + "book.html#service", "name": "Free doorstep electronics pickup",
                 "serviceType": "Electronics recycling pickup", "provider": org_ref, "areaServed": CITIES,
                 "offers": {"@type": "Offer", "price": "0", "priceCurrency": "CAD"}, "url": BASE + "book.html"}]
    if name == 'contact.html':
        return [{"@type": "ContactPage", "url": BASE + "contact.html", "name": "Contact Empty the Drawer",
                 "about": {**org_ref, "telephone": "+1-604-953-9883", "email": "emptythedrawer@gmail.com"}}]
    return None


for name, m in PAGES.items():
    p = os.path.join(SITE, name)
    s = open(p).read()
    s = s.replace('<html lang="en">', '<html lang="en-CA">', 1)
    s = re.sub(r'<title>.*?</title>', '<title>' + html.escape(m['title'], quote=False) + '</title>', s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">',
               '<meta name="description" content="' + html.escape(m['desc']) + '">', s, count=1)
    url = BASE + m['path']
    head = [
        f'<link rel="canonical" href="{url}">',
        '<meta name="robots" content="noindex, follow">' if m.get('noindex')
        else '<meta name="robots" content="index, follow, max-image-preview:large">',
        '<meta name="theme-color" content="#0A2E2C">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Empty the Drawer">',
        '<meta property="og:locale" content="en_CA">',
        f'<meta property="og:title" content="{html.escape(m["title"])}">',
        f'<meta property="og:description" content="{html.escape(m["desc"])}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{OG}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Empty the Drawer — free electronics recycling and pickup in Surrey, BC">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    graph = structured(name, s)
    if graph:
        head.append('<script type="application/ld+json">' + json.dumps(
            {"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(',', ':')) + '</script>')
    s = re.sub(r'<!-- seo -->.*?<!-- /seo -->\n', '', s, flags=re.S)
    anchor = re.search(r'<meta name="description" content="[^"]*">\n', s)
    s = s[:anchor.end()] + '<!-- seo -->\n' + '\n'.join(head) + '\n<!-- /seo -->\n' + s[anchor.end():]
    open(p, 'w').write(s)
    print(f'{name}: title {len(m["title"])} chars, description {len(m["desc"])} chars')
