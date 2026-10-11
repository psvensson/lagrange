// The real PartitionService/Raft application and lifecycle recipient, with
// only the transport hop in process. No injected eligibility booleans.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {retireParticipantReleaseBeforeReplacement} from
  '../../src/node/participant-release-lifecycle-retirement.js';
import {requestParticipantRelease} from '../../src/node/participant-release-client.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {readTransactionSchemaEnforcement} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {readTransactionReleaseCensus} from
  '../../src/query/distributed/distributed-transaction-release-census.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {participantCutoverPauseOf} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-release-facts.js';
import {releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {parseJson, RELEASE_APPLY_RESULT, targetEntryOf} from
  '../../src/partition/partition-participant-release-command.js';
import {confirmParticipantRelease, dispatchParticipantRelease,
  finalizeReservedParticipantRelease, publishParticipantReleaseClaim,
  observeParticipantAdmissionPause, pauseParticipantAdmission,
  recordParticipantReleaseReceipt, recordParticipantReleaseShare,
  reserveParticipantRelease,
  retireParticipantRelease} from
  '../../src/partition/partition-participant-release-request.js';
import {invalidateParticipantReleaseLocalCurrent,
  publishParticipantReleaseLocalCurrent, readParticipantReleaseLocalCurrent} from
  '../../src/partition/partition-participant-release-local-current.js';
import {readParticipantReleaseState, readPartitionWriteOrigin} from
  '../../src/partition/partition-participant-transaction-store.js';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME,
  PARTICIPANT_RELEASE_ACTION as ACTION, PARTICIPANT_RELEASE_RESULT_FIELD} from
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

