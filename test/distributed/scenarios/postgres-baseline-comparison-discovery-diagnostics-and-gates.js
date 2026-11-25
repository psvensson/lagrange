import {POSTGRES_BASELINE_COMPARISON_DISCOVERY_READINESS_BUNDLE} from './postgres-baseline-comparison-discovery-readiness.js';
import {recordAdmissionRuntimeOwnership} from './postgres-baseline-comparison-admission-runtime-helpers.js';

const {
  CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP,
  CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY,
  CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE,
  CDC_TELEMETRY_MODE_CATCHUP,
  CDC_TELEMETRY_MODE_STEADY,
  CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK,
  CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC,
  CDC_TELEMETRY_NODE_FIELD_MODE,
  CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT,
  CDC_TELEMETRY_REQUIRED_FIELDS,
  DISCOVERY_ADMISSION_SOURCE,
  DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID,
  DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE,
  DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID,
  DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID,
  DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR,
  DISCOVERY_DIAGNOSTIC_PREFIX_ADMISSION_STATES,
  DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES,
  DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS,
  DISCOVERY_DIAGNOSTIC_PREFIX_PROBES,
  DISCOVERY_DIAGNOSTIC_REASON_COUNT_SEPARATOR,
  DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH,
  DISCOVERY_ERROR_CHAIN_SEPARATOR,
  DISCOVERY_ERROR_MESSAGE_MAX_CHARS,
  DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_PREFIX,
  DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_SUFFIX,
  DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES,
  DISCOVERY_GATE_STATUS_FAILED,
  DISCOVERY_GATE_STATUS_PASSED,
  DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  DISCOVERY_PROBE_REASON_ADMIN_NOT_READY,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  DISCOVERY_READINESS_FIELD_ROUTING_READY,
  DISCOVERY_READINESS_FIELD_SCHEMA_READY,
  DISCOVERY_READINESS_FIELD_TOPOLOGY_READY,
  DISCOVERY_READINESS_REASON_NOT_SELECTED_BY_DISCOVERY,
  DISCOVERY_SOURCE_STATUS_EMPTY,
  DISCOVERY_SOURCE_STATUS_ERROR,
  DISCOVERY_UNKNOWN_NODE_ID,
  INTERNAL_SIGNAL_CLASSES,
  INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE,
  INTERNAL_SIGNAL_CLASS_OPERATION_FAILED,
  INTERNAL_SIGNAL_PATTERN_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_PATTERN_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_PATTERN_CRITICAL_REBALANCING_STATE,
  INTERNAL_SIGNAL_PATTERN_OPERATION_FAILED,
  INTERNAL_SIGNAL_SEVERITY_ERRORS_BY_CLASS,
  LOAD_PARITY_STATUS_MISMATCHED,
  ONE,
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX,
  SATURATION_PATTERN_CDC_FORWARD_TIMEOUT,
  SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT,
  SATURATION_SCHEMA_VERSION,
  STRICT_INVARIANT_GATE_IDS,
  STRICT_INVARIANT_RETRY_LEADERSHIP_ERROR_CODES,
  STRICT_INVARIANT_RETRY_MAX_WINDOW_MS,
  STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS,
  STRICT_INVARIANT_RETRY_REASON_CODES,
  STRICT_PARITY_REASON_MISMATCH,
  ZERO,
  buildCanonicalDiscoveryReadinessState,
  evaluateCanonicalVersionedReadiness,
  evaluateDiscoveryReplicaBenchmarkAdmission,
  evaluateDiscoveryReplicaReadiness,
  evaluateRootCauseInvariants,
  extractAppliedSchemaVersionFromReadiness,
  findServiceReplicaBenchmarkAdmissionFromDiscovery,
  findServiceReplicaReadinessFromDiscovery,
  resolveSutLoadNodeSelectionFromDiscovery,
  resolveInternalSignalThresholds,
  summarizeInvariantBreaches,
} = POSTGRES_BASELINE_COMPARISON_DISCOVERY_READINESS_BUNDLE;

function resolveCanonicalDiscoveryNodeReadiness(snapshot, nodeId, options = {}) {
  const enforceCanonicalRouteReadiness =
    options.enforceCanonicalRouteReadiness === true;
  const enforceCanonicalVersionedReadiness =
    options.enforceCanonicalVersionedReadiness === true;
  const readiness = findServiceReplicaReadinessFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    nodeId,
  );
  const canonicalDiscoveryReadinessState =
    buildCanonicalDiscoveryReadinessState(readiness);
  const canonicalReadiness = evaluateCanonicalVersionedReadiness({
    adminQueryable: options.adminQueryable !== false,
    routingReady: readiness?.[DISCOVERY_READINESS_FIELD_ROUTING_READY] === true,
    topologyReady:
      readiness?.[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] === true,
    schemaReady: readiness?.[DISCOVERY_READINESS_FIELD_SCHEMA_READY] === true,
    requireTopologyReady: enforceCanonicalVersionedReadiness ?
      options.requireTopologyReady !== false :
      options.requireTopologyReady === true,
    allowSchemaReadyFallback: enforceCanonicalRouteReadiness === true,
    requiredSchemaVersion: options.requiredSchemaVersion,
    appliedSchemaVersion: extractAppliedSchemaVersionFromReadiness(readiness),
  });
  return {
    ...canonicalReadiness,
    discoveryReasons:
      canonicalDiscoveryReadinessState?.discoveryReasons || [],
    readinessState: canonicalDiscoveryReadinessState,
  };
}

