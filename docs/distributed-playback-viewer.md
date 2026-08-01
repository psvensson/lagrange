---
audience: development
---

# Distributed Test Playback Viewer

A browser tool for stepping through a recorded distributed test run after it
finishes — node lifecycle events, chaos actions, topology changes, and
per-node load over time. It is also linked per-run from the test-run dashboard
([admin-test-run-landing.md](admin-test-run-landing.md)).

The distributed harness writes the playback artifacts the viewer consumes for
each scenario run under:

- `test-output/{scenario}/events.ndjson`
- `test-output/{scenario}/samples.ndjson`
- `test-output/{scenario}/snapshots.ndjson`
- `test-output/{scenario}/playback-manifest.json`
- `test-output/{scenario}/playback-viewer.html`

Use `src/admin/static/playback-viewer.html` to step through the run timeline.

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

- `http://localhost:3000/src/admin/static/playback-viewer.html`
- `http://localhost:3000/test-output/<scenario>/playback-viewer.html`

## Load Data

Two options:

1. Upload files manually with file inputs in the viewer
2. Pass a manifest URL query parameter:

```text
http://localhost:3000/src/admin/static/playback-viewer.html?manifest=/test-output/<scenario>/playback-manifest.json
```

## Controls

- `Start`: jump to first event
- `Prev` / `Next`: step backward/forward
- `End`: jump to last event
- Keyboard: `ArrowLeft` and `ArrowRight`
