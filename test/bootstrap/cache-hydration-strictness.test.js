/**
 * Failing tests for strict cache hydration behavior.
 *
 * Requirements: 6.2, 6.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

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

const createMinimalHydratedCache = () => ({
  getAll: (tableName) => {
    if (tableName === SYSTEM_TABLE_NAME.NODES) {
      return [{node_id: 'seed-node'}];
    }
    if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
      return [{partition_id: 'p1'}];
    }
    if (tableName === SYSTEM_TABLE_NAME.TABLES) {
      return [{table_id: 'nodes'}];
    }
    if (tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
      return [{group_id: 'mg-1'}];
    }
    return [];
  },
});

test('BootstrapService.verifyCacheHydration fails hard on missing required tables', async (t) => {
  const service = new BootstrapService({
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

    service.getSystemTableCache = () => systemTableCache;
    service.getLeaderMessageGroupService = () => ({applyCDCEvent: async () => {}});
    service.hydrateFromLocalPartitions = async () => hydrationResult;
    service.subscribeToInitialSystemTableCDC = async () => {};
    service.cdcIntegrationService = {
      setSystemTableCache: () => {},
      setEpochManager: () => {},
      messageRouter: {},
    };
    service.tablePolicyService = {};

    let swapCalled = false;
    service.swapSystemTableWriter = () => {
      swapCalled = true;
    };

    await t.rejects(
      service.phaseCacheHydration(),
      /hydration|incomplete|required/i,
      'phaseCacheHydration should fail when required hydration is incomplete',
    );
    t.equal(
      swapCalled,
      false,
      'mode swap should not occur when strict hydration verification fails',
    );
  });
