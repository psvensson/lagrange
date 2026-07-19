// Convergence-guard detectors: pure read-models over the append-only log that recognise
// the failure modes which let an autonomous Quest spin without converging. They compute
// signals only — the policy of whether a signal raises a health warning or gates a step
// lives at the call sites in health.js / theory.js, each behind its CONVERGENCE_GUARDS
// flag — so a detector stays testable in isolation regardless of how it is wired, and a
// guard can be reverted by flipping one flag without touching this file.

import {
  EVENT_VIOLATION,
  EVENT_FINDING,
  EVENT_ATTEMPT,
  EVENT_NON_MEASUREMENT,
  EVENT_EVIDENCE_INGESTED,
  COUPLED_OSC_SWAP_THRESHOLD,
  SCOPE_PRESSURE_FILE_LIMIT,
  SCOPE_PRESSURE_OWNER_LIMIT,
  SCOPE_PRESSURE_BYTE_LIMIT,
  HARNESS_NONMEASURING_PARK_THRESHOLD,
  NON_MEASURING_VERDICT_REASONS,
  QUEST_CHAIN_DEPTH_BUDGET,
  QUEST_CHAIN_WINDOW_DAYS,
} from './constants.js';
import {projectInvariantLedger} from './store.js';
import {isFrontierProbeEvent} from './probe-spec.js';

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

// Status of the coupled-invariant reconcile obligation for a frontier. Once
// detectCoupledOscillation reports a coupling, the families are definitionally coupled
// (one is re-broken whenever the other is "fixed"), so a single-owner local patch can
// never honestly settle them — the obligation is to reconcile every coupled family at
// once. The obligation is discharged only by a genuine atomic reconcile (a single
// measured run leaving every coupled label green together, reflected in the ledger no
// longer listing any coupled label red) or by a finding that explicitly accepts/explains
// the coupling. Until then it is `pending`. Because detectCoupledOscillation reads the
// whole append-only history, the coupling — and thus this obligation — persists across
// the entire episode, not just the run that first tripped it; that durability is what
// stops the "record a system theory, then patch one owner again, then re-break" loop.
export function couplingReconcileStatus(log, frontierId = null, ledger = null) {
  const osc = detectCoupledOscillation(log, frontierId);
  if (!osc.coupled) {
    return {
      coupled: false,
      pending: false,
      reconciled: false,
      explained: false,
      clusters: osc.clusters,
      coupledLabels: [],
      redCoupledLabels: [],
    };
  }
  const led = ledger || projectInvariantLedger(log, frontierId);
  const coupledLabels = [...new Set(osc.clusters.flat())].sort();
  const redCoupledLabels = coupledLabels.filter((label) =>
    led.currentRed.includes(label));
  const reconciled = redCoupledLabels.length === 0;
  const explained = !reconciled &&
    regressionRestoreStatus(log, frontierId, led).explained;
  return {
    coupled: true,
    pending: !reconciled && !explained,
    reconciled,
    explained,
    clusters: osc.clusters,
    coupledLabels,
    redCoupledLabels,
  };
}

// Whether a measured local-fix attempt must be denied progress credit because an active
// coupled-invariant oscillation is still unreconciled. A single-owner patch that leaves
// any coupled family red has not performed the required atomic cross-owner reconcile, so
// crediting it as progress would let the Solver climb on whack-a-mole. The attempt is only
// allowed to earn credit when it greens EVERY coupled label in the same run (the atomic
// reconcile) or the coupling has already been explained — both of which make the
// obligation no longer pending. `satisfiedInvariants` are the labels green in THIS run.
export function coupledLocalFixBlocked(log, frontierId = null, satisfiedInvariants = []) {
  const status = couplingReconcileStatus(log, frontierId);
  if (!status.pending) return false;
  const greened = new Set(
    (Array.isArray(satisfiedInvariants) ? satisfiedInvariants : []).filter(Boolean));
  return status.coupledLabels.some((label) => !greened.has(label));
}

// Whether the recorded change scope has crossed the terminal file bound. Advisory
// scope-pressure signals already fire well below this; crossing the limit means the blast
// radius is large enough that the Solver must split or shrink scope before more edits.
export function scopeTerminalStatus(scopePressure) {
  const fileCount = Array.isArray(scopePressure?.changedPaths) ?
    scopePressure.changedPaths.length : 0;
  const ownerCount = Array.isArray(scopePressure?.ownerAreas) ?
    scopePressure.ownerAreas.length : 0;
  const changeBytes = Number.isInteger(scopePressure?.changedBytes) ?
    scopePressure.changedBytes : 0;
  return {
    terminal: fileCount > SCOPE_PRESSURE_FILE_LIMIT ||
      ownerCount > SCOPE_PRESSURE_OWNER_LIMIT ||
      changeBytes > SCOPE_PRESSURE_BYTE_LIMIT,
    fileCount,
    ownerCount,
    changeBytes,
  };
}

