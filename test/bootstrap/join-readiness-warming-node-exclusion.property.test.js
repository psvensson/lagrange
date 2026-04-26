/**
 * Bug Condition Exploration — Warming-Node Operation Exclusion
 *
 * Property 1 (Bug Condition C): For any join readiness evaluation where
 * in-flight replica operations exist targeting nodes that are NOT in
 * ACTIVE state (warming/not-ready), the fixed code SHALL exclude those
 * operations from the returned inFlightOperations array and track them
 * in a separate excludedWarmingTargetCount, so that warming nodes are
 * not blocked from completing join readiness by operations that cannot
 * make progress.
 *
 * On UNFIXED code this test MUST FAIL — failure confirms the bug exists.
 * collectCanonicalInFlightReplicaOperationDetails does not filter
 * operations targeting warming nodes, causing a circular dependency
 * deadlock where warming nodes block each other.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.3, 2.4**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  NUM,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  ENDPOINT_SYNC_HEALTH,
} from '../../src/runtime/endpoint-sync-constants.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';

const JOINING_NODE_ID = 'joining-node-warm-001';
const WARMING_NODE_A_ID = 'warming-node-a-002';
const WARMING_NODE_B_ID = 'warming-node-b-003';
const ACTIVE_NODE_ID = 'active-node-004';
const IN_FLIGHT_STATUS = 'pending';
const IN_FLIGHT_WORKFLOW_STEP = 'ADD_LEARNER';
const OPERATION_TYPE_ADD = 'ADD';
const WARMING_NODE_STATES = [NODE_STATE.JOINING, NODE_STATE.SYNCING, NODE_STATE.READY];

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
        return nodeRows
          .filter((r) =>
            String(r[COLUMN.STATUS]).toLowerCase() ===
            String(NODE_STATE.ACTIVE).toLowerCase())
          .map((r) => ({
            [COLUMN.NODE_ID]: r[COLUMN.NODE_ID],
            [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
            [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
          }));
      }
      if (tableName === TABLES.SERVICE_ENDPOINTS) {
        return nodeRows
          .filter((r) =>
            String(r[COLUMN.STATUS]).toLowerCase() ===
            String(NODE_STATE.ACTIVE).toLowerCase())
          .map((r) => ({
            [COLUMN.NODE_ID]: r[COLUMN.NODE_ID],
            [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
            health_status: ENDPOINT_SYNC_HEALTH.HEALTHY,
          }));
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

function buildInFlightRow(opId, targetId, sourceId) {
  return {
    operation_id: opId,
    type: OPERATION_TYPE_ADD,
    status: IN_FLIGHT_STATUS,
    workflow_step: IN_FLIGHT_WORKFLOW_STEP,
    partition_id: `partition-${opId}`,
    replica_id: `replica-${opId}`,
    source_node_id: sourceId,
    target_node_id: targetId,
    created_at: Date.now(),
    updated_at: Date.now(),
    completed_at: null,
  };
}

function buildNodeRow(nodeId, status) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: status,
  };
}

function createEvaluator(nodeId, activeNodeIds = [ACTIVE_NODE_ID]) {
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
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
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
          authorityAvailable: activeNodeIds.length > NUM.ZERO,
          canonicalStartupNodeIds: activeNodeIds,
        }),
      }),
      getLogger: () => console,
      getConfig: () => ({}),
    },
  });
}

test('Property 1 Bug Condition C: ' +
  'collectCanonicalInFlightReplicaOperationDetails SHALL exclude ' +
  'operations targeting warming nodes from inFlightOperations ' +
  '(uses collectCanonicalInFlightReplicaOperationDetails owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      fc.constantFrom(...WARMING_NODE_STATES),
      async (opCount, warmingState) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);
        const rows = [];
        for (let i = NUM.ZERO; i < opCount; i++) {
          rows.push(buildInFlightRow(
            `op-warm-${i}`, WARMING_NODE_A_ID, ACTIVE_NODE_ID,
          ));
        }
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
          buildNodeRow(WARMING_NODE_A_ID, warmingState),
          buildNodeRow(ACTIVE_NODE_ID, NODE_STATE.ACTIVE),
        ];
        const cache = createSystemTableCacheMock(rows, nodeRows);
        const result =
          evaluator.collectCanonicalInFlightReplicaOperationDetails(
            cache,
          );
        // Expected: warming-targeted ops excluded.
        // UNFIXED code FAILS — returns all non-self ops.
        assert.equal(
          result.inFlightOperations.length,
          NUM.ZERO,
          `expected 0 in-flight, got ${result.inFlightOperations.length}` +
          ` for ${opCount} op(s) targeting ${warmingState} node`,
        );
        assert.ok(
          result.excludedWarmingTargetCount > NUM.ZERO,
          `excludedWarmingTargetCount=${result.excludedWarmingTargetCount}` +
          ` expected > 0 for ${opCount} warming-targeted op(s)`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 1 Bug Condition C: ' +
  'evaluateCanonicalJoinTopologyReadiness SHALL return ready=true ' +
  'when ALL in-flight operations target warming nodes ' +
  '(uses evaluateCanonicalJoinTopologyReadiness owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      fc.constantFrom(...WARMING_NODE_STATES),
      async (opCount, warmingState) => {
        const evaluator = createEvaluator(JOINING_NODE_ID);
        const rows = [];
        for (let i = NUM.ZERO; i < opCount; i++) {
          rows.push(buildInFlightRow(
            `op-topo-${i}`, WARMING_NODE_A_ID, ACTIVE_NODE_ID,
          ));
        }
        const nodeRows = [
          buildNodeRow(JOINING_NODE_ID, NODE_STATE.JOINING),
          buildNodeRow(WARMING_NODE_A_ID, warmingState),
          buildNodeRow(ACTIVE_NODE_ID, NODE_STATE.ACTIVE),
        ];
        const cache = createSystemTableCacheMock(rows, nodeRows);
        const result =
          evaluator.evaluateCanonicalJoinTopologyReadiness(cache);
        // Expected: ready=true when only warming-targeted ops.
        // UNFIXED code FAILS — warming ops counted as blocking.
        assert.equal(
          result.inFlightReplicaOperations,
          NUM.ZERO,
          `inFlightReplicaOperations=${result.inFlightReplicaOperations}` +
          ` expected 0 for ${opCount} warming-targeted op(s)`,
        );
        assert.equal(
          result.ready,
          true,
          `ready=${result.ready} expected true when ` +
          `${opCount} op(s) target ${warmingState} node`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 1 Bug Condition C: ' +
  'circular dependency — two warming nodes each with operations ' +
  'targeting the other SHALL both evaluate as ready ' +
  '(uses evaluateCanonicalJoinTopologyReadiness owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...WARMING_NODE_STATES),
      fc.constantFrom(...WARMING_NODE_STATES),
      async (stateA, stateB) => {
        const evaluatorA = createEvaluator(WARMING_NODE_A_ID);
        const evaluatorB = createEvaluator(WARMING_NODE_B_ID);
        const nodeRows = [
          buildNodeRow(WARMING_NODE_A_ID, stateA),
          buildNodeRow(WARMING_NODE_B_ID, stateB),
          buildNodeRow(ACTIVE_NODE_ID, NODE_STATE.ACTIVE),
        ];
        const allOps = [
          buildInFlightRow(
            'op-a-to-b', WARMING_NODE_B_ID, WARMING_NODE_A_ID,
          ),
          buildInFlightRow(
            'op-b-to-a', WARMING_NODE_A_ID, WARMING_NODE_B_ID,
          ),
        ];
        const cacheA = createSystemTableCacheMock(allOps, nodeRows);
        const cacheB = createSystemTableCacheMock(allOps, nodeRows);
        const resultA =
          evaluatorA.evaluateCanonicalJoinTopologyReadiness(cacheA);
        const resultB =
          evaluatorB.evaluateCanonicalJoinTopologyReadiness(cacheB);
        // Expected: both nodes ready — warming-targeted ops
        // excluded from both perspectives.
        // UNFIXED code FAILS — circular deadlock.
        assert.equal(
          resultA.inFlightReplicaOperations,
          NUM.ZERO,
          `A: inFlight=${resultA.inFlightReplicaOperations}` +
          ` expected 0 (${stateA} -> ${stateB})`,
        );
        assert.equal(
          resultB.inFlightReplicaOperations,
          NUM.ZERO,
          `B: inFlight=${resultB.inFlightReplicaOperations}` +
          ` expected 0 (${stateB} -> ${stateA})`,
        );
        assert.equal(
          resultA.ready,
          true,
          `A: ready=${resultA.ready} expected true ` +
          `(${stateA} -> ${stateB})`,
        );
        assert.equal(
          resultB.ready,
          true,
          `B: ready=${resultB.ready} expected true ` +
          `(${stateB} -> ${stateA})`,
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});
