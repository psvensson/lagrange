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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF } from '../../constants/index.js';
import { EXCHANGE_MODE, EXCHANGE_ERROR_MSG, EXCHANGE_FIELD, DEFAULT_EXCHANGE_PARTITION_COUNT } from '../runtime-constants.js';

/**
 * Compute a simple consistent hash of a string key,
 * returning a non-negative integer.
 *
 * Uses FNV-1a 32-bit for fast, well-distributed hashing.
 *
 * @param {string} key - Key to hash.
 * @return {number} Non-negative 32-bit hash.
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
function hashKey(key) {
  if (stryMutAct_9fa48("112117")) {
    {}
  } else {
    stryCov_9fa48("112117");
    let hash = FNV_OFFSET;
    for (let i = 0; stryMutAct_9fa48("112120") ? i >= key.length : stryMutAct_9fa48("112119") ? i <= key.length : stryMutAct_9fa48("112118") ? false : (stryCov_9fa48("112118", "112119", "112120"), i < key.length); stryMutAct_9fa48("112121") ? i-- : (stryCov_9fa48("112121"), i++)) {
      if (stryMutAct_9fa48("112122")) {
        {}
      } else {
        stryCov_9fa48("112122");
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
      }
    }
    return hash >>> 0;
  }
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
    if (stryMutAct_9fa48("112123")) {
      {}
    } else {
      stryCov_9fa48("112123");
      /** @private */
      this._mode = stryMutAct_9fa48("112124") ? opts.mode && EXCHANGE_MODE.LOCAL : (stryCov_9fa48("112124"), opts.mode ?? EXCHANGE_MODE.LOCAL);

      /** @private */
      this._partitionCount = stryMutAct_9fa48("112125") ? opts.partitionCount && DEFAULT_EXCHANGE_PARTITION_COUNT : (stryCov_9fa48("112125"), opts.partitionCount ?? DEFAULT_EXCHANGE_PARTITION_COUNT);

      /** @private @type {Array<Object>} */
      this._localBuffer = stryMutAct_9fa48("112126") ? ["Stryker was here"] : (stryCov_9fa48("112126"), []);

      /** @private @type {Map<number, Array<Object>>} */
      this._partitionBuffers = new Map();

      /** @private */
      this._closed = stryMutAct_9fa48("112127") ? true : (stryCov_9fa48("112127"), false);
    }
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
    if (stryMutAct_9fa48("112128")) {
      {}
    } else {
      stryCov_9fa48("112128");
      if (stryMutAct_9fa48("112130") ? false : stryMutAct_9fa48("112129") ? true : (stryCov_9fa48("112129", "112130"), this._closed)) {
        if (stryMutAct_9fa48("112131")) {
          {}
        } else {
          stryCov_9fa48("112131");
          throw new Error(EXCHANGE_ERROR_MSG.EXCHANGE_CLOSED);
        }
      }
      if (stryMutAct_9fa48("112134") ? typeof key === TYPEOF.STRING : stryMutAct_9fa48("112133") ? false : stryMutAct_9fa48("112132") ? true : (stryCov_9fa48("112132", "112133", "112134"), typeof key !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("112135")) {
          {}
        } else {
          stryCov_9fa48("112135");
          throw new Error(EXCHANGE_ERROR_MSG.EMIT_KEY_REQUIRED);
        }
      }
      const entry = stryMutAct_9fa48("112136") ? {} : (stryCov_9fa48("112136"), {
        [EXCHANGE_FIELD.KEY]: key,
        [EXCHANGE_FIELD.VALUE]: value
      });
      if (stryMutAct_9fa48("112139") ? meta === undefined : stryMutAct_9fa48("112138") ? false : stryMutAct_9fa48("112137") ? true : (stryCov_9fa48("112137", "112138", "112139"), meta !== undefined)) {
        if (stryMutAct_9fa48("112140")) {
          {}
        } else {
          stryCov_9fa48("112140");
          entry[EXCHANGE_FIELD.META] = meta;
        }
      }
      if (stryMutAct_9fa48("112143") ? this._mode !== EXCHANGE_MODE.LOCAL : stryMutAct_9fa48("112142") ? false : stryMutAct_9fa48("112141") ? true : (stryCov_9fa48("112141", "112142", "112143"), this._mode === EXCHANGE_MODE.LOCAL)) {
        if (stryMutAct_9fa48("112144")) {
          {}
        } else {
          stryCov_9fa48("112144");
          this._localBuffer.push(entry);
          return;
        }
      }

      // KEY mode: hash key to partition index
      const idx = stryMutAct_9fa48("112145") ? hashKey(key) * this._partitionCount : (stryCov_9fa48("112145"), hashKey(key) % this._partitionCount);
      entry[EXCHANGE_FIELD.PARTITION_INDEX] = idx;
      let buf = this._partitionBuffers.get(idx);
      if (stryMutAct_9fa48("112148") ? false : stryMutAct_9fa48("112147") ? true : stryMutAct_9fa48("112146") ? buf : (stryCov_9fa48("112146", "112147", "112148"), !buf)) {
        if (stryMutAct_9fa48("112149")) {
          {}
        } else {
          stryCov_9fa48("112149");
          buf = stryMutAct_9fa48("112150") ? ["Stryker was here"] : (stryCov_9fa48("112150"), []);
          this._partitionBuffers.set(idx, buf);
        }
      }
      buf.push(entry);
    }
  }

  /**
   * Return the local buffer (LOCAL mode entries).
   * @return {Array<Object>} Local buffer entries.
   */
  getLocalBuffer() {
    if (stryMutAct_9fa48("112151")) {
      {}
    } else {
      stryCov_9fa48("112151");
      return this._localBuffer;
    }
  }

  /**
   * Return partition-keyed buffers (KEY mode entries).
   * @return {Map<number, Array<Object>>} Partition buffers.
   */
  getPartitionBuffers() {
    if (stryMutAct_9fa48("112152")) {
      {}
    } else {
      stryCov_9fa48("112152");
      return this._partitionBuffers;
    }
  }

  /**
   * Clear all buffers.
   */
  flush() {
    if (stryMutAct_9fa48("112153")) {
      {}
    } else {
      stryCov_9fa48("112153");
      this._localBuffer = stryMutAct_9fa48("112154") ? ["Stryker was here"] : (stryCov_9fa48("112154"), []);
      this._partitionBuffers.clear();
    }
  }

  /**
   * Close the exchange. No further routing is accepted.
   */
  close() {
    if (stryMutAct_9fa48("112155")) {
      {}
    } else {
      stryCov_9fa48("112155");
      this._closed = stryMutAct_9fa48("112156") ? false : (stryCov_9fa48("112156"), true);
    }
  }

  /**
   * Whether the exchange is closed.
   * @return {boolean}
   */
  isClosed() {
    if (stryMutAct_9fa48("112157")) {
      {}
    } else {
      stryCov_9fa48("112157");
      return this._closed;
    }
  }

  /**
   * Get the current exchange mode.
   * @return {string}
   */
  getMode() {
    if (stryMutAct_9fa48("112158")) {
      {}
    } else {
      stryCov_9fa48("112158");
      return this._mode;
    }
  }

  /**
   * Get the partition count used for key routing.
   * @return {number}
   */
  getPartitionCount() {
    if (stryMutAct_9fa48("112159")) {
      {}
    } else {
      stryCov_9fa48("112159");
      return this._partitionCount;
    }
  }
}
export { ExchangeManager, hashKey };