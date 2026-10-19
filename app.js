/* 旅誌 Voyage：主要邏輯（狀態、分頁、行程、拖曳、編輯、照片、事件）。需在 ai.js、weather.js、map.js、budget.js 之後載入。 */
const KEY = 'voyage-trip-v3';
const CATS = ['交通', '餐飲', '住宿', '門票', '購物', '其他'];
const GROUPS = ['證件與金錢', '電子用品', '衣物', '盥洗與藥品', '其他'];
const DURS = [30, 45, 60, 90, 120, 180, 240];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'NT$' + Math.round(n || 0).toLocaleString('en-US');
const durText = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分鐘`;

/* ---------- dates & time ---------- */
const D = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = dt => dt.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const WK = '日一二三四五六';
const fmtLong = s => { const d = D(s); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 週${WK[d.getUTCDay()]}`; };
const fmtDot = s => s.slice(5).replace('-', '.');
const todayIso = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })();
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toT = m => { m = Math.min(m, 23 * 60 + 45); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

function defaultChecklist(withDone) {
  const items = {
    '證件與金錢': [['護照', true], ['當地貨幣現金', false], ['信用卡', true], ['交通卡', false], ['機票與住宿確認信', true]],
    '電子用品': [['手機與充電線', false], ['行動電源', false], ['網卡或 eSIM', false], ['耳機', false]],
    '衣物': [['換洗衣物', false], ['薄外套（早晚溫差大）', false], ['好走的鞋', false], ['睡衣', false]],
    '盥洗與藥品': [['牙刷牙膏', false], ['保養品', false], ['常備藥', false], ['口罩', false]],
    '其他': [['摺疊傘', false], ['環保購物袋', false], ['小筆記本與筆', false]]
  };
  return Object.entries(items).flatMap(([group, list]) => list.map(([text, done]) => ({ id: uid(), group, text, done: withDone && done })));
}

const storageOK = (() => { try { localStorage.setItem('__voyage', '1'); localStorage.removeItem('__voyage'); return true; } catch (e) { return false; } })();
function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function save() { if (!storageOK) return true; try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; } }

let state = load() || { form: defaultForm(), trip: null };
state.form = { ...defaultForm(), ...(state.form || {}) };
/* 舊版會預先填入沖繩的範例條件；偵測到原封不動的範例就清空，避免被帶去錯的目的地 */
if (state.form.destination === '沖繩' && state.form.stay === '那霸國際通附近' && state.form.mustGo === '沖繩美麗海水族館') {
  state.form = defaultForm(); state.confirmed = null;
}
state.promptOpts = { ...defaultOpts(), ...(state.promptOpts || {}) };
state.confirmed = state.confirmed || null;
if (state.trip) { state.trip.recs = state.trip.recs || []; state.trip.pending = state.trip.pending || []; state.trip.sources = state.trip.sources || []; }
const ui = { view: state.trip ? 'plan' : 'ai', day: 0, open: null, editing: null, adding: false, tripEdit: false, tripError: '', resetAsk: false, delAsk: null, mapOpen: null, recPick: null, itemEdit: null, aiText: '', preview: null, aiErrors: null };
const T = () => state.trip;
const located = s => typeof s.lat === 'number' && typeof s.lng === 'number';

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'toast'; }, 4200);
}

/* ---------- illustrations ---------- */
const ICONS = {
  '交通': '<rect x="5" y="3" width="14" height="14" rx="3"/><line x1="5" y1="10" x2="19" y2="10"/><circle cx="9" cy="13.5" r="1"/><circle cx="15" cy="13.5" r="1"/><line x1="8" y1="17" x2="6" y2="21"/><line x1="16" y1="17" x2="18" y2="21"/>',
  '餐飲': '<path d="M3 12h18a9 9 0 0 1-18 0z"/><line x1="13" y1="3" x2="18" y2="10"/><line x1="16.5" y1="2.5" x2="21" y2="9"/>',
  '住宿': '<path d="M3 19V6"/><path d="M3 15h18v4"/><path d="M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="12" r="2"/>',
  '門票': '<path d="M2 4.5q10 2 20 0"/><line x1="4.5" y1="9" x2="19.5" y2="9"/><line x1="7" y1="5.5" x2="7" y2="21"/><line x1="17" y1="5.5" x2="17" y2="21"/><line x1="12" y1="6" x2="12" y2="9"/>',
  '購物': '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  '其他': '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'
};
function illus(cat, label) {
  return `<svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="160" height="120" fill="var(--paper-2)"/>
    <g stroke="var(--rule)" stroke-width="1">${[20, 40, 60, 80, 100].map(y => `<line x1="0" y1="${y}" x2="160" y2="${y}"/>`).join('')}</g>
    <g transform="translate(56 26) scale(2)" fill="none" stroke="var(--muted)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat] || ICONS['其他']}</g>
    ${label ? `<text x="80" y="108" text-anchor="middle" font-size="11" letter-spacing="2" fill="var(--muted)" font-family="var(--sans)">${esc(label)}</text>` : ''}
  </svg>`;
}

