import {completePartitionConstructionFixture} from '../test-helpers/replica-handler-identity-fixture.js';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {setImmediate as turn} from 'node:timers/promises';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SERVICE_TYPE, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {REPLICA_HANDLER_EVENT} from '../../src/node/replica-handler-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_EVENT, PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../src/partition/partition-service-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from
  '../../src/raft/raft-committed-membership-stamp.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField, ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {operationRow, routedCreateRequest, sqlOperationsAuthority, targetLifecycle} from
  '../test-helpers/replica-create-admission-recovery-fixture.js';
import {readPartitionWriteOrigin} from '../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME, PARTICIPANT_RELEASE_ACTION as ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD, PARTICIPANT_RELEASE_TRIGGER as TRIGGER} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {deliveryAnswerOf} from '../../src/transport/transport-semantic-outcome.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {withParticipantReleaseProtocol} from '../test-helpers/participant-release-protocol-fixture.js';
import {answerCommittedOperations, committedAddOperation} from
  './committed-operation-gateway-fixture.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {waitForCondition} from './partition-service-test-support.js';

const NODE = 'admission-lifetime-node';
const PARTITION = 'admission-lifetime-p1';
const LEADER = `${PARTITION}-r1`;
const LEARNER = `${PARTITION}-r2`;
const TABLE_NAME = 'admission_lifetime';
const OBSERVATION_BOUND_MS = 10_000;
const TEST_TIMEOUT_MS = 30_000;
const CREATE_BUDGET_MS = 100;
const CRITICAL_PARTITION = 'sql_transactions-p1';

async function withAdmissionGroup(t, routerClock, partitionId = PARTITION) {
  const leaderId = `${partitionId}-r1`;
  const learnerId = `${partitionId}-r2`;
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
  const directory = await mkdtemp(join(tmpdir(), 'admission-lifetime-'));
  const router = new MessageRouter({nodeId: NODE,
    bootIncarnation: TEST_BOOT_INCARNATION, timeSource: routerClock});
  const services = [];
  t.after(async () => {
    try {
      const settled = await Promise.allSettled(services.map((service) =>
        service.shutdown()));
      const errors = settled.filter(({status}) => status === 'rejected')
        .map(({reason}) => reason);
      if (errors.length > 0) throw new AggregateError(errors);
    } finally {
      await router.shutdown();
      await rm(directory, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
  await router.initialize({startServer: false});
  const create = (replicaId, options = {}) => {
    const service = new PartitionService(withFoundingStamp({
      partitionId, tableId: TABLE_NAME, tableName: TABLE_NAME,
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
      replicaId, replicaIds: [leaderId], nodeId: NODE, transport: router,
      deferElection: true, dbPath: join(directory, `${replicaId}.sqlite`),
      systemTableCache: new SystemTableCache(),
      learnerCatchUpCheckIntervalMs: TEST_TIMEOUT_MS,
      ...options,
    }));
    services.push(service);
    return service;
  };
  const leader = create(leaderId);
  await leader.initialize();
  await leader.raft.campaign();
  assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER);
  const stamp = committedStampOfAnswer(await leader.raft.readCommittedMembership({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}));
  assert.ok(stamp, 'the leader serves its actual committed membership stamp');
  const createLearner = (options = {}) => create(learnerId, {
    replicaIds: [leaderId, learnerId], bootstrapMembership: stamp, isJoiningExistingGroup: true,
    ...options,
  });
  const learner = createLearner();
  await learner.initialize();
  assert.equal(learner.role, RAFT_ROLE.LEARNER);
  return {leader, learner, directory, router, createLearner, stamp};
}

function runLearnerCadenceTurn(learner) {
  // Run the callback the existing timer has scheduled while the first
  // delivery is held. The callback, routing, and native decision are real.
  assert.ok(learner.learnerPromotionTimer);
  clearTimeout(learner.learnerPromotionTimer);
  return learner.checkLearnerPromotion();
}

function holdCommittedOperationRead(leader, operation) {
  answerCommittedOperations(leader, [operation]);
  const gateway = leader.controlPlaneSystemTableGateway;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  const release = Promise.withResolvers();
  const reads = [];
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (table === TABLES.REPLICA_OPERATIONS) {
      reads.push(params[0]);
      await release.promise;
    }
    return read(table, sql, params, options);
  };
  return {reads, release: release.resolve};
}

test('initial admission and the learner cadence share one leader decision',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const {leader, learner} = await withAdmissionGroup(t);
    const operation = committedAddOperation(PARTITION, [LEARNER, NODE]);
    const {reads, release} = holdCommittedOperationRead(leader, operation);
    const first = learner.requestReplicaAdmission(operation.operation_id);
    let cadence;
    let concurrentReads;
    try {
      assert.equal(await waitForCondition(() => reads.length > 0,
        OBSERVATION_BOUND_MS), true, 'the registered leader received the first request');
      assert.equal(leader.raft.readStatus().peers.some(({replicaIdentity}) =>
        replicaIdentity === LEARNER), false, 'the first operation read is still held');
      cadence = runLearnerCadenceTurn(learner);
      await turn();
      concurrentReads = reads.length;
    } finally {
      release();
      await Promise.all([first, cadence]);
    }
    assert.ok(['proposed', 'in_flight', 'already_member']
      .includes((await first).lastOutcome), 'the real native admission was engaged');
    assert.equal(await waitForCondition(() => leader.raft.readStatus().peers.some(
      ({replicaIdentity}) => replicaIdentity === LEARNER),
    OBSERVATION_BOUND_MS), true, 'the genuine admission reaches native membership');
    assert.equal(concurrentReads, 1,
      'the existing cadence must join the held admission delivery');
    assert.deepEqual(reads, [operation.operation_id],
      'only the held logical request reaches the leader operation read');
  });

test('learner shutdown detaches its admission delivery before the leader settles',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const {leader, learner} = await withAdmissionGroup(t);
    const operation = committedAddOperation(PARTITION, [LEARNER, NODE]);
    const {reads, release} = holdCommittedOperationRead(leader, operation);
    let settled = false;
    const first = learner.requestReplicaAdmission(operation.operation_id)
      .then((request) => {
        settled = true;
        return request;
      });
    const original = learner.replicaAdmissionRequest;
    try {
      assert.equal(await waitForCondition(() => reads.length > 0,
        OBSERVATION_BOUND_MS), true, 'the first request is inside the leader handler');
      await learner.shutdown();
      await turn();
      assert.equal(settled, true, 'shutdown releases the target delivery wait');
      assert.equal(original.lastOutcome, null, 'the stopped request receives no late outcome');
    } finally {
      release();
      await first;
    }
    assert.equal(await waitForCondition(() => leader.raft.readStatus().peers.some(
      ({replicaIdentity}) => replicaIdentity === LEARNER),
    OBSERVATION_BOUND_MS), true, 'the leader retains custody of its native decision');
    assert.equal(original.lastOutcome, null);
  });

