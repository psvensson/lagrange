// Exact read-only correspondence over real storage/application owners. These
// fixtures do not establish the original opening's complete cohort or rights.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {inspect as describe} from 'node:util';
import {CDC_OPERATION, COLUMN} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {SYSTEM_TABLE_NAME, getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {seedTableRow, seedPartitionRow} from '../../src/bootstrap/seed-foundation-rows.js';
import {buildCdcSourceScopeEvidence, isCdcSourceScopeEvidence, CDC_SOURCE_SCOPE_AUTHORITY} from
  '../../src/cdc/cdc-source-scope-evidence.js';
import {SeedRegistrationPhase} from '../../src/bootstrap/phases/seed-registration-phase.js';
import {readOriginalSeedRetainedEffects} from '../../src/bootstrap/seed-retained-effects.js';
import {SEED_RETAINED_EFFECT_STATE as STATE, SEED_RETAINED_EFFECT_REASON as REASON} from
  '../../src/bootstrap/seed-retained-effects-constants.js';
import {RAFT_RS_RETAINED_ENTRY_PHASE as PHASE, RAFT_RS_TABLE} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {PARTICIPANT_TRANSACTION_COMMAND as PARTICIPANT_COMMAND,
  PARTICIPANT_TRANSACTION_STATE as PARTICIPANT_STATE,
  PARTICIPANT_ORIGIN_HISTORY_STATE as ORIGIN_STATE} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {insertParticipantTransactionRow, readParticipantTransactionCensusIn,
  readPartitionWriteOriginHistory, openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';
import {readCommittedStatementCensusIn, createCommittedStatementOutcomeTable} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {RETAINED_STORE_ERROR} from '../../src/partition/partition-retained-store-observation.js';
import {cdcObligationLedgerExists, readCdcObligationCensusIn,
  ensureCdcObligationLedger, insertCdcObligation, buildCdcAcknowledgementCommand,
  cdcObligationEventKeyDigest} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {MESSAGE_GROUP_COMMAND_TYPE as MG_COMMAND} from '../../src/message-group/constants.js';
import {readTransactionSchemaEnforcement,
  TRANSACTION_SCHEMA_ENFORCEMENT_STATE as ENFORCEMENT} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {ORIGINAL_ALLOCATION_REASON} from '../../src/raft/raft-rs-original-allocation-constants.js';
import {NODE_ID, DECLARED_AT, TERM, originalStamp, foundationMutation, sqlCommand, acknowledgement,
  fixture, retain, origin} from './seed-retained-effects-fixture.js';

const FOUNDATION_TABLES = [SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_NAME.PARTITIONS];
const LEDGER = '_cdc_obligations';
const OUTCOMES = '_partition_statement_outcomes';
const GENERATION = '_partition_write_generation';
const PARTICIPANTS = '_participant_transactions';

function census(db, read) {
  return db.transaction(() => read(db))();
}

function observe(f, input = {}) {
  const before = f.db.serialize();
  const result = readOriginalSeedRetainedEffects({...f, ...input});
  assert.deepEqual(f.db.serialize(), before,
    'the observer performs no DDL, replay, repair, acknowledgment or row writes');
  assert.equal(f.db.inTransaction, false, 'the observer settles its own snapshot');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.groupId, (input.member ?? f.member).groupId);
  assert.equal(result.replicaId, (input.member ?? f.member).replicaId);
  return result;
}

function appliedFoundation(t, tableName = SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
  const f = fixture(t, tableName);
  const mutation = foundationMutation(f.declaration, tableName);
  const command = sqlCommand(f.member, mutation);
  retain(f, [origin(f), command]);
  assert.equal(census(f.db, readCommittedStatementCensusIn).length, 1,
    'the real statement application retained its outcome');
  assert.equal(census(f.db, readCdcObligationCensusIn).rows.length, 1,
    'the real CDC capture retained owed debt');
  return {...f, mutation, command};
}

function expect(f, state, reason) {
  const result = observe(f);
  assert.equal(result.state, state, describe(result, {depth: 8}));
  if (reason !== undefined) assert.equal(result.reason, reason);
  return result;
}

test('original producer SQL is observed in each native range without applying pending work',
  async (t) => {
    for (const tableName of FOUNDATION_TABLES) {
      for (const [phase, applied, commit] of [
        [PHASE.APPLIED, 2, 2], [PHASE.COMMITTED_PENDING, 1, 2],
        [PHASE.LOCAL_UNCOMMITTED, 1, 1],
      ]) {
        await t.test(`${tableName}: ${phase}`, (t) => {
          const f = fixture(t, tableName);
          const mutation = foundationMutation(f.declaration, tableName);
          const command = sqlCommand(f.member, mutation);
          retain(f, [origin(f), command], {applied, commit});
          const result = expect(f, STATE.ACCEPTED);
          assert.deepEqual(result.history.entries[1].command, command);
          assert.equal(result.history.entries[1].phase, phase);
          assert.equal(result.origin.generation, applied === 2 ? '1' : '0');
          assert.equal(result.obligations.rows.length, applied === 2 ? 1 : 0);
          const stored = f.db.prepare(`SELECT * FROM ${tableName}`).all();
          assert.equal(stored.length, applied === 2 ? 1 : 0);
          if (stored.length) {
            for (const [key, value] of Object.entries(mutation.data)) {
              assert.deepEqual(stored[0][key], value, `producer field ${key} survives apply`);
            }
          }
          assert.deepEqual(observe(f), result, 'inspection rereads the same unchanged facts');
          assert.equal(Object.hasOwn(result, 'opening'), false);
          assert.equal(Object.hasOwn(result, 'serving'), false);
        });
      }
    }
  });

test('first outcome and CDC obligation survive deduplicated SQL and repeated origin', (t) => {
  const f = fixture(t);
  const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
  const retry = {...command, ...originalStamp(f.member, 1)};
  retain(f, [origin(f), command, retry, origin(f)]);
  const result = expect(f, STATE.ACCEPTED);
  assert.equal(result.origin.generation, '1');
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].logIndex, '2');
  assert.equal(result.obligations.rows.length, 1);
  assert.equal(result.obligations.rows[0].logIndex, '2');
  assert.equal(result.obligations.rows[0].delivered, '0');
});

