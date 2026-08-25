import {runGuardTestScenarios} from
  './checks/guard-test-scenario-runner.js';

const SCENARIOS = Object.freeze({
  'formation-barrier-spread-cure-admission-liveness': Object.freeze([
    'test/rebalancer/formation-barrier-spread-cure-lane-discrimination.test.js',
    'test/rebalancer/formation-barrier-recovery-mutation-admission.test.js',
  ]),
});

runGuardTestScenarios(SCENARIOS);
