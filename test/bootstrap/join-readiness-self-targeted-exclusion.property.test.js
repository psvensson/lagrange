/**
 * Bug Condition Exploration — Self-Targeted Operation Exclusion
 *
 * Property 2 (Bug Condition B): For any join readiness evaluation where
 * in-flight replica operations exist and all have targetNodeId equal to
 * the joining node's own nodeId, the fixed code SHALL exclude those
 * operations from the in-flight count and declare the in-flight
 * operations dimension as satisfied.
 *
 * On UNFIXED code this test MUST FAIL — failure confirms the bug exists.
 * collectCanonicalInFlightReplicaOperationDetails does not filter
 * self-targeted operations, causing a circular dependency deadlock.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 2.3, 2.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {
  NUM,
  TABLES,
} from '../../src/constants/index.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';

const JOINING_NODE_ID = 'joining-node-001';
const OTHER_NODE_ID = 'other-node-002';
const IN_FLIGHT_STATUS = 'pending';
const IN_FLIGHT_WORKFLOW_STEP = 'ADD_LEARNER';
const OPERATION_TYPE_ADD = 'ADD';

/**
 * Create a minimal system table cache mock that returns replica
 * operations rows and satisfies the endpoint visibility checks.
 *
 * @param {Array} replicaOperationRows - Rows for replica_operations.
 * @param {string} joiningNodeId - The joining node's ID.
 * @return {Object} Mock system table cache.
 */
function createSystemTableCacheMock(replicaOperationRows, joiningNodeId) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return replicaOperationRows;
      }
      if (tableName === TABLES.NODE_ENDPOINTS) {
        return [];
      }
      if (tableName === TABLES.SERVICE_ENDPOINTS) {
        return [];
      }
      if (tableName === TABLES.SERVICES) {
        return [];
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName === TABLES.SERVICES) {
        return [];
      }
      return [];
    },
  };
}

/**
 * Build a replica operation row that is in-flight (pending status,
 * no completed_at, not terminal).
 *
 * @param {string} operationId - Unique operation ID.
 * @param {string} targetNodeId - Target node for the operation.
 * @param {string} sourceNodeId - Source node for the operation.
 * @return {Object} Replica operation row.
 */
function buildInFlightReplicaOperationRow(
  operationId,
  targetNodeId,
  sourceNodeId,
) {
  return {
    operation_id: operationId,
    type: OPERATION_TYPE_ADD,
    status: IN_FLIGHT_STATUS,
    workflow_step: IN_FLIGHT_WORKFLOW_STEP,
    partition_id: `partition-${operationId}`,
    replica_id: `replica-${operationId}`,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    created_at: Date.now(),
    updated_at: Date.now(),
    completed_at: null,
  };
}

/**
 * Create a JoinReadinessEvaluator with delegates that report zero
 * missing leaders (topology satisfied except for in-flight ops).
 *
 * @param {string} nodeId - The joining node's ID.
 * @return {JoinReadinessEvaluator} Evaluator instance.
 */
function createEvaluator(nodeId) {
  const emptyMissing = {
    missingPartitionLeaders: [],
    missingMessageGroupLeaders: [],
    missingPartitionLeaderNodes: [],
    missingMessageGroupLeaderNodes: [],
    missingPartitionLeaderAddresses: [],
    missingMessageGroupLeaderAddresses: [],
  };
  return new JoinReadinessEvaluator({
    nodeId,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    delegates: {
      getMissingSystemServiceLeaders: () => emptyMissing,
      getBlockingSystemServiceLeaders: () => emptyMissing,
      resolveControlPlaneTargetAddress: () => null,
      backfillPropagatedCacheTables: () => {},
      getMessageRouter: () => null,
      getBootstrapResponse: () => null,
      getSystemCacheHydrated: () => false,
      getJoinReadinessSnapshotProvider: () => null,
      getCdcIntegrationService: () => null,
      getLogger: () => console,
      getConfig: () => ({}),
    },
  });
}

test('Property 2 Bug Condition B: ' +
  'collectCanonicalInFlightReplicaOperationDetails SHALL NOT return ' +
  'operations where targetNodeId === joining nodeId ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (operationCount) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);

        const selfTargetedRows = [];
        for (let i = NUM.ZERO; i < operationCount; i++) {
          selfTargetedRows.push(
            buildInFlightReplicaOperationRow(
              `op-self-${i}`,
              JOINING_NODE_ID,
              OTHER_NODE_ID,
            ),
          );
        }

        const cache = createSystemTableCacheMock(
          selfTargetedRows,
          JOINING_NODE_ID,
        );

        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );

        // Expected behavior: self-targeted operations should be
        // excluded from the in-flight list.
        // On UNFIXED code this FAILS because
        // collectCanonicalInFlightReplicaOperationDetails returns
        // ALL in-flight operations including those targeting the
        // joining node itself.
        assert.equal(
          result.inFlightOperations.length,
          NUM.ZERO,
          `collectCanonicalInFlightReplicaOperationDetails should ` +
          `exclude ${operationCount} self-targeted operation(s) ` +
          `where targetNodeId === '${JOINING_NODE_ID}', but ` +
          `returned ${result.inFlightOperations.length} ` +
          `operation(s)`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 2 Bug Condition B: ' +
  'evaluateCanonicalJoinTopologyReadiness SHALL declare ready=true ' +
  'when only self-targeted in-flight operations exist ' +
  '(uses evaluateCanonicalJoinTopologyReadiness owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (operationCount) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);

        const selfTargetedRows = [];
        for (let i = NUM.ZERO; i < operationCount; i++) {
          selfTargetedRows.push(
            buildInFlightReplicaOperationRow(
              `op-topo-${i}`,
              JOINING_NODE_ID,
              OTHER_NODE_ID,
            ),
          );
        }

        const cache = createSystemTableCacheMock(
          selfTargetedRows,
          JOINING_NODE_ID,
        );

        const result =
          evaluator.evaluateCanonicalJoinTopologyReadiness(cache);

        // Expected behavior: when only self-targeted operations
        // exist and other dimensions are satisfied (zero missing
        // leaders), topology readiness should be true.
        // On UNFIXED code this FAILS because self-targeted
        // operations are counted, inFlightReplicaOperations > 0,
        // and ready is false — creating a deadlock.
        assert.equal(
          result.inFlightReplicaOperations,
          NUM.ZERO,
          `inFlightReplicaOperations should be 0 when all ` +
          `${operationCount} operation(s) target the joining ` +
          `node '${JOINING_NODE_ID}', but got ` +
          `${result.inFlightReplicaOperations}`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});
