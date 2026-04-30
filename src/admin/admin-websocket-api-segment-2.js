import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {AdminWebSocketAPISegment1} from './admin-websocket-api-segment-1.js';

const LOCAL_STR_129XF = 'serve not ready: load lane admission denied on node ';
const LOCAL_STR_SERVEELIGIBLE = ' (serveEligible=';
const LOCAL_STR_REASONS = ', reasons=';
const LOCAL_STR_COMMA = ',';
const LOCAL_STR_NONE = 'none';
const LOCAL_STR_C7ZU6 = ')';
const LOCAL_STR_TABLENAME = ' (tableName=';
const LOCAL_STR_5JWN7 = ', benchmarkReady=false, reasons=';
const LOCAL_STR_TIMEOUT = 'timeout';
const LOCAL_STR_TIMED_OUT = 'timed out';
const LOCAL_STR_DEADLINE_EXCEEDED = 'deadline exceeded';
const LOCAL_STR_AND = 'AND';
const LOCAL_STR_OR = 'OR';
const LOCAL_STR_EQUALS = '=';
const LOCAL_STR_151ZF = '<>';
const LOCAL_STR_GDTVK = '>';
const LOCAL_STR_4PO0L = '>=';
const LOCAL_STR_FTUO6 = '<';
const LOCAL_STR_15BZ1 = '<=';
const LOCAL_STR_IS_NULL = 'IS NULL';
const LOCAL_STR_IS_NOT_NULL = 'IS NOT NULL';
const LOCAL_STR_NOT = 'NOT';
const LOCAL_STR_HYPHEN = '-';
const LOCAL_STR_ASC = 'ASC';
const LOCAL_STR_DESC = 'DESC';

