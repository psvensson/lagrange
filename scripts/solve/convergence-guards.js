// Convergence-guard detectors: pure read-models over the append-only log that recognise
// the failure modes which let an autonomous Quest spin without converging. They compute
// signals only — the policy of whether a signal raises a health warning or gates a step
// lives at the call sites in health.js / theory.js, each behind its CONVERGENCE_GUARDS
// flag — so a detector stays testable in isolation regardless of how it is wired, and a
// guard can be reverted by flipping one flag without touching this file.

import {
  EVENT_VIOLATION,
  EVENT_FINDING,
  COUPLED_OSC_SWAP_THRESHOLD,
  SCOPE_PRESSURE_FILE_LIMIT,
} from './constants.js';
import {projectInvariantLedger} from './store.js';

const REGRESSION_SCOPE = 'regression';

// The ordered list of regression violations for a frontier, each reduced to the set of
// invariant labels it re-broke. Empty labels are dropped so a malformed event cannot
// masquerade as a cluster.
function regressionLabelSets(log, frontierId) {
  return log
    .filter((event) =>
      event.type === EVENT_VIOLATION &&
      event.scope === REGRESSION_SCOPE &&
      (!frontierId || event.frontier === frontierId))
    .map((event) => new Set(
      (Array.isArray(event.regressed) ? event.regressed : []).filter(Boolean)))
    .filter((set) => set.size > 0);
}

function normalizeLabels(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function regressionClassification(event) {
  return event?.regressionClassification ||
    event?.classification?.regression ||
    event?.regression ||
    null;
}

function explainsRegression(event, redLabels, regressionIndex, regressionEvent) {
  if (event.type !== EVENT_FINDING) return false;
  const classification = regressionClassification(event);
  if (!classification || typeof classification !== 'object') return false;
  const resolution = String(
    classification.resolution ||
    classification.action ||
    classification.status ||
    '',
  );
  if (!['explained', 'abandoned', 'accepted', 'restored'].includes(resolution)) {
    return false;
  }
  const labels = normalizeLabels(
    classification.labels ||
    classification.redLabels ||
    classification.invariants,
  );
  if (labels.length === 0 ||
    !labels.some((label) => redLabels.includes(label))) {
    return false;
  }
  if (Number.isInteger(classification.regressionEventIndex) &&
    classification.regressionEventIndex !== regressionIndex) {
    return false;
  }
  const expectedFingerprint = classification.evidenceFingerprint ||
    classification.regressionEvidenceFingerprint ||
    null;
  if (expectedFingerprint && regressionEvent?.evidenceFingerprint &&
    expectedFingerprint !== regressionEvent.evidenceFingerprint) {
    return false;
  }
  return true;
}

// Group an ordered run of regressed-label sets into disjoint "families" by transitive
// intersection, returning the per-regression family index sequence plus a representative
// label union for each family. Two regressions that share any invariant belong to the
// same family; families that never share a label stay distinct. This turns a noisy
// stream of regressions into the small number of coupled invariant clusters that are
// actually bouncing against each other.
function groupFamilies(labelSets) {
  // Union-find over labels so a regression set that bridges two (or more)
  // previously-disjoint families collapses ALL of them into one family, not just the
  // first match. A single findIndex pass would leave transitively-connected invariants
  // reported as distinct families and falsely trip the coupled-oscillation gate.
  const parent = new Map();
  const find = (label) => {
    let root = label;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = label;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const set of labelSets) {
    let prev = null;
    for (const label of set) {
      if (!parent.has(label)) parent.set(label, label);
      if (prev !== null) union(prev, label);
      prev = label;
    }
  }
  // Compact each regression to its family via the union-find root of its labels,
  // numbering families in first-seen order. An empty regression set couples with
  // nothing and gets its own singleton family.
  const rootToIndex = new Map();
  const families = [];
  const sequence = [];
  let emptyCounter = 0;
  for (const set of labelSets) {
    let key;
    if (set.size === 0) {
      key = `__empty__${emptyCounter}`;
      emptyCounter += 1;
    } else {
      const [first] = set;
      key = find(first);
    }
    if (!rootToIndex.has(key)) {
      rootToIndex.set(key, families.length);
      families.push(new Set());
    }
    const familyIndex = rootToIndex.get(key);
    for (const label of set) families[familyIndex].add(label);
    sequence.push(familyIndex);
  }
  return {families, sequence};
}

// Detect coupled-invariant oscillation for a frontier: the failure surface bouncing
// between two (or more) disjoint invariant families, each going green and then re-broken
// after the other was "fixed". This is the signature of a definitional coupling (family
// B is defined in terms of family A), which no amount of single-frontier patching can
// settle — the honest next move is a whole-system theory and a model that reconciles the
// two families at once. A single A -> B move is ordinary whack-a-mole and does NOT
// qualify; the guard only fires once a family is revisited (A -> B -> A) and the number
// of disjoint transitions reaches COUPLED_OSC_SWAP_THRESHOLD.
export function detectCoupledOscillation(log, frontierId = null) {
  const labelSets = regressionLabelSets(log, frontierId);
  const {families, sequence} = groupFamilies(labelSets);
  let transitions = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    if (sequence[i] !== sequence[i - 1]) transitions += 1;
  }
  const seen = new Set();
  let revisited = false;
  for (let i = 0; i < sequence.length; i += 1) {
    if (i > 0 && sequence[i] !== sequence[i - 1] && seen.has(sequence[i])) {
      revisited = true;
    }
    seen.add(sequence[i]);
  }
  const distinctFamilies = new Set(sequence).size;
  const coupled = revisited &&
    distinctFamilies >= 2 &&
    transitions >= COUPLED_OSC_SWAP_THRESHOLD;
  return {
    coupled,
    swaps: transitions,
    distinctFamilies,
    clusters: families.map((family) => [...family].sort()),
  };
}

