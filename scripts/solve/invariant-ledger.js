// Pure per-frontier invariant accounting folded from the append-only log: the
// monotonic high-water mark of satisfied sub-invariants and the per-run ledger
// that contrasts the latest measured run with the one before it. Re-exported
// from store.js, which owns the log these projections read.

import {EVENT_ATTEMPT, EVENT_EVIDENCE_INGESTED} from './constants.js';
import {isFrontierProbeEvent} from './probe-spec.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const SetConstructor = Set;

function setValues(set) {
  const values = [];
  setForEach(set, (value) => arrayPush(values, value));
  return values;
}

// A measured run for invariant accounting: a valid-sample attempt, or an ingested
// frontier-probe evidence event carrying a numeric metric.
function isMeasuredInvariantEvent(event) {
  return (event.type === EVENT_ATTEMPT && event.invalidSample !== true) ||
    (event.type === EVENT_EVIDENCE_INGESTED &&
      isFrontierProbeEvent(event) &&
      typeof event.metric === 'number');
}

// Measured runs in log order, narrowed to one frontier when an id is given.
function measuredInvariantEvents(log, frontierId) {
  return arrayFilter(log, (event) =>
    (!frontierId || event.frontier === frontierId) &&
      isMeasuredInvariantEvent(event));
}

// Truthy labels a measured run recorded as satisfied (missing field: none).
function satisfiedInvariantLabels(event) {
  return arrayFilter(
    arrayIsArray(event.satisfiedInvariants) ? event.satisfiedInvariants : [],
    Boolean,
  );
}

function setFromValues(values) {
  const set = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) {
    setAdd(set, values[index]);
  }
  return set;
}

function valuesNotIn(values, excluded) {
  return arrayFilter(values, (value) => !setHas(excluded, value));
}

// Monotonic high-water mark of satisfied sub-invariants for a frontier: the union of
// every `satisfiedInvariants` set recorded on a measured attempt or ingested-evidence
// event. Used to detect silent regression — a later measured attempt that no longer
// satisfies a label present here has re-broken a previously-green invariant.
export function invariantHighWater(log, frontierId = null) {
  const set = new SetConstructor();
  const events = measuredInvariantEvents(log, frontierId);
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const labels = satisfiedInvariantLabels(events[eventIndex]);
    for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      setAdd(set, labels[labelIndex]);
    }
  }
  return setValues(set);
}

// Pure per-invariant ledger projection for a frontier, folded from the same measured
// events the high-water mark reads (a measured attempt, or an ingested-evidence event
// carrying a numeric metric). For every label that has ever been green it tracks whether
// the most recent measured run still satisfies it, and contrasts the latest measured run
// with the one before it so callers can see what just regressed or was just restored.
// This is the shared substrate for the regression-restore gate (rr-C) and the
// coupled-oscillation detector (rr-D); it records no policy of its own.
//
// Returns:
//   greenHighWater  - every label ever satisfied (monotonic union)
//   currentGreen    - labels satisfied by the latest measured run
//   currentRed      - high-water labels NOT satisfied by the latest measured run
//   regressedThisRun- labels green in the previous measured run but red in the latest
//   restoredThisRun - labels red in the previous measured run but green in the latest
//   history         - [{ts, green:[...], red:[...]}] one entry per measured run
export function projectInvariantLedger(log, frontierId = null) {
  const highWater = new SetConstructor();
  const history = [];
  const events = measuredInvariantEvents(log, frontierId);
  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    const labels = satisfiedInvariantLabels(event);
    const green = setFromValues(labels);
    for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      setAdd(highWater, labels[labelIndex]);
    }
    const red = valuesNotIn(setValues(highWater), green);
    arrayPush(history, {ts: event.ts || null, green: setValues(green), red});
  }
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const currentGreen = latest ? latest.green : [];
  const currentRed = latest ? latest.red : [];
  const prevGreen = setFromValues(previous ? previous.green : []);
  const latestGreen = setFromValues(currentGreen);
  const regressedThisRun = previous ?
    valuesNotIn(setValues(prevGreen), latestGreen) : [];
  const restoredThisRun = previous ?
    valuesNotIn(setValues(latestGreen), prevGreen) : [];
  return {
    frontier: frontierId,
    greenHighWater: setValues(highWater),
    currentGreen,
    currentRed,
    regressedThisRun,
    restoredThisRun,
    history,
  };
}
