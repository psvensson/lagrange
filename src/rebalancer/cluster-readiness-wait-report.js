/**
 * The rebalancer's cluster-readiness gate is a bounded wait: when its bound
 * is spent, planning proceeds degraded and the spent wait is reported.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const CLUSTER_READINESS_WAIT = Object.freeze({
  wait: 'CLUSTER_READINESS_TIMEOUT_MS',
  awaited: 'cluster readiness evidence before the first rebalance plan',
});

/**
 * The cluster-readiness gate spent its bound and planning proceeds degraded:
 * one wait_bound_spent ERROR naming the conditions still unmet.
 * @param {Object} rebalancer
 * @param {number} elapsedMs
 * @param {Object} result - The last readiness evaluation.
 * @return {void}
 */
function reportClusterReadinessSpent(rebalancer, elapsedMs, result) {
  reportWaitBoundSpent(rebalancer.logger, {
    ...CLUSTER_READINESS_WAIT,
    boundMs: rebalancer.clusterReadinessTimeoutMs,
    elapsedMs,
    lastObserved: {unmetConditions: result.unmetConditions},
    scope: {
      nodeId: rebalancer.nodeId || null,
      entityId: rebalancer.entityId || null,
    },
  });
}

export {reportClusterReadinessSpent};
