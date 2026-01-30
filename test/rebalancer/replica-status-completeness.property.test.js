/**
 * Property Test: ReplicaStatus Enum Completeness
 *
 * For any replica status used in the system, the ReplicaStatus enum SHALL
 * contain all required values: pending, creating, syncing, active, removing,
 * removed, failed.
 *
 * Validates: Requirements 5.2
 *
 * Feature: simplified-rebalancing-architecture, Property: ReplicaStatus enum
 * contains all required values
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  createOperation,
  getAllStatusValues,
  isValidStatus,
} from '../../src/rebalancer/replica-status.js';

/**
 * Required status values as specified in Requirements 5.2.
 */
const REQUIRED_STATUS_VALUES = [
  'pending',
  'creating',
  'syncing',
  'active',
  'removing',
  'removed',
  'failed',
];

test('Property: ReplicaStatus enum contains all required values', async (t) => {
  await t.test('ReplicaStatus contains all required values', async (t) => {
    const statusValues = getAllStatusValues();

    for (const required of REQUIRED_STATUS_VALUES) {
      t.ok(
        statusValues.includes(required),
        `ReplicaStatus should contain '${required}'`,
      );
    }

    t.equal(
      statusValues.length,
      REQUIRED_STATUS_VALUES.length,
      'ReplicaStatus should have exactly the required number of values',
    );
  });

  await t.test('ReplicaStatus enum keys match values', async (t) => {
    // Verify each enum key maps to its lowercase value
    t.equal(ReplicaStatus.PENDING, 'pending', 'PENDING should map to pending');
    t.equal(ReplicaStatus.CREATING, 'creating', 'CREATING should map to creating');
    t.equal(ReplicaStatus.SYNCING, 'syncing', 'SYNCING should map to syncing');
    t.equal(ReplicaStatus.ACTIVE, 'active', 'ACTIVE should map to active');
    t.equal(ReplicaStatus.REMOVING, 'removing', 'REMOVING should map to removing');
    t.equal(ReplicaStatus.REMOVED, 'removed', 'REMOVED should map to removed');
    t.equal(ReplicaStatus.FAILED, 'failed', 'FAILED should map to failed');
  });

  await t.test('isValidStatus correctly validates status values', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_STATUS_VALUES),
        (status) => {
          // All required status values should be valid
          return isValidStatus(status) === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('All required status values are valid');
  });

  await t.test('isValidStatus rejects invalid status values', async (t) => {
    await fc.assert(
      fc.property(
        fc.string().filter((s) => !REQUIRED_STATUS_VALUES.includes(s)),
        (invalidStatus) => {
          // Non-required status values should be invalid
          return isValidStatus(invalidStatus) === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Invalid status values are rejected');
  });

  await t.test('WORKFLOW_STEP_TO_STATUS maps all steps to valid statuses', async (t) => {
    const allSteps = Object.keys(WORKFLOW_STEP_TO_STATUS);

    for (const step of allSteps) {
      const status = WORKFLOW_STEP_TO_STATUS[step];
      t.ok(
        isValidStatus(status),
        `Step '${step}' should map to valid status '${status}'`,
      );
    }
  });

  await t.test('ADD workflow steps are complete and ordered', async (t) => {
    const expectedSteps = ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];

    t.same(
      ADD_WORKFLOW_STEPS,
      expectedSteps,
      'ADD workflow steps should match expected order',
    );

    // Verify all steps map to valid statuses
    for (const step of ADD_WORKFLOW_STEPS) {
      t.ok(
        WORKFLOW_STEP_TO_STATUS[step] !== undefined,
        `ADD step '${step}' should have a status mapping`,
      );
    }
  });

  await t.test('REMOVE workflow steps are complete and ordered', async (t) => {
    const expectedSteps = ['PENDING', 'SENDING', 'STOPPING', 'REMOVED'];

    t.same(
      REMOVE_WORKFLOW_STEPS,
      expectedSteps,
      'REMOVE workflow steps should match expected order',
    );

    // Verify all steps map to valid statuses
    for (const step of REMOVE_WORKFLOW_STEPS) {
      t.ok(
        WORKFLOW_STEP_TO_STATUS[step] !== undefined,
        `REMOVE step '${step}' should have a status mapping`,
      );
    }
  });

  await t.test('getWorkflowSteps returns correct steps for operation types',
    async (t) => {
      t.same(
        getWorkflowSteps(OperationType.ADD),
        ADD_WORKFLOW_STEPS,
        'ADD operation should return ADD workflow steps',
      );

      t.same(
        getWorkflowSteps(OperationType.REMOVE),
        REMOVE_WORKFLOW_STEPS,
        'REMOVE operation should return REMOVE workflow steps',
      );

      t.same(
        getWorkflowSteps('INVALID'),
        [],
        'Invalid operation type should return empty array',
      );
    });

  await t.test('isValidWorkflowStep validates steps correctly', async (t) => {
    await fc.assert(
      fc.property(
        fc.constantFrom(...ADD_WORKFLOW_STEPS),
        (step) => {
          return isValidWorkflowStep(OperationType.ADD, step) === true;
        },
      ),
      {numRuns: 10},
    );

    await fc.assert(
      fc.property(
        fc.constantFrom(...REMOVE_WORKFLOW_STEPS),
        (step) => {
          return isValidWorkflowStep(OperationType.REMOVE, step) === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Valid workflow steps are correctly identified');
  });

  await t.test('getNextWorkflowStep returns correct next step', async (t) => {
    // Test ADD workflow progression
    t.equal(getNextWorkflowStep(OperationType.ADD, 'PENDING'), 'SENDING');
    t.equal(getNextWorkflowStep(OperationType.ADD, 'SENDING'), 'CREATING');
    t.equal(getNextWorkflowStep(OperationType.ADD, 'CREATING'), 'SYNCING');
    t.equal(getNextWorkflowStep(OperationType.ADD, 'SYNCING'), 'ACTIVE');
    t.equal(getNextWorkflowStep(OperationType.ADD, 'ACTIVE'), null);

    // Test REMOVE workflow progression
    t.equal(getNextWorkflowStep(OperationType.REMOVE, 'PENDING'), 'SENDING');
    t.equal(getNextWorkflowStep(OperationType.REMOVE, 'SENDING'), 'STOPPING');
    t.equal(getNextWorkflowStep(OperationType.REMOVE, 'STOPPING'), 'REMOVED');
    t.equal(getNextWorkflowStep(OperationType.REMOVE, 'REMOVED'), null);
  });

  await t.test('isTerminalStep identifies terminal steps correctly', async (t) => {
    // ACTIVE is terminal for ADD
    t.ok(isTerminalStep(OperationType.ADD, 'ACTIVE'), 'ACTIVE is terminal for ADD');
    t.notOk(isTerminalStep(OperationType.ADD, 'PENDING'), 'PENDING is not terminal');
    t.notOk(isTerminalStep(OperationType.ADD, 'SYNCING'), 'SYNCING is not terminal');

    // REMOVED is terminal for REMOVE
    t.ok(isTerminalStep(OperationType.REMOVE, 'REMOVED'),
      'REMOVED is terminal for REMOVE');
    t.notOk(isTerminalStep(OperationType.REMOVE, 'STOPPING'),
      'STOPPING is not terminal');

    // FAILED is always terminal
    t.ok(isTerminalStep(OperationType.ADD, 'FAILED'), 'FAILED is terminal for ADD');
    t.ok(isTerminalStep(OperationType.REMOVE, 'FAILED'),
      'FAILED is terminal for REMOVE');
  });

  await t.test('createOperation creates valid operation objects', async (t) => {
    await fc.assert(
      fc.property(
        fc.record({
          operationId: fc.uuid(),
          type: fc.constantFrom(OperationType.ADD, OperationType.REMOVE),
          partitionId: fc.uuid(),
          sourceNodeId: fc.uuid(),
          targetNodeId: fc.uuid(),
        }),
        (params) => {
          const operation = createOperation(params);

          // Verify all required fields are present
          const hasAllFields =
            operation.operationId === params.operationId &&
            operation.type === params.type &&
            operation.partitionId === params.partitionId &&
            operation.sourceNodeId === params.sourceNodeId &&
            operation.targetNodeId === params.targetNodeId &&
            operation.status === ReplicaStatus.PENDING &&
            operation.workflowStep === 'PENDING' &&
            typeof operation.createdAt === 'number' &&
            typeof operation.updatedAt === 'number' &&
            operation.completedAt === null &&
            operation.errorMessage === null &&
            Array.isArray(operation.stepsHistory) &&
            operation.stepsHistory.length === 1 &&
            operation.stepsHistory[0].step === 'PENDING';

          return hasAllFields;
        },
      ),
      {numRuns: 10},
    );

    t.pass('createOperation creates valid operation objects with all required fields');
  });

  await t.test('Operation type enum has correct values', async (t) => {
    t.equal(OperationType.ADD, 'ADD', 'ADD operation type should be ADD');
    t.equal(OperationType.REMOVE, 'REMOVE', 'REMOVE operation type should be REMOVE');
  });
});
