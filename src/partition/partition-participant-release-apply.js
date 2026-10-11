import {PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME} from
  './partition-service-constants.js';
import {PARTICIPANT_TRANSACTION_COMMAND as COMMAND} from
  './partition-participant-transaction-constants.js';
import {
  RELEASE_APPLY_RESULT as RESULT,
  RELEASE_CONTROL_STATE as CONTROL_STATE,
  canonicalConfiguration,
  parseJson,
} from './partition-participant-release-command.js';
import {
  applyParticipantAdmissionPause,
  applyParticipantReleaseAuthorization,
  readParticipantReleaseState,
  updateParticipantReleaseControl,
} from './partition-participant-transaction-store.js';

function resolve(service, committed, result) {
  committed.afterCommit(() => service.resolveCommittedWrite(
    committed.command.entryId,
    {success: [RESULT.PAUSED, RESULT.RESERVED, RESULT.AUTHORIZED,
      RESULT.DISPATCHED, RESULT.RETIRED, RESULT.RESUMED,
      RESULT.CONFIRMED].includes(result.outcome),
    partitionId: service.partitionId, ...result},
  ));
}

function controlRecord(state) {
  return parseJson(state.controlText);
}

function authorizationRecord(state) {
  return parseJson(state.authorizationText);
}

function committedConfigurationText(committed) {
  const configuration = canonicalConfiguration(committed.committedConfiguration);
  return configuration === null ? null : JSON.stringify(configuration);
}

function targetsMatchConfiguration(targets, configurationText) {
  const configuration = parseJson(configurationText);
  if (!Array.isArray(targets) || configuration === null) return false;
  const members = [...new Set([
    ...configuration.voters, ...configuration.votersOutgoing,
    ...configuration.learners, ...configuration.learnersNext,
  ])].map((peerId) => ({peerId, replicaIdentity: configuration.identities[peerId]}))
    .sort((left, right) => left.replicaIdentity.localeCompare(right.replicaIdentity));
  return JSON.stringify(members) === JSON.stringify(targets.map((target) =>
    ({peerId: target.peerId, replicaIdentity: target.replicaIdentity})));
}

function targetInConfiguration(target, configurationText) {
  const configuration = parseJson(configurationText);
  return target !== null && configuration !== null &&
    configuration.identities?.[target.peerId] === target.replicaIdentity;
}

function applyPause(service, committed) {
  const command = committed.command;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const updated = applyParticipantAdmissionPause(service.db, command.entryId);
  resolve(service, committed, {outcome: RESULT.PAUSED,
    replayed: !updated.applied,
    pauseGeneration: updated.state.pauseGeneration,
    pauseEntryId: updated.state.pauseEntryId});
  return updated.applied ? OUTCOME.APPLIED : OUTCOME.REPLAYED;
}

function commandMatchesControlRecord(command, record) {
  return record?.authorizationId === command.authorizationId &&
    record.controlReleaseText === command.controlReleaseText &&
    record.dependentReleaseText === command.dependentReleaseText &&
    record.controlTargetEntriesText === command.controlTargetEntriesText &&
    record.targetEntriesText === command.targetEntriesText &&
    record.controlConfigurationText === command.controlConfigurationText &&
    record.targetConfigurationText === command.targetConfigurationText &&
    record.deadlineAtMs === command.deadlineAtMs;
}

