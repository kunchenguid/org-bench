(function () {
  var resultsNode = document.getElementById('results');

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function run() {
    assert(window.SpreadsheetStorage, 'SpreadsheetStorage should be defined');
    assert(
      typeof window.SpreadsheetStorage.getNamespace === 'function',
      'SpreadsheetStorage.getNamespace should be defined'
    );
    assert(
      typeof window.SpreadsheetStorage.makeKey === 'function',
      'SpreadsheetStorage.makeKey should be defined'
    );

    window.__BENCHMARK_RUN_NAMESPACE__ = 'apple-test';
    assert(
      window.SpreadsheetStorage.getNamespace() === 'apple-test',
      'getNamespace should prefer the injected namespace'
    );
    assert(
      window.SpreadsheetStorage.makeKey('cells') === 'apple-test:cells',
      'makeKey should prefix keys with the namespace'
    );

    assert(window.SpreadsheetApp, 'SpreadsheetApp should be defined');
    assert(typeof window.SpreadsheetApp.boot === 'function', 'SpreadsheetApp.boot should be defined');

    resultsNode.textContent = 'PASS';
    resultsNode.dataset.status = 'pass';
  }

  try {
    run();
  } catch (error) {
    resultsNode.textContent = 'FAIL: ' + error.message;
    resultsNode.dataset.status = 'fail';
    throw error;
  }
})();
