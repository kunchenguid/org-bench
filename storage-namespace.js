(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.SpreadsheetStorageNamespace = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readMetaNamespace(environment) {
    const document = environment && environment.document;
    if (!document || typeof document.querySelector !== 'function') {
      return '';
    }

    const meta = document.querySelector('meta[name="storage-namespace"]');
    return meta && typeof meta.getAttribute === 'function' ? meta.getAttribute('content') || '' : '';
  }

  function readDocumentNamespace(environment) {
    const document = environment && environment.document;
    const root = document && document.documentElement;
    return root && typeof root.getAttribute === 'function' ? root.getAttribute('data-storage-namespace') || '' : '';
  }

  function createStorageNamespaceApi(environment) {
    const scope = environment || {};

    function getNamespace() {
      return (
        scope.__BENCHMARK_RUN_NAMESPACE__ ||
        scope.__RUN_STORAGE_NAMESPACE__ ||
        readMetaNamespace(scope) ||
        readDocumentNamespace(scope) ||
        'spreadsheet'
      );
    }

    function makeKey(key) {
      return getNamespace() + ':' + key;
    }

    return {
      getNamespace,
      makeKey,
    };
  }

  return {
    createStorageNamespaceApi,
  };
});
