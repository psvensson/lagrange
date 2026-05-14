# Topology Convergence Ship Shape Sprint

Status: active. This sprint is a successor strategy for the failed
rolling-restart release-gate closure. It must not run beside another active
package on the same owner boundary unless the current blocker is first closed,
migrated, superseded, or explicitly reactivated by a human.

## Goal

Bring boot, join, rejoin, partitioning, rebalancing, and failure detection to a
ship-shape control-plane standard: membership and failure observations become
durable, fenced, owner-key reconciliation work; partition and replica placement
converges from desired state to observed state; and critical topology recovery
never closes as event-only waiting.

The sprint is successful only when the representative rolling-restart gate is
green or has migrated to a fresh owner-boundary blocker with canonical evidence,
and the newly added failure/rejoin/rebalance gates prove that failure detection
causes repair rather than only publishing status changes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo. This sprint must not implement
Pro or Enterprise behavior.

## Current Evidence Snapshot

Seed artifact:
`test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json`.

Current representative artifact:
`test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.

Latest representative artifact and handoff context on May 14, 2026:

1. The latest rolling-restart artifact remains the most recent representative
   evidence handoff.
2. That artifact historically fronts `startup_active_gate_owner /
   snapshot_coverage` with dominant reason `snapshot_coverage_incomplete`.
3. Historical residual state: publication owner-truth proof preserves
   active-gate best publication evidence across timeout samples, and the
   representative fronts active-gate snapshot coverage with
   `snapshotCoverage=2/5`, `publicationStatus=PUBLISHED`,
   `pendingAckCount=0`, `publishedActive=1/5`, and exact
   `missingPublishedNodeIds` for the remaining four nodes.
4. Priority recovery: residual extraction shows no priority recovery witnesses.
5. Downstream readiness support: deferred behind active-gate snapshot coverage
   with no-progress terminal evidence.

Historical sprint pivot completed on May 14, 2026:

1. Owner: `topology_membership_owner`.
2. Boundary: `membership_epoch`.
3. Dominant reason: `membership_topology_epoch_missing`.
4. Completed package:
   `work/packages/done-20260513-topology-membership-epoch-fencing.md`.
5. Focused proof surface:
   `npx tap test/control-plane/membership-epoch-contract.test.js`.
6. Membership epoch is historical/completed sprint context, not the active
   sprint target.

Human-directed active sprint pivot on May 14, 2026:

1. Owner: `failure_detector`.
2. Boundary: `durable_repair_intent`.
3. Dominant reason: `failure_detection_not_causal_for_repair`.
4. Active package:
   `work/packages/active-20260513-topology-failure-repair-intents.md`.
5. Focused proof surface:
   `npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js`.
6. Rolling-restart, active-gate snapshot coverage, publication owner truth,
   and membership epoch fencing remain historical representative context, not
   the active sprint target.

The immediate missing causal edge is:

1. Failure detection emits status changes and events without one durable
   owner-key repair-intent record.

## Ship-Shape Definition

This sprint treats the system as ship-shape only when these properties hold:

1. Boot, join, and rejoin are fenced by one membership/topology epoch consumed
   by placement, failure detection, active-gate checks, and rebalancer work.
2. Failure detection records durable repair intent for node lifecycle
   transitions instead of relying on emitted events as the only continuation
   signal.
3. Rejoin performs post-restore reconciliation before full active admission:
   local services, partition ownership, and coordinated remote operations are
   all checked against durable topology truth.
4. Partition descriptors are versioned routing truth for split, merge, move,
   and stale-route rejection.
5. Rebalancing operates as a desired-vs-observed reconciliation loop with
   bounded wake, retry, dispatch, delivery, ACK, timeout, and terminal states.
6. Placement fails closed or degrades explicitly when capacity accounting or
   admission dependencies are unavailable.
7. A low-rate anti-entropy reconciler compares durable truth surfaces and
   enqueues exact owner-key repairs without local fallback mutation.
8. Critical topology workflows expose bounded budgets and typed terminal
   classifications; `event_driven_wait` is never a closure state.
9. Release gates cover failure detection, join, rejoin, remote handoff, and
   rebalance disruption paths with focused proof before full distributed runs.

## Operating Rules

1. Start every package with `npm run work:context`.
2. After a package is active, use `npm run work:llm-start` when package doctor,
   dirty scope, model-ledger, or representative evidence context is needed.
3. Use canonical extractors before raw JSON or logs:
   `work:evidence-summary`, `analyze:priority-recovery-residuals`,
   `analyze:topology-convergence`, `analyze:distributed-failure`,
   `analyze:owner-files`, and `work:package:doctor -- --suggest`.
4. Runtime owner-boundary and scenario-release-gate packages must run required
   subagents sequentially and record the ledger before implementation closes.
5. Each package owns one semantic boundary and one focused commit/push slice.
6. Do not broaden the current remote-handoff residual into membership epoch,
   failure repair, partition descriptor, or anti-entropy work until the package
   sequence reaches that phase.
7. Do not treat cache publication, timeout age, or event delivery as owner
   convergence unless the package explicitly proves the owner outcome.

## Package Queue

1. [Topology Remote Handoff Convergence](../packages/done-20260513-topology-remote-handoff-convergence.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `operation_workflow_owner / workflow_progress`
   - Recommendation covered: fix the current ship blocker first.
   - Purpose: move coordinator-created remote handoff operations in
     `retry_deferred` / `recovering_in_flight` through bounded dispatch,
     delivery, ACK, timeout, or reconcile.
   - Entry condition: latest canonical evidence still names
     `priority_recovery_partition_progress` as first frontier.
   - Acceptance: no critical operation remains only in
     `priority_recovery_event_driven_wait`; focused owner tests prove remote
     wake, ACK verification, retry scheduling, and terminal classification;
     representative rolling-restart either passes or migrates to a fresh
     owner-boundary blocker.

2. [Topology Active Gate Owner Truth](../packages/done-20260513-topology-active-gate-owner-truth.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Recommendation covered: make active-gate convergence owner-truth based.
   - Purpose: derive active-gate status from canonical owner state instead of
     presentation publication alone.
   - Entry condition: priority recovery is satisfied or migrated away from the
     first frontier.
   - Acceptance: active gate reports expected nodes, ready leased nodes,
     published active nodes, missing nodes with owner reasons, pending repair
     operations, and evaluated topology epoch; `PUBLISHED` cannot mask
     `active=2/5` without a degraded owner reason.

3. [Topology Readiness Stalled Support](../packages/done-20260513-topology-readiness-stalled-support.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_readiness_owner / startup_support_evidence`
   - Recommendation covered: keep startup support evidence tied to owner
     truth instead of treating active-gate stalls as independent readiness
     failures.
   - Purpose: classify no-progress readiness with source unknown/cause none
     while active-gate state is stalled as inherited active-gate support
     evidence, or name a fresh owner boundary with canonical evidence.
   - Entry condition: the active-gate owner-truth package closed with
     `migrate_owner_boundary` toward startup readiness support evidence.
   - Acceptance: focused diagnostics prove the support classification;
     rolling-restart either passes, returns to startup active-gate snapshot
     coverage with reduced readiness support debt, or migrates to a fresh
     owner-boundary blocker.

