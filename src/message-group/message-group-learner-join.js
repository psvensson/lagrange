/**
 * A fresh message-group learner joins its existing group (FreshMG 6.B slice
 * B2), subordinate to the message-group consensus owner
 * (message-group-consensus-port.js). Two halves:
 *  - produceMessageGroupLearnerJoinDescriptor runs on the group's LEADER
 *    replica: its BOOTSTRAP-purpose committed membership (the native owner
 *    answers it on the leader only, never for a joint configuration, never
 *    with an unreserved identity) must name the exact learner, and an
 *    origin-bearing raft-rs replica image is sealed from that replica's own
 *    durable record at the same configuration;
 *  - createMessageGroupLearnerJoinCapability composes, for the target node,
 *    the joinMessageGroupReplicaAsLearner an admitted CREATE worker calls.
 *    Never over a present generation, it obtains the leader's descriptor,
 *    binds it to the recorded learner fact, installs the image through the
 *    install owner under the CREATE admission and the fact's basis, opens a
 *    MessageGroupService from that image alone (joining, elections deferred,
 *    no lone-founder path: the opened record makes it a learner the native
 *    owner never lets campaign), and answers RUNNING only once the group's
 *    current leader acknowledges it caught up to that leader's commit.
 * The cross-node routes (asking the leader, moving the image, reading the
 * leader's progress) are the host's; no production root composes them yet.
 */
import fs from 'node:fs';
import path from 'node:path';

import {SERVICE_TYPE} from '../constants/service.js';
import {registerMessageGroupTransportHandler, retireMessageGroupTransportHandler} from
  '../bootstrap/shared/message-group-transport-handler.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer, durableRecordBootstrap, replicaIdsOfStamp} from
  '../raft/raft-committed-membership-stamp.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {LEARNER_PROMOTION_PROOF_DECISION, LEARNER_PROMOTION_PROOF_REASON,
  evaluateLearnerPromotionProof} from '../raft/learner-promotion-progress.js';
import {RAFT_CHECKPOINT_CREATION_OUTCOME, RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME} from '../raft/snapshot-checkpoint-constants.js';
import {createSqliteStateMachineCheckpoint, readCheckpoint} from
  '../raft/snapshot-checkpoint-store.js';
import {requestSnapshotInstall, resolveReplicaCheckpointsRoot as checkpointsRootOf} from
  '../raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_OUTCOME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from
  '../raft/snapshot-install-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {RAFT_ROLE} from './constants.js';
import {readMessageGroupCommittedMembership} from './message-group-consensus-port.js';
import {MessageGroupService} from './message-group-service.js';
import {
  MESSAGE_GROUP_LEARNER_ACKNOWLEDGEMENT as ACK,
  MESSAGE_GROUP_LEARNER_JOIN_DEFAULT as DEFAULT,
  MESSAGE_GROUP_LEARNER_JOIN_DESCRIPTOR as DESCRIPTOR,
  MESSAGE_GROUP_LEARNER_JOIN_OUTCOME as OUTCOME,
  MESSAGE_GROUP_LEARNER_JOIN_REFUSAL as REFUSAL,
  MESSAGE_GROUP_LEARNER_PROGRESS as PROGRESS,
} from './message-group-learner-join-constants.js';

const CORE_OK = RAFT_OPERATION_OUTCOME.CORE_OK;
// The refusals the leader-side producer answers.
const PRODUCER_REFUSALS = Object.freeze(new Set([REFUSAL.DESCRIPTOR_UNAVAILABLE,
  REFUSAL.LEARNER_NOT_IN_CONFIGURATION, REFUSAL.DESCRIPTOR_MOVED]));
// The leader's acknowledgement, decided in this order: the first unmet fact
// names the state (a leader whose committed configuration no longer holds the
// learner REMOVED it; the existing promotion-progress predicate not granting
// is BEHIND).
const ACKNOWLEDGEMENT_RULES = Object.freeze([
  Object.freeze({fact: 'leads', state: ACK.LEADER_UNAVAILABLE}),
  Object.freeze({fact: 'holdsLearner', state: ACK.REMOVED}),
  Object.freeze({fact: 'caughtUp', state: ACK.BEHIND}),
]);

