---
id: minimal-deployment-surface
roadmapRow: RM-2.0-minimal-deployment-surface
status: discussing
graduatesTo: null
---

# Minimal deployment surface: artifacts, bindings, cells

**Status:** paused at scope discussion — no implementation scope committed.
Distills the 2026-07-22 design conversation plus a three-angle literature
sweep (active databases/ECA, DBOS & durable execution,
actors/CALM/minimal kernels; claims adversarially verified).

## Intent (why now)

Lagrange has ~seven ways to deploy code into the runtime (runtime services, OCI
install, meta services, WASM services, stored functions, CDC subscriptions,
partition callbacks) backed by three parallel execute-registries, three entry
validators converging on one lifecycle owner, and two mechanisms (`code` +
`module_manifests`) feeding three consumers. The surfaces are mechanism-first;
none is minimal, and several are declaration layers with no live execution
behind them yet. This epic pursues one small, stable surface that is easy to
reason about — for artifacts, services, and the things that run but are not
services — before external activation lands and freezes the current sprawl into
API.

## The converged model

Three nouns; everything else is sugar, mechanism, or derived state.

1. **Artifact** — content-addressed OCI object with typed exports. Code is
   uniformly **stateless**. Subsumes `code` + `module_manifests`. The hash is
   the version. Exports declare read/write sets (capability imports, WIT-style)
   — the one artifact-contract decision that determines whether the binding
   table is statically analyzable.
2. **Binding** — the only thing users declare: an immutable, versioned,
   replicated row — `on <source> run <artifact>#<export>` plus source-typed
   config, context namespaces, budget, capabilities, elasticity policy.
   Source vocabulary is small and closed: `request`, `change` (CDC), `call`
   (query/UDF), `pushdown` (per-statement, ephemeral), `time`, `once`, `boot`.
   Each source has one fixed execution semantics — never a per-binding coupling
   option. All existing DDL/CLI/meta-command surfaces compile to binding rows
   validated in one place.
3. **Cell** — the derived running actual: a placed, disposable instance of a
   stateless handler plus a local materialization of its context. Never
   declared, only reconciled. One cell substrate carries the hard-won replica
   core (membership, recovery, snapshot, handoff, readiness) for everything.

Refinements settled in discussion:

- **Context-as-table.** State lives only in tables. A service's "redis-like"
  KV context is a key-value-schema table with a pinned in-memory
  materialization on the service's cells, plus KV primitives (CAS, counters,
  leases, TTL/timers) for the serialization stateless handlers can no longer
  provide themselves. One state substrate, one consistency model, one
  placement mechanism. (The wasm-service `session-kv-store` + `timer-manager`
  is the existing prototype of this contract.)
- **A service = request-binding + co-replicated context.** Each replica carries
  handler + local context copy; per-replica affinity (`service_partition_access`)
  pulls each copy toward the data it actually reads; the context table itself
  is just another partition in the affinity ledger.
- **Elasticity decouples from quorum.** The context keeps a fixed small odd
  voter set; load-driven growth adds learner replicas (full context
  materialization and handler capacity, no vote). Scaling never touches
  consensus. Merge-monotone context writes may later be accepted at any
  replica coordination-free (CALM); non-monotone ops route to the leader.
- **Partition-as-service.** A partition is a built-in service whose artifact is
  the storage engine and whose context is its key range. The replica core is
  unified at the lifecycle/contract layer (one state machine, one invariant
  set, one deterministic test surface) while per-kind fast paths are
  preserved. Split/merge/key-range identity stay artifact behavior, not
  substrate features. A small set of **axiomatic cells** (system-table
  partitions, the binding reconciler) is instantiated by boot, not declared —
  same cell contract, different start.
- **The platform contract becomes: three nouns in, twelve kernel APIs out**
  (`lagrange-kernel-platform-api-v0.md` remains the inward surface).

## What already exists toward this

- OCI-as-universal-packaging with runtime kind as execution strategy is sealed
  doctrine (`architecture/lagrange-kernel-platform-api-v0.md`).
- `RaftReplicaBase` already shared by partition and wasm-service replicas;
  `UnifiedRebalancer` already places `PARTITION` / `MESSAGE_GROUP` /
  `RUNTIME_SERVICE` through one policy engine.
- `service_definitions` + reconciler is already desired-state/level-triggered.
- Bindings ↔ runtime grammar: bindings are `intent`, cells are `actuation`,
  artifact verification is `authority` — the grammar hierarchy's stability
  rules govern deployment unchanged.

## Literature anchors (what the theory validates and adds)

