import {POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE} from './postgres-baseline-comparison-load-node-resolution.js';
const {
  assert,
  osArch,
  osCpus,
  osHostname,
  osPlatform,
  dirname,
  BENCHMARK_DEFAULTS,
  BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
  BENCHMARK_METADATA_STAGE_READINESS_POLL,
  BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
  BOOTSTRAP_DB_NAME,
  DEFAULT_REPLICATION_PORT,
  DISCOVERY_UNKNOWN_NODE_ID,
  DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  GATE_RESULT_MODE,
  GateEngine,
  LOCALHOST,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  POSTGRES_BINARY_PATH_EXPORT,
  POSTGRES_ENTRYPOINT_COMMAND,
  PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW,
  PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  PSQL_ON_ERROR_STOP,
  PSQL_TUPLES_ONLY,
  QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  QUIESCENCE_IN_FLIGHT_COUNT_PREFIX,
  QUIESCENCE_IN_FLIGHT_ERROR_PREFIX,
  QUIESCENCE_NODE_ERROR_PREFIX,
  QUIESCENCE_NODE_ERROR_SEPARATOR,
  QUIESCENCE_READY_NODE_COUNT_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX,
  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
  QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX,
  QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX,
  QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX,
  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX,
  QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX,
  QUIESCENCE_STALL_PREFIX,
  READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
  READINESS_TIMELINE_EVENT_REASON_TRANSITION,
  REPLICATION_HBA_IPV4,
  REPLICATION_HBA_IPV6,
  REPLICATION_STATE_STREAMING,
  SYNCHRONOUS_COMMIT_ON,
  SYNC_STANDBY_TEMPLATE_PREFIX,
  SYNC_STANDBY_TEMPLATE_SUFFIX,
  ZERO,
  buildReplicaOperationProgressSignature,
  buildSutTableProbeSql,
  buildCanonicalReadinessFromDiscoveryError,
  cloneDiscoveryReadinessState,
  collectBenchmarkMetadataSnapshot,
  execShell,
  fetchControlSnapshotFromCandidates,
  isRetriableTableReadyError,
  normalizeRequiredSchemaVersion,
  resolveControlSnapshotCandidates,
  resolveNodeReadinessFromServiceDiscovery,
  resolvePostgresBaselineBenchmarkConfig,
  resolveScenarioTiming,
  shellQuote,
  sleep,
  summarizeInFlightReplicaOperationTimeline,
} = POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE;

