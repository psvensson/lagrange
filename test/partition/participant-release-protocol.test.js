// The real PartitionService/Raft application and lifecycle recipient, with
// only the transport hop in process. No injected eligibility booleans.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler-class.js';
import {askParticipantRelease, requestParticipantRelease} from
  '../../src/node/participant-release-client.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
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
  PARTICIPANT_CUTOVER_BOUND as BOUND,
  PARTICIPANT_RELEASE_ACTION as RELEASE_ACTION,
  PARTICIPANT_RELEASE_ADMISSION as ADMISSION,
  PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_ROUTE_SUFFIX,
  PARTICIPANT_RELEASE_TRIGGER,
  PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE} from
  '../../src/transport/transport-semantic-outcome.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {REPLICA_HANDLER_ERROR_MSG} from '../../src/node/replica-handler-constants.js';
import {createInProcessMockTransport} from '../test-helpers/replica-handler-identity-fixture.js';
import {
  deferFixtureParticipantMembership as deferObservationMembership,
  fixtureParticipantObservationListenerCount as releaseListenerCount,
  fixtureParticipantObservationRequest as currentObservationRequest,
  sendRegisteredFixtureParticipantMessage as sendRegisteredMessage,
  sendRegisteredFixtureParticipantObservation as sendRegisteredObservation,
  awaitProposal,
  clearFixtureSingletons,
  durableAppliedIndex,
  resetFixtureSingletons,
  settle,
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
const FIXTURE_SQL = 'INSERT INTO test_table (id, value) VALUES (?, ?)';
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

async function cleanOwnedFixture({directory, failure, label, operations,
  settlements = []}) {
  let retained = failure;
  let retirementFailed = false;
  for (const [owner, operation] of operations) {
    try {
      await operation();
    } catch (error) {
      retirementFailed = true;
      retained = retainFailure(retained, error,
        `${label} assertion and ${owner} cleanup failed`);
    }
  }
  for (const [owner, settlement] of settlements) {
    try {
      await settlement();
    } catch (error) {
      retained = retainFailure(retained, error,
        `${label} assertion and ${owner} settlement failed`);
    }
  }
  if (retirementFailed) {
    retained.retainedDirectory = directory;
    return retained;
  }
  try {
    fs.rmSync(directory, {recursive: true, force: true});
  } catch (error) {
    retained = retainFailure(retained, error,
      `${label} assertion and artifact cleanup failed`);
  }
  return retained;
}

function scriptedTimeSource(values) {
  let reads = 0;
  return {
    now() {
      const value = values[Math.min(reads, values.length - 1)];
      reads += 1;
      if (value instanceof Error) throw value;
      return value;
    },
    setTimeout,
    clearTimeout,
    reads: () => reads,
  };
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

async function promptRegisteredAnswer(gate, owner, operation) {
  const pending = track(gate.trackSettlement(owner, operation));
  await settle();
  assert.equal(pending.settled, true,
    `${owner} settles through the registered route while the owner read is held`);
  return pending.promise;
}

async function withRegisteredObservationOwner(measure, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-release-position-'));
  const transport = createInProcessMockTransport();
  const clock = options.clock ?? new VirtualTimeSource({startMs: 1000});
  let leader = null;
  let handler = null;
  let failure = null;
  try {
    const started = await startLeader({timeSource: clock,
      ...(options.leader ?? {})});
    leader = started.leader;
    handler = new ReplicaHandler({nodeId: leader.nodeId, ownerIncarnation: 1,
      systemTableCache: leader.systemTableCache, cdcIntegrationService: {},
      createPartitionService: () => leader, messageRouter: transport,
      dataDir: directory, timeSource: clock});
    handler.registerWithRouter(transport);
    handler.localServices.set(leader.replicaId, leader);
    await measure({handler, leader, proposed: started.proposed, transport, clock});
  } catch (error) {
    failure = error;
  }
  failure = await cleanOwnedFixture({directory, failure,
    label: 'applied-position', operations: [
      ['handler', () => handler?.shutdown()],
      ['service', () => leader === null ? undefined : shutdownAll(leader)],
    ]});
  if (failure !== null) throw failure;
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
        partitionId: PARTITION, targetBuildDigest,
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

  const inherited = Object.assign(Object.create({
    trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
  }), registeredReleaseRequest());
  const inheritedResult = await joinedHostedPartitionFailure(inherited);
  assert.equal(inheritedResult.joinedAttempt.originalTrigger, null);

  let getterReads = 0;
  const accessor = registeredReleaseRequest();
  Object.defineProperty(accessor, 'trigger', {enumerable: true, get() {
    getterReads += 1;
    return PARTICIPANT_RELEASE_TRIGGER.OPERATOR;
  }});
  const accessorResult = await joinedHostedPartitionFailure(accessor);
  assert.equal(accessorResult.joinedAttempt.originalTrigger, null);
  assert.equal(getterReads, 0, 'diagnostics inspect a descriptor and never invoke its getter');

  let proxyTriggerReads = 0;
  const proxied = new Proxy(registeredReleaseRequest({
    trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
  }), {get(target, field, receiver) {
    if (field === 'trigger') proxyTriggerReads += 1;
    return Reflect.get(target, field, receiver);
  }});
  const proxyResult = await joinedHostedPartitionFailure(proxied);
  assert.equal(proxyResult.joinedAttempt.originalTrigger, null);
  assert.equal(proxyTriggerReads, 0);

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

  const symbolOnly = registeredReleaseRequest();
  symbolOnly[Symbol('trigger')] = PARTICIPANT_RELEASE_TRIGGER.OPERATOR;
  assert.equal((await joinedHostedPartitionFailure(symbolOnly))
    .joinedAttempt.originalTrigger, null);
  const arrayRequest = Object.assign([], registeredReleaseRequest({
    trigger: PARTICIPANT_RELEASE_TRIGGER.OPERATOR,
  }));
  assert.equal((await joinedHostedPartitionFailure(arrayRequest))
    .joinedAttempt.originalTrigger, null);

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

test('applied-position client preserves overall and RPC deadlines without stranded debt',
  async () => {
    for (const control of [
      {label: 'rpc', budgetMs: 30000, expectedTimeoutMs: BOUND.REQUEST_TIMEOUT_MS,
        missingFact: 'replica_release_reply',
        reason: TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT},
      {label: 'overall', budgetMs: 1500, expectedTimeoutMs: 1500,
        missingFact: 'release_deadline', reason: undefined},
    ]) {
      await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
        const request = await currentObservationRequest(handler, leader,
          {deadlineAtMs: clock.now() + control.budgetMs});
        delete request.observationDeadlineAtMs;
        const gate = deferObservationMembership(leader);
        const originalDeliver = transport.deliver.bind(transport);
        let delivered = null;
        transport.deliver = (address, payload, options) => {
          delivered = {address, payload, options};
          return originalDeliver(address, payload, options);
        };
        const senderNowMs = clock.now();
        const senderClock = scriptedTimeSource([senderNowMs]);
        const sender = {messageRouter: transport, timeSource: senderClock};
        const timerBaseline = clock.pendingTimerCount();
        const pending = gate.trackSettlement(`${control.label} observation`,
          askParticipantRelease(sender, handler.nodeId, request));
        let failure = null;
        try {
          await gate.started;

          assert.equal(senderClock.reads(), 1,
            `${control.label} samples the sender clock once`);
          assert.equal(delivered.options.timeoutMs, control.expectedTimeoutMs,
            `${control.label} uses the one existing sender budget`);
          assert.equal(delivered.payload.observationDeadlineAtMs,
            senderNowMs + control.expectedTimeoutMs);
          assert.equal(delivered.payload.deadlineAtMs, request.deadlineAtMs);
          assert.deepEqual(delivered.payload.release, request.release);
          assert.equal(releaseListenerCount(leader), 1);
          assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

          clock.advance(control.expectedTimeoutMs);
          const answer = await pending;
          assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
          assert.equal(answer.missingFact, control.missingFact);
          assert.equal(answer.reason, control.reason);
          assert.equal(answer.partitionId, request.partitionId);
          assert.equal(answer.phase, request.action);
          assert.equal(answer.releaseId, request.release.releaseId);
          assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
          assert.equal(releaseListenerCount(leader), 0);
          assert.equal(clock.pendingTimerCount(), timerBaseline);

          gate.release();
          gate.restore();
          const successorRequest = await currentObservationRequest(handler, leader,
            {deadlineAtMs: clock.now() + 30000});
          const successor = await sendRegisteredObservation(handler, transport,
            successorRequest);
          assert.equal(successor.outcome, OUTCOME.OBSERVED, JSON.stringify(successor));
          assert.equal(successor.partitionId, successorRequest.partitionId);
          assert.deepEqual(successor.generation, successorRequest.target);
          assert.equal(releaseListenerCount(leader), 0);
          assert.equal(clock.pendingTimerCount(), timerBaseline);
        } catch (error) {
          failure = error;
        } finally {
          failure = await gate.retire(failure,
            `${control.label} deadline assertion and membership custody failed`);
        }
        if (failure !== null) throw failure;
      });
    }

    await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now()});
      delete request.observationDeadlineAtMs;
      let deliveries = 0;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (...args) => {
        deliveries += 1;
        return originalDeliver(...args);
      };
      const answer = await askParticipantRelease(handler, handler.nodeId, request);
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(answer.missingFact, 'release_deadline');
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(deliveries, 0, 'an already-spent overall deadline performs no delivery');
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
      assert.equal(releaseListenerCount(leader), 0);
    });

    await withRegisteredObservationOwner(async ({handler, leader, transport}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: Number.MAX_SAFE_INTEGER});
      delete request.observationDeadlineAtMs;
      const gate = deferObservationMembership(leader);
      const startMs = Number.MAX_SAFE_INTEGER - 1;
      const senderClock = scriptedTimeSource([startMs]);
      const sender = {messageRouter: transport, timeSource: senderClock};
      let delivered = null;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (address, payload, options) => {
        delivered = {payload, options};
        return originalDeliver(address, payload, options);
      };
      const pending = gate.trackSettlement('safe-edge observation',
        askParticipantRelease(sender, handler.nodeId, request));
      let failure = null;
      try {
        await gate.started;
        assert.equal(senderClock.reads(), 1,
          'the safe-edge sender clock is sampled exactly once');
        assert.equal(delivered.options.timeoutMs, 1);
        assert.equal(delivered.payload.observationDeadlineAtMs,
          Number.MAX_SAFE_INTEGER);
        gate.release();
        const answer = await pending;
        assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
        assert.equal(answer.partitionId, request.partitionId);
        assert.deepEqual(answer.generation, request.target);
      } catch (error) {
        failure = error;
      } finally {
        failure = await gate.retire(failure,
          'safe-edge assertion and membership custody failed');
      }
      if (failure !== null) throw failure;
    });

    await withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
      const request = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now() + 30000});
      delete request.observationDeadlineAtMs;
      const originalDeliver = transport.deliver.bind(transport);
      const restoreSafeInteger = replacePrototypeProperty(Number, 'isSafeInteger', () => {
        throw new Error('the client budget guard must use its captured integer intrinsic');
      });
      const restoreObjectIs = replacePrototypeProperty(Object, 'is', () => {
        throw new Error('the client budget guard must use its captured identity intrinsic');
      });
      let deliveries = 0;
      let failure = null;
      transport.deliver = (address, payload, options) => {
        deliveries += 1;
        restoreObjectIs();
        restoreSafeInteger();
        return originalDeliver(address, payload, options);
      };
      try {
        const answer = await askParticipantRelease(handler, handler.nodeId, request);
        assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
        assert.equal(deliveries, 1);
        assert.deepEqual(answer.generation, request.target);
      } catch (error) {
        failure = error;
      } finally {
        try {
          restoreObjectIs();
          restoreSafeInteger();
        } catch (error) {
          failure = retainFailure(failure, error,
            'client intrinsic assertion and restoration failed');
        }
        transport.deliver = originalDeliver;
      }
      if (failure !== null) throw failure;
    });
  });

