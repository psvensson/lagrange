/**
 * Failing tests for strict cache hydration behavior.
 *
 * Requirements: 6.2, 6.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {LatencyTopologySetup} from '../../src/bootstrap/shared/latency-topology-setup.js';

const NODE_ID = 'strict-hydration-test-node';
const NODE_ADDRESS = 'ws://127.0.0.1:19090';

const createHydrationResultWithMissingRequiredTable = () => ({
  success: true,
  tables: {
    [SYSTEM_TABLE_NAME.NODES]: {success: true, rowCount: 1},
    [SYSTEM_TABLE_NAME.PARTITIONS]: {success: true, rowCount: 1},
    [SYSTEM_TABLE_NAME.TABLES]: {success: true, rowCount: 1},
    [SYSTEM_TABLE_NAME.MESSAGE_GROUPS]: {success: true, rowCount: 1},
    // SERVICES intentionally missing to reproduce incomplete hydration.
  },
  errors: [],
});

const createMinimalHydratedCache = () => {
  const cache = new SystemTableCache();
  for (const [table, row] of [
    [SYSTEM_TABLE_NAME.NODES, {node_id: 'seed-node'}],
    [SYSTEM_TABLE_NAME.PARTITIONS, {partition_id: 'p1'}],
    [SYSTEM_TABLE_NAME.TABLES, {table_id: 'nodes'}],
    [SYSTEM_TABLE_NAME.MESSAGE_GROUPS, {group_id: 'mg-1'}],
  ]) {
    cache.applySystemTableChange(table, 'INSERT', row);
  }
  return cache;
};

test('BootstrapService.verifyCacheHydration fails hard on missing required tables', async (t) => {
  const service = new BootstrapService({
    bootIncarnation: 1,
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
  });
  const hydrationResult = createHydrationResultWithMissingRequiredTable();
  const systemTableCache = createMinimalHydratedCache();

  await t.rejects(
    Promise.resolve().then(() => service.verifyCacheHydration(systemTableCache, hydrationResult)),
    /hydration|incomplete|required/i,
    'verifyCacheHydration should throw on incomplete required hydration',
  );
});

test('BootstrapService.phaseCacheHydration blocks mode swap when strict hydration fails',
  async (t) => {
    const service = new BootstrapService({
      bootIncarnation: 1,
      nodeId: NODE_ID,
      nodeAddress: NODE_ADDRESS,
      config: {
        leadershipWaitTimeoutMs: 5,
        leadershipWaitInitialDelayMs: 1,
        leadershipWaitMaxDelayMs: 1,
        leadershipWaitBackoffMultiplier: 1,
      },
    });

    const systemTableCache = createMinimalHydratedCache();
    const hydrationResult = createHydrationResultWithMissingRequiredTable();
    t.teardown(() => LatencyTopologySetup.stop(service.latencyTopology));

    service.getSystemTableCache = () => systemTableCache;
    service.getLeaderMessageGroupService = () => ({
      applyCDCEvent: async () => {},
    });
    service.seedCacheHydrationPhase
      .hydrateFromLocalPartitions = async () => hydrationResult;
    service.seedCacheHydrationPhase
      .subscribeToInitialSystemTableCDC = async () => {};
    service.messageRouter = {};
    service.cdcIntegrationService = {
      setSystemTableCache: () => {},
      setEpochManager: () => {},
      messageRouter: service.messageRouter,
    };
    service.tablePolicyService = {};

    let swapCalled = false;
    service.seedRegistrationPhase.swapSystemTableWriter = () => {
      swapCalled = true;
    };

    let hydrationFailure;
    await t.rejects(
      service.seedCacheHydrationPhase.phaseCacheHydration().catch((error) => {
        hydrationFailure = error;
        throw error;
      }),
      /hydration|incomplete|required/i,
      'phaseCacheHydration should fail when required hydration is incomplete',
    );
    t.same(hydrationFailure?.missingTables, [SYSTEM_TABLE_NAME.SERVICES],
      'the actual hydration verifier names the deliberately missing required table');
    t.same(hydrationFailure?.emptyTables, [],
      'the four supplied tables remain populated in the canonical cache');
    t.equal(
      swapCalled,
      false,
      'mode swap should not occur when strict hydration verification fails',
    );
  });
