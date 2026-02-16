# Distributed SQL Callback Examples

This directory contains copyable callback examples ordered from basic to advanced.

## Order

1. `01-basic-iterator`
2. `02-stage-batching`
3. `03-plan-reduce-by-key`
4. `04-nested-bounded-call`
5. `05-guardrail-failure`
6. `06-wasm-remote-replica`

Each example directory contains:

- `index.js`: callback module source
- `example.manifest.json`: runtime + execution metadata
- `expected.json`: output contract used by runner and harness

## JS to WASM Process (Current Runtime Contract)

The examples runner (`scripts/examples/build-upload-run.js`) supports two runtime kinds:

- `native_js`: uploads raw JS source as `code.code_blob`.
- `wasm_component`: packages JS into a serialized artifact envelope
  (`js_wasm_component_v1`) and uploads that artifact as `code.code_blob`.

For `wasm_component`, the packaging step currently does:

1. Reads `index.js` from the example directory.
2. Verifies the configured callback export exists (for example, `run`).
3. Builds a `js_wasm_component_v1` blob that includes:
   - original source (`source`)
   - encoded wasm bytes field (`wasmBytesBase64`)
   - run export metadata (`runExport`, `exports`)
4. Selects executor type `wasm_service`.

This means the "compile" step in the current implementation is artifact
construction for the runtime contract, not yet an external JS->WASM toolchain
compile (for example `jco`/`javy`).

## Upload and Execution Lifecycle

For each packaged example, the runner performs:

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

## Integration with Distributed Harness

The distributed scenario `test/distributed/scenarios/examples-catalog.js` calls
the same runner (`runExamplesCatalog`) that local CLI uses. That keeps one
owner for packaging/upload/execute logic and makes examples both:

- end-user copyable examples
- distributed harness regression tests

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

## Useful CLI Flags

- `--include <id1,id2>`: only run selected examples.
- `--exclude <id1,id2>`: skip selected examples.
- `--examplesDir <path>`: use a custom examples directory.
- `--out <path>`: write artifact to a specific file.

The script uploads examples, executes them through `partition_callback`, and
writes an artifact under `test-output/examples/`.
