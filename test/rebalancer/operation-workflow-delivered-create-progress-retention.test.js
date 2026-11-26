import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {deliverAdmittedOperationEffect} from
  '../../src/rebalancer/operation-workflow-remove-effect-admission.js';
import {createTestCoordinator} from './test-helpers.js';

const SOURCE_NODE_ID = 'source-node';
const TARGET_NODE_ID = 'target-node';
const SERVICE_ID = 'svc-owner-retention';

function buildRuntimeOperation(overrides = {}) {
  const now = Date.now();
  return {
    operationId: 'delivered-create-progress-operation',
    type: OperationType.ADD,
    partitionId: SERVICE_ID,
    entityType: 'runtime_service',
    entityId: SERVICE_ID,
    replicaId: `${SERVICE_ID}-r1`,
    sourceNodeId: SOURCE_NODE_ID,
    targetNodeId: TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.SENDING,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    ...overrides,
  };
}

function createOwnerHarness() {
  const timers = [];
  const coordinator = createTestCoordinator({
    nodeId: SOURCE_NODE_ID,
    setTimeoutFn(callback, delayMs) {
      const timer = {callback, delayMs, cleared: false, fired: false};
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(timer) {
      timer.cleared = true;
    },
  });
  return {coordinator, owner: coordinator.workflowOwner, timers};
}

test(
  'delivered CREATE evidence upgrades an existing observed wake without a ' +
  'second timer and survives deferred operation visibility',
  async (t) => {
    const {coordinator, owner, timers} = createOwnerHarness();
    const operation = buildRuntimeOperation();

    try {
      owner.scheduleObservedProgressRetry(
        operation.operationId,
        'services',
        'upsert',
        25,
      );
      const originalEntry =
        owner.observedProgressRetryTimerByOperationId.get(
          operation.operationId,
        );
      const originalTimer = originalEntry.timeoutHandle;

      t.ok(
        owner.retainDeliveredCreateProgress(
          operation,
          {status: ReplicaOperationResponseStatus.INITIATED},
        ),
        'delivered CREATE should be retained',
      );
      const upgradedEntry =
        owner.observedProgressRetryTimerByOperationId.get(
          operation.operationId,
        );
      t.equal(
        owner.observedProgressRetryTimerByOperationId.size,
        1,
        'ordinary and delivered evidence share one owner registry entry',
      );
      t.equal(
        upgradedEntry.timeoutHandle,
        originalTimer,
        'the earlier observed wake remains the next attempt',
      );
      t.equal(
        upgradedEntry.kind,
        'delivered_create_progress',
        'the stronger delivered obligation must dominate the weak wake',
      );

      originalTimer.fired = true;
      await originalTimer.callback();
      const rearmedEntry =
        owner.observedProgressRetryTimerByOperationId.get(
          operation.operationId,
        );
      t.ok(
        rearmedEntry,
        'missing operation-row visibility must rearm the bounded obligation',
      );
      t.equal(
        rearmedEntry.kind,
        'delivered_create_progress',
        'visibility deferral must not weaken the retained evidence',
      );
      t.equal(
        timers.filter((timer) => !timer.cleared && !timer.fired).length,
        1,
        'only one live timer remains after bounded rearm',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'delivered CREATE starts on the existing observed-progress cadence',
  async (t) => {
    const {coordinator, owner} = createOwnerHarness();
    const operation = buildRuntimeOperation({
      operationId: 'observed-cadence-operation',
    });

    try {
      owner.retainDeliveredCreateProgress(
        operation,
        {status: ReplicaOperationResponseStatus.INITIATED},
      );
      const retryEntry =
        owner.observedProgressRetryTimerByOperationId.get(
          operation.operationId,
        );

      t.equal(
        retryEntry?.timeoutHandle?.delayMs,
        250,
        'retention must leave repeated visibility attempts inside the budget',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'generic observed cleanup cannot consume stronger delivered evidence',
  async (t) => {
    const {coordinator, owner} = createOwnerHarness();
    const operation = buildRuntimeOperation({
      operationId: 'delivered-evidence-dominates-cleanup',
    });

    try {
      owner.retainDeliveredCreateProgress(
        operation,
        {status: ReplicaOperationResponseStatus.IN_PROGRESS},
      );

      owner.clearObservedProgressRetry(operation.operationId);

      t.ok(
        owner.observedProgressRetryTimerByOperationId.has(
          operation.operationId,
        ),
        'a stale generic observation must leave delivered evidence owned',
      );
      owner.clearObservedProgressRetry(operation.operationId, {
        includeDeliveredCreateProgress: true,
      });
      t.notOk(
        owner.observedProgressRetryTimerByOperationId.has(
          operation.operationId,
        ),
        'explicit completion cleanup consumes the delivered obligation',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'exact runtime target ACTIVE cache proof satisfies terminal handoff while ' +
  'system operations keep refresh-only semantics',
  async (t) => {
    const operation = buildRuntimeOperation({
      operationId: 'exact-active-cache-handoff',
      workflowStep: WORKFLOW_STEP.CREATING,
    });
    const coordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        services: [{
          service_id: operation.replicaId,
          service_type: operation.entityType,
          node_id: operation.targetNodeId,
          status: ReplicaStatus.ACTIVE,
        }],
      },
      cdcIntegrationService: {
        async refreshAuthoritativeCacheRow() {
          return false;
        },
      },
    });
    const owner = coordinator.workflowOwner;

    try {
      t.equal(
        await owner.confirmActiveReplicaTerminalHandoff(operation),
        true,
        'an already-aligned exact runtime row does not wait on a no-op refresh',
      );
      t.equal(
        await owner.confirmActiveReplicaTerminalHandoff({
          ...operation,
          operationId: 'system-refresh-only-handoff',
          entityType: 'partition',
          partitionId: 'nodes-p1',
        }),
        false,
        'system operation terminal handoff retains its refresh-only contract',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'delivered-create retention rejects excluded operation and response shapes',
  async (t) => {
    const {coordinator, owner} = createOwnerHarness();
    const initiated = {status: ReplicaOperationResponseStatus.INITIATED};
    const cases = [
      buildRuntimeOperation({
        operationId: 'system-operation',
        partitionId: 'nodes-p1',
      }),
      buildRuntimeOperation({
        operationId: 'partition-operation',
        entityType: 'partition',
      }),
      buildRuntimeOperation({
        operationId: 'remove-operation',
        type: OperationType.REMOVE,
      }),
      buildRuntimeOperation({
        operationId: 'replace-remove-operation',
        type: OperationType.REPLACE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
      }),
    ];

    try {
      for (const operation of cases) {
        t.notOk(
          owner.retainDeliveredCreateProgress(operation, initiated),
          `${operation.operationId} must remain outside retention scope`,
        );
      }
      t.notOk(
        owner.retainDeliveredCreateProgress(
          buildRuntimeOperation({operationId: 'error-response'}),
          {status: ReplicaOperationResponseStatus.ERROR},
        ),
        'a delivered error response must not retain create progress',
      );
      t.equal(
        owner.observedProgressRetryTimerByOperationId.size,
        0,
        'excluded shapes leave no owner work',
      );
      const admittedPartitionOp = buildRuntimeOperation({
        operationId: 'admitted-partition-operation',
        entityType: 'partition',
        partitionId: 'services-p1',
        createAdmissionState: 'ADMITTED',
      });
      t.ok(
        owner.retainDeliveredCreateProgress(admittedPartitionOp, {
          status: ReplicaOperationResponseStatus.IN_PROGRESS,
        }),
        'partition CREATE carrying durable create admission is retained',
      );
      owner.clearObservedProgressRetry(admittedPartitionOp.operationId, {
        includeDeliveredCreateProgress: true,
      });
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('workflow-owner shutdown clears delivered-create retention', async (t) => {
  const {coordinator, owner} = createOwnerHarness();
  const operation = buildRuntimeOperation({operationId: 'shutdown-operation'});

  owner.retainDeliveredCreateProgress(
    operation,
    {status: ReplicaOperationResponseStatus.IN_PROGRESS},
  );
  const entry =
    owner.observedProgressRetryTimerByOperationId.get(operation.operationId);
  t.ok(entry, 'precondition: delivered-create work is retained');

  await coordinator.shutdown();

  t.ok(entry.timeoutHandle.cleared, 'shutdown clears the retained timer');
  t.equal(
    owner.observedProgressRetryTimerByOperationId.size,
    0,
    'shutdown empties the shared observed-progress registry',
  );
});

test(
  'durable REPLACE target-active progress consumes delivered-create retention',
  async (t) => {
    const {coordinator, owner} = createOwnerHarness();
    const operation = buildRuntimeOperation({
      operationId: 'replace-target-active-operation',
      type: OperationType.REPLACE,
      workflowStep: WORKFLOW_STEP.SYNCING,
    });

    try {
      owner.retainDeliveredCreateProgress(
        operation,
        {status: ReplicaOperationResponseStatus.COMPLETED},
      );
      owner.confirmActiveReplicaTerminalHandoff = async () => true;
      owner.reconcileReplaceActualActive = async () => true;

      await owner.reconcileActiveReplicaStatus(operation);

      t.notOk(
        owner.observedProgressRetryTimerByOperationId.has(
          operation.operationId,
        ),
        'a durably applied REPLACE target clears its create obligation',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'a terminal CREATE response consumes retention before owner return',
  async (t) => {
    const operation = buildRuntimeOperation({
      operationId: 'completed-response-operation',
      workflowStep: WORKFLOW_STEP.PENDING,
    });
    const timers = [];
    const coordinator = createTestCoordinator({
      nodeId: SOURCE_NODE_ID,
      cacheData: {
        replicaOperations: [operation],
        services: [{
          service_id: operation.replicaId,
          service_type: operation.entityType,
          node_id: operation.targetNodeId,
          status: ReplicaStatus.ACTIVE,
        }],
      },
      setTimeoutFn(callback, delayMs) {
        const timer = {callback, delayMs, cleared: false};
        timers.push(timer);
        return timer;
      },
      clearTimeoutFn(timer) {
        timer.cleared = true;
      },
    });

    try {
      const result =
        await coordinator.workflowOwner.dispatchOperation(operation.operationId);
      const durableOperation =
        await coordinator.repository.queryOperationById(operation.operationId);

      t.ok(result?.success, 'the completed response should succeed');
      t.equal(durableOperation?.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.equal(durableOperation?.status, ReplicaStatus.ACTIVE);
      t.notOk(
        coordinator.workflowOwner.observedProgressRetryTimerByOperationId.has(
          operation.operationId,
        ),
        'terminal completion must clear the delivered-create entry',
      );
      t.ok(
        timers.every((timer) => timer.cleared),
        'any timer armed at delivery is cleared during terminal completion',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test('CREATE delivery receipts bind the live target boot and exact granted attempt', async (t) => {
  const {coordinator, owner} = createOwnerHarness();
  let boot = 1;
  let deliveries = 0;
  const operation = buildRuntimeOperation({
    entityType: 'partition', createAdmissionOwnerIncarnation: 1,
    createAdmissionState: 'ADMITTED', createAdmissionToken: 'admission',
    createAdmissionAttemptToken: 'attempt-1', createAdmissionAttemptSeq: 1,
    createAdmissionReplicaCreatedAt: 100,
  });
  operation.createAdmissionWorkflowUpdatedAt = operation.updatedAt;
  const request = {
    type: 'CREATE_REPLICA', operationType: operation.type,
    entityType: operation.entityType, entityId: operation.entityId,
    partitionId: operation.partitionId, sourceNodeId: operation.sourceNodeId,
    operationId: operation.operationId, replicaId: operation.replicaId,
    createAdmissionToken: operation.createAdmissionToken, createAdmissionAttemptSeq: 1,
    createAdmissionAttemptToken: operation.createAdmissionAttemptToken,
    createAdmissionWorkflowUpdatedAt: operation.updatedAt,
  };
  const reply = {status: ReplicaOperationResponseStatus.INITIATED, nodeId: TARGET_NODE_ID,
    operationId: operation.operationId, replicaId: operation.replicaId};
  const worker = () => ({
    operationId: request.operationId, operationType: request.operationType, entityType: request.entityType,
    entityId: request.entityId, partitionId: request.partitionId, replicaId: request.replicaId,
    targetNodeId: TARGET_NODE_ID, admissionToken: request.createAdmissionToken,
    attemptToken: request.createAdmissionAttemptToken, attemptSeq: request.createAdmissionAttemptSeq,
    workflowUpdatedAt: request.createAdmissionWorkflowUpdatedAt, ownerIncarnation: boot,
    replicaCreatedAt: operation.createAdmissionReplicaCreatedAt,
  });
  const confirmed = () => buildDeliveryEnvelope({acknowledged: true}, {...reply, createWorkerReceipt: worker()});
  let deliver = confirmed;
  let endpointAhead = false;
  const originalGet = owner.repository.systemTableCache.get.bind(owner.repository.systemTableCache);
  owner.repository.systemTableCache.get = (table, key) => {
    if (table === 'nodes' && key === TARGET_NODE_ID) return {boot_incarnation: boot};
    if (table === 'node_endpoints' && key === `ep-${TARGET_NODE_ID}-ws`) {
      return {boot_incarnation: endpointAhead ? boot + 1 : boot};
    }
    return originalGet(table, key);
  };
  owner.deliverReplicaOperationRequest = () => {
    deliveries += 1;
    return deliver();
  };
  const sends = [];
  const run = (routine = true) => deliverAdmittedOperationEffect(owner, operation,
    TARGET_NODE_ID + '/service/replica-handler', request, TARGET_NODE_ID, null, null, routine,
    (evidence) => sends.push(evidence));
  try {
    const first = await run();
    t.equal((await run()).delivery, first.delivery);
    t.equal(deliveries, 1, 'confirmed receipt reuses the actual target reply');
    await run(false);
    t.equal(deliveries, 2, 'explicit recovery redrives');
    t.equal(sends.length, 2, 'only actual sends invoke the existing log boundary');
    t.equal(sends[1].receiptMatches, true);
    t.equal(sends[1].priorReceiptStatus, ReplicaOperationResponseStatus.INITIATED);
    t.equal(sends[1].routineWake, false);
    t.equal(sends[1].attemptToken, request.createAdmissionAttemptToken);
    operation.createAdmissionAttemptToken = request.createAdmissionAttemptToken = 'attempt-2';
    operation.createAdmissionAttemptSeq = request.createAdmissionAttemptSeq = 2;
    await run();
    t.equal(deliveries, 3, 'a different attempt requires its own reply');
    boot = operation.createAdmissionOwnerIncarnation = 2;
    await run();
    t.equal(deliveries, 4, 'a restarted target must acknowledge again');
    deliver = () => buildDeliveryEnvelope({acknowledged: false});
    await run(false);
    await run();
    t.equal(deliveries, 6, 'lost acknowledgement leaves the next send eligible');
    deliver = () => buildDeliveryEnvelope({acknowledged: true}, {...reply, createWorkerReceipt: worker(), replicaId: 'other'});
    await run();
    await run();
    t.equal(deliveries, 8, 'a reply for another replica cannot establish custody');
    deliver = () => {
      const response = confirmed();
      boot += 1;
      return response;
    };
    await run();
    operation.createAdmissionOwnerIncarnation = boot;
    await run();
    t.equal(deliveries, 10, 'an answer spanning a target boot change cannot be reused');
    operation.createAdmissionOwnerIncarnation = boot;
    deliver = confirmed;
    await run();
    operation.createAdmissionState = 'ROTATING';
    await run();
    t.equal(deliveries, 12, 'rotation invalidates permission to reuse an otherwise identical receipt');
    boot = null;
    await run();
    await run();
    t.equal(deliveries, 14, 'missing target incarnation leaves each recovery send eligible');

    boot = operation.createAdmissionOwnerIncarnation = 3;
    operation.createAdmissionState = 'MATERIALIZED';
    reply.status = ReplicaOperationResponseStatus.IN_PROGRESS;
    for (const overrides of [null, {attemptToken: 'provisional'}, {ownerIncarnation: 2},
      {replicaCreatedAt: 99}, {partitionId: 'other'}]) {
      deliver = () => buildDeliveryEnvelope({acknowledged: true}, overrides === null ? reply :
        {...reply, createWorkerReceipt: {...worker(), ...overrides}});
      const before = deliveries;
      await run(false);
      await run();
      t.equal(deliveries - before, 2, 'IN_PROGRESS without exact live-worker proof permits redrive');
    }
    deliver = confirmed;
    await run(false);
    const before = deliveries;
    await run();
    t.equal(deliveries, before, 'the exact target worker can confirm IN_PROGRESS');
    endpointAhead = true;
    await run();
    t.equal(deliveries, before + 1, 'a newer endpoint invalidates a matching cached NODES boot');
  } finally {
    await coordinator.shutdown();
  }
});
