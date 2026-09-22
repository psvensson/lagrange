// ONE REAL PARTITION on the experimental backend, in the owner's own order
// (binding direction addendum §7): a fresh partition, an election, a normal
// proposal committed and applied, a restart, membership read from the durable
// ConfState, a learner added, caught up, promoted, and the old voter removed -
// with hostile service-cache rows rewritten underneath the whole run.
//
// Every peer here is what `provider.createPartitionPort(request)` returned for
// a request in the contract owner's own field names. No test value is an
// oracle: what is compared against is either the core's own report or the
// bytes on disk read through a SEPARATE read-only SQLite connection, and the
// configuration-change numbers are parsed out of the binding's own Rust match
// arms rather than written here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {TextDecoder, TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from '../../../src/raft/raft-provider-contract-constants.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_SOURCE = 'vendor/raft-rs-wasm/src/lib.rs';
const TEXT_ENCODING = 'utf8';

const PARTITION_ID = 'real-partition-1';
const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const JOINER = 'replica-d';
const SETTLE_ROUNDS = 400;
const COMMAND = 'the-committed-row';
const LIFECYCLE = Object.freeze({ACTIVE: 'ACTIVE', SYNCING: 'SYNCING'});
const PHANTOM_REPLICA = 'replica-never-existed';

/**
 * The ConfChangeType numbers, read out of the binding's own match arms. The
 * wire numbers are the crate's, so this test must not carry copies of them.
 * @return {Object} {AddNode, RemoveNode, AddLearnerNode}.
 */
function confChangeTypes() {
  const source = fs.readFileSync(
    path.join(REPOSITORY_ROOT, BINDING_SOURCE), TEXT_ENCODING);
  const body = source.slice(source.indexOf('fn num_to_conf_change_type'));
  const arms = [...body.slice(0, body.indexOf('}\n}'))
    .matchAll(/(\d+)\s*=>\s*Ok\(ConfChangeType::(\w+)\)/gu)];
  assert.ok(arms.length >= 3,
    'the binding must still declare its ConfChangeType match arms');
  return Object.fromEntries(arms.map(([, number, name]) =>
    [name, Number(number)]));
}

/**
 * The ConfChangeTransition number named `Auto`, from the same source.
 * @return {number} The transition.
 */
function autoTransition() {
  const source = fs.readFileSync(
    path.join(REPOSITORY_ROOT, BINDING_SOURCE), TEXT_ENCODING);
  const body = source.slice(source.indexOf('fn num_to_conf_change_transition'));
  const [, number] =
    /(\d+)\s*=>\s*Ok\(ConfChangeTransition::Auto\)/u.exec(body);
  return Number(number);
}

/**
 * What one replica's own database holds right now, read on a connection of
 * this test's own so the answer is the durable bytes rather than a live
 * object's memory.
 * @param {string} dbFile - The replica's database file.
 * @return {Object} Its durable Raft record, in the columns' own terms.
 */
function durableRecordOf(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  const applied = independent.prepare(
    'SELECT applied_index, voters, learners FROM _raft_rs_applied_state ' +
    'WHERE group_id = ?').get(PARTITION_ID);
  const hard = independent.prepare(
    'SELECT term, vote, commit_index FROM _raft_rs_hard_state ' +
    'WHERE group_id = ?').get(PARTITION_ID);
  const entries = independent.prepare(
    'SELECT log_index, data FROM _raft_rs_log WHERE group_id = ? ' +
    'ORDER BY log_index').all(PARTITION_ID);
  independent.close();
  return {
    appliedIndex: String(applied.applied_index),
    voters: JSON.parse(applied.voters),
    learners: JSON.parse(applied.learners),
    term: hard === undefined ? null : String(hard.term),
    vote: hard === undefined ? null : String(hard.vote),
    commitIndex: hard === undefined ? null : String(hard.commit_index),
    entries: entries.map((row) => ({
      index: String(row.log_index),
      data: row.data === null ? null : row.data,
    })),
  };
}