test('first origin resets legacy generation while later origin preserves successful effects', (t) => {
  const f = fixture(t);
  const mutation = foundationMutation(f.declaration, f.member.tableName);
  const first = sqlCommand(f.member, mutation, 'legacy-foundation');
  const second = sqlCommand(f.member, mutation, 'post-origin-foundation');
  retain(f, [first, origin(f), second, origin(f)]);
  const result = expect(f, STATE.ACCEPTED);
  assert.equal(result.origin.generation, '1');
  assert.deepEqual(result.origin.appliedOrigin, {originIndex: '2', originTerm: TERM});
  assert.equal(result.outcomes.length, 2);
  assert.equal(result.obligations.rows.length, 2);
});

test('one statement identity cannot authorize a different canonical foundation row', (t) => {
  const f = fixture(t, SYSTEM_TABLE_NAME.TABLES);
  const first = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName,
    SYSTEM_TABLE_NAME.TABLES));
  const changed = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName,
    SYSTEM_TABLE_NAME.PARTITIONS), first.entryId);
  retain(f, [origin(f), first, changed], {applied: 2});
  expect(f, STATE.CONTRARY, REASON.OUTCOME);
});

test('recognizing QUERY or ENABLE cannot hide a nonoriginal command effect', async (t) => {
  const variants = [
    ['noncanonical SQL', (command) => ({...command, sql: `${command.sql} `})],
    ['changed immutable row identity', (command) =>
      ({...command, params: ['foreign-foundation', ...command.params.slice(1)]})],
    ['changed creation stamp', (command) =>
      ({...command, params: command.params.map((value) => value === 1234 ? 1235 : value)})],
    ['missing parameters', (command) => ({...command, params: command.params.slice(1)})],
    ['extra parameter', (command) => ({...command, params: [...command.params, null]})],
    ['foreign proposer', (command) => ({...command, proposedBy: 'foreign-replica'})],
    ['malformed timestamp', (command) => ({...command, timestamp: 'not-an-hlc'})],
    ['foreign but valid timestamp identity', (command) => ({...command,
      timestamp: new HLCTimestamp(DECLARED_AT, 0, 'foreign-replica').toString()})],
    ['negative proposed time', (command) => ({...command, proposedAt: -1})],
    ['session work', (command) => ({...command, sessionId: 'foreign-session'})],
    ['transaction work', (command) => ({...command, transactionId: 'foreign-transaction'})],
    ['split mirror work', (command) => ({...command, splitMirrorOrigin: 'snapshot'})],
    ['transaction command', (command) => ({...command, type: PARTICIPANT_COMMAND.PREPARE})],
    ['ENABLE carrying SQL', (command, f) => ({...origin(f), sql: command.sql})],
  ];
  for (const [name, change] of variants) {
    await t.test(name, (t) => {
      const f = fixture(t);
      const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
      retain(f, [origin(f), change(command, f)], {applied: 1});
      expect(f, STATE.CONTRARY);
    });
  }
});

test('original source stamps bind the actual proposer while preserving forwarded command bytes',
  async (t) => {
    for (const kind of ['ENABLE', 'QUERY', 'CDC_DELIVERED']) {
      await t.test(`${kind}: valid HLC from a different producer is contrary`, (t) => {
        const f = fixture(t);
        const command = sqlCommand(f.member,
          foundationMutation(f.declaration, f.member.tableName));
        const commands = kind === 'ENABLE' ? [origin(f)] : kind === 'QUERY' ?
          [origin(f), command] : [origin(f), command, acknowledgement(f.member, command, 2)];
        const last = commands.at(-1);
        last.timestamp = new HLCTimestamp(DECLARED_AT, 0, 'foreign-hlc-owner').toString();
        retain(f, commands, {applied: commands.length - 1});
        expect(f, STATE.CONTRARY);
      });
    }
    await t.test('another declared founder stamps a forwarded original command', (t) => {
      const f = fixture(t);
      const proposer = f.declaration.members.find((member) =>
        member.groupId === f.member.groupId && member.replicaId !== f.member.replicaId);
      assert.ok(proposer, 'a different declared group member must engage forwarding identity');
      const command = sqlCommand(proposer,
        foundationMutation(f.declaration, f.member.tableName));
      command.timestamp = new HLCTimestamp(DECLARED_AT + 7, 2, proposer.replicaId).toString();
      command.proposedAt = DECLARED_AT + 9;
      retain(f, [origin(f), command], {applied: 1});
      const result = expect(f, STATE.ACCEPTED);
      assert.deepEqual(result.history.entries[1].command, command,
        'forwarding keeps the original producer and need not align its clocks with declaration time');
    });
  });

test('catalog identity and unused publication rights do not admit service or config work',
  async (t) => {
    for (const tableName of [SYSTEM_TABLE_NAME.SERVICES, SYSTEM_TABLE_NAME.CONFIG]) {
      await t.test(tableName, (t) => {
        const f = fixture(t, tableName);
        retain(f, [sqlCommand(f.member,
          {sql: `INSERT INTO ${tableName} DEFAULT VALUES`, params: []})], {applied: 0});
        expect(f, STATE.CONTRARY, REASON.COMMAND);
      });
    }
    await t.test('substituted member incarnation', (t) => {
      const f = fixture(t);
      retain(f, [origin(f)]);
      const result = observe(f, {member: {...f.member, incarnation: 'foreign-incarnation'}});
      assert.equal(result.state, STATE.CONTRARY);
      assert.equal(result.reason, REASON.IDENTITY);
    });
  });

test('applied foundation rows must match their exact producer and applied command', async (t) => {
  const mutations = [
    ['missing row', `DELETE FROM ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS}`],
    ['different leader', `UPDATE ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS} SET leader_node_id = 'foreign'`],
    ['different creation', `UPDATE ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS} SET created_at = 1235`],
    ['different key', `UPDATE ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS} SET group_id = 'foreign'`],
    ['extra row', `INSERT INTO ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS} ` +
      '(group_id, group_name, replica_count, leader_node_id, policy, created_at, updated_at) ' +
      'SELECT \'extra\', group_name, replica_count, leader_node_id, policy, created_at, updated_at ' +
      `FROM ${SYSTEM_TABLE_NAME.MESSAGE_GROUPS}`],
  ];
  for (const [name, sql] of mutations) {
    await t.test(name, (t) => {
      const f = appliedFoundation(t);
      expect(f, STATE.ACCEPTED);
      f.db.exec(sql);
      expect(f, STATE.CONTRARY, REASON.ROWS);
    });
  }
  await t.test('canonical row without applied statement is not inferred applied', (t) => {
    const f = fixture(t);
    const mutation = foundationMutation(f.declaration, f.member.tableName);
    retain(f, [origin(f), sqlCommand(f.member, mutation)], {applied: 1});
    f.db.prepare(mutation.sql).run(...mutation.params);
    expect(f, STATE.CONTRARY, REASON.ROWS);
  });
  await t.test('partition transition work', (t) => {
    const f = appliedFoundation(t, SYSTEM_TABLE_NAME.PARTITIONS);
    f.db.exec(`UPDATE ${SYSTEM_TABLE_NAME.PARTITIONS} SET size_bytes = 1`);
    expect(f, STATE.CONTRARY, REASON.ROWS);
  });
});

