// Append-only event store for the solver.
//
// The log (`solve/log/<questId>.ndjson`) is the source of truth: one JSON event per
// line, never rewritten. Derived state (`solve/state/<questId>.json`) is a pure fold
// over the log and can be deleted and rebuilt at any time, which keeps the solver
// crash-safe and auditable.

import fs from 'node:fs';
import path from 'node:path';

import {
  SOLVE_DATA_DIR,
  QUESTS_SUBDIR,
  LOG_SUBDIR,
  STATE_SUBDIR,
  EVENT_ATTEMPT,
  EVENT_NON_MEASUREMENT,
  EVENT_SOLVED,
  EVENT_PARK,
  EVENT_FRONTIER_REOPENED,
  EVENT_QUEST,
  EVENT_FINDING,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_RESULT,
  EVENT_THEORY_SELECTED,
  EVENT_THEORY_SUPERSEDED,
  EVENT_THEORY_SYSTEM_DECLARED,
  EVENT_EVIDENCE_INGESTED,
  EVENT_GUARD_OVERRIDE,
  EVENT_REFLECTION,
  STATUS_OPEN,
  STATUS_SOLVED,
  STATUS_PARKED,
  PARK_KIND_EXHAUSTED,
  OSCILLATION_REOPEN_BUDGET,
  FIRST_RUNG_INDEX,
  THEORY_RESULT_ACTIVE,
  THEORY_RESULT_SUPERSEDED,
  THEORY_SCOPE_FRONTIER,
  THEORY_SCOPE_SYSTEM,
} from './constants.js';
import {isFrontierProbeEvent} from './probe-spec.js';

const UNKNOWN_METRIC = '?';

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

// A quest id becomes a filename, so it must be a single safe path segment. Reject path
// separators and traversal sequences to prevent writing/reading outside solve/.
const SAFE_GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeQuestId(questId) {
  if (typeof questId !== 'string' || !SAFE_GOAL_ID.test(questId) ||
    questId.includes('..')) {
    throw new Error(
      `invalid quest id "${questId}": use letters, digits, '.', '_', '-' ` +
      '(no path separators or "..")');
  }
  return questId;
}

export function questFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, QUESTS_SUBDIR,
    `${assertSafeQuestId(questId)}.json`);
}

export function logFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, LOG_SUBDIR,
    `${assertSafeQuestId(questId)}.ndjson`);
}

export function stateFilePath(root, questId) {
  return path.join(root, SOLVE_DATA_DIR, STATE_SUBDIR,
    `${assertSafeQuestId(questId)}.json`);
}

