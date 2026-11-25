import {
  CONTROL_PLANE_SNAPSHOT_REVISION_STATE,
} from '../../../src/control-plane/control-plane-snapshot-revision.js';
import {
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from '../../../src/admin/admin-constants.js';
import {ASSERTIONS_CONVERGENCE_WAIT} from './assertions-convergence-wait.js';
import {
  extractPublicationRecoveryGateContract,
} from './assertions-publication-recovery-gate.js';
import {
  buildPublicationRecoveryGateNotReadyMessage,
  resolvePublicationScopedLeaderComparison,
} from './assertions-publication-gate-comparison.js';
import {
  CONSISTENCY_FINAL_BOUNDARY,
  CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED,
  CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH,
  CONSISTENCY_FINAL_STATE_MISMATCH,
  CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH,
  CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
  CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED,
  CONSISTENCY_FINAL_STATE_OBSERVER_REVISION_LAG,
  CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT,
  CONSISTENCY_REASON_CODE_ACTIVE_NODES_DISAGREE,
  CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH,
  CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE,
  CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
  CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
  CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
  CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG,
  CONSISTENCY_REASON_CODE_PARTITION_ASSIGNMENTS_DISAGREE,
  CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED,
  CONSISTENCY_REASON_CODE_PUBLICATION_EPOCHS_DISAGREE,
  CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY,
  CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE,
  CONSISTENCY_REVISION_BARRIER_STATE_LAGGING,
  CONSISTENCY_REVISION_BARRIER_STATE_READY,
  CONSISTENCY_REVISION_BARRIER_STATE_UNAVAILABLE,
  CONSISTENCY_ROOT_CAUSE_CLASS_CACHE,
  CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY,
  CONSISTENCY_SINGLE_REASON_COUNT,
  EMPTY_LIST_LENGTH,
  NO_RECOVERY_BLOCKER_COUNT,
  OBSERVATION_MODE_UNKNOWN,
  OBSERVATION_SOURCE_CONTROL_SNAPSHOT,
  PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH,
  PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH,
  VALUE_UNKNOWN,
  normalizeConsistencyInteger,
  normalizeConsistencyNodeIdList,
  normalizeConsistencyStringList,
  normalizePartitionLeaderAuthority,
  sortObjectKeys,
} from './assertions-consistency-shared.js';
const {
  cloneDiagnostics,
  buildPublicationConvergenceFromState,
  extractControlSnapshotPublishedNodeIds,
  hasConflictingLeaders,
  isTolerableActiveNodeSkew,
  isTolerablePartitionSkew,
  normalizeLeaders,
} = ASSERTIONS_CONVERGENCE_WAIT;

const arrayMap = Function.call.bind(Array.prototype.map);

function normalizeNonEmptyConsistencyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeOptionalConsistencyInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function normalizeSortedConsistencyArray(value, fallback = []) {
  return Array.isArray(value) ? [...value].sort() : fallback;
}

function buildConsistencyRevisionFields(record) {
  const source = record ?? {};
  return {
    sourceSnapshotVersion: normalizeConsistencyInteger(
      source.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(source.snapshotRevision),
    snapshotRevisionState: normalizeNonEmptyConsistencyString(
      source.snapshotRevisionState,
    ),
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      source.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      source.snapshotRevisionGap,
    ),
    snapshotResumeToken: normalizeNonEmptyConsistencyString(
      source.snapshotResumeToken,
    ),
  };
}

export function buildConsistencyComparisonRecordFromState(state) {
  const source = state ?? {};
  const controlPlaneDiagnostics = cloneDiagnostics(
    source.controlPlaneDiagnostics,
  );
  return {
    nodeId: String(source.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(source.activeNodes) || [],
    authoritativeActiveNodes: normalizeConsistencyNodeIdList(
      source.authoritativeActiveNodes,
    ),
    partitions: normalizeConsistencyStringList(source.partitions),
    leaders: sortObjectKeys(normalizeLeaders(source.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      source.partitionLeaderAuthority,
    ),
    publicationEpoch: normalizeOptionalConsistencyInteger(
      source.publicationEpoch,
    ),
    ...buildConsistencyRevisionFields(source),
    publishedActiveNodeIds: normalizeConsistencyNodeIdList(
      source.publishedActiveNodeIds,
    ),
    observationSource: String(source.observationSource || VALUE_UNKNOWN),
    observationMode: String(
      source.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    controlPlaneDiagnostics,
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      controlPlaneDiagnostics,
    ),
  };
}

function resolveSnapshotAuthoritativeActiveNodes(snapshot) {
  const publishedActiveNodeIdsSet = extractControlSnapshotPublishedNodeIds(
    snapshot,
  );
  return publishedActiveNodeIdsSet instanceof Set ?
    normalizeConsistencyNodeIdList(Array.from(publishedActiveNodeIdsSet)) :
    null;
}

function resolveSnapshotPublicationEpoch(source, controlPlaneDiagnostics) {
  const convergenceEpoch =
    controlPlaneDiagnostics?.publicationConvergence?.publicationEpoch;
  if (Number.isInteger(convergenceEpoch)) {
    return convergenceEpoch;
  }
  return normalizeOptionalConsistencyInteger(source.publicationEpoch);
}

function resolveSnapshotPublishedActiveNodeIds(
  source,
  controlPlaneDiagnostics,
) {
  const convergenceNodeIds =
    controlPlaneDiagnostics?.publicationConvergence?.publishedActiveNodeIds;
  if (Array.isArray(convergenceNodeIds)) {
    return normalizeConsistencyNodeIdList(convergenceNodeIds);
  }
  if (Array.isArray(source.publishedActiveNodeIds)) {
    return normalizeConsistencyNodeIdList(source.publishedActiveNodeIds);
  }
  return normalizeConsistencyNodeIdList(
    Array.isArray(source.publishedNodes) ? source.publishedNodes : null,
  );
}

export function buildConsistencyComparisonRecordFromSnapshot(snapshot) {
  const source = snapshot ?? {};
  const controlPlaneDiagnostics = cloneDiagnostics(
    source.controlPlaneDiagnostics,
  );
  return {
    nodeId: String(source.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(source.nodes) || [],
    authoritativeActiveNodes: resolveSnapshotAuthoritativeActiveNodes(snapshot),
    partitions: normalizeConsistencyStringList(source.partitions),
    leaders: sortObjectKeys(normalizeLeaders(source.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      source.partitionLeaderAuthority,
    ),
    publicationEpoch: resolveSnapshotPublicationEpoch(
      source,
      controlPlaneDiagnostics,
    ),
    ...buildConsistencyRevisionFields(source),
    publishedActiveNodeIds: resolveSnapshotPublishedActiveNodeIds(
      source,
      controlPlaneDiagnostics,
    ),
    observationSource: OBSERVATION_SOURCE_CONTROL_SNAPSHOT,
    observationMode: String(
      source.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    controlPlaneDiagnostics,
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      controlPlaneDiagnostics,
    ),
  };
}

function hasSnapshotRevisionEvidence(record) {
  return (
    Number.isInteger(record?.snapshotRevision) ||
    Number.isInteger(record?.snapshotExpectedMinimumRevision) ||
    Number.isInteger(record?.snapshotRevisionGap) ||
    (typeof record?.snapshotRevisionState === 'string' &&
      record.snapshotRevisionState.length > 0) ||
    (typeof record?.snapshotResumeToken === 'string' &&
      record.snapshotResumeToken.length > 0)
  );
}

function buildSnapshotRevisionObservation(record) {
  const source = record ?? {};
  return {
    nodeId: String(source.nodeId || VALUE_UNKNOWN),
    observationSource: String(source.observationSource || VALUE_UNKNOWN),
    ...buildConsistencyRevisionFields(source),
  };
}

function isSnapshotRevisionObservationLagging(
  observation,
) {
  const hasPositiveRevisionGap =
    Number.isInteger(observation?.snapshotRevisionGap) &&
    observation.snapshotRevisionGap > NO_RECOVERY_BLOCKER_COUNT;
  const isBehindExpectedMinimum =
    Number.isInteger(observation?.snapshotRevision) &&
    Number.isInteger(observation?.snapshotExpectedMinimumRevision) &&
    observation.snapshotRevision < observation.snapshotExpectedMinimumRevision;
  return (
    hasPositiveRevisionGap ||
    isBehindExpectedMinimum
  );
}

function buildSnapshotRevisionBarrier(records) {
  const observations = (Array.isArray(records) ? records : [])
    .filter(hasSnapshotRevisionEvidence)
    .map(buildSnapshotRevisionObservation);
  if (observations.length === EMPTY_LIST_LENGTH) {
    return {
      state: CONSISTENCY_REVISION_BARRIER_STATE_UNAVAILABLE,
      ready: null,
      maxSnapshotRevision: null,
      laggingNodeIds: [],
      observationsByNodeId: {},
    };
  }
  const knownRevisions = observations
    .map((observation) => observation.snapshotRevision)
    .filter(Number.isInteger);
  const maxSnapshotRevision =
    knownRevisions.length > EMPTY_LIST_LENGTH ?
      Math.max(...knownRevisions) :
      null;
  const laggingObservations = observations.filter((observation) =>
    isSnapshotRevisionObservationLagging(observation),
  );
  return {
    state:
      laggingObservations.length > EMPTY_LIST_LENGTH ?
        CONSISTENCY_REVISION_BARRIER_STATE_LAGGING :
        CONSISTENCY_REVISION_BARRIER_STATE_READY,
    ready: laggingObservations.length === EMPTY_LIST_LENGTH,
    maxSnapshotRevision,
    laggingNodeIds: laggingObservations
      .map((observation) => observation.nodeId)
      .sort(),
    observationsByNodeId: Object.fromEntries(
      observations
        .map((observation) => [observation.nodeId, observation])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function buildSnapshotRevisionLagMessage(revisionBarrier) {
  const laggingNodeIds = Array.isArray(revisionBarrier?.laggingNodeIds) ?
    revisionBarrier.laggingNodeIds :
    [];
  return (
    'Observer snapshot revisions lag for final consistency. Lagging nodes: ' +
    JSON.stringify(laggingNodeIds) +
    '. Max snapshot revision: ' +
    String(revisionBarrier?.maxSnapshotRevision ?? VALUE_UNKNOWN)
  );
}

function buildSnapshotRevisionLagMismatch(records, leaderMismatch) {
  const revisionBarrier = buildSnapshotRevisionBarrier(records);
  if (revisionBarrier.ready !== false) {
    return null;
  }
  const referenceNodeId =
    leaderMismatch?.referenceNodeId ||
    revisionBarrier.laggingNodeIds[0] ||
    VALUE_UNKNOWN;
  const otherNodeId =
    leaderMismatch?.otherNodeId ||
    revisionBarrier.laggingNodeIds.find((nodeId) => nodeId !== referenceNodeId);
  return buildConsistencyMismatch(
    buildSnapshotRevisionLagMessage(revisionBarrier),
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG,
    referenceNodeId,
    otherNodeId || VALUE_UNKNOWN,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVER_REVISION_LAG,
      observedMismatchReasonCode: leaderMismatch?.reasonCode || null,
      revisionBarrier,
    },
  );
}

function isRepairDeferredStaleObservation(record) {
  return (
    record?.observationMode ===
      ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED &&
    record?.snapshotRevisionState ===
      CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE
  );
}

function buildRepairDeferredNodeObservation(record) {
  const source = record ?? {};
  return {
    observationMode: String(
      source.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    snapshotRevisionState: normalizeNonEmptyConsistencyString(
      source.snapshotRevisionState,
    ),
    snapshotRevision: normalizeConsistencyInteger(source.snapshotRevision),
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      source.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      source.snapshotRevisionGap,
    ),
    controlSnapshotError: normalizeNonEmptyConsistencyString(
      source.controlSnapshotError,
    ),
  };
}

function buildRepairDeferredObservationSummary(records) {
  const summaryByNodeId = {};
  for (const record of Array.isArray(records) ? records : []) {
    const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
    summaryByNodeId[nodeId] = buildRepairDeferredNodeObservation(record);
  }
  return sortObjectKeys(summaryByNodeId);
}

function buildRepairDeferredMismatch(records) {
  const deferredRecords = (Array.isArray(records) ? records : []).filter(
    isRepairDeferredStaleObservation,
  );
  const referenceNodeId =
    deferredRecords[EMPTY_LIST_LENGTH]?.nodeId ||
    records?.[EMPTY_LIST_LENGTH]?.nodeId ||
    VALUE_UNKNOWN;
  const otherNodeId =
    deferredRecords[CONSISTENCY_SINGLE_REASON_COUNT]?.nodeId ||
    referenceNodeId;
  return buildConsistencyMismatch(
    'Observer snapshot repair is deferred for final consistency. ' +
      'Deferred nodes: ' +
      JSON.stringify(
        deferredRecords.map((record) => record.nodeId).sort(),
      ),
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
    referenceNodeId,
    otherNodeId,
    {
      state: CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED,
      repairDeferredObservationsByNodeId:
        buildRepairDeferredObservationSummary(records),
    },
  );
}

function resolveFinalLeaderComparisonRecords(records) {
  const allRecords = Array.isArray(records) ? records : [];
  const comparableRecords = allRecords.filter(
    (record) => !isRepairDeferredStaleObservation(record),
  );
  const deferredRecords = allRecords.filter(isRepairDeferredStaleObservation);
  if (
    comparableRecords.length === EMPTY_LIST_LENGTH &&
    deferredRecords.length > EMPTY_LIST_LENGTH
  ) {
    return {
      records: comparableRecords,
      mismatch: buildRepairDeferredMismatch(allRecords),
    };
  }
  if (
    comparableRecords.length > EMPTY_LIST_LENGTH &&
    deferredRecords.length > EMPTY_LIST_LENGTH
  ) {
    return {
      records: comparableRecords,
      mismatch: null,
    };
  }
  return {
    records: allRecords,
    mismatch: null,
  };
}

function getRecordAuthorityCertificate(record, partitionId) {
  const authority = normalizePartitionLeaderAuthority(
    record?.partitionLeaderAuthority,
  );
  return authority[partitionId] || null;
}

function buildAuthorityEvidenceByPartitionId(records, partitionIds) {
  const evidenceByPartitionId = {};
  for (const partitionId of Array.isArray(partitionIds) ? partitionIds : []) {
    const evidenceByNodeId = {};
    for (const record of Array.isArray(records) ? records : []) {
      const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
      const certificate = getRecordAuthorityCertificate(record, partitionId);
      if (!certificate) {
        continue;
      }
      evidenceByNodeId[nodeId] = certificate;
    }
    if (Object.keys(evidenceByNodeId).length > EMPTY_LIST_LENGTH) {
      evidenceByPartitionId[partitionId] = sortObjectKeys(evidenceByNodeId);
    }
  }
  return evidenceByPartitionId;
}

function buildAuthorityEpochKey(certificate) {
  const topologyEpoch = Number.isInteger(
    certificate?.[PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH],
  ) ?
    certificate[PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH] :
    VALUE_UNKNOWN;
  const membershipEpoch = Number.isInteger(
    certificate?.[PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH],
  ) ?
    certificate[PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH] :
    VALUE_UNKNOWN;
  return String(topologyEpoch) + ':' + String(membershipEpoch);
}

function isStaleUsableAuthorityRecord(record) {
  return record?.snapshotRevisionState ===
    CONTROL_PLANE_SNAPSHOT_REVISION_STATE.STALE_USABLE;
}

function buildRecordsByNodeId(records) {
  const recordsByNodeId = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
    recordsByNodeId.set(nodeId, record);
  }
  return recordsByNodeId;
}

function findSameEpochAuthorityLeaderDivergence(
  evidenceEntries,
  recordsByNodeId,
) {
  const cohortsByEpochKey = new Map();
  for (const [nodeId, certificate] of evidenceEntries) {
    const epochKey = buildAuthorityEpochKey(certificate);
    const cohort = cohortsByEpochKey.get(epochKey) || [];
    cohort.push({nodeId, certificate});
    cohortsByEpochKey.set(epochKey, cohort);
  }
  for (const cohort of cohortsByEpochKey.values()) {
    if (cohort.length < CONSISTENCY_SINGLE_REASON_COUNT + 1) {
      continue;
    }
    if (
      cohort.some((entry) =>
        isStaleUsableAuthorityRecord(recordsByNodeId.get(entry.nodeId)),
      )
    ) {
      continue;
    }
    const authorityLeaderIds = [
      ...new Set(
        cohort.map((entry) => entry.certificate.leaderNodeId),
      ),
    ];
    if (authorityLeaderIds.length > CONSISTENCY_SINGLE_REASON_COUNT) {
      return {
        authorityLeaderIds,
        evidenceEntries: cohort,
      };
    }
  }
  return null;
}

function buildAuthorityMismatchMessage({
  reasonCode,
  partitionId,
  authorityEvidenceByPartitionId,
}) {
  return (
    'Partition leader authority mismatch for ' +
    partitionId +
    ' (' +
    reasonCode +
    '): ' +
    JSON.stringify(authorityEvidenceByPartitionId?.[partitionId] || {})
  );
}

function evaluatePartitionAuthorityMismatch({
  partitionId,
  authorityEvidenceByPartitionId,
  recordsByNodeId,
  leaderMismatch,
}) {
  const evidenceEntries = Object.entries(
    authorityEvidenceByPartitionId[partitionId] || {},
  );
  if (evidenceEntries.length < CONSISTENCY_SINGLE_REASON_COUNT + 1) {
    return null;
  }
  const certificates = arrayMap(
    evidenceEntries,
    ([, certificate]) => certificate,
  );
  const authorityLeaderIds = [
    ...new Set(
      arrayMap(certificates, (certificate) => certificate.leaderNodeId),
    ),
  ];
  const sameEpochAuthorityLeaderDivergence =
    findSameEpochAuthorityLeaderDivergence(
      evidenceEntries,
      recordsByNodeId,
    );
  const reasonCode =
    sameEpochAuthorityLeaderDivergence ?
      CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED :
      CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG;
  const authorityDetails =
    authorityLeaderIds.length === CONSISTENCY_SINGLE_REASON_COUNT ?
      {authoritativeLeaderId: authorityLeaderIds[0]} :
      {};
  if (
    reasonCode !== CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG &&
    authorityLeaderIds.length <= CONSISTENCY_SINGLE_REASON_COUNT
  ) {
    return null;
  }
  const [referenceNodeId, otherNodeId] = arrayMap(
    evidenceEntries,
    ([nodeId]) => nodeId,
  );
  return buildConsistencyMismatch(
    buildAuthorityMismatchMessage({
      reasonCode,
      partitionId,
      authorityEvidenceByPartitionId,
    }),
    reasonCode,
    referenceNodeId,
    otherNodeId,
    {
      state:
        reasonCode ===
        CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED ?
          CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED :
          CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
      observedMismatchReasonCode: leaderMismatch?.reasonCode || null,
      differingPartitionIds: [partitionId],
      authorityEvidenceByPartitionId,
      ...authorityDetails,
    },
  );
}

function buildAuthorityBackedLeaderMismatch(records, leaderMismatch) {
  const recordsByNodeId = buildRecordsByNodeId(records);
  const allRecords = Array.isArray(records) ? records : [];
  const referenceRecord = allRecords.find(
    (record) => record?.nodeId === leaderMismatch?.referenceNodeId,
  );
  const otherRecord = allRecords.find(
    (record) => record?.nodeId === leaderMismatch?.otherNodeId,
  );
  const differingPartitionIds = buildDifferingLeaderPartitionIds(
    referenceRecord,
    otherRecord,
  );
  const authorityEvidenceByPartitionId = buildAuthorityEvidenceByPartitionId(
    records,
    differingPartitionIds,
  );
  for (const partitionId of differingPartitionIds) {
    const mismatch = evaluatePartitionAuthorityMismatch({
      partitionId,
      authorityEvidenceByPartitionId,
      recordsByNodeId,
      leaderMismatch,
    });
    if (mismatch) {
      return mismatch;
    }
  }
  return null;
}

export function buildConsistencyMismatch(
  message,
  reasonCode,
  referenceNodeId,
  otherNodeId,
  details = {},
) {
  return {
    message,
    reasonCode,
    referenceNodeId,
    otherNodeId,
    ...details,
  };
}

function normalizeConsistencyMismatchOptions(options = {}) {
  return {
    tolerateEmptyLeaders: options.tolerateEmptyLeaders === true,
    tolerateActiveNodeSkew: options.tolerateActiveNodeSkew === true,
    maxActiveNodeSkew: Number.isFinite(options.maxActiveNodeSkew) ?
      Math.max(0, Math.floor(options.maxActiveNodeSkew)) :
      1,
    toleratePartitionSkew: options.toleratePartitionSkew === true,
    maxPartitionSkew: Number.isFinite(options.maxPartitionSkew) ?
      Math.max(0, Math.floor(options.maxPartitionSkew)) :
      2,
  };
}

function compareNodeActiveNodes({
  reference,
  other,
  refActiveStr,
  refHasAuthoritativeActiveNodes,
  refAuthoritativeActiveStr,
  normalizedOptions,
}) {
  const otherHasAuthoritativeActiveNodes = Array.isArray(
    other.authoritativeActiveNodes,
  );
  if (refHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes) {
    const otherAuthoritativeActiveStr = JSON.stringify(
      other.authoritativeActiveNodes,
    );
    if (otherAuthoritativeActiveStr !== refAuthoritativeActiveStr) {
      return buildConsistencyMismatch(
        'Published active-node sets disagree between ' +
          reference.nodeId +
          ' and ' +
          other.nodeId +
          '. ' +
          reference.nodeId +
          ': ' +
          refAuthoritativeActiveStr +
          '. ' +
          other.nodeId +
          ': ' +
          otherAuthoritativeActiveStr,
        CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE,
        reference.nodeId,
        other.nodeId,
      );
    }
    return {matched: true, skipPartitions: false};
  }
  const otherActiveStr = JSON.stringify(other.activeNodes);
  if (otherActiveStr === refActiveStr) {
    return {matched: true, skipPartitions: false};
  }
  if (
    normalizedOptions.tolerateActiveNodeSkew &&
    isTolerableActiveNodeSkew(
      reference.activeNodes,
      other.activeNodes,
      normalizedOptions.maxActiveNodeSkew,
    )
  ) {
    return {matched: true, skipPartitions: true};
  }
  return buildConsistencyMismatch(
    'Active nodes disagree between ' +
      reference.nodeId +
      ' and ' +
      other.nodeId +
      '. ' +
      reference.nodeId +
      ': ' +
      refActiveStr +
      '. ' +
      other.nodeId +
      ': ' +
      otherActiveStr,
    CONSISTENCY_REASON_CODE_ACTIVE_NODES_DISAGREE,
    reference.nodeId,
    other.nodeId,
  );
}

function compareNodePartitions({
  reference,
  other,
  refPartStr,
  normalizedOptions,
}) {
  const otherPartStr = JSON.stringify(other.partitions);
  if (otherPartStr === refPartStr) {
    return null;
  }
  if (
    normalizedOptions.toleratePartitionSkew &&
    isTolerablePartitionSkew(
      reference.partitions,
      other.partitions,
      normalizedOptions.maxPartitionSkew,
    )
  ) {
    return null;
  }
  return buildConsistencyMismatch(
    'Partition assignments disagree between ' +
      reference.nodeId +
      ' and ' +
      other.nodeId +
      '. ' +
      reference.nodeId +
      ': ' +
      refPartStr +
      '. ' +
      other.nodeId +
      ': ' +
      otherPartStr,
    CONSISTENCY_REASON_CODE_PARTITION_ASSIGNMENTS_DISAGREE,
    reference.nodeId,
    other.nodeId,
  );
}

function findActiveAndPartitionConsistencyMismatch(
  records,
  normalizedOptions,
) {
  const reference = records[0];
  const refActiveStr = JSON.stringify(reference.activeNodes);
  const refHasAuthoritativeActiveNodes = Array.isArray(
    reference.authoritativeActiveNodes,
  );
  const refAuthoritativeActiveStr = refHasAuthoritativeActiveNodes ?
    JSON.stringify(reference.authoritativeActiveNodes) :
    null;
  const refPartStr = JSON.stringify(reference.partitions);

  for (let i = 1; i < records.length; i++) {
    const other = records[i];
    const activeComparison = compareNodeActiveNodes({
      reference,
      other,
      refActiveStr,
      refHasAuthoritativeActiveNodes,
      refAuthoritativeActiveStr,
      normalizedOptions,
    });
    if (!activeComparison.matched) {
      return activeComparison;
    }
    if (activeComparison.skipPartitions) {
      continue;
    }
    const partitionMismatch = compareNodePartitions({
      reference,
      other,
      refPartStr,
      normalizedOptions,
    });
    if (partitionMismatch) {
      return partitionMismatch;
    }
  }
  return null;
}

function buildPublicationRecoveryGateMismatch(
  records,
  reference,
  publicationScopedLeaderComparison,
) {
  const blockedRecords = publicationScopedLeaderComparison.blockedRecords;
  const otherNodeId =
    blockedRecords.length > 0 ?
      blockedRecords[0].nodeId :
      records.length > 1 ?
        records[1].nodeId :
        reference.nodeId;
  return buildConsistencyMismatch(
    buildPublicationRecoveryGateNotReadyMessage(records),
    CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY,
    reference.nodeId,
    otherNodeId,
  );
}

function compareAuthoritativePublicationMetadata({
  leaderReference,
  other,
  refPublicationEpoch,
  refPublishedActiveStr,
}) {
  const otherPublicationEpoch = normalizeOptionalConsistencyInteger(
    other.publicationEpoch,
  );
  if (otherPublicationEpoch !== refPublicationEpoch) {
    return buildConsistencyMismatch(
      'Publication epochs disagree between ' +
        leaderReference.nodeId +
        ' and ' +
        other.nodeId +
        '. ' +
        leaderReference.nodeId +
        ': ' +
        String(refPublicationEpoch) +
        '. ' +
        other.nodeId +
        ': ' +
        String(otherPublicationEpoch),
      CONSISTENCY_REASON_CODE_PUBLICATION_EPOCHS_DISAGREE,
      leaderReference.nodeId,
      other.nodeId,
    );
  }
  const otherPublishedActiveStr = JSON.stringify(
    Array.isArray(other.publishedActiveNodeIds) ?
      other.publishedActiveNodeIds :
      [],
  );
  if (otherPublishedActiveStr !== refPublishedActiveStr) {
    return buildConsistencyMismatch(
      'Published active-node sets disagree between ' +
        leaderReference.nodeId +
        ' and ' +
        other.nodeId +
        '. ' +
        leaderReference.nodeId +
        ': ' +
        refPublishedActiveStr +
        '. ' +
        other.nodeId +
        ': ' +
        otherPublishedActiveStr,
      CONSISTENCY_REASON_CODE_PUBLISHED_ACTIVE_NODES_DISAGREE,
      leaderReference.nodeId,
      other.nodeId,
    );
  }
  return null;
}

function compareLeaderComparisonRecord({
  leaderComparisonRecords,
  leaderReference,
  other,
  leaderRefHasAuthoritativeActiveNodes,
  refLeaders,
  refLeaderStr,
  refPublicationEpoch,
  refPublishedActiveStr,
  tolerateEmptyLeaders,
}) {
  const canCompareAuthoritativeActiveNodes =
    leaderRefHasAuthoritativeActiveNodes &&
    Array.isArray(other.authoritativeActiveNodes);
  if (canCompareAuthoritativeActiveNodes) {
    const publicationMismatch = compareAuthoritativePublicationMetadata({
      leaderReference,
      other,
      refPublicationEpoch,
      refPublishedActiveStr,
    });
    if (publicationMismatch) {
      return publicationMismatch;
    }
  }
  const otherLeaders = other.leaders;
  const otherLeaderStr = JSON.stringify(otherLeaders);
  if (otherLeaderStr === refLeaderStr) {
    return null;
  }
  if (
    tolerateEmptyLeaders &&
    !hasConflictingLeaders(refLeaders, otherLeaders)
  ) {
    return null;
  }
  const leaderMismatch = buildConsistencyMismatch(
    'Leader identities disagree between ' +
      leaderReference.nodeId +
      ' and ' +
      other.nodeId +
      '. ' +
      leaderReference.nodeId +
      ': ' +
      refLeaderStr +
      '. ' +
      other.nodeId +
      ': ' +
      otherLeaderStr,
    CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE,
    leaderReference.nodeId,
    other.nodeId,
  );
  return (
    buildSnapshotRevisionLagMismatch(
      leaderComparisonRecords,
      leaderMismatch,
    ) ||
    buildAuthorityBackedLeaderMismatch(
      leaderComparisonRecords,
      leaderMismatch,
    ) ||
    leaderMismatch
  );
}

function findLeaderCohortConsistencyMismatch(
  leaderComparisonRecords,
  normalizedOptions,
) {
  const leaderReference = leaderComparisonRecords[EMPTY_LIST_LENGTH];
  const leaderRefHasAuthoritativeActiveNodes = Array.isArray(
    leaderReference.authoritativeActiveNodes,
  );
  const refLeaders = leaderReference.leaders;
  const refLeaderStr = JSON.stringify(refLeaders);
  const refPublicationEpoch = normalizeOptionalConsistencyInteger(
    leaderReference.publicationEpoch,
  );
  const refPublishedActiveStr = JSON.stringify(
    Array.isArray(leaderReference.publishedActiveNodeIds) ?
      leaderReference.publishedActiveNodeIds :
      [],
  );

  for (
    let i = CONSISTENCY_SINGLE_REASON_COUNT;
    i < leaderComparisonRecords.length;
    i++
  ) {
    const mismatch = compareLeaderComparisonRecord({
      leaderComparisonRecords,
      leaderReference,
      other: leaderComparisonRecords[i],
      leaderRefHasAuthoritativeActiveNodes,
      refLeaders,
      refLeaderStr,
      refPublicationEpoch,
      refPublishedActiveStr,
      tolerateEmptyLeaders: normalizedOptions.tolerateEmptyLeaders,
    });
    if (mismatch) {
      return mismatch;
    }
  }
  return null;
}

export function findConsistencyMismatch(records, options = {}) {
  if (!Array.isArray(records) || records.length < 2) {
    return null;
  }
  const normalizedOptions = normalizeConsistencyMismatchOptions(options);
  const publicationScopedLeaderComparison =
    resolvePublicationScopedLeaderComparison(records);
  const activeOrPartitionMismatch = findActiveAndPartitionConsistencyMismatch(
    records,
    normalizedOptions,
  );
  if (activeOrPartitionMismatch) {
    return activeOrPartitionMismatch;
  }
  if (publicationScopedLeaderComparison.ready !== true) {
    return buildPublicationRecoveryGateMismatch(
      records,
      records[0],
      publicationScopedLeaderComparison,
    );
  }
  const finalLeaderComparison =
    resolveFinalLeaderComparisonRecords(records);
  if (finalLeaderComparison.mismatch) {
    return finalLeaderComparison.mismatch;
  }
  const leaderComparisonRecords = finalLeaderComparison.records;
  if (
    leaderComparisonRecords.length <
    CONSISTENCY_OBSERVATION_COHORT_MINIMUM_COMPARABLE_COUNT
  ) {
    return null;
  }
  return findLeaderCohortConsistencyMismatch(
    leaderComparisonRecords,
    normalizedOptions,
  );
}

function buildSingleNodeConsistencyState(state) {
  const source = state ?? {};
  return {
    activeNodes: normalizeSortedConsistencyArray(source.activeNodes, []),
    authoritativeActiveNodes: normalizeSortedConsistencyArray(
      source.authoritativeActiveNodes,
      null,
    ),
    partitions: normalizeSortedConsistencyArray(source.partitions, []),
    publicationEpoch: normalizeOptionalConsistencyInteger(
      source.publicationEpoch,
    ),
    sourceSnapshotVersion: normalizeOptionalConsistencyInteger(
      source.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeOptionalConsistencyInteger(
      source.snapshotRevision,
    ),
    snapshotRevisionState: normalizeNonEmptyConsistencyString(
      source.snapshotRevisionState,
    ),
    snapshotExpectedMinimumRevision: normalizeOptionalConsistencyInteger(
      source.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeOptionalConsistencyInteger(
      source.snapshotRevisionGap,
    ),
    snapshotResumeToken: normalizeNonEmptyConsistencyString(
      source.snapshotResumeToken,
    ),
    publishedActiveNodeIds: normalizeSortedConsistencyArray(
      source.publishedActiveNodeIds,
      [],
    ),
    leaders:
      source.leaders && typeof source.leaders === 'object' ?
        sortObjectKeys(source.leaders) :
        {},
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      source.partitionLeaderAuthority,
    ),
    observationSource: String(source.observationSource || VALUE_UNKNOWN),
    observationMode: String(
      source.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    controlSnapshotError: normalizeNonEmptyConsistencyString(
      source.controlSnapshotError,
    ),
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      source.controlPlaneDiagnostics,
    ),
  };
}

export function buildConsistencyStateByNodeId(nodeStates) {
  const stateByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    stateByNodeId[nodeId] = buildSingleNodeConsistencyState(state);
  }
  return stateByNodeId;
}

function findConsistencyStateByNodeId(nodeStates, nodeId) {
  const normalizedNodeId = String(nodeId || '');
  return (Array.isArray(nodeStates) ? nodeStates : []).find(
    (state) => String(state?.nodeId || '') === normalizedNodeId,
  ) || null;
}

function buildDifferingLeaderPartitionIds(referenceState, otherState) {
  const referenceLeaders =
    referenceState?.leaders && typeof referenceState.leaders === 'object' ?
      referenceState.leaders :
      {};
  const otherLeaders =
    otherState?.leaders && typeof otherState.leaders === 'object' ?
      otherState.leaders :
      {};
  return Array.from(
    new Set([...Object.keys(referenceLeaders), ...Object.keys(otherLeaders)]),
  )
    .filter((partitionId) => {
      const referenceLeader = String(referenceLeaders[partitionId] || '');
      const otherLeader = String(otherLeaders[partitionId] || '');
      return referenceLeader !== otherLeader;
    })
    .sort();
}

function buildObserverPartitionLeaderEvidence(state, partitionId) {
  const source = state ?? {};
  const leaders =
    source.leaders && typeof source.leaders === 'object' ?
      normalizeLeaders(source.leaders) :
      {};
  return {
    leaderNodeId: String(leaders[partitionId] || VALUE_UNKNOWN),
    observationSource: String(source.observationSource || VALUE_UNKNOWN),
    observationMode: String(
      source.observationMode || OBSERVATION_MODE_UNKNOWN,
    ),
    publicationEpoch: normalizeConsistencyInteger(source.publicationEpoch),
    ...buildConsistencyRevisionFields(source),
  };
}

function buildLeaderEvidenceByPartitionId({
  differingPartitionIds,
  nodeStates,
}) {
  const evidenceByPartitionId = {};
  const states = Array.isArray(nodeStates) ? nodeStates : [];
  for (const partitionId of differingPartitionIds) {
    const observerEvidenceByNodeId = {};
    for (const state of states) {
      const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
      observerEvidenceByNodeId[nodeId] = buildObserverPartitionLeaderEvidence(
        state,
        partitionId,
      );
    }
    evidenceByPartitionId[partitionId] = sortObjectKeys(
      observerEvidenceByNodeId,
    );
  }
  return evidenceByPartitionId;
}

function buildObservationModesByNodeId(nodeStates) {
  const observationModesByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    observationModesByNodeId[nodeId] = String(
      state?.observationMode || OBSERVATION_MODE_UNKNOWN,
    );
  }
  return sortObjectKeys(observationModesByNodeId);
}

const FINAL_CONSISTENCY_STATE_BY_REASON_CODE = new Map([
  [
    CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED,
    CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED,
  ],
  [
    CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
    CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
  ],
  [
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
    CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED,
  ],
  [
    CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
    CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH,
  ],
  [
    CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE,
    CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH,
  ],
]);

function resolveFinalConsistencyState(mismatch) {
  const explicitState = normalizeNonEmptyConsistencyString(mismatch?.state);
  if (explicitState) {
    return explicitState;
  }
  return (
    FINAL_CONSISTENCY_STATE_BY_REASON_CODE.get(mismatch?.reasonCode) ||
    CONSISTENCY_FINAL_STATE_MISMATCH
  );
}

function isLeaderEvidenceMismatch(mismatch) {
  return (
    mismatch?.reasonCode === CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE ||
    mismatch?.observedMismatchReasonCode ===
      CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE
  );
}

function resolveFinalConsistencyDifferingPartitionIds(nodeStates, mismatch) {
  if (Array.isArray(mismatch.differingPartitionIds)) {
    return mismatch.differingPartitionIds;
  }
  if (!isLeaderEvidenceMismatch(mismatch)) {
    return [];
  }
  const referenceState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.referenceNodeId,
  );
  const otherState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.otherNodeId,
  );
  return buildDifferingLeaderPartitionIds(referenceState, otherState);
}

function buildFinalConsistencyDiagnostics(nodeStates, mismatch) {
  if (!mismatch || typeof mismatch !== 'object') {
    return null;
  }
  const differingPartitionIds = resolveFinalConsistencyDifferingPartitionIds(
    nodeStates,
    mismatch,
  );
  return {
    boundary: CONSISTENCY_FINAL_BOUNDARY,
    state: resolveFinalConsistencyState(mismatch),
    reasonCode:
      normalizeNonEmptyConsistencyString(mismatch.reasonCode) ||
      CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH,
    observedMismatchReasonCode: normalizeNonEmptyConsistencyString(
      mismatch.observedMismatchReasonCode,
    ),
    referenceNodeId: String(mismatch.referenceNodeId || VALUE_UNKNOWN),
    otherNodeId: String(mismatch.otherNodeId || VALUE_UNKNOWN),
    differingPartitionIds,
    leaderEvidenceByPartitionId: buildLeaderEvidenceByPartitionId({
      differingPartitionIds,
      nodeStates,
    }),
    observationModesByNodeId: buildObservationModesByNodeId(nodeStates),
    authorityEvidenceByPartitionId:
      mismatch.authorityEvidenceByPartitionId ||
      buildAuthorityEvidenceByPartitionId(nodeStates, differingPartitionIds),
    revisionBarrier:
      mismatch.revisionBarrier || buildSnapshotRevisionBarrier(nodeStates),
  };
}

const CACHE_CONSISTENCY_REASON_CODES = new Set([
  CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG,
  CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED,
  CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE,
  CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG,
]);

function resolveConsistencyFailureAffectedNodeIds(mismatch) {
  const laggingNodeIds = Array.isArray(
    mismatch?.revisionBarrier?.laggingNodeIds,
  ) ?
    mismatch.revisionBarrier.laggingNodeIds :
    [];
  if (laggingNodeIds.length > EMPTY_LIST_LENGTH) {
    return laggingNodeIds;
  }
  return [
    String(mismatch?.referenceNodeId || VALUE_UNKNOWN),
    String(mismatch?.otherNodeId || VALUE_UNKNOWN),
  ];
}

function buildConsistencyFailureDiagnostics(mismatch) {
  const reasonCode =
    normalizeNonEmptyConsistencyString(mismatch?.reasonCode) ||
    CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH;
  return {
    rootCauseClass: CACHE_CONSISTENCY_REASON_CODES.has(reasonCode) ?
      CONSISTENCY_ROOT_CAUSE_CLASS_CACHE :
      CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY,
    dominantReason: reasonCode,
    reasonCounts: {
      [reasonCode]: CONSISTENCY_SINGLE_REASON_COUNT,
    },
    affectedNodeIds: resolveConsistencyFailureAffectedNodeIds(mismatch),
  };
}

function collectConsistencyNodeControlPlaneMaps(nodeStates) {
  const publicationConvergenceByNodeId = {};
  const snapshotDiagnosticsByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    const convergence = buildPublicationConvergenceFromState(state);
    if (convergence) {
      publicationConvergenceByNodeId[nodeId] = convergence;
    }
    const snapshotDiagnostics = cloneDiagnostics(
      state?.controlPlaneDiagnostics,
    );
    if (snapshotDiagnostics) {
      snapshotDiagnosticsByNodeId[nodeId] = snapshotDiagnostics;
    }
  }
  return {
    publicationConvergenceByNodeId,
    snapshotDiagnosticsByNodeId,
  };
}

function resolvePreferredConsistencySnapshotNodeId(nodeStates, mismatch) {
  if (mismatch?.referenceNodeId) {
    return String(mismatch.referenceNodeId);
  }
  const firstNodeId =
    Array.isArray(nodeStates) && nodeStates.length > 0 ?
      nodeStates[0]?.nodeId :
      null;
  return String(firstNodeId || VALUE_UNKNOWN);
}

export function buildConsistencyControlPlaneDiagnostics(nodeStates, mismatch) {
  const {
    publicationConvergenceByNodeId,
    snapshotDiagnosticsByNodeId,
  } = collectConsistencyNodeControlPlaneMaps(nodeStates);

  const hasMismatch = Boolean(mismatch) && typeof mismatch === 'object';
  if (
    Object.keys(publicationConvergenceByNodeId).length === 0 &&
    Object.keys(snapshotDiagnosticsByNodeId).length === 0 &&
    hasMismatch !== true
  ) {
    return null;
  }

  const preferredSnapshotNodeId = resolvePreferredConsistencySnapshotNodeId(
    nodeStates,
    mismatch,
  );
  const publicationConvergence =
    publicationConvergenceByNodeId[preferredSnapshotNodeId] ||
    Object.values(publicationConvergenceByNodeId)[0] ||
    null;

  return {
    snapshotNodeId: preferredSnapshotNodeId,
    publicationConvergence,
    publicationConvergenceByNodeId,
    mismatch: {
      ...(hasMismatch ? mismatch : {}),
      observedAt: new Date().toISOString(),
    },
    finalConsistency: buildFinalConsistencyDiagnostics(nodeStates, mismatch),
    consistencyStateByNodeId: buildConsistencyStateByNodeId(nodeStates),
    snapshotDiagnosticsByNodeId,
  };
}

export function createConsistencyMismatchError(message, options = {}) {
  const error = new Error(message);
  const controlPlaneDiagnostics = buildConsistencyControlPlaneDiagnostics(
    options.nodeStates,
    options.mismatch,
  );
  if (!controlPlaneDiagnostics) {
    return error;
  }
  error.diagnostics = {
    ...(error?.diagnostics && typeof error.diagnostics === 'object' ?
      error.diagnostics :
      {}),
    failure: buildConsistencyFailureDiagnostics(options.mismatch),
    controlPlaneDiagnostics,
  };
  return error;
}

export {sortObjectKeys};
