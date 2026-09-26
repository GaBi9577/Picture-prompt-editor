# 繪圖提示詞編輯器 — 交接文件 (Handoff)

## 這份文件的用途
新的對話開始時，請先讀這份文件，再讀規格書 `prompt_editer_design_v2.md`，即可完整掌握現況。

---

## 目前版本狀態

**完成度：約 85%，核心功能皆已實作並可運行。**

使用者的電腦上已有一份能正常跑起來的版本（透過 `npm install && npm start`），並且正在使用。每次對話結束，Claude 會輸出一份新的 `prompt-editor.tar.gz` 讓使用者覆蓋舊版。

---

## 技術架構

| 項目 | 選型 |
|------|------|
| 桌面框架 | Electron |
| 前端 | React + htm（UMD，無打包工具） |
| IPC | Electron contextBridge + ipcMain/ipcRenderer |
| 雲端 LLM | Google Gemini API (`gemini-3.6-flash`)，Key 存於獨立檔 `apikey.local.txt` |
| 儲存 | 本機 JSON 檔（userData 目錄） |

**不使用 JSX / Webpack / Vite 等打包工具**，React 與 htm 皆以 UMD script tag 引入，直接跑在 Electron 的 BrowserWindow。

---

## 專案檔案結構

```
prompt-editor/
├── package.json        # 含 electron-builder 設定（尚未正式打包）
├── apikey.local.txt    # Gemini API Key（獨立檔案！打包時務必排除，見下方打包指令）
├── main.js             # Electron 主行程：檔案 IO、詞庫、Gemini、暫存
├── preload.js          # contextBridge → window.api
├── start.bat            # 雙擊啟動（npm start）
└── src/
    ├── index.html      # 載入 UMD 依賴與 app.js
    ├── constants.js    # BLOCKS 定義（9 個編輯區塊）
    ├── styles.css      # 深色主題 + 半透明玻璃風格
    └── app.js          # 所有 React 元件（htm 語法）
```

---

## 資料儲存

| 檔案 | 位置 | 說明 |
|------|------|------|
| 詞庫 | `userData/presets.json` | 全域共用，含備份 `.bak` |
| 設定 | `userData/settings.json` | 背景漸層色、Gemini 模型名稱 |
| 暫存 | `<專案路徑>.draft.json` | Crash recovery，非正式存檔 |
| 新專案暫存 | `userData/unsaved.draft.json` | 尚未存檔的新專案 |

所有寫入都是**原子寫入**（先寫 `.tmp` 再 rename）。

---

## 已實作功能

### 介面
- [x] 全域操作列（新增/開啟/匯入/Save/Save as/設定，全部改為 SVG icon-only 按鈕）
- [x] 頂部 Tab 切換：編輯器 / Gallery
- [x] 左側詞庫面板（依區塊分類，支援插入/編輯/刪除）
- [x] 9 個主編輯區塊，支援中英混合輸入
- [x] Negative Prompt 獨立欄位（不參與主要 flat 輸出/標籤化 prompt，有自己的複製按鈕）
- [x] Gallery 頁面：拖曳上傳 + 點擊選檔（可多選），縮圖網格、放大預覽、刪除、在檔案總管中開啟所在資料夾；圖片複製進 `userData/gallery/`，metadata 存 `userData/gallery.json`
- [x] 整合輸出區（即時 flat 逗號預覽 + 一鍵複製）
- [x] 生成英文 Prompt 按鈕（呼叫 Google Gemini API，Key 存於 `apikey.local.txt`）
- [x] 取消生成按鈕 + 2 分鐘 timeout
- [x] 設定面板（背景漸層上/下色、Gemini 模型名稱）

### 資料安全
- [x] Crash recovery 暫存（onChange debounce 800ms）
- [x] 開啟/新增前若有未儲存變更，跳出確認對話框
- [x] 詞庫原子寫入 + 自動備份 `.bak`，讀取失敗時自動從備份還原
- [x] 孤兒暫存檔清理
- [x] 所有 IPC 錯誤有 try/catch，顯示 Toast 通知

### UX
- [x] 目前作用中區塊高亮（藍色邊框）
- [x] Toolbar 只顯示檔名，Hover 顯示完整路徑
- [x] 視窗標題顯示檔名 + `*`（未儲存）
- [x] 鍵盤快捷鍵：Ctrl+S / Ctrl+Shift+S / Ctrl+O
- [x] 存檔成功 Toast（綠色）/ 錯誤 Toast（紅色）
- [x] Gemini 錯誤訊息友善化（Key 無效／模型不存在／超過免費額度）
- [x] LLM 輸出後處理（清除常見多餘前綴與引號）
- [x] 半透明玻璃風格 UI
- [x] 字體：微軟正黑體（中英文皆使用，無襯線風格）
- [x] 所有按鈕使用向量 SVG line-art 圖示（無 emoji）

---

## 尚未完成 / 已知可改進項目

### 較高優先
- [ ] `electron-builder` 正式打包成 `.exe`（使用者說等功能穩定後再做，到時候需要完整指導）
- [ ] `.tmp` 殘檔無清理機制（程式異常退出後會留著，不影響功能，只佔空間）

### 中優先
- [ ] 詞庫沒有搜尋/篩選功能（詞庫增大後會需要）
- [ ] 支援更多輸出格式（目前只有 flat 逗號，未來可能需要其他格式）

### 低優先 / 美觀
- [ ] Toast 目前只有 error/success 兩種，可再擴充
- [ ] 標楷體在 macOS/Linux 可能 fallback，跨平台字體未處理

---

## 規格書位置

`prompt_editer_design_v2.md` 是本次對話中整理完成的最終版規格書，與目前實作一致，可直接參考。

---

## 工作流程（給下一個 Claude）

1. 使用者可能帶著新需求、bug 回報、或視覺調整來找你
2. **視覺調整**：先做 artifact UI preview（`prompt_editor_ui_preview.jsx`），確認後再同步到 `src/app.js` 與 `src/styles.css`
3. **功能/邏輯修改**：直接改 `main.js`、`preload.js`、`src/app.js`
4. 修改完後：`node --check` 語法檢查，再打包成 `prompt-editor.tar.gz` 輸出
5. 使用者本機已有 `node_modules`，解壓覆蓋後**不需要重新 `npm install`**（除非 `package.json` 新增依賴）

---

## 打包指令備忘

```bash
# 語法檢查
node --check src/app.js && node --check main.js && node --check preload.js

# 打包（排除 electron 二進位 + 使用者本機的 API Key 檔，避免覆蓋）
tar --exclude='node_modules/electron' --exclude='apikey.local.txt' -czf prompt-editor.tar.gz prompt-editor
```
