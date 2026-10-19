/* 旅誌 Voyage：景點照片。依景點名稱向維基百科查詢代表圖片（免費、不需金鑰）。
   使用者自己上傳的照片（img）優先；找不到照片時顯示類別插圖。 */
const PHOTO_SKIP = ['交通', '住宿'];          // 搭車、退房這類項目不找照片
let photoBusy = false;

/* 兩個名稱之間最長的共同字串長度，用來確認搜尋結果真的是這個景點 */
function commonLen(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (a[i + k] && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  return best;
}
const plainName = s => s.replace(/[（(][^）)]*[）)]/g, '').replace(/[\s・·]/g, '');

async function findPhoto(name, destination) {
  const q = encodeURIComponent(`${name} ${destination}`.trim());
  const url = `https://zh.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${q}&gsrlimit=3`
    + '&prop=pageimages|info&piprop=thumbnail&pithumbsize=720&inprop=varianttitles|url';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const target = plainName(name);
  for (const p of pages) {
    if (!p.thumbnail?.source) continue;
    const titles = [p.title, ...Object.values(p.varianttitles || {})].map(plainName);
    const need = Math.min(2, target.length);
    if (titles.some(t => commonLen(t, target) >= need)) return { photo: p.thumbnail.source, photoPage: p.fullurl || '' };
  }
  return null;
}

/* 找出還沒查過照片的景點與推薦，四個一組平行查詢，查完再更新畫面。 */
async function fetchPhotos() {
  const t = T();
  if (!t || photoBusy || typeof fetch !== 'function') return;
  const items = [...t.days.flatMap(d => d.spots), ...t.recs]
    .filter(x => !x.photoTried && !x.img && x.name && !PHOTO_SKIP.includes(x.category));
  if (!items.length) return;
  photoBusy = true;
  let found = 0;
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const x = queue.shift();
      try {
        const hit = await findPhoto(x.name, t.destination);
        if (hit) { Object.assign(x, hit); found++; }
        x.photoTried = true;
      } catch (e) { /* 網路錯誤時下次重新整理再試 */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  photoBusy = false;
  save();
  if (found && T() === t && !ui.editing && !ui.adding && !ui.themeEdit && !ui.itemEdit && ui.view !== 'ai') render();
}

/* 卡片縮圖：上傳的照片 > 維基百科照片 > 類別插圖（圖片載入失敗時會露出插圖） */
function photoThumb(x, label) {
  const src = x.img || x.photo;
  return illus(x.category, label) + (src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
}
function photoCredit(x) {
  return !x.img && x.photo ? `<p class="photo-credit">照片來源：<a href="${esc(x.photoPage || 'https://zh.wikipedia.org/')}" target="_blank" rel="noopener">維基百科</a></p>` : '';
}
