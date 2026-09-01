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
  EVENT_GATE_DECISION,
  EVENT_REFLECTION,
  SAME_GUARD_OVERRIDE_LIMIT,
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

const DONE_WHEN_PROBE_SCOPE = 'doneWhen';
import {isFrontierProbeEvent} from './probe-spec.js';

export {invariantHighWater, projectInvariantLedger} from './invariant-ledger.js';

const LOCAL_STR_OWNED_001 = 'exact terminal source attempt was rejected';

const UNKNOWN_METRIC = '?';
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const VERIFICATION_SCOPE_ATTEMPT = 'attempt';
const VERIFICATION_SCOPE_CANDIDATE = 'candidate';
const VERIFICATION_VERDICT_REJECTED = 'rejected';
const VERIFICATION_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const VERIFIER_EVIDENCE_PATTERN =
  /^subagent:[A-Za-z0-9][A-Za-z0-9_./-]*$/u;
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFindLastIndex = Function.call.bind(Array.prototype.findLastIndex);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const numberIsInteger = Number.isInteger;
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const MapConstructor = Map;
const SetConstructor = Set;

function isStructuredVerifierRejection(event) {
  const versionOneAttempt = event.verification?.schemaVersion === 1 &&
    event.verification?.scope === VERIFICATION_SCOPE_ATTEMPT;
  const versionTwoCandidate = event.verification?.schemaVersion === 2 &&
    event.verification?.scope === VERIFICATION_SCOPE_CANDIDATE &&
    regExpTest(/^[0-9a-f]{40}$/u, String(event.verification?.baseCommit || '')) &&
    arrayIsArray(event.verification?.paths) &&
    numberIsInteger(event.verification?.lastAttemptIndex);
  return event?.type === EVENT_FINDING &&
    event.kind === VERIFIER_REJECTION_FINDING_KIND &&
    (versionOneAttempt || versionTwoCandidate) &&
    event.verification?.verdict === VERIFICATION_VERDICT_REJECTED &&
    regExpTest(VERIFICATION_FINGERPRINT_PATTERN,
      String(event.verification?.fingerprint || ''),
    ) &&
    regExpTest(VERIFIER_EVIDENCE_PATTERN, String(event.evidence || ''));
}

export function boundVerifierRejectionEvents(log) {
  const contractedAttemptKeys = new SetConstructor();
  const boundRejections = new SetConstructor();
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    const fingerprint = `sha256:${event.changeRefIdentity?.sha256 || ''}`;
    const key = `${event.frontier || ''}\n${fingerprint}`;
    if (event.type === EVENT_ATTEMPT &&
        event.verificationContractVersion === 1 &&
        regExpTest(VERIFICATION_FINGERPRINT_PATTERN, fingerprint)) {
      setAdd(contractedAttemptKeys, key);
      continue;
    }
    if (isStructuredVerifierRejection(event)) {
      if (event.verification.schemaVersion === 2 &&
        event.verification.lastAttemptIndex < index) {
        setAdd(boundRejections, event);
        continue;
      }
      const rejectionKey = `${event.frontier || ''}\n` +
        event.verification.fingerprint;
      if (setHas(contractedAttemptKeys, rejectionKey)) {
        setAdd(boundRejections, event);
      }
    }
  }
  return boundRejections;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

// A quest id becomes a filename, so it must be a single safe path segment. Reject path
// separators and traversal sequences to prevent writing/reading outside solve/.
const SAFE_GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertSafeQuestId(questId) {
  if (typeof questId !== 'string' || !regExpTest(SAFE_GOAL_ID, questId) ||
    stringIncludes(questId, '..')) {
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
  return jsonParse(fs.readFileSync(file, 'utf8'));
}

// Replace a whole file atomically.
//
// Quest and state files are truncate-then-write, but every cross-Quest projection
// (buildFrontier -> buildPortfolio -> loadAllQuests) reads ALL of them. A reader that
// caught a mid-write file got a truncated JSON document and threw — id-scoped writes
// are only safe from each other, not from the readers that sweep every id. rename(2)
// is atomic within a filesystem, so a reader sees the old document or the new one.
function writeFileAtomic(file, contents) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, file);
}

export function saveQuest(root, quest) {
  const file = questFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, `${jsonStringify(quest, null, 2)}\n`);
  return file;
}

export function appendEvent(root, questId, event) {
  const file = logFilePath(root, questId);
  ensureDir(path.dirname(file));
  const stamped = {ts: dateToISOString(new Date()), ...event};
  fs.appendFileSync(file, `${jsonStringify(stamped)}\n`);
  return stamped;
}

