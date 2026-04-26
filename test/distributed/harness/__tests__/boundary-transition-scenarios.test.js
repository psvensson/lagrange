import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {RebalanceCoordinator} from '../../../../src/rebalancer/rebalance-coordinator.js';
import {REBALANCER_SKIP_REASON} from '../../../../src/rebalancer/rebalancer-constants.js';
import {
  createPartitioningBenchmarkLoadNodePlan,
  prepareBenchmarkPartitioningTable,
} from '../../scenarios/table-distribution-helpers.js';
import {
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionSnapshot,
} from '../benchmark-partition-convergence.js';
import {
  LOAD_NODE_AVAILABILITY_STATE,
  buildLoadNodeAvailabilitySnapshot,
  resolveLoadNodeAvailabilityState,
} from '../load-node-availability.js';

const TABLES_SQL_FRAGMENT = 'FROM tables';
const PARTITIONS_SQL_FRAGMENT = 'FROM partitions';
const SERVICES_SQL_FRAGMENT = 'FROM services';
const TEST_QUERY_TIMEOUT_MS = 200;
const TEST_PRESSURED_IN_FLIGHT_COUNT = 2;
const TEST_BORROWED_DISPATCH_MAX_IN_FLIGHT = 5;
const TEST_CONTRIBUTION_MAX_IN_FLIGHT = 2;
const TEST_FRESH_NOW_MS = 1000;
const TEST_FRESH_STARTED_AT_MS = 990;
const TEST_STALLED_STARTED_AT_MS = 920;

function createBoundaryScenarioStorageOwners() {
  return {
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    storageAdmissionService: {
      async checkAdd() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
  };
}

function createBoundaryScenarioTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

function buildTestAvailability(overrides = {}) {
  return resolveLoadNodeAvailabilityState(
    buildLoadNodeAvailabilitySnapshot({
      nowMs: TEST_FRESH_NOW_MS,
      localDispatchReady: true,
      externalAdmissionReady: true,
      currentInFlight: TEST_PRESSURED_IN_FLIGHT_COUNT,
      dispatchMaxInFlight: TEST_BORROWED_DISPATCH_MAX_IN_FLIGHT,
      capacityContributionMaxInFlight: TEST_CONTRIBUTION_MAX_IN_FLIGHT,
      oldestInFlightStartedAtMs: TEST_FRESH_STARTED_AT_MS,
      queryTimeoutMs: TEST_QUERY_TIMEOUT_MS,
      admissionBackoffMs: TEST_QUERY_TIMEOUT_MS,
      ...overrides,
    }),
  );
}

test('boundary-transition scenario keeps backfill contributors visible ' +
  'until the usable-spread target exists, not merely the bootstrap quorum', async () => {
  let admissionSnapshotCount = 0;
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
    {id: 'node-4'},
  ];
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-transition'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };
  const cluster = {
    _config: {
      benchmark: {
        replicationFactor: 3,
        readyPollIntervalMs: 5,
        preloadRequiredStableMs: 0,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkLoadAdmissionSnapshot: async () => {
      admissionSnapshotCount += 1;
      return buildBenchmarkLoadAdmissionSnapshot({
        evaluations: admissionSnapshotCount <= 2 ? [
          {
            node: clusterNodes[0],
            localReplicaSeen: true,
            localAdmissionReady: false,
            admissionReady: false,
            admissionCheckEligible: true,
            reasonCodes: ['leadership_unstable'],
          },
          {
            node: clusterNodes[1],
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
            admissionCheckEligible: true,
          },
          {
            node: clusterNodes[2],
            localReplicaSeen: true,
            localAdmissionReady: false,
            admissionReady: true,
            admissionCheckEligible: true,
            reasonCodes: ['local_replica_not_voter_ready'],
          },
          {
            node: clusterNodes[3],
            localReplicaSeen: false,
            localAdmissionReady: false,
            admissionReady: true,
            admissionCheckEligible: true,
          },
        ] : [
          {
            node: clusterNodes[0],
            localReplicaSeen: true,
            localAdmissionReady: false,
            admissionReady: false,
            admissionCheckEligible: true,
            reasonCodes: ['leadership_unstable'],
          },
          {
            node: clusterNodes[1],
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
            admissionCheckEligible: true,
          },
          {
            node: clusterNodes[2],
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
            admissionCheckEligible: true,
          },
          {
            node: clusterNodes[3],
            localReplicaSeen: false,
            localAdmissionReady: false,
            admissionReady: true,
            admissionCheckEligible: true,
          },
        ],
      });
    },
  };

  const plan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: 'benchmark_events',
      tableId: 'tbl-benchmark-events-transition',
      requiredNodeCount: 4,
      queryNodes: [seedNode],
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
    );
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'seed-1'],
    );
    assert.deepEqual(
      plan.getDiagnostics().localPrimaryNodeIds,
      ['node-2'],
    );
    assert.deepEqual(
      plan.getDiagnostics().routedSupportNodeIds,
      ['node-4'],
    );
    assert.deepEqual(
      plan.getDiagnostics().selectedNodeIds,
      ['node-2', 'node-3', 'node-4', 'seed-1'],
    );
    assert.deepEqual(
      plan.getDiagnostics().convergenceStateHistogram,
      {
        ready_replica: 1,
        replica_blocked: 2,
        routed_admission_only: 1,
      },
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'seed-1'],
    );
    assert.deepEqual(
      plan.getDiagnostics().localPrimaryNodeIds,
      ['node-2', 'node-3'],
    );
    assert.deepEqual(
      plan.getDiagnostics().selectedNodeIds,
      ['node-2', 'node-3', 'node-4', 'seed-1'],
    );
  } finally {
    plan.stop();
  }
});

