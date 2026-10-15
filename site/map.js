// Drop box map — Leaflet loads only when the map is about to scroll into view.
(() => {
  const el = document.getElementById('etd-map');
  if (!el) return;
  const load = () => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'vendor/leaflet/leaflet.js';
    js.onload = draw;
    document.head.appendChild(js);
  };
  const draw = () => {
    const at = [49.1480043, -122.8602604]; // 13060 80 Ave #108, Surrey, BC V3W 3B2 (OpenStreetMap)
    const map = L.map(el, { scrollWheelZoom: false }).setView(at, 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.getPane('tilePane').style.filter = 'grayscale(.75) sepia(.12) contrast(.95) brightness(1.04)';
    L.marker(at, {
      icon: L.divIcon({
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        html: '<div style="width:26px;height:26px;border-radius:50%;background:#D8F14A;border:3px solid #0A2E2C;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>'
      })
    }).addTo(map).bindPopup('Empty the Drawer box — Surge Wholesale loading bay, 13060 80 Ave #108');
    L.circle(at, { radius: 90, color: '#0A2E2C', weight: 1, fillColor: '#D8F14A', fillOpacity: 0.12 }).addTo(map);
  };
  if (!('IntersectionObserver' in window)) { load(); return; }
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); load(); }
  }, { rootMargin: '400px 0px' });
  io.observe(el);
})();
