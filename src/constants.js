// 主編輯區的區塊定義（規格書 2.3 / 3.2）。
// 注意：這裡的陣列順序只決定「UI 顯示順序」（左側詞庫面板、主編輯區塊排列），
// 不再決定輸出拼接順序 —— 拼接順序由下方獨立的 window.RENDER_ORDER 控制。
// 兩者刻意解耦：以後只需要調整 RENDER_ORDER 就能改變最終 Prompt 組裝順序，
// 不會牽動使用者已經熟悉的 UI 操作排列。
window.BLOCKS = [
  { key: 'category', label: '分類' },
  { key: 'character', label: '角色' },
  { key: 'outfit', label: '角色穿著' },
  { key: 'spatialRelationship', label: '空間關係' },
  { key: 'actionPose', label: '動作與姿勢' },
  { key: 'expression', label: '表情' },
  { key: 'background', label: '環境背景' },
  { key: 'lighting', label: '光影氛圍' },
  { key: 'composition', label: '構圖與鏡頭' },
  { key: 'style', label: '風格與畫質' },
];

// 最終 Positive Prompt 的組裝順序（僅列 key，順序即拼接順序）。
// category 保留在最前面作為輔助欄位（畫面媒介類型，如 illustration/photo），
// 不計入 ticket 定義的 10 個正式分類，但仍需要有固定位置參與輸出。
// negativePrompt 不在此列表中：它永遠獨立處理，不進入 positive prompt 組裝流程。
window.RENDER_ORDER = [
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
