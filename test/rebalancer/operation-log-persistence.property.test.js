/**
 * Property Test: Operation Log Persistence
 *
 * Property 10: For any operation created by the RebalanceCoordinator, the
 * operation SHALL be persisted to the replica_operations system table.
 * The persisted record SHALL contain all required fields.
 *
 * Validates: Requirements 9.1, 9.2
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  committedVoterWorld,
  createPlacementBoundTestCoordinator,
} from './placement-bound-coordinator-fixture.js';

const PERSISTENCE_PROPERTY_DEFAULT_PARTITION_ID = 'partition';
const PERSISTENCE_PROPERTY_DEFAULT_REPLICA_SUFFIX = 'r1';

async function createTestCoordinatorWithPersistence(cacheData = {}) {
  const coordinator = await createPlacementBoundTestCoordinator({
    nodeId: 'test-node-1',
    enableTimeouts: false,
    cacheData,
  });
  const [ledgerPartition] = coordinator.ledgerPartitionServices;
  const persistedOperations = {
    get: (operationId) =>
      ledgerPartition.db
        .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(operationId),
  };
  // Persistence of the created record is under test, not dispatch: a created
  // operation rests at its durable PENDING step (the create arm is inert).
  coordinator.armCoordinatorCreatedOperationProgress = async () => false;
  return {coordinator, persistedOperations};
}

function buildPersistencePropertyMove(move = {}) {
  const partitionId =
    move.partitionId || PERSISTENCE_PROPERTY_DEFAULT_PARTITION_ID;
  if (move?.type === OperationType.REMOVE) {
    return {
      ...move,
      partitionId,
      replicaId:
        move.replicaId ||
        `${partitionId}-${PERSISTENCE_PROPERTY_DEFAULT_REPLICA_SUFFIX}`,
    };
  }
  const {replicaId: _omitted, ...rest} = move;
  return {
    ...rest,
    partitionId,
  };
}

test('Property 10: Operation Log Persistence', async (t) => {
  await t.test('operations are persisted to replica_operations table', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            const persisted = persistedOperations.get(operation.operationId);

            return persisted !== undefined &&
              persisted.operation_id === operation.operationId;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Operations are persisted to replica_operations table');
  });

  await t.test('persisted record contains all required fields', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            const persisted = persistedOperations.get(operation.operationId);

            if (!persisted) return false;

            return typeof persisted.operation_id === 'string' &&
              persisted.type === move.type &&
              persisted.partition_id === move.partitionId &&
              typeof persisted.source_node_id === 'string' &&
              persisted.target_node_id === move.nodeId &&
              typeof persisted.status === 'string' &&
              typeof persisted.workflow_step === 'string' &&
              typeof persisted.created_at === 'number' &&
              typeof persisted.updated_at === 'number' &&
              typeof persisted.steps_history === 'string';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Persisted records contain all required fields');
  });

  await t.test('step updates are persisted', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            await coordinator.updateStep(operation, 'SENDING');

            const persisted = persistedOperations.get(operation.operationId);
            if (!persisted) return false;

            return persisted.workflow_step === 'SENDING' &&
              persisted.updated_at >= persisted.created_at;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Step updates are persisted');
  });

  await t.test('completion is persisted with completed_at', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            await coordinator.completeOperation(operation);

            const persisted = persistedOperations.get(operation.operationId);
            if (!persisted) return false;

            const expectedStep = move.type === OperationType.ADD ? 'ACTIVE' : 'REMOVED';
            return typeof persisted.completed_at === 'number' &&
              persisted.completed_at > 0 &&
              persisted.workflow_step === expectedStep;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Completion is persisted with completed_at');
  });

  await t.test('failure is persisted with error_message', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        fc.string({minLength: 1, maxLength: 100})
          .filter((value) => value.trim().length > 0),
        async (move, errorMessage) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            await coordinator.failOperation(operation, errorMessage);

            const persisted = persistedOperations.get(operation.operationId);
            if (!persisted) return false;

            return typeof persisted.completed_at === 'number' &&
              persisted.error_message === errorMessage &&
              persisted.status === ReplicaStatus.FAILED &&
              persisted.workflow_step === 'FAILED';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Failure is persisted with error_message');
  });

  await t.test('steps_history is persisted as JSON', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const request = buildPersistencePropertyMove(move);
          const {coordinator, persistedOperations} =
            await createTestCoordinatorWithPersistence(
              request.replicaId ? committedVoterWorld(request) : {},
            );

          try {
            const operation = await coordinator.createOperation(request);
            await coordinator.updateStep(operation, 'SENDING');
            const nextStep = move.type === OperationType.REMOVE ? 'STOPPING' : 'CREATING';
            await coordinator.updateStep(operation, nextStep);

            const persisted = persistedOperations.get(operation.operationId);
            if (!persisted) return false;

            const stepsHistory = JSON.parse(persisted.steps_history);

            return Array.isArray(stepsHistory) &&
              stepsHistory.length === 3 &&
              stepsHistory[0].step === 'PENDING' &&
              stepsHistory[1].step === 'SENDING' &&
              stepsHistory[2].step === nextStep;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('steps_history is persisted as valid JSON');
  });

  await t.test('getInFlightOperations returns non-terminal operations', async (t) => {
    const {coordinator} = await createTestCoordinatorWithPersistence(
      committedVoterWorld({
        type: OperationType.REMOVE,
        partitionId: 'partition-3',
        nodeId: 'node-3',
        replicaId: 'partition-3-r1',
      }),
    );

    try {
      const op1 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-1',
        nodeId: 'node-1',
      });

      const op2 = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-2',
        nodeId: 'node-2',
      });
      await coordinator.completeOperation(op2);

      const op3 = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'partition-3',
        nodeId: 'node-3',
        replicaId: 'partition-3-r1',
      });
      await coordinator.failOperation(op3, 'Test error');

      const inFlight = await coordinator.getInFlightOperations();

      t.equal(inFlight.length, 1, 'Should return 1 in-flight operation');
      t.equal(inFlight[0].operationId, op1.operationId,
        'Should return the pending operation');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('getInFlightOperations converts row to operation object', async (t) => {
    const {coordinator} = await createTestCoordinatorWithPersistence();

    try {
      await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'partition-1',
        nodeId: 'node-1',
      });

      const inFlight = await coordinator.getInFlightOperations();
      const op = inFlight[0];

      t.ok(op.operationId, 'Has operationId');
      t.ok(op.type, 'Has type');
      t.ok(op.partitionId, 'Has partitionId');
      t.ok(op.sourceNodeId, 'Has sourceNodeId');
      t.ok(op.targetNodeId, 'Has targetNodeId');
      t.ok(op.status, 'Has status');
      t.ok(op.workflowStep, 'Has workflowStep');
      t.ok(op.createdAt, 'Has createdAt');
      t.ok(op.updatedAt, 'Has updatedAt');
      t.ok(Array.isArray(op.stepsHistory), 'Has stepsHistory as array');
    } finally {
      await coordinator.shutdown();
    }
  });
});
