/**
 * One replica operation on a real RebalanceCoordinator whose ledger writes
 * can be made to fail, with separate durable, cache and services state and
 * manually fired timers. The durable row changes only through a committed
 * UPDATE; the cache follows the durable row (committed state only).
 */
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {withNodeReadinessService} from
  '../helpers/readiness-service-fixture.js';

const OPERATION_ID = 'op-durable-step-authority';
const OWNER_NODE_ID = 'node-2';
const SOURCE_NODE_ID = 'node-1';
const REPLICA_OPERATIONS_TABLE = 'replica_operations';
const SERVICES_TABLE = 'services';
const UPDATE_OPERATION_SQL_PREFIX = 'UPDATE replica_operations SET';
const UPDATE_OPERATION_STEP_SET = 'status = ?, workflow_step = ?';
const EXPECTED_STEP_CAS_PATTERN = /workflow_step = \?/u;
const TERMINAL_GUARD_PATTERN = /completed_at IS NULL/u;
const CREATE_ADMISSION_ABSENT_PATTERN = /create_admission_state IS NULL/u;
const SQL_WHERE = 'WHERE';
const READ_SOURCE = 'local_partition_replica';
const RETRY_AFTER_MS = 11;
const MIN_REPLICA_COUNT = 3;
const OPERATION_AGE_MS = 1000;
const UPDATE_PARAM = Object.freeze({
  STATUS: 0, STEP: 1, UPDATED_AT: 2, COMPLETED_AT: 3, ERROR: 4, HISTORY: 5,
  REPLICA_ID: 6, OPERATION_ID: 7, EXPECTED_STEP: 8,
});
const LEDGER_WRITE = Object.freeze({
  COMMITS: 'commits',
  FAILS_RETRYABLY: 'fails_retryably',
  FAILS_PERMANENTLY: 'fails_permanently',
});

function buildRetryableLedgerFailure() {
  const participantFailure = {deferRetry: true, retryAfterMs: RETRY_AFTER_MS};
  return {
    success: false,
    error: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [participantFailure],
    firstFailedParticipant: participantFailure,
  };
}

function buildPermanentLedgerFailure() {
  const participantFailure = {
    code: 'SQLITE_CONSTRAINT',
    error: 'UNIQUE constraint failed: replica_operations.operation_id',
  };
  return {
    success: false,
    error: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [participantFailure],
    firstFailedParticipant: participantFailure,
  };
}

/**
 * The one replica_operations compare-and-set store for coordinator tests:
 * it applies the repository's status/step UPDATE exactly as SQLite would,
 * honouring every guard its WHERE carries (the expected-step CAS, the
 * first-terminal-wins completed_at IS NULL guard, the create-admission
 * absence guard). A refused write answers affectedRows 0 and changes
 * nothing, so a test whose mock routes this UPDATE elsewhere (an empty
 * read) can no longer hide a refused write.
 * @param {Object} options
 * @param {Function} options.readRow - (operationId) => the mutable row, or
 *   null when no row exists.
 * @param {Function} [options.onRefused] - Called with {operationId, step,
 *   expectedStep, durableStep} for each refused write.
 * @return {Object} {isStepUpdate(sql), apply(sql, params)}.
 */
function createReplicaOperationsCasStore({readRow, onRefused = () => {}}) {
  const isStepUpdate = (sql) => {
    const text = String(sql).trim();
    return text.startsWith(UPDATE_OPERATION_SQL_PREFIX) &&
      text.includes(UPDATE_OPERATION_STEP_SET);
  };
  const apply = (sql, params = []) => {
    const where = String(sql).split(SQL_WHERE)[1] || '';
    const operationId = params[UPDATE_PARAM.OPERATION_ID];
    const step = params[UPDATE_PARAM.STEP];
    const expectedStep = EXPECTED_STEP_CAS_PATTERN.test(where) ?
      params[UPDATE_PARAM.EXPECTED_STEP] : null;
    const row = readRow(operationId);
    if (isCasUpdateRefused(row, where, expectedStep)) {
      onRefused({operationId, step, expectedStep,
        durableStep: row?.workflow_step ?? null});
      return {success: true, affectedRows: 0};
    }
    row.status = params[UPDATE_PARAM.STATUS];
    row.workflow_step = step;
    row.updated_at = params[UPDATE_PARAM.UPDATED_AT];
    row.completed_at = params[UPDATE_PARAM.COMPLETED_AT];
    row.error_message = params[UPDATE_PARAM.ERROR];
    row.steps_history = params[UPDATE_PARAM.HISTORY];
    row.replica_id = params[UPDATE_PARAM.REPLICA_ID];
    return {success: true, affectedRows: 1};
  };
  return Object.freeze({isStepUpdate, apply});
}

