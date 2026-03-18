import {
  getSystemCachePrimaryKeyField,
} from '../../cache/system-cache-key-descriptor.js';
import {
  createSystemMetadataGatewayRequiredError,
} from '../system-metadata-access-error.js';

class SystemMetadataOwnerBase {
  constructor(options = {}) {
    this.controlPlaneSystemTableGateway =
      options.controlPlaneSystemTableGateway || null;
    this.systemTableCache = options.systemTableCache || null;
  }

  getOwnerName() {
    return this.constructor.OWNER_NAME || 'unknown-owner';
  }

  getTableName() {
    return this.constructor.TABLE_NAME || null;
  }

  getGateway() {
    return this.controlPlaneSystemTableGateway || null;
  }

  getSystemTableCache() {
    return this.systemTableCache || null;
  }

  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway =
      controlPlaneSystemTableGateway || null;
    return this;
  }

  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache || null;
    return this;
  }

  getPrimaryKeyField() {
    return getSystemCachePrimaryKeyField(this.getTableName());
  }

  requireGateway() {
    const gateway = this.getGateway();
    if (gateway) {
      return gateway;
    }
    throw createSystemMetadataGatewayRequiredError({
      ownerName: this.getOwnerName(),
      tableName: this.getTableName(),
    });
  }

  buildSelectAllSql() {
    return `SELECT * FROM ${this.getTableName()}`;
  }

  buildSelectByPrimaryKeySql() {
    return `${this.buildSelectAllSql()} WHERE ${this.getPrimaryKeyField()} = ?`;
  }

  async executeCacheRead(readFromCache, options = {}) {
    return this.requireGateway().executeRead({
      owner: this.getOwnerName(),
      tableName: this.getTableName(),
      strategy: 'cache',
      readFromCache,
    }, options);
  }

  async readCachedByPrimaryKey(primaryKeyValue, options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (!systemTableCache) {
        return [];
      }
      if (typeof systemTableCache.get === 'function') {
        const row = systemTableCache.get(tableName, primaryKeyValue);
        return row ? [row] : [];
      }
      if (typeof systemTableCache.getAll !== 'function') {
        return [];
      }
      return (systemTableCache.getAll(tableName) || []).filter((row) => {
        return row?.[this.getPrimaryKeyField()] === primaryKeyValue;
      });
    }, options);
  }

  async listCachedRows(options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (typeof systemTableCache?.getAll !== 'function') {
        return [];
      }
      return systemTableCache.getAll(tableName) || [];
    }, options);
  }

  async filterCachedRows(cachePredicate, options = {}) {
    const tableName = this.getTableName();
    return this.executeCacheRead((systemTableCache) => {
      if (!systemTableCache || typeof cachePredicate !== 'function') {
        return [];
      }
      if (typeof systemTableCache.filter === 'function') {
        return systemTableCache.filter(tableName, cachePredicate) || [];
      }
      if (typeof systemTableCache.getAll !== 'function') {
        return [];
      }
      return (systemTableCache.getAll(tableName) || []).filter(cachePredicate);
    }, options);
  }

  async readByPrimaryKey(primaryKeyValue, options = {}) {
    return this.requireGateway().readRows(
      this.getTableName(),
      this.buildSelectByPrimaryKeySql(),
      [primaryKeyValue],
      options,
    );
  }

  async listRows(options = {}) {
    return this.requireGateway().readRows(
      this.getTableName(),
      this.buildSelectAllSql(),
      [],
      options,
    );
  }

  async insertRow(row, options = {}) {
    return this.requireGateway().insertSystemTableRow(
      this.getTableName(),
      row,
      options,
    );
  }

  async upsertRow(row, options = {}) {
    return this.requireGateway().upsertSystemTableRow(
      this.getTableName(),
      row,
      options,
    );
  }

  async updateByPrimaryKey(primaryKeyValue, data, options = {}) {
    return this.requireGateway().updateSystemTableRow(
      this.getTableName(),
      {[this.getPrimaryKeyField()]: primaryKeyValue},
      data,
      options,
    );
  }

  async deleteByPrimaryKey(primaryKeyValue, options = {}) {
    return this.requireGateway().deleteSystemTableRow(
      this.getTableName(),
      {[this.getPrimaryKeyField()]: primaryKeyValue},
      options,
    );
  }
}

export {SystemMetadataOwnerBase};
