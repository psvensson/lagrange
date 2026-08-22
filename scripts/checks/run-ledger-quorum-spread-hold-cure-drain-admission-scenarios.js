/**
 * Scenario runner for the ledger-quorum-spread-hold-cure-drain-admission
 * quest.
 *
 * Binds the release-path contract: once the concentration owner mints the
 * ledger_surplus_drain planning capability, the move planner consumes it
 * regardless of the READY projection, so an engaged quorum-spread hold always
 * has a reachable release path (decision-table invariant
 * cure-planning-not-starved; TLC pair LedgerSpreadDrainRelease). The sibling
 * suites pin the planning gate diagnostics and every destruction-safety layer
 * the drain still crosses.
 */

import {runGuardTestScenarios} from './guard-test-scenario-runner.js';

const DRAIN_ADMISSION_GUARDS = Object.freeze([
  'test/rebalancer/ledger-quorum-spread-hold-cure-drain-admission.test.js',
  'test/rebalancer/priority-recovery-planning-gate-diagnostic.test.js',
  'test/rebalancer/priority-recovery-stale-planning-visibility.test.js',
  'test/rebalancer/priority-remove-safety-spread-nonregression.test.js',
  'test/rebalancer/quorum-conditioned-remove-safety.test.js',
  'test/convergence/dt6-priority-surplus-remove-authoritative-placement-fence.test.js',
]);

const SCENARIOS = Object.freeze({
  'ledger-quorum-spread-hold-cure-drain-admission-v2-main':
    DRAIN_ADMISSION_GUARDS,
  'ledger-quorum-spread-hold-cure-drain-admission-v2': DRAIN_ADMISSION_GUARDS,
});

runGuardTestScenarios(SCENARIOS);