// Status of the regression-restore obligation for a frontier: when the latest measured
// run still leaves a previously-green invariant red, the next move must restore it or
// record a finding that explains why it was deliberately abandoned. A finding recorded
// after the most recent regression discharges the obligation (explain); a later measured
// run that re-greens every red label discharges it too (restore, reflected in the ledger
// no longer listing the label as red).
export function regressionRestoreStatus(log, frontierId = null, ledger = null) {
  const led = ledger || projectInvariantLedger(log, frontierId);
  const redLabels = led.currentRed;
  if (redLabels.length === 0) {
    return {pending: false, redLabels: [], explained: false};
  }
  let lastRegressionIndex = -1;
  let lastRegression = null;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const event = log[i];
    if (event.type === EVENT_VIOLATION && event.scope === REGRESSION_SCOPE &&
      (!frontierId || event.frontier === frontierId)) {
      lastRegressionIndex = i;
      lastRegression = event;
      break;
    }
  }
  if (lastRegressionIndex === -1) {
    return {pending: false, redLabels, explained: false};
  }
  const explained = log.slice(lastRegressionIndex + 1).some((event) =>
    (!frontierId || event.frontier === frontierId) &&
    explainsRegression(event, redLabels, lastRegressionIndex, lastRegression));
  return {
    pending: !explained,
    redLabels,
    explained,
    regressionEventIndex: lastRegressionIndex,
  };
}

// Whether the recorded change scope has crossed the terminal file bound. Advisory
// scope-pressure signals already fire well below this; crossing the limit means the blast
// radius is large enough that the Solver must split or shrink scope before more edits.
export function scopeTerminalStatus(scopePressure) {
  const fileCount = Array.isArray(scopePressure?.changedPaths) ?
    scopePressure.changedPaths.length : 0;
  return {terminal: fileCount > SCOPE_PRESSURE_FILE_LIMIT, fileCount};
}
