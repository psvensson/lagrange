/** Shared registered-recipient fixture: two real MessageRouters, a registered
 * MessageGroupServiceHandler over the canonical learner operation fixture, and
 * an OperationWorkflowOwner whose transport capability reads at the recipient.
 * Transport and metadata are supplied test physics, not a physical network.
 */
import assert from 'node:assert/strict';
import {MessageRouter} from '../../src/transport/message-router.js';
import {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';
import {MEMBERSHIP_PHASE as PHASE} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {RAFT_MEMBERSHIP_TRANSITION_REASON} from '../../src/raft/raft-operation-port-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {MessageGroupServiceHandler} from '../../src/node/message-group-service-handler.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {OperationLane} from '../../src/workflow/operation-lane.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationField as FIELD} from
  '../../src/rebalancer/replica-operation-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE as PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {fixture, FOUNDERS, GROUP, NODE, SUCCESSOR} from './learner-operation-fixture.js';

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
/** The production lane: DurableWorkflowCoordinator.runExclusive behind an
 * OperationLane, so single-flight coalescing and lane-held detection are real.
 * The stub lane keeps the original recipient tests exactly as recorded. */
function workflowLane(realLane) {
  if (!realLane) return {operationLane: {run: (_key, work) => work()}};
  const coordinator = new DurableWorkflowCoordinator();
  return {operationLane: new OperationLane({workflowCoordinator: coordinator}),
    operationWorkflowCoordinator: coordinator};
}
function workflowOwner({nodeId, repository, messageRouter, dispatchTimeoutMs = 5000,
  realLane = false, isShuttingDown = () => false, timeSource}) {
  return new OperationWorkflowOwner({nodeId, repository, messageRouter, logger: noLog,
    config: {}, stats: {}, replicaOperationDispatchTimeoutMs: dispatchTimeoutMs,
    ...workflowLane(realLane), getActualReplicaStatus: async () => null,
    isShuttingDown, isInitialized: () => false, timeSource});
}
async function receiverFixture(t, {commit = true, dispatchTimeoutMs = 5000,
  realLane = false} = {}) {
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
  const owner = workflowOwner({nodeId: NODE, repository: f.repository, messageRouter: source,
    dispatchTimeoutMs, realLane, isShuttingDown: () => shuttingDown, timeSource: f.clock});
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

// Supersedes ONLY the two commit-time expiry/boot refusal expectations in the
// retained 20261009 package. See safety-first-ruling-20261009.md. That original
// 2-pass/2-fail evidence is retained unchanged, not relabeled as this result.
const RECEIPT_COLUMNS = Object.freeze(['message_group_membership_phase',
  'message_group_membership_permit', 'message_group_learner_stamp']);
function withoutReceipt(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !RECEIPT_COLUMNS.includes(key)));
}
function assertExactReceipt(fx, before, proposals) {
  const after = fx.f.row();
  assert.deepEqual(withoutReceipt(after), withoutReceipt(before),
    'late recording must change only the three historical receipt columns');
  assert.equal(after.message_group_membership_phase, PHASE.LEARNER_COMMITTED);
  const permit = JSON.parse(after.message_group_membership_permit);
  assert.deepEqual(permit, {...JSON.parse(fx.f.request.permit),
    permitState: 'committed', proposalIndex: 2},
  'the receipt must preserve every original execution fence and sequence');
  const stamp = JSON.parse(after.message_group_learner_stamp);
  const identity = JSON.parse(fx.f.request.identity);
  assert.equal(stamp.identities[identity.targetPeerId], identity.targetReplicaId);
  assert.equal(stamp.learners.includes(identity.targetPeerId), true);
  assert.equal(fx.f.proposalCount(), proposals, 'receipt recovery must not propose another action');
  assert.equal(fx.physical(), 0, 'a historical receipt must not dispatch physical work');
}
function holdReceiptWrite(fx, t) {
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  const execute = fx.f.gateway.executeQuery;
  let submissions = 0;
  fx.f.gateway.executeQuery = async (sql, ...args) => {
    if (sql.includes('SET message_group_membership_phase = ?') &&
      sql.includes('message_group_learner_stamp = ?')) {
      submissions += 1; entered.resolve(); await release.promise;
    }
    return execute(sql, ...args);
  };
  t.after(release.resolve);
  return {entered: entered.promise, release: release.resolve,
    submissions: () => submissions};
}
function expireClaim(f) {
  const expiresAt = JSON.parse(f.request.executionClaim).expiresAt;
  f.clock.advance(expiresAt - f.clock.now() + 1);
}
async function assertReceiptWriteEntered(held, pending) {
  assert.equal(await Promise.race([held.entered.then(() => true), pending.then(() => false)]),
    true, 'the real receipt SQL submission must engage before the authority change');
}

const recoverReceipt = (fx) => fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
  fx.f.request.operationId, {nodeId: SUCCESSOR, replicaId: fx.replicaId});
function reconstructedOwner(fx, {realLane = false} = {}) {
  return workflowOwner({nodeId: NODE, repository: fx.f.reopenOperations(),
    messageRouter: fx.source, realLane, timeSource: fx.f.clock});
}

export {address, payload, workflowOwner, connectRouters, receiverFixture, record, heldNativeRead,
  assertNativeReadEntered, withoutReceipt, assertExactReceipt, holdReceiptWrite, expireClaim,
  assertReceiptWriteEntered, recoverReceipt, reconstructedOwner};
