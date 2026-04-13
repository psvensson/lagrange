/**
 * Scenario: Rolling Restart
 *
 * Start cluster under load, restart nodes one at a time,
 * verify bounded disruption during restarts.
 *
 * Requirements: 4.4, 6.1
 */

import assert from 'node:assert/strict';
import {
  CONVERGENCE_DEFAULTS,
  SCENARIO_TIMING_DEFAULTS,
} from '../harness/constants.js';
import {resolveScenarioOptions} from '../harness/scenario-config.js';

const ACKNOWLEDGED_WRITE_ALIAS = 'ack_id';
const ACKNOWLEDGED_WRITE_BATCH_SIZE = 100;
const ZERO = 0;

function normalizeFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeNonEmptyString(value, fallback) {
  return typeof value === 'string' && value.length > ZERO ? value : fallback;
}

function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

async function getReachableNodes(nodes) {
  const reachable = [];
  for (const node of nodes) {
    if (typeof node?.isReachable === 'function') {
      const isReachable = await node.isReachable();
      if (!isReachable) {
        continue;
      }
    }
    reachable.push(node);
  }
  return reachable;
}

function buildAcknowledgedWriteVisibilityQuery(tableName, idColumn, ids) {
  return 'SELECT ' + idColumn + ' AS ' + ACKNOWLEDGED_WRITE_ALIAS +
    ' FROM ' + tableName + ' WHERE ' + idColumn + ' IN (' +
    ids.map((id) => '\'' + escapeSql(id) + '\'').join(', ') + ')';
}

async function assertAcknowledgedWritesVisibleOnReachableNodes(
  acknowledgedWrites,
  nodes,
) {
  const ids = Array.isArray(acknowledgedWrites?.ids) ?
    [...new Set(acknowledgedWrites.ids
      .filter((id) => typeof id === 'string' && id.length > ZERO))] :
    [];
  const reachableNodes = await getReachableNodes(nodes);
  if (ids.length === ZERO) {
    return {
      acknowledgedWriteCount: ZERO,
      reachableNodeCount: reachableNodes.length,
    };
  }

  assert.ok(
    reachableNodes.length > ZERO,
    'No reachable nodes available for acknowledged-write visibility check',
  );

  const tableName = normalizeNonEmptyString(
    acknowledgedWrites?.tableName,
    'logs',
  );
  const idColumn = normalizeNonEmptyString(
    acknowledgedWrites?.idColumn,
    'log_id',
  );

  for (const node of reachableNodes) {
    const missingIds = [];
    for (let index = ZERO; index < ids.length;
      index += ACKNOWLEDGED_WRITE_BATCH_SIZE) {
      const idBatch = ids.slice(index, index + ACKNOWLEDGED_WRITE_BATCH_SIZE);
      const query = buildAcknowledgedWriteVisibilityQuery(
        tableName,
        idColumn,
        idBatch,
      );
      const result = await node.query(query);
      const visibleIds = new Set(
        rowsFromResult(result)
          .map((row) => row?.[ACKNOWLEDGED_WRITE_ALIAS])
          .filter((id) => typeof id === 'string' && id.length > ZERO),
      );
      for (const id of idBatch) {
        if (!visibleIds.has(id)) {
          missingIds.push(id);
        }
      }
    }
    assert.equal(
      missingIds.length,
      ZERO,
      'Acknowledged writes missing after rolling restart on node ' +
      String(node?.id || 'unknown') + ': ' +
      JSON.stringify(missingIds.slice(ZERO, 10)) +
      (missingIds.length > 10 ?
        ' (+' + String(missingIds.length - 10) + ' more)' :
        ''),
    );
  }

  return {
    acknowledgedWriteCount: ids.length,
    reachableNodeCount: reachableNodes.length,
  };
}

function resolveRollingRestartScenarioConfig(options = {}) {
  return Object.freeze({
    loadOpsPerSec: normalizeFiniteNumber(options.loadOpsPerSec, 30),
    loadDuration: normalizeNonEmptyString(options.loadDuration, '300s'),
    queryTimeoutMs: normalizeFiniteNumber(options.queryTimeoutMs, 10000),
    preRestartSettleMs: normalizeFiniteNumber(
      options.preRestartSettleMs,
      SCENARIO_TIMING_DEFAULTS.stabilizationDelayMs,
    ),
    perRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.perRestartActiveTimeoutMs, 120000),
    perNodeConvergenceTimeoutMs:
      normalizeFiniteNumber(options.perNodeConvergenceTimeoutMs, 300000),
    interRestartDelayMs: normalizeFiniteNumber(
      options.interRestartDelayMs,
      SCENARIO_TIMING_DEFAULTS.interActionDelayMs,
    ),
    minRestartSuccessRate:
      normalizeFiniteNumber(options.minRestartSuccessRate, 0.63),
    postRestartLoadSoakMs:
      normalizeFiniteNumber(
        options.postRestartLoadSoakMs,
        SCENARIO_TIMING_DEFAULTS.shortSoakMs,
      ),
    postRestartQuietWindowMs:
      normalizeFiniteNumber(
        options.postRestartQuietWindowMs,
        CONVERGENCE_DEFAULTS.quietWindowMs,
      ),
    postRestartActiveTimeoutMs:
      normalizeFiniteNumber(options.postRestartActiveTimeoutMs, 240000),
  });
}

