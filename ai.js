/* 旅誌 Voyage：條件表單、提示詞組合、讀取與檢查 AI 的回覆。 */
/* ---------- AI planning: prompt builder & importer ---------- */
const PROMPT_BASE = "旅遊行程規劃任務（資料將匯入「旅誌 Voyage」行程網頁）\n\n一、角色與任務\n\n你是熟悉目的地文化、景點、美食與交通的當地導遊，也擅長路線規劃與預算估算。請依照第三部分的旅遊條件，為第一次造訪、對當地不熟悉的旅客規劃一份可以直接執行的行程。\n\n你的回覆只需要第五部分規定的 JSON 資料。網頁會自行處理排版、地圖、天氣與圖片，所以不需要製作手冊、圖片、地圖、表格、目的地介紹或其他說明文字。\n\n二、規劃原則\n\n1. 資訊真實：營業時間、休館日、門票、預約方式、交通班次與末班車，必須以官方網站或可靠來源查證，不可猜測或以常識代替。無法查證的事項放進 pending，不要寫進說明裡。\n2. 估算要標明：車程、排隊時間與花費可以合理估算；金額的估算依據寫在 basis。\n3. 優先順序：當條件衝突時，依序考慮安全與營業時間、我指定的必去景點與不可妥協條件、我的興趣、每日節奏與體力、預算、其他景點。若預算是硬性上限，不可超出。\n4. 主動決定：直接提出你認為最合理的安排，不要把選擇丟回給我。\n5. 路線順暢：位置相近的景點排在同一天，避免跨區與折返；依住宿地點安排每天的起點與終點；預留用餐、移動、排隊與緩衝時間。\n6. 抵達日與離開日：考慮入境、領行李、入住或寄放行李、退房，以及前往機場或車站報到的時間，不要排成完整的旅遊日。\n7. 導遊口吻：desc 用一句話說出這個地方為什麼值得去；note 放第一次來容易忽略的提醒、預約方式或注意事項。避免「必吃」「第一名」等沒有根據的說法。\n8. 實用清單：checklist 除了一般攜帶物品，也要列出這個目的地特有的證件、入境文件或裝備。入境規定若因國籍而異，請依我的護照類型判斷；無法確認時放進 pending。";   /* 一、二：角色與規劃原則（精簡版） */
const PROMPT_START = "四、開始執行\n\n請先查證目的地與旅遊日期的相關資訊，再完成每日行程、推薦景點、預算與行前清單。"; /* 四：開始執行 */
const FENCE = '```';

function defaultForm() {
  return { destination: '沖繩', startDate: '2027-01-10', endDate: '2027-01-16', origin: '台北（桃園機場）', adults: '2', kids: '0', companions: '朋友',
    passport: '中華民國（臺灣）護照', arriveTime: '13:30', leaveTime: '15:00', stay: '那霸國際通附近', transport: '大眾運輸＋部分天數租車',
    interests: '海景、歷史文化、在地小吃', interestsOther: '', mustGo: '沖繩美麗海水族館', food: '沖繩麵、塔可飯', dislike: '太早起床的行程', pace: '適中', limits: '無',
    budget: 'NT$30,000–50,000', includes: '含機票與住宿', budgetType: '參考值', paid: '', special: '', other: '' };
}
function defaultOpts() { return { recCount: '10', maxPerDay: '不限', direct: true, extra: '' }; }
const OPT_FIELDS = [
  ['recCount', '推薦景點數量', ['6', '8', '10', '12']],
  ['maxPerDay', '每天景點上限（不含用餐、交通）', ['不限', '3', '4', '5', '6']]
];
const FIELDS = [
  ['基本資訊', [
    ['destination', '目的地', 'text', '例如：沖繩'], ['startDate', '出發日期', 'date'], ['endDate', '回程日期', 'date'],
    ['origin', '出發地', 'select', ['台北（桃園機場）', '台北（松山機場）', '台中', '高雄', '其他（寫在其他注意事項）']],
    ['adults', '成人', 'select', ['1', '2', '3', '4', '5', '6', '7', '8']], ['kids', '兒童', 'select', ['0', '1', '2', '3', '4']],
    ['companions', '同行者', 'select', ['獨自旅行', '情侶或夫妻', '朋友', '家庭（含小孩）', '家庭（含長輩）', '公司或團體']],
    ['passport', '護照類型', 'select', ['中華民國（臺灣）護照', '香港特區護照', '澳門特區護照', '中國大陸護照', '其他（寫在其他注意事項）']],
    ['arriveTime', '去程抵達時間', 'time'], ['leaveTime', '回程出發時間', 'time'],
    ['stay', '住宿地點或區域', 'text', '例如：那霸國際通附近'],
    ['transport', '交通方式', 'select', ['大眾運輸為主', '租車自駕', '大眾運輸＋部分天數租車', '包車或計程車']]]],
  ['個人偏好', [
    ['interests', '主要興趣（可複選）', 'multi', ['自然風景', '海景', '歷史文化', '在地小吃', '美食餐廳', '購物', '攝影', '親子', '主題樂園', '溫泉', '夜生活', '戶外活動'], 'full'],
    ['interestsOther', '其他興趣', 'text', '選項裡沒有的興趣', 'wide'], ['pace', '旅遊節奏', 'select', ['悠閒', '適中', '緊湊']],
    ['mustGo', '特別想去的景點', 'text', '', 'wide'], ['limits', '體力或飲食限制', 'select', ['無', '不宜久走', '使用輪椅或推車', '素食', '不吃生食', '其他（寫在其他注意事項）']],
    ['food', '想體驗的美食', 'text', '', 'wide'], ['dislike', '不喜歡的活動', 'text', '']]],
  ['消費條件', [
    ['budget', '每人預算', 'select', ['NT$20,000 以下', 'NT$20,000–30,000', 'NT$30,000–50,000', 'NT$50,000–80,000', 'NT$80,000 以上', '尚未決定']],
    ['includes', '預算包含', 'select', ['含機票與住宿', '含住宿、不含機票', '不含機票與住宿']],
    ['budgetType', '預算性質', 'select', ['參考值', '硬性上限']], ['paid', '已訂購或付款項目', 'text', '例如：機票已訂', 'full']]],
  ['其他需求', [
    ['special', '希望加入的特殊活動', 'text', '例如：浮潛、和服體驗', 'full'], ['other', '其他注意事項', 'text', '', 'full']]]
];