function resolveBenchmarkDiscoveryNodeReadiness(
  snapshot,
  nodeId,
  options = {},
) {
  const normalizedNodeId = String(nodeId || '');
  const benchmarkAdmission = findServiceReplicaBenchmarkAdmissionFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    nodeId,
  );
  const admissionEvaluation =
    evaluateDiscoveryReplicaBenchmarkAdmission(benchmarkAdmission);
  if (admissionEvaluation) {
    recordAdmissionRuntimeOwnership(
      options.admissionRuntimeOwnership,
      'readinessGate',
      normalizedNodeId,
      DISCOVERY_ADMISSION_SOURCE.RUNTIME,
    );
    return {
      ready: admissionEvaluation.ready === true,
      reasons: admissionEvaluation.ready ? [] : admissionEvaluation.reasons,
    };
  }
  const readiness = findServiceReplicaReadinessFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    nodeId,
  );
  recordAdmissionRuntimeOwnership(
    options.admissionRuntimeOwnership,
    'readinessGate',
    normalizedNodeId,
    readiness && typeof readiness === 'object' ?
      DISCOVERY_ADMISSION_SOURCE.LEGACY :
      DISCOVERY_ADMISSION_SOURCE.MISSING,
  );
  const readinessEvaluation = evaluateDiscoveryReplicaReadiness(readiness, {
    requireCanonicalBenchmarkReadiness: true,
  });
  const ready =
    readinessEvaluation.ready &&
    readinessEvaluation.readinessState?.topologyReady === true;
  return {
    ready,
    reasons: ready ? [] : readinessEvaluation.reasons,
  };
}

function resolveNodeReadinessFromServiceDiscovery(
  snapshot,
  nodeId,
  options = {},
) {
  if (
    options.enforceCanonicalVersionedReadiness === true ||
    options.enforceCanonicalRouteReadiness === true
  ) {
    return resolveCanonicalDiscoveryNodeReadiness(snapshot, nodeId, options);
  }
  if (options.enforceBenchmarkReadiness === true) {
    return resolveBenchmarkDiscoveryNodeReadiness(snapshot, nodeId, options);
  }

  const selection = resolveSutLoadNodeSelectionFromDiscovery(snapshot);
  if (selection.nodeIds.includes(nodeId)) {
    return {
      ready: true,
      reasons: [],
    };
  }
  const excludedReadinessReasons =
    selection.excludedReadinessByNodeId?.[nodeId];
  return {
    ready: false,
    reasons:
      Array.isArray(excludedReadinessReasons) &&
      excludedReadinessReasons.length > ZERO ?
        excludedReadinessReasons :
        [DISCOVERY_READINESS_REASON_NOT_SELECTED_BY_DISCOVERY],
  };
}

function truncateDiscoveryErrorMessage(errorMessage) {
  const text = String(errorMessage || '');
  if (text.length <= DISCOVERY_ERROR_MESSAGE_MAX_CHARS) {
    return text;
  }
  return text.slice(ZERO, DISCOVERY_ERROR_MESSAGE_MAX_CHARS);
}

function extractDiscoveryErrorMessageChain(error) {
  const messages = [];
  let current = error;
  let depth = ZERO;
  while (
    current !== null &&
    current !== undefined &&
    depth < DISCOVERY_ERROR_CAUSE_CHAIN_MAX_DEPTH
  ) {
    const message =
      typeof current === 'string' ?
        current :
        typeof current?.message === 'string' ?
          current.message :
          null;
    if (
      typeof message === 'string' &&
      message.length > ZERO &&
      !messages.includes(message)
    ) {
      messages.push(message);
    }
    if (!current || typeof current !== 'object') {
      break;
    }
    current = current.cause;
    depth += ONE;
  }
  return messages;
}

function isNodeClientCircuitOpenError(error) {
  if (
    String(error?.code || '') === DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN
  ) {
    return true;
  }
  const messageChain = extractDiscoveryErrorMessageChain(error);
  if (
    messageChain.some((message) =>
      String(message).includes(
        'code=' + DISCOVERY_NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
      ),
    )
  ) {
    return true;
  }
  return messageChain.some((message) =>
    String(message).includes('circuit breaker is open'),
  );
}

