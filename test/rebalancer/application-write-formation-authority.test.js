import {test} from '../../src/test-helpers/tap.js';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {
  QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
} from '../../src/query/query-execution-budget.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {TOKEN_STATUS} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {ProvisioningAdmissionPolicy} from
  '../../src/rebalancer/provisioning-admission-policy.js';

const TEST_MOVE = Object.freeze({
  type: 'ADD',
  partitionId: 'application-p1',
  entityType: 'partition',
  entityId: 'application-p1',
  nodeId: 'node-target',
  operationIntentId: 'schema-job-1:operation:node-target',
  replicaIntentId: 'schema-job-1:replica:node-target',
  controlPlaneMutationWorkClass: 'interactive',
});

function listJavaScriptFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

function planningIdentity(generation) {
  return Object.freeze({
    globalPlanningGeneration: generation,
    nodePlanningGeneration: generation,
    saturated: false,
  });
}

function createAdmissionOwner() {
  const state = {
    identity: planningIdentity(1),
    routeAllowed: true,
    insertAttempts: 0,
    insertedMoves: [],
    routeObservations: 0,
  };
  const owner = Object.create(RebalanceCoordinator.prototype);
  owner.initialized = true;
  owner.isShuttingDown = false;
  owner.operationsInCreation = new Map();
  owner.recentOperationIntents = new Map();
  owner.controlPlaneReadinessService = {
    readCurrentPlanningProjectionIdentity() {
      return state.identity;
    },
  };
  owner.provisioningAdmissionPolicy = {
    async ensureProvisioningAdmissionAllowed() {},
  };
  owner.observeReplicaOperationMutationRoute = () => {
    state.routeObservations += 1;
    return Object.freeze({
      allowed: state.routeAllowed,
      reasonCode: state.routeAllowed ? null : 'replica_operation_route_unavailable',
      retryAfterMs: state.routeAllowed ? 0 : 25,
    });
  };
  owner.ensureOperationLedgerSelfMoveSerialized = async () => {};
  owner.ensureNoConflictingInFlightReplaceForRemove = async () => {};
  owner.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
  owner.ensurePrioritySurplusRemovePlacementFenceAllowed = async () => {};
  owner.ensureEntityAddLikeCreateLaneAvailable = async () => {};
  owner.ensureCriticalPartitionCreateLaneAvailable = async () => {};
  owner.ensureCreateTopologyGuardAllowed = async () => {};
  owner.assertLocalControlPlaneMutationReady = () => {};
  owner.assertExplicitRuntimeServiceTargetIdentity = () => {};
  owner.assertMembershipPublicationEpoch = () => {};
  owner.buildOperationIntentKey = () => 'intent-key';
  owner.buildCriticalAddLikeIntentKey = () => null;
  owner.getCreateOperationSingleFlightKey = () => 'single-flight-key';
  owner.pruneExpiredOperationIntents = () => {};
  owner.getRecentOperationIntent = async () => null;
  owner.operationWorkflowRunExclusive = (_key, callback) => callback();
  owner.runOperationLedgerInterlockAccountedCreate = (_move, callback) =>
    callback();
  owner.persistNewOperation = async (operation) => {
    state.insertAttempts += 1;
    state.insertedMoves.push(operation.move);
    return operation;
  };
  owner.createOperationInternal = async (move) => {
    const operation = Object.freeze({
      operationId: move.operationIntentId,
      move,
    });
    const result = await owner.persistNewOperationAtAdmissionBoundary(
      operation,
      move,
    );
    return result.persistResult;
  };
  return {owner, state};
}

function createReplicaOperationRouteHarness(options = {}) {
  const partitionId =
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
  const nodeId = options.nodeId || 'replica-operation-leader';
  const address = `${nodeId}/partition/replica_operations-p1-r1`;
  const partition = {
    partition_id: partitionId,
    table_name: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    leader_node_id:
      Object.prototype.hasOwnProperty.call(options, 'leaderNodeId') ?
        options.leaderNodeId : nodeId,
  };
  const service = {
    service_id: 'replica_operations-p1-r1',
    replica_id: 'replica_operations-p1-r1',
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: options.raftRole || 'leader',
    address,
    status: 'active',
  };
  let routerDeliveries = 0;
  const systemCache = {
    get(tableName, key) {
      return tableName === SYSTEM_TABLE_NAME.PARTITIONS && key === partitionId ?
        partition : null;
    },
    filter(tableName, predicate) {
      if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
        return [partition].filter(predicate);
      }
      if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
        return [service].filter(predicate);
      }
      return [];
    },
  };
  const queryExecutor = new QueryExecutor({
    nodeId,
    systemCache,
    messageRouter: {
      async deliver() {
        routerDeliveries += 1;
        return {success: true};
      },
    },
  });
  return {
    address,
    partitionId,
    queryExecutor,
    service,
    getRouterDeliveries: () => routerDeliveries,
  };
}

