import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {writeFailureBundlesForReport} from '../failure-bundle.js';
import {LogCollector} from '../log-collector.js';
import {resetScenarioFullLogs} from '../full-node-log-capture.js';
import {Cluster} from '../cluster.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySort = Function.call.bind(Array.prototype.sort);

const SCENARIO = 'public-path-multinode-baseline';
const FAILED_STEP = 'split-leader-spread';
const OLD_RUN_NODES = Object.freeze(['old-node-1', 'old-node-2']);
const NEW_RUN_NODES = Object.freeze(['new-node-1', 'new-node-2']);
// An earlier run's startup decision line, hours before this run.
const OLD_RUN_DECISION_LINE =
  '[2026-10-04T10:37:00.000Z] [old-node-1] [info] earlier run evidence';

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

async function sortedNames(dir) {
  return arraySort(await readdir(dir));
}

describe('scenario run artifact hygiene (W7)', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'scenario-run-hygiene-'));
  });

  afterEach(async () => {
    await rm(outputDir, {force: true, recursive: true});
  });

  it('a second run in the same output root keeps only its own curated ' +
    'and full node logs', async () => {
    const collector = new LogCollector(outputDir);
    await collector.writeOutput(SCENARIO,
      logEntries(OLD_RUN_NODES, '2026-10-04T10:37:00.000Z'), OLD_RUN_NODES);
    const fullLogsDir = join(outputDir, '.full-logs', SCENARIO);
    await mkdir(fullLogsDir, {recursive: true});
    await writeFile(join(fullLogsDir, 'old-node-1.log.gz'), 'x');

    // The second run starts: the harness clears what is not its own.
    assert.deepEqual(arraySort(await collector.resetScenarioOutput(SCENARIO)),
      ['_timeline.log', 'old-node-1.log', 'old-node-2.log']);
    assert.equal(await resetScenarioFullLogs(outputDir, SCENARIO), true);
    await collector.writeOutput(SCENARIO,
      logEntries(NEW_RUN_NODES, '2026-10-04T11:51:40.000Z'), NEW_RUN_NODES);

    assert.deepEqual(await sortedNames(join(outputDir, SCENARIO)),
      ['_timeline.log', 'new-node-1.log', 'new-node-2.log']);
    const timeline =
      await readFile(join(outputDir, SCENARIO, '_timeline.log'), 'utf8');
    assert.doesNotMatch(timeline, /old-node/u);
    assert.deepEqual(await sortedNames(join(outputDir, '.full-logs')), []);
  });

  it('cluster start clears the earlier run before any capture starts',
    async () => {
      const fullLogsDir = join(outputDir, '.full-logs', SCENARIO);
      await mkdir(fullLogsDir, {recursive: true});
      await writeFile(join(fullLogsDir, 'old-node-1.log.gz'), 'x');
      const resets = [];
      const stop = new Error('stop after the reset');
      const fake = {
        _cleanupUnregister: () => {},
        _config: {outputDir},
        _logCollector: {
          resetScenarioOutput: async (name) => {
            resets.push(name);
            return [];
          },
        },
        _playbackRecorder: {start: async () => {
          throw stop;
        }},
        _prepareReusableClusterLeaseForStart: async () => {},
        _resetScenarioRunArtifacts:
          Cluster.prototype._resetScenarioRunArtifacts,
        _scenarioName: SCENARIO,
      };
      await assert.rejects(Cluster.prototype.start.call(fake));
      assert.deepEqual(resets, [SCENARIO]);
      assert.deepEqual(await sortedNames(join(outputDir, '.full-logs')), []);
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
    const runStart = Date.parse('2026-10-04T11:51:39.000Z');
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
