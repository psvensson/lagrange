import {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES,
} from './publication-active-gate-handoff-contract-decision.js';
import {
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON,
  PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE,
  PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST,
  PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD,
  PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_STATUS,
  PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
  PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH,
} from './publication-active-gate-handoff-contract-constants.js';
import {
  hasPublicationActiveGateHandoffStaleMarker,
  isPublicationActiveGateHandoffRecord,
  normalizePublicationActiveGateHandoffNodeIdList,
  resolvePublicationActiveGateHandoffFirstInteger,
  resolvePublicationActiveGateHandoffPublicationEpoch,
  resolvePublicationActiveGateHandoffPublicationRevision,
  resolvePublicationActiveGateHandoffPublicationStatus,
  resolvePublicationActiveGateHandoffQuorumCount,
} from './publication-active-gate-handoff-contract-helpers.js';
import {
  collectPublicationActiveGateHandoffNodeRows,
  collectPublicationActiveGateHandoffRecordNodeIds,
  resolvePublicationActiveGateHandoffExpectedNodeIds,
} from './publication-active-gate-handoff-contract-evidence.js';

function resolvePublicationActiveGateHandoffDurablePublishedNodeIds(
  options = {},
) {
  const explicitPublishedNodeIds =
    normalizePublicationActiveGateHandoffNodeIdList(
      options.publishedActiveNodeIds,
    );
  if (explicitPublishedNodeIds.length > 0) {
    return explicitPublishedNodeIds;
  }
  return normalizePublicationActiveGateHandoffNodeIdList(
    options.publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLISHED_ACTIVE_NODE_IDS
    ],
  );
}

function isPublicationActiveGateHandoffDurablePublicationAvailable({
  nodeIds,
  publicationEpoch,
  publicationStatus,
}) {
  return nodeIds.length > 0 ||
    publicationEpoch !== PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH ||
    publicationStatus ===
      PUBLICATION_ACTIVE_GATE_HANDOFF_PUBLICATION_STATUS.PUBLISHED;
}

function isPublicationActiveGateHandoffDurablePublicationCovered({
  available,
  stale,
  targetNodeIds,
  missingNodeIds,
}) {
  return available === true &&
    stale !== true &&
    targetNodeIds.length > 0 &&
    missingNodeIds.length === 0;
}

function resolvePublicationActiveGateHandoffDurablePublicationEvidenceState({
  available,
  covered,
  stale,
}) {
  if (stale === true) {
    return PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.STALE;
  }
  if (available !== true) {
    return PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.UNAVAILABLE;
  }
  if (covered === true) {
    return PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.AVAILABLE;
  }
  return PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.INCOMPLETE;
}

function buildPublicationActiveGateHandoffDurablePublicationEvidence({
  targetNodeIds,
  options,
}) {
  const publicationConvergence = options.publicationConvergence;
  const nodeIds = resolvePublicationActiveGateHandoffDurablePublishedNodeIds(
    options,
  );
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !nodeIds.includes(nodeId)),
  );
  const publicationEpoch =
    resolvePublicationActiveGateHandoffPublicationEpoch(publicationConvergence);
  const publicationRevision =
    resolvePublicationActiveGateHandoffPublicationRevision(
      publicationConvergence,
    );
  const publicationStatus =
    resolvePublicationActiveGateHandoffPublicationStatus(
      publicationConvergence,
    );
  const available = isPublicationActiveGateHandoffDurablePublicationAvailable({
    nodeIds,
    publicationEpoch,
    publicationStatus,
  });
  const stale = hasPublicationActiveGateHandoffStaleMarker(
    publicationConvergence?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION_STATE
    ],
    publicationConvergence?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.PUBLICATION_OBSERVATION
    ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
  );
  const covered = isPublicationActiveGateHandoffDurablePublicationCovered({
    available,
    stale,
    targetNodeIds,
    missingNodeIds,
  });
  return Object.freeze({
    state: resolvePublicationActiveGateHandoffDurablePublicationEvidenceState({
      available,
      covered,
      stale,
    }),
    available,
    stale,
    covered,
    nodeIds,
    nodeCount: nodeIds.length,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    ...(publicationEpoch !== PUBLICATION_ACTIVE_GATE_HANDOFF_UNKNOWN_EPOCH ?
      {publicationEpoch} :
      {}),
    ...(publicationRevision !== null ?
      {publicationRevision} :
      {}),
  });
}