// A typed refusal of this join's own. Never deferRetry: the worker runs after
// the admission went MATERIALIZED, and this slice has no attempt rotation, so
// a redelivery finds the admission retained; a retry promise would be an
// endless loop. The cause (transient or not) stays in code and detail. An
// error an owner throws through the join keeps its own code and deferRetry
// (the admission owner's REPLICA_CREATE_ADMISSION_DEFERRED stays true).
function refusal(code, detail = null) {
  return Object.assign(new Error(detail === null ? code : `${code}: ${detail}`),
    {code, errorCode: code, detail, deferRetry: false});
}

// A configuration names exactly this learner: a learner, not a voter, under
// its own permanent identity.
function namesLearner(stamp, identity) {
  return stamp.learners.includes(identity.targetPeerId) &&
    !stamp.voters.includes(identity.targetPeerId) &&
    stamp.identities[identity.targetPeerId] === identity.targetReplicaId;
}

function learnerCheckpointIdentity(groupId, clusterId, membershipEpoch) {
  return Object.freeze({clusterId, raftGroupId: groupId,
    entity: Object.freeze({kind: SERVICE_TYPE.MESSAGE_GROUP, id: groupId}),
    membershipEpoch});
}

async function sealLeaderImage(leader, options, stamp) {
  const identity = learnerCheckpointIdentity(leader.groupId, options.clusterId,
    stamp.membershipGenerationIndex);
  const created = await createSqliteStateMachineCheckpoint({db: leader.db, identity,
    checkpointsRoot: options.checkpointsRoot, raftRsGroupId: leader.groupId});
  if (created.outcome !== RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED) {
    return {refusal: REFUSAL.DESCRIPTOR_UNAVAILABLE, detail: created.outcome};
  }
  // The stamp and the image are two reads of the leader. The image's epoch
  // is the stamp's configuration generation, and the checkpoint owner holds
  // an image's own generation to its epoch: a configuration that moved
  // between the two reads leaves an invalid image, so the descriptor moved.
  const sealed = readCheckpoint({checkpointDir: created.checkpointDir, expectedIdentity: identity});
  if (sealed.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return {refusal: REFUSAL.DESCRIPTOR_MOVED, detail: sealed.outcome};
  }
  return {identity, generationIndex: sealed.descriptor.lastIncludedIndex};
}

/**
 * The leader replica's join descriptor for one recorded learner.
 * @param {Object} leader - The group's replica asked: {groupId, raft, db}
 *   (a MessageGroupService has all three).
 * @param {Object} options - {checkpointsRoot (leader-local), clusterId}.
 * @param {Object} learner - {targetReplicaId, targetPeerId}.
 * @return {Promise<Object>} Frozen {descriptor} or {refusal, detail}.
 */
async function produceMessageGroupLearnerJoinDescriptor(leader, options, learner) {
  try {
    const answer = await readMessageGroupCommittedMembership(leader,
      COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP);
    const stamp = committedStampOfAnswer(answer);
    if (stamp === null) {
      return Object.freeze({refusal: REFUSAL.DESCRIPTOR_UNAVAILABLE,
        detail: answer?.reason ?? null});
    }
    if (!namesLearner(stamp, learner)) {
      return Object.freeze({refusal: REFUSAL.LEARNER_NOT_IN_CONFIGURATION, detail: null});
    }
    const image = await sealLeaderImage(leader, options, stamp);
    if (image.refusal) return Object.freeze(image);
    return Object.freeze({descriptor: Object.freeze({kind: DESCRIPTOR.KIND,
      groupId: leader.groupId, stamp, generationIndex: image.generationIndex,
      checkpointIdentity: image.identity})});
  } catch (error) {
    return Object.freeze({refusal: REFUSAL.DESCRIPTOR_UNAVAILABLE, detail: error?.message});
  }
}

function recordedLearnerStampOf(join) {
  try {
    return {stamp: committedStampOfAnswer(JSON.parse(join?.learnerStamp))};
  } catch (error) {
    return {stamp: null, error: error?.message};
  }
}

function learnerJoinShapeHolds(host, options, join) {
  const identity = join?.identity;
  return Boolean(identity) && identity.groupId === options.groupId &&
    identity.targetReplicaId === options.replicaId && options.nodeId === host.nodeId &&
    typeof join.learnerOrigin === 'string' && options.createAdmissionBasis !== null &&
    typeof options.createAdmissionBasis === 'object';
}

