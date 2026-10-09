import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';
import {MEMBERSHIP_PHASE as PHASE} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON} from '../../src/raft/raft-operation-port-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationField as FIELD} from
  '../../src/rebalancer/replica-operation-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {fixture, FOUNDERS, GROUP, TARGET, NODE, SUCCESSOR} from
  '../test-helpers/learner-operation-fixture.js';

const noLog = {debug() {}, info() {}, warn() {}, error() {}};
const address = `${SUCCESSOR}/service/message-group-handler`;
const immediate = () => new Promise((resolve) => setImmediate(resolve));

async function connectRouters(t) {
  // Existing in-process server/dial owners perform both IDENTIFY directions.
  // No connection rows, primary socket or boot watermark is preinstalled.
  const source = new MessageRouter({nodeId: NODE, bootIncarnation: 1,
    inProcess: true, wsPort: 24271, nodeAddress: 'ws://127.0.0.1:24271'});
  const recipient = new MessageRouter({nodeId: SUCCESSOR, bootIncarnation: 1,
    inProcess: true, wsPort: 24272, nodeAddress: 'ws://127.0.0.1:24272'});
  t.after(async () => {
    await source.shutdown(); await recipient.shutdown();
  });
  await source.initialize({startServer: true});
  await recipient.initialize({startServer: true});
  await source.connectToNode(SUCCESSOR, 'ws://127.0.0.1:24272');
  for (let tick = 0; tick < 20 &&
    source.getCurrentPrimaryConnectionBootIncarnation(SUCCESSOR)?.bootIncarnation !== 1;
    tick += 1) await immediate();
  const outgoing = source.getCurrentPrimaryConnectionBootIncarnation(SUCCESSOR);
  const incoming = recipient.getCurrentPrimaryConnectionBootIncarnation(NODE);
  assert.equal(outgoing?.bootIncarnation, 1,
    'the actual outbound router must receive its peer identity');
  assert.equal(outgoing.nodeId, SUCCESSOR);
  assert.equal(incoming?.bootIncarnation, 1,
    'the actual incoming router must identify and adopt the dialed socket');
  assert.equal(incoming.nodeId, NODE);
  return {source, recipient};
}
function learnerQuery(f) {
  const identity = JSON.parse(f.request.identity);
  const permit = JSON.parse(f.request.permit);
  return {purpose: PURPOSE.LEARNER_ACTION, groupId: GROUP,
    action: {operationId: f.request.operationId, transitionIdentity: identity.transitionIdentity,
      permitSequence: permit.permitSequence, stage: permit.permitStage,
      replicaIdentity: identity.targetReplicaId, peerId: identity.targetPeerId}};
}
function payload(f, replicaId) {
  return {[FIELD.TYPE]: TYPE.READ_COMMITTED_MEMBERSHIP,
    [FIELD.ENTITY_TYPE]: SERVICE_TYPE.MESSAGE_GROUP, [FIELD.ENTITY_ID]: GROUP,
    [FIELD.REPLICA_ID]: replicaId, [FIELD.MEMBERSHIP_QUERY]: learnerQuery(f)};
}
async function receiverFixture(t, {commit = true} = {}) {
  const f = await fixture(t);
  if (commit) {
    assert.equal((await f.run()).reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
    const peer = JSON.parse(f.request.identity).targetPeerId;
    assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
      f.cluster.node(id).readStatus().confState.learners.includes(peer))));
  }
  const {source, recipient} = await connectRouters(t);
  const replicaId = FOUNDERS.find((id) => id !== f.leader);
  const native = f.cluster.node(replicaId);
  const service = {nodeId: SUCCESSOR, replicaId, groupId: GROUP, raft: native};
  let physical = 0;
  const unexpectedPhysical = async () => {
    physical += 1; throw new Error('no CREATE allowed');
  };
  const handler = new MessageGroupServiceHandler({nodeId: SUCCESSOR,
    systemTableCache: {get: () => null}, cdcIntegrationService: {},
    controlPlaneSystemTableGateway: f.gateway, createMessageGroupReplica: unexpectedPhysical,
    startMessageGroupReplica: unexpectedPhysical, stopMessageGroupReplica: unexpectedPhysical,
    resolveLocalMessageGroupReplica: (id) => id === replicaId ? service : null});
  handler.initialize(); handler.registerWithRouter(recipient);
  t.after(() => handler.shutdown());
  let shuttingDown = false;
  const owner = new OperationWorkflowOwner({nodeId: NODE, repository: f.repository,
    messageRouter: source, logger: noLog, config: {}, stats: {},
    operationLane: {run: (_key, work) => work()}, getActualReplicaStatus: async () => null,
    isShuttingDown: () => shuttingDown, isInitialized: () => false, timeSource: f.clock});
  const deliver = (request) => source.deliver(address, request,
    {targetNodeId: SUCCESSOR, deliveryPriority: 'critical', timeoutMs: 5000});
  return {f, source, recipient, replicaId, native, service, handler, owner, deliver,
    physical: () => physical, shutOwner: () => {
      shuttingDown = true;
    }};
}
function record(fx, request = fx.f.request, route = {nodeId: SUCCESSOR, replicaId: fx.replicaId}) {
  assert.equal(typeof fx.owner.recordMessageGroupLearnerOutcomeFromRecipient, 'function',
    'the workflow owner must provide its registered-recipient read capability');
  return fx.owner.recordMessageGroupLearnerOutcomeFromRecipient(request, route);
}
async function heldNativeRead(fx) {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const native = fx.native;
  // A Proxy cannot replace a non-configurable frozen port method. This
  // explicit scheduling wrapper uses the existing constructor and delegates
  // every operation and every observation to the actual native port.
  const proxy = createRaftOperationPort({...native,
    readCommittedMembership: async (query) => {
      const answer = await native.readCommittedMembership(query);
      entered.resolve(); await release.promise; return answer;
    },
  });
  // Scheduling-only wrapper: the actual native read supplies every answer.
  fx.service.raft = proxy;
  return {entered: entered.promise, release: release.resolve};
}

