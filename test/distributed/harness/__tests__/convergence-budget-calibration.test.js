import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  clampMachineFactor,
  machineFactorExceedsCap,
  resolveMachineFactorFromEnv,
  applyMachineCalibration,
  median,
  cpuScalingFromTable,
  composeMachineFactor,
  MACHINE_FACTOR_MAX,
} from '../convergence-budget-calibration.js';

// Falsifier for the hardware-relative convergence budget calibration. The
// load-bearing invariants:
//  (1) WORK-BOUND budgets (settleTimeoutMs, maxSustainedOverTargetMs) scale by the
//      factor; STABILITY budgets (quietWindowMs, sampleIntervalMs) stay FIXED.
//  (2) The factor floors at 1.0 (a fast machine never gets a tighter budget) and
//      caps (a noisy/slow probe cannot grant an unbounded budget).
//  (3) An absent/invalid factor == reference machine (today's behaviour exactly).

describe('clampMachineFactor', () => {
  it('floors at 1.0 (never tighten below reference)', () => {
    assert.equal(clampMachineFactor(0.5), 1.0);
    assert.equal(clampMachineFactor(0.999), 1.0);
  });
  it('passes through in-band values', () => {
    assert.equal(clampMachineFactor(2.0), 2.0);
    assert.equal(clampMachineFactor('2.5'), 2.5);
  });
  it('caps at the max', () => {
    assert.equal(clampMachineFactor(99), MACHINE_FACTOR_MAX);
  });
  it('treats non-finite / non-positive as reference 1.0', () => {
    assert.equal(clampMachineFactor(NaN), 1.0);
    assert.equal(clampMachineFactor(-1), 1.0);
    assert.equal(clampMachineFactor(undefined), 1.0);
    assert.equal(clampMachineFactor('nope'), 1.0);
  });
});

describe('machineFactorExceedsCap', () => {
  it('flags a raw factor above the cap (machine unsuitable)', () => {
    assert.equal(machineFactorExceedsCap(MACHINE_FACTOR_MAX + 0.1), true);
    assert.equal(machineFactorExceedsCap(MACHINE_FACTOR_MAX), false);
    assert.equal(machineFactorExceedsCap(2.0), false);
    assert.equal(machineFactorExceedsCap(NaN), false);
  });
});

describe('resolveMachineFactorFromEnv', () => {
  it('absent / empty -> 1.0', () => {
    assert.equal(resolveMachineFactorFromEnv({}), 1.0);
    assert.equal(resolveMachineFactorFromEnv({LAGRANGE_MACHINE_FACTOR: ''}), 1.0);
  });
  it('reads + clamps the env value', () => {
    assert.equal(resolveMachineFactorFromEnv({LAGRANGE_MACHINE_FACTOR: '2.0'}), 2.0);
    assert.equal(resolveMachineFactorFromEnv({LAGRANGE_MACHINE_FACTOR: '0.3'}), 1.0);
    assert.equal(
      resolveMachineFactorFromEnv({LAGRANGE_MACHINE_FACTOR: '99'}),
      MACHINE_FACTOR_MAX);
  });
});

describe('applyMachineCalibration', () => {
  const base = {
    targetVoterCount: 3,
    settleTimeoutMs: 30000,
    quietWindowMs: 5000,
    maxSustainedOverTargetMs: 120000,
    sampleIntervalMs: 250,
  };

  it('scales ONLY the work-bound budgets at factor 2.0', () => {
    const out = applyMachineCalibration(base, 2.0);
    assert.equal(out.settleTimeoutMs, 60000); // scaled
    assert.equal(out.maxSustainedOverTargetMs, 240000); // scaled
    assert.equal(out.quietWindowMs, 5000); // FIXED (stability proof)
    assert.equal(out.sampleIntervalMs, 250); // FIXED (cadence)
    assert.equal(out.targetVoterCount, 3); // untouched
    assert.equal(out.machineFactor, 2.0);
    assert.deepEqual(
      out.machineCalibratedFields.sort(),
      ['maxSustainedOverTargetMs', 'settleTimeoutMs']);
  });

  it('factor 1.0 is a no-op (today behaviour) with no calibrated fields', () => {
    const out = applyMachineCalibration(base, 1.0);
    assert.equal(out.settleTimeoutMs, 30000);
    assert.equal(out.maxSustainedOverTargetMs, 120000);
    assert.deepEqual(out.machineCalibratedFields, []);
  });

  it('a sub-1.0 factor is floored (no tighter budget on a fast box)', () => {
    const out = applyMachineCalibration(base, 0.5);
    assert.equal(out.settleTimeoutMs, 30000);
    assert.equal(out.maxSustainedOverTargetMs, 120000);
    assert.equal(out.machineFactor, 1.0);
  });

  it('does not mutate the input', () => {
    const snapshot = {...base};
    applyMachineCalibration(base, 3.0);
    assert.deepEqual(base, snapshot);
  });
});

describe('median', () => {
  it('odd / even / empty / non-finite-filtered', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.ok(Number.isNaN(median([])));
    assert.equal(median([5, NaN, 'x', 5]), 5);
  });
});

describe('cpuScalingFromTable', () => {
  const table = {'0.5': 2.1, '1.0': 1.0, '2.0': 0.7};
  it('empty / missing table -> 1.0', () => {
    assert.equal(cpuScalingFromTable(1.0, null), 1.0);
    assert.equal(cpuScalingFromTable(1.0, {}), 1.0);
  });
  it('exact match wins', () => {
    assert.equal(cpuScalingFromTable(0.5, table), 2.1);
    assert.equal(cpuScalingFromTable(2.0, table), 0.7);
  });
  it('interpolates between nearest keys', () => {
    // midpoint between 1.0 (1.0) and 2.0 (0.7) -> 0.85
    assert.equal(cpuScalingFromTable(1.5, table), 0.85);
  });
  it('holds endpoints outside the measured range (no runaway extrapolation)', () => {
    assert.equal(cpuScalingFromTable(0.25, table), 2.1);
    assert.equal(cpuScalingFromTable(8, table), 0.7);
  });
});

describe('composeMachineFactor', () => {
  it('hostFactor = host/reference, combined = hostFactor * cpuScaling, clamped', () => {
    const r = composeMachineFactor(
      {hostMedianMs: 170, referenceMedianMs: 85, cpuScaling: 1.0});
    assert.equal(r.hostFactor, 2.0);
    assert.equal(r.combined, 2.0);
    assert.equal(r.exceedsCap, false);
  });
  it('cpuScaling multiplies in', () => {
    const r = composeMachineFactor(
      {hostMedianMs: 85, referenceMedianMs: 85, cpuScaling: 1.5});
    assert.equal(r.hostFactor, 1.0);
    assert.equal(r.combined, 1.5);
  });
  it('flags exceedsCap on the RAW combined before clamping', () => {
    const r = composeMachineFactor(
      {hostMedianMs: 850, referenceMedianMs: 85, cpuScaling: 1.0});
    assert.equal(r.rawCombined, 10);
    assert.equal(r.combined, MACHINE_FACTOR_MAX);
    assert.equal(r.exceedsCap, true);
  });
  it('missing inputs degrade to reference 1.0', () => {
    assert.equal(composeMachineFactor({}).combined, 1.0);
    assert.equal(
      composeMachineFactor({hostMedianMs: 85, referenceMedianMs: 0}).combined, 1.0);
  });
});
