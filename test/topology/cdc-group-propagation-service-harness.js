import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {sourceRangeOfEvents} from '../test-helpers/cdc-source-range-fixture.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation, scopeCdcDeliveryInvocation} from
  '../../src/cdc/cdc-delivery-invocation.js';
import {refreshCdcPropagationRoutes} from '../../src/cdc/cdc-propagation-progress.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from '../../src/topology/latency-topology-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

const DURABLE_SOURCE_FORWARD_RETRY_MS = 20;
const DURABLE_SOURCE_TERM = 1;
const DURABLE_SOURCE_PARTITION = 'durable-source-p1';

export function setupConfig(propagationMode) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      recalcJitterRatio: 0.1,
      pingTimeoutMs: 50,
      pingRetryCount: 2,
      smoothingAlpha: 0.5,
      propagationMode,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

export function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

// The topology owners read the node's real system-table cache: the rows are
// applied through the cache's own change gateway, so the cache-change port the
// propagation's recipient-domain watch consumes is the production one.
export function createTopologyCache({
  nodes = [],
  groups = [],
  services = [],
  messageGroups = [],
  latencies = [],
} = {}) {
  const cache = new SystemTableCache();
  for (const row of nodes) putTopologyRow(cache, TABLES.NODES, row);
  for (const row of groups) putTopologyRow(cache, TABLES.LATENCY_GROUPS, row);
  for (const row of services) putTopologyRow(cache, TABLES.SERVICES, row);
  for (const row of messageGroups) putTopologyRow(cache, TABLES.MESSAGE_GROUPS, row);
  for (const row of latencies) putTopologyRow(cache, TABLES.INTER_GROUP_LATENCIES, row);
  return cache;
}

// One projection change: the row as a whole replaces the key's row.
export function putTopologyRow(cache, tableName, row) {
  cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, {...row});
}

// One projection removal of the key's row.
export function removeTopologyRow(cache, tableName, row) {
  cache.applySystemTableChange(tableName, CDC_OPERATION.DELETE, {...row});
}

// The one source message group double: the durable surface the durable wave
// reads (src/topology/cdc-group-propagation-durable-delivery.js and
// src/cdc/cdc-propagation-progress.js) - a stable group, consensus port and
// commit lifetime, the strict forward retry hint, and a batch apply answered
// by default with the CDC outcome owner's committed receipt. It has no
// volatile applyCDCEvent: the propagation owner never reads one.
export function createDurableSourceMessageGroupService(groupId, {
  canAcceptCDCEvent = () => true,
  applyCDCBatch = null,
} = {}) {
  const batches = [];
  return {
    batches,
    groupId,
    initialized: true,
    isShutdown: false,
    raft: Object.freeze({}),
    cdcCommitLifetime: Object.freeze({}),
    canAcceptCDCEvent,
    resolveStrictCdcForwardRetryAfterMs: () => DURABLE_SOURCE_FORWARD_RETRY_MS,
    applyCDCBatch(events, options) {
      batches.push(events);
      return applyCDCBatch ? applyCDCBatch(events, options) :
        buildCommittedCdcOutcome(events, groupId,
          {index: batches.length, term: DURABLE_SOURCE_TERM});
    },
  };
}

// One durable partition CDC event (it carries its obligation's eventKey);
// the CDC envelope owner validates it when the wave captures it.
export function createDurableCdcEvent({
  tableName = TABLES.NODES,
  operation = CDC_OPERATION.UPDATE,
  data = {[COLUMN.NODE_ID]: 'node-z'},
  eventKey = 'durable-event-1',
  sourceLogIndex = 1,
} = {}) {
  return {
    tableName, operation, data,
    timestamp: new HLCTimestamp(1000, 0, 'durable-source').toString(),
    sourcePartition: DURABLE_SOURCE_PARTITION,
    sourceReplica: `${DURABLE_SOURCE_PARTITION}-r1`,
    eventKey, entryId: eventKey, sourceLogIndex, sourceOrdinal: 0,
  };
}

// The source delivery owner's invocation for one durable vector, on a virtual
// clock (no real timer): the deliveryContext a partition subscriber passes.
export function beginDurableCdcInvocation(
  timeSource = new VirtualTimeSource({startMs: 1000})) {
  const delivery = {owner: {timeSource, isShutdown: false}};
  return beginCdcDeliveryInvocation(delivery, () => true);
}

// One durable propagation request: the vector (events of one table, in log
// order), its invocation and the source. The service delivers it to the ONE
// recipient group the invocation addresses: the source group, unless the
// invocation names a target (addressedTo).
export function createDurablePropagationRequest(source, events = [createDurableCdcEvent()],
  deliveryContext = beginDurableCdcInvocation()) {
  return {events, sourceMessageGroupService: source, deliveryContext};
}

