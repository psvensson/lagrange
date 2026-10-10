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
async function receiverFixture(t, {commit = true, dispatchTimeoutMs = 5000} = {}) {
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
    replicaOperationDispatchTimeoutMs: dispatchTimeoutMs,
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


// These interleavings are local scheduling controls over the actual registered
// recipient/native reader. They do not claim cross-Raft-group commit fencing.
test('learner driver invocation is fenced through its submission boundary',
  {timeout: 30000}, async (t) => {
    await t.test('a callback captured before re-registration cannot borrow its successor identity', async (t) => {
      const fx = await receiverFixture(t);
      const before = {...fx.f.row()};
      const inbound = fx.recipient.handleServiceMessage.bind(fx.recipient);
      let intercepted = false;
      fx.recipient.handleServiceMessage = (...args) => {
        fx.recipient.handleServiceMessage = inbound;
        inbound(...args); // Captures the old callback; invocation is a microtask.
        const old = fx.recipient.getRegisteredHandler(address);
        fx.handler.registerWithRouter(fx.recipient);
        assert.notEqual(fx.recipient.getRegisteredHandler(address), old);
        intercepted = true;
      };
      const result = await record(fx);
      assert.equal(intercepted, true, 'the actual inbound dispatch must engage');
      assert.equal(result.outcome, 'unavailable',
        'a retired captured callback must not borrow its replacement registration');
      assert.deepEqual(fx.f.row(), before);
      assert.equal((await record(fx)).outcome, 'recorded', 'a fresh callback must still recover');
      assert.equal(fx.physical(), 0);
    });
    await t.test('retiring an old handler cannot unregister the current handler', async (t) => {
      const fx = await receiverFixture(t);
      const successor = async () => ({successor: true});
      fx.recipient.register(address, successor);
      fx.handler.unregisterFromRouter(fx.recipient);
      assert.equal(fx.recipient.getRegisteredHandler(address) === successor, true,
        'retirement must leave the exact successor callback registered');
      fx.handler.registerWithRouter(fx.recipient);
      assert.equal((await record(fx)).outcome, 'recorded');
      const current = fx.recipient.getRegisteredHandler(address);
      fx.handler.unregisterFromRouter(fx.recipient);
      assert.equal(fx.recipient.getRegisteredHandler(address), null,
        'the current owner must still be able to retire its own callback');
      assert.equal(typeof current, 'function');
    });
    await t.test('a late unregister on the previous router cannot clear the new registration', async (t) => {
      const fx = await receiverFixture(t);
      const current = fx.recipient.getRegisteredHandler(address);
      fx.handler.unregisterFromRouter(fx.source);
      assert.equal(fx.handler.registeredRouterHandler === current, true,
        'a different router must not retire this registration');
      assert.equal((await record(fx)).outcome, 'recorded');
    });
    await t.test('recipient delivery uses the workflow owner configured timeout', async (t) => {
      const fx = await receiverFixture(t, {dispatchTimeoutMs: 1234});
      const deliver = fx.source.deliver.bind(fx.source);
      let timeout;
      fx.source.deliver = (target, message, options) => {
        timeout = options.timeoutMs;
        return deliver(target, message, options);
      };
      assert.equal((await record(fx)).outcome, 'recorded');
      assert.equal(timeout, 1234, 'recipient delivery must use the owner configured timeout');
    });
    for (const invalidation of ['shutdown', 'fence-turnover']) {
      await t.test(`${invalidation} after native delivery prevents a new recording submission`, async (t) => {
        const fx = await receiverFixture(t); const before = {...fx.f.row()};
        const entered = Promise.withResolvers(); const release = Promise.withResolvers();
        t.after(release.resolve);
        fx.f.pauseNodes(async () => { entered.resolve(); await release.promise; });
        let writes = 0; const execute = fx.f.gateway.executeQuery;
        fx.f.gateway.executeQuery = (...args) => { writes += 1; return execute(...args); };
        const pending = record(fx);
        assert.equal(await Promise.race([entered.promise.then(() => true),
          pending.then(() => false)]), true, 'the post-delivery boot read must engage');
        if (invalidation === 'shutdown') fx.shutOwner();
        else fx.owner.bumpOperationOwnershipFenceEpoch();
        release.resolve();
        assert.equal((await pending).outcome, 'unavailable',
          'an invalidated driver invocation cannot start a recording write');
        assert.equal(writes, 0, 'no SQL mutation may be submitted after invalidation');
        assert.deepEqual(fx.f.row(), before); assert.equal(fx.physical(), 0);
      });
    }
    await t.test('owner invalidation during write backoff prevents resubmission', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const execute = fx.f.gateway.executeQuery; let attempts = 0; let waits = 0;
      fx.f.gateway.executeQuery = (...args) => {
        attempts += 1;
        if (attempts === 1) return Promise.resolve({success: false,
          error: 'query_admission_deferred', reasonCode: 'transport_backpressure',
          retryAfterMs: 250, deferRetry: true});
        return execute(...args);
      };
      fx.f.repository.waitForOperationPersistRetry = async () => {
        waits += 1; fx.owner.bumpOperationOwnershipFenceEpoch();
      };
      const result = await record(fx);
      assert.equal(waits, 1, 'the existing mutation retry owner must engage');
      assert.equal(attempts, 1, 'an obsolete invocation must not submit another write attempt');
      assert.equal(result.outcome, 'unknown', 'a previously submitted write retains uncertainty');
      assert.deepEqual(fx.f.row(), before); assert.equal(fx.physical(), 0);
    });
    await t.test('recording enters the existing retained operation lane before reading', async (t) => {
      const fx = await receiverFixture(t);
      const entered = Promise.withResolvers(); const release = Promise.withResolvers();
      t.after(release.resolve); let enteredFactory = false;
      fx.owner.operationWorkflowRunExclusive = async (key, work) => {
        assert.equal(key, fx.owner.getOperationOwnerSingleFlightKey(fx.f.request.operationId));
        entered.resolve(); await release.promise;
        enteredFactory = true; return work();
      };
      let reads = 0; const deliver = fx.source.deliver.bind(fx.source);
      fx.source.deliver = (...args) => { reads += 1; return deliver(...args); };
      const pending = record(fx);
      assert.equal(await Promise.race([entered.promise.then(() => true),
        pending.then(() => false)]), true, 'the existing operation lane must be entered');
      assert.equal(reads, 0, 'no recipient read may precede the retained lane turn');
      fx.owner.bumpOperationOwnershipFenceEpoch(); release.resolve();
      assert.equal((await pending).outcome, 'unavailable', 'a stale queued turn must refuse');
      assert.equal(enteredFactory, true); assert.equal(reads, 0);
    });
  });


