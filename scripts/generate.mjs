import { mkdir, readFile, writeFile } from "node:fs/promises";

const LATEST_PATH = "data/latest.json";
const HISTORY_PATH = "data/history.json";
const OUTPUT_DIRECTORY = "docs/data";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [latest, history] = await Promise.all([
  readJson(LATEST_PATH),
  readJson(HISTORY_PATH)
]);

if (!latest?.packages || typeof latest.packages !== "object") {
  throw new Error("Invalid latest snapshot");
}

if (!Array.isArray(history)) {
  throw new Error("Invalid history");
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });

await Promise.all([
  writeFile(
    `${OUTPUT_DIRECTORY}/latest.json`,
    `${JSON.stringify(latest, null, 2)}\n`
  ),
  writeFile(
    `${OUTPUT_DIRECTORY}/history.json`,
    `${JSON.stringify(history, null, 2)}\n`
  )
]);

console.log(
  `Generated dashboard data for ${Object.keys(latest.packages).length} packages.`
);