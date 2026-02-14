/**
 * Property-based tests for Log Collector.
 *
 * Feature: distributed-testing-framework
 *
 * Property 12: Log Output Directory Structure
 * Validates: Requirements 7.5
 *
 * Property 21: Log Event Buffering Completeness
 * Validates: Requirements 7.2
 *
 * Property 22: Filtered Subscription Query Construction
 * Validates: Requirements 7.3
 *
 * Property 23: Buffer Tail Extraction
 * Validates: Requirements 7.7
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {access, rm} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {LogCollector} from '../log-collector.js';

const LIVE_SELECT_BASE = 'LIVE SELECT * FROM logs';

/**
 * Generate a unique temp directory path for test isolation.
 */
function tempDir() {
  return join(
    tmpdir(), 'lc-test-' + randomBytes(8).toString('hex'),
  );
}

/**
 * Build a mock node whose query() returns the given entries.
 */
function buildMockNode(entries) {
  return {
    id: 'mock-node',
    containerId: 'mock-container',
    query: async () => ({rows: entries}),
    isReachable: async () => true,
  };
}

const logEntryArb = fc.record({
  node_id: fc.string({minLength: 1, maxLength: 20}),
  level: fc.constantFrom('info', 'warn', 'error'),
  message: fc.string({maxLength: 100}),
  timestamp: fc.date().map((d) => d.toISOString()),
});

const alphanumeric = fc.stringMatching(/^[a-zA-Z0-9]+$/, {
  minLength: 1,
  maxLength: 20,
});

/**
 * Property 22: Filtered Subscription Query Construction
 * Validates: Requirements 7.3
 *
 * For any optional filter predicate string,
 * buildSubscriptionQuery(filter) SHALL return
 * 'LIVE SELECT * FROM logs' when no filter is provided, and
 * 'LIVE SELECT * FROM logs WHERE {filter}' when a filter is
 * provided.
 */
