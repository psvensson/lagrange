# Work overview — top-down

Hierarchy: roadmap → epic → spec → quest → attempt, with the closure ledger
tracking cross-quest invariants alongside. Roadmap / epic / spec / ledger are
static documents you read; the **Quest log is the only moving part**, and a
Quest closes only by the Solver terminal state (SOLVED / EXHAUSTED). This is a
projection — act on a record only after reading its file.

## 1 · Roadmap rows in play — 2
_Scope authority (roadmap.md). A row is in play when an epic or quest cites it via links.roadmapRow._

| row                       | epics                                                                                                                                                                                                                                                                                                                    | quests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RM-0.1-fs-rolling-restart | control-plane-write-wedge-leader-local-establishment, convergence-timeout-leadership-settle, hardware-relative-convergence-budget, latent-convergence-blocker-census, rolling-restart-liveness-observatory, slow-rejoiner-progress-or-evict, spread-satisfied-in-flight-staleness-unmask, topology-convergence-hardening | leadership-flap-attribution-census, operation-workflow-drain-redrive, raft-candidacy-reluctance-drain-source, rolling-restart-core-stability, rolling-restart-liveness-downstream-witness, rolling-restart-liveness-emulation, rolling-restart-liveness-epic-graduation, rolling-restart-liveness-log-replay, rolling-restart-run4-admin-query-backpressure, rolling-restart-run4-control-plane-publications-failed-operation-mask, rolling-restart-run4-drain-residual, rolling-restart-run4-leadership-quiescence-signature, rolling-restart-run4-liveness-residual-agreement, rolling-restart-run4-load-admission-backpressure, rolling-restart-run4-load-lane-admin-emission, rolling-restart-run4-load-lane-owner-reproducer, rolling-restart-run4-mixed-priority-context-selection, rolling-restart-run4-observer-staleness, rolling-restart-run4-operation-drain, rolling-restart-run4-operation-drain-owner-progress-token, rolling-restart-run4-passfail-discriminator-census, rolling-restart-run4-postrebalance-diagnostics-routing, rolling-restart-run4-postrebalance-drain-run15, rolling-restart-run4-postrebalance-trim-drain, rolling-restart-run4-publication-visibility-run2, rolling-restart-run4-readiness-analyzer-normalization, rolling-restart-run4-readiness-support-evidence, rolling-restart-run4-target-sync-reentry, rolling-restart-w1-priority-establishment-write-unwedge |
| RM-0.5-cde-helm-chart     | —                                                                                                                                                                                                                                                                                                                        | lagrange-devops-onboarding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 2 · Epics — 18
_Lightweight planning above specs (solve/epics/) — sharpen intent before a sealed doneWhen exists._

| id                                                   | status                               | roadmapRow                | graduatesTo                                          |
| ---------------------------------------------------- | ------------------------------------ | ------------------------- | ---------------------------------------------------- |
| architecture-altitude-review                         | discussing                           | —                         | —                                                    |
| continuous-ai-workflow-landscape                     | resolved                             | —                         | —                                                    |
| control-plane-write-wedge-leader-local-establishment | resolved                             | RM-0.1-fs-rolling-restart | —                                                    |
| convergence-timeout-leadership-settle                | resolved                             | RM-0.1-fs-rolling-restart | —                                                    |
| dst-cost-model-circle                                | resolved-option-b-refuted-pivot-to-a | —                         | —                                                    |
| hardware-relative-convergence-budget                 | resolved                             | RM-0.1-fs-rolling-restart | —                                                    |
| hysteresis-consolidation                             | active                               | —                         | —                                                    |
| lagrange-devops-onboarding                           | active                               | —                         | —                                                    |
| latent-convergence-blocker-census                    | graduated                            | RM-0.1-fs-rolling-restart | topology-convergence-hardening                       |
| membership-single-owner-cutover                      | resolved                             | —                         | membership-lifecycle-placement-hard-cutover          |
| quest-standing-invariants                            | graduated                            | —                         | standing-invariant-closure                           |
| rolling-restart-liveness-observatory                 | graduated                            | RM-0.1-fs-rolling-restart | topology-convergence-hardening                       |
| service-data-affinity-placement                      | sharpening                           | —                         | —                                                    |
| slow-rejoiner-progress-or-evict                      | resolved                             | RM-0.1-fs-rolling-restart | convergence-timeout-leadership-settle                |
| spread-satisfied-in-flight-staleness-unmask          | landed-default-off                   | RM-0.1-fs-rolling-restart | control-plane-write-wedge-leader-local-establishment |
| steering-doc-clarity                                 | graduated                            | —                         | —                                                    |
| strategy-gate-and-altitude-teeth                     | discussing                           | —                         | —                                                    |
| topology-convergence-hardening                       | sharpening                           | RM-0.1-fs-rolling-restart | membership-lifecycle-placement-hard-cutover          |

