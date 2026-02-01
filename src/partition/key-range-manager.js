/**
 * Key Range Manager - Manages partition key ranges.
 * Ensures contiguous, non-overlapping ranges for tables.
 * Requirements: 20.3, 20.5, 20.9
 */

import {LoggingService} from '../logging/logging-service.js';
import {NUM, TYPEOF} from '../constants/index.js';
import {
  KEY_RANGE_ERROR_MSG,
  KEY_RANGE_LOG_MSG,
  PARTITION_SUBSYSTEM,
} from './partition-constants.js';

/**
 * Represents a partition key range.
 * Range is [start, end) - start is inclusive, end is exclusive.
 * NULL values represent unbounded (start=NULL means from beginning, end=NULL means to end).
 */
class KeyRange {
  /**
   * Create a new KeyRange.
   * @param {*} start - Start key (inclusive), null for unbounded.
   * @param {*} end - End key (exclusive), null for unbounded.
   */
  constructor(start = null, end = null) {
    this.start = start;
    this.end = end;
  }

  /**
   * Check if a key falls within this range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  contains(key) {
    // NULL start means unbounded lower
    // NULL end means unbounded upper
    if (this.start === null && this.end === null) {
      return true;
    }

    if (this.start === null) {
      return this.compareKeys(key, this.end) < NUM.ZERO;
    }

    if (this.end === null) {
      return this.compareKeys(key, this.start) >= NUM.ZERO;
    }

    return this.compareKeys(key, this.start) >= NUM.ZERO &&
           this.compareKeys(key, this.end) < NUM.ZERO;
  }

  /**
   * Compare two keys.
   * @param {*} a - First key.
   * @param {*} b - Second key.
   * @return {number} Negative if a < b, positive if a > b, 0 if equal.
   */
  compareKeys(a, b) {
    if (a === null && b === null) return NUM.ZERO;
    if (a === null) return NUM.NEGATIVE_ONE;
    if (b === null) return NUM.ONE;

    if (typeof a === TYPEOF.STRING && typeof b === TYPEOF.STRING) {
      return a.localeCompare(b);
    }

    if (typeof a === TYPEOF.NUMBER && typeof b === TYPEOF.NUMBER) {
      return a - b;
    }

    // Convert to string for comparison
    return String(a).localeCompare(String(b));
  }

  /**
   * Check if this range is adjacent to another (this.end === other.start).
   * @param {KeyRange} other - Other range.
   * @return {boolean} True if adjacent.
   */
  isAdjacentTo(other) {
    if (this.end === null || other.start === null) {
      return false;
    }
    return this.compareKeys(this.end, other.start) === NUM.ZERO;
  }

