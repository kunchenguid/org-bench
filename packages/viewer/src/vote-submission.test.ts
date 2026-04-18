import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVoteFilename,
  buildVoteRecord,
  buildVoteSubmissionUrl,
  voteRepo,
} from "./vote-submission.js";
import type { ComparePair } from "./compare-data.js";

const samplePair: ComparePair = {
  a: { topology: "apple" },
  b: { topology: "facebook" },
};

test("buildVoteRecord packs the vote payload with both run identities", () => {
  const record = buildVoteRecord({
    pair: samplePair,
    vote: "a",
    castAtIso: "2026-04-17T12:34:56.000Z",
  });
  assert.deepEqual(record, {
    schema_version: "vote-v1",
    cast_at: "2026-04-17T12:34:56.000Z",
    run_a: { topology: "apple" },
    run_b: { topology: "facebook" },
    vote: "a",
  });
});

test("buildVoteRecord rejects an unknown vote value", () => {
  assert.throws(
    () =>
      buildVoteRecord({
        pair: samplePair,
        // @ts-expect-error - exercising runtime guard
        vote: "neither",
        castAtIso: "2026-04-17T12:34:56.000Z",
      }),
    /vote/,
  );
});

test("buildVoteFilename derives a docs/votes/ path keyed by timestamp + run pair", () => {
  const record = buildVoteRecord({
    pair: samplePair,
    vote: "tie",
    castAtIso: "2026-04-17T12:34:56.000Z",
  });
  const filename = buildVoteFilename(record);
  assert.equal(
    filename,
    "docs/votes/2026-04-17T12-34-56-000Z-apple-vs-facebook.json",
  );
});

test("buildVoteSubmissionUrl produces a GitHub new-file URL with pre-filled filename and content", () => {
  const record = buildVoteRecord({
    pair: samplePair,
    vote: "b",
    castAtIso: "2026-04-17T12:34:56.000Z",
  });
  const url = buildVoteSubmissionUrl({
    repo: { owner: "kunchenguid", name: "org-bench" },
    branch: "main",
    record,
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://github.com");
  assert.equal(parsed.pathname, "/kunchenguid/org-bench/new/main");
  assert.equal(
    parsed.searchParams.get("filename"),
    "docs/votes/2026-04-17T12-34-56-000Z-apple-vs-facebook.json",
  );
  const value = parsed.searchParams.get("value");
  assert.ok(value, "expected a value query parameter with the JSON body");
  const reparsed = JSON.parse(value);
  assert.deepEqual(reparsed, record);
});

test("voteRepo points at this repository so the new-file flow targets the right org-bench", () => {
  assert.equal(voteRepo.owner, "kunchenguid");
  assert.equal(voteRepo.name, "org-bench");
});
