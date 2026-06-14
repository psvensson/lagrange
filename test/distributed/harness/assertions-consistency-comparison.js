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
  PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION,
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

export function buildConsistencyComparisonRecordFromState(state) {
  const controlPlaneDiagnostics = cloneDiagnostics(state?.controlPlaneDiagnostics);
  return {
    nodeId: String(state?.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(state?.activeNodes) || [],
    authoritativeActiveNodes: normalizeConsistencyNodeIdList(
      state?.authoritativeActiveNodes,
    ),
    partitions: normalizeConsistencyStringList(state?.partitions),
    leaders: sortObjectKeys(normalizeLeaders(state?.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      state?.partitionLeaderAuthority,
    ),
    publicationEpoch: Number.isInteger(state?.publicationEpoch) ?
      state.publicationEpoch :
      null,
    sourceSnapshotVersion: normalizeConsistencyInteger(
      state?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(state?.snapshotRevision),
    snapshotRevisionState:
      typeof state?.snapshotRevisionState === 'string' &&
      state.snapshotRevisionState.length > 0 ?
        state.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      state?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      state?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof state?.snapshotResumeToken === 'string' &&
      state.snapshotResumeToken.length > 0 ?
        state.snapshotResumeToken :
        null,
    publishedActiveNodeIds:
      normalizeConsistencyNodeIdList(state?.publishedActiveNodeIds),
    observationSource: String(state?.observationSource || VALUE_UNKNOWN),
    observationMode: String(state?.observationMode || OBSERVATION_MODE_UNKNOWN),
    controlPlaneDiagnostics,
    publicationRecoveryGate: extractPublicationRecoveryGateContract(
      controlPlaneDiagnostics,
    ),
  };
}

export function buildConsistencyComparisonRecordFromSnapshot(snapshot) {
  const publishedActiveNodeIdsSet = extractControlSnapshotPublishedNodeIds(
    snapshot,
  );
  const controlPlaneDiagnostics = cloneDiagnostics(
    snapshot?.controlPlaneDiagnostics,
  );
  return {
    nodeId: String(snapshot?.nodeId || VALUE_UNKNOWN),
    activeNodes: normalizeConsistencyNodeIdList(snapshot?.nodes) || [],
    authoritativeActiveNodes:
      publishedActiveNodeIdsSet instanceof Set ?
        normalizeConsistencyNodeIdList(Array.from(publishedActiveNodeIdsSet)) :
        null,
    partitions: normalizeConsistencyStringList(snapshot?.partitions),
    leaders: sortObjectKeys(normalizeLeaders(snapshot?.leaders || {})),
    partitionLeaderAuthority: normalizePartitionLeaderAuthority(
      snapshot?.partitionLeaderAuthority,
    ),
    publicationEpoch: Number.isInteger(
      snapshot?.controlPlaneDiagnostics?.publicationConvergence
        ?.publicationEpoch,
    ) ?
      snapshot.controlPlaneDiagnostics.publicationConvergence.publicationEpoch :
      Number.isInteger(snapshot?.publicationEpoch) ?
        snapshot.publicationEpoch :
        null,
    sourceSnapshotVersion: normalizeConsistencyInteger(
      snapshot?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(snapshot?.snapshotRevision),
    snapshotRevisionState:
      typeof snapshot?.snapshotRevisionState === 'string' &&
      snapshot.snapshotRevisionState.length > 0 ?
        snapshot.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      snapshot?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      snapshot?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof snapshot?.snapshotResumeToken === 'string' &&
      snapshot.snapshotResumeToken.length > 0 ?
        snapshot.snapshotResumeToken :
        null,
    publishedActiveNodeIds: normalizeConsistencyNodeIdList(
      Array.isArray(
        snapshot?.controlPlaneDiagnostics?.publicationConvergence
          ?.publishedActiveNodeIds,
      ) ?
        snapshot.controlPlaneDiagnostics.publicationConvergence
          .publishedActiveNodeIds :
        Array.isArray(snapshot?.publishedActiveNodeIds) ?
          snapshot.publishedActiveNodeIds :
          Array.isArray(snapshot?.publishedNodes) ?
            snapshot.publishedNodes :
            null,
    ),
    observationSource: OBSERVATION_SOURCE_CONTROL_SNAPSHOT,
    observationMode: String(
      snapshot?.observationMode || OBSERVATION_MODE_UNKNOWN,
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
  return {
    nodeId: String(record?.nodeId || VALUE_UNKNOWN),
    observationSource: String(record?.observationSource || VALUE_UNKNOWN),
    sourceSnapshotVersion: normalizeConsistencyInteger(
      record?.sourceSnapshotVersion,
    ),
    snapshotRevision: normalizeConsistencyInteger(record?.snapshotRevision),
    snapshotRevisionState:
      typeof record?.snapshotRevisionState === 'string' &&
      record.snapshotRevisionState.length > 0 ?
        record.snapshotRevisionState :
        null,
    snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
      record?.snapshotExpectedMinimumRevision,
    ),
    snapshotRevisionGap: normalizeConsistencyInteger(
      record?.snapshotRevisionGap,
    ),
    snapshotResumeToken:
      typeof record?.snapshotResumeToken === 'string' &&
      record.snapshotResumeToken.length > 0 ?
        record.snapshotResumeToken :
        null,
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

function buildRepairDeferredObservationSummary(records) {
  const summaryByNodeId = {};
  for (const record of Array.isArray(records) ? records : []) {
    const nodeId = String(record?.nodeId || VALUE_UNKNOWN);
    summaryByNodeId[nodeId] = {
      observationMode: String(
        record?.observationMode || OBSERVATION_MODE_UNKNOWN,
      ),
      snapshotRevisionState:
        typeof record?.snapshotRevisionState === 'string' &&
        record.snapshotRevisionState.length > EMPTY_LIST_LENGTH ?
          record.snapshotRevisionState :
          null,
      snapshotRevision: normalizeConsistencyInteger(record?.snapshotRevision),
      snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
        record?.snapshotExpectedMinimumRevision,
      ),
      snapshotRevisionGap: normalizeConsistencyInteger(
        record?.snapshotRevisionGap,
      ),
      controlSnapshotError:
        typeof record?.controlSnapshotError === 'string' &&
        record.controlSnapshotError.length > EMPTY_LIST_LENGTH ?
          record.controlSnapshotError :
          null,
    };
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

function collectAuthorityEpochValues(certificates, fieldName) {
  return [
    ...new Set(
      certificates
        .map((certificate) => certificate?.[fieldName])
        .filter(Number.isInteger),
    ),
  ];
}

function hasDivergentAuthorityEpoch(certificates) {
  const topologyEpochValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_TOPOLOGY_EPOCH,
  );
  const membershipEpochValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_MEMBERSHIP_EPOCH,
  );
  const snapshotRevisionValues = collectAuthorityEpochValues(
    certificates,
    PARTITION_LEADER_AUTHORITY_FIELD_SNAPSHOT_REVISION,
  );
  return (
    topologyEpochValues.length > CONSISTENCY_SINGLE_REASON_COUNT ||
    membershipEpochValues.length > CONSISTENCY_SINGLE_REASON_COUNT ||
    snapshotRevisionValues.length > CONSISTENCY_SINGLE_REASON_COUNT
  );
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

function buildAuthorityBackedLeaderMismatch(records, leaderMismatch) {
  const referenceRecord = (Array.isArray(records) ? records : []).find(
    (record) => record?.nodeId === leaderMismatch?.referenceNodeId,
  );
  const otherRecord = (Array.isArray(records) ? records : []).find(
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
    const evidenceEntries = Object.entries(
      authorityEvidenceByPartitionId[partitionId] || {},
    );
    if (evidenceEntries.length < CONSISTENCY_SINGLE_REASON_COUNT + 1) {
      continue;
    }
    const certificates = evidenceEntries.map(([, certificate]) => certificate);
    const authorityLeaderIds = [
      ...new Set(certificates.map((certificate) => certificate.leaderNodeId)),
    ];
    const reasonCode =
      authorityLeaderIds.length > CONSISTENCY_SINGLE_REASON_COUNT &&
      !hasDivergentAuthorityEpoch(certificates) ?
        CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED :
        CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG;
    const authorityDetails =
      authorityLeaderIds.length === CONSISTENCY_SINGLE_REASON_COUNT ?
        {authoritativeLeaderId: authorityLeaderIds[0]} :
        {};
    if (
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG ||
      authorityLeaderIds.length > CONSISTENCY_SINGLE_REASON_COUNT
    ) {
      const [referenceNodeId, otherNodeId] = evidenceEntries.map(
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

export function findConsistencyMismatch(records, options = {}) {
  if (!Array.isArray(records) || records.length < 2) {
    return null;
  }
  const tolerateEmptyLeaders = options.tolerateEmptyLeaders === true;
  const tolerateActiveNodeSkew = options.tolerateActiveNodeSkew === true;
  const maxActiveNodeSkew = Number.isFinite(options.maxActiveNodeSkew) ?
    Math.max(0, Math.floor(options.maxActiveNodeSkew)) :
    1;
  const toleratePartitionSkew = options.toleratePartitionSkew === true;
  const maxPartitionSkew = Number.isFinite(options.maxPartitionSkew) ?
    Math.max(0, Math.floor(options.maxPartitionSkew)) :
    2;
  const publicationScopedLeaderComparison =
    resolvePublicationScopedLeaderComparison(records);
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
    const otherActiveStr = JSON.stringify(other.activeNodes);
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      refHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
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
    } else if (otherActiveStr !== refActiveStr) {
      if (
        tolerateActiveNodeSkew &&
        isTolerableActiveNodeSkew(
          reference.activeNodes,
          other.activeNodes,
          maxActiveNodeSkew,
        )
      ) {
        continue;
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

    const otherPartStr = JSON.stringify(other.partitions);
    if (otherPartStr !== refPartStr) {
      if (
        toleratePartitionSkew &&
        isTolerablePartitionSkew(
          reference.partitions,
          other.partitions,
          maxPartitionSkew,
        )
      ) {
        continue;
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
  }

  if (publicationScopedLeaderComparison.ready !== true) {
    const blockedRecords = publicationScopedLeaderComparison.blockedRecords;
    const otherNodeId =
      blockedRecords.length > 0 ?
        blockedRecords[0].nodeId :
        records.length > 1 ?
          records[1].nodeId :
          reference.nodeId;
    return buildConsistencyMismatch(
      buildPublicationRecoveryGateNotReadyMessage(
        records,
      ),
      CONSISTENCY_REASON_CODE_PUBLICATION_RECOVERY_GATE_NOT_READY,
      reference.nodeId,
      otherNodeId,
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
  const leaderReference = leaderComparisonRecords[EMPTY_LIST_LENGTH];
  const leaderRefHasAuthoritativeActiveNodes = Array.isArray(
    leaderReference.authoritativeActiveNodes,
  );
  const refLeaders = leaderReference.leaders;
  const refLeaderStr = JSON.stringify(refLeaders);
  const refPublicationEpoch = Number.isInteger(leaderReference.publicationEpoch) ?
    leaderReference.publicationEpoch :
    null;
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
    const other = leaderComparisonRecords[i];
    const otherHasAuthoritativeActiveNodes = Array.isArray(
      other.authoritativeActiveNodes,
    );
    const canCompareAuthoritativeActiveNodes =
      leaderRefHasAuthoritativeActiveNodes && otherHasAuthoritativeActiveNodes;

    if (canCompareAuthoritativeActiveNodes) {
      const otherPublicationEpoch = Number.isInteger(other.publicationEpoch) ?
        other.publicationEpoch :
        null;
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
    }

    const otherLeaders = other.leaders;
    const otherLeaderStr = JSON.stringify(otherLeaders);
    if (otherLeaderStr !== refLeaderStr) {
      if (
        tolerateEmptyLeaders &&
        !hasConflictingLeaders(refLeaders, otherLeaders)
      ) {
        continue;
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
  }

  return null;
}

export function buildConsistencyStateByNodeId(nodeStates) {
  const stateByNodeId = {};
  for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
    const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
    stateByNodeId[nodeId] = {
      activeNodes: Array.isArray(state?.activeNodes) ?
        [...state.activeNodes].sort() :
        [],
      authoritativeActiveNodes: Array.isArray(state?.authoritativeActiveNodes) ?
        [...state.authoritativeActiveNodes].sort() :
        null,
      partitions: Array.isArray(state?.partitions) ?
        [...state.partitions].sort() :
        [],
      publicationEpoch: Number.isInteger(state?.publicationEpoch) ?
        state.publicationEpoch :
        null,
      sourceSnapshotVersion: Number.isInteger(state?.sourceSnapshotVersion) ?
        state.sourceSnapshotVersion :
        null,
      snapshotRevision: Number.isInteger(state?.snapshotRevision) ?
        state.snapshotRevision :
        null,
      snapshotRevisionState:
        typeof state?.snapshotRevisionState === 'string' &&
        state.snapshotRevisionState.length > 0 ?
          state.snapshotRevisionState :
          null,
      snapshotExpectedMinimumRevision: Number.isInteger(
        state?.snapshotExpectedMinimumRevision,
      ) ?
        state.snapshotExpectedMinimumRevision :
        null,
      snapshotRevisionGap: Number.isInteger(state?.snapshotRevisionGap) ?
        state.snapshotRevisionGap :
        null,
      snapshotResumeToken:
        typeof state?.snapshotResumeToken === 'string' &&
        state.snapshotResumeToken.length > 0 ?
          state.snapshotResumeToken :
          null,
      publishedActiveNodeIds: Array.isArray(state?.publishedActiveNodeIds) ?
        [...state.publishedActiveNodeIds].sort() :
        [],
      leaders:
        state?.leaders && typeof state.leaders === 'object' ?
          sortObjectKeys(state.leaders) :
          {},
      partitionLeaderAuthority: normalizePartitionLeaderAuthority(
        state?.partitionLeaderAuthority,
      ),
      observationSource: String(state?.observationSource || VALUE_UNKNOWN),
      observationMode: String(
        state?.observationMode || OBSERVATION_MODE_UNKNOWN,
      ),
      controlSnapshotError:
        typeof state?.controlSnapshotError === 'string' &&
        state.controlSnapshotError.length > 0 ?
          state.controlSnapshotError :
          null,
      publicationRecoveryGate: extractPublicationRecoveryGateContract(
        state?.controlPlaneDiagnostics,
      ),
    };
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

function buildLeaderEvidenceByPartitionId({
  differingPartitionIds,
  nodeStates,
}) {
  const evidenceByPartitionId = {};
  for (const partitionId of differingPartitionIds) {
    const observerEvidenceByNodeId = {};
    for (const state of Array.isArray(nodeStates) ? nodeStates : []) {
      const nodeId = String(state?.nodeId || VALUE_UNKNOWN);
      const leaders =
        state?.leaders && typeof state.leaders === 'object' ?
          normalizeLeaders(state.leaders) :
          {};
      observerEvidenceByNodeId[nodeId] = {
        leaderNodeId: String(leaders[partitionId] || VALUE_UNKNOWN),
        observationSource: String(state?.observationSource || VALUE_UNKNOWN),
        observationMode: String(
          state?.observationMode || OBSERVATION_MODE_UNKNOWN,
        ),
        publicationEpoch: normalizeConsistencyInteger(state?.publicationEpoch),
        sourceSnapshotVersion: normalizeConsistencyInteger(
          state?.sourceSnapshotVersion,
        ),
        snapshotRevision: normalizeConsistencyInteger(state?.snapshotRevision),
        snapshotRevisionState:
          typeof state?.snapshotRevisionState === 'string' &&
          state.snapshotRevisionState.length > 0 ?
            state.snapshotRevisionState :
            null,
        snapshotExpectedMinimumRevision: normalizeConsistencyInteger(
          state?.snapshotExpectedMinimumRevision,
        ),
        snapshotRevisionGap: normalizeConsistencyInteger(
          state?.snapshotRevisionGap,
        ),
        snapshotResumeToken:
          typeof state?.snapshotResumeToken === 'string' &&
          state.snapshotResumeToken.length > 0 ?
            state.snapshotResumeToken :
            null,
      };
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

function resolveFinalConsistencyState(mismatch) {
  if (typeof mismatch?.state === 'string' && mismatch.state.length > 0) {
    return mismatch.state;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_PARTITION_LEADER_AUTHORITY_DIVERGED
  ) {
    return CONSISTENCY_FINAL_STATE_AUTHORITY_DIVERGED;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG
  ) {
    return CONSISTENCY_FINAL_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG;
  }
  if (
    mismatch?.reasonCode ===
    CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED
  ) {
    return CONSISTENCY_FINAL_STATE_OBSERVER_REPAIR_DEFERRED;
  }
  if (mismatch?.reasonCode === CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE) {
    return CONSISTENCY_FINAL_STATE_OBSERVATION_MODE_MISMATCH;
  }
  if (mismatch?.reasonCode === CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE) {
    return CONSISTENCY_FINAL_STATE_LEADER_MAP_MISMATCH;
  }
  return CONSISTENCY_FINAL_STATE_MISMATCH;
}

function isLeaderEvidenceMismatch(mismatch) {
  return (
    mismatch?.reasonCode === CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE ||
    mismatch?.observedMismatchReasonCode ===
      CONSISTENCY_REASON_CODE_LEADER_IDENTITIES_DISAGREE
  );
}

function buildFinalConsistencyDiagnostics(nodeStates, mismatch) {
  if (!mismatch || typeof mismatch !== 'object') {
    return null;
  }
  const referenceState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.referenceNodeId,
  );
  const otherState = findConsistencyStateByNodeId(
    nodeStates,
    mismatch.otherNodeId,
  );
  const differingPartitionIds =
    Array.isArray(mismatch.differingPartitionIds) ?
      mismatch.differingPartitionIds :
      isLeaderEvidenceMismatch(mismatch) ?
        buildDifferingLeaderPartitionIds(referenceState, otherState) :
        [];
  return {
    boundary: CONSISTENCY_FINAL_BOUNDARY,
    state: resolveFinalConsistencyState(mismatch),
    reasonCode:
      typeof mismatch.reasonCode === 'string' && mismatch.reasonCode.length > 0 ?
        mismatch.reasonCode :
        CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH,
    observedMismatchReasonCode:
      typeof mismatch.observedMismatchReasonCode === 'string' &&
      mismatch.observedMismatchReasonCode.length > 0 ?
        mismatch.observedMismatchReasonCode :
        null,
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

function buildConsistencyFailureDiagnostics(mismatch) {
  const reasonCode =
    typeof mismatch?.reasonCode === 'string' && mismatch.reasonCode.length > 0 ?
      mismatch.reasonCode :
      CONSISTENCY_REASON_CODE_FINAL_CONSISTENCY_MISMATCH;
  const laggingNodeIds = Array.isArray(mismatch?.revisionBarrier?.laggingNodeIds) ?
    mismatch.revisionBarrier.laggingNodeIds :
    [];
  const affectedNodeIds =
    laggingNodeIds.length > EMPTY_LIST_LENGTH ?
      laggingNodeIds :
      [
        String(mismatch?.referenceNodeId || VALUE_UNKNOWN),
        String(mismatch?.otherNodeId || VALUE_UNKNOWN),
      ];
  return {
    rootCauseClass:
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REVISION_LAG ||
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_SNAPSHOT_REPAIR_DEFERRED ||
      reasonCode === CONSISTENCY_REASON_CODE_MIXED_OBSERVATION_MODE ||
      reasonCode === CONSISTENCY_REASON_CODE_OBSERVER_AUTHORITY_VISIBILITY_LAG ?
        CONSISTENCY_ROOT_CAUSE_CLASS_CACHE :
        CONSISTENCY_ROOT_CAUSE_CLASS_TOPOLOGY,
    dominantReason: reasonCode,
    reasonCounts: {
      [reasonCode]: CONSISTENCY_SINGLE_REASON_COUNT,
    },
    affectedNodeIds,
  };
}

export function buildConsistencyControlPlaneDiagnostics(nodeStates, mismatch) {
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

  const hasMismatch = Boolean(mismatch) && typeof mismatch === 'object';
  if (
    Object.keys(publicationConvergenceByNodeId).length === 0 &&
    Object.keys(snapshotDiagnosticsByNodeId).length === 0 &&
    hasMismatch !== true
  ) {
    return null;
  }

  const preferredSnapshotNodeId = String(
    mismatch?.referenceNodeId ||
      (Array.isArray(nodeStates) && nodeStates.length > 0 ?
        nodeStates[0]?.nodeId :
        VALUE_UNKNOWN) ||
      VALUE_UNKNOWN,
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
      ...(mismatch && typeof mismatch === 'object' ? mismatch : {}),
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
