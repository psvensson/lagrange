/**
 * BudgetEnforcer — tracks resource usage and enforces
 * per-query budget limits for CPU, memory, wall time,
 * and primitive byte/key counts.
 *
 * Requirements: 9.1, 9.4
 * @module query/budget-enforcer
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
import { NUM } from '../constants/index.js';
import { QUERY_CPU_TIME_LIMIT_MS, QUERY_MEMORY_LIMIT_BYTES, QUERY_WALL_TIME_LIMIT_MS, LOOKUP_MAX_KEYS, LOOKUP_MAX_BYTES, EMIT_MAX_BYTES, BROADCAST_MAX_PAYLOAD_BYTES, OUT_MAX_BYTES, NESTED_MAX_CALLS, NESTED_MAX_KEYS, NESTED_MAX_BYTES, MAX_INFLIGHT, QB_FIELD } from '../wasm-service/query-budget-constants.js';
import { GUARDRAIL_ERROR_MSG as ERR } from './guardrail-constants.js';
import { BudgetLimitError, BUDGET_CATEGORY } from './budget-limit-error.js';

/**
 * Enforces resource budgets for a single query execution.
 * Accumulates usage and throws typed BudgetLimitError when
 * any limit is exceeded. Once terminated, rejects all further
 * recording attempts.
 *
 * Requirement 9.4: IF any budget is exceeded, THEN THE System
 * SHALL terminate the operation and return a descriptive limit
 * error.
 */
class BudgetEnforcer {
  /**
   * @param {Object} [budget] - Budget limits. Missing fields
   *   use defaults from query-budget-constants.
   */
  constructor(budget = {}) {
    if (stryMutAct_9fa48("108790")) {
      {}
    } else {
      stryCov_9fa48("108790");
      this._limits = stryMutAct_9fa48("108791") ? {} : (stryCov_9fa48("108791"), {
        cpuTimeMs: stryMutAct_9fa48("108792") ? budget[QB_FIELD.CPU_TIME_LIMIT_MS] && QUERY_CPU_TIME_LIMIT_MS : (stryCov_9fa48("108792"), budget[QB_FIELD.CPU_TIME_LIMIT_MS] ?? QUERY_CPU_TIME_LIMIT_MS),
        memoryBytes: stryMutAct_9fa48("108793") ? budget[QB_FIELD.MEMORY_LIMIT_BYTES] && QUERY_MEMORY_LIMIT_BYTES : (stryCov_9fa48("108793"), budget[QB_FIELD.MEMORY_LIMIT_BYTES] ?? QUERY_MEMORY_LIMIT_BYTES),
        wallTimeMs: stryMutAct_9fa48("108794") ? budget[QB_FIELD.WALL_TIME_LIMIT_MS] && QUERY_WALL_TIME_LIMIT_MS : (stryCov_9fa48("108794"), budget[QB_FIELD.WALL_TIME_LIMIT_MS] ?? QUERY_WALL_TIME_LIMIT_MS),
        lookupKeys: stryMutAct_9fa48("108795") ? budget[QB_FIELD.LOOKUP_MAX_KEYS] && LOOKUP_MAX_KEYS : (stryCov_9fa48("108795"), budget[QB_FIELD.LOOKUP_MAX_KEYS] ?? LOOKUP_MAX_KEYS),
        lookupBytes: stryMutAct_9fa48("108796") ? budget[QB_FIELD.LOOKUP_MAX_BYTES] && LOOKUP_MAX_BYTES : (stryCov_9fa48("108796"), budget[QB_FIELD.LOOKUP_MAX_BYTES] ?? LOOKUP_MAX_BYTES),
        emitBytes: stryMutAct_9fa48("108797") ? budget[QB_FIELD.EMIT_MAX_BYTES] && EMIT_MAX_BYTES : (stryCov_9fa48("108797"), budget[QB_FIELD.EMIT_MAX_BYTES] ?? EMIT_MAX_BYTES),
        broadcastBytes: stryMutAct_9fa48("108798") ? budget[QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES] && BROADCAST_MAX_PAYLOAD_BYTES : (stryCov_9fa48("108798"), budget[QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES] ?? BROADCAST_MAX_PAYLOAD_BYTES),
        outBytes: stryMutAct_9fa48("108799") ? budget[QB_FIELD.OUT_MAX_BYTES] && OUT_MAX_BYTES : (stryCov_9fa48("108799"), budget[QB_FIELD.OUT_MAX_BYTES] ?? OUT_MAX_BYTES),
        nestedCalls: stryMutAct_9fa48("108800") ? budget[QB_FIELD.NESTED_MAX_CALLS] && NESTED_MAX_CALLS : (stryCov_9fa48("108800"), budget[QB_FIELD.NESTED_MAX_CALLS] ?? NESTED_MAX_CALLS),
        nestedKeys: stryMutAct_9fa48("108801") ? budget[QB_FIELD.NESTED_MAX_KEYS] && NESTED_MAX_KEYS : (stryCov_9fa48("108801"), budget[QB_FIELD.NESTED_MAX_KEYS] ?? NESTED_MAX_KEYS),
        nestedBytes: stryMutAct_9fa48("108802") ? budget[QB_FIELD.NESTED_MAX_BYTES] && NESTED_MAX_BYTES : (stryCov_9fa48("108802"), budget[QB_FIELD.NESTED_MAX_BYTES] ?? NESTED_MAX_BYTES),
        inflight: stryMutAct_9fa48("108803") ? budget[QB_FIELD.MAX_INFLIGHT] && MAX_INFLIGHT : (stryCov_9fa48("108803"), budget[QB_FIELD.MAX_INFLIGHT] ?? MAX_INFLIGHT)
      });
      this._usage = stryMutAct_9fa48("108804") ? {} : (stryCov_9fa48("108804"), {
        cpuTimeMs: NUM.ZERO,
        memoryBytes: NUM.ZERO,
        wallStart: Date.now(),
        lookupKeys: NUM.ZERO,
        lookupBytes: NUM.ZERO,
        emitBytes: NUM.ZERO,
        broadcastBytes: NUM.ZERO,
        outBytes: NUM.ZERO,
        nestedCalls: NUM.ZERO,
        nestedKeys: NUM.ZERO,
        nestedBytes: NUM.ZERO,
        inflight: NUM.ZERO
      });
      this._terminated = stryMutAct_9fa48("108805") ? true : (stryCov_9fa48("108805"), false);
    }
  }

