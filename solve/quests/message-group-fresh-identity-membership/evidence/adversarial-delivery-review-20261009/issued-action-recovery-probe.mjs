/** Adversarial review diagnostic. Real repository policy functions and native
 * transition policy; SUPPLIED operation observations and native status/calls.
 * No SQLite, Raft core, transport, distributed run, or production deadlock proof.
 * The loader replaces only the control-plane gateway wrapper, explicitly.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root = path.resolve(process.argv[2]);
const load = (name) => import(pathToFileURL(path.join(root, name)).href);
const {authorizeMessageGroupLearner} = await load('src/rebalancer/replica-operation-message-group-membership-authorization.js');
const {normalizeMembershipTransition} = await load('src/raft/raft-rs-membership-transition.js');
const {proposeMembershipTransition} = await load('src/raft/raft-rs-membership-transition-runtime.js');
const {raftRsConfStateKey} = await load('src/raft/raft-rs-conf-state-key.js');
const {deriveRaftRsPeerId} = await load('src/raft/raft-rs-peer-identity.js');
const {ReplicaStatus, OperationType} = await load('src/rebalancer/replica-status.js');
const {WORKFLOW_STEP} = await load('src/constants/workflow.js');
const {SERVICE_TYPE} = await load('src/constants/service.js');
const C = await load('src/raft/raft-operation-port-constants.js');
const P = await load('src/rebalancer/replica-operation-message-group-membership-permit.js');
const peer = deriveRaftRsPeerId('target-original');
const conf = {voters: ['101', '102', '103'], learners: [], votersOutgoing: [], learnersNext: [], autoLeave: false};
const identity = {operationId: 'operation-original', groupId: 'group-original',
  sourceReplicaId: 'source-original', sourceNodeId: 'owner', sourceCreatedAt: 1,
  sourceCreateAttemptToken: 'source-create-original', targetReplicaId: 'target-original',
  targetPeerId: peer, targetNodeId: 'target-node', targetAddress: 'raft://target-original',
  transitionIdentity: 'transition-original', membershipLaneKey: 'message-group:group-original'};
const claim = {version: 1, operationId: identity.operationId,
  transitionIdentity: identity.transitionIdentity, ownerNodeId: 'owner',
  ownerBootIncarnation: 1, generation: 1, expiresAt: 1030000};
const permit = {version: 2, transitionIdentity: identity.transitionIdentity,
  permitSequence: 1, permitStage: C.RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
  permitState: P.MEMBERSHIP_PERMIT_STATE.IN_FLIGHT, workflowOwnerNodeId: 'owner',
  workflowOwnerFence: 'owner:1:1', membershipLeaseExpiresAt: claim.expiresAt,
  proposerNodeId: 'owner', proposerBootIncarnation: 1, destinationNodeId: 'owner',
  destinationBootIncarnation: 1, replicaLifecycleIncarnation: 'replica-generation-original',
  runtimeGeneration: 1, leaderTerm: 7, leaderConfigurationStamp: {
    configurationKey: raftRsConfStateKey(conf), membershipGenerationIndex: 0},
  proposalIndex: null, replicaIdentity: identity.targetReplicaId, peerId: peer};
const encodedIdentity = JSON.stringify(identity);
const encodedPermit = JSON.stringify(permit);
const row = {operationId: identity.operationId, type: OperationType.REPLACE,
  partitionId: identity.groupId, entityId: identity.groupId, entityType: SERVICE_TYPE.MESSAGE_GROUP,
  sourceReplicaId: identity.sourceReplicaId, replicaId: identity.targetReplicaId,
  sourceNodeId: identity.sourceNodeId, targetNodeId: identity.targetNodeId,
  messageGroupMembershipLaneKey: identity.membershipLaneKey,
  messageGroupMembershipIdentity: encodedIdentity,
  messageGroupSourceLifecycleClaim: JSON.stringify({replicaId: identity.sourceReplicaId,
    createdAt: identity.sourceCreatedAt, createAttemptToken: identity.sourceCreateAttemptToken}),
  messageGroupMembershipOwnerClaim: JSON.stringify(claim),
  messageGroupMembershipPermit: encodedPermit,
  messageGroupMembershipPhase: P.MEMBERSHIP_PHASE.LEARNER_IN_FLIGHT,
  messageGroupMembershipObligationState: P.MEMBERSHIP_OBLIGATION.UNKNOWN,
  messageGroupLearnerStamp: null, messageGroupVoterStamp: null, messageGroupRemovalStamp: null,
  status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING, completedAt: null};
let mutationAttempts = 0;
const repository = {nodeId: 'owner', membershipOwnerBootIncarnation: 1,
  timeSource: {now: () => 1000000}, isOperationTerminal: () => false,
  queryAuthoritativeOperationVisibilityObservation: async () => ({
    deferredOutcome: null, operation: structuredClone(row)}),
  controlPlaneSystemTableGateway: {readAuthoritativeRows: async () => ({
    success: true, rows: [{node_id: 'owner', boot_incarnation: 1}]})},
  executeOperationMutationWithRetry: async () => {mutationAttempts++; throw new Error('unexpected mutation');}};
const observe = (p) => authorizeMessageGroupLearner(repository, {
  operationId: identity.operationId, identity: encodedIdentity, permit: JSON.stringify(p)});
assert.ok(P.decodeMembershipIdentity(encodedIdentity));
assert.ok(P.decodeMembershipPermit(encodedPermit));
assert.ok(P.decodeMembershipOwnerClaim(row.messageGroupMembershipOwnerClaim));
const exactReplay = await observe(permit);
const refreshedTerm = await observe({...permit, leaderTerm: 8});
const nextSequence = await observe({...permit, leaderTerm: 8, permitSequence: 2});
assert.equal(exactReplay.outcome, P.MEMBERSHIP_AUTHORIZATION_OUTCOME.RECORDED);
assert.equal(refreshedTerm.outcome, P.MEMBERSHIP_AUTHORIZATION_OUTCOME.CONFLICT);
assert.equal(nextSequence.outcome, P.MEMBERSHIP_AUTHORIZATION_OUTCOME.INVALID);
assert.equal(mutationAttempts, 0);
function nativePolicy({term = 7, runtime = 1, learner = false,
  operationId = identity.operationId, allow = () => true} = {}) {
  const current = structuredClone(conf);
  if (learner) current.learners = [peer];
  const request = {operationId, transitionIdentity: identity.transitionIdentity,
    permitSequence: 1, stage: permit.permitStage, replicaIdentity: permit.replicaIdentity,
    peerAddress: identity.targetAddress, replicaLifecycleIncarnation: permit.replicaLifecycleIncarnation,
    runtimeGeneration: 1, leaderTerm: 7,
    leaderConfigurationStamp: {configurationKey: raftRsConfStateKey(current), membershipGenerationIndex: 0}};
  const normalized = normalizeMembershipTransition(request, {raftPeerIdOf: () => peer}, allow);
  assert.ok(normalized.command, JSON.stringify(normalized));
  let proposals = 0;
  const group = {lifecycleIncarnation: permit.replicaLifecycleIncarnation,
    membershipGenerationIndex: 0n, membershipGenerationKnown: true, appliedIndex: 10n,
    resolvePeerAddress: () => identity.targetAddress};
  const result = proposeMembershipTransition({group, expectedGeneration: runtime,
    runtimeGeneration: runtime, command: normalized.command,
    leaderReplicaIdOf: () => identity.sourceReplicaId,
    invokeCoreAt: (_group, _generation, operation) => {
      if (operation === 'conf_state') return {ok: true, value: current};
      if (operation === 'status') return {ok: true, value: {
        raftState: 2, term: String(term), applied: '10', commit: '10',
        pendingConfIndex: proposals ? '11' : '0', lead: '101'}};
      assert.equal(operation, 'propose_conf_change_v2');
      proposals++; return {ok: true};
    },
    answerRefusedProposal: (_group, _generation, result) => result,
    drainReady: () => ({outcome: C.RAFT_OPERATION_OUTCOME.CORE_OK}),
    thenMaybe: (value, fn) => fn(value)});
  return {result, proposals};
}
const normal = nativePolicy();
const oldTerm = nativePolicy({term: 8});
const oldRuntime = nativePolicy({runtime: 2});
const deadDelivery = nativePolicy({allow: () => false});
const throwingDelivery = nativePolicy({allow: () => {throw new Error('unavailable');}});
const roleOriginal = nativePolicy({learner: true});
const roleOtherAction = nativePolicy({learner: true, operationId: 'different-operation'});
assert.equal(normal.result.reason, C.RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
assert.equal(normal.proposals, 1);
assert.equal(oldTerm.result.reason, C.RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP);
assert.equal(oldRuntime.result.reason, C.RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_RUNTIME);
assert.equal(deadDelivery.result.reason, C.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY);
assert.equal(throwingDelivery.result.reason, C.RAFT_MEMBERSHIP_AUTHORIZATION_REASON.STALE_DELIVERY);
for (const item of [oldTerm, oldRuntime, deadDelivery, throwingDelivery]) assert.equal(item.proposals, 0);
assert.equal(roleOriginal.result.reason, C.RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_LEARNER);
assert.deepEqual(roleOtherAction.result, roleOriginal.result);
const paths = [
 'src/rebalancer/replica-operation-message-group-membership-authorization.js',
 'src/rebalancer/replica-operation-message-group-membership-owner-claim.js',
 'src/rebalancer/replica-operation-message-group-membership-permit.js',
 'src/raft/raft-rs-membership-transition-runtime.js',
 'src/raft/raft-rs-membership-transition.js'];
const digest = (file) => createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
console.log(JSON.stringify({reviewedHead:'8ece20f70392314ceba49e4e787b800bc14d07d6',
  proofCeiling:'Real policy functions; supplied row/boot reads, supplied native status/proposal/drain. No SQL commit, real Raft, socket or production deadlock proof.',
  policyControlsPassed: true, exactReplay: exactReplay.outcome,
  replacingOnlyLeaderTerm: refreshedTerm.outcome, incrementingPermitSequence: nextSequence.outcome,
  mutationAttempts, normal, oldTerm, oldRuntime, deadDelivery, throwingDelivery,
  roleOnlyAnswerNotActionSpecific: {original:roleOriginal, differentAction:roleOtherAction},
  sourceSha256:Object.fromEntries(paths.map(p=>[p,digest(p)]))},null,2));
