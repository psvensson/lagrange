// Contract for the fallback-branch coverage census
// (scripts/checks/fallback-branch-census.js).
//
// The census decides which fallback branches are dead, and a dead verdict
// becomes a deletion, so every way it could acquit or condemn a site wrongly
// is pinned here against synthetic V8 coverage: innermost-range semantics
// (an executed outer range does not execute a zero-count inner block), the
// union across processes, every class including `unloaded` for a file no run
// loaded and for a file whose content drifted since collection, the runs
// each record names, the exact output schema and its order, and that
// `collect` hands NODE_V8_COVERAGE and the coverage-flush preload to the
// lane it starts and records the digest of every src file, and that a
// process a signal ends still leaves its coverage behind.

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';

import {
  collectRun,
  composeNodeOptions,
  coveragePreloadOption,
  formatCensusReport,
  joinCensus,
  laneEnvironment,
  laneProblems,
} from '../../scripts/checks/fallback-branch-census.js';
import {
  currentPreloadSha256,
  executedIntervalsOfScript,
  intervalsOverlap,
  mergeRuns,
  unionIntervals,
} from '../../scripts/checks/fallback-branch-census-coverage.js';
import {accountWitnesses} from '../../scripts/checks/fallback-branch-census-witnesses.js';
import {
  CENSUS_COVERAGE_DIR_ENV,
  CENSUS_DEMO_STOP_DEADLINE_MS,
  CENSUS_SCHEMA,
  CENSUS_TEST_HEAP_MB,
  DEMO_STOP_DEADLINE_ENV,
  PRELOAD_MODULE_RELATIVE,
  REQUIRED_CENSUS_LANES,
  TEST_HEAP_ENV,
} from '../../scripts/checks/fallback-branch-census-constants.js';
import {
  measureNavigabilityBudgetWithFailures,
} from '../../scripts/checks/code-navigability-budget.js';

const RUN_A = 'unit-hostA-20261108T100000Z';
const RUN_B = 'formation-hostB-20261108T110000Z';
const COMMIT = '1ad04d21a0000000000000000000000000000000';
const HEAD = '2bd04d21a0000000000000000000000000000000';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Two src files whose offsets the coverage below addresses. Offsets are
// character positions in these exact strings.
const SOURCE = Object.freeze({
  'src/a.js': 'const v = a.x || b.y;\nfunction f() { try { g(); } catch { return null; } }\n',
  'src/b.js': 'export const w = typeof h === \'function\' ? h() : 0;\n',
  'src/never-loaded.js': 'const z = p.q ?? r.s;\n',
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-census-'));
  for (const [file, text] of Object.entries(SOURCE)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

function fileUrl(root, file) {
  return pathToFileURL(path.join(root, file)).href;
}

// One process's coverage file: `scripts` maps a repo path to its function
// list, each a list of [start, end, count] ranges.
function writeProcess(dir, name, root, scripts) {
  fs.mkdirSync(dir, {recursive: true});
  const result = Object.entries(scripts).map(([file, functions]) => ({
    scriptId: '1',
    url: file.startsWith('node:') ? file : fileUrl(root, file),
    functions: functions.map((ranges, index) => ({
      functionName: index === 0 ? '' : `fn${index}`,
      isBlockCoverage: true,
      ranges: ranges.map(([startOffset, endOffset, count]) =>
        ({startOffset, endOffset, count})),
    })),
  }));
  fs.writeFileSync(path.join(dir, name), JSON.stringify({result}));
  const match = /^coverage-(\d+)-(\d+)-(\d+)\.json$/u.exec(name);
  if (match && !fs.existsSync(path.join(dir, `witness-${match[1]}-${match[3]}.json`))) {
    const pid = Number(match[1]);
    const writtenAtMs = Number(match[2]);
    const threadId = Number(match[3]);
    writeMarkers(dir, pid, threadId, {
      pid, threadId, ppid: 1, entry: path.join(root, 'test', 'fixture.test.js'),
      cwd: root, startedAt: '2026-11-08T10:00:00.000Z', isMainThread: threadId === 0,
    }, {complete: true, by: 'exit', exitCode: 0, at: new Date(writtenAtMs).toISOString()});
  }
}

function v8Digest(dir) {
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const digests = names.map((name) => sha256(fs.readFileSync(path.join(dir, name)))).sort();
  return sha256(digests.join('\n'));
}

function writeRunJson(runDir, record) {
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
}

function runRecord(id, lane, host, runDir, root, overrides = {}) {
  const fileDigests = {};
  for (const [file, text] of Object.entries(SOURCE)) fileDigests[file] = sha256(text);
  const coveragePreload = overrides.coveragePreload !== undefined ?
    overrides.coveragePreload : {
      active: true,
      option: coveragePreloadOption(),
      module: PRELOAD_MODULE_RELATIVE,
      sha256: currentPreloadSha256(),
    };
  return {
    id, lane, host, commit: COMMIT, root,
    startedAt: '2026-11-08T10:00:00.000Z', finishedAt: '2026-11-08T10:05:00.000Z',
    exitCode: 0, coveragePreload, coverageDigest: v8Digest(path.join(runDir, 'v8')),
    fileDigests: {...fileDigests, ...(overrides.fileDigests || {})},
    ...(overrides.problems !== undefined ? {problems: overrides.problems} : {}),
  };
}

// The two-run fixture: run A (unit) executes the || primary only and the try
// block; run B (formation) executes the || fallback and the catch body. File
// b.js is loaded only by run A, with the typeof then side executed.
function buildTwoRuns(root) {
  const a = SOURCE['src/a.js'];
  const lineTwo = a.indexOf('function');
  const tryStart = a.indexOf('{ g()');
  const catchStart = a.indexOf('{ return null');
  const catchEnd = a.indexOf('}', catchStart) + 1;
  const fallbackStart = a.indexOf('b.y');
  const b = SOURCE['src/b.js'];
  const elseStart = b.indexOf('0;');
  const runA = path.join(root, 'test-output', 'runA');
  const runB = path.join(root, 'test-output', 'runB');
  writeProcess(path.join(runA, 'v8'), 'coverage-1-1794000000000-0.json', root, {
    'src/a.js': [
      [[0, a.length, 1], [fallbackStart, fallbackStart + 3, 0]],
      [[lineTwo, a.length - 1, 1], [catchStart, catchEnd, 0]],
    ],
    'src/b.js': [[[0, b.length, 1], [elseStart, elseStart + 1, 0]]],
    'node:internal/x': [[[0, 10, 1]]],
  });
  writeProcess(path.join(runA, 'v8'), 'coverage-2-1794000000000-0.json', root, {
    'test/x.test.js': [[[0, 5, 1]]],
  });
  writeProcess(path.join(runB, 'v8'), 'coverage-3-1794000000000-0.json', root, {
    'src/a.js': [
      [[0, a.length, 1]],
      [[lineTwo, a.length - 1, 1], [tryStart, tryStart + 8, 0]],
    ],
  });
  writeRunJson(runA, runRecord(RUN_A, 'unit', 'hostA', runA, root));
  writeRunJson(runB, {...runRecord(RUN_B, 'formation', 'hostB', runB, root),
    startedAt: '2026-11-08T11:00:00.000Z'});
  return {runA, runB, tryStart, catchStart, catchEnd, fallbackStart, elseStart};
}

function sitesFor(root, offsets) {
  const a = SOURCE['src/a.js'];
  const b = SOURCE['src/b.js'];
  const orStart = a.indexOf('a.x');
  const orEnd = a.indexOf(';');
  const tryKeyword = a.indexOf('try');
  const typeofStart = b.indexOf('typeof');
  const z = SOURCE['src/never-loaded.js'];
  const site = (row, file, range, primary, fallback) => ({
    row, file, range, loc: {}, kind: row, detail: '', occurrence: 0,
    hash: sha256(`${file}\n${SOURCE[file].slice(range[0], range[1])}`),
    sides: {primary, fallback},
  });
  return [
    site('typeof_dual_paths', 'src/b.js', [typeofStart, b.length - 2],
      [b.indexOf('h()'), b.indexOf('h()') + 3], [offsets.elseStart, offsets.elseStart + 1]),
    site('catch_returns_default', 'src/a.js', [tryKeyword, offsets.catchEnd],
      [offsets.tryStart, offsets.catchStart - 7], [offsets.catchStart, offsets.catchEnd]),
    site('two_source_fallback_reads', 'src/a.js', [orStart, orEnd],
      [orStart, orStart + 3], [offsets.fallbackStart, offsets.fallbackStart + 3]),
    site('two_source_fallback_reads', 'src/never-loaded.js', [10, z.length - 2],
      [10, 13], [17, 20]),
  ];
}

test('an executed outer range does not execute its zero-count inner block', () => {
  const intervals = executedIntervalsOfScript([
    {ranges: [{startOffset: 0, endOffset: 100, count: 3},
      {startOffset: 40, endOffset: 60, count: 0}]},
    // An inner function nested in the zero block, itself executed: innermost wins.
    {ranges: [{startOffset: 45, endOffset: 50, count: 1}]},
  ]);
  assert.deepEqual(intervals, [[0, 40], [45, 50], [60, 100]]);
  assert.equal(intervalsOverlap(intervals, [41, 44]), false);
  assert.equal(intervalsOverlap(intervals, [40, 41]), false);
  assert.equal(intervalsOverlap(intervals, [39, 41]), true);
  assert.equal(intervalsOverlap(intervals, [46, 47]), true);
  assert.equal(intervalsOverlap(intervals, [100, 101]), false);
  assert.deepEqual(executedIntervalsOfScript([
    {ranges: [{startOffset: 0, endOffset: 10, count: 0}]},
  ]), []);
});

test('intervals union across processes into one sorted disjoint list', () => {
  assert.deepEqual(unionIntervals([[0, 5], [10, 20]], [[3, 12], [30, 40]]),
    [[0, 20], [30, 40]]);
  assert.deepEqual(unionIntervals([], [[1, 2]]), [[1, 2]]);
  assert.deepEqual(unionIntervals([[1, 2]], [[2, 3]]), [[1, 3]]);
});

test('merge keeps only src files, unions processes per run, and checks digests', () => {
  const root = makeRoot();
  const {runA, runB, catchStart, catchEnd} = buildTwoRuns(root);
  const merged = mergeRuns([runA, runB]);
  assert.equal(merged.schema, 'fallback-census-merged/1');
  assert.deepEqual(merged.runs.map((run) => run.id), [RUN_A, RUN_B]);
  assert.deepEqual(Object.keys(merged.files).sort(), ['src/a.js', 'src/b.js']);
  assert.equal(merged.files['src/a.js'].loaded, true);
  assert.deepEqual(Object.keys(merged.files['src/a.js'].runs).sort(), [RUN_B, RUN_A].sort());
  assert.deepEqual(Object.keys(merged.files['src/b.js'].runs), [RUN_A]);
  // Run A never ran the catch body; run B did.
  assert.equal(intervalsOverlap(merged.files['src/a.js'].runs[RUN_A],
    [catchStart, catchEnd]), false);
  assert.equal(intervalsOverlap(merged.files['src/a.js'].runs[RUN_B],
    [catchStart, catchEnd]), true);
  assert.equal(merged.processes[RUN_A], 2);
  assert.deepEqual(merged.unreadable, []);

  // A coverage directory that changed after collection is refused.
  fs.writeFileSync(path.join(runB, 'v8', 'coverage-9-1794000000000-0.json'), JSON.stringify({result: []}));
  assert.throws(() => mergeRuns([runA, runB]), /coverage digest/u);
});

test('an unreadable coverage file is counted, never skipped silently', () => {
  const root = makeRoot();
  const {runA} = buildTwoRuns(root);
  fs.writeFileSync(path.join(runA, 'v8', 'coverage-0-1794000000000-0.json'), '{"result": [');
  writeRunJson(runA, runRecord(RUN_A, 'unit', 'hostA', runA, root));
  const merged = mergeRuns([runA]);
  assert.deepEqual(merged.unreadable, [{run: RUN_A, file: 'coverage-0-1794000000000-0.json'}]);
});

test('join classifies every site, names its runs, and matches the schema exactly', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const census = joinCensus({
    merged, runDirs: [offsets.runA, offsets.runB], sites: sitesFor(root, offsets),
    root, head: HEAD, now: () => new Date('2026-11-08T12:00:00.000Z'),
  });
  assert.deepEqual(Object.keys(census), ['schema', 'generatedAt', 'head', 'runs', 'sites']);
  assert.equal(census.schema, 'fallback-census/1');
  assert.equal(census.generatedAt, '2026-11-08T12:00:00.000Z');
  assert.equal(census.head, HEAD);
  assert.deepEqual(census.runs.map((run) => Object.keys(run)),
    [0, 1].map(() => ['id', 'lane', 'host', 'commit', 'startedAt', 'coverageDigest',
      'witnesses']));
  assert.deepEqual(census.runs.map((run) => run.id), [RUN_A, RUN_B]);
  const summary = census.sites.map((site) =>
    [site.file, site.row, site.class, site.sidesExecuted, site.runs]);
  assert.deepEqual(summary, [
    // The || site: primary only under A, fallback only under B: both.
    ['src/a.js', 'two_source_fallback_reads', 'both', {primary: true, fallback: true},
      [RUN_A, RUN_B]],
    // The catch site: try under A, catch body under B: both.
    ['src/a.js', 'catch_returns_default', 'both', {primary: true, fallback: true},
      [RUN_A, RUN_B]],
    // The typeof site: then side only.
    ['src/b.js', 'typeof_dual_paths', 'primary-only', {primary: true, fallback: false},
      [RUN_A]],
    // A file no run loaded is unloaded, never `never`.
    ['src/never-loaded.js', 'two_source_fallback_reads', 'unloaded',
      {primary: false, fallback: false}, []],
  ]);
  for (const site of census.sites) {
    assert.deepEqual(Object.keys(site), ['file', 'row', 'range', 'hash', 'occurrence', 'class',
      'sidesExecuted', 'runs', 'sidesByRun']);
  }
  // Per-run sides answer which run executed which side: the || site's
  // fallback ran only under the formation run B, never under unit run A.
  assert.deepEqual(census.sites[0].sidesByRun, {
    [RUN_A]: {primary: true, fallback: false},
    [RUN_B]: {primary: true, fallback: true},
  });
  assert.deepEqual(census.sites[3].sidesByRun, {});
  // Sorted by file, then range start.
  assert.ok(census.sites[0].range[0] < census.sites[1].range[0]);
});

test('join reads fallback-only and never from one run each', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const sites = sitesFor(root, offsets);
  const merged = mergeRuns([offsets.runB]);
  const census = joinCensus({merged, runDirs: [offsets.runB], sites, root, head: HEAD});
  const byRow = Object.fromEntries(census.sites.filter((site) => site.file === 'src/a.js')
    .map((site) => [site.row, site.class]));
  assert.equal(byRow.catch_returns_default, 'fallback-only');
  const neverSite = {...sites[1], sides: {primary: [offsets.tryStart + 2, offsets.tryStart + 6],
    fallback: [offsets.tryStart + 3, offsets.tryStart + 5]}};
  const never = joinCensus({merged, runDirs: [offsets.runB], sites: [neverSite], root,
    head: HEAD});
  assert.equal(never.sites[0].class, 'never');
  assert.deepEqual(never.sites[0].runs, [RUN_B]);
  // b.js was not loaded by B: unloaded.
  assert.equal(census.sites.find((site) => site.file === 'src/b.js').class, 'unloaded');
});

test('a file whose content drifted since every loading run is unloaded', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  fs.appendFileSync(path.join(root, 'src/b.js'), '// edited after collection\n');
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD});
  const b = census.sites.find((site) => site.file === 'src/b.js');
  assert.equal(b.class, 'unloaded');
  assert.deepEqual(b.runs, []);

  // A run whose recorded digest disagrees is dropped; the matching run still counts.
  const root2 = makeRoot();
  const offsets2 = buildTwoRuns(root2);
  writeRunJson(offsets2.runB, {...runRecord(RUN_B, 'formation', 'hostB', offsets2.runB, root2,
    {fileDigests: {'src/a.js': sha256('older content')}}), startedAt: '2026-11-08T11:00:00.000Z'});
  const merged2 = mergeRuns([offsets2.runA, offsets2.runB]);
  const census2 = joinCensus({merged: merged2, runDirs: [offsets2.runA, offsets2.runB],
    sites: sitesFor(root2, offsets2), root: root2, head: HEAD});
  const catchSite = census2.sites.find((site) => site.row === 'catch_returns_default');
  assert.equal(catchSite.class, 'primary-only');
  assert.deepEqual(catchSite.runs, [RUN_A]);
});

