import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

class MessageGroupsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = 'message-groups-owner';
  static TABLE_NAME = TABLES.MESSAGE_GROUPS;

  async getMessageGroup(groupId, options = {}) {
    return this.readByPrimaryKey(groupId, options);
  }

  async listMessageGroups(options = {}) {
    return this.listRows(options);
  }

  async insertMessageGroup(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertMessageGroup(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateMessageGroup(groupId, data, options = {}) {
    return this.updateByPrimaryKey(groupId, data, options);
  }

  async removeMessageGroup(groupId, options = {}) {
    return this.deleteByPrimaryKey(groupId, options);
  }
}

export {MessageGroupsOwner};
