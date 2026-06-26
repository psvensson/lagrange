import t from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  STATUS,
  isStandingInvariantsEnabled,
  invariantStreamId,
  liveInvariants,
  evaluateInvariant,
  recordEvaluation,
  deriveStatus,
  runInvariantsCommand,
  triggerCostViolation,
  triggerOnQuestClosure,
  questScopes,
  evaluateAndRecord,
  shouldSpawnRestoration,
  restorationQuestId,
} from '../../scripts/solve/invariant-liveness.js';
import {validateInvariantRegistry} from '../../scripts/check-invariants.js';
import {questFilePath, readLog, appendEvent} from '../../scripts/solve/store.js';
import {invariantHeldProbe} from '../../scripts/solve/probes/invariant-held.js';
import {OSCILLATION_REOPEN_BUDGET} from '../../scripts/solve/constants.js';

// WS1 unit coverage for Tier-2 live-evidence verification of architecture
// invariants (spec: .kiro/specs/standing-invariant-closure/). Covers the
// flag gate, the repro/command evaluation dispatch, and the HELD/BREACHED/
// UNGUARDED fold over the Solver event log.

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inv-liveness-'));
}

const RAFT = {id: 'raft-x', owner: 'o', boundary: 'b', kind: 'safety'};

t.test('flag is default-off and only true enables', (t) => {
  t.equal(isStandingInvariantsEnabled({}), false);
  t.equal(isStandingInvariantsEnabled({LAGRANGE_STANDING_INVARIANTS: 'false'}), false);
  t.equal(isStandingInvariantsEnabled({LAGRANGE_STANDING_INVARIANTS: 'true'}), true);
  t.end();
});

t.test('status folds over the event log: none=>UNGUARDED, latest verdict wins', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));

  t.equal(deriveStatus(root, RAFT).status, STATUS.UNGUARDED, 'no events => UNGUARDED');

  recordEvaluation(root, RAFT, {verdict: 'pass', exitCode: 0, evidenceRef: 'x'});
  t.equal(deriveStatus(root, RAFT).status, STATUS.HELD, 'pass => HELD');

  recordEvaluation(root, RAFT, {verdict: 'fail', exitCode: 1, evidenceRef: 'x'});
  const breached = deriveStatus(root, RAFT);
  t.equal(breached.status, STATUS.BREACHED, 'later fail => BREACHED (latest wins)');
  t.equal(breached.evaluations, 2, 'fold counts every evaluation event');

  recordEvaluation(root, RAFT, {verdict: 'pass', exitCode: 0, evidenceRef: 'x'});
  t.equal(deriveStatus(root, RAFT).status, STATUS.HELD, 'recovery => HELD again');
  t.end();
});

t.test('evaluateInvariant runs the repro command: exit 0 holds, nonzero breaches', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));

  const holds = evaluateInvariant(
    {id: 'a', liveEvidence: {evidence: {kind: 'repro', ref: 'node -e "process.exit(0)"'}}},
    {root});
  t.equal(holds.verdict, 'pass');
  t.equal(holds.exitCode, 0);

  const breaches = evaluateInvariant(
    {id: 'b', liveEvidence: {evidence: {kind: 'command', ref: 'node -e "process.exit(1)"'}}},
    {root});
  t.equal(breaches.verdict, 'fail');
  t.equal(breaches.exitCode, 1);

  t.throws(() => evaluateInvariant({id: 'c', liveEvidence: {evidence: {kind: 'mystery'}}}, {root}),
    /unsupported/, 'unknown evidence kind throws');
  t.end();
});

t.test('liveInvariants selects only entries with a liveEvidence block', (t) => {
  const reg = {invariants: [{id: 'with', liveEvidence: {}}, {id: 'without'}]};
  t.same(liveInvariants(reg).map((e) => e.id), ['with']);
  t.same(liveInvariants(null), []);
  t.end();
});

