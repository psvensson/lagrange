// The 2026-07-27 friction batch: step auto-ingest, blocked-gate dedup, and
// theory pre-fill from a verifier rejection.
import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {appendEvent, saveQuest, readLog}
  from '../../scripts/solve/store.js';
import {runStep} from '../../scripts/solve/step.js';
import {resolveGateDecision} from '../../scripts/solve/gate.js';
import {runTheoryCommand} from '../../scripts/solve/theory.js';
import {ingestEvidence} from '../../scripts/solve/evidence.js';
import {
  EVENT_EVIDENCE_INGESTED,
  EVENT_FINDING,
  EVENT_GATE_DECISION,
  EVENT_THEORY_OPTION_DECLARED,
} from '../../scripts/solve/constants.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'friction-fixes-'));
}

const REPORT = {
  timestamp: '2026-06-01T12:52:33.550Z',
  summary: {total: 1, passed: 0, failed: 1},
  optimizationSummary: {totalPriorityItems: 2},
  scenarios: [{
    scenario: 'rolling-restart',
    passed: false,
    verdict: 'FAIL_CORE_INVARIANT',
    verdictReason: 'core_invariant_or_safety_violation',
  }],
};

function scenarioGoal(root) {
  const reportDir = path.join(root, 'test-output', 'reports');
  const args = {scenario: 'rolling-restart', metric: 'priority', reportDir};
  return {
    id: 'friction-auto-ingest',
    statement: 'rolling-restart passes 3 consecutive harness runs.',
    priority: 1,
    doneWhen: {probe: 'scenario-harness', args: {...args, consecutive: 3}},
    frontiers: [{
      id: 'friction-auto-ingest-main',
      priority: 1,
      metric: {probe: 'scenario-harness', args},
    }],
  };
}

tap.test('step auto-ingests fresh frontier evidence', async (t) => {
  const root = tmp();
  const goal = scenarioGoal(root);
  saveQuest(root, goal);
  const reportDir = path.join(root, 'test-output', 'reports');
  fs.mkdirSync(reportDir, {recursive: true});
  const reportPath = path.join(reportDir, 'latest.report.json');
  fs.writeFileSync(reportPath, JSON.stringify(REPORT));
  ingestEvidence(root, {
    questId: goal.id,
    frontierId: 'friction-auto-ingest-main',
    evidencePath: reportPath,
  });

  // A re-run wrote new report content: previously this blocked the step with
  // the exact ingest command; now the step ingests it and proceeds.
  fs.writeFileSync(reportPath, JSON.stringify({
    ...REPORT,
    timestamp: '2026-06-01T13:52:33.550Z',
    optimizationSummary: {totalPriorityItems: 1},
  }));
  const result = runStep(root, goal, {});
  t.not(result.gate?.code, 'blocked-unrecorded-evidence',
    'the step no longer stops on evidence it can record itself');
  const ingested = readLog(root, goal.id).filter((event) =>
    event.type === EVENT_EVIDENCE_INGESTED);
  t.equal(ingested.length, 2, 'the fresh report was recorded by the step');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

function gateGoal() {
  return {
    id: 'friction-gate-dedup',
    statement: 'gate dedup fixture.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: 'missing-oracle.json'}},
    frontiers: [{
      id: 'friction-gate-dedup-main',
      priority: 1,
      metric: {probe: 'oracle', args: {file: 'missing-oracle.json'}},
    }],
  };
}

const BLOCKED_EVIDENCE_CONTINUATION = {
  status: 'blocked-unrecorded-evidence',
  code: 'blocked-unrecorded-evidence',
  problems: ['fresh frontier evidence is not recorded'],
};

tap.test('identical consecutive blocked gate decisions coalesce', async (t) => {
  const root = tmp();
  const goal = gateGoal();
  saveQuest(root, goal);

  const first = resolveGateDecision(root, goal, BLOCKED_EVIDENCE_CONTINUATION, {
    log: readLog(root, goal.id),
    frontier: goal.frontiers[0].id,
  });
  const second = resolveGateDecision(root, goal, BLOCKED_EVIDENCE_CONTINUATION, {
    log: readLog(root, goal.id),
    frontier: goal.frontiers[0].id,
  });
  t.same(
    {code: second.code, outcome: second.outcome},
    {code: first.code, outcome: first.outcome},
    're-running reports the same block');
  const decisions = readLog(root, goal.id).filter((event) =>
    event.type === EVENT_GATE_DECISION);
  t.equal(decisions.length, 1, 'the exact re-fire appends nothing');

  const third = resolveGateDecision(root, goal, {
    ...BLOCKED_EVIDENCE_CONTINUATION,
    problems: ['a different problem'],
  }, {log: readLog(root, goal.id), frontier: goal.frontiers[0].id});
  t.ok(third, 'a distinct block still records');
  t.equal(readLog(root, goal.id).filter((event) =>
    event.type === EVENT_GATE_DECISION).length, 2,
  'distinct problems are never coalesced');

  fs.rmSync(root, {recursive: true, force: true});
  t.end();
});

function theoryGoal() {
  return {
    id: 'friction-theory-prefill',
    statement: 'theory prefill fixture.',
    priority: 1,
    doneWhen: {probe: 'oracle', args: {file: 'missing-oracle.json'}},
    frontiers: [{
      id: 'friction-theory-prefill-main',
      priority: 1,
      metric: {probe: 'oracle', args: {file: 'missing-oracle.json'}},
    }],
  };
}

tap.test('theory option pre-fills from the latest verifier rejection',
  async (t) => {
    const root = tmp();
    const goal = theoryGoal();
    saveQuest(root, goal);
    appendEvent(root, goal.id, {
      type: EVENT_FINDING,
      kind: 'verifier-rejection',
      claim: 'digest coercion accepts boxed String input',
      evidence: 'subagent:verifier-1',
    });

    runTheoryCommand(root, {
      '_': ['option'],
      'id': goal.id,
      'frontier': 'friction-theory-prefill-main',
      'layer': 'protocol',
      'from-rejection': true,
      'intervention': 'pin digest inputs to primitive strings',
    });
    const option = readLog(root, goal.id).find((event) =>
      event.type === EVENT_THEORY_OPTION_DECLARED);
    t.ok(option, 'option declared without the full blank form');
    t.match(option.mechanism, /digest coercion accepts boxed String input/u,
      'mechanism carries the rejection claim');
    t.equal(option.intervention, 'pin digest inputs to primitive strings',
      'an explicit flag always wins over the pre-fill');
    t.ok(option.discriminator, 'required fields are filled');
    t.ok(option.promotionRule && option.rejectionRule,
      'promotion/rejection rules are filled');

    t.throws(() => runTheoryCommand(root, {
      '_': ['option'],
      'id': goal.id,
      'frontier': 'friction-theory-prefill-main',
      'layer': 'protocol',
      'from-rejection': 'no-such-finding-reference',
    }), /matched no verifier-rejection finding/u,
    'a dangling reference is an error, not a silent blank form');

    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