// The worker's frozen options as the admitted CREATE built them, or {refused}.
function learnerJoinInput(host, options) {
  const join = options?.messageGroupLearnerJoin;
  const recorded = recordedLearnerStampOf(join);
  return recorded.stamp && learnerJoinShapeHolds(host, options, join) ?
    {identity: join.identity, recordedStamp: recorded.stamp, learnerOrigin: join.learnerOrigin} :
    {refused: recorded.error ?? null};
}

// A replica file, a pending install marker or staging of this target is a
// present generation: a join never installs over it (its recovery and exact
// cleanup are other owners').
function targetGenerationPresent(dbPath, checkpointsRoot) {
  const installDir = path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME);
  return [dbPath,
    ...RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES.map((suffix) => `${dbPath}${suffix}`),
    path.join(installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    path.join(installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE)]
    .some((file) => fs.existsSync(file));
}

function isExactDescriptor(value) {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length === DESCRIPTOR.KEYS.length &&
    DESCRIPTOR.KEYS.every((key) => Object.hasOwn(value, key)) &&
    value.kind === DESCRIPTOR.KIND && Number.isSafeInteger(value.generationIndex);
}

function sameCheckpointIdentity(left, right) {
  return left?.clusterId === right.clusterId && left?.raftGroupId === right.raftGroupId &&
    left?.entity?.kind === right.entity.kind && left?.entity?.id === right.entity.id &&
    left?.membershipEpoch === right.membershipEpoch;
}

/**
 * Why a leader's descriptor cannot serve this recorded learner, or null:
 * exact shape, this group and cluster, a configuration naming the exact
 * learner, and no older (term, configuration generation) than the fact.
 * @param {Object} descriptor - The descriptor the host obtained.
 * @param {Object} input - {identity, recordedStamp}.
 * @param {string} clusterId - This node's cluster identity.
 * @return {string|null} A MESSAGE_GROUP_LEARNER_JOIN_REFUSAL, or null.
 */
function descriptorRefusal(descriptor, input, clusterId) {
  const {identity, recordedStamp} = input;
  const stamp = isExactDescriptor(descriptor) ? committedStampOfAnswer(descriptor.stamp) : null;
  if (stamp === null || descriptor.groupId !== identity.groupId ||
      descriptor.generationIndex < stamp.appliedIndex ||
      !sameCheckpointIdentity(descriptor.checkpointIdentity, learnerCheckpointIdentity(
        identity.groupId, clusterId, stamp.membershipGenerationIndex))) {
    return REFUSAL.DESCRIPTOR_MISMATCH;
  }
  if (!namesLearner(stamp, identity)) return REFUSAL.LEARNER_NOT_IN_CONFIGURATION;
  return stamp.term < recordedStamp.term ||
    stamp.membershipGenerationIndex < recordedStamp.membershipGenerationIndex ?
    REFUSAL.DESCRIPTOR_STALE : null;
}

// The transferred image is the descriptor's generation, sealed at the
// stamp's configuration generation, and carries exactly the recorded
// learner's committed origin.
function imageRefusal(paths, descriptor, input, expectedIdentity) {
  const image = readCheckpoint({checkpointDir: path.join(paths.checkpointsRoot,
    String(descriptor.generationIndex)), expectedIdentity});
  if (image.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return refusal(REFUSAL.INSTALL_REFUSED, image.outcome);
  }
  const reservation = image.descriptor.raftRs.peerReservations.find(
    ({replicaIdentity}) => replicaIdentity === input.identity.targetReplicaId);
  return image.descriptor.lastIncludedIndex === descriptor.generationIndex &&
    image.descriptor.membershipEpoch === descriptor.checkpointIdentity.membershipEpoch &&
    reservation?.learnerAdmission === input.learnerOrigin ?
    null : refusal(REFUSAL.DESCRIPTOR_MISMATCH);
}

