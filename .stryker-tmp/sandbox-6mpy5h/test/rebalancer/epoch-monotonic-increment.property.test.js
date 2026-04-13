/**
 * Property Test: Epoch Monotonic Increment
 * **Property 5: Epoch Monotonic Increment**
 * **Validates: Requirements 3.2, 3.8**
 *
 * Feature: simplified-cluster-architecture, Property 5: Epoch Monotonic Increment
 *
 * *For any* sequence of epoch transitions, each new epoch number SHALL be
 * exactly one greater than the previous epoch number.
 *
 * This property test verifies:
 * 1. AssignmentEpoch.createNext increments epoch by exactly 1
 * 2. AssignmentEpochManager.proposeEpoch increments epoch by exactly 1
 * 3. Sequential epoch proposals maintain monotonic increment
 * 4. Epoch increment is independent of assignment content
 */
// @ts-nocheck


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
 * Generator for the number of sequential proposals to make.
 */
const proposalCountArb = fc.integer({min: 1, max: 10});

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

test('Property 5: Epoch Monotonic Increment', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any previous epoch and new assignments,
   * AssignmentEpoch.createNext SHALL produce an epoch with number
   * exactly one greater than the previous.
   */
  t.test('createNext increments epoch by exactly 1', async (t) => {
    fc.assert(
      fc.property(
        epochNumberArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        (prevEpochNum, prevAssignments, prevTimestamp, prevProposer,
          newAssignments, newTimestamp, newProposer) => {
          // Create a previous epoch
          const previousEpoch = new AssignmentEpoch({
            epoch: prevEpochNum,
            assignments: prevAssignments,
            timestamp: prevTimestamp,
            proposedBy: prevProposer,
          });

          // Create next epoch
          const nextEpoch = AssignmentEpoch.createNext(
            previousEpoch,
            newAssignments,
            newTimestamp,
            newProposer,
          );

          // New epoch should be exactly previous + 1
          return nextEpoch.epoch === previousEpoch.epoch + 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('createNext increments epoch by exactly 1');
  });

  /**
   * Property: For any initial epoch and valid proposal,
   * AssignmentEpochManager.proposeEpoch SHALL produce an epoch with number
   * exactly one greater than the expected epoch.
   */
  t.test('proposeEpoch increments epoch by exactly 1', async (t) => {
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

          // Propose new epoch with correct expected epoch
          const result = manager.proposeEpoch(initialEpochNum, newAssignments);

          resetTestDependencies();

          // Proposal should succeed and new epoch should be exactly +1
          return result.success &&
                 result.epoch.epoch === initialEpochNum + 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposeEpoch increments epoch by exactly 1');
  });

  /**
   * Property: For any sequence of successful epoch proposals,
   * each new epoch SHALL be exactly one greater than the previous.
   */
  t.test('sequential proposals maintain monotonic increment', async (t) => {
    fc.assert(
      fc.property(
        nodeIdArb,
        proposalCountArb,
        fc.array(assignmentsArb, {minLength: 1, maxLength: 10}),
        (nodeId, proposalCount, assignmentsList) => {
          initializeTestDependencies();

          // Create manager starting at epoch 0
          const manager = new AssignmentEpochManager({nodeId});
          manager.initialize();

          const epochHistory = [0]; // Track all epoch numbers

          // Make sequential proposals
          const actualProposals = Math.min(proposalCount, assignmentsList.length);
          for (let i = 0; i < actualProposals; i++) {
            const currentEpoch = manager.getCurrentEpoch().epoch;
            const result = manager.proposeEpoch(
              currentEpoch,
              assignmentsList[i],
            );

            if (result.success) {
              epochHistory.push(result.epoch.epoch);
            }
          }

          resetTestDependencies();

          // Verify each epoch is exactly 1 greater than previous
          for (let i = 1; i < epochHistory.length; i++) {
            if (epochHistory[i] !== epochHistory[i - 1] + 1) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('sequential proposals maintain monotonic increment');
  });

  /**
   * Property: Epoch increment is independent of assignment content.
   * For any two different assignment objects, the epoch increment
   * SHALL always be exactly 1.
   */
  t.test('epoch increment is independent of assignment content', async (t) => {
    fc.assert(
      fc.property(
        epochNumberArb,
        assignmentsArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        (startEpoch, assignments1, assignments2, timestamp, nodeId) => {
          // Create two epochs from the same starting point with different
          // assignments
          const baseEpoch = new AssignmentEpoch({
            epoch: startEpoch,
            assignments: {},
            timestamp,
            proposedBy: nodeId,
          });

          const next1 = AssignmentEpoch.createNext(
            baseEpoch,
            assignments1,
            timestamp,
            nodeId,
          );

          const next2 = AssignmentEpoch.createNext(
            baseEpoch,
            assignments2,
            timestamp,
            nodeId,
          );

          // Both should have the same epoch number (startEpoch + 1)
          // regardless of assignment content
          return next1.epoch === startEpoch + 1 &&
                 next2.epoch === startEpoch + 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass('epoch increment is independent of assignment content');
  });

  /**
   * Property: For any starting epoch number, a chain of createNext calls
   * SHALL produce strictly increasing epoch numbers with increment of 1.
   */
  t.test('createNext chain maintains strict monotonic increment', async (t) => {
    fc.assert(
      fc.property(
        epochNumberArb,
        fc.integer({min: 1, max: 10}),
        timestampArb,
        nodeIdArb,
        (startEpoch, chainLength, timestamp, nodeId) => {
          // Create initial epoch
          let currentEpoch = new AssignmentEpoch({
            epoch: startEpoch,
            assignments: {},
            timestamp,
            proposedBy: nodeId,
          });

          const epochNumbers = [currentEpoch.epoch];

          // Create a chain of epochs
          for (let i = 0; i < chainLength; i++) {
            currentEpoch = AssignmentEpoch.createNext(
              currentEpoch,
              {},
              timestamp,
              nodeId,
            );
            epochNumbers.push(currentEpoch.epoch);
          }

          // Verify strict monotonic increment
          for (let i = 1; i < epochNumbers.length; i++) {
            if (epochNumbers[i] !== epochNumbers[i - 1] + 1) {
              return false;
            }
          }

          // Final epoch should be startEpoch + chainLength
          return currentEpoch.epoch === startEpoch + chainLength;
        },
      ),
      {numRuns: 10},
    );

    t.pass('createNext chain maintains strict monotonic increment');
  });
});
