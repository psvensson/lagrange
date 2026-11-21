// Canonical native repair answers; validation never substitutes for a grant.
import {isDeepStrictEqual} from 'node:util';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_REFUSAL} from './replica-placement-owner-constants.js';

const REPAIR_ANSWER_STATE = Object.freeze({KNOWN: 'known', UNKNOWN: 'unknown'});
const OWNER_FIELDS = Object.freeze(['nodeId', 'replicaId']);
const OCCUPANCY_FIELDS = Object.freeze(['sourceOccupancy', 'targetOccupancy']);
const UNKNOWN = Object.freeze({state: REPAIR_ANSWER_STATE.UNKNOWN});
const BLOCKING_REASONS = new Set([
  PLACEMENT_REFUSAL.PARTITION_BUSY, PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED,
]);
const CAPACITY_REASONS = new Set([
  PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY,
]);

function positivePosition(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isCommittedRepairAnswer(answer, attempt) {
  if (!answer) return false;
  return [answer.committed === true, answer.entryId === attempt.entryId,
    positivePosition(answer.logIndex), positivePosition(answer.term)].every(Boolean);
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
  if (!Array.isArray(result.blockingOperations)) return UNKNOWN;
  const blockers = result.blockingOperations;
  if (blockers.length === 0 || !blockers.every(validBlocker)) return UNKNOWN;
  if (!isDeepStrictEqual(result.operationIds, blockers.map((row) => row.operationId))) {
    return UNKNOWN;
  }
  return {state: REPAIR_ANSWER_STATE.KNOWN, blockers};
}

function validOccupancyCounts(occupancy) {
  return OCCUPANCY_FIELDS.every((key) =>
    Number.isSafeInteger(occupancy[key]) && occupancy[key] >= 0);
}

function readOccupancy(result, attempt) {
  const statement = attempt.body.copyPolicy.statement;
  const occupancy = result.occupancy;
  if (!statement || !occupancy) return UNKNOWN;
  const expected = {copySourceNodeId: statement.moves[0].copySourceNodeId,
    targetNodeId: statement.moves[0].targetNodeId,
    sourceLimit: statement.kSrcForClass, targetLimit: statement.kTgt};
  if (!Object.keys(expected).every((key) => occupancy[key] === expected[key])) return UNKNOWN;
  return validOccupancyCounts(occupancy) ?
    {state: REPAIR_ANSWER_STATE.KNOWN, occupancy} : UNKNOWN;
}

function readRetainedRepairRefusal(result, attempt) {
  if (!Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, result.reason)) return UNKNOWN;
  let evidence = {state: REPAIR_ANSWER_STATE.KNOWN};
  if (BLOCKING_REASONS.has(result.reason)) evidence = readBlockers(result);
  else if (CAPACITY_REASONS.has(result.reason)) evidence = readOccupancy(result, attempt);
  if (evidence.state === REPAIR_ANSWER_STATE.UNKNOWN) return evidence;
  return {...evidence, clearingTrigger: PLACEMENT_CLEARING_TRIGGER[result.reason]};
}

export {REPAIR_ANSWER_STATE, isCommittedRepairAnswer, custodyMatches, readRetainedRepairRefusal};