test('transport queue delay consumes the carried applied-position RPC window', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader,
      {deadlineAtMs: clock.now() + 30000});
    delete request.observationDeadlineAtMs;
    const gate = deferObservationMembership(leader);
    const originalDeliver = transport.deliver.bind(transport);
    let delivered = null;
    transport.deliver = (address, payload, options) => {
      delivered = {payload, options};
      clock.advance(4000);
      return originalDeliver(address, payload, options);
    };
    const timerBaseline = clock.pendingTimerCount();
    const pending = gate.trackSettlement('queue-delayed observation',
      askParticipantRelease(handler, handler.nodeId, request));
    let failure = null;
    try {
      await gate.started;
      assert.equal(delivered.options.timeoutMs, BOUND.REQUEST_TIMEOUT_MS);
      assert.equal(delivered.payload.observationDeadlineAtMs, 6000,
        'the sender carries its one start sample instead of an arrival-relative deadline');
      assert.equal(clock.now(), 5000);
      assert.equal(clock.pendingTimerCount(), timerBaseline + 1);
      clock.advance(999);
      assert.equal(releaseListenerCount(leader), 1);
      clock.advance(1);
      const answer = await pending;
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(answer.missingFact, 'replica_release_reply');
      assert.equal(answer.reason, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.phase, request.action);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(clock.now(), delivered.payload.observationDeadlineAtMs);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'queue-delay assertion and membership custody failed');
    }
    if (failure !== null) throw failure;

    transport.deliver = originalDeliver;
    const ownerNow = clock.now();
    const delayedDeadline = ownerNow + 2;
    const delayed = {...request, deadlineAtMs: delayedDeadline,
      observationDeadlineAtMs: ownerNow + 1,
      attempt: {...request.attempt, deadlineAtMs: delayedDeadline}};
    const delayedGate = deferObservationMembership(leader);
    const originalTimeSource = handler.timeSource;
    handler.timeSource = scriptedTimeSource([ownerNow, delayedDeadline + 1]);
    let delayedFailure = null;
    try {
      const delayedObservation = delayedGate.trackSettlement('delayed timer observation',
        sendRegisteredObservation(handler, transport, delayed));
      await delayedGate.started;
      const delayedAnswer = await delayedObservation;
      assert.equal(delayedAnswer.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(delayedAnswer.missingFact, 'release_deadline',
        'a late callback samples the current overall deadline before stored RPC equality');
    } catch (error) {
      delayedFailure = error;
    } finally {
      handler.timeSource = originalTimeSource;
      delayedFailure = await delayedGate.retire(delayedFailure,
        'late timer assertion and membership custody failed');
    }
    if (delayedFailure !== null) throw delayedFailure;
  }));

