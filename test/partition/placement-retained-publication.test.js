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
import {clearFixtureSingletons, resetFixtureSingletons, resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';
import {withRetainedLeadershipPair} from './placement-retained-leadership-fixture.js';
import {stepRetainedLedgerRow} from './placement-retained-row-repair-fixture.js';
import {admitCompetitor, bounded, controlOwnerReads, idleRepairs, installVirtualClock, ledgerRow,
  repairCommands, repairMessages, retainMissingOperation} from
  './placement-retained-witness-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PARTITION_ID = 'retained-publication-p1';
const OPERATION_ID = 'retained-publication-remove';

function retainMissing(a) {
  return retainMissingOperation(a, {operationId: OPERATION_ID, partitionId: PARTITION_ID,
    replicaId: `${PARTITION_ID}-r1`, targetNodeId: a.leader.nodeId});
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
