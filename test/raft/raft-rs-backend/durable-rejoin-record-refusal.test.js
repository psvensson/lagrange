// T5 witness (owner decision O4, committed-read amendment 1, section 3.4):
// a durable rejoin never bootstraps consensus from ACTIVE services rows.
//   - every restore plan the durable-rejoin planner builds opens from the
//     replica's own durable record (the rows are its address book);
//   - with no record, the rs-raft port refuses DURABLE_RECORD_MISSING at the
//     durable-record-read phase, non-retryable, surfaced by the partition as
//     its consensus init refusal - distinct from an unreadable record (a
//     retryable host failure at the same phase);
//   - with a record, the replica restores the record's configuration, not
//     the (planted, wrong) rows;
//   - the rejoin skips the refused replica (it is left to ADD/REPLACE) and
//     still aborts on any other restore failure.
// Oracles: the durable applied-state row on a connection of the test's own.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  addressOf,
  configure,
  createCommittedMembershipHarness,
  metadataCache,
  statusOf,
} from './committed-membership-harness.js';
import {durableAppliedState} from './committed-membership-oracles.js';
import {
  buildDurableRejoinPartitionRestorePlans,
} from '../../../src/bootstrap/shared/durable-rejoin-partition-restore-planner.js';
import {NodeJoiningPublicationActivation} from
  '../../../src/bootstrap/node-joining-publication-activation.js';
import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RUNTIME_PHASE, RUNTIME_REASON} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from
  '../../../src/partition/partition-service-constants.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {SERVICE_TYPE, TABLES} from '../../../src/constants/index.js';

const PARTITION_ID = 'o4-rejoin';
const REJOINER = Object.freeze(['o4-r1', 'o4-node-1']);
const PLANTED = Object.freeze([['o4-r1', 'o4-node-1'],
  ['o4-planted-2', 'o4-node-2'], ['o4-planted-3', 'o4-node-3']]);

function plannerCache() {
  const rows = new Map([
    [TABLES.TABLES, [{table_id: 't', table_name: 't',
      schema_definition: JSON.stringify({columns: [
        {name: 'id', type: 'TEXT', primaryKey: true}]})}]],
    [TABLES.PARTITIONS, [{partition_id: PARTITION_ID, table_id: 't',
      table_name: 't', partition_key_start: null, partition_key_end: null,
      leader_node_id: PLANTED[1][1]}]],
    [TABLES.SERVICES, PLANTED.map(([replicaId, nodeId]) => ({
      service_id: replicaId, replica_id: replicaId,
      service_type: SERVICE_TYPE.PARTITION, node_id: nodeId,
      partition_id: PARTITION_ID, status: 'active',
      address: addressOf([replicaId, nodeId])}))],
  ]);
  return {
    getAll: (tableName) => rows.get(tableName) || [],
    get: (tableName, key) => (rows.get(tableName) || []).find((row) =>
      row.partition_id === key || row.table_id === key ||
      row.service_id === key) || null,
  };
}

function rejoinPlan(dataDir) {
  const plans = buildDurableRejoinPartitionRestorePlans({
    systemTableCache: plannerCache(), nodeId: REJOINER[1], dataDir});
  assert.equal(plans.length, 1, 'setup: one local replica to restore');
  return plans[0];
}

async function openFromPlan(harness, plan) {
  const service = harness.build(REJOINER, {
    replicaIds: plan.replicaIds,
    peerAddresses: plan.peerAddresses,
    cache: metadataCache(PARTITION_ID, PLANTED),
    bootstrapMembership: plan.bootstrapMembership,
  });
  let refused = null;
  try {
    await service.initialize();
  } catch (error) {
    refused = error;
  }
  return {service, refused};
}

test('T5: every durable-rejoin restore plan opens from the durable record, ' +
  'the rows being its address book only', () => {
  const plan = rejoinPlan(fs.mkdtempSync('/tmp/o4-plan-'));
  assert.equal(plan.bootstrapMembership?.kind,
    BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD,
    'the plan names the durable record as its only bootstrap source');
});

test('T5: a rejoin without a durable record is refused ' +
  'DURABLE_RECORD_MISSING, typed and non-retryable, and opens no group',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    const plan = rejoinPlan(harness.directory);
    const {service, refused} = await openFromPlan(harness, plan);
    assert.ok(refused, 'the rejoin is refused, never bootstrapped from rows');
    assert.equal(refused.code,
      PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED);
    assert.equal(refused.consensus?.outcome,
      RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(refused.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING);
    assert.equal(refused.consensus?.phase, RUNTIME_PHASE.DURABLE_RECORD_READ);
    assert.equal(refused.consensus?.retryable, false);
    assert.equal(service.db, null, 'the database handle was released');
    assert.equal(durableAppliedState(harness.dbPathOf(REJOINER), PARTITION_ID),
      null, 'no configuration was written from the rows');
  } finally {
    await harness.dispose();
  }
});

