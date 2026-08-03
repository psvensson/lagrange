/**
 * Shard-host topology resolution for data-local call dispatch (sole
 * owner of the call-path view onto partition ownership).
 *
 * Thin pass-through over the CANONICAL topology owners — the query
 * executor's routing snapshot/candidates and the table-routing partition
 * visibility gate. It holds no state and derives no ownership decision of
 * its own: `leader_node_id` comes from the routing snapshot's canonical
 * leader identity (never re-derived from raft_role), and topology-epoch
 * staleness is the same partition_version / active_partition_version /
 * NORMAL-state predicate the SQL routing path applies.
 *
 * The resolved host carries the CDC-visible fencing tokens a data-local
 * dispatch puts on the wire so the receiver can re-assert them against
 * its own cache before any component executes. The node-local
 * leader_claim_* annotations are deliberately excluded — they are
 * stripped from CDC and a remote receiver could never match them.
 */

import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from './call-cell-routing-contract.js';

const PARTITION_STATE_NORMAL = 'NORMAL';
const READ_DIMENSION = undefined;
const CALL_PARTITION_TOPOLOGY_MESSAGE = Object.freeze({
  ENGINE_REQUIRED:
    'createCallPartitionTopology requires a sqlQueryEngine with a ' +
    'queryExecutor',
  PARTITION_NOT_ROUTABLE:
    'Call shard partition is not visible for routing (superseded or ' +
    'non-NORMAL state)',
  PARTITION_HOST_UNKNOWN:
    'Call shard partition has no canonical leader host',
});

function createCallPartitionTopology(options = {}) {
  const sqlQueryEngine = options.sqlQueryEngine || null;
  if (typeof sqlQueryEngine?.queryExecutor?.resolvePartitionServiceCandidates !==
    'function') {
    throw new TypeError(CALL_PARTITION_TOPOLOGY_MESSAGE.ENGINE_REQUIRED);
  }

  /**
   * Resolve the node hosting a shard partition's selected active replica
   * plus the fencing tokens a data-local dispatch must carry.
   *
   * @param {string} tableName the declared statement's table
   * @param {string} partitionId the resolved shard partition
   * @return {object} frozen {hostNodeId, partitionReplicaId, partitionId,
   *   partitionVersion, activePartitionVersion, partitionState}
   * @throws {CallCellRoutingError} typed RETRYABLE refusal when the
   *   partition is superseded, stateless, or currently hostless
   */
  function resolveShardHost(tableName, partitionId) {
    const queryExecutor = sqlQueryEngine.queryExecutor;
    const tableInfo = sqlQueryEngine.getTableInfo(tableName);
    const activePartitionVersion =
      sqlQueryEngine.resolveActivePartitionVersion(tableInfo);
    const partitionRow = queryExecutor.getPartitionRecord(partitionId);
    if (!partitionRow ||
        !sqlQueryEngine.isPartitionVisibleForRouting(
          partitionRow, activePartitionVersion)) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
        `${CALL_PARTITION_TOPOLOGY_MESSAGE.PARTITION_NOT_ROUTABLE}: ` +
          `${partitionId}`,
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
    const {candidates, routingSnapshot} =
      queryExecutor.resolvePartitionServiceCandidates(
        partitionId,
        true,
        true,
        false,
        READ_DIMENSION,
        {},
      );
    const hostNodeId = routingSnapshot?.canonicalLeaderNodeId || null;
    const hostCandidate = (candidates || []).find(
      (candidate) => candidate.nodeId === hostNodeId) ||
      (candidates || [])[0] || null;
    if (!hostNodeId || !hostCandidate) {
      throw createCallRoutingFailure(
        CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
        `${CALL_PARTITION_TOPOLOGY_MESSAGE.PARTITION_HOST_UNKNOWN}: ` +
          `${partitionId}` +
          (routingSnapshot?.reasonCode ?
            ` (${routingSnapshot.reasonCode})` : ''),
        {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
      );
    }
    return Object.freeze({
      activePartitionVersion,
      hostNodeId: hostCandidate.nodeId,
      partitionId,
      partitionReplicaId: hostCandidate.replicaId ?? null,
      partitionState: partitionRow.state ?? PARTITION_STATE_NORMAL,
      partitionVersion: partitionRow.partition_version ?? 1,
    });
  }

  return Object.freeze({resolveShardHost});
}

export {createCallPartitionTopology};
