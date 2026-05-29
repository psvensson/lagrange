import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_STATE,
  buildTopologyConvergenceGraphFromArtifacts,
} from '../../src/diagnostics/topology-convergence-graph.js';

const TEST_SCENARIO = 'rolling-restart';
const TEST_SELECTED_NODE_ID = 'node-selected';
const TEST_EDGE_ACTIVE_GATE_SNAPSHOT_COVERAGE =
  'active_gate_snapshot_coverage';
const TEST_SELECTED_SNAPSHOT_TIMEOUT_ERROR =
  'Admin API query timed out for node node-selected on lane snapshot after 100ms';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE = 'repair_deferred';
const TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE = 'deferred_refresh';
const TEST_SELECTED_SNAPSHOT_CONTRACT_STATE = 'deferred';
const TEST_SELECTED_SNAPSHOT_NEXT_ACTION = 'retry';
const TEST_SELECTED_SNAPSHOT_REASON = 'selected_timeout';
const TEST_HANDOFF_STATE_PENDING = 'pending';
const TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING =
  'owner_reconcile_pending';
const TEST_HANDOFF_ACTION_WAIT_OWNER_RECOVERY = 'wait_owner_recovery';
const TEST_HANDOFF_OUTCOME_WRITE_DEFERRED = 'write_deferred';
const TEST_BOOLEAN_FALSE = 'false';
const TEST_DOMINANT_REASON_SNAPSHOT_COVERAGE_INCOMPLETE =
  'snapshot_coverage_incomplete';
const TEST_RUNTIME_PROMOTION_GUARD_FIELD = 'runtimePromotionGuard';
const TEST_EXPECTED_NODE_COUNT = 5;
const TEST_COVERED_NODE_COUNT = 1;
const TEST_SELECTED_SNAPSHOT_TIMEOUT_MS = 100;
const TEST_PENDING_RECOVERY_COUNT = 1;
const TEST_MISSING_PROPERTY = false;

function findActiveGateSnapshotEdge(graph) {
  return graph.edges.find((edge) =>
    edge.id === TEST_EDGE_ACTIVE_GATE_SNAPSHOT_COVERAGE);
}

test('topology convergence maps selected-snapshot retry to active-gate handoff route',
  () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        scenario: TEST_SCENARIO,
        summary: {
          dominantReason:
            TEST_DOMINANT_REASON_SNAPSHOT_COVERAGE_INCOMPLETE,
        },
        controlPlane: {
          activeGateSnapshotCoverage: {
            snapshotCoverageComplete: false,
            snapshotCoverageNodeCount: TEST_COVERED_NODE_COUNT,
            expectedNodeCount: TEST_EXPECTED_NODE_COUNT,
            selectedSnapshotNodeId: TEST_SELECTED_NODE_ID,
            selectedSnapshotError: TEST_SELECTED_SNAPSHOT_TIMEOUT_ERROR,
            selectedSnapshotTimeoutMs: TEST_SELECTED_SNAPSHOT_TIMEOUT_MS,
            selectedSnapshotObservationMode:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_MODE,
            selectedSnapshotObservationState:
              TEST_SELECTED_SNAPSHOT_OBSERVATION_STATE,
            selectedSnapshotObservationContractState:
              TEST_SELECTED_SNAPSHOT_CONTRACT_STATE,
            selectedSnapshotObservationNextAction:
              TEST_SELECTED_SNAPSHOT_NEXT_ACTION,
            selectedSnapshotObservationReasonCodes: [
              TEST_SELECTED_SNAPSHOT_REASON,
            ],
            selectedSnapshotRepairDeferred: true,
          },
        },
      },
    });
    const snapshotEdge = findActiveGateSnapshotEdge(graph);

    assert.equal(snapshotEdge.state, EDGE_STATE.DEFERRED);
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffState,
      TEST_HANDOFF_STATE_PENDING,
    );
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffReasonCode,
      TEST_HANDOFF_REASON_OWNER_RECONCILE_PENDING,
    );
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffNextAction,
      TEST_HANDOFF_ACTION_WAIT_OWNER_RECOVERY,
    );
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffRuntimePromotionAllowed,
      TEST_BOOLEAN_FALSE,
    );
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffPendingRecoveryCount,
      TEST_PENDING_RECOVERY_COUNT,
    );
    assert.equal(
      snapshotEdge.source.publicationActiveGateHandoffPendingRecoveryNodeIds,
      TEST_SELECTED_NODE_ID,
    );
    assert.equal(
      snapshotEdge.source.membershipPublicationHandoffOutcomeState,
      TEST_HANDOFF_OUTCOME_WRITE_DEFERRED,
    );
    assert.equal(
      Object.hasOwn(
        snapshotEdge.source,
        TEST_RUNTIME_PROMOTION_GUARD_FIELD,
      ),
      TEST_MISSING_PROPERTY,
    );
  });