const OUTPUT_EXAMPLE = {
  format: 'voyage-trip/1',
  trip: { name: '沖繩海島七日', destination: '沖繩', lat: 26.21, lng: 127.68, startDate: '2027-01-10', endDate: '2027-01-16' },
  days: [{ date: '2027-01-10', theme: '抵達那霸・國際通', spots: [
    { time: '17:00', name: '國際通', desc: '那霸最熱鬧的購物大街', note: '傍晚後比較熱鬧', category: '其他', dur: 90, cost: 0, lat: 26.215, lng: 127.6869 }] }],
  recommendations: [{ name: '識名園', type: '特色探索', area: '那霸', category: '門票', desc: '琉球王家的別邸庭園', dur: 60, cost: 200, lat: 26.205, lng: 127.713 }],
  budget: { cap: 70000, items: [{ name: '台北—沖繩來回機票 2 人', category: '交通', amount: 16000, basis: '公開參考價格，以查詢當日匯率換算' }] },
  checklist: [{ group: '證件與金錢', text: '護照' }],
  pending: ['首里城的開放範圍與門票'],
  sources: [{ title: '景點官方網站名稱', url: 'https://example.com/' }]
};
const outputSpec = n => `五、輸出格式

請只輸出一段 JSON，放在 ${FENCE}json 程式碼區塊中，前後不需要任何說明文字。這段 JSON 必須遵守：

1. 必須是合法 JSON：使用半形雙引號，不要加註解，不要有結尾逗號，不可省略任何一天。
2. 日期格式為 YYYY-MM-DD，時間為 24 小時制 HH:MM。
3. days 依日期排列，每天一筆；spots 依造訪順序排列，用餐也算一站。
4. 所有金額換算成新台幣整數，以「全團合計」計算；匯率與估算依據寫在 budget.items 的 basis。
5. category 只能是：交通、餐飲、住宿、門票、購物、其他。
6. checklist 的 group 只能是：證件與金錢、電子用品、衣物、盥洗與藥品、其他。
7. lat、lng 為十進位經緯度；無法確認位置時填 null，不要猜測。
8. desc 為 30 字以內的一句話說明；note 放導遊提醒、預約方式或注意事項。
9. dur 為建議停留分鐘數；cost 為該站預估花費，沒有花費填 0。
10. recommendations 放 ${n} 個推薦景點，type 為「經典必去」「特色探索」「彈性選擇」其中之一，可以包含沒有排進行程的景點。
11. budget.cap 為整趟旅程的總預算上限（新台幣）；budget.items 只放不屬於任何一站的支出，例如機票、住宿、租車、保險、網卡、備用金，避免重複計算。
12. 無法查證的事項放進 pending；sources 只列出實際查詢過的網頁。
13. checklist 約 15 到 25 項。

格式範例（欄位名稱必須完全相同，內容請換成實際規劃）：

${FENCE}json
${JSON.stringify(OUTPUT_EXAMPLE, null, 2)}
${FENCE}`;

