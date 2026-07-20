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

## 2 · Epics — 25
_Lightweight planning above specs (solve/epics/) — sharpen intent before a sealed doneWhen exists._

| id                                                       | status                               | roadmapRow                | graduatesTo                                              |
| -------------------------------------------------------- | ------------------------------------ | ------------------------- | -------------------------------------------------------- |
| architecture-altitude-review                             | discussing                           | —                         | —                                                        |
| continuous-ai-workflow-landscape                         | resolved                             | —                         | —                                                        |
| control-plane-write-wedge-leader-local-establishment     | resolved                             | RM-0.1-fs-rolling-restart | —                                                        |
| convergence-loop-and-workflow-overhead                   | discussing                           | —                         | quests                                                   |
| convergence-timeout-leadership-settle                    | resolved                             | RM-0.1-fs-rolling-restart | —                                                        |
| core-logic-live-validation                               | discussing                           | —                         | —                                                        |
| developer-velocity-maintainability-and-product-readiness | active                               | —                         | developer-velocity-maintainability-and-product-readiness |
| dst-cost-model-circle                                    | resolved-option-b-refuted-pivot-to-a | —                         | —                                                        |
| formation-complexity-consolidation                       | discussing                           | —                         | —                                                        |
| hardware-relative-convergence-budget                     | resolved                             | RM-0.1-fs-rolling-restart | —                                                        |
| hysteresis-consolidation                                 | active                               | —                         | —                                                        |
| lagrange-devops-onboarding                               | active                               | —                         | —                                                        |
| latent-convergence-blocker-census                        | graduated                            | RM-0.1-fs-rolling-restart | topology-convergence-hardening                           |
| membership-single-owner-cutover                          | resolved                             | —                         | membership-lifecycle-placement-hard-cutover              |
| owner-boundary-hardening-and-unification                 | active                               | —                         | owner-boundary-hardening-and-unification                 |
| quest-standing-invariants                                | graduated                            | —                         | standing-invariant-closure                               |
| roadmap-integrity-wave-0                                 | active                               | —                         | —                                                        |
| rolling-restart-liveness-observatory                     | graduated                            | RM-0.1-fs-rolling-restart | topology-convergence-hardening                           |
| self-hosting-circularity-generic-treatment               | graduated                            | —                         | voter-readiness-visibility-single-owner-table            |
| service-data-affinity-placement                          | sharpening                           | —                         | —                                                        |
| slow-rejoiner-progress-or-evict                          | resolved                             | RM-0.1-fs-rolling-restart | convergence-timeout-leadership-settle                    |
| spread-satisfied-in-flight-staleness-unmask              | landed-default-off                   | RM-0.1-fs-rolling-restart | control-plane-write-wedge-leader-local-establishment     |
| steering-doc-clarity                                     | graduated                            | —                         | —                                                        |
| strategy-gate-and-altitude-teeth                         | discussing                           | —                         | —                                                        |
| topology-convergence-hardening                           | sharpening                           | RM-0.1-fs-rolling-restart | membership-lifecycle-placement-hard-cutover              |

## 3 · Specs — 15 (0 with open quests)
_Detailed planning (solve/specs/): design + requirements + tasks. Implemented by quests, not a closure surface._

| spec                                        | quests (open/total) | quest ids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| activation-cost-aware-placement             | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| core-topology-control-plane-rewrite         | 0/5                 | model-bounded-retry-exit-routing, model-owner-trace-validation, model-owner-transition-recoverable-wake, model-projection-freshness-epoch-fencing, model-readiness-handoff-liveness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| developer-experience-remediation            | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| hlc-cross-leader-monotonicity               | 0/1                 | hlc-cross-leader-monotonicity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| llm-steering-usability-hardening            | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| membership-lifecycle-placement-hard-cutover | 0/28                | membership-publication-drain-determinism, operation-workflow-drain-redrive, rolling-restart-core-stability, rolling-restart-liveness-downstream-witness, rolling-restart-liveness-emulation, rolling-restart-liveness-epic-graduation, rolling-restart-liveness-log-replay, rolling-restart-run4-admin-query-backpressure, rolling-restart-run4-control-plane-publications-failed-operation-mask, rolling-restart-run4-drain-residual, rolling-restart-run4-leadership-quiescence-signature, rolling-restart-run4-liveness-residual-agreement, rolling-restart-run4-load-admission-backpressure, rolling-restart-run4-load-lane-admin-emission, rolling-restart-run4-load-lane-owner-reproducer, rolling-restart-run4-mixed-priority-context-selection, rolling-restart-run4-observer-staleness, rolling-restart-run4-operation-drain, rolling-restart-run4-operation-drain-owner-progress-token, rolling-restart-run4-passfail-discriminator-census, rolling-restart-run4-postrebalance-diagnostics-routing, rolling-restart-run4-postrebalance-drain-run15, rolling-restart-run4-postrebalance-trim-drain, rolling-restart-run4-publication-visibility-run2, rolling-restart-run4-readiness-analyzer-normalization, rolling-restart-run4-readiness-support-evidence, rolling-restart-run4-target-sync-reentry, rolling-restart-w1-priority-establishment-write-unwedge |
| metastable-convergence-resilience           | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| node-liveness-veto-consolidation            | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| owner-boundary-hardening-and-unification    | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| project-hardening-proof-integrity-cutover   | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| proximity-spray-cdc-propagation-overlay     | 0/1                 | cdc-cache-delete-resurrection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| raft-logic-migration                        | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| service-portability-ladder                  | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| spec-led-runtime-modularization             | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| standing-invariant-closure                  | 0/0                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 4 · Quests — 10 draft / 19 open / 344 terminal
_The only measured layer (solve/quests/). Sealed goal; attempts and findings live in the append-only log._

