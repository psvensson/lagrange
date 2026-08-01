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

## Proposed contract (validated with `wasm-tools component wit`)

```wit
package lagrange:cell;

interface call-context {
  variant cell-value { null-value, integer(s64), real(f64), text(string) }
  record column { name: string, val: cell-value }
  record row { columns: list<column> }
  enum deny-code { undeclared-capability, budget-exhausted, invalid-argument }

  /// Publish one bounded partial under a key. The runtime enforces the
  /// Binding-declared per-invocation emit budget.
  emit: func(key: string, partial: string) -> result<_, deny-code>;

  /// Bounded nested invocation of another declared export.
  call-bounded: func(export-name: string, argument: string)
    -> result<string, deny-code>;

  /// Existing request-context capability probe, carried over unchanged.
  capability: func(capability: u32) -> s32;
}

world call-cell {
  use call-context.{row};
  import call-context;

  /// Partition-local work: receives the Binding-declared statement's
  /// grouped, bounded batch. Returns this shard's partial as JSON.
  export run: func(batch: list<row>, arguments: string) -> string;

  /// Reduction: folds the published partials into the final result.
  export reduce: func(partials: list<tuple<string, string>>,
    arguments: string) -> string;
}
```

One artifact carries both exports: the shard function and the reducer are
authored, tested, and versioned together, then materialized apart — the
coherent-developer-view / distributed-execution split the native model
promises.

## Design decisions (proposed, to seal at spec time)

1. **Rows arrive via the Binding-declared statement, not a `query()`
   import.** The Binding (schema v2, `on <source> run <export>`) declares
   the partition-local SQL; the engine narrows and groups BEFORE the
   boundary, and the component's `run` sees only the bounded batch. This
   preserves the MovieLens transfer-shape lesson (raw rows never cross into
   policy code; exchange bounded near `R × K`), keeps the caller's unit of
   intent "data plus operation", and avoids reintroducing a general database
   client with per-row canonical-ABI copy costs and an unreviewable
   capability surface. Consequence: no table read/write imports in
   `call-context` v1 — a call Cell computes over its batch and emits.
2. **Conservative ABI.** Plain synchronous functions, list arguments, JSON
   strings for opaque payloads (`partial`, `arguments`, results) — matching
   the request world's `run: func(request: string) -> string` convention.
   No resources, no streams, no async until the component-model stream
   surface stabilizes; typed `cell-value` covers batch columns only.
3. **Budgets are Binding-declared, boundary-enforced.** Emit count, nested
   call depth/fan-out, fuel, and memory are declarations on the Binding;
   exceeding one returns `budget-exhausted` (fail-closed, typed) rather
   than relying on cooperative supervision as the legacy JS envelope does.

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
   measure representative batch shapes vs JSON parse using the existing
   comparative-efficiency harness before committing the default.
5. **Typed capability catalog.** Replace `capability: u32 -> s32` with a
   sealed enum derived from the `CONFIGURE SERVICE ACCESS` grammar; typed
   deny reasons throughout.

Rungs 1–2 are the real gate; 3–5 are mechanical once shapes are derivable.

## Open questions

- Does `pushdown` share this world or bind the statement itself as the
  invocation (no `arguments` channel)? Sealed at spec time with the
  minimal-deployment-surface follow-on.
- Where does `reduce` run — any replica under lease (MovieLens pattern:
  `sql-query-loop-parallel-reduce.js` leases + atomic snapshot), or a
  runtime-chosen singleton? Contract only requires: exactly-once visible
  final snapshot.
- Is `capability` still `u32 -> s32` here, or does the call world drop it
  until a typed capability enum exists?
- Batch memory bound: max rows/bytes per `run` invocation and the typed
  refusal when the declared statement exceeds it.

## Decision log

- 2026-08-01 — Epic created on operator direction: the rung-1 emit/reduce
  contract is WIT-first and language-neutral; JS is one producer among
  many via ComponentizeJS. WIT sketch validated with
  `wasm-tools component wit`. Contract shape owned here; invocation
  mechanics stay with minimal-deployment-surface; retirement gating stays
  with callback-axis-retirement.
