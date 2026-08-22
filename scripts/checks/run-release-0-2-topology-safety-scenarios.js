/**
 * Scenario runner for the release-0-2-topology-safety quest.
 *
 * Binds the three release frontier scenarios to the deterministic guard
 * tests that discriminate the topology-safety mechanisms on current HEAD:
 *  - release-0-2-topology-operation-ledger: authoritative operation-ledger
 *    placement observation (owner_rpc_lane-only release evidence) and the
 *    formation barrier that shares it.
 *  - release-0-2-topology-surplus-remove: the destructive priority
 *    surplus-REMOVE commit fence (owner-authorizes-destruction) plus the
 *    preserved adjacent remove-safety lanes.
 *  - release-0-2-topology-ready-lease-admission: ordinary placement
 *    candidates require a current node-record ready lease while startup
 *    authority exceptions stay confined to system partitions.
 * The aggregate scenario unions all guards and matches the quest doneWhen.
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const OPERATION_LEDGER_GUARDS = Object.freeze([
  'test/convergence/dt6-operation-ledger-quorum-authoritative-release.test.js',
  'test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js',
  'test/rebalancer/operation-ledger-quorum-concentration-replace-impotence.test.js',
]);
const SURPLUS_REMOVE_GUARDS = Object.freeze([
  'test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js',
  'test/rebalancer/quorum-conditioned-remove-safety.test.js',
  'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
]);
const READY_LEASE_GUARDS = Object.freeze([
  'test/rebalancer/runtime-service-expired-lease-candidate-admission.test.js',
  'test/rebalancer/operation-ownership-lease-fencing.test.js',
]);

const SCENARIOS = Object.freeze({
  'release-0-2-topology-operation-ledger': OPERATION_LEDGER_GUARDS,
  'release-0-2-topology-surplus-remove': SURPLUS_REMOVE_GUARDS,
  'release-0-2-topology-ready-lease-admission': READY_LEASE_GUARDS,
  'release-0-2-topology-safety': Object.freeze([
    ...OPERATION_LEDGER_GUARDS,
    ...SURPLUS_REMOVE_GUARDS,
    ...READY_LEASE_GUARDS,
  ]),
});

runGuardTestScenarios(SCENARIOS);
