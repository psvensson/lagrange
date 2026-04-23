/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import http from 'node:http';
import assert from 'node:assert';
import {promises as fs} from 'node:fs';
import {resolve as resolvePath} from 'node:path';
import fc from 'fast-check';
import {validate as uuidValidate} from 'uuid';
import {WebSocketServer} from 'ws';
import {
  ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS,
  ADMIN_QUERY_TRACE_TIMEOUT_TEST_MS,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_REASON_SNAPSHOT_UNAVAILABLE,
  BENCHMARK_CRITICAL_CONTROL_PLANE_STABILITY_STATE,
  BENCHMARK_DEGRADATION_STATE,
  BENCHMARK_LOAD_ADMISSION_STATE,
  buildCriticalSystemDiscoverySnapshot,
  Cluster,
  CONTAINER_ALREADY_STOPPED_ERROR_MESSAGE,
  CONTAINER_ENV_KEYS,
  createCluster,
  distributeNodes,
  ENTRYPOINT_ENV,
  LABELS,
  LOAD_STOP_DISPATCH_SETTLE_MS,
  LOAD_STOP_WAIT_TIMEOUT_MS,
  NodeHandle,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_CLIENT_SERVICE_DISCOVERY_SQL,
  NODE_CLIENT_SERVICE_ID_ADMIN_META,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  NODE_ROLES,
  PLAYBACK_EVENT_TYPE,
  PORTS,
  RAFT_PROVIDER_DEFAULTS,
} from './cluster-test-helpers.js';

const REUSE_START_COMMAND =
  'if [ -f /harness-control/reset-data-on-start ]; then rm -rf /data/* && ' +
  'rm -f /harness-control/reset-data-on-start; fi; ' +
  'exec node --max-old-space-size=1536 /app/src/index.js';

/**
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * *For any* cluster configuration with `docker.hosts` of length H and
 * `nodesPerHost` limit P, no single Docker host SHALL have more than P
 * containers, and the total container count SHALL equal the requested
 * cluster size (up to H * P).
 *
 * **Validates: Requirements 2.3**
 */
test('Unit: _waitForAllActive rejects CL-006 witness when only reachability is transient',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 2,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    cluster._recordClusterStage = () => {};

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
          reasons: [],
        }, {
          nodeId: 'joiner-2',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: 3,
          bestCoverageNodeCount: 2,
          selectedNodeId: 'seed-1',
          selectedAdminReady: false,
          selectedReachableBy: null,
          selectedReachabilityError:
            'Control snapshot reachability probe timed out for seed-1',
          selectedPublicationConvergence: {
            publicationEpoch: 2,
            publicationStatus: 'PUBLISHED',
            publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            pendingAckNodeIds: [],
            priorityPartitionSummary: null,
          },
          selectedPublishedActiveNodeIds: ['seed-1', 'joiner-1'],
          selectedMissingPublishedNodeIds: ['joiner-2'],
          selectedError: null,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: null,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
          error.message.includes('Not all nodes reached ACTIVE state within');
      },
      'startup publication-lag witness should timeout when reachability is weak',
    );
    assert.ok(
      timeoutError?.diagnostics?.noProgress,
      'startup timeout should carry final timeout diagnostics',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.classCode,
      'snapshot_reachability_timeout',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.recoverability,
      'terminal',
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.readinessFailure?.mode,
      'startup',
    );
    assert.equal(
      collectedFailureLogs,
      true,
      'startup publication-lag timeout should collect failure logs',
    );
  });

test('Unit: _probeClusterActiveState forwards forced repair to snapshot coverage',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes.set('node-a', {
      id: 'node-a',
      role: NODE_ROLES.SEED,
      async probeBootstrapReadiness() {
        return {
          ok: true,
          statusCode: 200,
          body: {status: 'ok'},
        };
      },
    });
    let forwardedOptions = null;
    cluster._probeControlSnapshotCoverage = async (_deadline, _nodeIds, options) => {
      forwardedOptions = options;
      return {
        completeCoverage: true,
        expectedNodeCount: 1,
        bestCoverageNodeCount: 1,
      };
    };

    const result = await cluster._probeClusterActiveState(
      Date.now() + 5000,
      {forceRepair: true},
    );

    assert.strictEqual(
      typeof result.allActive,
      'boolean',
      'cluster ACTIVE probe should still return a boolean result',
    );
    assert.strictEqual(
      forwardedOptions?.forceRepair,
      true,
      'cluster ACTIVE probe should forward forced repair to the snapshot coverage probe',
    );
  });

