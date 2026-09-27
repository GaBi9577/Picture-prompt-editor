const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const PRESETS_PATH  = path.join(app.getPath('userData'), 'presets.json');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const UNSAVED_DRAFT = path.join(app.getPath('userData'), 'unsaved.draft.json');

// API Key 獨立存放於專案根目錄，打包更新時不會被覆蓋
const API_KEY_PATH = path.join(__dirname, 'apikey.local.txt');

// 讀取本機 API Key 檔案：忽略 # 開頭的說明行，取第一個非空行
async function readLocalApiKey() {
  try {
    const raw = await fs.readFile(API_KEY_PATH, 'utf-8');
    const line = raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l !== 'YOUR_API_KEY_HERE');
    return line || null;
  } catch (_) {
    return null;
  }
}

// 暫存檔路徑：有正式檔案時放在「檔名.draft.json」；新專案放 userData 固定路徑
function draftPathFor(filePath) {
  return filePath ? `${filePath}.draft.json` : UNSAVED_DRAFT;
}

async function readJsonSafe(p) {
  const raw = await fs.readFile(p, 'utf-8');
  return JSON.parse(raw);
}

// 原子寫入：先寫 .tmp 再 rename，確保 crash 不會產生壞檔
async function atomicWrite(destPath, data) {
  const tmp = destPath + '.tmp';
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, destPath);
}

// ---------- 確認/提示對話框（改用 Electron 原生 dialog，避免 window.confirm 造成焦點問題） ----------
ipcMain.handle('dialog:confirm', (_e, message) => {
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['OK', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message,
  });
  return result === 0;
});

ipcMain.handle('dialog:alert', (_e, message) => {
  dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    buttons: ['OK'],
    message,
  });
  return true;
});

// ---------- 詞庫 ----------
ipcMain.handle('presets:load', async () => {
  try {
    return await readJsonSafe(PRESETS_PATH);
  } catch (_) {
    // 主檔讀取失敗，嘗試讀備份
    try {
      const bak = await readJsonSafe(PRESETS_PATH + '.bak');
      // 備份復原成主檔
      await atomicWrite(PRESETS_PATH, JSON.stringify(bak, null, 2));
      return bak;
    } catch (_2) {
      return {};
    }
  }
});

ipcMain.handle('presets:save', async (_e, presets) => {
  const json = JSON.stringify(presets, null, 2);
  // 先備份現有主檔
  try { await fs.copyFile(PRESETS_PATH, PRESETS_PATH + '.bak'); } catch (_) {}
  await atomicWrite(PRESETS_PATH, json);
  return true;
});

// ---------- 外觀設定 ----------
ipcMain.handle('settings:load', async () => {
  try { return await readJsonSafe(SETTINGS_PATH); } catch (_) { return null; }
});

ipcMain.handle('settings:save', async (_e, settings) => {
  await atomicWrite(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
});

// ---------- 開新檔 ----------
ipcMain.handle('file:new', async () => ({ filePath: null, blocks: null }));

// ---------- 開啟舊檔 ----------
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    filters: [{ name: 'Prompt Editor Project', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];

  let data;
  try {
    data = await readJsonSafe(filePath);
  } catch (e) {
    // 讀取或解析失敗時給使用者友善訊息，而非原始 JS 錯誤
    if (e instanceof SyntaxError) {
      throw new Error('Invalid file format. Please confirm this is a Prompt Editor project file (.json).');
    }
    throw new Error(`Failed to open file: ${e.message}`);
  }

  // 檢查是否有更新的 crash recovery 暫存檔
  let draft = null;
  try {
    const fileStat  = await fs.stat(filePath);
    const draftPath = draftPathFor(filePath);
    const draftStat = await fs.stat(draftPath);
    if (draftStat.mtimeMs > fileStat.mtimeMs) {
      draft = await readJsonSafe(draftPath);
    }
  } catch (_) {
    // 暫存檔不存在或讀取失敗，略過復原提示
  }

  return { filePath, blocks: data.blocks || data, draft };
});

// ---------- 清除指定暫存檔（孤兒清理） ----------
ipcMain.handle('file:clearDraft', async (_e, filePath) => {
  try { await fs.unlink(draftPathFor(filePath)); } catch (_) {}
  return true;
});

// ---------- 匯入舊版 Prompt ----------
ipcMain.handle('file:importLegacy', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Legacy Prompt',
    filters: [{ name: 'Text Files', extensions: ['txt', 'md'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const raw = await fs.readFile(result.filePaths[0], 'utf-8');
  return raw.trim();
});

// ---------- Save ----------
ipcMain.handle('file:save', async (_e, { filePath, blocks }) => {
  await atomicWrite(filePath, JSON.stringify({ blocks }, null, 2));
  try { await fs.unlink(draftPathFor(filePath)); } catch (_) {}
  return true;
});

// ---------- Save as ----------
ipcMain.handle('file:saveAs', async (_e, { blocks }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save As',
    filters: [{ name: 'Prompt Editor Project', extensions: ['json'] }],
    defaultPath: 'untitled.json',
  });
  if (result.canceled || !result.filePath) return null;
  const filePath = result.filePath;
  await atomicWrite(filePath, JSON.stringify({ blocks }, null, 2));
  try { await fs.unlink(UNSAVED_DRAFT); } catch (_) {}
  return filePath;
});