async function obtainDescriptor(host, input, paths) {
  const {identity} = input;
  let answer;
  try {
    answer = await host.requestJoinDescriptor(Object.freeze({groupId: identity.groupId,
      targetReplicaId: identity.targetReplicaId, targetPeerId: identity.targetPeerId,
      checkpointsRoot: paths.checkpointsRoot}));
  } catch (error) {
    throw refusal(REFUSAL.DESCRIPTOR_UNAVAILABLE, error?.message);
  }
  // A route answers the producer's own typed refusals; anything else it
  // says is no descriptor.
  if (answer?.refusal) {
    throw refusal(PRODUCER_REFUSALS.has(answer.refusal) ? answer.refusal :
      REFUSAL.DESCRIPTOR_UNAVAILABLE, answer.detail ?? null);
  }
  const refused = descriptorRefusal(answer?.descriptor, input, host.clusterId);
  if (refused !== null) throw refusal(refused);
  return answer.descriptor;
}

async function installLearnerImage(options, input, descriptor, paths) {
  // The floor is the recorded learner's configuration generation: an image
  // sealed before the learner was added is stale for this target.
  const expectedIdentity = learnerCheckpointIdentity(input.identity.groupId,
    descriptor.checkpointIdentity.clusterId, input.recordedStamp.membershipGenerationIndex);
  const imageRefused = imageRefusal(paths, descriptor, input, expectedIdentity);
  if (imageRefused !== null) throw imageRefused;
  const installed = await requestSnapshotInstall({replicaDbPath: paths.dbPath,
    checkpointsRoot: paths.checkpointsRoot, generationIndex: descriptor.generationIndex,
    expectedIdentity, expectedReplicaIdentity: input.identity.targetReplicaId,
    expectedPeerId: input.identity.targetPeerId,
    createAdmissionOwner: options.createAdmissionOwner,
    createAdmissionEvidence: options.createAdmissionEvidence,
    createPhysicalWorkerClaim: options.createPhysicalWorkerClaim,
    createAdmissionBasis: options.createAdmissionBasis});
  if (installed.outcome !== RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED) {
    throw refusal(REFUSAL.INSTALL_REFUSED, installed.reason ?? installed.outcome);
  }
}

async function releaseLearner(host, service) {
  await retireMessageGroupTransportHandler({messageGroup: service,
    messageRouter: host.messageRouter, address: service.unifiedAddress,
    replicaId: service.replicaId});
  await service.shutdown();
}

// The learner as the installed image alone defines it: joining, its port
// unscheduled, no metadata publication, its hint list the stamp's
// identities plus itself (never a lone list, so never the lone-founder path).
function learnerService(host, input, descriptor, dbPath) {
  const {identity} = input;
  return new MessageGroupService({...host.serviceOptions,
    groupId: identity.groupId, replicaId: identity.targetReplicaId, nodeId: host.nodeId,
    replicaIds: replicaIdsOfStamp(descriptor.stamp, identity.targetReplicaId),
    transport: host.messageRouter, dbPath, isJoiningExistingGroup: true,
    deferElection: true, bootstrapMembership: durableRecordBootstrap(),
    publishRoleMetadata: false, publishLeaderNodeMetadata: false});
}

// The opened replica's own view: its committed configuration (a witness
// read through its own port) names it the exact learner, and its port reports
// it a follower (never a candidate or leader). The stamp, or null.
function ownLearnerStamp(service, identity) {
  const stamp = committedStampOfAnswer(readMessageGroupCommittedMembership(service));
  const status = service.raft?.readStatus();
  return stamp !== null && namesLearner(stamp, identity) &&
    status?.outcome === CORE_OK && status.role === RAFT_ROLE.FOLLOWER ? stamp : null;
}

async function openLearner(host, input, descriptor, dbPath) {
  let service;
  try {
    service = learnerService(host, input, descriptor, dbPath);
  } catch (error) {
    throw refusal(REFUSAL.OPEN_REFUSED, error?.message);
  }
  registerMessageGroupTransportHandler(service, {messageRouter: host.messageRouter,
    address: service.unifiedAddress});
  try {
    await service.initialize();
  } catch (error) {
    await releaseLearner(host, service);
    throw refusal(REFUSAL.OPEN_REFUSED, error?.consensus?.reason ?? error?.code ?? error?.message);
  }
  const own = ownLearnerStamp(service, input.identity);
  if (own === null || own.appliedIndex < descriptor.generationIndex) {
    await releaseLearner(host, service);
    throw refusal(REFUSAL.OPEN_NOT_LEARNER);
  }
  return service;
}