test('an incomplete run only ever proves both sides; anything less is unloaded', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  writeRunJson(offsets.runB, {...runRecord(RUN_B, 'formation', 'hostB', offsets.runB, root),
    startedAt: '2026-11-08T11:00:00.000Z', incomplete: true, unreachedFiles: ['test/y.test.js']});
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD});
  const byRow = Object.fromEntries(census.sites.filter((site) => site.file === 'src/a.js')
    .map((site) => [site.row, site]));
  // Both sides observed: positive evidence holds even from an incomplete run.
  assert.equal(byRow.catch_returns_default.class, 'both');
  // B alone, incomplete: fallback-only is not trusted; the site stays uncensused.
  const alone = joinCensus({merged: mergeRuns([offsets.runB]), runDirs: [offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD});
  const catchSite = alone.sites.find((site) => site.row === 'catch_returns_default');
  assert.equal(catchSite.class, 'unloaded');
  assert.deepEqual(catchSite.sidesExecuted, {primary: false, fallback: true});
  assert.deepEqual(catchSite.runs, [RUN_B]);
});

test('join refuses a run the merge did not include', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const merged = mergeRuns([offsets.runA]);
  assert.throws(() => joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD}), /not in the merged coverage/u);
});

test('report counts classes, rows and top files', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD});
  const text = formatCensusReport(census);
  assert.match(text, /sites: 4/u);
  assert.match(text, /both: 2/u);
  assert.match(text, /unloaded: 1/u);
  assert.match(text, /two_source_fallback_reads: both 1, unloaded 1/u);
  assert.match(text, /both: src\/a\.js 2/u);
});

test('collect hands NODE_V8_COVERAGE to the lane and records every src digest', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'unit');
  const seen = path.join(root, 'seen-env.json');
  const script = [
    'const fs = require("fs"); const p = require("path");',
    `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({`,
    'cov: process.env.NODE_V8_COVERAGE, placement: process.env.LAGRANGE_PLACEMENT,',
    'armed: process.env.LAGRANGE_CENSUS_COVERAGE_DIR,',
    'heap: process.env.LAGRANGE_TEST_MAX_OLD_SPACE_MB,',
    'demoStop: process.env.LAGRANGE_AFFINITY_DEMO_STOP_DEADLINE_MS ?? null,',
    'options: process.env.NODE_OPTIONS}));',
    'process.exitCode = 3;',
  ].join(' ');
  const record = collectRun({
    lane: 'unit', out, root, command: [process.execPath, '-e', script],
    host: 'hostA', commit: COMMIT,
    now: (() => {
      const times = ['2026-11-08T10:00:00.000Z', '2026-11-08T10:01:00.000Z'];
      return () => new Date(times.shift());
    })(),
  });
  const env = JSON.parse(fs.readFileSync(seen, 'utf8'));
  assert.equal(env.cov, path.join(out, 'v8'));
  assert.equal(env.placement, 'local');
  // The pre-kill flush is armed with the coverage directory; the test heap
  // leaves room for coverage writes; only the formation lane gets the demo's
  // long stop deadline.
  assert.equal(env.armed, path.join(out, 'v8'));
  assert.equal(env.heap, String(CENSUS_TEST_HEAP_MB));
  assert.equal(env.demoStop, null);
  // Appended to whatever the caller had (a lane may itself run under one).
  assert.ok(env.options.endsWith(coveragePreloadOption()), env.options);
  const written = JSON.parse(fs.readFileSync(path.join(out, 'run.json'), 'utf8'));
  assert.deepEqual(written, record);
  assert.equal(written.id, 'unit-hostA-20261108T100000Z');
  assert.equal(written.lane, 'unit');
  assert.equal(written.commit, COMMIT);
  assert.equal(written.exitCode, 3);
  assert.equal(written.incomplete, false);
  assert.equal(written.coveragePreload.active, true);
  assert.equal(written.coveragePreload.option, coveragePreloadOption());
  assert.equal(written.coveragePreload.module,
    'scripts/checks/fallback-branch-census-preload.js');
  assert.match(written.coveragePreload.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(written.startedAt, '2026-11-08T10:00:00.000Z');
  assert.equal(written.finishedAt, '2026-11-08T10:01:00.000Z');
  // The child itself was a node process under coverage: its file is digested.
  assert.equal(written.coverageDigest, v8Digest(path.join(out, 'v8')));
  assert.deepEqual(written.fileDigests, Object.fromEntries(Object.entries(SOURCE)
    .map(([file, text]) => [file, sha256(text)]).sort(([x], [y]) => (x < y ? -1 : 1))));
  assert.throws(() => collectRun({lane: 'nightly', out, root}), /unknown lane/u);
});

