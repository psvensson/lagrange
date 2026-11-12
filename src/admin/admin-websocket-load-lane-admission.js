import {
  isServeEligibilityAnswerEligible,
} from '../control-plane/serve-eligibility-owner.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {
  endpointIncarnationOf,
  isEndpointCurrentForNode,
} from '../control-plane/owners/endpoint-incarnation-currentness.js';
import {
  normalizeKnownNodeBootIncarnation,
} from '../control-plane/control-plane-error-classification.js';
import {hasWriteOutcomeUnknown} from '../partition/partition-write-kernel.js';
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
const LOCAL_STR_SERVE_ELIGIBILITY_REFRESH_FAILED =
  'load-lane serve eligibility refresh failed';
const LOCAL_STR_STALE_ENDPOINT_INCARNATION = 'stale_endpoint_incarnation';
const LOCAL_STR_BENCHMARK_ADMISSION_BLOCKED = 'benchmark_admission_blocked';
const LOCAL_STR_COLON_COLON = '::';

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
  LOAD_ROUTABLE_RAFT_ROLES,
  SQLParser,
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

const filterMatchingServices = (rawServices, actualIngress) => {
  const targetProto = String(actualIngress.protocol).toLowerCase();
  return rawServices.filter((service) => {
    const serviceIds = Array.isArray(service?.serviceIds) ? service.serviceIds :
      (service?.serviceId ? [service.serviceId] : ADMIN_CACHE_DUMP.EMPTY);
    const protocol = String(service?.protocol || EMPTY_STRING).toLowerCase();
    return serviceIds.includes(actualIngress.serviceId) && protocol === targetProto;
  });
};

async function refreshServeEligibilityWhenIneligible(
  readinessService,
  nodeId,
  logger,
) {
  if (
    !readinessService.answerServeEligibility ||
    !readinessService.readServeEligibility
  ) {
    return false;
  }
  const serveAnswer = readinessService.answerServeEligibility(nodeId);
  if (isServeEligibilityAnswerEligible(serveAnswer)) {
    return false;
  }
  try {
    await readinessService.readServeEligibility();
  } catch (error) {
    logger?.debug?.(LOCAL_STR_SERVE_ELIGIBILITY_REFRESH_FAILED, {
      nodeId,
      error: error?.message || String(error),
    });
  }
  return true;
}

