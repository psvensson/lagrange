import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {runTheoryCommand} from '../../scripts/solve/theory.js';
import {readLog, projectState, saveQuest} from '../../scripts/solve/store.js';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../scripts/solve.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solve-theory-'));
}

function questFor(root, id = 'demo') {
  const oracle = path.join(root, `${id}.json`);
  fs.writeFileSync(oracle, JSON.stringify({metric: 2, target: 0}));
  return {
    id,
    statement: 'Drive the oracle metric to zero.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: oracle}},
    frontiers: [
      {id: `${id}-main`, priority: 1,
        metric: {probe: 'oracle', args: {file: oracle}}},
    ],
  };
}

function systemArgs(id) {
  return {
    '_': ['system'],
    id,
    'theory': 'theory-system',
    'problem': 'the scenario stalls across owners',
    'evidence': 'evidence.json',
    'success': 'oracle reaches zero',
    'mechanism': 'coupled_invariants',
    'owner': 'workflow_tooling_owner',
    'missing-edge': 'system-level discriminator',
    'discriminator': 'npm test -- test/solve/theory.test.js',
    'stable-fact': ['metric is stuck'],
    'changed-fact': ['rung escalated'],
  };
}

function optionArgs(id, frontier) {
  return {
    '_': ['option'],
    id,
    'theory': 'theory-frontier',
    frontier,
    'layer': 'observation',
    'mechanism': 'observation_gap',
    'intervention': 'capture fresh owner evidence',
    'expected-movement': 'metric decreases',
    'negative-result': 'same metric rules out observation capture',
    'discriminator': 'npm test -- test/solve/theory.test.js',
    'promotion': 'fresh evidence identifies owner',
    'rejection': 'fresh evidence does not move metric',
    'evidence': 'evidence.json',
  };
}

tap.test('Quest theory events', async (t) => {
  t.test('records system, frontier, selected, and result theory state', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    runTheoryCommand(root, systemArgs(quest.id));
    runTheoryCommand(root, optionArgs(quest.id, 'demo-main'));
    runTheoryCommand(root, {
      _: ['select'],
      id: quest.id,
      frontier: 'demo-main',
      theory: 'theory-frontier',
    });
    runTheoryCommand(root, {
      _: ['record'],
      id: quest.id,
      theory: 'theory-frontier',
      result: 'supported',
      evidence: 'after.json',
      validation: 'npm test',
    });

    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.theories.system[0].id, 'theory-system');
    t.equal(state.theories.frontier[0].layer, 'observation');
    t.equal(state.theories.selectedByFrontier['demo-main'], 'theory-frontier');
    t.equal(state.theories.byId['theory-frontier'].status, 'supported');
    t.equal(state.theories.byId['theory-frontier'].results[0].evidence, 'after.json');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('CLI lists theories and blocks selecting archived imports', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    const ledger = path.join(root, 'ledger.md');
    fs.writeFileSync(ledger, [
      '# Ledger',
      '',
      '## theory-20260601-archive',
      '',
      '- Status: supported',
      '- Scenario/gate: demo / gate',
      '- Owner/boundary: workflow_tooling_owner / quest_lifecycle',
      '- Hypothesis: archive theory',
      '- Probe: `npm test`',
      '- Artifact/result: evidence.json',
      '- Representative movement: same-frontier',
      '- Linked packages: none',
      '- Supersedes: none',
      '- Superseded by: none',
      '- Next implication: import only',
      '',
    ].join('\n'));

    const imported = runTheoryCommand(root, {
      _: ['import-ledger'],
      id: quest.id,
      owner: 'workflow_tooling_owner',
      boundary: 'quest_lifecycle',
      ledger,
    });
    t.match(imported, /imported 1/);
    t.throws(() => runTheoryCommand(root, {
      _: ['select'],
      id: quest.id,
      frontier: 'demo-main',
      theory: 'theory-20260601-archive',
    }), /not selectable/);

    const out = execFileSync('node', [
      CLI, 'theory', 'list', '--id', quest.id, '--root', root,
    ], {encoding: 'utf8'});
    t.match(out, /theory-20260601-archive/);
    t.match(out, /archive=true/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('selection rejects falsified frontier theories', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    runTheoryCommand(root, optionArgs(quest.id, 'demo-main'));
    runTheoryCommand(root, {
      _: ['record'],
      id: quest.id,
      theory: 'theory-frontier',
      result: 'falsified',
      evidence: 'after.json',
    });
    t.throws(() => runTheoryCommand(root, {
      _: ['select'],
      id: quest.id,
      frontier: 'demo-main',
      theory: 'theory-frontier',
    }), /non-selectable status falsified/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('mechanism card extracts a usable Quest card from evidence', (t) => {
    const root = tmp();
    const evidence = path.join(root, 'report.json');
    fs.writeFileSync(evidence, JSON.stringify({
      standardSummary: {
        scenarios: [
          {scenario: 'demo', current: {verdict: 'BLOCK_EVIDENCE_INCOMPLETE'}},
        ],
      },
      optimizationSummary: {totalPriorityItems: 1},
    }));
    const out = runTheoryCommand(root, {
      _: ['card'],
      evidence,
    });
    t.match(out, /failureMechanism: observation_gap/);
    t.match(out, /priorityItems=1/);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
