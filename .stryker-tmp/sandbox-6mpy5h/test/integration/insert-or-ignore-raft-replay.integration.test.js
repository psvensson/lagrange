/**
 * Integration test: INSERT OR IGNORE SQL lost through Raft replay.
 *
 * Bug: When the SQL query engine processes an INSERT OR IGNORE statement,
 * the SQL parser + query executor reconstruct the SQL from the AST. The
 * parser's convertInsert() only sets `orReplace` on the AST — there is no
 * `orIgnore` flag. buildInsertSQL() therefore emits a plain INSERT INTO,
 * dropping the OR IGNORE modifier.
 *
 * The reconstructed plain INSERT is sent to the partition leader, which:
 *   1. Executes it in applyWrite() — succeeds (row inserted)
 *   2. Replicates via raft.command(entry)
 *   3. On Raft commit, applyCommittedEntry() runs the same INSERT again
 *   4. UNIQUE constraint violation — crash
 *
 * This test reproduces the crash by executing an INSERT OR IGNORE with a
 * duplicate primary key through the real SQL query engine and Raft pipeline.
 *
 * Requirements: 2.2, 9.1, 9.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
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

let nodeIdCounter = 0xA00000000000;

/**
 * Generate a unique node ID for this test file.
 * @param {number} counter - Counter value.
 * @return {string} UUID string.
 */
function generateUniqueNodeId(counter) {
  const hex = counter.toString(16).padStart(12, '0');
  return `660e8400-e29b-41d4-a716-${hex}`;
}

test('INSERT OR IGNORE lost through SQL rebuild', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test(
    'INSERT OR IGNORE is stripped to plain INSERT, causing UNIQUE crash on Raft replay',
    async (t) => {
      const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
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
        // Bootstrap seed node with real Raft partitions
        bootstrapResult = await bootstrapService.bootstrap();
        t.equal(bootstrapResult.success, true, 'seed bootstrap succeeds');

        // Wait for replica_operations partition to elect a leader
        const leader = await waitForPartitionLeaderElection(
          bootstrapResult,
          bootstrapService,
          'replica_operations-p1',
          5000,
        );
        t.ok(leader, 'replica_operations partition has a leader');

        // Create SQL query engine
        const systemTableCache =
          NodeService.getInstance().getSystemTableCache();
        const sqlEngine = new SQLQueryEngine({
          systemCache: systemTableCache,
          messageRouter: bootstrapResult.messageRouter,
          nodeId: seedNodeId,
        });

        // First INSERT OR IGNORE — should succeed
        const operationId = 'test-op-duplicate-check';
        const insertSql = `INSERT OR IGNORE INTO replica_operations (
          operation_id, type, partition_id, replica_id,
          entity_type, entity_id,
          source_node_id, target_node_id, status, workflow_step,
          created_at, updated_at, completed_at, error_message,
          steps_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
          operationId, 'ADD', 'test-partition', 'test-replica',
          'partition', 'test-partition',
          seedNodeId, seedNodeId, 'pending', 'pending',
          Date.now(), Date.now(), null, null, '[]',
        ];

        const firstResult = await sqlEngine.executeQuery(insertSql, params);
        t.equal(
          firstResult.success, true,
          'first INSERT OR IGNORE should succeed',
        );

        // Small delay to let Raft commit propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Second INSERT OR IGNORE with same operation_id — should be
        // silently ignored by SQLite, NOT crash with UNIQUE violation.
        //
        // BUG: The SQL parser drops OR IGNORE, so this becomes a plain
        // INSERT which crashes on the UNIQUE constraint when Raft
        // replays the committed entry on the leader.
        const secondResult = await sqlEngine.executeQuery(
          insertSql, params,
        );

        // With the bug present, this will either:
        // - Return success: false with a UNIQUE constraint error, or
        // - Crash the partition service via applyCommittedEntry throw
        //
        // The correct behavior is success: true (OR IGNORE silently
        // skips the duplicate).
        t.equal(
          secondResult.success, true,
          'second INSERT OR IGNORE should silently ignore duplicate',
        );

        // Verify only one row exists (not duplicated)
        const selectResult = await sqlEngine.executeQuery(
          'SELECT * FROM replica_operations WHERE operation_id = ?',
          [operationId],
        );
        t.equal(selectResult.success !== false, true, 'SELECT succeeds');
        t.equal(
          selectResult.rows?.length, 1,
          'exactly one row with that operation_id',
        );
      } finally {
        if (bootstrapResult?.partitionServices) {
          stopAllRebalancers(bootstrapResult.partitionServices);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        await gracefulShutdown(bootstrapService, bootstrapResult, null);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
  );
});
