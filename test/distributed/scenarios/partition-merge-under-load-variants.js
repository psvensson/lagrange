/**
 * Failure-variant machinery for the partition-merge-under-load scenario:
 * the per-variant plan table (which lifecycle event triggers a fault,
 * which node class is killed, what terminal is required), kill-target
 * resolution, and the fault-injection loop. Topology query helpers are
 * injected through the context so this module stays cycle-free with the
 * scenario module.
 */

import {
  PARTITION_MERGE_SCENARIO_VARIANT,
} from '../harness/scenario-config.js';
import {queryTableDistribution, sleep} from './table-distribution-helpers.js';

const ZERO = 0;
const ONE = 1;
const TWO = 2;

const VARIANT_KILL_TARGET = Object.freeze({
  SOURCE_LEADER: 'source-leader',
  SOURCE_FOLLOWER: 'source-follower',
});

const VARIANT_PLAN = Object.freeze({
  [PARTITION_MERGE_SCENARIO_VARIANT.HAPPY_PATH]: Object.freeze({
    kill: null,
    requireRetryCompletion: false,
  }),
  [PARTITION_MERGE_SCENARIO_VARIANT.SOURCE_LEADER_KILL_BACKFILL]:
    Object.freeze({
      kill: Object.freeze({
        triggerKeys: Object.freeze(['MERGE_PREPARED']),
        target: VARIANT_KILL_TARGET.SOURCE_LEADER,
      }),
      requireRetryCompletion: false,
    }),
  [PARTITION_MERGE_SCENARIO_VARIANT.SOURCE_LEADER_KILL_CUTOVER]:
    Object.freeze({
      kill: Object.freeze({
        triggerKeys: Object.freeze([
          'CUTOVER_AWAITING_SOURCES',
          'CUTOVER_APPLIED',
        ]),
        target: VARIANT_KILL_TARGET.SOURCE_LEADER,
      }),
      requireRetryCompletion: false,
    }),
  [PARTITION_MERGE_SCENARIO_VARIANT.REPLACE_CHURN]: Object.freeze({
    kill: Object.freeze({
      triggerKeys: Object.freeze(['MERGE_START']),
      target: VARIANT_KILL_TARGET.SOURCE_FOLLOWER,
    }),
    requireRetryCompletion: false,
  }),
  [PARTITION_MERGE_SCENARIO_VARIANT.ABORT_RETRY]: Object.freeze({
    kill: Object.freeze({
      triggerKeys: Object.freeze(['MERGE_PREPARED']),
      target: VARIANT_KILL_TARGET.SOURCE_LEADER,
    }),
    requireRetryCompletion: true,
  }),
});

/**
 * Build a source-partition-id -> leader-node-id map from partition rows.
 * @param {Array<Object>} rangeRows
 * @return {Map<string, string|null>}
 */
function buildLeaderBySourceMap(rangeRows) {
  return new Map(
    rangeRows.map((row) => [
      String(row.partition_id),
      typeof row.leader_node_id === 'string' &&
        row.leader_node_id.length > ZERO ?
        row.leader_node_id :
        null,
    ]),
  );
}

/**
 * Pick the first non-seed leader of a merging source partition.
 * @param {Array<string>} sourceIds
 * @param {Map<string, string|null>} leaderBySource
 * @param {string} seedId
 * @return {string|null}
 */
function pickSourceLeaderKillTarget(sourceIds, leaderBySource, seedId) {
  for (const sourceId of sourceIds) {
    const leaderNodeId = leaderBySource.get(sourceId);
    if (leaderNodeId && leaderNodeId !== seedId) {
      return leaderNodeId;
    }
  }
  return null;
}

/**
 * Pick a non-seed, non-leader replica holder of a merging source
 * partition.
 * @param {Array<string>} sourceIds
 * @param {Map<string, string|null>} leaderBySource
 * @param {string} seedId
 * @param {Object} distribution
 * @return {string|null}
 */
function pickSourceFollowerKillTarget(
  sourceIds,
  leaderBySource,
  seedId,
  distribution,
) {
  for (const sourceId of sourceIds) {
    const replicaNodeIds =
      distribution.replicasByPartition?.get?.(sourceId) || new Set();
    const leaderNodeId = leaderBySource.get(sourceId);
    for (const nodeId of replicaNodeIds) {
      if (nodeId !== leaderNodeId && nodeId !== seedId) {
        return nodeId;
      }
    }
  }
  return null;
}

/**
 * Resolve the node to kill for one variant fault. The context must
 * provide the scenario's queryTableTransitionObservation and
 * queryPartitionRangeRows helpers.
 * @param {Object} context
 * @return {Promise<string|null>}
 */
