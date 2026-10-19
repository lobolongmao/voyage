/* 旅誌 Voyage：預算上限、提醒與花費明細。 */
/* ---------- budget ---------- */
function spend() {
  const t = T(), rows = [];
  t.days.forEach((d, i) => d.spots.forEach(s => { if (+s.cost > 0) rows.push({ src: 'spot', day: i, id: s.id, name: s.name, category: s.category, amount: +s.cost }); }));
  t.expenses.forEach(e => rows.push({ src: 'manual', id: e.id, name: e.name, category: e.category, amount: +e.amount || 0, basis: e.basis || '' }));
  const byCat = Object.fromEntries(CATS.map(c => [c, 0]));
  rows.forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; });
  return { rows, total: rows.reduce((a, r) => a + r.amount, 0), byCat };
}
const status = (spent, cap) => !cap ? 'none' : spent > cap ? 'over' : spent >= cap * .9 ? 'near' : 'ok';
/* Run a change, then warn if it pushed the trip or a category past its limit. */
function budgetCheck(fn) {
  const b = T().budget, before = spend();
  fn();
  const after = spend();
  if (after.total <= before.total) return;
  const s0 = status(before.total, b.cap), s1 = status(after.total, b.cap);
  if (s1 === 'over' && s0 !== 'over') return toast(`已超過總預算上限 ${money(b.cap)}，目前花費 ${money(after.total)}`, 'over');
  if (s1 === 'over') return toast(`仍然超出預算 ${money(after.total - b.cap)}`, 'over');
  const cat = CATS.find(c => b.cats[c] && after.byCat[c] > b.cats[c] && before.byCat[c] <= b.cats[c]);
  if (cat) return toast(`「${cat}」已超過分類上限 ${money(b.cats[cat])}`, 'warn');
  if (s1 === 'near' && s0 === 'ok') toast(`花費已達預算的 ${Math.round(after.total / b.cap * 100)}%，快到上限了`, 'warn');
}

function budgetHTML() {
  const t = T(), b = t.budget, sp = spend(), st = status(sp.total, b.cap);
  const pct = b.cap ? Math.min(100, sp.total / b.cap * 100) : 0;
  const left = b.cap - sp.total;
  const alert = st === 'over' ? `<div class="alert over"><b>已超出預算 ${money(-left)}。</b>可以調低行程中的預估花費，或提高預算上限。</div>`
    : st === 'near' ? `<div class="alert near"><b>花費已達預算的 ${Math.round(sp.total / b.cap * 100)}%。</b>再新增花費前請留意剩餘金額。</div>` : '';
  const catOver = CATS.filter(c => b.cats[c] && sp.byCat[c] > b.cats[c]);
  const catAlert = catOver.length ? `<div class="alert near"><b>${catOver.join('、')}</b> 已超過分類上限。</div>` : '';
  const groups = CATS.map(c => [c, sp.rows.filter(r => r.category === c)]);
  return `<section class="b-sec" aria-label="預算上限">
      <div class="sec-head"><div><h2>預算上限</h2><p>設定這趟旅程最多能花多少錢。下方花費明細的金額都會計入，超過上限時會提醒你。</p></div></div>
      ${alert}${catAlert}
      <div class="cap-summary">
        <div><span class="label">已計入花費</span><div class="big small-u"><small>NT$</small>${Math.round(sp.total).toLocaleString('en-US')}</div></div>
        <div><label class="label" for="cap">總預算上限</label><div class="cap-input"><span>NT$</span><input class="field" type="number" min="0" step="500" id="cap" value="${b.cap || ''}" placeholder="未設定"></div></div>
        <div><span class="label">${left >= 0 ? '剩餘可花' : '超出'}</span><div class="big small-u ${left < 0 ? 'neg' : ''}"><small>NT$</small>${b.cap ? Math.abs(Math.round(left)).toLocaleString('en-US') : '—'}</div></div>
      </div>
      <div class="meter" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="預算使用率"><div class="fill ${st}" style="width:${pct}%"></div></div>
      <div class="meter-cap"><span>0</span><span>${b.cap ? `${Math.round(sp.total / b.cap * 100)}% 已使用` : '設定上限後顯示使用率'}</span><span>${b.cap ? money(b.cap) : ''}</span></div>
      <div class="table-scroll"><table class="cat-table">
        <thead><tr><th>類別</th><th class="num-c">已花</th><th class="num-c">分類上限（選填）</th><th>使用率</th></tr></thead>
        <tbody>${CATS.map(c => {
          const cap = b.cats[c] || 0, s2 = status(sp.byCat[c], cap), p = cap ? Math.min(100, sp.byCat[c] / cap * 100) : 0;
          return `<tr><td>${c}</td><td class="num-c">${money(sp.byCat[c])}</td>
            <td class="num-c"><input class="field" type="number" min="0" step="500" id="capcat-${c}" data-capcat="${c}" value="${cap || ''}" placeholder="不限" aria-label="${c}上限"></td>
            <td><div class="mini"><div class="meter"><div class="fill ${s2}" style="width:${p}%"></div></div><span class="pill ${s2}">${{ ok: '正常', near: '接近', over: '超過', none: '未設' }[s2]}</span></div></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
    <section class="b-sec" aria-label="花費明細">
      <div class="sec-head"><div><h2>花費明細</h2><p>行程中每個景點的預估花費會自動列入；機票、住宿這類不在行程卡片上的支出，可以在下方記帳。</p></div></div>
      <div class="ledger">${groups.map(([c, rows]) => `
        <div class="ledger-group"><h3>${c}<span>${money(sp.byCat[c])}</span></h3>
          <ul>${rows.length ? rows.map(r => `<li><span>${esc(r.name)}<span class="src">${r.src === 'spot' ? `行程 · Day ${r.day + 1}` : r.basis ? esc(r.basis) : '手動記帳'}</span></span><span>${money(r.amount)}</span>
            ${r.src === 'manual' ? `<button class="icon-btn x" data-act="exp-del" data-id="${r.id}" aria-label="刪除 ${esc(r.name)}">×</button>` : '<span></span>'}</li>`).join('')
            : '<li class="empty">尚無花費</li>'}</ul></div>`).join('')}</div>
      <form class="ledger-form" id="exp-form">
        <label class="lbl-field">項目<input class="field" name="name" id="exp-name" placeholder="例如：住宿押金" required></label>
        <label class="lbl-field">類別<select class="field" name="category" id="exp-cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
        <label class="lbl-field">金額（NT$）<input class="field" type="number" min="0" step="1" name="amount" id="exp-amt" required></label>
        <button class="btn primary" type="submit">記一筆</button>
      </form>
    </section>`;
}

