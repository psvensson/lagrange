/**
 * Key Range Manager - Manages partition key ranges.
 * Ensures contiguous, non-overlapping ranges for tables.
 * Requirements: 20.3, 20.5, 20.9
 */

import {LoggingService} from '../logging/logging-service.js';

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
      return this.compareKeys(key, this.end) < 0;
    }

    if (this.end === null) {
      return this.compareKeys(key, this.start) >= 0;
    }

    return this.compareKeys(key, this.start) >= 0 &&
           this.compareKeys(key, this.end) < 0;
  }

  /**
   * Compare two keys.
   * @param {*} a - First key.
   * @param {*} b - Second key.
   * @return {number} Negative if a < b, positive if a > b, 0 if equal.
   */
  compareKeys(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }

    if (typeof a === 'number' && typeof b === 'number') {
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
    return this.compareKeys(this.end, other.start) === 0;
  }

  /**
   * Check if this range overlaps with another.
   * @param {KeyRange} other - Other range.
   * @return {boolean} True if ranges overlap.
   */
  overlaps(other) {
    // Check if one range is completely before the other
    if (this.end !== null && other.start !== null) {
      if (this.compareKeys(this.end, other.start) <= 0) {
        return false;
      }
    }

    if (other.end !== null && this.start !== null) {
      if (this.compareKeys(other.end, this.start) <= 0) {
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
      loggingService.forSubsystem('key-range-manager') : console;
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
        throw new Error(
          `Key range overlap detected: partition ${partitionId} ` +
          `overlaps with ${existingId}`,
        );
      }
    }

    this.ranges.set(partitionId, keyRange);

    this.logger.debug('Added partition range', {
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

    this.logger.debug('Removed partition range', {
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
      if (a.range.start === null) return -1;
      if (b.range.start === null) return 1;
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

    if (sorted.length === 0) {
      return {valid: true, errors: []};
    }

    // Check first partition starts at NULL (unbounded)
    if (sorted[0].range.start !== null) {
      errors.push(
        `First partition ${sorted[0].partitionId} does not start at NULL`,
      );
    }

    // Check last partition ends at NULL (unbounded)
    if (sorted[sorted.length - 1].range.end !== null) {
      errors.push(
        `Last partition ${sorted[sorted.length - 1].partitionId} ` +
        'does not end at NULL',
      );
    }

    // Check contiguity and no overlaps
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Check for gap
      if (!current.range.isAdjacentTo(next.range)) {
        const currentEnd = current.range.end;
        const nextStart = next.range.start;

        if (current.range.compareKeys(currentEnd, nextStart) < 0) {
          errors.push(
            `Gap between partitions ${current.partitionId} and ` +
            `${next.partitionId}: [${currentEnd}, ${nextStart})`,
          );
        } else if (current.range.compareKeys(currentEnd, nextStart) > 0) {
          errors.push(
            `Overlap between partitions ${current.partitionId} and ` +
            `${next.partitionId}`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
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
      throw new Error(`Partition ${partitionId} not found`);
    }

    if (!range.contains(splitKey)) {
      throw new Error(`Split key ${splitKey} is not in partition range`);
    }

    const leftRange = new KeyRange(range.start, splitKey);
    const rightRange = new KeyRange(splitKey, range.end);

    // Remove old partition
    this.ranges.delete(partitionId);

    // Add new partitions
    this.ranges.set(leftPartitionId, leftRange);
    this.ranges.set(rightPartitionId, rightRange);

    this.logger.info('Split partition', {
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
      throw new Error(`Left partition ${leftPartitionId} not found`);
    }
    if (!rightRange) {
      throw new Error(`Right partition ${rightPartitionId} not found`);
    }

    if (!leftRange.isAdjacentTo(rightRange)) {
      throw new Error(
        `Partitions ${leftPartitionId} and ${rightPartitionId} are not adjacent`,
      );
    }

    const mergedRange = new KeyRange(leftRange.start, rightRange.end);

    // Remove old partitions
    this.ranges.delete(leftPartitionId);
    this.ranges.delete(rightPartitionId);

    // Add merged partition
    this.ranges.set(mergedPartitionId, mergedRange);

    this.logger.info('Merged partitions', {
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
