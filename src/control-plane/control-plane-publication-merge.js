import {NUM, TYPEOF} from '../constants/index.js';
import {
  normalizeControlPlanePublicationRow,
  serializeControlPlanePublicationRow,
} from './system-row-normalizers.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_PUBLICATION_EPOCH = 'publication_epoch';
const LOCAL_STR_PUBLICATIONEPOCH = 'publicationEpoch';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_PUBLISHER_NODE_ID = 'publisher_node_id';
const LOCAL_STR_PUBLISHERNODEID = 'publisherNodeId';
const LOCAL_STR_1YKL7 = 'source_topology_epoch';
const LOCAL_STR_10FMC = 'sourceTopologyEpoch';
const LOCAL_STR_1P9NT = 'source_snapshot_version';
const LOCAL_STR_AUVHV = 'sourceSnapshotVersion';
const LOCAL_STR_1W110 = 'priority_partition_summary';
const LOCAL_STR_1GZ5U = 'priorityPartitionSummary';
const LOCAL_STR_1S0NF = 'membership_lifecycle_summary';
const LOCAL_STR_N7ZDE = 'membershipLifecycleSummary';
const LOCAL_STR_REASON_CODE = 'reason_code';
const LOCAL_STR_REASONCODE = 'reasonCode';
const LOCAL_STR_TRANSITION_HISTORY = 'transition_history';
const LOCAL_STR_TRANSITIONHISTORY = 'transitionHistory';

const CONTROL_PLANE_PUBLICATION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  ACK_PENDING: 'ACK_PENDING',
  PUBLISHED: 'PUBLISHED',
  ABANDONED: 'ABANDONED',
  SUPERSEDED: 'SUPERSEDED',
});
const PUBLICATION_ROW_MERGE_MODE = Object.freeze({
  SAME_REVISION: 'same_revision',
  NEW_REVISION: 'new_revision',
});
const PUBLICATION_NODE_LIST_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
});
const PUBLICATION_NODE_LIST_FIELD_KEYS = Object.freeze({
  [PUBLICATION_NODE_LIST_FIELD.ACKNOWLEDGED_NODE_IDS]: Object.freeze([
    'acknowledged_node_ids',
    'acknowledgedNodeIds',
  ]),
  [PUBLICATION_NODE_LIST_FIELD.PUBLISHED_ACTIVE_NODE_IDS]: Object.freeze([
    'published_active_node_ids',
    'publishedActiveNodeIds',
  ]),
  [PUBLICATION_NODE_LIST_FIELD.REQUIRED_ACK_NODE_IDS]: Object.freeze([
    'required_ack_node_ids',
    'requiredAckNodeIds',
  ]),
});

function normalizePublicationNodeIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || LOCAL_STR_EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function normalizePublicationPositiveInteger(value, fallback = null) {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= NUM.ZERO) {
    return Math.trunc(normalized);
  }
  return fallback;
}

function getPublicationRowTimestamp(row) {
  return normalizePublicationPositiveInteger(
    row?.updated_at ?? row?.updatedAt,
    normalizePublicationPositiveInteger(
      row?.created_at ?? row?.createdAt,
      null,
    ),
  );
}

function arePublicationNodeListsEqual(left = [], right = []) {
  const normalizedLeft = normalizePublicationNodeIdList(left);
  const normalizedRight = normalizePublicationNodeIdList(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index],
  );
}

function doesPublicationNodeListCover(actual = [], expected = []) {
  const actualSet = new Set(normalizePublicationNodeIdList(actual));
  return normalizePublicationNodeIdList(expected).every((value) =>
    actualSet.has(value),
  );
}

function selectLatestRow(primaryRow, secondaryRow) {
  const primaryTimestamp = getPublicationRowTimestamp(primaryRow);
  const secondaryTimestamp = getPublicationRowTimestamp(secondaryRow);
  if (
    !Number.isFinite(primaryTimestamp) &&
    !Number.isFinite(secondaryTimestamp)
  ) {
    return primaryRow || secondaryRow || null;
  }
  if (!Number.isFinite(primaryTimestamp)) {
    return secondaryRow || null;
  }
  if (!Number.isFinite(secondaryTimestamp)) {
    return primaryRow || null;
  }
  return primaryTimestamp >= secondaryTimestamp ? primaryRow : secondaryRow;
}

