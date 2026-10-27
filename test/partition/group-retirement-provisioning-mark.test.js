/**
 * Witnesses of the never-provisioned durable fact (re-verification round 3,
 * B6): a split or merge that aborts between writing a target's partitions
 * row and sending that target's first replica create leaves a row with no
 * group. Absence is never proof a replica is gone (owner ruling 2026-10-04),
 * so the teardown may retire such a target only on an AUTHORITATIVE durable
 * fact: the target's provisioning mark on the workflow record
 * (target-provisioning-mark.js) - NONE until DISPATCHED is durable, and
 * DISPATCHED durable before the first create is sent.
 *
 * Real classes: ManagedSplitWorkflow / ManagedMergeWorkflow (execute, their
 * durable transition persistence against the test's `tables` row, their
 * PRODUCTION recovery and teardown). The committed-membership read of a
 * target that has no group throws (nothing answers), as production's does.
 *
 * P1 split, abort between the child rows and the first flip: both children
 *    NONE - both rows deleted on the mark, nothing listed, no WARN storm.
 * P2 split, the flip write fails: nothing is provisioned, both rows deleted.
 * P3 split, the first create is lost after its flip (a crash between the
 *    durable flip and the create): the left child DISPATCHED with no group
 *    stays "membership unavailable" (fail-closed), its row kept; the right
 *    child NONE is deleted.
 * P4 merge, abort between the target row and the flip: the target NONE -
 *    its row deleted.
 * P5 merge, the create lost after its flip: DISPATCHED stays unavailable.
 * P6 a retried split plan carries its children's marks; a reused id with no
 *    mark gets none (fail-closed), and a planner's fresh ids are NONE.
 * P7 a record written before the mark existed: a missing mark is not NONE.
 */
import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  buildMergeWorkflow,
} from './managed-merge-workflow-test-helpers.js';

const LEFT = 'users-p-left';
const RIGHT = 'users-p-right';
const TURNS = 50;

function parsePartitionTransition(tableInfo) {
  const state = tableInfo?.partition_transition_state ?? null;
  const raw = tableInfo?.partition_transition_metadata ?? null;
  if (!state || !raw) return null;
  try {
    return {state, metadata: typeof raw === 'string' ? JSON.parse(raw) : raw};
  } catch {
    return null;
  }
}

