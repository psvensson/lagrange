import {POSTGRES_BASELINE_COMPARISON_SEGMENT_4} from './postgres-baseline-comparison-segment-4.js';
const {
  CONSISTENCY_MISMATCH_KIND,
  CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE,
  CDC_TELEMETRY_MODE_CATCHUP,
  CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK,
  CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS,
  CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC,
  CDC_TELEMETRY_NODE_FIELD_MODE,
  CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT,
  CDC_TELEMETRY_SCHEMA_VERSION,
  DISCOVERY_UNKNOWN_NODE_ID,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX,
  QUIESCENCE_SNAPSHOT_ERROR_ASSIGN,
  QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES,
  QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX,
  QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR,
  ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
  ROUTING_DISCOVERY_QUERY_ERROR_PREFIX,
  SNAPSHOT_WARNING_PREFIX,
  ZERO,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadDiscoveryContextSequence,
  buildSutLoadNodeAdmissionDecisionTrace,
  buildSutTableProbeSql,
  extractLocalReplicaReadiness,
  fetchLocalServiceDiscoverySnapshot,
  hasLoadLaneConfirmableLocalReadinessBlock,
  isNodeAdminReady,
  normalizeSutLoadNodeAdmissionEvidence,
  normalizeCdcTelemetryNodeSample,
  normalizeNonNegativeInteger,
  normalizeNonNegativeNumber,
  probeLoadLaneReadiness,
  probeReadinessWithCircuitOpenFallback,
  shouldConfirmLocalReadinessViaLoadLane,
  shouldPreserveTopologyDeferredAdmission,
  summarizeDiscoverySourceError,
  summarizeReadinessProbeReasons,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_4;

function buildCdcTelemetrySummary(normalizedByNode) {
  const samples = Object.values(normalizedByNode);
  let totalSubscriberCount = ZERO;
  let totalBufferedEvents = ZERO;
  let maxCatchupLagEvents = ZERO;
  let totalCatchupThroughputEventsPerSec = ZERO;
  let catchupNodeCount = ZERO;
  let totalAuthoritativeFallbackCount = ZERO;
  let totalAuthoritativeFallbackWindowCount = ZERO;
  let steadyStateAuthoritativeFallbackWindowCount = ZERO;

  for (const sample of samples) {
    totalSubscriberCount += normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_SUBSCRIBER_COUNT],
    );
    totalBufferedEvents += normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_BUFFERED_EVENTS],
    );
    const catchupLagEvents = normalizeNonNegativeInteger(
      sample?.[CDC_TELEMETRY_NODE_FIELD_CATCHUP_LAG_EVENTS],
    );
    maxCatchupLagEvents = Math.max(maxCatchupLagEvents, catchupLagEvents);
    totalCatchupThroughputEventsPerSec += normalizeNonNegativeNumber(
      sample?.[CDC_TELEMETRY_NODE_FIELD_CATCHUP_THROUGHPUT_EVENTS_PER_SEC],
    );
    const authoritativeFallback =
      sample?.[CDC_TELEMETRY_NODE_FIELD_AUTHORITATIVE_FALLBACK];
    totalAuthoritativeFallbackCount += normalizeNonNegativeInteger(
      authoritativeFallback?.totalCount,
    );
    totalAuthoritativeFallbackWindowCount += normalizeNonNegativeInteger(
      authoritativeFallback?.windowCount,
    );
    steadyStateAuthoritativeFallbackWindowCount += normalizeNonNegativeInteger(
      authoritativeFallback?.phases?.[CDC_TELEMETRY_FALLBACK_PHASE_STEADY_STATE]
        ?.windowCount,
    );
    if (
      sample?.[CDC_TELEMETRY_NODE_FIELD_MODE] === CDC_TELEMETRY_MODE_CATCHUP
    ) {
      catchupNodeCount += ONE;
    }
  }

  const nodeCount = samples.length;
  const steadyNodeCount = Math.max(ZERO, nodeCount - catchupNodeCount);

  return {
    nodeCount,
    totalSubscriberCount,
    totalBufferedEvents,
    maxCatchupLagEvents,
    avgCatchupThroughputEventsPerSec:
      nodeCount > ZERO ? totalCatchupThroughputEventsPerSec / nodeCount : ZERO,
    catchupNodeCount,
    steadyNodeCount,
    authoritativeFallback: {
      totalCount: totalAuthoritativeFallbackCount,
      windowCount: totalAuthoritativeFallbackWindowCount,
      steadyStateWindowCount: steadyStateAuthoritativeFallbackWindowCount,
    },
  };
}

