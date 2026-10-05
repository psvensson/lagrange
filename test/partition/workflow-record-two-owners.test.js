/**
 * Two GENUINE concurrent owners of one split or merge workflow (owner ruling
 * 2026-10-05: claim before register; every write a compare-and-swap on the
 * record as read; the loser can never regress a durable fact).
 *
 * Real classes: ManagedSplitWorkflow / ManagedMergeWorkflow (execute, their
 * PRODUCTION claim, registration, provisioning-mark, transition, recovery
 * and teardown paths), each over its own PRODUCTION CDCIntegrationService and
 * control-plane gateway, writing one shared SQLite `tables`/`partitions`
 * store whose WHERE clauses SQLite evaluates at apply time
 * (workflow-record-sqlite-world.js). Clocks are injected.
 *
 * W1  (the round-4 verifier's H1-B probe) owner B, on a stale view of the
 *     record, executes the same split while owner A holds the live lease and
 *     has durably flipped LEFT to DISPATCHED and sent its create: B writes
 *     nothing (its registration is refused), A's mark, fence, owner and lease
 *     are intact, and B's teardown deletes nothing. Split, at B's clock equal
 *     to A's and 61 s ahead; merge the same.
 * W6  a live foreign lease writes nothing: with a current read, neither a
 *     registration nor a fresh claim submits any write (the round-5
 *     surviving mutant V4).
 * W3  two owners execute the same split from the same read: exactly one
 *     registration lands; the loser stops after ONE refused write, holds
 *     nothing in memory, and logs one WARN naming its fence and the record's
 *     owner and fence; no loop.
 */
import {test} from '../../src/test-helpers/tap.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {
  claimWorkflowOwnershipCore,
  registerWorkflowWithClaim,
} from '../../src/partition/managed-workflow-ownership-core.js';
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
const NEVER = new Promise(() => {});

// One split owner over the real store: its own CDC service, its own view.
function splitOwner(store, view, name, overrides = {}) {
  const log = recordingLogger();
  const built = buildWorkflow({
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    parsePartitionTransition,
    logger: log.logger,
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    ...overrides,
  });
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, name, view};
}

// The teardown's group reads and deliveries, observed on one owner.
function observeTeardown(owner) {
  const seen = {reads: [], deliveries: 0};
  owner.workflow.readCommittedGroupMembers = async (partitionId) => {
    seen.reads.push(partitionId);
    return ['r1', 'r2', 'r3'];
  };
  owner.workflow.listPartitionServiceRows = () => [];
  owner.workflow.deliverReplicaRemoval = async () => {
    seen.deliveries += 1;
    return null;
  };
  return seen;
}

function marksOf(store) {
  return store.metadata().targetProvisioning ?? {};
}

function claimOf(store) {
  const metadata = store.metadata();
  return {owner: metadata.workflowOwnerId, fence: metadata.workflowFenceToken,
    lease: metadata.workflowLeaseExpiresAt};
}

