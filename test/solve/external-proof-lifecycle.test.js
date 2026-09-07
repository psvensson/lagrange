/**
 * Some claims cannot be proved before the head that carries them is published:
 * hosted CI conclusions are the standing example. Landing required a green
 * doneWhen and landing produced the head, so such a quest could never close -
 * its own parent recorded the circularity, and the more rigorous sealing was
 * the one the machinery punished.
 *
 * These scenarios pin the way out, and pin that it is a lifecycle case rather
 * than a special mode for one kind of evidence: a quest may declare what
 * proving its implementation means, land on that, and stay open until
 * something measures the sealed claim against the head the landing produced.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {QUEST_STATUS, TERMINAL_STATUSES, entryProblems} from '../../scripts/solve/schema.js';
import {questState} from '../../scripts/solve/store.js';

const LANDED = {type: 'terminal', status: QUEST_STATUS.AWAITING_EXTERNAL_PROOF,
  text: 'landed; the claim awaits evidence that needs this head published'};
const SOLVED = {type: 'terminal', status: QUEST_STATUS.SOLVED,
  text: 'the hosted runs certify it',
  implementationHead: 'b8ee3a0556e81b5917c72a2dbea3441fef3b8cc0'};

test('awaiting external proof is a state a quest carries, never a terminal one', () => {
  assert.equal(TERMINAL_STATUSES.includes(QUEST_STATUS.AWAITING_EXTERNAL_PROOF),
    false, 'a landing that proved no claim closed the quest');
  const state = questState([LANDED]);
  assert.equal(state.status, QUEST_STATUS.AWAITING_EXTERNAL_PROOF);
  assert.equal(state.terminal, false, 'the quest closed without its claim proved');
  assert.ok(state.awaitingExternalProof, 'the quest forgot what it is waiting on');
});

test('the external proof closes it, and the landing does not', () => {
  assert.equal(questState([LANDED]).terminal, false);
  const closed = questState([LANDED, SOLVED]);
  assert.equal(closed.status, QUEST_STATUS.SOLVED);
  assert.equal(closed.terminal, true);
});

test('an ordinary quest is unaffected', () => {
  // The case is additive: a quest that proves its claim locally still closes
  // in one step, and nothing about it changes.
  const ordinary = questState([{type: 'terminal', status: QUEST_STATUS.SOLVED,
    text: 'landed'}]);
  assert.equal(ordinary.status, QUEST_STATUS.SOLVED);
  assert.equal(ordinary.terminal, true);
  assert.equal(ordinary.awaitingExternalProof, null);
});

test('the state is a recognised entry status', () => {
  assert.deepEqual(entryProblems(LANDED), [],
    'the landing entry is not a shape the record accepts');
  assert.deepEqual(entryProblems(SOLVED), []);
});

test('a blocked quest is still blocked while awaiting external proof', () => {
  // The two are independent: waiting on a published head does not clear a
  // hold that names an owner who must decide something.
  const blocked = questState([LANDED,
    {type: 'terminal', status: QUEST_STATUS.BLOCKED, text: 'someone must decide',
      nextOwner: 'judgment'}]);
  assert.equal(blocked.status, QUEST_STATUS.BLOCKED);
  assert.equal(blocked.terminal, false);
});
