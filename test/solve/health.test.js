import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {analyzeQuestHealth, renderHealth} from '../../scripts/solve/health.js';
import {appendEvent, saveQuest} from '../../scripts/solve/store.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';
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
        'fresh-closure-evidence-unrecorded',
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

  t.test('does not compare closure metric to a different frontier metric identity', (t) => {
    const root = tmp();
    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const report = path.join(reportDir, 'rr.report.json');
    fs.writeFileSync(report, JSON.stringify({
      timestamp: '2026-06-04T10:00:00.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 1},
      scenarios: [{
        scenario: 'rr',
        passed: false,
        priorityRecoveryInvariants: {
          invariants: [{id: 'publication_converged', passed: false}],
        },
      }],
    }));
    const quest = {
      id: 'demo',
      statement: 'Prove three clean rr runs.',
      priority: 1,
      doneWhen: {
        probe: 'scenario-harness',
        args: {scenario: 'rr', reportDir, consecutive: 3, metric: 'priority'},
      },
      frontiers: [
        {id: 'demo-main', priority: 1,
          metric: {
            probe: 'scenario-harness',
            args: {scenario: 'rr', reportDir, metric: 'distance'},
          }},
      ],
    };
    saveQuest(root, quest);
    ingestEvidence(root, {
      questId: quest.id,
      frontierId: 'demo-main',
      evidencePath: report,
    });

    const health = analyzeQuestHealth(root, quest);
    t.notOk(
      health.signals.some((signal) =>
        signal.type === 'live-probe-diverges-from-projection'),
      'frontier distance projection is compared only with live distance',
    );
    t.equal(health.projectionFreshness.frontier.fresh, true);
    t.equal(health.projectionFreshness.closure.fresh, false);

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

  t.test('rr-G: a run of non-measuring samples parks via blocked-measurement', (t) => {
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
    for (let i = 0; i < 3; i += 1) {
      appendEvent(root, quest.id, {
        type: EVENT_ATTEMPT,
        frontier: 'demo-main',
        invalidSample: true,
        metricBefore: null,
        metricAfter: null,
        verdictReason: 'harness_connectivity_or_system_failure',
        changeRef: 'diff:x',
      });
    }

    const health = analyzeQuestHealth(root, quest);
    const cannotMeasure = health.signals.find(
      (signal) => signal.type === 'cannot-measure');
    t.ok(cannotMeasure, 'emits a cannot-measure signal');
    t.match(cannotMeasure.mechanism, /non-measuring/, 'mechanism names the cause');
    t.match(health.nextAction, /fix the measurement harness/, 'next action says fix harness');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

tap.test('rr-H: quest chain depth signal', async (t) => {
  function chainQuest(root, id, parentQuest) {
    const quest = {
      id,
      statement: `Live residual ${id}.`,
      priority: 1,
      links: parentQuest ? {parentQuest} : {},
      doneWhen: {probe: 'scenario-harness',
        args: {scenario: 'movielens-live', consecutive: 1, metric: 'priority'}},
      frontiers: [
        {id: `${id}-main`, priority: 1,
          metric: {probe: 'scenario-harness',
            args: {scenario: 'movielens-live', consecutive: 1, metric: 'priority'}}},
      ],
    };
    saveQuest(root, quest);
    return quest;
  }

  t.test('a budget-deep same-scenario parent chain raises the signal', (t) => {
    const root = tmp();
    chainQuest(root, 'chain-a', null);
    chainQuest(root, 'chain-b', 'chain-a');
    chainQuest(root, 'chain-c', 'chain-b');
    const head = chainQuest(root, 'chain-d', 'chain-c');
    const health = analyzeQuestHealth(root, head);
    const signal = health.signals.find((item) => item.type === 'quest-chain-depth');
    t.ok(signal, 'the chain-depth signal fires at the budget');
    t.match(signal.mechanism, /chain-d -> chain-c -> chain-b -> chain-a/u,
      'the mechanism names the chain head-first');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a below-budget chain stays quiet', (t) => {
    const root = tmp();
    chainQuest(root, 'chain-a', null);
    chainQuest(root, 'chain-b', 'chain-a');
    const head = chainQuest(root, 'chain-c', 'chain-b');
    const health = analyzeQuestHealth(root, head);
    t.notOk(health.signals.some((item) => item.type === 'quest-chain-depth'),
      'three links stay below the budget of four');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a parent on a different scenario breaks the chain', (t) => {
    const root = tmp();
    chainQuest(root, 'chain-a', null);
    chainQuest(root, 'chain-b', 'chain-a');
    chainQuest(root, 'chain-c', 'chain-b');
    const other = {
      id: 'chain-mid',
      statement: 'Different gate.',
      priority: 1,
      links: {parentQuest: 'chain-c'},
      doneWhen: {probe: 'scenario-harness',
        args: {scenario: 'another-scenario', consecutive: 1, metric: 'priority'}},
      frontiers: [{id: 'chain-mid-main', priority: 1,
        metric: {probe: 'scenario-harness',
          args: {scenario: 'another-scenario', consecutive: 1, metric: 'priority'}}}],
    };
    saveQuest(root, other);
    const head = chainQuest(root, 'chain-e', 'chain-mid');
    const health = analyzeQuestHealth(root, head);
    t.notOk(health.signals.some((item) => item.type === 'quest-chain-depth'),
      'a different artifact class in the ancestry resets the count');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
