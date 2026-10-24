// Actual RF1 native persistence and ordinary committed application. A direct
// public native-port proposal supplies retained-history bytes only: this test
// first proves the ordinary write path remains CUTOVER_PAUSED. The observer
// receives the complete original declaration; this RF1 witness does NOT prove
// original RF3 cohort admission, write release, publication or startup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {inspect as describe} from 'node:util';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {getSystemCachePrimaryKeyField} from '../../src/cache/system-cache-key-descriptor.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {buildPartitionWriteEntry, PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {readCdcObligationCensusIn} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {buildProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {readOriginalSeedRetainedEffects} from '../../src/bootstrap/seed-retained-effects.js';
import {SEED_RETAINED_EFFECT_STATE as STATE} from
  '../../src/bootstrap/seed-retained-effects-constants.js';
import {SYSTEM_TABLE_NAME, getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_RS_RETAINED_ENTRY_PHASE as PHASE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {createLoopbackTransport, waitForCondition} from
  '../partition/partition-service-test-support.js';
import {NODE_ID, originalDeclaration, memberOf, foundationMutation} from
  './seed-retained-effects-fixture.js';

const TEST_TIMEOUT_MS = 30000;
const GROUP_BUDGET_MS = 10000;
const PROVISIONAL_RETRY_MS = 20;
const GROUP_TIMING = Object.freeze({heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300});
const APPLICATION_FAULT = 'original foundation application held by witness';
const FOUNDATION_TABLES = [SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_NAME.PARTITIONS];

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

function inspect(declaration, member) {
  const db = new Database(member.dbPath, {readonly: true, fileMustExist: true});
  try {
    const before = db.serialize();
    const result = readOriginalSeedRetainedEffects({db, declaration, member});
    assert.deepEqual(db.serialize(), before, 'observer leaves physical SQLite bytes unchanged');
    assert.equal(db.inTransaction, false);
    assert.equal(result.state, STATE.ACCEPTED, describe(result, {depth: 8}));
    assert.equal(result.groupId, member.groupId);
    assert.equal(result.replicaId, member.replicaId);
    return result;
  } finally {
    db.close();
  }
}

function holdStatementApplication(service, entryId) {
  const original = service.applyCommittedEntry;
  const reached = Promise.withResolvers();
  let armed = true;
  let failures = 0;
  const wrapper = function(committed) {
    if (armed && committed.command?.entryId === entryId) {
      failures++;
      reached.resolve(committed);
      throw new Error(APPLICATION_FAULT);
    }
    return Reflect.apply(original, this, [committed]);
  };
  service.applyCommittedEntry = wrapper;
  return {reached: reached.promise, failures: () => failures,
    restore() {
      armed = false;
      assert.equal(service.applyCommittedEntry, wrapper);
      service.applyCommittedEntry = original;
    }};
}

async function closeServices(services, pending, directory) {
  const settled = await Promise.allSettled(services.map((service) => service.shutdown()));
  const errors = settled.filter(({status}) => status === 'rejected').map(({reason}) => reason);
  if (errors.length > 0) {
    throw new AggregateError(errors, `shutdown incomplete; retained directory ${directory}`);
  }
  await Promise.allSettled(pending);
  fs.rmSync(directory, {recursive: true, force: true});
}

for (const tableName of FOUNDATION_TABLES) {
  test(`${tableName}: real committed original SQL stays pending cold, then ordinary replay ` +
    'retains one outcome and owed event visible through SystemTableCache',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retained-foundation-native-'));
    const declaration = originalDeclaration(directory);
    const member = memberOf(declaration, tableName);
    fs.mkdirSync(path.dirname(member.dbPath), {recursive: true});
    const mutation = foundationMutation(declaration, tableName);
    const entryId = `retained-original-${tableName}`;
    const options = {partitionId: member.groupId, replicaId: member.replicaId,
      replicaIds: [member.replicaId], nodeId: declaration.nodeId,
      tableId: tableName, tableName, schema: getSchemaByTableName(tableName),
      deferElection: true, transport: createLoopbackTransport(), dbPath: member.dbPath};
    const services = [];
    const pending = [];
    t.after(() => closeServices(services, pending, directory));
    const first = new PartitionService(withFoundingStamp(options));
    services.push(first);
    await first.initialize();
    await first.raft.campaign();
    assert.equal(first.raft.readStatus().role, RAFT_ROLE.LEADER);
    const enabled = await enableParticipantTransactionAdmission(first);
    assert.equal(enabled.success, true, 'actual ENABLE applies before the held statement');
    const before = inspect(declaration, member);
    assert.equal(before.rows.length, 0);
    const refused = await first.executeQuery(mutation.sql, mutation.params, {entryId});
    assert.equal(refused.success, false, describe(refused));
    assert.equal(refused.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED,
      'ENABLE alone does not open ordinary write admission for this standalone service');
    assert.equal(refused.deferRetry, true);
    assert.deepEqual(inspect(declaration, member), before,
      'the ordinary refusal leaves native entries, frontiers and all application owners unchanged');
    const resources = {db: first.db, port: first.raft, handler: first.transportHandler};
    // The regular write-entry producer supplies the current service HLC and
    // proposer identity. Native history/application is the sole positive claim;
    // no release state or complete-cohort authority is fabricated here.
    const command = buildPartitionWriteEntry({type: PARTITION_SERVICE_OPERATION.QUERY,
      sql: mutation.sql, params: mutation.params, entryId,
      operationId: null, idempotencyKey: null, splitMirrorOrigin: null},
    {timestamp: first.hlcClock.now(), proposedBy: first.replicaId,
      proposedAt: first.timeSource.now()});
    const fault = holdStatementApplication(first, entryId);
    let proposalOutcome = null;
    const writing = Promise.resolve().then(() => first.raft.propose(command)).then(
      (answer) => (proposalOutcome = {status: 'fulfilled', answer}),
      (error) => (proposalOutcome = {status: 'rejected', error}));
    pending.push(writing);
    assert.equal(await waitForCondition(() => fault.failures() > 0 || proposalOutcome !== null,
      GROUP_BUDGET_MS), true, 'native application or a typed proposal answer must become observable');
    assert.ok(fault.failures() > 0,
      `proposal answered before the held SQL callback: ${describe(proposalOutcome, {depth: 8})}`);
    const actual = await fault.reached;
    const proposal = await writing;
    assert.equal(proposal.status, 'fulfilled', describe(proposal));
    assert.equal(proposal.answer.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      'the injected application failure is a typed native host failure, never proposal success');
    const held = inspect(declaration, member);
    const retained = held.history.entries.find((entry) => entry.command?.entryId === entryId);
    assert.ok(retained, 'native history holds the actual proposal');
    assert.equal(retained.phase, PHASE.COMMITTED_PENDING);
    assert.equal(retained.index, String(actual.index));
    assert.equal(retained.term, String(actual.term));
    assert.deepEqual(retained.command, actual.command);
    assert.deepEqual(retained.command, command);
    assert.deepEqual(retained.command.params, mutation.params);
    assert.equal(retained.command.sql, mutation.sql);
    assert.equal(held.rows.length, 0);
    assert.equal(held.outcomes.length, 0);
    assert.deepEqual(held.obligations, {exists: false, rows: [], progress: null});
    const durableEntries = held.history.record.entries;
    await first.shutdown();
    await writing;
    fault.restore();
    assert.equal(resources.db.open, false);
    assert.equal(resources.port.readStatus().outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED);
    assert.equal(first.transport.getRegisteredHandler(first.unifiedAddress), null);
    assert.equal(first.db, null);
    assert.equal(first.raft, null);
    assert.deepEqual(inspect(declaration, member), held,
      'cold read preserves exact command, pending frontier and empty application owners');

    const reopened = new PartitionService({...options,
      bootstrapMembership: durableRecordBootstrap(), identityExisted: true});
    services.push(reopened);
    await reopened.initialize();
    const replayed = inspect(declaration, member);
    const applied = replayed.history.entries.find((entry) => entry.index === retained.index);
    assert.equal(applied.phase, PHASE.APPLIED);
    assert.deepEqual(applied.command, retained.command);
    assert.deepEqual(replayed.history.record.entries.slice(0, durableEntries.length),
      durableEntries, 'ordinary replay preserves the original retained prefix bytes');
    assert.equal(replayed.origin.generation, '1');
    assert.equal(replayed.rows.length, 1);
    assert.equal(replayed.outcomes.length, 1);
    assert.equal(replayed.outcomes[0].logIndex, retained.index);
    assert.equal(replayed.obligations.rows.length, 1);
    assert.equal(replayed.obligations.rows[0].logIndex, retained.index);
    assert.equal(replayed.obligations.rows[0].delivered, '0');
    const cache = new SystemTableCache();
    const received = [];
    const subscriber = {
      canAcceptCDCEvent: () => true,
      async handleCDCEvent(event) {
        received.push(event);
        cache.applySystemTableChange(event.tableName, event.operation, event.data);
        // Cache visibility is provisional recipient work, never a forged MG
        // committed receipt and never permission to clear the source debt.
        return buildProvisionalCdcOutcome([event], PROVISIONAL_RETRY_MS);
      },
    };
    reopened.subscribeToCDC(subscriber);
    if (reopened.raft.readStatus().role !== RAFT_ROLE.LEADER) await reopened.raft.campaign();
    const key = getSystemCachePrimaryKeyField(tableName);
    assert.equal(await waitForCondition(() => cache.getAll(tableName).some((row) =>
      row[key] === mutation.data[key]), GROUP_BUDGET_MS), true,
    'the real CDC delivery owner exposes the original row through SystemTableCache');
    const cached = cache.find(tableName, (row) => row[key] === mutation.data[key]);
    for (const [field, value] of Object.entries(mutation.data)) {
      assert.deepEqual(cached[field], value, `cache preserves original producer field ${field}`);
    }
    assert.ok(received.some((event) => String(event.sourceLogIndex) === retained.index &&
      event.eventKey === replayed.obligations.rows[0].eventKey));
    assert.deepEqual(reopened.db.transaction(() =>
      readCdcObligationCensusIn(reopened.db))(), replayed.obligations,
    'provisional cache visibility preserves the exact owed source occurrence');
    const repeated = await reopened.executeQuery(mutation.sql, mutation.params, {entryId});
    assert.equal(repeated.success, true, 'same original statement answers its durable outcome');
    const afterRetry = inspect(declaration, member);
    assert.deepEqual(afterRetry.outcomes, replayed.outcomes);
    assert.deepEqual(afterRetry.obligations, replayed.obligations);
    assert.equal(afterRetry.origin.generation, '1');
    assert.equal(afterRetry.history.entries.filter((entry) =>
      entry.command?.entryId === entryId).length, 1,
    'durable redelivery does not propose a replacement source occurrence');
    reopened.unsubscribeFromCDC(subscriber);
  });
}
