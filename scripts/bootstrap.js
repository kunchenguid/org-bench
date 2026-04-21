(function (global) {
  var modules = [];

  function renderShell(root) {
    root.innerHTML = [
      '<main class="app-shell">',
      '  <header class="topbar">',
      '    <div class="title-block">',
      '      <h1>Spreadsheet</h1>',
      '      <p>Static bootstrap shell for the Apple spreadsheet.</p>',
      '    </div>',
      '    <div class="status-chip">Bootstrap ready</div>',
      '  </header>',
      '  <section class="formula-bar" aria-label="Formula bar">',
      '    <div class="name-box" aria-label="Selected cell">A1</div>',
      '    <div class="formula-input">Shared formula bar placeholder. Editing logic wires in here.</div>',
      '  </section>',
      '  <section class="workspace">',
      '    <div class="grid-card" aria-label="Spreadsheet grid shell">',
      '      <p class="grid-hint">Grid, formulas, clipboard, and persistence modules attach through the shared store and event bus.</p>',
      '    </div>',
      '  </section>',
      '</main>'
    ].join('');
  }

  function buildContext(root, options) {
    var store = global.SpreadsheetStore.createStore({
      metadata: {
        storageNamespace: (options && options.storageNamespace) || global.__APPLE_RUN_STORAGE_NAMESPACE__ || 'spreadsheet'
      }
    });
    var bus = global.SpreadsheetEvents.createEventBus();

    return {
      root: root,
      store: store,
      bus: bus,
      registerModule: registerModule
    };
  }

  function startModules(context) {
    modules.forEach(function (module) {
      if (module && typeof module.init === 'function') {
        module.init(context);
      }
    });
  }

  function registerModule(module) {
    modules.push(module);
    return module;
  }

  function bootstrap(options) {
    var root = (options && options.root) || document.getElementById('app');

    if (!root) {
      throw new Error('Missing #app mount node');
    }

    renderShell(root);

    var context = buildContext(root, options || {});
    startModules(context);
    context.bus.emit('app:ready', {
      root: root,
      state: context.store.getState()
    });

    return context;
  }

  global.SpreadsheetBootstrap = {
    bootstrap: bootstrap,
    registerModule: registerModule
  };

  document.addEventListener('DOMContentLoaded', function onReady() {
    document.removeEventListener('DOMContentLoaded', onReady);
    bootstrap({});
  });
}(window));
