import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {buildFreshSplitChildPair} from '../../src/partition/managed-split-child-descriptor.js';
import {CHILD_DESCRIPTOR_DISPOSITION, buildChildFinalizeIntent, buildChildTransferIntent, childDescriptorMutation}
  from '../../src/partition/partition-child-descriptor-effect.js';
import {SPLIT_DESCRIPTOR_ERROR, SPLIT_DESCRIPTOR_FINALIZE_SQL, buildRecipientChildForward, splitDescriptorStatement,
  splitDescriptorWriteKey} from '../../src/partition/partition-split-descriptor-command.js';
import {SIBLING_DESCRIPTOR_ACTION, siblingDescriptorMutation} from
  '../../src/partition/partition-sibling-descriptor-effect.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {selectRows, withSurface} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.PARTITIONS;
const CHILD = 'invoices-child';
const TABLE_ID = 'tbl-invoices';
const WORKFLOW_ID = 'split-invoices';

function freshChild(workflowAttempt) {
  const [child] = buildFreshSplitChildPair({
    workflow: {tableId: TABLE_ID, workflowId: WORKFLOW_ID, metadata: {workflowAttempt}},
    splitPlan: {
      leftPartition: {partitionId: CHILD, keyRange: {start: null, end: 'm'}},
      rightPartition: {partitionId: 'invoices-right', keyRange: {start: 'm', end: null}},
    },
    partitionInfo: {partition_key_type: 'TEXT'}, tableName: 'invoices',
    targetVersion: 2, replicaCount: 3, timestamp: 1002,
  });
  return child;
}

function submitChild(gateway, intent) {
  return gateway.submitMutation(childDescriptorMutation(intent), {splitDescriptorIntent: intent});
}

