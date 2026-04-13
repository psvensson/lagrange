/**
 * Unit Test: TERMINAL_STATUSES and ADJUST_DIRECTION constants
 *
 * Verifies that the terminal status constants and direction constants
 * are correctly defined in the replica-status module.
 *
 * Requirements: 4.1, 5.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  TERMINAL_STATUSES,
  ADJUST_DIRECTION,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';

test('TERMINAL_STATUSES contains exactly the expected values', async (t) => {
  await t.test('contains exactly three entries', async (t) => {
    t.equal(
      TERMINAL_STATUSES.length,
      3,
      'TERMINAL_STATUSES should have exactly 3 entries',
    );
  });

  await t.test('contains active, removed, and failed', async (t) => {
    t.ok(
      TERMINAL_STATUSES.includes(ReplicaStatus.ACTIVE),
      'TERMINAL_STATUSES should include active',
    );
    t.ok(
      TERMINAL_STATUSES.includes(ReplicaStatus.REMOVED),
      'TERMINAL_STATUSES should include removed',
    );
    t.ok(
      TERMINAL_STATUSES.includes(ReplicaStatus.FAILED),
      'TERMINAL_STATUSES should include failed',
    );
  });

  await t.test('values match the raw string literals', async (t) => {
    t.same(
      TERMINAL_STATUSES,
      ['active', 'removed', 'failed'],
      'TERMINAL_STATUSES should be [active, removed, failed]',
    );
  });

  await t.test('does not include non-terminal statuses', async (t) => {
    t.notOk(
      TERMINAL_STATUSES.includes(ReplicaStatus.PENDING),
      'TERMINAL_STATUSES should not include pending',
    );
    t.notOk(
      TERMINAL_STATUSES.includes(ReplicaStatus.CREATING),
      'TERMINAL_STATUSES should not include creating',
    );
    t.notOk(
      TERMINAL_STATUSES.includes(ReplicaStatus.SYNCING),
      'TERMINAL_STATUSES should not include syncing',
    );
    t.notOk(
      TERMINAL_STATUSES.includes(ReplicaStatus.REMOVING),
      'TERMINAL_STATUSES should not include removing',
    );
  });
});

test('ADJUST_DIRECTION has UP and DOWN keys', async (t) => {
  await t.test('has UP key with value up', async (t) => {
    t.equal(
      ADJUST_DIRECTION.UP,
      'up',
      'ADJUST_DIRECTION.UP should be "up"',
    );
  });

  await t.test('has DOWN key with value down', async (t) => {
    t.equal(
      ADJUST_DIRECTION.DOWN,
      'down',
      'ADJUST_DIRECTION.DOWN should be "down"',
    );
  });

  await t.test('has exactly two keys', async (t) => {
    const keys = Object.keys(ADJUST_DIRECTION);
    t.equal(
      keys.length,
      2,
      'ADJUST_DIRECTION should have exactly 2 keys',
    );
    t.ok(keys.includes('UP'), 'ADJUST_DIRECTION should have UP key');
    t.ok(keys.includes('DOWN'), 'ADJUST_DIRECTION should have DOWN key');
  });

  await t.test('is frozen (immutable)', async (t) => {
    t.ok(
      Object.isFrozen(ADJUST_DIRECTION),
      'ADJUST_DIRECTION should be frozen',
    );
  });
});
