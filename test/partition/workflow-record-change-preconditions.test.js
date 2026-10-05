/**
 * The record changes' own preconditions, each applied to the RECORD at the
 * change's turn even when this owner's projection is older (option A): the
 * provisioning mark flips only while the record is preparing and before its
 * target's group froze a member set; a frozen member set never changes; the
 * answered (dissolved) ids only grow. In each case the record moves under
 * the owner (another write lands between its read and its change), so the
 * change's compare-and-swap is refused, the authoritative record re-read and
 * the SAME change re-applied to it - where its precondition decides.
 *
 * Real ManagedSplitWorkflow, production CDC and gateway, real SQLite store
 * (workflow-record-sqlite-world.js).
 */
import {test} from '../../src/test-helpers/tap.js';
import {markTargetProvisioningDispatched} from
  '../../src/partition/target-provisioning-mark.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {registerFromRecordAsRead} from './workflow-record-test-support.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  turns,
} from './workflow-record-sqlite-world.js';

const SOURCE = 'users-p1';
const LEFT = 'users-p-left';
const RIGHT = 'users-p-right';
const LEFT_KEY = 'left-child';
const NO_TIMERS = Object.freeze({setTimeout: () => null, clearTimeout() {}});

async function ownerOf(status, marks) {
  const store = openRecordStore({partitions: [SOURCE, LEFT, RIGHT].map(
    (partitionId) => ({partition_id: partitionId}))});
  const view = openView(store);
  const {workflow} = buildWorkflow({cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(), listTableInfos: () => view.list(),
    getPartitionInfo: (id) => store.partitionRow(id),
    parsePartitionTransition, now: () => 1000,
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    groupRetirementScheduler: NO_TIMERS,
    groupRetirementLeaseScheduler: NO_TIMERS});
  workflow.workflowOwnerId = 'owner-A';
  readAuthoritativelyFrom(workflow, store);
  const workflowId = 'split-preconditions';
  await registerFromRecordAsRead(workflow, {workflowId, ownerKey: SOURCE,
    tableId: store.tableId, tableName: 'users', partitionId: SOURCE, status,
    metadata: {workflowId, sourcePartitionId: SOURCE,
      targetPartitionVersion: 2, targetPartitionIds: [LEFT, RIGHT],
      targetProvisioning: marks}, createdAt: 1000, updatedAt: 1000});
  return {store, workflow, workflowId};
}

// Another writer's change lands on the record (the owner's projection does
// not see it): the left child's checkpoint gains `fields`.
function landForeignCheckpoint(store, fields) {
  const metadata = store.metadata();
  const left = metadata.participants[LEFT_KEY];
  left.checkpoint = {...(left.checkpoint || {}), ...fields};
  store.db.prepare('UPDATE tables SET partition_transition_metadata = ? ' +
    'WHERE table_id = ?').run(JSON.stringify(metadata), store.tableId);
}

const leftCheckpoint = (store) =>
  store.metadata().participants[LEFT_KEY]?.checkpoint || {};

test('the provisioning mark never flips on an aborted record (no create may ' +
  'follow an abort)', async (t) => {
  const {store, workflow, workflowId} = await ownerOf('split_preparing',
    {[LEFT]: 'none', [RIGHT]: 'none'});
  await workflow.persistExecutionFailure(workflowId, new Error('aborted'));
  t.equal(store.tablesRow().partition_transition_state, 'failed', 'setup');
  const landed = store.writes.filter((write) => write.changes > 0).length;
  await t.rejects(markTargetProvisioningDispatched(workflow, workflowId,
    LEFT), /refused/u, 'the flip is refused typed');
  t.equal(store.metadata().targetProvisioning[LEFT], 'none',
    'the mark stays NONE');
  t.equal(store.writes.filter((write) => write.changes > 0).length, landed,
    'nothing was written');
});

test('the provisioning mark never flips once its group froze a member set, ' +
  'even when the freeze landed under this owner', async (t) => {
  const {store, workflow, workflowId} = await ownerOf('split_preparing',
    {[LEFT]: 'none', [RIGHT]: 'none'});
  landForeignCheckpoint(store, {requiredReplicaIds: [],
    neverProvisioned: true});
  await t.rejects(markTargetProvisioningDispatched(workflow, workflowId,
    LEFT), /refused/u, 'the flip is refused typed on the re-read record');
  t.equal(store.metadata().targetProvisioning[LEFT], 'none',
    'the mark stays NONE beside the frozen never-provisioned set');
});

// An aborted record whose LEFT child was provisioned (DISPATCHED): its
// teardown freezes and retires the child's members.
function arrangeTeardown(workflow, {members, answer, onRead, onDeliver}) {
  workflow.readCommittedGroupMembers = async () => {
    onRead?.();
    return members;
  };
  workflow.listPartitionServiceRows = (partitionId) => members.map(
    (replicaId) => ({partition_id: partitionId, replica_id: replicaId,
      node_id: `n-${replicaId}`}));
  const delivered = [];
  workflow.deliverReplicaRemoval = async ({message}) => {
    const replicaId = message?.replicaId;
    delivered.push(replicaId);
    onDeliver?.(replicaId);
    return answer(replicaId);
  };
  return delivered;
}

test('a frozen member set never changes: a freeze from an older projection ' +
  'is refused on the record, nothing is sent', async (t) => {
  const {store, workflow, workflowId} = await ownerOf('failed',
    {[LEFT]: 'dispatched', [RIGHT]: 'dispatched'});
  // The committed configuration this owner reads now has three members;
  // meanwhile another write froze two on the record.
  const delivered = arrangeTeardown(workflow, {members: ['r1', 'r2', 'r3'],
    answer: () => null,
    onRead: () => landForeignCheckpoint(store, {
      requiredReplicaIds: ['r1', 'r2']})});
  await workflow.teardownAbortedSplitChild(workflowId,
    workflow.resolveWorkflowState(workflowId), LEFT);
  await turns(50);
  t.same(leftCheckpoint(store).requiredReplicaIds, ['r1', 'r2'],
    'the frozen set is unchanged');
  t.same(delivered.filter((id) => id === 'r3'), [],
    'nothing was sent to a member outside the frozen set');
  t.ok(store.partitionIds().includes(LEFT), 'the child row survives');
});

test('the answered ids only grow: an answer recorded from an older ' +
  'projection keeps the ids the record already holds', async (t) => {
  const {store, workflow, workflowId} = await ownerOf('failed',
    {[LEFT]: 'dispatched', [RIGHT]: 'dispatched'});
  landForeignCheckpoint(store, {requiredReplicaIds: ['r1', 'r2']});
  workflow.workflowCoordinator.removeWorkflow(workflowId);
  workflow.resolveWorkflowState(workflowId);
  // r1 answers; just before, another write recorded r2's answer.
  arrangeTeardown(workflow, {members: ['r1', 'r2'],
    answer: (replicaId) => (replicaId === 'r1' ?
      {status: 'completed'} : null),
    onDeliver: (replicaId) => {
      if (replicaId === 'r1') {
        landForeignCheckpoint(store, {dissolvedReplicaIds: ['r2']});
      }
    }});
  await workflow.teardownAbortedSplitChild(workflowId,
    workflow.resolveWorkflowState(workflowId), LEFT);
  await turns(50);
  t.same([...(leftCheckpoint(store).dissolvedReplicaIds || [])].sort(),
    ['r1', 'r2'], 'both answers are on the record');
});
