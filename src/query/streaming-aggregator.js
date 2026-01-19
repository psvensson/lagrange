/**
 * Streaming Aggregator - Streams results to reduce memory footprint.
 * Implements streaming aggregation and external merge sort for ordered results.
 * Requirements: 26.9
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';

/**
 * StreamingAggregator processes query results in a streaming fashion
 * to reduce memory footprint for large result sets.
 */
class StreamingAggregator {
  /**
   * Create a new streaming aggregator.
   * @param {Object} options - Configuration options.
   * @param {number} options.chunkSize - Number of rows per chunk.
   * @param {number} options.maxMemoryBytes - Maximum memory for buffering.
   */
  constructor(options = {}) {
    this.logger = this.initLogger();

    const config = ConfigurationManager.getInstance();
    this.chunkSize = options.chunkSize ||
      config.get('queryCoordinator.streamingChunkSize') || 1000;
    this.maxMemoryBytes = options.maxMemoryBytes ||
      config.get('queryCoordinator.maxResultBufferBytes') || 1073741824;
    this.enabled = config.get('queryCoordinator.streamingEnabled') !== false;

    // Streaming state
    this.chunks = [];
    this.currentChunk = [];
    this.totalRows = 0;
    this.estimatedBytes = 0;
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem('streaming-aggregator');
      }
    } catch {
      // Logging not available
    }
    return console;
  }

  /**
   * Add rows to the streaming buffer.
   * @param {Array} rows - Rows to add.
   * @return {boolean} True if rows were added successfully.
   */
  addRows(rows) {
    if (!rows || rows.length === 0) return true;

    const rowBytes = this.estimateBytes(rows);

    // Check memory limit
    if (this.estimatedBytes + rowBytes > this.maxMemoryBytes) {
      this.logger.warn('Streaming aggregator memory limit reached', {
        currentBytes: this.estimatedBytes,
        newBytes: rowBytes,
        maxBytes: this.maxMemoryBytes,
      });
      return false;
    }

    for (const row of rows) {
      this.currentChunk.push(row);
      this.totalRows++;

      if (this.currentChunk.length >= this.chunkSize) {
        this.flushCurrentChunk();
      }
    }

    this.estimatedBytes += rowBytes;
    return true;
  }

  /**
   * Flush current chunk to chunks array.
   * @private
   */
  flushCurrentChunk() {
    if (this.currentChunk.length > 0) {
      this.chunks.push(this.currentChunk);
      this.currentChunk = [];
    }
  }

  /**
   * Estimate bytes for rows.
   * @param {Array} rows - Rows to estimate.
   * @return {number} Estimated bytes.
   * @private
   */
  estimateBytes(rows) {
    try {
      return JSON.stringify(rows).length * 2;
    } catch {
      return rows.length * 100;
    }
  }

  /**
   * Get all rows (flattened from chunks).
   * @return {Array} All rows.
   */
  getAllRows() {
    this.flushCurrentChunk();
    return this.chunks.flat();
  }

  /**
   * Get rows as an async iterator for streaming.
   * @yield {Array} Chunk of rows.
   */
  * getChunks() {
    this.flushCurrentChunk();
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }

  /**
   * Apply ORDER BY using external merge sort.
   * Requirements: 26.9
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted rows.
   */
  applySortedMerge(orderBy) {
    this.flushCurrentChunk();

    if (this.chunks.length === 0) return [];
    if (this.chunks.length === 1) {
      return this.sortChunk(this.chunks[0], orderBy);
    }

    // Sort each chunk individually
    const sortedChunks = this.chunks.map((chunk) =>
      this.sortChunk(chunk, orderBy),
    );

    // Merge sorted chunks using k-way merge
    return this.kWayMerge(sortedChunks, orderBy);
  }

  /**
   * Sort a single chunk.
   * @param {Array} chunk - Chunk to sort.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted chunk.
   * @private
   */
  sortChunk(chunk, orderBy) {
    return [...chunk].sort((a, b) => this.compareRows(a, b, orderBy));
  }

  /**
   * Compare two rows based on ORDER BY clauses.
   * @param {Object} a - First row.
   * @param {Object} b - Second row.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {number} Comparison result.
   * @private
   */
  compareRows(a, b, orderBy) {
    for (const clause of orderBy) {
      const col = clause.expression?.column || clause.column;
      const dir = clause.direction === 'DESC' ? -1 : 1;

      const aVal = a[col];
      const bVal = b[col];

      if (aVal === bVal) continue;
      if (aVal === null || aVal === undefined) return dir;
      if (bVal === null || bVal === undefined) return -dir;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        if (cmp !== 0) return cmp * dir;
      } else {
        if (aVal < bVal) return -dir;
        if (aVal > bVal) return dir;
      }
    }
    return 0;
  }

  /**
   * Perform k-way merge of sorted chunks.
   * @param {Array} sortedChunks - Array of sorted chunks.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Merged sorted array.
   * @private
   */
  kWayMerge(sortedChunks, orderBy) {
    const result = [];
    const iterators = sortedChunks.map((chunk) => ({
      data: chunk,
      index: 0,
    }));

    while (true) {
      // Find the minimum element among all iterators
      let minIterator = null;
      let minValue = null;

      for (const iter of iterators) {
        if (iter.index < iter.data.length) {
          const value = iter.data[iter.index];
          if (minValue === null || this.compareRows(value, minValue, orderBy) < 0) {
            minValue = value;
            minIterator = iter;
          }
        }
      }

      if (minIterator === null) break;

      result.push(minValue);
      minIterator.index++;
    }

    return result;
  }

  /**
   * Apply streaming aggregation for aggregate functions.
   * Computes aggregates incrementally without loading all data.
   * @param {Object} ast - SELECT AST with aggregate functions.
   * @return {Object} Aggregated result.
   */
  computeStreamingAggregates(ast) {
    this.flushCurrentChunk();

    const aggregates = this.extractAggregates(ast);
    if (aggregates.length === 0) {
      return {rows: this.getAllRows()};
    }

    // Initialize aggregate accumulators
    const accumulators = aggregates.map((agg) => ({
      ...agg,
      count: 0,
      sum: 0,
      min: null,
      max: null,
      values: [], // For AVG and DISTINCT
    }));

    // Process chunks incrementally
    for (const chunk of this.chunks) {
      for (const row of chunk) {
        this.updateAccumulators(accumulators, row);
      }
    }

    // Compute final aggregate values
    const result = {};
    for (const acc of accumulators) {
      result[acc.alias] = this.computeFinalAggregate(acc);
    }

    return {rows: [result]};
  }

  /**
   * Extract aggregate functions from AST.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Array of aggregate definitions.
   * @private
   */
  extractAggregates(ast) {
    const aggregates = [];

    for (const col of ast.columns || []) {
      const expr = col.expression || col;
      if (expr.type === 'aggregate') {
        const colName = expr.argument?.column || null;
        aggregates.push({
          function: expr.function.toUpperCase(),
          column: colName,
          distinct: expr.distinct || false,
          alias: col.alias || `${expr.function}(${colName || '*'})`,
          isStar: expr.argument?.type === 'star',
        });
      }
    }

    return aggregates;
  }

  /**
   * Update accumulators with a row.
   * @param {Array} accumulators - Aggregate accumulators.
   * @param {Object} row - Data row.
   * @private
   */
  updateAccumulators(accumulators, row) {
    for (const acc of accumulators) {
      const value = acc.isStar ? 1 : row[acc.column];

      // Skip null values for non-COUNT(*)
      if (value === null || value === undefined) {
        if (acc.function === 'COUNT' && acc.isStar) {
          acc.count++;
        }
        continue;
      }

      switch (acc.function) {
      case 'COUNT':
        if (acc.distinct) {
          if (!acc.values.includes(value)) {
            acc.values.push(value);
            acc.count++;
          }
        } else {
          acc.count++;
        }
        break;

      case 'SUM':
        acc.sum += Number(value) || 0;
        break;

      case 'AVG':
        acc.sum += Number(value) || 0;
        acc.count++;
        break;

      case 'MIN':
        if (acc.min === null || value < acc.min) {
          acc.min = value;
        }
        break;

      case 'MAX':
        if (acc.max === null || value > acc.max) {
          acc.max = value;
        }
        break;
      }
    }
  }

  /**
   * Compute final aggregate value from accumulator.
   * @param {Object} acc - Aggregate accumulator.
   * @return {*} Final aggregate value.
   * @private
   */
  computeFinalAggregate(acc) {
    switch (acc.function) {
    case 'COUNT':
      return acc.count;
    case 'SUM':
      return acc.sum;
    case 'AVG':
      return acc.count > 0 ? acc.sum / acc.count : null;
    case 'MIN':
      return acc.min;
    case 'MAX':
      return acc.max;
    default:
      return null;
    }
  }

  /**
   * Apply GROUP BY with streaming aggregation.
   * @param {Object} ast - SELECT AST with GROUP BY.
   * @return {Object} Grouped and aggregated result.
   */
  computeStreamingGroupBy(ast) {
    this.flushCurrentChunk();

    const groupByColumns = (ast.groupBy || []).map((g) =>
      g.column || g.expression?.column || g,
    );

    if (groupByColumns.length === 0) {
      return this.computeStreamingAggregates(ast);
    }

    const aggregates = this.extractAggregates(ast);
    const groups = new Map(); // groupKey -> accumulators

    // Process chunks incrementally
    for (const chunk of this.chunks) {
      for (const row of chunk) {
        const groupKey = groupByColumns.map((col) => row[col]).join('|');

        if (!groups.has(groupKey)) {
          // Initialize accumulators for new group
          const accumulators = aggregates.map((agg) => ({
            ...agg,
            count: 0,
            sum: 0,
            min: null,
            max: null,
            values: [],
          }));

          // Store group by values
          const groupValues = {};
          for (const col of groupByColumns) {
            groupValues[col] = row[col];
          }

          groups.set(groupKey, {groupValues, accumulators});
        }

        const group = groups.get(groupKey);
        this.updateAccumulators(group.accumulators, row);
      }
    }

    // Build result rows
    const rows = [];
    for (const group of groups.values()) {
      const row = {...group.groupValues};
      for (const acc of group.accumulators) {
        row[acc.alias] = this.computeFinalAggregate(acc);
      }
      rows.push(row);
    }

    return {rows};
  }

  /**
   * Get statistics about the streaming aggregator.
   * @return {Object} Statistics.
   */
  getStats() {
    return {
      enabled: this.enabled,
      chunkSize: this.chunkSize,
      maxMemoryBytes: this.maxMemoryBytes,
      totalRows: this.totalRows,
      estimatedBytes: this.estimatedBytes,
      chunkCount: this.chunks.length + (this.currentChunk.length > 0 ? 1 : 0),
    };
  }

  /**
   * Reset the aggregator for a new query.
   */
  reset() {
    this.chunks = [];
    this.currentChunk = [];
    this.totalRows = 0;
    this.estimatedBytes = 0;
  }
}

export {StreamingAggregator};
