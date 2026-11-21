// Named writes settle only on the terminal receipt their delivery owner emits.
import {CDC_ERROR_CODE, CDC_SHUT_DOWN_WRITE_OUTCOME} from '../cdc/cdc-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME} from '../partition/partition-service-constants.js';
import {
  isAppliedWithUnknownCount,
  isPartitionWriteFailureCode,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../partition/partition-write-kernel.js';
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

function hasAffectedRows(result) {
  const counts = [result.affectedRows, result.changes].filter((value) => value !== undefined);
  if (isAppliedWithUnknownCount(result)) return counts.length === 0;
  return counts.length > 0 && counts.every((value) =>
    Number.isSafeInteger(value) && value >= 0 && value === counts[0]);
}

function belongsToEntry(result, key) {
  return hasText(result.partitionId) &&
    result.entryId === deriveParticipantEntryId(key, result.partitionId);
}

function judgePartitionAnswer(result, key) {
  const witness = result.durableCommitWitness;
  const failed = result.success === false || result instanceof Error;
  if (result.success === true && result.deferRetry !== true && hasAffectedRows(result) &&
      witness?.partitionId === result.partitionId && belongsToEntry(witness, key) &&
      Number.isSafeInteger(witness.logIndex) && witness.logIndex > 0 &&
      Number.isSafeInteger(witness.term) && witness.term > 0) {
    return NAMED_WRITE_ATTEMPT.APPLIED;
  }
  if (failed && result.committed === true &&
      result.outcome === PARTITION_COMMITTED_COMMAND_OUTCOME.STATEMENT_FAILED &&
      hasText(result.failureCode) && belongsToEntry(result, key) &&
      Number.isSafeInteger(result.logIndex) && result.logIndex > 0) {
    return NAMED_WRITE_ATTEMPT.FAILED;
  }
  const refusal = PARTITION_WRITE_LEADERSHIP_REFUSAL;
  if (failed && result.committed !== true &&
      isPartitionWriteFailureCode(result.failureCode) &&
      result.failureCode !== refusal.OUTCOME_UNKNOWN &&
      result.failureCode !== refusal.CONSENSUS_HOST_FAILURE &&
      result.failureCode !== refusal.RESERVED &&
      hasText(result.partitionId) &&
      (result.entryId == null || belongsToEntry(result, key))) {
    return NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
  }
  return NAMED_WRITE_ATTEMPT.UNKNOWN;
}

function judgeDistributedAnswer(result, key) {
  const {partitions, mirrorPartitions, participantResults} = result;
  if (result.idempotencyKey !== key || !hasText(result.operationId) ||
      !Array.isArray(partitions) || !Array.isArray(mirrorPartitions) ||
      !Array.isArray(participantResults)) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  const participants = [...partitions, ...mirrorPartitions];
  const actual = participantResults.map((entry) => entry?.partitionId);
  const complete = new Set(participants).size === participants.length &&
    participants.length === actual.length && participants.every(
    (partition) => hasText(partition) && actual.includes(partition));
  if (!complete) return NAMED_WRITE_ATTEMPT.UNKNOWN;
  if (result.success === true && result.deferRetry !== true && hasAffectedRows(result) &&
      participantResults.every((entry) => entry.success === true && hasAffectedRows(entry))) {
    return NAMED_WRITE_ATTEMPT.APPLIED;
  }
  if (result.success !== false || participantResults.length === 0) {
    return NAMED_WRITE_ATTEMPT.UNKNOWN;
  }
  const verdicts = participantResults.map((entry) => judgePartitionAnswer(entry, key));
  const first = verdicts[0];
  return verdicts.every((verdict) => verdict === first) ? first : NAMED_WRITE_ATTEMPT.UNKNOWN;
}

function judgeNamedWriteOutcome(answer, key) {
  if (!answer || typeof answer !== 'object') return NAMED_WRITE_ATTEMPT.UNKNOWN;
  if (answer.code === CDC_ERROR_CODE.SHUT_DOWN &&
      answer.writeOutcome === CDC_SHUT_DOWN_WRITE_OUTCOME.NOT_ROUTED) {
    return NAMED_WRITE_ATTEMPT.NOT_PROPOSED;
  }
  if (answer.partitionResult && answer.success === true && answer.committed === true) {
    return judgeNamedWriteOutcome(answer.partitionResult, key);
  }
  if (Array.isArray(answer.participantResults)) return judgeDistributedAnswer(answer, key);
  return judgePartitionAnswer(answer, key);
}

export {NAMED_WRITE_ATTEMPT, judgeNamedWriteOutcome};