- **Source taxonomy is HiPAC-minus-composite-events** (Dayal et al. 1988);
  every system that added an event algebra paid for it (Ode VLDB'92, SAMOS).
  Stonebraker SIGMOD'90: one general rules system subsumes views, procedures,
  caching. Fixed-semantics-per-source: configurable coupling matrices were
  never implemented anywhere; SQL kept one mode. `change` runs off the commit
  log as detached-causally-dependent (commit-ordered, restart-on-recovery,
  at-least-once + idempotent) — the outbox/CDC consensus.
- **Active databases died from unpredictable rule interaction**, not weak
  expressiveness (Paton & Díaz CSUR'99). Termination/confluence over a flat
  binding table is checkable (Aiken/Hellerstein/Widom TODS'95) **only if
  exports declare read/write sets**.
- **Reconciler liveness has a formal spec**: Eventually Stable Reconciliation
  (Anvil, OSDI'24 best paper) — candidate for the invariant registry.
- **Stateless code + co-placed state**: Cloudburst's LDPC (PVLDB'20, 1–3
  orders of magnitude); AMBROSIA (PVLDB'20): determinism is the boundary
  between replayable and owned; Durable Functions OOPSLA'21 is the formal
  model to steal proof structure from.
- **Checkpoint piggybacking is the structural advantage**: code running
  against the store that holds its context can commit progress atomically with
  data writes — exactly-once without 2PC (DBOS Transact; Apiary 2–68x).
  External orchestrators cannot do this.
- **Version pinning is the universal invariant** (DBOS, Temporal, Restate,
  Step Functions): in-flight work pins to the starting version; reconciler
  drains old-version cells. Immutable versioned binding rows + weighted
  routing; content-addressing makes version identity free.
- **Table-row surfaces need a kernel wakeup primitive** or reconcilers poll —
  DBOS CIDR'22's sharpest regret. Lagrange's CDC/live-query makes
  "reconciler wakes on binding-table CDC" a first-class contract.
- **Kernel limits become permanent API** (FDB layer doctrine; CouchDB-on-FDB
  post-mortem): choose cell budgets/context bounds/consistency windows with
  that weight, and state them. Deterministic simulation is the trust
  mechanism adopters cite — existing harness doctrine, vindicated.
- **The combination was not found in this sweep**: durable binding rows as
  control plane (DBOS) + compiled placement (Hydro) + log-optimal exactly-once
  (Halfmoon), with all four code kinds as rows in the store they run against.

## Open questions

- Binding schema v0: exact per-source config schemas; how elasticity policy
  and context namespaces are expressed; where `pushdown` bindings live
  (ephemeral, statement-scoped — same shape, never persisted?).
- Read/write-set declaration vehicle: WIT worlds vs manifest fields vs
  runtime-enforced attribution — and what the analyzer checks first
  (triggering-graph acyclicity?).
- Voter/learner mechanics on the existing Raft core: learner support scope,
  and whether context-leader proximity becomes a second affinity input now or
  later.
- Migration order: bindings table first with `service_definitions` as a
  compiled view? CDC subscriptions moved first (durability win, lowest cost)?
  Artifact catalog subsuming `code`/`module_manifests` before or after?
- What is axiomatic at boot (minimum set of axiomatic cells) and how the
  bootstrap fixed point is stated as an invariant.
- Real WASM engine sequencing: the fine-grained half of the story
  (`call`/`pushdown`/`change` handlers in-process) needs it; current
  `js_wasm_component_v1` envelope should be retired or renamed, not kept
  ambiguous.
- Which kernel limits to seal now (invocation budget, context size, safety
  interval semantics) knowing they become permanent API.

## Decision log

- 2026-07-22 — Converged on the three-noun model (artifact / binding / cell);
  sources closed at seven; one fixed semantics per source (no coupling
  options, per no-flags policy).
- 2026-07-22 — All handlers stateless; state relocated to declared context
  namespaces; context-as-table (KV-schema table + pinned in-memory
  materialization + KV primitives), not a second store.
- 2026-07-22 — Service = co-replicated logic + context; per-replica affinity;
  elastic replicas as learners, fixed odd voter set (quorum decoupled from
  load scaling).
- 2026-07-22 — Partition reframed as the zeroth built-in service on one cell
  substrate; unify at lifecycle/contract layer, keep per-kind fast paths;
  axiomatic cells for the bootstrap fixed point.
- 2026-07-22 — Literature sweep (3 angles, adversarially verified) recorded
  above; artifact exports must declare read/write sets; binding rows are
  immutable + versioned; reconciler wakes on CDC, targets ESR.
- 2026-07-22 — Entered the roadmap as `RM-2.0-minimal-deployment-surface`
  (Phase 2.0 §3 "External Kernel Platform API", new Phase 0 design row).
- 2026-07-22 — Paused before Quest/spec graduation while the existing
  workspace changes are verified and committed.