// rr-G: the harness has stopped measuring. A run that did not measure the system under
// test (harness connectivity/system failure, or an otherwise incomplete run) is recorded
// as an invalid sample with a null metric. When the most recent frontier samples are a run
// of such invalid samples, the harness — not the system — is the thing that is broken, and
// continuing to edit source only chases noise. This counts the trailing run of consecutive
// non-measuring frontier samples (newest-first, stopping at the first valid measurement)
// so the call site can route to "fix the harness" once it crosses the park threshold.
//
// A sample is non-measuring if it is flagged invalidSample, carries no real metric, OR its
// verdictReason is a known non-measuring reason. The last clause makes the detector
// self-healing: samples mis-recorded as valid before the verdict-reason classification fix
// (invalidSample:false with a phantom metric but a harness-connectivity verdictReason) are
// still recognised as non-measuring, so a tail of such legacy samples parks on restart
// instead of masquerading as a measured result.
//
// Returns:
//   consecutive - number of trailing non-measuring frontier samples
//   notMeasuring- true once that run reaches HARNESS_NONMEASURING_PARK_THRESHOLD
export function harnessNotMeasuringStatus(log, frontierId = null) {
  let consecutive = 0;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const event = log[i];
    if (frontierId && event.frontier !== frontierId) continue;
    const isFrontierSample =
      event.type === EVENT_ATTEMPT ||
      event.type === EVENT_NON_MEASUREMENT ||
      (event.type === EVENT_EVIDENCE_INGESTED && isFrontierProbeEvent(event));
    if (!isFrontierSample) continue;
    const verdictReason = event.verdictReason ||
      (event.current && event.current.verdictReason) || null;
    const nonMeasuringVerdict = NON_MEASURING_VERDICT_REASONS.includes(verdictReason);
    const measuring = event.type !== EVENT_NON_MEASUREMENT &&
      !nonMeasuringVerdict &&
      event.invalidSample !== true && event.metric !== null &&
      !(event.type === EVENT_ATTEMPT && event.metricAfter === null &&
        event.metricBefore === null);
    if (measuring) break;
    consecutive += 1;
  }
  return {
    consecutive,
    notMeasuring: consecutive >= HARNESS_NONMEASURING_PARK_THRESHOLD,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// rr-H: the artifact-class key that identifies "the same live gate" across quests. Two
// quests belong to the same class when their sealed doneWhen drives the same probe against
// the same named scenario; statement wording, oracle file paths, and consecutive targets
// are deliberately excluded so the key survives per-quest re-phrasings. Quests whose
// doneWhen has no scenario (oracle-file process quests etc.) have no chain key and never
// participate in a chain.
export function questChainArtifactKey(quest) {
  const probe = quest?.doneWhen?.probe;
  const scenario = quest?.doneWhen?.args?.scenario;
  return probe && scenario ? `${probe}:${scenario}` : null;
}

// rr-H: depth of the parent-linked quest chain that is stuck on one live-gate artifact
// class. `chainRows` is the ordered chain (the quest under evaluation first, then its
// links.parentQuest ancestors), each row a pure projection:
//   {id, artifactKey, open, solved, solvedAtMs}
// A row extends the chain when it shares the head row's artifact class AND is either
// still open or was SOLVED within the rolling window — the observed whack-a-mole
// signature closes each quest as it spawns the next, so an open-only count would sit at
// depth 1-2 while the real chain runs 5-6 deep. The count stops at the first row that
// breaks class or recency, so healthy old history never accumulates. Like every guard
// detector this is a pure signal; the policy (an altitude-reflection trigger, never a
// gate or park) lives at the call sites behind CONVERGENCE_GUARDS.chainDepth.
export function questChainDepthStatus(chainRows, options = {}) {
  const budget = Number.isInteger(options.budget) ?
    options.budget : QUEST_CHAIN_DEPTH_BUDGET;
  const windowMs = Number.isFinite(options.windowMs) ?
    options.windowMs : QUEST_CHAIN_WINDOW_DAYS * DAY_MS;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const rows = Array.isArray(chainRows) ? chainRows : [];
  const artifactKey = rows.length > 0 ? rows[0].artifactKey || null : null;
  if (!artifactKey) {
    return {depth: 0, exceeded: false, chainIds: [], artifactKey: null};
  }
  const chainIds = [];
  for (const row of rows) {
    if (!row || row.artifactKey !== artifactKey) break;
    const solvedRecently = row.solved === true &&
      Number.isFinite(row.solvedAtMs) && nowMs - row.solvedAtMs <= windowMs;
    if (row.open !== true && !solvedRecently) break;
    chainIds.push(row.id);
  }
  return {
    depth: chainIds.length,
    exceeded: chainIds.length >= budget,
    chainIds,
    artifactKey,
  };
}
