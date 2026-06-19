import {test} from '../../src/test-helpers/tap.js';
import LifeRaft from '../../src/raft/liferaft.js';

// Census run2 rank2: the busy seed (leads 30-34 partitions) heartbeat-starves under
// post-restart load; followers whose election timer fires on a TRANSIENT late heartbeat
// from the still-CONNECTED leader used to promote immediately, monotonically inflating the
// term (sql_write_operations-p1: 1->3->18->...->34) without any follower ever winning, which
// churned leadership, orphaned SYNCING->ACTIVE advances, and abandoned the over-target drain.
// liferaft has no pre-vote / CheckQuorum / leader-lease. The fix adds a heartbeat-recency grace
// to promote(): a follower with RECENT leader contact re-arms instead of inflating the term;
// a follower whose contact aged past the lease still promotes (liveness preserved).

const WINDOW_MS = 100; // election min == max == 100ms -> grace lease = 200ms.

function makeFollower(t) {
  const node = new LifeRaft('node-under-test', {
    'election min': `${WINDOW_MS} ms`,
    'election max': `${WINDOW_MS} ms`,
    'heartbeat': `${WINDOW_MS} ms`,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
  });
  t.teardown(() => node.end());
  node.change({leader: 'peer-leader', state: LifeRaft.FOLLOWER});
  return node;
}

test(
  'census rank2: a FOLLOWER with RECENT leader contact defers promotion (no term inflation)',
  async (t) => {
    const node = makeFollower(t);
    const termBefore = node.term;
    // Leader contact just now — well within the 200ms grace lease.
    node._lastLeaderContactAtMs = Date.now();
    let deferred = false;
    node.once('promotion deferred', () => {
      deferred = true;
    });

    await node.promote();

    t.ok(deferred, 'promotion was deferred (heartbeat-recency grace held)');
    t.equal(node.term, termBefore, 'the term did NOT inflate');
    t.equal(node.state, LifeRaft.FOLLOWER,
      'the node stayed a FOLLOWER instead of starting a doomed election ' +
      '(RED on revert: without the guard it promotes and increments the term)');
  },
);

test(
  'census rank2: a FOLLOWER whose leader contact aged PAST the lease still promotes (liveness)',
  async (t) => {
    const node = makeFollower(t);
    // Last heard from the leader 1000ms ago >> the 200ms grace lease: a genuinely silent
    // leader must still be challenged so the cluster is not stranded leaderless.
    node._lastLeaderContactAtMs = Date.now() - 1000;
    let deferred = false;
    node.once('promotion deferred', () => {
      deferred = true;
    });

    await node.promote();

    t.notOk(deferred, 'promotion was NOT deferred for a genuinely silent leader');
    t.not(node.state, LifeRaft.FOLLOWER,
      'the node left FOLLOWER (became candidate/leader) — liveness preserved past the lease');
  },
);

test(
  'census rank2: a node with NO known leader promotes immediately (cold start / leaderless)',
  async (t) => {
    const node = makeFollower(t);
    node.change({leader: null});
    node._lastLeaderContactAtMs = Date.now();
    let deferred = false;
    node.once('promotion deferred', () => {
      deferred = true;
    });

    await node.promote();

    t.notOk(deferred,
      'a leaderless node is never deferred (the grace only protects a KNOWN current leader)');
  },
);
