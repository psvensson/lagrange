/**
 * Shared test support for CDCIntegrationService suites.
 *
 * These helpers were duplicated verbatim across the parent suite and its
 * split-off parts. They are consolidated here (helper bodies UNCHANGED) so the
 * parent and the re-enabled concern suites import a single semantic copy.
 */

import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

/**
 * Create a mock SQL query engine for testing.
 * @return {Object} Mock SQL query engine.
 */
export function createMockSqlQueryEngine() {
  const executedQueries = [];

  const mockSqlEngine = {
    executedQueries,
    async executeQuery(sql, params = [], options = {}) {
      executedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 1,
        rows: [],
      };
    },
  };
  mockSqlEngine.queryExecutor = {
    getPartitionRoutingSnapshot() {
      return {
        canonicalLeaderNodeId: 'node-owner',
        serviceRowCount: 1,
        routableServiceCount: 1,
        deniedByNodeId: {},
      };
    },
    async executeOnPartition(partitionId, sql, params = [], _forRead,
      _preferLeader, _preferSameLatencyGroup, executionOptions = {}) {
      const result = await mockSqlEngine.executeQuery(
        sql,
        params,
        {
          ...executionOptions,
          partitionId,
        },
      );
      return {
        success: result.success !== false,
        rows: Array.isArray(result.rows) ? result.rows : [],
        participantNodeId: 'node-owner',
      };
    },
  };
  return mockSqlEngine;
}

/**
 * Create a deterministic cache probe for CDC cache-wait behavior tests.
 * The first onCacheChange registration synchronously flips record presence
 * and emits a matching table change so waiters resolve immediately.
 * @return {{cache: Object, state: Object}}
 */
export function createCacheWaitProbe() {
  const state = {
    present: false,
    row: null,
    onCacheChangeCalls: 0,
    offCacheChangeCalls: 0,
  };

  const cache = {
    has() {
      return state.present;
    },
    get() {
      return state.row;
    },
    onCacheChange(listener) {
      state.onCacheChangeCalls++;
      state.present = true;
      state.row = {
        node_id: 'node-1',
        node_address: 'localhost:8080',
      };
      listener(SYSTEM_TABLE_NAME.NODES);
      listener(SYSTEM_TABLE_NAME.LOGS);
    },
    offCacheChange() {
      state.offCacheChangeCalls++;
    },
  };

  return {cache, state};
}

/**
 * Create a local partition-service map for authoritative system-table tests.
 * @param {string} tableName
 * @param {Object} handlers
 * @return {Map<string, Object>}
 */
export function createLocalSystemTablePartitionServices(
  tableName,
  handlers = {},
) {
  const partitionId = INITIAL_PARTITION_IDS[tableName] || `${tableName}-p1`;
  const partitionService = {
    partitionId,
    replicaId: `${partitionId}-r1`,
    initialized: true,
    isLeader: handlers.isLeader !== false,
    async executeQuery(sql, params = []) {
      if (typeof handlers.executeQuery === 'function') {
        return handlers.executeQuery(sql, params);
      }
      return {
        success: true,
        rows: [],
      };
    },
  };
  if (typeof handlers.executeLocalQuery === 'function') {
    partitionService.executeLocalQuery = async (sql, params = []) => {
      return handlers.executeLocalQuery(sql, params);
    };
  }
  return new Map([
    [partitionId, partitionService],
  ]);
}
