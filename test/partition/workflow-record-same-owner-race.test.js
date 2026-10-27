/**
 * S1: concurrency WITHIN one owner against the production split and merge
 * workflows (round-5 verifier H5-A, owner decision 2026-10-05 option A: the
 * record store accepts only changes, applied one at a time per workflow to
 * the latest acknowledged record and compared against exactly that).
 *
 * The owner's provisioning-mark write has APPLIED but its acknowledgement
 * has not yet returned; in that window the SAME owner issues another write
 * of the same workflow - a lease renewal (the re-drive renewal timer, a
 * step renewal, assertWorkflowRecordHeld all renew through
 * claimWorkflowOwnershipCore) or a source participant acknowledgement (the
 * production entry acknowledgeSourceParticipant /
 * acknowledgeMergeSourceParticipant). Neither may roll the durable
 * DISPATCHED mark back; and when the owner dies in that window, a successor
 * recovering through production recovery reads DISPATCHED, reads the
 * target's members and deletes no row on an empty member set.
 *
 * Real ManagedSplitWorkflow / ManagedMergeWorkflow, each over its own
 * PRODUCTION CDCIntegrationService and control-plane gateway, writing one
 * real SQLite `tables`/`partitions` store that evaluates the WHERE clause at
 * apply time (workflow-record-sqlite-world.js). Injected clocks.
 */
import {test} from '../../src/test-helpers/tap.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {PARTICIPANT_ACK_FIELD} from
  '../../src/workflow/workflow-constants.js';
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
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  recordingLogger,
  turns,
} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const LEASE_MS = 60000;
const NEVER = new Promise(() => {});
const DISPATCHED = 'dispatched';
const RACERS = ['renewal', 'acknowledgement'];

function noTimers() {
  return {setTimeout: () => null, clearTimeout() {}};
}

function splitOwner(store, name, clock, overrides = {}) {
  const view = openView(store);
  const log = recordingLogger();
  const built = buildWorkflow({
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    parsePartitionTransition,
    logger: log.logger,
    now: () => clock.now,
    groupRetirementScheduler: noTimers(),
    groupRetirementLeaseScheduler: noTimers(),
    ...overrides,
  });
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, name, view};
}

function mergeOwner(store, name, clock, overrides = {}) {
  const view = openView(store);
  const log = recordingLogger();
  const built = buildMergeWorkflow({
    cdcIntegrationService: store.cdcFor(name),
    getTableInfo: () => view.row(),
    listTableInfos: () => view.list(),
    getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
    listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    logger: log.logger,
    now: () => clock.now,
    groupRetirementScheduler: noTimers(),
    groupRetirementLeaseScheduler: noTimers(),
    ...overrides,
  });
  built.workflow.workflowOwnerId = `owner-${name}`;
  readAuthoritativelyFrom(built.workflow, store);
  return {...built, log, name, view};
}

// The first write of `writer` that makes some target DISPATCHED while the
// compared record (the WHERE clause's metadata) does not yet hold it.
function isFirstDispatchFlip(writer) {
  return (write) => write.writer === writer &&
    /^UPDATE tables/u.test(write.sql) && write.changes === 1 &&
    write.params.some((value) => typeof value === 'string' &&
      value.includes(`":"${DISPATCHED}"`)) &&
    !String(write.params.at(-2) ?? '').includes(`":"${DISPATCHED}"`);
}

function dispatchedTargetsOf(store) {
  return Object.entries(store.metadata().targetProvisioning ?? {})
    .filter(([, mark]) => mark === DISPATCHED).map(([id]) => id);
}

const FAMILY = {
  split: {
    owner: splitOwner,
    start: (owner) => owner.workflow.execute(SOURCE),
    acknowledge: (owner, workflowId, fenceToken) =>
      owner.workflow.acknowledgeSourceParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
      }),
    teardown: (owner, workflowId) =>
      owner.workflow.teardownAbortedSplitChildren(workflowId,
        owner.workflow.workflowCoordinator.getWorkflowById(workflowId)),
    store: () => openRecordStore({partitions: [{partition_id: SOURCE}]}),
  },
  merge: {
    owner: mergeOwner,
    start: (owner) => owner.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
    }),
    acknowledge: (owner, workflowId, fenceToken) =>
      owner.workflow.acknowledgeMergeSourceParticipant(workflowId, {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
          buildMergeSourceParticipantKey(FIXTURE_LEFT_PARTITION_ID),
        [PARTICIPANT_ACK_FIELD.STATUS]: MERGE_ACK_STATUS.SNAPSHOT_STARTED,
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1500,
      }),
    teardown: (owner, workflowId) =>
      owner.workflow.teardownAbortedMergeTarget(workflowId,
        owner.workflow.workflowCoordinator.getWorkflowById(workflowId)),
    store: () => openRecordStore({partitions:
      Object.values(createDefaultPartitionInfos()).map((row) => ({...row}))}),
  },
};

