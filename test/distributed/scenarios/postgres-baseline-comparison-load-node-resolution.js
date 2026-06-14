import {POSTGRES_BASELINE_COMPARISON_CDC_TELEMETRY_AND_SNAPSHOTS_BUNDLE} from './postgres-baseline-comparison-cdc-telemetry-and-snapshots.js';
const {
  BENCHMARK_DEFAULTS,
  DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID,
  DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID,
  DISCOVERY_ERROR_CHAIN_SEPARATOR,
  DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES,
  DISCOVERY_SOURCE_SCOPE_UNSCOPED,
  DISCOVERY_SOURCE_STATUS_DISCOVERED,
  DISCOVERY_SOURCE_STATUS_EMPTY,
  DISCOVERY_SOURCE_STATUS_ERROR,
  DISCOVERY_STALLED_ATTEMPT_THRESHOLD,
  DISCOVERY_UNKNOWN_NODE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  ZERO,
  buildSutLoadDiscoveryContextSequence,
  buildSutLoadDiscoveryDiagnostics,
  buildSutTableProbeSql,
  evaluateSutLoadNodeAdmissionCandidates,
  isLoadNodeCandidate,
  mergeDiscoveryExcludedReadinessByNodeId,
  normalizeTableName,
  normalizeTableId,
  resolveRequiredReachableLoadNodeCount,
  resolveScenarioTiming,
  resolveSutLoadNodeSelectionFromDiscovery,
  summarizeDiscoverySourceError,
} = POSTGRES_BASELINE_COMPARISON_CDC_TELEMETRY_AND_SNAPSHOTS_BUNDLE;

