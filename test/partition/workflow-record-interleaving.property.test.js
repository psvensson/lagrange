/**
 * S2: the standing oracle for the record-store class (owner decision
 * 2026-10-05, option A). A RANDOMIZED interleaving of the production
 * writers of one split or merge workflow record - one owner with several
 * changes in flight at once (renewals, provisioning-mark flips, source
 * acknowledgements, phase steps, aborts, group-retirement progress through
 * the teardown) - across two and three owners, with lost acknowledgements,
 * duplicated deliveries, owner restarts (the in-memory copy dropped), stale
 * views and lease expiry. Fixed seeds, bounded, fast.
 *
 * Real ManagedSplitWorkflow / ManagedMergeWorkflow owners, each over its own
 * PRODUCTION CDCIntegrationService and gateway, writing one real SQLite
 * store that evaluates every WHERE at apply time
 * (workflow-record-sqlite-world.js). Every applied write is observed AT ITS
 * APPLY, and the invariants are checked on the sequence of records:
 *  I1 lease/fence: the fence never decreases; one fence has one owner; for
 *     one (owner, fence) the lease never decreases;
 *  I2 provisioning marks: only NONE -> DISPATCHED; a mark never disappears;
 *  I3 group progress: answered (dissolved) ids only grow; a frozen member
 *     set, once written, never changes;
 *  I4 phase: never backwards in the pre-cutover order; FAILED (the owner's
 *     abort) is left only by the terminal clear;
 *  I5 a target's partitions row is deleted only while its mark is NONE or
 *     every frozen member of its group answered;
 *  I6 every change a caller saw land holds in the final record (or the
 *     record moved past it: a later status in the acknowledgement graph);
 *     a refused change answered a typed outcome.
 */
import {test} from '../../src/test-helpers/tap.js';
import {claimWorkflowOwnershipCore} from
  '../../src/partition/managed-workflow-ownership-core.js';
import {markTargetProvisioningDispatched} from
  '../../src/partition/target-provisioning-mark.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {PARTICIPANT_ACK_FIELD} from
  '../../src/workflow/workflow-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
  isSplitSourceAckTransitionAllowed,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
  isMergeSourceAckTransitionAllowed,
} from '../../src/partition/merge-ack-constants.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {buildMergeWorkflow} from './managed-merge-workflow-test-helpers.js';
import {registerFromRecordAsRead} from './workflow-record-test-support.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
  turns,
} from './workflow-record-sqlite-world.js';

const LEASE_MS = 60000;
const SOURCE = 'users-p1';
const LEFT = 'users-p-left';
const RIGHT = 'users-p-right';
const MERGE_SOURCES = ['users-p1', 'users-p2'];
const MERGED = 'users-p-merged';
const NONE = 'none';
const DISPATCHED = 'dispatched';
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const SEEDS = Object.freeze({
  split: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597],
  merge: [4, 9, 16, 25, 36, 49, 64, 81],
});
const STEPS = 28;
const PRE_CUTOVER_ORDER = Object.freeze({
  split: [PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP],
  merge: [PARTITION_TRANSITION_STATE.MERGE_PREPARING,
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    PARTITION_TRANSITION_STATE.MERGE_CATCHUP],
});

// A small deterministic generator (mulberry32).
function random(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    int: (max) => Math.floor(next() * max),
  };
}

