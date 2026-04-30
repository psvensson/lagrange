import {TABLES} from '../../constants/index.js';
import {SystemMetadataOwnerBase} from './system-metadata-owner-base.js';

const LOCAL_STR_LOGS_OWNER = 'logs-owner';

class LogsOwner extends SystemMetadataOwnerBase {
  static OWNER_NAME = LOCAL_STR_LOGS_OWNER;
  static TABLE_NAME = TABLES.LOGS;

  async getLog(logId, options = {}) {
    return this.readByPrimaryKey(logId, options);
  }

  async listLogs(options = {}) {
    return this.listRows(options);
  }

  async appendLog(row, options = {}) {
    return this.insertRow(row, options);
  }

  async upsertLog(row, options = {}) {
    return this.upsertRow(row, options);
  }

  async updateLog(logId, data, options = {}) {
    return this.updateByPrimaryKey(logId, data, options);
  }

  async removeLog(logId, options = {}) {
    return this.deleteByPrimaryKey(logId, options);
  }
}

export {LogsOwner};
