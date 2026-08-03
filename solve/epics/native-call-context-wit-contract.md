---
epicContractVersion: 2
id: native-call-context-wit-contract
roadmapRow: null
graduatesTo: null
---

# Native call-context WIT contract

## Intent (why now)

Rung 1 of [[callback-axis-retirement]] (`solve/epics/callback-axis-retirement.md`)
needs a public `call`/`pushdown` context "rich enough" to replace the legacy
JS-only `ctx.emit` / `ctx.call` surface. Operator direction (2026-08-01): that
contract MUST be a WIT interface, not a JavaScript API — the fan-out/reduce
surface should be language-neutral from its first public day, exactly as the
request path already is (`lagrange:cell/context` runs WAT- and
ComponentizeJS-built components identically). Authoring the emit/reduce API
as WIT gives Rust/Go/Python/JS parity for free, moves guardrail enforcement
(fuel, memory, deadlines, budgets) to the component boundary, and avoids
investing in the JS envelope the retirement epic exists to delete. Invocation
*mechanics* remain owned by the minimal-deployment-surface "Non-request
source invocation" follow-on; this epic owns only the contract shape.

## Contract (sealed 2026-08-02; canonical text)

The sealed WIT world now ships as the canonical authoring artifact
[`wit/world.wit`](../../wit/world.wit) (originally landed as the ABI
fixture `test/wasm-service/fixtures/call-cell-world/wit/world.wit`)
(`package lagrange:cell`, interface `call-context`, world `call-cell`),
validated with `wasm-tools component wit` and exercised by
`test/wasm-service/call-cell-world-abi.test.js`; the normative contract text
lives in
[`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md).
One artifact carries both `run` and `reduce` exports: the shard function and
the reducer are authored, tested, and versioned together, then materialized
apart — the coherent-developer-view / distributed-execution split the native
model promises.

## Design decisions (sealed)

1. **Rows arrive via the Binding-declared statement, not a `query()`
   import.** The Binding declares the partition-local SQL; the engine narrows
   and groups BEFORE the boundary, and the component's `run` sees only the
   bounded batch. This preserves the MovieLens transfer-shape lesson (raw
   rows never cross into policy code; exchange bounded near `R × K`), keeps
   the caller's unit of intent "data plus operation", and avoids
   reintroducing a general database client with per-row canonical-ABI copy
   costs and an unreviewable capability surface. Consequence: no table
   read/write imports in `call-context` v1.
2. **Conservative ABI.** Plain synchronous functions, list arguments, JSON
   strings for opaque payloads — matching the request world's
   `run: func(request: string) -> string` convention. No resources, streams,
   or async until the component-model stream surface stabilizes.
3. **Budgets are Binding-declared, boundary-enforced.** Exceeding one
   returns `budget-exhausted` (fail-closed, typed) rather than relying on
   cooperative supervision as the legacy JS envelope does.

## Legacy-parity map (rung-1 "rich enough" test)

| Legacy surface (examples/distributed-sql) | Contract answer |
| --- | --- |
| 01 batch iteration | `run(batch: list<row>)` |
| 02 stage batching | engine-side batch bounds via declared statement |
| 03 `ctx.emit` + reduceByKey | `emit(key, partial)` + `reduce(partials)` |
| 04 nested bounded call | `call-bounded(export-name, argument)` |
| 05 guardrail failure | typed `deny-code`, Binding-declared budgets |

## Typed-API ladder (prerequisites for a v2 typed contract)

The v1 contract above is typed only at the batch (`cell-value`); payloads
stay JSON strings. Replacing them with per-operation WIT records — e.g.
`run(batch: list<movie-rating>) -> ranking-partial` — needs, in order:

1. **One SQL→WIT type mapping.** A sealed, versioned mapping from engine
   column types to WIT types (numeric fidelity, blobs, time, NULL). Depends
   on [[query-access-path-ladder]] rung 1 (typed key ordering): today three
   disagreeing key orders exist, so column typing is not yet authoritative.
2. **Statement result-shape derivation.** The engine must statically type
   the declared statement's projection at Binding compile time, producing a
   result-shape digest pinned beside `manifest_digest` so schema drift
   fails closed at activation, not mid-invocation.
3. **Per-Binding WIT emission + world-compat check.** Generate the typed
   world from the derived shape; `INSTALL SERVICE` / activation verifies
   the artifact was built against it (bindgen via jco / wit-bindgen per
   language). Evolution policy rides the single-version service contract.
4. **Boundary cost evidence.** Canonical-ABI lift/lower copies typed lists;
   measure typed vs JSON payloads before committing the default. Owner: the
   comparative-efficiency program — its 2026-08-01 decision preregisters
   the WASI call-cell path as a paired matrix arm beside PostgreSQL,
   Lagrange SQL, and `native_js`
   (`comparative-workload-efficiency-evidence.md`), so this evidence falls
   out of the real distributed runs, not an ad-hoc microbenchmark.
5. **Typed capability catalog.** Introduce a sealed capability enum derived
   from the `CONFIGURE SERVICE ACCESS` grammar (v1 has no probe at all; the
   request world's u32 probe is unaffected); typed deny reasons throughout.

Rungs 1–2 are the real gate; 3–5 are mechanical once shapes are derivable.

## Open questions

None. The four contract questions below are sealed (see decision log,
2026-08-02) and the sealed text now lives in
[`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md),
which owns the contract from this point; this epic keeps the design rationale
and the typed-API ladder.

## Decision log

- 2026-08-02 — Pushdown sealed by quest `native-call-context-contract-sealing`:
  pushdown shares the `call-cell` world; a pushdown invocation IS the
  Binding-declared statement, and the shared `arguments` parameter degenerates
  to the empty JSON object (one world, no second signature).
- 2026-08-02 — Reduce placement sealed: reduce runs on any replica of the
  reducing service under lease, with exactly-once *visible* final snapshot
  (atomic result-row replace over a complete, fresh, disjoint partial set, per
  `src/runtime/sql-query-loop-parallel-reduce.js`) — not exactly-once reduce
  execution.
- 2026-08-02 — Capability probe sealed: dropped from `call-context` v1; the
  request world's `lagrange:cell/context` keeps its own u32 probe, and a typed
  enum derived from the `CONFIGURE SERVICE ACCESS` grammar replaces it when
  the catalog exists (ladder rung 5). No production guest ever invokes the
  u32 probe today (host stub only).
- 2026-08-02 — Batch bound sealed: the per-invocation batch limit is
  Binding-declared like every other budget; exceeding it fails closed with
  typed `budget-exhausted`. The call/pushdown Binding source contract gains an
  optional declared partition-local `statement` (create-only; legacy
  `{kind, name}` registrations stay valid but are not invocable). The legacy
  axis carries statements transiently at the call site
  (`wasm-call-adapter.js`), so the declared statement is a new durable
  declaration, not a carry-over.

- 2026-08-01 — Epic created on operator direction: the rung-1 emit/reduce
  contract is WIT-first and language-neutral; JS is one producer among
  many via ComponentizeJS. WIT sketch validated with
  `wasm-tools component wit`. Contract shape owned here; invocation
  mechanics stay with minimal-deployment-surface; retirement gating stays
  with callback-axis-retirement.