function isPresent(value) {
  return value !== null && value !== undefined;
}

// Each guard the WHERE carries refuses as SQLite would: no row, another
// step than the expected one, a terminal row, a create-admission row.
function isCasUpdateRefused(row, where, expectedStep) {
  return !row ||
    (expectedStep !== null && row.workflow_step !== expectedStep) ||
    (TERMINAL_GUARD_PATTERN.test(where) && isPresent(row.completed_at)) ||
    (CREATE_ADMISSION_ABSENT_PATTERN.test(where) &&
      isPresent(row.create_admission_state));
}

/**
 * Route a mock's executeQuery through the shared CAS store first: the
 * status/step UPDATE never reaches the mock's read matching.
 * @param {Object} storeOptions - createReplicaOperationsCasStore options.
 * @param {Function} executeQuery - The mock's own (sql, params) handler.
 * @return {Function} (sql, params) => result.
 */
function withReplicaOperationsCas(storeOptions, executeQuery) {
  const store = createReplicaOperationsCasStore(storeOptions);
  return async (sql, params = []) => (store.isStepUpdate(sql) ?
    store.apply(sql, params) : executeQuery(sql, params));
}

function buildStepsHistory(steps, nowMs, partitionId) {
  return JSON.stringify(steps.map((step) => ({
    step,
    timestamp: nowMs - OPERATION_AGE_MS,
    sourceReplicaId: `${partitionId}-r1`,
  })));
}

/**
 * @param {Object} [options]
 * @param {string} [options.type] - Operation type.
 * @param {string} [options.partitionId]
 * @param {string[]} [options.durableSteps] - Steps the durable row already
 *   committed, in order; the last is its current step.
 * @param {Function} [options.ledgerWrite] - (step) => LEDGER_WRITE.
 * @return {Object} The world.
 */
// The coordinator's storage doubles over one in-memory table reader:
// transactions commit, SQL answers empty, and the cache serves rowsOf.
function buildRowsOfCoordinatorStorage(rowsOf) {
  return {
    transactionCoordinator: {
      begin: async () => ({success: true}),
      commit: async () => ({success: true}),
      rollback: async () => ({success: true}),
    },
    sqlQueryEngine: {
      executeQuery: async () => ({success: true, rows: [], affectedRows: 0}),
    },
    systemTableCache: {
      get(tableName, key) {
        return rowsOf(tableName).find((row) =>
          (row.operation_id || row.service_id) === key) || null;
      },
      getAll: rowsOf,
      filter(tableName, predicate) {
        return rowsOf(tableName).filter(predicate);
      },
    },
  };
}