test('the first real admission delivery cannot renew the original CREATE budget',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    // The CREATE clock advances while the independent transport clock and
    // the actual leader's operation read stay held.
    const routerClock = new VirtualTimeSource();
    const createClock = new VirtualTimeSource();
    const {leader, learner, directory} = await withAdmissionGroup(t, routerClock);
    const operation = committedAddOperation(PARTITION, [LEARNER, NODE]);
    const {reads, release} = holdCommittedOperationRead(leader, operation);
    const handler = new ReplicaHandler({
      nodeId: NODE, ownerIncarnation: TEST_BOOT_INCARNATION, dataDir: directory,
      systemTableCache: new SystemTableCache(), cdcIntegrationService: {},
      replicaStateMachine: {},
      createPartitionService: async (options) =>
        completePartitionConstructionFixture(learner, options),
      timeSource: createClock,
    });
    t.after(() => handler.shutdown());
    handler.syncTimeoutMs = CREATE_BUDGET_MS;
    // Bound the fixture to the CREATE caller and admission delivery. Capture
    // existing lifecycle requests at their persistence boundary.
    const writes = [];
    handler.persistReplicaCreateInitialStatus = async () => true;
    handler.resolveReplicaContextWithRetry = async () => ({
      tableId: TABLE_NAME, tableName: TABLE_NAME, existingReplicaCount: 1,
      replicaIds: [LEADER, LEARNER], bootstrapMembership: learner.bootstrapMembership,
    });
    handler.persistReplicaStatusWithRetry = async (_replicaId, status) => {
      writes.push(status);
    };
    let cleanupClaim = null;
    handler.persistOrConfirmReplicaCreateFailed = async ({claimCleanup}) => {
      cleanupClaim = claimCleanup;
      return true;
    };
    const request = {operationId: operation.operation_id,
      partitionId: PARTITION, replicaId: LEARNER};
    handler.trackReplicaCreateOperation(request.operationId, PARTITION, LEARNER, TABLE_NAME);
    createClock.advance(CREATE_BUDGET_MS / 2);
    let outcome;
    const result = handler.createReplicaAsync(request).then(() => {
      outcome = {created: true};
    }, (error) => {
      outcome = {error};
    });
    try {
      assert.equal(await waitForCondition(() => reads.length > 0,
        OBSERVATION_BOUND_MS), true, 'the first delivery engages its registered recipient');
      assert.deepEqual(writes, [ReplicaStatus.SYNCING]);
      createClock.advance(CREATE_BUDGET_MS / 2);
      assert.equal(await waitForCondition(() => outcome !== undefined,
        OBSERVATION_BOUND_MS), true, 'CREATE settles while the first reply is still held');
      assert.match(outcome.error?.message ?? '', /deadline_exceeded/);
      assert.equal(cleanupClaim, true, 'possibly committed admission retains cleanup custody');
      assert.deepEqual(writes, [ReplicaStatus.SYNCING], 'CREATE does not publish ACTIVE');
    } finally {
      release();
      await result;
    }
    assert.equal(await waitForCondition(() => leader.raft.readStatus().peers.some(
      ({replicaIdentity}) => replicaIdentity === LEARNER),
    OBSERVATION_BOUND_MS), true, 'the answering leader still owns any native effect');
  });