// Fire the racer of the SAME owner the moment the flip has applied, before
// its acknowledgement returns to the owner.
function armRacer(store, family, racer, owner, clock) {
  const armed = {fired: false, promise: null};
  store.loseAckOnce((write) => {
    if (armed.fired || !isFirstDispatchFlip(owner.name)(write)) {
      return false;
    }
    armed.fired = true;
    const metadata = store.metadata();
    const workflowId = metadata.workflowId;
    armed.promise = Promise.resolve().then(() => racer === 'renewal' ?
      claimWorkflowOwnershipCore(owner.workflow, workflowId, {renew: true}) :
      FAMILY[family].acknowledge(owner, workflowId,
        metadata.workflowFenceToken)).then((result) => result,
      (error) => ({threw: error.message}));
    clock.now += 1;
    return false;
  });
  return armed;
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

for (const family of Object.keys(FAMILY)) {
  for (const racer of RACERS) {
    test(`S1-R1 ${family}: the owner's own ${racer} racing its DISPATCHED ` +
      'flip never rolls the durable mark back', async (t) => {
      const store = FAMILY[family].store();
      const clock = {now: 1000};
      const provisioned = [];
      const a = FAMILY[family].owner(store, 'A', clock, {
        provisionInitialTablePartition: async (context) => {
          provisioned.push(context.partitionId);
          await NEVER; // the create is sent; A then stalls
        },
      });
      const armed = armRacer(store, family, racer, a, clock);
      FAMILY[family].start(a).catch(() => {});
      await turns(400);
      t.ok(armed.fired, 'setup: the racer fired while the flip was in flight');
      const raced = await armed.promise;
      t.comment(`racer: ${JSON.stringify(raced?.result ?? raced?.threw ??
        raced?.accepted ?? null)}`);
      t.equal(provisioned.length, 1, 'A sent exactly one create');
      t.same(dispatchedTargetsOf(store), provisioned,
        'the durable mark of the target whose create was sent is DISPATCHED');
      const workflowId = store.metadata().workflowId;
      const live = a.workflow.workflowCoordinator.getWorkflowById(workflowId);
      t.equal(live?.metadata?.targetProvisioning?.[provisioned[0]], DISPATCHED,
        'the projection agrees with the record');
      t.equal(store.metadata().workflowOwnerId, 'owner-A',
        'A still holds the record');
    });

    test(`S1-R3 ${family}: ${racer} race, the owner dies in the window, a ` +
      'successor recovers and aborts: the dispatched target is never ' +
      'deleted on an empty member set', async (t) => {
      const store = FAMILY[family].store();
      const clock = {now: 1000};
      const provisioned = [];
      const a = FAMILY[family].owner(store, 'A', clock, {
        provisionInitialTablePartition: async (context) => {
          provisioned.push(context.partitionId);
          await NEVER; // A's create is sent; A dies here
        },
      });
      const armed = armRacer(store, family, racer, a, clock);
      FAMILY[family].start(a).catch(() => {});
      await turns(400);
      await armed.promise;
      t.ok(armed.fired, 'setup: the racer fired during the flip');
      const target = provisioned[0];
      t.ok(target, 'setup: A sent one create');
      const workflowId = store.metadata().workflowId;
      clock.now += LEASE_MS + 1000;
      const b = FAMILY[family].owner(store, 'B', clock);
      const seen = observeTeardown(b);
      b.workflow.resolveWorkflowState(workflowId);
      const claim = await claimWorkflowOwnershipCore(b.workflow, workflowId);
      t.equal(claim.accepted, true, 'the successor claims after the lapse');
      await b.workflow.persistExecutionFailure(workflowId,
        new Error('successor aborts'));
      t.equal(store.tablesRow().partition_transition_state, 'failed',
        'the successor aborted');
      t.equal(store.metadata().targetProvisioning?.[target], DISPATCHED,
        'the successor read DISPATCHED for the target whose create was sent');
      await FAMILY[family].teardown(b, workflowId);
      await turns(200);
      t.ok(seen.reads.includes(target),
        'the successor read the dispatched target\'s members');
      t.notOk(store.partitionDeletesBy('B').includes(target),
        'the dispatched target\'s row is never deleted while its members ' +
        'have not answered');
      t.ok(store.partitionIds().includes(target), 'its row survives');
    });
  }
}