function buildDiscoveryNodeClientErrorContext(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const fragments = [];
  if (typeof error.operation === 'string' && error.operation.length > ZERO) {
    fragments.push('operation=' + error.operation);
  }
  if (typeof error.channel === 'string' && error.channel.length > ZERO) {
    fragments.push('channel=' + error.channel);
  }
  if (
    typeof error.timeoutClass === 'string' &&
    error.timeoutClass.length > ZERO
  ) {
    fragments.push('timeoutClass=' + error.timeoutClass);
  }
  if (typeof error.code === 'string' && error.code.length > ZERO) {
    fragments.push('code=' + error.code);
  }
  if (fragments.length === ZERO) {
    return null;
  }
  return (
    DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_PREFIX +
    fragments.join(',') +
    DISCOVERY_ERROR_NODE_CLIENT_CONTEXT_SUFFIX
  );
}

function summarizeDiscoverySourceError(error) {
  const messageChain = extractDiscoveryErrorMessageChain(error);
  let primaryMessage =
    messageChain.length > ZERO ? messageChain[ZERO] : String(error || '');
  if (primaryMessage.startsWith('NodeClient ') && messageChain.length > ONE) {
    primaryMessage = messageChain[ONE];
  }
  const context = buildDiscoveryNodeClientErrorContext(error);
  const chainSummary =
    messageChain.length > ONE ?
      messageChain.join(DISCOVERY_ERROR_CHAIN_SEPARATOR) :
      null;
  let summary = primaryMessage;
  if (context) {
    summary += ' (' + context + ')';
  }
  if (
    chainSummary &&
    chainSummary !== summary &&
    !summary.includes(chainSummary)
  ) {
    summary += ' | chain=' + chainSummary;
  }
  return truncateDiscoveryErrorMessage(summary);
}

function normalizeNodeReasonListMap(inputMap) {
  if (!inputMap || typeof inputMap !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(inputMap).map(([nodeId, reasons]) => [
      String(nodeId),
      Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
    ]),
  );
}

function normalizeDiscoverySourceResults(sourceResults) {
  if (!Array.isArray(sourceResults)) {
    return [];
  }
  return sourceResults.map((sourceResult) => ({
    ...sourceResult,
    discoveredNodeIds: Array.isArray(sourceResult?.discoveredNodeIds) ?
      [...sourceResult.discoveredNodeIds] :
      [],
    excludedReadinessByNodeId: normalizeNodeReasonListMap(
      sourceResult?.excludedReadinessByNodeId,
    ),
  }));
}

function cloneNodeAdmissionTraceMap(traceMap) {
  return traceMap && typeof traceMap === 'object' ?
    globalThis.structuredClone(traceMap) :
    {};
}

function copyArrayOrEmpty(values) {
  return Array.isArray(values) ? [...values] : [];
}

function buildSutLoadDiscoveryDiagnostics(options = {}) {
  const gateReason =
    typeof options.gateReason === 'string' && options.gateReason.length > ZERO ?
      options.gateReason :
      null;
  const diagnostics = {
    attempts: Number.isInteger(options.attempts) ? options.attempts : ZERO,
    timedOut: options.timedOut === true,
    strictMinReachable: options.strictMinReachable === true,
    requiredReachableNodeCount:
      Number.isInteger(options.requiredReachableNodeCount) &&
      options.requiredReachableNodeCount > ZERO ?
        options.requiredReachableNodeCount :
        ONE,
    gateReason,
    discoveredNodeIds: copyArrayOrEmpty(options.discoveredNodeIds),
    candidateNodeIds: copyArrayOrEmpty(options.candidateNodeIds),
    reachableNodeIds: copyArrayOrEmpty(options.reachableNodeIds),
    sourceResults: normalizeDiscoverySourceResults(options.sourceResults),
    [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
      normalizeNodeReasonListMap(
        options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID],
      ),
    [DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID]:
      cloneNodeAdmissionTraceMap(
        options[DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID],
      ),
    elapsedMs: Number.isFinite(options.elapsedMs) ?
      Math.max(ZERO, Math.floor(options.elapsedMs)) :
      ZERO,
  };
  const excludedReadinessByNodeId =
    aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics);
  return {
    ...diagnostics,
    [DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID]:
      excludedReadinessByNodeId,
    [DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE]:
      aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
        excludedReadinessByNodeId,
      ),
  };
}

function aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics) {
  const aggregated = {};
  const sourceResults = Array.isArray(diagnostics?.sourceResults) ?
    diagnostics.sourceResults :
    [];
  for (const sourceResult of sourceResults) {
    const exclusions =
      sourceResult?.excludedReadinessByNodeId &&
      typeof sourceResult.excludedReadinessByNodeId === 'object' ?
        sourceResult.excludedReadinessByNodeId :
        {};
    for (const [nodeId, reasons] of Object.entries(exclusions)) {
      if (!Object.prototype.hasOwnProperty.call(aggregated, nodeId)) {
        aggregated[nodeId] = [];
      }
      const reasonList = Array.isArray(reasons) ?
        reasons.map((reason) => String(reason)) :
        [];
      for (const reason of reasonList) {
        if (!aggregated[nodeId].includes(reason)) {
          aggregated[nodeId].push(reason);
        }
      }
    }
  }
  return aggregated;
}

function aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
  exclusionsByNodeId,
) {
  const reasonCounts = {};
  const entries =
    exclusionsByNodeId && typeof exclusionsByNodeId === 'object' ?
      Object.entries(exclusionsByNodeId) :
      [];
  for (const [_nodeId, reasons] of entries) {
    const uniqueReasons = new Set(
      Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
    );
    for (const reason of uniqueReasons) {
      reasonCounts[reason] = (reasonCounts[reason] || ZERO) + ONE;
    }
  }
  return reasonCounts;
}

function resolveNonEmptyStringOrFallback(value, fallback) {
  return typeof value === 'string' && value.length > ZERO ? value : fallback;
}

function formatNodeReasonsEntry(nodeId, reasons, fallbackReason = 'unknown') {
  const reasonList =
    Array.isArray(reasons) && reasons.length > ZERO ?
      reasons.join('|') :
      fallbackReason;
  return String(nodeId) + ':' + reasonList;
}

function formatNodeReasonsMap(reasonsByNodeId, separator, fallbackReason) {
  if (!reasonsByNodeId || typeof reasonsByNodeId !== 'object') {
    return '';
  }
  return Object.entries(reasonsByNodeId)
    .map(([nodeId, reasons]) =>
      formatNodeReasonsEntry(nodeId, reasons, fallbackReason),
    )
    .join(separator);
}

function formatDiscoveredServiceTarget(source, sourceNodeIds) {
  const serviceId = resolveNonEmptyStringOrFallback(
    source.serviceId,
    'unknown-service',
  );
  const protocol = resolveNonEmptyStringOrFallback(
    source.protocol,
    'unknown-protocol',
  );
  return '=' + serviceId + '@' + protocol + ':' + sourceNodeIds.join('|');
}

function formatDiscoverySourceResultEntry(sourceResult) {
  const source =
    sourceResult && typeof sourceResult === 'object' ? sourceResult : {};
  const nodeId = resolveNonEmptyStringOrFallback(
    source.nodeId,
    DISCOVERY_UNKNOWN_NODE_ID,
  );
  const status = resolveNonEmptyStringOrFallback(
    source.status,
    DISCOVERY_SOURCE_STATUS_EMPTY,
  );
  const scope = resolveNonEmptyStringOrFallback(source.scope, null);
  const statusWithScope = scope ? status + '@' + scope : status;
  if (status === DISCOVERY_SOURCE_STATUS_ERROR) {
    return (
      nodeId + ':' + statusWithScope + '=' + String(source.error || 'unknown')
    );
  }
  const excludedReadiness = formatNodeReasonsMap(
    source.excludedReadinessByNodeId,
    ',',
    'unknown',
  );
  const excludedSuffix =
    excludedReadiness.length > ZERO ?
      '[excluded=' + excludedReadiness + ']' :
      '';
  const sourceNodeIds = Array.isArray(source.discoveredNodeIds) ?
    source.discoveredNodeIds :
    [];
  const targetSuffix =
    sourceNodeIds.length > ZERO ?
      formatDiscoveredServiceTarget(source, sourceNodeIds) :
      '';
  return nodeId + ':' + statusWithScope + targetSuffix + excludedSuffix;
}

function resolveDiagnosticsExclusionsAndCounts(diagnostics) {
  const existingExclusions =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUDED_READINESS_BY_NODE_ID];
  const excludedReadinessByNodeId =
    existingExclusions && typeof existingExclusions === 'object' ?
      existingExclusions :
      aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics);
  const existingCounts =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_EXCLUSION_REASON_COUNTS_BY_NODE];
  const exclusionReasonCountsByNode =
    existingCounts && typeof existingCounts === 'object' ?
      existingCounts :
      aggregateDiscoveryReadinessExclusionReasonCountsByNodeId(
        excludedReadinessByNodeId,
      );
  return {
    excludedReadinessByNodeId,
    exclusionReasonCountsByNode,
  };
}

function formatAdmissionStateTraceSummary(nodeAdmissionTraceByNodeId) {
  if (
    !nodeAdmissionTraceByNodeId ||
    typeof nodeAdmissionTraceByNodeId !== 'object'
  ) {
    return '';
  }
  return Object.entries(nodeAdmissionTraceByNodeId)
    .map(([nodeId, trace]) => {
      const state = resolveNonEmptyStringOrFallback(
        trace?.derivedState,
        'unknown',
      );
      return String(nodeId) + ':' + state;
    })
    .join(DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR);
}

