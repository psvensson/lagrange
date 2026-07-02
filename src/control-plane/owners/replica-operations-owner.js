import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_REPLICA_OPERATIONS_OWNER = 'replica-operations-owner';

class ReplicaOperationsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_REPLICA_OPERATIONS_OWNER;
  static TABLE_NAME = TABLES.REPLICA_OPERATIONS;

  async getReplicaOperation(assignmentId, options = {}) {
    return this.readByPrimaryKey(assignmentId, options);
  }

  async getReplicaOperationFromCache(assignmentId, options = {}) {
    return this.readCachedByPrimaryKey(assignmentId, options);
  }

  async listReplicaOperations(options = {}) {
    return this.listRows(options);
  }

  async listReplicaOperationsFromCache(options = {}) {
    return this.listCachedRows(options);
  }

  async insertReplicaOperation(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertReplicaOperation(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateReplicaOperation(assignmentId, data, options = {}) {
    return this.updateByPrimaryKey(assignmentId, data, options);
  }

  async removeReplicaOperation(assignmentId, options = {}) {
    return this.deleteByPrimaryKey(assignmentId, options);
  }
}

export {ReplicaOperationsOwner};
