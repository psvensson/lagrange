# Scenario Triage Summary

- Scenario: partition-merge-under-load
- Phase: unknown
- Root Cause Class: load
- Dominant Reason: nodeAdmissionBlocked
- Failure Class: load_pressure
- Readiness Failure: class=unknown, mode=startup, recoverability=unknown, cause=none, attemptsSinceProgress=1/unknown
- Failure Class Signals: dominantReason=nodeAdmissionBlocked
- Failure Action: Load traffic is admission-blocked while control-plane recovery or readiness pressure remains active.
- Operator Recommendation: Inspect load-lane admission errors, control-plane write pressure, and priority recovery operation visibility before rerun.
- Bottleneck: unknown

## Stability Gates

- failover: status=closed, pendingAckCount=0, blockedNodeCount=0
- convergence: status=open, blockers=priority_spread_pending, pendingAckCount=0, blockedNodeCount=0
- restart_recovery: status=not_applicable, restartBoundaryCount=0

## Publication Convergence

- Publication Epoch: 2
- Publication Status: PUBLISHED
- Recovery Protocol State: priority_spread_pending
- Pending Ack Count: 0
- Pending Ack Nodes: none
- Publication Gate Reasons: priority_partitions_not_spread, publication_epoch_pending
- Blocked Partition Count: 6
- Blocked Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Unresolved Partition Count: 6
- Unresolved Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Closure Record Id: unknown
- Closure Witness Class: unknown
- Projection Diagnostics: mode=cluster_member_or_recovery_eligible, dimensions=clusterMemberHealthy, controlPlaneRecoveryEligible, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=none, readinessExcluded=none, clusterMemberUnhealthyExcluded=none
- Failing Invariants: none
- Progress Summary: unknown

## Artifact Paths

- Report: test-output/report.json
- Failure Bundle JSON: test-output/.playback/report/partition-merge-under-load/failure-bundle.json
- Failure Bundle Markdown: test-output/.playback/report/partition-merge-under-load/failure-bundle.md
- Playback Events: test-output/.playback/report/partition-merge-under-load/events.ndjson
- Timeline: test-output/.playback/report/partition-merge-under-load/_timeline.log
- Analysis: unknown

## Top Reasons

- nodeAdmissionBlocked: 1508
- timeoutWaits: 165
- retryableControlPlanePressure: 63
- nodeSlotUnavailable: 45
- priority_recovery_actuation_state_action_required: 6

## Playback

- Load Started: 2026-07-12T20:27:40.488Z
- Load Completed: 2026-07-12T20:28:21.492Z
- Load Progress Events: 41
- Partition Created Events: 1
- Replica Created Events: 19
- Replica Removed Events: 12

## Routing Diagnostics

- none
