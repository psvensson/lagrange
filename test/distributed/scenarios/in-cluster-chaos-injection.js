/**
 * Scenario: In-Cluster Chaos Injection
 *
 * Executes a deterministic sequence of bounded chaos actions with explicit
 * recovery windows between each fault phase.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';

const ZERO = 0;
const DEFAULT_ACTION_COUNT = 3;
const DEFAULT_CONSISTENCY_TIMEOUT_MS = 60000;
const DEFAULT_CONSISTENCY_POLL_INTERVAL_MS = 500;
const CHAOS_ACTION = Object.freeze({
  KILL_RESTART: 'kill_restart',
  PAUSE_UNPAUSE: 'pause_unpause',
  PARTITION_HEAL: 'partition_heal',
  SLOW_CLEAR: 'slow_clear',
});
const CHAOS_ACTION_DEFAULT_SET = Object.freeze([
  CHAOS_ACTION.KILL_RESTART,
  CHAOS_ACTION.PAUSE_UNPAUSE,
  CHAOS_ACTION.PARTITION_HEAL,
  CHAOS_ACTION.SLOW_CLEAR,
]);
const CHAOS_ACTION_MIN_COUNT = 1;

/**
 * Sleep helper.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Create one deterministic RNG from a numeric seed.
 * @param {number} seed
 * @return {Function}
 */
function createSeededRng(seed) {
  let state = Number.isFinite(seed) ?
    (Math.floor(seed) >>> 0) :
    1;
  if (state === ZERO) {
    state = 1;
  }
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Resolve non-seed node IDs from the cluster inventory.
 * @param {Array<Object>} nodes
 * @return {Array<string>}
 */
function resolveNonSeedNodeIds(nodes) {
  const ids = [];
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || node.id.length === ZERO) {
      continue;
    }
    if (node.role === 'seed') {
      continue;
    }
    ids.push(node.id);
  }
  return ids;
}

/**
 * Select one deterministic value from a list.
 * @param {Array<*>} values
 * @param {Function} rng
 * @return {*}
 */
function selectDeterministic(values, rng) {
  const index = Math.floor(rng() * values.length);
  return values[Math.min(index, values.length - 1)];
}

/**
 * Resolve deterministic chaos scenario configuration.
 * @param {Object} [options={}]
 * @return {Object}
 */
function resolveInClusterChaosInjectionScenarioConfig(options = {}) {
  const actionSet =
    Array.isArray(options.actionSet) &&
      options.actionSet.length > ZERO ?
      options.actionSet :
      CHAOS_ACTION_DEFAULT_SET;
  const actionCount =
    Number.isFinite(options.actionCount) ?
      Math.max(CHAOS_ACTION_MIN_COUNT, Math.floor(options.actionCount)) :
      DEFAULT_ACTION_COUNT;
  return Object.freeze({
    seed: Number.isFinite(options.seed) ? Number(options.seed) : 1337,
    loadOpsPerSec: Number.isFinite(options.loadOpsPerSec) ?
      Number(options.loadOpsPerSec) :
      50,
    loadDuration: typeof options.loadDuration === 'string' &&
      options.loadDuration.length > ZERO ?
      options.loadDuration :
      '60s',
    preChaosDelayMs: Number.isFinite(options.preChaosDelayMs) ?
      Number(options.preChaosDelayMs) :
      2000,
    faultHoldMs: Number.isFinite(options.faultHoldMs) ?
      Number(options.faultHoldMs) :
      1500,
    recoveryHoldMs: Number.isFinite(options.recoveryHoldMs) ?
      Number(options.recoveryHoldMs) :
      1000,
    convergenceTimeoutMs: Number.isFinite(options.convergenceTimeoutMs) ?
      Number(options.convergenceTimeoutMs) :
      180000,
    minSuccessRate: Number.isFinite(options.minSuccessRate) ?
      Number(options.minSuccessRate) :
      0.7,
    slowdownLatencyMs: Number.isFinite(options.slowdownLatencyMs) ?
      Number(options.slowdownLatencyMs) :
      150,
    slowdownJitterMs: Number.isFinite(options.slowdownJitterMs) ?
      Number(options.slowdownJitterMs) :
      25,
    actionSet: actionSet.filter((action) =>
      CHAOS_ACTION_DEFAULT_SET.includes(action)),
    actionCount,
    consistencyTimeoutMs: Number.isFinite(options.consistencyTimeoutMs) ?
      Number(options.consistencyTimeoutMs) :
      DEFAULT_CONSISTENCY_TIMEOUT_MS,
    consistencyPollIntervalMs:
      Number.isFinite(options.consistencyPollIntervalMs) ?
        Number(options.consistencyPollIntervalMs) :
        DEFAULT_CONSISTENCY_POLL_INTERVAL_MS,
  });
}

/**
 * Split cluster node IDs into two non-empty groups.
 * @param {Array<string>} nodeIds
 * @return {{groupA: Array<string>, groupB: Array<string>}}
 */
