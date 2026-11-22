import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {cdcCommittedWriteAnswer} from '../test-helpers/committed-write-answer.js';

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
  const matchesWhere = (row, whereClause) =>
    Object.entries(whereClause || {}).every(([key, value]) => row?.[key] === value);
  const upsertFixtureRow = (tableName, row) => {
    const tableRows = findRows(tableName);
    const primaryKeyField = getPrimaryKeyFieldForSystemTable(tableName, row);
    const existingIndex = findRowIndex(tableName, primaryKeyField, row?.[primaryKeyField]);
    if (existingIndex === -1) {
      tableRows.push({...row});
    } else {
      tableRows[existingIndex] = {...tableRows[existingIndex], ...row};
    }
  };
  const updateFixtureRows = (tableName, whereClause, data) => {
    let affectedRows = 0;
    for (const row of findRows(tableName)) {
      if (matchesWhere(row, whereClause)) {
        Object.assign(row, data);
        affectedRows += 1;
      }
    }
    return affectedRows;
  };
  const deleteFixtureRows = (tableName, whereClause) => {
    const tableRows = findRows(tableName);
    const remainingRows = tableRows.filter((row) => !matchesWhere(row, whereClause));
    rows[tableName] = remainingRows;
    return tableRows.length - remainingRows.length;
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

    // Each write answers what the CDC integration service answers for the
    // committed statement (the producer's durable commit receipt for the
    // write's own entry); the fixture rows are its storage.
    async insertSystemTableRow(tableName, row, writeOptions = {}) {
      if (persistMutations) {
        findRows(tableName).push({...row});
      }
      return cdcCommittedWriteAnswer('insertSystemTableRow',
        [tableName, row, writeOptions], {changes: 1});
    },

    async upsertSystemTableRow(tableName, row, writeOptions = {}) {
      if (persistMutations) {
        upsertFixtureRow(tableName, row);
      }
      return cdcCommittedWriteAnswer('upsertSystemTableRow',
        [tableName, row, writeOptions], {changes: 1});
    },

    async updateSystemTableRow(tableName, whereClause, data, writeOptions = {}) {
      const affectedRows = persistMutations ?
        updateFixtureRows(tableName, whereClause, data) : 1;
      return cdcCommittedWriteAnswer('updateSystemTableRow',
        [tableName, whereClause, data, writeOptions], {changes: affectedRows});
    },

    async deleteSystemTableRow(tableName, whereClause, writeOptions = {}) {
      const affectedRows = persistMutations ?
        deleteFixtureRows(tableName, whereClause) : 1;
      return cdcCommittedWriteAnswer('deleteSystemTableRow',
        [tableName, whereClause, writeOptions], {changes: affectedRows});
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
// `beforeVisibilityWait` runs once the services-row write was accepted and
// before the visibility wait starts (e.g. a witness's clock that lets the
// wait's deadline pass).
async function driveMoveHandoffRegistrationVisibility(api, serviceData, options = {}) {
  const registeredServiceRow =
    api.buildRegisteredServiceMutationRow(serviceData);
  try {
    await api.serviceRegistrationHandoffOwner
      .writeRegisteredServiceRowWithRetry(
        serviceData, registeredServiceRow, null);
    options.beforeVisibilityWait?.();
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
