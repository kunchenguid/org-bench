(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.GridStorage = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getStorageKey(source) {
    var namespace = source.__BENCHMARK_STORAGE_NAMESPACE__ || source.__RUN_STORAGE_NAMESPACE__ || 'spreadsheet:run';
    return String(namespace) + ':grid';
  }

  return {
    getStorageKey: getStorageKey,
  };
});
