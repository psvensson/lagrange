// The committed replica operation a joining replica is named by, answered
// the way the authoritative control-plane read answers it (quest
// replica-admission-from-committed-operation): a replica's gateway answers
// replica_operations reads from the given record; every other read stays
// its own. Shared by the fixtures that form or grow a real partition group.

import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';

/**
 * The committed ADD operation of one joining member.
 * @param {string} partitionId - The partition.
 * @param {Array<string>} member - [replicaId, nodeId].
 * @return {Object} The operation row.
 */
function committedAddOperation(partitionId, [replicaId, nodeId]) {
  return Object.freeze({operation_id: `add-op-${replicaId}`, type: 'ADD',
    entity_type: SERVICE_TYPE.PARTITION, entity_id: partitionId,
    partition_id: partitionId, replica_id: replicaId,
    target_node_id: nodeId, status: 'syncing', workflow_step: 'SYNCING'});
}

/**
 * Make a replica's gateway answer replica_operations reads from `operations`
 * (an array the caller may grow).
 * @param {Object} service - A PartitionService.
 * @param {Array<Object>} operations - The committed operation rows.
 */
function answerCommittedOperations(service, operations) {
  const gateway = service.controlPlaneSystemTableGateway;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = (tableName, sql, params, options) =>
    tableName === TABLES.REPLICA_OPERATIONS ?
      Promise.resolve({success: true, rows: operations.filter((row) =>
        row.operation_id === params?.[0])}) :
      read(tableName, sql, params, options);
}

export {answerCommittedOperations, committedAddOperation};