export function readLog(root, questId) {
  const file = logFilePath(root, questId);
  if (!fs.existsSync(file)) return [];
  const lines = stringSplit(fs.readFileSync(file, 'utf8'), '\n');
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (stringTrim(lines[index]).length > 0) {
      arrayPush(events, jsonParse(lines[index]));
    }
  }
  return events;
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
  if (numberIsInteger(event.rungIndex)) {
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

function applyFinding(frontier, event, reopensTerminal = false) {
  if (!frontier) return;
  arrayPush(frontier.findings, {
    claim: event.claim || null,
    kind: event.kind || null,
    evidence: event.evidence || null,
    rulesOut: event.rulesOut || null,
    verification: event.verification || null,
    regressionClassification: event.regressionClassification || null,
    scopePressureClassification: event.scopePressureClassification || null,
    ts: event.ts || null,
  });
  if (
    reopensTerminal &&
    (frontier.status === STATUS_SOLVED || frontier.status === STATUS_PARKED)
  ) {
    frontier.status = STATUS_OPEN;
    frontier.parkKind = null;
    frontier.reason = LOCAL_STR_OWNED_001;
  }
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
    arrayPush(theories.system, theory);
  } else {
    arrayPush(theories.frontier, theory);
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
  arrayPush(theory.results, result);
  if (event.result) theory.status = event.result;
}

function applyTheorySuperseded(theories, event) {
  const theory = theories.byId[event.theory];
  if (!theory) return;
  theory.status = THEORY_RESULT_SUPERSEDED;
  theory.supersededBy = event.by || null;
  arrayPush(theory.results, {
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

const THEORY_HANDLERS = {
  [EVENT_THEORY_SYSTEM_DECLARED]: (theories, event) =>
    addTheory(theories, event, THEORY_SCOPE_SYSTEM),
  [EVENT_THEORY_OPTION_DECLARED]: (theories, event) =>
    addTheory(theories, event, THEORY_SCOPE_FRONTIER),
  [EVENT_THEORY_SELECTED]: applyTheorySelection,
  [EVENT_THEORY_RESULT]: applyTheoryResult,
  [EVENT_THEORY_SUPERSEDED]: applyTheorySuperseded,
};

// Findings carry the bound-rejection flag every other frontier handler lacks,
// so they dispatch separately from the FRONTIER_HANDLERS table.
function applyFrontierEvent(frontiers, event, reopensTerminal) {
  const frontier = event.frontier ? mapGet(frontiers, event.frontier) : null;
  if (event.type === EVENT_FINDING) {
    applyFinding(frontier, event, reopensTerminal);
    return;
  }
  const handler = FRONTIER_HANDLERS[event.type];
  if (handler) handler(frontier, event);
}

function applyTheoryEvent(theories, event) {
  const handler = THEORY_HANDLERS[event.type];
  if (handler) handler(theories, event);
}

function reopenQuestState(questState, event) {
  questState.status = STATUS_OPEN;
  questState.evidence = event.evidence || null;
}

function applyQuestStateEvent(questState, event, reopensTerminal = false) {
  switch (event.type) {
  case EVENT_QUEST:
    questState.status = event.status;
    questState.evidence = event.evidence || null;
    return true;
  case EVENT_EVIDENCE_INGESTED:
    if (event.probeScope === DONE_WHEN_PROBE_SCOPE &&
        event.invalidSample !== true && event.done === false) {
      reopenQuestState(questState, event);
    }
    return false;
  case EVENT_FINDING:
    if (reopensTerminal) {
      reopenQuestState(questState, event);
    }
    return false;
  default:
    return false;
  }
}

// Fold the append-only log into the current projected state. Pure given the log.
export function projectState(quest, log) {
  const frontiers = new MapConstructor();
  const frontierEntries = arrayMap(
    quest.frontiers, (frontier) => [frontier.id, initialFrontierState(frontier)]);
  for (let index = 0; index < frontierEntries.length; index += 1) {
    mapSet(frontiers, frontierEntries[index][0], frontierEntries[index][1]);
  }
  const questState = {status: STATUS_OPEN, evidence: null};
  const theories = emptyTheoryState();
  const boundRejections = boundVerifierRejectionEvents(log);
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    const reopensTerminal = setHas(boundRejections, event);
    if (applyQuestStateEvent(
      questState,
      event,
      reopensTerminal,
    )) continue;
    applyFrontierEvent(frontiers, event, reopensTerminal);
    applyTheoryEvent(theories, event);
  }
  const projectedFrontiers = [];
  mapForEach(frontiers, (frontier) => arrayPush(projectedFrontiers, frontier));
  return {
    questId: quest.id,
    questStatus: questState.status,
    questEvidence: questState.evidence,
    frontiers: projectedFrontiers,
    theories,
  };
}

export function rebuildState(root, quest) {
  const log = readLog(root, quest.id);
  const state = projectState(quest, log);
  const file = stateFilePath(root, quest.id);
  ensureDir(path.dirname(file));
  writeFileAtomic(file, `${jsonStringify(state, null, 2)}\n`);
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
    verification: finding.verification || null,
    regressionClassification: finding.regressionClassification || null,
    scopePressureClassification: finding.scopePressureClassification || null,
  });
}

// Read all findings recorded for one frontier, oldest first.
export function readFindings(root, questId, frontierId) {
  return arrayMap(arrayFilter(readLog(root, questId),
    (event) => event.type === EVENT_FINDING && event.frontier === frontierId),
  (event) => ({
    claim: event.claim || null,
    kind: event.kind || null,
    evidence: event.evidence || null,
    rulesOut: event.rulesOut || null,
    verification: event.verification || null,
    ts: event.ts || null,
  }));
}

// Read every finding that rules a lever out, across all frontiers of one quest.
// Used to inherit a lineage's dead levers into a successor quest and to print
// them in the retread check; bounded to one quest's log, never a corpus scan.
export function readRulesOutFindings(root, questId) {
  return arrayMap(arrayFilter(readLog(root, questId),
    (event) => event.type === EVENT_FINDING && event.rulesOut),
  (event) => ({
    frontier: event.frontier || null,
    claim: event.claim || null,
    kind: event.kind || null,
    evidence: event.evidence || null,
    rulesOut: event.rulesOut,
    ts: event.ts || null,
  }));
}

// A scope signature is the sorted set of paths an override authorized, derived from
// the real change artifact — never from operator prose, so it cannot be self-declared.
// Re-authorizing a signature already covered by an earlier override on the same guard
// is a REPETITION, not scope GROWTH, and must not spend lifetime budget.
export function scopeSignatureOf(changedPaths) {
  if (!arrayIsArray(changedPaths) || changedPaths.length === 0) return null;
  const unique = [];
  for (let index = 0; index < changedPaths.length; index += 1) {
    const item = changedPaths[index];
    if (typeof item === 'string' && item.length > 0 &&
      !arrayIncludes(unique, item)) arrayPush(unique, item);
  }
  arraySort(unique);
  return unique.length > 0 ? unique : null;
}

function signatureIsCoveredBy(candidate, authorized) {
  if (!arrayIsArray(candidate) || !arrayIsArray(authorized)) return false;
  for (let index = 0; index < candidate.length; index += 1) {
    if (!arrayIncludes(authorized, candidate[index])) return false;
  }
  return true;
}

export function scopeSignatureHasAuthorization(
  log,
  frontier,
  code,
  changedPaths,
) {
  const candidate = scopeSignatureOf(changedPaths);
  if (!candidate) return false;
  return arraySome(log, (event) =>
    (event.type === EVENT_GUARD_OVERRIDE ||
      (event.type === EVENT_GATE_DECISION && Boolean(event.override))) &&
    (event.frontier || null) === (frontier || null) &&
    event.code === code &&
    signatureIsCoveredBy(candidate, event.scopeSignature));
}

export function introducedScopePaths(log, frontier, code, changedPaths) {
  const candidate = scopeSignatureOf(changedPaths) || [];
  const authorized = [];
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    const authorizesScope = event.type === EVENT_GUARD_OVERRIDE ||
      (event.type === EVENT_GATE_DECISION && Boolean(event.override));
    if (!authorizesScope ||
      (event.frontier || null) !== (frontier || null) ||
      event.code !== code || !arrayIsArray(event.scopeSignature)) continue;
    for (let pathIndex = 0; pathIndex < event.scopeSignature.length; pathIndex += 1) {
      const filePath = event.scopeSignature[pathIndex];
      if (!arrayIncludes(authorized, filePath)) arrayPush(authorized, filePath);
    }
  }
  return arrayFilter(candidate, (filePath) => !arrayIncludes(authorized, filePath));
}

