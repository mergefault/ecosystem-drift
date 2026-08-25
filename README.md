# ecosystem-drift

Tracks changes across a curated set of JavaScript packages.

The tracker periodically reads package metadata from the npm registry and records changes to:

- latest versions
- Node.js engine requirements
- deprecation status
- licenses

Historical observations are retained in the repository and exposed through a small static dashboard.

## How it works

```text
npm registry
     ↓
collector
     ↓
snapshot + change detection
     ↓
history
     ↓
static dashboard
```

Collection runs automatically through GitHub Actions.

## Data

`data/latest.json` contains the current snapshot.

`data/history.json` contains historical observations and detected changes.

The tracked package set is defined in `config/packages.json`.

## Development

Requires Node.js 24 or newer.

```bash
npm run collect
npm run generate
```

No runtime dependencies are required.

## License

MIT