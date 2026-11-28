// P9/P10 (placement-owner proof transfer, priority group 4): negative
// witnesses of single-owner scheduling.
//
// Requirement (owner, binding): scheduling authority is single for its scope
// and leadership tenure and comes from the ledger's consensus authority; a
// declaration recomputed from a local cache grants nothing; with no published
// owner, only the placement owner on the ledger leader acts; a target
// partition's leader never appoints itself scheduler (it keeps consensus and
// its own publication); a non-leader node's owner object never proposes.
//
// Fixture: placement-owner-authority-fixture.js (production construction per
// node; evidence ceiling stated there). Leader identity: follower SERVICES
// rows plus PARTITIONS leader_node_id.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {buildPlacementAdmissionStatement} from
  '../../src/rebalancer/replica-placement-owner-admission-statement.js';
import {PLACEMENT_CLASS, PLACEMENT_COPY_CAPACITY} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  LEDGER, THREE_NODES, admittedOperations, ownerOf, startThreeNodeLedger, transferReport,
  waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const TARGET = 'sql_transactions-p1';
const OWNERLESS = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: null, replicaNodeIds: ['n2', 'n3']},
]});
const PUBLISHED = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: 'n2', replicaNodeIds: ['n2', 'n3']},
]});
const NOT_LEADER = PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER;
const PROGRESS_BOUND_MS = 3_000;

function reportOf(t, world) {
  const report = transferReport(world, TARGET);
  t.diagnostic(JSON.stringify(report));
  return JSON.stringify(report);
}

function placementWorkOf(node) {
  return {passes: node.probe.passes.length, constructions: node.probe.constructions.length,
    capacityChecks: node.probe.capacityChecks.length,
    admissionAttempts: node.probe.admissionAttempts.length};
}

const NO_WORK = Object.freeze({passes: 0, constructions: 0, capacityChecks: 0,
  admissionAttempts: 0});

test('P9 a target partition\'s leader does not schedule: it publishes its leadership and holds ' +
  'no rebalancer; the ledger leader on another node admits the move', (t) =>
  withPlacementWorld(OWNERLESS, async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [n1, n2, n3] = nodes;
    const replicaIds = [`${TARGET}-n2`, `${TARGET}-n3`];
    const targets = [await world.startTargetReplica(n2, TARGET, replicaIds),
      await world.startTargetReplica(n3, TARGET, replicaIds)];
    await world.electLedger(n1);
    await world.idle();
    world.electTarget(targets[0], targets);
    await waitUntil(() => targets[0].isLeader === true && admittedOperations(world, n1, TARGET)
      .length === 1, 'the target leads and the ledger leader admitted', PROGRESS_BOUND_MS);
    await waitUntil(() => targets[0].leaderActivationGate.activatedTerm !== null,
      'the target leader\'s activation ran (maybeInitializeRebalancer on its edge)');
    await world.idle();
    const report = reportOf(t, world);
    const target = targets[0];
    assert.ok(target.buildRebalancerDependencyBundle(), 'anti-vacuity: the target leader holds ' +
      'every dependency of a per-partition rebalancer');
    assert.equal(target.isBackgroundWorkReady(), true, 'anti-vacuity: background-work ready');
    assert.equal(target.rebalancer ?? null, null, `the target leader built no scheduler; ${report}`);
    assert.equal(target.replicaPlacementOwnerAttachment ?? null, null, report);
    assert.ok(world.publishedMutations.some((record) => record.tableName === 'partitions' &&
      record.data.leader_node_id === 'n2'), `it published its own leadership; ${report}`);
    assert.deepEqual(placementWorkOf(n2), NO_WORK,
      `the target leader's node did no placement work; ${report}`);
    assert.equal(world.log.proposals.filter((proposal) => proposal.nodeId === 'n2').length, 0,
      report);
    assert.deepEqual(placementWorkOf(n3), NO_WORK, report);
    const [operation] = admittedOperations(world, n1, TARGET);
    assert.equal(operation.proposerNodeId, 'n1', `the ledger leader admitted it; ${report}`);
  }));

test('P10(i) authority from cache: every cache names n2 as the ledger leader while n2\'s core ' +
  'is a follower; n2\'s owner runs no pass and proposes nothing, n1\'s core leads and admits',
(t) => withPlacementWorld(PUBLISHED, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1, n2, n3] = nodes;
  world.publishRow('partitions', {partition_id: LEDGER, leader_node_id: 'n2'});
  for (const node of nodes) {
    assert.equal(node.cache.get('partitions', LEDGER).leader_node_id, 'n2',
      `${node.nodeId}'s cache names n2`);
  }
  t.diagnostic(`n2's route projection: ${JSON.stringify(
    n2.coordinator.resolveRemoteLedgerLeader())}`);
  await world.electLedger(n1);
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(ownerOf(n2).isLeader, false, `the cache grants n2's owner nothing; ${report}`);
  assert.deepEqual(placementWorkOf(n2), NO_WORK, report);
  assert.deepEqual(placementWorkOf(n3), NO_WORK, report);
  assert.equal(n2.coordinator.resolveActiveLocalLedgerLeaderService(), null,
    `n2's coordinator has no local ledger leader; ${report}`);
  const [operation] = admittedOperations(world, n1, TARGET);
  assert.equal(operation?.proposerNodeId, 'n1',
    `n1's live consensus authority admits although every cache names n2; ${report}`);
}));

test('P10(ii) a remote proposer following the cache route to a node whose core does not lead ' +
  'is refused typed; after the route names the real leader the request reaches it',
(t) => withPlacementWorld(PUBLISHED, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1, , n3] = nodes;
  world.publishRow('partitions', {partition_id: LEDGER, leader_node_id: 'n2'});
  await world.electLedger(n1);
  await world.idle();
  const statement = buildPlacementAdmissionStatement({partitionId: 'remote-p1',
    placementClass: PLACEMENT_CLASS.USER, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n3', replicaId: null, sourceReplicaId: null,
      copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(), formationLatchEpoch: 3,
    membershipPublicationEpoch: null, positions: {},
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT});
  const submit = async (entryId) => {
    try {
      return await n3.coordinator.submitPlacementPayload({entryId, body: statement}, 2_000);
    } catch (error) {
      return {thrown: error?.message ?? String(error), code: error?.code ?? null};
    }
  };
  const stale = await submit('remote-probe:stale-route');
  world.publishRow('partitions', {partition_id: LEDGER, leader_node_id: 'n1'});
  const current = await submit('remote-probe:current-route');
  await world.idle();
  const report = reportOf(t, world);
  t.diagnostic(JSON.stringify({stale, current, routes: world.routes}));
  assert.equal(stale?.failureCode, NOT_LEADER,
    'the stale route is refused typed by the receiver\'s core role ' +
    `(answer ${JSON.stringify(stale)}); ${report}`);
  assert.equal(world.log.proposals.filter((proposal) =>
    proposal.entryId === 'remote-probe:stale-route').length, 0,
  `nothing was proposed on the stale route; ${report}`);
  assert.notEqual(current?.failureCode, NOT_LEADER, 'the current route reaches the leader; ' +
    `${JSON.stringify(current)}`);
  assert.deepEqual(world.log.proposals.filter((proposal) =>
    proposal.entryId === 'remote-probe:current-route').map((proposal) => proposal.nodeId),
  ['n1'], `the request was proposed by the real leader; ${report}`);
}));
