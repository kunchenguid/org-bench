(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SpreadsheetStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function resolveStoragePrefix(scope) {
    var source = scope || {};
    return source.__BENCHMARK_STORAGE_NAMESPACE__ || source.__RUN_STORAGE_NAMESPACE__ || source.__BENCHMARK_RUN_NAMESPACE__ || source.__storageNamespace || 'spreadsheet:';
  }

  return {
    resolveStoragePrefix: resolveStoragePrefix,
  };
});