/* ---------- route ---------- */
function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const travelMin = d => d < 1.2 ? Math.round(d * 15) : Math.round(d / 20 * 60 + 12);
/* Keep the first stop (and a final transport stop) fixed, order the rest by nearest neighbour, then re-time the day. */
function reroute(day) {
  const loc = day.spots.filter(located), un = day.spots.filter(s => !located(s));
  if (loc.length < 2) return { n: loc.length, dist: 0 };
  const first = loc[0];
  const last = loc.length > 2 && loc[loc.length - 1].category === '交通' ? loc[loc.length - 1] : null;
  const rest = loc.filter(s => s !== first && s !== last), order = [first];
  let cur = first;
  while (rest.length) {
    let bi = 0, bd = Infinity;
    rest.forEach((s, i) => { const d = km(cur, s); if (d < bd) { bd = d; bi = i; } });
    cur = rest.splice(bi, 1)[0]; order.push(cur);
  }
  if (last) order.push(last);
  let t = toMin(first.time) ?? 540, dist = 0;
  order.forEach((s, i) => {
    if (i > 0) { const d = km(order[i - 1], s); dist += d; t = Math.ceil((t + (order[i - 1].dur || 60) + travelMin(d)) / 15) * 15; }
    s.time = toT(t);
  });
  day.spots = [...order, ...un];
  return { n: order.length, dist };
}
function suggestDay(p) {
  let best = 0, bd = Infinity;
  T().days.forEach((d, i) => d.spots.filter(located).forEach(s => { const k = km(s, p); if (k < bd) { bd = k; best = i; } }));
  return best;
}

/* ---------- render ---------- */
function render() {
  if (!T()) ui.view = 'ai';   /* everything else unlocks after an AI reply is imported */
  renderCover(); renderNav();
  const v = document.getElementById('view');
  v.innerHTML = { ai: aiHTML, plan: planHTML, recs: recsHTML, budget: budgetHTML, check: checkHTML }[ui.view]();
  renderFoot();
  if (ui.view === 'plan') { initSortable(); initMap(); ensureCoords(); loadWeather(); }
  if (ui.view === 'plan' || ui.view === 'recs') fetchPhotos();
  const f = document.querySelector('[data-autofocus]'); if (f) f.focus();
}

function renderCover() {
  const t = T();
  if (!t) {
    document.getElementById('cover').innerHTML = `
      <div class="mast"><span><b>Voyage</b>&nbsp;&nbsp;旅誌</span><span>行程規劃板</span></div>
      <h1>讓 AI 幫你規劃看看吧！</h1>
      <div class="cover-meta"><span>寫下條件</span><span>·</span><span>交給 AI</span><span>·</span><span>匯入成冊</span></div>`;
    return;
  }
  const n = t.days.length;
  document.getElementById('cover').innerHTML = `
    <div class="mast"><span><b>Voyage</b>&nbsp;&nbsp;旅誌</span><span>No.01 · ${t.startDate.slice(0, 4)}</span></div>
    <h1>${esc(t.name)}</h1>
    <div class="cover-meta">
      <span>${esc(t.destination)}</span>
      <span class="dates">${fmtDot(t.startDate)} — ${fmtDot(t.endDate)}</span>
      <span>${n} 天 ${Math.max(0, n - 1)} 夜</span>
      ${located(t) ? `<span>北緯 ${t.lat.toFixed(2)}° 東經 ${t.lng.toFixed(2)}°</span>` : ''}
      <button class="link-btn" data-act="trip-edit">${ui.tripEdit ? '收起' : '編輯旅程'}</button>
    </div>
    ${ui.tripEdit ? `
    <form class="trip-form" id="trip-form">
      <label>旅程名稱<input class="field" id="t-name" name="name" value="${esc(t.name)}" required></label>
      <label>目的地<input class="field" id="t-dest" name="destination" value="${esc(t.destination)}" required></label>
      <label>出發日期<input class="field" id="t-start" type="date" name="startDate" value="${t.startDate}" required></label>
      <label>回程日期<input class="field" id="t-end" type="date" name="endDate" value="${t.endDate}" required></label>
      ${ui.tripError ? `<p class="form-error">${esc(ui.tripError)}</p>` : ''}
      <div class="actions"><button class="btn primary" type="submit">儲存旅程</button><button class="btn ghost" type="button" data-act="trip-edit">取消</button></div>
    </form>` : ''}`;
}

