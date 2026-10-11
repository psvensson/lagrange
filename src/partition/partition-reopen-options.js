// A replacement of an existing local replica opens its durable membership
// record. Both snapshot install and release reopen use this lifecycle shape;
// neither can accidentally supply a fresh-create/genesis stamp.
import {durableRecordBootstrap} from '../raft/raft-committed-membership-stamp.js';

function buildReplacementServiceOptions(service) {
  return Object.freeze({partitionId: service.partitionId, tableId: service.tableId,
    tableName: service.tableName, replicaId: service.replicaId, replicaIds: service.replicaIds,
    bootstrapMembership: durableRecordBootstrap(), nodeId: service.nodeId, dbPath: service.dbPath});
}

export {buildReplacementServiceOptions};
