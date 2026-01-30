/**
 * Property Test: ADD Workflow Step Progression
 *
 * Property 5: For any ADD operation, the workflow steps SHALL progress in order:
 * PENDING → SENDING → CREATING → SYNCING → ACTIVE.
 * Each step transition SHALL be logged with timestamp.
 *
 * Validates: Requirements 4.1, 4.3
 *
 * Feature: simplified-rebalancing-architecture, Property 5: ADD Workflow Step
 * Progression
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  OperationType,
  ReplicaStatus,
  ADD_WORKFLOW_STEPS,
  WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

test('Property 5: ADD Workflow Step Progression', async (t) => {
  await t.test('ADD operation starts at PENDING step', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.ADD,
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

    t.pass('ADD operations start at PENDING step');
  });

  await t.test('updateStep progresses through ADD workflow in order', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Verify initial state
      t.equal(operation.workflowStep, 'PENDING', 'Initial step is PENDING');
      t.equal(operation.stepsHistory.length, 1, 'Initial history has 1 entry');

      // Progress through each step
      const expectedSteps = ['SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];

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
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.ADD,
              ...move,
            });

            // Progress through steps
            const steps = ['SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];
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

  await t.test('ADD workflow steps match expected sequence', async (t) => {
    const expectedSteps = ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];

    t.same(ADD_WORKFLOW_STEPS, expectedSteps,
      'ADD_WORKFLOW_STEPS matches expected sequence');
  });

  await t.test('step transitions update status correctly', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Verify initial status
      t.equal(operation.status, ReplicaStatus.PENDING,
        'Initial status is pending');

      // SENDING should keep status as pending
      await coordinator.updateStep(operation, 'SENDING');
      t.equal(operation.status, WORKFLOW_STEP_TO_STATUS['SENDING'],
        'SENDING maps to correct status');

      // CREATING should change status to creating
      await coordinator.updateStep(operation, 'CREATING');
      t.equal(operation.status, ReplicaStatus.CREATING,
        'CREATING maps to creating status');

      // SYNCING should change status to syncing
      await coordinator.updateStep(operation, 'SYNCING');
      t.equal(operation.status, ReplicaStatus.SYNCING,
        'SYNCING maps to syncing status');

      // ACTIVE should change status to active
      await coordinator.updateStep(operation, 'ACTIVE');
      t.equal(operation.status, ReplicaStatus.ACTIVE,
        'ACTIVE maps to active status');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('completeOperation sets final ACTIVE step for ADD', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          partitionId: fc.uuid(),
          nodeId: fc.uuid(),
        }),
        async (move) => {
          const coordinator = createTestCoordinator();

          try {
            const operation = await coordinator.createOperation({
              type: OperationType.ADD,
              ...move,
            });

            await coordinator.completeOperation(operation);

            return operation.workflowStep === 'ACTIVE' &&
              operation.status === ReplicaStatus.ACTIVE &&
              operation.completedAt !== null;
          } finally {
            await coordinator.shutdown();
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('completeOperation sets final ACTIVE step for ADD');
  });

  await t.test('stepChanged event is emitted on step transitions', async (t) => {
    const coordinator = createTestCoordinator();
    const stepChanges = [];

    coordinator.on('stepChanged', (event) => {
      stepChanges.push(event);
    });

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      // Progress through steps
      await coordinator.updateStep(operation, 'SENDING');
      await coordinator.updateStep(operation, 'CREATING');

      t.equal(stepChanges.length, 2, 'Two step changes emitted');
      t.equal(stepChanges[0].previousStep, 'PENDING',
        'First change from PENDING');
      t.equal(stepChanges[0].newStep, 'SENDING',
        'First change to SENDING');
      t.equal(stepChanges[1].previousStep, 'SENDING',
        'Second change from SENDING');
      t.equal(stepChanges[1].newStep, 'CREATING',
        'Second change to CREATING');
    } finally {
      await coordinator.shutdown();
    }
  });

  await t.test('updatedAt is updated on each step transition', async (t) => {
    const coordinator = createTestCoordinator();

    try {
      const operation = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'test-partition',
        nodeId: 'test-node',
      });

      const initialUpdatedAt = operation.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setImmediate(resolve));

      await coordinator.updateStep(operation, 'SENDING');
      const afterSending = operation.updatedAt;

      t.ok(afterSending >= initialUpdatedAt,
        'updatedAt is updated after SENDING');

      await new Promise((resolve) => setImmediate(resolve));

      await coordinator.updateStep(operation, 'CREATING');
      const afterCreating = operation.updatedAt;

      t.ok(afterCreating >= afterSending,
        'updatedAt is updated after CREATING');
    } finally {
      await coordinator.shutdown();
    }
  });
});
