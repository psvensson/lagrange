import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {analyzeQuestHealth, renderHealth} from '../../scripts/solve/health.js';
import {appendEvent, saveQuest} from '../../scripts/solve/store.js';
import {
  EVENT_ATTEMPT,
  EVENT_EVIDENCE_INGESTED,
  EVENT_PARK,
  EVENT_THEORY_OPTION_DECLARED,
  EVENT_THEORY_SELECTED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-health-'));
}

tap.test('Quest health', async (t) => {
  t.test('flags live-probe divergence and theory-required signals', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_ATTEMPT,
      frontier: 'demo-main',
      rung: 'model',
      rungIndex: 3,
      prevRungIndex: 2,
      metricBefore: 2,
      metricAfter: 0,
      metricDirection: 'lower-is-better',
      evidence: oracle,
      changeRef: 'diff:x',
    });

    const health = analyzeQuestHealth(root, quest);
    t.same(
      health.signals.map((signal) => signal.type).sort(),
      [
        'fresh-evidence-unrecorded',
        'frontier-theory-required',
        'live-probe-diverges-from-projection',
        'metric-zero-but-done-false',
        'system-theory-required',
      ].sort(),
    );
    t.match(renderHealth(health), /system-theory-required/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('reports no actionable frontier when all frontiers are parked', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_PARK,
      frontier: 'demo-main',
      reason: 'ladder exhausted without metric movement',
      finalMetric: 1,
    });

    const health = analyzeQuestHealth(root, quest);
    t.equal(health.frontier, null);
    t.match(health.nextAction, /No open frontier remains/);
    t.match(renderHealth(health), /frontier: none/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('repeated owner/boundary reports require system theory and emit signals', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);

    // Ingest two reports with identical owner/boundary liveness failures
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      owner: 'operation_workflow_owner',
      boundary: 'rebalancer_handoff',
      dominantReason: 'retry_scheduled',
    });
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r2.json',
      owner: 'operation_workflow_owner',
      boundary: 'rebalancer_handoff',
      dominantReason: 'retry_scheduled',
    });

    const health = analyzeQuestHealth(root, quest);
    const signalTypes = health.signals.map((s) => s.type);
    t.ok(signalTypes.includes('same-owner-boundary-repeat'), 'emits same-owner-boundary-repeat');
    t.ok(signalTypes.includes('same-dominant-reason-repeat'), 'emits same-dominant-reason-repeat');
    t.ok(health.needs.systemTheoryRequired, 'system theory is now required');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('metric zero but done false emits signal and requires theory result', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);

    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 0,
      done: false,
    });

    const health = analyzeQuestHealth(root, quest);
    const signalTypes = health.signals.map((s) => s.type);
    t.ok(signalTypes.includes('metric-zero-but-done-false'), 'emits metric-zero-but-done-false');
    t.notMatch(health.nextAction, /consecutive proof/,
      'single-run goals do not override next action');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('metric zero streak goals route to consecutive proof from doneWhen args', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Prove three clean runs.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle, consecutive: 3}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);

    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 0,
      done: false,
    });

    const health = analyzeQuestHealth(root, quest);
    t.match(health.nextAction, /run the 3-run consecutive proof for demo-main/);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('fresh owner movement marks selected theory stale', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    appendEvent(root, quest.id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 1,
      done: false,
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'snapshot_coverage=1/5',
    });
    appendEvent(root, quest.id, {
      type: EVENT_THEORY_OPTION_DECLARED,
      frontier: 'demo-main',
      theory: 'theory-snapshot',
      scope: 'frontier',
      status: 'active',
      layer: 'ownership',
      mechanism: 'snapshot_coverage',
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
    });
    appendEvent(root, quest.id, {
      type: EVENT_THEORY_SELECTED,
      frontier: 'demo-main',
      theory: 'theory-snapshot',
    });
    appendEvent(root, quest.id, {
      type: EVENT_EVIDENCE_INGESTED,
      frontier: 'demo-main',
      evidence: 'r2.json',
      metric: 1,
      done: false,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      dominantReason: 'priority_spread_pending',
    });

    const health = analyzeQuestHealth(root, quest);
    t.ok(
      health.signals.some((signal) => signal.type === 'selected-theory-stale'),
      'stale selected theory signal emitted',
    );
    t.equal(health.currentBlocker.owner, 'operation_workflow_owner');
    t.match(health.nextAction, /fresh frontier theory/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('broad mixed runtime and harness diff emits scope pressure', (t) => {
    const root = tmp();
    const oracle = path.join(root, 'oracle.json');
    fs.writeFileSync(oracle, JSON.stringify({metric: 1, target: 0}));
    const quest = {
      id: 'demo',
      statement: 'Drive metric to zero.',
      priority: 1,
      doneWhen: {probe: 'oracle', args: {file: oracle}},
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {probe: 'oracle', args: {file: oracle}}},
      ],
    };
    saveQuest(root, quest);
    const diffPath = path.join(root, 'solve', 'changes', 'demo', 'broad.diff');
    fs.mkdirSync(path.dirname(diffPath), {recursive: true});
    fs.writeFileSync(diffPath, [
      'diff --git a/src/admin/a.js b/src/admin/a.js',
      '--- a/src/admin/a.js',
      '+++ b/src/admin/a.js',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/src/bootstrap/b.js b/src/bootstrap/b.js',
      '--- a/src/bootstrap/b.js',
      '+++ b/src/bootstrap/b.js',
      '@@ -1 +1 @@',
      '-a',
      '+b',
      'diff --git a/test/distributed/harness/c.js b/test/distributed/harness/c.js',
      '--- a/test/distributed/harness/c.js',
      '+++ b/test/distributed/harness/c.js',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n'));
    appendEvent(root, quest.id, {
      type: EVENT_ATTEMPT,
      frontier: 'demo-main',
      changeRef: `diff:${diffPath}`,
      metricBefore: 1,
      metricAfter: 1,
    });

    const health = analyzeQuestHealth(root, quest);
    const signalTypes = health.signals.map((signal) => signal.type);
    t.ok(signalTypes.includes('broad-source-scope'), 'broad source scope emitted');
    t.ok(signalTypes.includes('mixed-runtime-and-harness'), 'runtime+harness emitted');
    t.equal(health.scopePressure.changedPaths.length, 3);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
