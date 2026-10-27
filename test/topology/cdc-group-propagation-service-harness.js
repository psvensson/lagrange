import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {beginCdcDeliveryInvocation} from '../../src/cdc/cdc-delivery-invocation.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
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

export function createTopologyCache({
  nodes = [],
  groups = [],
  services = [],
} = {}) {
  const nodeRows = new Map(
    nodes.map((row) => [row[COLUMN.NODE_ID], {...row}]),
  );
  const groupRows = groups.map((row) => ({...row}));
  const serviceRows = services.map((row) => ({...row}));

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.LATENCY_GROUPS) {
        return groupRows.map((row) => ({...row}));
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return serviceRows.filter((row) => predicate(row));
    },
  };
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

// The source delivery owner's invocation for one durable event, on a virtual
// clock (no real timer): the deliveryContext a partition subscriber passes.
function beginDurableCdcInvocation(timeSource = new VirtualTimeSource({startMs: 1000})) {
  const delivery = {owner: {timeSource, isShutdown: false}};
  return beginCdcDeliveryInvocation(delivery, () => true);
}

// One durable propagation request: the event, its invocation and the source.
export function createDurablePropagationRequest(source, event = createDurableCdcEvent(),
  deliveryContext = beginDurableCdcInvocation()) {
  return {...event, sourceMessageGroupService: source, deliveryContext};
}

// A target's answer through the owners: the transport delivered it and the
// target group answered the CDC outcome owner's committed receipt.
export function committedTargetAnswer(payload, receipt = {index: 1, term: DURABLE_SOURCE_TERM}) {
  return buildDeliveryEnvelope({acknowledged: true},
    buildCommittedCdcOutcome([payload], payload.targetGroupId, receipt));
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
