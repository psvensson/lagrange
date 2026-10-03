// Owner decision O2: the raft-rs binding takes a per-node election seed.
//
// Every run below is its own process (election-seed-probe.js), so one fresh
// WASM core: a run cannot inherit another run's thread_rng state, and the
// probe counts every call the binding makes into the platform entropy source.
//
// What is witnessed:
//   - same seed, separate processes -> identical randomized election timeouts
//     and an identical Ready/message trace; different seeds -> different;
//   - no seed -> the platform entropy source is drawn (>= 1 call) and runs
//     differ across processes; a seeded run makes ZERO entropy calls;
//   - a node's timeouts do not move when another group's node (seeded or
//     not) is created and ticked between its ticks;
//   - safety: the nodes of one group given one seed draw different timeout
//     sequences, and across 200 seeds a three-voter group elects within a
//     bound - also after every node restarts from the identical seed state.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {RAFT_RS_GROUP_TUNING} from
  '../../../src/raft/raft-rs-group-constants.js';

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)),
  'election-seed-probe.js');
const IDS = Object.freeze(['1', '2', '3']);
const DRAWS = 16;
const PROCESS_RUNS = 3;
const UNSEEDED_RUNS = 5;
const SEED = 7;
const OTHER_SEED = 8;
const SEED_CENSUS = 200;
// raft-rs draws a timeout in [election_tick, 2 * election_tick).
const MIN_TIMEOUT = RAFT_RS_GROUP_TUNING.ELECTION_TICK;
const MAX_TIMEOUT = 2 * RAFT_RS_GROUP_TUNING.ELECTION_TICK;
// A group elects within four of its longest election timeouts, or it is
// livelocked as far as this witness is concerned.
const ELECTION_ROUND_BOUND = 4 * MAX_TIMEOUT;

function probe(request) {
  return JSON.parse(execFileSync(process.execPath,
    [PROBE, JSON.stringify(request)], {encoding: 'utf8'}));
}

function timeouts(seed) {
  return probe({scenario: 'timeouts', seed, ids: IDS, count: DRAWS});
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('same seed in separate processes draws identical election timeouts ' +
  'and never touches the platform entropy source', () => {
  const runs = Array.from({length: PROCESS_RUNS}, () => timeouts(SEED));
  for (const run of runs) {
    assert.equal(run.entropyCalls, 0, 'a seeded core drew platform entropy');
    assert.deepEqual(run.result, runs[0].result);
    for (const id of IDS) {
      assert.equal(run.result[id].length, DRAWS);
      for (const timeout of run.result[id]) {
        assert.ok(timeout >= MIN_TIMEOUT && timeout < MAX_TIMEOUT,
          `timeout ${timeout} outside [${MIN_TIMEOUT}, ${MAX_TIMEOUT})`);
      }
    }
  }
  const other = timeouts(OTHER_SEED);
  for (const id of IDS) {
    assert.notDeepEqual(other.result[id], runs[0].result[id],
      `node ${id}: a different seed drew the same timeouts`);
  }
});

test('the nodes of one group given one seed draw different timeouts', () => {
  const {result} = timeouts(SEED);
  for (const a of IDS) {
    for (const b of IDS.filter((id) => id > a)) {
      assert.notDeepEqual(result[a], result[b],
        `nodes ${a} and ${b} share a timeout stream`);
    }
  }
});

test('without a seed the core draws platform entropy and runs differ', () => {
  const runs = Array.from({length: UNSEEDED_RUNS}, () => timeouts(null));
  for (const run of runs) {
    assert.ok(run.entropyCalls >= 1,
      'an unseeded core never drew platform entropy');
  }
  const distinct = new Set(runs.map((run) => JSON.stringify(run.result)));
  assert.ok(distinct.size > 1,
    `${UNSEEDED_RUNS} unseeded processes drew identical timeouts`);
});

test('another group entering the core between ticks does not move a ' +
  'seeded node\'s timeouts', () => {
  for (const otherSeed of [OTHER_SEED, null]) {
    const run = probe({scenario: 'independence', seed: SEED, otherSeed,
      count: DRAWS});
    assert.deepEqual(run.result.interleaved, run.result.alone,
      `other group seed ${otherSeed}: the first group's timeouts moved`);
    assert.equal(run.entropyCalls, otherSeed === null ? 1 : 0);
  }
});

test('same seed in separate processes replays an identical Ready and ' +
  'message trace through election and restart', () => {
  const runs = Array.from({length: PROCESS_RUNS}, () =>
    probe({scenario: 'cluster', seed: SEED, maxRounds: ELECTION_ROUND_BOUND}));
  const traces = new Set(runs.map((run) => digest(run.result.trace)));
  assert.equal(traces.size, 1, 'same seed produced different traces');
  for (const run of runs) {
    assert.equal(run.entropyCalls, 0);
    assert.notEqual(run.result.outcome.first.leader, null);
  }
  const other = probe({scenario: 'cluster', seed: OTHER_SEED,
    maxRounds: ELECTION_ROUND_BOUND});
  assert.notEqual(digest(other.result.trace), [...traces][0],
    'a different seed produced the same trace');
});

test(`across ${SEED_CENSUS} seeds a three-voter group elects within ` +
  `${ELECTION_ROUND_BOUND} ticks, and again after every node restarts ` +
  'from the identical seed state', () => {
  const seeds = Array.from({length: SEED_CENSUS}, (_, seed) => seed);
  const {result, entropyCalls} = probe({scenario: 'elections', seeds,
    maxRounds: ELECTION_ROUND_BOUND});
  assert.equal(entropyCalls, 0);
  assert.equal(result.length, SEED_CENSUS);
  let reElections = 0;
  for (const {seed, first, second} of result) {
    assert.notEqual(first.leader, null, `seed ${seed}: no leader`);
    assert.notEqual(second.leader, null,
      `seed ${seed}: no leader after the identical-seed restart`);
    reElections += [first, second].filter(
      (election) => election.rounds >= MAX_TIMEOUT).length;
  }
  // The census includes elections that a first campaign did not settle, so
  // the bound is witnessed on the path that randomization exists for.
  assert.ok(reElections >= 1, 'no seed needed a second campaign');
});
