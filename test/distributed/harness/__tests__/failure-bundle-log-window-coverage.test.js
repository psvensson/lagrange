// A failure bundle's node-log window states how much of the failure window
// (first divergence to the end of the run) it retained from the node's FULL
// log, in bytes, and a bundle whose window is partial, or whose node log is
// missing, is non-measuring: it names the withheld bytes and never publishes
// a dominant reason derived from what it saw
// (quest failure-bundle-evidence-completeness).
import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import * as artifactFoundation from '../failure-bundle-artifact-foundation.js';
import {
  retainNodeLogWindow,
  retainNodeLogWindowFromGzip,
} from '../failure-bundle-log-window.js';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {formatCoverageField} from '../failure-bundle-log-window-markdown.js';
import {
  HARNESS_VERDICTS,
  SCENARIO_VERDICT_REASON,
} from '../validation-matrix.js';
import {
  CAPTURE_QUIET_BOUND_SOURCE,
  NODE_LIFECYCLE_ACTION,
  PLAYBACK_EVENT_TYPE,
} from '../constants.js';
import {
  CAPTURE_COMPLETENESS_NOT_RECORDED,
  CAPTURE_COMPLETENESS_REASON,
  assessCaptureCompleteness,
  fullLogDestPath,
} from '../full-node-log-capture.js';
import {resolveCaptureQuietBound} from '../capture-quiet-bound.js';
import {COMPLETE_CAPTURE} from './failure-bundle-full-log-fixture.js';
import {
  NON_MEASURING_VERDICT_REASONS,
  measure,
} from '../../../../scripts/solve/probes.js';

const {LOG_WINDOW_COVERAGE} = artifactFoundation;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);

const HARNESS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const UTF8 = 'utf8';
const SCENARIO_NAME = 'coverage-scenario';
const NODE_ID = 'node-1';
const STEP_NAME = 'wait-for-formation';
const STALE_DOMINANT_REASON = 'replace_operation_stale_removed';
const RUN_START_MS = Date.parse('2026-11-06T18:45:00.000Z');
const DIVERGENCE_MS = Date.parse('2026-11-06T18:50:08.000Z');
const SECOND_MS = 1000;
const SMALL_BOUND_BYTES = 256;
const SCENARIO_BOUND_BYTES = 4096;
const FOUR_MIB = 4 * 1024 * 1024;
const COVERAGE_FIELDS = [
  'firstDivergenceAt',
  'windowStartAt',
  'windowEndAt',
  'windowStartByte',
  'windowEndByte',
  'retainedBytes',
  'withheldBytes',
  'complete',
  'captureCompleteness',
  'source',
  'missingReason',
];
// The capture owner's verdict for a capture that drained to teardown; the
// window module never judges the capture itself.
const CAPTURED = {captureCompleteness: COMPLETE_CAPTURE};
const LEGACY_LINE_BOUND_NAME = 'LOG_TAIL_LINE_COUNT';
const FAILURE_BUNDLE_MODULE_PREFIX = 'failure-bundle';

// The curated sample form (log-collector.js formatLogEntry).
function curatedLine(atMs, message) {
  return `${new Date(atMs).toISOString()} [${NODE_ID}] info: ${message}`;
}

// The full-log form: pino JSON, `time` after `level`.
function pinoLine(atMs, message) {
  return JSON.stringify({level: 30, time: new Date(atMs).toISOString(), msg: message});
}

// Lines every second from `fromMs` for `count` seconds.
function lines(format, fromMs, count, message) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    result.push(format(fromMs + index * SECOND_MS, `${message} ${index}`));
  }
  return result;
}

function byteLength(content) {
  return Buffer.byteLength(content, UTF8);
}

function text(lineList) {
  return lineList.join('\n') + '\n';
}

