// 全域共用的 htm 樣板函式（取代 JSX，無需打包工具）。
// 需在 htm.js UMD 與 React 載入之後引入，其他檔案透過 window.html 取用 (DRY)
window.html = htm.bind(React.createElement);
