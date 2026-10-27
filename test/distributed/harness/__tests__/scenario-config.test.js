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
    assert.equal(seedRestart.tableName, 'user_load_logs');
    assert.equal(partitionKillHeal.tableName, 'user_load_logs');
    assert.equal(diskFull.tableName, 'user_load_logs');
    assert.equal(slowFollower.tableName, 'user_load_logs');
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
    assert.equal(
      distribution.workloadProfile,
      'benchmark_events_mixed',
    );
    assert.equal(
      distribution.tableName,
      'benchmark_events',
    );
    assert.deepEqual(
      distribution.loadOperations,
      ['INSERT', 'SELECT'],
    );
    assert.throws(
      () => resolveSeedRestartUnderLoadScenarioConfig({tableName: 'logs'}),
      /Scenario config cannot target protected system table logs/,
    );
    assert.throws(
      () => resolveSevenNodeReadWriteLoadDistributionScenarioConfig({
        tableName: 'logs',
      }),
      /Scenario config cannot target protected system table logs/,
    );
  });
});
