'use strict';

/**
 * Tests for constants separation (Requirement 1).
 *
 * Verifies that SERVICE_STATUS, STATE, and NODE_STATE enums are
 * correctly scoped after the constants consolidation.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.5, 1.6
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {SERVICE_STATUS} from '../../src/constants/service-status.js';
import {STATE} from '../../src/constants/states.js';
import {NODE_STATE} from '../../src/constants/node-state.js';

// The values that were removed from STATE during consolidation.
// Each must now live in NODE_STATE or SERVICE_STATUS (or both).
const REMOVED_STATE_KEYS = [
  'ACTIVE', 'STARTING', 'CONNECTING', 'DISCOVERING',
  'JOINING', 'SYNCING', 'DRAINING', 'STOPPED',
];

describe('SERVICE_STATUS enum', () => {
  it('ACTIVE equals "active"', () => {
    assert.equal(SERVICE_STATUS.ACTIVE, 'active');
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(SERVICE_STATUS));
  });
});

describe('STATE enum after reduction', () => {
  it('does not contain removed node/service values', () => {
    for (const key of REMOVED_STATE_KEYS) {
      assert.equal(
        STATE[key], undefined,
        `STATE should not contain ${key}`
      );
    }
  });

  it('contains CONNECTED', () => {
    assert.equal(STATE.CONNECTED, 'connected');
  });

  it('contains DISCONNECTED', () => {
    assert.equal(STATE.DISCONNECTED, 'disconnected');
  });

  it('contains NORMAL', () => {
    assert.equal(STATE.NORMAL, 'normal');
  });

  it('contains READY', () => {
    assert.equal(STATE.READY, 'ready');
  });

  it('contains exactly four keys', () => {
    assert.equal(Object.keys(STATE).length, 4);
  });
});

describe('STATE and SERVICE_STATUS have no overlapping keys', () => {
  it('no key in STATE also exists in SERVICE_STATUS', () => {
    const stateKeys = new Set(Object.keys(STATE));
    const serviceKeys = Object.keys(SERVICE_STATUS);
    const overlap = serviceKeys.filter((k) => stateKeys.has(k));
    assert.equal(
      overlap.length, 0,
      `Overlapping keys: ${overlap.join(', ')}`
    );
  });
});

describe('Property 1: Service status value preservation', () => {
  /**
   * For any services table row written with status: STATE.ACTIVE before
   * the migration, the same row written with status: SERVICE_STATUS.ACTIVE
   * after the migration produces an identical string value ('active').
   *
   * **Validates: Requirements 1.3**
   */
  it('SERVICE_STATUS.ACTIVE produces the same string as the' +
      ' former STATE.ACTIVE', () => {
    const formerStateActive = 'active';

    fc.assert(
      fc.property(
        fc.constant(SERVICE_STATUS.ACTIVE),
        (statusValue) => {
          return statusValue === formerStateActive &&
            typeof statusValue === 'string';
        },
      ),
      {numRuns: 10},
    );
  });

  it('SERVICE_STATUS values are all lowercase strings', () => {
    const values = Object.values(SERVICE_STATUS);

    fc.assert(
      fc.property(
        fc.constantFrom(...values),
        (value) => {
          return typeof value === 'string' &&
            value === value.toLowerCase() &&
            value.length > 0;
        },
      ),
      {numRuns: 10},
    );
  });
});

describe('Property 2: STATE enum reduction completeness', () => {
  /**
   * For any value removed from STATE, that value exists in at least one
   * of NODE_STATE or SERVICE_STATUS. No value is lost — it is relocated.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('every removed STATE key exists in NODE_STATE or' +
      ' SERVICE_STATUS', () => {
    const nodeStateKeys = new Set(Object.keys(NODE_STATE));
    const serviceStatusKeys = new Set(Object.keys(SERVICE_STATUS));

    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVED_STATE_KEYS),
        (removedKey) => {
          const inNodeState = nodeStateKeys.has(removedKey);
          const inServiceStatus = serviceStatusKeys.has(removedKey);
          return inNodeState || inServiceStatus;
        },
      ),
      {numRuns: 10},
    );
  });

  it('no removed STATE key is absent from both target enums', () => {
    const nodeStateKeys = new Set(Object.keys(NODE_STATE));
    const serviceStatusKeys = new Set(Object.keys(SERVICE_STATUS));

    for (const key of REMOVED_STATE_KEYS) {
      const found = nodeStateKeys.has(key) ||
        serviceStatusKeys.has(key);
      assert.ok(found, `Removed key ${key} not found in either enum`);
    }
  });
});
