import {test} from '../../src/test-helpers/tap.js';
import {SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX} from '../../src/partition/split-ack-constants.js';
import {PARTITION_TRANSITION_STATE} from '../../src/partition/partition-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {buildMergeWorkflow} from './managed-merge-workflow-test-helpers.js';
import {openDescriptorRecordStore, parsePartitionTransition, readAuthoritativelyFrom} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const SIBLING = 'users-p3';
const NO_TIMERS = {setTimeout: () => null, clearTimeout() {}};

test('a lost sibling restore reply is owned through restart with no child descriptors', async (t) => {
  const store = await openDescriptorRecordStore(t, {partitions: [
    {partition_id: SOURCE, partition_key_end: 'z'}, {partition_id: SIBLING, partition_key_start: 'z'},
  ]});
  let now = 1000;
  const options = (name) => ({
    workflowOwnerId: name, cdcIntegrationService: store.cdcFor(name), now: () => now,
    getTableInfo: () => store.tablesRow(), listTableInfos: () => [store.tablesRow()],
    getPartitionInfo: store.partitionRow, listTablePartitionRows: () => store.partitionIds().map(store.partitionRow),
    topologyAdapter: null, parsePartitionTransition, groupRetirementScheduler: NO_TIMERS,
    groupRetirementLeaseScheduler: NO_TIMERS,
  });
  function split(name) {
    const {workflow} = buildWorkflow({...options(name), buildManagedSplitPlan: async () => ({
      medianKey: 'm', leftPartition: {partitionId: 'users-p-left', keyRange: {start: null, end: 'm'}},
      rightPartition: {partitionId: 'users-p-right', keyRange: {start: 'm', end: 'z'}},
    })});
    readAuthoritativelyFrom(workflow, store);
    workflow.readCommittedGroupMembers = async () => ['r1'];
    workflow.listPartitionServiceRows = (partitionId) => [{partition_id: partitionId, replica_id: 'r1', node_id: 'n1'}];
    workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
    return workflow;
  }
  const original = split('original');
  const {workflowId} = await original.execute(SOURCE);
  const {workflowAttempt, workflowFenceToken, targetPartitionIds} = store.metadata();
  const send = (status) => original.acknowledgeSourceParticipant(workflowId, {
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION, status, attempt: workflowAttempt,
    fenceToken: workflowFenceToken, acknowledgedAt: now});
  const promote = original.promoteSiblingPartitionVersion.bind(original);
  original.promoteSiblingPartitionVersion = async (workflow, subject) => {
    t.same(store.metadata().splitIssuedSiblings, [subject], 'TABLES contains the preimage before the first promotion');
    const answer = await promote(workflow, subject);
    t.equal(store.partitionRow(SIBLING).partition_version, subject.targetVersion);
    // The source reports a real cutover failure before TABLES promotes its
    // epoch. This accepted ACK dispatches the ordinary abort on its owner lane.
    t.equal((await send(SPLIT_ACK_STATUS.CUTOVER_FAILED)).result, 'accepted');
    return answer;
  };

  let submitted = false;
  const allowFinal = Promise.withResolvers();
  t.teardown(() => allowFinal.resolve());
  const finalize = original.finalizeAbortedSplitSibling.bind(original);
  original.finalizeAbortedSplitSibling = async (...args) => {
    submitted = true;
    await allowFinal.promise;
    return finalize(...args);
  };
  let firstReceipt;
  const acknowledge = original.acknowledgeAbortedSplitDescriptor.bind(original);
  original.acknowledgeAbortedSplitDescriptor = async (workflow, id, answer) => {
    if (id !== SIBLING) return acknowledge(workflow, id, answer);
    firstReceipt = answer;
    throw new Error('original receiver answer lost before TABLES checkpoint');
  };
  t.equal((await send(SPLIT_ACK_STATUS.SNAPSHOT_STARTED)).result, 'accepted');
  await send(SPLIT_ACK_STATUS.CATCHUP_READY);
  if (!await store.waitFor(() => submitted)) throw new Error('split did not reach sibling cleanup: ' +
    JSON.stringify({record: store.tablesRow(), sibling: store.partitionRow(SIBLING)}));
  t.equal(store.tablesRow().partition_transition_state, PARTITION_TRANSITION_STATE.FAILED);
  t.same(targetPartitionIds.map(store.partitionRow), [null, null]);
  t.same(store.metadata().splitDescriptorCleanup.pendingChildren, []);
  t.same(store.metadata().splitDescriptorCleanup.pendingSiblings, [SIBLING]);
  const merge = buildMergeWorkflow(options('merge')).workflow;
  readAuthoritativelyFrom(merge, store);
  const mergePair = {leftPartitionId: SOURCE, rightPartitionId: SIBLING};
  const before = await merge.execute(mergePair);
  t.equal(before.reason, 'split-descriptor-cleanup-pending', 'MERGE cannot replace the manifest before destination finalization');
  allowFinal.resolve();
  if (!await store.waitFor(() => firstReceipt?.splitDescriptorReceipt.disposition === 'restored')) throw new Error('no committed sibling restore');
  await original.settleSplitOwnerLaneForWorkflow(workflowId);
  t.equal(store.partitionRow(SIBLING).partition_version, 1);
  t.same(store.metadata().splitDescriptorCleanup.pendingSiblings, [SIBLING]);
  t.equal((await merge.execute(mergePair)).reason, 'split-descriptor-cleanup-pending',
    'the descriptor has been restored, but TABLES still owns its missing receipt');
  const positiveRestores = () => store.writes.filter((w) => /^UPDATE partitions /u.test(w.sql) &&
    w.params.includes(SIBLING) && w.params[0] === 1 && w.changes === 1).length;
  t.equal(positiveRestores(), 1);
  now = store.metadata().workflowLeaseExpiresAt + 1;
  const recovered = split('new-holder');
  let replay;
  const checkpoint = recovered.acknowledgeAbortedSplitDescriptor.bind(recovered);
  recovered.acknowledgeAbortedSplitDescriptor = async (record, id, answer) => {
    if (id === SIBLING) replay = answer;
    return checkpoint(record, id, answer);
  };
  if (!await store.waitFor(() => store.metadata().splitDescriptorCleanup.pendingSiblings.length === 0)) {
    throw new Error('startup failed to redrive isolated sibling: ' + JSON.stringify(store.metadata()));
  }
  t.ok(store.metadata().workflowFenceToken > workflowFenceToken);
  t.same(store.metadata().splitDescriptorCleanup.receipts.find((receipt) => receipt.partitionId === SIBLING), firstReceipt.splitDescriptorReceipt);
  t.same([replay?.logIndex, replay?.term, replay?.splitDescriptorReceipt],
    [firstReceipt.logIndex, firstReceipt.term, firstReceipt.splitDescriptorReceipt],
    'the destination returned its original committed position on lease takeover');
  t.equal(positiveRestores(), 1, 'the second holder recovered the original committed receipt');
  now = store.metadata().workflowLeaseExpiresAt + 1;
  const successor = await merge.execute(mergePair);
  t.ok(successor.success, JSON.stringify(successor));
  t.ok(store.metadata().workflowAttempt > workflowAttempt);
});
