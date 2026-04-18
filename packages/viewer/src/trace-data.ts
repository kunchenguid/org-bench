export interface TraceRoute {
  topology: string;
}

export interface MessageEdge {
  round: number;
  from: string;
  to: string;
  tag: string;
  content: string;
  ts: string;
}

export interface NodeTurn {
  nodeId: string;
  round: number;
  ts: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  summary: string;
  outboundMessageCount: number;
  toolCallCount: number;
}

export interface NodeTimeline {
  nodeId: string;
  turns: NodeTurn[];
  totalTurns: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface GraphNode {
  id: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  count: number;
  firstRound: number;
  lastRound: number;
}

export interface MessageGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PrReference {
  url: string;
  number: number;
  firstSeenRound: number;
  firstMentionedBy: string;
  mentionCount: number;
}

const TRACE_HASH_PREFIX = "#trace/";

export function parseTraceRoute(hash: string): TraceRoute | null {
  if (!hash.startsWith(TRACE_HASH_PREFIX)) return null;
  const parts = hash
    .slice(TRACE_HASH_PREFIX.length)
    .split("/")
    .filter((p) => p.length > 0);
  if (parts.length !== 1) return null;
  return { topology: parts[0]! };
}

export function buildTraceHash(route: TraceRoute): string {
  return `${TRACE_HASH_PREFIX}${route.topology}`;
}

export function parseJsonlLines<T>(raw: string): T[] {
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

interface RawMessage {
  round?: unknown;
  from?: unknown;
  to?: unknown;
  tag?: unknown;
  content?: unknown;
  ts?: unknown;
}

export function parseMessageLine(line: string): MessageEdge | null {
  let parsed: RawMessage;
  try {
    parsed = JSON.parse(line) as RawMessage;
  } catch {
    return null;
  }
  if (
    typeof parsed.round !== "number" ||
    typeof parsed.from !== "string" ||
    typeof parsed.to !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.content !== "string" ||
    typeof parsed.ts !== "string"
  ) {
    return null;
  }
  return {
    round: parsed.round,
    from: parsed.from,
    to: parsed.to,
    tag: parsed.tag,
    content: parsed.content,
    ts: parsed.ts,
  };
}

interface RawNodeTurn {
  node_id?: unknown;
  round?: unknown;
  ts?: unknown;
  tokens?: { in?: unknown; out?: unknown };
  latency_ms?: unknown;
  output?: { summary?: unknown; messages?: unknown };
  tool_calls?: unknown;
}

export function parseNodeTurnLine(line: string): NodeTurn | null {
  let parsed: RawNodeTurn;
  try {
    parsed = JSON.parse(line) as RawNodeTurn;
  } catch {
    return null;
  }
  if (
    typeof parsed.node_id !== "string" ||
    typeof parsed.round !== "number" ||
    typeof parsed.ts !== "string" ||
    !parsed.tokens ||
    typeof parsed.tokens.in !== "number" ||
    typeof parsed.tokens.out !== "number" ||
    typeof parsed.latency_ms !== "number"
  ) {
    return null;
  }
  const summary =
    parsed.output && typeof parsed.output.summary === "string"
      ? parsed.output.summary
      : "";
  const outboundMessageCount = Array.isArray(parsed.output?.messages)
    ? parsed.output!.messages.length
    : 0;
  const toolCallCount = Array.isArray(parsed.tool_calls)
    ? parsed.tool_calls.length
    : 0;
  return {
    nodeId: parsed.node_id,
    round: parsed.round,
    ts: parsed.ts,
    tokensIn: parsed.tokens.in,
    tokensOut: parsed.tokens.out,
    latencyMs: parsed.latency_ms,
    summary,
    outboundMessageCount,
    toolCallCount,
  };
}

export function summarizeNodeTimeline(turns: NodeTurn[]): NodeTimeline[] {
  const byNode = new Map<string, NodeTurn[]>();
  for (const turn of turns) {
    const bucket = byNode.get(turn.nodeId);
    if (bucket) bucket.push(turn);
    else byNode.set(turn.nodeId, [turn]);
  }
  return [...byNode.entries()]
    .sort(([a], [b]) => compareNodeIds(a, b))
    .map(([nodeId, group]) => {
      const sorted = [...group].sort((a, b) => a.round - b.round);
      return {
        nodeId,
        turns: sorted,
        totalTurns: sorted.length,
        totalTokensIn: sorted.reduce((sum, t) => sum + t.tokensIn, 0),
        totalTokensOut: sorted.reduce((sum, t) => sum + t.tokensOut, 0),
      };
    });
}

function compareNodeIds(a: string, b: string): number {
  if (a === "leader") return -1;
  if (b === "leader") return 1;
  return a.localeCompare(b);
}

export function buildMessageGraphData(
  messages: MessageEdge[],
): MessageGraphData {
  const nodeIds = new Set<string>();
  const edgeMap = new Map<string, GraphEdge>();
  for (const msg of messages) {
    nodeIds.add(msg.from);
    nodeIds.add(msg.to);
    const key = `${msg.from}->${msg.to}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.count += 1;
      if (msg.round < existing.firstRound) existing.firstRound = msg.round;
      if (msg.round > existing.lastRound) existing.lastRound = msg.round;
    } else {
      edgeMap.set(key, {
        source: msg.from,
        target: msg.to,
        count: 1,
        firstRound: msg.round,
        lastRound: msg.round,
      });
    }
  }
  const nodes = [...nodeIds].sort(compareNodeIds).map((id) => ({ id }));
  const edges = [...edgeMap.values()].sort((a, b) => {
    const s = compareNodeIds(a.source, b.source);
    return s !== 0 ? s : compareNodeIds(a.target, b.target);
  });
  return { nodes, edges };
}

const PR_URL_PATTERN = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/g;

export function extractPrReferences(messages: MessageEdge[]): PrReference[] {
  const refs = new Map<string, PrReference>();
  const ordered = [...messages].sort((a, b) => a.round - b.round);
  for (const msg of ordered) {
    PR_URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PR_URL_PATTERN.exec(msg.content)) !== null) {
      const url = match[0];
      const number = Number(match[1]);
      const existing = refs.get(url);
      if (existing) {
        existing.mentionCount += 1;
      } else {
        refs.set(url, {
          url,
          number,
          firstSeenRound: msg.round,
          firstMentionedBy: msg.from,
          mentionCount: 1,
        });
      }
    }
  }
  return [...refs.values()].sort((a, b) => a.number - b.number);
}