test('collect appends the preload to the NODE_OPTIONS it was given', () => {
  assert.equal(composeNodeOptions(undefined, '--import=file:///p.js'), '--import=file:///p.js');
  assert.equal(composeNodeOptions(' --max-old-space-size=512 ', '--import=file:///p.js'),
    '--max-old-space-size=512 --import=file:///p.js');
});

// A lane process that a signal ends: one listens for SIGTERM itself, ignores
// it and is then SIGKILLed (a formation node whose drain overran its driver's
// deadline): the preload flushes beside its listener. One has no listener and
// must still die by SIGTERM: the preload does not intercept it, and it is a
// lost witness.
test('a listening process flushes at the signal; a process without a listener dies by it', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'formation');
  const ignores = path.join(root, 'ignores-term.cjs');
  const plain = path.join(root, 'plain-term.cjs');
  const outcome = path.join(root, 'outcome.json');
  fs.writeFileSync(ignores, [
    'process.on("SIGTERM", () => {});',
    'setInterval(() => {}, 1000);',
    'process.stdout.write("ready\\n");',
  ].join('\n'));
  fs.writeFileSync(plain, [
    'setInterval(() => {}, 1000);',
    'process.stdout.write("ready\\n");',
  ].join('\n'));
  const driver = path.join(root, 'driver.cjs');
  fs.writeFileSync(driver, `
const {spawn} = require('node:child_process');
const fs = require('node:fs');
function started(file) {
  const child = spawn(process.execPath, [file], {stdio: ['ignore', 'pipe', 'inherit']});
  return new Promise((resolve) => child.stdout.once('data', () => resolve(child)));
}
function ended(child) {
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({code, signal})));
}
(async () => {
  const stubborn = await started(${JSON.stringify(ignores)});
  const stubbornEnd = ended(stubborn);
  stubborn.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  stubborn.kill('SIGKILL');
  const plain = await started(${JSON.stringify(plain)});
  const plainEnd = ended(plain);
  plain.kill('SIGTERM');
  fs.writeFileSync(${JSON.stringify(outcome)},
    JSON.stringify({stubborn: await stubbornEnd, plain: await plainEnd}));
})();
`);
  const record = collectRun({
    lane: 'formation', out, root, command: [process.execPath, driver],
    host: 'hostB', commit: COMMIT,
  });
  assert.equal(record.exitCode, 0);
  const ended = JSON.parse(fs.readFileSync(outcome, 'utf8'));
  assert.deepEqual(ended.stubborn, {code: null, signal: 'SIGKILL'});
  assert.deepEqual(ended.plain, {code: null, signal: 'SIGTERM'});
  const covered = new Set();
  for (const name of fs.readdirSync(path.join(out, 'v8'))) {
    if (!name.startsWith('coverage-')) continue;
    const coverage = JSON.parse(fs.readFileSync(path.join(out, 'v8', name), 'utf8'));
    for (const script of coverage.result) covered.add(script.url);
  }
  assert.ok(covered.has(pathToFileURL(ignores).href), 'the SIGKILLed process flushed on SIGTERM');
  // Three threads started (driver, stubborn, plain); the two a signal ended
  // are lost, named with their entry scripts.
  assert.equal(record.witnesses.started, 3);
  assert.equal(record.witnesses.complete, 1);
  assert.deepEqual(record.witnesses.lost.map((lost) => lost.entry).sort(),
    [ignores, plain].sort());
  const stubbornLost = record.witnesses.lost.find((lost) => lost.entry === ignores);
  assert.equal(stubbornLost.isMainThread, true);
  assert.equal(stubbornLost.cause, 'unknown');
  assert.match(stubbornLost.lastFlushAt, /^\d{4}-\d{2}-\d{2}T/u);
});

// An end marker's `at` and its millisecond, which coverage file names share.
const END_AT = '2026-11-08T10:00:00.000Z';
const END_AT_MS = Date.parse(END_AT);

// Start/end markers named the way the preload writes them.
function writeMarkers(dir, pid, threadId, start, end) {
  fs.mkdirSync(dir, {recursive: true});
  const startPath = path.join(dir, `witness-${pid}-${threadId}.json`);
  const endPath = path.join(dir, `witness-${pid}-${threadId}-exit.json`);
  if (start) fs.writeFileSync(startPath, JSON.stringify(start));
  if (end) {
    fs.writeFileSync(endPath, JSON.stringify(end));
  } else if (fs.existsSync(endPath)) {
    fs.rmSync(endPath);
  }
}

test('witness accounting: an end marker, or an orderly process exit for a worker, completes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-witness-'));
  const start = (pid, threadId, entry) => ({pid, threadId, ppid: 1, entry, cwd: '/r',
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: threadId === 0});
  // pid 10 exited in order (end marker, then its final write): its worker 1
  // has no end marker of its own.
  writeMarkers(dir, 10, 0, start(10, 0, '/r/a.js'), {complete: true, by: 'exit', at: END_AT});
  fs.writeFileSync(path.join(dir, `coverage-10-${END_AT_MS}-0.json`), '{"result":[]}');
  writeMarkers(dir, 10, 1, start(10, 1, '/r/w.js'), null);
  // pid 20 re-raised a signal after its flush: complete; its worker is lost.
  writeMarkers(dir, 20, 0, start(20, 0, '/r/b.js'), {complete: true, by: 'signal', at: END_AT});
  fs.writeFileSync(path.join(dir, `coverage-20-${END_AT_MS + 3}-0.json`), '{"result":[]}');
  writeMarkers(dir, 20, 1, start(20, 1, '/r/w.js'), null);
  // pid 30 vanished after one flush; pid 40's start marker is unreadable.
  writeMarkers(dir, 30, 0, start(30, 0, '/r/c.js'), null);
  fs.writeFileSync(path.join(dir, 'coverage-30-1794000000000-0.json'), '{"result":[]}');
  fs.writeFileSync(path.join(dir, 'coverage-30-1794000005000-0.json'), '{"result":[]}');
  fs.writeFileSync(path.join(dir, 'witness-40-0.json'), '{');
  const accounted = accountWitnesses(dir, fs.readdirSync(dir).sort());
  assert.equal(accounted.started, 6);
  assert.equal(accounted.complete, 3);
  assert.deepEqual(accounted.lost.map((lost) => [lost.pid, lost.threadId, lost.entry,
    lost.isMainThread, lost.lastFlushAt, lost.cause]), [
    [20, 1, '/r/w.js', false, null, 'unknown'],
    [30, 0, '/r/c.js', true, new Date(1794000005000).toISOString(), 'unknown'],
    [40, 0, null, true, null, 'unknown'],
  ]);
});

test('every thread writes a start marker and, on an orderly end, an end marker', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'unit');
  const worker = path.join(root, 'worker.cjs');
  fs.writeFileSync(worker, 'setTimeout(() => {}, 20);\n');
  const driver = path.join(root, 'driver-worker.cjs');
  fs.writeFileSync(driver, `
const {Worker} = require('node:worker_threads');
new Worker(${JSON.stringify(worker)}).on('exit', () => {});
`);
  const record = collectRun({lane: 'unit', out, root, command: [process.execPath, driver],
    host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0);
  assert.deepEqual(record.witnesses, {started: 2, complete: 2, flushed: 0, lost: [],
    external: []});
  const v8 = path.join(out, 'v8');
  const markers = fs.readdirSync(v8).filter((name) => name.startsWith('witness-')).sort();
  assert.equal(markers.length, 4);
  const starts = markers.filter((name) => !name.endsWith('-exit.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(v8, name), 'utf8')));
  assert.deepEqual(starts.map((start) => [start.threadId, start.isMainThread, start.entry])
    .sort(), [[0, true, driver], [1, false, worker]]);
  for (const start of starts) {
    assert.deepEqual(Object.keys(start),
      ['pid', 'threadId', 'ppid', 'entry', 'cwd', 'startedAt', 'isMainThread', 'flushSignal']);
  }
});

test('periodic flushes leave files whose union equals one final write', () => {
  const root = makeRoot();
  const script = path.join(root, 'src', 'phased.js');
  // Phase one runs `left`, a flush interval passes, phase two runs `right`.
  fs.writeFileSync(script, [
    'function left() { return 1; }',
    'function right() { return 2; }',
    'function pick(flag) { if (flag) { return left(); } else { return right(); } }',
    'pick(true);',
    'const until = Date.now() + 400; while (Date.now() < until) {}',
    'setTimeout(() => { pick(false); }, 300);',
  ].join('\n'));
  const run = (name, interval) => {
    const out = path.join(root, 'test-output', name);
    collectRun({lane: 'unit', out, root, command: [process.execPath, script],
      env: {...process.env, LAGRANGE_CENSUS_FLUSH_INTERVAL_MS: interval},
      // Distinct hosts: two runs started in one second would share an id.
      host: name, commit: COMMIT});
    return out;
  };
  const flushed = run('flushed', '100');
  const single = run('single', '600000');
  const coverageFiles = (out) => fs.readdirSync(path.join(out, 'v8'))
    .filter((name) => name.startsWith('coverage-'));
  // The long interval never fires: only the beforeExit flush and the exit write.
  assert.ok(coverageFiles(flushed).length > coverageFiles(single).length,
    'the short interval flushed');
  const merged = mergeRuns([flushed, single]);
  const runs = merged.files['src/phased.js'].runs;
  const [flushedId, singleId] = merged.runs.map((entry) => entry.id);
  assert.deepEqual(runs[flushedId], runs[singleId]);
});

test('merge names each lost witness with the repository files its coverage shows', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const v8 = path.join(offsets.runB, 'v8');
  writeMarkers(v8, 3, 0, {pid: 3, threadId: 0, ppid: 1, entry: path.join(root, 'test', 'x.test.js'),
    cwd: root, startedAt: '2026-11-08T11:00:00.000Z', isMainThread: true}, null);
  writeRunJson(offsets.runB, {...runRecord(RUN_B, 'formation', 'hostB', offsets.runB, root),
    startedAt: '2026-11-08T11:00:00.000Z'});
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  assert.deepEqual(merged.witnesses[RUN_A], {started: 2, complete: 2, flushed: 0, lost: [],
    external: []});
  assert.equal(merged.witnesses[RUN_B].lost.length, 1);
  assert.deepEqual(merged.witnesses[RUN_B].lost[0].seenFiles, ['src/a.js']);
  assert.equal(merged.processes[RUN_B], 1, 'a marker is not a coverage file');
});

