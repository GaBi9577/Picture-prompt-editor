// 使用 htm 取代 JSX，搭配 UMD 版 React，省去打包工具 (KISS)
const html = htm.bind(React.createElement);
const { useState, useEffect, useRef } = React;

const AUTOSAVE_DELAY_MS  = 800;
const GEMINI_TIMEOUT_MS  = 120_000; // 2 分鐘

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 即時預覽：flat 逗號串接
function buildPreview(blocks) {
  return window.BLOCKS
    .map((b) => (blocks[b.key] || '').trim())
    .filter((t) => t.length > 0)
    .join(', ');
}

// 送給 LLM 前的帶分類標籤版本，協助翻譯理解語意
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

// =============================================================================
// SVG Line-art 圖示
// =============================================================================
function CopyIcon() {
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="1.5" />
    <path d="M5 15V5a1.5 1.5 0 0 1 1.5-1.5H15" />
  </svg>`;
}

function SettingsIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
    <path d="M19.4 12.9c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2-1.5a.5.5 0 0 0 .12-.65l-1.9-3.3a.5.5 0 0 0-.6-.22l-2.36.95a7.1 7.1 0 0 0-1.55-.9l-.36-2.5a.5.5 0 0 0-.5-.43h-3.8a.5.5 0 0 0-.5.43l-.36 2.5c-.56.22-1.08.53-1.55.9l-2.36-.95a.5.5 0 0 0-.6.22L3.24 8.95a.5.5 0 0 0 .12.65l2 1.5c-.04.3-.06.6-.06.9s.02.6.06.9l-2 1.5a.5.5 0 0 0-.12.65l1.9 3.3c.13.22.4.31.6.22l2.36-.95c.47.37.99.68 1.55.9l.36 2.5c.05.25.26.43.5.43h3.8c.24 0 .45-.18.5-.43l.36-2.5c.56-.22 1.08-.53 1.55-.9l2.36.95c.2.09.47 0 .6-.22l1.9-3.3a.5.5 0 0 0-.12-.65z" />
  </svg>`;
}

function CloseIcon() {
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>`;
}

function BookPlusIcon() {
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    <path d="M16.2 8v4M14.2 10h4" />
  </svg>`;
}

function EditIcon() {
  return html`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>`;
}

function TrashIcon() {
  return html`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>`;
}

function NewFileIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M13 3v6h6" />
    <path d="M12 12v6M9 15h6" />
  </svg>`;
}

function OpenFolderIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" />
    <path d="M3 8l1.4 10.1a2 2 0 0 0 2 1.9h11.2a2 2 0 0 0 2-1.9L21 8" />
  </svg>`;
}

function ImportIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </svg>`;
}

function SaveIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>`;
}

