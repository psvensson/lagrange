import {CLUSTER_SEGMENT_2} from './cluster-segment-2.js';
const {
  ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES,
  ACTIVE_WAIT_BLOCKER_NONE,
  ADMIN_QUERY_TRACE_NORMALIZE_PATTERN,
  ADMIN_QUERY_TRACE_SQL_FINGERPRINT_LENGTH,
  ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH,
  CONTAINER_STOP_ALREADY_STOPPED_PATTERN,
  CONTAINER_STOP_NOT_FOUND_PATTERN,
  CONTAINER_STOP_NOT_RUNNING_PATTERN,
  createHash,
  HTTP_ERROR_STATUS,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  ONE,
  REACHABILITY_ERROR_UNKNOWN,
  REACHABILITY_STATUS_HTTP,
  READINESS_PHASE_RANK,
  SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD,
  SERVICE_DISCOVERY_REPLICAS_FIELD,
  SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD,
  SERVICE_DISCOVERY_REPLICA_READINESS_FIELD,
  SERVICE_DISCOVERY_SERVICES_FIELD,
  STARTUP_RECOVERY_STAGE_RANK_CONTROL_PLANE_RECOVERY_READY,
  UNKNOWN_PHASE,
  UNKNOWN_REASON,
  ZERO,
} = CLUSTER_SEGMENT_2;

const BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD =
  'bootstrapJoinProjection';

function scoreActiveWaitProgress(progressSnapshot) {
  if (!progressSnapshot || typeof progressSnapshot !== 'object') {
    return Number.NEGATIVE_INFINITY;
  }
  const expectedNodeCount =
    Number.isInteger(progressSnapshot.expectedNodeCount) &&
    progressSnapshot.expectedNodeCount > ZERO ?
      progressSnapshot.expectedNodeCount :
      ZERO;
  const pendingAckResolved = Math.max(
    ZERO,
    expectedNodeCount -
      Math.max(ZERO, progressSnapshot.pendingAckCount || ZERO),
  );
  const missingPublishedResolved = Math.max(
    ZERO,
    expectedNodeCount -
      Math.max(ZERO, progressSnapshot.missingPublishedCount || ZERO),
  );
  const gateReasonCount = Math.max(
    ZERO,
    progressSnapshot.gateReasonCount || ZERO,
  );
  const prioritySpreadRank =
    progressSnapshot.prioritySpreadSatisfied === true ?
      2 :
      progressSnapshot.prioritySpreadSatisfied === false ?
        ZERO :
        ONE;
  const prioritySpreadGapScore =
    Number.isInteger(progressSnapshot.prioritySpreadGap) &&
    progressSnapshot.prioritySpreadGap >= ZERO ?
      Math.max(ZERO, 100 - Math.min(100, progressSnapshot.prioritySpreadGap)) :
      50;
  const unresolvedSemanticStateCount = Number(
    progressSnapshot.priorityRecoveryUnresolvedSemanticStateCount,
  );
  const unresolvedPriorityRecoveryCount = Number.isFinite(
    unresolvedSemanticStateCount,
  ) ?
    unresolvedSemanticStateCount :
    Number(progressSnapshot.priorityRecoveryUnresolvedClassCount) || ZERO;
  const priorityRecoveryProgressBonus = Math.max(
    ZERO,
    8 - Math.min(8, unresolvedPriorityRecoveryCount),
  );
  const priorityRecoveryBlockedPartitionBonus = Math.max(
    ZERO,
    8 -
      Math.min(
        8,
        Number(progressSnapshot.priorityRecoveryBlockedPartitionCount) || ZERO,
      ),
  );

  return (
    Math.max(ZERO, progressSnapshot.activeNodeCount || ZERO) * 1_000_000 +
    Math.max(ZERO, progressSnapshot.snapshotCoverageNodeCount || ZERO) *
      10_000 +
    (progressSnapshot.snapshotCoverageComplete === true ? 1_000 : ZERO) +
    Math.max(ZERO, progressSnapshot.publicationStatusRank || ZERO) * 100 +
    pendingAckResolved * 10 +
    missingPublishedResolved * 5 +
    prioritySpreadRank * 3 +
    Math.max(ZERO, 3 - Math.min(3, gateReasonCount)) +
    priorityRecoveryProgressBonus +
    priorityRecoveryBlockedPartitionBonus +
    Math.floor(prioritySpreadGapScore / 50)
  );
}

