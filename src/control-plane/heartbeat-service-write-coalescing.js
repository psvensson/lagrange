import {COLUMN, NUM, TYPEOF} from '../constants/index.js';

function buildNodeHeartbeatWriteDecision(
  shouldWrite,
  reason,
  publicationMode,
) {
  return {shouldWrite, reason, publicationMode};
}

function buildReporterHeartbeatVisibilityDecision(outcome, nextState) {
  return {outcome, nextState};
}

function normalizeHeartbeatPublicationTimestamp(value) {
  if (typeof value === TYPEOF.STRING && value.length > NUM.ZERO) {
    return value;
  }
  const timestampMs = Number(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return new Date(timestampMs).toISOString();
}

function normalizeHeartbeatPublicationDiagnostics(source, fallbackPath = null) {
  const value = source && typeof source === TYPEOF.OBJECT ? source : {};
  const targetAddress =
    typeof value.targetAddress === TYPEOF.STRING && value.targetAddress.length > NUM.ZERO ?
      value.targetAddress :
      null;
  const addressParts = targetAddress ? targetAddress.split('/') : [];
  const targetNodeId =
    typeof value.targetNodeId === TYPEOF.STRING && value.targetNodeId.length > NUM.ZERO ?
      value.targetNodeId :
      addressParts[NUM.ZERO] || null;
  const targetServiceType =
    typeof value.targetServiceType === TYPEOF.STRING && value.targetServiceType.length > NUM.ZERO ?
      value.targetServiceType :
      addressParts[NUM.ONE] || null;
  const targetServiceId =
    typeof value.targetServiceId === TYPEOF.STRING && value.targetServiceId.length > NUM.ZERO ?
      value.targetServiceId :
      addressParts.slice(2).join('/') || null;
  const publicationPath =
    typeof value.publicationPath === TYPEOF.STRING && value.publicationPath.length > NUM.ZERO ?
      value.publicationPath :
      fallbackPath;
  return {publicationPath, targetAddress, targetNodeId, targetServiceType, targetServiceId};
}

function buildNodeHeartbeatStructuralSignature(updateRow) {
  return JSON.stringify({
    nodeAddress: updateRow.node_address,
    cpuCores: updateRow.cpu_cores,
    memoryMb: updateRow.memory_mb,
    diskGb: updateRow.disk_gb,
    status: updateRow.status,
    connectionState: updateRow.connection_state,
    capabilities: updateRow.capabilities,
  });
}

function bucketNodeHeartbeatUsagePercent(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const bucketSize = Math.max(options.oneValue || 1, options.bucketSize);
  return Math.floor(numeric / bucketSize);
}

function buildNodeHeartbeatUtilizationSignature(updateRow, options = {}) {
  return JSON.stringify({
    cpuUsageBucket: bucketNodeHeartbeatUsagePercent(updateRow.cpu_usage_percent, options),
    memoryUsageBucket: bucketNodeHeartbeatUsagePercent(updateRow.memory_usage_percent, options),
    diskUsageBucket: bucketNodeHeartbeatUsagePercent(updateRow.disk_usage_percent, options),
  });
}

function resolveHeartbeatBudgetFields(cachedRow) {
  if (!cachedRow || typeof cachedRow !== TYPEOF.OBJECT) {
    return {};
  }
  const fields = {};
  const budgetBytes = Number(cachedRow[COLUMN.STORAGE_BUDGET_BYTES]);
  if (Number.isFinite(budgetBytes) && budgetBytes > NUM.ZERO) {
    fields[COLUMN.STORAGE_BUDGET_BYTES] = Math.floor(budgetBytes);
  }
  const budgetSource = cachedRow[COLUMN.STORAGE_BUDGET_SOURCE];
  if (typeof budgetSource === TYPEOF.STRING && budgetSource.length > NUM.ZERO) {
    fields[COLUMN.STORAGE_BUDGET_SOURCE] = budgetSource;
  }
  const budgetUpdatedAt = Number(cachedRow[COLUMN.STORAGE_BUDGET_UPDATED_AT]);
  if (Number.isFinite(budgetUpdatedAt) && budgetUpdatedAt > NUM.ZERO) {
    fields[COLUMN.STORAGE_BUDGET_UPDATED_AT] = Math.floor(budgetUpdatedAt);
  }
  return fields;
}

function buildNodeHeartbeatWriteAssessment(updateRow, now, options = {}) {
  const reporterVisibilityState = options.nodeHeartbeatReporterVisibilityState;
  if (reporterVisibilityState === options.reporterVisibilityState.PENDING) {
    return Object.freeze({
      state: options.writeDecisionState.REPORTER_VISIBILITY_PENDING,
      elapsedMs: null,
    });
  }
  if (reporterVisibilityState === options.reporterVisibilityState.UNVERIFIED) {
    return Object.freeze({
      state: options.writeDecisionState.REPORTER_VISIBILITY_UNVERIFIED,
      elapsedMs: null,
    });
  }
  if (!Number.isFinite(options.lastNodeHeartbeatWriteAt)) {
    return Object.freeze({
      state: options.writeDecisionState.INITIAL_RECOVERY_REQUIRED,
      elapsedMs: null,
    });
  }
  const elapsedMs = now - options.lastNodeHeartbeatWriteAt;
  if (
    options.heartbeatConsecutiveFailures > NUM.ZERO &&
    options.isHeartbeatEscalatedPublicationMode(
      options.lastHeartbeatPublicationDecision?.publicationMode,
    )
  ) {
    return Object.freeze({
      state: options.writeDecisionState.RECOVERY_FAILURE_RETRY,
      elapsedMs,
    });
  }
  if (elapsedMs >= options.nodeMetadataMaxStalenessMs) {
    return Object.freeze({
      state: options.writeDecisionState.MAX_STALENESS_REFRESH,
      elapsedMs,
    });
  }
  const structuralSignature = buildNodeHeartbeatStructuralSignature(updateRow);
  if (options.lastNodeHeartbeatWriteSignature !== structuralSignature) {
    return Object.freeze({
      state: options.writeDecisionState.STRUCTURAL_CHANGED,
      elapsedMs,
    });
  }
  if (elapsedMs < options.nodeMetadataMinUpdateIntervalMs) {
    return Object.freeze({
      state: options.writeDecisionState.COALESCED_MIN_INTERVAL,
      elapsedMs,
    });
  }
  const utilizationSignature = buildNodeHeartbeatUtilizationSignature(updateRow, {
    bucketSize: options.nodeMetadataUsagePercentBucketSize,
    oneValue: options.oneValue,
  });
  if (options.lastNodeHeartbeatUtilizationSignature !== utilizationSignature) {
    return Object.freeze({
      state: options.writeDecisionState.UTILIZATION_CHANGED,
      elapsedMs,
    });
  }
  return Object.freeze({
    state: options.writeDecisionState.COALESCED_UNCHANGED,
    elapsedMs,
  });
}

function resolveNodeHeartbeatWriteDecision(updateRow, now, options = {}) {
  const assessment = buildNodeHeartbeatWriteAssessment(updateRow, now, options);
  if (assessment.state === options.writeDecisionState.REPORTER_VISIBILITY_PENDING) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.writeDecisionReason.REPORTER_VISIBILITY_PENDING,
      options.publicationMode.HEARTBEAT_RECOVERY,
    );
  }
  if (assessment.state === options.writeDecisionState.REPORTER_VISIBILITY_UNVERIFIED) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.writeDecisionReason.REPORTER_VISIBILITY_UNVERIFIED,
      options.publicationMode.HEARTBEAT_RECOVERY,
    );
  }
  if (assessment.state === options.writeDecisionState.INITIAL_RECOVERY_REQUIRED) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.serviceLiteral.NO_PREVIOUS_WRITE,
      options.publicationMode.HEARTBEAT_RECOVERY,
    );
  }
  if (assessment.state === options.writeDecisionState.RECOVERY_FAILURE_RETRY) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.writeDecisionReason.RECOVERY_FAILURE_RETRY,
      options.publicationMode.HEARTBEAT_RECOVERY,
    );
  }
  if (assessment.state === options.writeDecisionState.STRUCTURAL_CHANGED) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.serviceLiteral.STRUCTURAL_CHANGED,
      options.publicationMode.HEARTBEAT_STEADY,
    );
  }
  if (assessment.state === options.writeDecisionState.COALESCED_MIN_INTERVAL) {
    return options.buildNodeHeartbeatWriteDecision(
      false,
      options.serviceLiteral.COALESCED_MIN_INTERVAL,
      options.publicationMode.HEARTBEAT_STEADY,
    );
  }
  if (assessment.state === options.writeDecisionState.UTILIZATION_CHANGED) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.serviceLiteral.UTILIZATION_CHANGED,
      options.publicationMode.HEARTBEAT_STEADY,
    );
  }
  if (assessment.state === options.writeDecisionState.MAX_STALENESS_REFRESH) {
    return options.buildNodeHeartbeatWriteDecision(
      true,
      options.serviceLiteral.MAX_STALENESS,
      options.publicationMode.HEARTBEAT_MAINTENANCE,
    );
  }
  return options.buildNodeHeartbeatWriteDecision(
    false,
    options.serviceLiteral.COALESCED_UNCHANGED,
    options.publicationMode.HEARTBEAT_STEADY,
  );
}

