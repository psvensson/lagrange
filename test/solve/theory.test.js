import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {appendTheoryResultForAttempt, runTheoryCommand}
  from '../../scripts/solve/theory.js';
import {SCOPE_PRESSURE_FILE_LIMIT} from '../../scripts/solve/constants.js';
import {CONTINUATION_BLOCKED_SCOPE}
  from '../../scripts/solve/continuation.js';
import {analyzeQuestHealth} from '../../scripts/solve/health.js';
import {evaluate} from '../../scripts/solve/probe.js';
import {appendEvent, readLog, projectState, saveQuest}
  from '../../scripts/solve/store.js';

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

function scopePressureDiff(root, questId) {
  const diffPath = path.join(root, 'solve', 'changes', questId, 'wide.diff');
  fs.mkdirSync(path.dirname(diffPath), {recursive: true});
  const paths = Array.from(
    {length: SCOPE_PRESSURE_FILE_LIMIT + 1},
    (_, index) => `src/admin/scope-${index}.js`,
  );
  fs.writeFileSync(diffPath, paths.flatMap((changedPath) => [
    `diff --git a/${changedPath} b/${changedPath}`,
    `--- a/${changedPath}`,
    `+++ b/${changedPath}`,
    '@@ -1 +1 @@',
    '-before',
    '+after',
  ]).join('\n'));
  return `diff:${diffPath}`;
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

  t.test('scope pressure still blocks source admission but not theory selection', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    runTheoryCommand(root, optionArgs(quest.id, 'demo-main'));
    const probe = evaluate(quest.frontiers[0].metric, {root});
    appendEvent(root, quest.id, {
      type: 'attempt',
      frontier: 'demo-main',
      changeRef: scopePressureDiff(root, quest.id),
      metricBefore: 2,
      metricAfter: 2,
      evidence: probe.evidence,
      evidenceIdentity: probe.evidenceIdentity,
      evidenceFingerprint: probe.evidenceFingerprint,
    });

    const health = analyzeQuestHealth(root, quest);
    t.equal(health.continuation.status, CONTINUATION_BLOCKED_SCOPE,
      'the source-admission signal remains fail-closed');
    t.match(runTheoryCommand(root, {
      _: ['select'],
      id: quest.id,
      frontier: 'demo-main',
      theory: 'theory-frontier',
    }), /selected theory-frontier/,
    'planning-only theory selection remains available under historical scope pressure');

    const state = projectState(quest, readLog(root, quest.id));
    t.equal(state.theories.selectedByFrontier['demo-main'], 'theory-frontier');
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

// The attempt-path fallback mirrors the ingest-path rule: a failed scenario
// attempt whose blockerAfter carries a verdict but no locating attribution
// records 'avoided' (theory untested); verdict-less pure-metric evidence and
// attributed failures still falsify.
tap.test('appendTheoryResultForAttempt unattributed-failure fallback', async (t) => {
  function attemptEvent(blockerAfter) {
    return {
      theoryRef: 't1',
      frontier: 'demo-main',
      invalidSample: false,
      metricAfter: 1,
      done: false,
      discrimination: null,
      blockerMovement: 'same',
      diagnosticMovement: 'same blocker remains',
      evidence: 'report.json',
      blockerAfter,
    };
  }

  function lastResult(root, quest) {
    return readLog(root, quest.id)
      .filter((event) => event.type === 'theory-result')
      .pop();
  }

  t.test('scenario FAIL with vacuous attribution records avoided', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    appendTheoryResultForAttempt(root, quest, attemptEvent({
      verdict: 'FAIL', owner: null, boundary: null,
      dominantReason: null, rootCauseClass: null,
    }), false, []);
    const result = lastResult(root, quest);
    t.equal(result.theoryOutcome, 'avoided');
    t.equal(result.result, 'avoided');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('verdict-less pure-metric evidence still falsifies', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    appendTheoryResultForAttempt(root, quest, attemptEvent({
      verdict: null, owner: null, boundary: null,
      dominantReason: null, rootCauseClass: null,
    }), false, []);
    t.equal(lastResult(root, quest).result, 'falsified',
      'flat metric with no verdict is the declared negative result');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('attributed failure still falsifies', (t) => {
    const root = tmp();
    const quest = questFor(root);
    saveQuest(root, quest);
    appendTheoryResultForAttempt(root, quest, attemptEvent({
      verdict: 'FAIL', owner: 'owner_a', boundary: 'startup',
      dominantReason: 'reason_a', rootCauseClass: 'topology',
    }), false, []);
    t.equal(lastResult(root, quest).result, 'falsified');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.end();
});
