import {isValidRaftLogIndex} from '../raft/log-index.js';

const UNKNOWN_PARTITION_ID = 'unknown';

function normalizeString(value) {
  return String(value || '').trim();
}

function isValidTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasCommitWitnessShape(value) {
  const strings = [
    value?.partitionId,
    value?.leaderNodeId,
    value?.leaderReplicaId,
    value?.entryId,
  ];
  return strings.every(
    (entry) => typeof entry === 'string' && entry.trim().length > 0,
  ) && Number.isSafeInteger(value?.term) && value.term >= 0 &&
    isValidRaftLogIndex(value?.logIndex) && value.logIndex > 0;
}

function normalizeCommitWitness(value) {
  if (!hasCommitWitnessShape(value)) return null;
  const witness = {
    partitionId: normalizeString(value.partitionId),
    leaderNodeId: normalizeString(value.leaderNodeId),
    leaderReplicaId: normalizeString(value.leaderReplicaId),
    term: Number(value.term),
    logIndex: Number(value.logIndex),
    entryId: normalizeString(value.entryId),
  };
  const operationId = normalizeString(value.operationId);
  const idempotencyKey = normalizeString(value.idempotencyKey);
  if (operationId.length > 0) witness.operationId = operationId;
  if (idempotencyKey.length > 0) witness.idempotencyKey = idempotencyKey;
  return witness;
}

function witnessMatchesParticipant(witness, participant, resultIdentity) {
  if (!witness) return false;
  const partitionId = normalizeString(participant?.partitionId);
  if (partitionId.length === 0 || witness.partitionId !== partitionId) {
    return false;
  }
  if (
    resultIdentity.operationId.length > 0 &&
    witness.operationId !== resultIdentity.operationId
  ) {
    return false;
  }
  return resultIdentity.idempotencyKey.length === 0 ||
    witness.idempotencyKey === resultIdentity.idempotencyKey;
}

// Whether the participant's answer names the witnessed entry: a participant
// that names its entryId names the witness's.
function witnessNamesParticipantEntry(witness, participant) {
  const entryId = normalizeString(participant?.entryId);
  return entryId.length === 0 || witness.entryId === entryId;
}

// A replayed answer (its replica answered the retry of a committed entry
// from its outcome row) is bound to the committed entry itself: the entry
// it names and the log index it replays are the witness's, whichever
// replica answered. Its witness names the replica that proposed the entry,
// so the answering node is never its leader.
function replayBindsWitness(witness, participant) {
  return normalizeString(participant?.entryId) === witness.entryId &&
    Number(participant?.replayOfLogIndex) === witness.logIndex;
}

// How a witness-bound answer is acknowledged: a replay by its binding to the
// committed entry, any other answer by the node that accepted it leading
// the commit it attests.
function isAcknowledgedCommit(witness, participant, acceptingNodeId) {
  if (participant?.idempotentReplay === true) {
    return replayBindsWitness(witness, participant);
  }
  return witness.leaderNodeId === acceptingNodeId;
}

// Whether a participant's answer is a complete, witness-bound
// acknowledgement of its committed entry.
function isCompleteParticipantReceipt({witness, participant, resultIdentity,
  acceptingNodeId, acknowledgedAtMs}) {
  return witnessMatchesParticipant(witness, participant, resultIdentity) &&
    witnessNamesParticipantEntry(witness, participant) &&
    acceptingNodeId.length > 0 &&
    isAcknowledgedCommit(witness, participant, acceptingNodeId) &&
    isValidTimestamp(acknowledgedAtMs);
}

function buildParticipantReceipt(participant, resultIdentity) {
  const witness = normalizeCommitWitness(participant?.durableCommitWitness);
  const acknowledgedAtMs = Number(participant?.acknowledgedAtMs);
  const acceptingNodeId = normalizeString(participant?.acceptingNodeId);
  const complete = isCompleteParticipantReceipt({witness, participant,
    resultIdentity, acceptingNodeId, acknowledgedAtMs});
  return {
    partitionId:
      normalizeString(participant?.partitionId) || UNKNOWN_PARTITION_ID,
    acceptingNodeId: acceptingNodeId || null,
    acknowledgedAtMs:
      isValidTimestamp(acknowledgedAtMs) ? acknowledgedAtMs : null,
    durableCommitWitness: witness,
    idempotentReplay: participant?.idempotentReplay === true,
    complete,
  };
}

function buildAdminWriteReceipt(result) {
  const resultIdentity = {
    operationId: normalizeString(result?.operationId),
    idempotencyKey: normalizeString(result?.idempotencyKey),
  };
  const successfulParticipants = Array.isArray(result?.participantResults) ?
    result.participantResults.filter(
      (participant) => participant?.success === true,
    ) : [];
  const participantReceipts = successfulParticipants.map((participant) =>
    buildParticipantReceipt(participant, resultIdentity));
  const completeParticipantReceipts = participantReceipts.filter(
    (participant) => participant.complete,
  );
  const receipt = {
    successfulParticipantCount: successfulParticipants.length,
    witnessedParticipantCount: completeParticipantReceipts.length,
    commitWitnessComplete:
      successfulParticipants.length > 0 &&
      successfulParticipants.length === completeParticipantReceipts.length,
    missingCommitWitnessPartitions: participantReceipts
      .filter((participant) => !participant.complete)
      .map((participant) => participant.partitionId),
    durableCommitWitnesses: completeParticipantReceipts.map(
      (participant) => participant.durableCommitWitness,
    ),
    participantReceipts,
  };
  if (resultIdentity.operationId.length > 0) {
    receipt.operationId = resultIdentity.operationId;
  }
  if (resultIdentity.idempotencyKey.length > 0) {
    receipt.idempotencyKey = resultIdentity.idempotencyKey;
  }
  return receipt;
}

export {buildAdminWriteReceipt};