function formatActiveWaitProgressSnapshot(progressSnapshot) {
  if (!progressSnapshot || typeof progressSnapshot !== 'object') {
    return 'none';
  }
  const gateReasons = Array.isArray(progressSnapshot.gateReasons) ?
    progressSnapshot.gateReasons :
    [];
  const priorityRecoveryProgressClasses = Array.isArray(
    progressSnapshot?.priorityRecoveryProgressClasses?.unresolvedClassIds,
  ) ?
    progressSnapshot.priorityRecoveryProgressClasses.unresolvedClassIds :
    [];
  const priorityRecoverySemanticStates = Array.isArray(
    progressSnapshot?.priorityRecoveryProgressClasses
      ?.unresolvedSemanticStateIds,
  ) ?
    progressSnapshot.priorityRecoveryProgressClasses
      .unresolvedSemanticStateIds :
    [];
  const selectedMissingPublishedNodeIds = Array.isArray(
    progressSnapshot?.selectedMissingPublishedNodeIds,
  ) ?
    progressSnapshot.selectedMissingPublishedNodeIds :
    [];
  const ownerQueuePendingWrites = Number.isFinite(
    progressSnapshot?.selectedControlPlaneOwnerQueueDepth?.pendingWrites,
  ) ?
    Math.max(
      ZERO,
      Math.floor(
        progressSnapshot.selectedControlPlaneOwnerQueueDepth.pendingWrites,
      ),
    ) :
    null;
  const cdcBufferedEvents = Number.isFinite(
    progressSnapshot?.selectedCdcReplayLag?.bufferedEvents,
  ) ?
    Math.max(
      ZERO,
      Math.floor(progressSnapshot.selectedCdcReplayLag.bufferedEvents),
    ) :
    null;
  const perNodePublicationDisagreementSet =
    progressSnapshot?.perNodePublicationDisagreementSet &&
    typeof progressSnapshot.perNodePublicationDisagreementSet === 'object' ?
      progressSnapshot.perNodePublicationDisagreementSet :
      {};
  const disagreementNodeCount = Object.values(
    perNodePublicationDisagreementSet,
  ).filter((missingNodeIds) => {
    return Array.isArray(missingNodeIds) && missingNodeIds.length > ZERO;
  }).length;
  return (
    'active=' +
    String(progressSnapshot.activeNodeCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    ',coverage=' +
    String(progressSnapshot.snapshotCoverageNodeCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    (progressSnapshot.snapshotCoverageComplete === true ? '#complete' : '') +
    ',publication=' +
    String(progressSnapshot.publicationStatus || 'unknown') +
    ',snapshotNode=' +
    String(progressSnapshot.selectedSnapshotNodeId || 'none') +
    (progressSnapshot.selectedSnapshotAdminReady === true ?
      '#adminReady=true' :
      progressSnapshot.selectedSnapshotAdminReady === false ?
        '#adminReady=false' :
        '') +
    (progressSnapshot.selectedSnapshotReachableBy ?
      '#via=' + progressSnapshot.selectedSnapshotReachableBy :
      '') +
    (progressSnapshot.selectedSnapshotError ? '#snapshotError' : '') +
    (progressSnapshot.selectedSnapshotReachabilityError ? '#adminError' : '') +
    ',epoch=' +
    String(progressSnapshot.publicationEpoch ?? 'unknown') +
    ',publishedActive=' +
    String(progressSnapshot.selectedPublishedActiveCount ?? ZERO) +
    '/' +
    String(progressSnapshot.expectedNodeCount ?? ZERO) +
    ',pendingAck=' +
    String(progressSnapshot.pendingAckCount ?? ZERO) +
    ',missingPublished=' +
    String(progressSnapshot.missingPublishedCount ?? ZERO) +
    ',missingPublishedIds=' +
    (selectedMissingPublishedNodeIds.length > ZERO ?
      selectedMissingPublishedNodeIds.join('|') :
      'none') +
    ',ownerQueue=' +
    String(ownerQueuePendingWrites ?? 'unknown') +
    ',cdcLag=' +
    String(cdcBufferedEvents ?? 'unknown') +
    ',disagreementNodes=' +
    String(disagreementNodeCount) +
    ',prioritySpread=' +
    (progressSnapshot.prioritySpreadSatisfied === true ?
      'ready' :
      progressSnapshot.prioritySpreadSatisfied === false ?
        'pending' :
        'unknown') +
    (Number.isInteger(progressSnapshot.prioritySpreadGap) ?
      '#gap=' + String(progressSnapshot.prioritySpreadGap) :
      '') +
    ',priorityRecovery=' +
    (priorityRecoveryProgressClasses.length > ZERO ?
      priorityRecoveryProgressClasses.join('|') :
      'none') +
    ',priorityRecoveryState=' +
    (priorityRecoverySemanticStates.length > ZERO ?
      priorityRecoverySemanticStates.join('|') :
      'none') +
    ',closure=' +
    String(progressSnapshot.closureRecordId || 'none') +
    (progressSnapshot.closureWitnessClass ?
      '#' + progressSnapshot.closureWitnessClass :
      '') +
    ',gateReasons=' +
    (gateReasons.length > ZERO ? gateReasons.join('|') : 'none')
  );
}

function upsertActiveWaitBlockerHistory(
  blockerHistoryBySignature,
  progressSnapshot,
  attempt,
  elapsedMs,
) {
  if (!(blockerHistoryBySignature instanceof Map)) {
    return;
  }
  const blockers =
    Array.isArray(progressSnapshot?.blockers) &&
    progressSnapshot.blockers.length > ZERO ?
      progressSnapshot.blockers :
      [ACTIVE_WAIT_BLOCKER_NONE];
  const signature = blockers.join('|');
  let entry = blockerHistoryBySignature.get(signature) || null;
  if (!entry) {
    if (
      blockerHistoryBySignature.size >= ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES
    ) {
      let evictionKey = null;
      let evictionEntry = null;
      for (const [
        candidateKey,
        candidateEntry,
      ] of blockerHistoryBySignature.entries()) {
        if (!evictionEntry) {
          evictionKey = candidateKey;
          evictionEntry = candidateEntry;
          continue;
        }
        if (
          candidateEntry.count < evictionEntry.count ||
          (candidateEntry.count === evictionEntry.count &&
            candidateEntry.lastAttempt < evictionEntry.lastAttempt)
        ) {
          evictionKey = candidateKey;
          evictionEntry = candidateEntry;
        }
      }
      if (evictionKey) {
        blockerHistoryBySignature.delete(evictionKey);
      }
    }
    entry = {
      signature,
      blockers: [...blockers],
      count: ZERO,
      firstAttempt: attempt,
      firstElapsedMs: elapsedMs,
      lastAttempt: attempt,
      lastElapsedMs: elapsedMs,
    };
    blockerHistoryBySignature.set(signature, entry);
  }
  entry.count += ONE;
  entry.lastAttempt = attempt;
  entry.lastElapsedMs = elapsedMs;
}

function summarizeActiveWaitBlockerHistory(blockerHistoryBySignature) {
  if (
    !(blockerHistoryBySignature instanceof Map) ||
    blockerHistoryBySignature.size === ZERO
  ) {
    return [];
  }
  return Array.from(blockerHistoryBySignature.values())
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return right.lastAttempt - left.lastAttempt;
    })
    .slice(ZERO, ACTIVE_WAIT_BLOCKER_HISTORY_MAX_ENTRIES)
    .map((entry) => ({
      blockers: entry.blockers,
      signature: entry.signature,
      count: entry.count,
      firstAttempt: entry.firstAttempt,
      firstElapsedMs: entry.firstElapsedMs,
      lastAttempt: entry.lastAttempt,
      lastElapsedMs: entry.lastElapsedMs,
    }));
}

