/**
 * Reconcile, lease and merge-retry witnesses of the workflow record's
 * ownership protocol (owner ruling 2026-10-05). Real classes over a real
 * store whose compare-and-swap SQLite evaluates at apply time
 * (workflow-record-sqlite-world.js); clocks and timers are injected.
 *
 * W4b an owner whose current write landed but whose acknowledgement was lost
 *     recognises it on the re-read and continues in the same step: the split
 *     provisions both children and reaches backfilling.
 * W4c an owner whose EARLIER write landed while it saw a failure (lost
 *     acknowledgement, its view still showing the old record): nothing is
 *     sent on the unconfirmed flip; its next write is refused, it rebuilds
 *     from the record (its own DISPATCHED mark is never written back to
 *     NONE), and the abort is derived from the adopted record and lands
 *     (no self-deadlock).
 * W5  a healthy owner driving a retirement longer than its lease renews the
 *     lease (compare-and-swap) and is never superseded; once it is dead its
 *     lease lapses and another owner's claim lands.
 * W8  a merge retry carries the target's durable DISPATCHED mark (the id
 *     is reused, not minted): its abort teardown reads the target's members
 *     and deletes nothing on a mark it never had (kills the round-4 mutant
 *     A10, "always minted").
 */
import {test} from '../../src/test-helpers/tap.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  buildMergeWorkflow,
  createDefaultPartitionInfos,
} from './managed-merge-workflow-test-helpers.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  recordingLogger,
  turns,
} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const LEFT = 'users-p-left';
const RIGHT = 'users-p-right';
const LEASE_MS = 60000;
const RETRYABLE_TIMEOUT =
  QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX + 'x';

function fakeScheduler() {
  const scheduler = {armed: [],
    setTimeout(fn, ms) {
      const timer = {fn, ms, cleared: false};
      scheduler.armed.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    pending: () => scheduler.armed.filter((timer) => !timer.cleared),
    async fireAll() {
      for (const timer of scheduler.pending()) {
        timer.cleared = true;
        timer.fn();
      }
      await turns(50);
    },
  };
  return scheduler;
}

function splitOwner(store, view, name, clock, overrides = {}) {
  const log = recordingLogger();
  const built = buildWorkflow({
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    parsePartitionTransition,
    logger: log.logger,
    now: () => clock.now,
    groupRetirementScheduler: fakeScheduler(),
    groupRetirementLeaseScheduler: fakeScheduler(),
    ...overrides,
  });
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, name, view};
}

const flipOf = (partitionId) => ({writer, sql, params}) =>
  writer === 'A' && /^UPDATE tables/u.test(sql) && params.some((value) =>
    typeof value === 'string' &&
    value.includes(`"${partitionId}":"dispatched"`)) &&
  !params.some((value) => typeof value === 'string' &&
    value.includes('"split_backfilling"'));

test('W4b a lost acknowledgement of the current write: recognised on the ' +
  're-read, the step continues', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const provisioned = [];
  const a = splitOwner(store, openView(store), 'A', clock, {
    provisionInitialTablePartition: async (context) => {
      provisioned.push([context.partitionId,
        store.metadata().targetProvisioning?.[context.partitionId]]);
    },
  });
  store.loseAckOnce(flipOf(LEFT));
  const result = await a.workflow.execute(SOURCE);
  t.equal(store.lostAcks.length, 0, 'setup: LEFT\'s flip lost its ack');
  t.equal(result.success, true, 'the split was prepared');
  t.same(provisioned, [[LEFT, 'dispatched'], [RIGHT, 'dispatched']],
    'both creates were sent, each after its durable flip');
  t.equal(store.tablesRow().partition_transition_state, 'split_backfilling',
    'the record reached backfilling');
  t.equal(a.log.lines.filter((line) => line.level === 'warn').length, 0,
    'no reconcile WARN: the write was simply recognised');
});

test('W4c an earlier write of this owner landed while it saw a failure: ' +
  'nothing is sent on it, the record is adopted (never regressed), the ' +
  'abort is derived from it (no self-deadlock)', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const provisioned = [];
  const view = openView(store);
  const a = splitOwner(store, view, 'A', clock, {
    provisionInitialTablePartition: async (context) => {
      provisioned.push(context.partitionId);
    },
  });
  // LEFT's flip lands, its acknowledgement is lost, and neither the view
  // (still the pre-flip record) nor the authoritative read answers in time:
  // the flip is unconfirmed. Afterwards the owner reaches its record again.
  let authoritativeDown = false;
  a.workflow.readAuthoritativeWorkflowRecord = async () => {
    if (authoritativeDown) throw new Error('owner unreachable');
    return store.tablesRow();
  };
  store.loseAckOnce(flipOf(LEFT));
  const coordinator = a.workflow.workflowCoordinator;
  const realUpdate = coordinator.updateWorkflow.bind(coordinator);
  let flipped = false;
  coordinator.updateWorkflow = async (workflowId, updates) => {
    const isLeftFlip = !flipped &&
      updates?.metadata?.targetProvisioning?.[LEFT] === 'dispatched';
    if (!isLeftFlip) {
      return realUpdate(workflowId, updates);
    }
    flipped = true;
    view.freeze(store.tablesRow());
    authoritativeDown = true;
    try {
      return await realUpdate(workflowId, updates);
    } finally {
      authoritativeDown = false;
      view.thaw();
    }
  };
  const first = await a.workflow.execute(SOURCE).then((value) => value,
    (error) => ({threw: error.message}));
  t.ok(flipped && store.lostAcks.length === 0,
    'setup: the flip landed and its acknowledgement was lost');
  t.ok(first.threw, 'the attempt failed on the unconfirmed flip');
  t.same(provisioned, [], 'nothing was sent on an unconfirmed flip');
  t.ok(a.log.lines.some((line) => line.level === 'warn' &&
    /own earlier write is on the record/u.test(line.message)),
  'the refused abort rebuilt the workflow from the record');
  t.equal(store.tablesRow().partition_transition_state, 'failed',
    'the abort was derived from the adopted record and landed');
  t.same(store.metadata().targetProvisioning,
    {[LEFT]: 'dispatched', [RIGHT]: 'none'},
    'LEFT\'s landed DISPATCHED was never written back to NONE');
  t.equal(store.metadata().workflowOwnerId, 'owner-A', 'A still holds it');
});

