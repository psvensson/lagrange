# Runtime Completion Contracts and Owner Simplification Sprint (AGPL)

## Goal

Replace partial-visibility workflows, caller-local truth reconstruction, and
pressure-driven fallback drift with a small set of explicit runtime contracts
so the system stabilizes through fewer owners, fewer branchy read/write modes,
and fewer implicit lifecycle states.

The target is not another symptom-specific fix. The target is a simpler
structure in which:

1. table creation is not externally visible as operational before it is truly
   minimally routable
2. authoritative control-plane reads mean one thing per declared contract
3. membership publication is derived from one coherent planning snapshot
4. pressure produces bounded pending or deferred behavior instead of recursive
   repair and retry amplification

## Why This Sprint Exists

Closer code inspection across the current hot spots shows a structural pattern
behind the remaining runtime failures:

1. `CREATE TABLE` currently writes `tables` and `partitions` metadata before
   initial provisioning is complete, then relies on later reconciliation to
   finish the job
2. authoritative reads are implemented through multiple layers with different
   combinations of owner-RPC preference, SQL fallback, local degradation, and
   readiness dimension semantics
3. membership publication candidates are still assembled from separately
   observed table snapshots rather than one owner-owned planning snapshot
4. read paths can trigger reconcile work while write paths can block on cache
   visibility and perform their own retries, which creates pressure feedback
   loops
5. diagnostics still blur important distinctions such as owner-RPC vs SQL
   fallback, which weakens both triage and policy ownership

The runtime still looks owner-oriented on paper, but completion semantics are
not yet first-class. Rows become visible before workflows are complete, and
multiple subsystems independently decide whether that partial state is
"authoritative enough." That is the core instability pattern this sprint is
meant to remove.

## Relationship to Prior Sprint

This sprint is a follow-on architectural reframing of:

1. [Runtime Convergence Ownership and Stability Sprint](../sprints/done-2026-q2-runtime-convergence-ownership-and-stability.md)

That sprint separated failure families and improved several owner paths. This
new sprint takes the next step: simplify and unify the logic so the same class
of instability does not keep reappearing in different runtime surfaces.

## Sprint Umbrella

1. [Table creation completion contract and routable visibility](../packages/active-20260411-table-creation-completion-contract-and-routable-visibility.md)
2. [Authoritative read contract and diagnostic unification](../packages/active-20260411-authoritative-read-contract-and-diagnostic-unification.md)
3. [Membership publication planning snapshot simplification](../packages/active-20260411-membership-publication-planning-snapshot-simplification.md)
4. [Pressure-owned visibility and repair containment](../packages/active-20260411-pressure-owned-visibility-and-repair-containment.md)

## Simplification Rules

1. One runtime invariant gets one explicit contract.
2. Prefer named read or write profiles over caller-composed boolean bags.
3. Prefer one owner-owned planning snapshot over many table reads.
4. Prefer one linear completion contract over multiple loosely-coupled state
   machines.
5. Reads may observe pressure, but they must not recursively manufacture more
   repair work on every poll.
6. If a new state is necessary, keep it minimal and linear rather than adding
   another branching lifecycle graph.

## Completed-When Architecture

At sprint exit, the system should have four clear contracts:

1. a table-creation completion contract
2. a unified authoritative-read contract surface
3. a single planning-snapshot owner for membership publication
4. a bounded pressure and visibility contract for write and repair behavior

Everything else should be downstream use of those contracts rather than local
reconstruction.

## Active Queue

1. [Selected-seed readiness and control-snapshot survivability](../packages/active-20260411-selected-seed-readiness-and-control-snapshot-survivability.md)
2. [Authoritative read contract and diagnostic unification](../packages/active-20260411-authoritative-read-contract-and-diagnostic-unification.md)
3. [Membership publication planning snapshot simplification](../packages/active-20260411-membership-publication-planning-snapshot-simplification.md)
4. [Pressure-owned visibility and repair containment](../packages/active-20260411-pressure-owned-visibility-and-repair-containment.md)
5. [Pressure-owned visibility and repair containment](../packages/active-20260411-pressure-owned-visibility-and-repair-containment.md)
6. [Table creation completion contract and routable visibility](../packages/active-20260411-table-creation-completion-contract-and-routable-visibility.md)

## Execution Snapshot (2026-04-11)

Implemented in the first architectural slice:

1. named control-plane read profiles now resolve centrally in
   `ControlPlaneSystemTableGateway`
2. hot-path admin, readiness, publication, and table-lifecycle callers now
   route through named read intent instead of composing boolean transport bags
3. membership publication candidate derivation now consumes one explicit
   planning snapshot object rather than assembling raw inputs directly inside
   the hot path
