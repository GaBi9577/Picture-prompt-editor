// 使用 htm 取代 JSX，搭配 UMD 版 React，省去打包工具 (KISS)
// html / Icon 皆由 html.js、icons.js 提供
const html = window.html;
const { useState, useEffect, useRef } = React;

const AUTOSAVE_DELAY_MS = 800;
const GEMINI_TIMEOUT_MS = 120_000; // 2 分鐘

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 建立一個分頁狀態。未命名分頁 filePath 為 null
function makeTab(overrides = {}) {
  return {
    id: genId(),
    filePath: null,
    blocks: window.emptyBlocks(),
    isDirty: false,
    ...overrides,
  };
}

function basename(p) {
  return p.split(/[/\\]/).pop();
}

// 即時預覽：flat 逗號串接。
// 組裝順序使用傳入的 renderOrder（未提供則 fallback 內建預設值），
// 不依賴 BLOCKS（UI 顯示順序）或 JSON 欄位原本的排列順序 —— 分類標籤本身不會輸出，只取用內容值。
function buildPreview(blocks, renderOrder = window.DEFAULT_RENDER_ORDER) {
  return renderOrder
    .map((key) => (blocks[key] || '').trim())
    .filter((t) => t.length > 0)
    .join(', ');
}

// 送給 LLM 前的帶分類標籤版本，協助翻譯理解語意（僅供 LLM 內部參考用，
// 非最終輸出，因此沿用 BLOCKS 取得對應的中文 label 即可）
function buildTaggedPrompt(blocks) {
  return window.BLOCKS
    .map((b) => {
      const t = (blocks[b.key] || '').trim();
      return t ? `${b.label}: ${t}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

// LLM 輸出後處理：清除常見多餘前綴、引號、換行
function cleanLlmOutput(text) {
  return text
    .replace(/^(here'?s?( (is|are))?|output|result|translation|prompt)[:\s]*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\n+/g, ', ')
    .trim();
}

// 判斷 blocks 是否有任何非空白內容（用於判斷暫存是否值得復原提示）
function hasContent(blocks) {
  if (!blocks) return false;
  return Object.values(blocks).some((v) => (v || '').trim().length > 0);
}

// 把 list 中 from 位置的項目移到 to 位置，回傳新陣列（不修改原陣列）
function moveItem(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// =============================================================================
// Toolbar（全域操作，檔案分頁由 TabStrip 處理）
// =============================================================================
function Toolbar({ onOpen, onCreateFromJson, onImportLegacy, onSave, onSaveAs, onOpenSettings }) {
  return html`
    <div class="toolbar">
      <button class="icon-btn" title="Open" onClick=${onOpen}><${Icon} name="open" /></button>
      <button class="icon-btn" title="Create from JSON text" onClick=${onCreateFromJson}><${Icon} name="json" /></button>
      <button class="icon-btn" title="Import legacy prompt" onClick=${onImportLegacy}><${Icon} name="importLegacy" /></button>
      <button class="icon-btn" title="Save" onClick=${onSave}><${Icon} name="save" /></button>
      <button class="icon-btn" title="Save as" onClick=${onSaveAs}><${Icon} name="saveAs" /></button>
      <button class="icon-btn" title="Settings" onClick=${onOpenSettings}><${Icon} name="settings" /></button>
    </div>
  `;
}

// =============================================================================
// 檔案分頁列（與 Editor / Gallery 檢視切換分開一排）
// =============================================================================
function TabStrip({ tabs, activeId, onSelect, onClose, onAdd }) {
  return html`
    <div class="doc-tab-bar">
      ${tabs.map((t) => {
        const name = t.filePath ? basename(t.filePath) : 'Untitled';
        return html`
          <div
            key=${t.id}
            class=${'doc-tab' + (t.id === activeId ? ' doc-tab--active' : '')}
            title=${t.filePath || 'Not saved yet'}
            onClick=${() => onSelect(t.id)}
          >
            <span class="doc-tab-name">${name}${t.isDirty ? ' *' : ''}</span>
            <button
              class="icon-btn-xs"
              title="Close"
              onClick=${(e) => { e.stopPropagation(); onClose(t.id); }}
            ><${Icon} name="close" size=${12} /></button>
          </div>`;
      })}
      <button class="icon-btn-xs doc-tab-add" title="New" onClick=${onAdd}><${Icon} name="add" size=${14} /></button>
    </div>
  `;
}

// =============================================================================
// 詞庫面板
// =============================================================================
function PresetItem({ item, onInsert, onEdit, onDelete }) {
  const tooltip = item.note ? `${item.english}\n— ${item.note}` : item.english;
  return html`
    <div class="preset-item-row">
      <div class="preset-item" title=${tooltip} onClick=${onInsert}>${item.name}</div>
      <div class="preset-item-actions">
        <button class="icon-btn-xs" title="Edit" onClick=${onEdit}><${Icon} name="edit" size=${13} /></button>
        <button class="icon-btn-xs" title="Delete" onClick=${onDelete}><${Icon} name="delete" size=${13} /></button>
      </div>
    </div>
  `;
}

function PresetPanel({ presets, activeBlock, onInsert, onEdit, onDelete }) {
  const blockLabel = window.BLOCKS.find((b) => b.key === activeBlock)?.label || '';
  const items = presets[activeBlock] || [];

  return html`
    <div class="preset-panel">
      <h3>Preset Library — ${blockLabel}</h3>
      <div class="preset-list">
        ${items.map((item) => html`
          <${PresetItem}
            key=${item.id}
            item=${item}
            onInsert=${() => onInsert(activeBlock, item.english)}
            onEdit=${()   => onEdit(activeBlock, item)}
            onDelete=${() => onDelete(activeBlock, item.id)}
          />`
        )}
        ${items.length === 0 && html`
          <div class="preset-empty">
            No preset items in this category yet.<br/>
            Select text in the block on the right, then click "Add to Preset" to create one.
          </div>`}
      </div>
    </div>
  `;
}

// =============================================================================
// 主編輯區單一區塊
// =============================================================================
function EditorBlock({ block, value, isActive, onChange, onFocus, onAddPreset }) {
  const textareaRef = useRef(null);

  const handleAddPreset = () => {
    const ta = textareaRef.current;
    const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    onAddPreset(block.key, selected);
  };

  return html`
    <div class=${'editor-block' + (isActive ? ' editor-block--active' : '')}>
      <div class="block-header">
        <span class="block-label">${block.label}</span>
        <button class="small-btn" onClick=${handleAddPreset}>
          <${Icon} name="add" size=${13} /> Add to Preset
        </button>
      </div>
      <textarea
        ref=${textareaRef}
        rows="3"
        value=${value}
        placeholder="Mixed Chinese/English input allowed..."
        onFocus=${() => onFocus(block.key)}
        onChange=${(e) => onChange(block.key, e.target.value)}
      ></textarea>
    </div>
  `;
}

// =============================================================================
// 新增至詞庫 Modal
// =============================================================================
function PresetSaveModal({ blockLabel, initialText, onCancel, onSave }) {
  const [name, setName]       = useState('');
  const [english, setEnglish] = useState(initialText || '');
  const [note, setNote]       = useState('');
  const canSave = name.trim().length > 0 && english.trim().length > 0;

  return html`
    <div class="modal-backdrop">
      <div class="modal">
        <h3>Add to Preset — ${blockLabel}</h3>
        <label>Short name (label)</label>
        <input value=${name} onInput=${(e) => setName(e.target.value)} />
        <label>English content (output)</label>
        <textarea rows="3" value=${english} onInput=${(e) => setEnglish(e.target.value)}></textarea>
        <label>Note (display only, optional)</label>
        <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
        <div class="modal-actions">
          <button onClick=${onCancel}>Cancel</button>
          <button disabled=${!canSave} onClick=${() => onSave({ id: genId(), name: name.trim(), english: english.trim(), note: note.trim() })}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// 編輯詞庫 Modal
// =============================================================================
function PresetEditModal({ blockLabel, item, onCancel, onSave }) {
  const [name, setName]       = useState(item.name    || '');
  const [english, setEnglish] = useState(item.english || '');
  const [note, setNote]       = useState(item.note    || '');
  const canSave = name.trim().length > 0 && english.trim().length > 0;

  return html`
    <div class="modal-backdrop">
      <div class="modal">
        <h3>Edit Preset — ${blockLabel}</h3>
        <label>Short name (label)</label>
        <input value=${name} onInput=${(e) => setName(e.target.value)} />
        <label>English content (output)</label>
        <textarea rows="3" value=${english} onInput=${(e) => setEnglish(e.target.value)}></textarea>
        <label>Note (display only, optional)</label>
        <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
        <div class="modal-actions">
          <button onClick=${onCancel}>Cancel</button>
          <button disabled=${!canSave} onClick=${() => onSave({ ...item, name: name.trim(), english: english.trim(), note: note.trim() })}>Save</button>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// 從 JSON 文字建立未命名分頁 Modal
// =============================================================================
function JsonImportModal({ onCancel, onCreate }) {
  const [text, setText]   = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    try {
      onCreate(window.parseProjectJson(text));
    } catch (e) {
      setError(e.message);
    }
  };

  return html`
    <div class="modal-backdrop">
      <div class="modal modal--wide">
        <div class="modal-header">
          <h3>Create from JSON</h3>
          <button class="icon-btn modal-close" title="Close" onClick=${onCancel}><${Icon} name="close" size=${16} /></button>
        </div>
        <textarea
          class="json-input"
          placeholder=${'{ "blocks": { "category": "...", "character": "..." } }'}
          value=${text}
          onInput=${(e) => { setText(e.target.value); setError(''); }}
        ></textarea>
        ${error && html`<div class="error">${error}</div>`}
        <p class="hint">Creates an unsaved tab. Use Save as to write it to a file.</p>
        <div class="modal-actions">
          <button onClick=${onCancel}>Cancel</button>
          <button disabled=${!text.trim()} onClick=${handleCreate}>Create</button>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// Render Order 排序面板（可收合，拖曳項目調整最終 Prompt 組裝順序）
// =============================================================================
function RenderOrderPanel({ renderOrder, onChange }) {
  const [open, setOpen]           = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const labelOf = (key) =>
    window.BLOCKS.find((b) => b.key === key)?.label || key;

  const handleDrop = (toIndex) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    onChange(moveItem(renderOrder, dragIndex, toIndex));
    setDragIndex(null);
  };

  return html`
    <div class="render-order-panel">
      <button class="render-order-toggle" onClick=${() => setOpen(!open)}>
        <span>Render Order Setting</span>
        <${Icon} name=${open ? 'chevronUp' : 'chevronDown'} size=${14} />
      </button>
      ${open && html`
        <div class="render-order-body">
          <ol class="render-order-list">
            ${renderOrder.map((key, i) => html`
              <li
                key=${key}
                class=${'render-order-item' + (dragIndex === i ? ' render-order-item--dragging' : '')}
                draggable="true"
                onDragStart=${() => setDragIndex(i)}
                onDragOver=${(e) => e.preventDefault()}
                onDrop=${(e) => { e.preventDefault(); handleDrop(i); }}
                onDragEnd=${() => setDragIndex(null)}
              >
                <span class="drag-handle"><${Icon} name="dragHandle" size=${14} /></span>
                <span class="render-order-item-label">${labelOf(key)}</span>
              </li>`
            )}
          </ol>
          <button class="render-order-reset" onClick=${() => onChange([...window.DEFAULT_RENDER_ORDER])}>Reset to Default</button>
        </div>`}
    </div>
  `;
}

// =============================================================================
// 整合輸出區
// =============================================================================
function OutputPanel({ blocks, geminiModel, negativePrompt, onNegativePromptChange, renderOrder, onRenderOrderChange }) {
  const preview = buildPreview(blocks, renderOrder);
  const tagged  = buildTaggedPrompt(blocks);
  const [generated, setGenerated] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const cancelledRef              = useRef(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setGenerated('');
    cancelledRef.current = false;

    const llmPrompt =
      '以下是依分類整理的繪圖提示詞內容（中英文混合），每行格式為「分類: 內容」：\n\n' +
      tagged +
      '\n\n請理解每個分類的語意後，將其中的中文部分翻譯成英文，英文部分請保留原樣不要更動。' +
      '最後請輸出「一行」以逗號分隔的純英文標籤列表（flat comma-separated tags），' +
      '不要保留分類名稱、不要換行、不要加上任何說明文字、引號或前後綴。';

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), GEMINI_TIMEOUT_MS)
    );

    try {
      const res = await Promise.race([
        window.api.geminiGenerate({ prompt: llmPrompt, model: geminiModel }),
        timeoutPromise,
      ]);
      if (cancelledRef.current) return;
      setLoading(false);
      if (res.aborted) return;
      if (res.error) {
        setError(res.error);
      } else {
        setGenerated(cleanLlmOutput(res.text || ''));
      }
    } catch (e) {
      if (cancelledRef.current) return;
      setLoading(false);
      if (e.message === 'TIMEOUT') {
        setError('Generation timed out (over 2 minutes). Please check your network connection.');
      } else {
        setError(e.message);
      }
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setLoading(false);
    window.api.geminiAbort();
  };

  return html`
    <div class="output-panel">
      <${RenderOrderPanel} renderOrder=${renderOrder} onChange=${onRenderOrderChange} />

      <div class="output-header">
        <h3>Integrated Output (Live Preview)</h3>
        <button class="icon-btn" title="Copy" disabled=${!preview} onClick=${() => navigator.clipboard.writeText(preview)}>
          <${Icon} name="copy" size=${16} />
        </button>
      </div>
      <textarea class="output-preview" rows="8" readOnly value=${preview}></textarea>

      <div class="output-actions">
        <button onClick=${handleGenerate} disabled=${loading || !preview}>
          ${loading ? 'Generating...' : 'Generate English Prompt'}
        </button>
        ${loading && html`<button class="cancel-btn" onClick=${handleCancel}>Cancel</button>`}
      </div>

      ${error && html`<div class="error">${error}</div>`}

      ${(generated || loading) && html`
        <div>
          <div class="output-header">
            <h3>Full English Prompt</h3>
            <button class="icon-btn" title="Copy" disabled=${!generated} onClick=${() => navigator.clipboard.writeText(generated)}>
              <${Icon} name="copy" size=${16} />
            </button>
          </div>
          <textarea class="output-generated" rows="8" readOnly value=${generated}></textarea>
        </div>`}

      <div class="output-divider"></div>

      <div class="output-header">
        <h3>Negative Prompt</h3>
        <button class="icon-btn" title="Copy" disabled=${!negativePrompt} onClick=${() => navigator.clipboard.writeText(negativePrompt)}>
          <${Icon} name="copy" size=${16} />
        </button>
      </div>
      <textarea
        class="output-negative"
        rows="4"
        placeholder="Enter content you don't want, e.g.: blurry, extra fingers, watermark"
        value=${negativePrompt}
        onInput=${(e) => onNegativePromptChange(e.target.value)}
      ></textarea>
    </div>
  `;
}

// =============================================================================
// Gallery 頁面
// =============================================================================
function GalleryPanel({ showToast }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dragOver, setDragOver]   = useState(false);
  const [preview, setPreview]     = useState(null); // 放大檢視中的 item
  const dragCounterRef            = useRef(0);

  const refresh = async () => {
    const list = await window.api.galleryList();
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleImportDialog = async () => {
    const added = await window.api.galleryImportDialog();
    if (added.length > 0) {
      showToast(`${added.length} image(s) added`, 'success');
      await refresh();
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length === 0) return;
    const added = await window.api.galleryImportPaths(paths);
    if (added.length > 0) {
      showToast(`${added.length} image(s) added`, 'success');
      await refresh();
    } else {
      showToast('No importable image format detected', 'error');
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) setDragOver(false);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!(await window.api.dialogConfirm('Delete this image?'))) return;
    await window.api.galleryDelete(id);
    setPreview((p) => (p?.id === id ? null : p));
    await refresh();
  };

  return html`
    <div
      class="gallery-panel ${dragOver ? 'drag-over' : ''}"
      onDragOver=${handleDragOver}
      onDragEnter=${handleDragEnter}
      onDragLeave=${handleDragLeave}
      onDrop=${handleDrop}
    >
      <div class="gallery-header">
        <h3>Gallery</h3>
        <button onClick=${handleImportDialog}><${Icon} name="upload" /> Upload</button>
      </div>

      ${loading && html`<div class="gallery-empty-hint">Loading...</div>`}

      ${!loading && items.length === 0 && html`
        <div class="gallery-empty-hint">
          <${Icon} name="upload" size=${28} />
          <p>No images yet. Drag files here, or click Upload in the top right.</p>
        </div>`}

      ${!loading && items.length > 0 && html`
        <div class="gallery-grid">
          ${items.map((item) => html`
            <div key=${item.id} class="gallery-thumb" onClick=${() => setPreview(item)}>
              <img src=${item.url} alt=${item.originalName} loading="lazy" />
              <button class="icon-btn-xs gallery-thumb-delete" title="Delete" onClick=${(e) => handleDelete(e, item.id)}>
                <${Icon} name="delete" size=${16} />
              </button>
            </div>`
          )}
        </div>`}

      ${dragOver && html`<div class="gallery-drop-overlay">Drop to upload</div>`}
    </div>

    ${preview && html`
      <div class="modal-backdrop" onClick=${() => setPreview(null)}>
        <div class="gallery-preview" onClick=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <span class="gallery-preview-name">${preview.originalName}</span>
            <button class="icon-btn modal-close" title="Show in folder" onClick=${() => window.api.galleryShowInFolder(preview.id)}><${Icon} name="showInFolder" /></button>
            <button class="icon-btn modal-close" title="Close" onClick=${() => setPreview(null)}><${Icon} name="close" size=${16} /></button>
          </div>
          <img src=${preview.url} alt=${preview.originalName} />
        </div>
      </div>`}
  `;
}