### Draft

| id                                          | class   | spec                                                    |
| ------------------------------------------- | ------- | ------------------------------------------------------- |
| cl-planning-memo-invalidation-regression    | product | solve/epics/owner-boundary-hardening-and-unification.md |
| lagrange-devops-onboarding                  | product | —                                                       |
| managed-partition-merge-live-validation     | product | —                                                       |
| newcomer-onboarding-friction                | product | —                                                       |
| per-table-cache-version-consolidation       | product | solve/epics/formation-complexity-consolidation.md       |
| priority-recovery-followup-phi-monotonicity | product | solve/epics/topology-convergence-hardening.md           |
| read-authority-structural-threading         | product | solve/epics/formation-complexity-consolidation.md       |
| routed-mutation-silent-ledger-write-loss    | product | —                                                       |
| runtime-owner-reconcile-alignment           | product | —                                                       |
| unwired-event-adjudication                  | product | —                                                       |

### Open

| id                                                       | class   | spec                                                                                                  | attempts | reopens | osc | closes |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | -------- | ------- | --- | ------ |
| control-snapshot-heartbeat-lease-freshness               | product | solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md                      | 2        | 0       | 0   | —      |
| formation-ledger-self-move-blocks-cluster-ops            | product | —                                                                                                     | 5        | 1       | 0   | —      |
| formation-reservation-reconcile-premature-orphan-release | product | —                                                                                                     | 0        | 0       | 0   | —      |
| movielens-create-budget-intent-serialization             | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| movielens-local-leader-row-visibility                    | product | solve/epics/service-data-affinity-placement.md                                                        | 3        | 0       | 0   | —      |
| movielens-local-leader-row-visibility-model              | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| movielens-nodes-priority-recovery-escape                 | product | —                                                                                                     | 1        | 0       | 0   | —      |
| movielens-observation-watermark-churn-consolidation      | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| movielens-operation-ledger-terminal-hold                 | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| movielens-parallel-reduce-result-chronology              | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| movielens-pre-schema-priority-spread-admission-authority | product | solve/epics/service-data-affinity-placement.md                                                        | 0        | 0       | 0   | —      |
| movielens-ready-lease-maintenance-critical-owner-lane    | product | solve/epics/service-data-affinity-placement.md                                                        | 3        | 0       | 0   | —      |
| movielens-replace-bootstrap-cohort-authority             | product | solve/changes/movielens-three-way-affinity-demo/handoff-2026-07-15-wave4-live-preload-topology-gap.md | 1        | 0       | 0   | —      |
| movielens-three-way-affinity-demo                        | product | —                                                                                                     | 7        | 0       | 0   | —      |
| oci-container-driver-live-activation                     | product | solve/specs/service-portability-ladder/requirements.md#r4--real-oci-supervision                       | 8        | 0       | 0   | —      |
| ordinary-placement-ready-lease-candidate-admission       | product | solve/epics/service-data-affinity-placement.md                                                        | 1        | 0       | 0   | —      |
| service-data-affinity-parallel-reduce-demo-live          | product | —                                                                                                     | 1        | 0       | 0   | —      |
| solver-verifier-rejection-supersession-core              | process | docs/steering/workflow-guidelines/solver-quests.md                                                    | 1        | 0       | 0   | —      |
| solver-verifier-rejection-supersession-steering          | process | docs/steering/workflow-guidelines/solver-quests.md                                                    | 1        | 0       | 0   | —      |

### Terminal

