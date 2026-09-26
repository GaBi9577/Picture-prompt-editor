const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 確認/提示對話框
  dialogConfirm: (msg) => ipcRenderer.invoke('dialog:confirm', msg),
  dialogAlert:   (msg) => ipcRenderer.invoke('dialog:alert',   msg),

  // 詞庫
  presetsLoad:  ()        => ipcRenderer.invoke('presets:load'),
  presetsSave:  (p)       => ipcRenderer.invoke('presets:save', p),

  // 外觀設定
  settingsLoad: ()        => ipcRenderer.invoke('settings:load'),
  settingsSave: (s)       => ipcRenderer.invoke('settings:save', s),

  // 檔案操作
  newFile:           ()  => ipcRenderer.invoke('file:new'),
  openFile:          ()  => ipcRenderer.invoke('file:open'),
  saveFile:          (p) => ipcRenderer.invoke('file:save',        p),
  saveFileAs:        (p) => ipcRenderer.invoke('file:saveAs',      p),
  clearDraft:        (p) => ipcRenderer.invoke('file:clearDraft',  p),
  importLegacyPrompt:()  => ipcRenderer.invoke('file:importLegacy'),

  // 自動暫存 (crash recovery)
  autosaveWrite:        (p) => ipcRenderer.invoke('autosave:write',        p),
  autosaveCheckUnsaved: ()  => ipcRenderer.invoke('autosave:checkUnsaved'),
  autosaveClearUnsaved: ()  => ipcRenderer.invoke('autosave:clearUnsaved'),

  // 雲端 LLM (Gemini)
  geminiGenerate: (p) => ipcRenderer.invoke('gemini:generate', p),
  geminiAbort:    ()  => ipcRenderer.invoke('gemini:abort'),

  // Gallery
  galleryList:         ()  => ipcRenderer.invoke('gallery:list'),
  galleryImportDialog: ()  => ipcRenderer.invoke('gallery:importDialog'),
  galleryImportPaths:  (p) => ipcRenderer.invoke('gallery:importPaths', p),
  galleryDelete:       (id)=> ipcRenderer.invoke('gallery:delete', id),
  galleryShowInFolder: (id)=> ipcRenderer.invoke('gallery:showInFolder', id),
});
