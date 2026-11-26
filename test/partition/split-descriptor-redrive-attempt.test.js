import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {RESUME_TRIGGER} from '../../src/partition/group-retirement-resume.js';
import {PARTITION_TRANSITION_STATE} from '../../src/partition/partition-constants.js';
import {SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX} from '../../src/partition/split-ack-constants.js';
import {RECORD_CHANGE_REFUSAL} from '../../src/partition/managed-workflow-record-changes.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  openDescriptorRecordStore, parsePartitionTransition, readAuthoritativelyFrom,
} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';

// Only callbacks the production owner actually armed can run. Retry timers
// and lease renewals have separate schedulers, as in the runtime constructor.
function timers() {
  const pending = new Set();
  return {
    pending,
    setTimeout(callback, delay) {
      const timer = {callback, delay};
      pending.add(timer);
      return timer;
    },
    clearTimeout(timer) { pending.delete(timer); },
    fireOnly() {
      assert.equal(pending.size, 1, 'one pending timer on this scheduler');
      const [timer] = pending;
      pending.delete(timer);
      timer.callback();
    },
  };
}

function buildOwner(store, name, clock, retry, lease, start) {
  const {workflow} = buildWorkflow({
    workflowOwnerId: name, now: () => clock.now,
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: store.tablesRow, listTableInfos: () => [store.tablesRow()],
    getPartitionInfo: store.partitionRow,
    listTablePartitionRows: () => store.partitionIds().map(store.partitionRow),
    parsePartitionTransition, groupRetirementScheduler: retry,
    groupRetirementLeaseScheduler: lease, startSplitReplicationOnSourcePartition: start,
    listPartitionServiceRows: (id) => [{partition_id: id, replica_id: id + '-r1', node_id: 'n1'}],
    readCommittedGroupMembers: async (id) => [id + '-r1'],
    deliverReplicaRemoval: async () => ({status: 'completed'}),
  });
  readAuthoritativelyFrom(workflow, store);
  return workflow;
}

