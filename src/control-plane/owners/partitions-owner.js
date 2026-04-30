import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_PARTITIONS_OWNER = 'partitions-owner';

class PartitionsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_PARTITIONS_OWNER;
  static TABLE_NAME = TABLES.PARTITIONS;

  async getPartition(partitionId, options = {}) {
    return this.readByPrimaryKey(partitionId, options);
  }

  async listPartitions(options = {}) {
    return this.listRows(options);
  }

  async insertPartition(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertPartition(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updatePartition(partitionId, data, options = {}) {
    return this.updateByPrimaryKey(partitionId, data, options);
  }

  async removePartition(partitionId, options = {}) {
    return this.deleteByPrimaryKey(partitionId, options);
  }
}

export {PartitionsOwner};
