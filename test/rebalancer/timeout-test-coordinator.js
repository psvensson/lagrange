// Shared fixture: a real RebalanceCoordinator backed by a production-schema SQLite store with an observable
// replica_operations Map, used to exercise the real timeout -> FAILED transition. Extracted from
// timeout-triggers-failure.property.test.js so the DT6 convergence harness can reuse it to drive the
// real reconcileTimeoutOperation -> failOperation mutation on a virtual clock (options.timeSource).
//
// options.timeSource (DT6): injected TimeSource threaded into the coordinator (default RealTimeSource
// = the platform clock, byte-identical), so checkTimeouts reads virtual time via the step-9/11 seam.

import {withFixtureCommittedMembership} from
  './committed-membership-fixture.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createCoordinatorSqlStore,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

// Multiple simulated nodes share one durable store. The map is the declared
// failure/clock injection boundary: external row edits are committed through
// the existing gateway SQL planner before the next production statement.
const SHARED_LEDGER_STORES = new WeakMap();
const OPERATIONS_TABLE = 'replica_operations';

// openDatabase: the store over a ledger partition's database file (placement-bound fixtures).
function createTrackedLedgerStore(rows, openDatabase = null) {
  const published = new Map();
  const cache = {
    getAll: (table) => table === OPERATIONS_TABLE ? [...rows.values()] : [],
    upsert(_table, row) {
      const current = rows.get(row.operation_id);
      if (current) Object.assign(current, row);
      else rows.set(row.operation_id, row);
      published.set(row.operation_id, JSON.stringify(rows.get(row.operation_id)));
    },
    delete(_table, id) {
      rows.delete(id);
      published.delete(id);
    },
  };
  const store = createCoordinatorSqlStore(cache, {openDatabase});
  for (const [id, row] of rows) published.set(id, JSON.stringify(row));
  const commitFixtureChange = (mutation) => {
    const result = store.submitMutation(mutation);
    if (!result.success) throw new Error(`Invalid injected ledger row: ${result.error}`);
  };
  const flushFixtures = () => {
    for (const id of [...published.keys()]) {
      if (!rows.has(id)) {
        commitFixtureChange({operation: 'delete', tableName: OPERATIONS_TABLE,
          whereClause: {operation_id: id}});
      }
    }
    for (const [id, row] of rows) {
      if (published.get(id) === JSON.stringify(row)) continue;
      commitFixtureChange(published.has(id) ?
        {operation: 'update', tableName: OPERATIONS_TABLE,
          whereClause: {operation_id: id}, data: row} :
        {operation: 'insert', tableName: OPERATIONS_TABLE, row});
    }
  };
  return {
    suspend: store.suspend,
    execute(sql, params) {
      flushFixtures();
      return store.execute(sql, params);
    },
    submitMutation(mutation) {
      flushFixtures();
      return store.submitMutation(mutation);
    },
  };
}

