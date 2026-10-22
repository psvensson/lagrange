import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {connectRaftRsNetwork} from '../test-helpers/raft-rs-network-host.js';

// CL-042 — the election restriction against an empty-log higher-term candidate, on real raft-rs
// operation ports (solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-042.md).
//
// Invariant (Raft §5.4.1 Leader Completeness): a server grants its vote only to a candidate whose
// log is at least as up-to-date as its own, so a node lacking committed entries can never lead and
// overwrite them. The retired runtime broke it by masquerading an empty log's last-log term as the
// node's current term, so an isolated empty-log node that inflated its term through failed
// elections won the vote of a replica holding committed entries.
//
// That trigger is reachable under the production group tuning (raft-rs-group-constants.js: pre_vote
// and check_quorum are off): the isolated node's own election timeouts raise its term, and on heal
// its higher term makes the leader step down — an availability cost this witness does not claim
// away. What must hold is safety: the raft-rs core compares the real last-log term (an empty log's
// is 0), every replica holding the committed entry refuses it, it never leads, and the entry it
// lacks is never overwritten. The test reads only port status and committed entries.

const IDS = Object.freeze(['L', 'V', 'C']);
const PARTITION_ID = 'cl-042-election-restriction';
const ELECTION_WINDOW_MS = 150;
const ISOLATED_UNTIL_MS = 1500;
const HEALED_RUN_MS = 2500;
const SAMPLE_MS = 5;

function committedTags(host, id) {
  return host.committedEntries(id)
    .map(({command}) => command && command.tag)
    .filter(Boolean);
}

function committedDivergence(host) {
  const byIndex = new Map();
  for (const id of IDS) {
    for (const {index, term, command} of host.committedEntries(id)) {
      if (!byIndex.has(index)) {
        byIndex.set(index, new Set());
      }
      byIndex.get(index).add(JSON.stringify({term, command}));
    }
  }
  return [...byIndex.entries()].filter(([, prints]) => prints.size > 1).map(([index]) => index);
}

t.test('replicas holding a committed entry refuse an empty-log higher-term candidate',
  async (t) => {
    const net = createVirtualNetwork();
    const host = connectRaftRsNetwork(net, IDS,
      {partitionId: PARTITION_ID, electionMinMs: ELECTION_WINDOW_MS});
    t.teardown(() => host.dispose());
    net.partition('C', 'L');
    net.partition('C', 'V');
    host.start();

    // The valid leader commits X with V while C stays isolated with an empty log.
    host.campaign('L');
    await host.runUntil(100);
    t.ok(host.isLeader('L'), 'L leads');
    Promise.resolve(host.propose('L', {tag: 'X'})).catch(() => undefined);
    await host.runUntil(ISOLATED_UNTIL_MS);
    t.ok(committedTags(host, 'L').includes('X') && committedTags(host, 'V').includes('X'),
      'the leader and its voter committed X');
    t.same(committedTags(host, 'C'), [], 'the isolated candidate holds no committed entry');
    t.ok(host.term('C') > host.term('L'),
      'the trigger is reached: the empty-log candidate\'s failed elections raised its term ' +
      `(C=${host.term('C')}, L=${host.term('L')})`);

    // Heal: its higher-term vote requests reach the replicas holding X.
    net.heal('C', 'L');
    net.heal('C', 'V');
    const violations = [];
    for (let until = ISOLATED_UNTIL_MS + SAMPLE_MS; until <= ISOLATED_UNTIL_MS + HEALED_RUN_MS;
      until += SAMPLE_MS) {
      await host.runUntil(until);
      for (const id of IDS.filter((replica) => host.isLeader(replica))) {
        if (id === 'C' || !committedTags(host, id).includes('X')) {
          violations.push({at: until, leader: id, committed: committedTags(host, id)});
        }
      }
    }
    t.same(violations, [],
      'the empty-log candidate never led; every leader held the committed entry');
    t.ok(IDS.some((id) => host.isLeader(id)), 'an up-to-date leader leads after the heal');
    for (const id of IDS) {
      t.ok(committedTags(host, id).includes('X'), `${id} holds the committed entry X`);
    }
    t.same(committedDivergence(host), [], 'no index carries two distinct committed entries');
  });
