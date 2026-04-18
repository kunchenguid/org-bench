import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));

test('workspace root declares npm workspaces and core package directories', () => {
  const rootPackage = readJson('../package.json');

  assert.deepEqual(rootPackage.workspaces, ['packages/*']);
  assert.equal(rootPackage.private, true);
  assert.equal(rootPackage.scripts.typecheck, 'tsc -b --pretty false');

  const packageDirs = [
    'orchestrator',
    'schemas',
    'evaluator',
    'judge',
    'analyst',
    'viewer',
  ];

  for (const dir of packageDirs) {
    const pkg = readJson(`../packages/${dir}/package.json`);
    assert.equal(pkg.name, `@org-bench/${dir}`);
    assert.equal(pkg.private, true);
  }
});

test('workspace root exposes the shared TypeScript baseline', () => {
  const tsconfig = readJson('../tsconfig.base.json');

  assert.equal(tsconfig.compilerOptions.target, 'ES2022');
  assert.equal(tsconfig.compilerOptions.module, 'ESNext');
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
});