t.test('invariantStreamId namespaces away from quest streams', (t) => {
  t.equal(invariantStreamId('raft-x'), 'invariant-raft-x');
  t.end();
});

t.test('runInvariantsCommand: flag off is inert (no writes), flag on evaluates + folds', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));

  // A temp registry with one cheap, always-passing invariant.
  const regPath = path.join(root, 'registry.json');
  fs.writeFileSync(regPath, JSON.stringify({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'temp-ok', owner: 'o', boundary: 'b', kind: 'safety',
      statement: 's', formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'exits 0',
        evidence: {kind: 'repro', ref: 'node -e "process.exit(0)"'},
        trigger: {policy: 'on-quest-closure', cost: 'cheap'},
      },
    }],
  }));

  const off = runInvariantsCommand(root, {registry: regPath, evaluate: true}, {});
  t.equal(off.enabled, false, 'flag off => disabled');
  t.same(off.invariants, [], 'flag off => no invariants rendered');
  t.notOk(fs.existsSync(path.join(root, 'solve', 'log', 'invariant-temp-ok.ndjson')),
    'flag off => nothing written');

  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};
  const on = runInvariantsCommand(root, {registry: regPath, evaluate: true}, env);
  t.equal(on.enabled, true);
  t.equal(on.invariants.length, 1);
  t.equal(on.invariants[0].status, STATUS.HELD, 'evaluated to HELD');
  t.equal(on.invariants[0].cost, 'cheap');

  // Re-run without --evaluate: status is derived from the recorded event.
  const derived = runInvariantsCommand(root, {registry: regPath}, env);
  t.equal(derived.invariants[0].status, STATUS.HELD, 'status persists via the fold');
  t.equal(derived.evaluated, false);
  t.end();
});

// ---- WS2: trigger policy ----

function writeTrigReg(root, {scope, cost = 'cheap', ref = 'node -e "process.exit(0)"'}) {
  const regPath = path.join(root, 'trig-registry.json');
  fs.writeFileSync(regPath, JSON.stringify({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'trig-x', owner: 'o', boundary: 'b', kind: 'safety',
      statement: 's', formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'exits 0',
        evidence: {kind: 'repro', ref},
        trigger: {policy: 'on-quest-closure', scope, cost},
      },
    }],
  }));
  return regPath;
}

t.test('questScopes derives owner + explicit scopes from a quest', (t) => {
  t.same(questScopes({id: 'q1', owner: 'raft', touchesInvariantScopes: ['owner:x']}),
    ['quest:q1', 'owner:raft', 'owner:x']);
  t.same(questScopes(null), []);
  t.end();
});

t.test('on-quest-closure trigger fires for matching scope, records a transition', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const reg = writeTrigReg(root, {scope: 'owner:raft'});
  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};

  const out = triggerOnQuestClosure(root, {scopes: ['owner:raft'], registry: reg}, env);
  t.equal(out.fired, true);
  t.same(out.transitions, [{id: 'trig-x', from: STATUS.UNGUARDED, to: STATUS.HELD}],
    'UNGUARDED -> HELD recorded on closure');
  t.end();
});

t.test('trigger skips when quest scope does not intersect the invariant scope', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const reg = writeTrigReg(root, {scope: 'owner:raft'});
  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};

  const out = triggerOnQuestClosure(root, {scopes: ['owner:other'], registry: reg}, env);
  t.same(out.transitions, [], 'no transition for non-matching scope');
  t.notOk(fs.existsSync(path.join(root, 'solve', 'log', 'invariant-trig-x.ndjson')),
    'nothing recorded for non-matching scope');
  t.end();
});

t.test('flag off => trigger does not fire', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const reg = writeTrigReg(root, {scope: 'owner:raft'});
  const out = triggerOnQuestClosure(root, {scopes: ['owner:raft'], registry: reg}, {});
  t.equal(out.fired, false);
  t.same(out.transitions, []);
  t.end();
});

