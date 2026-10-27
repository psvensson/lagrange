/** Current message-group CREATE admission: negative schedules and positive
 * recovery controls (FreshMG 6.B slice B1). Real operation row, membership
 * claim, authorization CAS, native ADD_LEARNER commit, recorder, real
 * abort-learner REMOVE selection and the existing CREATE admission owner over
 * file-backed SQL. Interleavings are injected at the admission owner's actual
 * row CAS (the effect boundary), not at an earlier read. SENDING, terminal
 * settlement and boot replacement are fixture actuation through the real
 * owners, not a production driver. Install/open and the running target are
 * later slices; every schedule here counts physical create calls only.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ReplicaOperationResponseStatus as STATUS} from
  '../../src/rebalancer/replica-operation-constants.js';
import {recordedLearnerCreateBasis} from
  '../../src/rebalancer/replica-operation-message-group-membership-authorization.js';
import {O, SUCCESSOR, NODE, NOW} from '../test-helpers/learner-operation-fixture.js';
import {createFixture, createHandler, createPayload, hookedGateway, selectAbortLearner,
  settleFailed, replaceBoot, settle, SENDING_AT} from
  '../test-helpers/message-group-create-fixture.js';

const REFUSAL = Object.freeze({
  JOIN_CAPABILITY_UNAVAILABLE: 'message_group_create_learner_join_capability_unavailable',
  JOIN_PACKAGE_INVALID: 'message_group_create_join_package_invalid',
  FACT_UNAVAILABLE: 'message_group_create_learner_fact_unavailable',
  FACT_NOT_RECORDED: 'message_group_create_learner_fact_not_recorded',
  ADMISSION_RETAINED: 'message_group_create_admission_retained',
});
// The recorded fact's seven columns the CREATE CAS basis repeats.
const FACT_COLUMNS = Object.freeze(['message_group_membership_identity',
  'message_group_membership_phase', 'message_group_membership_obligation_state',
  'message_group_membership_permit', 'message_group_learner_stamp',
  'message_group_voter_stamp', 'message_group_removal_stamp']);
const ADMISSION = Object.freeze({
  DEFERRED: 'REPLICA_CREATE_ADMISSION_DEFERRED',
  REFUSED_TERMINAL: 'REPLICA_CREATE_ADMISSION_REFUSED_TERMINAL',
  STALE: 'REPLICA_CREATE_ADMISSION_STALE',
});

function assertRefused(response, reason, message) {
  assert.equal(response.status, STATUS.ERROR, `${message}: ${JSON.stringify(response)}`);
  assert.equal(response.errorCode, reason, message);
}
function assertUnadmitted(f) {
  assert.equal(f.row().create_admission_state, null, 'no physical generation is admitted');
  assert.equal(f.row().create_admission_replica_created_at, null);
}
function assertDebtRetained(f) {
  const row = f.row();
  assert.equal(row.message_group_membership_obligation_state, 'unknown',
    'the membership obligation stays outstanding');
  assert.equal(row.message_group_membership_phase, 'learner_committed',
    'the recorded learner fact is untouched');
}

test('the production capability set with the operation owner composed refuses before any admission write', async (t) => {
  const f = await createFixture(t);
  const hooked = hookedGateway(f);
  const {send, creates, genesisCreates} = createHandler(t, f,
    {gateway: hooked.gateway, learnerJoin: false});
  const response = await send(createPayload(f));
  await settle();
  assertRefused(response, REFUSAL.JOIN_CAPABILITY_UNAVAILABLE,
    'composing the repository alone cannot reach the lone-founder create');
  assert.equal(response.deferRetry, false, 'fail once: no retry composes the capability');
  assert.equal(hooked.updates(), 0, 'no admission write');
  assertUnadmitted(f);
  assert.equal(creates() + genesisCreates(), 0, 'no physical capability is invoked');
});

test('any one recorded-fact column that moves between the read and the CREATE CAS defeats the CAS', async (t) => {
  for (const column of FACT_COLUMNS) {
    await t.test(column, async (t) => {
      const f = await createFixture(t);
      const moved = f.row()[column] === null ? '{}' : `${f.row()[column]} `;
      const hooked = hookedGateway(f);
      hooked.on('ADMITTED', {before: () => f.execute(
        `UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`, [moved, O])});
      const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
      const response = await send(createPayload(f));
      await settle();
      assert.notEqual(response.status, STATUS.INITIATED, `${column}: ${JSON.stringify(response)}`);
      assert.equal(f.row().create_admission_state, null,
        `no generation is admitted when ${column} moved`);
      assert.equal(creates(), 0);
    });
  }
});

test('the admission readback does not adopt an admission whose recorded fact moved after a lost answer', async (t) => {
  const f = await createFixture(t);
  const hooked = hookedGateway(f);
  const {handler} = createHandler(t, f, {gateway: hooked.gateway});
  const owner = handler.getReplicaCreateAdmissionOwner();
  const fact = recordedLearnerCreateBasis(
    await f.repositoryFor(SUCCESSOR).queryAuthoritativeOperationById(O));
  hooked.on('ADMITTED', {after: () => selectAbortLearner(f), loseAnswer: true});
  const payload = createPayload(f);
  await assert.rejects(owner.claim({operationId: O, operationType: payload.operationType,
    entityType: payload.entityType, entityId: payload.entityId,
    partitionId: payload.partitionId, replicaId: payload.replicaId,
    admissionToken: payload.createAdmissionToken,
    attemptToken: payload.createAdmissionAttemptToken,
    attemptSeq: payload.createAdmissionAttemptSeq,
    workflowUpdatedAt: payload.createAdmissionWorkflowUpdatedAt}, fact.where),
  'a readback whose recorded fact moved is not adopted as evidence');
  assert.equal(f.row().create_admission_state, 'ADMITTED',
    'the admission itself committed before the fact moved');
});

test('an ordinary terminal settlement between admission and MATERIALIZED starts no worker', async (t) => {
  const f = await createFixture(t);
  const hooked = hookedGateway(f);
  hooked.on('MATERIALIZED', {before: () => settleFailed(f)});
  const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
  const response = await send(createPayload(f));
  await settle();
  assertRefused(response, ADMISSION.STALE, 'the worker fence requires an open operation');
  assert.equal(response.deferRetry, false);
  assert.equal(creates(), 0, 'no physical work for a settled operation');
  assert.equal(f.row().create_admission_state, 'ADMITTED',
    'the admission is retained for its later close owner');
  assert.notEqual(f.row().completed_at, null);
  assertDebtRetained(f);
});

test('a forged learner stamp that does not match the committed ConfState is refused', async (t) => {
  const f = await createFixture(t);
  const stamp = JSON.parse(f.row().message_group_learner_stamp);
  const forged = JSON.stringify({...stamp, learners: []});
  f.execute('UPDATE replica_operations SET message_group_learner_stamp = ? WHERE operation_id = ?',
    [forged, O]);
  const {creates, send} = createHandler(t, f);
  const response = await send(createPayload(f));
  await settle();
  assertRefused(response, REFUSAL.FACT_NOT_RECORDED,
    'a phase/permit claiming commitment with a stamp naming no learner is not the fact');
  assert.equal(creates(), 0);
  assertUnadmitted(f);
});

test('a recorded learner whose membership obligation is no longer outstanding cannot create', async (t) => {
  const f = await createFixture(t);
  f.execute('UPDATE replica_operations SET message_group_membership_obligation_state = ? ' +
    'WHERE operation_id = ?', ['intent_recorded', O]);
  const {creates, send} = createHandler(t, f);
  assertRefused(await send(createPayload(f)), REFUSAL.FACT_NOT_RECORDED,
    'CREATE needs the debt it serves to still be open');
  await settle();
  assert.equal(creates(), 0);
  assertUnadmitted(f);
});

test('a stale descriptor after a later REMOVE selection cannot create', async (t) => {
  const f = await createFixture(t);
  await selectAbortLearner(f);
  const {creates, send} = createHandler(t, f);
  const response = await send(createPayload(f));
  await settle();
  assertRefused(response, REFUSAL.FACT_NOT_RECORDED,
    'the learner fact no longer holds once the target is being removed');
  assert.equal(creates(), 0);
  assertUnadmitted(f);
});

test('a REMOVE selection that lands between the fact read and the CREATE CAS defeats the CAS', async (t) => {
  const f = await createFixture(t);
  const hooked = hookedGateway(f);
  hooked.on('ADMITTED', {before: () => selectAbortLearner(f)});
  const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
  const response = await send(createPayload(f));
  await settle();
  // The existing owner answers a no_op CAS on a non-matching row DEFERRED.
  assertRefused(response, ADMISSION.DEFERRED, 'the admission CAS carries the fact columns');
  assert.equal(creates(), 0);
  assertUnadmitted(f);
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
  assertRefused(await send(createPayload(f)), REFUSAL.FACT_NOT_RECORDED,
    'the redelivery converges on the definitive refusal');
  assert.equal(creates(), 0);
});

test('a REMOVE selection that lands after admission but before the worker defeats MATERIALIZED', async (t) => {
  const f = await createFixture(t);
  const hooked = hookedGateway(f);
  hooked.on('MATERIALIZED', {before: () => selectAbortLearner(f)});
  const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
  const response = await send(createPayload(f));
  await settle();
  assertRefused(response, ADMISSION.STALE, 'the worker fence carries the fact columns too');
  assert.equal(response.deferRetry, false);
  assert.equal(creates(), 0, 'no worker starts for a removed learner');
  assert.equal(f.row().create_admission_state, 'ADMITTED', 'the admission is retained, not advanced');
});

test('a join package for another group or target is refused before any CAS', async (t) => {
  const f = await createFixture(t);
  const {creates, send} = createHandler(t, f);
  for (const join of [{groupId: 'another-group'}, {replicaIdentity: 'another-target'},
    {peerId: 'another-peer'}, {kind: 'genesis'}, {extra: true}]) {
    const response = await send(createPayload(f, {join}));
    assertRefused(response, REFUSAL.JOIN_PACKAGE_INVALID, JSON.stringify(join));
  }
  await settle();
  assert.equal(creates(), 0);
  assertUnadmitted(f);
});

test('a request for another group or target, or delivered to another node, loses the CREATE CAS', async (t) => {
  const f = await createFixture(t);
  const target = createHandler(t, f);
  for (const changes of [{entityId: 'another-group', partitionId: 'another-group'},
    {replicaId: 'another-target'}]) {
    const response = await target.send(createPayload(f, changes));
    assertRefused(response, ADMISSION.DEFERRED, JSON.stringify(changes));
  }
  const wrongNode = createHandler(t, f, {nodeId: NODE});
  assertRefused(await wrongNode.send(createPayload(f)), ADMISSION.DEFERRED,
    'only the operation\'s target node is admitted');
  await settle();
  assert.equal(target.creates() + wrongNode.creates(), 0);
  assertUnadmitted(f);
  assert.equal((await target.send(createPayload(f))).status, STATUS.INITIATED,
    'the misdirected requests consumed nothing: the exact CREATE still admits');
  await settle();
  assert.equal(target.creates() + wrongNode.creates(), 1);
});

test('terminal-first and terminal racing the CAS perform zero physical work', async (t) => {
  await t.test('terminal before the CREATE arrives', async (t) => {
    const f = await createFixture(t);
    await settleFailed(f);
    const {creates, send} = createHandler(t, f);
    const response = await send(createPayload(f));
    assertRefused(response, ADMISSION.REFUSED_TERMINAL, 'terminal-first');
    assert.equal(response.deferRetry, false, 'a terminal refusal is not retried');
    await settle();
    assert.equal(creates(), 0);
    assertUnadmitted(f);
  });
  await t.test('terminal between the fact read and the CAS', async (t) => {
    const f = await createFixture(t);
    const hooked = hookedGateway(f);
    hooked.on('ADMITTED', {before: () => settleFailed(f)});
    const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
    const response = await send(createPayload(f));
    assertRefused(response, ADMISSION.REFUSED_TERMINAL, 'terminal at the CAS');
    assert.equal(response.deferRetry, false, 'a terminal refusal is not retried');
    await settle();
    assert.equal(creates(), 0);
    assertUnadmitted(f);
  });
});

test('a replaced boot defers the claim and fences a queued worker', async (t) => {
  await t.test('boot replaced before the CREATE', async (t) => {
    const f = await createFixture(t);
    replaceBoot(f, 2);
    const {creates, send} = createHandler(t, f);
    const response = await send(createPayload(f));
    assertRefused(response, ADMISSION.DEFERRED, 'a stale process cannot claim');
    assert.equal(response.deferRetry, true);
    await settle();
    assert.equal(creates(), 0);
    assertUnadmitted(f);
  });
  await t.test('boot replaced after INITIATED, before the queued worker runs', async (t) => {
    const f = await createFixture(t);
    const {creates, send, handler, invocations} = createHandler(t, f);
    const response = await send(createPayload(f));
    assert.equal(response.status, STATUS.INITIATED);
    replaceBoot(f, 2);
    await settle();
    assert.equal(invocations(), 0,
      'the worker revalidates the boot before it invokes the physical capability');
    assert.equal(creates(), 0);
    assert.equal(handler.getReplicaCreateAdmissionOwner()
      .activePhysicalWorkerOperationIds.has(O), false, 'the fenced worker released its claim');
  });
});

test('a handler shut down after INITIATED starts no physical work while the node\'s owner lives on', async (t) => {
  const f = await createFixture(t);
  const sibling = createHandler(t, f);
  const shared = sibling.handler.getReplicaCreateAdmissionOwner();
  const {creates, send, handler, invocations} = createHandler(t, f);
  assert.equal(handler.getReplicaCreateAdmissionOwner(), shared,
    'both handlers of this boot hold the one process-wide admission owner');
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  handler.shutdown();
  await settle();
  assert.equal(invocations(), 0, 'the queued worker observes its handler retired');
  assert.equal(creates(), 0);
  assert.equal(shared.activePhysicalWorkerOperationIds.has(O), false, 'and releases its claim');
});

test('a stale workflow generation or attempt cannot create, before or after the current admission', async (t) => {
  const f = await createFixture(t);
  const {creates, send} = createHandler(t, f);
  const older = createPayload(f, {admission: {workflowUpdatedAt: SENDING_AT - 1}});
  const otherAttempt = createPayload(f, {admission: {attemptSeq: 2}});
  assertRefused(await send(older), ADMISSION.DEFERRED, 'older workflow generation');
  assertUnadmitted(f);
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  await settle();
  assertRefused(await send(older), ADMISSION.DEFERRED, 'older generation replayed after admission');
  assertRefused(await send(otherAttempt), ADMISSION.DEFERRED,
    'an unrotated other attempt after admission');
  await settle();
  assert.equal(creates(), 1, 'exactly one worker for the current generation');
});

test('duplicate requests start exactly one physical worker', async (t) => {
  const f = await createFixture(t);
  const first = createHandler(t, f);
  const answers = await Promise.all([first.send(createPayload(f)), first.send(createPayload(f))]);
  assert.deepEqual(answers.map(({status}) => status).sort(),
    [STATUS.IN_PROGRESS, STATUS.INITIATED].sort());
  await settle();
  assert.equal(first.creates(), 1, 'concurrent duplicates');
  const redelivered = await first.send(createPayload(f));
  assert.equal(redelivered.status, STATUS.IN_PROGRESS);
  assert.equal(redelivered.reason, REFUSAL.ADMISSION_RETAINED);
  const second = createHandler(t, f);
  assert.equal((await second.send(createPayload(f))).status, STATUS.IN_PROGRESS,
    'another handler instance of the same boot shares the sole-worker owner');
  await settle();
  assert.equal(first.creates() + second.creates(), 1,
    'a redelivery after the worker finished starts no second worker');
  assert.equal(f.row().create_admission_state, 'MATERIALIZED');
});

test('lost answers are resolved by the owner readback with still one worker (positive recovery)', async (t) => {
  await t.test('admission CAS answer lost after apply', async (t) => {
    const f = await createFixture(t);
    const hooked = hookedGateway(f);
    hooked.on('ADMITTED', {loseAnswer: true});
    const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED,
      'the applied admission is adopted by exact readback');
    await settle();
    assert.equal(creates(), 1);
  });
  await t.test('MATERIALIZED answer lost after apply, then the INITIATED answer lost', async (t) => {
    const f = await createFixture(t);
    const hooked = hookedGateway(f);
    hooked.on('MATERIALIZED', {loseAnswer: true});
    const {creates, send} = createHandler(t, f, {gateway: hooked.gateway});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    await settle();
    assert.equal((await send(createPayload(f))).status, STATUS.IN_PROGRESS,
      'the redelivered CREATE finds the admission already materialized');
    await settle();
    assert.equal(creates(), 1);
  });
});

test('process loss around admission: the restarted handler starts no second worker and retains the debt', async (t) => {
  await t.test('lost after the admission CAS, before MATERIALIZED', async (t) => {
    const f = await createFixture(t);
    const hooked = hookedGateway(f);
    hooked.on('MATERIALIZED', {drop: true});
    const old = createHandler(t, f, {gateway: hooked.gateway});
    await old.send(createPayload(f));
    assert.equal(f.row().create_admission_state, 'ADMITTED');
    old.handler.shutdown();
    replaceBoot(f, 2);
    const restarted = createHandler(t, f, {bootIncarnation: 2});
    const response = await restarted.send(createPayload(f));
    await settle();
    assert.equal(response.status, STATUS.IN_PROGRESS, JSON.stringify(response));
    assert.equal(response.reason, REFUSAL.ADMISSION_RETAINED,
      'an older boot\'s admission is retained for its recovery owner');
    assert.equal(old.creates() + restarted.creates(), 0);
    assert.equal(f.row().create_admission_state, 'ADMITTED');
    assert.equal(f.row().create_admission_owner_incarnation, 1);
    assertDebtRetained(f);
  });
  await t.test('lost while the admitted worker is creating', async (t) => {
    const f = await createFixture(t);
    const old = createHandler(t, f, {blockCreate: true});
    assert.equal((await old.send(createPayload(f))).status, STATUS.INITIATED);
    await settle();
    assert.equal(old.creates(), 1);
    old.handler.shutdown();
    replaceBoot(f, 2);
    const restarted = createHandler(t, f, {bootIncarnation: 2});
    const response = await restarted.send(createPayload(f));
    await settle();
    assert.equal(response.status, STATUS.IN_PROGRESS);
    assert.equal(response.reason, REFUSAL.ADMISSION_RETAINED);
    assert.equal(old.creates() + restarted.creates(), 1, 'no second worker');
    assert.equal(f.row().create_admission_state, 'MATERIALIZED');
    assertDebtRetained(f);
  });
});

test('a failing physical create reports the existing failed outcome and starts no second worker', async (t) => {
  const f = await createFixture(t);
  const {creates, send, outcomes, handler} = createHandler(t, f, {failCreate: true});
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  await settle();
  assert.equal(creates(), 1);
  assert.deepEqual(outcomes.map(([type, operationId]) => [type, operationId]),
    [['MESSAGE_GROUP_CREATE_FAILED', O]], 'the coordinator learns the failure once');
  assert.equal(handler.getReplicaCreateAdmissionOwner().activePhysicalWorkerOperationIds.has(O),
    false, 'the failed worker released its claim');
  assert.equal(f.row().create_admission_state, 'MATERIALIZED',
    'failure progression and attempt rotation belong to a later slice');
  assert.equal((await send(createPayload(f))).status, STATUS.IN_PROGRESS);
  await settle();
  assert.equal(creates(), 1, 'a redelivery does not start a second worker');
  assertDebtRetained(f);
});

test('unavailable learner authority defers, then the same CREATE recovers once (positive recovery)', async (t) => {
  const f = await createFixture(t);
  const {creates, send} = createHandler(t, f);
  f.failReads('replica_operations');
  const deferred = await send(createPayload(f));
  assertRefused(deferred, REFUSAL.FACT_UNAVAILABLE, 'an unreadable row is not absence');
  assert.equal(deferred.deferRetry, true);
  f.failReads(null);
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  await settle();
  assert.equal(creates(), 1);
  assert.equal(f.row().create_admission_workflow_updated_at, SENDING_AT);
  assert.ok(f.row().create_admission_replica_created_at >= NOW);
  assert.equal(f.row().target_node_id, SUCCESSOR);
});
