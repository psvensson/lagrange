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
import {buildCommittedCdcOutcome, buildProvisionalCdcOutcome, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {createDurableSourceMessageGroupService, createMessageGroupServiceRow} from
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

function controlledAnswer(events, groupId, mode, transport = false) {
  const answer = mode === RESPONSE.NATIVE ?
    buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2}) :
    mode === RESPONSE.WEAK ? buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId) :
      unknownCdcAcceptance();
  return transport ? {...answer, acknowledged: true} : answer;
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
    f.targetCalls.push({address, groupId: payload.targetGroupId,
      nodeId: options.targetNodeId, eventKey: payload.eventKey});
    if (f.duringTarget) f.duringTarget();
    return controlledAnswer([payload], payload.targetGroupId, f.targetMode, true);
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
    propagatePartitionCDCEvent: (_selected, event, context) => {
      f.subscriberCalls.push(index);
      if (index === 0) {
        return f.topology.propagateCDCEvent({...event,
          sourceMessageGroupService: f.source, deliveryContext: context});
      }
      if (f.expireOther) f.clock.advance(context.remainingMs());
      if (f.duringOther) f.duringOther();
      return controlledAnswer([event], source.groupId, f.otherMode);
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

export {RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, assertDebtWithoutAck, omitTarget, topologyProgressFixture};
