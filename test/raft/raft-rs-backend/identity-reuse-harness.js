// Shared driving for the identity-reuse witnesses: a three-replica group on
// real rs-raft ports (PartitionNodeCluster: the real WASM core, one database
// file each), the defect's shape - a replica identity re-opened empty under a
// GENESIS stamp while the leader still holds its progress - and reads of what
// each replica's own durable bytes and port say. Nothing here decides a
// verdict; the witnesses do.

import fs from 'node:fs';

import Database from 'better-sqlite3';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {durableHardState} from './committed-membership-oracles.js';
import {LoggingService} from '../../../src/logging/logging-service.js';

const LEADER_ROLE = 'leader';
const SETTLE_ROUNDS = 400;
const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';

/**
 * A formed group: the first replica elected, `entries` proposals committed
 * on every replica.
 * @param {string} partitionId - The group.
 * @param {Array<string>} replicaIds - Its founders; the first leads.
 * @param {number} entries - How many proposals to commit.
 * @return {PartitionNodeCluster}
 */
function formedCluster(partitionId, replicaIds, entries) {
  const cluster = new PartitionNodeCluster({partitionId, replicaIds});
  const [leader] = replicaIds;
  cluster.tickers = [leader];
  if (!cluster.settle(() => roleOf(cluster, leader) === LEADER_ROLE,
    {rounds: SETTLE_ROUNDS})) {
    throw new Error(`setup: ${leader} was not elected`);
  }
  for (let index = 0; index < entries; index += 1) {
    cluster.propose(leader, {op: 'formed', index});
    cluster.settle(() => false, {rounds: 1});
  }
  const target = Number(cluster.node(leader).readStatus().commitIndex);
  if (!cluster.settle(() => replicaIds.every((replicaId) =>
    Number(cluster.node(replicaId).readStatus().commitIndex) >= target),
  {rounds: SETTLE_ROUNDS})) {
    throw new Error('setup: the formed entries did not commit everywhere');
  }
  return cluster;
}

/**
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @param {string} replicaId - The replica.
 * @return {string|undefined} Its role as its port reports it.
 */
function roleOf(cluster, replicaId) {
  return cluster.node(replicaId).readStatus().role;
}

/**
 * The defect's shape: the replica's incarnation is stopped and its identity
 * re-opened on an empty database under the founders' GENESIS stamp - what a
 * message-group port opened by MOVE_REPLICA on a joiner did.
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @param {string} replicaId - The replica to re-open empty.
 */
function reopenEmpty(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  replica.node.close();
  replica.db.close();
  fs.rmSync(cluster.dbFileOf(replicaId), {force: true});
  cluster.buildReplica(replicaId, cluster.replicaIds.slice(0, 3),
    replica.extraRequest);
}

/**
 * Every (term, replica) that reports itself leader, read from the ports
 * that answer a status.
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @return {Array<Array>} [replicaId, term] pairs.
 */
function leadersByTerm(cluster) {
  return [...cluster.replicas.keys()].flatMap((replicaId) => {
    const status = cluster.node(replicaId).readStatus();
    return status.role === LEADER_ROLE ? [[replicaId, status.term]] : [];
  });
}

/**
 * The replica's durable lifecycle row, read on a connection of the test's
 * own.
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @param {string} replicaId - The replica.
 * @return {Object|null} {state, reason}.
 */
function lifecycleRow(cluster, replicaId) {
  const db = new Database(cluster.dbFileOf(replicaId), {readonly: true});
  try {
    return db.prepare(`SELECT state, reason FROM ${LIFECYCLE_TABLE} ` +
      'WHERE group_id = ?').get(cluster.partitionId) ?? null;
  } finally {
    db.close();
  }
}

/**
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @param {string} replicaId - The replica.
 * @return {Object|null} Its durable {term, vote, commit}.
 */
function hardStateOf(cluster, replicaId) {
  return durableHardState(cluster.dbFileOf(replicaId), cluster.partitionId);
}

/**
 * Capture the structured ERROR lines while `work` runs (the panic hook's raw
 * stderr is silenced alongside, as every trapping witness does).
 * @param {Function} work - What to run.
 * @return {Promise<Array<Object>>} {message, context} per ERROR line.
 */
async function capturingErrors(work) {
  const logging = LoggingService.getInstance();
  const lines = [];
  const originalError = logging.error;
  const originalConsoleError = console.error;
  logging.error = (message, context = {}) => {
    lines.push({message, context});
  };
  console.error = () => undefined;
  try {
    await work();
  } finally {
    logging.error = originalError;
    console.error = originalConsoleError;
  }
  return lines;
}

/**
 * The raft peer id the backend registered for every replica, read while each
 * port still answers a status (an identity re-opened later keeps it: the id
 * derives from the replica's name).
 * @param {PartitionNodeCluster} cluster - The cluster.
 * @return {Object} replicaId -> raft peer id.
 */
function peerIdsOf(cluster) {
  return Object.fromEntries([...cluster.replicas.keys()].map((replicaId) =>
    [replicaId, cluster.raftPeerIdOf(replicaId)]));
}

/**
 * A peer message envelope addressed to a raft peer id, as the transport
 * carries one.
 * @param {string} groupId - The group.
 * @param {string} to - The recipient's raft peer id.
 * @param {Object} message - The raft message (without `to`).
 * @return {Object} The envelope.
 */
function envelopeTo(groupId, to, message) {
  return {groupId, from: message.from, to, message: {...message, to}};
}

export {
  LEADER_ROLE,
  SETTLE_ROUNDS,
  capturingErrors,
  envelopeTo,
  formedCluster,
  hardStateOf,
  leadersByTerm,
  lifecycleRow,
  peerIdsOf,
  reopenEmpty,
};
