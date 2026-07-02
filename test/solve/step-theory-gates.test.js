import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {runStep} from '../../scripts/solve/step.js';
import {runTheoryCommand} from '../../scripts/solve/theory.js';
import {projectState, readLog, saveQuest, appendEvent} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'step-theory-'));
}

function makeDiff(root, name) {
  const file = path.join(root, 'solve', 'changes', 'demo', `${name}.diff`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, [
    'diff --git a/src/demo.js b/src/demo.js',
    '--- a/src/demo.js',
    '+++ b/src/demo.js',
    '@@ -1 +1 @@',
    `-${name} before`,
    `+${name} after`,
  ].join('\n'));
  return `diff:${file}`;
}

function commitStep(root, quest, name, options = {}) {
  runStep(root, quest);
  return runStep(root, quest, {
    changeRef: makeDiff(root, name),
    summary: name,
    ...options,
  });
}

function setup() {
  const root = tmp();
  const oracle = path.join(root, 'oracle.json');
  fs.writeFileSync(oracle, JSON.stringify({metric: 3, target: 0}));
  const quest = {
    id: 'demo',
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: 'demo-main', priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
  saveQuest(root, quest);
  return {root, quest, oracle};
}

function recordFrontierTheory(root, quest, theory = 'theory-frontier',
  layer = 'observation') {
  runTheoryCommand(root, {
    '_': ['option'],
    'id': quest.id,
    theory,
    'frontier': 'demo-main',
    layer,
    'mechanism': layer === 'model' ? 'model_gap' : 'observation_gap',
    'intervention': layer === 'model' ?
      'bind the model route' :
      'capture fresh owner evidence',
    'expected-movement': 'metric decreases',
    'negative-result': 'same metric falsifies observation capture',
    'discriminator': 'npm test -- test/solve/step-theory-gates.test.js',
    'promotion': 'fresh evidence identifies owner',
    'rejection': 'metric stays flat',
  });
  runTheoryCommand(root, {
    _: ['select'],
    id: quest.id,
    frontier: 'demo-main',
    theory,
  });
}

function recordSystemTheory(root, quest) {
  runTheoryCommand(root, {
    '_': ['system'],
    'id': quest.id,
    'theory': 'theory-system',
    'problem': 'same frontier keeps stalling',
    'evidence': 'report.json',
    'success': 'oracle reaches zero',
    'mechanism': 'coupled_invariants',
    'owner': 'workflow_tooling_owner',
    'missing-edge': 'whole-system discriminator',
    'discriminator': 'npm test -- test/solve/step-theory-gates.test.js',
    'stable-fact': 'metric is flat',
    'changed-fact': 'rung escalated',
  });
}

tap.test('step theory gates', async (t) => {
  t.test('widen-scope rung requires a selected frontier theory', (t) => {
    const {root, quest} = setup();
    // Flat steps climb observe(0) -> local-fix(1) -> widen-scope(2)
    commitStep(root, quest, 'flat');
    commitStep(root, quest, 'flat2');

    // step at widen-scope without theory is blocked before a pending attempt is pinned
    const blocked = runStep(root, quest);
    t.equal(blocked.terminal, 'theory-required');
    t.match(blocked.problems.join('\n'), /frontier theory required/);

    recordFrontierTheory(root, quest);
    // next step with theory is allowed
    runStep(root, quest);
    const allowed = runStep(root, quest, {
      changeRef: makeDiff(root, 'with-theory'),
      summary: 'with theory',
      theoryRef: 'theory-frontier',
    });
    t.equal(allowed.terminal, undefined);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('model rung requires system theory and model evidence', (t) => {
    const {root, quest} = setup();
    // Rung 0 -> 1
    commitStep(root, quest, 'a');
    recordFrontierTheory(root, quest);
    // Rung 1 -> 2 (widen-scope) then 2 -> 3 (model)
    commitStep(root, quest, 'b', {
      theoryRef: 'theory-frontier',
    });
    recordFrontierTheory(root, quest, 'theory-frontier2');
    commitStep(root, quest, 'b2', {
      theoryRef: 'theory-frontier2',
    });

    // Rung 3 (model) needs system theory before a pending attempt is pinned
    const needsSystem = runStep(root, quest);
    t.equal(needsSystem.terminal, 'theory-required');
    t.match(needsSystem.problems.join('\n'), /system theory required/);

    recordSystemTheory(root, quest);
    recordFrontierTheory(root, quest, 'theory-model', 'model');

    // Rung 3 with system theory but without model ref gates (explore), not crash
    runStep(root, quest);
    const needsModel = runStep(root, quest, {
      changeRef: makeDiff(root, 'c'),
      summary: 'model rung without model',
      theoryRef: 'theory-model',
    });
    t.equal(needsModel.terminal, 'theory-required');
    t.match(needsModel.problems.join('\n'), /model evidence or modelNotApplicable/);

    // Rung 3 with modelNotApplicable succeeds
    const committed = runStep(root, quest, {
      changeRef: makeDiff(root, 'd'),
      summary: 'model not applicable because statechart already covers lifecycle',
      theoryRef: 'theory-model',
      modelNotApplicable: 'statechart already covers this workflow lifecycle',
    });
    t.equal(committed.progressed, false);
    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.theories.byId['theory-frontier'].status, 'falsified');
    t.equal(state.theories.byId['theory-model'].status, 'falsified');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('change-approach rung keeps theory gate without model evidence', (t) => {
    const {root, quest} = setup();
    // Rung 0 -> 1
    commitStep(root, quest, 'a');
    recordFrontierTheory(root, quest, 'theory-wide');
    // Rung 1 -> 2 -> 3
    commitStep(root, quest, 'b', {
      theoryRef: 'theory-wide',
    });
    recordFrontierTheory(root, quest, 'theory-wide2');
    commitStep(root, quest, 'b2', {
      theoryRef: 'theory-wide2',
    });
    recordSystemTheory(root, quest);
    recordFrontierTheory(root, quest, 'theory-model', 'model');
    // Rung 3 -> 4
    commitStep(root, quest, 'c', {
      theoryRef: 'theory-model',
      modelNotApplicable: 'statechart already covers lifecycle',
    });

    recordFrontierTheory(root, quest, 'theory-change', 'ownership');
    // Rung 4 (change-approach) step succeeds without model evidence
    runStep(root, quest);
    const committed = runStep(root, quest, {
      changeRef: makeDiff(root, 'd'),
      summary: 'try a different owner path',
      theoryRef: 'theory-change',
    });
    t.same(committed.violations, [], 'change-approach does not require model evidence');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('liveness evidence requires model ref before more implementation', (t) => {
    const {root, quest} = setup();
    runStep(root, quest);

    // Ingest two reports with lifecycle/liveness failure keywords
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      summary: 'wait_for_operation_progress liveness loop',
      metric: 3,
      done: false,
    });
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r2.json',
      summary: 'retry_scheduled wait loop',
      metric: 3,
      done: false,
    });

    // Record system & frontier theory
    recordSystemTheory(root, quest);
    recordFrontierTheory(root, quest, 'theory-model', 'model');

    // Running step without modelRef gates (explore) instead of crashing
    const needsModelRef = runStep(root, quest, {
      changeRef: makeDiff(root, 'e'),
      summary: 'retry edits',
      theoryRef: 'theory-model',
    });
    t.equal(needsModelRef.terminal, 'theory-required');
    t.match(
      needsModelRef.problems.join('\n'),
      /model reference is required when repeated evidence has lifecycle language/,
    );

    // Create a mock tla model file
    const modelFile = path.join(root, 'tla.tla');
    fs.writeFileSync(modelFile, 'mock tla content\n');

    // Running step with valid modelRef succeeds
    const committed = runStep(root, quest, {
      changeRef: makeDiff(root, 'f'),
      summary: 'with model ref',
      theoryRef: 'theory-model',
      modelRef: `tla:${modelFile}`,
    });
    t.same(committed.violations, []);

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('stale selected theory blocks widened attempts after owner movement', (t) => {
    const {root, quest} = setup();
    // Climb observe(0) -> local-fix(1) -> widen-scope(2) where staleness is enforced.
    commitStep(root, quest, 'a');
    commitStep(root, quest, 'a2');
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r1.json',
      metric: 3,
      done: false,
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      dominantReason: 'snapshot_coverage=1/5',
    });
    recordFrontierTheory(root, quest, 'theory-snapshot', 'ownership');
    appendEvent(root, quest.id, {
      type: 'evidence-ingested',
      frontier: 'demo-main',
      evidence: 'r2.json',
      metric: 3,
      done: false,
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      dominantReason: 'priority_spread_pending',
    });

    const blocked = runStep(root, quest);
    t.equal(blocked.terminal, 'theory-required');
    t.match(blocked.problems.join('\n'), /stale/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
