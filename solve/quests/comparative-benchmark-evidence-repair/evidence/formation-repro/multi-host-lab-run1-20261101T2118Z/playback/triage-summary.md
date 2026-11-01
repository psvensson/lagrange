# Scenario Triage Summary

- Scenario: fresh-formation-user-table-routability
- Phase: unknown
- Root Cause Class: topology
- Dominant Reason: priority_recovery_progress_partition
- Failure Class: publication_convergence_blocked
- Readiness Failure: class=unknown, mode=startup, recoverability=unknown, cause=none, attemptsSinceProgress=3/unknown
- Failure Class Signals: activeGateReadinessDelay=none|activeGateReadinessMode=startup|activeGateReadinessProgressAttemptsSince=3|pendingAckCount=0|blockedNodeCount=0|missingPublishedCount=0|recoveryProtocolState=priority_spread_pending|prioritySpreadPending=true|priorityRecoveryProgressClassCount=1|closureRecordId=CL-003|closureWitnessClass=publication_converged_priority_spread_pending
- Failure Action: unknown
- Operator Recommendation: unknown
- Bottleneck: unknown

## Stability Gates

- failover: status=closed, pendingAckCount=0, blockedNodeCount=0
- convergence: status=open, blockers=priority_spread_pending|closure_record, closureRecordId=CL-003, pendingAckCount=0, blockedNodeCount=0
- restart_recovery: status=not_applicable, restartBoundaryCount=0

## Publication Convergence

- Publication Epoch: 7
- Publication Status: PUBLISHED
- Recovery Protocol State: priority_spread_pending
- Pending Ack Count: 0
- Pending Ack Nodes: none
- Publication Gate Reasons: priority_partitions_not_spread, priority_control_plane_spread_pending
- Blocked Partition Count: 6
- Blocked Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Unresolved Partition Count: 6
- Unresolved Partitions: control_plane_publications-p1, replica_operations-p1, schema_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, sql_write_operations-p1
- Closure Record Id: CL-003
- Closure Witness Class: publication_converged_priority_spread_pending
- Projection Diagnostics: mode=cluster_member_or_recovery_eligible, dimensions=clusterMemberHealthy, controlPlaneRecoveryEligible, recoveryEligibleProjectionEnabled=true, recoveryEligibleIncluded=none, readinessExcluded=none, clusterMemberUnhealthyExcluded=none
- Failing Invariants: none
- Progress Summary: unknown

## Artifact Paths

- Report: test-output/report.json
- Failure Bundle JSON: test-output/.playback/report/fresh-formation-user-table-routability/failure-bundle.json
- Failure Bundle Markdown: test-output/.playback/report/fresh-formation-user-table-routability/failure-bundle.md
- Playback Events: test-output/.playback/report/fresh-formation-user-table-routability/events.ndjson
- Timeline: test-output/.playback/report/fresh-formation-user-table-routability/_timeline.log
- Analysis: unknown

## Top Reasons

- priority_recovery_progress_partition: 6
- priority_recovery_owner_operation_workflow_owner: 5
- priority_recovery_blocking_boundary_workflow_progress: 5
- priority_recovery_wait_mode_event_driven: 5
- priority_recovery_next_action_wait_for_operation_progress: 5

## Playback

- Load Started: unknown
- Load Completed: unknown
- Load Progress Events: 0
- Partition Created Events: 1
- Replica Created Events: 3
- Replica Removed Events: 0

## Routing Diagnostics

- none