describe('LOG_WINDOW_COVERAGE owner (budget row condition)', () => {
  it('is exported, frozen, names the record fields, and bounds 4 MiB per node', () => {
    assert.ok(LOG_WINDOW_COVERAGE, 'LOG_WINDOW_COVERAGE must be exported');
    assert.ok(Object.isFrozen(LOG_WINDOW_COVERAGE));
    assert.deepEqual([...LOG_WINDOW_COVERAGE.RECORD_FIELDS], COVERAGE_FIELDS);
    assert.equal(LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES, FOUR_MIB);
  });

  it('retires the line-count bound: no failure-bundle module names it', async () => {
    assert.equal(
      Object.hasOwn(artifactFoundation, LEGACY_LINE_BOUND_NAME),
      false,
      'the foundation must not export the line-count tail bound',
    );
    const entries = await readdir(HARNESS_DIR);
    const modules = arrayFilter(entries, (name) =>
      stringStartsWith(name, FAILURE_BUNDLE_MODULE_PREFIX) &&
      stringEndsWith(name, '.js'));
    assert.ok(modules.length > 0);
    const offenders = [];
    for (const name of modules) {
      const source = await readFile(join(HARNESS_DIR, name), UTF8);
      if (stringIncludes(source, LEGACY_LINE_BOUND_NAME)) {
        offenders.push(name);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('the scenario config overrides the per-node bound', () => {
    const resolve = artifactFoundation.resolveLogWindowMaxRetainedBytes;
    assert.equal(resolve(null), FOUR_MIB);
    assert.equal(resolve({}), FOUR_MIB);
    assert.equal(
      resolve({[LOG_WINDOW_COVERAGE.SCENARIO_CONFIG_KEY]: SCENARIO_BOUND_BYTES}),
      SCENARIO_BOUND_BYTES,
    );
  });
});

describe('incomplete coverage is a non-measuring verdict', () => {
  it('the solver probe reads the coverage reason as non-measuring', () => {
    assert.ok(arrayIncludes(
      NON_MEASURING_VERDICT_REASONS,
      SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE,
    ));
  });
});

describe('retainNodeLogWindow coverage', () => {
  it('is complete when the window covers first divergence to the end', async () => {
    const before = lines(curatedLine, RUN_START_MS, 3, 'healthy');
    const after = lines(curatedLine, DIVERGENCE_MS, 3, 'diverged');
    const {lines: kept, coverage} = await retainNodeLogWindow(
      text([...before, ...after]),
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS,
        maxRetainedBytes: SMALL_BOUND_BYTES * 4},
    );
    assert.deepEqual(Object.keys(coverage), COVERAGE_FIELDS);
    assert.equal(coverage.complete, true);
    assert.equal(coverage.withheldBytes, 0);
    assert.equal(coverage.missingReason, null);
    assert.equal(coverage.firstDivergenceAt, new Date(DIVERGENCE_MS).toISOString());
    assert.equal(coverage.windowStartAt, new Date(DIVERGENCE_MS).toISOString());
    assert.equal(
      coverage.windowEndAt,
      new Date(DIVERGENCE_MS + 2 * SECOND_MS).toISOString(),
    );
    assert.equal(coverage.retainedBytes, byteLength(text(after)));
    assert.deepEqual(kept, after);
  });

  it('is incomplete and counts withheld bytes when the failure window ' +
    'exceeds the byte bound', async () => {
    const before = lines(curatedLine, RUN_START_MS, 2, 'healthy');
    const after = lines(curatedLine, DIVERGENCE_MS, 40, 'diverged');
    const {lines: kept, coverage} = await retainNodeLogWindow(
      text([...before, ...after]),
      {firstDivergenceAtMs: DIVERGENCE_MS, maxRetainedBytes: SMALL_BOUND_BYTES},
    );
    assert.equal(coverage.complete, false);
    assert.ok(coverage.retainedBytes <= SMALL_BOUND_BYTES);
    assert.equal(
      coverage.retainedBytes + coverage.withheldBytes,
      byteLength(text(after)),
    );
    assert.ok(coverage.withheldBytes > 0);
    assert.equal(kept[0], after[0]);
    assert.equal(coverage.windowStartAt, new Date(DIVERGENCE_MS).toISOString());
  });

  it('bounds in bytes, not lines: few long lines exceed the bound', async () => {
    const longMessage = 'x'.repeat(SMALL_BOUND_BYTES);
    const content = text([
      curatedLine(DIVERGENCE_MS, longMessage),
      curatedLine(DIVERGENCE_MS + SECOND_MS, longMessage),
    ]);
    const {coverage} = await retainNodeLogWindow(content, {
      firstDivergenceAtMs: DIVERGENCE_MS,
      maxRetainedBytes: SMALL_BOUND_BYTES,
    });
    assert.equal(coverage.complete, false);
    assert.ok(coverage.retainedBytes <= SMALL_BOUND_BYTES);
    assert.equal(
      coverage.retainedBytes + coverage.withheldBytes,
      byteLength(content),
    );
  });

  it('counts UTF-8 bytes, never characters, and never splits a character', async () => {
    const content = curatedLine(DIVERGENCE_MS, 'é'.repeat(SMALL_BOUND_BYTES));
    const {lines: kept, coverage} = await retainNodeLogWindow(content, {
      firstDivergenceAtMs: null,
      maxRetainedBytes: SMALL_BOUND_BYTES + 1,
    });
    assert.equal(coverage.complete, false);
    assert.ok(coverage.retainedBytes <= SMALL_BOUND_BYTES + 1);
    assert.equal(coverage.retainedBytes % 2, 0, 'two-byte characters stay whole');
    assert.equal(
      coverage.retainedBytes + coverage.withheldBytes,
      byteLength(content),
    );
    assert.equal(stringIncludes(kept.join(''), '�'), false);
  });

  it('a newline-free log cannot defeat the bound', async () => {
    const content = 'z'.repeat(SMALL_BOUND_BYTES * 10);
    const {lines: kept, coverage} = await retainNodeLogWindow(content, {
      firstDivergenceAtMs: DIVERGENCE_MS,
      maxRetainedBytes: SMALL_BOUND_BYTES,
    });
    assert.equal(coverage.complete, false);
    assert.equal(coverage.retainedBytes, SMALL_BOUND_BYTES);
    assert.equal(coverage.withheldBytes, SMALL_BOUND_BYTES * 9);
    assert.equal(kept.length, 1);
    assert.equal(byteLength(kept[0]), SMALL_BOUND_BYTES);
    assert.equal(coverage.windowStartAt, null);
  });

  it('retains the last bytes when first divergence is unknown', async () => {
    const all = lines(curatedLine, RUN_START_MS, 40, 'line');
    const {lines: kept, coverage} = await retainNodeLogWindow(text(all), {
      firstDivergenceAtMs: null,
      maxRetainedBytes: SMALL_BOUND_BYTES,
    });
    assert.equal(coverage.firstDivergenceAt, null);
    assert.equal(coverage.complete, false);
    assert.equal(kept[kept.length - 1], all[all.length - 1]);
    assert.equal(
      coverage.retainedBytes + coverage.withheldBytes,
      byteLength(text(all)),
    );
  });

  it('is complete with first divergence unknown only when nothing is withheld', async () => {
    const content = text(lines(curatedLine, RUN_START_MS, 2, 'line'));
    const {coverage} = await retainNodeLogWindow(content, {
      ...CAPTURED,
      firstDivergenceAtMs: null,
      maxRetainedBytes: SMALL_BOUND_BYTES * 4,
    });
    assert.equal(coverage.complete, true);
    assert.equal(coverage.withheldBytes, 0);
    assert.equal(coverage.retainedBytes, byteLength(content));
  });
});

describe('retainNodeLogWindowFromGzip reads the full log', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'full-log-window-'));
  });

  afterEach(async () => {
    await rm(dir, {recursive: true, force: true});
  });

  it('a full log longer than the bound yields a window from first divergence ' +
    'with withheld bytes counted against the full length', async () => {
    const before = lines(pinoLine, RUN_START_MS, 50, 'healthy');
    const after = lines(pinoLine, DIVERGENCE_MS, 200, 'diverged');
    const gzPath = join(dir, `${NODE_ID}.log.gz`);
    await writeFile(gzPath, gzipSync(Buffer.from(text([...before, ...after]))));
    const {lines: kept, coverage} = await retainNodeLogWindowFromGzip(gzPath, {
      firstDivergenceAtMs: DIVERGENCE_MS,
      maxRetainedBytes: SCENARIO_BOUND_BYTES,
    });
    assert.equal(coverage.complete, false);
    assert.equal(coverage.source, gzPath);
    assert.equal(coverage.missingReason, null);
    assert.equal(kept[0], after[0], 'the window starts at first divergence');
    assert.equal(coverage.windowStartAt, new Date(DIVERGENCE_MS).toISOString());
    assert.ok(coverage.retainedBytes <= SCENARIO_BOUND_BYTES);
    assert.equal(
      coverage.withheldBytes,
      byteLength(text(after)) - coverage.retainedBytes,
    );
  });

  it('a missing full log is an incomplete record with unknown withheld bytes', async () => {
    const gzPath = join(dir, 'absent.log.gz');
    const {lines: kept, coverage} = await retainNodeLogWindowFromGzip(gzPath, {
      firstDivergenceAtMs: DIVERGENCE_MS,
    });
    assert.deepEqual(kept, []);
    assert.deepEqual(Object.keys(coverage), COVERAGE_FIELDS);
    assert.equal(coverage.complete, false);
    assert.equal(coverage.retainedBytes, 0);
    assert.equal(coverage.withheldBytes, null);
    assert.equal(coverage.source, null, 'a missing log names no path');
    assert.equal(
      coverage.missingReason,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_MISSING,
    );
  });

  it('a corrupt full log is an incomplete, unreadable record', async () => {
    const gzPath = join(dir, 'corrupt.log.gz');
    await writeFile(gzPath, 'not gzip at all');
    const {coverage} = await retainNodeLogWindowFromGzip(gzPath, {
      firstDivergenceAtMs: DIVERGENCE_MS,
    });
    assert.equal(coverage.complete, false);
    assert.equal(coverage.withheldBytes, null);
    assert.equal(coverage.source, gzPath);
    assert.equal(
      coverage.missingReason,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_UNREADABLE,
    );
  });
});