test('participant, origin, generation and statement outcomes are one observed extent', async (t) => {
  const changes = [
    ['missing outcome', `DELETE FROM ${OUTCOMES}`, REASON.OUTCOME],
    ['moved outcome index', `UPDATE ${OUTCOMES} SET log_index = 1`, REASON.OUTCOME],
    ['wrong outcome term', `UPDATE ${OUTCOMES} SET term = 2`, REASON.OUTCOME],
    ['failed outcome', `UPDATE ${OUTCOMES} SET outcome = '${OUTCOME.STATEMENT_FAILED}'`,
      REASON.OUTCOME],
    ['zero changed rows', `UPDATE ${OUTCOMES} SET changes = 0`, REASON.OUTCOME],
    ['lost insert identity', `UPDATE ${OUTCOMES} SET last_insert_rowid = NULL`, REASON.OUTCOME],
    ['foreign owner result', `UPDATE ${OUTCOMES} SET owner_result_text = '{}'`, REASON.OUTCOME],
    ['stray outcome', `INSERT INTO ${OUTCOMES} (entry_key, outcome, log_index, term) ` +
      `VALUES ('stray', '${OUTCOME.APPLIED}', 1, 3)`, REASON.OUTCOME],
    ['extra generation', `UPDATE ${GENERATION} SET generation = 2`, REASON.GENERATION],
    ['lost origin', `UPDATE ${GENERATION} SET origin_index = NULL, origin_term = NULL`,
      REASON.ORIGIN],
  ];
  for (const [name, sql, reason] of changes) {
    await t.test(name, (t) => {
      const f = appliedFoundation(t);
      expect(f, STATE.ACCEPTED);
      f.db.exec(sql);
      expect(f, STATE.CONTRARY, reason);
    });
  }
  await t.test('terminal transaction is still unrelated work', (t) => {
    const f = appliedFoundation(t);
    insertParticipantTransactionRow(f.db, {transactionId: 'foreign-tx',
      participantId: 'foreign-participant', commitMode: 'durable', transactionEpoch: 1,
      state: PARTICIPANT_STATE.ROLLED_BACK});
    expect(f, STATE.CONTRARY, REASON.PARTICIPANT);
  });
});

test('source obligation census rejects missing, extra and changed debt', async (t) => {
  const changes = [
    ['missing owed row', `DELETE FROM ${LEDGER}`],
    ['erased lazy ledger after emission', `DROP TABLE ${LEDGER}`],
    ['wrong source term', `UPDATE ${LEDGER} SET term = 2`],
    ['wrong source ordinal', `UPDATE ${LEDGER} SET ordinal = 1`],
    ['wrong source identity', `UPDATE ${LEDGER} SET event_key = 'foreign'`],
    ['wrong source entry id', `UPDATE ${LEDGER} SET entry_id = 'foreign'`],
    ['content changed', `UPDATE ${LEDGER} SET event_json = '{}'`],
    ['malformed delivered flag', `UPDATE ${LEDGER} SET delivered = 2`],
    ['invented delivered position', `UPDATE ${LEDGER} SET delivered = 1, ` +
      'delivered_index = 2, delivered_term = 3'],
  ];
  for (const [name, sql] of changes) {
    await t.test(name, (t) => {
      const f = appliedFoundation(t);
      expect(f, STATE.ACCEPTED);
      f.db.exec(sql);
      expect(f, STATE.CONTRARY);
    });
  }
  await t.test('additional source occurrence', (t) => {
    const f = appliedFoundation(t);
    const [row] = census(f.db, readCdcObligationCensusIn).rows;
    insertCdcObligation(f.db, {...row, eventKey: 'extra-event', entryId: 'extra-entry',
      logIndex: 1, term: Number(TERM), ordinal: 1});
    expect(f, STATE.CONTRARY, REASON.OBLIGATION);
  });
});

test('scope-absent original CDC debt cannot acquire invented source-scope authority', (t) => {
  const f = appliedFoundation(t);
  const accepted = expect(f, STATE.ACCEPTED);
  const [owed] = accepted.obligations.rows;
  const event = JSON.parse(owed.eventJson);
  assert.equal(Object.hasOwn(event, 'sourceScope'), false,
    'the actual original source producer does not attach sourceScope');
  const schema = getSchemaByTableName(f.member.tableName);
  const sourceScope = buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.BOOTSTRAP_GENESIS,
    tableDescriptor: seedTableRow(schema, f.declaration.declaredAt),
    partitionDescriptor: seedPartitionRow(schema, f.declaration.nodeId, f.declaration.declaredAt),
  });
  assert.equal(isCdcSourceScopeEvidence(sourceScope), true,
    'the injected scope is valid evidence in isolation, not merely malformed input');
  const update = f.db.prepare(`UPDATE ${LEDGER} SET event_json = ? WHERE event_key = ?`);
  update.run(JSON.stringify({...event, sourceScope}), owed.eventKey);
  expect(f, STATE.CONTRARY, REASON.OBLIGATION);
  update.run(owed.eventJson, owed.eventKey);
  assert.deepEqual(expect(f, STATE.ACCEPTED), accepted,
    'a fresh read accepts the restored actual source event without cached refusal');
});

test('only the first applied pinned ACK can justify a delivered obligation', async (t) => {
  await t.test('applied repeated ACK keeps first position', (t) => {
    const f = fixture(t);
    const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
    const ack = acknowledgement(f.member, command, 2);
    retain(f, [origin(f), command, ack, ack]);
    const result = expect(f, STATE.ACCEPTED);
    assert.equal(result.origin.generation, '1');
    assert.equal(result.obligations.rows[0].delivered, '1');
    assert.equal(result.obligations.rows[0].deliveredIndex, '3');
    f.db.exec(`UPDATE ${LEDGER} SET delivered_index = 4`);
    expect(f, STATE.CONTRARY, REASON.OBLIGATION);
  });
  await t.test('committed-pending ACK retains owed debt', (t) => {
    const f = fixture(t);
    const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
    const ack = acknowledgement(f.member, command, 2);
    retain(f, [origin(f), command, ack], {applied: 2});
    const result = expect(f, STATE.ACCEPTED);
    assert.equal(result.obligations.rows[0].delivered, '0');
    assert.equal(result.obligations.rows[0].deliveredIndex, null);
    f.db.exec(`UPDATE ${LEDGER} SET delivered = 1, delivered_index = 3, delivered_term = 3`);
    expect(f, STATE.CONTRARY, REASON.OBLIGATION);
  });
});

