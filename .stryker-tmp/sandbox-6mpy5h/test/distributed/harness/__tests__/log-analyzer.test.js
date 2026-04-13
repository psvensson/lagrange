/**
 * Property-based tests for Log Analyzer.
 *
 * Feature: distributed-testing-framework
 *
 * Property 24: Analysis Structure Completeness
 * Validates: Requirements 13.1, 13.9
 *
 * Property 25: Anomaly Pattern Detection
 * Validates: Requirements 13.3, 13.4, 13.5, 13.6, 13.7
 */
// @ts-nocheck


import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {LogAnalyzer} from '../log-analyzer.js';

const LEVELS = ['info', 'warn', 'error'];

const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]+$/, {
  minLength: 6, maxLength: 15,
});

const timestampArb = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2024-12-31T23:59:59Z'),
}).map((d) => d.toISOString());

const logEntryArb = fc.record({
  node_id: nodeIdArb,
  level: fc.constantFrom(...LEVELS),
  message: fc.string({maxLength: 80}),
  timestamp: timestampArb,
});

/**
 * Property 24: Analysis Structure Completeness
 * Validates: Requirements 13.1, 13.9
 *
 * For any set of log entries with mixed levels and node IDs,
 * the Log_Analyzer's analyze() output SHALL contain:
 * - a timeline array sorted by timestamp containing all entries
 * - an errors array containing only error-level entries
 * - a patterns array
 * - a summary with by_level counts matching actual level
 *   distribution and by_node counts matching actual node
 *   distribution
 */
test('Property 24: Analysis Structure Completeness',
  async (t) => {
    await t.test(
      'analyze output has correct structure and counts',
      async () => {
        await fc.assert(
          fc.property(
            fc.array(logEntryArb, {
              minLength: 0, maxLength: 30,
            }),
            (entries) => {
              const analyzer = new LogAnalyzer();
              const queryResults = {
                leaderEvents: [],
                leaderCounts: [],
                errorEntries: [],
              };
              const result = analyzer.analyze(
                entries, queryResults, 5,
              );

              // timeline contains all entries
              assert.equal(
                result.timeline.length, entries.length,
              );

              // timeline is sorted by timestamp
              for (let i = 1; i < result.timeline.length; i++) {
                const prev = result.timeline[i - 1].timestamp;
                const curr = result.timeline[i].timestamp;
                assert.ok(
                  prev <= curr,
                  'timeline not sorted: ' +
                  prev + ' > ' + curr,
                );
              }

              // errors contains only error-level entries
              const expectedErrors = entries.filter(
                (e) => e.level === 'error',
              );
              assert.equal(
                result.errors.length, expectedErrors.length,
              );
              for (const err of result.errors) {
                assert.equal(err.level, 'error');
              }

              // patterns is an array
              assert.ok(Array.isArray(result.patterns));

              // summary structure
              assert.equal(
                result.summary.total_entries, entries.length,
              );

              // by_level counts match actual distribution
              const actualByLevel = {};
              for (const e of entries) {
                const lvl = e.level || 'info';
                actualByLevel[lvl] =
                  (actualByLevel[lvl] || 0) + 1;
              }
              for (const [level, count] of Object.entries(
                actualByLevel,
              )) {
                assert.equal(
                  result.summary.by_level[level], count,
                  'by_level mismatch for ' + level,
                );
              }

              // by_node counts match actual distribution
              const actualByNode = {};
              for (const e of entries) {
                const nid = e.node_id || 'unknown';
                actualByNode[nid] =
                  (actualByNode[nid] || 0) + 1;
              }
              for (const [nodeId, count] of Object.entries(
                actualByNode,
              )) {
                assert.equal(
                  result.summary.by_node[nodeId], count,
                  'by_node mismatch for ' + nodeId,
                );
              }

              // anomaly_count and anomaly_types present
              assert.equal(
                typeof result.summary.anomaly_count, 'number',
              );
              assert.ok(
                Array.isArray(result.summary.anomaly_types),
              );
            },
          ),
          {numRuns: 10},
        );
      },
    );
  });

