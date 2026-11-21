import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {
  PLACEMENT_ADMISSION_ERROR, PLACEMENT_RESULT_FIELD, RETAINED_PLACEMENT_ATTEMPT,
} from '../partition/partition-placement-admission-constants.js';
import {isWriteOutcomeUnknown} from '../partition/partition-write-kernel.js';
import {
  PLACEMENT_OUTCOME, PLACEMENT_REFUSAL, PLACEMENT_TRANSITION_KIND,
} from './replica-placement-owner-constants.js';

const PLACEMENT_REFUSAL_REASONS = new Set(Object.values(PLACEMENT_REFUSAL));
const RETRIABLE_FOUNDING_REFUSALS = Object.freeze(new Set([
  PLACEMENT_REFUSAL.CDC_CAPACITY,
  PLACEMENT_REFUSAL.PARTITION_BUSY,
  PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED,
]));
const STATIC_PRE_PROPOSAL_FAILURE_CODES = Object.freeze(new Set([
  PLACEMENT_ADMISSION_ERROR.BYTES,
  PLACEMENT_ADMISSION_ERROR.TARGET,
  PLACEMENT_ADMISSION_ERROR.REMOVE_INTENT_UNSCOPED,
  PLACEMENT_REFUSAL.LEDGER_PARTITION_REQUIRED,
]));

function isPlacementAttemptIdentitySettled(answer) {
  if (answer?.partitionId !== LEDGER_PARTITION_ID || isWriteOutcomeUnknown(answer)) {
    return false;
  }
  if (STATIC_PRE_PROPOSAL_FAILURE_CODES.has(answer.failureCode)) {
    return answer.success === false && answer.committed !== true;
  }
  if (answer.committed !== true) return false;
  const result = answer[PLACEMENT_RESULT_FIELD];
  if (result?.outcome === PLACEMENT_OUTCOME.REFUSED) {
    return answer.success === false && PLACEMENT_REFUSAL_REASONS.has(result.reason);
  }
  return answer.success === true &&
    (result?.outcome === PLACEMENT_OUTCOME.ADMITTED ||
      result?.outcome === PLACEMENT_OUTCOME.RELEASED) &&
    Array.isArray(result.operationIds) && result.operationIds.length > 0 &&
    result.operationIds.every((id) => typeof id === 'string' && id.length > 0);
}

function bindPlacementAttemptAnswer(answer, entryId, retained) {
  const suppliedEntryId = answer?.entryId;
  const correlated = suppliedEntryId === undefined || suppliedEntryId === entryId;
  const bound = correlated ? {...answer, entryId} : {entryId};
  if (retained && !isPlacementAttemptIdentitySettled(bound)) {
    bound[RETAINED_PLACEMENT_ATTEMPT] = true;
  }
  return bound;
}

function canReplaceSettledPlacementAttempt(answer, statement) {
  const result = answer[PLACEMENT_RESULT_FIELD];
  if (statement.transitionKind === PLACEMENT_TRANSITION_KIND.FOUND) {
    return result?.outcome === PLACEMENT_OUTCOME.REFUSED &&
      RETRIABLE_FOUNDING_REFUSALS.has(result.reason);
  }
  return answer.failureCode === PLACEMENT_ADMISSION_ERROR.BYTES ||
    result?.outcome === PLACEMENT_OUTCOME.REFUSED;
}

export {
  bindPlacementAttemptAnswer, canReplaceSettledPlacementAttempt,
  isPlacementAttemptIdentitySettled,
};
