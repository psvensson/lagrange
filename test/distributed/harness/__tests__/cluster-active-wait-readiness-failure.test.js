import assert from 'node:assert';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  buildTopologyConvergenceGraph,
} from '../../../../src/diagnostics/topology-convergence-graph.js';
import {
  buildActiveWaitReadinessFailure,
} from '../cluster-segment-7-alpha-active-wait.js';

const LOAD_MODE = 'load';
const STARTUP_MODE = 'startup';
const SNAPSHOT_TIMEOUT_CLASS = 'snapshot_timeout';
const SNAPSHOT_TIMEOUT_SOURCE = 'selectedSnapshotError';
const SUPPORT_PENDING_CLASS = 'startup_support_pending';
const SUPPORT_PROGRESS_SOURCE = 'activeGateProgress';
const SUPPORT_INACTIVE_CAUSE = 'inactive_nodes';
const NO_PROGRESS_REASON = 'stalled_no_progress';
const READINESS_EDGE_ID = 'readiness_startup_support';
const READINESS_STATE_RETRYABLE = 'retryable';
const READINESS_SUPPORT_PATH_FAILURE = 'readiness_failure';
const READINESS_INHERITED_REASON =
  'readiness_inherited_active_gate_no_progress';
const SNAPSHOT_TIMEOUT_ERROR =
  'Admin API query timed out for node seed-a on lane snapshot after 2500ms';

function buildSelectedSnapshotTimeoutDelay() {
  return {
    timedOut: true,
    cause: SNAPSHOT_TIMEOUT_CLASS,
    source: SNAPSHOT_TIMEOUT_SOURCE,
    recoverability: 'recoverable',
    error: SNAPSHOT_TIMEOUT_ERROR,
  };
}

function buildNoProgress(currentProgress, overrides = {}) {
  return {
    reasonCode: NO_PROGRESS_REASON,
    stalled: false,
    readinessDelay: buildSelectedSnapshotTimeoutDelay(),
    currentProgress,
    ...overrides,
  };
}

test('Unit: load readiness failure surfaces inactive startup support after complete snapshot coverage',
  async () => {
    const readinessFailure = buildActiveWaitReadinessFailure({
      mode: LOAD_MODE,
      noProgress: buildNoProgress({
        expectedNodeCount: 5,
        activeNodeCount: 4,
        inactiveNodeCount: 1,
        snapshotCoverageNodeCount: 5,
        snapshotCoverageComplete: true,
        blockers: ['inactive_nodes=1', 'snapshot_error'],
        selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
        readinessDelay: buildSelectedSnapshotTimeoutDelay(),
      }),
      attemptsSinceProgress: 11,
      maxAttempts: null,
    });

    assert.equal(readinessFailure.classCode, SUPPORT_PENDING_CLASS);
    assert.equal(readinessFailure.source, SUPPORT_PROGRESS_SOURCE);
    assert.equal(readinessFailure.cause, SUPPORT_INACTIVE_CAUSE);
    assert.equal(readinessFailure.error, null);
    assert.equal(readinessFailure.terminalReason, NO_PROGRESS_REASON);

    const graph = buildTopologyConvergenceGraph({
      scenarios: [{
        readinessFailure,
        publicationConvergence: {
          activeGate: {
            ready: false,
            state: 'timed_out',
            progress: {
              snapshotCoverageComplete: true,
              snapshotCoverageNodeCount: 5,
              expectedNodeCount: 5,
              selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
            },
          },
        },
      }],
    });
    const readinessEdge = graph.edges.find((edge) =>
      edge.id === READINESS_EDGE_ID,
    );

    assert.equal(readinessEdge.state, READINESS_STATE_RETRYABLE);
    assert.equal(
      readinessEdge.source.supportPath,
      READINESS_SUPPORT_PATH_FAILURE,
    );
    assert.equal(
      readinessEdge.reasons.includes(READINESS_INHERITED_REASON),
      false,
    );
  },
);

test('Unit: readiness failure preserves snapshot timeout while coverage is incomplete',
  async () => {
    const readinessFailure = buildActiveWaitReadinessFailure({
      mode: LOAD_MODE,
      noProgress: buildNoProgress({
        expectedNodeCount: 5,
        activeNodeCount: 4,
        inactiveNodeCount: 1,
        snapshotCoverageNodeCount: 4,
        snapshotCoverageComplete: false,
        blockers: ['inactive_nodes=1', 'snapshot_coverage=4/5'],
        selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
      }),
      attemptsSinceProgress: 11,
      maxAttempts: null,
    });

    assert.equal(readinessFailure.classCode, SNAPSHOT_TIMEOUT_CLASS);
    assert.equal(readinessFailure.source, SNAPSHOT_TIMEOUT_SOURCE);
    assert.equal(readinessFailure.cause, SNAPSHOT_TIMEOUT_CLASS);
    assert.equal(readinessFailure.error, SNAPSHOT_TIMEOUT_ERROR);
  });

test('Unit: startup readiness failure preserves selected snapshot timeout',
  async () => {
    const readinessFailure = buildActiveWaitReadinessFailure({
      mode: STARTUP_MODE,
      noProgress: buildNoProgress({
        expectedNodeCount: 5,
        activeNodeCount: 4,
        inactiveNodeCount: 1,
        snapshotCoverageNodeCount: 5,
        snapshotCoverageComplete: true,
        blockers: ['inactive_nodes=1', 'snapshot_error'],
        selectedSnapshotError: SNAPSHOT_TIMEOUT_ERROR,
      }),
      attemptsSinceProgress: 11,
      maxAttempts: null,
    });

    assert.equal(readinessFailure.classCode, SNAPSHOT_TIMEOUT_CLASS);
    assert.equal(readinessFailure.source, SNAPSHOT_TIMEOUT_SOURCE);
    assert.equal(readinessFailure.cause, SNAPSHOT_TIMEOUT_CLASS);
    assert.equal(readinessFailure.error, SNAPSHOT_TIMEOUT_ERROR);
  });