test('Unit: _waitForAllActive falls back to local snapshot reads after one forced repair attempt',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        activeWaitForceRepairAfter: 0,
      },
    });

    const forceRepairCalls = [];
    let warmedSnapshotCache = false;

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when ACTIVE wait succeeds');
    };
    cluster._probeClusterActiveState = async (_deadline, options = {}) => {
      const forceRepair = options?.forceRepair === true;
      forceRepairCalls.push(forceRepair);
      if (forceRepair) {
        warmedSnapshotCache = true;
        return {
          allActive: false,
          nodeDiagnostics: [],
          snapshotCoverage: null,
          publicationConvergenceGate: null,
          priorityRecoveryInvariants: {invariants: []},
        };
      }
      return {
        allActive: warmedSnapshotCache === true,
        nodeDiagnostics: [],
        snapshotCoverage: null,
        publicationConvergenceGate: null,
        priorityRecoveryInvariants: {invariants: []},
      };
    };

    await cluster._waitForAllActive();

    assert.deepEqual(
      forceRepairCalls,
      [true, false],
      'ACTIVE wait should issue one forced repair probe, then return to local snapshot reads',
    );
  });

test('Unit: _waitForAllActive times out when a node status probe hangs',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 40},
    });

    cluster._nodes.set('stuck-node', {
      id: 'stuck-node',
      role: NODE_ROLES.SEED,
      async getStatus() {
        return new Promise(() => {});
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};

    let timeoutId = null;
    try {
      await assert.rejects(
        async () => {
          await Promise.race([
            cluster._waitForAllActive(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error('waitForAllActive hung'));
              }, ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS);
            }),
          ]);
        },
        (error) => {
          assert.match(
            error.message,
            /Not all nodes reached ACTIVE state within/,
          );
          return true;
        },
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  });

test('Unit: _waitForAllActive forwards explicit readiness mode to ACTIVE probes',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const observedOptions = [];
    cluster._probeClusterActiveState = async (_deadline, options = {}) => {
      observedOptions.push({...options});
      return {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      };
    };

    await cluster._waitForAllActive({mode: 'load'});

    assert.strictEqual(
      observedOptions.length,
      1,
      'waitForAllActive should issue a single ACTIVE probe when the first probe succeeds',
    );
    assert.strictEqual(
      observedOptions[0].mode,
      'load',
      'waitForAllActive should forward the requested readiness mode to ACTIVE probes',
    );
  });

test('Unit: _waitForAllActive scales timeout budget for larger clusters',
  async () => {
    const cluster = createCluster({
      size: 7,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 40},
    });

    cluster._nodes.set('stuck-node', {
      id: 'stuck-node',
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return new Promise(() => {});
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};

    const startedAt = Date.now();
    let timeoutId = null;
    try {
      await assert.rejects(
        async () => {
          await Promise.race([
            cluster._waitForAllActive(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error('waitForAllActive hung'));
              }, ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS);
            }),
          ]);
        },
        /Not all nodes reached ACTIVE state within/,
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
    const elapsedMs = Date.now() - startedAt;
    assert.ok(
      elapsedMs >= 70,
      'scaled timeout should keep ACTIVE gate open longer for larger clusters',
    );
  });

test('Unit: _waitForAllActive exposes diagnostic summary on timeout',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {convergence: 30},
    });

    cluster._nodes.set('joining-node', {
      id: 'joining-node',
      role: NODE_ROLES.JOINER,
      async getStatus() {
        return {rows: [{status: 'joining'}]};
      },
      async getLogs(_options) {
        return '';
      },
    });
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };

    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster._waitForAllActive(),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /attempts=/, 'should include attempt count');
        assert.match(
          error.message,
          /nodeDiagnostics=/,
          'should include node-level diagnostics',
        );
        return true;
      },
    );
  });

