// CDCGroupPropagationService propagates a partition's durable CDC event
// through one path, the durable wave: the source group applies the event's
// batch and every resolved target group is delivered to, grouped by
// coordinator or fanned out directly, until each answered the CDC outcome
// owner's committed (or provisional) receipt. A request without that durable
// surface is refused by the request contract before any effect.
//
// Deleted with the volatile branch (no production caller carries a
// non-durable event; see the D1e reachability census): the immediate same-row
// batching, the background retry waves and their coalescing, the grouped
// failure safe-fanout recovery and its fallback event/stat counters.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';

import {CDC_OPERATION, COLUMN, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {CDC_COMPLETION, cdcCommitWaitIdentity, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {
  LATENCY_PROPAGATION_MODE,
  LATENCY_TOPOLOGY_MESSAGE_TYPE,
} from '../../src/topology/latency-topology-constants.js';
import {buildCriticalVisibilityCdcPropagationDeliverySource} from
  '../../src/cache/cdc-propagation-delivery-profile.js';
import {
  CDC_GROUP_PUBLICATION_MODE,
  CDC_GROUP_PROPAGATION_DELIVERY_ERROR,
  CDC_GROUP_PROPAGATION_ERROR_MSG,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PROPAGATION_STATUS,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {
  committedTargetAnswer,
  createDurableCdcEvent,
  createDurableCdcVector,
  createDurablePropagationRequest,
  createDurableVectorPropagationRequest,
  createDurableSourceMessageGroupService,
  createGroupRow,
  createMessageGroupServiceRow,
  createTopologyCache,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

const SOURCE_GROUP = 'g-1';
const PRESSURE = Object.freeze({backpressured: true, saturatedNodeCount: 1,
  totalPending: 48, maxPendingUtilization: 0.75});

afterEach(teardownConfig);

function leaderRow(groupId, nodeId) {
  return createMessageGroupServiceRow(`${groupId}-r1`, nodeId,
    `${nodeId}/message-group/${groupId}-r1`, RAFT_ROLE.LEADER, groupId);
}

// One running service over a controlled projection. The router answers each
// delivery through `answer` (default: the target's committed receipt).
function compose(t, mode, {groups = ['g-1', 'g-2'], services, routingOrder,
  answer = (payload) => committedTargetAnswer(payload), options = {}} = {}) {
  setupConfig(mode);
  const calls = [];
  const router = {
    deliver: async (address, payload, deliveryOptions) => {
      calls.push({address, payload, options: deliveryOptions});
      return answer(payload, calls.length);
    },
  };
  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}],
      groups: groups.map((groupId, index) =>
        createGroupRow(groupId, index === 0 ? 'node-a' : `node-${groupId}`)),
      services: services ?? groups.slice(1).map((groupId) =>
        leaderRow(groupId, `node-${groupId}`)),
    }),
    messageRouter: router,
    latencyTreeService: {getRoutingOrder: () => routingOrder ?? groups},
    nowFn: () => 2000,
    deliveryRetryDelayMs: 1,
    deliveryRetryMaxDelayMs: 1,
    ...options,
  });
  service.logger = {info() {}, warn() {}, debug() {}, error() {},
    logConsoleOnly() {}};
  service.initialize();
  service.start();
  t.after(() => service.stop());
  const source = createDurableSourceMessageGroupService(SOURCE_GROUP);
  const propagate = (event = createDurableCdcEvent()) =>
    service.propagateCDCEvent(createDurablePropagationRequest(source, event));
  return {service, router, calls, source, propagate};
}

test('safe mode: the durable wave applies the source batch once and fans out ' +
  'directly to every active group leader', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {groups: ['g-1', 'g-2', 'g-3']});
  const result = await f.propagate();
  assert.equal(result.success, true);
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
  assert.equal(result.fallbackReason, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
  assert.equal(result.targetGroupCount, 2);
  assert.equal(f.source.batches.length, 1, 'the source group applies the batch once');
  assert.deepEqual(f.calls.map((call) => call.payload.targetGroupId).sort(), ['g-2', 'g-3']);
  assert.ok(f.calls.every((call) =>
    call.payload.type === LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION &&
    call.payload.sourceGroupId === SOURCE_GROUP));
  assert.equal(f.service.getStats().safeCount, 1);
});

