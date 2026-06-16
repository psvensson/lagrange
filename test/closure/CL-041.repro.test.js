import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

// CL-041 — deterministic unit repro of the @markwylde/liferaft vote-handler double-vote TOCTOU
// (record: .kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-041.md).
//
// First violated invariant (Raft §5.2 — one vote per term): a server grants its vote to AT MOST
// ONE candidate in a given term. liferaft's `vote` handler races: the `await raft.log.getLastInfo()`
// (only present when a log adapter is configured — the production message-group raft) sits BETWEEN
// the "have I already voted?" check (`if (raft.votes.for && ...)`) and the assignment
// (`raft.votes.for = packet.address`). Two concurrent same-term vote requests both pass the check
// before either records the vote → the follower grants BOTH → both candidates can reach quorum →
// two leaders in one term → split-brain / committed-log divergence.
//
// This is a unit repro: no VirtualNetwork, no driveNetwork — just one real follower (with a log)
// receiving two real vote packets concurrently (two synchronous `emit('data')` calls, exactly what
// a real event loop does when two packets arrive close together). It asserts the follower grants at
// most one. Red without the fix; green with src/raft/liferaft.js vote serialization. Red-on-revert.

function flush(turns = 80) {
  let p = Promise.resolve();
  for (let i = 0; i < turns; i += 1) {
    p = p.then(() => undefined);
  }
  return p;
}

function makeNode(address) {
  return new LifeRaft(address, {
    'election min': '100000 ms',
    'election max': '100000 ms',
    'heartbeat': '100000 ms',
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    'Log': InMemoryLogAdapter, // a real log => the vote handler takes the await path (the race)
  });
}

t.test('a follower with a log grants at most one candidate per term (no double-vote)',
  async (t) => {
    const candidateA = makeNode('A');
    const candidateB = makeNode('B');
    const follower = makeNode('F');
    t.teardown(() => [candidateA, candidateB, follower].forEach((n) => n.end()));

    const grantedTo = [];
    follower.on('vote', (packet, granted) => {
      if (granted) {
        grantedTo.push(packet.address);
      }
    });
    // Two real candidates stand in the SAME term; build their real vote packets.
    candidateA.term = 5;
    candidateB.term = 5;
    const voteFromA = await candidateA.packet('vote');
    const voteFromB = await candidateB.packet('vote');

    // Concurrent delivery: emit both before either's async handler settles.
    follower.emit('data', voteFromA, () => {});
    follower.emit('data', voteFromB, () => {});
    await flush();

    t.equal(grantedTo.length, 1,
      `the follower granted its vote to exactly one candidate in term 5 (granted: ${grantedTo})`);
  });
