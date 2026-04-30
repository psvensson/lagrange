import {COLUMN, TABLES} from '../constants/index.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_NUM_ONE = 1;

const CONTROL_PLANE_PUBLICATION_DEFAULT = Object.freeze({
  KIND: 'cluster_membership',
  STATUS: 'OPEN',
});

function readText(...values) {
  for (const value of values) {
    if (typeof value === LOCAL_STR_STRING && value.length > LOCAL_NUM_ZERO) {
      return value;
    }
    if (value !== null && value !== undefined) {
      const normalized = String(value);
      if (normalized.length > LOCAL_NUM_ZERO) {
        return normalized;
      }
    }
  }
  return LOCAL_STR_EMPTY;
}

function readLowerText(...values) {
  return readText(...values).toLowerCase();
}

function readInteger(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === LOCAL_STR_EMPTY) {
      continue;
    }
    const normalized = Number(value);
    if (Number.isFinite(normalized)) {
      return Math.trunc(normalized);
    }
  }
  return null;
}

function readJsonValue(value, fallbackValue) {
  if (value === null || value === undefined) {
    return fallbackValue;
  }
  if (typeof value === LOCAL_STR_STRING) {
    try {
      return JSON.parse(value);
    } catch {
      return fallbackValue;
    }
  }
  return value;
}

function readArrayValue(...values) {
  for (const value of values) {
    const normalized = readJsonValue(value, null);
    if (Array.isArray(normalized)) {
      return normalized;
    }
  }
  return [];
}

function readObjectValue(...values) {
  for (const value of values) {
    const normalized = readJsonValue(value, null);
    if (normalized && typeof normalized === LOCAL_STR_OBJECT &&
        !Array.isArray(normalized)) {
      return normalized;
    }
  }
  return null;
}

function normalizeNodeRow(row) {
  return {
    nodeId: readText(
      row?.[COLUMN.NODE_ID],
      row?.node_id,
      row?.nodeId,
    ),
    status: readLowerText(
      row?.[COLUMN.STATUS],
      row?.status,
    ),
    connectionState: readLowerText(
      row?.[COLUMN.CONNECTION_STATE],
      row?.connection_state,
      row?.connectionState,
    ),
  };
}

function normalizeServiceRow(row) {
  return {
    serviceId: readText(
      row?.[COLUMN.SERVICE_ID],
      row?.service_id,
      row?.serviceId,
    ),
    serviceType: readLowerText(
      row?.[COLUMN.SERVICE_TYPE],
      row?.service_type,
      row?.serviceType,
    ),
    nodeId: readText(
      row?.[COLUMN.NODE_ID],
      row?.node_id,
      row?.nodeId,
    ),
    partitionId: readText(
      row?.[COLUMN.PARTITION_ID],
      row?.partition_id,
      row?.partitionId,
    ),
    groupId: readText(
      row?.[COLUMN.GROUP_ID],
      row?.group_id,
      row?.groupId,
    ),
    replicaId: readText(
      row?.[COLUMN.REPLICA_ID],
      row?.replica_id,
      row?.replicaId,
    ),
    raftRole: readLowerText(
      row?.[COLUMN.RAFT_ROLE],
      row?.raft_role,
      row?.raftRole,
    ),
    status: readLowerText(
      row?.[COLUMN.STATUS],
      row?.status,
    ),
    address: readText(
      row?.[COLUMN.ADDRESS],
      row?.address,
    ),
  };
}

function normalizeNodeEndpointRow(row) {
  return {
    nodeId: readText(
      row?.[COLUMN.NODE_ID],
      row?.node_id,
      row?.nodeId,
    ),
    status: readLowerText(
      row?.[COLUMN.STATUS],
      row?.status,
    ),
    transportType: readLowerText(
      row?.[COLUMN.TRANSPORT_TYPE],
      row?.transport_type,
      row?.transportType,
    ),
    address: readText(
      row?.[COLUMN.ADDRESS],
      row?.address,
    ),
  };
}

function normalizeServiceEndpointRow(row) {
  return {
    nodeId: readText(
      row?.[COLUMN.NODE_ID],
      row?.node_id,
      row?.nodeId,
    ),
    serviceId: readText(
      row?.[COLUMN.SERVICE_ID],
      row?.service_id,
      row?.serviceId,
    ),
    healthStatus: readLowerText(
      row?.health_status,
      row?.healthStatus,
    ),
    endpoint: readText(
      row?.endpoint,
    ),
  };
}