test('one applied-position observation owns duplicate, conflict and successor lifetimes', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader,
      {deadlineAtMs: clock.now() + 30000,
        observationDeadlineAtMs: clock.now() + BOUND.REQUEST_TIMEOUT_MS});
    const gate = deferObservationMembership(leader);
    const timerBaseline = clock.pendingTimerCount();
    const starter = gate.trackSettlement('starter observation',
      sendRegisteredObservation(handler, transport, request));
    let failure = null;
    try {
      await gate.started;
      clock.advance(2000);
      const rawJoin = {...request, release: {...request.release},
        attempt: {...request.attempt}, target: {...request.target}, origin: {...request.origin}};
      const joiner = gate.trackSettlement('joined observation',
        sendRegisteredObservation(handler, transport, rawJoin));
      rawJoin.deadlineAtMs += 1;
      rawJoin.attempt.term += 1;
      rawJoin.target.runtimeGeneration += 1;
      rawJoin.origin.originIndex += 1;
      rawJoin.release.releaseId = 'mutated-after-dispatch';
      assert.equal(gate.reads(), 1, 'matching recipients share one canonical facts read');
      assert.equal(releaseListenerCount(leader), 1);
      assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

      let topAccessorReads = 0;
      const unsafeJoin = {...request};
      Object.defineProperty(unsafeJoin, 'action', {enumerable: true, get() {
        topAccessorReads += 1;
        throw new Error('held join action accessor must not run');
      }});
      const unsafeAnswer = track(sendRegisteredMessage(handler, transport, unsafeJoin));
      await settle();
      assert.equal(unsafeAnswer.settled, true);
      assert.deepEqual(await unsafeAnswer.promise, {
        status: ReplicaOperationResponseStatus.ERROR,
        error: REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(undefined),
        correlationId: 'fixture-participant-release',
      });
      assert.equal(topAccessorReads, 0);

      let coercionReads = 0;
      const boxedDigest = {toJSON() {
        coercionReads += 1;
      }, toString() {
        coercionReads += 1;
        return request.release.targetBuildDigest;
      }, [Symbol.toPrimitive]() {
        coercionReads += 1;
        return request.release.targetBuildDigest;
      }};
      const conflicts = [
        {expected: OUTCOME.INVALID, request: {...request,
          release: {...request.release, targetBuildDigest: boxedDigest}}},
        {expected: OUTCOME.INVALID, request: {...request,
          deadlineAtMs: request.deadlineAtMs + 1}},
        {expected: OUTCOME.STALE, request: {...request,
          deadlineAtMs: request.deadlineAtMs + 1,
          attempt: {...request.attempt, deadlineAtMs: request.deadlineAtMs + 1}}},
        {expected: OUTCOME.STALE, request: {...request,
          origin: {...request.origin, originIndex: request.origin.originIndex + 1}}},
        {expected: OUTCOME.STALE, request: {...request,
          attempt: {...request.attempt, term: request.attempt.term + 1}}},
        {expected: OUTCOME.STALE, request: {...request, target: {...request.target,
          runtimeGeneration: request.target.runtimeGeneration + 1}}},
      ];
      for (const conflict of conflicts) {
        const answer = await promptRegisteredAnswer(gate, 'conflicting observation',
          sendRegisteredObservation(handler, transport, conflict.request));
        assert.equal(answer.outcome, conflict.expected, JSON.stringify(answer));
        assert.equal(answer.partitionId, conflict.request.partitionId);
        assert.equal(answer.phase, conflict.request.action);
        assert.equal(answer.releaseId, conflict.request.release.releaseId);
        assert.equal(releaseListenerCount(leader), 1,
          'a conflict cannot detach the current starter');
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1);
      }
      assert.equal(coercionReads, 0,
        'nested identity scalars are pinned before hashing or serialization');

      clock.advance(BOUND.REQUEST_TIMEOUT_MS - 2000);
      const [starterAnswer, joinerAnswer] = await Promise.all([starter, joiner]);
      assert.deepEqual(joinerAnswer, starterAnswer,
        'a matching joiner settles with the starter without renewing its deadline');
      assert.equal(starterAnswer.missingFact, 'replica_release_reply');
      assert.equal(starterAnswer.reason,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(starterAnswer.partitionId, request.partitionId);
      assert.equal(starterAnswer.phase, request.action);
      assert.equal(starterAnswer.releaseId, request.release.releaseId);
      assert.equal(gate.reads(), 1);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      gate.restore();

      const successorRequest = await currentObservationRequest(handler, leader,
        {deadlineAtMs: clock.now() + 30000});
      const successorGate = deferObservationMembership(leader);
      let successorFailure = null;
      try {
        const successor = successorGate.trackSettlement('successor observation',
          sendRegisteredObservation(handler, transport, successorRequest));
        await successorGate.started;
        assert.equal(successorGate.reads(), 1,
          'the prior starter cleanup cannot remove a fresh successor record');
        assert.equal(releaseListenerCount(leader), 1);
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1);

        gate.release();
        await gate.finished;
        // `finished` owns only the deferred membership method. Exact-source
        // review owns the later facts/observation promise continuations; this
        // assertion does not guess their completion with microtask turns.
        const successorConflict = {...successorRequest,
          origin: {...successorRequest.origin,
            originIndex: successorRequest.origin.originIndex + 1}};
        const conflictAnswer = await sendRegisteredObservation(
          handler, transport, successorConflict);
        assert.equal(conflictAnswer.outcome, OUTCOME.STALE,
          JSON.stringify(conflictAnswer));
        assert.equal(conflictAnswer.partitionId, successorRequest.partitionId);
        assert.equal(conflictAnswer.phase, successorRequest.action);
        assert.equal(conflictAnswer.releaseId, successorRequest.release.releaseId);
        assert.equal(releaseListenerCount(leader), 1,
          'the returned old membership read cannot detach the held successor');
        assert.equal(clock.pendingTimerCount(), timerBaseline + 1,
          'the returned old membership read cannot cancel the successor deadline');

        successorGate.release();
        const successorAnswer = await successor;
        assert.equal(successorAnswer.outcome, OUTCOME.OBSERVED,
          JSON.stringify(successorAnswer));
        assert.equal(successorAnswer.partitionId, successorRequest.partitionId);
        assert.deepEqual(successorAnswer.generation, successorRequest.target);
        assert.equal(releaseListenerCount(leader), 0);
        assert.equal(clock.pendingTimerCount(), timerBaseline);
      } catch (error) {
        successorFailure = error;
      } finally {
        successorFailure = await successorGate.retire(successorFailure,
          'successor assertion and membership custody failed');
      }
      if (successorFailure !== null) throw successorFailure;
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'starter assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));

