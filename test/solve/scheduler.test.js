import tap from 'tap';

import {valueCost, pickFrontier} from '../../scripts/solve/scheduler.js';
import {STATUS_OPEN, STATUS_PARKED, STATUS_SOLVED} from '../../scripts/solve/constants.js';

function fstate(id, status, parkedCount = 0) {
  return {id, status, parkedCount, rungIndex: 0, attempts: 0,
    baseline: null, current: null, reason: null};
}

tap.test('scheduler (P2)', async (t) => {
  t.test('valueCost rewards priority and penalises parking', (t) => {
    const quest = {priority: 1};
    const hi = valueCost(quest, {priority: 3}, fstate('a', STATUS_OPEN, 0));
    const lo = valueCost(quest, {priority: 1}, fstate('b', STATUS_OPEN, 0));
    t.ok(hi > lo, 'higher frontier priority scores higher');
    const parked = valueCost(quest, {priority: 3}, fstate('a', STATUS_OPEN, 2));
    t.ok(parked < hi, 'parking lowers the score');
    t.end();
  });

  t.test('pickFrontier chooses the highest score among open frontiers', (t) => {
    const quest = {priority: 1, frontiers: [
      {id: 'a', priority: 1}, {id: 'b', priority: 5}, {id: 'c', priority: 2},
    ]};
    const state = {frontiers: [
      fstate('a', STATUS_OPEN), fstate('b', STATUS_OPEN), fstate('c', STATUS_OPEN),
    ]};
    t.equal(pickFrontier(quest, state).def.id, 'b');
    t.end();
  });

  t.test('pickFrontier ignores non-open frontiers', (t) => {
    const quest = {priority: 1, frontiers: [
      {id: 'a', priority: 9}, {id: 'b', priority: 1},
    ]};
    const state = {frontiers: [
      fstate('a', STATUS_SOLVED), fstate('b', STATUS_OPEN),
    ]};
    t.equal(pickFrontier(quest, state).def.id, 'b', 'skips solved high-priority a');
    t.end();
  });

  t.test('pickFrontier returns null when all frontiers are closed', (t) => {
    const quest = {priority: 1, frontiers: [{id: 'a', priority: 1}]};
    const state = {frontiers: [fstate('a', STATUS_PARKED)]};
    t.equal(pickFrontier(quest, state), null, 'null => EXHAUSTED');
    t.end();
  });

  t.test('a parked frontier loses to an unparked equal-priority one', (t) => {
    const quest = {priority: 1, frontiers: [
      {id: 'a', priority: 2}, {id: 'b', priority: 2},
    ]};
    const state = {frontiers: [
      fstate('a', STATUS_OPEN, 3), fstate('b', STATUS_OPEN, 0),
    ]};
    t.equal(pickFrontier(quest, state).def.id, 'b', 'scheduler redirects off parking');
    t.end();
  });
});
