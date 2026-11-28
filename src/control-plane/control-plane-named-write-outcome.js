// Named writes settle only on the terminal receipt their delivery owner emits.
import {CDC_ERROR_CODE, CDC_SHUT_DOWN_WRITE_OUTCOME} from '../cdc/cdc-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../partition/partition-service-constants.js';
import {isAppliedWithUnknownCount, isPartitionWriteFailureCode} from
  '../partition/partition-write-kernel.js';
import {deriveParticipantEntryId} from '../query/distributed/distributed-write-coordinator.js';

const NAMED_WRITE_ATTEMPT = Object.freeze({
  APPLIED: 'applied',
  FAILED: 'failed',
  NOT_PROPOSED: 'not_proposed',
  UNKNOWN: 'unknown',
});

function hasText(value) {
  return typeof value === 'string' && value.length > 0;
}

// The judge answers for every input: a field is compared only after its
// presence is proven, so two absent values never agree (an answer without a
// witness and without a partitionId is UNKNOWN, never a TypeError).
function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function hasAffectedRows(result) {
  const counts = [result.affectedRows, result.changes].filter((value) => value !== undefined);
  if (isAppliedWithUnknownCount(result)) return counts.length === 0;
  return counts.length > 0 && counts.every((value) =>
    Number.isSafeInteger(value) && value >= 0 && value === counts[0]);
}

function isDeclaredAttempt(attempt) {
  return isRecord(attempt) && hasText(attempt.key) && hasText(attempt.partitionId);
}

function belongsToNamedWrite(result, attempt) {
  return isRecord(result) && isDeclaredAttempt(attempt) &&
    hasText(result.partitionId) &&
    result.partitionId === attempt.partitionId &&
    result.entryId === deriveParticipantEntryId(attempt.key, result.partitionId);
}

// APPLIED: a durable commit witness bound to the attempt's own declared
// partition and entry, on an answer of that same partition.
function isCommittedPartitionSuccess(result, attempt) {
  if (!isRecord(result)) return false;
  const witness = result.durableCommitWitness;
  return result.success === true && result.deferRetry !== true && hasAffectedRows(result) &&
    isRecord(witness) && hasText(result.partitionId) &&
    witness.partitionId === result.partitionId && belongsToNamedWrite(witness, attempt) &&
    Number.isSafeInteger(witness.logIndex) && witness.logIndex > 0 &&
    Number.isSafeInteger(witness.term) && witness.term > 0;
}

function isCommittedPartitionFailure(result, attempt) {
  return isRecord(result) && result.committed === true &&
    result.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED &&
    hasText(result.failureCode) && belongsToNamedWrite(result, attempt) &&
    Number.isSafeInteger(result.logIndex) && result.logIndex > 0;
}

const NON_REFUSAL_CODES = new Set([
  PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
  PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_HOST_FAILURE,
  PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED,
]);

// NOT_PROPOSED: a typed refusal on the attempt's own partition, before
// proposal. A refusal that carries a durable commit witness contradicts
// itself and proves neither (UNKNOWN).
function isPartitionPreProposalRefusal(result, attempt) {
  return isRecord(result) && isDeclaredAttempt(attempt) &&
    result.committed !== true && result.durableCommitWitness == null &&
    isPartitionWriteFailureCode(result.failureCode) &&
    !NON_REFUSAL_CODES.has(result.failureCode) &&
    hasText(result.partitionId) &&
    result.partitionId === attempt.partitionId &&
    (result.entryId == null || belongsToNamedWrite(result, attempt));
}

// The one failure of a single-partition answer, when it names that same
// partition; otherwise the answer itself is judged.
function singlePartitionFailureOf(result) {
  const failures = result.participantFailures;
  if (!Array.isArray(failures) || failures.length !== 1) return result;
  const [nested] = failures;
  return isRecord(nested) && hasText(nested.partitionId) &&
    nested.partitionId === result.partitionId ? nested : result;
}

