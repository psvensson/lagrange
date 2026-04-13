import {test} from '../../src/test-helpers/tap.js';
import {
  JoinReadinessEvaluator,
} from '../../src/bootstrap/join-readiness-evaluator.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

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