function scopeAuthorizationWindow(log) {
  const index = arrayFindLastIndex(log, (event) =>
    event.type === EVENT_ATTEMPT && event.progressed === true);
  return arraySlice(log, index + 1);
}

function matchingScopeOverride(event, frontier, code, candidate, problem) {
  return event.type === EVENT_GUARD_OVERRIDE &&
    (event.frontier || null) === (frontier || null) &&
    event.code === code &&
    signatureIsCoveredBy(candidate, event.scopeSignature) &&
    (!event.problem || stringIncludes(String(problem), event.problem));
}

function consumedScopeOverride(event, frontier, code) {
  return event.type === EVENT_GATE_DECISION && event.override &&
    (event.frontier || null) === (frontier || null) && event.code === code;
}

export function scopeSignatureNeedsReauthorization(
  log,
  frontier,
  code,
  changedPaths,
  problem,
) {
  if (!scopeSignatureHasAuthorization(
    log, frontier, code, changedPaths)) return false;
  const candidate = scopeSignatureOf(changedPaths);
  const window = scopeAuthorizationWindow(log);
  const matchingOverrides = arrayFilter(window, (event) =>
    matchingScopeOverride(event, frontier, code, candidate, problem)).length;
  const consumed = arrayFilter(window, (event) =>
    consumedScopeOverride(event, frontier, code)).length;
  return matchingOverrides <= consumed;
}

