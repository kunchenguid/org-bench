import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { TrajectoryJsonSchemas } from "./index.js";

const outputDir = resolve(process.cwd(), "..", "..", "schemas", "trajectory");

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  for (const [fileName, schema] of Object.entries(TrajectoryJsonSchemas)) {
    const outputPath = resolve(outputDir, `${fileName}.schema.json`);
    await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  }
}

void main();
