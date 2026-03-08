/**
 * Scenario: Seven-Node Load During Partitioning
 *
 * Applies low split thresholds via table policies on the target table,
 * starts mixed load, then verifies partition growth occurs while the
 * workload continues to make progress.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveSevenNodeLoadDuringPartitioningScenarioConfig,
} from '../harness/scenario-config.js';
import {
  escapeSql,
  sleep,
  queryTableDistribution,
  rowsFromResult,
} from './table-distribution-helpers.js';

const ZERO = 0;
const SPLIT_STORAGE_THRESHOLD_BYTES = 16384;
const SPLIT_TRAFFIC_THRESHOLD_QPM = 120;
const MERGE_STORAGE_THRESHOLD_BYTES = 1;
const MERGE_TRAFFIC_THRESHOLD_QPM = 1;

const TABLE_SPLIT_POLICIES = Object.freeze({
  splitStorageThreshold: SPLIT_STORAGE_THRESHOLD_BYTES,
  splitTrafficThreshold: SPLIT_TRAFFIC_THRESHOLD_QPM,
  mergeStorageThreshold: MERGE_STORAGE_THRESHOLD_BYTES,
  mergeTrafficThreshold: MERGE_TRAFFIC_THRESHOLD_QPM,
});

const SQL_SELECT_TABLE_ID_PREFIX =
  'SELECT table_id FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_ID_SUFFIX = '\'';
const SQL_UPDATE_TABLE_POLICIES_PREFIX =
  'UPDATE tables SET table_policies = \'';
const SQL_UPDATE_TABLE_POLICIES_MID =
  '\' WHERE table_id = \'';
const SQL_UPDATE_TABLE_POLICIES_SUFFIX = '\'';
const SQL_CONTROL_SNAPSHOT =
  'SELECT * FROM control_snapshot_local()';
const FAILURE_PHASE_PARTITIONING = 'partitioning_under_load';
const FAILURE_ROOT_CAUSE_CLASS_PROGRESSION = 'progression';
const FAILURE_REASON_NO_SPLIT_ATTEMPTS = 'no_split_attempt_evidence';
const FAILURE_REASON_NO_PARTITIONING_EVIDENCE = 'no_partitioning_evidence';

/**
 * Pick seed node with deterministic fallback.
 * @param {Array<Object>} nodes
 * @return {Object}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[0];
}

/**
 * Increment a histogram counter.
 * @param {Object} histogram
 * @param {string} key
 */
function incrementHistogram(histogram, key) {
  const normalizedKey = String(key || '');
  if (normalizedKey.length === ZERO) {
    return;
  }
  histogram[normalizedKey] = (histogram[normalizedKey] || ZERO) + 1;
}

/**
 * Record newly observed partition IDs.
 * @param {Set<string>} baselinePartitionIds
 * @param {Set<string>} additionalPartitionIds
 * @param {Set<string>} currentPartitionIds
 */
function trackAdditionalPartitions(
  baselinePartitionIds,
  additionalPartitionIds,
  currentPartitionIds,
) {
  for (const partitionId of currentPartitionIds) {
    if (baselinePartitionIds.has(partitionId)) {
      continue;
    }
    additionalPartitionIds.add(partitionId);
  }
}

/**
 * Query the table_id for a given table name.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string|null>}
 */
async function queryTableId(seedNode, tableName) {
  const sql = SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;
  const result = await seedNode.query(sql);
  const rows = rowsFromResult(result);
  for (const row of rows) {
    const value = row?.table_id || row?.tableId;
    if (typeof value === 'string' && value.length > ZERO) {
      return value;
    }
  }
  return null;
}

/**
 * Apply low split thresholds as table policies on the target table.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string>}
 */
