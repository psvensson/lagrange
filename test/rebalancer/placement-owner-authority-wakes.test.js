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
  const failedPass = n1.probe.passes.find((pass) => pass.threw);
  // The next wake of ANY kind, well before the resync: a SERVICES change.
  const ledgerRow = n1.cache.getAll('services').find((row) => row.partition_id === LEDGER);
  world.publishRow('services', {...ledgerRow});
  const boundMs = PROGRESS_BOUND_MS;
  const recovered = await admittedWithin(world, n1, boundMs);
  await world.idle();
  const report = reportOf(t, world);
  assert.ok(running, `the publication started a pass; ${report}`);
  assert.equal(failures, 1, `the pass met the failing read; ${report}`);
  t.diagnostic(`pass rejection propagated out of the owner's drain: ${rejection?.message ?? null}`);
  assert.ok(recovered, `admitted within ${boundMs} ms after a pass threw (pending triggers ` +
    `after the throw: ${owner.pendingTriggers.size}, rejection: ` +
    `${rejection?.message ?? 'none'}); ${report}`);
  // Retention observable: the pass after the throw plans the failed pass's
  // triggers as well as its own wake's, and the resync caused nothing.
  const admittingPass = n1.probe.passes.find((pass) =>
    n1.probe.admissionAttempts.some((attempt) => attempt.pass === pass));
  assert.ok(failedPass, `a pass threw; ${report}`);
  assert.ok(failedPass.triggers.every((trigger) => admittingPass?.triggers.includes(trigger)) &&
    admittingPass.triggers.includes(PLACEMENT_TRIGGER.SERVICES_CHANGED),
  `the next wake's pass carries the retained triggers ${JSON.stringify(failedPass.triggers)} ` +
    `(it ran with ${JSON.stringify(admittingPass?.triggers ?? null)}); ${report}`);
  assert.equal(owner.placementResyncAdmissions, 0, `the resync admitted nothing; ${report}`);
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

// Stage 2 with stage 1: every wake goes through the custody and tenure checks.
// The sealed contract (quest replica-placement-admission-owner, constraint
// no-timer-no-bound-no-retry): "The placement owner arms exactly one timer,
// the resync (PLACEMENT_RESYNC_INTERVAL_MS, declared once)". Armed by the
// production factory per custody, it is cleared when the custody ends; a fire
// that still arrives afterwards (a callback already dequeued) starts nothing.
const LEDGER_ONLY = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
]});

test('resync and custody: the leading owner arms exactly one resync at the declared cadence; ' +
  'it is cleared when the custody ends, and a late resync fire starts no pass',
(t) => withPlacementWorld(LEDGER_ONLY, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [a, b] = nodes;
  await world.electLedger(a);
  await world.idle();
  const armed = world.timers.placementOwnerIntervals().filter((timer) => timer.alive);
  const report = () => JSON.stringify({intervals: world.timers.placementOwnerIntervals()
    .map(({ms, alive}) => ({ms, alive})), passes: a.probe.passes.map((pass) =>
    `${pass.triggers.join('+')}@${pass.startTenure?.term ?? 'none'}`)});
  assert.equal(armed.length, 1, `the leading owner armed exactly one timer; ${report()}`);
  assert.equal(armed[0].ms, ownerOf(a).resyncIntervalMs,
    `at the declared resync cadence; ${report()}`);
  await world.electLedger(b);
  await world.idle();
  const afterTransfer = world.timers.placementOwnerIntervals();
  assert.equal(afterTransfer.find((timer) => timer.fn === armed[0].fn)?.alive, false,
    `the ended custody's resync is cleared; ${report()}`);
  assert.equal(afterTransfer.filter((timer) => timer.alive).length, 1,
    `only the new leader's resync is armed; ${report()}`);
  const passesBefore = a.probe.passes.length;
  armed[0].fn();
  await world.idle();
  t.diagnostic(report());
  assert.equal(a.probe.passes.length, passesBefore,
    `a resync fired after the custody ended starts no pass; ${report()}`);
}));

// A deterministic failure attributable to ONE candidate (its admissibility
// read throws) must not starve the other partitions: the pass records the
// failure for that candidate, admits the others, and the failed candidate's
// obligation stays retained and visible; no spin.
const SECOND = 'tbl-second-p1';
const TWO_DEFICITS = Object.freeze({nodes: THREE_NODES, partitions: [
  {partitionId: LEDGER, replicaNodeIds: ['n1', 'n2', 'n3']},
  {partitionId: TARGET, leaderNodeId: 'n2', replicaNodeIds: ['n2', 'n3']},
  {partitionId: SECOND, leaderNodeId: 'n2', replicaNodeIds: ['n2', 'n3']},
]});