function applyReserve(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = controlRecord(before);
  if (existing?.state === CONTROL_STATE.RESERVED &&
      commandMatchesControlRecord(command, existing)) {
    resolve(service, committed, {outcome: RESULT.RESERVED, replayed: true,
      reservationId: existing.authorizationId,
      controlRevision: before.controlRevision,
      reservationIndex: existing.reservationIndex,
      reservationTerm: existing.reservationTerm});
    return OUTCOME.REPLAYED;
  }
  const controlTargets = parseJson(command.controlTargetEntriesText);
  if (before.controlRevision !== command.expectedControlRevision ||
      [CONTROL_STATE.RESERVED, CONTROL_STATE.AUTHORIZED,
        CONTROL_STATE.DISPATCHED].includes(existing?.state) ||
      existing?.state === CONTROL_STATE.RETIRED &&
        existing.authorizationId === command.authorizationId ||
      committedConfigurationText(committed) !== command.controlConfigurationText ||
      !targetsMatchConfiguration(controlTargets,
        command.controlConfigurationText)) {
    resolve(service, committed, {outcome: RESULT.STALE,
      controlRevision: before.controlRevision});
    return OUTCOME.RECORDED_ONLY;
  }
  const record = Object.freeze({version: 1, state: CONTROL_STATE.RESERVED,
    authorizationId: command.authorizationId, authorizationRevision: null,
    controlReleaseText: command.controlReleaseText,
    dependentReleaseText: command.dependentReleaseText,
    controlTargetEntriesText: command.controlTargetEntriesText,
    targetEntriesText: command.targetEntriesText,
    controlConfigurationText: command.controlConfigurationText,
    targetConfigurationText: command.targetConfigurationText,
    deadlineAtMs: command.deadlineAtMs,
    reservationEntryId: command.entryId, reservationIndex: index,
    reservationTerm: term, finalizationEntryId: null, controlIndex: null,
    controlTerm: null, retirementId: null, retiredReplicaIdentity: null});
  const after = updateParticipantReleaseControl(service.db,
    command.expectedControlRevision, JSON.stringify(record));
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.RESERVED,
    reservationId: command.authorizationId,
    controlRevision: after.controlRevision,
    reservationIndex: index, reservationTerm: term});
  return OUTCOME.APPLIED;
}

function applyFinalize(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = controlRecord(before);
  if (existing?.finalizationEntryId === command.entryId &&
      existing.authorizationId === command.authorizationId) {
    resolve(service, committed, {outcome: RESULT.AUTHORIZED, replayed: true,
      authorizationId: existing.authorizationId,
      authorizationRevision: existing.authorizationRevision,
      controlIndex: existing.controlIndex, controlTerm: existing.controlTerm});
    return OUTCOME.REPLAYED;
  }
  const controlTargets = parseJson(command.controlTargetEntriesText);
  if (before.controlRevision !== command.expectedControlRevision ||
      existing?.state !== CONTROL_STATE.RESERVED ||
      !commandMatchesControlRecord(command, existing) ||
      committedConfigurationText(committed) !== command.controlConfigurationText ||
      !targetsMatchConfiguration(controlTargets,
        command.controlConfigurationText)) {
    resolve(service, committed, {outcome: RESULT.STALE,
      controlRevision: before.controlRevision,
      expectedConfigurationText: command.controlConfigurationText,
      committedConfigurationText: committedConfigurationText(committed),
      committedConfiguration: committed.committedConfiguration ?? null});
    return OUTCOME.RECORDED_ONLY;
  }
  const authorizationRevision = before.controlRevision + 1;
  const record = Object.freeze({...existing, state: CONTROL_STATE.AUTHORIZED,
    authorizationRevision,
    finalizationEntryId: command.entryId, controlIndex: index, controlTerm: term,
    retirementId: null, retiredReplicaIdentity: null});
  const after = updateParticipantReleaseControl(service.db,
    command.expectedControlRevision, JSON.stringify(record));
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.AUTHORIZED,
    authorizationId: command.authorizationId, authorizationRevision,
    controlIndex: index, controlTerm: term});
  return OUTCOME.APPLIED;
}

