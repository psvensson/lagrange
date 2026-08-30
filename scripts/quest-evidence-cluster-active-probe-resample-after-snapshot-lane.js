// Deterministic evidence harness for the
// cluster-active-probe-resample-after-snapshot-lane quest: receipt
// declarations only. The shared runtime
// (scripts/quest-evidence-harness-runtime.js) re-runs each recorded proof
// command and writes the test-receipt probe artifact
// (solve/evidence/cluster-active-probe-resample-after-snapshot-lane.receipt.json).
//
// Each receipt re-executes one focused witness scenario on a virtual clock
// that replays the 2026-08-30T14-05-20 MovieLens run (node-2 admin listener
// open at W+52.4, attempt 6 issued at W+49.2 with a 10.8 s snapshot lane,
// deadline W+60.4). Red-on-HEAD receipts (the harness cure reverted):
// resample-certifies-late-listener-within-deadline,
// resample-not-admitted-after-deadline,
// late-listener-after-deadline-fails-with-progress-observed and
// snapshot-lane-running-at-deadline-is-bounded. The other four are controls
// that are green on HEAD and must stay green.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/distributed/harness/__tests__/' +
  'cluster-active-probe-resample-after-snapshot-lane.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

// One verbatim proof command per scenario: node --test --test-name-pattern
// selects exactly one top-level witness scenario by its anchored name, so
// every receipt is honest (its scenario alone decides the exit code).
function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'resample-certifies-late-listener-within-deadline',
    command: scenarioCommand(
      '^resample-certifies-late-listener-within-deadline',
    ),
    detail: 'RED on HEAD: the 14:05:20 replay (node-2 listener at W+52.4, ' +
      'attempt 6 at W+49.2 with a 10.8 s snapshot lane) certifies 5/5 ' +
      'inside the 60 s window because the node sampled unreachable at ' +
      'attempt start is re-sampled once, at or before the deadline, with ' +
      'the same per-node admin/readiness probe (no snapshot-count ACTIVE)',
  }),
  Object.freeze({
    id: 'resample-not-admitted-after-deadline',
    command: scenarioCommand('^resample-not-admitted-after-deadline'),
    detail: 'RED on HEAD: a re-sample whose issue instant is past the ' +
      'deadline is refused (typed not_admitted_after_deadline), the node ' +
      'is sampled exactly once and the attempt-start sample stands, so the ' +
      'verdict never reflects a state later than the deadline',
  }),
  Object.freeze({
    id: 'late-listener-after-deadline-fails-with-progress-observed',
    command: scenarioCommand(
      '^late-listener-after-deadline-fails-with-progress-observed',
    ),
    detail: 'RED on HEAD: a node-2 listener opening at W+60.5 still fails ' +
      '4/5 (the verdict evidence is the pre-deadline re-sample), and the ' +
      'timed-out label is the typed progress_observed classification ' +
      'because the active count rose 3->4 on the final attempt',
  }),
  Object.freeze({
    id: 'listener-never-opens-stalled-no-progress',
    command: scenarioCommand('^listener-never-opens-stalled-no-progress'),
    detail: 'control, green on HEAD and after: when node-2 never opens and ' +
      'the active count did not rise on the final attempt the verdict is ' +
      'FAIL 4/5 with stalled_no_progress',
  }),
  Object.freeze({
    id: 'snapshot-lane-running-at-deadline-is-bounded',
    command: scenarioCommand(
      '^snapshot-lane-running-at-deadline-is-bounded',
    ),
    detail: 'RED on HEAD: a 12 s snapshot lane on the final attempt no ' +
      'longer delays the deadline decision; the attempt returns at the ' +
      'deadline with a typed deadline_bounded lane outcome ' +
      '(snapshot_lane_running_at_deadline), the re-sampled reachability ' +
      'decides 5/5 node evidence, and the overrunning lane is counted when ' +
      'it settles later',
  }),
  Object.freeze({
    id: 'all-active-at-attempt-start-path-unchanged',
    command: scenarioCommand(
      '^all-active-at-attempt-start-path-unchanged',
    ),
    detail: 'control, green on HEAD and after: every node ACTIVE at attempt ' +
      'start is probed exactly once, no diagnostic carries a re-sample ' +
      'origin, and the gate is READY at lane completion',
  }),
  Object.freeze({
    id: 'budgets-and-cadence-unchanged',
    command: scenarioCommand('^budgets-and-cadence-unchanged'),
    detail: 'control, green on HEAD and after: the 60 s window, the 1 s ' +
      'poll interval, the 10 s forced-repair threshold and both one-shot ' +
      'extension rules are untouched — six attempts, no seventh, no ' +
      'attempt issued after the deadline, both extensions decline',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'control, green on HEAD and after: two virtual-clock replays ' +
      'of the run produce identical probe traces, lane schedules and ' +
      'verdict timing',
  }),
]);

const QUEST_ID = 'cluster-active-probe-resample-after-snapshot-lane';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'cluster-active-probe-resample-after-snapshot-lane.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
