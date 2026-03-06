import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';

function createWorkflowCoordinatorSpy() {
  const coordinator = new DurableWorkflowCoordinator();
  const ownerKeys = [];
  const originalRunExclusive =
    coordinator.runExclusive.bind(coordinator);

  coordinator.ownerKeys = ownerKeys;
  coordinator.runExclusive = (ownerKey, executionFactory) => {
    ownerKeys.push(ownerKey);
    return originalRunExclusive(ownerKey, executionFactory);
  };

  return coordinator;
}

function createStorageOwners() {
  return {
    storageAccountingService: {
      estimateReplicaBytes: () => 1,
    },
    storageAdmissionService: {
      async checkAdd() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
  };
}

test('RebalanceCoordinator executeOperation skips operations owned by another node',
  async (t) => {
    let deliverCalls = 0;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          deliverCalls += 1;
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const operation = {
        operationId: 'op-owned-remote',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r2',
        sourceNodeId: 'node-remote',
        targetNodeId: 'node-local',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      const result = await coordinator.executeOperation(operation);

      t.equal(result.success, false);
      t.equal(result.skipped, true);
      t.equal(
        result.reason,
        REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE,
      );
      t.equal(
        deliverCalls,
        0,
        'non-owner coordinator must not dispatch operation requests',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.PENDING,
        'workflow step should remain unchanged when non-owner skips execution',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator createOperation uses injected workflow coordinator single-flight',
  async (t) => {
    const workflowCoordinator = createWorkflowCoordinatorSpy();
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      operationWorkflowCoordinator: workflowCoordinator,
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'completed'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(_sql) {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      await coordinator.createOperation({
        type: 'ADD',
        partitionId: 'partition-1',
        nodeId: 'node-remote',
      });

      t.equal(
        workflowCoordinator.ownerKeys.length,
        1,
        'createOperation should be guarded by shared workflow single-flight',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator executeOperation uses injected workflow coordinator single-flight',
  async (t) => {
    const workflowCoordinator = createWorkflowCoordinatorSpy();
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      operationWorkflowCoordinator: workflowCoordinator,
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(_sql, _params) {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const operation = {
        operationId: 'op-single-flight',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r2',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      await coordinator.executeOperation(operation);

      t.equal(
        workflowCoordinator.ownerKeys.length,
        1,
        'executeOperation should be guarded by shared workflow single-flight',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator checkTimeouts reconciles only local-owner operations',
  async (t) => {
    const now = Date.now();
    const reconciledOperationIds = [];
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    coordinator.queryIncompleteOperations = async () => {
      return [
        {
          operationId: 'op-remote-owner',
          type: 'ADD',
          partitionId: 'partition-1',
          replicaId: 'partition-1-r1',
          sourceNodeId: 'node-remote',
          targetNodeId: 'node-local',
          status: 'creating',
          workflowStep: WORKFLOW_STEP.CREATING,
          createdAt: now - 1000,
          updatedAt: now - 50,
          completedAt: null,
          errorMessage: null,
          stepsHistory: [],
        },
        {
          operationId: 'op-local-owner',
          type: 'ADD',
          partitionId: 'partition-1',
          replicaId: 'partition-1-r2',
          sourceNodeId: 'node-local',
          targetNodeId: 'node-local',
          status: 'creating',
          workflowStep: WORKFLOW_STEP.CREATING,
          createdAt: now - 1000,
          updatedAt: now - 50,
          completedAt: null,
          errorMessage: null,
          stepsHistory: [],
        },
      ];
    };
    coordinator.reconcileOperationProgress = async (operation) => {
      reconciledOperationIds.push(operation.operationId);
      return false;
    };
    coordinator.reconcileReservations = async () => {
      return {expired: 0, orphansReleased: 0};
    };
    coordinator.failOperation = async () => {};

    try {
      await coordinator.checkTimeouts();
      t.same(
        reconciledOperationIds,
        ['op-local-owner'],
        'timeout reconciliation must skip non-owner operations',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator timeout sweeps fail overdue operations before verify windows',
  async (t) => {
    const originalDateNow = Date.now;
    const baseNowMs = 5_000_000;
    let nowMs = baseNowMs;
    Date.now = () => nowMs;

    const operation = {
      operationId: 'op-timeout-window-gap',
      type: 'REPLACE',
      partitionId: 'partition-1',
      replicaId: 'partition-1-r1',
      sourceNodeId: 'node-local',
      targetNodeId: 'node-remote',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.SENDING,
      createdAt: baseNowMs - 40_000,
      updatedAt: baseNowMs - 29_900,
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };
    let failedCount = 0;

    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], affectedRows: 0};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    coordinator.queryIncompleteOperations = async () => {
      if (failedCount > 0) {
        return [];
      }
      return [operation];
    };
    coordinator.reconcileOperationProgress = async () => false;
    coordinator.reconcileReservations = async () => ({
      expired: 0,
      orphansReleased: 0,
    });
    coordinator.failOperation = async () => {
      failedCount += 1;
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = 'failed';
      operation.completedAt = nowMs;
      operation.updatedAt = nowMs;
    };

    try {
      const verifyWindowAtMs = baseNowMs + 4_100;
      for (
        let sweepAtMs = baseNowMs + coordinator.timeoutCheckIntervalMs;
        sweepAtMs <= verifyWindowAtMs;
        sweepAtMs += coordinator.timeoutCheckIntervalMs
      ) {
        nowMs = sweepAtMs;
        await coordinator.checkTimeouts();
      }

      nowMs = verifyWindowAtMs;
      t.equal(
        failedCount > 0,
        true,
        'overdue operation should be failed before verification snapshot window',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

import {
  OPERATION_TRANSITION_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';

test('RebalanceCoordinator updateStep persists durable transition fields',
  async (t) => {
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery() {
          return {success: true, rows: [], changes: 1};
        },
      },
      ...createStorageOwners(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const operation = {
        operationId: 'op-durable-step',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: 'partition',
        entityId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId: 'node-remote',
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [],
      };

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.equal(operation.workflowStep, WORKFLOW_STEP.SENDING);
      t.equal(operation.stepsHistory.length, 1);

      const entry = operation.stepsHistory[0];
      t.equal(entry.step, WORKFLOW_STEP.SENDING, 'step field present');
      t.equal(
        entry.previousStep,
        WORKFLOW_STEP.PENDING,
        'previousStep must be persisted',
      );
      t.equal(
        entry.reason,
        OPERATION_TRANSITION_REASON.DISPATCH_SENDING,
        'reason must be persisted',
      );
      t.ok(
        typeof entry.timestamp === 'number' && entry.timestamp > 0,
        'timestamp must be persisted',
      );
      t.equal(
        entry.ownerKey,
        'op-durable-step',
        'ownerKey must be persisted',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

test('RebalanceCoordinator completeOperation persists durable transition ' +
  'fields', async (t) => {
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'completed'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    ...createStorageOwners(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = {
      operationId: 'op-complete-durable',
      type: 'ADD',
      partitionId: 'partition-1',
      entityType: 'partition',
      entityId: 'partition-1',
      replicaId: 'partition-1-r1',
      sourceNodeId: 'node-local',
      targetNodeId: 'node-remote',
      status: 'syncing',
      workflowStep: WORKFLOW_STEP.SYNCING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    await coordinator.completeOperation(operation);

    t.equal(operation.workflowStep, WORKFLOW_STEP.ACTIVE);
    t.equal(operation.stepsHistory.length, 1);

    const entry = operation.stepsHistory[0];
    t.equal(
      entry.previousStep,
      WORKFLOW_STEP.SYNCING,
      'previousStep must be persisted on completion',
    );
    t.equal(
      entry.reason,
      OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
      'reason must be persisted on completion',
    );
    t.ok(entry.timestamp > 0, 'timestamp must be persisted');
    t.equal(entry.ownerKey, 'op-complete-durable');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator failOperation persists durable transition ' +
  'fields', async (t) => {
  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: false, error: 'test error'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    ...createStorageOwners(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = {
      operationId: 'op-fail-durable',
      type: 'ADD',
      partitionId: 'partition-1',
      entityType: 'partition',
      entityId: 'partition-1',
      replicaId: 'partition-1-r1',
      sourceNodeId: 'node-local',
      targetNodeId: 'node-remote',
      status: 'creating',
      workflowStep: WORKFLOW_STEP.CREATING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    await coordinator.failOperation(operation, 'test failure reason');

    t.equal(operation.workflowStep, WORKFLOW_STEP.FAILED);
    t.equal(operation.stepsHistory.length, 1);

    const entry = operation.stepsHistory[0];
    t.equal(
      entry.previousStep,
      WORKFLOW_STEP.CREATING,
      'previousStep must be persisted on failure',
    );
    t.equal(
      entry.reason,
      OPERATION_TRANSITION_REASON.OPERATION_FAILED,
      'reason must be persisted on failure',
    );
    t.ok(entry.timestamp > 0, 'timestamp must be persisted');
    t.equal(entry.ownerKey, 'op-fail-durable');
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator updateStep routes through workflow ' +
  'coordinator transitionStep', async (t) => {
  const workflowCoordinator = createWorkflowCoordinatorSpy();
  const transitionCalls = [];
  const originalTransitionStep =
    workflowCoordinator.transitionStep.bind(workflowCoordinator);
  workflowCoordinator.transitionStep = async (...args) => {
    transitionCalls.push(args);
    return originalTransitionStep(...args);
  };

  const coordinator = new RebalanceCoordinator({
    nodeId: 'node-local',
    operationWorkflowCoordinator: workflowCoordinator,
    systemTableCache: {
      get() {
        return null;
      },
    },
    cdcIntegrationService: {
      async waitForCacheUpdate() {},
    },
    tablePolicyService: {
      async getPolicyForPartition() {
        return {minReplicaCount: 1};
      },
    },
    messageRouter: {
      async deliver() {
        return {acknowledged: true, status: 'initiated'};
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: [], changes: 1};
      },
    },
    ...createStorageOwners(),
    enableTimeouts: false,
  });
  coordinator.initialize();

  try {
    const operation = {
      operationId: 'op-route-check',
      type: 'ADD',
      partitionId: 'partition-1',
      entityType: 'partition',
      entityId: 'partition-1',
      replicaId: 'partition-1-r1',
      sourceNodeId: 'node-local',
      targetNodeId: 'node-remote',
      status: 'pending',
      workflowStep: WORKFLOW_STEP.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      errorMessage: null,
      stepsHistory: [],
    };

    await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

    t.equal(
      transitionCalls.length,
      1,
      'updateStep must route through workflow coordinator transitionStep',
    );
    t.equal(transitionCalls[0][0], 'op-route-check');
    t.equal(transitionCalls[0][1].nextStep, WORKFLOW_STEP.SENDING);
    t.ok(transitionCalls[0][1].reason);
  } finally {
    await coordinator.shutdown();
  }
});
