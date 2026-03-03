import {StreamingAggregator} from '../streaming-aggregator.js';

/**
 * DistributedMergeEngine wraps StreamingAggregator for canonical
 * distributed SQL global-merge semantics.
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
   * @return {Object} Aggregated result.
   */
  mergePartitionResults(partitionResults, ast, queryExecutor) {
    const aggregator = this.streamingAggregatorFactory();
    for (const partitionResult of partitionResults) {
      if (partitionResult.success && Array.isArray(partitionResult.rows)) {
        aggregator.addRows(partitionResult.rows);
      }
    }
    const mergedRows = aggregator.getAllRows();
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
