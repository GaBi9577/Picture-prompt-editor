// 主編輯區的區塊定義（規格書 2.3 / 3.2），順序即為輸出拼接順序
window.BLOCKS = [
  { key: 'category', label: '分類' },
  { key: 'character', label: '角色' },
  { key: 'outfit', label: '角色穿著' },
  { key: 'action', label: '動作' },
  { key: 'expression', label: '表情' },
  { key: 'background', label: '環境背景' },
  { key: 'lighting', label: '光影氛圍' },
  { key: 'composition', label: '構圖與鏡頭' },
  { key: 'style', label: '風格與畫質' },
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
