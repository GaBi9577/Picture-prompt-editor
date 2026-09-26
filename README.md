# 繪圖提示詞編輯器 (Prompt Editor)

依照 `prompt_editer_design_v2.md` 規格實作的 Electron + React 桌面應用。

## 安裝與啟動

```bash
npm install
npm start
```

> 注意：本開發環境網路限制無法下載 Electron 執行檔，
> 請在你自己的電腦上執行 `npm install` 完成完整安裝。

## 使用前準備：Google Gemini API

「生成英文 Prompt」功能會呼叫 Google Gemini API（預設模型
`gemini-3.6-flash`，有免費額度）。

1. 至 [Google AI Studio](https://aistudio.google.com/apikey) 免費取得 API Key
2. 開啟專案根目錄的 `apikey.local.txt`，將 Key 貼在說明行下方
3. 儲存即可，不需重啟應用程式（下次呼叫時會重新讀檔）

`apikey.local.txt` 是獨立檔案，**每次專案更新覆蓋時都會被排除**，
所以 Key 不會遺失（打包指令見 `HANDOFF.md`）。

若尚未設定 Key，按下「生成英文 Prompt」會顯示錯誤提示，
不影響其他功能（即時中英混合預覽、存檔、詞庫等皆可正常使用）。

## 功能對照規格書

| 規格項目 | 對應實作 |
| --- | --- |
| 2.1 全域操作列 | `src/app.js` `Toolbar`，IPC handler 於 `main.js` |
| 2.2 詞庫面板 | `PresetPanel`、`PresetItem`，全域共用，存於 userData/presets.json |
| 2.3 主編輯區 | `EditorBlock`，8 個區塊定義於 `src/constants.js` |
| 2.3 新增至詞庫 | `PresetSaveModal`（縮寫概述 / 英文內容 / 註解） |
| 2.4 整合輸出區 | `OutputPanel`，即時預覽 + 「生成英文 Prompt」按鈕 |
| 3.1 暫存與復原提示 | `autosave:write` / `autosave:checkUnsaved`，開檔與啟動時跳出復原確認 |
| 3.2 詞庫資料結構 | `{ [區塊key]: [{ id, name, english, note }] }` |
| 4. 全英文 Prompt | 透過 Google Gemini API，保留英文、翻譯中文 |

## 專案結構

```
prompt-editor/
├── package.json
├── apikey.local.txt  # Gemini API Key（獨立檔案，更新時不會被覆蓋）
├── main.js            # Electron 主行程：檔案 IO、暫存、詞庫、Gemini
├── preload.js         # contextBridge 暴露 window.api
└── src/
    ├── index.html
    ├── styles.css
    ├── constants.js  # 區塊定義 (對應規格 2.3 / 3.2)
    └── app.js         # React (htm，無需打包工具)
```

## 已知簡化 / 待確認事項

* 專案存檔格式為 `.json`（內含 `{ blocks: {...} }`），非純 Markdown，
  以符合規格 3.1「需包含介面所有輸入狀態以便完全還原」。
* 區塊間以英文逗號 `, ` 拼接做為即時預覽。
* Gemini 連線失敗或 Key 未設定時僅顯示錯誤訊息，不影響其餘功能。
