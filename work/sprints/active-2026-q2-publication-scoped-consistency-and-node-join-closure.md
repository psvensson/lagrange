# Publication-Scoped Consistency And Node-Join Closure Sprint (AGPL)

## Goal

Make the final harness consistency boundary obey one publication-scoped
grammar and use that work to get `node-join-under-load` green.

The sprint target is:

1. make the harness consume one canonical publication/leader contract
2. remove alternate control-snapshot leader inference from the strict path
3. make the representative `node-join-under-load` scenario pass, or split the
   next blocker explicitly if the new grammar reveals a deeper runtime fault

## Why This Sprint Exists

The previous matrix-readiness sprint hardened several core seams, but its
representative rerun exposed that the final consistency gate still has a porous
boundary:

1. strict leader comparison can run before the publication-recovery owner says
   the cluster is ready
2. control-snapshot leader comparison still has fallback inference from
   `replicaRoles` and `replicaRoleDiagnostics`
3. the scenario can therefore fail on observer-local leader disagreement while
   the canonical publication gate is still `publication_pending` or
   `priority_spread_pending`

That is exactly the kind of alternate-route grammar the repo doctrine forbids.
This sprint closes that boundary instead of adding another tactical exception.

## Relationship To Current Work

This sprint follows:

1. [Matrix readiness core grammar hardening sprint](./archived/done-2026-q2-matrix-readiness-core-grammar-hardening.md)

This sprint narrows and executes:

1. [Publication-scoped consistency and node-join closure](../packages/active-20260423-publication-scoped-consistency-and-node-join-closure.md)

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Publication-scoped consistency grammar for harness control-snapshot checks.
2. Deletion of alternate leader inference from the strict control-snapshot
   path.
3. Focused proof for both live-query and snapshot-based consistency paths.
4. The representative `node-join-under-load` rerun needed to validate the
   sprint goal.

## Out Of Scope

1. Broad matrix execution before the representative blocker is closed.
2. Tactical scenario-only exemptions that leave mixed consistency logic in
   place.
3. Reopening unrelated startup or rebalancer boundaries already closed in the
   previous sprint.

## Scenario Target

1. `node-join-under-load`

## Sprint Packages

1. [Publication-scoped consistency and node-join closure](../packages/active-20260423-publication-scoped-consistency-and-node-join-closure.md)
2. [Priority recovery readiness and workflow convergence closure](../packages/active-20260423-priority-recovery-readiness-and-workflow-convergence-closure.md)
3. [Membership publication planning evidence union closure](../packages/active-20260423-membership-publication-planning-evidence-union-closure.md)
4. [Priority recovery persistence contract closure](../packages/active-20260423-priority-recovery-persistence-contract-closure.md)
5. [Priority recovery visibility wakeup and diagnostics closure](../packages/active-20260423-priority-recovery-visibility-wakeup-and-diagnostics-closure.md)
6. [Harness replay publication evidence tooling](../packages/active-20260423-harness-replay-publication-evidence-tooling.md)
7. [Idempotent source removal durable cleanup closure](../packages/active-20260423-idempotent-source-removal-durable-cleanup-closure.md)
8. [Runtime grammar contract audit guardrail](../packages/done-20260423-runtime-grammar-contract-audit-guardrail.md)
9. [Publication evidence drift replay gate closure](../packages/done-20260423-publication-evidence-drift-replay-gate-closure.md)
10. [Publication recovery gate summary authority closure](../packages/done-20260423-publication-recovery-gate-summary-authority-closure.md)
11. [Priority recovery publication closure witness contract](../packages/todo-20260423-priority-recovery-publication-closure-witness-contract.md)
12. [Priority recovery closure consumer cutover and guardrails](../packages/todo-20260423-priority-recovery-closure-consumer-cutover-and-guardrails.md)
13. [Priority source-removal leader closure witness](../packages/active-20260423-priority-source-removal-leader-closure-witness.md)
14. [Priority leader handoff re-election closure](../packages/active-20260423-priority-leader-handoff-reelection-closure.md)
15. [Load-lane serve-readiness freshness cutover](../packages/active-20260423-load-lane-serve-readiness-freshness-cutover.md)
16. [Node admission pressure and load convergence closure](../packages/active-20260423-node-admission-pressure-and-load-convergence-closure.md)

## Current Status

