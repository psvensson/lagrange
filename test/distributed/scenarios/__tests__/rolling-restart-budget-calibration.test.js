import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRollingRestartScenarioConfig,
  buildConvergenceOptions,
} from '../rolling-restart.js';

// End-to-end falsifier for the hardware-relative budget WIRING (not just the pure
// core): a non-1.0 LAGRANGE_MACHINE_FACTOR must change the EFFECTIVE work-bound
// timeouts the rolling-restart scenario hands to waitForConvergence. This is the
// gap a prior verification caught — the pure factor was correct but flowed into
// config.convergence, which the rolling-restart scenario never reads; it reads its
// own resolveRollingRestartScenarioConfig + buildConvergenceOptions. RED on revert
// (if the scenario stops scaling perNodeConvergenceTimeoutMs, the 2x assertions
// fail). Deliberate-delay / stability fields must STAY fixed.

const ENV_KEY = 'LAGRANGE_MACHINE_FACTOR';

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe('rolling-restart budget calibration wiring', () => {
  it('factor absent -> today behaviour (no scaling)', () => {
    delete process.env[ENV_KEY];
    const cfg = resolveRollingRestartScenarioConfig({});
    assert.equal(cfg.perNodeConvergenceTimeoutMs, 300000);
    assert.equal(cfg.perRestartActiveTimeoutMs, 120000);
    assert.equal(cfg.postRestartActiveTimeoutMs, 240000);
    assert.equal(cfg.machineFactor, 1.0);
  });

  it('factor 2.0 doubles the work-bound timeouts the gate actually uses', () => {
    process.env[ENV_KEY] = '2.0';
    const cfg = resolveRollingRestartScenarioConfig({});
    assert.equal(cfg.preLoadReadinessTimeoutMs, 600000);
    assert.equal(cfg.perNodeConvergenceTimeoutMs, 600000);
    assert.equal(cfg.perRestartActiveTimeoutMs, 240000);
    assert.equal(cfg.postRestartActiveTimeoutMs, 480000);
    assert.equal(cfg.acknowledgedWriteVisibilityTimeoutMs, 60000);
    assert.equal(cfg.machineFactor, 2.0);
  });

  it('the scaled perNodeConvergenceTimeoutMs flows into settle + over-target', () => {
    process.env[ENV_KEY] = '2.0';
    const cfg = resolveRollingRestartScenarioConfig({});
    const conv = buildConvergenceOptions(cfg.perNodeConvergenceTimeoutMs);
    assert.equal(conv.settleTimeoutMs, 600000); // 300000 * 2
    assert.equal(conv.maxSustainedOverTargetMs, 600000); // max(120000, 600000)
  });

  it('deliberate delays / stability windows / counts stay FIXED', () => {
    const base = resolveRollingRestartScenarioConfig({});
    process.env[ENV_KEY] = '3.0';
    const scaled = resolveRollingRestartScenarioConfig({});
    // soaks / delays / stability window / attempt counts are unchanged
    assert.equal(scaled.preRestartSettleMs, base.preRestartSettleMs);
    assert.equal(scaled.interRestartDelayMs, base.interRestartDelayMs);
    assert.equal(scaled.postRestartLoadSoakMs, base.postRestartLoadSoakMs);
    assert.equal(scaled.postRestartQuietWindowMs, base.postRestartQuietWindowMs);
    assert.equal(
      scaled.postRestartActiveNoProgressMaxAttempts,
      base.postRestartActiveNoProgressMaxAttempts);
    assert.equal(
      scaled.postRestartConsistencyPollIntervalMs,
      base.postRestartConsistencyPollIntervalMs);
  });

  it('a sub-1.0 factor is floored (no tighter budget on a fast box)', () => {
    process.env[ENV_KEY] = '0.5';
    const cfg = resolveRollingRestartScenarioConfig({});
    assert.equal(cfg.perNodeConvergenceTimeoutMs, 300000);
    assert.equal(cfg.machineFactor, 1.0);
  });

  it('explicit scenario options are scaled too (not just defaults)', () => {
    process.env[ENV_KEY] = '2.0';
    const cfg = resolveRollingRestartScenarioConfig(
      {perNodeConvergenceTimeoutMs: 120000});
    assert.equal(cfg.perNodeConvergenceTimeoutMs, 240000);
  });
});
