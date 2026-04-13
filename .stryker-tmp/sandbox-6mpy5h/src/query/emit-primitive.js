/**
 * Emit primitive — ctx.emit(key, value).
 *
 * Writes keyed intermediate records to engine-managed shuffle
 * streams. Applies queue quotas, backpressure, and spill-to-disk
 * controls. Defines retry/checkpoint boundaries by stage.
 *
 * Requirements: 5.1, 5.3, 9.1
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
import { NUM, TYPEOF } from '../constants/index.js';
import { EMIT_MAX_BYTES } from '../wasm-service/query-budget-constants.js';
import { EMIT_FIELD, EMIT_QUEUE_STATE, PRIMITIVE_ERROR_MSG, PRIMITIVE_TYPE, EMIT_QUEUE_HIGH_WATER_MARK, EMIT_SPILL_THRESHOLD_BYTES } from './distributed/distributed-context-constants.js';

/**
 * Validate emit arguments.
 *
 * @param {Uint8Array|string} key - Partition/shuffle key.
 * @param {Uint8Array} value - Record payload.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateEmitArgs(key, value) {
  if (stryMutAct_9fa48("112838")) {
    {}
  } else {
    stryCov_9fa48("112838");
    if (stryMutAct_9fa48("112841") ? key === undefined && key === null : stryMutAct_9fa48("112840") ? false : stryMutAct_9fa48("112839") ? true : (stryCov_9fa48("112839", "112840", "112841"), (stryMutAct_9fa48("112843") ? key !== undefined : stryMutAct_9fa48("112842") ? false : (stryCov_9fa48("112842", "112843"), key === undefined)) || (stryMutAct_9fa48("112845") ? key !== null : stryMutAct_9fa48("112844") ? false : (stryCov_9fa48("112844", "112845"), key === null)))) {
      if (stryMutAct_9fa48("112846")) {
        {}
      } else {
        stryCov_9fa48("112846");
        return stryMutAct_9fa48("112847") ? {} : (stryCov_9fa48("112847"), {
          valid: stryMutAct_9fa48("112848") ? true : (stryCov_9fa48("112848"), false),
          error: PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("112851") ? typeof key !== TYPEOF.STRING || !(key instanceof Uint8Array) : stryMutAct_9fa48("112850") ? false : stryMutAct_9fa48("112849") ? true : (stryCov_9fa48("112849", "112850", "112851"), (stryMutAct_9fa48("112853") ? typeof key === TYPEOF.STRING : stryMutAct_9fa48("112852") ? true : (stryCov_9fa48("112852", "112853"), typeof key !== TYPEOF.STRING)) && (stryMutAct_9fa48("112854") ? key instanceof Uint8Array : (stryCov_9fa48("112854"), !(key instanceof Uint8Array))))) {
      if (stryMutAct_9fa48("112855")) {
        {}
      } else {
        stryCov_9fa48("112855");
        return stryMutAct_9fa48("112856") ? {} : (stryCov_9fa48("112856"), {
          valid: stryMutAct_9fa48("112857") ? true : (stryCov_9fa48("112857"), false),
          error: PRIMITIVE_ERROR_MSG.EMIT_KEY_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("112860") ? value === undefined && value === null : stryMutAct_9fa48("112859") ? false : stryMutAct_9fa48("112858") ? true : (stryCov_9fa48("112858", "112859", "112860"), (stryMutAct_9fa48("112862") ? value !== undefined : stryMutAct_9fa48("112861") ? false : (stryCov_9fa48("112861", "112862"), value === undefined)) || (stryMutAct_9fa48("112864") ? value !== null : stryMutAct_9fa48("112863") ? false : (stryCov_9fa48("112863", "112864"), value === null)))) {
      if (stryMutAct_9fa48("112865")) {
        {}
      } else {
        stryCov_9fa48("112865");
        return stryMutAct_9fa48("112866") ? {} : (stryCov_9fa48("112866"), {
          valid: stryMutAct_9fa48("112867") ? true : (stryCov_9fa48("112867"), false),
          error: PRIMITIVE_ERROR_MSG.EMIT_VALUE_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("112870") ? false : stryMutAct_9fa48("112869") ? true : stryMutAct_9fa48("112868") ? value instanceof Uint8Array : (stryCov_9fa48("112868", "112869", "112870"), !(value instanceof Uint8Array))) {
      if (stryMutAct_9fa48("112871")) {
        {}
      } else {
        stryCov_9fa48("112871");
        return stryMutAct_9fa48("112872") ? {} : (stryCov_9fa48("112872"), {
          valid: stryMutAct_9fa48("112873") ? true : (stryCov_9fa48("112873"), false),
          error: PRIMITIVE_ERROR_MSG.EMIT_VALUE_MUST_BE_UINT8ARRAY
        });
      }
    }
    return stryMutAct_9fa48("112874") ? {} : (stryCov_9fa48("112874"), {
      valid: stryMutAct_9fa48("112875") ? false : (stryCov_9fa48("112875"), true),
      error: null
    });
  }
}

/**
 * Compute byte size of an emit record (key + value).
 *
 * @param {Uint8Array|string} key - Partition/shuffle key.
 * @param {Uint8Array} value - Record payload.
 * @return {number} Total byte size.
 */
