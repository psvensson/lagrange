// Completion consumers over actual native groups and registered handlers.
// These controls do not reproduce F1's late-vote permutation. They separate
// real transfer acceptance from the downstream owner's actual observation.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nativeFixture, INSERT_SQL} from '../../partition/participant-release-tx1-native-fixture.js';
import {PARTITION_SERVICE_OPERATION} from '../../../src/partition/partition-service-constants.js';
import {buildPartitionWriteEntry} from '../../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME as CORE, RAFT_LEADERSHIP_TRANSFER_REASON} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE as NATIVE, RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {ReplicaOperationMessageType as MESSAGE, ReplicaOperationReason as REASON,
  ReplicaOperationResponseStatus as STATUS} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {readReplaceHandoffAttempt,
  REPLACE_HANDOFF_ANSWER_CLASS as ANSWER} from
  '../../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../../src/rebalancer/operation-workflow-owner-shared.js';
import {applyUserTableLeaderPlacementCure,
  USER_TABLE_LEADER_PLACEMENT_CURE_STATE as CURE} from
  '../../../src/rebalancer/user-table-leader-placement-cure.js';
import {PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_CUTOVER_OUTCOME as RELEASE} from
  '../../../src/partition/partition-participant-transaction-cutover-constants.js';
import {traceConsumer, trackAnswer, holdNativeDeliveries,
  durableConsumerView, observeConsumerDeliveries} from
  './runtime-completion-consumers-fixture.js';
import {requestHandoff, replaceConsumerContext, nativeCureFixture,
  refreshCureProjection, cureContext} from
  './runtime-completion-consumers-transfer-fixture.js';

const TIMEOUT_MS = 40000;
const {REMOVE_SAFETY_EVALUATION_CLASSIFICATION: SAFETY} = OPERATION_WORKFLOW_OWNER_SHARED;

function nativeMessage(partitionId, type) {
  return (_, packet) => packet?.protocol === RAFT_RS_TRANSPORT_PROTOCOL &&
    packet.groupId === partitionId && packet.message?.msgType === type;
}

// Passive owner projections plus durable rows only. readStatus() is not an
// observer here: when input is queued it may schedule another runtime turn.
// The role is diagnostic lifecycle state, never a removal/reopen authority.
function statuses(services) {
  return services.map((service) => ({replicaId: service.replicaId,
    observedRole: service.role, observedLeaderId: service.leaderId,
    durable: durableConsumerView(service)}));
}

