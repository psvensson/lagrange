/** Current CREATE fixture for MessageGroupServiceHandler (FreshMG 6.B slice B1).
 * Builds on the canonical learner-operation fixture: real operation row, real
 * membership claim and authorization CAS, real native ADD_LEARNER commit and
 * the real recorder. The SENDING step is fixture actuation through the real
 * repository, NOT a production driver (none dispatches a message-group CREATE
 * yet). The boot rows, the update hooks and the in-process SQL are supplied
 * test physics, not distributed SQL or a physical network.
 */
import assert from 'node:assert/strict';
import {fixture, FOUNDERS, GROUP, TARGET, SUCCESSOR, O, NOW} from
  './learner-operation-fixture.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {isReplicaCreateAdmissionEvidence} from
  '../../src/node/replica-create-admission-evidence.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {ReplicaOperationMessageType} from
  '../../src/rebalancer/replica-operation-constants.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON} from
  '../../src/raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const SENDING_AT = NOW + 2;
const TARGET_PEER = deriveRaftRsPeerId(TARGET);
const JOIN_KIND = 'raft_log_or_checkpoint';
const immediate = () => new Promise((resolve) => setImmediate(resolve));
async function settle(rounds = 3) {
  for (let round = 0; round < rounds; round += 1) await immediate();
}

/** The real chain up to a recorded learner and a SENDING row. */
async function createFixture(t, {record = true} = {}) {
  const f = await fixture(t);
  const proposal = await f.run();
  assert.equal(proposal.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED,
    JSON.stringify(proposal));
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
    f.cluster.node(id).readStatus().confState.learners.includes(TARGET_PEER))),
  'a fresh applied ConfState on every survivor names the exact learner');
  if (record) {
    const recorded = await f.repository.recordMessageGroupLearnerOutcome(f.request,
      (query) => f.cluster.node(f.leader).readCommittedMembership(query));
    assert.equal(recorded.outcome, 'recorded', 'the real recorder records the committed learner');
  }
  const before = await f.repository.queryAuthoritativeOperationById(O);
  // Fixture actuation through the real repository, NOT a production driver.
  await f.repository.persistOperationUpdate({...before, workflowStep: WORKFLOW_STEP.SENDING,
    updatedAt: SENDING_AT}, {confirmPersistence: false, disableSystemWriteSession: true,
    returnDisposition: true, expectedWorkflowStep: WORKFLOW_STEP.PENDING});
  assert.equal(f.row().workflow_step, WORKFLOW_STEP.SENDING);
  return f;
}

/** The handler's control-plane gateway over the fixture SQL, with one-shot
 * hooks on the admission owner's row CAS (matched by the state it writes). */
function hookedGateway(f) {
  const hooks = [];
  let updates = 0;
  const gateway = {
    readAuthoritativeRows: (...args) => f.gateway.readAuthoritativeRows(...args),
    async updateSystemTableRow(table, where, data, options) {
      updates += 1;
      const index = hooks.findIndex((hook) => hook.state === data.create_admission_state);
      const hook = index < 0 ? null : hooks.splice(index, 1)[0];
      if (hook?.before) await hook.before();
      if (hook?.drop) throw new Error('fixture: the process died before this write');
      const result = await f.gateway.updateSystemTableRow(table, where, data, options);
      if (hook?.after) await hook.after();
      if (hook?.loseAnswer) throw new Error('fixture: answer lost after apply');
      return result;
    },
  };
  return {gateway, on: (state, hook) => hooks.push({state, ...hook}), updates: () => updates};
}

function admissionPackage(changes = {}) {
  const workflowUpdatedAt = changes.workflowUpdatedAt ?? SENDING_AT;
  const attemptSeq = changes.attemptSeq ?? 1;
  const token = buildReplicaCreateAdmissionToken({operationId: O, replicaId: TARGET,
    targetNodeId: SUCCESSOR, workflowUpdatedAt});
  return {createAdmissionToken: token,
    createAdmissionAttemptToken: buildReplicaCreateAttemptToken(token, attemptSeq),
    createAdmissionAttemptSeq: attemptSeq, createAdmissionWorkflowUpdatedAt: workflowUpdatedAt};
}

/** The CREATE a driver would send. Phase, identity and stamp copies are the
 * original witness's payload hints; the handler must never read them. */
function createPayload(f, {join = {}, admission = {}, ...changes} = {}) {
  const status = f.cluster.node(f.leader).readStatus();
  return {type: ReplicaOperationMessageType.CREATE_REPLICA, operationId: O,
    operationType: OperationType.REPLACE, entityType: SERVICE_TYPE.MESSAGE_GROUP,
    entityId: GROUP, partitionId: GROUP, replicaId: TARGET, sourceReplicaId: f.leader,
    ...admissionPackage(admission),
    messageGroupMembershipPhase: 'learner_committed',
    messageGroupMembershipIdentity: {groupId: GROUP, replicaIdentity: TARGET,
      raftPeerId: TARGET_PEER, peerAddress: f.cluster.addressOf(TARGET)},
    messageGroupLearnerStamp: {term: status.term, appliedIndex: status.appliedIndex,
      voters: status.confState.voters, learners: status.confState.learners},
    messageGroupJoinPackage: {kind: JOIN_KIND, groupId: GROUP, replicaIdentity: TARGET,
      peerId: TARGET_PEER, ...join},
    ...changes};
}

