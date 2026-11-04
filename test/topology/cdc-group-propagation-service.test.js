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
import {CDC_COMPLETION, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
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
  createDurablePropagationRequest,
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

test('grouped mode: a missing coordinator address falls back to the conservative ' +
  'fan-out, and recovery returns to grouped with both transitions recorded', async (t) => {
  const f = compose(t, LATENCY_PROPAGATION_MODE.GROUPED, {services: []});
  const fallback = await f.propagate();
  assert.equal(fallback.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(fallback.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
  assert.equal(fallback.fallbackReason,
    CDC_GROUP_PROPAGATION_REASON.MISSING_COORDINATOR_ADDRESS);
  assert.equal(fallback.success, true, 'with no target, the source receipt completes it');
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

// The request contract (assertPropagationRequest): the durable surface or a
// typed refusal before any source or target effect. On base the volatile
// source double (applyCDCEvent only) and a non-durable event were accepted.
test('a request lacking the durable surface is refused typed before any effect',
  async (t) => {
    const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE);
    const event = createDurableCdcEvent();
    const volatileCalls = [];
    const volatileSource = {groupId: SOURCE_GROUP,
      applyCDCEvent: async (...args) => volatileCalls.push(args)};
    const {eventKey: _eventKey, ...nonDurableEvent} = event;
    const {applyCDCBatch: _applyCDCBatch, ...batchless} = f.source;
    const refusals = [
      [createDurablePropagationRequest(volatileSource, event),
        CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE],
      [createDurablePropagationRequest(batchless, event),
        CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_MESSAGE_GROUP_SERVICE],
      [{...createDurablePropagationRequest(f.source, event), data: null},
        CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_CDC_PAYLOAD],
      [{...nonDurableEvent, sourceMessageGroupService: f.source},
        CDC_GROUP_PROPAGATION_ERROR_MSG.MISSING_DURABLE_EVENT],
      [{...event, sourceMessageGroupService: f.source, deliveryContext: null},
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

test('contended durable propagation admits a 4-wave table slice before ' +
  'marking the active context contended, then holds the yielding table until the contender runs', async (t) => {
  let activeDeliverResolver = null;
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {
    answer: async (payload) => {
      if (activeDeliverResolver !== null) {
        const wait = new Promise((resolve) => {
          activeDeliverResolver = resolve;
        });
        await wait;
      }
      return committedTargetAnswer(payload);
    },
  });

  // Wave 1 of SERVICES is held in flight while PARTITIONS collides with BUSY.
  activeDeliverResolver = () => {};
  const wave1Req = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-1'}),
  );
  const wave1Promise = f.service.propagateCDCEvent(wave1Req);
  await Promise.resolve();
  await Promise.resolve();

  const contendingReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.PARTITIONS, eventKey: 'part-1'}),
  );
  const busyAnswer = await f.service.propagateCDCEvent(contendingReq);
  assert.equal(busyAnswer.success, false);
  assert.equal(busyAnswer.error, CDC_COMPLETION.BACKPRESSURE);

  const releaseWave1 = activeDeliverResolver;
  activeDeliverResolver = null;
  releaseWave1();
  const wave1Result = await wave1Promise;
  assert.equal(wave1Result.success, true);
  assert.equal(
    wave1Req.deliveryContext.isContended(),
    false,
    'first wave of contended table slice is not preempted before completing its slice',
  );

  // Waves 2..3 complete unpreempted; wave 4 marks the context contended so the source yields.
  for (let waveIndex = 2; waveIndex <= 3; waveIndex += 1) {
    const req = createDurablePropagationRequest(
      f.source,
      createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: `svc-${waveIndex}`}),
    );
    const res = await f.service.propagateCDCEvent(req);
    assert.equal(res.success, true);
    assert.equal(req.deliveryContext.isContended(), false);
  }

  const wave4Req = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-4'}),
  );
  const wave4Res = await f.service.propagateCDCEvent(wave4Req);
  assert.equal(wave4Res.success, true);
  assert.equal(
    wave4Req.deliveryContext.isContended(),
    true,
    '4th wave of a contended table slice marks deliveryContext contended so the source yields fairly',
  );

  // An immediate re-attempt by the yielding table (SERVICES) is held back so the contending table (PARTITIONS) runs next.
  const prematureServicesReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-5'}),
  );
  const heldAnswer = await f.service.propagateCDCEvent(prematureServicesReq);
  assert.equal(heldAnswer.success, false);
  assert.equal(heldAnswer.error, CDC_COMPLETION.BACKPRESSURE);

  const contenderRunReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.PARTITIONS, eventKey: 'part-1'}),
  );
  const contenderRes = await f.service.propagateCDCEvent(contenderRunReq);
  assert.equal(contenderRes.success, true);
});