async function waitForSutLoadQuiescence({
  nodeClient,
  loadNodes,
  seedNode,
  snapshotNodes,
  tableName,
  timeoutMs,
  pollIntervalMs,
  stableWindowMs,
  noProgressTimeoutMs,
  maxReplicaOpsInFlight,
  strictCanonicalReadiness,
  requiredSchemaVersion,
  requiredSchemaTableId,
  onConvergenceEvent,
  onBenchmarkMetadataSnapshot,
  runtimeAdmissionOwnership,
  timing: configuredTiming,
}) {
  const timing = resolveScenarioTiming(configuredTiming);
  const tableProbeSql = buildSutTableProbeSql(tableName);
  const requireCanonicalReadiness = strictCanonicalReadiness === true;
  const effectiveStableWindowMs = Math.max(
    ZERO,
    Number.isFinite(stableWindowMs) ?
      Math.floor(stableWindowMs) :
      QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  );
  const effectiveNoProgressTimeoutMs =
    Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO ?
      noProgressTimeoutMs :
      null;
  const effectiveMaxReplicaOpsInFlight =
    Number.isInteger(maxReplicaOpsInFlight) && maxReplicaOpsInFlight >= ZERO ?
      maxReplicaOpsInFlight :
      BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT;
  let lastLeaderSignature = null;
  let lastLeaderChangeAtMs = timing.now();
  let lastProgressAtMs = timing.now();
  let lowestInFlightCount = Number.POSITIVE_INFINITY;
  let maxLeaderQuietElapsedMs = ZERO;
  let maxIncludedNodeCount = ZERO;
  let lastOperationTimelineSignature = null;
  const gateProgressState = {
    inFlightCount: null,
    leaderQuietElapsedMs: ZERO,
    partitionGroupInFlight: {},
    operationTimelineByOperationId: {},
    operationTimelineSignature: null,
    operationLiveness: {
      inFlightOperationCount: ZERO,
      hasStaleInFlightOperation: false,
      nearestInFlightTimeoutRemainingMs: null,
    },
  };
  const versionedReadinessByNodeId = {};
  const requiredNodeIds = loadNodes.map((node) =>
    String(node?.id || DISCOVERY_UNKNOWN_NODE_ID),
  );
  const readinessTimeline = [];
  const readinessReasonSignatureByNodeId = {};
  const benchmarkMetadataSignatureByNodeId = {};
  let readinessTimelineSequence = ZERO;

  async function maybeCaptureBenchmarkMetadataSnapshot(
    node,
    stage,
    readinessState,
    probeError,
  ) {
    if (typeof onBenchmarkMetadataSnapshot !== 'function') {
      return;
    }
    const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
    const signature = JSON.stringify({
      stage: String(stage || BENCHMARK_METADATA_STAGE_READINESS_POLL),
      ready: readinessState?.ready === true,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion: readinessState?.appliedSchemaVersion || null,
      reasons: Array.isArray(readinessState?.reasons) ?
        [...readinessState.reasons] :
        [],
      discoveryReasons: Array.isArray(readinessState?.discoveryReasons) ?
        [...readinessState.discoveryReasons] :
        [],
      probeError:
        typeof probeError === 'string' && probeError.length > ZERO ?
          probeError :
          null,
    });
    if (benchmarkMetadataSignatureByNodeId[nodeId] === signature) {
      return;
    }
    benchmarkMetadataSignatureByNodeId[nodeId] = signature;
    const snapshot = await collectBenchmarkMetadataSnapshot({
      nodeClient,
      node,
      tableName,
      tableId: requiredSchemaTableId,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion || requiredSchemaVersion,
      stage,
      readinessState: readinessState?.readinessState,
      probeError,
    });
    onBenchmarkMetadataSnapshot(snapshot);
  }

  function recordVersionedReadiness(nodeId, readinessState) {
    versionedReadinessByNodeId[nodeId] = {
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      appliedSchemaVersion: readinessState?.appliedSchemaVersion || null,
      ready: readinessState?.ready === true,
      reasons: Array.isArray(readinessState?.reasons) ?
        [...readinessState.reasons] :
        [],
      discoveryReasons: Array.isArray(readinessState?.discoveryReasons) ?
        [...readinessState.discoveryReasons] :
        [],
      readinessState: cloneDiscoveryReadinessState(
        readinessState?.readinessState,
      ),
    };
  }

  function recordReadinessObservation(nodeId, readinessState) {
    if (!requireCanonicalReadiness) {
      return;
    }
    const reasons = Array.isArray(readinessState?.reasons) ?
      [...readinessState.reasons] :
      [];
    const reasonSignature = reasons.join('|');
    const hasPreviousReasonSignature = Object.prototype.hasOwnProperty.call(
      readinessReasonSignatureByNodeId,
      nodeId,
    );
    const previousReasonSignature = hasPreviousReasonSignature ?
      readinessReasonSignatureByNodeId[nodeId] :
      null;
    const discoveryReasons = Array.isArray(readinessState?.discoveryReasons) ?
      [...readinessState.discoveryReasons] :
      [];
    const readinessStateSnapshot = cloneDiscoveryReadinessState(
      readinessState?.readinessState,
    );

    readinessTimelineSequence += ONE;
    readinessTimeline.push({
      type: READINESS_TIMELINE_EVENT_POLL_SNAPSHOT,
      sequence: readinessTimelineSequence,
      nodeId,
      ready: readinessState?.ready === true,
      reasons,
      requiredSchemaVersion:
        readinessState?.requiredSchemaVersion ||
        normalizeRequiredSchemaVersion(requiredSchemaVersion),
      observedSchemaVersion: readinessState?.appliedSchemaVersion || null,
      discoveryReasons,
      ...(readinessStateSnapshot ?
        {readinessState: readinessStateSnapshot} :
        {}),
      timestampMs: timing.now(),
    });

    if (
      !hasPreviousReasonSignature ||
      previousReasonSignature !== reasonSignature
    ) {
      readinessTimelineSequence += ONE;
      readinessTimeline.push({
        type: READINESS_TIMELINE_EVENT_REASON_TRANSITION,
        sequence: readinessTimelineSequence,
        nodeId,
        from: previousReasonSignature,
        to: reasonSignature,
        timestampMs: timing.now(),
      });
      readinessReasonSignatureByNodeId[nodeId] = reasonSignature;
    }
  }

  function buildVersionConvergenceSnapshot() {
    const requiredVersion = normalizeRequiredSchemaVersion(
      requiredSchemaVersion,
    );
    const nodes = {};
    for (const nodeId of requiredNodeIds) {
      const snapshot = versionedReadinessByNodeId[nodeId];
      nodes[nodeId] = {
        requiredSchemaVersion:
          snapshot?.requiredSchemaVersion || requiredVersion,
        observedSchemaVersion: snapshot?.appliedSchemaVersion || null,
        ready: snapshot?.ready === true,
        unmetReasons: Array.isArray(snapshot?.reasons) ?
          [...snapshot.reasons] :
          [DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN],
        discoveryReasons: Array.isArray(snapshot?.discoveryReasons) ?
          [...snapshot.discoveryReasons] :
          [],
        readinessState: cloneDiscoveryReadinessState(snapshot?.readinessState),
      };
    }
    return {
      requiredSchemaVersion: requiredVersion,
      nodes,
    };
  }

  const gateEngine = new GateEngine({
    now: timing.now,
    sleep: timing.sleep,
  });
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    seedNode,
    snapshotNodes,
  );
  const gateResult = await gateEngine.waitForGate({
    nodes: loadNodes,
    timeoutMs,
    pollIntervalMs,
    stableWindowMs: effectiveStableWindowMs,
    probeNode: async (node) => {
      const nodeId = String(node?.id || DISCOVERY_UNKNOWN_NODE_ID);
      if (requireCanonicalReadiness) {
        try {
          const discoveryContext = {
            ...NODE_CLIENT_TRANSIENT_CONTEXT,
            requireReadiness: true,
            ...(typeof tableName === 'string' && tableName.length > ZERO ?
              {
                [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: tableName,
                ...(typeof requiredSchemaTableId === 'string' &&
                  requiredSchemaTableId.length > ZERO ?
                  {
                    [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID]:
                          requiredSchemaTableId,
                  } :
                  {}),
              } :
              {}),
          };
          const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
            node,
            discoveryContext,
          );
          const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
            discoverySnapshot,
            nodeId,
            {
              enforceCanonicalVersionedReadiness: true,
              adminQueryable: true,
              requiredSchemaVersion,
              admissionRuntimeOwnership: runtimeAdmissionOwnership,
            },
          );
          await maybeCaptureBenchmarkMetadataSnapshot(
            node,
            BENCHMARK_METADATA_STAGE_READINESS_POLL,
            discoveryReadiness,
            null,
          );
          recordVersionedReadiness(nodeId, discoveryReadiness);
          recordReadinessObservation(nodeId, discoveryReadiness);
          if (typeof onConvergenceEvent === 'function') {
            onConvergenceEvent({
              type: 'cdc_received',
              nodeId,
              tableId: requiredSchemaTableId || null,
              tableName,
              requiredSchemaVersion:
                discoveryReadiness.requiredSchemaVersion ||
                requiredSchemaVersion,
              observedSchemaVersion:
                discoveryReadiness.appliedSchemaVersion || null,
              reasons: discoveryReadiness.reasons,
              ready: discoveryReadiness.ready,
            });
            if (discoveryReadiness.appliedSchemaVersion) {
              onConvergenceEvent({
                type: 'cache_applied_version',
                nodeId,
                tableId: requiredSchemaTableId || null,
                tableName,
                requiredSchemaVersion:
                  discoveryReadiness.requiredSchemaVersion ||
                  requiredSchemaVersion,
                observedSchemaVersion: discoveryReadiness.appliedSchemaVersion,
                reasons: discoveryReadiness.reasons,
                ready: discoveryReadiness.ready,
              });
            }
            if (discoveryReadiness.ready) {
              onConvergenceEvent({
                type: 'readiness_predicate_pass',
                nodeId,
                tableId: requiredSchemaTableId || null,
                tableName,
                requiredSchemaVersion:
                  discoveryReadiness.requiredSchemaVersion ||
                  requiredSchemaVersion,
                observedSchemaVersion:
                  discoveryReadiness.appliedSchemaVersion || null,
                reasons: [],
                ready: true,
              });
            }
          }
          if (discoveryReadiness.ready) {
            return {
              ready: true,
              reasons: [],
            };
          }
          const discoveryReasonDetails =
            Array.isArray(discoveryReadiness.discoveryReasons) &&
            discoveryReadiness.discoveryReasons.length > ZERO ?
              QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_PREFIX +
                discoveryReadiness.discoveryReasons.join(
                  QUIESCENCE_REASON_DISCOVERY_REASON_DETAIL_SEPARATOR,
                ) :
              null;
          const discoveryReasonText =
            discoveryReadiness.reasons.length > ZERO ?
              discoveryReadiness.reasons.join('|') :
              DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN;
          return {
            ready: false,
            reasons: [
              QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                nodeId +
                '=' +
                QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                discoveryReasonText +
                (discoveryReasonDetails ? '|' + discoveryReasonDetails : ''),
            ],
          };
        } catch (error) {
          const canonicalReadiness = buildCanonicalReadinessFromDiscoveryError({
            error,
            requiredSchemaVersion,
          });
          await maybeCaptureBenchmarkMetadataSnapshot(
            node,
            BENCHMARK_METADATA_STAGE_DISCOVERY_ERROR,
            canonicalReadiness,
            String(error?.message || error),
          );
          recordVersionedReadiness(nodeId, canonicalReadiness);
          recordReadinessObservation(nodeId, canonicalReadiness);
          const canonicalReasonText =
            canonicalReadiness.reasons.length > ZERO ?
              canonicalReadiness.reasons.join('|') :
              DISCOVERY_READINESS_REASON_ADMIN_NOT_QUERYABLE;
          return {
            ready: false,
            reasons: [
              QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                nodeId +
                '=' +
                QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                canonicalReasonText +
                '|probe_error=' +
                String(error?.message || error),
            ],
          };
        }
      }

      try {
        await nodeClient.queryControl(
          node,
          tableProbeSql,
          [],
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        return {
          ready: true,
          reasons: [],
        };
      } catch (error) {
        const probeErrorMessage = String(error?.message || error);
        if (isRetriableTableReadyError(error)) {
          try {
            const discoverySnapshot = await nodeClient.fetchServiceDiscovery(
              node,
              {
                ...NODE_CLIENT_TRANSIENT_CONTEXT,
                tableName,
                ...(typeof requiredSchemaTableId === 'string' &&
                requiredSchemaTableId.length > ZERO ?
                  {
                    tableId: requiredSchemaTableId,
                  } :
                  {}),
                requireReadiness: true,
              },
            );
            const discoveryReadiness = resolveNodeReadinessFromServiceDiscovery(
              discoverySnapshot,
              nodeId,
              {
                admissionRuntimeOwnership: runtimeAdmissionOwnership,
              },
            );
            if (discoveryReadiness.ready) {
              // Discovery readiness is diagnostic-only here. A node is considered
              // ready for load only after the table probe itself succeeds.
              return {
                ready: false,
                reasons: [
                  QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                    nodeId +
                    '=' +
                    probeErrorMessage,
                ],
              };
            }
            return {
              ready: false,
              reasons: [
                QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
                  nodeId +
                  '=' +
                  QUIESCENCE_REASON_DISCOVERY_NOT_READY_PREFIX +
                  discoveryReadiness.reasons.join('|') +
                  '|probe_error=' +
                  probeErrorMessage,
              ],
            };
          } catch (_discoveryError) {
            // Fall through to the original probe error path.
          }
        }
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
              nodeId +
              '=' +
              probeErrorMessage,
          ],
        };
      }
    },
    evaluateGlobalCondition: async () => {
      try {
        const controlSnapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        const replicaOperations = controlSnapshot?.replicaOperations || {};
        const inFlightCount = Number.isInteger(replicaOperations.inFlightCount) ?
          replicaOperations.inFlightCount :
          ZERO;
        const partitionGroupInFlight =
          replicaOperations.partitionGroupInFlight &&
          typeof replicaOperations.partitionGroupInFlight === 'object' ?
            Object.fromEntries(
              Object.entries(replicaOperations.partitionGroupInFlight)
                .filter(
                  (entry) => Number.isInteger(entry[1]) && entry[1] >= ZERO,
                )
                .map(([partitionGroupId, count]) => [
                  String(partitionGroupId),
                  Number(count),
                ]),
            ) :
            {};
        const operationTimelineByOperationId =
          replicaOperations.operationTimelineById &&
          typeof replicaOperations.operationTimelineById === 'object' ?
            replicaOperations.operationTimelineById :
            {};
        const operationTimelineSignature =
          buildReplicaOperationProgressSignature(
            operationTimelineByOperationId,
          );
        const operationLiveness = summarizeInFlightReplicaOperationTimeline(
          operationTimelineByOperationId,
        );
        const leaders =
          controlSnapshot?.leaders &&
          typeof controlSnapshot.leaders === 'object' ?
            controlSnapshot.leaders :
            {};
        const leaderEntries = Object.entries(leaders).sort((left, right) =>
          left[0].localeCompare(right[0]),
        );
        const leaderSignature = JSON.stringify(leaderEntries);
        if (
          lastLeaderSignature !== null &&
          lastLeaderSignature !== leaderSignature
        ) {
          lastLeaderChangeAtMs = timing.now();
        }
        if (lastLeaderSignature === null) {
          lastLeaderChangeAtMs = timing.now();
        }
        lastLeaderSignature = leaderSignature;

        const leaderCoverageReady = leaderEntries.length > ZERO;
        const leaderQuietElapsedMs = timing.now() - lastLeaderChangeAtMs;
        const leadershipStable =
          leaderCoverageReady &&
          leaderQuietElapsedMs >= effectiveStableWindowMs;

        const reasons = [];
        if (inFlightCount > effectiveMaxReplicaOpsInFlight) {
          reasons.push(
            QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX +
              String(inFlightCount),
          );
        }
        if (!leadershipStable) {
          reasons.push(
            QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX +
              String(leaderQuietElapsedMs),
          );
        }

        gateProgressState.inFlightCount = inFlightCount;
        gateProgressState.leaderQuietElapsedMs = leaderQuietElapsedMs;
        gateProgressState.partitionGroupInFlight = partitionGroupInFlight;
        gateProgressState.operationTimelineByOperationId =
          operationTimelineByOperationId;
        gateProgressState.operationTimelineSignature =
          operationTimelineSignature;
        gateProgressState.operationLiveness = operationLiveness;

        return {
          ready: reasons.length === ZERO,
          reasons,
        };
      } catch (error) {
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX +
              String(error?.message || error),
          ],
        };
      }
    },
    abortIf: ({nowMs, includedNodeIds}) => {
      if (effectiveNoProgressTimeoutMs === null) {
        return null;
      }

      let progressObserved = false;
      const inFlightCount = gateProgressState.inFlightCount;
      if (
        Number.isInteger(inFlightCount) &&
        inFlightCount < lowestInFlightCount
      ) {
        lowestInFlightCount = inFlightCount;
        progressObserved = true;
      }

      const leaderQuietElapsedMs = Number.isFinite(
        gateProgressState.leaderQuietElapsedMs,
      ) ?
        gateProgressState.leaderQuietElapsedMs :
        ZERO;
      if (
        inFlightCount === ZERO &&
        leaderQuietElapsedMs > maxLeaderQuietElapsedMs
      ) {
        maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
        progressObserved = true;
      }

      const includedCount = Array.isArray(includedNodeIds) ?
        includedNodeIds.length :
        ZERO;
      if (includedCount > maxIncludedNodeCount) {
        maxIncludedNodeCount = includedCount;
        progressObserved = true;
      }

      const operationTimelineSignature =
        typeof gateProgressState.operationTimelineSignature === 'string' ?
          gateProgressState.operationTimelineSignature :
          null;
      if (
        operationTimelineSignature !== null &&
        operationTimelineSignature !== lastOperationTimelineSignature
      ) {
        lastOperationTimelineSignature = operationTimelineSignature;
        progressObserved = true;
      }

      if (progressObserved) {
        lastProgressAtMs = nowMs;
        return null;
      }

      const stalledMs = nowMs - lastProgressAtMs;
      const operationLiveness =
        gateProgressState.operationLiveness &&
        typeof gateProgressState.operationLiveness === 'object' ?
          gateProgressState.operationLiveness :
          null;
      const suppressStallAbortForFreshInFlight =
        Number.isInteger(inFlightCount) &&
        inFlightCount > ZERO &&
        Number.isInteger(operationLiveness?.inFlightOperationCount) &&
        operationLiveness.inFlightOperationCount > ZERO &&
        Number.isInteger(
          operationLiveness?.nearestInFlightTimeoutRemainingMs,
        ) &&
        operationLiveness.hasStaleInFlightOperation !== true;
      if (stalledMs >= effectiveNoProgressTimeoutMs) {
        if (suppressStallAbortForFreshInFlight) {
          return null;
        }
        return {
          abort: true,
          reason:
            QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX + String(stalledMs),
        };
      }
      return null;
    },
  });

  const includedNodeIds = new Set(gateResult.includedNodeIds || []);
  const readyLoadNodes = loadNodes.filter((node) =>
    includedNodeIds.has(node.id),
  );
  const excludedLoadNodeIds = loadNodes
    .map((node) => node.id)
    .filter((nodeId) => !includedNodeIds.has(nodeId));

  if (gateResult.mode === GATE_RESULT_MODE.ALL_READY) {
    const versionConvergence = requireCanonicalReadiness ?
      buildVersionConvergenceSnapshot() :
      null;
    return {
      mode: gateResult.mode,
      attempts: gateResult.attempts,
      stableElapsedMs: gateResult.stableElapsedMs,
      inFlightCount: ZERO,
      readyLoadNodes,
      excludedLoadNodeIds,
      partitionGroupInFlight: {
        ...gateProgressState.partitionGroupInFlight,
      },
      replicaOperationTimelineByOperationId: {
        ...gateProgressState.operationTimelineByOperationId,
      },
      reasonHistogram: gateResult.reasonHistogram || {},
      includedNodeIds: gateResult.includedNodeIds || [],
      ...(requireCanonicalReadiness ?
        {readinessTimeline: [...readinessTimeline]} :
        {}),
      ...(versionConvergence ? {versionConvergence} : {}),
    };
  }

  const reasonKeys = Object.keys(gateResult.reasonHistogram || {});
  const nodeProbeReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX),
  );
  const inFlightQueryReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX),
  );
  const inFlightCountReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX),
  );
  const leadershipReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX),
  );
  const stallReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX),
  );

  const details = [];
  if (nodeProbeReasons.length > ZERO) {
    details.push(
      QUIESCENCE_NODE_ERROR_PREFIX +
        nodeProbeReasons.join(QUIESCENCE_NODE_ERROR_SEPARATOR),
    );
  }
  if (inFlightQueryReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_ERROR_PREFIX + inFlightQueryReasons.join(','),
    );
  }
  if (inFlightCountReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_COUNT_PREFIX + inFlightCountReasons.join(','),
    );
  }
  if (leadershipReasons.length > ZERO) {
    details.push('leadershipStability=' + leadershipReasons.join(','));
  }
  if (stallReasons.length > ZERO) {
    details.push(QUIESCENCE_STALL_PREFIX + stallReasons.join(','));
  }
  if (readyLoadNodes.length > ZERO) {
    details.push(
      QUIESCENCE_READY_NODE_COUNT_PREFIX + String(readyLoadNodes.length),
    );
  }

  const errorPrefix =
    gateResult.aborted === true ?
      'SUT load nodes did not reach quiescent state; gate aborted due to ' +
        'stalled progress' :
      'SUT load nodes did not reach quiescent state within ' +
        timeoutMs +
        'ms';
  const error = new Error(
    errorPrefix +
      (details.length > ZERO ? ' (' + details.join(', ') + ')' : ''),
  );
  error.gateResult = {
    ...gateResult,
    partitionGroupInFlight: {
      ...gateProgressState.partitionGroupInFlight,
    },
    replicaOperationTimelineByOperationId: {
      ...gateProgressState.operationTimelineByOperationId,
    },
    includedNodeIds: gateResult.includedNodeIds || [],
    excludedNodeIds: gateResult.excludedNodeIds || [],
    reasonHistogram: gateResult.reasonHistogram || {},
    ...(requireCanonicalReadiness ?
      {readinessTimeline: [...readinessTimeline]} :
      {}),
    ...(requireCanonicalReadiness ?
      {versionConvergence: buildVersionConvergenceSnapshot()} :
      {}),
  };
  throw error;
}