function playbackEvent(type, entityId, timestamp, details = {}) {
  return JSON.stringify({type, entityId, timestamp, details});
}

// The scenario dir holds the run's events and the curated sample; the full
// log lives at {outputDir}/.full-logs/{scenario}/{nodeId}.log.gz.
// events: RUN (the run created NODE_ID), NO_NODE (the run's stream created
// no node), NONE (no event stream at all).
const EVENTS = Object.freeze({RUN: 'run', NO_NODE: 'no-node', NONE: 'none'});

async function writeScenarioFixture(outputDir, fullLogContent,
  {events: eventsMode = EVENTS.RUN} = {}) {
  const scenarioDir = join(outputDir, SCENARIO_NAME);
  await mkdir(scenarioDir, {recursive: true});
  const events = [
    ...(eventsMode === EVENTS.RUN ?
      [playbackEvent(PLAYBACK_EVENT_TYPE.NODE_CREATED, NODE_ID, RUN_START_MS)] :
      []),
    playbackEvent(PLAYBACK_EVENT_TYPE.SCENARIO_STEP, STEP_NAME, DIVERGENCE_MS, {
      scenarioName: SCENARIO_NAME,
      startedAtMs: DIVERGENCE_MS,
      status: 'started',
      step: STEP_NAME,
    }),
    playbackEvent(
      PLAYBACK_EVENT_TYPE.SCENARIO_STEP,
      STEP_NAME,
      DIVERGENCE_MS + 60 * SECOND_MS,
      {
        durationMs: 60 * SECOND_MS,
        error: 'formation did not converge',
        scenarioName: SCENARIO_NAME,
        startedAtMs: DIVERGENCE_MS,
        status: 'failed',
        step: STEP_NAME,
      },
    ),
  ];
  if (eventsMode !== EVENTS.NONE) {
    await writeFile(join(scenarioDir, 'events.ndjson'), text(events));
  }
  if (eventsMode === EVENTS.RUN) {
    await writeFile(
      join(scenarioDir, `${NODE_ID}.log`),
      text([curatedLine(DIVERGENCE_MS, 'curated sample')]),
    );
  }
  if (fullLogContent !== null) {
    const gzPath = fullLogDestPath(outputDir, SCENARIO_NAME, NODE_ID);
    await mkdir(dirname(gzPath), {recursive: true});
    await writeFile(gzPath, gzipSync(Buffer.from(fullLogContent)));
  }
  return scenarioDir;
}