## 3 · Specs — 11 (1 with open quests)
_Detailed planning (solve/specs/): design + requirements + tasks. Implemented by quests, not a closure surface._

| spec                                        | quests (open/total) | quest ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| activation-cost-aware-placement             | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| core-topology-control-plane-rewrite         | 0/5                 | model-bounded-retry-exit-routing, model-owner-trace-validation, model-owner-transition-recoverable-wake, model-projection-freshness-epoch-fencing, model-readiness-handoff-liveness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| developer-experience-remediation            | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| hlc-cross-leader-monotonicity               | 0/1                 | hlc-cross-leader-monotonicity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| membership-lifecycle-placement-hard-cutover | 3/28                | membership-publication-drain-determinism, operation-workflow-drain-redrive, rolling-restart-core-stability, rolling-restart-liveness-downstream-witness, rolling-restart-liveness-emulation, rolling-restart-liveness-epic-graduation, rolling-restart-liveness-log-replay, rolling-restart-run4-admin-query-backpressure, rolling-restart-run4-control-plane-publications-failed-operation-mask, rolling-restart-run4-drain-residual, rolling-restart-run4-leadership-quiescence-signature, rolling-restart-run4-liveness-residual-agreement, rolling-restart-run4-load-admission-backpressure, rolling-restart-run4-load-lane-admin-emission, rolling-restart-run4-load-lane-owner-reproducer, rolling-restart-run4-mixed-priority-context-selection, rolling-restart-run4-observer-staleness, rolling-restart-run4-operation-drain, rolling-restart-run4-operation-drain-owner-progress-token, rolling-restart-run4-passfail-discriminator-census, rolling-restart-run4-postrebalance-diagnostics-routing, rolling-restart-run4-postrebalance-drain-run15, rolling-restart-run4-postrebalance-trim-drain, rolling-restart-run4-publication-visibility-run2, rolling-restart-run4-readiness-analyzer-normalization, rolling-restart-run4-readiness-support-evidence, rolling-restart-run4-target-sync-reentry, rolling-restart-w1-priority-establishment-write-unwedge |
| metastable-convergence-resilience           | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| node-liveness-veto-consolidation            | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| proximity-spray-cdc-propagation-overlay     | 0/1                 | cdc-cache-delete-resurrection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| raft-logic-migration                        | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| spec-led-runtime-modularization             | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| standing-invariant-closure                  | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 4 · Quests — 24 open / 78 terminal
_The only measured layer (solve/quests/). Sealed goal; attempts and findings live in the append-only log._

### Open