for (const bClockOffset of [0, LEASE_MS + 1000]) {
  test('W1 split: a stale second owner cannot register over a live lease ' +
    `(B clock +${bClockOffset})`, async (t) => {
    const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
    const clock = {now: 1000};
    let attempt = 0;
    let bResult = null;
    let bOwner = null;
    const provisioned = [];
    const viewA = openView(store);
    const a = splitOwner(store, viewA, 'A', {
      now: () => clock.now,
      waitForTablePartitionMetadata: async () => {
        if (attempt === 0) {
          throw new Error(
            QUERY_ERROR_MSG.TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX +
            'attempt 0');
        }
      },
      provisionInitialTablePartition: async (context) => {
        provisioned.push([context.partitionId,
          marksOf(store)[context.partitionId]]);
        if (context.partitionId === LEFT) {
          // A's create for LEFT is sent (its DISPATCHED flip is durable):
          // B runs on its stale view now, then A stops forever.
          bResult = await bOwner.workflow.execute(SOURCE).catch(
            (error) => ({threw: error.message}));
          await NEVER;
        }
      },
    });
    bOwner = splitOwner(store, openView(store), 'B', {
      now: () => clock.now + bClockOffset,
      waitForTablePartitionMetadata: async () => {
        throw new Error('partition metadata never converged');
      },
    });
    await a.workflow.execute(SOURCE).catch(() => {});
    t.equal(store.tablesRow().partition_transition_state, 'deferred',
      'setup: attempt 0 deferred with its persisted plan');
    t.same(marksOf(store), {[LEFT]: 'none', [RIGHT]: 'none'},
      'setup: both children NONE');
    const stale = store.tablesRow();
    attempt = 1;
    clock.now += 2 * LEASE_MS;
    bOwner.view.freeze(stale);
    a.workflow.execute(SOURCE).catch(() => {});
    await turns(400);
    bOwner.view.thaw();
    const after = claimOf(store);
    t.same(provisioned, [[LEFT, 'dispatched']],
      'A sent LEFT\'s create only after its DISPATCHED flip was durable');
    t.equal(bResult?.success, false, 'B does not drive the split');
    t.ok(['storage_rejected', 'active_owner'].includes(bResult?.ownership),
      `B's start is a typed ownership refusal (${bResult?.ownership})`);
    t.equal(store.tablesWritesBy('B').filter((write) => write.changes > 0)
      .length, 0, 'no write of B landed');
    t.equal(store.tablesWritesBy('B').length <= 1, true,
      'B submitted at most its one refused registration');
    t.equal(marksOf(store)[LEFT], 'dispatched',
      'A\'s DISPATCHED mark is intact');
    t.equal(after.owner, 'owner-A', 'the record names A');
    t.equal(store.tablesRow().partition_transition_state, 'split_preparing',
      'A\'s phase is intact');
    t.ok(after.lease > clock.now, 'A\'s lease is intact and live');
    t.equal(bOwner.workflow.workflowCoordinator.getWorkflowById(
      store.metadata().workflowId), null, 'B holds nothing in memory');
    // B's teardown of the record it can now see deletes nothing: it does
    // not hold the record.
    const seen = observeTeardown(bOwner);
    const workflowId = store.metadata().workflowId;
    await bOwner.workflow.teardownAbortedSplitChildren(workflowId,
      bOwner.workflow.resolveWorkflowState(workflowId));
    await turns();
    t.same(store.partitionDeletesBy('B'), [], 'B\'s teardown deleted no row');
    t.equal(seen.deliveries, 0, 'B sent no REMOVE');
    t.same(store.partitionIds().sort(), [SOURCE, LEFT, RIGHT].sort(),
      'every partition row survives');
    t.equal(marksOf(store)[LEFT], 'dispatched', 'the mark is still intact');
    t.same(claimOf(store), after, 'A\'s claim triple is untouched');
  });
}

test('W1 merge: a stale second owner cannot register over a live lease',
  async (t) => {
    const partitionInfos = createDefaultPartitionInfos();
    const store = openRecordStore({partitions:
      Object.values(partitionInfos).map((row) => ({...row}))});
    const clock = {now: 1000};
    let bOwner = null;
    let bResult = null;
    const view = openView(store);
    const bView = openView(store);
    const staleRow = store.tablesRow();
    const mergeOwner = (name, ownerView, overrides) => {
      const log = recordingLogger();
      const built = buildMergeWorkflow({
        cdcIntegrationService: store.cdcFor(name),
        getTableInfo: () => ownerView.row(),
        listTableInfos: () => ownerView.list(),
        getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
        listTablePartitionRows: () => store.partitionIds()
          .map((id) => store.partitionRow(id)),
        logger: log.logger,
        now: () => clock.now,
        groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
        ...overrides,
      });
      built.workflow.workflowOwnerId = `owner-${name}`;
      readAuthoritativelyFrom(built.workflow, store);
      return {...built, log};
    };
    const a = mergeOwner('A', view, {
      provisionInitialTablePartition: async () => {
        bView.freeze(staleRow);
        bResult = await bOwner.workflow.execute({
          leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
          rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
        }).catch((error) => ({threw: error.message}));
        await NEVER;
      },
    });
    bOwner = mergeOwner('B', bView, {
      waitForTablePartitionMetadata: async () => {
        throw new Error('partition metadata never converged');
      },
    });
    a.workflow.execute({leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID}).catch(() => {});
    await turns(400);
    bView.thaw();
    const metadata = store.metadata();
    const target = metadata.targetPartitionIds?.[0];
    t.ok(target, 'setup: A registered the merge and its target');
    t.equal(metadata.targetProvisioning?.[target], 'dispatched',
      'A\'s DISPATCHED mark is intact');
    t.equal(metadata.workflowOwnerId, 'owner-A', 'the record names A');
    t.equal(bResult?.success, false, 'B does not drive the merge');
    t.equal(store.tablesWritesBy('B').filter((write) => write.changes > 0)
      .length, 0, 'no write of B landed');
    const seen = observeTeardown(bOwner);
    await bOwner.workflow.teardownAbortedMergeTarget(metadata.workflowId,
      bOwner.workflow.resolveWorkflowState(metadata.workflowId));
    await turns();
    t.same(store.partitionDeletesBy('B'), [], 'B\'s teardown deleted no row');
    t.equal(seen.deliveries, 0, 'B sent no REMOVE');
    t.equal(store.metadata().targetProvisioning?.[target], 'dispatched',
      'the mark is still intact');
    t.equal(store.metadata().workflowOwnerId, 'owner-A', 'A still holds it');
  });