/**
 * Hostile, divergent service rows: each replica's cache says something
 * different about who belongs, and one of them calls the joiner a member
 * while it is still syncing - the liferaft shape where a SYNCING row doubles
 * as a voter. A replica nobody ever created is invented in a third cache.
 * @param {string} replicaId - Whose cache.
 * @param {number} round - The settle round, so the rows keep moving.
 * @return {Array<Object>} The rows.
 */
function hostileRowsFor(replicaId, round) {
  if (replicaId === FOUNDING[1]) {
    return [
      {serviceId: FOUNDING[0], status: LIFECYCLE.ACTIVE},
      {serviceId: FOUNDING[1], status: LIFECYCLE.ACTIVE},
      {serviceId: JOINER, status: LIFECYCLE.SYNCING},
    ];
  }
  if (replicaId === FOUNDING[2]) {
    return [
      {serviceId: FOUNDING[2], status: LIFECYCLE.ACTIVE},
      {serviceId: PHANTOM_REPLICA, status:
        round % 2 === 0 ? LIFECYCLE.ACTIVE : LIFECYCLE.SYNCING},
    ];
  }
  return FOUNDING.map((serviceId) => ({
    serviceId, status: LIFECYCLE.ACTIVE}));
}

/**
 * Rewrite every replica's cache. Called between settle rounds so the caches
 * are never quiet while the partition is deciding anything.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {number} round - The round.
 */
function poisonEveryCache(cluster, round) {
  for (const replicaId of cluster.replicas.keys()) {
    cluster.writeServiceRows(replicaId, hostileRowsFor(replicaId, round));
  }
}

/**
 * What a membership decision taken from a cache would say. It exists so the
 * checks discriminate: it answers differently from the committed
 * configuration, so an assertion that passes is not passing vacuously.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {string} replicaId - Whose cache.
 * @return {Array<string>} The replica ids the cache would call members.
 */
function membershipIfTheCacheDecided(cluster, replicaId) {
  return cluster.replica(replicaId).db
    .prepare('SELECT service_id FROM services ORDER BY service_id')
    .all().map((row) => row.service_id);
}

/**
 * Every replica's committed voters, as its OWN durable record holds them.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @return {Map<string, Array<string>>} Replica to durable voters.
 */
function durableVotersByReplica(cluster) {
  const voters = new Map();
  for (const replicaId of cluster.replicas.keys()) {
    voters.set(replicaId,
      durableRecordOf(cluster.dbFileOf(replicaId)).voters.slice().sort());
  }
  return voters;
}

function formedPartition() {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID, replicaIds: FOUNDING});
  poisonEveryCache(cluster, 0);
  return cluster;
}

test('a fresh partition on the raft-rs backend starts from the membership ' +
  'its own durable record holds', async () => {
  const cluster = formedPartition();
  try {
    // 1. Every founding replica is a frozen operation port the provider built.
    for (const replicaId of FOUNDING) {
      const port = cluster.node(replicaId);
      assert.equal(Object.isFrozen(port), true);
      assert.equal(typeof port.address, 'undefined',
        'the operation port exposes no live node/address object');
      // The identity is the backend's registration, not a list position: the
      // core's own status agrees with what the node reports character for
      // character.
      assert.equal(cluster.coreStatus(replicaId).id,
        cluster.raftPeerIdOf(replicaId));
    }
    // Registration, not position: every founding replica got a distinct id,
    // and no id is the index it happened to sit at.
    const registered = FOUNDING.map((id) => cluster.raftPeerIdOf(id));
    assert.equal(new Set(registered).size, FOUNDING.length);
    for (const [index, peerId] of registered.entries()) {
      assert.notEqual(peerId, String(index + 1),
        'a registered identity is not the position in the bootstrap list');
    }
    // The durable record - read on an independent connection - already holds
    // the configuration the group was created with, before anything ticked.
    const expectedVoters = registered.slice().sort();
    for (const replicaId of FOUNDING) {
      assert.deepEqual(
        durableRecordOf(cluster.dbFileOf(replicaId)).voters.slice().sort(),
        expectedVoters,
        'the fresh group wrote its starting configuration to its own record');
    }
  } finally {
    cluster.dispose();
  }
});

