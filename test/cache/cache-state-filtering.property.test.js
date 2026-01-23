/**
 * Property-based test for Cache State Filtering.
 * Feature: simplified-cluster-architecture, Property 10: Cache State Filtering
 *
 * **Validates: Requirements 5.9**
 *
 * Property 10: Cache State Filtering
 * For any system cache containing nodes with various states, filtering by state
 * SHALL return exactly the nodes matching that state.
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {
  SystemTableCache,
  CDC_OPERATIONS,
} from '../../src/cache/system-table-cache.js';
import {NodeState} from '../../src/node/node-lifecycle-state-machine.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * All valid node states from the NodeState enum.
 */
const ALL_NODE_STATES = Object.values(NodeState);

/**
 * Generate a node record with a specific state.
 */
const nodeRecordArbitrary = fc.record({
  node_id: fc.uuid(),
  state: fc.constantFrom(...ALL_NODE_STATES),
  address: fc.webUrl(),
  lastStateChange: fc.date().map((d) => d.toISOString()),
});

/**
 * Generate a list of node records with various states.
 */
const nodeListArbitrary = fc.array(nodeRecordArbitrary, {
  minLength: 0,
  maxLength: 20,
});

/**
 * Feature: simplified-cluster-architecture
 * Property 10: Cache State Filtering
 *
 * For any system cache containing nodes with various states, filtering by state
 * SHALL return exactly the nodes matching that state.
 */
test('Property 10: getReadyNodes returns exactly nodes with ready state', async (t) => {
  await fc.assert(
    fc.property(
      nodeListArbitrary,
      (nodes) => {
        const cache = new SystemTableCache();

        // Insert all nodes into the cache
        for (const node of nodes) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, node);
        }

        // Get ready nodes from cache
        const readyNodeIds = cache.getReadyNodes();

        // Calculate expected ready nodes
        const expectedReadyNodeIds = nodes
          .filter((node) => node.state === 'ready')
          .map((node) => node.node_id);

        // Verify: same count
        if (readyNodeIds.length !== expectedReadyNodeIds.length) {
          return false;
        }

        // Verify: all returned nodes are in expected set
        const expectedSet = new Set(expectedReadyNodeIds);
        for (const nodeId of readyNodeIds) {
          if (!expectedSet.has(nodeId)) {
            return false;
          }
        }

        // Verify: all expected nodes are in returned set
        const returnedSet = new Set(readyNodeIds);
        for (const nodeId of expectedReadyNodeIds) {
          if (!returnedSet.has(nodeId)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('getReadyNodes returns exactly nodes with ready state');
});

/**
 * Property 10: No nodes with non-ready states are included in getReadyNodes.
 */
test('Property 10: getReadyNodes excludes all non-ready nodes', async (t) => {
  await fc.assert(
    fc.property(
      nodeListArbitrary,
      (nodes) => {
        const cache = new SystemTableCache();

        // Insert all nodes into the cache
        for (const node of nodes) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, node);
        }

        // Get ready nodes from cache
        const readyNodeIds = cache.getReadyNodes();
        const readyNodeIdSet = new Set(readyNodeIds);

        // Verify: no non-ready nodes are included
        const nonReadyNodes = nodes.filter((node) => node.state !== 'ready');
        for (const node of nonReadyNodes) {
          if (readyNodeIdSet.has(node.node_id)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('getReadyNodes excludes all non-ready nodes');
});

/**
 * Property 10: All ready nodes are included in getReadyNodes result.
 */
test('Property 10: getReadyNodes includes all ready nodes', async (t) => {
  await fc.assert(
    fc.property(
      nodeListArbitrary,
      (nodes) => {
        const cache = new SystemTableCache();

        // Insert all nodes into the cache
        for (const node of nodes) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, node);
        }

        // Get ready nodes from cache
        const readyNodeIds = cache.getReadyNodes();
        const readyNodeIdSet = new Set(readyNodeIds);

        // Verify: all ready nodes are included
        const expectedReadyNodes = nodes.filter((node) => node.state === 'ready');
        for (const node of expectedReadyNodes) {
          if (!readyNodeIdSet.has(node.node_id)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('getReadyNodes includes all ready nodes');
});

/**
 * Property 10: State filtering works correctly after node state updates.
 */
test('Property 10: State filtering reflects node state updates', async (t) => {
  await fc.assert(
    fc.property(
      fc.array(fc.uuid(), {minLength: 1, maxLength: 10}),
      fc.array(
        fc.record({
          nodeIndex: fc.nat(),
          newState: fc.constantFrom(...ALL_NODE_STATES),
        }),
        {minLength: 0, maxLength: 10},
      ),
      (nodeIds, stateUpdates) => {
        const cache = new SystemTableCache();

        // Track current state of each node
        const nodeStates = new Map();

        // Insert all nodes initially as 'joining'
        for (const nodeId of nodeIds) {
          const node = {
            node_id: nodeId,
            state: 'joining',
            address: 'ws://localhost:3000',
          };
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, node);
          nodeStates.set(nodeId, 'joining');
        }

        // Apply state updates
        for (const update of stateUpdates) {
          const nodeIndex = update.nodeIndex % nodeIds.length;
          const nodeId = nodeIds[nodeIndex];
          const updateData = {
            node_id: nodeId,
            state: update.newState,
          };
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.UPDATE, updateData);
          nodeStates.set(nodeId, update.newState);
        }

        // Get ready nodes from cache
        const readyNodeIds = cache.getReadyNodes();
        const readyNodeIdSet = new Set(readyNodeIds);

        // Verify filtering matches current state
        for (const [nodeId, state] of nodeStates) {
          const isReady = state === 'ready';
          const inReadySet = readyNodeIdSet.has(nodeId);

          if (isReady !== inReadySet) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('State filtering reflects node state updates');
});

/**
 * Property 10: Empty cache returns empty array for getReadyNodes.
 */
test('Property 10: Empty cache returns empty ready nodes array', async (t) => {
  const cache = new SystemTableCache();
  const readyNodes = cache.getReadyNodes();

  t.same(readyNodes, [], 'Empty cache returns empty array');
});

/**
 * Property 10: Cache with only non-ready nodes returns empty array.
 */
test('Property 10: Cache with only non-ready nodes returns empty array', async (t) => {
  const nonReadyStates = ALL_NODE_STATES.filter((s) => s !== 'ready');

  await fc.assert(
    fc.property(
      fc.array(
        fc.record({
          node_id: fc.uuid(),
          state: fc.constantFrom(...nonReadyStates),
          address: fc.webUrl(),
        }),
        {minLength: 1, maxLength: 10},
      ),
      (nodes) => {
        const cache = new SystemTableCache();

        // Insert all non-ready nodes
        for (const node of nodes) {
          cache.applySystemTableChange('nodes', CDC_OPERATIONS.INSERT, node);
        }

        // Get ready nodes - should be empty
        const readyNodes = cache.getReadyNodes();
        return readyNodes.length === 0;
      },
    ),
    {numRuns: 10},
  );

  t.pass('Cache with only non-ready nodes returns empty array');
});