test('lazy ledger absence and pending SQL-to-ACK dependencies preserve every obligation', async (t) => {
  await t.test('no emitting application legitimately has no lazy ledger', (t) => {
    const f = fixture(t);
    retain(f, [origin(f)]);
    assert.equal(cdcObligationLedgerExists(f.db), false);
    const result = expect(f, STATE.ACCEPTED);
    assert.deepEqual(result.obligations, {exists: false, rows: []});
    ensureCdcObligationLedger(f.db);
    assert.equal(expect(f, STATE.ACCEPTED).obligations.exists, true);
  });
  for (const commit of [2, 3]) {
    await t.test(`pending SQL and pending ACK at commit ${commit}`, (t) => {
      const f = fixture(t);
      const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
      const ack = acknowledgement(f.member, command, 2);
      retain(f, [origin(f), command, ack], {applied: 1, commit});
      assert.equal(cdcObligationLedgerExists(f.db), false);
      const result = expect(f, STATE.UNAVAILABLE, REASON.PENDING_SOURCE);
      assert.deepEqual(result.history.entries.slice(1).map(({command}) => command), [command, ack]);
      assert.deepEqual(result.obligations, {exists: false, rows: []});
    });
  }
  for (const [name, index, key] of [
    ['no preceding occurrence', 1, 'original-foundation-statement'],
    ['wrong pending digest', 2, 'foreign-statement'],
  ]) {
    await t.test(name, (t) => {
      const f = fixture(t);
      const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
      const ack = buildCdcAcknowledgementCommand(f.member.groupId,
        [{logIndex: index, events: [{ordinal: 0,
          eventKeyDigest: cdcObligationEventKeyDigest(`entry:${key}`)}]}],
        originalStamp(f.member, 1));
      retain(f, [origin(f), command, ack], {applied: 1});
      expect(f, STATE.CONTRARY, REASON.ACK);
    });
  }
});

test('MG content correspondence never grants source-occurrence or delivery authority', async (t) => {
  const source = appliedFoundation(t);
  const [owed] = census(source.db, readCdcObligationCensusIn).rows;
  const {tableName, operation, data, timestamp} = JSON.parse(owed.eventJson);
  assert.equal(operation, CDC_OPERATION.UPSERT);
  const event = {tableName, operation, data, timestamp};
  const variants = [
    ['single exact content', {type: MG_COMMAND.CDC, ...event}, STATE.UNAVAILABLE],
    ['batch exact content', {type: MG_COMMAND.CDC_BATCH, events: [event]}, STATE.UNAVAILABLE],
    ['valid envelope clock differs from original row clock', {type: MG_COMMAND.CDC, ...event,
      timestamp: new HLCTimestamp(DECLARED_AT + 1, 0, NODE_ID).toString()}, STATE.UNAVAILABLE],
    ['batch cannot drop malformed member', {type: MG_COMMAND.CDC_BATCH, events: [event, null]},
      STATE.CONTRARY],
    ['missing timestamp cannot be invented', {type: MG_COMMAND.CDC,
      tableName, operation, data}, STATE.CONTRARY],
    ['malformed envelope timestamp', {type: MG_COMMAND.CDC, ...event,
      timestamp: 'not-an-hlc'}, STATE.CONTRARY],
    ['unrelated message', {type: MG_COMMAND.MESSAGE, ...event}, STATE.CONTRARY],
    ['unrelated acknowledgment', {type: MG_COMMAND.ACK, ...event}, STATE.CONTRARY],
    ['foreign row', {type: MG_COMMAND.CDC, ...event,
      data: {...data, group_id: 'foreign'}}, STATE.CONTRARY],
    ['inconsistent HLC row', {type: MG_COMMAND.CDC, ...event,
      data: {...data, [COLUMN.UPDATED_AT_HLC]: 'foreign'}}, STATE.CONTRARY],
  ];
  for (const [name, command, state] of variants) {
    await t.test(name, (t) => {
      const f = fixture(t, null);
      retain(f, [command], {applied: 0});
      const result = expect(f, state, state === STATE.UNAVAILABLE ? REASON.MG_SOURCE : undefined);
      assert.deepEqual(result.history.entries[0].command, command);
      assert.deepEqual(census(source.db, readCdcObligationCensusIn).rows, [owed],
        'recipient observation leaves source delivery debt intact');
    });
  }
});

test('MG observers retain original TABLES and PARTITIONS content without inventing source binding',
  async (t) => {
    for (const tableName of [SYSTEM_TABLE_NAME.TABLES, SYSTEM_TABLE_NAME.PARTITIONS]) {
      await t.test(tableName, (t) => {
        const source = appliedFoundation(t, tableName);
        const [owed] = census(source.db, readCdcObligationCensusIn).rows;
        const {operation, data, timestamp} = JSON.parse(owed.eventJson);
        const f = fixture(t, null);
        const command = {type: MG_COMMAND.CDC, tableName, operation, data, timestamp};
        retain(f, [command], {applied: 0});
        const result = expect(f, STATE.UNAVAILABLE, REASON.MG_SOURCE);
        assert.deepEqual(result.history.entries[0].command, command);
        assert.deepEqual(census(source.db, readCdcObligationCensusIn).rows, [owed]);
      });
    }
  });

// Corrupt the actual production CREATE bytes, preserving its owned explicit
// indexes. This does not replace schema setup with a test's interpretation.
function replaceApplicationSchema(f, change) {
  const tableName = f.member.tableName;
  const {sql} = f.db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?')
    .get('table', tableName);
  const indexes = f.db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND tbl_name = ? ' +
    'AND sql IS NOT NULL').all('index', tableName);
  const altered = change(sql);
  assert.notEqual(altered, sql, 'the schema mutation must engage the production bytes');
  f.db.exec(`DROP TABLE ${tableName}`);
  f.db.exec(altered);
  for (const index of indexes) f.db.exec(index.sql);
}