test('contended durable propagation rotates 3 contending tables in deterministic FIFO slice order without 2-table ping-pong starvation and bounds healthy delivery cost', async (t) => {
  let activeDeliverResolver = null;
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {
    groups: ['g-1', 'g-2', 'g-3'],
    answer: async (payload) => {
      if (activeDeliverResolver !== null) {
        const wait = new Promise((resolve) => {
          activeDeliverResolver = resolve;
        });
        await wait;
      }
      return committedTargetAnswer(payload);
    },
  });

  // Hold wave 1 of SERVICES while PARTITIONS and NODES contend in order.
  activeDeliverResolver = () => {};
  const svcWave1Req = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-1'}),
  );
  const svcWave1Promise = f.service.propagateCDCEvent(svcWave1Req);
  await Promise.resolve();
  await Promise.resolve();

  const partContendReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.PARTITIONS, eventKey: 'part-1'}),
  );
  const partBusy = await f.service.propagateCDCEvent(partContendReq);
  assert.equal(partBusy.success, false);
  assert.equal(partBusy.error, CDC_COMPLETION.BACKPRESSURE);

  const nodesContendReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.NODES, eventKey: 'node-1'}),
  );
  const nodesBusy = await f.service.propagateCDCEvent(nodesContendReq);
  assert.equal(nodesBusy.success, false);
  assert.equal(nodesBusy.error, CDC_COMPLETION.BACKPRESSURE);

  const releaseWave1 = activeDeliverResolver;
  activeDeliverResolver = null;
  releaseWave1();
  assert.equal((await svcWave1Promise).success, true);

  for (let w = 2; w <= 4; w += 1) {
    const req = createDurablePropagationRequest(
      f.source,
      createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: `svc-${w}`}),
    );
    const res = await f.service.propagateCDCEvent(req);
    assert.equal(res.success, true);
    assert.equal(req.deliveryContext.isContended(), w === 4);
  }

  // SERVICES yielded after 4 waves; FIFO queue is [PARTITIONS, NODES].
  // Neither SERVICES nor NODES can jump ahead of PARTITIONS during the yield hold window.
  const svcJumpReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-5'}),
  );
  assert.equal((await f.service.propagateCDCEvent(svcJumpReq)).error, CDC_COMPLETION.BACKPRESSURE);

  const nodesJumpReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.NODES, eventKey: 'node-1'}),
  );
  assert.equal(
    (await f.service.propagateCDCEvent(nodesJumpReq)).error,
    CDC_COMPLETION.BACKPRESSURE,
  );

  // PARTITIONS is head of FIFO queue and runs its 4-wave slice.
  // Because NODES (and re-queued SERVICES) remain in waitingDurableSliceTables,
  // PARTITIONS is marked contended at wave 4 and yields to NODES instead of ping-ponging back to SERVICES.
  for (let w = 1; w <= 4; w += 1) {
    const req = createDurablePropagationRequest(
      f.source,
      createDurableCdcEvent({tableName: TABLES.PARTITIONS, eventKey: `part-${w}`}),
    );
    const res = await f.service.propagateCDCEvent(req);
    assert.equal(res.success, true);
    assert.equal(
      req.deliveryContext.isContended(),
      w === 4,
      `PARTITIONS wave ${w} should ${w === 4 ? '' : 'not '}be marked contended when NODES is queued`,
    );
  }

  // SERVICES still cannot jump ahead of NODES (which is now head of FIFO queue).
  const svcPingPongReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-5'}),
  );
  assert.equal(
    (await f.service.propagateCDCEvent(svcPingPongReq)).error,
    CDC_COMPLETION.BACKPRESSURE,
    '2-table ping-pong must be prevented while NODES is at the head of the FIFO contender queue',
  );

  // NODES runs its slice next.
  const nodesAdmittedReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.NODES, eventKey: 'node-1'}),
  );
  const nodesAdmittedRes = await f.service.propagateCDCEvent(nodesAdmittedReq);
  assert.equal(nodesAdmittedRes.success, true);

  // Verify healthy-schedule delivery cost bound: 9 completed waves across 2 target groups (g-2, g-3)
  // applied 9 source batches (1 per wave) and 18 target group deliveries (1 per target group per wave).
  assert.equal(f.source.batches.length, 9, 'healthy waves apply 1 source batch per wave');
  assert.equal(f.calls.length, 18, 'healthy waves deliver 1 proposal per target group per wave (proposals <= c*K*M)');
});

