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
  RELEASE_MEMBER_CLAIM_STATE,
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

function controlRecord(state) {
  return parseJson(state.controlText);
}

function reserveMatches(record, command) {
  return record?.authorizationId === command.authorizationId &&
    record.controlReleaseText === command.controlReleaseText &&
    record.dependentReleaseText === command.dependentReleaseText &&
    record.controlTargetEntriesText === command.controlTargetEntriesText &&
    record.targetEntriesText === command.targetEntriesText &&
    record.controlConfigurationText === command.controlConfigurationText &&
    record.targetConfigurationText === command.targetConfigurationText &&
    record.deadlineAtMs === command.deadlineAtMs;
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
  const state = readParticipantReleaseState(service.db);
  const existing = controlRecord(state);
  if ([RELEASE_CONTROL_STATE.AUTHORIZED, RELEASE_CONTROL_STATE.DISPATCHED,
    RELEASE_CONTROL_STATE.CONFIRMED].includes(existing?.state) &&
      existing.authorizationId === options.authorizationId) {
    return {success: true, outcome: RELEASE_APPLY_RESULT.AUTHORIZED,
      authorizationId: existing.authorizationId,
      authorizationRevision: existing.authorizationRevision,
      controlIndex: existing.controlIndex, controlTerm: existing.controlTerm,
      replayed: true};
  }
  const command = buildParticipantReleaseReserveCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service));
  if (existing?.state === RELEASE_CONTROL_STATE.RESERVED &&
      reserveMatches(existing, command)) {
    return {success: true, outcome: RELEASE_APPLY_RESULT.RESERVED,
      reservationId: existing.authorizationId,
      controlRevision: state.controlRevision,
      reservationIndex: existing.reservationIndex,
      reservationTerm: existing.reservationTerm,
      replayed: true};
  }
  const reserved = await propose(service, command);
  return reserved;
}

