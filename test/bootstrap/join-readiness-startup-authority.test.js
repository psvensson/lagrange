import {test} from '../../src/test-helpers/tap.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

const TEST_NOW_MS = 1234;
const TEST_JOINING_NODE_ID = 'joining-node';
const TEST_SEED_NODE_ID = 'seed-node';
const TEST_OTHER_NODE_ID = 'other-node';
const TEST_TABLE_NODES = 'nodes';
const TEST_ACTIVE_NODE_STATUS = 'active';
const TEST_COUNT_ZERO = 0;
const TEST_EMPTY_ROWS = Object.freeze([]);
const TEST_UNEXPECTED_READINESS_CALL =
  'startup authority should short-circuit readiness reads';

function createReadiness(eligible) {
  return {
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
        eligible,
    },
  };
}

test('JoinReadinessEvaluator prefers readiness-owned active cohort over nodes.status fallback', async (t) => {
  const evaluator = new JoinReadinessEvaluator({
    nodeId: 'joining-node',
    now: () => 1234,
    sleep: async () => {},
    delegates: {
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync(nodeId) {
          return createReadiness(nodeId === 'seed-node' || nodeId === 'joining-node');
        },
      }),
    },
  });

  const nodeIds = evaluator.getCanonicalJoinActiveNodeIds({
    getAll(tableName) {
      if (tableName !== 'nodes') {
        return [];
      }
      return [
        {node_id: 'seed-node', status: 'joining'},
        {node_id: 'joining-node', status: 'starting'},
        {node_id: 'other-node', status: 'active'},
      ];
    },
  });

  t.same(
    nodeIds,
    ['seed-node', 'joining-node'],
    'join readiness should consume readiness-owned startup eligibility instead of raw node status',
  );
  t.end();
});

test('JoinReadinessEvaluator falls back to readiness-owned startup authority snapshot, not bootstrap topology metadata', async (t) => {
  const evaluator = new JoinReadinessEvaluator({
    nodeId: 'joining-node',
    now: () => 1234,
    sleep: async () => {},
    delegates: {
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync() {
          return createReadiness(false);
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: ['seed-node', 'joining-node'],
          };
        },
      }),
      getBootstrapTopologySnapshotActiveNodeIds: () => ['wrong-node'],
    },
  });

  const nodeIds = evaluator.getCanonicalJoinActiveNodeIds({
    getAll(tableName) {
      if (tableName !== 'nodes') {
        return [];
      }
      return [
        {node_id: 'seed-node', status: 'joining'},
        {node_id: 'joining-node', status: 'joining'},
      ];
    },
  });

  t.same(
    nodeIds,
    ['seed-node', 'joining-node'],
    'join readiness should ignore bootstrap-topology active-node fallback for startup authority',
  );
  t.end();
});

test('JoinReadinessEvaluator does not rebuild startup authority from local node rows when readiness authority is unavailable', async (t) => {
  const evaluator = new JoinReadinessEvaluator({
    nodeId: 'joining-node',
    now: () => 1234,
    sleep: async () => {},
    delegates: {
      getBootstrapTopologySnapshotActiveNodeIds: () => ['wrong-node'],
    },
  });

  const nodeIds = evaluator.getCanonicalJoinActiveNodeIds({
    getAll(tableName) {
      if (tableName !== 'nodes') {
        return [];
      }
      return [
        {node_id: 'seed-node', status: 'active'},
        {node_id: 'joining-node', status: 'active'},
      ];
    },
  });

  t.same(
    nodeIds,
    [],
    'join readiness should not synthesize a competing startup cohort from raw node rows or bootstrap topology',
  );
  t.end();
});

test('JoinReadinessEvaluator does not read readiness cohorts when startup authority is available',
  async (t) => {
    let readinessReadCount = TEST_COUNT_ZERO;
    const evaluator = new JoinReadinessEvaluator({
      nodeId: TEST_JOINING_NODE_ID,
      now: () => TEST_NOW_MS,
      sleep: async () => {},
      delegates: {
        getControlPlaneReadinessService: () => ({
          getNodeReadinessSync() {
            readinessReadCount++;
            throw new Error(TEST_UNEXPECTED_READINESS_CALL);
          },
          getStartupAuthoritySnapshotSync() {
            return {
              authorityAvailable: true,
              canonicalStartupNodeIds: [TEST_SEED_NODE_ID, TEST_JOINING_NODE_ID],
            };
          },
        }),
      },
    });

    const nodeIds = evaluator.getCanonicalJoinActiveNodeIds({
      getAll(tableName) {
        if (tableName !== TEST_TABLE_NODES) {
          return TEST_EMPTY_ROWS;
        }
        return [
          {node_id: TEST_SEED_NODE_ID, status: TEST_ACTIVE_NODE_STATUS},
          {node_id: TEST_JOINING_NODE_ID, status: TEST_ACTIVE_NODE_STATUS},
          {node_id: TEST_OTHER_NODE_ID, status: TEST_ACTIVE_NODE_STATUS},
        ];
      },
    });

    t.same(
      nodeIds,
      [TEST_SEED_NODE_ID, TEST_JOINING_NODE_ID],
      'startup authority should be consumed before readiness cohort reads',
    );
    t.equal(readinessReadCount, TEST_COUNT_ZERO);
    t.end();
  });

test('JoinReadinessEvaluator prefers startup authority over partial readiness cohort', async (t) => {
  const evaluator = new JoinReadinessEvaluator({
    nodeId: 'joining-node',
    now: () => 1234,
    sleep: async () => {},
    delegates: {
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync(nodeId) {
          return createReadiness(nodeId === 'seed-node');
        },
        getStartupAuthoritySnapshotSync() {
          return {
            authorityAvailable: true,
            canonicalStartupNodeIds: ['seed-node', 'joining-node'],
          };
        },
      }),
    },
  });

  const nodeIds = evaluator.getCanonicalJoinActiveNodeIds({
    getAll(tableName) {
      if (tableName !== 'nodes') {
        return [];
      }
      return [
        {node_id: 'seed-node', status: 'active'},
        {node_id: 'joining-node', status: 'active'},
        {node_id: 'other-node', status: 'active'},
      ];
    },
  });

  t.same(
    nodeIds,
    ['seed-node', 'joining-node'],
    'join readiness should follow startup authority when readiness cohort is partial',
  );
  t.end();
});