test('W5 a healthy owner renews its lease through a long retirement; a ' +
  'dead one loses it at expiry', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const leaseTimers = fakeScheduler();
  const a = splitOwner(store, openView(store), 'A', clock, {
    groupRetirementLeaseScheduler: leaseTimers,
    provisionInitialTablePartition: async (context) => {
      if (context.partitionId === RIGHT) {
        throw new Error('right create refused');
      }
    },
  });
  await a.workflow.execute(SOURCE).catch(() => {});
  const workflowId = store.metadata().workflowId;
  t.equal(store.tablesRow().partition_transition_state, 'failed',
    'setup: the split aborted after its creates');
  // The aborted children's members never answer: a long retirement.
  a.workflow.readCommittedGroupMembers = async () => ['r1', 'r2'];
  a.workflow.deliverReplicaRemoval = async () => null;
  await a.workflow.teardownAbortedSplitChildren(workflowId,
    a.workflow.resolveWorkflowState(workflowId));
  await turns();
  t.ok(a.workflow.groupRetirementRedrive.unacknowledged().length > 0,
    'setup: the retirement is incomplete and re-driven');
  const b = splitOwner(store, openView(store), 'B', clock);
  for (let third = 1; third <= 9; third += 1) {
    clock.now += LEASE_MS / 3;
    await leaseTimers.fireAll();
  }
  t.ok(store.metadata().workflowLeaseExpiresAt > clock.now,
    'three lease terms later the lease is live (renewed)');
  t.equal(store.metadata().workflowOwnerId, 'owner-A', 'A still holds it');
  b.workflow.resolveWorkflowState(workflowId);
  const refused = await claimWorkflowOwnershipCore(b.workflow, workflowId);
  t.equal(refused.accepted, false, 'another owner\'s claim is refused');
  t.equal(store.metadata().workflowOwnerId, 'owner-A', 'A is not superseded');
  // A dies: its timers never fire again.
  clock.now += LEASE_MS + 1;
  b.workflow.workflowCoordinator.removeWorkflow(workflowId);
  b.workflow.resolveWorkflowState(workflowId);
  const taken = await claimWorkflowOwnershipCore(b.workflow, workflowId);
  t.equal(taken.accepted, true, 'after the dead owner\'s lease lapsed, the ' +
    'claim lands');
  t.equal(store.metadata().workflowOwnerId, 'owner-B', 'B holds it');
  t.equal(store.metadata().workflowFenceToken, 2, 'on the next fence');
});

test('W8 a merge retry carries the target\'s DISPATCHED mark; its abort ' +
  'teardown reads the members and deletes nothing', async (t) => {
  const partitionInfos = createDefaultPartitionInfos();
  const store = openRecordStore({partitions:
    Object.values(partitionInfos).map((row) => ({...row}))});
  const clock = {now: 1000};
  let attempt = 0;
  const view = openView(store);
  const log = recordingLogger();
  const {workflow} = buildMergeWorkflow({
    cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    logger: log.logger,
    now: () => clock.now,
    groupRetirementScheduler: fakeScheduler(),
    groupRetirementLeaseScheduler: fakeScheduler(),
    waitForTablePartitionMetadata: async () => {
      if (attempt === 1) throw new Error('target metadata never converged');
    },
    provisionInitialTablePartition: async () => {
      if (attempt === 0) throw new Error(RETRYABLE_TIMEOUT);
    },
  });
  workflow.workflowOwnerId = 'owner-A';
  readAuthoritativelyFrom(workflow, store);
  const sources = {leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID};
  await workflow.execute(sources).catch(() => {});
  const target = store.metadata().targetPartitionIds?.[0];
  t.equal(store.tablesRow().partition_transition_state, 'deferred',
    'setup: attempt 0 deferred after its create was dispatched');
  t.equal(store.metadata().targetProvisioning?.[target], 'dispatched',
    'setup: the target is durably DISPATCHED');
  attempt = 1;
  clock.now += 2 * LEASE_MS;
  await workflow.execute(sources).catch(() => {});
  const metadata = store.metadata();
  t.equal(metadata.targetPartitionIds?.[0], target, 'the retry reused the ' +
    'target id');
  t.equal(store.tablesRow().partition_transition_state, 'failed',
    'the retry aborted before its own flip');
  t.equal(metadata.targetProvisioning?.[target], 'dispatched',
    'the retry carried DISPATCHED (a reused id is never minted NONE)');
  const seen = {reads: 0};
  workflow.readCommittedGroupMembers = async () => {
    seen.reads += 1;
    return ['t1', 't2'];
  };
  workflow.deliverReplicaRemoval = async () => null;
  await workflow.teardownAbortedMergeTarget(metadata.workflowId,
    workflow.resolveWorkflowState(metadata.workflowId));
  await turns();
  t.ok(seen.reads >= 1, 'the teardown read the target\'s members');
  t.same(store.partitionDeletesBy('A'), [], 'nothing was deleted');
  t.ok(store.partitionRow(target), 'the target row is kept until its ' +
    'members answer');
});