/** A handler on the target node bound to the real repository and boot row.
 * The production-composed createMessageGroupReplica (a lone founder in
 * production) only counts; the learner-join stub asserts the real admission
 * and the exact live worker claim before it records an effect. `learnerJoin:
 * false` composes the production capability set, a function composes that
 * real capability instead of the stub (slice B2); `blockCreate` holds the
 * worker and `failCreate` makes it throw. */
function createHandler(t, f, {nodeId = SUCCESSOR, bootIncarnation = 1, gateway,
  blockCreate = false, failCreate = false, learnerJoin = true} = {}) {
  const calls = [];
  const outcomes = [];
  const violations = [];
  let invocations = 0;
  const joinAsLearner = async (options) => {
    invocations += 1;
    const evidence = options.createAdmissionEvidence;
    const row = f.row();
    const admitted = isReplicaCreateAdmissionEvidence(evidence) &&
      evidence.admissionState === 'MATERIALIZED' &&
      row.create_admission_state === 'MATERIALIZED' &&
      row.create_admission_replica_created_at === evidence.replicaCreatedAt &&
      row.create_admission_token === evidence.admissionToken &&
      options.messageGroupLearnerJoin?.learnerStamp === row.message_group_learner_stamp &&
      await options.createAdmissionOwner.revalidatePhysicalWorker(
        options.createPhysicalWorkerClaim, evidence) === true;
    if (!admitted) {
      violations.push(options);
      return {created: false};
    }
    calls.push(['create', options]);
    if (failCreate) throw new Error('fixture: the physical create failed');
    if (blockCreate) await new Promise(() => {});
    return {created: true};
  };
  const handler = new MessageGroupServiceHandler({
    nodeId, ownerIncarnation: bootIncarnation, now: () => NOW + 10,
    systemTableCache: {get: () => null, filter: () => []},
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: gateway ?? hookedGateway(f).gateway,
    replicaOperationRepository: f.repositoryFor(nodeId),
    executorOutcomeEmitter: {emitOutcome: (...outcome) => outcomes.push(outcome)},
    ...(learnerJoin ? {joinMessageGroupReplicaAsLearner:
      typeof learnerJoin === 'function' ? learnerJoin : joinAsLearner} : {}),
    createMessageGroupReplica: async (options) => {
      calls.push(['genesis-create', options]);
      return {created: true};
    },
    startMessageGroupReplica: async (options) => {
      calls.push(['start', options]);
      return {started: true};
    },
    stopMessageGroupReplica: async () => ({stopped: true}),
  });
  handler.initialize();
  t.after(() => handler.shutdown());
  return {handler, calls, outcomes, violations,
    invocations: () => invocations,
    creates: () => calls.filter(([kind]) => kind === 'create').length,
    genesisCreates: () => calls.filter(([kind]) => kind === 'genesis-create').length,
    send: (payload) => handler.handleMessage({correlationId: `c-${calls.length}`, payload})};
}

/** The real pre-promotion abandonment selection (REMOVE branch) by the holder. */
async function selectAbortLearner(f) {
  const row = await f.repository.queryAuthoritativeOperationById(O);
  const learner = JSON.parse(row.messageGroupLearnerStamp);
  const next = {...JSON.parse(row.messageGroupMembershipPermit), permitSequence: 2,
    permitStage: 'remove', permitState: 'in_flight', proposalIndex: null,
    leaderConfigurationStamp: {configurationKey: learner.configurationKey,
      membershipGenerationIndex: learner.membershipGenerationIndex}};
  const selected = await f.repository.selectMessageGroupMembershipBranch({operationId: O,
    identity: row.messageGroupMembershipIdentity, priorPermit: row.messageGroupMembershipPermit,
    nextPermit: JSON.stringify(next), branch: 'abort_learner'});
  assert.equal(selected.outcome, 'recorded', 'the real abort-learner selection commits');
}

/** Ordinary failure through the real repository (fixture actuation). */
async function settleFailed(f) {
  const row = await f.repository.queryAuthoritativeOperationById(O);
  await f.repository.persistOperationUpdate({...row, status: ReplicaStatus.FAILED,
    workflowStep: WORKFLOW_STEP.FAILED, completedAt: NOW + 3, updatedAt: NOW + 3},
  {confirmPersistence: false, disableSystemWriteSession: true, returnDisposition: true,
    expectedWorkflowStep: WORKFLOW_STEP.SENDING, terminalTransition: true});
  assert.notEqual(f.row().completed_at, null, 'the operation is terminal');
}

/** The node publishes a new boot incarnation (a process restart). */
function replaceBoot(f, bootIncarnation, nodeId = SUCCESSOR) {
  f.execute('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?', [bootIncarnation, nodeId]);
}

export {createFixture, createHandler, createPayload, hookedGateway, selectAbortLearner,
  settleFailed, replaceBoot, settle, SENDING_AT};
