/**
 * Scenario: Node Failure and Rebalance
 *
 * Start cluster under load, SIGKILL a non-seed node, verify
 * automatic failover and data consistency.
 *
 * Requirements: 4.1, 5.1, 5.4
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';
import {
  isPostRebalanceCdcProjectionVisibleSatisfied,
  countCacheVisibleSatisfiedPriorityRecoveryOperations as
  countVisibleSatisfiedPriorityRecoveryOperations,
} from '../harness/post-rebalance-closure-contract.js';
import {ASSERTIONS_SEGMENT_2} from '../harness/assertions-segment-2.js';
const {queryReachableClusterSnapshot} = ASSERTIONS_SEGMENT_2;

const LOAD_OPS_PER_SEC = 50;
const LOAD_DURATION = '60s';
const PRE_KILL_SETTLE_MS = SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs;
const POST_KILL_CONVERGENCE_TIMEOUT_MS = 180000;
const CONSISTENCY_CONVERGENCE_TIMEOUT_MS = 60000;
const CONSISTENCY_SNAPSHOT_TIMEOUT_MS = 30000;
const ZERO_FAILURES = 0;
const SURVIVING_VOTER_COUNT = 2;
const IGNORE_STALE_IN_FLIGHT_REPLICA_OPERATIONS = true;
const SQL_LOG_ID_COLUMN = 'log_id';
const ACKNOWLEDGED_WRITE_ALIAS = 'ack_id';
const ACKNOWLEDGED_WRITE_BATCH_SIZE = 100;
const ACKNOWLEDGED_WRITE_MISSING_PREVIEW_LIMIT = 10;
const DEFAULT_ACKNOWLEDGED_WRITE_TABLE = 'logs';
const CLIENT_ERROR_CLASSIFICATION = Object.freeze({
  CLEAN: 'clean',
  TOLERATED_CLIENT_DISRUPTION: 'tolerated_client_disruption',
  UNEXPECTED_CLIENT_ERROR: 'unexpected_client_error',
});
const POST_REBALANCE_VISIBLE_SATISFIED_OPTION =
  'cacheVisibleSatisfiedPriorityRecoveryOperationCount';

function normalizeNonNegativeInteger(value, fallback = ZERO_FAILURES) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(ZERO_FAILURES, Math.floor(numericValue));
}

function normalizeRows(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

function normalizeNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > ZERO_FAILURES ?
    value :
    fallback;
}

function normalizeNodeIdList(values) {
  const candidates = Array.isArray(values) ?
    values :
    values instanceof Set ?
      Array.from(values) :
      [];
  return candidates
    .map((value) => String(value || ''))
    .filter((value) => value.length > ZERO_FAILURES)
    .sort();
}

function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

function buildAcknowledgedWriteVisibilityQuery(tableName, idColumn, ids) {
  return 'SELECT ' + idColumn + ' AS ' + ACKNOWLEDGED_WRITE_ALIAS +
    ' FROM ' + tableName + ' WHERE ' + idColumn + ' IN (' +
    ids.map((id) => '\'' + escapeSql(id) + '\'').join(', ') + ')';
}

async function assertAcknowledgedWritesVisibleOnSurvivors(
  acknowledgedWrites,
  survivingNodes,
) {
  const ids = Array.isArray(acknowledgedWrites?.ids) ?
    [...new Set(acknowledgedWrites.ids
      .filter((id) => typeof id === 'string' && id.length > ZERO_FAILURES))] :
    [];
  if (ids.length === ZERO_FAILURES) {
    return {
      acknowledgedWriteCount: ZERO_FAILURES,
      survivingNodeCount: survivingNodes.length,
    };
  }

  const tableName = normalizeNonEmptyString(
    acknowledgedWrites?.tableName,
    DEFAULT_ACKNOWLEDGED_WRITE_TABLE,
  );
  const idColumn = normalizeNonEmptyString(
    acknowledgedWrites?.idColumn,
    SQL_LOG_ID_COLUMN,
  );

  for (const node of survivingNodes) {
    const missingIds = [];
    for (let index = ZERO_FAILURES; index < ids.length;
      index += ACKNOWLEDGED_WRITE_BATCH_SIZE) {
      const idBatch = ids.slice(index, index + ACKNOWLEDGED_WRITE_BATCH_SIZE);
      const query = buildAcknowledgedWriteVisibilityQuery(
        tableName,
        idColumn,
        idBatch,
      );
      const visibleIds = new Set(
        normalizeRows(await node.query(query))
          .map((row) => row?.[ACKNOWLEDGED_WRITE_ALIAS])
          .filter((id) => typeof id === 'string' && id.length > ZERO_FAILURES),
      );
      for (const id of idBatch) {
        if (!visibleIds.has(id)) {
          missingIds.push(id);
        }
      }
    }
    assert.equal(
      missingIds.length,
      ZERO_FAILURES,
      'Acknowledged writes missing after node failure on node ' +
        String(node?.id || 'unknown') + ': ' +
        JSON.stringify(
          missingIds.slice(
            ZERO_FAILURES,
            ACKNOWLEDGED_WRITE_MISSING_PREVIEW_LIMIT,
          ),
        ) +
        (missingIds.length > ACKNOWLEDGED_WRITE_MISSING_PREVIEW_LIMIT ?
          ' (+' +
          String(
            missingIds.length - ACKNOWLEDGED_WRITE_MISSING_PREVIEW_LIMIT,
          ) +
          ' more)' :
          ''),
    );
  }

  return {
    acknowledgedWriteCount: ids.length,
    survivingNodeCount: survivingNodes.length,
  };
}

function buildClientErrorClassification(metrics) {
  const waitReasons = metrics?.waitReasons &&
    typeof metrics.waitReasons === 'object' &&
    !Array.isArray(metrics.waitReasons) ?
    {...metrics.waitReasons} :
    {};
  const distinctErrors = Array.isArray(metrics?.distinctErrors) ?
    [...metrics.distinctErrors] :
    [];
  const failedOperations = Math.max(
    normalizeNonNegativeInteger(metrics?.failed),
    normalizeNonNegativeInteger(metrics?.errors),
  );
  const nonAdmissionAttemptErrors = normalizeNonNegativeInteger(
    metrics?.nonAdmissionAttemptErrors,
  );
  const unexpectedClientErrorCount = Math.max(
    failedOperations,
    nonAdmissionAttemptErrors,
  );
  const admissionSignals = normalizeNonNegativeInteger(
    metrics?.admissionSignals,
  );
  const attemptErrors = normalizeNonNegativeInteger(metrics?.attemptErrors);
  const toleratedDisruptionCount = Math.max(
    admissionSignals,
    attemptErrors - nonAdmissionAttemptErrors,
    ...Object.values(waitReasons)
      .map((count) => normalizeNonNegativeInteger(count)),
  );
  const state = unexpectedClientErrorCount > ZERO_FAILURES ?
    CLIENT_ERROR_CLASSIFICATION.UNEXPECTED_CLIENT_ERROR :
    toleratedDisruptionCount > ZERO_FAILURES ?
      CLIENT_ERROR_CLASSIFICATION.TOLERATED_CLIENT_DISRUPTION :
      CLIENT_ERROR_CLASSIFICATION.CLEAN;

  return {
    state,
    totalOperations: normalizeNonNegativeInteger(metrics?.total),
    successfulOperations: normalizeNonNegativeInteger(metrics?.success),
    failedOperations,
    attemptErrors,
    admissionSignals,
    nonAdmissionAttemptErrors,
    unexpectedClientErrorCount,
    toleratedDisruptionCount,
    distinctErrors,
    waitReasons,
  };
}

function emitClientErrorClassification(classification) {
  console.log('[CLIENT-ERROR-CLASSIFICATION] Load run completed.');
  console.log(`- State: ${classification.state}`);
  console.log(`- Total Operations: ${classification.totalOperations}`);
  console.log(`- Successful Operations: ${classification.successfulOperations}`);
  console.log(`- Failed Operations: ${classification.failedOperations}`);
  console.log(`- Total Attempt Errors: ${classification.attemptErrors}`);
  console.log(`- Admission Signal Backoffs: ${classification.admissionSignals}`);
  console.log(
    '- Non-Admission Client Errors: ' +
    classification.nonAdmissionAttemptErrors,
  );

  if (classification.distinctErrors.length > ZERO_FAILURES) {
    console.log('- Distinct Client Error Messages observed:');
    for (const errMsg of classification.distinctErrors) {
      console.log(`  * "${errMsg}"`);
    }
  }

  for (const [reason, count] of Object.entries(classification.waitReasons)) {
    if (normalizeNonNegativeInteger(count) > ZERO_FAILURES) {
      console.log(`- Scheduler Wait Reason ${reason}: ${count}`);
    }
  }
}

/**
 * Run the node-failure-rebalance scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 */
