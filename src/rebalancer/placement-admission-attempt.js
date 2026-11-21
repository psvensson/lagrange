import {toExactInteger} from '../raft/raft-rs-record-integer.js';
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {
  PLACEMENT_ADMISSION_ERROR, PLACEMENT_RESULT_FIELD, RETAINED_PLACEMENT_ATTEMPT,
} from '../partition/partition-placement-admission-constants.js';
import {isWriteOutcomeUnknown} from '../partition/partition-write-kernel.js';
import {
  PLACEMENT_CLEARING_TRIGGER, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL,
  PLACEMENT_TRANSITION_KIND, PLACEMENT_TRIGGER,
} from './replica-placement-owner-constants.js';

const PLACEMENT_REFUSAL_REASONS = new Set(Object.values(PLACEMENT_REFUSAL));
const DECIMAL_RAFT_INDEX = /^\d+$/u;
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

function foundingRefusalWaitsForCommit(answer, statement) {
  const result = answer?.[PLACEMENT_RESULT_FIELD];
  return statement?.transitionKind === PLACEMENT_TRANSITION_KIND.FOUND &&
    isPlacementAttemptIdentitySettled(answer) &&
    result?.outcome === PLACEMENT_OUTCOME.REFUSED &&
    PLACEMENT_CLEARING_TRIGGER[result.reason] === PLACEMENT_TRIGGER.LEDGER_COMMIT;
}

function ledgerAdvancedAfterRefusal(answer) {
  const {observedLedgerAppliedIndex, logIndex} = answer;
  return typeof observedLedgerAppliedIndex === 'string' &&
    DECIMAL_RAFT_INDEX.test(observedLedgerAppliedIndex) &&
    Number.isSafeInteger(logIndex) && logIndex > 0 &&
    toExactInteger(observedLedgerAppliedIndex) > toExactInteger(String(logIndex));
}

function retainFoundingRefusal(answer) {
  return {...answer, [RETAINED_PLACEMENT_ATTEMPT]: true,
    clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT};
}

function canReplaceSettledPlacementAttempt(answer, statement) {
  if (statement.transitionKind === PLACEMENT_TRANSITION_KIND.FOUND) {
    return foundingRefusalWaitsForCommit(answer, statement) &&
      ledgerAdvancedAfterRefusal(answer);
  }
  return answer.failureCode === PLACEMENT_ADMISSION_ERROR.BYTES ||
    answer[PLACEMENT_RESULT_FIELD]?.outcome === PLACEMENT_OUTCOME.REFUSED;
}

export {
  bindPlacementAttemptAnswer, canReplaceSettledPlacementAttempt,
  foundingRefusalWaitsForCommit, retainFoundingRefusal,
  isPlacementAttemptIdentitySettled,
};
