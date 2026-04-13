import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
  TIMEOUTS,
} from '../constants.js';

describe('distributed harness timing constants', () => {
  it('publishes shortened shared scenario timing defaults', () => {
    assert.equal(SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs, 1000);
    assert.equal(SCENARIO_TIMING_DEFAULTS.shortSoakMs, 1000);
    assert.equal(SCENARIO_TIMING_DEFAULTS.pollIntervalMs, 250);
    assert.equal(SCENARIO_TIMING_DEFAULTS.interActionDelayMs, 250);
  });

  it('uses shortened shared convergence and benchmark poll intervals', () => {
    assert.equal(TIMEOUTS.CONSISTENCY_CONVERGENCE_POLL_INTERVAL, 250);
    assert.equal(BENCHMARK_DEFAULTS.readyPollIntervalMs, 250);
  });
});
