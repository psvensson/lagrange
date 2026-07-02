import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {AdminWebSocketAPIBase} from './admin-websocket-api-base.js';
import {
  ADMIN_WEBSOCKET_LOCAL_OBSERVATION_METHODS,
} from './admin-websocket-local-observation-methods.js';

const LOCAL_STR_SERVE_NOT_READY_LOAD_LANE_ADMISSION_DENI = 'serve not ready: load lane admission denied on node ';
const LOCAL_STR_SERVEELIGIBLE = ' (serveEligible=';
const LOCAL_STR_REASONS = ', reasons=';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_NONE = 'none';
const LOCAL_STR_RPAREN = ')';
const LOCAL_STR_TABLENAME = ' (tableName=';
const LOCAL_STR_BENCHMARKREADY_FALSE_REASONS = ', benchmarkReady=false, reasons=';
const LOCAL_STR_TIMEOUT = 'timeout';
const LOCAL_STR_TIMED_OUT = 'timed out';
const LOCAL_STR_DEADLINE_EXCEEDED = 'deadline exceeded';

const {
  ADMIN_CACHE_DUMP,
  AST_TYPE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  EMPTY_STRING,
  ErrorCode,
  LOAD_LANE_ADMISSION_REASON_FALLBACK,
  LOAD_LANE_QUERY_ADMISSION_STATE,
  LOAD_LANE_QUERY_TIMEOUT_CAP_MS,
  LOAD_LANE_SOFT_ADMISSION_REASON_CODES,
  LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS,
  LOAD_LANE_TABLE_ADMISSION_STATE,
  LOAD_LANE_VOTER_READY_REPLICA_ROLES,
  META_SERVICE_ID,
  SQLParser,
  WASM_SERVICE_PROTOCOL,
  buildLoadLaneAdmissionErrorDetails,
  buildLoadLaneQueryAdmissionResult,
  buildLoadLaneQueryAdmissionSnapshot,
  createRetryableAdminOperationError,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  normalizeIdentifier,
  resolveLoadLaneQueryAdmissionState,
  resolveRequestedQueryTimeoutMs,
} = ADMIN_WEBSOCKET_API_SHARED;

