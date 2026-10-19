/* 旅誌 Voyage：天氣。資料來自 Open-Meteo（非商業用途免費、不需金鑰），預報最多 16 天。 */
const WX_CACHE = {};
const wxKey = t => `${t.lat.toFixed(2)},${t.lng.toFixed(2)}`;

function wxDesc(code) {
  if (code === 0) return '晴';
  if (code <= 2) return '晴時多雲';
  if (code === 3) return '陰';
  if (code <= 48) return '霧';
  if (code <= 57) return '毛毛雨';
  if (code <= 67) return '雨';
  if (code <= 77) return '雪';
  if (code <= 82) return '陣雨';
  if (code <= 86) return '陣雪';
  return '雷雨';
}

function wxIcon(c) {
  const st = 'stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-linecap="round"';
  const sun = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${st}/>` + [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const t = a * Math.PI / 180; return `<line x1="${cx + Math.cos(t) * (r + 3)}" y1="${cy + Math.sin(t) * (r + 3)}" x2="${cx + Math.cos(t) * (r + 6)}" y2="${cy + Math.sin(t) * (r + 6)}" ${st}/>`; }).join('');
  const cloud = `<path d="M10 27h17a6 6 0 0 0 0-12 8 8 0 0 0-15.5 2A5 5 0 0 0 10 27z" ${st} fill="var(--paper)"/>`;
  let g = cloud;
  if (c === '晴') g = sun(18, 18, 7);
  else if (c === '晴時多雲') g = sun(13, 12, 5) + cloud;
  else if (/雨/.test(c)) g = cloud + [14, 20, 26].map(x => `<line x1="${x}" y1="30" x2="${x - 2}" y2="34" ${st}/>`).join('');
  else if (/雪/.test(c)) g = cloud + [14, 20, 26].map(x => `<circle cx="${x - 1}" cy="32" r="1.2" ${st}/>`).join('');
  return `<svg viewBox="0 0 36 36" aria-hidden="true">${g}</svg>`;
}

function wxBlock(date) {
  const t = T(), off = diffDays(todayIso, date);
  if (off < 0) return `<div class="wx-hint">這一天已經過了</div>`;
  if (off > 15) return `<div class="wx-hint">出發前 16 天內會顯示天氣預報</div>`;
  if (!located(t)) return `<div class="wx-hint">找不到目的地座標，暫時無法顯示天氣</div>`;
  const c = WX_CACHE[wxKey(t)];
  if (!c || c.status === 'loading') return `<div class="wx-hint">天氣載入中…</div>`;
  if (c.status === 'error' || !c.days[date]) return `<div class="wx-hint">暫時無法取得天氣</div>`;
  const w = c.days[date], label = wxDesc(w.code);
  return `<div class="wx">${wxIcon(label)}<div><div class="temp">${w.hi}°<span> / ${w.lo}°</span></div><div class="cond">${label}</div></div></div>`;
}

function refreshWeather() {
  const slot = document.getElementById('wx-slot'), t = T();
  if (slot && t && ui.view === 'plan') slot.innerHTML = wxBlock(t.days[ui.day].date);
}

/* Fetch the 16-day forecast once per destination per page load. */
function loadWeather() {
  const t = T(); if (!t || !located(t) || typeof fetch !== 'function') return;
  const key = wxKey(t); if (WX_CACHE[key]) return;
  WX_CACHE[key] = { status: 'loading' };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${t.lat}&longitude=${t.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`;
  fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(j => {
      const d = j.daily, days = {};
      d.time.forEach((date, i) => { days[date] = { code: d.weather_code[i], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]) }; });
      WX_CACHE[key] = { status: 'ok', days };
    })
    .catch(() => { WX_CACHE[key] = { status: 'error' }; })
    .finally(refreshWeather);
}

/* When the AI gave no usable coordinates, look the destination up by name. */
let geocodeTried = false;
function ensureCoords() {
  const t = T(); if (!t || located(t) || geocodeTried || typeof fetch !== 'function') return;
  geocodeTried = true;
  fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t.destination)}&count=1&language=zh&format=json`)
    .then(r => r.json())
    .then(j => {
      const g = j.results && j.results[0]; if (!g) return;
      t.lat = +g.latitude.toFixed(4); t.lng = +g.longitude.toFixed(4); save(); render();
    })
    .catch(() => {});
}
