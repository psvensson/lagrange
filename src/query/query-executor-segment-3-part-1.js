import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorSegment2} from './query-executor-segment-2.js';
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

class QueryExecutorSegment3Part1 extends QueryExecutorSegment2 {
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
  QueryExecutorSegment3Part1,
);
installQueryExecutorPartitionRoutingCandidateMethods(
  QueryExecutorSegment3Part1,
);
installQueryExecutorPartitionRoutingSnapshotMethods(QueryExecutorSegment3Part1);

export {QueryExecutorSegment3Part1};
