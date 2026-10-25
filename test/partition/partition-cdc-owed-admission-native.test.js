// Native RF3 committed application and CDC_DELIVERED under owed pressure.
// Real partition formation and release owners; loopback transport and receipt
// subscriber are the declared substitutes. This is not remote-recipient or
// public fresh-seed startup acceptance.
import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {PARTITION_CDC_OBLIGATION_BOUND} from '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations, readCdcObligationProgress} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from './partition-release-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';
import {CDC_TABLE} from '../test-helpers/participant-transaction-fixture.js';

const PARTITION_ID = 'cdc-admission-native';
const NODE_ID = 'cdc-admission-node';
const MEMBERS = [1, 2, 3].map((index) => [`${PARTITION_ID}-r${index}`, NODE_ID]);
const CAPACITY = PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS;
const PROPOSAL_BATCH = 64;
const WAIT_MS = 10000;
const WRITE_SQL = `INSERT OR REPLACE INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`;

function appliedIndex(service) {
  const store = Object.create(RaftRsDurableStore.prototype);
  store.db = service.db;
  return Number(store.readDurableRecord(service.partitionId).appliedIndex);
}

test('native RF3 bounds owed admission and commits drain markers on every replica', async (t) => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, logging: {level: 'fatal'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const custody = {group: null, owners: null};
  t.after(async () => {
    const failures = [];
    try {
      await custody.owners?.dispose();
    } catch (error) {
      failures.push(error);
    }
    try {
      await custody.group?.dispose({retainDirectory: failures.length > 0});
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'native CDC fixture cleanup failed');
    }
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  const group = custody.group = await formAdmittedGroup({
    partitionId: PARTITION_ID, members: MEMBERS,
    tempPrefix: 'cdc-owed-native-', budgetMs: WAIT_MS,
    serviceOptions: {tableName: CDC_TABLE, tableId: CDC_TABLE,
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'value', type: 'TEXT'}]}}});
  const owners = custody.owners = await attachPartitionReleaseOwners(group.services,
    {directory: path.dirname(group.dbFileOf(MEMBERS[0])), budgetMs: WAIT_MS});
  await owners.release(PARTITION_ID);
  const leader = group.services.find((service) =>
    service.raft.readStatus().role === RAFT_ROLE.LEADER);
  assert.ok(leader);
  const readiness = {ready: false};
  const subscriber = acknowledgingCdcSubscriber({
    canAcceptCDCEvent: () => ({ready: readiness.ready, retryAfterMs: 20}),
  });
  await leader.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'native-held-debt'});
  for (let offset = 0; offset < CAPACITY; offset += PROPOSAL_BATCH) {
    const length = Math.min(PROPOSAL_BATCH, CAPACITY - offset);
    const results = await Promise.all(Array.from({length},
      (_unused, position) => {
        const index = offset + position;
        return leader.executeQuery(WRITE_SQL, [`r-${index % 10}`, `v-${index}`],
          {entryId: `native-owed-${index}`});
      }));
    assert.ok(results.every((result) => result.success === true), JSON.stringify(results));
  }
  assert.equal(await group.waitFor(() => group.services.every((service) =>
    countCdcObligations(service.db).owed === CAPACITY)), true);
  const held = group.services.map((service) => ({replicaId: service.replicaId,
    owed: countCdcObligations(service.db).owed, appliedIndex: appliedIndex(service)}));
  const refused = await leader.executeQuery(WRITE_SQL, ['extra', 'refused'], {entryId: 'native-extra'});
  assert.equal(refused.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY);
  assert.ok(group.services.every((service) =>
    service.db.prepare(`SELECT * FROM ${CDC_TABLE} WHERE id = ?`).get('extra') === undefined));
  const successor = group.services.find((service) => service !== leader);
  const termBefore = leader.raft.readStatus().term;
  const transfer = await leader.raft.transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
    replicaIdentity: successor.replicaId,
  });
  assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.equal(await group.waitFor(() => successor.raft.readStatus().role === RAFT_ROLE.LEADER &&
    successor.raft.readStatus().term > termBefore), true, 'native successor actually leads');
  // Leadership movement re-engages the release fence. Resume through the
  // same production authority, never by changing the admission flag.
  await owners.release(PARTITION_ID);
  const successorRefusal = await successor.executeQuery(WRITE_SQL, ['extra', 'refused'],
    {entryId: 'native-extra'});
  assert.equal(successorRefusal.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY);
  await successor.subscribeToCDCWithHandshake(subscriber, {subscriberId: 'successor-held-debt'});
  readiness.ready = true;
  assert.equal(await group.waitFor(() => group.services.every((service) =>
    countCdcObligations(service.db).owed === 0)), true, 'native committed ACKs drain all replicas');
  const drained = group.services.map((service) => ({replicaId: service.replicaId,
    progress: readCdcObligationProgress(service.db), appliedIndex: appliedIndex(service)}));
  assert.equal(subscriber.events.length, CAPACITY);
  assert.ok(drained.every((value) => value.progress.reclaimed === CAPACITY &&
    value.progress.advancedIndex <= value.appliedIndex));
  const accepted = await successor.executeQuery(WRITE_SQL, ['extra', 'accepted'],
    {entryId: 'native-extra'});
  assert.equal(accepted.success, true, 'same refused entry remains retryable after native drain');
  t.diagnostic(JSON.stringify({held, refused: refused.failureCode, drained,
    successor: successor.replicaId, termBefore, termAfter: successor.raft.readStatus().term,
    evidence: 'native source apply and ACK markers; receipt subscriber substitutes remote recipient'}));
});