function renderNav() {
  const t = T();
  if (!t) {
    const locked = [['plan', '行程'], ['recs', '推薦'], ['budget', '預算'], ['check', '清單']];
    document.getElementById('nav').innerHTML = `<button class="on" aria-current="page">AI 規劃<small>第一步</small></button>` +
      locked.map(([k, l]) => `<button disabled title="匯入行程後開啟" style="cursor:not-allowed;opacity:.45">${l}</button>`).join('') +
      `<span class="nav-hint">匯入行程後開啟</span>`;
    return;
  }
  const sp = spend(), st = status(sp.total, t.budget.cap);
  const done = t.checklist.filter(c => c.done).length;
  const bLabel = t.budget.cap ? (st === 'over' ? '已超支' : `${Math.round(sp.total / t.budget.cap * 100)}%`) : money(sp.total);
  const tabs = [['ai', 'AI 規劃', '重新規劃', ''], ['plan', '行程', `${t.days.length} 天`, ''], ['recs', '推薦', `${t.recs.length} 項`, ''], ['budget', '預算', bLabel, st], ['check', '清單', `${done}/${t.checklist.length}`, '']];
  document.getElementById('nav').innerHTML = tabs.map(([k, l, s, c]) =>
    `<button class="${ui.view === k ? 'on' : ''}" data-act="view" data-v="${k}" aria-current="${ui.view === k ? 'page' : 'false'}">${l}<small class="${c}">${s}</small></button>`).join('');
}

const grip = `<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true"><g fill="currentColor">${[3, 9, 15].map(y => `<circle cx="3" cy="${y}" r="1.4"/><circle cx="9" cy="${y}" r="1.4"/>`).join('')}</g></svg>`;