function judgePartitionAnswer(result, attempt) {
  if (!isRecord(result)) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  if (isCommittedPartitionSuccess(result, attempt)) return NAMED_WRITE_ATTEMPT.APPLIED;
  if (result.success !== false && !(result instanceof Error)) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  const failure = singlePartitionFailureOf(result);
  if (isCommittedPartitionFailure(failure, attempt)) return NAMED_WRITE_ATTEMPT.FAILED;
  if (isPartitionPreProposalRefusal(failure, attempt)) return NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
  return NAMED_WRITE_ATTEMPT.UNKNOWN;
}

function hasCompleteDistributedParticipants(result) {
  const {partitions, mirrorPartitions, participantResults} = result;
  if (!Array.isArray(partitions) || !Array.isArray(mirrorPartitions) ||
      !Array.isArray(participantResults) || !participantResults.every(isRecord)) return false;
  const participants = [...partitions, ...mirrorPartitions];
  const actual = participantResults.map((entry) => entry.partitionId);
  return new Set(participants).size === participants.length &&
    participants.length === actual.length &&
    participants.every((partition) => hasText(partition) && actual.includes(partition));
}

function distributedAffectedRowsAgree(result, attempt) {
  const {participantResults, partitions, mirrorPartitions} = result;
  // An answer without a participant (a plan with no partition) proves
  // nothing of the named entry on its declared partition: never APPLIED.
  if (participantResults.length === 0 || !hasAffectedRows(result) ||
      !participantResults.every((entry) => isCommittedPartitionSuccess(entry, attempt))) {
    return false;
  }
  if (partitions.length !== 1 || mirrorPartitions.length !== 0) return false;
  const primaryResults = participantResults.filter((entry) =>
    partitions.includes(entry.partitionId));
  if (primaryResults.some(isAppliedWithUnknownCount)) return isAppliedWithUnknownCount(result);
  const total = primaryResults.reduce((sum, entry) =>
    sum + (entry.affectedRows ?? entry.changes), 0);
  return result.affectedRows === total;
}

function judgeDistributedAnswer(result, attempt) {
  if (!hasText(result.idempotencyKey) || result.idempotencyKey !== attempt.key ||
      !hasText(result.operationId) ||
      !hasCompleteDistributedParticipants(result)) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  const {participantResults} = result;
  if (result.success === true && result.deferRetry !== true &&
      distributedAffectedRowsAgree(result, attempt)) return NAMED_WRITE_ATTEMPT.APPLIED;
  // A thrown distributed answer is a failed one (as for a partition answer).
  const failed = result.success === false || result instanceof Error;
  if (!failed || participantResults.length === 0) {
    return NAMED_WRITE_ATTEMPT.UNKNOWN;
  }
  const verdicts = participantResults.map((entry) => judgePartitionAnswer(entry, attempt));
  const first = verdicts[0];
  return verdicts.every((verdict) => verdict === first) ? first : NAMED_WRITE_ATTEMPT.UNKNOWN;
}

// The CDC service wraps one engine or partition answer once; a deeper chain
// is no producer's answer.
const MAX_WRAPPED_ANSWER_DEPTH = 2;

function judgeAnswer(answer, attempt, depth) {
  if (!isRecord(answer) || !isDeclaredAttempt(attempt) ||
      depth > MAX_WRAPPED_ANSWER_DEPTH) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  if (answer.code === CDC_ERROR_CODE.SHUT_DOWN &&
      answer.writeOutcome === CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_ROUTED) {
    return NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
  }
  if (answer.partitionResult && answer.success === true && answer.committed === true) {
    return judgeAnswer(answer.partitionResult, attempt, depth + 1);
  }
  if (Array.isArray(answer.participantResults)) return judgeDistributedAnswer(answer, attempt);
  return judgePartitionAnswer(answer, attempt);
}

function judgeNamedWriteOutcome(answer, attempt) {
  return judgeAnswer(answer, attempt, 0);
}

export {NAMED_WRITE_ATTEMPT, belongsToNamedWrite, judgeNamedWriteOutcome};
