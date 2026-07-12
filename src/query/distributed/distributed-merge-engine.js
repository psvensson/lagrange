import {StreamingAggregator} from '../streaming-aggregator.js';
import {FANOUT_PLAN_KIND} from './distributed-select-fanout-plan.js';
import {combinePartialAggregateRows} from './partial-aggregate-combiner.js';

/**
 * DistributedMergeEngine wraps StreamingAggregator for canonical
 * distributed SQL global-merge semantics. When a fan-out plan is
 * provided, partial-aggregate partition rows are combined with global
 * semantics (aggregates, GROUP BY/HAVING, LIMIT/OFFSET applied exactly
 * once); without a plan the legacy raw-row merge applies (used by the
 * cross-partition JOIN path, whose coordinator-side rows are raw).
 */
class DistributedMergeEngine {
  /**
   * @param {Object} options
   * @param {Function} [options.streamingAggregatorFactory]
   */
  constructor(options = {}) {
    this.streamingAggregatorFactory = options.streamingAggregatorFactory ||
      (() => new StreamingAggregator());
  }

  /**
   * Merge partition results using streaming buffering and global semantics.
   * @param {Object[]} partitionResults - Partition execution results.
   * @param {Object} ast - SELECT AST.
   * @param {Object} queryExecutor - QueryExecutor instance.
   * @param {Object} [fanoutPlan] - Fan-out plan from
   *   buildSelectFanoutPlan; absent for raw coordinator-side row sets.
   * @return {Object} Aggregated result.
   */
  mergePartitionResults(partitionResults, ast, queryExecutor, fanoutPlan) {
    const aggregator = this.streamingAggregatorFactory();
    for (const partitionResult of partitionResults) {
      if (partitionResult.success && Array.isArray(partitionResult.rows)) {
        aggregator.addRows(partitionResult.rows);
      }
    }
    const mergedRows = aggregator.getAllRows();
    if (fanoutPlan?.kind === FANOUT_PLAN_KIND.PARTIAL_AGGREGATE) {
      return {
        rows: combinePartialAggregateRows(
          mergedRows,
          fanoutPlan.combineSpec,
          queryExecutor,
        ),
      };
    }
    return queryExecutor.aggregateSelectResults(
      [{success: true, rows: mergedRows}],
      ast,
    );
  }

  /**
   * Merge set-operation fragments through the same canonical merge path.
   * @param {Object[]} partitionResults - Partition execution results.
   * @param {Object} ast - SELECT AST with set operation.
   * @param {Object} queryExecutor - QueryExecutor instance.
   * @return {Object} Aggregated result.
   */
  mergeSetOperationResults(partitionResults, ast, queryExecutor) {
    return this.mergePartitionResults(partitionResults, ast, queryExecutor);
  }
}

export {DistributedMergeEngine};
