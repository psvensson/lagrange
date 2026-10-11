import {createHash} from 'node:crypto';
import {PARTICIPANT_TRANSACTION_COMMAND as COMMAND} from
  './partition-participant-transaction-constants.js';
import {releaseIdentityValid} from './partition-participant-release-identity.js';

const HASH = 'sha256';
const HEX = 'hex';
const DIGEST = /^[a-f0-9]{64}$/u;
const RELEASE_CONTROL_STATE = Object.freeze({
  RESERVED: 'RESERVED',
  AUTHORIZED: 'RESUME_AUTHORIZED',
  DISPATCHED: 'RESUME_DISPATCHED',
  RETIRED: 'RETIRED',
  CONFIRMED: 'CONFIRMED',
});
const RELEASE_APPLY_RESULT = Object.freeze({
  PAUSED: 'PAUSED',
  RESERVED: 'RESERVED',
  AUTHORIZED: 'AUTHORIZED',
  DISPATCHED: 'DISPATCHED',
  RETIRED: 'RETIRED',
  RESUMED: 'RESUMED',
  CONFIRMED: 'CONFIRMED',
  STALE: 'STALE',
  INVALID: 'INVALID',
});

const nonempty = (value) => typeof value === 'string' && value.length > 0;
const ordinal = (value) => Number.isSafeInteger(value) && value >= 0 &&
  !Object.is(value, -0);
const positive = (value) => ordinal(value) && value > 0;
const incarnation = (value) => nonempty(value) || positive(value);
const exact = (value, fields) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === fields.length &&
  fields.every((field) => Object.hasOwn(value, field));
const hash = (text) => createHash(HASH).update(text).digest(HEX);

const GENERATION_FIELDS = Object.freeze([
  'nodeId', 'ownerIncarnation', 'replicaId', 'lifecycleIncarnation',
  'runtimeGeneration', 'connectionGeneration', 'admissionGeneration',
]);
const TARGET_FIELDS = Object.freeze([
  'replicaIdentity', 'peerId', 'nodeId', 'ownerIncarnation',
  'lifecycleIncarnation', 'runtimeGeneration', 'connectionGeneration',
  'admissionGeneration', 'buildDigest',
]);
const CONFIGURATION_FIELDS = Object.freeze([
  'voters', 'votersOutgoing', 'learners', 'learnersNext',
  'configurationKey', 'membershipGenerationIndex', 'identities',
]);

function generationValid(generation) {
  return exact(generation, GENERATION_FIELDS) &&
    nonempty(generation.nodeId) && nonempty(generation.replicaId) &&
    positive(generation.ownerIncarnation) &&
    incarnation(generation.lifecycleIncarnation) &&
    positive(generation.runtimeGeneration) &&
    positive(generation.connectionGeneration) &&
    positive(generation.admissionGeneration);
}

function targetEntryOf(facts) {
  const generation = facts?.generation;
  const peer = facts?.peers?.find((candidate) =>
    candidate.replicaIdentity === generation?.replicaId);
  const peerId = peer?.peerId ?? Object.entries(facts?.membership?.identities ?? {})
    .find(([, replicaIdentity]) => replicaIdentity === generation?.replicaId)?.[0];
  if (!generationValid(generation) || !nonempty(String(peerId ?? '')) ||
      !DIGEST.test(facts?.buildDigest ?? '')) return null;
  return Object.freeze({
    replicaIdentity: generation.replicaId,
    peerId: String(peerId),
    nodeId: generation.nodeId,
    ownerIncarnation: generation.ownerIncarnation,
    lifecycleIncarnation: generation.lifecycleIncarnation,
    runtimeGeneration: generation.runtimeGeneration,
    connectionGeneration: generation.connectionGeneration,
    admissionGeneration: generation.admissionGeneration,
    buildDigest: facts.buildDigest,
  });
}

function targetEntryValid(target) {
  return exact(target, TARGET_FIELDS) && nonempty(target.replicaIdentity) &&
    nonempty(target.peerId) && nonempty(target.nodeId) &&
    positive(target.ownerIncarnation) && incarnation(target.lifecycleIncarnation) &&
    positive(target.runtimeGeneration) && positive(target.connectionGeneration) &&
    positive(target.admissionGeneration) && DIGEST.test(target.buildDigest);
}

