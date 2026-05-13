import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  HTTP_STATUS,
  NUM,
  TABLES,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../../constants/index.js';
import {NODE_STATE} from '../../constants/node-state.js';
import {CONNECTION_STATE} from '../../constants/transport.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {LIFECYCLE_REASON} from '../lifecycle-controller-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_REQUEST_FIELD,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../bootstrap-api-constants.js';
import {
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  createTopLevelOperationBudget,
  getRemainingBudgetMs,
} from '../../control-plane/timeout-budget.js';
import {
  buildMembershipOwnerOutcome,
} from '../../control-plane/membership-lifecycle-controller.js';

const LOCAL_STR_836HW = 'move_replica_handoff_stabilizing';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_DASH = '-';
const LOCAL_NUM_ZERO = 0;
const BOOTSTRAP_REQUEST_EXECUTION_OPERATION_NAME =
  'bootstrap_request_execution';
const BOOTSTRAP_REQUEST_TIMEOUT_BUDGET_FIELD = 'timeoutBudget';
const BOOTSTRAP_ADMISSION_PEER_ENDPOINT_ID_SUFFIX =
  'bootstrap-admission-ws';
const BOOTSTRAP_ADMISSION_PEER_ENDPOINT_PRIORITY = NUM.ZERO;
const BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY = Object.freeze([]);
const BOOTSTRAP_REQUEST_ADMISSION_DECISION = Object.freeze({
  ADMIT: 'admit',
  DEFER_STARTUP_INCOMPLETE: 'defer_startup_incomplete',
  DEFER_BOOTSTRAP_JOIN_BLOCKED: 'defer_bootstrap_join_blocked',
});
const BOOTSTRAP_REQUEST_STALE_STARTUP_COMPLETE_REASON_CODES = Object.freeze([
  BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.SQL_ENGINE_UNAVAILABLE,
  BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
  LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
]);
const BOOTSTRAP_REQUEST_REQUIRED_STALE_STARTUP_COMPLETE_REASON_CODES =
  Object.freeze([
    BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
  ]);
const BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE = Object.freeze({
  UNBOUNDED: 'unbounded',
  ACTIVE: 'active',
  EXPIRED: 'expired',
});
const BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION = Object.freeze({
  PROCEED: 'proceed',
  DEFER_EXPIRED: 'defer_expired',
});
const BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE = Object.freeze({
  state: BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.UNBOUNDED,
  deadlineMs: NUM.ZERO,
  remainingBudgetMs: NUM.ZERO,
});
const BOOTSTRAP_REQUEST_DEFER_STAGE = Object.freeze({
  REQUEST_START: 'request_start',
  BOOTSTRAP_JOIN_ADMISSION: 'bootstrap_join_admission',
  ADMISSION_BOUNDARY: 'admission_boundary',
  ADMISSION_SATURATION: 'admission_saturation',
  ADMISSION_CLAIM: 'admission_claim',
  REQUEST_EXECUTION_START: 'request_execution_start',
  BLOCKING_MOVE_REPLICA_ADMISSIONS: 'blocking_move_replica_admissions',
  SERVICE_LEADER_READINESS: 'service_leader_readiness',
  ASSIGNMENT_RESERVATION: 'assignment_reservation',
  RESPONSE_PREPARED: 'response_prepared',
  RETRYABLE_ERROR: 'retryable_error',
});

const RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS = Object.freeze([
  'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  'ControlPlaneSystemTableGateway requires sqlQueryEngine',
]);
const BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED =
  'bootstrap_request_admission_untracked';
const BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS = Object.freeze([]);