test('a lost witness voids every acquittal in its closure; both and other files stand', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const v8 = path.join(offsets.runA, 'v8');
  // A unit test process that died: its entry imports src/b.js only.
  writeMarkers(v8, 7, 0, {pid: 7, threadId: 0, ppid: 1,
    entry: path.join(root, 'test', 'y.test.js'), cwd: root,
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: true}, null);
  writeRunJson(offsets.runA, runRecord(RUN_A, 'unit', 'hostA', offsets.runA, root));
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const importers = {'src/b.js': ['test/y.test.js'], 'src/a.js': ['test/z.test.js']};
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD, importers});
  const byFile = census.sites.map((site) => [site.file, site.class, site.lostWitnesses]);
  assert.deepEqual(byFile, [
    ['src/a.js', 'both', undefined],
    ['src/a.js', 'both', undefined],
    // primary-only on surviving coverage, but the lost process could have
    // run the else side: unobserved, naming the witness. Never acquitted.
    ['src/b.js', 'unobserved', [`${RUN_A}:7:0`]],
    ['src/never-loaded.js', 'unloaded', undefined],
  ]);
  assert.deepEqual(census.runs[0].witnesses, {started: 3, complete: 2, flushed: 0, lost: 1,
    external: 0});
  // A run whose tree had other content for the file cannot void it.
  writeRunJson(offsets.runA, runRecord(RUN_A, 'unit', 'hostA', offsets.runA, root,
    {fileDigests: {'src/b.js': 'other'}}));
  const drifted = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD, importers});
  assert.equal(drifted.sites[2].class, 'unloaded');
});

test('the census schema is the one the navigability budget reads', () => {
  const budget = fs.readFileSync(new URL('../../scripts/checks/code-navigability-budget.js',
    import.meta.url), 'utf8');
  assert.match(budget, new RegExp(`CENSUS_SCHEMA = '${CENSUS_SCHEMA.replace('/', '\\/')}'`, 'u'));
});

test('a process that signals itself and returns still dies by the signal', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'unit');
  const script = path.join(root, 'self-term.cjs');
  fs.writeFileSync(script, 'process.kill(process.pid, \'SIGTERM\');\n');
  const record = collectRun({lane: 'unit', out, root, command: [process.execPath, script],
    host: 'hostA', commit: COMMIT});
  // The lane is the process itself: it was signalled, as without the preload.
  assert.equal(record.signal, 'SIGTERM');
  assert.equal(record.incomplete, true);
});

// ---- Round 3: losses eliminated, not accepted -------------------------------

const PRE_KILL_HELPER = new URL(
  '../../scripts/checks/census-pre-kill-flush.js',
  import.meta.url,
).href;

// A child that starts one file-backed worker and says `ready` once the
// worker runs (its preload - start marker, flush channel - is in place by
// then). `handlesTerm` gives it a SIGTERM handler that exits in order.
function writeKillChild(root, name, {handlesTerm = false, blocks = false} = {}) {
  const worker = path.join(root, `${name}-worker.cjs`);
  fs.writeFileSync(worker, [
    'const {parentPort} = require("node:worker_threads");',
    'function workerSide() { return 2; }',
    'setInterval(workerSide, 1000);',
    'parentPort.postMessage("running");',
  ].join('\n'));
  const child = path.join(root, `${name}.cjs`);
  fs.writeFileSync(child, [
    'const {Worker} = require("node:worker_threads");',
    'function childSide() { return 1; }',
    handlesTerm ? 'process.on("SIGTERM", () => { childSide(); process.exit(0); });' : '',
    `const worker = new Worker(${JSON.stringify(worker)});`,
    'worker.once("message", () => {',
    '  process.stdout.write("ready\\n");',
    blocks ? '  const until = Date.now() + 5000; while (Date.now() < until) {}' : '',
    '});',
    'setInterval(childSide, 1000);',
  ].join('\n'));
  return {child, worker};
}

// A driver that starts each child, flushes it before its kill, kills it with
// the given signal and records what the flush returned and how it ended.
function writeKillDriver(root, cases, outcome) {
  const driver = path.join(root, 'kill-driver.mjs');
  fs.writeFileSync(driver, `
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {flushCoverageBeforeKill} from ${JSON.stringify(PRE_KILL_HELPER)};
const cases = ${JSON.stringify(cases)};
const results = {};
for (const item of cases) {
  const env = item.uninstrumented ? {...process.env, NODE_OPTIONS: '', NODE_V8_COVERAGE: ''} :
    process.env;
  const child = spawn(process.execPath, [item.file], {env, stdio: ['ignore', 'pipe', 'inherit']});
  await new Promise((resolve) => child.stdout.once('data', resolve));
  const ended = new Promise((resolve) => child.once('exit', (code, signal) =>
    resolve({code, signal})));
  const started = Date.now();
  const acked = flushCoverageBeforeKill(child.pid, item.signal, item.boundMs ?
    {boundMs: item.boundMs} : undefined);
  const waitedMs = Date.now() - started;
  child.kill(item.signal);
  results[item.name] = {pid: child.pid, acked, waitedMs, ...(await ended)};
}
fs.writeFileSync(${JSON.stringify(outcome)}, JSON.stringify(results));
`);
  return driver;
}

function coveredUrls(v8, pid) {
  const covered = new Set();
  for (const name of fs.readdirSync(v8)) {
    if (!name.startsWith(`coverage-${pid}-`)) continue;
    const coverage = JSON.parse(fs.readFileSync(path.join(v8, name), 'utf8'));
    for (const script of coverage.result) covered.add(script.url);
  }
  return covered;
}

test('a pre-kill flush completes a killed child and its worker; the kill is unchanged', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'integration');
  const outcome = path.join(root, 'kill-outcome.json');
  const killed = writeKillChild(root, 'killed');
  const termed = writeKillChild(root, 'termed');
  const handled = writeKillChild(root, 'handled', {handlesTerm: true});
  const driver = writeKillDriver(root, [
    {name: 'killed', file: killed.child, signal: 'SIGKILL'},
    {name: 'termed', file: termed.child, signal: 'SIGTERM'},
    {name: 'handled', file: handled.child, signal: 'SIGTERM'},
  ], outcome);
  const record = collectRun({lane: 'integration', out, root,
    command: [process.execPath, driver], host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0);
  const ended = JSON.parse(fs.readFileSync(outcome, 'utf8'));
  // The signal still decides how each child ends: SIGKILL kills, SIGTERM
  // kills a child without a handler, and a child's own handler still runs.
  assert.deepEqual([ended.killed.signal, ended.killed.code], ['SIGKILL', null]);
  assert.deepEqual([ended.termed.signal, ended.termed.code], ['SIGTERM', null]);
  assert.deepEqual([ended.handled.signal, ended.handled.code], [null, 0]);
  assert.deepEqual([ended.killed.acked, ended.termed.acked, ended.handled.acked],
    [true, true, true]);
  const v8 = path.join(out, 'v8');
  for (const [name, files] of [['killed', killed], ['termed', termed]]) {
    const ack = JSON.parse(fs.readFileSync(path.join(v8,
      `witness-${ended[name].pid}-0-flushed.json`), 'utf8'));
    assert.equal(ack.final, true, `${name}: a kill follows, so the flush is final`);
    assert.deepEqual([ack.ackedThreads, ack.unackedThreads], [[1], []]);
    const covered = coveredUrls(v8, ended[name].pid);
    assert.ok(covered.has(pathToFileURL(files.child).href), `${name}: the main thread flushed`);
    assert.ok(covered.has(pathToFileURL(files.worker).href), `${name}: the worker flushed`);
  }
  const handledAck = JSON.parse(fs.readFileSync(path.join(v8,
    `witness-${ended.handled.pid}-0-flushed.json`), 'utf8'));
  assert.equal(handledAck.final, false, 'a signal the child handles is not final: no freeze');
  // Driver, three mains, three workers: all complete; four by a final flush
  // (killed and termed, main and worker each); handled completes by exit.
  assert.deepEqual(record.witnesses, {started: 7, complete: 7, flushed: 4, lost: [],
    external: []});
});

test('a child that cannot answer is killed anyway and stays lost; no preload, no signal', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'integration');
  const outcome = path.join(root, 'kill-outcome.json');
  const stuck = writeKillChild(root, 'stuck', {blocks: true});
  const bare = writeKillChild(root, 'bare');
  const driver = writeKillDriver(root, [
    {name: 'stuck', file: stuck.child, signal: 'SIGKILL', boundMs: 400},
    {name: 'bare', file: bare.child, signal: 'SIGKILL', uninstrumented: true},
  ], outcome);
  const record = collectRun({lane: 'integration', out, root,
    command: [process.execPath, driver], host: 'hostA', commit: COMMIT});
  const ended = JSON.parse(fs.readFileSync(outcome, 'utf8'));
  assert.deepEqual([ended.stuck.acked, ended.stuck.signal], [false, 'SIGKILL']);
  assert.ok(ended.stuck.waitedMs >= 400, 'the wait is bounded, not skipped');
  // No start marker: the uninstrumented child is never signalled; it is
  // waited on only for the second a starting child's preload may need.
  assert.deepEqual([ended.bare.acked, ended.bare.signal], [false, 'SIGKILL']);
  assert.ok(ended.bare.waitedMs < 1500, `${ended.bare.waitedMs} ms`);
  const v8 = path.join(out, 'v8');
  assert.equal(fs.existsSync(path.join(v8, `witness-${ended.bare.pid}-0-flush-request.json`)),
    false);
  const lost = record.witnesses.lost.filter((witness) => witness.pid === ended.stuck.pid);
  assert.deepEqual(lost.map((witness) => [witness.threadId, witness.cause]),
    [[0, 'pre-kill-flush-unanswered'], [1, 'pre-kill-flush-unanswered']]);
  assert.equal(lost[1].processEntry, stuck.child, 'a worker names its process entry');
});

