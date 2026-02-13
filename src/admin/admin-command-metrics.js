/**
 * Lightweight metrics collector for meta-service command execution.
 * Tracks command counts, latencies, and error rates in-memory.
 * Requirements: 8.5, 13.4
 */

import {NUM} from '../constants/index.js';

const METRIC_TYPE = Object.freeze({
  COMMAND_COUNT: 'commandCount',
  COMMAND_LATENCY_MS: 'commandLatencyMs',
  COMMAND_ERROR: 'commandError',
  OPERATION_DURATION_MS: 'operationDurationMs',
});

/**
 * In-memory metrics collector for meta-service commands.
 */
class CommandMetrics {
  constructor() {
    /** @type {Map<string, number>} */
    this._counts = new Map();
    /** @type {Map<string, number>} */
    this._latencies = new Map();
    /** @type {Map<string, number>} */
    this._errors = new Map();
    /** @type {Map<string, number>} */
    this._operationDurations = new Map();
  }

  /**
   * Record a command execution.
   * @param {string} action - The command action name.
   * @param {number} latencyMs - Execution latency in milliseconds.
   * @param {boolean} success - Whether the command succeeded.
   */
  recordCommand(action, latencyMs, success) {
    const prevCount = this._counts.get(action) ?? NUM.ZERO;
    this._counts.set(action, prevCount + NUM.ONE);

    const prevLatency = this._latencies.get(action) ?? NUM.ZERO;
    this._latencies.set(action, prevLatency + latencyMs);

    if (!success) {
      const prevErrors = this._errors.get(action) ?? NUM.ZERO;
      this._errors.set(action, prevErrors + NUM.ONE);
    }
  }

  /**
   * Record total duration for an operation.
   * @param {string} operationId
   * @param {number} durationMs
   */
  recordOperationDuration(operationId, durationMs) {
    this._operationDurations.set(operationId, durationMs);
  }

  /**
   * @param {string} action
   * @returns {number}
   */
  getCommandCount(action) {
    return this._counts.get(action) ?? NUM.ZERO;
  }

  /**
   * @param {string} action
   * @returns {number}
   */
  getErrorCount(action) {
    return this._errors.get(action) ?? NUM.ZERO;
  }

  /** @returns {number} */
  getTotalCommandCount() {
    let total = NUM.ZERO;
    for (const count of this._counts.values()) {
      total += count;
    }
    return total;
  }

  /** @returns {number} */
  getTotalErrorCount() {
    let total = NUM.ZERO;
    for (const count of this._errors.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Returns a frozen snapshot of all collected metrics.
   * @returns {Readonly<{commands: Object, operations: Object}>}
   */
  getSnapshot() {
    const commands = {};
    for (const [action, count] of this._counts) {
      commands[action] = Object.freeze({
        count,
        errors: this._errors.get(action) ?? NUM.ZERO,
        totalLatencyMs: this._latencies.get(action) ?? NUM.ZERO,
      });
    }

    const operations = {};
    for (const [opId, duration] of this._operationDurations) {
      operations[opId] = duration;
    }

    return Object.freeze({
      commands: Object.freeze(commands),
      operations: Object.freeze(operations),
    });
  }

  /** Clear all collected metrics. */
  reset() {
    this._counts.clear();
    this._latencies.clear();
    this._errors.clear();
    this._operationDurations.clear();
  }
}

export {METRIC_TYPE, CommandMetrics};