function spotForm(mode, s = {}) {
  const t = T();
  return `<form class="spot-form" data-form="${mode}" ${s.id ? `data-id="${s.id}"` : ''}>
    <div class="row">
      <input class="field" type="time" name="time" id="f-time-${mode}" value="${esc(s.time || '')}" aria-label="時間">
      <input class="field" name="name" id="f-name-${mode}" value="${esc(s.name || '')}" placeholder="景點名稱，例如：清水寺" aria-label="景點名稱" required data-autofocus>
    </div>
    <input class="field" name="desc" id="f-desc-${mode}" value="${esc(s.desc || '')}" maxlength="80" placeholder="一句話說明這裡在做什麼，例如：看京都夜景" aria-label="簡短說明">
    <input class="field" name="note" id="f-note-${mode}" value="${esc(s.note || '')}" placeholder="個人備註（選填），例如：要先訂位" aria-label="備註">
    <div class="row3">
      <select class="field" name="category" id="f-cat-${mode}" aria-label="類別">${CATS.map(c => `<option ${c === (s.category || '門票') ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <select class="field" name="dur" id="f-dur-${mode}" aria-label="停留時間">${DURS.map(d => `<option value="${d}" ${d === (s.dur || 60) ? 'selected' : ''}>停留 ${durText(d)}</option>`).join('')}</select>
      <input class="field" type="number" name="cost" id="f-cost-${mode}" min="0" step="1" value="${s.cost || ''}" placeholder="預估花費 NT$" aria-label="預估花費">
    </div>
    <input class="field" name="coords" id="f-coords-${mode}" value="${located(s) ? `${s.lat}, ${s.lng}` : ''}" placeholder="位置座標，例如 26.2150, 127.6869（可從 Google 地圖複製）" aria-label="位置座標">
    ${mode === 'edit' ? `<select class="field" name="moveTo" id="f-move" aria-label="移到哪一天">${t.days.map((d, i) => `<option value="${i}" ${i === ui.day ? 'selected' : ''}>Day ${i + 1} · ${fmtLong(d.date)}</option>`).join('')}</select>` : ''}
    <div class="actions"><button class="btn primary" type="submit">${mode === 'add' ? '加入行程' : '儲存'}</button><button class="btn ghost" type="button" data-act="cancel">取消</button><span class="hint">照片可在卡片展開後上傳</span></div>
  </form>`;
}

function spotHTML(s, i) {
  if (ui.editing === s.id) return `<li class="spot" data-id="${s.id}">${spotForm('edit', s)}</li>`;
  const open = ui.open === s.id;
  const meta = [s.category, s.dur ? `停留 ${durText(s.dur)}` : '', s.cost ? `預估 ${money(s.cost)}` : '', located(s) ? '' : '位置待確認'].filter(Boolean).join(' · ');
  return `<li class="spot ${open ? 'open' : ''}" data-id="${s.id}">
    <div class="spot-main" data-act="toggle" role="button" tabindex="0" aria-expanded="${open}">
      <span class="when"><span class="num ${located(s) ? '' : 'off'}">${i + 1}</span><span class="time ${s.time ? '' : 'empty'}">${s.time || '--:--'}</span></span>
      <span class="thumb">${photoThumb(s)}</span>
      <span class="body"><span class="name">${esc(s.name)}</span>${s.desc ? `<span class="desc">${esc(s.desc)}</span>` : ''}<span class="meta">${esc(meta)}</span></span>
      <button class="edit-btn" data-act="edit" aria-label="編輯 ${esc(s.name)}">編輯</button>
      <span class="handle" aria-label="拖曳調整順序" title="拖曳調整順序，或拖到上方的 Day 換天">${grip}</span>
    </div>
    <div class="spot-more">
      ${s.img || s.photo ? `<figure class="photo-fig"><img class="photo" src="${esc(s.img || s.photo)}" alt="${esc(s.name)}" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()">${photoCredit(s)}</figure>` : ''}
      <p class="note ${s.note ? '' : 'empty'}">${s.note ? esc(s.note) : '沒有個人備註'}</p>
      <div class="row-actions">${ui.delAsk === s.id
        ? `<span>確定刪除「${esc(s.name)}」？</span><button class="btn danger small" data-act="del-yes">刪除</button><button class="btn ghost small" data-act="del-no">保留</button>`
        : `<button class="btn small" data-act="edit">編輯資訊</button>
           <label class="btn small">${s.img ? '更換照片' : '上傳照片'}<input type="file" accept="image/*" data-photo="${s.id}" id="ph-${s.id}" hidden></label>
           ${s.img ? `<button class="btn ghost small" data-act="photo-del">移除照片</button>` : ''}
           <button class="btn ghost small" data-act="del">刪除</button>`}</div>
    </div>
  </li>`;
}

function planHTML() {
  const t = T(); ui.day = Math.min(ui.day, t.days.length - 1);
  const day = t.days[ui.day];
  const cost = day.spots.reduce((a, s) => a + (+s.cost || 0), 0);
  const mapOpen = ui.mapOpen ?? window.matchMedia('(min-width: 861px)').matches;
  const canRoute = day.spots.filter(located).length > 2;
  return `<div class="spread">
    <section class="plan" aria-label="行程">
      <div class="days" id="days" role="tablist">${t.days.map((d, i) =>
        `<div class="day-tab ${i === ui.day ? 'on' : ''}" role="tab" tabindex="0" aria-selected="${i === ui.day}" data-act="day" data-day="${i}"><span class="dn">Day ${i + 1}</span><span class="dd">${fmtDot(d.date)}</span></div>`).join('')}</div>
      <div class="day-head">
        <div><p class="eyebrow">Day ${ui.day + 1}</p><h2>${fmtLong(day.date)}</h2>${ui.themeEdit ? `<form class="theme-form" id="theme-form"><input class="field" name="theme" id="theme-in" value="${esc(day.theme || '')}" placeholder="例如：北部海岸自駕" aria-label="當天主題" data-autofocus><button class="btn primary small" type="submit">儲存</button><button class="btn ghost small" type="button" data-act="theme-cancel">取消</button></form>`
          : `<p class="day-theme">${day.theme ? esc(day.theme) : ''}<button class="link-btn" data-act="theme-edit">${day.theme ? '編輯主題' : '加上主題'}</button></p>`}
        <p class="day-sum"><span>${day.spots.length} 個景點 · 預估 ${money(cost)}</span>${canRoute ? `<button class="link-btn" data-act="reroute">依距離重排路線</button>` : ''}</p></div>
        <div id="wx-slot">${wxBlock(day.date)}</div>
      </div>
      <ol class="spots" id="spots">${day.spots.map(spotHTML).join('')}</ol>
      ${day.spots.length ? '' : `<p class="empty-day">這一天還沒有行程。可以在下面新增，或到「推薦」頁挑選。</p>`}
      ${ui.adding ? spotForm('add') : `<button class="add-btn" data-act="add">＋ 新增景點</button>`}
    </section>
    <aside class="side">
      <details class="map-card" id="map-card" ${mapOpen ? 'open' : ''}>
        <summary><h3>Day ${ui.day + 1} 路線</h3></summary>
        ${mapBlockHTML(day)}
      </details>
    </aside>
  </div>`;
}

function recsHTML() {
  const t = T();
  const where = name => { const i = t.days.findIndex(d => d.spots.some(s => s.name === name)); return i; };
  if (!t.recs.length) return `<section class="page-intro"><div><h2>${esc(t.destination)}推薦景點</h2><p>這份行程沒有推薦清單。到「AI 規劃」重新請 AI 產生時，它會一併列出 10 個推薦景點。</p></div></section>`;
  return `<section aria-label="當地推薦">
    <div class="page-intro"><div><h2>${esc(t.destination)}推薦景點</h2>
      <p>由 AI 研究後列出的推薦景點。加入行程時會建議離當天景點最近的一天，並自動依距離重排路線與時間。</p></div>
      <span class="tag">花費為估計值</span></div>
    <div class="recs">${t.recs.map(r => {
      const at = where(r.name);
      const picking = ui.recPick === r.id, sug = suggestDay(r);
      return `<article class="rec">
        <div class="rec-img">${photoThumb(r, r.area)}</div>
        <div class="rec-body">
          <p class="eyebrow">${[r.type, r.area, r.category].filter(Boolean).map(esc).join(' · ')}</p>
          <h3>${esc(r.name)}</h3>
          <p class="rec-desc">${esc(r.desc)}</p>
          <p class="meta">建議停留 ${durText(r.dur)} · ${r.cost ? `約 ${money(r.cost)}` : '免費'}</p>
          ${at > -1 ? `<p class="in-trip">已在 Day ${at + 1} 的行程中</p>`
            : picking ? `<div class="rec-pick">
                <select class="field" id="rec-day" aria-label="加入哪一天">${t.days.map((d, i) => `<option value="${i}" ${i === sug ? 'selected' : ''}>Day ${i + 1} · ${fmtLong(d.date)}${i === sug ? '（最順路）' : ''}</option>`).join('')}</select>
                <small>加入後會依距離重新排列當天路線與時間。</small>
                <div class="actions"><button class="btn primary small" data-act="rec-add" data-id="${r.id}">加入並重排路線</button><button class="btn ghost small" data-act="rec-cancel">取消</button></div>
              </div>`
            : `<div><button class="btn small" data-act="rec-pick" data-id="${r.id}">＋ 加入行程</button></div>`}
        </div>
      </article>`;
    }).join('')}</div>
  </section>`;
}

function checkHTML() {
  const l = T().checklist, done = l.filter(c => c.done).length;
  return `<section class="check-wrap" aria-label="行前清單">
    <div class="page-intro"><div><h2>行前清單</h2><p>已經幫你列好常用的攜帶物品。點文字可以打勾，「編輯」可以改名，每個分類底下都能新增項目。</p></div></div>
    <div class="progress"><div class="meter"><div class="fill ok" style="width:${l.length ? done / l.length * 100 : 0}%"></div></div><span>${done} / ${l.length}</span></div>
    <div class="groups">${GROUPS.map(g => {
      const items = l.filter(c => c.group === g), gd = items.filter(c => c.done).length;
      return `<div class="group"><h3>${g}<span>${gd} / ${items.length}</span></h3>
        <ul class="items">${items.map(c => ui.itemEdit === c.id
          ? `<li><form class="item-edit" data-id="${c.id}"><input class="field" name="text" id="ie-${c.id}" value="${esc(c.text)}" aria-label="項目名稱" data-autofocus required><button class="btn primary small" type="submit">儲存</button><button class="btn ghost small" type="button" data-act="item-cancel">取消</button></form></li>`
          : `<li class="${c.done ? 'done' : ''}">
            <input type="checkbox" id="c-${c.id}" data-check="${c.id}" ${c.done ? 'checked' : ''}>
            <label for="c-${c.id}">${esc(c.text)}</label>
            <button class="icon-btn" data-act="item-edit" data-id="${c.id}">編輯</button>
            <button class="icon-btn x" data-act="item-del" data-id="${c.id}" aria-label="刪除 ${esc(c.text)}">×</button></li>`).join('')}</ul>
        <form class="add-item" data-group="${g}"><input class="field" name="text" id="add-${g}" placeholder="新增到「${g}」" aria-label="新增到${g}"><button class="btn small" type="submit">新增</button></form>
      </div>`;
    }).join('')}</div>
    ${T().pending.length ? `<div class="group pending" style="margin-top:28px"><h3>出發前待確認<span>${T().pending.filter(p => p.done).length} / ${T().pending.length}</span></h3>
      <ul class="items">${T().pending.map(p => `<li class="${p.done ? 'done' : ''}"><input type="checkbox" id="p-${p.id}" data-pend="${p.id}" ${p.done ? 'checked' : ''}><label for="p-${p.id}">${esc(p.text)}</label></li>`).join('')}</ul></div>` : ''}
    ${T().sources.length ? `<div class="group" style="margin-top:28px"><h3>資料來源<span>AI 提供，請自行點開確認</span></h3>
      <ul class="sources">${T().sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></li>`).join('')}</ul></div>` : ''}
  </section>`;
}

