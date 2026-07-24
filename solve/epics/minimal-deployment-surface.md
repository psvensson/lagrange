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

No further Quest is selected from this epic. The Solver overview derives
`linked-terminal` from its linked Quest outcomes.

## Deferred follow-on choices

- **Transient named invocation:** map durable `call` and `pushdown`
  registrations to transient statement/query invocations through an existing
  owner, or establish one shared invocation resolver first, only when that
  invocation cutover is independently valuable.
- **Actor-key stability:** use rendezvous assignment over ready actuals for
  low-churn affinity, or add fixed logical shards with epoch-fenced ownership
  only where strict single ownership is a correctness requirement. This is
  optional routing policy, not incomplete Cell deployment.
- **Source invocation order:** choose any future source-specific invocation
  cutover in its own planning context; scheduling, dispatch, and data-plane
  integration remain separate concerns.

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
- No Cell table, scheduler, seed registry, feature flag, compatibility decoder,
  or second source of truth survives a landing.

## Decision log

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