function isQuietModeActive(quietMode, options = {}) {
  if (!quietMode) {
    return false;
  }
  if (typeof quietMode === options.booleanTypeValue) {
    return quietMode;
  }
  if (typeof quietMode?.isActive === TYPEOF.FUNCTION) {
    return quietMode.isActive() === true;
  }
  if (quietMode.enabled === false) {
    return false;
  }
  return quietMode.active === true;
}

function incrementHistogramEntry(histogram, key, oneValue) {
  if (!Object.prototype.hasOwnProperty.call(histogram, key)) {
    histogram[key] = NUM.ZERO;
  }
  histogram[key] += oneValue;
}

function shouldUpsertEndpointRow(endpointRow, now, options = {}) {
  const signature = options.buildEndpointUpsertSignature(endpointRow);
  if (options.lastEndpointUpsertSignature !== signature) {
    return true;
  }
  if (!Number.isFinite(options.lastEndpointUpsertAt)) {
    return true;
  }
  return now - options.lastEndpointUpsertAt >= options.endpointRefreshIntervalMs;
}

function advanceMemoryTrendState(memoryUsagePercent, timestamp, options = {}) {
  if (!Number.isFinite(memoryUsagePercent) || !Number.isFinite(timestamp)) {
    return {
      samples: options.memoryTrendSamples,
      lastWarningAt: options.lastMemoryTrendWarningAt,
      warning: null,
    };
  }
  const samples = [
    ...options.memoryTrendSamples,
    {timestamp, usagePercent: Number(memoryUsagePercent)},
  ].filter((sample) => sample.timestamp >= timestamp - options.memoryTrendWindowMs);
  if (samples.length < options.memoryTrendMinSamples) {
    return {
      samples,
      lastWarningAt: options.lastMemoryTrendWarningAt,
      warning: null,
    };
  }
  const slopePercentPerMin = options.calculateUsageSlopePerMinute(samples);
  const currentUsagePercent = samples[samples.length - options.oneValue].usagePercent;
  if (currentUsagePercent < options.memoryTrendWarningPercent) {
    return {
      samples,
      lastWarningAt: options.lastMemoryTrendWarningAt,
      warning: null,
    };
  }
  if (slopePercentPerMin < options.memoryTrendSlopePercentPerMinThreshold) {
    return {
      samples,
      lastWarningAt: options.lastMemoryTrendWarningAt,
      warning: null,
    };
  }
  if (
    options.lastMemoryTrendWarningAt > NUM.ZERO &&
    timestamp - options.lastMemoryTrendWarningAt < options.memoryTrendWarningCooldownMs
  ) {
    return {
      samples,
      lastWarningAt: options.lastMemoryTrendWarningAt,
      warning: null,
    };
  }
  return {
    samples,
    lastWarningAt: timestamp,
    warning: {
      nodeId: options.nodeId,
      memoryUsagePercent: currentUsagePercent,
      slopePercentPerMin,
      sampleCount: samples.length,
      windowMs: options.memoryTrendWindowMs,
      thresholdSlopePercentPerMin: options.memoryTrendSlopePercentPerMinThreshold,
      thresholdUsagePercent: options.memoryTrendWarningPercent,
    },
  };
}

