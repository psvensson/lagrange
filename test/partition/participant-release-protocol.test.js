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
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {readTransactionSchemaEnforcement} from
  '../../src/query/distributed/distributed-transaction-schema-enforcement.js';
import {participantCutoverPauseOf, participantReleaseAdmissionOf,
  readParticipantReleaseFacts} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {readPartitionWriteOrigin} from '../../src/partition/partition-participant-transaction-store.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {
  PARTICIPANT_RELEASE_ACTION as RELEASE_ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TRIGGER,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {createInProcessMockTransport} from '../test-helpers/replica-handler-identity-fixture.js';
import {
  deferFixtureParticipantMembership as deferObservationMembership,
  fixtureParticipantObservationRequest as currentObservationRequest,
  sendRegisteredFixtureParticipantObservation as sendRegisteredObservation,
  awaitProposal,
  cleanOwnedParticipantFixture as cleanOwnedFixture,
  clearFixtureSingletons,
  durableAppliedIndex,
  resetFixtureSingletons,
  scriptedFixtureTimeSource as scriptedTimeSource,
  shutdownAll,
  startLeader,
  track,
} from
  '../test-helpers/participant-transaction-fixture.js';
import {
  pollutePrototypeProperty,
  replacePrototypeProperty,
} from '../helpers/hostile-intrinsics.js';
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
const PENDING_DELETE_SQL =
  'DELETE FROM sql_transactions WHERE transaction_id = ?';
const cache = {getAll: () => [], get: () => null, filter: () => []};

function retainFailure(current, next, message) {
  return current === null ? next : new AggregateError([current, next], message);
}

async function retireMembershipAndIntrinsic(gate, restore, failure, message) {
  let retained = failure;
  try {
    if (restore !== null) restore();
  } catch (error) {
    retained = retainFailure(retained, error,
      `${message}: ambient intrinsic restoration failed`);
  }
  return gate.retire(retained, `${message}: membership custody failed`);
}

function registeredReleaseRequest(fields = {}) {
  return {
    type: PARTICIPANT_RELEASE_TYPE,
    action: RELEASE_ACTION.RELEASE,
    partitionId: PARTITION,
    targetBuildDigest: 'a'.repeat(64),
    deadlineAtMs: 1_000_000,
    ...fields,
  };
}

async function sendRegisteredRelease(handler, transport, request) {
  const registered = transport.getRegisteredHandler(
    `${handler.nodeId}${PARTICIPANT_RELEASE_ROUTE_SUFFIX}`,
  );
  assert.equal(typeof registered, 'function', 'release route must be registered');
  const response = await registered({payload: request});
  return response[PARTICIPANT_RELEASE_RESULT_FIELD];
}

async function cleanupBlockedDrainWitness({handler, leader, directory, pendingWrite,
  failure}) {
  return cleanOwnedFixture({directory, failure,
    label: 'blocked-drain', operations: [
      ['handler', () => handler.shutdown()],
      ['service', () => shutdownAll(leader)],
    ], settlements: pendingWrite === null ? [] : [
      ['pending write', () => pendingWrite.promise],
    ]});
}

async function withEmptyRegisteredHandler(timeSource, measure) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-observation-'));
  const transport = createInProcessMockTransport();
  const handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
    systemTableCache: cache, cdcIntegrationService: {},
    createPartitionService: () => null, messageRouter: transport,
    dataDir: directory, timeSource});
  handler.registerWithRouter(transport);
  let failure = null;
  try {
    await measure({handler, transport});
  } catch (error) {
    failure = error;
  }
  try {
    await handler.shutdown();
  } catch (error) {
    failure = retainFailure(failure, error,
      'release observation assertion and handler cleanup failed');
  }
  try {
    fs.rmSync(directory, {recursive: true, force: true});
  } catch (error) {
    failure = retainFailure(failure, error,
      'release observation assertion and artifact cleanup failed');
  }
  if (failure !== null) throw failure;
}