function buildPsqlCommand(options = {}) {
  const host = String(options.host || LOCALHOST);
  const port = Number.isInteger(options.port) ?
    options.port :
    DEFAULT_REPLICATION_PORT;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const sql = String(options.sql || '');
  const tuplesOnly = options.tuplesOnly === true ? PSQL_TUPLES_ONLY : '';

  return [
    `PGPASSWORD='${shellQuote(password)}'`,
    'psql',
    PSQL_ON_ERROR_STOP,
    tuplesOnly,
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ]
    .filter((part) => part.length > ZERO)
    .join(' ');
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return (
    SYNC_STANDBY_TEMPLATE_PREFIX +
    String(syncReplicaAcks) +
    SYNC_STANDBY_TEMPLATE_SUFFIX
  );
}

function buildReplicaBootstrapCommand(
  primaryContainerName,
  replicaName,
  benchmarkConfig,
) {
  const basebackupConnectionString = [
    `host=${primaryContainerName}`,
    `port=${benchmarkConfig.port}`,
    `user=${benchmarkConfig.user}`,
    `password=${benchmarkConfig.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ].join(' ');

  return [
    'set -e',
    'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
    '  rm -rf "$PGDATA"/*',
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${benchmarkConfig.port} -U '${shellQuote(benchmarkConfig.user)}'; do`,
    '    sleep 1',
    '  done',
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      '-D "$PGDATA" -Fp -Xs -P -R',
    'fi',
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ].join('\n');
}

