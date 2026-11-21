// P1/P3/P14 and the start path (placement-owner proof transfer, priority
// groups 3 and 6): recovery of a temporarily ownerless priority partition as
// explicit pending work with an owned wake.
//
// Requirement (owner, binding): recovery of a temporarily ownerless priority
// partition; missing evidence is explicit pending work with an owned wake; the
// placement owner's start path does not await its own publication/CDC drive
// (lead ruling 4); a missed wake has the declared 60 s resync as its backstop
// (sealed quest replica-placement-admission-owner, lead ruling 1).
//
// Producer, publication boundary, consumer (the owner's lesson): the target
// partition's leader is a real PartitionService whose port's role event drives
// applyReplicaLeadership -> queueRoleUpdate (collapses leader to follower) and
// queueLeaderNodeUpdate -> AuthoritativeRowMutationHelper; the fixture's
// publication boundary applies the committed PARTITIONS row (leader_node_id)
// into every node's SystemTableCache through applySystemTableChange; the
// consumer is the placement owner on the ledger leader of the production
// construction. No SERVICES row ever carries raft_role 'leader'.
//
// Fixture: placement-owner-authority-fixture.js (evidence ceiling stated there).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PLACEMENT_CLEARING_TRIGGER, PLACEMENT_TRIGGER, PLACEMENT_WAITING_REASON,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  LEDGER, THREE_NODES, admittedOperations, holdLeadershipStartDrives, ownerOf,
  startThreeNodeLedger, transferReport, waitUntil, withPlacementWorld,
} from './placement-owner-authority-fixture.js';
import {
  clearFixtureSingletons, resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// A priority partition with two voters (n2, n3), replication factor three and
// no published owner: its copy move needs the leader as copy source.
const TARGET = 'sql_transactions-p1';
const OWNERLESS = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: null, replicaNodeIds: ['n2', 'n3']},
]});
// The same partition with its leader published (n2): a candidate at once.
const PUBLISHED = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: 'n2', replicaNodeIds: ['n2', 'n3']},
]});
const PROGRESS_BOUND_MS = 3_000;

function reportOf(t, world) {
  const report = transferReport(world, TARGET);
  t.diagnostic(JSON.stringify(report));
  return JSON.stringify(report);
}

// The ledger on every node, n1 its leader, and the target's two replicas as
// real partition services on n2 and n3 that have not elected a leader.
async function ownerlessWorld(world) {
  const nodes = await startThreeNodeLedger(world);
  const [, n2, n3] = nodes;
  const replicaIds = [`${TARGET}-n2`, `${TARGET}-n3`];
  const targets = [await world.startTargetReplica(n2, TARGET, replicaIds),
    await world.startTargetReplica(n3, TARGET, replicaIds)];
  await world.electLedger(nodes[0]);
  await world.idle();
  return {nodes, targets};
}

function targetProposals(world) {
  return world.log.proposals.filter((proposal) => proposal.partitionId === TARGET);
}

// The bound on recovery after a lost wake: the declared resync cadence when
// the owner has armed it; without an armed cadence nothing can recover the
// wake in a quiet cluster, so the witness does not wait longer than the
// ordinary progress bound.
function recoveryBoundOf(owner) {
  return owner.resyncHandle !== null ? owner.resyncIntervalMs + PROGRESS_BOUND_MS :
    PROGRESS_BOUND_MS;
}

async function admittedWithin(world, node, boundMs) {
  try {
    await waitUntil(() => admittedOperations(world, node, TARGET).length === 1,
      'the deficit is admitted', boundMs);
    return true;
  } catch {
    return false;
  }
}

test('P1/P14 ownerless priority partition: zero proposals while no leader is published; the ' +
  'real producer\'s PARTITIONS leader_node_id publication resumes it, copy source = the ' +
  'node whose core leads', (t) => withPlacementWorld(OWNERLESS, async (world) => {
  const {nodes, targets} = await ownerlessWorld(world);
  const [n1] = nodes;
  const constructionsWhileOwnerless = n1.probe.constructions.length;
  const proposalsWhileOwnerless = targetProposals(world).length;
  world.electTarget(targets[0], targets);
  const resumed = await admittedWithin(world, n1, PROGRESS_BOUND_MS);
  await world.idle();
  const report = reportOf(t, world);
  assert.ok(constructionsWhileOwnerless >= 1, `the ledger leader evaluated the target; ${report}`);
  assert.equal(proposalsWhileOwnerless, 0, `no proposal without a copy source; ${report}`);
  for (const node of nodes) {
    const roles = node.cache.getAll('services').filter((row) => row.partition_id === TARGET)
      .map((row) => row.raft_role);
    assert.ok(roles.every((role) => role !== RAFT_ROLE.LEADER),
      `${node.nodeId}: the producer publishes follower roles only (${roles}); ${report}`);
  }
  assert.equal(n1.cache.get('partitions', TARGET)?.leader_node_id, 'n2',
    `the leader reached the ledger leader's cache as PARTITIONS leader_node_id; ${report}`);
  assert.ok(resumed, `the wait resumed on the publication alone; ${report}`);
  const [operation] = admittedOperations(world, n1, TARGET);
  assert.equal(operation.sourceNodeId, 'n2', `copy source is the target's leader; ${report}`);
  assert.equal(operation.targetNodeId, 'n1', report);
  const resumingPass = n1.probe.passes.find((pass) =>
    n1.probe.admissionAttempts.some((attempt) => attempt.pass === pass));
  assert.ok(resumingPass?.triggers.includes(PLACEMENT_TRIGGER.PARTITIONS_CHANGED),
    `the resuming pass was woken by PARTITIONS_CHANGED; ${report}`);
  for (const node of nodes.slice(1)) {
    assert.equal(node.probe.passes.length + node.probe.admissionAttempts.length, 0,
      `${node.nodeId} (a target replica's node, not the ledger leader) did no placement ` +
      `work; ${report}`);
  }
}));