async function resolveSutLoadNodes(nodeClient, nodes, seedNode, options = {}) {
  const timing = resolveScenarioTiming(options.timing);
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => isLoadNodeCandidate(node)) :
    [];
  if (candidates.length === ZERO || !isLoadNodeCandidate(seedNode)) {
    return {
      nodes: [],
      diagnostics: buildSutLoadDiscoveryDiagnostics({
        attempts: ZERO,
      }),
    };
  }
  const requiredReachableNodeCount = resolveRequiredReachableLoadNodeCount(
    options,
    candidates.length,
  );
  const strictMinReachable = options.strictMinReachable === true;
  const deferLocalReplicaReadiness =
    options.deferLocalReplicaReadiness === true;
  const allowSoftDiscoveryNodeFallback =
    options.allowSoftDiscoveryNodeFallback === true;

  const candidateById = new Map();
  for (const node of candidates) {
    if (typeof node?.id === 'string' && node.id.length > ZERO) {
      candidateById.set(node.id, node);
    }
  }

  const discoverySources = [seedNode];
  for (const node of candidates) {
    if (node.id !== seedNode.id) {
      discoverySources.push(node);
    }
  }

  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > ZERO ?
      options.timeoutMs :
      BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs =
    Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs > ZERO ?
      options.pollIntervalMs :
      BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const discoveryTableName = normalizeTableName(options.tableName, '');
  const discoveryTableId = normalizeTableId(options.tableId, '');
  const loadLaneTableProbeSql =
    discoveryTableName.length > ZERO ?
      buildSutTableProbeSql(discoveryTableName) :
      '';
  const discoveryContext =
    discoveryTableName.length > ZERO ?
      {
        ...NODE_CLIENT_TRANSIENT_CONTEXT,
        [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: discoveryTableName,
        ...(discoveryTableId.length > ZERO ?
          {
            [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID]: discoveryTableId,
          } :
          {}),
      } :
      NODE_CLIENT_TRANSIENT_CONTEXT;
  const discoveryContextSequence = buildSutLoadDiscoveryContextSequence(
    discoveryContext,
    discoveryTableName,
    discoveryTableId,
  );
  const startedAt = timing.now();
  const deadline = startedAt + timeoutMs;
  let attempts = ZERO;
  let lastSourceResults = [];
  let lastDiscoveredNodeIds = [];
  let lastCandidateNodeIds = [];
  let lastReachableNodeIds = [];
  let lastProbeReadinessByNodeId = {};
  let lastNodeAdmissionTraceByNodeId = {};
  let bestReachableCandidates = [];
  let bestSourceResults = [];
  let bestDiscoveredNodeIds = [];
  let bestCandidateNodeIds = [];
  let bestReachableNodeIds = [];
  let bestProbeReadinessByNodeId = {};
  let bestNodeAdmissionTraceByNodeId = {};
  let bestAdminFallbackCandidates = [];
  let bestAdminFallbackSourceResults = [];
  let bestAdminFallbackDiscoveredNodeIds = [];
  let bestAdminFallbackCandidateNodeIds = [];
  let bestAdminFallbackProbeReadinessByNodeId = {};
  let bestAdminFallbackNodeAdmissionTraceByNodeId = {};
  let attemptsSinceBestReachableImprovement = ZERO;
  let attemptsSinceBestAdminFallbackImprovement = ZERO;

  function buildDiscoveryDiagnostics(options = {}) {
    return buildSutLoadDiscoveryDiagnostics({
      ...options,
      strictMinReachable,
      requiredReachableNodeCount,
    });
  }

  function selectNonStrictFallbackNodes(candidates) {
    const list = Array.isArray(candidates) ?
      candidates.filter((node) => Boolean(node)) :
      [];
    if (list.length === ZERO) {
      return [];
    }
    const targetCount = Math.max(
      ONE,
      Math.min(list.length, requiredReachableNodeCount),
    );
    return list.slice(ZERO, targetCount);
  }

  while (true) {
    attempts += ONE;
    const discoveredNodeIds = [];
    const discoveredNodeIdSet = new Set();
    const sourceResults = [];
    for (const sourceNode of discoverySources) {
      const sourceNodeId =
        typeof sourceNode?.id === 'string' && sourceNode.id.length > ZERO ?
          sourceNode.id :
          DISCOVERY_UNKNOWN_NODE_ID;
      let sourceDiscoverySelection = null;
      let sourceScope = null;
      let sourceExcludedReadinessByNodeId = {};
      const sourceErrors = [];
      let attemptedScope = null;
      for (const contextEntry of discoveryContextSequence) {
        const contextScope =
          typeof contextEntry?.scope === 'string' &&
          contextEntry.scope.length > ZERO ?
            contextEntry.scope :
            DISCOVERY_SOURCE_SCOPE_UNSCOPED;
        attemptedScope = contextScope;
        const context =
          contextEntry?.context && typeof contextEntry.context === 'object' ?
            contextEntry.context :
            NODE_CLIENT_TRANSIENT_CONTEXT;
        try {
          const snapshot = await nodeClient.fetchServiceDiscovery(
            sourceNode,
            context,
          );
          const discoverySelection = resolveSutLoadNodeSelectionFromDiscovery(
            snapshot,
            {
              admissionRuntimeOwnership: options.admissionRuntimeOwnership,
              allowTopologyDeferredSelection: true,
            },
          );
          sourceExcludedReadinessByNodeId =
            mergeDiscoveryExcludedReadinessByNodeId(
              sourceExcludedReadinessByNodeId,
              discoverySelection.excludedReadinessByNodeId,
            );
          if (discoverySelection.nodeIds.length > ZERO) {
            sourceDiscoverySelection = discoverySelection;
            sourceScope = contextScope;
            break;
          }
        } catch (error) {
          sourceErrors.push(
            contextScope + '=' + summarizeDiscoverySourceError(error),
          );
        }
      }
      if (sourceDiscoverySelection) {
        const snapshotNodeIds = sourceDiscoverySelection.nodeIds;
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_DISCOVERED,
          scope: sourceScope,
          discoveredNodeIds: snapshotNodeIds,
          selection: sourceDiscoverySelection.selection,
          serviceId: sourceDiscoverySelection.serviceId,
          protocol: sourceDiscoverySelection.protocol,
          excludedReadinessByNodeId: sourceExcludedReadinessByNodeId,
        });
        for (const discoveredNodeId of snapshotNodeIds) {
          if (discoveredNodeIdSet.has(discoveredNodeId)) {
            continue;
          }
          discoveredNodeIdSet.add(discoveredNodeId);
          discoveredNodeIds.push(discoveredNodeId);
        }
        continue;
      }
      if (sourceErrors.length > ZERO) {
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_ERROR,
          scope: attemptedScope,
          discoveredNodeIds: [],
          error: sourceErrors.join(DISCOVERY_ERROR_CHAIN_SEPARATOR),
        });
        continue;
      }
      sourceResults.push({
        nodeId: sourceNodeId,
        status: DISCOVERY_SOURCE_STATUS_EMPTY,
        scope: attemptedScope,
        discoveredNodeIds: [],
        excludedReadinessByNodeId: sourceExcludedReadinessByNodeId,
      });
    }
    lastSourceResults = sourceResults;
    lastDiscoveredNodeIds = discoveredNodeIds;
    if (discoveredNodeIds.length > ZERO) {
      const discoveredNodeIdSet = new Set(discoveredNodeIds);
      const discoveredCandidates = [...candidateById.values()].filter((node) =>
        discoveredNodeIdSet.has(node.id),
      );
      lastCandidateNodeIds = discoveredCandidates.map((node) => node.id);
      if (discoveredCandidates.length > ZERO) {
        const admissionEvaluation =
          await evaluateSutLoadNodeAdmissionCandidates(
            nodeClient,
            discoveredCandidates,
            {
              contextSequence: discoveryContextSequence,
              loadLaneTableProbeSql,
              deferLocalReplicaReadiness,
              allowSoftDiscoveryNodeFallback,
              admissionRuntimeOwnership: options.admissionRuntimeOwnership,
            },
          );
        const reachableCandidates = admissionEvaluation.reachableCandidates;
        const adminFallbackCandidates =
          admissionEvaluation.adminFallbackCandidates;
        const verifiedLoadLaneFallbackCandidates =
          admissionEvaluation.verifiedLoadLaneFallbackCandidates;
        const probeReadinessByNodeId =
          admissionEvaluation.probeReadinessByNodeId;
        const nodeAdmissionTraceByNodeId =
          admissionEvaluation.nodeAdmissionTraceByNodeId;
        lastProbeReadinessByNodeId = probeReadinessByNodeId;
        lastNodeAdmissionTraceByNodeId = nodeAdmissionTraceByNodeId;
        lastReachableNodeIds = reachableCandidates.map((node) => node.id);
        if (reachableCandidates.length > bestReachableCandidates.length) {
          bestReachableCandidates = [...reachableCandidates];
          bestSourceResults = sourceResults;
          bestDiscoveredNodeIds = [...discoveredNodeIds];
          bestCandidateNodeIds = [...lastCandidateNodeIds];
          bestReachableNodeIds = [...lastReachableNodeIds];
          bestProbeReadinessByNodeId = {
            ...probeReadinessByNodeId,
          };
          bestNodeAdmissionTraceByNodeId = globalThis.structuredClone(
            nodeAdmissionTraceByNodeId,
          );
          attemptsSinceBestReachableImprovement = ZERO;
        } else if (
          bestReachableCandidates.length > ZERO &&
          bestReachableCandidates.length < requiredReachableNodeCount
        ) {
          attemptsSinceBestReachableImprovement += ONE;
        }
        const prioritizedFallbackCandidates =
          allowSoftDiscoveryNodeFallback === true &&
          verifiedLoadLaneFallbackCandidates.length > ZERO ?
            verifiedLoadLaneFallbackCandidates :
            adminFallbackCandidates;
        if (
          prioritizedFallbackCandidates.length >
          bestAdminFallbackCandidates.length
        ) {
          bestAdminFallbackCandidates = [...prioritizedFallbackCandidates];
          bestAdminFallbackSourceResults = sourceResults;
          bestAdminFallbackDiscoveredNodeIds = [...discoveredNodeIds];
          bestAdminFallbackCandidateNodeIds = [...lastCandidateNodeIds];
          bestAdminFallbackProbeReadinessByNodeId = {
            ...probeReadinessByNodeId,
          };
          bestAdminFallbackNodeAdmissionTraceByNodeId =
            globalThis.structuredClone(nodeAdmissionTraceByNodeId);
          attemptsSinceBestAdminFallbackImprovement = ZERO;
        } else if (
          bestAdminFallbackCandidates.length > ZERO &&
          bestReachableCandidates.length === ZERO
        ) {
          attemptsSinceBestAdminFallbackImprovement += ONE;
        }
        if (reachableCandidates.length >= requiredReachableNodeCount) {
          return {
            nodes: reachableCandidates,
            diagnostics: buildDiscoveryDiagnostics({
              attempts,
              timedOut: false,
              discoveredNodeIds,
              candidateNodeIds: lastCandidateNodeIds,
              reachableNodeIds: lastReachableNodeIds,
              sourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                lastProbeReadinessByNodeId,
              [DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID]:
                lastNodeAdmissionTraceByNodeId,
              elapsedMs: timing.now() - startedAt,
            }),
          };
        }
        if (
          allowSoftDiscoveryNodeFallback &&
          !strictMinReachable &&
          bestReachableCandidates.length === ZERO &&
          bestAdminFallbackCandidates.length > ZERO &&
          attemptsSinceBestAdminFallbackImprovement >=
            DISCOVERY_STALLED_ATTEMPT_THRESHOLD
        ) {
          const admittedFallbackNodes = selectNonStrictFallbackNodes(
            bestAdminFallbackCandidates,
          );
          const admittedFallbackNodeIds = admittedFallbackNodes.map(
            (node) => node.id,
          );
          return {
            nodes: admittedFallbackNodes,
            diagnostics: buildDiscoveryDiagnostics({
              attempts,
              timedOut: true,
              gateReason: null,
              discoveredNodeIds: bestAdminFallbackDiscoveredNodeIds,
              candidateNodeIds: bestAdminFallbackCandidateNodeIds,
              reachableNodeIds: admittedFallbackNodeIds,
              sourceResults: bestAdminFallbackSourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                bestAdminFallbackProbeReadinessByNodeId,
              [DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID]:
                bestAdminFallbackNodeAdmissionTraceByNodeId,
              elapsedMs: timing.now() - startedAt,
            }),
          };
        }
        if (
          !strictMinReachable &&
          bestReachableCandidates.length > ZERO &&
          bestReachableCandidates.length < requiredReachableNodeCount &&
          attemptsSinceBestReachableImprovement >=
            DISCOVERY_STALLED_ATTEMPT_THRESHOLD
        ) {
          const gateReason = strictMinReachable ?
            DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
            null;
          return {
            nodes: strictMinReachable ? [] : bestReachableCandidates,
            diagnostics: buildDiscoveryDiagnostics({
              attempts,
              timedOut: true,
              gateReason,
              discoveredNodeIds: bestDiscoveredNodeIds,
              candidateNodeIds: bestCandidateNodeIds,
              reachableNodeIds: bestReachableNodeIds,
              sourceResults: bestSourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                bestProbeReadinessByNodeId,
              [DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID]:
                bestNodeAdmissionTraceByNodeId,
              elapsedMs: timing.now() - startedAt,
            }),
          };
        }
      }
    }
    if (timing.now() >= deadline) {
      const timedOutFallbackNodes = allowSoftDiscoveryNodeFallback ?
        selectNonStrictFallbackNodes(bestAdminFallbackCandidates) :
        [];
      const timedOutFallbackNodeIds = timedOutFallbackNodes.map(
        (node) => node.id,
      );
      const timedOutNodes =
        bestReachableCandidates.length > ZERO ?
          bestReachableCandidates :
          timedOutFallbackNodes.length > ZERO ?
            timedOutFallbackNodes :
            [];
      const timedOutSourceResults =
        bestReachableCandidates.length > ZERO ?
          bestSourceResults :
          timedOutFallbackNodes.length > ZERO ?
            bestAdminFallbackSourceResults :
            lastSourceResults;
      const timedOutDiscoveredNodeIds =
        bestReachableCandidates.length > ZERO ?
          bestDiscoveredNodeIds :
          timedOutFallbackNodes.length > ZERO ?
            bestAdminFallbackDiscoveredNodeIds :
            lastDiscoveredNodeIds;
      const timedOutCandidateNodeIds =
        bestReachableCandidates.length > ZERO ?
          bestCandidateNodeIds :
          timedOutFallbackNodes.length > ZERO ?
            bestAdminFallbackCandidateNodeIds :
            lastCandidateNodeIds;
      const timedOutReachableNodeIds =
        bestReachableCandidates.length > ZERO ?
          bestReachableNodeIds :
          timedOutFallbackNodeIds.length > ZERO ?
            timedOutFallbackNodeIds :
            lastReachableNodeIds;
      const timedOutProbeReadinessByNodeId =
        bestReachableCandidates.length > ZERO ?
          bestProbeReadinessByNodeId :
          timedOutFallbackNodes.length > ZERO ?
            bestAdminFallbackProbeReadinessByNodeId :
            lastProbeReadinessByNodeId;
      const timedOutNodeAdmissionTraceByNodeId =
        bestReachableCandidates.length > ZERO ?
          bestNodeAdmissionTraceByNodeId :
          timedOutFallbackNodes.length > ZERO ?
            bestAdminFallbackNodeAdmissionTraceByNodeId :
            lastNodeAdmissionTraceByNodeId;
      const gateReason =
        strictMinReachable &&
        timedOutReachableNodeIds.length < requiredReachableNodeCount ?
          DISCOVERY_GATE_REASON_INSUFFICIENT_REACHABLE_NODES :
          null;
      return {
        nodes: strictMinReachable ? [] : timedOutNodes,
        diagnostics: buildDiscoveryDiagnostics({
          attempts,
          timedOut: true,
          gateReason,
          discoveredNodeIds: timedOutDiscoveredNodeIds,
          candidateNodeIds: timedOutCandidateNodeIds,
          reachableNodeIds: timedOutReachableNodeIds,
          sourceResults: timedOutSourceResults,
          [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
            timedOutProbeReadinessByNodeId,
          [DISCOVERY_DIAGNOSTICS_FIELD_NODE_ADMISSION_TRACE_BY_NODE_ID]:
            timedOutNodeAdmissionTraceByNodeId,
          elapsedMs: timing.now() - startedAt,
        }),
      };
    }
    await timing.sleep(pollIntervalMs);
  }
}

