/**
 * Unit tests for WORKER_EVENT constants.
 *
 * Verifies that the three lifecycle event constants (REPLICA_CREATED,
 * REPLICA_STOPPED, REPLICA_FAILED) exist, are non-empty strings, and
 * are distinct from all other event names.
 *
 * @see Requirements 1.1 - Define Missing Worker Event Constants
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKER_EVENT} from '../../src/worker/worker-constants.js';

const LIFECYCLE_EVENTS = [
  'REPLICA_CREATED',
  'REPLICA_STOPPED',
  'REPLICA_FAILED',
];

test('WORKER_EVENT lifecycle constants exist and are non-empty strings', (t) => {
  for (const key of LIFECYCLE_EVENTS) {
    const value = WORKER_EVENT[key];
    t.ok(
      typeof value === 'string' && value.length > 0,
      `${key} should be a non-empty string, got: ${JSON.stringify(value)}`,
    );
  }
  t.end();
});

test('WORKER_EVENT lifecycle constants are distinct from each other', (t) => {
  const values = LIFECYCLE_EVENTS.map((key) => WORKER_EVENT[key]);
  const unique = new Set(values);
  t.equal(
    unique.size,
    values.length,
    'all lifecycle event values should be unique',
  );
  t.end();
});

test('WORKER_EVENT lifecycle constants are distinct from existing events', (t) => {
  const existingKeys = Object.keys(WORKER_EVENT)
    .filter((key) => !LIFECYCLE_EVENTS.includes(key));
  const existingValues = existingKeys.map((key) => WORKER_EVENT[key]);
  const existingSet = new Set(existingValues);

  for (const key of LIFECYCLE_EVENTS) {
    const value = WORKER_EVENT[key];
    t.notOk(
      existingSet.has(value),
      `${key} value "${value}" should not collide with existing events`,
    );
  }
  t.end();
});
