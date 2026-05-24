import {
  ABSENT_VALUE,
  FIRST_FRONTIER_INDEX,
  OWNER_WITNESS_FIELD,
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

export function buildTopologyConvergenceOwnerWitness(edge) {
  if (!edge) {
    return buildAbsentTopologyConvergenceOwnerWitness();
  }
  return {
    [OWNER_WITNESS_FIELD.EDGE_ID]: textOrAbsent(edge.id),
    [OWNER_WITNESS_FIELD.OWNER]: textOrAbsent(edge.owner),
    [OWNER_WITNESS_FIELD.BOUNDARY]: textOrAbsent(edge.boundary),
    [OWNER_WITNESS_FIELD.STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.FRONTIER_STATE]: textOrAbsent(edge.state),
    [OWNER_WITNESS_FIELD.DOMINANT_REASON]:
      selectOwnerWitnessDominantReason(edge),
    [OWNER_WITNESS_FIELD.REASONS]: arrayOrEmpty(edge.reasons),
    [OWNER_WITNESS_FIELD.EVIDENCE_PATH]: textOrAbsent(edge.evidencePath),
    [OWNER_WITNESS_FIELD.SOURCE]: asRecord(edge.source),
    [OWNER_WITNESS_FIELD.ROOT_CAUSE_CLASS]:
      EDGE_ROOT_CAUSE_CLASS[edge.id] || ROOT_CAUSE_CLASS_UNKNOWN,
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