function applyDispatch(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = controlRecord(before);
  if (existing?.state === CONTROL_STATE.DISPATCHED &&
      existing.authorizationId === command.authorizationId) {
    resolve(service, committed, {outcome: RESULT.DISPATCHED, replayed: true,
      controlRevision: before.controlRevision,
      dispatchIndex: existing.dispatchIndex, dispatchTerm: existing.dispatchTerm});
    return OUTCOME.REPLAYED;
  }
  if (before.controlRevision !== command.expectedControlRevision ||
      existing?.state !== CONTROL_STATE.AUTHORIZED ||
      existing.authorizationId !== command.authorizationId) {
    resolve(service, committed, {outcome: RESULT.STALE,
      controlRevision: before.controlRevision});
    return OUTCOME.RECORDED_ONLY;
  }
  const record = Object.freeze({...existing, state: CONTROL_STATE.DISPATCHED,
    dispatchEntryId: command.entryId, dispatchIndex: index, dispatchTerm: term});
  const after = updateParticipantReleaseControl(service.db,
    command.expectedControlRevision, JSON.stringify(record));
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.DISPATCHED,
    controlRevision: after.controlRevision,
    dispatchIndex: index, dispatchTerm: term});
  return OUTCOME.APPLIED;
}

function applyRetire(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = controlRecord(before);
  if (existing?.retirementId === command.retirementId &&
      existing.authorizationId === command.authorizationId) {
    resolve(service, committed, {outcome: RESULT.RETIRED, replayed: true,
      controlRevision: before.controlRevision,
      retirementIndex: existing.retirementIndex,
      retirementTerm: existing.retirementTerm});
    return OUTCOME.REPLAYED;
  }
  if (before.controlRevision !== command.expectedControlRevision ||
      existing !== null && existing.authorizationId !== command.authorizationId &&
      existing.state !== CONTROL_STATE.CONFIRMED) {
    resolve(service, committed, {outcome: RESULT.STALE,
      controlRevision: before.controlRevision});
    return OUTCOME.RECORDED_ONLY;
  }
  const active = existing?.authorizationId === command.authorizationId ?
    existing : null;
  const record = Object.freeze({
    ...(active ?? {version: 1, authorizationId: command.authorizationId,
      authorizationRevision: null, controlReleaseText: null,
      dependentReleaseText: null, controlTargetEntriesText: null,
      targetEntriesText: null, deadlineAtMs: null,
      finalizationEntryId: null, controlIndex: null, controlTerm: null}),
    state: CONTROL_STATE.RETIRED, retirementId: command.retirementId,
    retiredReplicaIdentity: command.retiredReplicaIdentity,
    retirementIndex: index, retirementTerm: term,
  });
  const after = updateParticipantReleaseControl(service.db,
    command.expectedControlRevision, JSON.stringify(record));
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.RETIRED,
    controlRevision: after.controlRevision,
    retirementIndex: index, retirementTerm: term});
  return OUTCOME.APPLIED;
}

function applyResume(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = authorizationRecord(before);
  if (existing?.resumeEntryId === command.entryId) {
    resolve(service, committed, {outcome: RESULT.RESUMED, replayed: true,
      resumeEntryId: command.entryId,
      pauseGeneration: before.pauseGeneration,
      authorizationIndex: before.authorizationIndex,
      authorizationTerm: before.authorizationTerm});
    return OUTCOME.REPLAYED;
  }
  const target = parseJson(command.targetEntryText);
  if (before.pauseGeneration !== command.expectedPauseGeneration ||
      committedConfigurationText(committed) !== command.targetConfigurationText ||
      !targetInConfiguration(target, command.targetConfigurationText)) {
    resolve(service, committed, {outcome: RESULT.STALE,
      pauseGeneration: before.pauseGeneration});
    return OUTCOME.RECORDED_ONLY;
  }
  const record = Object.freeze({version: 1,
    dependentReleaseText: command.dependentReleaseText,
    controlPartitionId: command.controlPartitionId,
    controlAuthorizationId: command.controlAuthorizationId,
    controlAuthorizationRevision: command.controlAuthorizationRevision,
    targetEntryText: command.targetEntryText,
    targetConfigurationText: command.targetConfigurationText,
    expectedPauseGeneration: command.expectedPauseGeneration,
    resumeEntryId: command.entryId, authorizationIndex: index,
    authorizationTerm: term});
  const after = applyParticipantReleaseAuthorization(service.db, {
    text: JSON.stringify(record), index, term,
    expectedPauseGeneration: command.expectedPauseGeneration,
  });
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.RESUMED,
    resumeEntryId: command.entryId,
    pauseGeneration: after.pauseGeneration,
    authorizationIndex: index, authorizationTerm: term});
  return OUTCOME.APPLIED;
}