function buildCdcTelemetrySchemaResult(options = {}) {
  const normalizedByNode =
    options.normalizedByNode && typeof options.normalizedByNode === 'object' ?
      options.normalizedByNode :
      {};
  const requiredNodeIds = Array.isArray(options.requiredNodeIds) ?
    options.requiredNodeIds.map((nodeId) => String(nodeId)) :
    [];
  const strict = options.strict === true;
  const schemaErrors = [];

  for (const nodeId of requiredNodeIds) {
    if (!Object.prototype.hasOwnProperty.call(normalizedByNode, nodeId)) {
      schemaErrors.push({
        nodeId,
        missingFields: ['nodeTelemetry'],
      });
    }
  }

  const fieldErrors = Array.isArray(options.fieldErrors) ?
    options.fieldErrors :
    [];
  for (const fieldError of fieldErrors) {
    if (!fieldError || typeof fieldError !== 'object') {
      continue;
    }
    const missingFields = Array.isArray(fieldError.missingFields) ?
      fieldError.missingFields.map((fieldName) => String(fieldName)) :
      [];
    if (missingFields.length === ZERO) {
      continue;
    }
    schemaErrors.push({
      nodeId: String(fieldError.nodeId || 'unknown'),
      missingFields,
    });
  }

  return {
    strict,
    valid: schemaErrors.length === ZERO,
    errors: schemaErrors,
  };
}

async function collectCdcTelemetryByNode(nodeClient, nodes, scenarioOverrides) {
  if (typeof scenarioOverrides?.getCdcTelemetryByNode === 'function') {
    const overrideResult = scenarioOverrides.getCdcTelemetryByNode();
    if (overrideResult && typeof overrideResult === 'object') {
      return {...overrideResult};
    }
  }

  const collectedByNode = {};
  for (const node of nodes) {
    try {
      const snapshot = await nodeClient.fetchControlSnapshot(node);
      const cdcTelemetry = snapshot?.cdcTelemetry;
      if (cdcTelemetry && typeof cdcTelemetry === 'object') {
        collectedByNode[String(node.id)] = {...cdcTelemetry};
      }
    } catch (_error) {
      continue;
    }
  }
  return collectedByNode;
}

function buildCdcTelemetryState(options = {}) {
  const rawByNode =
    options.rawByNode && typeof options.rawByNode === 'object' ?
      options.rawByNode :
      {};
  const normalizedByNode = {};
  const fieldErrors = [];
  for (const [nodeId, sample] of Object.entries(rawByNode)) {
    const normalized = normalizeCdcTelemetryNodeSample(nodeId, sample);
    normalizedByNode[String(nodeId)] = normalized.sample;
    if (normalized.missingFields.length > ZERO) {
      fieldErrors.push({
        nodeId: String(nodeId),
        missingFields: normalized.missingFields,
      });
    }
  }

  const schema = buildCdcTelemetrySchemaResult({
    normalizedByNode,
    requiredNodeIds: options.requiredNodeIds,
    fieldErrors,
    strict: options.strict === true,
  });

  return {
    schemaVersion: CDC_TELEMETRY_SCHEMA_VERSION,
    byNode: normalizedByNode,
    summary: buildCdcTelemetrySummary(normalizedByNode),
    schema,
  };
}

function formatCdcTelemetrySchemaErrors(cdcTelemetryState) {
  const errors = Array.isArray(cdcTelemetryState?.schema?.errors) ?
    cdcTelemetryState.schema.errors :
    [];
  return errors
    .map(
      (error) =>
        String(error.nodeId) +
        '=' +
        (Array.isArray(error.missingFields) ?
          error.missingFields.join(',') :
          'unknown'),
    )
    .join('|');
}

