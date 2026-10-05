import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import * as logCollectorModule from '../log-collector.js';
import {Cluster} from '../cluster.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const dateToIsoString = Function.call.bind(Date.prototype.toISOString);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const {LogCollector} = logCollectorModule;
// Read off the module namespace so the witness reports assertion reds (not a
// link error) against a build that does not archive.
const ARCHIVED_RUNS_KEPT = logCollectorModule.ARCHIVED_SCENARIO_RUNS_KEPT;

const SCENARIO = 'public-path-multinode-baseline';
const FAILED_STEP = 'split-leader-spread';
const OLD_RUN_NODES = Object.freeze(['old-node-1', 'old-node-2']);
const NEW_RUN_NODES = Object.freeze(['new-node-1', 'new-node-2']);
const ARCHIVE_PREFIX = '.previous-';
const RUN_SPACING_MS = 60000;
const OLD_RUN_START = Date.parse('2026-10-04T10:36:59.000Z');
const NEW_RUN_START = Date.parse('2026-10-04T11:51:39.000Z');
// An earlier run's startup decision line, hours before this run.
const OLD_RUN_DECISION_LINE =
  '[2026-10-04T10:37:00.000Z] [old-node-1] [info] earlier run evidence';
const OLD_RUN_FULL_LOG = 'old-node-1 full stdout';
const OLD_RUN_BOUND_LOG = 'old-node-1 bind-mounted ndjson';

function logEntries(nodeIds, timestamp) {
  return arrayMap(nodeIds, (nodeId) => ({
    level: 'info', message: `line from ${nodeId}`, node_id: nodeId,
    timestamp,
  }));
}

function playbackEvent(type, entityId, details, timestamp) {
  return JSON.stringify({details, entityId, scope: 'scenario', timestamp,
    type});
}

function archiveNameFor(runStartMs) {
  return ARCHIVE_PREFIX +
    stringReplaceAll(dateToIsoString(new Date(runStartMs)), ':', '-');
}

async function sortedNames(dir) {
  return arraySort(await readdir(dir));
}

async function archiveNames(scenarioDir) {
  return arrayFilter(await sortedNames(scenarioDir),
    (name) => stringStartsWith(name, ARCHIVE_PREFIX));
}

function hasMove(manifest, from, to) {
  return arraySome(manifest.moved,
    (move) => move.from === from && move.to === to);
}

// The cluster's own reset entry point, bound to a minimal cluster shape.
async function resetLikeClusterStart(outputDir, collector) {
  await Cluster.prototype._resetScenarioRunArtifacts.call({
    _config: {outputDir},
    _logCollector: collector,
    _scenarioName: SCENARIO,
  });
}

async function writeRunFailureBundle(outputDir) {
  // The bundle names paths relative to a workspace root above the output
  // root, as a lab run does (cwd = repository, output under it).
  const workspaceRoot = dirname(outputDir);
  const {scenarioBundles} = await writeFailureBundlesForReport({
    benchmarkRegressionGate: null,
    outputDir,
    reportOutputPath: join(outputDir, 'report.json'),
    reportSummary: {failed: 1, passed: 0, total: 1},
    scenarios: [{
      details: {diagnostics: {}},
      duration: 100,
      error: `${SCENARIO}: split-leader-spread not met within 180000ms`,
      passed: false,
      scenario: SCENARIO,
    }],
    standardSummary: null,
    workspaceRoot,
  });
  return {links: scenarioBundles[0].links, workspaceRoot};
}

// One run's artifacts, written the way the harness writes them: the playback
// stream first (cluster.start, node.created), curated logs at teardown, the
// full logs under .full-logs, and (for a failure) the bundle via the real
// failure-bundle writer.
async function writeRun(outputDir, {runStart, nodeIds, failed}) {
  const scenarioDir = join(outputDir, SCENARIO);
  await mkdir(scenarioDir, {recursive: true});
  const events = [playbackEvent('cluster.start', 'cluster',
    {scenarioName: SCENARIO}, runStart)];
  for (const nodeId of nodeIds) {
    events.push(playbackEvent('node.created', nodeId, {role: 'seed'},
      runStart + 1));
  }
  events.push(playbackEvent('scenario.step', FAILED_STEP, {
    error: 'split-leader-spread not met', status: 'failed', step: FAILED_STEP,
  }, runStart + 2));
  await writeFile(join(scenarioDir, 'events.ndjson'), events.join('\n') + '\n');
  const collector = new LogCollector(outputDir);
  await collector.writeOutput(SCENARIO, logEntries(nodeIds,
    dateToIsoString(new Date(runStart + 3))), nodeIds);
  await writeFile(join(scenarioDir, '_analysis.json'),
    JSON.stringify({runStart}) + '\n');
  const fullLogsDir = join(outputDir, '.full-logs', SCENARIO);
  await mkdir(join(fullLogsDir, nodeIds[0]), {recursive: true});
  await writeFile(join(fullLogsDir, nodeIds[0] + '.log.gz'),
    `${nodeIds[0]} full stdout`);
  await writeFile(join(fullLogsDir, nodeIds[0], 'node.ndjson'),
    `${nodeIds[0]} bind-mounted ndjson`);
  return failed ? writeRunFailureBundle(outputDir) : null;
}