function createMaterializedJoinAuthority(stamp, ownerIncarnation, partitionId = PARTITION) {
  const leaderId = `${partitionId}-r1`;
  const replicaId = `${partitionId}-r2`;
  const {operation_id: operationId} = committedAddOperation(partitionId, [replicaId, NODE]);
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId, replicaId, targetNodeId: NODE, workflowUpdatedAt: 11,
  });
  const row = operationRow({
    ...committedAddOperation(partitionId, [replicaId, NODE]),
    type: partitionId === CRITICAL_PARTITION ? OperationType.REPLACE : OperationType.ADD,
    source_node_id: NODE,
    create_admission_token: admissionToken,
    create_admission_attempt_token: buildReplicaCreateAttemptToken(admissionToken, 1),
    create_admission_owner_incarnation: TEST_BOOT_INCARNATION,
    steps_history: JSON.stringify([{
      [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: stamp,
    }]),
  });
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: TABLE_NAME, table_name: TABLE_NAME,
    schema_definition: JSON.stringify({
      columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
    }),
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: partitionId, table_id: TABLE_NAME, leader_node_id: NODE,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    service_id: leaderId, service_type: SERVICE_TYPE.PARTITION, replica_id: leaderId,
    partition_id: partitionId, node_id: NODE, status: ReplicaStatus.ACTIVE,
    raft_role: RAFT_ROLE.LEADER, address: `${NODE}/partition/${leaderId}`,
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT',
    targetLifecycle(row, {status: ReplicaStatus.SYNCING}));
  return {row, cache, authority: sqlOperationsAuthority(cache, [row], ownerIncarnation)};
}

function readAdmittedLifecycle(authority, replicaId = LEARNER) {
  return authority.lifecycleStore.durableRow(TABLES.SERVICES, replicaId);
}

function copyAdmissionProjection(source) {
  const cache = new SystemTableCache();
  for (const [table, rows] of Object.entries(source.getAllData())) {
    for (const row of rows) cache.applySystemTableChange(table, 'INSERT', row);
  }
  return cache;
}

