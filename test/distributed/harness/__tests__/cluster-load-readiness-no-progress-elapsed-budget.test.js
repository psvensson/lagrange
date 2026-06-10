/**
 * TIME-based no-progress budget for waitForLoadReadinessStability.
 *
 * The attempts-based budget conflates wall time when probe latency varies
 * (1s healthy vs ~16s under failure), so it is explicitly disabled by the
 * rolling-restart promotion gate and never fires under failure. The elapsed
 * budget has one meaning in both regimes: a wait that makes ZERO
 * strictly-better progress for the configured window is frozen and exits
 * through the existing stalled path (same record, same classification).
 * Default OFF — no behavior change unless configured.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {createCluster} from './cluster-test-helpers.js';

const STAGE_LOAD_READINESS = 'scenario.load-readiness.waiting';
const PROBE_DURATION_MS = 25;
const FROZEN_ELAPSED_BUDGET_MS = 120;
const FULL_TIMEOUT_MS = 30000;
const SHORT_TIMEOUT_MS = 450;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProbeResult({activeNodeCount, nodeCount}) {
  const nodeDiagnostics = [];
  for (let i = 0; i < nodeCount; i += 1) {
    nodeDiagnostics.push({
      nodeId: `node-${i}`,
      active: i < activeNodeCount,
      state: i < activeNodeCount ? 'active' : 'inactive',
      reasons: i < activeNodeCount ? [] : ['publication_pending'],
    });
  }
  return {
    allActive: false,
    nodeDiagnostics,
    snapshotCoverage: {
      completeCoverage: false,
      expectedNodeCount: nodeCount,
      bestCoverageNodeCount: activeNodeCount,
      selectedNodeId: 'node-0',
      selectedAdminReady: true,
    },
    publicationConvergenceGate: {
      ready: false,
      reasons: ['publication_pending_ack=1'],
      pendingAckNodeIds: ['node-0'],
      missingPublishedNodeIds: [],
    },
  };
}

function buildHarnessCluster() {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  cluster._sleep = async () => {};
  cluster._collectFailureLogs = async () => {};
  const recordedStages = [];
  cluster._recordClusterStage = (stage, details = {}) => {
    recordedStages.push({stage, details});
  };
  return {cluster, recordedStages};
}

test('elapsed no-progress budget cuts a frozen load-readiness wait early ' +
  'through the existing stalled path', async () => {
  const {cluster, recordedStages} = buildHarnessCluster();
  const frozenResult = buildProbeResult({activeNodeCount: 1, nodeCount: 3});
  cluster._probeClusterActiveState = async () => {
    await sleep(PROBE_DURATION_MS);
    return frozenResult;
  };

  const startedAt = Date.now();
  await assert.rejects(
    async () => cluster.waitForLoadReadinessStability({
      stableWindowMs: 50,
      timeoutMs: FULL_TIMEOUT_MS,
      noProgressMaxAttempts: 0,
      noProgressMaxElapsedMs: FROZEN_ELAPSED_BUDGET_MS,
      loadReadinessPhase: 'pre_load',
    }),
    (error) => {
      assert.match(error.message, /no progress|stalled/i,
        'frozen wait should exit via the stalled error');
      assert.strictEqual(
        error?.diagnostics?.noProgress?.noProgressTrigger,
        'elapsed',
        'the stalled diagnostics must attribute the cut to the elapsed budget');
      return true;
    },
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < FULL_TIMEOUT_MS / 10,
    `frozen wait should exit early (took ${elapsed}ms of ` +
    `${FULL_TIMEOUT_MS}ms budget)`);

  const stalledStage = recordedStages.find((entry) =>
    entry.stage === STAGE_LOAD_READINESS &&
    entry.details?.activeGate?.state === 'stalled');
  assert.ok(stalledStage,
    'early exit must record the same stalled active-gate details');
  assert.match(
    String(stalledStage.details?.activeGate?.stalledReason || ''),
    /active_wait_no_progress_elapsed_ms=\d+/,
    'the stalled record must attribute the cut to the elapsed budget');
});

test('elapsed no-progress budget is OFF by default — frozen wait runs the ' +
  'full timeout', async () => {
  const {cluster, recordedStages} = buildHarnessCluster();
  const frozenResult = buildProbeResult({activeNodeCount: 1, nodeCount: 3});
  cluster._probeClusterActiveState = async () => {
    await sleep(PROBE_DURATION_MS);
    return frozenResult;
  };

  const startedAt = Date.now();
  await assert.rejects(
    async () => cluster.waitForLoadReadinessStability({
      stableWindowMs: 50,
      timeoutMs: SHORT_TIMEOUT_MS,
      noProgressMaxAttempts: 0,
      loadReadinessPhase: 'pre_load',
    }),
    (error) => {
      assert.match(error.message, /did not stabilize within/,
        'without a budget the wait must time out, not stall-exit');
      return true;
    },
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= SHORT_TIMEOUT_MS,
    `wait should consume the full timeout (took ${elapsed}ms)`);
  const stalledStage = recordedStages.find((entry) =>
    entry.details?.activeGate?.state === 'stalled');
  assert.strictEqual(stalledStage, undefined,
    'no stalled record without a configured budget');
});

test('elapsed no-progress budget never cuts a progressing wait', async () => {
  const {cluster, recordedStages} = buildHarnessCluster();
  const nodeCount = 64;
  let activeNodeCount = 0;
  cluster._probeClusterActiveState = async () => {
    await sleep(PROBE_DURATION_MS);
    // Strictly better progress on every probe — the budget clock resets
    // each time, so the wait must reach its timeout, never the stall exit.
    activeNodeCount = Math.min(nodeCount - 1, activeNodeCount + 1);
    return buildProbeResult({activeNodeCount, nodeCount});
  };

  await assert.rejects(
    async () => cluster.waitForLoadReadinessStability({
      stableWindowMs: 50,
      timeoutMs: SHORT_TIMEOUT_MS,
      noProgressMaxAttempts: 0,
      noProgressMaxElapsedMs: FROZEN_ELAPSED_BUDGET_MS,
      loadReadinessPhase: 'pre_load',
    }),
    (error) => {
      assert.match(error.message, /did not stabilize within/,
        'progressing wait must reach its timeout, not the stall exit');
      return true;
    },
  );
  const stalledStage = recordedStages.find((entry) =>
    entry.details?.activeGate?.state === 'stalled');
  assert.strictEqual(stalledStage, undefined,
    'a wait that keeps making progress must never be cut by the budget');
});
