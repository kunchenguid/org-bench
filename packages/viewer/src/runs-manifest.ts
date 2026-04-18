export interface RunEntry {
  topology: string;
  seed: string;
  artifactPath: string;
}

export interface TopologyGroup {
  topology: string;
  runs: RunEntry[];
}

export function groupRunsByTopology(entries: RunEntry[]): TopologyGroup[] {
  const byTopology = new Map<string, RunEntry[]>();
  for (const entry of entries) {
    const bucket = byTopology.get(entry.topology);
    if (bucket) {
      bucket.push(entry);
    } else {
      byTopology.set(entry.topology, [entry]);
    }
  }
  return [...byTopology.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topology, runs]) => ({
      topology,
      runs: [...runs].sort((a, b) => a.seed.localeCompare(b.seed)),
    }));
}
