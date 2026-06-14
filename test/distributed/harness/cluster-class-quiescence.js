import {CLUSTER_CLASS_SHARED_CONTEXT} from './cluster-class-shared-context.js';
import {
  buildControlPlaneQuiescenceCandidateWindowReset,
  buildControlPlaneQuiescenceSnapshot,
} from './control-plane-quiescence-snapshot.js';
import {
  buildOracleBlindFailureMessage,
  createOracleBlindnessTracker,
  markOracleBlindError,
} from './oracle-blindness.js';

const {
  ACTIVE_POLL_INTERVAL_MS,
  BOOTSTRAP_JOIN_READY_PATH,
  BOOTSTRAP_POLL_INTERVAL_MS,
  BOOTSTRAP_PROGRESS_TIMEOUT_MAX_MULTIPLIER,
  BOOTSTRAP_READY_STABLE_WINDOW_MS,
  BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
  CHAOS_FAULT_STATUS_RECOVERED,
  CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
  CONTAINER_RUNNING_STATUS,
  CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
  DOCKER_HOST_CONFIG_BINDS_KEY,
  HTTP_METHOD_GET,
  HTTP_OK_LOWER,
  HTTP_OK_UPPER,
  LABELS,
  LOAD_PROGRESS_INTERVAL_MS,
  LOAD_RUN_ENTITY,
  LoadGenerator,
  NodeHandle,
  PLAYBACK_ENTITY_CLUSTER,
  PLAYBACK_EVENT_TYPE,
  PLAYBACK_SCOPE_CHAOS,
  PLAYBACK_SCOPE_CLUSTER,
  PLAYBACK_SCOPE_LOAD,
  PLAYBACK_SCOPE_NODE,
  PORTS,
  REUSE_ENTRYPOINT,
  REUSE_START_COMMAND_ARGS,
  STARTUP_GATE_WAITING_EVENT_INTERVAL,
  TIMEOUTS,
  UNKNOWN_PHASE,
  UNKNOWN_STATE,
  ZERO,
  buildBootstrapProgressSnapshot,
  compareBootstrapProgress,
  formatCountSummary,
  formatCriticalSystemDistributionSummary,
  hasDockerNetworkAlias,
  isIgnorableContainerStopError,
  normalizeReadinessProbeResult,
  pollUntilCondition,
  resolveBootstrapProbeSleepMs,
  resolveChaosFaultStatus,
  summarizeBootstrapProgress,
} = CLUSTER_CLASS_SHARED_CONTEXT;
import {ClusterLoadOrchestration} from './cluster-class-load-orchestration.js';

const QUIESCENCE_NODE_ID_UNKNOWN = 'unknown';
const QUIESCENCE_CANONICAL_BLOCKER_NONE = 'none';
const QUIESCENCE_INSTABILITY_SUMMARY_NONE = 'none';

function resolveQuiescenceProgressInFlightCount(
  snapshotProbe,
  quiescenceSnapshot,
) {
  const effectiveInFlightCount = quiescenceSnapshot?.effectiveInFlightCount;
  return Number.isInteger(effectiveInFlightCount) ?
    effectiveInFlightCount :
    snapshotProbe.inFlightCount;
}

function hasControlPlaneQuiescenceStableWindowClosed(
  quiescenceSnapshot,
  stableWindowMs,
) {
  return (
    quiescenceSnapshot?.ready === true &&
    Number.isFinite(quiescenceSnapshot.stableElapsedMs) &&
    quiescenceSnapshot.stableElapsedMs >= stableWindowMs
  );
}

