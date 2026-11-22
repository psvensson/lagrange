import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {DISPATCH_EVENT} from '../../src/control-plane/replica-dispatch-service-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OPERATION_RECONCILE_OUTCOME} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createReplaceWitness} from './replace-witness-fixture.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  createCoordinatorSqlStore,
  createMockCache,
  createMockControlPlaneSystemTableGateway,
  createTestCoordinator,
  installActualReplicaObservationResolver,
} from './test-helpers.js';

function createCriticalReplaceCreateReplay({
  answerCreateReplay = async () => ReplicaOperationResponseStatus.COMPLETED,
  answerRemove = {status: ReplicaOperationResponseStatus.INITIATED},
  witness,
  observedTargetStatus = null,
  makeCoordinator = createTestCoordinator,
} = {}) {
  const PARTITION_ID = 'nodes-p1';
  const SOURCE_NODE_ID = 'node-a';
  const TARGET_NODE_ID = 'node-d';
  const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
  const deliveries = [];
  let createDispatchCount = 0;
  const messageRouter = {
    async deliver(target, payload) {
      const witnessAnswer = witness?.deliveryFor(payload);
      if (witnessAnswer) return witnessAnswer;
      deliveries.push({target, payload});
      if (payload?.type ===
          ReplicaOperationMessageType.CREATE_REPLICA) {
        createDispatchCount += 1;
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: createDispatchCount === 1 ?
            ReplicaOperationResponseStatus.INITIATED :
            await answerCreateReplay(payload),
        });
      }
      return buildDeliveryEnvelope({acknowledged: true}, answerRemove);
    },
    getConnectionState: () => 'connected',
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };

  const coordinator = makeCoordinator({
    nodeId: TARGET_NODE_ID,
    enableTimeouts: false,
    replaceWitness: !witness,
    messageRouter,
    cacheData: {
      nodes: [SOURCE_NODE_ID, 'node-b', 'node-c', TARGET_NODE_ID].map(
        (nodeId) => ({
          node_id: nodeId,
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: Date.now() + 60_000,
        }),
      ),
      services: [
        {
          service_id: SOURCE_REPLICA_ID,
          replica_id: SOURCE_REPLICA_ID,
          service_type: 'partition',
          partition_id: PARTITION_ID,
          node_id: SOURCE_NODE_ID,
          status: 'active',
          address: `${SOURCE_NODE_ID}/partition/${SOURCE_REPLICA_ID}`,
        },
        {
          service_id: `${PARTITION_ID}-r2`,
          replica_id: `${PARTITION_ID}-r2`,
          service_type: 'partition',
          partition_id: PARTITION_ID,
          node_id: 'node-b',
          status: 'active',
          raft_role: 'follower',
          address: `node-b/partition/${PARTITION_ID}-r2`,
        },
        {
          service_id: `${PARTITION_ID}-r3`,
          replica_id: `${PARTITION_ID}-r3`,
          service_type: 'partition',
          partition_id: PARTITION_ID,
          node_id: 'node-c',
          status: 'active',
          raft_role: 'follower',
          address: `node-c/partition/${PARTITION_ID}-r3`,
        },
      ],
    },
  });
  coordinator.initialize();
  coordinator.isPlacementAdmissionManagedEntityType = () => false;
  installActualReplicaObservationResolver(coordinator, observedTargetStatus);

  const create = () => coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: TARGET_NODE_ID,
    sourceNodeId: SOURCE_NODE_ID,
    replicaId: SOURCE_REPLICA_ID,
  });
  return {coordinator, create, deliveries, sourceReplicaId: SOURCE_REPLICA_ID};
}

function observeCommittedSteps(coordinator, operationId) {
  const writes = [];
  const persist = coordinator.repository.persistOperationUpdate.bind(coordinator.repository);
  coordinator.repository.persistOperationUpdate = async (candidate, options) => {
    const outcome = await persist(candidate, options);
    if (candidate.operationId === operationId &&
        outcome.disposition === REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED) {
      writes.push({
        expectedStep: options?.expectedWorkflowStep,
        committedStep: outcome.operation.workflowStep,
      });
    }
    return outcome;
  };
  return writes;
}

