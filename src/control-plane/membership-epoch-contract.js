
const MEMBERSHIP_EPOCH_OWNER = 'topology_membership_owner';
const MEMBERSHIP_EPOCH_BOUNDARY = 'membership_epoch';

const MEMBERSHIP_EPOCH_EMPTY_TEXT = '';

const MEMBERSHIP_EPOCH_VALUE_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

const MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE = Object.freeze({
  PUBLICATION_AVAILABLE: 'publication_available',
  SOURCE_EVIDENCE_ONLY: 'source_evidence_only',
  UNKNOWN: 'unknown',
});

const MEMBERSHIP_EPOCH_FENCE_STATE = Object.freeze({
  CURRENT: 'current',
  STALE: 'stale',
  FUTURE: 'future',
  UNKNOWN: 'unknown',
});

const MEMBERSHIP_EPOCH_SOURCE_STATE = Object.freeze({
  LATEST_PUBLISHED_PUBLICATION: 'latest_published_publication',
  LATEST_PUBLICATION: 'latest_publication',
  SOURCE_EVIDENCE_ONLY: 'source_evidence_only',
  UNAVAILABLE: 'unavailable',
});

const MEMBERSHIP_EPOCH_REASON_CODE = Object.freeze({
  PUBLICATION_EPOCH_AVAILABLE: 'membership_epoch_publication_epoch_available',
  SOURCE_EVIDENCE_AVAILABLE: 'membership_epoch_source_evidence_available',
  SOURCE_EVIDENCE_UNAVAILABLE: 'membership_epoch_source_evidence_unavailable',
  SNAPSHOT_UNAVAILABLE: 'membership_epoch_snapshot_unavailable',
  OBSERVED_EPOCH_UNAVAILABLE: 'membership_epoch_observed_epoch_unavailable',
  OBSERVED_EPOCH_CURRENT: 'membership_epoch_observed_epoch_current',
  OBSERVED_EPOCH_STALE: 'membership_epoch_observed_epoch_stale',
  OBSERVED_EPOCH_FUTURE: 'membership_epoch_observed_epoch_future',
});

const MEMBERSHIP_EPOCH_ROW_FIELD = Object.freeze({
  PUBLICATION_EPOCH: 'publication_epoch',
  PUBLICATION_EPOCH_CAMEL: 'publicationEpoch',
  SOURCE_TOPOLOGY_EPOCH: 'source_topology_epoch',
  SOURCE_TOPOLOGY_EPOCH_CAMEL: 'sourceTopologyEpoch',
  SOURCE_SNAPSHOT_VERSION: 'source_snapshot_version',
  SOURCE_SNAPSHOT_VERSION_CAMEL: 'sourceSnapshotVersion',
});

function buildMembershipEpochValue(value) {
  if (
    typeof value === 'undefined' ||
    value === MEMBERSHIP_EPOCH_EMPTY_TEXT
  ) {
    return Object.freeze({
      state: MEMBERSHIP_EPOCH_VALUE_STATE.UNAVAILABLE,
      value: 0,
    });
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return Object.freeze({
      state: MEMBERSHIP_EPOCH_VALUE_STATE.UNAVAILABLE,
      value: 0,
    });
  }
  return Object.freeze({
    state: MEMBERSHIP_EPOCH_VALUE_STATE.AVAILABLE,
    value: Math.trunc(normalized),
  });
}

function isMembershipEpochValueAvailable(epochValue) {
  return epochValue?.state === MEMBERSHIP_EPOCH_VALUE_STATE.AVAILABLE;
}

function chooseMembershipEpochValue(primaryEpochValue, fallbackEpochValue) {
  return isMembershipEpochValueAvailable(primaryEpochValue) ?
    primaryEpochValue :
    fallbackEpochValue;
}

function normalizeMembershipPublicationEpochRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      publicationEpoch: buildMembershipEpochValue(),
      sourceTopologyEpoch: buildMembershipEpochValue(),
      sourceSnapshotVersion: buildMembershipEpochValue(),
    };
  }
  return {
    publicationEpoch: buildMembershipEpochValue(
      row[MEMBERSHIP_EPOCH_ROW_FIELD.PUBLICATION_EPOCH] ??
        row[MEMBERSHIP_EPOCH_ROW_FIELD.PUBLICATION_EPOCH_CAMEL],
    ),
    sourceTopologyEpoch: buildMembershipEpochValue(
      row[MEMBERSHIP_EPOCH_ROW_FIELD.SOURCE_TOPOLOGY_EPOCH] ??
        row[MEMBERSHIP_EPOCH_ROW_FIELD.SOURCE_TOPOLOGY_EPOCH_CAMEL],
    ),
    sourceSnapshotVersion: buildMembershipEpochValue(
      row[MEMBERSHIP_EPOCH_ROW_FIELD.SOURCE_SNAPSHOT_VERSION] ??
        row[MEMBERSHIP_EPOCH_ROW_FIELD.SOURCE_SNAPSHOT_VERSION_CAMEL],
    ),
  };
}

