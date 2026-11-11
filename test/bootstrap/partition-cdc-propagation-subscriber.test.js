// The durable subscriber contract of buildPartitionCdcPropagationSubscriber:
// (events, deliveryContext) - one vector of this table's durable events and
// the source delivery owner's invocation - answered with the propagation
// outcome over that exact vector.
import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {test} from '../../src/test-helpers/tap.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {
  attachPartitionCdcPropagation,
  buildPartitionCdcPropagationSubscriber,
  registerPartitionCdcPropagation,
} from '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {subscribeToHydrationCDC} from
  '../../src/bootstrap/phases/seed-cache-hydration-cdc-subscription.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE, PARTITION_CDC_OBLIGATION_LOG_MSG,
  PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {EventEmitter} from 'node:events';
import {MESSAGE_GROUP_SERVICE_LITERAL} from
  '../../src/message-group/message-group-service-runtime-support.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {CDC_INSERT_SQL, CDC_TABLE, applyCommitted, committedQueryOf, settleTicks,
  shutdownAll, startLeader} from '../test-helpers/participant-transaction-fixture.js';
import {beginDurableCdcInvocation, createDurableCdcEvent} from
  '../topology/cdc-group-propagation-service-harness.js';

const REPLICA_ID = 'nodes-p1-r1';
const PARTITION_ID = 'nodes-p1';
const RETRY_AFTER_MS = 250;
const DEFER_REASON = 'leader-transition';
const READY_REASON = null;
const READY_READINESS = Object.freeze({
  ready: true,
  retryAfterMs: 0,
  reason: READY_REASON,
});
const DEFERRED_READINESS = Object.freeze({
  ready: false,
  retryAfterMs: RETRY_AFTER_MS,
  reason: DEFER_REASON,
});
const GROUP_ID = 'selected-ingress-group';
const CDC_EVENT = Object.freeze(createDurableCdcEvent({
  tableName: TABLES.NODES, data: {node_id: 'node-1'}, eventKey: 'nodes-write-1'}));
const LATER_EVENT = Object.freeze(createDurableCdcEvent({
  tableName: TABLES.NODES, data: {node_id: 'node-2'}, eventKey: 'nodes-write-2',
  sourceLogIndex: 2}));
// A controlled committed answer over the delivered vector, never evidence of
// a recipient commit.
const committedAnswer = (events) => buildCommittedCdcOutcome(events, GROUP_ID,
  {index: 1, term: 1});
const OWNER_NOT_READY_MESSAGE =
  `Operational message-group ingress not ready for ${TABLES.NODES} CDC propagation`;

function buildOwnerNotReadyError(selection = {}, options = {}) {
  const error = new Error(options.message || OWNER_NOT_READY_MESSAGE);
  error.ownerNotReady = true;
  error.deferRetry = true;
  if (Number.isFinite(selection.retryAfterMs) && selection.retryAfterMs > 0) {
    error.retryAfterMs = selection.retryAfterMs;
  }
  return error;
}

