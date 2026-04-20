import { POSTGRES_BASELINE_COMPARISON_SEGMENT_10 } from "./postgres-baseline-comparison-segment-10.js";
const {
  FAILURE_ARTIFACT_SCHEMA_VERSION,
  ZERO,
  buildCanonicalStrictReasonCounts,
  buildFailureAffectedNodeIds,
  buildFailureReasonCounts,
  buildVersionLagSummary,
  isStrictBenchmarkMode,
  resolveDominantStrictReason,
  resolveFailureNodeReasonsByNodeId,
  resolveFailureRootCauseClass,
  resolveReplicaOperationTimelineByOperationId,
} = POSTGRES_BASELINE_COMPARISON_SEGMENT_10;

function buildUnifiedFailureArtifact(
  phaseResult,
  benchmarkConfig,
  options = {},
) {
  const rawReasonCounts = buildFailureReasonCounts(phaseResult);
  const nodeReasonsByNodeId = resolveFailureNodeReasonsByNodeId(phaseResult);
  const canonicalStrictReasonCounts = buildCanonicalStrictReasonCounts(
    nodeReasonsByNodeId,
    rawReasonCounts,
  );
  const reasonCounts =
    Object.keys(canonicalStrictReasonCounts).length > ZERO
      ? canonicalStrictReasonCounts
      : rawReasonCounts;
  const dominantReason = resolveDominantStrictReason(reasonCounts);
  const failureArtifact = {
    schemaVersion: FAILURE_ARTIFACT_SCHEMA_VERSION,
    rootCauseClass: resolveFailureRootCauseClass(phaseResult, reasonCounts),
    phase: String(phaseResult?.phase || "unknown"),
    affectedNodeIds: buildFailureAffectedNodeIds(
      phaseResult,
      options?.loadMetrics || null,
    ),
    reasonCounts,
    dominantReason,
    strictMode: isStrictBenchmarkMode(benchmarkConfig),
  };

  const versionConvergence = phaseResult?.artifacts?.versionConvergence;
  if (versionConvergence && typeof versionConvergence === "object") {
    failureArtifact.versionConvergence = versionConvergence;
    failureArtifact.versionLagSummary =
      buildVersionLagSummary(versionConvergence);
  }

  const saturation = phaseResult?.artifacts?.saturation;
  if (saturation && typeof saturation === "object") {
    failureArtifact.saturation = saturation;
  }

  const readinessTimeline = Array.isArray(
    phaseResult?.artifacts?.readinessTimeline,
  )
    ? phaseResult.artifacts.readinessTimeline
    : Array.isArray(phaseResult?.artifacts?.gateResult?.readinessTimeline)
      ? phaseResult.artifacts.gateResult.readinessTimeline
      : [];
  if (readinessTimeline.length > ZERO) {
    failureArtifact.readinessTimeline = readinessTimeline;
  }

  const benchmarkMetadataFlow = phaseResult?.artifacts?.benchmarkMetadataFlow;
  if (benchmarkMetadataFlow && typeof benchmarkMetadataFlow === "object") {
    failureArtifact.benchmarkMetadataFlow = benchmarkMetadataFlow;
  }
  const replicaOperationTimelineByOperationId =
    resolveReplicaOperationTimelineByOperationId(phaseResult);
  if (Object.keys(replicaOperationTimelineByOperationId).length > ZERO) {
    failureArtifact.replicaOperationTimelineByOperationId =
      replicaOperationTimelineByOperationId;
  }

  if (Object.keys(nodeReasonsByNodeId).length > ZERO) {
    failureArtifact.nodeReasonsByNodeId = nodeReasonsByNodeId;
  }

  return failureArtifact;
}

function selectVerificationNodes(effectiveNodes, postLoadDrain) {
  const includedNodeIds = new Set(
    Array.isArray(postLoadDrain?.includedNodeIds)
      ? postLoadDrain.includedNodeIds
      : [],
  );
  if (includedNodeIds.size === ZERO) {
    return [...effectiveNodes];
  }
  return effectiveNodes.filter((node) => includedNodeIds.has(node.id));
}

export const POSTGRES_BASELINE_COMPARISON_SEGMENT_11 = {
  ...POSTGRES_BASELINE_COMPARISON_SEGMENT_10,
  buildUnifiedFailureArtifact,
  selectVerificationNodes,
};
