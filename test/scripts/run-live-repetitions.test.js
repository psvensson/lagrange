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
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  classifyRepetition,
  ioSomeAvg10FromPsi,
  maxTempFromSensorsJson,
  readIoPressureSomeAvg10,
  reportRefFromLine,
  runRepetitionSession,
} from '../../scripts/run-live-repetitions.js';

function fakeIo({
  execResults,
  temps,
  ioPressures = [],
  sourceFingerprints = ['source-a', 'source-a'],
}) {
  const execQueue = [...execResults];
  const tempQueue = [...temps];
  const ioPressureQueue = [...ioPressures];
  const fingerprintQueue = [...sourceFingerprints];
  return {
    execRun: async () => {
      const next = execQueue.shift();
      if (!next) {
        throw new Error('unexpected extra execRun call');
      }
      return next;
    },
    readTemp: async () => (tempQueue.length > 0 ? tempQueue.shift() : 45),
    readIoPressure: async () =>
      (ioPressureQueue.length > 0 ? ioPressureQueue.shift() : null),
    sleep: async () => {},
    log: () => {},
    now: () => '2026-07-19T12:00:00.000Z',
    readSourceFingerprint: async () => fingerprintQueue.shift() || 'source-a',
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
  t.equal(session.sourceStable, true);
  t.equal(session.sourceFingerprint, 'source-a');
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
  t.same(classifyRepetition(0, 95),
    {green: true, nonMeasuring: false, nonMeasuringReason: null});
});

test('a failed run with unavailable sensors counts red, not non-measuring', async (t) => {
  t.same(classifyRepetition(1, null),
    {green: false, nonMeasuring: false, nonMeasuringReason: null});
});

// A failed run whose OWN report is stamped with a non-measuring verdict reason
// (e.g. host_scheduling_gap_budget_exceeded from the event-loop-gap harvest)
// must re-run like a thermally invalid one, never count as red.
test('a failed run with a non-measuring report verdict re-runs, not red', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'live-reps-'));
  const reportPath = join(dir, 'run.report.json');
  writeFileSync(reportPath, JSON.stringify({
    standardSummary: {scenarios: [{
      scenario: 'movielens-lagrange-service-affinity-live',
      passed: false,
      current: {
        passed: false,
        verdict: 'FAIL',
        verdictReason: 'host_scheduling_gap_budget_exceeded',
      },
    }]},
  }));
  const verdict = classifyRepetition(1, 70, [reportPath]);
  t.equal(verdict.nonMeasuring, true);
  t.equal(verdict.nonMeasuringReason, 'host_scheduling_gap_budget_exceeded');

  writeFileSync(reportPath, JSON.stringify({
    standardSummary: {scenarios: [{
      scenario: 'movielens-lagrange-service-affinity-live',
      passed: false,
      current: {passed: false, verdict: 'FAIL'},
    }]},
  }));
  t.same(classifyRepetition(1, 70, [reportPath]),
    {green: false, nonMeasuring: false, nonMeasuringReason: null},
    'a measuring FAIL report still counts red');
  rmSync(dir, {recursive: true, force: true});
});

test('a source change makes an otherwise green session inconclusive', async (t) => {
  const io = fakeIo({
    execResults: greens(3),
    temps: [],
    sourceFingerprints: ['source-a', 'source-b'],
  });
  const session = await runRepetitionSession('demo', io);
  t.equal(session.gatePassed, false);
  t.equal(session.inconclusive, true);
  t.equal(session.sourceStable, false);
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

test('ioSomeAvg10FromPsi parses PSI text and rejects garbage', async (t) => {
  const psi = 'some avg10=23.45 avg60=10.11 avg300=3.02 total=123456\n' +
    'full avg10=9.99 avg60=4.20 avg300=1.00 total=65432\n';
  t.equal(ioSomeAvg10FromPsi(psi), 23.45, 'reads the some line, not full');
  t.equal(ioSomeAvg10FromPsi('full avg10=9.99\n'), null);
  t.equal(ioSomeAvg10FromPsi(''), null);
  t.equal(ioSomeAvg10FromPsi(null), null);
});

test('readIoPressureSomeAvg10 returns null when PSI is unavailable', async (t) => {
  const value = await readIoPressureSomeAvg10(() => {
    throw new Error('ENOENT');
  });
  t.equal(value, null, 'missing PSI never blocks a run');
});

test('high I/O pressure delays the run until it drains', async (t) => {
  const io = fakeIo({
    execResults: greens(5),
    temps: [],
    ioPressures: [40, 25, 5],
  });
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, true,
    'run starts once some avg10 drops below the quiet bound');
  t.equal(session.runs[0].preIoSomeAvg10, 5,
    'the pressure the run actually started at is recorded');
});

test('unavailable PSI records n/a pressure and proceeds', async (t) => {
  const io = fakeIo({execResults: greens(5), temps: []});
  const session = await runRepetitionSession('probe', io);
  t.equal(session.gatePassed, true);
  t.equal(session.runs[0].preIoSomeAvg10, null);
});