function readPreferredPublicationField(
  latestRow,
  fallbackRow,
  snakeField,
  camelField,
) {
  const latestValue = latestRow?.[snakeField] ?? latestRow?.[camelField];
  if (latestValue !== null && typeof latestValue !== TYPEOF.UNDEFINED) {
    return latestValue;
  }
  return fallbackRow?.[snakeField] ?? fallbackRow?.[camelField] ?? null;
}

function deriveMergedPublicationStatus(
  primaryStatus,
  secondaryStatus,
  acknowledgedNodeIds,
  requiredAckNodeIds,
) {
  if (
    primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED ||
    secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED;
  }
  if (
    primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED ||
    secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED;
  }
  if (
    primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
    secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
    arePublicationNodeListsEqual(acknowledgedNodeIds, requiredAckNodeIds)
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (
    primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING ||
    secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING ||
    acknowledgedNodeIds.length > NUM.ZERO
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING;
  }
  return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
}

function deriveRevisionPublicationStatus(
  status,
  acknowledgedNodeIds,
  requiredAckNodeIds,
) {
  if (
    status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED ||
    status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED ||
    status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
  ) {
    return status;
  }
  if (arePublicationNodeListsEqual(acknowledgedNodeIds, requiredAckNodeIds)) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (
    status === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING ||
    acknowledgedNodeIds.length > NUM.ZERO
  ) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING;
  }
  return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
}

function hasExplicitPublicationNodeList(row, fieldName) {
  const fieldKeys = PUBLICATION_NODE_LIST_FIELD_KEYS[fieldName] || [];
  return fieldKeys.some((fieldKey) => Array.isArray(row?.[fieldKey]));
}

function getPublicationNodeList(row, normalizedRow, fieldName) {
  if (!hasExplicitPublicationNodeList(row, fieldName)) {
    return [];
  }
  return normalizePublicationNodeIdList(normalizedRow[fieldName]);
}

function resolvePublicationMergeMode(
  latestRow,
  fallbackRow,
  normalizedLatest,
  normalizedFallback,
) {
  const latestEpoch = normalizedLatest.publicationEpoch;
  const fallbackEpoch = normalizedFallback.publicationEpoch;
  if (
    Number.isFinite(latestEpoch) &&
    latestEpoch > NUM.ZERO &&
    Number.isFinite(fallbackEpoch) &&
    fallbackEpoch > NUM.ZERO &&
    latestEpoch !== fallbackEpoch
  ) {
    return PUBLICATION_ROW_MERGE_MODE.NEW_REVISION;
  }

  for (const fieldName of [
    PUBLICATION_NODE_LIST_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    PUBLICATION_NODE_LIST_FIELD.REQUIRED_ACK_NODE_IDS,
  ]) {
    if (
      hasExplicitPublicationNodeList(latestRow, fieldName) &&
      hasExplicitPublicationNodeList(fallbackRow, fieldName) &&
      !arePublicationNodeListsEqual(
        getPublicationNodeList(latestRow, normalizedLatest, fieldName),
        getPublicationNodeList(fallbackRow, normalizedFallback, fieldName),
      )
    ) {
      return PUBLICATION_ROW_MERGE_MODE.NEW_REVISION;
    }
  }

  return PUBLICATION_ROW_MERGE_MODE.SAME_REVISION;
}

function resolveMergedRevisionNodeIds(
  mergeMode,
  latestRow,
  fallbackRow,
  normalizedLatest,
  normalizedFallback,
  fieldName,
) {
  if (mergeMode === PUBLICATION_ROW_MERGE_MODE.NEW_REVISION) {
    if (hasExplicitPublicationNodeList(latestRow, fieldName)) {
      return getPublicationNodeList(latestRow, normalizedLatest, fieldName);
    }
    return getPublicationNodeList(fallbackRow, normalizedFallback, fieldName);
  }
  return normalizePublicationNodeIdList([
    ...normalizedLatest[fieldName],
    ...normalizedFallback[fieldName],
  ]);
}

