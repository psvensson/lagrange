// The full-log capture owner's per-node verdict and its handoff to the
// failure bundle: judged up to the node's quiet bound, the earliest observed
// moment after which it could produce no output (capture-quiet-bound.js: the
// harness's kill/stop/pause mark, the container exit the failure-time sweep
// observed, else teardown), recorded at teardown, carried by the runner onto
// the scenario result on the failing path, and copied into the report entry
// (quest failure-bundle-evidence-completeness, B3, B4 and N-A).
//
// Coverage model: quiet-bound source {harness stop, container exit, none ->
// teardown} x capture mode {streamed, file-logged} x node history {single
// incarnation, stop->start ok/failed, restart ok/failed, pause->unpause} x
// last-line timing {before the bound, after it, none captured}.
import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {URL} from 'node:url';
import {createCluster} from '../cluster.js';
import {buildScenarioEntry} from '../report-writer.js';
import {runScenarios} from '../../run.js';
import {
  CAPTURE_COMPLETENESS_REASON,
  STALE_CAPTURE_GAP_MS,
  nodeLogHostFile,
} from '../full-node-log-capture.js';
import {
  CAPTURE_QUIET_BOUND_SOURCE,
  HARNESS_STOP_ACTIONS,
  NODE_LIFECYCLE_ACTION,
} from '../constants.js';
import {COMPLETE_CAPTURE} from './failure-bundle-full-log-fixture.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const SCENARIO_NAME = 'capture-verdict';
const NODE_ID = 'node-1';
const LONG_AGO_MS = 200 * 1000;
const SELF_EXIT_AGO_MS = 185 * 1000;
const LINE_COUNT = 5000;
const {HARNESS_STOP, CONTAINER_EXIT, TEARDOWN} = CAPTURE_QUIET_BOUND_SOURCE;

// A cluster whose chaos actions only record the lifecycle marks (no Docker)
// and whose node log streamers are fakes reporting their status at stop().
async function buildCluster(outputDir, {fileLogging = false} = {}) {
  const cluster = createCluster({
    size: 3,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
    outputDir,
    scenarioName: SCENARIO_NAME,
  });
  cluster._runChaosAction = async () => null;
  cluster._scanBootProvenance = async () => null;
  cluster._isFileLoggingEnabled = () => fileLogging;
  return cluster;
}

function fakeStreamer(lastLineWallMs, lineCount = LINE_COUNT) {
  return {stop: async () => ({lineCount, lastLineWallMs})};
}

// The harness took the node down LONG_AGO_MS before teardown.
function backdateExpectedDown(cluster, nodeId, nowMs) {
  cluster._expectedDownNodesById.get(nodeId).sinceMs = nowMs - LONG_AGO_MS;
}

// The real failure-time sweep (cluster.sweepUnexpectedNodeExits) inspects a
// node whose container state reports this FinishedAt.
async function sweepObservesExit(cluster, finishedAt) {
  cluster._nodes.set(NODE_ID, {
    id: NODE_ID,
    role: 'seed',
    inspectContainerState: async () => ({status: 'exited', running: false,
      exitCode: 134, oomKilled: false, finishedAt, error: null}),
    getLogs: async () => 'FATAL ERROR: Reached heap limit\n',
  });
  return cluster.sweepUnexpectedNodeExits();
}

async function finalize(cluster) {
  const errors = [];
  await cluster._finalizeFullNodeLogStreams([[NODE_ID]], errors);
  assert.deepEqual(errors, []);
  return cluster.getCaptureCompletenessByNodeId()[NODE_ID];
}

function assertBound(verdict, source, action = null) {
  assert.equal(verdict.quietBound.source, source);
  assert.equal(verdict.quietBound.action, action);
}

async function writeHostLog(outputDir, lines) {
  const hostFile = nodeLogHostFile(outputDir, SCENARIO_NAME, NODE_ID);
  await mkdir(dirname(hostFile), {recursive: true});
  await writeFile(hostFile, lines.join('\n') + '\n');
}

function pinoAt(ms, msg) {
  return JSON.stringify({level: 30, time: new Date(ms).toISOString(), msg});
}