test('W3 two owners racing from the same read: exactly one registration ' +
  'lands, the loser stops after one refused write', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const stall = () => NEVER;
  const owners = ['A', 'B'].map((name) => splitOwner(store, openView(store),
    name, {now: () => clock.now, waitForTablePartitionMetadata: stall}));
  const initial = store.tablesRow();
  for (const owner of owners) {
    owner.view.freeze(initial);
  }
  for (const owner of owners) {
    owner.result = owner.workflow.execute(SOURCE).then((result) => result,
      (error) => ({threw: error.message}));
  }
  await turns(300);
  for (const owner of owners) {
    owner.view.thaw();
  }
  const metadata = store.metadata();
  const winner = owners.find((owner) =>
    metadata.workflowOwnerId === owner.workflow.workflowOwnerId);
  const loser = owners.find((owner) => owner !== winner);
  t.ok(winner, `exactly one owner holds the record (${metadata.workflowOwnerId})`);
  const loserResult = await Promise.race([loser.result,
    turns(50).then(() => 'still running')]);
  t.equal(loserResult?.ownership, 'storage_rejected',
    'the loser\'s start is the typed refusal');
  t.equal(store.tablesWritesBy(loser.name).length, 1,
    'the loser submitted exactly one write');
  t.equal(store.tablesWritesBy(loser.name)[0].changes, 0,
    'and it did not land');
  t.equal(metadata.workflowFenceToken, 1, 'one claim: fence 1');
  t.equal(loser.workflow.workflowCoordinator.getWorkflowById(
    metadata.workflowId), null, 'the loser holds nothing in memory');
  const warns = loser.log.lines.filter((line) => line.level === 'warn' &&
    /another owner holds the record/u.test(line.message));
  t.equal(warns.length, 1, 'the loser logs one WARN');
  t.equal(warns[0]?.fields?.recordOwnerId, winner.workflow.workflowOwnerId,
    'naming the record\'s owner');
  t.equal(warns[0]?.fields?.recordFenceToken, 1, 'and its fence');
  await turns(100);
  t.equal(store.tablesWritesBy(loser.name).length, 1, 'no loop: nothing more');
});

// W6 (the round-5 verifier's surviving mutant V4: "the claim ignores a live
// foreign lease"): with a CURRENT read of a record whose lease is another
// owner's and live, neither a registration nor a fresh claim writes
// anything - the precondition refuses before any compare-and-swap.
test('W6 a live foreign lease writes nothing: registration and fresh claim ' +
  'refuse before any write', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: SOURCE}]});
  const clock = {now: 1000};
  const a = splitOwner(store, openView(store), 'A', {
    now: () => clock.now,
    waitForTablePartitionMetadata: async () => NEVER,
  });
  a.workflow.execute(SOURCE).catch(() => {});
  await turns(200);
  const held = claimOf(store);
  t.equal(held.owner, 'owner-A', 'setup: A holds the record');
  t.ok(held.lease > clock.now, 'setup: A\'s lease is live');
  const before = store.tablesRow();
  const b = splitOwner(store, openView(store), 'B', {now: () => clock.now});
  // B's registration, derived from a CURRENT read (claim before register).
  const workflowId = store.metadata().workflowId;
  const registration = await registerWorkflowWithClaim(b.workflow, {
    workflowId, ownerKey: SOURCE, tableId: 'tbl-users', tableName: 'users',
    partitionId: SOURCE, status: 'admission_pending',
    metadata: {...store.metadata()}, createdAt: clock.now,
    updatedAt: clock.now}, store.tablesRow());
  t.equal(registration.refusal, 'active_owner',
    'the registration is refused typed: a live foreign lease');
  t.equal(registration.workflow, undefined, 'nothing registered');
  b.workflow.resolveWorkflowState(workflowId);
  const claim = await claimWorkflowOwnershipCore(b.workflow, workflowId);
  t.equal(claim.accepted, false, 'the fresh claim is refused');
  t.equal(claim.result, 'active_owner', 'typed: a live foreign lease');
  t.equal(store.tablesWritesBy('B').length, 0, 'B submitted no write at all');
  t.same(store.tablesRow(), before, 'the record is byte-for-byte unchanged');
});