// The invocation of a delivery addressed to one recipient group (null: the
// source group); `onRecipients` receives the recipient set the service
// observed and reported (bindTopology), as the source lane does, and the
// service is answered the recipient's route as the lane's route owner
// observes it for a fresh recipient set (refreshCdcPropagationRoutes).
export function addressedTo(parent, recipientGroupId, onRecipients = () => {},
  sourceRange = undefined) {
  return scopeCdcDeliveryInvocation(parent, () => true, () => ({recipientGroupId, sourceRange,
    bindTopology: (_owner, _source, targets) => {
      onRecipients(targets);
      const observed = {targets: [], plannedGroupIds: new Set()};
      refreshCdcPropagationRoutes(observed, targets);
      return observed.targets.find((leaf) => leaf.groupId === recipientGroupId)?.route ?? null;
    }}));
}

// The harness in the source lane's place: it delivers the vector to the
// source group and then, one at a time, to every target group the service
// reported. Its answer is the source group's when every recipient committed;
// otherwise the first unconfirmed recipient's, with the unconfirmed target
// groups named (failedTargetGroupIds). `results` holds each recipient's own
// answer. This is the lane's contract restated for the topology witnesses: a
// vector is complete only when every recipient holds a committed receipt.
export async function propagateToEveryRecipient(service, source, events,
  deliveryContext = beginDurableCdcInvocation()) {
  let targets = [];
  const deliver = (recipientGroupId) => service.propagateCDCEvent({events,
    sourceMessageGroupService: source,
    deliveryContext: addressedTo(deliveryContext, recipientGroupId, (observed) => {
      targets = observed;
    }, sourceRangeOfEvents(events))});
  const sourceResult = await deliver(null);
  const results = new Map([[source.groupId, sourceResult]]);
  for (const target of targets) results.set(target.groupId, await deliver(target.groupId));
  const unconfirmed = [...results].filter(([, result]) => result?.success !== true);
  if (unconfirmed.length === 0) return {...sourceResult, results};
  return {...unconfirmed[0][1], results, failedTargetGroupIds: unconfirmed
    .map(([groupId]) => groupId).filter((groupId) => groupId !== source.groupId)};
}

// The vector a target delivery payload carries: the durable wave has one
// wire form, the batch message naming its events, whatever the vector's length.
export function deliveredEventsOf(payload) {
  if (payload.type !== LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH) {
    throw new Error(`not the durable wave's wire form: ${payload.type}`);
  }
  return payload.events;
}

// As propagateToEveryRecipient, but every recipient's delivery is in flight
// at once, as under the source lane's per-recipient drives. The answer is
// the first recipient's that is not a success, else the source group's.
export async function propagateToEveryRecipientAtOnce(service, source, events,
  deliveryContext = beginDurableCdcInvocation()) {
  let targets = [];
  const deliver = (recipientGroupId) => service.propagateCDCEvent({events,
    sourceMessageGroupService: source,
    deliveryContext: addressedTo(deliveryContext, recipientGroupId, (observed) => {
      targets = observed;
    }, sourceRangeOfEvents(events))});
  // The service reports the recipient set before its first await.
  const sourceDelivery = deliver(null);
  const settled = await Promise.allSettled(
    [sourceDelivery, ...targets.map((target) => deliver(target.groupId))]);
  const failure = settled.find((entry) => entry.status === 'rejected');
  if (failure) throw failure.reason;
  return settled.map((entry) => entry.value).find((result) => result?.success !== true) ??
    settled[0].value;
}

// A target's answer through the owners: the transport delivered it and the
// target group answered the CDC outcome owner's committed receipt.
export function committedTargetAnswer(payload, receipt = {index: 1, term: DURABLE_SOURCE_TERM}) {
  return buildDeliveryEnvelope({acknowledged: true},
    buildCommittedCdcOutcome(deliveredEventsOf(payload), payload.targetGroupId, receipt));
}

export function createMessageRouter(results = []) {
  const calls = [];
  return {
    calls,
    async deliver(address, payload, options) {
      calls.push({address, payload, options});
      const index = calls.length - 1;
      return results[Math.min(index, results.length - 1)];
    },
  };
}

export function createGroupRow(groupId, coordinatorNodeId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.COORDINATOR_NODE_ID]: coordinatorNodeId,
    [COLUMN.STATE]: 'active',
  };
}

export function createMessageGroupServiceRow(
  serviceId,
  nodeId,
  address,
  raftRole,
  groupId = null,
) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: address,
    [COLUMN.RAFT_ROLE]: raftRole,
  };
}