test('safe mode: a durable propagation keeps the configured repair_only ' +
  'publication mode, with no transition', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
  const before = f.service.getPublicationModeDiagnostics();
  assert.equal(before.currentMode, CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY);
  assert.equal(before.reasonCode, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
  assert.ok(before.enteredAt, 'repair_only mode exposes enteredAt');
  assert.equal((await f.propagate()).success, true);
  const after = f.service.getPublicationModeDiagnostics();
  assert.equal(after.currentMode, CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY,
    'configured safe mode is the healthy repair_only mode, not a degraded fan-out');
  assert.equal(after.reasonCode, CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE);
  assert.deepEqual(after.recentTransitions, []);
});

test('grouped mode: the durable wave fans out to every group coordinator on the ' +
  'critical visibility lane', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.GROUPED,
    {groups: ['g-1', 'g-2', 'g-3'], routingOrder: ['g-1', 'g-3', 'g-2']});
  const nodeRow = {[COLUMN.NODE_ID]: 'node-z', [COLUMN.UPDATED_AT]: 2000};
  const result = await f.propagate(createDurableCdcEvent({data: nodeRow}));
  assert.equal(result.success, true);
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
  assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.targetGroupCount, 2);
  assert.deepEqual(Object.fromEntries(f.calls.map((call) =>
    [call.payload.targetGroupId, call.options.targetNodeId])),
  {'g-2': 'node-g-2', 'g-3': 'node-g-3'}, 'each group is delivered to its coordinator');
  for (const call of f.calls) {
    assert.equal(call.options.deliveryPriority, 'critical');
    assert.equal(call.options.deliverySource,
      buildCriticalVisibilityCdcPropagationDeliverySource(TABLES.NODES, 'node-z'));
  }
  assert.equal(f.service.getStats().groupedCount, 1);
  assert.equal(f.service.getPublicationModeDiagnostics().currentMode,
    CDC_GROUP_PUBLICATION_MODE.GROUPED);
});

// Reproducer R1-4 (quest cdc-obligation-range-shipping, design note 4.8): the
// request carries the lane's range as one ordered vector; the wave applies it as
// one source batch and one CDC_PROPAGATION_BATCH per target, never one wave per
// event, and its committed answer binds the whole vector.
test('R1-4 propagateCDCEvent({events}) of a five-event vector applies one source batch and ' +
  'sends one CDC_PROPAGATION_BATCH per target, committed over the whole vector', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {groups: ['g-1', 'g-2', 'g-3']});
  const events = createDurableCdcVector(5);
  const keys = events.map((event) => event.eventKey);
  const result = await f.service.propagateCDCEvent(
    createDurableVectorPropagationRequest(f.source, events));
  assert.equal(result.success, true);
  assert.equal(f.source.batches.length, 1, 'the source group applies the vector once');
  assert.deepEqual(f.source.batches[0].map((event) => event.eventKey), keys);
  assert.deepEqual(f.calls.map((call) => call.payload.targetGroupId).sort(), ['g-2', 'g-3'],
    'one delivery per target group');
  for (const call of f.calls) {
    assert.equal(call.payload.type, LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH);
    assert.deepEqual(call.payload.events.map((event) => event.eventKey), keys,
      'the vector keeps its order and every occurrence');
  }
  assert.equal(result.cdcVectorDigest, cdcCommitWaitIdentity(events));
});

// The two wire shapes of one range (challenge A4): a vector of one travels as
// CDC_PROPAGATION carrying the event itself, a longer vector as
// CDC_PROPAGATION_BATCH carrying `events`. The same occurrences reach the
// source group and every target unchanged and in order through either shape.
test('wire shape: the same three events as three vectors of one and as one vector reach the ' +
  'source batch and the target with the same members in the same order', async (t) => {
  const events = createDurableCdcVector(3);
  const keys = events.map((event) => event.eventKey);
  const single = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
  for (const event of events) {
    const result = await single.service.propagateCDCEvent(
      createDurableVectorPropagationRequest(single.source, [event]));
    assert.equal(result.success, true);
    assert.equal(result.cdcVectorDigest, cdcCommitWaitIdentity([event]));
  }
  const singleSourceMembers = single.source.batches.flat();
  const singleTargetMembers = single.calls.map((call) => call.payload);
  assert.deepEqual(single.source.batches.map((batch) => batch.length), [1, 1, 1]);
  assert.deepEqual(single.calls.map((call) => call.payload.type),
    keys.map(() => LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION));
  assert.equal(single.calls.some((call) => Object.hasOwn(call.payload, 'events')), false,
    'a vector of one carries its event in the payload itself');

  const batch = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
  const result = await batch.service.propagateCDCEvent(
    createDurableVectorPropagationRequest(batch.source, events));
  assert.equal(result.success, true);
  assert.equal(result.cdcVectorDigest, cdcCommitWaitIdentity(events));
  assert.deepEqual(batch.source.batches.map((members) => members.length), [3]);
  assert.deepEqual(batch.calls.map((call) => call.payload.type),
    [LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH]);
  assert.equal(Object.hasOwn(batch.calls[0].payload, 'eventKey'), false,
    'a longer vector carries its events only as `events`');

  assert.deepEqual(batch.source.batches[0].map((event) => event.eventKey), keys);
  assert.deepEqual(batch.source.batches[0], singleSourceMembers,
    'the source group applies the same members through either shape');
  const fieldsOf = (member) => Object.fromEntries(Object.keys(events[0])
    .map((field) => [field, member[field]]));
  assert.deepEqual(batch.calls[0].payload.events.map(fieldsOf),
    singleTargetMembers.map(fieldsOf),
    'a target is delivered the same members through either shape');
  assert.deepEqual(batch.calls[0].payload.events.map(fieldsOf), events,
    'and they are the request\'s events, unchanged and in order');
});