function publishParticipantReleaseClaim(service, options) {
  const state = readParticipantReleaseState(service.db);
  const existing = controlRecord(state);
  const previous = existing?.memberClaims?.find((claim) =>
    claim.target?.replicaIdentity === options.target?.replicaIdentity);
  if (existing?.state === RELEASE_CONTROL_STATE.RESERVED &&
      existing.authorizationId === options.authorizationId &&
      previous?.claimState === RELEASE_MEMBER_CLAIM_STATE.CURRENT &&
      JSON.stringify(previous.target) === JSON.stringify(options.target)) {
    return Promise.resolve({success: true, outcome: RELEASE_APPLY_RESULT.RESERVED,
      claimRevision: previous.claimRevision,
      controlRevision: state.controlRevision,
      claimIndex: previous.claimIndex, claimTerm: previous.claimTerm,
      replayed: true});
  }
  return propose(service, buildParticipantReleasePublishClaimCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function recordParticipantReleaseShare(service, options) {
  const state = readParticipantReleaseState(service.db);
  const existing = controlRecord(state);
  const targetText = JSON.stringify(options.target);
  const previous = existing?.memberShares?.find((share) =>
    share.replicaIdentity === options.target?.replicaIdentity);
  if (existing?.state === RELEASE_CONTROL_STATE.RESERVED &&
      existing.authorizationId === options.authorizationId &&
      previous?.claimRevision === options.claimRevision &&
      previous.targetEntryText === targetText) {
    return Promise.resolve({success: true, outcome: RELEASE_APPLY_RESULT.RESERVED,
      controlRevision: state.controlRevision,
      shareIndex: previous.shareIndex, shareTerm: previous.shareTerm,
      replayed: true});
  }
  return propose(service, buildParticipantReleaseRecordShareCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function recordParticipantReleaseReceipt(service, options) {
  const state = readParticipantReleaseState(service.db);
  const existing = controlRecord(state);
  const previous = existing?.targetReceipts?.find((candidate) =>
    candidate.receipt?.replicaIdentity === options.receipt?.replicaIdentity);
  if ([RELEASE_CONTROL_STATE.DISPATCHED, RELEASE_CONTROL_STATE.CONFIRMED]
    .includes(existing?.state) &&
      existing.authorizationId === options.authorizationId &&
      previous?.receiptState === RELEASE_MEMBER_CLAIM_STATE.CURRENT &&
      JSON.stringify(previous.receipt) === JSON.stringify(options.receipt)) {
    return Promise.resolve({success: true,
      outcome: RELEASE_APPLY_RESULT.DISPATCHED,
      controlRevision: state.controlRevision,
      receiptRevision: previous.receiptRevision,
      receiptIndex: previous.receiptIndex, receiptTerm: previous.receiptTerm,
      replayed: true});
  }
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
  const existing = controlRecord(state);
  if ([RELEASE_CONTROL_STATE.DISPATCHED, RELEASE_CONTROL_STATE.CONFIRMED]
    .includes(existing?.state) &&
      existing.authorizationId === options.authorizationId) {
    return Promise.resolve({success: true,
      outcome: RELEASE_APPLY_RESULT.DISPATCHED,
      controlRevision: state.controlRevision,
      dispatchIndex: existing.dispatchIndex,
      dispatchTerm: existing.dispatchTerm,
      replayed: true});
  }
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
  const existing = controlRecord(state);
  if (existing?.state === RELEASE_CONTROL_STATE.CONFIRMED &&
      existing.authorizationId === options.authorizationId &&
      existing.receiptsText === JSON.stringify(options.receipts)) {
    return Promise.resolve({success: true,
      outcome: RELEASE_APPLY_RESULT.CONFIRMED,
      controlRevision: state.controlRevision,
      confirmationIndex: existing.confirmationIndex,
      confirmationTerm: existing.confirmationTerm,
      replayed: true});
  }
  return propose(service, buildParticipantReleaseConfirmCommand({
    ...options, controlPartitionId: service.partitionId,
    expectedControlRevision: state.controlRevision,
  }, stampOf(service)));
}

function resumeParticipantAdmission(service, options) {
  const state = readParticipantReleaseState(service.db);
  const command = buildParticipantAdmissionResumeCommand({
    ...options, partitionId: service.partitionId,
    expectedPauseGeneration: state.pauseGeneration,
  }, stampOf(service));
  const existing = parseJson(state.authorizationText);
  if (command !== null && existing?.resumeEntryId === command.entryId &&
      existing.authorizationIndex === state.authorizationIndex &&
      existing.authorizationTerm === state.authorizationTerm) {
    return Promise.resolve({success: true, outcome: RELEASE_APPLY_RESULT.RESUMED,
      resumeEntryId: existing.resumeEntryId,
      pauseGeneration: state.pauseGeneration,
      authorizationIndex: state.authorizationIndex,
      authorizationTerm: state.authorizationTerm,
      replayed: true});
  }
  return propose(service, command);
}

function observeParticipantAdmissionResume(service, options) {
  const state = readParticipantReleaseState(service.db);
  const command = buildParticipantAdmissionResumeCommand({
    ...options, partitionId: service.partitionId,
    expectedPauseGeneration: state.pauseGeneration,
  }, stampOf(service));
  const existing = parseJson(state.authorizationText);
  return command !== null && existing?.resumeEntryId === command.entryId &&
    existing.authorizationIndex === state.authorizationIndex &&
    existing.authorizationTerm === state.authorizationTerm ? {
      success: true, outcome: RELEASE_APPLY_RESULT.RESUMED,
      resumeEntryId: existing.resumeEntryId,
      pauseGeneration: state.pauseGeneration,
      authorizationIndex: state.authorizationIndex,
      authorizationTerm: state.authorizationTerm,
      replayed: true,
    } : null;
}

export {
  confirmParticipantRelease,
  dispatchParticipantRelease,
  finalizeReservedParticipantRelease,
  observeParticipantAdmissionPause,
  observeParticipantAdmissionResume,
  pauseParticipantAdmission,
  publishParticipantReleaseClaim,
  recordParticipantReleaseShare,
  recordParticipantReleaseReceipt,
  reserveParticipantRelease,
  resumeParticipantAdmission,
  retireParticipantRelease,
};
