export function registerTableDistributionHelpersReadPathTailFinalTests({
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
test('table-distribution-helpers promotes admission-ready routed nodes ' +
  'after the replica bootstrap quorum is established', async () => {
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
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'node-3', 'seed-1'],
      'bootstrap should still start on the current replica-bearing quorum',
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-6', 'node-3'],
      'steady dispatch should promote wider admission-ready nodes before ' +
        'falling back to replica-bearing bootstrap nodes',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers can bootstrap on a majority-sized replica ' +
  'cohort before wider admission catches up', async () => {
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
    resolveBenchmarkReadyLoadNodes: async () => [
      clusterNodes[1],
      clusterNodes[3],
      clusterNodes[4],
      clusterNodes[5],
    ],
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
    assert.equal(plan.bootstrapRequiredNodeCount, 2);
    assert.deepEqual(
      plan.initialNodes.map((node) => node.id),
      ['node-2', 'seed-1'],
      'bootstrap should start once a majority-sized local replica cohort is active',
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    assert.deepEqual(
      plan.nodeResolver().map((node) => node.id),
      ['node-2', 'node-4', 'node-5', 'node-6', 'seed-1'],
      'refresh should widen to benchmark-admitted nodes after majority bootstrap',
    );
  } finally {
    plan.stop();
  }
});

test('table-distribution-helpers fails when the replica-bearing bootstrap ' +
  'quorum never stabilizes', async () => {
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
    resolveBenchmarkReadyLoadNodes: async () => [],
  };

  await assert.rejects(
    createPartitioningBenchmarkLoadNodePlan(
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
      },
    ),
    (error) => {
      assert.match(
        error.message,
        /Timed out after 40ms waiting for partitioning bootstrap quorum/i,
      );
      assert.match(error.message, /selectedNodeIds=seed-1/i);
      assert.match(error.message, /readyReplicaNodeIds=/i);
      assert.deepEqual(
        error.diagnostics?.partitioningPlanner,
        buildPlannerDiagnosticsExpectation({
          selectedNodeIds: ['seed-1'],
          admissionReadyNodeIds: [],
          readyReplicaNodeIds: [],
          replicaBearingNodeIds: ['seed-1'],
          partitionCount: 1,
          convergenceStateHistogram: {
            absent: 6,
            replica_blocked: 1,
          },
          dispatchContributionHistogram: {
            local_blocked: 1,
            none: 6,
          },
          degradationStateHistogram: {
            unknown: 7,
          },
          convergenceEvaluations: [
            buildConvergenceEvaluationExpectation({
              nodeId: 'seed-1',
              state: TEST_PARTITION_CONVERGENCE_STATE_REPLICA_BLOCKED,
              dispatchContributionState:
                TEST_DISPATCH_CONTRIBUTION_STATE_LOCAL_BLOCKED,
              replicaBearing: true,
              localReplicaSeen: true,
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-2',
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-3',
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-4',
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-5',
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-6',
            }),
            buildConvergenceEvaluationExpectation({
              nodeId: 'node-7',
            }),
          ],
        }),
      );
      return true;
    },
  );
});

test('table-distribution-helpers falls back to the legacy cluster load ' +
  'readiness gate when benchmark admission is unavailable', async () => {
  const calls = [];
  const clusterNodes = [
    {id: 'seed-1'},
    {id: 'node-2'},
    {id: 'node-3'},
  ];
  const cluster = {
    _config: {
      benchmark: {
        readyTimeoutMs: 36000,
        preloadRequiredStableMs: 2000,
      },
    },
    getNodes: () => clusterNodes,
    waitForLoadReadinessStability: async (options) => {
      calls.push(options);
    },
  };

  const admitted = await admitBenchmarkLoadNodes(cluster, {
    tableName: 'benchmark_events',
  });

  assert.deepEqual(admitted, clusterNodes);
  assert.deepEqual(calls, [{
    timeoutMs: 36000,
    stableWindowMs: 2000,
  }]);
});