t.test('cost guard (Req 6.3): expensive predicate cannot use a per-event trigger', (t) => {
  // Runtime guard: an expensive per-event invariant is skipped by the trigger.
  t.ok(triggerCostViolation({
    id: 'x', liveEvidence: {trigger: {policy: 'on-quest-closure', cost: 'expensive'}},
  }), 'expensive + on-quest-closure is a violation');
  t.notOk(triggerCostViolation({
    id: 'x', liveEvidence: {trigger: {policy: 'on-cadence', cost: 'expensive'}},
  }), 'expensive + on-cadence is allowed');

  // Declaration guard: the validator rejects it.
  const errors = validateInvariantRegistry({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'bad', owner: 'o', boundary: 'b', kind: 'safety', statement: 's',
      formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'h', evidence: {kind: 'repro', ref: 'r'},
        trigger: {policy: 'on-quest-closure', cost: 'expensive'},
      },
    }],
  });
  t.ok(errors.some((e) => /expensive predicate cannot use/.test(e)),
    'validator rejects expensive per-event trigger');
  t.end();
});

// ---- WS3: breach -> restoration ----

function invariant(id, {ref, autoSpawn = false}) {
  return {
    id, owner: 'o', boundary: 'b', kind: 'safety', statement: 's', formalPredicate: 'p',
    liveEvidence: {
      tier: 2, holdsWhen: 'exits 0', evidence: {kind: 'repro', ref},
      trigger: {policy: 'on-quest-closure', cost: 'cheap'},
      restoration: {autoSpawn},
    },
  };
}
const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';

t.test('evaluateAndRecord on a failing predicate => BREACHED and a breach falsifier', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const inv = invariant('br-x', {ref: FAIL});

  const transition = evaluateAndRecord(root, inv, {});
  t.same(transition, {id: 'br-x', from: STATUS.UNGUARDED, to: STATUS.BREACHED});

  const log = readLog(root, `invariant-br-x`);
  t.ok(log.some((e) => e.type === 'invariant.breach'), 'breach falsifier recorded');
  t.notOk(fs.existsSync(questFilePath(root, restorationQuestId('br-x'))),
    'no restoration Quest when autoSpawn is off');
  t.end();
});

t.test('autoSpawn links a restoration Quest whose doneWhen is invariantHeld', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};
  const inv = invariant('rs-x', {ref: FAIL, autoSpawn: true});

  evaluateAndRecord(root, inv, env);
  const questPath = questFilePath(root, restorationQuestId('rs-x'));
  t.ok(fs.existsSync(questPath), 'restoration Quest scaffolded');
  const quest = JSON.parse(fs.readFileSync(questPath, 'utf8'));
  t.same(quest.doneWhen, {probe: 'invariantHeld', args: {id: 'rs-x'}},
    'doneWhen = invariant returns to HELD');
  t.equal(quest.links.restoresInvariant, 'rs-x');
  t.ok(readLog(root, 'invariant-rs-x').some((e) => e.type === 'invariant.restoration-linked'),
    'restoration-linked recorded');

  // Re-breach while the Quest is open: no duplicate spawn (single-open guard).
  evaluateAndRecord(root, inv, env);
  const links = readLog(root, 'invariant-rs-x')
    .filter((e) => e.type === 'invariant.restoration-linked').length;
  t.equal(links, 1, 're-breach does not spawn a second restoration Quest');
  t.end();
});

t.test('shouldSpawnRestoration guards: open Quest and reopen budget', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const inv = invariant('g-x', {ref: FAIL, autoSpawn: true});

  t.equal(shouldSpawnRestoration(root, inv).spawn, true, 'first breach may spawn');

  // Budget: once OSCILLATION_REOPEN_BUDGET restoration links exist, stop spawning.
  for (let i = 0; i < OSCILLATION_REOPEN_BUDGET; i += 1) {
    appendEvent(root, invariantStreamId('g-x'), {
      type: 'invariant.restoration-linked', invariant: 'g-x', quest: `q${i}`,
    });
  }
  const decision = shouldSpawnRestoration(root, inv);
  t.equal(decision.spawn, false, 'budget exhausted => no spawn');
  t.match(decision.reason, /budget/, 'reason cites the reopen budget');
  t.end();
});