function appendIfNonEmpty(targetList, prefix, value) {
  if (typeof value === 'string' && value.length > ZERO) {
    targetList.push(prefix + value);
  }
}

function formatSutLoadDiscoveryDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return '';
  }
  const attempts = Number.isInteger(diagnostics.attempts) ?
    diagnostics.attempts :
    ZERO;
  const requiredReachableNodeCount =
    Number.isInteger(diagnostics.requiredReachableNodeCount) &&
    diagnostics.requiredReachableNodeCount > ZERO ?
      diagnostics.requiredReachableNodeCount :
      ONE;
  const discoveredNodeIds = Array.isArray(diagnostics.discoveredNodeIds) ?
    diagnostics.discoveredNodeIds :
    [];
  const sourceResults = Array.isArray(diagnostics.sourceResults) ?
    diagnostics.sourceResults :
    [];
  const {excludedReadinessByNodeId, exclusionReasonCountsByNode} =
    resolveDiagnosticsExclusionsAndCounts(diagnostics);
  const sourceSummary = sourceResults
    .map((sourceResult) => formatDiscoverySourceResultEntry(sourceResult))
    .join(';');
  const probeSummary = formatNodeReasonsMap(
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID],
    ';',
    DISCOVERY_PROBE_REASON_ADMIN_NOT_READY,
  );
  const excludedNodeSummary = formatNodeReasonsMap(
    excludedReadinessByNodeId,
    DISCOVERY_DIAGNOSTIC_NODE_REASON_SEPARATOR,
    'unknown',
  );
  const excludedReasonCountSummary = Object.entries(exclusionReasonCountsByNode)
    .map(([reason, count]) => String(reason) + ':' + String(count))
    .join(DISCOVERY_DIAGNOSTIC_REASON_COUNT_SEPARATOR);
  const admissionStateSummary = formatAdmissionStateTraceSummary(
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID],
  );
  const diagnosticsSummary = [
    'attempts=' + String(attempts),
    'timedOut=' + String(diagnostics.timedOut === true),
    'requiredReachable=' + String(requiredReachableNodeCount),
    'strictMinReachable=' + String(diagnostics.strictMinReachable === true),
    'discovered=' +
      (discoveredNodeIds.length > ZERO ? discoveredNodeIds.join('|') : 'none'),
  ];
  appendIfNonEmpty(diagnosticsSummary, 'gateReason=', diagnostics.gateReason);
  appendIfNonEmpty(diagnosticsSummary, 'sources=', sourceSummary);
  appendIfNonEmpty(
    diagnosticsSummary,
    DISCOVERY_DIAGNOSTIC_PREFIX_PROBES,
    probeSummary,
  );
  diagnosticsSummary.push(
    DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUSION_COUNTS +
      (excludedReasonCountSummary.length > ZERO ?
        excludedReasonCountSummary :
        'none'),
  );
  appendIfNonEmpty(
    diagnosticsSummary,
    DISCOVERY_DIAGNOSTIC_PREFIX_ADMISSION_STATES,
    admissionStateSummary,
  );
  appendIfNonEmpty(
    diagnosticsSummary,
    DISCOVERY_DIAGNOSTIC_PREFIX_EXCLUDED_NODES,
    excludedNodeSummary,
  );
  return diagnosticsSummary.join(', ');
}

function buildStrictDiscoveryGate(options = {}) {
  const strictMinReachable = options.strictMinReachable === true;
  const requiredReachableNodeCount =
    Number.isInteger(options.requiredReachableNodeCount) &&
    options.requiredReachableNodeCount > ZERO ?
      options.requiredReachableNodeCount :
      ONE;
  const reachableNodeCount = Array.isArray(options.nodes) ?
    options.nodes.length :
    ZERO;
  const discoveredNodeCount = Array.isArray(
    options.diagnostics?.discoveredNodeIds,
  ) ?
    options.diagnostics.discoveredNodeIds.length :
    ZERO;
  const reachedTarget = reachableNodeCount >= requiredReachableNodeCount;
  const status =
    !strictMinReachable || reachedTarget ?
      DISCOVERY_GATE_STATUS_PASSED :
      DISCOVERY_GATE_STATUS_FAILED;
  const reason =
    status === DISCOVERY_GATE_STATUS_FAILED ?
      DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
      null;

  return {
    strictMinReachable,
    requiredReachableNodeCount,
    reachableNodeCount,
    discoveredNodeCount,
    status,
    reason,
  };
}