function normalizeReplicaOperationPartitionGroupInFlight(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized = {};
  for (const [groupId, count] of Object.entries(value)) {
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < ZERO) {
      continue;
    }
    normalized[String(groupId)] = parsedCount;
  }
  return normalized;
}

function buildReplicaOperationTimelineSignature(operationTimelineById = {}) {
  if (
    !operationTimelineById ||
    typeof operationTimelineById !== 'object' ||
    Array.isArray(operationTimelineById)
  ) {
    return null;
  }
  const signatures = [];
  for (const operationId of Object.keys(operationTimelineById).sort()) {
    const timeline = Array.isArray(operationTimelineById[operationId]) ?
      operationTimelineById[operationId] :
      [];
    const lastEntry =
      timeline.length > ZERO ? timeline[timeline.length - 1] : null;
    signatures.push(
      String(operationId) +
        '=' +
        String(timeline.length) +
        ':' +
        String(lastEntry?.eventType || '') +
        ':' +
        String(lastEntry?.step || '') +
        ':' +
        String(lastEntry?.status || '') +
        ':' +
        (lastEntry?.inFlight === true ? '1' : '0'),
    );
  }
  if (signatures.length === ZERO) {
    return null;
  }
  return signatures.join('|');
}

function isBetterControlSnapshotCandidate(candidate, selected) {
  if (!selected) {
    return true;
  }
  const candidateCapturedAtMs = Number.isFinite(candidate?.capturedAtMs) ?
    candidate.capturedAtMs :
    null;
  const selectedCapturedAtMs = Number.isFinite(selected?.capturedAtMs) ?
    selected.capturedAtMs :
    null;
  if (
    candidateCapturedAtMs !== null &&
    selectedCapturedAtMs !== null &&
    candidateCapturedAtMs !== selectedCapturedAtMs
  ) {
    return candidateCapturedAtMs > selectedCapturedAtMs;
  }
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs === null) {
    return true;
  }
  if (candidateCapturedAtMs === null && selectedCapturedAtMs !== null) {
    return false;
  }
  if (candidate?.inFlightCount !== selected?.inFlightCount) {
    return Number(candidate?.inFlightCount) < Number(selected?.inFlightCount);
  }
  return (
    String(candidate?.nodeId || '').localeCompare(
      String(selected?.nodeId || ''),
    ) < ZERO
  );
}

function normalizeDistinctStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > ZERO),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObjectField(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ?
      parsed :
      null;
  } catch {
    return null;
  }
}

function parseFiniteNumberField(value) {
  if (Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value !== 'string' || value.trim().length === ZERO) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.floor(numericValue) : null;
}

function extractCriticalSystemDiscoverySummary(discoverySnapshot) {
  const rows = Array.isArray(discoverySnapshot?.rows) ?
    discoverySnapshot.rows :
    [];
  const firstRow =
    rows.length > ZERO && rows[ZERO] && typeof rows[ZERO] === 'object' ?
      rows[ZERO] :
      null;
  if (!firstRow) {
    return {
      capturedAtMs: null,
      readyNodeIds: [],
      readyDistinctNodeCount: ZERO,
      readyReplicaCount: ZERO,
      totalReplicaCount: ZERO,
    };
  }
  const services = Array.isArray(firstRow[SERVICE_DISCOVERY_SERVICES_FIELD]) ?
    firstRow[SERVICE_DISCOVERY_SERVICES_FIELD] :
    [];
  const readyNodeIds = [];
  let readyReplicaCount = ZERO;
  let totalReplicaCount = ZERO;

  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    const replicas = Array.isArray(service[SERVICE_DISCOVERY_REPLICAS_FIELD]) ?
      service[SERVICE_DISCOVERY_REPLICAS_FIELD] :
      [];
    for (const replica of replicas) {
      if (!replica || typeof replica !== 'object') {
        continue;
      }
      totalReplicaCount += ONE;
      const nodeId = String(
        replica[SERVICE_DISCOVERY_REPLICA_NODE_ID_FIELD] || '',
      ).trim();
      if (nodeId.length === ZERO) {
        continue;
      }
      const readiness = replica[SERVICE_DISCOVERY_REPLICA_READINESS_FIELD];
      if (
        !readiness ||
        typeof readiness !== 'object' ||
        readiness[SERVICE_DISCOVERY_READINESS_ROUTING_READY_FIELD] !== true
      ) {
        continue;
      }
      readyReplicaCount += ONE;
      readyNodeIds.push(nodeId);
    }
  }

  const distinctReadyNodeIds = normalizeDistinctStringArray(readyNodeIds);
  return {
    capturedAtMs: Number.isFinite(firstRow?.capturedAt) ?
      Math.floor(firstRow.capturedAt) :
      null,
    readyNodeIds: distinctReadyNodeIds,
    readyDistinctNodeCount: distinctReadyNodeIds.length,
    readyReplicaCount,
    totalReplicaCount,
  };
}

function isBetterCriticalSystemDiscoveryCandidate(candidate, selected) {
  if (!selected) {
    return true;
  }
  if (candidate.readyDistinctNodeCount !== selected.readyDistinctNodeCount) {
    return candidate.readyDistinctNodeCount > selected.readyDistinctNodeCount;
  }
  if (candidate.readyReplicaCount !== selected.readyReplicaCount) {
    return candidate.readyReplicaCount > selected.readyReplicaCount;
  }
  const candidateCapturedAtMs = Number.isFinite(candidate?.selectedCapturedAtMs) ?
    candidate.selectedCapturedAtMs :
    null;
  const selectedCapturedAtMs = Number.isFinite(selected?.selectedCapturedAtMs) ?
    selected.selectedCapturedAtMs :
    null;
  if (
    candidateCapturedAtMs !== null &&
    selectedCapturedAtMs !== null &&
    candidateCapturedAtMs !== selectedCapturedAtMs
  ) {
    return candidateCapturedAtMs > selectedCapturedAtMs;
  }
  if (candidateCapturedAtMs !== null && selectedCapturedAtMs === null) {
    return true;
  }
  if (candidateCapturedAtMs === null && selectedCapturedAtMs !== null) {
    return false;
  }
  if (candidate.totalReplicaCount !== selected.totalReplicaCount) {
    return candidate.totalReplicaCount > selected.totalReplicaCount;
  }
  return (
    String(candidate?.selectedNodeId || '').localeCompare(
      String(selected?.selectedNodeId || ''),
    ) < ZERO
  );
}