test('P1 the LEADER_UNKNOWN wait is explicit pending work: the owner reports it with the ' +
  'target named, and its declared clearing trigger is the event that ends it',
(t) => withPlacementWorld(OWNERLESS, async (world) => {
  const {nodes, targets} = await ownerlessWorld(world);
  const [n1] = nodes;
  const snapshotWhileWaiting = ownerOf(n1).lastPassSnapshot;
  world.electTarget(targets[0], targets);
  await admittedWithin(world, n1, PROGRESS_BOUND_MS);
  await world.idle();
  const report = reportOf(t, world);
  const endingTriggers = n1.probe.passes.find((pass) =>
    n1.probe.admissionAttempts.some((attempt) => attempt.pass === pass))?.triggers ?? [];
  const reported = JSON.stringify(snapshotWhileWaiting ?? null);
  assert.ok(reported.includes(TARGET) &&
    reported.includes(PLACEMENT_WAITING_REASON.LEADER_UNKNOWN),
  'the owner\'s pass observation names the waiting target and its reason (observed ' +
    `lastPassSnapshot ${reported}); ${report}`);
  assert.ok(endingTriggers.includes(
    PLACEMENT_CLEARING_TRIGGER[PLACEMENT_WAITING_REASON.LEADER_UNKNOWN]),
  `declared clearing trigger ${PLACEMENT_CLEARING_TRIGGER[
    PLACEMENT_WAITING_REASON.LEADER_UNKNOWN]} vs the triggers of the pass that ended the ` +
    `wait ${JSON.stringify(endingTriggers)}; ${report}`);
}));

test('P3(ii) missed wake: the one clearing notification is dropped, the cache content is ' +
  'current; the deficit is admitted within the declared resync cadence',
(t) => withPlacementWorld(OWNERLESS, async (world) => {
  const {nodes, targets} = await ownerlessWorld(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  // The injected fault: exactly one PARTITIONS_CHANGED notification is lost.
  const notify = owner.notify;
  const dropped = [];
  owner.notify = function droppingNotify(trigger) {
    if (trigger === PLACEMENT_TRIGGER.PARTITIONS_CHANGED && dropped.length === 0) {
      dropped.push(trigger);
      return undefined;
    }
    return notify.call(this, trigger);
  };
  world.electTarget(targets[0], targets);
  await waitUntil(() => dropped.length === 1, 'the clearing notification was dropped');
  const boundMs = recoveryBoundOf(owner);
  const recovered = await admittedWithin(world, n1, boundMs);
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(n1.cache.get('partitions', TARGET)?.leader_node_id, 'n2',
    `the cache content is current; ${report}`);
  assert.ok(recovered, `admitted within ${boundMs} ms after a dropped wake (resync armed: ` +
    `${owner.resyncHandle !== null}, interval ${owner.resyncIntervalMs} ms); ${report}`);
}));

test('P3(i) a pass that throws: the only clearing event starts a pass that throws once; its ' +
  'triggers must not be lost', (t) => withPlacementWorld(OWNERLESS, async (world) => {
  const {nodes, targets} = await ownerlessWorld(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  world.publicationHeld = true;
  world.electTarget(targets[0], targets);
  await waitUntil(() => world.heldPublications.some((record) =>
    record.tableName === 'partitions' && record.row?.leader_node_id === 'n2'),
  'the target leader\'s publication is committed and its delivery held');
  // A collaborator of the pass fails once (a capacity read: the storage
  // accounting projection the owner reads for every eligible node).
  const storage = n1.coordinator.storageAccountingService;
  const read = storage.getCapacitySemanticIdentity;
  let failures = 0;
  storage.getCapacitySemanticIdentity = function failingOnce(...args) {
    if (failures === 0) {
      failures += 1;
      throw new Error('fixture: capacity read failed once');
    }
    return read.apply(this, args);
  };
  world.releasePublications();
  const running = owner.runningPromise;
  const rejection = await (running ?? Promise.resolve()).then(() => null, (error) => error);
  const boundMs = recoveryBoundOf(owner);
  const recovered = await admittedWithin(world, n1, boundMs);
  await world.idle();
  const report = reportOf(t, world);
  assert.ok(running, `the publication started a pass; ${report}`);
  assert.equal(failures, 1, `the pass met the failing read; ${report}`);
  t.diagnostic(`pass rejection propagated out of the owner's drain: ${rejection?.message ?? null}`);
  assert.ok(recovered, `admitted within ${boundMs} ms after a pass threw (pending triggers ` +
    `after the throw: ${owner.pendingTriggers.size}, rejection: ` +
    `${rejection?.message ?? 'none'}); ${report}`);
}));

test('P8 start path: with the ledger\'s CDC drive stalled (a subscriber that never answers), ' +
  'the placement owner still starts from live ledger leadership and admits',
(t) => withPlacementWorld(PUBLISHED, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const drives = holdLeadershipStartDrives(n1);
  let admitted = false;
  try {
    await world.electLedger(n1);
    admitted = await admittedWithin(world, n1, PROGRESS_BOUND_MS);
  } finally {
    drives.releaseAll();
  }
  await world.idle();
  const report = reportOf(t, world);
  assert.equal(ownerOf(n1).isLeader, true, `the owner leads; ${report}`);
  assert.ok(drives.calls >= 1, `the start pass reached the CDC drive; ${report}`);
  assert.ok(admitted, `admitted within ${PROGRESS_BOUND_MS} ms while the leadership-start CDC ` +
    `drive stayed unanswered; ${report}`);
}));