async function turns(count = TURNS) {
  for (let turn = 0; turn < count; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function recordedMetadata(row) {
  return JSON.parse(row.partition_transition_metadata || '{}');
}

// A logger whose lines are counted by level.
function countingLogger() {
  const lines = [];
  const sink = (level) => (message, fields) =>
    lines.push({level, message, fields});
  return {lines, logger: {debug() {}, info: sink('info'), warn: sink('warn'),
    error: sink('error')}};
}

// The workflow's group-retirement reads and deletes, observed: no target in
// these worlds has a group, so the committed-membership read throws.
function observeTeardown(workflow, deleteFor) {
  const seen = {membershipReads: [], deletes: [], deliveries: 0};
  workflow.readCommittedGroupMembers = async (partitionId) => {
    seen.membershipReads.push(partitionId);
    throw new Error(`no leader answers for ${partitionId}`);
  };
  workflow.listPartitionServiceRows = () => [];
  workflow.deliverReplicaRemoval = async () => {
    seen.deliveries += 1;
    return null;
  };
  workflow[deleteFor] = async (partitionId) => {
    seen.deletes.push(partitionId);
    return {success: true, affectedRows: 1};
  };
  return seen;
}

function splitWorld(options = {}) {
  const {lines, logger} = countingLogger();
  const built = buildWorkflow({parsePartitionTransition, logger,
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    ...options});
  const seen = observeTeardown(built.workflow, 'deletePartitionMetadata');
  return {...built, lines, seen};
}

async function executeSplitToAbort(t, world) {
  await world.workflow.execute({partitionId: 'users-p1', tableName: 'users'})
    .then(() => t.fail('the split must abort'), () => {});
  const row = world.durableRow;
  t.equal(row.partition_transition_state, PARTITION_TRANSITION_STATE.FAILED,
    'setup: the split aborted (FAILED on the record)');
  return recordedMetadata(row);
}

async function teardownSplit(world, metadata) {
  const workflowId = metadata.workflowId;
  await world.workflow.teardownAbortedSplitChildren(workflowId,
    world.workflow.resolveWorkflowState(workflowId));
  await turns();
}

test('P1 split aborted between the child rows and the first create: both ' +
  'children are retired on their NONE mark', async (t) => {
  const world = splitWorld({waitForTablePartitionMetadata: async () => {
    throw new Error('partition metadata never converged');
  }});
  const metadata = await executeSplitToAbort(t, world);
  t.same(metadata.targetProvisioning, {[LEFT]: 'none', [RIGHT]: 'none'},
    'the record says no create was ever sent for either child');
  t.equal(world.provisionCalls.length, 0, 'setup: nothing was provisioned');
  await teardownSplit(world, metadata);
  t.same(world.seen.deletes.sort(), [LEFT, RIGHT].sort(),
    'both child rows are deleted');
  t.same(world.seen.membershipReads, [],
    'no membership read for a group never created');
  t.equal(world.seen.deliveries, 0, 'no REMOVE sent');
  t.same(world.workflow.groupRetirementRedrive.unacknowledged(), [],
    'nothing is left listed');
  const participants = recordedMetadata(world.durableRow).participants;
  for (const key of ['left-child', 'right-child']) {
    t.same(participants[key]?.checkpoint,
      {requiredReplicaIds: [], neverProvisioned: true},
      `${key}: the empty set is frozen with the never-provisioned mark`);
  }
  t.equal(world.lines.filter((line) => line.level === 'warn').length, 0,
    'no WARN storm (none at all)');
});

test('P2 the durable flip fails: nothing is provisioned, both children are ' +
  'retired on their NONE mark', async (t) => {
  const world = splitWorld();
  const cdc = world.workflow.getCDCIntegrationService();
  const update = cdc.updateSystemTableRow.bind(cdc);
  cdc.updateSystemTableRow = async (tableName, where, data, options) => {
    if (tableName === TABLES.TABLES && String(
      data?.partition_transition_metadata || '').includes('"dispatched"')) {
      throw new Error('tables write failed');
    }
    return update(tableName, where, data, options);
  };
  const metadata = await executeSplitToAbort(t, world);
  t.equal(world.provisionCalls.length, 0,
    'no create is sent when its flip is not durable');
  t.same(metadata.targetProvisioning, {[LEFT]: 'none', [RIGHT]: 'none'},
    'the record keeps NONE');
  await teardownSplit(world, metadata);
  t.same(world.seen.deletes.sort(), [LEFT, RIGHT].sort(),
    'both child rows are deleted');
});

test('P3 a create lost after its durable flip: DISPATCHED with no group stays ' +
  'membership-unavailable (fail-closed); the NONE sibling is retired',
async (t) => {
  const world = splitWorld({provisionInitialTablePartition: async () => {
    throw new Error('host lost before the create landed');
  }});
  const metadata = await executeSplitToAbort(t, world);
  t.same(metadata.targetProvisioning, {[LEFT]: 'dispatched', [RIGHT]: 'none'},
    'the left child was durably DISPATCHED before its create');
  await teardownSplit(world, metadata);
  t.same(world.seen.deletes, [RIGHT], 'only the never-provisioned row goes');
  t.ok(world.seen.membershipReads.length > 0 &&
    world.seen.membershipReads.every((id) => id === LEFT),
  'the dispatched child\'s members are required (read; never the NONE one)');
  t.same(world.workflow.groupRetirementRedrive.unacknowledged().map((entry) =>
    [entry.partitionId, entry.membershipUnavailable]), [[LEFT, true]],
  'the dispatched child stays listed, membership unavailable');
});

test('P7 a record with no provisioning mark (written before the mark ' +
  'existed) stays membership-unavailable: a missing mark is not NONE',
async (t) => {
  const world = splitWorld({waitForTablePartitionMetadata: async () => {
    throw new Error('partition metadata never converged');
  }});
  const metadata = await executeSplitToAbort(t, world);
  delete metadata.targetProvisioning;
  world.durableRow.partition_transition_metadata = JSON.stringify(metadata);
  await teardownSplit(world, metadata);
  t.same(world.seen.deletes, [], 'no row is deleted');
  t.same([...new Set(world.seen.membershipReads)].sort(), [LEFT, RIGHT].sort(),
    'both children\'s members are required (read)');
  t.same(world.workflow.groupRetirementRedrive.unacknowledged().map((entry) =>
    entry.membershipUnavailable), [true, true],
  'both listed: membership unavailable');
});

function mergeWorld(options = {}) {
  const {lines, logger} = countingLogger();
  const built = buildMergeWorkflow({logger,
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    ...options});
  const seen = observeTeardown(built.workflow, 'deleteSourcePartitionMetadata');
  return {...built, lines, seen};
}

async function executeMergeToAbort(t, world) {
  await world.workflow.execute({leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID})
    .then((result) => t.notOk(result?.success, 'the merge must abort'),
      () => {});
  t.equal(world.durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED, 'setup: the merge aborted (FAILED)');
  return recordedMetadata(world.durableTableRow);
}

async function teardownMerge(world, metadata) {
  await world.workflow.teardownAbortedMergeTarget(metadata.workflowId,
    world.workflow.resolveWorkflowState(metadata.workflowId));
  await turns();
}

test('P4 merge aborted between the target row and its first create: the ' +
  'target is retired on its NONE mark', async (t) => {
  const world = mergeWorld({waitForTablePartitionMetadata: async () => {
    throw new Error('partition metadata never converged');
  }});
  const metadata = await executeMergeToAbort(t, world);
  const [target] = metadata.targetPartitionIds;
  t.same(metadata.targetProvisioning, {[target]: 'none'},
    'the record says no create was ever sent');
  await teardownMerge(world, metadata);
  t.same(world.seen.deletes, [target], 'the target row is deleted');
  t.same(world.seen.membershipReads, [], 'no membership read');
  t.same(world.workflow.groupRetirementRedrive.unacknowledged(), [],
    'nothing is left listed');
});

test('P5 merge, a create lost after its durable flip: DISPATCHED stays ' +
  'membership-unavailable (fail-closed)', async (t) => {
  const world = mergeWorld({provisionInitialTablePartition: async () => {
    throw new Error('host lost before the create landed');
  }});
  const metadata = await executeMergeToAbort(t, world);
  const [target] = metadata.targetPartitionIds;
  t.same(metadata.targetProvisioning, {[target]: 'dispatched'},
    'DISPATCHED was durable before the create');
  await teardownMerge(world, metadata);
  t.same(world.seen.deletes, [], 'the target row is kept');
  t.same(world.workflow.groupRetirementRedrive.unacknowledged().map((entry) =>
    [entry.partitionId, entry.membershipUnavailable]), [[target, true]],
  'listed: membership unavailable');
});

test('P6 a retried plan carries its children\'s marks; a reused id without ' +
  'one gets none; fresh ids are NONE', async (t) => {
  const {workflow} = buildWorkflow({parsePartitionTransition});
  const prior = (targetProvisioning) => ({
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    metadata: {splitKey: 'm', targetPartitionIds: [LEFT, RIGHT],
      ...(targetProvisioning ? {targetProvisioning} : {})},
  });
  const carried = workflow.buildSplitPlanTransitionMetadata(
    workflow.resolvePersistedSplitPlan(prior({[LEFT]: 'dispatched',
      [RIGHT]: 'none'}), {}));
  t.same(carried.targetProvisioning, {[LEFT]: 'dispatched', [RIGHT]: 'none'},
    'a retried plan keeps the prior record\'s marks');
  const legacy = workflow.buildSplitPlanTransitionMetadata(
    workflow.resolvePersistedSplitPlan(prior(null), {}));
  t.same(legacy.targetProvisioning, {},
    'a reused id with no mark gets none (membership required)');
  const fresh = workflow.buildSplitPlanTransitionMetadata({medianKey: 'm',
    leftPartition: {partitionId: 'fresh-l'},
    rightPartition: {partitionId: 'fresh-r'}});
  t.same(fresh.targetProvisioning, {'fresh-l': 'none', 'fresh-r': 'none'},
    'a planner\'s freshly minted ids are NONE');
});