  /**
   * Record CPU time consumed.
   * @param {number} ms - Milliseconds of CPU time.
   * @throws {BudgetLimitError} If CPU time budget is exceeded.
   */
  recordCpuTime(ms) {
    if (stryMutAct_9fa48("108806")) {
      {}
    } else {
      stryCov_9fa48("108806");
      this._guardTerminated();
      stryMutAct_9fa48("108807") ? this._usage.cpuTimeMs -= ms : (stryCov_9fa48("108807"), this._usage.cpuTimeMs += ms);
      if (stryMutAct_9fa48("108811") ? this._usage.cpuTimeMs <= this._limits.cpuTimeMs : stryMutAct_9fa48("108810") ? this._usage.cpuTimeMs >= this._limits.cpuTimeMs : stryMutAct_9fa48("108809") ? false : stryMutAct_9fa48("108808") ? true : (stryCov_9fa48("108808", "108809", "108810", "108811"), this._usage.cpuTimeMs > this._limits.cpuTimeMs)) {
        if (stryMutAct_9fa48("108812")) {
          {}
        } else {
          stryCov_9fa48("108812");
          this._terminate();
          throw new BudgetLimitError(ERR.CPU_TIME_EXCEEDED, stryMutAct_9fa48("108813") ? {} : (stryCov_9fa48("108813"), {
            category: BUDGET_CATEGORY.CPU_TIME,
            limit: this._limits.cpuTimeMs,
            usage: this._usage.cpuTimeMs
          }));
        }
      }
    }
  }

  /**
   * Record memory consumed.
   * @param {number} bytes - Bytes of memory.
   * @throws {BudgetLimitError} If memory budget is exceeded.
   */
  recordMemory(bytes) {
    if (stryMutAct_9fa48("108814")) {
      {}
    } else {
      stryCov_9fa48("108814");
      this._guardTerminated();
      stryMutAct_9fa48("108815") ? this._usage.memoryBytes -= bytes : (stryCov_9fa48("108815"), this._usage.memoryBytes += bytes);
      if (stryMutAct_9fa48("108819") ? this._usage.memoryBytes <= this._limits.memoryBytes : stryMutAct_9fa48("108818") ? this._usage.memoryBytes >= this._limits.memoryBytes : stryMutAct_9fa48("108817") ? false : stryMutAct_9fa48("108816") ? true : (stryCov_9fa48("108816", "108817", "108818", "108819"), this._usage.memoryBytes > this._limits.memoryBytes)) {
        if (stryMutAct_9fa48("108820")) {
          {}
        } else {
          stryCov_9fa48("108820");
          this._terminate();
          throw new BudgetLimitError(ERR.MEMORY_EXCEEDED, stryMutAct_9fa48("108821") ? {} : (stryCov_9fa48("108821"), {
            category: BUDGET_CATEGORY.MEMORY,
            limit: this._limits.memoryBytes,
            usage: this._usage.memoryBytes
          }));
        }
      }
    }
  }

