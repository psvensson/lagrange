/**
 * Witnesses of the group-retirement resume's ownership claim on the REAL
 * workflow owners (ManagedSplitWorkflow, ManagedMergeWorkflow: their
 * constructors attach the resume, their PRODUCTION recovery rebuilds the
 * workflow from the durable `tables` row, their PRODUCTION claim persistence
 * compare-and-swaps the full serialized metadata on that row). Re-verifier
 * findings 2026-10-04:
 *
 * B3a a restarted split owner recovers the claim triple (fence, owner,
 *     lease) from the record, so its resume claim wins and it drives.
 * B3b two merge owners resume one retiring record: the loser re-reads the
 *     durable row after its refused claim, writes at most 2 claims, arms ONE
 *     timer at the winner's lease expiry (logged once), and logs a spent
 *     wait (WARN, last observed owner/lease) when that timer fires on a
 *     still-retiring record - never a zero-delay loop.
 * Mk  the lease re-scan reads the CURRENT record: a record that left its
 *     retiring state meanwhile is not claimed and logs no spent wait.
 * Mj  an owner already driving the workflow neither claims nor re-runs the
 *     step on further record changes.
 * Mi  an aborted record whose targets have no partition rows left is not
 *     resumed.
 * RC  a refused claim with no live foreign lease logs one WARN per record
 *     version and arms no timer; the next record change resumes it.
 *
 * Owner clock and scheduler are injected: nothing here waits on wall time.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ManagedSplitWorkflow} from
  '../../src/partition/managed-split-workflow.js';
import {ManagedMergeWorkflow} from
  '../../src/partition/managed-merge-workflow.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';

const TABLE_ID = 'tbl-claim';
const WORKFLOW_ID = 'wf-claim-1';
const NOW = 1_000_000;
const LEASE_MS = 60_000;
const TURNS = 200;

function parsePartitionTransition(tableInfo) {
  const state = tableInfo?.partition_transition_state;
  const raw = tableInfo?.partition_transition_metadata;
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

// The durable `tables` rows and the CAS write the claim persistence uses
// (a replicated write lands a turn later; its change event a turn after).
// The store every owner of the current test writes through (the resume runs
// from the constructor, so the gateway is the class's own accessor).
let activeStore = null;
for (const Klass of [ManagedSplitWorkflow, ManagedMergeWorkflow]) {
  Klass.prototype.getControlPlaneSystemTableGateway = function() {
    const nodeId = this.nodeId;
    return {updateSystemTableRow: (...args) => {
      activeStore.writer = nodeId;
      return activeStore.gateway.updateSystemTableRow(...args);
    }};
  };
}

function createStore() {
  const store = {rows: new Map(), listeners: new Set(), writes: []};
  activeStore = store;
  store.gateway = {
    async updateSystemTableRow(_table, where, update) {
      await new Promise((resolve) => setImmediate(resolve));
      const row = store.rows.get(where.table_id);
      const ok = Boolean(row) && Object.entries(where)
        .every(([key, value]) => row[key] === value);
      store.writes.push({by: store.writer, ok});
      if (!ok) return {success: true, affectedRows: 0};
      Object.assign(row, update);
      setImmediate(() => store.emit({...row}));
      return {success: true, affectedRows: 1};
    },
  };
  store.emit = (row) => {
    for (const listener of [...store.listeners]) {
      listener('tables', 'UPDATE', row);
    }
  };
  return store;
}

function createScheduler() {
  const scheduler = {armed: [],
    setTimeout(fn, ms) {
      const timer = {fn, ms, cleared: false};
      scheduler.armed.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    pending() {
      return scheduler.armed.filter((timer) => !timer.cleared);
    },
    fireAll() {
      for (const timer of scheduler.pending()) {
        timer.cleared = true;
        timer.fn();
      }
    },
  };
  return scheduler;
}

const FAMILY = Object.freeze({
  split: {
    Klass: ManagedSplitWorkflow,
    names: {sourcePartitionId: 'p1', targetPartitionIds: ['p1-l', 'p1-r']},
    state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    participants: [[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      SPLIT_ACK_STATUS.CLEANUP_COMPLETED]],
    finalize: 'finalizeSplitDissolutionIfReady',
    teardown: 'teardownAbortedSplitChildren',
  },
  merge: {
    Klass: ManagedMergeWorkflow,
    names: {sourcePartitionIds: ['pa', 'pb'], targetPartitionIds: ['pm']},
    state: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    participants: ['pa', 'pb'].map((id) => [buildMergeSourceParticipantKey(id),
      MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED]),
    finalize: 'finalizeMergeDissolutionIfReady',
    teardown: 'teardownAbortedMergeTarget',
  },
});

/**
 * One owner process of a family over the store: the real class, its step
 * entries counted (the step itself is witnessed in test/node).
 */