function canonicalConfiguration(configuration) {
  if (configuration === null || typeof configuration !== 'object' ||
      Array.isArray(configuration) ||
      !CONFIGURATION_FIELDS.every((field) => Object.hasOwn(configuration, field)) ||
      !nonempty(configuration.configurationKey) ||
      !ordinal(configuration.membershipGenerationIndex) ||
      configuration.identities === null ||
      typeof configuration.identities !== 'object' ||
      Array.isArray(configuration.identities)) return null;
  const lists = CONFIGURATION_FIELDS.slice(0, 4).map((field) =>
    Array.isArray(configuration[field]) ?
      [...configuration[field]].map(String).sort() : null);
  if (lists.includes(null)) return null;
  const peerIds = [...new Set(lists.flat())].sort();
  if (peerIds.some((peerId) => !nonempty(configuration.identities[peerId]))) return null;
  const identities = {};
  for (const peerId of peerIds) identities[peerId] = configuration.identities[peerId];
  return Object.freeze({voters: lists[0], votersOutgoing: lists[1],
    learners: lists[2], learnersNext: lists[3],
    configurationKey: configuration.configurationKey,
    membershipGenerationIndex: configuration.membershipGenerationIndex,
    identities: Object.freeze(identities)});
}

function configurationOfCensus(census) {
  if (!Array.isArray(census) || census.length === 0) return null;
  const configuration = canonicalConfiguration(census[0]?.membership);
  if (configuration === null) return null;
  const text = JSON.stringify(configuration);
  return census.every((facts) =>
    JSON.stringify(canonicalConfiguration(facts?.membership)) === text) ? text : null;
}

function canonicalTargets(census) {
  if (!Array.isArray(census) || census.length === 0) return null;
  const targets = census.map(targetEntryOf);
  if (targets.includes(null)) return null;
  targets.sort((left, right) =>
    left.replicaIdentity < right.replicaIdentity ? -1 :
      left.replicaIdentity > right.replicaIdentity ? 1 : 0);
  if (new Set(targets.map((target) => target.replicaIdentity)).size !== targets.length) {
    return null;
  }
  return Object.freeze(targets);
}

function canonicalStamp(stamp) {
  return Object.freeze({timestamp: stamp.timestamp, proposedBy: stamp.proposedBy,
    proposedAt: stamp.proposedAt});
}

function stampValid(command) {
  return nonempty(command.timestamp) && nonempty(command.proposedBy) &&
    ordinal(command.proposedAt);
}

function commandId(type, body) {
  return `${type.toLowerCase()}:${hash(JSON.stringify(body))}`;
}

function buildParticipantAdmissionPauseCommand(partitionId, pauseInvocationId, stamp) {
  if (!nonempty(partitionId) || !nonempty(pauseInvocationId)) return null;
  const body = Object.freeze({partitionId, pauseInvocationId});
  return Object.freeze({type: COMMAND.ADMISSION_PAUSE,
    entryId: commandId(COMMAND.ADMISSION_PAUSE, body), ...body,
    ...canonicalStamp(stamp)});
}

function buildParticipantReleaseDecisionCommand(type, {controlPartitionId,
  dependentRelease, controlRelease, controlCensus, dependentCensus,
  authorizationId,
  expectedControlRevision, deadlineAtMs}, stamp) {
  const controlTargets = canonicalTargets(controlCensus);
  const targets = canonicalTargets(dependentCensus);
  const controlConfigurationText = configurationOfCensus(controlCensus);
  const targetConfigurationText = configurationOfCensus(dependentCensus);
  if (!nonempty(controlPartitionId) || !releaseIdentityValid(controlRelease) ||
      !releaseIdentityValid(dependentRelease) || controlTargets === null ||
      targets === null || controlConfigurationText === null ||
      targetConfigurationText === null ||
      !nonempty(authorizationId) || !ordinal(expectedControlRevision) ||
      !positive(deadlineAtMs)) return null;
  const body = Object.freeze({partitionId: controlPartitionId,
    expectedControlRevision, authorizationId,
    controlReleaseText: JSON.stringify(controlRelease),
    dependentReleaseText: JSON.stringify(dependentRelease),
    controlTargetEntriesText: JSON.stringify(controlTargets),
    targetEntriesText: JSON.stringify(targets), controlConfigurationText,
    targetConfigurationText, deadlineAtMs});
  return Object.freeze({type,
    entryId: commandId(type, body), ...body,
    ...canonicalStamp(stamp)});
}

