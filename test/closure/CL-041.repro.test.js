import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftRsNetwork} from '../test-helpers/raft-rs-network-host.js';

// CL-041 — one vote per term, on real raft-rs operation ports
// (solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-041.md).
//
// Invariant (Raft §5.2): a server grants its vote to AT MOST ONE candidate in a given term, so at
// most one leader can be elected per term (Election Safety). The retired runtime broke it with an
// asynchronous gap between its "already voted?" check and the vote record: two concurrent
// same-term requests both passed the check and both candidates could lead the same term.
//
// Here two real candidates stand at the same virtual instant, so they campaign for the SAME term
// and the third replica receives both vote requests in one delivery window. No replica times out by
// itself (one long shared election window); candidacy is the port's explicit campaign. Every
// replica's port status is sampled on each millisecond of virtual time: both candidacies must be
// observed in one term, no term may ever have two leaders, and the race resolves to one leader.

const IDS = Object.freeze(['A', 'B', 'F']);
const PARTITION_ID = 'cl-041-one-vote-per-term';
const ELECTION_WINDOW_MS = 100000;
const RUN_MS = 300;
const LEADER_ROLE = 'leader';
const CANDIDATE_ROLE = 'candidate';

function record(byTerm, term, id) {
  if (!byTerm.has(term)) {
    byTerm.set(term, new Set());
  }
  byTerm.get(term).add(id);
}

t.test('a voter grants at most one candidate per term (no two leaders in a term)',
  async (t) => {
    const net = createVirtualNetwork();
    const host = connectRaftRsNetwork(net, IDS,
      {partitionId: PARTITION_ID, electionMinMs: ELECTION_WINDOW_MS});
    t.teardown(() => host.dispose());
    host.start();

    host.campaign('A');
    host.campaign('B');
    const leadersByTerm = new Map();
    const candidatesByTerm = new Map();
    for (let now = 1; now <= RUN_MS; now += 1) {
      await host.runUntil(now);
      for (const id of IDS) {
        const {role, term} = host.status(id);
        if (role === LEADER_ROLE) {
          record(leadersByTerm, Number(term), id);
        } else if (role === CANDIDATE_ROLE) {
          record(candidatesByTerm, Number(term), id);
        }
      }
    }

    const contestedTerms = [...candidatesByTerm.entries()]
      .filter(([, ids]) => ids.has('A') && ids.has('B'))
      .map(([term]) => term);
    t.ok(contestedTerms.length > 0,
      `both candidates stood for the same term (candidates by term: ${
        JSON.stringify([...candidatesByTerm].map(([term, ids]) => [term, [...ids]]))})`);
    const doubleLedTerms = [...leadersByTerm.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([term, ids]) => ({term, leaders: [...ids]}));
    t.same(doubleLedTerms, [],
      'no term ever had two leaders: the contested voter granted exactly one candidate');
    t.equal(IDS.filter((id) => host.isLeader(id)).length, 1,
      'the same-term race resolves to exactly one leader');
  });
