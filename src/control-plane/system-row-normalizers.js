import {COLUMN} from '../constants/index.js';

function readText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value !== null && value !== undefined) {
      const normalized = String(value);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return '';
}

function readLowerText(...values) {
  return readText(...values).toLowerCase();
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

export {
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
  normalizeServiceRow,
};