function buildPrompt() {
  const f = state.confirmed || state.form, o = state.promptOpts, v = k => String(f[k] || '').trim();
  let span = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(f.endDate)) {
    const n = diffDays(f.startDate, f.endDate) + 1; if (n > 0) span = `${n} 天 ${n - 1} 夜`;
  }
  const conds = `三、我的旅遊條件

請以下列資訊進行規劃；沒有填寫的欄位，請依必要性判斷是否需要追問。

基本資訊

目的地：${v('destination')}
旅遊日期：${f.startDate && f.endDate ? `${f.startDate} 至 ${f.endDate}` : ''}
旅遊天數：${span}
出發地：${v('origin')}
旅遊人數及同行者組成：成人 ${v('adults')} 位${v('kids') && v('kids') !== '0' ? `、兒童 ${v('kids')} 位` : ''}，${v('companions')}
國籍／護照類型（供入境規定判定）：${v('passport')}
抵達及離開時間：去程 ${v('arriveTime') || '未定'} 抵達，回程 ${v('leaveTime') || '未定'} 出發
住宿地點或區域：${v('stay')}
交通方式：${v('transport')}

個人偏好

主要興趣：${[v('interests'), v('interestsOther')].filter(Boolean).join('、')}
特別想去的景點：${v('mustGo')}
想體驗的美食：${v('food')}
不喜歡的活動：${v('dislike')}
旅遊節奏：${v('pace')}
同行者體力、行動能力或飲食限制：${v('limits')}

消費條件

每人預算：${v('budget')}
是否包含機票與住宿：${v('includes')}
預算是硬性上限還是參考值：${v('budgetType')}
已訂購或付款項目：${v('paid')}

其他需求

希望加入的特殊活動：${v('special')}
其他注意事項：${v('other')}`;
  const extra = [];
  extra.push(o.direct ? '請直接完成，不需要停下來等我確認景點。' : '請先用條列方式列出你建議的核心景點與推薦景點讓我確認，等我回覆後再輸出第五部分的 JSON。');
  if (o.maxPerDay !== '不限') extra.push(`每天安排的景點（不含用餐與交通）最多 ${o.maxPerDay} 個，寧可少而從容。`);
  if (String(o.extra || '').trim()) extra.push(`補充要求：${String(o.extra).trim()}`);
  const start = PROMPT_START.trim() + '\n\n' + extra.join('\n');
  return [PROMPT_BASE.trim(), conds, start, outputSpec(o.recCount)].join('\n\n\n');
}

const isStale = () => !!state.confirmed && JSON.stringify(state.form) !== JSON.stringify(state.confirmed);
const confirmState = () => !state.confirmed ? '' : isStale() ? '條件有修改，尚未套用到提示詞' : '已套用到下方提示詞';