test('T5: a rejoin with a durable record restores its own configuration, ' +
  'not the planted rows; an unreadable record is a retryable host failure ' +
  'at the same phase', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    // The replica's earlier life: the sole founder of its group.
    const founder = harness.build(REJOINER, {
      replicaIds: [REJOINER[0]], peerAddresses: [addressOf(REJOINER)],
      cache: metadataCache(PARTITION_ID, [REJOINER]), deferElection: false});
    await founder.initialize();
    const recorded = durableAppliedState(harness.dbPathOf(REJOINER),
      PARTITION_ID);
    await founder.shutdown();

    const plan = rejoinPlan(harness.directory);
    const {service, refused} = await openFromPlan(harness, plan);
    assert.equal(refused, null, `the record restores (${refused?.message})`);
    assert.deepEqual([...statusOf(service).confState.voters].map(String)
      .sort(), recorded.voters,
    'the restored configuration is the record\'s, not the rows\'');
    await service.shutdown();

    const damaged = new Database(harness.dbPathOf(REJOINER));
    damaged.exec(`DROP TABLE ${RAFT_RS_TABLE.APPLIED_STATE}`);
    damaged.close();
    const unreadable = await openFromPlan(harness, plan);
    assert.ok(unreadable.refused, 'an unreadable record refuses the open');
    assert.equal(unreadable.refused.consensus?.phase,
      RUNTIME_PHASE.DURABLE_RECORD_READ);
    assert.notEqual(unreadable.refused.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING,
      'an unreadable record is not a missing one');
    assert.equal(unreadable.refused.consensus?.retryable, true,
      'and it is retryable');
  } finally {
    await harness.dispose();
  }
});

test('T5: the rejoin skips a replica refused for holding no record and ' +
  'still aborts on any other restore failure', async () => {
  const missing = Object.assign(new Error('refused'), {
    code: PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED,
    consensus: {reason: COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING,
      phase: RUNTIME_PHASE.DURABLE_RECORD_READ},
  });
  const warned = [];
  const context = {
    nodeId: REJOINER[1],
    partitionServices: new Map(),
    logger: {warn: (message, fields) => warned.push({message, fields})},
    createJoinPartitionReplica: async ({replicaOptions}) => {
      if (replicaOptions.replicaId === 'o4-missing') {
        throw missing;
      }
      context.partitionServices.set(replicaOptions.replicaId,
        {initialized: true});
    },
  };
  const ensure = NodeJoiningPublicationActivation.prototype
    .ensureDurableRejoinPartitionRuntimes;
  const restored = await ensure.call(context, [
    {replicaId: 'o4-missing', partitionId: PARTITION_ID},
    {replicaId: 'o4-present', partitionId: PARTITION_ID},
  ]);
  assert.deepEqual(restored.map(({replicaId}) => replicaId), ['o4-present'],
    'only the restored replica is activated and elected');
  assert.equal(warned.length, 1, 'the refusal is recorded');
  context.createJoinPartitionReplica = async () => {
    throw new Error('disk on fire');
  };
  await assert.rejects(ensure.call(context, [
    {replicaId: 'o4-other', partitionId: PARTITION_ID}]), /disk on fire/,
  'any other restore failure still aborts the rejoin');
});

// C2 (lead review, owner decision O3): an rs-raft record written before the
// participation gate existed (its applied-state row has no bootstrap or
// admission index) cannot prove this replica's role. Under the hard cutover
// it is refused typed and non-retryable - reseed - distinct from an
// unreadable record (retryable) and from a missing one.
const PRE_GATE_APPLIED_STATE_DDL = `
  CREATE TABLE ${RAFT_RS_TABLE.APPLIED_STATE} (
    group_id TEXT PRIMARY KEY,
    applied_index INTEGER NOT NULL,
    voters TEXT NOT NULL,
    learners TEXT NOT NULL,
    voters_outgoing TEXT NOT NULL,
    learners_next TEXT NOT NULL,
    auto_leave INTEGER NOT NULL
  )`;

function rewriteAsPreGateRecord(dbFile) {
  const db = new Database(dbFile);
  try {
    db.exec(`ALTER TABLE ${RAFT_RS_TABLE.APPLIED_STATE} RENAME TO gate_era`);
    db.exec(PRE_GATE_APPLIED_STATE_DDL);
    db.exec(`INSERT INTO ${RAFT_RS_TABLE.APPLIED_STATE}
      SELECT group_id, applied_index, voters, learners, voters_outgoing,
             learners_next, auto_leave FROM gate_era`);
    db.exec('DROP TABLE gate_era');
  } finally {
    db.close();
  }
}

test('T5 (C2): a pre-gate durable record is refused typed and ' +
  'non-retryable (DURABLE_RECORD_INCOMPATIBLE), never retried forever',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    const founder = harness.build(REJOINER, {
      replicaIds: [REJOINER[0]], peerAddresses: [addressOf(REJOINER)],
      cache: metadataCache(PARTITION_ID, [REJOINER]), deferElection: false});
    await founder.initialize();
    await founder.shutdown();
    rewriteAsPreGateRecord(harness.dbPathOf(REJOINER));

    const {refused} = await openFromPlan(harness, rejoinPlan(
      harness.directory));
    assert.ok(refused, 'the pre-gate record is not opened');
    assert.equal(refused.code,
      PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED);
    assert.equal(typeof RUNTIME_REASON.DURABLE_RECORD_INCOMPATIBLE, 'string',
      'the runtime owner names the incompatible record');
    assert.equal(refused.consensus?.reason,
      RUNTIME_REASON.DURABLE_RECORD_INCOMPATIBLE);
    assert.equal(refused.consensus?.outcome,
      RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(refused.consensus?.phase, RUNTIME_PHASE.DURABLE_RECORD_READ);
    assert.equal(refused.consensus?.retryable, false,
      'reseed, not retry');
    assert.notEqual(refused.consensus?.reason,
      COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING);
  } finally {
    await harness.dispose();
  }
});
