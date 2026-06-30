import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  EDGE_STATE,
  buildTopologyConvergenceGraphFromArtifacts,
} from '../../src/diagnostics/topology-convergence-graph.js';

const TEST_SCENARIO = 'fixture-readiness-support';
const TEST_EDGE_READINESS = 'readiness_startup_support';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_RECOVERY_PROTOCOL_STEADY_PUBLISHED = 'steady_published';
const TEST_ACTIVE_GATE_STATE_TIMED_OUT = 'timed_out';
const TEST_READINESS_FAILURE_MODE = 'startup';
const TEST_READINESS_FAILURE_CLASS = 'snapshot_reachability_timeout';
const TEST_READINESS_FAILURE_RECOVERABILITY = 'terminal';
const TEST_READINESS_FAILURE_CAUSE = 'snapshot_reachability_timeout';
const TEST_READINESS_FAILURE_SOURCE = 'selectedSnapshotReachabilityError';
const TEST_READINESS_SATISFIED_REASON = 'readiness_satisfied';
const TEST_READINESS_EVIDENCE_MISSING_REASON = 'evidence_missing';
const TEST_READINESS_SUPPORT_PATH_EXPLICIT = 'explicit_support_evidence';
const TEST_READINESS_SUPPORT_EVIDENCE_PATH = 'failureBundle.readiness';
const TEST_READINESS_FAILURE_EVIDENCE_PATH = 'summary.readinessFailure';
const TEST_NODE_A = 'node-a';
const TEST_NODE_B = 'node-b';
const TEST_ZERO_COUNT = 0;
const TEST_ONE_COUNT = 1;
const TEST_NEGATIVE_ONE_COUNT = -TEST_ONE_COUNT;
const TEST_EXPECTED_NODE_COUNT = 5;

test('topology convergence consumes explicit zero-reason readiness support',
  () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...buildBaseFailureBundle(),
        readiness: {
          lastReadinessTimelineEntry: {
            nodeReasonCountsByNodeId: {
              [TEST_NODE_A]: TEST_ZERO_COUNT,
              [TEST_NODE_B]: TEST_ZERO_COUNT,
            },
          },
        },
      },
    });
    const readinessEdge = findEdge(graph.edges, TEST_EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.SATISFIED);
    assert.deepEqual(
      readinessEdge.reasons,
      [TEST_READINESS_SATISFIED_REASON],
    );
    assert.equal(
      readinessEdge.evidencePath,
      TEST_READINESS_SUPPORT_EVIDENCE_PATH,
    );
    assert.equal(
      readinessEdge.source.supportPath,
      TEST_READINESS_SUPPORT_PATH_EXPLICIT,
    );
    assert.equal(readinessEdge.source.progressContract.state, 'satisfied');
    assert.equal(graph.frontier.length, TEST_ZERO_COUNT);
    assertNoNullOrUndefined(graph);
  });

test('topology convergence prefers readiness failure over explicit support',
  () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...buildBaseFailureBundle(),
        summary: {
          readinessFailure: buildReadinessFailure(),
        },
        readiness: {
          lastReadinessTimelineEntry: {
            nodeReasonCountsByNodeId: {
              [TEST_NODE_A]: TEST_ZERO_COUNT,
              [TEST_NODE_B]: TEST_ZERO_COUNT,
            },
          },
        },
      },
    });
    const readinessEdge = findEdge(graph.edges, TEST_EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.TERMINAL_FAILED);
    assert.equal(
      readinessEdge.evidencePath,
      TEST_READINESS_FAILURE_EVIDENCE_PATH,
    );
    assert.equal(
      readinessEdge.source.progressContract.evidencePath,
      TEST_READINESS_FAILURE_EVIDENCE_PATH,
    );
    assert.notEqual(
      readinessEdge.source.supportPath,
      TEST_READINESS_SUPPORT_PATH_EXPLICIT,
    );
    assertNoNullOrUndefined(graph);
  });

test('topology convergence rejects nonzero readiness support reason counts',
  () => {
    const graph = buildTopologyConvergenceGraphFromArtifacts({
      failureBundle: {
        ...buildBaseFailureBundle(),
        readiness: {
          lastReadinessTimelineEntry: {
            nodeReasonCountsByNodeId: {
              [TEST_NODE_A]: TEST_ONE_COUNT,
              [TEST_NODE_B]: TEST_NEGATIVE_ONE_COUNT,
            },
          },
        },
      },
    });
    const readinessEdge = findEdge(graph.edges, TEST_EDGE_READINESS);

    assert.equal(readinessEdge.state, EDGE_STATE.UNKNOWN);
    assert.deepEqual(
      readinessEdge.reasons,
      [TEST_READINESS_EVIDENCE_MISSING_REASON],
    );
    assert.equal(graph.summary.firstFrontierEdgeId, TEST_EDGE_READINESS);
    assertNoNullOrUndefined(graph);
  });

function buildBaseFailureBundle() {
  return {
    scenario: TEST_SCENARIO,
    summary: {},
    publicationConvergence: {
      publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
      pendingAckCount: TEST_ZERO_COUNT,
      blockedNodeCount: TEST_ZERO_COUNT,
      missingPublishedCount: TEST_ZERO_COUNT,
      recoveryProtocolState: TEST_RECOVERY_PROTOCOL_STEADY_PUBLISHED,
      prioritySpreadPending: false,
      activeGate: {
        state: TEST_ACTIVE_GATE_STATE_TIMED_OUT,
        ready: false,
        progress: {
          expectedNodeCount: TEST_EXPECTED_NODE_COUNT,
          snapshotCoverageNodeCount: TEST_EXPECTED_NODE_COUNT,
          snapshotCoverageComplete: true,
          priorityBlockedPartitionCount: TEST_ZERO_COUNT,
          priorityRecoveryProgressClasses: {
            unresolvedSemanticStateIds: [],
            blockedPartitionIds: [],
          },
          blockers: [],
        },
      },
    },
  };
}

function buildReadinessFailure() {
  return {
    mode: TEST_READINESS_FAILURE_MODE,
    classCode: TEST_READINESS_FAILURE_CLASS,
    recoverability: TEST_READINESS_FAILURE_RECOVERABILITY,
    cause: TEST_READINESS_FAILURE_CAUSE,
    source: TEST_READINESS_FAILURE_SOURCE,
  };
}

function findEdge(edges, edgeId) {
  return edges.find((edge) => edge.id === edgeId);
}

function assertNoNullOrUndefined(value) {
  assert.notEqual(value, null);
  assert.notEqual(value, undefined);
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoNullOrUndefined(item);
    }
    return;
  }
  if (typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      assertNoNullOrUndefined(childValue);
    }
  }
}