export function loadQuest(root, questId) {
  const file = questFilePath(root, questId);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveQuest(root, quest) {
  const file = questFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(quest, null, 2)}\n`);
  return file;
}

export function appendEvent(root, questId, event) {
  const file = logFilePath(root, questId);
  ensureDir(path.dirname(file));
  const stamped = {ts: new Date().toISOString(), ...event};
  fs.appendFileSync(file, `${JSON.stringify(stamped)}\n`);
  return stamped;
}

export function readLog(root, questId) {
  const file = logFilePath(root, questId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function initialFrontierState(frontier) {
  return {
    id: frontier.id,
    status: STATUS_OPEN,
    rungIndex: FIRST_RUNG_INDEX,
    attempts: 0,
    nonMeasurements: 0,
    parkedCount: 0,
    reopenCount: 0,
    autoReopenCount: 0,
    parkKind: null,
    baseline: null,
    current: null,
    reason: null,
    findings: [],
  };
}

function applyAttempt(frontierState, event) {
  if (!frontierState) return;
  frontierState.attempts += 1;
  if (frontierState.baseline === null && event.metricBefore !== null) {
    frontierState.baseline = event.metricBefore;
  }
  if (event.metricAfter !== null && event.metricAfter !== undefined) {
    frontierState.current = event.metricAfter;
  }
  if (Number.isInteger(event.rungIndex)) {
    frontierState.rungIndex = event.rungIndex;
  }
}

function applyNonMeasurement(frontierState, event) {
  if (!frontierState) return;
  frontierState.nonMeasurements += 1;
  frontierState.reason =
    `measurement unavailable (retry ${event.retryOrdinal || UNKNOWN_METRIC})`;
}

function applySolved(frontier) {
  if (frontier) frontier.status = STATUS_SOLVED;
}

function applyPark(frontier, event) {
  if (!frontier) return;
  frontier.status = STATUS_PARKED;
  frontier.parkedCount += 1;
  frontier.parkKind = event.kind || PARK_KIND_EXHAUSTED;
  frontier.reason = event.reason || null;
}

// Reopen a parked frontier: return it to the first rung so the Solver re-enters it with
// fresh, honestly-measured attempts. parkedCount is preserved as history (the scheduler
// still de-prioritizes a frequently-parked frontier), reopenCount is incremented so the
// reopen bound can refuse to oscillate against a never-measuring park, the cleared
// parkKind reflects that the frontier is no longer parked, and the reason is recorded.
function applyReopen(frontier, event) {
  if (!frontier) return;
  if (frontier.status !== STATUS_PARKED) return;
  frontier.status = STATUS_OPEN;
  frontier.rungIndex = FIRST_RUNG_INDEX;
  frontier.reopenCount += 1;
  frontier.parkKind = null;
  frontier.reason = event.reason || null;
}

function applyFinding(frontier, event) {
  if (!frontier) return;
  frontier.findings.push({
    claim: event.claim || null,
    kind: event.kind || null,
    evidence: event.evidence || null,
    rulesOut: event.rulesOut || null,
    regressionClassification: event.regressionClassification || null,
    scopePressureClassification: event.scopePressureClassification || null,
    ts: event.ts || null,
  });
}

function applyEvidenceIngested(frontierState, event) {
  if (!frontierState) return;
  if (!isFrontierProbeEvent(event)) return;
  if (event.metric !== undefined && event.metric !== null) {
    frontierState.current = event.metric;
  }
  if (event.done === false &&
    event.invalidSample !== true &&
    frontierState.status === STATUS_SOLVED) {
    // Oscillation bound: a frontier that has already auto-reopened
    // OSCILLATION_REOPEN_BUDGET times keeps solving on a single-run gradient zero and
    // re-failing the quest's stricter consecutive bar. Stop chasing the flap — leave it
    // SOLVED so the scheduler finds no open frontier and the quest terminalizes as
    // EXHAUSTED rather than looping forever. The frontier stays SOLVED (its gradient really
    // did reach zero); recovery is quest-level — the loop still re-checks doneWhen each
    // cycle, so a later run that holds the consecutive bar closes it honestly.
    if (frontierState.autoReopenCount >= OSCILLATION_REOPEN_BUDGET) {
      frontierState.reason =
        'oscillation reopen budget exhausted: gradient zero reached but the ' +
        'consecutive-pass bar never held';
      return;
    }
    frontierState.status = STATUS_OPEN;
    frontierState.autoReopenCount += 1;
    frontierState.reason = 'fresh measured evidence no longer satisfies frontier';
  }
}

function emptyTheoryState() {
  return {
    system: [],
    frontier: [],
    selectedByFrontier: {},
    byId: {},
  };
}

function addTheory(theories, event, scope) {
  if (!event.theory) return;
  const theory = {
    id: event.theory,
    scope,
    frontier: event.frontier || null,
    layer: event.layer || null,
    mechanism: event.mechanism || null,
    problem: event.problem || null,
    intervention: event.intervention || null,
    owner: event.owner || event.decidingOwner || null,
    boundary: event.boundary || null,
    callerRole: event.callerRole || null,
    missingTransition: event.missingTransition ||
      event.missingTransitionOrObservation ||
      null,
    ownedFixPath: event.ownedFixPath || null,
    tailConsumers: event.tailConsumers || [],
    discriminator: event.discriminator || null,
    expectedMovement: event.expectedMovement || null,
    negativeResultMeans: event.negativeResultMeans || null,
    evidence: event.evidence || null,
    modelGuidance: event.modelGuidance || null,
    status: event.status || THEORY_RESULT_ACTIVE,
    archive: event.archive === true,
    card: event.card || null,
    ts: event.ts || null,
    results: [],
    supersedes: event.supersedes || null,
    supersededBy: null,
  };
  theories.byId[theory.id] = theory;
  if (scope === THEORY_SCOPE_SYSTEM) {
    theories.system.push(theory);
  } else {
    theories.frontier.push(theory);
  }
}

function applyTheorySelection(theories, event) {
  const theory = theories.byId[event.theory];
  if (!theory || theory.archive || theory.scope !== THEORY_SCOPE_FRONTIER) return;
  if (event.frontier && theory.frontier === event.frontier) {
    theories.selectedByFrontier[event.frontier] = event.theory;
  }
}

function applyTheoryResult(theories, event) {
  const theory = theories.byId[event.theory];
  if (!theory) return;
  const result = {
    result: event.result || null,
    scenarioOutcome: event.scenarioOutcome || null,
    theoryOutcome: event.theoryOutcome || null,
    blockerMovement: event.blockerMovement || null,
    diagnosticMovement: event.diagnosticMovement || null,
    evidence: event.evidence || null,
    validation: event.validation || null,
    attemptFrontier: event.frontier || null,
    ts: event.ts || null,
  };
  theory.results.push(result);
  if (event.result) theory.status = event.result;
}

function applyTheorySuperseded(theories, event) {
  const theory = theories.byId[event.theory];
  if (!theory) return;
  theory.status = THEORY_RESULT_SUPERSEDED;
  theory.supersededBy = event.by || null;
  theory.results.push({
    result: THEORY_RESULT_SUPERSEDED,
    evidence: event.evidence || null,
    validation: null,
    attemptFrontier: event.frontier || null,
    ts: event.ts || null,
  });
}

const FRONTIER_HANDLERS = {
  [EVENT_ATTEMPT]: applyAttempt,
  [EVENT_NON_MEASUREMENT]: applyNonMeasurement,
  [EVENT_SOLVED]: applySolved,
  [EVENT_PARK]: applyPark,
  [EVENT_FRONTIER_REOPENED]: applyReopen,
  [EVENT_FINDING]: applyFinding,
  [EVENT_EVIDENCE_INGESTED]: applyEvidenceIngested,
};

// Fold the append-only log into the current projected state. Pure given the log.
export function projectState(quest, log) {
  const frontiers = new Map(
    quest.frontiers.map((f) => [f.id, initialFrontierState(f)]),
  );
  const questState = {status: STATUS_OPEN, evidence: null};
  const theories = emptyTheoryState();
  for (const event of log) {
    if (event.type === EVENT_QUEST) {
      questState.status = event.status;
      questState.evidence = event.evidence || null;
      continue;
    }
    const handler = FRONTIER_HANDLERS[event.type];
    if (handler) handler(event.frontier ? frontiers.get(event.frontier) : null, event);
    if (event.type === EVENT_THEORY_SYSTEM_DECLARED) {
      addTheory(theories, event, THEORY_SCOPE_SYSTEM);
    } else if (event.type === EVENT_THEORY_OPTION_DECLARED) {
      addTheory(theories, event, THEORY_SCOPE_FRONTIER);
    } else if (event.type === EVENT_THEORY_SELECTED) {
      applyTheorySelection(theories, event);
    } else if (event.type === EVENT_THEORY_RESULT) {
      applyTheoryResult(theories, event);
    } else if (event.type === EVENT_THEORY_SUPERSEDED) {
      applyTheorySuperseded(theories, event);
    }
  }
  return {
    questId: quest.id,
    questStatus: questState.status,
    questEvidence: questState.evidence,
    frontiers: [...frontiers.values()],
    theories,
  };
}

// Monotonic high-water mark of satisfied sub-invariants for a frontier: the union of
// every `satisfiedInvariants` set recorded on a measured attempt or ingested-evidence
// event. Used to detect silent regression — a later measured attempt that no longer
// satisfies a label present here has re-broken a previously-green invariant.
export function invariantHighWater(log, frontierId = null) {
  const set = new Set();
  for (const event of log) {
    if (frontierId && event.frontier !== frontierId) continue;
    const measured =
      (event.type === EVENT_ATTEMPT && event.invalidSample !== true) ||
      (event.type === EVENT_EVIDENCE_INGESTED &&
        isFrontierProbeEvent(event) &&
        typeof event.metric === 'number');
    if (!measured) continue;
    const labels = Array.isArray(event.satisfiedInvariants) ?
      event.satisfiedInvariants : [];
    for (const label of labels) {
      if (label) set.add(label);
    }
  }
  return [...set];
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
  const highWater = new Set();
  const history = [];
  for (const event of log) {
    if (frontierId && event.frontier !== frontierId) continue;
    const measured =
      (event.type === EVENT_ATTEMPT && event.invalidSample !== true) ||
      (event.type === EVENT_EVIDENCE_INGESTED &&
        isFrontierProbeEvent(event) &&
        typeof event.metric === 'number');
    if (!measured) continue;
    const green = new Set(
      (Array.isArray(event.satisfiedInvariants) ? event.satisfiedInvariants : [])
        .filter(Boolean),
    );
    for (const label of green) highWater.add(label);
    const red = [...highWater].filter((label) => !green.has(label));
    history.push({ts: event.ts || null, green: [...green], red});
  }
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const currentGreen = latest ? latest.green : [];
  const currentRed = latest ? latest.red : [];
  const prevGreen = new Set(previous ? previous.green : []);
  const latestGreen = new Set(currentGreen);
  const regressedThisRun = previous ?
    [...prevGreen].filter((label) => !latestGreen.has(label)) : [];
  const restoredThisRun = previous ?
    [...latestGreen].filter((label) => !prevGreen.has(label)) : [];
  return {
    frontier: frontierId,
    greenHighWater: [...highWater],
    currentGreen,
    currentRed,
    regressedThisRun,
    restoredThisRun,
    history,
  };
}

export function rebuildState(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const file = stateFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

// Append a durable finding for a frontier and return the stamped event. Append-only,
// like every other event: findings are never edited or removed, only superseded by
// later ones.
export function appendFinding(root, questId, finding) {
  return appendEvent(root, questId, {
    type: EVENT_FINDING,
    frontier: finding.frontier,
    claim: finding.claim,
    // kind: optional machine-readable tag ('repro-on-head', 'inherited-rulesout', ...)
    // so advisories and dossiers can key off a finding class without parsing claims.
    kind: finding.kind || null,
    evidence: finding.evidence || null,
    rulesOut: finding.rulesOut || null,
    regressionClassification: finding.regressionClassification || null,
    scopePressureClassification: finding.scopePressureClassification || null,
  });
}

// Read all findings recorded for one frontier, oldest first.
export function readFindings(root, questId, frontierId) {
  return readLog(root, questId)
    .filter((e) => e.type === EVENT_FINDING && e.frontier === frontierId)
    .map((e) => ({
      claim: e.claim || null,
      kind: e.kind || null,
      evidence: e.evidence || null,
      rulesOut: e.rulesOut || null,
      ts: e.ts || null,
    }));
}

// Read every finding that rules a lever out, across all frontiers of one quest.
// Used to inherit a lineage's dead levers into a successor quest and to print
// them in the retread check; bounded to one quest's log, never a corpus scan.
export function readRulesOutFindings(root, questId) {
  return readLog(root, questId)
    .filter((e) => e.type === EVENT_FINDING && e.rulesOut)
    .map((e) => ({
      frontier: e.frontier || null,
      claim: e.claim || null,
      kind: e.kind || null,
      evidence: e.evidence || null,
      rulesOut: e.rulesOut,
      ts: e.ts || null,
    }));
}

// Record a recorded-reason override of an overridable soft guard. The reason is mandatory
// and must be non-empty: an override without a falsifiable justification is meaningless and
// is refused at the boundary so the log never carries a blank escape hatch.
export function appendGuardOverride(root, questId, override) {
  const reason = typeof override.reason === 'string' ? override.reason.trim() : '';
  if (!reason) {
    throw new Error('guard override requires a non-empty --reason');
  }
  if (typeof override.code !== 'string' || !override.code.trim()) {
    throw new Error('guard override requires a --code (the guard being overridden)');
  }
  return appendEvent(root, questId, {
    type: EVENT_GUARD_OVERRIDE,
    frontier: override.frontier || null,
    code: override.code,
    problem: typeof override.problem === 'string' ? override.problem : null,
    reason,
  });
}

// Record a step-back reflection turn (a free-form reframing note). The note may be null
// when the executor declined to produce one; the event still resets the reflection cadence
// so the loop does not re-request a reflection every cycle.
export function appendReflection(root, questId, reflection) {
  return appendEvent(root, questId, {
    type: EVENT_REFLECTION,
    frontier: reflection.frontier || null,
    trigger: reflection.trigger || null,
    kind: reflection.kind === 'altitude' ? 'altitude' : 'micro',
    note: typeof reflection.note === 'string' && reflection.note.trim() ?
      reflection.note.trim() :
      null,
  });
}
