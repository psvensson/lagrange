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

// Corrective round 2, item 2 (verifier N2): a candidate's failure is
// classified by what is KNOWN about its proposal, never by where the
// exception surfaced. Every pass's snapshot is kept (the last one is replaced
// by the next wake's pass).
function keepPassSnapshots(owner) {
  const snapshots = [];
  const runPass = owner.runPass;
  owner.runPass = async function keptSnapshot(...args) {
    try {
      return await runPass.apply(this, args);
    } finally {
      snapshots.push(this.lastPassSnapshot);
    }
  };
  return snapshots;
}

function unresolvedAttemptRow(node, attemptKey) {
  return node.ledger.db.prepare('SELECT entry_id FROM _placement_owner_unresolved_attempts ' +
    'WHERE attempt_key = ?').get(attemptKey) ?? null;
}

// (b) The admission COMMITTED (ADMITTED); the owner's later local step, the
// durable delete of the settled attempt record, throws. The admission stands:
// the pass records the operation as admitted and the local failure apart
// (not as a failed candidate) and aborts, its census no longer holds: no
// further proposal in that pass. The next wake re-reads the census and admits
// the other deficit; the first is admitted once.
test('item 2 (b): admitted, then a local step throws: the admission is recorded as admitted, ' +
  'the local failure apart, and the pass aborts with no further proposal',
(t) => withPlacementWorld(TWO_DEFICITS, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  const snapshots = keepPassSnapshots(owner);
  const db = n1.ledger.db;
  const prepare = db.prepare;
  let faultedKey = null;
  // Substituted fault: the first durable delete of an attempt record fails.
  db.prepare = function faultedDelete(sql, ...rest) {
    const statement = prepare.call(this, sql, ...rest);
    if (faultedKey !== null ||
        !sql.startsWith('DELETE FROM _placement_owner_unresolved_attempts')) {
      return statement;
    }
    return {run(attemptKey) {
      faultedKey = attemptKey;
      throw new Error('fixture: the attempt-record delete failed');
    }};
  };
  await world.electLedger(n1);
  await world.idle();
  db.prepare = prepare;
  const faulted = faultedKey?.slice('admit:'.length) ?? null;
  const other = faulted === TARGET ? SECOND : TARGET;
  const aborted = snapshots.find((snapshot) => snapshot.stoppedAt === 'ABORTED') ?? null;
  const faultingPass = n1.probe.passes.find((pass) => n1.probe.admissionAttempts.some(
    (attempt) => attempt.pass === pass && attempt.partitionId === faulted)) ?? null;
  const report = () => JSON.stringify({faultedKey, aborted, snapshots: snapshots.length,
    attempts: n1.probe.admissionAttempts.map((attempt) => ({partitionId: attempt.partitionId,
      pass: attempt.pass?.sequence ?? null})),
    rows: world.ledgerRows(n1).map((row) => `${row.partition_id}:${row.operation_id}`)});
  t.diagnostic(report());
  assert.ok(faulted === TARGET || faulted === SECOND,
    `premise: an admitted candidate's attempt-record delete failed; ${report()}`);
  const [admitted] = admittedOperations(world, n1, faulted);
  assert.ok(admitted, `premise: the faulted candidate's admission committed; ${report()}`);
  assert.ok(aborted, `the pass whose admitted candidate failed locally aborted; ${report()}`);
  assert.deepEqual(aborted.admitted, [admitted.operationId],
    `the aborted pass records the admission as admitted; ${report()}`);
  assert.equal(aborted.failedCandidates[faulted], undefined,
    `an admitted candidate is not recorded as a failed candidate; ${report()}`);
  assert.match(JSON.stringify(aborted.localFailures?.[faulted] ?? null),
    /the attempt-record delete failed/, `the local failure is recorded apart; ${report()}`);
  assert.equal(n1.probe.admissionAttempts.filter((attempt) => attempt.pass === faultingPass)
    .length, 1, `no further proposal in the aborted pass; ${report()}`);
  owner.notify(PLACEMENT_TRIGGER.SERVICES_CHANGED);
  await waitUntil(() => admittedOperations(world, n1, other).length === 1,
    'the next wake admits the other deficit', PROGRESS_BOUND_MS);
  await world.idle();
  assert.equal(admittedOperations(world, n1, faulted).length, 1,
    `the faulted deficit is admitted once; ${report()}`);
  assert.equal(admittedOperations(world, n1, other).length, 1, report());
}));