function applyConfirm(service, committed) {
  const {command, index, term} = committed;
  if (command.partitionId !== service.partitionId) {
    resolve(service, committed, {outcome: RESULT.INVALID});
    return OUTCOME.RECORDED_ONLY;
  }
  const before = readParticipantReleaseState(service.db);
  const existing = controlRecord(before);
  if (existing?.confirmationEntryId === command.entryId &&
      existing.authorizationId === command.authorizationId) {
    resolve(service, committed, {outcome: RESULT.CONFIRMED, replayed: true,
      controlRevision: before.controlRevision,
      confirmationIndex: existing.confirmationIndex,
      confirmationTerm: existing.confirmationTerm});
    return OUTCOME.REPLAYED;
  }
  const targets = parseJson(existing?.targetEntriesText);
  const receipts = parseJson(command.receiptsText);
  const expectedReceipts = Array.isArray(targets) ? targets.map((target) => ({
    ...target,
    resumeEntryId: receipts?.find((receipt) =>
      receipt.replicaIdentity === target.replicaIdentity)?.resumeEntryId,
    authorizationIndex: receipts?.find((receipt) =>
      receipt.replicaIdentity === target.replicaIdentity)?.authorizationIndex,
    authorizationTerm: receipts?.find((receipt) =>
      receipt.replicaIdentity === target.replicaIdentity)?.authorizationTerm,
    pauseGeneration: receipts?.find((receipt) =>
      receipt.replicaIdentity === target.replicaIdentity)?.pauseGeneration,
  })) : null;
  if (before.controlRevision !== command.expectedControlRevision ||
      existing?.state !== CONTROL_STATE.DISPATCHED ||
      existing.authorizationId !== command.authorizationId ||
      JSON.stringify(expectedReceipts) !== JSON.stringify(receipts)) {
    resolve(service, committed, {outcome: RESULT.STALE,
      controlRevision: before.controlRevision});
    return OUTCOME.RECORDED_ONLY;
  }
  const record = Object.freeze({...existing, state: CONTROL_STATE.CONFIRMED,
    receiptsText: command.receiptsText, confirmationEntryId: command.entryId,
    confirmationIndex: index, confirmationTerm: term});
  const after = updateParticipantReleaseControl(service.db,
    command.expectedControlRevision, JSON.stringify(record));
  if (after === null) {
    resolve(service, committed, {outcome: RESULT.STALE});
    return OUTCOME.RECORDED_ONLY;
  }
  resolve(service, committed, {outcome: RESULT.CONFIRMED,
    controlRevision: after.controlRevision,
    confirmationIndex: index, confirmationTerm: term});
  return OUTCOME.APPLIED;
}

function applyParticipantReleaseCommand(service, committed) {
  switch (committed.command.type) {
  case COMMAND.ADMISSION_PAUSE: return applyPause(service, committed);
  case COMMAND.RELEASE_RESERVE: return applyReserve(service, committed);
  case COMMAND.RELEASE_FINALIZE: return applyFinalize(service, committed);
  case COMMAND.RELEASE_DISPATCH: return applyDispatch(service, committed);
  case COMMAND.RELEASE_RETIRE: return applyRetire(service, committed);
  case COMMAND.ADMISSION_RESUME: return applyResume(service, committed);
  case COMMAND.RELEASE_CONFIRM: return applyConfirm(service, committed);
  default: throw new Error('Unknown participant release command');
  }
}

export {applyParticipantReleaseCommand};
