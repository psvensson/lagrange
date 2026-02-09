/**
 * Regression test for UNIQUE constraint violation when second node joins cluster.
 *
 * Bug: When a second node joins the cluster, the seed node crashes with:
 * "UNIQUE constraint failed: nodes.node_id"
 *
 * Root cause: The joining node uses plain INSERT INTO nodes instead of
 * INSERT OR REPLACE, causing a UNIQUE constraint violation when the node
 * entry already exists (from CDC or previous registration).
 *
 * Fix: Use cdcIntegrationService.upsertSystemTableRow() which generates
 * INSERT OR REPLACE SQL.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {STATE, TABLES, TRANSPORT_TYPE, ENDPOINT_STATUS, COLUMN} from
  '../../src/constants/index.js';

test('registerNodeInCluster() - should use INSERT OR REPLACE for idempotent registration',
  async (t) => {
    // Create a mock SQL query engine that tracks executed queries
    const executedQueries = [];
    const mockQueryEngine = {
      executeQuery: async (sql, params) => {
        executedQueries.push({sql, params});
        return {success: true};
      },
    };

    // Create a mock CDC integration service with upsertSystemTableRow
    const upsertCalls = [];
    const mockCDCService = {
      sqlQueryEngine: mockQueryEngine,
      upsertSystemTableRow: async (tableName, data) => {
        upsertCalls.push({tableName, data});
        return {success: true};
      },
    };

    // Create NodeJoiningService instance
    const service = new NodeJoiningService({
      nodeId: 'test-node-idempotent',
      nodeAddress: 'ws://localhost:9000',
      seedNodeAddress: 'ws://seed:8000',
    });

    // Set the mock CDC service
    service.cdcIntegrationService = mockCDCService;

    // Call registerNodeInCluster
    await service.registerNodeInCluster();

    // Verify that nodes table uses INSERT OR REPLACE (via upsertSystemTableRow)
    // The fix should use upsertSystemTableRow for nodes table, not raw INSERT
    const nodesQuery = executedQueries.find((q) =>
      q.sql.includes('INSERT INTO nodes') && !q.sql.includes('INSERT OR REPLACE'),
    );

    // After the fix, there should be no plain INSERT INTO nodes
    // Instead, upsertSystemTableRow should be called for nodes table
    const nodesUpsert = upsertCalls.find((c) => c.tableName === TABLES.NODES);

    // This test will FAIL before the fix (plain INSERT is used)
    // and PASS after the fix (upsertSystemTableRow is used)
    t.ok(
      nodesUpsert || (nodesQuery && nodesQuery.sql.includes('INSERT OR REPLACE')),
      'should use INSERT OR REPLACE or upsertSystemTableRow for nodes table',
    );

    // Verify node_endpoints still uses upsertSystemTableRow (already fixed)
    const endpointUpsert = upsertCalls.find((c) => c.tableName === TABLES.NODE_ENDPOINTS);
    t.ok(endpointUpsert, 'should use upsertSystemTableRow for node_endpoints table');
  });

test('registerNodeInCluster() - should not fail on duplicate node_id', async (t) => {
  // Simulate a scenario where the node already exists in the database
  // This would cause UNIQUE constraint violation with plain INSERT
  let insertAttempts = 0;

  const mockQueryEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO nodes') && !sql.includes('INSERT OR REPLACE')) {
        insertAttempts++;
        // Simulate UNIQUE constraint violation on second attempt
        if (insertAttempts > 1) {
          return {success: false, error: 'UNIQUE constraint failed: nodes.node_id'};
        }
      }
      return {success: true};
    },
  };

  const upsertCalls = [];
  const mockCDCService = {
    sqlQueryEngine: mockQueryEngine,
    upsertSystemTableRow: async (tableName, data) => {
      upsertCalls.push({tableName, data});
      return {success: true};
    },
  };

  const service = new NodeJoiningService({
    nodeId: 'duplicate-node-test',
    nodeAddress: 'ws://localhost:9002',
    seedNodeAddress: 'ws://seed:8000',
  });

  service.cdcIntegrationService = mockCDCService;

  // First registration should succeed
  await service.registerNodeInCluster();

  // Second registration should also succeed (using INSERT OR REPLACE)
  // After the fix, this should use upsertSystemTableRow and not fail
  try {
    await service.registerNodeInCluster();
    // If we get here with the fix, upsertSystemTableRow was used
    const nodesUpserts = upsertCalls.filter((c) => c.tableName === TABLES.NODES);
    t.ok(nodesUpserts.length >= 1, 'should use upsertSystemTableRow for idempotent registration');
  } catch (error) {
    // Before the fix, this would fail with UNIQUE constraint violation
    t.fail(`should not fail on duplicate registration: ${error.message}`);
  }
});
