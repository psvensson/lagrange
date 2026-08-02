import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {createCluster} from '../cluster.js';

function buildRestartCluster(calls) {
  const cluster = createCluster({
    size: 2,
    docker: {socketPath: '/var/run/docker.sock'},
    image: 'distributed-db:test',
  });
  cluster._nodes.set('node-a', {
    id: 'node-a',
    closeQueryConnection() {
      calls.push('close-query');
    },
  });
  cluster._chaos = {
    async stopNode() {
      calls.push('stop');
    },
    async startNode() {
      calls.push('start');
    },
  };
  cluster._recordRestartBoundarySnapshot = async (_nodeId, phase) => {
    calls.push('snapshot-' + phase);
  };
  cluster._waitForRestartShutdownBoundary = async () => {
    calls.push('shutdown-observed');
  };
  cluster._markNodeIncarnationBoundary = async () => {
    calls.push('incarnation-boundary');
  };
  cluster._waitForNodeAdminReadiness = async () => {
    calls.push('admin-ready');
  };
  cluster._assertRestartedNodeRecoveryHeld = async () => {
    calls.push('recovery-held');
  };
  return cluster;
}

test('restart marks the next incarnation after shutdown and before start', async () => {
  const calls = [];
  const cluster = buildRestartCluster(calls);

  await cluster._restartNodeWithObservation('node-a');

  assert.deepEqual(calls, [
    'close-query',
    'snapshot-before_stop',
    'stop',
    'shutdown-observed',
    'incarnation-boundary',
    'start',
    'close-query',
    'admin-ready',
    'snapshot-after_ready',
    'recovery-held',
  ]);
});

test('starting a stopped node marks the next incarnation before start', async () => {
  const calls = [];
  const cluster = buildRestartCluster(calls);

  await cluster._startStoppedNodeWithObservation('node-a');

  assert.deepEqual(calls, [
    'incarnation-boundary',
    'start',
    'close-query',
    'admin-ready',
  ]);
});
