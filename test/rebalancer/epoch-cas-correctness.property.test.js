/**
 * Property Test: Epoch Compare-and-Swap Correctness
 * **Property 7: Epoch Compare-and-Swap Correctness**
 * **Validates: Requirements 3.6**
 *
 * Feature: simplified-cluster-architecture, Property 7: Epoch Compare-and-Swap Correctness
 *
 * *For any* epoch proposal with expectedEpoch E, the proposal SHALL succeed
 * only if the current epoch equals E, and SHALL fail with epoch mismatch
 * error otherwise.
 *
 * This property test verifies:
 * 1. Proposal succeeds when expectedEpoch matches current epoch
 * 2. Proposal fails when expectedEpoch is less than current epoch
 * 3. Proposal fails when expectedEpoch is greater than current epoch
 * 4. Failed proposals include epoch mismatch error and currentEpoch
 * 5. Successful proposals update the current epoch
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  AssignmentEpochManager,
} from '../../src/rebalancer/assignment-epoch-manager.js';
import {
  AssignmentEpoch,
} from '../../src/rebalancer/assignment-epoch.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Generator for valid node IDs.
 */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{1,8}$/);

/**
 * Generator for valid partition IDs.
 */
const partitionIdArb = fc.stringMatching(/^partition-[a-z0-9]{1,8}$/);

/**
 * Generator for valid timestamps.
 */
const timestampArb = fc.nat().map((n) => `${1700000000000 + n}-0001-node1`);

/**
 * Generator for valid assignments object.
 * Creates a mapping of partition IDs to arrays of node IDs.
 */
const assignmentsArb = fc.dictionary(
  partitionIdArb,
  fc.array(nodeIdArb, {minLength: 1, maxLength: 3}),
  {minKeys: 0, maxKeys: 5},
);

/**
 * Generator for valid non-negative epoch numbers.
 */
const epochNumberArb = fc.nat({max: 10000});

/**
 * Generator for positive offset (for testing mismatched epochs).
 */
const positiveOffsetArb = fc.integer({min: 1, max: 100});

/**
 * Initialize test dependencies.
 */