function formatCriticalSystemDistributionSummary(summary) {
  if (!summary || typeof summary !== 'object' || summary.enabled !== true) {
    return 'disabled';
  }
  const tables = Array.isArray(summary.tables) ? summary.tables : [];
  if (tables.length === ZERO) {
    return 'none';
  }
  return tables
    .map((table) => {
      const tableName = String(table?.tableName || 'unknown_table');
      const readyDistinctNodeCount = Number.isInteger(
        table?.readyDistinctNodeCount,
      ) ?
        table.readyDistinctNodeCount :
        ZERO;
      const requiredDistinctNodeCount = Number.isInteger(
        table?.requiredDistinctNodeCount,
      ) ?
        table.requiredDistinctNodeCount :
        ZERO;
      const readyNodeIds = normalizeDistinctStringArray(table?.readyNodeIds);
      const selectedNodeId = String(table?.selectedNodeId || '').trim();
      const observationState = String(table?.observationState || '').trim();
      const error = String(table?.error || '').trim();
      return (
        tableName +
        ':' +
        String(readyDistinctNodeCount) +
        '/' +
        String(requiredDistinctNodeCount) +
        (readyNodeIds.length > ZERO ? '@' + readyNodeIds.join('|') : '') +
        (selectedNodeId.length > ZERO ? '#src=' + selectedNodeId : '') +
        (observationState.length > ZERO ? '#obs=' + observationState : '') +
        (error.length > ZERO ? '#err=' + error : '')
      );
    })
    .join(', ');
}

/**
 * Poll a probe until success or timeout.
 * @param {Object} options
 * @param {function(): Promise<Object>} options.probe
 * @param {function(Object): boolean} options.isSuccess
 * @param {number} options.deadline
 * @param {number} options.intervalMs
 * @param {function(number): Promise<void>} options.sleep
 * @param {function(Object): Promise<void>|void} [options.onAttempt]
 * @returns {Promise<Object>}
 */
async function pollUntilCondition(options = {}) {
  const deadline = Number(options.deadline) || Date.now();
  const intervalMs = Math.max(0, Number(options.intervalMs) || 0);
  const probe = options.probe;
  const isSuccess = options.isSuccess;
  const sleep =
    typeof options.sleep === 'function' ? options.sleep : async () => {};
  const onAttempt =
    typeof options.onAttempt === 'function' ? options.onAttempt : null;

  const startedAt = Date.now();
  let attempts = 0;
  let lastResult = null;

  while (Date.now() < deadline) {
    attempts += 1;
    lastResult = await probe();
    const elapsedMs = Date.now() - startedAt;
    const attemptResult = {
      attempts,
      elapsedMs,
      lastResult,
      remainingMs: Math.max(0, deadline - Date.now()),
    };

    if (isSuccess(lastResult)) {
      return {
        success: true,
        ...attemptResult,
      };
    }

    if (onAttempt) {
      await onAttempt(attemptResult);
    }
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsedMs: Date.now() - startedAt,
    lastResult,
    remainingMs: 0,
  };
}

/**
 * Best-effort WebSocket close that suppresses transient close-time errors.
 * @param {Object|null} socket
 */
function closeWebSocketSafely(socket) {
  if (!socket || typeof socket.close !== 'function') {
    return;
  }
  try {
    socket.once('error', () => {});
  } catch (_onceErr) {
    // Ignore
  }
  try {
    socket.close();
  } catch (_closeErr) {
    // Ignore
  }
}

/**
 * Build a reusable probe object for reachability diagnostics.
 * @param {Object} options
 * @param {boolean} [options.attempted]
 * @param {boolean} [options.ok]
 * @param {number|null} [options.statusCode]
 * @param {string|null} [options.error]
 * @param {string|null} [options.url]
 * @param {string|null} [options.endpoint]
 * @param {string|null} [options.query]
 * @returns {Object}
 */
function createProbeResult(options = {}) {
  return {
    attempted: options.attempted === true,
    ok: options.ok === true,
    statusCode: Number.isInteger(options.statusCode) ?
      options.statusCode :
      null,
    error: typeof options.error === 'string' ? options.error : null,
    url: typeof options.url === 'string' ? options.url : null,
    endpoint: typeof options.endpoint === 'string' ? options.endpoint : null,
    query: typeof options.query === 'string' ? options.query : null,
  };
}