  /**
   * Check wall time against limit.
   * @throws {BudgetLimitError} If wall time budget is exceeded.
   */
  checkWallTime() {
    if (stryMutAct_9fa48("108822")) {
      {}
    } else {
      stryCov_9fa48("108822");
      this._guardTerminated();
      const elapsed = stryMutAct_9fa48("108823") ? Date.now() + this._usage.wallStart : (stryCov_9fa48("108823"), Date.now() - this._usage.wallStart);
      if (stryMutAct_9fa48("108827") ? elapsed <= this._limits.wallTimeMs : stryMutAct_9fa48("108826") ? elapsed >= this._limits.wallTimeMs : stryMutAct_9fa48("108825") ? false : stryMutAct_9fa48("108824") ? true : (stryCov_9fa48("108824", "108825", "108826", "108827"), elapsed > this._limits.wallTimeMs)) {
        if (stryMutAct_9fa48("108828")) {
          {}
        } else {
          stryCov_9fa48("108828");
          this._terminate();
          throw new BudgetLimitError(ERR.WALL_TIME_EXCEEDED, stryMutAct_9fa48("108829") ? {} : (stryCov_9fa48("108829"), {
            category: BUDGET_CATEGORY.WALL_TIME,
            limit: this._limits.wallTimeMs,
            usage: elapsed
          }));
        }
      }
    }
  }

  /**
   * Record lookup keys used.
   * @param {number} count - Number of keys.
   * @throws {BudgetLimitError} If lookup key budget is exceeded.
   */
  recordLookupKeys(count) {
    if (stryMutAct_9fa48("108830")) {
      {}
    } else {
      stryCov_9fa48("108830");
      this._guardTerminated();
      stryMutAct_9fa48("108831") ? this._usage.lookupKeys -= count : (stryCov_9fa48("108831"), this._usage.lookupKeys += count);
      if (stryMutAct_9fa48("108835") ? this._usage.lookupKeys <= this._limits.lookupKeys : stryMutAct_9fa48("108834") ? this._usage.lookupKeys >= this._limits.lookupKeys : stryMutAct_9fa48("108833") ? false : stryMutAct_9fa48("108832") ? true : (stryCov_9fa48("108832", "108833", "108834", "108835"), this._usage.lookupKeys > this._limits.lookupKeys)) {
        if (stryMutAct_9fa48("108836")) {
          {}
        } else {
          stryCov_9fa48("108836");
          this._terminate();
          throw new BudgetLimitError(ERR.LOOKUP_KEYS_EXCEEDED, stryMutAct_9fa48("108837") ? {} : (stryCov_9fa48("108837"), {
            category: BUDGET_CATEGORY.LOOKUP_KEYS,
            limit: this._limits.lookupKeys,
            usage: this._usage.lookupKeys
          }));
        }
      }
    }
  }

  /**
   * Record lookup bytes used.
   * @param {number} bytes - Bytes consumed.
   * @throws {BudgetLimitError} If lookup byte budget is exceeded.
   */
  recordLookupBytes(bytes) {
    if (stryMutAct_9fa48("108838")) {
      {}
    } else {
      stryCov_9fa48("108838");
      this._guardTerminated();
      stryMutAct_9fa48("108839") ? this._usage.lookupBytes -= bytes : (stryCov_9fa48("108839"), this._usage.lookupBytes += bytes);
      if (stryMutAct_9fa48("108843") ? this._usage.lookupBytes <= this._limits.lookupBytes : stryMutAct_9fa48("108842") ? this._usage.lookupBytes >= this._limits.lookupBytes : stryMutAct_9fa48("108841") ? false : stryMutAct_9fa48("108840") ? true : (stryCov_9fa48("108840", "108841", "108842", "108843"), this._usage.lookupBytes > this._limits.lookupBytes)) {
        if (stryMutAct_9fa48("108844")) {
          {}
        } else {
          stryCov_9fa48("108844");
          this._terminate();
          throw new BudgetLimitError(ERR.LOOKUP_BYTES_EXCEEDED, stryMutAct_9fa48("108845") ? {} : (stryCov_9fa48("108845"), {
            category: BUDGET_CATEGORY.LOOKUP_BYTES,
            limit: this._limits.lookupBytes,
            usage: this._usage.lookupBytes
          }));
        }
      }
    }
  }