class ClusterQuiescence extends ClusterLoadOrchestration {
  async waitForControlPlaneQuiescence(options = {}) {
    const stableWindowMs =
      this._resolveControlPlaneQuiescenceStableWindowMs(options);
    const timeoutMs = this._resolveControlPlaneQuiescenceTimeoutMs(options);
    const noProgressTimeoutMs =
      this._resolveControlPlaneQuiescenceNoProgressTimeoutMs(options);
    const maxInFlightCount =
      this._resolveControlPlaneQuiescenceMaxInFlightCount(options);
    const deadline = Date.now() + timeoutMs;
    const instabilitySummaryCounts = new Map();
    let lastLeaderSignature = null;
    let lastLeaderChangeAtMs = Date.now();
    let stableWindowStartedAtMs = null;
    let lastProgressAtMs = Date.now();
    let lowestInFlightCount = Number.POSITIVE_INFINITY;
    let maxLeaderQuietElapsedMs = ZERO;
    let lowestCriticalSystemSpreadGap = Number.POSITIVE_INFINITY;
    let highestCriticalSystemReadyTableCount = ZERO;
    let lastOperationTimelineSignature = null;
    let lastOperationProgressAtMs = Date.now();
    let candidateWindowReset = null;
    // CL-031: when the snapshot probe fails on every node (e.g. 'Max payload
    // size exceeded') the quiesce oracle is BLIND — the failure must classify
    // as oracle_blind, never as a quiesce stall/timeout.
    const oracleBlindnessTracker = createOracleBlindnessTracker();

    let pollResult;
    try {
      pollResult = await pollUntilCondition({
        deadline,
        intervalMs: ACTIVE_POLL_INTERVAL_MS,
        sleep: (ms) => this._sleep(ms),
        probe: async () => {
          const snapshotProbe =
            await this._probeControlPlaneQuiescenceSnapshot(deadline);
          const nowMs = Date.now();
          if (snapshotProbe.error) {
            oracleBlindnessTracker.recordBlindPoll(snapshotProbe.error, nowMs);
          } else {
            oracleBlindnessTracker.recordSightedPoll(nowMs);
          }
          if (snapshotProbe.error) {
            stableWindowStartedAtMs = null;
            let quiescenceSnapshot = buildControlPlaneQuiescenceSnapshot({
              snapshotProbe,
              nowMs,
              stableWindowStartedAtMs,
              stableWindowMs,
              maxInFlightCount,
              ignoreStaleInFlightReplicaOperations:
                options.ignoreStaleInFlightReplicaOperations === true,
              candidateWindowReset,
            });
            candidateWindowReset =
              buildControlPlaneQuiescenceCandidateWindowReset(
                quiescenceSnapshot,
                nowMs,
              );
            quiescenceSnapshot = Object.freeze({
              ...quiescenceSnapshot,
              candidateWindowReset,
            });
            return {
              ...snapshotProbe,
              ...quiescenceSnapshot,
            };
          }

          if (
            lastLeaderSignature === null ||
            lastLeaderSignature !== snapshotProbe.leaderSignature
          ) {
            lastLeaderSignature = snapshotProbe.leaderSignature;
            lastLeaderChangeAtMs = nowMs;
          }

          const leaderQuietElapsedMs = nowMs - lastLeaderChangeAtMs;
          const criticalSystemTopology =
            await this._probeCriticalSystemTopology(deadline, options);
          const operationTimelineChanged =
            snapshotProbe.operationTimelineSignature !== null &&
            snapshotProbe.operationTimelineSignature !==
              lastOperationTimelineSignature;
          const candidateWindowStartedAtMs =
            stableWindowStartedAtMs === null ? nowMs : stableWindowStartedAtMs;
          let quiescenceSnapshot = buildControlPlaneQuiescenceSnapshot({
            snapshotProbe,
            criticalSystemTopology,
            leaderQuietElapsedMs,
            nowMs,
            stableWindowStartedAtMs: candidateWindowStartedAtMs,
            stableWindowMs,
            maxInFlightCount,
            ignoreStaleInFlightReplicaOperations:
              options.ignoreStaleInFlightReplicaOperations === true,
            operationNoProgressElapsedMs: nowMs - lastOperationProgressAtMs,
            operationNoProgressTimeoutMs: noProgressTimeoutMs,
            candidateWindowReset,
          });
          const progressInFlightCount = resolveQuiescenceProgressInFlightCount(
            snapshotProbe,
            quiescenceSnapshot,
          );
          const operationProgressObserved =
            progressInFlightCount < lowestInFlightCount ||
            operationTimelineChanged;
          if (operationProgressObserved) {
            quiescenceSnapshot = buildControlPlaneQuiescenceSnapshot({
              snapshotProbe,
              criticalSystemTopology,
              leaderQuietElapsedMs,
              nowMs,
              stableWindowStartedAtMs: candidateWindowStartedAtMs,
              stableWindowMs,
              maxInFlightCount,
              ignoreStaleInFlightReplicaOperations:
                options.ignoreStaleInFlightReplicaOperations === true,
              operationNoProgressElapsedMs: ZERO,
              operationNoProgressTimeoutMs: noProgressTimeoutMs,
              candidateWindowReset,
            });
          }

          if (quiescenceSnapshot.ready) {
            if (stableWindowStartedAtMs === null) {
              stableWindowStartedAtMs = nowMs;
            }
          } else {
            stableWindowStartedAtMs = null;
            candidateWindowReset =
              buildControlPlaneQuiescenceCandidateWindowReset(
                quiescenceSnapshot,
                nowMs,
              );
            quiescenceSnapshot = Object.freeze({
              ...quiescenceSnapshot,
              candidateWindowReset,
            });
          }

          let progressObserved = operationProgressObserved;
          if (progressInFlightCount < lowestInFlightCount) {
            lowestInFlightCount = progressInFlightCount;
          }
          if (operationTimelineChanged) {
            lastOperationTimelineSignature =
              snapshotProbe.operationTimelineSignature;
          }
          if (operationProgressObserved) {
            lastOperationProgressAtMs = nowMs;
          }
          if (
            progressInFlightCount <= maxInFlightCount &&
            leaderQuietElapsedMs > maxLeaderQuietElapsedMs
          ) {
            maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
            progressObserved = true;
          }
          if (criticalSystemTopology.enabled === true) {
            if (
              criticalSystemTopology.totalSpreadGap <
              lowestCriticalSystemSpreadGap
            ) {
              lowestCriticalSystemSpreadGap =
                criticalSystemTopology.totalSpreadGap;
              progressObserved = true;
            }
            if (
              criticalSystemTopology.readyTableCount >
              highestCriticalSystemReadyTableCount
            ) {
              highestCriticalSystemReadyTableCount =
                criticalSystemTopology.readyTableCount;
              progressObserved = true;
            }
          }
          if (progressObserved) {
            lastProgressAtMs = nowMs;
          }

          if (
            !hasControlPlaneQuiescenceStableWindowClosed(
              quiescenceSnapshot,
              stableWindowMs,
            ) &&
            Number.isInteger(noProgressTimeoutMs) &&
            noProgressTimeoutMs > ZERO &&
            nowMs - lastProgressAtMs >= noProgressTimeoutMs
          ) {
            // CL-031 note: this stall branch only executes on a SIGHTED poll
            // (blind polls return early above), so the verdict here is
            // genuinely evidence-based; the oracle_blind classification for
            // the quiesce wait lives on the timeout path below.
            const stalledError = new Error(
              'Control plane quiescence stalled for ' +
                String(nowMs - lastProgressAtMs) +
                'ms (inFlightCount=' +
                String(snapshotProbe.inFlightCount) +
                ', leaderQuietElapsedMs=' +
                String(leaderQuietElapsedMs) +
                ', nodeId=' +
                String(snapshotProbe.nodeId || QUIESCENCE_NODE_ID_UNKNOWN) +
                ', quiescenceState=' +
                String(quiescenceSnapshot.state || UNKNOWN_STATE) +
                ', canonicalBlocker=' +
                String(
                  quiescenceSnapshot.canonicalBlocker ||
                    QUIESCENCE_CANONICAL_BLOCKER_NONE,
                ) +
                ')',
            );
            stalledError.quiescence = {
              nodeId: snapshotProbe.nodeId || null,
              inFlightCount: snapshotProbe.inFlightCount,
              effectiveInFlightCount:
                quiescenceSnapshot.effectiveInFlightCount ?? null,
              staleInFlightCount:
                quiescenceSnapshot.staleInFlightCount ?? null,
              cacheVisibleSatisfiedPriorityRecoveryOperationCount:
                quiescenceSnapshot
                  .cacheVisibleSatisfiedPriorityRecoveryOperationCount ?? null,
              staleInFlightDiscountCount:
                quiescenceSnapshot.staleInFlightDiscountCount ?? null,
              ignoreStaleInFlightReplicaOperations:
                quiescenceSnapshot.ignoreStaleInFlightReplicaOperations,
              state: quiescenceSnapshot.state,
              canonicalBlocker: quiescenceSnapshot.canonicalBlocker,
              reasonCodes: quiescenceSnapshot.reasonCodes,
              reasons: quiescenceSnapshot.reasons,
              controlPlanePressureSignals:
                quiescenceSnapshot.controlPlanePressureSignals || [],
              candidateWindowReset:
                quiescenceSnapshot.candidateWindowReset || null,
              stableElapsedMs: quiescenceSnapshot.stableElapsedMs,
              leaderQuietElapsedMs,
              criticalSystemDistribution:
                criticalSystemTopology.enabled === true ?
                  formatCriticalSystemDistributionSummary(
                    criticalSystemTopology,
                  ) :
                  null,
              criticalSystemTopology,
            };
            throw stalledError;
          }

          return {
            ...snapshotProbe,
            ...quiescenceSnapshot,
            criticalSystemTopology,
            stableElapsedMs:
              stableWindowStartedAtMs === null ?
                ZERO :
                nowMs - stableWindowStartedAtMs,
            leaderQuietElapsedMs,
          };
        },
        isSuccess: (result) =>
          result.ready === true && result.stableElapsedMs >= stableWindowMs,
        onAttempt: ({lastResult}) => {
          for (const reason of lastResult?.reasons || []) {
            instabilitySummaryCounts.set(
              reason,
              (instabilitySummaryCounts.get(reason) || ZERO) + 1,
            );
          }
        },
      });
    } catch (error) {
      await this._collectFailureLogs();
      throw error;
    }

    if (pollResult.success) {
      return {
        attempts: pollResult.attempts,
        elapsedMs: pollResult.elapsedMs,
        stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
        inFlightCount: pollResult.lastResult?.inFlightCount ?? null,
        effectiveInFlightCount:
          pollResult.lastResult?.effectiveInFlightCount ?? null,
        staleInFlightCount:
          pollResult.lastResult?.staleInFlightCount ?? null,
        leaderQuietElapsedMs:
          pollResult.lastResult?.leaderQuietElapsedMs ?? ZERO,
        selectedNodeId: pollResult.lastResult?.nodeId || null,
        selectedCapturedAtMs: pollResult.lastResult?.capturedAtMs ?? null,
        state: pollResult.lastResult?.state || null,
        canonicalBlocker: pollResult.lastResult?.canonicalBlocker || null,
        reasonCodes: pollResult.lastResult?.reasonCodes || [],
        controlPlanePressureSignals:
          pollResult.lastResult?.controlPlanePressureSignals || [],
        candidateWindowReset:
          pollResult.lastResult?.candidateWindowReset || null,
        partitionGroupInFlight:
          pollResult.lastResult?.partitionGroupInFlight || {},
        criticalSystemTopology:
          pollResult.lastResult?.criticalSystemTopology || null,
      };
    }

    await this._collectFailureLogs();
    const instabilitySummary = formatCountSummary(instabilitySummaryCounts);
    const timeoutOracleBlind = oracleBlindnessTracker.isBlindAtDecision();
    const timeoutOracleBlindSummary = oracleBlindnessTracker.summarize();
    if (timeoutOracleBlind) {
      const blindTimeoutError = new Error(
        buildOracleBlindFailureMessage({
          oracleName: 'Control plane quiescence',
          summary: timeoutOracleBlindSummary,
          budgetMs: timeoutMs,
          elapsedMs: pollResult.elapsedMs,
        }) +
          ' (attempts=' +
          pollResult.attempts +
          ', instabilitySummary=' +
          (instabilitySummary || QUIESCENCE_INSTABILITY_SUMMARY_NONE) +
          ')',
      );
      markOracleBlindError(blindTimeoutError, timeoutOracleBlindSummary);
      blindTimeoutError.quiescence = {
        nodeId: pollResult.lastResult?.nodeId || null,
        inFlightCount: pollResult.lastResult?.inFlightCount ?? null,
        state: pollResult.lastResult?.state || null,
        canonicalBlocker: pollResult.lastResult?.canonicalBlocker || null,
        reasonCodes: pollResult.lastResult?.reasonCodes || [],
        reasons: pollResult.lastResult?.reasons || [],
        stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
        oracleBlind: timeoutOracleBlindSummary,
      };
      throw blindTimeoutError;
    }
    const timeoutError = new Error(
      'Control plane did not quiesce within ' +
        timeoutMs +
        'ms (attempts=' +
        pollResult.attempts +
        ', elapsedMs=' +
        pollResult.elapsedMs +
        ', stableWindowMs=' +
        stableWindowMs +
        ', stableElapsedMs=' +
        (pollResult.lastResult?.stableElapsedMs ?? ZERO) +
        ', inFlightCount=' +
        String(pollResult.lastResult?.inFlightCount ?? 'unknown') +
        ', leaderQuietElapsedMs=' +
        String(pollResult.lastResult?.leaderQuietElapsedMs ?? ZERO) +
        ', selectedNodeId=' +
        String(pollResult.lastResult?.nodeId || QUIESCENCE_NODE_ID_UNKNOWN) +
        ', criticalSystemDistribution=' +
        formatCriticalSystemDistributionSummary(
          pollResult.lastResult?.criticalSystemTopology || null,
        ) +
        ', criticalSystemObservationState=' +
        String(
          pollResult.lastResult?.criticalSystemTopology?.observationState ||
            UNKNOWN_STATE,
        ) +
        ', quiescenceState=' +
        String(pollResult.lastResult?.state || UNKNOWN_STATE) +
        ', canonicalBlocker=' +
        String(
          pollResult.lastResult?.canonicalBlocker ||
            QUIESCENCE_CANONICAL_BLOCKER_NONE,
        ) +
        ', instabilitySummary=' +
        (instabilitySummary || QUIESCENCE_INSTABILITY_SUMMARY_NONE) +
        ')',
    );
    timeoutError.quiescence = {
      nodeId: pollResult.lastResult?.nodeId || null,
      inFlightCount: pollResult.lastResult?.inFlightCount ?? null,
      effectiveInFlightCount:
        pollResult.lastResult?.effectiveInFlightCount ?? null,
      staleInFlightCount: pollResult.lastResult?.staleInFlightCount ?? null,
      cacheVisibleSatisfiedPriorityRecoveryOperationCount:
        pollResult.lastResult
          ?.cacheVisibleSatisfiedPriorityRecoveryOperationCount ?? null,
      staleInFlightDiscountCount:
        pollResult.lastResult?.staleInFlightDiscountCount ?? null,
      ignoreStaleInFlightReplicaOperations:
        pollResult.lastResult?.ignoreStaleInFlightReplicaOperations ?? null,
      state: pollResult.lastResult?.state || null,
      canonicalBlocker: pollResult.lastResult?.canonicalBlocker || null,
      reasonCodes: pollResult.lastResult?.reasonCodes || [],
      reasons: pollResult.lastResult?.reasons || [],
      controlPlanePressureSignals:
        pollResult.lastResult?.controlPlanePressureSignals || [],
      candidateWindowReset:
        pollResult.lastResult?.candidateWindowReset || null,
      stableElapsedMs: pollResult.lastResult?.stableElapsedMs ?? ZERO,
      leaderQuietElapsedMs:
        pollResult.lastResult?.leaderQuietElapsedMs ?? ZERO,
      criticalSystemDistribution:
        formatCriticalSystemDistributionSummary(
          pollResult.lastResult?.criticalSystemTopology || null,
        ),
      criticalSystemTopology:
        pollResult.lastResult?.criticalSystemTopology || null,
    };
    throw timeoutError;
  }

