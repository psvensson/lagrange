// Contract witnesses of the retained placement repair owner, publication side:
// "A publication change is a hint to reconsider the current canonical binding."
// Two real file-backed ledger appliers under a controllable consensus port; the
// PARTITIONS leader row and the follower-published SERVICES endpoint rows enter
// both coordinators' caches through real cache admission.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission,
  settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {attachRealPublication, publishedLeader, withRetainedLeadershipPair} from
  './placement-retained-leadership-fixture.js';
import {stepRetainedLedgerRow} from './placement-retained-row-repair-fixture.js';
import {READ_FAULT, admitCompetitor, advanceContinuation, bounded, captureRepairLogs,
  controlOwnerReads, idleRepairs, installVirtualClock, ledgerRow, persistOperation,
  repairCommands, repairMessages, retainMissingOperation} from
  './placement-retained-witness-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PARTITION_ID = 'retained-publication-p1';
const OPERATION_ID = 'retained-publication-remove';

function identity(a) {
  return {operationId: OPERATION_ID, partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-r1`, targetNodeId: a.leader.nodeId};
}

function retainMissing(a) {
  return retainMissingOperation(a, identity(a));
}

function idle(a, b) {
  return idleRepairs(a.coordinator.repository, b.coordinator.repository);
}

function between(messages, from, to) {
  return repairMessages(messages).filter((message) => message.from === from && message.to === to);
}

// A pinned, genuinely uncommitted request: the paused origin leader refused it.
async function pinPaused(a) {
  const retained = await retainMissing(a);
  raiseParticipantCutoverPause(a.leader);
  const repository = a.coordinator.repository;
  assert.equal(await bounded(repository.repairRetainedOperation(retained), 'paused repair'), false);
  const attempt = repository.retainedPlacementRepairs.get(retained.operationId);
  assert.ok(attempt.entry.entryId, 'the paused refusal pinned one exact entry');
  return {retained, attempt, identity: {entryId: attempt.entry.entryId,
    bodyText: JSON.stringify(attempt.entry.body), operationText: JSON.stringify(attempt.operation),
    minimumLedgerIndex: attempt.minimumLedgerIndex, minimumLedgerTerm: attempt.minimumLedgerTerm}};
}

function assertIdentityPreserved(repository, pinned, label) {
  const attempt = repository.retainedPlacementRepairs.get(pinned.retained.operationId);
  assert.ok(attempt, `${label}: the obligation is retained`);
  assert.equal(attempt.entry.entryId, pinned.identity.entryId, `${label}: unresolved entry id`);
  assert.equal(JSON.stringify(attempt.entry.body), pinned.identity.bodyText, `${label}: exact body`);
  assert.equal(JSON.stringify(attempt.operation), pinned.identity.operationText,
    `${label}: operation identity`);
  assert.ok(attempt.minimumLedgerIndex >= pinned.identity.minimumLedgerIndex,
    `${label}: minimum ledger index never decreases`);
  assert.ok(attempt.minimumLedgerTerm >= pinned.identity.minimumLedgerTerm,
    `${label}: minimum ledger term never decreases`);
}

function assertRestoredOnce(nodes, pinned, label) {
  const restores = repairCommands(...nodes).filter((command) =>
    command.body.operation.operationId === pinned.retained.operationId);
  assert.equal(restores.length, 1, `${label}: exactly one native repair proposal`);
  assert.equal(restores[0].entryId, pinned.identity.entryId, `${label}: the original entry`);
  assert.equal(JSON.stringify(restores[0].body), pinned.identity.bodyText,
    `${label}: the original bytes`);
}

test('W1 a delayed stale B notification after the cache advanced A-B-A leaves the attempt on A', () =>
  withRetainedLeadershipPair(async ({a, b, messages, changeRoles, publishLeader}) => {
    const pinned = await pinPaused(a);
    const repository = a.coordinator.repository;
    await changeRoles(b, {resume: false});
    await changeRoles(a, {resume: false});
    // Both publications are admitted in one turn: the cache already names A
    // again when the deferred channel delivers the B notification.
    publishLeader(b);
    publishLeader(a);
    assert.equal(a.coordinator.resolveRemoteLedgerLeader().replicaId, a.leader.replicaId);
    await idle(a, b);
    assert.equal(repairCommands(a, b).length, 0, 'a paused entry is never proposed by a notification');
    assertIdentityPreserved(repository, pinned, 'after the stale B notification');
    assert.equal(between(messages, a, b).length, 0,
      'the notified row never moves the attempt: the current canonical route names A');
    assert.equal(b.coordinator.repository.retainedPlacementRepairs.size, 0,
      'B received no custody from a stale notification');
    await resumeFixtureParticipantAdmission(a.leader);
    await idle(a, b);
    assert.ok(ledgerRow(a, pinned.retained.operationId),
      'the actual release on A, with no other caller, restores the original row');
    assertRestoredOnce([a, b], pinned, 'A release');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));

for (const order of ['partition-first', 'endpoint-first']) {
  test(`W2 ${order}: a truly missing endpoint retains the obligation until the publication completes`, () =>
    withRetainedLeadershipPair(async ({a, b, messages, changeRoles, publishLeader,
      publishEndpoint}) => {
      const pinned = await pinPaused(a);
      const repository = a.coordinator.repository;
      assert.equal(a.coordinator.systemTableCache.get('services', b.leader.replicaId) ?? null, null,
        'the B endpoint row has not arrived: it is missing, not wrong');
      await changeRoles(b);
      const publications = order === 'partition-first' ?
        [() => publishLeader(b), () => publishEndpoint(b)] :
        [() => publishEndpoint(b), () => publishLeader(b)];
      publications[0]();
      await idle(a, b);
      assert.equal(repairCommands(a, b).length, 0, 'half a publication authorizes no proposal');
      assertIdentityPreserved(repository, pinned, 'after half the publication');
      assert.equal(between(messages, a, b).length, 0,
        'one half of the leader/endpoint publication cannot route to B');
      const route = a.coordinator.resolveRemoteLedgerLeader();
      if (order === 'partition-first') assert.equal(route, null);
      else assert.equal(route.replicaId, a.leader.replicaId);
      publications[1]();
      await idle(a, b);
      assert.ok(ledgerRow(b, pinned.retained.operationId),
        'the completing publication alone makes reconsideration reach the current leader B');
      assertRestoredOnce([a, b], pinned, 'B after the completed publication');
      assert.equal(repository.retainedPlacementRepairs.size, 0,
        'the origin confirms the durable row through B and retires its debt');
    }, {initialEndpoints: 'leader-only'}));
}

test('W2 two ACTIVE endpoints for the leader node are ambiguous: retained, then reachable', () =>
  withRetainedLeadershipPair(async ({a, b, messages, changeRoles, publishLeader,
    publishEndpoint}) => {
    const pinned = await pinPaused(a);
    const repository = a.coordinator.repository;
    await changeRoles(b);
    const predecessor = {service_id: 'replica_operations-p1-b0',
      replica_id: 'replica_operations-p1-b0',
      address: 'node-b/partition/replica_operations-p1-b0'};
    publishEndpoint(b, predecessor);
    publishLeader(b);
    await idle(a, b);
    assert.equal(a.coordinator.resolveRemoteLedgerLeader(), null,
      'two ACTIVE ledger endpoints on the leader node are not a route');
    assert.equal(repairCommands(a, b).length, 0, 'an ambiguous route authorizes no proposal');
    assertIdentityPreserved(repository, pinned, 'while the route is ambiguous');
    assert.equal(between(messages, a, b).length, 0);
    publishEndpoint(b, {...predecessor, status: 'stopped'});
    await idle(a, b);
    assert.equal(a.coordinator.resolveRemoteLedgerLeader()?.replicaId, b.leader.replicaId);
    assert.ok(ledgerRow(b, pinned.retained.operationId),
      'the publication that resolves the ambiguity makes reconsideration reach B');
    assertRestoredOnce([a, b], pinned, 'B after the ambiguity resolved');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));

// The origin holds a committed BUSY refusal; the ordinary holder never changes.
async function retainBusy(a) {
  const retained = await retainMissing(a);
  const competitorId = await admitCompetitor(a, PARTITION_ID);
  const repository = a.coordinator.repository;
  assert.equal(await bounded(repository.repairRetainedOperation(retained), 'BUSY repair'), false);
  assert.equal(repairCommands(a).length, 1, 'the origin committed exactly one BUSY refusal');
  const attempt = repository.retainedPlacementRepairs.get(retained.operationId);
  assert.deepEqual(attempt.blocker.operations.map((blocker) => blocker.operationId),
    [competitorId]);
  return {retained, competitorId};
}

test('W3 the origin becoming ledger leader with unchanged BUSY proposes nothing', () =>
  withRetainedLeadershipPair(async ({a, b, elect}) => {
    const {retained, competitorId} = await retainBusy(a);
    const repository = a.coordinator.repository;
    await elect(b);
    await idle(a, b);
    const afterB = repairCommands(a, b).length;
    await elect(a);
    await idle(a, b);
    const afterA = repairCommands(a, b).length;
    assert.equal(ledgerRow(a, retained.operationId), undefined,
      'the live holder still excludes the retained row');
    assert.ok(repository.retainedPlacementRepairs.get(retained.operationId),
      'the origin keeps its obligation across both handoffs');
    assert.equal(afterB, 1, 'handoff to B with unchanged BUSY: zero native proposals');
    assert.equal(afterA - afterB, 0,
      'the origin as ledger leader evaluates the known blocker first: zero native proposals');
    await bounded(stepRetainedLedgerRow(a, competitorId, WORKFLOW_STEP.FAILED), 'holder release');
    await idle(a, b);
    assert.ok(ledgerRow(a, retained.operationId), 'the real holder release restores the row');
    assert.equal(repairCommands(a, b).length - afterA, 1, 'exactly one proposal after the release');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));

test('W9 a route publication during an in-flight read is queued and applied after that decision', () =>
  withRetainedLeadershipPair(async ({a, b, elect}) => {
    const {retained, competitorId} = await retainBusy(a);
    const repository = a.coordinator.repository;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    const hold = reads.holdNext();
    await elect(b);
    await bounded(hold.arrived, 'the handoff decision reads through the published B route');
    const proposals = repairCommands(a, b).length;
    // The B-served read is still in flight when the publication returns to A.
    await elect(a);
    hold.release();
    await idle(a, b);
    assert.equal(ledgerRow(a, retained.operationId), undefined);
    assert.ok(repository.retainedPlacementRepairs.get(retained.operationId));
    assert.equal(repairCommands(a, b).length, proposals,
      'unchanged BUSY across the flap: zero native proposals');
    assert.equal(clock.pendingTimerCount(), 0,
      'a qualified answer read under the B binding is judged against that binding: the queued ' +
      'route change does not turn it into an unavailable read with a backoff');
    await bounded(stepRetainedLedgerRow(a, competitorId, WORKFLOW_STEP.FAILED), 'holder release');
    await idle(a, b);
    assert.ok(ledgerRow(a, retained.operationId),
      'the real holder release on leader A restores the row without any clock advance');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    reads.restore();
  }));

// ---- Corrective round (transition record section 18). Every leadership
// change below is driven through the REAL publishers into both caches by CDC.

// While `outage.failing`, every qualified read of the record bound to `next`
// fails transiently; every other read is served.
function failReadsBoundTo(reads, repository, operationId, next) {
  const outage = {failing: true, count: 0};
  reads.fault = () => {
    const binding = repository.retainedPlacementRepairs.get(operationId)?.binding;
    if (outage.failing && binding?.state === 'remote' &&
        binding.nodeId === next.leader.nodeId) {
      outage.count += 1;
      return READ_FAULT.THROW;
    }
    return null;
  };
  return outage;
}

test('F1 a route change, a transient read failure and no other event: the owed reconsideration completes the original repair once', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    attachRealPublication([a, b]);
    const pinned = await pinPaused(a);
    const repository = a.coordinator.repository;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    const outage = failReadsBoundTo(reads, repository, pinned.retained.operationId, b);
    try {
      await changeRoles(b);
      await publishedLeader([a, b], b);
      await idle(a, b);
      // The provider recovers in the same term once the publication is done.
      outage.failing = false;
      const attempt = repository.retainedPlacementRepairs.get(pinned.retained.operationId);
      assert.ok(attempt, 'the obligation survives the failed read');
      assert.ok(outage.count >= 1, 'a read bound to the new route B failed transiently');
      assert.equal(attempt.binding.nodeId, b.leader.nodeId, 'the record is bound to B');
      assert.equal(repairCommands(a, b).length, 0, 'an unavailable read authorizes no proposal');
      assertIdentityPreserved(repository, pinned, 'after the failed read');
      assert.equal(clock.pendingTimerCount(), 1, 'the failed read armed the record continuation');
      // From here on no caller, row, leadership or cache event: only the
      // continuation's own clock.
      await advanceContinuation(clock, [repository, b.coordinator.repository],
        () => repository.retainedPlacementRepairs.size === 0);
      assert.ok(ledgerRow(b, pinned.retained.operationId),
        'the owed reconsideration reaches B and restores the row with no other event');
      assertRestoredOnce([a, b], pinned, 'after the continuation');
      assert.equal(repository.retainedPlacementRepairs.size, 0);
      assert.equal(clock.pendingTimerCount(), 0, 'completion leaves no continuation armed');
    } finally {
      reads.restore();
    }
  }));

test('F3 a delegated origin that becomes ledger leader with unchanged BUSY makes zero native proposals before its leadership-start wake', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    const publication = attachRealPublication([a, b]);
    const retained = await retainMissing(a);
    const competitorId = await admitCompetitor(a, PARTITION_ID);
    const origin = b.coordinator.repository;
    assert.equal(await bounded(origin.repairRetainedOperation(retained), 'remote BUSY'), false);
    await idle(a, b);
    const attempt = origin.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(attempt.custody.state, 'delegated', 'the ledger leader A holds the exact entry');
    assert.deepEqual(attempt.blocker.operations.map((blocker) => blocker.operationId),
      [competitorId]);
    const proposals = repairCommands(a, b).length;
    // B's ledger replica wins the next term. Its leader-owned activation (the
    // leadership-start wake) waits on its holdoff clock, and the CDC of the
    // real publishers is still in flight to the caches.
    b.leader.leaderActivationGate.timeSource = new VirtualTimeSource({startMs: Date.now()});
    publication.hold();
    await changeRoles(b);
    assert.equal(b.coordinator.resolveActiveLocalLedgerLeaderService(), b.leader,
      'B is the active local ledger leader');
    assert.equal(b.placementOwner.isLeader, false,
      'the leadership-start activation has not run: no leadership-start wake is queued');
    assert.equal(attempt.observations, 0, 'no publication hint has reached the origin');
    assert.equal(attempt.custody.state, 'delegated');
    // A caller arrives while the holder of the entity is unchanged.
    assert.equal(await bounded(origin.ensureRetainedOperationRow(retained), 'caller'), false);
    assert.equal(repairCommands(a, b).length - proposals, 0,
      'the node that would propose evaluates the unchanged blocker first: zero native proposals');
    publication.release();
    await idle(a, b);
    assert.equal(repairCommands(a, b).length - proposals, 0,
      'the late publication proposes nothing while the holder is unchanged');
    await bounded(stepRetainedLedgerRow(b, competitorId, WORKFLOW_STEP.FAILED), 'holder release');
    await idle(a, b);
    assert.ok(ledgerRow(b, retained.operationId), 'the real holder release restores the row');
    assert.equal(repairCommands(a, b).length - proposals, 1, 'exactly one proposal after the release');
    assert.equal(origin.retainedPlacementRepairs.size, 0);
  }));

// The origin A loses ledger leadership to B, whose endpoint row was never
// published: the real publication names B the leader and no binding resolves.
async function unbindOrigin(a, b, changeRoles) {
  await changeRoles(b);
  await publishedLeader([a, b], b);
  await idle(a, b);
  assert.equal(a.coordinator.resolveActiveLocalLedgerLeaderService(), null,
    'the origin no longer leads the ledger');
  assert.equal(a.coordinator.resolveRemoteLedgerLeader(), null,
    'the leader B has no published endpoint: the origin has no binding');
}

test('F5 a failed read with no binding keeps its own reason and its continuation; the present row settles with no other event', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    attachRealPublication([a, b]);
    const present = await persistOperation(a, identity(a));
    await unbindOrigin(a, b, changeRoles);
    const repository = a.coordinator.repository;
    const clock = installVirtualClock(repository);
    const reads = controlOwnerReads(repository);
    reads.fault = (ordinal) => ordinal === 1 ? READ_FAULT.THROW : null;
    try {
      assert.equal(await bounded(repository.ensureRetainedOperationRow(present), 'caller'), false);
      const attempt = repository.retainedPlacementRepairs.get(present.operationId);
      assert.ok(attempt, 'the obligation is retained');
      assert.equal(attempt.lastDecision.reason, 'owner_read_failed',
        'the read outcome keeps its own name: it is not folded into the route');
      assert.equal(attempt.waiting?.state, 'continuation', 'the record names its wait');
      assert.equal(clock.pendingTimerCount(), 1,
        'a transient read failure owns a bounded continuation even without a binding');
      await advanceContinuation(clock, [repository, b.coordinator.repository],
        () => repository.retainedPlacementRepairs.size === 0);
      assert.equal(repository.retainedPlacementRepairs.size, 0,
        'the recovered read settles the present row with no caller, row, leadership or cache event');
      assert.equal(repairCommands(a, b).length, 0, 'a present row needs no proposal');
      assert.equal(clock.pendingTimerCount(), 0);
    } finally {
      reads.restore();
    }
  }, {initialEndpoints: 'leader-only'}));

test('F5 an invalid row with no binding is a typed, visible refusal: its own reason, one error, no timer, no proposal', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    attachRealPublication([a, b]);
    const present = await persistOperation(a, identity(a));
    await unbindOrigin(a, b, changeRoles);
    const repository = a.coordinator.repository;
    const clock = installVirtualClock(repository);
    const logs = captureRepairLogs(repository, present.operationId);
    const reads = controlOwnerReads(repository);
    // The served row lacks a canonical column.
    reads.fault = () => (answer) => ({...answer,
      rows: answer.rows.map(({created_at: _omitted, ...row}) => row)});
    try {
      for (let caller = 0; caller < 2; caller += 1) {
        assert.equal(await bounded(repository.ensureRetainedOperationRow(present), 'caller'), false);
      }
      const attempt = repository.retainedPlacementRepairs.get(present.operationId);
      assert.ok(attempt, 'a typed refusal keeps the obligation');
      assert.equal(attempt.lastDecision.reason, 'invalid_operation_row',
        'the read outcome keeps its own name: it is not folded into the route');
      assert.equal(attempt.waiting?.state, 'row_change', 'the record names its wait');
      assert.equal(clock.pendingTimerCount(), 0, 'a typed refusal arms no timer');
      assert.equal(logs.lines.filter((line) => line.level === 'error' &&
        line.fields.reason === 'invalid_operation_row').length, 1,
      'one error line for the transition into the refusal, not one per evaluation');
      assert.equal(repairCommands(a, b).length, 0, 'an invalid row authorizes no proposal');
      reads.fault = () => null;
      assert.equal(await bounded(repository.ensureRetainedOperationRow(present), 'healed'), true,
        'a later legitimate trigger settles the healed row');
      assert.equal(repository.retainedPlacementRepairs.size, 0);
    } finally {
      reads.restore();
      logs.restore();
    }
  }, {initialEndpoints: 'leader-only'}));

test('V1 a route-owed wait without a binding is a named, visible state: one log line per transition; the publication ends it', () =>
  withRetainedLeadershipPair(async ({a, b, changeRoles}) => {
    attachRealPublication([a, b]);
    const pinned = await pinPaused(a);
    const repository = a.coordinator.repository;
    const clock = installVirtualClock(repository);
    const logs = captureRepairLogs(repository, pinned.retained.operationId);
    try {
      await unbindOrigin(a, b, changeRoles);
      const attempt = repository.retainedPlacementRepairs.get(pinned.retained.operationId);
      assertIdentityPreserved(repository, pinned, 'without a binding');
      assert.equal(repairCommands(a, b).length, 0, 'no binding authorizes no proposal');
      assert.equal(attempt.waiting?.state, 'route_publication',
        'the record names what it waits for: the next ledger route publication');
      assert.equal(attempt.waiting.reason, 'unqualified_binding',
        'and why: an absence read without a binding');
      assert.equal(clock.pendingTimerCount(), 0, 'no timer: the route publication is the wake');
      for (let caller = 0; caller < 3; caller += 1) {
        assert.equal(await bounded(repository.ensureRetainedOperationRow(pinned.retained),
          'caller'), false);
      }
      await idle(a, b);
      assert.equal(attempt.waiting.state, 'route_publication');
      assert.equal(logs.lines.filter((line) =>
        line.fields?.waiting === 'route_publication').length, 1,
      'one log line for the transition into the wait, not one per evaluation');
      await changeRoles(a);
      await publishedLeader([a, b], a);
      await idle(a, b);
      assert.ok(ledgerRow(a, pinned.retained.operationId),
        'the publication that restores a binding ends the wait');
      assertRestoredOnce([a, b], pinned, 'after the route returned');
      assert.equal(repository.retainedPlacementRepairs.size, 0);
    } finally {
      logs.restore();
    }
  }, {initialEndpoints: 'leader-only'}));

// T2: custody attests the receiver's ledger term, but the binding carries no
// term. A tenure that ends by term only (same node, process incarnation,
// replica and address) changes nothing any publication carries.
test('T2 a receiver tenure renewed by term only, with no caller, row or route change: the delegated sender resumes', () =>
  withRetainedLeadershipPair(async ({a, b}) => {
    attachRealPublication([a, b]);
    const retained = await retainMissing(a);
    raiseParticipantCutoverPause(a.leader);
    const sender = b.coordinator.repository;
    const clock = installVirtualClock(sender);
    assert.equal(await bounded(sender.repairRetainedOperation(retained), 'delegating repair'),
      false);
    await idle(a, b);
    const attempt = sender.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(attempt.custody.state, 'delegated',
      'the paused ledger leader A holds custody of the exact entry');
    const custodyTerm = attempt.custody.ledgerTerm;
    assert.equal(repairCommands(a, b).length, 0, 'a paused receiver proposes nothing');
    // A's tenure ends and A wins the next term on the same node, process
    // incarnation, replica and address.
    for (const role of [RAFT_ROLE.FOLLOWER, RAFT_ROLE.LEADER]) {
      for (const node of [a, b]) node.leader.controllablePort.term += 1;
      a.leader.controllablePort.setRole(role);
      await settleTicks();
    }
    assert.equal(a.leader.isLeader, true);
    assert.ok(a.leader.raft.readStatus().term > custodyTerm,
      'the custody tenure ended by term only');
    assert.equal(a.coordinator.repository.retainedPlacementRepairs.size, 0,
      'A released the custody of its ended tenure');
    await resumeFixtureParticipantAdmission(a.leader);
    await idle(a, b);
    await advanceContinuation(clock, [sender, a.coordinator.repository],
      () => sender.retainedPlacementRepairs.size === 0);
    assert.ok(ledgerRow(a, retained.operationId),
      'the delegated sender resumes after a term-only tenure end, with no caller, row or route ' +
      `change (sender custody ${sender.retainedPlacementRepairs.get(retained.operationId)
        ?.custody.state}, term ${custodyTerm})`);
    assert.equal(repairCommands(a, b).length, 1, 'exactly one native proposal');
    assert.equal(sender.retainedPlacementRepairs.size, 0);
  }));
