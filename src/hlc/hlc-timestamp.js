/**
 * HLC Timestamp - Hybrid Logical Clock timestamp implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
 */

/**
 * HLCTimestamp represents a hybrid logical clock timestamp.
 * Combines physical time with a logical counter for global ordering.
 */
class HLCTimestamp {
  /**
   * Create a new HLCTimestamp.
   * @param {number} physical - Unix timestamp in milliseconds.
   * @param {number} logical - Logical counter (0-65535).
   * @param {string} nodeId - Node ID for tie-breaking.
   */
  constructor(physical, logical, nodeId) {
    this.physical = physical;
    this.logical = logical;
    this.nodeId = nodeId;
  }

  /**
   * Convert timestamp to string representation.
   * @return {string} String representation of the timestamp.
   */
  toString() {
    return `${this.physical}-${this.logical}-${this.nodeId}`;
  }

  /**
   * Parse a timestamp from string representation.
   * @param {string} str - String representation of timestamp.
   * @return {HLCTimestamp} Parsed timestamp.
   */
  static fromString(str) {
    const parts = str.split('-');
    if (parts.length < 3) {
      throw new Error(`Invalid HLC timestamp string: ${str}`);
    }
    // Node ID may contain dashes, so join remaining parts
    const physical = parseInt(parts[0], 10);
    const logical = parseInt(parts[1], 10);
    const nodeId = parts.slice(2).join('-');

    if (isNaN(physical) || isNaN(logical)) {
      throw new Error(`Invalid HLC timestamp string: ${str}`);
    }

    return new HLCTimestamp(physical, logical, nodeId);
  }

  /**
   * Compare this timestamp with another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {number} Negative if this < other, positive if this > other, 0 if equal.
   */
  compare(other) {
    if (this.physical !== other.physical) {
      return this.physical - other.physical;
    }
    if (this.logical !== other.logical) {
      return this.logical - other.logical;
    }
    return this.nodeId.localeCompare(other.nodeId);
  }

  /**
   * Check if this timestamp is before another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if this timestamp is before the other.
   */
  isBefore(other) {
    return this.compare(other) < 0;
  }

  /**
   * Check if this timestamp is after another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if this timestamp is after the other.
   */
  isAfter(other) {
    return this.compare(other) > 0;
  }

  /**
   * Check if this timestamp equals another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if timestamps are equal.
   */
  equals(other) {
    return this.compare(other) === 0;
  }

  /**
   * Create a copy of this timestamp.
   * @return {HLCTimestamp} A new timestamp with the same values.
   */
  clone() {
    return new HLCTimestamp(this.physical, this.logical, this.nodeId);
  }
}

export {HLCTimestamp};
