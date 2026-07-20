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

## Open quests — 26

| id | class | attempts | reopens | closes |
| --- | --- | --- | --- | --- |
| control-snapshot-heartbeat-lease-freshness | product | 2 | 0 | — |
| formation-joining-ready-phase-fence-live | product | 1 | 0 | — |
| formation-ledger-self-move-blocks-cluster-ops | product | 5 | 1 | — |
| formation-liveness-dependency-serial-planner | product | 1 | 0 | — |
| formation-reservation-reconcile-premature-orphan-release | product | 0 | 0 | — |
| join-retry-resume-lifecycle-finalization | product | 1 | 0 | — |
| movielens-create-budget-intent-serialization | product | 1 | 0 | — |
| movielens-local-leader-row-visibility | product | 3 | 0 | — |
| movielens-local-leader-row-visibility-model | product | 1 | 0 | — |
| movielens-nodes-priority-recovery-escape | product | 1 | 0 | — |
| movielens-observation-watermark-churn-consolidation | product | 1 | 0 | — |
| movielens-operation-ledger-terminal-hold | product | 1 | 0 | — |
| movielens-parallel-reduce-result-chronology | product | 1 | 0 | — |
| movielens-pre-schema-priority-spread-admission-authority | product | 0 | 0 | — |
| movielens-replace-bootstrap-cohort-authority | product | 1 | 0 | — |
| movielens-three-way-affinity-demo | product | 7 | 0 | — |
| oci-container-driver-live-activation | product | 8 | 0 | — |
| ordinary-placement-ready-lease-candidate-admission | product | 1 | 0 | — |
| priority-placement-completed-topology-observation | product | 1 | 0 | — |
| runtime-service-affinity-suboptimality-observer | product | 0 | 0 | — |
| runtime-service-creating-owner-wake-progress-admission | product | 13 | 0 | — |
| schema-provisioning-inline-execute-owner-redrive | product | 1 | 0 | — |
| schema-provisioning-not-null-intent-recovery-roundtrip | product | 1 | 0 | — |
| service-data-affinity-parallel-reduce-demo-live | product | 1 | 0 | — |
| solver-verifier-rejection-supersession-core | process | 1 | 0 | — |
| solver-verifier-rejection-supersession-steering | process | 1 | 0 | — |

