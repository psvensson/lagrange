import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
const {
  VALUE_UNKNOWN: ASSERTIONS_VALUE_UNKNOWN,
  normalizeLeaderAddress,
} = ASSERTIONS_CONVERGENCE_WAIT;
export const VALUE_UNKNOWN = ASSERTIONS_VALUE_UNKNOWN;

export const OBSERVATION_SOURCE_CONTROL_SNAPSHOT = 'control_snapshot';
export const OBSERVATION_MODE_UNKNOWN = VALUE_UNKNOWN;
export const CONSISTENCY_REASON_CODE_ACTIVE_NODES_DISAGREE =
  'active_nodes_disagree';
export const CONSISTENCY_REASON_CODE_PARTITION_ASSIGNMENTS_DISAGREE =
  'partition_assignments_disagree';
export const CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE =
  'published_active_nodes_disagree';
export const CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
export const CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
export const CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED =
  'observer_snapshot_repair_deferred';
export const CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE =
  'mixed_observation_mode';
export const CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
export const CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
export const CONSISTENCY_REASON_CODE_PUBLICATION_EPOCHS_DISAGREE =
  'publication_epochs_disagree';
export const CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY =
  'publication_recovery_gate_not_ready';
export const CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH =
  'final_consistency_mismatch';
export const PUBLICATION_RECOVERY_GATE_STATE_PUBLICATION_PENDING =
  'publication_pending';
export const PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
export const PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE =
  'priority_spread_evidence_unavailable';
export const PUBLICATION_RECOVERY_GATE_STATE_READY = 'ready';
export const PUBLICATION_RECOVERY_GATE_REASON_SEPARATOR = '|';
export const CONSISTENCY_GATE_SUMMARY_PREFIX = '[';
export const CONSISTENCY_GATE_SUMMARY_SUFFIX = ']';
export const CONSISTENCY_GATE_SUMMARY_SEPARATOR = '; ';
export const BOOLEAN_TRUE = 'true';
export const BOOLEAN_FALSE = 'false';
export const EMPTY_LIST_LENGTH = 0;
export const NO_RECOVERY_BLOCKER_COUNT = 0;
export const CONSISTENCY_SINGLE_REASON_COUNT = 1;
export const CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH = 'leader_map_mismatch';
export const CONSISTENCY_FINAL_STATE_OBSERVER_REVISION_LAG = 'observer_revision_lag';
export const CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED =
  'observer_repair_deferred';
export const CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH =
  'observation_mode_mismatch';
export const CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
export const CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED = 'authority_diverged';
export const CONSISTENCY_FINAL_STATE_MISMATCH = 'consistency_mismatch';
export const CONSISTENCY_FINAL_BOUNDARY = 'final_leader_map_consistency';
export const CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY = 'topology';
export const CONSISTENCY_ROOT_CAUSE_CLASS_CACHE = 'cache';
export const CONSISTENCY_REVISION_BARRIER_STATE_READY = 'ready';
export const CONSISTENCY_REVISION_BARRIER_STATE_LAGGING = 'lagging';
export const CONSISTENCY_REVISION_BARRIER_STATE_UNAVAILABLE = 'unavailable';
export const CONSISTENCY_OBSERVATION_COHORT_STATE_CONTROL_SNAPSHOT =
  'control_snapshot';
export const CONSISTENCY_OBSERVATION_COHORT_STATE_SQL_FALLBACK = 'sql_fallback';
export const CONSISTENCY_OBSERVATION_COHORT_STATE_MIXED_UNAVAILABLE =
  'mixed_unavailable';
export const CONSISTENCY_OBSERVATION_COHORT_STATE_INSUFFICIENT =
  'insufficient';
export const CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT = 2;
export const PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH = 'topologyEpoch';
export const PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH = 'membershipEpoch';
export const PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION = 'snapshotRevision';
export const PRIORITY_RECOVERY_CLOSURE_WITNESS_NOT_PENDING = Object.freeze({
  prioritySpreadPending: false,
});

export function isConsistencyRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeConsistencyStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0)
    .sort();
}

export function normalizeConsistencyInteger(value) {
  return Number.isInteger(value) ? value : null;
}

export function normalizePartitionLeaderAuthority(authority) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return {};
  }
  const normalized = {};
  for (const [fallbackPartitionId, certificate] of Object.entries(authority)) {
    if (
      !certificate ||
      typeof certificate !== 'object' ||
      Array.isArray(certificate)
    ) {
      continue;
    }
    const partitionId = String(
      certificate.partitionId || fallbackPartitionId || '',
    ).trim();
    const leaderNodeId = normalizeLeaderAddress(
      String(certificate.leaderNodeId || '').trim(),
    );
    if (partitionId.length === 0 || leaderNodeId.length === 0) {
      continue;
    }
    normalized[partitionId] = {
      partitionId,
      leaderNodeId,
      leaderSource:
        typeof certificate.leaderSource === 'string' &&
        certificate.leaderSource.length > 0 ?
          certificate.leaderSource :
          VALUE_UNKNOWN,
      replicaRoleConsistent: certificate.replicaRoleConsistent === true,
      replicaLeaderNodeIds: normalizeConsistencyStringList(
        Array.isArray(certificate.replicaLeaderNodeIds) ?
          certificate.replicaLeaderNodeIds.map(normalizeLeaderAddress) :
          [],
      ),
      ...(Number.isInteger(certificate.schemaVersion) ?
        {schemaVersion: certificate.schemaVersion} :
        {}),
      ...(Number.isInteger(certificate.topologyEpoch) ?
        {topologyEpoch: certificate.topologyEpoch} :
        {}),
      ...(Number.isInteger(certificate.membershipEpoch) ?
        {membershipEpoch: certificate.membershipEpoch} :
        {}),
      ...(Number.isInteger(certificate.snapshotRevision) ?
        {snapshotRevision: certificate.snapshotRevision} :
        {}),
    };
  }
  return sortObjectKeys(normalized);
}

export function normalizeConsistencyNodeIdList(values) {
  if (!Array.isArray(values)) {
    return null;
  }
  return normalizeConsistencyStringList(values);
}

/**
 * Sort object keys for deterministic JSON comparison.
 *
 * @param {Object} obj - Plain object.
 * @returns {Object} New object with sorted keys.
 */
export function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}
