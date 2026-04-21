'use strict';

function createStorageNamespaceApi(source) {
  const context = source || {};

  function getNamespace() {
    const raw = context.__BENCHMARK_RUN_NAMESPACE__;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    return 'spreadsheet';
  }

  function makeKey(suffix) {
    return getNamespace() + ':' + String(suffix || '');
  }

  return {
    getNamespace,
    makeKey,
  };
}

const api = {
  createStorageNamespaceApi,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.StorageNamespace = api;
}