test('empty required application tables still require the actual partition schema', async (t) => {
  const changes = [
    ['missing table', (f) => f.db.exec(`DROP TABLE ${f.member.tableName}`), STATE.UNAVAILABLE],
    ['missing column', (f) => f.db.exec(
      `ALTER TABLE ${f.member.tableName} DROP COLUMN leader_node_id`), STATE.UNAVAILABLE],
    ['extra column', (f) => f.db.exec(
      `ALTER TABLE ${f.member.tableName} ADD COLUMN unexpected TEXT`), STATE.CONTRARY],
    ['wrong declared type', (f) => replaceApplicationSchema(f,
      (sql) => sql.replace('group_id TEXT', 'group_id BLOB')), STATE.CONTRARY],
    ['missing primary key', (f) => replaceApplicationSchema(f,
      (sql) => sql.replace('group_id TEXT PRIMARY KEY', 'group_id TEXT')), STATE.CONTRARY],
  ];
  for (const [name, change, state] of changes) {
    await t.test(name, (t) => {
      const f = fixture(t);
      retain(f, [origin(f)]);
      assert.equal(f.db.prepare(`SELECT count(*) AS count FROM ${f.member.tableName}`).get().count, 0);
      expect(f, STATE.ACCEPTED);
      change(f);
      expect(f, state);
    });
  }
});

test('application schema rejects an unresolved view without evaluating or repairing its body',
  (t) => {
    const f = appliedFoundation(t);
    const tableName = f.member.tableName;
    const accepted = expect(f, STATE.ACCEPTED);
    const image = tableImage(f.db, tableName);
    assert.equal(image.rows.length, 1, 'the restoration control preserves an actual applied row');
    f.db.exec(`DROP TABLE ${tableName}`);
    f.db.exec(`CREATE VIEW ${tableName} AS SELECT * FROM retained_missing_view_body`);
    assert.throws(() => f.db.prepare(`SELECT * FROM ${tableName}`),
      (error) => error.code === 'SQLITE_ERROR', 'the view body is deliberately unavailable');
    const contrary = expect(f, STATE.CONTRARY, REASON.SCHEMA);
    assert.ok(contrary.physicalSchema.objects.some((object) =>
      object.type === 'view' && object.name === tableName));
    f.db.exec(`DROP VIEW ${tableName}`);
    replaceOwnerTable(f.db, tableName, image);
    assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
  });

