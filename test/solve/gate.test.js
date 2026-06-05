import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveGateDecision,
  exploreBudgetRemaining,
  gateDecisionToStepResult,
  theoryGateContinuation,
} from '../../scripts/solve/gate.js';
import {
  CONTINUATION_ALLOWED,
  CONTINUATION_BLOCKED_THEORY,
  CONTINUATION_BLOCKED_SCOPE,
  CONTINUATION_BLOCKED_MEASUREMENT,
} from '../../scripts/solve/continuation.js';
import {
  EVENT_GATE_DECISION,
  EVENT_ATTEMPT,
  EXPLORE_BUDGET,
  OUTCOME_THEORY_REQUIRED,
  OUTCOME_BLOCKED,
  DISPOSITION_EXPLORE,
  DISPOSITION_REROUTE,
  DISPOSITION_PARK_RESUMABLE,
} from '../../scripts/solve/constants.js';
import {readLog} from '../../scripts/solve/store.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gate-test-'));
}

const QUEST = {id: 'gate-quest', frontiers: [{id: 'gate-main'}]};

function blocked(status, problems) {
  return {status, code: status, problems};
}

tap.test('graded gate decisions', async (t) => {
  t.test('allowed continuation produces no gate decision', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      {status: CONTINUATION_ALLOWED, code: null, problems: []},
      {log: [], frontier: 'gate-main'},
    );
    t.equal(decision, null, 'no gate when continuation is allowed');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('missing theory opens a bounded explore rung (not terminal)', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log: [], frontier: 'gate-main', rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_EXPLORE);
    t.equal(decision.outcome, OUTCOME_THEORY_REQUIRED,
      'explore keeps the non-terminal theory-required outcome');
    t.ok(decision.nextCommand, 'carries an actionable next command');
    const log = readLog(root, QUEST.id);
    t.ok(
      log.some((e) => e.type === EVENT_GATE_DECISION &&
        e.disposition === DISPOSITION_EXPLORE),
      'gate decision is recorded (no longer a silent stop)',
    );
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('explore budget exhaustion downgrades to park-resumable', (t) => {
    const root = tmp();
    const continuation = blocked(CONTINUATION_BLOCKED_THEORY,
      ['frontier theory required']);
    // Spend the whole explore budget without any intervening progress.
    for (let i = 0; i < EXPLORE_BUDGET; i += 1) {
      resolveGateDecision(root, QUEST, continuation,
        {log: readLog(root, QUEST.id), frontier: 'gate-main'});
    }
    t.equal(exploreBudgetRemaining(readLog(root, QUEST.id), 'gate-main'), 0,
      'budget is fully spent');
    const downgraded = resolveGateDecision(root, QUEST, continuation,
      {log: readLog(root, QUEST.id), frontier: 'gate-main'});
    t.equal(downgraded.disposition, DISPOSITION_PARK_RESUMABLE,
      'spent budget parks the frontier as resumable');
    t.equal(downgraded.outcome, OUTCOME_BLOCKED,
      'park-resumable is a non-terminal block, not theory-required');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('progress refreshes the explore budget', (t) => {
    const root = tmp();
    const continuation = blocked(CONTINUATION_BLOCKED_THEORY,
      ['frontier theory required']);
    for (let i = 0; i < EXPLORE_BUDGET; i += 1) {
      resolveGateDecision(root, QUEST, continuation,
        {log: readLog(root, QUEST.id), frontier: 'gate-main'});
    }
    // A measured, progressing attempt resets the budget window.
    const withProgress = [
      ...readLog(root, QUEST.id),
      {type: EVENT_ATTEMPT, frontier: 'gate-main', progressed: true},
    ];
    t.equal(exploreBudgetRemaining(withProgress, 'gate-main'), EXPLORE_BUDGET,
      'progress restores the full explore budget');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('scope pressure reroutes (non-terminal block)', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_SCOPE, ['scope pressure terminal: 61 files']),
      {log: [], frontier: 'gate-main'},
    );
    t.equal(decision.disposition, DISPOSITION_REROUTE);
    t.equal(decision.outcome, OUTCOME_BLOCKED);
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('measurement gate parks the frontier as resumable', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_MEASUREMENT, ['cannot measure']),
      {log: [], frontier: 'gate-main'},
    );
    t.equal(decision.disposition, DISPOSITION_PARK_RESUMABLE);
    t.equal(decision.outcome, OUTCOME_BLOCKED,
      'a measurement gate never produces a terminal outcome');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('theoryGateContinuation classifies raw problem strings', (t) => {
    t.equal(theoryGateContinuation([]).status, CONTINUATION_ALLOWED);
    t.equal(
      theoryGateContinuation(['frontier theory required at rung 2']).status,
      CONTINUATION_BLOCKED_THEORY,
    );
    t.equal(
      theoryGateContinuation(['scope pressure terminal: 80 files']).status,
      CONTINUATION_BLOCKED_SCOPE,
    );
    // Regression outranks scope/theory in the same gate.
    t.equal(
      theoryGateContinuation([
        'scope pressure terminal: 80 files',
        'restore previously-green invariant clusterB',
      ]).status,
      'blocked-regression',
    );
    t.end();
  });

  t.test('gateDecisionToStepResult shapes labels by outcome', (t) => {
    t.equal(
      gateDecisionToStepResult({outcome: OUTCOME_THEORY_REQUIRED}).terminal,
      'theory-required',
    );
    t.equal(
      gateDecisionToStepResult({outcome: OUTCOME_BLOCKED}).terminal,
      'blocked',
    );
    t.end();
  });
});
