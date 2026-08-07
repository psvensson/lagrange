/**
 * RebalanceCoordinator entity-size resolution.
 *
 * The coordinator resolves the real size_bytes for one entity ONCE
 * before operation creation and threads the resolved size into both
 * admission evaluation and reservation creation so the durable
 * reservation is the single admission witness (audit findings 2+16).
 * Extracted from rebalance-coordinator-operation-creation.js to keep
 * that module under the source file-size threshold.
 *
 * @module rebalancer/rebalance-coordinator-entity-size-methods
 */

import {resolveEntitySizeBytes} from './entity-size-resolution.js';

const CONSTRUCTOR_METHOD_NAME = 'constructor';

class RebalanceCoordinatorEntitySizeMethods {
  /**
   * Resolve the real size_bytes for one entity from the system table
   * cache (partitions row; 0 for non-partition entity types, missing
   * cache, or a leader row whose size has not been persisted yet).
   * @param {Object} options
   * @param {string} options.entityType
   * @param {string} options.entityId
   * @return {number}
   * @private
   */
  resolveEntitySizeBytes(options = {}) {
    return resolveEntitySizeBytes({
      entityType: options.entityType,
      entityId: options.entityId,
      systemTableCache: this.systemTableCache,
    });
  }

  /**
   * Estimate the reserved bytes for one entity: resolve the real
   * size_bytes from the system table cache (unless the caller already
   * threaded a resolved size through `resolvedEntitySizeBytes`) and feed
   * it to the storage accounting estimate. Isolated here so the cache
   * read (sizing truth) and the reservation SQL write (durable witness)
   * never share one decision branch — the reservation lifecycle calls
   * this once and makes only the SQL write decision (one path per
   * semantic decision).
   * @param {Object} options
   * @param {string} options.entityType
   * @param {string} options.entityId
   * @param {*} [options.resolvedEntitySizeBytes] - Already-resolved size.
   * @return {number}
   * @private
   */
  estimateEntityAdmissionBytes(options = {}) {
    const resolved = Number(options.resolvedEntitySizeBytes);
    const sizeBytes = Number.isFinite(resolved) ?
      resolved :
      this.resolveEntitySizeBytes({
        entityType: options.entityType,
        entityId: options.entityId,
      });
    return this.storageAccountingService.estimateReplicaBytes({
      entityType: options.entityType,
      sizeBytes,
    });
  }
}

function applyRebalanceCoordinatorEntitySizeMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorEntitySizeMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CONSTRUCTOR_METHOD_NAME) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorEntitySizeMethods};