function summarizeCandidateSnapshotErrors(errors, options = {}) {
  const normalizedErrors = Array.isArray(errors) ? errors : [];
  const fallbackReason =
    typeof options.fallbackReason === 'string' &&
    options.fallbackReason.length > ZERO ?
      options.fallbackReason :
      QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE;
  if (normalizedErrors.length === ZERO) {
    return fallbackReason;
  }
  const errorPrefix =
    typeof options.errorPrefix === 'string' && options.errorPrefix.length > ZERO ?
      options.errorPrefix :
      QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX;
  const limitedErrors = normalizedErrors.slice(
    ZERO,
    QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES,
  );
  const errorSegments = limitedErrors.map(
    (entry) =>
      String(entry.nodeId || 'unknown') +
      QUIESCENCE_SNAPSHOT_ERROR_ASSIGN +
      String(entry.error || 'unknown'),
  );
  const remainingCount = normalizedErrors.length - limitedErrors.length;
  if (remainingCount > ZERO) {
    errorSegments.push(
      String(remainingCount) + QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX,
    );
  }
  return errorPrefix + errorSegments.join(QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR);
}

function resolveControlSnapshotCandidates(seedNode, loadNodes) {
  const nodes = [];
  if (seedNode) {
    nodes.push(seedNode);
  }
  if (Array.isArray(loadNodes)) {
    nodes.push(...loadNodes);
  }
  const seenNodeIds = new Set();
  const candidates = [];
  for (const node of nodes) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ? node.id : null;
    if (!nodeId) {
      continue;
    }
    if (seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    candidates.push(node);
  }
  return candidates;
}

function resolveRequiredReachableLoadNodeCount(options = {}, candidateCount) {
  const boundedCandidateCount =
    Number.isInteger(candidateCount) && candidateCount > ZERO ?
      candidateCount :
      ONE;
  const strictMinReachable = options.strictMinReachable === true;
  const requestedMinimum =
    Number.isInteger(options.minReachableNodeCount) &&
    options.minReachableNodeCount > ZERO ?
      options.minReachableNodeCount :
      ONE;
  if (strictMinReachable) {
    return Math.max(ONE, requestedMinimum);
  }
  return Math.max(ONE, Math.min(boundedCandidateCount, requestedMinimum));
}

function formatReadinessReasonsByNodeId(reasonsByNodeId = {}) {
  return Object.entries(
    reasonsByNodeId && typeof reasonsByNodeId === 'object' ?
      reasonsByNodeId :
      {},
  )
    .map(
      ([nodeId, reasons]) =>
        String(nodeId) +
        '=' +
        (Array.isArray(reasons) && reasons.length > ZERO ?
          reasons.join('|') :
          'unknown'),
    )
    .join('; ');
}

