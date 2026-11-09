/**
 * Witness for Quest state-read-named-defaults: the one optional state-field
 * reader names an absent state STATE_ABSENT and never substitutes a value.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  STATE_ABSENT,
  readLowerStateField,
  readStateField,
  readUpperStateField,
} from '../../src/utils/state-field-read.js';

test('an absent or empty state reads as STATE_ABSENT', () => {
  for (const value of [undefined, null, '', 0, false, {}]) {
    assert.equal(readStateField(value), STATE_ABSENT);
    assert.equal(readLowerStateField(value), STATE_ABSENT);
    assert.equal(readUpperStateField(value), STATE_ABSENT);
  }
});

test('the first present source wins, in authority order', () => {
  assert.equal(readStateField(undefined, 'syncing', 'active'), 'syncing');
  assert.equal(readLowerStateField('ACTIVE'), 'active');
  assert.equal(readUpperStateField(null, 'published'), 'PUBLISHED');
});