function normalizeMembershipEpochSnapshotValue(value, state) {
  if (state === MEMBERSHIP_EPOCH_VALUE_STATE.UNAVAILABLE) {
    return buildMembershipEpochValue();
  }
  return buildMembershipEpochValue(value);
}

function chooseMembershipEpochPublicationSource(options = {}) {
  const latestPublishedPublicationRow = normalizeMembershipPublicationEpochRow(
    options.latestPublishedPublicationRow,
  );
  const latestPublicationRow = normalizeMembershipPublicationEpochRow(
    options.latestPublicationRow,
  );
  const rules = Object.freeze([
    Object.freeze({
      sourceState: MEMBERSHIP_EPOCH_SOURCE_STATE.LATEST_PUBLISHED_PUBLICATION,
      row: latestPublishedPublicationRow,
      matches: isMembershipEpochValueAvailable(
        latestPublishedPublicationRow.publicationEpoch,
      ),
    }),
    Object.freeze({
      sourceState: MEMBERSHIP_EPOCH_SOURCE_STATE.LATEST_PUBLICATION,
      row: latestPublicationRow,
      matches: isMembershipEpochValueAvailable(latestPublicationRow.publicationEpoch),
    }),
    Object.freeze({
      sourceState: MEMBERSHIP_EPOCH_SOURCE_STATE.UNAVAILABLE,
      row: latestPublishedPublicationRow,
      matches: true,
    }),
  ]);
  return rules.find((rule) => rule.matches === true);
}

function buildMembershipEpochSnapshotReasonCodes(evidence) {
  return Object.freeze([
    ...(evidence.publicationEpochAvailable === true ?
      [MEMBERSHIP_EPOCH_REASON_CODE.PUBLICATION_EPOCH_AVAILABLE] :
      []),
    ...(evidence.sourceEvidenceAvailable === true ?
      [MEMBERSHIP_EPOCH_REASON_CODE.SOURCE_EVIDENCE_AVAILABLE] :
      [MEMBERSHIP_EPOCH_REASON_CODE.SOURCE_EVIDENCE_UNAVAILABLE]),
  ]);
}

function buildMembershipEpochSnapshot(options = {}) {
  const publicationSource = chooseMembershipEpochPublicationSource(options);
  const sourceTopologyEpoch = chooseMembershipEpochValue(
    buildMembershipEpochValue(options.sourceTopologyEpoch),
    publicationSource.row.sourceTopologyEpoch,
  );
  const sourceSnapshotVersion = chooseMembershipEpochValue(
    buildMembershipEpochValue(options.sourceSnapshotVersion),
    publicationSource.row.sourceSnapshotVersion,
  );
  const evidence = Object.freeze({
    publicationEpochAvailable:
      isMembershipEpochValueAvailable(publicationSource.row.publicationEpoch),
    sourceEvidenceAvailable:
      isMembershipEpochValueAvailable(sourceTopologyEpoch) ||
      isMembershipEpochValueAvailable(sourceSnapshotVersion),
  });
  const availabilityDecision = Object.freeze([
    Object.freeze({
      availabilityState:
        MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE.PUBLICATION_AVAILABLE,
      matches: evidence.publicationEpochAvailable,
    }),
    Object.freeze({
      availabilityState:
        MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE.SOURCE_EVIDENCE_ONLY,
      matches: evidence.sourceEvidenceAvailable,
    }),
    Object.freeze({
      availabilityState: MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE.UNKNOWN,
      matches: true,
    }),
  ]).find((entry) => entry.matches === true);
  return Object.freeze({
    owner: MEMBERSHIP_EPOCH_OWNER,
    boundary: MEMBERSHIP_EPOCH_BOUNDARY,
    availabilityState: availabilityDecision.availabilityState,
    sourceState:
      evidence.publicationEpochAvailable === true ?
        publicationSource.sourceState :
        evidence.sourceEvidenceAvailable === true ?
          MEMBERSHIP_EPOCH_SOURCE_STATE.SOURCE_EVIDENCE_ONLY :
          MEMBERSHIP_EPOCH_SOURCE_STATE.UNAVAILABLE,
    publicationEpochState: publicationSource.row.publicationEpoch.state,
    publicationEpoch: publicationSource.row.publicationEpoch.value,
    sourceTopologyEpochState: sourceTopologyEpoch.state,
    sourceTopologyEpoch: sourceTopologyEpoch.value,
    sourceSnapshotVersionState: sourceSnapshotVersion.state,
    sourceSnapshotVersion: sourceSnapshotVersion.value,
    reasonCodes: buildMembershipEpochSnapshotReasonCodes(evidence),
  });
}

