/**
 * Tests for CDCPipelineReadinessGate integration in BootstrapService.
 *
 * Verifies that phaseCacheHydration calls the readiness gate after
 * subscribeToInitialSystemTableCDC() and before transitioning to READY,
 * and that a timeout produces a descriptive bootstrap failure.
 *
 * Requirements: 2.4, 2.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';

const NODE_ID = 'readiness-gate-test-node';
const NODE_ADDRESS = 'ws://127.0.0.1:19091';

/**
 * Build a hydration result that passes verifyCacheHydration.
 */
const createCompleteHydrationResult = () => {
  const tables = {};
  for (const tableName of CACHE_HYDRATION_TABLES) {
    tables[tableName] = {success: true, rowCount: 1};
  }
  return {success: true, tables, errors: []};
};

/**
 * Build a minimal system table cache stub that satisfies the
 * leader-readiness gate and cache-hydration verification.
 */
const createFullyHydratedCache = () => {
  const listeners = [];
  return {
    getAll: (tableName) => {
      if (tableName === SystemTableName.SERVICES) {
        return [{
          service_id: 'p1', service_type: 'partition',
          status: 'ACTIVE', raft_role: 'leader',
          node_id: NODE_ID, address: `${NODE_ID}/partition/p1`,
        }];
      }
      if (tableName === SystemTableName.NODES) {
        return [{node_id: NODE_ID}];
      }
      return [{id: '1'}];
    },
    onCacheChange: (fn) => listeners.push(fn),
    offCacheChange: () => {},
    _fireChange: () => {
      for (const fn of listeners) fn();
    },
  };
};

/**
 * Stub partition service with all methods phaseCacheHydration calls
 * after the readiness gate.
 */
const createStubPartition = (tableName) => ({
  tableName,
  cdcSubscribers: new Map([['sub-1', () => {}]]),
  setSystemTableCache: () => {},
  setCdcIntegrationService: () => {},
  setTablePolicyService: () => {},
  setSqlQueryEngine: () => {},
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
 * Apply common stubs to a BootstrapService instance for
 * phaseCacheHydration testing.
 */
const applyCommonStubs = (service, systemTableCache, hydrationResult) => {
  service.getSystemTableCache = () => systemTableCache;
  service.getLeaderMessageGroupService = () => ({
    applyCDCEvent: async () => {},
  });
  service.hydrateFromLocalPartitions = async () => hydrationResult;
  service.ensureLatencyTopologyOwners = () => {};
  service.waitForSystemServiceLeadersInCache = async () => {};
  service.swapSystemTableWriter = () => {};
  service.cdcIntegrationService = {
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
};

test('phaseCacheHydration succeeds when CDC pipeline is ready',
  async (t) => {
    const service = new BootstrapService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      config: {
        leadershipWaitTimeoutMs: 5,
        leadershipWaitInitialDelayMs: 1,
        leadershipWaitMaxDelayMs: 1,
        leadershipWaitBackoffMultiplier: 1,
        cdcPipelineReadinessTimeoutMs: 2000,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    const hydrationResult = createCompleteHydrationResult();
    applyCommonStubs(service, systemTableCache, hydrationResult);

    service.partitionServices = createPartitionServicesWithSubscribers();
    service.messageGroupServices = createMessageGroupServicesWithLeader();

    service.subscribeToInitialSystemTableCDC = async () => {
      // Fire cache change asynchronously so the readiness gate's
      // one-shot listener (registered after this call) can observe it.
      setTimeout(() => systemTableCache._fireChange(), 5);
    };

    await service.phaseCacheHydration();
    t.pass('phaseCacheHydration completed with ready CDC pipeline');
  });

test('phaseCacheHydration fails on CDC readiness gate timeout',
  async (t) => {
    const service = new BootstrapService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      config: {
        leadershipWaitTimeoutMs: 5,
        leadershipWaitInitialDelayMs: 1,
        leadershipWaitMaxDelayMs: 1,
        leadershipWaitBackoffMultiplier: 1,
        cdcPipelineReadinessTimeoutMs: 50,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    const hydrationResult = createCompleteHydrationResult();
    applyCommonStubs(service, systemTableCache, hydrationResult);

    // Empty services — no subscribers, no leader → gate never passes.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.subscribeToInitialSystemTableCDC = async () => {};

    await t.rejects(
      service.phaseCacheHydration(),
      /readiness.*timed out|unmet/i,
      'phaseCacheHydration should fail with descriptive error on timeout',
    );
  });

test('phaseCacheHydration timeout error lists unmet conditions',
  async (t) => {
    const service = new BootstrapService({
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      config: {
        leadershipWaitTimeoutMs: 5,
        leadershipWaitInitialDelayMs: 1,
        leadershipWaitMaxDelayMs: 1,
        leadershipWaitBackoffMultiplier: 1,
        cdcPipelineReadinessTimeoutMs: 50,
      },
    });

    const systemTableCache = createFullyHydratedCache();
    const hydrationResult = createCompleteHydrationResult();
    applyCommonStubs(service, systemTableCache, hydrationResult);

    // No partition services or message groups → all conditions unmet.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.subscribeToInitialSystemTableCDC = async () => {};

    try {
      await service.phaseCacheHydration();
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
      t.ok(
        err.unmetConditions.includes('propagationLeader'),
        'unmetConditions should include propagationLeader',
      );
    }
  });