function openOwner(store, family, nodeId, {clock, scheduler,
  partitionRows = null}) {
  const spec = FAMILY[family];
  const log = [];
  const sink = (level) => (message, fields) =>
    log.push({level, message, fields});
  const owner = new spec.Klass({
    nodeId, now: () => clock.now, workflowLeaseMs: LEASE_MS,
    logger: {debug() {}, info: sink('info'), warn: sink('warn'),
      error: sink('error')},
    listTableInfos: () => [...store.rows.values()].map((row) => ({...row})),
    parsePartitionTransition,
    getPartitionInfo: (id) => (partitionRows === null ||
      partitionRows.has(id) ? {partition_id: id, table_id: TABLE_ID} : null),
    getTableInfo: () => ({...store.rows.get(TABLE_ID)}),
    observeSystemRows: (listener) => {
      const scoped = (...args) => {
        if (!owner.dead) listener(...args);
      };
      store.listeners.add(scoped);
      return () => store.listeners.delete(scoped);
    },
    groupRetirementScheduler: scheduler,
  });
  owner.log = log;
  owner.steps = 0;
  // An incomplete step, as production leaves one: a member unacknowledged,
  // handed to the re-drive (whose own re-runs are counted apart).
  owner.redriveRuns = 0;
  const step = async (workflowId) => {
    owner.steps += 1;
    if (owner.holdStep) {
      await owner.holdStep;
    }
    owner.groupRetirementRedrive.report({workflowId, partitionId: 'p',
      unacknowledged: [{replicaId: 'r-x', nodeId: 'n-x'}],
      redrive: async () => {
        owner.redriveRuns += 1;
      }});
    return false;
  };
  owner[spec.finalize] = step;
  owner[spec.teardown] = step;
  return owner;
}

// The record a previous owner left (fence 3), written as that owner's own
// persistence serializes it.
function installRecord(store, family, {ownerId = 'dead-owner',
  leaseExpiresAt = NOW - 5000, aborted = false} = {}) {
  const spec = FAMILY[family];
  const writer = new spec.Klass({nodeId: 'n0', now: () => NOW,
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    listTableInfos: () => [], parsePartitionTransition});
  const metadata = {workflowId: WORKFLOW_ID, targetPartitionVersion: 2,
    ...spec.names};
  const state = aborted ? PARTITION_TRANSITION_STATE.FAILED : spec.state;
  const workflow = writer.workflowCoordinator.createWorkflowRecord({
    workflowId: WORKFLOW_ID, ownerKey: 'k', tableId: TABLE_ID,
    partitionId: 'p', step: state, status: state, metadata, fenceToken: 3,
    workflowOwnerId: ownerId, leaseExpiresAt});
  workflow.participants = new Map(spec.participants.map(([key, status]) =>
    [key, {workflowId: WORKFLOW_ID, participantId: key, participantKey: key,
      status, fenceToken: 3, acknowledgedAt: 1, createdAt: 1,
      updatedAt: 1}]));
  writer.workflowCoordinator.setWorkflowState(workflow);
  store.rows.set(TABLE_ID, {table_id: TABLE_ID,
    active_partition_version: aborted ? 1 : 2,
    partition_transition_state: state,
    partition_transition_metadata: JSON.stringify(
      writer.buildPersistedTransitionMetadata(workflow))});
}