/**
 * Convert a caught error value into a stable diagnostic string.
 * @param {*} error
 * @returns {string}
 */
function normalizeProbeError(error) {
  if (error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return REACHABILITY_ERROR_UNKNOWN;
}

/**
 * Read one environment value from docker inspect payload.
 * @param {Object} inspect
 * @param {string} key
 * @returns {string|null}
 */
function readContainerInspectEnvValue(inspect, key) {
  const envList = Array.isArray(inspect?.Config?.Env) ? inspect.Config.Env : [];
  const prefix = String(key || '') + '=';
  for (const entry of envList) {
    if (typeof entry === 'string' && entry.startsWith(prefix)) {
      return entry.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Determine whether one Docker network endpoint exposes the hostname alias
 * used by the harness in node_address rows.
 * @param {Object|null} endpointSettings
 * @param {string} expectedAlias
 * @returns {boolean}
 */
function hasDockerNetworkAlias(endpointSettings, expectedAlias) {
  if (!endpointSettings || typeof endpointSettings !== 'object') {
    return false;
  }
  if (typeof expectedAlias !== 'string' || expectedAlias.length === ZERO) {
    return true;
  }
  const aliases = Array.isArray(endpointSettings.Aliases) ?
    endpointSettings.Aliases :
    [];
  return aliases.includes(expectedAlias);
}

/**
 * Determine whether one reusable-container stop error can be ignored.
 * @param {*} error
 * @returns {boolean}
 */
function isIgnorableContainerStopError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes(CONTAINER_STOP_ALREADY_STOPPED_PATTERN) ||
    message.includes(CONTAINER_STOP_NOT_RUNNING_PATTERN) ||
    message.includes(CONTAINER_STOP_NOT_FOUND_PATTERN)
  );
}

/**
 * Build a health probe result from an HTTP status code.
 * @param {string} url
 * @param {number} statusCode
 * @returns {Object}
 */
function buildHealthProbeResult(url, statusCode) {
  const ok = statusCode >= HTTP_OK_LOWER && statusCode <= HTTP_OK_UPPER;
  return createProbeResult({
    attempted: true,
    ok,
    statusCode,
    url,
    error: ok ? null : REACHABILITY_STATUS_HTTP + String(statusCode),
  });
}

function resolveReadinessPhaseRank(phase) {
  const normalizedPhase = typeof phase === 'string' ? phase.toUpperCase() : '';
  return READINESS_PHASE_RANK[normalizedPhase] || ZERO;
}

function normalizeReadinessProbeResult(probeResponse) {
  const normalized = {
    status: HTTP_ERROR_STATUS,
    phase: null,
    phaseRank: ZERO,
    state: null,
    readinessStage: null,
    readinessStageRank: null,
    reasons: [],
    retryAfterMs: null,
    stableWindowMs: null,
    stableElapsedMs: ZERO,
    stableSinceMs: null,
    readinessEpoch: null,
    timestamp: null,
    controlPlaneRecoveryReady: null,
    metadataPublicationReady: null,
    backgroundWorkReady: null,
    recoveryBlocked: null,
    recoveryStage: null,
    recoveryStageRank: null,
    publishedControlPlaneEpoch: null,
    [BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD]: null,
  };

  if (typeof probeResponse === 'number') {
    normalized.status = probeResponse;
    return normalized;
  }

  if (!probeResponse || typeof probeResponse !== 'object') {
    return normalized;
  }

  normalized.status = Number.isFinite(probeResponse.status) ?
    Math.floor(probeResponse.status) :
    HTTP_ERROR_STATUS;

  const body = probeResponse.body;
  if (!body || typeof body !== 'object') {
    return normalized;
  }

  normalized.phase = typeof body.phase === 'string' ? body.phase : null;
  normalized.phaseRank = Number.isFinite(body.phaseRank) ?
    Math.max(ZERO, Math.floor(body.phaseRank)) :
    resolveReadinessPhaseRank(normalized.phase);
  normalized.state = typeof body.state === 'string' ? body.state : null;
  normalized.readinessStage =
    typeof body.readinessStage === 'string' ? body.readinessStage : null;
  normalized.readinessStageRank = Number.isFinite(body.readinessStageRank) ?
    Math.max(ZERO, Math.floor(body.readinessStageRank)) :
    null;
  normalized.reasons = Array.isArray(body.reasons) ?
    body.reasons.map((reason) => String(reason)) :
    [];
  normalized.retryAfterMs = Number.isFinite(body.retryAfterMs) ?
    Math.floor(body.retryAfterMs) :
    null;
  normalized.stableWindowMs = Number.isFinite(body.stableWindowMs) ?
    Math.max(ZERO, Math.floor(body.stableWindowMs)) :
    null;
  normalized.stableElapsedMs = Number.isFinite(body.stableElapsedMs) ?
    Math.max(ZERO, Math.floor(body.stableElapsedMs)) :
    ZERO;
  normalized.stableSinceMs = Number.isFinite(body.stableSinceMs) ?
    Math.floor(body.stableSinceMs) :
    null;
  normalized.readinessEpoch = Number.isFinite(body.readinessEpoch) ?
    Math.max(ZERO, Math.floor(body.readinessEpoch)) :
    Number.isFinite(body.transitionCount) ?
      Math.max(ZERO, Math.floor(body.transitionCount)) :
      null;
  normalized.timestamp = Number.isFinite(body.timestamp) ?
    Math.floor(body.timestamp) :
    null;
  normalized.controlPlaneRecoveryReady =
    typeof body.controlPlaneRecoveryReady === 'boolean' ?
      body.controlPlaneRecoveryReady :
      null;
  normalized.metadataPublicationReady =
    typeof body.metadataPublicationReady === 'boolean' ?
      body.metadataPublicationReady :
      null;
  normalized.backgroundWorkReady =
    typeof body.backgroundWorkReady === 'boolean' ?
      body.backgroundWorkReady :
      null;
  normalized.recoveryBlocked =
    typeof body.recoveryBlocked === 'boolean' ? body.recoveryBlocked : null;
  normalized.recoveryStage =
    typeof body.recoveryStage === 'string' ? body.recoveryStage : null;
  normalized.recoveryStageRank = Number.isFinite(body.recoveryStageRank) ?
    Math.max(ZERO, Math.floor(body.recoveryStageRank)) :
    null;
  normalized.publishedControlPlaneEpoch = Number.isFinite(
    body.publishedControlPlaneEpoch,
  ) ?
    Math.max(ZERO, Math.floor(body.publishedControlPlaneEpoch)) :
    null;
  normalized[BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD] =
    body[BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD] &&
    typeof body[BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD] === 'object' ?
      JSON.parse(
        JSON.stringify(body[BOOTSTRAP_JOIN_PROJECTION_READINESS_FIELD]),
      ) :
      null;
  return normalized;
}

function buildBootstrapProgressSnapshot(probeResult) {
  const success =
    probeResult?.status >= HTTP_OK_LOWER &&
    probeResult?.status <= HTTP_OK_UPPER;
  const reasons = Array.isArray(probeResult?.reasons) ?
    probeResult.reasons :
    [];
  return {
    success,
    status: Number.isFinite(probeResult?.status) ?
      Math.floor(probeResult.status) :
      HTTP_ERROR_STATUS,
    statusRank: success ?
      2 :
      Number.isFinite(probeResult?.status) &&
          probeResult.status > HTTP_ERROR_STATUS ?
        1 :
        ZERO,
    phase:
      typeof probeResult?.phase === 'string' ?
        probeResult.phase :
        UNKNOWN_PHASE,
    phaseRank: Number.isFinite(probeResult?.phaseRank) ?
      Math.max(ZERO, Math.floor(probeResult.phaseRank)) :
      resolveReadinessPhaseRank(probeResult?.phase),
    reasons,
    reasonCount: reasons.length,
    stableElapsedMs: Number.isFinite(probeResult?.stableElapsedMs) ?
      Math.max(ZERO, Math.floor(probeResult.stableElapsedMs)) :
      ZERO,
    stableWindowMs: Number.isFinite(probeResult?.stableWindowMs) ?
      Math.max(ZERO, Math.floor(probeResult.stableWindowMs)) :
      null,
    readinessEpoch: Number.isFinite(probeResult?.readinessEpoch) ?
      Math.max(ZERO, Math.floor(probeResult.readinessEpoch)) :
      null,
  };
}

function compareBootstrapProgress(left, right) {
  if (!left) {
    return ZERO;
  }
  if (!right) {
    return 1;
  }
  if (left.success !== right.success) {
    return left.success ? 1 : -1;
  }
  if (left.phaseRank !== right.phaseRank) {
    return left.phaseRank > right.phaseRank ? 1 : -1;
  }
  if (left.statusRank !== right.statusRank) {
    return left.statusRank > right.statusRank ? 1 : -1;
  }
  if (left.reasonCount !== right.reasonCount) {
    return left.reasonCount < right.reasonCount ? 1 : -1;
  }
  if (left.stableElapsedMs !== right.stableElapsedMs) {
    return left.stableElapsedMs > right.stableElapsedMs ? 1 : -1;
  }
  return ZERO;
}

function summarizeBootstrapProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return {
      phase: UNKNOWN_PHASE,
      status: HTTP_ERROR_STATUS,
      reasons: UNKNOWN_REASON,
    };
  }
  const reasons =
    Array.isArray(progress.reasons) && progress.reasons.length > ZERO ?
      progress.reasons.join(',') :
      'none';
  return {
    phase: typeof progress.phase === 'string' ? progress.phase : UNKNOWN_PHASE,
    status: Number.isFinite(progress.status) ?
      Math.floor(progress.status) :
      HTTP_ERROR_STATUS,
    reasons,
  };
}

