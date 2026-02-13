/**
 * ExchangeManager — manages exchange routing for keyed
 * intermediate values emitted via `ctx.emit`.
 *
 * In LOCAL mode, values are buffered locally.
 * In KEY mode, values are routed to destination partitions
 * based on a consistent key hash.
 *
 * Delivery is at-least-once: duplicate emits are accepted
 * and no dedup is performed at the exchange level.
 *
 * Requirements: 7.2, 7.3
 * @module query/exchange-manager
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  EXCHANGE_MODE,
  EXCHANGE_ERROR_MSG,
  EXCHANGE_FIELD,
  DEFAULT_EXCHANGE_PARTITION_COUNT,
} from './runtime-constants.js';

/**
 * Compute a simple consistent hash of a string key,
 * returning a non-negative integer.
 *
 * Uses FNV-1a 32-bit for fast, well-distributed hashing.
 *
 * @param {string} key - Key to hash.
 * @return {number} Non-negative 32-bit hash.
 */
function hashKey(key) {
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Manages exchange routing for emitted key-value pairs.
 */
class ExchangeManager {
  /**
   * @param {Object} [opts] - Exchange options.
   * @param {string} [opts.mode] - Exchange mode
   *   ('local' or 'key'). Defaults to 'local'.
   * @param {number} [opts.partitionCount] - Number of
   *   destination partitions for key-based routing.
   */
  constructor(opts = {}) {
    /** @private */
    this._mode = opts.mode ?? EXCHANGE_MODE.LOCAL;

    /** @private */
    this._partitionCount = opts.partitionCount ??
      DEFAULT_EXCHANGE_PARTITION_COUNT;

    /** @private @type {Array<Object>} */
    this._localBuffer = [];

    /** @private @type {Map<number, Array<Object>>} */
    this._partitionBuffers = new Map();

    /** @private */
    this._closed = false;
  }

  /**
   * Route a key-value pair through the exchange.
   *
   * In LOCAL mode the entry is stored in the local buffer.
   * In KEY mode the key is hashed to select a destination
   * partition index and the entry is stored in that
   * partition's buffer.
   *
   * **No global ordering guarantee (Requirement 7.4):**
   * Records routed to different destination partitions may
   * be consumed in any order. Only records within a single
   * partition buffer preserve insertion order. Consumers
   * must not rely on cross-partition ordering.
   *
   * At-least-once: duplicate keys/values are accepted
   * without dedup at this layer.
   *
   * @param {string} key - Partition key (must be a string).
   * @param {*} value - Value to route.
   * @param {Object} [meta] - Optional emit metadata.
   * @throws {Error} If exchange is closed or key is invalid.
   */
  route(key, value, meta) {
    if (this._closed) {
      throw new Error(EXCHANGE_ERROR_MSG.EXCHANGE_CLOSED);
    }
    if (typeof key !== TYPEOF.STRING) {
      throw new Error(EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED);
    }

    const entry = {
      [EXCHANGE_FIELD.KEY]: key,
      [EXCHANGE_FIELD.VALUE]: value,
    };
    if (meta !== undefined) {
      entry[EXCHANGE_FIELD.META] = meta;
    }

    if (this._mode === EXCHANGE_MODE.LOCAL) {
      this._localBuffer.push(entry);
      return;
    }

    // KEY mode: hash key to partition index
    const idx = hashKey(key) % this._partitionCount;
    entry[EXCHANGE_FIELD.PARTITION_INDEX] = idx;

    let buf = this._partitionBuffers.get(idx);
    if (!buf) {
      buf = [];
      this._partitionBuffers.set(idx, buf);
    }
    buf.push(entry);
  }

  /**
   * Return the local buffer (LOCAL mode entries).
   * @return {Array<Object>} Local buffer entries.
   */
  getLocalBuffer() {
    return this._localBuffer;
  }

  /**
   * Return partition-keyed buffers (KEY mode entries).
   * @return {Map<number, Array<Object>>} Partition buffers.
   */
  getPartitionBuffers() {
    return this._partitionBuffers;
  }

  /**
   * Clear all buffers.
   */
  flush() {
    this._localBuffer = [];
    this._partitionBuffers.clear();
  }

  /**
   * Close the exchange. No further routing is accepted.
   */
  close() {
    this._closed = true;
  }

  /**
   * Whether the exchange is closed.
   * @return {boolean}
   */
  isClosed() {
    return this._closed;
  }

  /**
   * Get the current exchange mode.
   * @return {string}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Get the partition count used for key routing.
   * @return {number}
   */
  getPartitionCount() {
    return this._partitionCount;
  }
}

export {ExchangeManager, hashKey};