async function configurePrimaryReplication(
  provider,
  containerId,
  benchmarkConfig,
) {
  if (benchmarkConfig.replicationFactor <= ONE) {
    return;
  }

  const syncSetting = buildSynchronousStandbySetting(
    benchmarkConfig.syncReplicaAcks,
  );
  const commands = [
    `echo "${REPLICATION_HBA_IPV4}" >> "$PGDATA/pg_hba.conf"`,
    `echo "${REPLICATION_HBA_IPV6}" >> "$PGDATA/pg_hba.conf"`,
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_standby_names = '${syncSetting}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: 'SELECT pg_reload_conf()',
    }),
  ];

  const shellCommand = commands.join(' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    'configure postgres primary replication',
  );
}

async function waitForStreamingReplicas(
  provider,
  primaryContainerId,
  benchmarkConfig,
) {
  const requiredReplicaCount = benchmarkConfig.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return;
  }

  const deadline = Date.now() + benchmarkConfig.readyTimeoutMs;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql:
        'SELECT count(*) FROM pg_stat_replication ' +
        `WHERE state = '${REPLICATION_STATE_STREAMING}'`,
      tuplesOnly: true,
    });

    const output = await execShell(
      provider,
      primaryContainerId,
      queryCommand,
      'check postgres replication status',
    );
    const replicaCount = Number.parseInt(String(output).trim(), 10);
    if (
      Number.isInteger(replicaCount) &&
      replicaCount >= requiredReplicaCount
    ) {
      return;
    }
    await sleep(benchmarkConfig.readyPollIntervalMs);
  }

  throw new Error(
    'Postgres replicas did not reach streaming state within ' +
      benchmarkConfig.readyTimeoutMs +
      'ms',
  );
}