function splitNodeGroups(nodeIds) {
  const midpoint = Math.ceil(nodeIds.length / 2);
  const groupA = nodeIds.slice(0, midpoint);
  const groupB = nodeIds.slice(midpoint);
  return {groupA, groupB};
}

/**
 * Inject one chaos action.
 * @param {string} action
 * @param {Object} cluster
 * @param {Object} context
 * @return {Promise<Object>}
 */
async function injectChaosAction(action, cluster, context) {
  const {rng, nonSeedNodeIds, allNodeIds, slowdownLatencyMs, slowdownJitterMs} =
    context;
  if (action === CHAOS_ACTION.KILL_RESTART) {
    const nodeId = selectDeterministic(nonSeedNodeIds, rng);
    await cluster.killNode(nodeId);
    return {action, nodeId};
  }
  if (action === CHAOS_ACTION.PAUSE_UNPAUSE) {
    const nodeId = selectDeterministic(nonSeedNodeIds, rng);
    await cluster.pauseNode(nodeId);
    return {action, nodeId};
  }
  if (action === CHAOS_ACTION.PARTITION_HEAL) {
    const {groupA, groupB} = splitNodeGroups(allNodeIds);
    await cluster.partitionNetwork(groupA, groupB);
    return {action, groupA, groupB};
  }
  const nodeId = selectDeterministic(nonSeedNodeIds, rng);
  await cluster.slowNetwork(nodeId, {
    latency: slowdownLatencyMs,
    jitter: slowdownJitterMs,
  });
  return {action: CHAOS_ACTION.SLOW_CLEAR, nodeId};
}

/**
 * Recover one chaos action.
 * @param {string} action
 * @param {Object} cluster
 * @param {Object} state
 * @return {Promise<void>}
 */
async function recoverChaosAction(action, cluster, state) {
  if (action === CHAOS_ACTION.KILL_RESTART) {
    await cluster.restartNode(state.nodeId);
    return;
  }
  if (action === CHAOS_ACTION.PAUSE_UNPAUSE) {
    await cluster.unpauseNode(state.nodeId);
    return;
  }
  if (action === CHAOS_ACTION.PARTITION_HEAL) {
    await cluster.healPartition();
    return;
  }
  await cluster.clearNetworkSlowdown(state.nodeId);
}

/**
 * Run the in-cluster-chaos-injection scenario.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const config = resolveInClusterChaosInjectionScenarioConfig(options);
  const rng = createSeededRng(config.seed);
  const nodes = cluster.getNodes();
  const allNodeIds = nodes
    .map((node) => node?.id)
    .filter((id) => typeof id === 'string' && id.length > ZERO);
  const nonSeedNodeIds = resolveNonSeedNodeIds(nodes);
  assert.ok(
    nonSeedNodeIds.length > ZERO,
    'Scenario requires at least one non-seed node',
  );
  assert.ok(allNodeIds.length >= 3, 'Scenario requires at least three nodes');
  assert.ok(
    config.actionSet.length > ZERO,
    'Scenario requires at least one valid chaos action',
  );

  const loadRun = cluster.startLoad({
    opsPerSec: config.loadOpsPerSec,
    duration: config.loadDuration,
  });

  await sleep(config.preChaosDelayMs);

  const actionTimeline = [];
  for (let index = ZERO; index < config.actionCount; index++) {
    const action = selectDeterministic(config.actionSet, rng);
    const state = await injectChaosAction(action, cluster, {
      rng,
      nonSeedNodeIds,
      allNodeIds,
      slowdownLatencyMs: config.slowdownLatencyMs,
      slowdownJitterMs: config.slowdownJitterMs,
    });
    actionTimeline.push({
      step: index + 1,
      phase: 'inject',
      action,
      state,
    });
    await sleep(config.faultHoldMs);

    await recoverChaosAction(action, cluster, state);
    actionTimeline.push({
      step: index + 1,
      phase: 'recover',
      action,
      state,
    });

    await sleep(config.recoveryHoldMs);

    const convergence = await cluster.waitForConvergence({
      settleTimeoutMs: config.convergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });
    assert.ok(
      convergence.settledAfterMs <= config.convergenceTimeoutMs,
      'Cluster did not converge after chaos recovery step ' +
      `${index + 1}: ${convergence.settledAfterMs}ms`,
    );
    await cluster.waitForConsistencyConvergence({
      timeoutMs: config.consistencyTimeoutMs,
      pollIntervalMs: config.consistencyPollIntervalMs,
      forceRepairAfterMs: 0,
    });
    actionTimeline.push({
      step: index + 1,
      phase: 'verify',
      action,
      convergence,
    });
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= config.minSuccessRate,
    'Success rate below threshold after chaos sequence: ' +
    successRate.toFixed(3) + ' (expected >= ' + config.minSuccessRate + ')',
  );

  return {
    seed: config.seed,
    actionCount: config.actionCount,
    actionTimeline,
    loadMetrics: metrics,
    successRate,
  };
}

export {
  CHAOS_ACTION,
  resolveInClusterChaosInjectionScenarioConfig,
  run,
};