| id                                                       | class   | spec                                        | attempts | reopens | osc | closes                 |
| -------------------------------------------------------- | ------- | ------------------------------------------- | -------- | ------- | --- | ---------------------- |
| coordinator-reconcile-lane-ledger-write-head-of-line     | product | —                                           | 0        | 0       | 0   | —                      |
| formation-ledger-quorum-concentrated-replace-churn-60s   | product | —                                           | 0        | 0       | 0   | —                      |
| formation-ledger-self-move-blocks-cluster-ops            | product | —                                           | 3        | 0       | 0   | —                      |
| formation-reservation-reconcile-premature-orphan-release | product | —                                           | 0        | 0       | 0   | —                      |
| formation-runtime-service-create-lane-budget-starvation  | product | —                                           | 0        | 0       | 0   | —                      |
| join-retry-patience-selectable                           | product | —                                           | 0        | 0       | 0   | —                      |
| lagrange-devops-onboarding                               | product | —                                           | 0        | 0       | 0   | —                      |
| latency-group-zone-affinity-demo                         | product | —                                           | 0        | 0       | 0   | —                      |
| listener-port-model-single-authority                     | product | —                                           | 0        | 0       | 0   | —                      |
| movielens-affinity-placement-demo                        | product | —                                           | 0        | 0       | 0   | —                      |
| newcomer-onboarding-friction                             | product | —                                           | 0        | 0       | 0   | —                      |
| rebalancer-own-create-memory-duplicate-replace           | product | —                                           | 0        | 0       | 0   | —                      |
| rolling-restart-core-stability                           | product | membership-lifecycle-placement-hard-cutover | 74       | 13      | 2   | CL-001, CL-004, CL-030 |
| rolling-restart-run4-critical-spread                     | product | —                                           | 1        | 0       | 1   | —                      |
| rolling-restart-run4-join-runtime-activation             | product | —                                           | 2        | 0       | 1   | —                      |
| rolling-restart-run4-observer-staleness                  | product | membership-lifecycle-placement-hard-cutover | 1        | 0       | 1   | —                      |
| rolling-restart-run4-publication-visibility-run2         | product | membership-lifecycle-placement-hard-cutover | 0        | 0       | 0   | —                      |
| routed-mutation-silent-ledger-write-loss                 | product | —                                           | 0        | 0       | 0   | —                      |
| runtime-owner-reconcile-alignment                        | product | —                                           | 0        | 0       | 0   | —                      |
| runtime-replica-state-projection                         | product | —                                           | 0        | 0       | 0   | —                      |
| seed-join-gate-authoritative-refresh                     | product | —                                           | 0        | 0       | 0   | —                      |
| transition-mutation-budget-doom-loop                     | product | —                                           | 0        | 0       | 0   | —                      |
| unwired-event-adjudication                               | product | —                                           | 0        | 0       | 0   | —                      |
| write-path-internal-pacing                               | product | —                                           | 0        | 0       | 0   | —                      |

### Terminal