// Record a recorded-reason override of an overridable soft guard. The reason is mandatory
// and must be non-empty: an override without a falsifiable justification is meaningless and
// is refused at the boundary so the log never carries a blank escape hatch. Same-guard
// overrides are further capped per (frontier, code) by SAME_GUARD_OVERRIDE_LIMIT over the
// quest's whole life — see the constant's rationale.
//
// The cap exists to catch a quest whose scope keeps GROWING. It must not charge for
// re-authorizing an unchanged candidate: the scope analyzer unions all prior attempts,
// so once attempt 1 is a large atomic cutover the guard necessarily re-fires on every
// later attempt, including a byte-identical re-submission forced by a voided receipt or
// a verifier-required repair. Charging those consumed a real Quest's entire lifetime
// budget on 2026-07-24 and parked verified work with nothing left to spend. So an
// override whose scope signature is covered by an already-authorized one is recorded as
// a free re-authorization; anything that reaches a NEW path is charged as before.
export function appendGuardOverride(root, questId, override) {
  const reason = typeof override.reason === 'string' ?
    stringTrim(override.reason) : '';
  if (!reason) {
    throw new Error('guard override requires a non-empty --reason');
  }
  if (typeof override.code !== 'string' || !stringTrim(override.code)) {
    throw new Error('guard override requires a --code (the guard being overridden)');
  }
  const frontier = override.frontier || null;
  const scopeSignature = scopeSignatureOf(override.scopeSignature);
  const sameGuard = arrayFilter(readLog(root, questId), (event) =>
    event.type === EVENT_GUARD_OVERRIDE &&
    (event.frontier || null) === frontier &&
    event.code === override.code);
  const reauthorizes = scopeSignature !== null && arraySome(sameGuard, (event) =>
    signatureIsCoveredBy(scopeSignature, event.scopeSignature));
  const priorSameGuard = arrayFilter(sameGuard,
    (event) => event.scopeReauthorization !== true).length;
  if (!reauthorizes && priorSameGuard >= SAME_GUARD_OVERRIDE_LIMIT) {
    throw new Error(
      `guard override refused: ${override.code} has already been overridden ` +
      `${priorSameGuard} times on frontier ${frontier || '<none>'} ` +
      `(limit ${SAME_GUARD_OVERRIDE_LIMIT}). A guard that keeps firing is ` +
      'diagnosing a mis-scoped quest — re-scope instead of overriding again: ' +
      'split the candidate into a narrower quest, park the frontier, or ' +
      'author a successor quest for the remainder.');
  }
  return appendEvent(root, questId, {
    type: EVENT_GUARD_OVERRIDE,
    frontier: override.frontier || null,
    code: override.code,
    problem: typeof override.problem === 'string' ? override.problem : null,
    reason,
    scopeSignature,
    scopeReauthorization: reauthorizes,
  });
}

// Remaining lifetime override budget for (frontier, code): the limit minus the
// CHARGED overrides on record (scope re-authorizations are free). Single owner
// of the budget arithmetic appendGuardOverride enforces above, exported so the
// override verb can print the balance instead of the operator discovering it
// by exhausting it.
export function guardOverrideBudgetRemaining(root, questId, frontier, code) {
  const charged = arrayFilter(readLog(root, questId), (event) =>
    event.type === EVENT_GUARD_OVERRIDE &&
    (event.frontier || null) === (frontier || null) &&
    event.code === code &&
    event.scopeReauthorization !== true).length;
  return SAME_GUARD_OVERRIDE_LIMIT - charged;
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
    note: typeof reflection.note === 'string' && stringTrim(reflection.note) ?
      stringTrim(reflection.note) :
      null,
  });
}