function buildStrictParityGate(options = {}) {
  const strictParity = options.strictParity === true;
  const parity =
    options.parity && typeof options.parity === 'object' ?
      options.parity :
      null;
  const parityStatus = resolveNonEmptyStringOrFallback(parity?.status, null);
  const reasonCodes = Array.isArray(parity?.reasons) ?
    parity.reasons.map((reason) => String(reason)) :
    [];
  const failed = strictParity && parityStatus === LOAD_PARITY_STATUS_MISMATCHED;

  return {
    strictParity,
    parityStatus,
    status: failed ?
      DISCOVERY_GATE_STATUS_FAILED :
      DISCOVERY_GATE_STATUS_PASSED,
    reason: failed ? STRICT_PARITY_REASON_MISMATCH : null,
    reasonCodes,
  };
}

function selectStrictInvariantGateEntries(invariants) {
  return (Array.isArray(invariants) ? invariants : []).filter((invariant) =>
    STRICT_INVARIANT_GATE_IDS.has(String(invariant?.invariantId || '')),
  );
}

function resolveStrictInvariantViolationEntries(breach) {
  const detailViolations = breach?.details?.violations;
  if (Array.isArray(detailViolations)) {
    return detailViolations;
  }
  const observedViolations = breach?.observed?.violations;
  if (Array.isArray(observedViolations)) {
    return observedViolations;
  }
  return [];
}

function isRetryableStrictInvariantHardBreach(breach) {
  const reasonCode = String(breach?.reasonCode || '');
  if (!STRICT_INVARIANT_RETRY_REASON_CODES.has(reasonCode)) {
    return false;
  }
  const violations = resolveStrictInvariantViolationEntries(breach);
  if (violations.length === ZERO) {
    return true;
  }
  return violations.every((violation) =>
    STRICT_INVARIANT_RETRY_LEADERSHIP_ERROR_CODES.has(
      String(violation?.lastErrorCode || ''),
    ),
  );
}

function shouldRetryStrictInvariantBreaches(strictInvariantBreaches) {
  if (
    !strictInvariantBreaches ||
    strictInvariantBreaches.hardCount <= ZERO ||
    !Array.isArray(strictInvariantBreaches.hardBreaches)
  ) {
    return false;
  }
  return strictInvariantBreaches.hardBreaches.every((breach) =>
    isRetryableStrictInvariantHardBreach(breach),
  );
}

function resolveStrictInvariantRetryWindowMs(
  preLoadStableWindowMs,
  benchmarkConfig,
) {
  const pollIntervalMs =
    Number.isInteger(benchmarkConfig?.quiescentPollIntervalMs) &&
    benchmarkConfig.quiescentPollIntervalMs > ZERO ?
      benchmarkConfig.quiescentPollIntervalMs :
      STRICT_INVARIANT_RETRY_MIN_POLL_INTERVAL_MS;
  const stableWindowMs =
    Number.isInteger(preLoadStableWindowMs) && preLoadStableWindowMs >= ZERO ?
      preLoadStableWindowMs :
      ZERO;
  const candidateWindowMs = Math.max(stableWindowMs, pollIntervalMs * 4);
  return Math.min(
    STRICT_INVARIANT_RETRY_MAX_WINDOW_MS,
    Math.max(pollIntervalMs, candidateWindowMs),
  );
}

function evaluateStrictPreloadInvariantsFromSnapshots(
  preLoadSnapshotsByNodeId,
) {
  const invariantEvaluation = evaluateRootCauseInvariants({
    snapshotsByNodeId: preLoadSnapshotsByNodeId,
  });
  const strictInvariantBreaches = summarizeInvariantBreaches(
    selectStrictInvariantGateEntries(invariantEvaluation.invariants),
  );
  return {
    invariantEvaluation,
    strictInvariantBreaches,
  };
}

function createEmptyInternalSignalClassCounts() {
  const counts = {};
  for (const signalClass of INTERNAL_SIGNAL_CLASSES) {
    counts[signalClass] = ZERO;
  }
  return counts;
}

function classifyInternalSignalMessage(message) {
  const text = String(message || '');
  if (INTERNAL_SIGNAL_PATTERN_OPERATION_FAILED.test(text)) {
    return INTERNAL_SIGNAL_CLASS_OPERATION_FAILED;
  }
  if (INTERNAL_SIGNAL_PATTERN_CDC_SAFE_FALLBACK.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK;
  }
  if (INTERNAL_SIGNAL_PATTERN_CDC_BUFFERED_WITHOUT_SUBSCRIBER.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER;
  }
  if (INTERNAL_SIGNAL_PATTERN_CRITICAL_REBALANCING_STATE.test(text)) {
    return INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE;
  }
  return null;
}

function collectInternalSignalMessages(
  loadMetrics,
  scenarioOverrides,
  runtimeMessages,
) {
  const messages = [];
  const distinctErrors = Array.isArray(loadMetrics?.distinctErrors) ?
    loadMetrics.distinctErrors :
    [];
  for (const errorMessage of distinctErrors) {
    messages.push(String(errorMessage));
  }
  if (typeof scenarioOverrides.getInternalSignalMessages === 'function') {
    const overrideMessages = scenarioOverrides.getInternalSignalMessages();
    if (Array.isArray(overrideMessages)) {
      for (const overrideMessage of overrideMessages) {
        messages.push(String(overrideMessage));
      }
    }
  }
  if (Array.isArray(runtimeMessages)) {
    for (const runtimeMessage of runtimeMessages) {
      messages.push(String(runtimeMessage));
    }
  }
  return messages;
}