async function resolveVariantKillTargetNodeId(context) {
  const {seedNode, tableId, tableName, queryNodes, killTarget} = context;
  const observation = await context.queryTableTransitionObservation(
    seedNode,
    tableId,
    queryNodes,
  );
  const sourceIds = observation.sourcePartitionIds;
  if (sourceIds.length === ZERO) {
    return null;
  }
  const rangeRows = await context.queryPartitionRangeRows(
    seedNode,
    tableId,
    queryNodes,
  );
  const leaderBySource = buildLeaderBySourceMap(rangeRows);
  const seedId = String(seedNode?.id || '');
  if (killTarget === VARIANT_KILL_TARGET.SOURCE_LEADER) {
    return pickSourceLeaderKillTarget(sourceIds, leaderBySource, seedId);
  }
  const distribution = await queryTableDistribution(seedNode, {
    tableName,
    queryNodes,
  });
  return pickSourceFollowerKillTarget(
    sourceIds,
    leaderBySource,
    seedId,
    distribution,
  );
}

/**
 * Arm the variant fault: wait for the trigger lifecycle event, kill the
 * resolved target node, and restart it after the configured delay. The
 * context must provide collectMergeLifecycleEvents.
 * @param {Object} context
 * @return {Promise<Object>} fault record
 */
async function runVariantFaultInjection(context) {
  const {
    cluster,
    nodes,
    config,
    plan,
    sinceEpochSeconds,
  } = context;
  const record = {
    variant: config.variant,
    triggered: false,
    triggerKey: null,
    killedNodeId: null,
    killedAtMs: null,
    restartedAtMs: null,
    restartError: null,
  };
  const deadlineMs = Date.now() + config.variantKillTriggerTimeoutMs;
  while (Date.now() < deadlineMs) {
    const events = await context.collectMergeLifecycleEvents(
      nodes,
      sinceEpochSeconds,
    );
    const triggerEvent = events.find(
      (event) => plan.kill.triggerKeys.includes(event.key),
    );
    if (triggerEvent) {
      record.triggered = true;
      record.triggerKey = triggerEvent.key;
      break;
    }
    await sleep(config.mergeLogScanPollIntervalMs);
  }
  if (!record.triggered) {
    return record;
  }
  const targetNodeId = await resolveVariantKillTargetNodeId({
    ...context,
    killTarget: plan.kill.target,
  });
  if (!targetNodeId) {
    return record;
  }
  record.killedNodeId = targetNodeId;
  record.killedAtMs = Date.now();
  await cluster.killNode(targetNodeId);
  await sleep(config.variantRestartDelayMs);
  try {
    await cluster.restartNode(targetNodeId, {
      readinessTimeoutMs: config.convergenceTimeoutMs,
    });
    record.restartedAtMs = Date.now();
  } catch (error) {
    record.restartError = String(error?.message || error);
  }
  return record;
}

/**
 * Build the lifecycle predicate for the configured variant.
 * @param {Object} config
 * @param {Object} plan
 * @return {{predicate: Function, timeoutMs: number,
 *   description: string}}
 */
function buildLifecycleCompletionPlan(config, plan) {
  if (!plan.kill) {
    return {
      predicate: ({summary}) =>
        summary.completedMergeCount >= config.requiredCompletedMerges,
      timeoutMs: config.mergeCompletionTimeoutMs,
      description: config.requiredCompletedMerges +
        ' completed managed merges (terminal transition cleared)',
    };
  }
  if (plan.requireRetryCompletion) {
    return {
      predicate: ({summary}) => summary.completedMergeCount >= ONE,
      timeoutMs: config.variantKillTriggerTimeoutMs +
        TWO * config.cutoverWaitBoundMs,
      description: 'a completed managed merge after abort-and-retry',
    };
  }
  return {
    predicate: ({summary, transitionState}) =>
      summary.completedMergeCount >= ONE ||
      (summary.abortedMergeCount >= ONE && transitionState === null),
    timeoutMs: config.variantKillTriggerTimeoutMs +
      TWO * config.cutoverWaitBoundMs,
    description: 'a data-safe merge terminal (completion, or abort ' +
      'with sources authoritative and transition state cleared)',
  };
}

export {
  VARIANT_KILL_TARGET,
  VARIANT_PLAN,
  buildLeaderBySourceMap,
  buildLifecycleCompletionPlan,
  pickSourceFollowerKillTarget,
  pickSourceLeaderKillTarget,
  resolveVariantKillTargetNodeId,
  runVariantFaultInjection,
};
