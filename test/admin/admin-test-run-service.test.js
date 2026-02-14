/**
 * Unit tests for AdminTestRunService.
 */

import {EventEmitter} from 'node:events';
import {access, mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URL} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';
import {AdminTestRunService} from '../../src/admin/admin-test-run-service.js';

const FILE_ENCODING = 'utf8';
const TMP_PREFIX = 'ddb-admin-test-run-';
const WAIT_INTERVAL_MS = 10;
const WAIT_TIMEOUT_MS = 500;
const REPORT_TIMESTAMP = '2026-02-14T12:34:56.000Z';
const RUN_STARTED_AT = '2026-02-14T12:30:00.000Z';
const RUN_GIT_HASH = 'abc1234';
const STATUS_PASSED = 'passed';
const STATUS_STOPPED = 'stopped';
const STATUS_STOPPING = 'stopping';
const SIGNAL_TERM = 'SIGTERM';
const STANDARD_EXEC_FILE_RESULT = 'deadbeef\n';

/**
 * Create an isolated workspace skeleton for service tests.
 * @return {Promise<string>}
 */
async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  await mkdir(join(root, 'test/distributed/scenarios'), {recursive: true});
  await mkdir(join(root, 'test/distributed/config'), {recursive: true});
  await mkdir(join(root, 'test-output/.run-metadata'), {recursive: true});
  return root;
}

/**
 * Wait until run reaches expected status.
 * @param {AdminTestRunService} service
 * @param {string} runId
 * @param {string} expectedStatus
 * @return {Promise<Object>}
 */