test('gateway remote DELETE retains the committed split descriptor receipt across a same-ID successor',
  {timeout: 120000}, async () => {
    await withSurface([TABLE], async ({gateway, deliveries, messageRouter, of}) => {
      const {dbPath, partitionId} = of(TABLE);
      const child = () => selectRows(dbPath,
        'SELECT * FROM partitions WHERE partition_id = ?', [CHILD]);
      const create = freshChild(1);
      const first = buildChildFinalizeIntent(create);
      const created = await submitChild(gateway, create);
      assert.equal(created.success, true, created.error);
      const [{rowid}] = selectRows(dbPath, 'SELECT rowid FROM partitions WHERE partition_id = ?', [CHILD]);
      assert.ok(Number.isSafeInteger(rowid) && rowid > 0);
      const acquired = {...create, disposition: CHILD_DESCRIPTOR_DISPOSITION.ACQUIRED};
      const createReplay = await submitChild(gateway, create);
      assert.equal(createReplay.success, true, createReplay.error);
      for (const {partitionResult} of [created, createReplay]) {
        assert.deepEqual(partitionResult.splitDescriptorReceipt, acquired);
        assert.equal(partitionResult.affectedRows, 1);
        assert.equal(partitionResult.lastInsertRowid, rowid);
        assert.equal(partitionResult.committed, true);
        assert.equal(partitionResult.logIndex, created.partitionResult.logIndex);
        assert.equal(partitionResult.term, created.partitionResult.term);
      }
      const createPackets = deliveries.filter((entry) =>
        entry.entryId === deriveParticipantEntryId(splitDescriptorWriteKey(create), partitionId));
      assert.equal(createPackets.length, 2);
      for (const packet of createPackets) {
        assert.equal(packet.sql, splitDescriptorStatement(create).sql);
        assert.deepEqual(packet.answer.splitDescriptorReceipt, acquired);
        assert.equal(packet.answer.changes, 1);
        assert.equal(packet.answer.lastInsertRowid, rowid);
      }
      const initial = await submitChild(gateway, first);
      assert.equal(initial.success, true, initial.error);
      const answer = initial.partitionResult;
      const receipt = {...first, disposition: CHILD_DESCRIPTOR_DISPOSITION.DELETED};
      assert.deepEqual(answer.splitDescriptorReceipt, receipt);
      assert.equal(answer.committed, true);
      assert.ok(Number.isSafeInteger(answer.logIndex) && answer.logIndex > 0);
      assert.ok(Number.isSafeInteger(answer.term) && answer.term > 0);
      assert.deepEqual(child(), []);

      const successorCreate = freshChild(30);
      const successor = buildChildFinalizeIntent(successorCreate);
      const second = await submitChild(gateway, successorCreate);
      assert.equal(second.success, true, second.error);
      assert.deepEqual(second.partitionResult.splitDescriptorReceipt,
        {...successorCreate, disposition: CHILD_DESCRIPTOR_DISPOSITION.ACQUIRED});
      const successorRows = child();
      assert.equal(successorRows[0].split_descriptor_attempt, successor.workflowAttempt);
      const replay = await submitChild(gateway, first);
      assert.equal(replay.success, true, replay.error);
      assert.deepEqual(replay.partitionResult.splitDescriptorReceipt, receipt);
      assert.equal(replay.partitionResult.logIndex, answer.logIndex);
      assert.equal(replay.partitionResult.term, answer.term);
      assert.deepEqual(child(), successorRows);

      const requests = deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL);
      assert.equal(requests.length, 2);
      const key = splitDescriptorWriteKey(first);
      for (const request of requests) {
        assert.equal(request.entryId, deriveParticipantEntryId(key, partitionId));
        assert.deepEqual(request.answer.splitDescriptorReceipt, receipt);
        assert.equal(request.answer.logIndex, answer.logIndex);
        assert.equal(request.answer.term, answer.term);
      }
      const refused = await gateway.submitMutation(childDescriptorMutation(successor), {splitDescriptorIntent: first});
      assert.equal(refused.errorCode, SPLIT_DESCRIPTOR_ERROR.BYTES);
      assert.deepEqual(child(), successorRows);
      assert.equal(deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL).length, 2);

      const {action, tableId, partitionId: childId, workflowId, workflowAttempt} = first;
      const incomplete = await gateway.submitMutation(childDescriptorMutation(first),
        {splitDescriptorIntent: {action, tableId, partitionId: childId, workflowId, workflowAttempt}});
      assert.equal(incomplete.errorCode, SPLIT_DESCRIPTOR_ERROR.BYTES);
      assert.equal(deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL).length, 2);
      const older = buildChildFinalizeIntent(freshChild(2));
      const stale = await submitChild(gateway, older);
      assert.equal(stale.success, true, stale.error);
      assert.deepEqual(stale.partitionResult.splitDescriptorReceipt,
        {...older, disposition: CHILD_DESCRIPTOR_DISPOSITION.SUPERSEDED});
      assert.deepEqual(child(), successorRows);

      // The handler commits the successor's own deletion, but the response
      // loses its typed receipt. A successful transport and a SQL count alone
      // cannot confirm this cleanup to TABLES.
      const deliver = messageRouter.deliver;
      messageRouter.deliver = async function(address, message) {
        const envelope = await deliver.call(this, address, message);
        if (message.sql !== SPLIT_DESCRIPTOR_FINALIZE_SQL) return envelope;
        const partial = {...deliveryAnswerOf(envelope)};
        delete partial.splitDescriptorReceipt;
        return buildDeliveryEnvelope({acknowledged: true}, partial);
      };
      try {
        const ambiguous = await submitChild(gateway, successor);
        assert.equal(ambiguous.success, false);
        assert.equal(ambiguous.errorCode, SPLIT_DESCRIPTOR_ERROR.RECEIPT);
      } finally {
        messageRouter.deliver = deliver;
      }
      assert.deepEqual(child(), []);
      const originalAnswer = deliveries.at(-1).answer;
      const recovered = await submitChild(gateway, successor);
      assert.equal(recovered.success, true, recovered.error);
      assert.deepEqual(recovered.partitionResult.splitDescriptorReceipt,
        {...successor, disposition: CHILD_DESCRIPTOR_DISPOSITION.DELETED});
      assert.equal(recovered.partitionResult.logIndex, originalAnswer.logIndex);
      assert.equal(recovered.partitionResult.term, originalAnswer.term);
    }, {cdc: true});
  });

test('the remote receiver admits adoption from the retained transfer of the same descriptor',
  {timeout: 120000}, async () => withSurface([TABLE], async ({gateway, of}) => {
    const create = freshChild(1);
    const created = await submitChild(gateway, create);
    assert.equal(created.success, true, created.error);
    const transfer = buildChildTransferIntent(create, {workflowId: WORKFLOW_ID, workflowAttempt: 30});
    const transferred = await submitChild(gateway, transfer);
    assert.equal(transferred.success, true, transferred.error);
    assert.deepEqual(transferred.partitionResult.splitDescriptorReceipt,
      {...transfer, disposition: CHILD_DESCRIPTOR_DISPOSITION.TRANSFERRED});
    const adopt = buildRecipientChildForward(transfer, transferred.partitionResult.splitDescriptorReceipt);
    const adopted = await submitChild(gateway, adopt);
    assert.equal(adopted.success, true, adopted.error);
    assert.deepEqual(adopted.partitionResult.splitDescriptorReceipt,
      {...adopt, disposition: CHILD_DESCRIPTOR_DISPOSITION.ACQUIRED});
    assert.equal(adopted.partitionResult.affectedRows, 1);
    assert.deepEqual(selectRows(of(TABLE).dbPath,
      'SELECT rowid, split_descriptor_attempt FROM partitions WHERE partition_id = ?', [CHILD]),
    [{rowid: created.partitionResult.lastInsertRowid, split_descriptor_attempt: adopt.workflowAttempt}]);
    const finish = buildChildFinalizeIntent(adopt);
    const deleted = await submitChild(gateway, finish);
    assert.equal(deleted.success, true, deleted.error);
    assert.deepEqual(deleted.partitionResult.splitDescriptorReceipt,
      {...finish, disposition: CHILD_DESCRIPTOR_DISPOSITION.DELETED});
  }, {cdc: true}));

