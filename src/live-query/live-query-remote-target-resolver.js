/**
 * Remote partition target and unified service-address resolution for live
 * query remote CDC subscriptions.
 */

import {TABLES} from '../constants/index.js';
import {STATE_ABSENT, readStateField} from '../utils/state-field-read.js';

const SERVICE_ENTITY_TYPE = 'service';
const PARTITION_ENTITY_TYPE = 'partition';
const LIVE_QUERY_CDC_SERVICE_ID = 'live-query-cdc';
const ACTIVE_SERVICE_STATUS = 'active';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function readTableRows(systemTableCache, tableName, predicate) {
  if (!systemTableCache) return [];
  if (systemTableCache.filter) return systemTableCache.filter(tableName, predicate) || [];
  if (systemTableCache.getAll) return (systemTableCache.getAll(tableName) || []).filter(predicate);
  return [];
}

function resolvePartitionRecord(systemTableCache, partitionId, overrideRow = null) {
  if (overrideRow && overrideRow.partition_id === partitionId) return overrideRow;
  if (!systemTableCache || !partitionId) return null;
  if (systemTableCache.get) {
    const direct = systemTableCache.get(TABLES.PARTITIONS, partitionId);
    if (direct) return direct;
  }
  const match = (row) => row?.partition_id === partitionId;
  if (systemTableCache.find) return systemTableCache.find(TABLES.PARTITIONS, match) || null;
  return readTableRows(systemTableCache, TABLES.PARTITIONS, match)[0] || null;
}

function resolveRemoteNodeId(systemTableCache, partitionId, ownNodeId, overrideRow) {
  const partitionRow = resolvePartitionRecord(systemTableCache, partitionId, overrideRow);
  const leaderNodeId = partitionRow?.leader_node_id || null;
  if (isNonEmptyString(leaderNodeId)) {
    return leaderNodeId === ownNodeId ? null : leaderNodeId;
  }
  const replicaRows = readTableRows(
    systemTableCache,
    TABLES.PARTITION_REPLICAS,
    (row) => row?.partition_id === partitionId &&
      isNonEmptyString(row?.node_id) && row.node_id !== ownNodeId,
  );
  return replicaRows[0]?.node_id || null;
}

function isPartitionServiceTypeAndStatusActive(row) {
  const rowType = row?.service_type || null;
  if (rowType && rowType !== PARTITION_ENTITY_TYPE) return false;
  const rowStatus = readStateField(row?.status);
  return rowStatus === STATE_ABSENT || rowStatus === ACTIVE_SERVICE_STATUS;
}

function matchesActivePartitionService(row, partitionId, targetNodeId) {
  return row?.partition_id === partitionId && row?.node_id === targetNodeId &&
    isNonEmptyString(row?.address) && isPartitionServiceTypeAndStatusActive(row);
}

function resolveRemotePartitionAddress(systemTableCache, partitionId, targetNodeId) {
  const matchingServices = readTableRows(
    systemTableCache,
    TABLES.SERVICES,
    (row) => matchesActivePartitionService(row, partitionId, targetNodeId),
  );
  return matchingServices.length > 0 ?
    matchingServices[0].address :
    `${targetNodeId}/${PARTITION_ENTITY_TYPE}/${partitionId}`;
}

/**
 * Resolve the remote target node and unified partition address for a partition.
 * @param {Object|null} systemTableCache
 * @param {string} partitionId
 * @param {string|null} ownNodeId
 * @param {Object|null} [overrideRow]
 * @return {{targetNodeId: string, targetAddress: string}|null}
 */
function resolveRemotePartitionTarget(
  systemTableCache, partitionId, ownNodeId, overrideRow = null,
) {
  const targetNodeId = resolveRemoteNodeId(systemTableCache, partitionId, ownNodeId, overrideRow);
  if (!targetNodeId) return null;
  const targetAddress = resolveRemotePartitionAddress(systemTableCache, partitionId, targetNodeId);
  return {targetNodeId, targetAddress};
}

function buildLiveQueryCdcAddress(nodeId) {
  return isNonEmptyString(nodeId) ?
    `${nodeId}/${SERVICE_ENTITY_TYPE}/${LIVE_QUERY_CDC_SERVICE_ID}` : null;
}

export {
  buildLiveQueryCdcAddress,
  isNonEmptyString,
  resolveRemotePartitionTarget,
};