// The runner carries the capture owner's verdict into the entry
// (report-writer.js captureCompletenessByNodeId).
function failingEntry(captureCompleteness = COMPLETE_CAPTURE) {
  return {
    scenario: SCENARIO_NAME,
    passed: false,
    duration: 100,
    error: 'formation did not converge',
    captureCompletenessByNodeId: {[NODE_ID]: captureCompleteness},
    details: {
      diagnostics: {
        failure: {dominantReason: STALE_DOMINANT_REASON},
      },
    },
  };
}

async function writeBundle(outputDir, entry, scenarioConfigs = null) {
  await writeFailureBundlesForReport({
    scenarios: [entry],
    reportOutputPath: join(outputDir, 'report.json'),
    outputDir,
    reportSummary: {total: 1, passed: 0, failed: 1},
    standardSummary: null,
    benchmarkRegressionGate: null,
    workspaceRoot: outputDir,
    scenarioConfigs,
  });
  const scenarioDir = join(outputDir, SCENARIO_NAME);
  return {
    json: JSON.parse(await readFile(join(scenarioDir, 'failure-bundle.json'), UTF8)),
    markdown: await readFile(join(scenarioDir, 'failure-bundle.md'), UTF8),
    triage: JSON.parse(await readFile(join(scenarioDir, 'triage-summary.json'), UTF8)),
  };
}

