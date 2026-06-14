import {POSTGRES_BASELINE_COMPARISON_FAILURE_ARTIFACT_AND_VERIFICATION_BUNDLE} from './postgres-baseline-comparison-failure-artifact-and-verification.js';
const {
  AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON,
  CDC_TELEMETRY_SCHEMA_MISSING_REASON,
  DISCOVERY_GATE_STATUS_FAILED,
  INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  POST_LOAD_DRAIN_STATUS_FAILED,
  QUIET_MODE_ACTIVE_PHASES,
  QUIET_MODE_REASON_RUN_FINALIZE,
  SNAPSHOT_REFRESH_WARNING_PREFIX,
  SNAPSHOT_REFRESH_WARNING_SKIPPED,
  SNAPSHOT_REFRESH_WARNING_UNRESOLVED,
  SNAPSHOT_WARNING_PREFIX,
  ZERO,
  CONSISTENCY_VERDICT,
  NODE_CLIENT_CONTEXT_KEYS,
  PHASE_STATUS,
  SCENARIO_PHASE,
  buildCdcTelemetryState,
  buildQuietModeDetails,
  buildInternalSignalCounts,
  buildVerificationArtifacts,
  collectCdcTelemetryByNode,
  collectControlSnapshotsFromNodes,
  createVerificationSnapshotRefreshResult,
  emitPhaseMeaningfulChange,
  emitPhaseProgress,
  evaluateAssertionPolicy,
  evaluateAuthoritativeFallbackPolicy,
  evaluateInternalSignalThresholds,
  formatAuthoritativeFallbackViolations,
  formatCdcTelemetrySchemaErrors,
  formatInternalSignalBreaches,
  replaceSnapshotsByNodeId,
  resolveFirstMismatchKind,
  resolveMismatchRefreshNodeIds,
  selectStrictInvariantGateEntries,
  selectVerificationNodes,
  assertConsistencyFromSnapshots,
  exitQuietMode,
} = POSTGRES_BASELINE_COMPARISON_FAILURE_ARTIFACT_AND_VERIFICATION_BUNDLE;