test('table-distribution-helpers surfaces planner diagnostics when ' +
  'partition growth times out after load is runnable', async () => {
  let partitionSampleCount = 0;
  const plannerDiagnostics = {
    selectedNodeCount: 5,
    selectedNodeIds: ['node-2', 'node-3', 'node-4', 'node-5', 'node-6'],
    admissionReadyNodeCount: 4,
    admissionReadyNodeIds: ['node-2', 'node-4', 'node-5', 'node-6'],
    readyReplicaNodeCount: 1,
    readyReplicaNodeIds: ['node-2'],
    replicaBearingNodeCount: 3,
    replicaBearingNodeIds: ['node-2', 'node-3', 'seed-1'],
    partitionCount: 3,
    readinessReasonHistogram: {
      leadership_unstable: 4,
    },
    convergenceStateHistogram: {
      ready_replica: 1,
      replica_blocked: 2,
      routed_admission_only: 4,
    },
  };
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
      if (sql.includes(PARTITIONS_SQL_FRAGMENT)) {
        partitionSampleCount += 1;
        if (partitionSampleCount === 1) {
          return {
            rows: [{partition_id: 'bench-p1'}],
          };
        }
        return {
          rows: [
            {partition_id: 'bench-p1'},
            {partition_id: 'bench-p2'},
            {partition_id: 'bench-p3'},
          ],
        };
      }
      if (sql.includes(SERVICES_SQL_FRAGMENT)) {
        if (partitionSampleCount <= 1) {
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
            {partition_id: 'bench-p2', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p2', node_id: 'node-3', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'seed-1', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'node-2', status: 'active'},
            {partition_id: 'bench-p3', node_id: 'node-3', status: 'active'},
          ],
        };
      }
      return {rows: []};
    },
  };

  await assert.rejects(
    waitForPartitionGrowthAndSpread(seedNode, {
      tableName: 'benchmark_events',
      timeoutMs: 40,
      pollIntervalMs: 5,
      minAdditionalPartitions: 2,
      minDistinctReplicaNodes: 5,
      plannerDiagnosticsResolver: () => plannerDiagnostics,
    }),
    (error) => {
      assert.match(error.message, /failureMode=replica_spread_stalled/i);
      assert.match(error.message, /selectedNodeIds=node-2,node-3,node-4,node-5,node-6/i);
      assert.match(error.message, /admissionReadyNodeIds=node-2,node-4,node-5,node-6/i);
      assert.match(error.message, /readinessReasonHistogram=leadership_unstable:4/i);
      assert.match(error.message, /convergenceStateHistogram=ready_replica:1\|replica_blocked:2\|routed_admission_only:4/i);
      assert.deepEqual(error.diagnostics?.partitioningPlanner, plannerDiagnostics);
      assert.equal(
        error.diagnostics?.partitionGrowth?.tableName,
        'benchmark_events',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.failureMode,
        'replica_spread_stalled',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.baselinePartitionCount,
        1,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.currentPartitionCount,
        3,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.additionalPartitionCount,
        2,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.replicaNodeCount,
        3,
      );
      assert.ok(
        error.diagnostics?.partitionGrowth?.sampleCount >= 2,
        'expected timeout diagnostics to include at least two samples',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.transientQueryErrors,
        0,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.lastQueryError,
        'none',
      );
      return true;
    },
  );
});

test('table-distribution-helpers does not classify local-replica progress as ' +
  'planner-not-runnable when routed admission is empty', async () => {
  const plannerDiagnostics = buildPlannerDiagnosticsExpectation({
    selectedNodeIds: [
      'node-2',
      'node-3',
      'node-4',
      'node-5',
      'node-6',
      'node-7',
      'seed-1',
    ],
    admissionReadyNodeIds: [],
    readyReplicaNodeIds: ['node-2'],
    replicaBearingNodeIds: [
      'seed-1',
      'node-2',
      'node-3',
      'node-4',
      'node-5',
      'node-6',
      'node-7',
    ],
    partitionCount: 1,
    readinessReasonHistogram: {
      schema_partition_unavailable: 6,
    },
    convergenceStateHistogram: {
      ready_replica: 1,
      replica_blocked: 6,
    },
    localPrimaryNodeIds: ['node-2'],
    dispatchContributionHistogram: {
      local_primary: 1,
      local_blocked: 6,
    },
    degradationStateHistogram: {
      healthy: 7,
    },
  });
  const seedNode = {
    id: 'seed-1',
    async query(sql) {
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

  await assert.rejects(
    waitForPartitionGrowthAndSpread(seedNode, {
      tableName: 'benchmark_events',
      timeoutMs: 40,
      pollIntervalMs: 5,
      minAdditionalPartitions: 2,
      minDistinctReplicaNodes: 5,
      plannerDiagnosticsResolver: () => plannerDiagnostics,
    }),
    (error) => {
      assert.match(error.message, /failureMode=partition_growth_stalled/i);
      assert.ok(
        !/failureMode=planner_not_runnable/i.test(error.message),
        'expected a live local-ready replica cohort to avoid planner_not_runnable classification',
      );
      assert.deepEqual(error.diagnostics?.partitioningPlanner, plannerDiagnostics);
      assert.equal(
        error.diagnostics?.partitionGrowth?.failureMode,
        'partition_growth_stalled',
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.baselinePartitionCount,
        1,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.currentPartitionCount,
        1,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.additionalPartitionCount,
        0,
      );
      assert.equal(
        error.diagnostics?.partitionGrowth?.replicaNodeCount,
        2,
      );
      return true;
    },
  );
});

test('table-distribution-helpers scales partitioning load to admitted node ' +
  'capacity with control-plane headroom', async () => {
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(140, 3, 7),
    30,
  );
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(120, 3, 7),
    26,
  );
  assert.equal(
    resolvePartitioningBenchmarkLoadOpsPerSec(140, 7, 7),
    70,
  );
});
}
