// The real PartitionService/Raft application and lifecycle recipient, with
// only the transport hop in process. No injected eligibility booleans.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {requestParticipantRelease} from '../../src/node/participant-release-client.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {readTransactionSchemaEnforcement} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {participantCutoverPauseOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {createInProcessMockTransport} from '../test-helpers/replica-handler-identity-fixture.js';
import {resetFixtureSingletons, clearFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {waitForCondition} from './partition-service-test-support.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const NODE = 'test-node';
const REPLICA = 'release-r1';
const PARTITION = 'release-partition';
const TABLE = 'release_table';
const CONTROL_PARTITION = 'release-sql-transactions';
const CONTROL_REPLICA = 'release-sql-transactions-r1';
const SQL = `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`;
const cache = {getAll: () => [], get: () => null, filter: () => []};

async function fixture(measure, table = {tableId: TABLE, tableName: TABLE,
  schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'TEXT'}]}}, fixtureOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-protocol-'));
  const transport = createInProcessMockTransport();
  const options = {nodeId: NODE, partitionId: PARTITION, replicaId: REPLICA,
    replicaIds: [REPLICA], ...table, dbPath: path.join(directory, 'partition.db'),
    systemTableCache: cache, deferElection: true};
  const create = (overrides) => new PartitionService(withFoundingStamp({...options, ...overrides}));
  const handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
    systemTableCache: cache, cdcIntegrationService: {}, createPartitionService: create,
    messageRouter: transport, dataDir: directory});
  handler.registerWithRouter(transport);
  let service = create();
  let controlService = null;
  try {
    if (table.tableName !== SQL_TRANSACTIONS_SCHEMA.tableName &&
        fixtureOptions.includeControl !== false) {
      controlService = new PartitionService(withFoundingStamp({
        nodeId: NODE, partitionId: CONTROL_PARTITION, replicaId: CONTROL_REPLICA,
        replicaIds: [CONTROL_REPLICA], tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
        tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA,
        dbPath: path.join(directory, 'sql-transactions.db'), systemTableCache: cache,
        deferElection: true,
      }));
      await controlService.initialize();
      handler.localServices.set(CONTROL_REPLICA, controlService);
      await controlService.raft.campaign();
      assert.equal(controlService.raft.readStatus().role, 'leader');
    }
    await service.initialize();
    handler.localServices.set(REPLICA, service);
    await service.raft.campaign();
    assert.equal(service.raft.readStatus().role, 'leader');
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    const release = () => requestParticipantRelease(handler,
      {partitionId: PARTITION, targetBuildDigest: build.digest});
    await measure({handler, service, controlService, release, create, replace: (next) => {
      service = next;
      handler.replaceLocalReplicaService(REPLICA, next);
    }});
  } finally {
    await handler.participantReleaseRecovery.shutdown();
    await service.shutdown();
    await controlService?.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('real release route pauses initial writes, applies origin, censuses and resumes; ' +
  'registry and consensus triggers recover a recreated service from the same durable origin', () =>
  fixture(async ({service, controlService, release, create, replace}) => {
    const paused = await service.executeQuery(SQL, ['before', 'must not write']);
    assert.equal(paused.success, false);
    assert.equal(readPartitionWriteOrigin(service.db), null);
    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
    assert.notEqual(readPartitionWriteOrigin(controlService.db), null,
      'the durable coordinator group must release before its dependent');
    assert.equal(participantCutoverPauseOf(service), null);
    const origin = readPartitionWriteOrigin(service.db);
    assert.equal((await service.executeQuery(SQL, ['after', 'written'])).success, true);
    await service.shutdown();
    const replacement = create({bootstrapMembership: durableRecordBootstrap()});
    replace(replacement);
    await replacement.initialize();
    await replacement.raft.campaign();
    assert.notEqual(participantCutoverPauseOf(replacement), null);
    assert.equal((await replacement.executeQuery(SQL, ['restarted', 'not yet'])).success, false);
    assert.equal(await waitForCondition(() => participantCutoverPauseOf(replacement) === null,
      5000, 20), true, 'production lifecycle trigger must re-census without explicit release');
    assert.deepEqual(readPartitionWriteOrigin(replacement.db), origin);
    assert.equal((await replacement.executeQuery(SQL, ['restarted', 'written'])).success, true);
  }));

test('dependent release stays closed without a reconstructed current control owner fact', () =>
  fixture(async ({service, release}) => {
    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
    assert.equal(answer.missingFact, 'current_control_owner_fact');
    assert.notEqual(participantCutoverPauseOf(service), null);
    assert.equal(readPartitionWriteOrigin(service.db), null);
  }, undefined, {includeControl: false}));

test('mixed target build is refused and cannot lower admission', () =>
  fixture(async ({handler, service}) => {
    const refused = await requestParticipantRelease(handler,
      {partitionId: PARTITION, targetBuildDigest: '0'.repeat(64)});
    assert.equal(refused.outcome, OUTCOME.BUILD_MISMATCH, JSON.stringify(refused));
    assert.notEqual(participantCutoverPauseOf(service), null);
    assert.equal(readPartitionWriteOrigin(service.db), null);
  }));

test('control cohort origin installs the fixed coordinator schema atomically and its replay ' +
  'repairs a missing enforcer without changing the durable origin', () => fixture(
  async ({service, release}) => {
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'install_required');
    const first = await release();
    assert.equal(first.outcome, OUTCOME.CUT_OVER, JSON.stringify(first));
    const origin = readPartitionWriteOrigin(service.db);
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'enforced');
    service.db.exec('DROP TRIGGER sql_transactions_initial_lineage_v1');
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'install_required');
    const refused = await service.executeQuery(
      'INSERT INTO sql_transactions (transaction_id,session_id,status,transaction_epoch,' +
      'timeout_deadline,transaction_mode,participant_set_state,participant_set_text,' +
      'commit_mode,frozen_participant_count,created_at,updated_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ['a'.repeat(32), 's', 'ACTIVE', 1, 2, 'EXPLICIT', 'OPEN', '[]',
        'NOT_SELECTED', 0, 1, 1]);
    assert.equal(refused.failureCode, 'transaction_schema_enforcement_unavailable');
    const repaired = await release();
    assert.equal(repaired.outcome, OUTCOME.CUT_OVER, JSON.stringify(repaired));
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'enforced');
    assert.deepEqual(readPartitionWriteOrigin(service.db), origin);
  }, {tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA}));

