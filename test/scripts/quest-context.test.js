import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  appendEvent,
  projectState,
  readLog,
  saveQuest,
} from '../../scripts/solve/store.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';
import {buildContext, renderContext} from '../../scripts/quest-context.js';
import {runTheoryCommand} from '../../scripts/solve/theory.js';

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

function oracleQuest(id, statement) {
  return {
    id,
    statement,
    priority: 1,
    doneWhen: {
      probe: 'oracle',
      args: {file: `solve/oracle/${id}.json`},
    },
    frontiers: [
      {
        id: `${id}-main`,
        priority: 1,
        metric: {
          probe: 'oracle',
          args: {file: `solve/oracle/${id}.json`},
        },
      },
    ],
  };
}

function writeOracle(root, id) {
  const oracleDir = path.join(root, 'solve', 'oracle');
  fs.mkdirSync(oracleDir, {recursive: true});
  fs.writeFileSync(path.join(oracleDir, `${id}.json`), JSON.stringify({
    metric: 1,
    target: 0,
    done: false,
  }));
}


tap.test('quest-context newer evidence warning (P2)', async (t) => {
  t.test('warns on unrecorded newer evidence and keeps handoff guidance after ingest', (t) => {
    const root = tmp();
    const goal = getGoal(root);
    saveQuest(root, goal);

    const reportDir = path.join(root, 'test-output', 'reports');
    fs.mkdirSync(reportDir, {recursive: true});

    // Write a report file
    const reportPath = path.join(reportDir, 'rolling-restart-1.report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      ...sampleReport,
      timestamp: new Date().toISOString(),
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

    // Evaluate context again - warning remains until a supervised step records it.
    const ctx2 = buildContext(root, {id: goal.id});
    t.ok(ctx2.unrecorded, 'unrecorded evidence warning remains visible');

    const rendered2 = renderContext(ctx2);
    t.match(rendered2, /fresh-closure-evidence-unrecorded/);
    t.match(rendered2, /## Git Handoff/u);
    t.match(rendered2, /## Source Change Verification/u);
    t.match(rendered2, /Subagent verifier approved source changes/u);
    t.match(rendered2, /--evidence subagent:<id>/u);
    t.match(rendered2, /git commit -m "context-quest-test: <summary>"/u);
    t.match(rendered2, /git push/u);
    t.match(rendered2, /do not include unrelated dirty worktree entries/u);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});

tap.test('quest-context surfaces model guidance for owner-boundary theories', (t) => {
  const root = tmp();
  const goal = oracleQuest(
    'architecture-owner-boundary-model-guidance',
    'Core system architecture owner-boundary theory must preserve semantic ownership.',
  );
  writeOracle(root, goal.id);
  saveQuest(root, goal);
  appendEvent(root, goal.id, {
    type: 'quest-declared',
    ts: new Date().toISOString(),
  });

  const context = buildContext(root, {id: goal.id});
  t.equal(context.quest.health.modelGuidance.command, 'npm run model:contracts');
  t.equal(
    context.quest.health.modelGuidance.modelRef,
    'model:architecture/contracts/core-system-logic.md',
  );
  t.ok(
    context.quest.health.signals.some((signal) =>
      signal.type === 'model-contract-guidance-available'),
  );

  const rendered = renderContext(context);
  t.match(rendered, /## Model Guidance/u);
  t.match(rendered, /theory discriminator: npm run model:contracts/u);
  t.match(rendered, /--modelRef model:architecture\/contracts\/core-system-logic\.md/u);

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('recorded theories retain architecture model guidance', (t) => {
  const root = tmp();
  const goal = oracleQuest(
    'architecture-theory-model-guidance',
    'Architecture owner-boundary theory for core system handoff.',
  );
  writeOracle(root, goal.id);
  saveQuest(root, goal);
  appendEvent(root, goal.id, {
    type: 'quest-declared',
    ts: new Date().toISOString(),
  });

  const result = runTheoryCommand(root, {
    '_': ['system'],
    'id': goal.id,
    'theory': 'theory-architecture-owner-boundary',
    'problem': 'architecture owner boundary can drift without model evidence',
    'evidence': 'test-output/reports/core-system-logic-alloy.model.report.json',
    'success': 'Quest closes with owner-boundary evidence intact',
    'mechanism': 'coupled_invariants',
    'owner': 'architecture_owner',
    'missing-edge': 'model contract discriminator',
    'discriminator': 'npm run model:contracts',
  });
  t.match(result, /recorded system theory/u);

  const state = projectState(goal, readLog(root, goal.id));
  const theory = state.theories.byId['theory-architecture-owner-boundary'];
  t.equal(theory.modelGuidance.command, 'npm run model:contracts');
  t.equal(
    theory.modelGuidance.modelRef,
    'model:architecture/contracts/core-system-logic.md',
  );

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
