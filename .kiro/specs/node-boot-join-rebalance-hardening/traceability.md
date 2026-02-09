# Requirement-to-Test Traceability

This mapping links Requirements 1-7 to concrete automated tests in this spec scope.

| Requirement | Coverage Tests |
| --- | --- |
| 1. Transactional MOVE_REPLICA Handoff | `test/integration/move-replica-handoff.integration.test.js` |
| 2. Topology-Accurate Peer Address Resolution | `test/integration/move-replica-handoff.integration.test.js` |
| 3. CREATE_SELF_HOSTED Registration Completeness | `test/bootstrap/create-self-hosted-registration.test.js` |
| 4. Message-Group Rebalancer Wiring | `test/rebalancer/message-group-rebalancer-wiring.test.js`, `test/rebalancer/message-group-operation-routing.integration.test.js` |
| 5. Epoch Persistence + CDC Propagation | `test/cdc/current-epoch-propagation.integration.test.js` |
| 6. Strict Leader Readiness + Hydration Gates | `test/bootstrap/system-leader-readiness-address-gate.test.js`, `test/bootstrap/cache-hydration-strictness.test.js` |
| 7. Runtime Path Consolidation | `test/node/node-lifecycle-state-machine.test.js`, `test/cdc/runtime-cdc-wiring.test.js` |

## Planned Phase B Contradiction Coverage

| Contradiction ID | Planned Coverage |
| --- | --- |
| CR-001 planner overlap / duplicate ADD pressure | new planner single-path enforcement test |
| CR-002 duplicate operation step transitions | new atomic dispatch claim test |
| CR-003 leaderless system-partition writes during rebalance | new leader-routable system write integration test |
| CR-004 learner marked ready too early | new learner-safe remove gating integration test |
| CR-005 high cache conflict warning churn | covered by dispatch/idempotency and monotonic step tests |
