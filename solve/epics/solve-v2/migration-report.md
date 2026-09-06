# solve-v2 migration report

Generated 2026-09-06T09:26:18.275Z by scripts/solve/migrate-v1.js.

Log entries read: 15902. Mapped: 15902. Unmapped: 0.

## Entry types -> v2 types

| v1 type -> v2 | count |
| --- | --- |
| finding -> finding | 3438 |
| evidence-ingested -> finding | 2637 |
| finding -> verification | 1419 |
| attempt -> attempt | 1372 |
| quest -> terminal | 1160 |
| gate-decision -> kept verbatim | 1112 |
| solved -> terminal | 979 |
| theory-result -> finding | 861 |
| quest-declared -> kept verbatim | 797 |
| guard-override -> kept verbatim | 405 |
| reflection -> finding | 363 |
| theory-option-declared -> finding | 342 |
| theory-selected -> finding | 324 |
| park -> terminal | 228 |
| violation -> kept verbatim | 214 |
| theory-system-declared -> finding | 125 |
| invariant.evaluated -> kept verbatim | 37 |
| quest-amended -> kept verbatim | 26 |
| rejection-decomposition -> kept verbatim | 15 |
| frontier-reopened -> kept verbatim | 15 |
| theory-superseded -> finding | 12 |
| non-measurement -> kept verbatim | 10 |
| quest-upgraded -> kept verbatim | 9 |
| attempt-base-corrected -> kept verbatim | 1 |
| goal-declared -> kept verbatim | 1 |

Sum: 15902

## Finding kinds -> v2 kinds (finding-typed entries that stay findings)

| v1 kind -> v2 kind | count |
| --- | --- |
| null -> evidence | 1765 |
| <none> -> evidence | 915 |
| repro-on-head -> evidence | 218 |
| inherited-rulesout -> ruled-out | 163 |
| live-validation -> evidence | 72 |
| evidence -> evidence | 63 |
| model-evidence -> evidence | 36 |
| observation -> evidence | 27 |
| deterministic-engagement -> evidence | 25 |
| verification -> evidence | 10 |
| decision -> decision | 10 |
| finding -> evidence | 9 |
| independent-verification -> evidence | 8 |
| root-cause -> theory | 7 |
| live-evidence -> evidence | 7 |
| boundary-moved -> altitude-check | 6 |
| scope-pressure -> altitude-check | 6 |
| correction -> decision | 4 |
| design -> altitude-check | 3 |
| owner-contract-verification -> evidence | 3 |
| live-measurement -> evidence | 3 |
| adversarial-review -> evidence | 3 |
| scope-pressure-resolution -> altitude-check | 2 |
| successor-handoff -> altitude-check | 2 |
| live-engagement -> evidence | 2 |
| model-validation -> evidence | 2 |
| model-counterexample -> ruled-out | 2 |
| live-root-cause -> theory | 2 |
| harness-fidelity -> evidence | 2 |
| invalid-attribution-review -> decision | 2 |
| measurement -> evidence | 2 |
| child-closure -> altitude-check | 2 |
| receipt -> evidence | 2 |
| guardrail-closure -> altitude-check | 2 |
| mechanism-map -> theory | 2 |
| system-theory -> theory | 2 |
| candidate -> decision | 1 |
| scope-pressure-baseline -> altitude-check | 1 |
| harness-boundary -> altitude-check | 1 |
| live-boundary -> altitude-check | 1 |
| observability-gap -> evidence | 1 |
| residual-signature -> evidence | 1 |
| moved-boundary -> altitude-check | 1 |
| diagnosis -> theory | 1 |
| focused-probe-caveat -> evidence | 1 |
| guard-override -> decision | 1 |
| live-probe-green -> evidence | 1 |
| model-not-applicable -> ruled-out | 1 |
| closure-fidelity -> altitude-check | 1 |
| rejection-decomposition -> decision | 1 |
| static-analysis -> evidence | 1 |
| research-triangulation -> evidence | 1 |
| deterministic-reproduction -> evidence | 1 |
| changed-live -> evidence | 1 |
| corrected-attribution -> decision | 1 |
| live-distributed -> evidence | 1 |
| model-check -> evidence | 1 |
| deterministic-investigation -> evidence | 1 |
| live-blocker-moved -> evidence | 1 |
| scope-split-landed -> altitude-check | 1 |
| live-falsification-root-cause -> theory | 1 |
| regression-classification -> decision | 1 |
| causal-proof -> theory | 1 |
| architecture -> altitude-check | 1 |
| scope -> altitude-check | 1 |
| verification-evidence -> evidence | 1 |
| live-residual -> evidence | 1 |
| certification -> evidence | 1 |
| zzz -> evidence | 1 |
| out-of-bar -> ruled-out | 1 |
| limitation -> ruled-out | 1 |
| mechanism-verified -> theory | 1 |
| rejection-repair -> decision | 1 |
| verifier-observation -> evidence | 1 |
| inherited -> decision | 1 |
| boundary -> altitude-check | 1 |
| baseline-comparison -> evidence | 1 |
| existing-system-parallel -> evidence | 1 |
| guardrail-baseline -> decision | 1 |
| closure-deep-dive -> altitude-check | 1 |
| post-solve-tightening -> decision | 1 |
| live-sample -> evidence | 1 |
| handoff -> altitude-check | 1 |

Sum: 3438

## Unmapped

(empty)

## Quests

