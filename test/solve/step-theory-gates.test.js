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
    // 1st flat step climbs to rung 1
    commitStep(root, quest, 'flat');

    // 2nd step without theory is blocked
    runStep(root, quest);
    const blocked = runStep(root, quest, {
      changeRef: makeDiff(root, 'flat2'),
      summary: 'flat2',
    });
    t.equal(blocked.terminal, 'theory-required');
    t.match(blocked.problems.join('\n'), /frontier theory required/);

    recordFrontierTheory(root, quest);
    // 3rd step with theory is allowed
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
    // Rung 1 -> 2 (model)
    commitStep(root, quest, 'b', {
      theoryRef: 'theory-frontier',
    });

    // Rung 2 needs system theory
    runStep(root, quest);
    const needsSystem = runStep(root, quest, {
      changeRef: makeDiff(root, 'c1'),
      summary: 'no system theory yet',
    });
    t.equal(needsSystem.terminal, 'theory-required');
    t.match(needsSystem.problems.join('\n'), /system theory required/);

    recordSystemTheory(root, quest);
    recordFrontierTheory(root, quest, 'theory-model', 'model');
    
    // Rung 2 with system theory but without model ref throws
    t.throws(() => runStep(root, quest, {
      changeRef: makeDiff(root, 'c'),
      summary: 'model rung without model',
      theoryRef: 'theory-model',
    }), /model evidence or modelNotApplicable/);

    // Rung 2 with modelNotApplicable succeeds
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
    // Rung 1 -> 2
    commitStep(root, quest, 'b', {
      theoryRef: 'theory-wide',
    });
    recordSystemTheory(root, quest);
    recordFrontierTheory(root, quest, 'theory-model', 'model');
    // Rung 2 -> 3
    commitStep(root, quest, 'c', {
      theoryRef: 'theory-model',
      modelNotApplicable: 'statechart already covers lifecycle',
    });

    recordFrontierTheory(root, quest, 'theory-change', 'ownership');
    // Rung 3 step succeeds without model evidence
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

    // Running step without modelRef throws
    t.throws(() => {
      runStep(root, quest, {
        changeRef: makeDiff(root, 'e'),
        summary: 'retry edits',
        theoryRef: 'theory-model',
      });
    }, /model reference is required when repeated evidence has lifecycle language/);

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
});
