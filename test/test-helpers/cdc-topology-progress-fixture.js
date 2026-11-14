import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../src/transport/transport-error-codes.js';
// Component fixture: real source apply/ledger/subscription and topology owners,
// with controlled route projections and recipient answers. These answers are
// deliberately not evidence of a native recipient commit or a system-row write.
import assert from 'node:assert/strict';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {isIssuedBootIncarnation} from '../../src/bootstrap/boot-incarnation-contract.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome, buildProvisionalCdcOutcome,
  unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {FAST_FOREGROUND_RETRY, createDurableSourceMessageGroupService, createHeldMessageRouter,
  createMessageGroupServiceRow, deliveredEventsOf} from
  '../topology/cdc-group-propagation-service-harness.js';
import {CDC_TABLE as TABLE, applyCommitted, committedQueryOf, settleTicks, shutdownAll,
  startLeader} from
  './participant-transaction-fixture.js';

const SOURCE_GROUP = 'progress-group-a';
const TARGET_GROUP = 'progress-group-b';
const SOURCE_NODE = 'node-a';
const TARGET_NODE = 'node-b';
const RETRY_AFTER_MS = 20;
const RESPONSE = Object.freeze({NATIVE: 'native', WEAK: 'weak', UNKNOWN: 'unknown'});

function controlledAnswer(events, groupId, mode) {
  const answer = mode === RESPONSE.NATIVE ?
    buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2}) :
    mode === RESPONSE.WEAK ? buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId) :
      unknownCdcAcceptance();
  return answer;
}

function serviceRow(groupId, nodeId) {
  return {...createMessageGroupServiceRow(`${groupId}-r1`, nodeId,
    `${nodeId}/message-group/${groupId}-r1`, RAFT_ROLE.LEADER, groupId),
  [COLUMN.REPLICA_ID]: `${groupId}-r1`, [COLUMN.CREATED_AT]: 100,
  create_attempt_token: `${groupId}-birth-1`};
}

function controlledProjection() {
  const nodes = new Map([
    [SOURCE_NODE, {[COLUMN.NODE_ID]: SOURCE_NODE, [COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}],
    [TARGET_NODE, {[COLUMN.NODE_ID]: TARGET_NODE, [COLUMN.BOOT_INCARNATION]: 1}],
  ]);
  assert.equal(isIssuedBootIncarnation(nodes.get(TARGET_NODE)[COLUMN.BOOT_INCARNATION]), true);
  const projection = {nodes, groups: [], services: [serviceRow(TARGET_GROUP, TARGET_NODE)]};
  projection.cache = {
    get: (table, key) => table === TABLES.NODES ? nodes.get(key) ?? null : null,
    getAll: (table) => table === TABLES.LATENCY_GROUPS ? projection.groups : [],
    filter: (table, predicate) => table === TABLES.SERVICES ?
      projection.services.filter(predicate) : [],
  };
  return projection;
}

function buildTopology(f) {
  const source = createDurableSourceMessageGroupService(SOURCE_GROUP, {
    canAcceptCDCEvent: () => f.ready,
    applyCDCBatch: (events) => {
      f.sourceCalls.push(events.map((event) => event.eventKey));
      return controlledAnswer(events, SOURCE_GROUP, f.sourceMode);
    }});
  const router = {deliver: async (address, payload, options) => {
    assert.equal(f.leader.db.inTransaction, false);
    const delivered = deliveredEventsOf(payload);
    f.targetCalls.push({address, groupId: payload.targetGroupId,
      nodeId: options.targetNodeId, eventKey: delivered[0].eventKey,
      eventKeys: delivered.map((event) => event.eventKey)});
    if (f.duringTarget) f.duringTarget();
    return buildDeliveryEnvelope({acknowledged: true},
      controlledAnswer(delivered, payload.targetGroupId, f.targetMode));
  }};
  const topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: f.projection.cache, messageRouter: router,
    latencyTreeService: {getRoutingOrder: () => f.projection.groups.map((row) => row.group_id)},
    nowFn: () => f.clock.now(), ...FAST_FOREGROUND_RETRY});
  topology.initialize();
  topology.start();
  return {source, topology};
}

