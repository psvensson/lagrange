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
   * Throw when cooperative cancellation has been requested.
   * @param {Object|null} cancellationToken
   * @private
   */
  throwIfCancelled(cancellationToken) {
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