function renderFoot() {
  document.getElementById('foot').innerHTML = `<p>資料只存在你的瀏覽器裡，換電腦或清除瀏覽資料就會消失。行程內容來自 AI 的回覆，出發前請再自行確認。天氣資料來自 Open-Meteo；地圖資料 © OpenStreetMap 貢獻者；景點照片來自維基百科。</p>
    <span>${ui.resetAsk ? `清除目前的行程，回到 AI 規劃重新開始？ <button class="btn danger small" data-act="reset-yes">確定</button> <button class="btn ghost small" data-act="reset-no">取消</button>`
      : (T() ? `<button class="link-btn" data-act="reset">清除行程，重新開始</button>` : '')}</span>`;
}

/* ---------- drag & drop ---------- */
let sortables = [];
function findSpot(id) {
  for (const d of T().days) { const i = d.spots.findIndex(s => s.id === id); if (i > -1) return { d, i }; }
  return null;
}
function initSortable() {
  sortables.forEach(s => s.destroy()); sortables = [];
  if (!window.Sortable) return;
  const list = document.getElementById('spots');
  sortables.push(Sortable.create(list, {
    group: { name: 'spots', pull: true, put: false }, handle: '.handle', animation: 180,
    onStart: () => document.body.classList.add('dragging'),
    onEnd: e => {
      document.body.classList.remove('dragging');
      if (e.to !== e.from) return;
      const day = T().days[ui.day], ids = [...list.children].map(li => li.dataset.id);
      day.spots.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      save(); render();
    }
  }));
  document.querySelectorAll('.day-tab').forEach(tab => {
    sortables.push(Sortable.create(tab, {
      group: { name: 'spots', pull: false, put: to => +to.el.dataset.day !== ui.day }, sort: false, draggable: '.spot',
      onAdd: e => {
        const id = e.item.dataset.id, target = +tab.dataset.day, f = findSpot(id);
        e.item.remove();
        if (f) { const [s] = f.d.spots.splice(f.i, 1); T().days[target].spots.push(s); toast(`已移到 Day ${target + 1}`); }
        save(); setTimeout(render, 0);
      }
    }));
  });
}