t.test('Req 5.3: status returns to HELD only via re-evaluation, not Quest closure', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};

  evaluateAndRecord(root, invariant('h-x', {ref: FAIL, autoSpawn: true}), env);
  t.equal(deriveStatus(root, {id: 'h-x'}).status, STATUS.BREACHED, 'breached');

  // The restoration Quest existing/closing does NOT set HELD; a passing re-eval does.
  evaluateAndRecord(root, invariant('h-x', {ref: PASS, autoSpawn: true}), env);
  t.equal(deriveStatus(root, {id: 'h-x'}).status, STATUS.HELD, 're-eval restores HELD');
  t.end();
});

t.test('invariantHeld probe is done iff the folded status is HELD', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const regPath = path.join(root, 'reg.json');
  fs.writeFileSync(regPath, JSON.stringify({
    schema: 'invariant-registry-v1',
    invariants: [{id: 'p-x', owner: 'o', boundary: 'b', kind: 'safety',
      statement: 's', formalPredicate: 'p'}],
  }));

  let out = invariantHeldProbe.measure({id: 'p-x', registry: regPath}, {root});
  t.equal(out.done, false, 'UNGUARDED => not done');

  recordEvaluation(root, {id: 'p-x'}, {verdict: 'pass'});
  out = invariantHeldProbe.measure({id: 'p-x', registry: regPath}, {root});
  t.equal(out.done, true, 'HELD => done');
  t.equal(out.metric, 0);

  out = invariantHeldProbe.measure({id: 'unknown', registry: regPath}, {root});
  t.equal(out.done, false, 'unknown invariant => not done');
  t.end();
});

// ---- Follow-on #2: altitude-review surfacing ----

import {altitudeInvariantDigest} from '../../scripts/solve/invariant-liveness.js';

t.test('altitudeInvariantDigest: empty when flag off; surfaces non-HELD drift when on', (t) => {
  const root = tmpRoot(); // fresh root => the real registry's live invariants read as UNGUARDED
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));

  t.equal(altitudeInvariantDigest(root, {}), '', 'flag off => empty (no behavior change)');

  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};
  const unguarded = altitudeInvariantDigest(root, env);
  t.match(unguarded, /UNGUARDED/, 'flag on, no evals => surfaces UNGUARDED drift');

  // Record a real breach for a known registry invariant; it must appear as BREACHED.
  recordEvaluation(root, {id: 'raft-election-safety-one-vote-per-term'}, {verdict: 'fail'});
  const breached = altitudeInvariantDigest(root, env);
  t.match(breached, /raft-election-safety-one-vote-per-term is BREACHED/,
    'a breached invariant is surfaced as a frame signal');
  t.end();
});

// ---- Follow-on #3: on-touched-owner trigger ----

import {
  triggerOnTouchedOwner, pathTouchesInvariant,
} from '../../scripts/solve/invariant-liveness.js';

function writeTouchReg(root, paths) {
  const regPath = path.join(root, 'touch-registry.json');
  fs.writeFileSync(regPath, JSON.stringify({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'touch-x', owner: 'o', boundary: 'b', kind: 'safety',
      statement: 's', formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'exits 0',
        evidence: {kind: 'repro', ref: 'node -e "process.exit(0)"'},
        trigger: {policy: 'on-touched-owner', cost: 'cheap', paths},
      },
    }],
  }));
  return regPath;
}