test('a delayed split retirement on P leaves the reused child, retry and lease of its successor with P', async (t) => {
  const store = await openDescriptorRecordStore(t, {partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const expireLease = () => { clock.now = store.metadata().workflowLeaseExpiresAt + 1; };
  const until = async (predicate, message) => assert.ok(await store.waitFor(predicate),
    message + ' ' + JSON.stringify(store.metadata()));
  let refuseStart = false;
  const refused = new Error('source declined the successor START');
  const q = buildOwner(store, 'Q', clock, timers(), timers(), async () => {
    if (refuseStart) throw refused;
  });
  const {workflowId, targetPartitionIds} = await q.execute(SOURCE);
  const [child, peer] = targetPartitionIds;
  assert.equal(targetPartitionIds.length, 2);
  const first = store.metadata();

  // Delay Q after its FAILED decision but before it lists the children. Its
  // ordinary ownership resume can subsequently finish the still-pending peer.
  const allowQ = Promise.withResolvers();
  const allowReceipt = Promise.withResolvers();
  const allowRenewal = Promise.withResolvers();
  t.teardown(() => {
    allowQ.resolve();
    allowReceipt.resolve();
    allowRenewal.resolve();
  });
  const teardownQ = q.teardownAbortedSplitChildren.bind(q);
  let qWaiting = false;
  q.teardownAbortedSplitChildren = async (...args) => {
    if (!qWaiting) {
      qWaiting = true;
      await allowQ.promise;
    }
    return teardownQ(...args);
  };
  const failure = await q.acknowledgeSourceParticipant(workflowId, {
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION, status: SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
    attempt: first.workflowAttempt, fenceToken: first.workflowFenceToken, acknowledgedAt: clock.now,
  });
  assert.equal(failure.result, 'accepted');
  await until(() => qWaiting, 'Q did not enter cleanup after its committed source failure');
  assert.equal(store.tablesRow().partition_transition_state, PARTITION_TRANSITION_STATE.FAILED);
  assert.deepEqual(store.metadata().splitDescriptorCleanup.pendingChildren, targetPartitionIds);

  expireLease();
  const retry = timers();
  const lease = timers();
  const p = buildOwner(store, 'P', clock, retry, lease);
  const teardown = p.teardownAbortedSplitChild.bind(p);
  const peerPasses = [];
  p.teardownAbortedSplitChild = (id, record, partitionId) => {
    if (partitionId === peer) peerPasses.push([record.metadata.workflowAttempt, record.fenceToken]);
    return teardown(id, record, partitionId);
  };
  const finalizer = p.finalizeAbortedSplitChild.bind(p);
  const calls = [];
  let allowSuccessor = false;
  p.finalizeAbortedSplitChild = async (record, id) => {
    const attempt = record.metadata.workflowAttempt;
    if (id === child) {
      calls.push(attempt);
      if (calls.length === 1 || (attempt !== first.workflowAttempt && !allowSuccessor)) {
        throw new Error('child destination unavailable at submission');
      }
    }
    return finalizer(record, id);
  };
  let held;
  const acknowledge = p.acknowledgeAbortedSplitDescriptor.bind(p);
  p.acknowledgeAbortedSplitDescriptor = async (record, id, result) => {
    const answer = await acknowledge(record, id, result);
    if (id === child && result.splitDescriptorReceipt.workflowAttempt === first.workflowAttempt) {
      held = result;
      await allowReceipt.promise;
    }
    return answer;
  };
  await until(() => held, 'P did not checkpoint the first child on its immediate retry');
  const pFirst = store.metadata();
  assert.deepEqual(calls, [first.workflowAttempt, first.workflowAttempt]);
  assert.equal(pFirst.workflowOwnerId, 'P');
  assert.ok(pFirst.workflowFenceToken > first.workflowFenceToken);
  assert.deepEqual(pFirst.splitDescriptorCleanup.pendingChildren, [peer]);
  assert.deepEqual(pFirst.splitDescriptorCleanup.receipts, [held.splitDescriptorReceipt]);
  assert.equal(held.splitDescriptorReceipt.disposition, 'deleted');

  // A renewal already dispatched by N can reach TABLES after P has obtained
  // a new live fence. Let the ordinary claim evaluate at that later turn.
  const coordinator = p.workflowCoordinator;
  const claim = coordinator.claimWorkflow.bind(coordinator);
  let oldRequest;
  let oldAnswer;
  coordinator.claimWorkflow = async (id, options) => {
    if (!oldRequest && options?.renew === true) {
      oldRequest = {id, options};
      await allowRenewal.promise;
      oldAnswer = await claim(id, options);
      return oldAnswer;
    }
    return claim(id, options);
  };
  lease.fireOnly();
  await until(() => oldRequest, 'the original renewal did not reach the claim boundary');

  expireLease();
  await q.resumeGroupRetirement(store.tablesRow(), RESUME_TRIGGER.RECORD_CHANGED);
  const qFirst = store.metadata();
  assert.equal(qFirst.workflowOwnerId, 'Q');
  assert.ok(qFirst.workflowFenceToken > pFirst.workflowFenceToken);
  assert.deepEqual(qFirst.splitDescriptorCleanup.pendingChildren, []);
  assert.deepEqual(qFirst.splitDescriptorCleanup.receipts.map((r) => [r.partitionId, r.workflowAttempt, r.disposition]),
    targetPartitionIds.map((id) => [id, first.workflowAttempt, 'deleted']));
  allowQ.resolve();
  await q.settleSplitOwnerLaneForWorkflow(workflowId);

  refuseStart = true;
  await assert.rejects(q.execute(SOURCE), (error) => error === refused);
  const successor = store.metadata();
  assert.equal(successor.workflowId, workflowId);
  assert.equal(successor.workflowOwnerId, 'Q');
  assert.ok(successor.workflowAttempt > first.workflowAttempt);
  assert.ok(successor.workflowFenceToken > qFirst.workflowFenceToken);
  assert.equal(store.tablesRow().partition_transition_state, PARTITION_TRANSITION_STATE.FAILED);
  assert.deepEqual(successor.splitDescriptorCleanup.pendingChildren, targetPartitionIds);
  assert.deepEqual(targetPartitionIds.map((id) => store.partitionRow(id).split_descriptor_attempt),
    targetPartitionIds.map(() => successor.workflowAttempt));

  // This is P's only notification of the successor. Its original owner-start
  // resume and child exclusive are both still waiting on the first receipt.
  expireLease();
  const resumed = p.resumeGroupRetirement(store.tablesRow(), RESUME_TRIGGER.RECORD_CHANGED);
  await until(() => retry.pending.size === 1 && store.metadata().splitDescriptorCleanup.pendingChildren.length === 1,
    'P never armed the successor fallback and retired its peer while the original resume was held');
  await resumed;
  const waiting = store.metadata();
  assert.equal(waiting.workflowOwnerId, 'P');
  assert.ok(waiting.workflowFenceToken > successor.workflowFenceToken);
  assert.deepEqual(waiting.splitDescriptorCleanup.pendingChildren, [child]);
  assert.deepEqual(calls.slice(2), [successor.workflowAttempt, successor.workflowAttempt],
    'ordinary first submission and immediate retry both reached the successor destination');
  const [fallback] = retry.pending;
  const [renewal] = lease.pending;
  assert.ok(renewal);
  const live = coordinator.getWorkflowById(workflowId);
  assert.equal(live.metadata.workflowAttempt, successor.workflowAttempt);
  const savedRow = store.tablesRow();
  const savedLineage = p.workflowRecordLineages.get(workflowId);
  assert.equal(savedLineage.partition_transition_generation, savedRow.partition_transition_generation);

  allowRenewal.resolve();
  await until(() => oldAnswer, 'the delayed renewal did not return');
  assert.equal(oldRequest.id, workflowId);
  assert.equal(oldRequest.options.attempt, first.workflowAttempt);
  assert.equal(oldAnswer.accepted, false);
  assert.equal(oldAnswer.result, RECORD_CHANGE_REFUSAL.ATTEMPT_MISMATCH);
  assert.deepEqual(store.tablesRow(), savedRow, 'the delayed renewal made no change to the successor');
  assert.deepEqual([...lease.pending], [renewal], 'the refused renewal did not rearm N');
  assert.ok(p.groupRetirementRedrive.isDriving(workflowId, first.workflowAttempt),
    'the first child exclusive still awaits the committed answer');
  allowReceipt.resolve();
  await until(() => peerPasses.length === 2 && !p.groupRetirementRedrive.isDriving(workflowId, first.workflowAttempt),
    'P did not finish its original pass after the delayed TABLES answer');
  assert.deepEqual(peerPasses, [[successor.workflowAttempt, waiting.workflowFenceToken],
    [first.workflowAttempt, pFirst.workflowFenceToken]], 'the delayed pass kept its original subject and fence');
  assert.deepEqual(store.tablesRow(), savedRow, 'late completion of N wrote no progress for its successor');
  assert.equal(coordinator.getWorkflowById(workflowId), live, 'P retained its successor projection');
  assert.deepEqual(p.workflowRecordLineages.get(workflowId), savedLineage, 'P retained its acknowledged record');
  assert.ok(p.groupRetirementRedrive.isDriving(workflowId, successor.workflowAttempt));
  assert.ok(retry.pending.has(fallback));
  assert.ok(lease.pending.has(renewal));

  clock.now += renewal.delay;
  lease.fireOnly();
  await until(() => store.metadata().workflowLeaseExpiresAt > waiting.workflowLeaseExpiresAt,
    'the successor lease did not renew while the descriptor was outstanding');
  assert.equal(store.metadata().workflowFenceToken, waiting.workflowFenceToken);
  assert.deepEqual(store.metadata().splitDescriptorCleanup.pendingChildren, [child]);
  allowSuccessor = true;
  retry.fireOnly();
  await until(() => !p.groupRetirementRedrive.isDriving(workflowId, successor.workflowAttempt) &&
    store.metadata().splitDescriptorCleanup.pendingChildren.length === 0, 'quiet successor lost its retry');
  const completed = store.metadata();
  assert.equal(completed.workflowOwnerId, 'P');
  assert.deepEqual(completed.splitDescriptorCleanup.receipts.map((r) =>
    [r.partitionId, r.workflowAttempt, r.disposition]),
    [peer, child].map((id) => [id, successor.workflowAttempt, 'deleted']));
  assert.deepEqual(calls.slice(2), Array(3).fill(successor.workflowAttempt));
  assert.deepEqual(targetPartitionIds.map(store.partitionRow), [null, null]);
  assert.equal(retry.pending.size, 0);
  assert.equal(lease.pending.size, 0);
  t.pass('the successor consumed its own PARTITIONS receipt and released its timers');
});