function initializeTestDependencies() {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Reset test dependencies.
 */
function resetTestDependencies() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('Property 7: Epoch Compare-and-Swap Correctness', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any current epoch E and proposal with expectedEpoch E,
   * the proposal SHALL succeed.
   */
  t.test('proposal succeeds when expectedEpoch matches current epoch', async (t) => {
    fc.assert(
      fc.property(
        epochNumberArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        assignmentsArb,
        (initialEpochNum, initialAssignments, initialTimestamp, nodeId,
          newAssignments) => {
          initializeTestDependencies();

          // Create initial epoch
          const initialEpoch = new AssignmentEpoch({
            epoch: initialEpochNum,
            assignments: initialAssignments,
            timestamp: initialTimestamp,
            proposedBy: nodeId,
          });

          // Create manager and initialize with the epoch
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize(initialEpoch);

          // Propose with matching expectedEpoch
          const result = manager.proposeEpoch(initialEpochNum, newAssignments);

          resetTestDependencies();

          // Proposal should succeed
          return result.success === true &&
                 result.epoch !== undefined &&
                 result.error === undefined;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposal succeeds when expectedEpoch matches current epoch');
  });

  /**
   * Property: For any current epoch E and proposal with expectedEpoch < E,
   * the proposal SHALL fail with epoch mismatch error.
   */
  t.test('proposal fails when expectedEpoch is less than current epoch',
    async (t) => {
      fc.assert(
        fc.property(
          positiveOffsetArb,
          epochNumberArb,
          assignmentsArb,
          timestampArb,
          nodeIdArb,
          assignmentsArb,
          (offset, baseEpochNum, initialAssignments, initialTimestamp, nodeId,
            newAssignments) => {
            initializeTestDependencies();

            // Ensure current epoch is greater than expected
            const currentEpochNum = baseEpochNum + offset;
            const expectedEpochNum = baseEpochNum;

            // Create initial epoch at higher number
            const initialEpoch = new AssignmentEpoch({
              epoch: currentEpochNum,
              assignments: initialAssignments,
              timestamp: initialTimestamp,
              proposedBy: nodeId,
            });

            // Create manager and initialize
            const manager = new AssignmentEpochManager({nodeId});
            manager.initialize(initialEpoch);

            // Propose with stale expectedEpoch
            const result = manager.proposeEpoch(expectedEpochNum, newAssignments);

            resetTestDependencies();

            // Proposal should fail with epoch mismatch
            return result.success === false &&
                   result.error !== undefined &&
                   result.error.includes('Epoch mismatch') &&
                   result.currentEpoch === currentEpochNum;
          },
        ),
        {numRuns: 10},
      );

      t.pass('proposal fails when expectedEpoch is less than current epoch');
    });

  /**
   * Property: For any current epoch E and proposal with expectedEpoch > E,
   * the proposal SHALL fail with epoch mismatch error.
   */
  t.test('proposal fails when expectedEpoch is greater than current epoch',
    async (t) => {
      fc.assert(
        fc.property(
          positiveOffsetArb,
          epochNumberArb,
          assignmentsArb,
          timestampArb,
          nodeIdArb,
          assignmentsArb,
          (offset, baseEpochNum, initialAssignments, initialTimestamp, nodeId,
            newAssignments) => {
            initializeTestDependencies();

            // Ensure expected epoch is greater than current
            const currentEpochNum = baseEpochNum;
            const expectedEpochNum = baseEpochNum + offset;

            // Create initial epoch
            const initialEpoch = new AssignmentEpoch({
              epoch: currentEpochNum,
              assignments: initialAssignments,
              timestamp: initialTimestamp,
              proposedBy: nodeId,
            });

            // Create manager and initialize
            const manager = new AssignmentEpochManager({nodeId});
            manager.initialize(initialEpoch);

            // Propose with future expectedEpoch
            const result = manager.proposeEpoch(expectedEpochNum, newAssignments);

            resetTestDependencies();

            // Proposal should fail with epoch mismatch
            return result.success === false &&
                   result.error !== undefined &&
                   result.error.includes('Epoch mismatch') &&
                   result.currentEpoch === currentEpochNum;
          },
        ),
        {numRuns: 10},
      );

      t.pass('proposal fails when expectedEpoch is greater than current epoch');
    });

  /**
   * Property: For any successful proposal, the current epoch SHALL be updated
   * to the new epoch (expectedEpoch + 1).
   */
  t.test('successful proposal updates current epoch', async (t) => {
    fc.assert(
      fc.property(
        epochNumberArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        assignmentsArb,
        (initialEpochNum, initialAssignments, initialTimestamp, nodeId,
          newAssignments) => {
          initializeTestDependencies();

          // Create initial epoch
          const initialEpoch = new AssignmentEpoch({
            epoch: initialEpochNum,
            assignments: initialAssignments,
            timestamp: initialTimestamp,
            proposedBy: nodeId,
          });

          // Create manager and initialize
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize(initialEpoch);

          // Verify initial state
          const epochBefore = manager.getCurrentEpoch().epoch;

          // Propose with matching expectedEpoch
          const result = manager.proposeEpoch(initialEpochNum, newAssignments);

          // Verify epoch was updated
          const epochAfter = manager.getCurrentEpoch().epoch;

          resetTestDependencies();

          // Current epoch should now be initialEpochNum + 1
          return result.success === true &&
                 epochBefore === initialEpochNum &&
                 epochAfter === initialEpochNum + 1 &&
                 result.epoch.epoch === initialEpochNum + 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('successful proposal updates current epoch');
  });

  /**
   * Property: For any failed proposal, the current epoch SHALL remain unchanged.
   */
  t.test('failed proposal does not change current epoch', async (t) => {
    fc.assert(
      fc.property(
        positiveOffsetArb,
        epochNumberArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        assignmentsArb,
        (offset, baseEpochNum, initialAssignments, initialTimestamp, nodeId,
          newAssignments) => {
          initializeTestDependencies();

          // Create initial epoch
          const currentEpochNum = baseEpochNum + offset;
          const initialEpoch = new AssignmentEpoch({
            epoch: currentEpochNum,
            assignments: initialAssignments,
            timestamp: initialTimestamp,
            proposedBy: nodeId,
          });

          // Create manager and initialize
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize(initialEpoch);

          // Verify initial state
          const epochBefore = manager.getCurrentEpoch().epoch;

          // Propose with wrong expectedEpoch (stale)
          const result = manager.proposeEpoch(baseEpochNum, newAssignments);

          // Verify epoch was NOT updated
          const epochAfter = manager.getCurrentEpoch().epoch;

          resetTestDependencies();

          // Current epoch should remain unchanged
          return result.success === false &&
                 epochBefore === currentEpochNum &&
                 epochAfter === currentEpochNum;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failed proposal does not change current epoch');
  });

  /**
   * Property: For any sequence of proposals, only those with matching
   * expectedEpoch SHALL succeed, and the epoch SHALL increment correctly.
   */
  t.test('sequential CAS operations maintain correctness', async (t) => {
    fc.assert(
      fc.property(
        nodeIdArb,
        fc.array(
          fc.record({
            useCorrectEpoch: fc.boolean(),
            assignments: assignmentsArb,
          }),
          {minLength: 1, maxLength: 5},
        ),
        (nodeId, proposals) => {
          initializeTestDependencies();

          // Create manager starting at epoch 0
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize();

          let expectedSuccessCount = 0;
          let actualSuccessCount = 0;

          for (const proposal of proposals) {
            const currentEpoch = manager.getCurrentEpoch().epoch;

            // Decide which expectedEpoch to use
            const expectedEpoch = proposal.useCorrectEpoch ?
              currentEpoch :
              currentEpoch + 1; // Wrong epoch

            const result = manager.proposeEpoch(
              expectedEpoch,
              proposal.assignments,
            );

            if (proposal.useCorrectEpoch) {
              expectedSuccessCount++;
              if (result.success) {
                actualSuccessCount++;
              }
            } else {
              // Should fail
              if (result.success) {
                resetTestDependencies();
                return false; // Unexpected success
              }
            }
          }

          resetTestDependencies();

          // All proposals with correct epoch should succeed
          return actualSuccessCount === expectedSuccessCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('sequential CAS operations maintain correctness');
  });

  /**
   * Property: For any failed proposal due to epoch mismatch,
   * the result SHALL include the currentEpoch value.
   */
  t.test('failed proposal includes currentEpoch in result', async (t) => {
    fc.assert(
      fc.property(
        positiveOffsetArb,
        epochNumberArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        assignmentsArb,
        fc.boolean(),
        (offset, baseEpochNum, initialAssignments, initialTimestamp, nodeId,
          newAssignments, useLowerExpected) => {
          initializeTestDependencies();

          // Create initial epoch
          const currentEpochNum = baseEpochNum + offset;
          const initialEpoch = new AssignmentEpoch({
            epoch: currentEpochNum,
            assignments: initialAssignments,
            timestamp: initialTimestamp,
            proposedBy: nodeId,
          });

          // Create manager and initialize
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize(initialEpoch);

          // Use either lower or higher expectedEpoch (both wrong)
          const expectedEpochNum = useLowerExpected ?
            baseEpochNum :
            currentEpochNum + offset;

          // Propose with wrong expectedEpoch
          const result = manager.proposeEpoch(expectedEpochNum, newAssignments);

          resetTestDependencies();

          // Result should include currentEpoch
          return result.success === false &&
                 result.currentEpoch === currentEpochNum;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failed proposal includes currentEpoch in result');
  });
});