test('the owned learner command preserves submission and uncertainty boundaries',
  {timeout: 30000}, async (t) => {
    await t.test('queued recording snapshots encoded request and recipient without invoking accessors', async (t) => {
      const fx = await receiverFixture(t);
      const entered = Promise.withResolvers(); const release = Promise.withResolvers();
      t.after(release.resolve);
      fx.owner.operationWorkflowRunExclusive = async (_key, work) => {
        entered.resolve(); await release.promise; return work();
      };
      const request = {...fx.f.request};
      const route = {nodeId: SUCCESSOR, replicaId: fx.replicaId};
      const pending = record(fx, request, route);
      assert.equal(await Promise.race([entered.promise.then(() => true),
        pending.then(() => false)]), true, 'snapshot control must enter the actual lane');
      request.identity = 'replaced'; request.permit = 'replaced';
      request.executionClaim = 'replaced'; request.operationId = 'replaced';
      route.nodeId = 'unrelated'; route.replicaId = TARGET;
      release.resolve();
      assert.equal((await pending).outcome, 'recorded',
        'the waiting command must retain its original immutable input');
      let getterReads = 0;
      const accessor = {...fx.f.request};
      Object.defineProperty(accessor, 'operationId', {enumerable: true,
        get() { getterReads += 1; return fx.f.request.operationId; }});
      assert.equal((await record(fx, accessor)).outcome, 'invalid');
      assert.equal(getterReads, 0, 'boundary capture must not invoke caller accessors');
    });
    await t.test('an already-submitted write stays UNKNOWN after invocation retirement', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const execute = fx.f.gateway.executeQuery;
      const entered = Promise.withResolvers(); const release = Promise.withResolvers();
      t.after(release.resolve); let attempts = 0;
      fx.f.gateway.executeQuery = async (...args) => {
        attempts += 1; entered.resolve(); await release.promise; return execute(...args);
      };
      const pending = record(fx);
      assert.equal(await Promise.race([entered.promise.then(() => true),
        pending.then(() => false)]), true, 'the mutation must enter the actual gateway');
      fx.owner.bumpOperationOwnershipFenceEpoch(); release.resolve();
      assert.equal((await pending).outcome, 'unknown',
        'retirement cannot turn a submitted write into definite noncommitment');
      assert.equal(attempts, 1);
      assert.equal(fx.f.row().message_group_membership_phase, PHASE.LEARNER_COMMITTED);
      assert.equal(fx.f.row().message_group_membership_owner_claim,
        before.message_group_membership_owner_claim);
      assert.equal(fx.f.row().message_group_membership_obligation_state,
        before.message_group_membership_obligation_state);
      const proposals = fx.f.proposalCount();
      assert.equal((await record(fx)).outcome, 'recorded');
      assert.equal(attempts, 1, 'new invocation must recognize the exact result without rewriting');
      assert.equal(fx.f.proposalCount(), proposals); assert.equal(fx.physical(), 0);
    });
    await t.test('a synchronous submission guard adds no extra microtask or wire authority', async (t) => {
      const fx = await receiverFixture(t); let current = true; let attempts = 0;
      const execute = fx.f.gateway.executeQuery;
      fx.f.gateway.executeQuery = (sql, params, options) => {
        attempts += 1;
        assert.equal(current, true, 'synchronous admission must reach submission without an await');
        assert.equal(Object.hasOwn(options, 'beforeAttempt'), false,
          'the host-only callback must not enter query options');
        return execute(sql, params, options);
      };
      const result = await fx.f.repository.executeOperationMutationWithRetry(
        'UPDATE replica_operations SET updated_at = updated_at WHERE operation_id = ?',
        [fx.f.request.operationId], {beforeAttempt: () => {
          queueMicrotask(() => { current = false; }); return current;
        }});
      assert.equal(result.success, true); assert.equal(attempts, 1);
    });
    await t.test('asynchronous existing admission still settles before a mutation attempt', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const entered = Promise.withResolvers(); const release = Promise.withResolvers();
      t.after(release.resolve); let attempts = 0;
      const execute = fx.f.gateway.executeQuery;
      fx.f.gateway.executeQuery = (...args) => { attempts += 1; return execute(...args); };
      const pending = fx.f.repository.executeOperationMutationWithRetry(
        'UPDATE replica_operations SET updated_at = updated_at WHERE operation_id = ?',
        [fx.f.request.operationId], {beforeAttempt: async () => {
          entered.resolve(); await release.promise; return false;
        }});
      assert.equal(await Promise.race([entered.promise.then(() => true),
        pending.then(() => false)]), true, 'the existing asynchronous admission must engage');
      assert.equal(attempts, 0); release.resolve();
      assert.equal((await pending).admissionRefused, true);
      assert.equal(attempts, 0); assert.deepEqual(fx.f.row(), before);
    });
  });


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