function mergeControlPlanePublicationRows(primaryRow, secondaryRow) {
  if (!primaryRow && !secondaryRow) {
    return null;
  }
  if (!primaryRow) {
    return serializeControlPlanePublicationRow(secondaryRow);
  }
  if (!secondaryRow) {
    return serializeControlPlanePublicationRow(primaryRow);
  }
  const normalizedPrimary = normalizeControlPlanePublicationRow(primaryRow);
  const normalizedSecondary = normalizeControlPlanePublicationRow(secondaryRow);
  const latestRow = selectLatestRow(primaryRow, secondaryRow);
  const fallbackRow = latestRow === primaryRow ? secondaryRow : primaryRow;
  const normalizedLatest =
    latestRow === primaryRow ? normalizedPrimary : normalizedSecondary;
  const normalizedFallback =
    latestRow === primaryRow ? normalizedSecondary : normalizedPrimary;
  const mergeMode = resolvePublicationMergeMode(
    latestRow,
    fallbackRow,
    normalizedLatest,
    normalizedFallback,
  );
  const publishedActiveNodeIds = resolveMergedRevisionNodeIds(
    mergeMode,
    latestRow,
    fallbackRow,
    normalizedLatest,
    normalizedFallback,
    PUBLICATION_NODE_LIST_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
  );
  const requiredAckNodeIds = resolveMergedRevisionNodeIds(
    mergeMode,
    latestRow,
    fallbackRow,
    normalizedLatest,
    normalizedFallback,
    PUBLICATION_NODE_LIST_FIELD.REQUIRED_ACK_NODE_IDS,
  );
  const acknowledgedNodeIds = resolveMergedRevisionNodeIds(
    mergeMode,
    latestRow,
    fallbackRow,
    normalizedLatest,
    normalizedFallback,
    PUBLICATION_NODE_LIST_FIELD.ACKNOWLEDGED_NODE_IDS,
  );
  const status =
    mergeMode === PUBLICATION_ROW_MERGE_MODE.NEW_REVISION ?
      deriveRevisionPublicationStatus(
        normalizedLatest.status,
        acknowledgedNodeIds,
        requiredAckNodeIds,
      ) :
      deriveMergedPublicationStatus(
        normalizedPrimary.status,
        normalizedSecondary.status,
        acknowledgedNodeIds,
        requiredAckNodeIds,
      );
  const updatedAtCandidates = [
    normalizePublicationPositiveInteger(
      primaryRow?.updated_at ?? primaryRow?.updatedAt,
      null,
    ),
    normalizePublicationPositiveInteger(
      secondaryRow?.updated_at ?? secondaryRow?.updatedAt,
      null,
    ),
  ].filter((value) => Number.isFinite(value));
  const updatedAt =
    updatedAtCandidates.length > NUM.ZERO ?
      Math.max(...updatedAtCandidates) :
      null;
  const createdAtCandidates = [
    normalizePublicationPositiveInteger(
      primaryRow?.created_at ?? primaryRow?.createdAt,
      null,
    ),
    normalizePublicationPositiveInteger(
      secondaryRow?.created_at ?? secondaryRow?.createdAt,
      null,
    ),
  ].filter((value) => Number.isFinite(value));
  const createdAt =
    createdAtCandidates.length > NUM.ZERO ?
      Math.min(...createdAtCandidates) :
      null;
  const publishedAtCandidates = [
    normalizePublicationPositiveInteger(
      primaryRow?.published_at ?? primaryRow?.publishedAt,
      null,
    ),
    normalizePublicationPositiveInteger(
      secondaryRow?.published_at ?? secondaryRow?.publishedAt,
      null,
    ),
  ].filter((value) => Number.isFinite(value));
  const closedAtCandidates = [
    normalizePublicationPositiveInteger(
      primaryRow?.closed_at ?? primaryRow?.closedAt,
      null,
    ),
    normalizePublicationPositiveInteger(
      secondaryRow?.closed_at ?? secondaryRow?.closedAt,
      null,
    ),
  ].filter((value) => Number.isFinite(value));
  const publishedAt =
    status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
      publishedAtCandidates.length > NUM.ZERO ?
        Math.max(...publishedAtCandidates) :
        updatedAt :
      null;
  const closedAt =
    status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
    status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED ||
    status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED ?
      closedAtCandidates.length > NUM.ZERO ?
        Math.max(...closedAtCandidates) :
        publishedAt || updatedAt :
      null;

  return serializeControlPlanePublicationRow({
    publication_id:
      primaryRow?.publication_id ||
      primaryRow?.publicationId ||
      secondaryRow?.publication_id ||
      secondaryRow?.publicationId ||
      null,
    publication_kind:
      primaryRow?.publication_kind ||
      primaryRow?.publicationKind ||
      secondaryRow?.publication_kind ||
      secondaryRow?.publicationKind ||
      null,
    publication_epoch:
      normalizePublicationPositiveInteger(
        readPreferredPublicationField(
          latestRow,
          fallbackRow,
          LOCAL_STR_PUBLICATION_EPOCH,
          LOCAL_STR_PUBLICATIONEPOCH,
        ),
        LOCAL_NUM_ONE,
      ),
    publisher_node_id: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      LOCAL_STR_PUBLISHER_NODE_ID,
      LOCAL_STR_PUBLISHERNODEID,
    ),
    source_topology_epoch: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      LOCAL_STR_1YKL7,
      LOCAL_STR_10FMC,
    ),
    source_snapshot_version: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      LOCAL_STR_1P9NT,
      LOCAL_STR_AUVHV,
    ),
    published_active_node_ids: publishedActiveNodeIds,
    required_ack_node_ids: requiredAckNodeIds,
    acknowledged_node_ids: acknowledgedNodeIds,
    priority_partition_summary: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      LOCAL_STR_1W110,
      LOCAL_STR_1GZ5U,
    ),
    membership_lifecycle_summary: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      LOCAL_STR_1S0NF,
      LOCAL_STR_N7ZDE,
    ),
    status,
    reason_code:
      readPreferredPublicationField(
        latestRow,
        fallbackRow,
        LOCAL_STR_REASON_CODE,
        LOCAL_STR_REASONCODE,
      ) || LOCAL_STR_EMPTY,
    created_at: createdAt,
    updated_at: updatedAt,
    published_at: publishedAt,
    closed_at: closedAt,
    transition_history:
      readPreferredPublicationField(
        latestRow,
        fallbackRow,
        LOCAL_STR_TRANSITION_HISTORY,
        LOCAL_STR_TRANSITIONHISTORY,
      ) || [],
  });
}