async function applyTableSplitPolicies(seedNode, tableName) {
  const tableId = await queryTableId(seedNode, tableName);
  assert.ok(
    tableId,
    'Could not resolve table_id for "' + tableName +
    '" — table must exist before applying split policies',
  );
  const policySql = SQL_UPDATE_TABLE_POLICIES_PREFIX +
    escapeSql(JSON.stringify(TABLE_SPLIT_POLICIES)) +
    SQL_UPDATE_TABLE_POLICIES_MID +
    escapeSql(tableId) +
    SQL_UPDATE_TABLE_POLICIES_SUFFIX;
  await seedNode.query(policySql);
  return tableId;
}

/**
 * Summarize placement eligibility reasons from control diagnostics.
 * @param {Object} placementByNodeId
 * @return {Object}
 */
function summarizePlacementEligibility(placementByNodeId) {
  const placements = placementByNodeId &&
    typeof placementByNodeId === 'object' ?
    Object.values(placementByNodeId) :
    [];
  const reasonCounts = {};
  let eligibleNodeCount = ZERO;
  let ineligibleNodeCount = ZERO;

  for (const placement of placements) {
    if (placement?.placementEligible === true) {
      eligibleNodeCount += 1;
    } else {
      ineligibleNodeCount += 1;
    }
    const reasonCodes = Array.isArray(placement?.reasonCodes) ?
      placement.reasonCodes :
      [];
    for (const reasonCode of reasonCodes) {
      incrementHistogram(reasonCounts, reasonCode);
    }
  }

  return {
    totalNodes: placements.length,
    eligibleNodeCount,
    ineligibleNodeCount,
    reasonCounts,
  };
}

/**
 * Summarize split-workflow admissions for one target table.
 * @param {Object} workflowAdmissionsByWorkflowId
 * @param {string} tableName
 * @param {string} tableId
 * @return {Object}
 */
function summarizeSplitWorkflowAdmissions(
  workflowAdmissionsByWorkflowId,
  tableName,
  tableId,
) {
  const workflows = workflowAdmissionsByWorkflowId &&
    typeof workflowAdmissionsByWorkflowId === 'object' ?
    Object.values(workflowAdmissionsByWorkflowId) :
    [];
  const matchingWorkflows = workflows.filter((workflow) => {
    if (!workflow || typeof workflow !== 'object') {
      return false;
    }
    const matchesTableName = workflow.tableName === tableName;
    const matchesTableId =
      typeof tableId === 'string' &&
      tableId.length > ZERO &&
      workflow.tableId === tableId;
    return matchesTableName || matchesTableId;
  });

  const decisionTypeCounts = {};
  const transitionStateCounts = {};
  const blockingReasonCounts = {};

  for (const workflow of matchingWorkflows) {
    incrementHistogram(
      decisionTypeCounts,
      workflow?.admission?.decisionType || workflow?.admission?.decision,
    );
    incrementHistogram(transitionStateCounts, workflow?.transitionState);
    const blockingReasons = Array.isArray(workflow?.blockingReasons) ?
      workflow.blockingReasons :
      [];
    for (const reason of blockingReasons) {
      incrementHistogram(blockingReasonCounts, reason);
    }
  }

  return {
    workflowCount: matchingWorkflows.length,
    decisionTypeCounts,
    transitionStateCounts,
    blockingReasonCounts,
    workflowIds: matchingWorkflows
      .map((workflow) => String(workflow?.workflowId || ''))
      .filter((workflowId) => workflowId.length > ZERO)
      .sort(),
  };
}

/**
 * Query split progress diagnostics from control snapshot.
 * @param {Object} seedNode
 * @param {string} tableName
 * @param {string} tableId
 * @return {Promise<Object>}
 */