function assertNonMeasuring(entry, json, markdown, triage) {
  assert.equal(json.summary.dominantReason, LOG_WINDOW_COVERAGE.WITHHELD);
  assert.equal(json.summary.rootCauseClass, LOG_WINDOW_COVERAGE.WITHHELD);
  assert.equal(entry.dominantReason, LOG_WINDOW_COVERAGE.WITHHELD);
  assert.equal(triage.summary.dominantReason, LOG_WINDOW_COVERAGE.WITHHELD);
  assert.deepEqual(triage.summary.logWindowCoverage, json.summary.logWindowCoverage);
  assert.equal(entry.verdict, HARNESS_VERDICTS.BLOCK_EVIDENCE_INCOMPLETE);
  assert.equal(
    entry.verdictReason,
    SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE,
  );
  assert.match(markdown, /## Log Window Coverage/);
  assert.equal(stringIncludes(markdown, STALE_DOMINANT_REASON), false);
}

describe('failure bundle carries log-window coverage from the full log', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-coverage-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('a complete window keeps the measured verdict and the dominant reason', async () => {
    await writeScenarioFixture(outputDir, text([
      ...lines(pinoLine, RUN_START_MS, 3, 'healthy'),
      ...lines(pinoLine, DIVERGENCE_MS, 3, 'diverged'),
    ]));
    const entry = failingEntry();
    const {json, markdown} = await writeBundle(outputDir, entry);

    const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
    assert.deepEqual(Object.keys(record), COVERAGE_FIELDS);
    assert.equal(record.complete, true);
    assert.equal(record.firstDivergenceAt, new Date(DIVERGENCE_MS).toISOString());
    assert.equal(
      record.source,
      join('.full-logs', SCENARIO_NAME, `${NODE_ID}.log.gz`),
      'the record names the full log as its source',
    );
    assert.equal(json.summary.logWindowCoverage.complete, true);
    assert.equal(json.summary.logWindowCoverage.withheldBytes, 0);
    assert.equal(json.summary.dominantReason, STALE_DOMINANT_REASON);
    assert.notEqual(
      entry.verdictReason,
      SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE,
    );
    assert.match(markdown, /## Log Window Coverage/);
  });

  it('a full log beyond the scenario-configured bound is non-measuring, ' +
    'names the withheld bytes, and suppresses the dominant reason', async () => {
    const after = lines(pinoLine, DIVERGENCE_MS, 200, 'diverged');
    await writeScenarioFixture(outputDir, text([
      ...lines(pinoLine, RUN_START_MS, 3, 'healthy'),
      ...after,
    ]));
    const entry = failingEntry();
    const {json, markdown, triage} = await writeBundle(outputDir, entry, {
      [SCENARIO_NAME]: {
        [LOG_WINDOW_COVERAGE.SCENARIO_CONFIG_KEY]: SCENARIO_BOUND_BYTES,
      },
    });

    const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
    assert.equal(record.complete, false);
    assert.ok(record.retainedBytes <= SCENARIO_BOUND_BYTES);
    assert.equal(record.withheldBytes, byteLength(text(after)) - record.retainedBytes);
    assert.equal(json.logs.excerptsByNodeId[NODE_ID][0], after[0]);
    const summary = json.summary.logWindowCoverage;
    assert.equal(summary.complete, false);
    assert.equal(summary.withheldBytes, record.withheldBytes);
    assert.deepEqual(summary.incompleteNodeIds, [NODE_ID]);
    assert.equal(entry.logWindowCoverage.withheldBytes, record.withheldBytes);
    assertNonMeasuring(entry, json, markdown, triage);
    assert.ok(
      stringIncludes(markdown, `${record.withheldBytes} bytes withheld`),
      'the markdown names the withheld byte count',
    );
  });

  it('a missing node log makes the bundle incomplete and non-measuring', async () => {
    await writeScenarioFixture(outputDir, null);
    const entry = failingEntry();
    const {json, markdown, triage} = await writeBundle(outputDir, entry);

    const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
    assert.equal(record.complete, false);
    assert.equal(record.retainedBytes, 0);
    assert.equal(record.withheldBytes, null);
    assert.equal(
      record.missingReason,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_MISSING,
    );
    assert.deepEqual(json.summary.logWindowCoverage.missingNodeIds, [NODE_ID]);
    assertNonMeasuring(entry, json, markdown, triage);
    assert.ok(stringIncludes(markdown, 'full log missing, empty or unreadable'));
  });
});

describe('every unplaceable byte is retained or counted as withheld', () => {
  const fatalTrailer = [
    '<--- Last few GCs --->',
    'FATAL ERROR: Reached heap limit Allocation failed - ' +
      'JavaScript heap out of memory',
    ' 1: 0xb7a940 node::Abort() [node]',
  ];

  it('keeps an unstamped crash trailer after a quiet node\'s last line ' +
    'before divergence', async () => {
    const before = [pinoLine(RUN_START_MS, 'boot'),
      pinoLine(DIVERGENCE_MS - 5 * SECOND_MS, 'quiet')];
    const {lines: kept, coverage} = await retainNodeLogWindow(
      text([...before, ...fatalTrailer]),
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS,
        maxRetainedBytes: SMALL_BOUND_BYTES * 4},
    );
    assert.deepEqual(kept, fatalTrailer);
    assert.equal(coverage.retainedBytes, byteLength(text(fatalTrailer)));
    assert.equal(coverage.windowStartByte, byteLength(text(before)));
    assert.equal(coverage.withheldBytes, 0);
    assert.equal(coverage.complete, true);
  });

  it('counts an unstamped trailer beyond the bound as withheld', async () => {
    const before = [pinoLine(DIVERGENCE_MS - SECOND_MS, 'quiet')];
    const trailer = lines(() => 'x'.repeat(100), 0, 10, '');
    const {coverage} = await retainNodeLogWindow(text([...before, ...trailer]),
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS,
        maxRetainedBytes: SMALL_BOUND_BYTES});
    assert.equal(coverage.complete, false);
    assert.equal(coverage.retainedBytes + coverage.withheldBytes,
      byteLength(text(trailer)));
  });

  it('starts the window after the last line stamped before divergence, ' +
    'keeping unstamped lines before the first line at divergence', async () => {
    const pre = curatedLine(DIVERGENCE_MS - SECOND_MS, 'pre');
    const between = ['Error: boom', '    at foo (x.js:1:1)'];
    const after = [curatedLine(DIVERGENCE_MS + SECOND_MS, 'post'), 'trailer'];
    const {lines: kept, coverage} = await retainNodeLogWindow(
      text([pre, ...between, ...after]),
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS,
        maxRetainedBytes: SMALL_BOUND_BYTES * 4},
    );
    assert.deepEqual(kept, [...between, ...after]);
    assert.equal(coverage.retainedBytes, byteLength(text([...between, ...after])));
    assert.equal(coverage.complete, true);
  });

  it('a divergence after the end is an empty, complete window only when ' +
    'the last stamped line ends the log', async () => {
    const all = lines(curatedLine, DIVERGENCE_MS - 3 * SECOND_MS, 3, 'pre');
    const {coverage} = await retainNodeLogWindow(text(all),
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS});
    assert.equal(coverage.retainedBytes, 0);
    assert.equal(coverage.withheldBytes, 0);
    assert.equal(coverage.complete, true);
    const unterminated = all.join('\n');
    const last = await retainNodeLogWindow(unterminated,
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS});
    assert.equal(last.coverage.retainedBytes, 0);
    assert.equal(last.coverage.windowStartByte, byteLength(unterminated));
  });
});