  /**
   * Record emit bytes used.
   * @param {number} bytes - Bytes emitted.
   * @throws {BudgetLimitError} If emit byte budget is exceeded.
   */
  recordEmitBytes(bytes) {
    if (stryMutAct_9fa48("108846")) {
      {}
    } else {
      stryCov_9fa48("108846");
      this._guardTerminated();
      stryMutAct_9fa48("108847") ? this._usage.emitBytes -= bytes : (stryCov_9fa48("108847"), this._usage.emitBytes += bytes);
      if (stryMutAct_9fa48("108851") ? this._usage.emitBytes <= this._limits.emitBytes : stryMutAct_9fa48("108850") ? this._usage.emitBytes >= this._limits.emitBytes : stryMutAct_9fa48("108849") ? false : stryMutAct_9fa48("108848") ? true : (stryCov_9fa48("108848", "108849", "108850", "108851"), this._usage.emitBytes > this._limits.emitBytes)) {
        if (stryMutAct_9fa48("108852")) {
          {}
        } else {
          stryCov_9fa48("108852");
          this._terminate();
          throw new BudgetLimitError(ERR.EMIT_BYTES_EXCEEDED, stryMutAct_9fa48("108853") ? {} : (stryCov_9fa48("108853"), {
            category: BUDGET_CATEGORY.EMIT_BYTES,
            limit: this._limits.emitBytes,
            usage: this._usage.emitBytes
          }));
        }
      }
    }
  }

  /**
   * Record broadcast bytes used.
   * @param {number} bytes - Bytes broadcast.
   * @throws {BudgetLimitError} If broadcast byte budget is
   *   exceeded.
   */
  recordBroadcastBytes(bytes) {
    if (stryMutAct_9fa48("108854")) {
      {}
    } else {
      stryCov_9fa48("108854");
      this._guardTerminated();
      stryMutAct_9fa48("108855") ? this._usage.broadcastBytes -= bytes : (stryCov_9fa48("108855"), this._usage.broadcastBytes += bytes);
      if (stryMutAct_9fa48("108859") ? this._usage.broadcastBytes <= this._limits.broadcastBytes : stryMutAct_9fa48("108858") ? this._usage.broadcastBytes >= this._limits.broadcastBytes : stryMutAct_9fa48("108857") ? false : stryMutAct_9fa48("108856") ? true : (stryCov_9fa48("108856", "108857", "108858", "108859"), this._usage.broadcastBytes > this._limits.broadcastBytes)) {
        if (stryMutAct_9fa48("108860")) {
          {}
        } else {
          stryCov_9fa48("108860");
          this._terminate();
          throw new BudgetLimitError(ERR.BROADCAST_BYTES_EXCEEDED, stryMutAct_9fa48("108861") ? {} : (stryCov_9fa48("108861"), {
            category: BUDGET_CATEGORY.BROADCAST_BYTES,
            limit: this._limits.broadcastBytes,
            usage: this._usage.broadcastBytes
          }));
        }
      }
    }
  }

  /**
   * Record output bytes written via ctx.out.
   * @param {number} bytes - Bytes output.
   * @throws {BudgetLimitError} If output byte budget is
   *   exceeded.
   */
  recordOutBytes(bytes) {
    if (stryMutAct_9fa48("108862")) {
      {}
    } else {
      stryCov_9fa48("108862");
      this._guardTerminated();
      stryMutAct_9fa48("108863") ? this._usage.outBytes -= bytes : (stryCov_9fa48("108863"), this._usage.outBytes += bytes);
      if (stryMutAct_9fa48("108867") ? this._usage.outBytes <= this._limits.outBytes : stryMutAct_9fa48("108866") ? this._usage.outBytes >= this._limits.outBytes : stryMutAct_9fa48("108865") ? false : stryMutAct_9fa48("108864") ? true : (stryCov_9fa48("108864", "108865", "108866", "108867"), this._usage.outBytes > this._limits.outBytes)) {
        if (stryMutAct_9fa48("108868")) {
          {}
        } else {
          stryCov_9fa48("108868");
          this._terminate();
          throw new BudgetLimitError(ERR.OUT_BYTES_EXCEEDED, stryMutAct_9fa48("108869") ? {} : (stryCov_9fa48("108869"), {
            category: BUDGET_CATEGORY.OUT_BYTES,
            limit: this._limits.outBytes,
            usage: this._usage.outBytes
          }));
        }
      }
    }
  }