async function evaluateSutLoadNodeAdmissionCandidates(
  nodeClient,
  candidateNodes,
  options = {},
) {
  const candidates = Array.isArray(candidateNodes) ?
    candidateNodes.filter(Boolean) :
    [];
  if (candidates.length === ZERO) {
    return {
      reachableCandidates: [],
      adminFallbackCandidates: [],
      verifiedLoadLaneFallbackCandidates: [],
      probeReadinessByNodeId: {},
      nodeAdmissionTraceByNodeId: {},
    };
  }

  const discoveryContextSequence =
    Array.isArray(options.contextSequence) &&
    options.contextSequence.length > ZERO ?
      options.contextSequence :
      buildSutLoadDiscoveryContextSequence(
        NODE_CLIENT_TRANSIENT_CONTEXT,
        options.tableName,
        options.tableId,
      );
  const loadLaneTableProbeSql =
    typeof options.loadLaneTableProbeSql === 'string' ?
      options.loadLaneTableProbeSql :
      buildSutTableProbeSql(options.tableName);
  const allowSoftDiscoveryNodeFallback =
    options.allowSoftDiscoveryNodeFallback === true;
  const deferLocalReplicaReadiness =
    options.deferLocalReplicaReadiness === true;
  const readinessProbeResults = await Promise.all(
    candidates.map(async (node) => {
      try {
        const diagnostics = await probeReadinessWithCircuitOpenFallback(
          nodeClient,
          node,
        );
        const localSnapshot = await fetchLocalServiceDiscoverySnapshot(
          nodeClient,
          node,
          {
            contextSequence: discoveryContextSequence,
          },
        );
        const localReadiness = extractLocalReplicaReadiness(
          localSnapshot,
          node.id,
          {
            admissionRuntimeOwnership: options.admissionRuntimeOwnership,
          },
        );
        const adminReady = isNodeAdminReady(diagnostics);
        const hasConfirmableLocalReadinessBlock =
          hasLoadLaneConfirmableLocalReadinessBlock(localReadiness?.evaluation);
        const shouldProbeLoadLane =
          (deferLocalReplicaReadiness !== true &&
            shouldConfirmLocalReadinessViaLoadLane(localReadiness, {
              adminReady,
              allowSoftDiscoveryNodeFallback,
              hasTableProbe: loadLaneTableProbeSql.length > ZERO,
            })) ||
          (allowSoftDiscoveryNodeFallback === true &&
            shouldPreserveTopologyDeferredAdmission(localReadiness) !== true &&
            loadLaneTableProbeSql.length > ZERO);
        const loadLaneReadiness = shouldProbeLoadLane ?
          await probeLoadLaneReadiness(nodeClient, node, {
            tableProbeSql: loadLaneTableProbeSql,
            allowControlChannelFallback: hasConfirmableLocalReadinessBlock,
          }) :
          {ready: false, reasons: []};
        return {
          node,
          diagnostics,
          error: null,
          adminReady,
          localReadiness,
          shouldProbeLoadLane,
          loadLaneReadiness,
        };
      } catch (_error) {
        return {
          node,
          diagnostics: null,
          error: summarizeDiscoverySourceError(_error),
          adminReady: false,
          localReadiness: null,
          shouldProbeLoadLane: false,
          loadLaneReadiness: {
            ready: false,
            reasons: [],
          },
        };
      }
    }),
  );

  const reachableCandidates = [];
  const adminFallbackCandidates = [];
  const verifiedLoadLaneFallbackCandidates = [];
  const probeReadinessByNodeId = {};
  const nodeAdmissionTraceByNodeId = {};
  for (const probeResult of readinessProbeResults) {
    const nodeId = String(probeResult?.node?.id || DISCOVERY_UNKNOWN_NODE_ID);
    const adminReasons =
      probeResult?.adminReady === true ?
        [] :
        summarizeReadinessProbeReasons({
          diagnostics: probeResult?.diagnostics,
          error: probeResult?.error,
        });
    const admissionDecision = adjudicateSutLoadNodeAdmission(
      normalizeSutLoadNodeAdmissionEvidence({
        nodeId,
        adminReady: probeResult?.adminReady === true,
        adminReasons,
        localReadiness: probeResult?.localReadiness,
        loadLaneAttempted: probeResult?.shouldProbeLoadLane === true,
        loadLaneReadiness: probeResult?.loadLaneReadiness,
        deferLocalReplicaReadiness,
        allowTopologyDeferredSelection: true,
      }),
    );
    nodeAdmissionTraceByNodeId[nodeId] = buildSutLoadNodeAdmissionDecisionTrace(
      {
        nodeId,
        adminReady: probeResult?.adminReady === true,
        adminReasons,
        localReadiness: probeResult?.localReadiness,
        loadLaneAttempted: probeResult?.shouldProbeLoadLane === true,
        loadLaneReadiness: probeResult?.loadLaneReadiness,
      },
      admissionDecision,
    );
    if (probeResult?.adminReady === true && probeResult?.node) {
      adminFallbackCandidates.push(probeResult.node);
      if (probeResult?.loadLaneReadiness?.ready === true) {
        verifiedLoadLaneFallbackCandidates.push(probeResult.node);
      }
    }
    if (admissionDecision.admit === true) {
      reachableCandidates.push(probeResult.node);
      continue;
    }
    probeReadinessByNodeId[nodeId] = admissionDecision.exclusionReasons;
  }

  return {
    reachableCandidates,
    adminFallbackCandidates,
    verifiedLoadLaneFallbackCandidates,
    probeReadinessByNodeId,
    nodeAdmissionTraceByNodeId,
  };
}

async function revalidateDegradedPreloadLoadNodes(
  nodeClient,
  candidateNodes,
  options = {},
) {
  const admission = await evaluateSutLoadNodeAdmissionCandidates(
    nodeClient,
    candidateNodes,
    {
      tableName: options.tableName,
      tableId: options.tableId,
      loadLaneTableProbeSql: buildSutTableProbeSql(options.tableName),
      allowSoftDiscoveryNodeFallback: true,
      deferLocalReplicaReadiness: false,
      admissionRuntimeOwnership: options.admissionRuntimeOwnership,
    },
  );
  const admittedNodeIds = admission.reachableCandidates.map((node) => node.id);
  const admittedNodeIdSet = new Set(admittedNodeIds);
  const excludedNodeIds = candidateNodes
    .map((node) => String(node?.id || ''))
    .filter((nodeId) => nodeId.length > ZERO)
    .filter((nodeId) => !admittedNodeIdSet.has(nodeId));
  return {
    nodes: admission.reachableCandidates,
    admittedNodeIds,
    excludedNodeIds,
    probeReadinessByNodeId: admission.probeReadinessByNodeId,
    nodeAdmissionTraceByNodeId: admission.nodeAdmissionTraceByNodeId,
  };
}

