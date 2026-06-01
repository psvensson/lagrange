import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {saveQuest, appendEvent} from '../../scripts/solve/store.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';
import {buildContext, renderContext} from '../../scripts/quest-context.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'context-test-'));
}

const GOAL = {
  id: 'context-quest-test',
  statement: 'rolling-restart passes 3 consecutive harness runs.',
  priority: 1,
  doneWhen: {
    probe: 'scenario-harness',
    args: {scenario: 'rolling-restart', consecutive: 3, metric: 'priority'},
  },
  frontiers: [
    {
      id: 'context-quest-test-main',
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

const sampleReport = {
  timestamp: '2026-06-01T12:52:33.550Z',
  summary: {
    total: 1,
    passed: 0,
    failed: 1,
  },
  optimizationSummary: {
    totalPriorityItems: 2,
  },
  standardSummary: {
    scenarios: [
      {
        scenario: 'rolling-restart',
        current: {
          passed: false,
        },
      },
    ],
  },
  scenarios: [
    {
      scenario: 'rolling-restart',
      passed: false,
    },
  ],
};


tap.test('quest-context newer evidence warning (P2)', async (t) => {
  t.test('warns on unrecorded newer evidence and disappears after ingest', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);

    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});

    // Write a report file
    const reportPath = path.join(reportDir, 'rolling-restart-1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      ...sampleReport,
      timestamp: new Date(Date.now() + 100000).toISOString(),
    }));

    // Record an initial event in the past
    appendEvent(root, goal.id, {
      type: 'quest-declared',
      ts: new Date(Date.now() - 100000).toISOString(),
    });

    // Evaluate context - since report is newer, it should warn!
    const ctx = buildContext(root, {id: goal.id});
    t.ok(ctx.unrecorded, 'unrecorded evidence detected');
    
    const rendered = renderContext(ctx);
    t.match(rendered, /UNRECORDED_EVIDENCE: latest probe evidence is newer than Quest memory/);
    t.match(rendered, /node scripts\/solve\.js ingest-evidence/);

    // Now ingest the evidence!
    ingestEvidence(root, {
      questId: goal.id,
      frontierId: 'context-quest-test-main',
      evidencePath: reportPath,
    });

    // Evaluate context again - warning should be gone!
    const ctx2 = buildContext(root, {id: goal.id});
    t.notOk(ctx2.unrecorded, 'unrecorded evidence warning cleared');

    const rendered2 = renderContext(ctx2);
    t.notMatch(rendered2, /UNRECORDED_EVIDENCE/);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