async function joinedHostedPartitionFailure(starterRequest, clockValues = [100, 100, 101, 102]) {
  let answers = null;
  await withEmptyRegisteredHandler(scriptedTimeSource(clockValues),
    async ({handler, transport}) => {
      const starter = sendRegisteredRelease(handler, transport, starterRequest);
      const joiner = sendRegisteredRelease(handler, transport,
        registeredReleaseRequest());
      answers = await Promise.all([starter, joiner]);
    });
  assert.equal(answers[0].outcome, OUTCOME.UNAVAILABLE);
  assert.equal(answers[0].missingFact, 'hosted_partition');
  assert.equal(answers[1].outcome, OUTCOME.UNAVAILABLE);
  assert.equal(answers[1].missingFact, 'hosted_partition');
  assert.equal(Object.hasOwn(answers[0], 'joinedAttempt'), false,
    'the starter is not its own joining caller');
  assert.equal(typeof answers[1].joinedAttempt?.clockState, 'string');
  assert.notEqual(answers[1].joinedAttempt.clockState.length, 0);
  const {joinedAttempt, ...underlying} = answers[1];
  assert.deepEqual(underlying, answers[0],
    'the caller projection must preserve the exact settled owner answer');
  return {starter: answers[0], joiner: answers[1], joinedAttempt};
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
  let handler = null;
  let service = null;
  let controlService = null;
  let controlHandler = null;
  let failure = null;
  try {
    handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation: 1,
      systemTableCache: cache, cdcIntegrationService, createPartitionService: create,
      messageRouter: transport, dataDir: directory});
    handler.registerWithRouter(transport);
    service = create();
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
        partitionId: options.partitionId, targetBuildDigest,
        deadlineAtMs: handler.timeSource.now() + 30000,
      });
    await measure({handler, service, controlService, transport, release, create,
      replace: (next) => {
        service = next;
        handler.replaceLocalReplicaService(REPLICA, next);
      }});
  } catch (error) {
    failure = error;
  }
  failure = await cleanOwnedFixture({directory, failure,
    label: 'participant release', operations: [
      ['local release recovery', () => handler?.participantReleaseRecovery.shutdown()],
      ['control release recovery', () => controlHandler?.participantReleaseRecovery.shutdown()],
      ['dependent service', () => service?.shutdown()],
      ['control service', () => controlService?.shutdown()],
    ]});
  if (failure !== null) throw failure;
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

test('already-current control cohort proves release with fewer original route calls',
  () => fixture(async ({handler, service, release, transport}) => {
    const originalDeliver = transport.deliver;
    const calls = [];
    transport.deliver = function(...args) {
      const request = args[1];
      if (request?.type === PARTICIPANT_RELEASE_TYPE &&
          request.partitionId === service.partitionId) {
        calls.push(request.action);
      }
      return Reflect.apply(originalDeliver, this, args);
    };
    try {
      const first = await release();
      assert.equal(first.outcome, OUTCOME.CUT_OVER, JSON.stringify(first));
      const origin = readPartitionWriteOrigin(service.db);
      assert.notEqual(origin, null, 'first source establishes a durable origin');
      const originalCalls = [...calls];
      assert.ok(originalCalls.includes(RELEASE_ACTION.ENABLE) &&
        originalCalls.includes(RELEASE_ACTION.RESUME),
      'full first real cutover engaged origin and member admission owners');
      calls.length = 0;
      const second = await release();
      assert.equal(second.outcome, OUTCOME.CUT_OVER, JSON.stringify(second));
      const repeatedCalls = [...calls];
      assert.deepEqual(readPartitionWriteOrigin(service.db), origin,
        'the same durable origin is still current and unchanged');
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.OPEN);
      assert.ok(repeatedCalls.length > 0,
        'the second control attempt genuinely reached the same release route');
      assert.ok(repeatedCalls.length < originalCalls.length,
        'the already-current authoritative control owner must not replay ' +
        'every original ENABLE/OBSERVE/current-census step');
      assert.ok(handler.localServices.get(service.replicaId) === service,
        'no replacement or foreign test-side owner supplied the second result');
    } finally {
      transport.deliver = originalDeliver;
    }
  }, {partitionId: CONTROL_PARTITION, tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA}));

