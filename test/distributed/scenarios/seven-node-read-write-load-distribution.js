/**
 * Scenario: Seven-Node Read/Write Load with Distribution
 *
 * Verifies a table remains broadly distributed while serving mixed read and
 * write traffic.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS, TIMEOUTS} from '../harness/constants.js';
import {
  resolveSevenNodeReadWriteLoadDistributionScenarioConfig,
} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  createPartitioningAdaptiveDispatchGuardrail,
  createPartitioningBenchmarkLoadNodePlan,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  resolvePartitioningLoadTableName,
  sleep,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
} from './table-distribution-helpers.js';

const ZERO = 0;

async function waitForControlPlaneQuiescenceBestEffort(cluster, options) {
  if (typeof cluster.waitForControlPlaneQuiescence !== 'function') {
    return null;
  }
  try {
    return await cluster.waitForControlPlaneQuiescence(options);
  } catch (error) {
    return {
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pick seed node with deterministic fallback.
 * @param {Array<Object>} nodes
 * @return {Object}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[0];
}

/**
 * Run the seven-node read/write load + distribution scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    expectedNodeCount,
    convergenceTimeoutMs,
    controlPlaneQuiescenceTimeoutMs,
    controlPlaneQuiescenceNoProgressTimeoutMs,
    loadOpsPerSec,
    loadDuration,
    loadOperations,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    distributionTimeoutMs,
    distributionPollIntervalMs,
    postDistributionSoakMs,
    minSuccessRate,
  } = resolveSevenNodeReadWriteLoadDistributionScenarioConfig(options);

  const nodes = cluster.getNodes();
  assert.equal(
    nodes.length,
    expectedNodeCount,
    'Scenario requires exactly ' + expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');
  const effectiveTableName = resolvePartitioningLoadTableName(
    cluster,
    tableName,
    {
      explicitTableName:
        typeof options.tableName === 'string' &&
        options.tableName.length > ZERO,
    },
  );

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  const controlPlaneQuiescence =
    await waitForControlPlaneQuiescenceBestEffort(cluster, {
      timeoutMs: controlPlaneQuiescenceTimeoutMs,
      noProgressTimeoutMs: controlPlaneQuiescenceNoProgressTimeoutMs,
    });

  const tablePreparation = await prepareBenchmarkPartitioningTable(
    seedNode,
    {
      tableName: effectiveTableName,
      queryNodes: nodes,
    },
  );
  assertSplitPolicyPrecondition(tablePreparation, {
    scenarioName: 'seven-node-read-write-load-distribution',
  });
  let loadNodePlan;
  let loadNodeAdmissionFallback = null;
  try {
    loadNodePlan = await createPartitioningBenchmarkLoadNodePlan(
      seedNode,
      cluster,
      {
        tableName: effectiveTableName,
        tableId: tablePreparation.tableId,
        requiredNodeCount: minDistinctReplicaNodes,
        timeoutMs: Math.max(distributionTimeoutMs, convergenceTimeoutMs),
        queryNodes: nodes,
      },
    );
    if (loadNodePlan?.admissionFallbackWarning) {
      loadNodeAdmissionFallback = {
        warning: loadNodePlan.admissionFallbackWarning,
      };
    }
  } catch (error) {
    loadNodeAdmissionFallback = {
      warning: error instanceof Error ? error.message : String(error),
    };
    loadNodePlan = {
      initialNodes: [seedNode],
      nodeResolver: () => [seedNode],
      stop: () => {},
      bootstrapRequiredNodeCount: 1,
      targetNodeCount: 1,
    };
  }
  const effectiveLoadOpsPerSec = resolvePartitioningBenchmarkLoadOpsPerSec(
    loadOpsPerSec,
    loadNodePlan.initialNodes.length,
    nodes.length,
  );

  const loadRun = cluster.startLoad({
    nodes: loadNodePlan.initialNodes,
    nodeResolver: loadNodePlan.nodeResolver,
    opsPerSec: effectiveLoadOpsPerSec,
    duration: loadDuration,
    adaptiveDispatchGuardrail: createPartitioningAdaptiveDispatchGuardrail(),
    operations: loadOperations,
    tableName: effectiveTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
  });

  let distribution = null;
  try {
    distribution = await waitForPartitionGrowthAndSpread(seedNode, {
      tableName: effectiveTableName,
      timeoutMs: distributionTimeoutMs,
      pollIntervalMs: distributionPollIntervalMs,
      minAdditionalPartitions,
      minDistinctReplicaNodes,
      queryNodes: nodes,
    });

    if (postDistributionSoakMs > ZERO) {
      await sleep(postDistributionSoakMs);
    }
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    if (typeof loadNodePlan.stop === 'function') {
      loadNodePlan.stop();
    }
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one mixed load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Mixed read/write success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  const finalDistribution = await queryTableDistribution(seedNode, {
    tableName: effectiveTableName,
    queryNodes: nodes,
  });
  assert.ok(
    finalDistribution.replicaNodeCount >= minDistinctReplicaNodes,
    'Table replicas are no longer broadly spread after load. Spread=' +
    finalDistribution.replicaNodeCount + ', expected >= ' +
    minDistinctReplicaNodes,
  );

  await cluster.waitForConsistencyConvergence({
    timeoutMs: TIMEOUTS.CONSISTENCY_CONVERGENCE_POST_SPLIT,
  });

  return {
    expectedNodeCount,
    tableName: effectiveTableName,
    tablePreparation,
    convergenceTiming: convergence,
    controlPlaneQuiescence,
    loadNodeAdmissionFallback,
    distribution,
    finalDistribution: {
      partitionCount: finalDistribution.partitionCount,
      replicaNodeCount: finalDistribution.replicaNodeCount,
      replicaNodeIds: Array.from(finalDistribution.replicaNodeIds).sort(),
    },
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
