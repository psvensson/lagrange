import {createHash} from 'node:crypto';

import {
  COMPARISON_VIEW,
} from './comparative-system-budget.js';
import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  buildOltpBaselinePlan,
  hashOltpBaselineMeasurementPlan,
} from './oltp-baseline-workload.js';
import {
  OLTP_OPEN_LOOP_PROFILE,
} from './oltp-open-loop-step-owner.js';
import {
  OLTP_PAIRED_RETRY_POLICY,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from './oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);

const ZERO = 0;
const ONE = 1;
const TWO = 2;

// v2 supersedes scenario-a-paired-sweep-v1 (R09): v1 fixed the comparison
// to two systems (TiDB, Lagrange) with a two-way alternation; v2 takes the
// compared systems from the caller (N >= 2, e.g. with PostgreSQL), rotates
// the system order so each system leads equally often, and records the
// execution order of every pair.
const SWEEP_PROFILE = Object.freeze({
  id: 'scenario-a-paired-sweep-v2',
  supersedes: 'scenario-a-paired-sweep-v1',
  supersededBecause:
    'v1 hard-coded two systems; v2 compares N named systems with rotated, recorded order',
  counterbalance: 'alternate-rate-direction-and-rotate-system-order',
  freshDatasetPerSystemRateRun: true,
  warmupBeforeMeasurement: true,
  semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
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
  const rates = arrayMap(values, (value) =>
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

const KNOWN_SYSTEMS = Object.freeze(Object.values(OLTP_SCENARIO_A_SYSTEM));

function normalizeSystems(values) {
  if (!Array.isArray(values) || values.length < TWO) {
    throw new Error('Scenario A sweep requires at least two compared systems');
  }
  for (const system of values) {
    if (!arrayIncludes(KNOWN_SYSTEMS, system)) {
      throw new Error(`Scenario A sweep does not know system ${system}`);
    }
  }
  if (new Set(values).size !== values.length) {
    throw new Error('Scenario A sweep compared systems contain duplicates');
  }
  return Object.freeze([...values]);
}

// Every system leads equally often and both rate directions are equally
// represented: repetitions are a multiple of lcm(systems, 2).
function normalizeRepetitions(value, systemCount) {
  const repetitions = Number(value);
  const period = systemCount % TWO === ZERO ? systemCount : systemCount * TWO;
  if (!Number.isInteger(repetitions) || repetitions < period ||
      repetitions % period !== ZERO) {
    throw new Error(
      `Scenario A paired sweep requires repetitions as a positive multiple of ${period}`,
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

function normalizeComparisonView(value) {
  if (value !== COMPARISON_VIEW.ARCHITECTURE_NATIVE &&
      value !== COMPARISON_VIEW.MATCHED_TOTAL_BUDGET) {
    throw new Error('Scenario A sweep requires a known comparisonView');
  }
  return value;
}

function hashCanonicalValue(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function workloadIdentity(rawWorkload = {}) {
  const plan = buildOltpBaselinePlan(rawWorkload);
  const dataset = buildOltpBaselineDataset(rawWorkload);
  return Object.freeze({
    datasetSha256: hashOltpBaselineDataset(dataset),
    workloadPlanSha256: hashCanonicalValue(plan),
    measurementPlanSha256: hashOltpBaselineMeasurementPlan(plan),
  });
}

function rejectSemanticOverride(options) {
  if (Object.hasOwn(options, 'semanticProfileSha256') ||
      Object.hasOwn(options, 'semanticProfileId')) {
    throw new Error(
      'Scenario A sweep semantic profile is owned by the semantic-profile owner',
    );
  }
}

function canonicalIdentity(options) {
  rejectSemanticOverride(options);
  const workload = workloadIdentity(options.workload || {});
  const systems = normalizeSystems(options.systems);
  return Object.freeze({
    profileId: SWEEP_PROFILE.id,
    systems,
    comparisonView: normalizeComparisonView(options.comparisonView),
    offeredRatesPerSec: normalizeRates(options.offeredRatesPerSec),
    repetitions: normalizeRepetitions(options.repetitions, systems.length),
    slo: normalizeSlo(options.slo),
    datasetSha256: workload.datasetSha256,
    workloadPlanSha256: workload.workloadPlanSha256,
    measurementPlanSha256: workload.measurementPlanSha256,
    semanticProfileId: OLTP_SCENARIO_A_SEMANTIC_PROFILE.id,
    semanticProfileSha256: hashScenarioASemanticProfile(),
    openLoopProfileId: OLTP_OPEN_LOOP_PROFILE.id,
    retryPolicyId: OLTP_PAIRED_RETRY_POLICY.id,
  });
}

function systemOrder(systems, repetitionIndex) {
  const shift = repetitionIndex % systems.length;
  return Object.freeze([...arraySlice(systems, shift), ...arraySlice(systems, ZERO, shift)]);
}

function rateOrder(rates, repetitionIndex) {
  return repetitionIndex % TWO === ZERO ?
    rates :
    Object.freeze([...rates].reverse());
}

function buildPairs(identity) {
  const pairs = [];
  for (let repetitionIndex = ZERO;
    repetitionIndex < identity.repetitions;
    repetitionIndex += ONE) {
    const orderedRates = rateOrder(identity.offeredRatesPerSec, repetitionIndex);
    const order = systemOrder(identity.systems, repetitionIndex);
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
    sweepPlanSha256: hashCanonicalValue(identity),
    pairs: buildPairs(identity),
  });
}

export {
  SWEEP_PROFILE as OLTP_PAIRED_SWEEP_PROFILE,
  OLTP_SCENARIO_A_SYSTEM as OLTP_PAIRED_SWEEP_SYSTEM,
  buildScenarioAPairedSweepPlan,
};