function createTimeoutTestCoordinator(options = {}) {
  const {services = []} = options;
  const serviceRowsByKey = options.serviceRowsByKey instanceof Map ?
    options.serviceRowsByKey : null;
  const readServiceRows = () => serviceRowsByKey ?
    Array.from(serviceRowsByKey.values()) : services;
  // options.trackedOperations: share one in-memory replica_operations ledger
  // between several coordinators (multi-node DT6 witnesses where one node
  // creates an operation that another node owns and dispatches).
  const trackedOperations =
    options.trackedOperations instanceof Map ?
      options.trackedOperations :
      new Map();
  if (!SHARED_LEDGER_STORES.has(trackedOperations)) {
    SHARED_LEDGER_STORES.set(trackedOperations,
      createTrackedLedgerStore(trackedOperations, options.openLedgerDatabase));
  }
  const ledgerStore = SHARED_LEDGER_STORES.get(trackedOperations);

  // SQL engine that tracks operations via INSERT/UPDATE queries.
  const sqlEngine = {
    executeQuery: async (sql, params) => {
      if (sql.includes('FROM services')) {
        let serviceRows = readServiceRows();
        let paramIndex = 0;
        if (sql.includes('service_id = ?')) {
          const serviceId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) =>
            row.service_id === serviceId || row.replica_id === serviceId);
        }
        if (sql.includes('service_type = ?')) {
          const serviceType = params[paramIndex++];
          serviceRows = serviceRows.filter((row) =>
            !row.service_type || row.service_type === serviceType);
        }
        if (sql.includes('partition_id = ?')) {
          const partitionId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) =>
            row.partition_id === partitionId);
        }
        if (sql.includes('node_id = ?')) {
          const nodeId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.node_id === nodeId);
        }
        if (sql.includes('group_id = ?')) {
          const groupId = params[paramIndex++];
          serviceRows = serviceRows.filter((row) => row.group_id === groupId);
        }
        if (sql.includes('service_id LIKE ?')) {
          const serviceIdPattern = String(params[paramIndex++] || '');
          const serviceIdPrefix = serviceIdPattern.endsWith('%') ?
            serviceIdPattern.slice(0, -1) :
            serviceIdPattern;
          serviceRows = serviceRows.filter((row) =>
            String(row.service_id || '').startsWith(serviceIdPrefix));
        }
        return {
          success: true,
          rows: serviceRows.map((row) => ({...row})),
          rowSetComplete: true,
          readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
        };
      }

      return ledgerStore.execute(sql, params);
    },
  };

  const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
  gateway.submitMutation = ledgerStore.submitMutation;
  installCommittedOperationMutationFixture(gateway);

  const coordinator = new RebalanceCoordinator({
    nodeId: options.nodeId || 'test-node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: gateway.cdcIntegrationService,
    controlPlaneSystemTableGateway: gateway,
    tablePolicyService: createMockPolicyService(),
    // The committed-membership read of a join is the fixture world's (O1),
    // however a witness later re-points deliver.
    messageRouter: withFixtureCommittedMembership(createMockMessageRouter(),
      null),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      defaultRepairEligible: true,
      ...options.readinessFixture,
    }),
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    enableTimeouts: false,
    // DT6 seam: inject a TimeSource so checkTimeouts can run on a virtual clock (default undefined ->
    // resolveTimeSource -> RealTimeSource, byte-identical to the prior behavior).
    timeSource: options.timeSource,
  });

  coordinator.initialize();
  if (!options.openLedgerDatabase) {
    coordinator.isPlacementAdmissionManagedEntityType = () => false;
  }
  const shutdown = coordinator.shutdown.bind(coordinator);
  coordinator.shutdown = async () => {
    try {
      await shutdown();
    } finally {
      ledgerStore.suspend();
    }
  };
  // Every create is armed by the coordinator's workflow owner (the durable
  // dispatch hold, not a request flag, gates dispatch). A fixture that drives
  // the timeout owner over an unclaimed PENDING row isolates that owner from
  // the arm; a test that wants live owner progress asks for it.
  if (options.armCreatedOperations !== true) {
    coordinator.armCoordinatorCreatedOperationProgress = async () => false;
  }
  coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
  coordinator.config.pendingTimeoutMs = options.pendingTimeoutMs || 10;
  coordinator.config.creatingTimeoutMs = options.creatingTimeoutMs || 10;
  coordinator.config.syncingTimeoutMs = options.syncingTimeoutMs || 10;
  coordinator.config.removingTimeoutMs = options.removingTimeoutMs || 10;

  // Backdate an operation's updated_at relative to wall time (wall-clock fixtures).
  const backdateOperation = (operationId, msAgo) => {
    const op = trackedOperations.get(operationId);
    if (op) {
      op.updated_at = Date.now() - msAgo;
    }
  };

  // Backdate an operation's creation (created_at): the anchor of an admitted
  // placement create's operation budget while it awaits its bootstrap
  // authority at PENDING/SENDING (isPlacementBootstrapAwaitingAuthority).
  const backdateOperationCreation = (operationId, msAgo) => {
    const op = trackedOperations.get(operationId);
    if (op) {
      op.created_at = Date.now() - msAgo;
    }
  };

  // Set an operation's updated_at to an ABSOLUTE value (DT6 virtual-clock fixtures).
  // CL-044 (955fc84c) made the real timeout/staleness math prefer the time-in-current-step
  // anchor (the steps_history entry for the current workflow_step) over updated_at, so the
  // virtual-clock anchor must also re-stamp that step-history timestamp — the row's
  // steps_history is still stamped with wall-clock Date.now() at creation (replica-status.js
  // createOperation), which would otherwise keep the operation perpetually "fresh" on the
  // virtual clock and never time out.
  const setOperationUpdatedAt = (operationId, updatedAtMs) => {
    const op = trackedOperations.get(operationId);
    if (!op) {
      return;
    }
    op.updated_at = updatedAtMs;
    if (typeof op.steps_history !== 'string' || op.steps_history.length === 0) {
      return;
    }
    let history;
    try {
      history = JSON.parse(op.steps_history);
    } catch {
      return;
    }
    if (!Array.isArray(history)) {
      return;
    }
    // Re-anchor the newest entry for the current workflow step (mirrors
    // resolveOperationCurrentStepEntry, which the production timeout anchor reads).
    for (let index = history.length - 1; index >= 0; index--) {
      const entry = history[index];
      if (entry && entry.step === op.workflow_step) {
        entry.timestamp = updatedAtMs;
        break;
      }
    }
    op.steps_history = JSON.stringify(history);
  };

  const getTrackedOperation = (operationId) => {
    return trackedOperations.get(operationId) || null;
  };

  return {
    coordinator,
    backdateOperation,
    backdateOperationCreation,
    setOperationUpdatedAt,
    getTrackedOperation,
    trackedOperations,
  };
}

export {createTimeoutTestCoordinator};
