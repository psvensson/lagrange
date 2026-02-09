/**
 * Property Test: Cache state values are from unified enum
 * **Property 5: Cache state values are from unified enum**
 * **Validates: Requirements 2.5**
 *
 * *For any* node state value read from the system cache, the value shall
 * be a member of the NODE_STATE enum.
 *
 * This property test verifies that:
 * 1. The NODE_STATE enum contains exactly the expected states
 * 2. Any node state value written to the cache via CDC and then read back
 *    is a member of the NODE_STATE enum
 * 3. Arbitrary strings that are not NODE_STATE members are correctly
 *    identified as invalid
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CACHE_CDC_OPERATIONS} from '../../src/cache/cache-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const NODE_STATE_VALUES = Object.values(NODE_STATE);
const EXPECTED_STATE_COUNT = 14;

/**
 * Check whether a value is a valid NODE_STATE member.
 * @param {string} value - The value to check.
 * @return {boolean} True if the value is in NODE_STATE.
 */
function isValidNodeState(value) {
  return NODE_STATE_VALUES.includes(value);
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'property-test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 5: Cache state values are from unified enum', async (t) => {
  /**
   * Verify the NODE_STATE enum has the expected state count.
   * in Requirement 2.2.
   */
  t.test('NODE_STATE enum contains expected states', async (t) => {
    t.equal(
      NODE_STATE_VALUES.length,
      EXPECTED_STATE_COUNT,
      `NODE_STATE should have ${EXPECTED_STATE_COUNT} values`,
    );

    const expectedStates = [
      'initializing', 'starting', 'connecting', 'discovering',
      'joining', 'syncing', 'ready', 'active', 'suspected', 'failed',
      'recovering', 'draining', 'shutting_down', 'stopped',
    ];

    for (const state of expectedStates) {
      t.ok(
        NODE_STATE_VALUES.includes(state),
        `NODE_STATE should include "${state}"`,
      );
    }
  });

  /**
   * Property: For any NODE_STATE value written to the cache via CDC,
   * reading it back yields a value that is a member of NODE_STATE.
   */
  t.test('node state round-trips through cache as NODE_STATE member',
    async (t) => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NODE_STATE_VALUES),
          fc.uuid(),
          (stateValue, nodeId) => {
            const cache = new SystemTableCache();

            cache.applySystemTableChange(
              TABLES.NODES,
              CACHE_CDC_OPERATIONS.INSERT,
              {
                [COLUMN.NODE_ID]: nodeId,
                [COLUMN.STATUS]: stateValue,
              },
            );

            const record = cache.get(TABLES.NODES, nodeId);
            return isValidNodeState(record[COLUMN.STATUS]);
          },
        ),
        {numRuns: 10},
      );

      t.pass('all NODE_STATE values round-trip through cache correctly');
    });

  /**
   * Property: For any arbitrary string that is NOT a NODE_STATE member,
   * the membership check correctly rejects it.
   */
  t.test('arbitrary non-member strings fail membership check',
    async (t) => {
      fc.assert(
        fc.property(
          fc.string({minLength: 1, maxLength: 50}).filter(
            (s) => !NODE_STATE_VALUES.includes(s),
          ),
          (arbitraryValue) => {
            return !isValidNodeState(arbitraryValue);
          },
        ),
        {numRuns: 10},
      );

      t.pass('non-member strings are correctly rejected');
    });

  /**
   * Property: For any node state value read from the cache after a
   * CDC update, the value is still a NODE_STATE member.
   */
  t.test('cache state remains valid after CDC updates', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(...NODE_STATE_VALUES),
        fc.constantFrom(...NODE_STATE_VALUES),
        (nodeId, initialState, updatedState) => {
          const cache = new SystemTableCache();

          cache.applySystemTableChange(
            TABLES.NODES,
            CACHE_CDC_OPERATIONS.INSERT,
            {
              [COLUMN.NODE_ID]: nodeId,
              [COLUMN.STATUS]: initialState,
            },
          );

          cache.applySystemTableChange(
            TABLES.NODES,
            CACHE_CDC_OPERATIONS.UPDATE,
            {
              [COLUMN.NODE_ID]: nodeId,
              [COLUMN.STATUS]: updatedState,
            },
          );

          const record = cache.get(TABLES.NODES, nodeId);
          return isValidNodeState(record[COLUMN.STATUS]);
        },
      ),
      {numRuns: 10},
    );

    t.pass('cache state remains valid NODE_STATE member after updates');
  });

  /**
   * Property: For any set of nodes in the cache, all status values
   * retrieved via getAll are NODE_STATE members.
   */
  t.test('all cached node statuses are NODE_STATE members', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            nodeId: fc.uuid(),
            state: fc.constantFrom(...NODE_STATE_VALUES),
          }),
          {minLength: 1, maxLength: 10},
        ),
        (nodes) => {
          const cache = new SystemTableCache();

          for (const node of nodes) {
            cache.applySystemTableChange(
              TABLES.NODES,
              CACHE_CDC_OPERATIONS.UPSERT,
              {
                [COLUMN.NODE_ID]: node.nodeId,
                [COLUMN.STATUS]: node.state,
              },
            );
          }

          const allNodes = cache.getAll(TABLES.NODES);
          return allNodes.every(
            (record) => isValidNodeState(record[COLUMN.STATUS]),
          );
        },
      ),
      {numRuns: 10},
    );

    t.pass('all node statuses from getAll are NODE_STATE members');
  });
});