4. read-side stale priority-partition refresh enqueue is now opt-in instead of
   firing from hot-path diagnostics reads by default
5. `CREATE TABLE IF NOT EXISTS` now restores missing initial partition
   metadata before continuing initial provisioning, so incomplete creation no
   longer silently skips that gap

Implemented in the next architectural slice:

1. admin control-snapshot publication observation now explicitly stays on the
   diagnostics read contract instead of inheriting planning semantics from the
   publication owner
2. membership publication retry recovery now normalizes replica-operation
   objects at the owner boundary so cache rows and authoritative repository
   results follow one canonical shape
3. the last pre-existing targeted publication-coordinator regression is now
   closed, so the focused owner-path suites for this sprint are green

Implemented in the current structural slice:

1. selected-seed fallback in bootstrap cluster view no longer promotes the
   seed into the ready set without explicit readiness evidence
2. table creation and `CREATE TABLE IF NOT EXISTS` now surface
   `completionState=pending_creation` when metadata visibility is still
   pending instead of always claiming active completion
3. membership publication planning snapshot reads now force planning profile
   semantics explicitly, and node-scoped latest-publication accessors now
   actually honor node scope
4. control-plane mutation normalization now emits explicit completion-state
   semantics so pending visibility, deferred work, and applied state are
   centrally distinguished
5. acknowledgement lookup now preserves authoritative cluster publication
   context without weakening strict node-scoped latest-publication accessors
6. distributed table-distribution observation now classifies snapshots as
   `routable`, `opaque`, or `invalid`, prefers non-invalid witnesses, and
   fails early when follower-only invalid topology flatlines instead of
   burning timeout budget
7. shared partition leader-topology evaluation now feeds both admin preflight
   and distributed table-distribution observation so those surfaces stop
   maintaining separate leader-completeness rules
8. partition leader activation now publishes `partitions.leader_node_id` from
   the same owner path that publishes `services.raft_role`, reducing split
   leader truth across runtime writes
9. replica failure and removal transitions now conditionally clear stale
   `partitions.leader_node_id` through the replica-state machine when the
   canonical leader leaves a routable state, reducing follower-only stale
   leader topology during recovery

## Out-of-Scope for This Sprint

1. New product feature work outside AGPL runtime stabilization scope.
2. Broad transport-stack redesign.
3. Blanket timeout increases or retry inflation used to mask unstable
   ownership boundaries.
4. New dashboards or operator UX beyond the minimum diagnostics needed to make
   the new contracts explicit.
5. Pro or Enterprise-only operational work not mapped to AGPL ownership in
   `edition-matrix.md`.

## Rollout Order

1. Fix the table-creation completion boundary so partial metadata is no longer
   confused with operational readiness.
2. Collapse authoritative-read semantics into a small named contract surface.
3. Make membership publication derive from one coherent planning snapshot
   rather than mixed observation.
4. Contain pressure by separating authoritative commit from eventual
   visibility and by removing recursive read-triggered repair behavior.
5. Re-run the focused distributed failure family after the contracts are in
   place rather than continuing to patch symptoms at the harness edge.

## Exit Check

1. No user table appears operational before it has reached its minimum
   routable completion contract or an explicit non-active pending state.
2. One declared authoritative-read contract produces the same semantics for all
   callers, and diagnostics report the actual source truthfully.
3. Membership publication candidates are derived from one owner-owned planning
   snapshot, not reconstructed from separate table reads.
4. Read paths no longer schedule recursive repair work under pressure.
5. Recovery pressure produces bounded pending or deferred behavior instead of a
   retry storm across admin, CDC, readiness, and harness layers.
6. The previously failing runtime families either stabilize or reduce to one
   new explicit invariant breach instead of broad ambiguous timeouts.

## 2026-04-11 implementation update
- Rebalancer cleanup planning now continues with cleanup-only REMOVE moves while unrelated in-flight work exists, but refuses removals that would drop the entity below target.
- ReplicaRecoveryService now prefers distinct healthy target nodes before duplicate placement, releases pending recovery guards on failure, and continues later entities in the same recovery cycle when one entity fails.
- Selected-seed bootstrap readiness now requires explicit `readiness.ready === true`; repair-only or recovery-only readiness no longer makes the seed appear bootstrap-ready in unpublished-startup projections.