async function authorizeCurrentSingle(service, options, target) {
  const reserved = await reserveParticipantRelease(service, options);
  assert.equal(reserved.outcome, RELEASE_APPLY_RESULT.RESERVED);
  const claimed = await publishParticipantReleaseClaim(service, {
    authorizationId: options.authorizationId, target});
  assert.equal(claimed.outcome, RELEASE_APPLY_RESULT.RESERVED);
  const shared = await recordParticipantReleaseShare(service, {
    authorizationId: options.authorizationId, target,
    claimRevision: claimed.claimRevision});
  assert.equal(shared.outcome, RELEASE_APPLY_RESULT.RESERVED);
  return finalizeReservedParticipantRelease(service, options);
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

test('one release attempt appends one exact durable PAUSE and retries only observe it', () =>
  fixture(async ({service}) => {
    const status = service.raft.readStatus();
    const attempt = Object.freeze({
      leaderReplicaId: service.replicaId,
      term: status.term,
      pauseInvocationId: 'one-exact-pause-attempt',
    });
    const before = service.db.prepare(
      'SELECT COUNT(*) AS count FROM _raft_rs_log').get().count;
    const first = await pauseParticipantAdmission(service, attempt);
    assert.equal(first.outcome, RELEASE_APPLY_RESULT.PAUSED);
    const applied = readParticipantReleaseState(service.db);
    assert.equal(applied.pauseEntryId, first.pauseEntryId);
    assert.equal(service.db.prepare(
      'SELECT COUNT(*) AS count FROM _raft_rs_log').get().count, before + 1);

    const observed = observeParticipantAdmissionPause(service, attempt);
    assert.equal(observed.outcome, RELEASE_APPLY_RESULT.PAUSED);
    assert.equal(observed.replayed, true);
    assert.equal(observed.pauseEntryId, first.pauseEntryId);
    const replay = await pauseParticipantAdmission(service, attempt);
    assert.deepEqual(replay, observed);
    assert.equal(service.db.prepare(
      'SELECT COUNT(*) AS count FROM _raft_rs_log').get().count, before + 1,
    'a retry after a lost answer must not append another PAUSE');

    const row = service.db.prepare(
      'SELECT data FROM _raft_rs_log ORDER BY log_index DESC LIMIT 1').get();
    const command = JSON.parse(Buffer.from(row.data, 'base64').toString('utf8'));
    assert.deepEqual(command, {
      type: 'PAUSE_PARTICIPANT_ADMISSION',
      entryId: first.pauseEntryId,
      partitionId: service.partitionId,
      pauseInvocationId: attempt.pauseInvocationId,
      leaderReplicaId: attempt.leaderReplicaId,
      leaderTerm: attempt.term,
    }, 'the retained command has no retry clock or proposer-dependent bytes');
  }));

test('real release route pauses initial writes, applies origin, orders retirement before a ' +
  'controlled successor, and recovers that successor from the same durable origin', () =>
  fixture(async ({handler, service, controlService, release, create, replace}) => {
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
    const current = readParticipantReleaseLocalCurrent(service);
    const liveControl = await readParticipantReleaseFacts(handler, controlService);
    assert.deepEqual(current.controlOwner.target, targetEntryOf(liveControl),
      'the retirement route still names the exact current control lifetime');
    assert.equal(current.controlOwner.attempt.term, liveControl.membership.term);
    assert.equal(current.controlOwner.attempt.leaderReplicaId,
      liveControl.leaderReplicaId);
    assert.equal(current.controlOwner.release.configurationKey,
      liveControl.membership.configurationKey);
    assert.equal(current.controlOwner.release.membershipGenerationIndex,
      liveControl.membership.membershipGenerationIndex);
    invalidateParticipantReleaseLocalCurrent(service);
    assert.equal(readParticipantReleaseLocalCurrent(service), null,
      'disconnect closes local applicability before replacement starts');
    const replacementDeadlineAtMs = handler.timeSource.now() + 30000;
    const handleMessage = handler.handleMessage.bind(handler);
    let loseRetirementAnswer = true;
    handler.handleMessage = async (envelope) => {
      const answer = await handleMessage(envelope);
      if (loseRetirementAnswer && envelope.payload?.action === ACTION.RETIRE) {
        loseRetirementAnswer = false;
        return {acknowledged: true, correlationId: envelope.correlationId};
      }
      return answer;
    };
    await assert.rejects(retireParticipantReleaseBeforeReplacement(
      handler, service, {deadlineAtMs: replacementDeadlineAtMs}),
    /retirement held replacement/u);
    const afterLostAnswer = readParticipantReleaseState(controlService.db);
    const appliedRetirement = parseJson(afterLostAnswer.controlText);
    assert.equal(appliedRetirement.state, 'RETIRED',
      'the lost reply cannot erase the committed retirement');
    assert.equal(typeof appliedRetirement.confirmationEntryId, 'string',
      'historical confirmation remains in the retired record');
    const retired = await retireParticipantReleaseBeforeReplacement(
      handler, service, {deadlineAtMs: replacementDeadlineAtMs});
    assert.equal(retired.retired, true);
    assert.deepEqual(readParticipantReleaseState(controlService.db), afterLostAnswer,
      'retry reads the exact committed retirement without a second transition');
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
  publishParticipantReleaseLocalCurrent(controlService, authorizationId,
    targetEntryOf(control.facts));
  const options = {
    controlRelease: control.release, dependentRelease: dependent.release,
    controlCensus: [control.facts], dependentCensus: [dependent.facts],
    authorizationId, deadlineAtMs: handler.timeSource.now() + 30000};
  const finalized = await authorizeCurrentSingle(controlService, options,
    targetEntryOf(control.facts));
  assert.equal(finalized.outcome, RELEASE_APPLY_RESULT.AUTHORIZED);
  const retired = await retireParticipantRelease(controlService, {
    authorizationId, retiredTarget: targetEntryOf(control.facts),
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
    const options = {
      controlRelease: control.release, dependentRelease: dependent.release,
      controlCensus: [control.facts], dependentCensus: [dependent.facts],
      authorizationId, deadlineAtMs: handler.timeSource.now() + 30000};
    const reserved = await reserveParticipantRelease(controlService, options);
    assert.equal(reserved.outcome, RELEASE_APPLY_RESULT.RESERVED);
    const retired = await retireParticipantRelease(controlService, {
      authorizationId, retiredTarget: targetEntryOf(control.facts),
      retirementId: 'retirement-before-finalization'});
    assert.equal(retired.outcome, RELEASE_APPLY_RESULT.RETIRED);
    const finalized = await finalizeReservedParticipantRelease(controlService,
      options);
    assert.equal(finalized.outcome, RELEASE_APPLY_RESULT.STALE);
    const durable = parseJson(readParticipantReleaseState(controlService.db).controlText);
    assert.equal(durable.state, 'RETIRED');
    assert.equal(durable.finalizationEntryId, null);
  }));

test('committed target retirement after RESUME and before confirmation keeps the exact ' +
  'receipt retired and refuses confirmation', () => fixture(
  async ({handler, service, controlService, release}) => {
    assert.equal((await release()).outcome, OUTCOME.CUT_OVER);
    const control = await currentRelease(handler, controlService);
    const dependent = await currentRelease(handler, service);
    const authorizationId = 'retire-current-receipt-before-confirm';
    const controlTarget = targetEntryOf(control.facts);
    const dependentTarget = targetEntryOf(dependent.facts);
    publishParticipantReleaseLocalCurrent(controlService, authorizationId,
      controlTarget);
    const options = {controlRelease: control.release,
      dependentRelease: dependent.release, controlCensus: [control.facts],
      dependentCensus: [dependent.facts], authorizationId,
      deadlineAtMs: handler.timeSource.now() + 30000};
    assert.equal((await authorizeCurrentSingle(controlService, options,
      controlTarget)).outcome, RELEASE_APPLY_RESULT.AUTHORIZED);
    assert.equal((await dispatchParticipantRelease(controlService,
      {authorizationId})).outcome, RELEASE_APPLY_RESULT.DISPATCHED);
    const receipt = {...dependentTarget,
      resumeEntryId: 'resume-before-retirement', authorizationIndex: 11,
      authorizationTerm: 3, pauseGeneration: 1};
    assert.equal((await recordParticipantReleaseReceipt(controlService,
      {authorizationId, receipt})).outcome, RELEASE_APPLY_RESULT.DISPATCHED);
    assert.equal((await retireParticipantRelease(controlService,
      {authorizationId, retiredTarget: dependentTarget,
        retirementId: 'retire-current-receipt'})).outcome,
    RELEASE_APPLY_RESULT.RETIRED);
    assert.equal((await confirmParticipantRelease(controlService,
      {authorizationId, receipts: [receipt]})).outcome,
    RELEASE_APPLY_RESULT.STALE);
    const durable = parseJson(
      readParticipantReleaseState(controlService.db).controlText);
    assert.equal(durable.state, 'RESUME_DISPATCHED');
    assert.equal(durable.targetReceipts[0].receiptState, 'RETIRED');
    assert.equal(durable.confirmationEntryId, undefined);
  }));

test('a retired current claim cannot finalize or be reinstated by reconnecting the same ' +
  'incarnation', () => fixture(async ({handler, service, controlService, release}) => {
  assert.equal((await release()).outcome, OUTCOME.CUT_OVER);
  const control = await currentRelease(handler, controlService);
  const dependent = await currentRelease(handler, service);
  const authorizationId = 'retire-current-claim-before-finalize';
  const target = targetEntryOf(control.facts);
  const options = {controlRelease: control.release,
    dependentRelease: dependent.release, controlCensus: [control.facts],
    dependentCensus: [dependent.facts], authorizationId,
    deadlineAtMs: handler.timeSource.now() + 30000};
  assert.equal((await reserveParticipantRelease(controlService, options)).outcome,
    RELEASE_APPLY_RESULT.RESERVED);
  const claimed = await publishParticipantReleaseClaim(controlService,
    {authorizationId, target});
  assert.equal(claimed.outcome, RELEASE_APPLY_RESULT.RESERVED);
  assert.equal((await recordParticipantReleaseShare(controlService,
    {authorizationId, target, claimRevision: claimed.claimRevision})).outcome,
  RELEASE_APPLY_RESULT.RESERVED);
  publishParticipantReleaseLocalCurrent(controlService, authorizationId, target);
  assert.equal((await retireParticipantRelease(controlService, {authorizationId,
    retiredTarget: target,
    retirementId: 'retire-current-claim'})).outcome,
  RELEASE_APPLY_RESULT.RETIRED);
  assert.equal((await finalizeReservedParticipantRelease(controlService, options)).outcome,
    RELEASE_APPLY_RESULT.STALE);
  assert.equal((await publishParticipantReleaseClaim(controlService,
    {authorizationId, target})).outcome, RELEASE_APPLY_RESULT.STALE,
  'reconnect with the same retired incarnation cannot publish CURRENT again');
  const durable = parseJson(readParticipantReleaseState(controlService.db).controlText);
  assert.equal(durable.state, 'RESERVED');
  assert.equal(durable.memberClaims[0].claimState, 'RETIRED');
}));

test('known local invalidation at the native dispatch boundary holds the exact ' +
  'finalization without applying it', () => fixture(
  async ({handler, service, controlService, release}) => {
    assert.equal((await release()).outcome, OUTCOME.CUT_OVER);
    const control = await currentRelease(handler, controlService);
    const dependent = await currentRelease(handler, service);
    const authorizationId = 'local-hold-before-native-finalize';
    const target = targetEntryOf(control.facts);
    const options = {controlRelease: control.release,
      dependentRelease: dependent.release, controlCensus: [control.facts],
      dependentCensus: [dependent.facts], authorizationId,
      deadlineAtMs: handler.timeSource.now() + 30000};
    assert.equal((await reserveParticipantRelease(controlService, options)).outcome,
      RELEASE_APPLY_RESULT.RESERVED);
    const claimed = await publishParticipantReleaseClaim(controlService,
      {authorizationId, target});
    assert.equal((await recordParticipantReleaseShare(controlService,
      {authorizationId, target, claimRevision: claimed.claimRevision})).outcome,
    RELEASE_APPLY_RESULT.RESERVED);
    publishParticipantReleaseLocalCurrent(controlService, authorizationId, target);
    const before = readParticipantReleaseState(controlService.db);
    invalidateParticipantReleaseLocalCurrent(controlService);
    const refused = await finalizeReservedParticipantRelease(controlService, options);
    assert.equal(refused.failureCode, 'partition_write_consensus_refused');
    assert.equal(refused.consensus.reason, 'participant_release_local_hold');
    assert.deepEqual(readParticipantReleaseState(controlService.db), before,
      'a local HOLD is decided before native proposal and commits no authorization');
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

test('interrupted retained control authorization settles a newly visible COMMIT under the same ' +
  'identity and deadline', () => fixture(async ({handler, service}) => {
  const build = await runtimeBuildProvenance();
  const deadlineAtMs = handler.timeSource.now() + 30000;
  const authorization = handler.participantReleaseAuthorizationOwner.authorizeOperator({
    partitionId: PARTITION, targetBuildDigest: build.digest});
  const request = {partitionId: PARTITION, targetBuildDigest: build.digest,
    deadlineAtMs, authorization};
  assert.equal(readTransactionReleaseCensus(service.db).state, 'clear');
  const handleMessage = handler.handleMessage.bind(handler);
  let refuseFirstResume = true;
  handler.handleMessage = async (envelope) => {
    if (refuseFirstResume && envelope.payload?.action === ACTION.RESUME) {
      refuseFirstResume = false;
      return {acknowledged: true, correlationId: envelope.correlationId,
        [PARTICIPANT_RELEASE_RESULT_FIELD]: {
          outcome: OUTCOME.STALE,
          partitionId: envelope.payload.partitionId,
          phase: ACTION.RESUME,
        }};
    }
    return handleMessage(envelope);
  };
  const first = await requestParticipantRelease(handler, request);
  assert.equal(first.outcome, OUTCOME.STALE, JSON.stringify(first));
  assert.notEqual(participantCutoverPauseOf(service), null,
    'an interrupted RESUME cannot open local mutation admission');
  const retained = readParticipantReleaseState(service.db);
  const retainedControl = parseJson(retained.controlText);
  assert.equal(retainedControl.state, 'RESUME_DISPATCHED');
  assert.equal(retained.confirmationEntryId ?? null, null);

  const transactionId = '9'.repeat(32);
  const partitionId = 'application-p1';
  const participantId = `${transactionId}:${partitionId}`;
  const participantSetText = participantSetTextOf(transactionId, [partitionId]);
  const decision = buildDecisionRecord(transactionId, 'COMMIT',
    [[participantId, 'retained-prepared-digest']]);
  service.db.prepare(
    'INSERT INTO sql_transactions (transaction_id,session_id,status,transaction_epoch,' +
    'timeout_deadline,transaction_mode,participant_set_state,participant_set_text,' +
    'commit_mode,frozen_participant_count,created_at,updated_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(transactionId, 'retained-release-session', 'ACTIVE', 1,
      deadlineAtMs - 1, 'EXPLICIT', 'OPEN', '[]', 'NOT_SELECTED', 0, 1, 1);
  // The race setup represents the normal coordinator reaching its durable
  // COMMIT after the release census that produced the retained authorization.
  // The assertion below measures only whether release re-enters its ordered
  // settlement owner for that newly visible durable row.
  service.db.prepare('UPDATE sql_transactions SET status=?,participant_set_state=?,' +
    'participant_set_text=?,commit_mode=?,frozen_participant_count=?,decision=?,' +
    'decision_text=?,decision_digest=? WHERE transaction_id=?')
    .run('COMMITTED', 'FROZEN', participantSetText, 'TWO_PHASE_COMMIT', 1,
      decision.decision, decision.decisionText, decision.decisionDigest, transactionId);
  const deliveries = [];
  service.setSqlQueryEngine({
    async readDistributedTransactionRecoveryState(id) {
      return {state: 'available', transaction: service.db.prepare(
        'SELECT * FROM sql_transactions WHERE transaction_id = ?').get(id),
      participants: [{transaction_id: id, participant_id: participantId,
        partition_id: partitionId}]};
    },
    async deliverTransactionOperation(sessionId, targetPartitionId, operation, options) {
      deliveries.push({sessionId, targetPartitionId, operation, options});
      return {acknowledged: true, success: true, durable: true,
        state: 'COMMITTED', outcome: 'COMMITTED', operation,
        partitionId: targetPartitionId, transactionId: options.transactionId,
        participantId: options.participantId};
    },
  });
  const newlyVisible = readTransactionReleaseCensus(service.db);
  assert.equal(newlyVisible.state, 'held');
  assert.deepEqual(newlyVisible.recoverableTransactionIds, [transactionId]);

  const second = await requestParticipantRelease(handler, request);
  assert.equal(second.outcome, OUTCOME.CUT_OVER, JSON.stringify(second));
  assert.equal(second.attempt.deadlineAtMs, deadlineAtMs,
    'retained settlement consumes the original invocation deadline');
  assert.equal(second.release.releaseId,
    parseJson(retainedControl.controlReleaseText).releaseId);
  const completed = readParticipantReleaseState(service.db);
  assert.equal(completed.authorizationText, retained.authorizationText,
    'settlement does not mint or replace the retained release authorization');
  assert.equal(completed.pauseEntryId, retained.pauseEntryId);
  assert.equal(completed.pauseGeneration, retained.pauseGeneration);
  assert.equal(parseJson(completed.controlText).authorizationId,
    retainedControl.authorizationId);
  const row = service.db.prepare(
    'SELECT status,decision,decision_text,decision_digest FROM sql_transactions ' +
    'WHERE transaction_id = ?').get(transactionId);
  assert.deepEqual(row, {status: 'COMMITTED', decision: decision.decision,
    decision_text: decision.decisionText, decision_digest: decision.decisionDigest});
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].operation, 'COMMIT');
  assert.equal(deliveries.some(({operation}) => operation === 'ROLLBACK'), false);
  const commands = service.db.prepare(
    'SELECT data FROM _raft_rs_log WHERE data IS NOT NULL ORDER BY log_index').all()
    .map(({data}) => JSON.parse(Buffer.from(data, 'base64').toString('utf8')));
  const receipts = commands.filter((command) =>
    command.type === 'COORDINATOR_SETTLEMENT' &&
      command.settlement?.transactionId === transactionId);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].settlement.kind, 'PROGRESS');
  assert.equal(receipts[0].settlement.decisionDigest, decision.decisionDigest);
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
