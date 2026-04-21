(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
  root.EmmaStorage = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const DEFAULT_NAMESPACE = 'spreadsheet';

  function buildStorageKey(namespace) {
    return (namespace || DEFAULT_NAMESPACE) + ':sheet';
  }

  function loadPersistedSheet(storage, namespace) {
    const raw = storage.getItem(buildStorageKey(namespace));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  function savePersistedSheet(storage, namespace, payload) {
    storage.setItem(buildStorageKey(namespace), JSON.stringify(payload));
  }

  return {
    buildStorageKey: buildStorageKey,
    loadPersistedSheet: loadPersistedSheet,
    savePersistedSheet: savePersistedSheet,
  };
});