function resolveBootstrapProbeSleepMs(probeResult, defaultIntervalMs) {
  const retryAfterMs = Number.isFinite(probeResult?.retryAfterMs) ?
    Math.max(ZERO, Math.floor(probeResult.retryAfterMs)) :
    null;
  if (retryAfterMs === null || retryAfterMs <= ZERO) {
    return defaultIntervalMs;
  }
  return Math.max(defaultIntervalMs, retryAfterMs);
}

function isControlPlaneRecoveryReadyProbe(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return false;
  }
  if (readiness.controlPlaneRecoveryReady === true) {
    return true;
  }
  if (Number.isFinite(readiness.recoveryStageRank)) {
    return (
      readiness.recoveryStageRank >=
      STARTUP_RECOVERY_STAGE_RANK_CONTROL_PLANE_RECOVERY_READY
    );
  }
  const success =
    Number.isFinite(readiness.status) &&
    readiness.status >= HTTP_OK_LOWER &&
    readiness.status <= HTTP_OK_UPPER;
  return (
    success &&
    resolveReadinessPhaseRank(readiness.phase) >=
      READINESS_PHASE_RANK.CONTROL_READY
  );
}

/**
 * Normalize SQL/callback statements for compact query tracing.
 * @param {string} statement
 * @returns {string}
 */