function computeEmitRecordBytes(key, value) {
  if (stryMutAct_9fa48("112876")) {
    {}
  } else {
    stryCov_9fa48("112876");
    const keyBytes = (stryMutAct_9fa48("112879") ? typeof key !== TYPEOF.STRING : stryMutAct_9fa48("112878") ? false : stryMutAct_9fa48("112877") ? true : (stryCov_9fa48("112877", "112878", "112879"), typeof key === TYPEOF.STRING)) ? key.length : key.byteLength;
    return stryMutAct_9fa48("112880") ? keyBytes - value.byteLength : (stryCov_9fa48("112880"), keyBytes + value.byteLength);
  }
}

/**
 * ShuffleBuffer — bounded in-memory buffer for emitted records
 * with backpressure and spill-to-disk support.
 *
 * Tracks total emitted bytes against the query budget and
 * transitions through queue states as thresholds are crossed.
 */
class ShuffleBuffer {
  /**
   * @param {Object} [options] - Buffer options.
   * @param {number} [options.maxBytes] - Max emitted bytes budget.
   * @param {number} [options.highWaterMark] - Record count for
   *   backpressure trigger.
   * @param {number} [options.spillThresholdBytes] - Byte threshold
   *   for spill-to-disk.
   * @param {Function} [options.onSpill] - Async callback invoked
   *   when spill threshold is reached. Receives buffered records.
   * @param {Function} [options.onTelemetry] - Telemetry callback.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs to emit records.
   * @param {number} [options.stageIndex] - Stage index for
   *   lineage ID generation.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("112881")) {
      {}
    } else {
      stryCov_9fa48("112881");
      this.maxBytes = stryMutAct_9fa48("112882") ? options.maxBytes && EMIT_MAX_BYTES : (stryCov_9fa48("112882"), options.maxBytes ?? EMIT_MAX_BYTES);
      this.highWaterMark = stryMutAct_9fa48("112883") ? options.highWaterMark && EMIT_QUEUE_HIGH_WATER_MARK : (stryCov_9fa48("112883"), options.highWaterMark ?? EMIT_QUEUE_HIGH_WATER_MARK);
      this.spillThresholdBytes = stryMutAct_9fa48("112884") ? options.spillThresholdBytes && EMIT_SPILL_THRESHOLD_BYTES : (stryCov_9fa48("112884"), options.spillThresholdBytes ?? EMIT_SPILL_THRESHOLD_BYTES);
      this.onSpill = stryMutAct_9fa48("112885") ? options.onSpill && null : (stryCov_9fa48("112885"), options.onSpill ?? null);
      this.onTelemetry = stryMutAct_9fa48("112886") ? options.onTelemetry && null : (stryCov_9fa48("112886"), options.onTelemetry ?? null);
      this.lineageTracker = stryMutAct_9fa48("112887") ? options.lineageTracker && null : (stryCov_9fa48("112887"), options.lineageTracker ?? null);
      this.stageIndex = stryMutAct_9fa48("112888") ? options.stageIndex && NUM.ZERO : (stryCov_9fa48("112888"), options.stageIndex ?? NUM.ZERO);
      this.records = stryMutAct_9fa48("112889") ? ["Stryker was here"] : (stryCov_9fa48("112889"), []);
      this.totalBytes = NUM.ZERO;
      this.totalRecords = NUM.ZERO;
      this.spillCount = NUM.ZERO;
      this.state = EMIT_QUEUE_STATE.ACCEPTING;
    }
  }

  /**
   * Emit a keyed record into the shuffle buffer.
   *
   * Requirement 5.3: Engine-managed shuffle/group stage with
   * quota-aware buffering and backpressure.
   * Requirement 9.1: Enforce emitted intermediate byte limits.
   *
   * @param {Uint8Array|string} key - Partition/shuffle key.
   * @param {Uint8Array} value - Record payload.
   * @return {Promise<Object>} Emit result with buffer state.
   * @throws {Error} On validation failure or budget exceeded.
   */
  async emit(key, value) {
    if (stryMutAct_9fa48("112890")) {
      {}
    } else {
      stryCov_9fa48("112890");
      if (stryMutAct_9fa48("112893") ? this.state !== EMIT_QUEUE_STATE.CLOSED : stryMutAct_9fa48("112892") ? false : stryMutAct_9fa48("112891") ? true : (stryCov_9fa48("112891", "112892", "112893"), this.state === EMIT_QUEUE_STATE.CLOSED)) {
        if (stryMutAct_9fa48("112894")) {
          {}
        } else {
          stryCov_9fa48("112894");
          throw new Error(PRIMITIVE_ERROR_MSG.EMIT_QUEUE_CLOSED);
        }
      }
      const validation = validateEmitArgs(key, value);
      if (stryMutAct_9fa48("112897") ? false : stryMutAct_9fa48("112896") ? true : stryMutAct_9fa48("112895") ? validation.valid : (stryCov_9fa48("112895", "112896", "112897"), !validation.valid)) {
        if (stryMutAct_9fa48("112898")) {
          {}
        } else {
          stryCov_9fa48("112898");
          throw new Error(validation.error);
        }
      }
      const recordBytes = computeEmitRecordBytes(key, value);

      // Check total budget
      if (stryMutAct_9fa48("112902") ? this.totalBytes + recordBytes <= this.maxBytes : stryMutAct_9fa48("112901") ? this.totalBytes + recordBytes >= this.maxBytes : stryMutAct_9fa48("112900") ? false : stryMutAct_9fa48("112899") ? true : (stryCov_9fa48("112899", "112900", "112901", "112902"), (stryMutAct_9fa48("112903") ? this.totalBytes - recordBytes : (stryCov_9fa48("112903"), this.totalBytes + recordBytes)) > this.maxBytes)) {
        if (stryMutAct_9fa48("112904")) {
          {}
        } else {
          stryCov_9fa48("112904");
          this.state = EMIT_QUEUE_STATE.CLOSED;
          throw new Error(PRIMITIVE_ERROR_MSG.EMIT_MAX_BYTES_EXCEEDED);
        }
      }

      // Add record
      const record = stryMutAct_9fa48("112905") ? {} : (stryCov_9fa48("112905"), {
        [EMIT_FIELD.KEY]: key,
        [EMIT_FIELD.VALUE]: value,
        [EMIT_FIELD.BYTE_COUNT]: recordBytes
      });
      if (stryMutAct_9fa48("112907") ? false : stryMutAct_9fa48("112906") ? true : (stryCov_9fa48("112906", "112907"), this.lineageTracker)) {
        if (stryMutAct_9fa48("112908")) {
          {}
        } else {
          stryCov_9fa48("112908");
          this.lineageTracker.attachLineage(record, this.stageIndex, PRIMITIVE_TYPE.EMIT, this.totalRecords);
        }
      }
      this.records.push(record);
      stryMutAct_9fa48("112909") ? this.totalBytes -= recordBytes : (stryCov_9fa48("112909"), this.totalBytes += recordBytes);
      stryMutAct_9fa48("112910") ? this.totalRecords -= NUM.ONE : (stryCov_9fa48("112910"), this.totalRecords += NUM.ONE);

      // Check spill threshold
      if (stryMutAct_9fa48("112913") ? this.totalBytes >= this.spillThresholdBytes || this.state !== EMIT_QUEUE_STATE.SPILLING : stryMutAct_9fa48("112912") ? false : stryMutAct_9fa48("112911") ? true : (stryCov_9fa48("112911", "112912", "112913"), (stryMutAct_9fa48("112916") ? this.totalBytes < this.spillThresholdBytes : stryMutAct_9fa48("112915") ? this.totalBytes > this.spillThresholdBytes : stryMutAct_9fa48("112914") ? true : (stryCov_9fa48("112914", "112915", "112916"), this.totalBytes >= this.spillThresholdBytes)) && (stryMutAct_9fa48("112918") ? this.state === EMIT_QUEUE_STATE.SPILLING : stryMutAct_9fa48("112917") ? true : (stryCov_9fa48("112917", "112918"), this.state !== EMIT_QUEUE_STATE.SPILLING)))) {
        if (stryMutAct_9fa48("112919")) {
          {}
        } else {
          stryCov_9fa48("112919");
          await this._spill();
        }
      }

      // Check backpressure
      const backpressure = stryMutAct_9fa48("112923") ? this.records.length < this.highWaterMark : stryMutAct_9fa48("112922") ? this.records.length > this.highWaterMark : stryMutAct_9fa48("112921") ? false : stryMutAct_9fa48("112920") ? true : (stryCov_9fa48("112920", "112921", "112922", "112923"), this.records.length >= this.highWaterMark);
      if (stryMutAct_9fa48("112926") ? backpressure || this.state === EMIT_QUEUE_STATE.ACCEPTING : stryMutAct_9fa48("112925") ? false : stryMutAct_9fa48("112924") ? true : (stryCov_9fa48("112924", "112925", "112926"), backpressure && (stryMutAct_9fa48("112928") ? this.state !== EMIT_QUEUE_STATE.ACCEPTING : stryMutAct_9fa48("112927") ? true : (stryCov_9fa48("112927", "112928"), this.state === EMIT_QUEUE_STATE.ACCEPTING)))) {
        if (stryMutAct_9fa48("112929")) {
          {}
        } else {
          stryCov_9fa48("112929");
          this.state = EMIT_QUEUE_STATE.BACKPRESSURE;
        }
      }

      // Report telemetry
      if (stryMutAct_9fa48("112932") ? typeof this.onTelemetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("112931") ? false : stryMutAct_9fa48("112930") ? true : (stryCov_9fa48("112930", "112931", "112932"), typeof this.onTelemetry === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("112933")) {
          {}
        } else {
          stryCov_9fa48("112933");
          this.onTelemetry(stryMutAct_9fa48("112934") ? {} : (stryCov_9fa48("112934"), {
            primitive: PRIMITIVE_TYPE.EMIT,
            recordBytes,
            totalBytes: this.totalBytes,
            totalRecords: this.totalRecords,
            queueSize: this.records.length,
            state: this.state
          }));
        }
      }
      return stryMutAct_9fa48("112935") ? {} : (stryCov_9fa48("112935"), {
        [EMIT_FIELD.BYTE_COUNT]: recordBytes,
        [EMIT_FIELD.QUEUE_SIZE]: this.records.length,
        [EMIT_FIELD.SPILLED]: stryMutAct_9fa48("112939") ? this.spillCount <= NUM.ZERO : stryMutAct_9fa48("112938") ? this.spillCount >= NUM.ZERO : stryMutAct_9fa48("112937") ? false : stryMutAct_9fa48("112936") ? true : (stryCov_9fa48("112936", "112937", "112938", "112939"), this.spillCount > NUM.ZERO),
        [EMIT_FIELD.BACKPRESSURE]: backpressure
      });
    }
  }

