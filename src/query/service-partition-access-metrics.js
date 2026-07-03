/**
 * Service↔partition access attribution accumulator (service↔data
 * affinity placement epic).
 *
 * Node-local in-memory counters keyed (serviceId → partitionId →
 * {r, w}), recorded by the SQL engine's statement seams for queries
 * issued by deployed runtime services (queries without an issuing
 * service are never recorded). A publisher periodically drains the
 * accumulator with `snapshotAndReset()` and publishes the deltas as
 * CDC-propagated `service_partition_access` rows; `merge()` restores a
 * drained snapshot when a publish attempt fails so counts are not lost.
 *
 * Modeled on the CDCPipelineMetrics counter-object pattern
 * (src/cdc/cdc-pipeline-metrics.js) that the managed split metrics
 * provider samples.
 */

import {SERVICE_PARTITION_ACCESS_KIND} from '../constants/index.js';

class ServicePartitionAccessMetrics {
  constructor() {
    this.countsByService = new Map();
  }

  /**
   * Record one access of `kind` by `serviceId` against each partition
   * in `partitionIds`. Unknown kinds and empty inputs are ignored.
   * @param {string} serviceId - Issuing service id.
   * @param {Array<string>} partitionIds - Accessed partition ids.
   * @param {string} kind - SERVICE_PARTITION_ACCESS_KIND value.
   */
  record(serviceId, partitionIds, kind) {
    if (
      !serviceId ||
      !Array.isArray(partitionIds) ||
      (kind !== SERVICE_PARTITION_ACCESS_KIND.READ &&
        kind !== SERVICE_PARTITION_ACCESS_KIND.WRITE)
    ) {
      return;
    }
    for (const partitionId of partitionIds) {
      if (!partitionId) {
        continue;
      }
      this.addCount(serviceId, partitionId, kind, 1);
    }
  }

  /**
   * @param {string} serviceId
   * @param {string} partitionId
   * @param {string} kind
   * @param {number} count
   * @private
   */
  addCount(serviceId, partitionId, kind, count) {
    let partitions = this.countsByService.get(serviceId);
    if (!partitions) {
      partitions = new Map();
      this.countsByService.set(serviceId, partitions);
    }
    let counts = partitions.get(partitionId);
    if (!counts) {
      counts = {
        [SERVICE_PARTITION_ACCESS_KIND.READ]: 0,
        [SERVICE_PARTITION_ACCESS_KIND.WRITE]: 0,
      };
      partitions.set(partitionId, counts);
    }
    counts[kind] += count;
  }

  /**
   * @return {boolean} True when any counts are pending.
   */
  hasData() {
    return this.countsByService.size > 0;
  }

  /**
   * Drain the accumulator: return all pending counts as a plain object
   * `{serviceId: {partitionId: {r, w}}}` and reset to empty (delta
   * semantics for the publisher).
   * @return {Object} Drained counts.
   */
  snapshotAndReset() {
    const snapshot = {};
    for (const [serviceId, partitions] of this.countsByService) {
      const partitionCounts = {};
      for (const [partitionId, counts] of partitions) {
        partitionCounts[partitionId] = {...counts};
      }
      snapshot[serviceId] = partitionCounts;
    }
    this.countsByService = new Map();
    return snapshot;
  }

  /**
   * Merge a previously drained snapshot back into the accumulator
   * (publish-failure restore path — counts survive to the next flush).
   * @param {Object} snapshot - Value returned by snapshotAndReset().
   */
  merge(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    for (const [serviceId, partitionCounts] of Object.entries(snapshot)) {
      if (!partitionCounts || typeof partitionCounts !== 'object') {
        continue;
      }
      for (const [partitionId, counts] of Object.entries(partitionCounts)) {
        for (const kind of Object.values(SERVICE_PARTITION_ACCESS_KIND)) {
          const count = counts?.[kind];
          if (Number.isFinite(count) && count > 0) {
            this.addCount(serviceId, partitionId, kind, count);
          }
        }
      }
    }
  }
}

export {ServicePartitionAccessMetrics};
