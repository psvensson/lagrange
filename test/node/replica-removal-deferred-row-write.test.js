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
 * row-driven retirement asks its port, which refuses REMOVES_LEADER and hands
 * leadership to the peer, whose deferred copy of the row proposes the
 * RemoveNode on its LEADER): the first REMOVE's REMOVING write fails
 * retryable -> deferred, nothing retired, the source still a committed voter;
 * the re-dispatched REMOVE's write lands -> the REMOVING row reaches the
 * replicas' row-driven retirement, RemoveNode commits, the source leaves on
 * its own applied removal and retires. The peers are addressed as production
 * addresses them, and every row-driven retirement runs through a long-lived
 * service with the production re-drive subscribed.
 * Oracles: a survivor's durable applied configuration, the source's durable
 * lifecycle row against its value at setup.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {durableAppliedState} from
  '../raft/raft-rs-backend/committed-membership-oracles.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {
  createRemovalSourceHandler,
  durableLifecycleState,
  partitionClusterAtRowAddresses,
  rowDrivenRetirements,
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

function setupLeaderRemovalFixture(t, extraSourceOptions = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const cluster = partitionClusterAtRowAddresses(PARTITION_ID, [SOURCE, PEER]);
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
    rowOf: (status) => serviceRow(SOURCE, status),
    ...extraSourceOptions});
  t.teardown(async () => {
    await source.dispose();
    cluster.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const sourceDb = cluster.replica(SOURCE).dbFile;
  const lifecycleAtSetup = durableLifecycleState(sourceDb, PARTITION_ID);
  const survivorVoters = () => durableAppliedState(
    cluster.replica(PEER).dbFile, PARTITION_ID).voters;
  return {cluster, sourcePeerId, cache, source, sourceDb, lifecycleAtSetup,
    survivorVoters};
}

test('a REMOVING row that cannot be made durable defers the REMOVE typed: ' +
  'no wait, no retirement, port live; the re-dispatched REMOVE completes',
async (t) => {
  const {cluster, sourcePeerId, cache, source, sourceDb, lifecycleAtSetup,
    survivorVoters} = setupLeaderRemovalFixture(t);
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
  rowDrivenRetirements({cluster, partitionId: PARTITION_ID,
    replicaIds: [SOURCE, PEER], logger: QUIET_LOGGER})(retiringRow);
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

// Pre-gate 219c27bfe, sql_write_operations-p1-r1 on the seed: the REMOVE's
// REMOVING row was durable, the source left consensus on its own applied
// removal and its port retired; only then did the CREATE admission census
// (a replica_operations read that timed out) refuse the cleanup takeover.
// The REPLACE completed from the committed configuration, nothing
// re-delivered the REMOVE, and the replica stayed REMOVING until shutdown.
// The census now runs before the REMOVING intent, where a deferral changes
// nothing; the REMOVING row then names exactly the closed generation.
test('a CREATE admission census that does not answer defers the REMOVE ' +
  'before its REMOVING intent: nothing retires; the re-dispatched REMOVE ' +
  'closes the admission and completes', async (t) => {
  const attemptToken = `create-attempt:${SOURCE}:1`;
  const admissionOperationId = `add-${SOURCE}`;
  const {cluster, sourcePeerId, cache, source, sourceDb, lifecycleAtSetup,
    survivorVoters} = setupLeaderRemovalFixture(t, {
    createAttemptToken: attemptToken,
    // The completed ADD that created this generation: its CREATE admission
    // is still open (ACTIVE) when the removal begins.
    replicaOperations: [{
      operation_id: admissionOperationId, type: 'ADD',
      entity_type: 'partition', entity_id: PARTITION_ID,
      partition_id: PARTITION_ID, replica_id: SOURCE,
      target_node_id: `${SOURCE}-node`, workflow_step: 'ACTIVE',
      completed_at: 1, create_admission_state: 'ACTIVE',
      create_admission_token: `admission:${SOURCE}`,
      create_admission_replica_created_at: 1,
      create_admission_attempt_token: attemptToken,
      create_admission_attempt_seq: 1,
    }],
  });
  // The census (replica_operations, owner-required) does not answer while
  // `censusAnswers` is false; every SERVICES read and write goes through.
  const censusAnswers = {value: false};
  const gateway = source.lifecycleStore.gateway;
  const read = gateway.readAuthoritativeRows;
  const censusAwareRead = (tableName, ...args) =>
    tableName === 'replica_operations' && !censusAnswers.value ?
      Promise.resolve({success: false, error: 'fixture census timeout'}) :
      read(tableName, ...args);
  gateway.readAuthoritativeRows = censusAwareRead;
  gateway.executeAuthoritativeSystemTableRead = censusAwareRead;
  const admissionState = () => source.lifecycleStore.durable
    .replica_operations.get(admissionOperationId)?.create_admission_state;
  const removeOutcomes = () => source.outcomes.filter(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED ||
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED).map(([type]) => type);
  // The group's row-driven retirement of a durable REMOVING row (the
  // production CDC consumer on every member), then rounds until the source
  // reports its consensus exit and its removal settles.
  const deliverRetiringRow = rowDrivenRetirements({cluster,
    partitionId: PARTITION_ID, replicaIds: [SOURCE, PEER],
    logger: QUIET_LOGGER});
  const driveRetiringRow = async () => {
    const retiringRow = cache.get('services', SOURCE);
    if (retiringRow?.status !== ReplicaStatus.REMOVING) return;
    deliverRetiringRow(retiringRow);
    for (let round = 0; round < 40 && removeOutcomes().length === 0;
      round += 1) {
      cluster.settle(() => false, {rounds: 10});
      await nextTurns();
    }
  };

  await source.removeRequest('op-census-deferred-1');
  await nextTurns();
  cluster.tickers = [SOURCE, PEER];
  await driveRetiringRow();
  cluster.settle(() => false, {rounds: 40});
  await nextTurns();
  t.not(cache.get('services', SOURCE)?.status, ReplicaStatus.REMOVING,
    'no REMOVING intent is published while its CREATE admission is open');
  t.same(removeOutcomes(), [],
    'no terminal outcome: the operation stays non-terminal for re-dispatch');
  t.same(source.exits, [], 'no consensus exit was entered');
  t.equal(durableLifecycleState(sourceDb, PARTITION_ID), lifecycleAtSetup,
    'the source is not retired');
  t.equal(cluster.node(SOURCE).readStatus().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK, 'its port is live');
  t.ok(survivorVoters().includes(sourcePeerId),
    'it is still a committed voter');
  t.equal(admissionState(), 'ACTIVE', 'its CREATE admission is still open');
  t.equal(source.handler.inProgressOperations.size, 0,
    'the REMOVE was answered (deferred), not left waiting');

  // The census answers; the durable owner re-dispatches.
  censusAnswers.value = true;
  await source.removeRequest('op-census-deferred-2');
  await nextTurns();
  t.equal(admissionState(), 'CLOSED',
    'the generation\'s CREATE admission is closed before the intent');
  const retiringRow = cache.get('services', SOURCE);
  t.equal(retiringRow?.status, ReplicaStatus.REMOVING,
    'the re-dispatched REMOVE made the REMOVING row durable');
  t.equal(retiringRow?.created_at, 1, 'on the closed generation');
  t.equal(retiringRow?.create_attempt_token, attemptToken,
    'with the closed create attempt');
  await driveRetiringRow();
  t.notOk(survivorVoters().includes(sourcePeerId),
    'RemoveNode(source) committed');
  t.same(source.exits.map((exit) => exit.reason),
    [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
    'the source left consensus on its own applied removal');
  t.same(removeOutcomes(), [EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED],
    'the removal completed after its consensus exit: nothing refused it');
  t.not(durableLifecycleState(sourceDb, PARTITION_ID), lifecycleAtSetup,
    'the source retired');
  t.equal(source.handler.replicaStateMachine.getState(SOURCE), null,
    'no REMOVING residue in lifecycle tracking');
});