describe('the capture verdict is judged against the node\'s quiet bound', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'capture-verdict-'));
  });

  afterEach(async () => {
    await rm(outputDir, {recursive: true, force: true});
  });

  for (const [method, action] of [
    ['killNode', NODE_LIFECYCLE_ACTION.KILL],
    ['stopNode', NODE_LIFECYCLE_ACTION.STOP],
    ['pauseNode', NODE_LIFECYCLE_ACTION.PAUSE],
  ]) {
    it(`a node the harness took down with ${method} long before teardown ` +
      'is complete and names the harness stop and its action', async () => {
      assert.ok(arrayIncludes(HARNESS_STOP_ACTIONS, action));
      const cluster = await buildCluster(outputDir);
      const nowMs = Date.now();
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(nowMs - LONG_AGO_MS - 1));
      await cluster[method](NODE_ID);
      backdateExpectedDown(cluster, NODE_ID, nowMs);
      const verdict = await finalize(cluster);
      assert.equal(verdict.complete, true);
      assertBound(verdict, HARNESS_STOP, action);
      assert.equal(cluster._incompleteCaptureWarning, undefined);
    });
  }

  it('shutdown lines after a stop mark are complete with the gap clamped ' +
    'at zero', async () => {
    const cluster = await buildCluster(outputDir);
    const nowMs = Date.now();
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(nowMs - LONG_AGO_MS + 1000));
    await cluster.stopNode(NODE_ID);
    backdateExpectedDown(cluster, NODE_ID, nowMs);
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, true);
    assert.equal(verdict.gapMs, 0);
    assertBound(verdict, HARNESS_STOP, NODE_LIFECYCLE_ACTION.STOP);
  });

  it('a node that went quiet with no observed bound is still stale-tail ' +
    'judged at teardown', async () => {
    const cluster = await buildCluster(outputDir);
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(Date.now() - LONG_AGO_MS));
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, false);
    assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
    assertBound(verdict, TEARDOWN);
  });

  it('a node quiet long before the harness killed it is still stale-tail',
    async () => {
      const cluster = await buildCluster(outputDir);
      const nowMs = Date.now();
      cluster._nodeLogStreamers.set(NODE_ID,
        fakeStreamer(nowMs - LONG_AGO_MS - STALE_CAPTURE_GAP_MS - 1));
      await cluster.killNode(NODE_ID);
      backdateExpectedDown(cluster, NODE_ID, nowMs);
      const verdict = await finalize(cluster);
      assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
      assertBound(verdict, HARNESS_STOP, NODE_LIFECYCLE_ACTION.KILL);
    });

  it('a node that exited on its own (sweep FinishedAt 185 s before ' +
    'teardown) is complete, judged to its container exit', async () => {
    const cluster = await buildCluster(outputDir);
    const exitMs = Date.now() - SELF_EXIT_AGO_MS;
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(exitMs - 10));
    const exits = await sweepObservesExit(cluster, new Date(exitMs).toISOString());
    assert.equal(exits.length, 1, 'the sweep still reports the unexpected exit');
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, true);
    assert.equal(verdict.gapMs, 10);
    assert.equal(verdict.quietBound.atMs, exitMs);
    assertBound(verdict, CONTAINER_EXIT);
    assert.equal(cluster._incompleteCaptureWarning, undefined);
  });

  it('lines received after the observed exit are complete with the gap ' +
    'clamped at zero', async () => {
    const cluster = await buildCluster(outputDir);
    const exitMs = Date.now() - SELF_EXIT_AGO_MS;
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(exitMs + 500));
    await sweepObservesExit(cluster, new Date(exitMs).toISOString());
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, true);
    assert.equal(verdict.gapMs, 0);
    assertBound(verdict, CONTAINER_EXIT);
  });

  it('a node silent long before its observed exit is stale-tail, judged to ' +
    'the exit', async () => {
    const cluster = await buildCluster(outputDir);
    const exitMs = Date.now() - SELF_EXIT_AGO_MS;
    cluster._nodeLogStreamers.set(NODE_ID,
      fakeStreamer(exitMs - STALE_CAPTURE_GAP_MS - 1));
    await sweepObservesExit(cluster, new Date(exitMs).toISOString());
    const verdict = await finalize(cluster);
    assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
    assertBound(verdict, CONTAINER_EXIT);
  });

  for (const finishedAt of [null, 'not-a-time', '0001-01-01T00:00:00Z']) {
    it(`an exit with FinishedAt ${String(finishedAt)} never acquits`,
      async () => {
        const cluster = await buildCluster(outputDir);
        cluster._nodeLogStreamers.set(NODE_ID,
          fakeStreamer(Date.now() - SELF_EXIT_AGO_MS));
        await sweepObservesExit(cluster, finishedAt);
        const verdict = await finalize(cluster);
        assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
        assertBound(verdict, TEARDOWN);
      });
  }

  it('the earliest observation wins: an exit before a later kill', async () => {
    const cluster = await buildCluster(outputDir);
    const nowMs = Date.now();
    const exitMs = nowMs - LONG_AGO_MS - 2 * STALE_CAPTURE_GAP_MS;
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(exitMs - 10));
    await cluster.killNode(NODE_ID);
    backdateExpectedDown(cluster, NODE_ID, nowMs);
    await sweepObservesExit(cluster, new Date(exitMs).toISOString());
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, true);
    assertBound(verdict, CONTAINER_EXIT);
  });

  it('a node with no captured line is no-lines-captured, naming its bound',
    async () => {
      const cluster = await buildCluster(outputDir);
      const exitMs = Date.now() - SELF_EXIT_AGO_MS;
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(0, 0));
      await sweepObservesExit(cluster, new Date(exitMs).toISOString());
      const verdict = await finalize(cluster);
      assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.NO_LINES_CAPTURED);
      assertBound(verdict, CONTAINER_EXIT);
    });

  it('a killed-then-restarted node is judged from its streamer at teardown',
    async () => {
      const cluster = await buildCluster(outputDir);
      const nowMs = Date.now();
      await cluster.killNode(NODE_ID);
      await cluster.restartNode(NODE_ID);
      // The re-attached streamer drained the new incarnation to teardown.
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(nowMs));
      const fresh = await finalize(cluster);
      assert.equal(fresh.complete, true);
      assertBound(fresh, TEARDOWN);
    });

  it('stop->start succeeded: a node that then went quiet is not excused',
    async () => {
      const cluster = await buildCluster(outputDir);
      await cluster.stopNode(NODE_ID);
      await cluster.startNode(NODE_ID);
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(Date.now() - LONG_AGO_MS));
      const quiet = await finalize(cluster);
      assert.equal(quiet.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
      assertBound(quiet, TEARDOWN);
    });

  for (const [label, act] of [
    ['restart', (cluster) => cluster.restartNode(NODE_ID)],
    ['stop->start', async (cluster) => {
      await cluster.stopNode(NODE_ID);
      return cluster.startNode(NODE_ID);
    }],
  ]) {
    it(`a successful ${label} drops an exit observed for the earlier ` +
      'incarnation', async () => {
      const cluster = await buildCluster(outputDir);
      const exitMs = Date.now() - LONG_AGO_MS;
      await sweepObservesExit(cluster, new Date(exitMs).toISOString());
      await act(cluster);
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(exitMs));
      const verdict = await finalize(cluster);
      assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
      assertBound(verdict, TEARDOWN);
    });
  }

  // The transition's own operation fails (admin readiness never came); the
  // earlier stop mark, if any, is backdated so a start that kept it would
  // be judged (wrongly) to the stop.
  function failNextTransition(cluster) {
    cluster._runChaosAction = async () => {
      throw new Error('admin readiness timeout');
    };
  }
  for (const [label, act] of [
    ['restart', (cluster) => {
      failNextTransition(cluster);
      return cluster.restartNode(NODE_ID);
    }],
    ['stop->start', async (cluster) => {
      await cluster.stopNode(NODE_ID);
      backdateExpectedDown(cluster, NODE_ID, Date.now());
      failNextTransition(cluster);
      return cluster.startNode(NODE_ID);
    }],
  ]) {
    it(`a failed ${label} whose new incarnation exited is judged to that ` +
      'exit', async () => {
      const cluster = await buildCluster(outputDir);
      await assert.rejects(act(cluster), /admin readiness timeout/);
      assert.equal(cluster._isNodeExpectedDown(NODE_ID), true);
      const exitMs = Date.now() - SELF_EXIT_AGO_MS;
      cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(exitMs - 10));
      const exits = await sweepObservesExit(cluster, new Date(exitMs).toISOString());
      assert.deepEqual(exits, [], 'expected-down: not an unexpected exit');
      const verdict = await finalize(cluster);
      assert.equal(verdict.complete, true);
      assertBound(verdict, CONTAINER_EXIT);
    });

    it(`a failed ${label} with no observed exit is judged at teardown`,
      async () => {
        const cluster = await buildCluster(outputDir);
        await assert.rejects(act(cluster), /admin readiness timeout/);
        cluster._nodeLogStreamers.set(NODE_ID,
          fakeStreamer(Date.now() - LONG_AGO_MS));
        const verdict = await finalize(cluster);
        assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
        assertBound(verdict, TEARDOWN);
      });
  }

  it('pause->unpause then quiet is stale-tail at teardown', async () => {
    const cluster = await buildCluster(outputDir);
    const nowMs = Date.now();
    cluster._nodeLogStreamers.set(NODE_ID, fakeStreamer(nowMs - LONG_AGO_MS));
    await cluster.pauseNode(NODE_ID);
    backdateExpectedDown(cluster, NODE_ID, nowMs);
    await cluster.unpauseNode(NODE_ID);
    const verdict = await finalize(cluster);
    assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
    assertBound(verdict, TEARDOWN);
  });

  it('the file-logged capture of a killed node is judged up to the kill',
    async () => {
      const cluster = await buildCluster(outputDir, {fileLogging: true});
      const nowMs = Date.now();
      await writeHostLog(outputDir, [pinoAt(nowMs - LONG_AGO_MS - 1, 'last')]);
      await cluster.killNode(NODE_ID);
      backdateExpectedDown(cluster, NODE_ID, nowMs);
      const verdict = await finalize(cluster);
      assert.equal(verdict.complete, true);
      assertBound(verdict, HARNESS_STOP, NODE_LIFECYCLE_ACTION.KILL);
    });

  it('the file-logged capture of a node that exited on its own is judged ' +
    'to its exit', async () => {
    const cluster = await buildCluster(outputDir, {fileLogging: true});
    const exitMs = Date.now() - SELF_EXIT_AGO_MS;
    await writeHostLog(outputDir, [pinoAt(exitMs - 10, 'last'),
      'FATAL ERROR: Reached heap limit']);
    await sweepObservesExit(cluster, new Date(exitMs).toISOString());
    const verdict = await finalize(cluster);
    assert.equal(verdict.complete, true);
    assertBound(verdict, CONTAINER_EXIT);
  });

  it('the file-logged capture of a quiet node with an unparseable exit is ' +
    'stale-tail', async () => {
    const cluster = await buildCluster(outputDir, {fileLogging: true});
    await writeHostLog(outputDir, [pinoAt(Date.now() - SELF_EXIT_AGO_MS, 'last')]);
    await sweepObservesExit(cluster, 'not-a-time');
    const verdict = await finalize(cluster);
    assert.equal(verdict.reason, CAPTURE_COMPLETENESS_REASON.STALE_TAIL);
    assertBound(verdict, TEARDOWN);
  });
});

