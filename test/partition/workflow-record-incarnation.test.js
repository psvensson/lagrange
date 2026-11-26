import {replicateSourceMirrorRetentionCustody, readDurableMirrorRetentionCustodyIn} from '../../src/partition/partition-mirror-effect-retention.js';
/**
 * Round-7 witnesses: the workflow record is an INCARNATION, never bytes that
 * can repeat (design-workflow-record-change-store-2026-10-05.md, "Round 7").
 * Real ManagedSplitWorkflow / ManagedMergeWorkflow owners, each over its own
 * PRODUCTION CDCIntegrationService and gateway, on one real SQLite store
 * that evaluates every WHERE at apply (workflow-record-sqlite-world.js).
 *
 * V6-A registration ABA (round-6 verifier probe, both families):
 *  A1 owner A reads the table (no transition, active v1) and awaits its
 *     topology snapshot; owner B runs a WHOLE healthy split/merge of the same
 *     sources to its terminal clear (active v2, sources dissolved); A's
 *     registration, derived from the v1 read, is released: REFUSED typed
 *     (record moved since the read), nothing written, nothing sent.
 *  A2 A reads a cleared record of generation n; B registers, aborts and
 *     clears (the transition bytes are null/null again, active and pending
 *     unchanged): A's registration is refused all the same.
 *  A3 A's view of the TABLE is current (B's clear, active v2) while its view
 *     of the PARTITIONS rows still lags before B's workflow: the
 *     registration's partitions-row inputs are re-validated at its turn
 *     against the compared record (the source is not at the record's active
 *     epoch) and it is refused, though the record's generation matches.
 *  A4 (split) a partitions view MISSING a sibling row re-derives the same
 *     short sibling set at the turn; the record's own committed partition
 *     count refuses it (the sibling would never be carried forward).
 * V6-B phase never backwards past the cutover (both families):
 *  B1 a non-retryable START failure after the acknowledgements drove the
 *     record to its cutover: no FAILED, the phase stays, one typed
 *     post-cutover incident on the record, ONE ERROR (workflow, attempt,
 *     phase, reason); the workflow still reaches its terminal clear;
 *  B2 a retryable one: no DEFERRED, the same incident;
 *  B3 a fresh owner re-driving the table afterwards starts nothing from the
 *     superseded source (the record never became a re-drivable deferral).
 * Split: the START answer fails while the source's acknowledgements drive
 * the cutover (execute awaits START outside the owner lane). Merge: execute
 * runs inside the owner lane, so the cutover step queues behind a failing
 * START and the failure lands first; the merge witness therefore delivers
 * the failure through the same production entries (persistExecutionFailure,
 * handleRetryablePostAdmissionExecutionFailure) after the cutover landed.
 */
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {reconcileFailedMirrorCustody} from '../../src/partition/partition-mirror-custody-lifecycle.js';
import {test} from '../../src/test-helpers/tap.js';
import {PARTICIPANT_ACK_FIELD} from
  '../../src/workflow/workflow-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
} from './managed-merge-workflow-test-helpers.js';
import {registerFromRecordAsRead} from './workflow-record-test-support.js';
import {
  openDescriptorRecordStore,
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  recordingLogger,
  turns,
} from './workflow-record-sqlite-world.js';

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const NO_TIMERS = Object.freeze({setTimeout: () => null, clearTimeout() {}});
const SPLIT_SOURCE = 'users-p1';
const STATE = PARTITION_TRANSITION_STATE;
const INCIDENTS = PARTITION_TRANSITION_METADATA_FIELD.POST_CUTOVER_INCIDENTS;
const RECORD_MOVED = 'record-moved-since-read';
const TIMED_OUT = 'timed out';

function members(workflow) {
  workflow.readCommittedGroupMembers = async () => ['r1', 'r2', 'r3'];
  workflow.listPartitionServiceRows = (partitionId) => ['r1', 'r2', 'r3']
    .map((replicaId) => ({partition_id: partitionId, replica_id: replicaId,
      node_id: `n-${replicaId}`}));
  workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
}

// One owner's production options over the shared store; `sent` records
// every START it sends; `partitions` (optional) is its view of the
// partitions rows (default: live).
function common(store, {name, clock, logger, sent, start, partitions, workflowOwnerId}) {
  const view = openView(store);
  const rowOf = (id) => (partitions ? partitions.find((row) =>
    row.partition_id === id) ?? null : store.partitionRow(id));
  const rows = () => partitions ?? store.partitionIds()
    .map((id) => store.partitionRow(id));
  const send = async (...args) => {
    sent.push(args[0]);
    return start ? start(...args) : undefined;
  };
  return {workflowOwnerId: workflowOwnerId ?? `owner-${name}`, cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(), listTableInfos: () => view.list(),
    getPartitionInfo: rowOf, logger: logger ?? QUIET,
    now: () => clock.now, listTablePartitionRows: rows,
    resolveActivePartitionVersion: (tableInfo) =>
      Number(tableInfo?.active_partition_version) || 1,
    groupRetirementScheduler: NO_TIMERS,
    groupRetirementLeaseScheduler: NO_TIMERS,
    startSplitReplicationOnSourcePartition: send,
    startMergeReplicationOnSourcePartition: send};
}

