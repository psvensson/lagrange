import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {CONTROL_PLANE_FAILURE_REASON} from '../../src/control-plane/control-plane-error-classification.js';
import {STORAGE_ADMISSION_REASON} from '../../src/rebalancer/storage-admission-constants.js';
import {PARTITION_TRANSITION_STATE as STATE} from '../../src/partition/partition-constants.js';
import {TARGET_PROVISIONING as MARK, targetProvisioningOf} from '../../src/partition/target-provisioning-mark.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD as CHECKPOINT, SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX as PARTICIPANT,
} from '../../src/partition/split-ack-constants.js';
import {acknowledgeMirrorCustodyRelease} from '../../src/partition/managed-workflow-record-store.js';
import {
  readDurableMirrorRetentionCustodyIn, releaseSourceMirrorRetentionCustody, replicateSourceMirrorRetentionCustody,
} from '../../src/partition/partition-mirror-effect-retention.js';
import {SPLIT_DESCRIPTOR_ERROR} from '../../src/partition/partition-split-descriptor-command.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {readPartitionWriteGeneration} from '../../src/partition/partition-participant-transaction-store.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {openDescriptorRecordStore, parsePartitionTransition, readAuthoritativelyFrom} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const LEFT = 'users-p-left';
const RIGHT = 'users-p-right';
const children = [LEFT, RIGHT];
const noTimers = {setTimeout: () => null, clearTimeout() {}};

// Keep the actual SQL, bindings and idempotency key on the sender side of
// the PARTITIONS log. A late delivery must still go through committed apply.
function owner(store, name, clock, options = {}, intercept = null) {
  const cdc = store.cdcFor(name);
  if (intercept) {
    const engine = cdc.sqlQueryEngine;
    const execute = engine.executeQuery.bind(engine);
    engine.executeQuery = (sql, params, queryOptions) => {
      const submit = () => execute(sql, params, queryOptions);
      return intercept(queryOptions?.splitDescriptorIntent, submit, sql, params);
    };
  }
  const {workflow} = buildWorkflow({
    workflowOwnerId: name, cdcIntegrationService: cdc, now: () => clock.now,
    getTableInfo: store.tablesRow, listTableInfos: () => [store.tablesRow()],
    getPartitionInfo: store.partitionRow, listTablePartitionRows: () => store.partitionIds().map(store.partitionRow),
    parsePartitionTransition, groupRetirementScheduler: noTimers, groupRetirementLeaseScheduler: noTimers,
    ...options,
  });
  readAuthoritativelyFrom(workflow, store);
  return workflow;
}

function position(answer) {
  assert.equal(answer.success, true);
  assert.equal(answer.committed, true);
  assert.ok(Number.isSafeInteger(answer.logIndex) && answer.logIndex > 0);
  assert.ok(Number.isSafeInteger(answer.term) && answer.term > 0);
  return [answer.logIndex, answer.term, answer.splitDescriptorReceipt];
}

function effects(store) {
  const {owed, delivered} = countCdcObligations(store.db);
  return [readPartitionWriteGeneration(store.db), owed + delivered, children.map(store.partitionRow)];
}

async function pinOnStart(t, workflow, tableId, tableName, metadata, clock) {
  const group = await formAdmittedGroup({partitionId: SOURCE, members: [[SOURCE + '-r1', 'n1']],
    tempPrefix: 'handoff-source-', budgetMs: 5000,
    serviceOptions: {tableId, tableName, schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}}});
  t.teardown(() => group.dispose());
  const [source] = group.services;
  assert.equal(await workflow.reserveSourceMirrorCustody('split', SOURCE, metadata, tableId, tableName), true);
  const pin = await replicateSourceMirrorRetentionCustody(source, metadata, {family: 'split', barrierIndex: 0});
  assert.deepEqual(readDurableMirrorRetentionCustodyIn(source.db), pin.custody);
  const ack = await workflow.acknowledgeSourceParticipant(metadata.workflowId, {
    participantKey: PARTICIPANT.SOURCE_PARTITION, status: SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    attempt: metadata.workflowAttempt, fenceToken: metadata.workflowFenceToken, acknowledgedAt: clock.now,
  }, {tableId, tableName, metadata});
  assert.equal(ack.result, 'accepted');
  return source;
}

