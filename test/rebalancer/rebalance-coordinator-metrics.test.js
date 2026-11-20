/**
 * RebalanceCoordinator Metrics Tests
 * Verifies metrics.rebalance.operation log emission on terminal
 * state transitions (completeOperation, failOperation).
 * Requirements: 9.1, 9.2, 9.3, 10.1, 10.3, 10.4, 11.1, 11.2, 11.3
 */

import {test} from '../../src/test-helpers/tap.js';
import {createTestCoordinator} from './test-helpers.js';
import {METRICS_LOG_TAG} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

function createSpyLogger() {
  const infoCalls = [];
  return {
    calls: infoCalls,
    info(tag, data) {
      infoCalls.push({tag, data});
    },
    error() {},
    warn() {},
    debug() {},
  };
}

function createCoordinator(t, logger) {
  const coordinator = createTestCoordinator();
  coordinator.logger = logger;
  t.teardown(() => coordinator.shutdown());
  return coordinator;
}

function createOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: 'op-123',
    type: OperationType.ADD,
    partitionId: 'nodes-p1',
    entityType: SERVICE_TYPE.PARTITION,
    entityId: 'nodes-p1',
    replicaId: 'nodes-p1-r2',
    sourceNodeId: 'test-node-1',
    targetNodeId: 'test-node-2',
    status: ReplicaStatus.PENDING,
    workflowStep: 'PENDING',
    createdAt: now - 5000,
    updatedAt: now - 5000,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [{step: 'PENDING', timestamp: now - 5000}],
    ...overrides,
  };
}

// =============================================================
// completeOperation — terminal completion metrics
// =============================================================

test('completeOperation emits metrics.rebalance.operation with correct fields',
  async (t) => {
    const logger = createSpyLogger();
    const coordinator = createCoordinator(t, logger);
    const operation = createOperation();

    await coordinator.repository.persistOperationInsert(operation);
    await coordinator.completeOperation(operation);

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.REBALANCE_OPERATION,
    );
    t.ok(metric, 'metrics.rebalance.operation log emitted');
    t.equal(metric.data.operationId, 'op-123');
    t.equal(metric.data.entityType, SERVICE_TYPE.PARTITION);
    t.equal(typeof metric.data.finalState, 'string');
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.end();
  });

test('completeOperation totalDurationMs reflects operation age',
  async (t) => {
    const logger = createSpyLogger();
    const coordinator = createCoordinator(t, logger);
    const operation = createOperation({createdAt: Date.now() - 3000});

    await coordinator.repository.persistOperationInsert(operation);
    await coordinator.completeOperation(operation);

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.REBALANCE_OPERATION,
    );
    t.ok(metric, 'metric emitted');
    t.ok(metric.data.totalDurationMs >= 2900,
      'totalDurationMs reflects elapsed time');
    t.end();
  });

// =============================================================
// failOperation — terminal failure metrics
// =============================================================

test('failOperation emits metrics.rebalance.operation with correct fields',
  async (t) => {
    const logger = createSpyLogger();
    const coordinator = createCoordinator(t, logger);
    const operation = createOperation({
      entityType: SERVICE_TYPE.MESSAGE_GROUP,
    });

    await coordinator.repository.persistOperationInsert(operation);
    await coordinator.failOperation(operation, 'timeout exceeded');

    const metric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.REBALANCE_OPERATION,
    );
    t.ok(metric, 'metrics.rebalance.operation log emitted on failure');
    t.equal(metric.data.operationId, 'op-123');
    t.equal(metric.data.entityType, SERVICE_TYPE.MESSAGE_GROUP);
    t.equal(metric.data.finalState, ReplicaStatus.FAILED);
    t.equal(typeof metric.data.totalDurationMs, 'number');
    t.ok(metric.data.totalDurationMs >= 0, 'totalDurationMs non-negative');
    t.end();
  });

// =============================================================
// Metrics use info level, not debug
// =============================================================

test('rebalance operation metrics use info level not debug',
  async (t) => {
    const debugCalls = [];
    const logger = createSpyLogger();
    logger.debug = (tag, data) => {
      debugCalls.push({tag, data});
    };
    const coordinator = createCoordinator(t, logger);
    const operation = createOperation();

    await coordinator.repository.persistOperationInsert(operation);
    await coordinator.completeOperation(operation);

    const infoMetric = logger.calls.find(
      (c) => c.tag === METRICS_LOG_TAG.REBALANCE_OPERATION,
    );
    const debugMetric = debugCalls.find(
      (c) => c.tag === METRICS_LOG_TAG.REBALANCE_OPERATION,
    );
    t.ok(infoMetric, 'metric emitted at info level');
    t.notOk(debugMetric, 'metric not emitted at debug level');
    t.end();
  });
