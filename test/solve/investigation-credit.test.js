import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {runStep} from '../../scripts/solve/step.js';
import {runTheoryCommand} from '../../scripts/solve/theory.js';
import {projectState, readLog, saveQuest} from '../../scripts/solve/store.js';
import {
  LADDER,
  RUNG_OBSERVE,
  RUNG_INDEX_OBSERVE,
  RUNG_INDEX_LOCAL_FIX,
  INVESTIGATION_BUDGET,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'invest-credit-'));
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

function setup() {
  const root = tmp();
  const oracle = path.join(root, 'oracle.json');
  // metric never reaches target: investigation alone can never satisfy doneWhen.
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

// Record + select a fresh frontier theory under a unique id.
function selectFrontierTheory(root, quest, theory) {
  runTheoryCommand(root, {
    '_': ['option'],
    'id': quest.id,
    theory,
    'frontier': 'demo-main',
    'layer': 'observation',
    'mechanism': 'observation_gap',
    'intervention': 'instrument and run the discriminator',
    'expected-movement': 'discriminator confirms or refutes the bound mechanism',
    'negative-result': 'discriminator refutes the bound mechanism',
    'discriminator': 'npm test -- test/solve/investigation-credit.test.js',
    'promotion': 'evidence confirms the mechanism',
    'rejection': 'evidence refutes the mechanism',
  });
  runTheoryCommand(root, {
    _: ['select'],
    id: quest.id,
    frontier: 'demo-main',
    theory,
  });
}

function rungIndexOf(root, quest) {
  const state = projectState(quest, readLog(root, quest.id));
  return state.frontiers.find((f) => f.id === 'demo-main').rungIndex;
}

function refreshFlatEvidence(quest, revision) {
  const file = quest.frontiers[0].metric.args.file;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.observationRevision = revision;
  fs.writeFileSync(file, JSON.stringify(data));
}

function commitDiscrimination(root, quest, name, theory, discrimination) {
  selectFrontierTheory(root, quest, theory);
  runStep(root, quest);
  refreshFlatEvidence(quest, name);
  return runStep(root, quest, {
    changeRef: makeDiff(root, name),
    summary: name,
    theoryRef: theory,
    discrimination,
  });
}

tap.test('observe is the first rung of the ladder', (t) => {
  t.equal(LADDER[0], RUNG_OBSERVE);
  t.equal(RUNG_INDEX_OBSERVE, 0);
  const {root, quest} = setup();
  runStep(root, quest);
  const committed = runStep(root, quest, {
    changeRef: makeDiff(root, 'first'),
    summary: 'first attempt instruments the system',
  });
  t.equal(committed.progressed, false);
  const firstAttempt = readLog(root, quest.id)
    .find((e) => e.type === 'attempt');
  t.equal(firstAttempt.prevRungIndex, RUNG_INDEX_OBSERVE,
    'the very first attempt runs at the observe rung');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('an evidence-backed refuted discrimination holds the rung and ' +
  'falsifies the theory', (t) => {
  const {root, quest} = setup();
  const before = rungIndexOf(root, quest);
  t.equal(before, RUNG_INDEX_OBSERVE);

  const result = commitDiscrimination(root, quest, 'probe-a', 'theory-a',
    'refuted');
  t.equal(result.progressed, false,
    'a refuted discrimination is not metric progress');

  // The rung is HELD (investigative credit), not climbed toward park.
  t.equal(rungIndexOf(root, quest), RUNG_INDEX_OBSERVE,
    'investigative credit holds the observe rung');

  const state = projectState(quest, readLog(root, quest.id));
  t.equal(state.theories.byId['theory-a'].status, 'falsified',
    'the refuted theory is falsified, forcing a fresh reselect');

  // The credited attempt is durably marked so the budget counter survives replay.
  const log = readLog(root, quest.id);
  const credited = log.filter((e) =>
    e.type === 'attempt' && e.investigative === true);
  t.equal(credited.length, 1, 'the credited attempt is persisted as investigative');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('investigation budget is finite: once spent the rung climbs to park', (t) => {
  const {root, quest} = setup();
  // Spend the whole budget on distinct, evidence-backed refutations. Each holds
  // the observe rung.
  for (let i = 0; i < INVESTIGATION_BUDGET; i += 1) {
    commitDiscrimination(root, quest, `probe-${i}`, `theory-${i}`, 'refuted');
    t.equal(rungIndexOf(root, quest), RUNG_INDEX_OBSERVE,
      `credit ${i + 1} holds the observe rung`);
  }
  const log = readLog(root, quest.id);
  const credited = log.filter((e) =>
    e.type === 'attempt' && e.investigative === true);
  t.equal(credited.length, INVESTIGATION_BUDGET,
    'exactly the budget number of credits were granted');

  // One more distinct refutation: the budget is exhausted, so the attempt is no
  // longer investigative and climbs the ladder. Investigative credits do not count
  // toward the system-theory stall escalation, so the climb is not pre-empted.
  commitDiscrimination(root, quest, 'probe-final', 'theory-final', 'refuted');
  t.equal(rungIndexOf(root, quest), RUNG_INDEX_LOCAL_FIX,
    'with the budget spent, a further non-progress attempt climbs the ladder');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

tap.test('investigation never satisfies doneWhen', (t) => {
  const {root, quest} = setup();
  commitDiscrimination(root, quest, 'probe-a', 'theory-a', 'confirmed');
  const state = projectState(quest, readLog(root, quest.id));
  t.not(state.status, 'solved',
    'a confirmed discrimination is investigative progress, not goal completion');
  const log = readLog(root, quest.id);
  t.equal(log.filter((e) => e.type === 'solved').length, 0,
    'no solved event is emitted by investigation alone');
  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});