const splitPartitions = [{partition_id: SPLIT_SOURCE}, {partition_id: 'users-p3'}];

const FAMILY = {
  split: {
    store: () => openRecordStore({partitions: splitPartitions}),
    build: (store, options) => buildWorkflow({...common(store, options),
      parsePartitionTransition, topologyAdapter: null}).workflow,
    start: (workflow) => workflow.execute(SPLIT_SOURCE),
    sources: [SPLIT_SOURCE],
    toCutover: [SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
      SPLIT_ACK_STATUS.CATCHUP_READY].map((status) => ({status,
      key: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION})),
    toClear: [SPLIT_ACK_STATUS.CUTOVER_APPLIED,
      SPLIT_ACK_STATUS.CLEANUP_COMPLETED].map((status) => ({status,
      key: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION})),
    acknowledge: (workflow, workflowId, ack) =>
      workflow.acknowledgeSourceParticipant(workflowId, ack),
    // The START answer fails while the acknowledgements drive the cutover.
    failAfterCutover: async (store, options, failure) => {
      let starts = 0;
      const workflow = owner(FAMILY.split, store, {...options,
        start: async () => {
          starts += 1;
          if (starts === 1) {
            await deliver(FAMILY.split, workflow, store,
              FAMILY.split.toCutover);
            throw failure;
          }
        }});
      const answer = await workflow.execute(SPLIT_SOURCE).then(
        (result) => result, (error) => ({threw: error.message}));
      return {workflow, answer};
    },
    record: (workflowId) => ({workflowId, ownerKey: SPLIT_SOURCE,
      tableId: 'tbl-users', tableName: 'users', partitionId: SPLIT_SOURCE,
      status: STATE.ADMISSION_PENDING, metadata: {workflowId,
        sourcePartitionId: SPLIT_SOURCE, targetPartitionVersion: 2},
      createdAt: 1000, updatedAt: 1000}),
  },
  merge: {
    store: () => openRecordStore({partitions: Object.values(
      createDefaultPartitionInfos()).map((row) => ({...row}))}),
    build: (store, options) => buildMergeWorkflow(
      common(store, options)).workflow,
    start: (workflow) => workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID}),
    sources: [FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID],
    toCutover: [MERGE_ACK_STATUS.SNAPSHOT_STARTED,
      MERGE_ACK_STATUS.CATCHUP_READY].flatMap((status) => [
      FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID].map((id) =>
      ({status, key: buildMergeSourceParticipantKey(id)}))),
    toClear: [MERGE_ACK_STATUS.CUTOVER_APPLIED,
      MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED].flatMap((status) => [
      FIXTURE_LEFT_PARTITION_ID, FIXTURE_RIGHT_PARTITION_ID].map((id) =>
      ({status, key: buildMergeSourceParticipantKey(id)}))),
    acknowledge: (workflow, workflowId, ack) =>
      workflow.acknowledgeMergeSourceParticipant(workflowId, ack),
    // The failure reaches the production failure entries after the cutover.
    failAfterCutover: async (store, options, failure) => {
      const spec = FAMILY.merge;
      const workflow = owner(spec, store, options);
      const started = await spec.start(workflow);
      await deliver(spec, workflow, store, spec.toCutover);
      const workflowId = started.workflowId;
      workflow.resolveWorkflowState(workflowId);
      const deferral = await workflow
        .handleRetryablePostAdmissionExecutionFailure({workflowId,
          error: failure, sourcePartitionIds: spec.sources,
          retryMetadata: null, admission: null});
      if (workflow.isManagedMergeDeferredExecutionOutcome(deferral)) {
        return {workflow, answer: deferral};
      }
      await workflow.persistExecutionFailure(workflowId, failure);
      return {workflow, answer: {threw: failure.message}};
    },
    record: (workflowId) => ({workflowId, ownerKey: 'merge-sources',
      tableId: 'tbl-users', tableName: 'users',
      partitionId: FIXTURE_LEFT_PARTITION_ID,
      status: STATE.ADMISSION_PENDING, metadata: {workflowId,
        sourcePartitionIds: [FIXTURE_LEFT_PARTITION_ID,
          FIXTURE_RIGHT_PARTITION_ID], targetPartitionVersion: 2,
        targetPartitionIds: ['users-p-merged'], siblingPartitionIds: []},
      createdAt: 1000, updatedAt: 1000}),
  },
};

