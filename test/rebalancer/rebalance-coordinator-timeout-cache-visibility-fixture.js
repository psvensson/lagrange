import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';

export function buildTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

export function createCoordinator(overrides = {}) {
  const sqlQueryEngine = overrides.sqlQueryEngine || {
    async executeQuery() {
      return {success: true, rows: [], affectedRows: 0};
    },
  };
  const hasExplicitGateway =
    overrides.controlPlaneSystemTableGateway &&
    typeof overrides.controlPlaneSystemTableGateway === 'object';
  const hasLocalAuthoritativeRead =
    typeof overrides.cdcIntegrationService
      ?.executeAuthoritativeSystemTableRead === 'function';

  if (hasExplicitGateway || hasLocalAuthoritativeRead) {
    return new RebalanceCoordinator({
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs: 0,
      ...overrides,
      sqlQueryEngine,
    });
  }

  return new RebalanceCoordinator({
    authoritativeVisibilityTimeoutMs: 0,
    authoritativeVisibilityRetryDelayMs: 0,
    ...overrides,
    sqlQueryEngine,
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      readRows: async (_tableName, sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
      executeQuery: async (sql, params = [], options = {}) => {
        return sqlQueryEngine.executeQuery(sql, params, options);
      },
    },
  });
}
