# Distributed Test Playback Viewer

The distributed harness now writes playback artifacts for each scenario run under:

- `test-output/{scenario}/events.ndjson`
- `test-output/{scenario}/samples.ndjson`
- `test-output/{scenario}/snapshots.ndjson`
- `test-output/{scenario}/playback-manifest.json`
- `test-output/{scenario}/playback-viewer.html`

Use `test/distributed/harness/playback-viewer.html` to step through the run timeline.

## What It Shows

- High-level events: node lifecycle, chaos actions, load lifecycle, topology diffs
- Topology diagram: nodes, partitions, and replica placement links
- Per-node load: CPU, memory, RX/TX traffic at each step

## Open the Viewer

Serve the repository with a static file server (recommended):

```bash
npx serve .
```

Then open:

- `http://localhost:3000/test/distributed/harness/playback-viewer.html`
- `http://localhost:3000/test-output/<scenario>/playback-viewer.html`

## Load Data

Two options:

1. Upload files manually with file inputs in the viewer
2. Pass a manifest URL query parameter:

```text
http://localhost:3000/test/distributed/harness/playback-viewer.html?manifest=/test-output/<scenario>/playback-manifest.json
```

## Controls

- `Start`: jump to first event
- `Prev` / `Next`: step backward/forward
- `End`: jump to last event
- Keyboard: `ArrowLeft` and `ArrowRight`