test(
  'buildPartitionCdcPropagationSubscriber defers on preferred ingress readiness before propagation starts',
  async (t) => {
    let propagateCallCount = 0;
    const preferredService = {
      canAcceptCDCEvent() {
        return DEFERRED_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService,
      resolveOperationalMessageGroupSelection: () => ({
        service: null,
        ...DEFERRED_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: preferredService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      propagatePartitionCDCEvent: async () => {
        propagateCallCount += 1;
      },
    });

    assert.deepEqual(
      subscriber.canAcceptCDCEvent(CDC_EVENT),
      DEFERRED_READINESS,
      'subscriber should surface preferred ingress defer readiness',
    );

    await assert.rejects(
      () => subscriber([CDC_EVENT], beginDurableCdcInvocation()),
      (error) => {
        assert.equal(error.ownerNotReady, true);
        assert.equal(error.deferRetry, true);
        assert.equal(error.retryAfterMs, RETRY_AFTER_MS);
        assert.equal(error.message, OWNER_NOT_READY_MESSAGE);
        return true;
      },
      'subscriber should defer instead of starting propagation work',
    );

    t.equal(propagateCallCount, 0,
      'propagation should not start when preferred ingress reports defer');
  },
);

test(
  'buildPartitionCdcPropagationSubscriber falls back to the current operational ingress when preferred ingress is absent',
  async (t) => {
    let propagatedMessageGroupService = null;
    let propagatedEvents = null;
    const selectedService = {
      groupId: GROUP_ID,
      canAcceptCDCEvent() {
        return READY_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService: null,
      resolveOperationalMessageGroupSelection: () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      propagatePartitionCDCEvent: async (messageGroupService, events) => {
        propagatedMessageGroupService = messageGroupService;
        propagatedEvents = events;
        return committedAnswer(events);
      },
    });

    assert.deepEqual(
      subscriber.canAcceptCDCEvent(CDC_EVENT),
      READY_READINESS,
      'subscriber should report ready when the current operational ingress is ready',
    );

    const vector = [CDC_EVENT, LATER_EVENT];
    const answer = await subscriber(vector, beginDurableCdcInvocation());

    t.equal(
      propagatedMessageGroupService,
      selectedService,
      'subscriber should propagate through the current operational ingress',
    );
    t.equal(
      propagatedEvents,
      vector,
      'subscriber should hand the delivered vector whole to propagation',
    );
    t.same(answer, committedAnswer(vector),
      'the source delivery owner consumes the propagation answer over that vector');
  },
);

test(
  'buildPartitionCdcPropagationSubscriber preserves before and after propagation hooks',
  async (t) => {
    const observedSteps = [];
    const selectedService = {
      groupId: GROUP_ID,
      canAcceptCDCEvent() {
        return READY_READINESS;
      },
    };
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      partitionId: PARTITION_ID,
      replicaId: REPLICA_ID,
      preferredService: selectedService,
      resolveOperationalMessageGroupSelection: () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: selectedService,
        ...READY_READINESS,
      }),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      beforePropagation: async (events) => {
        observedSteps.push(`before:${events.map((event) => event.eventKey).join('+')}`);
      },
      propagatePartitionCDCEvent: async (_service, events) => {
        observedSteps.push(`propagate:${events.length}`);
        return committedAnswer(events);
      },
      afterPropagation: async (events) => {
        observedSteps.push(`after:${events.map((event) => event.eventKey).join('+')}`);
      },
    });

    await subscriber([CDC_EVENT, LATER_EVENT], beginDurableCdcInvocation());

    t.same(
      observedSteps,
      ['before:nodes-write-1+nodes-write-2', 'propagate:2',
        'after:nodes-write-1+nodes-write-2'],
      'each hook receives the vector, in log order, once around its one propagation',
    );
  },
);

test(
  'buildPartitionCdcPropagationSubscriber refuses anything but a vector of its table\'s ' +
  'durable events under a delivery invocation',
  async (t) => {
    let propagateCallCount = 0;
    const selectedService = {groupId: GROUP_ID, canAcceptCDCEvent: () => READY_READINESS};
    const subscriber = buildPartitionCdcPropagationSubscriber({
      tableName: TABLES.NODES,
      preferredService: selectedService,
      resolveOperationalMessageGroupSelection: () => ({service: selectedService,
        ...READY_READINESS}),
      resolveOperationalMessageGroupSelectionAsync: async () => ({service: selectedService,
        ...READY_READINESS}),
      buildMessageGroupOwnerNotReadyError: buildOwnerNotReadyError,
      propagatePartitionCDCEvent: async (_service, events) => {
        propagateCallCount += 1;
        return committedAnswer(events);
      },
    });
    const {eventKey: _eventKey, ...ordinary} = CDC_EVENT;
    const otherTable = createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'other'});
    const invalid = {code: CDC_COMPLETION.INVALID};
    await assert.rejects(() => subscriber(CDC_EVENT, beginDurableCdcInvocation()), invalid,
      'the single-event shape has no contract');
    await assert.rejects(() => subscriber([ordinary], beginDurableCdcInvocation()), invalid);
    await assert.rejects(() => subscriber([CDC_EVENT, otherTable], beginDurableCdcInvocation()),
      invalid);
    await assert.rejects(() => subscriber([CDC_EVENT], null), invalid,
      'a durable vector travels only under its delivery invocation');
    t.equal(propagateCallCount, 0);
  },
);

// --- One propagation subscriber per partition replica (R01) ---------------
// The seed hydration path registers through registerPartitionCdcPropagation
// on a real source lane (application, ledger, subscription and acknowledgement
// owners on the controllable consensus fixture); the message groups and the
// propagation answer are controlled.