function buildConvergenceOptions(perNodeConvergenceTimeoutMs) {
  return {
    settleTimeoutMs: perNodeConvergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    maxSustainedOverTargetMs: Math.max(
      CONVERGENCE_DEFAULTS.maxSustainedOverTargetMs,
      perNodeConvergenceTimeoutMs,
    ),
    ignoreStaleInFlightReplicaOperations: true,
  };
}

/**
 * Run the rolling-restart scenario.
 *
 * @param {Object} cluster - Cluster handle from the harness.
 * @param {Object} [options]
 */
async function run(cluster, options = {}) {
  const scenarioOptions = resolveScenarioOptions(
    options,
    cluster,
    'rollingRestart',
  );
  const {
    loadOpsPerSec,
    loadDuration,
    queryTimeoutMs,
    preRestartSettleMs,
    perRestartActiveTimeoutMs,
    perNodeConvergenceTimeoutMs,
    interRestartDelayMs,
    minRestartSuccessRate,
    postRestartLoadSoakMs,
    postRestartQuietWindowMs,
    postRestartActiveTimeoutMs,
  } = resolveRollingRestartScenarioConfig(scenarioOptions);
  // 1. Start sustained write load.
  const initialNodes = cluster.getNodes();
  const loadNodesById = new Map(
    initialNodes.map((node) => [String(node.id), node]),
  );
  const availableLoadNodeIds = new Set(
    initialNodes.map((node) => String(node.id)),
  );
  const resolveLoadNodes = () =>
    Array.from(availableLoadNodeIds)
      .map((nodeId) => loadNodesById.get(nodeId))
      .filter((node) => node && typeof node.query === 'function');

  const loadRun = cluster.startLoad({
    nodes: resolveLoadNodes(),
    nodeResolver: resolveLoadNodes,
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    queryTimeoutMs,
    trackAcknowledgedWrites: true,
  });

  // 2. Let load stabilize before starting restarts.
  await new Promise((r) => setTimeout(r, preRestartSettleMs));

  // 3. Capture load progress before rolling restart.
  const preRestartMetrics = loadRun.getMetrics();
  const preRestartTotal = Number(preRestartMetrics?.total || ZERO);
  const preRestartSuccess = Number(preRestartMetrics?.success || ZERO);

  // 4. Restart each non-seed node one at a time.
  const nodes = cluster.getNodes();
  const nonSeedNodes = nodes.filter((n) => n.role !== 'seed');

  for (const node of nonSeedNodes) {
    availableLoadNodeIds.delete(String(node.id));
    await cluster.restartNode(node.id, {
      readinessTimeoutMs: perRestartActiveTimeoutMs,
    });
    availableLoadNodeIds.add(String(node.id));

    // Brief pause between restarts.
    await new Promise(
      (r) => setTimeout(r, interRestartDelayMs),
    );
  }

  // 5. Keep load running through the full rolling-restart sequence,
  // then stop it explicitly so the measured window always covers both restarts.
  await new Promise((r) => setTimeout(r, postRestartLoadSoakMs));
  if (typeof loadRun.cancel === 'function') {
    loadRun.cancel();
  }
  const metrics = await loadRun.waitComplete();
  const acknowledgedWrites = typeof loadRun.getAcknowledgedWrites === 'function' ?
    loadRun.getAcknowledgedWrites() :
    null;

  await cluster.waitForConvergence(
    buildConvergenceOptions(perNodeConvergenceTimeoutMs),
  );

  // 6. Compute bounded disruption during rolling restarts.
  const restartWindowTotal = Math.max(
    ZERO,
    Number(metrics?.total || ZERO) - preRestartTotal,
  );
  const restartWindowSuccess = Math.max(
    ZERO,
    Number(metrics?.success || ZERO) - preRestartSuccess,
  );
  const restartSuccessRate = restartWindowTotal > ZERO ?
    restartWindowSuccess / restartWindowTotal :
    1;

  // 7. Ensure all nodes become active again before final consistency checks.
  if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive({
      mode: 'load',
      timeoutMs: postRestartActiveTimeoutMs,
    });
  }

  // 8. Post-restart quiet window — no load, let memory settle so the
  //    playback recorder captures recovery samples for transient-pressure
  //    vs sustained-leak classification.
  await new Promise(
    (r) => setTimeout(r, postRestartQuietWindowMs),
  );

  // 9. Assert final cluster consistency.
  await cluster.waitForConsistencyConvergence();

  let acknowledgedWriteVisibility = null;
  const failureMessages = [];
  try {
    acknowledgedWriteVisibility =
      await assertAcknowledgedWritesVisibleOnReachableNodes(
        acknowledgedWrites,
        cluster.getNodes(),
      );
  } catch (error) {
    failureMessages.push(error?.message || String(error));
  }
  if (restartSuccessRate < minRestartSuccessRate) {
    failureMessages.unshift(
      'Success rate during rolling restart below threshold: ' +
      restartSuccessRate.toFixed(3) +
      ' (expected >= ' + minRestartSuccessRate + ')',
    );
  }

  assert.ok(
    failureMessages.length === ZERO,
    failureMessages.join('\n'),
  );

  return {
    loadMetrics: metrics,
    restartSuccessRate,
    restartedNodes: nonSeedNodes.map((n) => n.id),
    acknowledgedWriteVisibility,
  };
}

export {run};