// With A's two forward requests ordered before provisioning, a delayed first
// INSERT cannot coexist with a DISPATCHED member. Exercise both reachable
// cuts and the later cut at which A has a real source pin.
for (const scenario of [
  {name: 'first right create delayed', state: STATE.DEFERRED, marks: [MARK.NONE, MARK.NONE], partial: true},
  {name: 'left provision dispatched', state: STATE.BLOCKED, marks: [MARK.DISPATCHED, MARK.NONE]},
  {name: 'source pin acquired', state: STATE.DEFERRED, marks: [MARK.DISPATCHED, MARK.DISPATCHED], pin: true},
]) {
  test('failed same-plan successor settles the inherited children after restart: ' + scenario.name, async (t) => {
    const store = await openDescriptorRecordStore(t, {partitions: [{partition_id: SOURCE}]});
    const clock = {now: 1000};
    const until = async (check, label) => assert.ok(await store.waitFor(check),
      label + ' ' + JSON.stringify(store.metadata()));
    const materialized = scenario.partial ? [LEFT] : children;
    const dispatched = children.filter((_, i) => scenario.marks[i] === MARK.DISPATCHED);
    const oldForwards = new Map();
    let lateCreate;
    let source;
    const a = owner(store, 'A', clock, {
      provisionInitialTablePartition: async ({partitionId}) => {
        if (scenario.state === STATE.BLOCKED && partitionId === LEFT) {
          throw Object.assign(new Error(STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES), {retryable: true});
        }
      },
      startSplitReplicationOnSourcePartition: async (_partitionId, tableId, tableName, metadata) => {
        assert.ok(scenario.pin, 'A reached source START prematurely');
        source = await pinOnStart(t, a, tableId, tableName, metadata, clock);
        throw Object.assign(new Error('source stopped after durable acquisition'), {retryable: true});
      },
    }, async (intent, submit, sql, params) => {
      if (scenario.partial && /^INSERT INTO partitions\b/iu.test(sql) && params.includes(RIGHT)) {
        lateCreate = submit;
        throw new Error(CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE);
      }
      const answer = await submit();
      if (intent?.action === 'createChild') oldForwards.set(intent.partitionId, {submit, answer});
      return answer;
    });
    const deferred = await a.execute(SOURCE);
    assert.equal(deferred.state, scenario.state);
    // A's two submissions may race with its failure handler. B does not
    // start until the first destination has positively materialized the row.
    if (scenario.partial) await until(() => oldForwards.has(LEFT), 'left create never returned its receipt');
    const first = store.metadata();
    const leftBefore = store.partitionRow(LEFT);
    assert.deepEqual(first.targetPartitionIds, children);
    assert.deepEqual(children.map((id) => targetProvisioningOf(first, id)), scenario.marks);
    assert.deepEqual(children.filter((id) => store.partitionRow(id)), materialized);
    assert.deepEqual(first.splitDescriptorChildren.map((intent) => intent.partitionId), children);
    for (const id of materialized) {
      assert.equal(store.partitionRow(id).split_descriptor_attempt, first.workflowAttempt);
      assert.equal(oldForwards.get(id).answer.splitDescriptorReceipt.disposition, 'acquired');
    }
    clock.now = Math.max(first.workflowLeaseExpiresAt, Date.parse(deferred.retry.nextAttemptAt)) + 1;

    const lost = new Error('stop after committed transfer and before TABLES acknowledges it');
    const b = owner(store, 'B', clock, {buildManagedSplitPlan: () => { throw new Error('retry replanned'); }});
    const lostAnswers = new Map();
    let beforeTransferAck;
    b.acknowledgeSplitChildTransfer = async (_record, intent, answer) => {
      lostAnswers.set(intent.partitionId, position(answer));
      beforeTransferAck = store.tablesRow();
      throw lost;
    };
    if (source) {
      const before = store.tablesRow();
      assert.equal((await b.execute(SOURCE)).reason, 'source-mirror-release-pending');
      assert.equal(readDurableMirrorRetentionCustodyIn(source.db).workflowAttempt, first.workflowAttempt);
      const release = await releaseSourceMirrorRetentionCustody(source, first, {family: 'split', barrierIndex: 0});
      assert.equal(readDurableMirrorRetentionCustodyIn(source.db), null);
      assert.equal((await b.execute(SOURCE)).reason, 'source-mirror-release-pending');
      assert.deepEqual(store.tablesRow(), before, 'physical release still owes its exact TABLES receipt');
      assert.equal(lostAnswers.size, 0);
      assert.equal(await acknowledgeMirrorCustodyRelease(a, before, release), true);
      assert.deepEqual(store.metadata().mirrorCustodyGrants, []);
    }
    await assert.rejects(b.execute(SOURCE), (error) => error === lost);
    const failed = store.metadata();
    assert.equal(beforeTransferAck.partition_transition_state, scenario.state,
      'the successor has not entered admission while incoming transfers are pending');
    const dormant = parsePartitionTransition(beforeTransferAck).metadata;
    assert.equal(dormant.workflowAttempt, failed.workflowAttempt);
    assert.equal(dormant.workflowOwnerId, 'B');
    assert.deepEqual(dormant.splitChildHandoff.pending, children);
    assert.deepEqual(dormant.splitChildHandoff.receipts, []);
    assert.deepEqual(dormant.splitDescriptorChildren, []);
    assert.equal(store.tablesRow().partition_transition_state, STATE.FAILED);
    assert.equal(failed.workflowId, first.workflowId);
    assert.ok(failed.workflowAttempt > first.workflowAttempt);
    assert.ok(failed.workflowFenceToken > first.workflowFenceToken);
    assert.deepEqual(failed.targetPartitionIds, first.targetPartitionIds);
    assert.deepEqual(children.map((id) => targetProvisioningOf(failed, id)), scenario.marks);
    assert.deepEqual(failed.splitDescriptorChildren, []);
    assert.deepEqual(failed.splitChildHandoff.pending, children);
    assert.deepEqual(failed.splitChildHandoff.receipts, []);
    assert.deepEqual(failed.splitDescriptorCleanup.pendingChildren, children);
    assert.deepEqual(failed.splitChildHandoff.transfers.map((intent) => intent.row),
      first.splitDescriptorChildren.map((intent) => intent.row), 'registration retained both exact predecessor rows');
    assert.ok(lostAnswers.size > 0);
    assert.ok(lostAnswers.has(LEFT), 'PARTITIONS accepted the transfer of the materialized left row');
    assert.deepEqual(store.partitionRow(LEFT), {...leftBefore, split_descriptor_attempt: failed.workflowAttempt});

    clock.now = failed.workflowLeaseExpiresAt + 1;
    const transferAnswers = new Map();
    const finals = new Map();
    const firstLate = [];
    const reads = [];
    const removes = [];
    const allowRemove = Promise.withResolvers();
    t.teardown(() => allowRemove.resolve());
    const r = owner(store, 'recovered', clock, {
      readCommittedGroupMembers: async (id) => { reads.push(id); return [id + '-r1']; },
      listPartitionServiceRows: (id) => [{partition_id: id, replica_id: id + '-r1', node_id: 'n1'}],
      deliverReplicaRemoval: async ({message}) => {
        removes.push(message);
        await allowRemove.promise;
        return {status: 'completed'};
      },
    }, async (intent, submit) => {
      if (intent?.action === 'finalizeChild') {
        assert.deepEqual(store.metadata().splitChildHandoff.pending, [], 'terminal work follows all transfer ACKs');
      }
      const answer = await submit();
      if (intent?.action === 'transferChild') {
        transferAnswers.set(intent.partitionId, {submit, answer});
        if (scenario.partial && intent.partitionId === RIGHT && firstLate.length === 0 && answer.success) {
          // This attempt reached PARTITIONS only after A's absent transfer,
          // while B still owes its ACK and has not finalized either child.
          const before = effects(store);
          const late = await lateCreate();
          firstLate.push({late, before, after: effects(store), finalCount: finals.size});
        }
      }
      if (intent?.action === 'finalizeChild') finals.set(intent.partitionId, position(answer));
      return answer;
    });
    if (dispatched.length) {
      await until(() => removes.length > 0, 'startup did not dispatch the inherited member removal');
      const id = dispatched[0];
      assert.equal(removes[0].partitionId, id);
      assert.equal(store.partitionRow(id).split_descriptor_attempt, failed.workflowAttempt);
      assert.ok(store.metadata().splitDescriptorCleanup.pendingChildren.includes(id));
      assert.equal(finals.has(id), false);
    }
    allowRemove.resolve();
    await until(() => store.metadata().splitDescriptorCleanup.pendingChildren.length === 0,
      'startup did not checkpoint both final receipts');
    const done = store.metadata();
    assert.equal(done.workflowOwnerId, r.workflowOwnerId);
    assert.ok(done.workflowFenceToken > failed.workflowFenceToken);
    assert.equal(done.splitDescriptorCleanup.decisionFence, failed.splitDescriptorCleanup.decisionFence);
    assert.deepEqual(children.map(store.partitionRow), [null, null]);
    assert.deepEqual([...new Set(reads)].sort(), dispatched);
    assert.deepEqual(removes.map((message) => message.partitionId).sort(), dispatched);
    for (const message of removes) {
      assert.equal(message.groupRetirement.workflowId, done.workflowId);
      assert.equal(message.groupRetirement.attempt, done.workflowAttempt);
      assert.equal(message.groupRetirement.fenceToken, done.workflowFenceToken);
    }
    assert.deepEqual(done.splitChildHandoff.pending, []);
    assert.deepEqual(done.splitDescriptorChildren.map((it) => [it.partitionId, it.workflowAttempt, it.action]),
      children.map((id) => [id, failed.workflowAttempt, materialized.includes(id) ? 'adoptChild' : 'createChild']));
    const beforeReplay = effects(store);
    for (const [i, id] of children.entries()) {
      const transferred = materialized.includes(id);
      const {submit, answer} = transferAnswers.get(id);
      const retained = position(answer);
      assert.equal(retained[2].workflowAttempt, first.workflowAttempt);
      assert.equal(retained[2].successorWorkflowAttempt, failed.workflowAttempt);
      assert.equal(retained[2].disposition, transferred ? 'transferred' : 'absent');
      assert.deepEqual(done.splitChildHandoff.receipts.find((receipt) => receipt.partitionId === id), retained[2]);
      if (lostAnswers.has(id)) assert.deepEqual(retained, lostAnswers.get(id));
      assert.deepEqual(position(await submit()), retained, 'the repeated transfer returns its original position');
      const final = finals.get(id)[2];
      assert.equal(final.workflowAttempt, failed.workflowAttempt);
      assert.equal(final.disposition, transferred ? 'deleted' : 'absent');
      assert.deepEqual(done.splitDescriptorCleanup.receipts.find((receipt) => receipt.partitionId === id), final);
      const key = [PARTICIPANT.LEFT_CHILD, PARTICIPANT.RIGHT_CHILD][i];
      const checkpoint = done.participants[key].checkpoint;
      if (dispatched.includes(id)) {
        assert.deepEqual(checkpoint[CHECKPOINT.REQUIRED_REPLICA_IDS], [id + '-r1']);
        assert.deepEqual(checkpoint[CHECKPOINT.DISSOLVED_REPLICA_IDS], [id + '-r1']);
      } else {
        assert.equal(checkpoint[CHECKPOINT.NEVER_PROVISIONED], true);
        assert.deepEqual(checkpoint[CHECKPOINT.REQUIRED_REPLICA_IDS], []);
      }
    }
    for (const {submit, answer} of oldForwards.values()) {
      assert.deepEqual(position(await submit()), position(answer), 'A retains its original successful forward answer');
    }
    if (scenario.partial) {
      assert.equal(firstLate.length, 1);
      assert.equal(firstLate[0].finalCount, 0);
      assert.equal(firstLate[0].late.success, false);
      assert.equal(firstLate[0].late.failureCode, SPLIT_DESCRIPTOR_ERROR.FINALIZED);
      assert.deepEqual(firstLate[0].after, firstLate[0].before);
      const answer = await lateCreate();
      assert.equal(answer.success, false);
      assert.equal(answer.failureCode, SPLIT_DESCRIPTOR_ERROR.FINALIZED);
    }
    assert.deepEqual(effects(store), beforeReplay, 'late packets preserve rows, write generation and CDC count');
    t.pass('startup drained inherited descriptors and the required members');
  });
}
