import assert from 'node:assert/strict';
import test from 'node:test';
import {createCluster} from '../cluster.js';

function buildSnapshot(nodeId, leaderNodeId, capturedAt) {
  return {
    id: nodeId,
    role: nodeId === 'seed-a' ? 'seed' : 'node',
    async getControlSnapshot() {
      return {
        rows: [{
          capturedAt,
          leaders: {'orders-p1': leaderNodeId},
          replicaOperations: {
            inFlightCount: 0,
            partitionGroupInFlight: {},
            operationTimelineById: {},
          },
        }],
      };
    },
  };
}

test('quiescence probe retains every successful observer leader signature',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    cluster._nodes = new Map([
      ['seed-a', buildSnapshot('seed-a', 'node-a', 100)],
      ['node-b', buildSnapshot('node-b', 'node-b', 101)],
    ]);

    const result = await cluster._probeControlPlaneQuiescenceSnapshot(
      Date.now() + 1_000,
    );

    assert.deepEqual(result.leaderObservations, [
      {
        nodeId: 'seed-a',
        capturedAtMs: 100,
        leaderSignature: JSON.stringify([['orders-p1', 'node-a']]),
        leaderCount: 1,
      },
      {
        nodeId: 'node-b',
        capturedAtMs: 101,
        leaderSignature: JSON.stringify([['orders-p1', 'node-b']]),
        leaderCount: 1,
      },
    ]);
  });

test('candidate reset history retains selected observer and full observer cohort',
  async () => {
    const cluster = createCluster({
      size: 2,
      docker: {socketPath: '/var/run/docker.sock'},
      image: 'distributed-db:test',
    });
    const selectedSignature = JSON.stringify([['orders-p1', 'node-a']]);
    const observerSignature = JSON.stringify([['orders-p1', 'node-b']]);
    cluster._probeControlPlaneQuiescenceSnapshot = async () => ({
      nodeId: 'seed-a',
      capturedAtMs: 123,
      inFlightCount: 1,
      staleInFlightCount: 0,
      partitionGroupInFlight: {},
      operationTimelineSignature: null,
      leaderSignature: selectedSignature,
      leaderCount: 1,
      leaderObservations: [
        {
          nodeId: 'seed-a',
          capturedAtMs: 123,
          leaderSignature: selectedSignature,
          leaderCount: 1,
        },
        {
          nodeId: 'node-b',
          capturedAtMs: 124,
          leaderSignature: observerSignature,
          leaderCount: 1,
        },
      ],
      error: null,
    });
    cluster._sleep = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    cluster._collectFailureLogs = async () => {};

    await assert.rejects(
      cluster.waitForControlPlaneQuiescence({
        timeoutMs: 15,
        stableWindowMs: 5,
        maxInFlightCount: 0,
      }),
      (error) => {
        const history = error.quiescence.candidateWindowResetHistory;
        assert.ok(history.length > 0);
        const latest = history[history.length - 1];
        assert.equal(latest.selectedNodeId, 'seed-a');
        assert.equal(latest.selectedCapturedAtMs, 123);
        assert.deepEqual(latest.leaderObservations, [
          {
            nodeId: 'seed-a',
            capturedAtMs: 123,
            leaderSignature: selectedSignature,
            leaderCount: 1,
          },
          {
            nodeId: 'node-b',
            capturedAtMs: 124,
            leaderSignature: observerSignature,
            leaderCount: 1,
          },
        ]);
        return true;
      },
    );
  });