test('Unit: _waitForAllActive load mode fails fast when ACTIVE progress stalls',
  async () => {
    const cluster = createCluster({
      size: 1,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 3,
      },
    });

    cluster._sleep = async () => {};
    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    cluster._probeClusterActiveState = async () => {
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 1,
          bestCoverageNodeCount: 1,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      };
    };

    await assert.rejects(
      async () => cluster._waitForAllActive({mode: 'load'}),
      (error) => {
        assert.match(
          error.message,
          /stalled with no meaningful progress/,
        );
        assert.equal(
          error?.diagnostics?.noProgress?.reasonCode,
          'stalled_no_progress',
        );
        assert.equal(
          error?.diagnostics?.noProgress?.failedNoProgress?.details
            ?.budgetAttempts,
          3,
        );
        return true;
      },
    );

    assert.equal(
      collectedFailureLogs,
      true,
      'should collect failure logs before surfacing no-progress stall errors',
    );
    assert.equal(
      recordedStages.some((entry) =>
        entry.stage === 'setup.cluster.waiting-active' &&
        entry.details?.activeGateNoProgress?.stalled === true),
      true,
      'stall diagnostics should be emitted into cluster-stage playback details',
    );
  });

test('Unit: _waitForAllActive load mode resets no-progress budget after progress',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 500,
        activeWaitNoProgressMaxAttempts: 3,
      },
    });

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when ACTIVE wait succeeds');
    };

    const progressSamples = [
      {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: ['joiner-1'],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: ['joiner-1'],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      },
      {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: 1,
              totalSpreadGap: 1,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: ['priority_control_plane_spread_pending'],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: 1,
            totalSpreadGap: 1,
          },
        },
      },
      {
        allActive: true,
        nodeDiagnostics: [{
          nodeId: 'seed-1',
          active: true,
          state: 'active',
        }, {
          nodeId: 'joiner-1',
          active: true,
          state: 'active',
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: 2,
          bestCoverageNodeCount: 2,
          selectedPublicationConvergence: {
            publicationStatus: 'PUBLISHED',
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: 0,
              totalSpreadGap: 0,
            },
          },
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: 'PUBLISHED',
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: 0,
            totalSpreadGap: 0,
          },
        },
      },
    ];
    let probeCallCount = 0;
    cluster._probeClusterActiveState = async () => {
      const sample = progressSamples[Math.min(
        probeCallCount,
        progressSamples.length - 1,
      )];
      probeCallCount += 1;
      return sample;
    };

    await cluster._waitForAllActive({mode: 'load'});

    assert.equal(
      probeCallCount,
      3,
      'ACTIVE wait should allow progress updates to reset no-progress budget',
    );
  });

test('Unit: _waitForAllActive load mode fails directly on priority-recovery' +
  ' invariant breaches', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    timeouts: {
      convergence: 200,
      activeWaitNoProgressMaxAttempts: 50,
    },
  });

  cluster._sleep = async () => {};
  let collectedFailureLogs = false;
  cluster._collectFailureLogs = async () => {
    collectedFailureLogs = true;
  };

  cluster._probeClusterActiveState = async () => {
    return {
      allActive: false,
      nodeDiagnostics: [{
        nodeId: 'seed-1',
        active: true,
        state: 'active',
      }],
      snapshotCoverage: {
        completeCoverage: true,
        expectedNodeCount: 1,
        bestCoverageNodeCount: 1,
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: ['priority_control_plane_spread_pending'],
      },
      priorityRecoveryInvariants: {
        invariants: [{
          id: 'priority_recovery_readyz_closed_during_priority_recovery',
          invariantId:
            'priority_recovery_readyz_closed_during_priority_recovery',
          reasonCode: 'priority_recovery_readyz_not_closed_during_priority_recovery',
          severity: 'error',
          scope: 'cluster',
          owningSubsystem: 'distributed_harness_cluster_active_gate',
          passed: false,
          details: {
            mode: 'load',
            prioritySpreadPending: true,
            trafficBlockedNodeIds: [],
          },
        }],
        failingInvariantIds: [
          'priority_recovery_readyz_closed_during_priority_recovery',
        ],
        failingInvariantReasonCodes: [
          'priority_recovery_readyz_not_closed_during_priority_recovery',
        ],
        passed: false,
      },
    };
  };

  await assert.rejects(
    async () => cluster._waitForAllActive({mode: 'load'}),
    (error) => {
      assert.match(error.message, /invariant breach/);
      assert.equal(
        error?.diagnostics?.reasonCode,
        'priority_recovery_invariant_breach',
      );
      assert.equal(
        error?.diagnostics?.invariantBreaches?.hardCount,
        1,
      );
      assert.equal(
        error?.diagnostics?.invariantBreaches?.hardBreaches?.[0]?.reasonCode,
        'priority_recovery_readyz_not_closed_during_priority_recovery',
      );
      return true;
    },
  );

  assert.equal(
    collectedFailureLogs,
    true,
    'should collect failure logs before surfacing invariant breach errors',
  );
});

