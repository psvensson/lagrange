// The model the O1 committed-read / participation-gate evidence ranges over
// (committed-read amendment 1, sections 4-5; challenger B section C), and the
// plumbing that drives it on real rs-raft partition ports
// (PartitionNodeCluster: one database file per replica, a transport the test
// steps).
//
// Nothing here is an expectation. Every value a witness compares against
// comes from the independent oracles (committed-membership-oracles.js: the
// durable bytes on a connection of the test's own, decoded by the binding's
// own decoder and folded over the TEST'S genesis founders) or from a
// production enumeration; never from the implementation's status, stamp or
// answer.
//
// Histories (challenger B, section C): a genesis founder set and a script of
// single voter changes committed through the canonical port; D = the founders
// removed by j (the D1 silent-skew set), P = joiners added by j. A target
// bootstrapped from C_j opens as a learner of C_j and folds only the log
// above j over it (the configuration entries at or below j are already in
// C_j): below j its view is C_j itself - the silent-skew view
// `true(i) minus D plus (P not yet added)` of a whole-log replay no longer
// exists.

import assert from 'node:assert/strict';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {coreTrappingAppend} from './core-trap-envelope.js';
import {
  bindingWireNumbers,
  bootstrapFold,
  durableAppliedState,
  durableHardState,
  durableLog,
  foldAt,
  logFold,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
} from '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';

const WIRE = bindingWireNumbers();
const LEADER_ROLE = 'leader';
const ADD = '+';
const REMOVE = '-';
const SETTLE_ROUNDS = 600;
const PROPOSAL_ATTEMPTS = 20;
const RETRY_ROUNDS = 20;
// Election timeouts the isolated target is driven through: many, so that a
// replica whose ticks are not refused would have campaigned repeatedly.
const ELECTION_STORM_TICKS = 200;
const SAMPLE_EVERY_TICKS = 10;
const NO_VOTE = '0';
const UNBOUNDED = Number.POSITIVE_INFINITY;
const ROW_STATUS_ACTIVE = 'ACTIVE';
const PHANTOM_ROW = 'evidence-phantom-row';

// The histories, keyed as challenger B names them. `expectD` is the set of
// founders the script removes by j (checked against the fold, never trusted).
const HISTORY = Object.freeze({
  H1: {genesis: ['a'], script: [[ADD, 'b'], [REMOVE, 'b'], [ADD, 'b'],
    [REMOVE, 'a']], expectD: ['a']},
  H3: {genesis: ['a', 'b', 'c'], script: [[REMOVE, 'a'], [ADD, 'a']],
    expectD: []},
  H4: {genesis: ['a', 'b', 'c'], script: [[ADD, 'd'], [REMOVE, 'a'],
    [ADD, 'a'], [REMOVE, 'd']], expectD: []},
  H5: {genesis: ['a'], script: [[ADD, 'b'], [REMOVE, 'a'], [ADD, 'a'],
    [REMOVE, 'b']], expectD: []},
  H6a: {genesis: ['a', 'b', 'c'], script: [[ADD, 'd'], [REMOVE, 'b']],
    expectD: ['b']},
  H6b: {genesis: ['a', 'b', 'c'], script: [[ADD, 'd'], [REMOVE, 'b'],
    [ADD, 'e'], [REMOVE, 'a']], expectD: ['a', 'b']},
});

function identityOf(historyKey, letter) {
  return `${historyKey}-${letter}`;
}

/**
 * A cluster whose deliveries to one target pass through a filter the test
 * moves: `filter.value` is null (deliver as is) or a function of the raft
 * message returning the message to deliver, or null to drop it.
 * @param {Object} options - {partitionId, founders, target, filter,
 *   substrateFor, observe (every send: (from, address, packet))}.
 * @return {PartitionNodeCluster}
 */
function createModelCluster({partitionId, founders, target, filter,
  substrateFor = null, observe = null}) {
  let cluster = null;
  cluster = new PartitionNodeCluster({
    partitionId,
    replicaIds: founders,
    substrateFor,
    sendFor: (fromReplicaId, address, packet) => {
      if (observe !== null) {
        observe(fromReplicaId, address, packet);
      }
      if (filter.value === null || address !== cluster.addressOf(target) ||
          cluster.isolated.has(fromReplicaId) ||
          cluster.isolated.has(target)) {
        return undefined;
      }
      const message = filter.value(packet.message);
      if (message !== null) {
        cluster.replica(target).inbox.push({...packet, message});
      }
      return null;
    },
  });
  return cluster;
}

