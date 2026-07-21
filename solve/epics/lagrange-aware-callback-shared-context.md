---
id: lagrange-aware-callback-shared-context
roadmapRow: null
status: discussing
graduatesTo: service-portability-ladder
---

# Epic: Rung 2 — one Lagrange-aware callback surface with a shared service context

## Intent (why now)

The deployment story is a three-rung ladder (decided 2026-07-21, decision log
below):

1. **Rung 1 — bring your container.** An unchanged PostgreSQL-talking
   application, packaged as an OCI container, installed as a Lagrange-managed
   service; the cluster places its replicas near the data they access. This is
   the expected most-common early adoption path, and the MovieLens demo is its
   showcase. Owned by `solve/specs/service-portability-ladder/` phases 0–2.
2. **Rung 2 — Lagrange-aware callbacks.** The developer hands compute directly
   to the cluster, which ships it to the partition owners. Strictly more
   efficient than rung 1 (compute moves to the data instead of the service
   merely sitting near it), at the cost of writing against the `ctx` surface.
   **This epic.**
3. **Rung 3 — WASM components.** Portable, sandboxed packaging of rung-2-shaped
   compute. Ladder spec phase 3.

Rung 2 exists today as **two** surfaces that a newcomer must choose between:

- **embedded** — `runtime.run(fn)` from the developer's own Node process
  (`src/query/runtime-runner.js`);
- **uploaded** — a callback module plus manifest stored in the cluster's
  `code` / `module_manifests` tables and driven by the manifest `SELECT`
  through `partition_callback` (`scripts/examples/build-upload-run.js`).

Both execute the same `run(ctx)` contract against the same `ctx` surface
(`call`/`out`/`lookup`/`emit`/`broadcast`). The real differences are only
durability, naming, and who initiates execution. The direction under
discussion is to **merge them into one callback-module surface**.

The merge's known hard edge is state: an in-process closure can capture ambient
scope that does not survive serialization or replication. The decided design
direction is **not** to chase closure-capture semantics. Instead, a service
provides a **shared service context** — a redis-like keyed store scoped to the
service and shared across its replicas — that the Lagrange-aware developer
knowingly reads and writes. Cross-replica and cross-invocation state goes
there; callback code itself stays stateless and serialization-safe.

## Ground truth (surveyed 2026-07-21)

- `runtime.run(userFn, opts)` exists (`src/query/runtime-runner.js`, surfaced
  through `src/query/index.js`; `run` is a standalone alias). The function is
  serialized and shipped to partition-owning nodes.
- The uploaded path exists end to end for examples:
  `scripts/examples/build-upload-run.js` packages, `INSERT OR REPLACE INTO
  code` + `module_manifests`, then executes `partition_callback` with
  `callbackModuleRef`, `callbackExport`, `runtimeKind`
  (`examples/distributed-sql/README.md` documents the lifecycle).
- `docs/service-portability-capabilities.json` is the machine-readable claim:
  external install unsupported for all runtime kinds; `native_js` is
  kernel-internal; `wasm_component` is a JS-envelope rehearsal.
- **No shared-state surface across service replicas exists today.** Service
  replicas coordinate only through SQL tables they own by convention; there is
  no keyed context store, no `ctx` accessor for one, and no contract for its
  consistency or lifecycle.
- The affinity/placement machinery treats runtime services as first-class
  placement entities (see epic `service-data-affinity-placement`), so a
  shared-context store implemented as replicated partitions would itself be
  subject to placement — the interplay is an open question below.

## Options under discussion

- **Merge shape A — one verb.** The callback module is the single unit;
  `runtime.run(fnOrModuleRef, opts)` accepts an inline function (packaged as an
  ephemeral module: upload, invoke, discard) or an installed module reference.
  One packaging path, one identity model, one invocation path; ad-hoc vs
  installed is a property of the artifact, not a different API. Fits the
  project policy of one stable behavior over per-call mode options.
- **Merge shape B — two verbs, one substrate.** Keep `run` (ad-hoc) and an
  explicit `install` lifecycle, both compiled onto the same packaging and
  execution path. More ceremony, but the durable-install side gets a natural
  home for revisioning and the manifest's driving `SELECT`.
- **Shared-context storage (a) — a replicated system table per service.**
  Reuse partition/Raft/CDC machinery; the store is SQL-visible (debuggable,
  consistent with the one-SQL-engine principle) with a thin keyed accessor on
  `ctx`. No new storage engine; avoids a secondary cache layer.
- **Shared-context storage (b) — a dedicated in-memory replicated KV.**
  Lower latency ceiling, but introduces a second replication/consistency
  mechanism next to Raft partitions — runs against the
  research-existing-mechanisms-first rule and needs strong justification.

## Open questions

- Consistency semantics for shared-context reads: leader reads (linearizable)
  vs replica-local reads (stale but fast)? Project policy prefers one stable
  default behavior over per-call options — which one is the default, and is a
  per-service policy field (cf. `read_locality`) the right escape hatch?
- Lifecycle: does the shared context survive replica REPLACE, service
  upgrade, and revision rollover? Is the namespace per service or per
  revision?
- Bounds and eviction: size quota per service, TTL semantics, and the owner of
  eviction/backpressure decisions.
- Does the merged surface subsume the manifest's driving `SELECT` (a module
  property that makes the cluster the initiator), or does cluster-driven
  invocation stay a separate concern?
- Placement interplay: does the shared-context store's placement follow the
  service replicas, or do service replicas gain affinity toward their context
  store like any other accessed data (A[s][p] attribution would then cover it
  for free)?
- Identity and authorization: rung-1 work seals server-derived
  `issuingServiceId` (ladder R5); the shared context must scope access by the
  same identity — what is the cross-service sharing story, if any?

## Decision log

- 2026-07-21 — Epic authored from user decisions: (1) the canonical deployment
  goal is the three-rung ladder above, with rung 1 (unchanged pg-talking OCI
  containers, placed near data) as the expected most-common early use-case and
  the MovieLens demo as its showcase; (2) embedded and uploaded callback APIs
  should likely merge into one surface; (3) cross-replica state for
  Lagrange-aware services is a redis-like **shared service context**, not
  closure capture — closure-vs-module serialization is thereby a non-problem
  by design. Today the MovieLens demo's service leg runs as kernel-internal
  `native_js`; repositioning it onto an installed OCI service follows the
  ladder's C-phase (tracked there, not here).