async function fetchControlSnapshotFromCandidates(
  nodeClient,
  candidates,
  context = {},
) {
  return fetchSnapshotFromCandidates(
    candidates,
    (node) => nodeClient.fetchControlSnapshot(node, context),
    {
      fallbackReason: QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
      errorPrefix: QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX,
    },
  );
}

async function fetchSnapshotFromCandidates(
  candidates,
  fetchSnapshot,
  options = {},
) {
  if (!Array.isArray(candidates) || candidates.length === ZERO) {
    throw new Error(
      options.fallbackReason || QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE,
    );
  }
  const errors = [];
  for (const node of candidates) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ?
        node.id :
        'unknown';
    try {
      return await fetchSnapshot(node);
    } catch (error) {
      errors.push({
        nodeId,
        error: String(error?.message || error),
      });
    }
  }
  throw new Error(summarizeCandidateSnapshotErrors(errors, options));
}

async function fetchServiceDiscoveryFromCandidates(
  nodeClient,
  candidates,
  context = {},
) {
  return fetchSnapshotFromCandidates(
    candidates,
    (node) => nodeClient.fetchServiceDiscovery(node, context),
    {
      fallbackReason: ROUTING_DISCOVERY_NO_SNAPSHOT_CANDIDATE,
      errorPrefix: ROUTING_DISCOVERY_QUERY_ERROR_PREFIX,
    },
  );
}

function createVerificationSnapshotRefreshResult() {
  return {
    attempted: false,
    triggerMismatchKind: null,
    targetNodeIds: [],
    refreshedNodeIds: [],
    failedNodeIds: [],
    resolved: null,
  };
}

function buildSnapshotWarning(prefix, nodeId, error) {
  return (
    prefix + String(nodeId || 'unknown') + '=' + String(error?.message || error)
  );
}

async function collectControlSnapshotsFromNodes(
  nodeClient,
  nodes,
  options = {},
) {
  const candidates = Array.isArray(nodes) ? nodes : [];
  const context =
    options.context && typeof options.context === 'object' ?
      options.context :
      {};
  const warningPrefix =
    typeof options.warningPrefix === 'string' &&
    options.warningPrefix.length > ZERO ?
      options.warningPrefix :
      SNAPSHOT_WARNING_PREFIX;
  const snapshots = [];
  const warnings = [];
  for (const node of candidates) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ?
        node.id :
        'unknown';
    try {
      snapshots.push(await nodeClient.fetchControlSnapshot(node, context));
    } catch (error) {
      warnings.push(buildSnapshotWarning(warningPrefix, nodeId, error));
    }
  }
  return {
    snapshots,
    warnings,
  };
}

function resolvePartitionSetMismatchEntry(mismatches) {
  const entries = Array.isArray(mismatches) ? mismatches : [];
  for (const entry of entries) {
    if (String(entry?.kind || '') === CONSISTENCY_MISMATCH_KIND.PARTITION_SET) {
      return entry;
    }
  }
  return null;
}

function normalizePartitionSetSignature(partitions) {
  const values = Array.isArray(partitions) ? partitions : [];
  return JSON.stringify(
    values
      .map((value) => String(value))
      .filter((value) => value.length > ZERO)
      .sort(),
  );
}

