# Frontier board

Latest dated gate seen in records: 20260616T161647Z. This is a projection; act on a record only after reading its file.

## Closure frontier — 15 active of 42 records

Areas: harness-control-snapshot (2) · harness-oracle (2) · membership-publication (2) · placement-planning-feedback (1) · placement-priority-spread (3) · readiness-projection (3) · restart-rejoin-identity (1) · transport-replication-backpressure (1)

### harness-control-snapshot

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-002 | narrowed | — | harness-control-snapshot |
| CL-025 | narrowed | — | harness-control-snapshot |

### harness-oracle

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-030 | open | 20260612T173105Z | harness-oracle (primary) + node-resource-safety (secondary) |
| CL-031 | open | 20260612T223302Z | harness-oracle (blindness) + node-resource-safety (root) |

### membership-publication

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-001 | narrowed | 20260616T071019Z | membership-publication |
| CL-039 | open | 20260615T205549Z | membership-publication write-substrate / control-plane raft leadership placement |

### placement-planning-feedback

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-008 | narrowed | 20260611T061307Z | placement-planning-feedback |

### placement-priority-spread

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-023 | narrowed | — | placement-priority-spread |
| CL-028 | narrowed | — | placement-priority-spread |
| CL-029 | narrowed | — | placement-priority-spread (operation workflow liveness) |

### readiness-projection

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-004 | narrowed | — | readiness-projection |
| CL-005 | narrowed | — | readiness-projection |
| CL-022 | narrowed | 20260612T085908Z | readiness-projection |

### restart-rejoin-identity

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-024 | narrowed | — | restart-rejoin-identity |

### transport-replication-backpressure

| Id | Status | Last gate | Concern |
| --- | --- | --- | --- |
| CL-009 | open | 20260611T052934Z | transport-replication-backpressure |

## Open quests — 23

| id | class | attempts | reopens | closes |
| --- | --- | --- | --- | --- |
| coordinator-reconcile-lane-ledger-write-head-of-line | product | 0 | 0 | — |
| formation-ledger-self-move-blocks-cluster-ops | product | 3 | 1 | — |
| formation-reservation-reconcile-premature-orphan-release | product | 0 | 0 | — |
| formation-runtime-service-create-lane-budget-starvation | product | 0 | 0 | — |
| join-retry-patience-selectable | product | 0 | 0 | — |
| lagrange-devops-onboarding | product | 0 | 0 | — |
| listener-port-model-single-authority | product | 0 | 0 | — |
| managed-partition-merge-live-validation | product | 0 | 0 | — |
| movielens-three-way-affinity-demo | product | 4 | 0 | — |
| newcomer-onboarding-friction | product | 0 | 0 | — |
| rebalancer-own-create-memory-duplicate-replace | product | 0 | 0 | — |
| rolling-restart-core-stability | product | 74 | 13 | CL-001, CL-004, CL-030 |
| rolling-restart-run4-critical-spread | product | 1 | 0 | — |
| rolling-restart-run4-join-runtime-activation | product | 2 | 0 | — |
| rolling-restart-run4-observer-staleness | product | 1 | 0 | — |
| rolling-restart-run4-publication-visibility-run2 | product | 0 | 0 | — |
| routed-mutation-silent-ledger-write-loss | product | 0 | 0 | — |
| runtime-owner-reconcile-alignment | product | 0 | 0 | — |
| runtime-replica-state-projection | product | 0 | 0 | — |
| seed-join-gate-authoritative-refresh | product | 0 | 0 | — |
| transition-mutation-budget-doom-loop | product | 0 | 0 | — |
| unwired-event-adjudication | product | 0 | 0 | — |
| write-path-internal-pacing | product | 0 | 0 | — |

