/**
 * Shared five-node learner-promotion fixture for the dt6 learner-promotion
 * witnesses (quests learner-promotion-progress-proof and
 * learner-promotion-proof-channel-wake): the REAL owners — live
 * PartitionService replicas on a loopback transport with real replication
 * through each partition's rs-raft operation port, the real proof RPC over
 * the application-message channel, and the real promotion gate chain.
 *
 * FIDELITY: in-process deterministic guard (loopback transport, single
 * process). Every voter the leader's configuration names is a LIVE replica
 * (design A7.4: the cache-driven membership reconcile proposes every ACTIVE
 * services row as a voter, so a row without a replica behind it leaves the
 * leader a configuration it cannot commit in). The topology is a
 * five-replica recovery: the leader and three live followers, and the
 * learner that replaces the fifth replica. Each follower is built by
 * production construction (a multi-replica replica defers its election, as
 * the replica worker creates it), admitted by the leader through the path it
 * uses for every peer — the replica's ACTIVE services row lands in the
 * leader's cache and the leader's membership reconcile proposes it — and
 * starts its deferred election timer; it is admitted once the leader has
 * proven its replication.
 * The services rows the promotion gates count therefore each name a live
 * voter. A follower hydrates its own control-plane cache independently: the
 * partition's placement it was created with (see basePlacement).
 *
 * Replication lag is injected by LOSING leader->learner deliveries — a
 * one-way partition of the replication path. A lost message is lost in the
 * network: the sender's delivery completes and nothing arrives, which is
 * how raft treats loss. (A delivery that REJECTS is, on the rs-raft runtime,
 * a host failure of the sending group — RECOVERY_REQUIRED and runtime
 * reconstruction — not a partition; the fixture never injects that.)
 * Split caches model the seed and the target hydrating the control plane
 * independently (the learner's own services row can be withheld from the
 * leader cache to model the target's deferred status write).
 */

import {
  createLoopbackTransport,
} from '../partition/partition-service-test-support.js';
import {
  PartitionService,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {
  createRaftOperationPort,
  deepFreeze,
} from '../../src/raft/raft-operation-port.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';

export const PARTITION_ID = 'progress-proof-p1';
const TABLE_NAME = 'progress_proof_table';
export const LEADER_REPLICA = 'replica-1';
const LEADER_NODE = 'node-1';
const LEADER_ADDRESS = partitionAddress(LEADER_NODE, LEADER_REPLICA);
export const LEARNER_REPLICA = 'replica-5';
export const LEARNER_NODE = 'node-5';
export const LEARNER_ADDRESS = partitionAddress(LEARNER_NODE, LEARNER_REPLICA);
const LIVE_FOLLOWERS = Object.freeze([
  ['replica-2', 'node-2'],
  ['replica-3', 'node-3'],
  ['replica-4', 'node-4'],
]);
const TARGET_REPLICA_COUNT = 5;
// The committed prefix the proof binds is the core's own log. Membership
// admission is proven from the core's committed ConfState projection, never
// inferred from an exact log position: concurrent cache reconciles may queue
// a redundant add before the first one commits without changing membership.
const PREFIX_WRITE_COUNT = 2;
// The leader's core keeps a progress record for every peer its
// configuration names; a peer that never acknowledged an append (the
// partitioned learner) reports matched index 0 — no progress evidence.
export const NO_ACKNOWLEDGED_MATCH_INDEX = 0;
const RETRY_INTERVAL_MS = 25;
const POLL_MS = 10;
const ADMISSION_BUDGET_MS = 5000;
// The committed prefix is real partition writes into the fixture's table,
// so every replica applies what it replicates like any production follower.
const TABLE_SCHEMA = Object.freeze({
  columns: [{name: 'seq', type: 'INTEGER', primaryKey: true}],
});
const PREFIX_INSERT_SQL = `INSERT INTO ${TABLE_NAME} (seq) VALUES (?)`;
const PUBLISHED_STATUS = 'PUBLISHED';
const LOG_LEVELS = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'];
const RAFT_HEARTBEAT_INTERVAL_MS = 20;
const RAFT_ELECTION_TIMEOUT_MIN_MS = 150;
const RAFT_ELECTION_TIMEOUT_MAX_MS = 300;
const FIXTURE_LOG_LEVEL = 'error';

function partitionAddress(nodeId, replicaId) {
  return `${nodeId}/partition/${replicaId}`;
}

export function configureFixtureRuntime() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    raft: {
      heartbeatIntervalMs: RAFT_HEARTBEAT_INTERVAL_MS,
      electionTimeoutMinMs: RAFT_ELECTION_TIMEOUT_MIN_MS,
      electionTimeoutMaxMs: RAFT_ELECTION_TIMEOUT_MAX_MS,
    },
  });
  const logger = LoggingService.getInstance();
  logger.initialize({level: FIXTURE_LOG_LEVEL});
}

