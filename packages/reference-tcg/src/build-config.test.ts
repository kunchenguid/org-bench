import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const packageRoot = process.cwd();

test("reference-tcg is configured as a Vite + Preact app", async () => {
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.build, "vite build");
  assert.equal(packageJson.dependencies?.preact !== undefined, true);
  assert.equal(packageJson.devDependencies?.vite !== undefined, true);
  assert.equal(
    packageJson.devDependencies?.["@preact/preset-vite"] !== undefined,
    true,
  );
});

test("reference-tcg defines a relative-base Vite config for subpath deployment", async () => {
  const viteConfig = await readFile(
    join(packageRoot, "vite.config.ts"),
    "utf8",
  );

  assert.match(viteConfig, /base:\s*["']\.\/?["']/);
});

test("reference-tcg defines a Vite browser entry shell", async () => {
  const indexHtml = await readFile(join(packageRoot, "index.html"), "utf8");

  assert.match(indexHtml, /<div id="app"><\/div>/i);
  assert.match(
    indexHtml,
    /<script type="module" src="\.\/src\/main\.tsx"><\/script>/i,
  );
  assert.doesNotMatch(indexHtml, /(?:src|href)="\//);
});

test("reference-tcg defines a Preact browser mount entry", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']preact["']/);
  assert.match(mainEntry, /render\(/);
  assert.match(mainEntry, /getElementById\(["']app["']\)/);
});

test("reference-tcg app entry includes visible primary navigation labels", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /Home/);
  assert.match(mainEntry, /Play/);
  assert.match(mainEntry, /Rules/);
  assert.match(mainEntry, /Card Gallery/);
});

test("reference-tcg app entry wires the browser UI to persisted reference app state", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /createReferenceApp/);
  assert.match(mainEntry, /applyReferenceAppAction/);
  assert.match(mainEntry, /serializeReferenceApp/);
  assert.match(mainEntry, /restoreReferenceApp/);
  assert.match(mainEntry, /localStorage/);
  assert.match(mainEntry, /reference-app-save/);
});

test("reference-tcg app entry exposes a visible clear-save control", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /Clear Save/);
  assert.match(mainEntry, /removeItem/);
});

test("reference-tcg play page includes a visible in-duel turn guide", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /Your turn plan/);
  assert.match(mainEntry, /There are no blockers/);
  assert.match(mainEntry, /saved for reloads/);
});

test("reference-tcg play page includes a visible race outlook summary", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /Race Outlook/);
  assert.match(mainEntry, /Enemy defeat in/);
  assert.match(mainEntry, /return lethal clock/);
});