// (c) The proposal was handed over (the port accepted it) and its answer was
// lost to the owner (the submitter threw): nothing is known of it. The attempt
// stays retained, in memory and durably, for the existing uncertain-attempt
// reconciliation, and the pass aborts with no further proposal. The handed-
// over entry commits; the next custody's leadership-start reconciliation
// settles the attempt from its committed outcome; nothing is admitted twice.
test('item 2 (c): handed over with no answer: the attempt stays retained and is reconciled, ' +
  'the pass aborts with no further proposal', (t) => withPlacementWorld(TWO_DEFICITS,
  async (world) => {
    const nodes = await startThreeNodeLedger(world);
    const [n1] = nodes;
    const owner = ownerOf(n1);
    const snapshots = keepPassSnapshots(owner);
    const admit = owner.admitPlacement;
    let lost = null;
    // Substituted fault: the first admission is handed over and accepted by
    // the port; its answer never reaches the owner (the submitter throws).
    owner.admitPlacement = async function lostAnswer(payload) {
      if (lost !== null) return admit(payload);
      lost = {partitionId: payload.body.partitionId, entryId: payload.entryId};
      admit(payload).catch(() => {});
      await waitUntil(() => world.log.proposals.some((proposal) =>
        proposal.entryId === payload.entryId), 'the port accepted the proposal');
      throw new Error('fixture: the admission answer was lost');
    };
    await world.electLedger(n1);
    await world.idle();
    const attemptKey = `admit:${lost?.partitionId}`;
    const retainedInMemory = owner.uncertainEntryIds.get(attemptKey)?.entryId ?? null;
    const retainedDurably = unresolvedAttemptRow(n1, attemptKey)?.entry_id ?? null;
    const other = lost?.partitionId === TARGET ? SECOND : TARGET;
    const aborted = snapshots.find((snapshot) => snapshot.stoppedAt === 'ABORTED') ?? null;
    const losingPass = n1.probe.passes.find((pass) => n1.probe.admissionAttempts.some(
      (attempt) => attempt.pass === pass && attempt.entryId === lost?.entryId)) ?? null;
    const report = () => JSON.stringify({lost, retainedInMemory, retainedDurably, aborted,
      attempts: n1.probe.admissionAttempts.map((attempt) => ({partitionId: attempt.partitionId,
        entryId: attempt.entryId, pass: attempt.pass?.sequence ?? null})),
      rows: world.ledgerRows(n1).map((row) => `${row.partition_id}:${row.operation_id}`)});
    t.diagnostic(report());
    assert.ok(lost, `premise: an admission was handed over and its answer lost; ${report()}`);
    assert.ok(aborted, `the pass that lost the answer aborted; ${report()}`);
    assert.equal(n1.probe.admissionAttempts.filter((attempt) => attempt.pass === losingPass)
      .length, 1, `no further proposal in the aborted pass; ${report()}`);
    assert.equal(aborted.failedCandidates[lost.partitionId], undefined,
      `an uncertain proposal is not recorded as a failed candidate; ${report()}`);
    assert.equal(retainedInMemory, lost.entryId, `the attempt stays retained; ${report()}`);
    assert.equal(retainedDurably, lost.entryId, `the attempt stays durable; ${report()}`);
    await waitUntil(() => admittedOperations(world, n1, lost.partitionId).length === 1,
      'the handed-over entry commits', PROGRESS_BOUND_MS);
    // The next custody (the leadership sink re-driven): its leadership-start
    // reconciliation settles the attempt from the entry's committed outcome.
    owner.setLeader(false);
    owner.setLeader(true);
    await waitUntil(() => admittedOperations(world, n1, other).length === 1,
      'the next custody admits the other deficit', PROGRESS_BOUND_MS);
    await world.idle();
    assert.equal(owner.uncertainEntryIds.has(attemptKey), false,
      `the reconciliation settled the attempt in memory; ${report()}`);
    assert.equal(unresolvedAttemptRow(n1, attemptKey), null,
      `the reconciliation settled the durable attempt; ${report()}`);
    assert.equal(admittedOperations(world, n1, lost.partitionId).length, 1,
      `the lost-answer deficit is admitted once; ${report()}`);
    assert.equal(admittedOperations(world, n1, other).length, 1, report());
  }));