t.test('pathTouchesInvariant prefix-matches changed files against declared paths', (t) => {
  const inv = {liveEvidence: {trigger: {paths: ['src/raft/']}}};
  t.ok(pathTouchesInvariant(inv, ['src/raft/liferaft.js']), 'prefix match');
  t.notOk(pathTouchesInvariant(inv, ['src/rebalancer/x.js']), 'no match');
  t.notOk(pathTouchesInvariant({liveEvidence: {trigger: {}}}, ['a']), 'no paths => no match');
  t.end();
});

t.test('on-touched-owner trigger fires only when a changed file is in scope', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const reg = writeTouchReg(root, ['src/raft/']);
  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};

  const miss = triggerOnTouchedOwner(root, {changedFiles: ['src/rebalancer/y.js'], registry: reg}, env);
  t.same(miss.transitions, [], 'no matching changed file => no re-verification');

  const hit = triggerOnTouchedOwner(root, {changedFiles: ['src/raft/liferaft.js'], registry: reg}, env);
  t.same(hit.transitions, [{id: 'touch-x', from: STATUS.UNGUARDED, to: STATUS.HELD}],
    'matching changed file => invariant re-verified');

  t.equal(triggerOnTouchedOwner(root, {changedFiles: ['src/raft/x.js'], registry: reg}, {}).fired,
    false, 'flag off => does not fire');
  t.end();
});

t.test('validator requires paths for on-touched-owner policy', (t) => {
  const errors = validateInvariantRegistry({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'np', owner: 'o', boundary: 'b', kind: 'safety', statement: 's', formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'h', evidence: {kind: 'repro', ref: 'r'},
        trigger: {policy: 'on-touched-owner', cost: 'cheap'},
      },
    }],
  });
  t.ok(errors.some((e) => /paths is required for the on-touched-owner/.test(e)),
    'missing paths is rejected');
  t.end();
});

// ---- Follow-on #4: local EvoClaw-style scorer ----

import {
  scoreInvariants, reproBackedCLs, invariantGuardedCL,
} from '../../scripts/solve/invariant-score.js';

t.test('reproBackedCLs and invariantGuardedCL read the real repro surface', (t) => {
  const cls = reproBackedCLs(process.cwd());
  t.ok(cls.has('CL-041') && cls.has('CL-040') && cls.has('CL-038'),
    'known repro-backed CLs are detected');
  t.equal(invariantGuardedCL({liveEvidence: {evidence: {ref: 'npm run repro -- CL-041'}}}), 'CL-041');
  t.equal(invariantGuardedCL({liveEvidence: {evidence: {test: 'test/closure/CL-040.repro.test.js'}}}), 'CL-040');
  t.equal(invariantGuardedCL({liveEvidence: {evidence: {}}}), null);
  t.end();
});

t.test('scoreInvariants: flag gate + coverage/coherence shape', (t) => {
  const root = tmpRoot();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const regPath = path.join(root, 'score-reg.json');
  fs.writeFileSync(regPath, JSON.stringify({
    schema: 'invariant-registry-v1',
    invariants: [{
      id: 'score-x', owner: 'o', boundary: 'b', kind: 'safety', statement: 's', formalPredicate: 'p',
      liveEvidence: {
        tier: 2, holdsWhen: 'h', evidence: {kind: 'repro', ref: 'node -e "process.exit(0)"'},
        trigger: {policy: 'on-quest-closure', cost: 'cheap'},
      },
    }],
  }));

  t.equal(scoreInvariants(root, {registry: regPath, evaluate: true}, {}).enabled, false,
    'flag off => disabled');

  const env = {LAGRANGE_STANDING_INVARIANTS: 'true'};
  const score = scoreInvariants(root, {registry: regPath, evaluate: true}, env);
  t.equal(score.liveInvariants, 1);
  t.equal(score.held, 1, 'evaluated to HELD');
  t.equal(score.coherence, 1, 'coherence = held/live');
  t.same(score.statuses, [{id: 'score-x', status: STATUS.HELD}]);
  t.end();
});