async function run(cluster) {
  // 1. Start sustained write load.
  const loadRun = cluster.startLoad({
    opsPerSec: LOAD_OPS_PER_SEC,
    duration: LOAD_DURATION,
    trackAcknowledgedWrites: true,
  });

  // 2. Let load stabilize.
  await new Promise((r) => setTimeout(r, PRE_KILL_SETTLE_MS));

  // 3. Kill a random non-seed node via SIGKILL.
  const victimId = cluster.randomNonSeed();
  assert.ok(victimId, 'No non-seed node available to kill');
  await cluster.killNode(victimId);

  // 4. Wait for the cluster to converge after the failure.
  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: POST_KILL_CONVERGENCE_TIMEOUT_MS,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: SURVIVING_VOTER_COUNT,
  });

  assert.ok(
    convergence.settledAfterMs <= POST_KILL_CONVERGENCE_TIMEOUT_MS,
    'Cluster did not converge after node failure: ' +
    convergence.settledAfterMs + 'ms',
  );

  // 5. Wait for load to complete and check metrics.
  const metrics = await loadRun.waitComplete();

  assert.ok(
    metrics.total > ZERO_FAILURES,
    'Expected at least one operation to complete',
  );

  // 6. Assert consistency across surviving nodes.
  await cluster.waitForConsistencyConvergence({
    timeoutMs: CONSISTENCY_CONVERGENCE_TIMEOUT_MS,
    snapshotTimeoutMs: CONSISTENCY_SNAPSHOT_TIMEOUT_MS,
  });

  // 7. Verify the acknowledged-write ledger across all surviving nodes.
  const acked = loadRun.getAcknowledgedWrites();
  const survivingNodes = cluster.getNodes().filter((n) => n.id !== victimId);
  const acknowledgedWriteVisibility =
    await assertAcknowledgedWritesVisibleOnSurvivors(acked, survivingNodes);
  assert.ok(
    acknowledgedWriteVisibility.acknowledgedWriteCount > ZERO_FAILURES,
    'Expected at least one acknowledged write for ledger verification',
  );
  console.log(
    '[LEDGER-VERIFICATION] Checked ' +
    acknowledgedWriteVisibility.acknowledgedWriteCount +
    ' acknowledged writes on ' +
    acknowledgedWriteVisibility.survivingNodeCount +
    ' surviving nodes successfully.',
  );

  // 8. Assert post-rebalance closure contract holds
  const snapshot = await queryReachableClusterSnapshot(survivingNodes, {
    targetVoterCount: SURVIVING_VOTER_COUNT,
  });
  const publishedActiveNodeIds = normalizeNodeIdList(
    snapshot.publishedActiveNodeIds,
  );
  const projectedActiveNodeIds = normalizeNodeIdList(
    snapshot.projectedActiveNodeIds,
  );

  const latestControlPlaneDiagnostics = snapshot.controlPlaneDiagnostics || {};
  const staleInFlightReplicaOperationCount = Number.isFinite(
    latestControlPlaneDiagnostics?.replicaOperations?.staleInFlightCount,
  ) ?
    Math.max(
      ZERO_FAILURES,
      Math.floor(
        latestControlPlaneDiagnostics.replicaOperations.staleInFlightCount,
      ),
    ) :
    ZERO_FAILURES;
  const visibleSatisfiedPriorityRecoveryOperationCount =
    countVisibleSatisfiedPriorityRecoveryOperations(
      latestControlPlaneDiagnostics,
      snapshot.operationRows,
    );
  const staleDiscountCount = Math.max(
    staleInFlightReplicaOperationCount,
    visibleSatisfiedPriorityRecoveryOperationCount,
  );
  const ignoreStaleInFlightReplicaOperations =
    IGNORE_STALE_IN_FLIGHT_REPLICA_OPERATIONS;
  const effectiveInFlightReplicaOperationCount =
    ignoreStaleInFlightReplicaOperations ?
      Math.max(
        ZERO_FAILURES,
        snapshot.inFlightReplicaOperationCount - staleDiscountCount,
      ) :
      snapshot.inFlightReplicaOperationCount;

  const isSatisfied = isPostRebalanceCdcProjectionVisibleSatisfied({
    expectedPartitionIds: Array.from(snapshot.expectedPartitionIds),
    leaders: snapshot.leaders,
    voterCounts: snapshot.voterCounts,
    targetVoterCount: SURVIVING_VOTER_COUNT,
    inFlightReplicaOperationCount: snapshot.inFlightReplicaOperationCount,
    effectiveInFlightReplicaOperationCount,
    staleInFlightReplicaOperationCount,
    [POST_REBALANCE_VISIBLE_SATISFIED_OPTION]:
      visibleSatisfiedPriorityRecoveryOperationCount,
    ignoreStaleInFlightReplicaOperations,
    publishedActiveNodeIds,
    projectedActiveNodeIds,
    controlPlaneDiagnostics: latestControlPlaneDiagnostics,
  });

  assert.ok(
    isSatisfied,
    'Post-rebalance CDC projection visibility contract must be satisfied',
  );
  console.log('[CLOSURE-VERIFICATION] Post-rebalance closure proven successfully.');

  // 9. Assert owner diagnostics match the expected failure/recovery path (victim ejected, survivors active)
  assert.ok(
    !publishedActiveNodeIds.includes(victimId),
    `Killed node ${victimId} must not be in publishedActiveNodeIds`,
  );
  assert.ok(
    !projectedActiveNodeIds.includes(victimId),
    `Killed node ${victimId} must not be in projectedActiveNodeIds`,
  );
  for (const node of survivingNodes) {
    assert.ok(
      publishedActiveNodeIds.includes(node.id),
      `Surviving node ${node.id} must be in publishedActiveNodeIds`,
    );
    assert.ok(
      projectedActiveNodeIds.includes(node.id),
      `Surviving node ${node.id} must be in projectedActiveNodeIds`,
    );
  }
  const ownerDiagnostics = {
    victimNodeId: victimId,
    survivingNodeIds: survivingNodes.map((node) => node.id).sort(),
    publishedActiveNodeIds,
    projectedActiveNodeIds,
  };
  console.log(
    `[OWNER-DIAGNOSTICS] Victim node ${victimId} ejected ` +
    'and surviving nodes active in control plane.',
  );

  // 10. Classify and print client-visible error diagnostics
  const clientErrorClassification = buildClientErrorClassification(metrics);
  emitClientErrorClassification(clientErrorClassification);
  assert.equal(
    clientErrorClassification.unexpectedClientErrorCount,
    ZERO_FAILURES,
    'Node-failure rebalance must not hide non-admission client errors',
  );

  return {
    loadMetrics: metrics,
    convergenceTiming: convergence,
    killedNodeId: victimId,
    acknowledgedWriteVisibility,
    postRebalanceClosure: {
      satisfied: isSatisfied,
      effectiveInFlightReplicaOperationCount,
      staleInFlightReplicaOperationCount,
      visibleSatisfiedPriorityRecoveryOperationCount,
      ignoreStaleInFlightReplicaOperations,
    },
    ownerDiagnostics,
    clientErrorClassification,
  };
}

export {run};
