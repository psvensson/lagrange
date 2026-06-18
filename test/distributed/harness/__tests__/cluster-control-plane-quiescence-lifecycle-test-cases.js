export function registerClusterControlPlaneQuiescenceLifecycleTests(context) {
  const {
    assert,
    buildCriticalSystemDiscoverySnapshot,
    CONTAINER_ENV_KEYS,
    CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
    CONTROL_PLANE_QUIESCENCE_REASON,
    CONTROL_PLANE_QUIESCENCE_STATE,
    createCluster,
    DISCOVERY_REPAIR_TIMEOUT_ERROR,
    LOAD_READINESS_CANONICAL_DOCKER_SOCKET,
    LOAD_READINESS_CANONICAL_IMAGE,
    NODE_ROLES,
    NODE_STATE_PUBLICATION_PRESSURE_ERROR,
    NodeHandle,
    PORTS,
    QUIESCENCE_SNAPSHOT_LANE_CAPTURED_AT_MS,
    QUIESCENCE_SNAPSHOT_LANE_DISCOVERY_SQL_PATTERN,
    QUIESCENCE_SNAPSHOT_LANE_ERROR,
    QUIESCENCE_SNAPSHOT_LANE_MAX_IN_FLIGHT_COUNT,
    QUIESCENCE_SNAPSHOT_LANE_NODE_ID,
    QUIESCENCE_SNAPSHOT_LANE_REQUIRED_NODE_COUNT,
    QUIESCENCE_SNAPSHOT_LANE_STABLE_WINDOW_MS,
    QUIESCENCE_SNAPSHOT_LANE_TABLE_NAME,
    QUIESCENCE_SNAPSHOT_LANE_TIMEOUT_MS,
    QUIESCENCE_SNAPSHOT_LANE_UNAVAILABLE_TABLE_COUNT,
    QUIESCENCE_STALE_PROGRESS_CAPTURED_AT_MS,
    QUIESCENCE_STALE_PROGRESS_EFFECTIVE_IN_FLIGHT_COUNT,
    QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT,
    QUIESCENCE_STALE_PROGRESS_LOG_FAILURE,
    QUIESCENCE_STALE_PROGRESS_MAX_IN_FLIGHT_COUNT,
    QUIESCENCE_STALE_PROGRESS_NO_PROGRESS_TIMEOUT_MS,
    QUIESCENCE_STALE_PROGRESS_NODE_ID,
    QUIESCENCE_STALE_PROGRESS_OPERATION_ID,
    QUIESCENCE_STALE_PROGRESS_PARTITION_ID,
    QUIESCENCE_STALE_PROGRESS_SLEEP_MS,
    QUIESCENCE_STALE_PROGRESS_STABLE_WINDOW_MS,
    QUIESCENCE_STALE_PROGRESS_STALE_IN_FLIGHT_COUNT,
    QUIESCENCE_STALE_PROGRESS_START_AT_MS,
    QUIESCENCE_STALE_PROGRESS_STATUS,
    QUIESCENCE_STALE_PROGRESS_STEP,
    QUIESCENCE_STALE_PROGRESS_TIMEOUT_MS,
    RAFT_PROVIDER_DEFAULTS,
    RUNTIME_AUTHORITY_REPAIR_STATE,
    test,
    uuidValidate,
  } = context;

  test(
    'Unit: waitForControlPlaneQuiescence lets discounted stale in-flight work ' +
    'complete the stable window',
    async () => {
      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      let currentNowMs = QUIESCENCE_STALE_PROGRESS_START_AT_MS;
      cluster._nodes = new Map([[QUIESCENCE_STALE_PROGRESS_NODE_ID, {
        id: QUIESCENCE_STALE_PROGRESS_NODE_ID,
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          return {
            rows: [{
              capturedAt: QUIESCENCE_STALE_PROGRESS_CAPTURED_AT_MS,
              leaders: {
                [QUIESCENCE_STALE_PROGRESS_PARTITION_ID]:
                QUIESCENCE_STALE_PROGRESS_NODE_ID,
              },
              replicaOperations: {
                inFlightCount: QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT,
                staleInFlightCount:
                QUIESCENCE_STALE_PROGRESS_STALE_IN_FLIGHT_COUNT,
                partitionGroupInFlight: {
                  [QUIESCENCE_STALE_PROGRESS_PARTITION_ID]:
                  QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT,
                },
                operationTimelineById: {
                  [QUIESCENCE_STALE_PROGRESS_OPERATION_ID]: [{
                    step: QUIESCENCE_STALE_PROGRESS_STEP,
                    status: QUIESCENCE_STALE_PROGRESS_STATUS,
                    inFlight: true,
                  }],
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
        currentNowMs += QUIESCENCE_STALE_PROGRESS_SLEEP_MS;
      };
      let collected = false;
      cluster._collectFailureLogs = async () => {
        collected = true;
      };
      const originalDateNow = Date.now;
      Date.now = () => currentNowMs;
      try {
        const result = await cluster.waitForControlPlaneQuiescence({
          stableWindowMs: QUIESCENCE_STALE_PROGRESS_STABLE_WINDOW_MS,
          timeoutMs: QUIESCENCE_STALE_PROGRESS_TIMEOUT_MS,
          noProgressTimeoutMs: QUIESCENCE_STALE_PROGRESS_NO_PROGRESS_TIMEOUT_MS,
          maxInFlightCount: QUIESCENCE_STALE_PROGRESS_MAX_IN_FLIGHT_COUNT,
          ignoreStaleInFlightReplicaOperations: true,
        });

        assert.equal(
          result.state,
          CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENT,
        );
        assert.equal(
          result.inFlightCount,
          QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT,
        );
        assert.equal(
          result.effectiveInFlightCount,
          QUIESCENCE_STALE_PROGRESS_EFFECTIVE_IN_FLIGHT_COUNT,
        );
        assert.equal(result.canonicalBlocker, null);
        assert.equal(collected, false, QUIESCENCE_STALE_PROGRESS_LOG_FAILURE);
      } finally {
        Date.now = originalDateNow;
      }
    },
  );

  test(
    'Unit: waitForControlPlaneQuiescence consumes control-plane pressure owner diagnostics',
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
              controlPlaneDiagnostics: {
                readinessByNodeId: {
                  'seed-a': {
                    runtimeAuthority: {
                      repair: {
                        state: RUNTIME_AUTHORITY_REPAIR_STATE.FAILED,
                        error: DISCOVERY_REPAIR_TIMEOUT_ERROR,
                      },
                    },
                  },
                },
                heartbeatPublication: {
                  consecutiveFailures: 1,
                  lastFailureReason: NODE_STATE_PUBLICATION_PRESSURE_ERROR,
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
          assert.equal(
            error.quiescence.state,
            CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
          );
          assert.deepEqual(
            error.quiescence.reasonCodes,
            [
              CONTROL_PLANE_QUIESCENCE_REASON.DISCOVERY_REPAIR_TIMEOUT,
              CONTROL_PLANE_QUIESCENCE_REASON.NODE_STATE_PUBLICATION_PRESSURE,
            ],
          );
          return true;
        },
      );
    },
  );

  test(
    'Unit: waitForControlPlaneQuiescence records a per-poll candidate-window ' +
    'reset history so a settle-time failure can be pinned to its reason',
    async () => {
      // Observability falsifier: the report previously surfaced only the final
      // poll + the LAST reset, so a window-truncating reason could not be pinned
      // across polls. Drive a snapshot that resets the stable window every poll
      // (control-plane pressure) and assert the history accumulates the resets
      // with their discriminating signals (state/reasonCodes/leaderSignature).
      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      cluster._nodes = new Map([['seed-h', {
        id: 'seed-h',
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          return {
            rows: [{
              capturedAt: Date.now(),
              leaders: {'partitions-p1': 'seed-h'},
              replicaOperations: {
                inFlightCount: 0,
                partitionGroupInFlight: {},
                operationTimelineById: {},
              },
              controlPlaneDiagnostics: {
                readinessByNodeId: {
                  'seed-h': {
                    runtimeAuthority: {
                      repair: {
                        state: RUNTIME_AUTHORITY_REPAIR_STATE.FAILED,
                        error: DISCOVERY_REPAIR_TIMEOUT_ERROR,
                      },
                    },
                  },
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
      cluster._collectFailureLogs = async () => {};

      await assert.rejects(
        async () => cluster.waitForControlPlaneQuiescence({
          stableWindowMs: 2,
          timeoutMs: 15,
          maxInFlightCount: 0,
        }),
        (error) => {
          const history = error.quiescence.candidateWindowResetHistory;
          assert.ok(
            Array.isArray(history) && history.length > 0,
            'reset history is recorded',
          );
          const entry = history[history.length - 1];
          assert.equal(
            entry.state,
            CONTROL_PLANE_QUIESCENCE_STATE.CONTROL_PLANE_PRESSURE,
          );
          assert.ok(
            Array.isArray(entry.reasonCodes) && entry.reasonCodes.length > 0,
            'each reset records its reason codes',
          );
          assert.equal(
            entry.leaderSignature,
            JSON.stringify([['partitions-p1', 'seed-h']]),
            'each reset records the leader signature (to tell a real raft ' +
            'change from an AVAILABLE-map flicker)',
          );
          assert.equal(typeof entry.observedAtMs, 'number');
          return true;
        },
      );
    },
  );

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
    'Unit: critical system spread probes preserve a late timeout floor',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });
      const capturedTimeouts = [];
      const capturedLanes = [];
      cluster._nodes = new Map([['seed-a', {
        id: 'seed-a',
        role: NODE_ROLES.SEED,
        async queryWithTimeout(sql, _params, options = {}) {
          assert.match(
            sql,
            /service_discovery_local\('replica_operations'\)/,
          );
          capturedTimeouts.push(options.timeoutMs);
          capturedLanes.push(options.lane);
          return buildCriticalSystemDiscoverySnapshot(['seed-a'], Date.now());
        },
      }]]);

      const result = await cluster._probeCriticalSystemTableDistribution(
        Date.now() - 1,
        'replica_operations',
        1,
      );

      assert.equal(result.ready, true);
      assert.equal(capturedTimeouts.length, 1);
      assert.ok(
        capturedTimeouts[0] >= 100,
        'late critical spread probe should not collapse to a 1ms timeout',
      );
      assert.equal(capturedLanes[0], 'snapshot');
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

  test(
    'Unit: waitForControlPlaneQuiescence separates snapshot-lane critical evidence gaps',
    async () => {
      const cluster = createCluster({
        size: QUIESCENCE_SNAPSHOT_LANE_REQUIRED_NODE_COUNT,
        docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
        image: LOAD_READINESS_CANONICAL_IMAGE,
      });

      cluster._nodes = new Map([[QUIESCENCE_SNAPSHOT_LANE_NODE_ID, {
        id: QUIESCENCE_SNAPSHOT_LANE_NODE_ID,
        role: NODE_ROLES.SEED,
        async getControlSnapshot() {
          return {
            rows: [{
              capturedAt: QUIESCENCE_SNAPSHOT_LANE_CAPTURED_AT_MS,
              leaders: {partitions: QUIESCENCE_SNAPSHOT_LANE_NODE_ID},
              replicaOperations: {
                inFlightCount: QUIESCENCE_SNAPSHOT_LANE_MAX_IN_FLIGHT_COUNT,
                partitionGroupInFlight: {},
                operationTimelineById: {},
              },
            }],
          };
        },
        async queryWithTimeout(sql) {
          assert.match(
            sql,
            QUIESCENCE_SNAPSHOT_LANE_DISCOVERY_SQL_PATTERN,
          );
          throw new Error(QUIESCENCE_SNAPSHOT_LANE_ERROR);
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
          stableWindowMs: QUIESCENCE_SNAPSHOT_LANE_STABLE_WINDOW_MS,
          timeoutMs: QUIESCENCE_SNAPSHOT_LANE_TIMEOUT_MS,
          maxInFlightCount: QUIESCENCE_SNAPSHOT_LANE_MAX_IN_FLIGHT_COUNT,
          requireCriticalSystemSpread: true,
          criticalSystemTableNames: [QUIESCENCE_SNAPSHOT_LANE_TABLE_NAME],
          criticalSystemRequiredDistinctNodeCount:
          QUIESCENCE_SNAPSHOT_LANE_REQUIRED_NODE_COUNT,
        }),
        (error) => {
          assert.ok(collected, 'should collect failure logs before throwing');
          assert.equal(
            error.quiescence.state,
            CONTROL_PLANE_QUIESCENCE_STATE
              .CRITICAL_SPREAD_OBSERVATION_UNAVAILABLE,
          );
          assert.equal(
            error.quiescence.canonicalBlocker,
            CONTROL_PLANE_QUIESCENCE_REASON
              .CRITICAL_SYSTEM_SNAPSHOT_REACHABILITY_UNAVAILABLE,
          );
          assert.equal(
            error.quiescence.criticalSystemTopology.observationState,
            CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE
              .SNAPSHOT_LANE_UNAVAILABLE,
          );
          assert.equal(
            error.quiescence.criticalSystemTopology
              .snapshotLaneUnavailableTableCount,
            QUIESCENCE_SNAPSHOT_LANE_UNAVAILABLE_TABLE_COUNT,
          );
          assert.match(
            error.message,
            /criticalSystemObservationState=snapshot_lane_unavailable/i,
          );
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

  test('Unit: Cluster.stop stops and removes node containers in parallel',
    async () => {
      const cluster = createCluster({
        size: 3,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      const stopStarted = [];
      const removeStarted = [];
      const stopResolvers = [];
      const removeResolvers = [];
      const provider = {
        removeNetwork: async () => {},
        stopContainer: async (containerId) => {
          stopStarted.push(containerId);
          await new Promise((resolve) => {
            stopResolvers.push(resolve);
          });
        },
        removeContainer: async (containerId) => {
          removeStarted.push(containerId);
          await new Promise((resolve) => {
            removeResolvers.push(resolve);
          });
        },
      };
      cluster._recordPlaybackEvent = () => {};
      const teardownNodes = [
        ['node-a', {
          id: 'node-a',
          role: NODE_ROLES.SEED,
          containerId: 'container-a',
          _dockerProvider: provider,
          closeQueryConnection: () => {},
        }],
        ['node-b', {
          id: 'node-b',
          role: NODE_ROLES.JOINER,
          containerId: 'container-b',
          _dockerProvider: provider,
          closeQueryConnection: () => {},
        }],
        ['node-c', {
          id: 'node-c',
          role: NODE_ROLES.JOINER,
          containerId: 'container-c',
          _dockerProvider: provider,
          closeQueryConnection: () => {},
        }],
      ];

      const errors = [];
      const stopPromise = cluster._stopNodeContainersForTeardown(
        teardownNodes,
        errors,
      );
      await Promise.resolve();
      await Promise.resolve();

      assert.deepStrictEqual(
        [...stopStarted].sort(),
        ['container-a', 'container-b', 'container-c'],
        'all stop calls should be in flight before any stop resolves',
      );
      assert.deepStrictEqual(
        removeStarted,
        [],
        'container removal should wait until all stop calls finish',
      );

      stopResolvers.forEach((resolve) => resolve());
      await stopPromise;

      const removePromise = cluster._removeNodeContainersForTeardown(
        teardownNodes,
        errors,
      );
      await Promise.resolve();
      await Promise.resolve();

      assert.deepStrictEqual(
        [...removeStarted].sort(),
        ['container-a', 'container-b', 'container-c'],
        'all remove calls should be in flight before any remove resolves',
      );

      removeResolvers.forEach((resolve) => resolve());
      await removePromise;
      assert.deepStrictEqual(errors, []);
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
}
