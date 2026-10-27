import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {LOG_MARKER_STATE} from
  '../../../../src/control-plane/owners/log-diagnostic-marker-contract.js';
import {run} from '../../scenarios/write-ack-visibility.js';

const SELECT_LOG_ID_REGEX = /WHERE log_id = '([^']+)'/;
const regexExec = Function.call.bind(RegExp.prototype.exec);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function extractLogId(sql, regex) {
  const match = regexExec(regex, sql);
  return match ? match[1] : null;
}

describe('write-ack-visibility scenario', () => {
  it('waits until acknowledged diagnostic markers are visible on all reachable nodes',
    async () => {
      const insertedIds = new Set();
      const delayedVisibility = new Map();
      const recordedMarkers = [];
      let consistencyConvergenceCalls = 0;

      function makeNode(nodeId, delayed) {
        return {
          id: nodeId,
          role: nodeId === 'seed-1' ? 'seed' : 'joiner',
          isReachable: async () => true,
          appendDiagnosticMarker: async ({markerId, message}) => {
            const logId = `log-${markerId}`;
            insertedIds.add(logId);
            recordedMarkers.push({nodeId, markerId, message, logId});
            return {
              success: true,
              markerState: LOG_MARKER_STATE.RECORDED,
              markerId,
              logId,
              nodeId,
            };
          },
          query: async (sql) => {
            if (stringStartsWith(sql, 'INSERT INTO logs')) {
              throw new Error('Raw INSERT INTO logs is forbidden');
            }

            const logId = extractLogId(sql, SELECT_LOG_ID_REGEX);
            if (!logId || !insertedIds.has(logId)) {
              return {rows: []};
            }

            if (!delayed) {
              return {rows: [{log_id: logId}]};
            }

            const key = `${nodeId}:${logId}`;
            const seenCount = delayedVisibility.get(key) || 0;
            delayedVisibility.set(key, seenCount + 1);
            if (seenCount === 0) {
              return {rows: []};
            }

            return {rows: [{log_id: logId}]};
          },
        };
      }

      const nodes = [
        makeNode('seed-1', false),
        makeNode('joiner-1', true),
        makeNode('joiner-2', false),
      ];

      const cluster = {
        getNodes: () => nodes,
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForConsistencyConvergence: async () => {
          consistencyConvergenceCalls += 1;
        },
      };

      const result = await run(cluster, {
        writeCount: 2,
        propagationTimeoutMs: 100,
        pollIntervalMs: 1,
      });

      assert.equal(result.writesAttempted, 2);
      assert.equal(recordedMarkers.length, 2);
      assert.equal(consistencyConvergenceCalls, 1);
      assert.ok(result.maxPropagationMs >= 0);
      assert.equal(result.propagationSamples.length, 2);
      assert.equal(result.propagationSamples[0].logId, recordedMarkers[0].logId);
      assert.equal(result.propagationSamples[1].logId, recordedMarkers[1].logId);
    });

  it('prefers convergence settling over the load active gate when both exist',
    async () => {
      let waitForConvergenceCalls = 0;
      let waitForAllActiveCalls = 0;

      const nodes = [
        {
          id: 'seed-1',
          role: 'seed',
          isReachable: async () => true,
          appendDiagnosticMarker: async ({markerId}) => ({
            success: true,
            markerState: LOG_MARKER_STATE.RECORDED,
            markerId,
            logId: 'ack-vis-fixed',
            nodeId: 'seed-1',
          }),
          query: async () => ({rows: [{log_id: 'ack-vis-fixed'}]}),
        },
      ];

      const cluster = {
        getNodes: () => nodes,
        waitForConvergence: async () => {
          waitForConvergenceCalls += 1;
          return {settledAfterMs: 1};
        },
        waitForAllActive: async () => {
          waitForAllActiveCalls += 1;
        },
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        writeCount: 1,
        propagationTimeoutMs: 10,
        pollIntervalMs: 1,
      });

      assert.equal(waitForConvergenceCalls, 1);
      assert.equal(waitForAllActiveCalls, 0);
      assert.deepEqual(result.convergenceTiming, {settledAfterMs: 1});
    });

  it('rejects when appendDiagnosticMarker does not record the marker',
    async () => {
      const nodes = [
        {
          id: 'seed-1',
          role: 'seed',
          isReachable: async () => true,
          appendDiagnosticMarker: async ({markerId}) => ({
            success: false,
            markerState: LOG_MARKER_STATE.FAILED,
            markerId,
          }),
          query: async () => ({rows: []}),
        },
      ];

      const cluster = {
        getNodes: () => nodes,
        waitForConvergence: async () => ({settledAfterMs: 1}),
        waitForConsistencyConvergence: async () => {},
      };

      await assert.rejects(
        run(cluster, {
          writeCount: 1,
          propagationTimeoutMs: 10,
          pollIntervalMs: 1,
        }),
        /Diagnostic marker write must succeed/,
      );
    });
});