  /**
   * Record a nested ctx.call invocation in a stage handler.
   * @throws {BudgetLimitError} If nested call count budget
   *   is exceeded.
   */
  recordNestedCall() {
    if (stryMutAct_9fa48("108870")) {
      {}
    } else {
      stryCov_9fa48("108870");
      this._guardTerminated();
      stryMutAct_9fa48("108871") ? this._usage.nestedCalls -= NUM.ONE : (stryCov_9fa48("108871"), this._usage.nestedCalls += NUM.ONE);
      if (stryMutAct_9fa48("108875") ? this._usage.nestedCalls <= this._limits.nestedCalls : stryMutAct_9fa48("108874") ? this._usage.nestedCalls >= this._limits.nestedCalls : stryMutAct_9fa48("108873") ? false : stryMutAct_9fa48("108872") ? true : (stryCov_9fa48("108872", "108873", "108874", "108875"), this._usage.nestedCalls > this._limits.nestedCalls)) {
        if (stryMutAct_9fa48("108876")) {
          {}
        } else {
          stryCov_9fa48("108876");
          this._terminate();
          throw new BudgetLimitError(ERR.NESTED_CALLS_EXCEEDED, stryMutAct_9fa48("108877") ? {} : (stryCov_9fa48("108877"), {
            category: BUDGET_CATEGORY.NESTED_CALLS,
            limit: this._limits.nestedCalls,
            usage: this._usage.nestedCalls
          }));
        }
      }
    }
  }

  /**
   * Record keys accessed in nested calls.
   * @param {number} count - Number of keys accessed.
   * @throws {BudgetLimitError} If nested key count budget
   *   is exceeded.
   */
  recordNestedKeys(count) {
    if (stryMutAct_9fa48("108878")) {
      {}
    } else {
      stryCov_9fa48("108878");
      this._guardTerminated();
      stryMutAct_9fa48("108879") ? this._usage.nestedKeys -= count : (stryCov_9fa48("108879"), this._usage.nestedKeys += count);
      if (stryMutAct_9fa48("108883") ? this._usage.nestedKeys <= this._limits.nestedKeys : stryMutAct_9fa48("108882") ? this._usage.nestedKeys >= this._limits.nestedKeys : stryMutAct_9fa48("108881") ? false : stryMutAct_9fa48("108880") ? true : (stryCov_9fa48("108880", "108881", "108882", "108883"), this._usage.nestedKeys > this._limits.nestedKeys)) {
        if (stryMutAct_9fa48("108884")) {
          {}
        } else {
          stryCov_9fa48("108884");
          this._terminate();
          throw new BudgetLimitError(ERR.NESTED_KEYS_EXCEEDED, stryMutAct_9fa48("108885") ? {} : (stryCov_9fa48("108885"), {
            category: BUDGET_CATEGORY.NESTED_KEYS,
            limit: this._limits.nestedKeys,
            usage: this._usage.nestedKeys
          }));
        }
      }
    }
  }

  /**
   * Record bytes returned from nested calls.
   * @param {number} bytes - Bytes returned.
   * @throws {BudgetLimitError} If nested byte budget is
   *   exceeded.
   */
  recordNestedBytes(bytes) {
    if (stryMutAct_9fa48("108886")) {
      {}
    } else {
      stryCov_9fa48("108886");
      this._guardTerminated();
      stryMutAct_9fa48("108887") ? this._usage.nestedBytes -= bytes : (stryCov_9fa48("108887"), this._usage.nestedBytes += bytes);
      if (stryMutAct_9fa48("108891") ? this._usage.nestedBytes <= this._limits.nestedBytes : stryMutAct_9fa48("108890") ? this._usage.nestedBytes >= this._limits.nestedBytes : stryMutAct_9fa48("108889") ? false : stryMutAct_9fa48("108888") ? true : (stryCov_9fa48("108888", "108889", "108890", "108891"), this._usage.nestedBytes > this._limits.nestedBytes)) {
        if (stryMutAct_9fa48("108892")) {
          {}
        } else {
          stryCov_9fa48("108892");
          this._terminate();
          throw new BudgetLimitError(ERR.NESTED_BYTES_EXCEEDED, stryMutAct_9fa48("108893") ? {} : (stryCov_9fa48("108893"), {
            category: BUDGET_CATEGORY.NESTED_BYTES,
            limit: this._limits.nestedBytes,
            usage: this._usage.nestedBytes
          }));
        }
      }
    }
  }