export function resetFixtureRuntime() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

export function waitFor(predicate, timeoutMs, pollMs = POLL_MS) {
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

// The leader's own replication observable for one replica: the port's
// followerProgress (the proof's learnerMatchIndex input) against the
// committed prefix the proof's safePromotionIndex is read from — the same
// owner observable production's proof consumes. A witness that must
// sequence an injected event AFTER a replica is caught up reads this,
// never elapsed time.
function readLeaderReplicationTo(leader, address) {
  const status = leader.raft.readStatus();
  const committedIndex = status.commitIndex;
  const matchIndex = status.followerProgress?.[address];
  return {
    committedIndex,
    matchIndex,
    proven: Number.isFinite(matchIndex) && matchIndex >= committedIndex,
  };
}

export function readLeaderReplicationToLearner(leader) {
  return readLeaderReplicationTo(leader, LEARNER_ADDRESS);
}

// Resolves true once the leader has proven the learner's replication
// (match index at the committed prefix), false at the budget or when the
// cancel predicate holds (the fixture shut down first).
export function waitForLeaderReplicationToLearner(leader, timeoutMs, options = {}) {
  const isCancelled = typeof options.isCancelled === 'function' ?
    options.isCancelled :
    () => false;
  return waitFor(
    () => isCancelled() || readLeaderReplicationToLearner(leader).proven,
    timeoutMs,
  ).then((settled) => settled && !isCancelled());
}

function buildServiceRow(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
  };
}

export function insertServiceRow(cache, replicaId, nodeId, raftRole) {
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDCOperation.INSERT,
    buildServiceRow(replicaId, nodeId, raftRole),
  );
}

// The durable landing of a row the cache already holds locally (the
// target's local-only seed row converging durably): an UPDATE merge, which
// the cache notifies to its listeners like any other change.
export function updateServiceRow(cache, replicaId, nodeId, raftRole) {
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDCOperation.UPDATE,
    buildServiceRow(replicaId, nodeId, raftRole),
  );
}

function seedPartitionPolicy(cache) {
  cache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    partition_id: PARTITION_ID,
    replica_count: TARGET_REPLICA_COUNT,
  });
}

// Seeded in stages: the leader must initialize (and mint its committed
// prefix) while its raft view is genuinely single-replica; each follower
// row lands only once its replica is live (the leader admits a row's
// replica as a voter the moment the row is visible).
function seedBootstrapTopology(cache) {
  seedPartitionPolicy(cache);
  insertServiceRow(cache, LEADER_REPLICA, LEADER_NODE, RaftRole.LEADER);
}

export function insertPublishedEpochRow(cache, epoch) {
  cache.applySystemTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDCOperation.INSERT,
    {
      publication_id: `publication-epoch-${epoch}`,
      status: PUBLISHED_STATUS,
      publication_epoch: epoch,
    },
  );
}

// A same-epoch change of an already PUBLISHED publication row (any column
// churn short of a new epoch): the cache notifies it like any other change.
export function touchPublishedEpochRow(cache, epoch, touchSeq) {
  cache.applySystemTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDCOperation.UPDATE,
    {
      publication_id: `publication-epoch-${epoch}`,
      status: PUBLISHED_STATUS,
      publication_epoch: epoch,
      publication_touch: touchSeq,
    },
  );
}