async function waitForRunStatus(service, runId, expectedStatus) {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    const run = await service.getRun(runId);
    if (run && run.status === expectedStatus) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for status ${expectedStatus}`);
}

/**
 * Wait until predicate returns true.
 * @param {Function} predicate
 * @return {Promise<void>}
 */
async function waitForCondition(predicate) {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for condition');
}

/**
 * Create execFile stub returning deterministic git hash.
 * @return {Function}
 */
function createExecFileStub() {
  return (_command, _args, _options, callback) => {
    callback(null, STANDARD_EXEC_FILE_RESULT, '');
  };
}

test('AdminTestRunService - discovers tests, configs, and saved runs', async (t) => {
  const workspace = await createWorkspace();
  try {
    await writeFile(
      join(workspace, 'test/distributed/scenarios/alpha.js'),
      'export async function run(_cluster) {}',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test/distributed/scenarios/beta.js'),
      'export async function run(_cluster) {}',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test/distributed/scenarios/README.txt'),
      'ignore',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test/distributed/config/local.json'),
      '{}',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test/distributed/config/gcp.json'),
      '{}',
      FILE_ENCODING,
    );

    const reportPayload = {
      timestamp: REPORT_TIMESTAMP,
      summary: {total: 1, passed: 1, failed: 0, duration: 10},
      scenarios: [{
        scenario: 'alpha',
        startedAt: RUN_STARTED_AT,
        playback: {
          manifestPath: 'test-output/alpha/playback-manifest.json',
        },
      }],
    };
    await mkdir(join(workspace, 'test-output/alpha'), {recursive: true});
    await writeFile(
      join(workspace, 'test-output/sample-run.report.json'),
      JSON.stringify(reportPayload, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/.run-metadata/run-sample-run.json'),
      JSON.stringify({
        runId: 'sample-run',
        scenario: 'alpha',
        config: 'local.json',
        gitHash: RUN_GIT_HASH,
        startedAt: RUN_STARTED_AT,
        outputReportPath: 'test-output/sample-run.report.json',
      }),
      FILE_ENCODING,
    );

    const service = new AdminTestRunService({workspaceRoot: workspace});
    const tests = await service.listAvailableTests();
    const configs = await service.listAvailableConfigs();
    const runs = await service.listSavedRuns();

    t.same(
      tests.map((entry) => entry.id),
      ['alpha', 'beta'],
      'should list scenario files',
    );
    t.same(
      configs.map((entry) => entry.id),
      ['gcp.json', 'local.json'],
      'should list config files',
    );
    t.equal(runs.length, 1, 'should include one saved run');
    t.equal(runs[0].runId, 'sample-run', 'should use report-derived run id');
    t.equal(runs[0].gitHash, RUN_GIT_HASH, 'should merge git hash from metadata');
    t.ok(
      String(runs[0].playbackViewerUrl).includes('/ui/playback-viewer?manifest='),
      'should provide playback viewer URL',
    );
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('AdminTestRunService - starts run, streams logs, and marks pass on exit code 0',
  async (t) => {
    const workspace = await createWorkspace();
    try {
      await writeFile(
        join(workspace, 'test/distributed/scenarios/alpha.js'),
        'export async function run(_cluster) {}',
        FILE_ENCODING,
      );
      await writeFile(
        join(workspace, 'test/distributed/config/local.json'),
        '{}',
        FILE_ENCODING,
      );

      let spawned = null;
      const child = new EventEmitter();
      child.pid = 4242;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;
      const spawnRunner = (command, args, options) => {
        spawned = {command, args, options};
        return child;
      };

      const service = new AdminTestRunService({
        workspaceRoot: workspace,
        spawnRunner,
        execFile: createExecFileStub(),
      });

      const run = await service.startRun({
        scenario: 'alpha',
        config: 'local.json',
      });
      const subscriptionEvents = [];
      const subscription = service.subscribeToRun(
        run.runId,
        (event) => subscriptionEvents.push(event),
      );

      t.ok(spawned, 'should spawn test runner process');
      t.equal(spawned.command, process.execPath, 'should use node binary for runner');
      t.ok(
        spawned.args.includes('--scenario') && spawned.args.includes('alpha'),
        'should pass selected scenario',
      );
      t.ok(subscription, 'should allow live subscription for active run');
      t.ok(
        String(run.livePlaybackViewerUrl).includes('/ui/playback-viewer?'),
        'should expose live playback viewer URL immediately',
      );
      {
        const liveUrl = new URL(String(run.livePlaybackViewerUrl), 'http://localhost');
        const runStartMs = Number(liveUrl.searchParams.get('runStartMs'));
        t.ok(Number.isFinite(runStartMs) && runStartMs > 0,
          'live playback viewer URL should include runStartMs');
      }
      t.ok(
        String(run.playbackEventsUrl).includes(
          `/ui/test-output/.playback/${run.runId}/alpha/events.ndjson`,
        ),
        'should expose run-scoped events url for running playback',
      );

      child.stdout.emit('data', Buffer.from('line one\nline two\n', FILE_ENCODING));
      child.stderr.emit('data', Buffer.from('warn one\n', FILE_ENCODING));
      child.emit('close', 0, null);

      const completed = await waitForRunStatus(service, run.runId, STATUS_PASSED);
      t.equal(completed.status, STATUS_PASSED, 'should mark run as passed');
      t.ok(Array.isArray(completed.logs), 'should expose buffered logs');
      t.equal(completed.logs.length, 4, 'should capture emitted logs and preflight line');
      t.ok(
        completed.logs.some((entry) =>
          String(entry.line || '').includes('[preflight]')),
        'should include preflight summary in run logs',
      );
      t.ok(
        subscriptionEvents.some((event) => event.type === 'log'),
        'should publish log events to subscribers',
      );
      await waitForCondition(
        () => subscriptionEvents.some((event) => event.type === 'status'),
      );
      t.ok(
        subscriptionEvents.some((event) => event.type === 'status'),
        'should publish status events to subscribers',
      );
      t.ok(
        subscriptionEvents.some((event) => event.type === 'progress'),
        'should publish progress events to subscribers',
      );
      t.equal(
        completed.progress.percent,
        100,
        'completed run should report 100 percent progress',
      );
      subscription.unsubscribe();
    } finally {
      await rm(workspace, {recursive: true, force: true});
    }
  });

test('AdminTestRunService - startRun fails fast on unresolved remote docker host',
  async (t) => {
    const workspace = await createWorkspace();
    try {
      await writeFile(
        join(workspace, 'test/distributed/scenarios/alpha.js'),
        'export async function run(_cluster) {}',
        FILE_ENCODING,
      );
      await writeFile(
        join(workspace, 'test/distributed/config/gcp-large.json'),
        JSON.stringify({
          docker: {
            hosts: ['tcp://gcp-vm-1:2376'],
          },
        }, null, 2),
        FILE_ENCODING,
      );

      let spawnInvocations = 0;
      const child = new EventEmitter();
      child.pid = 1212;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => true;

      const service = new AdminTestRunService({
        workspaceRoot: workspace,
        spawnRunner: () => {
          spawnInvocations++;
          return child;
        },
        execFile: createExecFileStub(),
        resolveHost: async (_host) => {
          throw new Error('getaddrinfo ENOTFOUND gcp-vm-1');
        },
      });

      await t.rejects(
        service.startRun({
          scenario: 'alpha',
          config: 'gcp-large.json',
        }),
        /Config preflight failed/i,
        'should reject unresolved remote docker host before spawning',
      );
      t.equal(
        spawnInvocations,
        0,
        'should not spawn child process when config preflight fails',
      );
    } finally {
      await rm(workspace, {recursive: true, force: true});
    }
  });

test('AdminTestRunService - resolves playback URL from playback.files.manifest', async (t) => {
  const workspace = await createWorkspace();
  try {
    await mkdir(join(workspace, 'test-output/alpha'), {recursive: true});
    await writeFile(
      join(workspace, 'test-output/alpha/_timeline.log'),
      '2026-02-14T12:00:00.000Z [node-a] info: alpha',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/manifest-shape.report.json'),
      JSON.stringify({
        timestamp: REPORT_TIMESTAMP,
        summary: {total: 1, passed: 1, failed: 0, duration: 10},
        scenarios: [{
          scenario: 'alpha',
          startedAt: RUN_STARTED_AT,
          playback: {
            files: {
              manifest: 'test-output/alpha/playback-manifest.json',
            },
          },
        }],
      }, null, 2),
      FILE_ENCODING,
    );

    const service = new AdminTestRunService({workspaceRoot: workspace});
    const run = await service.getRun('manifest-shape');

    t.ok(run, 'should resolve report-only run');
    t.equal(
      run.playbackManifestPath,
      'test-output/alpha/playback-manifest.json',
      'should parse manifest path from playback.files',
    );
    t.ok(
      String(run.playbackViewerUrl).includes('/ui/playback-viewer?manifest='),
      'should expose playback viewer URL',
    );
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('AdminTestRunService - stopRun transitions through stopping to stopped', async (t) => {
  const workspace = await createWorkspace();
  try {
    await writeFile(
      join(workspace, 'test/distributed/scenarios/alpha.js'),
      'export async function run(_cluster) {}',
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test/distributed/config/local.json'),
      '{}',
      FILE_ENCODING,
    );

    const child = new EventEmitter();
    child.pid = 5151;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (signal) => {
      setTimeout(() => {
        child.emit('close', null, signal);
      }, 0);
      return true;
    };

    const service = new AdminTestRunService({
      workspaceRoot: workspace,
      spawnRunner: (_command, _args, _options) => child,
      execFile: createExecFileStub(),
    });

    const started = await service.startRun({scenario: 'alpha'});
    t.equal(started.config, 'local.json', 'should default run config to local.json');
    const stopResult = await service.stopRun(started.runId);
    t.equal(stopResult.status, STATUS_STOPPING, 'stop should set stopping state first');

    const stopped = await waitForRunStatus(service, started.runId, STATUS_STOPPED);
    t.equal(stopped.status, STATUS_STOPPED, 'close after stop should mark run stopped');
    t.equal(stopped.signal, SIGNAL_TERM, 'stopped run should preserve stop signal');
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('AdminTestRunService - historical getRun includes archived timeline logs', async (t) => {
  const workspace = await createWorkspace();
  try {
    await mkdir(join(workspace, 'test-output/archive-scenario'), {recursive: true});
    await writeFile(
      join(workspace, 'test-output/archive-run.report.json'),
      JSON.stringify({
        timestamp: REPORT_TIMESTAMP,
        summary: {total: 1, passed: 1, failed: 0, duration: 10},
        scenarios: [{
          scenario: 'archive-scenario',
          startedAt: RUN_STARTED_AT,
        }],
      }, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/.run-metadata/run-archive-run.json'),
      JSON.stringify({
        runId: 'archive-run',
        scenario: 'archive-scenario',
        config: 'local.json',
        gitHash: RUN_GIT_HASH,
        startedAt: RUN_STARTED_AT,
        endedAt: REPORT_TIMESTAMP,
        status: STATUS_PASSED,
        outputReportPath: 'test-output/archive-run.report.json',
      }, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/archive-scenario/_timeline.log'),
      [
        '2026-02-14T12:00:00.000Z [node-a] info: alpha',
        '2026-02-14T12:00:01.000Z [node-a] warn: beta',
      ].join('\n'),
      FILE_ENCODING,
    );

    const service = new AdminTestRunService({workspaceRoot: workspace});
    const run = await service.getRun('archive-run');

    t.ok(run, 'should load historical run');
    t.ok(Array.isArray(run.logs), 'should include log array');
    t.equal(run.logs.length, 2, 'should include archived timeline lines');
    t.equal(run.logs[0].stream, 'archive', 'archived entries should be tagged');
    t.match(run.logs[1].line, /warn: beta/, 'should preserve timeline line text');
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('AdminTestRunService - historical getRun reads run-scoped playback timeline',
  async (t) => {
    const workspace = await createWorkspace();
    try {
      await mkdir(
        join(
          workspace,
          'test-output/.playback/scoped-run/report-only-scenario',
        ),
        {recursive: true},
      );
      await writeFile(
        join(workspace, 'test-output/scoped-run.report.json'),
        JSON.stringify({
          timestamp: REPORT_TIMESTAMP,
          summary: {total: 1, passed: 1, failed: 0, duration: 10},
          scenarios: [{
            scenario: 'report-only-scenario',
            startedAt: RUN_STARTED_AT,
          }],
        }, null, 2),
        FILE_ENCODING,
      );
      await writeFile(
        join(
          workspace,
          'test-output/.playback/scoped-run/report-only-scenario/_timeline.log',
        ),
        '2026-02-14T12:00:00.000Z [node-r] info: run-scoped',
        FILE_ENCODING,
      );

      const service = new AdminTestRunService({workspaceRoot: workspace});
      const run = await service.getRun('scoped-run');

      t.ok(run, 'should resolve report-only run');
      t.equal(run.logs.length, 1, 'should load run-scoped timeline entries');
      t.match(run.logs[0].line, /run-scoped/, 'should preserve run-scoped timeline text');
    } finally {
      await rm(workspace, {recursive: true, force: true});
    }
  });

test('AdminTestRunService - getRun resolves report-only historical run ids', async (t) => {
  const workspace = await createWorkspace();
  try {
    await mkdir(join(workspace, 'test-output/report-only-scenario'), {recursive: true});
    await writeFile(
      join(workspace, 'test-output/report-only-run.report.json'),
      JSON.stringify({
        timestamp: REPORT_TIMESTAMP,
        summary: {total: 1, passed: 1, failed: 0, duration: 10},
        scenarios: [{
          scenario: 'report-only-scenario',
          startedAt: RUN_STARTED_AT,
        }],
      }, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/report-only-scenario/_timeline.log'),
      '2026-02-14T12:00:00.000Z [node-r] info: from-report-only',
      FILE_ENCODING,
    );

    const service = new AdminTestRunService({workspaceRoot: workspace});
    const run = await service.getRun('report-only-run');

    t.ok(run, 'should resolve run from report file without metadata');
    t.equal(run.runId, 'report-only-run', 'should preserve requested run id');
    t.equal(run.scenario, 'report-only-scenario', 'should parse scenario from report');
    t.equal(run.logs.length, 1, 'should load archived timeline entry');
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('AdminTestRunService - deleteRun removes historical metadata and report', async (t) => {
  const workspace = await createWorkspace();
  try {
    await mkdir(join(workspace, 'test-output/delete-me'), {recursive: true});
    await mkdir(
      join(workspace, 'test-output/.playback/delete-run/delete-me'),
      {recursive: true},
    );
    await writeFile(
      join(workspace, 'test-output/delete-run.report.json'),
      JSON.stringify({
        timestamp: REPORT_TIMESTAMP,
        summary: {total: 1, passed: 1, failed: 0, duration: 10},
        scenarios: [{
          scenario: 'delete-me',
          startedAt: RUN_STARTED_AT,
        }],
      }, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/.run-metadata/run-delete-run.json'),
      JSON.stringify({
        runId: 'delete-run',
        scenario: 'delete-me',
        config: 'local.json',
        gitHash: RUN_GIT_HASH,
        startedAt: RUN_STARTED_AT,
        endedAt: REPORT_TIMESTAMP,
        status: STATUS_PASSED,
        outputReportPath: 'test-output/delete-run.report.json',
      }, null, 2),
      FILE_ENCODING,
    );
    await writeFile(
      join(workspace, 'test-output/.playback/delete-run/delete-me/_timeline.log'),
      '2026-02-14T12:00:00.000Z [node-z] info: stale',
      FILE_ENCODING,
    );

    const service = new AdminTestRunService({workspaceRoot: workspace});
    const deleted = await service.deleteRun('delete-run');
    t.equal(deleted.deleted, true, 'should confirm deletion');
    t.equal(deleted.removed.metadata, true, 'should remove metadata file');
    t.equal(deleted.removed.report, true, 'should remove report file');
    t.equal(deleted.removed.playback, true, 'should remove run-scoped playback files');

    const runs = await service.listSavedRuns();
    t.equal(runs.length, 0, 'deleted run should no longer be listed');

    await t.rejects(
      access(join(workspace, 'test-output/delete-run.report.json')),
      'report file should be removed',
    );
    await t.rejects(
      access(join(workspace, 'test-output/.run-metadata/run-delete-run.json')),
      'metadata file should be removed',
    );
    await t.rejects(
      access(join(workspace, 'test-output/.playback/delete-run/delete-me/_timeline.log')),
      'run-scoped playback files should be removed',
    );
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});