  /**
   * Increment the inflight nested operation counter.
   * @throws {BudgetLimitError} If max inflight is exceeded.
   */
  incrementInflight() {
    if (stryMutAct_9fa48("108894")) {
      {}
    } else {
      stryCov_9fa48("108894");
      this._guardTerminated();
      stryMutAct_9fa48("108895") ? this._usage.inflight -= NUM.ONE : (stryCov_9fa48("108895"), this._usage.inflight += NUM.ONE);
      if (stryMutAct_9fa48("108899") ? this._usage.inflight <= this._limits.inflight : stryMutAct_9fa48("108898") ? this._usage.inflight >= this._limits.inflight : stryMutAct_9fa48("108897") ? false : stryMutAct_9fa48("108896") ? true : (stryCov_9fa48("108896", "108897", "108898", "108899"), this._usage.inflight > this._limits.inflight)) {
        if (stryMutAct_9fa48("108900")) {
          {}
        } else {
          stryCov_9fa48("108900");
          stryMutAct_9fa48("108901") ? this._usage.inflight += NUM.ONE : (stryCov_9fa48("108901"), this._usage.inflight -= NUM.ONE);
          this._terminate();
          throw new BudgetLimitError(ERR.INFLIGHT_EXCEEDED, stryMutAct_9fa48("108902") ? {} : (stryCov_9fa48("108902"), {
            category: BUDGET_CATEGORY.INFLIGHT,
            limit: this._limits.inflight,
            usage: stryMutAct_9fa48("108903") ? this._usage.inflight - NUM.ONE : (stryCov_9fa48("108903"), this._usage.inflight + NUM.ONE)
          }));
        }
      }
    }
  }

  /**
   * Decrement the inflight nested operation counter.
   * Does not throw; safe to call in finally blocks.
   */
  decrementInflight() {
    if (stryMutAct_9fa48("108904")) {
      {}
    } else {
      stryCov_9fa48("108904");
      if (stryMutAct_9fa48("108908") ? this._usage.inflight <= NUM.ZERO : stryMutAct_9fa48("108907") ? this._usage.inflight >= NUM.ZERO : stryMutAct_9fa48("108906") ? false : stryMutAct_9fa48("108905") ? true : (stryCov_9fa48("108905", "108906", "108907", "108908"), this._usage.inflight > NUM.ZERO)) {
        if (stryMutAct_9fa48("108909")) {
          {}
        } else {
          stryCov_9fa48("108909");
          stryMutAct_9fa48("108910") ? this._usage.inflight += NUM.ONE : (stryCov_9fa48("108910"), this._usage.inflight -= NUM.ONE);
        }
      }
    }
  }

  /**
   * Return current usage snapshot.
   * @return {Object} Usage object with all tracked values.
   */
  getUsage() {
    if (stryMutAct_9fa48("108911")) {
      {}
    } else {
      stryCov_9fa48("108911");
      return stryMutAct_9fa48("108912") ? {} : (stryCov_9fa48("108912"), {
        ...this._usage
      });
    }
  }

  /**
   * Whether the enforcer has been terminated due to a budget
   * violation.
   * @return {boolean} True if terminated.
   */
  isTerminated() {
    if (stryMutAct_9fa48("108913")) {
      {}
    } else {
      stryCov_9fa48("108913");
      return this._terminated;
    }
  }