function buildReplicaOperationProgressSignature(
  operationTimelineByOperationId = {},
) {
  if (
    !operationTimelineByOperationId ||
    typeof operationTimelineByOperationId !== 'object'
  ) {
    return null;
  }

  const signatures = [];
  for (const operationId of Object.keys(
    operationTimelineByOperationId,
  ).sort()) {
    const timeline = Array.isArray(operationTimelineByOperationId[operationId]) ?
      operationTimelineByOperationId[operationId] :
      [];
    if (timeline.length === ZERO) {
      signatures.push(String(operationId) + '=none');
      continue;
    }
    const entrySignatures = timeline.map((entry) => {
      const timestampMs = Number.isFinite(entry?.timestampMs) ?
        Math.floor(entry.timestampMs) :
        null;
      return [
        String(entry?.eventType || ''),
        String(entry?.step || ''),
        String(entry?.status || ''),
        timestampMs === null ? '' : String(timestampMs),
        entry?.inFlight === true ? '1' : '0',
      ].join(':');
    });
    signatures.push(String(operationId) + '=' + entrySignatures.join(','));
  }

  if (signatures.length === ZERO) {
    return null;
  }
  return signatures.join('|');
}

function summarizeInFlightReplicaOperationTimeline(
  operationTimelineByOperationId = {},
) {
  const summary = {
    inFlightOperationCount: ZERO,
    hasStaleInFlightOperation: false,
    nearestInFlightTimeoutRemainingMs: null,
  };
  if (
    !operationTimelineByOperationId ||
    typeof operationTimelineByOperationId !== 'object'
  ) {
    return summary;
  }

  for (const timeline of Object.values(operationTimelineByOperationId)) {
    if (!Array.isArray(timeline) || timeline.length === ZERO) {
      continue;
    }

    let latestInFlightEntry = null;
    for (let index = timeline.length - ONE; index >= ZERO; index--) {
      const candidate = timeline[index];
      if (candidate?.inFlight === true) {
        latestInFlightEntry = candidate;
        break;
      }
    }
    if (!latestInFlightEntry) {
      continue;
    }

    summary.inFlightOperationCount += ONE;
    if (latestInFlightEntry.staleTimeout === true) {
      summary.hasStaleInFlightOperation = true;
    }

    const timeoutMs = Number(latestInFlightEntry.timeoutMs);
    const ageMs = Number(latestInFlightEntry.ageMs);
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= ZERO ||
      !Number.isFinite(ageMs) ||
      ageMs < ZERO
    ) {
      continue;
    }

    const normalizedTimeoutMs = Math.floor(timeoutMs);
    const normalizedAgeMs = Math.floor(ageMs);
    if (normalizedAgeMs >= normalizedTimeoutMs) {
      summary.hasStaleInFlightOperation = true;
    }
    const timeoutRemainingMs = Math.max(
      ZERO,
      normalizedTimeoutMs - normalizedAgeMs,
    );
    summary.nearestInFlightTimeoutRemainingMs =
      summary.nearestInFlightTimeoutRemainingMs === null ?
        timeoutRemainingMs :
        Math.min(
          summary.nearestInFlightTimeoutRemainingMs,
          timeoutRemainingMs,
        );
  }

  return summary;
}

export const POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_CDC_TELEMETRY_AND_SNAPSHOTS_BUNDLE,
  resolveSutLoadNodes,
  buildReplicaOperationProgressSignature,
  summarizeInFlightReplicaOperationTimeline,
};
