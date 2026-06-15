/**
 * HLC Timestamp - Hybrid Logical Clock timestamp implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
 */

import {TYPEOF} from '../constants/index.js';
import {HLC_ERROR_MSG, HLC_PART, HLC_SEPARATOR} from './hlc-constants.js';

const LOCAL_NUM_ZERO = 0;

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
    return `${this.physical}${HLC_SEPARATOR.FIELD}` +
      `${this.logical}${HLC_SEPARATOR.FIELD}${this.nodeId}`;
  }

  /**
   * Parse a timestamp from string representation.
   * @param {string} str - String representation of timestamp.
   * @return {HLCTimestamp} Parsed timestamp.
   */
  static fromString(str) {
    if (typeof str !== TYPEOF.STRING) {
      throw new Error(`${HLC_ERROR_MSG.NOT_STRING_PREFIX}${typeof str}`);
    }
    const parts = str.split(HLC_SEPARATOR.FIELD);
    if (parts.length < HLC_PART.MIN_COUNT) {
      throw new Error(`${HLC_ERROR_MSG.INVALID_STRING_PREFIX}${str}`);
    }
    // Node ID may contain dashes, so join remaining parts
    const physical = parseInt(parts[0], HLC_PART.PARSE_RADIX);
    const logical = parseInt(parts[1], HLC_PART.PARSE_RADIX);
    const nodeId = parts.slice(HLC_PART.NODE_ID_INDEX).join(HLC_SEPARATOR.FIELD);

    if (isNaN(physical) || isNaN(logical)) {
      throw new Error(`${HLC_ERROR_MSG.INVALID_STRING_PREFIX}${str}`);
    }

    return new HLCTimestamp(physical, logical, nodeId);
  }

  /**
   * Parse a timestamp from string, returning null instead of throwing on any
   * malformed/absent input. Used on hot paths (e.g. witnessing committed-entry
   * HLCs) where an unparseable timestamp must be skipped, not fatal.
   * @param {*} str - Candidate string representation of a timestamp.
   * @return {HLCTimestamp|null} Parsed timestamp, or null if not parseable.
   */
  static tryFromString(str) {
    if (typeof str !== TYPEOF.STRING || str.length === LOCAL_NUM_ZERO) {
      return null;
    }
    try {
      return HLCTimestamp.fromString(str);
    } catch (_error) {
      return null;
    }
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
    return this.compare(other) < LOCAL_NUM_ZERO;
  }

  /**
   * Check if this timestamp is after another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if this timestamp is after the other.
   */
  isAfter(other) {
    return this.compare(other) > LOCAL_NUM_ZERO;
  }

  /**
   * Check if this timestamp equals another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if timestamps are equal.
   */
  equals(other) {
    return this.compare(other) === LOCAL_NUM_ZERO;
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
