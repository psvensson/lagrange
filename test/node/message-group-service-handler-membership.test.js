/** MessageGroupServiceHandler current CREATE (FreshMG 6.B slice B1).
 * The first test is the inherited red witness (name unchanged). Its original
 * six assertions and what replaced them:
 *  1 'the real founding group elects' -> the learner-operation fixture elects
 *    and commits its founding no-op before the operation exists;
 *  2 'every surviving voter permanently reserves the same fresh peer id' ->
 *    kept verbatim below (reserved by the native ADD_LEARNER apply now);
 *  3 the direct proposeConfChange CORE_OK -> the operation-authorized native
 *    proposal (PROPOSED) of the shared create fixture, because a proposal
 *    outside any operation leaves no origin the recorder could record;
 *  4 'a fresh applied ConfState on every survivor names the exact learner' ->
 *    kept verbatim in the shared create fixture;
 *  5 and 6 (INITIATED; exactly one admitted physical worker) -> unchanged.
 * The original fixture answered every authoritative read with zero rows and
 * carried the learner only in the payload, so its composition is kept below
 * as a required negative. Not install/open, driver or physical proof.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from '../../src/rebalancer/replica-operation-constants.js';
import {createFixture, createHandler, createPayload, settle} from
  '../test-helpers/message-group-create-fixture.js';
import {FOUNDERS, TARGET} from '../test-helpers/learner-operation-fixture.js';
import {MessageGroupServiceHandlerSetup} from
  '../../src/bootstrap/shared/message-group-service-handler-setup.js';

const SETTLE_ROUNDS = 400;
const REFUSAL = Object.freeze({
  JOIN_CAPABILITY_UNAVAILABLE: 'message_group_create_learner_join_capability_unavailable',
  FACT_UNAVAILABLE: 'message_group_create_learner_fact_unavailable',
  FACT_NOT_RECORDED: 'message_group_create_learner_fact_not_recorded',
  UNSUPPORTED: 'message_group_membership_change_unsupported',
});

// The original composition: cache and CDC only, no repository, no boot row,
// and the production capability set (createMessageGroupReplica, no learner
// join); `joinAsLearner` adds only a learner-join capability.
function makeHandler(calls, joinAsLearner = null) {
  const cache = {
    get() {
      return null;
    },
    filter() {
      return [];
    },
  };
  const cdc = {
    async executeAuthoritativeSystemTableRead() {
      return {success: true, rows: []};
    },
    async readAuthoritativeRows() {
      return {success: true, rows: []};
    },
    async insertSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow() {
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
  const handler = new MessageGroupServiceHandler({
    nodeId: 'node-target',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    createMessageGroupReplica: async (options) => {
      calls.push(['create', options]);
      return {created: true};
    },
    startMessageGroupReplica: async (options) => {
      calls.push(['start', options]);
      return {started: true};
    },
    stopMessageGroupReplica: async () => ({stopped: true}),
    resolveLocalMessageGroupReplica: () => ({
      groupId: 'mg-1', replicaId: 'mg-1-r4', nodeId: 'node-target',
    }),
    ...(joinAsLearner ? {joinMessageGroupReplicaAsLearner: joinAsLearner} : {}),
  });
  handler.initialize();
  return handler;
}

test('a real committed learner plus exact admission package is the only CREATE path', async (t) => {
  const f = await createFixture(t);
  const peerIds = new Set();
  for (const replicaId of FOUNDERS) {
    peerIds.add(new RaftRsPeerIdentityRegistry(f.cluster.replica(replicaId).db)
      .registerReplica(TARGET));
  }
  assert.equal(peerIds.size, 1,
    'every surviving voter permanently reserves the same fresh peer id');
  const {calls, violations, outcomes, send, handler, genesisCreates} = createHandler(t, f);
  const response = await send(createPayload(f));
  await settle();

  assert.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
    'the handler crosses its refusal only for the exact committed learner and admission CAS');
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1,
    'exactly one admitted physical worker starts');
  assert.deepEqual(violations, [], 'the physical callback saw the real admission and claim');
  assert.equal(genesisCreates(), 0,
    'the composed createMessageGroupReplica (a lone founder in production) is never called');
  assert.equal(calls.some(([kind]) => kind === 'start'), false,
    'B1 opens nothing: install/open and ACTIVE publication are later slices');
  assert.deepEqual(outcomes, [], 'no CREATE_ACTIVE: success is reported by the install slice');
  const row = f.row();
  assert.equal(row.create_admission_state, 'MATERIALIZED');
  assert.equal(row.message_group_membership_phase, 'learner_committed');
  assert.equal(row.message_group_membership_obligation_state, 'unknown',
    'CREATE never releases the membership obligation');
  assert.equal(handler.inProgressOperations.size, 0, 'the worker released its claim');
});

test('the original payload-only composition is refused: no learner-join capability, and no operation owner behind the copied stamp', async () => {
  const founders = ['mg-1-r1', 'mg-1-r2', 'mg-1-r3'];
  const target = 'mg-1-r4';
  const cluster = new PartitionNodeCluster({partitionId: 'mg-1', replicaIds: founders});
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_ROUNDS}), true, 'the real founding group elects');
    const leader = cluster.leaderReplicaId();
    const peerIds = new Set();
    for (const replicaId of founders) {
      peerIds.add(new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
        .registerReplica(target));
    }
    const [targetPeerId] = [...peerIds];
    const proposal = await cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
      replicaIdentity: target,
    });
    assert.equal(proposal.outcome, 'CORE_OK', JSON.stringify(proposal));
    assert.equal(cluster.settle(() => founders.every((replicaId) =>
      cluster.node(replicaId).readStatus().confState.learners
        .includes(targetPeerId)), {rounds: SETTLE_ROUNDS}), true,
    'the learner really commits, outside any operation');
    const committed = cluster.node(leader).readStatus();

    const calls = [];
    const payload = {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      operationId: 'replace-mg-1-r1-with-r4',
      operationType: 'REPLACE',
      entityType: 'message_group',
      entityId: 'mg-1',
      partitionId: 'mg-1',
      replicaId: target,
      sourceReplicaId: 'mg-1-r1',
      createAdmissionToken: 'admission-token-r4',
      createAdmissionAttemptToken: 'attempt-r4-1',
      createAdmissionAttemptSeq: 1,
      createAdmissionWorkflowUpdatedAt: 10,
      messageGroupMembershipPhase: 'learner_committed',
      messageGroupLearnerStamp: {
        term: committed.term, appliedIndex: committed.appliedIndex,
        voters: committed.confState.voters, learners: committed.confState.learners,
      },
      messageGroupJoinPackage: {
        kind: 'raft_log_or_checkpoint',
        groupId: 'mg-1', replicaIdentity: target, peerId: targetPeerId,
      },
    };
    const production = makeHandler(calls);
    const refused = await production.handleMessage(
      {correlationId: 'payload-only-create', payload});
    const joinCapable = makeHandler(calls, async (options) => {
      calls.push(['learner-join', options]);
    });
    const deferred = await joinCapable.handleMessage(
      {correlationId: 'payload-only-create', payload});
    await settle();

    assert.equal(refused.status, ReplicaOperationResponseStatus.ERROR);
    assert.equal(refused.reason, REFUSAL.JOIN_CAPABILITY_UNAVAILABLE,
      'the production capability set cannot reach a physical worker');
    assert.equal(refused.deferRetry, false);
    assert.equal(deferred.reason, REFUSAL.FACT_UNAVAILABLE,
      'without the operation owner the copied stamp is not evidence');
    assert.equal(deferred.deferRetry, true);
    assert.deepEqual(calls, [], 'zero physical work');
    production.shutdown();
    joinCapable.shutdown();
  } finally {
    cluster.dispose();
  }
});

test('a natively committed but unrecorded learner is refused even with the exact admission package', async (t) => {
  const f = await createFixture(t, {record: false});
  const {creates, send} = createHandler(t, f);
  const response = await send(createPayload(f));
  await settle();
  assert.equal(response.status, ReplicaOperationResponseStatus.ERROR);
  assert.equal(response.reason, REFUSAL.FACT_NOT_RECORDED,
    'only the recorded fact on the operation row is learner evidence');
  assert.equal(creates(), 0, 'zero physical work');
  assert.equal(f.row().create_admission_state, null, 'no generation is admitted');
});

test('a dispatch without the learner join package keeps the existing refusal for a recorded learner', async (t) => {
  const f = await createFixture(t);
  const {creates, send} = createHandler(t, f);
  const payload = createPayload(f);
  delete payload.messageGroupJoinPackage;
  const response = await send(payload);
  await settle();
  assert.equal(response.status, ReplicaOperationResponseStatus.ERROR);
  assert.equal(response.reason, REFUSAL.UNSUPPORTED,
    'today\'s dispatcher shape (no join package) stays refused');
  assert.equal(creates(), 0);
  assert.equal(f.row().create_admission_state, null);
});

test('the production setup composes no learner-join capability, so a learner CREATE never starts a worker', async () => {
  const calls = [];
  const {messageGroupServiceHandler: handler} = MessageGroupServiceHandlerSetup.create({
    nodeId: 'node-target', messageRouter: {register() {}},
    cdcIntegrationService: {}, systemTableCache: {get: () => null, filter: () => []},
    createMessageGroupReplica: async (options) => calls.push(['genesis-create', options]),
    startMessageGroupReplica: async (options) => calls.push(['start', options]),
    stopMessageGroupReplica: async () => ({stopped: true}),
  });
  const response = await handler.handleMessage({correlationId: 'setup-create', payload: {
    type: ReplicaOperationMessageType.CREATE_REPLICA, operationId: 'op-setup',
    operationType: 'REPLACE', entityType: 'message_group', entityId: 'mg-1',
    partitionId: 'mg-1', replicaId: 'mg-1-r4',
    messageGroupJoinPackage: {kind: 'raft_log_or_checkpoint', groupId: 'mg-1',
      replicaIdentity: 'mg-1-r4', peerId: 'peer'}}});
  await settle();
  assert.equal(response.reason, REFUSAL.JOIN_CAPABILITY_UNAVAILABLE);
  assert.equal(response.deferRetry, false, 'fail once: retrying cannot compose a capability');
  assert.deepEqual(calls, [], 'the lone-founder create capability is never reached');
  handler.shutdown();
});