function promptDocHTML() {
  const c = state.confirmed, o = state.promptOpts, prompt = buildPrompt();
  const slot = v => String(v || '').trim() ? `<span class="slot">${esc(v)}</span>` : `<span class="slot empty">未填，AI 會視需要詢問</span>`;
  let span = '';
  const n = diffDays(c.startDate, c.endDate) + 1; if (n > 0) span = `${n} 天 ${n - 1} 夜`;
  const conds = FIELDS.map(([g, fs]) => `<div class="cond-group"><p class="cond-g">${g}</p><dl class="cond-list">${fs.map(([k, label]) =>
    k === 'startDate' ? `<div><dt>旅遊日期</dt><dd>${slot(`${c.startDate} 至 ${c.endDate}`)}</dd></div><div><dt>旅遊天數</dt><dd>${slot(span)}</dd></div>`
    : k === 'endDate' ? '' : `<div><dt>${label}</dt><dd>${slot(c[k])}</dd></div>`).join('')}</dl></div>`).join('');
  return `<p class="step-note">這是只為網頁準備的精簡提示詞，AI 只會回傳匯入用的資料，跑起來比較快。標示的部分來自你在第一步填的條件；「可調整」的設定可以直接在這裡改。請使用有開啟網路搜尋的 AI，查證營業時間與票價的要求才會真正執行。</p>
    <div class="alert near" id="stale-note" ${isStale() ? '' : 'hidden'}>上方的條件有修改，還沒套用到提示詞。<button class="link-btn" data-act="ai-confirm">套用修改</button></div>
    <div class="prompt-doc">
      <div class="pd-sec"><div class="pd-head"><span class="pd-tag">固定</span><b>一、二、角色與規劃原則</b></div>
        <details><summary>展開內容</summary><pre class="pd-pre">${esc(PROMPT_BASE.trim())}</pre></details></div>
      <div class="pd-sec"><div class="pd-head"><span class="pd-tag fill">帶入條件</span><b>三、我的旅遊條件</b><button class="link-btn" data-act="ai-edit-form">修改條件</button></div>${conds}</div>
      <div class="pd-sec"><div class="pd-head"><span class="pd-tag edit">可調整</span><b>四、開始執行與本次設定</b></div>
        <div class="fgrid">${OPT_FIELDS.map(([k, label, opts]) => `<label class="lbl-field" for="po-${k}">${label}<select class="field" id="po-${k}" data-pkey="${k}">${opts.map(x => `<option ${String(o[k]) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`).join('')}
          <label class="check-line full" for="po-direct"><input type="checkbox" id="po-direct" data-pkey="direct" ${o.direct ? 'checked' : ''}>請 AI 直接完成，不先停下來確認景點</label>
          <label class="lbl-field full" for="po-extra">給 AI 的補充要求（選填）<textarea class="field" id="po-extra" data-pkey="extra" rows="2" placeholder="例如：第三天想留半天自由活動；餐廳以不用排隊為優先">${esc(o.extra)}</textarea></label></div></div>
      <div class="pd-sec"><div class="pd-head"><span class="pd-tag">固定</span><b>五、輸出格式（給網頁匯入）</b></div>
        <details><summary>展開內容</summary><pre class="pd-pre" id="spec-pre">${esc(outputSpec(o.recCount))}</pre></details></div>
    </div>
    <details class="full-prompt" id="full-prompt"><summary>查看完整提示詞</summary><textarea class="field" id="prompt-out" rows="12" readonly aria-label="完整提示詞">${esc(prompt)}</textarea></details>
    <div class="actions"><button class="btn primary" data-act="ai-copy">複製提示詞</button><span class="hint" id="prompt-len">共 ${prompt.length.toLocaleString('en-US')} 字</span></div>`;
}

function fieldHTML([key, label, type, extra, cls]) {
  const f = state.form, id = `af-${key}`, val = String(f[key] ?? '');
  if (type === 'multi') {
    const picked = val.split('、').filter(Boolean);
    return `<div class="lbl-field ${cls || ''}"><span>${label}</span><div class="chips">${extra.map((o, i) =>
      `<label class="chip" for="${id}-${i}"><input type="checkbox" id="${id}-${i}" data-fkey="${key}" data-multi="1" value="${o}" ${picked.includes(o) ? 'checked' : ''}><span>${o}</span></label>`).join('')}</div></div>`;
  }
  const input = type === 'select'
    ? `<select class="field" id="${id}" data-fkey="${key}">${(extra.includes(val) || !val ? extra : [val, ...extra]).map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input class="field" type="${type}" id="${id}" data-fkey="${key}" value="${esc(val)}" ${extra ? `placeholder="${esc(extra)}"` : ''}>`;
  return `<label class="lbl-field ${cls || ''}" for="${id}">${label}${input}</label>`;
}

function aiHTML() {
  const P = ui.preview, E = ui.aiErrors;
  let result = '';
  if (E) result = `<div class="alert over"><b>這段內容沒辦法匯入：</b><ul>${E.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <p style="margin:8px 0 0">可以回到 AI 對話中說：「請只重新輸出第五部分的 JSON 程式碼區塊」，再把新的回覆貼上。</p></div>`;
  else if (P) {
    const t = P.trip, nSpots = t.days.reduce((a, d) => a + d.spots.length, 0);
    result = `<div class="preview">
      <div><p class="eyebrow">匯入預覽</p><h4>${esc(t.name)}</h4><p class="sub">${esc(t.destination)} · ${fmtDot(t.startDate)} — ${fmtDot(t.endDate)}</p></div>
      <dl class="facts"><div><dt>天數</dt><dd>${t.days.length} 天</dd></div><div><dt>行程</dt><dd>${nSpots} 站</dd></div><div><dt>推薦</dt><dd>${t.recs.length} 個</dd></div>
        <div><dt>其他支出</dt><dd>${t.expenses.length} 筆</dd></div><div><dt>清單</dt><dd>${t.checklist.length} 項</dd></div><div><dt>待確認</dt><dd>${t.pending.length} 項</dd></div></dl>
      <ul>${t.days.map((d, i) => `<li>Day ${i + 1}${d.theme ? `・${esc(d.theme)}` : ''}：${d.spots.map(s => esc(s.name)).join('、') || '（沒有景點）'}</li>`).join('')}</ul>
      ${P.warns.length ? `<div class="alert near"><b>匯入時會自動處理：</b><ul>${P.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${T() ? `<p class="sub">匯入後會取代目前的行程「${esc(T().name)}」。</p>` : ''}
      <div class="actions"><button class="btn primary" data-act="ai-import">${T() ? '匯入並取代目前行程' : '匯入並開始整理行程'}</button><button class="btn ghost" data-act="ai-cancel">取消</button></div>
    </div>`;
  }
  return `<section aria-label="AI 規劃">
    <div class="page-intro"><div><h2>AI 行程規劃</h2><p>三個步驟，讓 AI 先替你起草整趟旅程。</p></div></div>
    <ol class="ai-steps">
      <li class="ai-step" id="step1"><span class="step-no">1</span><div class="step-body"><h3>填寫旅遊條件</h3>
        <p class="step-note">已先填入沖繩的範例，直接修改即可。不確定的欄位可以留空，AI 會視需要詢問。填好後按下方按鈕，條件才會帶入提示詞。</p>
        ${FIELDS.map(([g, fs]) => `<fieldset class="fset"><legend>${g}</legend><div class="fgrid">${fs.map(fieldHTML).join('')}</div></fieldset>`).join('')}
        ${ui.formError ? `<div class="alert over">${esc(ui.formError)}</div>` : ''}
        <div class="actions"><button class="btn primary" data-act="ai-confirm" id="confirm-btn">${state.confirmed ? '套用修改到提示詞' : '確認條件，產生提示詞'}</button>
          <span class="hint" id="confirm-state">${confirmState()}</span></div>
      </div></li>
      <li class="ai-step" id="step2"><span class="step-no">2</span><div class="step-body"><h3>確認提示詞，複製給 AI</h3>
        ${state.confirmed ? promptDocHTML() : `<div class="locked-box">確認上方的旅遊條件後，這裡會產生要交給 AI 的提示詞。</div>`}
      </div></li>
      <li class="ai-step"><span class="step-no">3</span><div class="step-body"><h3>貼上 AI 的回覆並匯入</h3>
        <p class="step-note">整段回覆直接貼上就好，網頁會自動找出最後的 JSON 段落；也可以上傳 AI 給你的 .json 或 .txt 檔案。還沒跑 AI 的話，可以先載入範例回覆試試看。</p>
        <textarea class="field" id="ai-reply" rows="7" placeholder="把 AI 的完整回覆貼在這裡" aria-label="AI 的回覆">${esc(ui.aiText)}</textarea>
        <div class="actions"><button class="btn primary" data-act="ai-parse">讀取並預覽</button>
          <label class="btn" for="ai-file">上傳檔案<input type="file" accept=".json,.txt,.md,application/json,text/plain" id="ai-file" data-import="1" hidden></label>
          <button class="btn ghost" data-act="ai-sample">載入範例回覆</button></div>
        ${result}
      </div></li>
    </ol>
  </section>`;
}

function extractJSON(text) {
  const t = text.trim(), tries = [t];
  const fences = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]).reverse();
  tries.push(...fences);
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a > -1 && b > a) tries.push(t.slice(a, b + 1));
  let first = null;
  for (const s of tries) {
    for (const v of [s, s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')]) {
      try { const o = JSON.parse(v); if (o && typeof o === 'object' && !Array.isArray(o)) { if (o.days || o.trip) return o; first = first || o; } } catch (e) {}
    }
  }
  return first;
}

