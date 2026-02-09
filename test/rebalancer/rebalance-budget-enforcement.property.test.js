/**
 * Property Test: Rebalance Budget Enforcement (Property 11)
 *
 * For any rebalance cycle, the number of proposed moves shall be at most
 * max(0, rebalance_budget - in_flight_count). When in_flight_count >=
 * rebalance_budget, zero moves shall be proposed.
 *
 * Validates: Requirements 6.3, 6.4
 *
 * Feature: system-architecture-consolidation, Property 11: Rebalance budget
 * enforcement
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockCoordinator,
} from './test-helpers.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_SKIP_REASON,
  REBALANCER_DEFAULT,
} from '../../src/rebalancer/rebalancer-constants.js';

const CRITICAL_MULTIPLIER =
  REBALANCER_DEFAULT.UNIFIED.CRITICAL_BUDGET_MULTIPLIER;

/**
 * Initialize test environment with clean singletons.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Create a SQL query engine mock that returns specific budget and in-flight
 * count values.
 * @param {number} budget - The rebalance budget to return.
 * @param {number} inFlightCount - The in-flight operation count to return.
 * @return {Object} Mock SQL query engine.
 */
function createBudgetSqlEngine(budget, inFlightCount) {
  return {
    executeQuery: async (sql, _params) => {
      if (sql.includes('COUNT(*)')) {
        return {success: true, rows: [{count: inFlightCount}]};
      }
      if (sql.includes('config_value')) {
        return {
          success: true,
          rows: [{config_value: String(budget)}],
        };
      }
      return {success: true, rows: []};
    },
  };
}

/**
 * Create a rebalancer in a critical state (under-replicated).
 * Has 1 replica but policy wants more — triggers critical budget multiplier.
 * @param {Object} options - Options.
 * @param {number} options.budget - Rebalance budget.
 * @param {number} options.inFlightCount - In-flight operations count.
 * @param {number} options.neededMoves - How many moves the rebalancer wants.
 * @return {UnifiedRebalancer} Configured rebalancer.
 */
function createCriticalRebalancer({budget, inFlightCount, neededMoves}) {
  const nodeId = 'node-1';
  const entityId = 'partition-1';

  const totalNodes = neededMoves + 1;
  const nodes = [];
  for (let i = 0; i < totalNodes; i++) {
    nodes.push({
      node_id: `node-${i + 1}`,
      status: 'active',
      ws_connection_state: 'ready',
      ready_lease_expires_at: Date.now() + 60000,
    });
  }

  // 1 replica — below minReplicaCount=3, so critical state
  const services = [{
    service_id: `${entityId}-${nodeId}`,
    partition_id: entityId,
    node_id: nodeId,
    service_type: 'partition',
    status: ReplicaStatus.ACTIVE,
  }];

  const targetCount = 1 + neededMoves;
  const adjustedTarget = targetCount % 2 === 0 ?
    targetCount + 1 : targetCount;

  const partitions = [{partition_id: entityId, table_id: 'table-1'}];
  const tables = [{
    table_id: 'table-1',
    table_policies: JSON.stringify({
      replicaCount: adjustedTarget,
      targetReplicaCount: adjustedTarget,
      minReplicaCount: 3,
      maxReplicaCount: adjustedTarget + 2,
    }),
  }];

  const cache = createMockCache({
    nodes, services, partitions, tables,
  });
  const sqlEngine = createBudgetSqlEngine(budget, inFlightCount);

  const rebalancer = new UnifiedRebalancer({
    entityId,
    entityType: EntityType.PARTITION,
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService({partitions, tables}),
    messageRouter: createMockMessageRouter(),
    rebalanceCoordinator: createMockCoordinator(),
    sqlQueryEngine: sqlEngine,
  });

  rebalancer.initialize();
  rebalancer.isLeader = true;
  // Bypass stabilization
  rebalancer.lastStateChangeTime = 0;
  // Disable inter-batch delay for fast tests
  rebalancer.interBatchDelayMs = 0;

  return rebalancer;
}

// Initialize once before all tests
initializeTestEnvironment();