test('control cohort preserves unreconstructible legacy rows and reports exact activation debt',
  () => fixture(async ({service, release}) => {
    const transactionId = 'b'.repeat(32);
    service.db.prepare(
      'INSERT INTO sql_transactions (transaction_id,session_id,status,transaction_epoch,' +
      'timeout_deadline,transaction_mode,participant_set_state,participant_set_text,' +
      'commit_mode,frozen_participant_count,created_at,updated_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(transactionId, 'legacy-session', 'COMMITTED', 1, 2, 'EXPLICIT', 'OPEN', null,
        'NOT_SELECTED', 0, 1, 1);

    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.QUERY_DRAIN_PENDING, JSON.stringify(answer));
    assert.deepEqual(answer.legacyTransactionIds, [transactionId]);
    assert.match(answer.querySchemaDigest, /^[a-f0-9]{64}$/u);
    assert.equal(answer.queryEnforcerDigest, null,
      'a pre-origin refusal must not claim the enforcer is installed');
    assert.match(answer.queryRowGenerationDigest, /^[a-f0-9]{64}$/u);
    assert.equal(answer.querySchemaVersion, 2);
    assert.equal(service.db.prepare(
      'SELECT participant_set_text FROM sql_transactions WHERE transaction_id = ?')
      .get(transactionId).participant_set_text, null);
    assert.equal(readPartitionWriteOrigin(service.db), null);
    assert.notEqual(participantCutoverPauseOf(service), null);
  }, {tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA}));