function buildMembershipEpochFence(options = {}) {
  const membershipEpochSnapshot =
    options.membershipEpochSnapshot &&
    typeof options.membershipEpochSnapshot === 'object' ?
      options.membershipEpochSnapshot :
      buildMembershipEpochSnapshot(options);
  const snapshotPublicationEpoch = normalizeMembershipEpochSnapshotValue(
    membershipEpochSnapshot.publicationEpoch,
    membershipEpochSnapshot.publicationEpochState,
  );
  const observedPublicationEpoch = buildMembershipEpochValue(
    options.observedPublicationEpoch ?? options.publicationEpoch,
  );
  const fenceEvidence = Object.freeze({
    snapshotPublicationEpochAvailable:
      isMembershipEpochValueAvailable(snapshotPublicationEpoch),
    observedPublicationEpochAvailable:
      isMembershipEpochValueAvailable(observedPublicationEpoch),
    publicationEpochDelta:
      isMembershipEpochValueAvailable(snapshotPublicationEpoch) &&
      isMembershipEpochValueAvailable(observedPublicationEpoch) ?
        observedPublicationEpoch.value - snapshotPublicationEpoch.value :
        0,
  });
  const fenceDecision = Object.freeze([
    Object.freeze({
      state: MEMBERSHIP_EPOCH_FENCE_STATE.UNKNOWN,
      reasonCode: MEMBERSHIP_EPOCH_REASON_CODE.SNAPSHOT_UNAVAILABLE,
      matches: fenceEvidence.snapshotPublicationEpochAvailable !== true,
    }),
    Object.freeze({
      state: MEMBERSHIP_EPOCH_FENCE_STATE.UNKNOWN,
      reasonCode: MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_UNAVAILABLE,
      matches: fenceEvidence.observedPublicationEpochAvailable !== true,
    }),
    Object.freeze({
      state: MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT,
      reasonCode: MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_CURRENT,
      matches: fenceEvidence.publicationEpochDelta === 0,
    }),
    Object.freeze({
      state: MEMBERSHIP_EPOCH_FENCE_STATE.STALE,
      reasonCode: MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_STALE,
      matches: fenceEvidence.publicationEpochDelta < 0,
    }),
    Object.freeze({
      state: MEMBERSHIP_EPOCH_FENCE_STATE.FUTURE,
      reasonCode: MEMBERSHIP_EPOCH_REASON_CODE.OBSERVED_EPOCH_FUTURE,
      matches: true,
    }),
  ]).find((entry) => entry.matches === true);
  return Object.freeze({
    owner: MEMBERSHIP_EPOCH_OWNER,
    boundary: MEMBERSHIP_EPOCH_BOUNDARY,
    state: fenceDecision.state,
    current: fenceDecision.state === MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT,
    observedPublicationEpochState: observedPublicationEpoch.state,
    observedPublicationEpoch: observedPublicationEpoch.value,
    snapshotPublicationEpochState: snapshotPublicationEpoch.state,
    snapshotPublicationEpoch: snapshotPublicationEpoch.value,
    reasonCodes: Object.freeze([fenceDecision.reasonCode]),
    membershipEpochSnapshot,
  });
}

function isMembershipEpochFenceCurrent(fence) {
  return Boolean(
    fence &&
    typeof fence === 'object' &&
    fence.state === MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT,
  );
}

export {
  MEMBERSHIP_EPOCH_BOUNDARY,
  MEMBERSHIP_EPOCH_FENCE_STATE,
  MEMBERSHIP_EPOCH_OWNER,
  MEMBERSHIP_EPOCH_REASON_CODE,
  MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE,
  MEMBERSHIP_EPOCH_SOURCE_STATE,
  MEMBERSHIP_EPOCH_VALUE_STATE,
  buildMembershipEpochFence,
  buildMembershipEpochSnapshot,
  isMembershipEpochFenceCurrent,
};
