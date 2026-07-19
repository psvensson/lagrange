/**
 * Unit tests: N-repetition live confirmation runner.
 *
 * Pins the fixed per-class policy (probe=5, demo=3, all measuring green),
 * the thermal non-measuring classification (a hot failure is excluded and
 * re-run once, never counted red; a green run always counts), and the
 * sensors-json max-temp extraction. All child runs and temperature reads are
 * injected; no live cluster is started.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  classifyRepetition,
  maxTempFromSensorsJson,
  reportRefFromLine,
  runRepetitionSession,
} from '../../scripts/run-live-repetitions.js';

function fakeIo({execResults, temps}) {
  const execQueue = [...execResults];
  const tempQueue = [...temps];
  return {
    execRun: async () => {
      const next = execQueue.shift();
      if (!next) {
        throw new Error('unexpected extra execRun call');
      }
      return next;
    },
    readTemp: async () => (tempQueue.length > 0 ? tempQueue.shift() : 45),
    sleep: async () => {},
    log: () => {},
    now: () => '2026-07-19T12:00:00.000Z',
  };
}

function greens(count) {
  return Array.from({length: count}, () => ({exitCode: 0, reportRefs: []}));
}

test('probe class requires 5 greens and passes the gate', async (t) => {
  const io = fakeIo({execResults: greens(5), temps: []});
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, true);
  t.equal(session.inconclusive, false);
  t.equal(session.runs.length, 5);
  t.ok(session.runs.every((run) => run.green && !run.nonMeasuring));
});

test('demo class runs exactly 3 repetitions', async (t) => {
  const io = fakeIo({execResults: greens(3), temps: []});
  const session = await runRepetitionSession('demo', io);
  t.equal(session.gatePassed, true);
  t.equal(session.runs.length, 3);
});

test('one cool red repetition fails the gate immediately', async (t) => {
  const io = fakeIo({
    execResults: [...greens(2), {exitCode: 1, reportRefs: []}],
    temps: [],
  });
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, false);
  t.equal(session.inconclusive, false);
  t.equal(session.runs.length, 3);
  t.equal(session.runs[2].green, false);
  t.equal(session.runs[2].nonMeasuring, false);
});

test('a hot failure is non-measuring: excluded, re-run once, gate can still pass', async (t) => {
  // Temps interleave: pre-run reads then post-run reads via the same queue.
  // Slot 1: pre 45, post 90 (hot failure) -> re-run: pre 45, post 50 (green).
  const io = fakeIo({
    execResults: [{exitCode: 1, reportRefs: []}, ...greens(5)],
    temps: [45, 90, 45, 50],
  });
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, true);
  t.equal(session.runs.length, 6);
  t.equal(session.runs[0].nonMeasuring, true);
  t.equal(session.runs[0].green, false);
  t.ok(session.runs.slice(1).every((run) => run.green));
});

test('two consecutive hot failures in one slot make the session inconclusive', async (t) => {
  const io = fakeIo({
    execResults: [{exitCode: 1, reportRefs: []}, {exitCode: 1, reportRefs: []}],
    temps: [45, 90, 45, 91],
  });
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, false);
  t.equal(session.inconclusive, true);
  t.equal(session.runs.length, 2);
  t.ok(session.runs.every((run) => run.nonMeasuring));
});

test('a green run counts even when the machine ends hot', async (t) => {
  t.same(classifyRepetition(0, 95), {green: true, nonMeasuring: false});
});

test('a failed run with unavailable sensors counts red, not non-measuring', async (t) => {
  t.same(classifyRepetition(1, null), {green: false, nonMeasuring: false});
});

test('unknown run class throws', async (t) => {
  await t.rejects(runRepetitionSession('canary', fakeIo({execResults: [], temps: []})));
});

test('maxTempFromSensorsJson extracts the max *_input reading', async (t) => {
  const parsed = {
    'coretemp-isa-0000': {
      'Core 0': {temp2_input: 45.0, temp2_max: 80.0},
      'Core 4': {temp3_input: 62.5},
      'Adapter': 'ISA adapter',
    },
    'nvme-pci-0400': {Composite: {temp1_input: 38.9}},
  };
  t.equal(maxTempFromSensorsJson(parsed), 62.5);
  t.equal(maxTempFromSensorsJson({}), null);
  t.equal(maxTempFromSensorsJson(null), null);
});

test('reportRefFromLine recognizes both runners evidence lines', async (t) => {
  t.equal(
    reportRefFromLine('Live demo report: test-output/reports/x.report.json'),
    'test-output/reports/x.report.json');
  t.equal(
    reportRefFromLine('Archived run to solve/report/formation-probe-runs.ndjson'),
    'solve/report/formation-probe-runs.ndjson');
  t.equal(reportRefFromLine('Stopping cluster...'), null);
});