  /**
   * Drain all buffered records.
   *
   * @return {Array<Object>} Buffered records.
   */
  drain() {
    if (stryMutAct_9fa48("112940")) {
      {}
    } else {
      stryCov_9fa48("112940");
      const drained = this.records;
      this.records = stryMutAct_9fa48("112941") ? ["Stryker was here"] : (stryCov_9fa48("112941"), []);
      return drained;
    }
  }

  /**
   * Close the buffer. No more records can be emitted.
   *
   * @return {{totalBytes: number, totalRecords: number,
   *   spillCount: number, state: string}} Final summary.
   */
  close() {
    if (stryMutAct_9fa48("112942")) {
      {}
    } else {
      stryCov_9fa48("112942");
      this.state = EMIT_QUEUE_STATE.CLOSED;
      return stryMutAct_9fa48("112943") ? {} : (stryCov_9fa48("112943"), {
        totalBytes: this.totalBytes,
        totalRecords: this.totalRecords,
        spillCount: this.spillCount,
        state: this.state
      });
    }
  }

  /**
   * Spill buffered records to disk via the onSpill callback.
   *
   * @return {Promise<void>}
   * @private
   */
  async _spill() {
    if (stryMutAct_9fa48("112944")) {
      {}
    } else {
      stryCov_9fa48("112944");
      if (stryMutAct_9fa48("112947") ? false : stryMutAct_9fa48("112946") ? true : stryMutAct_9fa48("112945") ? this.onSpill : (stryCov_9fa48("112945", "112946", "112947"), !this.onSpill)) return;
      const prevState = this.state;
      this.state = EMIT_QUEUE_STATE.SPILLING;
      const toSpill = this.records;
      this.records = stryMutAct_9fa48("112948") ? ["Stryker was here"] : (stryCov_9fa48("112948"), []);
      stryMutAct_9fa48("112949") ? this.spillCount -= NUM.ONE : (stryCov_9fa48("112949"), this.spillCount += NUM.ONE);
      await this.onSpill(toSpill);

      // Restore to accepting if not closed
      if (stryMutAct_9fa48("112952") ? this.state !== EMIT_QUEUE_STATE.SPILLING : stryMutAct_9fa48("112951") ? false : stryMutAct_9fa48("112950") ? true : (stryCov_9fa48("112950", "112951", "112952"), this.state === EMIT_QUEUE_STATE.SPILLING)) {
        if (stryMutAct_9fa48("112953")) {
          {}
        } else {
          stryCov_9fa48("112953");
          this.state = (stryMutAct_9fa48("112956") ? prevState !== EMIT_QUEUE_STATE.CLOSED : stryMutAct_9fa48("112955") ? false : stryMutAct_9fa48("112954") ? true : (stryCov_9fa48("112954", "112955", "112956"), prevState === EMIT_QUEUE_STATE.CLOSED)) ? EMIT_QUEUE_STATE.CLOSED : EMIT_QUEUE_STATE.ACCEPTING;
        }
      }
    }
  }
}
export { validateEmitArgs, computeEmitRecordBytes, ShuffleBuffer };