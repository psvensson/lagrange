import {LogsTableService} from '../logging/logs-table-service.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_UNDEFINED = 'undefined';

/**
 * OwnerQueue manages checking and draining the control-plane logs table write queue.
 */
class OwnerQueue {
  /**
   * Get the number of pending writes in the logs table service.
   * @return {number}
   */
  static getPendingWritesCount() {
    const service = LogsTableService.instance;
    if (service && typeof service.getStats === LOCAL_STR_FUNCTION) {
      const stats = service.getStats();
      if (stats && typeof stats.pendingWrites === LOCAL_STR_NUMBER) {
        return stats.pendingWrites;
      }
    }
    return 0;
  }

  /**
   * Check whether logs table writes are currently deferred.
   * @return {boolean}
   */
  static isDeferred() {
    const service = LogsTableService.instance;
    if (service && typeof service.isWriteDeferred === LOCAL_STR_FUNCTION) {
      return service.isWriteDeferred();
    }
    return false;
  }

  /**
   * Drain the logs table write queue by clearing any defer window and triggering a flush.
   * @return {Promise<number>} The number of written entries.
   */
  static async drain() {
    const service = LogsTableService.instance;
    if (!service) {
      return 0;
    }

    // Reset defer state to allow immediate flush under load
    if (typeof service.writeDeferredUntilMs !== LOCAL_STR_UNDEFINED) {
      service.writeDeferredUntilMs = 0;
    }
    if (typeof service.consecutiveDeferredWriteFailures !== LOCAL_STR_UNDEFINED) {
      service.consecutiveDeferredWriteFailures = 0;
    }

    if (typeof service.flush === LOCAL_STR_FUNCTION) {
      // Force flush without scheduling through work class to bypass background defer mechanisms
      return await service.flush({
        scheduleThroughWorkClass: false,
        yieldPending: false,
      });
    }

    return 0;
  }
}

export {OwnerQueue};