test('shared ingress refuses unsafe envelopes and facts refuse malformed owner generations', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader);
    const gate = deferObservationMembership(leader);
    const timerBaseline = clock.pendingTimerCount();
    let hostileReads = 0;
    const unsafe = [
      new Proxy({...request}, {get(target, field, receiver) {
        hostileReads += 1;
        return Reflect.get(target, field, receiver);
      }}),
      Object.assign(Object.create({unsafe: true}), request),
      {...request, type: Object(PARTICIPANT_RELEASE_TYPE)},
    ];
    const symbolPayload = {...request};
    symbolPayload[Symbol('unsafe')] = true;
    unsafe.push(symbolPayload);
    for (const field of ['type', 'action', 'replicaId']) {
      const accessor = {...request};
      Object.defineProperty(accessor, field, {enumerable: true, get() {
        hostileReads += 1;
        throw new Error(`${field} accessor must not run`);
      }});
      unsafe.push(accessor);
    }
    for (const payload of unsafe) {
      assert.deepEqual(await sendRegisteredMessage(handler, transport, payload), {
        status: ReplicaOperationResponseStatus.ERROR,
        error: REPLICA_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE(undefined),
        correlationId: 'fixture-participant-release',
      });
    }
    assert.equal(hostileReads, 0);
    assert.equal(gate.reads(), 0);

    const nested = {...request.release};
    Object.defineProperty(nested, 'targetBuildDigest', {enumerable: true, get() {
      hostileReads += 1;
      throw new Error('nested digest accessor must not run');
    }});
    const invalid = [
      {...request, deadlineAtMs: request.deadlineAtMs + 1},
      {...request, action: Object(request.action)},
      {...request, release: nested},
    ];
    let failure = null;
    try {
      for (const payload of invalid) {
        const answer = await sendRegisteredObservation(handler, transport, payload);
        assert.equal(answer.outcome, OUTCOME.INVALID, JSON.stringify(answer));
        assert.equal(answer.releaseId, request.release.releaseId);
      }
      assert.equal(hostileReads, 0);
      assert.equal(gate.reads(), 0);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      const valid = gate.trackSettlement('valid observation after ingress refusals',
        sendRegisteredObservation(handler, transport, request));
      await gate.started;
      gate.release();
      assert.equal((await valid).outcome, OUTCOME.OBSERVED);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'strict ingress assertion and membership custody failed');
    }
    if (failure !== null) throw failure;

    const ownerDescriptor = Object.getOwnPropertyDescriptor(handler, 'ownerIncarnation');
    const currentIncarnation = handler.ownerIncarnation;
    let generationFailure = null;
    try {
      for (const malformed of [undefined, Object(currentIncarnation), 0]) {
        handler.ownerIncarnation = malformed;
        const refused = await readParticipantReleaseFacts(handler, leader);
        assert.equal(refused.outcome, OUTCOME.UNAVAILABLE);
        assert.equal(refused.missingFact, 'current_replica_generation');
      }
    } catch (error) {
      generationFailure = error;
    } finally {
      try {
        Object.defineProperty(handler, 'ownerIncarnation', ownerDescriptor);
      } catch (error) {
        generationFailure = retainFailure(generationFailure, error,
          'generation assertion and owner restoration failed');
      }
    }
    if (generationFailure !== null) throw generationFailure;
    const observed = await readParticipantReleaseFacts(handler, leader);
    assert.equal(observed.outcome, OUTCOME.OBSERVED, JSON.stringify(observed));
    assert.equal(observed.generation.ownerIncarnation, currentIncarnation);
  }));