function SaveAsIcon() {
  return html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l4 4v3" />
    <path d="M7 21v-8h6v8" />
    <path d="M7 3v5h6" />
    <circle cx="18" cy="17" r="4" />
    <path d="M18 15.3v3.4M16.3 17h3.4" />
  </svg>`;
}

// =============================================================================
// Toolbar
// =============================================================================
function Toolbar({ filePath, isDirty, onNew, onOpen, onImportLegacy, onSave, onSaveAs, onOpenSettings }) {
  const filename = filePath ? filePath.split(/[/\\]/).pop() : null;
  const displayName = filename
    ? `${filename}${isDirty ? ' *' : ''}`
    : `（尚未儲存的新專案）${isDirty ? ' *' : ''}`;
  const tooltip = filePath || '';

  return html`
    <div class="toolbar">
      <button class="icon-btn" title="新增檔案" onClick=${onNew}><${NewFileIcon} /></button>
      <button class="icon-btn" title="開啟舊檔" onClick=${onOpen}><${OpenFolderIcon} /></button>
      <button class="icon-btn" title="匯入舊版 Prompt" onClick=${onImportLegacy}><${ImportIcon} /></button>
      <button class="icon-btn" title="Save" onClick=${onSave}><${SaveIcon} /></button>
      <button class="icon-btn" title="Save as" onClick=${onSaveAs}><${SaveAsIcon} /></button>
      <button class="icon-btn" title="設定" onClick=${onOpenSettings}><${SettingsIcon} /></button>
      <span class="filepath" title=${tooltip}>${displayName}</span>
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
        <button class="icon-btn-xs" title="編輯" onClick=${onEdit}><${EditIcon} /></button>
        <button class="icon-btn-xs" title="刪除" onClick=${onDelete}><${TrashIcon} /></button>
      </div>
    </div>
  `;
}

function PresetPanel({ presets, activeBlock, onInsert, onEdit, onDelete }) {
  const blockLabel = window.BLOCKS.find((b) => b.key === activeBlock)?.label || '';
  const items = presets[activeBlock] || [];

  return html`
    <div class="preset-panel">
      <h3>詞庫 — ${blockLabel}</h3>
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
            目前此分類尚無詞庫項目。<br/>
            在右側對應區塊選取文字後，點擊「新增至詞庫」即可建立。
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
          <${BookPlusIcon} /> 新增至詞庫
        </button>
      </div>
      <textarea
        ref=${textareaRef}
        rows="3"
        value=${value}
        placeholder="可輸入中英文混合內容..."
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
        <h3>新增至詞庫 — ${blockLabel}</h3>
        <label>縮寫概述（命名）</label>
        <input value=${name} onInput=${(e) => setName(e.target.value)} />
        <label>英文內容（輸出用）</label>
        <textarea rows="3" value=${english} onInput=${(e) => setEnglish(e.target.value)}></textarea>
        <label>註解（顯示用，選填）</label>
        <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
        <div class="modal-actions">
          <button onClick=${onCancel}>取消</button>
          <button disabled=${!canSave} onClick=${() => onSave({ id: genId(), name: name.trim(), english: english.trim(), note: note.trim() })}>儲存</button>
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
        <h3>編輯詞庫 — ${blockLabel}</h3>
        <label>縮寫概述（命名）</label>
        <input value=${name} onInput=${(e) => setName(e.target.value)} />
        <label>英文內容（輸出用）</label>
        <textarea rows="3" value=${english} onInput=${(e) => setEnglish(e.target.value)}></textarea>
        <label>註解（顯示用，選填）</label>
        <textarea rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
        <div class="modal-actions">
          <button onClick=${onCancel}>取消</button>
          <button disabled=${!canSave} onClick=${() => onSave({ ...item, name: name.trim(), english: english.trim(), note: note.trim() })}>儲存</button>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// 整合輸出區
// =============================================================================
function OutputPanel({ blocks, geminiModel, negativePrompt, onNegativePromptChange }) {
  const preview = buildPreview(blocks);
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
        setError('生成逾時（超過 2 分鐘），請確認網路連線是否正常。');
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
      <div class="output-header">
        <h3>整合輸出（即時預覽）</h3>
        <button class="icon-btn" title="複製" disabled=${!preview} onClick=${() => navigator.clipboard.writeText(preview)}>
          <${CopyIcon} />
        </button>
      </div>
      <textarea class="output-preview" rows="8" readOnly value=${preview}></textarea>

      <div class="output-actions">
        <button onClick=${handleGenerate} disabled=${loading || !preview}>
          ${loading ? '生成中...' : '生成英文 Prompt'}
        </button>
        ${loading && html`<button class="cancel-btn" onClick=${handleCancel}>取消</button>`}
      </div>

      ${error && html`<div class="error">${error}</div>`}

      ${(generated || loading) && html`
        <div>
          <div class="output-header">
            <h3>全英文 Prompt</h3>
            <button class="icon-btn" title="複製" disabled=${!generated} onClick=${() => navigator.clipboard.writeText(generated)}>
              <${CopyIcon} />
            </button>
          </div>
          <textarea class="output-generated" rows="8" readOnly value=${generated}></textarea>
        </div>`}

      <div class="output-divider"></div>

      <div class="output-header">
        <h3>Negative Prompt<span class="hint-inline">（獨立輸出，不併入上方內容）</span></h3>
        <button class="icon-btn" title="複製" disabled=${!negativePrompt} onClick=${() => navigator.clipboard.writeText(negativePrompt)}>
          <${CopyIcon} />
        </button>
      </div>
      <textarea
        class="output-negative"
        rows="4"
        placeholder="輸入不想出現的內容，例如：blurry, extra fingers, watermark"
        value=${negativePrompt}
        onInput=${(e) => onNegativePromptChange(e.target.value)}
      ></textarea>
    </div>
  `;
}

// =============================================================================
// Gallery 頁面
// =============================================================================
function TrashLargeIcon() {
  return html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>`;
}

function UploadIcon() {
  return html`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>`;
}

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
      showToast(`已新增 ${added.length} 張圖片`, 'success');
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
      showToast(`已新增 ${added.length} 張圖片`, 'success');
      await refresh();
    } else {
      showToast('未偵測到可匯入的圖片格式', 'error');
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
    if (!(await window.api.dialogConfirm('確定要刪除這張圖片？'))) return;
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
        <button onClick=${handleImportDialog}><${UploadIcon} /> Upload</button>
      </div>

      ${loading && html`<div class="gallery-empty-hint">載入中...</div>`}

      ${!loading && items.length === 0 && html`
        <div class="gallery-empty-hint">
          <${UploadIcon} />
          <p>尚無圖片，將檔案拖曳到此處，或點擊右上角 Upload</p>
        </div>`}

      ${!loading && items.length > 0 && html`
        <div class="gallery-grid">
          ${items.map((item) => html`
            <div key=${item.id} class="gallery-thumb" onClick=${() => setPreview(item)}>
              <img src=${item.url} alt=${item.originalName} loading="lazy" />
              <button class="icon-btn-xs gallery-thumb-delete" title="刪除" onClick=${(e) => handleDelete(e, item.id)}>
                <${TrashLargeIcon} />
              </button>
            </div>`
          )}
        </div>`}

      ${dragOver && html`<div class="gallery-drop-overlay">放開以上傳圖片</div>`}
    </div>

    ${preview && html`
      <div class="modal-backdrop" onClick=${() => setPreview(null)}>
        <div class="gallery-preview" onClick=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <span class="gallery-preview-name">${preview.originalName}</span>
            <button class="icon-btn modal-close" title="在資料夾中開啟" onClick=${() => window.api.galleryShowInFolder(preview.id)}><${OpenFolderIcon} /></button>
            <button class="icon-btn modal-close" title="關閉" onClick=${() => setPreview(null)}><${CloseIcon} /></button>
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
          <h3>外觀設定</h3>
          <button class="icon-btn modal-close" title="關閉" onClick=${onClose}><${CloseIcon} /></button>
        </div>
        <label>背景漸層 — 上方（暗）</label>
        <input type="color" value=${gradient.top}    onInput=${(e) => onChange({ gradient: { top:    e.target.value } })} />
        <label>背景漸層 — 下方（亮）</label>
        <input type="color" value=${gradient.bottom} onInput=${(e) => onChange({ gradient: { bottom: e.target.value } })} />

        <h3 style=${{ marginTop: '12px' }}>Gemini 設定</h3>
        <label>模型名稱（例如 gemini-3.6-flash）</label>
        <input value=${geminiModel} onInput=${(e) => onChange({ geminiModel: e.target.value })} />
        <p class="hint">API Key 請至專案根目錄的 <code>apikey.local.txt</code> 填寫，此檔案不會被更新覆蓋。</p>
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
  const [filePath, setFilePath]   = useState(null);
  const [blocks, setBlocks]       = useState(window.emptyBlocks());
  const [presets, setPresets]     = useState(window.emptyPresets());
  const [activeBlock, setActiveBlock] = useState(window.BLOCKS[0].key);
  const [isDirty, setIsDirty]     = useState(false);
  const [toast, setToast]         = useState(null);

  // 設定整合成單一 state
  const [settings, setSettings]   = useState({
    gradient:    { top: '#1a1820', bottom: '#3a4a5c' },
    geminiModel: 'gemini-3.6-flash',
  });

  // Modal: { type: 'add'|'edit', blockKey, item?, initialText? }
  const [modal, setModal]         = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'gallery'

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

  // ---------- isDirty 檢查 ----------
  const confirmIfDirty = async () => {
    if (!isDirty) return true;
    return window.api.dialogConfirm('目前有未儲存的變更，確定要繼續？變更將會遺失。');
  };

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
        }));
      }

      // 檢查未儲存新專案的暫存內容（只有實際有輸入內容才提示，避免空白暫存誤判）
      const unsaved = await window.api.autosaveCheckUnsaved();
      if (unsaved && hasContent(unsaved.blocks)) {
        const restore = await window.api.dialogConfirm('偵測到上次未正常關閉時殘留的暫存內容，是否要復原？');
        if (restore) {
          setBlocks({ ...window.emptyBlocks(), ...unsaved.blocks });
          setIsDirty(true);
        } else {
          await window.api.autosaveClearUnsaved();
        }
      } else if (unsaved) {
        // 有暫存檔但內容全空白，直接清除，避免下次繼續誤判
        await window.api.autosaveClearUnsaved();
      }

      readyRef.current = true;
    })();
  }, []);

  // ---------- 標題列顯示檔名 + dirty 星號 ----------
  useEffect(() => {
    const name = filePath
      ? filePath.split(/[/\\]/).pop()
      : '新專案';
    document.title = `${name}${isDirty ? ' *' : ''} — Prompt Editor`;
  }, [filePath, isDirty]);

  // ---------- debounce 自動暫存 ----------
  useEffect(() => {
    if (!readyRef.current) return;
    const handle = setTimeout(() => {
      window.api.autosaveWrite({ filePath, blocks });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(handle);
  }, [blocks, filePath]);

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

  // ---------- 區塊變更 ----------
  const handleBlockChange = (key, value) => {
    setBlocks((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  // ---------- 新增檔案 ----------
  const handleNew = async () => {
    if (!(await confirmIfDirty())) return;
    // 清除舊孤兒暫存（若有正式檔案）；新專案的暫存另外清
    if (filePath) await window.api.clearDraft(filePath);
    await window.api.autosaveClearUnsaved();
    setFilePath(null);
    setBlocks(window.emptyBlocks());
    setIsDirty(false);
  };

  // ---------- 開啟舊檔 ----------
  const handleOpen = async () => {
    if (!(await confirmIfDirty())) return;
    let result;
    try {
      result = await window.api.openFile();
    } catch (e) {
      showToast('開啟檔案失敗：' + e.message);
      return;
    }
    // 使用者取消對話框或讀取失敗時 result 為 null，不清除任何暫存
    if (!result) return;

    // 成功開啟新檔後，清除前一個檔案的孤兒暫存
    // （若取消或失敗已提前 return，不會執行到此，孤兒暫存得以保留）
    if (filePath && filePath !== result.filePath) {
      await window.api.clearDraft(filePath);
    }

    let finalBlocks = { ...window.emptyBlocks(), ...result.blocks };
    if (result.draft && hasContent(result.draft.blocks)) {
      const restore = await window.api.dialogConfirm('偵測到此檔案有比正式存檔更新的暫存內容，是否要復原？');
      if (restore) {
        finalBlocks = { ...window.emptyBlocks(), ...result.draft.blocks };
      }
    }

    setFilePath(result.filePath);
    setBlocks(finalBlocks);
    setIsDirty(false);
  };
  handleOpenRef.current = handleOpen;

  // ---------- 匯入舊版 Prompt ----------
  const handleImportLegacy = async () => {
    let text;
    try {
      text = await window.api.importLegacyPrompt();
    } catch (e) {
      showToast('匯入失敗：' + e.message);
      return;
    }
    if (text === null) return;
    setBlocks((prev) => {
      const cur  = (prev.category || '').trim();
      return { ...prev, category: cur ? `${cur}, ${text}` : text };
    });
    setIsDirty(true);
    await window.api.dialogAlert('已將舊版 Prompt 放入「分類」區塊，請手動剪下並分配到對應的區塊中。');
  };

  // ---------- Save ----------
  const handleSave = async () => {
    if (!filePath) { await handleSaveAs(); return; }
    try {
      await window.api.saveFile({ filePath, blocks });
      setIsDirty(false);
      showToast('已儲存', 'success');
    } catch (e) {
      showToast('儲存失敗：' + e.message);
    }
  };
  handleSaveRef.current = handleSave;

  // ---------- Save as ----------
  const handleSaveAs = async () => {
    let newPath;
    try {
      newPath = await window.api.saveFileAs({ blocks });
    } catch (e) {
      showToast('另存新檔失敗：' + e.message);
      return;
    }
    if (newPath) {
      setFilePath(newPath);
      setIsDirty(false);
      showToast('已另存新檔', 'success');
    }
  };
  handleSaveAsRef.current = handleSaveAs;

  // ---------- 詞庫操作 ----------
  const persistPresets = async (updated) => {
    setPresets(updated);
    try {
      await window.api.presetsSave(updated);
    } catch (e) {
      showToast('詞庫儲存失敗：' + e.message);
    }
  };

  const handleInsertPreset = (blockKey, english) => {
    setBlocks((prev) => {
      const cur = (prev[blockKey] || '').trim();
      return { ...prev, [blockKey]: cur ? `${cur}, ${english}` : english };
    });
    setIsDirty(true);
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
    if (!(await window.api.dialogConfirm('確定要刪除這個詞庫項目？'))) return;
    const updated = {
      ...presets,
      [blockKey]: (presets[blockKey] || []).filter((p) => p.id !== id),
    };
    await persistPresets(updated);
  };

  // ---------- 設定變更（漸層色 / 模型名稱） ----------
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
        filePath=${filePath}
        isDirty=${isDirty}
        onNew=${handleNew}
        onOpen=${handleOpen}
        onImportLegacy=${handleImportLegacy}
        onSave=${handleSave}
        onSaveAs=${handleSaveAs}
        onOpenSettings=${() => setSettingsOpen(true)}
      />

      <div class="tab-bar">
        <button class="tab-btn ${activeTab === 'editor' ? 'active' : ''}" onClick=${() => setActiveTab('editor')}>編輯器</button>
        <button class="tab-btn ${activeTab === 'gallery' ? 'active' : ''}" onClick=${() => setActiveTab('gallery')}>Gallery</button>
      </div>

      ${activeTab === 'editor' && html`
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
                value=${blocks[block.key]}
                isActive=${block.key === activeBlock}
                onChange=${handleBlockChange}
                onFocus=${setActiveBlock}
                onAddPreset=${(blockKey, sel) => setModal({ type: 'add', blockKey, initialText: sel })}
              />`
            )}
          </div>

          <${OutputPanel}
            blocks=${blocks}
            geminiModel=${settings.geminiModel}
            negativePrompt=${blocks.negativePrompt}
            onNegativePromptChange=${(v) => handleBlockChange('negativePrompt', v)}
          />
        </div>`}

      ${activeTab === 'gallery' && html`<${GalleryPanel} showToast=${showToast} />`}

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
