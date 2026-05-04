/**
 * Property-based tests for cluster module.
 *
 * Feature: distributed-testing-framework
 * Property 5: Multi-Host Container Distribution
 *
 * **Validates: Requirements 2.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {validate as uuidValidate} from 'uuid';
import {
  RUNTIME_AUTHORITY_REPAIR_STATE,
} from '../../../../src/control-plane/control-plane-readiness-constants.js';
import {CLUSTER_SEGMENT_2} from '../cluster-segment-2.js';
import {
  CONTROL_PLANE_QUIESCENCE_CRITICAL_SYSTEM_OBSERVATION_STATE,
  CONTROL_PLANE_QUIESCENCE_REASON,
  CONTROL_PLANE_QUIESCENCE_STATE,
} from '../control-plane-quiescence-snapshot.js';
import {
  ACTIVE_WAIT_HANG_TEST_TIMEOUT_MS,
  buildCriticalSystemDiscoverySnapshot,
  CONTAINER_ENV_KEYS,
  createCluster,
  NodeHandle,
  NODE_ROLES,
  PORTS,
  RAFT_PROVIDER_DEFAULTS,
} from './cluster-test-helpers.js';

const {
  summarizePriorityRecoveryProgressClasses,
} = CLUSTER_SEGMENT_2;

const DISCOVERY_REPAIR_TIMEOUT_ERROR =
  'Authoritative discovery repair timed out after 1500ms';
const NODE_STATE_PUBLICATION_PRESSURE_ERROR =
  'Distributed operation failed due to participant failures';
const QUIESCENCE_CACHE_VISIBLE_NODE_ID = 'seed-a';
const QUIESCENCE_CACHE_VISIBLE_PARTITION_ID = 'replica_operations-p1';
const QUIESCENCE_CACHE_VISIBLE_OPERATION_ID = 'op-cache-visible';
const QUIESCENCE_CACHE_VISIBLE_STATUS = 'ACTIVE';
const QUIESCENCE_CACHE_VISIBLE_STEP = 'PENDING';
const QUIESCENCE_CACHE_VISIBLE_VISIBILITY_STATE = 'cache_visible';
const QUIESCENCE_CACHE_VISIBLE_COMPLETION_STATE =
  'spread_satisfied_in_flight';
const QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT = 1;
const QUIESCENCE_CACHE_VISIBLE_EFFECTIVE_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_CACHE_VISIBLE_STABLE_WINDOW_MS = 2;
const QUIESCENCE_CACHE_VISIBLE_TIMEOUT_MS = 50;
const QUIESCENCE_CACHE_VISIBLE_MAX_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_CACHE_VISIBLE_SLEEP_MS = 1;
const QUIESCENCE_CACHE_VISIBLE_FAILURE_LOG_MESSAGE =
  'should not collect failure logs when cache-visible priority recovery is ' +
  'discounted';
const QUIESCENCE_RESET_NODE_ID = 'seed-reset';
const QUIESCENCE_RESET_OPERATION_ID = 'op-reset';
const QUIESCENCE_RESET_PARTITION_ID = 'replica_operations-p1';
const QUIESCENCE_RESET_STATUS = 'ACTIVE';
const QUIESCENCE_RESET_STEP = 'PENDING';
const QUIESCENCE_RESET_IN_FLIGHT_COUNT = 1;
const QUIESCENCE_RESET_EFFECTIVE_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_RESET_STALE_IN_FLIGHT_COUNT = 1;
const QUIESCENCE_RESET_STABLE_WINDOW_MS = 10;
const QUIESCENCE_RESET_TIMEOUT_MS = 16;
const QUIESCENCE_RESET_MAX_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_RESET_SLEEP_MS = 1;
const QUIESCENCE_RESET_BLOCKED_CAPTURED_AT_MS = 1;
const QUIESCENCE_RESET_CANDIDATE_CAPTURED_AT_MS = 2;
const QUIESCENCE_RESET_START_AT_MS = 1000;
const QUIESCENCE_RESET_CANDIDATE_READY_AT_MS = 1012;
const QUIESCENCE_STALE_PROGRESS_NODE_ID = 'seed-stale-progress';
const QUIESCENCE_STALE_PROGRESS_OPERATION_ID = 'op-stale-progress';
const QUIESCENCE_STALE_PROGRESS_PARTITION_ID = 'replica_operations-p1';
const QUIESCENCE_STALE_PROGRESS_STATUS = 'ACTIVE';
const QUIESCENCE_STALE_PROGRESS_STEP = 'PENDING';
const QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT = 2;
const QUIESCENCE_STALE_PROGRESS_STALE_IN_FLIGHT_COUNT =
  QUIESCENCE_STALE_PROGRESS_IN_FLIGHT_COUNT;
const QUIESCENCE_STALE_PROGRESS_EFFECTIVE_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_STALE_PROGRESS_STABLE_WINDOW_MS = 2;
const QUIESCENCE_STALE_PROGRESS_TIMEOUT_MS = 10;
const QUIESCENCE_STALE_PROGRESS_NO_PROGRESS_TIMEOUT_MS = 4;
const QUIESCENCE_STALE_PROGRESS_MAX_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_STALE_PROGRESS_SLEEP_MS = 1;
const QUIESCENCE_STALE_PROGRESS_START_AT_MS = 1000;
const QUIESCENCE_STALE_PROGRESS_CAPTURED_AT_MS = 1;
const QUIESCENCE_STALE_PROGRESS_LOG_FAILURE =
  'discounted stale in-flight operations should not fail quiescence';
const QUIESCENCE_SNAPSHOT_LANE_NODE_ID = 'seed-snapshot-lane';
const QUIESCENCE_SNAPSHOT_LANE_CAPTURED_AT_MS = 1;
const QUIESCENCE_SNAPSHOT_LANE_STABLE_WINDOW_MS = 2;
const QUIESCENCE_SNAPSHOT_LANE_TIMEOUT_MS = 15;
const QUIESCENCE_SNAPSHOT_LANE_MAX_IN_FLIGHT_COUNT = 0;
const QUIESCENCE_SNAPSHOT_LANE_REQUIRED_NODE_COUNT = 3;
const QUIESCENCE_SNAPSHOT_LANE_UNAVAILABLE_TABLE_COUNT = 1;
const QUIESCENCE_SNAPSHOT_LANE_TABLE_NAME = 'replica_operations';
const QUIESCENCE_SNAPSHOT_LANE_DISCOVERY_SQL_PATTERN =
  /service_discovery_local\('replica_operations'\)/;
const QUIESCENCE_SNAPSHOT_LANE_ERROR =
  'Admin API query timed out for node seed-snapshot-lane on lane snapshot ' +
  'after 1ms';
const LOAD_READINESS_CANONICAL_CLUSTER_SIZE = 2;
const LOAD_READINESS_CANONICAL_START_MS = 1000;
const LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS = 1200;
const LOAD_READINESS_CANONICAL_OBSERVED_AT_MS = 2500;
const LOAD_READINESS_CANONICAL_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_CANONICAL_TIMEOUT_MS = 3000;
const LOAD_READINESS_CANONICAL_NODE_A = 'load-node-a';
const LOAD_READINESS_CANONICAL_NODE_B = 'load-node-b';
const LOAD_READINESS_CANONICAL_ACTIVE_STATE = 'active';
const LOAD_READINESS_CANONICAL_READY_STATE = 'closed';
const LOAD_READINESS_CANONICAL_READY_REASON = 'ready';
const LOAD_READINESS_CANONICAL_SOURCE = 'selected_snapshot';
const LOAD_READINESS_CANONICAL_STAGE = 'scenario.load-readiness.stable';
const LOAD_READINESS_CANONICAL_PUBLICATION_STATUS = 'PUBLISHED';
const LOAD_READINESS_CANONICAL_ZERO_COUNT = 0;
const LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT = 1;
const LOAD_READINESS_CANONICAL_DOCKER_SOCKET = '/var/run/docker.sock';
const LOAD_READINESS_CANONICAL_IMAGE = 'distributed-db:test';
const LOAD_READINESS_CANONICAL_SLEEP_FAILURE =
  'canonical snapshot should close load readiness before sleeping';
const LOAD_READINESS_CANONICAL_LOG_FAILURE =
  'canonical snapshot closure should not collect failure logs';
const LOAD_READINESS_PARTIAL_COVERAGE_START_MS = 1000;
const LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS = 2500;
const LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS = 3500;
const LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS = 1200;
const LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS = 5000;
const LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT = 1;
const LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_PROBES = 2;
const LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_SLEEPS = 1;
const LOAD_READINESS_PARTIAL_COVERAGE_SOURCE = 'observed_probe';
const LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE =
  'partial snapshot timestamp should not fail load readiness';
const LOAD_READINESS_PARTIAL_TO_COMPLETE_SECOND_OBSERVED_MS = 3000;
const LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS = 3600;
const LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES = 3;
const LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_SLEEPS = 2;
const LOAD_READINESS_NO_PROGRESS_START_MS = 1000;
const LOAD_READINESS_NO_PROGRESS_STEP_MS = 1000;
const LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS = 1000;
const LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS = 6000;
const LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS = 3;
const LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE = 1;
const LOAD_READINESS_NO_PROGRESS_NODE_ID = 'load-stalled-seed';
const LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS = 'PUBLISHED';
const LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID = 'missing-load-node';
const LOAD_READINESS_NO_PROGRESS_MISSING_NODE_PREFIX =
  'publication_missing_active_node=';
const LOAD_READINESS_NO_PROGRESS_STAGE = 'scenario.load-readiness.waiting';
const LOAD_READINESS_NO_PROGRESS_REASON = 'stalled_no_progress';
const LOAD_READINESS_NO_PROGRESS_ACTIVE_GATE_STATE = 'stalled';
const LOAD_READINESS_NO_PROGRESS_DOCKER_SOCKET = '/var/run/docker.sock';
const LOAD_READINESS_NO_PROGRESS_IMAGE = 'distributed-db:test';
const PRIORITY_RECOVERY_PROGRESS_PARTITION_ID =
  'sql_transaction_participants-p1';
const PRIORITY_RECOVERY_PROGRESS_OPERATION_ID =
  'op-target-service-progress';
const PRIORITY_RECOVERY_PROGRESS_EPOCH = 5;
const PRIORITY_RECOVERY_PROGRESS_STALE_OPERATION_UPDATED_AT_MS = 1000;
const PRIORITY_RECOVERY_PROGRESS_TARGET_PROGRESS_AT_MS = 34000;
const PRIORITY_RECOVERY_PROGRESS_STALE_CAPTURED_AT_MS = 35000;
const PRIORITY_RECOVERY_PROGRESS_TARGET_CAPTURED_AT_MS = 34500;
const PRIORITY_RECOVERY_PROGRESS_OPERATION_BLOCKER =
  'operation_created_but_no_step_transitions';
const PRIORITY_RECOVERY_PROGRESS_OPERATION_STALLED =
  'operation_stalled';
const PRIORITY_RECOVERY_PROGRESS_SPREAD_SATISFIED =
  'spread_satisfied_in_flight';
const PRIORITY_RECOVERY_PROGRESS_CORRELATION_KEY =
  PRIORITY_RECOVERY_PROGRESS_PARTITION_ID + '|' +
  PRIORITY_RECOVERY_PROGRESS_EPOCH + '|' +
  PRIORITY_RECOVERY_PROGRESS_OPERATION_ID;

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

test(
  'Unit: waitForLoadReadinessStability credits canonical snapshot capture time',
  async () => {
    const cluster = createCluster({
      size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
      docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
      image: LOAD_READINESS_CANONICAL_IMAGE,
    });

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };
    cluster._sleep = async () => {
      throw new Error(LOAD_READINESS_CANONICAL_SLEEP_FAILURE);
    };
    cluster._collectFailureLogs = async () => {
      throw new Error(LOAD_READINESS_CANONICAL_LOG_FAILURE);
    };

    let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    let fakeNowMs = LOAD_READINESS_CANONICAL_START_MS;
    const originalDateNow = Date.now;
    Date.now = () => fakeNowMs;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      fakeNowMs = LOAD_READINESS_CANONICAL_OBSERVED_AT_MS;
      return {
        allActive: true,
        nodeDiagnostics: [
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_A,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_B,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
        ],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
          bestCoverageNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
          selectedCapturedAtMs:
            LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
          },
        },
      };
    };

    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: LOAD_READINESS_CANONICAL_STABLE_WINDOW_MS,
        timeoutMs: LOAD_READINESS_CANONICAL_TIMEOUT_MS,
      });
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      probeCallCount,
      LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT,
    );
    const stableStage = recordedStages.find(
      (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.state,
      LOAD_READINESS_CANONICAL_READY_STATE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.reasonCode,
      LOAD_READINESS_CANONICAL_READY_REASON,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.source,
      LOAD_READINESS_CANONICAL_SOURCE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
      LOAD_READINESS_CANONICAL_OBSERVED_AT_MS -
        LOAD_READINESS_CANONICAL_SNAPSHOT_CAPTURED_AT_MS,
    );
  });

test(
  'Unit: waitForLoadReadinessStability does not credit partial snapshot time',
  async () => {
    const cluster = createCluster({
      size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
      docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
      image: LOAD_READINESS_CANONICAL_IMAGE,
    });

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };
    let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    cluster._sleep = async () => {
      sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS;
    };
    cluster._collectFailureLogs = async () => {
      throw new Error(LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE);
    };

    let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    let fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_START_MS;
    const originalDateNow = Date.now;
    Date.now = () => fakeNowMs;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      fakeNowMs =
        probeCallCount === LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT ?
          LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS :
          LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS;
      return {
        allActive: true,
        nodeDiagnostics: [
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_A,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_B,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
        ],
        snapshotCoverage: {
          completeCoverage: false,
          expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
          bestCoverageNodeCount: LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT,
          selectedCapturedAtMs:
            LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
          },
        },
      };
    };

    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS,
        timeoutMs: LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS,
      });
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      probeCallCount,
      LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_PROBES,
    );
    assert.equal(
      sleepCallCount,
      LOAD_READINESS_PARTIAL_COVERAGE_EXPECTED_SLEEPS,
    );
    const stableStage = recordedStages.find(
      (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.source,
      LOAD_READINESS_PARTIAL_COVERAGE_SOURCE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.startedAtMs,
      LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
      LOAD_READINESS_PARTIAL_COVERAGE_SECOND_OBSERVED_MS -
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
    );
  });

test(
  'Unit: waitForLoadReadinessStability does not backdate complete snapshot ' +
    'after partial coverage',
  async () => {
    const cluster = createCluster({
      size: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
      docker: {socketPath: LOAD_READINESS_CANONICAL_DOCKER_SOCKET},
      image: LOAD_READINESS_CANONICAL_IMAGE,
    });

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };
    let sleepCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    cluster._sleep = async () => {
      sleepCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
    };
    cluster._collectFailureLogs = async () => {
      throw new Error(LOAD_READINESS_PARTIAL_COVERAGE_LOG_FAILURE);
    };

    let probeCallCount = LOAD_READINESS_CANONICAL_ZERO_COUNT;
    let fakeNowMs = LOAD_READINESS_PARTIAL_COVERAGE_START_MS;
    const originalDateNow = Date.now;
    Date.now = () => fakeNowMs;
    cluster._probeClusterActiveState = async () => {
      probeCallCount += LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      const firstProbe =
        probeCallCount === LOAD_READINESS_CANONICAL_SINGLE_PROBE_COUNT;
      fakeNowMs = firstProbe ?
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS :
        probeCallCount === LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES ?
          LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS :
          LOAD_READINESS_PARTIAL_TO_COMPLETE_SECOND_OBSERVED_MS;
      return {
        allActive: true,
        nodeDiagnostics: [
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_A,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
          {
            nodeId: LOAD_READINESS_CANONICAL_NODE_B,
            active: true,
            state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
            reasons: [],
          },
        ],
        snapshotCoverage: {
          completeCoverage: firstProbe !== true,
          expectedNodeCount: LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
          bestCoverageNodeCount: firstProbe ?
            LOAD_READINESS_PARTIAL_COVERAGE_BEST_NODE_COUNT :
            LOAD_READINESS_CANONICAL_CLUSTER_SIZE,
          selectedCapturedAtMs:
            LOAD_READINESS_PARTIAL_COVERAGE_SNAPSHOT_CAPTURED_AT_MS,
        },
        publicationConvergenceGate: {
          ready: true,
          reasons: [],
          publicationStatus: LOAD_READINESS_CANONICAL_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
          },
        },
      };
    };

    try {
      await cluster.waitForLoadReadinessStability({
        stableWindowMs: LOAD_READINESS_PARTIAL_COVERAGE_STABLE_WINDOW_MS,
        timeoutMs: LOAD_READINESS_PARTIAL_COVERAGE_TIMEOUT_MS,
      });
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      probeCallCount,
      LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_PROBES,
    );
    assert.equal(
      sleepCallCount,
      LOAD_READINESS_PARTIAL_TO_COMPLETE_EXPECTED_SLEEPS,
    );
    const stableStage = recordedStages.find(
      (entry) => entry.stage === LOAD_READINESS_CANONICAL_STAGE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.source,
      LOAD_READINESS_PARTIAL_COVERAGE_SOURCE,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.startedAtMs,
      LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
    );
    assert.equal(
      stableStage?.details?.loadReadinessStableWindow?.stableElapsedMs,
      LOAD_READINESS_PARTIAL_TO_COMPLETE_READY_OBSERVED_MS -
        LOAD_READINESS_PARTIAL_COVERAGE_FIRST_OBSERVED_MS,
    );
  });

test(
  'Unit: waitForLoadReadinessStability fails fast when load ACTIVE progress stalls',
  async () => {
    const cluster = createCluster({
      size: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
      docker: {socketPath: LOAD_READINESS_NO_PROGRESS_DOCKER_SOCKET},
      image: LOAD_READINESS_NO_PROGRESS_IMAGE,
    });

    const recordedStages = [];
    cluster._recordClusterStage = (stage, details = {}) => {
      recordedStages.push({stage, details});
    };

    let collectedFailureLogs = false;
    cluster._collectFailureLogs = async () => {
      collectedFailureLogs = true;
    };

    let fakeNowMs = LOAD_READINESS_NO_PROGRESS_START_MS;
    const originalDateNow = Date.now;
    Date.now = () => fakeNowMs;
    cluster._sleep = async () => {};
    cluster._probeClusterActiveState = async () => {
      fakeNowMs += LOAD_READINESS_NO_PROGRESS_STEP_MS;
      return {
        allActive: false,
        nodeDiagnostics: [{
          nodeId: LOAD_READINESS_NO_PROGRESS_NODE_ID,
          active: true,
          state: LOAD_READINESS_CANONICAL_ACTIVE_STATE,
          reasons: [],
        }],
        snapshotCoverage: {
          completeCoverage: true,
          expectedNodeCount: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
          bestCoverageNodeCount: LOAD_READINESS_NO_PROGRESS_CLUSTER_SIZE,
          selectedPublicationConvergence: {
            publicationStatus: LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS,
            pendingAckNodeIds: [],
            priorityPartitionSummary: {
              satisfied: true,
              blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
              totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            },
          },
        },
        publicationConvergenceGate: {
          ready: false,
          reasons: [
            LOAD_READINESS_NO_PROGRESS_MISSING_NODE_PREFIX +
              LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID,
          ],
          publicationStatus: LOAD_READINESS_NO_PROGRESS_PUBLICATION_STATUS,
          pendingAckNodeIds: [],
          missingPublishedNodeIds: [
            LOAD_READINESS_NO_PROGRESS_MISSING_NODE_ID,
          ],
          priorityPartitionSummary: {
            satisfied: true,
            blockedPartitionCount: LOAD_READINESS_CANONICAL_ZERO_COUNT,
            totalSpreadGap: LOAD_READINESS_CANONICAL_ZERO_COUNT,
          },
        },
      };
    };

    try {
      await assert.rejects(
        async () => {
          await cluster.waitForLoadReadinessStability({
            stableWindowMs: LOAD_READINESS_NO_PROGRESS_STABLE_WINDOW_MS,
            timeoutMs: LOAD_READINESS_NO_PROGRESS_TIMEOUT_MS,
            noProgressMaxAttempts: LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
          });
        },
        (error) => {
          assert.match(
            error.message,
            /stalled with no meaningful progress/,
          );
          assert.equal(
            error?.diagnostics?.noProgress?.reasonCode,
            LOAD_READINESS_NO_PROGRESS_REASON,
          );
          assert.equal(
            error?.diagnostics?.noProgress?.failedNoProgress?.details
              ?.budgetAttempts,
            LOAD_READINESS_NO_PROGRESS_MAX_ATTEMPTS,
          );
          assert.equal(
            error?.diagnostics?.activeGate?.state,
            LOAD_READINESS_NO_PROGRESS_ACTIVE_GATE_STATE,
          );
          return true;
        },
      );
    } finally {
      Date.now = originalDateNow;
    }

    assert.equal(
      collectedFailureLogs,
      true,
      'should collect failure logs before surfacing load-readiness stalls',
    );
    assert.equal(
      recordedStages.some((entry) =>
        entry.stage === LOAD_READINESS_NO_PROGRESS_STAGE &&
        entry.details?.activeGateNoProgress?.stalled === true),
      true,
      'load-readiness stall diagnostics should be recorded as stage evidence',
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
    const STALE_IN_FLIGHT_COUNT = 1;
    const EFFECTIVE_IN_FLIGHT_COUNT = 0;
    const STABLE_WINDOW_MS = 50;
    const TIMEOUT_MS = 15;
    const MAX_IN_FLIGHT_COUNT = 0;

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
              inFlightCount: STALE_IN_FLIGHT_COUNT,
              staleInFlightCount: STALE_IN_FLIGHT_COUNT,
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
        stableWindowMs: STABLE_WINDOW_MS,
        timeoutMs: TIMEOUT_MS,
        maxInFlightCount: MAX_IN_FLIGHT_COUNT,
        ignoreStaleInFlightReplicaOperations: true,
      }),
      (error) => {
        assert.ok(collected, 'should collect failure logs before throwing');
        assert.match(error.message, /Control plane did not quiesce/i);
        assert.match(error.message, /inFlightCount=1/i);
        assert.equal(
          error.quiescence.effectiveInFlightCount,
          EFFECTIVE_IN_FLIGHT_COUNT,
        );
        assert.equal(
          error.quiescence.staleInFlightCount,
          STALE_IN_FLIGHT_COUNT,
        );
        assert.equal(
          error.quiescence.ignoreStaleInFlightReplicaOperations,
          true,
        );
        return true;
      },
    );
  });

test(
  'Unit: waitForControlPlaneQuiescence discounts nested cache-visible priority recovery diagnostics',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let probeCallCount = 0;
    cluster._nodes = new Map([[QUIESCENCE_CACHE_VISIBLE_NODE_ID, {
      id: QUIESCENCE_CACHE_VISIBLE_NODE_ID,
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        probeCallCount += 1;
        return {
          rows: [{
            capturedAt: Date.now(),
            leaders: {
              [QUIESCENCE_CACHE_VISIBLE_PARTITION_ID]:
                QUIESCENCE_CACHE_VISIBLE_NODE_ID,
            },
            replicaOperations: {
              inFlightCount: QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
              partitionGroupInFlight: {
                [QUIESCENCE_CACHE_VISIBLE_PARTITION_ID]:
                  QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
              },
              operationTimelineById: {
                [QUIESCENCE_CACHE_VISIBLE_OPERATION_ID]: [{
                  step: QUIESCENCE_CACHE_VISIBLE_STEP,
                  status: QUIESCENCE_CACHE_VISIBLE_STATUS,
                  inFlight: true,
                }],
              },
              rows: [{
                operationId: QUIESCENCE_CACHE_VISIBLE_OPERATION_ID,
                partitionId: QUIESCENCE_CACHE_VISIBLE_PARTITION_ID,
                status: QUIESCENCE_CACHE_VISIBLE_STATUS,
                workflowStep: QUIESCENCE_CACHE_VISIBLE_STEP,
              }],
            },
            controlPlaneDiagnostics: {
              priorityRecoveryObservation: {
                priorityRecoveryPartitionSnapshots: [{
                  partitionId: QUIESCENCE_CACHE_VISIBLE_PARTITION_ID,
                  visibilityState:
                    QUIESCENCE_CACHE_VISIBLE_VISIBILITY_STATE,
                  semanticState:
                    QUIESCENCE_CACHE_VISIBLE_COMPLETION_STATE,
                  operationIds: [QUIESCENCE_CACHE_VISIBLE_OPERATION_ID],
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
      await new Promise((resolve) =>
        setTimeout(resolve, QUIESCENCE_CACHE_VISIBLE_SLEEP_MS),
      );
    };
    cluster._collectFailureLogs = async () => {
      throw new Error(QUIESCENCE_CACHE_VISIBLE_FAILURE_LOG_MESSAGE);
    };

    const result = await cluster.waitForControlPlaneQuiescence({
      stableWindowMs: QUIESCENCE_CACHE_VISIBLE_STABLE_WINDOW_MS,
      timeoutMs: QUIESCENCE_CACHE_VISIBLE_TIMEOUT_MS,
      maxInFlightCount: QUIESCENCE_CACHE_VISIBLE_MAX_IN_FLIGHT_COUNT,
      ignoreStaleInFlightReplicaOperations: true,
    });

    assert.equal(
      result.inFlightCount,
      QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
    );
    assert.equal(
      result.effectiveInFlightCount,
      QUIESCENCE_CACHE_VISIBLE_EFFECTIVE_IN_FLIGHT_COUNT,
    );
    assert.ok(
      probeCallCount > QUIESCENCE_CACHE_VISIBLE_IN_FLIGHT_COUNT,
      'quiescence gate should hold the stable window after discounting',
    );
  },
);

test(
  'Unit: waitForControlPlaneQuiescence timeout names candidate window reset reason',
  async () => {
    const cluster = createCluster({
      size: 3,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });

    let currentNowMs = QUIESCENCE_RESET_START_AT_MS;
    const blockedSnapshot = {
      rows: [{
        capturedAt: QUIESCENCE_RESET_BLOCKED_CAPTURED_AT_MS,
        leaders: {[QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_NODE_ID},
        replicaOperations: {
          inFlightCount: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
          partitionGroupInFlight: {
            [QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
          },
          operationTimelineById: {
            [QUIESCENCE_RESET_OPERATION_ID]: [{
              step: QUIESCENCE_RESET_STEP,
              status: QUIESCENCE_RESET_STATUS,
              inFlight: true,
            }],
          },
        },
      }],
    };
    const candidateSnapshot = {
      rows: [{
        capturedAt: QUIESCENCE_RESET_CANDIDATE_CAPTURED_AT_MS,
        leaders: {[QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_NODE_ID},
        replicaOperations: {
          inFlightCount: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
          staleInFlightCount: QUIESCENCE_RESET_STALE_IN_FLIGHT_COUNT,
          partitionGroupInFlight: {
            [QUIESCENCE_RESET_PARTITION_ID]: QUIESCENCE_RESET_IN_FLIGHT_COUNT,
          },
          operationTimelineById: {
            [QUIESCENCE_RESET_OPERATION_ID]: [{
              step: QUIESCENCE_RESET_STEP,
              status: QUIESCENCE_RESET_STATUS,
              inFlight: true,
            }],
          },
        },
      }],
    };

    cluster._nodes = new Map([[QUIESCENCE_RESET_NODE_ID, {
      id: QUIESCENCE_RESET_NODE_ID,
      role: NODE_ROLES.SEED,
      async getControlSnapshot() {
        return currentNowMs < QUIESCENCE_RESET_CANDIDATE_READY_AT_MS ?
          blockedSnapshot :
          candidateSnapshot;
      },
      async getLogs() {
        return '';
      },
    }]]);
    cluster._sleep = async () => {
      currentNowMs += QUIESCENCE_RESET_SLEEP_MS;
    };
    let collected = false;
    cluster._collectFailureLogs = async () => {
      collected = true;
    };
    const originalDateNow = Date.now;
    Date.now = () => currentNowMs;
    try {
      await assert.rejects(
        async () => cluster.waitForControlPlaneQuiescence({
          stableWindowMs: QUIESCENCE_RESET_STABLE_WINDOW_MS,
          timeoutMs: QUIESCENCE_RESET_TIMEOUT_MS,
          maxInFlightCount: QUIESCENCE_RESET_MAX_IN_FLIGHT_COUNT,
          ignoreStaleInFlightReplicaOperations: true,
        }),
        (error) => {
          assert.ok(collected, 'should collect failure logs before throwing');
          assert.equal(
            error.quiescence.state,
            CONTROL_PLANE_QUIESCENCE_STATE.QUIESCENCE_CANDIDATE,
          );
          assert.equal(
            error.quiescence.effectiveInFlightCount,
            QUIESCENCE_RESET_EFFECTIVE_IN_FLIGHT_COUNT,
          );
          assert.equal(
            error.quiescence.candidateWindowReset.reason,
            CONTROL_PLANE_QUIESCENCE_STATE.OPERATION_DRAIN_PROGRESSING,
          );
          assert.equal(
            error.quiescence.candidateWindowReset.canonicalBlocker,
            CONTROL_PLANE_QUIESCENCE_REASON.REPLICA_OPERATIONS_IN_FLIGHT,
          );
          return true;
        },
      );
    } finally {
      Date.now = originalDateNow;
    }
  },
);

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