test('actual REPLACE handoff evaluator defers after acceptance until its target witness observes leadership',
  {timeout: TIMEOUT_MS}, async (t) => {
    const f = await nativeFixture(t);
    f.group.services.forEach((service) => service.raft.stopScheduling());
    const target = f.group.services.find((service) => service !== f.leader);
    const {owner, operation} = replaceConsumerContext(f.leader, target);
    const before = statuses(f.group.services);
    const observer = observeConsumerDeliveries(f.leader.transport, (_, packet) =>
      packet?.type === MESSAGE.READ_REPLICA_MEMBERSHIP ||
      packet?.type === MESSAGE.STEP_DOWN_REPLICA);
    const initial = await owner.evaluateReplaceNamedHandoffSafety(operation);
    assert.equal(initial.classification, SAFETY.DEFER);
    assert.equal(initial.handoffRequest.requestReplicaId, target.replicaId);
    // Park the source in its real Ready send. The follower's named transfer
    // can still be accepted into the source's inbound queue. This supplies a
    // deterministic acceptance/completion gap without a fabricated response.
    const gate = holdNativeDeliveries(f.leader.transport,
      nativeMessage(f.leader.partitionId, NATIVE.APPEND));
    const entry = buildPartitionWriteEntry({type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: INSERT_SQL, params: ['handoff-park', 'handoff-park'],
      entryId: 'runtime-consumer-handoff-park'},
    {proposedBy: f.leader.replicaId, proposedAt: f.leader.timeSource.now()});
    const parked = trackAnswer(f.leader.applyWrite(entry));
    try {
      assert.equal(await f.group.waitFor(() => gate.records.length > 0), true,
        'seam: source Ready is waiting on a real outbound Append');
      const accepted = await owner.dispatchRemoveSafetyHandoffRequest(operation,
        initial.handoffRequest);
      assert.equal(accepted.status, STATUS.COMPLETED, JSON.stringify(accepted));
      assert.equal(accepted.handoffTransfer?.outcome, CORE.CORE_OK);
      assert.equal(accepted.handoffTransfer.reason,
        RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED);
      assert.equal(readReplaceHandoffAttempt(owner, operation.operationId).answerClass,
        ANSWER.ACCEPTED);
      assert.notEqual(target.role, RAFT_ROLE.LEADER);
      // The actual production evaluator reads its target's native membership,
      // not the separate majority-corroborated terminal completion owner.
      const waiting = await owner.evaluateReplaceNamedHandoffSafety(operation);
      traceConsumer(t, 'replace-accepted-without-safety', {before, initial, accepted,
        waiting, attempt: readReplaceHandoffAttempt(owner, operation.operationId),
        status: statuses(f.group.services), requests: observer.evidence(),
        held: gate.evidence()});
      assert.equal(waiting.classification, SAFETY.DEFER,
        'actual consumer does not authorize removal from the accepted receipt');
      assert.equal(waiting.handoffRequest, null,
        'unresolved accepted attempt does not dispatch another transfer');
      assert.ok(observer.records.filter(({packet}) =>
        packet.type === MESSAGE.READ_REPLICA_MEMBERSHIP).every(({packet}) =>
        packet.replicaId === target.replicaId),
      'production handoff consumer reads its target witness');
      gate.release();
      assert.equal((await parked.promise).success, true);
      assert.equal(await f.group.waitFor(() =>
        target.raft.readStatus().role === RAFT_ROLE.LEADER), true,
      'post-measurement: actual native transfer elects the named target');
      const current = await owner.evaluateReplaceNamedHandoffSafety(operation);
      traceConsumer(t, 'replace-fresh-safety', {current,
        status: statuses(f.group.services), requests: observer.evidence()});
      assert.equal(current.classification, SAFETY.SAFE);
      assert.equal(current.handoffRequest, null);
      assert.ok(BigInt(durableConsumerView(target).term) >
        BigInt(before.find((view) => view.replicaId === target.replicaId).durable.term));
      // This calls the actual production removal-safety consumer and dispatch
      // owners, not a durable REPLACE workflow or its source-removal effect.
      assert.equal(f.leader.isShutdown, false);
    } finally {
      await gate.restore();
      await parked.promise.catch(() => undefined);
      observer.restore();
    }
  });

test('paused participant admission stays closed through accepted transfer and reopens only through a later real release',
  {timeout: TIMEOUT_MS}, async (t) => {
    const f = await nativeFixture(t);
    await f.pause();
    f.group.services.forEach((service) => service.raft.stopScheduling());
    const target = f.group.services.find((service) => service !== f.leader);
    const before = statuses(f.group.services);
    const gate = holdNativeDeliveries(f.leader.transport,
      nativeMessage(f.leader.partitionId, NATIVE.REQUEST_VOTE_RESPONSE));
    try {
      const accepted = await requestHandoff(target,
        {operationId: 'runtime-consumer-participant-transfer'});
      assert.equal(accepted.handoffTransfer?.outcome, CORE.CORE_OK,
        JSON.stringify(accepted));
      assert.equal(await f.group.waitFor(() => gate.records.length >= 2), true,
        'seam: actual target campaign is waiting on both native voter replies');
      assert.notEqual(target.role, RAFT_ROLE.LEADER);
      assert.ok(f.views().every((view) => view.admission.state === ADMISSION.CLOSED));
      traceConsumer(t, 'participant-transfer-accepted-closed', {before, accepted,
        held: gate.evidence(), admission: f.views()});
      gate.release();
      assert.equal(await f.group.waitFor(() =>
        target.raft.readStatus().role === RAFT_ROLE.LEADER), true);
      assert.ok(f.views().every((view) => view.admission.state === ADMISSION.CLOSED),
        'native transfer completion itself does not reopen admission');
      const released = await f.owners.release(f.leader.partitionId);
      traceConsumer(t, 'participant-after-fresh-release', {released,
        status: statuses(f.group.services), admission: f.views(), held: gate.evidence()});
      assert.equal(released.outcome, RELEASE.CUT_OVER);
      assert.ok(f.views().every((view) => view.admission.state === ADMISSION.OPEN));
      assert.ok(BigInt(durableConsumerView(target).term) > BigInt(before[0].durable.term));
      // Current native connections are stamped clean. The historical
      // reopenCohort servedLegacy=true branch is not exercised by this test.
    } finally {
      await gate.restore();
    }
  });

