/**
 * Preservation C — Ready-Node Operations, Self-Targeted Exclusion,
 * and Zero Operations
 *
 * Property 2 (Preservation): For any call to
 * collectCanonicalInFlightReplicaOperationDetails where in-flight
 * replica operations target ACTIVE nodes, those operations MUST appear
 * in the inFlightOperations array. Self-targeted operations MUST
 * continue to be excluded. Zero operations MUST return an empty array.
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline
 * behavior that must remain unchanged after the fix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {
  COLUMN,
  NODE_STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';

const JOINING_NODE_ID = 'joining-node-warm-pres-001';
const ACTIVE_NODE_PREFIX = 'active-node-pres-';
const IN_FLIGHT_STATUS = 'pending';
const IN_FLIGHT_WORKFLOW_STEP = 'ADD_LEARNER';
const OPERATION_TYPE_ADD = 'ADD';

/**
 * Create a minimal system table cache mock that returns replica
 * operations rows and node rows for the warming-node preservation
 * tests.
 *
 * @param {Array} replicaOpRows - Rows for replica_operations.
 * @param {Array} nodeRows - Rows for nodes table.
 * @return {Object} Mock system table cache.
 */
function createSystemTableCacheMock(replicaOpRows, nodeRows) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return replicaOpRows;
      }
      if (tableName === TABLES.NODES) {
        return nodeRows;
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
    filter(tableName, _predicate) {
      if (tableName === TABLES.SERVICES) {
        return [];
      }
      return [];
    },
  };
}

/**
 * Build a replica operation row that is in-flight.
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
    partition_id: `${TABLES.SERVICES}-p1`,
    replica_id: `replica-${operationId}`,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    created_at: Date.now(),
    updated_at: Date.now(),
    completed_at: null,
  };
}

/**
 * Build a node row for the nodes table.
 *
 * @param {string} nodeId - Node ID.
 * @param {string} status - Node status.
 * @return {Object} Node row.
 */
function buildNodeRow(nodeId, status) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
  };
}

/**
 * Create a JoinReadinessEvaluator with delegates that report zero
 * missing leaders (topology satisfied except for in-flight ops).
 *
 * @param {string} nodeId - The joining node's ID.
 * @param {string[]} activeNodeIds - Readiness-owned active node ids.
 * @return {JoinReadinessEvaluator} Evaluator instance.
 */
function createEvaluator(nodeId, activeNodeIds = []) {
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
      getControlPlaneReadinessService: () => ({
        getStartupAuthoritySnapshotSync: () => ({
          authorityAvailable: activeNodeIds.length > 0,
          canonicalStartupNodeIds: activeNodeIds,
        }),
      }),
      getLogger: () => console,
      getConfig: () => ({}),
    },
  });
}

/**
 * Generate a unique active-node ID.
 * @param {number} index - Unique index for the node.
 * @return {string} Node ID.
 */
function activeNodeId(index) {
  return `${ACTIVE_NODE_PREFIX}${index}`;
}

test('Property 2 Preservation C: ' +
  'collectCanonicalInFlightReplicaOperationDetails SHALL return all ' +
  'operations targeting ACTIVE nodes in inFlightOperations ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (operationCount) => {
        const rows = [];
        const activeNodeIds = [];
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
        ];
        for (let i = 0; i < operationCount; i++) {
          const targetId = activeNodeId(i);
          rows.push(
            buildInFlightReplicaOperationRow(
              `op-active-${i}`,
              targetId,
              JOINING_NODE_ID,
            ),
          );
          nodeRows.push(
            buildNodeRow(targetId, NODE_STATE.ACTIVE),
          );
          activeNodeIds.push(targetId);
        }
        const evaluator = createEvaluator(JOINING_NODE_ID, activeNodeIds);

        const cache = createSystemTableCacheMock(rows, nodeRows);

        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );
        const inFlightDetails = result.inFlightOperations;

        // Preservation: operations targeting ACTIVE nodes MUST
        // all appear in the in-flight list.
        assert.equal(
          inFlightDetails.length,
          operationCount,
          'collectCanonicalInFlightReplicaOperationDetails ' +
          `should return all ${operationCount} ACTIVE-targeted ` +
          'operation(s), but returned ' +
          `${inFlightDetails.length}`,
        );

        // Verify each returned operation targets an ACTIVE node.
        for (let i = 0; i < inFlightDetails.length; i++) {
          assert.notEqual(
            inFlightDetails[i].targetNodeId,
            JOINING_NODE_ID,
            `Operation ${i} targetNodeId should not be the ` +
            'joining node',
          );
        }
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 2 Preservation C: ' +
  'for mixed ACTIVE-targeted and self-targeted operations, ' +
  'ACTIVE-targeted count equals non-self non-warming count ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 3}),
      fc.integer({min: 1, max: 3}),
      async (selfCount, activeCount) => {
        const rows = [];
        const activeNodeIds = [];
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
        ];

        // Self-targeted operations
        for (let i = 0; i < selfCount; i++) {
          rows.push(
            buildInFlightReplicaOperationRow(
              `op-self-mix-${i}`,
              JOINING_NODE_ID,
              activeNodeId(i),
            ),
          );
        }

        // ACTIVE-targeted operations
        for (let i = 0; i < activeCount; i++) {
          const targetId = activeNodeId(i + selfCount);
          rows.push(
            buildInFlightReplicaOperationRow(
              `op-active-mix-${i}`,
              targetId,
              JOINING_NODE_ID,
            ),
          );
          nodeRows.push(
            buildNodeRow(targetId, NODE_STATE.ACTIVE),
          );
          activeNodeIds.push(targetId);
        }
        const evaluator = createEvaluator(JOINING_NODE_ID, activeNodeIds);

        const cache = createSystemTableCacheMock(rows, nodeRows);

        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );
        const inFlightDetails = result.inFlightOperations;

        // Preservation: non-self ACTIVE-targeted operations must
        // all be counted. Self-targeted must be excluded.
        const activeTargetedInResults = inFlightDetails.filter(
          (op) => op.targetNodeId !== JOINING_NODE_ID,
        );

        assert.equal(
          activeTargetedInResults.length,
          activeCount,
          'ACTIVE-targeted operations should all be counted: ' +
          `expected ${activeCount}, got ` +
          `${activeTargetedInResults.length}`,
        );

        assert.equal(
          result.excludedSelfTargetedCount,
          selfCount,
          `excludedSelfTargetedCount should be ${selfCount}, ` +
          `got ${result.excludedSelfTargetedCount}`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 2 Preservation C: ' +
  'zero operations always returns empty inFlightOperations and ' +
  'excludedSelfTargetedCount of 0 ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  const evaluator = createEvaluator(JOINING_NODE_ID);
  const cache = createSystemTableCacheMock([], [
    buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
  ]);

  const result =
    evaluator.collectCanonicalInFlightReplicaOperationDetails(cache);

  // Preservation: zero operations means empty array and zero
  // excluded count.
  assert.equal(
    result.inFlightOperations.length,
    0,
    'inFlightOperations should be empty when no operations exist',
  );
  assert.equal(
    result.excludedSelfTargetedCount,
    0,
    'excludedSelfTargetedCount should be 0 when no operations exist',
  );
  t.end();
});
