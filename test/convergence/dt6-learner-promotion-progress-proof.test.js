/**
 * Scenario 'learner-promotion-progress-proof' (quest
 * learner-promotion-progress-proof): a five-node recovery scenario over the
 * REAL owners — live PartitionService leader + learner on a loopback
 * transport with real liferaft replication, real proof RPC over the
 * application-message channel, and the real promotion gate chain.
 *
 * FIDELITY: in-process deterministic guard (loopback transport, single
 * process). The three passive voters are authoritative service rows (the
 * quorum-shape gates read the cache, not live sockets); the leader and the
 * learner are fully live. Replication lag is injected by dropping
 * leader->learner deliveries — a one-way partition of the replication path.
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
 *  - an idle, exactly-caught-up learner (the snapshot-installed shape: full
 *    log, no traffic, so no acks) still promotes through the SAME contract
 *    via the leader's progress probe;
 *  - the quorum-shape gates still refuse (would_exceed_target_replica_count)
 *    even when the progress proof would grant.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  createLoopbackTransport,
} from '../partition/partition-service-test-support.js';
import {
  PartitionService,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
} from '../../src/raft/learner-promotion-progress.js';
import {
  FOLLOWER_MATCH_INDEX_STATE,
  readFollowerMatchIndex,
} from '../../src/raft/liferaft.js';

const PARTITION_ID = 'progress-proof-p1';
const TABLE_NAME = 'progress_proof_table';
const LEADER_REPLICA = 'replica-1';
const LEADER_NODE = 'node-1';
const LEADER_ADDRESS = `${LEADER_NODE}/partition/${LEADER_REPLICA}`;
const LEARNER_REPLICA = 'replica-5';
const LEARNER_NODE = 'node-5';
const LEARNER_ADDRESS = `${LEARNER_NODE}/partition/${LEARNER_REPLICA}`;
const PASSIVE_VOTERS = [
  ['replica-2', 'node-2'],
  ['replica-3', 'node-3'],
  ['replica-4', 'node-4'],
];
const TARGET_REPLICA_COUNT = 5;
const COMMITTED_ENTRY_COUNT = 3;
const RETRY_INTERVAL_MS = 25;
const LAG_OBSERVATION_MS = 300;
const PROMOTION_BUDGET_MS = 5000;
const POLL_MS = 10;
const NOOP_COMMAND_TYPE = 'progress-proof-noop';
const PUBLICATION_EPOCH_ONE = 1;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    raft: {
      heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
    },
  });
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function waitFor(predicate, timeoutMs, pollMs = POLL_MS) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      if (predicate()) {
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, pollMs);
    };
    poll();
  });
}

function insertServiceRow(cache, replicaId, nodeId, raftRole) {
  cache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
  });
}

// Seeded in two stages: the leader must initialize (and mint its committed
// prefix) while its raft view is genuinely single-replica; joining the
// passive voter rows earlier would make its own peer reconcile block the
// single-replica commit quorum (the same order the proven stable-join
// fixtures use).
function seedBootstrapTopology(cache) {
  cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    partition_id: PARTITION_ID,
    replica_count: TARGET_REPLICA_COUNT,
  });
  insertServiceRow(cache, LEADER_REPLICA, LEADER_NODE, RaftRole.LEADER);
}

function seedRecoveryTopology(cache, options = {}) {
  for (const [replicaId, nodeId] of PASSIVE_VOTERS) {
    insertServiceRow(cache, replicaId, nodeId, RaftRole.FOLLOWER);
  }
  if (options.learnerRow !== false) {
    insertServiceRow(cache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER);
  }
}

function insertPublishedEpochRow(cache, epoch) {
  cache.applySystemTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDCOperation.INSERT,
    {
      publication_id: `publication-epoch-${epoch}`,
      status: 'PUBLISHED',
      publication_epoch: epoch,
    },
  );
}

// One-way replication partition: while engaged, every leader->learner
// delivery is dropped (append fan-out, catch-up batches, probes). The
// learner->leader direction (proof RPC, acks it cannot send anyway) stays up.
function createPartitionableTransport(inner) {
  const state = {dropToLearner: false};
  return {
    state,
    register: (address, handler) => inner.register(address, handler),
    unregister: (address) => inner.unregister(address),
    deliver: async (address, payload, options) => {
      if (state.dropToLearner && address === LEARNER_ADDRESS) {
        throw new Error('injected replication partition');
      }
      return inner.deliver(address, payload, options);
    },
  };
}

async function createLeader(transport, cache) {
  const leader = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: LEADER_REPLICA,
    replicaIds: [LEADER_REPLICA],
    nodeId: LEADER_NODE,
    transport,
    systemTableCache: cache,
    dbPath: ':memory:',
  });
  await leader.initialize();
  for (let seq = 1; seq <= COMMITTED_ENTRY_COUNT; seq++) {
    await leader.raftProvider.propose(leader.raft, {
      type: NOOP_COMMAND_TYPE,
      seq,
    });
  }
  // Base liferaft only commits on follower acks; a single-replica leader is
  // its own quorum, so commit the appended prefix explicitly (how the
  // prefix became committed is a precondition here, not the mechanism under
  // test — the proof consumes committedIndex however it advanced).
  const uncommittedEntries = await leader.raft.log.getUncommittedEntriesUpToIndex(
    COMMITTED_ENTRY_COUNT,
    leader.raft.term,
  );
  await leader.raft.commitEntries(uncommittedEntries);
  return leader;
}

async function createLearner(transport, cache) {
  const learner = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: LEARNER_REPLICA,
    replicaIds: [LEADER_REPLICA, LEARNER_REPLICA],
    peerAddresses: [LEADER_ADDRESS, LEARNER_ADDRESS],
    nodeId: LEARNER_NODE,
    transport,
    systemTableCache: cache,
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    leaderAddress: LEADER_ADDRESS,
    learnerCatchUpCheckIntervalMs: RETRY_INTERVAL_MS,
  });
  await learner.initialize();
  return learner;
}

function recordPromotionDeferrals(learner) {
  const deferrals = [];
  const baseLogger = learner.logger;
  learner.logger = {
    info: (message, payload) => {
      if (payload && payload.replicaId === LEARNER_REPLICA &&
          typeof payload.reason === 'string') {
        deferrals.push({
          reason: payload.reason,
          proofReason: payload.proofReason,
        });
      }
      baseLogger.info(message, payload);
    },
    warn: (...args) => baseLogger.warn(...args),
    error: (...args) => baseLogger.error(...args),
    debug: (...args) => baseLogger.debug(...args),
    trace: (...args) => baseLogger.trace(...args),
    fatal: (...args) => baseLogger.fatal(...args),
  };
  return deferrals;
}

async function createFiveNodeFixture(options = {}) {
  const loopback = createLoopbackTransport();
  const leaderTransport = createPartitionableTransport(loopback);
  const leaderCache = new SystemTableCache();
  const learnerCache = options.splitCaches ?
    new SystemTableCache() :
    leaderCache;
  seedBootstrapTopology(leaderCache);
  if (options.splitCaches) {
    seedBootstrapTopology(learnerCache);
  }
  leaderTransport.state.dropToLearner = options.startPartitioned === true;
  const leader = await createLeader(leaderTransport, leaderCache);
  seedRecoveryTopology(leaderCache, options);
  if (options.splitCaches) {
    seedRecoveryTopology(learnerCache, options);
  }
  const learner = await createLearner(loopback, learnerCache);
  const deferrals = recordPromotionDeferrals(learner);
  return {
    leader,
    learner,
    leaderCache,
    learnerCache,
    leaderTransport,
    deferrals,
    async shutdown() {
      await learner.shutdown();
      await leader.shutdown();
    },
  };
}

test('lagging learner is never promoted by elapsed time; healing the ' +
  'replication path promotes via the leader-observed applied index',
async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {leader, learner, leaderTransport, deferrals} = fixture;
  try {
    t.equal(
      leader.raftProvider.getCommittedIndex(leader.raft),
      COMMITTED_ENTRY_COUNT,
      'recovery precondition: the leader holds a committed prefix the ' +
        'learner does not have',
    );

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
      readFollowerMatchIndex(leader.raft, LEARNER_ADDRESS).state,
      FOLLOWER_MATCH_INDEX_STATE.UNAVAILABLE,
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
    const matchObservation = readFollowerMatchIndex(
      leader.raft,
      LEARNER_ADDRESS,
    );
    t.equal(
      matchObservation.state,
      FOLLOWER_MATCH_INDEX_STATE.AVAILABLE,
      'promotion happened only after the leader observed learner progress',
    );
    t.ok(
      matchObservation.matchIndex >= COMMITTED_ENTRY_COUNT,
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
  try {
    // Interleave: capture the REAL granted proof, then observe a newer term
    // before the validation runs — the exact "leader change after proof
    // collection" attack.
    const realRequest =
      learner.requestLearnerPromotionProofFromLeader.bind(learner);
    let staleInjected = false;
    let observedGrantTerm = null;
    learner.requestLearnerPromotionProofFromLeader = async (observation) => {
      const proof = await realRequest(observation);
      if (
        proof.decision === LEARNER_PROMOTION_PROOF_DECISION.GRANTED &&
        !staleInjected
      ) {
        staleInjected = true;
        observedGrantTerm = proof.term;
        learner.raft.term = proof.term + 1;
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
    // proved it) — promotion completes through the same contract.
    learner.raft.term = observedGrantTerm;
    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(promoted, true, 'promotion resumes once the term matches');
  } finally {
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

test('an idle exactly-caught-up learner (snapshot-installed shape) ' +
  'promotes through the same progress contract via the leader probe',
async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {leader, learner, leaderTransport} = fixture;
  try {
    // Install-equivalent: seed the learner's log with the leader's full
    // committed prefix out-of-band (the moral equivalent of a snapshot
    // transfer), with NO further writes. Pure heartbeats carry no data, so
    // the learner never acks on its own — the leader's progress probe must
    // create the evidence.
    for (let index = 1; index <= COMMITTED_ENTRY_COUNT; index++) {
      const entry = await leader.raft.log.get(index);
      await learner.raft.log.saveCommand(entry.command, entry.term, entry.index);
    }
    leaderTransport.state.dropToLearner = false;

    const promoted = await waitFor(
      () => learner.role === RaftRole.FOLLOWER,
      PROMOTION_BUDGET_MS,
    );
    t.equal(
      promoted,
      true,
      'snapshot-installed and log-caught-up learners share one progress ' +
        'contract - the probe materializes ack evidence for the idle case',
    );
  } finally {
    await fixture.shutdown();
  }
});

test('quorum-shape gates still refuse even when the progress proof would ' +
  'grant', async (t) => {
  const fixture = await createFiveNodeFixture({startPartitioned: true});
  const {learner, leaderCache, leaderTransport} = fixture;
  try {
    // Add two surplus ACTIVE voters while the learner still lags (target 5,
    // 6 active): even the single-replacement-above-target allowance cannot
    // admit a 7th voter, so promotion must defer on the replica-count
    // ceiling regardless of replication progress.
    insertServiceRow(leaderCache, 'replica-6', 'node-6', RaftRole.FOLLOWER);
    insertServiceRow(leaderCache, 'replica-7', 'node-7', RaftRole.FOLLOWER);
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
