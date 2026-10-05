/**
 * The merge source waits a bounded time for the durable merge cutover to
 * become visible; a spent wait is reported here.
 */

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {PARTITION_SERVICE_DEFAULT} from './partition-service-constants.js';

const MERGE_CUTOVER_WAIT = Object.freeze({
  wait: 'PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_TIMEOUT_MS',
  awaited: 'durable merge cutover visible in the local system-table cache',
});

/**
 * Report a spent merge-cutover visibility wait.
 * @param {Object} service - Partition service (merge source).
 * @param {Object} metadata - Merge metadata.
 * @param {Object} spent - {startedAtMs, polls}.
 * @private
 */
function reportMergeCutoverWaitSpent(service, metadata, spent) {
  reportWaitBoundSpent(service.logger, {
    ...MERGE_CUTOVER_WAIT,
    boundMs: PARTITION_SERVICE_DEFAULT.MERGE_CUTOVER_WAIT_TIMEOUT_MS,
    elapsedMs: Date.now() - spent.startedAtMs,
    lastObserved: {
      cutoverActive: false,
      transitionAborted: false,
      polls: spent.polls,
      targetPartitionVersion: metadata?.targetPartitionVersion ?? null,
      role: service.role ?? null,
    },
    scope: {
      partitionId: service.partitionId,
      targetPartitionIds: metadata?.targetPartitionIds ?? null,
    },
  });
}

export {reportMergeCutoverWaitSpent};