test('safety-first historical recording remains separate from permission for a next effect',
  {timeout: 30000}, async (t) => {
    for (const change of ['lease-expiry', 'canonical-boot-revocation']) {
      await t.test(`${change} after submission permits only the exact late receipt`, async (t) => {
        const fx = await receiverFixture(t); const before = {...fx.f.row()};
        const proposals = fx.f.proposalCount(); const held = holdReceiptWrite(fx, t);
        const pending = record(fx); await assertReceiptWriteEntered(held, pending);
        if (change === 'lease-expiry') expireClaim(fx.f);
        else fx.f.execute('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?', [2, NODE]);
        held.release();
        assert.equal((await pending).outcome, 'unknown',
          'an obsolete caller must not report current success from its late write');
        assertExactReceipt(fx, before, proposals);
        const durable = {...fx.f.row()};
        assert.notEqual((await record(fx)).outcome, 'recorded',
          'a new invocation under revoked authority cannot claim current recording success');
        assert.equal(held.submissions(), 1, 'the obsolete invocation must not submit again');
        assert.deepEqual(fx.f.row(), durable);
        assert.equal(fx.physical(), 0);
      });
    }
    await t.test('receipt-first then holder takeover recovers without rewriting the action', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount(); const held = holdReceiptWrite(fx, t);
      const pending = record(fx); await assertReceiptWriteEntered(held, pending);
      expireClaim(fx.f); held.release(); assert.equal((await pending).outcome, 'unknown');
      assertExactReceipt(fx, before, proposals);
      const successor = fx.f.repositoryFor(SUCCESSOR);
      const claimed = await successor.claimMessageGroupMembershipOwner({
        operationId: fx.f.request.operationId, identity: fx.f.request.identity,
        expectedClaim: fx.f.request.executionClaim});
      assert.equal(claimed.outcome, 'recorded'); const adopted = {...fx.f.row()};
      let reads = 0;
      const answer = await successor.recordMessageGroupLearnerOutcome(
        {...fx.f.request, executionClaim: claimed.claim}, async (query) => {
          reads += 1; return fx.native.readCommittedMembership(query);
        });
      assert.equal(answer.outcome, 'recorded'); assert.equal(reads, 0);
      assert.deepEqual(fx.f.row(), adopted, 'replay under the successor must not rewrite history');
      assert.equal(held.submissions(), 1); assert.equal(fx.f.proposalCount(), proposals);
      assert.equal(fx.physical(), 0);
    });
    await t.test('claim-first defeats the stale receipt and the successor still makes progress', async (t) => {
      const fx = await receiverFixture(t); const held = holdReceiptWrite(fx, t);
      const proposals = fx.f.proposalCount(); const pending = record(fx);
      await assertReceiptWriteEntered(held, pending); expireClaim(fx.f);
      const successor = fx.f.repositoryFor(SUCCESSOR);
      const claimed = await successor.claimMessageGroupMembershipOwner({
        operationId: fx.f.request.operationId, identity: fx.f.request.identity,
        expectedClaim: fx.f.request.executionClaim});
      assert.equal(claimed.outcome, 'recorded'); const adopted = {...fx.f.row()};
      held.release(); assert.equal((await pending).outcome, 'unknown');
      assert.deepEqual(fx.f.row(), adopted, 'a winning successor claim must defeat the stale receipt CAS');
      assert.equal((await successor.recordMessageGroupLearnerOutcome(
        {...fx.f.request, executionClaim: claimed.claim},
        (query) => fx.native.readCommittedMembership(query))).outcome, 'recorded');
      assertExactReceipt(fx, adopted, proposals);
    });
    for (const change of ['lease-expiry', 'canonical-boot-revocation']) {
      await t.test(`${change} during retry backoff prevents a NEW receipt submission`, async (t) => {
        const fx = await receiverFixture(t); const before = {...fx.f.row()};
        let submissions = 0;
        const execute = fx.f.gateway.executeQuery;
        fx.f.gateway.executeQuery = async (...args) => {
          submissions += 1;
          // Permit a wrongly submitted retry to finish so omission is an
          // assertion failure, never a timeout or an unbounded diagnostic loop.
          if (submissions > 1) return execute(...args);
          return {success: false, error: 'fixture retryable route unavailable'};
        };
        fx.f.repository.isRetryableOperationPersistError = (answer) =>
          answer?.error === 'fixture retryable route unavailable';
        fx.f.repository.waitForOperationPersistRetry = async () => {
          if (change === 'lease-expiry') expireClaim(fx.f);
          else fx.f.execute('UPDATE nodes SET boot_incarnation = ? WHERE node_id = ?', [2, NODE]);
        };
        assert.notEqual((await record(fx)).outcome, 'recorded');
        assert.equal(submissions, 1,
          'revoked claim or boot must prevent another submission after backoff');
        assert.deepEqual(fx.f.row(), before); assert.equal(fx.physical(), 0);
      });
    }
  });


