/**
 * Regression witness for a storage-reservation INSERT whose durable outcome
 * is lost before the coordinator receives the answer. The operation ID owns
 * the deterministic reservation ID, so retry must adopt the exact durable
 * hold instead of colliding with it or allocating another hold.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, TIME_MS, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
const STORAGE_RESERVATION_AUTHORITY_ERROR = Object.freeze({
  OPERATION_AUTHORITY_UNAVAILABLE:
    'Authoritative replica operation is unavailable for reservation adoption',
  OPERATION_ABSENT:
    'Authoritative replica operation is absent for reservation adoption',
  OPERATION_TERMINAL:
    'Authoritative replica operation is terminal for reservation adoption',
  OPERATION_MISMATCH:
    'Authoritative replica operation identity mismatches reservation request',
});
import {
  createMockCache,
  createMockCdcService,
  createMockControlPlaneReadinessService,
  createMockMessageRouter,
  createMockPolicyService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const LOST_OUTCOME_ERROR = 'Transaction already active on this partition';
const UNIQUE_RESERVATION_ERROR =
  'UNIQUE constraint failed: storage_reservations.reservation_id';

function initializeConfig() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: 2,
      serviceReplicaOverheadBytes: 1,
      storageReservationTtlMs:
        STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    },
  });
}

function buildOperationRow(params) {
  const [
    operationId,
    type,
    partitionId,
    replicaId,
    targetClaimKey,
    sourceNodeId,
    targetNodeId,
    status,
    workflowStep,
    createdAt,
    updatedAt,
    completedAt,
    errorMessage,
    stepsHistory,
    entityType,
    entityId,
    membershipPublicationEpoch,
  ] = params;
  return {
    operation_id: operationId,
    type,
    partition_id: partitionId,
    replica_id: replicaId,
    target_claim_key: targetClaimKey,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    status,
    workflow_step: workflowStep,
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: completedAt,
    error_message: errorMessage,
    steps_history: stepsHistory,
    entity_type: entityType,
    entity_id: entityId,
    membership_publication_epoch: membershipPublicationEpoch,
  };
}

function buildReservationRow(params) {
  const [
    reservationId,
    operationId,
    entityType,
    entityId,
    partitionId,
    targetNodeId,
    estimatedBytes,
    amplificationFactor,
    status,
    reasonCode,
    createdAt,
    updatedAt,
    expiresAt,
  ] = params;
  return {
    reservation_id: reservationId,
    operation_id: operationId,
    entity_type: entityType,
    entity_id: entityId,
    partition_id: partitionId,
    target_node_id: targetNodeId,
    estimated_bytes: estimatedBytes,
    amplification_factor: amplificationFactor,
    status,
    reason_code: reasonCode,
    created_at: createdAt,
    updated_at: updatedAt,
    expires_at: expiresAt,
    released_at: null,
  };
}

function createLostOutcomeSqlEngine(options = {}) {
  const operations = new Map();
  const reservations = new Map();
  const reservationMutationOptions = [];
  const reservationReadOptions = [];
  const operationReadOptions = [];
  let reservationInsertAttempts = 0;

  function insertReservation(sql, params, queryOptions) {
    reservationInsertAttempts++;
    reservationMutationOptions.push(queryOptions);
    const row = buildReservationRow(params);
    const existing = reservations.get(row.reservation_id);
    if (!existing) {
      reservations.set(row.reservation_id, row);
      return {
        success: false,
        error: LOST_OUTCOME_ERROR,
        priorMutationDeliveryMayHaveBeenAttempted: true,
      };
    }
    if (sql.includes('INSERT OR IGNORE')) {
      return {success: true, changes: 0};
    }
    return {success: false, error: UNIQUE_RESERVATION_ERROR};
  }

  async function readReservations(params, queryOptions) {
    reservationReadOptions.push(queryOptions);
    if (options.reservationReadFailure === true) {
      return {success: false, error: 'reservation owner unavailable'};
    }
    const [operationId, status] = params;
    const result = {
      success: true,
      rows: Array.from(reservations.values()).filter((row) =>
        row.operation_id === operationId && row.status === status,
      ),
    };
    if (typeof options.onReservationRead === 'function') {
      await options.onReservationRead({operations, reservations});
    }
    return result;
  }

  function readOperation(params, queryOptions) {
    operationReadOptions.push(queryOptions);
    if (options.operationReadFailure === true) {
      return {success: false, error: 'operation owner unavailable'};
    }
    const row = operations.get(params[0]);
    return {success: true, rows: row ? [row] : []};
  }

  return {
    operations,
    reservations,
    reservationMutationOptions,
    reservationReadOptions,
    operationReadOptions,
    get reservationInsertAttempts() {
      return reservationInsertAttempts;
    },
    async executeQuery(sql, params, queryOptions = {}) {
      if (sql.includes('INSERT INTO replica_operations')) {
        const row = buildOperationRow(params);
        operations.set(row.operation_id, row);
        return {success: true, changes: 1};
      }
      if (sql.includes('INSERT') && sql.includes('storage_reservations')) {
        return insertReservation(sql, params, queryOptions);
      }
      if (
        sql.includes(
          'SELECT * FROM storage_reservations WHERE operation_id = ?',
        )
      ) {
        return readReservations(params, queryOptions);
      }
      if (
        sql.includes('SELECT * FROM replica_operations') &&
        sql.includes('operation_id = ?')
      ) {
        return readOperation(params, queryOptions);
      }
      if (sql.includes('UPDATE replica_operations')) {
        return {success: true, changes: 1};
      }
      return {success: true, rows: []};
    },
  };
}

function buildOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: 'operation-reservation-authority',
    type: OperationType.ADD,
    partitionId: 'partition-reservation-authority',
    replicaId: 'partition-reservation-authority-r4',
    targetClaimKey: 'partition-reservation-authority:node-target',
    sourceNodeId: 'node-source',
    targetNodeId: 'node-target',
    entityType: SERVICE_TYPE.PARTITION,
    entityId: 'partition-reservation-authority',
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    ...overrides,
  };
}

function seedOperation(sqlEngine, operation) {
  sqlEngine.operations.set(operation.operationId, buildOperationRow([
    operation.operationId,
    operation.type,
    operation.partitionId,
    operation.replicaId,
    operation.targetClaimKey,
    operation.sourceNodeId,
    operation.targetNodeId,
    operation.status,
    operation.workflowStep,
    operation.createdAt,
    operation.updatedAt,
    operation.completedAt,
    operation.errorMessage,
    JSON.stringify(operation.stepsHistory),
    operation.entityType,
    operation.entityId,
    operation.membershipPublicationEpoch,
  ]));
}

function seedReservation(sqlEngine, operation, overrides = {}) {
  const createdAt = Date.now() - NUM.THOUSAND;
  const row = {
    reservation_id: `res-${operation.operationId}`,
    operation_id: operation.operationId,
    entity_type: operation.entityType,
    entity_id: operation.entityId,
    partition_id: operation.partitionId,
    target_node_id: operation.targetNodeId,
    estimated_bytes: 777,
    amplification_factor: 1,
    status: RESERVATION_STATUS.ACTIVE,
    reason_code: RESERVATION_REASON.ADD_REPLICA,
    created_at: createdAt,
    updated_at: createdAt,
    expires_at: createdAt + STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    released_at: null,
    ...overrides,
  };
  sqlEngine.reservations.set(row.reservation_id, row);
  return row;
}

function createCoordinator(sqlEngine) {
  const cache = createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});
  const gateway = {
    readAuthoritativeRows: async (_table, sql, params = [], options = {}) =>
      sqlEngine.executeQuery(sql, params, options),
    readRows: async (_table, sql, params = [], options = {}) =>
      sqlEngine.executeQuery(sql, params, options),
    executeQuery: async (sql, params = [], options = {}) =>
      sqlEngine.executeQuery(sql, params, options),
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: 'reservation-owner-node',
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: gateway,
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    enableTimeouts: false,
    storageAccountingService: accounting,
    storageAdmissionService: {
      checkAdd: async () => ({
        allowed: true,
        decisionType: 'admitted',
        blockingReasons: [],
        eligibleNodeIds: [],
        ineligibleNodes: [],
      }),
      checkReplace: async () => ({
        allowed: true,
        decisionType: 'admitted',
        blockingReasons: [],
        eligibleNodeIds: [],
        ineligibleNodes: [],
      }),
    },
  });
  coordinator.initialize();
  coordinator.repository.waitForOperationPersistRetry = async () => {};
  return coordinator;
}

test('lost reservation INSERT answer adopts one exact durable capacity hold',
  async (t) => {
    initializeConfig();
    const sqlEngine = createLostOutcomeSqlEngine();
    const coordinator = createCoordinator(sqlEngine);
    let creationEvents = 0;
    coordinator.on(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, () => {
      creationEvents++;
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-lost-reservation-answer',
        nodeId: 'reservation-target-node',
        entityType: SERVICE_TYPE.PARTITION,
        entityId: 'partition-lost-reservation-answer',
        emitOperationCreated: false,
      });

      t.equal(operation.workflowStep, WORKFLOW_STEP.PENDING,
        'the exact live operation remains dispatchable');
      t.equal(sqlEngine.reservations.size, 1,
        'one durable capacity hold exists after the lost answer');
      const reservation = Array.from(sqlEngine.reservations.values())[0];
      t.equal(reservation.operation_id, operation.operationId,
        'the hold belongs to the exact live operation generation');
      t.equal(reservation.reservation_id, `res-${operation.operationId}`,
        'the deterministic reservation identity is retained');
      t.equal(reservation.status, RESERVATION_STATUS.ACTIVE,
        'the adopted hold remains active');
      t.equal(reservation.reason_code, RESERVATION_REASON.ADD_REPLICA,
        'the durable hold retains the canonical admission reason');
      t.ok(reservation.estimated_bytes > 0,
        'the durable admission-time estimate remains authoritative');
      t.equal(coordinator.stats.reservationsCreated, 0,
        'adoption does not duplicate the creation statistic');
      t.equal(creationEvents, 0,
        'adoption does not duplicate the observational creation event');
      t.equal(sqlEngine.reservationInsertAttempts, 2,
        'retry uses the existing bounded mutation lane after an ambiguous answer');
      const mutationBudgets = sqlEngine.reservationMutationOptions
        .map((options) => options.timeoutBudget);
      t.ok(mutationBudgets.every((budget) => budget === mutationBudgets[0]),
        'both mutation attempts share one timeout budget object');
      t.equal(
        mutationBudgets[0]?.configuredBudgetMs,
        TIME_MS.SECOND * (NUM.TEN + NUM.FIVE),
        'the owner keeps the existing operation-persist deadline',
      );
      t.equal(
        sqlEngine.reservationReadOptions[0]?.timeoutBudget,
        mutationBudgets[0],
        'reservation reconciliation consumes the same deadline',
      );
      t.equal(
        sqlEngine.operationReadOptions.at(-1)?.timeoutBudget,
        mutationBudgets[0],
        'the final live-operation witness consumes the same deadline',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('exact ACTIVE reservation adoption keeps its durable estimate past TTL',
  async (t) => {
    initializeConfig();
    const sqlEngine = createLostOutcomeSqlEngine();
    const coordinator = createCoordinator(sqlEngine);
    const operation = buildOperation();
    seedOperation(sqlEngine, operation);
    const createdAt = Date.now() - (NUM.THOUSAND * NUM.TEN);
    const reservation = seedReservation(sqlEngine, operation, {
      created_at: createdAt,
      updated_at: createdAt,
      expires_at: createdAt + NUM.THOUSAND,
      estimated_bytes: 991,
    });

    try {
      const result = await coordinator.ensureReservationForOperation(operation);

      t.equal(
        result.outcome,
        OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
        'the exact live operation adopts its durable ACTIVE hold past TTL',
      );
      t.equal(sqlEngine.reservations.size, 1,
        'adoption retains exactly one capacity hold');
      t.equal(reservation.estimated_bytes, 991,
        'the admission-time estimate is retained without recomputation');
      t.equal(sqlEngine.reservationInsertAttempts, 0,
        'an exact authoritative hold does not reissue INSERT');
      t.equal(coordinator.stats.reservationsCreated, 0,
        'adoption does not count as local creation');
    } finally {
      await coordinator.shutdown();
    }
  });

test('concurrent lost-outcome repair callers share one durable capacity hold',
  async (t) => {
    initializeConfig();
    const sqlEngine = createLostOutcomeSqlEngine();
    const coordinator = createCoordinator(sqlEngine);
    const operation = buildOperation();
    seedOperation(sqlEngine, operation);
    let creationEvents = 0;
    coordinator.on(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, () => {
      creationEvents++;
    });

    try {
      const results = await Promise.all([
        coordinator.ensureReservationForOperation(operation),
        coordinator.ensureReservationForOperation({...operation}),
      ]);

      t.same(
        results.map((result) => result.outcome),
        [
          OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
          OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
        ],
        'both callers converge on the same already-applied hold',
      );
      t.equal(sqlEngine.reservations.size, 1,
        'concurrent repair leaves one durable capacity hold');
      t.equal(coordinator.stats.reservationsCreated, 0,
        'ambiguous concurrent adoption does not duplicate creation stats');
      t.equal(creationEvents, 0,
        'ambiguous concurrent adoption does not duplicate creation events');
    } finally {
      await coordinator.shutdown();
    }
  });

test('terminal and absent operation authority cannot adopt a reservation',
  async (t) => {
    initializeConfig();
    const absentEngine = createLostOutcomeSqlEngine();
    const absentCoordinator = createCoordinator(absentEngine);
    const operation = buildOperation();
    seedReservation(absentEngine, operation);
    try {
      const absent =
        await absentCoordinator.ensureReservationForOperation(operation);
      t.equal(absent.outcome, OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
        'confirmed absent operation fails closed');
      t.equal(absent.error,
        STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_ABSENT,
        'absence is distinguished from reservation conflict');
      t.equal(absentEngine.reservationInsertAttempts, 0,
        'absence cannot drive another capacity mutation');
    } finally {
      await absentCoordinator.shutdown();
    }

    const terminalEngine = createLostOutcomeSqlEngine();
    const terminalCoordinator = createCoordinator(terminalEngine);
    const terminalOperation = buildOperation({
      status: 'failed',
      workflowStep: WORKFLOW_STEP.FAILED,
      completedAt: Date.now(),
    });
    seedOperation(terminalEngine, terminalOperation);
    seedReservation(terminalEngine, terminalOperation);
    try {
      const terminal =
        await terminalCoordinator.ensureReservationForOperation(
          terminalOperation,
        );
      t.equal(terminal.outcome, OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
        'terminal operation fails closed');
      t.equal(terminal.error,
        STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_TERMINAL,
        'terminal authority is classified explicitly');
      t.equal(terminalEngine.reservationInsertAttempts, 0,
        'terminal authority cannot drive another capacity mutation');
    } finally {
      await terminalCoordinator.shutdown();
    }
  });

test('owner unavailability is distinct from confirmed absence', async (t) => {
  initializeConfig();
  const operation = buildOperation();
  const operationUnavailableEngine = createLostOutcomeSqlEngine({
    operationReadFailure: true,
  });
  const operationUnavailableCoordinator =
    createCoordinator(operationUnavailableEngine);
  seedReservation(operationUnavailableEngine, operation);
  try {
    const result = await operationUnavailableCoordinator
      .ensureReservationForOperation(operation);
    t.equal(result.outcome, OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
      'unavailable operation owner fails closed');
    t.equal(result.error,
      STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_AUTHORITY_UNAVAILABLE,
      'operation owner unavailability is named');
  } finally {
    await operationUnavailableCoordinator.shutdown();
  }

  const reservationUnavailableEngine = createLostOutcomeSqlEngine({
    reservationReadFailure: true,
  });
  const reservationUnavailableCoordinator =
    createCoordinator(reservationUnavailableEngine);
  seedOperation(reservationUnavailableEngine, operation);
  try {
    const result = await reservationUnavailableCoordinator
      .ensureReservationForOperation(operation);
    t.equal(result.outcome, OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
      'unavailable reservation owner fails closed');
    t.equal(result.error, 'reservation owner unavailable',
      'the reservation owner failure remains observable');
  } finally {
    await reservationUnavailableCoordinator.shutdown();
  }
});

test('terminalization during reservation read cannot authorize adoption',
  async (t) => {
    initializeConfig();
    const operation = buildOperation();
    const sqlEngine = createLostOutcomeSqlEngine({
      onReservationRead({operations}) {
        const row = operations.get(operation.operationId);
        operations.set(operation.operationId, {
          ...row,
          status: 'failed',
          workflow_step: WORKFLOW_STEP.FAILED,
          completed_at: Date.now(),
        });
      },
    });
    const coordinator = createCoordinator(sqlEngine);
    seedOperation(sqlEngine, operation);
    seedReservation(sqlEngine, operation);

    try {
      const result = await coordinator.ensureReservationForOperation(operation);
      t.equal(result.outcome, OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
        'the adoption is refused after concurrent terminalization');
      t.equal(result.error,
        STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_TERMINAL,
        'the final operation observation owns the refusal');
      t.equal(sqlEngine.reservationInsertAttempts, 0,
        'terminalization does not drive another reservation mutation');
    } finally {
      await coordinator.shutdown();
    }
  });

test('every immutable operation identity conflict refuses reservation adoption',
  async (t) => {
    const conflicts = [
      ['type', OperationType.REPLACE],
      ['partitionId', 'partition-successor'],
      ['replicaId', 'partition-reservation-authority-r5'],
      ['targetClaimKey', 'partition-reservation-authority:node-successor'],
      ['sourceNodeId', 'node-other-source'],
      ['targetNodeId', 'node-other-target'],
      ['entityType', SERVICE_TYPE.MESSAGE_GROUP],
      ['entityId', 'entity-successor'],
      ['membershipPublicationEpoch', 7],
    ];
    for (const [field, value] of conflicts) {
      initializeConfig();
      const sqlEngine = createLostOutcomeSqlEngine();
      const coordinator = createCoordinator(sqlEngine);
      const requested = buildOperation();
      seedOperation(sqlEngine, {...requested, [field]: value});
      seedReservation(sqlEngine, requested);
      try {
        const result =
          await coordinator.ensureReservationForOperation(requested);
        t.equal(
          result.error,
          STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_MISMATCH,
          `${field} conflict is not adopted`,
        );
        t.equal(sqlEngine.reservationInsertAttempts, 0,
          `${field} conflict issues no reservation mutation`);
      } finally {
        await coordinator.shutdown();
      }
    }
  });

test('reservation identity, state, estimate, and timestamps all fail closed',
  async (t) => {
    const conflicts = [
      ['reservation_id', 'res-conflicting-generation'],
      ['entity_type', SERVICE_TYPE.MESSAGE_GROUP],
      ['entity_id', 'entity-conflict'],
      ['partition_id', 'partition-conflict'],
      ['target_node_id', 'node-conflict'],
      ['reason_code', RESERVATION_REASON.REPLACE_REPLICA],
      ['amplification_factor', 2],
      ['estimated_bytes', 0],
      ['released_at', Date.now()],
      ['created_at', null],
      ['updated_at', 1],
      ['expires_at', 1],
    ];
    for (const [field, value] of conflicts) {
      initializeConfig();
      const sqlEngine = createLostOutcomeSqlEngine();
      const coordinator = createCoordinator(sqlEngine);
      const operation = buildOperation();
      seedOperation(sqlEngine, operation);
      seedReservation(sqlEngine, operation, {[field]: value});
      try {
        const result =
          await coordinator.ensureReservationForOperation(operation);
        t.equal(result.outcome,
          OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
          `${field} conflict fails closed`);
        t.match(result.error, /reservation/i,
          `${field} conflict returns a reservation authority error`);
      } finally {
        await coordinator.shutdown();
      }
    }
  });

test('RELEASED and EXPIRED reservation generations never reactivate',
  async (t) => {
    for (const status of [
      RESERVATION_STATUS.RELEASED,
      RESERVATION_STATUS.EXPIRED,
    ]) {
      initializeConfig();
      const sqlEngine = createLostOutcomeSqlEngine();
      const coordinator = createCoordinator(sqlEngine);
      const operation = buildOperation();
      seedOperation(sqlEngine, operation);
      const reservation = seedReservation(sqlEngine, operation, {
        status,
        released_at: Date.now(),
      });
      try {
        const result =
          await coordinator.ensureReservationForOperation(operation);
        t.equal(result.outcome,
          OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED,
          `${status} generation is refused`);
        t.equal(reservation.status, status,
          `${status} generation is never reactivated`);
        t.equal(sqlEngine.reservations.size, 1,
          `${status} keeps one historical row, not a second hold`);
      } finally {
        await coordinator.shutdown();
      }
    }
  });
