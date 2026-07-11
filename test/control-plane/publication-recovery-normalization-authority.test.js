import fs from 'node:fs';

import {cruise} from 'dependency-cruiser';
import {test} from '../../src/test-helpers/tap.js';
import {
  normalizeDistinctStringArray,
} from '../../src/control-plane/publication-recovery-evidence-values.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  buildPrioritySpreadDecision,
} from '../../src/control-plane/publication-recovery-priority-spread.js';
import {
  buildPendingAckEvidence,
} from '../../src/control-plane/publication-recovery-stream-evidence.js';

const GUARD_IDS = Object.freeze([
  'canonical-normalizer-frozen-insertion-order',
  'stream-gate-priority-spread-live-consumers',
  'single-declaration-no-stream-alias-no-cycle',
]);

test('canonical normalizer freezes trimmed insertion-order distinct values', (t) => {
  const normalized = normalizeDistinctStringArray([
    ' node-b ', 'node-a', 'node-b', '', '   ', null, undefined,
  ]);
  t.same(normalized, ['node-b', 'node-a']);
  t.ok(Object.isFrozen(normalized));
  const nonArray = normalizeDistinctStringArray('node-a');
  t.same(nonArray, []);
  t.ok(Object.isFrozen(nonArray));
  t.end();
});

test('stream, gate, and priority-spread consumers retain normalized behavior', (t) => {
  const pendingAck = buildPendingAckEvidence({
    requiredAckNodeIds: [' node-b ', 'node-a', 'node-b'],
    acknowledgedNodeIds: ['node-a', ''],
  });
  t.same(pendingAck.requiredAckNodeIds, ['node-b', 'node-a']);
  t.same(pendingAck.acknowledgedNodeIds, ['node-a']);
  t.same(pendingAck.pendingAckNodeIds, ['node-b']);
  t.ok(Object.isFrozen(pendingAck.requiredAckNodeIds));

  const gate = buildPublicationRecoveryGateSnapshot({
    reasonCodes: [
      'priority_partitions_not_spread',
      'priority_partitions_not_spread',
    ],
    priorityPartitionSummary: {
      blockedPartitionCount: 1,
      largestSpreadGap: 1,
      totalSpreadGap: 1,
      missingPartitionIds: [' partition-a ', 'partition-a'],
    },
  });
  t.same(gate.reasonCodes, ['priority_partitions_not_spread']);

  const prioritySpread = buildPrioritySpreadDecision({
    priorityPartitionSummary: {
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
      missingPartitionIds: ['', '  '],
      blockedPartitions: [],
    },
  });
  t.equal(prioritySpread.prioritySpreadPending, false);
  t.end();
});

test('one evidence-values declaration feeds every consumer without a cycle',
  async (t) => {
    const values = fs.readFileSync(
      'src/control-plane/publication-recovery-evidence-values.js', 'utf8');
    const stream = fs.readFileSync(
      'src/control-plane/publication-recovery-stream-evidence.js', 'utf8');
    const gate = fs.readFileSync(
      'src/control-plane/publication-recovery-gate.js', 'utf8');
    const prioritySpread = fs.readFileSync(
      'src/control-plane/publication-recovery-priority-spread.js', 'utf8');
    t.equal([...values.matchAll(
      /function\s+normalizeDistinctStringArray\b/gu)].length, 1);
    t.notMatch(stream, /function\s+normalizeDistinctStringArray\b/u);
    t.notMatch(stream,
      /export\s*\{[\s\S]*?normalizeDistinctStringArray[\s\S]*?\}/u);
    for (const source of [stream, gate, prioritySpread]) {
      t.match(source,
        /normalizeDistinctStringArray[\s\S]*?from '\.\/publication-recovery-evidence-values\.js'/u);
    }
    for (const source of [gate, prioritySpread]) {
      const streamImport = [...source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/gu,
      )].find((match) =>
        match[2] === './publication-recovery-stream-evidence.js');
      t.notMatch(streamImport?.[1] || '', /normalizeDistinctStringArray/u);
    }
    const graph = await cruise([
      'src/control-plane/publication-recovery-gate.js',
      'src/control-plane/publication-recovery-priority-spread.js',
      'src/control-plane/publication-recovery-stream-evidence.js',
    ], {
      baseDir: process.cwd(),
      exclude: 'node_modules',
      doNotFollow: {path: 'node_modules'},
    });
    t.equal(graph.output.summary.error, 0);
    t.notOk(graph.output.modules.some((module) =>
      module.dependencies.some((dependency) => dependency.circular)));
    t.same(GUARD_IDS, [
      'canonical-normalizer-frozen-insertion-order',
      'stream-gate-priority-spread-live-consumers',
      'single-declaration-no-stream-alias-no-cycle',
    ]);
  });