function owner(spec, store, options) {
  const workflow = spec.build(store, {sent: [], ...options});
  workflow.workflowOwnerId = options.workflowOwnerId ?? `owner-${options.name}`;
  readAuthoritativelyFrom(workflow, store);
  members(workflow);
  return workflow;
}

// The source acknowledgements of `acks`, delivered by the sources.
async function deliver(spec, workflow, store, acks) {
  const {workflowId, workflowFenceToken} = store.metadata();
  for (const {status, key} of acks) {
    await spec.acknowledge(workflow, workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: key,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: workflowFenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000});
    await turns(50);
  }
}

// Owner A's execute, held at its topology await until `release()`.
function heldStart(spec, workflow) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const original = workflow.resolveTopologySnapshot.bind(workflow);
  workflow.resolveTopologySnapshot = async (...args) => {
    await gate;
    return original(...args);
  };
  const run = spec.start(workflow).then((result) => result,
    (error) => ({threw: error.message}));
  return {run, release};
}

// The writes `writer` attempted on the store after index `from`.
function writesOf(store, writer, from) {
  return store.writes.slice(from).filter((write) => write.writer === writer);
}

for (const family of Object.keys(FAMILY)) {
  const spec = FAMILY[family];

  async function authorizeSources(workflow, store, t, acquire) {
    const metadata = store.metadata();
    const sources = [];
    for (const partitionId of spec.sources) {
      const isSplit = family === 'split';
      const ack = {status: 'snapshot_started', acknowledgedAt: 1000,
        attempt: metadata.workflowAttempt, fenceToken: metadata.workflowFenceToken,
        participantKey: isSplit ? SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION :
          buildMergeSourceParticipantKey(partitionId)};
      const context = {tableId: store.tableId, tableName: 'users',
        metadata: {...metadata, targetPartitionId: metadata.targetPartitionIds[0]}};
      const reserved = await workflow.reserveSourceMirrorCustody(family, partitionId, context.metadata,
        context.tableId, context.tableName);
      if (!reserved) throw new Error('source custody reservation refused');
      const confirmed = isSplit ?
        await workflow.confirmSplitReplicationStart(context.metadata, context.tableId, context.tableName) :
        await workflow.confirmMergeReplicationStart(partitionId, context.metadata, context.tableId, context.tableName);
      if (confirmed) throw new Error('reservation remotely confirmed START before acquisition');
      if (!acquire) continue;
      const group = await formAdmittedGroup({partitionId, members: [[partitionId + '-r1', 'n1']],
        tempPrefix: 'retiring-source-', budgetMs: 5000, serviceOptions: {tableId: store.tableId,
          tableName: 'users', schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}}});
      t.teardown(() => group.dispose());
      const [source] = group.services;
      source.sqlQueryEngine = isSplit ? {managedSplitWorkflow: workflow} : {managedMergeWorkflow: workflow};
      await replicateSourceMirrorRetentionCustody(source, metadata, {family, barrierIndex: 0});
      sources.push(source);
      const result = isSplit ?
        await workflow.acknowledgeSourceParticipant(metadata.workflowId, ack, context) :
        await workflow.acknowledgeMergeSourceParticipant(metadata.workflowId, ack, context);
      if (!['accepted', 'duplicate'].includes(result.result)) throw new Error(JSON.stringify(result));
    }
    return sources;
  }

  if (family === 'split') test('deferred aborted child DELETE cannot erase a same-ID successor', async (t) => {
    const store = await openDescriptorRecordStore(t, {partitions: splitPartitions});
    const clock = {now: 1000};
    const original = owner(spec, store, {name: 'A', clock});
    const {workflowId} = await spec.start(original);
    const [source] = await authorizeSources(original, store, t, true);
    const {workflowAttempt: attempt, workflowFenceToken: fence, targetPartitionIds: children} = store.metadata();
    const [child] = children;
    t.equal(readDurableMirrorRetentionCustodyIn(source.db)?.workflowFenceToken, fence);
    let intercepted = false;
    store.holdSubmission = ({writer, sql, params}) => {
      if (writer !== 'A' || !/^DELETE FROM partitions\b/i.test(sql) || !params.includes(child)) return false;
      // The abandoned owner cannot finish this child via a second RPC.
      if (intercepted) throw new Error('old sender unavailable after submission');
      intercepted = true;
      return true;
    };
    const failure = await original.acknowledgeSourceParticipant(workflowId, {
      participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      status: SPLIT_ACK_STATUS.BACKFILL_FAILED, attempt, fenceToken: fence, acknowledgedAt: clock.now});
    t.equal(failure.result, 'accepted');
    await original.runSerializedOwnerStep(SPLIT_SOURCE, async () => {});
    if (!intercepted || store.tablesRow().partition_transition_state !== STATE.FAILED) {
      throw new Error('abort did not submit the original child DELETE: ' + JSON.stringify(store.writes.slice(-5)));
    }
    t.ok(store.partitionRow(child), 'the held DELETE has not applied');
    t.equal(readDurableMirrorRetentionCustodyIn(source.db)?.workflowFenceToken, fence,
      'committed abort does not by itself release the physical source pin');

    // Reconstruct the owner on its actual durable rows. Its startup scan must
    // positively finish the same terminal cleanup without the old RPC reply.
    clock.now++;
    const diagnostics = recordingLogger();
    const restarted = owner(spec, store, {name: 'A2', workflowOwnerId: original.workflowOwnerId,
      clock, logger: diagnostics.logger});
    source.sqlQueryEngine.managedSplitWorkflow = restarted;
    // Right's receipt was checkpointed by A. A2 now owns the sole
    // outstanding receipt. Pause after PARTITIONS committed the delete,
    // before the TABLES record owner consumes its answer.
    const finishCleanup = Promise.withResolvers();
    const acknowledge = restarted.acknowledgeAbortedSplitDescriptor.bind(restarted);
    let leftAnswer;
    restarted.acknowledgeAbortedSplitDescriptor = async (workflow, partitionId, result) => {
      if (partitionId === child) {
        leftAnswer = {workflow, result};
        await finishCleanup.promise;
      }
      return acknowledge(workflow, partitionId, result);
    };
    const cleanup = Promise.withResolvers();
    const teardownAll = restarted.teardownAbortedSplitChildren.bind(restarted);
    restarted.teardownAbortedSplitChildren = (...args) => {
      const run = teardownAll(...args);
      run.then(cleanup.resolve, cleanup.reject);
      return run;
    };
    t.teardown(() => finishCleanup.resolve());
    if (!await store.waitFor(() => Boolean(leftAnswer))) {
      throw new Error('restarted owner did not receive the left destination result: ' +
        JSON.stringify({record: store.metadata(), writes: store.writes.slice(-5), events: diagnostics.lines}));
    }
    t.equal(leftAnswer.result.splitDescriptorReceipt.disposition, 'deleted');
    t.same(store.metadata().splitDescriptorCleanup.pendingChildren, [child]);
    t.same(children.map((id) => store.partitionRow(id)), [null, null], 'both old child descriptors are absent');
    t.ok(store.partitionDeletesBy('A2').includes(child), 'reconstructed writer applied the held child deletion');
    source.systemTableCache.applySystemTableChange('tables', 'INSERT', store.tablesRow());
    t.equal(await reconcileFailedMirrorCustody(source), true);
    t.equal(readDurableMirrorRetentionCustodyIn(source.db), null);
    t.same(store.metadata().mirrorCustodyGrants, []);

    const pending = store.tablesRow();
    const blocked = await restarted.workflowCoordinator.registerWorkflowFromRead(
      spec.record('successor'), pending);
    t.equal(blocked.reason, 'split-descriptor-cleanup-pending');
    await t.rejects(restarted.workflowCoordinator.clearWorkflowRecord(workflowId, new Set([STATE.FAILED])),
      /split-descriptor-cleanup-pending/);
    const result = leftAnswer.result;
    await t.rejects(acknowledge(leftAnswer.workflow, child, {...result,
      splitDescriptorReceipt: {...result.splitDescriptorReceipt, workflowAttempt: attempt + 1}}),
    {code: 'split-descriptor-cleanup-unconfirmed'});
    t.same(store.tablesRow(), pending, 'refusals leave the final receipt owed');

    // Require the ordinary retry to select the persisted plan, even if the
    // fixture's planner would otherwise mint these same deterministic IDs.
    restarted.buildManagedSplitPlan = () => { throw new Error('retry replanned the split'); };
    clock.now++;
    const capture = restarted.resolveTopologySnapshot.bind(restarted);
    restarted.resolveTopologySnapshot = async (...args) => {
      const snapshot = await capture(...args);
      finishCleanup.resolve();
      await cleanup.promise;
      return snapshot;
    };
    const beforeCleanup = store.tablesRow().partition_transition_generation;
    let raced;
    try {
      raced = await spec.start(restarted);
    } finally {
      finishCleanup.resolve();
      await cleanup.promise;
      restarted.resolveTopologySnapshot = capture;
    }
    t.equal(raced.reason, RECORD_MOVED, 'checkpointing the left receipt supersedes the first retry read');
    t.ok(store.tablesRow().partition_transition_generation > beforeCleanup);
    t.equal(store.metadata().workflowAttempt, attempt, 'stale registration created no successor');
    t.same(store.metadata().splitDescriptorCleanup.pendingChildren, []);
    t.ok(store.metadata().splitDescriptorCleanup.receipts.some((receipt) =>
      receipt.partitionId === child && receipt.disposition === 'deleted' && receipt.workflowAttempt === attempt));
    const writeStart = store.writes.length;
    const logStart = diagnostics.lines.length;
    const retryAnswer = await spec.start(restarted);
    const successor = store.metadata();
    if (!(successor.workflowAttempt > attempt && successor.workflowFenceToken > fence &&
        store.tablesRow().partition_transition_state === STATE.SPLIT_BACKFILLING)) {
      throw new Error('successor did not enter backfill: ' + JSON.stringify({
        retryAnswer, record: store.tablesRow(), partitions: store.partitionIds().map(store.partitionRow),
        writesDuringRetry: store.writes.slice(writeStart), ownerEvents: diagnostics.lines.slice(logStart),
      }));
    }
    t.same(successor.targetPartitionIds, children);
    const before = store.partitionRow(child);
    if (!before) throw new Error('successor did not establish its child descriptor');
    t.equal(before.split_descriptor_attempt, successor.workflowAttempt);
    const applied = store.applyHeldSubmission();
    t.equal(applied.changes, 0, 'the retired attempt matches zero successor rows at apply');
    t.same(store.partitionRow(child), before, 'old SQL must preserve the newer attempt descriptor',
      {sql: applied.sql, params: applied.params, changes: applied.changes, attempt, successorAttempt: successor.workflowAttempt});
  });

  test(`${family}: FAILED retains each source grant until committed release ACK`, async (t) => {
    const store = family === 'split' ? await openDescriptorRecordStore(t, {partitions: splitPartitions}) : spec.store();
    const diagnostics = recordingLogger();
    const workflow = owner(spec, store, {name: 'A', clock: {now: 1000}, logger: diagnostics.logger});
    const started = await spec.start(workflow);
    await authorizeSources(workflow, store, t, false);
    t.same(store.metadata().mirrorCustodyGrants.map((grant) => grant.partitionId), spec.sources);
    t.equal(workflow.resolveWorkflowState(started.workflowId).metadata.workflowAttempt,
      store.metadata().workflowAttempt);
    const firstFence = store.metadata().workflowFenceToken;
    const claim = await workflow.workflowCoordinator.claimWorkflow(started.workflowId);
    t.equal(claim.accepted, true, 'same attempt acquires a fresh workflow fence');
    const secondFence = store.metadata().workflowFenceToken;
    t.ok(secondFence > firstFence);
    await authorizeSources(workflow, store, t, false);
    await workflow.persistExecutionFailure(started.workflowId, new Error('aborted'));
    const failed = store.tablesRow();
    if (failed.partition_transition_state !== STATE.FAILED || store.metadata().mirrorExecutionEnded !== true) {
      throw new Error(JSON.stringify({expected: STATE.FAILED, state: failed.partition_transition_state,
        metadata: store.metadata(), ownerLog: diagnostics.lines}));
    }
    for (const partitionId of spec.sources) {
      // Reconstruct the workflow owner before each ACK. A successor (including
      // a merge after only one source replied) must still see retained work.
      const restarted = owner(spec, store, {name: 'A', clock: {now: 1010}});
      const refusal = await restarted.workflowCoordinator.registerWorkflowFromRead(
        spec.record('successor'), store.tablesRow());
      t.equal(refusal.reason, 'source-mirror-release-pending');
      const group = await formAdmittedGroup({partitionId, members: [[partitionId + '-r1', 'n1']],
        tempPrefix: 'terminal-source-', budgetMs: 5000,
        serviceOptions: {tableId: store.tableId, tableName: 'users',
          schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]}}});
      try {
        const [source] = group.services;
        source.sqlQueryEngine = family === 'split' ? {managedSplitWorkflow: restarted} :
          {managedMergeWorkflow: restarted};
        // The first ACK reaches SQLite, but its reply is lost. The exact
        // metadata/generation reread still proves that fence's receipt.
        let lostReleaseWrite;
        store.loseAckOnce((write) => {
          if (write.changes !== 1 || !write.sql.startsWith(
            'UPDATE tables SET partition_transition_metadata = ?, partition_transition_generation = ?')) return false;
          const before = JSON.parse(write.params[3]).mirrorCustodyGrants;
          const after = JSON.parse(write.params[0]).mirrorCustodyGrants;
          const first = (grant) => grant.partitionId === partitionId && grant.fence === firstFence;
          if (!before.some(first) || after.some(first)) return false;
          lostReleaseWrite = write;
          return true;
        });
        source.systemTableCache.applySystemTableChange('tables', 'INSERT', store.tablesRow());
        for (const fence of [firstFence, secondFence]) {
          const start = store.writes.length;
          const acknowledged = await reconcileFailedMirrorCustody(source).catch((error) => {
            error.releaseWitness = {partitionId, fence, pendingLostReplies: store.lostAcks.length,
              writes: store.writes.slice(start), durableGrants: store.metadata().mirrorCustodyGrants};
            throw error;
          });
          t.equal(acknowledged, true, 'committed release acknowledged by the record owner', {
            partitionId, fence, actualState: store.tablesRow().partition_transition_state,
            grants: store.metadata().mirrorCustodyGrants, lastWrite: store.writes.at(-1),
          });
          const outstanding = store.metadata().mirrorCustodyGrants.filter((grant) =>
            grant.partitionId === partitionId).map((grant) => grant.fence);
          t.same(outstanding, fence === firstFence ? [secondFence] : [],
            'one committed release receipt discharges exactly its source and fence');
        }
        t.ok(lostReleaseWrite, 'SQLite applied the first fence removal before its reply was lost');
        // Finish this owner's target retirement before reconstructing another
        // owner or deriving a successor registration from the current record.
        const targets = store.metadata().targetPartitionIds;
        t.ok(await group.waitFor(() => targets.every((id) => !store.partitionRow(id)) &&
          (family !== 'split' || store.metadata().splitDescriptorCleanup.pendingChildren.length === 0)),
          'recovered retirement removed its targets while release receipts progressed');
      } finally {
        await group.dispose();
      }
    }
    const successor = await registerFromRecordAsRead(workflow, spec.record('successor'));
    t.equal(successor.workflowId, 'successor');
  });

  test(`${family}: only the current source fence may authorize terminal release`, async (t) => {
    const store = spec.store();
    const workflow = owner(spec, store, {name: 'A', clock: {now: 1000}});
    const {workflowId} = await spec.start(workflow);
    await authorizeSources(workflow, store, t, false);
    const oldFence = store.metadata().workflowFenceToken;
    const claim = await workflow.workflowCoordinator.claimWorkflow(workflowId);
    t.equal(claim.accepted, true);
    await authorizeSources(workflow, store, t, true);
    const cleanup = spec.toClear.at(-1);
    const metaBeforeCutover = store.metadata();
    for (const fence of [undefined, metaBeforeCutover.workflowFenceToken + 1]) {
      const failed = await spec.acknowledge(workflow, workflowId, {
        participantKey: cleanup.key, status: family === 'split' ?
          SPLIT_ACK_STATUS.BACKFILL_FAILED : MERGE_ACK_STATUS.BACKFILL_FAILED,
        attempt: metaBeforeCutover.workflowAttempt, fenceToken: fence});
      t.equal(failed.result, 'stale_fence');
      t.same(store.metadata(), metaBeforeCutover, 'unauthorized failure cannot terminate the attempt');
    }
    await deliver(spec, workflow, store, [...spec.toCutover.filter(({status}) =>
      status !== 'snapshot_started'), ...spec.toClear.filter(({status}) => status !== cleanup.status)]);
    const row = store.tablesRow();
    const meta = store.metadata();
    const source = spec.sources.at(-1);
    const fences = meta.mirrorCustodyGrants.filter((grant) => grant.partitionId === source)
      .map((grant) => grant.fence);
    t.same(fences, [oldFence, meta.workflowFenceToken]);
    const ack = {participantKey: cleanup.key, status: cleanup.status, attempt: meta.workflowAttempt};
    for (const offered of [ack, {...ack, fenceToken: oldFence},
      {...ack, fenceToken: meta.workflowFenceToken + 1}]) {
      const result = await spec.acknowledge(workflow, workflowId, offered);
      t.equal(result.result, 'stale_fence');
      t.same(store.tablesRow(), row, 'refusal preserves grants, participant and generation');
    }
    const result = await spec.acknowledge(workflow, workflowId,
      {...ack, fenceToken: meta.workflowFenceToken});
    t.equal(result.result, 'accepted');
    t.same(store.metadata().mirrorCustodyGrants, meta.mirrorCustodyGrants.map((grant) =>
      grant.partitionId === source ? {...grant, release: true} : grant),
    'terminal source decision retains every grant and authorizes only this source');
    const terminal = store.tablesRow();
    for (const offered of [ack, {...ack, fenceToken: oldFence},
      {...ack, fenceToken: meta.workflowFenceToken + 1}]) {
      t.equal((await spec.acknowledge(workflow, workflowId, offered)).result, 'stale_fence',
        'repeated status still requires the exact fence');
    }
    t.equal((await spec.acknowledge(workflow, workflowId, {...ack,
      fenceToken: meta.workflowFenceToken})).result, 'duplicate');
    t.same(store.tablesRow(), terminal, 'redelivery preserves the committed release decision');
  });

  test(`V6-A1 ${family}: a registration derived from a read taken before a ` +
    'whole competing workflow ran to its clear is refused and does nothing',
  async (t) => {
    const store = spec.store();
    const clock = {now: 1000};
    const sentByA = [];
    const a = owner(spec, store, {name: 'A', clock, sent: sentByA});
    const b = owner(spec, store, {name: 'B', clock});
    const held = heldStart(spec, a);
    await turns(20);
    const bStarted = await spec.start(b);
    t.equal(bStarted.success, true, 'setup: B registered and started');
    const sources = await authorizeSources(b, store, t, true);
    t.equal(store.metadata().mirrorCustodyGrants.length, spec.sources.length);
    await deliver(spec, b, store, [...spec.toCutover.filter(({status}) =>
      status !== 'snapshot_started'), ...spec.toClear]);
    for (const source of sources) {
      t.ok(readDurableMirrorRetentionCustodyIn(source.db));
      await reconcileFailedMirrorCustody(source);
      t.equal(readDurableMirrorRetentionCustodyIn(source.db), null);
    }
    const afterB = store.tablesRow();
    t.equal(afterB.partition_transition_state, null, 'setup: B cleared');
    t.equal(afterB.active_partition_version, 2, 'setup: B promoted v2');
    const before = store.writes.length;
    held.release();
    const answer = await held.run;
    await turns(100);
    t.equal(answer.success, false, 'A answered a refusal');
    t.equal(answer.reason, RECORD_MOVED,
      'typed: the record moved since the read');
    t.same(writesOf(store, 'A', before), [],
      'A attempted no write at all (no registration, no later record)');
    t.same(sentByA, [], 'A sent no START to a dissolved source');
    t.equal(store.tablesRow().partition_transition_state, null,
      'the record B cleared stays cleared');
  });

  test(`V6-A2 ${family}: a cleared record of one generation is not the ` +
    'cleared record of the next (register, abort and clear in between)',
  async (t) => {
    const store = spec.store();
    const clock = {now: 1000};
    const sentByA = [];
    const a = owner(spec, store, {name: 'A', clock, sent: sentByA});
    const b = owner(spec, store, {name: 'B', clock});
    const read = store.tablesRow();
    const held = heldStart(spec, a);
    await turns(20);
    const workflowId = `${family}-competing`;
    await registerFromRecordAsRead(b, spec.record(workflowId));
    await b.persistExecutionFailure(workflowId, new Error('aborted'));
    await b.workflowCoordinator.clearWorkflowRecord(workflowId,
      new Set([STATE.FAILED]));
    const cleared = store.tablesRow();
    t.same([cleared.partition_transition_state,
      cleared.partition_transition_metadata, cleared.pending_partition_version,
      cleared.active_partition_version], [read.partition_transition_state,
      read.partition_transition_metadata, read.pending_partition_version,
      read.active_partition_version],
    'setup: the transition bytes and epochs are what A read');
    t.ok(cleared.partition_transition_generation >
      read.partition_transition_generation,
    `the record generation moved on (${read.partition_transition_generation}` +
      ` -> ${cleared.partition_transition_generation})`);
    const before = store.writes.length;
    held.release();
    const answer = await held.run;
    await turns(100);
    t.equal(answer.success, false, 'A answered a refusal');
    t.equal(answer.reason, RECORD_MOVED, 'typed: the record moved');
    t.same(writesOf(store, 'A', before).filter((write) => write.changes > 0),
      [], 'A wrote nothing');
    t.same(sentByA, [], 'A sent nothing');
  });

  test(`V6-A3 ${family}: a registration whose partitions-row inputs lag the ` +
    'record it is compared against is refused at its turn', async (t) => {
    const store = spec.store();
    const clock = {now: 1000};
    const lagging = store.partitionIds().map((id) => store.partitionRow(id));
    const b = owner(spec, store, {name: 'B', clock});
    await spec.start(b);
    await deliver(spec, b, store, [...spec.toCutover, ...spec.toClear]);
    t.equal(store.tablesRow().active_partition_version, 2,
      'setup: B ran to its clear (active v2)');
    const sentByA = [];
    const a = owner(spec, store, {name: 'A', clock, sent: sentByA,
      partitions: lagging});
    const before = store.writes.length;
    const answer = await spec.start(a).then((result) => result,
      (error) => ({threw: error.message}));
    await turns(100);
    t.equal(answer.success, false, 'A answered a refusal');
    t.equal(answer.reason, 'registration-input-moved',
      'typed: an input of the registration moved');
    t.same(writesOf(store, 'A', before).filter((write) => write.changes > 0),
      [], 'A wrote nothing');
    t.same(sentByA, [], 'A sent nothing');
  });

  if (family === 'split') {
    test('V6-A4 split: a registration from a partitions view missing a ' +
      'sibling is refused by the record\'s committed partition count',
    async (t) => {
      const store = spec.store();
      const clock = {now: 1000};
      const sentByA = [];
      const missingSibling = store.partitionIds().filter((id) =>
        id !== 'users-p3').map((id) => store.partitionRow(id));
      const a = owner(spec, store, {name: 'A', clock, sent: sentByA,
        partitions: missingSibling});
      const answer = await spec.start(a).then((result) => result,
        (error) => ({threw: error.message}));
      await turns(100);
      t.equal(answer.success, false, 'A answered a refusal');
      t.equal(answer.reason, 'registration-input-moved',
        'typed: an input of the registration moved');
      t.same(writesOf(store, 'A', 0).filter((write) => write.changes > 0),
        [], 'A wrote nothing');
      t.same(sentByA, [], 'A sent nothing');
    });
  }

  for (const [label, failure, forbidden] of [
    ['B1 a non-retryable', () => new Error('peer closed'), STATE.FAILED],
    ['B2 a retryable', () => Object.assign(new Error(TIMED_OUT),
      {retryable: true}), STATE.DEFERRED],
  ]) {
    test(`${label.split(' ')[0]} ${family}: ${label.slice(3)} execution ` +
      'failure after the cutover landed never moves the phase ' +
      'back; a typed incident; the workflow reaches its terminal',
    async (t) => {
      const store = spec.store();
      const clock = {now: 1000};
      const states = [];
      store.observers.push((write) => {
        if (/^UPDATE tables/u.test(write.sql) && write.changes > 0) {
          states.push(store.tablesRow().partition_transition_state);
        }
      });
      const {lines, logger} = recordingLogger();
      const {workflow, answer} = await spec.failAfterCutover(store,
        {name: 'A', clock, logger}, failure());
      await turns(100);
      const cut = states.findIndex((state) =>
        state === STATE.SPLIT_CUTOVER_ACTIVE ||
        state === STATE.MERGE_CUTOVER_ACTIVE);
      t.ok(cut >= 0, 'setup: the cutover landed while START was answered');
      t.notOk(states.slice(cut + 1).includes(forbidden),
        `no ${forbidden} after the cutover: ${states.slice(cut).join(' -> ')}`);
      const metadata = store.metadata();
      t.equal((metadata[INCIDENTS] || []).length, 1,
        'one typed post-cutover incident on the record');
      t.equal(metadata[INCIDENTS]?.[0]?.phase, states[cut],
        'the incident names the phase it met');
      const errors = lines.filter((line) => line.level === 'error' &&
        /after the cutover/u.test(line.message));
      t.equal(errors.length, 1, 'one ERROR');
      t.same(Object.keys(errors[0]?.fields || {}).filter((field) =>
        ['workflowId', 'attempt', 'phase', 'reason'].includes(field)).sort(),
      ['attempt', 'phase', 'reason', 'workflowId'],
      'naming the workflow, its attempt, the phase and the reason');
      t.ok(answer.threw || answer.success === false,
        'execute answers the step failure');
      await deliver(spec, workflow, store, spec.toClear);
      t.equal(store.tablesRow().partition_transition_state, null,
        'the workflow continued forward to its terminal clear');
    });
  }

  test(`B3 ${family}: after a retryable START failure past the cutover, a ` +
    'fresh owner re-driving the table starts nothing from the superseded ' +
    'source', async (t) => {
    const store = spec.store();
    const clock = {now: 1000};
    await spec.failAfterCutover(store, {name: 'A', clock},
      Object.assign(new Error(TIMED_OUT), {retryable: true}));
    await turns(100);
    const state = store.tablesRow().partition_transition_state;
    t.notOk([STATE.DEFERRED, STATE.BLOCKED].includes(state),
      `setup: the record is not a re-drivable deferral (${state})`);
    clock.now += 10 * 60 * 1000;
    const sentByB = [];
    const b = owner(spec, store, {name: 'B', clock, sent: sentByB});
    await spec.start(b).catch((error) => ({threw: error.message}));
    await turns(100);
    t.same(sentByB, [], 'no START to the superseded source');
    t.notOk([STATE.ADMISSION_PENDING, STATE.SPLIT_BACKFILLING,
      STATE.MERGE_BACKFILLING].includes(store.tablesRow()
      .partition_transition_state), 'the record never moved back');
  });
}