test('one real partition: elect, commit, restart, add a learner, catch up, ' +
  'promote and remove, under hostile caches throughout', async () => {
  const cluster = formedPartition();
  const types = confChangeTypes();
  const transition = autoTransition();
  const leaderChanges = new Map(FOUNDING.map((replicaId) => [replicaId, []]));
  const unsubscribes = FOUNDING.map((replicaId) =>
    cluster.node(replicaId).subscribe('leader-change', (leaderId) => {
      leaderChanges.get(replicaId).push(leaderId);
    }));
  try {
    // ---- 2. elect -------------------------------------------------------
    const elected = cluster.settle(() => cluster.leaderReplicaId() !== null,
      {rounds: SETTLE_ROUNDS, between: (round) =>
        poisonEveryCache(cluster, round)});
    assert.ok(elected, 'the partition must elect a leader');
    const leader = cluster.leaderReplicaId();
    // The leader is the one the CORE says leads, on every peer.
    for (const replicaId of FOUNDING) {
      assert.equal(cluster.coreStatus(replicaId).lead,
        cluster.raftPeerIdOf(leader));
      const observed = leaderChanges.get(replicaId);
      assert.equal(observed.at(-1), leader,
        'leader-change events expose the replica identity, not the raft-rs u64 id');
    }

    // ---- 3. a normal proposal, committed and applied ---------------------
    cluster.propose(leader, new TextEncoder().encode(COMMAND));
    const committed = cluster.settle(() => FOUNDING.every((replicaId) =>
      cluster.replica(replicaId).appliedCommands.length > 0),
    {rounds: SETTLE_ROUNDS,
      between: (round) => poisonEveryCache(cluster, round)});
    assert.ok(committed,
      'every replica must apply the committed entry through the request hook');
    for (const replicaId of FOUNDING) {
      const record = durableRecordOf(cluster.dbFileOf(replicaId));
      const carrying = record.entries.find((entry) => entry.data !== null &&
        Buffer.from(entry.data, 'base64').toString(TEXT_ENCODING) === COMMAND);
      assert.ok(carrying !== undefined,
        `${replicaId} must hold the command in its own durable log`);
      assert.ok(BigInt(record.appliedIndex) >= BigInt(carrying.index),
        `${replicaId}'s durable applied index must have reached it`);
      // The hook the REQUEST named received the bytes the durable log holds.
      const applied = cluster.replica(replicaId).appliedCommands
        .map((bytes) => new TextDecoder().decode(bytes));
      assert.ok(applied.includes(Buffer.from(carrying.data, 'base64')
        .toString(TEXT_ENCODING)),
      `${replicaId} applied what its own log records as committed`);
    }

    // ---- 4 and 5. restart, and membership from the durable ConfState -----
    const follower = FOUNDING.find((replicaId) => replicaId !== leader);
    const before = {
      status: cluster.coreStatus(follower),
      record: durableRecordOf(cluster.dbFileOf(follower)),
    };
    cluster.restart(follower);
    const after = {
      status: cluster.coreStatus(follower),
      record: durableRecordOf(cluster.dbFileOf(follower)),
    };
    assert.equal(after.status.term, before.status.term,
      'a restarted partition replica comes back at the term it held');
    assert.equal(after.record.vote, before.record.vote,
      'and at the vote its own record holds');
    assert.equal(after.status.commit, before.status.commit,
      'and at the commit position it had');
    assert.deepEqual(after.record.voters, before.record.voters);
    // The membership the node reports is the one the DURABLE record holds -
    // a projection of the committed configuration and nothing else.
    const projected = cluster.node(follower).readStatus().peers
      .map((peer) => peer.peerId).sort();
    assert.deepEqual(projected,
      after.record.voters.filter((id) =>
        id !== cluster.raftPeerIdOf(follower)).sort(),
      'the node projects the durable committed configuration, minus itself');
    // The caches are hostile and they disagree with it, so this is not a
    // vacuous pass.
    const cacheAnswer = membershipIfTheCacheDecided(cluster, FOUNDING[1]);
    assert.notDeepEqual(cacheAnswer.slice().sort(),
      FOUNDING.slice().sort(),
      'the hostile cache must be saying something the configuration does not');

    // ---- 6. learner addition --------------------------------------------
    const committedVoters = cluster.coreConfState(leader).voters;
    cluster.addReplica(JOINER, FOUNDING);
    const joinerPeerId = cluster.raftPeerIdOf(JOINER);
    assert.ok(!committedVoters.includes(joinerPeerId),
      'the joiner is not a member merely because a service row named it');
    cluster.proposeConfigurationChange(
      [{changeType: types.AddLearnerNode, nodeId: joinerPeerId}],
      transition, leader);
    const learnerAdded = cluster.settle(() =>
      durableRecordOf(cluster.dbFileOf(JOINER)).learners
        .includes(joinerPeerId),
    {rounds: SETTLE_ROUNDS,
      between: (round) => poisonEveryCache(cluster, round)});
    assert.ok(learnerAdded,
      'the learner must learn from the committed configuration that it is one');
    for (const replicaId of [...FOUNDING, JOINER]) {
      assert.ok(durableRecordOf(cluster.dbFileOf(replicaId)).learners
        .includes(joinerPeerId),
      `${replicaId}'s own durable record holds the learner`);
    }

    // ---- 7. catch-up -----------------------------------------------------
    const caughtUp = cluster.settle(() => {
      const learner = durableRecordOf(cluster.dbFileOf(JOINER));
      const leaderRecord = durableRecordOf(cluster.dbFileOf(leader));
      return BigInt(learner.appliedIndex) >= BigInt(leaderRecord.commitIndex);
    }, {rounds: SETTLE_ROUNDS,
      between: (round) => poisonEveryCache(cluster, round)});
    assert.ok(caughtUp,
      'the learner must reach the leader\'s committed position');
    const leaderStatus = cluster.node(leader).readStatus();
    assert.equal(leaderStatus.leaderAddress, cluster.addressOf(leader),
      'semantic status keeps leader identity and network address distinct');
    const learnerAddress = cluster.addressOf(JOINER);
    assert.ok(
      Number.isFinite(leaderStatus.followerProgress?.[learnerAddress]),
      'semantic status projects raft-rs progress for the learner address',
    );
    const progressProbe = await cluster.node(leader)
      .probePeerProgress(learnerAddress);
    assert.equal(progressProbe.outcome, 'CORE_OK',
      'the semantic progress probe stays behind the operation port');
    // Catching up did not make it a voter: that is ConfState's decision.
    assert.ok(!cluster.coreConfState(JOINER).voters.includes(joinerPeerId),
      'a caught-up learner is still a learner until a change commits');

    // ---- 8. promotion ----------------------------------------------------
    cluster.proposeConfigurationChange(
      [{changeType: types.AddNode, nodeId: joinerPeerId}],
      transition, leader);
    const promoted = cluster.settle(() =>
      [...FOUNDING, JOINER].every((replicaId) =>
        durableRecordOf(cluster.dbFileOf(replicaId)).voters
          .includes(joinerPeerId)),
    {rounds: SETTLE_ROUNDS,
      between: (round) => poisonEveryCache(cluster, round)});
    assert.ok(promoted, 'the promotion must commit on every replica');
    for (const replicaId of [...FOUNDING, JOINER]) {
      assert.ok(!durableRecordOf(cluster.dbFileOf(replicaId)).learners
        .includes(joinerPeerId),
      `${replicaId} no longer records the promoted peer as a learner`);
    }

    // ---- 9. removal ------------------------------------------------------
    const retiring = FOUNDING.find((replicaId) => replicaId !== leader &&
      replicaId !== follower);
    const retiringPeerId = cluster.raftPeerIdOf(retiring);
    cluster.proposeConfigurationChange(
      [{changeType: types.RemoveNode, nodeId: retiringPeerId}],
      transition, leader);
    const removed = cluster.settle(() =>
      [leader, follower, JOINER].every((replicaId) =>
        !durableRecordOf(cluster.dbFileOf(replicaId)).voters
          .includes(retiringPeerId)),
    {rounds: SETTLE_ROUNDS,
      between: (round) => poisonEveryCache(cluster, round)});
    assert.ok(removed, 'the removal must commit on every remaining replica');

    // ---- 10. the caches were hostile the whole way, and lost -------------
    const durable = durableVotersByReplica(cluster);
    const remaining = [leader, follower, JOINER];
    const agreed = new Set(remaining.map((replicaId) =>
      JSON.stringify(durable.get(replicaId))));
    assert.equal(agreed.size, 1,
      'every remaining replica holds the same committed configuration');
    const [agreedVoters] = [...agreed].map((text) => JSON.parse(text));
    assert.deepEqual(agreedVoters,
      remaining.map((replicaId) => cluster.raftPeerIdOf(replicaId)).sort(),
      'and it is the configuration the changes committed, not any cache');
    // The caches never became one answer at all: they disagree with each
    // other, one of them still calls the removed replica a live member, and
    // another names a replica that never existed. None of that reached the
    // committed configuration above.
    poisonEveryCache(cluster, 0);
    const caches = remaining.map((replicaId) =>
      JSON.stringify(membershipIfTheCacheDecided(cluster, replicaId)));
    assert.ok(new Set(caches).size > 1,
      'the caches must still disagree with each other');
    assert.ok(membershipIfTheCacheDecided(cluster, leader).includes(retiring),
      'the leader\'s cache still calls the removed replica a live member');
    assert.ok(membershipIfTheCacheDecided(cluster, retiring)
      .includes(PHANTOM_REPLICA),
    'and another cache names a replica that never existed');
    assert.ok(!agreedVoters.includes(retiringPeerId),
      'yet the committed configuration removed it');
  } finally {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
    cluster.dispose();
  }
});

