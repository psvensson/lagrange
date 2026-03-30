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
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {JOIN_BACKFILL_SCOPE} from
  '../../src/bootstrap/node-joining-constants.js';
import {STARTUP_JOIN_MODE} from
  '../../src/bootstrap/rejoin-hints-constants.js';

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
    [SYSTEM_TABLE_NAME.SERVICES, [{
      service_id: 'p1', service_type: 'partition',
      status: 'ACTIVE', raft_role: 'leader',
      node_id: NODE_ID, address: `${NODE_ID}/partition/p1`,
    }]],
    [SYSTEM_TABLE_NAME.NODES, [{node_id: NODE_ID}]],
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

const createBootstrapResponseFromCache = (systemTableCache, options = {}) => {
  const systemTableSnapshots = {};
  for (const tableName of CACHE_HYDRATION_TABLES) {
    systemTableSnapshots[tableName] = systemTableCache.getAll(tableName);
  }

  if (Array.isArray(options.removeTables)) {
    for (const tableName of options.removeTables) {
      delete systemTableSnapshots[tableName];
    }
  }

  const hydrationTables = Array.isArray(options.hydrationTables) ?
    options.hydrationTables :
    CACHE_HYDRATION_TABLES.filter((tableName) => {
      return Object.prototype.hasOwnProperty.call(
        systemTableSnapshots,
        tableName,
      );
    });

  return {
    systemTableSnapshots,
    topologySnapshotMeta: {
      hydrationTables,
      tableRowCounts: Object.fromEntries(
        hydrationTables.map((tableName) => {
          return [tableName, systemTableSnapshots[tableName]?.length || 0];
        }),
      ),
    },
  };
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

test('phaseQuerySystemState restores durable local partition services ' +
  'before node admission writes', async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      config: {
        leadershipWaitTimeoutMs: 10,
      },
    });
    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    service.bootstrapResponse = createBootstrapResponseFromCache(
      systemTableCache,
    );

    const callOrder = [];
    service.restoreDurableRejoinLocalPartitionServices = async (cache) => {
      t.equal(cache, systemTableCache,
        'durable restore should receive the hydrated system cache');
      callOrder.push('restore');
    };
    service.subscribeToCDCEvents = async () => {};
    service.createCdcPipelineReadinessGate = () => ({
      waitForReady: async () => {},
    });
    service.registerNodeInCluster = async () => {
      callOrder.push('register');
    };

    await service.phaseQuerySystemState();

    t.same(
      callOrder,
      ['restore', 'register'],
      'durable rejoin should re-activate local partition handlers before routed node admission writes',
    );
  });

test('phaseQuerySystemState skips blocking backfill when bootstrap snapshot covers discovery-critical tables',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });
    const infoLogs = [];
    service.logger = {
      info: (message, context) => infoLogs.push({message, context}),
      debug() {},
      warn() {},
      error() {},
    };

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    service.systemCacheHydrated = false;
    service.bootstrapResponse =
      createBootstrapResponseFromCache(systemTableCache);

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToCDCEvents = async () => {
      service.cdcSubscriptionsActive = true;
    };

    const backfillCalls = [];
    service.backfillPropagatedCacheTablesFromAuthoritativeState =
      async (tableNames) => {
        backfillCalls.push(tableNames);
      };

    await service.phaseQuerySystemState();
    t.same(
      backfillCalls,
      [],
      'phaseQuerySystemState should trust the complete bootstrap snapshot instead of rereading discovery-critical tables',
    );
    const opportunisticPromise = service.startJoinOpportunisticBackfill();
    await opportunisticPromise;

    t.same(
      backfillCalls,
      [],
      'snapshot-complete joins should trust bootstrap hydration plus CDC instead of rereading propagated tables again',
    );
    const infoMessages = infoLogs.map(({message}) => message);
    t.ok(
      infoMessages.some((message) =>
        /Skipping blocking join backfill/.test(message)),
      'logs should record the blocking backfill skip when the bootstrap snapshot is complete',
    );
    t.ok(
      infoMessages.some((message) =>
        /Skipping opportunistic join backfill/.test(message)),
      'logs should record the opportunistic backfill skip when the bootstrap snapshot is complete',
    );
  });