4. [Topology Active Gate Snapshot Coverage Repair](../packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Recommendation covered: finish current active-gate owner-truth closure.
   - Purpose: repair active-gate snapshot coverage so selected snapshots include
     current owner truth for durable published, locally projected, and recently
     admitted active nodes, or produce a fresh narrower owner-boundary
     migration with canonical evidence.
   - Entry condition: readiness support has reduced to inherited active-gate
     no-progress and the representative first frontier is active-gate snapshot
     coverage.
   - Acceptance: focused owner tests prove snapshot coverage selection and
     publication/member projection behavior; rolling-restart is green, reduced,
     or migrated to a fresh narrower owner-boundary blocker.

5. [Priority Recovery Workflow Progress After Snapshot Coverage](../packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md)
   - Lane: `scenario-release-gate`
   - Owner boundary: `operation_workflow_owner / workflow_progress`
   - Recommendation covered: keep topology recovery from closing as event-only
     waiting after active-gate snapshot coverage has been reduced.
   - Purpose: prove or split the latest priority recovery workflow-progress
     residual for `sql_transactions-p1` and `sql_write_operations-p1` after
     snapshot coverage widened from `1/5` to `3/5`.
   - Entry condition: active-gate snapshot coverage is no longer the first
     frontier and priority recovery residual extraction names workflow
     progress as the narrowed implementation owner.
   - Acceptance: focused owner tests prove bounded wake, retry, timeout,
     dispatch, delivery, ACK, advance, or terminal classification for the
     selected residual; rolling-restart is green, reduced, or migrated to a
     fresh owner-boundary blocker with canonical evidence.
   - Implementation note: focused owner proof moved publication ACK and
     priority recovery to satisfied; representative rolling-restart migrated
     back to startup active-gate snapshot coverage at `2/5`.

6. [Topology Active Gate Snapshot Coverage After Workflow Progress](../packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Recommendation covered: finish active-gate coverage after publication and
     priority recovery are no longer the first blocker.
   - Purpose: explain why the selected admin-ready snapshot exposes only two
     owner-truth nodes when publication ACK is satisfied and priority recovery
     is no longer fronting the causal chain.
   - Entry condition: workflow-progress proof migrated the representative
     frontier back to active-gate snapshot coverage.
   - Acceptance: focused owner tests prove selected snapshot coverage includes
     the current owner-truth cohort, or rolling-restart migrates to a fresh
     narrower owner-boundary blocker with canonical evidence.
   - Implementation note: focused proof widened active-gate owner truth from
     `missingPublishedRecoveryActiveNodeIds` while keeping durable published
     membership distinct; representative rolling-restart migrated to
     `topology_publication_owner / publication_convergence` with
     `missing_published_nodes_present`.

7. [Topology Publication Convergence After Active Gate Owner Truth](../packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_publication_owner / publication_convergence`
   - Recommendation covered: keep publication convergence tied to owner-truth
     membership, not presentation status.
   - Purpose: repair the state where publication reports no pending ACKs and
     steady publication, but exposes no published active nodes and all five
     expected active nodes are missing.
   - Entry condition: active-gate owner-truth proof migrated the representative
     first frontier to publication acknowledgement convergence.
   - Acceptance: focused owner tests prove publication publishes or retains the
     owner-truth cohort, or rolling-restart migrates to a fresh narrower
     owner-boundary blocker with canonical evidence.
   - Implementation note: focused publication evidence proof preserves
     active-gate best publication owner truth after a timeout sample;
     representative rolling-restart now marks publication ACK convergence
     satisfied and migrates first frontier back to active-gate snapshot
     coverage at `2/5`.

8. [Topology Active Gate Snapshot Coverage After Publication Owner Truth](../packages/superseded-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `startup_active_gate_owner / snapshot_coverage`
   - Recommendation covered: finish active-gate coverage after publication
     convergence is satisfied.
   - Purpose: explain why the selected admin-ready snapshot covers only two of
     five expected nodes when publication ACK convergence is satisfied and
     priority recovery is no longer fronting the causal chain.
   - Entry condition: publication owner-truth proof migrated the
     representative first frontier back to active-gate snapshot coverage.
   - Acceptance: focused owner tests prove selected snapshot coverage includes
     the owner-truth active cohort, or rolling-restart migrates to a fresh
     narrower owner-boundary blocker with canonical evidence.

9. [Topology Membership Epoch Fencing](../packages/done-20260513-topology-membership-epoch-fencing.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_membership_owner / membership_epoch`
   - Recommendation covered: add a membership/topology epoch.
   - Purpose: introduce one monotonic generation consumed by boot, join,
     rejoin, failure detection, placement, active-gate checks, and rebalancer
     decisions.
   - Entry condition: the sprint has one green or migrated rolling-restart
     handoff result so the epoch work starts from current truth.
   - Acceptance: stale join, rejoin, failure, placement, and publication
     observations are fenced by epoch checks; diagnostics expose the evaluated
     epoch and rejection reason.
   - Implementation note: canonical membership epoch snapshot and fence
     vocabulary now live at the publication owner boundary; focused proof covers
     current, stale, future, and unknown fence outcomes plus publication
     evidence and candidate exposure.

10. [Topology Failure Repair Intents](../packages/active-20260513-topology-failure-repair-intents.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `failure_detector / durable_repair_intent`
   - Recommendation covered: make failure detection enqueue durable repair work.
   - Purpose: turn `active -> suspected`, `suspected -> failed`,
     `failed -> recovering`, and `recovering -> active` transitions into
     durable owner-key repair intents.
   - Entry condition: membership epoch vocabulary is available or explicitly
     scoped as the handoff file this package consumes.
   - Acceptance: failure detection still writes node/service state and emits
     events, but durable repair intent is the authority; each affected
     partition, message group, and replica operation is named or explicitly
     classified as not affected.

11. [Topology Post Rejoin Reconciliation](../packages/todo-20260513-topology-post-rejoin-reconciliation.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_membership_owner / rejoin_reconciliation`
   - Recommendation covered: add post-rejoin reconciliation.
   - Purpose: after durable rejoin restore, compare local restored services,
     partition ownership, and coordinated operations against durable topology
     truth before full active admission.
   - Entry condition: failure repair intent and membership epoch semantics are
     defined enough to classify rejoin repair work.
   - Acceptance: rejoining nodes re-arm locally owned and coordinator-created
     operations, repair missing local service state through owners, and do not
     become placement targets until reconciliation reaches a typed owner
     outcome.

12. [Topology Partition Descriptor Epoch](../packages/todo-20260513-topology-partition-descriptor-epoch.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `partition_topology_owner / descriptor_epoch`
   - Recommendation covered: make partition descriptors versioned and central.
   - Purpose: make split, merge, move, route, and stale-route rejection consume
     one partition descriptor version.
   - Entry condition: owner-boundary inventory confirms the canonical
     partition topology owner and direct consumers.
   - Acceptance: readers and writers refresh or reject stale routing state;
     split and move workflows publish descriptor updates with one owner
     vocabulary; diagnostics do not reconstruct partition freshness from cache
     age or incidental rows.

13. [Topology Placement Capacity Fail Closed](../packages/todo-20260513-topology-placement-capacity-fail-closed.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_placement_owner / capacity_admission`
   - Recommendation covered: fail closed on unknown placement capacity.
   - Purpose: make missing accounting/admission dependencies produce explicit
     degraded or blocked placement outcomes in release gates and production
     modes.
   - Entry condition: current placement owner contracts are reread and the
     package names dev/test best-effort exceptions up front.
   - Acceptance: unknown capacity no longer silently makes all nodes feasible;
     diagnostics name capacity/accounting availability; tests prove strict and
     best-effort modes separately.

14. [Topology Anti Entropy Reconciler](../packages/todo-20260513-topology-anti-entropy-reconciler.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_reconcile_owner / durable_truth_reconcile`
   - Recommendation covered: add anti-entropy reconciliation.
   - Purpose: periodically compare durable nodes, readiness leases,
     partition services, replica operations, placement target state, and active
     publication state, then enqueue exact owner-key work.
   - Entry condition: failure repair intents, membership epoch, and partition
     descriptor vocabulary are available enough to avoid local fallback repair.
   - Acceptance: reconciler never mutates another owner's state directly;
     output is deterministic repair intent, bounded no-op, or typed terminal
     classification; focused tests cover stale/missing/double-owned evidence.

15. [Topology Bounded Progress Budgets](../packages/todo-20260513-topology-bounded-progress-budgets.md)
   - Lane: `runtime-owner-boundary`
   - Owner boundary: `topology_control_plane / progress_budget_taxonomy`
   - Recommendation covered: harden budgets and terminal states.
   - Purpose: give critical topology workflows bounded retry windows,
     next-attempt timestamps, attempt counters, terminal degraded
     classifications, and diagnostic reasons tied to owner decision snapshots.
   - Entry condition: at least one package has exposed the concrete owner
     workflow fields to standardize.
   - Acceptance: analyzers no longer report unknown workflow-step budget or
     unbounded active-gate/readiness retry windows for critical topology
     progress; retryable evidence without a bounded mechanism remains an
     active causal edge.

16. [Topology Failure Scenario Gates](../packages/todo-20260513-topology-failure-scenario-gates.md)
    - Lane: `scenario-release-gate`
    - Owner boundary: `distributed_test_harness / failure_gate_matrix`
    - Recommendation covered: promote failure scenarios to release gates.
    - Purpose: add or promote focused gates for rolling restart, killed join,
      killed rejoin, killed replica-operation coordinator, missed remote
      handoff ACK, stale publication with durable truth ahead, and split or
      rebalance during node recovery.
    - Entry condition: the runtime contracts above have focused proof so the
      gates validate behavior instead of serving as the first discovery loop.
    - Acceptance: each gate asserts durable convergence, owner reasons, and
      topology epoch/fencing where applicable; the final sprint closure records
      representative green or a fresh owner-boundary handoff.

## Dependency Order

1. Close or migrate the current remote handoff frontier.
2. Prove active-gate owner truth only after priority recovery no longer fronts
   the causal chain.
3. Repair or migrate the active-gate snapshot coverage residual after
   publication and priority recovery are no longer first-frontier blockers.
4. Repair or migrate the publication convergence residual exposed after
   active-gate owner truth moved downstream.
5. Add membership epoch before durable failure repair and post-rejoin
   admission semantics depend on it.
6. Add failure repair intents before broad anti-entropy reconciliation.
7. Add partition descriptor epoch before split/move/stale-route gates depend
   on descriptor freshness.
8. Harden placement capacity and progress budgets before final failure gates.
9. Run full failure scenario gates only after focused owner proof is green.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:package:doctor -- --suggest <package>`
3. `npm run work:evidence-summary -- <latest-artifact>`
4. `npm run analyze:priority-recovery-residuals -- <latest-artifact> --markdown`
5. `npm run analyze:topology-convergence -- <latest-artifact>`
6. `npm --silent run analyze:causal-model -- <latest-artifact>`
7. `npm run analyze:distributed-failure -- --report <latest-artifact>`
8. `npm run analyze:owner-files -- <owner> [boundary] --markdown`
9. Focused owner tests selected by each package.
10. Static guardrails on touched runtime files.
11. `npm run work:validate -- --entry <package>` before role proof exists.
12. `npm run work:validate -- --pre-impl <package>` after review/fix proof.
13. `npm run work:validate -- --closure <package>` before close/commit.
14. Focused commit and push for each closed package.
15. Representative rolling-restart and failure-gate runs after focused proof.

## Closure Rules

1. The sprint closes only after every package is done, superseded with a clear
   reason, or migrated into a fresh sprint with owner, boundary, artifact, and
   next action.
2. Runtime and scenario packages must record real sequential review/fix when
   needed/implementation subagent proof unless a human explicitly waives the
   role and the package records the waiver state allowed by the tracker.
3. No package may close on `retryable`, `backpressure`, or
   `event_driven_wait` without a bounded progress mechanism and terminal
   owner classification.
4. The final closure artifact must show either representative green or a fresh
   first frontier that is narrower than the sprint entry frontier.
5. The final closure note must state whether boot/join/rejoin, failure
   detection, partition descriptors, placement, and rebalancing each satisfy
   the ship-shape definition above.