function createDurableStepWorld(options = {}) {
  const type = options.type || OperationType.ADD;
  const partitionId = options.partitionId || 'sql_write_operations-p1';
  const replicaId = `${partitionId}-r4`;
  const durableSteps = options.durableSteps || [WORKFLOW_STEP.PENDING];
  const nowMs = Date.now();
  const world = {
    operationId: OPERATION_ID,
    partitionId,
    replicaId,
    ledgerWrite: options.ledgerWrite || (() => LEDGER_WRITE.COMMITS),
    durable: {
      operation_id: OPERATION_ID,
      type,
      partition_id: partitionId,
      replica_id: replicaId,
      source_node_id: type === OperationType.REPLACE ? SOURCE_NODE_ID : null,
      target_node_id: OWNER_NODE_ID,
      status: ReplicaStatus.PENDING,
      workflow_step: durableSteps.at(-1),
      created_at: nowMs - OPERATION_AGE_MS,
      updated_at: nowMs - OPERATION_AGE_MS,
      completed_at: null,
      error_message: null,
      entity_type: 'partition',
      entity_id: partitionId,
      steps_history: buildStepsHistory(durableSteps, nowMs, partitionId),
    },
    service: null,
    deliveries: [],
    timers: [],
    writeAttempts: [],
    refusedCasWrites: [],
  };

  const readAuthoritative = async (tableName) => {
    if (tableName === REPLICA_OPERATIONS_TABLE) {
      return {success: true, source: READ_SOURCE, rows: [{...world.durable}]};
    }
    if (tableName === SERVICES_TABLE) {
      return {
        success: true,
        source: READ_SOURCE,
        rows: world.service ? [{...world.service}] : [],
      };
    }
    return {success: true, source: READ_SOURCE, rows: []};
  };
  // The cache holds committed state only: it mirrors the durable row.
  const rowsOf = (tableName) => {
    if (tableName === REPLICA_OPERATIONS_TABLE) return [world.durable];
    if (tableName === SERVICES_TABLE) {
      return world.service ? [world.service] : [];
    }
    return [];
  };
  const casStore = createReplicaOperationsCasStore({
    readRow: (operationId) =>
      operationId === world.durable.operation_id ? world.durable : null,
    onRefused: ({step, expectedStep, durableStep}) => {
      world.refusedCasWrites.push({step, expectedStep, durableStep});
    },
  });
  const applyOperationUpdate = (sql, params) => {
    const step = params[UPDATE_PARAM.STEP];
    const expectedStep = EXPECTED_STEP_CAS_PATTERN.test(
      String(sql).split(SQL_WHERE)[1] || '') ?
      params[UPDATE_PARAM.EXPECTED_STEP] : null;
    world.writeAttempts.push({step, expectedStep});
    const verdict = world.ledgerWrite(step);
    if (verdict === LEDGER_WRITE.FAILS_RETRYABLY) {
      return buildRetryableLedgerFailure();
    }
    if (verdict === LEDGER_WRITE.FAILS_PERMANENTLY) {
      return buildPermanentLedgerFailure();
    }
    return casStore.apply(sql, params);
  };

  world.startCoordinator = () => {
    const coordinator = new RebalanceCoordinator(withNodeReadinessService(
      'RebalanceCoordinator',
      {
        nodeId: OWNER_NODE_ID,
        ...buildRowsOfCoordinatorStorage(rowsOf),
        cdcIntegrationService: {
          executeAuthoritativeSystemTableRead: readAuthoritative,
          refreshAuthoritativeCacheRow: async () => true,
        },
        controlPlaneSystemTableGateway: {
          readRows: readAuthoritative,
          readAuthoritativeRows: readAuthoritative,
          async executeQuery(sql, params = []) {
            return casStore.isStepUpdate(sql) ?
              applyOperationUpdate(sql, params) :
              {success: true, rows: [], affectedRows: 0};
          },
        },
        messageRouter: {
          async deliver(target, request) {
            world.deliveries.push({target, request});
            return buildDeliveryEnvelope({acknowledged: true}, {
              status: 'initiated',
            });
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {
              targetReplicaCount: MIN_REPLICA_COUNT,
              minReplicaCount: MIN_REPLICA_COUNT,
            };
          },
        },
        enableTimeouts: false,
        setTimeoutFn(callback, delayMs) {
          const timer = {callback, delayMs, coordinator};
          world.timers.push(timer);
          return timer;
        },
        clearTimeoutFn(timer) {
          if (timer) timer.cleared = true;
        },
      },
    ));
    coordinator.initialize();
    world.coordinator = coordinator;
    world.owner = coordinator.workflowOwner;
    return coordinator;
  };

  world.setTargetService = (status, raftRole = 'follower') => {
    world.service = status === null ? null : {
      service_id: replicaId,
      replica_id: replicaId,
      partition_id: partitionId,
      node_id: OWNER_NODE_ID,
      service_type: 'partition',
      status,
      raft_role: raftRole,
      address: `${OWNER_NODE_ID}/partition/${replicaId}`,
    };
  };
  world.liveTimers = () => world.timers.filter((timer) =>
    !timer.cleared && !timer.fired && timer.coordinator === world.coordinator);
  world.fireTimers = async () => {
    for (const timer of world.liveTimers()) {
      timer.fired = true;
      await timer.callback();
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  world.durableOperation = () =>
    world.owner.repository.rowToOperation({...world.durable});
  world.durableHistorySteps = () =>
    JSON.parse(world.durable.steps_history).map((entry) => entry.step);
  world.createDeliveries = () => world.deliveries.filter((delivery) =>
    delivery.request?.type === 'CREATE_REPLICA');
  world.startCoordinator();
  return world;
}

export {
  LEDGER_WRITE,
  OPERATION_ID,
  buildRowsOfCoordinatorStorage,
  createDurableStepWorld,
  createReplicaOperationsCasStore,
  withReplicaOperationsCas,
};