/**
 * A filter that delivers a prefix: entries at or below `cap.value` and a
 * commit index at most `cap.value` (a target held at an applied index).
 * @param {Object} cap - {value}.
 * @param {Object} [options] - {entries: false} caps the commit only (a
 *   commit-knowledge lag: the target holds entries it has not learned are
 *   committed).
 * @return {Function}
 */
function prefixFilter(cap, {entries = true} = {}) {
  return (message) => {
    const delivered = {...message};
    if (entries && Array.isArray(message.entries)) {
      delivered.entries = message.entries.filter((entry) =>
        Number(entry.index) <= cap.value);
    }
    if (message.commit !== undefined) {
      delivered.commit = String(Math.min(Number(message.commit), cap.value));
    }
    return delivered;
  };
}

function roleOf(cluster, replicaId) {
  return cluster.node(replicaId).readStatus().role;
}

function leaderOf(cluster) {
  return [...cluster.replicas.keys()].find((replicaId) =>
    !cluster.isolated.has(replicaId) &&
    roleOf(cluster, replicaId) === LEADER_ROLE) ?? null;
}

function liveReplicas(cluster) {
  return [...cluster.replicas.keys()].filter((replicaId) =>
    !cluster.isolated.has(replicaId));
}

function settle(cluster, predicate, tickers, rounds = SETTLE_ROUNDS) {
  cluster.tickers = tickers;
  return cluster.settle(predicate, {rounds});
}

// The raft peer id a replica identity reserved in one replica's database
// (the durable reservation, never a status read).
function peerIdIn(cluster, holder, identity) {
  for (const [peerId, reserved] of reservedIdentities(
    cluster.replica(holder).dbFile)) {
    if (reserved === identity) {
      return peerId;
    }
  }
  return null;
}

function durableOf(cluster, replicaId) {
  const dbFile = cluster.replica(replicaId).dbFile;
  return {
    applied: durableAppliedState(dbFile, cluster.partitionId),
    hard: durableHardState(dbFile, cluster.partitionId),
  };
}

/**
 * Commit one single voter change through the canonical port of the current
 * leader, settled until the leader's DURABLE applied configuration shows it.
 * A leader that removes itself hands leadership over first (the core's own
 * transfer); a proposal the core dropped behind an unapplied change is
 * proposed again.
 * @param {Object} cluster - The cluster.
 * @param {string} type - A RAFT_MEMBERSHIP_OPERATION.
 * @param {string} identity - The replica identity.
 */
function commitVoterChange(cluster, type, identity) {
  const adds = type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER;
  if (!adds && leaderOf(cluster) === identity) {
    cluster.node(identity).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP});
    assert.ok(settle(cluster, () => leaderOf(cluster) !== null &&
      leaderOf(cluster) !== identity, liveReplicas(cluster)),
    `setup: ${identity} handed leadership over before its removal`);
  }
  const shows = () => {
    const leader = leaderOf(cluster);
    return leader !== null && durableOf(cluster, leader).applied.voters
      .includes(peerIdIn(cluster, leader, identity)) === adds;
  };
  for (let attempt = 0; attempt < PROPOSAL_ATTEMPTS && !shows();
    attempt += 1) {
    cluster.node(leaderOf(cluster)).proposeConfChange({
      type, replicaIdentity: identity});
    settle(cluster, shows, liveReplicas(cluster), RETRY_ROUNDS);
  }
  assert.ok(settle(cluster, shows, liveReplicas(cluster)),
    `setup: ${type} ${identity} applied on the leader`);
}

/**
 * The COMMITTED stamp a correct leader would answer, built from the
 * oracles alone: the leader's durable applied index j, the fold of its
 * durable log over the TEST'S genesis at j, and its durable identity
 * reservations.
 * @param {Object} cluster - The cluster.
 * @param {string} leader - The leader replica.
 * @param {Array<string>} genesisPeerIds - The founders' raft peer ids.
 * @return {Object} The stamp (the answer's contract shape).
 */