describe('the capture owner decides source completeness', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-capture-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('a readable source with no bytes is a missing-class record', async () => {
    const {coverage} = await retainNodeLogWindow('',
      {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS});
    assert.equal(coverage.missingReason,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_EMPTY);
    assert.equal(coverage.withheldBytes, null);
    assert.equal(coverage.complete, false);
    const gzPath = join(outputDir, 'empty.log.gz');
    await writeFile(gzPath, gzipSync(Buffer.alloc(0)));
    const fromGzip = await retainNodeLogWindowFromGzip(gzPath, CAPTURED);
    assert.equal(fromGzip.coverage.missingReason,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_EMPTY);
    assert.equal(fromGzip.coverage.complete, false);
  });

  for (const [label, captureCompleteness] of [
    ['no-lines-captured',
      {complete: false, reason: CAPTURE_COMPLETENESS_REASON.NO_LINES_CAPTURED}],
    ['stale-tail',
      {complete: false, reason: CAPTURE_COMPLETENESS_REASON.STALE_TAIL,
        gapMs: 90 * SECOND_MS}],
    ['not recorded', null],
  ]) {
    it(`a ${label} capture makes a fully retained window non-measuring`,
      async () => {
        await writeScenarioFixture(outputDir, text([
          ...lines(pinoLine, RUN_START_MS, 3, 'healthy'),
          ...lines(pinoLine, DIVERGENCE_MS, 3, 'diverged'),
        ]));
        const entry = failingEntry(captureCompleteness);
        if (captureCompleteness === null) {
          delete entry.captureCompletenessByNodeId;
        }
        const {json, markdown, triage} = await writeBundle(outputDir, entry);
        const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
        assert.equal(record.withheldBytes, 0, 'the window itself is whole');
        assert.equal(record.complete, false);
        assert.deepEqual(record.captureCompleteness,
          captureCompleteness ?? {...CAPTURE_COMPLETENESS_NOT_RECORDED});
        assert.deepEqual(json.summary.logWindowCoverage.captureIncompleteNodeIds,
          [NODE_ID]);
        assertNonMeasuring(entry, json, markdown, triage);
        assert.ok(stringIncludes(markdown, 'capture incomplete'));
      });
  }
});

describe('a non-measuring bundle publishes the withheld state everywhere', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-withheld-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('withholds every verdict field, including ones set before the bundle',
    async () => {
      await writeScenarioFixture(outputDir, null);
      const entry = {
        ...failingEntry(),
        dominantReason: 'set_before_bundle',
        rootCauseClass: 'set_before_bundle',
        failureClassification: {failureClass: 'set_before_bundle'},
        details: {diagnostics: {failure: {
          dominantReason: STALE_DOMINANT_REASON,
          rootCauseClass: 'stale_root_cause',
          reasonCounts: {stale_reason: 3},
          firstFault: {reason: 'stale_reason'},
        }}},
      };
      const {json, markdown, triage} = await writeBundle(outputDir, entry);
      const withheld = LOG_WINDOW_COVERAGE.WITHHELD;
      assertNonMeasuring(entry, json, markdown, triage);
      assert.equal(json.summary.failureClassification.failureClass, withheld);
      assert.equal(json.diagnostics.failure.dominantReason, withheld);
      assert.equal(json.diagnostics.failure.rootCauseClass, withheld);
      assert.equal(json.diagnostics.failure.firstFault.reason, withheld);
      assert.deepEqual(json.diagnostics.failure.reasonCounts, {});
      assert.deepEqual(json.topFailures.reasonCounts, {});
      assert.equal(entry.rootCauseClass, withheld);
      assert.equal(entry.failureClassification.failureClass, withheld);
      assert.equal(entry.details.diagnostics.failure.rootCauseClass, withheld);
      assert.equal(stringIncludes(JSON.stringify(json), 'stale_reason'), false);
    });
});