const {
  ADMIN_CACHE_DUMP,
  ADMIN_CACHE_OBSERVATION_TABLES,
  AST_TYPE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  EMPTY_STRING,
  EXPR_TYPE,
  ErrorCode,
  LOAD_LANE_ADMISSION_REASON_FALLBACK,
  LOAD_LANE_QUERY_ADMISSION_STATE,
  LOAD_LANE_QUERY_TIMEOUT_CAP_MS,
  LOAD_LANE_SOFT_ADMISSION_REASON_CODES,
  LOAD_LANE_TABLE_ADMISSION_RETRY_AFTER_MS,
  LOAD_LANE_TABLE_ADMISSION_STATE,
  LOAD_LANE_VOTER_READY_REPLICA_ROLES,
  META_SERVICE_ID,
  NUM,
  SQLParser,
  TYPEOF,
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

class AdminWebSocketAPISegment2 extends AdminWebSocketAPISegment1 {
  async resolveLoadLaneReadinessSnapshot() {
    if (
      !this.controlPlaneReadinessService ||
      typeof this.nodeId !== TYPEOF.STRING ||
      this.nodeId.length === NUM.ZERO
    ) {
      return null;
    }
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness ===
      TYPEOF.FUNCTION
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
      TYPEOF.FUNCTION
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
      LOCAL_STR_129XF +
        this.nodeId +
        LOCAL_STR_SERVEELIGIBLE +
        String(admission.serveEligible) +
        LOCAL_STR_REASONS +
        (admission.reasonCodes.length > NUM.ZERO ?
          admission.reasonCodes.join(LOCAL_STR_COMMA) :
          LOCAL_STR_NONE) +
        LOCAL_STR_C7ZU6,
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
    if (typeof sql !== TYPEOF.STRING || sql.length === NUM.ZERO) {
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
        .filter((code) => code.length > NUM.ZERO) :
      [];
    if (normalized.length > NUM.ZERO) {
      return [...new Set(normalized)];
    }
    if (
      typeof fallbackCode === TYPEOF.STRING &&
      fallbackCode.length > NUM.ZERO
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
    if (!benchmarkAdmission || typeof benchmarkAdmission !== TYPEOF.OBJECT) {
      return false;
    }
    if (!Array.isArray(reasonCodes) || reasonCodes.length <= NUM.ZERO) {
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
      degradedByOperationIds.length <= NUM.ZERO
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
    if (!readiness || typeof readiness !== TYPEOF.OBJECT) {
      return false;
    }
    if (!Array.isArray(reasonCodes) || reasonCodes.length <= NUM.ZERO) {
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
      typeof replica.benchmarkAdmission === TYPEOF.OBJECT ?
      replica.benchmarkAdmission :
      null;
  }

  resolveLoadLaneReplicaReadiness(replica) {
    return replica?.readiness && typeof replica.readiness === TYPEOF.OBJECT ?
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
    if (ready === true && reasonCodes.length === NUM.ZERO) {
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
    if (!resolvedState || typeof resolvedState !== TYPEOF.OBJECT) {
      return false;
    }
    const snapshotObservation =
      snapshot?.snapshotObservation &&
      typeof snapshot.snapshotObservation === TYPEOF.OBJECT ?
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
      admissionState.reasonCodes.length > NUM.ZERO ?
        admissionState.reasonCodes :
        ['benchmark_admission_blocked'];
    throw createRetryableAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      LOCAL_STR_129XF +
        this.nodeId +
        LOCAL_STR_TABLENAME +
        tableName +
        LOCAL_STR_5JWN7 +
        reasonCodes.join(LOCAL_STR_COMMA) +
        LOCAL_STR_C7ZU6,
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
      this.loadLaneQueryTimeoutCapMs > NUM.ZERO ?
        Math.floor(this.loadLaneQueryTimeoutCapMs) :
        LOAD_LANE_QUERY_TIMEOUT_CAP_MS;
    if (normalizedTimeoutMs === null) {
      return boundedTimeoutMs;
    }
    return Math.max(NUM.ONE, Math.min(normalizedTimeoutMs, boundedTimeoutMs));
  }

  /**
   * Resolve retry-after metadata for one retryable load-lane failure.
   * @param {Object} value
   * @return {number}
   * @private
   */
  resolveLoadLaneRetryAfterMs(value = null) {
    const classifiedRetryAfterMs = getControlPlaneRetryAfterMs(value);
    if (classifiedRetryAfterMs > NUM.ZERO) {
      return classifiedRetryAfterMs;
    }
    const retryAfterMs = Number(value?.retryAfterMs);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
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
    if (!value || typeof value !== TYPEOF.OBJECT) {
      return false;
    }
    if (value.deferRetry === true) {
      return true;
    }
    if (getControlPlaneRetryAfterMs(value) > NUM.ZERO) {
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
   * Execute one simple single-table system observation query from the local
   * cache instead of routing it back through SqlCore.
   *
   * These admin observation reads must stay observational. If shared metadata
   * is incomplete, callers should see the stale local picture or use the
   * explicit snapshot/discovery owners rather than silently reopening repair
   * work from a raw table read.
   *
   * @param {string} sql
   * @param {Array<*>} params
   * @return {Object|null}
   * @private
   */
  tryExecuteLocalSystemTableObservationQuery(sql, params = []) {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION ||
      typeof sql !== TYPEOF.STRING
    ) {
      return null;
    }

    let ast;
    try {
      ast = new SQLParser(sql).parse();
    } catch (_error) {
      return null;
    }

    if (
      ast?.type !== AST_TYPE.SELECT ||
      !ast.from ||
      ast.from.subquery ||
      (Array.isArray(ast.joins) && ast.joins.length > NUM.ZERO) ||
      ast.distinct === true ||
      ast.groupBy ||
      ast.having ||
      ast.ctes ||
      ast.recursive === true ||
      ast.setOperation
    ) {
      return null;
    }

    const tableName = normalizeIdentifier(ast.from.name);
    if (!tableName || !ADMIN_CACHE_OBSERVATION_TABLES.has(tableName)) {
      return null;
    }

    try {
      let rows = this.systemTableCache.getAll(tableName);
      rows = Array.isArray(rows) ? rows.map((row) => ({...row})) : [];
      rows = rows.filter((row) =>
        this.evaluateLocalSystemTableObservationExpression(
          ast.where,
          row,
          params,
        ),
      );
      rows = this.sortLocalSystemTableObservationRows(
        rows,
        ast.orderBy,
        params,
      );
      rows = this.limitLocalSystemTableObservationRows(rows, ast.limit);
      rows = this.projectLocalSystemTableObservationRows(
        rows,
        ast.columns,
        params,
      );
      if (rows === null) {
        return null;
      }
      return {
        success: true,
        rows,
        count: rows.length,
        partitions: this.resolveLocalSystemTableObservationPartitions(
          tableName,
          rows,
        ),
        tableName,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Evaluate one cache-backed WHERE expression against one row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {boolean}
   * @private
   */
  evaluateLocalSystemTableObservationExpression(expr, row, params = []) {
    if (!expr) {
      return true;
    }

    if (expr.type === EXPR_TYPE.BINARY) {
      if (expr.operator === LOCAL_STR_AND) {
        return (
          this.evaluateLocalSystemTableObservationExpression(
            expr.left,
            row,
            params,
          ) &&
          this.evaluateLocalSystemTableObservationExpression(
            expr.right,
            row,
            params,
          )
        );
      }
      if (expr.operator === LOCAL_STR_OR) {
        return (
          this.evaluateLocalSystemTableObservationExpression(
            expr.left,
            row,
            params,
          ) ||
          this.evaluateLocalSystemTableObservationExpression(
            expr.right,
            row,
            params,
          )
        );
      }

      const leftValue = this.resolveLocalSystemTableObservationValue(
        expr.left,
        row,
        params,
      );
      const rightValue = this.resolveLocalSystemTableObservationValue(
        expr.right,
        row,
        params,
      );
      const comparison = this.compareLocalSystemTableObservationValues(
        leftValue,
        rightValue,
      );

      switch (expr.operator) {
      case LOCAL_STR_EQUALS:
        return comparison === NUM.ZERO;
      case LOCAL_STR_151ZF:
        return comparison !== NUM.ZERO;
      case LOCAL_STR_GDTVK:
        return comparison > NUM.ZERO;
      case LOCAL_STR_4PO0L:
        return comparison >= NUM.ZERO;
      case LOCAL_STR_FTUO6:
        return comparison < NUM.ZERO;
      case LOCAL_STR_15BZ1:
        return comparison <= NUM.ZERO;
      case LOCAL_STR_IS_NULL:
        return leftValue === null || leftValue === undefined;
      case LOCAL_STR_IS_NOT_NULL:
        return leftValue !== null && leftValue !== undefined;
      default:
        throw new Error(
          `Unsupported local admin cache operator: ${expr.operator}`,
        );
      }
    }

    if (expr.type === EXPR_TYPE.IN) {
      const candidate = this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
      const values = Array.isArray(expr.values) ? expr.values : [];
      const matched = values.some((valueExpr) => {
        const value = this.resolveLocalSystemTableObservationValue(
          valueExpr,
          row,
          params,
        );
        return (
          this.compareLocalSystemTableObservationValues(candidate, value) ===
          NUM.ZERO
        );
      });
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.LIKE) {
      const candidate = this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
      const pattern = this.resolveLocalSystemTableObservationValue(
        expr.pattern,
        row,
        params,
      );
      const matched = this.matchesLocalSystemTableObservationLike(
        candidate,
        pattern,
      );
      return expr.negated === true ? !matched : matched;
    }

    if (expr.type === EXPR_TYPE.UNARY && expr.operator === LOCAL_STR_NOT) {
      return !this.evaluateLocalSystemTableObservationExpression(
        expr.operand,
        row,
        params,
      );
    }

    return Boolean(
      this.resolveLocalSystemTableObservationValue(expr, row, params),
    );
  }

  /**
   * Resolve one supported expression value against one cache row.
   * @param {Object|null} expr
   * @param {Object} row
   * @param {Array<*>} params
   * @return {*}
   * @private
   */
  resolveLocalSystemTableObservationValue(expr, row, params = []) {
    if (!expr) {
      return null;
    }

    switch (expr.type) {
    case EXPR_TYPE.LITERAL:
      return expr.value;
    case EXPR_TYPE.PARAMETER:
      return params[expr.index];
    case EXPR_TYPE.COLUMN:
      return this.resolveLocalSystemTableObservationValue(
        expr.expression,
        row,
        params,
      );
    case EXPR_TYPE.COLUMN_REF: {
      const directValue = row?.[expr.column];
      if (directValue !== undefined) {
        return directValue;
      }
      const normalizedColumn = normalizeIdentifier(expr.column);
      if (!normalizedColumn) {
        return undefined;
      }
      for (const [key, value] of Object.entries(row || {})) {
        if (normalizeIdentifier(key) === normalizedColumn) {
          return value;
        }
      }
      return undefined;
    }
    case EXPR_TYPE.UNARY:
      if (expr.operator === LOCAL_STR_HYPHEN) {
        const value = Number(
          this.resolveLocalSystemTableObservationValue(
            expr.operand,
            row,
            params,
          ),
        );
        return Number.isFinite(value) ? -value : null;
      }
      return this.resolveLocalSystemTableObservationValue(
        expr.operand,
        row,
        params,
      );
    default:
      throw new Error(
        `Unsupported local admin cache expression: ${expr.type}`,
      );
    }
  }

  /**
   * Compare two cache observation values.
   * @param {*} left
   * @param {*} right
   * @return {number}
   * @private
   */
  compareLocalSystemTableObservationValues(left, right) {
    if (left === right) {
      return NUM.ZERO;
    }
    if (left === null || left === undefined) {
      return NUM.NEGATIVE_ONE;
    }
    if (right === null || right === undefined) {
      return NUM.ONE;
    }

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (
      Number.isFinite(leftNumber) &&
      Number.isFinite(rightNumber) &&
      String(left).trim().length > NUM.ZERO &&
      String(right).trim().length > NUM.ZERO
    ) {
      return leftNumber - rightNumber;
    }

    return String(left).localeCompare(String(right));
  }

  /**
   * Apply column projection for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} columns
   * @param {Array<*>} params
   * @return {Object[]|null}
   * @private
   */
  projectLocalSystemTableObservationRows(rows, columns, params = []) {
    if (
      !Array.isArray(columns) ||
      columns.length === NUM.ZERO ||
      columns.some((column) => column?.type === EXPR_TYPE.STAR)
    ) {
      return rows.map((row) => ({...row}));
    }

    const projectedRows = [];
    for (const row of rows) {
      const projected = {};
      for (const column of columns) {
        if (
          column?.type !== EXPR_TYPE.COLUMN ||
          column.expression?.type !== EXPR_TYPE.COLUMN_REF
        ) {
          return null;
        }
        const key =
          typeof column.alias === TYPEOF.STRING &&
          column.alias.length > NUM.ZERO ?
            column.alias :
            column.expression.column;
        projected[key] = this.resolveLocalSystemTableObservationValue(
          column.expression,
          row,
          params,
        );
      }
      projectedRows.push(projected);
    }

    return projectedRows;
  }

  /**
   * Apply ORDER BY clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object[]|null} orderBy
   * @param {Array<*>} params
   * @return {Object[]}
   * @private
   */
  sortLocalSystemTableObservationRows(rows, orderBy, params = []) {
    if (!Array.isArray(orderBy) || orderBy.length === NUM.ZERO) {
      return rows;
    }

    return [...rows].sort((leftRow, rightRow) => {
      for (const ordering of orderBy) {
        const leftValue = this.resolveLocalSystemTableObservationValue(
          ordering.expression,
          leftRow,
          params,
        );
        const rightValue = this.resolveLocalSystemTableObservationValue(
          ordering.expression,
          rightRow,
          params,
        );
        const comparison = this.compareLocalSystemTableObservationValues(
          leftValue,
          rightValue,
        );
        if (comparison !== NUM.ZERO) {
          return String(ordering.direction || LOCAL_STR_ASC).toUpperCase() === LOCAL_STR_DESC ?
            -comparison :
            comparison;
        }
      }
      return NUM.ZERO;
    });
  }

  /**
   * Apply LIMIT/OFFSET clauses for one local cache query result set.
   * @param {Object[]} rows
   * @param {Object|null} limit
   * @return {Object[]}
   * @private
   */
  limitLocalSystemTableObservationRows(rows, limit) {
    if (!limit || typeof limit !== TYPEOF.OBJECT) {
      return rows;
    }

    const count = Number(limit.count);
    const offset = Number(limit.offset);
    const normalizedOffset =
      Number.isFinite(offset) && offset > NUM.ZERO ?
        Math.floor(offset) :
        NUM.ZERO;
    const normalizedCount =
      Number.isFinite(count) && count >= NUM.ZERO ? Math.floor(count) : null;

    if (normalizedCount === null) {
      return rows.slice(normalizedOffset);
    }

    return rows.slice(normalizedOffset, normalizedOffset + normalizedCount);
  }

  /**
   * Resolve best-effort partition ids for one local cache result.
   * @param {string} tableName
   * @param {Object[]} rows
   * @return {string[]}
   * @private
   */
}

export {AdminWebSocketAPISegment2};
