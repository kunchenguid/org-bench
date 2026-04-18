export interface RunRoute {
  topology: string;
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
  artifact: {
    deploy_success: boolean;
    build_success: boolean;
    published_path: string;
  };
}

export interface JudgeJsonLike {
  rubric: {
    functional_completeness: number;
    learnability: number;
    visual_cohesion: number;
    visual_polish: number;
    state_legibility: number;
    aesthetics: number;
    interaction_feel: number;
    practical_utility: number;
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
  if (parts.length !== 1) return null;
  return { topology: parts[0]! };
}

export function buildRunHash(route: RunRoute): string {
  return `${RUN_HASH_PREFIX}${route.topology}`;
}

export function runArtifactBaseUrl(route: RunRoute): string {
  return `./${route.topology}/`;
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

export function extractRubricRows(judge: JudgeJsonLike): RubricRow[] {
  return [
    {
      criterion: "functional_completeness",
      score: judge.rubric.functional_completeness,
    },
    { criterion: "learnability", score: judge.rubric.learnability },
    { criterion: "visual_cohesion", score: judge.rubric.visual_cohesion },
    { criterion: "visual_polish", score: judge.rubric.visual_polish },
    { criterion: "state_legibility", score: judge.rubric.state_legibility },
    { criterion: "aesthetics", score: judge.rubric.aesthetics },
    { criterion: "interaction_feel", score: judge.rubric.interaction_feel },
    { criterion: "practical_utility", score: judge.rubric.practical_utility },
  ];
}