function hydrate(store) {
  store.emit({...store.rows.get(TABLE_ID)});
}

function storedClaim(store) {
  const metadata = JSON.parse(
    store.rows.get(TABLE_ID).partition_transition_metadata);
  return {fence: metadata.workflowFenceToken,
    ownerId: metadata.workflowOwnerId,
    leaseExpiresAt: metadata.workflowLeaseExpiresAt};
}

// The resume's lease timers (the re-drive's fallback timers share the
// scheduler; its backoff never exceeds 30 s, a lease wait is the lease).
function leaseTimers(scheduler) {
  return scheduler.pending().filter((timer) => timer.ms > 30_000);
}

function linesOf(owner, level, pattern) {
  return owner.log.filter((line) => line.level === level &&
    pattern.test(line.message));
}

for (const family of ['split', 'merge']) {
  test(`B3a ${family}: a restarted owner recovers the claim triple and its ` +
    'resume claim wins', async (t) => {
    const store = createStore();
    const clock = {now: NOW};
    const scheduler = createScheduler();
    // The restarted owner starts with an empty coordinator; its view
    // hydrates after construction.
    const owner = openOwner(store, family, 'n1', {clock, scheduler});
    installRecord(store, family);
    hydrate(store);
    await turns();
    const recovered = owner.workflowCoordinator.getWorkflowById(WORKFLOW_ID);
    t.equal(store.writes.filter((write) => write.ok).length, 1,
      'one accepted claim write');
    t.equal(store.writes.filter((write) => !write.ok).length, 0,
      'no refused claim write');
    t.equal(storedClaim(store).fence, 4, 'the claim advanced the fence');
    t.equal(storedClaim(store).ownerId, owner.workflowOwnerId,
      'the record names the restarted owner');
    t.equal(recovered.fenceToken, 4, 'it drives on the claimed fence');
    t.equal(owner.steps, 1, 'the step ran once');
    t.equal(linesOf(owner, 'warn', /resumed from the durable record/u)
      .length, 1, 'the resume is one WARN');
    t.same(leaseTimers(scheduler), [], 'no lease timer armed');
  });
}

test('B3b two merge owners: the loser re-reads the durable row, writes at ' +
  'most 2 claims, arms one lease timer, and logs a spent wait when it fires',
async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  const a = openOwner(store, 'merge', 'nA', {clock, scheduler});
  const b = openOwner(store, 'merge', 'nB', {clock, scheduler});
  installRecord(store, 'merge');
  hydrate(store);
  await turns();
  clock.now += 2000;
  await turns();
  const winner = storedClaim(store).ownerId === a.workflowOwnerId ? a : b;
  const loser = winner === a ? b : a;
  const loserNode = loser === a ? 'nA' : 'nB';
  const loserWrites = store.writes.filter((write) => write.by === loserNode);
  t.ok(loserWrites.length <= 2, 'the loser wrote at most 2 claims ' +
    `(${loserWrites.length})`);
  t.equal(winner.steps, 1, 'the winner drove the step once');
  t.equal(loser.steps, 0, 'the loser did not drive');
  t.ok(loser.log.length <= 2, 'the loser logged at most 2 lines ' +
    `(${loser.log.length})`);
  const awaiting = linesOf(loser, 'info', /awaits a foreign owner/u);
  t.equal(awaiting.length, 1, 'the foreign-lease wait is logged once');
  t.equal(awaiting[0]?.fields?.ownerId, winner.workflowOwnerId,
    'it names the winner');
  t.equal(leaseTimers(scheduler).length, 1,
    'exactly one lease timer is armed');
  t.equal(leaseTimers(scheduler)[0].ms,
    storedClaim(store).leaseExpiresAt - NOW,
    'at the winner\'s lease expiry, never zero');
  // The winner's lease ends with the record still retiring.
  winner.dead = true;
  clock.now = storedClaim(store).leaseExpiresAt + 1;
  scheduler.fireAll();
  await turns();
  const spent = linesOf(loser, 'warn', /awaited foreign lease expired/u);
  t.equal(spent.length, 1, 'the spent wait is one WARN');
  t.equal(spent[0]?.fields?.awaited, 'foreign-lease-expiry',
    'naming what was awaited');
  t.equal(spent[0]?.fields?.lastOwnerId, winner.workflowOwnerId,
    'and the last observed owner');
  t.equal(loser.steps, 1, 'after the spent wait the loser claimed and drove');
});