test('applied-position receiver refuses malformed observation clocks without effects', () =>
  withRegisteredObservationOwner(async ({handler, leader, transport, clock}) => {
    const request = await currentObservationRequest(handler, leader);
    const timerBaseline = clock.pendingTimerCount();
    const missingDeadline = {...request};
    delete missingDeadline.observationDeadlineAtMs;
    assert.equal((await sendRegisteredObservation(handler, transport, missingDeadline)).outcome,
      OUTCOME.INVALID, 'the receiver requires the sender-carried RPC ceiling');
    const invalidDeadlines = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY,
      1.5, -0, Number.MAX_SAFE_INTEGER + 1, '6000', Object(6000)];
    for (const observationDeadlineAtMs of invalidDeadlines) {
      const answer = await sendRegisteredObservation(handler, transport,
        {...request, observationDeadlineAtMs});
      assert.equal(answer.outcome, OUTCOME.INVALID, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.equal(answer.releaseId, request.release.releaseId);
      assert.equal(answer.phase, request.action);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
    }

    const gate = deferObservationMembership(leader);
    const nowDescriptor = Object.getOwnPropertyDescriptor(clock, 'now');
    const registrationNow = clock.now();
    const samples = [registrationNow, registrationNow - 1];
    let timerFailure = null;
    try {
      clock.now = () => -1;
      const refusal = await sendRegisteredObservation(handler, transport, request);
      assert.equal(refusal.outcome, OUTCOME.UNAVAILABLE);
      assert.equal(refusal.missingFact, 'replica_release_reply');
      assert.equal(clock.pendingTimerCount(), timerBaseline);
      clock.now = () => samples.shift() ?? registrationNow - 1;
      const pending = track(gate.trackSettlement('backward timer observation',
        sendRegisteredObservation(handler, transport, request)));
      await gate.started;
      clock.advance(BOUND.REQUEST_TIMEOUT_MS);
      await settle();
      assert.equal(pending.settled, true,
        'an installed timer terminalizes even when its later clock sample steps backward');
      const answer = await pending.promise;
      assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
      assert.equal(answer.missingFact, 'replica_release_reply');
      assert.equal(answer.reason,
        TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT);
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      timerFailure = error;
    } finally {
      try {
        if (nowDescriptor === undefined) delete clock.now;
        else Object.defineProperty(clock, 'now', nowDescriptor);
      } catch (error) {
        timerFailure = retainFailure(timerFailure, error,
          'backward timer assertion and clock restoration failed');
      }
      timerFailure = await gate.retire(timerFailure,
        'backward timer assertion and membership custody failed');
    }
    if (timerFailure !== null) throw timerFailure;

    const originalTimeSource = handler.timeSource;
    const invalidClockSamples = [Number.NaN, Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY, -1, 1.5, -0, Number.MAX_SAFE_INTEGER + 1,
      '6000', new Error('release clock unavailable')];
    for (const sample of invalidClockSamples) {
      let deliveries = 0;
      const originalDeliver = transport.deliver.bind(transport);
      transport.deliver = (...args) => {
        deliveries += 1;
        return originalDeliver(...args);
      };
      handler.timeSource = {now() {
        if (sample instanceof Error) throw sample;
        return sample;
      }};
      try {
        const answer = await askParticipantRelease(handler, handler.nodeId, request);
        assert.equal(answer.outcome, OUTCOME.UNAVAILABLE, JSON.stringify(answer));
        assert.equal(answer.partitionId, request.partitionId);
        assert.equal(answer.phase, request.action);
        assert.equal(answer.releaseId, request.release.releaseId);
        assert.equal(deliveries, 0,
          'an unusable sender clock cannot create an unbounded observation');
        assert.equal(participantReleaseAdmissionOf(leader).state, ADMISSION.CLOSED);
      } finally {
        handler.timeSource = originalTimeSource;
        transport.deliver = originalDeliver;
      }
    }
  }));

