import {serviceRoleObservation} from '../test-helpers/service-role-observation.js';
/**
 * The membership epoch a promotion proof binds is a refusal-only freshness
 * guard over the committed decision (PR #184 review finding 2): the leader
 * reads it from its cached control_plane_publications projection
 * (resolveLearnerPromotionMembershipEpoch), so a stale, late or absent
 * projection must never let the proof GRANT what the committed facts refuse.
 *
 * Against the real leader handler (handleLearnerPromotionProofRequest) and
 * the real learner gate (applyLearnerPromotionProofGate):
 *
 *   (a) every committed refusal (not leader, not in the committed
 *       configuration, progress behind) stays refused for every projection
 *       of the epoch -- absent, stale, fresh, late -- even when the learner
 *       carries exactly the leader's projected epoch
 *   (b) when the committed facts grant, the epoch only subtracts: equal
 *       epochs (absent on both sides included) grant; a stale or late
 *       leader projection refuses EPOCH_MISMATCH; a missing learner epoch
 *       refuses EPOCH_UNAVAILABLE
 *   (c) a publication landing on the learner during the round trip refuses
 *       the granted proof EPOCH_CHANGED and the learner is not promoted;
 *       without it the same round trip promotes
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {buildDeliveryEnvelope} from
  '../../src/transport/transport-semantic-outcome.js';
import {
  LEARNER_PROMOTION_PROOF_DECISION,
  LEARNER_PROMOTION_PROOF_REASON,
} from '../../src/raft/learner-promotion-progress.js';
import {PARTITION_SERVICE_LOG_MSG} from
  '../../src/partition/partition-service-constants.js';
import {withFoundingStamp} from './partition-founding-stamp.js';

const PARTITION_ID = 'epoch-guard-p1';
const LEADER_REPLICA = 'epoch-guard-p1-r1';
const LEARNER_REPLICA = 'epoch-guard-p1-r4';
const LEADER_NODE = 'node-1';
const LEARNER_NODE = 'node-4';
const TERM = 3;
const COMMIT_INDEX = 40;
const PUBLISHED_STATUS = 'PUBLISHED';
const FRESH_EPOCH = 5;
const BOOTSTRAP_EPOCH = 0;
const REASON = LEARNER_PROMOTION_PROOF_REASON;

// Each projection the leader's cache can hold relative to the publication
// the learner observed (FRESH_EPOCH): its epoch is the latest PUBLISHED row.
const PROJECTIONS = Object.freeze({
  absent: Object.freeze([]),
  stale: Object.freeze([FRESH_EPOCH - 1]),
  fresh: Object.freeze([FRESH_EPOCH - 1, FRESH_EPOCH]),
  late: Object.freeze([FRESH_EPOCH, FRESH_EPOCH + 1]),
});
const PROJECTED_EPOCH = Object.freeze({
  absent: BOOTSTRAP_EPOCH,
  stale: FRESH_EPOCH - 1,
  fresh: FRESH_EPOCH,
  late: FRESH_EPOCH + 1,
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function publicationRow(epoch) {
  return {publication_id: `publication-${epoch}`, status: PUBLISHED_STATUS,
    publication_epoch: epoch};
}

// The system-table cache surface the partition reads: services rows for
// addressing and control_plane_publications rows for the epoch projection.
function createCache({epochs = [], services = []} = {}) {
  const tables = new Map([
    [TABLES.CONTROL_PLANE_PUBLICATIONS,
      new Map(epochs.map((epoch) => [`publication-${epoch}`,
        publicationRow(epoch)]))],
    [TABLES.SERVICES, new Map(services.map((row) => [row.service_id, row]))],
  ]);
  const tableOf = (table) => tables.get(table) ?? new Map();
  return {
    publish(epoch) {
      tables.get(TABLES.CONTROL_PLANE_PUBLICATIONS)
        .set(`publication-${epoch}`, publicationRow(epoch));
    },
    get: (table, key) => tableOf(table).get(key) ?? null,
    getAll: (table) => [...tableOf(table).values()],
    filter: (table, predicate) => [...tableOf(table).values()].filter(predicate),
    subscribe: () => () => {},
  };
}

// The committed facts the leader's port answers: its live role, whether the
// committed configuration names the learner, and its own progress for it.
function createLeaderPort({role, learnerInConfiguration, learnerMatchIndex}) {
  const leaderPeer = deriveRaftRsPeerId(LEADER_REPLICA);
  const learnerPeer = deriveRaftRsPeerId(LEARNER_REPLICA);
  const learners = learnerInConfiguration ? [learnerPeer] : [];
  return {
    readRoleAndTerm: () => Object.freeze(serviceRoleObservation(role, TERM)),
    readStatus: () => Object.freeze({
      outcome: RAFT_OPERATION_OUTCOME.CORE_OK, role, term: TERM,
      commitIndex: COMMIT_INDEX, appliedIndex: COMMIT_INDEX, peers: [],
      followerProgress: {[LEARNER_REPLICA]: learnerMatchIndex}}),
    readCommittedMembership: () => Object.freeze({
      kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
      voters: [leaderPeer], votersOutgoing: [], learners, learnersNext: [],
      appliedIndex: COMMIT_INDEX, commitIndex: COMMIT_INDEX, term: TERM,
      gateOpen: true,
      identities: {[leaderPeer]: LEADER_REPLICA,
        [learnerPeer]: LEARNER_REPLICA}}),
    probePeerProgress: () => Object.freeze({
      outcome: RAFT_OPERATION_OUTCOME.CORE_OK}),
  };
}

function createPartition(replicaId, nodeId) {
  return new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID, tableId: 'epoch_guard', replicaId,
    replicaIds: [replicaId], nodeId, dbPath: ':memory:'}));
}

// The committed states: one that grants and every one that refuses.
const COMMITTED = Object.freeze({
  grants: Object.freeze({role: RAFT_ROLE.LEADER,
    learnerInConfiguration: true, learnerMatchIndex: COMMIT_INDEX}),
  notLeader: Object.freeze({role: RAFT_ROLE.FOLLOWER,
    learnerInConfiguration: true, learnerMatchIndex: COMMIT_INDEX,
    refusal: REASON.NOT_LEADER}),
  notInConfiguration: Object.freeze({role: RAFT_ROLE.LEADER,
    learnerInConfiguration: false, learnerMatchIndex: COMMIT_INDEX,
    refusal: REASON.NOT_IN_CONFIGURATION}),
  progressBehind: Object.freeze({role: RAFT_ROLE.LEADER,
    learnerInConfiguration: true, learnerMatchIndex: COMMIT_INDEX - 1,
    refusal: REASON.PROGRESS_BEHIND}),
});

function createLeader(committed, projection) {
  const leader = createPartition(LEADER_REPLICA, LEADER_NODE);
  leader.raft = createLeaderPort(committed);
  leader.isLeader = committed.role === RAFT_ROLE.LEADER;
  leader.systemTableCache = createCache({epochs: PROJECTIONS[projection]});
  return leader;
}

function requestProof(leader, membershipEpoch) {
  return leader.handleLearnerPromotionProofRequest({
    partitionId: PARTITION_ID, replicaId: LEARNER_REPLICA, membershipEpoch});
}

test('(a) no projection of the epoch grants what the committed facts ' +
  'refuse, even when the learner carries the leader\'s projected epoch',
async (t) => {
  for (const [state, committed] of Object.entries(COMMITTED)) {
    if (state === 'grants') continue;
    for (const projection of Object.keys(PROJECTIONS)) {
      for (const learnerEpoch of
        [PROJECTED_EPOCH[projection], FRESH_EPOCH, BOOTSTRAP_EPOCH]) {
        const leader = createLeader(committed, projection);
        const {proof} = await requestProof(leader, learnerEpoch);
        t.equal(proof.decision, LEARNER_PROMOTION_PROOF_DECISION.REFUSED,
          `${state} / ${projection} projection / learner epoch ` +
          `${learnerEpoch}: refused`);
        if (learnerEpoch === PROJECTED_EPOCH[projection]) {
          t.equal(proof.reason, committed.refusal,
            `${state} / ${projection}: with equal epochs the refusal is ` +
            'the committed one');
        }
      }
    }
  }
});

test('(b) when the committed facts grant, the epoch only subtracts',
  async (t) => {
    for (const projection of Object.keys(PROJECTIONS)) {
      const leader = createLeader(COMMITTED.grants, projection);
      const equal = await requestProof(leader, PROJECTED_EPOCH[projection]);
      t.equal(equal.proof.decision, LEARNER_PROMOTION_PROOF_DECISION.GRANTED,
        `${projection} projection with an equal learner epoch grants`);
      t.equal(equal.proof.membershipEpoch, PROJECTED_EPOCH[projection],
        'the grant carries the leader-projected epoch the learner re-checks');
    }
    for (const projection of ['absent', 'stale', 'late']) {
      const leader = createLeader(COMMITTED.grants, projection);
      const {proof} = await requestProof(leader, FRESH_EPOCH);
      t.equal(proof.reason, REASON.EPOCH_MISMATCH,
        `a ${projection} leader projection against the learner's observed ` +
        'publication refuses epoch_mismatch');
    }
    for (const learnerEpoch of [undefined, null, -1, 1.5, '5']) {
      const leader = createLeader(COMMITTED.grants, 'fresh');
      const {proof} = await requestProof(leader, learnerEpoch);
      t.equal(proof.reason, REASON.EPOCH_UNAVAILABLE,
        `learner epoch ${String(learnerEpoch)} refuses epoch_unavailable`);
    }
  });

// A learner whose transport delivers the request to the real leader handler;
// `duringRoundTrip` runs between the leader's answer and its receipt.
function createLearnerAgainst(leader, learnerCache, duringRoundTrip) {
  const learner = createPartition(LEARNER_REPLICA, LEARNER_NODE);
  learner.role = RAFT_ROLE.LEARNER;
  learner.leaderId = LEADER_REPLICA;
  learner.systemTableCache = learnerCache;
  // The learner hears its leader: its own live status names it at its
  // committed address (the proof goes there, never to a cached row).
  learner.raft = {
    readRoleAndTerm: () => Object.freeze(serviceRoleObservation(RAFT_ROLE.FOLLOWER, TERM)),
    readStatus: () => Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
      groupId: PARTITION_ID, replicaIdentity: LEARNER_REPLICA,
      role: RAFT_ROLE.LEARNER, term: TERM, leaderId: LEADER_REPLICA,
      leaderAddress: `${LEADER_NODE}/partition/${LEADER_REPLICA}`,
      leaderAddressStatus: 'resolved'}),
    close: () => Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK}),
  };
  learner.transport = {
    messageTimeoutMs: 1000,
    async deliver(_address, message) {
      const answer = await leader.handleLearnerPromotionProofRequest(message);
      duringRoundTrip();
      return buildDeliveryEnvelope({acknowledged: true}, answer);
    },
  };
  const promotions = [];
  learner.becomeFollower = () => promotions.push(learner.role);
  const deferrals = [];
  const logger = learner.logger;
  learner.logger = Object.assign(Object.create(logger), {
    info(message, fields) {
      if (message === PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_DEFERRED) {
        deferrals.push(fields);
      }
      return logger.info(message, fields);
    },
  });
  return {learner, promotions, deferrals};
}

function leaderServiceRow() {
  return {service_id: LEADER_REPLICA, service_type: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID, node_id: LEADER_NODE, status: 'active'};
}

test('(c) a publication landing on the learner during the round trip ' +
  'refuses the granted proof epoch_changed; without it the learner promotes',
async (t) => {
  const steady = createLearnerAgainst(createLeader(COMMITTED.grants, 'fresh'),
    createCache({epochs: PROJECTIONS.fresh, services: [leaderServiceRow()]}),
    () => {});
  await steady.learner.applyLearnerPromotionProofGate();
  t.equal(steady.promotions.length, 1,
    'control: the same round trip with no late publication promotes');
  await steady.learner.shutdown();

  const learnerCache = createCache({epochs: PROJECTIONS.fresh,
    services: [leaderServiceRow()]});
  const late = createLearnerAgainst(createLeader(COMMITTED.grants, 'fresh'),
    learnerCache, () => learnerCache.publish(FRESH_EPOCH + 1));
  await late.learner.applyLearnerPromotionProofGate();
  t.equal(late.promotions.length, 0,
    'a late publication on the learner withholds the promotion');
  t.same(late.deferrals.map((deferral) =>
    [deferral.reason, deferral.proofReason]),
  [[REASON.EPOCH_CHANGED, REASON.PROGRESS_PROVEN]],
  'the granted proof is refused epoch_changed at receipt');
  t.equal(late.learner.role, RAFT_ROLE.LEARNER, 'the learner stays a learner');
  // The refusal armed the learner's single recheck timer; its owner
  // releases it.
  await late.learner.shutdown();
});