test('Mk the lease re-scan reads the current record: a record that left its ' +
  'retiring state is not claimed', async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  installRecord(store, 'split', {ownerId: 'live-foreign',
    leaseExpiresAt: NOW + LEASE_MS});
  const owner = openOwner(store, 'split', 'n1', {clock, scheduler});
  await turns();
  t.equal(scheduler.pending().length, 1, 'setup: a live foreign lease timer');
  t.equal(store.writes.length, 0, 'no claim against a live foreign lease');
  // The foreign owner finished: the record left its retiring state.
  const row = store.rows.get(TABLE_ID);
  store.rows.set(TABLE_ID, {...row, partition_transition_state: null,
    partition_transition_metadata: null});
  clock.now = NOW + LEASE_MS + 1;
  scheduler.fireAll();
  await turns();
  t.equal(store.writes.length, 0, 'no claim after the record cleared');
  t.equal(owner.steps, 0, 'nothing driven');
  t.same(linesOf(owner, 'warn', /awaited foreign lease/u), [],
    'no spent-wait WARN for a record that finished');
});

test('Mj an owner already driving neither claims nor re-runs on further ' +
  'record changes', async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  const owner = openOwner(store, 'split', 'n1', {clock, scheduler});
  // The step stays in flight (a long dissolution).
  let release = null;
  owner.holdStep = new Promise((resolve) => {
    release = resolve;
  });
  installRecord(store, 'split');
  hydrate(store);
  await turns();
  t.equal(owner.steps, 1, 'setup: the step is running');
  const writes = store.writes.length;
  for (let change = 0; change < 5; change += 1) {
    hydrate(store);
    await turns(20);
  }
  t.equal(owner.steps, 1, 'no second run while it runs');
  release();
  owner.holdStep = null;
  await turns();
  // The step returned incomplete: its re-drive tracks it.
  for (let change = 0; change < 5; change += 1) {
    hydrate(store);
    await turns(20);
  }
  t.equal(owner.steps, 1, 'no second run while its re-drive tracks it');
  t.equal(store.writes.length, writes, 'no further claim write');
});

test('Mi an aborted record whose targets have no partition rows left is not ' +
  'resumed', async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  installRecord(store, 'split', {aborted: true});
  const owner = openOwner(store, 'split', 'n1', {clock, scheduler,
    partitionRows: new Set()});
  hydrate(store);
  await turns();
  t.equal(store.writes.length, 0, 'no claim');
  t.equal(owner.steps, 0, 'no teardown');
  const withRow = openOwner(store, 'split', 'n2', {clock, scheduler,
    partitionRows: new Set(['p1-l'])});
  hydrate(store);
  await turns();
  t.equal(withRow.steps, 1, 'control: a target row left resumes it');
});

