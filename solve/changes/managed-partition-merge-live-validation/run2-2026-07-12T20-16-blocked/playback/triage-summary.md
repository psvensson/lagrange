# Scenario Triage Summary

- Scenario: partition-merge-under-load
- Phase: unknown
- Root Cause Class: load
- Dominant Reason: nodeAdmissionBlocked
- Failure Class: publication_convergence_blocked
- Readiness Failure: class=unknown, mode=startup, recoverability=unknown, cause=none, attemptsSinceProgress=3/unknown
- Failure Class Signals: activeGateReadinessDelay=none|activeGateReadinessMode=startup|activeGateReadinessProgressAttemptsSince=3|pendingAckCount=0|blockedNodeCount=0|missingPublishedCount=0|recoveryProtocolState=priority_spread_pending|prioritySpreadPending=true|priorityRecoveryProgressClassCount=2|closureRecordId=CL-006|closureWitnessClass=startup_active_publication_lag
- Failure Action: unknown
- Operator Recommendation: unknown
- Bottleneck: unknown

## Stability Gates

- failover: status=open, blockers=startup_readiness_blocked, pendingAckCount=0, blockedNodeCount=0
- convergence: status=open, blockers=priority_spread_pending|startup_readiness_blocked|closure_record, closureRecordId=CL-006, pendingAckCount=0, blockedNodeCount=0
- restart_recovery: status=open, blockers=priority_spread_pending|startup_readiness_blocked|closure_record, closureRecordId=CL-006, restartBoundaryCount=0, pendingAckCount=0, blockedNodeCount=0

## Publication Convergence

- Publication Epoch: 3
- Publication Status: PUBLISHED
- Recovery Protocol State: priority_spread_pending
- Pending Ack Count: 0
- Pending Ack Nodes: none
- Publication Gate Reasons: priority_partitions_not_spread
- Blocked Partition Count: 6
- Blocked Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Unresolved Partition Count: 6
- Unresolved Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Closure Record Id: CL-006
- Closure Witness Class: startup_active_publication_lag
- Projection Diagnostics: mode=cluster_member_or_recovery_eligible, dimensions=clusterMemberHealthy, controlPlaneRecoveryEligible, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=8be8d30f-4499-5eed-865c-71b4d529a67a, readinessExcluded=none, clusterMemberUnhealthyExcluded=none
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

- nodeAdmissionBlocked: 5220
- retryableControlPlanePressure: 396
- priority_recovery_wait_mode_event_driven: 6
- priority_recovery_contract_state_pending: 6
- priority_recovery_progress_partition: 6

## Playback

- Load Started: 2026-07-12T20:18:08.683Z
- Load Completed: 2026-07-12T20:20:38.704Z
- Load Progress Events: 150
- Partition Created Events: 1
- Replica Created Events: 9
- Replica Removed Events: 4

## Routing Diagnostics

- none