function buildInternalSignalCounts(
  loadMetrics,
  scenarioOverrides,
  runtimeMessages,
) {
  const errorsByClass = createEmptyInternalSignalClassCounts();
  const warningsByClass = createEmptyInternalSignalClassCounts();
  const messages = collectInternalSignalMessages(
    loadMetrics,
    scenarioOverrides,
    runtimeMessages,
  );

  const failedCount = Number.isInteger(loadMetrics?.failed) ?
    loadMetrics.failed :
    ZERO;
  const errorCount = Number.isInteger(loadMetrics?.errors) ?
    loadMetrics.errors :
    ZERO;
  const attemptErrorCount = Number.isInteger(loadMetrics?.attemptErrors) ?
    loadMetrics.attemptErrors :
    ZERO;
  errorsByClass[INTERNAL_SIGNAL_CLASS_OPERATION_FAILED] += Math.max(
    ZERO,
    failedCount + errorCount + attemptErrorCount,
  );

  for (const message of messages) {
    const signalClass = classifyInternalSignalMessage(message);
    if (!signalClass) {
      continue;
    }
    if (INTERNAL_SIGNAL_SEVERITY_ERRORS_BY_CLASS[signalClass] === true) {
      errorsByClass[signalClass] += ONE;
      continue;
    }
    warningsByClass[signalClass] += ONE;
  }

  return {
    errorsByClass,
    warningsByClass,
    messages,
  };
}

function collectSignalThresholdBreachesForSeverity(
  severity,
  thresholdsByClass,
  observedCountsByClass,
  breaches,
) {
  for (const [signalClass, threshold] of Object.entries(
    thresholdsByClass || {},
  )) {
    const observedCount = Number(observedCountsByClass?.[signalClass] || ZERO);
    if (observedCount >= threshold) {
      breaches.push({
        severity,
        signalClass,
        threshold,
        observedCount,
      });
    }
  }
}

function evaluateInternalSignalThresholds(counts, thresholdPolicy) {
  const policy =
    thresholdPolicy && typeof thresholdPolicy === 'object' ?
      thresholdPolicy :
      resolveInternalSignalThresholds({});
  const breaches = [];
  collectSignalThresholdBreachesForSeverity(
    'error',
    policy.errorsByClass,
    counts?.errorsByClass,
    breaches,
  );
  collectSignalThresholdBreachesForSeverity(
    'warning',
    policy.warningsByClass,
    counts?.warningsByClass,
    breaches,
  );
  return {
    failOnThresholdBreach: policy.failOnThresholdBreach === true,
    breached: breaches.length > ZERO,
    breaches,
  };
}

function formatInternalSignalBreaches(thresholdResult) {
  const breaches = Array.isArray(thresholdResult?.breaches) ?
    thresholdResult.breaches :
    [];
  return breaches
    .map(
      (breach) =>
        String(breach.signalClass) +
        '=' +
        String(breach.observedCount) +
        '>=' +
        String(breach.threshold),
    )
    .join('|');
}

function createEmptySaturationCounters() {
  return {
    schemaVersion: SATURATION_SCHEMA_VERSION,
    cdcForwardTimeoutCount: ZERO,
    systemTableQueryTimeoutCount: ZERO,
    snapshotCollectionErrorCount: ZERO,
  };
}

function recordSaturationPatternsForText(counters, text, increment) {
  if (SATURATION_PATTERN_CDC_FORWARD_TIMEOUT.test(text)) {
    counters.cdcForwardTimeoutCount += increment;
  }
  if (SATURATION_PATTERN_SYSTEM_TABLE_QUERY_TIMEOUT.test(text)) {
    counters.systemTableQueryTimeoutCount += increment;
  }
}

function collectSaturationMessages(options = {}) {
  const messages = [];
  const distinctErrors = Array.isArray(options?.loadMetrics?.distinctErrors) ?
    options.loadMetrics.distinctErrors :
    [];
  for (const errorMessage of distinctErrors) {
    messages.push(String(errorMessage));
  }
  const internalSignalMessages = Array.isArray(options?.internalSignalMessages) ?
    options.internalSignalMessages :
    [];
  for (const signalMessage of internalSignalMessages) {
    messages.push(String(signalMessage));
  }
  return messages;
}