test('an applied-progress wake reflected by the first facts read needs no forced reread', () =>
  withRegisteredObservationOwner(async ({handler, leader, proposed, transport, clock}) => {
    const write = track(leader.executeQuery(FIXTURE_SQL, ['fresh-wake', 'applied']));
    const proposal = await awaitProposal(proposed, (entry) => entry.sql === FIXTURE_SQL);
    assert.notEqual(proposal, null);
    const anchoredMembership = await leader.raft.readCommittedMembership(
      {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
    const request = await currentObservationRequest(handler, leader);
    const gate = deferObservationMembership(leader);
    const timerBaseline = clock.pendingTimerCount();
    const observation = gate.trackSettlement('fresh-first-read observation',
      sendRegisteredObservation(handler, transport, request));
    let failure = null;
    try {
      await gate.started;
      leader.controllablePort.commit(proposal);
      assert.equal((await write.promise).success, true);
      leader.controllablePort.emitEvent(RAFT_EVENT.APPLIED_PROGRESS);
      gate.release();
      const answer = await observation;
      assert.equal(answer.outcome, OUTCOME.OBSERVED, JSON.stringify(answer));
      assert.equal(answer.partitionId, request.partitionId);
      assert.deepEqual(answer.generation, request.target);
      const afterApplication = await leader.raft.readCommittedMembership(
        {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
      assert.ok(afterApplication.appliedIndex > anchoredMembership.appliedIndex,
        'the ordinary command advances the application owner position');
      assert.equal(afterApplication.configurationKey,
        anchoredMembership.configurationKey,
        'an ordinary command does not change the current configuration');
      assert.equal(afterApplication.membershipGenerationIndex,
        anchoredMembership.membershipGenerationIndex,
        'an ordinary command does not advance membership generation');
      assert.equal(gate.reads(), 1,
        'a first owner read made after the wake needs no unconditional reread');
      assert.equal(releaseListenerCount(leader), 0);
      assert.equal(clock.pendingTimerCount(), timerBaseline);
    } catch (error) {
      failure = error;
    } finally {
      failure = await gate.retire(failure,
        'fresh-first-read assertion and membership custody failed');
    }
    if (failure !== null) throw failure;
  }));

test('post-ENABLE control loss returns the canonical control refusal and stays paused', () =>
  fixture(async ({service, controlService, transport, release}) => {
    const originalDeliver = transport.deliver.bind(transport);
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
      const response = await originalDeliver(address, payload, options);
      if (payload.action === RELEASE_ACTION.RELEASE &&
          payload.partitionId === CONTROL_PARTITION &&
          response[PARTICIPANT_RELEASE_RESULT_FIELD]?.outcome === OUTCOME.CUT_OVER) {
        successfulControlReleases += 1;
      }
      return response;
    };
    const attempt = release();
    try {
      await observationEntered.promise;
      const enabledOrigin = readPartitionWriteOrigin(service.db);
      assert.notEqual(enabledOrigin, null,
        'the dependent entered observation only after its actual ENABLE origin');
      await controlService.shutdown();
      observationContinuation.resolve();
      const answer = await attempt;
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
    } finally {
      observationContinuation.resolve();
    }
  }));
