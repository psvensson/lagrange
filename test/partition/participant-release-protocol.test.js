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
import {readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-release-facts.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {parseJson, RELEASE_APPLY_RESULT} from
  '../../src/partition/partition-participant-release-command.js';
import {finalizeParticipantRelease, retireParticipantRelease} from
  '../../src/partition/partition-participant-release-request.js';
import {readParticipantReleaseState, readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
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
const CONTROL_NODE = 'control-node';
const REPLICA = 'release-r1';
const PARTITION = 'release-partition';
const TABLE = 'release_table';
const CONTROL_PARTITION = 'sql_transactions-p1';
const CONTROL_REPLICA = 'release-sql-transactions-r1';
const SQL = `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`;
const cache = {getAll: () => [], get: () => null, filter: () => []};

async function currentRelease(handler, service) {
  const facts = await readParticipantReleaseFacts(handler, service);
  return {facts, release: releaseIdentityOf({partitionId: service.partitionId,
    targetBuildDigest: facts.buildDigest,
    configurationKey: facts.membership.configurationKey,
    membershipGenerationIndex: facts.membership.membershipGenerationIndex})};
}

async function fixture(measure, table = {tableId: TABLE, tableName: TABLE,
  schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'TEXT'}]}}, fixtureOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-protocol-'));
  const transport = createInProcessMockTransport();
  const options = {nodeId: NODE, partitionId: PARTITION, replicaId: REPLICA,
    replicaIds: [REPLICA], ...table, dbPath: path.join(directory, 'partition.db'),
    systemTableCache: cache, deferElection: true};
  const create = (overrides) => new PartitionService(withFoundingStamp({...options, ...overrides}));
  const topologyOwner = fixtureOptions.remoteControl === true ? {
    resolveCanonicalPartitionLeaderNodeId(partitionId) {
      return partitionId === CONTROL_PARTITION ? CONTROL_NODE : null;
    },
  } : null;
  const cdcIntegrationService = topologyOwner === null ? {} :
    {sqlQueryEngine: {queryExecutor: {bootstrapTopologySnapshotOwner: topologyOwner}}};
  const handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
    systemTableCache: cache, cdcIntegrationService, createPartitionService: create,
    messageRouter: transport, dataDir: directory});
  handler.registerWithRouter(transport);
  let service = create();
  let controlService = null;
  let controlHandler = null;
  try {
    if (table.tableName !== SQL_TRANSACTIONS_SCHEMA.tableName &&
        fixtureOptions.includeControl !== false) {
      const controlNodeId = fixtureOptions.remoteControl === true ?
        CONTROL_NODE : NODE;
      controlService = new PartitionService(withFoundingStamp({
        nodeId: controlNodeId, partitionId: CONTROL_PARTITION,
        replicaId: CONTROL_REPLICA,
        replicaIds: [CONTROL_REPLICA], tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
        tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA,
        dbPath: path.join(directory, 'sql-transactions.db'), systemTableCache: cache,
        deferElection: true,
      }));
      await controlService.initialize();
      if (fixtureOptions.remoteControl === true) {
        controlHandler = new ReplicaHandler({nodeId: CONTROL_NODE,
          ownerIncarnation: 2, systemTableCache: cache,
          cdcIntegrationService: {}, createPartitionService: create,
          messageRouter: transport, dataDir: directory});
        controlHandler.registerWithRouter(transport);
        controlHandler.localServices.set(CONTROL_REPLICA, controlService);
      } else {
        handler.localServices.set(CONTROL_REPLICA, controlService);
      }
      await controlService.raft.campaign();
      assert.equal(controlService.raft.readStatus().role, 'leader');
    }
    await service.initialize();
    handler.localServices.set(REPLICA, service);
    await service.raft.campaign();
    assert.equal(service.raft.readStatus().role, 'leader');
    const build = await runtimeBuildProvenance();
    assert.equal(build.state, 'measured', build.reason);
    if (controlHandler !== null) {
      const controlRelease = await controlHandler.participantReleaseRecovery
        .releaseOperator({partitionId: CONTROL_PARTITION,
          targetBuildDigest: build.digest,
          deadlineAtMs: controlHandler.timeSource.now() + 30000});
      assert.equal(controlRelease.outcome, OUTCOME.CUT_OVER,
        JSON.stringify(controlRelease));
    }
    const release = (targetBuildDigest = build.digest) =>
      handler.participantReleaseRecovery.releaseOperator({
        partitionId: PARTITION, targetBuildDigest,
        deadlineAtMs: handler.timeSource.now() + 30000,
      });
    await measure({handler, service, controlService, release, create, replace: (next) => {
      service = next;
      handler.replaceLocalReplicaService(REPLICA, next);
    }});
  } finally {
    await handler.participantReleaseRecovery.shutdown();
    await controlHandler?.participantReleaseRecovery.shutdown();
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

test('no-origin release without fresh storage or operator authority stays closed', () =>
  fixture(async ({handler, service}) => {
    const build = await runtimeBuildProvenance();
    const answer = await requestParticipantRelease(handler,
      {partitionId: PARTITION, targetBuildDigest: build.digest,
        deadlineAtMs: handler.timeSource.now() + 30000});
    assert.equal(answer.outcome, OUTCOME.OPERATOR_REQUIRED);
    assert.equal(answer.missingFact, 'fresh_storage_or_operator_authority');
    assert.equal(readPartitionWriteOrigin(service.db), null);
    assert.notEqual(participantCutoverPauseOf(service), null);
  }));

test('dependent release stays closed without a reconstructed current control owner fact', () =>
  fixture(async ({service, release}) => {
    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
    assert.equal(answer.missingFact, 'current_control_owner_fact');
    assert.notEqual(participantCutoverPauseOf(service), null);
    assert.equal(readPartitionWriteOrigin(service.db), null);
  }, undefined, {includeControl: false}));

test('dependent release consumes an exact remotely routed current control owner fact', () =>
  fixture(async ({service, controlService, release}) => {
    assert.notEqual(readPartitionWriteOrigin(controlService.db), null);
    const answer = await release();
    assert.equal(answer.outcome, OUTCOME.CUT_OVER, JSON.stringify(answer));
    assert.equal(answer.release.partitionId, PARTITION);
    assert.notEqual(readPartitionWriteOrigin(service.db), null);
  }, undefined, {remoteControl: true}));

test('mixed target build is refused and cannot lower admission', () =>
  fixture(async ({service, release}) => {
    const refused = await release('0'.repeat(64));
    assert.equal(refused.outcome, OUTCOME.BUILD_MISMATCH, JSON.stringify(refused));
    assert.notEqual(participantCutoverPauseOf(service), null);
    assert.equal(readPartitionWriteOrigin(service.db), null);
  }));

test('committed finalization before retirement remains historical and retirement fences ' +
  'future consumption', () => fixture(async ({handler, service, controlService, release}) => {
  assert.equal((await release()).outcome, OUTCOME.CUT_OVER);
  const control = await currentRelease(handler, controlService);
  const dependent = await currentRelease(handler, service);
  const authorizationId = 'finalize-before-retire';
  const finalized = await finalizeParticipantRelease(controlService, {
    controlRelease: control.release, dependentRelease: dependent.release,
    controlCensus: [control.facts], dependentCensus: [dependent.facts],
    authorizationId, deadlineAtMs: handler.timeSource.now() + 30000});
  assert.equal(finalized.outcome, RELEASE_APPLY_RESULT.AUTHORIZED);
  const retired = await retireParticipantRelease(controlService, {
    authorizationId, retiredReplicaIdentity: controlService.replicaId,
    retirementId: 'retirement-after-finalization'});
  assert.equal(retired.outcome, RELEASE_APPLY_RESULT.RETIRED);
  const durable = parseJson(readParticipantReleaseState(controlService.db).controlText);
  assert.equal(durable.state, 'RETIRED');
  assert.equal(durable.finalizationEntryId.startsWith(
    'finalize_participant_release:'), true);
  assert.equal(durable.retirementId, 'retirement-after-finalization');
}));

test('committed retirement before finalization makes the exact authorization stale', () =>
  fixture(async ({handler, service, controlService, release}) => {
    assert.equal((await release()).outcome, OUTCOME.CUT_OVER);
    const control = await currentRelease(handler, controlService);
    const dependent = await currentRelease(handler, service);
    const authorizationId = 'retire-before-finalize';
    const retired = await retireParticipantRelease(controlService, {
      authorizationId, retiredReplicaIdentity: controlService.replicaId,
      retirementId: 'retirement-before-finalization'});
    assert.equal(retired.outcome, RELEASE_APPLY_RESULT.RETIRED);
    const finalized = await finalizeParticipantRelease(controlService, {
      controlRelease: control.release, dependentRelease: dependent.release,
      controlCensus: [control.facts], dependentCensus: [dependent.facts],
      authorizationId, deadlineAtMs: handler.timeSource.now() + 30000});
    assert.equal(finalized.outcome, RELEASE_APPLY_RESULT.STALE);
    const durable = parseJson(readParticipantReleaseState(controlService.db).controlText);
    assert.equal(durable.state, 'RETIRED');
    assert.equal(durable.finalizationEntryId, null);
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
