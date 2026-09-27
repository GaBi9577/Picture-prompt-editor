// 將使用者貼上的 JSON 文字解析為完整的 blocks 物件。
// 接受兩種格式，與開檔邏輯一致：{ "blocks": {...} } 或直接 {...}。
// 驗證失敗時拋出可直接顯示給使用者的 Error。
(function () {
  const ALLOWED_KEYS = new Set([...window.BLOCKS.map((b) => b.key), 'negativePrompt']);

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  window.parseProjectJson = function parseProjectJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`JSON syntax error: ${e.message}`);
    }

    const candidate = isPlainObject(data) && isPlainObject(data.blocks) ? data.blocks : data;
    if (!isPlainObject(candidate)) {
      throw new Error('Top level must be a JSON object.');
    }

    const unknown = Object.keys(candidate).filter((k) => !ALLOWED_KEYS.has(k));
    if (unknown.length > 0) {
      throw new Error(`Unknown field(s): ${unknown.join(', ')}`);
    }

    const blocks = window.emptyBlocks();
    for (const key of Object.keys(candidate)) {
      const value = candidate[key];
      if (value === null) continue;
      if (typeof value !== 'string') {
        throw new Error(`Field "${key}" must be a string.`);
      }
      blocks[key] = value;
    }
    return blocks;
  };
})();