async function assertNativeReadEntered(held, pending) {
  const entered = await Promise.race([
    held.entered.then(() => true), pending.then(() => false),
  ]);
  assert.equal(entered, true,
    'the actual native read must engage before delivery completes');
}

test('registered message-group recipient carries historical evidence to its workflow owner',
  {timeout: 30000}, async (t) => {
    await t.test('two actual routers and a registered handler record without direct native callback', async (t) => {
      const fx = await receiverFixture(t); const {f} = fx;
      const before = {...f.row()}; const proposals = f.proposalCount();
      const result = await record(fx);
      assert.equal(result.outcome, 'recorded', 'registered native result must reach the actual row CAS');
      assert.equal(f.row().message_group_membership_phase, 'learner_committed');
      for (const column of ['status', 'workflow_step', 'completed_at', 'steps_history',
        'message_group_membership_lane_key', 'message_group_membership_obligation_state']) {
        assert.deepEqual(f.row()[column], before[column], `recording must not change ${column}`);
      }
      assert.equal(f.proposalCount(), proposals); assert.equal(fx.physical(), 0);
      let deliveries = 0; const deliver = fx.source.deliver.bind(fx.source);
      fx.source.deliver = (...args) => {
        deliveries += 1; return deliver(...args);
      };
      assert.equal((await record(fx)).outcome, 'recorded');
      assert.equal(deliveries, 0, 'exact replay must not send another native request');
    });
    await t.test('uncommitted intent is UNKNOWN through the real recipient', async (t) => {
      const fx = await receiverFixture(t, {commit: false}); const before = {...fx.f.row()};
      assert.equal((await record(fx)).outcome, 'unknown');
      assert.deepEqual(fx.f.row(), before); assert.equal(fx.physical(), 0);
    });
    await t.test('claimed payload context cannot substitute for the actual delivery', async (t) => {
      const fx = await receiverFixture(t);
      const request = {...payload(fx.f, fx.replicaId),
        delivery: {nodeId: SUCCESSOR, isCurrent: true}};
      const response = await fx.handler.handleMessage({payload: request, correlationId: 'forged'});
      assert.equal(response.membership?.reason, 'learner-action-unavailable',
        'direct or payload-forged delivery must not read through the recipient');
      assert.equal(response.correlationId, 'forged');
    });
    await t.test('wrong group and wrong action cannot borrow the selected native result', async (t) => {
      const fx = await receiverFixture(t); const request = payload(fx.f, fx.replicaId);
      const wrongGroup = {...request, entityId: 'other', membershipQuery:
      {...request.membershipQuery, groupId: 'other'}};
      assert.equal((await fx.deliver(wrongGroup)).membership.reason, 'learner-action-invalid');
      const wrongAction = {...request, membershipQuery: {...request.membershipQuery,
        action: {...request.membershipQuery.action, operationId: 'other-operation'}}};
      assert.equal((await fx.deliver(wrongAction)).membership.reason, 'learner-action-mismatch');
      assert.equal((await record(fx, fx.f.request, {nodeId: SUCCESSOR, replicaId: 'missing'})).outcome,
        'unavailable');
    });
    await t.test('handler replacement invalidates a held actual native answer, fresh read recovers', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const held = await heldNativeRead(fx); t.after(held.release);
      const pending = record(fx);
      await assertNativeReadEntered(held, pending);
      const previous = fx.recipient.getRegisteredHandler(address);
      fx.handler.registerWithRouter(fx.recipient);
      assert.notEqual(fx.recipient.getRegisteredHandler(address), previous,
        'the actual registered handler must change before the old read returns');
      held.release();
      assert.equal((await pending).outcome, 'unavailable', 'retired handler cannot deliver evidence');
      assert.deepEqual(fx.f.row(), before);
      fx.service.raft = fx.native;
      assert.equal((await record(fx)).outcome, 'recorded');
    });
    await t.test('native port replacement invalidates a held result', async (t) => {
      const fx = await receiverFixture(t);
      const held = await heldNativeRead(fx);
      t.after(held.release);
      const pending = record(fx);
      await assertNativeReadEntered(held, pending);
      const oldDatabase = fx.f.cluster.replica(fx.replicaId).db;
      const recovered = fx.f.cluster.restart(fx.replicaId);
      assert.equal(oldDatabase.open, false, 'the prior recipient database must close');
      assert.equal(recovered.db === oldDatabase, false, 'recovery must open another database');
      assert.equal(recovered.node === fx.native, false, 'recovery must open another native port');
      fx.service.raft = recovered.node;
      held.release();
      assert.equal((await pending).outcome, 'unavailable', 'replaced port cannot return a stale witness');
      assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_IN_FLIGHT);
      const proposals = fx.f.proposalCount();
      assert.equal((await record(fx)).outcome, 'recorded',
        'a fresh invocation must recover after actual native reconstruction');
      assert.equal(fx.f.proposalCount(), proposals, 'recovery must not propose membership again');
    });
    await t.test('workflow shutdown stops outcome consumption but not its durable debt', async (t) => {
      const fx = await receiverFixture(t);
      const held = await heldNativeRead(fx);
      t.after(held.release);
      const before = {...fx.f.row()}; const pending = record(fx);
      await assertNativeReadEntered(held, pending);
      fx.shutOwner(); held.release();
      assert.equal((await pending).outcome, 'unavailable'); assert.deepEqual(fx.f.row(), before);
    });
    await t.test('current CREATE and unsupported read purposes remain parked', async (t) => {
      const fx = await receiverFixture(t);
      const create = await fx.deliver({type: TYPE.CREATE_REPLICA, replicaId: TARGET,
        operationId: fx.f.request.operationId, entityId: GROUP,
        entityType: SERVICE_TYPE.MESSAGE_GROUP});
      assert.equal(create.reason, 'message_group_membership_change_unsupported');
      const read = payload(fx.f, fx.replicaId); read.membershipQuery.purpose = PURPOSE.BOOTSTRAP;
      assert.equal((await fx.deliver(read)).membership.reason, 'learner-action-invalid');
      assert.equal(fx.physical(), 0);
    });
  });