test('control current-proof refuses schema drift during its second live census, then repairs',
  () => fixture(async ({service, release, transport}) => {
    const first = await release();
    assert.equal(first.outcome, OUTCOME.CUT_OVER, JSON.stringify(first));
    const origin = readPartitionWriteOrigin(service.db);
    const originalDeliver = transport.deliver;
    let inspectCount = 0;
    transport.deliver = function(...args) {
      if (args[1]?.type === PARTICIPANT_RELEASE_TYPE &&
          args[1].partitionId === service.partitionId &&
          args[1].action === RELEASE_ACTION.INSPECT) {
        inspectCount += 1;
        if (inspectCount === 2) {
          // The first PAUSE/assessment was clean. A live mutation before the
          // required second INSPECT invalidates that earlier observation.
          service.db.exec('DROP TRIGGER sql_transactions_initial_lineage_v1');
        }
      }
      return Reflect.apply(originalDeliver, this, args);
    };
    let raced;
    try {
      raced = await release();
    } finally {
      transport.deliver = originalDeliver;
    }
    assert.equal(inspectCount, 2,
      'the candidate performs the second current member census before RESUME');
    assert.equal(raced.outcome, OUTCOME.STALE, JSON.stringify(raced));
    assert.notEqual(participantCutoverPauseOf(service), null,
      'an obsolete clean snapshot never opens admission after a schema mutation');
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'install_required');
    assert.deepEqual(readPartitionWriteOrigin(service.db), origin,
      'the refusal never forges or overwrites durable origin');
    const recovered = await release();
    assert.equal(recovered.outcome, OUTCOME.CUT_OVER, JSON.stringify(recovered));
    assert.equal(readTransactionSchemaEnforcement(service.db).state, 'enforced',
      'the canonical full release repairs the missing enforcer');
    assert.deepEqual(readPartitionWriteOrigin(service.db), origin);
  }, {partitionId: CONTROL_PARTITION, tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
    tableName: SQL_TRANSACTIONS_SCHEMA.tableName, schema: SQL_TRANSACTIONS_SCHEMA}));

