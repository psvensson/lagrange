/**
 * Shared five-node learner-promotion fixture for the dt6 learner-promotion
 * witnesses (quests learner-promotion-progress-proof and
 * learner-promotion-proof-channel-wake): the REAL owners — live
 * PartitionService leader + learner on a loopback transport with real
 * liferaft replication, the real proof RPC over the application-message
 * channel, and the real promotion gate chain.
 *
 * FIDELITY: in-process deterministic guard (loopback transport, single
 * process). The three passive voters are authoritative service rows (the
 * quorum-shape gates read the cache, not live sockets); the leader and the
 * learner are fully live. Replication lag is injected by dropping
 * leader->learner deliveries — a one-way partition of the replication path.
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
const LEADER_ADDRESS = `${LEADER_NODE}/partition/${LEADER_REPLICA}`;
export const LEARNER_REPLICA = 'replica-5';
export const LEARNER_NODE = 'node-5';
export const LEARNER_ADDRESS = `${LEARNER_NODE}/partition/${LEARNER_REPLICA}`;
const PASSIVE_VOTERS = [
  ['replica-2', 'node-2'],
  ['replica-3', 'node-3'],
  ['replica-4', 'node-4'],
];
const TARGET_REPLICA_COUNT = 5;
export const COMMITTED_ENTRY_COUNT = 3;
const RETRY_INTERVAL_MS = 25;
const POLL_MS = 10;
const NOOP_COMMAND_TYPE = 'progress-proof-noop';
const PUBLISHED_STATUS = 'PUBLISHED';
const LOG_LEVELS = ['info', 'warn', 'error', 'debug', 'trace', 'fatal'];
const RAFT_HEARTBEAT_INTERVAL_MS = 20;
const RAFT_ELECTION_TIMEOUT_MIN_MS = 150;
const RAFT_ELECTION_TIMEOUT_MAX_MS = 300;
const FIXTURE_LOG_LEVEL = 'error';

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

async function createLearner(transport, cache, options = {}) {
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

/**
 * @param {Object} options
 * @param {boolean} [options.splitCaches] leader and learner hydrate
 *   separate caches
 * @param {boolean} [options.startPartitioned] leader->learner replication
 *   dropped from the start
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
  if (Number.isInteger(options.publishedEpoch)) {
    insertPublishedEpochRow(leaderCache, options.publishedEpoch);
    if (options.splitCaches) {
      insertPublishedEpochRow(learnerCache, options.publishedEpoch);
    }
  }
  leaderTransport.state.dropToLearner = options.startPartitioned === true;
  const leader = await createLeader(leaderTransport, leaderCache);
  seedRecoveryTopology(leaderCache, {
    learnerRow: options.leaderLearnerRow ?? options.learnerRow,
  });
  if (options.splitCaches) {
    seedRecoveryTopology(learnerCache, options);
  }
  const learnerTransport =
    typeof options.wrapLearnerTransport === 'function' ?
      options.wrapLearnerTransport(loopback) :
      loopback;
  const learner = await createLearner(learnerTransport, learnerCache, {
    retryIntervalMs: options.retryIntervalMs,
    replicaStateMachine: options.replicaStateMachine,
  });
  const deferrals = recordPromotionDeferrals(learner);
  return {
    leader,
    learner,
    leaderCache,
    learnerCache,
    leaderTransport,
    learnerTransport,
    deferrals,
    async shutdown() {
      await learner.shutdown();
      await leader.shutdown();
    },
  };
}