// =============================================================================
// 設定面板
// =============================================================================
function SettingsPanel({ settings, onChange, onClose }) {
  const { gradient, geminiModel } = settings;

  return html`
    <div class="modal-backdrop">
      <div class="modal" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>Appearance Settings</h3>
          <button class="icon-btn modal-close" title="Close" onClick=${onClose}><${Icon} name="close" size=${16} /></button>
        </div>
        <label>Background Gradient — Top (Dark)</label>
        <input type="color" value=${gradient.top}    onInput=${(e) => onChange({ gradient: { top:    e.target.value } })} />
        <label>Background Gradient — Bottom (Light)</label>
        <input type="color" value=${gradient.bottom} onInput=${(e) => onChange({ gradient: { bottom: e.target.value } })} />

        <h3 style=${{ marginTop: '12px' }}>Gemini Settings</h3>
        <label>Model name (e.g. gemini-3.6-flash)</label>
        <input value=${geminiModel} onInput=${(e) => onChange({ geminiModel: e.target.value })} />
        <p class="hint">Set your API Key in <code>apikey.local.txt</code> at the project root. This file is never overwritten by updates.</p>
      </div>
    </div>
  `;
}

// =============================================================================
// 簡易 Toast 通知
// =============================================================================
function Toast({ msg, type }) {
  return html`<div class=${'toast toast--' + type}>${msg}</div>`;
}