function buildParticipantReleaseReserveCommand(options, stamp) {
  return buildParticipantReleaseDecisionCommand(COMMAND.RELEASE_RESERVE,
    options, stamp);
}

function buildParticipantReleaseFinalizeCommand(options, stamp) {
  return buildParticipantReleaseDecisionCommand(COMMAND.RELEASE_FINALIZE,
    options, stamp);
}

function buildParticipantReleaseDispatchCommand({controlPartitionId,
  authorizationId, expectedControlRevision}, stamp) {
  if (!nonempty(controlPartitionId) || !nonempty(authorizationId) ||
      !positive(expectedControlRevision)) return null;
  const body = Object.freeze({partitionId: controlPartitionId,
    authorizationId, expectedControlRevision});
  return Object.freeze({type: COMMAND.RELEASE_DISPATCH,
    entryId: commandId(COMMAND.RELEASE_DISPATCH, body), ...body,
    ...canonicalStamp(stamp)});
}

function buildParticipantReleaseRetireCommand({controlPartitionId,
  authorizationId, expectedControlRevision, retiredReplicaIdentity,
  retirementId}, stamp) {
  if (![controlPartitionId, authorizationId, retiredReplicaIdentity, retirementId]
    .every(nonempty) || !ordinal(expectedControlRevision)) return null;
  const body = Object.freeze({partitionId: controlPartitionId, authorizationId,
    expectedControlRevision, retiredReplicaIdentity, retirementId});
  return Object.freeze({type: COMMAND.RELEASE_RETIRE,
    entryId: commandId(COMMAND.RELEASE_RETIRE, body), ...body,
    ...canonicalStamp(stamp)});
}

const RECEIPT_FIELDS = Object.freeze([...TARGET_FIELDS, 'resumeEntryId',
  'authorizationIndex', 'authorizationTerm', 'pauseGeneration']);

function canonicalReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) return null;
  const canonical = receipts.map((receipt) => exact(receipt, RECEIPT_FIELDS) &&
    targetEntryValid(Object.fromEntries(TARGET_FIELDS.map((field) =>
      [field, receipt[field]]))) && nonempty(receipt.resumeEntryId) &&
    positive(receipt.authorizationIndex) &&
    positive(receipt.authorizationTerm) && ordinal(receipt.pauseGeneration) ?
    Object.freeze({...receipt}) : null);
  if (canonical.includes(null)) return null;
  canonical.sort((left, right) =>
    left.replicaIdentity < right.replicaIdentity ? -1 :
      left.replicaIdentity > right.replicaIdentity ? 1 : 0);
  return new Set(canonical.map((receipt) => receipt.replicaIdentity)).size ===
    canonical.length ? Object.freeze(canonical) : null;
}

function buildParticipantReleaseConfirmCommand({controlPartitionId,
  authorizationId, expectedControlRevision, receipts}, stamp) {
  const canonical = canonicalReceipts(receipts);
  if (!nonempty(controlPartitionId) || !nonempty(authorizationId) ||
      !positive(expectedControlRevision) || canonical === null) return null;
  const body = Object.freeze({partitionId: controlPartitionId, authorizationId,
    expectedControlRevision, receiptsText: JSON.stringify(canonical)});
  return Object.freeze({type: COMMAND.RELEASE_CONFIRM,
    entryId: commandId(COMMAND.RELEASE_CONFIRM, body), ...body,
    ...canonicalStamp(stamp)});
}

function buildParticipantAdmissionResumeCommand({partitionId, dependentRelease,
  controlPartitionId, controlAuthorizationId, controlAuthorizationRevision,
  expectedPauseGeneration, target, census}, stamp) {
  const targetConfigurationText = configurationOfCensus(census);
  if (!nonempty(partitionId) || !releaseIdentityValid(dependentRelease) ||
      dependentRelease.partitionId !== partitionId || !nonempty(controlPartitionId) ||
      !nonempty(controlAuthorizationId) || !positive(controlAuthorizationRevision) ||
      !ordinal(expectedPauseGeneration) || !targetEntryValid(target) ||
      targetConfigurationText === null) return null;
  const body = Object.freeze({partitionId,
    dependentReleaseText: JSON.stringify(dependentRelease), controlPartitionId,
    controlAuthorizationId, controlAuthorizationRevision,
    expectedPauseGeneration, targetEntryText: JSON.stringify(target),
    targetConfigurationText});
  return Object.freeze({type: COMMAND.ADMISSION_RESUME,
    entryId: commandId(COMMAND.ADMISSION_RESUME, body), ...body,
    ...canonicalStamp(stamp)});
}

function parseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pinnedPause(command) {
  const fields = ['type', 'entryId', 'partitionId', 'pauseInvocationId',
    'timestamp', 'proposedBy', 'proposedAt'];
  if (!exact(command, fields) || !stampValid(command)) return false;
  const rebuilt = buildParticipantAdmissionPauseCommand(command.partitionId,
    command.pauseInvocationId, command);
  return rebuilt !== null && rebuilt.entryId === command.entryId;
}

function pinnedDecision(command, type) {
  const fields = ['type', 'entryId', 'partitionId', 'expectedControlRevision',
    'authorizationId', 'controlReleaseText', 'dependentReleaseText',
    'controlTargetEntriesText', 'targetEntriesText', 'controlConfigurationText',
    'targetConfigurationText', 'deadlineAtMs',
    'timestamp', 'proposedBy', 'proposedAt'];
  if (!exact(command, fields) || !stampValid(command)) return false;
  const controlRelease = parseJson(command.controlReleaseText);
  const dependentRelease = parseJson(command.dependentReleaseText);
  const controlTargets = parseJson(command.controlTargetEntriesText);
  const targets = parseJson(command.targetEntriesText);
  const controlConfiguration = parseJson(command.controlConfigurationText);
  const targetConfiguration = parseJson(command.targetConfigurationText);
  if (!releaseIdentityValid(controlRelease) ||
      controlRelease.partitionId !== command.partitionId ||
      !releaseIdentityValid(dependentRelease) ||
      !Array.isArray(controlTargets) || controlTargets.length === 0 ||
      !controlTargets.every(targetEntryValid) ||
      controlTargets.some((target, index) => index > 0 &&
        controlTargets[index - 1].replicaIdentity >= target.replicaIdentity) ||
      !Array.isArray(targets) ||
      targets.length === 0 || !targets.every(targetEntryValid) ||
      targets.some((target, index) => index > 0 &&
        targets[index - 1].replicaIdentity >= target.replicaIdentity) ||
      canonicalConfiguration(controlConfiguration) === null ||
      JSON.stringify(canonicalConfiguration(controlConfiguration)) !==
        command.controlConfigurationText ||
      canonicalConfiguration(targetConfiguration) === null ||
      JSON.stringify(canonicalConfiguration(targetConfiguration)) !==
        command.targetConfigurationText ||
      !nonempty(command.authorizationId) ||
      !ordinal(command.expectedControlRevision) || !positive(command.deadlineAtMs)) {
    return false;
  }
  const body = {partitionId: command.partitionId,
    expectedControlRevision: command.expectedControlRevision,
    authorizationId: command.authorizationId,
    controlReleaseText: command.controlReleaseText,
    dependentReleaseText: command.dependentReleaseText,
    controlTargetEntriesText: command.controlTargetEntriesText,
    targetEntriesText: command.targetEntriesText,
    controlConfigurationText: command.controlConfigurationText,
    targetConfigurationText: command.targetConfigurationText,
    deadlineAtMs: command.deadlineAtMs};
  return command.type === type && command.entryId === commandId(type, body);
}

function pinnedDispatch(command) {
  const fields = ['type', 'entryId', 'partitionId', 'authorizationId',
    'expectedControlRevision', 'timestamp', 'proposedBy', 'proposedAt'];
  if (!exact(command, fields) || !stampValid(command) ||
      !nonempty(command.partitionId) || !nonempty(command.authorizationId) ||
      !positive(command.expectedControlRevision)) return false;
  const body = {partitionId: command.partitionId,
    authorizationId: command.authorizationId,
    expectedControlRevision: command.expectedControlRevision};
  return command.entryId === commandId(COMMAND.RELEASE_DISPATCH, body);
}