| id                                                                     | class   | outcome   | attempts |
| ---------------------------------------------------------------------- | ------- | --------- | -------- |
| alloy-execution-guardrails-verifier-fix                                | product | solved    | 1        |
| altitude-reflection-mechanism                                          | process | solved    | 1        |
| autonomy-and-parallel-defaults                                         | process | solved    | 0        |
| cdc-cache-delete-resurrection                                          | product | solved    | 1        |
| core-system-logic-alloy-adjacency                                      | product | solved    | 1        |
| core-system-logic-model-adjacency                                      | product | solved    | 1        |
| distroless-fast-local-harness-shell-free                               | process | solved    | 0        |
| dst-cost-model-fidelity-spike                                          | product | exhausted | 0        |
| dt-drain-safety-overremoval-hunt                                       | product | solved    | 1        |
| flag-debt-retirement                                                   | product | solved    | 1        |
| formation-control-plane-move-interlock                                 | product | solved    | 2        |
| formation-ledger-leader-local-persistence-wedge                        | product | solved    | 1        |
| formation-ledger-over-target-accounting-drain-phase-replace-blind-spot | product | solved    | 1        |
| formation-ledger-over-target-surplus-drain-coupled-removal             | product | exhausted | 0        |
| formation-ledger-post-spread-voter-visibility-latency                  | product | exhausted | 0        |
| formation-ledger-quorum-spread-first                                   | product | solved    | 1        |
| formation-ledger-spread-completion-self-move-interlock-deadlock        | product | solved    | 1        |
| formation-ledger-spread-window-follow-up-latency                       | product | solved    | 1        |
| formation-promoted-voter-not-voter-ready-routable-60s                  | product | exhausted | 1        |
| formation-replace-dispatch-deferred-retry-hold                         | product | exhausted | 0        |
| formation-voter-surplus-promotion-deferral-livelock                    | product | solved    | 1        |
| hlc-cross-leader-monotonicity                                          | product | solved    | 1        |
| l-write-membership-deferred-seed                                       | product | exhausted | 0        |
| leadership-flap-attribution-census                                     | product | solved    | 0        |
| ledger-participant-transaction-zombie-lifecycle                        | product | solved    | 1        |
| legacy-work-tracker-removal                                            | product | solved    | 1        |
| membership-publication-drain-determinism                               | product | solved    | 0        |
| model-bounded-retry-exit-routing                                       | product | solved    | 1        |
| model-owner-trace-validation                                           | product | solved    | 1        |
| model-owner-transition-recoverable-wake                                | product | solved    | 1        |
| model-projection-freshness-epoch-fencing                               | product | solved    | 1        |
| model-readiness-handoff-liveness                                       | product | solved    | 1        |
| non-docker-validation-green                                            | product | exhausted | 0        |
| operation-workflow-drain-redrive                                       | product | solved    | 1        |
| placement-data-affinity-tier1b                                         | product | solved    | 1        |
| provisioning-admission-ledger-hold-transient-wait                      | product | solved    | 1        |
| quest-git-handoff-requirement                                          | product | solved    | 1        |
| quest-model-guidance-theory-use                                        | product | solved    | 1        |
| quest-source-change-subagent-verification                              | product | solved    | 1        |
| quest-system-continuation-gates                                        | process | solved    | 1        |
| quest-workflow-signal-quality                                          | process | solved    | 1        |
| raft-candidacy-reluctance-drain-source                                 | product | solved    | 0        |
| release-0-1-0-alpha                                                    | product | solved    | 1        |
| replica-operation-insert-retry-idempotency                             | product | solved    | 1        |
| restart-new-ip-name-first-advertising                                  | product | solved    | 0        |
| restart-new-ip-peer-reconnect-unwedge                                  | product | solved    | 0        |
| rolling-restart-liveness-downstream-witness                            | process | solved    | 1        |
| rolling-restart-liveness-emulation                                     | process | solved    | 1        |
| rolling-restart-liveness-epic-graduation                               | process | solved    | 1        |
| rolling-restart-liveness-log-replay                                    | process | solved    | 1        |
| rolling-restart-run4-admin-query-backpressure                          | process | solved    | 1        |
| rolling-restart-run4-control-plane-publications-failed-operation-mask  | product | solved    | 1        |
| rolling-restart-run4-drain-residual                                    | product | exhausted | 5        |
| rolling-restart-run4-leadership-quiescence-signature                   | product | solved    | 1        |
| rolling-restart-run4-liveness-residual-agreement                       | process | solved    | 1        |
| rolling-restart-run4-load-admission-backpressure                       | process | solved    | 1        |
| rolling-restart-run4-load-lane-admin-emission                          | process | solved    | 1        |
| rolling-restart-run4-load-lane-owner-reproducer                        | process | solved    | 1        |
| rolling-restart-run4-mixed-priority-context-selection                  | process | solved    | 1        |
| rolling-restart-run4-operation-drain                                   | product | exhausted | 1        |
| rolling-restart-run4-operation-drain-owner-progress-token              | product | solved    | 1        |
| rolling-restart-run4-passfail-discriminator-census                     | product | solved    | 1        |
| rolling-restart-run4-postrebalance-diagnostics-routing                 | process | solved    | 1        |
| rolling-restart-run4-postrebalance-drain-run15                         | process | solved    | 1        |
| rolling-restart-run4-postrebalance-trim-drain                          | process | solved    | 1        |
| rolling-restart-run4-readiness-analyzer-normalization                  | process | solved    | 1        |
| rolling-restart-run4-readiness-support-evidence                        | process | solved    | 1        |
| rolling-restart-run4-stat-gate-classifier                              | process | solved    | 1        |
| rolling-restart-run4-target-sync-reentry                               | product | solved    | 1        |
| rolling-restart-w1-priority-establishment-write-unwedge                | product | exhausted | 0        |
| runtime-service-affinity-policy-lift                                   | product | solved    | 1        |
| service-partition-access-attribution                                   | product | solved    | 1        |
| service-read-locality-policy                                           | product | solved    | 1        |
| sql-statement-parser-coverage                                          | product | solved    | 1        |
| steering-doc-clarity                                                   | process | solved    | 0        |
| test-harness-improvement-batch                                         | product | solved    | 0        |
| workflow-linking-and-memory-loop                                       | process | solved    | 0        |
| write-routing-repair-under-control-plane-moves                         | product | solved    | 1        |