const recoverReceipt = (fx) => fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
  fx.f.request.operationId, {nodeId: SUCCESSOR, replicaId: fx.replicaId});
function reconstructedOwner(fx) {
  return new OperationWorkflowOwner({nodeId: NODE, repository: fx.f.reopenOperations(),
    messageRouter: fx.source, logger: noLog, config: {}, stats: {},
    replicaOperationDispatchTimeoutMs: 5000,
    operationLane: {run: (_key, work) => work()}, getActualReplicaStatus: async () => null,
    isShuttingDown: () => false, isInitialized: () => false, timeSource: fx.f.clock});
}
test('restart recording reconstructs durable inputs without retaining the original request',
  {timeout: 30000}, async (t) => {
    await t.test('new workflow owner records by ID after native commit, without manual workflow progress', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const proposals = fx.f.proposalCount(); fx.shutOwner(); fx.owner = reconstructedOwner(fx);
      assert.equal((await recoverReceipt(fx)).outcome, 'recorded');
      assertExactReceipt(fx, before, proposals);
    });
    await t.test('reconstruction after SQL-answer loss consumes the committed permit without reviving it', async (t) => {
      const fx = await receiverFixture(t); const held = holdReceiptWrite(fx, t);
      const pending = record(fx); await assertReceiptWriteEntered(held, pending);
      fx.owner.bumpOperationOwnershipFenceEpoch(); held.release();
      assert.equal((await pending).outcome, 'unknown');
      const recorded = {...fx.f.row()}; const proposals = fx.f.proposalCount();
      fx.shutOwner(); fx.owner = reconstructedOwner(fx);
      let deliveries = 0; const deliver = fx.source.deliver.bind(fx.source);
      fx.source.deliver = (...args) => { deliveries += 1; return deliver(...args); };
      assert.equal((await recoverReceipt(fx)).outcome, 'recorded',
        'reconstruction must accept the exact already-committed receipt without an original packet');
      assert.equal(deliveries, 0); assert.equal(held.submissions(), 1);
      assert.deepEqual(fx.f.row(), recorded); assert.equal(fx.f.proposalCount(), proposals);
      const authorization = await fx.owner.repository.authorizeMessageGroupLearner({
        operationId: fx.f.request.operationId, identity: recorded.message_group_membership_identity,
        permit: recorded.message_group_membership_permit});
      assert.equal(authorization.outcome, 'invalid',
        'a committed recording input must never become a new executable permit');
      assert.equal(fx.physical(), 0);
    });
    await t.test('recovery with no applied origin waits and later records the SAME action', async (t) => {
      const fx = await receiverFixture(t, {commit: false}); const before = {...fx.f.row()};
      assert.equal((await recoverReceipt(fx)).outcome, 'unknown');
      assert.deepEqual(fx.f.row(), before); assert.equal(fx.f.proposalCount(), 0);
      assert.equal((await fx.f.run()).reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
      const target = JSON.parse(fx.f.request.identity).targetPeerId;
      assert.ok(fx.f.cluster.settle(() => FOUNDERS.every((id) =>
        fx.f.cluster.node(id).readStatus().confState.learners.includes(target))));
      assert.equal((await recoverReceipt(fx)).outcome, 'recorded');
      assertExactReceipt(fx, before, 1);
    });
    await t.test('missing or unreadable authoritative row cannot be reconstructed from caches', async (t) => {
      const fx = await receiverFixture(t); const before = {...fx.f.row()};
      const route = {nodeId: SUCCESSOR, replicaId: fx.replicaId};
      assert.equal((await fx.owner.recoverMessageGroupLearnerOutcomeFromRecipient(
        'missing-operation', route)).outcome, 'conflict');
      fx.f.failReads('replica_operations');
      assert.equal((await recoverReceipt(fx)).outcome, 'unavailable');
      assert.deepEqual(fx.f.row(), before); assert.equal(fx.physical(), 0);
    });
  });


