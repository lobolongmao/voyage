/* 旅誌 Voyage：地圖。使用 Leaflet + OpenStreetMap 官方圖資。
   OpenStreetMap 要求請求帶有來源網址（Referer），所以只有在 GitHub Pages 或本機伺服器（http://localhost）上才會顯示真實地圖；
   直接雙擊打開 index.html、Leaflet 沒載入或圖資被拒絕時，改用簡易的位置示意圖。 */
let leafletMap = null;
let tilesFailed = false;
const FILE_NOTE = '直接打開檔案時無法載入地圖。放上 GitHub Pages，或用本機伺服器開啟（見 README），就會顯示真實地圖。';
const FAIL_NOTE = '地圖圖資暫時無法載入，先顯示簡易的位置示意圖。';

function mapBlockHTML(day) {
  if (location.protocol === 'file:') return mapSVG(day, FILE_NOTE);
  if (!window.L || tilesFailed) return mapSVG(day, FAIL_NOTE);
  const unloc = day.spots.filter(s => !located(s));
  return `<div id="map" class="map-live" role="region" aria-label="Day ${ui.day + 1} 地圖"></div>
    ${unloc.length ? `<div class="map-foot">位置待確認的景點（按「編輯」補上座標後會出現在地圖上）：<ul>${unloc.map(s => `<li>${esc(s.name)}</li>`).join('')}</ul></div>` : ''}`;
}

function initMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  const el = document.getElementById('map'), card = document.getElementById('map-card');
  if (!el || !window.L || (card && !card.open)) return;
  const t = T(), day = t.days[ui.day];
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#B5543A';
  const muted = css.getPropertyValue('--muted').trim() || '#857F75';
  leafletMap = L.map(el, { scrollWheelZoom: false });
  /* 明確送出網站來源，符合 OpenStreetMap 圖資使用規範 */
  let loaded = 0, errors = 0;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 貢獻者'
  }).on('tileload', () => { loaded++; })
    .on('tileerror', () => {
      errors++;
      if (!loaded && errors >= 4 && !tilesFailed) { tilesFailed = true; setTimeout(render, 0); }
    })
    .addTo(leafletMap);

  const pts = day.spots.map((s, i) => ({ s, i })).filter(p => located(p.s));
  const others = t.days.flatMap((d, di) => di === ui.day ? [] : d.spots.filter(located));
  others.forEach(s => L.circleMarker([s.lat, s.lng], { radius: 4, color: muted, weight: 1, fillColor: muted, fillOpacity: .45 })
    .addTo(leafletMap).bindTooltip(esc(s.name)));
  if (pts.length > 1) L.polyline(pts.map(p => [p.s.lat, p.s.lng]), { color: accent, weight: 2, dashArray: '6 6' }).addTo(leafletMap);
  pts.forEach(({ s, i }) => {
    const on = ui.open === s.id;
    const icon = L.divIcon({ className: 'pin-wrap', html: `<span class="pin-num${on ? ' on' : ''}">${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    L.marker([s.lat, s.lng], { icon, title: s.name, zIndexOffset: on ? 1000 : 0 }).addTo(leafletMap)
      .bindTooltip(esc(s.name), { direction: 'top', offset: [0, -14] })
      .on('click', () => { ui.open = ui.open === s.id ? null : s.id; render(); });
  });

  const fit = pts.length ? pts.map(p => [p.s.lat, p.s.lng]) : others.map(s => [s.lat, s.lng]);
  if (fit.length > 1) leafletMap.fitBounds(fit, { padding: [36, 36], maxZoom: 15 });
  else if (fit.length === 1) leafletMap.setView(fit[0], 14);
  else if (located(t)) leafletMap.setView([t.lat, t.lng], 10);
  else leafletMap.setView([23.7, 121], 4);
  const open = pts.find(p => p.s.id === ui.open);
  if (open) leafletMap.panTo([open.s.lat, open.s.lng]);
  setTimeout(() => leafletMap && leafletMap.invalidateSize(), 50);
}

/* Fallback sketch map (no network / Leaflet failed to load). */
function mapSVG(day, note = FAIL_NOTE) {
  const all = T().days.flatMap(d => d.spots).filter(located);
  const pts = day.spots.map((s, i) => ({ s, i })).filter(p => located(p.s));
  const unloc = day.spots.filter(s => !located(s));
  const foot = `<div class="map-foot">${note}${unloc.length ? `<br>尚未定位的景點：<ul>${unloc.map(s => `<li>${esc(s.name)}</li>`).join('')}</ul>` : ''}</div>`;
  if (!all.length) return `<div class="map-foot">還沒有可以標在地圖上的景點。</div>`;
  const W = 400, H = 320, P = 44;
  const lats = all.map(s => s.lat), lngs = all.map(s => s.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-4), spanY = Math.max(maxLat - minLat, 1e-4);
  const sc = Math.min((W - 2 * P) / spanX, (H - 2 * P) / spanY);
  const ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;
  const X = lng => ox + (lng - minLng) * k * sc, Y = lat => H - oy - (lat - minLat) * sc;
  let grid = '';
  for (let x = 20; x < W; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`;
  for (let y = 20; y < H; y += 40) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
  const others = all.filter(s => !day.spots.includes(s)).map(s => `<circle cx="${X(s.lng)}" cy="${Y(s.lat)}" r="3" fill="var(--muted)" opacity=".45"/>`).join('');
  const route = pts.length > 1 ? `<polyline points="${pts.map(p => `${X(p.s.lng)},${Y(p.s.lat)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="5 4"/>` : '';
  const seen = {};
  const pins = pts.map(({ s, i }) => {
    const x = X(s.lng), y = Y(s.lat), key = `${Math.round(x / 6)}-${Math.round(y / 6)}`;
    const dup = seen[key] = (seen[key] || 0) + 1;
    const dy = (dup - 1) * 16, on = ui.open === s.id, right = x < W - 120;
    return `<g class="pin" data-act="pin" data-id="${s.id}" role="button" tabindex="0" aria-label="${esc(s.name)}">
      ${on ? `<circle cx="${x}" cy="${y}" r="17" fill="var(--accent)" opacity=".18"/>` : ''}
      <circle cx="${x}" cy="${y}" r="10" fill="${on ? 'var(--accent)' : 'var(--card)'}" stroke="var(--accent)" stroke-width="1.5"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-family="var(--sans)" fill="${on ? 'var(--card)' : 'var(--accent)'}">${i + 1}</text>
      <text x="${right ? x + 15 : x - 15}" y="${y + 4 + dy}" text-anchor="${right ? 'start' : 'end'}" font-size="12" font-family="var(--sans)" fill="var(--ink)" ${on ? 'font-weight="700"' : ''}>${esc(s.name.length > 8 ? s.name.slice(0, 8) + '…' : s.name)}</text>
    </g>`;
  }).join('');
  return `<svg class="map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Day ${ui.day + 1} 景點位置示意圖">
    <rect width="${W}" height="${H}" fill="var(--paper-2)"/>
    <g stroke="var(--rule)" stroke-width="1">${grid}</g>
    <text x="${W - 22}" y="28" text-anchor="middle" font-size="13" font-family="var(--sans)" fill="var(--muted)">N</text>
    <line x1="${W - 22}" y1="34" x2="${W - 22}" y2="50" stroke="var(--muted)" stroke-width="1.2"/>
    ${others}${route}${pins}
  </svg>${foot}`;
}

