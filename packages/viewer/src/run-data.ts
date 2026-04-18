export interface RunRoute {
  topology: string;
  seed: string;
}

export interface ScenarioPassRow {
  scenario: string;
  passedAttempts: number;
  totalAttempts: number;
  passRate: number;
}

export interface RubricRow {
  criterion: string;
  score: number;
}

export interface MetaJsonLike {
  run_id: string;
  topology: { slug: string; name: string };
  seed: number;
  totals: {
    tokens: { in: number; out: number; total: number };
    cost_usd: number;
    wall_clock_ms: number;
  };
  evaluator: {
    overall_pass_rate: number;
    scenarios: Record<
      string,
      { passed_attempts: number; total_attempts: number; pass_rate: number }
    >;
  };
  artifact: {
    deploy_success: boolean;
    build_success: boolean;
    published_path: string;
  };
}

export interface JudgeJsonLike {
  rubric: {
    gameplay_completeness: number;
    rules_clarity: number;
    content_cohesion: number;
    visual_polish: number;
    navigation: number;
  };
  rationale: string;
}

export interface AnalysisJsonLike {
  narrative: string;
}

const RUN_HASH_PREFIX = "#run/";

export function parseRunRoute(hash: string): RunRoute | null {
  if (!hash.startsWith(RUN_HASH_PREFIX)) return null;
  const remainder = hash.slice(RUN_HASH_PREFIX.length);
  const parts = remainder.split("/").filter((part) => part.length > 0);
  if (parts.length !== 2) return null;
  const [topology, seed] = parts as [string, string];
  if (!seed.startsWith("seed-")) return null;
  return { topology, seed };
}

export function buildRunHash(route: RunRoute): string {
  return `${RUN_HASH_PREFIX}${route.topology}/${route.seed}`;
}

export function runArtifactBaseUrl(route: RunRoute): string {
  return `./runs/${route.topology}/${route.seed}/`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function extractScenarioRows(meta: MetaJsonLike): ScenarioPassRow[] {
  return Object.entries(meta.evaluator.scenarios)
    .map(([scenario, summary]) => ({
      scenario,
      passedAttempts: summary.passed_attempts,
      totalAttempts: summary.total_attempts,
      passRate: summary.pass_rate,
    }))
    .sort((a, b) => a.scenario.localeCompare(b.scenario));
}

export function extractRubricRows(judge: JudgeJsonLike): RubricRow[] {
  return [
    {
      criterion: "gameplay_completeness",
      score: judge.rubric.gameplay_completeness,
    },
    { criterion: "rules_clarity", score: judge.rubric.rules_clarity },
    { criterion: "content_cohesion", score: judge.rubric.content_cohesion },
    { criterion: "visual_polish", score: judge.rubric.visual_polish },
    { criterion: "navigation", score: judge.rubric.navigation },
  ];
}

export function scenarioScreenshotUrl(
  baseUrl: string,
  scenario: string,
): string {
  return `${baseUrl}trajectory/blobs/screenshots/${scenario}/attempt-1-step-1.png`;
}
