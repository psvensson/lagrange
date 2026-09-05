import tap from 'tap';

import {
  defaultLoadThreshold,
  waitForLoadHeadroomSync,
} from '../../scripts/checks/wait-for-load-headroom.js';

// The load gate stages the landing import-graph verify behind one-minute
// load headroom: it waits while load is at or over the threshold, gives up
// after the bounded wait, and can be skipped explicitly. Every collaborator
// is injected, so no real sleep or load sample runs.

function samples(values) {
  const queue = [...values];
  return () => (queue.length > 1 ? queue.shift() : queue[0]);
}

tap.test('waits while load is over the threshold, then proceeds', (t) => {
  const slept = [];
  const logged = [];
  const result = waitForLoadHeadroomSync({
    threshold: 6,
    maxWaitMs: 60000,
    pollMs: 5000,
    sample: samples([10, 8, 2]),
    sleep: (ms) => slept.push(ms),
    log: (line) => logged.push(line),
    env: {},
  });
  t.same(slept, [5000, 5000], 'two polls while load was 10 and 8');
  t.equal(result.waitedMs, 10000);
  t.equal(result.load, 2);
  t.equal(result.skipped, false);
  t.match(logged[0], /waiting for load < 6\.00 \(now 10\.00\)/u);
  t.end();
});

tap.test('gives up after the bounded wait and says so', (t) => {
  const logged = [];
  const result = waitForLoadHeadroomSync({
    threshold: 4,
    maxWaitMs: 12000,
    pollMs: 5000,
    sample: samples([9]),
    sleep: () => {},
    log: (line) => logged.push(line),
    env: {},
  });
  t.equal(result.waitedMs, 12000, 'the last poll is clipped to the budget');
  t.equal(result.load, 9);
  t.match(logged.at(-1), /load still 9\.00 after 12000 ms - running/u);
  t.end();
});

tap.test('proceeds at once under the threshold and honours the skip env', (t) => {
  const slept = [];
  t.same(waitForLoadHeadroomSync({threshold: 6, sample: samples([1]),
    sleep: (ms) => slept.push(ms), log: () => {}, env: {}}),
  {waitedMs: 0, load: 1, skipped: false});
  t.same(slept, []);
  t.same(waitForLoadHeadroomSync({threshold: 0, sample: samples([99]),
    sleep: (ms) => slept.push(ms), log: () => {},
    env: {LAGRANGE_SKIP_LOAD_GATE: '1'}}),
  {waitedMs: 0, load: null, skipped: true}, 'skip never samples or sleeps');
  t.equal(defaultLoadThreshold(8), 6, '75% of the cores');
  t.equal(defaultLoadThreshold(1), 1, 'never below one');
  t.end();
});