export function buildVerificationPhaseHandlers(context) {
  const {
    benchmarkConfig,
    scenarioOverrides,
    nodeClient,
    state,
    consistencyEvaluator,
  } = context;

  return {
    [SCENARIO_PHASE.VERIFY]: async (phaseContext) => {
      emitPhaseProgress(phaseContext, 'collecting verification snapshots', {
        verificationCandidateCount: state.effectiveSutLoadNodes.length,
      });
      const verificationNodes = selectVerificationNodes(
        state.effectiveSutLoadNodes,
        state.postLoadDrain,
      );
      state.verificationNodeIds = verificationNodes.map((node) => node.id);
      const verificationNodeSet = new Set(state.verificationNodeIds);
      state.verificationExcludedNodeIds = state.effectiveSutLoadNodes
        .map((node) => node.id)
        .filter((nodeId) => !verificationNodeSet.has(nodeId));

      const initialSnapshotCollection = await collectControlSnapshotsFromNodes(
        nodeClient,
        verificationNodes,
        {
          context: NODE_CLIENT_TRANSIENT_CONTEXT,
          warningPrefix: SNAPSHOT_WARNING_PREFIX,
        },
      );
      let snapshots = initialSnapshotCollection.snapshots;
      const snapshotWarnings = [...initialSnapshotCollection.warnings];
      let evaluation =
        state.verificationNodeIds.length <= ONE ?
          {
            verdict: CONSISTENCY_VERDICT.CONSISTENT,
            hardFailure: false,
            coverage: {
              reachableNodes: state.verificationNodeIds.length,
              snapshotNodes: snapshots.length,
            },
            mismatches: [],
            evidenceWarnings: [],
          } :
          consistencyEvaluator.evaluate({
            reachableNodeIds: state.verificationNodeIds,
            snapshots,
          });
      const snapshotRefresh = createVerificationSnapshotRefreshResult();
      const hasMismatches =
        Array.isArray(evaluation.mismatches) &&
        evaluation.mismatches.length > ZERO;
      if (hasMismatches && state.verificationNodeIds.length > ONE) {
        const verificationNodeById = new Map();
        for (const node of verificationNodes) {
          const nodeId = String(node?.id || '');
          if (nodeId.length > ZERO) {
            verificationNodeById.set(nodeId, node);
          }
        }
        snapshotRefresh.attempted = true;
        snapshotRefresh.triggerMismatchKind = resolveFirstMismatchKind(
          evaluation.mismatches,
        );
        snapshotRefresh.targetNodeIds = resolveMismatchRefreshNodeIds(
          evaluation.mismatches,
          state.verificationNodeIds,
        );

        const refreshNodes = snapshotRefresh.targetNodeIds
          .map((nodeId) => verificationNodeById.get(nodeId) || null)
          .filter(Boolean);
        if (refreshNodes.length > ZERO) {
          const refreshSnapshotCollection =
            await collectControlSnapshotsFromNodes(nodeClient, refreshNodes, {
              context: {
                ...NODE_CLIENT_TRANSIENT_CONTEXT,
                [NODE_CLIENT_CONTEXT_KEYS.FORCE_AUTHORITATIVE_REPAIR]: true,
              },
              warningPrefix: SNAPSHOT_REFRESH_WARNING_PREFIX,
            });
          snapshotWarnings.push(...refreshSnapshotCollection.warnings);
          for (const snapshot of refreshSnapshotCollection.snapshots) {
            const nodeId = String(snapshot?.nodeId || '');
            if (nodeId.length > ZERO) {
              snapshotRefresh.refreshedNodeIds.push(nodeId);
            }
          }
          for (const warning of refreshSnapshotCollection.warnings) {
            const [nodeId] = String(warning)
              .replace(SNAPSHOT_REFRESH_WARNING_PREFIX, '')
              .split('=');
            if (nodeId) {
              snapshotRefresh.failedNodeIds.push(nodeId);
            }
          }
          if (refreshSnapshotCollection.snapshots.length > ZERO) {
            snapshots = replaceSnapshotsByNodeId(
              snapshots,
              refreshSnapshotCollection.snapshots,
            );
            evaluation = consistencyEvaluator.evaluate({
              reachableNodeIds: state.verificationNodeIds,
              snapshots,
            });
            snapshotRefresh.resolved = evaluation.mismatches.length === ZERO;
            if (evaluation.mismatches.length > ZERO) {
              snapshotWarnings.push(SNAPSHOT_REFRESH_WARNING_UNRESOLVED);
            }
          }
        } else {
          snapshotRefresh.resolved = false;
          snapshotWarnings.push(SNAPSHOT_REFRESH_WARNING_SKIPPED);
        }
      }
      state.verificationSnapshotRefresh = snapshotRefresh;
      const evidenceWarnings = [
        ...evaluation.evidenceWarnings,
        ...snapshotWarnings,
      ];
      let consistencyVerdict = evaluation.verdict;
      if (
        consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
        evidenceWarnings.length > ZERO
      ) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      if (
        consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
        state.postLoadDrain.status === POST_LOAD_DRAIN_STATUS_FAILED
      ) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      state.consistencyVerdict = consistencyVerdict;
      state.consistencyEvaluation = {
        coverage: evaluation.coverage,
        mismatches: evaluation.mismatches,
        evidenceWarnings,
      };

      assertConsistencyFromSnapshots(snapshots);
      state.consistencyResult = {attempts: ONE};
      emitPhaseMeaningfulChange(
        phaseContext,
        'verification consistency evaluated',
        {
          verdict: state.consistencyVerdict,
          snapshotCount: snapshots.length,
        },
      );

      state.assertionPolicyResult = evaluateAssertionPolicy({
        consistencyVerdict: state.consistencyVerdict,
        invariants: selectStrictInvariantGateEntries(
          state.preLoadInvariantEvaluation.invariants,
        ),
        loadMetrics: state.loadMetrics,
        policy: {
          insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
        },
      });

      state.internalSignalCounts = buildInternalSignalCounts(
        state.loadMetrics,
        scenarioOverrides,
        state.runtimeInternalSignalMessages,
      );
      state.internalSignalThresholdResult = evaluateInternalSignalThresholds(
        state.internalSignalCounts,
        benchmarkConfig.internalSignalThresholds,
      );
      const cdcTelemetryRawByNode = await collectCdcTelemetryByNode(
        nodeClient,
        verificationNodes,
        scenarioOverrides,
      );
      state.cdcTelemetry = buildCdcTelemetryState({
        rawByNode: cdcTelemetryRawByNode,
        requiredNodeIds: state.verificationNodeIds,
        strict: benchmarkConfig.strictCdcTelemetrySchema === true,
      });
      state.authoritativeFallbackResult = evaluateAuthoritativeFallbackPolicy(
        state.cdcTelemetry,
        {
          strictAuthoritativeFallback:
            benchmarkConfig.strictAuthoritativeFallback === true,
          authoritativeFallbackThresholds:
            benchmarkConfig.authoritativeFallbackThresholds,
        },
      );
      state.strictBenchmarkGate.authoritativeFallback =
        state.authoritativeFallbackResult;
      if (
        benchmarkConfig.strictCdcTelemetrySchema === true &&
        state.cdcTelemetry.schema.valid !== true
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            CDC_TELEMETRY_SCHEMA_MISSING_REASON +
              ': ' +
              formatCdcTelemetrySchemaErrors(state.cdcTelemetry),
          ],
        };
      }
      if (
        benchmarkConfig.strictAuthoritativeFallback === true &&
        state.authoritativeFallbackResult.status ===
          DISCOVERY_GATE_STATUS_FAILED
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            AUTHORITATIVE_FALLBACK_THRESHOLD_EXCEEDED_REASON +
              ': ' +
              formatAuthoritativeFallbackViolations(
                state.authoritativeFallbackResult,
              ),
          ],
        };
      }
      if (
        state.internalSignalThresholdResult.failOnThresholdBreach &&
        state.internalSignalThresholdResult.breached
      ) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: [
            INTERNAL_SIGNAL_THRESHOLD_BREACH_REASON +
              ': ' +
              formatInternalSignalBreaches(state.internalSignalThresholdResult),
          ],
        };
      }

      if (state.assertionPolicyResult.passed !== true) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: buildVerificationArtifacts(state, {
            includeLoadMetrics: true,
          }),
          errors: state.assertionPolicyResult.hardFailures.map((failure) =>
            String(failure?.message || failure),
          ),
        };
      }

      const warnings = state.assertionPolicyResult.softWarnings.map((warning) =>
        String(warning?.message || warning),
      );
      return {
        status: warnings.length > ZERO ? PHASE_STATUS.WARN : PHASE_STATUS.OK,
        artifacts: buildVerificationArtifacts(state, {
          includeVerificationNodes: true,
          includeConsistencyAssertionAttempts: true,
        }),
        warnings,
      };
    },
    [SCENARIO_PHASE.TEARDOWN]: async () => ({
      status: PHASE_STATUS.OK,
      artifacts: (() => {
        exitQuietMode(
          state.quietMode,
          SCENARIO_PHASE.TEARDOWN,
          QUIET_MODE_REASON_RUN_FINALIZE,
        );
        return {
          complete: true,
          quietMode: buildQuietModeDetails(state.quietMode, {
            defaultActivePhases: QUIET_MODE_ACTIVE_PHASES,
          }),
        };
      })(),
    }),
  };
}
