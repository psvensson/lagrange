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
import { TYPEOF } from '../constants/index.js';
import { STRATEGY_DECISION_FIELD as SDF } from './strategy-constants.js';
import { formatExplainDiagnostic } from './strategy-selector.js';
import { NESTED_CALL_CLASSIFICATION, DIAGNOSTICS_FIELD } from './runtime-constants.js';

/**
 * Diagnostic field names for plan output.
 * @enum {string}
 */
const DIAGNOSTIC_FIELD = Object.freeze(stryMutAct_9fa48("114296") ? {} : (stryCov_9fa48("114296"), {
  QUERY_ID: stryMutAct_9fa48("114297") ? "" : (stryCov_9fa48("114297"), 'queryId'),
  TENANT_ID: stryMutAct_9fa48("114298") ? "" : (stryCov_9fa48("114298"), 'tenantId'),
  STRATEGY: stryMutAct_9fa48("114299") ? "" : (stryCov_9fa48("114299"), 'strategy'),
  PRIMITIVES: stryMutAct_9fa48("114300") ? "" : (stryCov_9fa48("114300"), 'primitives'),
  TIMESTAMP: stryMutAct_9fa48("114301") ? "" : (stryCov_9fa48("114301"), 'timestamp')
}));

/**
 * Error messages for plan diagnostics.
 * @enum {string}
 */