test('phaseQuerySystemState backfills only missing discovery-critical tables when bootstrap snapshot is incomplete',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });
    const infoLogs = [];
    service.logger = {
      info: (message, context) => infoLogs.push({message, context}),
      debug() {},
      warn() {},
      error() {},
    };

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    service.systemCacheHydrated = false;
    service.bootstrapResponse = createBootstrapResponseFromCache(
      systemTableCache,
      {removeTables: [SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]},
    );

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToCDCEvents = async () => {
      service.cdcSubscriptionsActive = true;
    };

    const backfillCalls = [];
    service.backfillPropagatedCacheTablesFromAuthoritativeState =
      async (tableNames) => {
        backfillCalls.push(tableNames);
      };

    await service.phaseQuerySystemState();

    t.same(
      backfillCalls,
      [[SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS]],
      'phaseQuerySystemState should reread only the discovery-critical tables missing from the bootstrap snapshot',
    );
    t.ok(
      infoLogs.some(({message, context}) => {
        return /Starting blocking join backfill/.test(message) &&
          Array.isArray(context?.tableNames) &&
          context.tableNames.length === 1 &&
          context.tableNames[0] === SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS;
      }),
      'blocking backfill diagnostics should identify the missing snapshot table',
    );
  });

test('phaseQuerySystemState fails on blocking discovery backfill failure',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });
    const errorLogs = [];
    service.logger = {
      info() {},
      debug() {},
      warn() {},
      error: (message, context) => errorLogs.push({message, context}),
    };

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToCDCEvents = async () => {
      service.cdcSubscriptionsActive = true;
    };

    service.backfillPropagatedCacheTablesFromAuthoritativeState =
      async (tableNames) => {
        if (Array.isArray(tableNames) &&
            tableNames.length === JOIN_BACKFILL_SCOPE.BLOCKING_TABLES.length &&
            tableNames.every((tableName, index) =>
              tableName === JOIN_BACKFILL_SCOPE.BLOCKING_TABLES[index])) {
          throw new Error('synthetic blocking backfill failure');
        }
      };

    await t.rejects(
      service.phaseQuerySystemState(),
      /synthetic blocking backfill failure/,
      'phaseQuerySystemState should fail when blocking discovery repair fails',
    );
    t.match(
      errorLogs.map(({message}) => message),
      [
        /Blocking join backfill failed/,
        /Failed to hydrate system table cache/,
      ],
      'blocking repair failure should be classified distinctly in diagnostics',
    );
  });

test('phaseQuerySystemState tolerates opportunistic backfill failures after join readiness',
  async (t) => {
    const service = new NodeJoiningService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      seedNodeAddress: 'ws://127.0.0.1:19090',
      config: {
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });
    const warnLogs = [];
    service.logger = {
      info() {},
      debug() {},
      warn: (message, context) => warnLogs.push({message, context}),
      error() {},
    };

    const systemTableCache = createFullyHydratedCache();
    applyCommonStubs(service, systemTableCache);
    const missingOpportunisticTable =
      JOIN_BACKFILL_SCOPE.OPPORTUNISTIC_TABLES[0];
    service.bootstrapResponse = createBootstrapResponseFromCache(
      systemTableCache,
      {removeTables: [missingOpportunisticTable]},
    );

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToCDCEvents = async () => {
      service.cdcSubscriptionsActive = true;
    };

    const backfillCalls = [];
    service.backfillPropagatedCacheTablesFromAuthoritativeState =
      async (tableNames) => {
        backfillCalls.push(tableNames);
        if (Array.isArray(tableNames) &&
            tableNames.length === 1 &&
            tableNames[0] === missingOpportunisticTable) {
          throw new Error('synthetic opportunistic backfill failure');
        }
      };

    await service.phaseQuerySystemState();
    const opportunisticPromise = service.startJoinOpportunisticBackfill();
    await opportunisticPromise;

    t.same(
      backfillCalls,
      [[missingOpportunisticTable]],
      'join should skip blocking rereads when discovery-critical tables are covered and only reread opportunistic snapshot gaps',
    );
    t.match(
      warnLogs.map(({message}) => message),
      [/Opportunistic join backfill failed/],
      'background repair failure should be downgraded into opportunistic diagnostics',
    );
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
