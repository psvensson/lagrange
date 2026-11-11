import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
// Component fixture: real source apply/ledger/subscription and topology owners,
// with controlled route projections and recipient answers. These answers are
// deliberately not evidence of a native recipient commit or a system-row write.
import assert from 'node:assert/strict';
import {COLUMN, SERVICE_STATUS, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {isIssuedBootIncarnation} from '../../src/bootstrap/boot-incarnation-contract.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDC_COMPLETION, buildCommittedCdcOutcome, buildProvisionalCdcOutcome,
  cdcCommitWaitIdentity, unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {PARTITION_CDC_COMMAND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {createDurableSourceMessageGroupService, createMessageGroupServiceRow,
  deliveredEventsOf} from '../topology/cdc-group-propagation-service-harness.js';
import {CDC_TABLE as TABLE, applyCommitted, committedQueryOf, settleTicks, shutdownAll,
  startLeader} from
  './participant-transaction-fixture.js';
import {delayedClock, driveAfterBackoff} from './cdc-delivery-progress-fixture.js';

const SOURCE_GROUP = 'progress-group-a';
const TARGET_GROUP = 'progress-group-b';
const SOURCE_NODE = 'node-a';
const TARGET_NODE = 'node-b';
const RETRY_AFTER_MS = 20;
const RESPONSE = Object.freeze({NATIVE: 'native', WEAK: 'weak', UNKNOWN: 'unknown',
  BACKPRESSURE: 'backpressure', DUPLICATE_IN_FLIGHT: 'duplicate_in_flight'});
// The hint a recipient answering RESPONSE.BACKPRESSURE gives.
const BACKPRESSURE_RETRY_AFTER_MS = 40;

function controlledAnswer(events, groupId, mode) {
  if (mode === RESPONSE.BACKPRESSURE || mode === RESPONSE.DUPLICATE_IN_FLIGHT) {
    return {...unknownCdcAcceptance(mode === RESPONSE.BACKPRESSURE ?
      CDC_COMPLETION.BACKPRESSURE : CDC_COMPLETION.DUPLICATE_IN_FLIGHT),
    retryAfterMs: BACKPRESSURE_RETRY_AFTER_MS};
  }
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
      f.sourceDigests.push(cdcCommitWaitIdentity(events));
      return controlledAnswer(events, SOURCE_GROUP, f.sourceMode);
    }});
  const router = {deliver: async (address, payload, options) => {
    assert.equal(f.leader.db.inTransaction, false);
    const events = deliveredEventsOf(payload);
    f.targetCalls.push({address, groupId: payload.targetGroupId,
      nodeId: options.targetNodeId, eventKey: events[0].eventKey,
      eventKeys: events.map((event) => event.eventKey), type: payload.type,
      digest: cdcCommitWaitIdentity(events)});
    if (f.duringTarget) f.duringTarget();
    // A held target does not answer until the witness releases it.
    if (f.targetHold) await f.targetHold.promise;
    return buildDeliveryEnvelope({acknowledged: true},
      controlledAnswer(events, payload.targetGroupId, f.targetMode));
  }};
  const topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE,
    systemTableCache: f.projection.cache, messageRouter: router,
    latencyTreeService: {getRoutingOrder: () => f.projection.groups.map((row) => row.group_id)},
    nowFn: () => f.clock.now(), deliveryRetryMaxAttempts: 1});
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

// The production composition is one propagation subscriber per partition
// (role SUBSCRIBER_ROLE_PROPAGATION); its recipients are the source group and
// the target groups of its propagation. `otherSubscriber` adds the second,
// role-less subscriber some older witnesses use.
async function topologyProgressFixture(t, {otherSubscriber = true} = {}) {
  const clock = delayedClock();
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  const f = {clock, leader, proposed, ready: false, projection: controlledProjection(),
    sourceCalls: [], sourceDigests: [], targetCalls: [], subscriberCalls: [], hooks: [],
    sourceMode: RESPONSE.NATIVE, targetMode: RESPONSE.WEAK, otherMode: RESPONSE.NATIVE,
    expireOther: false, duringTarget: null, duringOther: null, targetHold: null};
  t.after(async () => {
    f.topology?.stop();
    await shutdownAll(leader);
  });
  Object.assign(f, buildTopology(f));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  await leader.subscribeToCDCWithHandshake(buildSubscriber(f, 0),
    {subscriberId: 'topology-progress-0', role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION});
  if (otherSubscriber) {
    await leader.subscribeToCDCWithHandshake(buildSubscriber(f, 1),
      {subscriberId: 'topology-progress-1'});
  }
  addTopologySourceRow(f, 'A');
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.equal(f.subscriberCalls.length, 0);
  assert.deepEqual(countCdcObligations(leader.db), {owed: 1, delivered: 0});
  f.ready = true;
  f.drive = () => driveAfterBackoff(leader, clock);
  return f;
}

// One committed source row (the fixture begins with the row A).
function addTopologySourceRow(f, id) {
  const command = committedQueryOf(`topology-progress-source-row${id === 'A' ? '' : `-${id}`}`,
    `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  command.params = [id, 'retained-source-body'];
  command.timestamp = new HLCTimestamp(1000, 0, 'topology-progress-component').toString();
  assert.equal(applyCommitted(f.leader, command), null);
}

function assertDebtWithoutAck(f, owed = 1) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed, delivered: 0});
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

export {BACKPRESSURE_RETRY_AFTER_MS, RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, addTopologySourceRow, assertDebtWithoutAck, omitTarget,
  topologyProgressFixture};