const DIAGNOSTIC_ERROR_MSG = Object.freeze(stryMutAct_9fa48("114302") ? {} : (stryCov_9fa48("114302"), {
  QUERY_ID_REQUIRED: stryMutAct_9fa48("114303") ? "" : (stryCov_9fa48("114303"), 'Query ID is required for plan diagnostics'),
  DECISION_REQUIRED: stryMutAct_9fa48("114304") ? "" : (stryCov_9fa48("114304"), 'Strategy decision is required for plan diagnostics'),
  DECISION_MISSING_STRATEGY: stryMutAct_9fa48("114305") ? "" : (stryCov_9fa48("114305"), 'Strategy decision must include a strategy field')
}));

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
    if (stryMutAct_9fa48("114306")) {
      {}
    } else {
      stryCov_9fa48("114306");
      if (stryMutAct_9fa48("114309") ? false : stryMutAct_9fa48("114308") ? true : stryMutAct_9fa48("114307") ? options.queryId : (stryCov_9fa48("114307", "114308", "114309"), !options.queryId)) {
        if (stryMutAct_9fa48("114310")) {
          {}
        } else {
          stryCov_9fa48("114310");
          throw new Error(DIAGNOSTIC_ERROR_MSG.QUERY_ID_REQUIRED);
        }
      }
      this.queryId = options.queryId;
      this.tenantId = stryMutAct_9fa48("114311") ? options.tenantId && null : (stryCov_9fa48("114311"), options.tenantId ?? null);
      this._decision = null;
      this._telemetrySnapshot = null;
      this._timestamp = Date.now();

      /** @private */
      this._classifications = stryMutAct_9fa48("114312") ? ["Stryker was here"] : (stryCov_9fa48("114312"), []);
    }
  }

  /**
   * Record the strategy decision from the planner.
   *
   * @param {Object} decision - Strategy decision from
   *   selectStrategy().
   * @throws {Error} If decision is missing or invalid.
   */
  recordDecision(decision) {
    if (stryMutAct_9fa48("114313")) {
      {}
    } else {
      stryCov_9fa48("114313");
      if (stryMutAct_9fa48("114316") ? false : stryMutAct_9fa48("114315") ? true : stryMutAct_9fa48("114314") ? decision : (stryCov_9fa48("114314", "114315", "114316"), !decision)) {
        if (stryMutAct_9fa48("114317")) {
          {}
        } else {
          stryCov_9fa48("114317");
          throw new Error(DIAGNOSTIC_ERROR_MSG.DECISION_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("114320") ? false : stryMutAct_9fa48("114319") ? true : stryMutAct_9fa48("114318") ? decision[SDF.STRATEGY] : (stryCov_9fa48("114318", "114319", "114320"), !decision[SDF.STRATEGY])) {
        if (stryMutAct_9fa48("114321")) {
          {}
        } else {
          stryCov_9fa48("114321");
          throw new Error(DIAGNOSTIC_ERROR_MSG.DECISION_MISSING_STRATEGY);
        }
      }
      this._decision = decision;
    }
  }

  /**
   * Record a primitive telemetry snapshot.
   *
   * @param {Object} telemetrySnapshot - Snapshot from
   *   PrimitiveTelemetry.snapshot().
   */
  recordTelemetry(telemetrySnapshot) {
    if (stryMutAct_9fa48("114322")) {
      {}
    } else {
      stryCov_9fa48("114322");
      this._telemetrySnapshot = stryMutAct_9fa48("114323") ? telemetrySnapshot && null : (stryCov_9fa48("114323"), telemetrySnapshot ?? null);
    }
  }

  /**
   * Produce a frozen EXPLAIN diagnostic snapshot combining
   * strategy decision and primitive telemetry.
   *
   * @return {Readonly<Object>} Frozen diagnostic output.
   */
  toExplain() {
    if (stryMutAct_9fa48("114324")) {
      {}
    } else {
      stryCov_9fa48("114324");
      const strategyDiag = this._decision ? formatExplainDiagnostic(this._decision) : null;
      const primitives = stryMutAct_9fa48("114325") ? this._telemetrySnapshot?.primitives && null : (stryCov_9fa48("114325"), (stryMutAct_9fa48("114326") ? this._telemetrySnapshot.primitives : (stryCov_9fa48("114326"), this._telemetrySnapshot?.primitives)) ?? null);
      return Object.freeze(stryMutAct_9fa48("114327") ? {} : (stryCov_9fa48("114327"), {
        [DIAGNOSTIC_FIELD.QUERY_ID]: this.queryId,
        [DIAGNOSTIC_FIELD.TENANT_ID]: this.tenantId,
        [DIAGNOSTIC_FIELD.STRATEGY]: strategyDiag,
        [DIAGNOSTIC_FIELD.PRIMITIVES]: primitives ? Object.freeze(stryMutAct_9fa48("114328") ? {} : (stryCov_9fa48("114328"), {
          ...primitives
        })) : null,
        [DIAGNOSTIC_FIELD.TIMESTAMP]: this._timestamp
      }));
    }
  }

  /**
   * Check whether a strategy decision has been recorded.
   *
   * @return {boolean} True if a decision exists.
   */
  hasDecision() {
    if (stryMutAct_9fa48("114329")) {
      {}
    } else {
      stryCov_9fa48("114329");
      return stryMutAct_9fa48("114332") ? this._decision === null : stryMutAct_9fa48("114331") ? false : stryMutAct_9fa48("114330") ? true : (stryCov_9fa48("114330", "114331", "114332"), this._decision !== null);
    }
  }

  /**
   * Check whether telemetry has been recorded.
   *
   * @return {boolean} True if telemetry exists.
   */
  hasTelemetry() {
    if (stryMutAct_9fa48("114333")) {
      {}
    } else {
      stryCov_9fa48("114333");
      return stryMutAct_9fa48("114336") ? this._telemetrySnapshot === null : stryMutAct_9fa48("114335") ? false : stryMutAct_9fa48("114334") ? true : (stryCov_9fa48("114334", "114335", "114336"), this._telemetrySnapshot !== null);
    }
  }

  /**
   * Record a nested call classification decision.
   *
   * @param {string} query - The SQL query that was classified.
   * @param {string} classification - BOUNDED or UNBOUNDED.
   * @param {string} reason - Reason for the classification.
   */
  recordClassification(query, classification, reason) {
    if (stryMutAct_9fa48("114337")) {
      {}
    } else {
      stryCov_9fa48("114337");
      this._classifications.push(Object.freeze(stryMutAct_9fa48("114338") ? {} : (stryCov_9fa48("114338"), {
        [DIAGNOSTICS_FIELD.QUERY]: query,
        [DIAGNOSTICS_FIELD.CLASSIFICATION]: classification,
        [DIAGNOSTICS_FIELD.REASON]: reason,
        [DIAGNOSTICS_FIELD.TIMESTAMP]: Date.now()
      })));
    }
  }

  /**
   * Return a frozen array of all classification decisions.
   *
   * @return {ReadonlyArray<Object>} Frozen decisions array.
   */
  getDecisions() {
    if (stryMutAct_9fa48("114339")) {
      {}
    } else {
      stryCov_9fa48("114339");
      return Object.freeze(stryMutAct_9fa48("114340") ? [] : (stryCov_9fa48("114340"), [...this._classifications]));
    }
  }

  /**
   * Count of UNBOUNDED classification decisions.
   *
   * @return {number} Rejection count.
   */
  getRejectionCount() {
    if (stryMutAct_9fa48("114341")) {
      {}
    } else {
      stryCov_9fa48("114341");
      let count = 0;
      for (const d of this._classifications) {
        if (stryMutAct_9fa48("114342")) {
          {}
        } else {
          stryCov_9fa48("114342");
          if (stryMutAct_9fa48("114345") ? d[DIAGNOSTICS_FIELD.CLASSIFICATION] !== NESTED_CALL_CLASSIFICATION.UNBOUNDED : stryMutAct_9fa48("114344") ? false : stryMutAct_9fa48("114343") ? true : (stryCov_9fa48("114343", "114344", "114345"), d[DIAGNOSTICS_FIELD.CLASSIFICATION] === NESTED_CALL_CLASSIFICATION.UNBOUNDED)) {
            if (stryMutAct_9fa48("114346")) {
              {}
            } else {
              stryCov_9fa48("114346");
              stryMutAct_9fa48("114347") ? count-- : (stryCov_9fa48("114347"), count++);
            }
          }
        }
      }
      return count;
    }
  }

  /**
   * Count of BOUNDED classification decisions.
   *
   * @return {number} Bounded count.
   */
  getBoundedCount() {
    if (stryMutAct_9fa48("114348")) {
      {}
    } else {
      stryCov_9fa48("114348");
      let count = 0;
      for (const d of this._classifications) {
        if (stryMutAct_9fa48("114349")) {
          {}
        } else {
          stryCov_9fa48("114349");
          if (stryMutAct_9fa48("114352") ? d[DIAGNOSTICS_FIELD.CLASSIFICATION] !== NESTED_CALL_CLASSIFICATION.BOUNDED : stryMutAct_9fa48("114351") ? false : stryMutAct_9fa48("114350") ? true : (stryCov_9fa48("114350", "114351", "114352"), d[DIAGNOSTICS_FIELD.CLASSIFICATION] === NESTED_CALL_CLASSIFICATION.BOUNDED)) {
            if (stryMutAct_9fa48("114353")) {
              {}
            } else {
              stryCov_9fa48("114353");
              stryMutAct_9fa48("114354") ? count-- : (stryCov_9fa48("114354"), count++);
            }
          }
        }
      }
      return count;
    }
  }
}
export { PlanDiagnostics, DIAGNOSTIC_FIELD, DIAGNOSTIC_ERROR_MSG };