| id                                                                                                | class   | outcome   | attempts |
| ------------------------------------------------------------------------------------------------- | ------- | --------- | -------- |
| aggregate-duplication-analyzer-runtime-consolidation                                              | process | solved    | 2        |
| alloy-execution-guardrails-verifier-fix                                                           | product | solved    | 1        |
| altitude-reflection-mechanism                                                                     | process | solved    | 1        |
| autonomy-and-parallel-defaults                                                                    | process | solved    | 0        |
| canonical-replica-inventory-cutover                                                               | product | solved    | 2        |
| cdc-cache-delete-resurrection                                                                     | product | solved    | 1        |
| cli-static-guideline-ratchet-closure                                                              | process | exhausted | 0        |
| cli-static-guideline-ratchet-closure-v2                                                           | process | solved    | 3        |
| cognitive-complexity-ratchet-closure                                                              | process | solved    | 1        |
| configured-split-threshold-policy-precedence                                                      | product | solved    | 3        |
| control-plane-readiness-trust-cutover                                                             | product | solved    | 1        |
| coordinator-reconcile-lane-ledger-write-head-of-line                                              | product | solved    | 1        |
| core-system-logic-alloy-adjacency                                                                 | product | solved    | 1        |
| core-system-logic-model-adjacency                                                                 | product | solved    | 1        |
| cross-partition-join-pushdown                                                                     | product | solved    | 1        |
| cure-typing-owner-migration-admission-lanes                                                       | process | solved    | 1        |
| cure-typing-owner-migration-move-minters                                                          | process | solved    | 1        |
| cure-typing-single-owner-table                                                                    | process | solved    | 2        |
| developer-smoke-command-surface                                                                   | process | solved    | 1        |
| developer-smoke-proof                                                                             | process | solved    | 1        |
| distributed-query-straggler-hedging                                                               | product | solved    | 1        |
| distributed-select-global-merge-correctness                                                       | product | solved    | 1        |
| distroless-fast-local-harness-shell-free                                                          | process | solved    | 0        |
| dockerized-pg-client-compatibility-example                                                        | product | solved    | 2        |
| dst-cost-model-fidelity-spike                                                                     | product | exhausted | 0        |
| dt-drain-safety-overremoval-hunt                                                                  | product | solved    | 1        |
| durable-provisioning-job-owner                                                                    | product | solved    | 1        |
| effective-placement-serial-priority-planner                                                       | product | exhausted | 1        |
| executor-active-services-cache-handoff                                                            | product | exhausted | 1        |
| external-service-manifest-contract                                                                | product | solved    | 2        |
| flag-debt-retirement                                                                              | product | solved    | 1        |
| formation-background-release-owner-closure                                                        | product | exhausted | 1        |
| formation-background-release-quiescence-anchor-live                                               | product | exhausted | 5        |
| formation-control-plane-move-interlock                                                            | product | solved    | 2        |
| formation-joining-ready-phase-fence                                                               | product | exhausted | 0        |
| formation-joining-ready-phase-fence-live                                                          | product | solved    | 1        |
| formation-ledger-leader-local-persistence-wedge                                                   | product | solved    | 1        |
| formation-ledger-over-target-accounting-drain-phase-replace-blind-spot                            | product | solved    | 1        |
| formation-ledger-over-target-surplus-drain-coupled-removal                                        | product | exhausted | 0        |
| formation-ledger-post-spread-voter-visibility-latency                                             | product | exhausted | 0        |
| formation-ledger-quorum-concentrated-replace-churn-60s                                            | product | solved    | 1        |
| formation-ledger-quorum-spread-first                                                              | product | solved    | 1        |
| formation-ledger-recovery-replace-source-specificity                                              | product | exhausted | 1        |
| formation-ledger-recovery-replace-source-specificity-proof                                        | product | solved    | 1        |
| formation-ledger-self-spread-services-owner-unavailable                                           | product | solved    | 1        |
| formation-ledger-spread-completion-self-move-interlock-deadlock                                   | product | solved    | 1        |
| formation-ledger-spread-window-follow-up-latency                                                  | product | solved    | 1        |
| formation-liveness-dependency-serial-planner                                                      | product | exhausted | 1        |
| formation-priority-spread-authoritative-handoff-closure                                           | product | exhausted | 7        |
| formation-priority-spread-authoritative-publication-closure                                       | product | exhausted | 7        |
| formation-priority-spread-without-exclusive-self-move-cost                                        | product | exhausted | 3        |
| formation-promoted-voter-not-voter-ready-routable-60s                                             | product | exhausted | 1        |
| formation-replace-dispatch-deferred-retry-hold                                                    | product | exhausted | 0        |
| formation-runtime-service-create-lane-budget-starvation                                           | product | solved    | 3        |
| formation-schema-operation-collision-leader-read-closure                                          | product | exhausted | 6        |
| formation-voter-surplus-promotion-deferral-livelock                                               | product | solved    | 1        |
| fresh-join-multi-peer-contact                                                                     | product | solved    | 1        |
| global-owner-debt-inventory                                                                       | process | solved    | 5        |
| global-owner-debt-inventory-command-index-projection-refresh                                      | process | solved    | 1        |
| global-owner-debt-inventory-migration                                                             | process | solved    | 1        |
| global-owner-debt-inventory-tooling-projection-refresh-wave0                                      | process | solved    | 1        |
| helm-admin-default-deny-cutover                                                                   | product | solved    | 1        |
| helm-contract-ci-tooling                                                                          | process | solved    | 1        |
| helm-render-parser-tooling                                                                        | process | solved    | 1        |
| hlc-cross-leader-monotonicity                                                                     | product | solved    | 1        |
| hold-engagement-single-owner-table                                                                | process | solved    | 1        |
| installable-service-artifact-owner                                                                | product | solved    | 1        |
| join-retry-patience-selectable                                                                    | product | solved    | 2        |
| join-retry-resume-lifecycle-finalization                                                          | product | solved    | 1        |
| join-retry-resume-lifecycle-scenario-registration                                                 | process | solved    | 1        |
| l-write-membership-deferred-seed                                                                  | product | exhausted | 0        |
| latency-group-zone-affinity-demo                                                                  | product | exhausted | 0        |
| leadership-flap-attribution-census                                                                | product | solved    | 0        |
| ledger-participant-transaction-zombie-lifecycle                                                   | product | solved    | 1        |
| legacy-work-tracker-removal                                                                       | product | solved    | 1        |
| listener-port-model-cli-guidance-gap                                                              | product | solved    | 2        |
| listener-port-model-config-authority                                                              | product | solved    | 2        |
| listener-port-model-doc-helper-alignment                                                          | product | solved    | 1        |
| listener-port-model-runtime-consumers                                                             | product | solved    | 1        |
| listener-port-model-single-authority                                                              | product | solved    | 2        |
| listener-port-model-surface-alignment                                                             | product | solved    | 3        |
| llm-steering-authoring-contract                                                                   | process | exhausted | 0        |
| llm-steering-authoring-contract-isolated-evidence                                                 | process | solved    | 1        |
| llm-steering-canon-legacy-report                                                                  | process | solved    | 1        |
| llm-steering-complete-rule-surface                                                                | process | solved    | 1        |
| llm-steering-operator-orientation                                                                 | process | exhausted | 0        |
| llm-steering-operator-orientation-isolated-evidence                                               | process | solved    | 1        |
| llm-steering-supervisor-actions                                                                   | process | exhausted | 0        |
| llm-steering-supervisor-actions-isolated-evidence                                                 | process | solved    | 1        |
| llm-steering-verification-handoff                                                                 | process | solved    | 1        |
| local-leadership-tenure-bound-safety-evidence                                                     | product | solved    | 2        |
| managed-partition-merge                                                                           | product | solved    | 1        |
| membership-publication-drain-determinism                                                          | product | solved    | 0        |
| model-bounded-retry-exit-routing                                                                  | product | solved    | 1        |
| model-owner-trace-validation                                                                      | product | solved    | 1        |
| model-owner-transition-recoverable-wake                                                           | product | solved    | 1        |
| model-projection-freshness-epoch-fencing                                                          | product | solved    | 1        |
| model-readiness-handoff-liveness                                                                  | product | solved    | 1        |
| movielens-admin-event-loop-isolation-discriminator                                                | process | solved    | 1        |
| movielens-admin-snapshot-deadline-propagation                                                     | product | exhausted | 1        |
| movielens-admin-snapshot-retry-deadline-budget                                                    | product | exhausted | 4        |
| movielens-affinity-placement-demo                                                                 | product | exhausted | 0        |
| movielens-authoritative-observation-watermark                                                     | product | exhausted | 3        |
| movielens-authoritative-observation-watermark-admin-contract-fixtures                             | process | solved    | 1        |
| movielens-colocated-follower-remove-safety                                                        | product | exhausted | 2        |
| movielens-colocated-follower-replacement-source                                                   | product | exhausted | 1        |
| movielens-exact-election-evidence-same-turn-model                                                 | product | solved    | 1        |
| movielens-exact-election-evidence-same-turn-owner                                                 | product | exhausted | 2        |
| movielens-formation-alive-peer-keepalive-liveness                                                 | product | exhausted | 6        |
| movielens-incremental-replace-spread-nonregression                                                | product | exhausted | 2        |
| movielens-ledger-completion-continuity-discriminator                                              | process | solved    | 2        |
| movielens-local-leader-row-visibility-formal-model                                                | product | solved    | 1        |
| movielens-nodes-priority-recovery-adverse-ab-rollback                                             | process | exhausted | 0        |
| movielens-nodes-priority-recovery-adverse-ab-rollback-sealed                                      | process | solved    | 1        |
| movielens-pre-schema-priority-spread-admission-authority-measured                                 | product | solved    | 1        |
| movielens-pre-schema-quiescence-live                                                              | product | exhausted | 8        |
| movielens-preload-admission-gate-cutover                                                          | product | solved    | 5        |
| movielens-priority-spread-gap-coverage-authority                                                  | product | solved    | 1        |
| movielens-priority-surrogate-single-followup                                                      | product | exhausted | 1        |
| movielens-priority-surrogate-single-owner-arbitration                                             | product | exhausted | 1        |
| movielens-ratings-scoped-split-policy-live                                                        | product | exhausted | 5        |
| movielens-replace-bootstrap-cohort-authority-measured                                             | product | solved    | 1        |
| movielens-stale-only-preflight-repair-scope                                                       | product | exhausted | 1        |
| non-docker-validation-green                                                                       | product | exhausted | 0        |
| oci-receipt-ledger-lock-release-diagnostic                                                        | process | solved    | 1        |
| oci-runtime-host-contract                                                                         | process | solved    | 2        |
| oci-runtime-host-contract-final                                                                   | process | solved    | 5        |
| operation-workflow-drain-redrive                                                                  | product | solved    | 1        |
| owner-complexity-rebalancer-planning-owner-placement-rebalance-planning                           | product | exhausted | 1        |
| owner-complexity-rebalancer-planning-owner-placement-rebalance-planning-clean-receipt             | product | solved    | 1        |
| partition-class-ladder-bootstrap-evidence-tooling                                                 | process | solved    | 1        |
| partition-class-ladder-census-hardening-final                                                     | process | exhausted | 3        |
| partition-class-ladder-census-hardening-parameter-snapshot-final                                  | process | exhausted | 2        |
| partition-class-ladder-census-hardening-recursive-final                                           | process | exhausted | 3        |
| partition-class-ladder-census-hardening-rest-exclusion-evidence-tooling                           | process | solved    | 1        |
| partition-class-ladder-census-hardening-rest-exclusion-final                                      | process | solved    | 1        |
| partition-class-ladder-census-proof                                                               | process | solved    | 3        |
| partition-class-ladder-census-proof-final                                                         | process | solved    | 4        |
| partition-class-ladder-census-proof-integrity-migration                                           | process | solved    | 1        |
| partition-class-ladder-control-plane-evidence-final                                               | process | exhausted | 0        |
| partition-class-ladder-control-plane-evidence-tooling                                             | process | exhausted | 1        |
| partition-class-ladder-control-plane-evidence-tooling-final                                       | process | solved    | 1        |
| partition-class-ladder-migration-bootstrap                                                        | process | solved    | 1        |
| partition-class-ladder-migration-control-plane                                                    | process | exhausted | 0        |
| partition-class-ladder-migration-control-plane-final                                              | process | solved    | 1        |
| partition-class-ladder-migration-node-create                                                      | process | solved    | 1        |
| partition-class-ladder-migration-node-runtime-readiness                                           | process | solved    | 2        |
| partition-class-ladder-migration-owner-execution                                                  | process | solved    | 1        |
| partition-class-ladder-migration-partition-domain                                                 | process | solved    | 2        |
| partition-class-ladder-migration-query-domain                                                     | process | solved    | 1        |
| partition-class-ladder-migration-raft                                                             | process | solved    | 1        |
| partition-class-ladder-migration-rebalance-coordinator                                            | process | solved    | 1        |
| partition-class-ladder-migration-rebalancer-repository-policy                                     | process | solved    | 2        |
| partition-class-ladder-migration-unified-rebalancer                                               | process | solved    | 1        |
| partition-class-ladder-node-create-evidence-tooling                                               | process | solved    | 1        |
| partition-class-ladder-node-runtime-readiness-evidence-tooling                                    | process | solved    | 1        |
| partition-class-ladder-owner-contract                                                             | process | exhausted | 0        |
| partition-class-ladder-owner-evidence-tooling                                                     | process | solved    | 1        |
| partition-class-ladder-owner-execution-evidence-tooling                                           | process | solved    | 1        |
| partition-class-ladder-owner-implementation                                                       | process | solved    | 1        |
| partition-class-ladder-owner-implementation-final                                                 | process | solved    | 1        |
| partition-class-ladder-owner-runtime                                                              | process | exhausted | 0        |
| partition-class-ladder-owner-tooling                                                              | process | solved    | 2        |
| partition-class-ladder-partition-domain-evidence-tooling                                          | process | solved    | 1        |
| partition-class-ladder-query-domain-evidence-tooling                                              | process | solved    | 1        |
| partition-class-ladder-raft-evidence-tooling                                                      | process | solved    | 1        |
| partition-class-ladder-rebalance-coordinator-evidence-tooling                                     | process | solved    | 1        |
| partition-class-ladder-rebalancer-repository-policy-evidence-tooling                              | process | solved    | 1        |
| partition-class-ladder-single-owner-table                                                         | process | exhausted | 7        |
| partition-class-ladder-single-owner-table-integrity-archive-historical                            | process | solved    | 1        |
| partition-class-ladder-single-owner-table-integrity-archive-replacements                          | process | solved    | 1        |
| partition-class-ladder-single-owner-table-integrity-migration                                     | process | solved    | 1        |
| partition-class-ladder-unified-rebalancer-evidence-tooling                                        | process | solved    | 1        |
| partition-live-leader-address-routing                                                             | product | exhausted | 3        |
| partition-managed-merge-explicit-state-ratchet                                                    | process | solved    | 1        |
| pgwire-authentication-cutover                                                                     | product | solved    | 5        |
| pgwire-tls-policy-cutover                                                                         | product | solved    | 3        |
| placement-data-affinity-tier1b                                                                    | product | solved    | 1        |
| pressure-admission-flagless-cdc-topology-sweep                                                    | product | solved    | 1        |
| pressure-admission-flagless-defer-policy                                                          | product | solved    | 2        |
| pressure-admission-flagless-node-admin-sweep                                                      | product | solved    | 1        |
| pressure-admission-flagless-partition-mg-sweep                                                    | product | solved    | 1        |
| pressure-admission-flagless-publication-parking                                                   | product | solved    | 1        |
| pressure-admission-flagless-query-logging-sweep                                                   | product | solved    | 1        |
| pressure-admission-flagless-rebalancer-brake                                                      | product | solved    | 1        |
| priority-placement-completed-topology-observation                                                 | product | solved    | 1        |
| priority-placement-snapshot-owner-reconciliation                                                  | product | solved    | 2        |
| priority-recovery-admin-control-plane-admission-publication-single-engaged-authority              | product | solved    | 1        |
| priority-recovery-admin-control-plane-build-priority-recovery-admission-by-partition-id-authority | product | exhausted | 0        |
| priority-recovery-admin-dormant-context-retirement                                                | product | solved    | 1        |
| priority-recovery-authoritative-summary-inventory-alignment                                       | product | solved    | 1        |
| priority-recovery-control-plane-normalize-distinct-string-array-authority                         | product | solved    | 1        |
| priority-recovery-owner-inventory                                                                 | process | solved    | 1        |
| priority-recovery-owner-inventory-projection-refresh                                              | process | exhausted | 0        |
| priority-recovery-owner-inventory-tooling-projection-refresh                                      | process | solved    | 1        |
| priority-recovery-owner-inventory-tooling-projection-refresh-wave0-final                          | process | solved    | 1        |
| priority-recovery-replace-owner-inventory-unavailable                                             | product | exhausted | 5        |
| project-hardening-proof-integrity-cutover                                                         | product | solved    | 1        |
| project-hardening-workflow-proof-integrity                                                        | process | solved    | 1        |
| provisioning-admission-ledger-hold-transient-wait                                                 | product | solved    | 1        |
| provisioning-parent-deadline-cutover                                                              | product | solved    | 1        |
| query-distributed-decision-state-ratchet                                                          | process | solved    | 1        |
| quest-git-handoff-requirement                                                                     | product | solved    | 1        |
| quest-model-guidance-theory-use                                                                   | product | solved    | 1        |
| quest-source-change-subagent-verification                                                         | product | solved    | 1        |
| quest-system-continuation-gates                                                                   | process | solved    | 1        |
| quest-workflow-signal-quality                                                                     | process | solved    | 1        |
| quiescence-observation-lane-decoupling                                                            | product | exhausted | 0        |
| raft-candidacy-reluctance-drain-source                                                            | product | solved    | 0        |
| raft-committed-entry-immutability                                                                 | product | solved    | 1        |
| raft-snapshot-gated-compaction                                                                    | product | solved    | 1        |
| rebalancer-own-create-memory-duplicate-replace                                                    | product | solved    | 1        |
| release-0-1-0-alpha                                                                               | product | solved    | 1        |
| replica-operation-insert-retry-idempotency                                                        | product | solved    | 1        |
| restart-new-ip-name-first-advertising                                                             | product | solved    | 0        |
| restart-new-ip-peer-reconnect-unwedge                                                             | product | solved    | 0        |
| rolling-restart-core-stability                                                                    | product | exhausted | 74       |
| rolling-restart-liveness-downstream-witness                                                       | process | solved    | 1        |
| rolling-restart-liveness-emulation                                                                | process | solved    | 1        |
| rolling-restart-liveness-epic-graduation                                                          | process | solved    | 1        |
| rolling-restart-liveness-log-replay                                                               | process | solved    | 1        |
| rolling-restart-run4-admin-query-backpressure                                                     | process | solved    | 1        |
| rolling-restart-run4-control-plane-publications-failed-operation-mask                             | product | solved    | 1        |
| rolling-restart-run4-critical-spread                                                              | product | exhausted | 1        |
| rolling-restart-run4-drain-residual                                                               | product | exhausted | 5        |
| rolling-restart-run4-join-runtime-activation                                                      | product | exhausted | 2        |
| rolling-restart-run4-join-runtime-activation-integrity-migration                                  | process | exhausted | 0        |
| rolling-restart-run4-join-runtime-activation-workflow-integrity-migration                         | process | solved    | 1        |
| rolling-restart-run4-leadership-quiescence-signature                                              | product | solved    | 1        |
| rolling-restart-run4-liveness-residual-agreement                                                  | process | solved    | 1        |
| rolling-restart-run4-load-admission-backpressure                                                  | process | solved    | 1        |
| rolling-restart-run4-load-lane-admin-emission                                                     | process | solved    | 1        |
| rolling-restart-run4-load-lane-owner-reproducer                                                   | process | solved    | 1        |
| rolling-restart-run4-mixed-priority-context-selection                                             | process | solved    | 1        |
| rolling-restart-run4-observer-staleness                                                           | product | exhausted | 1        |
| rolling-restart-run4-operation-drain                                                              | product | exhausted | 1        |
| rolling-restart-run4-operation-drain-owner-progress-token                                         | product | solved    | 1        |
| rolling-restart-run4-passfail-discriminator-census                                                | product | solved    | 1        |
| rolling-restart-run4-postrebalance-diagnostics-routing                                            | process | solved    | 1        |
| rolling-restart-run4-postrebalance-drain-run15                                                    | process | solved    | 1        |
| rolling-restart-run4-postrebalance-trim-drain                                                     | process | solved    | 1        |
| rolling-restart-run4-publication-visibility-run2                                                  | product | exhausted | 0        |
| rolling-restart-run4-readiness-analyzer-normalization                                             | process | solved    | 1        |
| rolling-restart-run4-readiness-support-evidence                                                   | process | solved    | 1        |
| rolling-restart-run4-stat-gate-classifier                                                         | process | solved    | 1        |
| rolling-restart-run4-target-sync-reentry                                                          | product | solved    | 1        |
| rolling-restart-w1-priority-establishment-write-unwedge                                           | product | exhausted | 0        |
| runtime-replica-state-projection                                                                  | product | solved    | 2        |
| runtime-replica-state-projection-retained-reconcile                                               | product | exhausted | 5        |
| runtime-replica-state-projection-retained-reconcile-integrity-reseal                              | product | exhausted | 1        |
| runtime-service-active-outcome-remote-owner-handoff                                               | product | exhausted | 1        |
| runtime-service-affinity-policy-lift                                                              | product | solved    | 1        |
| runtime-service-affinity-suboptimality-observer                                                   | product | solved    | 0        |
| runtime-service-creating-owner-wake-progress-admission                                            | product | solved    | 13       |
| runtime-service-handler-executor-outcome-late-binding                                             | product | exhausted | 1        |
| schema-admission-canonical-drain-handoff                                                          | product | exhausted | 2        |
| schema-provisioning-inline-execute-owner-redrive                                                  | product | exhausted | 1        |
| schema-provisioning-not-null-intent-recovery-roundtrip                                            | product | exhausted | 1        |
| seed-join-gate-authoritative-refresh                                                              | product | solved    | 2        |
| service-affinity-demo-report-evidence                                                             | product | solved    | 1        |
| service-affinity-identity-wiring                                                                  | product | solved    | 1        |
| service-affinity-query-attribution-wiring                                                         | product | solved    | 1        |
| service-cli-package-bin                                                                           | process | solved    | 1        |
| service-cli-pg-runtime-dependency                                                                 | process | solved    | 2        |
| service-cli-pg-runtime-dependency-v2                                                              | process | solved    | 2        |
| service-control-transport-decision                                                                | process | solved    | 1        |
| service-data-affinity-parallel-reduce-demo                                                        | product | exhausted | 0        |
| service-init-scaffold                                                                             | product | solved    | 1        |
| service-install-catalog-owner                                                                     | product | exhausted | 3        |
| service-install-catalog-owner-concurrency-closure                                                 | product | solved    | 1        |
| service-install-lifecycle-cli                                                                     | product | solved    | 3        |
| service-install-lifecycle-cli-final                                                               | product | solved    | 1        |
| service-installation-reconciler                                                                   | product | solved    | 2        |
| service-lifecycle-authoritative-sql-handoff                                                       | product | solved    | 6        |
| service-lifecycle-command-catalog-composition                                                     | product | solved    | 2        |
| service-lifecycle-pgwire-executor-handoff                                                         | product | solved    | 1        |
| service-lifecycle-pgwire-sql-transport                                                            | product | solved    | 3        |
| service-lifecycle-sql-control-surface                                                             | product | solved    | 1        |
| service-local-oci-layout                                                                          | product | solved    | 2        |
| service-parallel-reduce-runtime-protocol                                                          | product | solved    | 1        |
| service-partition-access-attribution                                                              | product | solved    | 1        |
| service-portability-claims-contract                                                               | process | solved    | 1        |
| service-portability-claims-example-fixture-alignment                                              | process | solved    | 1        |
| service-portability-claims-surface                                                                | process | exhausted | 0        |
| service-portability-claims-surface-final                                                          | process | solved    | 4        |
| service-portability-claims-surface-v2                                                             | process | solved    | 1        |
| service-read-locality-policy                                                                      | product | solved    | 1        |
| service-static-ratchet-no-headroom                                                                | process | solved    | 2        |
| solver-acceptance-proof-manifest                                                                  | process | solved    | 1        |
| solver-deletion-safe-handoff-recovery                                                             | process | solved    | 2        |
| solver-handoff-oracle-artifact-ownership                                                          | process | solved    | 1        |
| solver-historical-artifact-batch-001                                                              | process | solved    | 1        |
| solver-historical-artifact-batch-tooling                                                          | process | solved    | 1        |
| solver-historical-artifact-census                                                                 | process | solved    | 3        |
| solver-historical-artifact-census-migration                                                       | process | solved    | 1        |
| solver-historical-artifact-migration-v2                                                           | process | solved    | 1        |
| solver-historical-artifact-migration-v2-migration                                                 | process | solved    | 1        |
| solver-historical-oracle-content-archive                                                          | process | solved    | 3        |
| solver-ledger-consistency-log-projection                                                          | process | solved    | 3        |
| solver-next-checkpoint-projection-closure                                                         | process | solved    | 1        |
| solver-operator-park-terminal-evidence-identity                                                   | process | solved    | 1        |
| solver-package-lock-verification-scope                                                            | process | solved    | 2        |
| solver-portfolio-projected-terminal-state                                                         | process | solved    | 1        |
| solver-proof-artifact-census                                                                      | process | solved    | 2        |
| solver-proof-artifact-content-addressing                                                          | process | solved    | 2        |
| solver-scope-classifier-artifact-token-isolation                                                  | process | solved    | 2        |
| solver-scope-pressure-precommit-enforcement                                                       | process | solved    | 1        |
| solver-snapshot-scope-accounting                                                                  | process | solved    | 3        |
| solver-static-guideline-ratchet-closure                                                           | process | solved    | 1        |
| solver-terminal-integrity-cutover                                                                 | process | solved    | 1        |
| solver-terminal-integrity-cutover-exhaustion-fix                                                  | process | solved    | 1        |
| solver-terminal-integrity-cutover-fail-closed-fix                                                 | process | solved    | 1        |
| solver-terminal-integrity-cutover-verifier-fix                                                    | process | solved    | 1        |
| solver-terminal-integrity-red-test-bootstrap                                                      | process | solved    | 1        |
| solver-terminal-integrity-red-test-bootstrap-verifier-fix                                         | process | solved    | 1        |
| solver-verifier-rejection-supersession                                                            | process | exhausted | 3        |
| solver-workflow-draft-receipt-signal-quality                                                      | process | solved    | 1        |
| split-snapshot-transfer-pacing                                                                    | product | solved    | 2        |
| spread-cure-at-target-minting-gap                                                                 | product | solved    | 2        |
| spread-cure-union-escape-and-monotone-gate                                                        | product | solved    | 1        |
| sql-statement-parser-coverage                                                                     | product | solved    | 1        |
| steering-doc-clarity                                                                              | process | solved    | 0        |
| step-coverage-owner-migration-dispatch-family                                                     | process | solved    | 1        |
| step-coverage-owner-migration-recovery-lanes                                                      | process | solved    | 1        |
| step-coverage-single-owner-table                                                                  | process | solved    | 3        |
| test-harness-improvement-batch                                                                    | product | solved    | 0        |
| tooling-static-cure-hold-ratchet                                                                  | process | solved    | 1        |
| tooling-static-partition-analyzer-ratchet                                                         | process | solved    | 1        |
| tooling-static-partition-contract-ratchet-v2                                                      | process | solved    | 1        |
| tooling-static-steering-scenario-ratchet                                                          | process | solved    | 1        |
| tooling-static-step-voter-ratchet                                                                 | process | solved    | 1        |
| transaction-owned-commit-mode-cutover                                                             | product | solved    | 1        |
| transition-mutation-budget-doom-loop                                                              | product | solved    | 1        |
| unused-export-static-ratchet-no-headroom                                                          | process | solved    | 1        |
| user-partition-remote-executor-outcome-owner-wakeup                                               | product | solved    | 3        |
| voter-readiness-owner-critical-partition-set-home                                                 | process | solved    | 1        |
| voter-readiness-owner-migration-partition-raft-aliases                                            | process | solved    | 2        |
| voter-readiness-owner-migration-raft-node-admin                                                   | process | solved    | 1        |
| voter-readiness-owner-migration-rebalancer-batch2                                                 | process | solved    | 1        |
| voter-readiness-owner-migration-rebalancer-control-plane                                          | process | exhausted | 0        |
| voter-readiness-visibility-single-owner-table                                                     | product | solved    | 5        |
| workflow-linking-and-memory-loop                                                                  | process | solved    | 0        |
| write-path-internal-pacing                                                                        | product | solved    | 4        |
| write-routing-repair-under-control-plane-moves                                                    | product | solved    | 1        |

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
