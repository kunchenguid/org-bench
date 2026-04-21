(function (global) {
  function renderShell(root, storageNamespace) {
    root.innerHTML = [
      '<main class="app-shell">',
      '  <section class="workspace-shell">',
      '    <header class="workspace-header shell-card">',
      '      <h1 class="workspace-title">Spreadsheet</h1>',
      '      <div class="workspace-meta">Namespace: ' + storageNamespace + '</div>',
      '    </header>',
      '    <section class="formula-shell shell-card" data-role="formula-bar" id="formula-bar">',
      '      <div class="formula-label">Formula</div>',
      '      <input class="formula-input" aria-label="Formula bar" placeholder="Select a cell to begin" spellcheck="false">',
      '    </section>',
      '    <section class="sheet-shell shell-card" data-role="sheet-root">',
      '      <div class="sheet-surface" id="sheet-surface">',
      '        <div class="sheet-placeholder"><strong>Shell ready.</strong> Grid and editing subsystems attach here.</div>',
      '      </div>',
      '    </section>',
      '  </section>',
      '</main>',
    ].join('');
  }

  function boot(options) {
    var config = options || {};
    var root = config.root || (global.document && global.document.getElementById('app'));

    if (!root) {
      return null;
    }

    var storageNamespace = global.SpreadsheetStorage
      ? global.SpreadsheetStorage.getNamespace()
      : 'spreadsheet';

    renderShell(root, storageNamespace);
    root.dataset.booted = 'true';
    root.dataset.storageNamespace = storageNamespace;

    return {
      root: root,
      storageNamespace: storageNamespace,
      formulaBar: global.document && global.document.getElementById('formula-bar'),
      sheetSurface: global.document && global.document.getElementById('sheet-surface'),
    };
  }

  global.SpreadsheetApp = {
    boot: boot,
  };
})(window);