test('overlapping sibling finalizations with identical SQL and different plans reach destination collision',
  {timeout: 120000}, async () => withSurface([TABLE], async ({
    gateway, cdcIntegrationService, deliveries, messageRouter, of,
  }) => {
    // This sibling already exists at the active epoch before the split.
    const row = {...freshChild(1).row, split_descriptor_attempt: 0, partition_version: 1};
    assert.equal((await gateway.insertSystemTableRow(TABLE, row)).success, true);
    const a = {action: SIBLING_DESCRIPTOR_ACTION.FINALIZE, tableId: TABLE_ID,
      partitionId: CHILD, workflowId: WORKFLOW_ID, workflowAttempt: 7,
      priorAttempt: 0, priorVersion: 1, targetVersion: 2};
    const b = {...a, priorAttempt: 1};
    assert.equal(splitDescriptorWriteKey(a), splitDescriptorWriteKey(b));
    assert.deepEqual(siblingDescriptorMutation(a), siblingDescriptorMutation(b));
    const committed = Promise.withResolvers();
    const release = Promise.withResolvers();
    let firstReplyHeld = false;
    let collisionArrivedWhileHeld = false;
    const deliver = messageRouter.deliver;
    messageRouter.deliver = async function(address, request) {
      if (request.splitDescriptorIntent?.priorAttempt === b.priorAttempt) {
        collisionArrivedWhileHeld ||= firstReplyHeld;
        release.resolve();
      }
      const envelope = await deliver.call(this, address, request);
      if (request.splitDescriptorIntent?.priorAttempt === a.priorAttempt) {
        firstReplyHeld = true;
        committed.resolve(deliveryAnswerOf(envelope));
        await release.promise;
        firstReplyHeld = false;
      }
      return envelope;
    };
    // If a regression joins the old promise, release it on the observed join
    // so the witness can report the wrong answer without a timer.
    const singleFlight = gateway.runSingleFlight;
    gateway.runSingleFlight = function(map, key, ...rest) {
      if (map.has(key)) release.resolve();
      return singleFlight.call(this, map, key, ...rest);
    };
    const coalesce = cdcIntegrationService.runCoalescedMutation;
    cdcIntegrationService.runCoalescedMutation = function(key, ...rest) {
      if (this.inFlightMutationsByKey.has(key)) release.resolve();
      return coalesce.call(this, key, ...rest);
    };
    const submit = (intent) => gateway.submitMutation(siblingDescriptorMutation(intent),
      {splitDescriptorIntent: intent});
    const first = submit(a);
    try {
      // Propagate setup refusal immediately if the first command never gets
      // to the receiver.
      const observed = await Promise.race([committed.promise, first]);
      assert.deepEqual(observed.splitDescriptorReceipt, {...a, disposition: 'cancelled'});
      await assert.rejects(submit(b), (error) => error.errorCode === SPLIT_DESCRIPTOR_ERROR.COLLISION);
    } finally {
      release.resolve();
      await first;
      messageRouter.deliver = deliver;
      gateway.runSingleFlight = singleFlight;
      cdcIntegrationService.runCoalescedMutation = coalesce;
    }
    assert.deepEqual((await first).partitionResult.splitDescriptorReceipt, {...a, disposition: 'cancelled'});
    assert.equal(collisionArrivedWhileHeld, true, 'second request reached the router during the held reply');
    const packets = deliveries.filter(({entryId}) => entryId ===
      deriveParticipantEntryId(splitDescriptorWriteKey(a), of(TABLE).partitionId));
    assert.ok(packets.some(({answer}) => answer.failureCode === SPLIT_DESCRIPTOR_ERROR.COLLISION));
    assert.deepEqual(selectRows(of(TABLE).dbPath,
      'SELECT partition_version, split_descriptor_attempt FROM partitions WHERE partition_id = ?', [CHILD]),
    [{partition_version: 1, split_descriptor_attempt: 0}]);
  }, {cdc: true}));