const FAMILIES = {
  split: {
    targets: [LEFT, RIGHT],
    store: () => openRecordStore({partitions: [SOURCE, LEFT, RIGHT].map(
      (partitionId) => ({partition_id: partitionId}))}),
    owner(store, name, clock) {
      const view = openView(store);
      const built = buildWorkflow({
        cdcIntegrationService: store.cdcFor(name),
        getTableInfo: () => view.row(),
        listTableInfos: () => view.list(),
        getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
        parsePartitionTransition,
        logger: QUIET,
        now: () => clock.now,
        groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
        groupRetirementLeaseScheduler: {setTimeout: () => null,
          clearTimeout() {}},
      });
      return {...built, view};
    },
    record: (workflowId) => ({
      workflowId, ownerKey: SOURCE, tableId: 'tbl-users', tableName: 'users',
      partitionId: SOURCE, status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
      metadata: {workflowId, sourcePartitionId: SOURCE,
        targetPartitionVersion: 2, targetPartitionIds: [LEFT, RIGHT],
        targetProvisioning: {[LEFT]: NONE, [RIGHT]: NONE}},
      createdAt: 1000, updatedAt: 1000}),
    sourceKey: () => SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    ackStatuses: [SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
      SPLIT_ACK_STATUS.BACKFILL_PROGRESS, SPLIT_ACK_STATUS.CATCHUP_READY,
      SPLIT_ACK_STATUS.BACKFILL_FAILED],
    isAllowed: isSplitSourceAckTransitionAllowed,
    acknowledge: (owner, workflowId, ack) =>
      owner.workflow.acknowledgeSourceParticipant(workflowId, ack),
    advance: (owner, workflowId, phase) =>
      owner.workflow.advanceSplitPhase(workflowId, phase),
    teardown: (owner, workflowId) => owner.workflow
      .teardownAbortedSplitChildren(workflowId,
        owner.workflow.resolveWorkflowState(workflowId)),
    childKeyOf: (target) => (target === LEFT ?
      SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD :
      SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD),
  },
  merge: {
    targets: [MERGED],
    store: () => openRecordStore({partitions: [...MERGE_SOURCES, MERGED].map(
      (partitionId) => ({partition_id: partitionId}))}),
    owner(store, name, clock) {
      const view = openView(store);
      const built = buildMergeWorkflow({
        cdcIntegrationService: store.cdcFor(name),
        getTableInfo: () => view.row(),
        listTableInfos: () => view.list(),
        getPartitionInfo: (partitionId) => store.partitionRow(partitionId),
        listTablePartitionRows: () => store.partitionIds()
          .map((id) => store.partitionRow(id)),
        logger: QUIET,
        now: () => clock.now,
        groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
        groupRetirementLeaseScheduler: {setTimeout: () => null,
          clearTimeout() {}},
      });
      return {...built, view};
    },
    record: (workflowId) => ({
      workflowId, ownerKey: MERGE_SOURCES.join('+'), tableId: 'tbl-users',
      tableName: 'users', partitionId: MERGE_SOURCES[0],
      status: PARTITION_TRANSITION_STATE.MERGE_PREPARING,
      metadata: {workflowId, sourcePartitionIds: [...MERGE_SOURCES],
        targetPartitionVersion: 2, targetPartitionIds: [MERGED],
        siblingPartitionIds: [], targetProvisioning: {[MERGED]: NONE}},
      createdAt: 1000, updatedAt: 1000}),
    sourceKey: (rng) => buildMergeSourceParticipantKey(rng.pick(MERGE_SOURCES)),
    ackStatuses: [MERGE_ACK_STATUS.SNAPSHOT_STARTED,
      MERGE_ACK_STATUS.BACKFILL_PROGRESS, MERGE_ACK_STATUS.CATCHUP_READY,
      MERGE_ACK_STATUS.BACKFILL_FAILED],
    isAllowed: isMergeSourceAckTransitionAllowed,
    acknowledge: (owner, workflowId, ack) =>
      owner.workflow.acknowledgeMergeSourceParticipant(workflowId, ack),
    advance: (owner, workflowId, phase) =>
      owner.workflow.advanceMergePhase(workflowId, phase),
    teardown: (owner, workflowId) => owner.workflow
      .teardownAbortedMergeTarget(workflowId,
        owner.workflow.resolveWorkflowState(workflowId)),
    childKeyOf: () => 'merged-target',
  },
};

