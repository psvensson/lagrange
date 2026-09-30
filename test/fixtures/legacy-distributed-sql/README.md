# Distributed SQL Callback Examples (legacy surface)

> **Legacy.** This directory documents Lagrange's pre-Binding callback
> mechanism. It is kept deliberately, as a historical artifact of how
> partition-local execution grew up - compatibility-and-internals
> reading, not an on-ramp. Nothing here is how services are authored,
> deployed, or invoked today.

## The problem this example addresses

Lagrange's central move is running application logic *next to* each data
partition instead of pulling rows out to an application tier (see the
[examples overview](../../../examples/README.md)). Before the current Artifact / Binding /
Cell deployment surface existed, Lagrange had an earlier way to do this:
upload a JavaScript **callback module** and execute it through the
`partition_callback` mechanism, which runs the callback against partition data
on a live node.

This directory demonstrates that **older callback surface**. It is worth
studying to understand partition-local execution mechanics - how a statement
plus a callback fan out over partition rows, batch stages, and reduce by key -
but it predates Bindings. Everything this surface rehearsed now has a
public successor: a `call` Binding declares the statement, the WASM
component's `run` export does the partition-local work, and its `reduce`
export folds the partials -
[call-binding-account-summary](../../../examples/call-binding-account-summary/README.md)
is the runnable example. The
[request-binding examples](../../../examples/request-binding-deployment/README.md) show
the same deployment surface for HTTP endpoints, and
[Current Capabilities And Limitations](../../../docs/current-capabilities-and-limitations.md)
is the status authority.

### Translate the old vocabulary to the current surface

If you read these examples to understand mechanics, map the old terms like
this rather than carrying them into new code:

| Legacy example concept | Current public concept |
| --- | --- |
| callback module in `index.js` | `distributed({run, reduce, statement})` in a service |
| callback manifest | compiler-generated Artifact / Binding records |
| `partition_callback` execution mode | `CALL BINDING` or handler `call(...)` |
| callback return / plan reduction | bounded `emit()` partials plus `reduce()` |
| uploaded JavaScript envelope | genuine WASI component on the public service path |

The useful idea that survives is partition-local execution. The deployment
and invocation mechanism around it has changed.

## What's inside

Six copyable examples, ordered from basic to advanced:

1. `01-basic-iterator` - **row-by-row local lookup.** One partition batch
   arrives, each input row drives a bounded lookup, and the callback returns
   rows annotated with the partition that processed them. Read this for the
   simplest picture of "work is already running beside one partition."
2. `02-stage-batching` - **bounded nested staging.** Distinct node IDs are
   looked up in one bounded query, then its result is delivered to a stage
   callback two rows at a time. This separates SQL result size from callback
   batch size.
3. `03-plan-reduce-by-key` - **exchange compact records, then reduce.** Rows
   are emitted under `status` keys and the reduce stage receives grouped
   records. The current analogue is call-Binding `emit()` plus `reduce()`.
4. `04-nested-bounded-call` - **nested work with an explicit bound.** Each
   outer row may query `config`, but `LIMIT 1` keeps the nested work
   proportional to the input batch instead of creating unbounded fan-out.
5. `05-guardrail-failure` - **a negative example.** It deliberately attempts
   an unbounded nested call. The expected result is refusal, demonstrating
   that boundedness is enforced rather than left to caller discipline.
6. `06-wasm-remote-replica` - **historical routing/lifecycle rehearsal.** It
   performs a bounded lookup while exercising the old `wasm_component` route,
   but the artifact is a JavaScript envelope, not a genuine WebAssembly
   component. Use the request-Binding examples for the current WASI path.

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

Note: the per-example `index.js` files are callback modules loaded by the
runner, not standalone programs; `node index.js` does nothing on its own.

## What to expect

Each example uploads, executes through `partition_callback`, is validated
against `expected.json`, and leaves an artifact under `test-output/examples/`.

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  SRC["index.js<br/>+ example.manifest.json"]:::ctrl
  RUN["build-upload-run.js"]:::move
  UP["upload:<br/>code + module_manifests rows"]:::svc
  EXEC["partition_callback<br/>runs callback beside<br/>partition data"]:::data
  VAL["validate against<br/>expected.json"]:::ctrl
  ART["artifact JSON under<br/>test-output/examples/"]:::move

  SRC --> RUN --> UP --> EXEC --> VAL --> ART

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef move fill:#ede9fe,stroke:#6d28d9,color:#2e1065
```

## Capability notes - read before drawing conclusions

The authoritative status is
[Current Capabilities And Limitations](../../../docs/current-capabilities-and-limitations.md).
A few notes:

- This directory demonstrates the **legacy callback path**, not the deployment
  surface. Service deployment is declared through `INSTALL SERVICE` and
  `CREATE BINDING` (see
  [`architecture/minimal-deployment-surface.md`](../../../architecture/minimal-deployment-surface.md));
  the callback path here predates it. Partition-local execution with
  reduction is publicly invocable today via `CALL BINDING` (see
  [call-binding-account-summary](../../../examples/call-binding-account-summary/README.md)).
- Managed [OCI](https://opencontainers.org/) container execution is not
  implemented yet. `native_js` is kernel-internal, and OCI callback invocation
  remains unsupported.
- The sixth example exercises the current `wasm_component` routing and
  lifecycle scaffolding, **but its input is JavaScript, not a
  [WebAssembly](https://webassembly.org/) binary or component**. The runtime
  later evaluates the source as JavaScript. Do not use it for deployment-size
  or WASM-performance claims. For genuine WASI components, use the
  [request-binding examples](../../../examples/request-binding-deployment/README.md).

## Under the hood

The runner (`scripts/examples/build-upload-run.js`) supports two runtime
kinds:

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

Again: this construction does **not** compile JavaScript to WASM. A genuine
component engine, component ABI, OCI installation path, and public invocation
contract are separate cutovers - the real compile-JS-to-component path exists
today in
[`js-request-binding-deployment`](../../../examples/js-request-binding-deployment/README.md),
which uses
[ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS).

For each packaged example, the runner then performs:

1. `INSERT OR REPLACE INTO code`:
   - `function_id`, `function_name`, `executor_type`, `code_blob`, signature,
     timestamps.
2. `INSERT OR REPLACE INTO module_manifests`:
   - namespace/name/version/digest, `run_export`, `exports`, and artifact
     pointer.
3. Executes `partition_callback` with:
   - `statement` from manifest
   - `callbackModuleRef` = uploaded `function_id`
   - `callbackExport`
   - `runtimeKind`
4. Validates output using `expected.json` (`shape`, `minRows`, `firstRow`
   contract).
5. Writes artifact JSON under `test-output/examples/` (or `--out`).

The distributed scenario `test/distributed/scenarios/examples-catalog.js` runs
the same runner (`runExamplesCatalog`), so the examples you copy from here are
also exercised as regression tests.
