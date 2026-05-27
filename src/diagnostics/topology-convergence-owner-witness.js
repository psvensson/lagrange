import {
  ABSENT_VALUE,
  FIRST_FRONTIER_INDEX,
  OWNER_WITNESS_FIELD,
  CONTRACT_FIELD,
  EDGE_ROOT_CAUSE_CLASS,
  ROOT_CAUSE_CLASS_UNKNOWN,
  OWNER_SUPPORTING_REASON_SET,
  SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_OWNER_PRESENTATION_V1,
  TYPE_STRING,
  SOURCE_ORDER_BASE,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
} from './topology-convergence-normalizers.js';

export function resolveOwnerWitnessNextAction(edge) {
  const source = edge.source || {};
  if (source.topologyOperatorNextAction && source.topologyOperatorNextAction !== ABSENT_VALUE) {
    return source.topologyOperatorNextAction;
  }
  if (source.publicationActiveGateHandoffNextAction && source.publicationActiveGateHandoffNextAction !== ABSENT_VALUE) {
    return source.publicationActiveGateHandoffNextAction;
  }
  if (source.selectedSnapshotObservationNextAction && source.selectedSnapshotObservationNextAction !== ABSENT_VALUE) {
    return source.selectedSnapshotObservationNextAction;
  }
  // Default values based on edge id
  if (edge.id === 'publication_ack_convergence') {
    return 'wait_for_publication_ack';
  }
  if (edge.id === 'priority_recovery_partition_progress') {
    return 'wait_for_priority_recovery';
  }
  if (edge.id === 'active_gate_snapshot_coverage') {
    return 'wait_for_snapshot_coverage';
  }
  if (edge.id === 'readiness_startup_support') {
    return 'wait_for_readiness_support';
  }
  return ABSENT_VALUE;
}

export function resolveOwnerWitnessWakeSource(edge) {
  const source = edge.source || {};
  if (source.selectedSnapshotNodeId && source.selectedSnapshotNodeId !== ABSENT_VALUE) {
    return source.selectedSnapshotNodeId;
  }
  if (source.topologyOperatorId && source.topologyOperatorId !== ABSENT_VALUE) {
    return source.topologyOperatorId;
  }
  if (source.readinessDelayCause && source.readinessDelayCause !== ABSENT_VALUE) {
    return source.readinessDelayCause;
  }
  if (source.source && source.source !== ABSENT_VALUE) {
    return source.source;
  }
  return ABSENT_VALUE;
}

export function resolveOwnerWitnessRetryAfterMs(edge) {
  const source = edge.source || {};
  if (typeof source.selectedSnapshotObservationRetryAfterMs === 'number') {
    return source.selectedSnapshotObservationRetryAfterMs;
  }
  if (typeof source.membershipPublicationHandoffOutcomeRetryAfterMs === 'number') {
    return source.membershipPublicationHandoffOutcomeRetryAfterMs;
  }
  if (typeof source.topologyOperatorDeadlineMs === 'number') {
    return source.topologyOperatorDeadlineMs;
  }
  return 0;
}

export function resolveOwnerWitnessTerminalState(edge) {
  if (edge.state === 'terminal_failed') {
    return 'terminal_failed';
  }
  const source = edge.source || {};
  if (source.recoverability === 'terminal' || source.recoverability === 'terminal_failed') {
    return 'terminal_failed';
  }
  return ABSENT_VALUE;
}

export function resolveOwnerWitnessBlockingDependency(edge) {
  if (Array.isArray(edge.dependencies) && edge.dependencies.length > 0) {
    return edge.dependencies[0];
  }
  return ABSENT_VALUE;
}