test('poisoned candidate: a failure attributable to one partition\'s candidate is recorded ' +
  'for it; the other partition\'s deficit in the same pass is admitted; no spin',
(t) => withPlacementWorld(TWO_DEFICITS, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  const admissible = owner.isCandidateAdmissibleNow;
  let poisoned = 0;
  owner.isCandidateAdmissibleNow = function poisonedFor(candidate, ...rest) {
    if (candidate.partitionId === TARGET) {
      poisoned += 1;
      throw new Error('fixture: poisoned candidate');
    }
    return admissible.call(this, candidate, ...rest);
  };
  await world.electLedger(n1);
  await world.idle();
  let secondAdmitted = true;
  try {
    await waitUntil(() => admittedOperations(world, n1, SECOND).length === 1,
      'the other partition is admitted', PROGRESS_BOUND_MS);
  } catch {
    secondAdmitted = false;
  }
  await world.idle();
  const passesAfterIdle = n1.probe.passes.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const report = JSON.stringify({passes: n1.probe.passes.length, poisoned,
    snapshot: owner.lastPassSnapshot});
  t.diagnostic(report);
  assert.ok(secondAdmitted, `the other deficit was admitted beside the poisoned one; ${report}`);
  assert.equal(admittedOperations(world, n1, TARGET).length, 0, report);
  assert.ok(JSON.stringify(owner.lastPassSnapshot).includes(TARGET) &&
    JSON.stringify(owner.lastPassSnapshot).includes('fixture: poisoned candidate'),
  `the snapshot names the poisoned candidate and its failure; ${report}`);
  assert.ok(poisoned <= n1.probe.passes.length,
    `at most one failure per pass (failures ${poisoned}); ${report}`);
  assert.ok(n1.probe.passes.length - passesAfterIdle <= 5, `no spin; ${report}`);
}));

// Corrective round 2, item 1 (lead ruling): a failed candidate is re-attempted
// because planning re-derives it from the census on the next wake (at the
// latest on the resync), never through retained pass triggers. Over several
// wakes a permanently failing candidate retains no trigger, is re-attempted
// exactly once per pass, and a pass woken by the resync alone is resync-only:
// the admission it makes is counted by placementResyncAdmissions (the sealed
// contract's missed-wake signal).
test('poisoned candidate over several wakes and a resync: a candidate failure retains no ' +
  'trigger; it is re-attempted once per wake; a pure resync pass is resync-only',
(t) => withPlacementWorld(TWO_DEFICITS, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  const admissible = owner.isCandidateAdmissibleNow;
  const failures = {[TARGET]: 0, [SECOND]: 0};
  let secondBlocked = true;
  owner.isCandidateAdmissibleNow = function poisonedFor(candidate, ...rest) {
    if (candidate.partitionId === TARGET ||
        (candidate.partitionId === SECOND && secondBlocked)) {
      failures[candidate.partitionId] += 1;
      throw new Error(`fixture: poisoned candidate ${candidate.partitionId}`);
    }
    return admissible.call(this, candidate, ...rest);
  };
  await world.electLedger(n1);
  await world.idle();
  const custody = owner.custody;
  const report = () => JSON.stringify({failures, retained: [...custody.retainedTriggers],
    passes: n1.probe.passes.map((pass) => pass.triggers.join('+')),
    resyncAdmissions: owner.placementResyncAdmissions, snapshot: owner.lastPassSnapshot});
  assert.ok(failures[TARGET] >= 1, `premise: the first pass failed the candidate; ${report()}`);
  assert.equal(custody.retainedTriggers.size, 0,
    `a candidate failure retains no trigger (first pass); ${report()}`);
  for (let wake = 0; wake < 3; wake += 1) {
    const passesBefore = n1.probe.passes.length;
    const failedBefore = failures[TARGET];
    owner.notify(PLACEMENT_TRIGGER.SERVICES_CHANGED);
    await world.idle();
    const passes = n1.probe.passes.length - passesBefore;
    assert.ok(passes >= 1, `the wake ran a pass; ${report()}`);
    assert.equal(failures[TARGET] - failedBefore, passes,
      `the failing candidate is re-attempted exactly once per pass; ${report()}`);
    assert.equal(custody.retainedTriggers.size, 0,
      `the pending-trigger set does not grow (wake ${wake + 1}); ${report()}`);
  }
  assert.equal(owner.placementResyncAdmissions, 0, `premise: nothing admitted yet; ${report()}`);
  secondBlocked = false;
  const resync = world.timers.placementOwnerIntervals().filter((timer) => timer.alive);
  assert.equal(resync.length, 1, `premise: the custody's resync is armed; ${report()}`);
  const passesBeforeResync = n1.probe.passes.length;
  resync[0].fn();
  await waitUntil(() => admittedOperations(world, n1, SECOND).length === 1,
    'the resync pass admits the unblocked deficit', PROGRESS_BOUND_MS);
  await world.idle();
  t.diagnostic(report());
  const resyncPass = n1.probe.passes[passesBeforeResync];
  assert.deepEqual(resyncPass?.triggers, [PLACEMENT_TRIGGER.RESYNC],
    `the pass woken by the resync carries the resync alone; ${report()}`);
  assert.equal(owner.placementResyncAdmissions, 1,
    `the resync-only pass's admission is counted as a resync admission; ${report()}`);
  assert.equal(admittedOperations(world, n1, TARGET).length, 0, report());
}));