test('outside a census collection the pre-kill flush sends nothing and waits for nothing', async () => {
  const {flushCoverageBeforeKill} = await import(PRE_KILL_HELPER);
  assert.equal(flushCoverageBeforeKill(process.pid, 'SIGKILL', {env: {}}), false);
  // A live child under plain coverage with the census preload: marked and
  // able to answer. NODE_V8_COVERAGE alone (any coverage run) must not arm
  // the helper: no request, no signal, no wait.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-gate-'));
  const childEnv = {...process.env, NODE_V8_COVERAGE: dir,
    NODE_OPTIONS: coveragePreloadOption()};
  delete childEnv[CENSUS_COVERAGE_DIR_ENV];
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000); ' +
    'process.stdout.write("ready\\n");'], {env: childEnv, stdio: ['ignore', 'pipe', 'inherit']});
  const ended = new Promise((resolve) => child.once('exit', (code, signal) => resolve(signal)));
  try {
    await new Promise((resolve) => child.stdout.once('data', resolve));
    assert.ok(fs.existsSync(path.join(dir, `witness-${child.pid}-0.json`)), 'the child is marked');
    const started = Date.now();
    assert.equal(flushCoverageBeforeKill(child.pid, 'SIGKILL',
      {env: {NODE_V8_COVERAGE: dir}}), false);
    assert.ok(Date.now() - started < 50, `${Date.now() - started} ms`);
    assert.deepEqual(fs.readdirSync(dir).filter((name) => /flush/u.test(name)), []);
    // The same child answers once collect's variable arms the helper: the
    // false above is the gate, not a deaf child.
    assert.equal(flushCoverageBeforeKill(child.pid, 'SIGKILL',
      {env: {[CENSUS_COVERAGE_DIR_ENV]: dir}}), true);
  } finally {
    child.kill('SIGKILL');
  }
  assert.equal(await ended, 'SIGKILL');
});

test('a process that kills itself flushes in-process first and is complete', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'integration');
  const script = path.join(root, 'self-kill.mjs');
  fs.writeFileSync(script, [
    `import {flushCoverageBeforeKill} from ${JSON.stringify(PRE_KILL_HELPER)};`,
    'function beforeCrash() { return 3; }',
    'beforeCrash();',
    'flushCoverageBeforeKill(process.pid, "SIGKILL");',
    'process.kill(process.pid, "SIGKILL");',
  ].join('\n'));
  const driver = path.join(root, 'self-driver.cjs');
  fs.writeFileSync(driver, `
const {spawnSync} = require('node:child_process');
const result = spawnSync(process.execPath, [${JSON.stringify(script)}]);
if (result.signal !== 'SIGKILL') process.exitCode = 9;
`);
  const record = collectRun({lane: 'integration', out, root,
    command: [process.execPath, driver], host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0, 'the self-kill still ends the child by SIGKILL');
  assert.deepEqual(record.witnesses, {started: 2, complete: 2, flushed: 1, lost: [],
    external: []});
});

// Markers named the way the preload writes them, for accounting fixtures.
function writeAck(dir, pid, threadId, ack) {
  fs.writeFileSync(path.join(dir, `witness-${pid}-${threadId}-flushed.json`), JSON.stringify(ack));
}

test('witness accounting: only a standing final flush acknowledgement completes a killed thread', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-witness-'));
  const start = (pid, threadId) => ({pid, threadId, ppid: 1, entry: `/r/${pid}.js`, cwd: '/r',
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: threadId === 0});
  for (const pid of [50, 60, 70, 80]) {
    writeMarkers(dir, pid, 0, start(pid, 0), null);
    writeMarkers(dir, pid, 1, start(pid, 1), null);
  }
  // 50: main and worker acknowledged the same final request: complete.
  writeAck(dir, 50, 0, {id: 'r1', final: true});
  writeAck(dir, 50, 1, {id: 'r1', final: true});
  // 60: the worker answered an older request: lost, the main complete.
  writeAck(dir, 60, 0, {id: 'r2', final: true});
  writeAck(dir, 60, 1, {id: 'r0', final: true});
  // 70: a flush before a signal it handled itself (not final), then killed.
  writeAck(dir, 70, 0, {id: 'r3', final: false});
  writeAck(dir, 70, 1, {id: 'r3', final: false});
  // 80: asked, never answered (or withdrew its answer when its freeze ran out).
  fs.writeFileSync(path.join(dir, 'witness-80-0-flush-request.json'), '{"id":"r4"}');
  const accounted = accountWitnesses(dir, fs.readdirSync(dir).sort());
  assert.equal(accounted.started, 8);
  assert.equal(accounted.complete, 3);
  assert.equal(accounted.flushed, 3);
  assert.deepEqual(accounted.lost.map((lost) => [lost.pid, lost.threadId, lost.cause]), [
    [60, 1, 'unknown'], [70, 0, 'unknown'], [70, 1, 'unknown'],
    [80, 0, 'pre-kill-flush-unanswered'], [80, 1, 'pre-kill-flush-unanswered'],
  ]);
});

test('a lost witness outside the repository is external and voids nothing', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const v8 = path.join(offsets.runA, 'v8');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'census-copy-'));
  const lostStart = (pid, entry, cwd) => ({pid, threadId: 0, ppid: 1, entry, cwd,
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: true});
  // A copy of the scripts under /tmp: external.
  writeMarkers(v8, 81, 0, lostStart(81, path.join(outside, 'scripts', 'x.js'), outside), null);
  // Outside, but its surviving coverage names a repository file: lost.
  writeMarkers(v8, 82, 0, lostStart(82, path.join(outside, 'y.js'), outside), null);
  writeProcess(v8, 'coverage-82-1794000000000-0.json', root, {'src/b.js': [[[0, 5, 1]]]});
  // Outside, and its coverage names only the census preload it was given:
  // external.
  writeMarkers(v8, 84, 0, lostStart(84, path.join(outside, 'z.js'), outside), null);
  writeProcess(v8, 'coverage-84-1794000000000-0.json', root, {
    'scripts/checks/fallback-branch-census-preload.js': [[[0, 5, 1]]]});
  // A `node -e ... -- --flag` process in the repository: no entry file, lost.
  writeMarkers(v8, 83, 0, lostStart(83, '--local-corpus', root), null);
  // Its entry script is in the repository, its cwd outside: lost. The cwd
  // alone never makes a process external.
  writeMarkers(v8, 85, 0, lostStart(85, path.join(root, 'test', 'e.test.js'), outside), null);
  // A `node -e` process whose cwd is outside: argv[1] is no file, so nothing
  // shows that it ran outside the repository: lost.
  writeMarkers(v8, 86, 0, lostStart(86, '--local-corpus', outside), null);
  writeRunJson(offsets.runA, runRecord(RUN_A, 'unit', 'hostA', offsets.runA, root));
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const witnesses = merged.witnesses[RUN_A];
  assert.deepEqual(witnesses.external.map((lost) => lost.pid), [81, 84]);
  assert.deepEqual(witnesses.lost.map((lost) => lost.pid), [82, 83, 85, 86]);
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD, importers: {}});
  // Only 82's seen src/b.js is voided; the externals and the processes with
  // no coverage and no importer in this graph void nothing.
  assert.deepEqual(census.sites.map((site) => [site.file, site.class, site.lostWitnesses]), [
    ['src/a.js', 'both', undefined],
    ['src/a.js', 'both', undefined],
    ['src/b.js', 'unobserved', [`${RUN_A}:82:0`]],
    ['src/never-loaded.js', 'unloaded', undefined],
  ]);
  assert.deepEqual(census.runs[0].witnesses, {started: 8, complete: 2, flushed: 0, lost: 4,
    external: 2});
});

test('a lost worker is bounded from its process entry as well as its own', () => {
  const root = makeRoot();
  const offsets = buildTwoRuns(root);
  const v8 = path.join(offsets.runA, 'v8');
  const outsideWorker = path.join(os.tmpdir(), 'node_modules', 'pool', 'worker.js');
  writeMarkers(v8, 90, 0, {pid: 90, threadId: 0, ppid: 1, entry: path.join(root, 'test',
    'p.test.js'), cwd: root, startedAt: '2026-11-08T10:00:00.000Z', isMainThread: true},
  {complete: true, by: 'signal', at: END_AT});
  writeProcess(v8, `coverage-90-${END_AT_MS}-0.json`, root, {});
  writeMarkers(v8, 90, 1, {pid: 90, threadId: 1, ppid: 1, entry: outsideWorker, cwd: root,
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: false}, null);
  writeRunJson(offsets.runA, runRecord(RUN_A, 'unit', 'hostA', offsets.runA, root));
  const merged = mergeRuns([offsets.runA, offsets.runB]);
  const census = joinCensus({merged, runDirs: [offsets.runA, offsets.runB],
    sites: sitesFor(root, offsets), root, head: HEAD,
    importers: {'src/b.js': ['test/p.test.js']}});
  assert.deepEqual(census.sites[2].lostWitnesses, [`${RUN_A}:90:1`]);
});

