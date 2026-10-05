/**
 * W2 (owner ruling 2026-10-05: "the loser cannot regress any durable
 * fact"). For each durable fact of a split workflow's record - the lease
 * and fence, a target's provisioning mark, the phase, the frozen member set,
 * the members' addresses, the dissolved set, the never-provisioned mark, and
 * the completion (the record's clear) - a stale owner's write that would
 * regress it is refused at apply time, the record is byte-for-byte
 * unchanged, the stale owner drops its copy and logs one WARN, and its
 * teardown deletes nothing.
 *
 * Shape: owner B started the split (attempt 0 deferred: marks NONE, B's
 * fence 1) and kept that version in memory; its lease lapsed; owner A
 * claimed (fence 2), provisioned both children (DISPATCHED), reached
 * backfilling and recorded the retirement facts on the source participant.
 * B then writes from its stale copy through the PRODUCTION paths.
 *
 * Real classes and a real store: workflow-record-sqlite-world.js.
 */
import {test} from '../../src/test-helpers/tap.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {recordParticipant} from './workflow-record-test-support.js';
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
const SOURCE_KEY = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
const FACTS = Object.freeze({
  [SPLIT_ACK_CHECKPOINT_FIELD.REQUIRED_REPLICA_IDS]: ['r1', 'r2', 'r3'],
  [SPLIT_ACK_CHECKPOINT_FIELD.MEMBER_NODE_IDS]: {r1: 'n1', r2: 'n2',
    r3: 'n3'},
  [SPLIT_ACK_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS]: ['r1'],
  [SPLIT_ACK_CHECKPOINT_FIELD.NEVER_PROVISIONED]: false,
});

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
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    ...overrides,
  });
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, name, view};
}

// B's attempt 0 (deferred), B's stale copy of it, A's claim, provisioning
// and recorded retirement facts.
async function staleOwnerWorld() {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const b = splitOwner(store, openView(store), 'B', clock, {
    waitForTablePartitionMetadata: async () => {
      throw new Error(
        QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX + 'x');
    },
  });
  await b.workflow.execute(SOURCE).catch(() => {});
  const workflowId = store.metadata().workflowId;
  b.view.freeze();
  b.workflow.resolveWorkflowState(workflowId);
  clock.now += 2 * LEASE_MS;
  const a = splitOwner(store, openView(store), 'A', clock);
  const prepared = await a.workflow.execute(SOURCE);
  a.workflow.resolveWorkflowState(workflowId);
  // A records the retirement facts on the source participant (a change of
  // the record by its owner).
  await a.workflow.workflowCoordinator.updateWorkflow(workflowId,
    (current) => {
      const participants = new Map(current.participants);
      const source = participants.get(SOURCE_KEY);
      participants.set(SOURCE_KEY, {...source,
        checkpoint: {...(source.checkpoint || {}), ...FACTS}});
      return {...current, participants};
    });
  return {store, clock, a, b, workflowId, prepared};
}

function factsOf(store) {
  const metadata = store.metadata();
  return {
    owner: metadata.workflowOwnerId,
    fence: metadata.workflowFenceToken,
    lease: metadata.workflowLeaseExpiresAt,
    marks: metadata.targetProvisioning,
    state: store.tablesRow().partition_transition_state,
    checkpoint: metadata.participants?.[SOURCE_KEY]?.checkpoint,
  };
}

// Each stale write, through the production path that would carry it.
const STALE_WRITES = Object.freeze([
  ['lease and fence (a renewal of B\'s lapsed claim)', async (world) =>
    claimWorkflowOwnershipCore(world.b.workflow, world.workflowId,
      {renew: true})],
  ['provisioning mark (B aborts with its NONE marks)', async (world) =>
    world.b.workflow.persistExecutionFailure(world.workflowId,
      new Error('stale abort'))],
  ['phase (B rewrites its deferred phase)', async (world) =>
    world.b.workflow.workflowCoordinator.updateWorkflow(world.workflowId,
      (current) => ({...current,
        status: PARTITION_TRANSITION_STATE.DEFERRED}))],
  ['frozen set, addresses, dissolved set, never-provisioned (B flushes ' +
    'its source participant)', async (world) =>
    recordParticipant(world.b.workflow, world.workflowId,
      {participantKey: SOURCE_KEY, status: 'backfill_running',
        checkpoint: {}})],
  ['completion (B clears the record)', async (world) =>
    world.b.workflow.persistTerminalTransitionClear(
      world.b.workflow.resolveWorkflowState(world.workflowId))],
]);

for (const [fact, write] of STALE_WRITES) {
  test(`W2 a stale owner cannot regress: ${fact}`, async (t) => {
    const world = await staleOwnerWorld();
    const {store, b, workflowId} = world;
    t.equal(world.prepared.success, true, 'setup: A prepared the split');
    const before = store.tablesRow();
    const facts = factsOf(store);
    t.equal(facts.owner, 'owner-A', 'setup: A holds the record');
    t.equal(facts.fence, 2, 'setup: at fence 2');
    t.same(facts.marks, {[LEFT]: 'dispatched', [RIGHT]: 'dispatched'},
      'setup: both children DISPATCHED');
    t.same(facts.checkpoint, {...facts.checkpoint, ...FACTS},
      'setup: the retirement facts are recorded');
    t.equal(b.workflow.workflowCoordinator.getWorkflowById(workflowId)
      ?.fenceToken, 1, 'setup: B holds its fence-1 copy');
    const landedBefore = store.tablesWritesBy('B')
      .filter((entry) => entry.changes > 0).length;
    const submittedBefore = store.tablesWritesBy('B').length;
    const outcome = await write(world).then((value) => ({value}),
      (error) => ({error}));
    t.ok(outcome.error || outcome.value?.accepted === false ||
      outcome.value === undefined,
    'B\'s write is refused (typed) or swallowed as a logged failure');
    t.equal(store.tablesWritesBy('B').length, submittedBefore + 1,
      'B submitted its write once (it reached the store, no retry)');
    t.equal(store.tablesWritesBy('B').filter((entry) => entry.changes > 0)
      .length, landedBefore, 'no write of B landed');
    t.same(store.tablesRow(), before, 'the record is byte-for-byte unchanged');
    t.same(factsOf(store), facts, 'every durable fact is unchanged');
    t.equal(b.workflow.workflowCoordinator.getWorkflowById(workflowId), null,
      'B dropped its stale copy');
    t.equal(b.log.lines.filter((line) => line.level === 'warn' &&
      /another owner holds the record/u.test(line.message)).length, 1,
    'one WARN names the loss');
    // Its teardown, on the record it can now see, deletes nothing.
    b.view.thaw();
    b.workflow.readCommittedGroupMembers = async () => ['r1', 'r2', 'r3'];
    b.workflow.deliverReplicaRemoval = async () => null;
    await b.workflow.teardownAbortedSplitChildren(workflowId,
      b.workflow.resolveWorkflowState(workflowId));
    await turns();
    t.same(store.partitionDeletesBy('B'), [], 'B deleted no partition row');
    t.same(store.tablesRow(), before, 'still unchanged');
  });
}
