import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  HTTP_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../constants/index.js';
import {NODE_STATE} from '../../constants/node-state.js';
import {CONNECTION_STATE} from '../../constants/transport.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
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
  BOOTSTRAP_REQUEST_ADMISSION_DECISION,
  canAdmitStartupCompleteStaleAdmissionSnapshot,
} from './bootstrap-request-admission-decision.js';
import {
  BOOTSTRAP_REQUEST_CLIENT_ATTEMPT_DEADLINE_STATE,
  BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE,
} from './bootstrap-request-owner-deadline.js';
import {defineBootstrapRequestOwnerHandlerMethods} from
  './bootstrap-request-owner-handler.js';

const LOCAL_STR_DASH = '-';
const BOOTSTRAP_REQUEST_EXECUTION_OPERATION_NAME =
  'bootstrap_request_execution';
const BOOTSTRAP_REQUEST_TIMEOUT_BUDGET_FIELD = 'timeoutBudget';
const BOOTSTRAP_ADMISSION_PEER_ENDPOINT_ID_SUFFIX =
  'bootstrap-admission-ws';
const BOOTSTRAP_ADMISSION_PEER_ENDPOINT_PRIORITY = 0;
const BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY = Object.freeze([]);
const RETRYABLE_BOOTSTRAP_DEPENDENCY_ERROR_FRAGMENTS = Object.freeze([
  'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  'ControlPlaneSystemTableGateway requires sqlQueryEngine',
]);
const BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED =
  'bootstrap_request_admission_untracked';
const BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS = Object.freeze([]);

function normalizeBootstrapAdmissionPeerHints(hints) {
  if (!Array.isArray(hints)) {
    return BOOTSTRAP_ADMISSION_PEER_HINT_EMPTY;
  }
  return hints.filter((hint) =>
    typeof hint?.nodeId === 'string' &&
    hint.nodeId.length > 0 &&
    typeof hint?.nodeAddress === 'string' &&
    hint.nodeAddress.length > 0,
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
    (value) => typeof value === 'string' && value.length > 0,
  ));
  for (const row of supplementalRows) {
    const key = row?.[keyField];
    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      observedKeys.has(key)
    ) {
      continue;
    }
    observedKeys.add(key);
    rows.push(row);
  }
  return rows;
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

  getClusterId() {
    return this.delegates.getClusterId?.() || null;
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
    return snapshot && typeof snapshot === 'object' ?
      snapshot :
      null;
  }

  isBootstrapRequestStartupComplete(bootstrapService) {
    if (!bootstrapService) {
      return true;
    }
    if (
      typeof bootstrapService.isBootstrapStartupComplete === 'function'
    ) {
      return bootstrapService.isBootstrapStartupComplete() === true;
    }
    return bootstrapService.phase === BOOTSTRAP_PHASE.COMPLETE;
  }

  getMaxConcurrentBootstrapRequests() {
    return this.delegates.getMaxConcurrentBootstrapRequests?.() || 0;
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || 0;
  }

  getBootstrapRequestExecutionBudgetMs() {
    return this.delegates.getBootstrapRequestExecutionBudgetMs?.() || 0;
  }

  getBootstrapAdmissionLeaseMs() {
    return this.delegates.getBootstrapAdmissionLeaseMs?.() || 0;
  }

  expireStaleBootstrapAdmissions(now) {
    return this.delegates.expireStaleBootstrapAdmissions?.(now) ||
      BOOTSTRAP_REQUEST_ADMISSION_EMPTY_EXPIRATIONS;
  }

  acquireBootstrapAdmission(snapshot) {
    const admission = this.delegates.acquireBootstrapAdmission?.(snapshot);
    if (admission && typeof admission === 'object') {
      return admission;
    }
    this.setInFlightBootstrapRequestCount(
      this.getInFlightBootstrapRequestCount() + 1,
    );
    return {
      admissionId: BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED,
    };
  }

  releaseBootstrapAdmission(admission) {
    if (
      admission?.admissionId &&
      admission.admissionId !== BOOTSTRAP_REQUEST_ADMISSION_ID_UNTRACKED &&
      typeof this.delegates.releaseBootstrapAdmission === 'function'
    ) {
      this.delegates.releaseBootstrapAdmission(admission);
      return;
    }
    this.setInFlightBootstrapRequestCount(
      Math.max(
        0,
        this.getInFlightBootstrapRequestCount() - 1,
      ),
    );
  }

  getInFlightBootstrapRequestCount() {
    return this.delegates.getInFlightBootstrapRequestCount?.() || 0;
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
    ) || 0;
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
      typeof options.excludeNodeId === 'string' ?
        options.excludeNodeId :
        null;
    const peerHints = this.getBootstrapAdmissionPeerHints().filter((hint) =>
      hint.nodeId !== excludedNodeId,
    );
    if (peerHints.length === 0) {
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
    return startupAuthority && typeof startupAuthority === 'object' ?
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
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
      return true;
    }
    return isRetryableControlPlaneError(error) ||
      this.isRetryableBootstrapDependencyError(error);
  }

  resolveBootstrapRequestRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (retryAfterMs > 0) {
      return retryAfterMs;
    }
    return Math.max(0, this.getBootstrapAdmissionRetryAfterMs());
  }

  createBootstrapRequestExecutionBudget(
    startedAtMs,
    clientAttemptDeadline =
    BOOTSTRAP_REQUEST_UNBOUNDED_CLIENT_ATTEMPT_DEADLINE,
  ) {
    const configuredBudgetMs = this.getBootstrapRequestExecutionBudgetMs();
    if (!Number.isFinite(configuredBudgetMs) || configuredBudgetMs <= 0) {
      return null;
    }
    const clientAttemptRemainingBudgetMs = Math.max(
      0,
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
    if (!timeoutBudget || typeof timeoutBudget !== 'object') {
      return true;
    }
    return getRemainingBudgetMs(timeoutBudget, {
      now: () => now,
    }) > 0;
  }

  logBootstrapRequestDeferred(options = {}) {
    const clientAttemptDeadline =
      options.clientAttemptDeadline &&
      typeof options.clientAttemptDeadline === 'object' ?
        options.clientAttemptDeadline :
        null;
    const timeoutBudget =
      options.timeoutBudget &&
      typeof options.timeoutBudget === 'object' ?
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
    if (!timeoutBudget || typeof timeoutBudget !== 'object') {
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
        typeof bootstrapService?.phase === 'string' ?
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
        typeof bootstrapJoinAdmissionSnapshot?.phase === 'string' ?
          bootstrapJoinAdmissionSnapshot.phase :
          null;
    }
    return admissionDecision;
  }
}

defineBootstrapRequestOwnerHandlerMethods(BootstrapRequestOwner);

export {BootstrapRequestOwner};
