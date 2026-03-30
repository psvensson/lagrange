import {
  getSystemCachePrimaryKeyField,
} from '../../cache/system-cache-key-descriptor.js';
import {
  readAuthoritativeControlPlaneRows,
  readProjectionControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {
  createSystemMetadataGatewayRequiredError,
} from '../system-metadata-access-error.js';

function unwrapRowReadResult(result) {
  if (Array.isArray(result)) {
    return result[0] || null;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows[0] || null;
  }
  if (result && typeof result === 'object') {
    return result;
  }
  return null;
}

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
    const cacheAwareOptions =
      typeof options.systemTableCache === 'undefined' &&
        this.getSystemTableCache() ?
        {
          ...options,
          systemTableCache: this.getSystemTableCache(),
        } :
        options;
    return readProjectionControlPlaneRows(this.requireGateway(),
      this.getTableName(), {
      ...cacheAwareOptions,
      owner: this.getOwnerName(),
      readFromCache,
    });
  }

  async readCachedByPrimaryKey(primaryKeyValue, options = {}) {
    const tableName = this.getTableName();
    const result = await this.executeCacheRead((systemTableCache) => {
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
    return unwrapRowReadResult(result);
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
    const result = await readAuthoritativeControlPlaneRows(
      this.requireGateway(),
      this.getTableName(),
      this.buildSelectByPrimaryKeySql(),
      [primaryKeyValue],
      {
        ...options,
        owner: this.getOwnerName(),
      },
    );
    return unwrapRowReadResult(result);
  }

  async listRows(options = {}) {
    return readAuthoritativeControlPlaneRows(
      this.requireGateway(),
      this.getTableName(),
      this.buildSelectAllSql(),
      [],
      {
        ...options,
        owner: this.getOwnerName(),
      },
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