test('the formation lane gets the demo stop deadline and fails loudly on a lost node', async () => {
  const env = laneEnvironment('formation', {env: {NODE_OPTIONS: '--x'}, coverageDir: '/c',
    preload: '--import=file:///p.js'});
  assert.equal(env[DEMO_STOP_DEADLINE_ENV], String(CENSUS_DEMO_STOP_DEADLINE_MS));
  assert.equal(env.NODE_OPTIONS, '--x --import=file:///p.js');
  assert.equal(env.PISCINA_DISABLE_ATOMICS, '1', 'idle pool workers must answer flushes');
  assert.equal(laneEnvironment('unit', {env: {}, coverageDir: '/c', preload: '-p'})[
    DEMO_STOP_DEADLINE_ENV], undefined);
  const root = '/repo';
  const witnesses = {lost: [
    {pid: 5, threadId: 0, isMainThread: true, entry: '/repo/src/index.js', cause: 'unknown'},
    {pid: 5, threadId: 1, isMainThread: false, entry: '/repo/src/index.js', cause: 'unknown'},
    {pid: 6, threadId: 0, isMainThread: true, entry: '/repo/scripts/x.js', cause: 'unknown'},
  ]};
  assert.equal(laneProblems('formation', witnesses, root).length, 1);
  assert.match(laneProblems('formation', witnesses, root)[0], /formation node .* pid 5/u);
  assert.deepEqual(laneProblems('unit', witnesses, root), []);
  // The names the demo and the runner read are the ones collect sets.
  const demo = await import('../../examples/service-data-affinity/run-affinity-demo.js');
  assert.equal(demo.NODE_STOP_DEADLINE_ENV, DEMO_STOP_DEADLINE_ENV);
  const runner = await import('../../scripts/run-test-files.js');
  assert.equal(runner.TEST_HEAP_ENV, TEST_HEAP_ENV);
});

test('the demo waits its configured stop deadline, then SIGKILLs and says so', async () => {
  const {nodeStopDeadlineMs, stopNodes} =
    await import('../../examples/service-data-affinity/run-affinity-demo.js');
  assert.equal(nodeStopDeadlineMs({}), 15000);
  assert.equal(nodeStopDeadlineMs({[DEMO_STOP_DEADLINE_ENV]: 'soon'}), 15000);
  assert.equal(nodeStopDeadlineMs({[DEMO_STOP_DEADLINE_ENV]: '300000'}), 300000);
  const fakeNode = (index, exitsOnTerm) => {
    const signals = [];
    const node = {index, process: {pid: 100 + index, exitCode: null, kill(signal) {
      signals.push(signal);
      if (signal === 'SIGKILL' || exitsOnTerm) setTimeout(() => (node.process.exitCode = 1), 50);
    }}, signals};
    return node;
  };
  const drains = fakeNode(0, true);
  const stuck = fakeNode(1, false);
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(line);
  try {
    await stopNodes([drains, stuck], {deadlineMs: 600});
  } finally {
    console.error = original;
  }
  assert.deepEqual(drains.signals, ['SIGTERM']);
  assert.deepEqual(stuck.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^FORCED STOP: node-1 \(pid 101\) still running 600 ms after SIGTERM/u);
});

// ---- Round 4: the final write, the freeze, the marker text -----------------

// Node writes a thread's last coverage only after every `exit` listener ran:
// a process that dies after the census preload wrote its end marker lost the
// code run since its last flush. Here a later `exit` listener runs code, then
// has ANOTHER process SIGKILL it - the same death as an abort or a V8 OOM
// inside the exit-time write, without a core dump per test run. (Not
// `process.kill(process.pid)`: Node runs its at-exit hooks, the coverage
// write among them, before signalling itself.) It must be lost, and the side
// only that code executed must not be condemned as `never`.
test('a process that dies after its end marker is lost and voids its sites', () => {
  const root = makeRoot();
  const file = 'src/late.js';
  const text = [
    'const o = {a: 0, b: 2};',
    'function exitSide() { return o.a || o.b; }',
    'process.on(\'exit\', () => {',
    '  exitSide();',
    '  require(\'node:child_process\').spawnSync(process.execPath,',
    '    [\'-e\', `process.kill(${process.pid}, \'SIGKILL\')`]);',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, file), text);
  const driver = path.join(root, 'late-driver.cjs');
  fs.writeFileSync(driver, `
const {spawnSync} = require('node:child_process');
const result = spawnSync(process.execPath, [${JSON.stringify(path.join(root, file))}]);
if (result.signal !== 'SIGKILL') process.exitCode = 9;
`);
  const out = path.join(root, 'test-output', 'coverage', 'unit');
  const record = collectRun({lane: 'unit', out, root, command: [process.execPath, driver],
    host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0, 'the child still dies by its own kill');
  assert.equal(record.witnesses.lost.length, 1);
  const [lost] = record.witnesses.lost;
  assert.deepEqual([lost.entry, lost.isMainThread, lost.cause],
    [path.join(root, file), true, 'final-write-missing']);
  assert.ok(fs.existsSync(path.join(out, 'v8', `witness-${lost.pid}-0-exit.json`)),
    'the end marker was written: it alone must not complete the thread');
  const merged = mergeRuns([out]);
  const orStart = text.indexOf('o.a ||');
  const fallbackStart = text.indexOf('o.b;');
  const orEnd = fallbackStart + 3;
  const site = {row: 'two_source_fallback_reads', file, range: [orStart, orEnd], loc: {},
    kind: 'two_source_fallback_reads', detail: '', occurrence: 0,
    hash: sha256(`${file}\n${text.slice(orStart, orEnd)}`),
    sides: {primary: [orStart, orStart + 3], fallback: [fallbackStart, fallbackStart + 3]}};
  const census = joinCensus({merged, runDirs: [out], sites: [site], root, head: HEAD,
    importers: {}});
  assert.deepEqual(census.sites.map((entry) => [entry.class, entry.lostWitnesses]),
    [['unobserved', [`${record.id}:${lost.pid}:0`]]]);
});

test('witness accounting: an end marker completes only with a coverage write at or after it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-witness-'));
  const start = (pid, threadId) => ({pid, threadId, ppid: 1, entry: `/r/${pid}.js`, cwd: '/r',
    startedAt: '2026-11-08T10:00:00.000Z', isMainThread: threadId === 0});
  const coverage = (pid, ms, threadId = 0) => {
    const name = path.join(dir, `coverage-${pid}-${ms}-${threadId}.json`);
    fs.writeFileSync(name, '{"result":[]}');
    return name;
  };
  const end = {complete: true, by: 'exit', exitCode: 0, at: END_AT};
  // 100: its final write shares the marker's millisecond: complete; so is
  // its worker, by the orderly exit.
  writeMarkers(dir, 100, 0, start(100, 0), end);
  writeMarkers(dir, 100, 1, start(100, 1), null);
  coverage(100, END_AT_MS - 5);
  coverage(100, END_AT_MS);
  // 110: only flushes before the marker (the beforeExit flush), then it died:
  // lost, and its worker with it - its process did not exit in order.
  writeMarkers(dir, 110, 0, start(110, 0), end);
  writeMarkers(dir, 110, 1, start(110, 1), null);
  coverage(110, END_AT_MS - 2);
  coverage(110, END_AT_MS - 2, 1);
  // 120: a worker's own end marker without a later write: lost.
  writeMarkers(dir, 120, 0, start(120, 0), end);
  writeMarkers(dir, 120, 1, start(120, 1), end);
  coverage(120, END_AT_MS + 1);
  coverage(120, END_AT_MS - 1, 1);
  // 130 and 140: `{}` end markers (no `at`): ordered by modification time,
  // only a strictly later coverage file counts. 130's final write is later;
  // 140's only file is older than its marker; 150's ties with it.
  const markerTime = new Date('2026-11-08T10:00:00.000Z');
  for (const [pid, coverageTime] of [[130, '2026-11-08T10:00:00.004Z'],
    [140, '2026-11-08T09:59:59.996Z'], [150, '2026-11-08T10:00:00.000Z']]) {
    writeMarkers(dir, pid, 0, start(pid, 0), {});
    fs.utimesSync(path.join(dir, `witness-${pid}-0-exit.json`), markerTime, markerTime);
    // The name's millisecond is the marker's: the fallback must not read it.
    const name = coverage(pid, END_AT_MS + 10);
    fs.utimesSync(name, new Date(coverageTime), new Date(coverageTime));
  }
  const accounted = accountWitnesses(dir, fs.readdirSync(dir).sort());
  assert.equal(accounted.started, 9);
  assert.equal(accounted.complete, 4);
  assert.deepEqual(accounted.lost.map((lost) => [lost.pid, lost.threadId, lost.cause]), [
    [110, 0, 'final-write-missing'], [110, 1, 'unknown'], [120, 1, 'final-write-missing'],
    [140, 0, 'final-write-missing'], [150, 0, 'final-write-missing'],
  ]);
});

// A child whose main thread and worker each count ticks into a file; the
// driver flushes it before a SIGKILL, then holds the kill back and reads the
// ticks again. A FINAL acknowledgement claims that no JavaScript runs after
// it, on the main thread or the worker: the ticks must not move.
test('a thread that acknowledged a final flush runs no JavaScript before the kill', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'integration');
  const ticks = {main: path.join(root, 'main.ticks'), worker: path.join(root, 'worker.ticks')};
  const tick = (file) => 'let n = 0; setInterval(() => { n += 1; ' +
    `require("node:fs").writeFileSync(${JSON.stringify(file)}, String(n)); }, 5);`;
  const worker = path.join(root, 'ticking-worker.cjs');
  fs.writeFileSync(worker, `${tick(ticks.worker)}\n` +
    'require("node:worker_threads").parentPort.postMessage("running");\n');
  const child = path.join(root, 'ticking.cjs');
  fs.writeFileSync(child, [
    'const {Worker} = require("node:worker_threads");',
    tick(ticks.main),
    `new Worker(${JSON.stringify(worker)}).once("message", () => `,
    '  setTimeout(() => process.stdout.write("ready\\n"), 50));',
  ].join('\n'));
  const outcome = path.join(root, 'freeze-outcome.json');
  const driver = path.join(root, 'freeze-driver.mjs');
  fs.writeFileSync(driver, `
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {flushCoverageBeforeKill} from ${JSON.stringify(PRE_KILL_HELPER)};
const ticks = ${JSON.stringify(ticks)};
const read = () => ({main: fs.readFileSync(ticks.main, 'utf8'),
  worker: fs.readFileSync(ticks.worker, 'utf8')});
const child = spawn(process.execPath, [${JSON.stringify(child)}],
  {stdio: ['ignore', 'pipe', 'inherit']});
await new Promise((resolve) => child.stdout.once('data', resolve));
const ended = new Promise((resolve) => child.once('exit', (code, signal) => resolve(signal)));
const acked = flushCoverageBeforeKill(child.pid, 'SIGKILL');
const atAck = read();
await new Promise((resolve) => setTimeout(resolve, 300));
const atKill = read();
child.kill('SIGKILL');
fs.writeFileSync(${JSON.stringify(outcome)},
  JSON.stringify({pid: child.pid, acked, atAck, atKill, signal: await ended}));
`);
  const record = collectRun({lane: 'integration', out, root,
    command: [process.execPath, driver], host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0);
  const result = JSON.parse(fs.readFileSync(outcome, 'utf8'));
  assert.deepEqual([result.acked, result.signal], [true, 'SIGKILL']);
  assert.ok(Number(result.atAck.main) > 0 && Number(result.atAck.worker) > 0, 'both ticked');
  assert.equal(result.atKill.main, result.atAck.main, 'the main thread ran after its ack');
  assert.equal(result.atKill.worker, result.atAck.worker, 'the worker ran after its ack');
  assert.deepEqual(record.witnesses, {started: 3, complete: 3, flushed: 2, lost: [],
    external: []});
});