test('boundary-transition scenario preserves authority-establishment ' +
  'deferred outcomes through benchmark table policy preparation', async () => {
  let repairCount = 0;
  let applyAttemptCount = 0;
  let policyLookupCount = 0;
  const expectedPolicies = {
    splitStorageThreshold: 4096,
  };
  const seedNode = {
    id: 'seed-1',
    async queryWithTimeout(sql) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS')) {
        return {rows: []};
      }
      if (sql.includes('SELECT table_id FROM tables WHERE table_name')) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-boundary-transition'}],
        };
      }
      if (sql.includes('FROM partitions WHERE table_id')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-boundary-transition-p1',
          }],
        };
      }
      if (sql.includes('FROM services')) {
        return {
          rows: [{
            partition_id: 'tbl-benchmark-events-boundary-transition-p1',
            node_id: 'seed-1',
            raft_role: 'leader',
            status: 'active',
          }],
        };
      }
      if (sql.includes('UPDATE tables SET table_policies')) {
        applyAttemptCount += 1;
        if (applyAttemptCount === 1) {
          const error = new Error('Message timeout');
          error.code = 'QUERY_TIMEOUT';
          error.retryAfterMs = 1;
          error.outcome = 'deferred';
          error.reasonCode = 'publication_epoch_pending';
          error.reasonCodes = ['publication_epoch_pending'];
          error.failedDimensions = ['publishedConvergencePending'];
          error.runtimeAuthority = {
            state: 'establishing',
            visibility: {
              state: 'pending_publication',
            },
          };
          throw error;
        }
        return {changes: 1};
      }
      if (sql.includes('control_snapshot_local(true)')) {
        repairCount += 1;
        return {rows: [{scope: 'local'}]};
      }
      if (sql.includes('SELECT table_policies FROM tables WHERE table_name') ||
          sql.includes('SELECT table_policies FROM tables WHERE table_id')) {
        policyLookupCount += 1;
        return {
          rows: [{
            table_policies: JSON.stringify(
              policyLookupCount >= 2 ? expectedPolicies : {},
            ),
          }],
        };
      }
      return {rows: []};
    },
  };

  const preparation = await prepareBenchmarkPartitioningTable(seedNode, {
    tableName: 'benchmark_events',
    tablePolicies: expectedPolicies,
  });

  assert.equal(repairCount, 0);
  assert.equal(preparation.tablePoliciesApplyWarning, undefined);
  assert.equal(preparation.tablePoliciesApplyVisibilityState, null);
  assert.equal(preparation.tablePoliciesApplyVisibilityRetryAfterMs, 1);
});

