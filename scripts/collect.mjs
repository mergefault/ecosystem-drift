import { mkdir, readFile, writeFile } from "node:fs/promises";

const PACKAGES_PATH = "config/packages.json";
const HISTORY_PATH = "data/history.json";
const LATEST_PATH = "data/latest.json";
const NPM_REGISTRY = "https://registry.npmjs.org";

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function fetchPackage(name) {
  const response = await fetch(
    `${NPM_REGISTRY}/${encodeURIComponent(name)}`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${name}: ${response.status} ${response.statusText}`
    );
  }

  const metadata = await response.json();
  const version = metadata["dist-tags"]?.latest;

  if (!version) {
    throw new Error(`${name} does not expose a latest dist-tag`);
  }

  const manifest = metadata.versions?.[version];

  if (!manifest) {
    throw new Error(
      `${name}@${version} is missing from the registry metadata`
    );
  }

  return {
    version,
    publishedAt: metadata.time?.[version] ?? null,
    node: manifest.engines?.node ?? null,
    deprecated: manifest.deprecated ?? null,
    license: manifest.license ?? null
  };
}

function parseSemver(version) {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function classifyVersionChange(previous, current) {
  const from = parseSemver(previous);
  const to = parseSemver(current);

  if (!from || !to) {
    return "version";
  }

  if (from.major !== to.major) {
    return "major";
  }

  if (from.minor !== to.minor) {
    return "minor";
  }

  if (from.patch !== to.patch) {
    return "patch";
  }

  return "version";
}

function detectChanges(name, previous, current) {
  if (!previous) {
    return [];
  }

  const changes = [];

  if (previous.version !== current.version) {
    changes.push({
      package: name,
      type: classifyVersionChange(
        previous.version,
        current.version
      ),
      from: previous.version,
      to: current.version
    });
  }

  if (previous.node !== current.node) {
    changes.push({
      package: name,
      type: "engine",
      from: previous.node ?? null,
      to: current.node ?? null
    });
  }

  if (previous.deprecated !== current.deprecated) {
    changes.push({
      package: name,
      type: "deprecation",
      from: previous.deprecated ?? null,
      to: current.deprecated ?? null
    });
  }

  if (previous.license !== current.license) {
    changes.push({
      package: name,
      type: "license",
      from: previous.license ?? null,
      to: current.license ?? null
    });
  }

  return changes;
}

const packages = await readJson(PACKAGES_PATH, []);

const previousSnapshot = await readJson(LATEST_PATH, {
  packages: {}
});

const history = await readJson(HISTORY_PATH, []);

if (!Array.isArray(packages) || packages.length === 0) {
  throw new Error(
    "No packages configured in config/packages.json"
  );
}

if (!Array.isArray(history)) {
  throw new Error("Invalid history data");
}

const snapshot = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  packages: {}
};

const changes = [];

for (const name of packages) {
  console.log(`Checking ${name}...`);

  const current = await fetchPackage(name);

  snapshot.packages[name] = current;

  changes.push(
    ...detectChanges(
      name,
      previousSnapshot.packages?.[name],
      current
    )
  );
}

const historyEntry = {
  checkedAt: snapshot.checkedAt,
  packageCount: Object.keys(snapshot.packages).length,
  changes
};

history.push(historyEntry);

await mkdir("data", { recursive: true });

await Promise.all([
  writeFile(
    LATEST_PATH,
    `${JSON.stringify(snapshot, null, 2)}\n`
  ),

  writeFile(
    HISTORY_PATH,
    `${JSON.stringify(history, null, 2)}\n`
  )
]);

console.log(
  `Checked ${historyEntry.packageCount} packages; ` +
    `${changes.length} change${changes.length === 1 ? "" : "s"} detected.`
);