describe('a bundle that names no node log states why', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-no-nodes-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('a run whose own event stream created no node has nothing to examine',
    async () => {
      await writeScenarioFixture(outputDir, null, {events: EVENTS.NO_NODE});
      const entry = failingEntry();
      const {json} = await writeBundle(outputDir, entry);
      const coverage = json.summary.logWindowCoverage;
      assert.equal(coverage.noNodesNamed,
        LOG_WINDOW_COVERAGE.NO_NODES_NAMED.RUN_CREATED_NO_NODE);
      assert.equal(coverage.complete, true);
      assert.equal(json.summary.dominantReason, STALE_DOMINANT_REASON);
      assert.notEqual(entry.verdictReason,
        SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE);
    });

  it('a run with no event stream and no named node is non-measuring',
    async () => {
      await writeScenarioFixture(outputDir, null, {events: EVENTS.NONE});
      const entry = failingEntry();
      const {json, markdown, triage} = await writeBundle(outputDir, entry);
      assert.equal(json.summary.logWindowCoverage.noNodesNamed,
        LOG_WINDOW_COVERAGE.NO_NODES_NAMED.NODE_IDS_UNKNOWN);
      assert.equal(json.summary.logWindowCoverage.complete, false);
      assertNonMeasuring(entry, json, markdown, triage);
    });
});

describe('bundle artifacts stay bounded', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-size-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('keeps the window once in JSON and a bounded head and tail in markdown',
    async () => {
      const LINE_COUNT = 4000;
      const message = 'diverged ' + 'y'.repeat(200);
      const after = lines(pinoLine, DIVERGENCE_MS, LINE_COUNT, message);
      await writeScenarioFixture(outputDir, text([
        pinoLine(RUN_START_MS, 'boot'),
        ...after,
      ]));
      const entry = failingEntry();
      const {json, markdown} = await writeBundle(outputDir, entry);
      const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
      assert.equal(record.complete, true);
      assert.ok(record.retainedBytes > LOG_WINDOW_COVERAGE.MARKDOWN_EXCERPT_BYTES * 4);
      const jsonText = JSON.stringify(json);
      assert.equal(
        stringSplit(jsonText, `${message} ${LINE_COUNT - 1}`).length - 1,
        1,
        'the window appears once in the JSON artifact',
      );
      assert.equal(json.nodeDiagnostics?.[NODE_ID]?.logExcerpt, undefined);
      assert.ok(byteLength(markdown) <
        LOG_WINDOW_COVERAGE.MARKDOWN_EXCERPT_BYTES + 16 * 1024);
      assert.ok(stringIncludes(markdown, after[0]), 'the head is shown');
      assert.ok(stringIncludes(markdown, after[after.length - 1]),
        'the tail is shown');
      assert.match(markdown, /\d+ bytes of the window omitted here/);
      assert.ok(stringIncludes(markdown,
        `Whole window: failure-bundle.json logs.excerptsByNodeId["${NODE_ID}"] ` +
        `(source bytes ${record.windowStartByte}..${record.windowEndByte}`));
    });

  it('renders a legitimately absent field as none and an unknowable one ' +
    'as unknown', async () => {
    await writeScenarioFixture(outputDir, null);
    const entry = failingEntry();
    const {markdown} = await writeBundle(outputDir, entry);
    assert.ok(stringIncludes(markdown, 'source=`none`'), 'a missing log names no path');
    assert.ok(stringIncludes(markdown, 'withheldBytes=`unknown`'));
    assert.ok(stringIncludes(markdown,
      `captureCompleteness=\`complete:${CAPTURE_QUIET_BOUND_SOURCE.TEARDOWN}\``));
    const complete = await retainNodeLogWindow(text([
      curatedLine(DIVERGENCE_MS, 'x')]), {...CAPTURED, firstDivergenceAtMs: DIVERGENCE_MS});
    assert.equal(formatCoverageField(complete.coverage, 'missingReason'), 'none');
  });
});

// The capture owner's verdict for a node whose last line came 1.5 s before
// its quiet bound, judged 200 s before teardown (the real owner functions).
function verdictJudgedTo(observations) {
  const teardownWallMs = Date.now();
  const quietBound = resolveCaptureQuietBound({teardownWallMs,
    ...observations(teardownWallMs - 200 * SECOND_MS)});
  return assessCaptureCompleteness({lastLineWallMs: quietBound.atMs - 1500,
    lineCount: 5000, quietBound});
}

// The OOM trailer node's own runtime writes to stdout as it aborts.
const FATAL_TRAILER = [
  '<--- Last few GCs --->',
  'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
  ' 1: 0xb7a940 node::Abort() [node]',
];

// Three runs of the scenario as the solver probe reads them: P, F, P.
async function probeStreak(root, failVerdictReason) {
  const reports = join(root, 'test-output', 'reports');
  await mkdir(reports, {recursive: true});
  const runs = [[true, 'scenario_passed'], [false, failVerdictReason],
    [true, 'scenario_passed']];
  for (const [index, [passed, verdictReason]] of runs.entries()) {
    await writeFile(join(reports, `r${index + 1}.report.json`), JSON.stringify({
      timestamp: `2026-11-0${index + 1}T00:00:00.000Z`,
      summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
      optimizationSummary: {totalPriorityItems: passed ? 0 : 1},
      standardSummary: {scenarios: [
        {scenario: SCENARIO_NAME, passed, current: {verdictReason}}]},
    }));
  }
  return measure(root, {probe: 'scenario-harness',
    args: {scenario: SCENARIO_NAME, consecutive: 2}});
}