test('real recipient refuses OPEN when its absolute deadline expires during awaited RESUME facts',
  () => fixture(async ({handler, service, release, transport}) => {
    const first = await release();
    assert.equal(first.outcome, OUTCOME.CUT_OVER, JSON.stringify(first));
    const originalPort = service.raft;
    const originalPortProperty = Object.getOwnPropertyDescriptor(service, 'raft');
    const originalTimeSource = handler.timeSource;
    const originalDeliver = transport.deliver;
    let inResume = false;
    let resumeMembershipReads = 0;
    let nowExpired = false;
    let enteredBeforeDeadline = false;
    // The original handler retains its real timer scheduler. Only the
    // monotonic observation is advanced after a genuine asynchronous read.
    const observedClock = Object.create(originalTimeSource);
    Object.defineProperty(observedClock, 'now', {value: () =>
      originalTimeSource.now() + (nowExpired ? 60000 : 0)});
    const measuredPort = Object.create(originalPort);
    Object.defineProperty(measuredPort, 'readCommittedMembership', {
      value: async (...args) => {
        const answer = await Reflect.apply(originalPort.readCommittedMembership,
          originalPort, args);
        if (inResume) {
          resumeMembershipReads += 1;
          if (resumeMembershipReads === 2) nowExpired = true;
        }
        return answer;
      },
    });
    let failure = null;
    try {
      handler.timeSource = observedClock;
      Object.defineProperty(service, 'raft', {...originalPortProperty,
        value: measuredPort});
      transport.deliver = function(...args) {
        const request = args[1];
        if (request?.type === PARTICIPANT_RELEASE_TYPE &&
            request.partitionId === CONTROL_PARTITION &&
            request.action === RELEASE_ACTION.RESUME) {
          inResume = true;
          enteredBeforeDeadline = observedClock.now() < request.deadlineAtMs;
          const result = Reflect.apply(originalDeliver, this, args);
          return Promise.resolve(result).finally(() => {
            inResume = false;
          });
        }
        return Reflect.apply(originalDeliver, this, args);
      };
      const response = await release();
      assert.equal(enteredBeforeDeadline, true,
        'registered RESUME arrived before the original finite deadline');
      assert.equal(resumeMembershipReads >= 2, true,
        'the real recipient completed two distinct awaited fresh-fact observations');
      assert.equal(nowExpired, true,
        'the deadline advanced after ingress and before final admission');
      assert.equal(response.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(response));
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED,
        'an expired RESUME cannot commit OPEN after its awaited membership read');
    } catch (error) {
      failure = error;
    } finally {
      transport.deliver = originalDeliver;
      handler.timeSource = originalTimeSource;
      try {
        if (originalPortProperty) {
          Object.defineProperty(service, 'raft', originalPortProperty);
        } else {
          Reflect.deleteProperty(service, 'raft');
        }
      } catch (error) {
        failure = retainFailure(failure, error, 'original Raft port restoration');
      }
    }
    if (failure !== null) throw failure;
  }, {partitionId: CONTROL_PARTITION, tableId: SQL_TRANSACTIONS_SCHEMA.tableName,
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

test('registered participant release projects one real blocked drain and older joined attempt',
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-real-drain-'));
    const transport = createInProcessMockTransport();
    const clock = new VirtualTimeSource({startMs: 1000});
    const {leader, proposed} = await startLeader({
      tableName: SQL_TRANSACTIONS_SCHEMA.tableName,
      schema: SQL_TRANSACTIONS_SCHEMA,
      timeSource: clock,
    });
    const handler = new ReplicaHandler({nodeId: leader.nodeId, ownerIncarnation: 1,
      systemTableCache: leader.systemTableCache, cdcIntegrationService: {},
      createPartitionService: () => leader, messageRouter: transport,
      dataDir: directory, timeSource: clock});
    handler.registerWithRouter(transport);
    handler.localServices.set(leader.replicaId, leader);
    let failure = null;
    let restoreSafeInteger = null;
    let pendingWrite = null;
    let proposal = null;
    try {
      const build = await runtimeBuildProvenance();
      assert.equal(build.state, 'measured', build.reason);
      const initial = await handler.participantReleaseRecovery.releaseOperator({
        partitionId: leader.partitionId,
        targetBuildDigest: build.digest,
        deadlineAtMs: clock.now() + 30000,
      });
      assert.equal(initial.outcome, OUTCOME.CUT_OVER, JSON.stringify(initial));
      assert.equal(Object.hasOwn(initial, 'joinedAttempt'), false);
      const durableOrigin = readPartitionWriteOrigin(leader.db);
      assert.notEqual(durableOrigin, null);
      const appliedBeforeWrite = durableAppliedIndex(leader);

      const absentId = 'd'.repeat(32);
      pendingWrite = track(leader.executeQuery(PENDING_DELETE_SQL, [absentId]));
      proposal = await awaitProposal(proposed,
        (entry) => entry.sql === PENDING_DELETE_SQL);
      assert.notEqual(proposal, null, 'the production write must reach the proposal port');
      assert.equal(pendingWrite.settled, false,
        'the write remains owned until its actual proposal commits');
      assert.equal(leader.proposalQueue.size, 1);
      assert.equal(leader.db.prepare(
        'SELECT COUNT(*) AS count FROM sql_transactions WHERE transaction_id = ?',
      ).get(absentId).count, 0);
      assert.deepEqual(readPartitionWriteOrigin(leader.db), durableOrigin,
        'accepted work does not replace the earlier durable origin watermark');

      leader.controllablePort.setTerm(durableOrigin.originTerm + 1);
      const observationRequest = await currentObservationRequest(handler, leader);
      assert.ok(durableOrigin.originTerm < observationRequest.attempt.term,
        'the durable origin predates the current controlled consensus term');
      const observed = await sendRegisteredObservation(handler, transport,
        observationRequest);
      assert.equal(observed.outcome, OUTCOME.OBSERVED, JSON.stringify(observed));
      assert.equal(observed.partitionId, observationRequest.partitionId);
      assert.deepEqual(observed.generation, observationRequest.target);
      assert.deepEqual(observed.origin, durableOrigin,
        'the progress answer reports the earlier durable origin by content');
      assert.equal(observed.membership.term, observationRequest.attempt.term);
      assert.equal(observed.membership.appliedIndex, durableOrigin.originIndex);
      assert.equal(observed.work.proposals, 1);
      assert.equal(pendingWrite.settled, false);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED,
        'an observed watermark does not grant release around accepted later work');

      const gate = deferObservationMembership(leader);
      let releaseFailure = null;
      try {
        const authorization = handler.participantReleaseAuthorizationOwner
          .authorizeOperator({partitionId: leader.partitionId,
            targetBuildDigest: build.digest});
        const request = registeredReleaseRequest({partitionId: leader.partitionId,
          targetBuildDigest: build.digest, trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
          deadlineAtMs: clock.now() + 30000, authorization});
        const starter = gate.trackSettlement('starter release',
          sendRegisteredRelease(handler, transport, request));
        await gate.started;
        assert.equal(gate.reads(), 1,
          'one cutover attempt reaches the gated membership owner');

        const mixed = await sendRegisteredRelease(handler, transport,
          {...request, targetBuildDigest: '0'.repeat(64)});
        assert.equal(mixed.outcome, OUTCOME.INVALID);
        assert.equal(Object.hasOwn(mixed, 'joinedAttempt'), false,
          'a mixed build neither joins nor samples the active attempt');

        clock.advance(1);
        restoreSafeInteger = replacePrototypeProperty(Number, 'isSafeInteger', () => {
          throw new Error('ambient Number.isSafeInteger must not be read by join projection');
        });
        const joiner = gate.trackSettlement('joined release',
          sendRegisteredRelease(handler, transport, {...request}));
        await Promise.resolve();
        restoreSafeInteger();
        restoreSafeInteger = null;
        gate.release();
        gate.restore();

        const [starterAnswer, joinerAnswer] = await Promise.all([starter, joiner]);
        assert.equal(starterAnswer.outcome, OUTCOME.DRAIN_PENDING,
          JSON.stringify(starterAnswer));
        assert.equal(joinerAnswer.outcome, OUTCOME.DRAIN_PENDING,
          JSON.stringify(joinerAnswer));
        assert.equal(gate.reads(), 1,
          'the same-build caller must share the first attempt');
        assert.equal(Object.hasOwn(starterAnswer, 'joinedAttempt'), false);
        assert.deepEqual(joinerAnswer.blockedDrain, starterAnswer.blockedDrain);
        const canonicalFacts = await readParticipantReleaseFacts(
          handler,
          leader,
          COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT,
        );
        assert.equal(canonicalFacts.outcome, OUTCOME.OBSERVED,
          JSON.stringify(canonicalFacts));
        assert.deepEqual(starterAnswer.blockedDrain,
          {generation: canonicalFacts.generation, work: canonicalFacts.work},
          'the refusal projects the complete generation and work from the one canonical fact');
        assert.equal(starterAnswer.blockedDrain?.work?.proposals, 1);
        assert.equal(starterAnswer.blockedDrain?.generation?.replicaId, leader.replicaId);
        assert.deepEqual(readPartitionWriteOrigin(leader.db), durableOrigin);
        assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED,
          'an older applied origin never grants admission around unrelated work');
        assert.equal(joinerAnswer.joinedAttempt?.originalTrigger,
          PARTICIPANT_RELEASE_TRIGGER.OPERATOR);
        assert.equal(typeof joinerAnswer.joinedAttempt?.clockState, 'string');
        assert.notEqual(joinerAnswer.joinedAttempt.clockState.length, 0);
        assert.ok(joinerAnswer.joinedAttempt.joinAgeMs > 0,
          'the joining caller observes an already-running attempt');
        assert.ok(joinerAnswer.joinedAttempt.terminalAgeMs >=
          joinerAnswer.joinedAttempt.joinAgeMs);
        const {joinedAttempt, ...settledAnswer} = joinerAnswer;
        assert.deepEqual(settledAnswer, starterAnswer,
          'removing only caller projection recovers the exact shared answer');
        assert.notEqual(joinedAttempt, null);
      } catch (error) {
        releaseFailure = error;
      } finally {
        releaseFailure = await retireMembershipAndIntrinsic(gate,
          restoreSafeInteger, releaseFailure, 'release assertion');
        restoreSafeInteger = null;
      }
      if (releaseFailure !== null) throw releaseFailure;

      leader.controllablePort.commit(proposal);
      const writeAnswer = await pendingWrite.promise;
      assert.equal(writeAnswer.success, true, JSON.stringify(writeAnswer));
      assert.equal(writeAnswer.changes, 0,
        'the absent-row DELETE is a real successful zero-row application');
      const committed = readCommittedStatementOutcome(leader,
        leader.getCommittedEntryKey(proposal));
      assert.equal(committed.state, 'settled');
      assert.equal(committed.outcome, 'applied');
      assert.equal(committed.logIndex, durableAppliedIndex(leader));
      assert.equal(committed.logIndex, appliedBeforeWrite + 1);
      assert.equal(committed.term, observationRequest.attempt.term);
      assert.equal(committed.changes, 0);
      assert.equal(leader.proposalQueue.size, 0);
      const healed = await handler.participantReleaseRecovery.releaseOperator({
        partitionId: leader.partitionId,
        targetBuildDigest: build.digest,
        deadlineAtMs: clock.now() + 30000,
      });
      assert.equal(healed.outcome, OUTCOME.CUT_OVER, JSON.stringify(healed));
      assert.equal(Object.hasOwn(healed, 'joinedAttempt'), false,
        'a fresh successful attempt carries no failure projection');
    } catch (error) {
      failure = error;
    }
    failure = await cleanupBlockedDrainWitness({handler, leader, directory,
      pendingWrite, failure});
    if (failure !== null) throw failure;
  });

