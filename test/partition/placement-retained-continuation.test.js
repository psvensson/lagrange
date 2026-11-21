// Contract witnesses of the retained placement repair owner, authority side:
// "A failed authority read leaves reconsideration owed. A durable outcome
// settles only the exact entry it proves."
// File-backed SQLite ledger, real committed apply and native repair ingress;
// consensus transport is a controllable port. Owner timers run on a virtual
// clock and every wait is bounded in event-loop turns.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {mintServiceRowCreatedAt} from '../../src/node/service-row-incarnation.js';
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PLACEMENT_TRIGGER} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission,
  settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {NODE} from './placement-admission-fixture.js';
import {stepRetainedLedgerRow, withRepairLedger} from './placement-retained-row-repair-fixture.js';
import {READ_FAULT, admitCompetitor, advanceContinuation, bounded, controlOwnerReads, idleRepairs,
  installVirtualClock, ledgerRow, remoteSender, repairCommands, repairMessages,
  retainMissingOperation} from './placement-retained-witness-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PARTITION_ID = 'retained-continuation-p1';
const OPERATION_ID = 'retained-continuation-remove';

function retainMissing(world) {
  return retainMissingOperation(world, {operationId: OPERATION_ID, partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-retained`});
}

function failEvery() {
  return READ_FAULT.THROW;
}

function identityOf(repository, operationId) {
  const attempt = repository.retainedPlacementRepairs.get(operationId);
  assert.ok(attempt, 'the obligation is retained');
  return {entryId: attempt.entryId, bodyText: JSON.stringify(attempt.body),
    operationText: JSON.stringify(attempt.operation)};
}

function assertRestoredOnce(world, retained, label) {
  const row = ledgerRow(world, retained.operationId);
  assert.ok(row, `${label}: the retained row is restored`);
  assert.equal(row.created_at, retained.createdAt, `${label}: the retained identity`);
}

// The sender delegated its exact pinned entry to the paused ledger leader.
async function delegateToPausedLeader(world) {
  const retained = await retainMissing(world);
  const remote = remoteSender(world);
  const sender = remote.repository;
  const clock = installVirtualClock(sender);
  raiseParticipantCutoverPause(world.leader);
  assert.equal(await bounded(sender.repairRetainedOperation(retained), 'delegating repair'), false);
  const identity = identityOf(sender, retained.operationId);
  assert.ok(identity.entryId, 'the sender pinned one exact entry');
  assert.equal(world.coordinator.repository.retainedPlacementRepairs.get(retained.operationId)
    ?.entryId, identity.entryId, 'the paused ledger leader holds the exact pinned request');
  assert.equal(world.commands.length, 0, 'a paused ledger proposes nothing');
  return {retained, remote, sender, clock, identity};
}

test('W5 a not-leader disclaim under an unchanged route tuple returns the obligation to the sender', () =>
  withRepairLedger(async (world) => {
    const {retained, remote, sender, clock, identity} = await delegateToPausedLeader(world);
    try {
      // The receiver's tenure ends. No publication reaches the sender: its
      // route tuple (node, replica, address) is unchanged.
      world.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      await settleTicks();
      assert.equal(world.leader.isLeader, false);
      assert.equal(await bounded(sender.ensureRetainedOperationRow(retained), 'later caller'), false);
      assert.equal(world.commands.length, 0, 'a receiver without tenure proposes nothing');
      assert.deepEqual(identityOf(sender, retained.operationId), identity,
        'the sender keeps its exact unresolved entry');
      for (const message of repairMessages(remote.messages)) {
        assert.equal(message.payload.entryId, identity.entryId, 'only the original entry is presented');
      }
      assert.ok(clock.pendingTimerCount() > 0,
        'a later caller finds no receiver tenure: custody is not trusted and the sender itself ' +
        'owns the owed reconsideration');
      // The same replica wins a later term and is released; nothing is
      // published and no caller, row or cache event reaches the sender.
      world.leader.controllablePort.term += 1;
      world.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
      await settleTicks();
      await resumeFixtureParticipantAdmission(world.leader);
      await idleRepairs(sender, world.coordinator.repository);
      await advanceContinuation(clock, [sender, world.coordinator.repository],
        () => sender.retainedPlacementRepairs.size === 0);
      assertRestoredOnce(world, retained, 'after the disclaim');
      assert.equal(repairCommands(world).length, 1, 'exactly one native proposal');
      assert.equal(repairCommands(world)[0].entryId, identity.entryId);
      assert.equal(sender.retainedPlacementRepairs.size, 0,
        'the sender-owned continuation confirms the durable row and retires the debt');
      assert.equal(clock.pendingTimerCount(), 0, 'retirement leaves no continuation armed');
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

test('W5 a receiver restart on the same node, replica and address returns the obligation to the sender', () =>
  withRepairLedger(async (world) => {
    const {retained, remote, sender, clock, identity} = await delegateToPausedLeader(world);
    try {
      await world.restartCoordinator();
      assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 0,
        'the restarted receiver lost its volatile custody');
      await resumeFixtureParticipantAdmission(world.leader);
      await idleRepairs(sender, world.coordinator.repository);
      assert.equal(world.commands.length, 0, 'nobody proposes before the sender reconsiders');
      assert.deepEqual(identityOf(sender, retained.operationId), identity);
      // The restarted service re-registers: a new row incarnation under the
      // same service id, node and address. The route tuple is unchanged.
      const birth = mintServiceRowCreatedAt(Date.now());
      remote.publish('services', {...remote.endpoint, created_at: birth, updated_at: birth});
      assert.equal(remote.cache.get('services', remote.endpoint.service_id).created_at, birth,
        'the sender cache holds the re-registered incarnation');
      assert.equal(remote.coordinator.resolveRemoteLedgerLeader().address, remote.endpoint.address);
      await idleRepairs(sender, world.coordinator.repository);
      assertRestoredOnce(world, retained, 'after the receiver restart');
      assert.equal(repairCommands(world).length, 1, 'exactly one native proposal');
      assert.equal(repairCommands(world)[0].entryId, identity.entryId,
        'the sender re-presented its original entry to the restarted receiver');
      assert.equal(sender.retainedPlacementRepairs.size, 0);
      assert.equal(clock.pendingTimerCount(), 0);
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

// The ledger leader's own attempt holds a committed BUSY refusal.
async function retainBusy(world) {
  const retained = await retainMissing(world);
  const competitorId = await admitCompetitor(world, PARTITION_ID);
  const repository = world.coordinator.repository;
  assert.equal(await bounded(repository.repairRetainedOperation(retained), 'BUSY repair'), false);
  const attempt = repository.retainedPlacementRepairs.get(retained.operationId);
  assert.deepEqual(attempt.blockers.map((blocker) => blocker.operationId), [competitorId]);
  assert.equal(attempt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT);
  return {retained, competitorId, repository, attempt, blockers: structuredClone(attempt.blockers),
    proposals: repairCommands(world).length};
}

test('W6 one real release and one transient read failure complete the original repair exactly once', () =>
  withRepairLedger(async (world) => {
    const {retained, competitorId, repository, proposals} = await retainBusy(world);
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = (ordinal) => ordinal === 1 ? READ_FAULT.THROW : null;
    await bounded(stepRetainedLedgerRow(world, competitorId, WORKFLOW_STEP.FAILED), 'the release');
    await idleRepairs(repository);
    assert.equal(reads.attempted, 1, 'the release hint attempted one qualified read');
    assert.equal(repairCommands(world).length, proposals, 'an unavailable read authorizes no proposal');
    assert.equal(ledgerRow(world, retained.operationId), undefined);
    assert.ok(repository.retainedPlacementRepairs.get(retained.operationId),
      'the obligation survives the unavailable read');
    // Same provider, same term; no caller, row, leadership or cache event.
    await advanceContinuation(clock, [repository],
      () => repository.retainedPlacementRepairs.size === 0);
    assertRestoredOnce(world, retained, 'after the provider recovered');
    assert.equal(repairCommands(world).length, proposals + 1,
      'the owed reconsideration completes the original repair exactly once');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    assert.equal(clock.pendingTimerCount(), 0, 'completion leaves no continuation armed');
    reads.restore();
  }));

test('W6 a permanent read failure is bounded, keeps the obligation and proposes nothing', () =>
  withRepairLedger(async (world) => {
    const {retained, competitorId, repository, proposals} = await retainBusy(world);
    const identity = identityOf(repository, retained.operationId);
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = failEvery;
    await bounded(stepRetainedLedgerRow(world, competitorId, WORKFLOW_STEP.FAILED), 'the release');
    await idleRepairs(repository);
    const turns = await advanceContinuation(clock, [repository],
      () => clock.pendingTimerCount() === 0);
    assert.equal(repairCommands(world).length, proposals, 'no read, no proposal');
    assert.equal(ledgerRow(world, retained.operationId), undefined);
    assert.deepEqual(identityOf(repository, retained.operationId), identity,
      'a permanent failure neither retires nor replaces the retained identity');
    assert.equal(clock.pendingTimerCount(), 0,
      `a permanent read failure reaches an explicit bounded stop (still armed after ${turns} ` +
      `continuation turns and ${reads.attempted} reads)`);
    // The bounded stop keeps reconsideration reachable by a legitimate trigger.
    reads.fault = () => null;
    assert.equal(await bounded(repository.ensureRetainedOperationRow(retained), 'later caller'), true);
    assertRestoredOnce(world, retained, 'after the bounded stop');
    assert.equal(repairCommands(world).length, proposals + 1);
    reads.restore();
  }));

async function releaseAndRecover(world, busy, clock, reads) {
  const {retained, competitorId, repository, proposals} = busy;
  await bounded(stepRetainedLedgerRow(world, competitorId, WORKFLOW_STEP.FAILED),
    'the real release during the outage');
  await idleRepairs(repository);
  assert.equal(repairCommands(world).length, proposals, 'the outage authorizes no proposal');
  reads.fault = () => null;
  await advanceContinuation(clock, [repository],
    () => repository.retainedPlacementRepairs.size === 0);
  assertRestoredOnce(world, retained, 'the release committed during the outage is not dropped');
  assert.equal(repairCommands(world).length, proposals + 1);
}

test('W7 an unavailable read on the ingress path leaves the committed blocker trigger unchanged', () =>
  withRepairLedger(async (world) => {
    const busy = await retainBusy(world);
    const {retained, repository, attempt, blockers, proposals} = busy;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = failEvery;
    // The same replica leads a later term: its earlier decision is not current.
    world.leader.controllablePort.term += 1;
    const remote = remoteSender(world);
    installVirtualClock(remote.repository);
    try {
      assert.equal(await bounded(remote.repository.repairRetainedOperation(retained),
        'remote request during the outage'), false);
      assert.ok(reads.attempted >= 1, 'the ingress decision attempted its own qualified read');
      assert.equal(repairCommands(world).length, proposals);
      assert.equal(repository.retainedPlacementRepairs.get(retained.operationId), attempt);
      assert.deepEqual(attempt.blockers, blockers, 'the known blockers survive the read failure');
      assert.equal(attempt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT,
        'a failed read owes revalidation; it does not rewrite what the committed refusal waits for');
      await releaseAndRecover(world, busy, clock, reads);
    } finally {
      reads.restore();
      await remote.coordinator.shutdown();
    }
  }));

test('W7 an unavailable observation consumed by the sender leaves its blocker trigger unchanged', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const competitorId = await admitCompetitor(world, PARTITION_ID);
    const receiver = world.coordinator.repository;
    const remote = remoteSender(world);
    const sender = remote.repository;
    const senderClock = installVirtualClock(sender);
    const receiverClock = installVirtualClock(receiver);
    const reads = controlOwnerReads(receiver);
    try {
      assert.equal(await bounded(sender.repairRetainedOperation(retained), 'remote BUSY'), false);
      const attempt = sender.retainedPlacementRepairs.get(retained.operationId);
      assert.deepEqual(attempt.blockers.map((blocker) => blocker.operationId), [competitorId]);
      assert.equal(attempt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT);
      const blockers = structuredClone(attempt.blockers);
      const proposals = repairCommands(world).length;
      reads.fault = failEvery;
      await bounded(stepRetainedLedgerRow(world, competitorId, WORKFLOW_STEP.FAILED),
        'the real release during the outage');
      // The release reaches the sender as the holder's committed row change.
      remote.publish('replica_operations', ledgerRow(world, competitorId));
      await idleRepairs(sender, receiver);
      assert.equal(repairCommands(world).length, proposals, 'the outage authorizes no proposal');
      assert.equal(sender.retainedPlacementRepairs.get(retained.operationId), attempt);
      assert.deepEqual(attempt.blockers, blockers);
      assert.equal(attempt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT,
        'a consumed unavailable observation owes revalidation; the blocker trigger is unchanged');
      reads.fault = () => null;
      await advanceContinuation(receiverClock, [receiver, sender],
        () => ledgerRow(world, retained.operationId) !== undefined);
      assertRestoredOnce(world, retained, 'the release committed during the outage is not dropped');
      assert.equal(repairCommands(world).length, proposals + 1);
      remote.publish('replica_operations', ledgerRow(world, retained.operationId));
      await idleRepairs(sender, receiver);
      await advanceContinuation(senderClock, [sender, receiver],
        () => sender.retainedPlacementRepairs.size === 0);
      assert.equal(sender.retainedPlacementRepairs.size, 0);
    } finally {
      reads.restore();
      await remote.coordinator.shutdown();
    }
  }));

test('W7 an unavailable read after the pinned entry resolved leaves the committed blocker trigger unchanged', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const competitorId = await admitCompetitor(world, PARTITION_ID);
    const repository = world.coordinator.repository;
    const native = repository.repairRetainedPlacement;
    let answers = 0;
    repository.repairRetainedPlacement = async (payload) => {
      const answer = await native(payload);
      answers += 1;
      if (answers === 1) throw new Error('lost actual BUSY answer');
      return answer;
    };
    assert.equal(await bounded(repository.repairRetainedOperation(retained), 'lost BUSY'), false);
    const attempt = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.ok(attempt.entryId, 'the unknown outcome keeps its entry pinned');
    const proposals = repairCommands(world).length;
    assert.equal(proposals, 1, 'the BUSY refusal actually committed');
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    // The decision's first read is qualified; the read after resolution fails.
    reads.fault = (ordinal) => ordinal === 1 ? null : READ_FAULT.THROW;
    assert.equal(await bounded(repository.repairRetainedOperation(retained), 'resolution'), false);
    assert.equal(reads.attempted, 2, 'one read before and one after resolving the pinned entry');
    assert.equal(repairCommands(world).length, proposals, 'the durable refusal replays: no proposal');
    assert.equal(repository.retainedPlacementRepairs.get(retained.operationId), attempt);
    assert.deepEqual(attempt.blockers.map((blocker) => blocker.operationId), [competitorId],
      'the replayed committed refusal named its blocker');
    assert.equal(attempt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT,
      'the failed post-resolution read owes revalidation; the committed trigger is unchanged');
    await releaseAndRecover(world, {retained, competitorId, repository, proposals}, clock, reads);
    reads.restore();
  }));

test('W8 shutdown with an armed continuation leaves nothing to fire', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const repository = world.coordinator.repository;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = failEvery;
    assert.equal(await bounded(repository.repairRetainedOperation(retained), 'outage'), false);
    assert.equal(clock.pendingTimerCount(), 1, 'the unavailable read armed one owned continuation');
    const attempted = reads.attempted;
    await bounded(world.coordinator.shutdown(), 'shutdown');
    assert.equal(clock.pendingTimerCount(), 0, 'shutdown cancels the continuation');
    clock.advance(600_000);
    await settleTicks();
    assert.equal(reads.attempted, attempted, 'no read after shutdown');
    assert.equal(world.commands.length, 0, 'no proposal after shutdown');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    reads.restore();
  }));

test('W8 retirement with an armed continuation leaves nothing to fire', () =>
  withRepairLedger(async (world) => {
    const mutate = world.gateway.submitMutation;
    let original;
    world.gateway.submitMutation = async (mutation, ...rest) => {
      if (mutation.operation === 'delete') {
        original = ledgerRow(world, mutation.whereClause.operation_id);
      }
      return mutate(mutation, ...rest);
    };
    const retained = await retainMissing(world);
    world.gateway.submitMutation = mutate;
    const repository = world.coordinator.repository;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = failEvery;
    assert.equal(await bounded(repository.repairRetainedOperation(retained), 'outage'), false);
    assert.equal(clock.pendingTimerCount(), 1, 'the unavailable read armed one owned continuation');
    // Another writer restores the exact row; the provider recovers; the next
    // legitimate caller confirms and retires the obligation.
    await bounded(world.gateway.submitMutation({tableName: 'replica_operations',
      operation: 'insert', row: original}), 'exact row restored elsewhere');
    reads.fault = () => null;
    assert.equal(await bounded(repository.ensureRetainedOperationRow(retained), 'confirm'), true);
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    assert.equal(clock.pendingTimerCount(), 0, 'retirement cancels the continuation');
    const attempted = reads.attempted;
    clock.advance(600_000);
    await idleRepairs(repository);
    assert.equal(reads.attempted, attempted, 'no read after retirement');
    assert.equal(repairCommands(world).length, 0, 'the visible exact row needs no proposal');
    reads.restore();
  }));

const invalidAuthorityAnswers = [
  ['partial', (answer) => ({...answer, partial: true})],
  ['failed', (answer) => ({...answer, success: false, rowSetComplete: false})],
  ['stale', (answer) => ({...answer,
    readAuthorityWitness: {...answer.readAuthorityWitness, appliedIndex: 0}})],
  ['wrong-partition', (answer) => ({...answer,
    readAuthorityWitness: {...answer.readAuthorityWitness, partitionId: 'foreign-ledger-p1'}})],
];

// Two remote senders of one retained operation meet the ledger leader, whose
// qualified reads are invalid until `reads.fault` is cleared.
async function twoSenders(world, corrupt) {
  const retained = await retainMissing(world);
  const receiver = world.coordinator.repository;
  const clock = installVirtualClock(receiver);
  const reads = controlOwnerReads(receiver);
  reads.fault = () => corrupt;
  const senders = [remoteSender(world, NODE.A), remoteSender(world, NODE.B)];
  for (const sender of senders) installVirtualClock(sender.repository);
  return {retained, receiver, clock, reads, senders};
}

function assertInvalidAuthoritySafety(world, setup, label) {
  const {retained, receiver, senders} = setup;
  assert.equal(world.commands.length, 0, `${label}: invalid authority authorizes no proposal`);
  assert.equal(ledgerRow(world, retained.operationId), undefined,
    `${label}: invalid authority writes nothing`);
  assert.ok(receiver.retainedPlacementRepairs.get(retained.operationId),
    `${label}: the receiver keeps the obligation`);
  for (const sender of senders) {
    const attempt = sender.repository.retainedPlacementRepairs.get(retained.operationId);
    assert.ok(attempt, `${label}: invalid authority retires no sender debt`);
    assert.equal(JSON.stringify(attempt.operation), JSON.stringify(retained),
      `${label}: the retained identity is not replaced`);
  }
}

async function assertFreshAuthorityRecovers(world, setup) {
  const {retained, receiver, reads, senders} = setup;
  reads.fault = () => null;
  const before = reads.attempted;
  const later = senders[1].repository;
  assert.equal(await bounded(later.ensureRetainedOperationRow(retained), 'later trigger'), true,
    'a later legitimate trigger obtains fresh authority after an earlier unavailable result');
  assert.ok(reads.attempted > before, 'recovery used a fresh qualified read');
  assert.ok(ledgerRow(world, retained.operationId));
  assert.equal(repairCommands(world).length, 1, 'recovery proposes exactly once');
  assert.equal(receiver.retainedPlacementRepairs.size, 0);
}

for (const [name, corrupt] of invalidAuthorityAnswers) {
  test(`${name} authority, overlapping arrivals: one owned decision and one qualified read`, () =>
    withRepairLedger(async (world) => {
      const setup = await twoSenders(world, corrupt);
      const {retained, reads, senders} = setup;
      try {
        const hold = reads.holdNext();
        const first = senders[0].repository.repairRetainedOperation(retained);
        await bounded(hold.arrived, 'the first arrival owns a decision that is reading');
        const second = senders[1].repository.repairRetainedOperation(retained);
        await settleTicks();
        hold.release();
        assert.equal(await bounded(first, 'first arrival'), false);
        assert.equal(await bounded(second, 'overlapping arrival'), false);
        assertInvalidAuthoritySafety(world, setup, 'overlapping');
        assert.equal(reads.maxInFlight, 1, 'no concurrent duplicate read');
        assert.equal(reads.attempted, 1, 'the overlapping arrival joined the decision in flight');
        await assertFreshAuthorityRecovers(world, setup);
      } finally {
        reads.restore();
        for (const sender of senders) await sender.coordinator.shutdown();
      }
    }));

  test(`${name} authority, sequential arrivals: a bounded later decision with a fresh read`, () =>
    withRepairLedger(async (world) => {
      const setup = await twoSenders(world, corrupt);
      const {retained, reads, senders} = setup;
      try {
        assert.equal(await bounded(senders[0].repository.repairRetainedOperation(retained),
          'first arrival'), false);
        const settled = reads.attempted;
        assert.equal(await bounded(senders[1].repository.repairRetainedOperation(retained),
          'later arrival'), false);
        assertInvalidAuthoritySafety(world, setup, 'sequential');
        assert.equal(reads.maxInFlight, 1, 'no concurrent duplicate read');
        assert.equal(settled, 1, 'the first arrival used one qualified read');
        assert.equal(reads.attempted, settled + 1,
          'an arrival after settlement starts one fresh decision: an unavailable result is not reused');
        await assertFreshAuthorityRecovers(world, setup);
      } finally {
        reads.restore();
        for (const sender of senders) await sender.coordinator.shutdown();
      }
    }));
}
