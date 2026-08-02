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

function buildParticipantReceipt(participant, resultIdentity) {
  const witness = normalizeCommitWitness(participant?.durableCommitWitness);
  const acknowledgedAtMs = Number(participant?.acknowledgedAtMs);
  const acceptingNodeId = normalizeString(participant?.acceptingNodeId);
  const witnessBound = witnessMatchesParticipant(
    witness,
    participant,
    resultIdentity,
  );
  const complete = witnessBound && acceptingNodeId.length > 0 &&
    witness.leaderNodeId === acceptingNodeId &&
    isValidTimestamp(acknowledgedAtMs);
  return {
    partitionId:
      normalizeString(participant?.partitionId) || UNKNOWN_PARTITION_ID,
    acceptingNodeId: acceptingNodeId || null,
    acknowledgedAtMs:
      isValidTimestamp(acknowledgedAtMs) ? acknowledgedAtMs : null,
    durableCommitWitness: witness,
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

export {buildAdminWriteReceipt, normalizeCommitWitness};