test('registered failed joins bound triggers without getters or coercion', async () => {
  const valid = await joinedHostedPartitionFailure(registeredReleaseRequest({
    trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
  }));
  assert.equal(valid.joinedAttempt.originalTrigger, PARTICIPANT_RELEASE_TRIGGER.OPERATOR);

  let coercionReads = 0;
  const coercible = {toString() {
    coercionReads += 1;
    return PARTICIPANT_RELEASE_TRIGGER.OPERATOR;
  }, [Symbol.toPrimitive]() {
    coercionReads += 1;
    return PARTICIPANT_RELEASE_TRIGGER.OPERATOR;
  }};
  const invalidInputs = [
    Object(PARTICIPANT_RELEASE_TRIGGER.OPERATOR),
    Object(1),
    Object(true),
    coercible,
    'operator-with-untrusted-suffix',
  ];
  for (const trigger of invalidInputs) {
    const result = await joinedHostedPartitionFailure(registeredReleaseRequest({trigger}));
    assert.equal(result.joinedAttempt.originalTrigger, null);
  }
  assert.equal(coercionReads, 0);

  const nullPrototypeRequest = Object.assign(Object.create(null),
    registeredReleaseRequest({trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR}));
  assert.equal((await joinedHostedPartitionFailure(nullPrototypeRequest))
    .joinedAttempt.originalTrigger, PARTICIPANT_RELEASE_TRIGGER.OPERATOR);

  const restores = [
    pollutePrototypeProperty(Object.prototype, 'participantReleaseDiagnosticPollution', 1),
    pollutePrototypeProperty(Array.prototype, 'participantReleaseDiagnosticPollution', 2),
    pollutePrototypeProperty(Map.prototype, 'participantReleaseDiagnosticPollution', 3),
    pollutePrototypeProperty(Set.prototype, 'participantReleaseDiagnosticPollution', 4),
  ];
  let pollutionFailure = null;
  try {
    const polluted = await joinedHostedPartitionFailure(registeredReleaseRequest({
      trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
    }));
    assert.equal(polluted.joinedAttempt.originalTrigger,
      PARTICIPANT_RELEASE_TRIGGER.OPERATOR);
  } catch (error) {
    pollutionFailure = error;
  } finally {
    for (let index = restores.length - 1; index >= 0; index -= 1) {
      try {
        restores[index]();
      } catch (error) {
        pollutionFailure = retainFailure(pollutionFailure, error,
          'hostile prototype assertion and restoration failed');
      }
    }
  }
  if (pollutionFailure !== null) throw pollutionFailure;
});