export function buildTopologyConvergenceOwnerWitness(edge) {
  if (!edge) {
    return buildAbsentTopologyConvergenceOwnerWitness();
  }
  const reason = selectOwnerWitnessDominantReason(edge);
  return {
    [OWNER_WITNESS_FIELD.EDGE_ID]: textOrAbsent(edge.id),
    [OWNER_WITNESS_FIELD.OWNER]: textOrAbsent(edge.owner),
    [OWNER_WITNESS_FIELD.BOUNDARY]: textOrAbsent(edge.boundary),
    [OWNER_WITNESS_FIELD.STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.FRONTIER_STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.DOMINANT_REASON]: reason,
    [OWNER_WITNESS_FIELD.REASONS]: arrayOrEmpty(edge.reasons),
    [OWNER_WITNESS_FIELD.EVIDENCE_PATH]: textOrAbsent(edge.evidencePath),
    [OWNER_WITNESS_FIELD.SOURCE]: asRecord(edge.source),
    [OWNER_WITNESS_FIELD.ROOT_CAUSE_CLASS]:
      EDGE_ROOT_CAUSE_CLASS[edge.id] || ROOT_CAUSE_CLASS_UNKNOWN,
    // Progress contract vocabulary
    [CONTRACT_FIELD.OWNER]: textOrAbsent(edge.owner),
    [CONTRACT_FIELD.BOUNDARY]: textOrAbsent(edge.boundary),
    [CONTRACT_FIELD.STATE]: textOrAbsent(edge.state),
    [CONTRACT_FIELD.REASON]: reason,
    [CONTRACT_FIELD.NEXT_ACTION]: resolveOwnerWitnessNextAction(edge),
    [CONTRACT_FIELD.WAKE_SOURCE]: resolveOwnerWitnessWakeSource(edge),
    [CONTRACT_FIELD.RETRY_AFTER_MS]: resolveOwnerWitnessRetryAfterMs(edge),
    [CONTRACT_FIELD.TERMINAL_STATE]: resolveOwnerWitnessTerminalState(edge),
    [CONTRACT_FIELD.EVIDENCE_PATH]: textOrAbsent(edge.evidencePath),
    [CONTRACT_FIELD.BLOCKING_DEPENDENCY]: resolveOwnerWitnessBlockingDependency(edge),
  };
}

export function buildAbsentTopologyConvergenceOwnerWitness() {
  return {
    [OWNER_WITNESS_FIELD.EDGE_ID]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.OWNER]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.BOUNDARY]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.STATE]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.FRONTIER_STATE]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.DOMINANT_REASON]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.REASONS]: [],
    [OWNER_WITNESS_FIELD.EVIDENCE_PATH]: ABSENT_VALUE,
    [OWNER_WITNESS_FIELD.SOURCE]: {},
    [OWNER_WITNESS_FIELD.ROOT_CAUSE_CLASS]: ROOT_CAUSE_CLASS_UNKNOWN,
    // Progress contract vocabulary defaults
    [CONTRACT_FIELD.OWNER]: ABSENT_VALUE,
    [CONTRACT_FIELD.BOUNDARY]: ABSENT_VALUE,
    [CONTRACT_FIELD.STATE]: ABSENT_VALUE,
    [CONTRACT_FIELD.REASON]: ABSENT_VALUE,
    [CONTRACT_FIELD.NEXT_ACTION]: ABSENT_VALUE,
    [CONTRACT_FIELD.WAKE_SOURCE]: ABSENT_VALUE,
    [CONTRACT_FIELD.RETRY_AFTER_MS]: 0,
    [CONTRACT_FIELD.TERMINAL_STATE]: ABSENT_VALUE,
    [CONTRACT_FIELD.EVIDENCE_PATH]: ABSENT_VALUE,
    [CONTRACT_FIELD.BLOCKING_DEPENDENCY]: ABSENT_VALUE,
  };
}

export function selectOwnerWitnessDominantReason(edge) {
  const primaryReason = arrayOrEmpty(edge.reasons).find((reason) =>
    OWNER_SUPPORTING_REASON_SET.has(reason) !== true,
  );
  return textOrAbsent(primaryReason || edge.reasons?.[FIRST_FRONTIER_INDEX]);
}

export function selectTopologyConvergenceDominantWitness(graphOrPresentation) {
  const frontierWitnesses = Array.isArray(
    graphOrPresentation?.frontierWitnesses,
  ) ?
    graphOrPresentation.frontierWitnesses :
    Array.isArray(graphOrPresentation?.frontier) ?
      graphOrPresentation.frontier.map((edge) =>
        buildTopologyConvergenceOwnerWitness(edge),
      ) :
      [];
  return frontierWitnesses[FIRST_FRONTIER_INDEX] ||
    buildAbsentTopologyConvergenceOwnerWitness();
}

export function buildTopologyConvergenceOwnerPresentation(graph) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const frontier = Array.isArray(graph?.frontier) ? graph.frontier : [];
  const ownerWitnesses = edges.map((edge) =>
    buildTopologyConvergenceOwnerWitness(edge),
  );
  const frontierWitnesses = frontier.map((edge) =>
    buildTopologyConvergenceOwnerWitness(edge),
  );

  return {
    schemaVersion: SCHEMA_VERSION_TOPOLOGY_CONVERGENCE_OWNER_PRESENTATION_V1,
    ownerWitnesses,
    frontierWitnesses,
    dominantWitness: selectTopologyConvergenceDominantWitness({
      frontierWitnesses,
    }),
  };
}

export function textOrAbsent(value) {
  if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
    return value;
  }
  return ABSENT_VALUE;
}
