import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  stopAllRebalancers,
  gracefulShutdown,
  waitForPartitionLeaderElection,
} from './helpers/cluster-test-helpers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

test('CDC debug - single UPDATE propagation timing', {timeout: 30000}, async (t) => {
  initializeTestEnvironment();

  const seedNodeId = 'cdc-debug-000001';
  const seedWsPort = ports.getPort();

  const bootstrapService = new BootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    config: {
      ...TEST_CONFIG.bootstrap,
      leadershipWaitTimeoutMs: 5000,
    },
  });

  let bootstrapResult;
  try {
    bootstrapResult = await bootstrapService.bootstrap();
    t.equal(bootstrapResult.success, true, 'bootstrap ok');

    const nodesLeader = await waitForPartitionLeaderElection(
      bootstrapResult, bootstrapService, 'nodes-p1', 5000,
    );
    t.ok(nodesLeader, 'nodes-p1 leader elected');

    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const sqlQueryEngine = new SQLQueryEngine({
      systemCache: systemTableCache,
      messageRouter: bootstrapResult.messageRouter,
      nodeId: seedNodeId,
    });

    // Check initial cache state
    const initialNode = systemTableCache.get(TABLES.NODES, seedNodeId);
    t.ok(initialNode, 'seed node in cache');
    t.comment(`Initial cpu_usage_percent: ${initialNode[COLUMN.CPU_USAGE_PERCENT]}`);

    // Register a cache listener to track when the update arrives
    let updateReceivedAt = null;
    const listener = (tableName, operation, record) => {
      if (tableName === TABLES.NODES &&
          record?.[COLUMN.NODE_ID] === seedNodeId &&
          record?.[COLUMN.CPU_USAGE_PERCENT] === 42) {
        updateReceivedAt = Date.now();
      }
    };
    systemTableCache.onCacheChange(listener);

    // Do the UPDATE
    const beforeUpdate = Date.now();
    const updateResult = await sqlQueryEngine.executeQuery(
      'UPDATE nodes SET cpu_usage_percent = ? WHERE node_id = ?',
      [42, seedNodeId],
    );
    const afterUpdate = Date.now();
    t.equal(updateResult.success, true, 'UPDATE succeeded');
    t.comment(`UPDATE took ${afterUpdate - beforeUpdate}ms`);

    // Poll with extended timeout (10s) to see if it ever arrives
    const start = Date.now();
    let found = false;
    while (Date.now() - start < 10000) {
      const record = systemTableCache.get(TABLES.NODES, seedNodeId);
      if (record && record[COLUMN.CPU_USAGE_PERCENT] === 42) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const elapsed = Date.now() - start;

    t.ok(found, `CDC update arrived in cache (took ${elapsed}ms)`);
    if (updateReceivedAt) {
      t.comment(`Listener fired ${updateReceivedAt - afterUpdate}ms after UPDATE`);
    } else {
      t.comment('Listener never fired');
    }

    // Check the actual value
    const finalNode = systemTableCache.get(TABLES.NODES, seedNodeId);
    t.comment(`Final cpu_usage_percent: ${finalNode?.[COLUMN.CPU_USAGE_PERCENT]}`);

    systemTableCache.offCacheChange(listener);
  } finally {
    if (bootstrapResult?.partitionServices) {
      stopAllRebalancers(bootstrapResult.partitionServices);
    }
    await new Promise((r) => setTimeout(r, 50));
    await gracefulShutdown(bootstrapService, bootstrapResult, null);
    await cleanupTestEnvironment();
  }
});
