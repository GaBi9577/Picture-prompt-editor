// 主編輯區的區塊定義（規格書 2.3 / 3.2）。
// 注意：這裡的陣列順序只決定「UI 顯示順序」（左側詞庫面板、主編輯區塊排列），
// 不再決定輸出拼接順序 —— 拼接順序由下方的 window.DEFAULT_RENDER_ORDER（內建預設）
// 與使用者可自訂的 renderOrder（存於 settings.json）共同決定，見 resolveRenderOrder()。
// 兩者刻意解耦：調整輸出順序不會牽動使用者已經熟悉的 UI 操作排列。
window.BLOCKS = [
  { key: 'category', label: 'Category' },
  { key: 'character', label: 'Character' },
  { key: 'outfit', label: 'Outfit' },
  { key: 'spatialRelationship', label: 'Spatial Relationship' },
  { key: 'actionPose', label: 'Action & Pose' },
  { key: 'expression', label: 'Expression' },
  { key: 'background', label: 'Background' },
  { key: 'lighting', label: 'Lighting & Atmosphere' },
  { key: 'composition', label: 'Composition & Camera' },
  { key: 'style', label: 'Style & Quality' },
];

// 最終 Positive Prompt 的組裝順序（僅列 key，順序即拼接順序）。
// category 保留在可排序清單內（畫面媒介類型，如 illustration/photo），
// 使用者可自由調整它的位置，不強制固定最前面。
// negativePrompt 不在此列表中：它永遠獨立處理，不進入 positive prompt 組裝流程。
//
// 這是「內建預設值」，使用者可在 UI 上自訂順序（存於 settings.json 的
// renderOrder 欄位，全域共用、跨專案），實際生效順序見 resolveRenderOrder()。
window.DEFAULT_RENDER_ORDER = [
  'category',
  'character',
  'outfit',
  'spatialRelationship',
  'actionPose',
  'expression',
  'background',
  'lighting',
  'composition',
  'style',
];

// 正規化使用者自訂的 render order：
// - 過濾掉不再存在的舊 key（例如未來若某分類被移除）
// - 補回任何缺漏的 key（例如未來新增分類時，舊 settings.json 不會有它）
// - 保底：輸入完全無效時，直接回傳內建預設值
// 統一經過這個函式，UI 呈現與 buildPreview 才能保證兩者永遠是同一份、完整的 key 集合 (DRY)
window.resolveRenderOrder = function resolveRenderOrder(customOrder) {
  const valid = new Set(window.DEFAULT_RENDER_ORDER);
  const cleaned = Array.isArray(customOrder)
    ? customOrder.filter((key) => valid.has(key))
    : [];
  const missing = window.DEFAULT_RENDER_ORDER.filter((key) => !cleaned.includes(key));
  const result = [...cleaned, ...missing];
  // 理論上 result 長度必等於 DEFAULT_RENDER_ORDER，這裡只是防禦性保底
  return result.length === window.DEFAULT_RENDER_ORDER.length
    ? result
    : window.DEFAULT_RENDER_ORDER;
};

// 產生空的區塊內容物件 { category: '', character: '', ..., negativePrompt: '' }
// negativePrompt 刻意不放進 BLOCKS 陣列：不參與主要 flat 輸出/標籤化 prompt/詞庫，
// 但仍存在同一個 blocks 物件中，因此自動享有存檔、crash recovery、dirty 追蹤等既有機制 (DRY)
window.emptyBlocks = function emptyBlocks() {
  const blocks = {};
  window.BLOCKS.forEach(({ key }) => {
    blocks[key] = '';
  });
  blocks.negativePrompt = '';
  return blocks;
};

// 產生空的詞庫物件 { category: [], character: [], ... }
window.emptyPresets = function emptyPresets() {
  const presets = {};
  window.BLOCKS.forEach(({ key }) => {
    presets[key] = [];
  });
  return presets;
};