function normalizeControlPlanePublicationRow(row) {
  return {
    publicationId: readText(
      row?.publication_id,
      row?.publicationId,
    ),
    publicationKind: readLowerText(
      row?.publication_kind,
      row?.publicationKind,
    ),
    publicationEpoch: readInteger(
      row?.publication_epoch,
      row?.publicationEpoch,
    ),
    publisherNodeId: readText(
      row?.publisher_node_id,
      row?.publisherNodeId,
    ),
    sourceTopologyEpoch: readInteger(
      row?.source_topology_epoch,
      row?.sourceTopologyEpoch,
    ),
    sourceSnapshotVersion: readInteger(
      row?.source_snapshot_version,
      row?.sourceSnapshotVersion,
    ),
    status: readUpperText(
      row?.status,
    ),
    reasonCode: readText(
      row?.reason_code,
      row?.reasonCode,
    ),
    publishedActiveNodeIds: readArrayValue(
      row?.published_active_node_ids,
      row?.publishedActiveNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    requiredAckNodeIds: readArrayValue(
      row?.required_ack_node_ids,
      row?.requiredAckNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    acknowledgedNodeIds: readArrayValue(
      row?.acknowledged_node_ids,
      row?.acknowledgedNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    priorityPartitionSummary: readObjectValue(
      row?.priority_partition_summary,
      row?.priorityPartitionSummary,
    ),
    membershipLifecycleSummary: readObjectValue(
      row?.membership_lifecycle_summary,
      row?.membershipLifecycleSummary,
    ),
    transitionHistory: readArrayValue(
      row?.transition_history,
      row?.transitionHistory,
    ),
  };
}

function serializeControlPlanePublicationRow(row) {
  const normalizedRow = normalizeControlPlanePublicationRow(row);
  return {
    publication_id: readText(
      normalizedRow.publicationId,
      row?.publication_id,
      row?.publicationId,
    ),
    publication_kind: readText(
      normalizedRow.publicationKind,
      row?.publication_kind,
      row?.publicationKind,
      CONTROL_PLANE_PUBLICATION_DEFAULT.KIND,
    ),
    publication_epoch: readInteger(
      normalizedRow.publicationEpoch,
      row?.publication_epoch,
      row?.publicationEpoch,
      LOCAL_NUM_ONE,
    ),
    publisher_node_id: readText(
      normalizedRow.publisherNodeId,
      row?.publisher_node_id,
      row?.publisherNodeId,
    ),
    source_topology_epoch: readInteger(
      normalizedRow.sourceTopologyEpoch,
      row?.source_topology_epoch,
      row?.sourceTopologyEpoch,
    ),
    source_snapshot_version: readInteger(
      normalizedRow.sourceSnapshotVersion,
      row?.source_snapshot_version,
      row?.sourceSnapshotVersion,
    ),
    published_active_node_ids: readArrayValue(
      normalizedRow.publishedActiveNodeIds,
      row?.published_active_node_ids,
      row?.publishedActiveNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    required_ack_node_ids: readArrayValue(
      normalizedRow.requiredAckNodeIds,
      row?.required_ack_node_ids,
      row?.requiredAckNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    acknowledged_node_ids: readArrayValue(
      normalizedRow.acknowledgedNodeIds,
      row?.acknowledged_node_ids,
      row?.acknowledgedNodeIds,
    ).map((value) => readText(value)).filter(Boolean),
    priority_partition_summary: readObjectValue(
      normalizedRow.priorityPartitionSummary,
      row?.priority_partition_summary,
      row?.priorityPartitionSummary,
    ),
    membership_lifecycle_summary: readObjectValue(
      normalizedRow.membershipLifecycleSummary,
      row?.membership_lifecycle_summary,
      row?.membershipLifecycleSummary,
    ),
    status: readUpperText(
      normalizedRow.status,
      row?.status,
      CONTROL_PLANE_PUBLICATION_DEFAULT.STATUS,
    ),
    reason_code: readText(
      normalizedRow.reasonCode,
      row?.reason_code,
      row?.reasonCode,
    ),
    created_at: readInteger(
      row?.created_at,
      row?.createdAt,
    ),
    updated_at: readInteger(
      row?.updated_at,
      row?.updatedAt,
      Date.now(),
    ),
    published_at: readInteger(
      row?.published_at,
      row?.publishedAt,
    ),
    closed_at: readInteger(
      row?.closed_at,
      row?.closedAt,
    ),
    transition_history: readArrayValue(
      row?.transition_history,
      row?.transitionHistory,
      normalizedRow.transitionHistory,
    ),
  };
}

function canonicalizeSystemTableRow(tableName, row) {
  if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
    return serializeControlPlanePublicationRow(row);
  }
  return row;
}

function readUpperText(...values) {
  return readText(...values).toUpperCase();
}

export {
  canonicalizeSystemTableRow,
  normalizeControlPlanePublicationRow,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
  serializeControlPlanePublicationRow,
};