function resolvePublicationActiveGateHandoffSnapshotCoverageSource(
  options = {},
) {
  return isPublicationActiveGateHandoffRecord(options.snapshotCoverage) ?
    options.snapshotCoverage :
    (
      isPublicationActiveGateHandoffRecord(options.activeNodeViews) ?
        options.activeNodeViews :
        null
    );
}

function resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(
  options = {},
) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  if (!coverageSource) {
    return PUBLICATION_ACTIVE_GATE_HANDOFF_EMPTY_LIST;
  }
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.NODE_IDS],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.COVERED_NODE_IDS],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_COVERAGE_NODE_IDS
      ],
    ),
    ...normalizePublicationActiveGateHandoffNodeIdList(
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.EFFECTIVE_ACTIVE_NODE_IDS
      ],
    ),
  ]);
}

function resolvePublicationActiveGateHandoffSnapshotCoverageRevision(
  options = {},
) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  return resolvePublicationActiveGateHandoffFirstInteger(
    coverageSource?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION],
    coverageSource?.[
      PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_COVERAGE_REVISION
    ],
    coverageSource?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_REVISION],
  );
}

function isPublicationActiveGateHandoffSnapshotCoverageStale(options = {}) {
  const coverageSource =
    resolvePublicationActiveGateHandoffSnapshotCoverageSource(options);
  if (!coverageSource) {
    return false;
  }
  return coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.FRESH] ===
    false ||
    hasPublicationActiveGateHandoffStaleMarker(
      coverageSource[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.REVISION_STATE
      ],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_REVISION_STATE
      ],
      coverageSource[
        PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.SNAPSHOT_OBSERVATION
      ]?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.STATE],
    );
}

function buildPublicationActiveGateHandoffSnapshotCoverageEvidence({
  targetNodeIds,
  options,
}) {
  const nodeIds =
    resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(options);
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !nodeIds.includes(nodeId)),
  );
  const revision =
    resolvePublicationActiveGateHandoffSnapshotCoverageRevision(options);
  const stale = isPublicationActiveGateHandoffSnapshotCoverageStale(options);
  const available = nodeIds.length > 0 || revision !== null;
  const quorumCount =
    resolvePublicationActiveGateHandoffQuorumCount(targetNodeIds);
  const coveredTargetNodeCount = targetNodeIds.length - missingNodeIds.length;
  const covered =
    available === true &&
    stale !== true &&
    targetNodeIds.length > 0 &&
    coveredTargetNodeCount >= quorumCount;
  return Object.freeze({
    state: stale === true ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.STALE :
      (available === true ?
        (covered === true ?
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.AVAILABLE :
          PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.INCOMPLETE) :
        PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_EVIDENCE_STATE.UNAVAILABLE),
    available,
    stale,
    covered,
    requiredQuorumNodeCount: quorumCount,
    nodeIds,
    coveredNodeCount: coveredTargetNodeCount,
    coveredTargetNodeCount,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    ...(revision !== null ? {revision} : {}),
  });
}

function resolvePublicationActiveGateHandoffPresenceNodeIds(options = {}) {
  return normalizePublicationActiveGateHandoffNodeIdList([
    ...collectPublicationActiveGateHandoffNodeRows(options.nodeRows),
    ...collectPublicationActiveGateHandoffRecordNodeIds(
      options.activeNodeViews,
      PUBLICATION_ACTIVE_GATE_HANDOFF_ACTIVE_NODE_VIEW_FIELDS,
    ),
    ...resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds(options),
  ]);
}

function buildPublicationActiveGateHandoffPresenceEvidence({
  targetNodeIds,
  options,
}) {
  const presentNodeIds =
    resolvePublicationActiveGateHandoffPresenceNodeIds(options);
  const missingNodeIds = normalizePublicationActiveGateHandoffNodeIdList(
    targetNodeIds.filter((nodeId) => !presentNodeIds.includes(nodeId)),
  );
  const quorumCount =
    resolvePublicationActiveGateHandoffQuorumCount(targetNodeIds);
  const presentTargetNodeCount = targetNodeIds.length - missingNodeIds.length;
  return Object.freeze({
    targetNodeIds,
    presentNodeIds,
    requiredQuorumNodeCount: quorumCount,
    presentNodeCount: presentTargetNodeCount,
    presentTargetNodeCount,
    missingNodeIds,
    missingNodeCount: missingNodeIds.length,
    complete:
      targetNodeIds.length > 0 &&
      presentTargetNodeCount >= quorumCount,
  });
}

