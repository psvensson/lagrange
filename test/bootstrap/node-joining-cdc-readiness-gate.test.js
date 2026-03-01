/**
 * Tests for CDCPipelineReadinessGate integration in NodeJoiningService.
 *
 * Verifies that phaseQuerySystemState calls the readiness gate after
 * subscribeToCDCEvents() and before transitioning to READY,
 * and that a timeout produces a descriptive join failure.
 *
 * Requirements: 2.4, 2.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';

const NODE_ID = 'readiness-gate-join-test-node';
const NODE_ADDRESS = 'ws://127.0.0.1:19092';

const createManualClock = (startMs = 0) => {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    sleep: async (delayMs = 0) => {
      nowMs += delayMs;
    },
  };
};

/**
 * Build a minimal system table cache stub that satisfies the
 * leader-readiness gate and cache-hydration verification.
 */
const createFullyHydratedCache = () => {
  const listeners = [];
  const rowsByTable = new Map([
    [SystemTableName.SERVICES, [{
      service_id: 'p1', service_type: 'partition',
      status: 'ACTIVE', raft_role: 'leader',
      node_id: NODE_ID, address: `${NODE_ID}/partition/p1`,
    }]],
    [SystemTableName.NODES, [{node_id: NODE_ID}]],
  ]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const getPrimaryKey = (row) =>
    row?.service_id ??
    row?.node_id ??
    row?.endpoint_id ??
    row?.partition_id ??
    row?.table_name ??
    row?.group_id ??
    row?.operation_id ??
    row?.id;
  const getRows = (tableName) => rowsByTable.has(tableName) ?
    rowsByTable.get(tableName) :
    [{id: '1'}];
  return {
    getAll: (tableName) => {
      return getRows(tableName).map(clone);
    },
    get: (tableName, key) =>
      getRows(tableName).find((row) => getPrimaryKey(row) === key),
    has: (tableName, key) =>
      getRows(tableName).some((row) => getPrimaryKey(row) === key),
    applySystemTableChange: (tableName, _operation, row) => {
      const key = getPrimaryKey(row);
      const rows = rowsByTable.has(tableName) ?
        rowsByTable.get(tableName) :
        [];
      if (key === undefined || key === null) {
        rowsByTable.set(tableName, [...rows, clone(row)]);
      } else {
        rowsByTable.set(
          tableName,
          [
            ...rows.filter((existingRow) => getPrimaryKey(existingRow) !== key),
            clone(row),
          ],
        );
      }
      for (const fn of listeners) {
        fn(tableName, _operation, clone(row));
      }
    },
    onCacheChange: (fn) => listeners.push(fn),
    offCacheChange: (fn) => {
      const index = listeners.indexOf(fn);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    _fireChange: () => {
      for (const fn of listeners) fn();
    },
  };
};

/**
 * Stub partition service with methods phaseQuerySystemState calls.
 */
const createStubPartition = (tableName) => ({
  tableName,
  cdcSubscribers: new Map([['sub-1', () => {}]]),
  setSystemTableCache: () => {},
  setTablePolicyService: () => {},
});

/**
 * Build partition services map where every CDC-propagated table
 * has at least one partition with a CDC subscriber registered.
 */
const createPartitionServicesWithSubscribers = () => {
  const map = new Map();
  for (const tableName of CACHE_HYDRATION_TABLES) {
    map.set(`replica-${tableName}`, createStubPartition(tableName));
  }
  return map;
};

/**
 * Build message group services map with a leader replica.
 */
const createMessageGroupServicesWithLeader = () => {
  const map = new Map();
  map.set('mg-1-r1', {
    isLeaderReplica: () => true,
    applyCDCEvent: async () => {},
  });
  return map;
};

/**
 * Prepare NodeService singleton so phaseQuerySystemState can call
 * NodeService.getInstance().getSystemTableCache().
 */
const prepareNodeService = (systemTableCache) => {
  NodeService.resetInstance();
  const instance = NodeService.getInstance();
  if (!instance.isInitialized()) {
    instance.initialize({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      lifecycleStateMachine: {
        getState: () => 'JOINING',
        transition: () => {},
        on: () => {},
      },
      autoTransitionLifecycle: false,
    });
  }
  instance.getSystemTableCache = () => systemTableCache;
  return instance;
};

/**
 * Apply common stubs to a NodeJoiningService instance for
 * phaseQuerySystemState testing.
 */
const applyCommonStubs = (service, systemTableCache) => {
  service.systemCacheHydrated = true;
  service.messageRouter = {deliver: async () => {}};
  service.cdcIntegrationService = {
    sqlQueryEngine: {
      setSystemCache: () => {},
      setMessageRouter: () => {},
      executeQuery: async (sql) => {
        const match = /^SELECT \* FROM ([A-Za-z0-9_]+)$/.exec(sql.trim());
        return {
          success: true,
          rows: match ? systemTableCache.getAll(match[1]) : [],
        };
      },
    },
    setSystemTableCache: () => {},
    setEpochManager: () => {},
    setSqlQueryEngine: () => {},
    messageRouter: {},
  };
  service.tablePolicyService = {
    systemTableCache: null,
    cdcIntegrationService: null,
    initialize: () => {},
  };
  service.ensureLatencyTopologyOwners = () => {};
  service.waitForSystemServiceLeaders = async () => {};
  service.registerNodeInCluster = async () => {};
  service.registerCreateSelfHostedMetadata = async () => {};
  service.triggerJoinReconciler = async () => {};
  service.stopJoiningLifecycleOwners = () => {};
  prepareNodeService(systemTableCache);
};

test('phaseQuerySystemState succeeds when CDC pipeline is ready',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToCDCEvents = async () => {
      service.cdcSubscriptionsActive = true;
    };

    await service.phaseQuerySystemState();
    t.pass('phaseQuerySystemState completed with ready CDC pipeline');
  });

test('phaseQuerySystemState fails on CDC readiness gate timeout',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 50,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    const clock = createManualClock();

    // Empty services — no subscribers, no leader → gate never passes.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.subscribeToCDCEvents = async () => {};
    service.createCdcPipelineReadinessGate = (cache) =>
      new CDCPipelineReadinessGate({
        systemTableCache: cache,
        cdcPropagatedTables: CACHE_HYDRATION_TABLES,
        now: clock.now,
        sleep: clock.sleep,
      });

    await t.rejects(
      service.phaseQuerySystemState(),
      /readiness.*timed out|unmet/i,
      'phaseQuerySystemState should fail with descriptive error',
    );
  });

test('phaseQuerySystemState timeout error lists unmet conditions',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 50,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    const clock = createManualClock();

    // No partition services or message groups → all conditions unmet.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.subscribeToCDCEvents = async () => {};
    service.createCdcPipelineReadinessGate = (cache) =>
      new CDCPipelineReadinessGate({
        systemTableCache: cache,
        cdcPropagatedTables: CACHE_HYDRATION_TABLES,
        now: clock.now,
        sleep: clock.sleep,
      });

    try {
      await service.phaseQuerySystemState();
      t.fail('should have thrown');
    } catch (err) {
      t.ok(
        Array.isArray(err.unmetConditions),
        'error should have unmetConditions array',
      );
      t.ok(
        err.unmetConditions.length > 0,
        'unmetConditions should list at least one condition',
      );
      t.ok(
        err.unmetConditions.includes('subscriptionsActive'),
        'unmetConditions should include subscriptionsActive',
      );
      t.notOk(
        err.unmetConditions.includes('propagationLeader'),
        'join-time readiness should not block on propagationLeader',
      );
    }
  });