test('async admission must recheck local lifetime adjacent to actual submission',
  {timeout: 30000}, async (t) => {
    const fx = await receiverFixture(t); let current = true; let submissions = 0;
    const execute = fx.f.gateway.executeQuery;
    fx.f.gateway.executeQuery = (...args) => { submissions += 1; return execute(...args); };
    const response = await fx.f.repository.executeOperationMutationWithRetry(
      'UPDATE replica_operations SET updated_at = updated_at WHERE operation_id = ?',
      [fx.f.request.operationId], {beforeAttempt: async () => {
        queueMicrotask(() => { current = false; }); return true;
      }, submissionIsCurrent: () => current});
    assert.equal(response.admissionRefused, true,
      'turnover during async admission must prevent submission');
    assert.equal(submissions, 0);
  });

test('committed permit with missing recorded phase cannot be reused as an in-flight recording',
  {timeout: 30000}, async (t) => {
    const fx = await receiverFixture(t); assert.equal((await recoverReceipt(fx)).outcome, 'recorded');
    fx.f.execute(`UPDATE replica_operations SET message_group_membership_phase = ?,
      message_group_learner_stamp = NULL WHERE operation_id = ?`,
    [PHASE.LEARNER_IN_FLIGHT, fx.f.request.operationId]);
    const inconsistent = {...fx.f.row()}; let deliveries = 0;
    const deliver = fx.source.deliver.bind(fx.source);
    fx.source.deliver = (...args) => { deliveries += 1; return deliver(...args); };
    assert.equal((await recoverReceipt(fx)).outcome, 'conflict',
      'a committed permit is readback-only and must not authorize new recording');
    assert.deepEqual(fx.f.row(), inconsistent); assert.equal(deliveries, 0);
    assert.equal(fx.physical(), 0);
  });