function oracleStamp(cluster, leader, genesisPeerIds) {
  const dbFile = cluster.replica(leader).dbFile;
  const applied = durableAppliedState(dbFile, cluster.partitionId);
  const at = foldAt(logFold(dbFile, cluster.partitionId, genesisPeerIds),
    applied.appliedIndex);
  assert.deepEqual(at.voters, applied.voters,
    'setup: the leader durable configuration is the fold at its index');
  const reserved = reservedIdentities(dbFile);
  const hard = durableHardState(dbFile, cluster.partitionId);
  return {
    kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED,
    voters: at.voters,
    votersOutgoing: [],
    learners: at.learners,
    appliedIndex: applied.appliedIndex,
    commitIndex: Number(hard.commit),
    term: Number(hard.term),
    leaderId: leader,
    gateOpen: true,
    identities: Object.fromEntries([...at.voters, ...at.learners].map(
      (peerId) => [peerId, reserved.get(peerId)])),
  };
}

/**
 * Add a replica opened from a stamp (a join through the seam), its address
 * hints the stamp's identities plus itself.
 * @param {Object} cluster - The cluster.
 * @param {string} replicaId - The joiner.
 * @param {Object} stamp - Its COMMITTED stamp.
 * @return {Object} The replica.
 */
function joinFromStamp(cluster, replicaId, stamp) {
  return cluster.addReplica(replicaId,
    [...Object.values(stamp.identities), replicaId],
    {[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
}

/**
 * Form a history: found the group, elect a leader that applied its first
 * entry, run the script (each joiner opened from the oracle stamp of its own
 * moment), and isolate every replica the script removed.
 * @param {Object} cluster - A cluster founded on the history's founders.
 * @param {string} historyKey - A HISTORY key.
 * @return {Object} {genesis (peer ids), leader, stamp, D (peer ids the
 *   script removed by j), skewIndices (applied indices below j where the
 *   replayed view omits a committed voter), changeIndices}.
 */
function formHistory(cluster, historyKey) {
  const history = HISTORY[historyKey];
  const founders = history.genesis.map((letter) =>
    identityOf(historyKey, letter));
  assert.ok(settle(cluster, () => leaderOf(cluster) !== null &&
    durableOf(cluster, leaderOf(cluster)).applied.appliedIndex > 0,
  [founders[0]]), 'setup: the founders elect a leader that applied an entry');
  const genesis = founders.map((identity) =>
    peerIdIn(cluster, leaderOf(cluster), identity));
  const removed = new Set();
  for (const [operation, letter] of history.script) {
    const identity = identityOf(historyKey, letter);
    if (operation === ADD) {
      if (!cluster.replicas.has(identity)) {
        joinFromStamp(cluster, identity,
          oracleStamp(cluster, leaderOf(cluster), genesis));
      }
      removed.delete(identity);
      commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
        identity);
    } else {
      commitVoterChange(cluster, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        identity);
      removed.add(identity);
    }
  }
  for (const identity of removed) {
    cluster.isolate(identity);
  }
  const leader = leaderOf(cluster);
  assert.ok(leader !== null, 'setup: the history ends with a leader');
  const stamp = oracleStamp(cluster, leader, genesis);
  const D = genesis.filter((peerId) => !stamp.voters.includes(peerId));
  assert.deepEqual(D.map((peerId) => reservedIdentities(
    cluster.replica(leader).dbFile).get(peerId)).sort(),
  history.expectD.map((letter) => identityOf(historyKey, letter)).sort(),
  `setup: ${historyKey} removed exactly its expected founders by j`);
  return {genesis, leader, stamp, D, founders,
    changeIndices: confChangeIndices(cluster, leader)};
}

// The indices of the conf-change entries of one replica's durable log.
function confChangeIndices(cluster, replicaId) {
  const confChange = new Set([WIRE.entryType.EntryConfChange,
    WIRE.entryType.EntryConfChangeV2]);
  return durableLog(cluster.replica(replicaId).dbFile, cluster.partitionId)
    .filter((entry) => confChange.has(entry.entryType))
    .map((entry) => entry.index);
}

/**
 * The index of the applied entry that admits one peer as a voter after the
 * stamp's index, decoded from a member's durable log (the oracle's a_self).
 * @param {Object} cluster - The cluster.
 * @param {string} holder - The member whose log is read.
 * @param {string} peerId - The admitted peer id.
 * @param {number} afterIndex - The stamp's index j.
 * @return {number|null}
 */
function admissionIndexOf(cluster, holder, peerId, afterIndex) {
  const fold = logFold(cluster.replica(holder).dbFile, cluster.partitionId,
    []);
  let previous = new Set();
  for (const snapshot of fold) {
    const voters = new Set(snapshot.voters);
    if (snapshot.index > afterIndex && voters.has(peerId) &&
        !previous.has(peerId)) {
      return snapshot.index;
    }
    previous = voters;
  }
  return null;
}

/**
 * The view a joiner opened from `stamp` holds at applied `index`: C_j with
 * itself a learner, folded with the member's durable log above j only (the
 * crate's law for each folded entry: remove of an absent id is a no-op, add
 * of a present id is idempotent).
 * @param {Object} cluster - The cluster.
 * @param {string} holder - The member whose log is folded.
 * @param {Object} stamp - The joiner's COMMITTED stamp (C_j, j).
 * @param {string} selfPeerId - The joiner's raft peer id.
 * @param {number} index - The applied index.
 * @return {Object} {voters, learners}.
 */
function replayedView(cluster, holder, stamp, selfPeerId, index) {
  return foldAt(bootstrapFold(cluster.replica(holder).dbFile,
    cluster.partitionId, {voters: stamp.voters, learners: stamp.learners,
      bootstrapIndex: stamp.appliedIndex, selfPeerId}), index);
}

/**
 * The committed configuration at `index` (the fold over the genesis).
 * @param {Object} cluster - The cluster.
 * @param {string} holder - The member whose log is folded.
 * @param {Array<string>} genesis - The founders' peer ids.
 * @param {number} index - The index.
 * @return {Object} {voters, learners}.
 */
function committedAt(cluster, holder, genesis, index) {
  return foldAt(logFold(cluster.replica(holder).dbFile, cluster.partitionId,
    genesis), index);
}

/**
 * Plant a rows-vs-committed disagreement in every replica's services table:
 * the target and a phantom present, one committed voter omitted. Nothing the
 * backend does may read them; a stamp built from rows would differ from the
 * committed configuration on two ids.
 * @param {Object} cluster - The cluster.
 * @param {string} target - The target identity.
 * @param {string} omitted - A committed voter's identity to omit.
 */
function plantDisagreeingRows(cluster, target, omitted) {
  const rows = [...new Set([...liveReplicas(cluster).filter((id) =>
    id !== omitted), target, PHANTOM_ROW])].map((serviceId) =>
    ({serviceId, status: ROW_STATUS_ACTIVE}));
  for (const replicaId of cluster.replicas.keys()) {
    cluster.writeServiceRows(replicaId, rows);
  }
}

function termAndVote(hard) {
  return {term: hard?.term ?? null, vote: hard?.vote ?? null};
}

/**
 * Drive the target through an election storm (its ticks, every envelope
 * delivered) and sample every member's durable hard state on the way.
 * @param {Object} cluster - The cluster.
 * @param {string} target - The target.
 * @param {Array<string>} members - The members sampled.
 * @param {Function} [each] - Called after every tick round.
 * @return {Array<Object>} Samples: [{round, hard: {id: {term, vote}}}].
 */
function electionStorm(cluster, target, members, each = null) {
  const samples = [];
  for (let round = 0; round < ELECTION_STORM_TICKS; round += 1) {
    cluster.node(target).tick();
    cluster.deliverAll();
    if (each) {
      each(round);
    }
    if (round % SAMPLE_EVERY_TICKS === 0) {
      samples.push({round, hard: Object.fromEntries(members.map((id) =>
        [id, termAndVote(durableOf(cluster, id).hard)]))});
    }
  }
  return samples;
}

/**
 * O-c from durable bytes: every index held by two or more live replicas
 * carries one (term, entryType, data); and in every sampled term no more
 * than one id is voted for by a majority of `voterCount`.
 * @param {Object} cluster - The cluster.
 * @param {Array<Object>} samples - What electionStorm returned.
 * @param {number} voterCount - The committed voter count.
 */
function assertSafety(cluster, samples, voterCount) {
  const byIndex = new Map();
  for (const replicaId of liveReplicas(cluster)) {
    for (const entry of durableLog(cluster.replica(replicaId).dbFile,
      cluster.partitionId)) {
      const payload = JSON.stringify([entry.term, entry.entryType,
        entry.data ?? null]);
      const seen = byIndex.get(entry.index);
      assert.ok(seen === undefined || seen === payload,
        `O-c: one payload at index ${entry.index} across every durable log`);
      byIndex.set(entry.index, payload);
    }
  }
  const majority = Math.floor(voterCount / 2) + 1;
  for (const {hard} of samples) {
    const votesByTerm = new Map();
    for (const {term, vote} of Object.values(hard)) {
      if (vote === null || vote === NO_VOTE) {
        continue;
      }
      const votes = votesByTerm.get(term) || new Map();
      votes.set(vote, (votes.get(vote) || 0) + 1);
      votesByTerm.set(term, votes);
    }
    for (const [term, votes] of votesByTerm) {
      const winners = [...votes.values()].filter((count) =>
        count >= majority);
      assert.ok(winners.length <= 1,
        `O-c: at most one id holds a majority of votes in term ${term}`);
    }
  }
}

/**
 * O-b: at equal durable applied index, every pair of live replicas holds the
 * same durable applied configuration.
 * @param {Object} cluster - The cluster.
 * @param {Array<string>} [replicaIds] - Which replicas (live ones by default).
 */
function assertCrossMemberAgreement(cluster, replicaIds = liveReplicas(
  cluster)) {
  const byIndex = new Map();
  for (const replicaId of replicaIds) {
    const {applied} = durableOf(cluster, replicaId);
    const key = JSON.stringify([applied.voters, applied.votersOutgoing,
      applied.learners]);
    const seen = byIndex.get(applied.appliedIndex);
    assert.ok(seen === undefined || seen.key === key,
      `O-b: ${replicaId} and ${seen?.replicaId} disagree on the ` +
        `configuration applied at ${applied.appliedIndex}`);
    byIndex.set(applied.appliedIndex, {key, replicaId});
  }
}

/**
 * Record the GATE_OPENED emissions of one port.
 * @param {Object} cluster - The cluster.
 * @param {string} replicaId - The replica.
 * @return {Array<Object>} The recorded events (appended as they arrive).
 */
function recordGateOpenings(cluster, replicaId) {
  const opened = [];
  cluster.node(replicaId).subscribe(RAFT_EVENT.GATE_OPENED, (event) =>
    opened.push(event));
  return opened;
}

/**
 * Trap the shared core through one port (core-trap-envelope.js), then a
 * tick. Every group is then reconstructed from its
 * durable record on its next operation (the runtime-reconstruction restart
 * class).
 * @param {Object} cluster - The cluster.
 * @param {string} replicaId - The port to trap through.
 * @return {Object} The tick's outcome.
 */
function trapSharedCore(cluster, replicaId) {
  const status = cluster.node(replicaId).readStatus();
  cluster.node(replicaId).step(coreTrappingAppend({
    dbFile: cluster.replica(replicaId).dbFile,
    groupId: cluster.partitionId,
    status,
    from: String(Number(status.peerId) + 1000),
    term: String(Number(status.term) + 1),
  }));
  const consoleError = console.error;
  try {
    console.error = () => undefined;
    return cluster.node(replicaId).tick();
  } finally {
    console.error = consoleError;
  }
}

/**
 * Restart one replica from the SAME database file with another request
 * bootstrap (a process restart hands the durable-record bootstrap; a
 * coordinator re-init hands the stamp again).
 * @param {Object} cluster - The cluster.
 * @param {string} replicaId - The replica.
 * @param {Object} extraRequest - Request fields in the contract owner's names.
 * @return {Object} {replica} or {refused: error}.
 */
function restartWith(cluster, replicaId, extraRequest) {
  const replica = cluster.replica(replicaId);
  const hints = replica.request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS];
  replica.node.close();
  replica.db.close();
  try {
    return {replica: cluster.buildReplica(replicaId, hints, extraRequest)};
  } catch (error) {
    return {refused: error};
  }
}

/**
 * Reserve an identity in one replica's registry (what the workflow does on
 * every member before a join is proposed), without building the replica.
 * @param {Object} cluster - The cluster.
 * @param {string} holder - The member.
 * @param {string} identity - The identity.
 * @return {string} Its raft peer id.
 */
function reserveIdentity(cluster, holder, identity) {
  return new RaftRsPeerIdentityRegistry(cluster.replica(holder).db)
    .registerReplica(identity);
}

export {
  HISTORY,
  LEADER_ROLE,
  UNBOUNDED,
  WIRE,
  admissionIndexOf,
  assertCrossMemberAgreement,
  assertSafety,
  commitVoterChange,
  committedAt,
  createModelCluster,
  durableOf,
  electionStorm,
  formHistory,
  identityOf,
  joinFromStamp,
  leaderOf,
  liveReplicas,
  oracleStamp,
  peerIdIn,
  plantDisagreeingRows,
  prefixFilter,
  recordGateOpenings,
  replayedView,
  reserveIdentity,
  restartWith,
  roleOf,
  settle,
  termAndVote,
  trapSharedCore,
};
