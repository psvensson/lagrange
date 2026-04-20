/**
 * Streaming Aggregator - Streams results to reduce memory footprint.
 * Implements streaming aggregation and external merge sort for ordered results.
 * Requirements: 26.9
 */

import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  QUERY_AGGREGATE,
  QUERY_AST_NODE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_LOG_MSG,
  QUERY_SORT_DIRECTION,
  QUERY_SQL_FRAGMENT,
  QUERY_SUBSYSTEM,
} from './query-constants.js';

const RESULT_ESTIMATE = Object.freeze({
  UTF16_BYTES_PER_CHAR: NUM.TWO,
  FALLBACK_ROW_BYTES: NUM.HUNDRED,
});

function resolveSortDirection(clause) {
  return clause.direction === QUERY_SORT_DIRECTION.DESC ?
    NUM.NEGATIVE_ONE :
    NUM.ONE;
}

function compareNullishValues(aVal, bVal, direction) {
  if (aVal === bVal) {
    return NUM.ZERO;
  }
  if (aVal === null || aVal === undefined) {
    return direction;
  }
  if (bVal === null || bVal === undefined) {
    return -direction;
  }
  return null;
}

function compareDefinedValues(aVal, bVal, direction) {
  if (typeof aVal === TYPEOF.STRING && typeof bVal === TYPEOF.STRING) {
    return aVal.localeCompare(bVal) * direction;
  }
  if (aVal < bVal) {
    return -direction;
  }
  if (aVal > bVal) {
    return direction;
  }
  return NUM.ZERO;
}

function resolveAccumulatorValue(acc, row) {
  return acc.isStar ? NUM.ONE : row[acc.column];
}

function updateCountAccumulator(acc, value) {
  if (acc.distinct) {
    if (!acc.values.includes(value)) {
      acc.values.push(value);
      acc.count++;
    }
    return;
  }

  acc.count++;
}

function updateMinAccumulator(acc, value) {
  if (acc.min === null || value < acc.min) {
    acc.min = value;
  }
}

function updateMaxAccumulator(acc, value) {
  if (acc.max === null || value > acc.max) {
    acc.max = value;
  }
}

function updateAccumulator(acc, value) {
  switch (acc.function) {
  case QUERY_AGGREGATE.COUNT:
    updateCountAccumulator(acc, value);
    break;
  case QUERY_AGGREGATE.SUM:
    acc.sum += Number(value) || NUM.ZERO;
    break;
  case QUERY_AGGREGATE.AVG:
    acc.sum += Number(value) || NUM.ZERO;
    acc.count++;
    break;
  case QUERY_AGGREGATE.MIN:
    updateMinAccumulator(acc, value);
    break;
  case QUERY_AGGREGATE.MAX:
    updateMaxAccumulator(acc, value);
    break;
  }
}

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
      config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE) ||
      QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE;
    this.maxMemoryBytes = options.maxMemoryBytes ||
      config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES) ||
      QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES;
    this.enabled = config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) !== false;

    // Streaming state
    this.chunks = [];
    this.currentChunk = [];
    this.totalRows = NUM.ZERO;
    this.estimatedBytes = NUM.ZERO;
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
        return loggingService.forSubsystem(QUERY_SUBSYSTEM.STREAMING_AGGREGATOR);
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
    if (!rows || rows.length === NUM.ZERO) return true;

    const rowBytes = this.estimateBytes(rows);

    // Check memory limit
    if (this.estimatedBytes + rowBytes > this.maxMemoryBytes) {
      this.logger.warn(QUERY_LOG_MSG.STREAMING_MEMORY_LIMIT_REACHED, {
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
    if (this.currentChunk.length > NUM.ZERO) {
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
      return JSON.stringify(rows).length * RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR;
    } catch {
      return rows.length * RESULT_ESTIMATE.FALLBACK_ROW_BYTES;
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

    if (this.chunks.length === NUM.ZERO) return [];
    if (this.chunks.length === NUM.ONE) {
      return this.sortChunk(this.chunks[NUM.ZERO], orderBy);
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
      const dir = resolveSortDirection(clause);
      const aVal = a[col];
      const bVal = b[col];
      const nullishComparison = compareNullishValues(aVal, bVal, dir);
      if (nullishComparison !== null) return nullishComparison;
      const valueComparison = compareDefinedValues(aVal, bVal, dir);
      if (valueComparison !== NUM.ZERO) return valueComparison;
    }
    return NUM.ZERO;
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
      index: NUM.ZERO,
    }));

    while (true) {
      // Find the minimum element among all iterators
      let minIterator = null;
      let minValue = null;

      for (const iter of iterators) {
        if (iter.index < iter.data.length) {
          const value = iter.data[iter.index];
          if (minValue === null ||
            this.compareRows(value, minValue, orderBy) < NUM.ZERO) {
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
      count: NUM.ZERO,
      sum: NUM.ZERO,
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
      if (expr.type === QUERY_AST_NODE.AGGREGATE) {
        const colName = expr.argument?.column || null;
        aggregates.push({
          function: expr.function.toUpperCase(),
          column: colName,
          distinct: expr.distinct || false,
          alias: col.alias || `${expr.function}(${colName || QUERY_SQL_FRAGMENT.STAR})`,
          isStar: expr.argument?.type === QUERY_AST_NODE.STAR,
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
      const value = resolveAccumulatorValue(acc, row);

      // Skip null values for non-COUNT(*)
      if (value === null || value === undefined) {
        if (acc.function === QUERY_AGGREGATE.COUNT && acc.isStar) {
          acc.count++;
        }
        continue;
      }

      updateAccumulator(acc, value);
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
    case QUERY_AGGREGATE.COUNT:
      return acc.count;
    case QUERY_AGGREGATE.SUM:
      return acc.sum;
    case QUERY_AGGREGATE.AVG:
      return acc.count > NUM.ZERO ? acc.sum / acc.count : null;
    case QUERY_AGGREGATE.MIN:
      return acc.min;
    case QUERY_AGGREGATE.MAX:
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

    if (groupByColumns.length === NUM.ZERO) {
      return this.computeStreamingAggregates(ast);
    }

    const aggregates = this.extractAggregates(ast);
    const groups = new Map(); // groupKey -> accumulators

    // Process chunks incrementally
    for (const chunk of this.chunks) {
      for (const row of chunk) {
        const groupKey = groupByColumns.map((col) => row[col]).join(
          QUERY_SQL_FRAGMENT.PIPE,
        );

        if (!groups.has(groupKey)) {
          // Initialize accumulators for new group
          const accumulators = aggregates.map((agg) => ({
            ...agg,
            count: NUM.ZERO,
            sum: NUM.ZERO,
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
      chunkCount: this.chunks.length +
        (this.currentChunk.length > NUM.ZERO ? NUM.ONE : NUM.ZERO),
    };
  }

  /**
   * Reset the aggregator for a new query.
   */
  reset() {
    this.chunks = [];
    this.currentChunk = [];
    this.totalRows = NUM.ZERO;
    this.estimatedBytes = NUM.ZERO;
  }
}

export {StreamingAggregator};