/* ---------- photos ---------- */
function compress(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(720, img.width), h = Math.round(img.height * w / img.width);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', .72));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, li = el.closest('.spot'), id = el.dataset.id || li?.dataset.id;
  const t = T();
  switch (act) {
    case 'view': ui.view = el.dataset.v; ui.recPick = ui.itemEdit = null; window.scrollTo({ top: 0 }); break;
    case 'day': ui.day = +el.dataset.day; ui.open = ui.editing = ui.delAsk = null; ui.adding = ui.themeEdit = false; break;
    case 'toggle': ui.open = ui.open === id ? null : id; ui.delAsk = null; break;
    case 'pin': ui.open = ui.open === id ? null : id; break;
    case 'add': ui.adding = true; ui.editing = null; break;
    case 'theme-edit': ui.themeEdit = true; break;
    case 'theme-cancel': ui.themeEdit = false; break;
    case 'cancel': ui.adding = false; ui.editing = null; break;
    case 'edit': ui.editing = id; ui.adding = false; break;
    case 'del': ui.delAsk = id; break;
    case 'del-no': ui.delAsk = null; break;
    case 'del-yes': { const f = findSpot(id); if (f) f.d.spots.splice(f.i, 1); ui.delAsk = ui.open = null; save(); break; }
    case 'photo-del': { const f = findSpot(id); if (f) f.d.spots[f.i].img = ''; save(); break; }
    case 'reroute': { const r = reroute(t.days[ui.day]); save(); toast(`已依距離重排 ${r.n} 個景點，移動距離約 ${r.dist.toFixed(1)} 公里`); break; }
    case 'rec-pick': ui.recPick = id; break;
    case 'rec-cancel': ui.recPick = null; break;
    case 'rec-add': {
      const r = t.recs.find(x => x.id === id), d = +document.getElementById('rec-day').value, day = t.days[d];
      let res;
      budgetCheck(() => {
        day.spots.push({ id: uid(), time: '', name: r.name, desc: r.desc, note: '', cost: r.cost, category: r.category, dur: r.dur, lat: r.lat, lng: r.lng, img: '' });
        if (!day.spots[0].time) day.spots[0].time = '09:00';
        res = reroute(day);
      });
      ui.recPick = null; save();
      setTimeout(() => toast(`已加入 Day ${d + 1}，並重排路線（${res.n} 站，約 ${res.dist.toFixed(1)} 公里）`), document.getElementById('toast').classList.contains('show') ? 2600 : 0);
      break;
    }
    case 'ai-copy': {
      const text = buildPrompt(), ta = document.getElementById('prompt-out');
      const fallback = () => { document.getElementById('full-prompt').open = true; ta.focus(); ta.select(); toast('已選取提示詞，請按 Ctrl+C（手機請長按）複製。', 'warn'); };
      try { navigator.clipboard.writeText(text).then(() => toast('已複製提示詞，貼到 AI 的對話框就可以開始。'), fallback); } catch (err) { fallback(); }
      return;
    }
    case 'ai-clear-form': state.form = defaultForm(); state.confirmed = null; ui.formError = ''; save(); toast('條件已清空，可以重新填寫。'); break;
    case 'ai-confirm': {
      const f = state.form;
      if (!String(f.destination || '').trim()) { ui.formError = '請先填寫目的地。'; break; }
      if (!f.startDate || !f.endDate) { ui.formError = '請填寫出發與回程日期。'; break; }
      const n = diffDays(f.startDate, f.endDate) + 1;
      if (n < 1) { ui.formError = '回程日期要在出發日期之後。'; break; }
      if (n > 30) { ui.formError = '旅程最多 30 天，請縮短日期範圍。'; break; }
      ui.formError = ''; state.confirmed = JSON.parse(JSON.stringify(f)); save();
      render(); document.getElementById('step2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('條件已帶入提示詞，確認後就可以複製。');
      return;
    }
    case 'ai-edit-form': document.getElementById('step1')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    case 'ai-parse': ui.aiText = document.getElementById('ai-reply').value; runParse(); break;
    case 'ai-sample': ui.aiText = sampleReply(); runParse(); break;
    case 'ai-cancel': ui.preview = ui.aiErrors = null; break;
    case 'ai-import': {
      if (!ui.preview) return;
      state.trip = ui.preview.trip; save();
      Object.assign(ui, { view: 'plan', day: 0, open: null, editing: null, adding: false, recPick: null, itemEdit: null, preview: null, aiErrors: null, aiText: '' });
      window.scrollTo({ top: 0 });
      toast(`已匯入「${state.trip.name}」，可以開始拖曳調整了。`);
      break;
    }
    case 'exp-del': t.expenses = t.expenses.filter(x => x.id !== id); save(); break;
    case 'item-del': t.checklist = t.checklist.filter(c => c.id !== id); save(); break;
    case 'item-edit': ui.itemEdit = id; break;
    case 'item-cancel': ui.itemEdit = null; break;
    case 'trip-edit': ui.tripEdit = !ui.tripEdit; ui.tripError = ''; break;
    case 'reset': ui.resetAsk = true; break;
    case 'reset-no': ui.resetAsk = false; break;
    case 'reset-yes': state.trip = null; Object.assign(ui, { view: 'ai', preview: null, aiErrors: null, aiText: '', day: 0, open: null, editing: null, adding: false, resetAsk: false, tripEdit: false, recPick: null, itemEdit: null }); save(); break;
    default: return;
  }
  render();
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"], [role="tab"]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && (ui.adding || ui.editing || ui.itemEdit)) { ui.adding = false; ui.editing = ui.itemEdit = null; render(); }
});
document.addEventListener('toggle', e => { if (e.target.id === 'map-card') { ui.mapOpen = e.target.open; if (e.target.open) initMap(); } }, true);
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.fkey) {
    const k = el.dataset.fkey;
    state.form[k] = el.dataset.multi ? [...document.querySelectorAll(`[data-fkey="${k}"]:checked`)].map(x => x.value).join('、') : el.value;
    save();
    const note = document.getElementById('stale-note'); if (note) note.hidden = !isStale();
    const cs = document.getElementById('confirm-state'); if (cs) cs.textContent = confirmState();
  } else if (el.dataset.pkey) {
    state.promptOpts[el.dataset.pkey] = el.type === 'checkbox' ? el.checked : el.value; save();
    const p = buildPrompt();
    const out = document.getElementById('prompt-out'); if (out) out.value = p;
    const len = document.getElementById('prompt-len'); if (len) len.textContent = `共 ${p.length.toLocaleString('en-US')} 字`;
    const spec = document.getElementById('spec-pre'); if (spec) spec.textContent = outputSpec(state.promptOpts.recCount);
  } else if (el.id === 'ai-reply') ui.aiText = el.value;
});
document.addEventListener('change', async e => {
  const el = e.target, t = T();
  if (el.dataset.check) {
    const item = t.checklist.find(x => x.id === el.dataset.check); if (item) { item.done = el.checked; save(); render(); }
  } else if (el.dataset.pend) {
    const p = t.pending.find(x => x.id === el.dataset.pend); if (p) { p.done = el.checked; save(); render(); }
  } else if (el.dataset.import && el.files[0]) {
    const file = el.files[0];
    if (file.size > 2e6) { toast('檔案太大了，請貼上 AI 回覆中的 JSON 段落就好。', 'warn'); return; }
    ui.aiText = await file.text(); runParse(); render();
  } else if (el.id === 'cap') {
    t.budget.cap = Math.max(0, +el.value || 0); save(); render();
  } else if (el.dataset.capcat) {
    const v = Math.max(0, +el.value || 0);
    if (v) t.budget.cats[el.dataset.capcat] = v; else delete t.budget.cats[el.dataset.capcat];
    save(); render();
  } else if (el.dataset.photo && el.files[0]) {
    const f = findSpot(el.dataset.photo); if (!f) return;
    const s = f.d.spots[f.i], old = s.img;
    try { s.img = await compress(el.files[0]); } catch (err) { toast('這個檔案無法讀取，請換一張 JPG 或 PNG 照片。', 'warn'); return; }
    if (!save()) { s.img = old; toast('瀏覽器的儲存空間不足，請先移除其他照片再試。', 'over'); }
    else toast('照片已更新');
    render();
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, data = Object.fromEntries(new FormData(f)), t = T();
  if (f.classList.contains('add-item')) {
    const text = (data.text || '').trim(); if (!text) return;
    t.checklist.push({ id: uid(), group: f.dataset.group, text, done: false }); save(); render();
    document.getElementById(`add-${f.dataset.group}`)?.focus(); return;
  }
  if (f.classList.contains('item-edit')) {
    const text = (data.text || '').trim(), item = t.checklist.find(x => x.id === f.dataset.id);
    if (item && text) item.text = text; ui.itemEdit = null; save(); return render();
  }
  if (f.id === 'theme-form') {
    t.days[ui.day].theme = String(data.theme || '').trim(); ui.themeEdit = false; save(); return render();
  }
  if (f.id === 'exp-form') {
    const name = (data.name || '').trim(), amount = Math.max(0, +data.amount || 0); if (!name || !amount) return;
    budgetCheck(() => t.expenses.push({ id: uid(), name, category: data.category, amount }));
    save(); return render();
  }
  if (f.id === 'trip-form') {
    const { name, destination, startDate, endDate } = data;
    const n = diffDays(startDate, endDate) + 1;
    if (n < 1) { ui.tripError = '回程日期要在出發日期之後。'; return render(); }
    if (n > 30) { ui.tripError = '一個旅程最多 30 天，請縮短日期範圍。'; return render(); }
    if (destination.trim() !== t.destination) { t.lat = t.lng = null; }
    const old = t.days;
    t.days = Array.from({ length: n }, (_, i) => ({ date: addDays(startDate, i), spots: old[i] ? old[i].spots : [] }));
    if (old.length > n) t.days[n - 1].spots.push(...old.slice(n).flatMap(d => d.spots));
    Object.assign(t, { name: name.trim(), destination: destination.trim(), startDate, endDate });
    ui.tripEdit = false; ui.tripError = ''; ui.day = Math.min(ui.day, n - 1); save(); return render();
  }
  if (f.dataset.form) {
    const name = (data.name || '').trim(); if (!name) return;
    const cs = String(data.coords || '').trim(), cm = cs.match(/^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (cs && (!cm || Math.abs(+cm[1]) > 90 || Math.abs(+cm[2]) > 180)) { toast('座標格式看不懂，請用「緯度, 經度」，例如 26.2150, 127.6869。', 'warn'); return; }
    const spot = { lat: cm ? +cm[1] : null, lng: cm ? +cm[2] : null, time: data.time || '', name, desc: (data.desc || '').trim(), note: (data.note || '').trim(), category: data.category, dur: +data.dur || 60, cost: Math.max(0, +data.cost || 0) };
    budgetCheck(() => {
      if (f.dataset.form === 'add') {
        const day = t.days[ui.day], s = { id: uid(), img: '', ...spot };
        let at = day.spots.length;
        if (s.time) { const j = day.spots.findIndex(x => x.time && x.time > s.time); if (j > -1) at = j; }
        day.spots.splice(at, 0, s); ui.adding = false; ui.open = s.id;
      } else {
        const found = findSpot(f.dataset.id); if (!found) return;
        if (found.d.spots[found.i].name !== spot.name) Object.assign(spot, { photo: '', photoPage: '', photoTried: false });
        const s = Object.assign(found.d.spots[found.i], spot), to = +data.moveTo;
        if (to !== ui.day) { found.d.spots.splice(found.i, 1); t.days[to].spots.push(s); ui.day = to; }
        ui.editing = null; ui.open = s.id;
      }
    });
    save(); render();
  }
});

render();