test('grouped mode: a missing coordinator address retains target-group debt ' +
  'without silent completion, and recovery returns to grouped with both transitions recorded', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.GROUPED,
    {services: [], options: {deliveryRetryMaxAttempts: 1}});
  const fallback = await f.propagate();
  assert.equal(fallback.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(fallback.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
  assert.equal(fallback.fallbackReason,
    CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS);
  assert.equal(fallback.success, false,
    'missing coordinator address keeps the required target group uncovered');
  assert.equal(fallback.deferRetry, true);
  assert.equal(fallback.targetGroupCount, 1);
  assert.deepEqual(fallback.failedTargetGroupIds, ['g-2']);
  assert.equal(f.calls.length, 0);
  const degraded = f.service.getPublicationModeDiagnostics();
  assert.equal(degraded.currentMode, CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT);
  assert.equal(degraded.reasonCode, CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS);

  const recovered = compose(t, LATENCY_PROPAGATION_MODE.GROUPED);
  recovered.service.setPublicationMode(degraded.currentMode, degraded.reasonCode);
  assert.equal((await recovered.propagate()).mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
  const diagnostics = recovered.service.getPublicationModeDiagnostics();
  assert.equal(diagnostics.currentMode, CDC_GROUP_PUBLICATION_MODE.GROUPED);
  assert.deepEqual(diagnostics.recentTransitions.map(({from, to}) => [from, to]), [
    [CDC_GROUP_PUBLICATION_MODE.GROUPED, CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT],
    [CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, CDC_GROUP_PUBLICATION_MODE.GROUPED],
  ]);
});

test('grouped mode: a newly known group in latency_groups is captured and delivered ' +
  'even when latencyTreeService.getRoutingOrder lags', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.GROUPED, {
    groups: ['g-1', 'g-2', 'g-3'],
    routingOrder: ['g-1', 'g-2'],
  });
  const result = await f.propagate();
  assert.equal(result.success, true);
  assert.equal(result.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
  assert.equal(result.strategy, CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR);
  assert.equal(result.targetGroupCount, 2);
  assert.deepEqual(
    f.calls.map((call) => call.payload.targetGroupId),
    ['g-2', 'g-3'],
    'lagging routingOrder is supplemented with required target groups from the cache',
  );
});

test('safe mode: a synthetic latency_groups row for a coordinator that already ' +
  'hosts an active message_group service resolves to the hosted message group without a phantom unroutable target', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {
    groups: [SOURCE_GROUP, 'lg-joiner-2-1794136292573'],
    services: [
      leaderRow('mg-joiner-1', 'node-joiner-1'),
      leaderRow('mg-joiner-2', 'node-lg-joiner-2-1794136292573'),
    ],
    routingOrder: [],
  });
  const result = await f.propagate();
  assert.equal(result.success, true);
  assert.equal(result.targetGroupCount, 2);
  assert.deepEqual(
    f.calls.map((call) => call.payload.targetGroupId).sort(),
    ['mg-joiner-1', 'mg-joiner-2'],
    'coordinator with hosted message_group service is targeted once via its canonical message group id',
  );
});

test('a thrown target delivery is an unknown answer, never a throw: the wave ' +
  'returns the debt with its cause', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {options: {deliveryRetryMaxAttempts: 1},
    answer: () => {
      throw new Error('socket closed');
    }});
  const result = await f.propagate();
  assert.equal(result.success, false);
  assert.equal(result.deferRetry, true);
  assert.equal(result.error, CDC_COMPLETION.UNKNOWN);
  assert.equal(result.cause.cause.message, 'socket closed');
  assert.equal(f.calls.length, 1);
});