const LANE_GROUPS = Object.freeze(['mg-lane-a', 'mg-lane-b', 'mg-lane-c']);

function laneMessageGroup(groupId) {
  return {groupId, initialized: true, canAcceptCDCEvent: () => true,
    subscribeToCDC: async () => {}};
}

async function seedHostingGroups(t, groupIds) {
  const {leader} = await startLeader({tableName: CDC_TABLE,
    timeSource: new VirtualTimeSource({startMs: 100})});
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const services = new Map(groupIds.map((groupId, index) =>
    [`${groupId}-r${index + 1}`, laneMessageGroup(groupId)]));
  const operational = [...services.values()][0];
  const deliveries = [];
  const selection = () => ({ready: true, service: operational});
  const delegates = {
    getLogger: () => ({debug() {}, info() {}, warn() {}, error() {}}),
    getNodeId: () => 'seed-node',
    getMessageGroupServices: () => services,
    getPartitionServices: () => new Map([[leader.replicaId, leader]]),
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => new Error('controlled readiness'),
    propagatePartitionCDCEvent: async (service, events, context) => {
      const groupId = context.recipientGroupId ?? service.groupId;
      deliveries.push({groupId, eventKeys: events.map((event) => event.eventKey)});
      return buildCommittedCdcOutcome(events, groupId, {index: 9, term: 1});
    },
  };
  return {leader, services, operational, deliveries, delegates};
}

async function commitAndDrive(leader, id) {
  const command = committedQueryOf(`lane-${id}`, CDC_INSERT_SQL);
  command.params = [id, `value-${id}`];
  command.timestamp = new HLCTimestamp(1000, 0, 'lane-uniqueness').toString();
  assert.equal(applyCommitted(leader, command), null);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  await leader.cdcDelivery.driveCdcObligations(PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY);
  await settleTicks();
}

test('a seed hosting replicas of several message groups registers exactly one propagation ' +
  'subscriber per partition replica, and each committed vector reaches each group once',
async (t) => {
  const f = await seedHostingGroups(t, LANE_GROUPS);
  await subscribeToHydrationCDC({delegates: f.delegates, tableName: CDC_TABLE,
    partitionId: f.leader.partitionId, replicaIds: [f.leader.replicaId],
    preferredService: f.operational});
  await commitAndDrive(f.leader, 'row-1');

  const subscriptions = f.leader.cdcDelivery.getCDCSubscriptionDiagnostics().subscriptions;
  const perGroup = new Map();
  for (const {groupId} of f.deliveries) perGroup.set(groupId, (perGroup.get(groupId) ?? 0) + 1);
  const recipients = f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients;
  assert.deepEqual({
    subscriberIds: subscriptions.map(({subscriberId}) => subscriberId),
    deliveriesPerGroup: Object.fromEntries(perGroup),
    distinctRecipientGroups: new Set(recipients.map(({groupId}) => groupId)).size ===
      recipients.length,
  }, {
    subscriberIds: [`bootstrap:seed-node:${CDC_TABLE}:${f.leader.replicaId}`],
    deliveriesPerGroup: {[LANE_GROUPS[0]]: 1},
    distinctRecipientGroups: true,
  });
});

test('the partition refuses a second, different propagation subscriber with a typed result; ' +
  're-registering the holder stays ALREADY_SUBSCRIBED', async (t) => {
  const f = await seedHostingGroups(t, [LANE_GROUPS[0]]);
  const register = (role) => registerPartitionCdcPropagation(f.leader, {
    role, nodeId: 'seed-node', tableName: CDC_TABLE, partitionId: f.leader.partitionId,
    replicaId: f.leader.replicaId, preferredService: f.operational,
    resolveOperationalMessageGroupSelection: f.delegates.resolveOperationalMessageGroupSelection,
    resolveOperationalMessageGroupSelectionAsync:
      f.delegates.resolveOperationalMessageGroupSelectionAsync,
    buildMessageGroupOwnerNotReadyError: f.delegates.buildMessageGroupOwnerNotReadyError,
    propagatePartitionCDCEvent: f.delegates.propagatePartitionCDCEvent,
  });
  const holder = await register('bootstrap');
  const again = await register('bootstrap');
  await assert.rejects(register('joining'), {
    code: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD,
    holderSubscriberId: holder.subscriberId,
  });
  const direct = await f.leader.subscribeToCDCWithHandshake(async () => null,
    {subscriberId: 'second-propagation',
      role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION});
  const observer = await f.leader.subscribeToCDCWithHandshake(async () => null,
    {subscriberId: 'observer'});
  assert.deepEqual({
    holder: holder.status,
    again: again.status,
    direct: {status: direct.status, holderSubscriberId: direct.holderSubscriberId},
    observer: observer.status,
    subscribers: f.leader.cdcDelivery.getCDCSubscriptionDiagnostics().subscriptions
      .map(({subscriberId}) => subscriberId),
  }, {
    holder: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
    again: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_ALREADY_SUBSCRIBED,
    direct: {status: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD,
      holderSubscriberId: holder.subscriberId},
    observer: PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_OK,
    subscribers: [holder.subscriberId, 'observer'],
  });
});

