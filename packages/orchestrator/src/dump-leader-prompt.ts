import { MessageEnvelope, SCHEMA_VERSION } from "@org-bench/schemas";
import { buildTopologyNodePrompt } from "./index.js";

async function main(): Promise<void> {
  const cfg = (await import(
    "../../../configs/facebook.js"
  )) as typeof import("../../../configs/facebook.js");
  const config = cfg.defineFacebookRunConfig(1);
  const briefPath = "/tmp/org-bench-runs/facebook/brief.md";

  const kickoffEnvelope = MessageEnvelope.parse({
    run_id: "facebook",
    round: 1,
    from: "orchestrator",
    to: config.topology.leader,
    schema_version: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    tag: "system-kickoff",
    content: `Begin run. You are the leader of the ${config.topology.name} team for run \`facebook\`. Read the project brief at \`${briefPath}\`, then plan how your team should coordinate and begin decomposing the work across the ${config.maxRounds} rounds available.`,
  });

  for (const { round, inbox } of [
    { round: 1, inbox: [kickoffEnvelope] },
    { round: 2, inbox: [] as typeof kickoffEnvelope[] },
  ]) {
    process.stdout.write(
      `\n========== LEADER PROMPT (round ${round}) ==========\n\n`,
    );
    process.stdout.write(
      buildTopologyNodePrompt({
        runId: "facebook",
        round,
        maxRounds: config.maxRounds,
        nodeId: config.topology.leader,
        topology: config.topology,
        briefPath,
        inboxMessages: inbox,
        perNodeTurnTimeoutMs: config.perNodeTurnTimeoutMs,
        benchmarkRunLabel: "benchmark-run",
      }),
    );
    process.stdout.write("\n");
  }
}

void main();