function createGatewayRetryRepository(results) {
  const repository = Object.create(ReplicaOperationRepository.prototype);
  let invocationCount = 0;
  repository.timeSource = {now: () => 0};
  repository.canUseReplicaOperationMutationIngress = () => true;
  repository.buildOperationMutationQueryOptions = () => ({});
  repository.executeReplicaOperationGatewayMutation = async () => {
    const result = results[Math.min(invocationCount, results.length - 1)];
    invocationCount += 1;
    return result;
  };
  repository.isRetryableOperationPersistError = () => true;
  repository.shouldShortCircuitDeferredMutationRetry = () => false;
  repository.resolveOperationMutationRemainingRetryMs = () => 100;
  repository.shouldRotateOperationMutationSessionOnRetry = () => false;
  repository.resolveOperationMutationRetryDelayMs = () => 0;
  repository.waitForOperationPersistRetry = async () => {};
  repository.isShuttingDownRequested = () => false;
  return {repository, getInvocationCount: () => invocationCount};
}

test('F1 stable READY observation admits exactly one first operation effect',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    const decision = await owner.checkProvisioningAdmission(TEST_MOVE);

    t.equal(decision.allowed, true, 'the complete owner observation admits');
    t.ok(
      Object.isFrozen(decision.operationCreationAdmission),
      'the admitted operation-creation observation is immutable',
    );
    const operation = await owner.createOperation({
      ...TEST_MOVE,
      operationCreationAdmission: decision.operationCreationAdmission,
    });

    t.equal(operation.operationId, TEST_MOVE.operationIntentId);
    t.equal(state.insertAttempts, 1, 'the first durable effect is attempted once');
    t.equal(state.routeObservations, 2, 'admission is revalidated before effect');
  });

test('F2 unavailable canonical replica_operations route prevents false READY',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    state.routeAllowed = false;

    const decision = await owner.checkProvisioningAdmission(TEST_MOVE);

    t.equal(decision.allowed, false);
    t.equal(decision.contractState, 'deferred');
    t.equal(decision.nextAction, 'retry');
    t.match(decision.reasonCodes, ['replica_operation_route_unavailable']);
    t.equal(state.insertAttempts, 0);
  });

test('the observation is bound to decision-relevant move authority',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    const decision = await owner.checkProvisioningAdmission(TEST_MOVE);

    await t.rejects(
      owner.createOperation({
        ...TEST_MOVE,
        controlPlaneMutationWorkClass: 'background',
        operationCreationAdmission: decision.operationCreationAdmission,
      }),
      {code: 'OPERATION_CREATION_ADMISSION_REENTER'},
      'a caller cannot reuse interactive admission for a different work class',
    );
    await t.rejects(
      owner.createOperation({
        ...TEST_MOVE,
        membershipPublicationEpoch: 0,
        operationCreationAdmission: decision.operationCreationAdmission,
      }),
      {code: 'OPERATION_CREATION_ADMISSION_REENTER'},
      'an unbound admission cannot be reused by an epoch-bound move',
    );
    t.equal(state.insertAttempts, 0);
  });

test('operation creation route observation consumes canonical write candidates',
  async (t) => {
    const canonicalRoute = createReplicaOperationRouteHarness();
    const {owner} = createAdmissionOwner();
    delete owner.observeReplicaOperationMutationRoute;
    owner.sqlQueryEngine = {queryExecutor: canonicalRoute.queryExecutor};

    const admitted = await owner.checkProvisioningAdmission(TEST_MOVE);
    t.equal(admitted.allowed, true, 'the canonical leader write route admits');
    t.equal(
      admitted.operationCreationAdmission.routeObservation.routingSnapshot
        .candidateCount,
      1,
      'admission consumes the canonical candidate owner result',
    );

    canonicalRoute.queryExecutor.markTemporarilyUnroutableAddress(
      canonicalRoute.partitionId,
      canonicalRoute.address,
      canonicalRoute.service,
    );
    const denied = await owner.checkProvisioningAdmission(TEST_MOVE);
    t.equal(
      denied.allowed,
      false,
      'a canonical leader quarantined by the write owner denies admission',
    );
    t.match(denied.reasonCodes, ['replica_operation_route_unavailable']);
    t.equal(
      denied.routeObservation.routingSnapshot.routableServiceCount,
      1,
      'the readiness-routable row remains visible in diagnostics',
    );
    t.equal(
      denied.routeObservation.routingSnapshot.candidateCount,
      0,
      'the canonical write owner removes the temporarily unroutable endpoint',
    );
    t.equal(
      canonicalRoute.getRouterDeliveries(),
      0,
      'route observation performs no delivery effect',
    );

    const recoveryRoute = createReplicaOperationRouteHarness({
      leaderNodeId: null,
      raftRole: 'follower',
    });
    const {owner: recoveryOwner} = createAdmissionOwner();
    delete recoveryOwner.observeReplicaOperationMutationRoute;
    recoveryOwner.sqlQueryEngine = {queryExecutor: recoveryRoute.queryExecutor};
    const recoveryAdmission =
      await recoveryOwner.checkProvisioningAdmission(TEST_MOVE);
    t.equal(
      recoveryAdmission.allowed,
      true,
      'the canonical system-table recovery route remains admitted',
    );
    t.equal(
      recoveryRoute.getRouterDeliveries(),
      0,
      'recovery-route observation also remains side-effect free',
    );
  });

