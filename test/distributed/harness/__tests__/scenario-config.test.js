import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../constants.js';
import {
  resolveDiskFullUnderLoadScenarioConfig,
  resolvePartitionKillHealUnderLoadScenarioConfig,
  resolveSeedRestartUnderLoadScenarioConfig,
  resolveSlowFollowerUnderLoadScenarioConfig,
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
} from '../scenario-config.js';

describe('scenario-config defaults', () => {
  it('uses shortened stabilization defaults across fault scenarios', () => {
    const seedRestart = resolveSeedRestartUnderLoadScenarioConfig({});
    const partitionKillHeal =
      resolvePartitionKillHealUnderLoadScenarioConfig({});
    const diskFull = resolveDiskFullUnderLoadScenarioConfig({});
    const slowFollower = resolveSlowFollowerUnderLoadScenarioConfig({});

    assert.equal(
      seedRestart.preRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    );
    assert.equal(
      seedRestart.postRestartQuietWindowMs,
      CONVERGENCE_DEFAULTS.quietWindowMs,
    );
    assert.equal(
      partitionKillHeal.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    );
    assert.equal(
      diskFull.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    );
    assert.equal(
      slowFollower.preFaultDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    );
  });

  it('uses shortened distribution and restart timing defaults', () => {
    const distribution = resolveSevenNodeReadWriteLoadDistributionScenarioConfig(
      {},
    );
    const transactionRecovery =
      resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig({});

    assert.equal(
      distribution.postDistributionSoakMs,
      SCENARIO_TIMING_DEFAULTS.shortSoakMs,
    );
    assert.equal(
      transactionRecovery.preRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    );
  });
});
