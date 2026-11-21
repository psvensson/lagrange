// P2/P7/P11 (placement-owner proof transfer, priority group 5): delayed and
// changed publication, retained work across restart, and useful progress after
// a disruption clears, each through the production construction with the
// counts per actor (construction passes, capacity checks, admission attempts,
// proposals, admitted operations).
//
// Requirement (owner, binding): recovery of a temporarily ownerless priority
// partition; no duplicated placement work; retained work survives restart;
// progress resumes when the disruption clears.
//
// Fixture: placement-owner-authority-fixture.js (production construction per
// node; controllable consensus with a fixture-owned ledger log; a restart
// opens a new PartitionService over the same database file). Leader identity:
// follower SERVICES rows plus PARTITIONS leader_node_id.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {PLACEMENT_ADMIT_TYPE} from '../../src/partition/partition-placement-admission-constants.js';
import {ReplicaStatus, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-operation-progress.js';
import {PLACEMENT_TRIGGER} from '../../src/rebalancer/replica-placement-owner-constants.js';
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
const PROGRESS_BOUND_MS = 3_000;

function reportOf(t, world, partitionId = TARGET) {
  const report = transferReport(world, partitionId);
  t.diagnostic(JSON.stringify(report));
  return JSON.stringify(report);
}

test('P2 leader published late and then changed before any admission: the admitted move ' +
  'copies from the current leader; one admitted operation', (t) => withPlacementWorld(
  {nodes: THREE_NODES, partitions: [
    {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
    {partitionId: TARGET, leaderNodeId: null, replicaNodeIds: ['n2', 'n3']},
  ]}, async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [n1, n2, n3] = nodes;
    const replicaIds = [`${TARGET}-n2`, `${TARGET}-n3`];
    const targets = [await world.startTargetReplica(n2, TARGET, replicaIds),
      await world.startTargetReplica(n3, TARGET, replicaIds)];
    await world.electLedger(n1);
    await world.idle();
    world.publicationHeld = true;
    world.electTarget(targets[0], targets);
    await waitUntil(() => world.heldPublications.some((record) =>
      record.row?.leader_node_id === 'n2'), 'n2\'s leadership committed, delivery held');
    world.electTarget(targets[1], targets);
    await waitUntil(() => world.heldPublications.some((record) =>
      record.row?.leader_node_id === 'n3'), 'n3\'s leadership committed, delivery held');
    world.releasePublications();
    await waitUntil(() => admittedOperations(world, n1, TARGET).length === 1,
      'admitted after the delayed publications', PROGRESS_BOUND_MS);
    await world.idle();
    const report = reportOf(t, world);
    const [operation] = admittedOperations(world, n1, TARGET);
    assert.equal(operation.sourceNodeId, 'n3', `copy source is the current leader; ${report}`);
    assert.equal(world.log.proposals.filter((proposal) => proposal.partitionId === TARGET)
      .length, 1, `one proposal for the deficit; ${report}`);
    for (const node of nodes) {
      assert.equal(admittedOperations(world, node, TARGET).length, 1, report);
    }
  }));

test('P7 retained work across restart: a proposal lost before consensus, the ledger service ' +
  'and owner discarded, a new PartitionService over the same file regains leadership and ' +
  'replays the identical entry', (t) => withPlacementWorld({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]}, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  world.log.dropNext = (node, entry) => node === n1 && entry.type === PLACEMENT_ADMIT_TYPE;
  await world.electLedger(n1);
  await waitUntil(() => world.log.proposals.some((proposal) => proposal.dropped),
    'the first proposal was lost before it entered the log');
  const lost = world.log.proposals.find((proposal) => proposal.dropped);
  world.log.term += 1;
  await world.restartLedgerReplica(n1);
  const restartedOwner = ownerOf(n1);
  assert.equal(restartedOwner.isLeader, false, 'the restarted replica does not lead yet');
  await world.electLedger(n1);
  await waitUntil(() => admittedOperations(world, n1, TARGET).length === 1,
    'the restarted owner admitted', PROGRESS_BOUND_MS);
  await world.idle();
  const report = reportOf(t, world);
  const replays = world.log.proposals.filter((proposal) => proposal.partitionId === TARGET &&
    !proposal.dropped);
  assert.equal(replays.length, 1, `one proposal after the restart; ${report}`);
  assert.equal(replays[0].entryId, lost.entryId, `identical entry id; ${report}`);
  assert.equal(replays[0].bodyText, lost.bodyText, `identical bytes; ${report}`);
  const firstAttempt = n1.probe.admissionAttempts[0];
  assert.ok(firstAttempt?.pass?.triggers.includes(PLACEMENT_TRIGGER.LEADERSHIP_START),
    'the replay was proposed by the restarted owner\'s leadership-start pass, after its ' +
    `reconciliation; ${report}`);
  const [operation] = admittedOperations(world, n1, TARGET);
  assert.equal(operation.entryId, lost.entryId, `admitted under the retained identity; ${report}`);
}));