async function querySplitProgressDiagnostics(seedNode, tableName, tableId) {
  try {
    const result = await seedNode.query(SQL_CONTROL_SNAPSHOT);
    const rows = rowsFromResult(result);
    if (rows.length === ZERO) {
      return {
        available: false,
        error: 'control snapshot returned no rows',
      };
    }
    const snapshot = rows[0];
    const controlPlaneDiagnostics = snapshot?.controlPlaneDiagnostics &&
      typeof snapshot.controlPlaneDiagnostics === 'object' ?
      snapshot.controlPlaneDiagnostics :
      null;
    if (!controlPlaneDiagnostics) {
      return {
        available: false,
        error: 'control snapshot missing controlPlaneDiagnostics',
      };
    }

    return {
      available: true,
      capturedAt: snapshot?.capturedAt || null,
      workflowSummary: summarizeSplitWorkflowAdmissions(
        controlPlaneDiagnostics.workflowAdmissionsByWorkflowId,
        tableName,
        tableId,
      ),
      placementSummary: summarizePlacementEligibility(
        controlPlaneDiagnostics.placementEligibilityByNodeId,
      ),
      replicaOperationSummary: snapshot?.replicaOperations || null,
      publicationMode: controlPlaneDiagnostics.publicationMode || null,
    };
  } catch (error) {
    return {
      available: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * Build a structured scenario failure for deterministic diagnostics.
 * @param {Object} options
 * @return {Error}
 */
function buildPartitioningFailure(options) {
  const reasonCode = options.reasonCode;
  const error = new Error(options.message);
  error.diagnostics = {
    failure: {
      phase: FAILURE_PHASE_PARTITIONING,
      rootCauseClass: FAILURE_ROOT_CAUSE_CLASS_PROGRESSION,
      dominantReason: reasonCode,
      reasonCounts: {
        [reasonCode]: 1,
      },
      timeoutMs: options.timeoutMs,
      sampleCount: options.sampleCount,
      baselinePartitionCount: options.baselinePartitionCount,
      additionalPartitionCount: options.additionalPartitionCount,
      replicaNodeCount: options.replicaNodeCount,
      metricsTotal: options.metricsTotal,
      metricsAtFirstPartitioning: options.metricsAtFirstPartitioning,
      splitProgress: options.splitProgress || null,
    },
  };
  return error;
}

/**
 * Run the seven-node load-during-partitioning scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    expectedNodeCount,
    loadOpsPerSec,
    loadDuration,
    loadOperations,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    partitioningTimeoutMs,
    splitAttemptTimeoutMs,
    partitioningPollIntervalMs,
    minOpsAfterPartitioning,
    minSuccessRate,
  } = resolveSevenNodeLoadDuringPartitioningScenarioConfig(options);

  const nodes = cluster.getNodes();
  assert.equal(
    nodes.length,
    expectedNodeCount,
    'Scenario requires exactly ' + expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: CONVERGENCE_DEFAULTS.settleTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  const tableId = await applyTableSplitPolicies(seedNode, tableName);

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    operations: loadOperations,
  });

  let partitioningEvidence = null;
  try {
    const baseline = await queryTableDistribution(
      seedNode, {tableName},
    );
    assert.ok(
      baseline.partitionCount > ZERO,
      'No partitions found for table "' + tableName +
      '" at scenario start',
    );

    const baselinePartitionIds = new Set(baseline.partitionIds);
    const additionalPartitionIds = new Set();
    const deadline = Date.now() + partitioningTimeoutMs;
    const splitAttemptDeadline = Date.now() + splitAttemptTimeoutMs;

    let sampleCount = ZERO;
    let metricsAtFirstPartitioning = null;
    let latestDistribution = baseline;
    let latestMetrics = loadRun.getMetrics();
    let latestSplitProgress = null;
    let successObserved = false;

    while (Date.now() <= deadline) {
      sampleCount += 1;
      latestDistribution = await queryTableDistribution(
        seedNode, {tableName},
      );
      latestMetrics = loadRun.getMetrics();
      latestSplitProgress = await querySplitProgressDiagnostics(
        seedNode,
        tableName,
        tableId,
      );

      trackAdditionalPartitions(
        baselinePartitionIds,
        additionalPartitionIds,
        latestDistribution.partitionIds,
      );

      if (latestSplitProgress.available === true &&
          latestSplitProgress.workflowSummary.workflowCount === ZERO &&
          Date.now() >= splitAttemptDeadline) {
        throw buildPartitioningFailure({
          reasonCode: FAILURE_REASON_NO_SPLIT_ATTEMPTS,
          message:
            'Timed out waiting for split-attempt evidence. ' +
            'workflowCount=0, placement.ineligible=' +
            latestSplitProgress.placementSummary.ineligibleNodeCount +
            ', additionalPartitions=' + additionalPartitionIds.size +
            ', spread=' + latestDistribution.replicaNodeCount +
            ', metrics.total=' + latestMetrics.total,
          timeoutMs: splitAttemptTimeoutMs,
          sampleCount,
          baselinePartitionCount: baseline.partitionCount,
          additionalPartitionCount: additionalPartitionIds.size,
          replicaNodeCount: latestDistribution.replicaNodeCount,
          metricsTotal: latestMetrics.total,
          metricsAtFirstPartitioning,
          splitProgress: latestSplitProgress,
        });
      }

      if (metricsAtFirstPartitioning === null &&
          additionalPartitionIds.size > ZERO) {
        metricsAtFirstPartitioning = latestMetrics.total;
      }

      const growthSatisfied =
        additionalPartitionIds.size >= minAdditionalPartitions;
      const spreadSatisfied =
        latestDistribution.replicaNodeCount >=
        minDistinctReplicaNodes;
      const operationsAfterPartitioning =
        metricsAtFirstPartitioning === null ?
          ZERO :
          latestMetrics.total - metricsAtFirstPartitioning;
      const workloadDuringPartitioningSatisfied =
        metricsAtFirstPartitioning !== null &&
        operationsAfterPartitioning >= minOpsAfterPartitioning;

      if (growthSatisfied &&
          spreadSatisfied &&
          workloadDuringPartitioningSatisfied) {
        successObserved = true;
        partitioningEvidence = {
          baselinePartitionCount: baseline.partitionCount,
          additionalPartitionCount: additionalPartitionIds.size,
          additionalPartitionIds:
            Array.from(additionalPartitionIds).sort(),
          replicaNodeCount: latestDistribution.replicaNodeCount,
          replicaNodeIds:
            Array.from(latestDistribution.replicaNodeIds).sort(),
          metricsAtFirstPartitioning,
          metricsAtSuccess: latestMetrics.total,
          operationsAfterPartitioning,
          sampleCount,
          splitProgress: latestSplitProgress,
        };
        break;
      }

      if (Date.now() >= deadline) {
        break;
      }
      await sleep(partitioningPollIntervalMs);
    }

    if (!successObserved) {
      throw buildPartitioningFailure({
        reasonCode: FAILURE_REASON_NO_PARTITIONING_EVIDENCE,
        message:
          'Timed out waiting for partitioning-under-load evidence. ' +
          'Additional partitions=' + additionalPartitionIds.size +
          ', spread=' + latestDistribution.replicaNodeCount +
          ', metrics.total=' + latestMetrics.total +
          ', metricsAtFirstPartitioning=' +
          metricsAtFirstPartitioning,
        timeoutMs: partitioningTimeoutMs,
        sampleCount,
        baselinePartitionCount: baseline.partitionCount,
        additionalPartitionCount: additionalPartitionIds.size,
        replicaNodeCount: latestDistribution.replicaNodeCount,
        metricsTotal: latestMetrics.total,
        metricsAtFirstPartitioning,
        splitProgress: latestSplitProgress,
      });
    }
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(
    metrics.total > ZERO,
    'Expected at least one mixed load operation',
  );

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Mixed load success rate below threshold: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    expectedNodeCount,
    tableName,
    convergenceTiming: convergence,
    partitioningEvidence,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