class AdminWebSocketLoadLaneAdmission extends AdminWebSocketAPIBase {
  async resolveLoadLaneReadinessSnapshot() {
    if (
      !this.controlPlaneReadinessService ||
      typeof this.nodeId !== 'string' ||
      this.nodeId.length === 0
    ) {
      return null;
    }
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness ===
      'function'
    ) {
      return this.controlPlaneReadinessService.getNodeReadiness(this.nodeId, {
        allowAuthoritativeRefresh: true,
        requireFreshOnIneligible: true,
        decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
        maxCachedAgeMs: this.loadLaneReadinessCacheMaxAgeMs,
      });
    }
    if (
      typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
      'function'
    ) {
      return this.controlPlaneReadinessService.getNodeReadinessSync(
        this.nodeId,
      );
    }
    return null;
  }

  /**
   * Fail fast for load-lane queries when local routing/member health
   * indicates requests should be shed.
   * @param {Object} executionContext
   * @private
   */
  async assertLoadLaneQueryAdmitted(executionContext = {}) {
    if (!this.isLoadLaneExecution(executionContext)) {
      return;
    }
    const snapshot = buildLoadLaneQueryAdmissionSnapshot(
      await this.resolveLoadLaneReadinessSnapshot(),
    );
    const admission = buildLoadLaneQueryAdmissionResult(
      snapshot,
      resolveLoadLaneQueryAdmissionState(snapshot),
    );
    if (admission.state !== LOAD_LANE_QUERY_ADMISSION_STATE.BLOCKED) {
      return;
    }
    throw createRetryableAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      LOCAL_STR_SERVE_NOT_READY_LOAD_LANE_ADMISSION_DENI +
        this.nodeId +
        LOCAL_STR_SERVEELIGIBLE +
        String(admission.serveEligible) +
        LOCAL_STR_REASONS +
        (admission.reasonCodes.length > 0 ?
          admission.reasonCodes.join(LOCAL_STR_COMMA) :
          LOCAL_STR_NONE) +
        LOCAL_STR_RPAREN,
      {
        details: buildLoadLaneAdmissionErrorDetails(admission),
      },
    );
  }

  /**
   * Resolve one routed user-table target from a load-lane SQL statement.
   * Returns null for non-table statements or unsupported shapes.
   * @param {string} sql
   * @return {string|null}
   * @private
   */
  resolveLoadLaneQueryTargetTableName(sql) {
    if (typeof sql !== 'string' || sql.length === 0) {
      return null;
    }

    let ast;
    try {
      ast = new SQLParser(sql).parse();
    } catch (_error) {
      return null;
    }

    if (ast?.type === AST_TYPE.SELECT) {
      if (!ast.from || ast.from.subquery) {
        return null;
      }
      return normalizeIdentifier(ast.from.name);
    }
    if (
      ast?.type === AST_TYPE.INSERT ||
      ast?.type === AST_TYPE.UPDATE ||
      ast?.type === AST_TYPE.DELETE
    ) {
      return normalizeIdentifier(ast.table);
    }
    return null;
  }

  /**
   * Resolve one stable list of reason codes from discovery readiness.
   * @param {Array<Object>} reasons
   * @param {string} fallbackCode
   * @return {Array<string>}
   * @private
   */
  normalizeLoadLaneAdmissionReasonCodes(reasons, fallbackCode) {
    const normalized = Array.isArray(reasons) ?
      reasons
        .map((reason) => String(reason?.code || EMPTY_STRING).trim())
        .filter((code) => code.length > 0) :
      [];
    if (normalized.length > 0) {
      return [...new Set(normalized)];
    }
    if (
      typeof fallbackCode === 'string' &&
      fallbackCode.length > 0
    ) {
      return [fallbackCode];
    }
    return [];
  }

  /**
   * Determine whether transient schema/leadership drift can be treated as
   * soft blockers for local load-lane admission.
   * @param {Object|null} benchmarkAdmission
   * @param {Array<string>} reasonCodes
   * @return {boolean}
   * @private
   */
  shouldAdmitLoadLaneSoftBenchmarkBlockers(benchmarkAdmission, reasonCodes) {
    if (!benchmarkAdmission || typeof benchmarkAdmission !== 'object') {
      return false;
    }
    if (!Array.isArray(reasonCodes) || reasonCodes.length <= 0) {
      return false;
    }
    if (
      !reasonCodes.every((code) =>
        LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code),
      )
    ) {
      return false;
    }

    const routingReady = benchmarkAdmission.routingReady === true;
    const localReplicaRole = String(
      benchmarkAdmission.localReplicaRole || EMPTY_STRING,
    ).toLowerCase();
    const localReplicaVoterReady =
      LOAD_LANE_VOTER_READY_REPLICA_ROLES.has(localReplicaRole);
    const degradedByOperationIds = Array.isArray(
      benchmarkAdmission.degradedByOperationIds,
    ) ?
      benchmarkAdmission.degradedByOperationIds :
      ADMIN_CACHE_DUMP.EMPTY;

    return (
      routingReady &&
      localReplicaVoterReady &&
      degradedByOperationIds.length <= 0
    );
  }

  /**
   * Determine whether transient schema/leadership drift can be treated as
   * soft blockers when only legacy readiness evidence is available.
   * @param {Object|null} readiness
   * @param {Array<string>} reasonCodes
   * @return {boolean}
   * @private
   */
  shouldAdmitLoadLaneSoftReadinessBlockers(readiness, reasonCodes) {
    if (!readiness || typeof readiness !== 'object') {
      return false;
    }
    if (!Array.isArray(reasonCodes) || reasonCodes.length <= 0) {
      return false;
    }
    if (
      !reasonCodes.every((code) =>
        LOAD_LANE_SOFT_ADMISSION_REASON_CODES.has(code),
      )
    ) {
      return false;
    }

    return readiness.routingReady === true;
  }

  /**
   * Build one canonical load-lane table-admission result.
   * @param {string} tableName
   * @param {string} state
   * @param {Array<string>} reasonCodes
   * @return {Object}
   * @private
   */
  buildLoadLaneTableAdmissionResult(tableName, state, reasonCodes) {
    return {
      ready:
        state === LOAD_LANE_TABLE_ADMISSION_STATE.READY ||
        state === LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED,
      tableName,
      state,
      reasonCodes,
    };
  }

  /**
   * Resolve one replica-scoped load-lane table-admission result from one
   * replica readiness snapshot.
   * @param {Object} replica
   * @param {string} tableName
   * @return {Object}
   * @private
   */
  resolveLoadLaneReplicaAdmissionResult(replica, tableName) {
    const benchmarkAdmission =
      this.resolveLoadLaneReplicaBenchmarkAdmission(replica);
    if (benchmarkAdmission) {
      return this.buildLoadLaneBenchmarkAdmissionResult(
        tableName,
        benchmarkAdmission,
      );
    }

    const readiness = this.resolveLoadLaneReplicaReadiness(replica);
    if (readiness) {
      return this.buildLoadLaneReadinessAdmissionResult(tableName, readiness);
    }

    return this.buildLoadLaneTableAdmissionResult(
      tableName,
      LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING,
      [LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING],
    );
  }

  resolveLoadLaneReplicaBenchmarkAdmission(replica) {
    return replica?.benchmarkAdmission &&
      typeof replica.benchmarkAdmission === 'object' ?
      replica.benchmarkAdmission :
      null;
  }

  resolveLoadLaneReplicaReadiness(replica) {
    return replica?.readiness && typeof replica.readiness === 'object' ?
      replica.readiness :
      null;
  }

  buildLoadLaneBenchmarkAdmissionResult(tableName, benchmarkAdmission) {
    const benchmarkAdmissionReady =
      String(benchmarkAdmission.state || EMPTY_STRING).toLowerCase() ===
      LOAD_LANE_TABLE_ADMISSION_STATE.READY;
    const reasonCodes = benchmarkAdmissionReady ?
      [] :
      this.normalizeLoadLaneAdmissionReasonCodes(
        benchmarkAdmission.reasons,
        LOAD_LANE_ADMISSION_REASON_FALLBACK.BENCHMARK_ADMISSION_BLOCKED,
      );
    const softBlockerAdmitted =
      !benchmarkAdmissionReady &&
      this.shouldAdmitLoadLaneSoftBenchmarkBlockers(
        benchmarkAdmission,
        reasonCodes,
      );
    return this.buildLoadLaneTableAdmissionResult(
      tableName,
      this.resolveLoadLaneReplicaAdmissionStateValue(
        benchmarkAdmissionReady,
        softBlockerAdmitted,
        LOAD_LANE_TABLE_ADMISSION_STATE.BENCHMARK_BLOCKED,
        reasonCodes,
      ),
      softBlockerAdmitted ? [] : reasonCodes,
    );
  }

  buildLoadLaneReadinessAdmissionResult(tableName, readiness) {
    const benchmarkReady = readiness.benchmarkReady === true;
    const reasonCodes = benchmarkReady ?
      [] :
      this.normalizeLoadLaneAdmissionReasonCodes(
        readiness.reasons,
        LOAD_LANE_ADMISSION_REASON_FALLBACK.BENCHMARK_READINESS_BLOCKED,
      );
    const softBlockerAdmitted =
      !benchmarkReady &&
      this.shouldAdmitLoadLaneSoftReadinessBlockers(readiness, reasonCodes);
    return this.buildLoadLaneTableAdmissionResult(
      tableName,
      this.resolveLoadLaneReplicaAdmissionStateValue(
        benchmarkReady,
        softBlockerAdmitted,
        LOAD_LANE_TABLE_ADMISSION_STATE.READINESS_BLOCKED,
        reasonCodes,
      ),
      softBlockerAdmitted ? [] : reasonCodes,
    );
  }

  resolveLoadLaneReplicaAdmissionStateValue(
    ready,
    softBlockerAdmitted,
    blockedState,
    reasonCodes,
  ) {
    if (ready === true && reasonCodes.length === 0) {
      return LOAD_LANE_TABLE_ADMISSION_STATE.READY;
    }
    if (softBlockerAdmitted === true) {
      return LOAD_LANE_TABLE_ADMISSION_STATE.SOFT_BLOCKER_ADMITTED;
    }
    return blockedState;
  }

  /**
   * Resolve local benchmark admission for one routed load-lane table.
   * @param {string} tableName
   * @return {Object|null}
   * @private
   */
  async resolveLoadLaneTableAdmissionState(tableName) {
    const normalizedTableName = normalizeIdentifier(tableName);
    if (!normalizedTableName) {
      return null;
    }

    const nowMs = this.nowFn();
    const cachedEntry =
      this.loadLaneTableAdmissionCache.get(normalizedTableName);
    if (
      cachedEntry &&
      nowMs - cachedEntry.capturedAtMs <=
        this.loadLaneTableAdmissionCacheMaxAgeMs
    ) {
      return cachedEntry.state;
    }

    const snapshot =
      await this.serviceDiscovery.resolveServiceDiscoverySnapshot({
        tableName: normalizedTableName,
        serviceIdAllowlist: [META_SERVICE_ID.POSTGRES_WIRE],
        protocolAllowlist: [WASM_SERVICE_PROTOCOL.POSTGRESQL],
        allowAuthoritativeRepair: true,
      });
    const services = Array.isArray(snapshot?.services) ?
      snapshot.services :
      ADMIN_CACHE_DUMP.EMPTY;

    let resolvedState = this.buildLoadLaneTableAdmissionResult(
      normalizedTableName,
      LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING,
      [LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING],
    );

    for (const service of services) {
      const replicas = Array.isArray(service?.replicas) ?
        service.replicas :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const replica of replicas) {
        if (String(replica?.nodeId || EMPTY_STRING) !== this.nodeId) {
          continue;
        }
        resolvedState = this.resolveLoadLaneReplicaAdmissionResult(
          replica,
          normalizedTableName,
        );
        break;
      }
      if (
        resolvedState.ready === true ||
        resolvedState.state !==
          LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING
      ) {
        break;
      }
    }

    if (this.shouldCacheLoadLaneTableAdmissionState(snapshot, resolvedState)) {
      this.loadLaneTableAdmissionCache.set(normalizedTableName, {
        capturedAtMs: nowMs,
        state: resolvedState,
      });
    } else {
      this.loadLaneTableAdmissionCache.delete(normalizedTableName);
    }
    return resolvedState;
  }

  /**
   * Cache only fresh discovery admissions so a stale first observation does not
   * pin retryable load traffic after background repair completes.
   * @param {Object|null} snapshot
   * @param {Object|null} resolvedState
   * @return {boolean}
   * @private
   */
  shouldCacheLoadLaneTableAdmissionState(snapshot, resolvedState) {
    if (!resolvedState || typeof resolvedState !== 'object') {
      return false;
    }
    const snapshotObservation =
      snapshot?.snapshotObservation &&
      typeof snapshot.snapshotObservation === 'object' ?
        snapshot.snapshotObservation :
        null;
    if (!snapshotObservation) {
      return true;
    }
    return (
      snapshotObservation.state ===
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH
    );
  }

  /**
   * Enforce table-scoped load-lane admission for routed user-table queries.
   * @param {string} sql
   * @param {Object} executionContext
   * @return {Promise<void>}
   * @private
   */
  async assertLoadLaneTableQueryAdmitted(sql, executionContext = {}) {
    if (!this.isLoadLaneExecution(executionContext)) {
      return;
    }
    const tableName = this.resolveLoadLaneQueryTargetTableName(sql);
    if (!tableName) {
      return;
    }
    const admissionState =
      await this.resolveLoadLaneTableAdmissionState(tableName);
    if (admissionState?.ready === true) {
      return;
    }
    const reasonCodes =
      Array.isArray(admissionState?.reasonCodes) &&
      admissionState.reasonCodes.length > 0 ?
        admissionState.reasonCodes :
        ['benchmark_admission_blocked'];
    throw createRetryableAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      LOCAL_STR_SERVE_NOT_READY_LOAD_LANE_ADMISSION_DENI +
        this.nodeId +
        LOCAL_STR_TABLENAME +
        tableName +
        LOCAL_STR_BENCHMARKREADY_FALSE_REASONS +
        reasonCodes.join(LOCAL_STR_COMMA) +
        LOCAL_STR_RPAREN,
    );
  }

  /**
   * Resolve bounded query timeout for one execution context.
   * Load-lane traffic should fail fast under pressure so retries can
   * redistribute work instead of occupying long timeout budgets.
   * @param {number|null} requestedTimeoutMs
   * @param {Object} executionContext
   * @return {number|null}
   * @private
   */
  resolveExecutionQueryTimeoutMs(requestedTimeoutMs, executionContext = {}) {
    const normalizedTimeoutMs =
      resolveRequestedQueryTimeoutMs(requestedTimeoutMs);
    if (!this.isLoadLaneExecution(executionContext)) {
      return normalizedTimeoutMs;
    }

    const boundedTimeoutMs =
      Number.isFinite(this.loadLaneQueryTimeoutCapMs) &&
      this.loadLaneQueryTimeoutCapMs > 0 ?
        Math.floor(this.loadLaneQueryTimeoutCapMs) :
        LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
    if (normalizedTimeoutMs === null) {
      return boundedTimeoutMs;
    }
    return Math.max(1, Math.min(normalizedTimeoutMs, boundedTimeoutMs));
  }

  /**
   * Resolve retry-after metadata for one retryable load-lane failure.
   * @param {Object} value
   * @return {number}
   * @private
   */
  resolveLoadLaneRetryAfterMs(value = null) {
    const classifiedRetryAfterMs = getControlPlaneRetryAfterMs(value);
    if (classifiedRetryAfterMs > 0) {
      return classifiedRetryAfterMs;
    }
    const retryAfterMs = Number(value?.retryAfterMs);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return Math.floor(retryAfterMs);
    }
    return LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS;
  }

  /**
   * Return true when one load-lane SQL failure should be surfaced as
   * bounded retry pressure instead of a hard failure.
   * @param {Object} value
   * @return {boolean}
   * @private
   */
  isRetryableLoadLaneExecutionFailure(value = null) {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (value.deferRetry === true) {
      return true;
    }
    if (getControlPlaneRetryAfterMs(value) > 0) {
      return true;
    }
    if (isRetryableControlPlaneError(value)) {
      return true;
    }

    const errorCode = String(
      value?.errorCode || value?.code || EMPTY_STRING,
    ).toLowerCase();
    if (errorCode === String(ErrorCode.TIMEOUT).toLowerCase()) {
      return true;
    }
    const message = String(
      value?.message || value?.error || EMPTY_STRING,
    ).toLowerCase();
    return (
      message.includes(LOCAL_STR_TIMEOUT) ||
      message.includes(LOCAL_STR_TIMED_OUT) ||
      message.includes(LOCAL_STR_DEADLINE_EXCEEDED)
    );
  }

  /**
   * Resolve best-effort partition ids for one local cache result.
   * @param {string} tableName
   * @param {Object[]} rows
   * @return {string[]}
   * @private
  */
}

Object.assign(
  AdminWebSocketLoadLaneAdmission.prototype,
  ADMIN_WEBSOCKET_LOCAL_OBSERVATION_METHODS,
);

export {
  AdminWebSocketLoadLaneAdmission,
  AdminWebSocketLoadLaneAdmission as AdminWebSocketAPISegment2,
};
