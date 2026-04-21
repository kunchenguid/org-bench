const test = require('node:test');
const assert = require('node:assert/strict');

const {
  beginEditSession,
  commitEditSession,
  resolveStorageNamespace,
  updateEditSession,
} = require('../app-state.js');

test('prefers injected benchmark namespace and falls back to page-specific location', () => {
  assert.equal(
    resolveStorageNamespace({ __BENCHMARK_STORAGE_NAMESPACE__: 'run-123', location: { href: 'file:///tmp/a/index.html' } }),
    'run-123'
  );
  assert.equal(
    resolveStorageNamespace({ location: { href: 'file:///tmp/a/index.html' } }),
    'file:///tmp/a/index.html'
  );
});

test('edit sessions keep a draft without overwriting the committed cell value', () => {
  const started = beginEditSession('A1', '=OLD', false);
  const updated = updateEditSession(started, '=NEW');

  assert.equal(started.previous, '=OLD');
  assert.equal(updated.draft, '=NEW');
  assert.equal(commitEditSession(updated, false), '=NEW');
});

test('canceling an edit session restores the previous raw value', () => {
  const started = beginEditSession('B2', '42', true, '1');
  const updated = updateEditSession(started, '123');

  assert.equal(commitEditSession(updated, true), '42');
});