test('contended durable propagation evicts a retired/hydrated contender when the yield hold expires so active tables do not remain permanently contended', async (t) => {
  let nowMs = 2000;
  let activeDeliverResolver = null;
  const f = compose(t, LATENCY_PROPAGATION_MODE.SAFE, {
    options: {nowFn: () => nowMs},
    answer: async (payload) => {
      if (activeDeliverResolver !== null) {
        const wait = new Promise((resolve) => {
          activeDeliverResolver = resolve;
        });
        await wait;
      }
      return committedTargetAnswer(payload);
    },
  });

  // Wave 1 of SERVICES is in flight while SERVICE_DEFINITIONS contends and is then retired by hydration.
  activeDeliverResolver = () => {};
  const svcWave1Req = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: 'svc-1'}),
  );
  const svcWave1Promise = f.service.propagateCDCEvent(svcWave1Req);
  await Promise.resolve();
  await Promise.resolve();

  const retiredContenderReq = createDurablePropagationRequest(
    f.source,
    createDurableCdcEvent({tableName: TABLES.SERVICE_DEFINITIONS, eventKey: 'def-1'}),
  );
  const busyRes = await f.service.propagateCDCEvent(retiredContenderReq);
  assert.equal(busyRes.success, false);
  assert.equal(busyRes.error, CDC_COMPLETION.BACKPRESSURE);

  const releaseWave1 = activeDeliverResolver;
  activeDeliverResolver = null;
  releaseWave1();
  assert.equal((await svcWave1Promise).success, true);

  for (let w = 2; w <= 4; w += 1) {
    const req = createDurablePropagationRequest(
      f.source,
      createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: `svc-${w}`}),
    );
    const res = await f.service.propagateCDCEvent(req);
    assert.equal(res.success, true);
    assert.equal(req.deliveryContext.isContended(), w === 4);
  }

  // Advance clock past the 25ms yield hold window without SERVICE_DEFINITIONS re-attempting.
  nowMs += 30;

  // SERVICES resumes and completes 5+ waves without being marked contended again.
  for (let w = 5; w <= 9; w += 1) {
    const req = createDurablePropagationRequest(
      f.source,
      createDurableCdcEvent({tableName: TABLES.SERVICES, eventKey: `svc-${w}`}),
    );
    const res = await f.service.propagateCDCEvent(req);
    assert.equal(res.success, true);
    assert.equal(
      req.deliveryContext.isContended(),
      false,
      `wave ${w} must not be marked contended after retired contender is evicted`,
    );
  }
});