function appendPublicationActiveGateCatchupFenceReason({
  condition,
  reason,
  reasons,
}) {
  if (condition === true) {
    reasons.push(reason);
  }
}

function hasPublicationActiveGateCatchupFenceIncompleteEvidence(evidence) {
  return evidence.available === true &&
    evidence.stale !== true &&
    evidence.covered !== true;
}

function resolvePublicationActiveGateCatchupFenceMissingProofReasons(
  evidence,
) {
  const fenceGaps = [];
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.targetNodeIds.length === 0,
    reason: PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.TARGETS_UNAVAILABLE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.presence.complete !== true,
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.TARGET_PRESENCE_INCOMPLETE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.durablePublication.available !== true,
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
        .DURABLE_PUBLICATION_UNAVAILABLE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.durablePublication.stale === true,
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.DURABLE_PUBLICATION_STALE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: hasPublicationActiveGateCatchupFenceIncompleteEvidence(
      evidence.durablePublication,
    ),
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
        .DURABLE_PUBLICATION_INCOMPLETE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.snapshotCoverage.available !== true,
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON
        .SNAPSHOT_COVERAGE_UNAVAILABLE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: evidence.snapshotCoverage.stale === true,
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.SNAPSHOT_COVERAGE_STALE,
  });
  appendPublicationActiveGateCatchupFenceReason({
    reasons: fenceGaps,
    condition: hasPublicationActiveGateCatchupFenceIncompleteEvidence(
      evidence.snapshotCoverage,
    ),
    reason:
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_REASON.SNAPSHOT_COVERAGE_INCOMPLETE,
  });
  return normalizePublicationActiveGateHandoffNodeIdList(fenceGaps);
}

function buildPublicationActiveGateCatchupFence(options = {}) {
  const targetNodeIds =
    resolvePublicationActiveGateHandoffExpectedNodeIds(options);
  const durablePublication =
    buildPublicationActiveGateHandoffDurablePublicationEvidence({
      targetNodeIds,
      options,
    });
  const snapshotCoverage =
    buildPublicationActiveGateHandoffSnapshotCoverageEvidence({
      targetNodeIds,
      options,
    });
  const presence = buildPublicationActiveGateHandoffPresenceEvidence({
    targetNodeIds,
    options,
  });
  const evidence = Object.freeze({
    targetNodeIds,
    durablePublication,
    snapshotCoverage,
    presence,
  });
  const decision =
    PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_DECISION_RULES.find((rule) =>
      rule.matches(evidence),
    );
  const catchupState =
    durablePublication.covered === true ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.CATCHUP_READY :
      decision.state;
  const promotionState =
    decision.state ===
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED ?
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED :
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_DENIED;
  return Object.freeze({
    schemaVersion: PUBLICATION_ACTIVE_GATE_HANDOFF_SCHEMA_VERSION,
    state: decision.state,
    catchupState,
    promotionState,
    targetNodeIds,
    targetNodeCount: targetNodeIds.length,
    presence,
    durablePublication,
    snapshotCoverage,
    missingProofReasons:
      resolvePublicationActiveGateCatchupFenceMissingProofReasons(evidence),
    nextLegalAction: decision.nextLegalAction,
    promotionAllowed:
      promotionState ===
      PUBLICATION_ACTIVE_GATE_CATCHUP_FENCE_STATE.PROMOTION_ALLOWED,
  });
}

export {
  resolvePublicationActiveGateHandoffDurablePublishedNodeIds,
  isPublicationActiveGateHandoffDurablePublicationAvailable,
  isPublicationActiveGateHandoffDurablePublicationCovered,
  resolvePublicationActiveGateHandoffDurablePublicationEvidenceState,
  buildPublicationActiveGateHandoffDurablePublicationEvidence,
  resolvePublicationActiveGateHandoffSnapshotCoverageSource,
  resolvePublicationActiveGateHandoffSnapshotCoverageNodeIds,
  resolvePublicationActiveGateHandoffSnapshotCoverageRevision,
  isPublicationActiveGateHandoffSnapshotCoverageStale,
  buildPublicationActiveGateHandoffSnapshotCoverageEvidence,
  resolvePublicationActiveGateHandoffPresenceNodeIds,
  buildPublicationActiveGateHandoffPresenceEvidence,
  appendPublicationActiveGateCatchupFenceReason,
  hasPublicationActiveGateCatchupFenceIncompleteEvidence,
  resolvePublicationActiveGateCatchupFenceMissingProofReasons,
  buildPublicationActiveGateCatchupFence,
};
