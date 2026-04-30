/**
 * BudgetEnforcer — tracks resource usage and enforces
 * per-query budget limits for CPU, memory, wall time,
 * and primitive byte/key counts.
 *
 * Requirements: 9.1, 9.4
 * @module query/budget-enforcer
 */

import {NUM} from '../constants/index.js';
import {
  QUERY_CPU_TIME_LIMIT_MS,
  QUERY_MEMORY_LIMIT_BYTES,
  QUERY_WALL_TIME_LIMIT_MS,
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  OUT_MAX_BYTES,
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
  QB_FIELD,
} from '../wasm-service/query-budget-constants.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from './guardrail-constants.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from './budget-limit-error.js';

const LOCAL_STR_TERMINATED = 'terminated';

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
    this._limits = {
      cpuTimeMs: budget[QB_FIELD.CPU_TIME_LIMIT_MS] ??
        QUERY_CPU_TIME_LIMIT_MS,
      memoryBytes: budget[QB_FIELD.MEMORY_LIMIT_BYTES] ??
        QUERY_MEMORY_LIMIT_BYTES,
      wallTimeMs: budget[QB_FIELD.WALL_TIME_LIMIT_MS] ??
        QUERY_WALL_TIME_LIMIT_MS,
      lookupKeys: budget[QB_FIELD.LOOKUP_MAX_KEYS] ??
        LOOKUP_MAX_KEYS,
      lookupBytes: budget[QB_FIELD.LOOKUP_MAX_BYTES] ??
        LOOKUP_MAX_BYTES,
      emitBytes: budget[QB_FIELD.EMIT_MAX_BYTES] ??
        EMIT_MAX_BYTES,
      broadcastBytes:
        budget[QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES] ??
        BROADCAST_MAX_PAYLOAD_BYTES,
      outBytes: budget[QB_FIELD.OUT_MAX_BYTES] ??
        OUT_MAX_BYTES,
      nestedCalls: budget[QB_FIELD.NESTED_MAX_CALLS] ??
        NESTED_MAX_CALLS,
      nestedKeys: budget[QB_FIELD.NESTED_MAX_KEYS] ??
        NESTED_MAX_KEYS,
      nestedBytes: budget[QB_FIELD.NESTED_MAX_BYTES] ??
        NESTED_MAX_BYTES,
      inflight: budget[QB_FIELD.MAX_INFLIGHT] ??
        MAX_INFLIGHT,
    };

    this._usage = {
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
      inflight: NUM.ZERO,
    };

    this._terminated = false;
  }

  /**
   * Record CPU time consumed.
   * @param {number} ms - Milliseconds of CPU time.
   * @throws {BudgetLimitError} If CPU time budget is exceeded.
   */
  recordCpuTime(ms) {
    this._guardTerminated();
    this._usage.cpuTimeMs += ms;
    if (this._usage.cpuTimeMs > this._limits.cpuTimeMs) {
      this._terminate();
      throw new BudgetLimitError(ERR.CPU_TIME_EXCEEDED, {
        category: BUDGET_CATEGORY.CPU_TIME,
        limit: this._limits.cpuTimeMs,
        usage: this._usage.cpuTimeMs,
      });
    }
  }

  /**
   * Record memory consumed.
   * @param {number} bytes - Bytes of memory.
   * @throws {BudgetLimitError} If memory budget is exceeded.
   */
  recordMemory(bytes) {
    this._guardTerminated();
    this._usage.memoryBytes += bytes;
    if (this._usage.memoryBytes > this._limits.memoryBytes) {
      this._terminate();
      throw new BudgetLimitError(ERR.MEMORY_EXCEEDED, {
        category: BUDGET_CATEGORY.MEMORY,
        limit: this._limits.memoryBytes,
        usage: this._usage.memoryBytes,
      });
    }
  }

  /**
   * Check wall time against limit.
   * @throws {BudgetLimitError} If wall time budget is exceeded.
   */
  checkWallTime() {
    this._guardTerminated();
    const elapsed = Date.now() - this._usage.wallStart;
    if (elapsed > this._limits.wallTimeMs) {
      this._terminate();
      throw new BudgetLimitError(ERR.WALL_TIME_EXCEEDED, {
        category: BUDGET_CATEGORY.WALL_TIME,
        limit: this._limits.wallTimeMs,
        usage: elapsed,
      });
    }
  }

  /**
   * Record lookup keys used.
   * @param {number} count - Number of keys.
   * @throws {BudgetLimitError} If lookup key budget is exceeded.
   */
  recordLookupKeys(count) {
    this._guardTerminated();
    this._usage.lookupKeys += count;
    if (this._usage.lookupKeys > this._limits.lookupKeys) {
      this._terminate();
      throw new BudgetLimitError(ERR.LOOKUP_KEYS_EXCEEDED, {
        category: BUDGET_CATEGORY.LOOKUP_KEYS,
        limit: this._limits.lookupKeys,
        usage: this._usage.lookupKeys,
      });
    }
  }

  /**
   * Record lookup bytes used.
   * @param {number} bytes - Bytes consumed.
   * @throws {BudgetLimitError} If lookup byte budget is exceeded.
   */
  recordLookupBytes(bytes) {
    this._guardTerminated();
    this._usage.lookupBytes += bytes;
    if (this._usage.lookupBytes > this._limits.lookupBytes) {
      this._terminate();
      throw new BudgetLimitError(ERR.LOOKUP_BYTES_EXCEEDED, {
        category: BUDGET_CATEGORY.LOOKUP_BYTES,
        limit: this._limits.lookupBytes,
        usage: this._usage.lookupBytes,
      });
    }
  }

  /**
   * Record emit bytes used.
   * @param {number} bytes - Bytes emitted.
   * @throws {BudgetLimitError} If emit byte budget is exceeded.
   */
  recordEmitBytes(bytes) {
    this._guardTerminated();
    this._usage.emitBytes += bytes;
    if (this._usage.emitBytes > this._limits.emitBytes) {
      this._terminate();
      throw new BudgetLimitError(ERR.EMIT_BYTES_EXCEEDED, {
        category: BUDGET_CATEGORY.EMIT_BYTES,
        limit: this._limits.emitBytes,
        usage: this._usage.emitBytes,
      });
    }
  }

  /**
   * Record broadcast bytes used.
   * @param {number} bytes - Bytes broadcast.
   * @throws {BudgetLimitError} If broadcast byte budget is
   *   exceeded.
   */
  recordBroadcastBytes(bytes) {
    this._guardTerminated();
    this._usage.broadcastBytes += bytes;
    if (
      this._usage.broadcastBytes > this._limits.broadcastBytes
    ) {
      this._terminate();
      throw new BudgetLimitError(
        ERR.BROADCAST_BYTES_EXCEEDED,
        {
          category: BUDGET_CATEGORY.BROADCAST_BYTES,
          limit: this._limits.broadcastBytes,
          usage: this._usage.broadcastBytes,
        },
      );
    }
  }

  /**
   * Record output bytes written via ctx.out.
   * @param {number} bytes - Bytes output.
   * @throws {BudgetLimitError} If output byte budget is
   *   exceeded.
   */
  recordOutBytes(bytes) {
    this._guardTerminated();
    this._usage.outBytes += bytes;
    if (this._usage.outBytes > this._limits.outBytes) {
      this._terminate();
      throw new BudgetLimitError(
        ERR.OUT_BYTES_EXCEEDED,
        {
          category: BUDGET_CATEGORY.OUT_BYTES,
          limit: this._limits.outBytes,
          usage: this._usage.outBytes,
        },
      );
    }
  }

  /**
   * Record a nested ctx.call invocation in a stage handler.
   * @throws {BudgetLimitError} If nested call count budget
   *   is exceeded.
   */
  recordNestedCall() {
    this._guardTerminated();
    this._usage.nestedCalls += NUM.ONE;
    if (this._usage.nestedCalls > this._limits.nestedCalls) {
      this._terminate();
      throw new BudgetLimitError(
        ERR.NESTED_CALLS_EXCEEDED,
        {
          category: BUDGET_CATEGORY.NESTED_CALLS,
          limit: this._limits.nestedCalls,
          usage: this._usage.nestedCalls,
        },
      );
    }
  }

  /**
   * Record keys accessed in nested calls.
   * @param {number} count - Number of keys accessed.
   * @throws {BudgetLimitError} If nested key count budget
   *   is exceeded.
   */
  recordNestedKeys(count) {
    this._guardTerminated();
    this._usage.nestedKeys += count;
    if (this._usage.nestedKeys > this._limits.nestedKeys) {
      this._terminate();
      throw new BudgetLimitError(
        ERR.NESTED_KEYS_EXCEEDED,
        {
          category: BUDGET_CATEGORY.NESTED_KEYS,
          limit: this._limits.nestedKeys,
          usage: this._usage.nestedKeys,
        },
      );
    }
  }

  /**
   * Record bytes returned from nested calls.
   * @param {number} bytes - Bytes returned.
   * @throws {BudgetLimitError} If nested byte budget is
   *   exceeded.
   */
  recordNestedBytes(bytes) {
    this._guardTerminated();
    this._usage.nestedBytes += bytes;
    if (this._usage.nestedBytes > this._limits.nestedBytes) {
      this._terminate();
      throw new BudgetLimitError(
        ERR.NESTED_BYTES_EXCEEDED,
        {
          category: BUDGET_CATEGORY.NESTED_BYTES,
          limit: this._limits.nestedBytes,
          usage: this._usage.nestedBytes,
        },
      );
    }
  }

  /**
   * Increment the inflight nested operation counter.
   * @throws {BudgetLimitError} If max inflight is exceeded.
   */
  incrementInflight() {
    this._guardTerminated();
    this._usage.inflight += NUM.ONE;
    if (this._usage.inflight > this._limits.inflight) {
      this._usage.inflight -= NUM.ONE;
      this._terminate();
      throw new BudgetLimitError(
        ERR.INFLIGHT_EXCEEDED,
        {
          category: BUDGET_CATEGORY.INFLIGHT,
          limit: this._limits.inflight,
          usage: this._usage.inflight + NUM.ONE,
        },
      );
    }
  }

  /**
   * Decrement the inflight nested operation counter.
   * Does not throw; safe to call in finally blocks.
   */
  decrementInflight() {
    if (this._usage.inflight > NUM.ZERO) {
      this._usage.inflight -= NUM.ONE;
    }
  }

  /**
   * Return current usage snapshot.
   * @return {Object} Usage object with all tracked values.
   */
  getUsage() {
    return {...this._usage};
  }

  /**
   * Whether the enforcer has been terminated due to a budget
   * violation.
   * @return {boolean} True if terminated.
   */
  isTerminated() {
    return this._terminated;
  }

  /**
   * Check if any limit is exceeded without throwing.
   * @return {boolean} True if any limit is exceeded.
   */
  isExceeded() {
    const elapsed = Date.now() - this._usage.wallStart;
    return (
      this._usage.cpuTimeMs > this._limits.cpuTimeMs ||
      this._usage.memoryBytes > this._limits.memoryBytes ||
      elapsed > this._limits.wallTimeMs ||
      this._usage.lookupKeys > this._limits.lookupKeys ||
      this._usage.lookupBytes > this._limits.lookupBytes ||
      this._usage.emitBytes > this._limits.emitBytes ||
      this._usage.broadcastBytes >
        this._limits.broadcastBytes ||
      this._usage.outBytes > this._limits.outBytes ||
      this._usage.nestedCalls > this._limits.nestedCalls ||
      this._usage.nestedKeys > this._limits.nestedKeys ||
      this._usage.nestedBytes > this._limits.nestedBytes ||
      this._usage.inflight > this._limits.inflight
    );
  }

  /**
   * Mark the enforcer as terminated. Once terminated, all
   * subsequent record* / check* calls throw immediately.
   * @private
   */
  _terminate() {
    this._terminated = true;
  }

  /**
   * Guard against recording after termination.
   * @throws {BudgetLimitError} If already terminated.
   * @private
   */
  _guardTerminated() {
    if (this._terminated) {
      throw new BudgetLimitError(
        ERR.OPERATION_TERMINATED,
        {
          category: LOCAL_STR_TERMINATED,
          limit: NUM.ZERO,
          usage: NUM.ZERO,
        },
      );
    }
  }
}

export {BudgetEnforcer};
