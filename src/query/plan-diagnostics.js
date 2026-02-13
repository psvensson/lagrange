/**
 * Plan diagnostics — EXPLAIN output for strategy decisions,
 * primitive telemetry, and query execution metadata.
 *
 * Combines the strategy decision from the planner with
 * per-primitive telemetry counters into a unified diagnostic
 * snapshot suitable for EXPLAIN and query telemetry output.
 *
 * Requirements: 6.5, 10.3
 */

import {TYPEOF} from '../constants/index.js';
import {STRATEGY_DECISION_FIELD as SDF} from './strategy-constants.js';
import {formatExplainDiagnostic} from './strategy-selector.js';
import {
  NESTED_CALL_CLASSIFICATION,
  DIAGNOSTICS_FIELD,
} from './runtime-constants.js';

/**
 * Diagnostic field names for plan output.
 * @enum {string}
 */
const DIAGNOSTIC_FIELD = Object.freeze({
  QUERY_ID: 'queryId',
  TENANT_ID: 'tenantId',
  STRATEGY: 'strategy',
  PRIMITIVES: 'primitives',
  TIMESTAMP: 'timestamp',
});

/**
 * Error messages for plan diagnostics.
 * @enum {string}
 */
const DIAGNOSTIC_ERROR_MSG = Object.freeze({
  QUERY_ID_REQUIRED:
    'Query ID is required for plan diagnostics',
  DECISION_REQUIRED:
    'Strategy decision is required for plan diagnostics',
  DECISION_MISSING_STRATEGY:
    'Strategy decision must include a strategy field',
});

/**
 * PlanDiagnostics — collects strategy decision and primitive
 * telemetry into a single diagnostic snapshot for EXPLAIN.
 *
 * Requirement 6.5: Expose strategy decisions in EXPLAIN and
 * query telemetry.
 * Requirement 10.3: Per-query primitive usage and selected
 * movement strategy in query diagnostics.
 */
class PlanDiagnostics {
  /**
   * @param {Object} options - Diagnostic options.
   * @param {string} options.queryId - Query identifier.
   * @param {string} [options.tenantId] - Tenant identifier.
   */
  constructor(options = {}) {
    if (!options.queryId) {
      throw new Error(DIAGNOSTIC_ERROR_MSG.QUERY_ID_REQUIRED);
    }
    this.queryId = options.queryId;
    this.tenantId = options.tenantId ?? null;
    this._decision = null;
    this._telemetrySnapshot = null;
    this._timestamp = Date.now();

    /** @private */
    this._classifications = [];
  }

  /**
   * Record the strategy decision from the planner.
   *
   * @param {Object} decision - Strategy decision from
   *   selectStrategy().
   * @throws {Error} If decision is missing or invalid.
   */
  recordDecision(decision) {
    if (!decision) {
      throw new Error(DIAGNOSTIC_ERROR_MSG.DECISION_REQUIRED);
    }
    if (!decision[SDF.STRATEGY]) {
      throw new Error(
        DIAGNOSTIC_ERROR_MSG.DECISION_MISSING_STRATEGY,
      );
    }
    this._decision = decision;
  }

  /**
   * Record a primitive telemetry snapshot.
   *
   * @param {Object} telemetrySnapshot - Snapshot from
   *   PrimitiveTelemetry.snapshot().
   */
  recordTelemetry(telemetrySnapshot) {
    this._telemetrySnapshot = telemetrySnapshot ?? null;
  }

  /**
   * Produce a frozen EXPLAIN diagnostic snapshot combining
   * strategy decision and primitive telemetry.
   *
   * @return {Readonly<Object>} Frozen diagnostic output.
   */
  toExplain() {
    const strategyDiag = this._decision ?
      formatExplainDiagnostic(this._decision) : null;

    const primitives = this._telemetrySnapshot?.primitives ??
      null;

    return Object.freeze({
      [DIAGNOSTIC_FIELD.QUERY_ID]: this.queryId,
      [DIAGNOSTIC_FIELD.TENANT_ID]: this.tenantId,
      [DIAGNOSTIC_FIELD.STRATEGY]: strategyDiag,
      [DIAGNOSTIC_FIELD.PRIMITIVES]: primitives ?
        Object.freeze({...primitives}) : null,
      [DIAGNOSTIC_FIELD.TIMESTAMP]: this._timestamp,
    });
  }

  /**
   * Check whether a strategy decision has been recorded.
   *
   * @return {boolean} True if a decision exists.
   */
  hasDecision() {
    return this._decision !== null;
  }

  /**
   * Check whether telemetry has been recorded.
   *
   * @return {boolean} True if telemetry exists.
   */
  hasTelemetry() {
    return this._telemetrySnapshot !== null;
  }

  /**
   * Record a nested call classification decision.
   *
   * @param {string} query - The SQL query that was classified.
   * @param {string} classification - BOUNDED or UNBOUNDED.
   * @param {string} reason - Reason for the classification.
   */
  recordClassification(query, classification, reason) {
    this._classifications.push(Object.freeze({
      [DIAGNOSTICS_FIELD.QUERY]: query,
      [DIAGNOSTICS_FIELD.CLASSIFICATION]: classification,
      [DIAGNOSTICS_FIELD.REASON]: reason,
      [DIAGNOSTICS_FIELD.TIMESTAMP]: Date.now(),
    }));
  }

  /**
   * Return a frozen array of all classification decisions.
   *
   * @return {ReadonlyArray<Object>} Frozen decisions array.
   */
  getDecisions() {
    return Object.freeze([...this._classifications]);
  }

  /**
   * Count of UNBOUNDED classification decisions.
   *
   * @return {number} Rejection count.
   */
  getRejectionCount() {
    let count = 0;
    for (const d of this._classifications) {
      if (d[DIAGNOSTICS_FIELD.CLASSIFICATION] ===
          NESTED_CALL_CLASSIFICATION.UNBOUNDED) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count of BOUNDED classification decisions.
   *
   * @return {number} Bounded count.
   */
  getBoundedCount() {
    let count = 0;
    for (const d of this._classifications) {
      if (d[DIAGNOSTICS_FIELD.CLASSIFICATION] ===
          NESTED_CALL_CLASSIFICATION.BOUNDED) {
        count++;
      }
    }
    return count;
  }
}

export {
  PlanDiagnostics,
  DIAGNOSTIC_FIELD,
  DIAGNOSTIC_ERROR_MSG,
};
