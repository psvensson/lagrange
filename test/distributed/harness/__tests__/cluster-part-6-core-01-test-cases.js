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
