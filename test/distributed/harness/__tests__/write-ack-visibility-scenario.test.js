import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/write-ack-visibility.js';

const INSERT_LOG_ID_REGEX = /VALUES \('([^']+)'/;
const SELECT_LOG_ID_REGEX = /WHERE log_id = '([^']+)'/;

function extractLogId(sql, regex) {
  const match = regex.exec(sql);
  return match ? match[1] : null;
}

describe('write-ack-visibility scenario', () => {
  it('waits until acknowledged writes are visible on all reachable nodes',
    async () => {
      const insertedIds = new Set();
      const delayedVisibility = new Map();
      let consistencyChecks = 0;

      function makeNode(nodeId, delayed) {
        return {
          id: nodeId,
          role: nodeId === 'seed-1' ? 'seed' : 'joiner',
          isReachable: async () => true,
          query: async (sql) => {
            if (sql.startsWith('INSERT INTO logs')) {
              const logId = extractLogId(sql, INSERT_LOG_ID_REGEX);
              if (logId) {
                insertedIds.add(logId);
              }
              return {rows: []};
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
        assertConsistency: async () => {
          consistencyChecks += 1;
        },
      };

      const result = await run(cluster, {
        writeCount: 2,
        propagationTimeoutMs: 100,
        pollIntervalMs: 1,
      });

      assert.equal(result.writesAttempted, 2);
      assert.equal(consistencyChecks, 1);
      assert.ok(result.maxPropagationMs >= 0);
      assert.equal(result.propagationSamples.length, 2);
    });
});
