import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorWriteRetryRouting} from './query-executor-write-retry-routing.js';
import {
  installQueryExecutorPartitionRoutingCandidateMethods,
} from './query-executor-partition-routing-candidates.js';
import {
  installQueryExecutorPartitionRoutingSnapshotMethods,
} from './query-executor-partition-routing-snapshot.js';
import {
  installQueryExecutorTemporaryUnroutableAddressMethods,
} from './query-executor-temporary-unroutable-addresses.js';

const {
  QUERY_EXECUTOR_LITERAL,
} = QUERY_EXECUTOR_SHARED;

const QUERY_EXECUTOR_SHUTDOWN_ABORT_MESSAGE =
  'Query execution aborted: SQL query engine is shutting down';

class QueryExecutorCancellationRouting extends QueryExecutorWriteRetryRouting {
  async delay(delayMs) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      if (this.unrefRetryDelayTimers === true) {
        timer.unref?.();
      }
    });
  }

  /**
   * Signal that the owning SQL query engine is shutting down. The retry-budget
   * loop calls throwIfCancelled() after every backoff delay, so once this is set
   * an in-flight retry aborts instead of re-arming another delay. Without it, a
   * query retrying against a torn-down cluster (every read returns a retryable
   * "source unavailable") re-arms its backoff timer forever and keeps the event
   * loop alive — a dominant contributor to the move-replica-handoff /
   * node-joining-rebalance post-teardown hangs.
   */
  markShuttingDown() {
    this._shuttingDown = true;
  }

  /**
   * @return {boolean} true once the owning engine has begun shutting down.
   */
  isShuttingDownRequested() {
    return this._shuttingDown === true;
  }

  /**
   * Throw when cooperative cancellation has been requested OR the engine is
   * shutting down.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
    if (this._shuttingDown === true) {
      const error = new Error(QUERY_EXECUTOR_SHUTDOWN_ABORT_MESSAGE);
      error.code = 'QUERY_EXECUTOR_SHUTTING_DOWN';
      throw error;
    }
    if (
      !cancellationToken ||
      typeof cancellationToken.throwIfCancelled !==
        QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return;
    }
    cancellationToken.throwIfCancelled();
  }
}
installQueryExecutorTemporaryUnroutableAddressMethods(
  QueryExecutorCancellationRouting,
);
installQueryExecutorPartitionRoutingCandidateMethods(
  QueryExecutorCancellationRouting,
);
installQueryExecutorPartitionRoutingSnapshotMethods(
  QueryExecutorCancellationRouting,
);

export {QueryExecutorCancellationRouting};
