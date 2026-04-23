import type { ComparePair } from "./compare-data.js";
import { runRouteKey } from "./run-data.js";

export type VoteChoice = "a" | "b" | "tie";

export interface VoteRunRef {
  topology: string;
  suite?: string;
}

export interface VoteRecord {
  schema_version: "vote-v1";
  cast_at: string;
  run_a: VoteRunRef;
  run_b: VoteRunRef;
  vote: VoteChoice;
}

export interface VoteRepoRef {
  owner: string;
  name: string;
}

export const voteRepo: VoteRepoRef = {
  owner: "kunchenguid",
  name: "org-bench",
};

const VOTE_CHOICES: ReadonlySet<VoteChoice> = new Set(["a", "b", "tie"]);

export function buildVoteRecord({
  pair,
  vote,
  castAtIso,
}: {
  pair: ComparePair;
  vote: VoteChoice;
  castAtIso: string;
}): VoteRecord {
  if (!VOTE_CHOICES.has(vote)) {
    throw new Error(`buildVoteRecord: unknown vote "${String(vote)}"`);
  }
  return {
    schema_version: "vote-v1",
    cast_at: castAtIso,
    run_a: {
      ...(pair.a.suite === undefined ? {} : { suite: pair.a.suite }),
      topology: pair.a.topology,
    },
    run_b: {
      ...(pair.b.suite === undefined ? {} : { suite: pair.b.suite }),
      topology: pair.b.topology,
    },
    vote,
  };
}

export function buildVoteFilename(record: VoteRecord): string {
  const stamp = record.cast_at.replace(/[:.]/g, "-");
  const runA = runRefKey(record.run_a).replace(/\//g, "-");
  const runB = runRefKey(record.run_b).replace(/\//g, "-");
  return `docs/votes/${stamp}-${runA}-vs-${runB}.json`;
}

function runRefKey(ref: VoteRunRef): string {
  return runRouteKey(ref);
}

export function buildVoteSubmissionUrl({
  repo,
  branch,
  record,
}: {
  repo: VoteRepoRef;
  branch: string;
  record: VoteRecord;
}): string {
  const filename = buildVoteFilename(record);
  const value = `${JSON.stringify(record, null, 2)}\n`;
  const params = new URLSearchParams({ filename, value });
  return `https://github.com/${repo.owner}/${repo.name}/new/${branch}?${params.toString()}`;
}
