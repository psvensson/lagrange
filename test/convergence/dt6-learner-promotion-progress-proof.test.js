/**
 * Scenario 'learner-promotion-progress-proof' (quest
 * learner-promotion-progress-proof): a five-node recovery scenario over the
 * REAL owners — a live PartitionService leader, three live followers and
 * the learner on a loopback transport with real replication through each
 * partition's rs-raft operation port, real proof RPC over the
 * application-message channel, and the real promotion gate chain.
 *
 * FIDELITY: in-process deterministic guard (loopback transport, single
 * process). Every voter the leader's configuration names is a live replica
 * the leader admitted through its production peer path, so the services
 * rows the quorum-shape gates count each name a live voter. Replication lag
 * is injected by losing leader->learner deliveries — a one-way partition of
 * the replication path.
 *
 * Sealed contract exercised end-to-end:
 *  - a deliberately lagging learner is NEVER promoted, no matter how many
 *    retry ticks elapse (refusals are typed progress_behind);
 *  - once the partition heals and the leader OBSERVES the learner applied
 *    through the safe promotion index, promotion happens within a couple of
 *    retry ticks (never a 30s stability wait — reintroducing time-only
 *    promotion fails this deterministically);
 *  - a term change after proof collection invalidates the proof
 *    (stale_proof_term), and promotion resumes when the term matches again;
 *  - a membership-epoch divergence refuses (epoch_mismatch) until the
 *    caches converge;
 *  - the leader's progress probe answers with typed outcomes: for a
 *    learner it holds no acknowledged progress for, it sends
 *    (progress-probe-sent); for an idle learner that caught up through real
 *    replication, it observes (progress-observed, the match index covering
 *    the committed prefix), and promotion follows through the SAME contract;
 *  - the quorum-shape gates still refuse (would_exceed_target_replica_count)
 *    even when the progress proof would grant.
 *
 * The sealed idle-learner claim - "an exactly-caught-up learner with NO
 * progress evidence at the leader (the snapshot-installed shape) promotes
 * because the probe materialises the ack evidence" - cannot be exercised on
 * rs-raft and is recorded, not faked (epic raft-rs-full-cutover,
 * solve/epics/raft-rs-full-cutover/findings-2026-09-23.md):
 *  - F5: snapshot/catch-up is unowned on rs-raft, so no snapshot-installed
 *    learner shape exists to build; a learner catches up only through real
 *    replication, which advances the leader's matched index, and nothing
 *    clears the core's progress record afterwards (matched stays);
 *  - F18: the rs-raft probe was inert (progress-observed for any finite
 *    matched index, 0 included, and nothing sent).
 * So the idle case is the explicit witness of the probe's typed outcomes;
 * its progress-probe-sent assertion is red until the runtime owner makes
 * the probe honest (F18).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {RaftRole} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
} from '../../src/raft/learner-promotion-progress.js';
import {RAFT_PEER_PROGRESS_PROBE_REASON} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  LEARNER_ADDRESS,
  NO_ACKNOWLEDGED_MATCH_INDEX,
  configureFixtureRuntime,
  createFiveNodeFixture,
  insertPublishedEpochRow,
  observeLearnerTerm,
  resetFixtureRuntime,
  waitFor,
  waitForLeaderReplicationToLearner,
} from './dt6-learner-promotion-fixture.js';

const LAG_OBSERVATION_MS = 300;
const PROMOTION_BUDGET_MS = 5000;
const PUBLICATION_EPOCH_ONE = 1;

// The learner's proof channel with a gate: while closed, every promotion
// proof request is lost in the network (the learner's typed transport
// refusal, retried on its cadence), so no proof the leader could grant
// reaches the learner and no leader-side probe is triggered by one.
function gatedProofChannel(inner, gate) {
  return {
    register: (address, handler) => inner.register(address, handler),
    unregister: (address) => inner.unregister(address),
    deliver: async (address, payload, options) => {
      if (gate.closed &&
          payload?.type === PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF) {
        return undefined;
      }
      return inner.deliver(address, payload, options);
    },
  };
}

beforeEach(() => {
  configureFixtureRuntime();
});

afterEach(() => {
  resetFixtureRuntime();
});

test('lagging learner is never promoted by elapsed time; healing the ' +
  'replication path promotes via the leader-observed applied index',
async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {leader, learner, leaderTransport, deferrals} = fixture;
  try {
    const partitioned = leader.raft.readStatus();
    const committedPrefix = partitioned.commitIndex;
    t.ok(partitioned.peers.some((peer) =>
      peer.address === LEARNER_ADDRESS && peer.learner === false),
    'recovery precondition: committed membership names the voter whose ' +
      'prefix is partitioned');

    // Phase A: many retry ticks elapse while replication is partitioned.
    await new Promise((resolve) => setTimeout(resolve, LAG_OBSERVATION_MS));
    t.equal(
      learner.role,
      RaftRole.LEARNER,
      'a lagging learner is never promoted no matter how much time passes',
    );
    const progressRefusals = deferrals.filter(
      (d) => d.proofReason === LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND,
    );
    t.ok(
      progressRefusals.length > 0,
      'the refusing gate is the progress proof (typed progress_behind), ' +
        'not leader discovery or quorum shape',
    );
    t.equal(
      leader.raft.readStatus().followerProgress[LEARNER_ADDRESS],
      NO_ACKNOWLEDGED_MATCH_INDEX,
      'the leader holds no progress evidence for the partitioned learner',
    );

    // Phase B: heal the replication path; catch-up flows (append-fail ->
    // batch), the leader observes the acks, and the very next proof retry
    // grants. Budget is a few retry ticks — a 30s stability floor would
    // fail this deterministically.
    leaderTransport.state.dropToLearner = false;
    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      promoted,
      true,
      'the proven learner promotes within the retry cadence, not 30s',
    );
    const matchIndex =
      leader.raft.readStatus().followerProgress[LEARNER_ADDRESS];
    t.ok(
      Number.isFinite(matchIndex),
      'promotion happened only after the leader observed learner progress',
    );
    t.ok(
      matchIndex >= committedPrefix,
      'the leader-observed match index covers the safe promotion index',
    );
    t.equal(
      learner.electionStarted,
      true,
      'the promoted voter participates in elections',
    );
  } finally {
    await fixture.shutdown();
  }
});

test('a term change after proof collection invalidates the proof ' +
  '(stale leader); promotion resumes when the term matches again',
async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {learner, leaderTransport} = fixture;
  let restoreLearnerTerm = null;
  try {
    // Interleave: capture the REAL granted proof, then observe a newer term
    // before the validation runs — the exact "leader change after proof
    // collection" attack.
    const realRequest =
      learner.requestLearnerPromotionProofFromLeader.bind(learner);
    let staleInjected = false;
    learner.requestLearnerPromotionProofFromLeader = async (observation) => {
      const proof = await realRequest(observation);
      if (
        proof.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED &&
        !staleInjected
      ) {
        staleInjected = true;
        restoreLearnerTerm = observeLearnerTerm(learner, proof.term + 1);
      }
      return proof;
    };

    leaderTransport.state.dropToLearner = false;
    const staleRefusalSeen = await waitFor(
      () => fixture.deferrals.some(
        (d) => d.reason ===
          LEARNER_PROMOTION_PROOF_REASON.STALE_PROOF_TERM,
      ),
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      staleRefusalSeen,
      true,
      'a proof whose term is behind the learner is refused as stale',
    );
    t.equal(
      learner.role,
      RaftRole.LEARNER,
      'the invalidated proof never promotes',
    );

    // Recovery: the learner observes the proof term again (the "new leader"
    // proved it) — promotion completes through the same contract: the real
    // port again reports the proof's term.
    restoreLearnerTerm();
    restoreLearnerTerm = null;
    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(promoted, true, 'promotion resumes once the term matches');
  } finally {
    if (restoreLearnerTerm) {
      restoreLearnerTerm();
    }
    await fixture.shutdown();
  }
});

test('a membership-epoch divergence refuses promotion until the caches ' +
  'converge', async (t) => {
  const fixture = await createFiveNodeFixture({
    startPartitioned: true,
    splitCaches: true,
  });
  const {learner, learnerCache, leaderCache, leaderTransport} = fixture;
  try {
    // The learner observes a published membership epoch the leader has not
    // seen yet — the proof must refuse (epoch binding), fail-closed.
    insertPublishedEpochRow(learnerCache, PUBLICATION_EPOCH_ONE);
    leaderTransport.state.dropToLearner = false;

    const epochRefusalSeen = await waitFor(
      () => fixture.deferrals.some(
        (d) => d.proofReason ===
          LEARNER_PROMOTION_PROOF_REASON.EPOCH_MISMATCH,
      ),
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      epochRefusalSeen,
      true,
      'a membership-epoch mismatch refuses the proof (typed epoch_mismatch)',
    );
    t.equal(
      learner.role,
      RaftRole.LEARNER,
      'no promotion across a membership-epoch divergence',
    );

    // Convergence: the leader observes the same published epoch.
    insertPublishedEpochRow(leaderCache, PUBLICATION_EPOCH_ONE);
    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(promoted, true, 'promotion completes once the epochs converge');
  } finally {
    await fixture.shutdown();
  }
});

test('the leader progress probe answers with typed outcomes: it sends to a ' +
  'learner without acknowledged progress, and observes an idle learner ' +
  'caught up through real replication, whose promotion then follows',
async (t) => {
  const gate = {closed: true};
  const fixture = await createFiveNodeFixture({
    startPartitioned: true,
    wrapLearnerTransport: (inner) => gatedProofChannel(inner, gate),
  });
  const {leader, learner, leaderTransport} = fixture;
  try {
    const partitioned = leader.raft.readStatus();
    t.equal(
      partitioned.followerProgress[LEARNER_ADDRESS],
      NO_ACKNOWLEDGED_MATCH_INDEX,
      'precondition: the leader holds no acknowledged progress for the ' +
        'partitioned learner',
    );
    t.ok(partitioned.peers.some((peer) =>
      peer.address === LEARNER_ADDRESS && peer.learner === false),
    'precondition: committed membership names the learner voter whose ' +
      'prefix is absent');

    // Typed outcome 1: behind (matched below the committed prefix) - the
    // probe triggers one append to the learner (lost here: the replication
    // path is still partitioned).
    t.match(
      await leader.raft.probePeerProgress(LEARNER_ADDRESS),
      {
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        reason: RAFT_PEER_PROGRESS_PROBE_REASON.PROGRESS_PROBE_SENT,
      },
      'for a learner with no acknowledged progress the probe sends ' +
        '(typed progress-probe-sent; F18: the inert rs-raft probe reports ' +
        'progress-observed at match index 0 and sends nothing)',
    );

    // The learner catches up through real replication while its proof
    // channel is closed, then goes idle: the leader->learner path is lost
    // again, so no append, heartbeat or ack flows.
    leaderTransport.state.dropToLearner = false;
    t.equal(
      await waitForLeaderReplicationToLearner(leader, PROMOTION_BUDGET_MS),
      true,
      'the learner catches up through real replication',
    );
    t.equal(
      learner.role,
      RaftRole.LEARNER,
      'no promotion while no proof reaches the learner',
    );
    leaderTransport.state.dropToLearner = true;

    // Typed outcome 2: caught up - the probe observes the leader's own
    // progress record, which covers the committed prefix.
    const observed = await leader.raft.probePeerProgress(LEARNER_ADDRESS);
    t.match(
      observed,
      {
        outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        reason: RAFT_PEER_PROGRESS_PROBE_REASON.PROGRESS_OBSERVED,
      },
      'for the idle caught-up learner the probe reports typed ' +
        RAFT_PEER_PROGRESS_PROBE_REASON.PROGRESS_OBSERVED,
    );
    t.ok(
      observed.matchIndex >= partitioned.commitIndex,
      'the observed match index covers the safe promotion index ' +
        `(${observed.matchIndex} >= ${partitioned.commitIndex})`,
    );

    // The proof channel opens: promotion follows through the same progress
    // contract with the learner still idle.
    gate.closed = false;
    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      promoted,
      true,
      'the idle caught-up learner promotes through the same progress ' +
        'contract once its proof reaches the leader',
    );
  } finally {
    await fixture.shutdown();
  }
});

test('quorum-shape gates still refuse even when the progress proof would ' +
  'grant', async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {learner, leaderTransport} = fixture;
  try {
    // Add two surplus ACTIVE voters while the learner still lags (target 5,
    // 6 active): even the single-replacement-above-target allowance cannot
    // admit a 7th voter, so promotion must defer on the replica-count
    // ceiling regardless of replication progress. Each surplus voter is a
    // live replica the leader admits, like every other voter.
    await fixture.admitSurplusVoter('replica-6', 'node-6');
    await fixture.admitSurplusVoter('replica-7', 'node-7');
    leaderTransport.state.dropToLearner = false;

    const ceilingDeferralSeen = await waitFor(
      () => fixture.deferrals.some(
        (d) => d.reason === 'would_exceed_target_replica_count',
      ),
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      ceilingDeferralSeen,
      true,
      'the target-replica-count gate still refuses with its typed reason',
    );
    t.equal(
      learner.role,
      RaftRole.LEARNER,
      'the progress proof is an additional necessary condition - it never ' +
        'weakens a quorum-shape gate',
    );
  } finally {
    await fixture.shutdown();
  }
});