const THREE_CLASSES = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: 'sql_transactions-p1', leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
  {partitionId: 'tables-p1', leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
  {partitionId: 'orders-p1', leaderNodeId: 'n1', replicaNodeIds: ['n1', 'n2']},
]});

// Complete an admitted copy as its executor would: the terminal workflow
// transition committed on the ledger, and the new replica's SERVICES row
// published.
function completeCopy(world, leader, operation, partitionId) {
  world.log.appendCommitted({type: PARTITION_SERVICE_OPERATION.QUERY,
    entryId: `fixture-complete:${operation.operationId}`,
    sql: 'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ? ' +
      'WHERE operation_id = ?',
    params: [WORKFLOW_STEP.COMPLETED, WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.COMPLETED] ??
      ReplicaStatus.ACTIVE, Date.now(), operation.operationId],
    timestamp: leader.ledger.hlcClock.now().toString(), proposedBy: 'fixture-executor',
    proposedAt: 0});
  world.publishRow('services', {service_id: `${partitionId}-n3`, replica_id: `${partitionId}-n3`,
    partition_id: partitionId, node_id: 'n3', service_type: 'partition', status: 'active',
    raft_role: 'follower', address: `n3/partition/${partitionId}-n3`,
    created_at: Date.now(), updated_at: Date.now()});
}

test('P11 useful progress after the disruption clears: three deficits of different classes ' +
  'wait behind an unavailable node authority; when it clears they are admitted in class order ' +
  'under capacity, and the completion of one copy admits the next', (t) =>
  withPlacementWorld(THREE_CLASSES, async (world) => {
    world.authorityUnavailable = true;
    const nodes = await startThreeNodeLedger(world);
    const [n1] = nodes;
    await world.electLedger(n1);
    await world.idle();
    const proposalsWhileUnavailable = world.log.proposals.length;
    const snapshotWhileUnavailable = ownerOf(n1).lastPassSnapshot;
    world.authorityUnavailable = false;
    world.publishNodeRows();
    let cleared = true;
    try {
      await waitUntil(() => world.ledgerRows(n1).length >= 2,
        'admissions after the authority cleared', PROGRESS_BOUND_MS);
    } catch {
      cleared = false;
    }
    await world.idle();
    const firstWave = world.ledgerRows(n1).map((row) => row.partition_id);
    const reportAfterClear = reportOf(t, world, 'orders-p1');
    assert.equal(proposalsWhileUnavailable, 0, 'nothing proposed while the authority is unavailable');
    t.diagnostic(`snapshot while unavailable: ${JSON.stringify(snapshotWhileUnavailable)}`);
    assert.ok(cleared, 'the node-authority wait resumed on the source change (first wave ' +
      `${JSON.stringify(firstWave)}); ${reportAfterClear}`);
    assert.deepEqual(firstWave, ['sql_transactions-p1', 'tables-p1'],
      'class order under the per-target copy capacity (K_TGT = 2 copies into n3); ' +
      `${reportAfterClear}`);
    const [priority] = admittedOperations(world, n1, 'sql_transactions-p1');
    completeCopy(world, n1, priority, 'sql_transactions-p1');
    await waitUntil(() => admittedOperations(world, n1, 'orders-p1').length === 1,
      'the completion (terminal commit, new replica row) admits the user partition',
      PROGRESS_BOUND_MS);
    await world.idle();
    const report = reportOf(t, world, 'orders-p1');
    for (const partitionId of ['sql_transactions-p1', 'tables-p1', 'orders-p1']) {
      assert.equal(admittedOperations(world, n1, partitionId).length, 1,
        `${partitionId}: one admitted operation; ${report}`);
    }
    assert.equal(world.log.proposals.length, 3, `one proposal per deficit; ${report}`);
    for (const node of nodes.slice(1)) {
      assert.equal(node.probe.passes.length, 0, `${node.nodeId} did no placement work; ${report}`);
    }
  }));