function pinnedRetire(command) {
  const fields = ['type', 'entryId', 'partitionId', 'authorizationId',
    'expectedControlRevision', 'retiredReplicaIdentity', 'retirementId',
    'timestamp', 'proposedBy', 'proposedAt'];
  if (!exact(command, fields) || !stampValid(command) ||
      ![command.partitionId, command.authorizationId,
        command.retiredReplicaIdentity, command.retirementId].every(nonempty) ||
      !ordinal(command.expectedControlRevision)) return false;
  const body = {partitionId: command.partitionId,
    authorizationId: command.authorizationId,
    expectedControlRevision: command.expectedControlRevision,
    retiredReplicaIdentity: command.retiredReplicaIdentity,
    retirementId: command.retirementId};
  return command.entryId === commandId(COMMAND.RELEASE_RETIRE, body);
}

function pinnedResume(command) {
  const fields = ['type', 'entryId', 'partitionId', 'dependentReleaseText',
    'controlPartitionId', 'controlAuthorizationId',
    'controlAuthorizationRevision', 'expectedPauseGeneration',
    'targetEntryText', 'targetConfigurationText',
    'timestamp', 'proposedBy', 'proposedAt'];
  if (!exact(command, fields) || !stampValid(command)) return false;
  const release = parseJson(command.dependentReleaseText);
  const target = parseJson(command.targetEntryText);
  const targetConfiguration = parseJson(command.targetConfigurationText);
  if (!releaseIdentityValid(release) || release.partitionId !== command.partitionId ||
      !nonempty(command.controlPartitionId) ||
      !nonempty(command.controlAuthorizationId) ||
      !positive(command.controlAuthorizationRevision) ||
      !ordinal(command.expectedPauseGeneration) || !targetEntryValid(target) ||
      canonicalConfiguration(targetConfiguration) === null ||
      JSON.stringify(canonicalConfiguration(targetConfiguration)) !==
        command.targetConfigurationText) return false;
  const body = {partitionId: command.partitionId,
    dependentReleaseText: command.dependentReleaseText,
    controlPartitionId: command.controlPartitionId,
    controlAuthorizationId: command.controlAuthorizationId,
    controlAuthorizationRevision: command.controlAuthorizationRevision,
    expectedPauseGeneration: command.expectedPauseGeneration,
    targetEntryText: command.targetEntryText,
    targetConfigurationText: command.targetConfigurationText};
  return command.entryId === commandId(COMMAND.ADMISSION_RESUME, body);
}

function pinnedConfirm(command) {
  const fields = ['type', 'entryId', 'partitionId', 'authorizationId',
    'expectedControlRevision', 'receiptsText', 'timestamp', 'proposedBy',
    'proposedAt'];
  if (!exact(command, fields) || !stampValid(command)) return false;
  const receipts = parseJson(command.receiptsText);
  const canonical = canonicalReceipts(receipts);
  if (!nonempty(command.authorizationId) ||
      !positive(command.expectedControlRevision) || canonical === null ||
      JSON.stringify(canonical) !== command.receiptsText) return false;
  const body = {partitionId: command.partitionId,
    authorizationId: command.authorizationId,
    expectedControlRevision: command.expectedControlRevision,
    receiptsText: command.receiptsText};
  return nonempty(command.partitionId) &&
    command.entryId === commandId(COMMAND.RELEASE_CONFIRM, body);
}

function isPinnedParticipantReleaseCommand(command) {
  switch (command?.type) {
  case COMMAND.ADMISSION_PAUSE: return pinnedPause(command);
  case COMMAND.RELEASE_RESERVE: return pinnedDecision(command, COMMAND.RELEASE_RESERVE);
  case COMMAND.RELEASE_FINALIZE: return pinnedDecision(command, COMMAND.RELEASE_FINALIZE);
  case COMMAND.RELEASE_DISPATCH: return pinnedDispatch(command);
  case COMMAND.RELEASE_RETIRE: return pinnedRetire(command);
  case COMMAND.ADMISSION_RESUME: return pinnedResume(command);
  case COMMAND.RELEASE_CONFIRM: return pinnedConfirm(command);
  default: return false;
  }
}

export {
  RELEASE_APPLY_RESULT,
  RELEASE_CONTROL_STATE,
  buildParticipantAdmissionPauseCommand,
  buildParticipantAdmissionResumeCommand,
  buildParticipantReleaseReserveCommand,
  buildParticipantReleaseFinalizeCommand,
  buildParticipantReleaseDispatchCommand,
  buildParticipantReleaseConfirmCommand,
  buildParticipantReleaseRetireCommand,
  canonicalConfiguration,
  isPinnedParticipantReleaseCommand,
  parseJson,
  targetEntryOf,
  targetEntryValid,
};