function installedTransactionTrigger(db) {
  const triggers = db.prepare('SELECT name, sql FROM sqlite_schema WHERE type = ? AND tbl_name = ?')
    .all('trigger', SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
  assert.equal(triggers.length, 1, 'actual origin installs the coordinator row owner trigger');
  return triggers[0];
}

function dropTrigger(db, name) {
  db.exec(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
}

test('SQL_TRANSACTIONS origin and schema enforcer must correspond without inspection repair',
  async (t) => {
    await t.test('pre-origin REQUIRED is a legitimate empty original table', (t) => {
      const f = fixture(t, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
      retain(f, [undefined]);
      assert.equal(readTransactionSchemaEnforcement(f.db).state, ENFORCEMENT.REQUIRED);
      expect(f, STATE.ACCEPTED);
      assert.equal(readTransactionSchemaEnforcement(f.db).state, ENFORCEMENT.REQUIRED);
    });
    await t.test('actual applied origin installs ENFORCED state', (t) => {
      const f = fixture(t, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
      retain(f, [origin(f)]);
      assert.equal(readTransactionSchemaEnforcement(f.db).state, ENFORCEMENT.ENFORCED);
      const trigger = installedTransactionTrigger(f.db);
      expect(f, STATE.ACCEPTED);
      assert.deepEqual(installedTransactionTrigger(f.db), trigger);
    });
    await t.test('lost trigger after applied origin is contrary', (t) => {
      const f = fixture(t, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
      retain(f, [origin(f)]);
      const trigger = installedTransactionTrigger(f.db);
      expect(f, STATE.ACCEPTED);
      dropTrigger(f.db, trigger.name);
      assert.equal(readTransactionSchemaEnforcement(f.db).state, ENFORCEMENT.REQUIRED);
      expect(f, STATE.CONTRARY);
    });
    await t.test('changed trigger after applied origin is contrary', (t) => {
      const f = fixture(t, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
      retain(f, [origin(f)]);
      const trigger = installedTransactionTrigger(f.db);
      const changed = trigger.sql.replace('NEW.status = \'ACTIVE\'', 'NEW.status = \'REPLACED\'');
      assert.notEqual(changed, trigger.sql);
      dropTrigger(f.db, trigger.name);
      f.db.exec(changed);
      assert.equal(readTransactionSchemaEnforcement(f.db).state, ENFORCEMENT.INCOMPATIBLE);
      expect(f, STATE.CONTRARY);
    });
    for (const applied of [false, true]) {
      await t.test(`missing required column ${applied ? 'after' : 'before'} origin`, (t) => {
        const f = fixture(t, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS);
        retain(f, [applied ? origin(f) : undefined]);
        if (applied) dropTrigger(f.db, installedTransactionTrigger(f.db).name);
        f.db.exec(`ALTER TABLE ${SYSTEM_TABLE_NAME.SQL_TRANSACTIONS} DROP COLUMN decision_digest`);
        assert.ok(readTransactionSchemaEnforcement(f.db).missingColumns.includes('decision_digest'));
        expect(f, STATE.UNAVAILABLE);
      });
    }
  });

function registrationRecorder(originalTimestamp) {
  const events = [];
  let clockReads = 0;
  const delegates = {
    assertOriginalSeedContinuation: () => events.push(['continuation']),
    getLogger: () => ({debug() {}}),
    getTimeSource: () => ({now: () => {
      clockReads++;
      return DECLARED_AT;
    }}),
    getNodeId: () => NODE_ID,
    getPartitionServices: () => new Map(),
    getServicesCreated: () => 0,
    ...(originalTimestamp === undefined ? {} :
      {getOriginalSeedFoundationTimestamp: originalTimestamp}),
  };
  const phase = new SeedRegistrationPhase({delegates});
  phase.waitForRequiredPartitionLeadership = async () => events.push(['leadership']);
  phase.ensureSystemTableWriter = () => ({enable: () => events.push(['writer'])});
  for (const name of ['registerMessageGroup', 'registerServices', 'registerMetaServiceDefinitions',
    'registerSystemTables', 'updatePartitionSizes', 'seedDynamicConfiguration',
    'persistCurrentEpochIfMissing', 'persistClusterIdIfMissing']) {
    phase[name] = async (...args) => events.push([name, ...args]);
  }
  return {phase, events, clockReads: () => clockReads};
}

test('SeedRegistrationPhase refuses an invalid original timestamp before phase effects', async () => {
  const f = registrationRecorder(() => undefined);
  await assert.rejects(f.phase.phaseRegistration(),
    (error) => error.reason === ORIGINAL_ALLOCATION_REASON.IDENTITY);
  assert.deepEqual(f.events, [['continuation']],
    'no leadership wait, writer activation or registration follows invalid original identity');
  assert.equal(f.clockReads(), 0, 'the clock cannot replace an unavailable original timestamp');
});

test('SeedRegistrationPhase keeps the ordinary delegate clock and exact original timestamp paths',
  async (t) => {
    for (const original of [false, true]) {
      await t.test(original ? 'original timestamp' : 'ordinary hosted clock', async () => {
        const stamp = original ? DECLARED_AT + 1 : DECLARED_AT;
        const f = registrationRecorder(original ? () => stamp : undefined);
        await f.phase.phaseRegistration();
        assert.equal(f.clockReads(), original ? 0 : 1);
        assert.deepEqual(f.events, [['continuation'], ['leadership'], ['writer'],
          ['registerMessageGroup', stamp], ['registerServices', stamp],
          ['registerMetaServiceDefinitions'], ['registerSystemTables', stamp],
          ['updatePartitionSizes'], ['seedDynamicConfiguration'],
          ['persistCurrentEpochIfMissing'], ['persistClusterIdIfMissing']]);
      });
    }
  });

test('unreadable required owners, snapshot coverage and caller transactions stay unavailable',
  async (t) => {
    for (const tableName of [OUTCOMES, GENERATION, '_participant_transactions',
      SYSTEM_TABLE_NAME.MESSAGE_GROUPS]) {
      await t.test(`missing ${tableName}`, (t) => {
        const f = fixture(t);
        retain(f, [origin(f)]);
        f.db.exec(`DROP TABLE ${tableName}`);
        expect(f, STATE.UNAVAILABLE);
      });
    }
    await t.test('snapshot prefix has no invented original provenance', (t) => {
      const f = appliedFoundation(t);
      f.store.putSnapshot(f.member.groupId, {metadata: {index: '2', term: TERM,
        confState: f.confState}});
      expect(f, STATE.UNAVAILABLE, REASON.COVERAGE);
    });
    await t.test('caller owns its open transaction', (t) => {
      const f = fixture(t);
      f.db.transaction(() => {
        const before = f.db.serialize();
        const result = readOriginalSeedRetainedEffects(f);
        assert.equal(result.state, STATE.UNAVAILABLE);
        assert.equal(result.reason, REASON.TRANSACTION);
        assert.equal(f.db.inTransaction, true);
        assert.deepEqual(f.db.serialize(), before);
      })();
    });
    await t.test('invalid native frontier is contrary, not an absent ledger', (t) => {
      const f = fixture(t);
      retain(f, [origin(f)]);
      f.db.exec(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET commit_index = 2`);
      expect(f, STATE.CONTRARY, REASON.NATIVE);
    });
  });

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

// Save the actual owner's bytes/rows, not a fixture copy of its schema.
function tableImage(db, tableName) {
  const schema = db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?')
    .get('table', tableName).sql;
  const indexes = db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND tbl_name = ? ' +
    'AND sql IS NOT NULL').all('index', tableName).map(({sql}) => sql);
  return {schema, indexes,
    rows: db.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).safeIntegers(true).all()};
}

function replaceOwnerTable(db, tableName, image, schema = image.schema) {
  db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
  db.exec(schema);
  for (const index of image.indexes) db.exec(index);
  for (const row of image.rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${quoteIdentifier(tableName)} ` +
      `(${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...Object.values(row));
  }
}

test('each empty internal owner must have its complete schema before absence is accepted',
  async (t) => {
    const partial = [
      [OUTCOMES, 'entry_key TEXT, log_index INTEGER'],
      [PARTICIPANTS, 'transaction_id TEXT, participant_id TEXT, state TEXT'],
      [LEDGER, 'log_index INTEGER, ordinal INTEGER'],
    ];
    for (const [tableName, columns] of partial) {
      await t.test(tableName, (t) => {
        const f = fixture(t);
        retain(f, [origin(f)]);
        if (tableName === LEDGER) ensureCdcObligationLedger(f.db);
        const accepted = expect(f, STATE.ACCEPTED);
        const image = tableImage(f.db, tableName);
        assert.equal(image.rows.length, 0, 'empty-owner case must not rely on decoding a row');
        f.db.exec(`DROP TABLE ${tableName}`);
        f.db.exec(`CREATE TABLE ${tableName} (${columns})`);
        const unavailable = expect(f, STATE.UNAVAILABLE, REASON.OBSERVATION);
        assert.equal(unavailable.cause.code, 'SQLITE_ERROR');
        replaceOwnerTable(f.db, tableName, image);
        assert.deepEqual(expect(f, STATE.ACCEPTED), accepted,
          'restored owner schema is re-observed without a stale unavailable answer');
      });
    }
  });

test('a view at a reserved owner name is contrary rather than absent or usable storage',
  async (t) => {
    for (const tableName of [LEDGER, OUTCOMES, PARTICIPANTS, GENERATION]) {
      await t.test(tableName, (t) => {
        const f = fixture(t);
        retain(f, [origin(f)]);
        const accepted = expect(f, STATE.ACCEPTED);
        assert.deepEqual(accepted.obligations, {exists: false, rows: []});
        const image = tableName === LEDGER ? null : tableImage(f.db, tableName);
        if (image) f.db.exec(`DROP TABLE ${tableName}`);
        f.db.exec(`CREATE VIEW ${tableName} AS SELECT 2 AS log_index, 0 AS ordinal`);
        if (tableName === LEDGER) {
          assert.equal(cdcObligationLedgerExists(f.db), false,
            'the ordinary table-only query cannot certify retained schema absence');
        }
        const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
        assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.SCHEMA_CONTRARY);
        assert.equal(contrary.cause.table, tableName);
        f.db.exec(`DROP VIEW ${tableName}`);
        if (image) replaceOwnerTable(f.db, tableName, image);
        assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
      });
    }
  });

test('internal owner indexes and effect surfaces remain required even without rows', async (t) => {
  for (const [tableName, indexName] of [
    [PARTICIPANTS, '_participant_transactions_state'], [LEDGER, '_cdc_obligations_owed'],
  ]) {
    await t.test(`missing ${indexName}`, (t) => {
      const f = fixture(t);
      retain(f, [origin(f)]);
      if (tableName === LEDGER) ensureCdcObligationLedger(f.db);
      const accepted = expect(f, STATE.ACCEPTED);
      const {sql} = f.db.prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?')
        .get('index', indexName);
      f.db.exec(`DROP INDEX ${indexName}`);
      const unavailable = expect(f, STATE.UNAVAILABLE, REASON.OBSERVATION);
      assert.equal(unavailable.cause.code, RETAINED_STORE_ERROR.SCHEMA_UNAVAILABLE);
      assert.equal(unavailable.cause.table, tableName);
      f.db.exec(sql);
      assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
    });
  }
  for (const tableName of [OUTCOMES, PARTICIPANTS, GENERATION, LEDGER]) {
    await t.test(`unowned trigger on ${tableName}`, (t) => {
      const f = fixture(t);
      retain(f, [origin(f)]);
      if (tableName === LEDGER) ensureCdcObligationLedger(f.db);
      const accepted = expect(f, STATE.ACCEPTED);
      f.db.exec(`CREATE TRIGGER retained_injected_trigger AFTER INSERT ON ${tableName} ` +
        'BEGIN SELECT 1; END');
      const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
      assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.SCHEMA_CONTRARY);
      assert.equal(contrary.cause.table, tableName);
      f.db.exec('DROP TRIGGER retained_injected_trigger');
      assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
    });
  }
  await t.test('generation singleton constraint cannot be widened', (t) => {
    const f = fixture(t);
    retain(f, [origin(f)]);
    const accepted = expect(f, STATE.ACCEPTED);
    const image = tableImage(f.db, GENERATION);
    const changed = image.schema.replace('CHECK (singleton = 1)', 'CHECK (singleton >= 1)');
    assert.notEqual(changed, image.schema, 'constraint mutation engages the real owner DDL');
    replaceOwnerTable(f.db, GENERATION, image, changed);
    const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
    assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.SCHEMA_CONTRARY);
    assert.equal(contrary.cause.table, GENERATION);
    replaceOwnerTable(f.db, GENERATION, image);
    assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
  });
});

test('the generation owner rejects a second persisted singleton under unchanged canonical DDL',
  (t) => {
    const f = fixture(t);
    retain(f, [origin(f)]);
    const accepted = expect(f, STATE.ACCEPTED);
    const validOrigin = readPartitionWriteOriginHistory(f.db, f.member.groupId);
    assert.equal(validOrigin.state, ORIGIN_STATE.APPLIED);
    const schema = tableImage(f.db, GENERATION).schema;
    // Corruption fixture only: restore CHECK enforcement before any observation.
    f.db.pragma('ignore_check_constraints = ON');
    try {
      f.db.prepare(`INSERT INTO ${GENERATION} (singleton, generation) VALUES (?, ?)`)
        .run(2, 0);
    } finally {
      f.db.pragma('ignore_check_constraints = OFF');
    }
    assert.equal(f.db.pragma('ignore_check_constraints', {simple: true}), 0);
    assert.equal(tableImage(f.db, GENERATION).schema, schema);
    assert.equal(f.db.prepare(`SELECT count(*) AS count FROM ${GENERATION}`).get().count, 2);
    const before = f.db.serialize();
    const invalidOrigin = readPartitionWriteOriginHistory(f.db, f.member.groupId);
    assert.equal(invalidOrigin.state, ORIGIN_STATE.CONTRARY);
    assert.equal(invalidOrigin.cause.code, RETAINED_STORE_ERROR.ROW_CONTRARY);
    assert.equal(invalidOrigin.cause.table, GENERATION);
    assert.deepEqual(f.db.serialize(), before);
    const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
    assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.ROW_CONTRARY);
    assert.equal(contrary.cause.table, GENERATION);
    f.db.prepare(`DELETE FROM ${GENERATION} WHERE singleton = ?`).run(2);
    assert.deepEqual(readPartitionWriteOriginHistory(f.db, f.member.groupId), validOrigin);
    assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
  });

test('actual old-owner ALTER upgrades retain schema compatibility for the read-only observer',
  async (t) => {
    const upgrades = [
      [OUTCOMES, /,\s*changes INTEGER,\s*last_insert_rowid INTEGER,\s*owner_result_text TEXT/u,
        createCommittedStatementOutcomeTable, ['changes', 'last_insert_rowid', 'owner_result_text']],
      [GENERATION, /,\s*origin_index INTEGER,\s*origin_term INTEGER/u,
        openParticipantTransactionStore, ['origin_index', 'origin_term']],
    ];
    for (const [tableName, addedColumns, upgrade, columns] of upgrades) {
      await t.test(tableName, (t) => {
        const f = fixture(t);
        retain(f, [undefined]);
        const accepted = expect(f, STATE.ACCEPTED);
        const image = tableImage(f.db, tableName);
        const oldSchema = image.schema.replace(addedColumns, '');
        assert.notEqual(oldSchema, image.schema, 'old owner lacks the actual later-added columns');
        f.db.exec(`DROP TABLE ${tableName}`);
        f.db.exec(oldSchema);
        const oldColumns = f.db.prepare(`PRAGMA table_info(${tableName})`).all();
        assert.ok(columns.every((column) => !oldColumns.some(({name}) => name === column)));
        expect(f, STATE.UNAVAILABLE, REASON.OBSERVATION);
        const executed = [];
        const exec = f.db.exec;
        const trackedExec = t.mock.method(f.db, 'exec', function(sql) {
          executed.push(sql);
          return Reflect.apply(exec, this, [sql]);
        });
        try {
          upgrade(f.db);
        } finally {
          trackedExec.mock.restore();
        }
        for (const column of columns) {
          assert.ok(executed.some((sql) => sql.includes(`ADD COLUMN ${column} `)),
            `actual owner must perform the ${column} ALTER, not fixture schema reconstruction`);
        }
        assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
      });
    }
  });

test('outcome and CDC censuses reject malformed raw SQLite types before coercion', async (t) => {
  const variants = [
    [OUTCOMES, 'log_index', Buffer.from('2')],
    [OUTCOMES, 'term', Buffer.from(TERM)],
    [OUTCOMES, 'changes', Buffer.from('1')],
    [OUTCOMES, 'last_insert_rowid', Buffer.from('1')],
    [OUTCOMES, 'log_index', 2.5],
    [OUTCOMES, 'term', 'not-a-number'],
    [LEDGER, 'log_index', Buffer.from('2')],
    [LEDGER, 'term', Buffer.from(TERM)],
    [LEDGER, 'ordinal', Buffer.from('0')],
    [LEDGER, 'delivered', Buffer.from('0')],
    [LEDGER, 'ordinal', 0.5],
    [LEDGER, 'delivered', 'owed'],
  ];
  for (const [tableName, column, value] of variants) {
    await t.test(`${tableName}.${column}: ${Buffer.isBuffer(value) ? 'BLOB' : typeof value}`,
      (t) => {
        const f = appliedFoundation(t);
        const accepted = expect(f, STATE.ACCEPTED);
        const before = f.db.prepare(`SELECT ${column} AS value FROM ${tableName}`)
          .safeIntegers(true).get().value;
        const update = f.db.prepare(`UPDATE ${tableName} SET ${column} = ?`);
        update.run(value);
        assert.equal(f.db.prepare(`SELECT typeof(${column}) AS type FROM ${tableName}`).get().type,
          Buffer.isBuffer(value) ? 'blob' : typeof value === 'number' ? 'real' : 'text');
        const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
        assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.ROW_CONTRARY);
        assert.equal(contrary.cause.table, tableName);
        update.run(before);
        assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
      });
  }
  await t.test('BLOB JSON cannot masquerade as a TEXT source event', (t) => {
    const f = appliedFoundation(t);
    const accepted = expect(f, STATE.ACCEPTED);
    const [{eventJson}] = accepted.obligations.rows;
    f.db.prepare(`UPDATE ${LEDGER} SET event_json = ?`).run(Buffer.from(eventJson));
    expect(f, STATE.CONTRARY);
    f.db.prepare(`UPDATE ${LEDGER} SET event_json = ?`).run(eventJson);
    assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
  });
  for (const column of ['delivered_index', 'delivered_term']) {
    await t.test(`delivered ACK ${column} rejects BLOB decimal bytes`, (t) => {
      const f = fixture(t);
      const command = sqlCommand(f.member, foundationMutation(f.declaration, f.member.tableName));
      retain(f, [origin(f), command, acknowledgement(f.member, command, 2)]);
      const accepted = expect(f, STATE.ACCEPTED);
      const value = f.db.prepare(`SELECT ${column} AS value FROM ${LEDGER}`)
        .safeIntegers(true).get().value;
      const update = f.db.prepare(`UPDATE ${LEDGER} SET ${column} = ?`);
      update.run(Buffer.from(String(value)));
      expect(f, STATE.CONTRARY);
      update.run(value);
      assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
    });
  }
});

test('owner censuses retain exact large INTEGER positions and results without Number rounding',
  (t) => {
    const f = appliedFoundation(t);
    const accepted = expect(f, STATE.ACCEPTED);
    const outcomes = tableImage(f.db, OUTCOMES);
    const obligations = tableImage(f.db, LEDGER);
    const exact = 9007199254740993n;
    f.db.prepare(`UPDATE ${OUTCOMES} SET log_index = ?, term = ?, changes = ?, ` +
      'last_insert_rowid = ?').run(exact, exact, exact, exact);
    f.db.prepare(`UPDATE ${LEDGER} SET log_index = ?, term = ?, delivered = 1, ` +
      'delivered_index = ?, delivered_term = ?').run(exact, exact, exact + 1n, exact);
    const before = f.db.serialize();
    const [[outcome], {rows: [obligation]}] = f.db.transaction(() =>
      [readCommittedStatementCensusIn(f.db), readCdcObligationCensusIn(f.db)])();
    for (const field of ['logIndex', 'term', 'changes', 'lastInsertRowid']) {
      assert.equal(outcome[field], String(exact));
    }
    assert.equal(obligation.logIndex, String(exact));
    assert.equal(obligation.term, String(exact));
    assert.equal(obligation.deliveredIndex, String(exact + 1n));
    assert.equal(obligation.deliveredTerm, String(exact));
    assert.deepEqual(f.db.serialize(), before, 'exact census is read-only');
    expect(f, STATE.CONTRARY, REASON.OUTCOME);
    replaceOwnerTable(f.db, OUTCOMES, outcomes);
    replaceOwnerTable(f.db, LEDGER, obligations);
    assert.deepEqual(expect(f, STATE.ACCEPTED), accepted);
  });

test('participant census validates raw integer/text fields and re-reads restored valid rows',
  async (t) => {
    const changes = [
      ['transaction_epoch', Buffer.from('1')], ['prepare_index', Buffer.from('2')],
      ['prepare_term', 1.5], ['decision_index', 'invalid-position'],
      ['decision_term', Buffer.from(TERM)], ['operations_text', Buffer.from('[]')],
      ['session_id', Buffer.from('session')],
    ];
    for (const [column, value] of changes) {
      await t.test(column, (t) => {
        const f = fixture(t);
        retain(f, [origin(f)]);
        expect(f, STATE.ACCEPTED);
        insertParticipantTransactionRow(f.db, {transactionId: 'unrelated-transaction',
          participantId: 'unrelated-participant', commitMode: 'durable', transactionEpoch: 1,
          state: PARTICIPANT_STATE.ROLLED_BACK});
        const rows = census(f.db, readParticipantTransactionCensusIn);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].transaction_epoch, 1n, 'valid INTEGER remains exact in owner observation');
        expect(f, STATE.CONTRARY, REASON.PARTICIPANT);
        const update = f.db.prepare(`UPDATE ${PARTICIPANTS} SET ${column} = ?`);
        update.run(value);
        const before = f.db.serialize();
        assert.throws(() => census(f.db, readParticipantTransactionCensusIn), (error) =>
          error.code === RETAINED_STORE_ERROR.ROW_CONTRARY && error.table === PARTICIPANTS);
        assert.deepEqual(f.db.serialize(), before);
        const contrary = expect(f, STATE.CONTRARY, REASON.OWNER_CONTRARY);
        assert.equal(contrary.cause.code, RETAINED_STORE_ERROR.ROW_CONTRARY);
        update.run(rows[0][column]);
        assert.deepEqual(census(f.db, readParticipantTransactionCensusIn), rows);
        expect(f, STATE.CONTRARY, REASON.PARTICIPANT);
        f.db.exec(`DELETE FROM ${PARTICIPANTS}`);
        expect(f, STATE.ACCEPTED);
      });
    }
  });