test('actual D2 placement cure reports dispatch while the election is incomplete and later native census observes spread',
  {timeout: TIMEOUT_MS}, async (t) => {
    const f = await nativeCureFixture(t);
    const anchor = f.groups[0].services[0];
    const refused = await requestHandoff(anchor, {operationId: 'runtime-consumer-rf1-refusal',
      reason: REASON.REPLACE_SOURCE_LEADER_HANDOFF});
    assert.equal(refused.status, STATUS.ERROR, JSON.stringify(refused));
    assert.equal(refused.handoffTransfer?.outcome, CORE.CORE_REFUSED);
    assert.equal(refused.handoffTransfer.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.NO_ELIGIBLE_SUCCESSOR);
    assert.equal(anchor.raft.readStatus().role, RAFT_ROLE.LEADER);
    const first = await applyUserTableLeaderPlacementCure(f.context);
    assert.equal(first.state, CURE.CENSUS_UNSTABLE);
    const observer = observeConsumerDeliveries(f.transport, (_, packet) =>
      packet?.type === MESSAGE.STEP_DOWN_REPLICA);
    const gate = holdNativeDeliveries(f.transport,
      nativeMessage(f.source.partitionId, NATIVE.REQUEST_VOTE_RESPONSE));
    try {
      const dispatched = await applyUserTableLeaderPlacementCure(f.context);
      assert.equal(dispatched.state, CURE.DISPATCH_HANDOFF);
      assert.equal(await f.groups[1].waitFor(() => gate.records.length >= 2), true,
        'seam: actual cure-triggered election awaits both real voter replies');
      assert.equal(observer.records.length, 2, 'actual cure dispatches its two existing legs');
      assert.equal(observer.records[0].delivery.answer?.handoffTransfer?.outcome,
        CORE.CORE_OK, 'source transfer was actually accepted');
      const target = f.groups[1].services.find((service) =>
        service.replicaId === dispatched.target.replicaId);
      assert.ok(target);
      assert.notEqual(target.role, RAFT_ROLE.LEADER);
      traceConsumer(t, 'd2-dispatch-not-completion', {refused, first, dispatched,
        requests: observer.evidence(), held: gate.evidence(),
        status: statuses(f.groups[1].services)});
      gate.release();
      assert.equal(await f.groups[1].waitFor(() => f.groups[1].services.some((service) =>
        service.nodeId !== f.source.nodeId &&
        service.raft.readStatus().role === RAFT_ROLE.LEADER)), true,
      'real election moves leadership to another eligible host');
      refreshCureProjection(f.groups, f.cache);
      const leader = f.groups[1].services.find((service) =>
        service.raft.readStatus().role === RAFT_ROLE.LEADER);
      const observed = await applyUserTableLeaderPlacementCure(cureContext(leader, f.cache));
      traceConsumer(t, 'd2-fresh-spread-observation', {observed,
        status: statuses(f.groups[1].services), requests: observer.evidence()});
      assert.equal(observed.state, CURE.SPREAD_SATISFIED);
      assert.equal(observer.records.length, 2, 'fresh spread does not dispatch another handoff');
    } finally {
      await gate.restore();
      observer.restore();
    }
  });
