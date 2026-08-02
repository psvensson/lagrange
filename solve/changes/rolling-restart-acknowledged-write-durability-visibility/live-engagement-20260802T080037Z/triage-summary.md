# Scenario Triage Summary

- Scenario: rolling-restart
- Phase: unknown
- Root Cause Class: startup
- Dominant Reason: restart_infrastructure_join
- Failure Class: startup_recovery_blocked
- Readiness Failure: unknown
- Failure Class Signals: failureBarrier=restart_recovery|failureBarrierReason=restart_infrastructure_join
- Failure Action: unknown
- Operator Recommendation: unknown
- Bottleneck: unknown

## Stability Gates

- failover: status=closed, pendingAckCount=0, blockedNodeCount=0
- convergence: status=closed, pendingAckCount=0, blockedNodeCount=0
- restart_recovery: status=open, blockers=restart_infrastructure_join, restartBoundaryCount=5, pendingAckCount=0, blockedNodeCount=0

## Publication Convergence

- Publication Epoch: 3
- Publication Status: PUBLISHED
- Recovery Protocol State: steady_published
- Pending Ack Count: 0
- Pending Ack Nodes: none
- Publication Gate Reasons: none
- Blocked Partition Count: 0
- Blocked Partitions: none
- Unresolved Partition Count: 0
- Unresolved Partitions: none
- Closure Record Id: unknown
- Closure Witness Class: unknown
- Projection Diagnostics: mode=cluster_member_healthy_only, dimensions=clusterMemberHealthy, recoveryEligibleProjectionEnabled=false, recoveryEligibleIncluded=none, readinessExcluded=none, clusterMemberUnhealthyExcluded=none
- Failing Invariants: none
- Progress Summary: partitionCount=3, partition=schema_operations-p1, owner=operation_workflow_owner, actuation=dispatched_waiting_progress, boundary=workflow_progress, waitMode=event_driven, nextAction=wait_for_operation_progress, contractState=pending, pressure=write_backlog, lastProgressAtMs=1785657689525

## Artifact Paths

- Report: test-output/reports/stat-gate-20260802T080037Z-run1.report.json
- Failure Bundle JSON: test-output/reports/.playback/stat-gate-20260802T080037Z-run1/rolling-restart/failure-bundle.json
- Failure Bundle Markdown: test-output/reports/.playback/stat-gate-20260802T080037Z-run1/rolling-restart/failure-bundle.md
- Playback Events: test-output/reports/.playback/stat-gate-20260802T080037Z-run1/rolling-restart/events.ndjson
- Timeline: test-output/reports/.playback/stat-gate-20260802T080037Z-run1/rolling-restart/_timeline.log
- Analysis: unknown

## Top Reasons

- nodeAdmissionBlocked: 969
- retryableControlPlanePressure: 214
- timeoutWaits: 53
- hardLoadFailures: 41
- restart_infrastructure_join: 1

## Playback

- Load Started: 2026-08-02T08:01:43.624Z
- Load Completed: 2026-08-02T08:04:21.959Z
- Load Progress Events: 159
- Partition Created Events: 1
- Replica Created Events: 20
- Replica Removed Events: 18

## Routing Diagnostics

- none