/**
 * Property 25: Anomaly Pattern Detection
 * Validates: Requirements 13.3, 13.4, 13.5, 13.6, 13.7
 *
 * For any set of log entries containing injected anomaly
 * patterns, the Log_Analyzer SHALL detect and report all
 * present anomaly types in the patterns array with correct
 * type labels and relevant details.
 */
test('Property 25: Anomaly Pattern Detection', async (t) => {
  await t.test(
    'detects split-brain when two nodes claim same ' +
    'partition at same timestamp',
    async () => {
      await fc.assert(
        fc.property(
          fc.stringMatching(/^p-[a-z0-9]+$/, {
            minLength: 3, maxLength: 10,
          }),
          nodeIdArb,
          nodeIdArb,
          timestampArb,
          (partitionId, nodeA, nodeB, ts) => {
            if (nodeA === nodeB) return;
            const analyzer = new LogAnalyzer();
            const leaderEvents = [
              {
                partition_id: partitionId,
                node_id: nodeA,
                timestamp: ts,
              },
              {
                partition_id: partitionId,
                node_id: nodeB,
                timestamp: ts,
              },
            ];
            const patterns =
              analyzer.detectSplitBrain(leaderEvents);
            assert.ok(
              patterns.length > 0,
              'should detect split-brain',
            );
            assert.equal(patterns[0].type, 'split_brain');
            assert.equal(patterns[0].severity, 'critical');
            assert.equal(
              patterns[0].details.partition_id, partitionId,
            );
            assert.ok(
              patterns[0].details.nodes.includes(nodeA),
            );
            assert.ok(
              patterns[0].details.nodes.includes(nodeB),
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'detects election storms when leader changes exceed ' +
    'partitionCount * 4',
    async () => {
      await fc.assert(
        fc.property(
          fc.integer({min: 1, max: 20}),
          fc.stringMatching(/^p-[a-z0-9]+$/, {
            minLength: 3, maxLength: 10,
          }),
          (partitionCount, partitionId) => {
            const analyzer = new LogAnalyzer();
            const threshold = partitionCount * 4;
            const excessCount = threshold + 1;
            const leaderCounts = [
              {
                partition_id: partitionId,
                node_id: 'node-a',
                count: excessCount,
              },
            ];
            const patterns = analyzer.detectElectionStorms(
              leaderCounts, partitionCount,
            );
            assert.ok(
              patterns.length > 0,
              'should detect election storm',
            );
            assert.equal(
              patterns[0].type, 'election_storm',
            );
            assert.equal(
              patterns[0].details.partition_id, partitionId,
            );
            assert.equal(
              patterns[0].details.leader_changes, excessCount,
            );
            assert.equal(
              patterns[0].details.threshold, threshold,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'detects stuck rebalancing when operation has start ' +
    'but no complete',
    async () => {
      await fc.assert(
        fc.property(
          fc.stringMatching(/^op-[a-z0-9]+$/, {
            minLength: 4, maxLength: 12,
          }),
          timestampArb,
          (opId, ts) => {
            const analyzer = new LogAnalyzer();
            const logEntries = [
              {
                node_id: 'node-1',
                level: 'info',
                message: 'rebalance start operation_id=' +
                  opId,
                timestamp: ts,
              },
            ];
            const patterns =
              analyzer.detectStuckRebalancing(logEntries);
            assert.ok(
              patterns.length > 0,
              'should detect stuck rebalancing',
            );
            assert.equal(
              patterns[0].type, 'stuck_rebalancing',
            );
            assert.equal(
              patterns[0].details.operation_id, opId,
            );
            assert.equal(
              patterns[0].details.duration_ms, null,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'detects message delivery failures when routing errors ' +
    'to same address >= 3',
    async () => {
      await fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z0-9.]+:\d+$/, {
            minLength: 5, maxLength: 20,
          }),
          fc.integer({min: 3, max: 10}),
          (address, count) => {
            const analyzer = new LogAnalyzer();
            const errorEntries = [];
            for (let i = 0; i < count; i++) {
              errorEntries.push({
                node_id: 'node-1',
                level: 'error',
                message: 'routing error address=' + address,
                timestamp: new Date(
                  Date.now() + i * 1000,
                ).toISOString(),
              });
            }
            const patterns =
              analyzer.detectMessageDeliveryFailures(
                errorEntries,
              );
            assert.ok(
              patterns.length > 0,
              'should detect delivery failures',
            );
            assert.equal(
              patterns[0].type,
              'message_delivery_failure',
            );
            assert.equal(
              patterns[0].details.address, address,
            );
            assert.equal(
              patterns[0].details.error_count, count,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'detects CDC delays when delay exceeds threshold',
    async () => {
      await fc.assert(
        fc.property(
          fc.integer({min: 5001, max: 60000}),
          nodeIdArb,
          timestampArb,
          (delayMs, nodeId, ts) => {
            const analyzer = new LogAnalyzer();
            const logEntries = [
              {
                node_id: nodeId,
                level: 'warn',
                message: 'cdc propagation delay=' + delayMs,
                timestamp: ts,
              },
            ];
            const patterns =
              analyzer.detectCDCDelays(logEntries);
            assert.ok(
              patterns.length > 0,
              'should detect CDC delay',
            );
            assert.equal(patterns[0].type, 'cdc_delay');
            assert.equal(
              patterns[0].details.delay_ms, delayMs,
            );
            assert.equal(
              patterns[0].details.node_id, nodeId,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

// --- Unit Tests for Log Analyzer (Task 10A.3) ---

/**
 * Unit tests for LogAnalyzer.
 *
 * Validates: Requirements 13.3, 13.4, 13.5, 13.8, 13.9
 */

test('split-brain: detects overlapping leader claims ' +
  '(Req 13.3)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const leaderEvents = [
    {
      partition_id: 'partition-1',
      node_id: 'node-alpha',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
    {
      partition_id: 'partition-1',
      node_id: 'node-beta',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
  ];

  const patterns =
    analyzer.detectSplitBrain(leaderEvents);

  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].type, 'split_brain');
  assert.equal(patterns[0].severity, 'critical');
  assert.equal(
    patterns[0].details.partition_id, 'partition-1',
  );
  assert.ok(
    patterns[0].details.nodes.includes('node-alpha'),
  );
  assert.ok(
    patterns[0].details.nodes.includes('node-beta'),
  );
});

test('split-brain: no flag when same node claims ' +
  'same partition (Req 13.3)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const leaderEvents = [
    {
      partition_id: 'partition-1',
      node_id: 'node-alpha',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
    {
      partition_id: 'partition-1',
      node_id: 'node-alpha',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
  ];

  const patterns =
    analyzer.detectSplitBrain(leaderEvents);

  assert.equal(patterns.length, 0);
});

test('split-brain: no flag when different nodes claim ' +
  'at different timestamps (Req 13.3)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const leaderEvents = [
    {
      partition_id: 'partition-1',
      node_id: 'node-alpha',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
    {
      partition_id: 'partition-1',
      node_id: 'node-beta',
      timestamp: '2024-06-15T12:00:01.000Z',
    },
  ];

  const patterns =
    analyzer.detectSplitBrain(leaderEvents);

  assert.equal(patterns.length, 0);
});

test('election storm: no trigger at exact threshold ' +
  '(Req 13.4)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const partitionCount = 5;
  const leaderCounts = [
    {
      partition_id: 'partition-1',
      node_id: 'node-a',
      count: 20,
    },
  ];

  const patterns = analyzer.detectElectionStorms(
    leaderCounts, partitionCount,
  );

  assert.equal(
    patterns.length, 0,
    'exactly at threshold should not trigger',
  );
});

test('election storm: triggers at threshold + 1 ' +
  '(Req 13.4)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const partitionCount = 5;
  const leaderCounts = [
    {
      partition_id: 'partition-1',
      node_id: 'node-a',
      count: 21,
    },
  ];

  const patterns = analyzer.detectElectionStorms(
    leaderCounts, partitionCount,
  );

  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].type, 'election_storm');
  assert.equal(patterns[0].severity, 'warning');
  assert.equal(
    patterns[0].details.partition_id, 'partition-1',
  );
  assert.equal(
    patterns[0].details.leader_changes, 21,
  );
  assert.equal(patterns[0].details.threshold, 20);
});

test('election storm: no trigger below threshold ' +
  '(Req 13.4)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const partitionCount = 5;
  const leaderCounts = [
    {
      partition_id: 'partition-1',
      node_id: 'node-a',
      count: 10,
    },
  ];

  const patterns = analyzer.detectElectionStorms(
    leaderCounts, partitionCount,
  );

  assert.equal(patterns.length, 0);
});

test('stuck rebalancing: flags start with no complete ' +
  '(Req 13.5)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const logEntries = [
    {
      node_id: 'node-1',
      level: 'info',
      message: 'rebalance start operation_id=op-abc123',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
  ];

  const patterns =
    analyzer.detectStuckRebalancing(logEntries);

  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].type, 'stuck_rebalancing');
  assert.equal(
    patterns[0].details.operation_id, 'op-abc123',
  );
  assert.equal(patterns[0].details.duration_ms, null);
});

test('stuck rebalancing: no flag when completed within ' +
  'timeout (Req 13.5)', async (_t) => {
  const analyzer = new LogAnalyzer(undefined, {
    stuckRebalanceTimeoutMs: 60000,
  });
  const logEntries = [
    {
      node_id: 'node-1',
      level: 'info',
      message: 'rebalance start operation_id=op-fast',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
    {
      node_id: 'node-1',
      level: 'info',
      message: 'rebalance complete operation_id=op-fast',
      timestamp: '2024-06-15T12:00:05.000Z',
    },
  ];

  const patterns =
    analyzer.detectStuckRebalancing(logEntries);

  assert.equal(
    patterns.length, 0,
    'completed within timeout should not flag',
  );
});

test('analyze: returns correct top-level structure ' +
  '(Req 13.8, 13.9)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const logEntries = [
    {
      node_id: 'node-1',
      level: 'info',
      message: '[raft] leader elected',
      timestamp: '2024-06-15T12:00:00.000Z',
    },
    {
      node_id: 'node-2',
      level: 'error',
      message: '[query] timeout',
      timestamp: '2024-06-15T12:00:01.000Z',
    },
    {
      node_id: 'node-1',
      level: 'warn',
      message: '[rebalancer] slow operation',
      timestamp: '2024-06-15T12:00:02.000Z',
    },
  ];
  const queryResults = {
    leaderEvents: [],
    leaderCounts: [],
    errorEntries: [],
  };

  const result = analyzer.analyze(
    logEntries, queryResults, 5,
  );

  // Top-level keys
  assert.ok(Array.isArray(result.timeline));
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.patterns));
  assert.equal(typeof result.summary, 'object');

  // Timeline sorted and complete
  assert.equal(result.timeline.length, 3);
  assert.ok(
    result.timeline[0].timestamp <=
    result.timeline[1].timestamp,
  );

  // Errors filtered correctly
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].level, 'error');

  // Summary structure
  assert.equal(result.summary.total_entries, 3);
  assert.equal(result.summary.by_level.info, 1);
  assert.equal(result.summary.by_level.error, 1);
  assert.equal(result.summary.by_level.warn, 1);
  assert.equal(result.summary.by_node['node-1'], 2);
  assert.equal(result.summary.by_node['node-2'], 1);
  assert.equal(
    typeof result.summary.by_subsystem, 'object',
  );
  assert.equal(
    typeof result.summary.anomaly_count, 'number',
  );
  assert.ok(
    Array.isArray(result.summary.anomaly_types),
  );
});

test('analyze: empty entries returns valid structure ' +
  '(Req 13.8, 13.9)', async (_t) => {
  const analyzer = new LogAnalyzer();
  const queryResults = {
    leaderEvents: [],
    leaderCounts: [],
    errorEntries: [],
  };

  const result = analyzer.analyze([], queryResults, 5);

  assert.equal(result.timeline.length, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.patterns.length, 0);
  assert.equal(result.summary.total_entries, 0);
  assert.equal(result.summary.anomaly_count, 0);
  assert.deepEqual(result.summary.anomaly_types, []);
});
