/**
 * Two answers of a real removal at its edges (M1, M3).
 *
 * M1: a removal whose replica's connection was released by something other
 * than this removal (node shutdown, a failed initialization - here the
 * partition's own serving surface over a released connection) never crosses
 * its point of no return: no retiring row, no consensus exit, no outcome;
 * the replica keeps its status and stays a committed voter.
 *
 * M3: a real removal completes, then is asked again. The source side is the
 * production replica handler over a real rs-raft port of a two-voter group
 * (the fixture of replica-removal-consensus-exit.test.js); the leader's
 * row-driven retirement proposes its RemoveNode. Once the removal completed
 * (its services row deleted, its local record REMOVED by that operation):
 *  - the same operation's REMOVE is answered COMPLETED (R14);
 *  - another operation's REMOVE is answered ERROR with the typed, final
 *    REPLICA_ABSENT_NOT_BY_OPERATION and deferRetry false - never the
 *    retryable REPLICA_REMOVAL_COMPLETION_DEFERRED that nothing would ever
 *    clear (the coordinator's durable effect check then decides at once).
 */

import {test} from '../../src/test-helpers/tap.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_ABSENT_NOT_BY_OPERATION} from
  '../../src/node/replica-removal-debt-errors.js';
import {retirePartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {PARTITION_SERVICE_REMOVAL_SERVING_METHODS} from
  '../../src/partition/partition-service-removal-serving-methods.js';
import {nextTurns, openTwoVoterRemovalWorld} from
  './replica-removal-consensus-exit-fixture.js';

const PARTITION_ID = 'users-p17';
const SOURCE = `${PARTITION_ID}-r1`;
const LEADER = `${PARTITION_ID}-r2`;
const NODE_OF = Object.freeze({[SOURCE]: 'node-a', [LEADER]: 'node-b'});
const EXIT_ROUNDS = 40;

function openWorld(t) {
  return openTwoVoterRemovalWorld(t, {partitionId: PARTITION_ID,
    source: SOURCE, leader: LEADER, nodeOf: NODE_OF});
}

test('a completed removal re-asked: COMPLETED to its own operation, a ' +
  'typed final REPLICA_ABSENT_NOT_BY_OPERATION to another', async (t) => {
  const world = openWorld(t);
  const {cluster, cache, source} = world;
  t.equal(world.elected, true, 'setup: the other voter leads');
  const ack = await source.removeRequest('op-first-remove');
  t.equal(ack.status, ReplicaOperationResponseStatus.INITIATED);
  await nextTurns();
  t.equal(cache.get('services', SOURCE)?.status, ReplicaStatus.REMOVING,
    'the source published its retiring row');
  await retirePartitionRaftPeer({raft: cluster.node(LEADER),
    partitionId: PARTITION_ID, replicaId: LEADER}, SOURCE);
  const completed = () => source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED);
  for (let round = 0; round < EXIT_ROUNDS && !completed(); round += 1) {
    cluster.settle(() => false, {rounds: 10});
    await nextTurns();
  }
  t.ok(completed(), 'setup: the removal completed');
  t.equal(cache.get('services', SOURCE) ?? null, null,
    'setup: its services row is deleted');
  const typed = (answer) => ({status: answer.status,
    errorCode: answer.errorCode ?? null, deferRetry: answer.deferRetry ?? null});
  t.same(typed(await source.removeRequest('op-first-remove')), {
    status: ReplicaOperationResponseStatus.COMPLETED, errorCode: null,
    deferRetry: null}, 'its own operation re-asked: COMPLETED');
  t.same(typed(await source.removeRequest('op-other-remove')), {
    status: ReplicaOperationResponseStatus.ERROR,
    errorCode: REPLICA_ABSENT_NOT_BY_OPERATION, deferRetry: false},
  'another operation: typed, final, not deferred');
});

test('a removal whose replica connection was released outside it publishes ' +
  'no retiring row and leaves the replica a committed voter', async (t) => {
  const world = openWorld(t);
  const {cache, source, peerIds} = world;
  t.equal(world.elected, true, 'setup: the other voter leads');
  // The partition's own serving surface, its connection released by
  // something other than this removal (as shutdown or a failed init leaves
  // it).
  Object.assign(source.service, PARTITION_SERVICE_REMOVAL_SERVING_METHODS,
    {db: null, activeServingRequestCount: 0});
  const ack = await source.removeRequest('op-closed-outside');
  t.equal(ack.status, ReplicaOperationResponseStatus.INITIATED);
  await nextTurns();
  t.equal(cache.get('services', SOURCE)?.status, ReplicaStatus.ACTIVE,
    'no retiring row was published');
  t.same(source.outcomes, [], 'no terminal outcome');
  t.same(source.exits, [], 'no consensus-exit wait was entered');
  t.equal(source.handler.inProgressOperations.size, 0,
    'the REMOVE was answered (deferred), not left in progress');
  t.equal(source.handler.getLocalReplica(SOURCE)?.status,
    ReplicaStatus.ACTIVE, 'the replica keeps its status');
  t.equal(world.sourceLifecycle(), world.lifecycleAtSetup, 'not retired');
  t.ok(world.committedVoters().includes(peerIds[SOURCE]),
    'still a committed voter');
});
