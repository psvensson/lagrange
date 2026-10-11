import {PARTITION_COMMITTED_COMMAND_ORIGIN, admitCommittedCommand,
  committedCommandRefusalResult} from './partition-committed-command-admission.js';
import {
  buildParticipantAdmissionPauseCommand,
  buildParticipantAdmissionResumeCommand,
  buildParticipantReleaseDispatchCommand,
  buildParticipantReleaseConfirmCommand,
  buildParticipantReleaseFinalizeCommand,
  buildParticipantReleasePublishClaimCommand,
  buildParticipantReleaseRecordReceiptCommand,
  buildParticipantReleaseRecordShareCommand,
  buildParticipantReleaseReserveCommand,
  buildParticipantReleaseRetireCommand,
  parseJson,
  RELEASE_APPLY_RESULT,
  RELEASE_CONTROL_STATE,
} from './partition-participant-release-command.js';
import {readParticipantReleaseState} from
  './partition-participant-transaction-store.js';
import {startPartitionRaftWriteCommit} from
  './partition-service-raft-write-commit.js';

function stampOf(service) {
  return {timestamp: service.hlcClock.now().toString(),
    proposedBy: service.replicaId, proposedAt: service.timeSource.now()};
}

async function propose(service, command) {
  if (command === null) {
    return {success: false, outcome: 'INVALID', partitionId: service.partitionId};
  }
  const pending = service.getPendingCommittedWriteOutcome(command.entryId);
  if (pending !== null) return pending;
  const admission = admitCommittedCommand(command,
    {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.PARTICIPANT_RELEASE_OWNER});
  if (!admission.admitted) {
    return committedCommandRefusalResult(admission, service.partitionId);
  }
  return startPartitionRaftWriteCommit(service, {entry: command,
    phaseTimings: null, applyStartMs: service.timeSource.now()});
}

function pauseCommand(service, attempt) {
  return buildParticipantAdmissionPauseCommand({
    partitionId: service.partitionId,
    pauseInvocationId: attempt?.pauseInvocationId,
    leaderReplicaId: attempt?.leaderReplicaId,
    leaderTerm: attempt?.term,
  });
}

function observedPause(service, command) {
  if (command === null) return null;
  const state = readParticipantReleaseState(service.db);
  return state.pauseEntryId === command.entryId ? {
    success: true,
    outcome: RELEASE_APPLY_RESULT.PAUSED,
    pauseGeneration: state.pauseGeneration,
    pauseEntryId: state.pauseEntryId,
    replayed: true,
  } : null;
}

function observeParticipantAdmissionPause(service, attempt) {
  return observedPause(service, pauseCommand(service, attempt));
}

function pauseParticipantAdmission(service, attempt) {
  const command = pauseCommand(service, attempt);
  const replay = observedPause(service, command);
  return replay === null ? propose(service, command) : Promise.resolve(replay);
}

async function reserveParticipantRelease(service, options) {
  let state = readParticipantReleaseState(service.db);
  let existing = parseJson(state.controlText);
  if ([RELEASE_CONTROL_STATE.AUTHORIZED, RELEASE_CONTROL_STATE.DISPATCHED,
    RELEASE_CONTROL_STATE.CONFIRMED].includes(existing?.state) &&
      existing.authorizationId === options.authorizationId) {
    return {success: true, outcome: RELEASE_APPLY_RESULT.AUTHORIZED,
      authorizationId: existing.authorizationId,
      authorizationRevision: existing.authorizationRevision,
      controlIndex: existing.controlIndex, controlTerm: existing.controlTerm,
      replayed: true};
  }
  const reserved = await propose(service, buildParticipantReleaseReserveCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
  return reserved;
}

function publishParticipantReleaseClaim(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleasePublishClaimCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function recordParticipantReleaseShare(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleaseRecordShareCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function recordParticipantReleaseReceipt(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleaseRecordReceiptCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function finalizeReservedParticipantRelease(service, options) {
  const state = readParticipantReleaseState(service.db);
  const existing = parseJson(state.controlText);
  if (existing?.state !== RELEASE_CONTROL_STATE.RESERVED ||
      existing.authorizationId !== options.authorizationId) {
    return Promise.resolve({success: false, outcome: RELEASE_APPLY_RESULT.STALE,
      partitionId: service.partitionId});
  }
  return propose(service, buildParticipantReleaseFinalizeCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function dispatchParticipantRelease(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleaseDispatchCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function retireParticipantRelease(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleaseRetireCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function confirmParticipantRelease(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantReleaseConfirmCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function resumeParticipantAdmission(service, options) {
  const state = readParticipantReleaseState(service.db);
  return propose(service, buildParticipantAdmissionResumeCommand({
    ...options, partitionId: service.partitionId,
    expectedPauseGeneration: state.pauseGeneration,
  }, stampOf(service)));
}

export {
  confirmParticipantRelease,
  dispatchParticipantRelease,
  finalizeReservedParticipantRelease,
  observeParticipantAdmissionPause,
  pauseParticipantAdmission,
  publishParticipantReleaseClaim,
  recordParticipantReleaseShare,
  recordParticipantReleaseReceipt,
  reserveParticipantRelease,
  resumeParticipantAdmission,
  retireParticipantRelease,
};
