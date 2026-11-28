import assert from 'node:assert/strict';
import {test} from 'node:test';

import {TABLES} from '../../src/constants/index.js';
import {SPLIT_DESCRIPTOR_DISPOSITION, SPLIT_DESCRIPTOR_ERROR, SPLIT_DESCRIPTOR_FINALIZE_SQL,
  splitDescriptorWriteKey} from '../../src/partition/partition-split-descriptor-command.js';
import {SIBLING_DESCRIPTOR_ACTION, siblingDescriptorMutation} from
  '../../src/partition/partition-sibling-descriptor-effect.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {selectRows, withSurface} from './unknown-outcome-surface-fixture.js';

const TABLE = TABLES.PARTITIONS;
const CHILD = 'invoices-child';
const TABLE_ID = 'tbl-invoices';
const FIRST = Object.freeze({action: 'finalizeChild', tableId: TABLE_ID, partitionId: CHILD,
  workflowId: 'split-invoices', workflowAttempt: 1});

function where(intent) {
  return {table_id: intent.tableId, split_descriptor_attempt: intent.workflowAttempt,
    partition_id: intent.partitionId};
}

function insertChild(gateway, attempt, version = 2) {
  return gateway.insertSystemTableRow(TABLE, {partition_id: CHILD, table_id: TABLE_ID,
    table_name: 'invoices', partition_version: version, replica_count: 3, size_bytes: 0,
    state: 'NORMAL', created_at: 1002, updated_at: 1002, split_descriptor_attempt: attempt});
}

function finalize(gateway, intent) {
  return gateway.deleteSystemTableRow(TABLE, where(intent), {splitDescriptorIntent: intent});
}

test('gateway remote DELETE retains the committed split descriptor receipt across a same-ID successor',
  {timeout: 120000}, async () => {
    await withSurface([TABLE], async ({gateway, deliveries, messageRouter, of}) => {
      const {dbPath, partitionId} = of(TABLE);
      const child = () => selectRows(dbPath,
        'SELECT * FROM partitions WHERE partition_id = ?', [CHILD]);
      assert.equal((await insertChild(gateway, FIRST.workflowAttempt)).success, true);
      const initial = await finalize(gateway, FIRST);
      assert.equal(initial.success, true, initial.error);
      const answer = initial.partitionResult;
      const receipt = {...FIRST, disposition: SPLIT_DESCRIPTOR_DISPOSITION.DELETED};
      assert.deepEqual(answer.splitDescriptorReceipt, receipt);
      assert.equal(answer.committed, true);
      assert.ok(Number.isSafeInteger(answer.logIndex) && answer.logIndex > 0);
      assert.ok(Number.isSafeInteger(answer.term) && answer.term > 0);
      assert.deepEqual(child(), []);

      const successor = {...FIRST, workflowAttempt: 30};
      assert.equal((await insertChild(gateway, successor.workflowAttempt)).success, true);
      const successorRows = child();
      assert.equal(successorRows[0].split_descriptor_attempt, successor.workflowAttempt);
      const replay = await finalize(gateway, FIRST);
      assert.equal(replay.success, true, replay.error);
      assert.deepEqual(replay.partitionResult.splitDescriptorReceipt, receipt);
      assert.equal(replay.partitionResult.logIndex, answer.logIndex);
      assert.equal(replay.partitionResult.term, answer.term);
      assert.deepEqual(child(), successorRows);

      const requests = deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL);
      assert.equal(requests.length, 2);
      const key = splitDescriptorWriteKey(FIRST);
      for (const request of requests) {
        assert.equal(request.entryId, deriveParticipantEntryId(key, partitionId));
        assert.deepEqual(request.answer.splitDescriptorReceipt, receipt);
        assert.equal(request.answer.logIndex, answer.logIndex);
        assert.equal(request.answer.term, answer.term);
      }
      const refused = await gateway.deleteSystemTableRow(TABLE, where(successor),
        {splitDescriptorIntent: FIRST});
      assert.equal(refused.errorCode, SPLIT_DESCRIPTOR_ERROR.BYTES);
      assert.deepEqual(child(), successorRows);
      assert.equal(deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL).length,
        2);

      const older = {...FIRST, workflowAttempt: 2};
      const stale = await finalize(gateway, older);
      assert.equal(stale.success, true, stale.error);
      assert.deepEqual(stale.partitionResult.splitDescriptorReceipt,
        {...older, disposition: SPLIT_DESCRIPTOR_DISPOSITION.SUPERSEDED});
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
        const ambiguous = await finalize(gateway, successor);
        assert.equal(ambiguous.success, false);
        assert.equal(ambiguous.errorCode, SPLIT_DESCRIPTOR_ERROR.RECEIPT);
      } finally {
        messageRouter.deliver = deliver;
      }
      assert.deepEqual(child(), []);
      const originalAnswer = deliveries.at(-1).answer;
      const recovered = await finalize(gateway, successor);
      assert.equal(recovered.success, true, recovered.error);
      assert.deepEqual(recovered.partitionResult.splitDescriptorReceipt,
        {...successor, disposition: SPLIT_DESCRIPTOR_DISPOSITION.DELETED});
      assert.equal(recovered.partitionResult.logIndex, originalAnswer.logIndex);
      assert.equal(recovered.partitionResult.term, originalAnswer.term);
    }, {cdc: true});
  });

test('overlapping sibling finalizations with identical SQL and different plans reach destination collision',
  {timeout: 120000}, async () => withSurface([TABLE], async ({
    gateway, cdcIntegrationService, deliveries, messageRouter, of,
  }) => {
    assert.equal((await insertChild(gateway, 0, 1)).success, true);
    const a = {...FIRST, action: SIBLING_DESCRIPTOR_ACTION.FINALIZE, workflowAttempt: 7,
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
      await assert.rejects(submit(b),
        (error) => error.errorCode === SPLIT_DESCRIPTOR_ERROR.COLLISION);
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

test('gateway refuses a split descriptor mutation that deviates from its descriptor statement or key',
  {timeout: 120000}, async () => {
    await withSurface([TABLE], async ({gateway, deliveries}) => {
      assert.equal((await insertChild(gateway, FIRST.workflowAttempt)).success, true);
      const deviations = [
        ['an ignore-existing write', {splitDescriptorIntent: FIRST, ignoreExisting: true}],
        ['a caller key other than the descriptor key',
          {splitDescriptorIntent: FIRST, idempotencyKey: 'caller-chosen-key'}],
        ['an intent the descriptor owner cannot canonicalize',
          {splitDescriptorIntent: {...FIRST, workflowAttempt: 0}}],
      ];
      for (const [label, options] of deviations) {
        const refused = await gateway.deleteSystemTableRow(TABLE, where(FIRST), options);
        assert.equal(refused.success, false, label);
        assert.equal(refused.errorCode, SPLIT_DESCRIPTOR_ERROR.BYTES, label);
      }
      assert.equal(deliveries.filter((entry) => entry.sql === SPLIT_DESCRIPTOR_FINALIZE_SQL).length,
        0, 'no refused descriptor reaches the partition');
      const accepted = await gateway.deleteSystemTableRow(TABLE, where(FIRST),
        {splitDescriptorIntent: FIRST, idempotencyKey: splitDescriptorWriteKey(FIRST)});
      assert.equal(accepted.success, true, accepted.error);
      assert.equal(accepted.partitionResult.splitDescriptorReceipt.disposition,
        SPLIT_DESCRIPTOR_DISPOSITION.DELETED);
    }, {cdc: true});
  });