async function observeCriticalServicePublication(rig, shutdown) {
  const {replicaId, cache, authority, handler, learner, outcomes} = rig;
  const projected = cache.get(TABLES.SERVICES, replicaId);
  assert.equal(projected.address, null);
  const nextAt = projected.updated_at + 1;
  const current = readAdmittedLifecycle(authority, replicaId);
  assert.equal(current.status, ReplicaStatus.SYNCING);
  const notifications = [];
  const consensus = [];
  const collectConsensus = (event) => consensus.push(event);
  learner.on(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, collectConsensus);
  const collect = (table, _action, row) => {
    if (table === TABLES.SERVICES) notifications.push(row);
  };
  cache.onCacheChange(collect);
  const publish = async (row) => {
    cache.applySystemTableChange(TABLES.SERVICES, 'UPSERT', row);
    await turn();
    assert.ok(notifications.some((observed) =>
      observed.service_id === row.service_id &&
      observed.updated_at === row.updated_at), 'real cache owner published the accepted change');
  };
  try {
    const wrongKey = `${replicaId}-other`;
    await publish({...current, service_id: wrongKey, replica_id: wrongKey});
    await publish({...current, create_attempt_token: 'old-attempt', updated_at: nextAt});
    assert.equal(cache.get(TABLES.SERVICES, replicaId).create_attempt_token, 'old-attempt');
    assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'unrelated and superseded SERVICES rows cannot wake this REPLACE');
    const addressless = {...current, address: null,
      updated_at: nextAt + 1};
    await publish(addressless);
    assert.equal(cache.get(TABLES.SERVICES, replicaId).address, null);
    assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'the same generation without a route is still waiting');
    const foreignAddress = `${learner.unifiedAddress}-retired`;
    await publish({...current, address: foreignAddress, updated_at: nextAt + 2});
    assert.equal(cache.get(TABLES.SERVICES, replicaId).address, foreignAddress);
    assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
      'a nonempty address from another route cannot wake the parked voter');
    assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING]);
    const matching = {...current, address: learner.unifiedAddress,
      updated_at: nextAt + 3};
    if (shutdown) {
      cache.applySystemTableChange(TABLES.SERVICES, 'UPSERT', matching);
      await handler.shutdown();
      await publish({...matching, updated_at: matching.updated_at + 1});
      assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING]);
      assert.equal(readAdmittedLifecycle(authority, replicaId).status, ReplicaStatus.SYNCING);
      assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null);
      assert.equal(learner.isShutdown, true);
      return;
    }
    const previousRecovery = handler.replicaCreateAdmissionRecoveryTask;
    await publish(matching);
    assert.equal(await waitForCondition(() =>
      handler.replicaCreateAdmissionRecoveryRearmOwner.current() ||
      handler.replicaCreateAdmissionRecoveryTask !== previousRecovery,
    OBSERVATION_BOUND_MS), true, 'the exact CDC publication wakes the stationary voter');
    assert.deepEqual(consensus, [], 'the group emits no new consensus evidence during publication');
  } finally {
    cache.offCacheChange(collect);
    learner.off(PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED, collectConsensus);
  }
}

