import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';

const DURABLE_SOURCE_FORWARD_RETRY_MS = 20;
const DURABLE_SOURCE_TERM = 1;

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

export function createSourceMessageGroupService() {
  const calls = [];
  return {
    calls,
    async applyCDCEvent(tableName, operation, data) {
      calls.push({tableName, operation, data});
    },
  };
}

// The same source double with the durable surface the durable wave reads
// (src/topology/cdc-group-propagation-durable-delivery.js): a stable group,
// port and commit lifetime, the strict forward retry hint, and a batch apply
// answered with the CDC outcome owner's committed receipt. A durable event
// never takes the volatile applyCDCEvent path.
export function createDurableSourceMessageGroupService(groupId) {
  const source = createSourceMessageGroupService();
  const batches = [];
  return Object.assign(source, {
    batches,
    groupId,
    initialized: true,
    isShutdown: false,
    raft: Object.freeze({}),
    cdcCommitLifetime: Object.freeze({}),
    canAcceptCDCEvent: () => true,
    resolveStrictCdcForwardRetryAfterMs: () => DURABLE_SOURCE_FORWARD_RETRY_MS,
    async applyCDCEvent() {
      throw new Error('a durable CDC event must not take the volatile apply');
    },
    applyCDCBatch(events) {
      batches.push(events);
      return buildCommittedCdcOutcome(events, groupId,
        {index: batches.length, term: DURABLE_SOURCE_TERM});
    },
  });
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

export async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
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