describe('the verdict reaches the report entry', () => {
  it('buildScenarioEntry carries the map, and null when absent', () => {
    const verdicts = {[NODE_ID]: COMPLETE_CAPTURE};
    const entry = buildScenarioEntry(SCENARIO_NAME,
      {passed: false, captureCompletenessByNodeId: verdicts});
    assert.deepEqual(entry.captureCompletenessByNodeId, verdicts);
    assert.equal(
      buildScenarioEntry(SCENARIO_NAME, {passed: false}).captureCompletenessByNodeId,
      null);
  });

  it('the runner reads the map after cluster.stop() on the failing path',
    async () => {
      const verdicts = {[NODE_ID]: COMPLETE_CAPTURE};
      let stopped = false;
      const fakeCluster = {
        _providers: {local: {}},
        _hostAssignment: ['local'],
        async start() {},
        async stop() {
          stopped = true;
        },
        setScenarioName() {},
        getNodes: () => [{id: NODE_ID}],
        getLogCollector: () => ({async collectContainerFallback() {}}),
        getPlaybackManifest: () => null,
        getTraceManifest: () => null,
        // Final only after stop(): read before it, the map would be empty.
        getCaptureCompletenessByNodeId: () => (stopped ? verdicts : {}),
      };
      const failPath = new URL('../__fixtures__/failing-scenario.js',
        import.meta.url).pathname;
      const {report} = await runScenarios(
        {size: 3, docker: {socketPath: '/var/run/docker.sock'},
          image: 'test:latest', timeouts: {nodeStartup: 1000, convergence: 1000},
          resourceLimits: {}},
        [{name: SCENARIO_NAME, path: failPath}],
        {output: join(tmpdir(), 'capture-handoff-report.json'), verbose: false,
          clusterFactory: () => fakeCluster},
      );
      assert.equal(report.scenarios[0].passed, false);
      assert.deepEqual(report.scenarios[0].captureCompletenessByNodeId, verdicts);
    });
});
