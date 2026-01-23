/**
 * Property Test: Epoch Immutability
 * **Property 6: Epoch Immutability**
 * **Validates: Requirements 3.3**
 *
 * Feature: simplified-cluster-architecture, Property 6: Epoch Immutability
 *
 * *For any* created epoch object, the epoch number and assignments SHALL not
 * change after creation. Any modification attempt SHALL create a new epoch
 * instead.
 *
 * This property test verifies:
 * 1. Epoch objects are frozen after creation
 * 2. Epoch number cannot be modified after creation
 * 3. Assignments cannot be modified after creation
 * 4. Node lists within assignments cannot be modified
 * 5. Modifications to original input do not affect the epoch
 * 6. createNext creates a new epoch instead of modifying existing
 */

import {test} from 'tap';
import fc from 'fast-check';
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
  {minKeys: 1, maxKeys: 5},
);

/**
 * Generator for valid non-negative epoch numbers.
 */
const epochNumberArb = fc.nat({max: 10000});

/**
 * Generator for a complete valid epoch options object.
 */
const epochOptionsArb = fc.record({
  epoch: epochNumberArb,
  assignments: assignmentsArb,
  timestamp: timestampArb,
  proposedBy: nodeIdArb,
});

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

test('Property 6: Epoch Immutability', async (t) => {
  t.beforeEach(() => {
    initializeTestDependencies();
  });

  t.afterEach(() => {
    resetTestDependencies();
  });

  /**
   * Property: For any valid epoch options, the created epoch object
   * SHALL be frozen (Object.isFrozen returns true).
   */
  t.test('epoch object is frozen after creation', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        (options) => {
          const epoch = new AssignmentEpoch(options);

          // The epoch object itself must be frozen
          return Object.isFrozen(epoch);
        },
      ),
      {numRuns: 10},
    );

    t.pass('epoch object is frozen after creation');
  });

  /**
   * Property: For any valid epoch options, the assignments object
   * within the epoch SHALL be frozen.
   */
  t.test('assignments object is frozen after creation', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        (options) => {
          const epoch = new AssignmentEpoch(options);

          // The assignments object must be frozen
          return Object.isFrozen(epoch.assignments);
        },
      ),
      {numRuns: 10},
    );

    t.pass('assignments object is frozen after creation');
  });

  /**
   * Property: For any valid epoch options, each node list array
   * within assignments SHALL be frozen.
   */
  t.test('node lists within assignments are frozen', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        (options) => {
          const epoch = new AssignmentEpoch(options);

          // Each node list array must be frozen
          for (const partitionId of Object.keys(epoch.assignments)) {
            if (!Object.isFrozen(epoch.assignments[partitionId])) {
              return false;
            }
          }
          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('node lists within assignments are frozen');
  });

  /**
   * Property: For any created epoch, attempting to modify the epoch number
   * SHALL have no effect - the epoch number remains unchanged.
   */
  t.test('epoch number cannot be modified after creation', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        fc.nat({max: 10000}),
        (options, newEpochNumber) => {
          const epoch = new AssignmentEpoch(options);
          const originalEpochNumber = epoch.epoch;

          // Attempt to modify the epoch number (should fail silently or throw)
          try {
            epoch._epoch = newEpochNumber;
          } catch (_e) {
            // Expected in strict mode
          }

          // Epoch number should remain unchanged
          return epoch.epoch === originalEpochNumber;
        },
      ),
      {numRuns: 10},
    );

    t.pass('epoch number cannot be modified after creation');
  });

  /**
   * Property: For any created epoch, attempting to add a new partition
   * to assignments SHALL have no effect.
   */
  t.test('cannot add new partition to assignments', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        partitionIdArb,
        fc.array(nodeIdArb, {minLength: 1, maxLength: 3}),
        (options, newPartitionId, newNodeList) => {
          const epoch = new AssignmentEpoch(options);
          const originalPartitionCount = Object.keys(epoch.assignments).length;

          // Ensure we're adding a truly new partition
          const uniquePartitionId = `new-${newPartitionId}`;

          // Attempt to add new partition (should fail silently or throw)
          try {
            epoch.assignments[uniquePartitionId] = newNodeList;
          } catch (_e) {
            // Expected in strict mode
          }

          // Partition count should remain unchanged
          return Object.keys(epoch.assignments).length === originalPartitionCount;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cannot add new partition to assignments');
  });

  /**
   * Property: For any created epoch with assignments, attempting to modify
   * a node list (push, pop, splice) SHALL have no effect.
   */
  t.test('cannot modify node lists within assignments', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        nodeIdArb,
        (options, newNodeId) => {
          const epoch = new AssignmentEpoch(options);

          // Get the first partition's node list
          const partitionIds = Object.keys(epoch.assignments);
          if (partitionIds.length === 0) {
            return true; // No partitions to test
          }

          const firstPartitionId = partitionIds[0];
          const originalLength = epoch.assignments[firstPartitionId].length;

          // Attempt to push a new node (should fail silently or throw)
          try {
            epoch.assignments[firstPartitionId].push(newNodeId);
          } catch (_e) {
            // Expected in strict mode
          }

          // Node list length should remain unchanged
          return epoch.assignments[firstPartitionId].length === originalLength;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cannot modify node lists within assignments');
  });

  /**
   * Property: For any created epoch, modifications to the original input
   * assignments object SHALL NOT affect the epoch's assignments.
   */
  t.test('modifications to original input do not affect epoch', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        partitionIdArb,
        nodeIdArb,
        (options, newPartitionId, newNodeId) => {
          // Create a mutable copy of assignments for the input
          const mutableAssignments = {};
          for (const [partitionId, nodeList] of Object.entries(options.assignments)) {
            mutableAssignments[partitionId] = [...nodeList];
          }

          const mutableOptions = {
            ...options,
            assignments: mutableAssignments,
          };

          const epoch = new AssignmentEpoch(mutableOptions);

          // Capture original state
          const originalPartitionCount = Object.keys(epoch.assignments).length;
          const firstPartitionId = Object.keys(epoch.assignments)[0];
          const originalNodeListLength = firstPartitionId ?
            epoch.assignments[firstPartitionId].length : 0;

          // Modify the original input
          mutableAssignments[`modified-${newPartitionId}`] = [newNodeId];
          if (firstPartitionId && mutableAssignments[firstPartitionId]) {
            mutableAssignments[firstPartitionId].push(newNodeId);
          }

          // Epoch should not be affected
          const currentPartitionCount = Object.keys(epoch.assignments).length;
          const currentNodeListLength = firstPartitionId ?
            epoch.assignments[firstPartitionId].length : 0;

          return currentPartitionCount === originalPartitionCount &&
                 currentNodeListLength === originalNodeListLength;
        },
      ),
      {numRuns: 10},
    );

    t.pass('modifications to original input do not affect epoch');
  });

  /**
   * Property: For any epoch, calling createNext SHALL create a new epoch
   * object without modifying the original epoch.
   */
  t.test('createNext creates new epoch without modifying original', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        assignmentsArb,
        timestampArb,
        nodeIdArb,
        (options, newAssignments, newTimestamp, newProposer) => {
          const originalEpoch = new AssignmentEpoch(options);

          // Capture original state
          const originalEpochNumber = originalEpoch.epoch;
          const originalTimestamp = originalEpoch.timestamp;
          const originalProposedBy = originalEpoch.proposedBy;
          const originalAssignmentsJson = JSON.stringify(originalEpoch.assignments);

          // Create next epoch
          const nextEpoch = AssignmentEpoch.createNext(
            originalEpoch,
            newAssignments,
            newTimestamp,
            newProposer,
          );

          // Original epoch should be unchanged
          const originalUnchanged =
            originalEpoch.epoch === originalEpochNumber &&
            originalEpoch.timestamp === originalTimestamp &&
            originalEpoch.proposedBy === originalProposedBy &&
            JSON.stringify(originalEpoch.assignments) === originalAssignmentsJson;

          // Next epoch should be a different object
          const isDifferentObject = nextEpoch !== originalEpoch;

          // Next epoch should have incremented epoch number
          const hasIncrementedEpoch = nextEpoch.epoch === originalEpochNumber + 1;

          return originalUnchanged && isDifferentObject && hasIncrementedEpoch;
        },
      ),
      {numRuns: 10},
    );

    t.pass('createNext creates new epoch without modifying original');
  });

  /**
   * Property: For any epoch, the timestamp property SHALL not be modifiable.
   */
  t.test('timestamp cannot be modified after creation', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        timestampArb,
        (options, newTimestamp) => {
          const epoch = new AssignmentEpoch(options);
          const originalTimestamp = epoch.timestamp;

          // Attempt to modify timestamp (should fail silently or throw)
          try {
            epoch._timestamp = newTimestamp;
          } catch (_e) {
            // Expected in strict mode
          }

          // Timestamp should remain unchanged
          return epoch.timestamp === originalTimestamp;
        },
      ),
      {numRuns: 10},
    );

    t.pass('timestamp cannot be modified after creation');
  });

  /**
   * Property: For any epoch, the proposedBy property SHALL not be modifiable.
   */
  t.test('proposedBy cannot be modified after creation', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        nodeIdArb,
        (options, newProposer) => {
          const epoch = new AssignmentEpoch(options);
          const originalProposedBy = epoch.proposedBy;

          // Attempt to modify proposedBy (should fail silently or throw)
          try {
            epoch._proposedBy = newProposer;
          } catch (_e) {
            // Expected in strict mode
          }

          // ProposedBy should remain unchanged
          return epoch.proposedBy === originalProposedBy;
        },
      ),
      {numRuns: 10},
    );

    t.pass('proposedBy cannot be modified after creation');
  });

  /**
   * Property: For any epoch, toObject() SHALL return a mutable copy
   * that does not affect the original epoch when modified.
   */
  t.test('toObject returns independent mutable copy', async (t) => {
    fc.assert(
      fc.property(
        epochOptionsArb,
        fc.nat({max: 10000}),
        partitionIdArb,
        nodeIdArb,
        (options, newEpochNumber, newPartitionId, newNodeId) => {
          const epoch = new AssignmentEpoch(options);

          // Capture original state
          const originalEpochNumber = epoch.epoch;
          const originalAssignmentsJson = JSON.stringify(epoch.assignments);

          // Get mutable copy
          const copy = epoch.toObject();

          // Modify the copy
          copy.epoch = newEpochNumber;
          copy.assignments[`copy-${newPartitionId}`] = [newNodeId];

          // Original epoch should be unchanged
          return epoch.epoch === originalEpochNumber &&
                 JSON.stringify(epoch.assignments) === originalAssignmentsJson;
        },
      ),
      {numRuns: 10},
    );

    t.pass('toObject returns independent mutable copy');
  });
});