## 2026-04-11 implementation update - cleanup execution and owner unification
- Marked cleanup REMOVE moves with explicit `standaloneSafe` semantics in `MovePlanner` when the remove can execute without its paired ADD and still preserve target replica count.
- Updated `UnifiedRebalancer.executeRebalancingMoves()` to honor that contract: blocked ADD capacity still defers unsafe relocation removes, but no longer serializes safe over-target cleanup behind unready add targets.
- Added focused coverage for both the planning contract and execution behavior in `test/rebalancer/move-planner-inflight-cleanup.test.js` and `test/rebalancer/rebalancer-safety-preflight.test.js`.
- Unified partition service-row deletion behind `PartitionServiceRowOwner.removeReplica()` and routed `ReplicaHandler` durable cleanup and async removal through that owner path.
- Tightened partition replica deletion to use the typed local predicate `(service_id, service_type, partition_id, node_id)` instead of an ad hoc `service_id` delete.

## 2026-04-11 implementation update - explicit local transport readiness contract
- Introduced `isLocalQueryTransportReady(...)` in the shared bootstrap transport helper and moved callers onto one explicit readiness rule: local query transport is usable only when readiness is explicitly `true`.
- Tightened `waitForLocalQueryTransportReadiness(...)` and self-target join reachability so `unknown` no longer counts as implicitly ready.
- Narrowed bootstrap readiness gating to require local query transport only when a router actually exposes the query/data-plane readiness capability, avoiding fake blockers on API-only surfaces.
- This removes another partial-completion contract: local transport is now either explicitly ready, explicitly not ready, or not applicable.

