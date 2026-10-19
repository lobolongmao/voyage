# 旅誌 Voyage

讓 AI 幫你規劃看看吧！

旅誌 Voyage 是一個文青雜誌風的旅遊行程規劃板。先填寫旅遊條件，網頁會組出一份提示詞；把它交給你自己的 AI（ChatGPT、Claude、Gemini 等）跑出行程，再把回覆貼回網頁，就能自由拖曳、編輯、記帳與勾選清單。

**網站連結：** `https://<你的 GitHub 帳號>.github.io/<儲存庫名稱>/`（發布後請換成實際網址）

## 使用方式

1. **寫下條件**：在「AI 規劃」頁用選單填寫目的地、日期、人數、興趣、預算等條件，按「確認條件，產生提示詞」。
2. **確認提示詞**：檢查帶入的條件，調整推薦數量、每天景點上限、補充要求，按「複製提示詞」。
3. **交給 AI**：貼到有開啟網路搜尋的 AI，等它回傳一段 JSON。
4. **匯入成冊**：把 AI 的回覆整段貼回網頁（或上傳檔案），確認預覽後匯入。行程、推薦、預算、清單四個分頁會跟著解鎖。

還沒跑 AI 也可以先試用：在第三步按「載入範例回覆」，會匯入一份沖繩七日的示範行程（內容未經查證，只供測試）。

## 功能

| 頁面 | 功能 |
| --- | --- |
| AI 規劃 | 條件表單（選單、複選標籤、時間選擇器）、分段提示詞、可調整設定、貼上或上傳 AI 回覆並預覽匯入 |
| 行程 | 分天的圖文景點卡片、卡片上直接編輯、拖曳換順序或換天、每日主題、上傳照片、真實地圖與天氣 |
| 推薦 | AI 列出的推薦景點，一鍵加入行程並依距離自動重排路線 |
| 預算 | 總預算與分類上限、90% 與超支提醒、行程花費自動列入、手動記帳 |
| 清單 | AI 依目的地產生的攜帶物品、出發前待確認事項、資料來源 |

## 檔案結構

```
/
├── index.html      # 網頁主體
├── style.css       # 樣式（文青雜誌風，含深色模式）
├── ai.js           # 條件表單、提示詞組合、讀取與檢查 AI 回覆
├── weather.js      # 天氣（Open-Meteo）
├── map.js          # 地圖（Leaflet + OpenStreetMap）
├── budget.js       # 預算上限、提醒與花費明細
├── photos.js       # 依景點名稱從維基百科抓取照片
├── app.js          # 主要邏輯：分頁、行程、拖曳、編輯、存檔、照片
└── README.md
```

`app.js` 必須最後載入，`index.html` 已經依正確順序引入。

## 發布到 GitHub Pages

1. 在 GitHub 建立一個新的公開儲存庫（public repository），例如 `voyage`。
2. 在儲存庫頁面按 **Add file → Upload files**，把這個資料夾裡的所有檔案拖進去，按 **Commit changes**。`index.html` 要放在最外層，不要包在子資料夾裡。
3. 到 **Settings → Pages**，在 **Build and deployment** 的 Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 **Save**。
4. 等一兩分鐘，頁面上方會出現網站網址。把網址填回本檔案最上方的「網站連結」。

## 在自己的電腦上測試

直接雙擊 `index.html` 可以打開，但 OpenStreetMap 不允許直接從檔案載入地圖，這時地圖會改成簡易示意圖。想在自己電腦上看到真實地圖，請改用本機伺服器：

```
python3 -m http.server 8000
```

再用瀏覽器打開 `http://localhost:8000`。

## 技術說明

- 純前端（HTML、CSS、原生 JavaScript），不需要後端伺服器、資料庫或 API 金鑰。
- 網頁本身不呼叫 AI；行程由使用者自己的 AI 帳號產生，網頁只負責組提示詞與讀取回覆。
- 資料存在瀏覽器的 localStorage，只在這台電腦、這個瀏覽器裡。清除瀏覽資料或換裝置時資料會消失。
- 匯入時會自動找出回覆中的 JSON、修正常見格式錯誤；座標缺漏或明顯錯誤的景點會標示「位置待確認」，可以用卡片上的「編輯」補上座標。

## 使用的服務與授權

- 地圖：[Leaflet](https://leafletjs.com/)，地圖資料 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 貢獻者
- 景點照片：[維基百科](https://zh.wikipedia.org/)（每張照片在卡片展開後都附有來源連結）
- 天氣：[Open-Meteo](https://open-meteo.com/)（非商業用途免費）
- 拖曳排序：[SortableJS](https://sortablejs.github.io/Sortable/)
- 字體：Noto Serif TC、Noto Sans TC（Google Fonts）

行程內容來自 AI，營業時間、票價與交通資訊出發前請再自行確認。
