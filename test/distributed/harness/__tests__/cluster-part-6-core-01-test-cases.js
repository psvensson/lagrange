export function registerClusterPart6Core01Tests(context) {
  const {
    ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS,
    ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
    ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
    assert,
    createCluster,
    formatPublicationConvergenceGate,
    NODE_ROLES,
    PRIORITY_RECOVERY_PROGRESS_CORRELATION_KEY,
    PRIORITY_RECOVERY_PROGRESS_EPOCH,
    PRIORITY_RECOVERY_PROGRESS_OPERATION_BLOCKER,
    PRIORITY_RECOVERY_PROGRESS_OPERATION_ID,
    PRIORITY_RECOVERY_PROGRESS_OPERATION_STALLED,
    PRIORITY_RECOVERY_PROGRESS_PARTITION_ID,
    PRIORITY_RECOVERY_PROGRESS_SPREAD_SATISFIED,
    PRIORITY_RECOVERY_PROGRESS_STALE_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
    PRIORITY_RECOVERY_PROGRESS_TARGET_CAPTURED_AT_MS,
    PRIORITY_RECOVERY_PROGRESS_TARGET_PROGRESS_AT_MS,
    PUBLICATION_GATE_SUMMARY_EXPECTED,
    PUBLICATION_GATE_SUMMARY_MISSING_NODE_IDS,
    PUBLICATION_GATE_SUMMARY_PENDING_NODE_IDS,
    PUBLICATION_GATE_SUMMARY_RECOVERY_PENDING,
    PUBLICATION_GATE_SUMMARY_TEST_NAME,
    selectStartupActiveGateOwnerProgressContinuation,
    summarizePriorityRecoveryProgressClasses,
    test,
  } = context;

  test(
    PUBLICATION_GATE_SUMMARY_TEST_NAME,
    async (t) => {
      const formatted = formatPublicationConvergenceGate(
        {
          ready: true,
          reasons: [],
          publicationStatus: ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED,
        },
        {
          snapshotCoverage: {
            selectedPublicationConvergence: {
              publicationStatus: ACTIVE_WAIT_PUBLICATION_STATUS_ACK_PENDING,
              recoveryProtocolState: PUBLICATION_GATE_SUMMARY_RECOVERY_PENDING,
            },
            selectedPendingAckNodeIds: PUBLICATION_GATE_SUMMARY_PENDING_NODE_IDS,
            selectedMissingPublishedNodeIds:
            PUBLICATION_GATE_SUMMARY_MISSING_NODE_IDS,
          },
        },
      );

      t.equal(formatted, PUBLICATION_GATE_SUMMARY_EXPECTED);
    },
  );

  test(
    'Unit: summarizePriorityRecoveryProgressClasses uses the latest partition snapshot state',
    async () => {
      const summary = summarizePriorityRecoveryProgressClasses({
        snapshots: [{
          partitionId: 'replica_operations-p1',
          epoch: 4,
          correlationKey: 'replica_operations-p1|4|op-stale',
          semanticState: 'recovering_in_flight',
          blockerReasons: [],
          planner: {
            ready: false,
          },
          spreadCompletion: {
            satisfied: false,
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: 'op-stale',
              updatedAtMs: 4000,
            },
          },
        }, {
          partitionId: 'replica_operations-p1',
          epoch: 6,
          correlationKey: 'replica_operations-p1|6|op-current',
          semanticState: 'converged',
          blockerReasons: [],
          planner: {
            ready: true,
          },
          spreadCompletion: {
            satisfied: true,
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: 'op-current',
              updatedAtMs: 6000,
            },
          },
        }],
      });

      assert.deepEqual(summary.unresolvedSemanticStateIds, []);
      assert.deepEqual(
        summary.partitionIdsBySemanticState.converged,
        ['replica_operations-p1'],
      );
      assert.deepEqual(
        summary.partitionIdsBySemanticState.recovering_in_flight,
        [],
      );
    },
  );

  test(
    'Unit: summarizePriorityRecoveryProgressClasses accepts current-summary snapshots',
    async () => {
      const summary = summarizePriorityRecoveryProgressClasses({
        snapshots: [{
          partitionId: 'control_plane_publications-p1',
          semanticState: 'converged',
          coordinator: {
            operation: {
              operationId: 'score-neutral-stale-op',
              updatedAtMs: 100,
            },
          },
        }],
        blockerPartitionIdsByReason: {
          operation_created_but_no_step_transitions: [
            'control_plane_publications-p1',
          ],
        },
        partitionIdsBySemanticState: {
          recovering_in_flight: [
            'control_plane_publications-p1',
          ],
        },
        partitionSnapshots: [{
          partitionId: 'control_plane_publications-p1',
          semanticStateId: 'recovering_in_flight',
          progressClassIds: [
            'operation_created_but_no_step_transitions',
          ],
          currentOwner: 'operation_workflow_owner',
          blockingBoundary: 'workflow_progress',
          waitMode: 'event_driven',
          nextRequiredAction: 'advance_existing_operation',
          snapshotCapturedAt: 200,
        }],
      });

      assert.deepEqual(
        summary.partitionIdsBySemanticState.recovering_in_flight,
        ['control_plane_publications-p1'],
      );
      assert.deepEqual(
        summary.partitionIdsByClass
          .operation_created_but_no_step_transitions,
        ['control_plane_publications-p1'],
      );
      assert.equal(summary.unresolvedSemanticStateCount, 1);
      assert.equal(summary.blockedPartitionCount, 1);
    },
  );

  test(
    'Unit: startup owner progress accepts current-summary witness freshness',
    async () => {
      const continuation = selectStartupActiveGateOwnerProgressContinuation({
        readinessMode: 'startup',
        attemptsSinceProgress: 1,
        pollIntervalMs: 1000,
        progressSnapshot: {
          closureRecordId: 'CL-006',
          closureWitnessClass: 'startup_active_publication_lag',
          priorityRecoveryProgressClasses: {
            unresolvedSemanticStateIds: ['recovering_in_flight'],
          },
        },
        probeResult: {
          snapshotCoverage: {
            selectedPriorityRecoveryDecisionSnapshots: {
              snapshots: [{
                partitionId: 'control_plane_publications-p1',
                semanticState: 'converged',
              }],
            },
            selectedPublicationConvergence: {
              priorityRecoveryCurrentSummary: {
                partitionSnapshots: [{
                  partitionId: 'control_plane_publications-p1',
                  semanticStateId: 'recovering_in_flight',
                  currentOwner: 'operation_workflow_owner',
                  blockingBoundary: 'workflow_progress',
                  waitMode: 'event_driven',
                  nextRequiredAction: 'advance_existing_operation',
                  stepAgeMs: 1,
                  stepTimeoutMs: 30,
                  snapshotCapturedAt: 123,
                }],
              },
            },
          },
        },
      });

      assert.equal(continuation.continuePolling, true);
      assert.equal(continuation.reasonCode, 'owner_step_deadline');
      assert.equal(continuation.extendMs, 1000);
    },
  );

  test(
    'Unit: summarizePriorityRecoveryProgressClasses prefers target progress over stale captured blockers',
    async () => {
      const summary = summarizePriorityRecoveryProgressClasses({
        snapshots: [{
          partitionId: PRIORITY_RECOVERY_PROGRESS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_PROGRESS_EPOCH,
          correlationKey: PRIORITY_RECOVERY_PROGRESS_CORRELATION_KEY,
          operationId: PRIORITY_RECOVERY_PROGRESS_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_PROGRESS_SPREAD_SATISFIED,
          blockerReasons: [],
          spreadCompletion: {
            satisfied: true,
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: PRIORITY_RECOVERY_PROGRESS_OPERATION_ID,
              updatedAtMs:
              PRIORITY_RECOVERY_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
              targetServiceProgressAtMs:
              PRIORITY_RECOVERY_PROGRESS_TARGET_PROGRESS_AT_MS,
            },
          },
          progress: {
            lastProgressAtMs:
            PRIORITY_RECOVERY_PROGRESS_TARGET_PROGRESS_AT_MS,
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_PROGRESS_TARGET_CAPTURED_AT_MS,
            },
          },
        }, {
          partitionId: PRIORITY_RECOVERY_PROGRESS_PARTITION_ID,
          epoch: PRIORITY_RECOVERY_PROGRESS_EPOCH,
          correlationKey: PRIORITY_RECOVERY_PROGRESS_CORRELATION_KEY,
          operationId: PRIORITY_RECOVERY_PROGRESS_OPERATION_ID,
          semanticState: PRIORITY_RECOVERY_PROGRESS_OPERATION_STALLED,
          blockerReasons: [
            PRIORITY_RECOVERY_PROGRESS_OPERATION_BLOCKER,
          ],
          spreadCompletion: {
            satisfied: false,
          },
          coordinator: {
            operationCount: 1,
            operation: {
              operationId: PRIORITY_RECOVERY_PROGRESS_OPERATION_ID,
              updatedAtMs:
              PRIORITY_RECOVERY_PROGRESS_STALE_OPERATION_UPDATED_AT_MS,
            },
          },
          observation: {
            provenance: {
              capturedAt: PRIORITY_RECOVERY_PROGRESS_STALE_CAPTURED_AT_MS,
            },
          },
        }],
      });

      assert.deepEqual(summary.unresolvedSemanticStateIds, []);
      assert.deepEqual(
        summary.partitionIdsBySemanticState[
          PRIORITY_RECOVERY_PROGRESS_SPREAD_SATISFIED
        ],
        [PRIORITY_RECOVERY_PROGRESS_PARTITION_ID],
      );
      assert.deepEqual(
        summary.partitionIdsByClass[
          PRIORITY_RECOVERY_PROGRESS_OPERATION_BLOCKER
        ],
        [],
      );
    },
  );

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
          activeWaitNoProgressMaxAttempts: 0,
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

  test('Unit: _waitForAllActive continues once for fresh startup owner progress',
    async () => {
      const STARTUP_OWNER_PROGRESS_START_MS = 1000;
      const STARTUP_OWNER_PROGRESS_TIMEOUT_MS = 10;
      const STARTUP_OWNER_PROGRESS_POLL_ADVANCE_MS = 11;
      const STARTUP_OWNER_PROGRESS_CLUSTER_SIZE = 3;
      const STARTUP_OWNER_PROGRESS_SEED_ID = 'seed-1';
      const STARTUP_OWNER_PROGRESS_JOINER_A_ID = 'joiner-1';
      const STARTUP_OWNER_PROGRESS_JOINER_B_ID = 'joiner-2';
      const STARTUP_OWNER_PROGRESS_OPERATION_ID = 'owner-progress-op';
      const STARTUP_OWNER_PROGRESS_PARTITION_ID =
        'control_plane_publications-p1';
      const STARTUP_OWNER_PROGRESS_PUBLICATION = 'PUBLISHED';
      const STARTUP_OWNER_PROGRESS_RECOVERY_STATE =
        'priority_spread_pending';
      const STARTUP_OWNER_PROGRESS_ACTIVE_STATE = 'active';
      const STARTUP_OWNER_PROGRESS_ADMIN_SOURCE = 'admin_ws';
      const STARTUP_OWNER_PROGRESS_OWNER = 'operation_workflow_owner';
      const STARTUP_OWNER_PROGRESS_BOUNDARY = 'workflow_progress';
      const STARTUP_OWNER_PROGRESS_WAIT_MODE = 'event_driven';
      const STARTUP_OWNER_PROGRESS_ACTION = 'advance_existing_operation';
      const STARTUP_OWNER_PROGRESS_PHASE = 'dispatch_pending';
      const STARTUP_OWNER_PROGRESS_SEMANTIC = 'recovering_in_flight';
      const STARTUP_OWNER_PROGRESS_ACTUATION =
        'dispatched_waiting_progress';
      const STARTUP_OWNER_PROGRESS_STEP_AGE_MS = 1;
      const STARTUP_OWNER_PROGRESS_STEP_TIMEOUT_MS = 30;
      const STARTUP_OWNER_PROGRESS_ZERO_COUNT = 0;
      const STARTUP_OWNER_PROGRESS_TWO_COUNT = 2;
      const STARTUP_OWNER_PROGRESS_THREE_COUNT = 3;

      const cluster = createCluster({
        size: STARTUP_OWNER_PROGRESS_CLUSTER_SIZE,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {
          convergence: STARTUP_OWNER_PROGRESS_TIMEOUT_MS,
          activeWaitNoProgressMaxAttempts: STARTUP_OWNER_PROGRESS_ZERO_COUNT,
        },
      });
      const startupOwnerProgressResolvedTimeoutMs =
        cluster._resolveActiveWaitTimeoutMs();

      let nowMs = STARTUP_OWNER_PROGRESS_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => nowMs;
      let probeCount = STARTUP_OWNER_PROGRESS_ZERO_COUNT;
      const probeDeadlineObservations = [];
      let collectedFailureLogs = false;
      cluster._sleep = async (ms) => {
        nowMs += Math.max(STARTUP_OWNER_PROGRESS_ZERO_COUNT, Number(ms) || 0);
      };
      cluster._collectFailureLogs = async () => {
        collectedFailureLogs = true;
      };
      cluster._recordClusterStage = () => {};

      const nodeDiagnostics = [{
        nodeId: STARTUP_OWNER_PROGRESS_SEED_ID,
        active: true,
        state: STARTUP_OWNER_PROGRESS_ACTIVE_STATE,
      }, {
        nodeId: STARTUP_OWNER_PROGRESS_JOINER_A_ID,
        active: true,
        state: STARTUP_OWNER_PROGRESS_ACTIVE_STATE,
      }, {
        nodeId: STARTUP_OWNER_PROGRESS_JOINER_B_ID,
        active: true,
        state: STARTUP_OWNER_PROGRESS_ACTIVE_STATE,
      }];
      const priorityRecoveryDecisionSnapshots = {
        snapshots: [{
          partitionId: STARTUP_OWNER_PROGRESS_PARTITION_ID,
          semanticState: STARTUP_OWNER_PROGRESS_SEMANTIC,
          actuation: {
            owner: STARTUP_OWNER_PROGRESS_OWNER,
            state: STARTUP_OWNER_PROGRESS_ACTUATION,
            workflowProgressPhaseId: STARTUP_OWNER_PROGRESS_PHASE,
            stepAgeMs: STARTUP_OWNER_PROGRESS_STEP_AGE_MS,
            stepTimeoutMs: STARTUP_OWNER_PROGRESS_STEP_TIMEOUT_MS,
          },
          progress: {
            currentOwner: STARTUP_OWNER_PROGRESS_OWNER,
            blockingBoundary: STARTUP_OWNER_PROGRESS_BOUNDARY,
            waitMode: STARTUP_OWNER_PROGRESS_WAIT_MODE,
            nextRequiredAction: STARTUP_OWNER_PROGRESS_ACTION,
            workflowProgressPhaseId: STARTUP_OWNER_PROGRESS_PHASE,
            stepAgeMs: STARTUP_OWNER_PROGRESS_STEP_AGE_MS,
            stepTimeoutMs: STARTUP_OWNER_PROGRESS_STEP_TIMEOUT_MS,
          },
          coordinator: {
            operation: {
              operationId: STARTUP_OWNER_PROGRESS_OPERATION_ID,
            },
          },
        }],
      };
      const partialProgressProbe = {
        allActive: false,
        nodeDiagnostics,
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: STARTUP_OWNER_PROGRESS_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_OWNER_PROGRESS_TWO_COUNT,
          selectedNodeId: STARTUP_OWNER_PROGRESS_SEED_ID,
          selectedAdminReady: true,
          selectedReachableBy: STARTUP_OWNER_PROGRESS_ADMIN_SOURCE,
          selectedError: null,
          selectedPublicationConvergence: {
            publicationStatus: STARTUP_OWNER_PROGRESS_PUBLICATION,
            recoveryProtocolState: STARTUP_OWNER_PROGRESS_RECOVERY_STATE,
            publishedActiveNodeIds: [
              STARTUP_OWNER_PROGRESS_SEED_ID,
              STARTUP_OWNER_PROGRESS_JOINER_A_ID,
            ],
            pendingAckNodeIds: [],
          },
          selectedPublishedActiveNodeIds: [
            STARTUP_OWNER_PROGRESS_SEED_ID,
            STARTUP_OWNER_PROGRESS_JOINER_A_ID,
          ],
          selectedMissingPublishedNodeIds: [
            STARTUP_OWNER_PROGRESS_JOINER_B_ID,
          ],
          selectedPriorityRecoveryDecisionSnapshots:
            priorityRecoveryDecisionSnapshots,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: [],
          publicationStatus: STARTUP_OWNER_PROGRESS_PUBLICATION,
          recoveryProtocolState: STARTUP_OWNER_PROGRESS_RECOVERY_STATE,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [
            STARTUP_OWNER_PROGRESS_JOINER_B_ID,
          ],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: STARTUP_OWNER_PROGRESS_THREE_COUNT,
            totalSpreadGap: STARTUP_OWNER_PROGRESS_ZERO_COUNT,
          },
          priorityRecoveryDecisionSnapshots,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };

      cluster._probeClusterActiveState = async (probeDeadline) => {
        probeDeadlineObservations.push({
          deadline: probeDeadline,
          nowMs,
        });
        probeCount += 1;
        if (probeCount === 1) {
          nowMs += STARTUP_OWNER_PROGRESS_POLL_ADVANCE_MS;
          return partialProgressProbe;
        }
        return {
          allActive: true,
          nodeDiagnostics,
          snapshotCoverage: {
            completeCoverage: true,
            expectedNodeCount: STARTUP_OWNER_PROGRESS_CLUSTER_SIZE,
            bestCoverageNodeCount: STARTUP_OWNER_PROGRESS_CLUSTER_SIZE,
          },
          publicationConvergenceGate: {
            ready: true,
            reasons: [],
            publicationStatus: STARTUP_OWNER_PROGRESS_PUBLICATION,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: STARTUP_OWNER_PROGRESS_ZERO_COUNT,
              totalSpreadGap: STARTUP_OWNER_PROGRESS_ZERO_COUNT,
            },
          },
          priorityRecoveryInvariants: {
            invariants: [],
            failingInvariantIds: [],
            failingInvariantReasonCodes: [],
            passed: true,
          },
        };
      };

      try {
        const activeGate = await cluster._waitForAllActive();
        assert.equal(activeGate.state, 'ready');
        assert.equal(
          probeCount,
          STARTUP_OWNER_PROGRESS_TWO_COUNT,
          'fresh owner-progress evidence should get one bounded continuation',
        );
        assert.equal(
          collectedFailureLogs,
          false,
          'bounded continuation should avoid startup timeout failure logs',
        );
        assert.equal(
          probeDeadlineObservations.length,
          STARTUP_OWNER_PROGRESS_TWO_COUNT,
          'probe should observe both the original and continued deadlines',
        );
        assert.equal(
          probeDeadlineObservations[0].deadline,
          STARTUP_OWNER_PROGRESS_START_MS +
            startupOwnerProgressResolvedTimeoutMs,
          'first probe should use the resolved active-wait deadline',
        );
        assert.ok(
          probeDeadlineObservations[1].deadline >
            probeDeadlineObservations[0].deadline,
          'second probe should receive the extended active-wait deadline',
        );
        assert.ok(
          probeDeadlineObservations[1].deadline >
            probeDeadlineObservations[1].nowMs,
          'continued probe should receive a future deadline',
        );
      } finally {
        Date.now = originalDateNow;
      }
    });

  test(
    'Unit: _waitForAllActive continues once for published startup owner progress',
    async () => {
      const STARTUP_PUBLISHED_PROGRESS_START_MS = 2000;
      const STARTUP_PUBLISHED_PROGRESS_TIMEOUT_MS = 10;
      const STARTUP_PUBLISHED_PROGRESS_POLL_ADVANCE_MS = 11;
      const STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE = 3;
      const STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT = 0;
      const STARTUP_PUBLISHED_PROGRESS_ONE_COUNT = 1;
      const STARTUP_PUBLISHED_PROGRESS_TWO_COUNT = 2;
      const STARTUP_PUBLISHED_PROGRESS_SEED_ID = 'seed-1';
      const STARTUP_PUBLISHED_PROGRESS_JOINER_A_ID = 'joiner-1';
      const STARTUP_PUBLISHED_PROGRESS_JOINER_B_ID = 'joiner-2';
      const STARTUP_PUBLISHED_PROGRESS_OPERATION_ID =
        'published-owner-progress-op';
      const STARTUP_PUBLISHED_PROGRESS_PARTITION_ID =
        'sql_write_operations-p1';
      const STARTUP_PUBLISHED_PROGRESS_PUBLICATION = 'PUBLISHED';
      const STARTUP_PUBLISHED_PROGRESS_RECOVERY_STATE =
        'priority_spread_pending';
      const STARTUP_PUBLISHED_PROGRESS_OWNER = 'operation_workflow_owner';
      const STARTUP_PUBLISHED_PROGRESS_BOUNDARY = 'workflow_progress';
      const STARTUP_PUBLISHED_PROGRESS_WAIT_MODE = 'event_driven';
      const STARTUP_PUBLISHED_PROGRESS_ACTION =
        'wait_for_operation_progress';
      const STARTUP_PUBLISHED_PROGRESS_PHASE = 'target_creation';
      const STARTUP_PUBLISHED_PROGRESS_SEMANTIC = 'recovering_in_flight';
      const STARTUP_PUBLISHED_PROGRESS_ACTUATION =
        'dispatched_waiting_progress';
      const STARTUP_PUBLISHED_PROGRESS_STEP_AGE_MS = 1;
      const STARTUP_PUBLISHED_PROGRESS_STEP_TIMEOUT_MS = 30;

      const cluster = createCluster({
        size: STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {
          convergence: STARTUP_PUBLISHED_PROGRESS_TIMEOUT_MS,
          activeWaitNoProgressMaxAttempts:
            STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
        },
      });
      const resolvedTimeoutMs = cluster._resolveActiveWaitTimeoutMs();

      let nowMs = STARTUP_PUBLISHED_PROGRESS_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => nowMs;
      let probeCount = STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT;
      const probeDeadlineObservations = [];
      let collectedFailureLogs = false;
      cluster._sleep = async (ms) => {
        nowMs += Math.max(
          STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
          Number(ms) || 0,
        );
      };
      cluster._collectFailureLogs = async () => {
        collectedFailureLogs = true;
      };
      cluster._recordClusterStage = () => {};

      const activeDiagnostics = [{
        nodeId: STARTUP_PUBLISHED_PROGRESS_SEED_ID,
        active: true,
        state: 'active',
      }, {
        nodeId: STARTUP_PUBLISHED_PROGRESS_JOINER_A_ID,
        active: true,
        state: 'active',
      }, {
        nodeId: STARTUP_PUBLISHED_PROGRESS_JOINER_B_ID,
        active: true,
        state: 'active',
      }];
      const degradedDiagnostics = activeDiagnostics.map((diagnostic, index) => ({
        ...diagnostic,
        active: index < STARTUP_PUBLISHED_PROGRESS_TWO_COUNT,
        state:
          index < STARTUP_PUBLISHED_PROGRESS_TWO_COUNT ?
            'active' :
            'inactive',
      }));
      const allNodeIds = [
        STARTUP_PUBLISHED_PROGRESS_SEED_ID,
        STARTUP_PUBLISHED_PROGRESS_JOINER_A_ID,
        STARTUP_PUBLISHED_PROGRESS_JOINER_B_ID,
      ];
      const priorityRecoveryDecisionSnapshots = {
        snapshots: [{
          partitionId: STARTUP_PUBLISHED_PROGRESS_PARTITION_ID,
          semanticState: STARTUP_PUBLISHED_PROGRESS_SEMANTIC,
          actuation: {
            owner: STARTUP_PUBLISHED_PROGRESS_OWNER,
            state: STARTUP_PUBLISHED_PROGRESS_ACTUATION,
            workflowProgressPhaseId: STARTUP_PUBLISHED_PROGRESS_PHASE,
            stepAgeMs: STARTUP_PUBLISHED_PROGRESS_STEP_AGE_MS,
            stepTimeoutMs: STARTUP_PUBLISHED_PROGRESS_STEP_TIMEOUT_MS,
          },
          progress: {
            currentOwner: STARTUP_PUBLISHED_PROGRESS_OWNER,
            blockingBoundary: STARTUP_PUBLISHED_PROGRESS_BOUNDARY,
            waitMode: STARTUP_PUBLISHED_PROGRESS_WAIT_MODE,
            nextRequiredAction: STARTUP_PUBLISHED_PROGRESS_ACTION,
            workflowProgressPhaseId: STARTUP_PUBLISHED_PROGRESS_PHASE,
            stepAgeMs: STARTUP_PUBLISHED_PROGRESS_STEP_AGE_MS,
            stepTimeoutMs: STARTUP_PUBLISHED_PROGRESS_STEP_TIMEOUT_MS,
          },
          coordinator: {
            operation: {
              operationId: STARTUP_PUBLISHED_PROGRESS_OPERATION_ID,
            },
          },
        }],
      };
      const publishedProgressProbe = {
        allActive: false,
        nodeDiagnostics: degradedDiagnostics,
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE,
          selectedNodeId: STARTUP_PUBLISHED_PROGRESS_SEED_ID,
          selectedAdminReady: true,
          selectedReachableBy: 'admin_ws',
          selectedPublicationConvergence: {
            publicationStatus: STARTUP_PUBLISHED_PROGRESS_PUBLICATION,
            recoveryProtocolState: STARTUP_PUBLISHED_PROGRESS_RECOVERY_STATE,
            publishedActiveNodeIds: allNodeIds,
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: false,
              blockedPartitionCount: STARTUP_PUBLISHED_PROGRESS_ONE_COUNT,
              totalSpreadGap: STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
            },
          },
          selectedPublishedActiveNodeIds: allNodeIds,
          selectedMissingPublishedNodeIds: [],
          selectedPriorityRecoveryDecisionSnapshots:
            priorityRecoveryDecisionSnapshots,
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: [],
          publicationStatus: STARTUP_PUBLISHED_PROGRESS_PUBLICATION,
          recoveryProtocolState: STARTUP_PUBLISHED_PROGRESS_RECOVERY_STATE,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: false,
            blockedPartitionCount: STARTUP_PUBLISHED_PROGRESS_ONE_COUNT,
            totalSpreadGap: STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
          },
          priorityRecoveryDecisionSnapshots,
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
      const readyProbe = {
        allActive: true,
        nodeDiagnostics: activeDiagnostics,
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_PUBLISHED_PROGRESS_CLUSTER_SIZE,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: STARTUP_PUBLISHED_PROGRESS_PUBLICATION,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
            totalSpreadGap: STARTUP_PUBLISHED_PROGRESS_ZERO_COUNT,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };

      cluster._probeClusterActiveState = async (probeDeadline) => {
        probeDeadlineObservations.push({
          deadline: probeDeadline,
          nowMs,
        });
        probeCount += 1;
        if (probeCount === STARTUP_PUBLISHED_PROGRESS_ONE_COUNT) {
          nowMs += STARTUP_PUBLISHED_PROGRESS_POLL_ADVANCE_MS;
          return publishedProgressProbe;
        }
        return readyProbe;
      };

      try {
        const activeGate = await cluster._waitForAllActive();
        assert.equal(activeGate.state, 'ready');
        assert.equal(
          probeCount,
          STARTUP_PUBLISHED_PROGRESS_TWO_COUNT,
          'published owner-progress evidence should get one bounded continuation',
        );
        assert.equal(
          collectedFailureLogs,
          false,
          'bounded published owner-progress continuation should avoid failure logs',
        );
        assert.equal(
          probeDeadlineObservations.length,
          STARTUP_PUBLISHED_PROGRESS_TWO_COUNT,
          'probe should observe the original and continued deadlines',
        );
        assert.equal(
          probeDeadlineObservations[0].deadline,
          STARTUP_PUBLISHED_PROGRESS_START_MS + resolvedTimeoutMs,
          'first probe should use the resolved active-wait deadline',
        );
        assert.ok(
          probeDeadlineObservations[1].deadline >
            probeDeadlineObservations[0].deadline,
          'second probe should receive the extended active-wait deadline',
        );
        assert.ok(
          probeDeadlineObservations[1].deadline >
            probeDeadlineObservations[1].nowMs,
          'continued probe should receive a future deadline',
        );
      } finally {
        Date.now = originalDateNow;
      }
    },
  );

  test('Unit: _waitForAllActive continues once for startup snapshot repair retry',
    async () => {
      const STARTUP_SNAPSHOT_REPAIR_START_MS = 1000;
      const STARTUP_SNAPSHOT_REPAIR_TIMEOUT_MS = 2000;
      const STARTUP_SNAPSHOT_REPAIR_CLUSTER_SIZE = 5;
      const STARTUP_SNAPSHOT_REPAIR_RETRY_AFTER_MS = 250;
      const STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT = 0;
      const STARTUP_SNAPSHOT_REPAIR_ONE_COUNT = 1;
      const STARTUP_SNAPSHOT_REPAIR_TWO_COUNT = 2;
      const STARTUP_SNAPSHOT_REPAIR_THREE_COUNT = 3;
      const STARTUP_SNAPSHOT_REPAIR_FIVE_COUNT = 5;
      const STARTUP_SNAPSHOT_REPAIR_PUBLICATION = 'PUBLISHED';
      const STARTUP_SNAPSHOT_REPAIR_OWNER_PENDING =
        'owner_reconcile_pending';
      const STARTUP_SNAPSHOT_REPAIR_WAIT_RECOVERY = 'wait_owner_recovery';
      const STARTUP_SNAPSHOT_REPAIR_WRITE_DEFERRED = 'write_deferred';
      const STARTUP_SNAPSHOT_REPAIR_NODE_IDS = Object.freeze([
        'seed-1',
        'joiner-1',
        'joiner-2',
        'joiner-3',
        'joiner-4',
      ]);
      const STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS = Object.freeze([
        STARTUP_SNAPSHOT_REPAIR_NODE_IDS[0],
        STARTUP_SNAPSHOT_REPAIR_NODE_IDS[1],
      ]);
      const STARTUP_SNAPSHOT_REPAIR_MISSING_NODE_IDS = Object.freeze([
        STARTUP_SNAPSHOT_REPAIR_NODE_IDS[2],
        STARTUP_SNAPSHOT_REPAIR_NODE_IDS[3],
        STARTUP_SNAPSHOT_REPAIR_NODE_IDS[4],
      ]);
      const cluster = createCluster({
        size: STARTUP_SNAPSHOT_REPAIR_CLUSTER_SIZE,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
        timeouts: {
          convergence: STARTUP_SNAPSHOT_REPAIR_TIMEOUT_MS,
          activeWaitNoProgressMaxAttempts:
            STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
        },
      });

      let nowMs = STARTUP_SNAPSHOT_REPAIR_START_MS;
      const originalDateNow = Date.now;
      Date.now = () => nowMs;
      let probeCount = STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT;
      const probeDeadlineObservations = [];
      let collectedFailureLogs = false;
      cluster._sleep = async (ms) => {
        nowMs += Math.max(STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT, Number(ms) || 0);
      };
      cluster._collectFailureLogs = async () => {
        collectedFailureLogs = true;
      };
      cluster._recordClusterStage = () => {};

      const activeDiagnostics = STARTUP_SNAPSHOT_REPAIR_NODE_IDS.map((nodeId) => ({
        nodeId,
        active: true,
        state: 'active',
      }));
      const degradedDiagnostics = STARTUP_SNAPSHOT_REPAIR_NODE_IDS.map(
        (nodeId, index) => ({
          nodeId,
          active: index < STARTUP_SNAPSHOT_REPAIR_TWO_COUNT,
          state:
            index < STARTUP_SNAPSHOT_REPAIR_TWO_COUNT ?
              'active' :
              'inactive',
        }),
      );
      const buildPublicationGate = (recoveryProtocolState) => ({
        ready: false,
        reasons: [],
        publicationStatus: STARTUP_SNAPSHOT_REPAIR_PUBLICATION,
        recoveryProtocolState,
        pendingAckNodeIds: [],
        missingPublishedNodeIds: STARTUP_SNAPSHOT_REPAIR_MISSING_NODE_IDS,
        priorityPartitionSummary: {
          satisfied: true,
          blockedPartitionCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
          totalSpreadGap: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
        },
      });
      const bestProgressProbe = {
        allActive: false,
        nodeDiagnostics: activeDiagnostics,
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: STARTUP_SNAPSHOT_REPAIR_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_SNAPSHOT_REPAIR_TWO_COUNT,
          selectedNodeId: STARTUP_SNAPSHOT_REPAIR_NODE_IDS[0],
          selectedAdminReady: true,
          selectedReachableBy: 'admin_ws',
          selectedSnapshotObservationMode: 'forced_repair',
          selectedSnapshotObservationState: 'stale_usable',
          selectedSnapshotObservationContractState: 'pending',
          selectedSnapshotObservationRefreshState: 'applied',
          selectedSnapshotObservationNextAction: 'wait',
          selectedSnapshotObservationReasonCodes: [
            'cache_stale_watermark',
          ],
          selectedPublicationConvergence: {
            publicationEpoch: STARTUP_SNAPSHOT_REPAIR_TWO_COUNT,
            publicationStatus: STARTUP_SNAPSHOT_REPAIR_PUBLICATION,
            recoveryProtocolState: 'priority_spread_pending',
            publishedActiveNodeIds:
              STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS,
            pendingAckNodeIds: [],
          },
          selectedPublishedActiveNodeIds:
            STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
            STARTUP_SNAPSHOT_REPAIR_MISSING_NODE_IDS,
        },
        publicationConvergenceGate:
          buildPublicationGate('priority_spread_pending'),
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
      const repairRetryProbe = {
        allActive: false,
        nodeDiagnostics: degradedDiagnostics,
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: STARTUP_SNAPSHOT_REPAIR_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_SNAPSHOT_REPAIR_TWO_COUNT,
          selectedNodeId: STARTUP_SNAPSHOT_REPAIR_NODE_IDS[1],
          selectedAdminReady: true,
          selectedReachableBy: 'admin_health',
          selectedSnapshotObservationMode: 'repair_deferred',
          selectedSnapshotObservationState: 'deferred_refresh',
          selectedSnapshotObservationContractState: 'deferred',
          selectedSnapshotObservationRefreshState: 'deferred',
          selectedSnapshotObservationNextAction: 'retry',
          selectedSnapshotObservationReasonCodes: [
            'cache_stale_watermark',
            'discovery_node_coverage_gap',
            'selected_timeout',
          ],
          selectedSnapshotObservationRetryAfterMs:
            STARTUP_SNAPSHOT_REPAIR_RETRY_AFTER_MS,
          selectedSnapshotRepairDeferred: true,
          selectedControlPlaneOwnerQueueDepth: {
            pendingWrites: STARTUP_SNAPSHOT_REPAIR_ONE_COUNT,
            pendingWriteGrowthCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
            retainedBacklogGrowthCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
            sharedPressureBackpressured: false,
            transportPressureBackpressured: false,
            queryPressureBackpressured: false,
          },
          selectedPublicationConvergence: {
            publicationEpoch: STARTUP_SNAPSHOT_REPAIR_TWO_COUNT,
            publicationStatus: STARTUP_SNAPSHOT_REPAIR_PUBLICATION,
            recoveryProtocolState: 'steady_published',
            publishedActiveNodeIds:
              STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS,
            pendingAckNodeIds: [],
          },
          selectedPublicationActiveGateHandoff: {
            state: 'pending',
            reasonCode: STARTUP_SNAPSHOT_REPAIR_OWNER_PENDING,
            nextAction: STARTUP_SNAPSHOT_REPAIR_WAIT_RECOVERY,
            runtimePromotionAllowed: false,
            pendingRecoveryNodeIds: [
              STARTUP_SNAPSHOT_REPAIR_NODE_IDS[1],
            ],
            pendingRecoveryCount: STARTUP_SNAPSHOT_REPAIR_ONE_COUNT,
            pendingReconcileNodeIds: [],
            pendingReconcileCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
            missingPublishedNodeIds: [],
            missingPublishedCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
            publishedActiveNodeIds:
              STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS,
          },
          selectedMembershipPublicationHandoffOutcome: {
            state: STARTUP_SNAPSHOT_REPAIR_WRITE_DEFERRED,
            reasonCode: STARTUP_SNAPSHOT_REPAIR_OWNER_PENDING,
            enqueued: true,
            retryAfterMs: STARTUP_SNAPSHOT_REPAIR_RETRY_AFTER_MS,
          },
          selectedPublishedActiveNodeIds:
            STARTUP_SNAPSHOT_REPAIR_PUBLISHED_NODE_IDS,
          selectedMissingPublishedNodeIds:
            STARTUP_SNAPSHOT_REPAIR_MISSING_NODE_IDS,
        },
        publicationConvergenceGate: buildPublicationGate('steady_published'),
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };
      const readyProbe = {
        allActive: true,
        nodeDiagnostics: activeDiagnostics,
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: STARTUP_SNAPSHOT_REPAIR_CLUSTER_SIZE,
          bestCoverageNodeCount: STARTUP_SNAPSHOT_REPAIR_FIVE_COUNT,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: STARTUP_SNAPSHOT_REPAIR_PUBLICATION,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
            totalSpreadGap: STARTUP_SNAPSHOT_REPAIR_ZERO_COUNT,
          },
        },
        priorityRecoveryInvariants: {
          invariants: [],
          failingInvariantIds: [],
          failingInvariantReasonCodes: [],
          passed: true,
        },
      };

      cluster._probeClusterActiveState = async (probeDeadline) => {
        probeDeadlineObservations.push({
          deadline: probeDeadline,
          nowMs,
        });
        probeCount += 1;
        if (probeCount === STARTUP_SNAPSHOT_REPAIR_ONE_COUNT) {
          return bestProgressProbe;
        }
        if (probeCount === STARTUP_SNAPSHOT_REPAIR_TWO_COUNT) {
          nowMs = probeDeadline + STARTUP_SNAPSHOT_REPAIR_ONE_COUNT;
          return repairRetryProbe;
        }
        return readyProbe;
      };

      try {
        const activeGate = await cluster._waitForAllActive({
          timeoutMs: STARTUP_SNAPSHOT_REPAIR_TIMEOUT_MS,
        });
        assert.equal(activeGate.state, 'ready');
        assert.equal(
          probeCount,
          STARTUP_SNAPSHOT_REPAIR_THREE_COUNT,
          'snapshot repair retry should get one bounded continuation',
        );
        assert.equal(
          collectedFailureLogs,
          false,
          'bounded snapshot repair retry should avoid failure logs',
        );
        assert.equal(
          probeDeadlineObservations.length,
          STARTUP_SNAPSHOT_REPAIR_THREE_COUNT,
          'probe should observe original and repaired deadlines',
        );
        assert.ok(
          probeDeadlineObservations[2].deadline >
            probeDeadlineObservations[1].deadline,
          'repair retry probe should receive the extended deadline',
        );
        assert.ok(
          probeDeadlineObservations[2].deadline >
            probeDeadlineObservations[2].nowMs,
          'repair retry continuation should be a future deadline',
        );
      } finally {
        Date.now = originalDateNow;
      }
    });

  test('Unit: _probeClusterActiveState accepts startup partial coverage with live active probes',
    async () => {
      const STARTUP_PARTIAL_SEED_ID = 'seed-1';
      const STARTUP_PARTIAL_JOINER_ONE_ID = 'joiner-1';
      const STARTUP_PARTIAL_JOINER_TWO_ID = 'joiner-2';
      const STARTUP_PARTIAL_NODE_IDS = Object.freeze([
        STARTUP_PARTIAL_SEED_ID,
        STARTUP_PARTIAL_JOINER_ONE_ID,
        STARTUP_PARTIAL_JOINER_TWO_ID,
      ]);
      const STARTUP_PARTIAL_PUBLISHED_NODE_IDS = Object.freeze([
        STARTUP_PARTIAL_SEED_ID,
        STARTUP_PARTIAL_JOINER_ONE_ID,
      ]);
      const STARTUP_PARTIAL_MISSING_NODE_IDS = Object.freeze([
        STARTUP_PARTIAL_JOINER_TWO_ID,
      ]);
      const STARTUP_PARTIAL_BEST_COVERAGE_NODE_COUNT = 2;
      const STARTUP_PARTIAL_DEADLINE_MS = 5000;
      const STARTUP_PARTIAL_HTTP_OK = 200;
      const STARTUP_PARTIAL_PUBLICATION_STATUS = 'PUBLISHED';
      const STARTUP_PARTIAL_ADMIN_HEALTH_SOURCE = 'admin_health';
      const STARTUP_PARTIAL_ZERO_COUNT = 0;

      const cluster = createCluster({
        size: STARTUP_PARTIAL_NODE_IDS.length,
        docker: {socketPath: '/var/run/docker.sock'},
        image: 'distributed-db:test',
      });

      for (const nodeId of STARTUP_PARTIAL_NODE_IDS) {
        cluster._nodes.set(nodeId, {
          id: nodeId,
          role: nodeId === STARTUP_PARTIAL_SEED_ID ?
            NODE_ROLES.SEED :
            NODE_ROLES.JOINER,
          async probeBootstrapReadiness() {
            return {
              status: STARTUP_PARTIAL_HTTP_OK,
              state: 'active',
              reasons: [],
            };
          },
        });
      }

      cluster._probeControlSnapshotCoverage = async () => {
        return {
          completeCoverage: false,
          expectedNodeCount: STARTUP_PARTIAL_NODE_IDS.length,
          bestCoverageNodeCount: STARTUP_PARTIAL_BEST_COVERAGE_NODE_COUNT,
          selectedNodeId: STARTUP_PARTIAL_SEED_ID,
          selectedAdminReady: true,
          selectedReachableBy: STARTUP_PARTIAL_ADMIN_HEALTH_SOURCE,
          selectedPublicationConvergence: {
            publicationStatus: STARTUP_PARTIAL_PUBLICATION_STATUS,
            publishedActiveNodeIds: [...STARTUP_PARTIAL_PUBLISHED_NODE_IDS],
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: STARTUP_PARTIAL_ZERO_COUNT,
              totalSpreadGap: STARTUP_PARTIAL_ZERO_COUNT,
            },
          },
          selectedPublicationConvergenceGate: {
            publicationStatus: STARTUP_PARTIAL_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: STARTUP_PARTIAL_ZERO_COUNT,
              totalSpreadGap: STARTUP_PARTIAL_ZERO_COUNT,
            },
          },
          selectedPublishedActiveNodeIds: [...STARTUP_PARTIAL_PUBLISHED_NODE_IDS],
          selectedMissingPublishedNodeIds: [...STARTUP_PARTIAL_MISSING_NODE_IDS],
        };
      };

      const result = await cluster._probeClusterActiveState(
        Date.now() + STARTUP_PARTIAL_DEADLINE_MS,
      );

      assert.equal(result.allActive, true);
      assert.equal(result.snapshotCoverage.completeCoverage, false);
      assert.deepStrictEqual(
        result.snapshotCoverage.selectedMissingPublishedNodeIds,
        [...STARTUP_PARTIAL_MISSING_NODE_IDS],
      );
      assert.equal(result.priorityRecoveryInvariants.passed, true);
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

  test('Unit: _waitForAllActive keeps forced repair active after threshold',
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
      let forcedRepairCount = 0;

      cluster._sleep = async () => {};
      cluster._collectFailureLogs = async () => {
        throw new Error('should not collect failure logs when ACTIVE wait succeeds');
      };
      cluster._probeClusterActiveState = async (_deadline, options = {}) => {
        const forceRepair = options?.forceRepair === true;
        forceRepairCalls.push(forceRepair);
        if (forceRepair) {
          forcedRepairCount += 1;
          return {
            allActive: forcedRepairCount > 1,
            nodeDiagnostics: [],
            snapshotCoverage: null,
            publicationConvergenceGate: null,
            priorityRecoveryInvariants: {invariants: []},
          };
        }
        return {
          allActive: false,
          nodeDiagnostics: [],
          snapshotCoverage: null,
          publicationConvergenceGate: null,
          priorityRecoveryInvariants: {invariants: []},
        };
      };

      await cluster._waitForAllActive();

      assert.deepEqual(
        forceRepairCalls,
        [true, true],
        'ACTIVE wait should keep forced repair enabled after the threshold until convergence',
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

  test('Unit: _resolveActiveWaitTimeoutMs keeps convergence budget precedence',
    async () => {
      const SCENARIO_DEFAULT_ACTIVE_WAIT_CLUSTER_SIZE = 5;
      const SCENARIO_DEFAULT_ACTIVE_WAIT_CONVERGENCE_MS = 40;
      const SCENARIO_DEFAULT_ACTIVE_WAIT_BASE_MS = 80;
      const SCENARIO_DEFAULT_ACTIVE_WAIT_EXPECTED_MS = 80;
      const SCENARIO_DEFAULT_ACTIVE_WAIT_DOCKER_SOCKET =
      '/var/run/docker.sock';
      const SCENARIO_DEFAULT_ACTIVE_WAIT_IMAGE = 'distributed-db:test';

      const cluster = createCluster({
        size: SCENARIO_DEFAULT_ACTIVE_WAIT_CLUSTER_SIZE,
        docker: {socketPath: SCENARIO_DEFAULT_ACTIVE_WAIT_DOCKER_SOCKET},
        image: SCENARIO_DEFAULT_ACTIVE_WAIT_IMAGE,
        timeouts: {
          convergence: SCENARIO_DEFAULT_ACTIVE_WAIT_CONVERGENCE_MS,
          scenarioDefault: SCENARIO_DEFAULT_ACTIVE_WAIT_BASE_MS,
        },
      });

      assert.equal(
        cluster._resolveActiveWaitBaseTimeoutMs(),
        SCENARIO_DEFAULT_ACTIVE_WAIT_CONVERGENCE_MS,
      );
      assert.equal(
        cluster._resolveActiveWaitTimeoutMs(),
        SCENARIO_DEFAULT_ACTIVE_WAIT_EXPECTED_MS,
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
        entry.details?.activeGate?.state === 'stalled'),
        true,
        'stall diagnostics should be emitted into cluster-stage playback details',
      );
    });
}
