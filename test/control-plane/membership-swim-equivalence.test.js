// SWIM active-set equivalence (cutover plan §5 step 3, increment 2).
//
// The safety question the equivalence harness answers, now for the SWIM rule: does
// the SWIM-verdict-derived active set reproduce the AUTHORITATIVE published set at
// converged/quiescent states, including freeze + unreachable? Mirrors
// membership-owner-equivalence.test.js, but the verdicts are produced by the REAL
// MembershipSwimDetector (fed probe outcomes on the virtual clock), and the active
// set is derived by the REAL computeSwimActiveMemberSet — so it exercises the
// detector → active-set output contract end to end.
import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {
  MembershipSwimDetector,
  SWIM_MEMBER_STATE,
  computeSwimActiveMemberSet,
} from '../../src/control-plane/membership-swim-detector.js';

const FIXTURES = JSON.parse(
  readFileSync(
    new URL('./fixtures/membership-owner-converged-fixtures.json', import.meta.url),
  ),
).fixtures;

// At a converged state every published-active node is serving with fresh evidence,
// so the detector receives a successful probe for each and reports them all ALIVE.
function quiescentVerdicts(authNodeIds) {
  const detector = new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 7}),
  });
  for (const nodeId of authNodeIds) {
    detector.recordProbeResult(nodeId, true);
  }
  detector.tick();
  return detector.verdictByNodeId();
}

test('SWIM rule reproduces the authoritative published set on every converged fixture, from every node perspective', (t) => {
  t.ok(FIXTURES.length >= 10, `have a real fixture corpus (${FIXTURES.length})`);
  for (const fx of FIXTURES) {
    const auth = [...fx.authoritativePublishedActiveNodeIds].sort();
    const verdicts = quiescentVerdicts(auth);
    // Every auth node must be ALIVE at quiescence (no spurious suspicion).
    for (const nodeId of auth) {
      t.equal(verdicts[nodeId], SWIM_MEMBER_STATE.ALIVE, `${nodeId.slice(0, 8)} alive at quiescence`);
    }
    for (const localNodeId of auth) {
      const got = computeSwimActiveMemberSet({
        publishedBaselineNodeIds: auth,
        swimVerdictByNodeId: verdicts,
        memberStatesByNodeId: fx.memberStatesByNodeId,
        membershipFreezeActive: fx.membershipFreezeActive,
      });
      t.same(
        got,
        auth,
        `${fx.source} [freeze=${fx.membershipFreezeActive}] local=${localNodeId.slice(0, 8)}`,
      );
    }
  }
  t.end();
});

test('freeze clamp retains the baseline even when SWIM has CONFIRMED a member dead', (t) => {
  const frozen = FIXTURES.filter(
    (fx) =>
      fx.membershipFreezeActive === true &&
      Object.values(fx.memberStatesByNodeId).includes('unreachable'),
  );
  t.ok(frozen.length >= 1, `corpus contains freeze+unreachable states (${frozen.length})`);
  for (const fx of frozen) {
    const auth = [...fx.authoritativePublishedActiveNodeIds].sort();
    const unreachable = Object.keys(fx.memberStatesByNodeId).filter(
      (n) => fx.memberStatesByNodeId[n] === 'unreachable' && auth.includes(n),
    );
    // Build a hostile verdict map: drive the unreachable nodes all the way to DEAD.
    const detector = new MembershipSwimDetector({
      timeSource: new VirtualTimeSource({startMs: 0}),
      randomSource: new SeededRandomSource({seed: 7}),
    });
    for (const nodeId of auth) {
      detector.recordProbeResult(nodeId, !unreachable.includes(nodeId));
    }
    detector.tick(10 ** 9); // far past any suspicion deadline -> dead
    const verdicts = detector.verdictByNodeId();
    for (const nodeId of unreachable) {
      t.equal(verdicts[nodeId], SWIM_MEMBER_STATE.DEAD, `${nodeId.slice(0, 8)} confirmed dead`);
    }
    const got = computeSwimActiveMemberSet({
      publishedBaselineNodeIds: auth,
      swimVerdictByNodeId: verdicts,
      memberStatesByNodeId: fx.memberStatesByNodeId,
      membershipFreezeActive: true,
    });
    t.same(got, auth, `${fx.source}: freeze overrides dead verdict, baseline retained`);
  }
  t.end();
});

test('outside freeze, a CONFIRMED-dead baseline node is trimmed; suspect is NOT', (t) => {
  const auth = ['a', 'b', 'c'];
  const detector = new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 1}),
  });
  detector.recordProbeResult('a', true);
  detector.recordProbeResult('b', false); // suspect
  detector.tick(1); // advance just past scheduling, before b's deadline
  const verdicts = detector.verdictByNodeId();
  t.equal(verdicts.b, SWIM_MEMBER_STATE.SUSPECT, 'b is suspect, not yet dead');
  const got = computeSwimActiveMemberSet({
    publishedBaselineNodeIds: auth,
    swimVerdictByNodeId: verdicts,
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.same(got, ['a', 'b', 'c'], 'suspect b retained; untracked c retained');

  // Now confirm-dead b and assert it is trimmed.
  detector.tick(10 ** 9);
  const deadVerdicts = detector.verdictByNodeId();
  t.equal(deadVerdicts.b, SWIM_MEMBER_STATE.DEAD, 'b now dead');
  const trimmed = computeSwimActiveMemberSet({
    publishedBaselineNodeIds: auth,
    swimVerdictByNodeId: deadVerdicts,
    memberStatesByNodeId: {},
    membershipFreezeActive: false,
  });
  t.same(trimmed, ['a', 'c'], 'confirmed-dead b trimmed outside freeze');
  t.end();
});
