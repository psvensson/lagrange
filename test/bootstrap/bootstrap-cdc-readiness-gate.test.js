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
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';

const NODE_ID = 'readiness-gate-test-node';
const NODE_ADDRESS = 'ws://127.0.0.1:19091';

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
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return [{
          service_id: 'p1', service_type: 'partition',
          status: 'ACTIVE', raft_role: 'leader',
          node_id: NODE_ID, address: `${NODE_ID}/partition/p1`,
        }];
      }
      if (tableName === SYSTEM_TABLE_NAME.NODES) {
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
  service.seedMessageGroupsPhase.getLeaderMessageGroupService = () => ({
    applyCDCEvent: async () => {},
  });
  service.seedCacheHydrationPhase.hydrateFromLocalPartitions =
    async () => hydrationResult;
  service.seedCacheHydrationPhase.ensureLatencyTopologyOwners = () => {};
  service.seedCacheHydrationPhase.waitForSystemServiceLeadersInCache =
    async () => {};
  service.seedRegistrationPhase.swapSystemTableWriter = () => {};
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

    service.seedCacheHydrationPhase
      .subscribeToInitialSystemTableCDC = async () => {};

    await service.seedCacheHydrationPhase.phaseCacheHydration();
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
    const clock = createManualClock();

    // Empty services — no subscribers, no leader → gate never passes.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.seedCacheHydrationPhase
      .subscribeToInitialSystemTableCDC = async () => {};
    service.seedCacheHydrationPhase
      .createCdcPipelineReadinessGate = (cache) =>
        new CDCPipelineReadinessGate({
          systemTableCache: cache,
          cdcPropagatedTables: CACHE_HYDRATION_TABLES,
          now: clock.now,
          sleep: clock.sleep,
        });

    await t.rejects(
      service.seedCacheHydrationPhase.phaseCacheHydration(),
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
    const clock = createManualClock();

    // No partition services or message groups → all conditions unmet.
    service.partitionServices = new Map();
    service.messageGroupServices = new Map();
    service.seedCacheHydrationPhase
      .subscribeToInitialSystemTableCDC = async () => {};
    service.seedCacheHydrationPhase
      .createCdcPipelineReadinessGate = (cache) =>
        new CDCPipelineReadinessGate({
          systemTableCache: cache,
          cdcPropagatedTables: CACHE_HYDRATION_TABLES,
          now: clock.now,
          sleep: clock.sleep,
        });

    try {
      await service.seedCacheHydrationPhase.phaseCacheHydration();
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
