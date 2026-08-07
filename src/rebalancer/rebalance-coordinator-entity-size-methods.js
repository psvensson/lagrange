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
}

function applyRebalanceCoordinatorEntitySizeMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorEntitySizeMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
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
