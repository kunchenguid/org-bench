(function (global) {
  function readMetaNamespace() {
    if (!global.document || typeof global.document.querySelector !== 'function') {
      return '';
    }

    var meta = global.document.querySelector('meta[name="storage-namespace"]');
    return meta && typeof meta.getAttribute === 'function'
      ? meta.getAttribute('content') || ''
      : '';
  }

  function readDocumentNamespace() {
    if (!global.document || !global.document.documentElement) {
      return '';
    }

    var root = global.document.documentElement;
    if (typeof root.getAttribute === 'function') {
      return root.getAttribute('data-storage-namespace') || '';
    }

    return '';
  }

  function getNamespace() {
    return (
      global.__BENCHMARK_RUN_NAMESPACE__ ||
      global.__RUN_STORAGE_NAMESPACE__ ||
      readMetaNamespace() ||
      readDocumentNamespace() ||
      'spreadsheet'
    );
  }

  function makeKey(key) {
    return getNamespace() + ':' + key;
  }

  function getJSON(key, fallbackValue) {
    if (!global.localStorage) {
      return fallbackValue;
    }

    var rawValue = global.localStorage.getItem(makeKey(key));
    if (rawValue == null) {
      return fallbackValue;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return fallbackValue;
    }
  }

  function setJSON(key, value) {
    if (!global.localStorage) {
      return;
    }

    global.localStorage.setItem(makeKey(key), JSON.stringify(value));
  }

  function remove(key) {
    if (!global.localStorage) {
      return;
    }

    global.localStorage.removeItem(makeKey(key));
  }

  global.SpreadsheetStorage = {
    getNamespace: getNamespace,
    makeKey: makeKey,
    getJSON: getJSON,
    setJSON: setJSON,
    remove: remove,
  };
})(window);
