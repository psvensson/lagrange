import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from
  'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeFormationReleaseEvents,
} from '../../scripts/checks/formation-release-handoff-gcp-analysis.js';
import {
  STRANDED_TEARDOWN_RUN,
  buildStrandedTeardownRunEvents,
} from './formation-release-handoff-gcp-run-fixture.js';

// Deterministic witness for the formation-release-phase-analysis quest:
// `npm run analyze:formation-release-phases -- <report-dir>` prints, per
// captured generation and cohort member, W (capture) -> handoff observed ->
// barrier release -> READY with deltas, plus the classified outcome, over
// the recorded GCP run 2026-08-30T07-13-07.175Z excerpt. The projection
// copies the closure analyzer's verdict and classification and mints no
// verdict of its own. The phase module is loaded dynamically inside the
// scenarios that need it so the analyzer control scenario stays green on
// HEAD, where the module does not exist.

const PHASE_MODULE = '../../scripts/checks/analyze-formation-release-phases.js';
const PHASE_SCRIPT = 'scripts/checks/analyze-formation-release-phases.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const NPM_SCRIPT_NAME = 'analyze:formation-release-phases';
const NPM_SCRIPT_COMMAND = `node ${PHASE_SCRIPT}`;
const COMMAND_LISTING_PREFIX = `npm run ${NPM_SCRIPT_NAME}`;
const CLASS_COMPLETED = 'completed';
const CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN =
  'retained_uncompleted_at_teardown';
const PHASE_READY = 'ready';
const PHASE_BARRIER_RELEASED = 'barrier_released';
const SPREAD_HANDOFF_OBSERVED_AT = '2026-08-30T07:16:52.401Z';
const SPREAD_HANDOFF_DELTA_MS = 36_244;
const SPREAD_READY_DELTA_MS = 36_506;
const LATE_A_RELEASE_AT = '2026-08-30T07:17:12.128Z';
const LATE_A_RELEASE_DELTA_MS = 55_971;
const FIRST_RELEASE_AT = '2026-08-30T07:16:12.708Z';
const FIRST_RELEASE_DELTA_MS = 8_840;
const FIRST_READY_DELTA_MS = 12_288;
const VERDICT_KEYS_NEVER_MINTED = Object.freeze(['passed', 'certified',
  'verdict', 'done']);
const TEMP_PREFIX = 'formation-phases-';
const SEED_LOG = 'node-0.log';
const JOINER_LOG = 'node-1.log';

function findGeneration(projection, generation) {
  return projection.generations.find((entry) =>
    entry.generation === generation);
}

function findNode(generationProjection, nodeId) {
  return generationProjection.nodes.find((node) => node.nodeId === nodeId);
}

// Materialize the fixture as a per-run report directory in the exact shape
// the runner writes: report.json beside full-logs/<node>.log JSON lines.
function writeReportDir(events) {
  const dir = mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const logDir = path.join(dir, 'full-logs');
  mkdirSync(logDir);
  const seedEvents = events.filter((event) =>
    event.nodeId === STRANDED_TEARDOWN_RUN.seed);
  const joinerEvents = events.filter((event) =>
    event.nodeId !== STRANDED_TEARDOWN_RUN.seed);
  const lines = (list) => `${list.map((event) => JSON.stringify(event))
    .join('\n')}\n`;
  writeFileSync(path.join(logDir, SEED_LOG), lines(seedEvents));
  writeFileSync(path.join(logDir, JOINER_LOG), lines(joinerEvents));
  writeFileSync(path.join(dir, 'report.json'), JSON.stringify({
    schemaVersion: 2,
    variant: 'fixed',
    sourceFingerprint: STRANDED_TEARDOWN_RUN.sourceFingerprint,
    logDir: 'full-logs',
  }));
  return dir;
}