test('route loss after final admission revalidation returns typed pre-effect ' +
  're-entry', async (t) => {
  const routeHarness = createReplicaOperationRouteHarness();
  routeHarness.queryExecutor.markTemporarilyUnroutableAddress(
    routeHarness.partitionId,
    routeHarness.address,
    routeHarness.service,
  );
  routeHarness.queryExecutor.isShuttingDownRequested = () => true;
  const routeFailure = await routeHarness.queryExecutor.executeOnPartition(
    routeHarness.partitionId,
    'INSERT INTO replica_operations(operation_id) VALUES (?)',
    ['op-route-barrier'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );
  t.equal(
    routeFailure.deliveryDisposition,
    QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
    'zero canonical candidates carries the QueryExecutor-owned pre-effect fact',
  );
  t.equal(
    routeHarness.getRouterDeliveries(),
    0,
    'the typed route loss occurs before any router submission',
  );

  const gateway = Object.create(ControlPlaneSystemTableGateway.prototype);
  const gatewayFailure = gateway.normalizeMutationResult(routeFailure);
  const retryHarness = createGatewayRetryRepository([gatewayFailure]);
  const retryFailure =
    await retryHarness.repository
      .executeReplicaOperationGatewayMutationWithRetry(
        {operation: 'insert'},
        {onRetryableFailure: async () => false},
      );
  t.equal(
    retryHarness.getInvocationCount(),
    1,
    'confirmed pre-submission route loss does not retry into delivery',
  );
  const persistError =
    retryHarness.repository.buildOperationPersistError(retryFailure);
  t.equal(
    persistError.deliveryDisposition,
    QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
    'gateway and repository preserve the owner disposition structurally',
  );

  const {owner, state} = createAdmissionOwner();
  owner.persistNewOperation = async () => {
    throw persistError;
  };
  const admission = await owner.checkProvisioningAdmission(TEST_MOVE);
  await t.rejects(
    owner.createOperation({
      ...TEST_MOVE,
      operationCreationAdmission: admission.operationCreationAdmission,
    }),
    {code: 'OPERATION_CREATION_ADMISSION_REENTER'},
    'the admission boundary translates only the typed pre-effect disposition',
  );
  t.equal(state.insertAttempts, 0, 'no operation insert was submitted');
});

test('an earlier possible delivery cannot be relabeled by later route loss',
  async (t) => {
    const ambiguousDelivery = {
      success: false,
      error: 'Mutation delivery result is ambiguous',
      deferRetry: true,
    };
    const preSubmissionRouteLoss = {
      success: false,
      error: 'Partition service not found',
      deliveryDisposition:
        QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
    };
    const retryHarness = createGatewayRetryRepository([
      ambiguousDelivery,
      preSubmissionRouteLoss,
    ]);
    const retryFailure =
      await retryHarness.repository
        .executeReplicaOperationGatewayMutationWithRetry(
          {operation: 'insert'},
          {onRetryableFailure: async () => false},
        );
    t.equal(
      retryHarness.getInvocationCount(),
      2,
      'the witness reaches route loss after one possibly-submitted invocation',
    );
    t.equal(
      retryFailure.priorMutationDeliveryMayHaveBeenAttempted,
      true,
      'the aggregate result retains monotonic possible-delivery evidence',
    );

    const persistError =
      retryHarness.repository.buildOperationPersistError(retryFailure);
    const {owner} = createAdmissionOwner();
    owner.persistNewOperation = async () => {
      throw persistError;
    };
    const admission = await owner.checkProvisioningAdmission(TEST_MOVE);
    let observedError = null;
    try {
      await owner.createOperation({
        ...TEST_MOVE,
        operationCreationAdmission: admission.operationCreationAdmission,
      });
    } catch (error) {
      observedError = error;
    }
    t.equal(
      observedError,
      persistError,
      'the admission boundary preserves the ambiguous persistence failure',
    );
    t.not(
      observedError?.code,
      'OPERATION_CREATION_ADMISSION_REENTER',
      'a later zero-candidate result cannot claim that no prior effect exists',
    );
  });

test('F3 a post-READY authority transition refuses before operation insert',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    const decision = await owner.checkProvisioningAdmission(TEST_MOVE);
    state.identity = planningIdentity(2);

    await t.rejects(
      owner.createOperation({
        ...TEST_MOVE,
        operationCreationAdmission: decision.operationCreationAdmission,
      }),
      {
        code: 'OPERATION_CREATION_ADMISSION_REENTER',
        reasonCodes: ['readiness_planning_identity_changed'],
      },
    );
    t.equal(state.insertAttempts, 0, 'no possibly-applied mutation exists');
  });