// The fixture's network. `closed` models the whole network going away at
// teardown: every delivery is lost, so no replica sees a peer's handler
// disappear under it while the fixture shuts the replicas down.
function createFixtureNetwork() {
  const loopback = createLoopbackTransport();
  const state = {closed: false};
  return {
    state,
    register: (address, handler) => loopback.register(address, handler),
    unregister: (address) => loopback.unregister(address),
    deliver: async (address, payload, options) => {
      if (state.closed) {
        return undefined;
      }
      return loopback.deliver(address, payload, options);
    },
  };
}

// One-way replication partition: while engaged, every leader->learner
// delivery is lost (append fan-out, catch-up, heartbeats, probes). The
// learner->leader direction (proof RPC, acks it cannot send anyway) stays
// up.
function createPartitionableTransport(inner) {
  const state = {dropToLearner: false};
  return {
    state,
    register: (address, handler) => inner.register(address, handler),
    unregister: (address) => inner.unregister(address),
    deliver: async (address, payload, options) => {
      if (state.dropToLearner && address === LEARNER_ADDRESS) {
        return undefined;
      }
      return inner.deliver(address, payload, options);
    },
  };
}

async function proposePrefixWrite(leader, seq) {
  assertRaftOperationSucceeded(await leader.raft.propose({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: PREFIX_INSERT_SQL,
    params: [seq],
    entryId: `progress-proof-prefix-${seq}`,
  }));
}

function committedVoterObservation(leader, replicaId) {
  const status = leader.raft.readStatus();
  const peer = status.peers?.find((candidate) =>
    candidate.replicaIdentity === replicaId) || null;
  return {commitIndex: status.commitIndex, peer};
}

async function waitForCommittedVoter(leader, replicaId, stage) {
  const committed = await waitFor(() => {
    const {peer} = committedVoterObservation(leader, replicaId);
    return peer !== null && peer.learner === false;
  }, ADMISSION_BUDGET_MS);
  if (!committed) {
    throw new Error(
      `fixture precondition (${stage}): committed ConfState does not name ` +
        `voter ${replicaId} ` +
        JSON.stringify(committedVoterObservation(leader, replicaId)),
    );
  }
  return committedVoterObservation(leader, replicaId);
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
    schema: TABLE_SCHEMA,
    dbPath: ':memory:',
  });
  await leader.initialize();
  // How the prefix became committed is a precondition here, not the
  // mechanism under test - the proof consumes committedIndex however it
  // advanced. A solo rs-raft leader commits its own proposals, so successful
  // prefix proposals establish the real committed application prefix without
  // assuming how many internal entries precede it.
  for (let seq = 1; seq <= PREFIX_WRITE_COUNT; seq++) {
    await proposePrefixWrite(leader, seq);
  }
  return leader;
}

// The partition's placement as every replica is created with it: the
// policy, the five replicas' services rows, and the replica set (the
// replica's bootstrap peers and address list). A replica created with the
// placement already names every peer the leader's configuration will carry,
// so its own membership reconcile has nothing to propose; a replica that
// observed a row before the leader's membership entry reached it would
// propose the same admission itself (forwarded to the leader), and the
// committed prefix would no longer be the fixture's to state. Placements
// made later (a surplus voter) are hydrated into every existing cache.
function basePlacement() {
  return [
    [LEADER_REPLICA, LEADER_NODE, RaftRole.LEADER],
    ...LIVE_FOLLOWERS.map(([replicaId, nodeId]) =>
      [replicaId, nodeId, RaftRole.FOLLOWER]),
    [LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER],
  ];
}

function placementWith(topology, replicaId, nodeId) {
  const placement = [...basePlacement(), ...topology.surplusPlacement];
  if (!placement.some(([placedReplicaId]) => placedReplicaId === replicaId)) {
    placement.push([replicaId, nodeId, RaftRole.FOLLOWER]);
  }
  return placement;
}

function createPlacementCache(placement) {
  const cache = new SystemTableCache();
  seedPartitionPolicy(cache);
  for (const [placedReplicaId, placedNodeId, raftRole] of placement) {
    insertServiceRow(cache, placedReplicaId, placedNodeId, raftRole);
  }
  return cache;
}

function placementReplicaIds(placement) {
  return placement.map(([placedReplicaId]) => placedReplicaId);
}