  /**
   * Check if this range overlaps with another.
   * @param {KeyRange} other - Other range.
   * @return {boolean} True if ranges overlap.
   */
  overlaps(other) {
    // Check if one range is completely before the other
    if (this.end !== null && other.start !== null) {
      if (this.compareKeys(this.end, other.start) <= NUM.ZERO) {
        return false;
      }
    }

    if (other.end !== null && this.start !== null) {
      if (this.compareKeys(other.end, this.start) <= NUM.ZERO) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if this range covers the full key space.
   * @return {boolean} True if full range.
   */
  isFullRange() {
    return this.start === null && this.end === null;
  }

  /**
   * Create a copy of this range.
   * @return {KeyRange} New KeyRange with same values.
   */
  clone() {
    return new KeyRange(this.start, this.end);
  }

  /**
   * Convert to plain object.
   * @return {Object} Plain object representation.
   */
  toObject() {
    return {start: this.start, end: this.end};
  }

  /**
   * Create from plain object.
   * @param {Object} obj - Plain object with start and end.
   * @return {KeyRange} New KeyRange.
   */
  static fromObject(obj) {
    return new KeyRange(obj.start, obj.end);
  }

  /**
   * Create a full range covering all keys.
   * @return {KeyRange} Full range [NULL, NULL).
   */
  static fullRange() {
    return new KeyRange(null, null);
  }
}


/**
 * KeyRangeManager manages partition key ranges for a table.
 * Ensures ranges are contiguous and non-overlapping.
 */
class KeyRangeManager {
  /**
   * Create a new KeyRangeManager.
   * @param {string} tableId - Table ID.
   */
  constructor(tableId) {
    this.tableId = tableId;
    this.ranges = new Map(); // partitionId -> KeyRange

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PARTITION_SUBSYSTEM.KEY_RANGE_MANAGER) : console;
  }

  /**
   * Add a partition with its key range.
   * @param {string} partitionId - Partition ID.
   * @param {KeyRange|Object} range - Key range.
   * @throws {Error} If range overlaps with existing ranges.
   */
  addPartition(partitionId, range) {
    const keyRange = range instanceof KeyRange ?
      range : KeyRange.fromObject(range);

    // Check for overlaps with existing ranges
    for (const [existingId, existingRange] of this.ranges) {
      if (existingId !== partitionId && keyRange.overlaps(existingRange)) {
        throw new Error(KEY_RANGE_ERROR_MSG.overlap(partitionId, existingId));
      }
    }

    this.ranges.set(partitionId, keyRange);

    this.logger.debug(KEY_RANGE_LOG_MSG.ADDED_PARTITION_RANGE, {
      tableId: this.tableId,
      partitionId,
      start: keyRange.start,
      end: keyRange.end,
    });
  }

  /**
   * Remove a partition.
   * @param {string} partitionId - Partition ID.
   */
  removePartition(partitionId) {
    this.ranges.delete(partitionId);

    this.logger.debug(KEY_RANGE_LOG_MSG.REMOVED_PARTITION_RANGE, {
      tableId: this.tableId,
      partitionId,
    });
  }

  /**
   * Get the key range for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {KeyRange|null} Key range or null.
   */
  getRange(partitionId) {
    return this.ranges.get(partitionId) || null;
  }

  /**
   * Find the partition that contains a key.
   * @param {*} key - Key to find.
   * @return {string|null} Partition ID or null.
   */
  findPartitionForKey(key) {
    for (const [partitionId, range] of this.ranges) {
      if (range.contains(key)) {
        return partitionId;
      }
    }
    return null;
  }

  /**
   * Get all partitions whose ranges overlap with a key range.
   * @param {KeyRange|Object} queryRange - Query range.
   * @return {Array<string>} Array of partition IDs.
   */
  findPartitionsInRange(queryRange) {
    const range = queryRange instanceof KeyRange ?
      queryRange : KeyRange.fromObject(queryRange);

    const result = [];
    for (const [partitionId, partitionRange] of this.ranges) {
      if (range.overlaps(partitionRange)) {
        result.push(partitionId);
      }
    }
    return result;
  }

  /**
   * Get all partition IDs.
   * @return {Array<string>} Array of partition IDs.
   */
  getAllPartitions() {
    return Array.from(this.ranges.keys());
  }

  /**
   * Get partitions sorted by their start key.
   * @return {Array<{partitionId: string, range: KeyRange}>} Sorted partitions.
   */
  getSortedPartitions() {
    const entries = Array.from(this.ranges.entries())
      .map(([partitionId, range]) => ({partitionId, range}));

    entries.sort((a, b) => {
      if (a.range.start === null) return NUM.NEGATIVE_ONE;
      if (b.range.start === null) return NUM.ONE;
      return a.range.compareKeys(a.range.start, b.range.start);
    });

    return entries;
  }

  /**
   * Find adjacent partition (the one whose start equals this partition's end).
   * @param {string} partitionId - Partition ID.
   * @return {string|null} Adjacent partition ID or null.
   */
  findAdjacentPartition(partitionId) {
    const range = this.ranges.get(partitionId);
    if (!range || range.end === null) {
      return null;
    }

    for (const [otherId, otherRange] of this.ranges) {
      if (otherId !== partitionId && range.isAdjacentTo(otherRange)) {
        return otherId;
      }
    }
    return null;
  }

  /**
   * Validate that all ranges are contiguous and non-overlapping.
   * @return {{valid: boolean, errors: Array<string>}} Validation result.
   */
  validateRanges() {
    const errors = [];
    const sorted = this.getSortedPartitions();

    if (sorted.length === NUM.ZERO) {
      return {valid: true, errors: []};
    }

    // Check first partition starts at NULL (unbounded)
    if (sorted[NUM.ZERO].range.start !== null) {
      errors.push(
        KEY_RANGE_ERROR_MSG.firstPartitionStarts(sorted[NUM.ZERO].partitionId),
      );
    }

    // Check last partition ends at NULL (unbounded)
    if (sorted[sorted.length - NUM.ONE].range.end !== null) {
      errors.push(
        KEY_RANGE_ERROR_MSG.lastPartitionEnds(
          sorted[sorted.length - NUM.ONE].partitionId,
        ),
      );
    }

    // Check contiguity and no overlaps
    for (let i = NUM.ZERO; i < sorted.length - NUM.ONE; i++) {
      const current = sorted[i];
      const next = sorted[i + NUM.ONE];

      // Check for gap
      if (!current.range.isAdjacentTo(next.range)) {
        const currentEnd = current.range.end;
        const nextStart = next.range.start;

        if (current.range.compareKeys(currentEnd, nextStart) < NUM.ZERO) {
          errors.push(
            KEY_RANGE_ERROR_MSG.gapBetweenPartitions(
              current.partitionId,
              next.partitionId,
              currentEnd,
              nextStart,
            ),
          );
        } else if (current.range.compareKeys(currentEnd, nextStart) > NUM.ZERO) {
          errors.push(
            KEY_RANGE_ERROR_MSG.overlapBetweenPartitions(
              current.partitionId,
              next.partitionId,
            ),
          );
        }
      }
    }

    return {
      valid: errors.length === NUM.ZERO,
      errors,
    };
  }

  /**
   * Split a partition at a given key.
   * @param {string} partitionId - Partition to split.
   * @param {*} splitKey - Key to split at.
   * @param {string} leftPartitionId - ID for left partition.
   * @param {string} rightPartitionId - ID for right partition.
   * @return {{left: KeyRange, right: KeyRange}} New ranges.
   */
  splitPartition(partitionId, splitKey, leftPartitionId, rightPartitionId) {
    const range = this.ranges.get(partitionId);
    if (!range) {
      throw new Error(KEY_RANGE_ERROR_MSG.partitionNotFound(partitionId));
    }

    if (!range.contains(splitKey)) {
      throw new Error(KEY_RANGE_ERROR_MSG.splitKeyOutOfRange(splitKey));
    }

    const leftRange = new KeyRange(range.start, splitKey);
    const rightRange = new KeyRange(splitKey, range.end);

    // Remove old partition
    this.ranges.delete(partitionId);

    // Add new partitions
    this.ranges.set(leftPartitionId, leftRange);
    this.ranges.set(rightPartitionId, rightRange);

    this.logger.info(KEY_RANGE_LOG_MSG.SPLIT_PARTITION, {
      tableId: this.tableId,
      originalPartition: partitionId,
      leftPartition: leftPartitionId,
      rightPartition: rightPartitionId,
      splitKey,
    });

    return {left: leftRange, right: rightRange};
  }

  /**
   * Merge two adjacent partitions.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {string} mergedPartitionId - ID for merged partition.
   * @return {KeyRange} Merged range.
   */
  mergePartitions(leftPartitionId, rightPartitionId, mergedPartitionId) {
    const leftRange = this.ranges.get(leftPartitionId);
    const rightRange = this.ranges.get(rightPartitionId);

    if (!leftRange) {
      throw new Error(KEY_RANGE_ERROR_MSG.leftPartitionNotFound(leftPartitionId));
    }
    if (!rightRange) {
      throw new Error(KEY_RANGE_ERROR_MSG.rightPartitionNotFound(rightPartitionId));
    }

    if (!leftRange.isAdjacentTo(rightRange)) {
      throw new Error(
        KEY_RANGE_ERROR_MSG.partitionsNotAdjacent(
          leftPartitionId,
          rightPartitionId,
        ),
      );
    }

    const mergedRange = new KeyRange(leftRange.start, rightRange.end);

    // Remove old partitions
    this.ranges.delete(leftPartitionId);
    this.ranges.delete(rightPartitionId);

    // Add merged partition
    this.ranges.set(mergedPartitionId, mergedRange);

    this.logger.info(KEY_RANGE_LOG_MSG.MERGED_PARTITIONS, {
      tableId: this.tableId,
      leftPartition: leftPartitionId,
      rightPartition: rightPartitionId,
      mergedPartition: mergedPartitionId,
    });

    return mergedRange;
  }

  /**
   * Get the number of partitions.
   * @return {number} Partition count.
   */
  getPartitionCount() {
    return this.ranges.size;
  }

  /**
   * Clear all partitions.
   */
  clear() {
    this.ranges.clear();
  }
}

export {KeyRange, KeyRangeManager};
