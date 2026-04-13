/**
 * Property Test: REMOVE Workflow Step Progression
 *
 * Property 6: For any REMOVE operation, the workflow steps SHALL progress in order:
 * PENDING → SENDING → STOPPING → REMOVED.
 * Each step transition SHALL be logged with timestamp.
 *
 * Validates: Requirements 4.2, 4.3
 *
 * Feature: simplified-rebalancing-architecture, Property 6: REMOVE Workflow Step
 * Progression
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  OperationType,
  ReplicaStatus,
  REMOVE_WORKFLOW_STEPS,
  WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

test('Property 6: REMOVE Workflow Step Progression', async (t) => {
  await t.test('REMOVE operation starts at PENDING step', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.REMOVE,
              ...move,
            });

            return operation.workflowStep === 'PENDING' &&
              operation.stepsHistory.length === 1 &&
              operation.stepsHistory[0].step === 'PENDING';
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE operations start at PENDING step');
  });

  await t.test('updateStep progresses through REMOVE workflow in order', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition',
        nodeId: 'test-node',
        replicaId: 'test-replica',
      });

      // Verify initial state
      t.equal(operation.workflowStep, 'PENDING', 'Initial step is PENDING');
      t.equal(operation.stepsHistory.length, 1, 'Initial history has 1 entry');

      // Progress through each step
      const expectedSteps = ['SENDING', 'STOPPING', 'REMOVED'];

      for (let i = 0; i < expectedSteps.length; i++) {
        const step = expectedSteps[i];
        await coordinator.updateStep(operation, step);

        t.equal(operation.workflowStep, step, `Step is ${step}`);
        t.equal(operation.stepsHistory.length, i + 2,
          `History has ${i + 2} entries after ${step}`);
        t.equal(operation.stepsHistory[i + 1].step, step,
          `History entry ${i + 1} is ${step}`);
      }
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('each step transition has timestamp', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.REMOVE,
              ...move,
            });

            // Progress through steps
            const steps = ['SENDING', 'STOPPING', 'REMOVED'];
            for (const step of steps) {
              await coordinator.updateStep(operation, step);
            }

            // Verify all history entries have timestamps
            const allHaveTimestamps = operation.stepsHistory.every((entry) =>
              typeof entry.timestamp === 'number' && entry.timestamp > 0,
            );

            // Verify timestamps are in order
            let timestampsInOrder = true;
            for (let i = 1; i < operation.stepsHistory.length; i++) {
              if (operation.stepsHistory[i].timestamp <
                  operation.stepsHistory[i - 1].timestamp) {
                timestampsInOrder = false;
                break;
              }
            }

            return allHaveTimestamps && timestampsInOrder;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('Each step transition has timestamp in order');
  });

  await t.test('REMOVE workflow steps match expected sequence', async (t) => {
    const expectedSteps = ['PENDING', 'SENDING', 'STOPPING', 'REMOVED'];

    t.same(REMOVE_WORKFLOW_STEPS, expectedSteps,
      'REMOVE_WORKFLOW_STEPS matches expected sequence');
  });

  await t.test('step transitions update status correctly', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition',
        nodeId: 'test-node',
        replicaId: 'test-replica',
      });

      // Verify initial status
      t.equal(operation.status, ReplicaStatus.PENDING,
        'Initial status is pending');

      // SENDING should keep status as pending
      await coordinator.updateStep(operation, 'SENDING');
      t.equal(operation.status, WORKFLOW_STEP_TO_STATUS['SENDING'],
        'SENDING maps to correct status');

      // STOPPING should change status to removing
      await coordinator.updateStep(operation, 'STOPPING');
      t.equal(operation.status, ReplicaStatus.REMOVING,
        'STOPPING maps to removing status');

      // REMOVED should change status to removed
      await coordinator.updateStep(operation, 'REMOVED');
      t.equal(operation.status, ReplicaStatus.REMOVED,
        'REMOVED maps to removed status');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('completeOperation sets final REMOVED step for REMOVE', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.REMOVE,
              ...move,
            });

            await coordinator.completeOperation(operation);

            return operation.workflowStep === 'REMOVED' &&
              operation.status === ReplicaStatus.REMOVED &&
              operation.completedAt !== null;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('completeOperation sets final REMOVED step for REMOVE');
  });

  await t.test('stepChanged event is emitted on step transitions', async (t) => {
    const coordinator = createTestCoordinator();
    const stepChanges = [];

    coordinator.on('stepChanged', (event) => {
      stepChanges.push(event);
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.REMOVE,
        partitionId: 'test-partition',
        nodeId: 'test-node',
        replicaId: 'test-replica',
      });

      // Progress through steps
      await coordinator.updateStep(operation, 'SENDING');
      await coordinator.updateStep(operation, 'STOPPING');

      t.equal(stepChanges.length, 2, 'Two step changes emitted');
      t.equal(stepChanges[0].previousStep, 'PENDING',
        'First change from PENDING');
      t.equal(stepChanges[0].newStep, 'SENDING',
        'First change to SENDING');
      t.equal(stepChanges[1].previousStep, 'SENDING',
        'Second change from SENDING');
      t.equal(stepChanges[1].newStep, 'STOPPING',
        'Second change to STOPPING');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('REMOVE operation preserves replicaId', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
          replicaId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.REMOVE,
              ...move,
            });

            return operation.replicaId === move.replicaId;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE operation preserves replicaId');
  });
});