function resolveBenchmarkConfig(cluster) {
  return resolvePostgresBaselineBenchmarkConfig(
    cluster?._config?.benchmark || {},
  );
}

function resolvePreflightConvergenceOptions(
  cluster,
  benchmarkConfig,
  nodeCount,
) {
  const configuredSettleTimeoutMs =
    Number.isFinite(cluster?._config?.convergence?.settleTimeoutMs) &&
    cluster._config.convergence.settleTimeoutMs > ZERO ?
      Math.floor(cluster._config.convergence.settleTimeoutMs) :
      null;
  const readyTimeoutMs =
    Number.isFinite(benchmarkConfig?.readyTimeoutMs) &&
    benchmarkConfig.readyTimeoutMs > ZERO ?
      Math.floor(benchmarkConfig.readyTimeoutMs) :
      null;
  const quiescentTimeoutMs =
    Number.isFinite(benchmarkConfig?.quiescentTimeoutMs) &&
    benchmarkConfig.quiescentTimeoutMs > ZERO ?
      Math.floor(benchmarkConfig.quiescentTimeoutMs) :
      null;

  const configuredTargetVoterCount =
    Number.isFinite(cluster?._config?.convergence?.targetVoterCount) &&
    cluster._config.convergence.targetVoterCount > ZERO ?
      Math.floor(cluster._config.convergence.targetVoterCount) :
      null;

  let settleTimeoutMs = Math.max(
    configuredSettleTimeoutMs || ZERO,
    readyTimeoutMs || ZERO,
    quiescentTimeoutMs || ZERO,
  );

  let targetVoterCount = configuredTargetVoterCount;

  if (nodeCount >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD) {
    settleTimeoutMs = Math.max(
      settleTimeoutMs,
      PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_MIN_SETTLE_TIMEOUT_MS,
    );
    if (Number.isInteger(targetVoterCount) && targetVoterCount > ZERO) {
      targetVoterCount += PREFLIGHT_CONVERGENCE_ALLOWED_VOTER_SKEW;
    }
  }

  if (!Number.isFinite(settleTimeoutMs) || settleTimeoutMs <= ZERO) {
    settleTimeoutMs = BENCHMARK_DEFAULTS.readyTimeoutMs;
  }

  const options = {
    settleTimeoutMs,
    quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
    targetVoterCount,
  };

  if (nodeCount >= PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD) {
    options.forceRepairAfterMs = PREFLIGHT_CONVERGENCE_FORCE_REPAIR_AFTER_MS;
  }

  return options;
}

