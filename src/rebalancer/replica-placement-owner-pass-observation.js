// Public entry: createPlacementObservation, beginPlacementPass, placementPassSnapshot, PLACEMENT_PASS_CHECKPOINT and the record functions.
// Required collaborators: none (the owner hands every fact it records).
// Durable authority / commit point: none - an observation, never an input to a decision.
// Permitted post-commit work: none.
// Recovery / wake entry: none (rebuilt empty with the owner).
// Representative production tests: test/rebalancer/placement-owner-authority-tenure.test.js.
//
// What the replica placement owner's passes did, the owner-side observation
// that makes its tenure contract assertable on a real node: each pass's
// sequence, triggers, tenure term, where it stopped, what it evaluated, waited
// on, checked and submitted; and cumulative totals. Stale work (a pass whose
// tenure ended, stopped at a checkpoint) and rejected attempts (fenced at the
// boundary, refused by the write kernel or the applier) are counted apart from
// proposals and admitted operations.
import {PLACEMENT_RESULT_FIELD} from '../partition/partition-placement-admission-constants.js';
import {isWriteOutcomeUnknown} from '../partition/partition-write-kernel.js';
import {PLACEMENT_OUTCOME} from './replica-placement-owner-constants.js';
import {PLACEMENT_DEFICIT_STATE} from './replica-placement-owner-deficits.js';

// Where a pass stopped (lastPassSnapshot.stoppedAt): a tenure checkpoint (the
// pass's tenure was no longer the ledger's live tenure there), the term-start
// barrier or the node authority (waits of a current tenure), COMPLETED, or
// ABORTED (the pass ended by an exception).
const PLACEMENT_PASS_CHECKPOINT = Object.freeze({
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
  PASS_START: 'PASS_START',
  TERM_START_BARRIER: 'TERM_START_BARRIER',
  AFTER_CENSUS: 'AFTER_CENSUS',
  NODE_AUTHORITY: 'NODE_AUTHORITY',
  BEFORE_HOLD_RELEASE: 'BEFORE_HOLD_RELEASE',
  AFTER_HOLD_RELEASE: 'A2_AFTER_HOLD_RELEASE',
  CANDIDATE: 'CANDIDATE',
  AFTER_REMOVE_ROWS: 'A3_AFTER_REMOVE_ROWS',
  AFTER_REMOVE_PROJECTION: 'A3_AFTER_REMOVE_PROJECTION',
  AFTER_REMOVE_FLOOR: 'A3_AFTER_REMOVE_FLOOR',
  AFTER_ADMISSIBILITY: 'A3_AFTER_ADMISSIBILITY',
  AFTER_ADMISSION: 'A4_AFTER_ADMISSION',
  AFTER_READMISSION: 'A4R_AFTER_READMISSION',
  AFTER_LEDGER_HOLD_RELEASE: 'A5_AFTER_LEDGER_HOLD_RELEASE',
});
const CHECKPOINT = PLACEMENT_PASS_CHECKPOINT;
// A pass's state before it reached the node authority.
const PLACEMENT_PASS_STATE = Object.freeze({STOPPED: 'STOPPED'});

const increment = (counts, key, by = 1) => {
  counts[key] = (counts[key] ?? 0) + by;
};

function createPlacementObservation() {
  return {passSequence: 0, totals: {passes: 0, completed: 0, waits: {}, staleStops: {},
    leadershipStartDrivesJoined: 0, constructions: 0, evaluated: 0, candidates: 0,
    capacityChecks: 0, proposals: 0, fenced: 0, admitted: 0, released: 0, refused: {},
    outcomeUnknown: 0, failedPasses: 0, failedCandidates: 0, leadershipStartDriveFailures: 0,
    localFailuresAfterAdmission: 0, uncertainCandidates: 0}};
}

function newPassRecord(observation, custody, sequence, triggers) {
  return {observation, custody, sequence, triggers: Object.freeze([...triggers]),
    tenureTerm: custody?.tenure?.term ?? null, state: PLACEMENT_PASS_STATE.STOPPED,
    stoppedAt: CHECKPOINT.RUNNING, stale: false, operationIds: [],
    evaluated: 0, candidates: 0, waiting: {}, capacityChecks: 0, proposals: 0, fenced: 0,
    refused: {}, failedCandidates: {}, localFailures: {}, uncertainCandidates: {}};
}