// A deferred propagation attachment that finds no operational message group
// is a named state held on the partition, never a logged-and-dropped failure:
// the lane names owed rows with no subscriber (and wakes the attachment), and
// the message group's readiness event attaches it, after which the owed rows
// are delivered.
test('a deferred propagation attachment awaiting its message group attaches on the group\'s ' +
  'readiness event; meanwhile owed rows are the named, logged NO_PROPAGATION_SUBSCRIBER', async (t) => {
  const f = await seedHostingGroups(t, [LANE_GROUPS[0]]);
  const group = Object.assign(new EventEmitter(), f.operational);
  f.services.clear();
  f.services.set('mg-lane-a-r1', group);
  let ready = false;
  const warnings = [];
  f.leader.logger = Object.assign(Object.create(f.leader.logger), {
    warn: (message, detail) => warnings.push({message, detail})});
  const selection = () => ({ready, service: ready ? group : null});
  const attached = await attachPartitionCdcPropagation(f.leader, {
    tableName: CDC_TABLE, preferredService: null, defer: true,
    messageGroupServices: () => f.services, logger: null, logContext: {},
    notReadyMessage: 'controlled: no operational message group',
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: (_selection, {message}) => new Error(message),
    registration: {role: 'joining', nodeId: 'joiner-node', partitionId: f.leader.partitionId,
      replicaId: f.leader.replicaId,
      resolveOperationalMessageGroupSelection: selection,
      resolveOperationalMessageGroupSelectionAsync: async () => selection(),
      buildMessageGroupOwnerNotReadyError: f.delegates.buildMessageGroupOwnerNotReadyError,
      propagatePartitionCDCEvent: f.delegates.propagatePartitionCDCEvent},
  });
  assert.equal(attached, null, 'a deferred attachment does not gate its caller');
  await settleTicks();
  assert.equal(typeof f.leader.cdcDelivery.propagationAttachment, 'function',
    'the failed attempt is the awaited state held on the partition');
  await commitAndDrive(f.leader, 'owed-1');
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().lastDrive.state,
    PARTITION_CDC_OBLIGATION_DRIVE_STATE.NO_PROPAGATION_SUBSCRIBER);
  assert.deepEqual(warnings.filter(({message}) =>
    message === PARTITION_CDC_OBLIGATION_LOG_MSG.OWED_WITHOUT_PROPAGATION_SUBSCRIBER)
    .map(({detail}) => [detail.owed, detail.attachmentPending]), [[1, true]],
  'owed rows without a subscriber are named once per tenure');
  assert.deepEqual(f.deliveries, []);

  ready = true;
  group.emit(MESSAGE_GROUP_SERVICE_LITERAL.LEADERELECTED, {});
  await settleTicks();
  assert.deepEqual(f.leader.cdcDelivery.getCDCSubscriptionDiagnostics().subscriptions
    .map(({subscriberId}) => subscriberId), [`joining:joiner-node:${CDC_TABLE}:${f.leader.replicaId}`]);
  assert.deepEqual(f.deliveries.flatMap(({eventKeys}) => eventKeys).length, 1,
    'the owed row was delivered once the subscriber attached');
  assert.equal(f.leader.cdcDelivery.propagationAttachment, null, 'the awaited state is released');
  assert.equal(group.listenerCount(MESSAGE_GROUP_SERVICE_LITERAL.INITIALIZED), 0,
    'no listener outlives the attachment');
});
