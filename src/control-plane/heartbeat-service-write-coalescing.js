import {COLUMN} from '../constants/index.js';

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
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  const timestampMs = Number(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  return new Date(timestampMs).toISOString();
}

function normalizeHeartbeatPublicationDiagnostics(source, fallbackPath = null) {
  const value = source && typeof source === 'object' ? source : {};
  const targetAddress =
    typeof value.targetAddress === 'string' && value.targetAddress.length > 0 ?
      value.targetAddress :
      null;
  const addressParts = targetAddress ? targetAddress.split('/') : [];
  const targetNodeId =
    typeof value.targetNodeId === 'string' && value.targetNodeId.length > 0 ?
      value.targetNodeId :
      addressParts[0] || null;
  const targetServiceType =
    typeof value.targetServiceType === 'string' && value.targetServiceType.length > 0 ?
      value.targetServiceType :
      addressParts[1] || null;
  const targetServiceId =
    typeof value.targetServiceId === 'string' && value.targetServiceId.length > 0 ?
      value.targetServiceId :
      addressParts.slice(2).join('/') || null;
  const publicationPath =
    typeof value.publicationPath === 'string' && value.publicationPath.length > 0 ?
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
  if (!cachedRow || typeof cachedRow !== 'object') {
    return {};
  }
  const fields = {};
  const budgetBytes = Number(cachedRow[COLUMN.STORAGE_BUDGET_BYTES]);
  if (Number.isFinite(budgetBytes) && budgetBytes > 0) {
    fields[COLUMN.STORAGE_BUDGET_BYTES] = Math.floor(budgetBytes);
  }
  const budgetSource = cachedRow[COLUMN.STORAGE_BUDGET_SOURCE];
  if (typeof budgetSource === 'string' && budgetSource.length > 0) {
    fields[COLUMN.STORAGE_BUDGET_SOURCE] = budgetSource;
  }
  const budgetUpdatedAt = Number(cachedRow[COLUMN.STORAGE_BUDGET_UPDATED_AT]);
  if (Number.isFinite(budgetUpdatedAt) && budgetUpdatedAt > 0) {
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
    options.heartbeatConsecutiveFailures > 0 &&
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
  if (typeof quietMode?.isActive === 'function') {
    return quietMode.isActive() === true;
  }
  if (quietMode.enabled === false) {
    return false;
  }
  return quietMode.active === true;
}

function incrementHistogramEntry(histogram, key, oneValue) {
  if (!Object.prototype.hasOwnProperty.call(histogram, key)) {
    histogram[key] = 0;
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
    options.lastMemoryTrendWarningAt > 0 &&
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
  options.diagnostics.lastAttemptAtMs = Number.isFinite(options.startedAtMs) ?
    options.startedAtMs : null;
  options.diagnostics.consecutiveFailures = options.heartbeatConsecutiveFailures;
}

function resolveHeartbeatPublicationTargetUpdates(normalized, resetTarget) {
  const targetUpdates = {};
  if (resetTarget) {
    targetUpdates.targetAddress = null;
    targetUpdates.targetNodeId = null;
    targetUpdates.targetServiceType = null;
    targetUpdates.targetServiceId = null;
    return targetUpdates;
  }
  if (normalized.targetAddress) {
    targetUpdates.targetAddress = normalized.targetAddress;
  }
  if (normalized.targetNodeId) {
    targetUpdates.targetNodeId = normalized.targetNodeId;
  }
  if (normalized.targetServiceType) {
    targetUpdates.targetServiceType = normalized.targetServiceType;
  }
  if (normalized.targetServiceId) {
    targetUpdates.targetServiceId = normalized.targetServiceId;
  }
  return targetUpdates;
}

function recordHeartbeatPublicationTarget(options = {}) {
  const normalized = normalizeHeartbeatPublicationDiagnostics(options.diagnostics);
  const resetTarget =
    normalized.publicationPath === options.serviceLiteral.CDC_UPDATE &&
    !normalized.targetAddress;
  if (normalized.publicationPath) {
    options.heartbeatPublicationDiagnostics.publicationPath = normalized.publicationPath;
  }
  Object.assign(
    options.heartbeatPublicationDiagnostics,
    resolveHeartbeatPublicationTargetUpdates(normalized, resetTarget),
  );
}

function recordHeartbeatPublicationSuccess(options = {}) {
  recordHeartbeatPublicationTarget(options);
  options.heartbeatPublicationDiagnostics.lastSuccessAt =
    normalizeHeartbeatPublicationTimestamp(options.now);
  options.heartbeatPublicationDiagnostics.lastSuccessAtMs =
    Number.isFinite(options.now) ? options.now : null;
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