export async function registerReplaceReplicaWorkflowCreateReplayTests(t) {
  await t.test(
    'RebalanceCoordinator re-arms critical REPLACE create dispatch from ' +
      'CREATING when visibility stays empty',
    async (t) => {
      const {coordinator, create, deliveries, sourceReplicaId} =
        createCriticalReplaceCreateReplay();
      try {
        const operation = await create();

        await coordinator.executeOperation(operation);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'initial replacement dispatch should move the operation into CREATING',
        );

        const persistedBeforeReconcile = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(persistedBeforeReconcile.workflowStep, WORKFLOW_STEP.CREATING,
          'the authoritative preimage is still CREATING');
        const writes = observeCommittedSteps(coordinator, operation.operationId);

        const dispatchResults = new Map();
        const owner = coordinator.workflowOwner;
        const execute = owner.executeOperationFromReconcilePath.bind(owner);
        owner.executeOperationFromReconcilePath = async (current) => {
          const entryStep = current.workflowStep;
          const result = await execute(current);
          if (current.operationId === operation.operationId) {
            dispatchResults.set(entryStep, result);
          }
          return result;
        };

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);
        const persistedAfterReconcile = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);

        t.same(writes, [
          {expectedStep: WORKFLOW_STEP.CREATING, committedStep: WORKFLOW_STEP.ACTIVE},
          {expectedStep: WORKFLOW_STEP.ACTIVE, committedStep: WORKFLOW_STEP.STOPPING},
        ], 'the reconcile attempt committed both exact workflow CAS updates');
        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'reconciliation reports its committed progress while source retirement remains pending',
        );
        t.equal(operation.workflowStep, WORKFLOW_STEP.CREATING,
          'the caller still holds its original CREATING mirror');
        t.equal(dispatchResults.get(WORKFLOW_STEP.CREATING)?.reconcileOutcome,
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'the CREATE result carries the dispatch owner’s committed progress');
        t.equal(
          deliveries.length,
          3,
          're-armed create dispatch should continue into source removal',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          ReplicaOperationMessageType.CREATE_REPLICA,
          'reconciliation should replay the replacement create phase',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          operation.replicaId,
          'the replayed create should preserve the canonical target replica id',
        );
        t.equal(
          deliveries[2]?.payload?.type,
          ReplicaOperationMessageType.REMOVE_REPLICA,
          'completed replayed create should advance directly into source removal',
        );
        t.equal(
          deliveries[2]?.payload?.replicaId,
          sourceReplicaId,
          'source removal should still target the retiring replica',
        );
        t.equal(
          persistedAfterReconcile.workflowStep,
          WORKFLOW_STEP.STOPPING,
          'replayed create completion should durably leave REPLACE in STOPPING',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE create ownership in ' +
      'CREATING when observed target status remains creating',
    async (t) => {
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay({
        observedTargetStatus: ReplicaStatus.CREATING,
      });
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'initial replacement dispatch should move the operation into CREATING',
        );

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'visible creating status should keep the owner waiting instead of replaying create dispatch',
        );
        t.equal(
          deliveries.length,
          1,
          'no second create dispatch should be sent once target visibility is already creating',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          undefined,
          'reconciliation should not replay the replacement create phase',
        );
        t.equal(
          deliveries[1]?.payload?.replicaId,
          undefined,
          'no replayed create should be emitted while target visibility already exists',
        );
        t.equal(
          deliveries[2]?.payload?.type,
          undefined,
          'source removal should not be dispatched before target progress advances beyond creating',
        );
        t.equal(
          deliveries[2]?.payload?.replicaId,
          undefined,
          'no retiring-source dispatch should be emitted from a same-step creating replay',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'the operation should remain in CREATING while the visible target keeps creating',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'RebalanceCoordinator keeps critical REPLACE create ownership in ' +
      'CREATING when observed target status remains pending',
    async (t) => {
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay({
        observedTargetStatus: ReplicaStatus.PENDING,
      });
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);

        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'initial replacement dispatch should move the operation into CREATING',
        );

        const progressed =
          await coordinator.reconcileOperationLifecycle(operation);

        t.equal(
          progressed,
          OPERATION_RECONCILE_OUTCOME.WAITING,
          'visible pending status should keep the owner waiting instead of replaying create dispatch',
        );
        t.equal(
          deliveries.length,
          1,
          'no second create dispatch should be sent once target visibility is already pending',
        );
        t.equal(
          deliveries[1]?.payload?.type,
          undefined,
          'reconciliation should not replay the replacement create phase from visible pending target state',
        );
        t.equal(
          operation.workflowStep,
          WORKFLOW_STEP.CREATING,
          'the operation should remain in CREATING while the visible target stays pending',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test('a same-step CREATE replay leaves the exact CREATING row waiting',
    async (t) => {
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay({
        answerCreateReplay: async () => ReplicaOperationResponseStatus.INITIATED,
      });
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);
        const writes = observeCommittedSteps(coordinator, operation.operationId);
        const result = await coordinator.reconcileOperationLifecycle(operation);
        const durable = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(result, OPERATION_RECONCILE_OUTCOME.WAITING);
        t.equal(durable.workflowStep, WORKFLOW_STEP.CREATING);
        t.same(writes, [], 'the idempotent CREATING reprojection changes no SQLite row');
        t.same(deliveries.map(({payload}) => payload.type), [
          ReplicaOperationMessageType.CREATE_REPLICA,
          ReplicaOperationMessageType.CREATE_REPLICA,
        ]);
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('a different writer winning ACTIVE does not report a replayed promotion',
    async (t) => {
      const witness = createReplaceWitness({available: false});
      let externalOutcome;
      let operation;
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay({
        witness,
        async answerCreateReplay() {
          const externalMirror = structuredClone(operation);
          externalOutcome = await coordinator.updateStep(externalMirror, WORKFLOW_STEP.ACTIVE);
          return ReplicaOperationResponseStatus.COMPLETED;
        },
      });
      try {
        operation = await create();
        await coordinator.executeOperation(operation);
        const writes = observeCommittedSteps(coordinator, operation.operationId);
        const result = await coordinator.reconcileOperationLifecycle(operation);
        const durable = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(externalOutcome, OPERATION_RECONCILE_OUTCOME.ADVANCED,
          'the opposing writer wins the earlier ACTIVE CAS');
        t.same(writes, [
          {expectedStep: WORKFLOW_STEP.CREATING, committedStep: WORKFLOW_STEP.ACTIVE},
        ], 'only the opposing writer commits; retirement authority remains unavailable');
        t.equal(result, OPERATION_RECONCILE_OUTCOME.WAITING,
          'observing the opposing write does not credit a new local promotion');
        t.equal(durable.workflowStep, WORKFLOW_STEP.ACTIVE);
        t.same(deliveries.map(({payload}) => payload.type), [
          ReplicaOperationMessageType.CREATE_REPLICA,
          ReplicaOperationMessageType.CREATE_REPLICA,
        ]);
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('an uncertain promotion leaves the pre-removal row waiting',
    async (t) => {
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay();
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);
        const writes = observeCommittedSteps(coordinator, operation.operationId);
        const persist = coordinator.repository.persistOperationUpdate.bind(coordinator.repository);
        coordinator.repository.persistOperationUpdate = async (candidate, options) => {
          if (candidate.operationId === operation.operationId &&
              candidate.workflowStep === WORKFLOW_STEP.ACTIVE) {
            const error = new Error('control_plane_pressure_degraded');
            error.retryAfterMs = 10;
            throw error;
          }
          return persist(candidate, options);
        };
        const result = await coordinator.reconcileOperationLifecycle(operation);
        const durable = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(result, OPERATION_RECONCILE_OUTCOME.WAITING);
        t.equal(durable.workflowStep, WORKFLOW_STEP.CREATING);
        t.equal(durable.completedAt, null);
        t.same(writes, [], 'the timed promotion reached no confirmed SQLite write');
        t.same(deliveries.map(({payload}) => payload.type), [
          ReplicaOperationMessageType.CREATE_REPLICA,
          ReplicaOperationMessageType.CREATE_REPLICA,
        ], 'source retirement requires a committed promotion');
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('ReplicaDispatch reports a guarded terminal winner during CREATE replay',
    async (t) => {
      const createArrived = Promise.withResolvers();
      const createReply = Promise.withResolvers();
      let writer;
      let store;
      const {coordinator, create, deliveries} = createCriticalReplaceCreateReplay({
        answerCreateReplay() {
          createArrived.resolve();
          return createReply.promise;
        },
        makeCoordinator(options) {
          const cache = createMockCache(options.cacheData);
          store = createCoordinatorSqlStore(cache);
          const sqlQueryEngine = {executeQuery: store.execute};
          const controlPlaneSystemTableGateway = {
            ...createMockControlPlaneSystemTableGateway(sqlQueryEngine),
            submitMutation: store.submitMutation,
          };
          const authority = {sqlQueryEngine, controlPlaneSystemTableGateway};
          writer = createTestCoordinator({
            nodeId: options.nodeId,
            cacheData: options.cacheData,
            ...authority,
          });
          return createTestCoordinator({...options, systemTableCache: cache, ...authority});
        },
      });
      const service = new ReplicaDispatchService({
        nodeId: coordinator.nodeId,
        messageRouter: coordinator.messageRouter,
        rebalanceCoordinator: coordinator,
        systemTableCache: coordinator.systemTableCache,
        cdcIntegrationService: coordinator.cdcIntegrationService,
        controlPlaneReadinessService: coordinator.controlPlaneReadinessService,
      });
      const dispatched = [];
      const failures = [];
      service.on(DISPATCH_EVENT.OPERATION_DISPATCHED, (event) => dispatched.push(event));
      service.on(DISPATCH_EVENT.OPERATION_FAILED, (event) => failures.push(event));

      let consumerResult;
      const dispatch = coordinator.dispatchOperation.bind(coordinator);
      coordinator.dispatchOperation = async (...args) => {
        consumerResult = await dispatch(...args);
        return consumerResult;
      };
      let pendingDispatch;
      let gateTimer;
      const failureReason = 'target failed before removal intent';
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);
        const senderWrites = observeCommittedSteps(coordinator, operation.operationId);
        const writerWrites = observeCommittedSteps(writer, operation.operationId);
        const readRow = () => store.execute(
          'SELECT * FROM replica_operations WHERE operation_id = ?', [operation.operationId],
        ).rows[0];
        const creating = readRow();
        t.equal(creating.workflow_step, WORKFLOW_STEP.CREATING);
        t.not(coordinator.operationWorkflowCoordinator, writer.operationWorkflowCoordinator,
          'the writer has an independent operation owner lane');

        pendingDispatch = service.dispatchOperationRow(creating);
        await Promise.race([
          createArrived.promise,
          pendingDispatch.then(() => {
            throw new Error('ReplicaDispatch returned before sending the CREATE replay');
          }),
          new Promise((_, reject) => {
            gateTimer = setTimeout(() => reject(new Error('CREATE replay was not sent')), 2000);
          }),
        ]);
        clearTimeout(gateTimer);
        const exact = await writer.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.equal(exact.workflowStep, WORKFLOW_STEP.CREATING);
        const failed = await writer.failOperation(exact, failureReason);
        t.equal(failed.committed, true, 'the competing owner commits the guarded FAILED write');
        t.equal(failed.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
        t.same(writerWrites, [
          {expectedStep: WORKFLOW_STEP.CREATING, committedStep: WORKFLOW_STEP.FAILED},
        ], 'the writer proves the durable pre-removal step before failing it');
        const winningRow = readRow();
        t.equal(winningRow.workflow_step, WORKFLOW_STEP.FAILED,
          'the exact SQLite row is terminal before the late CREATE answer');

        createReply.resolve(ReplicaOperationResponseStatus.COMPLETED);
        await pendingDispatch;

        t.same(senderWrites, [], 'the late answer commits neither promotion nor retirement');
        t.same(readRow(), winningRow, 'the complete durable terminal row stays unchanged');
        t.match(consumerResult, {
          success: false,
          terminal: true,
          operationId: operation.operationId,
          error: failureReason,
          reconcileOutcome: OPERATION_RECONCILE_OUTCOME.FAILED,
        }, 'the sender publishes the canonical terminal execution result');
        t.same(dispatched, [], 'ReplicaDispatch emits no successful dispatch event');
        t.equal(failures.length, 1, 'ReplicaDispatch emits one failure event');
        t.match(failures[0], {operationId: operation.operationId, error: failureReason},
          'the failure event names the exact terminal winner');
        t.same(deliveries.map(({payload}) => payload.type), [
          ReplicaOperationMessageType.CREATE_REPLICA,
          ReplicaOperationMessageType.CREATE_REPLICA,
        ], 'the late answer authorizes no source removal');
      } finally {
        clearTimeout(gateTimer);
        createReply.resolve(ReplicaOperationResponseStatus.COMPLETED);
        await Promise.allSettled([pendingDispatch]);
        service.stop();
        await Promise.all([writer.shutdown(), coordinator.shutdown()]);
        store.suspend();
      }
    });

  await t.test('a late failed REMOVE effect preserves the earlier durable CREATE progress',
    async (t) => {
      const {coordinator, create, deliveries, sourceReplicaId} =
        createCriticalReplaceCreateReplay({
          answerRemove: {status: ReplicaOperationResponseStatus.ERROR, error: 'source effect rejected'},
        });
      try {
        const operation = await create();
        await coordinator.executeOperation(operation);
        const writes = observeCommittedSteps(coordinator, operation.operationId);
        const failureOutcomes = [];
        const owner = coordinator.workflowOwner;
        const fail = owner.failOperation.bind(owner);
        owner.failOperation = async (current, reason, options) => {
          const outcome = await fail(current, reason, options);
          if (current.operationId === operation.operationId) failureOutcomes.push(outcome);
          return outcome;
        };
        const result = await coordinator.reconcileOperationLifecycle(operation);
        const durable = await coordinator.repository
          .queryReplicaOperationPersistenceAuthorityOperation(operation);
        t.same(writes, [
          {expectedStep: WORKFLOW_STEP.CREATING, committedStep: WORKFLOW_STEP.ACTIVE},
          {expectedStep: WORKFLOW_STEP.ACTIVE, committedStep: WORKFLOW_STEP.STOPPING},
        ], 'the same turn commits pre-removal promotion and removal intent');
        t.equal(failureOutcomes.length, 1, 'the rejected removal reaches terminal admission');
        t.match(failureOutcomes[0], {
          committed: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
          reconcileOutcome: OPERATION_RECONCILE_OUTCOME.REFUSED,
          refusal: 'replace_post_intent_failure_refused',
        }, 'the guarded post-intent failure returns a distinct refusal');
        t.equal(result, OPERATION_RECONCILE_OUTCOME.ADVANCED);
        t.equal(durable.workflowStep, WORKFLOW_STEP.STOPPING);
        t.equal(durable.completedAt, null, 'a failed effect cannot settle a post-intent REPLACE');
        t.same(deliveries.filter(({payload}) => payload.type ===
          ReplicaOperationMessageType.REMOVE_REPLICA).map(({payload}) => payload.replicaId),
        [sourceReplicaId], 'the attempt is for the exact retiring source');
      } finally {
        await coordinator.shutdown();
      }
    });
}
