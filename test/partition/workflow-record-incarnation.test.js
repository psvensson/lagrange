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
function common(store, {name, clock, logger, sent, start, partitions}) {
  const view = openView(store);
  const rowOf = (id) => (partitions ? partitions.find((row) =>
    row.partition_id === id) ?? null : store.partitionRow(id));
  const rows = () => partitions ?? store.partitionIds()
    .map((id) => store.partitionRow(id));
  const send = async (...args) => {
    sent.push(args[0]);
    return start ? start(...args) : undefined;
  };
  return {cdcIntegrationService: store.cdcFor(name),
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

const FAMILY = {
  split: {
    store: () => openRecordStore({partitions: [{partition_id: SPLIT_SOURCE},
      {partition_id: 'users-p3'}]}),
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
  workflow.workflowOwnerId = `owner-${options.name}`;
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
    await deliver(spec, b, store, [...spec.toCutover, ...spec.toClear]);
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
