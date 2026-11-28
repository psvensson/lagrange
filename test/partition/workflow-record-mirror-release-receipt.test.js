/**
 * Characterization of the workflow record's source mirror custody grants
 * (managed-workflow-record-store.js): how a source's committed release
 * receipt is acknowledged on the record (every unresolved reason, the lost
 * acknowledgement, the already-removed grant, the record that moved on, the
 * resume trigger), and which change answers the record refuses or marks while
 * grants are owed. Written against the unchanged store and kept green across
 * the extraction of these rules into named functions.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  RECORD_CLEARED,
  acknowledgeMirrorCustodyRelease,
  applyRecordChange,
} from '../../src/partition/managed-workflow-record-store.js';
import {MIRROR_CUSTODY_FORMAT} from '../../src/partition/partition-mirror-custody-codec.js';

const TABLE = 'tbl-orders';
const SOURCE = 'orders-p1';
const WORKFLOW = 'split-orders';
const FENCE = 7;
const GENERATION = 5;
const UNCONFIRMED = 'MIRROR_RELEASE_ACK_UNCONFIRMED';

function custodyOf(overrides = {}) {
  return {format: MIRROR_CUSTODY_FORMAT, barrierIndex: 4, workflowId: WORKFLOW,
    workflowAttempt: 2, workflowFenceToken: FENCE, targetPartitionVersion: 3, family: 'split',
    ...overrides};
}

function rowOf({generation = GENERATION, state = 'split_cutover_active',
  grants = [{partitionId: SOURCE, fence: FENCE, release: true}], metadata = {}} = {}) {
  return {table_id: TABLE, partition_transition_state: state,
    partition_transition_generation: generation,
    partition_transition_metadata: JSON.stringify({workflowId: WORKFLOW, workflowAttempt: 2,
      targetPartitionVersion: 3, sourcePartitionId: SOURCE, mirrorCustodyGrants: grants,
      ...metadata})};
}

const receiptOf = (overrides = {}) => ({partitionId: SOURCE, custody: custodyOf(), action: 'RELEASE',
  logIndex: 9, ...overrides});

// reads: authoritative answers in order (an Error throws, a function computes
// from the calls so far); swaps: compare-and-swap answers in order.
function releaseOwner({reads = [], swaps = []} = {}) {
  const calls = {reads: 0, swaps: [], resumed: []};
  const owner = {
    async readAuthoritativeWorkflowRecord(tableId) {
      assert.equal(tableId, TABLE);
      calls.reads += 1;
      const next = reads.shift();
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(calls) : next;
    },
    getControlPlaneSystemTableGateway: () => ({
      async updateSystemTableRow(table, where, data, options) {
        calls.swaps.push({table, where, data, options});
        const next = swaps.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    }),
    async resumeGroupRetirement(row, trigger) {
      calls.resumed.push({row, trigger});
    },
  };
  return {owner, calls};
}

const writtenOf = (base, swap) => ({...base, ...swap.data,
  partition_transition_metadata: swap.data.partition_transition_metadata,
  partition_transition_state: base.partition_transition_state});

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('expected a rejection');
}

test('a receipt that does not match the terminal workflow is a TypeError, nothing is read',
  async () => {
    const {owner, calls} = releaseOwner();
    for (const receipt of [receiptOf({action: 'PIN'}), receiptOf({logIndex: 0}),
      receiptOf({custody: custodyOf({workflowAttempt: 3})}), receiptOf({partitionId: 'other'})]) {
      await assert.rejects(acknowledgeMirrorCustodyRelease(owner, rowOf(), receipt),
        {name: 'TypeError', message: 'Mirror release acknowledgement does not match terminal workflow'});
    }
    const unauthorized = rowOf({grants: [{partitionId: SOURCE, fence: FENCE}]});
    await assert.rejects(acknowledgeMirrorCustodyRelease(owner, unauthorized, receiptOf()),
      {name: 'TypeError'});
    assert.equal(calls.reads, 0);
  });

test('an ended source attempt authorizes the release without the owner mark', async () => {
  const ended = rowOf({state: 'failed', grants: [{partitionId: SOURCE, fence: FENCE}],
    metadata: {mirrorExecutionEnded: true}});
  const {owner, calls} = releaseOwner({reads: [ended], swaps: [{affectedRows: 1}]});
  assert.equal(await acknowledgeMirrorCustodyRelease(owner, ended, receiptOf()), true);
  assert.equal(calls.swaps.length, 1);
  assert.equal(calls.resumed.length, 0, 'an ended attempt wakes no retirement');
});

for (const [name, base, reason] of [
  ['the authoritative row is unavailable', null, 'authoritative-row-unavailable'],
  ['the authoritative generation is behind the caller\'s row', rowOf({generation: 4}),
    'authoritative-generation-behind'],
  ['the record holds another workflow attempt', rowOf({metadata: {workflowAttempt: 3}}),
    'workflow-identity-changed'],
  ['the record holds another target version', rowOf({metadata: {targetPartitionVersion: 4}}),
    'workflow-identity-changed'],
  ['the grant lost its release authorization', rowOf({grants: [{partitionId: SOURCE, fence: FENCE}]}),
    'release-authorization-changed'],
]) {
  test(`before any write: ${name} -> unresolved ${reason}`, async () => {
    const {owner, calls} = releaseOwner({reads: [base]});
    const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
    assert.equal(error.message, 'Committed mirror release awaiting workflow acknowledgement');
    assert.equal(error.code, UNCONFIRMED);
    assert.equal(error.reason, reason);
    assert.equal(error.observation, undefined);
    assert.equal(error.cause, undefined);
    assert.deepEqual([error.partitionId, error.workflowId, error.workflowAttempt, error.fence],
      [SOURCE, WORKFLOW, 2, FENCE]);
    assert.equal(calls.swaps.length, 0);
    assert.equal(calls.resumed.length, 0);
  });
}

test('the grant is already gone: the base is the answer, nothing is written, retirement wakes',
  async () => {
    const base = rowOf({grants: []});
    const {owner, calls} = releaseOwner({reads: [base]});
    assert.equal(await acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()), true);
    assert.equal(calls.swaps.length, 0);
    assert.deepEqual(calls.resumed, [{row: base, trigger: 'source-custody-released'}]);
  });

test('a landed write removes exactly the receipt\'s grant at the next generation', async () => {
  const other = {partitionId: 'orders-p2', fence: FENCE, release: true};
  const base = rowOf({grants: [{partitionId: SOURCE, fence: FENCE, release: true}, other]});
  const {owner, calls} = releaseOwner({reads: [base], swaps: [{affectedRows: 1}]});
  owner.workflowRecordLineages = new Map([[WORKFLOW, 'older']]);
  assert.equal(await acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()), true);
  assert.equal(calls.swaps.length, 1);
  const [swap] = calls.swaps;
  assert.equal(swap.table, 'tables');
  assert.deepEqual(swap.where, {table_id: TABLE,
    partition_transition_metadata: base.partition_transition_metadata,
    partition_transition_state: base.partition_transition_state,
    partition_transition_generation: GENERATION});
  assert.equal(swap.data.partition_transition_generation, GENERATION + 1);
  const writtenMetadata = JSON.parse(swap.data.partition_transition_metadata);
  assert.deepEqual(writtenMetadata.mirrorCustodyGrants, [other]);
  const written = writtenOf(base, swap);
  assert.deepEqual(owner.workflowRecordLineages.get(WORKFLOW), written);
  assert.deepEqual(calls.resumed, [{row: written, trigger: 'source-custody-released'}]);
});

test('a lost acknowledgement: the re-read holds exactly the written bytes', async () => {
  const base = rowOf();
  const lost = new Error('reply lost');
  const {owner, calls} = releaseOwner({reads: [base, (seen) => writtenOf(base, seen.swaps[0])],
    swaps: [lost]});
  assert.equal(await acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()), true);
  assert.equal(calls.swaps.length, 1);
  assert.equal(calls.resumed.length, 1);
});

test('after a refused write the re-read is unavailable: unresolved with the observation',
  async () => {
    const {owner} = releaseOwner({reads: [rowOf(), new Error('no leader')],
      swaps: [{affectedRows: 0, outcome: 'refused', error: 'stale'}]});
    const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
    assert.equal(error.reason, 'authoritative-row-unavailable');
    assert.deepEqual(error.observation, {attempt: 1, comparedGeneration: GENERATION,
      observedGeneration: null, affectedRows: 0, outcome: 'refused', cause: 'stale'});
    assert.equal(error.cause, 'stale');
  });

test('a thrown submission is the cause of the unresolved release', async () => {
  const thrown = new Error('transport down');
  const {owner} = releaseOwner({reads: [rowOf(), new Error('no leader')], swaps: [thrown]});
  const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
  assert.equal(error.reason, 'authoritative-row-unavailable');
  assert.equal(error.cause, thrown);
  assert.deepEqual(error.observation, {attempt: 1, comparedGeneration: GENERATION,
    observedGeneration: null, affectedRows: null, outcome: undefined, cause: thrown});
});

test('a submission answered without a body leaves the cause undefined', async () => {
  const {owner} = releaseOwner({reads: [rowOf(), new Error('no leader')], swaps: [undefined]});
  const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
  assert.equal(error.cause, undefined);
  assert.equal(Object.hasOwn(error.observation, 'cause'), true);
  assert.equal(error.observation.cause, undefined);
});

test('the same base after every refused write: the bounded attempts end unconfirmed',
  async () => {
    const base = rowOf();
    const {owner, calls} = releaseOwner({reads: [base, base, base, base],
      swaps: [{affectedRows: 0, error: 'a'}, {affectedRows: 0, error: 'b'}, {affectedRows: 0, error: 'c'}]});
    const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
    assert.equal(error.reason, 'conditional-write-unconfirmed');
    assert.equal(calls.swaps.length, 3);
    assert.equal(error.observation.attempt, 3);
    assert.equal(error.cause, 'c');
  });

test('a re-read of a lower generation lags the base: unresolved generation behind', async () => {
  const {owner} = releaseOwner({reads: [rowOf(), rowOf({generation: 3})],
    swaps: [{affectedRows: 0}]});
  const error = await rejection(acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()));
  assert.equal(error.reason, 'authoritative-generation-behind');
  assert.equal(error.observation.observedGeneration, 3);
});

test('a record that moved on is the next base: its grant already gone ends the receipt',
  async () => {
    const moved = rowOf({generation: GENERATION + 2, grants: []});
    const {owner, calls} = releaseOwner({reads: [rowOf(), moved], swaps: [{affectedRows: 0}]});
    assert.equal(await acknowledgeMirrorCustodyRelease(owner, rowOf(), receiptOf()), true);
    assert.equal(calls.swaps.length, 1);
    assert.deepEqual(calls.resumed, [{row: moved, trigger: 'source-custody-released'}]);
  });

// A store owner whose record is one row; every write lands.
function recordOwner(row) {
  const state = {row, writes: []};
  const decode = (workflowId, stored) => {
    const metadata = JSON.parse(stored.partition_transition_metadata);
    return {workflowId, tableId: stored.table_id, status: stored.partition_transition_state,
      metadata, participants: new Map(), fenceToken: metadata.workflowFenceToken,
      workflowOwnerId: metadata.workflowOwnerId, leaseExpiresAt: metadata.workflowLeaseExpiresAt};
  };
  const owner = {
    workflowOwnerId: 'owner-a',
    logger: {warn() {}},
    listTableInfos: () => [state.row],
    readAuthoritativeWorkflowRecord: async () => state.row,
    decodeWorkflowRecord: (workflowId, stored) =>
      (stored?.partition_transition_metadata ? decode(workflowId, stored) : null),
    encodeWorkflowRecord: (next) => ({data: {partition_transition_state: next.status,
      partition_transition_metadata: JSON.stringify(next.metadata)}, options: {}}),
    encodeWorkflowRecordClear: () => ({data: {partition_transition_state: null,
      partition_transition_metadata: null}, options: {}}),
    workflowCoordinator: {getWorkflowById: () => null, adoptWorkflowProjection: (next) => next,
      removeWorkflow() {}},
    getControlPlaneSystemTableGateway: () => ({
      async updateSystemTableRow(_table, _where, data) {
        state.writes.push(data);
        state.row = {...state.row, ...data};
        return {affectedRows: 1};
      },
    }),
  };
  return {owner, state};
}

const owed = [{partitionId: SOURCE, fence: FENCE, acquired: true}];
const change = (status, metadata = {}) => (workflow) => ({...workflow, status,
  metadata: {...workflow.metadata, ...metadata}});

test('while a grant is owed, an answer that drops it is refused source-mirror-release-pending',
  async () => {
    const {owner, state} = recordOwner(rowOf({state: 'split_catchup', grants: owed}));
    const write = await applyRecordChange(owner, WORKFLOW,
      change('split_catchup', {mirrorCustodyGrants: []}), {tableId: TABLE});
    assert.equal(write.outcome, 'refused');
    assert.equal(write.refusal.reason, 'source-mirror-release-pending');
    assert.equal(state.writes.length, 0);
  });

test('an answer that weakens an owed grant\'s acquired mark is refused', async () => {
  const {owner} = recordOwner(rowOf({state: 'split_catchup', grants: owed}));
  const weakened = [{partitionId: SOURCE, fence: FENCE, acquired: false}];
  const write = await applyRecordChange(owner, WORKFLOW,
    change('split_catchup', {mirrorCustodyGrants: weakened}), {tableId: TABLE});
  assert.equal(write.refusal.reason, 'source-mirror-release-pending');
});

test('an ended attempt cannot become executable work again: source-mirror-attempt-ended',
  async () => {
    const {owner, state} = recordOwner(rowOf({state: 'failed', grants: [],
      metadata: {mirrorExecutionEnded: true}}));
    const write = await applyRecordChange(owner, WORKFLOW, change('split_catchup'),
      {tableId: TABLE});
    assert.equal(write.outcome, 'refused');
    assert.equal(write.refusal.reason, 'source-mirror-attempt-ended');
    assert.equal(state.writes.length, 0);
    const retry = await applyRecordChange(owner, WORKFLOW,
      change('split_catchup', {workflowAttempt: 3}), {tableId: TABLE});
    assert.equal(retry.outcome, 'accepted', 'a fresh attempt is not the ended one');
  });

test('ending the attempt while a grant is owed marks the mirror execution ended', async () => {
  const {owner, state} = recordOwner(rowOf({state: 'split_catchup', grants: owed}));
  const write = await applyRecordChange(owner, WORKFLOW, change('failed'), {tableId: TABLE});
  assert.equal(write.outcome, 'accepted');
  const written = JSON.parse(state.writes[0].partition_transition_metadata);
  assert.equal(written.mirrorExecutionEnded, true);
  assert.deepEqual(written.mirrorCustodyGrants, owed);
});

test('ending the attempt with no grant owed writes no mark', async () => {
  const {owner, state} = recordOwner(rowOf({state: 'split_catchup', grants: []}));
  await applyRecordChange(owner, WORKFLOW, change('failed'), {tableId: TABLE});
  assert.equal(JSON.parse(state.writes[0].partition_transition_metadata).mirrorExecutionEnded,
    undefined);
});

test('the terminal clear is not judged by the grant rules of the store', async () => {
  const {owner, state} = recordOwner(rowOf({state: 'failed', grants: owed,
    metadata: {mirrorExecutionEnded: true}}));
  const write = await applyRecordChange(owner, WORKFLOW, () => RECORD_CLEARED, {tableId: TABLE});
  assert.equal(write.outcome, 'accepted');
  assert.equal(state.writes[0].partition_transition_metadata, null);
});