function publicationRowSatisfiesDesiredState(actualRow, desiredRow) {
  if (!actualRow || !desiredRow) {
    return false;
  }
  const actual = normalizeControlPlanePublicationRow(actualRow);
  const desired = normalizeControlPlanePublicationRow(desiredRow);
  if (actual.publicationId !== desired.publicationId) {
    return false;
  }
  if (
    !arePublicationNodeListsEqual(
      actual.publishedActiveNodeIds,
      desired.publishedActiveNodeIds,
    )
  ) {
    return false;
  }
  if (
    !arePublicationNodeListsEqual(
      actual.requiredAckNodeIds,
      desired.requiredAckNodeIds,
    )
  ) {
    return false;
  }
  if (
    !doesPublicationNodeListCover(
      actual.acknowledgedNodeIds,
      desired.acknowledgedNodeIds,
    )
  ) {
    return false;
  }
  if (
    desired.priorityPartitionSummary &&
    JSON.stringify(actual.priorityPartitionSummary || null) !==
      JSON.stringify(desired.priorityPartitionSummary)
  ) {
    return false;
  }
  if (desired.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) {
    return actual.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (desired.status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED) {
    return actual.status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED;
  }
  if (desired.status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED) {
    return actual.status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED;
  }
  return true;
}

export {
  CONTROL_PLANE_PUBLICATION_STATUS,
  mergeControlPlanePublicationRows,
  normalizePublicationNodeIdList,
  publicationRowSatisfiesDesiredState,
};