// ---------- 自動暫存 (crash recovery) ----------
ipcMain.handle('autosave:write', async (_e, { filePath, blocks }) => {
  try {
    await atomicWrite(draftPathFor(filePath), JSON.stringify({ blocks }, null, 2));
    return true;
  } catch (_) { return false; }
});

ipcMain.handle('autosave:checkUnsaved', async () => {
  try { return await readJsonSafe(UNSAVED_DRAFT); } catch (_) { return null; }
});

ipcMain.handle('autosave:clearUnsaved', async () => {
  try { await fs.unlink(UNSAVED_DRAFT); } catch (_) {}
  return true;
});

// ---------- Gallery ----------
const GALLERY_DIR  = path.join(app.getPath('userData'), 'gallery');
const GALLERY_META = path.join(app.getPath('userData'), 'gallery.json');
const GALLERY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

function genGalleryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readGalleryMeta() {
  try { return await readJsonSafe(GALLERY_META); } catch (_) { return { items: [] }; }
}

async function writeGalleryMeta(meta) {
  await atomicWrite(GALLERY_META, JSON.stringify(meta, null, 2));
}

// 將一批來源路徑複製進 gallery 目錄，非圖片副檔名會被忽略；回傳新增的 item 清單
async function importGalleryFiles(sourcePaths) {
  await fs.mkdir(GALLERY_DIR, { recursive: true });
  const meta = await readGalleryMeta();
  const added = [];

  for (const src of sourcePaths) {
    const ext = path.extname(src).toLowerCase();
    if (!GALLERY_EXTS.has(ext)) continue;

    const id = genGalleryId();
    const destName = `${id}${ext}`;
    const destPath = path.join(GALLERY_DIR, destName);
    try {
      await fs.copyFile(src, destPath);
    } catch (_) {
      continue; // 單張失敗不影響其他張
    }
    const item = {
      id,
      fileName: destName,
      originalName: path.basename(src),
      addedAt: new Date().toISOString(),
    };
    meta.items.unshift(item);
    added.push(item);
  }

  if (added.length > 0) await writeGalleryMeta(meta);
  return added;
}

ipcMain.handle('gallery:list', async () => {
  const meta = await readGalleryMeta();
  return meta.items.map((item) => ({
    ...item,
    url: `file://${path.join(GALLERY_DIR, item.fileName).replace(/\\/g, '/')}`,
  }));
});

// 透過檔案選擇對話框匯入（可多選）
ipcMain.handle('gallery:importDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Upload Images',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return importGalleryFiles(result.filePaths);
});

// 拖曳上傳：renderer 端傳入 File 物件的 .path（Electron 31, contextIsolation 下仍可用）
ipcMain.handle('gallery:importPaths', async (_e, paths) => {
  return importGalleryFiles(paths || []);
});

ipcMain.handle('gallery:delete', async (_e, id) => {
  const meta = await readGalleryMeta();
  const item = meta.items.find((i) => i.id === id);
  if (!item) return false;
  try { await fs.unlink(path.join(GALLERY_DIR, item.fileName)); } catch (_) {}
  meta.items = meta.items.filter((i) => i.id !== id);
  await writeGalleryMeta(meta);
  return true;
});

// 在檔案總管/Finder 中定位並選取該檔案
ipcMain.handle('gallery:showInFolder', async (_e, id) => {
  const meta = await readGalleryMeta();
  const item = meta.items.find((i) => i.id === id);
  if (!item) return false;
  shell.showItemInFolder(path.join(GALLERY_DIR, item.fileName));
  return true;
});

// ---------- 雲端 LLM (Google Gemini) ----------
const GEMINI_MODEL_DEFAULT = 'gemini-3.6-flash';

let geminiAbortCtrl = null;

ipcMain.handle('gemini:generate', async (_e, { prompt, model }) => {
  const apiKey = await readLocalApiKey();
  if (!apiKey) {
    return { error: 'Gemini API Key not set. Please enter your key in apikey.local.txt at the project root.' };
  }

  geminiAbortCtrl = new AbortController();
  const useModel = (model || GEMINI_MODEL_DEFAULT).trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: geminiAbortCtrl.signal,
    });

    if (!res.ok) {
      let hint;
      if (res.status === 400 || res.status === 403) {
        hint = 'Invalid or unauthorized API Key. Please check the key in apikey.local.txt.';
      } else if (res.status === 404) {
        hint = `Model "${useModel}" not found. Check https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY for models available to this key.`;
      } else if (res.status === 429) {
        hint = 'Gemini free-tier quota exceeded. Please try again later.';
      } else {
        hint = `Gemini returned an error (HTTP ${res.status})`;
      }
      return { error: hint };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) {
      return { error: 'Gemini did not return any content. Please try again later.' };
    }
    return { text };
  } catch (e) {
    if (e.name === 'AbortError') return { aborted: true };
    return { error: 'Could not connect to the Gemini API. Please check your network connection.' };
  } finally {
    geminiAbortCtrl = null;
  }
});

ipcMain.handle('gemini:abort', () => {
  if (geminiAbortCtrl) geminiAbortCtrl.abort();
  return true;
});