for (const treatment of [
  {name: 'same boot with held initial delivery'},
  {name: 'reconstruction with held initial delivery', rejoin: true},
  {name: 'learner readiness waits after a deferred delivery', readiness: true},
  {name: 'native work is fenced during shutdown', shutdown: true},
  {name: 'budget expires before the first delivery', beforeDelivery: true},
  {name: 'critical REPLACE observes the exact SERVICES route last', cacheLast: true},
  {name: 'queued SERVICES publication after shutdown', cacheLast: true, lateCache: true},
  {name: 'wrong SERVICES attempt before expiry', cacheLast: true, earlyCache: 'wrong'},
  {name: 'exact SERVICES attempt before expiry', cacheLast: true, earlyCache: 'exact'},
]) {
  test(`materialized native CREATE retains its learner at expiry: ${treatment.name}`,
    {timeout: TEST_TIMEOUT_MS}, async (t) => {
      const createClock = new VirtualTimeSource({startMs: 1000});
      const partitionId = treatment.cacheLast ? CRITICAL_PARTITION : PARTITION;
      const replicaId = `${partitionId}-r2`;
      const {leader, learner: previous, directory, router, createLearner, stamp} =
        await withAdmissionGroup(t, new VirtualTimeSource(), partitionId);
      await previous.shutdown();
      const ownerIncarnation = treatment.rejoin ? TEST_BOOT_INCARNATION + 1 : TEST_BOOT_INCARNATION;
      const {row, cache: source, authority} =
        createMaterializedJoinAuthority(stamp, ownerIncarnation, partitionId);
      const cache = treatment.cacheLast ? copyAdmissionProjection(source) : source;
      const replicaStateMachine = new ReplicaStateMachine({nodeId: NODE, ownerIncarnation,
        cdcIntegrationService: {}, controlPlaneSystemTableGateway: authority.gateway,
        systemTableCache: cache, timeSource: createClock});
      const outcomes = [];
      let opened = 0;
      let learner;
      const handler = new ReplicaHandler({nodeId: NODE, ownerIncarnation, dataDir: directory,
        replicaStateMachine, systemTableCache: cache, cdcIntegrationService: {},
        controlPlaneSystemTableGateway: authority.gateway, timeSource: createClock,
        executorOutcomeEmitter: {emitOutcome: (_type, _id, step) => outcomes.push(step)},
        createPartitionService: async (options) => {
          opened += 1;
          assert.equal(options.identityExisted, true);
          if (treatment.cacheLast) {
            const projected = cache.get(TABLES.SERVICES, replicaId);
            assert.equal(projected.status, ReplicaStatus.SYNCING);
            cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
              ...projected, address: null, updated_at: projected.updated_at + 1,
            });
          }
          learner = createLearner({...options, dbPath: previous.dbPath,
            systemTableCache: cache, replicaStateMachine,
            // Use the placement-enabled membership relay to project only
            // the actual committed native voter into the service role.
            ...(treatment.cacheLast ? {rebalanceCoordinator: {placementAdmissionEnabled: true}} :
              {}),
          });
          completePartitionConstructionFixture(learner, options);
          await learner.initialize();
          assert.equal(router.getRegisteredHandler(learner.unifiedAddress),
            learner.transportHandler);
          assert.equal(learner.resolveHandlerRetirementLane(), replicaStateMachine);
          if (treatment.beforeDelivery) createClock.advance(CREATE_BUDGET_MS);
          return learner;
        },
      });
      handler.registerWithRouter(router);
      handler.syncTimeoutMs = CREATE_BUDGET_MS;
      const held = Promise.withResolvers();
      const reply = Promise.withResolvers();
      const voterChecks = [];
      if (treatment.earlyCache) {
        const deliver = router.deliver.bind(router);
        router.deliver = async (address, payload, options) => {
          const result = await deliver(address, payload, options);
          if (payload?.type === PARTITION_SERVICE_MESSAGE_TYPE.ADMIT_REPLICA) await reply.promise;
          return result;
        };
        const check = handler.isReplicaVoterReady.bind(handler);
        handler.isReplicaVoterReady = (...args) => {
          const ready = check(...args);
          voterChecks.push(ready);
          return ready;
        };
      }
      let leaderReads = 0;
      const gateway = leader.controlPlaneSystemTableGateway;
      const read = gateway.readAuthoritativeRows.bind(gateway);
      gateway.readAuthoritativeRows = async (table, stmt, params, options) => {
        if (table !== TABLES.REPLICA_OPERATIONS) return read(table, stmt, params, options);
        const operation = authority.read(params[0]);
        assert.equal(operation?.operation_id, row.operation_id);
        assert.equal(operation.create_admission_owner_incarnation, ownerIncarnation);
        assert.equal(operation.create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
        leaderReads += 1;
        if (treatment.readiness && leaderReads === 1) {
          return {success: false, error: 'leader operation authority unavailable'};
        }
        await held.promise;
        return {success: true, rows: [operation]};
      };
      let worker;
      try {
        if (treatment.rejoin) {
          handler.initialize();
          await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
        } else {
          const response = await handler.handleCreateReplica({...routedCreateRequest(row),
            [ReplicaOperationField.OPERATION_TYPE]: row.type,
            [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: stamp});
          if (treatment.cacheLast) {
            assert.notEqual(response.status, ReplicaOperationResponseStatus.ERROR,
              JSON.stringify(response));
          }
        }
        if (treatment.beforeDelivery) {
          assert.equal(await waitForCondition(() =>
            opened > 0 && handler.operationTasks.size === 0, OBSERVATION_BOUND_MS), true,
          'the attached CREATE stops before beginning its native delivery');
          assert.equal(leaderReads, 0);
        } else {
          assert.equal(await waitForCondition(() => leaderReads > 0, OBSERVATION_BOUND_MS), true,
            `the real leader operation read engaged: ${JSON.stringify(outcomes)}`);
        }
        if (treatment.readiness) {
          assert.equal(await waitForCondition(() =>
            learner.replicaAdmissionRequest?.lastOutcome === 'authority_unavailable',
          OBSERVATION_BOUND_MS), true, 'actual leader replies unavailable within the original wait');
          assert.equal(learner.replicaAdmissionRequest.state, 'pending');
          assert.ok(learner.learnerPromotionTimer, 'the existing learner cadence owns the retry');
        }
        if (treatment.cacheLast) {
          held.resolve();
          const voterEstablished = await waitForCondition(() =>
            learner.getRole() === RAFT_ROLE.FOLLOWER &&
            learner.raft.readStatus().memberRole === 'voter', OBSERVATION_BOUND_MS);
          assert.equal(voterEstablished, true, JSON.stringify({
            actor: 'real target before SERVICES arrives', role: learner.getRole(),
            memberRole: learner.raft.readStatus().memberRole,
            leader: learner.raft.readStatus().leaderAddress,
            outcome: learner.replicaAdmissionRequest?.lastOutcome,
          }));
          assert.equal(cache.get(TABLES.SERVICES, replicaId).address, null,
            'the actual CDC projection is still missing its usable address');
        }
        assert.equal(opened, 1);
        assert.equal(handler.getTrackedService(replicaId), learner);
        const tracker = handler.inProgressOperations.get(row.operation_id);
        const owner = handler.getReplicaCreateAdmissionOwner();
        const claim = owner.activePhysicalWorkerOperationIds.get(row.operation_id);
        assert.ok(tracker && claim);
        worker = Promise.all([...handler.operationTasks]);
        if (treatment.earlyCache) {
          const current = readAdmittedLifecycle(authority, replicaId);
          const exact = treatment.earlyCache === 'exact';
          const projected = cache.get(TABLES.SERVICES, replicaId);
          const expectedAttempt = exact ? current.create_attempt_token : 'another-attempt';
          cache.applySystemTableChange(TABLES.SERVICES, 'UPSERT', {
            ...current, create_attempt_token: expectedAttempt, updated_at: projected.updated_at + 1,
          });
          assert.equal(cache.get(TABLES.SERVICES, replicaId).create_attempt_token, expectedAttempt);
          reply.resolve();
          assert.equal(await waitForCondition(() => voterChecks.length > 0,
            OBSERVATION_BOUND_MS), true, 'the original live voter gate consumes the published row');
          assert.deepEqual(voterChecks, [exact], 'only the original CREATE attempt can be ready');
          if (exact) {
            await worker;
            assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
            assert.equal(readAdmittedLifecycle(authority, replicaId).status, ReplicaStatus.ACTIVE);
            assert.equal(handler.getTrackedService(replicaId), learner);
            return;
          }
        }
        if (!treatment.beforeDelivery) createClock.advance(CREATE_BUDGET_MS);
        assert.equal(await waitForCondition(() =>
          handler.operationTasks.size === 0, OBSERVATION_BOUND_MS), true,
        'the original CREATE task settles before the held request returns');
        assert.equal(readAdmittedLifecycle(authority, replicaId).status, ReplicaStatus.SYNCING,
          'an expired observation cannot terminally fail the materialized SERVICES identity');
        assert.equal(readAdmittedLifecycle(authority, replicaId).cleanup_token, null);
        assert.equal(authority.read(row.operation_id).create_admission_state,
          CREATE_ADMISSION_STATE.MATERIALIZED);
        assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING]);
        assert.equal(handler.getTrackedService(replicaId), learner);
        assert.equal(handler.inProgressOperations.get(row.operation_id), tracker);
        assert.equal(owner.ownsPhysicalWorker(claim), true);
        assert.equal(learner.db.open, true);
        if (treatment.shutdown) {
          await handler.shutdown();
          held.resolve();
          assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING]);
          assert.equal(owner.ownsPhysicalWorker(claim), false);
          assert.equal(learner.isShutdown, true);
          assert.equal(readAdmittedLifecycle(authority, replicaId).status, ReplicaStatus.SYNCING);
          return;
        }
        if (treatment.readiness) {
          assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
            'the spent readiness wait parks without a rearm loop');
        }
        if (treatment.earlyCache) {
          assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null);
          return;
        }
        if (treatment.cacheLast) {
          await observeCriticalServicePublication(
            {replicaId, cache, authority, handler, learner, outcomes}, treatment.lateCache);
          if (treatment.lateCache) return;
        }
        const previousRecovery = handler.replicaCreateAdmissionRecoveryTask;
        if (treatment.beforeDelivery) {
          assert.ok(handler.replicaCreateAdmissionRecoveryRearmOwner.current(),
            'undelivered admission is owed to the existing rearm owner');
        }
        held.resolve();
        const cadence = treatment.readiness ? runLearnerCadenceTurn(learner) : null;
        assert.equal(await waitForCondition(() => leader.raft.readStatus().peers.some(
          ({replicaIdentity}) => replicaIdentity === replicaId),
        OBSERVATION_BOUND_MS), true, 'the delayed real answer changes native membership');
        await cadence;
        assert.equal(await waitForCondition(() =>
          Boolean(learner.raft.readStatus().leaderAddress), OBSERVATION_BOUND_MS), true,
        'the exact retained runtime observes its native group leader');
        if (!treatment.cacheLast) {
          assert.equal(await waitForCondition(() =>
            handler.replicaCreateAdmissionRecoveryRearmOwner.current() ||
            handler.replicaCreateAdmissionRecoveryTask !== previousRecovery,
          OBSERVATION_BOUND_MS), true,
          'the real delivery or committed consensus observation wakes recovery');
        }
        assert.equal(await waitForCondition(() => {
          const lifecycle = readAdmittedLifecycle(authority, replicaId);
          if (lifecycle.status === ReplicaStatus.ACTIVE) return true;
          createClock.advance(10);
          return false;
        }, OBSERVATION_BOUND_MS), true,
        'the existing recovery owner finishes the live learner');
        await handler.replicaCreateAdmissionRecoveryTask;
        assert.equal(leaderReads, treatment.readiness ? 2 : 1,
          'the existing recovery owner neither duplicates nor restarts the admission request');
        assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
        assert.equal(opened, 1);
        assert.equal(handler.getTrackedService(replicaId), learner);
        assert.equal(owner.ownsPhysicalWorker(claim), false);
      } finally {
        held.resolve();
        reply.resolve();
        createClock.advance(CREATE_BUDGET_MS);
        await worker;
        await handler.shutdown();
        authority.close();
      }
    });
}

