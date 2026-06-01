export function registerClusterPart6Core02Tests(context) {
  const {
    assert,
    createCluster,
    TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    TERMINAL_PRIORITY_REGRESSION_ADMIN_HEALTH,
    TERMINAL_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
    TERMINAL_PRIORITY_REGRESSION_CLUSTER_SIZE,
    TERMINAL_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    TERMINAL_PRIORITY_REGRESSION_DOCKER_SOCKET,
    TERMINAL_PRIORITY_REGRESSION_EPOCH,
    TERMINAL_PRIORITY_REGRESSION_EXPECTED_ERROR_PATTERN,
    TERMINAL_PRIORITY_REGRESSION_IMAGE,
    TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID,
    TERMINAL_PRIORITY_REGRESSION_JOINER_B_ID,
    TERMINAL_PRIORITY_REGRESSION_JOINER_C_ID,
    TERMINAL_PRIORITY_REGRESSION_JOINER_D_ID,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_ASSERTION,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_CORRELATION_KEY,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_FRAGMENT,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE,
    TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE_FRAGMENT,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_ASSERTION,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_CLASS,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_CORRELATION_KEY,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_FRAGMENT,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_ID,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE_FRAGMENT,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_STATUS,
    TERMINAL_PRIORITY_REGRESSION_OPERATION_STEP,
    TERMINAL_PRIORITY_REGRESSION_PARTITION_ID,
    TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
    TERMINAL_PRIORITY_REGRESSION_REGRESSED_COVERAGE,
    TERMINAL_PRIORITY_REGRESSION_SEED_ID,
    TERMINAL_PRIORITY_REGRESSION_SINGLE_COUNT,
    TERMINAL_PRIORITY_REGRESSION_SPREAD_GAP,
    TERMINAL_PRIORITY_REGRESSION_STALLED_COVERAGE,
    TERMINAL_PRIORITY_REGRESSION_TEST_NAME,
    TERMINAL_PRIORITY_REGRESSION_TIMEOUT_MS,
    TERMINAL_PRIORITY_REGRESSION_UPDATED_AT_MS,
    TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT,
    test,
  } = context;

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

  test('Unit: _waitForAllActive startup mode fails on configured ' +
  'no-progress with active-gate diagnostics', async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 5000,
        activeWaitNoProgressMaxAttempts: 1,
      },
    });

    cluster._sleep = async () => {};
    cluster._collectFailureLogs = async () => {};
    cluster._recordClusterStage = () => {};
    const stalledProbe = {
      allActive: false,
      nodeDiagnostics: [{
        nodeId: TERMINAL_PRIORITY_REGRESSION_SEED_ID,
        active: true,
        state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
      }, {
        nodeId: TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID,
        active: false,
        state: 'inactive',
        reasons: ['startup_publication_pending'],
      }],
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: 2,
        bestCoverageNodeCount: 1,
        selectedNodeId: TERMINAL_PRIORITY_REGRESSION_SEED_ID,
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: ['publication_convergence_missing'],
        publicationStatus: TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID],
        missingPublishedNodeIds: [TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: false,
      },
    };
    let probeCallCount = 0;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += 1;
      return stalledProbe;
    };

    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        assert.match(error.message, /stalled/i);
        assert.equal(error?.diagnostics?.noProgress?.enabled, true);
        assert.equal(error?.diagnostics?.noProgress?.mode, 'startup');
        assert.equal(error?.diagnostics?.noProgress?.maxAttempts, 1);
        assert.equal(
          error?.diagnostics?.activeGate?.mode,
          'startup',
        );
        return true;
      },
    );
    assert.equal(
      probeCallCount,
      2,
      'startup ACTIVE wait should stop after the no-progress attempt budget',
    );
  });

  test('Unit: _waitForAllActive returns a terminal activeGate with the ' +
  'successful progress snapshot', async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
      timeouts: {
        convergence: 200,
        activeWaitNoProgressMaxAttempts: 30,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._probeClusterActiveState = (() => {
      let callCount = 0;
      return async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            allActive: false,
            nodeDiagnostics: [
              {nodeId: 'seed-1', active: true, state: 'active'},
              {nodeId: 'joiner-1', active: false, state: 'inactive'},
            ],
            snapshotCoverage: {
              completeCoverage: false,
              expectedNodeCount: 2,
              bestCoverageNodeCount: 1,
            },
            publicationConvergenceGate: {
              ready: false,
              reasons: ['publication_pending'],
              publicationStatus: 'PUBLISHING',
              pendingAckNodeIds: ['joiner-1'],
              missingPublishedNodeIds: ['joiner-1'],
            },
            priorityRecoveryInvariants: {
              invariants: [],
              failingInvariantIds: [],
              passed: true,
            },
          };
        }
        return {
          allActive: true,
          nodeDiagnostics: [
            {nodeId: 'seed-1', active: true, state: 'active'},
            {nodeId: 'joiner-1', active: true, state: 'active'},
          ],
          snapshotCoverage: {
            completeCoverage: true,
            expectedNodeCount: 2,
            bestCoverageNodeCount: 2,
            selectedNodeId: 'seed-1',
            selectedAdminReady: true,
            selectedReachableBy: 'admin_health',
            selectedPublicationConvergence: {
              publicationEpoch: 4,
              publicationStatus: 'PUBLISHED',
              pendingAckNodeIds: [],
              publishedActiveNodeIds: ['seed-1', 'joiner-1'],
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
          priorityRecoveryInvariants: {
            invariants: [],
            failingInvariantIds: [],
            passed: true,
          },
        };
      };
    })();

    const activeGate = await cluster._waitForAllActive({mode: 'load'});

    assert.equal(activeGate.state, 'ready');
    assert.equal(activeGate.progress.activeNodeCount, 2);
    assert.equal(activeGate.progress.inactiveNodeCount, 0);
    assert.equal(activeGate.progress.snapshotCoverageComplete, true);
    assert.equal(activeGate.progress.publicationStatus, 'PUBLISHED');
  });

  test('Unit: _waitForAllActive keeps the last meaningful startup blocker when' +
  ' terminal snapshot coverage regresses to zero', async () => {
    const TERMINAL_REGRESSION_CLUSTER_SIZE = 2;
    const TERMINAL_REGRESSION_TIMEOUT_MS = 5;
    const TERMINAL_REGRESSION_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
    const TERMINAL_REGRESSION_IMAGE = 'distributed-db:test';
    const TERMINAL_REGRESSION_SEED_ID = 'seed-1';
    const TERMINAL_REGRESSION_JOINER_ID = 'joiner-1';
    const TERMINAL_REGRESSION_ACTIVE_STATE = 'active';
    const TERMINAL_REGRESSION_PUBLICATION_STATUS = 'PUBLISHED';
    const TERMINAL_REGRESSION_ADMIN_HEALTH_SOURCE = 'admin_health';
    const TERMINAL_REGRESSION_PRIORITY_PARTITION_ID = 'replica_operations-p1';
    const TERMINAL_REGRESSION_PRIORITY_BLOCKER =
    'operation_created_but_no_step_transitions';
    const TERMINAL_REGRESSION_PRIORITY_SEMANTIC_STATE = 'operation_stalled';
    const TERMINAL_REGRESSION_SELECTED_ERROR =
    'Admin API query timed out for node seed-1 on lane snapshot after 1ms';
    const TERMINAL_REGRESSION_REACHABILITY_ERROR =
    'Control snapshot reachability probe timed out for seed-1';
    const TERMINAL_REGRESSION_EXPECTED_ERROR =
    'Not all nodes reached ACTIVE state within';
    const TERMINAL_REGRESSION_LAST_PROGRESS_COVERAGE_FRAGMENT = 'coverage=0/2';
    const TERMINAL_REGRESSION_ZERO_COUNT = 0;
    const TERMINAL_REGRESSION_SINGLE_COUNT = 1;

    const cluster = createCluster({
      size: TERMINAL_REGRESSION_CLUSTER_SIZE,
      docker: {socketPath: TERMINAL_REGRESSION_DOCKER_SOCKET_PATH},
      image: TERMINAL_REGRESSION_IMAGE,
      timeouts: {
        convergence: TERMINAL_REGRESSION_TIMEOUT_MS,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};

    const activeNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_REGRESSION_SEED_ID,
      active: true,
      state: TERMINAL_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_REGRESSION_JOINER_ID,
      active: true,
      state: TERMINAL_REGRESSION_ACTIVE_STATE,
    }]);
    const meaningfulProgressProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_REGRESSION_SINGLE_COUNT,
        selectedNodeId: TERMINAL_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_REGRESSION_ADMIN_HEALTH_SOURCE,
        selectedPublicationConvergence: {
          publicationStatus: TERMINAL_REGRESSION_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          publishedActiveNodeIds: [TERMINAL_REGRESSION_SEED_ID],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: TERMINAL_REGRESSION_SINGLE_COUNT,
            totalSpreadGap: TERMINAL_REGRESSION_SINGLE_COUNT,
          },
        },
        selectedPriorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: TERMINAL_REGRESSION_PRIORITY_PARTITION_ID,
            blockerReasons: [TERMINAL_REGRESSION_PRIORITY_BLOCKER],
            coordinator: {
              operationCount: TERMINAL_REGRESSION_SINGLE_COUNT,
            },
          }],
          partitionIdsBySemanticState: {
            [TERMINAL_REGRESSION_PRIORITY_SEMANTIC_STATE]: [
              TERMINAL_REGRESSION_PRIORITY_PARTITION_ID,
            ],
          },
        },
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: TERMINAL_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    const zeroCoverageTimeoutProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_REGRESSION_ZERO_COUNT,
        selectedNodeId: TERMINAL_REGRESSION_SEED_ID,
        selectedAdminReady: false,
        selectedError: TERMINAL_REGRESSION_SELECTED_ERROR,
        selectedReachabilityError: TERMINAL_REGRESSION_REACHABILITY_ERROR,
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    let probeCallCount = TERMINAL_REGRESSION_ZERO_COUNT;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += TERMINAL_REGRESSION_SINGLE_COUNT;
      return probeCallCount === TERMINAL_REGRESSION_SINGLE_COUNT ?
        meaningfulProgressProbe :
        zeroCoverageTimeoutProbe;
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
        error.message.includes(TERMINAL_REGRESSION_EXPECTED_ERROR);
      },
    );

    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
      TERMINAL_REGRESSION_SINGLE_COUNT,
    );
    assert.deepEqual(
      timeoutError?.diagnostics?.activeGate?.progress
        ?.priorityRecoveryProgressClasses?.unresolvedClassIds,
      [TERMINAL_REGRESSION_PRIORITY_BLOCKER],
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.lastProgressEvent?.message.includes(
        TERMINAL_REGRESSION_LAST_PROGRESS_COVERAGE_FRAGMENT,
      ),
      true,
    );
  });

  test('Unit: _waitForAllActive keeps the last meaningful startup blocker when' +
  ' terminal snapshot coverage regresses without publication improvement',
  async () => {
    const TERMINAL_COVERAGE_REGRESSION_CLUSTER_SIZE = 3;
    const TERMINAL_COVERAGE_REGRESSION_TIMEOUT_MS = 5;
    const TERMINAL_COVERAGE_REGRESSION_DOCKER_SOCKET_PATH =
    '/var/run/docker.sock';
    const TERMINAL_COVERAGE_REGRESSION_IMAGE = 'distributed-db:test';
    const TERMINAL_COVERAGE_REGRESSION_SEED_ID = 'seed-1';
    const TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID = 'joiner-strong';
    const TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID = 'joiner-weak';
    const TERMINAL_COVERAGE_REGRESSION_ACTIVE_STATE = 'active';
    const TERMINAL_COVERAGE_REGRESSION_PUBLICATION_STATUS = 'PUBLISHED';
    const TERMINAL_COVERAGE_REGRESSION_ADMIN_HEALTH_SOURCE = 'admin_health';
    const TERMINAL_COVERAGE_REGRESSION_EXPECTED_ERROR =
    'Not all nodes reached ACTIVE state within';
    const TERMINAL_COVERAGE_REGRESSION_LAST_PROGRESS_FRAGMENT = 'coverage=1/3';
    const TERMINAL_COVERAGE_REGRESSION_ZERO_COUNT = 0;
    const TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT = 1;
    const TERMINAL_COVERAGE_REGRESSION_DOUBLE_COUNT = 2;

    const cluster = createCluster({
      size: TERMINAL_COVERAGE_REGRESSION_CLUSTER_SIZE,
      docker: {socketPath: TERMINAL_COVERAGE_REGRESSION_DOCKER_SOCKET_PATH},
      image: TERMINAL_COVERAGE_REGRESSION_IMAGE,
      timeouts: {
        convergence: TERMINAL_COVERAGE_REGRESSION_TIMEOUT_MS,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};

    const activeNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_COVERAGE_REGRESSION_SEED_ID,
      active: true,
      state: TERMINAL_COVERAGE_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
      active: true,
      state: TERMINAL_COVERAGE_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
      active: false,
      state: TERMINAL_COVERAGE_REGRESSION_ACTIVE_STATE,
    }]);
    const meaningfulProgressProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_COVERAGE_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_COVERAGE_REGRESSION_DOUBLE_COUNT,
        selectedNodeId: TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
        selectedAdminReady: true,
        selectedReachableBy:
        TERMINAL_COVERAGE_REGRESSION_ADMIN_HEALTH_SOURCE,
        selectedPublishedActiveNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_SEED_ID,
          TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
        ],
        selectedMissingPublishedNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        selectedPublicationConvergence: {
          publicationStatus: TERMINAL_COVERAGE_REGRESSION_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          publishedActiveNodeIds: [
            TERMINAL_COVERAGE_REGRESSION_SEED_ID,
            TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT,
            totalSpreadGap: TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT,
          },
        },
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: [
          'publication_missing_active_node=' +
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        publicationStatus: TERMINAL_COVERAGE_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        priorityPartitionSummary: null,
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    const regressedCurrentProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_COVERAGE_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT,
        selectedNodeId: TERMINAL_COVERAGE_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy:
        TERMINAL_COVERAGE_REGRESSION_ADMIN_HEALTH_SOURCE,
        selectedPublishedActiveNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_SEED_ID,
          TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
        ],
        selectedMissingPublishedNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        selectedPublicationConvergence: {
          publicationStatus: TERMINAL_COVERAGE_REGRESSION_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          publishedActiveNodeIds: [
            TERMINAL_COVERAGE_REGRESSION_SEED_ID,
            TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: TERMINAL_COVERAGE_REGRESSION_ZERO_COUNT,
            totalSpreadGap: TERMINAL_COVERAGE_REGRESSION_ZERO_COUNT,
          },
        },
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: [
          'publication_missing_active_node=' +
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        publicationStatus: TERMINAL_COVERAGE_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [
          TERMINAL_COVERAGE_REGRESSION_WEAK_NODE_ID,
        ],
        priorityPartitionSummary: null,
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    let probeCallCount = TERMINAL_COVERAGE_REGRESSION_ZERO_COUNT;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT;
      return probeCallCount === TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT ?
        meaningfulProgressProbe :
        regressedCurrentProbe;
    };

    let timeoutError = null;
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        timeoutError = error;
        return typeof error?.message === 'string' &&
        error.message.includes(TERMINAL_COVERAGE_REGRESSION_EXPECTED_ERROR);
      },
    );

    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.selectedSnapshotNodeId,
      TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.snapshotCoverageNodeCount,
      TERMINAL_COVERAGE_REGRESSION_DOUBLE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.currentProgress
        ?.selectedSnapshotNodeId,
      TERMINAL_COVERAGE_REGRESSION_SEED_ID,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.currentProgress
        ?.snapshotCoverageNodeCount,
      TERMINAL_COVERAGE_REGRESSION_SINGLE_COUNT,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.lastProgressEvent?.message.includes(
        TERMINAL_COVERAGE_REGRESSION_LAST_PROGRESS_FRAGMENT,
      ),
      true,
    );
    assert.equal(
      timeoutError?.message.includes(
        'snapshotNode=' + TERMINAL_COVERAGE_REGRESSION_STRONG_NODE_ID,
      ),
      true,
    );
  });

  test(TERMINAL_PRIORITY_REGRESSION_TEST_NAME, async () => {
    const cluster = createCluster({
      size: TERMINAL_PRIORITY_REGRESSION_CLUSTER_SIZE,
      docker: {socketPath: TERMINAL_PRIORITY_REGRESSION_DOCKER_SOCKET},
      image: TERMINAL_PRIORITY_REGRESSION_IMAGE,
      timeouts: {
        convergence: TERMINAL_PRIORITY_REGRESSION_TIMEOUT_MS,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};

    const activeNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_PRIORITY_REGRESSION_SEED_ID,
      active: true,
      state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID,
      active: true,
      state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PRIORITY_REGRESSION_JOINER_B_ID,
      active: true,
      state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PRIORITY_REGRESSION_JOINER_C_ID,
      active: true,
      state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PRIORITY_REGRESSION_JOINER_D_ID,
      active: true,
      state: TERMINAL_PRIORITY_REGRESSION_ACTIVE_STATE,
    }]);
    const operationStalledProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_PRIORITY_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_PRIORITY_REGRESSION_STALLED_COVERAGE,
        selectedNodeId: TERMINAL_PRIORITY_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_PRIORITY_REGRESSION_ADMIN_HEALTH,
        selectedPublicationConvergence: {
          publicationStatus: TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            TERMINAL_PRIORITY_REGRESSION_SEED_ID,
            TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID,
            TERMINAL_PRIORITY_REGRESSION_JOINER_B_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount:
            TERMINAL_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
            totalSpreadGap: TERMINAL_PRIORITY_REGRESSION_SPREAD_GAP,
          },
        },
        selectedPriorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: TERMINAL_PRIORITY_REGRESSION_PARTITION_ID,
            epoch: TERMINAL_PRIORITY_REGRESSION_EPOCH,
            correlationKey:
            TERMINAL_PRIORITY_REGRESSION_OPERATION_CORRELATION_KEY,
            operationId: TERMINAL_PRIORITY_REGRESSION_OPERATION_ID,
            semanticState: TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE,
            blockerReasons: [
              TERMINAL_PRIORITY_REGRESSION_OPERATION_CLASS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: TERMINAL_PRIORITY_REGRESSION_SINGLE_COUNT,
              operation: {
                operationId: TERMINAL_PRIORITY_REGRESSION_OPERATION_ID,
                status: TERMINAL_PRIORITY_REGRESSION_OPERATION_STATUS,
                step: TERMINAL_PRIORITY_REGRESSION_OPERATION_STEP,
                updatedAtMs: TERMINAL_PRIORITY_REGRESSION_UPDATED_AT_MS,
              },
            },
          }],
          partitionIdsBySemanticState: {
            [TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE]: [
              TERMINAL_PRIORITY_REGRESSION_PARTITION_ID,
            ],
          },
        },
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [
          TERMINAL_PRIORITY_REGRESSION_OPERATION_CLASS,
        ],
        passed: false,
      },
    });
    const needsOperationProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_PRIORITY_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_PRIORITY_REGRESSION_REGRESSED_COVERAGE,
        selectedNodeId: TERMINAL_PRIORITY_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_PRIORITY_REGRESSION_ADMIN_HEALTH,
        selectedPublicationConvergence: {
          publicationStatus: TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            TERMINAL_PRIORITY_REGRESSION_SEED_ID,
            TERMINAL_PRIORITY_REGRESSION_JOINER_A_ID,
            TERMINAL_PRIORITY_REGRESSION_JOINER_B_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount:
            TERMINAL_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
            totalSpreadGap: TERMINAL_PRIORITY_REGRESSION_SPREAD_GAP,
          },
        },
        selectedPriorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: TERMINAL_PRIORITY_REGRESSION_PARTITION_ID,
            epoch: TERMINAL_PRIORITY_REGRESSION_EPOCH,
            correlationKey:
            TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_CORRELATION_KEY,
            semanticState: TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE,
            blockerReasons: [
              TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount: TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT,
            },
          }],
          partitionIdsBySemanticState: {
            [TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE]: [
              TERMINAL_PRIORITY_REGRESSION_PARTITION_ID,
            ],
          },
        },
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: TERMINAL_PRIORITY_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [
          TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
        ],
        passed: false,
      },
    });
    let probeCallCount = TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT;
    cluster._probeClusterActiveState = async () => {
      const selectedProbe =
      probeCallCount === TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT ?
        operationStalledProbe :
        needsOperationProbe;
      probeCallCount += TERMINAL_PRIORITY_REGRESSION_SINGLE_COUNT;
      return selectedProbe;
    };

    const capturedErrors = [];
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        capturedErrors.push(error);
        return TERMINAL_PRIORITY_REGRESSION_EXPECTED_ERROR_PATTERN.test(
          error?.message,
        );
      },
    );

    const timeoutMessage =
    capturedErrors[TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT].message;
    assert.equal(
      timeoutMessage.includes(TERMINAL_PRIORITY_REGRESSION_OPERATION_FRAGMENT),
      true,
      TERMINAL_PRIORITY_REGRESSION_OPERATION_ASSERTION,
    );
    assert.equal(
      timeoutMessage.includes(
        TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE_FRAGMENT,
      ),
      true,
      TERMINAL_PRIORITY_REGRESSION_OPERATION_ASSERTION,
    );
    assert.equal(
      timeoutMessage.includes(
        TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_FRAGMENT,
      ),
      false,
      TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_ASSERTION,
    );
    assert.equal(
      timeoutMessage.includes(
        TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE_FRAGMENT,
      ),
      false,
      TERMINAL_PRIORITY_REGRESSION_NEEDS_OPERATION_ASSERTION,
    );
    assert.deepEqual(
      capturedErrors[TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT]?.diagnostics
        ?.activeGate?.progress?.priorityRecoveryProgressClasses
        ?.unresolvedClassIds,
      [TERMINAL_PRIORITY_REGRESSION_OPERATION_CLASS],
      TERMINAL_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
    assert.deepEqual(
      capturedErrors[TERMINAL_PRIORITY_REGRESSION_ZERO_COUNT]?.diagnostics
        ?.activeGate?.progress?.priorityRecoveryProgressClasses
        ?.unresolvedSemanticStateIds,
      [TERMINAL_PRIORITY_REGRESSION_OPERATION_STATE],
      TERMINAL_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
  });
}