// An operation the pass admitted (kept also when the pass aborts later).
function recordAdmittedOperation(pass, operationId) {
  pass.operationIds.push(operationId);
}

// An admitted candidate whose later local step failed: the admission stands;
// the failure is recorded apart from failed candidates (the pass aborts).
function recordLocalFailureAfterAdmission(pass, partitionId, operationId, error) {
  pass.localFailures[partitionId] = Object.freeze({operationId,
    failure: String(error?.message ?? error)});
  pass.observation.totals.localFailuresAfterAdmission += 1;
}

// A candidate handed over with no answer known: its attempt stays retained
// for the uncertain-attempt reconciliation (the pass aborts).
function recordUncertainCandidate(pass, partitionId, error) {
  pass.uncertainCandidates[partitionId] = String(error?.message ?? error);
  pass.observation.totals.uncertainCandidates += 1;
}

/**
 * Begin the record of one pass of the custody it captured.
 * @param {Object} observation - The owner's observation.
 * @param {Object|null} custody - The tenure custody the pass runs under.
 * @param {Set<string>} triggers - The pass's triggers.
 * @return {Object} The pass record (the pass itself carries its custody).
 */
function beginPlacementPass(observation, custody, triggers) {
  observation.passSequence += 1;
  observation.totals.passes += 1;
  return newPassRecord(observation, custody, observation.passSequence, triggers);
}

// A submission outside a pass (submitAdmission): fenced and counted like one.
function directSubmissionRecord(observation, custody) {
  return newPassRecord(observation, custody, 0, []);
}

function markPassStale(pass, checkpoint) {
  if (pass.stale) return;
  pass.stale = true;
  pass.stoppedAt = checkpoint;
  increment(pass.observation.totals.staleStops, checkpoint);
}

function markPassWaiting(pass, checkpoint) {
  pass.stoppedAt = checkpoint;
  increment(pass.observation.totals.waits, checkpoint);
}

function recordLeadershipStartDriveJoined(pass) {
  pass.observation.totals.leadershipStartDrivesJoined += 1;
}

// A pass ended by an exception: its triggers are retained by the custody.
function recordPassFailure(pass, error) {
  pass.stoppedAt = CHECKPOINT.ABORTED;
  pass.failure = String(error?.message ?? error);
  pass.observation.totals.failedPasses += 1;
}

// A failure attributable to one candidate: recorded for its partition; the
// pass goes on with the other candidates.
function recordCandidateFailure(pass, partitionId, error) {
  pass.failedCandidates[partitionId] = String(error?.message ?? error);
  pass.observation.totals.failedCandidates += 1;
}

function recordLeadershipStartDriveFailure(observation) {
  observation.totals.leadershipStartDriveFailures += 1;
}

// The node authority's answer that stopped the pass (stoppedAt NODE_AUTHORITY).
function recordNodeAuthorityWait(pass, nodeInput) {
  pass.state = nodeInput.state;
  pass.nodeAnswer = nodeInput;
  markPassWaiting(pass, CHECKPOINT.NODE_AUTHORITY);
}

/**
 * The partitions a pass evaluated, the waits it found and its candidates.
 * @param {Object} pass - The pass record.
 * @param {Object} prepared - {evaluations, formationWaiting, ordered}.
 */
function recordPassEvaluations(pass, {evaluations, formationWaiting, ordered}) {
  const totals = pass.observation.totals;
  pass.evaluated = evaluations.length;
  pass.candidates = ordered.length;
  const waits = [
    ...evaluations.filter(({evaluation}) => evaluation.state === PLACEMENT_DEFICIT_STATE.WAITING)
      .map(({partitionId, evaluation}) => ({partitionId, reason: evaluation.waiting.reason})),
    ...formationWaiting,
  ];
  for (const {partitionId, reason} of waits) {
    (pass.waiting[reason] ??= []).push(partitionId);
  }
  totals.constructions += 1;
  totals.evaluated += pass.evaluated;
  totals.candidates += pass.candidates;
}

function recordCapacityCheck(pass) {
  pass.capacityChecks += 1;
  pass.observation.totals.capacityChecks += 1;
}

function recordFenced(pass) {
  pass.fenced += 1;
  pass.observation.totals.fenced += 1;
}

function recordProposal(pass) {
  pass.proposals += 1;
  pass.observation.totals.proposals += 1;
}

