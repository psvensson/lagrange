---
epicContractVersion: 2
id: minimal-deployment-surface
roadmapRow: RM-2.0-minimal-deployment-surface
graduatesTo: null
---

# Minimal deployment surface: artifacts, bindings, cells

## Intent

Converge Lagrange deployment on Artifact / Binding / Cell without parallel
registries, validators, planners, replica controls, or runtime lifecycles. The
selected architecture, owner map, invariants, and migration sequence live in
[`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md).
Quest event logs retain completed implementation history; this memo keeps only
the current cross-Quest frontier and unresolved choices.

## Landed frontier

Artifact schema v3, Binding schema v2, all seven source compilers, direct runtime
access policy, request Cell placement/readiness/routing, change Cell placement,
time Cell placement, once Cell placement, boot Cell placement, and call Cell
placement are landed. Pushdown Cell placement completes the seventh source.

Cell activation reuses one chain:

1. `ServiceDefinitionsOwner` reconciles immutable Binding lineage into desired
   state and activates only explicitly enabled source kinds.
2. `RuntimeServiceRebalancerOwner` admits active lineage to exactly one
   system-policy-owned `UnifiedRebalancer`.
3. `ServiceRuntimeLifecycle`, `RuntimeDriverRegistry`, and
   `WasmComponentDriver` remain the only Component readiness boundary.

All seven Binding sources now compile inactive first and activate through that
same chain. Request has canonical invocation routing; the other sources have
placement and readiness without coupling deployment to their dispatch
mechanisms.

The completed deployment row remains terminal. Four follow-ons are now selected
as separate roadmap scope rather than widening that row:

1. keyed request assignment graduates to
   `solve/epics/request-invocation-partitioning.md`;
2. generic Cell request continuity is its live terminal and is consumed by OCI
   portability rather than re-owned there; and
3. non-request invocation advances one source at a time through the existing
   ingress, dispatcher, runtime, authorization, and effect owners; and
4. data-local call activation is landed (see the decision log).

## Follow-on boundaries

- **Transient named invocation:** map durable `call` and `pushdown`
  registrations to transient statement/query invocations through existing
  owners. No declaration-side direct execution path is allowed.
- **Actor-key stability:** rendezvous assignment supplies low-churn affinity.
  Fixed logical shards with epoch-fenced ownership remain a later contract only
  if strict single ownership becomes a correctness requirement.
- **Source invocation order:** change, time, once, boot, call, and pushdown each
  receive their own executable concern before any combined matrix terminal.

## Current invariants

- Artifact / Binding / Cell are the complete deployment vocabulary.
- Binding is immutable user intent; Cell capacity is system-policy output.
- `replica_count = 0` on Binding-derived desired rows is a non-authoritative
  sentinel, never a caller request.
- Binding-derived actuals become Cells only after the existing runtime lifecycle
  reports them ready and running.
- Table authorization comes from direct runtime policy. Observed access is
  decaying affinity telemetry and never grants authority.
- Placement, invocation routing, and actor-key assignment are separate axes.
- Data-local invocation placement is an execution-time requirement distinct
  from decaying service-data affinity; affinity may improve steady-state Cell
  placement but cannot satisfy a selected partition's locality contract.
- Partition-local execution remains pinned to the Binding's immutable Artifact
  identity and must fail closed when the selected replica or activation becomes
  stale.
- No Cell table, scheduler, seed registry, feature flag, compatibility decoder,
  or second source of truth survives a landing.

## Decision log

- 2026-07-22..24 — Selected Artifact / Binding / Cell, immutable Binding
  identity, policy-owned capacity, and one shared activation chain. All seven
  typed sources reached placement/readiness; source dispatch remained separate.
- 2026-07-25 — Kept keyed routing, generic continuity, and source invocation as
  follow-on scope so the completed deployment row remained terminal.
- 2026-08-02..03 — Landed data-local call activation and the call/pushdown
  hardening sequence. Detailed history remains in Quest logs and
  `solve/changes/HANDOFF-call-cell-invocation.md`.
- 2026-08-06 — The adversarial audit routed remaining coordination, retention,
  memory-admission, and topology-ownership findings to bounded Quests and the
  cell-execution/topology epic; product limitations remain roadmap scope.