function buildSaturationCounters(options = {}) {
  const counters = createEmptySaturationCounters();
  for (const message of collectSaturationMessages(options)) {
    recordSaturationPatternsForText(counters, message, ONE);
  }

  const reasonHistogram =
    options?.reasonHistogram && typeof options.reasonHistogram === 'object' ?
      options.reasonHistogram :
      {};
  for (const [reason, count] of Object.entries(reasonHistogram)) {
    const normalizedCount = Math.max(ONE, normalizeNonNegativeInteger(count));
    recordSaturationPatternsForText(counters, reason, normalizedCount);
    if (
      reason.includes(QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX) ||
      reason.includes('|probe_error=')
    ) {
      counters.snapshotCollectionErrorCount += normalizedCount;
    }
  }

  return counters;
}

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(Number(value)));
}

function normalizeOptionalNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(ZERO, Math.floor(Number(value)));
}

function normalizeNonNegativeNumber(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Number(value));
}

function normalizeCdcTelemetryMode(value) {
  return value === CDC_TELEMETRY_MODE_CATCHUP ?
    CDC_TELEMETRY_MODE_CATCHUP :
    CDC_TELEMETRY_MODE_STEADY;
}

function normalizeAuthoritativeFallbackPhaseCounts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    windowCount: normalizeNonNegativeInteger(source.windowCount),
    totalCount: normalizeNonNegativeInteger(source.totalCount),
  };
}

function normalizeAuthoritativeFallbackTelemetry(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    schemaVersion: normalizeNonNegativeInteger(source.schemaVersion) || ONE,
    nodeId: typeof source.nodeId === 'string' ? source.nodeId : null,
    windowMs: normalizeNonNegativeInteger(source.windowMs),
    totalCount: normalizeNonNegativeInteger(source.totalCount),
    windowCount: normalizeNonNegativeInteger(source.windowCount),
    windowRatePerMinute: normalizeNonNegativeNumber(source.windowRatePerMinute),
    phases: {
      [CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_BOOTSTRAP],
        ),
      [CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_RECOVERY],
        ),
      [CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE]:
        normalizeAuthoritativeFallbackPhaseCounts(
          source.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE],
        ),
    },
  };
}

function normalizeCdcTelemetryNodeSample(nodeId, sample) {
  const source = sample && typeof sample === 'object' ? sample : {};
  const missingFields = [];
  const normalizedSample = {
    nodeId: String(nodeId),
    [CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT]: normalizeNonNegativeInteger(
      source[CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT],
    ),
    [CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS]: normalizeNonNegativeInteger(
      source[CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS],
    ),
    [CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS]: normalizeNonNegativeInteger(
      source[CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS],
    ),
    [CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC]:
      normalizeNonNegativeNumber(
        source[CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC],
      ),
    [CDC_TELEMETRY_NODE_FIELD_MODE]: normalizeCdcTelemetryMode(
      source[CDC_TELEMETRY_NODE_FIELD_MODE],
    ),
    [CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK]:
      normalizeAuthoritativeFallbackTelemetry(
        source[CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK],
      ),
  };

  for (const requiredField of CDC_TELEMETRY_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, requiredField)) {
      missingFields.push(requiredField);
    }
  }

  return {
    sample: normalizedSample,
    missingFields,
  };
}

export const POSTGRES_BASELINE_COMPARISON_DISCOVERY_DIAGNOSTICS_AND_GATES_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_DISCOVERY_READINESS_BUNDLE,
  resolveNodeReadinessFromServiceDiscovery,
  truncateDiscoveryErrorMessage,
  extractDiscoveryErrorMessageChain,
  isNodeClientCircuitOpenError,
  buildDiscoveryNodeClientErrorContext,
  summarizeDiscoverySourceError,
  buildSutLoadDiscoveryDiagnostics,
  aggregateDiscoveryReadinessExclusionsByNodeId,
  aggregateDiscoveryReadinessExclusionReasonCountsByNodeId,
  formatSutLoadDiscoveryDiagnostics,
  buildStrictDiscoveryGate,
  buildStrictParityGate,
  selectStrictInvariantGateEntries,
  resolveStrictInvariantViolationEntries,
  isRetryableStrictInvariantHardBreach,
  shouldRetryStrictInvariantBreaches,
  resolveStrictInvariantRetryWindowMs,
  evaluateStrictPreloadInvariantsFromSnapshots,
  createEmptyInternalSignalClassCounts,
  classifyInternalSignalMessage,
  collectInternalSignalMessages,
  buildInternalSignalCounts,
  evaluateInternalSignalThresholds,
  formatInternalSignalBreaches,
  createEmptySaturationCounters,
  buildSaturationCounters,
  normalizeNonNegativeInteger,
  normalizeOptionalNonNegativeInteger,
  normalizeNonNegativeNumber,
  normalizeCdcTelemetryMode,
  normalizeAuthoritativeFallbackPhaseCounts,
  normalizeAuthoritativeFallbackTelemetry,
  normalizeCdcTelemetryNodeSample,
};