test('RC a refused claim with no live foreign lease: one WARN per record ' +
  'version, no timer, the next record change resumes it', async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  installRecord(store, 'split');
  // Every claim write is refused (the storage did not take it).
  const update = store.gateway.updateSystemTableRow;
  store.gateway.updateSystemTableRow = async () => {
    store.writes.push({by: 'n1', ok: false});
    return {success: true, affectedRows: 0};
  };
  const owner = openOwner(store, 'split', 'n1', {clock, scheduler});
  for (let change = 0; change < 3; change += 1) {
    hydrate(store);
    await turns(20);
  }
  t.equal(linesOf(owner, 'warn', /claim refused with no live foreign/u)
    .length, 1, 'one WARN for one record version');
  t.ok(store.writes.length <= 4, 'one claim per record change, no loop ' +
    `(${store.writes.length})`);
  t.same(scheduler.pending(), [], 'no timer at all');
  t.equal(owner.steps, 0, 'nothing driven');
  store.gateway.updateSystemTableRow = update;
  hydrate(store);
  await turns();
  t.equal(owner.steps, 1, 'the next record change resumed it');
});

test('P6 the driver\'s lease lapsed, it wrote progress, the others were ' +
  'refused on stale witnesses, then it died: one immediate re-claim with the ' +
  'refreshed witness drives it - no timer, bounded claim writes',
async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  const a = openOwner(store, 'merge', 'nA', {clock, scheduler});
  installRecord(store, 'merge');
  hydrate(store);
  await turns();
  t.equal(a.steps, 1, 'setup: A claimed and drives');
  const b = openOwner(store, 'merge', 'nB', {clock, scheduler});
  const c = openOwner(store, 'merge', 'nC', {clock, scheduler});
  hydrate(store);
  await turns();
  t.equal(b.steps + c.steps, 0, 'setup: A\'s live lease holds B and C');
  // A never renews during the retirement: its lease lapses, then it records
  // a member's answer (the claim fields untouched), and dies.
  clock.now = storedClaim(store).leaseExpiresAt + 1000;
  const writesBefore = store.writes.length;
  const row = store.rows.get(TABLE_ID);
  const metadata = JSON.parse(row.partition_transition_metadata);
  const key = Object.keys(metadata.participants)[0];
  metadata.participants[key] = {...metadata.participants[key], checkpoint: {
    requiredReplicaIds: ['r1', 'r2'], dissolvedReplicaIds: ['r1']}};
  row.partition_transition_metadata = JSON.stringify(metadata);
  a.dead = true;
  store.emit({...row});
  await turns();
  t.equal(b.steps + c.steps, 1,
    'exactly one of B and C re-claimed on the refreshed witness and drives');
  const claim = storedClaim(store);
  t.ok([b, c].some((owner) => owner.workflowOwnerId === claim.ownerId),
    'the record names it the owner, on a new fence');
  t.equal(claim.fence, 5, 'the fence advanced once');
  t.ok(store.writes.length - writesBefore <= 4,
    `bounded claim writes (${store.writes.length - writesBefore})`);
  // Further changes of the same record version claim nothing more.
  hydrate(store);
  await turns();
  t.equal(b.steps + c.steps, 1, 'no second driver');
  t.same(leaseTimers(scheduler).filter((timer) =>
    timer.ms > LEASE_MS + 1), [], 'no timer beyond the new owner\'s lease');
});

test('RF a resume that throws is one WARN, never silent', async (t) => {
  const store = createStore();
  const clock = {now: NOW};
  const scheduler = createScheduler();
  installRecord(store, 'split');
  store.gateway.updateSystemTableRow = async () => {
    throw new Error('control plane unavailable');
  };
  const owner = openOwner(store, 'split', 'n1', {clock, scheduler});
  await turns();
  const failed = linesOf(owner, 'warn', /resume failed/u);
  t.equal(failed.length, 1, 'one WARN');
  t.match(failed[0]?.fields?.error ?? '', /control plane unavailable/u,
    'naming the error');
  t.equal(owner.steps, 0, 'nothing driven');
});
