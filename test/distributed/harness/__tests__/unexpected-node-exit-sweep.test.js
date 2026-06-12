/**
 * CL-030 step (a): a non-expected-down node whose container EXITED at
 * scenario-failure time must reattribute the failure to THAT node with its
 * exit evidence (the 145024Z-run2 seed OOM was misattributed to a
 * restartee). Covers the sweep module, NodeHandle.inspectContainerState,
 * and the cluster-level expected-down ledger around the chaos wrappers.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import {
  UNEXPECTED_NODE_EXIT_CLASSIFICATION,
  buildUnexpectedNodeExitFailure,
  extractFatalLines,
  sweepUnexpectedNodeExits,
} from '../unexpected-node-exit.js';
import {createCluster, NodeHandle} from './cluster-test-helpers.js';

const OOM_FATAL_LINE =
  'FATAL ERROR: Reached heap limit Allocation failed - ' +
  'JavaScript heap out of memory';

function buildExitedStubNode(id, overrides = {}) {
  return {
    id,
    role: 'seed',
    inspectContainerState: async () => ({
      status: 'exited',
      running: false,
      exitCode: 134,
      oomKilled: false,
      finishedAt: '2026-06-12T15:03:45.521Z',
      error: null,
    }),
    getLogs: async () => 'normal line\n' + OOM_FATAL_LINE + '\nlast line\n',
    ...overrides,
  };
}

test('extractFatalLines surfaces native crash markers', async (t) => {
  t.same(extractFatalLines('a\n' + OOM_FATAL_LINE + '\nb'), [OOM_FATAL_LINE]);
  t.same(extractFatalLines('all healthy\nlines only\n'), []);
  t.same(extractFatalLines(null), []);
  const framedPayload = Buffer.from(OOM_FATAL_LINE + '\n', 'utf8');
  const frameHeader = Buffer.alloc(8);
  frameHeader[0] = 2;
  frameHeader.writeUInt32BE(framedPayload.length, 4);
  const multiplexed = Buffer.concat([frameHeader, framedPayload])
    .toString('latin1');
  t.same(
    extractFatalLines(multiplexed),
    [OOM_FATAL_LINE],
    'docker multiplex frame headers are demuxed out of the evidence ' +
      '(gate 212016Z-run3 surfaced them verbatim in the scenario error)',
  );
});

test('sweep reports only non-expected-down exited containers', async (t) => {
  const runningNode = buildExitedStubNode('joiner-1', {
    inspectContainerState: async () => ({
      status: 'running',
      running: true,
      exitCode: 0,
      oomKilled: false,
      finishedAt: null,
      error: null,
    }),
  });
  const expectedDownNode = buildExitedStubNode('restartee');
  const deadSeed = buildExitedStubNode('seed-1');
  const inspectErrorNode = buildExitedStubNode('joiner-2', {
    inspectContainerState: async () => ({status: null, error: 'container_missing'}),
  });
  const bareStub = {id: 'stub-without-inspect'};

  const exits = await sweepUnexpectedNodeExits(
    [runningNode, expectedDownNode, deadSeed, inspectErrorNode, bareStub],
    (id) => id === 'restartee',
  );

  t.equal(exits.length, 1, 'only the dead non-expected-down node reported');
  t.equal(exits[0].nodeId, 'seed-1');
  t.equal(exits[0].containerStatus, 'exited');
  t.equal(exits[0].exitCode, 134);
  t.same(exits[0].fatalLines, [OOM_FATAL_LINE],
    'the crash dump line is surfaced from the stdout tail');
  t.match(exits[0].stdoutTail, /Reached heap limit/);
});

test('sweep keeps the exit fact when log collection fails', async (t) => {
  const deadNode = buildExitedStubNode('seed-1', {
    getLogs: async () => {
      throw new Error('container log read failed');
    },
  });
  const exits = await sweepUnexpectedNodeExits([deadNode], () => false);
  t.equal(exits.length, 1);
  t.equal(exits[0].stdoutTail, null);
  t.same(exits[0].fatalLines, []);
});

test('buildUnexpectedNodeExitFailure reattributes and keeps the downstream ' +
  'surface', async (t) => {
  const exits = await sweepUnexpectedNodeExits(
    [buildExitedStubNode('seed-1')],
    () => false,
  );
  const failure = buildUnexpectedNodeExitFailure(
    exits,
    'Restarted node did not become recovery-ready within 120000ms ' +
      'for node 11601fe0',
  );
  t.equal(failure.classification, UNEXPECTED_NODE_EXIT_CLASSIFICATION);
  t.match(failure.message, /^Unexpected node exit/,
    'the exit leads the failure (red on reattribution revert)');
  t.match(failure.message, /seed-1/, 'names the dead node');
  t.match(failure.message, /exitCode=134/);
  t.match(failure.message, /Reached heap limit/, 'names the fatal evidence');
  t.match(failure.message, /Downstream surface: Restarted node did not/,
    'the original (misattributable) surface is preserved as downstream');
});

test('NodeHandle.inspectContainerState normalizes docker inspect', async (t) => {
  const deadHandle = new NodeHandle('seed-1', 'container-1', '10.0.0.2', 'seed', {
    inspectContainerIfExists: async () => ({
      State: {
        Status: 'exited',
        Running: false,
        ExitCode: 137,
        OOMKilled: true,
        FinishedAt: '2026-06-12T15:03:45.521Z',
      },
    }),
  });
  t.same(await deadHandle.inspectContainerState(), {
    status: 'exited',
    running: false,
    exitCode: 137,
    oomKilled: true,
    finishedAt: '2026-06-12T15:03:45.521Z',
    error: null,
  });
  const missingHandle = new NodeHandle('gone', 'container-2', '10.0.0.3', 'joiner', {
    inspectContainerIfExists: async () => null,
  });
  t.same(await missingHandle.inspectContainerState(), {
    status: null,
    error: 'container_missing',
  });
});

test('cluster chaos wrappers maintain the expected-down ledger', async (t) => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  cluster._recordPlaybackEvent = () => {};
  cluster._chaos = {
    killNode: async () => {},
    stopNode: async () => {},
    pauseNode: async () => {},
    unpauseNode: async () => {},
  };

  await cluster.killNode('n1');
  t.equal(cluster._isNodeExpectedDown('n1'), true, 'killed node expected down');

  await cluster.pauseNode('n2');
  t.equal(cluster._isNodeExpectedDown('n2'), true, 'paused node expected down');
  await cluster.unpauseNode('n2');
  t.equal(cluster._isNodeExpectedDown('n2'), false, 'unpause clears');

  cluster._restartNodeWithObservation = async () => {};
  await cluster.restartNode('n1');
  t.equal(cluster._isNodeExpectedDown('n1'), false,
    'successful restart clears the expected-down mark');

  cluster._restartNodeWithObservation = async () => {
    throw new Error('restart wedged');
  };
  await t.rejects(cluster.restartNode('n3'), /restart wedged/);
  t.equal(cluster._isNodeExpectedDown('n3'), true,
    'failed restart leaves the node expected-down (CL-025 owns that death)');
});

test('cluster.sweepUnexpectedNodeExits honors the expected-down ledger ' +
  'and never throws', async (t) => {
  const cluster = createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  cluster._markNodeExpectedDown('restartee', 'restartNode');
  cluster._nodes.set('restartee', buildExitedStubNode('restartee'));
  cluster._nodes.set('seed-1', buildExitedStubNode('seed-1'));

  const exits = await cluster.sweepUnexpectedNodeExits();
  t.equal(exits.length, 1);
  t.equal(exits[0].nodeId, 'seed-1',
    'the expected-down restartee is not reported; the dead seed is');
});
