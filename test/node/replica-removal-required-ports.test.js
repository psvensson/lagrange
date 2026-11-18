/**
 * The replica removal path's collaborators are required, never optional
 * (2026-11-11, fallback closure of the removal path): a missing one is a
 * construction failure or a loud failure of the removal, never a quieter
 * path that skips the step it owns.
 *  - the lifecycle owner's event port: the REMOVING re-drive subscribes at
 *    construction; a handler cannot be built without it;
 *  - the partition's serving drain: a tracked service that cannot drain
 *    fails the removal before its retiring row (no silently skipped drain);
 *    a removal with no tracked service drains nothing, a named NOT_HOSTED;
 *  - the port's APPLIED_PROGRESS wake: a drain on a port without the
 *    subscribe every operation port carries fails loudly, never a wait that
 *    lost its wake.
 * The real-group witnesses of the settlement, the cancellation and the group
 * ask are in replica-removal-settlement.test.js.
 */

import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  PARTITION_SERVICE_REMOVAL_SERVING_METHODS,
  REMOVAL_SERVING_STATE,
} from '../../src/partition/partition-service-removal-serving-methods.js';
import {openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';
import {createMockCache} from '../rebalancer/test-helpers.js';
import {openTwoVoterRemovalWorld} from
  './replica-removal-consensus-exit-fixture.js';

const PARTITION_ID = 'required-ports-p1';
const SOURCE = `${PARTITION_ID}-r1`;
const LEADER = `${PARTITION_ID}-r2`;
const NODE_OF = Object.freeze({[SOURCE]: 'node-a', [LEADER]: 'node-b'});

function nextTurns(turns = 20) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < turns; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

test('a replica handler cannot be built over a lifecycle owner without its ' +
  'event port: the REMOVING re-drive is never silently unsubscribed',
async (t) => {
  t.throws(() => new ReplicaHandler({
    nodeId: 'required-ports-node',
    systemTableCache: createMockCache({services: []}),
    cdcIntegrationService: {},
    createPartitionService: () => {
      throw new Error('this world creates no partition service');
    },
    replicaStateMachine: {getState: () => null},
  }), TypeError, 'construction fails');
});

test('a tracked service that cannot drain fails the removal before its ' +
  'retiring row; the replica stays a committed voter, nothing retired',
async (t) => {
  const world = openTwoVoterRemovalWorld(t, {partitionId: PARTITION_ID,
    source: SOURCE, leader: LEADER, nodeOf: NODE_OF});
  const {cache, source, peerIds} = world;
  t.equal(world.elected, true, 'setup: the other voter leads');
  delete source.service.waitForRemovalServingDrain;
  const ack = await source.removeRequest('op-no-drain');
  t.equal(ack.status, ReplicaOperationResponseStatus.INITIATED,
    'the REMOVE is accepted (the fence is raised at acceptance)');
  await nextTurns();
  t.same({failed: source.outcomes.some(([type]) =>
    type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED),
  row: cache.get('services', SOURCE)?.status,
  exits: source.exits.length,
  lifecycle: world.sourceLifecycle() === world.lifecycleAtSetup,
  voter: world.committedVoters().includes(peerIds[SOURCE])},
  {failed: true, row: ReplicaStatus.FAILED, exits: 0, lifecycle: true,
    voter: true},
  'the removal failed loudly before its retiring row: no REMOVING row, no ' +
  'consensus exit, its lifecycle untouched, still a committed voter');
});

test('a removal with no tracked service drains nothing: the named ' +
  'NOT_HOSTED answer', async (t) => {
  const world = openTwoVoterRemovalWorld(t, {partitionId: `${PARTITION_ID}-nh`,
    source: `${PARTITION_ID}-nh-r1`, leader: `${PARTITION_ID}-nh-r2`,
    nodeOf: {[`${PARTITION_ID}-nh-r1`]: 'node-a',
      [`${PARTITION_ID}-nh-r2`]: 'node-b'}});
  t.same(await world.source.handler.waitForReplicaServingDrain(null),
    {state: REMOVAL_SERVING_STATE.NOT_HOSTED}, 'NOT_HOSTED');
});

test('a drain on a port without its subscribe fails loudly instead of ' +
  'waiting without the APPLIED_PROGRESS wake', async (t) => {
  const db = new Database(':memory:');
  openParticipantTransactionStore(db);
  const service = Object.assign({
    partitionId: PARTITION_ID, replicaId: SOURCE, db,
    activeServingRequestCount: 1, removalServingAdmissionFenced: true,
    removalDrainWakes: new Set(), raft: {},
  }, PARTITION_SERVICE_REMOVAL_SERVING_METHODS);
  await t.rejects(service.waitForRemovalServingDrain(), TypeError,
    'the drain rejects');
  db.close();
});