test('a transient target refusal is retried in the foreground until the ' +
  'target answers its committed receipt', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {answer: (payload, count) =>
    count === 1 ? unknownCdcAcceptance() : committedTargetAnswer(payload)});
  const result = await f.propagate();
  assert.equal(result.success, true);
  assert.equal(f.calls.length, 2, 'one refused attempt, one committed retry');
  assert.equal(f.source.batches.length, 1, 'the covered source is not applied again');
});

test('under local router pressure a background-class wave defers without ' +
  'delivering, while partition visibility keeps the critical lane', async (t) => {
  const deferred = compose(t, LATENCY_PROPAGATION_MODE.SAFE,
    {options: {deliveryRetryMaxAttempts: 1}});
  deferred.router.getOutboundPressureSummary = () => ({...PRESSURE});
  const held = await deferred.propagate(createDurableCdcEvent({tableName: TABLES.MESSAGE_GROUPS,
    operation: CDC_OPERATION.UPSERT, data: {[COLUMN.GROUP_ID]: 'mg-pressure'}}));
  assert.equal(held.success, false);
  assert.equal(held.deferRetry, true, 'the source owner keeps the debt for a later attempt');
  assert.equal(deferred.calls.length, 0, 'no delivery under local pressure');

  const critical = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
  critical.router.getOutboundPressureSummary = () => ({...PRESSURE});
  const delivered = await critical.propagate(createDurableCdcEvent({tableName: TABLES.PARTITIONS,
    operation: CDC_OPERATION.INSERT,
    data: {partition_id: 'tbl-critical-p1', table_id: 'tbl-critical'}}));
  assert.equal(delivered.success, true);
  assert.equal(critical.calls.length, 1, 'critical visibility bypasses the local defer');
  assert.equal(critical.calls[0].options.deliveryPriority, 'critical');
  assert.equal(critical.calls[0].options.deliverySource,
    buildCriticalVisibilityCdcPropagationDeliverySource(TABLES.PARTITIONS, 'tbl-critical-p1'));
});

// The request contract (assertPropagationRequest): the durable surface and a
// vector of durable events of one table, or a typed refusal before any source
// or target effect. On base the volatile source double (applyCDCEvent only)
// and a non-durable event were accepted. A request shaped as one event (the
// payload beside the source, no `events`) is not a request any more.
test('a request lacking the durable surface or a one-table durable vector is refused typed ' +
  'before any effect', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
  const event = createDurableCdcEvent();
  const second = createDurableCdcEvent({eventKey: 'durable-event-2', sourceLogIndex: 2});
  const volatileCalls = [];
  const volatileSource = {groupId: SOURCE_GROUP,
    applyCDCEvent: async (...args) => volatileCalls.push(args)};
  const {eventKey: _eventKey, ...nonDurableEvent} = second;
  const {applyCDCBatch: _applyCDCBatch, ...batchless} = f.source;
  const request = (events, extra = {}) =>
    ({...createDurableVectorPropagationRequest(f.source, events), ...extra});
  const refusals = [
    [createDurablePropagationRequest(volatileSource, event),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE],
    [createDurablePropagationRequest(batchless, event),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE],
    [request([event, {...second, data: null}]),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
    [request([]), CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
    [request(event), CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
    [{...event, sourceMessageGroupService: f.source,
      deliveryContext: request([event]).deliveryContext},
    CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
    [request([event, {...second, tableName: TABLES.CONFIG}]),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
    [request([event, nonDurableEvent]),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_DURABLE_EVENT],
    [request([event, second], {deliveryContext: null}),
      CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_DURABLE_EVENT],
  ];
  for (const [request, message] of refusals) {
    await assert.rejects(f.service.propagateCDCEvent(request),
      (error) => error.message === message && error.isCritical === true);
  }
  assert.deepEqual(volatileCalls, [], 'the volatile apply is never read');
  assert.equal(f.source.batches.length, 0);
  assert.equal(f.calls.length, 0);
});

test('a stopped service answers the typed stopped unknown and applies or ' +
  'delivers nothing', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.GROUPED);
  f.service.stop();
  const result = await f.propagate();
  assert.equal(result.success, false);
  assert.equal(result.deferRetry, true);
  assert.equal(result.reason, CDC_GROUP_PROPAGATION_DELIVERY_ERROR.PROPAGATION_STOPPED);
  assert.equal(f.source.batches.length, 0);
  assert.equal(f.calls.length, 0);
});
