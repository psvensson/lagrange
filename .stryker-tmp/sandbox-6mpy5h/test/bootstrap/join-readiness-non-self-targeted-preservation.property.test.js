/**
 * Preservation B — Non-Self-Targeted Operations Still Block
 *
 * Property 4 (Preservation B): For any join readiness evaluation where
 * in-flight replica operations exist with targetNodeId NOT equal to the
 * joining node's nodeId, the code SHALL continue to count those
 * operations, preserving the existing blocking behavior for
 * externally-targeted operations.
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline behavior
 * that must remain unchanged after the fix.
 *
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7**
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {
  COLUMN,
  NODE_STATE,
  NUM,
  TABLES,
} from '../../src/constants/index.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';

const JOINING_NODE_ID = 'joining-node-preserve-001';
const OTHER_NODE_PREFIX = 'other-node-';
const IN_FLIGHT_STATUS = 'pending';
const IN_FLIGHT_WORKFLOW_STEP = 'ADD_LEARNER';
const OPERATION_TYPE_ADD = 'ADD';

/**
 * Create a minimal system table cache mock that returns replica
 * operations rows, node rows, and satisfies the endpoint visibility
 * checks.
 *
 * @param {Array} replicaOperationRows - Rows for replica_operations.
 * @param {Array} nodeRows - Rows for nodes table.
 * @return {Object} Mock system table cache.
 */
function createSystemTableCacheMock(replicaOperationRows, nodeRows) {
  return {
    getAll(tableName) {
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return replicaOperationRows;
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

/**
 * Generate a unique other-node ID that is never the joining node.
 * @param {number} index - Unique index for the node.
 * @return {string} Node ID.
 */
function otherNodeId(index) {
  return `${OTHER_NODE_PREFIX}${index}`;
}

test('Property 4 Preservation B: ' +
  'collectCanonicalInFlightReplicaOperationDetails SHALL return all ' +
  'operations where targetNodeId !== joining nodeId ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (operationCount) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);

        const nonSelfTargetedRows = [];
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
        ];
        for (let i = NUM.ZERO; i < operationCount; i++) {
          const targetId = otherNodeId(i);
          nonSelfTargetedRows.push(
            buildInFlightReplicaOperationRow(
              `op-other-${i}`,
              targetId,
              JOINING_NODE_ID,
            ),
          );
          nodeRows.push(
            buildNodeRow(targetId, NODE_STATE.ACTIVE),
          );
        }

        const cache = createSystemTableCacheMock(
          nonSelfTargetedRows,
          nodeRows,
        );

        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );
        const inFlightDetails = result.inFlightOperations;

        // Preservation: non-self-targeted operations MUST all be
        // counted in the in-flight list.
        assert.equal(
          inFlightDetails.length,
          operationCount,
          `collectCanonicalInFlightReplicaOperationDetails ` +
          `should return all ${operationCount} non-self-targeted ` +
          `operation(s), but returned ` +
          `${inFlightDetails.length}`,
        );

        // Verify each returned operation has the correct
        // targetNodeId (not the joining node).
        for (let i = NUM.ZERO; i < inFlightDetails.length; i++) {
          assert.notEqual(
            inFlightDetails[i].targetNodeId,
            JOINING_NODE_ID,
            `Operation ${i} targetNodeId should not be the ` +
            `joining node`,
          );
        }
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 4 Preservation B: ' +
  'evaluateCanonicalJoinTopologyReadiness SHALL report zero ' +
  'in-flight operations when none exist ' +
  '(uses evaluateCanonicalJoinTopologyReadiness owner path)',
async (t) => {
  const evaluator = createEvaluator(JOINING_NODE_ID);
  const cache = createSystemTableCacheMock([], []);

  const result =
    evaluator.evaluateCanonicalJoinTopologyReadiness(cache);

  // Preservation: zero in-flight operations means the in-flight
  // operations dimension is satisfied (count is zero).
  assert.equal(
    result.inFlightReplicaOperations,
    NUM.ZERO,
    'inFlightReplicaOperations should be 0 when no operations exist',
  );
  assert.equal(
    result.inFlightReplicaOperationDetails.length,
    NUM.ZERO,
    'inFlightReplicaOperationDetails should be empty when no ' +
    'operations exist',
  );
  t.end();
});

test('Property 4 Preservation B: ' +
  'for mixed self-targeted and non-self-targeted operations, ' +
  'in-flight count SHALL equal only the non-self-targeted count ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 3}),
      fc.integer({min: 1, max: 3}),
      async (selfCount, nonSelfCount) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);

        const rows = [];
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
        ];
        for (let i = NUM.ZERO; i < selfCount; i++) {
          rows.push(
            buildInFlightReplicaOperationRow(
              `op-self-mix-${i}`,
              JOINING_NODE_ID,
              otherNodeId(i),
            ),
          );
          nodeRows.push(
            buildNodeRow(otherNodeId(i), NODE_STATE.ACTIVE),
          );
        }
        for (let i = NUM.ZERO; i < nonSelfCount; i++) {
          const targetId = otherNodeId(i + selfCount);
          rows.push(
            buildInFlightReplicaOperationRow(
              `op-other-mix-${i}`,
              targetId,
              JOINING_NODE_ID,
            ),
          );
          nodeRows.push(
            buildNodeRow(targetId, NODE_STATE.ACTIVE),
          );
        }

        const cache = createSystemTableCacheMock(rows, nodeRows);

        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );
        const inFlightDetails = result.inFlightOperations;

        // On UNFIXED code, ALL operations are returned (both
        // self-targeted and non-self-targeted). The total count
        // equals selfCount + nonSelfCount.
        // This test captures the CURRENT behavior: the unfixed
        // code returns everything. After the fix, only
        // nonSelfCount operations should be returned.
        //
        // For preservation: we verify that at LEAST the
        // non-self-targeted operations are always counted.
        // The non-self-targeted count must never be lost.
        const nonSelfTargetedInResults = inFlightDetails.filter(
          (op) => op.targetNodeId !== JOINING_NODE_ID,
        );

        assert.equal(
          nonSelfTargetedInResults.length,
          nonSelfCount,
          `Non-self-targeted operations should all be counted: ` +
          `expected ${nonSelfCount}, got ` +
          `${nonSelfTargetedInResults.length}`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});
