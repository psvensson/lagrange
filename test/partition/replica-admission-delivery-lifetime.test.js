import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {setImmediate as turn} from 'node:timers/promises';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {REPLICA_HANDLER_EVENT} from '../../src/node/replica-handler-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from
  '../../src/raft/raft-committed-membership-stamp.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {OPERATION_METADATA_KEY, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
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

async function withAdmissionGroup(t, routerClock) {
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
      partitionId: PARTITION, tableId: TABLE_NAME, tableName: TABLE_NAME,
      schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
      replicaId, replicaIds: [LEADER], nodeId: NODE, transport: router,
      deferElection: true, dbPath: join(directory, `${replicaId}.sqlite`),
      systemTableCache: new SystemTableCache(),
      learnerCatchUpCheckIntervalMs: TEST_TIMEOUT_MS,
      ...options,
    }));
    services.push(service);
    return service;
  };
  const leader = create(LEADER);
  await leader.initialize();
  await leader.raft.campaign();
  assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER);
  const stamp = committedStampOfAnswer(await leader.raft.readCommittedMembership({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}));
  assert.ok(stamp, 'the leader serves its actual committed membership stamp');
  const learner = create(LEARNER, {replicaIds: [LEADER, LEARNER],
    bootstrapMembership: stamp, isJoiningExistingGroup: true});
  await learner.initialize();
  assert.equal(learner.role, RAFT_ROLE.LEARNER);
  return {leader, learner, directory};
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
      createPartitionService: async () => learner,
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
        handler.createPartitionService = async () => service;
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