// Verifier F9: a pass woken by the resync alone admits a deficit and its later
// local step (the durable delete of the settled attempt record) throws, so the
// pass aborts with the admission recorded. The admission was caused by the
// resync: placementResyncAdmissions (the sealed acceptance signal) counts it.
// The other deficit stays inadmissible throughout, so no later pass admits.
test('F9: a resync-only pass whose admission is followed by a local failure counts that ' +
  'admission as a resync admission', (t) => withPlacementWorld(TWO_DEFICITS, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  const snapshots = keepPassSnapshots(owner);
  const admissible = owner.isCandidateAdmissibleNow;
  let targetBlocked = true;
  owner.isCandidateAdmissibleNow = function blockedUntilResync(candidate, ...rest) {
    if (candidate.partitionId === SECOND || targetBlocked) {
      throw new Error(`fixture: candidate ${candidate.partitionId} not admissible yet`);
    }
    return admissible.call(this, candidate, ...rest);
  };
  await world.electLedger(n1);
  await world.idle();
  const report = () => JSON.stringify({resyncAdmissions: owner.placementResyncAdmissions,
    passes: n1.probe.passes.map((pass) => pass.triggers.join('+')),
    snapshots: snapshots.map((snapshot) => ({stoppedAt: snapshot.stoppedAt,
      admitted: snapshot.admitted})),
    rows: world.ledgerRows(n1).map((row) => `${row.partition_id}:${row.operation_id}`)});
  assert.equal(admittedOperations(world, n1, TARGET).length, 0,
    `premise: nothing admitted before the resync; ${report()}`);
  assert.equal(owner.placementResyncAdmissions, 0, `premise: no resync admission yet; ${report()}`);
  // Substituted fault, armed for the resync pass only: the first durable
  // delete of an attempt record fails (the item 2 (b) fault).
  const db = n1.ledger.db;
  const prepare = db.prepare;
  let faultedKey = null;
  db.prepare = function faultedDelete(sql, ...rest) {
    const statement = prepare.call(this, sql, ...rest);
    if (faultedKey !== null ||
        !sql.startsWith('DELETE FROM _placement_owner_unresolved_attempts')) {
      return statement;
    }
    return {run(attemptKey) {
      faultedKey = attemptKey;
      throw new Error('fixture: the attempt-record delete failed');
    }};
  };
  targetBlocked = false;
  const resync = world.timers.placementOwnerIntervals().filter((timer) => timer.alive);
  assert.equal(resync.length, 1, `premise: the custody's resync is armed; ${report()}`);
  const passesBeforeResync = n1.probe.passes.length;
  resync[0].fn();
  await waitUntil(() => admittedOperations(world, n1, TARGET).length === 1,
    'the resync pass admits the unblocked deficit', PROGRESS_BOUND_MS);
  await world.idle();
  db.prepare = prepare;
  t.diagnostic(report());
  const resyncPass = n1.probe.passes[passesBeforeResync];
  assert.deepEqual(resyncPass?.triggers, [PLACEMENT_TRIGGER.RESYNC],
    `premise: the pass woken by the resync carries the resync alone; ${report()}`);
  assert.equal(faultedKey?.slice('admit:'.length) ?? null, TARGET,
    `premise: the resync pass's admitted candidate failed locally; ${report()}`);
  const [admitted] = admittedOperations(world, n1, TARGET);
  assert.ok(snapshots.some((snapshot) => snapshot.stoppedAt === 'ABORTED' &&
    snapshot.admitted.includes(admitted.operationId)),
  `premise: the resync pass aborted with the admission recorded; ${report()}`);
  assert.equal(owner.placementResyncAdmissions, 1,
    `the resync-only pass's admission is counted although its local step failed; ${report()}`);
}));

// Verifier F10 (characterization, ruling pending: no source change): since
// item 2 every throw of the submitter after the handover aborts the pass as
// UNCERTAIN, and the same candidate is first again on the next wake. A
// submission that throws deterministically for the first-ordered candidate is
// therefore head of line for the tenure: every later pass aborts at the same
// attempt and the other deficit is not admitted. This pins what the owner does
// today; a ruling that isolates the submission turns its last two assertions.
test('F10 characterization: a submission that throws deterministically for the first ' +
  'candidate aborts every later pass at the same attempt; the other deficit waits',
(t) => withPlacementWorld(TWO_DEFICITS, async (world) => {
  const nodes = await startThreeNodeLedger(world);
  const [n1] = nodes;
  const owner = ownerOf(n1);
  const snapshots = keepPassSnapshots(owner);
  const admit = owner.admitPlacement;
  const thrown = [];
  owner.admitPlacement = async function throwsFor(payload) {
    if (payload.body.partitionId !== TARGET) return admit(payload);
    thrown.push(payload.entryId);
    throw new Error('fixture: the submission throws');
  };
  await world.electLedger(n1);
  await world.idle();
  for (let wake = 0; wake < 3; wake += 1) {
    owner.notify(PLACEMENT_TRIGGER.SERVICES_CHANGED);
    await world.idle();
  }
  const ran = snapshots.filter((snapshot) => snapshot.uncertainCandidates?.[TARGET] !== undefined);
  const report = () => JSON.stringify({thrown, passes: snapshots.map((snapshot) => ({
    stoppedAt: snapshot.stoppedAt, uncertain: Object.keys(snapshot.uncertainCandidates ?? {}),
    admitted: snapshot.admitted})),
  rows: world.ledgerRows(n1).map((row) => `${row.partition_id}:${row.operation_id}`)});
  t.diagnostic(report());
  assert.ok(thrown.length >= 4, `premise: the submission was attempted on every wake; ${report()}`);
  assert.equal(new Set(thrown).size, 1,
    `the same retained attempt (one entryId) is re-submitted each time; ${report()}`);
  assert.ok(ran.length >= 4 && ran.every((snapshot) => snapshot.stoppedAt === 'ABORTED'),
    `every pass that reached the candidate aborted at it; ${report()}`);
  assert.equal(admittedOperations(world, n1, SECOND).length, 0,
    `the other deficit is not admitted while the head-of-line attempt throws; ${report()}`);
}));
