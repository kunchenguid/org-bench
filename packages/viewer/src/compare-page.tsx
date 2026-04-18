import { useMemo, useState } from "preact/hooks";

import type { ComparePair } from "./compare-data.js";
import { runArtifactBaseUrl, type RunRoute } from "./run-data.js";
import {
  buildVoteRecord,
  buildVoteSubmissionUrl,
  voteRepo,
  type VoteChoice,
} from "./vote-submission.js";

export function ComparePage({ pair }: { pair: ComparePair }) {
  const [vote, setVote] = useState<VoteChoice | null>(null);
  const revealed = vote !== null;
  const submissionUrl = useMemo(() => {
    if (vote === null) return null;
    const record = buildVoteRecord({
      pair,
      vote,
      castAtIso: new Date().toISOString(),
    });
    return buildVoteSubmissionUrl({ repo: voteRepo, branch: "main", record });
  }, [pair, vote]);
  return (
    <article data-page="compare">
      <p>
        <a href="#">{"<-"} All runs</a>
      </p>
      <h1>Blind compare</h1>
      <p>
        Two runs are shown side by side. Pick the one that produced the better
        artifact. Topology labels are revealed only after you vote.
      </p>
      <div data-section="compare-grid">
        <BlindRunPanel
          slot="a"
          route={pair.a}
          label={revealed ? pair.a.topology : "Run A"}
          revealed={revealed}
        />
        <BlindRunPanel
          slot="b"
          route={pair.b}
          label={revealed ? pair.b.topology : "Run B"}
          revealed={revealed}
        />
      </div>
      <section data-section="vote">
        {!revealed && (
          <div data-testid="vote-controls">
            <button type="button" onClick={() => setVote("a")}>
              Run A wins
            </button>
            <button type="button" onClick={() => setVote("b")}>
              Run B wins
            </button>
            <button type="button" onClick={() => setVote("tie")}>
              Tie
            </button>
          </div>
        )}
        {revealed && (
          <div data-testid="vote-result">
            <p>
              You voted: <strong>{describeVote(vote!, pair)}</strong>
            </p>
            <p>
              Run A was{" "}
              <strong data-testid="reveal-a">{pair.a.topology}</strong>. Run B
              was <strong data-testid="reveal-b">{pair.b.topology}</strong>.
            </p>
            {submissionUrl && (
              <p>
                <a
                  data-testid="submit-vote-link"
                  href={submissionUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Record this vote as a pull request
                </a>{" "}
                (opens GitHub's new-file flow pre-filled under{" "}
                <code>docs/votes/</code>).
              </p>
            )}
            <button type="button" onClick={() => setVote(null)}>
              Reset
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

function describeVote(vote: VoteChoice, pair: ComparePair): string {
  if (vote === "tie") return "tie";
  const route = vote === "a" ? pair.a : pair.b;
  return `${vote.toUpperCase()} (${route.topology})`;
}

function BlindRunPanel({
  slot,
  route,
  label,
  revealed,
}: {
  slot: "a" | "b";
  route: RunRoute;
  label: string;
  revealed: boolean;
}) {
  const baseUrl = runArtifactBaseUrl(route);
  return (
    <section data-slot={slot} data-revealed={revealed ? "true" : "false"}>
      <h2>{label}</h2>
      <iframe
        data-testid={`compare-iframe-${slot}`}
        src={baseUrl}
        title={label}
        width="100%"
        height="480"
        loading="lazy"
      />
    </section>
  );
}