function buildSubscriber(f, index) {
  const source = index === 0 ? f.source : {groupId: 'other-responsible-subscriber',
    canAcceptCDCEvent: () => f.ready};
  const selection = () => ({ready: f.ready, service: source});
  return buildPartitionCdcPropagationSubscriber({tableName: TABLE,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => Object.assign(new Error('controlled readiness'),
      {retryAfterMs: RETRY_AFTER_MS}),
    propagatePartitionCDCEvent: (_selected, events, context) => {
      f.subscriberCalls.push(index);
      if (index === 0) {
        return f.topology.propagateCDCEvent({events,
          sourceMessageGroupService: f.source, deliveryContext: context});
      }
      if (f.expireOther) f.clock.advance(context.remainingMs());
      if (f.duringOther) f.duringOther();
      return controlledAnswer(events, source.groupId, f.otherMode);
    },
    afterPropagation: () => f.hooks.push(index),
  });
}

async function topologyProgressFixture(t) {
  const clock = new VirtualTimeSource({startMs: 100});
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  const f = {clock, leader, proposed, ready: false, projection: controlledProjection(),
    sourceCalls: [], targetCalls: [], subscriberCalls: [], hooks: [],
    sourceMode: RESPONSE.NATIVE, targetMode: RESPONSE.WEAK, otherMode: RESPONSE.NATIVE,
    expireOther: false, duringTarget: null, duringOther: null};
  t.after(async () => {
    f.topology?.stop();
    await shutdownAll(leader);
  });
  Object.assign(f, buildTopology(f));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  for (let index = 0; index < 2; index += 1) {
    await leader.subscribeToCDCWithHandshake(buildSubscriber(f, index),
      {subscriberId: `topology-progress-${index}`});
  }
  const command = committedQueryOf('topology-progress-source-row',
    `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  command.params = ['A', 'retained-source-body'];
  command.timestamp = new HLCTimestamp(1000, 0, 'topology-progress-component').toString();
  assert.equal(applyCommitted(leader, command), null);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.equal(f.subscriberCalls.length, 0);
  assert.deepEqual(countCdcObligations(leader.db), {owed: 1, delivered: 0});
  f.ready = true;
  f.drive = () => leader.cdcDelivery.driveCdcObligations(
    PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY);
  return f;
}

function assertDebtWithoutAck(f) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed: 1, delivered: 0});
  assert.equal(f.proposed.some((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    false);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
}

function addRequiredGroup(f, groupId = 'progress-group-c') {
  const row = serviceRow(groupId, 'node-c');
  f.projection.services.push(row);
  return row;
}

function omitTarget(f) {
  f.projection.services[0][COLUMN.STATUS] = SERVICE_STATUS.STOPPED;
}

// One source lane over the shared topology owner: a partition leader of
// `tableName` with its one propagation subscriber, and `rows` committed and
// owed before it leads (so no recipient callback runs during setup). Its
// CDC_DELIVERED proposals commit at once through the real application owner.
// Each lane is a leader of its own partition (`partitionId`), so two lanes
// may lead partitions of one table.
async function startSourceLane(f, {tableName, partitionId, rows}) {
  const {leader, proposed} = await startLeader({tableName, timeSource: f.clock}, partitionId);
  f.leaders.push(leader);
  leader.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
    applyCommitted(leader, entry);
  });
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const selection = () => ({ready: true, service: f.source});
  await leader.subscribeToCDCWithHandshake(buildPartitionCdcPropagationSubscriber({tableName,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => Object.assign(new Error('controlled readiness'),
      {retryAfterMs: RETRY_AFTER_MS}),
    propagatePartitionCDCEvent: (_selected, events, context) => f.topology.propagateCDCEvent({
      events, sourceMessageGroupService: f.source, deliveryContext: context}),
  }), {subscriberId: `lane-${partitionId}`});
  const lane = {tableName, partitionId, leader, proposed,
    drive: () => leader.cdcDelivery.driveCdcObligations(
      PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY),
    diagnostics: () => leader.cdcDelivery.getCdcObligationDiagnostics(),
    addRow: (id) => {
      const command = committedQueryOf(`${partitionId}-${id}`,
        `INSERT INTO ${tableName} (id, value) VALUES (?, ?)`);
      command.params = [id, `value-${id}`];
      command.timestamp = new HLCTimestamp(1000, 0, `lane-${partitionId}`).toString();
      assert.equal(applyCommitted(leader, command), null);
    }};
  for (const id of rows) lane.addRow(id);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.deepEqual(countCdcObligations(leader.db), {owed: rows.length, delivered: 0});
  return lane;
}

// What a multi-lane recipient (or the source group) answers. Besides the
// RESPONSE modes: the CDC outcome owner's BACKPRESSURE (a commit queue at
// capacity, answered before any proposal, with its hint), and two transport
// outcomes built by the transport owner for a delivery that was never sent:
// the router's outbound-queue rejection (typed backpressure, with its hint)
// and a closed connection (a failure that is not backpressure).
const LEAF = Object.freeze({...RESPONSE, BACKPRESSURE: 'backpressure',
  OUTBOUND_BACKPRESSURE: 'outbound_backpressure', CONNECTION_CLOSED: 'connection_closed'});

function leafAnswer(events, groupId, leaf, hintMs = RETRY_AFTER_MS) {
  return leaf === LEAF.BACKPRESSURE ?
    {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE), retryAfterMs: hintMs} :
    controlledAnswer(events, groupId, leaf);
}

function leafEnvelope(events, groupId, leaf, hintMs = RETRY_AFTER_MS) {
  if (leaf === LEAF.OUTBOUND_BACKPRESSURE) {
    return buildDeliveryEnvelope({errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
      retryAfterMs: hintMs});
  }
  if (leaf === LEAF.CONNECTION_CLOSED) {
    return buildDeliveryEnvelope({errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE});
  }
  return buildDeliveryEnvelope({acknowledged: true}, leafAnswer(events, groupId, leaf, hintMs));
}

// Several source lanes of one node over one real topology owner (safe mode,
// one target group unless the test adds more) and the node's one source
// message group: one lane per partition the node leads, each with its own
// partition identity. The router holds every target delivery the test does
// not answer at once: `f.answer(call)` returns a LEAF for the recipient's
// answer now (optionally {leaf, hintMs}), or null to hold it
// (`f.release(call, leaf)`). `f.sourceAnswer(events)` is the source group's
// LEAF for each apply (default NATIVE). Every target call records its lane
// (by source partition), its row ids and whether it is still held.
// `laneSpecs`: [{tableName, partitionId?, rows}].
async function multiLaneTopologyFixture(t, laneSpecs) {
  const clock = new VirtualTimeSource({startMs: 100});
  const f = {clock, leaders: [], sourceBatches: [], answer: () => LEAF.NATIVE,
    sourceAnswer: () => LEAF.NATIVE};
  f.source = createDurableSourceMessageGroupService(SOURCE_GROUP, {
    applyCDCBatch: (events) => {
      f.sourceBatches.push(events.map((event) => event.data.id));
      return leafAnswer(events, SOURCE_GROUP, f.sourceAnswer(events));
    }});
  const envelope = (call, response) => {
    const {leaf, hintMs} = typeof response === 'string' ? {leaf: response} : response;
    return leafEnvelope(deliveredEventsOf(call.payload), call.targetGroupId, leaf, hintMs);
  };
  f.router = createHeldMessageRouter((call) => {
    call.ids = deliveredEventsOf(call.payload).map((event) => event.data.id);
    const response = f.answer(call);
    return response === null ? null : envelope(call, response);
  });
  f.release = (call, response = LEAF.NATIVE) => call.answer(envelope(call, response));
  f.projection = controlledProjection();
  f.topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: f.projection.cache, messageRouter: f.router,
    latencyTreeService: {getRoutingOrder: () => []},
    nowFn: () => clock.now(), ...FAST_FOREGROUND_RETRY});
  f.topology.initialize();
  f.topology.start();
  t.after(async () => {
    f.topology.stop();
    for (const call of f.router.calls.filter((entry) => entry.held)) f.release(call);
    await shutdownAll(...f.leaders);
  });
  f.lanes = [];
  for (const spec of laneSpecs) {
    f.lanes.push(await startSourceLane(f,
      {partitionId: `${spec.tableName}-p1`, ...spec}));
  }
  f.callsOf = (lane) => f.router.calls.filter((call) =>
    call.sourcePartition === lane.partitionId);
  return f;
}

export {LEAF, RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, assertDebtWithoutAck, multiLaneTopologyFixture, omitTarget,
  topologyProgressFixture};