function resolvePrimaryProvider(cluster) {
  const hostAssignment = cluster?._hostAssignment;
  const providers = cluster?._providers;
  const primaryIndex =
    Array.isArray(hostAssignment) && hostAssignment.length > ZERO ?
      hostAssignment[ZERO] :
      ZERO;

  const provider = Array.isArray(providers) ? providers[primaryIndex] : null;
  assert.ok(provider, 'Primary Docker provider is not available on cluster');
  return provider;
}

function resolveCacheBaseDir(cluster) {
  const configuredOutputDir = cluster?._config?.outputDir;
  if (
    typeof configuredOutputDir !== 'string' ||
    configuredOutputDir.length === ZERO
  ) {
    return null;
  }
  const normalizedPath = configuredOutputDir.trim();
  if (normalizedPath.length === ZERO) {
    return null;
  }
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    return dirname(normalizedPath);
  }
  return normalizedPath;
}

function resolveMachineProfile() {
  const cpuList = osCpus() || [];
  const firstCpu = cpuList[ZERO] || {};
  return {
    platform: osPlatform(),
    arch: osArch(),
    hostname: osHostname(),
    cpuCount: cpuList.length,
    cpuModel: String(firstCpu.model || 'unknown'),
  };
}

export const POSTGRES_BASELINE_COMPARISON_QUIESCENCE_AND_REPLICATION_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_LOAD_NODE_RESOLUTION_BUNDLE,
  waitForSutLoadQuiescence,
  buildPsqlCommand,
  buildSynchronousStandbySetting,
  buildReplicaBootstrapCommand,
  configurePrimaryReplication,
  waitForStreamingReplicas,
  resolveBenchmarkConfig,
  resolvePreflightConvergenceOptions,
  resolvePrimaryProvider,
  resolveCacheBaseDir,
  resolveMachineProfile,
};
