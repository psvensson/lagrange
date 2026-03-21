# Node Boot/Join/Rebalance Closure Matrix

This artifact closes Requirements `1..9` for the maintainability refactor.
A requirement is closed only when linked tasks are complete and implementation
plus validation evidence exists on the production path.

## Verification Summary

- Task 33 targeted seam verification completed before broad regression.
- Task 34 broad verification completed with the repository's staged full
  non-harness regression workflow on `2026-03-21`.
- Broad regression evidence: `.tmp/nonharness-full-20260321-083131.log`
  plus recorded shard summary (`fast 24839/24839`, `test:integration:1/2/3`
  pass, `test:bootstrap:1` pass, `test:bootstrap:2 1355/1355`).

## Requirement Closure

| Requirement | Design | Completed Tasks | Implementation Evidence | Validation Evidence |
| --- | --- | --- | --- | --- |
| R1 Thin Bootstrap And Join Orchestrators | D2, D10, D11 | 1, 9, 10, 11, 12, 33 | `src/bootstrap/bootstrap-service.js`<br>`src/bootstrap/node-joining-service.js`<br>`src/bootstrap/bootstrap-api.js` | `test/bootstrap/phase-event-ordering-characterization.test.js`<br>`test/bootstrap/seed-delegate-bundles.test.js`<br>`test/bootstrap/join-delegate-bundles.test.js` |
| R2 Single Cleanup Ownership Path | D3, D10, D11 | 5, 13, 14, 15, 33 | `src/bootstrap/phases/seed-cleanup-handler.js`<br>`src/bootstrap/join-cleanup-handler.js`<br>`src/bootstrap/bootstrap-service.js` | `test/bootstrap/cleanup-ownership-order-characterization.test.js`<br>`test/bootstrap/bootstrap-cleanup.property.test.js`<br>`test/bootstrap/join-cleanup.property.test.js` |
| R3 Named Join Phase Segments | D4, D10, D12 | 2, 3, 16, 17, 18, 33 | `src/bootstrap/pipeline/join-startup-plan.js`<br>`src/bootstrap/node-joining-service.js` | `test/bootstrap/pipeline/join-startup-plan-segment-contract.test.js`<br>`test/bootstrap/join-checkpoint-progression-characterization.test.js` |
| R4 Lifecycle Sub-Phase Parity Between Seed And Join | D5, D11 | 1, 4, 19, 20, 33 | `src/bootstrap/node-joining-service.js`<br>`src/bootstrap/bootstrap-service.js` | `test/bootstrap/join-lifecycle-sub-phase-parity-characterization.test.js`<br>`test/bootstrap/lifecycle-unification.test.js`<br>`test/bootstrap/phase-event-ordering-characterization.test.js` |
| R5 Canonical Readiness Policy For Rebalancing Decisions | D6, D11 | 6, 21, 22, 33 | `src/node/node-readiness-policy.js`<br>`src/rebalancer/unified-rebalancer.js`<br>`src/rebalancer/rebalance-coordinator.js` | `test/rebalancer/readiness-policy-equivalence-characterization.test.js`<br>`test/rebalancer/coordinator-shared-readiness-policy.test.js`<br>`test/control-plane/shared-node-readiness-policy.test.js` |
| R6 RebalanceCoordinator Concern Decomposition | D7, D10, D11 | 25, 26, 27, 28, 33 | `src/rebalancer/replica-operation-repository.js`<br>`src/rebalancer/operation-workflow-owner.js`<br>`src/rebalancer/provisioning-admission-policy.js`<br>`src/rebalancer/rebalance-coordinator.js` | `test/rebalancer/replica-operation-repository.test.js`<br>`test/rebalancer/provisioning-admission-policy.test.js`<br>`test/rebalancer/rebalance-coordinator-facade-compatibility.test.js`<br>`test/rebalancer/replace-replica-workflow.test.js` |
| R7 Deterministic Dependency Wiring | D8, D10 | 7, 23, 24, 33 | `src/partition/partition-service.js`<br>`src/rebalancer/unified-rebalancer.js`<br>`src/rebalancer/rebalance-coordinator.js` | `test/partition/partition-rebalancer-dependency-wiring-characterization.test.js`<br>`test/rebalancer/message-group-rebalancer-wiring.test.js` |
| R8 Entrypoint Composition Extraction For Seed/Join Parity | D9, D10, D11 | 8, 29, 30, 31, 32, 33 | `src/index.js`<br>`src/runtime/runtime-startup-wiring.js`<br>`src/bootstrap/bootstrap-service.js`<br>`src/bootstrap/node-joining-service.js` | `test/entrypoint/entrypoint-startup-shutdown-parity-characterization.test.js`<br>`test/runtime/runtime-startup-wiring.test.js`<br>`test/bootstrap/bootstrap-shutdown-quiesce.test.js` |
| R9 Regression Safety, Traceability, And Documentation | D10, D11, D12 | 1, 2, 3, 4, 5, 6, 7, 8, 33, 34, 35 | `.kiro/specs/node-boot-join-rebalance-maintainability/requirements.md`<br>`.kiro/specs/node-boot-join-rebalance-maintainability/design.md`<br>`.kiro/specs/node-boot-join-rebalance-maintainability/tasks.md`<br>`.kiro/specs/node-boot-join-rebalance-maintainability/closure-matrix.md` | Targeted verification from Task 33<br>Broad staged non-harness regression from Task 34<br>Warning-path seam tests: `test/control-plane/control-plane-error-classification.test.js`, `test/cdc/cdc-integration-service.test.js`, `test/rebalancer/replica-operation-repository.test.js` |

## Closure Rule

Requirement closure for this spec means:

1. all linked tasks are marked complete
2. implementation evidence exists on the runtime path
3. validating tests exist for the touched seam
4. targeted and broad verification evidence is recorded
