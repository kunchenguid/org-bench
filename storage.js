(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SpreadsheetStorage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function firstNonEmpty(values) {
    for (var index = 0; index < values.length; index += 1) {
      if (typeof values[index] === 'string' && values[index].trim()) {
        return values[index].trim();
      }
    }
    return '';
  }

  function sanitizeFallback(value) {
    return String(value || 'local-file').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  }

  function resolveStorageNamespace(win, doc) {
    var documentRef = doc || null;
    var windowRef = win || (typeof window !== 'undefined' ? window : {});
    var metaContent = '';

    if (documentRef && documentRef.querySelector) {
      var meta = documentRef.querySelector('meta[name="benchmark-storage-namespace"]');
      if (meta && meta.getAttribute) {
        metaContent = meta.getAttribute('content') || '';
      }
    }

    var datasetValues = [];
    if (documentRef && documentRef.documentElement && documentRef.documentElement.dataset) {
      datasetValues.push(documentRef.documentElement.dataset.storageNamespace);
      datasetValues.push(documentRef.documentElement.dataset.benchmarkStorageNamespace);
      datasetValues.push(documentRef.documentElement.dataset.runNamespace);
    }
    if (documentRef && documentRef.body && documentRef.body.dataset) {
      datasetValues.push(documentRef.body.dataset.storageNamespace);
      datasetValues.push(documentRef.body.dataset.benchmarkStorageNamespace);
      datasetValues.push(documentRef.body.dataset.runNamespace);
    }

    var searchValues = [];
    if (windowRef.location && typeof URLSearchParams !== 'undefined') {
      var params = new URLSearchParams(windowRef.location.search || '');
      searchValues.push(params.get('storageNamespace'));
      searchValues.push(params.get('benchmarkStorageNamespace'));
      searchValues.push(params.get('runNamespace'));
    }

    var explicit = firstNonEmpty([
      windowRef.__BENCHMARK_STORAGE_NAMESPACE__,
      windowRef.BENCHMARK_STORAGE_NAMESPACE,
      windowRef.__RUN_STORAGE_NAMESPACE__,
      windowRef.RUN_STORAGE_NAMESPACE,
      metaContent,
    ].concat(datasetValues, searchValues));

    if (explicit) {
      return explicit;
    }

    var locationValue = '';
    if (windowRef.location) {
      locationValue = (windowRef.location.origin || '') + (windowRef.location.pathname || '') || windowRef.location.href || '';
    }
    return 'spreadsheet:' + sanitizeFallback(locationValue) + ':';
  }

  return {
    resolveStorageNamespace: resolveStorageNamespace,
  };
});
