import {registerTableDistributionHelpersReadPathTailFinalTests} from './table-distribution-helpers-read-path-tail-final-test-cases.js';

export function registerTableDistributionHelpersReadPathTailMoreTests({
  test,
  assert,
  admitBenchmarkLoadNodes,
  createPartitioningBenchmarkLoadNodePlan,
  ensureBenchmarkPartitioningTable,
  queryTableDistribution,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  TABLE_BOOTSTRAP_VISIBILITY_STATE,
  waitForPartitionGrowthAndSpread,
  buildBenchmarkCriticalControlPlaneStabilitySnapshot,
  buildBenchmarkLoadAdmissionSnapshot,
  PARTITIONS_SQL_FRAGMENT,
  SERVICES_SQL_FRAGMENT,
  TABLES_SQL_FRAGMENT,
  TEST_DEFAULT_LEADER_NODE_ID,
  TEST_DEFAULT_PARTITION_REPLICA_COUNT,
  TEST_SERVICE_STATUS_ACTIVE,
  TEST_RAFT_ROLE_LEADER,
  TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
  TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
  TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
  TEST_PARTITION_CONVERGENCE_STATE_ABSENT,
  TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
  TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
  TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
  TEST_DISPATCH_CONTRIBUTION_STATE_NONE,
  TEST_LOCAL_REPLICA_ROLE_UNKNOWN,
  TEST_DEGRADATION_STATE_UNKNOWN,
  TEST_RETRY_AFTER_NONE_MS,
  TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS,
  TEST_CONTROL_QUERY_TIMEOUT_MS,
  TEST_CONTROL_QUERY_FAILOVER_MIN_TIMEOUT_MS,
  TEST_TABLE_ID_BOOTSTRAP_FAILOVER_MIN_TIMEOUT_MS,
  TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
  TEST_CONTROL_QUERY_DEFERRED_OUTCOME,
  TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE,
  TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION,
  TEST_SELECTION_OBSERVATION_STATE_OBSERVED,
  TEST_SELECTION_OBSERVATION_STATE_DEFERRED,
  buildVisiblePartitionRow,
  buildActiveLeaderServiceRow,
  buildConvergenceEvaluationExpectation,
  buildPlannerDiagnosticsExpectation,
}) {
  test('table-distribution-helpers bootstraps from the admitted local writer ' +
  'when local replica visibility proves quorum before raw distribution catches up',
  async () => {
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const criticalControlPlaneStability =
    buildBenchmarkCriticalControlPlaneStabilitySnapshot({
      reasonCodes: ['critical_control_pending_write_growth'],
    });
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-local-replica-lag'}],
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
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
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
      resolveBenchmarkLoadAdmissionSnapshot: async () =>
        buildBenchmarkLoadAdmissionSnapshot({
          criticalControlPlaneStability,
          evaluations: [
            {
              node: clusterNodes[1],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: true,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: true,
              topologyReady: false,
              localReplicaRole: 'follower',
              localReplicaVoterReady: true,
              leadershipStable: false,
              degradationState: 'healthy',
              discoveryReasonCodes: ['leadership_unstable'],
              reasonCodes: ['leadership_unstable'],
            },
            {
              node: clusterNodes[2],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: true,
              topologyReady: false,
              localReplicaRole: 'follower',
              localReplicaVoterReady: true,
              leadershipStable: false,
              degradationState: 'healthy',
              discoveryReasonCodes: ['leadership_unstable'],
              reasonCodes: ['leadership_unstable'],
            },
          ],
        }),
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-local-replica-lag',
        requiredNodeCount: 3,
        timeoutMs: 40,
        pollIntervalMs: 5,
        stableWindowMs: 0,
        queryNodes: [seedNode],
      },
    );

    try {
      assert.equal(plan.bootstrapRequiredNodeCount, 2);
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2'],
        'bootstrap should start on the admitted local writer once discovery-owned local replica visibility proves quorum under pending control-plane stability',
      );
      assert.deepEqual(
        plan.getDiagnostics(),
        buildPlannerDiagnosticsExpectation({
          selectedNodeIds: ['node-2'],
          admissionReadyNodeIds: ['node-2'],
          readyReplicaNodeIds: [],
          replicaBearingNodeIds: ['node-2', 'node-3'],
          partitionCount: 1,
          readinessReasonHistogram: {
            leadership_unstable: 2,
          },
          convergenceStateHistogram: {
            replica_blocked: 2,
          },
          localPrimaryNodeIds: [],
          routedSupportNodeIds: [],
          dispatchContributionHistogram: {
            local_blocked: 2,
          },
          degradationStateHistogram: {
            healthy: 2,
          },
          criticalControlPlaneStability,
          convergenceEvaluations: [
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-2',
              state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
              replicaBearing: true,
              localReplicaSeen: true,
              admissionReady: true,
              routingReady: true,
              schemaReady: true,
              localReplicaRole: 'follower',
              localReplicaVoterReady: true,
              degradationState: 'healthy',
              reasonCodes: ['leadership_unstable'],
              discoveryReasonCodes: ['leadership_unstable'],
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-3',
              state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
              replicaBearing: true,
              localReplicaSeen: true,
              routingReady: true,
              schemaReady: true,
              localReplicaRole: 'follower',
              localReplicaVoterReady: true,
              degradationState: 'healthy',
              reasonCodes: ['leadership_unstable'],
              discoveryReasonCodes: ['leadership_unstable'],
            }),
          ],
        }),
        'planner diagnostics should keep discovery-owned local replica evidence visible even when the raw table-distribution snapshot still lags',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers samples benchmark admission but does not ' +
  'block bootstrap once replica quorum exists', async () => {
    let partitionSampleCount = 0;
    let admissionSampleCount = 0;
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
          };
        }
        if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
          partitionSampleCount += 1;
          if (partitionSampleCount <= 4) {
            return {
              rows: [{partition_id: 'bench-p1'}],
            };
          }
          return {
            rows: [
              {partition_id: 'bench-p1'},
              {partition_id: 'bench-p2'},
            ],
          };
        }
        if (sql.includes(SERVICES_SQL_FRAGMENT)) {
          if (partitionSampleCount <= 4) {
            return {
              rows: [
                {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
              ],
            };
          }
          return {
            rows: [
              {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
              {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
              {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
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
      resolveBenchmarkReadyLoadNodes: async () => {
        admissionSampleCount += 1;
        if (admissionSampleCount <= 2) {
          return [];
        }
        if (partitionSampleCount <= 4) {
          return [clusterNodes[1]];
        }
        return [
          clusterNodes[1],
          clusterNodes[3],
          clusterNodes[4],
        ];
      },
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    );

    try {
      assert.ok(
        admissionSampleCount >= 1,
        'expected helper to sample benchmark admission during bootstrap',
      );
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'initial partitioning load should start once one admitted writer ' +
      'exists and replica quorum is available',
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });

      assert.deepEqual(
        plan.nodeResolver().map((node) => node.id),
        ['node-2', 'node-4', 'node-5', 'node-3', 'node-6'],
        'steady dispatch should keep backfilling with replica-bearing contributors when the usable-spread target still exceeds the proven local set',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers keeps pending bootstrap backfill on the ' +
  'replica-bearing cohort when no routed admission remains', async () => {
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const criticalControlPlaneStability =
    buildBenchmarkCriticalControlPlaneStabilitySnapshot({
      reasonCodes: ['critical_control_pending_write_growth'],
    });
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
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
      resolveBenchmarkLoadAdmissionSnapshot: async () =>
        buildBenchmarkLoadAdmissionSnapshot({
          criticalControlPlaneStability,
          evaluations: [
            {
              node: clusterNodes[0],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
            {
              node: clusterNodes[1],
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: true,
              topologyReady: true,
              localReplicaRole: 'follower',
              localReplicaVoterReady: true,
              leadershipStable: true,
              degradationState: 'healthy',
              reasonCodes: ['load_lane_denied'],
              loadLaneReasonCodes: ['load_lane_denied'],
            },
            {
              node: clusterNodes[2],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
            {
              node: clusterNodes[3],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
            {
              node: clusterNodes[4],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
            {
              node: clusterNodes[5],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
            {
              node: clusterNodes[6],
              localReplicaSeen: true,
              localAdmissionReady: false,
              admissionReady: false,
              admissionCheckEligible: true,
              routingReady: true,
              schemaReady: false,
              topologyReady: true,
              degradationState: 'healthy',
              reasonCodes: ['schema_partition_unavailable'],
              discoveryReasonCodes: ['schema_partition_unavailable'],
            },
          ],
        }),
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    );

    try {
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7', 'seed-1'],
        'pending control-plane pressure should keep local replica-bearing backfill visible when the routed admission set is empty',
      );
      assert.deepEqual(
        plan.nodeResolver().map((node) => node.id),
        ['node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7', 'seed-1'],
        'steady dispatch should not collapse to a single ready replica while pending control-plane backfill still needs local contributors',
      );
      const diagnostics = plan.getDiagnostics();
      assert.deepEqual(diagnostics.selectedNodeIds, [
        'node-2',
        'node-3',
        'node-4',
        'node-5',
        'node-6',
        'node-7',
        'seed-1',
      ]);
      assert.deepEqual(diagnostics.admissionReadyNodeIds, []);
      assert.deepEqual(diagnostics.readyReplicaNodeIds, ['node-2']);
      assert.deepEqual(diagnostics.replicaBearingNodeIds, [
        'node-2',
        'node-3',
        'node-4',
        'node-5',
        'node-6',
        'node-7',
        'seed-1',
      ]);
      assert.deepEqual(diagnostics.readinessReasonHistogram, {
        schema_partition_unavailable: 6,
      });
      assert.deepEqual(diagnostics.convergenceStateHistogram, {
        ready_replica: 1,
        replica_blocked: 6,
      });
      assert.deepEqual(diagnostics.dispatchContributionHistogram, {
        local_primary: 1,
        local_blocked: 6,
      });
      assert.deepEqual(
        diagnostics.criticalControlPlaneStability,
        criticalControlPlaneStability,
      );
      assert.equal(
        diagnostics.convergenceEvaluations.length,
        7,
        'expected the planner diagnostics to preserve the full pending replica cohort',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers keeps blocked replica spread visible when ' +
  'the shared admission snapshot distinguishes routed and local readiness',
  async () => {
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
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
      resolveBenchmarkLoadAdmissionSnapshot: async () =>
        buildBenchmarkLoadAdmissionSnapshot({
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
          ],
        }),
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    );

    try {
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'bootstrap should still use the replica-bearing quorum even when only one replica is locally ready',
      );
      assert.deepEqual(
        plan.getDiagnostics(),
        buildPlannerDiagnosticsExpectation({
          selectedNodeIds: ['node-2', 'node-3', 'node-4', 'seed-1'],
          admissionReadyNodeIds: ['node-2', 'node-3', 'node-4'],
          readyReplicaNodeIds: ['node-2'],
          replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
          partitionCount: 1,
          readinessReasonHistogram: {
            leadership_unstable: 1,
            local_replica_not_voter_ready: 1,
          },
          convergenceStateHistogram: {
            ready_replica: 1,
            replica_blocked: 2,
            routed_admission_only: 1,
          },
          localPrimaryNodeIds: ['node-2'],
          routedSupportNodeIds: ['node-4'],
          dispatchContributionHistogram: {
            local_blocked: 2,
            local_primary: 1,
            routed_support: 1,
          },
          degradationStateHistogram: {
            unknown: 4,
          },
          convergenceEvaluations: [
            buildConvergenceEvaluationExpectation({
              nodeId: 'seed-1',
              state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
              replicaBearing: true,
              localReplicaSeen: true,
              reasonCodes: ['leadership_unstable'],
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-2',
              state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
              replicaBearing: true,
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: true,
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-3',
              state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
              replicaBearing: true,
              localReplicaSeen: true,
              admissionReady: true,
              reasonCodes: ['local_replica_not_voter_ready'],
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-4',
              state: TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
              admissionReady: true,
            }),
          ],
        }),
        'planner diagnostics should keep blocked spread replicas visible instead of collapsing them into the admission-ready routed set',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers keeps steady partitioning dispatch in ' +
  'backfill mode until the usable-spread target exists',
  async () => {
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
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
      resolveBenchmarkLoadAdmissionSnapshot: async () =>
        buildBenchmarkLoadAdmissionSnapshot({
          evaluations: [
            {
              node: clusterNodes[0],
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: true,
              admissionCheckEligible: true,
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
        }),
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    );

    try {
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'bootstrap should still begin on the ready local replica quorum',
      );
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      assert.deepEqual(
        plan.nodeResolver().map((node) => node.id),
        ['node-2', 'node-3', 'seed-1', 'node-4'],
        'steady dispatch should keep routed backfill visible until the local contributor target exists',
      );
      assert.deepEqual(
        plan.getDiagnostics(),
        buildPlannerDiagnosticsExpectation({
          selectedNodeIds: ['node-2', 'node-3', 'seed-1', 'node-4'],
          admissionReadyNodeIds: ['node-2', 'node-3', 'node-4', 'seed-1'],
          readyReplicaNodeIds: ['node-2', 'node-3', 'seed-1'],
          replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
          partitionCount: 1,
          convergenceStateHistogram: {
            ready_replica: 3,
            routed_admission_only: 1,
          },
          localPrimaryNodeIds: ['seed-1', 'node-2', 'node-3'],
          routedSupportNodeIds: ['node-4'],
          dispatchContributionHistogram: {
            local_primary: 3,
            routed_support: 1,
          },
          degradationStateHistogram: {
            unknown: 4,
          },
          convergenceEvaluations: [
            buildConvergenceEvaluationExpectation({
              nodeId: 'seed-1',
              state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
              replicaBearing: true,
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: true,
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-2',
              state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
              replicaBearing: true,
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: true,
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-3',
              state: TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
              replicaBearing: true,
              localReplicaSeen: true,
              localAdmissionReady: true,
              admissionReady: true,
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-4',
              state: TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
              dispatchContributionState:
              TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
              admissionReady: true,
            }),
          ],
        }),
        'planner diagnostics should report only local pressure contributors as the active dispatch set while keeping the broader admission state visible',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers can bootstrap partitioning load when ' +
  'benchmark admission enforcement is disabled', async () => {
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
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
          enforceBenchmarkLoadAdmission: false,
        },
      },
      getNodes: () => clusterNodes,
      resolveBenchmarkReadyLoadNodes: async () => [],
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        timeoutMs: 40,
        pollIntervalMs: 5,
        stableWindowMs: 0,
        queryTimeoutMs: 5,
      },
    );

    try {
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'disabled admission enforcement should bootstrap on replica-bearing nodes',
      );
    } finally {
      plan.stop();
    }
  });

  test('table-distribution-helpers still promotes sampled admission-ready ' +
  'routed nodes when benchmark admission enforcement is disabled',
  async () => {
    let admissionSampleCount = 0;
    const clusterNodes = [
      {id: 'seed-1'},
      {id: 'node-2'},
      {id: 'node-3'},
      {id: 'node-4'},
      {id: 'node-5'},
      {id: 'node-6'},
      {id: 'node-7'},
    ];
    const seedNode = {
      id: 'seed-1',
      async query(sql) {
        if (sql.includes(TABLES_SQL_FRAGMENT)) {
          return {
            rows: [{table_id: 'tbl-benchmark-events-1'}],
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
          enforceBenchmarkLoadAdmission: false,
        },
      },
      getNodes: () => clusterNodes,
      resolveBenchmarkReadyLoadNodes: async () => {
        admissionSampleCount += 1;
        if (admissionSampleCount <= 2) {
          return [clusterNodes[1]];
        }
        return [
          clusterNodes[1],
          clusterNodes[3],
          clusterNodes[4],
          clusterNodes[5],
        ];
      },
    };

    const plan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: 'benchmark_events',
        tableId: 'tbl-benchmark-events-1',
        requiredNodeCount: 5,
        queryNodes: [seedNode],
        pollIntervalMs: 5,
        stableWindowMs: 0,
      },
    );

    try {
      assert.ok(
        admissionSampleCount >= 1,
        'disabled enforcement should still sample benchmark admission to widen load safely',
      );
      assert.deepEqual(
        plan.initialNodes.map((node) => node.id),
        ['node-2', 'node-3', 'seed-1'],
        'disabled enforcement should still bootstrap on the current replica-bearing quorum',
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      assert.deepEqual(
        plan.nodeResolver().map((node) => node.id),
        ['node-2', 'node-4', 'node-5', 'node-6', 'node-3'],
        'disabled enforcement should still promote benchmark-admitted routed nodes before falling back to replica-bearing nodes',
      );
    } finally {
      plan.stop();
    }
  });


  registerTableDistributionHelpersReadPathTailFinalTests({
    test,
    assert,
    admitBenchmarkLoadNodes,
    createPartitioningBenchmarkLoadNodePlan,
    ensureBenchmarkPartitioningTable,
    queryTableDistribution,
    resolvePartitioningBenchmarkLoadOpsPerSec,
    TABLE_BOOTSTRAP_VISIBILITY_STATE,
    waitForPartitionGrowthAndSpread,
    buildBenchmarkCriticalControlPlaneStabilitySnapshot,
    buildBenchmarkLoadAdmissionSnapshot,
    PARTITIONS_SQL_FRAGMENT,
    SERVICES_SQL_FRAGMENT,
    TABLES_SQL_FRAGMENT,
    TEST_DEFAULT_LEADER_NODE_ID,
    TEST_DEFAULT_PARTITION_REPLICA_COUNT,
    TEST_SERVICE_STATUS_ACTIVE,
    TEST_RAFT_ROLE_LEADER,
    TEST_PARTITION_CONVERGENCE_STATE_READY_REPLICA,
    TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
    TEST_PARTITION_CONVERGENCE_STATE_ROUTED_ADMISSION_ONLY,
    TEST_PARTITION_CONVERGENCE_STATE_ABSENT,
    TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_PRIMARY,
    TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
    TEST_DISPATCH_CONTRIBUTION_STATE_ROUTED_SUPPORT,
    TEST_DISPATCH_CONTRIBUTION_STATE_NONE,
    TEST_LOCAL_REPLICA_ROLE_UNKNOWN,
    TEST_DEGRADATION_STATE_UNKNOWN,
    TEST_RETRY_AFTER_NONE_MS,
    TEST_TABLE_ID_BOOTSTRAP_TIMEOUT_MS,
    TEST_CONTROL_QUERY_TIMEOUT_MS,
    TEST_CONTROL_QUERY_FAILOVER_MIN_TIMEOUT_MS,
    TEST_TABLE_ID_BOOTSTRAP_FAILOVER_MIN_TIMEOUT_MS,
    TEST_PARTITION_BOOTSTRAP_ALT_TIMEOUT_MS,
    TEST_CONTROL_QUERY_DEFERRED_OUTCOME,
    TEST_PUBLICATION_EPOCH_PENDING_REASON_CODE,
    TEST_PUBLISHED_CONVERGENCE_PENDING_DIMENSION,
    TEST_SELECTION_OBSERVATION_STATE_OBSERVED,
    TEST_SELECTION_OBSERVATION_STATE_DEFERRED,
    buildVisiblePartitionRow,
    buildActiveLeaderServiceRow,
    buildConvergenceEvaluationExpectation,
    buildPlannerDiagnosticsExpectation,
  });
}