function placementAddresses(placement) {
  return placement.map(([placedReplicaId, placedNodeId]) =>
    partitionAddress(placedNodeId, placedReplicaId));
}

// A live voter, admitted by the leader through its production peer path:
// the replica is constructed and registered first (a peer the leader names
// is always reachable), then its ACTIVE services row lands in every cache
// the control plane serves, the leader's membership reconcile proposes it,
// and the voter starts its deferred election timer (the replica worker's
// start once the replica is wired). The timer is what drives a replica's
// port, so the leader's messages are stepped from then on; the admission is
// complete when the leader has proven the voter's replication.
async function admitLiveVoter(topology, replicaId, nodeId, options = {}) {
  const address = partitionAddress(nodeId, replicaId);
  const placement = placementWith(topology, replicaId, nodeId);
  const voterCache = createPlacementCache(placement);
  const voter = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId,
    replicaIds: placementReplicaIds(placement),
    peerAddresses: placementAddresses(placement),
    nodeId,
    transport: topology.network,
    systemTableCache: voterCache,
    schema: TABLE_SCHEMA,
    dbPath: ':memory:',
    deferElection: true,
  });
  topology.voters.push(voter);
  await voter.initialize();
  const hydratedCaches = options.surplus === true ?
    [...topology.controlPlaneCaches, ...topology.voterCaches] :
    topology.controlPlaneCaches;
  topology.voterCaches.push(voterCache);
  if (options.surplus === true) {
    topology.surplusPlacement.push([replicaId, nodeId, RaftRole.FOLLOWER]);
  }
  for (const cache of hydratedCaches) {
    insertServiceRow(cache, replicaId, nodeId, RaftRole.FOLLOWER);
  }
  voter.startElection();
  await waitForCommittedVoter(
    topology.leader, replicaId, `live voter ${replicaId} admitted`);
  const admitted = await waitFor(
    () => readLeaderReplicationTo(topology.leader, address).proven,
    ADMISSION_BUDGET_MS,
  );
  if (!admitted) {
    throw new Error(
      'fixture precondition: the leader never proved the replication of ' +
        `live voter ${replicaId} ` +
        JSON.stringify(readLeaderReplicationTo(topology.leader, address)),
    );
  }
  return voter;
}

// The learner observing a newer term than the proof carries is the "leader
// changed after proof collection" fact. The port is the learner's term
// observable, so the witness decorates the observation, never the core:
// readStatus reports `term`, every other operation is the real port's.
// Returns the restore that reinstalls the real port.
export function observeLearnerTerm(learner, term) {
  const realPort = learner.raft;
  learner.raft = createRaftOperationPort({
    ...realPort,
    readStatus: () => deepFreeze({...realPort.readStatus(), term}),
  });
  return () => {
    learner.raft = realPort;
  };
}

async function createLearner(transport, cache, options = {}) {
  const learner = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: LEARNER_REPLICA,
    replicaIds: placementReplicaIds(basePlacement()),
    peerAddresses: placementAddresses(basePlacement()),
    nodeId: LEARNER_NODE,
    transport,
    systemTableCache: cache,
    schema: TABLE_SCHEMA,
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    leaderAddress: LEADER_ADDRESS,
    learnerCatchUpCheckIntervalMs:
      options.retryIntervalMs || RETRY_INTERVAL_MS,
    replicaStateMachine: options.replicaStateMachine,
  });
  await learner.initialize();
  return learner;
}

