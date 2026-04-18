import assert from "node:assert/strict";
import test from "node:test";

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const packageRoot = process.cwd();

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(full)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

test("viewer is configured as a Vite + Preact static app", async () => {
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.match(packageJson.scripts?.build ?? "", /vite build/);
  assert.match(
    packageJson.scripts?.build ?? "",
    /tsx scripts\/build-manifest\.mts/,
  );
  assert.equal(packageJson.dependencies?.preact !== undefined, true);
  assert.equal(packageJson.devDependencies?.vite !== undefined, true);
  assert.equal(
    packageJson.devDependencies?.["@preact/preset-vite"] !== undefined,
    true,
  );
});

test("viewer defines a relative-base Vite config so it can publish to docs/", async () => {
  const viteConfig = await readFile(
    join(packageRoot, "vite.config.ts"),
    "utf8",
  );

  assert.match(viteConfig, /base:\s*["']\.\/?["']/);
  assert.match(viteConfig, /preact\(\)/);
});

test("viewer builds into the repo-root docs/ directory for the existing Pages serve-from-docs deploy", async () => {
  const viteConfig = await readFile(
    join(packageRoot, "vite.config.ts"),
    "utf8",
  );

  assert.match(
    viteConfig,
    /outDir:\s*["']\.\.\/\.\.\/docs["']/,
    "vite outDir must be ../../docs so Pages serves viewer index.html from repo-root docs/",
  );
  assert.match(
    viteConfig,
    /emptyOutDir:\s*false/,
    "vite emptyOutDir must be false so docs/runs/ is preserved when the viewer rebuilds",
  );
});

test("viewer defines a Vite browser entry shell", async () => {
  const indexHtml = await readFile(join(packageRoot, "index.html"), "utf8");

  assert.match(indexHtml, /<div id="app"><\/div>/i);
  assert.match(
    indexHtml,
    /<script type="module" src="\.\/src\/main\.tsx"><\/script>/i,
  );
  assert.doesNotMatch(indexHtml, /(?:src|href)="\//);
});

test("viewer defines a Preact browser mount entry", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']preact["']/);
  assert.match(mainEntry, /render\(/);
  assert.match(mainEntry, /getElementById\(["']app["']\)/);
});

test("viewer browser entry announces the org-bench viewer shell", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /org-bench/i);
});

test("viewer index page renders runs grouped by topology", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']\.\/runs-manifest\.js["']/);
  assert.match(mainEntry, /groupRunsByTopology/);
  assert.match(mainEntry, /fetch\(["']\.\/runs\.json["']\)/);
  assert.match(mainEntry, /data-topology=\{group\.topology\}/);
  assert.match(mainEntry, /group\.runs\.map/);
});

test("viewer main wires hash-based routing to a per-run page", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']\.\/run-page\.js["']/);
  assert.match(mainEntry, /from\s+["']\.\/run-data\.js["']/);
  assert.match(mainEntry, /parseRunRoute/);
  assert.match(mainEntry, /window\.location\.hash/);
  assert.match(mainEntry, /addEventListener\(["']hashchange["']/);
  assert.match(mainEntry, /<RunPage route=\{route\.route\} \/>/);
  assert.match(mainEntry, /buildRunHash\(/);
});

test("RunPage renders the four required sections", async () => {
  const runPage = await readFile(join(packageRoot, "src/run-page.tsx"), "utf8");

  assert.match(runPage, /data-section="artifact"/);
  assert.match(runPage, /data-section="metrics"/);
  assert.match(runPage, /data-section="narrative"/);
  assert.match(runPage, /data-section="screenshots"/);
  assert.match(runPage, /<iframe[\s\S]*src=\{baseUrl\}/);
  assert.match(runPage, /scenarioScreenshotUrl\(baseUrl, scenario\)/);
  assert.match(runPage, /analysis\.narrative/);
  assert.match(runPage, /meta\.totals\.tokens\.total/);
});

test("viewer main wires the blind compare route", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']\.\/compare-data\.js["']/);
  assert.match(mainEntry, /from\s+["']\.\/compare-page\.js["']/);
  assert.match(mainEntry, /parseCompareRoute/);
  assert.match(mainEntry, /<ComparePage pair=\{route\.pair\} \/>/);
  assert.match(mainEntry, /buildCompareHash/);
});

test("viewer main wires the trace route", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']\.\/trace-data\.js["']/);
  assert.match(mainEntry, /from\s+["']\.\/trace-page\.js["']/);
  assert.match(mainEntry, /parseTraceRoute/);
  assert.match(mainEntry, /<TracePage route=\{route\.route\} \/>/);
});

test("RunPage links to the trace view via buildTraceHash", async () => {
  const runPage = await readFile(join(packageRoot, "src/run-page.tsx"), "utf8");

  assert.match(runPage, /from\s+["']\.\/trace-data\.js["']/);
  assert.match(runPage, /buildTraceHash\(route\)/);
  assert.match(runPage, /data-testid="trace-link"/);
});

test("TracePage renders per-node timelines and a PR list", async () => {
  const tracePage = await readFile(
    join(packageRoot, "src/trace-page.tsx"),
    "utf8",
  );

  assert.match(tracePage, /data-page="trace"/);
  assert.match(tracePage, /data-section="message-graph"/);
  assert.match(tracePage, /data-section="node-timelines"/);
  assert.match(tracePage, /data-section="pr-list"/);
  assert.match(tracePage, /data-testid="timeline-list"/);
  assert.match(tracePage, /data-testid="pr-table"/);
  assert.match(tracePage, /extractPrReferences/);
  assert.match(tracePage, /summarizeNodeTimeline/);
});

test("TracePage mounts a Cytoscape canvas for the message graph", async () => {
  const tracePage = await readFile(
    join(packageRoot, "src/trace-page.tsx"),
    "utf8",
  );

  assert.match(tracePage, /from "cytoscape"/);
  assert.match(tracePage, /buildMessageGraphData/);
  assert.match(tracePage, /data-testid="message-graph-canvas"/);
  assert.match(tracePage, /cytoscape\(\{/);
});

test("viewer fetches only static relative paths (no backend)", async () => {
  const sources = await listSourceFiles(join(packageRoot, "src"));
  const fetchPattern = /fetch\(\s*([^)]*?)\s*[,)]/g;
  const offenders: { file: string; call: string }[] = [];
  for (const file of sources) {
    const text = await readFile(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = fetchPattern.exec(text)) !== null) {
      const arg = match[1].trim();
      const looksRelative =
        /^["'`]\.\//.test(arg) ||
        /^`\$\{baseUrl\}/.test(arg) ||
        /^`\$\{manifestUrl\}/.test(arg) ||
        arg === "manifestUrl" ||
        arg === "url";
      const hasAbsoluteOrigin =
        /["'`](?:https?:|\/\/|\/(?!\/))/.test(arg) || /\/api\//.test(arg);
      if (hasAbsoluteOrigin || !looksRelative) {
        offenders.push({ file, call: arg });
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `viewer must only fetch static relative paths, got: ${JSON.stringify(offenders, null, 2)}`,
  );
});

test("viewer package depends on no backend frameworks", async () => {
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  const banned = [
    "express",
    "fastify",
    "hono",
    "koa",
    "@hapi/hapi",
    "next",
    "@trpc/server",
    "axios",
  ];
  for (const name of banned) {
    assert.equal(
      all[name],
      undefined,
      `viewer must not depend on backend framework "${name}"`,
    );
  }
});

test("viewer main wires the per-topology summary route", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /from\s+["']\.\/topology-data\.js["']/);
  assert.match(mainEntry, /from\s+["']\.\/topology-page\.js["']/);
  assert.match(mainEntry, /parseTopologyRoute/);
  assert.match(mainEntry, /<TopologyPage[\s\S]*?entries=\{[\s\S]*?\}/);
  assert.match(mainEntry, /kind:\s*"topology"/);
});

test("viewer index page links to a per-topology summary page for each topology", async () => {
  const mainEntry = await readFile(join(packageRoot, "src/main.tsx"), "utf8");

  assert.match(mainEntry, /buildTopologyHash/);
  assert.match(mainEntry, /data-testid="topology-link"/);
});

test("TopologyPage renders the summary, aggregate metrics, and seed list", async () => {
  const topologyPage = await readFile(
    join(packageRoot, "src/topology-page.tsx"),
    "utf8",
  );

  assert.match(topologyPage, /data-page="topology"/);
  assert.match(topologyPage, /data-section="summary"/);
  assert.match(topologyPage, /data-section="aggregate"/);
  assert.match(topologyPage, /data-section="seeds"/);
  assert.match(topologyPage, /data-testid="seed-list"/);
  assert.match(topologyPage, /summarizeTopologyRuns/);
  assert.match(topologyPage, /buildRunHash/);
});

test("ComparePage hides labels until the user votes", async () => {
  const comparePage = await readFile(
    join(packageRoot, "src/compare-page.tsx"),
    "utf8",
  );

  assert.match(comparePage, /data-page="compare"/);
  assert.match(comparePage, /data-section="compare-grid"/);
  assert.match(comparePage, /data-section="vote"/);
  assert.match(comparePage, /data-testid="vote-controls"/);
  assert.match(comparePage, /data-testid="vote-result"/);
  assert.match(comparePage, /data-testid="reveal-a"/);
  assert.match(comparePage, /data-testid="reveal-b"/);
  assert.match(comparePage, /"Run A"/);
  assert.match(comparePage, /"Run B"/);
});

test("ComparePage records each vote as a docs/votes/ pull request via the GitHub new-file flow", async () => {
  const comparePage = await readFile(
    join(packageRoot, "src/compare-page.tsx"),
    "utf8",
  );

  assert.match(comparePage, /from\s+["']\.\/vote-submission\.js["']/);
  assert.match(comparePage, /buildVoteRecord/);
  assert.match(comparePage, /buildVoteSubmissionUrl/);
  assert.match(comparePage, /data-testid="submit-vote-link"/);
  assert.match(comparePage, /target="_blank"/);
});
