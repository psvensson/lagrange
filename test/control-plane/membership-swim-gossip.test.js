// SWIM dissemination (increment 3b): the infection-style gossip that propagates
// suspect/alive/incarnation updates and drives refutation — the half missing from the
// probe-only detector that the flag-on gate exposed (false-positive deaths with no
// way to refute). Pure unit tests on the virtual clock + seeded RNG.
import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipSwimDetector,
  SWIM_MEMBER_STATE,
} from '../../src/control-plane/membership-swim-detector.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';

function detector(localNodeId) {
  return new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    randomSource: new SeededRandomSource({seed: 4}),
    localNodeId,
  });
}

test('a suspicion transition enqueues a gossip update that drainGossip returns', (t) => {
  const d = detector('A');
  d.recordProbeResult('B', false); // ALIVE -> SUSPECT
  const drained = d.drainGossip();
  t.equal(drained.length, 1, 'one pending update');
  t.equal(drained[0].nodeId, 'B');
  t.equal(drained[0].state, SWIM_MEMBER_STATE.SUSPECT);
  t.end();
});

test('drainGossip fades an update out after its retransmit budget', (t) => {
  const d = detector('A');
  d.recordProbeResult('B', false);
  // n=1 tracked => budget = ceil(4*log10(2)) = ceil(1.2) = 2 drains.
  let rounds = 0;
  while (d.drainGossip().length > 0) {
    rounds++;
    if (rounds > 20) {
      break;
    }
  }
  t.equal(rounds, 2, 'update gossiped exactly its budget then drops');
  t.equal(d.pendingGossipCount(), 0, 'buffer empty after fade-out');
  t.end();
});

test('drainGossip respects the max piggyback limit', (t) => {
  const d = detector('A');
  d.recordProbeResult('B', false);
  d.recordProbeResult('C', false);
  d.recordProbeResult('D', false);
  const drained = d.drainGossip(2);
  t.equal(drained.length, 2, 'capped at max');
  t.end();
});

test('applyGossip alive refutes a local suspicion at a higher incarnation', (t) => {
  const d = detector('A');
  d.recordSuspect('B', 'X', 0); // B suspect at inc 0
  t.equal(d.verdictFor('B'), SWIM_MEMBER_STATE.SUSPECT);
  d.applyGossip([{nodeId: 'B', state: SWIM_MEMBER_STATE.ALIVE, incarnation: 1}], 'C');
  t.equal(d.verdictFor('B'), SWIM_MEMBER_STATE.ALIVE, 'higher-incarnation alive gossip refutes');
  t.end();
});

test('applyGossip suspect raises local suspicion', (t) => {
  const d = detector('A');
  d.applyGossip([{nodeId: 'B', state: SWIM_MEMBER_STATE.SUSPECT, incarnation: 0}], 'C');
  t.equal(d.verdictFor('B'), SWIM_MEMBER_STATE.SUSPECT, 'gossiped suspect raises suspicion');
  t.end();
});

test('applyGossip dead is applied conservatively as a suspicion, not immediate death', (t) => {
  const d = detector('A');
  d.applyGossip([{nodeId: 'B', state: SWIM_MEMBER_STATE.DEAD, incarnation: 0}], 'C');
  t.equal(
    d.verdictFor('B'),
    SWIM_MEMBER_STATE.SUSPECT,
    'dead gossip => local suspicion (local timer + refutation confirm), not amplified death',
  );
  t.end();
});

test('applyGossip self-suspicion bumps own incarnation and enqueues a refuting alive', (t) => {
  const d = detector('A');
  d.applyGossip([{nodeId: 'A', state: SWIM_MEMBER_STATE.SUSPECT, incarnation: 0}], 'C');
  t.equal(d.selfIncarnation(), 1, 'self incarnation bumped to refute');
  const drained = d.drainGossip();
  const selfAlive = drained.find((u) => u.nodeId === 'A');
  t.ok(selfAlive, 'a refuting self-alive is queued for gossip');
  t.equal(selfAlive.state, SWIM_MEMBER_STATE.ALIVE);
  t.equal(selfAlive.incarnation, 1);
  t.end();
});

test('end-to-end refutation loop: a false suspicion is healed via gossip (the fix)', (t) => {
  // A cannot reach B and suspects it; B learns of the suspicion via gossip, bumps
  // its incarnation, and its refuting alive propagates back to A, clearing the
  // false death. This is the loop the probe-only detector lacked.
  const dA = detector('A');
  const dB = detector('B');

  dA.recordProbeResult('B', false); // A falsely suspects B (A's link to B is down)
  t.equal(dA.verdictFor('B'), SWIM_MEMBER_STATE.SUSPECT);

  const fromA = dA.drainGossip(); // [{B, suspect, 0}]
  dB.applyGossip(fromA, 'A'); // B sees it is suspected -> refutes
  t.equal(dB.selfIncarnation(), 1, 'B refuted by bumping incarnation');

  const fromB = dB.drainGossip(); // [{B, alive, 1}]
  dA.applyGossip(fromB, 'B'); // A learns B is alive at the higher incarnation
  t.equal(dA.verdictFor('B'), SWIM_MEMBER_STATE.ALIVE, 'A cleared the false suspicion');
  t.end();
});