// Every status reachable from `status` in an acknowledgement graph.
function reachableFrom(isAllowed, statuses, status) {
  const seen = new Set([status]);
  const queue = [status];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const to of statuses) {
      if (!seen.has(to) && isAllowed(from, to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return seen;
}

function recordOf(store) {
  const row = store.tablesRow();
  return {state: row.partition_transition_state,
    metadata: row.partition_transition_metadata ?
      JSON.parse(row.partition_transition_metadata) : null};
}

// The invariant checker over the records as each write applied.
function watchInvariants(store, family, violations) {
  let previous = recordOf(store);
  const fenceOwners = new Map();
  const order = PRE_CUTOVER_ORDER[family];
  const check = (condition, message) => {
    if (!condition) violations.push(message);
  };
  store.observers.push((write) => {
    if (write.changes < 1) return;
    if (/^DELETE FROM partitions/u.test(write.sql)) {
      const target = String(write.params.at(-1));
      const now = recordOf(store);
      const mark = now.metadata?.targetProvisioning?.[target];
      const participant = Object.values(now.metadata?.participants || {})
        .find((entry) => entry?.partitionId === target);
      const required = participant?.checkpoint?.requiredReplicaIds || [];
      const dissolved = new Set(participant?.checkpoint?.dissolvedReplicaIds ||
        []);
      check(mark === NONE || (required.length > 0 &&
        required.every((id) => dissolved.has(id))),
      `I5 ${target} deleted with mark ${mark} and ${dissolved.size}/` +
        `${required.length} answered`);
      return;
    }
    if (!/^UPDATE tables/u.test(write.sql)) return;
    const next = recordOf(store);
    const was = previous;
    previous = next;
    if (!next.metadata || !was.metadata) return;
    const fence = next.metadata.workflowFenceToken;
    const wasFence = was.metadata.workflowFenceToken;
    check(!(fence < wasFence), `I1 fence ${wasFence} -> ${fence}`);
    if (fenceOwners.has(fence)) {
      check(fenceOwners.get(fence) === next.metadata.workflowOwnerId,
        `I1 fence ${fence} owned by ${fenceOwners.get(fence)} and ` +
        `${next.metadata.workflowOwnerId}`);
    }
    fenceOwners.set(fence, next.metadata.workflowOwnerId);
    if (fence === wasFence &&
        next.metadata.workflowOwnerId === was.metadata.workflowOwnerId) {
      check(!(next.metadata.workflowLeaseExpiresAt <
        was.metadata.workflowLeaseExpiresAt), `I1 lease regressed at ${fence}`);
    }
    for (const [target, mark] of Object.entries(
      was.metadata.targetProvisioning || {})) {
      const now = next.metadata.targetProvisioning?.[target];
      check(now === mark || (mark === NONE && now === DISPATCHED),
        `I2 mark ${target} ${mark} -> ${now}`);
    }
    for (const [key, participant] of Object.entries(
      was.metadata.participants || {})) {
      const checkpoint = participant?.checkpoint || {};
      const after = next.metadata.participants?.[key]?.checkpoint || {};
      const dissolved = new Set(after.dissolvedReplicaIds || []);
      check((checkpoint.dissolvedReplicaIds || []).every((id) =>
        dissolved.has(id)), `I3 answered ids of ${key} shrank`);
      if (Object.hasOwn(checkpoint, 'requiredReplicaIds')) {
        check(JSON.stringify(after.requiredReplicaIds) ===
          JSON.stringify(checkpoint.requiredReplicaIds),
        `I3 frozen set of ${key} changed`);
      }
    }
    const wasRank = order.indexOf(was.state);
    const nowRank = order.indexOf(next.state);
    check(was.state !== PARTITION_TRANSITION_STATE.FAILED ||
      next.state === PARTITION_TRANSITION_STATE.FAILED,
    `I4 left FAILED for ${next.state}`);
    check(!(wasRank >= 0 && nowRank >= 0 && nowRank < wasRank),
      `I4 phase ${was.state} -> ${next.state}`);
  });
}

// One random operation of one owner (not awaited by the scheduler).
function operation(ctx, owner) {
  const {rng, family, workflowId, clock, store} = ctx;
  const spec = FAMILIES[family];
  const metadata = () => store.metadata();
  const ops = [
    async () => ({kind: 'renew', claim: await claimWorkflowOwnershipCore(
      owner.workflow, workflowId, {renew: true})}),
    async () => {
      owner.workflow.resolveWorkflowState(workflowId);
      return {kind: 'claim', claim: await claimWorkflowOwnershipCore(
        owner.workflow, workflowId)};
    },
    async () => {
      const target = rng.pick(spec.targets);
      // (The pre-option-A signature took the caller's metadata: kept so
      // this oracle runs red on that tree.)
      await (markTargetProvisioningDispatched.length > 3 ?
        markTargetProvisioningDispatched(owner.workflow, workflowId,
          owner.workflow.resolveWorkflowState(workflowId)?.metadata ?? {},
          target) :
        markTargetProvisioningDispatched(owner.workflow, workflowId, target));
      return {kind: 'mark', target};
    },
    async () => {
      const ack = {
        [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: spec.sourceKey(rng),
        [PARTICIPANT_ACK_FIELD.STATUS]: rng.pick(spec.ackStatuses),
        [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: metadata().workflowFenceToken,
        [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: clock.now,
      };
      const delivered = [spec.acknowledge(owner, workflowId, ack)];
      if (rng.chance(0.3)) {
        // A duplicated delivery of the same acknowledgement.
        delivered.push(spec.acknowledge(owner, workflowId, ack));
      }
      const results = await Promise.all(delivered.map((p) => p.catch(
        (error) => ({error: error.message}))));
      return {kind: 'ack', ack, results};
    },
    async () => ({kind: 'phase', advanced: await spec.advance(owner,
      workflowId, rng.pick(PRE_CUTOVER_ORDER[family]))}),
    async () => {
      owner.workflow.resolveWorkflowState(workflowId);
      await owner.workflow.persistExecutionFailure(workflowId,
        new Error('random abort'));
      return {kind: 'abort'};
    },
    async () => {
      owner.workflow.resolveWorkflowState(workflowId);
      await spec.teardown(owner, workflowId);
      return {kind: 'teardown'};
    },
  ];
  return rng.pick(ops)();
}

function arrange(ctx, owner) {
  const {rng} = ctx;
  // The teardown's group reads and REMOVE answers: members positively
  // answer at random (never from absence).
  // The committed configuration read answers differing sets over time (a
  // re-freeze from a stale copy would then try to change a frozen set).
  owner.workflow.readCommittedGroupMembers = async () => rng.pick([
    ['r1', 'r2', 'r3'], ['r1', 'r2'], ['r2', 'r3', 'r4']]);
  owner.workflow.listPartitionServiceRows = (partitionId) =>
    ['r1', 'r2', 'r3', 'r4'].map((replicaId) => ({partition_id: partitionId,
      replica_id: replicaId, node_id: `node-${replicaId}`}));
  owner.workflow.deliverReplicaRemoval = async () => (rng.chance(0.6) ?
    {status: 'completed'} : null);
}

async function runSeed(t, family, seed) {
  const spec = FAMILIES[family];
  const rng = random(seed);
  const store = spec.store();
  const clock = {now: 1000};
  const violations = [];
  const names = rng.chance(0.5) ? ['A', 'B'] : ['A', 'B', 'C'];
  const owners = names.map((name) => {
    const owner = spec.owner(store, name, clock);
    owner.workflow.workflowOwnerId = `owner-${name}`;
    owner.name = name;
    readAuthoritativelyFrom(owner.workflow, store);
    return owner;
  });
  const ctx = {rng, family, clock, store};
  owners.forEach((owner) => arrange(ctx, owner));
  const workflowId = `${family}-property-${seed}`;
  ctx.workflowId = workflowId;
  await registerFromRecordAsRead(owners[0].workflow, spec.record(workflowId));
  watchInvariants(store, family, violations);
  const landed = [];
  const inFlight = [];
  for (let step = 0; step < STEPS; step += 1) {
    const owner = rng.pick(owners);
    const burst = 1 + rng.int(4);
    for (let index = 0; index < burst; index += 1) {
      inFlight.push(operation(ctx, owner).then((result) => {
        landed.push({owner: owner.name, ...result});
      }, (error) => landed.push({owner: owner.name, kind: 'threw',
        error: error.message})));
    }
    if (rng.chance(0.25)) {
      // A lost acknowledgement of the next write of some owner.
      const writer = rng.pick(owners).name;
      store.loseAckOnce((write) => write.writer === writer &&
        /^UPDATE tables/u.test(write.sql));
    }
    if (rng.chance(0.15)) {
      // An owner restart: its in-memory copy (and lineage) is gone.
      rng.pick(owners).workflow.workflowCoordinator.removeWorkflow(workflowId);
    }
    if (rng.chance(0.15)) {
      const viewer = rng.pick(owners);
      viewer.view.freeze();
      inFlight.push(turns(5 + rng.int(20)).then(() => viewer.view.thaw()));
    }
    if (rng.chance(0.2)) {
      clock.now += rng.chance(0.5) ? LEASE_MS + 1 : 1000;
    }
    await turns(rng.int(15));
  }
  await Promise.all(inFlight);
  await turns(100);
  for (const owner of owners) {
    owner.view.thaw();
  }
  checkPostconditions(store, spec, landed, violations);
  t.same(violations, [], `seed ${seed}: ${landed.length} operations, ` +
    `${store.writes.filter((write) => write.changes > 0).length} writes ` +
    'applied, every invariant holds');
  return landed;
}

// I6: what callers saw land holds in the final record.
function checkPostconditions(store, spec, landed, violations) {
  const final = recordOf(store);
  if (!final.metadata) {
    return;
  }
  for (const entry of landed) {
    if (entry.kind === 'mark') {
      if (final.metadata.targetProvisioning?.[entry.target] !== DISPATCHED) {
        violations.push(`I6 landed mark ${entry.target} lost`);
      }
    }
    if (entry.kind === 'ack') {
      const key = entry.ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY];
      const status = entry.ack[PARTICIPANT_ACK_FIELD.STATUS];
      const now = final.metadata.participants?.[key]?.status;
      const accepted = entry.results.some((result) =>
        result?.result === 'accepted');
      const typed = entry.results.every((result) =>
        typeof result?.result === 'string' || typeof result?.error ===
          'string');
      if (!typed) {
        violations.push('I6 an acknowledgement answered no typed outcome');
      }
      if (accepted && !reachableFrom(spec.isAllowed,
        [...spec.ackStatuses, ...Object.values(SPLIT_ACK_STATUS),
          ...Object.values(MERGE_ACK_STATUS)], status).has(now)) {
        violations.push(`I6 landed ack ${key}=${status} lost (now ${now})`);
      }
    }
  }
}

for (const family of Object.keys(FAMILIES)) {
  test(`S2 ${family}: randomized interleavings of the production writers ` +
    'keep every durable fact monotone', async (t) => {
    let operations = 0;
    for (const seed of SEEDS[family]) {
      operations += (await runSeed(t, family, seed)).length;
    }
    t.comment(`${family}: ${SEEDS[family].length} seeds, ${operations} ` +
      'operations');
  });
}
