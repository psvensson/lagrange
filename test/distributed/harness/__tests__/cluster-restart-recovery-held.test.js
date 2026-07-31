/**
 * CL-025 guard: a restarted node whose process dies right after the
 * readiness wait must FAIL the restart action, not be declared recovered.
 * Observed in stat-gate 085908Z-run2: the restarted node's admin API came up
 * 3s into boot (join-readiness still blocked), the single ready probe
 * passed, the process exited code 1, the after_ready boundary snapshot
 * failure was swallowed, and chaos declared the fault recovered 2s after
 * process exit — the rest of the scenario silently ran with two nodes down.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {createCluster} from './cluster-test-helpers.js';

const DYING_NODE_ID = 'node-dies-after-ready';
const READINESS_TIMEOUT_MS = 200;
const PROBES_BEFORE_DEATH = 3;
const ECONNREFUSED_ERROR = 'connect ECONNREFUSED 172.18.0.3:8081';

function buildDyingNode({probesBeforeDeath}) {
  let probeCount = 0;
  return {
    id: DYING_NODE_ID,
    closeQueryConnection() {},
    async getReachabilityDiagnostics() {
      probeCount += 1;
      if (probeCount > probesBeforeDeath) {
        throw new Error(ECONNREFUSED_ERROR);
      }
      return {
        nodeId: DYING_NODE_ID,
        reachable: true,
        reachableBy: 'bootstrap_health',
        adminReady: true,
        controlPlaneRecoveryReady: true,
        recoveryStage: 'control_plane_recovery_ready',
        recoveryStageRank: 2,
        startupRuntimeHandoff: {
          ready: true,
          infrastructureJoinComplete: true,
          canonicalAuthorityConsumed: true,
          transactionRecoveryReady: true,
          transactionRecoveryState: 'completed',
        },
        lastError: null,
      };
    },
    getProbeCount() {
      return probeCount;
    },
  };
}

function stubRestartPlumbing(cluster, node) {
  cluster._nodes.set(DYING_NODE_ID, node);
  cluster._sleep = async () => {};
  cluster._collectFailureLogs = async () => {};
  cluster._chaos = {
    async stopNode() {},
    async startNode() {},
  };
  cluster._waitForRestartShutdownBoundary = async () => {};
  cluster._recordRestartBoundarySnapshot = async () => {};
}

test('Unit: restartNode fails when the node dies right after readiness',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: READINESS_TIMEOUT_MS,
        restartRecoveryHoldRecheckMs: 100,
      },
    });
    const node = buildDyingNode({probesBeforeDeath: PROBES_BEFORE_DEATH});
    stubRestartPlumbing(cluster, node);

    await assert.rejects(
      () =>
        cluster._restartNodeWithObservation(DYING_NODE_ID, {
          readinessTimeoutMs: READINESS_TIMEOUT_MS,
          requireAdminReady: true,
        }),
      (error) => {
        assert.match(
          String(error?.message),
          /lost recovery readiness after the post-restart boundary/,
          'restart must fail via the post-boundary recovery-held assertion',
        );
        return true;
      },
      'a node that dies after the readiness wait must fail the restart',
    );
  });

test('Unit: restartNode succeeds when readiness holds through the boundary',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        nodeStartup: READINESS_TIMEOUT_MS,
        restartRecoveryHoldRecheckMs: 100,
      },
    });
    const node = buildDyingNode({probesBeforeDeath: Number.MAX_SAFE_INTEGER});
    stubRestartPlumbing(cluster, node);

    await cluster._restartNodeWithObservation(DYING_NODE_ID, {
      readinessTimeoutMs: READINESS_TIMEOUT_MS,
      requireAdminReady: true,
    });

    assert.ok(
      node.getProbeCount() >= 4,
      'recovery must be proven by consecutive probes in the wait AND the ' +
        'post-boundary recheck (observed ' +
        node.getProbeCount() +
        ' probes)',
    );
  });

test('Unit: a single transient ready probe is not recovery', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      nodeStartup: READINESS_TIMEOUT_MS,
      restartRecoveryHoldRecheckMs: 100,
    },
  });
  // Exactly one ready probe, then dead: the consecutive-probe requirement
  // must keep the readiness WAIT itself from succeeding.
  const node = buildDyingNode({probesBeforeDeath: 1});
  stubRestartPlumbing(cluster, node);

  await assert.rejects(
    () =>
      cluster._waitForNodeAdminReadiness(DYING_NODE_ID, {
        readinessTimeoutMs: READINESS_TIMEOUT_MS,
        requireAdminReady: true,
      }),
    /did not become recovery-ready/,
    'one ready probe followed by death must not satisfy the readiness wait',
  );
});

test('Unit: provisional admin reachability is not restart recovery', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      nodeStartup: READINESS_TIMEOUT_MS,
    },
  });
  cluster._nodes.set(DYING_NODE_ID, {
    id: DYING_NODE_ID,
    async getReachabilityDiagnostics() {
      return {
        nodeId: DYING_NODE_ID,
        reachable: true,
        reachableBy: 'admin_health',
        adminReady: true,
        controlPlaneRecoveryReady: false,
        startupRuntimeHandoff: {
          ready: false,
          infrastructureJoinComplete: false,
          canonicalAuthorityConsumed: false,
          transactionRecoveryReady: false,
          transactionRecoveryState: 'not_started',
        },
      };
    },
  });
  cluster._sleep = async () => {};
  cluster._collectFailureLogs = async () => {};

  await assert.rejects(
    () =>
      cluster._waitForNodeAdminReadiness(DYING_NODE_ID, {
        readinessTimeoutMs: READINESS_TIMEOUT_MS,
        requireAdminReady: true,
      }),
    /did not become recovery-ready/,
    'admin reachability without authority and recovery must stay blocked',
  );
});