describe('a node judged to an observed quiet bound is measured, not withheld',
  () => {
    let outputDir;

    beforeEach(async () => {
      outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-quiet-bound-'));
    });

    afterEach(async () => {
      await rm(outputDir, {recursive: true, force: true});
    });

    it('the victim of a kill with a whole window keeps the measured verdict',
      async () => {
        // The victim logged until the harness killed it, before divergence.
        await writeScenarioFixture(outputDir, text(
          lines(pinoLine, RUN_START_MS, 3, 'until killed')));
        const entry = failingEntry(verdictJudgedTo((sinceMs) => ({
          expectedDown: {action: NODE_LIFECYCLE_ACTION.KILL, sinceMs}})));
        const {json, markdown} = await writeBundle(outputDir, entry);
        const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
        assert.equal(record.complete, true);
        assert.equal(record.captureCompleteness.quietBound.action,
          NODE_LIFECYCLE_ACTION.KILL);
        assert.equal(json.summary.dominantReason, STALE_DOMINANT_REASON);
        assert.notEqual(entry.verdictReason,
          SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE);
        assert.ok(stringIncludes(markdown, 'captureCompleteness=`complete:' +
          `${CAPTURE_QUIET_BOUND_SOURCE.HARNESS_STOP}:${NODE_LIFECYCLE_ACTION.KILL}\``));
      });

    it('a node that exited on its own with its FATAL trailer captured is ' +
      'measured, and the probe streak P, F, P is not done', async () => {
      await writeScenarioFixture(outputDir, text([
        pinoLine(RUN_START_MS, 'boot'),
        pinoLine(DIVERGENCE_MS - 5 * SECOND_MS, 'last pino line'),
        ...FATAL_TRAILER,
      ]));
      const entry = failingEntry(verdictJudgedTo((exitMs) => ({
        observedExitMs: exitMs})));
      const {json, markdown} = await writeBundle(outputDir, entry);
      const record = json.logs.logWindowCoverageByNodeId[NODE_ID];
      assert.equal(record.complete, true);
      assert.equal(record.withheldBytes, 0);
      assert.deepEqual(json.logs.excerptsByNodeId[NODE_ID], FATAL_TRAILER);
      assert.equal(record.captureCompleteness.quietBound.source,
        CAPTURE_QUIET_BOUND_SOURCE.CONTAINER_EXIT);
      assert.equal(json.summary.dominantReason, STALE_DOMINANT_REASON);
      assert.notEqual(entry.verdictReason,
        SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE);
      assert.equal(arrayIncludes(NON_MEASURING_VERDICT_REASONS,
        entry.verdictReason), false);
      assert.ok(stringIncludes(markdown, 'captureCompleteness=`complete:' +
        `${CAPTURE_QUIET_BOUND_SOURCE.CONTAINER_EXIT}\``));
      const streak = await probeStreak(join(outputDir, 'probe'),
        entry.verdictReason);
      assert.equal(streak.done, false, 'the failure breaks the pass streak');
      assert.equal(streak.detail.passingStreak, 1);
    });

    it('the same node judged at teardown (no observed exit) is non-measuring ' +
      'and leaves the streak sample', async () => {
      await writeScenarioFixture(outputDir, text([
        pinoLine(RUN_START_MS, 'boot'), ...FATAL_TRAILER]));
      const teardownWallMs = Date.now();
      const entry = failingEntry(assessCaptureCompleteness({
        lastLineWallMs: teardownWallMs - 185 * SECOND_MS, lineCount: 5000,
        quietBound: resolveCaptureQuietBound({teardownWallMs})}));
      await writeBundle(outputDir, entry);
      assert.equal(entry.verdictReason,
        SCENARIO_VERDICT_REASON.LOG_WINDOW_COVERAGE_INCOMPLETE);
      const streak = await probeStreak(join(outputDir, 'probe'),
        entry.verdictReason);
      assert.equal(streak.done, true);
    });
  });

describe('one root-cause answer per bundle', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'failure-bundle-root-cause-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  it('withholds the root-cause bundle\'s code and class too, and names no ' +
    'byte range for a missing log', async () => {
    await writeScenarioFixture(outputDir, null);
    const entry = failingEntry();
    entry.details.diagnostics.rootCauseBundle = {
      rootCauseCode: 'stale_root_cause_code',
      rootCauseClass: 'stale_root_cause_class',
    };
    const {json, markdown} = await writeBundle(outputDir, entry);
    const withheld = LOG_WINDOW_COVERAGE.WITHHELD;
    assert.equal(json.diagnostics.rootCauseBundle.rootCauseCode, withheld);
    assert.equal(json.diagnostics.rootCauseBundle.rootCauseClass, withheld);
    assert.equal(entry.details.diagnostics.rootCauseBundle.rootCauseClass, withheld);
    assert.equal(stringIncludes(JSON.stringify(json), 'stale_root_cause'), false);
    assert.equal(stringIncludes(markdown, 'none..none'), false);
    assert.ok(stringIncludes(markdown,
      `no window: ${LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_MISSING}`));
  });
});
