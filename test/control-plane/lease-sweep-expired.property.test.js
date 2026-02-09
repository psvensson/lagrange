/**
 * Property-based test for LeaseService sweep.
 *
 * Property 14: Lease sweep removes expired leases
 * For any set of nodes with expired ready leases, after a lease sweep
 * cycle, those nodes shall no longer have valid ready leases.
 *
 * **Validates: Requirements 8.3**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Arbitrary for generating a set of nodes with mixed lease states.
 */
const nodeSetArb = fc.array(
  fc.record({
    node_id: fc.string({minLength: 3, maxLength: 10})
      .map((s) => `node-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
    expired: fc.boolean(),
  }),
  {minLength: 1, maxLength: 8},
).map((nodes) => {
  // Ensure unique node IDs
  const seen = new Set();
  return nodes.filter((n) => {
    if (seen.has(n.node_id)) return false;
    seen.add(n.node_id);
    return true;
  });
}).filter((nodes) => nodes.length > 0);

test('Property 14: Lease sweep removes expired leases',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        nodeSetArb,
        async (nodeSet) => {
          initEnv();

          const now = Date.now();
          const updatedNodes = new Map();

          // Build node rows
          const nodeRows = nodeSet.map((n) => ({
            node_id: n.node_id,
            node_address: `ws://localhost:${8080}`,
            ws_connection_state: STATE.READY,
            ready_lease_expires_at: n.expired ?
              now - 1000 : now + 60000,
            last_heartbeat: now - 5000,
            status: 'active',
            cpu_cores: 4,
            memory_mb: 8192,
            disk_gb: 100,
            cpu_usage_percent: 0,
            memory_usage_percent: 0,
            disk_usage_percent: 0,
            capabilities: '[]',
            created_at: now - 100000,
          }));

          const mockCache = {
            getAll: () => nodeRows,
            get: (_table, id) =>
              nodeRows.find((n) => n.node_id === id) || null,
          };

          const mockCdc = {
            upsertSystemTableRow: async (_table, row) => {
              updatedNodes.set(row.node_id, row);
              return {success: true};
            },
          };

          const mockSqlQueryEngine = {
            executeQuery: async () => ({
              success: true,
              rows: nodeRows,
            }),
          };

          const mockMgService = {
            isLeaderReplica: () => true,
          };

          const service = new LeaseService({
            nodeId: 'local-node',
            cdcIntegrationService: mockCdc,
            systemTableCache: mockCache,
            sqlQueryEngine: mockSqlQueryEngine,
            messageGroupServices: new Set([mockMgService]),
          });
          service.initialize();

          const expiredIds = await service.sweepExpiredLeases();

          // Count expected expired nodes
          const expectedExpired = nodeSet.filter((n) => n.expired);

          t.equal(
            expiredIds.length, expectedExpired.length,
            `should expire ${expectedExpired.length} nodes`,
          );

          // All expired nodes should have been updated
          for (const n of expectedExpired) {
            const updated = updatedNodes.get(n.node_id);
            t.ok(updated, `${n.node_id} should be updated`);
            t.equal(
              updated.ws_connection_state, STATE.DISCONNECTED,
              `${n.node_id} should be disconnected`,
            );
            t.equal(
              updated.ready_lease_expires_at, null,
              `${n.node_id} lease should be null`,
            );
          }

          // Non-expired nodes should NOT be updated
          const nonExpired = nodeSet.filter((n) => !n.expired);
          for (const n of nonExpired) {
            t.notOk(
              updatedNodes.has(n.node_id),
              `${n.node_id} should not be updated`,
            );
          }

          service.stop();
          return true;
        },
      ),
      {numRuns: 10},
    );
  });