class AdminWebSocketLoadLaneAdmission extends AdminWebSocketAPIBase {
  async resolveLoadLaneReadinessSnapshot() {
    if (
      !this.controlPlaneReadinessService ||
      typeof this.nodeId !== 'string' ||
      this.nodeId.length === 0
    ) {
      return null;
    }
    const refreshedServeEligibility =
      await refreshServeEligibilityWhenIneligible(
        this.controlPlaneReadinessService,
        this.nodeId,
        this.logger,
      );
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness ===
      'function'
    ) {
      return this.controlPlaneReadinessService.getNodeReadiness(this.nodeId, {
        allowAuthoritativeRefresh: true,
        requireFreshOnIneligible: true,
        decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
        maxCachedAgeMs: refreshedServeEligibility ?
          0 :
          this.loadLaneReadinessCacheMaxAgeMs,
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
      LOAD_ROUTABLE_RAFT_ROLES.has(localReplicaRole);
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
   * Resolve known endpoint boot incarnation from one replica record or system cache.
   * @param {Object} replica
   * @return {number}
   * @private
   */
  resolveReplicaEndpointIncarnation(replica) {
    if (!replica || typeof replica !== 'object') return 0;
    const direct = endpointIncarnationOf(replica);
    if (direct > 0) return direct;
    const endpointId = replica.endpointId;
    if (typeof endpointId === 'string' && endpointId.length > 0) {
      const row = this.systemTableCache?.get?.(TABLES.SERVICE_ENDPOINTS, endpointId);
      if (row) return endpointIncarnationOf(row);
    }
    return 0;
  }

  isCachedEndpointCurrent(endpointId) {
    if (!endpointId || !this.systemTableCache?.get) return true;
    const endpointRow = this.systemTableCache.get(TABLES.SERVICE_ENDPOINTS, endpointId);
    const nodeRow = this.systemTableCache.get(TABLES.NODES, this.nodeId);
    return !(endpointRow && nodeRow && !isEndpointCurrentForNode(endpointRow, nodeRow));
  }

  /**
   * Determine whether one replica endpoint matches the node's current incarnation.
   * @param {Object} replica
   * @param {Object|null} actualIngress
   * @return {boolean}
   * @private
   */
  isReplicaEndpointCurrent(replica, actualIngress) {
    if (!replica || typeof replica !== 'object') return false;
    if (!this.isCachedEndpointCurrent(replica.endpointId)) return false;
    const current = normalizeKnownNodeBootIncarnation(
      actualIngress?.incarnation || this.resolveCurrentNodeIncarnation(),
    );
    const replicaInc = this.resolveReplicaEndpointIncarnation(replica);
    if (current > 0 && replicaInc > 0) return replicaInc === current;
    return true;
  }

  /**
   * Resolve one replica-scoped load-lane table-admission result from one
   * replica readiness snapshot.
   * @param {Object} replica
   * @param {string} tableName
   * @param {Object|null} [actualIngress=null]
   * @return {Object}
   * @private
   */
  resolveLoadLaneReplicaAdmissionResult(replica, tableName, actualIngress = null) {
    if (!this.isReplicaEndpointCurrent(replica, actualIngress)) {
      return this.buildLoadLaneTableAdmissionResult(
        tableName, LOAD_LANE_TABLE_ADMISSION_STATE.READINESS_BLOCKED,
        [LOCAL_STR_STALE_ENDPOINT_INCARNATION],
      );
    }
    const benchmarkAdmission = this.resolveLoadLaneReplicaBenchmarkAdmission(replica);
    if (benchmarkAdmission) {
      return this.buildLoadLaneBenchmarkAdmissionResult(tableName, benchmarkAdmission);
    }
    const readiness = this.resolveLoadLaneReplicaReadiness(replica);
    if (readiness) return this.buildLoadLaneReadinessAdmissionResult(tableName, readiness);
    return this.buildLoadLaneTableAdmissionResult(
      tableName, LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING,
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
   * Resolve local node's current boot incarnation.
   * @return {number}
   * @private
   */
  resolveCurrentNodeIncarnation() {
    if (typeof this.bootIncarnation === 'number' && this.bootIncarnation > 0) {
      return this.bootIncarnation;
    }
    if (this.systemTableCache?.get) {
      const nodeRow = this.systemTableCache.get(TABLES.NODES, this.nodeId);
      const inc = normalizeKnownNodeBootIncarnation(nodeRow?.[COLUMN.BOOT_INCARNATION]);
      if (inc > 0) return inc;
    }
    return 0;
  }

  /**
   * Resolve actual ingress service, protocol, and incarnation.
   * Wire execution contexts bind strictly to canonical server ingress.
   * @param {Object} [contextOrIngress={}]
   * @return {Object}
   * @private
   */
  resolveActualIngressIdentity(contextOrIngress = {}) {
    const canonicalServiceId = this.ingressServiceId;
    const canonicalProtocol = this.ingressProtocol;
    const canonicalNodeId = this.nodeId;
    const canonicalIncarnation = this.resolveCurrentNodeIncarnation();

    if (!contextOrIngress?.clientInfo) {
      const candidate = contextOrIngress?.ingress || null;
      if (candidate && typeof candidate === 'object') {
        const candInc = normalizeKnownNodeBootIncarnation(candidate.incarnation);
        return {
          serviceId: candidate.serviceId || canonicalServiceId,
          protocol: candidate.protocol || canonicalProtocol,
          nodeId: candidate.nodeId || canonicalNodeId,
          incarnation: candInc > 0 ? candInc : canonicalIncarnation,
        };
      }
    }

    return {
      serviceId: canonicalServiceId,
      protocol: canonicalProtocol,
      nodeId: canonicalNodeId,
      incarnation: canonicalIncarnation,
    };
  }

  /**
   * Build composite cache key for table admission state.
   * @param {string} tableName
   * @param {Object} ingressIdentity
   * @return {string}
   * @private
   */
  buildLoadLaneTableAdmissionCacheKey(tableName, ingressIdentity) {
    const name = normalizeIdentifier(tableName);
    const serviceId = String(ingressIdentity?.serviceId || EMPTY_STRING).trim();
    const protocol = String(ingressIdentity?.protocol || EMPTY_STRING).trim().toLowerCase();
    const nodeId = String(ingressIdentity?.nodeId || EMPTY_STRING).trim();
    const inc = normalizeKnownNodeBootIncarnation(ingressIdentity?.incarnation);
    return `${name}${LOCAL_STR_COLON_COLON}${serviceId}${LOCAL_STR_COLON_COLON}${protocol}` +
      `${LOCAL_STR_COLON_COLON}${nodeId}${LOCAL_STR_COLON_COLON}${inc}`;
  }

  /**
   * Verify that one cached admission entry matches the requested ingress binding.
   * @param {Object} cachedEntry
   * @param {Object} ingressIdentity
   * @return {boolean}
   * @private
   */
  isLoadLaneTableAdmissionCacheEntryCurrent(cachedEntry, ingressIdentity) {
    if (!cachedEntry?.binding || !ingressIdentity) return false;
    const {binding} = cachedEntry;
    const curInc = normalizeKnownNodeBootIncarnation(ingressIdentity.incarnation);
    return binding.serviceId === ingressIdentity.serviceId &&
      binding.protocol === ingressIdentity.protocol &&
      binding.nodeId === ingressIdentity.nodeId &&
      binding.incarnation === curInc;
  }

  /**
   * Resolve local benchmark admission for one routed load-lane table.
   * @param {string} tableName
   * @param {Object} [contextOrIngress={}]
   * @return {Object|null}
   * @private
   */
  _resolveReplicaFromServices(services, actualIngress, normalizedTableName) {
    let resolved = this.buildLoadLaneTableAdmissionResult(
      normalizedTableName, LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING,
      [LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING],
    );
    for (const service of services) {
      const replicas = Array.isArray(service?.replicas) ? service.replicas : ADMIN_CACHE_DUMP.EMPTY;
      for (const replica of replicas) {
        if (String(replica?.nodeId || EMPTY_STRING) !== actualIngress.nodeId) continue;
        resolved = this.resolveLoadLaneReplicaAdmissionResult(
          replica, normalizedTableName, actualIngress,
        );
        break;
      }
      if (
        resolved.ready === true ||
        resolved.state !== LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING
      ) {
        break;
      }
    }
    return resolved;
  }

  async resolveLoadLaneTableAdmissionState(tableName, contextOrIngress = {}) {
    const normalizedTableName = normalizeIdentifier(tableName);
    if (!normalizedTableName) return null;

    const actualIngress = this.resolveActualIngressIdentity(contextOrIngress);
    const cacheKey = this.buildLoadLaneTableAdmissionCacheKey(
      normalizedTableName, actualIngress,
    );

    const nowMs = this.nowFn();
    const cachedEntry = this.loadLaneTableAdmissionCache.get(cacheKey);
    if (
      cachedEntry &&
      nowMs - cachedEntry.capturedAtMs <= this.loadLaneTableAdmissionCacheMaxAgeMs &&
      this.isLoadLaneTableAdmissionCacheEntryCurrent(cachedEntry, actualIngress)
    ) {
      return cachedEntry.state;
    }

    const snapshot = await this.serviceDiscovery.resolveServiceDiscoverySnapshot({
      tableName: normalizedTableName,
      serviceIdAllowlist: [actualIngress.serviceId],
      protocolAllowlist: [actualIngress.protocol],
      allowAuthoritativeRepair: true,
    });
    const rawServices = Array.isArray(snapshot?.services) ?
      snapshot.services : ADMIN_CACHE_DUMP.EMPTY;
    const services = filterMatchingServices(rawServices, actualIngress);
    const resolvedState = this._resolveReplicaFromServices(
      services, actualIngress, normalizedTableName,
    );

    if (this.shouldCacheLoadLaneTableAdmissionState(snapshot, resolvedState)) {
      this.loadLaneTableAdmissionCache.set(cacheKey, {
        capturedAtMs: nowMs,
        state: resolvedState,
        binding: {
          tableName: normalizedTableName,
          serviceId: actualIngress.serviceId,
          protocol: actualIngress.protocol,
          nodeId: actualIngress.nodeId,
          incarnation: actualIngress.incarnation,
        },
      });
    } else {
      this.loadLaneTableAdmissionCache.delete(cacheKey);
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
      await this.resolveLoadLaneTableAdmissionState(tableName, executionContext);
    if (admissionState?.ready === true) {
      return;
    }
    const reasonCodes = Array.isArray(admissionState?.reasonCodes) &&
      admissionState.reasonCodes.length > 0 ? admissionState.reasonCodes :
      [LOCAL_STR_BENCHMARK_ADMISSION_BLOCKED];
    throw createRetryableAdminOperationError(
      ErrorCode.INTERNAL_ERROR,
      LOCAL_STR_SERVE_NOT_READY_LOAD_LANE_ADMISSION_DENI + this.nodeId +
        LOCAL_STR_TABLENAME + tableName + LOCAL_STR_BENCHMARKREADY_FALSE_REASONS +
        reasonCodes.join(LOCAL_STR_COMMA) + LOCAL_STR_RPAREN,
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
    // deferRetry means "later", never "not applied" (transport owner).
    if (hasWriteOutcomeUnknown(value)) {
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
