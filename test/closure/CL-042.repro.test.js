import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';

// CL-042 — deterministic unit repro of the @markwylde/liferaft + log-adapter Leader-Completeness
// hole (Raft §5.4.1 election restriction). Record:
// solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-042.md
//
// First violated invariant (Raft §5.4.1): a server grants its vote only if the candidate's log is
// at least as up-to-date as its own. An EMPTY log has last-log-term 0, but the adapters
// (InMemoryLogAdapter / SqliteLogAdapter, mirroring base liferaft) masquerade an empty log's
// last-log-term as `node.term`. So an isolated node with an EMPTY log that has bumped its term via
// repeated failed elections advertises a fake HIGH last-log-term — and a voter that holds COMMITTED
// entries grants it. That empty-log candidate then wins leadership WITHOUT the committed entries
// (Leader-Completeness violation) and overwrites them → two different committed commands at one
// index (State-Machine-Safety violation). This is the root cause of the raft-safety-sweep's
// seed-21 residual committed-divergence (confirmed harness-free).
//
// This is a unit repro: no VirtualNetwork, no driveNetwork — a voter holding a committed entry
// receives a real empty-log high-term vote packet and must DENY it. Red without the fix (grants),
// green with the src/raft/liferaft.js vote-path empty-log last-term normalization. Red-on-revert.

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
    'Log': InMemoryLogAdapter,
  });
}

t.test('a voter holding a committed entry denies an empty-log higher-term candidate',
  async (t) => {
    // An isolated empty-log node that bumped its term to 11 via failed elections.
    const emptyCandidate = makeNode('C');
    emptyCandidate.term = 11;
    // A voter that holds a COMMITTED entry at index 1, term 1.
    const voter = makeNode('V');
    voter.term = 1;
    await voter.log.saveCommand({op: 'x'}, 1, 1);
    await voter.log.commit(1);
    t.teardown(() => [emptyCandidate, voter].forEach((n) => n.end()));

    const grantedTo = [];
    voter.on('vote', (packet, granted) => {
      if (granted) {
        grantedTo.push(packet.address);
      }
    });

    const emptyLogVote = await emptyCandidate.packet('vote');
    voter.emit('data', emptyLogVote, () => {});
    await flush();

    t.notOk(grantedTo.includes('C'),
      'the voter must NOT grant an empty-log candidate while it holds a committed entry ' +
      `(granted: ${grantedTo})`);
    t.not(voter.votes.for, 'C',
      'the voter did not record its vote for the empty-log candidate');
  });