function resolvePartitionSetRefreshNodeIds(
  partitionSetMismatch,
  verificationNodeIds,
) {
  const byNode =
    partitionSetMismatch?.byNode &&
    typeof partitionSetMismatch.byNode === 'object' ?
      partitionSetMismatch.byNode :
      {};
  const allowedNodeIds = new Set(
    (Array.isArray(verificationNodeIds) ? verificationNodeIds : []).map(
      (nodeId) => String(nodeId),
    ),
  );
  const signatureByNodeId = new Map();
  const signatureCounts = new Map();

  for (const [rawNodeId, partitions] of Object.entries(byNode)) {
    const nodeId = String(rawNodeId);
    if (allowedNodeIds.size > ZERO && !allowedNodeIds.has(nodeId)) {
      continue;
    }
    const signature = normalizePartitionSetSignature(partitions);
    signatureByNodeId.set(nodeId, signature);
    signatureCounts.set(
      signature,
      (signatureCounts.get(signature) || ZERO) + ONE,
    );
  }

  if (signatureByNodeId.size === ZERO) {
    return [];
  }

  let majoritySignature = null;
  let majorityCount = -ONE;
  for (const [signature, count] of signatureCounts.entries()) {
    if (count > majorityCount) {
      majoritySignature = signature;
      majorityCount = count;
      continue;
    }
    if (
      count === majorityCount &&
      majoritySignature !== null &&
      signature < majoritySignature
    ) {
      majoritySignature = signature;
    }
  }

  const targetNodeIds = [];
  for (const [nodeId, signature] of signatureByNodeId.entries()) {
    if (signature !== majoritySignature) {
      targetNodeIds.push(nodeId);
    }
  }
  if (targetNodeIds.length > ZERO) {
    return targetNodeIds.sort();
  }
  return [...signatureByNodeId.keys()].sort();
}

function resolveMismatchRefreshNodeIds(mismatches, verificationNodeIds) {
  const partitionSetMismatch = resolvePartitionSetMismatchEntry(mismatches);
  if (partitionSetMismatch) {
    return resolvePartitionSetRefreshNodeIds(
      partitionSetMismatch,
      verificationNodeIds,
    );
  }
  const nodeIds = Array.isArray(verificationNodeIds) ? verificationNodeIds : [];
  return nodeIds
    .map((nodeId) => String(nodeId))
    .filter((nodeId) => nodeId.length > ZERO)
    .sort();
}

function resolveFirstMismatchKind(mismatches) {
  const entries = Array.isArray(mismatches) ? mismatches : [];
  if (entries.length === ZERO) {
    return null;
  }
  return String(entries[ZERO]?.kind || '');
}

function replaceSnapshotsByNodeId(baseSnapshots, refreshedSnapshots) {
  const original = Array.isArray(baseSnapshots) ? baseSnapshots : [];
  const replacements = Array.isArray(refreshedSnapshots) ?
    refreshedSnapshots :
    [];
  const replacementByNodeId = new Map();
  for (const snapshot of replacements) {
    const nodeId = String(snapshot?.nodeId || '');
    if (!nodeId) {
      continue;
    }
    replacementByNodeId.set(nodeId, snapshot);
  }
  const mergedSnapshots = original.map((snapshot) => {
    const nodeId = String(snapshot?.nodeId || '');
    if (!nodeId || !replacementByNodeId.has(nodeId)) {
      return snapshot;
    }
    const replacement = replacementByNodeId.get(nodeId);
    replacementByNodeId.delete(nodeId);
    return replacement;
  });
  for (const replacement of replacementByNodeId.values()) {
    mergedSnapshots.push(replacement);
  }
  return mergedSnapshots;
}

export const POSTGRES_BASELINE_COMPARISON_SEGMENT_5 = {
  ...POSTGRES_BASELINE_COMPARISON_SEGMENT_4,
  buildCdcTelemetrySummary,
  buildCdcTelemetrySchemaResult,
  collectCdcTelemetryByNode,
  buildCdcTelemetryState,
  formatCdcTelemetrySchemaErrors,
  summarizeCandidateSnapshotErrors,
  resolveControlSnapshotCandidates,
  resolveRequiredReachableLoadNodeCount,
  formatReadinessReasonsByNodeId,
  evaluateSutLoadNodeAdmissionCandidates,
  revalidateDegradedPreloadLoadNodes,
  fetchControlSnapshotFromCandidates,
  fetchSnapshotFromCandidates,
  fetchServiceDiscoveryFromCandidates,
  createVerificationSnapshotRefreshResult,
  buildSnapshotWarning,
  collectControlSnapshotsFromNodes,
  resolvePartitionSetMismatchEntry,
  normalizePartitionSetSignature,
  resolvePartitionSetRefreshNodeIds,
  resolveMismatchRefreshNodeIds,
  resolveFirstMismatchKind,
  replaceSnapshotsByNodeId,
};