test('phase-timeline-per-node: every cohort member gets W -> handoff ' +
  'observed -> barrier release -> READY instants with deltas from W', async () => {
  const phases = await import(PHASE_MODULE);
  const projection = phases.projectFormationReleasePhases(
    buildStrandedTeardownRunEvents(),
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  const second = findGeneration(projection,
    STRANDED_TEARDOWN_RUN.secondGeneration);
  assert.equal(second.capturedAt, STRANDED_TEARDOWN_RUN.secondCaptureAt);
  const spread = findNode(second, STRANDED_TEARDOWN_RUN.joiners.spread);
  assert.equal(spread.windowStartAt, STRANDED_TEARDOWN_RUN.secondCaptureAt);
  assert.equal(spread.handoffObservedAt, SPREAD_HANDOFF_OBSERVED_AT);
  assert.equal(spread.barrierReleasedAt, SPREAD_HANDOFF_OBSERVED_AT);
  assert.equal(spread.readyAt, STRANDED_TEARDOWN_RUN.lastActiveAt);
  assert.deepEqual(spread.deltasMs, {
    handoffObserved: SPREAD_HANDOFF_DELTA_MS,
    barrierReleased: SPREAD_HANDOFF_DELTA_MS,
    ready: SPREAD_READY_DELTA_MS,
  });
  assert.equal(spread.phase, PHASE_READY);
  const lateA = findNode(second, STRANDED_TEARDOWN_RUN.joiners.lateA);
  assert.equal(lateA.handoffObservedAt, null);
  assert.equal(lateA.barrierReleasedAt, LATE_A_RELEASE_AT);
  assert.equal(lateA.readyAt, null);
  assert.deepEqual(lateA.deltasMs, {
    handoffObserved: null,
    barrierReleased: LATE_A_RELEASE_DELTA_MS,
    ready: null,
  });
  assert.equal(lateA.phase, PHASE_BARRIER_RELEASED);
  const first = findGeneration(projection,
    STRANDED_TEARDOWN_RUN.firstGeneration);
  const firstJoiner = findNode(first, STRANDED_TEARDOWN_RUN.joiners.first);
  assert.equal(firstJoiner.windowStartAt, STRANDED_TEARDOWN_RUN.firstCaptureAt);
  assert.equal(firstJoiner.barrierReleasedAt, FIRST_RELEASE_AT);
  assert.equal(firstJoiner.readyAt, STRANDED_TEARDOWN_RUN.firstCompleteAt);
  assert.equal(firstJoiner.deltasMs.barrierReleased, FIRST_RELEASE_DELTA_MS);
  assert.equal(firstJoiner.deltasMs.ready, FIRST_READY_DELTA_MS);
  assert.equal(firstJoiner.phase, PHASE_READY);
  assert.deepEqual(projection.uncapturedNodeIds, []);
});

test('phase-outcome-from-analyzer-classification: each generation\'s ' +
  'classified outcome, the closure verdict and the failure reasons are ' +
  'copied from the closure analyzer, never re-derived', async () => {
  const phases = await import(PHASE_MODULE);
  const events = buildStrandedTeardownRunEvents();
  const analysis = analyzeFormationReleaseEvents(
    events, STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  const projection = phases.projectFormationReleasePhases(
    events, STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  for (const generation of projection.generations) {
    assert.equal(
      generation.classification,
      analysis.generationClassifications[generation.generation],
    );
  }
  assert.equal(
    findGeneration(projection, STRANDED_TEARDOWN_RUN.secondGeneration)
      .classification,
    CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN,
  );
  assert.equal(projection.closurePassed, analysis.closurePassed);
  assert.deepEqual(projection.failureReasons, analysis.failureReasons);
  assert.equal(projection.completionMs, analysis.completionMs);
});

test('phase-cli-renders-report-dir: the CLI reads report.json and ' +
  'full-logs from one per-run report directory and prints the per-node ' +
  'timeline and classified outcome (text and --json)', () => {
  const dir = writeReportDir(buildStrandedTeardownRunEvents());
  try {
    const text = execFileSync(process.execPath, [PHASE_SCRIPT, dir], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.ok(text.includes(CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN));
    assert.ok(text.includes(CLASS_COMPLETED));
    assert.ok(text.includes(
      `node ${STRANDED_TEARDOWN_RUN.joiners.spread.slice(0, 8)}`));
    assert.ok(text.includes('READY +36.506s'));
    assert.ok(text.includes('READY -'));
    assert.ok(text.includes('closure=FAIL'));
    const json = JSON.parse(execFileSync(
      process.execPath, [PHASE_SCRIPT, dir, '--json'],
      {cwd: ROOT, encoding: 'utf8'},
    ));
    assert.equal(json.generations.length, 2);
    assert.equal(json.expectedFingerprint,
      STRANDED_TEARDOWN_RUN.sourceFingerprint);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

test('phase-projection-carries-no-new-verdict: the projection exposes no ' +
  'pass/fail field of its own at any level beyond the analyzer\'s copied ' +
  'closure verdict', async () => {
  const phases = await import(PHASE_MODULE);
  const projection = phases.projectFormationReleasePhases(
    buildStrandedTeardownRunEvents(),
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  const holders = [projection];
  for (const generation of projection.generations) {
    holders.push(generation, ...generation.nodes);
  }
  for (const holder of holders) {
    for (const key of VERDICT_KEYS_NEVER_MINTED) {
      assert.equal(Object.hasOwn(holder, key), false,
        `no ${key} verdict may be minted by the projection`);
    }
  }
});

test('analyzer-classification-unchanged: the closure analyzer still ' +
  'classifies the recorded run on its own (completed + ' +
  'retained_uncompleted_at_teardown, closure failed)', () => {
  const analysis = analyzeFormationReleaseEvents(
    buildStrandedTeardownRunEvents(),
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  assert.deepEqual(analysis.generationClassifications, {
    [STRANDED_TEARDOWN_RUN.firstGeneration]: CLASS_COMPLETED,
    [STRANDED_TEARDOWN_RUN.secondGeneration]:
      CLASS_RETAINED_UNCOMPLETED_AT_TEARDOWN,
  });
  assert.equal(analysis.closurePassed, false);
});

test('npm-script-registered: package.json exposes ' +
  'analyze:formation-release-phases and the command index lists it', async () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts[NPM_SCRIPT_NAME], NPM_SCRIPT_COMMAND);
  const commands = await import('../../scripts/list-commands.js');
  const listed = commands.ADVANCED_COMMAND_GROUPS
    .flatMap((group) => group.commands)
    .some((entry) => entry.command.startsWith(COMMAND_LISTING_PREFIX));
  assert.equal(listed, true);
});

test('witness-deterministic: two projections of the identical recorded ' +
  'run are identical', async () => {
  const phases = await import(PHASE_MODULE);
  const first = phases.projectFormationReleasePhases(
    buildStrandedTeardownRunEvents(),
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  const second = phases.projectFormationReleasePhases(
    buildStrandedTeardownRunEvents(),
    STRANDED_TEARDOWN_RUN.sourceFingerprint,
  );
  assert.deepEqual(second, first);
  assert.equal(phases.renderText(second, 'x'), phases.renderText(first, 'x'));
});