test('Property 22: Filtered Subscription Query Construction',
  async (t) => {
    await t.test(
      'returns base query when filter is falsy',
      async () => {
        await fc.assert(
          fc.property(
            fc.constantFrom(undefined, null, ''),
            (filter) => {
              const collector = new LogCollector(tempDir());
              const query =
                collector.buildSubscriptionQuery(filter);
              assert.equal(query, LIVE_SELECT_BASE);
            },
          ),
          {numRuns: 10},
        );
      },
    );

    await t.test(
      'appends WHERE clause when filter is truthy',
      async () => {
        await fc.assert(
          fc.property(
            fc.string({minLength: 1})
              .filter((s) => s.trim().length > 0),
            (filter) => {
              const collector = new LogCollector(tempDir());
              const query =
                collector.buildSubscriptionQuery(filter);
              assert.equal(
                query,
                LIVE_SELECT_BASE + ' WHERE ' + filter,
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );
  });

/**
 * Property 21: Log Event Buffering Completeness
 * Validates: Requirements 7.2
 *
 * For any sequence of N log events received via live query
 * subscription, the Log_Collector's buffer SHALL contain
 * exactly N entries in the order they were received.
 */
test('Property 21: Log Event Buffering Completeness',
  async (t) => {
    await t.test(
      'buffer contains exactly N entries in order',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(logEntryArb, {
              minLength: 0, maxLength: 50,
            }),
            async (entries) => {
              const collector = new LogCollector(tempDir());
              const mockNode = buildMockNode(entries);
              await collector.startLiveSubscription(mockNode);
              const buffer = collector.getBuffer();
              assert.equal(buffer.length, entries.length);
              for (let i = 0; i < entries.length; i++) {
                assert.deepStrictEqual(
                  buffer[i], entries[i],
                );
              }
            },
          ),
          {numRuns: 10},
        );
      },
    );
  });

/**
 * Property 23: Buffer Tail Extraction
 * Validates: Requirements 7.7
 *
 * For any buffer of M log entries and requested tail size N,
 * getTail(N) SHALL return exactly min(M, N) entries
 * corresponding to the last entries in the buffer.
 */
test('Property 23: Buffer Tail Extraction', async (t) => {
  await t.test(
    'returns min(M, N) last entries',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(logEntryArb, {
            minLength: 0, maxLength: 50,
          }),
          fc.integer({min: 0, max: 100}),
          async (entries, tailSize) => {
            const collector = new LogCollector(tempDir());
            const mockNode = buildMockNode(entries);
            await collector.startLiveSubscription(mockNode);

            const tail = collector.getTail(tailSize);
            const expectedLen = Math.min(
              entries.length, tailSize,
            );
            assert.equal(tail.length, expectedLen);

            const bufferSlice = entries.slice(
              entries.length - expectedLen,
            );
            for (let i = 0; i < expectedLen; i++) {
              assert.deepStrictEqual(
                tail[i], bufferSlice[i],
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Property 12: Log Output Directory Structure
 * Validates: Requirements 7.5
 *
 * For any scenario name and set of node IDs, the log collector
 * SHALL write per-node logs to paths matching
 * {outputDir}/{scenarioName}/{nodeId}.log and a unified
 * timeline to {outputDir}/{scenarioName}/_timeline.log.
 */
test('Property 12: Log Output Directory Structure',
  async (t) => {
    await t.test(
      'writes per-node logs and timeline file',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            alphanumeric,
            fc.array(alphanumeric, {
              minLength: 1, maxLength: 5,
            }).map((arr) => [...new Set(arr)])
              .filter((arr) => arr.length > 0),
            async (scenarioName, nodeIds) => {
              const outDir = tempDir();
              const collector = new LogCollector(outDir);

              const logEntries = nodeIds.map((nid) => ({
                node_id: nid,
                level: 'info',
                message: 'test message',
                timestamp: new Date().toISOString(),
              }));

              await collector.writeOutput(
                scenarioName, logEntries, nodeIds,
              );

              for (const nid of nodeIds) {
                const filePath = join(
                  outDir, scenarioName, nid + '.log',
                );
                await access(filePath);
              }

              const timelinePath = join(
                outDir, scenarioName, '_timeline.log',
              );
              await access(timelinePath);

              await rm(
                outDir, {recursive: true, force: true},
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );
  });

// --- Unit Tests for Log Collector ---
// Requirements: 7.1, 7.2, 7.4, 7.6

/**
 * Unit test: startLiveSubscription buffers events from node query
 * Validates: Requirements 7.1, 7.2
 */
test('startLiveSubscription buffers events from node query',
  async (_t) => {
    const entries = [
      {
        node_id: 'node-1', level: 'info',
        message: 'started', timestamp: '2024-01-01T00:00:00Z',
      },
      {
        node_id: 'node-1', level: 'warn',
        message: 'slow query', timestamp: '2024-01-01T00:00:01Z',
      },
      {
        node_id: 'node-2', level: 'error',
        message: 'timeout', timestamp: '2024-01-01T00:00:02Z',
      },
    ];

    const mockNode = buildMockNode(entries);
    const collector = new LogCollector(tempDir());

    await collector.startLiveSubscription(mockNode);

    const buffer = collector.getBuffer();
    assert.equal(buffer.length, entries.length);
    assert.deepStrictEqual(buffer[0], entries[0]);
    assert.deepStrictEqual(buffer[1], entries[1]);
    assert.deepStrictEqual(buffer[2], entries[2]);
  });

/**
 * Unit test: startLiveSubscription with filter passes
 * correct query to node
 * Validates: Requirements 7.1, 7.2
 */
test('startLiveSubscription passes filter to node query',
  async (_t) => {
    let capturedQuery = null;
    const mockNode = {
      id: 'node-1',
      containerId: 'c1',
      query: async (sql) => {
        capturedQuery = sql;
        return {rows: []};
      },
      isReachable: async () => true,
    };

    const collector = new LogCollector(tempDir());
    await collector.startLiveSubscription(
      mockNode, 'level = \'error\'',
    );

    assert.equal(
      capturedQuery,
      'LIVE SELECT * FROM logs WHERE level = \'error\'',
    );
  });

/**
 * Unit test: startLiveSubscription handles node query failure
 * gracefully
 * Validates: Requirements 7.1
 */
test('startLiveSubscription handles query failure gracefully',
  async (_t) => {
    const failingNode = {
      id: 'node-fail',
      containerId: 'cf',
      query: async () => {
        throw new Error('connection refused');
      },
      isReachable: async () => false,
    };

    const collector = new LogCollector(tempDir());
    await collector.startLiveSubscription(failingNode);

    const buffer = collector.getBuffer();
    assert.equal(buffer.length, 0);
  });

/**
 * Unit test: collectFinalSnapshot queries and appends to buffer
 * Validates: Requirements 7.4
 */
test('collectFinalSnapshot queries and appends to buffer',
  async (_t) => {
    const liveEntries = [
      {
        node_id: 'node-1', level: 'info',
        message: 'live event', timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const snapshotEntries = [
      {
        node_id: 'node-1', level: 'info',
        message: 'snapshot-1', timestamp: '2024-01-01T00:00:01Z',
      },
      {
        node_id: 'node-2', level: 'warn',
        message: 'snapshot-2', timestamp: '2024-01-01T00:00:02Z',
      },
    ];

    let capturedQuery = null;
    const snapshotNode = {
      id: 'node-1',
      containerId: 'c1',
      query: async (sql) => {
        capturedQuery = sql;
        return {rows: snapshotEntries};
      },
    };

    const collector = new LogCollector(tempDir());
    // Seed buffer with live entries first
    const liveNode = buildMockNode(liveEntries);
    await collector.startLiveSubscription(liveNode);

    const result = await collector.collectFinalSnapshot(
      snapshotNode,
    );

    // Returned entries match snapshot
    assert.deepStrictEqual(result, snapshotEntries);

    // Query used correct SQL
    assert.equal(
      capturedQuery,
      'SELECT * FROM logs ORDER BY timestamp',
    );

    // Buffer now contains live + snapshot entries
    const buffer = collector.getBuffer();
    assert.equal(
      buffer.length,
      liveEntries.length + snapshotEntries.length,
    );
    assert.deepStrictEqual(buffer[0], liveEntries[0]);
    assert.deepStrictEqual(buffer[1], snapshotEntries[0]);
    assert.deepStrictEqual(buffer[2], snapshotEntries[1]);
  });

test('startLiveSubscription buffers streamed log entries',
  async (_t) => {
    const initialEntries = [
      {
        node_id: 'node-1',
        level: 'info',
        message: 'initial',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const streamedEntry = {
      node_id: 'node-2',
      level: 'error',
      message: 'streamed',
      timestamp: '2024-01-01T00:00:01Z',
    };

    let streamListener = null;
    let unsubscribed = false;
    const mockNode = {
      id: 'node-1',
      containerId: 'c1',
      query: async () => ({rows: initialEntries}),
      subscribeLogStream: async (listener) => {
        streamListener = listener;
        return () => {
          unsubscribed = true;
        };
      },
      isReachable: async () => true,
    };

    const collector = new LogCollector(tempDir());
    await collector.startLiveSubscription(mockNode);

    assert.equal(typeof streamListener, 'function');
    streamListener(streamedEntry);

    const buffer = collector.getBuffer();
    assert.equal(buffer.length, 2);
    assert.deepStrictEqual(buffer[0], initialEntries[0]);
    assert.deepStrictEqual(buffer[1], {
      ...streamedEntry,
      source: 'live',
    });

    await collector.stopSubscription();
    assert.equal(unsubscribed, true);
  });

/**
 * Unit test: collectFinalSnapshot returns empty when no node
 * Validates: Requirements 7.4
 */
test('collectFinalSnapshot returns empty when no node',
  async (_t) => {
    const collector = new LogCollector(tempDir());
    const result = await collector.collectFinalSnapshot(null);
    assert.deepStrictEqual(result, []);
  });

/**
 * Unit test: collectContainerFallback parses Docker logs
 * Validates: Requirements 7.6
 */
test('collectContainerFallback parses Docker logs',
  async (_t) => {
    const mockDockerProvider = {
      getContainerLogs: async (containerId) => {
        if (containerId === 'c1') {
          return 'Starting node\nListening on port 8081';
        }
        if (containerId === 'c2') {
          return 'Joined cluster\nReady';
        }
        return '';
      },
    };

    const nodes = [
      {id: 'node-1', containerId: 'c1'},
      {id: 'node-2', containerId: 'c2'},
    ];

    const collector = new LogCollector(tempDir());
    await collector.collectContainerFallback(
      mockDockerProvider, nodes,
    );

    const buffer = collector.getBuffer();
    assert.equal(buffer.length, 4);

    // Verify node-1 entries
    assert.equal(buffer[0].node_id, 'node-1');
    assert.equal(buffer[0].message, 'Starting node');
    assert.equal(buffer[0].level, 'info');
    assert.equal(buffer[0].source, 'container');

    assert.equal(buffer[1].node_id, 'node-1');
    assert.equal(buffer[1].message, 'Listening on port 8081');
    assert.equal(buffer[1].source, 'container');

    // Verify node-2 entries
    assert.equal(buffer[2].node_id, 'node-2');
    assert.equal(buffer[2].message, 'Joined cluster');
    assert.equal(buffer[2].source, 'container');

    assert.equal(buffer[3].node_id, 'node-2');
    assert.equal(buffer[3].message, 'Ready');
    assert.equal(buffer[3].source, 'container');
  });

/**
 * Unit test: collectContainerFallback skips unreachable containers
 * Validates: Requirements 7.6
 */
test('collectContainerFallback skips unreachable containers',
  async (_t) => {
    const mockDockerProvider = {
      getContainerLogs: async (containerId) => {
        if (containerId === 'c1') {
          throw new Error('container not found');
        }
        return 'OK line';
      },
    };

    const nodes = [
      {id: 'node-1', containerId: 'c1'},
      {id: 'node-2', containerId: 'c2'},
    ];

    const collector = new LogCollector(tempDir());
    await collector.collectContainerFallback(
      mockDockerProvider, nodes,
    );

    const buffer = collector.getBuffer();
    // Only node-2 entries should be present
    assert.equal(buffer.length, 1);
    assert.equal(buffer[0].node_id, 'node-2');
    assert.equal(buffer[0].message, 'OK line');
  });

/**
 * Unit test: stopSubscription clears internal state
 */
test('stopSubscription clears internal state', async (_t) => {
  const entries = [
    {
      node_id: 'node-1', level: 'info',
      message: 'test', timestamp: '2024-01-01T00:00:00Z',
    },
  ];
  const mockNode = buildMockNode(entries);
  const collector = new LogCollector(tempDir());

  await collector.startLiveSubscription(mockNode, 'level = \'info\'');

  // Subscription is active
  assert.equal(collector._subscriptionActive, true);
  assert.ok(collector._node !== null);
  assert.ok(collector._filter !== null);

  await collector.stopSubscription();

  // State is cleared
  assert.equal(collector._subscriptionActive, false);
  assert.equal(collector._node, null);
  assert.equal(collector._filter, null);
});