test('registered failed joins type invalid and backward owner clock observations', async () => {
  const measured = await joinedHostedPartitionFailure(registeredReleaseRequest({
    trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
  }), [100, 100, 101, 102]);
  assert.equal(measured.joinedAttempt.joinAgeMs, 1);
  assert.equal(measured.joinedAttempt.terminalAgeMs, 2);

  const unsafeSamples = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
    '101',
  ];
  let unsafeState = null;
  for (const sample of unsafeSamples) {
    const observed = await joinedHostedPartitionFailure(registeredReleaseRequest(),
      [100, 100, sample, 102]);
    unsafeState ??= observed.joinedAttempt.clockState;
    assert.equal(observed.joinedAttempt.clockState, unsafeState);
    assert.equal(observed.joinedAttempt.joinAgeMs, null);
    assert.equal(observed.joinedAttempt.terminalAgeMs, null);
  }
  assert.notEqual(unsafeState, measured.joinedAttempt.clockState);

  const overflow = await joinedHostedPartitionFailure(registeredReleaseRequest(),
    [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  assert.equal(overflow.joinedAttempt.clockState, unsafeState,
    'unsafe derived subtraction has the same typed state as unsafe samples');
  assert.equal(overflow.joinedAttempt.joinAgeMs, null);
  assert.equal(overflow.joinedAttempt.terminalAgeMs, null);

  const backward = await joinedHostedPartitionFailure(registeredReleaseRequest(),
    [100, 100, 99, 101]);
  assert.notEqual(backward.joinedAttempt.clockState, measured.joinedAttempt.clockState);
  assert.notEqual(backward.joinedAttempt.clockState, unsafeState);
  assert.equal(backward.joinedAttempt.joinAgeMs, null);
  assert.equal(backward.joinedAttempt.terminalAgeMs, null);

  const unsafeBeforeBackward = await joinedHostedPartitionFailure(
    registeredReleaseRequest({deadlineAtMs: Number.MAX_SAFE_INTEGER}),
    [Number.MAX_SAFE_INTEGER, 0, -Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER]);
  assert.equal(unsafeBeforeBackward.joinedAttempt.clockState, unsafeState,
    'unsafe derived age takes precedence over the same backward observation');
  assert.equal(unsafeBeforeBackward.joinedAttempt.joinAgeMs, null);
  assert.equal(unsafeBeforeBackward.joinedAttempt.terminalAgeMs, null);

  const unavailable = await joinedHostedPartitionFailure(registeredReleaseRequest(),
    [100, 100, 101, new Error('terminal clock unavailable')]);
  assert.notEqual(unavailable.joinedAttempt.clockState, measured.joinedAttempt.clockState);
  assert.notEqual(unavailable.joinedAttempt.clockState, unsafeState);
  assert.notEqual(unavailable.joinedAttempt.clockState, backward.joinedAttempt.clockState);
  assert.equal(unavailable.joinedAttempt.joinAgeMs, null);
  assert.equal(unavailable.joinedAttempt.terminalAgeMs, null);

  const unavailableJoin = await joinedHostedPartitionFailure(registeredReleaseRequest(),
    [100, 100, new Error('join clock unavailable'), 102]);
  const {joinedAttempt: unavailableJoinProjection, ...unavailableJoinAnswer} =
    unavailableJoin.joiner;
  assert.deepEqual(unavailableJoinAnswer, unavailableJoin.starter,
    'a throwing join observation cannot alter the settled owner answer');
  assert.deepEqual(unavailableJoinProjection, unavailableJoin.joinedAttempt);
  assert.equal(unavailableJoin.joinedAttempt.clockState,
    unavailable.joinedAttempt.clockState);
  assert.equal(unavailableJoin.joinedAttempt.joinAgeMs, null);
  assert.equal(unavailableJoin.joinedAttempt.terminalAgeMs, null);
});

test('post-ENABLE control loss returns the canonical control refusal and stays paused', () =>
  fixture(async ({service, controlService, transport, release}) => {
    const deliverDescriptor = Object.getOwnPropertyDescriptor(transport, 'deliver');
    const originalDeliver = transport.deliver;
    const observationEntered = Promise.withResolvers();
    const observationContinuation = Promise.withResolvers();
    let observations = 0;
    let successfulControlReleases = 0;
    let dependentResumes = 0;
    transport.deliver = async (address, payload, options) => {
      if (payload.action === RELEASE_ACTION.OBSERVE_APPLIED_POSITION &&
          payload.partitionId === service.partitionId) {
        observations += 1;
        observationEntered.resolve();
        await observationContinuation.promise;
      }
      if (payload.action === RELEASE_ACTION.RESUME &&
          payload.partitionId === service.partitionId) dependentResumes += 1;
      const response = await Reflect.apply(originalDeliver, transport,
        [address, payload, options]);
      if (payload.action === RELEASE_ACTION.RELEASE &&
          payload.partitionId === CONTROL_PARTITION &&
          response[PARTICIPANT_RELEASE_RESULT_FIELD]?.outcome === OUTCOME.CUT_OVER) {
        successfulControlReleases += 1;
      }
      return response;
    };
    const attempt = track(release());
    let failure = null;
    try {
      await observationEntered.promise;
      const enabledOrigin = readPartitionWriteOrigin(service.db);
      assert.notEqual(enabledOrigin, null,
        'the dependent entered observation only after its actual ENABLE origin');
      await controlService.shutdown();
      observationContinuation.resolve();
      const answer = await attempt.promise;
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
      assert.equal(answer.missingFact, 'current_control_owner_fact');
      assert.equal(observations, 1);
      assert.equal(successfulControlReleases, 1,
        'the initial control release succeeded before the dependent observation');
      assert.equal(dependentResumes, 0,
        'the final current-control refusal is reached before any RESUME action');
      assert.deepEqual(readPartitionWriteOrigin(service.db), enabledOrigin,
        'the final control refusal proposes no second origin');
      assert.equal(participantReleaseAdmissionOf(service).state, ADMISSION.CLOSED);
    } catch (error) {
      failure = error;
    } finally {
      try {
        observationContinuation.resolve();
      } catch (error) {
        failure = retainFailure(failure, error,
          'post-ENABLE observation release failed');
      }
      try {
        if (deliverDescriptor === undefined) {
          if (!delete transport.deliver) {
            failure = retainFailure(failure, new Error('deliver deletion refused'),
              'post-ENABLE transport restoration failed');
          }
        } else {
          Object.defineProperty(transport, 'deliver', deliverDescriptor);
        }
      } catch (error) {
        failure = retainFailure(failure, error,
          'post-ENABLE transport restoration failed');
      }
      try {
        await attempt.promise;
      } catch (error) {
        failure = retainFailure(failure, error,
          'post-ENABLE release attempt settlement failed');
      }
    }
    if (failure !== null) throw failure;
  }));
