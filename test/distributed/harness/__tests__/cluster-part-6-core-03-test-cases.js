export function registerClusterPart6Core03Tests(context) {
  const {
    ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
    ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
    assert,
    createCluster,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ADMIN_HEALTH,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CLUSTER_SIZE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_COVERAGE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CURRENT_ACTIVE_COUNT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DOCKER_SOCKET,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_EPOCH,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_EXPECTED_ERROR_PATTERN,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_IMAGE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_INACTIVE_STATE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_C_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_D_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_LAST_ACTIVE_COUNT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_MESSAGE_ASSERTION,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_CORRELATION_KEY,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_FRAGMENT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_CLASS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_CORRELATION_KEY,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_STATUS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_STEP,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PARTITION_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PUBLICATION_STATUS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_FRAGMENT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_STATE,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SINGLE_COUNT,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SPREAD_GAP,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_TEST_NAME,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_TIMEOUT_MS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_UPDATED_AT_MS,
    TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ZERO_COUNT,
    test,
  } = context;

  test(TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_TEST_NAME, async () => {
    const cluster = createCluster({
      size: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CLUSTER_SIZE,
      docker: {socketPath: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DOCKER_SOCKET},
      image: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_IMAGE,
      timeouts: {
        convergence: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_TIMEOUT_MS,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};

    const lastMeaningfulNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_C_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_D_ID,
      active: false,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_INACTIVE_STATE,
    }]);
    const regressedNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
      active: true,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_C_ID,
      active: false,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_INACTIVE_STATE,
    }, {
      nodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_D_ID,
      active: false,
      state: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_INACTIVE_STATE,
    }]);
    const recoveringInFlightProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: lastMeaningfulNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_COVERAGE,
        selectedNodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ADMIN_HEALTH,
        selectedPublishedActiveNodeIds: [
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
        ],
        selectedMissingPublishedNodeIds: [],
        selectedPublicationConvergence: {
          publicationStatus:
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
            totalSpreadGap: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SPREAD_GAP,
          },
        },
        selectedPriorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PARTITION_ID,
            epoch: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_EPOCH,
            correlationKey:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_CORRELATION_KEY,
            operationId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_ID,
            semanticState:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_STATE,
            blockerReasons: [
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_CLASS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount:
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SINGLE_COUNT,
              operation: {
                operationId:
                TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_ID,
                status:
                TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_STATUS,
                step: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_OPERATION_STEP,
                updatedAtMs:
                TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_UPDATED_AT_MS,
              },
            },
          }],
          partitionIdsBySemanticState: {
            [TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_STATE]: [
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PARTITION_ID,
            ],
          },
        },
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus:
        TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    const needsOperationProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: regressedNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_COVERAGE,
        selectedNodeId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ADMIN_HEALTH,
        selectedPublishedActiveNodeIds: [
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
        ],
        selectedMissingPublishedNodeIds: [],
        selectedPublicationConvergence: {
          publicationStatus:
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PUBLICATION_STATUS,
          publishedActiveNodeIds: [
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SEED_ID,
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_A_ID,
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_JOINER_B_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_BLOCKED_PARTITION_COUNT,
            totalSpreadGap: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SPREAD_GAP,
          },
        },
        selectedPriorityRecoveryDecisionSnapshots: {
          snapshots: [{
            partitionId: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PARTITION_ID,
            epoch: TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_EPOCH,
            correlationKey:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_CORRELATION_KEY,
            semanticState:
            TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE,
            blockerReasons: [
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
            ],
            spreadCompletion: {
              satisfied: false,
            },
            coordinator: {
              operationCount:
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ZERO_COUNT,
            },
          }],
          partitionIdsBySemanticState: {
            [TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE]: [
              TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PARTITION_ID,
            ],
          },
        },
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus:
        TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_PUBLICATION_STATUS,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [
          TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_CLASS,
        ],
        passed: false,
      },
    });
    let probeCallCount = TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ZERO_COUNT;
    cluster._probeClusterActiveState = async () => {
      const selectedProbe =
      probeCallCount === TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ZERO_COUNT ?
        recoveringInFlightProbe :
        needsOperationProbe;
      probeCallCount += TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_SINGLE_COUNT;
      return selectedProbe;
    };

    const capturedErrors = [];
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        capturedErrors.push(error);
        return TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_EXPECTED_ERROR_PATTERN
          .test(error?.message);
      },
    );

    const timeoutError =
    capturedErrors[TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_ZERO_COUNT];
    assert.equal(
      timeoutError?.message.includes(
        TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_FRAGMENT,
      ),
      true,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_MESSAGE_ASSERTION,
    );
    assert.equal(
      timeoutError?.message.includes(
        TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_FRAGMENT,
      ),
      false,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_MESSAGE_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.activeGate?.progress?.activeNodeCount,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_LAST_ACTIVE_COUNT,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
    assert.deepEqual(
      timeoutError?.diagnostics?.activeGate?.progress
        ?.priorityRecoveryProgressClasses?.unresolvedSemanticStateIds,
      [TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_RECOVERING_STATE],
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
    assert.equal(
      timeoutError?.diagnostics?.noProgress?.currentProgress?.activeNodeCount,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_CURRENT_ACTIVE_COUNT,
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
    assert.deepEqual(
      timeoutError?.diagnostics?.noProgress?.currentProgress
        ?.priorityRecoveryProgressClasses?.unresolvedSemanticStateIds,
      [TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_NEEDS_OPERATION_STATE],
      TERMINAL_IN_FLIGHT_PRIORITY_REGRESSION_DIAGNOSTIC_ASSERTION,
    );
  });

  const TERMINAL_PUBLICATION_TEST_NAME =
  'Unit: _waitForAllActive timeout publication summary uses terminal' +
  ' progress evidence';

  test(TERMINAL_PUBLICATION_TEST_NAME, async () => {
    const TERMINAL_PUBLICATION_CLUSTER_SIZE = 3;
    const TERMINAL_PUBLICATION_TIMEOUT_MS = 5;
    const TERMINAL_PUBLICATION_DOCKER_SOCKET_PATH = '/var/run/docker.sock';
    const TERMINAL_PUBLICATION_IMAGE = 'distributed-db:test';
    const TERMINAL_PUBLICATION_SEED_ID = 'publication-summary-seed';
    const TERMINAL_PUBLICATION_PENDING_NODE_ID =
    'publication-summary-pending';
    const TERMINAL_PUBLICATION_MISSING_NODE_ID_A =
    'publication-summary-missing-a';
    const TERMINAL_PUBLICATION_MISSING_NODE_ID_B =
    'publication-summary-missing-b';
    const TERMINAL_PUBLICATION_ACTIVE_STATE = 'active';
    const TERMINAL_PUBLICATION_ADMIN_HEALTH_SOURCE = 'admin_health';
    const TERMINAL_PUBLICATION_RECOVERY_PENDING = 'publication_pending';
    const TERMINAL_PUBLICATION_SELECTED_ERROR =
    'Admin API query timed out for node publication-summary-seed on lane ' +
    'snapshot after 1ms';
    const TERMINAL_PUBLICATION_REACHABILITY_ERROR =
    'Control snapshot reachability probe timed out for ' +
    'publication-summary-seed';
    const TERMINAL_PUBLICATION_EXPECTED_ERROR_PATTERN =
    /Not all nodes reached ACTIVE state within/;
    const TERMINAL_PUBLICATION_BLOCKED_FRAGMENT =
    'publicationConvergence=blocked#status=ACK_PENDING#recovery=' +
    'publication_pending#pendingAck=1#missingPublished=2';
    const TERMINAL_PUBLICATION_READY_FRAGMENT =
    'publicationConvergence=ready';
    const TERMINAL_PUBLICATION_PROGRESS_FRAGMENT =
    'progress=active=3/3,coverage=3/3#complete,publication=ACK_PENDING';
    const TERMINAL_PUBLICATION_BLOCKED_ASSERTION =
    'timeout summary should classify publication debt from terminal progress';
    const TERMINAL_PUBLICATION_READY_ASSERTION =
    'stale final ready probe must not override terminal publication debt';
    const TERMINAL_PUBLICATION_PROGRESS_ASSERTION =
    'timeout progress should use the same terminal publication snapshot';
    const TERMINAL_PUBLICATION_ZERO_COUNT = 0;
    const TERMINAL_PUBLICATION_SINGLE_COUNT = 1;

    const cluster = createCluster({
      size: TERMINAL_PUBLICATION_CLUSTER_SIZE,
      docker: {socketPath: TERMINAL_PUBLICATION_DOCKER_SOCKET_PATH},
      image: TERMINAL_PUBLICATION_IMAGE,
      timeouts: {
        convergence: TERMINAL_PUBLICATION_TIMEOUT_MS,
      },
    });

    cluster._sleep = async () => {};
    cluster._recordClusterStage = () => {};
    cluster._collectFailureLogs = async () => {};

    const activeNodeDiagnostics = Object.freeze([{
      nodeId: TERMINAL_PUBLICATION_SEED_ID,
      active: true,
      state: TERMINAL_PUBLICATION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PUBLICATION_PENDING_NODE_ID,
      active: true,
      state: TERMINAL_PUBLICATION_ACTIVE_STATE,
    }, {
      nodeId: TERMINAL_PUBLICATION_MISSING_NODE_ID_A,
      active: true,
      state: TERMINAL_PUBLICATION_ACTIVE_STATE,
    }]);
    const pendingAckNodeIds = Object.freeze([
      TERMINAL_PUBLICATION_PENDING_NODE_ID,
    ]);
    const missingPublishedNodeIds = Object.freeze([
      TERMINAL_PUBLICATION_MISSING_NODE_ID_A,
      TERMINAL_PUBLICATION_MISSING_NODE_ID_B,
    ]);
    const publicationDebtProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: true,
        expectedNodeCount: TERMINAL_PUBLICATION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_PUBLICATION_CLUSTER_SIZE,
        selectedNodeId: TERMINAL_PUBLICATION_SEED_ID,
        selectedAdminReady: true,
        selectedReachableBy: TERMINAL_PUBLICATION_ADMIN_HEALTH_SOURCE,
        selectedPublicationConvergence: {
          publicationStatus: ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
          recoveryProtocolState: TERMINAL_PUBLICATION_RECOVERY_PENDING,
          pendingAckNodeIds,
          publishedActiveNodeIds: [TERMINAL_PUBLICATION_SEED_ID],
        },
        selectedPendingAckNodeIds: pendingAckNodeIds,
        selectedMissingPublishedNodeIds: missingPublishedNodeIds,
      },
      publicationConvergenceGate: {
        ready: false,
        reasons: [],
        publicationStatus: ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
        recoveryProtocolState: TERMINAL_PUBLICATION_RECOVERY_PENDING,
        pendingAckNodeIds,
        missingPublishedNodeIds,
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    const staleReadyProbe = Object.freeze({
      allActive: false,
      nodeDiagnostics: activeNodeDiagnostics,
      snapshotCoverage: {
        completeCoverage: false,
        expectedNodeCount: TERMINAL_PUBLICATION_CLUSTER_SIZE,
        bestCoverageNodeCount: TERMINAL_PUBLICATION_ZERO_COUNT,
        selectedNodeId: TERMINAL_PUBLICATION_SEED_ID,
        selectedAdminReady: false,
        selectedError: TERMINAL_PUBLICATION_SELECTED_ERROR,
        selectedReachabilityError: TERMINAL_PUBLICATION_REACHABILITY_ERROR,
      },
      publicationConvergenceGate: {
        ready: true,
        reasons: [],
        publicationStatus: ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: [],
      },
      priorityRecoveryInvariants: {
        invariants: [],
        failingInvariantIds: [],
        passed: true,
      },
    });
    let probeCallCount = TERMINAL_PUBLICATION_ZERO_COUNT;
    cluster._probeClusterActiveState = async () => {
      const selectedProbe =
      probeCallCount === TERMINAL_PUBLICATION_ZERO_COUNT ?
        publicationDebtProbe :
        staleReadyProbe;
      probeCallCount += TERMINAL_PUBLICATION_SINGLE_COUNT;
      return selectedProbe;
    };

    const capturedErrors = [];
    await assert.rejects(
      async () => {
        await cluster._waitForAllActive();
      },
      (error) => {
        capturedErrors.push(error);
        return TERMINAL_PUBLICATION_EXPECTED_ERROR_PATTERN.test(error?.message);
      },
    );

    const timeoutMessage =
    capturedErrors[TERMINAL_PUBLICATION_ZERO_COUNT].message;
    assert.equal(
      timeoutMessage.includes(TERMINAL_PUBLICATION_BLOCKED_FRAGMENT),
      true,
      TERMINAL_PUBLICATION_BLOCKED_ASSERTION,
    );
    assert.equal(
      timeoutMessage.includes(TERMINAL_PUBLICATION_READY_FRAGMENT),
      false,
      TERMINAL_PUBLICATION_READY_ASSERTION,
    );
    assert.equal(
      timeoutMessage.includes(TERMINAL_PUBLICATION_PROGRESS_FRAGMENT),
      true,
      TERMINAL_PUBLICATION_PROGRESS_ASSERTION,
    );
    assert.equal(
      capturedErrors[TERMINAL_PUBLICATION_ZERO_COUNT]?.diagnostics?.activeGate
        ?.progress?.publicationStatus,
      ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
    );
    assert.equal(
      capturedErrors[TERMINAL_PUBLICATION_ZERO_COUNT]?.diagnostics?.activeGate
        ?.progress?.pendingAckCount,
      TERMINAL_PUBLICATION_SINGLE_COUNT,
    );
    assert.equal(
      capturedErrors[TERMINAL_PUBLICATION_ZERO_COUNT]?.diagnostics?.activeGate
        ?.progress?.missingPublishedCount,
      missingPublishedNodeIds.length,
    );
  });

  test(
    'Unit: _extractControlSnapshotCoverageDiagnostics rebuilds stale embedded' +
    ' publication evidence from the canonical gate and closure witness',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
      'publication_converged_priority_spread_pending';
      const STALE_PRIORITY_RECOVERY_PROGRESS_CLASS =
      'eligible_but_no_operation_created';
      const STALE_PRIORITY_RECOVERY_BLOCKER =
      'priority_recovery_progress_class=' +
      STALE_PRIORITY_RECOVERY_PROGRESS_CLASS;

      const snapshotDiagnostics = cluster._extractControlSnapshotCoverageDiagnostics({
        rows: [{
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 23,
              publicationStatus: 'PUBLISHED',
              recoveryProtocolState: 'steady_published',
              priorityRecoveryReasonCodes: [
                'priority_partitions_not_spread',
              ],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
              pendingAckNodeIds: [],
              publishedActiveNodeIds: ['seed-1', 'joiner-1'],
            },
            publicationConvergenceGate: {
              publicationEpoch: 23,
              publicationStatus: 'PUBLISHED',
              recoveryProtocolState: 'priority_spread_pending',
              reasonCodes: ['priority_partitions_not_spread'],
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
              pendingAckNodeIds: [],
              prioritySpreadPending: true,
              ready: false,
              active: true,
            },
            activeGateProgress: {
              expectedNodeCount: 2,
              activeNodeCount: 2,
              inactiveNodeCount: 0,
              snapshotCoverageNodeCount: 2,
              snapshotCoverageComplete: true,
              publicationStatus: 'PUBLISHED',
              recoveryProtocolState: 'priority_spread_pending',
              pendingAckCount: 0,
              missingPublishedCount: 0,
              gateReasonCount: 0,
              gateReasons: [],
              prioritySpreadSatisfied: false,
              priorityBlockedPartitionCount: 1,
              priorityRecoveryProgressClasses: {
                partitionIdsByClass: {
                  [STALE_PRIORITY_RECOVERY_PROGRESS_CLASS]: [
                    'replica_operations-p1',
                  ],
                },
                unresolvedClassIds: [
                  STALE_PRIORITY_RECOVERY_PROGRESS_CLASS,
                ],
                unresolvedClassCount: 1,
                partitionIdsBySemanticState: {
                  needs_operation: ['replica_operations-p1'],
                },
                unresolvedSemanticStateIds: ['needs_operation'],
                unresolvedSemanticStateCount: 1,
                blockedPartitionIds: ['replica_operations-p1'],
                blockedPartitionCount: 1,
              },
              priorityRecoveryUnresolvedClassCount: 1,
              priorityRecoveryUnresolvedSemanticStateCount: 1,
              priorityRecoveryBlockedPartitionCount: 1,
              blockers: [STALE_PRIORITY_RECOVERY_BLOCKER],
              blockerSignature: STALE_PRIORITY_RECOVERY_BLOCKER,
            },
            priorityRecoveryObservation: {
              publicationEpoch: 23,
              publicationStatus: 'PUBLISHED',
              recoveryProtocolState: 'priority_spread_pending',
              priorityRecoveryReasonCodes: [
                'priority_partitions_not_spread',
              ],
              prioritySpreadPending: true,
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitionCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  spreadGap: 1,
                }],
              },
              priorityRecoveryBlockedPartitionIds: ['replica_operations-p1'],
              priorityRecoveryBlockedPartitionCount: 1,
            },
            priorityRecoveryDecisionSnapshots: {
              schemaVersion: 1,
              publicationEpoch: 23,
              closureWitness: {
                state: 'closure_satisfied_stale_publication',
                prioritySpreadPending: false,
                publicationRefreshRequired: true,
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                refreshedPriorityPartitionSummary: {
                  satisfied: true,
                  requiredDistinctNodeCount: 3,
                  readyEligibleNodeCount: 3,
                  totalPriorityPartitionCount: 1,
                  missingPartitionIds: [],
                  blockedPartitions: [],
                  blockedPartitionCount: 0,
                  largestSpreadGap: 0,
                  totalSpreadGap: 0,
                },
              },
              priorityPartitionSummary: {
                satisfied: true,
                requiredDistinctNodeCount: 3,
                readyEligibleNodeCount: 3,
                totalPriorityPartitionCount: 1,
                missingPartitionIds: [],
                blockedPartitions: [],
                blockedPartitionCount: 0,
                largestSpreadGap: 0,
                totalSpreadGap: 0,
              },
              partitionIdsBySemanticState: {},
              snapshots: [],
            },
            priorityRecoveryInvariants: {
              invariants: [],
              failingInvariantIds: [],
              failingInvariantReasonCodes: [],
              passed: true,
            },
          },
        }],
      });

      assert.equal(
        snapshotDiagnostics.publicationConvergence.prioritySpreadPending,
        false,
      );
      assert.deepEqual(
        snapshotDiagnostics.publicationConvergence.priorityRecoveryReasonCodes,
        [],
      );
      assert.equal(
        snapshotDiagnostics.publicationConvergence.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        snapshotDiagnostics.publicationConvergenceGate.ready,
        true,
      );
      assert.equal(
        snapshotDiagnostics.priorityRecoveryObservation.prioritySpreadPending,
        false,
      );
      assert.equal(
        snapshotDiagnostics.priorityRecoveryObservation.closureRecordId,
        CLOSURE_RECORD_ID,
      );
      assert.equal(
        snapshotDiagnostics.priorityRecoveryObservation.activeGateProgress
          .prioritySpreadSatisfied,
        true,
      );
      assert.equal(
        snapshotDiagnostics.priorityRecoveryObservation.activeGateProgress
          .priorityRecoveryBlockedPartitionCount,
        0,
      );
      assert.deepEqual(
        snapshotDiagnostics.priorityRecoveryObservation.activeGateProgress
          .blockers,
        ['ready'],
      );
    },
  );

  test(
    'Unit: _extractControlSnapshotCoverageDiagnostics preserves owner queue' +
    ' detail fields',
    async () => {
      const cluster = createCluster({
        size: 1,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });
      const ownerKey = 'membership-publication:cluster_membership';

      const snapshotDiagnostics = cluster._extractControlSnapshotCoverageDiagnostics({
        rows: [{
          controlPlaneDiagnostics: {
            logsTable: {
              pendingWrites: 1.9,
              pendingWriteGrowthCount: 0,
              retainedBacklogGrowthCount: 1,
              sharedPressureBackpressured: false,
              transportPressureBackpressured: false,
              queryPressureBackpressured: false,
              ownerKey,
              pendingKeys: [ownerKey, ownerKey],
              retryingKeys: [ownerKey],
              inFlightKeys: ['membership-publication:other'],
              retryableDrainFailureCount: 2.8,
            },
          },
        }],
      });

      assert.deepEqual(snapshotDiagnostics.controlPlaneOwnerQueueDepth, {
        pendingWrites: 1,
        pendingWriteGrowthCount: 0,
        retainedBacklogGrowthCount: 1,
        sharedPressureBackpressured: false,
        transportPressureBackpressured: false,
        queryPressureBackpressured: false,
        ownerKey,
        pendingKeys: [ownerKey],
        retryingKeys: [ownerKey],
        inFlightKeys: ['membership-publication:other'],
        retryableDrainFailureCount: 2,
      });
    },
  );

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
}