| quest | v1 status | epic | disposition |
| --- | --- | --- | --- |
| active-gate-authoritative-repair-convergence | solved | legacy | solved |
| address-takeover-workflow-v2 | solved | cluster-identity-and-join-fencing | solved |
| address-takeover-workflow | exhausted | cluster-identity-and-join-fencing | exhausted |
| admin-query-participant-failures-surfaced | solved | release-0-2 | solved |
| admin-ws-client-open-timeout | solved | release-0-2 | solved |
| admission-real-size-estimates | solved | rebalancer-operation-safety-audit-remediation | solved |
| aggregate-duplication-analyzer-runtime-consolidation | solved | roadmap-integrity-wave-0 | solved |
| alloy-execution-guardrails-verifier-fix | solved | legacy | solved |
| altitude-reflection-mechanism | solved | architecture-altitude-review | solved |
| assignment-epoch-fencing | solved | rebalancer-operation-safety-audit-remediation | solved |
| autonomy-and-parallel-defaults | solved | legacy | solved |
| behaviour-changing-consumer-convergence | solved | cluster-formation-topology-admission-closure | solved |
| benchmark-capacity-protocol-v2-foundation-closure | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-capacity-protocol-v2-foundation | exhausted | comparative-workload-efficiency-evidence | exhausted |
| benchmark-resource-docker-observation-boundary | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-semantic-parity-v2 | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-semantic-parity | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-statistical-capacity-protocol-durable-observation-base-aligned | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-statistical-capacity-protocol-durable-observation | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-statistical-capacity-protocol | exhausted | comparative-workload-efficiency-evidence | exhausted |
| benchmark-whole-topology-resource-accounting-final | solved | comparative-workload-efficiency-evidence | solved |
| benchmark-whole-topology-resource-accounting | solved | comparative-workload-efficiency-evidence | solved |
| binding-schema-v3-handler-interfaces | solved | code-first-service-compiler | solved |
| blocked-spread-evaluation-event-wake | solved | latent-convergence-blocker-census | solved |
| bootstrap-join-admission-mutation-outcome-consumer | solved | legacy | solved |
| bootstrap-mode-routing-property-repair | solved | golden-capability-gold-plating | solved |
| bounded-parallel-shard-dispatch | solved | legacy | solved |
| call-cell-reduce-coordination-expiry | solved | minimal-deployment-surface | solved |
| call-cell-world-component-abi-spike | solved | legacy | solved |
| callback-axis-accretion-census-v2 | solved | legacy | solved |
| callback-axis-accretion-census | exhausted | legacy | exhausted |
| callback-axis-accretion-token-hardening | solved | legacy | solved |
| canonical-replica-inventory-cutover | solved | owner-boundary-hardening-and-unification | solved |
| cdc-cache-delete-resurrection | solved | legacy | solved |
| cdc-null-sentinel-where-rendering | solved | latent-convergence-blocker-census | solved |
| changeref-own-quest-evidence-bookkeeping | solved | cluster-identity-and-join-fencing | solved |
| ci-red-main-push-recovery-v2 | solved | legacy | solved |
| ci-red-main-push-recovery-v3 | solved | legacy | solved |
| ci-red-main-push-recovery | exhausted | legacy | exhausted |
| cl-planning-memo-invalidation-regression | solved | legacy | solved |
| cli-static-guideline-ratchet-closure-v2 | solved | roadmap-integrity-wave-0 | solved |
| cli-static-guideline-ratchet-closure | exhausted | roadmap-integrity-wave-0 | exhausted |
| cluster-active-probe-resample-after-snapshot-lane | solved | release-0-2 | solved |
| cluster-identity-join-gate | solved | cluster-identity-and-join-fencing | solved |
| cluster-identity-persistence-seam | solved | cluster-identity-and-join-fencing | solved |
| cluster-owned-artifact-payload-store-v2 | solved | legacy | solved |
| cluster-owned-artifact-payload-store | exhausted | legacy | exhausted |
| cognitive-complexity-ratchet-closure | solved | roadmap-integrity-wave-0 | solved |
| cold-node-authority-reacquisition-pressure | solved | topology-convergence-hardening | solved |
| commit-changeref-own-quest-bookkeeping-exclusion | solved | legacy | solved |
| comparative-efficiency-c4-evidence-envelope-authoring | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-change-rate-crossover | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-claim-projection-base-aligned | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-claim-projection | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-evidence-contract | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-measured-cell-admission | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-movielens-grouped-reduce | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-movielens-paired-runtime-adapters-m1-base-reconciliation-v2 | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-movielens-paired-runtime-adapters-m1-base-reconciliation | exhausted | comparative-workload-efficiency-evidence | exhausted |
| comparative-efficiency-movielens-paired-runtime-adapters-verifier-closure | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-movielens-paired-runtime-adapters | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-movielens-public-request-workload | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-negative-controls-claim-disposition | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-negative-controls-intrinsic-hardening | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-negative-controls | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-opportunity-calculator-v2 | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-opportunity-calculator | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-postgresql-comparator-capture-reuse | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-postgresql-comparator-reuse | exhausted | comparative-workload-efficiency-evidence | exhausted |
| comparative-efficiency-program-authoring-validation-fix | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-program-authoring-verifier-fix | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-program-authoring | solved | comparative-workload-efficiency-evidence | solved |
| comparative-efficiency-request-enrichment | solved | comparative-workload-efficiency-evidence | solved |
| complexity-ratchet-closure-wave1-v2 | solved | roadmap-integrity-wave-0 | solved |
| complexity-ratchet-closure-wave1 | exhausted | roadmap-integrity-wave-0 | exhausted |
| configured-split-threshold-policy-precedence | solved | legacy | solved |
| control-plane-mutation-aggregate-guard | solved | legacy | solved |
| control-plane-mutation-apply-classifier | solved | legacy | solved |
| control-plane-mutation-completion-outcome-normalizer | solved | legacy | solved |
| control-plane-mutation-outcome-classifier-core | exhausted | legacy | exhausted |
| control-plane-mutation-replica-config-consumers | solved | legacy | solved |
| control-plane-mutation-result-normalization-owner | exhausted | legacy | exhausted |
| control-plane-readiness-trust-cutover | solved | owner-boundary-hardening-and-unification | solved |
| control-snapshot-heartbeat-lease-freshness | solved | legacy | solved |
| control-snapshot-ready-lease-age-witness | solved | formation-complexity-consolidation | solved |
| coordinator-reconcile-lane-ledger-write-head-of-line | solved | legacy | solved |
| core-system-logic-alloy-adjacency | solved | legacy | solved |
| core-system-logic-model-adjacency | solved | legacy | solved |
| coupled-pair-landing-guard | solved | legacy | solved |
| coupled-pair-proof-cone-input-integrity-closure | exhausted | legacy | exhausted |
| coupled-pair-proof-cone-selection | exhausted | legacy | exhausted |
| coupled-pair-registry-witness-domain-closure | solved | legacy | solved |
| coupled-pair-registry-witness-foundation | exhausted | legacy | exhausted |
| coupled-pair-solver-landing-enforcement | solved | legacy | solved |
| critical-placement-authoritative-evidence | solved | cluster-formation-topology-admission-closure | solved |
| critical-placement-causal-trace | solved | cluster-formation-topology-admission-closure | solved |
| critical-system-placement-distinct-node-invariant-v2 | solved | cluster-formation-topology-admission-closure | solved |
| critical-system-placement-distinct-node-invariant-v3 | solved | cluster-formation-topology-admission-closure | solved |
| critical-system-placement-distinct-node-invariant-v4 | solved | cluster-formation-topology-admission-closure | solved |
| critical-system-placement-distinct-node-invariant | solved | cluster-formation-topology-admission-closure | solved |
| cross-partition-join-pushdown | solved | legacy | solved |
| cure-typing-owner-migration-admission-lanes | solved | self-hosting-circularity-generic-treatment | solved |
| cure-typing-owner-migration-move-minters | solved | self-hosting-circularity-generic-treatment | solved |
| cure-typing-single-owner-table | solved | self-hosting-circularity-generic-treatment | solved |
| current-membership-epoch-null-unreadable | solved | rebalancer-operation-safety-audit-remediation | solved |
| data-local-call-partition-activation-v2 | solved | minimal-deployment-surface | solved |
| data-local-call-partition-activation | exhausted | minimal-deployment-surface | exhausted |
| dead-setthresholds-removal | solved | split-merge-transition-integrity | solved |
| developer-smoke-command-surface | solved | developer-velocity-maintainability-and-product-readiness | solved |
| developer-smoke-proof | solved | developer-velocity-maintainability-and-product-readiness | solved |
| distributed-harness-report-src-fingerprint | solved | release-0-2 | solved |
| distributed-query-straggler-hedging | solved | legacy | solved |
| distributed-select-global-merge-correctness | solved | legacy | solved |
| distroless-fast-local-harness-shell-free | solved | legacy | solved |
| dockerized-pg-client-compatibility-example | solved | legacy | solved |
| documentation-audience-boundary-tooling-final | solved | legacy | solved |
| documentation-audience-boundary-tooling | exhausted | legacy | exhausted |
| documentation-audience-safe-onboarding-final | solved | legacy | solved |
| documentation-audience-safe-onboarding | solved | legacy | solved |
| documentation-current-state-clean-replay | solved | legacy | solved |
| documentation-current-state-contract | exhausted | legacy | exhausted |
| dst-cost-model-fidelity-spike | exhausted | dst-cost-model-circle | exhausted |
| dt-drain-safety-overremoval-hunt | solved | dst-cost-model-circle | solved |
| durable-cluster-identity | exhausted | cluster-identity-and-join-fencing | exhausted |
| durable-provisioning-job-owner | solved | owner-boundary-hardening-and-unification | solved |
| durable-replay-cursor | solved | split-merge-transition-integrity | solved |
| durable-withdrawal-cleanup-intent-v2 | solved | cluster-identity-and-join-fencing | solved |
| durable-withdrawal-cleanup-intent | exhausted | cluster-identity-and-join-fencing | exhausted |
| effective-placement-serial-priority-planner | exhausted | convergence-loop-and-workflow-overhead | exhausted |
| executor-active-services-cache-handoff | exhausted | topology-convergence-hardening | exhausted |
| existing-group-add-topology-guard | solved | rebalancer-operation-safety-audit-remediation | solved |
| external-service-manifest-contract | solved | legacy | solved |
| failed-authoritative-read-admission-invariant | solved | golden-capability-gold-plating | solved |
| failed-replica-removal-transition-tolerance | solved | release-0-2 | solved |
| five-node-gcp-formation-certification-90s | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| flag-debt-retirement | solved | legacy | solved |
| formation-analyzer-retained-uncompleted-teardown | solved | release-0-2 | solved |
| formation-background-release-owner-closure | exhausted | topology-convergence-hardening | exhausted |
| formation-background-release-quiescence-anchor-live | exhausted | topology-convergence-hardening | exhausted |
| formation-barrier-release-snapshot-coherence | solved | latent-convergence-blocker-census | solved |
| formation-barrier-spread-cure-admission-liveness | solved | latent-convergence-blocker-census | solved |
| formation-barrier-spread-cure-final-landing | solved | latent-convergence-blocker-census | solved |
| formation-barrier-spread-cure-liveness | solved | latent-convergence-blocker-census | solved |
| formation-barrier-spread-cure-test-classification | solved | latent-convergence-blocker-census | solved |
| formation-barrier-spread-release-oscillation | solved | latent-convergence-blocker-census | solved |
| formation-control-plane-move-interlock | solved | legacy | solved |
| formation-gcp-runner-bounded-streak | solved | release-0-2 | solved |
| formation-grace-parallel-start-hardening | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| formation-joining-ready-phase-fence-live | solved | topology-convergence-hardening | solved |
| formation-joining-ready-phase-fence | exhausted | topology-convergence-hardening | exhausted |
| formation-ledger-leader-local-persistence-wedge | solved | legacy | solved |
| formation-ledger-over-target-accounting-drain-phase-replace-blind-spot | solved | legacy | solved |
| formation-ledger-over-target-surplus-drain-coupled-removal | exhausted | legacy | exhausted |
| formation-ledger-post-spread-voter-visibility-latency | exhausted | legacy | exhausted |
| formation-ledger-quorum-concentrated-replace-churn-60s | solved | legacy | solved |
| formation-ledger-quorum-spread-first | solved | legacy | solved |
| formation-ledger-recovery-replace-source-specificity-proof | solved | legacy | solved |
| formation-ledger-recovery-replace-source-specificity | exhausted | legacy | exhausted |
| formation-ledger-self-move-blocks-cluster-ops | exhausted | legacy | exhausted |
| formation-ledger-self-spread-services-owner-unavailable | solved | legacy | solved |
| formation-ledger-spread-completion-self-move-interlock-deadlock | solved | legacy | solved |
| formation-ledger-spread-voter-ready-readiness-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| formation-ledger-spread-window-follow-up-latency | solved | legacy | solved |
| formation-liveness-dependency-serial-planner | exhausted | formation-complexity-consolidation | exhausted |
| formation-priority-spread-authoritative-handoff-closure | exhausted | topology-convergence-hardening | exhausted |
| formation-priority-spread-authoritative-publication-closure | exhausted | topology-convergence-hardening | exhausted |
| formation-priority-spread-without-exclusive-self-move-cost | exhausted | topology-convergence-hardening | exhausted |
| formation-promoted-voter-not-voter-ready-routable-60s | exhausted | legacy | exhausted |
| formation-release-handoff-closure-v2 | exhausted | legacy | exhausted |
| formation-release-handoff-closure-v3 | exhausted | legacy | exhausted |
| formation-release-handoff-closure-v4 | solved | legacy | solved |
| formation-release-handoff-closure | exhausted | legacy | exhausted |
| formation-release-handoff-consumer-parity | solved | release-0-2 | solved |
| formation-release-handoff-consumer-read-path | solved | release-0-2 | solved |
| formation-release-handoff-interaction-registry | solved | legacy | solved |
| formation-release-handoff-negative-control-integrity | solved | legacy | solved |
| formation-release-handoff-post-reopen-capture | solved | release-0-2 | solved |
| formation-release-phase-analysis-v2 | solved | release-0-2 | solved |
| formation-release-phase-analysis | exhausted | release-0-2 | exhausted |
| formation-release-priority-observation-owner | exhausted | topology-convergence-hardening | exhausted |
| formation-replace-dispatch-deferred-retry-hold | exhausted | legacy | exhausted |
| formation-reservation-reconcile-premature-orphan-release | solved | legacy | solved |
| formation-runtime-service-create-lane-budget-starvation | solved | legacy | solved |
| formation-schema-operation-collision-leader-read-closure | exhausted | topology-convergence-hardening | exhausted |
| formation-voter-surplus-promotion-deferral-livelock | solved | legacy | solved |
| fresh-join-multi-peer-contact | solved | legacy | solved |
| gcp-affinity-full-log-materialization-v2 | solved | release-0-2 | solved |
| gcp-affinity-full-log-materialization | exhausted | release-0-2 | exhausted |
| gcp-harness-custom-image-provisioning-v2 | solved | legacy | solved |
| gcp-harness-custom-image-provisioning-v3 | solved | legacy | solved |
| gcp-harness-custom-image-provisioning | exhausted | legacy | exhausted |
| github-release-contract-cutover | solved | legacy | solved |
| github-release-metadata-cutover | solved | legacy | solved |
| github-release-workflow-cutover | solved | legacy | solved |
| global-owner-debt-inventory-command-index-projection-refresh | solved | roadmap-integrity-wave-0 | solved |
| global-owner-debt-inventory-migration | solved | developer-velocity-maintainability-and-product-readiness | solved |
| global-owner-debt-inventory-tooling-projection-refresh-wave0 | solved | roadmap-integrity-wave-0 | solved |
| global-owner-debt-inventory | solved | developer-velocity-maintainability-and-product-readiness | solved |
| golden-capability-guard-scenario-gate-wiring | solved | legacy | solved |
| handler-aware-runtime-invocation | solved | code-first-service-compiler | solved |
| harness-runtime-environment-allowlist-v2 | exhausted | convergence-loop-and-workflow-overhead | exhausted |
| harness-runtime-environment-allowlist-v3 | solved | convergence-loop-and-workflow-overhead | solved |
| harness-runtime-environment-allowlist | exhausted | convergence-loop-and-workflow-overhead | exhausted |
| helm-admin-default-deny-cutover | solved | owner-boundary-hardening-and-unification | solved |
| helm-contract-ci-tooling | solved | owner-boundary-hardening-and-unification | solved |
| helm-render-parser-tooling | solved | owner-boundary-hardening-and-unification | solved |
| hlc-cross-leader-monotonicity | solved | legacy | solved |
| hold-engagement-single-owner-table | solved | self-hosting-circularity-generic-treatment | solved |
| http-to-call-composition-proof | solved | legacy | solved |
| impact-graph-proof-cone-owner | solved | developer-velocity-maintainability-and-product-readiness | solved |
| installable-service-artifact-owner | solved | legacy | solved |
| join-retry-patience-selectable | solved | legacy | solved |
| join-retry-resume-lifecycle-finalization | solved | service-data-affinity-placement | solved |
| join-retry-resume-lifecycle-scenario-registration | solved | legacy | solved |
| joiner-services-cache-late-row-convergence | exhausted | release-0-2 | exhausted |
| joiner-services-cache-routing-table-convergence | solved | release-0-2 | solved |
| joiner-waiting-liveness-log | solved | release-0-2 | solved |
| l-write-membership-deferred-seed | exhausted | legacy | exhausted |
| lagrange-server-clean-release-gate | solved | legacy | solved |
| lagrange-server-npm-publish | solved | legacy | solved |
| lagrange-server-npm-release | solved | legacy | solved |
| latency-group-zone-affinity-demo | exhausted | legacy | exhausted |
| leadership-flap-attribution-census | solved | legacy | solved |
| learner-promotion-progress-proof | solved | pilot-readiness-and-public-proof | solved |
| learner-promotion-proof-channel-wake | solved | release-0-2 | solved |
| learner-promotion-proof-channel-witness-determinism | solved | release-0-2 | solved |
| ledger-participant-transaction-zombie-lifecycle | solved | legacy | solved |
| ledger-quorum-spread-hold-cure-drain-admission-v2 | solved | release-0-2 | solved |
| ledger-quorum-spread-hold-cure-drain-admission | exhausted | release-0-2 | exhausted |
| legacy-work-tracker-removal | solved | legacy | solved |
| lifecycle-controller-live-delegates-only-v2 | solved | cluster-identity-and-join-fencing | solved |
| lifecycle-controller-live-delegates-only | exhausted | cluster-identity-and-join-fencing | exhausted |
| listener-port-model-cli-guidance-gap | solved | legacy | solved |
| listener-port-model-config-authority | solved | legacy | solved |
| listener-port-model-doc-helper-alignment | solved | legacy | solved |
| listener-port-model-runtime-consumers | solved | legacy | solved |
| listener-port-model-single-authority | solved | legacy | solved |
| listener-port-model-surface-alignment | solved | legacy | solved |
| llm-steering-authoring-contract-isolated-evidence | solved | legacy | solved |
| llm-steering-authoring-contract | exhausted | legacy | exhausted |
| llm-steering-canon-legacy-report | solved | legacy | solved |
| llm-steering-coherence-audit-repair | solved | legacy | solved |
| llm-steering-complete-rule-surface | solved | legacy | solved |
| llm-steering-operator-orientation-isolated-evidence | solved | legacy | solved |
| llm-steering-operator-orientation | exhausted | legacy | exhausted |
| llm-steering-supervisor-actions-isolated-evidence | solved | legacy | solved |
| llm-steering-supervisor-actions | exhausted | legacy | exhausted |
| llm-steering-verification-handoff | solved | legacy | solved |
| local-leadership-tenure-bound-safety-evidence | solved | legacy | solved |
| lone-seed-formation-admission-livelock-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| managed-partition-merge-live-validation | open | split-merge-transition-integrity | open |
| managed-partition-merge | solved | legacy | solved |
| managed-split-cutover-handoff-closure | open | release-0-2-five-node-convergence | open |
| managed-split-resume-under-write-load | solved | release-0-2 | solved |
| managed-split-shutdown-timer-leak | exhausted | split-merge-transition-integrity | exhausted |
| membership-epoch-null-rehydration | solved | rebalancer-operation-safety-audit-remediation | solved |
| membership-publication-drain-determinism | solved | topology-convergence-hardening | solved |
| memory-soak-enforcement-cutover | solved | release-0-2 | solved |
| memory-soak-process-rss-owner | solved | release-0-2 | solved |
| merge-backfill-batching | solved | split-merge-transition-integrity | solved |
| minimal-deployment-artifact-binding-identity-replacement | solved | minimal-deployment-surface | solved |
| minimal-deployment-artifact-binding-identity | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-artifact-export-contract | solved | minimal-deployment-surface | solved |
| minimal-deployment-binding-v0-declaration | solved | minimal-deployment-surface | solved |
| minimal-deployment-boot-binding-compilation | solved | legacy | solved |
| minimal-deployment-boot-cell-placement-migration | solved | minimal-deployment-surface | solved |
| minimal-deployment-boot-cell-placement | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-call-binding-compilation | solved | legacy | solved |
| minimal-deployment-call-cell-invocation-orchestration-v2 | solved | legacy | solved |
| minimal-deployment-call-cell-invocation-orchestration | solved | legacy | solved |
| minimal-deployment-call-cell-invocation-v2 | solved | legacy | solved |
| minimal-deployment-call-cell-invocation | exhausted | legacy | exhausted |
| minimal-deployment-call-cell-placement | solved | minimal-deployment-surface | solved |
| minimal-deployment-call-cell-production-wiring | solved | legacy | solved |
| minimal-deployment-change-binding-compilation | solved | legacy | solved |
| minimal-deployment-change-cell-placement | solved | legacy | solved |
| minimal-deployment-change-cell-runtime-activation | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-once-binding-compilation | solved | legacy | solved |
| minimal-deployment-once-cell-placement | solved | minimal-deployment-surface | solved |
| minimal-deployment-pushdown-binding-compilation | solved | legacy | solved |
| minimal-deployment-pushdown-cell-placement | solved | minimal-deployment-surface | solved |
| minimal-deployment-request-binding-compilation | solved | legacy | solved |
| minimal-deployment-request-binding-example | solved | legacy | solved |
| minimal-deployment-request-cell-placement | solved | legacy | solved |
| minimal-deployment-request-cell-routing-shutdown-fence | solved | minimal-deployment-surface | solved |
| minimal-deployment-request-cell-routing | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-request-cell-runtime-readiness-migration | solved | minimal-deployment-surface | solved |
| minimal-deployment-request-cell-runtime-readiness | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-runtime-access-policy-cutover | solved | legacy | solved |
| minimal-deployment-runtime-access-policy-live-validation | solved | legacy | solved |
| minimal-deployment-single-version-contract-cutover | solved | legacy | solved |
| minimal-deployment-system-owned-cell-replication-landing | solved | legacy | solved |
| minimal-deployment-system-owned-cell-replication | exhausted | minimal-deployment-surface | exhausted |
| minimal-deployment-time-binding-compilation | solved | legacy | solved |
| minimal-deployment-time-cell-placement | solved | minimal-deployment-surface | solved |
| model-bounded-retry-exit-routing | solved | legacy | solved |
| model-owner-trace-validation | solved | legacy | solved |
| model-owner-transition-recoverable-wake | solved | legacy | solved |
| model-projection-freshness-epoch-fencing | solved | legacy | solved |
| model-readiness-handoff-liveness | solved | legacy | solved |
| model-report-deterministic-output-tail | solved | release-0-2 | solved |
| model-tlc-mode-selection | solved | golden-capability-gold-plating | solved |
| movielens-admin-event-loop-isolation-discriminator | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-admin-snapshot-deadline-propagation | exhausted | service-data-affinity-placement | exhausted |
| movielens-admin-snapshot-retry-deadline-budget | exhausted | service-data-affinity-placement | exhausted |
| movielens-affinity-placement-demo | exhausted | service-data-affinity-placement | exhausted |
| movielens-authoritative-observation-watermark-admin-contract-fixtures | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-authoritative-observation-watermark | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-canonical-leader-publication-retained-wake-integrity-migration | solved | topology-convergence-hardening | solved |
| movielens-colocated-follower-remove-safety | exhausted | service-data-affinity-placement | exhausted |
| movielens-colocated-follower-replacement-source | exhausted | service-data-affinity-placement | exhausted |
| movielens-create-budget-intent-serialization | exhausted | service-data-affinity-placement | exhausted |
| movielens-exact-election-evidence-same-turn-model | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-exact-election-evidence-same-turn-owner | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-formation-alive-peer-keepalive-liveness | exhausted | service-data-affinity-placement | exhausted |
| movielens-incremental-replace-spread-nonregression | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-ledger-completion-continuity-discriminator | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-live-report-timeout | exhausted | legacy | exhausted |
| movielens-local-leader-row-visibility-formal-model | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-local-leader-row-visibility-model | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-local-leader-row-visibility | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-nodes-priority-recovery-adverse-ab-rollback-sealed | solved | self-hosting-circularity-generic-treatment | solved |
| movielens-nodes-priority-recovery-adverse-ab-rollback | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-nodes-priority-recovery-escape | solved | legacy | solved |
| movielens-observation-watermark-churn-consolidation | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-operation-ledger-terminal-hold | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-parallel-reduce-result-chronology | open | service-data-affinity-placement | open |
| movielens-pre-schema-priority-spread-admission-authority-measured | solved | service-data-affinity-placement | solved |
| movielens-pre-schema-priority-spread-admission-authority | exhausted | service-data-affinity-placement | exhausted |
| movielens-pre-schema-quiescence-live | exhausted | service-data-affinity-placement | exhausted |
| movielens-preload-admission-gate-cutover | solved | service-data-affinity-placement | solved |
| movielens-priority-spread-gap-coverage-authority | solved | service-data-affinity-placement | solved |
| movielens-priority-surrogate-single-followup | exhausted | service-data-affinity-placement | exhausted |
| movielens-priority-surrogate-single-owner-arbitration | exhausted | service-data-affinity-placement | exhausted |
| movielens-raft-peer-cohort-pruning-election-liveness | exhausted | topology-convergence-hardening | exhausted |
| movielens-ratings-scoped-split-policy-live | exhausted | service-data-affinity-placement | exhausted |
| movielens-ready-lease-cdc-provenance | solved | formation-complexity-consolidation | solved |
| movielens-ready-lease-chronology-discriminator | solved | formation-complexity-consolidation | solved |
| movielens-ready-lease-maintenance-critical-owner-lane | exhausted | service-data-affinity-placement | exhausted |
| movielens-ready-lease-witness-report-replay | solved | formation-complexity-consolidation | solved |
| movielens-replace-bootstrap-cohort-authority-measured | solved | legacy | solved |
| movielens-replace-bootstrap-cohort-authority | exhausted | legacy | exhausted |
| movielens-stale-only-preflight-repair-scope | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| movielens-three-way-affinity-demo | exhausted | service-data-affinity-placement | exhausted |
| native-call-context-contract-sealing-v2 | solved | legacy | solved |
| native-call-context-contract-sealing | exhausted | legacy | exhausted |
| newcomer-onboarding-friction | open | lagrange-devops-onboarding | open |
| node-incarnation-fencing-v2 | solved | cluster-identity-and-join-fencing | solved |
| node-incarnation-fencing | exhausted | cluster-identity-and-join-fencing | exhausted |
| node-liveness-semantic-projection-owner-bootstrap-readiness-fixture-repair | solved | hysteresis-consolidation | solved |
| node-liveness-semantic-projection-owner-clock-publish-repair | solved | hysteresis-consolidation | solved |
| node-liveness-semantic-projection-owner | solved | hysteresis-consolidation | solved |
| node-shutdown-cell-worker-teardown | solved | split-merge-transition-integrity | solved |
| non-docker-validation-green | exhausted | legacy | exhausted |
| oci-container-driver-live-activation | open | service-portability-ladder | split into 5 child quests |
| oci-receipt-ledger-lock-release-diagnostic | solved | roadmap-integrity-wave-0 | solved |
| oci-runtime-host-contract-final | solved | legacy | solved |
| oci-runtime-host-contract | solved | legacy | solved |
| operation-dispatch-completion-owner-cutover | solved | operation-dispatch-completion-continuity | solved |
| operation-dispatch-completion-owner-tooling | solved | operation-dispatch-completion-continuity | solved |
| operation-ledger-quorum-authoritative-release | exhausted | topology-convergence-hardening | exhausted |
| operation-ledger-self-move-hold-engagement | solved | release-0-2 | solved |
| operation-ledger-self-move-hold-fairness | solved | release-0-2 | solved |
| operation-ledger-self-move-holder-release-on-engagement-v2 | solved | release-0-2 | solved |
| operation-ledger-self-move-holder-release-on-engagement | solved | release-0-2 | solved |
| operation-ledger-self-move-waiter-fairness-v2 | solved | release-0-2 | solved |
| operation-ledger-self-move-waiter-fairness-v3 | solved | release-0-2 | solved |
| operation-ledger-self-move-waiter-fairness | exhausted | release-0-2 | exhausted |
| operation-ownership-lease-fencing | solved | rebalancer-operation-safety-audit-remediation | solved |
| operation-progress-store-persistence | solved | rebalancer-operation-safety-audit-remediation | solved |
| operation-workflow-drain-redrive | solved | topology-convergence-hardening | solved |
| ordinary-placement-ready-lease-candidate-admission | open | topology-convergence-hardening | open |
| outbound-call-access-policy | solved | legacy | solved |
| over-target-cap-spread-cure-wipe | solved | latent-convergence-blocker-census | solved |
| owner-complexity-rebalancer-planning-owner-placement-rebalance-planning-clean-receipt | solved | developer-velocity-maintainability-and-product-readiness | solved |
| owner-complexity-rebalancer-planning-owner-placement-rebalance-planning | exhausted | developer-velocity-maintainability-and-product-readiness | exhausted |
| parallel-evidence-machine-mutex | solved | parallel-session-architecture | solved |
| parallel-session-quest-leases | solved | parallel-session-architecture | solved |
| parallel-session-scope-advisory | solved | parallel-session-architecture | solved |
| partition-callback-read-failure-typed-outcome | solved | latent-convergence-blocker-census | solved |
| partition-class-ladder-bootstrap-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-census-hardening-final | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-census-hardening-parameter-snapshot-final | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-census-hardening-recursive-final | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-census-hardening-rest-exclusion-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-census-hardening-rest-exclusion-final | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-census-proof-final | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-census-proof-integrity-migration | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-census-proof | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-control-plane-evidence-final | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-control-plane-evidence-tooling-final | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-control-plane-evidence-tooling | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-migration-bootstrap | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-control-plane-final | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-control-plane | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-migration-node-create | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-node-runtime-readiness | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-owner-execution | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-partition-domain | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-query-domain | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-raft | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-rebalance-coordinator | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-rebalancer-repository-policy | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-migration-unified-rebalancer | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-node-create-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-node-runtime-readiness-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-owner-contract | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-owner-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-owner-execution-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-owner-implementation-final | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-owner-implementation | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-owner-runtime | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-owner-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-partition-domain-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-query-domain-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-raft-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-rebalance-coordinator-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-rebalancer-repository-policy-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-single-owner-table-integrity-archive-historical | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-single-owner-table-integrity-archive-replacements | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-single-owner-table-integrity-migration | solved | self-hosting-circularity-generic-treatment | solved |
| partition-class-ladder-single-owner-table | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| partition-class-ladder-unified-rebalancer-evidence-tooling | solved | self-hosting-circularity-generic-treatment | solved |
| partition-leader-row-publication-integrity-v2 | solved | pilot-readiness-and-public-proof | solved |
| partition-leader-row-publication-integrity-v3 | solved | pilot-readiness-and-public-proof | solved |
| partition-leader-row-publication-integrity | solved | pilot-readiness-and-public-proof | solved |
| partition-live-leader-address-routing | exhausted | formation-complexity-consolidation | exhausted |
| partition-managed-merge-explicit-state-ratchet | solved | roadmap-integrity-wave-0 | solved |
| pgwire-authentication-cutover | solved | legacy | solved |
| pgwire-tls-policy-cutover | solved | legacy | solved |
| placement-data-affinity-tier1b | solved | service-data-affinity-placement | solved |
| planner-retention-admission-hold-model | solved | golden-capability-gold-plating | solved |
| postpush-worktree-artifact-freshness | exhausted | legacy | exhausted |
| pressure-admission-flagless-cdc-topology-sweep | solved | legacy | solved |
| pressure-admission-flagless-defer-policy | solved | legacy | solved |
| pressure-admission-flagless-node-admin-sweep | solved | legacy | solved |
| pressure-admission-flagless-partition-mg-sweep | solved | legacy | solved |
| pressure-admission-flagless-publication-parking | solved | legacy | solved |
| pressure-admission-flagless-query-logging-sweep | solved | legacy | solved |
| pressure-admission-flagless-rebalancer-brake | solved | legacy | solved |
| priority-partition-census-adapter-authority-closure | exhausted | legacy | exhausted |
| priority-partition-census-artifact-identity-closure | solved | golden-capability-gold-plating | solved |
| priority-partition-census-authority-canonicalization | exhausted | legacy | exhausted |
| priority-partition-census-canonical-record-closure | exhausted | legacy | exhausted |
| priority-partition-census-self-diagnosis | exhausted | legacy | exhausted |
| priority-placement-completed-topology-observation | solved | topology-convergence-hardening | solved |
| priority-placement-snapshot-owner-reconciliation | solved | topology-convergence-hardening | solved |
| priority-recovery-add-dispatch-cadence | solved | release-0-2 | solved |
| priority-recovery-admin-control-plane-admission-publication-single-engaged-authority | solved | owner-boundary-hardening-and-unification | solved |
| priority-recovery-admin-control-plane-build-priority-recovery-admission-by-partition-id-authority | exhausted | owner-boundary-hardening-and-unification | exhausted |
| priority-recovery-admin-dormant-context-retirement | solved | owner-boundary-hardening-and-unification | solved |
| priority-recovery-authoritative-summary-inventory-alignment | solved | legacy | solved |
| priority-recovery-census-diagnostic-pass-through | solved | golden-capability-gold-plating | solved |
| priority-recovery-control-plane-normalize-distinct-string-array-authority | solved | owner-boundary-hardening-and-unification | solved |
| priority-recovery-drain-parked-self-move-progress | solved | release-0-2 | solved |
| priority-recovery-followup-phi-monotonicity | solved | legacy | solved |
| priority-recovery-owner-inventory-projection-refresh | exhausted | roadmap-integrity-wave-0 | exhausted |
| priority-recovery-owner-inventory-tooling-projection-refresh-wave0-final | solved | roadmap-integrity-wave-0 | solved |
| priority-recovery-owner-inventory-tooling-projection-refresh | solved | roadmap-integrity-wave-0 | solved |
| priority-recovery-owner-inventory | solved | owner-boundary-hardening-and-unification | solved |
| priority-recovery-replace-owner-inventory-unavailable | exhausted | legacy | exhausted |
| priority-service-publication-census-model | solved | golden-capability-gold-plating | solved |
| priority-services-row-marker-clear-integrity | solved | legacy | solved |
| priority-spread-cold-boot-dt | solved | golden-capability-gold-plating | solved |
| priority-spread-cure-add-hold-exemption | solved | legacy | solved |
| priority-spread-cure-available-read-guard | solved | legacy | solved |
| priority-spread-cure-guard-ordering-contract | solved | legacy | solved |
| priority-surplus-remove-authoritative-placement-fence | exhausted | convergence-loop-and-workflow-overhead | exhausted |
| project-hardening-proof-integrity-cutover | solved | legacy | solved |
| project-hardening-workflow-proof-integrity | solved | legacy | solved |
| projection-readiness-deep-own-data-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| projection-readiness-evidence-amplification-v3 | solved | legacy | solved |
| projection-readiness-evidence-amplification-v4 | solved | legacy | solved |
| projection-readiness-per-node-generation-granularity-v2 | solved | legacy | solved |
| projection-readiness-per-node-generation-granularity | exhausted | legacy | exhausted |
| projection-readiness-planning-consumption-owner | solved | legacy | solved |
| projection-readiness-producer-copy-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| proof-cone-coverage-content-freshness | solved | developer-velocity-maintainability-and-product-readiness | solved |
| proof-cone-emitted-module-closure-v3 | solved | legacy | solved |
| proof-cone-graph-seal-coverage-integrity | exhausted | legacy | exhausted |
| proof-cone-runnable-consumer-closure | solved | legacy | solved |
| proof-cone-shadow-validation | solved | developer-velocity-maintainability-and-product-readiness | solved |
| proof-cone-transition-authority-rejection-closure-v2 | exhausted | legacy | exhausted |
| proof-cone-transition-authority-rejection-closure | exhausted | legacy | exhausted |
| provisioning-admission-ledger-hold-transient-wait | solved | legacy | solved |
| provisioning-parent-deadline-cutover | solved | owner-boundary-hardening-and-unification | solved |
| public-path-multinode-baseline | open | pilot-readiness-and-public-proof | open |
| publication-readiness-hotpath-starvation-relief | exhausted | control-plane-truth-local-converged-read | exhausted |
| publication-recovery-snapshot-starvation-relief | exhausted | control-plane-truth-local-converged-read | exhausted |
| query-distributed-decision-state-ratchet | solved | roadmap-integrity-wave-0 | solved |
| quest-git-handoff-requirement | solved | legacy | solved |
| quest-model-guidance-theory-use | solved | legacy | solved |
| quest-source-change-subagent-verification | solved | legacy | solved |
| quest-system-continuation-gates | solved | legacy | solved |
| quest-test-proof-cone-shadow-validation | solved | developer-velocity-maintainability-and-product-readiness | solved |
| quest-workflow-signal-quality | solved | legacy | solved |
| quiescence-observation-lane-decoupling | exhausted | legacy | exhausted |
| raft-authoritative-row-mutation-outcome-classifier | solved | legacy | solved |
| raft-candidacy-reluctance-drain-source | solved | legacy | solved |
| raft-churn-sync-section-attribution | solved | control-plane-truth-local-converged-read | solved |
| raft-committed-entry-immutability | solved | owner-boundary-hardening-and-unification | solved |
| raft-committed-prefix-conflict-livelock | solved | latent-convergence-blocker-census | solved |
| raft-follower-append-sqlite-starvation-relief | exhausted | release-0-2 | exhausted |
| raft-snapshot-atomic-install | solved | raft-snapshot-transfer-install | solved |
| raft-snapshot-bulk-transfer | solved | raft-snapshot-transfer-install | solved |
| raft-snapshot-checkpoint-format | solved | raft-snapshot-transfer-install | solved |
| raft-snapshot-compacted-follower-catchup | solved | raft-snapshot-transfer-install | solved |
| raft-snapshot-gated-compaction | solved | owner-boundary-hardening-and-unification | solved |
| raft-snapshot-live-rebuild | solved | raft-snapshot-transfer-install | solved |
| raft-snapshot-retention-compaction | solved | raft-snapshot-transfer-install | solved |
| readiness-evaluation-generation-floor-closure-v2 | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| readiness-formation-liveness-circularity-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| readiness-planning-canonical-identity-verified-owner | solved | release-0-2 | solved |
| readiness-planning-deferral-bounded | solved | release-0-2 | solved |
| readiness-planning-diagnostic-retention-bounds-v2 | solved | release-0-2 | solved |
| readiness-planning-diagnostic-retention-bounds | solved | release-0-2 | solved |
| readiness-planning-generation-granularity-v3 | solved | hysteresis-consolidation | solved |
| readiness-planning-publication-version-key | solved | release-0-2 | solved |
| readiness-planning-read-amplification-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| readiness-planning-snapshot-identity-owner | exhausted | release-0-2 | exhausted |
| readiness-planning-verified-snapshot-identity-owner | solved | release-0-2 | solved |
| readiness-routing-bridge-liveness-veto | solved | hysteresis-consolidation | solved |
| readiness-routing-cache-lag-bridge | solved | hysteresis-consolidation | solved |
| readiness-scale-contract-portfolio-complete | solved | legacy | solved |
| readiness-scale-contract-portfolio-planning | solved | legacy | solved |
| readiness-scale-contract-portfolio-verifier-fix | solved | large-scale-data-plane-certification | solved |
| readiness-scale-portfolio-planning | exhausted | legacy | exhausted |
| rebalancer-own-create-memory-duplicate-replace | solved | legacy | solved |
| release-0-1-0-alpha | solved | legacy | solved |
| release-0-2-five-node-convergence | solved | release-0-2 | solved |
| release-0-2-snapshot-integration | solved | release-0-2 | solved |
| release-0-2-topology-safety | solved | release-0-2 | solved |
| release-0-2-verification-scenario-producer-v2 | solved | release-0-2 | solved |
| release-0-2-verification-scenario-producer | exhausted | release-0-2 | exhausted |
| release-0-2-verification-v2 | open | release-0-2 | superseded by migration |
| release-0-2-verification | exhausted | release-0-2 | exhausted |
| release-process-simplification-v2 | solved | release-process-simplification | solved |
| release-process-simplification | exhausted | release-process-simplification | exhausted |
| remove-relief-falsifier-fence-fidelity-v2 | solved | legacy | solved |
| remove-relief-falsifier-fence-fidelity | solved | legacy | solved |
| remove-safety-universal-floor | solved | rebalancer-operation-safety-audit-remediation | solved |
| removed-replica-cleanup-debt-owner | solved | rebalancer-operation-safety-audit-remediation | solved |
| replica-active-outcome-persistence-deferral | exhausted | legacy | exhausted |
| replica-operation-insert-retry-idempotency | solved | legacy | solved |
| replica-operation-terminal-cas | solved | rebalancer-operation-safety-audit-remediation | solved |
| replica-projection-stale-leader-route-resync | open | topology-convergence-hardening | open |
| replica-retirement-terminal-actuals-coherence | solved | release-0-2 | solved |
| replication-policy-authority-substrate | solved | cluster-formation-topology-admission-closure | solved |
| replication-target-authority-a2-contract-v2 | exhausted | cluster-formation-topology-admission-closure | exhausted |
| replication-target-authority-a2-contract-v3 | solved | cluster-formation-topology-admission-closure | solved |
| replication-target-authority-a2-contract | exhausted | cluster-formation-topology-admission-closure | exhausted |
| replication-target-authority-v2 | exhausted | cluster-formation-topology-admission-closure | exhausted |
| replication-target-authority | solved | cluster-formation-topology-admission-closure | solved |
| repository-stabilization-integrity-migration-v2 | solved | legacy | solved |
| repository-stabilization-integrity-migration | exhausted | legacy | exhausted |
| request-cell-call-bridge | solved | legacy | solved |
| reservation-expiry-operation-aware | solved | rebalancer-operation-safety-audit-remediation | solved |
| reservation-fail-closed-dispatch-gate | solved | rebalancer-operation-safety-audit-remediation | solved |
| reservation-reconcile-query-operation-binding | solved | golden-capability-gold-plating | solved |
| resolver-symlinked-node-modules-probe | exhausted | legacy | exhausted |
| restart-new-ip-name-first-advertising | solved | legacy | solved |
| restart-new-ip-peer-reconnect-unwedge | solved | legacy | solved |
| restore-deterministic-cloud-gate | open | deterministic-cloud-gate | split into 3 child quests |
| roadmap-audience-authority-cutover | solved | legacy | solved |
| rolling-restart-acknowledged-write-durability-visibility | solved | topology-convergence-hardening | solved |
| rolling-restart-core-stability | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-durable-rejoin-formation-barrier | solved | topology-convergence-hardening | solved |
| rolling-restart-fresh-formation-node-authority-deferred-read | solved | topology-convergence-hardening | solved |
| rolling-restart-fresh-formation-terminal-add-observation-v2 | solved | topology-convergence-hardening | solved |
| rolling-restart-fresh-formation-terminal-add-observation | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-handoff-witness-canonical-projection | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-handoff-witness-projection-v2 | solved | topology-convergence-hardening | solved |
| rolling-restart-handoff-witness-projection | solved | topology-convergence-hardening | solved |
| rolling-restart-handoff-witness-trap-free-projection | solved | topology-convergence-hardening | solved |
| rolling-restart-infrastructure-join-progress-witness | solved | topology-convergence-hardening | solved |
| rolling-restart-leadership-churn-attribution | solved | topology-convergence-hardening | solved |
| rolling-restart-lifecycle-owner-rebind-recurrence | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-lifecycle-owner-rebind-scenario-registration | solved | topology-convergence-hardening | solved |
| rolling-restart-liveness-downstream-witness | solved | rolling-restart-liveness-observatory | solved |
| rolling-restart-liveness-emulation | solved | rolling-restart-liveness-observatory | solved |
| rolling-restart-liveness-epic-graduation | solved | rolling-restart-liveness-observatory | solved |
| rolling-restart-liveness-log-replay | solved | rolling-restart-liveness-observatory | solved |
| rolling-restart-logging-vs-publication-queue-discriminator | solved | topology-convergence-hardening | solved |
| rolling-restart-outer-reattempt-owner-membership-restoration | solved | topology-convergence-hardening | solved |
| rolling-restart-pre-handoff-recovery-discriminator | solved | topology-convergence-hardening | solved |
| rolling-restart-representative-certification | open | rolling-restart-certification | open |
| rolling-restart-run4-admin-query-backpressure | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-control-plane-publications-failed-operation-mask | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-critical-spread | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-drain-residual | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-join-runtime-activation-integrity-migration | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-join-runtime-activation-workflow-integrity-migration | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-join-runtime-activation | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-leadership-quiescence-signature | solved | convergence-timeout-leadership-settle | solved |
| rolling-restart-run4-liveness-residual-agreement | solved | rolling-restart-liveness-observatory | solved |
| rolling-restart-run4-load-admission-backpressure | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-load-lane-admin-emission | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-load-lane-owner-reproducer | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-mixed-priority-context-selection | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-observer-staleness | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-operation-drain-owner-progress-token | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-operation-drain | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-passfail-discriminator-census | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-postrebalance-diagnostics-routing | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-postrebalance-drain-run15 | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-postrebalance-trim-drain | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-publication-visibility-run2 | exhausted | topology-convergence-hardening | exhausted |
| rolling-restart-run4-readiness-analyzer-normalization | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-readiness-support-evidence | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-stat-gate-classifier | solved | topology-convergence-hardening | solved |
| rolling-restart-run4-target-sync-reentry | solved | topology-convergence-hardening | solved |
| rolling-restart-startup-recovery-regression-matrix | solved | legacy | solved |
| rolling-restart-w1-priority-establishment-write-unwedge | exhausted | control-plane-write-wedge-leader-local-establishment | exhausted |
| routed-mutation-silent-ledger-write-loss | exhausted | legacy | exhausted |
| runtime-replica-state-projection-retained-reconcile-integrity-reseal | exhausted | topology-convergence-hardening | exhausted |
| runtime-replica-state-projection-retained-reconcile | exhausted | topology-convergence-hardening | exhausted |
| runtime-replica-state-projection | solved | service-data-affinity-placement | solved |
| runtime-service-active-outcome-remote-owner-handoff | exhausted | topology-convergence-hardening | exhausted |
| runtime-service-add-creating-owner-rearm | exhausted | topology-convergence-hardening | exhausted |
| runtime-service-affinity-observer-intent-parity | open | topology-convergence-hardening | open |
| runtime-service-affinity-policy-lift | solved | service-data-affinity-placement | solved |
| runtime-service-affinity-suboptimality-observer | solved | service-data-affinity-placement | solved |
| runtime-service-creating-owner-wake-progress-admission | solved | topology-convergence-hardening | solved |
| runtime-service-handler-executor-outcome-late-binding | exhausted | topology-convergence-hardening | exhausted |
| runtime-service-handoff-budget-rearm-reentry | exhausted | topology-convergence-hardening | exhausted |
| runtime-service-replace-canonical-target-handoff-integrity-reseal | solved | service-data-affinity-placement | solved |
| runtime-service-replace-canonical-target-handoff | exhausted | service-data-affinity-placement | exhausted |
| scale-certification-evidence-contract | solved | large-scale-data-plane-certification | solved |
| scale-certification-receipt-freshness-authoring | solved | large-scale-data-plane-certification | solved |
| scale-certification-receipt-freshness-integrity-hardening | solved | comparative-workload-efficiency-evidence | solved |
| scale-certification-receipt-freshness | solved | large-scale-data-plane-certification | solved |
| schema-admission-canonical-drain-handoff | exhausted | topology-convergence-hardening | exhausted |
| schema-provisioning-collision-retry-closure | exhausted | publication-readiness-churn-liveness-closure | exhausted |
| schema-provisioning-inline-execute-owner-redrive | exhausted | topology-convergence-hardening | exhausted |
| schema-provisioning-not-null-intent-recovery-roundtrip | exhausted | service-data-affinity-placement | exhausted |
| seed-join-gate-authoritative-refresh-v2 | solved | legacy | solved |
| seed-join-gate-authoritative-refresh | exhausted | legacy | exhausted |
| seed-restart-recovery-mode-v2 | solved | cluster-identity-and-join-fencing | solved |
| seed-restart-recovery-mode | exhausted | cluster-identity-and-join-fencing | exhausted |
| selective-quest-landing-cutover | solved | developer-velocity-maintainability-and-product-readiness | solved |
| service-affinity-demo-report-evidence | solved | service-data-affinity-placement | solved |
| service-affinity-identity-wiring | solved | service-data-affinity-placement | solved |
| service-affinity-query-attribution-wiring | solved | service-data-affinity-placement | solved |
| service-cell-combined-wit-world | solved | legacy | solved |
| service-cell-v2-generic-dispatch-world | solved | code-first-service-compiler | solved |
| service-cli-generate-build-deploy | solved | code-first-service-compiler | solved |
| service-cli-package-bin | solved | legacy | solved |
| service-cli-pg-runtime-dependency-v2 | solved | legacy | solved |
| service-cli-pg-runtime-dependency | solved | legacy | solved |
| service-compiler-account-summary-parity | solved | code-first-service-compiler | solved |
| service-compiler-componentize-module-shape-spike | solved | code-first-service-compiler | solved |
| service-compiler-deployment-record-generation | solved | code-first-service-compiler | solved |
| service-compiler-editor-typings | solved | code-first-service-compiler | solved |
| service-compiler-source-contract-ir | solved | code-first-service-compiler | solved |
| service-control-transport-decision | solved | legacy | solved |
| service-data-affinity-parallel-reduce-demo-live | exhausted | service-data-affinity-placement | exhausted |
| service-data-affinity-parallel-reduce-demo | exhausted | service-data-affinity-placement | exhausted |
| service-init-cli-scaffold-contract-repair | solved | golden-capability-gold-plating | solved |
| service-init-scaffold | solved | legacy | solved |
| service-init-wasm-first-scaffold | solved | code-first-service-compiler | solved |
| service-install-catalog-owner-concurrency-closure | solved | legacy | solved |
| service-install-catalog-owner | exhausted | legacy | exhausted |
| service-install-lifecycle-cli-final | solved | legacy | solved |
| service-install-lifecycle-cli | solved | legacy | solved |
| service-installation-reconciler | solved | legacy | solved |
| service-lifecycle-authoritative-sql-handoff | solved | legacy | solved |
| service-lifecycle-command-catalog-composition | solved | legacy | solved |
| service-lifecycle-pgwire-executor-handoff | solved | legacy | solved |
| service-lifecycle-pgwire-sql-transport | solved | legacy | solved |
| service-lifecycle-sql-control-surface | solved | legacy | solved |
| service-local-oci-layout | solved | legacy | solved |
| service-parallel-reduce-runtime-protocol | solved | service-data-affinity-placement | solved |
| service-partition-access-attribution | solved | service-data-affinity-placement | solved |
| service-pipeline-binding-digest-build-restamp-v2 | solved | legacy | solved |
| service-pipeline-binding-digest-build-restamp | exhausted | legacy | exhausted |
| service-portability-claims-contract | solved | legacy | solved |
| service-portability-claims-example-fixture-alignment | solved | legacy | solved |
| service-portability-claims-surface-final | solved | legacy | solved |
| service-portability-claims-surface-v2 | solved | legacy | solved |
| service-portability-claims-surface | exhausted | legacy | exhausted |
| service-read-locality-policy | solved | service-data-affinity-placement | solved |
| service-static-ratchet-no-headroom | solved | roadmap-integrity-wave-0 | solved |
| single-readiness-owner | solved | legacy | solved |
| snapshot-lane-deadline-bounded-oracle-blind | solved | release-0-2 | solved |
| solve-v2-phase-0-inventory | solved | solve-v2 | solved |
| solve-v2-phase-0 | solved | solve-v2 | solved |
| solve-v2-phase-1-weight | solved | solve-v2 | solved |
| solve-v2-phase-1 | exhausted | solve-v2 | exhausted |
| solve-v2-phase-2 | open | solve-v2 | open |
| solver-acceptance-proof-manifest | solved | owner-boundary-hardening-and-unification | solved |
| solver-attempt-base-pending-step-pin | solved | legacy | solved |
| solver-candidate-rejection-base-correction | solved | legacy | solved |
| solver-capture-foreign-evidence-exclusion | solved | legacy | solved |
| solver-deletion-safe-handoff-recovery | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-handoff-oracle-artifact-ownership | solved | roadmap-integrity-wave-0 | solved |
| solver-historical-artifact-batch-001 | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-artifact-batch-tooling | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-artifact-census-migration | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-artifact-census | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-artifact-migration-v2-migration | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-artifact-migration-v2 | solved | developer-velocity-maintainability-and-product-readiness | solved |
| solver-historical-oracle-content-archive | solved | roadmap-integrity-wave-0 | solved |
| solver-land-generated-output-coverage | solved | legacy | solved |
| solver-land-recorded-attempt-union-guard | solved | legacy | solved |
| solver-landing-git-buffer-bounds | solved | legacy | solved |
| solver-landing-preflight-deleted-path-filter-v2 | solved | legacy | solved |
| solver-landing-preflight-deleted-path-filter | exhausted | legacy | exhausted |
| solver-landing-review-envelope-v2 | solved | legacy | solved |
| solver-landing-review-envelope-v3 | exhausted | legacy | exhausted |
| solver-landing-review-envelope-v4 | exhausted | legacy | exhausted |
| solver-landing-review-envelope-v5 | solved | legacy | solved |
| solver-landing-review-envelope-v6 | exhausted | legacy | exhausted |
| solver-landing-review-envelope-v7 | solved | legacy | solved |
| solver-landing-review-envelope | solved | legacy | solved |
| solver-ledger-consistency-log-projection | solved | roadmap-integrity-wave-0 | solved |
| solver-low-ceremony-correction-loop | exhausted | legacy | exhausted |
| solver-low-ceremony-intrinsic-closure | solved | legacy | solved |
| solver-measurement-only-attempt | solved | parallel-session-architecture | solved |
| solver-next-checkpoint-projection-closure | solved | legacy | solved |
| solver-operator-park-terminal-evidence-identity | solved | roadmap-integrity-wave-0 | solved |
| solver-operator-safety-facade | solved | convergence-loop-and-workflow-overhead | solved |
| solver-operator-workflow-land-regressions-v2 | solved | golden-capability-gold-plating | solved |
| solver-operator-workflow-land-regressions | exhausted | golden-capability-gold-plating | exhausted |
| solver-package-lock-verification-scope | solved | legacy | solved |
| solver-portfolio-projected-terminal-state | solved | roadmap-integrity-wave-0 | solved |
| solver-proof-artifact-census | solved | owner-boundary-hardening-and-unification | solved |
| solver-proof-artifact-content-addressing | solved | owner-boundary-hardening-and-unification | solved |
| solver-rejection-repair-amendment-path | solved | cluster-formation-topology-admission-closure | solved |
| solver-scope-classification-epic-citation | solved | legacy | solved |
| solver-scope-classifier-artifact-token-isolation | solved | roadmap-integrity-wave-0 | solved |
| solver-scope-pressure-precommit-enforcement | solved | owner-boundary-hardening-and-unification | solved |
| solver-snapshot-scope-accounting | solved | legacy | solved |
| solver-source-epoch-three-verb-workflow | solved | legacy | solved |
| solver-static-guideline-ratchet-closure | solved | roadmap-integrity-wave-0 | solved |
| solver-streamlining-2026-09 | solved | solver-streamlining-spec | solved |
| solver-terminal-integrity-cutover-exhaustion-fix | solved | owner-boundary-hardening-and-unification | solved |
| solver-terminal-integrity-cutover-fail-closed-fix | solved | owner-boundary-hardening-and-unification | solved |
| solver-terminal-integrity-cutover-verifier-fix | solved | owner-boundary-hardening-and-unification | solved |
| solver-terminal-integrity-cutover | solved | owner-boundary-hardening-and-unification | solved |
| solver-terminal-integrity-red-test-bootstrap-verifier-fix | solved | owner-boundary-hardening-and-unification | solved |
| solver-terminal-integrity-red-test-bootstrap | solved | owner-boundary-hardening-and-unification | solved |
| solver-unreachable-base-attempt-termination-v2 | solved | dead-base-attempt-disposition | solved |
| solver-unreachable-base-attempt-termination | solved | dead-base-attempt-disposition | solved |
| solver-verifier-readiness-preflight | solved | legacy | solved |
| solver-verifier-rejection-supersession-core | solved | legacy | solved |
| solver-verifier-rejection-supersession-steering | solved | legacy | solved |
| solver-verifier-rejection-supersession | exhausted | legacy | exhausted |
| solver-workflow-candidate-verification-cutover | solved | convergence-loop-and-workflow-overhead | solved |
| solver-workflow-draft-receipt-signal-quality | solved | legacy | solved |
| solver-workflow-epic-routing-cutover | solved | convergence-loop-and-workflow-overhead | solved |
| solver-workflow-operator-facade-cutover | solved | legacy | solved |
| solver-workflow-projection-retention-cutover | solved | convergence-loop-and-workflow-overhead | solved |
| split-abort-fence-parity | solved | split-merge-transition-integrity | solved |
| split-dissolution-durable-proof | solved | split-merge-transition-integrity | solved |
| split-key-comparator-typing | solved | split-merge-transition-integrity | solved |
| split-merge-overlap-guard | solved | split-merge-transition-integrity | solved |
| split-snapshot-transfer-pacing | solved | legacy | solved |
| split-terminal-lifecycle | solved | split-merge-transition-integrity | solved |
| spread-cure-at-target-minting-gap | solved | legacy | solved |
| spread-cure-union-escape-and-monotone-gate | solved | legacy | solved |
| spread-fence-proven-local-leadership-read | solved | control-plane-truth-local-converged-read | solved |
| sql-statement-parser-coverage | solved | legacy | solved |
| stale-replica-file-startup-reconciliation-v2 | solved | cluster-identity-and-join-fencing | solved |
| stale-replica-file-startup-reconciliation | exhausted | cluster-identity-and-join-fencing | exhausted |
| standing-invariant-coverage-worklist | solved | legacy | solved |
| startup-evidence-single-identity-decision-v2-integrity-migration | solved | cluster-identity-and-join-fencing | solved |
| startup-evidence-single-identity-decision-v2 | solved | cluster-identity-and-join-fencing | solved |
| startup-evidence-single-identity-decision | exhausted | cluster-identity-and-join-fencing | exhausted |
| static-ratchet-recovery-clean-head-v2 | solved | legacy | solved |
| static-ratchet-recovery-clean-head | exhausted | legacy | exhausted |
| steering-doc-clarity | solved | steering-doc-clarity | solved |
| step-coverage-owner-migration-dispatch-family | solved | self-hosting-circularity-generic-treatment | solved |
| step-coverage-owner-migration-recovery-lanes | solved | self-hosting-circularity-generic-treatment | solved |
| step-coverage-single-owner-table | solved | self-hosting-circularity-generic-treatment | solved |
| subsystem-classification-tooling | exhausted | modular-test-proof-hierarchy | exhausted |
| terminal-create-runtime-lifecycle-fence-v2 | solved | release-0-2 | solved |
| terminal-create-runtime-lifecycle-fence | exhausted | release-0-2 | exhausted |
| terminal-write-refusal-retry-ownership | solved | latent-convergence-blocker-census | solved |
| test-harness-improvement-batch | solved | legacy | solved |
| test-primary-classification-manifest | solved | developer-velocity-maintainability-and-product-readiness | solved |
| test-receipt-probe-tooling | solved | cluster-identity-and-join-fencing | solved |
| test-subsystem-classification-tooling | solved | modular-test-proof-hierarchy | solved |
| test-subsystem-classification | exhausted | modular-test-proof-hierarchy | exhausted |
| three-node-rebalance-lane-fit | solved | release-0-2 | solved |
| tooling-static-cure-hold-ratchet | solved | roadmap-integrity-wave-0 | solved |
| tooling-static-partition-analyzer-ratchet | solved | roadmap-integrity-wave-0 | solved |
| tooling-static-partition-contract-ratchet-v2 | solved | roadmap-integrity-wave-0 | solved |
| tooling-static-steering-scenario-ratchet | solved | roadmap-integrity-wave-0 | solved |
| tooling-static-step-voter-ratchet | solved | roadmap-integrity-wave-0 | solved |
| transaction-owned-commit-mode-cutover | solved | owner-boundary-hardening-and-unification | solved |
| transaction-recovery-poison-row-final-sql-handoff-current-hash-closure-v2 | solved | topology-convergence-hardening | solved |
| transaction-recovery-poison-row-final-sql-handoff-current-hash-closure | exhausted | topology-convergence-hardening | exhausted |
| transaction-recovery-poison-row-final-sql-handoff-live-ab | exhausted | topology-convergence-hardening | exhausted |
| transaction-recovery-poison-row-invariant | solved | topology-convergence-hardening | solved |
| transaction-recovery-poison-row-live-owner-engagement-v2 | exhausted | topology-convergence-hardening | exhausted |
| transaction-recovery-poison-row-live-owner-engagement | exhausted | topology-convergence-hardening | exhausted |
| transaction-recovery-poison-row-live-summary-attribution | exhausted | legacy | exhausted |
| transition-mutation-budget-doom-loop | solved | legacy | solved |
| unused-export-static-ratchet-no-headroom | solved | roadmap-integrity-wave-0 | solved |
| user-partition-remote-executor-outcome-owner-wakeup | solved | service-data-affinity-placement | solved |
| user-table-leader-handoff-demotion-pairing-v2 | solved | pilot-readiness-and-public-proof | solved |
| user-table-leader-handoff-demotion-pairing | solved | pilot-readiness-and-public-proof | solved |
| user-table-leader-placement-spread-v2 | solved | pilot-readiness-and-public-proof | solved |
| user-table-leader-placement-spread | exhausted | pilot-readiness-and-public-proof | exhausted |
| voter-readiness-owner-critical-partition-set-home | solved | self-hosting-circularity-generic-treatment | solved |
| voter-readiness-owner-migration-partition-raft-aliases | solved | self-hosting-circularity-generic-treatment | solved |
| voter-readiness-owner-migration-raft-node-admin | solved | self-hosting-circularity-generic-treatment | solved |
| voter-readiness-owner-migration-rebalancer-batch2 | solved | self-hosting-circularity-generic-treatment | solved |
| voter-readiness-owner-migration-rebalancer-control-plane | exhausted | self-hosting-circularity-generic-treatment | exhausted |
| voter-readiness-visibility-single-owner-table | solved | self-hosting-circularity-generic-treatment | solved |
| workflow-fencing-wiring | solved | split-merge-transition-integrity | solved |
| workflow-linking-and-memory-loop | solved | legacy | solved |
| write-path-epoch-fencing | solved | split-merge-transition-integrity | solved |
| write-path-internal-pacing | solved | legacy | solved |
| write-routing-repair-under-control-plane-moves | solved | legacy | solved |
| durable-cluster-identity-v2 | open | legacy | orphan log, superseded |
| invariant-failed-authoritative-read-admission-verdict | open | legacy | orphan log, superseded |
| invariant-published-node-transport-alive-trough-retention | open | legacy | orphan log, superseded |
| invariant-raft-election-restriction-empty-log-last-term-zero | open | legacy | orphan log, superseded |
| invariant-raft-election-safety-one-vote-per-term | open | legacy | orphan log, superseded |
| invariant-raft-log-matching-committed-entry-identity | open | legacy | orphan log, superseded |
| invariant-rebalancer-surplus-drain-handoff-terminalizes | open | legacy | orphan log, superseded |
| invariant-replica-voter-ready-visible-to-remove-safety-gate | open | legacy | orphan log, superseded |
| invariant-seed-planning-projection-memo-engaged | open | legacy | orphan log, superseded |
| invariant-seed-planning-snapshot-merge-memo-engaged | open | legacy | orphan log, superseded |
| rolling-restart | open | legacy | orphan log, superseded |