  startLoad(options) {
    const requestedOptions =
      options && typeof options === 'object' ? options : {};
    const explicitNodes = Array.isArray(requestedOptions.nodes) ?
      requestedOptions.nodes :
      null;
    const nodes =
      explicitNodes !== null ?
        explicitNodes.filter((node) => node && typeof node === 'object') :
        Array.from(this._nodes.values());
    const benchmarkConfig =
      this._config?.benchmark && typeof this._config.benchmark === 'object' ?
        this._config.benchmark :
        null;
    const resolvedOptions = {
      ...requestedOptions,
    };
    if (resolvedOptions.admissionAwareScheduling === undefined) {
      resolvedOptions.admissionAwareScheduling = true;
    }
    if (benchmarkConfig) {
      if (
        resolvedOptions.maxInFlight === undefined &&
        Number.isInteger(benchmarkConfig.loadMaxInFlight) &&
        benchmarkConfig.loadMaxInFlight > ZERO
      ) {
        resolvedOptions.maxInFlight = benchmarkConfig.loadMaxInFlight;
      }
      if (
        resolvedOptions.queryTimeoutMs === undefined &&
        Number.isInteger(benchmarkConfig.loadQueryTimeoutMs) &&
        benchmarkConfig.loadQueryTimeoutMs > ZERO
      ) {
        resolvedOptions.queryTimeoutMs = benchmarkConfig.loadQueryTimeoutMs;
      }
      if (
        resolvedOptions.nodeMaxInFlight === undefined &&
        Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
        benchmarkConfig.loadNodeMaxInFlight > ZERO
      ) {
        resolvedOptions.nodeMaxInFlight = benchmarkConfig.loadNodeMaxInFlight;
      }
      if (
        resolvedOptions.nodeFailureThreshold === undefined &&
        Number.isInteger(benchmarkConfig.nodeFailureThreshold) &&
        benchmarkConfig.nodeFailureThreshold > ZERO
      ) {
        resolvedOptions.nodeFailureThreshold =
          benchmarkConfig.nodeFailureThreshold;
      }
      if (
        resolvedOptions.nodeFailureCooldownMs === undefined &&
        Number.isInteger(benchmarkConfig.nodeFailureCooldownMs) &&
        benchmarkConfig.nodeFailureCooldownMs > ZERO
      ) {
        resolvedOptions.nodeFailureCooldownMs =
          benchmarkConfig.nodeFailureCooldownMs;
      }
    }
    const generator = new LoadGenerator(nodes, resolvedOptions);
    const run = generator.start();
    this._activeLoadRuns.add(run);
    let stopped = false;
    let cancelled = false;
    let progressTimer = null;
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.LOAD_STARTED,
      PLAYBACK_SCOPE_LOAD,
      LOAD_RUN_ENTITY,
      {
        options: resolvedOptions,
      },
    );