function recordRefusal(pass, reason) {
  increment(pass.refused, reason);
  increment(pass.observation.totals.refused, reason);
}

/**
 * The answer of one submission that passed the tenure fence.
 * @param {Object} pass - The pass record.
 * @param {Object} answer - The write kernel's or the applier's answer.
 */
function recordSubmissionAnswer(pass, answer) {
  if (answer?.tenureFence !== undefined) return;
  const result = answer?.[PLACEMENT_RESULT_FIELD] ?? null;
  if (result !== null) {
    recordPlacementResult(pass, result);
  } else if (isWriteOutcomeUnknown(answer)) {
    pass.observation.totals.outcomeUnknown += 1;
  } else if (typeof answer?.failureCode === 'string') {
    recordRefusal(pass, answer.failureCode);
  }
}

// A committed (or replayed) placement result: ADMITTED, RELEASED or REFUSED.
function recordPlacementResult(pass, result) {
  const totals = pass.observation.totals;
  if (result.outcome === PLACEMENT_OUTCOME.ADMITTED) {
    totals.admitted += result.operationIds.length;
  } else if (result.outcome === PLACEMENT_OUTCOME.RELEASED) {
    totals.released += 1;
  } else {
    recordRefusal(pass, result.reason);
  }
}

// The end of a pass that planned (its admissions recorded as they were made);
// one stopped stale keeps its checkpoint.
function completePass(pass, state) {
  pass.state = state;
  if (pass.stale) return;
  pass.stoppedAt = CHECKPOINT.COMPLETED;
  pass.observation.totals.completed += 1;
}

function frozenCounts(counts) {
  return Object.freeze(Object.fromEntries(Object.entries(counts).map(([key, value]) =>
    [key, Array.isArray(value) ? Object.freeze([...value]) : value])));
}

function frozenTotals(totals) {
  return Object.freeze({...totals, waits: frozenCounts(totals.waits),
    staleStops: frozenCounts(totals.staleStops), refused: frozenCounts(totals.refused)});
}

/**
 * The frozen lastPassSnapshot of a finished pass.
 * @param {Object} pass - The pass record.
 * @param {Object} clearingTriggers - PLACEMENT_CLEARING_TRIGGER.
 * @return {Object} The snapshot.
 */
function placementPassSnapshot(pass, clearingTriggers) {
  const nodeWait = pass.stoppedAt !== CHECKPOINT.NODE_AUTHORITY ? {} : {
    reason: pass.nodeAnswer.reason, clearingTrigger: clearingTriggers[pass.nodeAnswer.reason]};
  const aborted = pass.stoppedAt !== CHECKPOINT.ABORTED ? {} : {failure: pass.failure,
    retainedTriggers: pass.triggers};
  return Object.freeze({state: pass.state, ...nodeWait, ...aborted,
    admitted: Object.freeze([...pass.operationIds]), passSequence: pass.sequence,
    triggers: pass.triggers, tenureTerm: pass.tenureTerm, stoppedAt: pass.stoppedAt,
    stale: pass.stale, evaluated: pass.evaluated, candidates: pass.candidates,
    waiting: frozenCounts(pass.waiting), capacityChecks: pass.capacityChecks,
    proposals: pass.proposals, fenced: pass.fenced, refused: frozenCounts(pass.refused),
    failedCandidates: frozenCounts(pass.failedCandidates),
    localFailures: frozenCounts(pass.localFailures),
    uncertainCandidates: frozenCounts(pass.uncertainCandidates),
    totals: frozenTotals(pass.observation.totals)});
}

export {
  PLACEMENT_PASS_CHECKPOINT,
  PLACEMENT_PASS_STATE,
  beginPlacementPass,
  completePass,
  recordAdmittedOperation,
  recordCandidateFailure,
  recordLocalFailureAfterAdmission,
  recordUncertainCandidate,
  createPlacementObservation,
  directSubmissionRecord,
  markPassStale,
  markPassWaiting,
  placementPassSnapshot,
  recordCapacityCheck,
  recordFenced,
  recordLeadershipStartDriveFailure,
  recordLeadershipStartDriveJoined,
  recordNodeAuthorityWait,
  recordPassFailure,
  recordPassEvaluations,
  recordProposal,
  recordSubmissionAnswer,
};