  /**
   * Check if any limit is exceeded without throwing.
   * @return {boolean} True if any limit is exceeded.
   */
  isExceeded() {
    if (stryMutAct_9fa48("108914")) {
      {}
    } else {
      stryCov_9fa48("108914");
      const elapsed = stryMutAct_9fa48("108915") ? Date.now() + this._usage.wallStart : (stryCov_9fa48("108915"), Date.now() - this._usage.wallStart);
      return stryMutAct_9fa48("108918") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes || this._usage.broadcastBytes > this._limits.broadcastBytes || this._usage.outBytes > this._limits.outBytes || this._usage.nestedCalls > this._limits.nestedCalls || this._usage.nestedKeys > this._limits.nestedKeys || this._usage.nestedBytes > this._limits.nestedBytes) && this._usage.inflight > this._limits.inflight : stryMutAct_9fa48("108917") ? false : stryMutAct_9fa48("108916") ? true : (stryCov_9fa48("108916", "108917", "108918"), (stryMutAct_9fa48("108920") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes || this._usage.broadcastBytes > this._limits.broadcastBytes || this._usage.outBytes > this._limits.outBytes || this._usage.nestedCalls > this._limits.nestedCalls || this._usage.nestedKeys > this._limits.nestedKeys) && this._usage.nestedBytes > this._limits.nestedBytes : stryMutAct_9fa48("108919") ? false : (stryCov_9fa48("108919", "108920"), (stryMutAct_9fa48("108922") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes || this._usage.broadcastBytes > this._limits.broadcastBytes || this._usage.outBytes > this._limits.outBytes || this._usage.nestedCalls > this._limits.nestedCalls) && this._usage.nestedKeys > this._limits.nestedKeys : stryMutAct_9fa48("108921") ? false : (stryCov_9fa48("108921", "108922"), (stryMutAct_9fa48("108924") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes || this._usage.broadcastBytes > this._limits.broadcastBytes || this._usage.outBytes > this._limits.outBytes) && this._usage.nestedCalls > this._limits.nestedCalls : stryMutAct_9fa48("108923") ? false : (stryCov_9fa48("108923", "108924"), (stryMutAct_9fa48("108926") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes || this._usage.broadcastBytes > this._limits.broadcastBytes) && this._usage.outBytes > this._limits.outBytes : stryMutAct_9fa48("108925") ? false : (stryCov_9fa48("108925", "108926"), (stryMutAct_9fa48("108928") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes || this._usage.emitBytes > this._limits.emitBytes) && this._usage.broadcastBytes > this._limits.broadcastBytes : stryMutAct_9fa48("108927") ? false : (stryCov_9fa48("108927", "108928"), (stryMutAct_9fa48("108930") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys || this._usage.lookupBytes > this._limits.lookupBytes) && this._usage.emitBytes > this._limits.emitBytes : stryMutAct_9fa48("108929") ? false : (stryCov_9fa48("108929", "108930"), (stryMutAct_9fa48("108932") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs || this._usage.lookupKeys > this._limits.lookupKeys) && this._usage.lookupBytes > this._limits.lookupBytes : stryMutAct_9fa48("108931") ? false : (stryCov_9fa48("108931", "108932"), (stryMutAct_9fa48("108934") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes || elapsed > this._limits.wallTimeMs) && this._usage.lookupKeys > this._limits.lookupKeys : stryMutAct_9fa48("108933") ? false : (stryCov_9fa48("108933", "108934"), (stryMutAct_9fa48("108936") ? (this._usage.cpuTimeMs > this._limits.cpuTimeMs || this._usage.memoryBytes > this._limits.memoryBytes) && elapsed > this._limits.wallTimeMs : stryMutAct_9fa48("108935") ? false : (stryCov_9fa48("108935", "108936"), (stryMutAct_9fa48("108938") ? this._usage.cpuTimeMs > this._limits.cpuTimeMs && this._usage.memoryBytes > this._limits.memoryBytes : stryMutAct_9fa48("108937") ? false : (stryCov_9fa48("108937", "108938"), (stryMutAct_9fa48("108941") ? this._usage.cpuTimeMs <= this._limits.cpuTimeMs : stryMutAct_9fa48("108940") ? this._usage.cpuTimeMs >= this._limits.cpuTimeMs : stryMutAct_9fa48("108939") ? false : (stryCov_9fa48("108939", "108940", "108941"), this._usage.cpuTimeMs > this._limits.cpuTimeMs)) || (stryMutAct_9fa48("108944") ? this._usage.memoryBytes <= this._limits.memoryBytes : stryMutAct_9fa48("108943") ? this._usage.memoryBytes >= this._limits.memoryBytes : stryMutAct_9fa48("108942") ? false : (stryCov_9fa48("108942", "108943", "108944"), this._usage.memoryBytes > this._limits.memoryBytes)))) || (stryMutAct_9fa48("108947") ? elapsed <= this._limits.wallTimeMs : stryMutAct_9fa48("108946") ? elapsed >= this._limits.wallTimeMs : stryMutAct_9fa48("108945") ? false : (stryCov_9fa48("108945", "108946", "108947"), elapsed > this._limits.wallTimeMs)))) || (stryMutAct_9fa48("108950") ? this._usage.lookupKeys <= this._limits.lookupKeys : stryMutAct_9fa48("108949") ? this._usage.lookupKeys >= this._limits.lookupKeys : stryMutAct_9fa48("108948") ? false : (stryCov_9fa48("108948", "108949", "108950"), this._usage.lookupKeys > this._limits.lookupKeys)))) || (stryMutAct_9fa48("108953") ? this._usage.lookupBytes <= this._limits.lookupBytes : stryMutAct_9fa48("108952") ? this._usage.lookupBytes >= this._limits.lookupBytes : stryMutAct_9fa48("108951") ? false : (stryCov_9fa48("108951", "108952", "108953"), this._usage.lookupBytes > this._limits.lookupBytes)))) || (stryMutAct_9fa48("108956") ? this._usage.emitBytes <= this._limits.emitBytes : stryMutAct_9fa48("108955") ? this._usage.emitBytes >= this._limits.emitBytes : stryMutAct_9fa48("108954") ? false : (stryCov_9fa48("108954", "108955", "108956"), this._usage.emitBytes > this._limits.emitBytes)))) || (stryMutAct_9fa48("108959") ? this._usage.broadcastBytes <= this._limits.broadcastBytes : stryMutAct_9fa48("108958") ? this._usage.broadcastBytes >= this._limits.broadcastBytes : stryMutAct_9fa48("108957") ? false : (stryCov_9fa48("108957", "108958", "108959"), this._usage.broadcastBytes > this._limits.broadcastBytes)))) || (stryMutAct_9fa48("108962") ? this._usage.outBytes <= this._limits.outBytes : stryMutAct_9fa48("108961") ? this._usage.outBytes >= this._limits.outBytes : stryMutAct_9fa48("108960") ? false : (stryCov_9fa48("108960", "108961", "108962"), this._usage.outBytes > this._limits.outBytes)))) || (stryMutAct_9fa48("108965") ? this._usage.nestedCalls <= this._limits.nestedCalls : stryMutAct_9fa48("108964") ? this._usage.nestedCalls >= this._limits.nestedCalls : stryMutAct_9fa48("108963") ? false : (stryCov_9fa48("108963", "108964", "108965"), this._usage.nestedCalls > this._limits.nestedCalls)))) || (stryMutAct_9fa48("108968") ? this._usage.nestedKeys <= this._limits.nestedKeys : stryMutAct_9fa48("108967") ? this._usage.nestedKeys >= this._limits.nestedKeys : stryMutAct_9fa48("108966") ? false : (stryCov_9fa48("108966", "108967", "108968"), this._usage.nestedKeys > this._limits.nestedKeys)))) || (stryMutAct_9fa48("108971") ? this._usage.nestedBytes <= this._limits.nestedBytes : stryMutAct_9fa48("108970") ? this._usage.nestedBytes >= this._limits.nestedBytes : stryMutAct_9fa48("108969") ? false : (stryCov_9fa48("108969", "108970", "108971"), this._usage.nestedBytes > this._limits.nestedBytes)))) || (stryMutAct_9fa48("108974") ? this._usage.inflight <= this._limits.inflight : stryMutAct_9fa48("108973") ? this._usage.inflight >= this._limits.inflight : stryMutAct_9fa48("108972") ? false : (stryCov_9fa48("108972", "108973", "108974"), this._usage.inflight > this._limits.inflight)));
    }
  }

  /**
   * Mark the enforcer as terminated. Once terminated, all
   * subsequent record* / check* calls throw immediately.
   * @private
   */
  _terminate() {
    if (stryMutAct_9fa48("108975")) {
      {}
    } else {
      stryCov_9fa48("108975");
      this._terminated = stryMutAct_9fa48("108976") ? false : (stryCov_9fa48("108976"), true);
    }
  }

  /**
   * Guard against recording after termination.
   * @throws {BudgetLimitError} If already terminated.
   * @private
   */
  _guardTerminated() {
    if (stryMutAct_9fa48("108977")) {
      {}
    } else {
      stryCov_9fa48("108977");
      if (stryMutAct_9fa48("108979") ? false : stryMutAct_9fa48("108978") ? true : (stryCov_9fa48("108978", "108979"), this._terminated)) {
        if (stryMutAct_9fa48("108980")) {
          {}
        } else {
          stryCov_9fa48("108980");
          throw new BudgetLimitError(ERR.OPERATION_TERMINATED, stryMutAct_9fa48("108981") ? {} : (stryCov_9fa48("108981"), {
            category: stryMutAct_9fa48("108982") ? "" : (stryCov_9fa48("108982"), 'terminated'),
            limit: NUM.ZERO,
            usage: NUM.ZERO
          }));
        }
      }
    }
  }
}
export { BudgetEnforcer };