function normalize(o) {
  const errors = [], warns = [];
  const str = v => typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const num = v => typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);
  const int = (v, lo, hi, dflt) => { const n = num(v); return n === null ? dflt : Math.min(hi, Math.max(lo, Math.round(n))); };
  const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(D(s));
  const tr = o.trip && typeof o.trip === 'object' ? o.trip : o;
  const daysIn = Array.isArray(o.days) ? o.days : Array.isArray(tr.days) ? tr.days : null;
  const dest = str(tr.destination);
  if (!dest) errors.push('找不到目的地（trip.destination）。');
  if (!daysIn || !daysIn.length) errors.push('找不到每日行程（days）。');
  if (errors.length) return { errors };
  let center = num(tr.lat) !== null && num(tr.lng) !== null ? { lat: num(tr.lat), lng: num(tr.lng) } : null;
  let badCat = 0, noLoc = 0, far = 0, skipped = 0, badTime = 0;
  const loc = s => {
    const lat = num(s.lat), lng = num(s.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return [null, null, 'none'];
    if (center && km(center, { lat, lng }) > 300) return [null, null, 'far'];
    return [lat, lng, 'ok'];
  };
  const cat = c => CATS.includes(c) ? c : (badCat++, '其他');
  const days = [];
  daysIn.forEach((d, i) => {
    if (!d || !okDate(d.date)) { errors.push(`第 ${i + 1} 天缺少日期，或日期格式不是 YYYY-MM-DD。`); return; }
    const spots = [];
    (Array.isArray(d.spots) ? d.spots : []).forEach(s => {
      if (!s || !str(s.name)) { skipped++; return; }
      const [lat, lng, st] = loc(s);
      if (st === 'none') noLoc++; if (st === 'far') far++;
      let time = str(s.time); const m = time.match(/^(\d{1,2}):(\d{2})/);
      if (m && +m[1] < 24) time = `${m[1].padStart(2, '0')}:${m[2]}`; else { if (time) badTime++; time = ''; }
      spots.push({ id: uid(), time, name: str(s.name), desc: str(s.desc), note: str(s.note), category: cat(s.category), dur: int(s.dur, 15, 720, 60), cost: int(s.cost, 0, 1e7, 0), lat, lng, img: '' });
    });
    days.push({ date: d.date, theme: str(d.theme), spots });
  });
  if (errors.length) return { errors };
  if (days.length > 30) return { errors: ['行程超過 30 天，網頁目前最多支援 30 天。'] };
  days.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  for (let i = 1; i < days.length; i++) if (diffDays(days[i - 1].date, days[i].date) !== 1) { warns.push('每日行程的日期不連續，已依日期排序後匯入。'); break; }
  if (!center) {
    const pts = days.flatMap(d => d.spots).filter(located);
    if (pts.length) center = { lat: pts.reduce((a, s) => a + s.lat, 0) / pts.length, lng: pts.reduce((a, s) => a + s.lng, 0) / pts.length };
  }
  const recs = (Array.isArray(o.recommendations) ? o.recommendations : []).filter(r => r && str(r.name)).slice(0, 20).map(r => {
    const [lat, lng] = loc(r);
    return { id: 'r' + uid(), name: str(r.name), type: ['經典必去', '特色探索', '彈性選擇'].includes(r.type) ? r.type : '', area: str(r.area), category: cat(r.category), desc: str(r.desc), dur: int(r.dur, 15, 720, 60), cost: int(r.cost, 0, 1e7, 0), lat, lng };
  });
  const b = o.budget && typeof o.budget === 'object' ? o.budget : {};
  const expenses = (Array.isArray(b.items) ? b.items : []).filter(x => x && str(x.name) && num(x.amount) !== null)
    .map(x => ({ id: uid(), name: str(x.name), category: cat(x.category), amount: int(x.amount, 0, 1e8, 0), basis: str(x.basis) }));
  let checklist = (Array.isArray(o.checklist) ? o.checklist : []).map(x => typeof x === 'string' ? { text: x } : x).filter(x => x && str(x.text))
    .map(x => ({ id: uid(), group: GROUPS.includes(x.group) ? x.group : '其他', text: str(x.text), done: false }));
  if (!checklist.length) { checklist = defaultChecklist(false); warns.push('AI 沒有提供行前清單，已改用預設的攜帶物品清單。'); }
  const pending = (Array.isArray(o.pending) ? o.pending : []).map(x => str(x && typeof x === 'object' ? x.text : x)).filter(Boolean).map(text => ({ id: uid(), text, done: false }));
  const sources = (Array.isArray(o.sources) ? o.sources : []).filter(s => s && /^https?:\/\//.test(str(s.url))).map(s => ({ title: str(s.title), url: str(s.url) }));
  if (noLoc + far) warns.push(`${noLoc + far} 個景點沒有可靠的座標${far ? `（其中 ${far} 個離目的地超過 300 公里，判斷為錯誤）` : ''}，會標示「位置待確認」，暫不顯示在地圖上。`);
  if (badCat) warns.push(`${badCat} 個項目的類別不在清單中，已歸到「其他」。`);
  if (badTime) warns.push(`${badTime} 個時間格式無法辨識，已留空。`);
  if (skipped) warns.push(`略過 ${skipped} 個沒有名稱的景點。`);
  if (!recs.length) warns.push('AI 沒有提供推薦景點，推薦頁會是空的。');
  const trip = {
    name: str(tr.name) || `${dest} ${days.length} 日`, destination: dest,
    lat: center ? +center.lat.toFixed(4) : null, lng: center ? +center.lng.toFixed(4) : null,
    startDate: days[0].date, endDate: days[days.length - 1].date, days,
    budget: { cap: int(b.cap, 0, 1e8, 0), cats: {} }, expenses, checklist, recs, pending, sources
  };
  return { trip, warns };
}

function runParse() {
  ui.preview = ui.aiErrors = null;
  const text = (ui.aiText || '').trim();
  if (!text) { ui.aiErrors = ['還沒有貼上任何內容。']; return; }
  const o = extractJSON(text);
  if (!o) { ui.aiErrors = ['找不到可以讀取的 JSON。請確認 AI 的回覆最後有一段 ```json 開頭的程式碼區塊，而且內容完整、沒有被截斷。']; return; }
  const r = normalize(o);
  if (r.errors) ui.aiErrors = r.errors; else ui.preview = r;
}

/* A demo AI reply for the Okinawa example. Not researched: for trying the import only. */
function sampleReply() {
  const S = (time, name, desc, note, category, dur, cost, lat, lng) => ({ time, name, desc, note, category, dur, cost, lat, lng });
  const R = (name, type, area, category, desc, dur, cost, lat, lng) => ({ name, type, area, category, desc, dur, cost, lat, lng });
  const days = [
    ['2027-01-10', '抵達那霸・國際通', [
      S('14:00', '那霸機場', '抵達後辦理入境、領取行李', '入境與領行李預留約 1 小時', '交通', 60, 0, 26.2063, 127.6513),
      S('15:30', '搭單軌電車到飯店', '搭單軌電車進市區，先寄放行李', '可以使用交通 IC 卡', '交通', 45, 300, 26.2133, 127.6745),
      S('17:00', '國際通', '那霸最熱鬧的購物大街，伴手禮店集中', '傍晚以後比較熱鬧', '其他', 90, 0, 26.215, 127.6869),
      S('19:00', '第一牧志公設市場', '一樓挑海鮮，二樓請店家代為料理', '代客料理的加工費出發前待確認', '餐飲', 90, 2000, 26.214, 127.69)]],
    ['2027-01-11', '首里與那霸市區', [
      S('09:30', '首里城公園', '琉球王國的王城，可以參觀復原工程', '正殿復原期間的開放範圍待確認', '門票', 120, 200, 26.217, 127.7195),
      S('12:00', '首里沖繩麵午餐', '品嘗湯頭清爽的沖繩麵', '', '餐飲', 60, 600, null, null),
      S('14:00', '波上宮', '建在海邊斷崖上的神社', '', '門票', 45, 0, 26.2215, 127.6716),
      S('16:00', '瀨長島 Umikaji Terrace', '白色建築群面向大海，適合看夕陽', '', '其他', 120, 600, 26.1754, 127.643)]],
    ['2027-01-12', '北部：海洋博公園一帶', [
      S('08:30', '租車取車', '取車後沿高速公路北上', '需攜帶台灣駕照正本與日文譯本', '交通', 30, 0, 26.21, 127.68),
      S('11:00', '沖繩美麗海水族館', '大型水槽「黑潮之海」可以看到鯨鯊', '門票可事先購買', '門票', 150, 950, 26.6943, 127.8779),
      S('14:30', '備瀨福木林道', '福木樹形成的綠色隧道，盡頭就是海', '', '其他', 60, 0, 26.705, 127.879),
      S('16:30', '古宇利大橋', '跨海大橋兩側都是透明的藍色海水', '', '其他', 60, 0, 26.6915, 128.0133)]],
    ['2027-01-13', '北部：古城與西海岸', [
      S('09:30', '今歸仁城跡', '世界遺產，綿延的石牆沿著山丘起伏', '', '門票', 75, 130, 26.6913, 127.929),
      S('11:30', '名護鳳梨園', '搭電動車參觀鳳梨園，可試吃鳳梨甜點', '', '門票', 90, 560, 26.626, 127.972),
      S('14:30', '萬座毛', '形狀像象鼻的海蝕斷崖', '', '門票', 45, 40, 26.5047, 127.8505),
      S('16:30', '真榮田岬', '青之洞窟所在的海岬，觀景台可俯瞰海面', '', '其他', 45, 0, 26.444, 127.772)]],
    ['2027-01-14', '中部：海岬與美國村', [
      S('10:00', '殘波岬', '白色燈塔與綿延的斷崖海岸', '', '其他', 60, 0, 26.44, 127.714),
      S('12:30', '美國村', '美式風格的商店與餐廳，午餐吃塔可飯', '', '購物', 180, 2600, 26.3156, 127.757),
      S('16:30', '永旺夢樂城沖繩來客夢', '大型購物中心，適合一次採買', '', '購物', 150, 2000, 26.3141, 127.7956)]],
    ['2027-01-15', '南部：聖地與海岸', [
      S('09:30', '齋場御嶽', '琉球最重要的聖地之一，林間石徑很有氣氛', '', '門票', 75, 120, 26.1734, 127.827),
      S('11:30', '知念岬公園', '突出海面的岬角，視野開闊', '', '其他', 45, 0, 26.166, 127.832),
      S('12:30', '奧武島', '小島上的天婦羅店，現炸現吃', '', '餐飲', 60, 300, 26.13, 127.77),
      S('14:30', '沖繩世界・玉泉洞', '大型鐘乳石洞，園區內還有琉球傳統表演', '表演時間待確認', '門票', 150, 700, 26.1405, 127.7486),
      S('18:00', '還車', '回到那霸還車', '還車前記得加滿油', '交通', 30, 0, 26.21, 127.68)]],
    ['2027-01-16', '返程', [
      S('09:00', '退房寄放行李', '退房後把行李寄放在飯店櫃台', '', '住宿', 30, 0, 26.2133, 127.6745),
      S('10:00', '國際通伴手禮', '最後採買紅芋塔、黑糖等伴手禮', '', '購物', 90, 2000, 26.215, 127.6869),
      S('12:30', '前往那霸機場', '搭單軌電車到機場，預留報到與安檢時間', '建議起飛前 2 小時抵達機場', '交通', 90, 300, 26.2063, 127.6513)]]
  ];
  const obj = {
    format: 'voyage-trip/1',
    trip: { name: '沖繩海島七日', destination: '沖繩', lat: 26.33, lng: 127.8, startDate: '2027-01-10', endDate: '2027-01-16' },
    days: days.map(([date, theme, spots]) => ({ date, theme, spots })),
    recommendations: [
      R('首里金城町石疊道', '特色探索', '首里', '其他', '琉球石灰岩鋪成的古道，兩旁是老宅與石牆', 45, 0, 26.215, 127.717),
      R('識名園', '特色探索', '那霸', '門票', '琉球王家的別邸庭園，繞著池塘散步', 60, 200, 26.205, 127.713),
      R('沖繩縣立博物館・美術館', '彈性選擇', '那霸新都心', '門票', '一次認識沖繩的自然與歷史，適合當雨天備案', 120, 250, 26.227, 127.695),
      R('北谷日落海灘', '經典必去', '北谷', '其他', '美國村旁的海灘，傍晚可以看夕陽', 45, 0, 26.316, 127.753),
      R('部瀨名海中公園', '特色探索', '名護', '門票', '走進海中展望塔，隔著玻璃看珊瑚礁', 60, 700, 26.629, 128.004),
      R('大石林山', '特色探索', '國頭', '門票', '石灰岩奇石林立的步道', 90, 500, 26.854, 128.255),
      R('邊戶岬', '彈性選擇', '國頭', '其他', '本島最北端的岬角，海景壯闊', 30, 0, 26.871, 128.265),
      R('座喜味城跡', '彈性選擇', '讀谷', '門票', '曲線優美的城牆，世界遺產之一', 45, 0, 26.399, 127.744),
      R('新原海灘', '彈性選擇', '南城', '其他', '南部安靜的天然海灘，可以搭玻璃船', 60, 0, 26.131, 127.79),
      R('東南植物樂園', '特色探索', '沖繩市', '門票', '熱帶植物園，冬季有夜間燈光活動（待確認）', 120, 800, 26.353, 127.832)],
    budget: { cap: 70000, items: [
      { name: '台北—沖繩來回機票 2 人', category: '交通', amount: 16000, basis: '公開參考價格（範例）' },
      { name: '那霸市區飯店 6 晚', category: '住宿', amount: 18000, basis: '推估（範例）' },
      { name: '租車 4 天含保險', category: '交通', amount: 7000, basis: '推估（範例）' },
      { name: '油錢與停車', category: '交通', amount: 1500, basis: '推估（範例）' },
      { name: '網卡 2 張', category: '其他', amount: 700, basis: '推估（範例）' },
      { name: '旅遊平安險', category: '其他', amount: 1000, basis: '推估（範例）' },
      { name: '備用金', category: '其他', amount: 3000, basis: '推估（範例）' }] },
    checklist: [
      ['證件與金錢', '護照'], ['證件與金錢', '台灣駕照正本'], ['證件與金錢', '駕照日文譯本'], ['證件與金錢', '信用卡'], ['證件與金錢', '日圓現金'],
      ['電子用品', '手機與充電線'], ['電子用品', '行動電源'], ['電子用品', '網卡或 eSIM'], ['電子用品', '車用手機架'],
      ['衣物', '換洗衣物 7 天'], ['衣物', '薄外套與長袖'], ['衣物', '好走的鞋'],
      ['盥洗與藥品', '牙刷牙膏'], ['盥洗與藥品', '防曬乳'], ['盥洗與藥品', '常備藥'], ['盥洗與藥品', '暈車藥'],
      ['其他', '摺疊傘'], ['其他', '環保購物袋']].map(([group, text]) => ({ group, text })),
    pending: ['首里城正殿復原期間的開放範圍與門票', '美麗海水族館 1 月的營業時間', '租車公司的取還車時間與地點', '第一牧志公設市場代客料理的費用'],
    sources: [{ title: '沖繩美麗海水族館官方網站', url: 'https://churaumi.okinawa/' }, { title: '首里城公園官方網站', url: 'https://oki-park.jp/shurijo/' }]
  };
  return `（這是示範用的 AI 回覆，內容沒有經過查證，只用來試用匯入功能。）\n\n${FENCE}json\n${JSON.stringify(obj, null, 2)}\n${FENCE}`;
}