function normalizeAdminStatement(statement) {
  return String(statement || '')
    .replace(ADMIN_QUERY_TRACE_NORMALIZE_PATTERN, ' ')
    .trim();
}

/**
 * Build a short SQL preview for admin query tracing.
 * @param {string} statement
 * @returns {string|null}
 */
function buildAdminStatementPreview(statement) {
  const normalized = normalizeAdminStatement(statement);
  if (normalized.length === ZERO) {
    return null;
  }
  return normalized.length > ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH ?
    normalized.slice(ZERO, ADMIN_QUERY_TRACE_SQL_PREVIEW_MAX_LENGTH) :
    normalized;
}

/**
 * Build a stable SQL fingerprint for cross-report correlation.
 * @param {string} statement
 * @returns {string|null}
 */
function buildAdminStatementFingerprint(statement) {
  const normalized = normalizeAdminStatement(statement).toLowerCase();
  if (normalized.length === ZERO) {
    return null;
  }
  return createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(ZERO, ADMIN_QUERY_TRACE_SQL_FINGERPRINT_LENGTH);
}

export const CLUSTER_SEGMENT_3 = {
  ...CLUSTER_SEGMENT_2,
  scoreActiveWaitProgress,
  formatActiveWaitProgressSnapshot,
  upsertActiveWaitBlockerHistory,
  summarizeActiveWaitBlockerHistory,
  normalizeReplicaOperationPartitionGroupInFlight,
  buildReplicaOperationTimelineSignature,
  isBetterControlSnapshotCandidate,
  normalizeDistinctStringArray,
  parseJsonArrayField,
  parseJsonObjectField,
  parseFiniteNumberField,
  extractCriticalSystemDiscoverySummary,
  isBetterCriticalSystemDiscoveryCandidate,
  formatCriticalSystemDistributionSummary,
  pollUntilCondition,
  closeWebSocketSafely,
  createProbeResult,
  normalizeProbeError,
  readContainerInspectEnvValue,
  hasDockerNetworkAlias,
  isIgnorableContainerStopError,
  buildHealthProbeResult,
  resolveReadinessPhaseRank,
  normalizeReadinessProbeResult,
  buildBootstrapProgressSnapshot,
  compareBootstrapProgress,
  summarizeBootstrapProgress,
  resolveBootstrapProbeSleepMs,
  isControlPlaneRecoveryReadyProbe,
  normalizeAdminStatement,
  buildAdminStatementPreview,
  buildAdminStatementFingerprint,
};