// Every log line the service emits, at every level, in emission order —
// the witnesses assert on typed reasons/causes and on the level they are
// logged at. Delegates to the real logger so nothing is silenced.
export function recordServiceLog(service) {
  const entries = [];
  const baseLogger = service.logger;
  const recorder = {};
  for (const level of LOG_LEVELS) {
    recorder[level] = (message, payload) => {
      entries.push({level, message, payload, atMs: Date.now()});
      baseLogger[level](message, payload);
    };
  }
  service.logger = recorder;
  return entries;
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
          proofCause: payload.proofCause,
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

async function shutdownTopology(topology) {
  topology.network.state.closed = true;
  const services = [topology.learner, ...topology.voters, topology.leader]
    .filter(Boolean);
  await Promise.all(services.map((service) => service.shutdown()));
}

/**
 * @param {Object} options
 * @param {boolean} [options.splitCaches] leader and learner hydrate
 *   separate caches
 * @param {boolean} [options.startPartitioned] leader->learner replication
 *   lost from the start
 * @param {boolean} [options.learnerRow] seed the learner's services row
 *   (default true)
 * @param {boolean} [options.leaderLearnerRow] seed the learner's row in the
 *   LEADER cache (default = learnerRow; false models the target's deferred
 *   status write — requires splitCaches)
 * @param {number} [options.publishedEpoch] seed one PUBLISHED publication
 *   row at this epoch in every cache before the learner starts
 * @param {number} [options.retryIntervalMs] learner proof retry cadence
 * @param {Function} [options.wrapLearnerTransport] transport decorator for
 *   the learner side (proof RPC observation / injected stalls)
 * @param {Object} [options.replicaStateMachine] learner-side replica state
 *   machine (durable services-row owner)
 * @return {Promise<Object>} fixture
 */
export async function createFiveNodeFixture(options = {}) {
  const network = createFixtureNetwork();
  const leaderTransport = createPartitionableTransport(network);
  const leaderCache = new SystemTableCache();
  const learnerCache = options.splitCaches ?
    new SystemTableCache() :
    leaderCache;
  const controlPlaneCaches = options.splitCaches ?
    [leaderCache, learnerCache] :
    [leaderCache];
  for (const cache of controlPlaneCaches) {
    seedBootstrapTopology(cache);
    if (Number.isInteger(options.publishedEpoch)) {
      insertPublishedEpochRow(cache, options.publishedEpoch);
    }
  }
  leaderTransport.state.dropToLearner = options.startPartitioned === true;
  const topology = {
    network,
    controlPlaneCaches,
    leader: null,
    voters: [],
    voterCaches: [],
    surplusPlacement: [],
    learner: null,
  };
  const learnerTransport =
    typeof options.wrapLearnerTransport === 'function' ?
      options.wrapLearnerTransport(network) :
      network;
  try {
    topology.leader = await createLeader(leaderTransport, leaderCache);
    for (const [replicaId, nodeId] of LIVE_FOLLOWERS) {
      await admitLiveVoter(topology, replicaId, nodeId);
    }
    const learnerRow = options.learnerRow !== false;
    const leaderLearnerRow = options.leaderLearnerRow ?? learnerRow;
    // The target's own cache holds its local-only seed row before the
    // learner starts (split caches); a cache the leader reads gains the row
    // only once the learner is live, so the leader never admits an
    // unreachable peer.
    if (options.splitCaches && learnerRow) {
      insertServiceRow(
        learnerCache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER);
    }
    topology.learner = await createLearner(learnerTransport, learnerCache, {
      retryIntervalMs: options.retryIntervalMs,
      replicaStateMachine: options.replicaStateMachine,
    });
    if (leaderLearnerRow) {
      insertServiceRow(
        leaderCache, LEARNER_REPLICA, LEARNER_NODE, RaftRole.LEARNER);
    }
    if (leaderLearnerRow) {
      // The prefix the proof binds is complete once the committed ConfState
      // names the learner as a voter. Its numeric position is deliberately
      // unconstrained because a redundant reconcile may consume another log
      // entry without changing that membership fact.
      await waitForCommittedVoter(
        topology.leader, LEARNER_REPLICA, 'learner admitted');
    }
  } catch (error) {
    await shutdownTopology(topology);
    throw error;
  }
  const {leader, learner} = topology;
  const deferrals = recordPromotionDeferrals(learner);
  return {
    leader,
    learner,
    voters: topology.voters,
    leaderCache,
    learnerCache,
    leaderTransport,
    learnerTransport,
    deferrals,
    // A surplus ACTIVE voter, live and admitted like every other voter:
    // its row lands in every cache the control plane serves (the existing
    // followers' included — it is a placement they were not created with).
    async admitSurplusVoter(replicaId, nodeId) {
      return admitLiveVoter(topology, replicaId, nodeId, {surplus: true});
    },
    async shutdown() {
      await shutdownTopology(topology);
    },
  };
}
