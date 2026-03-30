import {NUM, TYPEOF} from '../constants/index.js';
import {
  normalizeControlPlanePublicationRow,
  serializeControlPlanePublicationRow,
} from './system-row-normalizers.js';

const CONTROL_PLANE_PUBLICATION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  ACK_PENDING: 'ACK_PENDING',
  PUBLISHED: 'PUBLISHED',
  ABANDONED: 'ABANDONED',
  SUPERSEDED: 'SUPERSEDED',
});

function normalizePublicationNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > NUM.ZERO),
  )].sort();
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
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function doesPublicationNodeListCover(actual = [], expected = []) {
  const actualSet = new Set(normalizePublicationNodeIdList(actual));
  return normalizePublicationNodeIdList(expected)
    .every((value) => actualSet.has(value));
}

function selectLatestRow(primaryRow, secondaryRow) {
  const primaryTimestamp = getPublicationRowTimestamp(primaryRow);
  const secondaryTimestamp = getPublicationRowTimestamp(secondaryRow);
  if (!Number.isFinite(primaryTimestamp) && !Number.isFinite(secondaryTimestamp)) {
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

function readPreferredPublicationField(latestRow, fallbackRow, snakeField, camelField) {
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
  if (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED ||
      secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED) {
    return CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED;
  }
  if (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED ||
      secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED;
  }
  if (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
      secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
      arePublicationNodeListsEqual(acknowledgedNodeIds, requiredAckNodeIds)) {
    return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING ||
      secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING ||
      acknowledgedNodeIds.length > NUM.ZERO) {
    return CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING;
  }
  return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
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
  const publishedActiveNodeIds = normalizePublicationNodeIdList([
    ...normalizedPrimary.publishedActiveNodeIds,
    ...normalizedSecondary.publishedActiveNodeIds,
  ]);
  const requiredAckNodeIds = normalizePublicationNodeIdList([
    ...normalizedPrimary.requiredAckNodeIds,
    ...normalizedSecondary.requiredAckNodeIds,
  ]);
  const acknowledgedNodeIds = normalizePublicationNodeIdList([
    ...normalizedPrimary.acknowledgedNodeIds,
    ...normalizedSecondary.acknowledgedNodeIds,
  ]);
  const status = deriveMergedPublicationStatus(
    normalizedPrimary.status,
    normalizedSecondary.status,
    acknowledgedNodeIds,
    requiredAckNodeIds,
  );
  const updatedAtCandidates = [
    normalizePublicationPositiveInteger(primaryRow?.updated_at ?? primaryRow?.updatedAt, null),
    normalizePublicationPositiveInteger(secondaryRow?.updated_at ?? secondaryRow?.updatedAt, null),
  ].filter((value) => Number.isFinite(value));
  const updatedAt = updatedAtCandidates.length > NUM.ZERO ?
    Math.max(...updatedAtCandidates) :
    null;
  const createdAtCandidates = [
    normalizePublicationPositiveInteger(primaryRow?.created_at ?? primaryRow?.createdAt, null),
    normalizePublicationPositiveInteger(secondaryRow?.created_at ?? secondaryRow?.createdAt, null),
  ].filter((value) => Number.isFinite(value));
  const createdAt = createdAtCandidates.length > NUM.ZERO ?
    Math.min(...createdAtCandidates) :
    null;
  const publishedAtCandidates = [
    normalizePublicationPositiveInteger(primaryRow?.published_at ?? primaryRow?.publishedAt, null),
    normalizePublicationPositiveInteger(secondaryRow?.published_at ?? secondaryRow?.publishedAt, null),
  ].filter((value) => Number.isFinite(value));
  const closedAtCandidates = [
    normalizePublicationPositiveInteger(primaryRow?.closed_at ?? primaryRow?.closedAt, null),
    normalizePublicationPositiveInteger(secondaryRow?.closed_at ?? secondaryRow?.closedAt, null),
  ].filter((value) => Number.isFinite(value));
  const publishedAt = status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ?
    (publishedAtCandidates.length > NUM.ZERO ? Math.max(...publishedAtCandidates) : updatedAt) :
    null;
  const closedAt =
    status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED ||
      status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED ||
      status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED ?
      (closedAtCandidates.length > NUM.ZERO ? Math.max(...closedAtCandidates) :
        (publishedAt || updatedAt)) :
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
        primaryRow?.publication_epoch ?? primaryRow?.publicationEpoch,
        null,
      ) ?? normalizePublicationPositiveInteger(
        secondaryRow?.publication_epoch ?? secondaryRow?.publicationEpoch,
        1,
      ),
    publisher_node_id: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'publisher_node_id',
      'publisherNodeId',
    ),
    source_topology_epoch: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'source_topology_epoch',
      'sourceTopologyEpoch',
    ),
    source_snapshot_version: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'source_snapshot_version',
      'sourceSnapshotVersion',
    ),
    published_active_node_ids: publishedActiveNodeIds,
    required_ack_node_ids: requiredAckNodeIds,
    acknowledged_node_ids: acknowledgedNodeIds,
    priority_partition_summary: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'priority_partition_summary',
      'priorityPartitionSummary',
    ),
    membership_lifecycle_summary: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'membership_lifecycle_summary',
      'membershipLifecycleSummary',
    ),
    status,
    reason_code: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'reason_code',
      'reasonCode',
    ) || '',
    created_at: createdAt,
    updated_at: updatedAt,
    published_at: publishedAt,
    closed_at: closedAt,
    transition_history: readPreferredPublicationField(
      latestRow,
      fallbackRow,
      'transition_history',
      'transitionHistory',
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
  if (!doesPublicationNodeListCover(
    actual.publishedActiveNodeIds,
    desired.publishedActiveNodeIds,
  )) {
    return false;
  }
  if (!doesPublicationNodeListCover(
    actual.requiredAckNodeIds,
    desired.requiredAckNodeIds,
  )) {
    return false;
  }
  if (!doesPublicationNodeListCover(
    actual.acknowledgedNodeIds,
    desired.acknowledgedNodeIds,
  )) {
    return false;
  }
  if (desired.priorityPartitionSummary &&
      JSON.stringify(actual.priorityPartitionSummary || null) !==
        JSON.stringify(desired.priorityPartitionSummary)) {
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