// =============================================================================
// App 主體
// =============================================================================
function App() {
  // 分頁狀態：所有分頁共用同一個 state 物件，確保切換與更新是原子的
  const [docs, setDocs] = useState(() => {
    const first = makeTab();
    return { tabs: [first], activeId: first.id };
  });
  const activeTab = docs.tabs.find((t) => t.id === docs.activeId) || docs.tabs[0];

  const [presets, setPresets]         = useState(window.emptyPresets());
  const [activeBlock, setActiveBlock] = useState(window.BLOCKS[0].key);
  const [toast, setToast]             = useState(null);

  // 設定整合成單一 state（全域，跨分頁共用）
  const [settings, setSettings] = useState({
    gradient:    { top: '#1a1820', bottom: '#3a4a5c' },
    geminiModel: 'gemini-3.6-flash',
    renderOrder: [...window.DEFAULT_RENDER_ORDER],
  });

  // Modal: { type: 'add'|'edit', blockKey, item?, initialText? }
  const [modal, setModal]               = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [jsonOpen, setJsonOpen]         = useState(false);
  const [activeView, setActiveView]     = useState('editor'); // 'editor' | 'gallery'

  const readyRef = useRef(false);

  // 使用 ref 讓 keydown listener 始終能呼叫最新版本的 handler（避免 stale closure）
  const handleSaveRef   = useRef(null);
  const handleSaveAsRef = useRef(null);
  const handleOpenRef   = useRef(null);

  // ---------- 通知 ----------
  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'success' ? 2000 : 4000);
  };

  // ---------- 分頁狀態操作 ----------
  const editTab = (id, updater) =>
    setDocs((d) => ({ ...d, tabs: d.tabs.map((t) => (t.id === id ? updater(t) : t)) }));

  // 切換或新增分頁前，先把離開的分頁若有未寫入的變更立即寫入草稿（不等 debounce）
  const flushDraft = (tab) => {
    if (tab.isDirty) window.api.autosaveWrite({ filePath: tab.filePath, tabId: tab.id, blocks: tab.blocks });
  };

  const addTab = (tab) => {
    flushDraft(activeTab);
    setDocs((d) => ({ tabs: [...d.tabs, tab], activeId: tab.id }));
  };

  const selectTab = (id) => {
    if (id === activeTab.id) return;
    flushDraft(activeTab);
    setDocs((d) => ({ ...d, activeId: id }));
  };

  // 移除分頁；若移除的是唯一分頁，保留一個新的未命名分頁
  const removeTab = (id) =>
    setDocs((d) => {
      const idx  = d.tabs.findIndex((t) => t.id === id);
      const tabs = d.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        const fresh = makeTab();
        return { tabs: [fresh], activeId: fresh.id };
      }
      if (d.activeId !== id) return { ...d, tabs };
      return { tabs, activeId: tabs[Math.max(0, idx - 1)].id };
    });

  // ---------- 啟動時初始化 ----------
  useEffect(() => {
    (async () => {
      // 載入詞庫
      const loadedPresets = await window.api.presetsLoad();
      setPresets({ ...window.emptyPresets(), ...loadedPresets });

      // 載入設定
      const loadedSettings = await window.api.settingsLoad();
      if (loadedSettings) {
        setSettings((prev) => ({
          ...prev,
          ...loadedSettings,
          gradient: { ...prev.gradient, ...(loadedSettings.gradient || {}) },
          renderOrder: window.resolveRenderOrder(loadedSettings.renderOrder),
        }));
      }

      // 未命名分頁的暫存：空白的直接清除，有內容的詢問是否復原
      const drafts      = await window.api.autosaveListUntitled();
      const withContent = drafts.filter((d) => hasContent(d.blocks));
      const blank       = drafts.filter((d) => !hasContent(d.blocks));
      await Promise.all(blank.map((d) => window.api.draftClear({ tabId: d.tabId })));

      if (withContent.length > 0) {
        const restore = await window.api.dialogConfirm(
          `Found ${withContent.length} unsaved draft(s) from an unexpected shutdown. Restore them?`
        );
        if (restore) {
          const tabs = withContent.map((d) =>
            makeTab({ id: d.tabId, blocks: { ...window.emptyBlocks(), ...d.blocks }, isDirty: true })
          );
          setDocs({ tabs, activeId: tabs[0].id });
        } else {
          await Promise.all(withContent.map((d) => window.api.draftClear({ tabId: d.tabId })));
        }
      }

      readyRef.current = true;
    })();
  }, []);

  // ---------- 視窗標題顯示目前分頁檔名 + dirty 星號 ----------
  useEffect(() => {
    const name = activeTab.filePath ? basename(activeTab.filePath) : 'Untitled';
    document.title = `${name}${activeTab.isDirty ? ' *' : ''} — Prompt Editor`;
  }, [activeTab.filePath, activeTab.isDirty]);

  // ---------- 草稿：僅在分頁有未儲存變更時寫入；已乾淨則清除殘留草稿 ----------
  useEffect(() => {
    if (!readyRef.current) return;
    const { id, filePath, blocks, isDirty } = activeTab;
    const handle = setTimeout(() => {
      if (isDirty) window.api.autosaveWrite({ filePath, tabId: id, blocks });
      else window.api.draftClear({ filePath, tabId: id });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [activeTab.id, activeTab.filePath, activeTab.blocks, activeTab.isDirty]);

  // ---------- 鍵盤快捷鍵 ----------
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 's') {
        e.preventDefault();
        e.shiftKey ? handleSaveAsRef.current?.() : handleSaveRef.current?.();
      } else if (e.key === 'o') {
        e.preventDefault();
        handleOpenRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---------- 區塊變更（作用於目前分頁） ----------
  const handleBlockChange = (key, value) =>
    editTab(activeTab.id, (t) => ({ ...t, blocks: { ...t.blocks, [key]: value }, isDirty: true }));

  // ---------- 新增未命名分頁 ----------
  const handleNew = () => addTab(makeTab());

  // ---------- 從 JSON 文字建立未命名分頁 ----------
  const handleCreateFromJson = (blocks) => {
    addTab(makeTab({ blocks, isDirty: true }));
    setJsonOpen(false);
  };

  // ---------- 開啟舊檔（可多選；已開啟的檔案直接切換過去） ----------
  const openResult = async (r) => {
    const existing = docs.tabs.find((t) => t.filePath === r.filePath);
    if (existing) {
      selectTab(existing.id);
      return;
    }

    let blocks  = { ...window.emptyBlocks(), ...r.blocks };
    let isDirty = false;
    if (r.draft && hasContent(r.draft.blocks)) {
      const restore = await window.api.dialogConfirm(
        `Found a draft newer than "${basename(r.filePath)}". Restore it?`
      );
      if (restore) {
        blocks  = { ...window.emptyBlocks(), ...r.draft.blocks };
        isDirty = true;
      }
    }
    addTab(makeTab({ filePath: r.filePath, blocks, isDirty }));
  };

  const handleOpen = async () => {
    let results;
    try {
      results = await window.api.openFile();
    } catch (e) {
      showToast('Failed to open file: ' + e.message);
      return;
    }
    for (const r of results) {
      if (r.error) {
        showToast(r.error);
        continue;
      }
      await openResult(r);
    }
  };
  handleOpenRef.current = handleOpen;

  // ---------- 關閉分頁（有未儲存變更時先確認） ----------
  const handleCloseTab = async (id) => {
    const tab = docs.tabs.find((t) => t.id === id);
    if (tab.isDirty && !(await window.api.dialogConfirm('This tab has unsaved changes. Close it anyway? Changes will be lost.'))) {
      return;
    }
    removeTab(id);
    await window.api.draftClear({ filePath: tab.filePath, tabId: id });
  };

  // ---------- 匯入舊版 Prompt（放入目前分頁的 Category） ----------
  const handleImportLegacy = async () => {
    let text;
    try {
      text = await window.api.importLegacyPrompt();
    } catch (e) {
      showToast('Import failed: ' + e.message);
      return;
    }
    if (text === null) return;
    editTab(activeTab.id, (t) => {
      const cur = (t.blocks.category || '').trim();
      return { ...t, blocks: { ...t.blocks, category: cur ? `${cur}, ${text}` : text }, isDirty: true };
    });
    await window.api.dialogAlert('Legacy prompt has been placed in the "Category" block. Please cut and redistribute it into the appropriate blocks manually.');
  };

  // ---------- Save ----------
  const handleSave = async () => {
    const tab = activeTab;
    if (!tab.filePath) { await handleSaveAs(); return; }
    try {
      await window.api.saveFile({ filePath: tab.filePath, blocks: tab.blocks });
      editTab(tab.id, (t) => ({ ...t, isDirty: false }));
      showToast('Saved', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message);
    }
  };
  handleSaveRef.current = handleSave;

  // ---------- Save as ----------
  const handleSaveAs = async () => {
    const tab = activeTab;
    let newPath;
    try {
      newPath = await window.api.saveFileAs({ blocks: tab.blocks });
    } catch (e) {
      showToast('Save as failed: ' + e.message);
      return;
    }
    if (!newPath) return;
    // 內容已移到新檔案，舊的草稿（或未命名草稿）不再需要
    await window.api.draftClear({ filePath: tab.filePath, tabId: tab.id });
    editTab(tab.id, (t) => ({ ...t, filePath: newPath, isDirty: false }));
    showToast('Saved as new file', 'success');
  };
  handleSaveAsRef.current = handleSaveAs;

  // ---------- 詞庫操作（全域，插入到目前分頁） ----------
  const persistPresets = async (updated) => {
    setPresets(updated);
    try {
      await window.api.presetsSave(updated);
    } catch (e) {
      showToast('Failed to save preset: ' + e.message);
    }
  };

  const handleInsertPreset = (blockKey, english) => {
    editTab(activeTab.id, (t) => {
      const cur = (t.blocks[blockKey] || '').trim();
      return { ...t, blocks: { ...t.blocks, [blockKey]: cur ? `${cur}, ${english}` : english }, isDirty: true };
    });
  };

  const handlePresetSave = async (item) => {
    const key     = modal.blockKey;
    const updated = { ...presets, [key]: [...(presets[key] || []), item] };
    await persistPresets(updated);
    setModal(null);
  };

  const handlePresetEdit = async (item) => {
    const key     = modal.blockKey;
    const updated = {
      ...presets,
      [key]: (presets[key] || []).map((p) => (p.id === item.id ? item : p)),
    };
    await persistPresets(updated);
    setModal(null);
  };

  const handlePresetDelete = async (blockKey, id) => {
    if (!(await window.api.dialogConfirm('Delete this preset item?'))) return;
    const updated = {
      ...presets,
      [blockKey]: (presets[blockKey] || []).filter((p) => p.id !== id),
    };
    await persistPresets(updated);
  };

  // ---------- 設定變更（漸層色 / 模型名稱 / 排序） ----------
  const handleSettingsChange = (patch) => {
    setSettings((prev) => {
      const next = patch.gradient
        ? { ...prev, gradient: { ...prev.gradient, ...patch.gradient } }
        : { ...prev, ...patch };
      window.api.settingsSave(next);
      return next;
    });
  };

  // ---------- Modal 取用的分類標籤 ----------
  const modalBlockLabel = window.BLOCKS.find((b) => b.key === modal?.blockKey)?.label || '';

  return html`
    <div
      class="app"
      style=${{ background: `linear-gradient(180deg, ${settings.gradient.top} 0%, ${settings.gradient.bottom} 100%)` }}
    >
      <${Toolbar}
        onOpen=${handleOpen}
        onCreateFromJson=${() => setJsonOpen(true)}
        onImportLegacy=${handleImportLegacy}
        onSave=${handleSave}
        onSaveAs=${handleSaveAs}
        onOpenSettings=${() => setSettingsOpen(true)}
      />

      <${TabStrip}
        tabs=${docs.tabs}
        activeId=${docs.activeId}
        onSelect=${selectTab}
        onClose=${handleCloseTab}
        onAdd=${handleNew}
      />

      <div class="tab-bar">
        <button class="tab-btn ${activeView === 'editor' ? 'active' : ''}" onClick=${() => setActiveView('editor')}>Editor</button>
        <button class="tab-btn ${activeView === 'gallery' ? 'active' : ''}" onClick=${() => setActiveView('gallery')}>Gallery</button>
      </div>

      ${activeView === 'editor' && html`
        <div class="main-layout">
          <${PresetPanel}
            presets=${presets}
            activeBlock=${activeBlock}
            onInsert=${handleInsertPreset}
            onEdit=${(blockKey, item) => setModal({ type: 'edit', blockKey, item })}
            onDelete=${handlePresetDelete}
          />

          <div class="editor-area">
            ${window.BLOCKS.map((block) => html`
              <${EditorBlock}
                key=${block.key}
                block=${block}
                value=${activeTab.blocks[block.key]}
                isActive=${block.key === activeBlock}
                onChange=${handleBlockChange}
                onFocus=${setActiveBlock}
                onAddPreset=${(blockKey, sel) => setModal({ type: 'add', blockKey, initialText: sel })}
              />`
            )}
          </div>

          <${OutputPanel}
            key=${activeTab.id}
            blocks=${activeTab.blocks}
            geminiModel=${settings.geminiModel}
            negativePrompt=${activeTab.blocks.negativePrompt}
            onNegativePromptChange=${(v) => handleBlockChange('negativePrompt', v)}
            renderOrder=${settings.renderOrder}
            onRenderOrderChange=${(order) => handleSettingsChange({ renderOrder: order })}
          />
        </div>`}

      ${activeView === 'gallery' && html`<${GalleryPanel} showToast=${showToast} />`}

      ${modal?.type === 'add' && html`
        <${PresetSaveModal}
          blockLabel=${modalBlockLabel}
          initialText=${modal.initialText}
          onCancel=${() => setModal(null)}
          onSave=${handlePresetSave}
        />`}

      ${modal?.type === 'edit' && html`
        <${PresetEditModal}
          blockLabel=${modalBlockLabel}
          item=${modal.item}
          onCancel=${() => setModal(null)}
          onSave=${handlePresetEdit}
        />`}

      ${jsonOpen && html`
        <${JsonImportModal}
          onCancel=${() => setJsonOpen(false)}
          onCreate=${handleCreateFromJson}
        />`}

      ${settingsOpen && html`
        <${SettingsPanel}
          settings=${settings}
          onChange=${handleSettingsChange}
          onClose=${() => setSettingsOpen(false)}
        />`}

      ${toast && html`<${Toast} msg=${toast.msg} type=${toast.type} />`}
    </div>
  `;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
