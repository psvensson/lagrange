/**
 * Unit test: monotone-drain characterizer.
 *
 * Pins the in-flight-count reconstruction + post-peak-rise computation. This
 * metric was built to test (and, empirically, REFUTE — see script header) the
 * monotone-drain liveness invariant as a PASS/FAIL discriminator: across the
 * corpus post-peak rises do not separate PASS from FAIL. The tests guard the
 * mechanism math so the refutation stays reproducible.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  parseOpLifetimes,
  partitionPostPeakRises,
  summarizeTarget,
} from '../../scripts/analyze-monotone-drain.js';

function line(obj) {
  return JSON.stringify(obj);
}

test('parseOpLifetimes pairs create with last-seen as terminal proxy', async (t) => {
  const lines = [
    line({msg: 'Creating operation', operationId: 'op-1', partitionId: 'p1', time: '2026-06-26T22:00:00.000Z'}),
    line({operationId: 'op-1', msg: 'dispatch', time: '2026-06-26T22:00:30.000Z'}),
    line({operationId: 'op-1', msg: 'Replica removal completed', time: '2026-06-26T22:01:00.000Z'}),
    // an opId never "Creating operation" is ignored (not a tracked rebalancer op)
    line({operationId: 'op-ghost', time: '2026-06-26T22:00:10.000Z'}),
    'garbage',
  ];
  const lt = parseOpLifetimes(lines);
  t.equal(lt.size, 1, 'only the created op is tracked');
  const op = lt.get('op-1');
  t.equal(op.partitionId, 'p1');
  t.equal(op.lastMs - op.createMs, 60000, 'lifetime spans create -> last mention');
});

test('partitionPostPeakRises detects drain-then-re-rise (oscillation)', async (t) => {
  // Two ops overlapping (peak 2), drain to 0, then a THIRD op created later =
  // a post-peak rise (the limit-cycle signature).
  const drainThenRise = [
    {createMs: 0, lastMs: 100},
    {createMs: 10, lastMs: 110},
    {createMs: 500, lastMs: 600}, // re-rise after drain
  ];
  const r = partitionPostPeakRises(drainThenRise);
  t.equal(r.peak, 2, 'peak in-flight is 2');
  t.ok(r.postPeakRises >= 1, 'a re-created op after drain counts as a post-peak rise');

  // Monotone drain: all created up front, then only terminate -> no rise.
  const clean = [
    {createMs: 0, lastMs: 300},
    {createMs: 1, lastMs: 200},
    {createMs: 2, lastMs: 100},
  ];
  t.equal(partitionPostPeakRises(clean).postPeakRises, 0,
    'a clean drain has zero post-peak rises');

  t.equal(partitionPostPeakRises([]).postPeakRises, 0, 'empty -> 0');
});

test('summarizeTarget folds partitions and sets verdict', async (t) => {
  const lifetimes = new Map([
    ['a', {createMs: 0, lastMs: 100, partitionId: 'p1'}],
    ['b', {createMs: 10, lastMs: 110, partitionId: 'p1'}],
    ['c', {createMs: 500, lastMs: 600, partitionId: 'p1'}], // re-rise on p1
    ['d', {createMs: 0, lastMs: 100, partitionId: 'p2'}],   // clean
  ]);
  const s = summarizeTarget('run', 1, lifetimes);
  t.equal(s.totalOps, 4);
  t.equal(s.verdict, 'OSCILLATING', 'any post-peak rise -> OSCILLATING');
  t.ok(s.postPeakRises >= 1);
  const p2 = s.partitions.find((p) => p.partitionId === 'p2');
  t.equal(p2.postPeakRises, 0, 'p2 drained cleanly');

  const cleanOnly = new Map([
    ['x', {createMs: 0, lastMs: 100, partitionId: 'p1'}],
    ['y', {createMs: 1, lastMs: 90, partitionId: 'p1'}],
  ]);
  t.equal(summarizeTarget('r2', 1, cleanOnly).verdict, 'MONOTONE_DRAIN');
});