## Drafts (no log)

| draft | disposition |
| --- | --- |
| affinity-evidence-normalization | deleted (undeclared draft, no roadmap row) |
| affinity-leader-crediting-parity | deleted (undeclared draft, no roadmap row) |
| amendment-frontier-metric-projection | deleted (undeclared draft, no roadmap row) |
| artifact-payload-garbage-collection | deleted (undeclared draft, no roadmap row) |
| artifact-payload-migration-tooling | deleted (undeclared draft, no roadmap row) |
| call-binding-caller-idempotency-key | deleted (undeclared draft, no roadmap row) |
| call-bounded-structured-partials | deleted (undeclared draft, no roadmap row) |
| call-cell-reduce-coordination-integrity | deleted (undeclared draft, no roadmap row) |
| call-cell-wit-authoring-artifact | deleted (undeclared draft, no roadmap row) |
| call-coordination-linear-cost | deleted (undeclared draft, no roadmap row) |
| call-partial-overflow-fail-closed | deleted (undeclared draft, no roadmap row) |
| call-partial-validity-slot-generations | deleted (undeclared draft, no roadmap row) |
| call-selector-typed-parameter-narrowing | deleted (undeclared draft, no roadmap row) |
| call-shard-paged-execution | deleted (undeclared draft, no roadmap row) |
| cell-invocation-backpressure | deleted (undeclared draft, no roadmap row) |
| comparative-efficiency-movielens-measured-p0-campaign | deleted (undeclared draft, no roadmap row) |
| data-local-call-partition-activation-v3 | deleted (undeclared draft, no roadmap row) |
| default-replica-count-one-join-wedge | deleted (undeclared draft, no roadmap row) |
| formation-readiness-stale-heartbeat-transport-veto | deleted (undeclared draft, no roadmap row) |
| harness-intrinsic-primitives-shared-owner | deleted (undeclared draft, no roadmap row) |
| invocation-journal-owner-recovery | deleted (undeclared draft, no roadmap row) |
| invocation-result-retention-owner | deleted (undeclared draft, no roadmap row) |
| lagrange-devops-onboarding | one line in epic lagrange-devops-onboarding |
| latent-runner-red-static-closure | deleted (undeclared draft, no roadmap row) |
| node-transport-authenticated-encryption | deleted (undeclared draft, no roadmap row) |
| partition-leader-role-publication-visibility | deleted (undeclared draft, no roadmap row) |
| per-table-cache-version-consolidation | deleted (undeclared draft, no roadmap row) |
| pilot-cutover-and-rollback-receipts | deleted (undeclared draft, no roadmap row) |
| postgres-compatibility-certification-matrix | deleted (undeclared draft, no roadmap row) |
| public-path-scale-and-failure-certification | deleted (undeclared draft, no roadmap row) |
| publication-readiness-churn-liveness-closure | one line in epic publication-readiness-churn-liveness-closure |
| query-widening-hosted-assertion-flake | deleted (undeclared draft, no roadmap row) |
| raft-commit-shutdown-unhandled-rejection | deleted (undeclared draft, no roadmap row) |
| raft-logic-worker-terminate-segv | deleted (undeclared draft, no roadmap row) |
| read-authority-structural-threading | deleted (undeclared draft, no roadmap row) |
| resumable-bulk-data-load | deleted (undeclared draft, no roadmap row) |
| runtime-memory-admission-reservation | deleted (undeclared draft, no roadmap row) |
| runtime-owner-reconcile-alignment | deleted (undeclared draft, no roadmap row) |
| service-cell-v2-default-multi-operation | deleted (undeclared draft, no roadmap row) |
| service-plane-replication-authority-inventory | one line in epic cluster-formation-topology-admission-closure |
| solver-scope-exemption-mandatory-replacement-superset | deleted (undeclared draft, no roadmap row) |
| supported-upgrade-and-recovery-envelope | deleted (undeclared draft, no roadmap row) |
| unwired-event-adjudication | deleted (undeclared draft, no roadmap row) |
| wasm-signature-policy-required-default | deleted (undeclared draft, no roadmap row) |

