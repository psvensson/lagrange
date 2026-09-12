import {createHash} from 'node:crypto';

import {
  COMPARISON_VIEW,
} from './comparative-system-budget.js';
import {
  OLTP_OPEN_LOOP_PROFILE,
} from './oltp-open-loop-step-owner.js';
import {
  OLTP_PAIRED_RETRY_POLICY,
} from './oltp-paired-retry-owner.js';

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const SYSTEM = Object.freeze({
  TIDB_TIKV: 'tidb-tikv',
  LAGRANGE: 'lagrange',
});

const SWEEP_PROFILE = Object.freeze({
  id: 'scenario-a-paired-sweep-v1',
  systems: Object.freeze([SYSTEM.TIDB_TIKV, SYSTEM.LAGRANGE]),
  counterbalance: 'alternate-rate-direction-and-system-first',
  freshDatasetPerSystemRateRun: true,
  warmupBeforeMeasurement: true,
  openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
  retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
});

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= ZERO) {
    throw new Error(`${label} must be a positive number`);
  }
  return number;
}

function normalizeRates(values) {
  if (!Array.isArray(values) || values.length < TWO) {
    throw new Error('Scenario A sweep requires at least two offered rates');
  }
  const rates = values.map((value) =>
    positiveNumber(value, 'offeredRatesPerSec entry'));
  for (let index = ONE; index < rates.length; index += ONE) {
    if (rates[index] <= rates[index - ONE]) {
      throw new Error(
        'Scenario A offered rates must be strictly increasing and unique',
      );
    }
  }
  return Object.freeze(rates);
}

function normalizeRepetitions(value) {
  const repetitions = Number(value);
  if (!Number.isInteger(repetitions) || repetitions < TWO ||
      repetitions % TWO !== ZERO) {
    throw new Error(
      'Scenario A paired sweep requires an even repetitions value >= 2',
    );
  }
  return repetitions;
}

function normalizeSlo(value = {}) {
  const p99Ms = positiveNumber(value.p99Ms, 'slo.p99Ms');
  const maxErrorRate = Number(value.maxErrorRate);
  if (!Number.isFinite(maxErrorRate) ||
      maxErrorRate < ZERO || maxErrorRate > ONE) {
    throw new Error('slo.maxErrorRate must be between 0 and 1');
  }
  return Object.freeze({p99Ms, maxErrorRate});
}

function requireSha256(value, label) {
  const digest = String(value || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
}

function normalizeComparisonView(value) {
  if (value !== COMPARISON_VIEW.ARCHITECTURE_NATIVE &&
      value !== COMPARISON_VIEW.MATCHED_TOTAL_BUDGET) {
    throw new Error('Scenario A sweep requires a known comparisonView');
  }
  return value;
}

function canonicalIdentity(options) {
  return Object.freeze({
    profileId: SWEEP_PROFILE.id,
    comparisonView: normalizeComparisonView(options.comparisonView),
    offeredRatesPerSec: normalizeRates(options.offeredRatesPerSec),
    repetitions: normalizeRepetitions(options.repetitions),
    slo: normalizeSlo(options.slo),
    datasetSha256: requireSha256(options.datasetSha256, 'datasetSha256'),
    measurementPlanSha256: requireSha256(
      options.measurementPlanSha256,
      'measurementPlanSha256',
    ),
    semanticProfileSha256: requireSha256(
      options.semanticProfileSha256,
      'semanticProfileSha256',
    ),
    openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
    retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
  });
}

function hashIdentity(identity) {
  return createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex');
}

function systemOrder(repetitionIndex) {
  return repetitionIndex % TWO === ZERO ?
    Object.freeze([SYSTEM.TIDB_TIKV, SYSTEM.LAGRANGE]) :
    Object.freeze([SYSTEM.LAGRANGE, SYSTEM.TIDB_TIKV]);
}

function rateOrder(rates, repetitionIndex) {
  return repetitionIndex % TWO === ZERO ? rates : Object.freeze([...rates].reverse());
}

function buildPairs(identity) {
  const pairs = [];
  for (let repetitionIndex = ZERO;
    repetitionIndex < identity.repetitions;
    repetitionIndex += ONE) {
    const orderedRates = rateOrder(identity.offeredRatesPerSec, repetitionIndex);
    const order = systemOrder(repetitionIndex);
    for (const offeredRatePerSec of orderedRates) {
      pairs.push(Object.freeze({
        repetition: repetitionIndex + ONE,
        offeredRatePerSec,
        systemOrder: order,
        freshDatasetPerSystem: true,
        warmupBeforeMeasurement: true,
      }));
    }
  }
  return Object.freeze(pairs);
}

function buildScenarioAPairedSweepPlan(options = {}) {
  const identity = canonicalIdentity(options);
  return Object.freeze({
    profile: SWEEP_PROFILE,
    identity,
    sweepPlanSha256: hashIdentity(identity),
    pairs: buildPairs(identity),
  });
}

export {
  SWEEP_PROFILE as OLTP_PAIRED_SWEEP_PROFILE,
  SYSTEM as OLTP_PAIRED_SWEEP_SYSTEM,
  buildScenarioAPairedSweepPlan,
};
