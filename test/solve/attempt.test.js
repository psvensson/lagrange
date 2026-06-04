import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent, readLog} from '../../scripts/solve/store.js';
import {runAttemptCommand} from '../../scripts/solve/attempt.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'attempt-test-'));
}

function makeDiff(root, questId, name) {
  const file = path.join(root, 'solve', 'changes', questId, `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/src/attempt.js b/src/attempt.js',
    '--- a/src/attempt.js',
    '+++ b/src/attempt.js',
    '@@ -1 +1 @@',
    `-${name} before`,
    `+${name} after`,
  ].join('\n'));
  return `diff:${file}`;
}

const GOAL = {
  id: 'attempt-quest-test',
  statement: 'rolling-restart passes 3 consecutive harness runs.',
  priority: 1,
  doneWhen: {
    probe: 'scenario-harness',
    args: {scenario: 'rolling-restart', consecutive: 3, metric: 'priority'},
  },
  frontiers: [
    {
      id: 'attempt-quest-test-main',
      priority: 1,
      metric: {probe: 'scenario-harness', args: {scenario: 'rolling-restart', metric: 'priority'}},
    },
  ],
};

function getGoal(root) {
  const reportDir = path.join(root, 'test-output', 'reports');
  return {
    ...GOAL,
    doneWhen: {
      ...GOAL.doneWhen,
      args: {
        ...GOAL.doneWhen.args,
        reportDir,
      },
    },
    frontiers: GOAL.frontiers.map((f) => ({
      ...f,
      metric: {
        ...f.metric,
        args: {
          ...f.metric.args,
          reportDir,
        },
      },
    })),
  };
}

tap.test('attempt wrapper (P2)', async (t) => {
  t.test('runs harness, records attempt, and ingests report automatically', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);

    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});

    // Write initial dummy report for before metric
    const reportPath = path.join(reportDir, 'rolling-restart-core-stability-1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: '2026-06-01T12:00:00.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 5},
      standardSummary: {
        scenarios: [{scenario: 'rolling-restart', current: {passed: false}}],
      },
      scenarios: [{scenario: 'rolling-restart', passed: false}],
    }));

    // Record system & frontier theory and select it to satisfy start requirements
    appendEvent(root, goal.id, {
      type: 'theory-option-declared',
      theory: 't1',
      frontier: 'attempt-quest-test-main',
      scope: 'frontier',
      status: 'active',
      layer: 'observation',
      mechanism: 'observation_gap',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected',
      frontier: 'attempt-quest-test-main',
      theory: 't1',
    });

    // Write a mock harness script file to disk to execute cleanly
    const newReportPath = path.join(reportDir, 'rolling-restart-core-stability-2.report.json');
    const cwdPath = path.join(root, 'harness-cwd.txt');
    const mockHarnessScript = path.join(root, 'mock-harness.js');
    fs.writeFileSync(mockHarnessScript, `
      const fs = require('fs');
      fs.writeFileSync('${cwdPath.replace(/\\/g, '\\\\')}', process.cwd());
      fs.writeFileSync('${newReportPath.replace(/\\/g, '\\\\')}', JSON.stringify({
        timestamp: '2026-06-01T13:00:00.000Z',
        summary: { total: 1, passed: 0, failed: 1 },
        optimizationSummary: { totalPriorityItems: 2 },
        standardSummary: {
          scenarios: [{ scenario: 'rolling-restart', current: { passed: false } }]
        },
        scenarios: [{
          scenario: 'rolling-restart',
          passed: false,
          details: {
            diagnostics: {
              failure: {
                rootCauseClass: 'topology',
                dominantReason: 'x',
                ownerContract: {
                  frontierWitnesses: [{ owner: 'operation_workflow_owner', boundary: 'rebalancer_handoff' }]
                }
              }
            }
          }
        }]
      }));
    `);

    const harnessCommand = ['node', mockHarnessScript];

    const outcome = runAttemptCommand(root, {
      id: goal.id,
      frontier: 'attempt-quest-test-main',
      name: 'test-attempt',
      changeRef: makeDiff(root, goal.id, 'a'),
      summary: 'hypothesis check',
      _: harnessCommand,
    });

    t.equal(outcome.before, 5, 'before metric measured correctly');
    t.equal(outcome.after, 2, 'after metric measured correctly');
    t.equal(fs.readFileSync(cwdPath, 'utf8'), root, 'harness ran from repo root');

    const log = readLog(root, goal.id);
    const attemptEvent = log.find((e) => e.type === 'attempt');
    t.ok(attemptEvent, 'attempt event recorded');
    t.equal(attemptEvent.metricBefore, 5);
    t.equal(attemptEvent.metricAfter, 2);

    const ingestEvent = log.find((e) => e.type === 'evidence-ingested');
    t.ok(ingestEvent, 'report ingested automatically');
    t.equal(ingestEvent.metric, 2);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('blocks when theory requirement is missing', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);

    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});

    const reportPath = path.join(reportDir, 'rolling-restart-core-stability-1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: '2026-06-01T12:00:00.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 5},
      standardSummary: {
        scenarios: [{scenario: 'rolling-restart', current: {passed: false}}],
      },
      scenarios: [{scenario: 'rolling-restart', passed: false}],
    }));

    // Record a flat attempt whose stored rungIndex advances the next attempt to
    // rung 2 (widen-scope, where a frontier theory is required)
    appendEvent(root, goal.id, {
      type: 'attempt',
      frontier: 'attempt-quest-test-main',
      rung: 'widen-scope',
      rungIndex: 2,
      metricBefore: 5,
      metricAfter: 5,
      changeRef: makeDiff(root, goal.id, 'x'),
    });

    // We do NOT declare/select a theory for the widen-scope rung, so it must throw!
    t.throws(() => {
      runAttemptCommand(root, {
        id: goal.id,
        frontier: 'attempt-quest-test-main',
        name: 'test-attempt',
        changeRef: makeDiff(root, goal.id, 'a'),
        summary: 'hypothesis check',
        _: ['node', '-e', 'console.log()'],
      });
    }, /theory gate failed/, 'throws on missing theory at rung');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('blocks model-rung execution before running harness without model evidence', (t) => {
    const root = tmp();
    const goal = {
      ...getGoal(root),
      statement: 'lifecycle owner-boundary model contract needs proof.',
    };
    saveQuest(root, goal);

    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});
    const reportPath = path.join(reportDir, 'rolling-restart-core-stability-1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: '2026-06-01T12:00:00.000Z',
      summary: {total: 1, passed: 0, failed: 1},
      optimizationSummary: {totalPriorityItems: 5},
      standardSummary: {
        scenarios: [{scenario: 'rolling-restart', current: {passed: false}}],
      },
      scenarios: [{scenario: 'rolling-restart', passed: false}],
    }));
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'attempt-quest-test-main',
      evidencePath: reportPath,
    });

    appendEvent(root, goal.id, {
      type: 'attempt',
      frontier: 'attempt-quest-test-main',
      rung: 'model',
      rungIndex: 3,
      metricBefore: 5,
      metricAfter: 5,
      changeRef: makeDiff(root, goal.id, 'model-seed'),
    });
    appendEvent(root, goal.id, {
      type: 'theory-system-declared',
      theory: 'system-theory',
      scope: 'system',
      status: 'active',
      mechanism: 'lifecycle_model',
    });
    appendEvent(root, goal.id, {
      type: 'theory-option-declared',
      theory: 'frontier-theory',
      frontier: 'attempt-quest-test-main',
      scope: 'frontier',
      status: 'active',
      layer: 'model',
      mechanism: 'lifecycle_model',
    });
    appendEvent(root, goal.id, {
      type: 'theory-selected',
      frontier: 'attempt-quest-test-main',
      theory: 'frontier-theory',
    });

    const marker = path.join(root, 'harness-ran.txt');
    const mockHarnessScript = path.join(root, 'mock-harness.js');
    fs.writeFileSync(mockHarnessScript, `
      require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran');
    `);

    t.throws(() => {
      runAttemptCommand(root, {
        id: goal.id,
        frontier: 'attempt-quest-test-main',
        name: 'model-block',
        changeRef: makeDiff(root, goal.id, 'blocked'),
        summary: 'should not run',
        _: ['node', mockHarnessScript],
      });
    }, /model evidence required/u);
    t.equal(fs.existsSync(marker), false, 'harness did not run');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