test('F4 stale G cannot win and re-entry at G+2 keeps deterministic intent',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    const generationOne = await owner.checkProvisioningAdmission(TEST_MOVE);
    state.identity = planningIdentity(2);

    await t.rejects(
      owner.createOperation({
        ...TEST_MOVE,
        operationCreationAdmission: generationOne.operationCreationAdmission,
      }),
      {code: 'OPERATION_CREATION_ADMISSION_REENTER'},
    );
    t.equal(state.insertAttempts, 0, 'stale generation cannot insert');

    state.identity = planningIdentity(3);
    state.routeAllowed = true;
    const generationThree = await owner.checkProvisioningAdmission(TEST_MOVE);
    await owner.createOperation({
      ...TEST_MOVE,
      operationCreationAdmission: generationThree.operationCreationAdmission,
    });

    t.equal(state.insertAttempts, 1);
    t.equal(
      state.insertedMoves[0].operationIntentId,
      TEST_MOVE.operationIntentId,
      're-entry preserves the durable schema child operation identity',
    );
  });

test('every create-time semantic dimension participates in one composite ' +
  'admission decision', async (t) => {
  const cases = [
    {
      name: 'entity state',
      install(owner) {
        owner.ensureEntityAddLikeCreateLaneAvailable = async () => {
          const error = new Error('entity operation pending');
          error.reasonCode = 'entity_operation_pending';
          throw error;
        };
      },
      reason: 'entity_operation_pending',
    },
    {
      name: 'topology state',
      install(owner) {
        owner.ensureCreateTopologyGuardAllowed = async () => {
          const error = new Error('target already occupied');
          error.reasonCode = 'target_already_occupied';
          throw error;
        };
      },
      reason: 'target_already_occupied',
    },
    {
      name: 'storage admission',
      install(owner) {
        owner.provisioningAdmissionPolicy.ensureProvisioningAdmissionAllowed =
          async () => {
            const error = new Error('storage admission deferred');
            error.reasonCode = 'storage_admission_deferred';
            throw error;
          };
      },
      reason: 'storage_admission_deferred',
    },
  ];

  for (const testCase of cases) {
    const {owner, state} = createAdmissionOwner();
    testCase.install(owner);

    const decision = await owner.checkProvisioningAdmission(TEST_MOVE);

    t.equal(decision.allowed, false, `${testCase.name} can refuse admission`);
    t.match(decision.reasonCodes, [testCase.reason],
      `${testCase.name} refusal stays in the coordinator outcome`);
    t.equal(state.insertAttempts, 0,
      `${testCase.name} cannot fail open into the durable insert`);
  }
});

test('lost insert result reconciles through the deterministic operation ID',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    const authoritativeOperations = new Map();
    let loseFirstResult = true;
    owner.persistNewOperation = async (operation) => {
      let durableOperation = authoritativeOperations.get(operation.operationId);
      if (!durableOperation) {
        state.insertAttempts += 1;
        durableOperation = operation;
        authoritativeOperations.set(operation.operationId, durableOperation);
      }
      if (loseFirstResult) {
        loseFirstResult = false;
        throw new Error('insert response lost after durable apply');
      }
      return durableOperation;
    };

    const firstAdmission = await owner.checkProvisioningAdmission(TEST_MOVE);
    await t.rejects(
      owner.createOperation({
        ...TEST_MOVE,
        operationCreationAdmission:
          firstAdmission.operationCreationAdmission,
      }),
      /response lost after durable apply/,
      'post-submission ambiguity is not mislabeled as a pre-effect refusal',
    );

    const reenteredAdmission = await owner.checkProvisioningAdmission(TEST_MOVE);
    const resolved = await owner.createOperation({
      ...TEST_MOVE,
      operationCreationAdmission:
        reenteredAdmission.operationCreationAdmission,
    });
    t.equal(resolved.operationId, TEST_MOVE.operationIntentId);
    t.equal(authoritativeOperations.size, 1, 'one durable operation exists');
    t.equal(state.insertAttempts, 1, 'the deterministic identity prevents a second insert');
  });

