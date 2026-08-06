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

- 2026-08-06 — The verified 2026-08-06 adversarial audit opened a hardening
  batch against the landed call/reduce surface: `cell-invocation-backpressure`
  (contention must never destroy healthy Cells), `call-partial-overflow-fail-closed`
  (no silent partial truncation), `call-cell-reduce-coordination-integrity` and
  `call-partial-validity-slot-generations` (coordination contract integrity and
  accepted-partial validity), `invocation-journal-owner-recovery`,
  `call-coordination-linear-cost`, `invocation-result-retention-owner`, and
  `runtime-memory-admission-reservation`. The activation dead-end (Finding 1)
  went to `data-local-call-partition-activation-v3` under the new cross-Quest
  memo `solve/epics/cell-execution-ownership-vs-replica-topology.md`, which
  decides whether the Option-B interim repair is final or a stopgap before
  splitting ephemeral slot ownership from durable replica topology. Audit
  product-scope limitations (rolling cutover, narrow reduce algebra) remain
  roadmap items for the AGPL feature map, not code quests.
- 2026-08-03 — Call/pushdown invocation COMPLETE: data-local activation
  landed (9c60dc142, quest `data-local-call-partition-activation-v2`),
  followed by the hardening batch, the pin-loop engagement witness, and
  the reduce-coordination expiry quest
  (`call-cell-reduce-coordination-expiry`). Detail lives in the quest
  logs and `solve/changes/HANDOFF-call-cell-invocation.md`.
- 2026-08-02 — Selected data-local call activation as an explicit successor to
  production call wiring rather than widening the current call Quest. Quest
  [`data-local-call-partition-activation`](../quests/data-local-call-partition-activation.json)
  owns the missing case where a selected partition replica has no pre-existing
  Binding Cell: the pinned Component must execute on that replica node before
  shard rows leave it, using existing Artifact, placement, and runtime lifecycle
  owners without caller replica control or a parallel scheduler.
- 2026-07-25 — Selected keyed invocation, generic Cell continuity, and
  non-request source invocation as separate follow-ons. Request routing work
  targets `solve/specs/request-invocation-partitioning/`; source cutovers retain
  the existing Cell and dispatch owners. The completed minimal-deployment row
  remains unchanged.
- 2026-07-22 — Selected Artifact / Binding / Cell and seven typed Binding
  sources. Bindings pin installed `package_id`, canonical `manifest_digest`, and
  export name. All sources compile through the existing desired-service owner.
- 2026-07-23 — Fixed Cell as a ready/running Binding-derived actual on the
  existing replica substrate. Request placement, genuine Component readiness,
  and canonical request routing landed as separate closure-gated slices.
- 2026-07-23 — Application-owner correction removed Artifact/Binding table
  authorization and caller-owned replica shape. Direct runtime policy owns
  authorization; existing runtime-service policy owns capacity and placement.
- 2026-07-24 — Activated change lineage through the shared Cell owner chain;
  CDC subscription and event dispatch remain deferred.
- 2026-07-24 — Activated time lineage through the shared Cell owner chain;
  timer scheduling and invocation remain deferred.
- 2026-07-24 — Selected once as the next placement slice because its kind-only
  declaration makes activation/readiness independently provable without adding
  an invocation owner.
- 2026-07-24 — Quest `minimal-deployment-once-cell-placement` landed. Selected
  `minimal-deployment-boot-cell-placement` next because boot has the same
  kind-only declaration while bootstrap invocation remains a separate concern.
- 2026-07-24 — Quest `minimal-deployment-boot-cell-placement-migration` landed
  the exact boot Cell candidate after its predecessor's malformed proof history.
  Selected `minimal-deployment-call-cell-placement` next because the durable
  named registration can be placed independently of statement invocation.
- 2026-07-24 — Quest `minimal-deployment-call-cell-placement` landed. Selected
  `minimal-deployment-pushdown-cell-placement` next because the durable named
  registration can be placed independently of query execution.
- 2026-07-24 — Quest `minimal-deployment-pushdown-cell-placement` landed after
  exact-candidate review caught and repaired a stale architecture paragraph.
  All seven sources now share the selected Cell owner chain.
- 2026-07-24 — Residual audit exhausted three superseded predecessor records in
  favor of their landed migration or stricter replacement Quests. The Solver
  overview now derives `linked-terminal`; source-specific invocation and
  optional actor-key routing remain separate follow-on choices with no selected
  target from this epic.
- 2026-07-24 — Owner reconciled the service-portability claims surface with
  this epic's landed evidence: `docs/service-portability-capabilities.json`
  and its gate now state the `wasm_component` axes separately — SQL
  `INSTALL SERVICE` installation and genuine WASI component execution on the
  Binding/Cell readiness path (evidence:
  `minimal-deployment-request-cell-runtime-readiness`), while the callback
  path remains a JavaScript-envelope rehearsal and managed OCI container
  execution remains unimplemented. This satisfies service-portability R1
  ("distinguish current behavior, internal rehearsal machinery, and
  production-supported external service behavior") without weakening its
  callback or OCI constraints.