for (const replace of [false, true]) {
  for (const refuseRelease of [false, true]) {
    test(`held native participant release ${refuseRelease ? 'refuses' : 'settles'} with ` +
      `${replace ? 'a successor' : 'the same CREATE'} in custody`,
    {timeout: TEST_TIMEOUT_MS}, async (t) => {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
      ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
      LoggingService.getInstance().initialize({level: 'error'});
      t.after(() => {
        ConfigurationManager.resetInstance();
        LoggingService.resetInstance();
      });
      await withParticipantReleaseProtocol(async ({
        handler, service, controlService, transport, build,
      }) => {
        const control = await handler.participantReleaseRecovery.releaseOperator({
          partitionId: controlService.partitionId, targetBuildDigest: build.digest,
          deadlineAtMs: handler.timeSource.now() + OBSERVATION_BOUND_MS,
        });
        assert.equal(control.outcome, OUTCOME.CUT_OVER);
        assert.equal(readPartitionWriteOrigin(service.db), null);
        const {nodeId, replicaId, partitionId, tableName} = service;
        const operationId = 'founding-create-release';
        const evidence = {operationId, replicaId, partitionId, targetNodeId: nodeId,
          admissionToken: 'admission', attemptToken: 'old-attempt', attemptSeq: 1,
          replicaCreatedAt: 1000};
        const row = {...committedAddOperation(partitionId, [replicaId, nodeId]),
          operation_id: operationId, create_admission_state: 'MATERIALIZED',
          create_admission_token: evidence.admissionToken,
          create_admission_attempt_token: evidence.attemptToken,
          create_admission_attempt_seq: evidence.attemptSeq,
          create_admission_replica_created_at: evidence.replicaCreatedAt,
          steps_history: refuseRelease ? [] :
            [{[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: service.bootstrapMembership}]};

        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        const deliver = transport.deliver.bind(transport);
        transport.deliver = async (address, payload, options) => {
          const delivered = await deliver(address, payload, options);
          if (payload.action === ACTION.RELEASE && payload.trigger === TRIGGER.FRESH_CREATE) {
            entered.resolve(deliveryAnswerOf(delivered)?.[PARTICIPANT_RELEASE_RESULT_FIELD]);
            await release.promise;
          }
          return delivered;
        };
        const outcomes = [];
        const events = [];
        const writes = [];
        const releases = [];
        const originalClaim = Object.freeze({});
        const successorClaim = Object.freeze({});
        let claim = originalClaim;
        handler.executorOutcomeEmitter = {emitOutcome: (_type, _id, step) => outcomes.push(step)};
        handler.on(REPLICA_HANDLER_EVENT.CREATED, () => events.push(ReplicaStatus.ACTIVE));
        handler.on(REPLICA_HANDLER_EVENT.CREATION_FAILED, () => events.push(ReplicaStatus.FAILED));
        handler.replicaCreateAdmissionOwner = {
          readOperation: async () => row,
          ownsPhysicalWorker: (candidate) => claim === candidate,
          revalidatePhysicalWorker: async (candidate) => claim === candidate,
          releasePhysicalWorker: (candidate) => {
            releases.push(candidate);
            if (claim === candidate) claim = null;
          },
          markProgress: async (current) => current,
        };
        // CREATE, the release client, registered responder, and native cutover
        // run normally. Supply the founding row and observe lifecycle writes at
        // the external ledger boundary, which this fixture does not host.
        handler.createPartitionService = async (options) =>
          completePartitionConstructionFixture(service, options);
        handler.replicaStateMachine = {};
        handler.localServices.delete(replicaId);
        handler.persistReplicaCreateInitialStatus = async () => true;
        handler.resolveReplicaContextWithRetry = async () => ({
          tableId: tableName, tableName, existingReplicaCount: 0,
          replicaIds: [replicaId], bootstrapMembership: service.bootstrapMembership,
        });
        handler.persistReplicaStatusWithRetry = async (_replicaId, status) => {
          writes.push(status);
        };
        handler.persistOrConfirmReplicaCreateFailed = async ({claimCleanup}) => {
          assert.equal(claimCleanup, true);
          writes.push(ReplicaStatus.FAILED);
          return true;
        };
        handler.trackReplicaCreateOperation(operationId, partitionId, replicaId, tableName);
        const execution = handler.createReplicaAsync({
          operationId, partitionId, replicaId, createAdmissionEvidence: evidence,
          createPhysicalWorkerClaim: originalClaim,
        }).then(() => null, (error) => error);
        const successorService = {shutdown: async () => {
          assert.fail('the obsolete worker must not close the successor service');
        }};
        try {
          const reply = await Promise.race([
            entered.promise,
            execution.then((answer) => {
              throw new Error('CREATE left before the held participant release', {cause: answer});
            }),
          ]);
          assert.equal(reply?.outcome, refuseRelease ? OUTCOME.OPERATOR_REQUIRED : OUTCOME.CUT_OVER,
            JSON.stringify(reply));
          assert.equal(readPartitionWriteOrigin(service.db) === null, refuseRelease,
            'the actual native release either committed its origin or refused without effect');
          let successorTracker;
          let successorProgress;
          let successorReplica;
          if (replace) {
            claim = successorClaim;
            handler.trackReplicaCreateOperation(operationId, partitionId, replicaId, tableName);
            successorTracker = handler.inProgressOperations.get(operationId);
            successorProgress = handler.startReplicaCreationProgress({
              partitionId, replicaId, peerTotal: 0,
            });
            handler.localServices.set(replicaId, successorService);
            successorReplica = handler.setLocalReplica(replicaId, {
              partitionId, service: successorService,
              createAttemptToken: 'successor-attempt', status: ReplicaStatus.SYNCING,
            });
          }
          release.resolve();
          const answer = await execution;
          if (replace) {
            assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING],
              'a superseded CREATE emits neither ACTIVE nor FAILED');
            assert.deepEqual(writes, [ReplicaStatus.SYNCING],
              'a superseded CREATE initiates no terminal write');
            assert.deepEqual(events, []);
            assert.equal(handler.localServices.get(replicaId), successorService);
            assert.equal(handler.localReplicas.get(replicaId), successorReplica);
            assert.equal(handler.inProgressOperations.get(operationId), successorTracker);
            assert.equal(handler.creationProgressByReplica.get(replicaId), successorProgress);
            assert.equal(claim, successorClaim);
            assert.equal(service.isShutdown, true, 'the old native service is retired');
          } else {
            const terminal = refuseRelease ? ReplicaStatus.FAILED : ReplicaStatus.ACTIVE;
            if (refuseRelease) {
              assert.match(answer?.message ?? '', /Fresh replica participant release failed/);
            } else {
              assert.equal(answer, null);
            }
            assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING,
              refuseRelease ? WORKFLOW_STEP.FAILED : WORKFLOW_STEP.ACTIVE]);
            assert.deepEqual(writes, [ReplicaStatus.SYNCING, terminal]);
            assert.deepEqual(events, [terminal]);
            assert.equal(handler.inProgressOperations.has(operationId), false);
            assert.equal(handler.creationProgressByReplica.has(replicaId), false);
            assert.equal(claim, null);
          }
          assert.deepEqual(releases, [originalClaim], 'only the old worker claim is released');
        } finally {
          release.resolve();
          await execution;
          transport.deliver = deliver;
          if (handler.localServices.get(replicaId) === successorService) {
            handler.localServices.delete(replicaId);
          }
          if (handler.localReplicas.get(replicaId)?.service === successorService) {
            handler.localReplicas.delete(replicaId);
          }
        }
      });
    });
  }
}