## 5 · Closure frontier — 15 active of 42
_Cross-quest invariant tracking (closure-ledger/CL-###), grouped by subsystem. Quests claim these via links.closesCL._

Areas: harness-control-snapshot (2) · harness-oracle (2) · membership-publication (2) · placement-planning-feedback (1) · placement-priority-spread (3) · readiness-projection (3) · restart-rejoin-identity (1) · transport-replication-backpressure (1)

### harness-control-snapshot — 2

| id     | status   | last gate | concern                  |
| ------ | -------- | --------- | ------------------------ |
| CL-002 | narrowed | —         | harness-control-snapshot |
| CL-025 | narrowed | —         | harness-control-snapshot |

### harness-oracle — 2

| id     | status | last gate        | concern                                                     |
| ------ | ------ | ---------------- | ----------------------------------------------------------- |
| CL-030 | open   | 20260612T173105Z | harness-oracle (primary) + node-resource-safety (secondary) |
| CL-031 | open   | 20260612T223302Z | harness-oracle (blindness) + node-resource-safety (root)    |

### membership-publication — 2

| id     | status   | last gate        | concern                                                                          |
| ------ | -------- | ---------------- | -------------------------------------------------------------------------------- |
| CL-001 | narrowed | 20260616T071019Z | membership-publication                                                           |
| CL-039 | open     | 20260615T205549Z | membership-publication write-substrate / control-plane raft leadership placement |

### placement-planning-feedback — 1

| id     | status   | last gate        | concern                     |
| ------ | -------- | ---------------- | --------------------------- |
| CL-008 | narrowed | 20260611T061307Z | placement-planning-feedback |

### placement-priority-spread — 3

| id     | status   | last gate | concern                                                 |
| ------ | -------- | --------- | ------------------------------------------------------- |
| CL-023 | narrowed | —         | placement-priority-spread                               |
| CL-028 | narrowed | —         | placement-priority-spread                               |
| CL-029 | narrowed | —         | placement-priority-spread (operation workflow liveness) |

### readiness-projection — 3

| id     | status   | last gate        | concern              |
| ------ | -------- | ---------------- | -------------------- |
| CL-004 | narrowed | —                | readiness-projection |
| CL-005 | narrowed | —                | readiness-projection |
| CL-022 | narrowed | 20260612T085908Z | readiness-projection |

### restart-rejoin-identity — 1

| id     | status   | last gate | concern                 |
| ------ | -------- | --------- | ----------------------- |
| CL-024 | narrowed | —         | restart-rejoin-identity |

### transport-replication-backpressure — 1

| id     | status | last gate        | concern                            |
| ------ | ------ | ---------------- | ---------------------------------- |
| CL-009 | open   | 20260611T052934Z | transport-replication-backpressure |

---
Drill in: `npm run solve:status -- --id <q>` · `npm run trace -- --spec <s>` · `npm run solve:report -- --id <q>` · `npm run frontier`