test('Unit: waitForLoadReadinessStability requires a sustained ACTIVE window',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const readinessSamples = [
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: false,
        nodeDiagnostics: [{nodeId: 'node-b', active: false, state: 'warming'}],
        snapshotCoverage: {completeCoverage: false},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
      {
        allActive: true,
        nodeDiagnostics: [],
        snapshotCoverage: {completeCoverage: true},
      },
    ];
    let probeCallCount = 0;
    cluster._probeClusterActiveState = async () => {
      const sample = readinessSamples[Math.min(
        probeCallCount,
        readinessSamples.length - 1,
      )];
      probeCallCount += 1;
      return sample;
    };
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when stability succeeds');
    };

    await cluster.waitForLoadReadinessStability({
      stableWindowMs: 2,
      timeoutMs: 50,
    });

    assert.ok(
      probeCallCount >= 4,
      'stability window should restart when readiness briefly regresses',
    );
  });

test('Unit: waitForControlPlaneQuiescence waits for replica operations to ' +
  'drain and leadership to stay stable', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  let probeCallCount = 0;
  const snapshots = [
    {
      rows: [{
        capturedAt: 1,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 2,
          partitionGroupInFlight: {groupA: 2},
          operationTimelineById: {
            op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
          },
        },
      }],
    },
    {
      rows: [{
        capturedAt: 2,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
    {
      rows: [{
        capturedAt: 3,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
    {
      rows: [{
        capturedAt: 4,
        leaders: {partitions: 'seed-a'},
        replicaOperations: {
          inFlightCount: 0,
          partitionGroupInFlight: {},
          operationTimelineById: {},
        },
      }],
    },
  ];

  cluster._nodes = new Map([['seed-a', {
    id: 'seed-a',
    role: NODE_ROLES.SEED,
    async getControlSnapshot() {
      const snapshot = snapshots[Math.min(
        probeCallCount,
        snapshots.length - 1,
      )];
      probeCallCount += 1;
      return snapshot;
    },
    async getLogs() {
      return '';
    },
  }]]);
  cluster._sleep = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  };
  cluster._collectFailureLogs = async () => {
    throw new Error('should not collect failure logs when quiescence succeeds');
  };

  const result = await cluster.waitForControlPlaneQuiescence({
    stableWindowMs: 2,
    timeoutMs: 50,
    noProgressTimeoutMs: 25,
    maxInFlightCount: 0,
  });

  assert.equal(result.inFlightCount, 0);
  assert.ok(
    probeCallCount >= 3,
    'quiescence gate should keep polling until the stable window completes',
  );
});

test('Unit: waitForControlPlaneQuiescence surfaces timeout diagnostics',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        return {
          rows: [{
            capturedAt: Date.now(),
            leaders: {partitions: 'seed-a'},
            replicaOperations: {
              inFlightCount: 1,
              partitionGroupInFlight: {groupA: 1},
              operationTimelineById: {
                op1: [{step: 'PENDING', status: 'ACTIVE', inFlight: true}],
              },
            },
          }],
        };
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster.waitForControlPlaneQuiescence({
        stableWindowMs: 2,
        timeoutMs: 15,
        maxInFlightCount: 0,
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /Control plane did not quiesce/i);
        assert.match(error.message, /inFlightCount=1/i);
        return true;
      },
    );
  });

test(
  'Unit: waitForControlPlaneQuiescence waits for critical system table spread',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let controlSnapshotCallCount = 0;
    let discoveryCallCount = 0;
    const controlSnapshots = [
      {
        rows: [{
          capturedAt: 1,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 2,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 3,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
      {
        rows: [{
          capturedAt: 4,
          leaders: {partitions: 'seed-a'},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      },
    ];
    const discoverySnapshots = [
      buildCriticalSystemDiscoverySnapshot(['seed-a'], 1),
      buildCriticalSystemDiscoverySnapshot(['seed-a'], 2),
      buildCriticalSystemDiscoverySnapshot(
        ['seed-a', 'node-b', 'node-c'],
        3,
      ),
      buildCriticalSystemDiscoverySnapshot(
        ['seed-a', 'node-b', 'node-c'],
        4,
      ),
    ];

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        const snapshot = controlSnapshots[Math.min(
          controlSnapshotCallCount,
          controlSnapshots.length - 1,
        )];
        controlSnapshotCallCount += 1;
        return snapshot;
      },
      async queryWithTimeout(sql) {
        assert.match(
          sql,
          /service_discovery_local\('replica_operations'\)/,
          'critical spread probe should query the requested control-plane table',
        );
        const snapshot = discoverySnapshots[Math.min(
          discoveryCallCount,
          discoverySnapshots.length - 1,
        )];
        discoveryCallCount += 1;
        return snapshot;
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {
      throw new Error('should not collect failure logs when quiescence succeeds');
    };

    const result = await cluster.waitForControlPlaneQuiescence({
      stableWindowMs: 2,
      timeoutMs: 50,
      noProgressTimeoutMs: 25,
      maxInFlightCount: 0,
      requireCriticalSystemSpread: true,
      criticalSystemTableNames: ['replica_operations'],
      criticalSystemRequiredDistinctNodeCount: 3,
    });

    assert.equal(result.inFlightCount, 0);
    assert.ok(
      discoveryCallCount >= 3,
      'quiescence should keep polling until critical control-plane replicas spread across distinct nodes',
    );
  },
);

test(
  'Unit: waitForControlPlaneQuiescence timeout diagnostics include critical system spread gaps',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    cluster._nodes = new Map([['seed-a', {
      id: 'seed-a',
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        return {
          rows: [{
            capturedAt: Date.now(),
            leaders: {partitions: 'seed-a'},
            replicaOperations: {
              inFlightCount: 0,
              partitionGroupInFlight: {},
              operationTimelineById: {},
            },
          }],
        };
      },
      async queryWithTimeout(sql) {
        assert.match(
          sql,
          /service_discovery_local\('replica_operations'\)/,
        );
        return buildCriticalSystemDiscoverySnapshot(['seed-a'], Date.now());
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };

    await assert.rejects(
      async () => cluster.waitForControlPlaneQuiescence({
        stableWindowMs: 2,
        timeoutMs: 15,
        maxInFlightCount: 0,
        requireCriticalSystemSpread: true,
        criticalSystemTableNames: ['replica_operations'],
        criticalSystemRequiredDistinctNodeCount: 3,
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /criticalSystemDistribution=/i);
        assert.match(error.message, /replica_operations:1\/3/i);
        return true;
      },
    );
  },
);

test('Unit: Cluster.start generates UUID node IDs', async () => {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  const generatedIds = [];
  const mockProvider = {
    createNetwork: async () => ({id: 'net-1', name: 'net-1'}),
    removeNetwork: async () => {},
    stopContainer: async () => {},
    removeContainer: async () => {},
  };

  cluster._providers = [mockProvider];
  cluster._hostAssignment = [0, 0, 0];
  cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
    generatedIds.push(nodeId);
    const containerId = 'container-' + generatedIds.length;
    const ip = '10.0.0.' + generatedIds.length;
    return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
  };
  cluster._waitForBootstrapApi = async () => {};
  cluster._waitForAllActive = async () => {};
  cluster._logCollector.startLiveSubscription = async () => {};
  cluster._logCollector.collectFinalSnapshot = async () => {};
  cluster._logCollector.stopSubscription = async () => {};

  await cluster.start();

  assert.strictEqual(generatedIds.length, 3, 'should generate one node ID per node');
  for (const nodeId of generatedIds) {
    assert.ok(
      uuidValidate(nodeId),
      'generated node ID must be a UUID: ' + nodeId,
    );
  }

  await cluster.stop();
});

test('Unit: Cluster.start records unified startup gate state transitions',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const mockProvider = {
      createNetwork: async () => ({id: 'net-2', name: 'net-2'}),
      removeNetwork: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
    };
    cluster._providers = [mockProvider];
    cluster._hostAssignment = [0, 0];

    const stageEvents = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      stageEvents.push({stage, details});
    };

    const generatedIds = [];
    cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
      generatedIds.push(nodeId);
      const containerId = 'container-stage-' + generatedIds.length;
      const ip = '10.0.1.' + generatedIds.length;
      return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
    };
    cluster._waitForBootstrapApi = async () => {};
    cluster._waitForAllActive = async () => {};
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};

    await cluster.start();

    const startupStates = stageEvents
      .filter((event) => event.details && event.details.startupGateState)
      .map((event) => event.details.startupGateState);

    assert.deepStrictEqual(
      startupStates,
      ['seed_live', 'seed_join_ready', 'seed_join_ready', 'cluster_active'],
      'startup gate should move through deterministic readiness states',
    );

    await cluster.stop();
  });

test('Unit: Cluster.start waits for ACTIVE using startup readiness mode',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    const mockProvider = {
      createNetwork: async () => ({id: 'net-startup-mode', name: 'net-startup-mode'}),
      removeNetwork: async () => {},
      stopContainer: async () => {},
      removeContainer: async () => {},
    };
    cluster._providers = [mockProvider];
    cluster._hostAssignment = [0, 0];

    cluster._startNode = async (nodeId, role, _seedIp, _nodeIndex) => {
      const containerId = 'container-startup-mode-' + nodeId;
      const ip = role === NODE_ROLES.SEED ? '10.0.2.1' : '10.0.2.2';
      return new NodeHandle(nodeId, containerId, ip, role, mockProvider);
    };
    cluster._waitForBootstrapApi = async () => {};
    let capturedActiveWaitOptions = null;
    cluster._waitForAllActive = async (options = {}) => {
      capturedActiveWaitOptions = {...options};
    };
    cluster._logCollector.startLiveSubscription = async () => {};
    cluster._logCollector.collectFinalSnapshot = async () => [];
    cluster._logCollector.stopSubscription = async () => {};

    await cluster.start();

    assert.deepStrictEqual(
      capturedActiveWaitOptions,
      {mode: 'startup'},
      'startup gate should evaluate ACTIVE admission with startup readiness mode',
    );

    await cluster.stop();
  });

test('Unit: _startNode sets NODE_ADDRESS to routable host:port', async () => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });

  cluster._networkName = 'test-net';

  let capturedCreateOptions = null;
  const provider = cluster._providers[0];
  provider.createContainer = async (options) => {
    capturedCreateOptions = options;
    return {
      containerId: 'container-1',
      ip: '10.0.0.10',
      name: options.name,
    };
  };

  const nodeId = 'test-node-id';
  await cluster._startNode(nodeId, NODE_ROLES.SEED, null, 0);

  const env = capturedCreateOptions.env;
  assert.ok(env, 'container env should be set');
  assert.notStrictEqual(
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS],
    nodeId,
    'node address should not be raw nodeId',
  );
  assert.ok(
    env[CONTAINER_ENV_KEYS.NODE_ADDRESS].endsWith(
      ':' + PORTS.REST,
    ),
    'node address should include rest port',
  );
  assert.strictEqual(
    env.TRANSPORT_WS_HOST,
    '0.0.0.0',
    'transport ws host should bind on all interfaces in containers',
  );
  assert.strictEqual(
    env[RAFT_PROVIDER_DEFAULTS.envKey],
    RAFT_PROVIDER_DEFAULTS.provider,
    'raft provider env should default to liferaft',
  );
});