async function readWorkspaceFile(workspaceRoot, relativePath) {
  return readFile(resolve(workspaceRoot, relativePath), 'utf8');
}

describe('scenario run artifact hygiene (W7)', () => {
  let outputDir;

  beforeEach(async () => {
    const parent = await mkdtemp(join(tmpdir(), 'scenario-run-hygiene-'));
    outputDir = join(parent, 'playback');
    await mkdir(outputDir);
  });

  afterEach(async () => {
    await rm(dirname(outputDir), {force: true, recursive: true});
  });

  it('a second run in the same output root holds only its own curated ' +
    'and full node logs; the first run\'s are archived, not deleted',
  async () => {
    const collector = new LogCollector(outputDir);
    await writeRun(outputDir,
      {failed: false, nodeIds: OLD_RUN_NODES, runStart: OLD_RUN_START});

    // The second run starts: what is not its own moves out of the way.
    await resetLikeClusterStart(outputDir, collector);
    await collector.writeOutput(SCENARIO,
      logEntries(NEW_RUN_NODES, '2026-10-04T11:51:40.000Z'), NEW_RUN_NODES);

    const scenarioDir = join(outputDir, SCENARIO);
    const archiveName = archiveNameFor(OLD_RUN_START);
    assert.deepEqual(await sortedNames(scenarioDir),
      [archiveName, '_timeline.log', 'new-node-1.log', 'new-node-2.log']);
    const timeline = await readFile(join(scenarioDir, '_timeline.log'), 'utf8');
    assert.doesNotMatch(timeline, /old-node/u);
    assert.deepEqual(await sortedNames(join(outputDir, '.full-logs')), []);

    const archiveDir = join(scenarioDir, archiveName);
    assert.deepEqual(await sortedNames(archiveDir), [
      '.full-logs', '_analysis.json', '_timeline.log', 'archive.json',
      'events.ndjson', 'old-node-1.log', 'old-node-2.log',
    ]);
    assert.match(await readFile(join(archiveDir, 'old-node-1.log'), 'utf8'),
      /line from old-node-1/u);
    assert.equal(await readFile(
      join(archiveDir, '.full-logs', 'old-node-1.log.gz'), 'utf8'),
    OLD_RUN_FULL_LOG);
    assert.equal(await readFile(
      join(archiveDir, '.full-logs', 'old-node-1', 'node.ndjson'), 'utf8'),
    OLD_RUN_BOUND_LOG);
    const manifest = JSON.parse(
      await readFile(join(archiveDir, 'archive.json'), 'utf8'));
    assert.equal(manifest.runStartedAt, OLD_RUN_START);
    assert.equal(manifest.runStartedAtSource, 'events.ndjson');
    assert.ok(hasMove(manifest, `.full-logs/${SCENARIO}`,
      `${SCENARIO}/${archiveName}/.full-logs`));
  });

  it('run 1\'s failure bundle still resolves to run 1\'s logs after run 2 ' +
    'starts in the same output root', async () => {
    const collector = new LogCollector(outputDir);
    const run1 = await writeRun(outputDir,
      {failed: true, nodeIds: OLD_RUN_NODES, runStart: OLD_RUN_START});
    await resetLikeClusterStart(outputDir, collector);
    await writeRun(outputDir,
      {failed: false, nodeIds: NEW_RUN_NODES, runStart: NEW_RUN_START});

    const scenarioDir = join(outputDir, SCENARIO);
    const archiveName = archiveNameFor(OLD_RUN_START);
    const archiveDir = join(scenarioDir, archiveName);
    // The bundle lives with its run: it is archived, not left beside run 2.
    const currentNames = await sortedNames(scenarioDir);
    assert.equal(arrayIncludes(currentNames, 'failure-bundle.json'), false);
    assert.equal(arrayIncludes(currentNames, 'triage-summary.json'), false);
    const bundle = JSON.parse(
      await readFile(join(archiveDir, 'failure-bundle.json'), 'utf8'));
    assert.deepEqual(arraySort(Object.keys(bundle.logs.nodeLogPaths)),
      [...OLD_RUN_NODES]);
    for (const nodeId of OLD_RUN_NODES) {
      const nodeLogPath = bundle.logs.nodeLogPaths[nodeId];
      assert.ok(stringIncludes(nodeLogPath, `/${archiveName}/`), nodeLogPath);
      assert.match(await readWorkspaceFile(run1.workspaceRoot, nodeLogPath),
        new RegExp(`line from ${nodeId}`, 'u'));
    }
    assert.match(await readWorkspaceFile(run1.workspaceRoot,
      bundle.logs.timelinePath), /old-node-1/u);
    const archivedEvents = await readWorkspaceFile(run1.workspaceRoot,
      bundle.logs.playbackEventsPath);
    assert.match(archivedEvents, /old-node-1/u);
    assert.doesNotMatch(archivedEvents, /new-node/u);

    const triage = JSON.parse(
      await readFile(join(archiveDir, 'triage-summary.json'), 'utf8'));
    for (const nodeId of OLD_RUN_NODES) {
      assert.match(await readWorkspaceFile(run1.workspaceRoot,
        triage.artifacts.nodeLogPaths[nodeId]),
      new RegExp(`line from ${nodeId}`, 'u'));
    }
    // The human rendering points at the archive too: every path into the
    // scenario dir it names resolves to a readable run-1 file.
    const markdown = await readFile(join(archiveDir, 'failure-bundle.md'),
      'utf8');
    const scenarioPathTokens = arrayFilter(
      stringSplit(markdown, /[\s`()]+/u),
      (token) => stringIncludes(token, `/${SCENARIO}/`));
    assert.ok(scenarioPathTokens.length > 0);
    for (const token of scenarioPathTokens) {
      assert.ok(stringIncludes(token, `/${archiveName}/`), token);
      await readWorkspaceFile(run1.workspaceRoot, token);
    }
    // The mapping is recorded for every moved artifact.
    const manifest = JSON.parse(
      await readFile(join(archiveDir, 'archive.json'), 'utf8'));
    assert.ok(hasMove(manifest, `${SCENARIO}/failure-bundle.json`,
      `${SCENARIO}/${archiveName}/failure-bundle.json`));
    assert.ok(arrayIncludes(manifest.pathsRewrittenIn, 'failure-bundle.json'));
  });

  it('the archive is bounded: after N+2 runs only the newest N earlier ' +
    'runs remain', async () => {
    assert.ok(Number.isInteger(ARCHIVED_RUNS_KEPT) && ARCHIVED_RUNS_KEPT > 0,
      'ARCHIVED_SCENARIO_RUNS_KEPT is a positive integer');
    const collector = new LogCollector(outputDir);
    const runStarts = [];
    for (let run = 0; run < ARCHIVED_RUNS_KEPT + 2; run += 1) {
      const runStart = OLD_RUN_START + run * RUN_SPACING_MS;
      runStarts.push(runStart);
      await resetLikeClusterStart(outputDir, collector);
      await writeRun(outputDir,
        {failed: false, nodeIds: [`run-${run}-node-1`], runStart});
    }
    // Runs 0..N were archived as their successors started; the last run is
    // current; run 0 is beyond the bound.
    assert.deepEqual(await archiveNames(join(outputDir, SCENARIO)),
      arrayMap(arraySlice(runStarts, 1, ARCHIVED_RUNS_KEPT + 1),
        archiveNameFor));
  });

  it('the prune is visible: the newest archive.json names what it pruned ' +
    'and the archive step logs it', async () => {
    const collector = new LogCollector(outputDir);
    const lines = [];
    const log = (line) => lines.push(line);
    const runStarts = [];
    let record = null;
    for (let run = 0; run < ARCHIVED_RUNS_KEPT + 2; run += 1) {
      const runStart = OLD_RUN_START + run * RUN_SPACING_MS;
      runStarts.push(runStart);
      record = await collector.archivePreviousScenarioRun(SCENARIO, {log});
      await writeRun(outputDir,
        {failed: false, nodeIds: [`run-${run}-node-1`], runStart});
    }
    record = await collector.archivePreviousScenarioRun(SCENARIO, {log});
    // Two runs beyond the bound: the last two archive steps pruned run 0
    // and run 1, each recorded in the archive written by that step.
    const prunedName = archiveNameFor(runStarts[1]);
    assert.deepEqual(record.manifest.prunedArchives, [prunedName]);
    const newest = JSON.parse(await readFile(join(record.archiveDir,
      'archive.json'), 'utf8'));
    assert.deepEqual(newest.prunedArchives, [prunedName]);
    assert.deepEqual(newest.partialArchives, []);
    assert.ok(arraySome(lines, (line) => stringIncludes(line, prunedName) &&
      stringIncludes(line, 'pruned')), lines.join('\n'));
    assert.ok(arraySome(lines, (line) =>
      stringIncludes(line, archiveNameFor(runStarts[0])) &&
      stringIncludes(line, 'pruned')), lines.join('\n'));
  });

  it('a partial archive (no archive.json, a crash mid-archive) is named ' +
    'in the log and the manifest, never silently counted', async () => {
    const scenarioDir = join(outputDir, SCENARIO);
    const partialName = archiveNameFor(OLD_RUN_START - RUN_SPACING_MS);
    await mkdir(join(scenarioDir, partialName), {recursive: true});
    await writeFile(join(scenarioDir, partialName, 'old-node-1.log'),
      OLD_RUN_DECISION_LINE + '\n');
    await writeRun(outputDir,
      {failed: false, nodeIds: OLD_RUN_NODES, runStart: OLD_RUN_START});
    const collector = new LogCollector(outputDir);
    const lines = [];
    const record = await collector.archivePreviousScenarioRun(SCENARIO,
      {log: (line) => lines.push(line)});
    assert.deepEqual(record.manifest.partialArchives, [partialName]);
    assert.deepEqual(record.manifest.prunedArchives, []);
    assert.ok(arraySome(lines, (line) => stringIncludes(line, partialName) &&
      stringIncludes(line, 'partial')), lines.join('\n'));
  });

  it('cluster start archives the earlier run before any capture starts',
    async () => {
      await writeRun(outputDir,
        {failed: false, nodeIds: OLD_RUN_NODES, runStart: OLD_RUN_START});
      const collector = new LogCollector(outputDir);
      const order = [];
      const stop = new Error('stop after the reset');
      const fake = {
        _cleanupUnregister: () => {},
        _config: {outputDir},
        _logCollector: collector,
        _playbackRecorder: {start: async () => {
          order.push('playback-start');
          throw stop;
        }},
        _prepareReusableClusterLeaseForStart: async () => {},
        _resetScenarioRunArtifacts: async function reset() {
          await Cluster.prototype._resetScenarioRunArtifacts.call(this);
          order.push('reset');
        },
        _scenarioName: SCENARIO,
      };
      await assert.rejects(Cluster.prototype.start.call(fake));
      assert.deepEqual(order, ['reset', 'playback-start']);
      assert.deepEqual(await sortedNames(join(outputDir, '.full-logs')), []);
      assert.deepEqual(await sortedNames(join(outputDir, SCENARIO)),
        [archiveNameFor(OLD_RUN_START)]);
    });

  it('the failure bundle reads only this run\'s nodes and triage names ' +
    'the failing step', async () => {
    const scenarioDir = join(outputDir, SCENARIO);
    await mkdir(scenarioDir, {recursive: true});
    // A stale node log an earlier run left behind (a crash before reset).
    await writeFile(join(scenarioDir, 'old-node-1.log'),
      OLD_RUN_DECISION_LINE + '\n');
    await writeFile(join(scenarioDir, 'new-node-1.log'),
      '[2026-10-04T11:52:00.000Z] [new-node-1] [info] this run\n');
    const runStart = NEW_RUN_START;
    await writeFile(join(scenarioDir, 'events.ndjson'), [
      playbackEvent('node.created', NEW_RUN_NODES[0], {role: 'seed'},
        runStart),
      playbackEvent('node.created', NEW_RUN_NODES[1], {role: 'joiner'},
        runStart + 1),
      playbackEvent('scenario.step', FAILED_STEP,
        {status: 'started', step: FAILED_STEP}, runStart + 2),
      playbackEvent('scenario.step', FAILED_STEP, {
        error: 'split-leader-spread not met', status: 'failed',
        step: FAILED_STEP,
      }, runStart + 3),
    ].join('\n') + '\n');

    const {scenarioBundles} = await writeFailureBundlesForReport({
      benchmarkRegressionGate: null,
      outputDir,
      reportOutputPath: join(outputDir, 'report.json'),
      reportSummary: {failed: 1, passed: 0, total: 1},
      scenarios: [{
        details: {diagnostics: {}},
        duration: 100,
        error: `${SCENARIO}: split-leader-spread not met within 180000ms`,
        passed: false,
        scenario: SCENARIO,
      }],
      standardSummary: null,
      workspaceRoot: outputDir,
    });
    const links = scenarioBundles[0].links;
    const bundle = JSON.parse(
      await readFile(resolve(outputDir, links.jsonPath), 'utf8'));
    assert.deepEqual(Object.keys(bundle.logs.nodeLogPaths), ['new-node-1']);
    assert.doesNotMatch(JSON.stringify(bundle), /old-node-1|10:37:00/u);
    const triage = JSON.parse(
      await readFile(resolve(outputDir, links.triageJsonPath), 'utf8'));
    assert.equal(triage.summary.phase, FAILED_STEP);
    assert.deepEqual(Object.keys(triage.artifacts.nodeLogPaths),
      ['new-node-1']);
    const triageMarkdown = await readFile(
      resolve(outputDir, links.triageMarkdownPath), 'utf8');
    assert.match(triageMarkdown, /- Phase: split-leader-spread/u);
  });
});