// Markers must survive what the code under test does to the globals: a
// process that patches Object.prototype.toJSON (four unit processes of
// collection 5 wrote `{}` end markers), JSON.stringify, Date.now and
// Date.prototype.toISOString still writes its end marker in full, dated by
// the real clock.
test('markers are written in full whatever the process did to the globals', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'unit');
  const script = path.join(root, 'polluter.cjs');
  fs.writeFileSync(script, [
    'Object.prototype.toJSON = function toJSON() { return {}; };',
    'Array.prototype.toJSON = function toJSON() { return {}; };',
    'JSON.stringify = () => \'{}\';',
    'Date.now = () => 0;',
    'Date.prototype.toISOString = () => \'polluted\';',
  ].join('\n'));
  const before = Date.now();
  const record = collectRun({lane: 'unit', out, root, command: [process.execPath, script],
    host: 'hostA', commit: COMMIT});
  assert.equal(record.exitCode, 0);
  const v8 = path.join(out, 'v8');
  const [endName] = fs.readdirSync(v8).filter((name) => name.endsWith('-exit.json'));
  const endMarker = JSON.parse(fs.readFileSync(path.join(v8, endName), 'utf8'));
  assert.deepEqual(Object.keys(endMarker), ['complete', 'by', 'exitCode', 'at']);
  assert.deepEqual([endMarker.complete, endMarker.by, endMarker.exitCode], [true, 'exit', 0]);
  assert.ok(Date.parse(endMarker.at) >= before, endMarker.at);
  assert.deepEqual(record.witnesses, {started: 1, complete: 1, flushed: 0, lost: [],
    external: []});
});

// ---- Round 5: R7-R9 counterexamples, 5-lane CLI & truthful reporting --------

const CENSUS_CLI = fileURLToPath(
  new URL('../../scripts/checks/fallback-branch-census.js', import.meta.url),
);
const BUDGET_CLI = fileURLToPath(
  new URL('../../scripts/checks/code-navigability-budget.js', import.meta.url),
);
const noEslintPromotion = () => ({status: 0, stdout: JSON.stringify({rules: {}})});
const makeBudgetCensusRun = (lane, overrides = {}) => ({
  id: `${lane}-1`, lane, host: 'fixture', commit: COMMIT,
  startedAt: '2026-11-08T10:00:00.000Z', coverageDigest: 'a'.repeat(64),
  witnesses: {started: 1, complete: 1, flushed: 0, lost: 0, external: 0}, ...overrides,
});

test('R7: navigability budget enforces five-lane metadata, zero lost witnesses, and site binding',
  () => {
    const budgetText = fs.readFileSync(BUDGET_CLI, 'utf8');
    for (const lane of REQUIRED_CENSUS_LANES) assert.match(budgetText, new RegExp(`'${lane}'`, 'u'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'census-r7-'));
    const srcRel = 'src/fallbacks.js';
    const srcText = 'export function check(a, b, fn) {\n  const x = a.v || b.v;\n' +
      '  const y = typeof fn === \'function\' ? fn() : 0;\n' +
      '  try { return [x, y]; } catch { return null; }\n}\n';
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(path.join(root, srcRel), srcText);
    const makeSite = (slice, row, klass = 'primary-only', overrides = {}) => {
      const start = srcText.indexOf(slice);
      const primary = klass !== 'never' && klass !== 'fallback-only';
      const fallback = klass === 'fallback-only' || klass === 'both';
      return {
        file: srcRel, row, range: [start, start + slice.length], occurrence: 0,
        hash: sha256(`${srcRel}\n${slice}`), class: klass, sidesExecuted: {primary, fallback},
        runs: ['unit-1'], sidesByRun: {'unit-1': {primary, fallback}}, ...overrides,
      };
    };
    const validSites = [
      makeSite('a.v || b.v', 'two_source_fallback_reads'),
      makeSite('typeof fn === \'function\' ? fn() : 0', 'typeof_dual_paths'),
      makeSite('catch { return null; }', 'catch_returns_default'),
    ];
    const validRuns = REQUIRED_CENSUS_LANES.map((lane) => makeBudgetCensusRun(lane));
    const censusPath = path.join(root, 'data', 'fallback-census', 'census.json');
    fs.mkdirSync(path.dirname(censusPath), {recursive: true});
    const measureCensus = (doc) => {
      fs.writeFileSync(censusPath, JSON.stringify(doc));
      const measured = measureNavigabilityBudgetWithFailures(root,
        {eslintRunner: noEslintPromotion});
      return {byRow: new Map(measured.rows.map((row) => [row.name, row])),
        summary: measured.fallbackSummary};
    };
    const ok = measureCensus({
      schema: CENSUS_SCHEMA, generatedAt: END_AT, head: HEAD, runs: validRuns, sites: validSites,
    });
    assert.equal(ok.byRow.get('fallback_sites_uncensused').value, 0);
    assert.deepEqual([ok.summary.totalFallbackSites, ok.summary.censusedSites,
      ok.summary.uncensusedSites], [3, 3, 0]);
    assert.match(ok.summary.note, /never zero fallback logic/u);

    const badRunVariants = [
      undefined, [], [makeBudgetCensusRun('corpus')],
      REQUIRED_CENSUS_LANES.map((lane) => ({lane})), validRuns.slice(0, 4),
      [...validRuns, makeBudgetCensusRun('corpus', {id: 'extra-1'})],
      [validRuns[0], {...validRuns[1], id: 'unit-1'}, ...validRuns.slice(2)],
      [{...validRuns[0], incomplete: true}, ...validRuns.slice(1)],
      [{...validRuns[0], problems: ['lost']}, ...validRuns.slice(1)],
      [{...validRuns[0], witnesses: {started: 2, complete: 1, lost: 1}}, ...validRuns.slice(1)],
      [{...validRuns[0], witnesses: {started: 3, complete: 1, lost: 0, external: 1}},
        ...validRuns.slice(1)],
    ];
    for (const runs of badRunVariants) {
      const {byRow} = measureCensus({schema: CENSUS_SCHEMA,
        ...(runs === undefined ? {} : {runs}), sites: validSites});
      assert.equal(byRow.get('fallback_sites_uncensused').value, 3);
      assert.equal(byRow.get('fallback_branches_never_taken').value, null);
    }

    const badSiteOverrides = [
      ['primary-only', {runs: []}],
      ['primary-only', {runs: ['foreign-1']}],
      ['primary-only', {runs: ['unit-1', 'unit-1']}],
      ['primary-only', {lostWitnesses: ['unit-1:9:0']}],
      ['primary-only', {sidesExecuted: {primary: false, fallback: false}}],
      ['both', {sidesByRun: {'unit-1': {primary: true, fallback: false}}}],
    ];
    for (const [klass, overrides] of badSiteOverrides) {
      const badSite = makeSite('a.v || b.v', 'two_source_fallback_reads', klass, overrides);
      const {byRow} = measureCensus({
        schema: CENSUS_SCHEMA, runs: validRuns, sites: [badSite, ...validSites.slice(1)],
      });
      assert.equal(byRow.get('fallback_sites_uncensused').value, 1);
    }
  });