## 2026-04-11 - authoritative no-row beats stale replica cache
- `ReplicaOperationRepository.getActualReplicaStatus(...)` now treats successful authoritative `services` no-row reads as decisive and only falls back to cache when authoritative reads fail or are unavailable.
- This removes a split-truth path where removed replicas could remain workflow-visible through stale `services` cache state and keep STOPPING / cleanup work alive.
- Focused tests passed:
  - `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
  - `node test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`

## 2026-04-11 - table creation now defaults to quorum-only completion
- Table creation no longer treats missing provisioning detail as full replica convergence.
- The default minimum routable contract is now majority quorum even when no custom quorum callback is injected.
- CREATE TABLE and CREATE TABLE IF NOT EXISTS repair paths now stay in pending_creation until full replica convergence is explicitly observed.
- Focused test passed:
  - node test/query/table-creation-service.test.js

## 2026-04-11 - overlay leader selection and named diagnostics read profile
- Added a shared bootstrap leader selection helper for query-path bootstrap and recovery windows.
- SQLQueryEngine recovery overlays no longer fabricate leader_node_id from arbitrary service ordering when only follower services are visible.
- QueryExecutor now reuses the same bootstrap leader selection contract for fresh bootstrap write fallback.
- AuthoritativeControlPlaneView now resolves named read profiles directly, including the routing readiness dimension, and HeartbeatService canonical visibility checks now use the diagnostics read profile instead of a caller-local fallback flag bag.
- Focused tests passed:
  - node test/query/sql-query-engine.test.js
  - node test/query/query-executor.test.js
  - node test/control-plane/authoritative-control-plane-view.test.js
  - node test/control-plane/heartbeat-memory-trend.test.js

## 2026-04-12 deep-dive extension

The latest deep dive changed the shape of the remaining work. The system is now
failing behind a clearer startup authority boundary, but the code still shows
the same deeper architectural problem in several places:

1. bootstrap readiness, readiness service, and startup recovery each still
   adjudicate overlapping versions of priority-recovery or startup authority
2. admin control snapshot still bypasses the readiness owner and reaches into
   `membershipPublicationService` directly for publication reads, reconcile
   queueing, and acknowledgement
3. active-node truth still exists in multiple forms:
   readiness/publication truth, bootstrap cluster view, bootstrap topology
   snapshot `activeNodeIds`, and join-readiness `nodes.status` fallback
4. publication planning still has duplicate abstractions with the same name at
   different layers, plus a bidirectional dependency between readiness and the
   publication coordinator
5. observation paths still own side effects such as reconcile enqueue and
   acknowledgement

That is a doctrine violation cluster, not one isolated bug.

The sprint is therefore extended in the existing packages, with the following
critical path:

1. one startup-authority snapshot and adjudicator for selected-seed and
   bootstrap-join gating
2. one runtime publication-observation ingress through the readiness owner

## 2026-04-12 follow-on sprint

The remaining runtime blocker is now narrow enough to deserve its own sprint:

1. [Seed Startup Authority and Initial Publication Establishment Sprint](../sprints/active-2026-q2-seed-startup-authority-and-initial-publication-establishment.md)

This sprint remains the architectural precursor. The follow-on sprint owns the
runtime-completion gap that still blocks all seven distributed scenarios:
seed-side initial publication establishment and the startup authority loop
between readiness, publication, and available-node policy.
3. one publication-planning owner with no duplicate planning-snapshot
   builders or cycles
4. bounded observation paths that do not enqueue reconcile or acknowledge
   workflow state from helper reads

## 2026-04-12 Deep-Dive Extension: Startup Authority and Ownership Collapse

The latest seven-scenario distributed rerun changed the critical path. The system no longer first fails in late runtime divergence; it now fails consistently in early startup authority establishment with `control_snapshot_authority_unavailable` while the seed sits in `DEGRADED` with `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` and no published control-plane epoch.

### New structural findings

1. Startup authority is still reconstructed in multiple places instead of owned once. `ControlPlaneReadinessService`, `BootstrapReadinessOwner`, and `StartupRecoveryCoordinator` each adjudicate overlapping parts of priority recovery and selected-seed eligibility.
2. `AdminControlSnapshot` still bypasses the readiness owner and reaches directly into membership-publication internals, including read-lane selection, reconcile triggering, and acknowledgement behavior.
3. Active-node truth still exists in multiple contradictory forms across bootstrap topology snapshot, join readiness fallback, bootstrap cluster view, and readiness/publication planning.
4. Publication planning still has a split abstraction boundary: both readiness and publication coordination expose a `buildMembershipPublicationPlanningSnapshot(...)` concept, but they mean different things and create a cycle.
5. Observation paths still own workflow side effects in places where reads can enqueue reconcile work or advance publication acknowledgement.

### Active queue override

The queue below supersedes earlier ordering until the startup-authority blocker is removed.

1. `active-20260411-selected-seed-readiness-and-control-snapshot-survivability.md`
   Close the ownership gap between readiness, bootstrap readiness, and startup recovery. Remove bootstrap-local startup authority reconstruction and weak active-node fallback.
2. `active-20260411-authoritative-read-contract-and-diagnostic-unification.md`
   Remove owner bypasses and caller-local authoritative read policy reconstruction, starting with `AdminControlSnapshot`.
3. `active-20260411-membership-publication-planning-snapshot-simplification.md`
   Collapse the readiness/publication planning cycle into one planning-answer owner and one persistence/ack owner.
4. `active-20260411-pressure-owned-visibility-and-repair-containment.md`
   Remove observation-owned reconcile and acknowledgement side effects from read paths.
5. `active-20260411-table-creation-completion-contract-and-routable-visibility.md`
   Keep active, but treat as lower priority until the startup authority blocker is cleared.

### Doctrine and guideline conflicts to resolve explicitly

1. One concern still has multiple adjudicators; this violates the owner-boundary rules in doctrine and the system-guideline requirement for single responsibility at the owner seam.
2. Injected-owner bypass remains in admin snapshot and publication observation paths.
3. Semantic duplication remains around planning snapshot naming and active-node truth.
4. Read paths still carry workflow side effects in ways that make stabilization load-dependent and harder to reason about.

## 2026-04-12 Close-out Update

### Structural implementation completed in this sprint

1. Priority recovery / startup authority now prefers a readiness-owned planning/health surface instead of bootstrap-local diagnostics reconstruction.
2. Membership-publication planning now reads cluster publication truth for startup and recovery planning, so target exclusion is treated as recovery state instead of authority absence.
3. Admin control-snapshot observation now consumes readiness-owned publication observation first and no longer acknowledges or enqueues reconcile from the read path.
4. Readiness publication observation no longer enqueues reconcile from helper reads.
5. Publication coordination no longer keeps a local helper named like the readiness-owned planning answer; the coordinator-side helper is now explicitly evidence-shaped.

### Validation

Focused unit suites passed after the close-out changes:
- `node test/control-plane/control-plane-readiness-service.test.js`
- `node test/bootstrap/bootstrap-api.test.js`
- `node test/admin/admin-control-snapshot.test.js`
- `node test/control-plane/membership-publication-coordinator.test.js`

Distributed rerun set after sprint implementation:
- `node-join-under-load` — fail
- `postgres-baseline-comparison` — fail
- `seven-node-load-during-partitioning` — fail
- `seven-node-postgres-baseline-partition-split` — fail
- `seven-node-read-write-load-distribution` — fail
- `seven-node-read-write-load-transaction-recovery` — fail
- `seven-node-table-partition-distribution` — fail

All seven still fail in the same earlier startup family. The dominant live shape remains:
- seed phase `DEGRADED`
- reason `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
- `publishedControlPlaneEpoch = null`
- `publishedControlPlaneStatus = null`
- bootstrap blocker `control_snapshot_authority_unavailable`
- rebalancer repeatedly logging `availableNodeCount = 1`

### Conclusion

This sprint completed the intended structural simplification work, but distributed validation shows that runtime stabilization is still blocked by one unresolved startup problem: seed-side initial control-plane publication establishment. That blocker now stands isolated more clearly than before.