1. Packages `1-15` are implemented on the current branch, and the sprint's
   non-harness validation is green:
   - `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`
   - `npx tap test/admin/admin-websocket-api.test-part-2.js`
   - `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
   - `npx tap test/control-plane/priority-recovery-snapshot.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/membership-publication-coordinator.test.js test/control-plane/control-plane-readiness-service.test-part-4.js`
   - `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js test/rebalancer/rebalance-coordinator-atomic-transitions.test.js test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js test/rebalancer/unified-rebalancer.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/distributed/harness/__tests__/cluster.test-part-5.js`
   - `npx tap test/distributed/harness/__tests__/assert-consistency.test.js`
   - `npx tap test/bootstrap/bootstrap-sequence.test.js test/bootstrap/join-readiness-evaluator.test.js`
   - `npx tap test/node/replica-handler.test.js`
   - `npm run test:metrics`
2. Representative rerun on April 23, 2026 still does not pass:
   - `dominantReason = nodeAdmissionBlocked`
   - `failureClass = load_pressure`
   - `publicationRecoveryGate.ready = true`
   - `prioritySpreadPending = false`
   - blocked priority partitions = `0`
   - unresolved priority partitions = `0`
   - `priorityRecoveryProgressClassIds = []`
   - `priorityRecoverySemanticStateIds = []`
   - top reasons are `nodeAdmissionBlocked = 477`,
     `retryableControlPlanePressure = 10`, and `timeoutWaits = 1`
3. The big publication-scoped cutover is complete:
   - retained spread-satisfied witness diagnostics no longer reopen priority
     recovery
   - active publication-gate blockers still outrank witness detail
   - harness dominant-reason classification no longer mislabels a ready gate
     as `priority_recovery_progress_blocked`
4. The old publication, priority-spread, stale replay, leader handoff, and
   stale load-lane freshness blockers are no longer terminal.
5. The next blocker is now runtime-only:
   - recovery-only/write-unhealthy nodes keep load admission blocked
   - repeated `replace_remove_safety_blocked` deferrals on critical partitions
     show replacement leader ownership is not closing before safe removal
   - joiner-side ACK-timeout quarantines and readiness churn keep
     `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` open during the load window
6. Per entry gate `20`, the next blocker is explicitly split in the same work
   cycle as package `16`.

## Entry Gate

This sprint stays active until all of the following are true:

1. the final consistency boundary has one explicit publication-scoped contract
2. strict leader comparison no longer runs ahead of publication-recovery
   readiness
3. alternate control-snapshot leader inference is deleted from the strict path
4. focused proof is green
5. priority recovery closes external serve readiness while leaving internal
   recovery admission open
6. create-phase idempotent target evidence is reconciled by the workflow owner
7. priority recovery operation progress re-enters the shared priority
   partition rebalance queue without a periodic-timer dependency
8. replace source-removal safety uses internal recovery admission rather than
   external serve readiness
9. priority control-plane operation transitions use one classifier-owned
   recovery persistence lane
10. terminal priority recovery progress wakes membership publication
   reconciliation so stale priority spread summaries are owner-refreshed
11. priority transition persistence normalizes durable snake-case operation
   rows and in-memory camel-case operation objects through one classifier
12. membership publication planning uses one canonical evidence union for
   owner-owned topology rows instead of stopping at the first successful source
13. priority recovery persistence contract proof covers create, update,
   transition, readback, diagnostics, and durable/in-memory row shapes
14. spread-changing priority recovery visibility wakes publication
   reconciliation through the same owner seam as priority operation progress
15. priority recovery diagnostics consume the canonical normalized operation
   evidence rather than reporting absence from partial rows
16. harness artifact replay can recompute publication priority spread from
   captured rows using runtime derivation code
17. already-removed replica idempotency performs canonical durable
    service-row cleanup before completing source removal
18. hotspot runtime grammar contracts fail fast when known publication or
    priority-recovery drift is reintroduced
19. replayed publication evidence classifies durable blocked versus replayed
    satisfied priority spread drift without manual artifact correlation
20. `node-join-under-load` is green, or the next blocker is explicitly split in
   the same work cycle
21. publication recovery gate priority-spread state is summary-authoritative
   when the normalized priority partition summary is present
22. priority recovery exposes one publication closure witness so membership
   publication can distinguish stale durable summaries from unresolved recovery
23. operational and presentation consumers use that closure witness instead of
   reconstructing priority recovery closure from raw publication summaries,
   operation absence, or gate booleans
24. priority source removal treats source handoff evidence and replacement
   leader ownership as separate state-machine closures
25. priority leader handoff reactivates or observes replacement leader
   ownership through an explicit election/publication path before source
   removal can complete
26. priority recovery diagnostics classify active operations blocked on
   replacement leader ownership as blocked operations, not operation absence
27. hard load-lane serve admission forces a fresh readiness owner evaluation
   before rejecting on recent ineligible snapshots

## Simplification Rules

1. Canonical control-snapshot `leaders` are authoritative for strict leader
   comparison.
2. `replicaRoles` and `replicaRoleDiagnostics` are diagnostics-only for this
   boundary; they must not synthesize leader truth on the strict path.
3. Publication recovery gate readiness decides when leader agreement may be
   enforced.
4. Live-query consistency and snapshot-based consistency must share one
   comparison grammar.
5. Active priority recovery is a serve-readiness blocker, not a recovery
   admission blocker.
6. Already-active target replica evidence is create-phase workflow progress and
   must not depend on a non-timed-out dispatch response.
7. Priority operation progress is a typed owner-queue reconcile reason, not a
   second planning route.
8. Replace source-removal safety is an owner-read recovery admission decision,
   not an external serving decision.
9. Priority control-plane transition persistence is selected by
   `isPriorityControlPlanePartition`, not by a legacy partition subset.
10. Priority progress is the single event seam for rebalance and publication
   reconciliation; readiness reads and harness diagnostics must not repair
   stale priority summaries.
11. Priority transition persistence is selected after operation-row
   normalization; casing differences must not open a legacy SQL-routed path.
12. Membership publication planning merges compatible owner-owned topology
    evidence into one snapshot for planning reads; diagnostics reads retain
    their explicit authoritative contract.
13. Priority recovery operation evidence is normalized once before persistence
    or diagnostics decisions; operation absence must not be inferred from a
    partial source when canonical evidence exists.
14. Harness replay tooling is diagnostic-only and must call runtime derivation
    code rather than copying publication-planning policy.
15. Local removed replica state is not durable service truth; idempotent
    source-removal completion must route through the canonical services-row
    owner cleanup.
16. Known runtime grammar contracts must be mechanically audited at the hotspot
    paths that caused the latest blocker migration.
17. Replay tooling may classify durable/replayed publication evidence drift,
    but must not repair runtime state or become a harness-side publication
    grammar.
18. When a priority partition summary is present, stale protocol strings or
    reason arrays must not revive priority-spread pending state after the
    summary is satisfied.
19. The previous sprint's actuation contract remains the owner-path foundation;
    this sprint must not duplicate it. The remaining work is the cross-machine
    publication closure witness and consumer cutover.
20. Durable publication metadata is an owner-persisted summary, not by itself
    the current priority recovery decision when fresher closure evidence exists.
21. Source handoff is source-replica evidence only; priority source removal
    needs a canonical non-source `partitions.leader_node_id` before dispatch.
22. A successful handoff response is not replacement leader closure unless the
    election/publication state machine also exposes a non-source leader witness.
23. Active priority replacement operations blocked on leader ownership are
    diagnostic evidence of a liveness blocker, not evidence that recovery
    planning failed to create work.
24. Hard serve-admission callers may reuse fresh eligible readiness, but they
    must not reuse recent cached `serveEligible = false` while only scheduling
    a background refresh.
25. Retained spread-satisfied witness diagnostics are diagnostics-only once
    the current priority-recovery summary is empty and the publication gate is
    closed.

## Validation

1. `npx tap test/distributed/harness/__tests__/assert-consistency.test.js`
2. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
3. `npx tap test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
4. `npx tap test/bootstrap/bootstrap-api.test-part-2.js test/bootstrap/bootstrap-api.test-part-3.js`
5. `npx tap test/rebalancer/unified-rebalancer.test.js`
6. `npx tap test/control-plane/membership-publication-coordinator.test.js`
7. `npx tap test/rebalancer/quorum-conditioned-remove-safety.test.js`
8. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`
9. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
10. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
11. `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`
12. `npx tap test/node/replica-handler.test.js`
13. `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
14. `npm run audit:runtime-grammar`
15. `npm run test:metrics`
16. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
17. `npx tap test/control-plane/publication-recovery-gate.test.js`