test('R8: stripped or omitted env, shell env -i/unset, eval worker, and markerless writer void',
  () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'fallback-bare-'));
    fs.writeFileSync(path.join(bare, 'coverage-999-1794000000000-0.json'), '{"result":[]}');
    const bareAccounted = accountWitnesses(bare, ['coverage-999-1794000000000-0.json']);
    assert.equal(bareAccounted.lost.length, 1);
    assert.deepEqual([bareAccounted.lost[0].uninstrumented, bareAccounted.lost[0].cause],
      [true, 'uninstrumented']);

    const root = makeRoot();
    const offsets = buildTwoRuns(root);
    const out = path.join(root, 'test-output', 'coverage', 'r8-unit');
    const driver = path.join(root, 'test', 'r8-driver.mjs');
    const child = path.join(root, 'test', 'r8-child.mjs');
    fs.mkdirSync(path.dirname(driver), {recursive: true});
    const targetUrl = pathToFileURL(path.join(root, 'src', 'b.js')).href;
    fs.writeFileSync(child, `await import(${JSON.stringify(targetUrl)});\n`);
    fs.writeFileSync(driver, [
      'import {execFileSync, execSync, fork, spawnSync} from \'node:child_process\';',
      'import {Worker} from \'node:worker_threads\';',
      `import ${JSON.stringify(targetUrl)};`,
      'await new Promise((resolve, reject) => {',
      '  const w = new Worker(\'1 + 1\', {eval: true});',
      '  w.on(\'exit\', resolve); w.on(\'error\', reject);',
      '});',
      `spawnSync(process.execPath, [${JSON.stringify(child)}], {`,
      '  env: {...process.env, NODE_OPTIONS: \'\', NODE_V8_COVERAGE: \'\'}});',
      `spawnSync(process.execPath, [${JSON.stringify(child)}], {env: {PATH: process.env.PATH}});`,
      `await new Promise((r) => fork(${JSON.stringify(child)}, [],`,
      '  {env: {PATH: process.env.PATH}}).on(\'exit\', r));',
      'execFileSync(process.execPath, [\'-e\', \'1 + 1\'], {env: {PATH: process.env.PATH}});',
      'execSync(`${process.execPath} -e \'1+1\'; NODE_OPTIONS=\'\' ${process.execPath} -e \'1+1\'`);',
      'execSync(\'"$NODE_BINARY" -e "1+1"\', {env: {PATH: process.env.PATH,',
      '  NODE_BINARY: process.execPath}});',
      'execSync(`env -i PATH="${process.env.PATH}" ${process.execPath} -e \'1+1\'`);',
      'execSync(`unset NODE_OPTIONS; ${process.execPath} -e \'1+1\'`);',
    ].join('\n'));
    const record = collectRun({lane: 'unit', out, root, command: [process.execPath, driver],
      host: 'hostR8', commit: COMMIT});
    assert.deepEqual([record.exitCode, record.witnesses.external.length,
      record.witnesses.lost.length], [0, 0, 12]);
    for (const lost of record.witnesses.lost) {
      assert.deepEqual([lost.uninstrumented, lost.cause], [true, 'uninstrumented']);
    }
    const census = joinCensus({merged: mergeRuns([out]), runDirs: [out],
      sites: [sitesFor(root, offsets)[0]], root, head: HEAD,
      importers: {'src/a.js': ['test/r8-child.mjs']}});
    assert.deepEqual([census.sites[0].class, census.sites[0].lostWitnesses.length],
      ['unobserved', 12]);
    const loaderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'census-loader-'));
    const mk = (url) => ({url, functions: [{ranges: [{startOffset: 0, endOffset: 1, count: 1}]}]});
    for (const [k, v] of [['witness-500-0.json', '{"pid":500,"threadId":0}'],
      ['witness-500-0-exit.json', '{"at":"2026-11-08T00:00:00Z"}'],
      ['coverage-500-1794096001000-0.json', '{"result":[]}'],
      ['coverage-500-1794096001000-1.json', JSON.stringify({result: [
        mk('node:internal/modules/esm/worker'), mk('file:///x/node_modules/m/i.js')]})]]) {
      fs.writeFileSync(path.join(loaderDir, k), v);
    }
    assert.equal(accountWitnesses(loaderDir, fs.readdirSync(loaderDir)).lost.length, 0);
    fs.writeFileSync(path.join(loaderDir, 'coverage-500-1794096001000-2.json'), JSON.stringify(
      {result: [mk('node:internal/modules/esm/worker'), mk('file:///x/src/a.js')]}));
    assert.equal(accountWitnesses(loaderDir, fs.readdirSync(loaderDir)).lost.length, 1);
  });

test('preload launch wrappers preserve promisify(exec/execFile) and sync error semantics', () => {
  const root = makeRoot();
  const out = path.join(root, 'test-output', 'coverage', 'semantics');
  const probe = path.join(root, 'test', 'semantics-probe.mjs');
  fs.mkdirSync(path.dirname(probe), {recursive: true});
  fs.writeFileSync(probe, [
    'import assert from \'node:assert/strict\';',
    'import {exec, execFile, execFileSync, execSync} from \'node:child_process\';',
    'import {promisify} from \'node:util\';',
    'const script = \'process.stdout.write("OUT");process.stderr.write("ERR");\';',
    'assert.deepEqual(await promisify(execFile)(process.execPath, [\'-e\', script]),',
    '  {stdout: \'OUT\', stderr: \'ERR\'});',
    'assert.deepEqual(await promisify(exec)(`${process.execPath} -e \'${script}\'`),',
    '  {stdout: \'OUT\', stderr: \'ERR\'});',
    'const fail = \'process.stderr.write("E7");process.exit(7)\';',
    'assert.throws(() => execFileSync(process.execPath, [\'-e\', fail], {stdio: \'pipe\'}),',
    '  (err) => err.status === 7 && String(err.stderr) === \'E7\' && err.message.endsWith(\'\\nE7\'));',
    'assert.throws(() => execSync(`${process.execPath} -e \'${fail}\'`, {stdio: \'pipe\'}),',
    '  (err) => err.status === 7 && String(err.stderr) === \'E7\' && err.message.endsWith(\'\\nE7\'));',
    'const hang = \'process.stdout.write("PRE");setTimeout(()=>{},1000)\';',
    'assert.throws(() => execFileSync(process.execPath, [\'-e\', hang],',
    '  {timeout: 80, stdio: \'pipe\'}),',
    '  (err) => err.code === \'ETIMEDOUT\' && err.signal === \'SIGTERM\' &&',
    '    String(err.stdout) === \'PRE\' && Array.isArray(err.output) && Number.isInteger(err.pid));',
  ].join('\n'));
  const record = collectRun({
    lane: 'unit', out, root, command: [process.execPath, probe], host: 'hostSem', commit: COMMIT,
  });
  assert.deepEqual([record.exitCode, record.witnesses.lost.length], [0, 1]);
});

test('R9: missing/empty coverage dir, malformed V8/marker JSON, and stale preload fail closed',
  () => {
    const root = makeRoot();
    const offsets = buildTwoRuns(root);
    const {runA, runB} = offsets;
    fs.writeFileSync(path.join(runA, 'v8', 'coverage-1-1794000009999-0.json'), '{"result": [');
    fs.writeFileSync(path.join(runA, 'v8', 'coverage-2-1794000009999-0.json'), '{}');
    fs.writeFileSync(path.join(runA, 'v8', 'roster-77-0.json'), '{corrupt');
    writeRunJson(runA, runRecord(RUN_A, 'unit', 'hostA', runA, root));
    const merged = mergeRuns([runA]);
    assert.deepEqual(merged.unreadable, [
      {run: RUN_A, file: 'coverage-1-1794000009999-0.json'},
      {run: RUN_A, file: 'coverage-2-1794000009999-0.json'},
      {run: RUN_A, file: 'roster-77-0.json'},
    ]);
    assert.equal(merged.witnesses[RUN_A].complete, 0);
    const census = joinCensus({
      merged, runDirs: [runA], sites: [sitesFor(root, offsets)[0]], root, head: HEAD, importers: {},
    });
    assert.equal(census.sites[0].class, 'unobserved');

    const driftedHashSite = {...sitesFor(root, offsets)[1], hash: 'f'.repeat(64)};
    assert.equal(joinCensus({
      merged: mergeRuns([runB]), runDirs: [runB], sites: [driftedHashSite], root, head: HEAD,
    }).sites[0].class, 'unloaded');

    writeRunJson(runB, runRecord(RUN_B, 'formation', 'hostB', runB, root, {
      coveragePreload: {active: true, option: '--import=x', module: PRELOAD_MODULE_RELATIVE,
        sha256: '0'.repeat(64)},
    }));
    assert.throws(() => mergeRuns([runB]), /coveragePreload/u);
    writeRunJson(runB, runRecord(RUN_B, 'formation', 'hostB', runB, root, {problems: ['bad']}));
    assert.throws(() => mergeRuns([runB]), /recorded collection problems/u);

    const emptyRun = path.join(root, 'test-output', 'emptyRun');
    fs.mkdirSync(path.join(emptyRun, 'v8'), {recursive: true});
    writeRunJson(emptyRun, runRecord('unit-empty-1', 'unit', 'hostA', emptyRun, root));
    assert.throws(() => mergeRuns([emptyRun]), /zero V8 coverage files/u);
    fs.rmSync(path.join(emptyRun, 'v8'), {recursive: true});
    assert.throws(() => mergeRuns([emptyRun]), /missing or unreadable coverage directory/u);
  });

test('five-lane CLI pipeline enforces complete 5-lane runs and reports fallback totals truthfully',
  () => {
    const root = makeRoot();
    for (const extra of ['a.js', 'never-loaded.js']) fs.rmSync(path.join(root, 'src', extra));
    const driver = path.join(root, 'lane-driver.mjs');
    fs.writeFileSync(driver, `globalThis.h = () => 1;\nawait import(${
      JSON.stringify(pathToFileURL(path.join(root, 'src', 'b.js')).href)});\n`);
    const runDirs = REQUIRED_CENSUS_LANES.map((lane) => {
      const out = path.join(root, 'test-output', 'five', lane);
      const record = collectRun({lane, out, root, command: [process.execPath, driver],
        host: 'lab', commit: COMMIT});
      assert.deepEqual([record.exitCode, record.witnesses.lost.length], [0, 0]);
      return out;
    });
    const mergedFour = path.join(root, 'merged-4.json');
    fs.writeFileSync(mergedFour, JSON.stringify(mergeRuns(runDirs.slice(0, 4))));
    const outFour = path.join(root, 'census-4.json');
    const joinFour = spawnSync(process.execPath, [CENSUS_CLI, 'join', '--root', root,
      '--head', HEAD, '--merged', mergedFour, '--runs', ...runDirs.slice(0, 4), '--out', outFour],
    {encoding: 'utf8'});
    assert.equal(joinFour.status, 1);
    assert.match(joinFour.stderr, /missing: formation/u);
    assert.equal(fs.existsSync(outFour), false);
    const mergedFive = path.join(root, 'merged-5.json');
    fs.writeFileSync(mergedFive, JSON.stringify(mergeRuns(runDirs)));
    const censusPath = path.join(root, 'data', 'fallback-census', 'census.json');
    const joinFive = spawnSync(process.execPath, [CENSUS_CLI, 'join', '--root', root,
      '--head', HEAD, '--merged', mergedFive, '--runs', ...runDirs, '--out', censusPath],
    {encoding: 'utf8'});
    assert.equal(joinFive.status, 0, joinFive.stderr);
    assert.match(joinFive.stdout, /fallback logic sites detected: 1; censused: 1, uncensused: 0/u);
    assert.match(joinFive.stdout, /0 uncensused never means zero fallback logic/u);
    const budget = measureNavigabilityBudgetWithFailures(root,
      {eslintRunner: () => ({status: 0, stdout: '[]'})});
    const uncensusedRow = budget.rows.find((row) => row.name === 'fallback_sites_uncensused');
    assert.deepEqual([uncensusedRow.value, budget.fallbackSummary.totalFallbackSites,
      budget.fallbackSummary.censusedSites, budget.fallbackSummary.uncensusedSites], [0, 1, 1, 0]);
    assert.match(budget.fallbackSummary.note, /never zero fallback logic/u);
  });
