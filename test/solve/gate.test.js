import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveGateDecision,
  exploreBudgetRemaining,
  gateDecisionToStepResult,
  theoryGateContinuation,
  softFirstWouldDefer,
  decisionContinues,
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
  EVENT_GUARD_OVERRIDE,
  EXPLORE_BUDGET,
  GUARD_QUORUM,
  OUTCOME_THEORY_REQUIRED,
  OUTCOME_BLOCKED,
  OUTCOME_CONTINUE,
  DISPOSITION_ADVISORY,
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

tap.test('soft-first / quorum (P5)', async (t) => {
  const FRONTIER = 'gate-main';
  const advisory = () => ({
    type: EVENT_GATE_DECISION,
    frontier: FRONTIER,
    disposition: DISPOSITION_ADVISORY,
    code: CONTINUATION_BLOCKED_THEORY,
  });
  const progress = () => ({type: EVENT_ATTEMPT, frontier: FRONTIER, progressed: true});

  t.test('first theory gate is softened to a recorded advisory when caller opts in', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log: [], frontier: FRONTIER, rungIndex: 1, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY, 'advisory, not a stop');
    t.equal(decision.outcome, OUTCOME_CONTINUE, 'outcome continues the loop');
    const recorded = readLog(root, QUEST.id).filter((e) =>
      e.type === EVENT_GATE_DECISION && e.disposition === DISPOSITION_ADVISORY);
    t.equal(recorded.length, 1, 'one advisory gate-decision recorded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a supervised caller (no softFirst) is never softened', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log: [], frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_EXPLORE, 'hard explore gate for supervised path');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('soft-first escalates to the real disposition once the quorum is spent', (t) => {
    const root = tmp();
    const log = [];
    for (let i = 0; i < GUARD_QUORUM; i += 1) log.push(advisory());
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_EXPLORE, 'escalates after GUARD_QUORUM advisories');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an honest progress resets the soft-first ramp', (t) => {
    const root = tmp();
    const log = [];
    for (let i = 0; i < GUARD_QUORUM; i += 1) log.push(advisory());
    log.push(progress());
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY, 'advisory again after progress resets count');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('convergence-forcing theory problems are excluded from soft-first', (t) => {
    const root = tmp();
    for (const problem of [
      'coupled-invariant oscillation across owners',
      'system theory required after stall',
    ]) {
      const decision = resolveGateDecision(
        root,
        QUEST,
        blocked(CONTINUATION_BLOCKED_THEORY, [problem]),
        {log: [], frontier: FRONTIER, rungIndex: 1, softFirst: true},
      );
      t.not(decision.disposition, DISPOSITION_ADVISORY, `not softened: ${problem}`);
    }
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('model-evidence is soft-first eligible (P5b): bounded ramp, not an immediate stop', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['model evidence required: lifecycle_model']),
      {log: [], frontier: FRONTIER, rungIndex: 3, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY, 'model evidence softens on first sight');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('non-theory codes keep their immediate disposition under softFirst', (t) => {
    const root = tmp();
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_SCOPE, ['scope pressure terminal: 80 files']),
      {log: [], frontier: FRONTIER, rungIndex: 1, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_REROUTE, 'scope still reroutes immediately');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('softFirstWouldDefer mirrors eligibility and the quorum budget', (t) => {
    const eligible = blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']);
    t.equal(softFirstWouldDefer([], eligible, FRONTIER), true, 'defers on first encounter');
    const spent = [];
    for (let i = 0; i < GUARD_QUORUM; i += 1) spent.push(advisory());
    t.equal(softFirstWouldDefer(spent, eligible, FRONTIER), false, 'stops deferring after quorum');
    const excluded = blocked(CONTINUATION_BLOCKED_THEORY, ['coupled-invariant oscillation']);
    t.equal(softFirstWouldDefer([], excluded, FRONTIER), false, 'never defers an excluded problem');
    t.end();
  });

  t.test('decisionContinues treats null and advisory as continue', (t) => {
    t.equal(decisionContinues(null), true, 'no gate => continue');
    t.equal(decisionContinues({disposition: DISPOSITION_ADVISORY}), true, 'advisory => continue');
    t.equal(decisionContinues({disposition: DISPOSITION_EXPLORE}), false, 'explore => stop');
    t.end();
  });
});

tap.test('recorded-reason override escape hatch', async (t) => {
  const FRONTIER = 'gate-main';
  const overrideEvent = (code, reason, problem = null) => ({
    type: EVENT_GUARD_OVERRIDE,
    frontier: FRONTIER,
    code,
    problem,
    reason,
  });
  const consumedAdvisory = (code) => ({
    type: EVENT_GATE_DECISION,
    frontier: FRONTIER,
    code,
    disposition: DISPOSITION_ADVISORY,
    override: 'prior bypass',
  });

  t.test('an unconsumed override bypasses an overridable theory guard', (t) => {
    const root = tmp();
    const log = [overrideEvent(CONTINUATION_BLOCKED_THEORY, 'pursuing a hunch')];
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY, 'bypass records an advisory');
    t.equal(decision.outcome, OUTCOME_CONTINUE, 'loop continues');
    t.equal(decision.override, 'pursuing a hunch', 'carries the recorded reason');
    const recorded = readLog(root, QUEST.id).filter((e) =>
      e.type === EVENT_GATE_DECISION && e.override);
    t.equal(recorded.length, 1, 'one override-tagged advisory is recorded');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('the override is honoured on the supervised path too', (t) => {
    const root = tmp();
    const log = [overrideEvent(CONTINUATION_BLOCKED_THEORY, 'operator judgement')];
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY, 'no softFirst needed for an override');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('an override is single-use: a consumed override no longer bypasses', (t) => {
    const root = tmp();
    const log = [
      overrideEvent(CONTINUATION_BLOCKED_THEORY, 'one shot'),
      consumedAdvisory(CONTINUATION_BLOCKED_THEORY),
    ];
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_EXPLORE,
      're-fires the real guard once the override is spent');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a non-overridable invariant (measurement) ignores any override', (t) => {
    const root = tmp();
    const log = [overrideEvent(CONTINUATION_BLOCKED_MEASUREMENT, 'I really want to')];
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_MEASUREMENT, ['cannot measure metric']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(decision.disposition, DISPOSITION_PARK_RESUMABLE,
      'measurement still parks; an override cannot sign off on a non-measuring sample');
    t.not(decision.override, 'I really want to', 'no override reason is attached');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('a problem-targeted override only matches the named block', (t) => {
    const root = tmp();
    const log = [overrideEvent(CONTINUATION_BLOCKED_THEORY, 'narrow', 'lifecycle_model')];
    const matched = resolveGateDecision(
      tmp(),
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['model evidence required: lifecycle_model']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.equal(matched.disposition, DISPOSITION_ADVISORY, 'matches the targeted problem');
    const unmatched = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1},
    );
    t.not(unmatched.disposition, DISPOSITION_ADVISORY,
      'an unrelated theory block is not bypassed by a targeted override');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });

  t.test('the override advisory is not counted toward the soft-first quorum', (t) => {
    // An override-tagged advisory must not consume the separate soft-first budget. After one
    // override bypass (and the progress it implies is absent), a fresh theory block on a
    // softFirst caller still softens to its own first advisory rather than escalating early.
    const root = tmp();
    const log = [
      overrideEvent(CONTINUATION_BLOCKED_THEORY, 'bypass'),
      consumedAdvisory(CONTINUATION_BLOCKED_THEORY),
    ];
    const decision = resolveGateDecision(
      root,
      QUEST,
      blocked(CONTINUATION_BLOCKED_THEORY, ['frontier theory required']),
      {log, frontier: FRONTIER, rungIndex: 1, softFirst: true},
    );
    t.equal(decision.disposition, DISPOSITION_ADVISORY,
      'override advisory does not spend the soft-first quorum');
    fs.rmSync(root, {recursive: true, force: true});
    t.end();
  });
});
