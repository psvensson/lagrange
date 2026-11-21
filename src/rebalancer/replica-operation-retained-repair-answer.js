// Canonical native repair answers; validation never substitutes for a grant.
import {isDeepStrictEqual} from 'node:util';
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_OUTCOME, PLACEMENT_CLEARING_TRIGGER, PLACEMENT_REFUSAL} from './replica-placement-owner-constants.js';

const REPAIR_ANSWER_STATE = Object.freeze({KNOWN: 'known', UNKNOWN: 'unknown'});
const OWNER_FIELDS = Object.freeze(['nodeId', 'replicaId']);
const OCCUPANCY_FIELDS = Object.freeze(['sourceOccupancy', 'targetOccupancy']);
const RESULT_FIELDS = Object.freeze({
  ADMITTED: ['outcome', 'operationIds'],
  BLOCKED: ['outcome', 'reason', 'operationIds', 'blockingOperations'],
  CAPACITY: ['outcome', 'reason', 'occupancy'],
  CDC: ['outcome', 'reason'],
});
const UNKNOWN = Object.freeze({state: REPAIR_ANSWER_STATE.UNKNOWN});
const BLOCKING_REASONS = new Set([
  PLACEMENT_REFUSAL.PARTITION_BUSY, PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED,
]);
const RETAINED_REFUSALS = new Set([
  PLACEMENT_REFUSAL.RETAINED_IDENTITY_CHANGED, PLACEMENT_REFUSAL.RETAINED_ROW_CHANGED,
  PLACEMENT_REFUSAL.RETAINED_ADMISSION_REQUIRED, PLACEMENT_REFUSAL.RETAINED_COPY_POLICY_UNAVAILABLE,
]);
const REPAIR_REFUSALS = new Set([
  ...RETAINED_REFUSALS, ...BLOCKING_REASONS,
  PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY,
  PLACEMENT_REFUSAL.CDC_CAPACITY,
]);
const CAPACITY_REASONS = new Set([
  PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY,
]);

function positivePosition(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasResultFields(result, fields) {
  return isDeepStrictEqual(Object.keys(result).sort(), [...fields].sort());
}

function isRepairResult(answer, attempt) {
  const result = answer.placementResult;
  if (result?.outcome === PLACEMENT_OUTCOME.ADMITTED) {
    return answer.success === true && hasResultFields(result, RESULT_FIELDS.ADMITTED) &&
      isDeepStrictEqual(result.operationIds, [attempt.operation.operationId]);
  }
  return answer.success === false && result?.outcome === PLACEMENT_OUTCOME.REFUSED &&
    readRetainedRepairRefusal(result, attempt).state === REPAIR_ANSWER_STATE.KNOWN;
}

function isCommittedRepairAnswer(answer, attempt) {
  if (!answer) return false;
  return [answer.committed === true, answer.entryId === attempt.entryId,
    answer.partitionId === LEDGER_PARTITION_ID, answer.failureCode === undefined,
    answer.admitted === undefined,
    positivePosition(answer.logIndex), positivePosition(answer.term),
    isRepairResult(answer, attempt)].every(Boolean);
}

function custodyMatches(custody, attempt) {
  if (!custody) return false;
  const expected = {entryId: attempt.entryId, operationId: attempt.operation.operationId,
    createdAt: attempt.operation.createdAt, bodyText: JSON.stringify(attempt.body)};
  const fieldsMatch = Object.keys(expected).every((key) => custody[key] === expected[key]);
  const ownerPresent = [custody.nodeId, custody.replicaId].every((value) =>
    typeof value === 'string' && value.length > 0);
  const ownerMatches = !attempt.expectedOwner || OWNER_FIELDS.every((key) =>
    custody[key] === attempt.expectedOwner[key]);
  return fieldsMatch && ownerPresent && ownerMatches;
}

function validBlocker(blocker) {
  if (!blocker) return false;
  return [typeof blocker.operationId === 'string', Number.isFinite(blocker.createdAt),
    typeof blocker.workflowStep === 'string', blocker.completedAt === null].every(Boolean);
}

function readBlockers(result) {
  if (!hasResultFields(result, RESULT_FIELDS.BLOCKED) ||
      !Array.isArray(result.blockingOperations)) return UNKNOWN;
  const blockers = result.blockingOperations;
  if (blockers.length === 0 || !blockers.every(validBlocker)) return UNKNOWN;
  if (!isDeepStrictEqual(result.operationIds, blockers.map((row) => row.operationId))) {
    return UNKNOWN;
  }
  return {state: REPAIR_ANSWER_STATE.KNOWN, blockers, occupancy: null};
}

function validOccupancyCounts(occupancy) {
  return OCCUPANCY_FIELDS.every((key) =>
    Number.isSafeInteger(occupancy[key]) && occupancy[key] >= 0);
}

function readOccupancy(result, attempt) {
  if (!hasResultFields(result, RESULT_FIELDS.CAPACITY)) return UNKNOWN;
  const statement = attempt.body.copyPolicy.statement;
  const occupancy = result.occupancy;
  if (!statement || !occupancy) return UNKNOWN;
  const expected = {copySourceNodeId: statement.moves[0].copySourceNodeId,
    targetNodeId: statement.moves[0].targetNodeId,
    sourceLimit: statement.kSrcForClass, targetLimit: statement.kTgt};
  if (!Object.keys(expected).every((key) => occupancy[key] === expected[key])) return UNKNOWN;
  const atSourceLimit = occupancy.sourceOccupancy >= occupancy.sourceLimit;
  const reasonMatchesCounts = result.reason === PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY ?
    atSourceLimit : !atSourceLimit && occupancy.targetOccupancy >= occupancy.targetLimit;
  return validOccupancyCounts(occupancy) && reasonMatchesCounts ?
    {state: REPAIR_ANSWER_STATE.KNOWN, occupancy, blockers: null} : UNKNOWN;
}

function readRetainedRepairRefusal(result, attempt) {
  if (!REPAIR_REFUSALS.has(result.reason)) return UNKNOWN;
  if (RETAINED_REFUSALS.has(result.reason) &&
      (!hasResultFields(result, RESULT_FIELDS.BLOCKED) ||
      !isDeepStrictEqual(result.operationIds, []) ||
      !isDeepStrictEqual(result.blockingOperations, []))) return UNKNOWN;
  if (result.reason === PLACEMENT_REFUSAL.CDC_CAPACITY &&
      !hasResultFields(result, RESULT_FIELDS.CDC)) return UNKNOWN;
  let evidence = {state: REPAIR_ANSWER_STATE.KNOWN, blockers: null, occupancy: null};
  if (BLOCKING_REASONS.has(result.reason)) evidence = readBlockers(result);
  else if (CAPACITY_REASONS.has(result.reason)) evidence = readOccupancy(result, attempt);
  if (evidence.state === REPAIR_ANSWER_STATE.UNKNOWN) return evidence;
  return {...evidence, clearingTrigger: PLACEMENT_CLEARING_TRIGGER[result.reason]};
}

export {REPAIR_ANSWER_STATE, isCommittedRepairAnswer, custodyMatches, readRetainedRepairRefusal};
