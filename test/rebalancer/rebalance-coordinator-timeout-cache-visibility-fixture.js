import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {createCoordinatorSqlStore, createMockControlPlaneSystemTableGateway} from './test-helpers.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';

function isolateTimeoutVisibilityReads(coordinator) {
  // These tests count the read owned by the method under test. The independent
  // failed-create cleanup-release startup census has its own recovery witness;
  // keep it from consuming this fixture's gateway call counters.
  coordinator.workflowOwner.repository
    .queryTerminalReplicaCleanupOperations = async () => [];
  return coordinator;
}

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
    return isolateTimeoutVisibilityReads(new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
      authoritativeVisibilityTimeoutMs: 0,
      authoritativeVisibilityRetryDelayMs: 0,
      ...overrides,
      sqlQueryEngine,
    })));
  }

  return isolateTimeoutVisibilityReads(new RebalanceCoordinator(withNodeReadinessService('RebalanceCoordinator', {
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
  })));
}

export function createCommittedTimeoutLedger(initial, {readServices} = {}) {
  const store = createCoordinatorSqlStore({
    getAll: (table) => table === 'replica_operations' ? [initial] : [],
  });
  const sqlQueryEngine = {executeQuery: async (sql, params) => store.execute(sql, params)};
  const gateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);
  const terminalChanges = [];
  const pointReads = [];
  const readAuthoritatively = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (table === 'services' && readServices) {
      return readServices(sql, params, options);
    }
    const result = await readAuthoritatively(table, sql, params, options);
    if (table === 'replica_operations' && sql.includes('WHERE operation_id = ?') &&
        params[0] === initial.operation_id &&
        options.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED) {
      pointReads.push(result);
    }
    return result;
  };
  gateway.submitMutation = async (mutation) => {
    const result = store.submitMutation(mutation);
    if (mutation.tableName === 'replica_operations' && mutation.data?.workflow_step === 'FAILED') {
      terminalChanges.push(result.partitionResult?.affectedRows);
    }
    return result;
  };
  installCommittedOperationMutationFixture(gateway);
  return {
    options: {
      sqlQueryEngine,
      controlPlaneSystemTableGateway: gateway,
      cdcIntegrationService: gateway.cdcIntegrationService,
    },
    terminalChanges,
    pointReads,
    read: () => store.execute('SELECT * FROM replica_operations WHERE operation_id = ?',
      [initial.operation_id]).rows[0],
    close: store.suspend,
  };
}