test('the partition request names the durable storage the group runs on, ' +
  'and no backend reads a service row to find it', async () => {
  // The field set is the contract owner's. A backend that needed something
  // absent from it would have to change this list.
  assert.ok(Object.values(RAFT_PARTITION_NODE_REQUEST)
    .includes(RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE),
  'the durable storage handle is a declared requirement, not a lookup');
  const cluster = formedPartition();
  try {
    // Structural: the module that builds a partition port imports nothing
    // that could reach a service or system-table cache.
    const source = fs.readFileSync(path.join(
      REPOSITORY_ROOT, 'src/raft/raft-rs-operation-port.js'), TEXT_ENCODING);
    const imports = [...source.matchAll(/from\s+'([^']+)'/gu)]
      .map(([, specifier]) => specifier);
    for (const specifier of imports) {
      assert.ok(!/service|system-table|cache|partition-service/u
        .test(specifier),
      `the partition port builder must not import ${specifier}`);
    }
    // Behavioural: a cache that names a peer the configuration never had
    // leaves the configuration alone.
    const beforeVoters = durableVotersByReplica(cluster);
    for (const replicaId of FOUNDING) {
      cluster.writeServiceRows(replicaId, [
        {serviceId: PHANTOM_REPLICA, status: LIFECYCLE.ACTIVE}]);
    }
    cluster.settle(() => false, {rounds: 20});
    for (const replicaId of FOUNDING) {
      assert.deepEqual(
        durableRecordOf(cluster.dbFileOf(replicaId)).voters.slice().sort(),
        beforeVoters.get(replicaId),
        'a service row cannot add or remove a member');
    }
  } finally {
    cluster.dispose();
  }
});