test('Property 11: Rebalance budget enforcement', async (t) => {
  await t.test(
    'when in-flight >= effective budget, zero moves are proposed',
    async (t) => {
      /**
       * **Validates: Requirements 6.3**
       *
       * The rebalancer is in critical state (1 replica, min=3), so
       * effectiveBudget = budget * CRITICAL_MULTIPLIER.
       * When inFlight >= effectiveBudget, it must skip.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 1, max: 20}),
          fc.integer({min: 0, max: 20}),
          async (budget, extra) => {
            const effectiveBudget = budget * CRITICAL_MULTIPLIER;
            const inFlightCount = effectiveBudget + extra;

            const rebalancer = createCriticalRebalancer({
              budget,
              inFlightCount,
              neededMoves: 4,
            });

            const result = await rebalancer.rebalance('periodic');

            // Clean up timers
            rebalancer.setLeader(false);
            if (rebalancer.stabilizationTimer) {
              clearTimeout(rebalancer.stabilizationTimer);
            }
            if (rebalancer.scheduledCheck) {
              clearTimeout(rebalancer.scheduledCheck);
            }

            return result.skipped === true &&
              result.reason === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Zero moves proposed when in-flight >= effective budget');
    },
  );

  await t.test(
    'moves are capped at max(0, effectiveBudget - inFlight)',
    async (t) => {
      /**
       * **Validates: Requirements 6.4**
       *
       * When there is available budget, the number of executed moves
       * must not exceed (effectiveBudget - inFlight).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 3, max: 6}),
          fc.integer({min: 0, max: 2}),
          async (budget, inFlightCount) => {
            const neededMoves = budget * CRITICAL_MULTIPLIER + 1;
            const rebalancer = createCriticalRebalancer({
              budget,
              inFlightCount,
              neededMoves,
            });

            let executedMoveCount = 0;
            const originalExecute =
              rebalancer.executeRebalancingMoves.bind(rebalancer);
            rebalancer.executeRebalancingMoves = async (moves) => {
              executedMoveCount = moves.length;
              return originalExecute(moves);
            };

            const result = await rebalancer.rebalance('periodic');

            // Clean up timers
            rebalancer.setLeader(false);
            if (rebalancer.stabilizationTimer) {
              clearTimeout(rebalancer.stabilizationTimer);
            }
            if (rebalancer.scheduledCheck) {
              clearTimeout(rebalancer.scheduledCheck);
            }

            if (result.skipped || !result.success) {
              return true;
            }

            const effectiveBudget = budget * CRITICAL_MULTIPLIER;
            const maxAllowed = Math.max(
              0, effectiveBudget - inFlightCount,
            );
            return executedMoveCount <= maxAllowed;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Moves capped at available budget');
    },
  );

  await t.test(
    'missing budget config falls back to default',
    async (t) => {
      /**
       * When the config table has no rebalance_budget entry,
       * the default budget (10) is used.
       */
      const emptySqlEngine = {
        executeQuery: async (sql, _params) => {
          if (sql.includes('COUNT(*)')) {
            return {success: true, rows: [{count: 0}]};
          }
          // No config row found
          if (sql.includes('config_value')) {
            return {success: true, rows: []};
          }
          return {success: true, rows: []};
        },
      };

      const rebalancer = createCriticalRebalancer({
        budget: 1,
        inFlightCount: 0,
        neededMoves: 4,
      });
      // Override with empty config engine
      rebalancer.sqlQueryEngine = emptySqlEngine;

      const result = await rebalancer.rebalance('periodic');

      // Clean up timers
      rebalancer.setLeader(false);
      if (rebalancer.stabilizationTimer) {
        clearTimeout(rebalancer.stabilizationTimer);
      }
      if (rebalancer.scheduledCheck) {
        clearTimeout(rebalancer.scheduledCheck);
      }

      // With default budget (10) and 0 in-flight, rebalancing proceeds
      t.not(result.skipped, true,
        'Should not skip with default budget and 0 in-flight');
    },
  );

  await t.test(
    'budget query failure causes cycle skip',
    async (t) => {
      const failingSqlEngine = {
        executeQuery: async () => {
          throw new Error('SQL engine unavailable');
        },
      };

      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-1',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        systemTableCache: createMockCache({
          nodes: [{
            node_id: 'node-1',
            status: 'active',
            ws_connection_state: 'ready',
            ready_lease_expires_at: Date.now() + 60000,
          }],
        }),
        cdcIntegrationService: createMockCdcService(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockMessageRouter(),
        rebalanceCoordinator: createMockCoordinator(),
        sqlQueryEngine: failingSqlEngine,
      });

      rebalancer.initialize();
      rebalancer.isLeader = true;
      rebalancer.lastStateChangeTime = 0;

      const result = await rebalancer.rebalance('periodic');

      t.equal(result.skipped, true, 'Should skip on query failure');
      t.equal(
        result.reason,
        'budget_query_failed',
        'Reason should be budget_query_failed',
      );
    },
  );
});
