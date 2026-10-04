import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'seed-node-1', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function getPrimaryKeyFieldForSystemTable(tableName, row = null) {
  switch (tableName) {
  case 'services':
    return 'service_id';
  case 'nodes':
  case 'node_endpoints':
  case 'logs':
    return 'node_id';
  case 'replica_operations':
    return 'operation_id';
  case 'message_groups':
    return 'group_id';
  case 'partitions':
    return 'partition_id';
  case 'service_endpoints':
    return 'endpoint_id';
  case 'service_definitions':
    return 'service_id';
  default:
    break;
  }
  for (const candidate of ['service_id', 'node_id', 'operation_id', 'id']) {
    if (typeof row?.[candidate] !== 'undefined' && row?.[candidate] !== null) {
      return candidate;
    }
  }
  return 'id';
}

function createCdcIntegrationServiceFixture(rows, options = {}) {
  const persistMutations = options.persistMutations !== false;
  const findRows = (tableName) => {
    if (!Array.isArray(rows[tableName])) {
      rows[tableName] = [];
    }
    return rows[tableName];
  };
  const findRowIndex = (tableName, primaryKeyField, keyValue) => {
    return findRows(tableName).findIndex((row) => row?.[primaryKeyField] === keyValue);
  };

  return {
    async executeAuthoritativeSystemTableRead(tableName, sql, params = []) {
      if (typeof options.executeAuthoritativeSystemTableRead === 'function') {
        return options.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
        );
      }
      const sourceRows = options.authoritativeRows?.[tableName] ||
        findRows(tableName);
      let selected = sourceRows;
      if (/service_id\s*=\s*\?/iu.test(sql)) {
        selected = sourceRows.filter((row) => row.service_id === params[0]);
      } else if (/service_type\s*=\s*\?/iu.test(sql)) {
        selected = sourceRows.filter((row) =>
          row.service_type === params[0] && row.status === params[1] &&
          row.node_id === params[2]);
      } else if (/operation_id\s*=\s*\?/iu.test(sql)) {
        selected = sourceRows.filter((row) => row.operation_id === params[0]);
      }
      return {success: true, rows: selected.map((row) => ({...row}))};
    },

    async insertSystemTableRow(tableName, row) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      tableRows.push({...row});
      return {success: true, affectedRows: 1};
    },

    async upsertSystemTableRow(tableName, row) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      const primaryKeyField = getPrimaryKeyFieldForSystemTable(tableName, row);
      const keyValue = row?.[primaryKeyField];
      const rowPayload = {...row};
      const existingIndex = findRowIndex(tableName, primaryKeyField, keyValue);
      if (existingIndex === -1) {
        tableRows.push(rowPayload);
      } else {
        tableRows[existingIndex] = {
          ...tableRows[existingIndex],
          ...rowPayload,
        };
      }
      return {success: true, affectedRows: 1};
    },

    async updateSystemTableRow(tableName, whereClause, data) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      let affectedRows = 0;
      for (const row of tableRows) {
        const matches = Object.entries(whereClause || {}).every(([key, value]) =>
          row?.[key] === value,
        );
        if (!matches) {
          continue;
        }
        Object.assign(row, data);
        affectedRows += 1;
      }
      return {success: true, affectedRows};
    },

    async deleteSystemTableRow(tableName, whereClause) {
      if (!persistMutations) {
        return {success: true, affectedRows: 1};
      }
      const tableRows = findRows(tableName);
      const remainingRows = tableRows.filter((row) =>
        !Object.entries(whereClause || {}).every(([key, value]) => row?.[key] === value),
      );
      const affectedRows = tableRows.length - remainingRows.length;
      rows[tableName] = remainingRows;
      return {success: true, affectedRows};
    },

    async repairCacheVisibilityHole(...args) {
      if (typeof options.repairCacheVisibilityHole === 'function') {
        return options.repairCacheVisibilityHole(...args);
      }
      return false;
    },
  };
}

// The MOVE_REPLICA handoff is refused at /register-service (owner decision
// 2026-10-04, raft-rs full cutover). The services-row write and the
// cache-visibility wait the handoff ran remain in the tree until the MOVE
// subsystem's deletion (an open epic obligation); until then their
// witnesses drive them directly and read the answer the handoff returned
// (a typed error's status, code and details, or success).
async function driveMoveHandoffRegistrationVisibility(api, serviceData) {
  const registeredServiceRow =
    api.buildRegisteredServiceMutationRow(serviceData);
  try {
    await api.serviceRegistrationHandoffOwner
      .writeRegisteredServiceRowWithRetry(
        serviceData, registeredServiceRow, null);
    await api.waitForRegisteredServiceCacheVisibility(
      api.buildExpectedRegisteredServiceData(registeredServiceRow));
    return {statusCode: 200, body: {success: true}};
  } catch (error) {
    return {
      statusCode: error.statusCode,
      body: {code: error.errorCode, details: error.details},
    };
  }
}

export {
  createCdcIntegrationServiceFixture,
  driveMoveHandoffRegistrationVisibility,
  initializeTestEnvironment,
};