function normalizeBootstrapRequestAdmissionReason(reason) {
  if (typeof reason !== TYPEOF.STRING) {
    return null;
  }
  const normalized = reason.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function normalizeBootstrapRequestAdmissionReasons(snapshot) {
  if (!Array.isArray(snapshot?.reasons)) {
    return [];
  }
  return [
    ...new Set(
      snapshot.reasons
        .map((reason) => normalizeBootstrapRequestAdmissionReason(reason))
        .filter((reason) => reason !== null),
    ),
  ];
}

function hasStartupCompleteStaleAdmissionReasons(snapshot) {
  const reasons = normalizeBootstrapRequestAdmissionReasons(snapshot);
  const hasRequiredReasons =
    BOOTSTRAP_REQUEST_REQUIRED_STALE_STARTUP_COMPLETE_REASON_CODES.every(
      (reason) => reasons.includes(reason),
    );
  const hasOnlyStaleReasons = reasons.every((reason) =>
    BOOTSTRAP_REQUEST_STALE_STARTUP_COMPLETE_REASON_CODES.includes(reason),
  );
  return reasons.length > NUM.ZERO && hasRequiredReasons && hasOnlyStaleReasons;
}

function canAdmitStartupCompleteStaleAdmissionSnapshot(
  startupComplete,
  snapshot,
) {
  return startupComplete === true &&
    snapshot?.draining !== true &&
    snapshot?.bootstrapJoinAuthorityAvailable === true &&
    hasStartupCompleteStaleAdmissionReasons(snapshot);
}

function normalizeBootstrapAdmissionPeerHints(hints) {
  if (!Array.isArray(hints)) {
    return BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY;
  }
  return hints.filter((hint) =>
    typeof hint?.nodeId === TYPEOF.STRING &&
    hint.nodeId.length > NUM.ZERO &&
    typeof hint?.nodeAddress === TYPEOF.STRING &&
    hint.nodeAddress.length > NUM.ZERO,
  );
}

function buildBootstrapAdmissionPeerEndpointId(nodeId) {
  return [
    nodeId,
    BOOTSTRAP_ADMISSION_PEER_ENDPOINT_ID_SUFFIX,
  ].join(LOCAL_STR_DASH);
}

function buildBootstrapAdmissionPeerNodeRows(peerHints) {
  return peerHints.map((hint) => ({
    [COLUMN.NODE_ID]: hint.nodeId,
    [COLUMN.NODE_ADDRESS]: hint.nodeAddress,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: CONNECTION_STATE.CONNECTING,
  }));
}

function buildBootstrapAdmissionPeerEndpointRows(peerHints) {
  return peerHints.map((hint) => ({
    [COLUMN.ENDPOINT_ID]:
      buildBootstrapAdmissionPeerEndpointId(hint.nodeId),
    [COLUMN.NODE_ID]: hint.nodeId,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: resolveAdvertisedWebSocketAddress({
      nodeAddress: hint.nodeAddress,
    }),
    [COLUMN.PRIORITY]: BOOTSTRAP_ADMISSION_PEER_ENDPOINT_PRIORITY,
    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
  }));
}

function appendRowsMissingKey(existingRows, supplementalRows, keyField) {
  const rows = Array.isArray(existingRows) ? [...existingRows] : [];
  const observedKeys = new Set(rows.map((row) => row?.[keyField]).filter(
    (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
  ));
  for (const row of supplementalRows) {
    const key = row?.[keyField];
    if (
      typeof key !== TYPEOF.STRING ||
      key.length === NUM.ZERO ||
      observedKeys.has(key)
    ) {
      continue;
    }
    observedKeys.add(key);
    rows.push(row);
  }
  return rows;
}

function normalizeBootstrapRequestClientAttemptDeadlineMs(requestBody) {
  const rawDeadlineMs =
    requestBody?.[BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS];
  if (!Number.isFinite(rawDeadlineMs)) {
    return NUM.ZERO;
  }
  const deadlineMs = Math.floor(rawDeadlineMs);
  return deadlineMs > NUM.ZERO ? deadlineMs : NUM.ZERO;
}

function evaluateBootstrapRequestClientAttemptDeadline(
  requestBody,
  observedAtMs,
) {
  const deadlineMs =
    normalizeBootstrapRequestClientAttemptDeadlineMs(requestBody);
  if (deadlineMs <= NUM.ZERO) {
    return BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE;
  }
  const remainingBudgetMs = Math.max(
    NUM.ZERO,
    deadlineMs - observedAtMs,
  );
  return Object.freeze({
    state: remainingBudgetMs > NUM.ZERO ?
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.ACTIVE :
      BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.EXPIRED,
    deadlineMs,
    remainingBudgetMs,
  });
}

function normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
  requestBody,
  observedAtMs,
) {
  const clientAttemptDeadline =
    evaluateBootstrapRequestClientAttemptDeadline(requestBody, observedAtMs);
  return Object.freeze({
    decision:
      clientAttemptDeadline.state ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.EXPIRED ?
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED :
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.PROCEED,
    observedAtMs,
    clientAttemptDeadline,
  });
}

class BootstrapRequestOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getSeedNodeAddress() {
    return this.delegates.getSeedNodeAddress?.() || null;
  }

  getSeedNodeWsAddress() {
    return this.delegates.getSeedNodeWsAddress?.() || null;
  }

  getWsPort() {
    return this.delegates.getWsPort?.() || null;
  }

  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }

  async getBootstrapJoinAdmissionSnapshot() {
    const snapshot =
      await this.delegates.getBootstrapJoinAdmissionSnapshot?.();
    return snapshot && typeof snapshot === TYPEOF.OBJECT ?
      snapshot :
      null;
  }

  isBootstrapRequestStartupComplete(bootstrapService) {
    if (!bootstrapService) {
      return true;
    }
    if (
      typeof bootstrapService.isBootstrapStartupComplete === TYPEOF.FUNCTION
    ) {
      return bootstrapService.isBootstrapStartupComplete() === true;
    }
    return bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  }

  getMaxConcurrentBootstrapRequests() {
    return this.delegates.getMaxConcurrentBootstrapRequests?.() || NUM.ZERO;
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || NUM.ZERO;
  }

  getBootstrapRequestExecutionBudgetMs() {
    return this.delegates.getBootstrapRequestExecutionBudgetMs?.() || NUM.ZERO;
  }

  getBootstrapAdmissionLeaseMs() {
    return this.delegates.getBootstrapAdmissionLeaseMs?.() || NUM.ZERO;
  }

  expireStaleBootstrapAdmissions(now) {
    return this.delegates.expireStaleBootstrapAdmissions?.(now) ||
      BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS;
  }

  acquireBootstrapAdmission(snapshot) {
    const admission = this.delegates.acquireBootstrapAdmission?.(snapshot);
    if (admission && typeof admission === TYPEOF.OBJECT) {
      return admission;
    }
    this.setInFlightBootstrapRequestCount(
      this.getInFlightBootstrapRequestCount() + NUM.ONE,
    );
    return {
      admissionId: BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED,
    };
  }

  releaseBootstrapAdmission(admission) {
    if (
      admission?.admissionId &&
      admission.admissionId !== BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED &&
      typeof this.delegates.releaseBootstrapAdmission === TYPEOF.FUNCTION
    ) {
      this.delegates.releaseBootstrapAdmission(admission);
      return;
    }
    this.setInFlightBootstrapRequestCount(
      Math.max(
        NUM.ZERO,
        this.getInFlightBootstrapRequestCount() - NUM.ONE,
      ),
    );
  }

  getInFlightBootstrapRequestCount() {
    return this.delegates.getInFlightBootstrapRequestCount?.() || NUM.ZERO;
  }

  setInFlightBootstrapRequestCount(count) {
    this.delegates.setInFlightBootstrapRequestCount?.(count);
  }

  validateBootstrapRequest(nodeId, nodeAddress) {
    return this.delegates.validateBootstrapRequest?.(nodeId, nodeAddress);
  }

  async checkForConflicts(nodeId, nodeAddress, options = {}) {
    return this.delegates.checkForConflicts?.(
      nodeId,
      nodeAddress,
      options,
    );
  }

  async getBlockingMoveReplicaBootstrapAdmissions(now, options = {}) {
    return this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(
      now,
      options,
    ) || [];
  }

  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now) {
    return this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs?.(
      reservation,
      now,
    ) || NUM.ZERO;
  }

  buildBootstrapNotReadyResponse(options) {
    return this.delegates.buildBootstrapNotReadyResponse?.(options) || {
      success: false,
      error: options?.error,
      code: options?.code,
    };
  }

  async waitForServiceLeaders(options = {}) {
    return this.delegates.waitForServiceLeaders?.(options) || {ready: false};
  }

  async determineAndReserveMessageGroupAssignment(nodeId, options = {}) {
    return this.delegates.determineAndReserveMessageGroupAssignment?.(
      nodeId,
      options,
    );
  }

  getCurrentEpoch() {
    return this.delegates.getCurrentEpoch?.() || null;
  }

  buildBootstrapTopologySnapshotEnvelope(options) {
    return this.delegates.buildBootstrapTopologySnapshotEnvelope?.(options) || {
      systemTableSnapshots: {},
      topologySnapshotMeta: null,
    };
  }

  buildBootstrapResponseTopologySnapshotEnvelope(options) {
    return this.delegates.buildBootstrapResponseTopologySnapshotEnvelope?.(
      options,
    ) || this.buildBootstrapTopologySnapshotEnvelope(options);
  }

  getClusterConfiguration() {
    return this.delegates.getClusterConfiguration?.() || {};
  }

  getReadyNodes(options = {}) {
    return this.delegates.getReadyNodes?.(options) || [];
  }

  getBootstrapAdmissionPeerHints() {
    return normalizeBootstrapAdmissionPeerHints(
      this.delegates.getBootstrapAdmissionPeerHints?.(),
    );
  }

  attachBootstrapAdmissionPeerHints(topologySnapshotEnvelope, options = {}) {
    const excludedNodeId =
      typeof options.excludeNodeId === TYPEOF.STRING ?
        options.excludeNodeId :
        null;
    const peerHints = this.getBootstrapAdmissionPeerHints().filter((hint) =>
      hint.nodeId !== excludedNodeId,
    );
    if (peerHints.length === NUM.ZERO) {
      return topologySnapshotEnvelope;
    }
    const systemTableSnapshots = {
      ...(topologySnapshotEnvelope?.systemTableSnapshots || {}),
    };
    systemTableSnapshots[TABLES.NODES] = appendRowsMissingKey(
      systemTableSnapshots[TABLES.NODES],
      buildBootstrapAdmissionPeerNodeRows(peerHints),
      COLUMN.NODE_ID,
    );
    systemTableSnapshots[TABLES.NODE_ENDPOINTS] = appendRowsMissingKey(
      systemTableSnapshots[TABLES.NODE_ENDPOINTS],
      buildBootstrapAdmissionPeerEndpointRows(peerHints),
      COLUMN.ENDPOINT_ID,
    );
    const tableRowCounts = {
      ...(topologySnapshotEnvelope?.topologySnapshotMeta?.tableRowCounts || {}),
      [TABLES.NODES]: systemTableSnapshots[TABLES.NODES].length,
      [TABLES.NODE_ENDPOINTS]:
        systemTableSnapshots[TABLES.NODE_ENDPOINTS].length,
    };
    return {
      ...topologySnapshotEnvelope,
      systemTableSnapshots,
      topologySnapshotMeta: {
        ...(topologySnapshotEnvelope?.topologySnapshotMeta || {}),
        tableRowCounts,
        bootstrapAdmissionPeerHintNodeIds:
          peerHints.map((hint) => hint.nodeId),
      },
    };
  }

  getTablePolicies() {
    return this.delegates.getTablePolicies?.() || {};
  }

  getLatencyTopologyHints(nodeId) {
    return this.delegates.getLatencyTopologyHints?.(nodeId) || null;
  }

  getStartupAuthoritySnapshotForBootstrapResponse(observedAt) {
    const startupAuthority =
      this.delegates.getStartupAuthoritySnapshotForBootstrapResponse?.(
        observedAt,
      );
    return startupAuthority && typeof startupAuthority === TYPEOF.OBJECT ?
      startupAuthority :
      null;
  }

  isRetryableBootstrapDependencyError(error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    return RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    );
  }

  isRetryableBootstrapRequestError(error) {
    if (!error) {
      return false;
    }
    if (Number.isFinite(error?.statusCode) &&
        Math.floor(error.statusCode) === HTTP_STATUS.SERVICE_UNAVAILABLE) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    return isRetryableControlPlaneError(error) ||
      this.isRetryableBootstrapDependencyError(error);
  }

  resolveBootstrapRequestRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (retryAfterMs > NUM.ZERO) {
      return retryAfterMs;
    }
    return Math.max(NUM.ZERO, this.getBootstrapAdmissionRetryAfterMs());
  }

  createBootstrapRequestExecutionBudget(
    startedAtMs,
    clientAttemptDeadline =
      BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE,
  ) {
    const configuredBudgetMs = this.getBootstrapRequestExecutionBudgetMs();
    if (!Number.isFinite(configuredBudgetMs) || configuredBudgetMs <= NUM.ZERO) {
      return null;
    }
    const clientAttemptRemainingBudgetMs = Math.max(
      NUM.ZERO,
      clientAttemptDeadline.deadlineMs - startedAtMs,
    );
    const effectiveBudgetMs =
      clientAttemptDeadline.state ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE.ACTIVE ?
        Math.min(configuredBudgetMs, clientAttemptRemainingBudgetMs) :
        configuredBudgetMs;
    return createTopLevelOperationBudget({
      configuredBudgetMs: effectiveBudgetMs,
      startedAtMs,
      operationName: BOOTSTRAP_REQUEST_EXECUTION_OPERATION_NAME,
    });
  }

  hasRemainingBootstrapRequestExecutionBudget(
    timeoutBudget,
    now = Date.now(),
  ) {
    if (!timeoutBudget || typeof timeoutBudget !== TYPEOF.OBJECT) {
      return true;
    }
    return getRemainingBudgetMs(timeoutBudget, {
      now: () => now,
    }) > NUM.ZERO;
  }

  logBootstrapRequestDeferred(options = {}) {
    const clientAttemptDeadline =
      options.clientAttemptDeadline &&
      typeof options.clientAttemptDeadline === TYPEOF.OBJECT ?
        options.clientAttemptDeadline :
        null;
    const timeoutBudget =
      options.timeoutBudget &&
      typeof options.timeoutBudget === TYPEOF.OBJECT ?
        options.timeoutBudget :
        null;
    const observedAtMs = Number.isFinite(options.observedAtMs) ?
      Math.floor(options.observedAtMs) :
      Date.now();
    const logPayload = {
      nodeId: options.nodeId || null,
      nodeAddress: options.nodeAddress || null,
      seedNodeId: this.getSeedNodeId(),
      deferStage: options.deferStage || null,
      reasonCode: options.reasonCode || null,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.floor(options.retryAfterMs) :
        this.getBootstrapAdmissionRetryAfterMs(),
      observedAtMs,
    };
    if (clientAttemptDeadline) {
      logPayload.clientAttemptDeadlineState = clientAttemptDeadline.state;
      logPayload.clientAttemptDeadlineMs = clientAttemptDeadline.deadlineMs;
      logPayload.clientAttemptRemainingBudgetMs =
        clientAttemptDeadline.remainingBudgetMs;
    }
    if (timeoutBudget) {
      logPayload.requestExecutionRemainingBudgetMs =
        getRemainingBudgetMs(timeoutBudget, {now: () => observedAtMs});
      logPayload.requestExecutionConfiguredBudgetMs =
        timeoutBudget.configuredBudgetMs;
    }
    this.getLogger().warn(
      BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_REQUEST_DEFERRED,
      logPayload,
    );
  }

  buildBootstrapRequestExecutionBudgetDeferredResponse(
    reply,
    options = {},
  ) {
    const observedAt = Number.isFinite(options.observedAtMs) ?
      Math.floor(options.observedAtMs) :
      Date.now();
    const reasonCode =
      BOOTSTRAP_API_PROBE_REASON
        .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED;
    this.logBootstrapRequestDeferred({
      ...options,
      observedAtMs: observedAt,
      reasonCode,
      retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
    });
    const startupAuthority =
      this.getStartupAuthoritySnapshotForBootstrapResponse(observedAt);
    reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
    return this.buildBootstrapNotReadyResponse({
      error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      reasonCode,
      retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      startupAuthority,
    });
  }

  buildBootstrapRequestClientAttemptExpiredDeferredResponse(
    reply,
    options = {},
  ) {
    const observedAt = Number.isFinite(options.observedAtMs) ?
      Math.floor(options.observedAtMs) :
      Date.now();
    const reasonCode =
      BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED;
    this.logBootstrapRequestDeferred({
      ...options,
      observedAtMs: observedAt,
      reasonCode,
      retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
    });
    const startupAuthority =
      this.getStartupAuthoritySnapshotForBootstrapResponse(observedAt);
    reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
    return this.buildBootstrapNotReadyResponse({
      error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      reasonCode,
      retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      startupAuthority,
    });
  }

  attachBootstrapRequestExecutionBudget(options = {}, timeoutBudget) {
    if (!timeoutBudget || typeof timeoutBudget !== TYPEOF.OBJECT) {
      return options;
    }
    const nextOptions = {
      ...options,
    };
    Object.defineProperty(
      nextOptions,
      BOOTSTRAP_REQUEST_TIMEOUT_BUDGET_FIELD,
      {
        value: timeoutBudget,
        enumerable: false,
        configurable: true,
        writable: false,
      },
    );
    return nextOptions;
  }

  evaluateBootstrapRequestAdmissionDecision(
    bootstrapService,
    bootstrapJoinAdmissionSnapshot,
  ) {
    const startupComplete =
      this.isBootstrapRequestStartupComplete(bootstrapService);
    const staleStartupCompleteAdmission =
      canAdmitStartupCompleteStaleAdmissionSnapshot(
        startupComplete,
        bootstrapJoinAdmissionSnapshot,
      );
    const bootstrapJoinAdmissionReady =
      bootstrapJoinAdmissionSnapshot?.ready === true ||
      staleStartupCompleteAdmission;
    const admissionDecision = {
      decision: BOOTSTRAP_REQUEST_ADMISSION_DECISION.ADMIT,
      phase: null,
      reasonCode: null,
      retryAfterMs: bootstrapJoinAdmissionSnapshot?.retryAfterMs,
    };
    if (!bootstrapJoinAdmissionReady && !startupComplete) {
      admissionDecision.decision =
        BOOTSTRAP_REQUEST_ADMISSION_DECISION.DEFER_STARTUP_INCOMPLETE;
      admissionDecision.phase =
        typeof bootstrapService?.phase === TYPEOF.STRING ?
          bootstrapService.phase :
          null;
      admissionDecision.reasonCode =
        BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE;
    } else if (
      !bootstrapJoinAdmissionReady &&
      bootstrapJoinAdmissionSnapshot?.bootstrapJoinAuthorityAvailable === true
    ) {
      admissionDecision.decision =
        BOOTSTRAP_REQUEST_ADMISSION_DECISION.DEFER_BOOTSTRAP_JOIN_BLOCKED;
      admissionDecision.phase =
        typeof bootstrapJoinAdmissionSnapshot?.phase === TYPEOF.STRING ?
          bootstrapJoinAdmissionSnapshot.phase :
          null;
    }
    return admissionDecision;
  }

  async handleBootstrapRequest(request, reply) {
    const requestBody = request.body || {};
    const {nodeId, nodeAddress} = requestBody;

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, {
      nodeId,
      nodeAddress,
      seedNodeId: this.getSeedNodeId(),
    });

    const validationError =
      this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {error: validationError};
    }

    const requestStartedAtMs = Date.now();
    const requestStartDeadlineSnapshot =
      normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
        requestBody,
        requestStartedAtMs,
      );
    if (
      requestStartDeadlineSnapshot.decision ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
    ) {
      return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.REQUEST_START,
          observedAtMs: requestStartDeadlineSnapshot.observedAtMs,
          clientAttemptDeadline:
            requestStartDeadlineSnapshot.clientAttemptDeadline,
        },
      );
    }

    const bootstrapService = this.getBootstrapService();
    const bootstrapJoinAdmissionSnapshot =
      await this.getBootstrapJoinAdmissionSnapshot();
    const bootstrapRequestAdmissionDecision =
      this.evaluateBootstrapRequestAdmissionDecision(
        bootstrapService,
        bootstrapJoinAdmissionSnapshot,
      );
    if (
      bootstrapRequestAdmissionDecision.decision !==
        BOOTSTRAP_REQUEST_ADMISSION_DECISION.ADMIT
    ) {
      const responseTimestamp = Date.now();
      const startupAuthority =
        this.getStartupAuthoritySnapshotForBootstrapResponse(
          responseTimestamp,
        );
      this.logBootstrapRequestDeferred({
        nodeId,
        nodeAddress,
        deferStage:
          BOOTSTRAP_REQUEST_DEFER_STAGE.BOOTSTRAP_JOIN_ADMISSION,
        observedAtMs: responseTimestamp,
        reasonCode: bootstrapRequestAdmissionDecision.reasonCode,
        retryAfterMs: bootstrapRequestAdmissionDecision.retryAfterMs,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        phase: bootstrapRequestAdmissionDecision.phase,
        reasonCode: bootstrapRequestAdmissionDecision.reasonCode,
        retryAfterMs: bootstrapRequestAdmissionDecision.retryAfterMs,
        startupAuthority,
      });
    }

    const requestStartupMode = requestBody.startupMode || null;
    const membershipOwnerOutcome = buildMembershipOwnerOutcome({
      membershipOwnerOutcome: requestBody.membershipOwnerOutcome,
      startupMode: requestStartupMode,
    });

    const conflictError = await this.checkForConflicts(
      nodeId,
      nodeAddress,
      {
        startupMode: requestStartupMode,
        membershipOwnerOutcome,
      },
    );
    if (conflictError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

    const admissionBoundaryDeadlineSnapshot =
      normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
        requestBody,
        Date.now(),
      );
    if (
      admissionBoundaryDeadlineSnapshot.decision ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
    ) {
      return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_BOUNDARY,
          observedAtMs: admissionBoundaryDeadlineSnapshot.observedAtMs,
          clientAttemptDeadline:
            admissionBoundaryDeadlineSnapshot.clientAttemptDeadline,
        },
      );
    }

    this.expireStaleBootstrapAdmissions(
      admissionBoundaryDeadlineSnapshot.observedAtMs,
    );
    if (this.getInFlightBootstrapRequestCount() >=
        this.getMaxConcurrentBootstrapRequests()) {
      const retryAfterMs = this.getBootstrapAdmissionRetryAfterMs();
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.getSeedNodeId(),
        inFlightBootstrapRequests: this.getInFlightBootstrapRequestCount(),
        maxConcurrentBootstrapRequests:
          this.getMaxConcurrentBootstrapRequests(),
        retryAfterMs,
      });
      this.logBootstrapRequestDeferred({
        nodeId,
        nodeAddress,
        deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_SATURATION,
        observedAtMs: admissionBoundaryDeadlineSnapshot.observedAtMs,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
        retryAfterMs,
        clientAttemptDeadline:
          admissionBoundaryDeadlineSnapshot.clientAttemptDeadline,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
        retryAfterMs,
      });
    }

    const admissionClaimDeadlineSnapshot =
      normalizeBootstrapRequestClientAttemptDeadlineSnapshot(
        requestBody,
        Date.now(),
      );
    if (
      admissionClaimDeadlineSnapshot.decision ===
        BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_DECISION.DEFER_EXPIRED
    ) {
      return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
        reply,
        {
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ADMISSION_CLAIM,
          observedAtMs: admissionClaimDeadlineSnapshot.observedAtMs,
          clientAttemptDeadline:
            admissionClaimDeadlineSnapshot.clientAttemptDeadline,
        },
      );
    }

    const now = admissionClaimDeadlineSnapshot.observedAtMs;
    const admission = this.acquireBootstrapAdmission({
      nodeId,
      nodeAddress,
      now,
    });
    const requestExecutionBudget =
      this.createBootstrapRequestExecutionBudget(
        now,
        admissionClaimDeadlineSnapshot.clientAttemptDeadline,
      );
    try {
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestClientAttemptExpiredDeferredResponse(
          reply,
          {
            nodeId,
            nodeAddress,
            deferStage:
              BOOTSTRAP_REQUEST_DEFER_STAGE.REQUEST_EXECUTION_START,
            observedAtMs: now,
            clientAttemptDeadline:
              admissionClaimDeadlineSnapshot.clientAttemptDeadline,
            timeoutBudget: requestExecutionBudget,
          },
        );
      }
      const budgetedBlockingOptions =
        this.attachBootstrapRequestExecutionBudget(
          {},
          requestExecutionBudget,
        );
      const blockingMoveReplicaAdmissions =
        await this.getBlockingMoveReplicaBootstrapAdmissions(
          now,
          budgetedBlockingOptions,
        );
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
          {
            nodeId,
            nodeAddress,
            deferStage:
              BOOTSTRAP_REQUEST_DEFER_STAGE
                .BLOCKING_MOVE_REPLICA_ADMISSIONS,
            timeoutBudget: requestExecutionBudget,
          },
        );
      }
      if (blockingMoveReplicaAdmissions.length > NUM.ZERO) {
        const blockingReservation = blockingMoveReplicaAdmissions[NUM.ZERO];
        const retryAfterMs =
          this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
            blockingReservation,
            now,
          );
        this.getLogger().warn(
          BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED,
          {
            nodeId,
            nodeAddress,
            seedNodeId: this.getSeedNodeId(),
            admissionBlock: LOCAL_STR_836HW,
            assignmentId: blockingReservation.assignmentId,
            replicaId: blockingReservation.replicaId,
            groupId: blockingReservation.groupId || null,
            sourceNodeId: blockingReservation.sourceNodeId || null,
            targetNodeId: blockingReservation.targetNodeId,
            retryAfterMs,
          },
        );
        this.logBootstrapRequestDeferred({
          nodeId,
          nodeAddress,
          deferStage:
            BOOTSTRAP_REQUEST_DEFER_STAGE
              .BLOCKING_MOVE_REPLICA_ADMISSIONS,
          reasonCode:
            BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
          retryAfterMs,
          timeoutBudget: requestExecutionBudget,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
          reasonCode:
            BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
          retryAfterMs,
        });
      }

      const leaderStatus = await this.waitForServiceLeaders({
        startupMode: requestStartupMode,
        membershipOwnerOutcome,
      });
      if (!leaderStatus.ready) {
        const responseTimestamp = Date.now();
        const startupAuthority =
          this.getStartupAuthoritySnapshotForBootstrapResponse(
            responseTimestamp,
          );
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
          nodeId,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes,
        });
        this.logBootstrapRequestDeferred({
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.SERVICE_LEADER_READINESS,
          observedAtMs: responseTimestamp,
          reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          timeoutBudget: requestExecutionBudget,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          leaderReadiness: leaderStatus,
          startupAuthority,
        });
      }
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
          {
            nodeId,
            nodeAddress,
            deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.SERVICE_LEADER_READINESS,
            timeoutBudget: requestExecutionBudget,
          },
        );
      }

      const budgetedAssignmentOptions =
        this.attachBootstrapRequestExecutionBudget(
          {
            startupMode: requestStartupMode,
            membershipOwnerOutcome,
          },
          requestExecutionBudget,
        );
      const assignment =
        await this.determineAndReserveMessageGroupAssignment(
          nodeId,
          budgetedAssignmentOptions,
        );
      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
          {
            nodeId,
            nodeAddress,
            deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.ASSIGNMENT_RESERVATION,
            timeoutBudget: requestExecutionBudget,
          },
        );
      }
      const currentEpoch = this.getCurrentEpoch();
      const topologySnapshotEnvelope = this.attachBootstrapAdmissionPeerHints(
        this.buildBootstrapResponseTopologySnapshotEnvelope({
          currentEpoch,
        }),
        {excludeNodeId: nodeId},
      );
      const {
        systemTableSnapshots,
        topologySnapshotMeta,
      } = topologySnapshotEnvelope;
      const clusterConfig = this.getClusterConfiguration();
      const readyNodes = this.getReadyNodes({
        requirePublishedMembership: true,
      });

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, {
        nodeId,
        readyNodesCount: readyNodes.length,
        readyNodes,
        seedNodeId: this.getSeedNodeId(),
      });

      const tablePolicies = this.getTablePolicies();
      const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);
      const responseTimestamp = Date.now();
      const startupAuthority =
        this.getStartupAuthoritySnapshotForBootstrapResponse(responseTimestamp);
      const seedNodeWsAddress = resolveAdvertisedWebSocketAddress({
        advertisedAddress: this.getSeedNodeWsAddress(),
        nodeAddress: this.getSeedNodeAddress() ||
          BOOTSTRAP_API_DEFAULT.WS_HOST,
        wsPort: this.getWsPort() || null,
      });

      const response = {
        success: true,
        seedNodeId: this.getSeedNodeId(),
        seedNodeAddress: this.getSeedNodeAddress(),
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        topologySnapshotMeta,
        readyNodes,
        tablePolicies,
        currentEpoch,
        latencyTopologyHints,
        clusterConfig,
        ...(startupAuthority ?
          {
            [BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY]:
              startupAuthority,
          } :
          {}),
        leaderReadiness: {
          ready: leaderStatus.ready === true,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders || [],
          missingPartitionLeaderNodes:
            leaderStatus.missingPartitionLeaderNodes || [],
          missingPartitionLeaderAddresses:
            leaderStatus.missingPartitionLeaderAddresses || [],
          missingMessageGroupLeaders:
            leaderStatus.missingMessageGroupLeaders || [],
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes || [],
          missingMessageGroupLeaderAddresses:
            leaderStatus.missingMessageGroupLeaderAddresses || [],
        },
        timestamp: responseTimestamp,
      };

      if (!this.hasRemainingBootstrapRequestExecutionBudget(
        requestExecutionBudget,
      )) {
        return this.buildBootstrapRequestExecutionBudgetDeferredResponse(
          reply,
          {
            nodeId,
            nodeAddress,
            deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.RESPONSE_PREPARED,
            observedAtMs: responseTimestamp,
            timeoutBudget: requestExecutionBudget,
          },
        );
      }

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      if (this.isRetryableBootstrapRequestError(error)) {
        const retryAfterMs = this.resolveBootstrapRequestRetryAfterMs(error);
        const responseTimestamp = Date.now();
        const startupAuthority =
          this.getStartupAuthoritySnapshotForBootstrapResponse(
            responseTimestamp,
          );
        const requestExecutionBudgetExhausted =
          this.hasRemainingBootstrapRequestExecutionBudget(
            requestExecutionBudget,
            responseTimestamp,
          ) !== true;
        const reasonCode =
          typeof error?.reasonCode === TYPEOF.STRING &&
          error.reasonCode.length > NUM.ZERO ?
            error.reasonCode :
            requestExecutionBudgetExhausted ?
              BOOTSTRAP_API_PROBE_REASON
                .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED :
            BOOTSTRAP_API_PROBE_REASON.CONTROL_PLANE_DEPENDENCY_UNAVAILABLE;
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
          nodeId,
          nodeAddress,
          error: error.message,
          code: error?.errorCode || error?.code || null,
          reasonCode,
          retryAfterMs,
        });
        this.logBootstrapRequestDeferred({
          nodeId,
          nodeAddress,
          deferStage: BOOTSTRAP_REQUEST_DEFER_STAGE.RETRYABLE_ERROR,
          observedAtMs: responseTimestamp,
          reasonCode,
          retryAfterMs,
          timeoutBudget: requestExecutionBudget,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code:
            typeof error?.errorCode === LOCAL_STR_STRING &&
            error.errorCode.length > LOCAL_NUM_ZERO ?
              error.errorCode :
              BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
          reasonCode,
          retryAfterMs,
          startupAuthority,
        });
      }
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    } finally {
      this.releaseBootstrapAdmission(admission);
    }
  }
}

export {BootstrapRequestOwner};
