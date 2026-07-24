# Distributed SQL Callback Examples

This example shows how to write SQL callback modules and run them against a
live Lagrange node. You will upload each callback, execute it through
`partition_callback`, and check its output against a committed contract.

## What's inside

Six copyable examples, ordered from basic to advanced:

1. `01-basic-iterator`
2. `02-stage-batching`
3. `03-plan-reduce-by-key`
4. `04-nested-bounded-call`
5. `05-guardrail-failure`
6. `06-wasm-remote-replica` — JavaScript-envelope rehearsal (see capability notes)

Each example directory contains:

- `index.js`: callback module source
- `example.manifest.json`: runtime + execution metadata
- `expected.json`: output contract used by runner and harness

## Run it

1. Start a node if one is not already running (from the repo root):

   ```bash
   npm start
   ```

2. In another terminal, point the runner at the node's admin websocket:

   ```bash
   node scripts/examples/build-upload-run.js \
     --target ws://127.0.0.1:8081/api/admin/stream
   ```

To run a subset, pass `--include`:

```bash
node scripts/examples/build-upload-run.js \
  --target ws://127.0.0.1:8081/api/admin/stream \
  --include 01-basic-iterator,03-plan-reduce-by-key
```

Useful flags:

- `--include <id1,id2>`: only run selected examples.
- `--exclude <id1,id2>`: skip selected examples.
- `--examplesDir <path>`: use a custom examples directory.
- `--out <path>`: write artifact to a specific file.

## What to expect

Each example uploads, executes through `partition_callback`, is validated
against `expected.json`, and leaves an artifact under `test-output/examples/`.

## Capability notes

**Service portability status:** the machine-readable support matrix is
[`docs/service-portability-capabilities.json`](../../docs/service-portability-capabilities.json).
A few notes:

- This directory demonstrates the callback path described by that
  current-state contract, not the deployment surface. Service deployment is
  declared through INSTALL SERVICE and CREATE BINDING (see
  [`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md));
  the callback path here predates it.
- Managed OCI container execution is not implemented yet. `native_js` is
  kernel-internal, and OCI callback invocation remains unsupported.
- The sixth example exercises the current `wasm_component` routing and
  lifecycle scaffolding, but its input is JavaScript. It is not a WebAssembly
  binary or component, so do not use it for deployment-size or
  WASM-performance claims.

## Under the hood

The runner (`scripts/examples/build-upload-run.js`) supports two runtime kinds:

- `native_js`: uploads raw JS source as `code.code_blob`.
- `wasm_component`: for the internal rehearsal only, packages JS into a
  serialized artifact envelope (`js_wasm_component_v1`) and uploads that
  artifact as `code.code_blob`.

For `wasm_component`, the packaging step:

1. Reads `index.js` from the example directory.
2. Verifies the configured callback export exists (for example, `run`).
3. Builds a `js_wasm_component_v1` blob that includes:
   - original source (`source`)
   - encoded wasm bytes field (`wasmBytesBase64`)
   - run export metadata (`runExport`, `exports`)
4. Selects executor type `wasm_service`.

Note: this construction does not compile JavaScript to WASM. The runtime
later evaluates the source as JavaScript. A genuine component engine,
component ABI, OCI installation path, and public invocation contract are
separate cutovers.

For each packaged example, the runner then performs:

1. `INSERT OR REPLACE INTO code`:
   - `function_id`, `function_name`, `executor_type`, `code_blob`, signature, timestamps.
2. `INSERT OR REPLACE INTO module_manifests`:
   - namespace/name/version/digest, `run_export`, `exports`, and artifact pointer.
3. Executes `partition_callback` with:
   - `statement` from manifest
   - `callbackModuleRef` = uploaded `function_id`
   - `callbackExport`
   - `runtimeKind`
4. Validates output using `expected.json` (`shape`, `minRows`, `firstRow` contract).
5. Writes artifact JSON under `test-output/examples/` (or `--out`).

The distributed scenario `test/distributed/scenarios/examples-catalog.js` runs
the same runner (`runExamplesCatalog`), so the examples you copy from here are
also exercised as regression tests.