## Epics

| epic | v2 status |
| --- | --- |
| architecture-altitude-review | open |
| callback-axis-retirement | superseded |
| cell-execution-ownership-vs-replica-topology | superseded |
| ci-vm-admission-baseline | superseded |
| cluster-formation-topology-admission-closure | superseded |
| cluster-identity-and-join-fencing | superseded |
| code-first-service-compiler | superseded |
| comparative-workload-efficiency-evidence | superseded |
| continuous-ai-workflow-landscape | done |
| control-plane-truth-local-converged-read | open |
| control-plane-write-wedge-leader-local-establishment | done |
| convergence-loop-and-workflow-overhead | open |
| convergence-timeout-leadership-settle | done |
| core-logic-live-validation | open |
| dead-base-attempt-disposition | superseded |
| deterministic-cloud-gate | open |
| developer-velocity-maintainability-and-product-readiness | open |
| dst-cost-model-circle | done |
| formation-complexity-consolidation | open |
| generic-live-query-data-plane | superseded |
| golden-capability-gold-plating | done |
| hardware-relative-convergence-budget | done |
| hysteresis-consolidation | open |
| lagrange-aware-callback-shared-context | open |
| lagrange-devops-onboarding | open |
| large-scale-data-plane-certification | superseded |
| latent-convergence-blocker-census | done |
| legacy | done |
| membership-single-owner-cutover | done |
| minimal-deployment-surface | superseded |
| modular-test-proof-hierarchy | superseded |
| native-call-context-wit-contract | superseded |
| operation-dispatch-completion-continuity | done |
| owner-boundary-hardening-and-unification | open |
| parallel-session-architecture | superseded |
| pilot-readiness-and-public-proof | open |
| publication-readiness-churn-liveness-closure | open |
| query-access-path-ladder | superseded |
| quest-standing-invariants | done |
| raft-snapshot-transfer-install | superseded |
| rebalancer-operation-safety-audit-remediation | superseded |
| release-0-2 | superseded |
| release-0-2-five-node-convergence | open |
| release-process-simplification | open |
| request-invocation-partitioning | superseded |
| roadmap-integrity-wave-0 | open |
| rolling-restart-certification | open |
| rolling-restart-liveness-observatory | done |
| self-hosting-circularity-generic-treatment | done |
| service-data-affinity-placement | open |
| service-portability-ladder | open |
| services-doc-tightening | superseded |
| slow-rejoiner-progress-or-evict | done |
| solve-spike-worktree-affordance | superseded |
| solve-v2 | open |
| solver-streamlining-spec | open |
| split-merge-transition-integrity | open |
| spread-satisfied-in-flight-staleness-unmask | done |
| steering-doc-clarity | done |
| strategy-gate-and-altitude-teeth | open |
| topology-convergence-hardening | open |

## Archive

3003 files bundled into solve-v1-archive.tar.gz (manifest solve-v1-archive.manifest.json); referenced by evidence findings in the quests they belonged to.

## Notes

- formation-ledger-post-spread-voter-visibility-latency: v1 constraints kept under legacy.constraints (not {id, statement})
- formation-ledger-spread-completion-self-move-interlock-deadlock: v1 constraints kept under legacy.constraints (not {id, statement})
- formation-ledger-spread-window-follow-up-latency: v1 constraints kept under legacy.constraints (not {id, statement})
- provisioning-admission-ledger-hold-transient-wait: v1 constraints kept under legacy.constraints (not {id, statement})
- theory ledger: 55 entries; 1 attached to cited quests, 54 in theory-ledger
- open quests: 10 epics carry open work
