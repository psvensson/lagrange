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
} from '../../scripts/solve/invariant-liveness.js';

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
