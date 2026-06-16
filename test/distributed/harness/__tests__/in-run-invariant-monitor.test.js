import {test} from '../../../../src/test-helpers/tap.js';
import {
  createInvariantTimeline,
  recordInvariantSample,
  summarizeInvariantTimeline,
  monitorInRun,
} from '../in-run-invariant-monitor.js';

const PASS = {invariantId: 'leader_uniqueness', severity: 'hard', passed: true};
const FAIL = {
  invariantId: 'publication_drain_deterministic', severity: 'hard', passed: false,
  reason: 'drain stalled',
};

test('recordInvariantSample captures the first violation and running max gap', (t) => {
  const tl = createInvariantTimeline();
  recordInvariantSample(tl, {results: [PASS], gapMs: 120, atMs: 0});
  recordInvariantSample(tl, {results: [PASS, FAIL], gapMs: 4200, atMs: 1000});
  recordInvariantSample(tl, {
    results: [{...FAIL, invariantId: 'other', reason: 'later'}], gapMs: 80, atMs: 2000,
  });
  t.equal(tl.sampleCount, 3);
  t.equal(tl.violationCount, 2, 'both failing samples counted');
  t.equal(tl.firstViolation.invariantId, 'publication_drain_deterministic',
    'first breach is the originating one, not the later one');
  t.equal(tl.firstViolation.atMs, 1000);
  t.equal(tl.maxGapMs, 4200, 'running max gap retained');
  t.end();
});

test('summarizeInvariantTimeline flags a gap over the election timeout', (t) => {
  const tl = createInvariantTimeline();
  recordInvariantSample(tl, {results: [PASS], gapMs: 4200, atMs: 0});
  const summary = summarizeInvariantTimeline(tl, {electionTimeoutMs: 3000});
  t.equal(summary.maxEventLoopGapMs, 4200);
  t.equal(summary.electionTimeoutExceeded, true, 'freeze blew the election ceiling');
  t.equal(summary.firstViolation, null);
  t.end();
});

test('a healthy run summarizes clean', (t) => {
  const tl = createInvariantTimeline();
  recordInvariantSample(tl, {results: [PASS, PASS], gapMs: 50, atMs: 0});
  const summary = summarizeInvariantTimeline(tl, {electionTimeoutMs: 3000});
  t.equal(summary.violationCount, 0);
  t.equal(summary.electionTimeoutExceeded, false);
  t.equal(summary.firstViolation, null);
  t.end();
});

test('monitorInRun drives sampling deterministically to completion', async (t) => {
  let ticks = 0;
  const states = [[PASS], [PASS, FAIL], [PASS]];
  const summary = await monitorInRun({
    getState: () => ticks,
    evaluateInvariants: (i) => states[i] || [PASS],
    readGapMs: () => (ticks === 1 ? 4200 : 100),
    shouldContinue: () => ticks < 3,
    now: () => ticks * 1000,
    sleep: () => {
      ticks += 1;
      return Promise.resolve();
    },
    electionTimeoutMs: 3000,
  });
  t.equal(summary.sampleCount, 3);
  t.equal(summary.firstViolation.invariantId, 'publication_drain_deterministic');
  t.equal(summary.electionTimeoutExceeded, true);
  t.end();
});
