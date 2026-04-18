// Structured stderr logger for run observability.
//
// Output format: `<ISO timestamp> event="<event>" [key=value ...]`
//
// Values are quoted with JSON.stringify so embedded spaces and quotes are
// preserved without hand-rolled escaping. Numbers and booleans render bare.
//
// Context keys: runId, round, nodeId when relevant. Callers pass them in the
// fields record; the logger does not carry implicit context.

export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export type LogSink = (line: string) => void;

// Default sink is a no-op so test runs stay quiet. bench-cli calls
// `enableStderrLogSink()` on startup to actually emit lines during real runs.
let sink: LogSink = () => {};

export function setLogSink(nextSink: LogSink): void {
  sink = nextSink;
}

export function resetLogSink(): void {
  sink = () => {};
}

export function enableStderrLogSink(): void {
  sink = (line) => {
    process.stderr.write(`${line}\n`);
  };
}

export function formatLogLine(event: string, fields: LogFields = {}): string {
  const parts: string[] = [new Date().toISOString(), `event=${event}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(" ");
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    // Quote strings with JSON so spaces/quotes escape cleanly. Single-token
    // strings still get quoted (consistent parsing > pretty).
    return JSON.stringify(value);
  }
  return String(value);
}

export function logEvent(event: string, fields: LogFields = {}): void {
  sink(formatLogLine(event, fields));
}
