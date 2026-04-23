import cytoscape from "cytoscape";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  buildRunHash,
  formatRunLabel,
  formatNumber,
  runArtifactBaseUrl,
} from "./run-data.js";
import {
  buildMessageGraphData,
  extractPrReferences,
  parseJsonlLines,
  parseMessageLine,
  parseNodeTurnLine,
  summarizeNodeTimeline,
  type MessageEdge,
  type NodeTimeline,
  type NodeTurn,
  type PrReference,
  type TraceRoute,
} from "./trace-data.js";

interface TraceDocuments {
  messages: MessageEdge[];
  timelines: NodeTimeline[];
  prs: PrReference[];
  nodeIds: string[];
}

type TraceState =
  | { status: "loading" }
  | { status: "ready"; docs: TraceDocuments }
  | { status: "error"; error: string };

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return await response.text();
}

async function discoverNodeIds(baseUrl: string): Promise<string[]> {
  const manifestUrl = `${baseUrl}trajectory/nodes/index.json`;
  try {
    const response = await fetch(manifestUrl);
    if (response.ok) {
      const ids = (await response.json()) as unknown;
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
        return ids;
      }
    }
  } catch {
    // fall through to heuristic probe
  }
  const candidates = [
    "leader",
    "review",
    "divA",
    "divB",
    ...Array.from({ length: 12 }, (_, i) => `n${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `m${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `w${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `a${i + 1}`),
    ...Array.from({ length: 3 }, (_, i) => `b${i + 1}`),
  ];
  const results = await Promise.all(
    candidates.map(async (id) => {
      try {
        const head = await fetch(`${baseUrl}trajectory/nodes/${id}.jsonl`, {
          method: "HEAD",
        });
        return head.ok ? id : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((id): id is string => id !== null);
}

async function loadTraceDocuments(baseUrl: string): Promise<TraceDocuments> {
  const [messagesText, nodeIds] = await Promise.all([
    fetchText(`${baseUrl}trajectory/messages.jsonl`),
    discoverNodeIds(baseUrl),
  ]);
  const messages: MessageEdge[] = messagesText
    ? parseJsonlLines<unknown>(messagesText)
        .map((row) => parseMessageLine(JSON.stringify(row)))
        .filter((m): m is MessageEdge => m !== null)
    : [];
  const nodeTexts = await Promise.all(
    nodeIds.map((id) => fetchText(`${baseUrl}trajectory/nodes/${id}.jsonl`)),
  );
  const turns: NodeTurn[] = [];
  for (const text of nodeTexts) {
    if (!text) continue;
    for (const row of parseJsonlLines<unknown>(text)) {
      const turn = parseNodeTurnLine(JSON.stringify(row));
      if (turn) turns.push(turn);
    }
  }
  const timelines = summarizeNodeTimeline(turns);
  const prs = extractPrReferences(messages);
  return { messages, timelines, prs, nodeIds };
}

export function TracePage({ route }: { route: TraceRoute }) {
  const baseUrl = runArtifactBaseUrl(route);
  const [state, setState] = useState<TraceState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadTraceDocuments(baseUrl)
      .then((docs) => {
        if (!cancelled) setState({ status: "ready", docs });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return (
    <article
      data-page="trace"
      data-trace-topology={route.topology}
      data-trace-suite={route.suite}
    >
      <p>
        <a href="#">{"<-"} All runs</a> ·{" "}
        <a href={buildRunHash(route)}>Run overview</a>
      </p>
      <h1>Trace: {formatRunLabel(route)}</h1>
      {state.status === "loading" && <p>Loading trace...</p>}
      {state.status === "error" && (
        <p data-testid="trace-error">Failed to load trace: {state.error}</p>
      )}
      {state.status === "ready" && <TraceSections docs={state.docs} />}
    </article>
  );
}

function TraceSections({ docs }: { docs: TraceDocuments }) {
  return (
    <>
      <MessageGraphSection messages={docs.messages} />
      <NodeTimelinesSection timelines={docs.timelines} />
      <PrListSection prs={docs.prs} />
    </>
  );
}

function MessageGraphSection({ messages }: { messages: MessageEdge[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graph = buildMessageGraphData(messages);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || graph.nodes.length === 0) return;
    const maxCount = graph.edges.reduce((m, e) => Math.max(m, e.count), 1);
    const cy = cytoscape({
      container,
      elements: [
        ...graph.nodes.map((n) => ({ data: { id: n.id, label: n.id } })),
        ...graph.edges.map((e) => ({
          data: {
            id: `${e.source}->${e.target}`,
            source: e.source,
            target: e.target,
            label: String(e.count),
            weight: e.count,
          },
        })),
      ],
      layout: { name: "circle", padding: 24 },
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#1f6feb",
            label: "data(label)",
            color: "#fff",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "12px",
            width: "44px",
            height: "44px",
          },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "line-color": "#8b949e",
            "target-arrow-color": "#8b949e",
            label: "data(label)",
            "font-size": "10px",
            "text-background-color": "#fff",
            "text-background-opacity": 1,
            "text-background-padding": "2px",
            width: `mapData(weight, 1, ${maxCount}, 1, 6)`,
          },
        },
      ],
      autoungrabify: true,
      userPanningEnabled: true,
      userZoomingEnabled: true,
    });
    return () => {
      cy.destroy();
    };
  }, [messages]);

  if (graph.nodes.length === 0) {
    return (
      <section data-section="message-graph">
        <h2>Message graph</h2>
        <p data-testid="message-graph-empty">
          No messages were recorded for this run.
        </p>
      </section>
    );
  }
  return (
    <section data-section="message-graph">
      <h2>Message graph</h2>
      <p>
        {messages.length} messages across{" "}
        {new Set(messages.map((m) => m.round)).size} rounds ·{" "}
        {graph.nodes.length} nodes · {graph.edges.length} directed edges (edge
        label = message count).
      </p>
      <div
        ref={containerRef}
        data-testid="message-graph-canvas"
        style={{
          width: "100%",
          height: "420px",
          border: "1px solid #d0d7de",
          borderRadius: "6px",
          background: "#f6f8fa",
        }}
      />
    </section>
  );
}

function NodeTimelinesSection({ timelines }: { timelines: NodeTimeline[] }) {
  if (timelines.length === 0) {
    return (
      <section data-section="node-timelines">
        <h2>Per-node timelines</h2>
        <p data-testid="timelines-missing">
          No node turn logs were found for this run.
        </p>
      </section>
    );
  }
  return (
    <section data-section="node-timelines">
      <h2>Per-node timelines</h2>
      <ul data-testid="timeline-list">
        {timelines.map((timeline) => (
          <li key={timeline.nodeId} data-node-id={timeline.nodeId}>
            <h3>{timeline.nodeId}</h3>
            <p>
              {timeline.totalTurns} turns ·{" "}
              {formatNumber(timeline.totalTokensIn)} tokens in ·{" "}
              {formatNumber(timeline.totalTokensOut)} tokens out
            </p>
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Out msgs</th>
                  <th>Tools</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {timeline.turns.map((turn) => (
                  <tr key={`${turn.round}-${turn.ts}`}>
                    <td>{turn.round}</td>
                    <td>{turn.outboundMessageCount}</td>
                    <td>{turn.toolCallCount}</td>
                    <td>{truncate(turn.summary, 160)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrListSection({ prs }: { prs: PrReference[] }) {
  if (prs.length === 0) {
    return (
      <section data-section="pr-list">
        <h2>Pull requests</h2>
        <p data-testid="pr-list-missing">
          No PR URLs were referenced in this run's messages.
        </p>
      </section>
    );
  }
  return (
    <section data-section="pr-list">
      <h2>Pull requests</h2>
      <table data-testid="pr-table">
        <thead>
          <tr>
            <th>PR</th>
            <th>First round</th>
            <th>First mentioned by</th>
            <th>Mentions</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((pr) => (
            <tr key={pr.url}>
              <td>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  #{pr.number}
                </a>
              </td>
              <td>{pr.firstSeenRound}</td>
              <td>{pr.firstMentionedBy}</td>
              <td>{pr.mentionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}
