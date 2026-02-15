# Distributed SQL Callback Examples

This directory contains copyable callback examples ordered from basic to advanced.

## Order

1. `01-basic-iterator`
2. `02-stage-batching`
3. `03-plan-reduce-by-key`
4. `04-nested-bounded-call`
5. `05-guardrail-failure`

Each example directory contains:

- `index.js`: callback module source
- `example.manifest.json`: runtime + execution metadata
- `expected.json`: output contract used by runner and harness

## Run Locally Against a Node

```bash
node scripts/examples/build-upload-run.js \
  --target ws://127.0.0.1:8081/api/admin/stream
```

## Run Subset

```bash
node scripts/examples/build-upload-run.js \
  --target ws://127.0.0.1:8081/api/admin/stream \
  --include 01-basic-iterator,03-plan-reduce-by-key
```

The script uploads examples, executes them through `partition_callback`, and
writes an artifact under `test-output/examples/`.