test('degraded ordinary create defers while the owner-authorized repair cure proceeds',
  async (t) => {
    const {owner} = createAdmissionOwner();
    const degradedReadiness = {
      nodeId: 'formation-seed',
      readinessPlanningTokenStatus: TOKEN_STATUS.STALE,
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      },
      projectionReadinessContract: {
        priorityRecovery: {active: false, durableSpreadPending: true},
      },
      reasons: [{
        code:
          CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
      }],
    };
    owner.controlPlaneReadinessService.getNodeReadinessSync = () =>
      degradedReadiness;
    owner.provisioningAdmissionPolicy = new ProvisioningAdmissionPolicy({
      nodeId: 'formation-seed',
      logger: {warn() {}},
      delegates: {
        getNodeId: () => 'formation-seed',
        getControlPlaneReadinessService: () =>
          owner.controlPlaneReadinessService,
      },
    });
    delete owner.assertLocalControlPlaneMutationReady;
    owner.ensureProvisioningAdmissionAllowed = async () => {};

    const ordinary = await owner.checkProvisioningAdmission({
      ...TEST_MOVE,
      partitionId: 'application-p1',
      entityId: 'application-p1',
      controlPlaneMutationWorkClass: 'background',
    });
    const repair = await owner.checkProvisioningAdmission({
      ...TEST_MOVE,
      partitionId: 'sql_transactions-p1',
      entityId: 'sql_transactions-p1',
      operationIntentId: 'repair-cycle-1:operation:node-target',
      replicaIntentId: 'repair-cycle-1:replica:node-target',
      controlPlaneMutationWorkClass: 'background',
      priorityRecoveryOperationCreationRequired: true,
    });

    t.equal(ordinary.allowed, false, 'ordinary degraded application work defers');
    t.match(
      ordinary.reasonCodes,
      ['local_mutation_unhealthy'],
    );
    t.equal(repair.allowed, true, 'the documented repair-only authority proceeds');
  });

test('routine ledger-read fail-open cannot fail-open the required mutation route',
  async (t) => {
    const {owner, state} = createAdmissionOwner();
    let ledgerObservations = 0;
    owner.resolveProvisioningLedgerInterlockDeferral = async () => {
      ledgerObservations += 1;
      return null;
    };

    const ledgerFailOpen = await owner.checkProvisioningAdmission(TEST_MOVE);
    t.equal(ledgerFailOpen.allowed, true, 'routine ledger visibility remains fail-open');

    state.routeAllowed = false;
    const routeBlocked = await owner.checkProvisioningAdmission(TEST_MOVE);
    t.equal(routeBlocked.allowed, false, 'a required route predicate stays fail-closed');
    t.match(
      routeBlocked.reasonCodes,
      ['replica_operation_route_unavailable'],
    );
    t.equal(
      ledgerObservations,
      1,
      'route denial occurs independently of the ledger-read exception',
    );
  });

test('replica-operation creation caller census enters one coordinator owner',
  (t) => {
    const creationCalls = [];
    for (const file of listJavaScriptFiles(join(process.cwd(), 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/([^\n]*\.createOperation\([^\n]*)/gu)) {
        creationCalls.push({file, line: match[1].trim()});
      }
    }

    t.equal(creationCalls.length, 2, 'the complete production caller census is explicit');
    t.ok(
      creationCalls.every(({line}) =>
        line.includes('rebalanceCoordinator.createOperation(')),
      'every replica-operation creation caller enters RebalanceCoordinator',
    );
    const sqlCreationSource = readFileSync(
      join(process.cwd(), 'src/query/sql-query-engine-initial-partition-provisioning.js'),
      'utf8',
    );
    t.notMatch(
      sqlCreationSource,
      /skipProvisioningAdmissionRecheck/u,
      'SQL has no boolean admission composition path',
    );
    t.match(
      sqlCreationSource,
      /operationCreationAdmission:/u,
      'SQL hands the coordinator observation back to its owner',
    );
    t.end();
  });