test('boundary-transition scenario defers critical partition create admission ' +
  'while authoritative operation visibility remains unresolved', async () => {
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    transactionCoordinator: createBoundaryScenarioTransactionCoordinator(),
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    ...createBoundaryScenarioStorageOwners(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  coordinator.repository.getOperationsByEntityAuthoritativeObservation =
    async () => ({
      state: 'deferred',
      operationCount: 0,
      operations: [],
      deferredOutcome: {
        completionState: 'operation_visibility_deferred',
        reasonCode: 'operation_visibility_deferred',
        retryAfterMs: 250,
      },
      retryAfterMs: 250,
    });

  try {
    await assert.rejects(
      async () => coordinator.ensureCriticalPartitionCreateLaneAvailable({
        normalizedMoveType: 'REPLACE',
        partitionId: 'config-p1',
        entityType: 'partition',
        entityId: 'config-p1',
        move: {
          enforceConcurrentOperationBudget: true,
        },
      }),
      (error) => {
        assert.equal(
          error?.rebalanceSkipReason,
          REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        );
        assert.equal(error?.retryAfterMs, 250);
        assert.equal(
          error?.completionState,
          'operation_visibility_deferred',
        );
        return true;
      },
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('boundary-transition scenario keeps borrowed dispatch capacity ' +
  'alive until the borrowed ceiling, not just the steady floor, stalls', async () => {
  const borrowingAvailability = buildTestAvailability();
  const agedBorrowingAvailability = buildTestAvailability({
    oldestInFlightStartedAtMs: TEST_STALLED_STARTED_AT_MS,
  });
  const stalledAvailability = buildTestAvailability({
    currentInFlight: TEST_BORROWED_DISPATCH_MAX_IN_FLIGHT,
    oldestInFlightStartedAtMs: TEST_STALLED_STARTED_AT_MS,
  });

  assert.equal(
    borrowingAvailability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_BORROWING,
  );
  assert.equal(borrowingAvailability.canDispatch, true);
  assert.equal(borrowingAvailability.contributesCapacity, true);
  assert.equal(
    agedBorrowingAvailability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_BORROWING,
  );
  assert.equal(agedBorrowingAvailability.canDispatch, true);
  assert.equal(agedBorrowingAvailability.contributesCapacity, true);
  assert.equal(
    stalledAvailability.state,
    LOAD_NODE_AVAILABILITY_STATE.SLOT_STALLED,
  );
  assert.equal(stalledAvailability.canDispatch, false);
  assert.equal(stalledAvailability.contributesCapacity, false);
});


test('boundary-transition scenario holds dispatch on bootstrap contributors until the critical control-plane gate turns ready', async () => {
  let admissionSnapshotCount = 0;
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
    {id: 'node-4'},
  ];
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(TABLES_SQL_FRAGMENT)) {
        return {
          rows: [{table_id: 'tbl-benchmark-events-critical-gate'}],
        };
      }
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        return {
          rows: [{partition_id: 'bench-p1'}],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        return {
          rows: [
            {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };
  const cluster = {
    _config: {
      benchmark: {
        replicationFactor: 3,
        readyPollIntervalMs: 5,
        preloadRequiredStableMs: 0,
      },
    },
    getNodes: () => clusterNodes,
    resolveBenchmarkLoadAdmissionSnapshot: async () => {
      admissionSnapshotCount += 1;
      const criticalControlPlaneStability =
        buildBenchmarkCriticalControlPlaneStabilitySnapshot({
          publicationConvergenceGate: admissionSnapshotCount <= 2 ? {
            ready: false,
            reasons: ['publication_pending'],
            publicationStatus: 'OPEN',
            recoveryProtocolState: 'publication_pending',
            pendingAckNodeIds: ['node-4'],
            missingPublishedNodeIds: ['node-4'],
            missingRecoveryActiveNodeIds: [],
          } : {
            ready: true,
            reasons: [],
            publicationStatus: 'PUBLISHED',
            recoveryProtocolState: 'published',
            pendingAckNodeIds: [],
            missingPublishedNodeIds: [],
            missingRecoveryActiveNodeIds: [],
          },
          controlPlaneOwnerQueueDepth: admissionSnapshotCount <= 2 ? {
            pendingWrites: 5,
            pendingWriteGrowthCount: 1,
            retainedBacklogGrowthCount: 0,
            sharedPressureBackpressured: true,
          } : {
            pendingWrites: 0,
            pendingWriteGrowthCount: 0,
            retainedBacklogGrowthCount: 0,
            sharedPressureBackpressured: false,
          },
          cdcReplayLag: {
            bufferedEvents: 0,
            replayBufferGrowthCount: 0,
            replayRetryDepth: 1,
          },
          snapshotCoverageComplete: true,
          snapshotCoverageNodeCount: 4,
          expectedNodeCount: 4,
          selectedNodeId: 'seed-1',
          controlPlaneDiagnosticsAvailable: true,
        });
      return buildBenchmarkLoadAdmissionSnapshot({
        criticalControlPlaneStability,
        evaluations: [
          {
            node: clusterNodes[0],
            localReplicaSeen: true,
            localAdmissionReady: false,
            admissionReady: false,
            admissionCheckEligible: true,
            reasonCodes: ['leadership_unstable'],
          },
          {
            node: clusterNodes[1],
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
            admissionCheckEligible: true,
          },
          {
            node: clusterNodes[2],
            localReplicaSeen: true,
            localAdmissionReady: true,
            admissionReady: true,
            admissionCheckEligible: true,
          },
          {
            node: clusterNodes[3],
            localReplicaSeen: false,
            localAdmissionReady: false,
            admissionReady: true,
            admissionCheckEligible: true,
          },
        ],
      });
    },
  };

  const plan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: 'benchmark_events',
      tableId: 'tbl-benchmark-events-critical-gate',
      requiredNodeCount: 4,
      queryNodes: [seedNode],
      pollIntervalMs: 5,
      stableWindowMs: 0,
    },
  );

  try {
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
    );
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'dispatch should stay on the bootstrap contributor set while the control plane is still pending',
    );
    assert.equal(
      plan.getDiagnostics().criticalControlPlaneStability?.state,
      'pending',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-3', 'node-4', 'seed-1'],
      'dispatch should expand only after the critical control-plane gate becomes ready',
    );
    assert.equal(
      plan.getDiagnostics().criticalControlPlaneStability?.state,
      'ready',
    );
  } finally {
    plan.stop();
  }
});