function recordHeartbeatPublicationAttempt(options = {}) {
  options.diagnostics.lastAttemptAt = normalizeHeartbeatPublicationTimestamp(options.startedAtMs);
  options.diagnostics.consecutiveFailures = options.heartbeatConsecutiveFailures;
}

function recordHeartbeatPublicationTarget(options = {}) {
  const normalized = normalizeHeartbeatPublicationDiagnostics(options.diagnostics);
  const resetTarget =
    normalized.publicationPath === options.serviceLiteral.CDC_UPDATE &&
    !normalized.targetAddress;
  if (normalized.publicationPath) {
    options.heartbeatPublicationDiagnostics.publicationPath = normalized.publicationPath;
  }
  if (resetTarget) {
    options.heartbeatPublicationDiagnostics.targetAddress = null;
    options.heartbeatPublicationDiagnostics.targetNodeId = null;
    options.heartbeatPublicationDiagnostics.targetServiceType = null;
    options.heartbeatPublicationDiagnostics.targetServiceId = null;
    return;
  }
  if (normalized.targetAddress) {
    options.heartbeatPublicationDiagnostics.targetAddress = normalized.targetAddress;
  }
  if (normalized.targetNodeId) {
    options.heartbeatPublicationDiagnostics.targetNodeId = normalized.targetNodeId;
  }
  if (normalized.targetServiceType) {
    options.heartbeatPublicationDiagnostics.targetServiceType = normalized.targetServiceType;
  }
  if (normalized.targetServiceId) {
    options.heartbeatPublicationDiagnostics.targetServiceId = normalized.targetServiceId;
  }
}

function recordHeartbeatPublicationSuccess(options = {}) {
  recordHeartbeatPublicationTarget(options);
  options.heartbeatPublicationDiagnostics.lastSuccessAt =
    normalizeHeartbeatPublicationTimestamp(options.now);
  options.heartbeatPublicationDiagnostics.consecutiveFailures =
    options.heartbeatConsecutiveFailures;
}

export {
  buildNodeHeartbeatWriteDecision,
  buildReporterHeartbeatVisibilityDecision,
  advanceMemoryTrendState,
  buildNodeHeartbeatStructuralSignature,
  buildNodeHeartbeatUtilizationSignature,
  incrementHistogramEntry,
  isQuietModeActive,
  normalizeHeartbeatPublicationDiagnostics,
  normalizeHeartbeatPublicationTimestamp,
  recordHeartbeatPublicationAttempt,
  recordHeartbeatPublicationSuccess,
  recordHeartbeatPublicationTarget,
  resolveHeartbeatBudgetFields,
  resolveNodeHeartbeatWriteDecision,
  shouldUpsertEndpointRow,
};
