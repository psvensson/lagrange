/**
 * A removal effect never proceeds without a durable REMOVING row (lead
 * ruling, mirroring the REPLACE's durable-intent rule; replace-owner round 1
 * V2 and the fix-f5 follow-up). When the REMOVING write exhausts its retry
 * on a retryable control-plane failure, the handler neither waits nor
 * retires: it answers the REMOVE with the typed retryable deferral of its
 * status-write family (no executor outcome - the operation stays
 * non-terminal and the durable owner re-dispatches it), clears its
 * in-progress record, and leaves the port live and the replica a full
 * consensus participant. The 30 s exit backstop starts only once a REMOVING
 * row is durable - then the row-driven owner is the one proposer.
 *
 * Production sequence, a two-voter group whose LEADER is removed (its own
 * row-driven retirement proposes its RemoveNode, round 2 F-1): the first
 * REMOVE's REMOVING write fails retryable -> deferred, nothing retired, the
 * source still a committed voter; the re-dispatched REMOVE's write lands ->
 * the REMOVING row reaches the replicas' row-driven retirement, RemoveNode
 * commits, the source leaves on its own applied removal and retires.
 * Oracles: a survivor's durable applied configuration, the source's durable
 * lifecycle row against its value at setup.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION} from '../../src/constants/index.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {retireRaftPeerFromAuthoritativeServiceChange} from
  '../../src/partition/partition-service-raft-peer-cache-reconciliation.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';
import {durableAppliedState} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
} from './replica-removal-consensus-exit-fixture.js';

const PARTITION_ID = 'users-p8';
const SOURCE = `${PARTITION_ID}-r1`;
const PEER = `${PARTITION_ID}-r2`;
const ROUNDS = 400;
const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}});

function serviceRow(replicaId, status) {
  const nodeId = `${replicaId}-node`;
  return {service_id: replicaId, replica_id: replicaId,
    partition_id: PARTITION_ID, node_id: nodeId, service_type: 'partition',
    status, raft_role: 'follower', address: `${nodeId}/partition/${replicaId}`};
}

function nextTurns(turns = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < turns; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

test('a REMOVING row that cannot be made durable defers the REMOVE typed: ' +
  'no wait, no retirement, port live; the re-dispatched REMOVE completes',
async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
    replicaIds: [SOURCE, PEER]});
  cluster.tickers = [SOURCE];
  t.ok(cluster.settle(() => cluster.leaderReplicaId() === SOURCE &&
    durableAppliedState(cluster.replica(PEER).dbFile, PARTITION_ID)
      ?.appliedIndex > 0, {rounds: ROUNDS}), 'setup: the source leads');
  const sourcePeerId = String(cluster.raftPeerIdOf(SOURCE));
  const cache = createMockCache({services: [
    serviceRow(SOURCE, ReplicaStatus.ACTIVE),
    serviceRow(PEER, ReplicaStatus.ACTIVE)]});
  const source = createRemovalSourceHandler({cluster, replicaId: SOURCE,
    partitionId: PARTITION_ID, nodeId: `${SOURCE}-node`, cache,
    rowOf: (status) => serviceRow(SOURCE, status)});
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  // The REMOVING write exhausts its retry on a retryable control-plane
  // failure while `rowWriteFails` holds; every other write goes through.
  const rowWriteFails = {value: true};
  const persist = source.handler.persistReplicaStatusWithRetry
    .bind(source.handler);
  source.handler.persistReplicaStatusWithRetry = async (id, status, data) => {
    if (status === ReplicaStatus.REMOVING && rowWriteFails.value) {
      throw Object.assign(new Error('control-plane write deferred'),
        {deferRetry: true});
    }
    return persist(id, status, data);
  };
  const sourceDb = cluster.replica(SOURCE).dbFile;
  const lifecycleAtSetup = durableLifecycleState(sourceDb, PARTITION_ID);
  const survivorVoters = () => durableAppliedState(
    cluster.replica(PEER).dbFile, PARTITION_ID).voters;
  const removeOutcomes = () => source.outcomes.filter(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED ||
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);

  // The first REMOVE: its REMOVING row cannot be made durable.
  await source.removeRequest('op-deferred-row-1');
  await nextTurns();
  cluster.tickers = [SOURCE, PEER];
  cluster.settle(() => false, {rounds: 40});
  await nextTurns();
  t.not(cache.get('services', SOURCE)?.status, ReplicaStatus.REMOVING,
    'setup: the REMOVING row write did not land');
  t.equal(source.handler.inProgressOperations.size, 0,
    'the REMOVE was answered (deferred), not left waiting');
  t.same(removeOutcomes(), [],
    'no terminal outcome: the operation stays non-terminal for re-dispatch');
  t.same(source.exits, [], 'no consensus-exit wait was entered');
  t.equal(durableLifecycleState(sourceDb, PARTITION_ID), lifecycleAtSetup,
    'the source is not retired');
  t.equal(cluster.node(SOURCE).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'its port is live');
  t.ok(survivorVoters().includes(sourcePeerId),
    'it is still a committed voter');

  // The durable owner re-dispatches; the REMOVING write now lands.
  rowWriteFails.value = false;
  await source.removeRequest('op-deferred-row-2');
  await nextTurns();
  const retiringRow = cache.get('services', SOURCE);
  t.equal(retiringRow?.status, ReplicaStatus.REMOVING,
    'the re-dispatched REMOVE made the REMOVING row durable');
  for (const replicaId of [SOURCE, PEER]) {
    retireRaftPeerFromAuthoritativeServiceChange({
      raft: cluster.node(replicaId), replicaId, partitionId: PARTITION_ID,
      replicaIds: [SOURCE, PEER], peerAddresses: [], logger: QUIET_LOGGER,
    }, CDC_OPERATION.UPDATE, retiringRow);
  }
  for (let round = 0; round < 40 && source.exits.length === 0; round += 1) {
    cluster.settle(() => false, {rounds: 10});
    await nextTurns();
  }
  t.notOk(survivorVoters().includes(sourcePeerId),
    'RemoveNode(source) committed');
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'the source left consensus on its own applied removal');
  t.not(durableLifecycleState(sourceDb, PARTITION_ID), lifecycleAtSetup,
    'then it retired');
});
