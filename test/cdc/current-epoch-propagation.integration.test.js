/**
 * Integration test for current epoch durability and CDC propagation.
 * Task 8: expected to fail until config.current_epoch durability/wiring is complete.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {EPOCH_CONFIG_KEY} from '../../src/cdc/cdc-integration-service.js';
import {
  cleanupTestEnvironment,
  getUniquePort,
  initializeTestEnvironment,
  TEST_CONFIG,
  waitFor,
} from '../integration/helpers/cluster-test-helpers.js';

const WAIT_MS = Object.freeze({
  EPOCH_ROW: 3000,
  POLL_INTERVAL: 50,
});

async function readCurrentEpochRow(sqlQueryEngine) {
  const result = await sqlQueryEngine.executeQuery(
    'SELECT * FROM config WHERE config_key = ?',
    [EPOCH_CONFIG_KEY],
  );
  if (!result.success || !Array.isArray(result.rows) || result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
}

async function waitForCurrentEpochRow(sqlQueryEngine) {
  let row = null;
  const found = await waitFor(async () => {
    row = await readCurrentEpochRow(sqlQueryEngine);
    return row !== null;
  }, WAIT_MS.EPOCH_ROW, WAIT_MS.POLL_INTERVAL);
  if (!found) {
    return null;
  }
  return row;
}

function parseEpochValue(row) {
  try {
    return JSON.parse(row.config_value);
  } catch {
    return null;
  }
}

test('Current epoch durability and propagation integration', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('seed bootstrap persists authoritative epoch in config.current_epoch', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440101';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const seedSqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      const epochRow = await waitForCurrentEpochRow(seedSqlQueryEngine);
      t.ok(epochRow, 'config.current_epoch row should be persisted');

      const epochData = epochRow ? parseEpochValue(epochRow) : null;
      t.ok(epochData, 'config.current_epoch value should be valid JSON');
      t.equal(epochData?.epoch, 0, 'initial persisted epoch should be 0');
      t.equal(epochData?.proposedBy, seedNodeId, 'initial epoch should be proposed by seed node');
    } finally {
      await bootstrapService.shutdown().catch(() => {});
      await bootstrapResult?.messageRouter?.shutdown?.().catch(() => {});
    }
  });

  await t.test('seed epoch persists and is readable after bootstrap', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440102';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemCache = NodeService.getInstance().getSystemTableCache();
      const seedSqlQueryEngine = new SQLQueryEngine({
        systemCache: systemCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      const epochRow = await waitForCurrentEpochRow(seedSqlQueryEngine);
      t.ok(epochRow, 'config.current_epoch row should exist');

      const epochData = epochRow ? parseEpochValue(epochRow) : null;
      t.ok(epochData, 'epoch value should be valid JSON');
      t.equal(
        epochData?.proposedBy, seedNodeId,
        'epoch should be proposed by seed node',
      );

      const epochManager = bootstrapService.getEpochManager();
      t.ok(epochManager, 'seed should have epoch manager');
      t.equal(
        epochManager.getCurrentEpoch().epoch,
        epochData?.epoch,
        'epoch manager state should match persisted epoch',
      );
    } finally {
      await bootstrapService.shutdown().catch(() => {});
      await bootstrapResult?.messageRouter?.shutdown?.().catch(() => {});
    }
  });
});