    const clearProgressTimer = () => {
      if (progressTimer !== null) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const recordProgress = () => {
      if (stopped || typeof run.getMetrics !== 'function') {
        return;
      }
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_PROGRESS,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        {
          metrics: run.getMetrics(),
          cancelled,
        },
      );
    };

    const finalize = (details) => {
      if (stopped) {
        return;
      }
      stopped = true;
      this._activeLoadRuns.delete(run);
      clearProgressTimer();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.LOAD_COMPLETED,
        PLAYBACK_SCOPE_LOAD,
        LOAD_RUN_ENTITY,
        details,
      );
    };

    recordProgress();
    progressTimer = setInterval(recordProgress, LOAD_PROGRESS_INTERVAL_MS);

    const waitComplete = run.waitComplete.bind(run);
    const completionPromise = waitComplete()
      .then((metrics) => {
        finalize({
          metrics,
          cancelled,
        });
        return metrics;
      })
      .catch((error) => {
        finalize({
          cancelled,
          error: error?.message || 'load-run-failed',
        });
        throw error;
      });

    run.waitComplete = async () => completionPromise;

    if (typeof run.cancel === 'function') {
      const cancel = run.cancel.bind(run);
      run.cancel = () => {
        cancelled = true;
        clearProgressTimer();
        return cancel();
      };
    }

    completionPromise.catch(() => {
      // Prevent unhandled rejection when waitComplete is not awaited.
    });

    return run;
  }

  /**
   * Get the LogCollector instance for direct access.
   * @returns {LogCollector}
   */
  getLogCollector() {
    return this._logCollector;
  }

  /**
   * Get the LogAnalyzer instance for direct access.
   * @returns {LogAnalyzer}
   */
  getLogAnalyzer() {
    return this._logAnalyzer;
  }

  /**
   * Set scenario context for capture artifacts.
   * @param {string} scenarioName
   */
  setScenarioName(scenarioName) {
    if (typeof scenarioName !== 'string' || scenarioName.length === 0) {
      return;
    }
    this._scenarioName = scenarioName;
  }

  /**
   * Get finalized playback manifest generated on stop().
   * @returns {Object|null}
   */
  getPlaybackManifest() {
    return this._playbackManifest;
  }

  /**
   * Get finalized trace manifest generated on stop().
   * @returns {Object|null}
   */
  getTraceManifest() {
    if (this._traceManifest) {
      return this._traceManifest;
    }
    if (this._traceStartWarning) {
      return {warning: this._traceStartWarning};
    }
    return null;
  }

  // --- Internal helpers ---

  _recordPlaybackEvent(type, scope, entityId, details) {
    try {
      this._playbackRecorder.recordEvent({
        type,
        scope,
        entityId,
        details,
      });
    } catch (_err) {
      // Best-effort playback recording
    }
  }

  _recordClusterStage(stage, details = {}) {
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CLUSTER_STAGE,
      PLAYBACK_SCOPE_CLUSTER,
      PLAYBACK_ENTITY_CLUSTER,
      {
        stage,
        ...details,
      },
    );
  }

  _summarizeRestartBoundaryLedgerSnapshot(snapshot, nodeId) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const controlPlaneDiagnostics =
      snapshot.controlPlaneDiagnostics &&
      typeof snapshot.controlPlaneDiagnostics === 'object' ?
        snapshot.controlPlaneDiagnostics :
        null;
    const localReadiness =
      controlPlaneDiagnostics?.readinessByNodeId &&
      typeof controlPlaneDiagnostics.readinessByNodeId === 'object' ?
        controlPlaneDiagnostics.readinessByNodeId[nodeId] || null :
        null;
    return {
      nodeId,
      capturedAt:
        typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : null,
      capturedAtMs: Number.isFinite(snapshot.capturedAtMs) ?
        snapshot.capturedAtMs :
        null,
      publicationConvergence:
        controlPlaneDiagnostics?.publicationConvergence || null,
      startupRecovery: controlPlaneDiagnostics?.startupRecovery || null,
      publicationMode: controlPlaneDiagnostics?.publicationMode || null,
      heartbeatPublication:
        controlPlaneDiagnostics?.heartbeatPublication || null,
      localReadiness: localReadiness ?
        {
          nodeId: localReadiness.nodeId || nodeId,
          dimensions:
              localReadiness.dimensions &&
              typeof localReadiness.dimensions === 'object' ?
                localReadiness.dimensions :
                null,
          reasonCodes: Array.isArray(localReadiness.reasonCodes) ?
            localReadiness.reasonCodes :
            Array.isArray(localReadiness.reasons) ?
              localReadiness.reasons
                .map((reason) => String(reason?.code || '').trim())
                .filter((reason) => reason.length > ZERO) :
              [],
        } :
        null,
    };
  }

  async _recordRestartBoundarySnapshot(nodeId, phase) {
    const node = this._nodes.get(nodeId) || null;
    if (typeof node?.getControlPlaneLedgerSnapshot !== 'function') {
      return;
    }
    try {
      const snapshot = await node.getControlPlaneLedgerSnapshot({
        timeoutMs: CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS,
      });
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_RESTART_BOUNDARY,
        PLAYBACK_SCOPE_NODE,
        nodeId,
        {
          phase,
          snapshot: this._summarizeRestartBoundaryLedgerSnapshot(
            snapshot,
            nodeId,
          ),
        },
      );
    } catch (error) {
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.NODE_RESTART_BOUNDARY,
        PLAYBACK_SCOPE_NODE,
        nodeId,
        {
          phase,
          error: error?.message || 'restart-boundary-snapshot-failed',
        },
      );
    }
  }

  _recordPeriodicStartupWaitingStage(stage, attemptResult, details = {}) {
    const attempts = Number(attemptResult?.attempts) || 0;
    if (attempts % STARTUP_GATE_WAITING_EVENT_INTERVAL !== 0) {
      return;
    }
    this._recordClusterStage(stage, {
      attempts,
      elapsedMs: Number(attemptResult?.elapsedMs) || 0,
      ...details,
    });
  }

  async _runChaosAction(action, entityId, details, operation) {
    const normalizedDetails = details || {};
    const faultStatus = resolveChaosFaultStatus(action);
    this._recordPlaybackEvent(
      PLAYBACK_EVENT_TYPE.CHAOS_ACTION_STARTED,
      PLAYBACK_SCOPE_CHAOS,
      entityId,
      {
        action,
        details: normalizedDetails,
      },
    );
    try {
      const result = await operation();
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.CHAOS_ACTION_COMPLETED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          details: normalizedDetails,
        },
      );
      this._recordPlaybackEvent(
        faultStatus === CHAOS_FAULT_STATUS_RECOVERED ?
          PLAYBACK_EVENT_TYPE.CHAOS_FAULT_RECOVERED :
          PLAYBACK_EVENT_TYPE.CHAOS_FAULT_INJECTED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          status: faultStatus,
          details: normalizedDetails,
        },
      );
      return result;
    } catch (error) {
      this._recordPlaybackEvent(
        PLAYBACK_EVENT_TYPE.CHAOS_FAULT_FAILED,
        PLAYBACK_SCOPE_CHAOS,
        entityId,
        {
          action,
          status: faultStatus,
          details: normalizedDetails,
          error: error?.message || null,
        },
      );
      throw error;
    }
  }

  _resolveProviderIndexForNodeIndex(nodeIndex) {
    const configuredProviderIndex = this._hostAssignment[nodeIndex];
    if (
      Number.isInteger(configuredProviderIndex) &&
      configuredProviderIndex >= 0 &&
      configuredProviderIndex < this._providers.length
    ) {
      return configuredProviderIndex;
    }

    if (this._providers.length <= 0) {
      throw new Error('No Docker providers configured for cluster');
    }

    const fallbackProviderIndex = nodeIndex % this._providers.length;
    this._hostAssignment[nodeIndex] = fallbackProviderIndex;
    return fallbackProviderIndex;
  }

  async _startNode(nodeId, role, seedIp, nodeIndex) {
    const providerIdx = this._resolveProviderIndexForNodeIndex(nodeIndex);
    const provider = this._providers[providerIdx];
    const reuseContainers = this._isContainerReuseEnabled();
    const containerName = this._buildContainerName(nodeId, nodeIndex);

    const env = this._buildNodeEnv(nodeId, containerName, seedIp);
    if (reuseContainers) {
      await this._markReusableContainerForDataReset(containerName);
    }

    const labels = {
      [LABELS.CLUSTER]: this._clusterId,
      [LABELS.NODE_ID]: nodeId,
      [LABELS.ROLE]: role,
    };
    const dockerBinds = Array.isArray(this._config?.docker?.binds) ?
      this._config.docker.binds.filter(
        (entry) => typeof entry === 'string' && entry.length > 0,
      ) :
      [];
    if (reuseContainers) {
      dockerBinds.push(this._getReusableControlBind(containerName));
    }
    if (this._isFileLoggingEnabled()) {
      // Bind a host dir for the node's file-based log (non-perturbing capture).
      dockerBinds.push(this._buildFileLoggingBind(nodeId));
    }
    const hostConfigExtras =
      dockerBinds.length > 0 ?
        {[DOCKER_HOST_CONFIG_BINDS_KEY]: dockerBinds} :
        null;
    const startTimeout =
      this._config.timeouts?.nodeStartup || TIMEOUTS.NODE_STARTUP;

    if (reuseContainers) {
      let existing = null;
      try {
        existing = await provider.inspectContainerIfExists(containerName);
      } catch (_inspectErr) {
        existing = null;
      }
      if (existing && this._shouldRecreateReusableContainer(existing, env)) {
        const existingContainerId = existing.Id || existing.id || containerName;
        try {
          await provider.removeContainer(existingContainerId);
          existing = null;
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' +
              nodeId +
              '" (' +
              role +
              ') failed to reset reusable container: ' +
              err.message,
          );
        }
      }

      if (existing) {
        const containerId = existing.Id || existing.id || containerName;
        try {
          const status = String(existing?.State?.Status || '').toLowerCase();
          if (status === CONTAINER_RUNNING_STATUS) {
            try {
              await provider.stopContainer(containerId);
            } catch (error) {
              if (!isIgnorableContainerStopError(error)) {
                throw error;
              }
            }
          }
          await provider.startContainer(containerId, startTimeout);

          let refreshed = await provider.inspectContainer(containerId);
          const networks = refreshed?.NetworkSettings?.Networks;
          const runNetworkEndpoint = networks?.[this._networkName] || null;
          const connectedToRunNetwork = Boolean(runNetworkEndpoint);
          const hasRunNetworkAlias = hasDockerNetworkAlias(
            runNetworkEndpoint,
            containerName,
          );
          if (
            this._networkId &&
            (!connectedToRunNetwork || !hasRunNetworkAlias)
          ) {
            if (connectedToRunNetwork && !hasRunNetworkAlias) {
              await provider.disconnectFromNetwork(
                this._networkId,
                containerId,
              );
            }
            await provider.connectToNetwork(this._networkId, containerId, [
              containerName,
            ]);
            refreshed = await provider.inspectContainer(containerId);
          }

          const ip =
            refreshed?.NetworkSettings?.Networks?.[this._networkName]
              ?.IPAddress || '';
          return new NodeHandle(
            nodeId,
            containerId,
            ip,
            role,
            provider,
            undefined,
            {
              adminQueryTimeoutMs: this._resolveNodeHandleAdminQueryTimeoutMs(),
            },
          );
        } catch (err) {
          await this._collectFailureLogs();
          throw new Error(
            'Node "' +
              nodeId +
              '" (' +
              role +
              ') failed to reuse container: ' +
              err.message,
          );
        }
      }
    }

    let result;
    try {
      result = await provider.createContainer({
        name: containerName,
        image: this._config.image,
        network: this._networkName,
        env,
        labels,
        resourceLimits: this._config.resourceLimits || {},
        startTimeout,
        hostConfigExtras,
        ...(reuseContainers ?
          {
            entrypoint: REUSE_ENTRYPOINT,
            command: REUSE_START_COMMAND_ARGS,
          } :
          {}),
      });
    } catch (err) {
      await this._collectFailureLogs();
      throw new Error(
        'Node "' + nodeId + '" (' + role + ') failed to start: ' + err.message,
      );
    }

    return new NodeHandle(
      nodeId,
      result.containerId,
      result.ip,
      role,
      provider,
      undefined,
      {
        adminQueryTimeoutMs: this._resolveNodeHandleAdminQueryTimeoutMs(),
      },
    );
  }

  async _waitForBootstrapApi(seedNode) {
    const startupTimeout =
      this._config.timeouts?.nodeStartup || TIMEOUTS.NODE_STARTUP;
    const configuredStableWindowMs = Math.max(
      ZERO,
      this._config.timeouts?.bootstrapReadyStableWindowMs ??
        BOOTSTRAP_READY_STABLE_WINDOW_MS,
    );
    const hardTimeoutMs =
      startupTimeout * BOOTSTRAP_PROGRESS_TIMEOUT_MAX_MULTIPLIER;
    const startedAt = Date.now();
    const hardDeadline = startedAt + hardTimeoutMs;
    const bootstrapJoinReadyUrl =
      'http://' + seedNode.ip + ':' + PORTS.REST + BOOTSTRAP_JOIN_READY_PATH;
    const statusCounts = new Map();
    const phaseCounts = new Map();
    const reasonCounts = new Map();
    let attempts = ZERO;
    let lastResult = null;
    let bestProgress = null;
    let lastProgressAt = startedAt;
    let timeoutReason = 'hard_deadline';

    while (Date.now() <= hardDeadline) {
      attempts += 1;
      const probeResponse = await this._httpRequest({
        url: bootstrapJoinReadyUrl,
        timeoutMs: BOOTSTRAP_WAIT_REQUEST_TIMEOUT_MS,
        method: HTTP_METHOD_GET,
        includeBody: true,
      });
      const normalizedProbe =
        this._normalizeBootstrapReadinessProbeResult(probeResponse);
      const status = normalizedProbe.status;
      statusCounts.set(status, (statusCounts.get(status) || ZERO) + 1);
      if (normalizedProbe.phase) {
        phaseCounts.set(
          normalizedProbe.phase,
          (phaseCounts.get(normalizedProbe.phase) || ZERO) + 1,
        );
      }
      for (const reason of normalizedProbe.reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || ZERO) + 1);
      }

      const success = status >= HTTP_OK_LOWER && status <= HTTP_OK_UPPER;
      lastResult = {
        ...normalizedProbe,
        success,
      };

      const progress = buildBootstrapProgressSnapshot(lastResult);
      if (compareBootstrapProgress(progress, bestProgress) > ZERO) {
        bestProgress = progress;
        lastProgressAt = Date.now();
      }

      if (success) {
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      this._recordPeriodicStartupWaitingStage(
        CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
        {
          attempts,
          elapsedMs,
        },
        {
          nodeId: seedNode.id,
          lastStatus: lastResult?.status ?? null,
          lastPhase: lastResult?.phase ?? null,
          lastPhaseRank: lastResult?.phaseRank ?? ZERO,
          lastState: lastResult?.state ?? null,
          lastReasons: lastResult?.reasons || [],
          stableWindowMs:
            lastResult?.stableWindowMs ?? configuredStableWindowMs,
          stableElapsedMs: lastResult?.stableElapsedMs ?? ZERO,
          readinessEpoch: lastResult?.readinessEpoch ?? null,
          noProgressTimeoutMs: startupTimeout,
          hardTimeoutMs,
        },
      );

      const now = Date.now();
      if (now - lastProgressAt >= startupTimeout) {
        timeoutReason = 'no_progress';
        break;
      }

      const sleepBudgetMs = Math.max(
        ZERO,
        Math.min(hardDeadline, lastProgressAt + startupTimeout) - now,
      );
      if (sleepBudgetMs <= ZERO) {
        timeoutReason = 'no_progress';
        break;
      }

      const desiredSleepMs = resolveBootstrapProbeSleepMs(
        lastResult,
        BOOTSTRAP_POLL_INTERVAL_MS,
      );
      await this._sleep(Math.min(desiredSleepMs, sleepBudgetMs));
    }

    await this._collectFailureLogs();
    const statusSummary = formatCountSummary(statusCounts);
    const phaseSummary = formatCountSummary(phaseCounts);
    const reasonSummary = formatCountSummary(reasonCounts);
    const lastStatus = lastResult?.status ?? null;
    const lastPhase = lastResult?.phase || UNKNOWN_PHASE;
    const lastState = lastResult?.state || UNKNOWN_STATE;
    const lastReasons =
      Array.isArray(lastResult?.reasons) && lastResult.reasons.length > ZERO ?
        lastResult.reasons.join(',') :
        'none';
    const bestProgressSummary = summarizeBootstrapProgress(bestProgress);
    const elapsedMs = Date.now() - startedAt;
    const lastProgressElapsedMs = Math.max(ZERO, Date.now() - lastProgressAt);
    throw new Error(
      'Seed node bootstrap API did not become join-ready ' +
        'within ' +
        elapsedMs +
        'ms' +
        ' (attempts=' +
        attempts +
        ', timeoutReason=' +
        timeoutReason +
        ', noProgressTimeoutMs=' +
        startupTimeout +
        ', hardTimeoutMs=' +
        hardTimeoutMs +
        ', lastStatus=' +
        String(lastStatus) +
        ', lastPhase=' +
        lastPhase +
        ', lastState=' +
        lastState +
        ', lastReasons=' +
        lastReasons +
        ', bestStatus=' +
        String(bestProgressSummary.status) +
        ', bestPhase=' +
        bestProgressSummary.phase +
        ', bestReasons=' +
        bestProgressSummary.reasons +
        ', stableWindowMs=' +
        (lastResult?.stableWindowMs ?? configuredStableWindowMs) +
        ', stableElapsedMs=' +
        (lastResult?.stableElapsedMs ?? ZERO) +
        ', readinessEpoch=' +
        String(lastResult?.readinessEpoch ?? 'none') +
        ', lastProgressElapsedMs=' +
        lastProgressElapsedMs +
        ', elapsedMs=' +
        elapsedMs +
        ', statusCounts=' +
        (statusSummary || 'none') +
        ', phaseCounts=' +
        (phaseSummary || 'none') +
        ', reasonCounts=' +
        (reasonSummary || 'none') +
        ')',
    );
  }

  _normalizeBootstrapReadinessProbeResult(probeResponse) {
    return normalizeReadinessProbeResult(probeResponse);
  }
}

export {ClusterQuiescence};