// The leader's own observed progress for the learner (its follower progress
// at the address it resolves the learner's peer to), or undefined.
function leaderMatchIndex(status, identity) {
  const peer = status.peers?.find((entry) => entry.peerId === identity.targetPeerId &&
    entry.replicaIdentity === identity.targetReplicaId);
  return peer?.address ? status.followerProgress?.[peer.address] : undefined;
}

// The leader's committed answer and its own status are one leader in one term.
function observedLeaderLeads(leader, status, identity) {
  return leader !== null && status?.outcome === CORE_OK &&
    status.role === RAFT_ROLE.LEADER && status.groupId === identity.groupId &&
    status.replicaIdentity === leader.leaderId && status.term === leader.term;
}

function isExactIndex(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// Why the leader's own indices are no exact progress yet, or null: both
// present exact non-negative integers with match >= commit > 0. Checked
// BEFORE the shared promotion-progress predicate, which reads an absent or
// non-integer index as 0 and so grants 0/0 (its owner, 6.C, keeps that).
function progressUnproven(commitIndex, matchIndex) {
  if (!isExactIndex(commitIndex) || !isExactIndex(matchIndex) || commitIndex === 0) {
    return PROGRESS.UNOBSERVED;
  }
  return matchIndex >= commitIndex ? null : LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND;
}

// The existing promotion-progress predicate on the leader's own exact
// observation, the two observed epochs being the configuration generations
// of the leader and of the learner's own applied configuration.
function caughtUpProof(leader, status, own, identity) {
  const learnerMatchIndex = leaderMatchIndex(status, identity);
  const unproven = progressUnproven(status.commitIndex, learnerMatchIndex);
  return unproven !== null ? {decision: null, reason: unproven} :
    evaluateLearnerPromotionProof({raftIsLeader: true, currentTerm: status.term,
      committedIndex: status.commitIndex, learnerMatchIndex,
      leaderMembershipEpoch: leader.membershipGenerationIndex,
      learnerMembershipEpoch: own.membershipGenerationIndex});
}

/**
 * Whether the group's current leader acknowledges the learner caught up. The
 * leader's committed configuration (its BOOTSTRAP-purpose answer) and its own
 * status must be one leader in one term; that configuration must still hold
 * the exact learner; its commit index and its follower match for the
 * learner must be exact integers with match >= commit > 0; and only then the
 * existing promotion-progress predicate (evaluateLearnerPromotionProof) must
 * grant on that observation, with the configuration generations of the
 * leader and of the learner's own applied configuration as the two observed
 * epochs. Pure; never a promotion grant.
 * @param {Object} observation - {membership, status} from the leader.
 * @param {Object} own - The learner's own committed configuration stamp.
 * @param {Object} identity - The recorded learner identity.
 * @param {number} boundary - The installed image's applied index.
 * @return {Object} {state: MESSAGE_GROUP_LEARNER_ACKNOWLEDGEMENT, ...}.
 */
function learnerAcknowledgement(observation, own, identity, boundary) {
  const leader = committedStampOfAnswer(observation?.membership);
  const status = observation?.status;
  const leads = observedLeaderLeads(leader, status, identity);
  const proof = leads ? caughtUpProof(leader, status, own, identity) : null;
  const facts = {leads, holdsLearner: leads && namesLearner(leader, identity),
    caughtUp: proof?.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED &&
      status.commitIndex >= boundary};
  const unmet = ACKNOWLEDGEMENT_RULES.find((rule) => facts[rule.fact] !== true);
  return unmet ? {state: unmet.state, proofReason: proof?.reason ?? null} :
    {state: ACK.ACKNOWLEDGED, leaderReplicaId: status.replicaIdentity, term: status.term,
      commitIndex: status.commitIndex, matchIndex: proof.learnerMatchIndex,
      configurationGeneration: leader.membershipGenerationIndex};
}

async function observeLeader(host, groupId) {
  try {
    return await host.observeLeader(groupId);
  } catch (error) {
    return {status: {outcome: error?.code ?? null}};
  }
}

function pause(clock, ms) {
  return new Promise((resolve) => clock.setTimeout(resolve, ms));
}

// Polls until the leader acknowledges, the leader removed the learner, the
// learner's own view stops holding it a learner, or the bound is spent.
async function awaitAcknowledgement(host, service, identity, boundary) {
  const clock = resolveTimeSource(host);
  const timeoutMs = host.catchUp?.timeoutMs ?? DEFAULT.CATCH_UP_TIMEOUT_MS;
  const pollMs = host.catchUp?.pollIntervalMs ?? DEFAULT.CATCH_UP_POLL_MS;
  const deadline = clock.now() + timeoutMs;
  for (;;) {
    const own = ownLearnerStamp(service, identity);
    const acknowledged = own === null ? {state: null} : learnerAcknowledgement(
      await observeLeader(host, identity.groupId), own, identity, boundary);
    if (own === null || acknowledged.state === ACK.ACKNOWLEDGED ||
        acknowledged.state === ACK.REMOVED || clock.now() >= deadline) {
      return {own, acknowledged};
    }
    await pause(clock, pollMs);
  }
}

async function reportLearner(host, service, input, descriptor) {
  const {identity} = input;
  const {own, acknowledged} = await awaitAcknowledgement(host, service, identity,
    descriptor.generationIndex);
  if (own === null || acknowledged.state === ACK.REMOVED ||
      (acknowledged.state === ACK.ACKNOWLEDGED && own.term > acknowledged.term)) {
    await releaseLearner(host, service);
    throw refusal(acknowledged.state === ACK.REMOVED ?
      REFUSAL.LEARNER_NOT_IN_CONFIGURATION : REFUSAL.OPEN_NOT_LEARNER, acknowledged.state);
  }
  const report = {groupId: identity.groupId, replicaId: identity.targetReplicaId,
    peerId: identity.targetPeerId, installedIndex: descriptor.generationIndex,
    appliedIndex: own.appliedIndex};
  return Object.freeze(acknowledged.state === ACK.ACKNOWLEDGED ?
    {outcome: OUTCOME.RUNNING, ...report, leaderReplicaId: acknowledged.leaderReplicaId,
      term: acknowledged.term, commitIndex: acknowledged.commitIndex,
      matchIndex: acknowledged.matchIndex,
      configurationGeneration: acknowledged.configurationGeneration} :
    {outcome: OUTCOME.NOT_CAUGHT_UP, ...report, acknowledgement: acknowledged.state,
      proofReason: acknowledged.proofReason});
}

/**
 * Compose the target node's learner-join capability.
 * @param {Object} host - {nodeId, clusterId, messageRouter, dbPathOf(groupId,
 *   replicaId), requestJoinDescriptor(request), observeLeader(groupId),
 *   adoptLearner(service), serviceOptions?, catchUp?, timeSource?}. The
 *   descriptor request names the learner and the checkpoints root its image
 *   must be placed in; it answers {descriptor} or {refusal, detail}. The
 *   leader observation answers {membership: the current leader's
 *   BOOTSTRAP-purpose committed-membership answer, status: that leader's
 *   readStatus()}.
 * @return {Function} joinMessageGroupReplicaAsLearner(replicaOptions):
 *   resolves RUNNING or NOT_CAUGHT_UP with the learner open and adopted;
 *   throws a typed refusal (code) with no learner left open.
 */
function createMessageGroupLearnerJoinCapability(host) {
  return async function joinMessageGroupReplicaAsLearner(options) {
    const input = learnerJoinInput(host, options);
    if (!input.identity) throw refusal(REFUSAL.INPUT_INVALID, input.refused);
    const dbPath = host.dbPathOf(input.identity.groupId, input.identity.targetReplicaId);
    const paths = {dbPath, checkpointsRoot: checkpointsRootOf(dbPath)};
    if (targetGenerationPresent(dbPath, paths.checkpointsRoot)) {
      throw refusal(REFUSAL.TARGET_PRESENT);
    }
    const descriptor = await obtainDescriptor(host, input, paths);
    await installLearnerImage(options, input, descriptor, paths);
    const service = await openLearner(host, input, descriptor, dbPath);
    const report = await reportLearner(host, service, input, descriptor);
    host.adoptLearner(service);
    return report;
  };
}

export {
  createMessageGroupLearnerJoinCapability,
  produceMessageGroupLearnerJoinDescriptor,
};
