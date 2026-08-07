import {test} from '../../src/test-helpers/tap.js';
import {ProvisioningAdmissionPolicy} from '../../src/rebalancer/provisioning-admission-policy.js';
import {
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';

function createPolicy(options = {}) {
  const state = {
    nodeId: options.nodeId || 'node-local',
    controlPlaneReadinessService:
      options.controlPlaneReadinessService || null,
    storageAdmissionService:
      options.storageAdmissionService || {
        async checkAdd() {
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
        async checkReplace() {
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
      },
    storageAccountingService:
      options.storageAccountingService || {
        estimateReplicaBytes() {
          return 64;
        },
      },
    classifySystemPartition:
      typeof options.classifySystemPartition === 'function' ?
        options.classifySystemPartition :
        () => ({systemTable: false}),
  };

  const policy = new ProvisioningAdmissionPolicy({
    nodeId: state.nodeId,
    logger: {
      warn: () => {},
    },
    delegates: {
      getNodeId: () => state.nodeId,
      getControlPlaneReadinessService: () =>
        state.controlPlaneReadinessService,
      getStorageAdmissionService: () =>
        state.storageAdmissionService,
      getStorageAccountingService: () =>
        state.storageAccountingService,
      classifySystemPartition: (classificationOptions) =>
        state.classifySystemPartition(classificationOptions),
      normalizeMoveType: (moveType) => {
        if (typeof moveType !== 'string') {
          return null;
        }
        return moveType.toUpperCase();
      },
    },
  });

  return {policy, state};
}

test('resolveAdmissionCriticality remains false without classifier delegate', (t) => {
  const policy = new ProvisioningAdmissionPolicy({delegates: {}});

  t.equal(
    policy.resolveAdmissionCriticality({
      partitionId: 'control_plane_publications-p1',
    }),
    false,
    'missing delegate must not create new admission authority',
  );
  t.end();
});

test('checkProvisioningAdmission admits non storage-increasing moves', async (t) => {
  const {policy} = createPolicy();

  const result = await policy.checkProvisioningAdmission({
    type: 'REMOVE',
    partitionId: 'partition-1',
    nodeId: 'node-remote',
  });

  t.equal(result.allowed, true);
  t.equal(
    result.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
  );
});

test('checkProvisioningAdmission returns denied payload when admission blocks ADD', async (t) => {
  const {policy} = createPolicy({
    storageAdmissionService: {
      async checkAdd() {
        return {
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
          reason: 'capacity_exhausted',
          blockingReasons: [{code: 'capacity_exhausted'}],
          ineligibleNodes: [{
            nodeId: 'node-remote',
            reasonCodes: ['capacity_exhausted'],
          }],
        };
      },
      async checkReplace() {
        return {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        };
      },
    },
  });

  const result = await policy.checkProvisioningAdmission({
    type: 'ADD',
    partitionId: 'partition-1',
    nodeId: 'node-remote',
  });

  t.equal(result.allowed, false);
  t.equal(
    result.decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
  );
  t.equal(result.admissionResult.reason, 'capacity_exhausted');
});

test('ensureProvisioningAdmissionAllowed throws typed admission error', async (t) => {
  const {policy} = createPolicy({
    storageAdmissionService: {
      async checkAdd() {
        return {
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
          reason: 'capacity_exhausted',
          blockingReasons: [{code: 'capacity_exhausted'}],
          ineligibleNodes: [{
            nodeId: 'node-remote',
            reasonCodes: ['capacity_exhausted'],
          }],
        };
      },
      async checkReplace() {
        return {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
        };
      },
    },
  });

  const error = await policy.ensureProvisioningAdmissionAllowed({
    move: {
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-remote',
    },
    partitionId: 'partition-1',
    entityType: 'partition',
    entityId: 'partition-1',
    sourceNodeId: 'node-local',
  }).catch((caught) => caught);

  t.ok(error, 'should throw typed admission error');
  t.ok(
    error?.admissionResult,
    'admission errors should carry admissionResult diagnostics',
  );
  t.match(error?.message || '', /capacity_exhausted/);
});

test('evaluateProvisioningAdmission forwards critical partition context',
  async (t) => {
    const calls = [];
    const {policy} = createPolicy({
      classifySystemPartition: ({partitionId}) => ({
        systemTable: partitionId === 'control_plane_publications-p1',
      }),
      storageAdmissionService: {
        async checkAdd(options = {}) {
          calls.push({
            method: 'checkAdd',
            options: {...options},
          });
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
        async checkReplace(options = {}) {
          calls.push({
            method: 'checkReplace',
            options: {...options},
          });
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
      },
    });

    await policy.evaluateProvisioningAdmission({
      move: {
        type: 'ADD',
        partitionId: 'control_plane_publications-p1',
        nodeId: 'node-remote',
      },
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: 'node-local',
    });
    await policy.evaluateProvisioningAdmission({
      move: {
        type: 'REPLACE',
        partitionId: 'control_plane_publications-p1',
        nodeId: 'node-remote',
        sourceNodeId: 'node-local',
      },
      entityType: 'partition',
      entityId: 'control_plane_publications-p1',
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: 'node-local',
    });

    t.equal(calls.length, 2, 'expected both ADD and REPLACE admission checks');
    t.equal(
      calls[0]?.method,
      'checkAdd',
      'first call should probe ADD admission',
    );
    t.equal(
      calls[0]?.options?.isCritical,
      true,
      'critical ADD should propagate critical mode',
    );
    t.equal(
      calls[1]?.method,
      'checkReplace',
      'second call should probe REPLACE admission',
    );
    t.equal(
      calls[1]?.options?.isCritical,
      true,
      'critical REPLACE should propagate critical mode',
    );
  });

test('assertLocalControlPlaneMutationReady defers background mutation on readiness blocker',
  async (t) => {
    const {policy} = createPolicy({
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return {
            dimensions: {
              controlPlaneWritable: false,
              metadataPublicationHealthy: false,
            },
            reasons: [
              {code: 'control_plane_write_unhealthy'},
            ],
            lifecycleState: 'joining',
            nodeEvidence: {
              connectionState: 'connected',
              lastHeartbeat: Date.now(),
              readyLeaseExpiresAt: Date.now() + 1000,
            },
            capacity: {
              storageBudgetBytes: 1024,
            },
          };
        },
      },
    });

    const error = await Promise.resolve().then(() => {
      policy.assertLocalControlPlaneMutationReady({
        type: 'ADD',
        partitionId: 'partition-1',
        nodeId: 'node-remote',
        controlPlaneMutationWorkClass: 'background',
      });
    }).catch((caught) => caught);

    t.equal(
      error?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
      'background mutations should defer when local control-plane readiness is degraded',
    );
  });

function buildRecoveryDegradedReadiness({recoveryLaneOpen}) {
  return {
    dimensions: {
      controlPlaneWritable: false,
      metadataPublicationHealthy: false,
      controlPlaneRecoveryEligible: recoveryLaneOpen,
    },
    projectionReadinessContract: {
      priorityRecovery: {active: true},
    },
    reasons: [
      {code: 'control_plane_write_unhealthy'},
    ],
  };
}

test('assertLocalControlPlaneMutationReady admits priority-recovery moves ' +
  'through the recovery bypass while the recovery lane is open',
async (t) => {
  const {policy} = createPolicy({
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildRecoveryDegradedReadiness({recoveryLaneOpen: true});
      },
    },
  });

  const error = await Promise.resolve().then(() => {
    policy.assertLocalControlPlaneMutationReady({
      type: 'REPLACE',
      // partitionId only (no entityId): the bypass must resolve the
      // partition from either field alone.
      partitionId: 'sql_transactions-p1',
      nodeId: 'node-remote',
      sourceNodeId: 'node-source',
      replicaId: 'sql_transactions-p1-r1',
      controlPlaneMutationWorkClass: 'background',
    });
  }).catch((caught) => caught);

  t.equal(
    error,
    undefined,
    'the recovery actuation that reopens the writability dimensions must ' +
      'not be vetoed by those same dimensions (CL-028)',
  );

  const entityIdOnlyError = await Promise.resolve().then(() => {
    policy.assertLocalControlPlaneMutationReady({
      type: 'REPLACE',
      entityId: 'sql_transactions-p1',
      nodeId: 'node-remote',
      controlPlaneMutationWorkClass: 'background',
    });
  }).catch((caught) => caught);

  t.equal(
    entityIdOnlyError,
    undefined,
    'an entityId-only move must resolve the priority partition too',
  );
});

test('assertLocalControlPlaneMutationReady still defers priority-partition ' +
  'moves when the recovery lane is closed', async (t) => {
  const {policy} = createPolicy({
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildRecoveryDegradedReadiness({recoveryLaneOpen: false});
      },
    },
  });

  const error = await Promise.resolve().then(() => {
    policy.assertLocalControlPlaneMutationReady({
      type: 'REPLACE',
      partitionId: 'sql_transactions-p1',
      entityId: 'sql_transactions-p1',
      nodeId: 'node-remote',
      controlPlaneMutationWorkClass: 'background',
    });
  }).catch((caught) => caught);

  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'the bypass must stay scoped to an open recovery lane',
  );
});

test('assertLocalControlPlaneMutationReady still defers non-priority ' +
  'moves even while the recovery lane is open', async (t) => {
  const {policy} = createPolicy({
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return buildRecoveryDegradedReadiness({recoveryLaneOpen: true});
      },
    },
  });

  const error = await Promise.resolve().then(() => {
    policy.assertLocalControlPlaneMutationReady({
      type: 'ADD',
      partitionId: 'partition-1',
      entityId: 'partition-1',
      nodeId: 'node-remote',
      controlPlaneMutationWorkClass: 'background',
    });
  }).catch((caught) => caught);

  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'optional background churn must stay deferred on degraded nodes; the ' +
      'bypass is for priority control-plane recovery actuation only',
  );
});

test('estimateProvisioningAdmissionBytes passes the resolved real ' +
  'size_bytes through to estimateReplicaBytes', (t) => {
  const estimateCalls = [];
  const {policy} = createPolicy({
    storageAccountingService: {
      estimateReplicaBytes(options = {}) {
        estimateCalls.push(options);
        return 64;
      },
    },
  });

  policy.estimateProvisioningAdmissionBytes('partition', {
    resolvedEntitySizeBytes: 12345,
  });

  t.equal(estimateCalls.length, 1);
  t.equal(
    estimateCalls[0].sizeBytes,
    12345,
    'real size_bytes must flow into the admission estimate',
  );
  t.end();
});

test('estimateProvisioningAdmissionBytes keeps the zero floor without ' +
  'a resolved size', (t) => {
  const estimateCalls = [];
  const {policy} = createPolicy({
    storageAccountingService: {
      estimateReplicaBytes(options = {}) {
        estimateCalls.push(options);
        return 64;
      },
    },
  });

  policy.estimateProvisioningAdmissionBytes('partition');

  t.equal(estimateCalls[0].sizeBytes, 0,
    'no resolved size keeps the minimum-replica floor behavior');
  t.end();
});

test('checkProvisioningAdmission resolves the entity size through the ' +
  'coordinator delegate', async (t) => {
  const estimateCalls = [];
  const policy = new ProvisioningAdmissionPolicy({
    nodeId: 'node-local',
    logger: {warn: () => {}},
    delegates: {
      getNodeId: () => 'node-local',
      getStorageAdmissionService: () => ({
        async checkAdd() {
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
        async checkReplace() {
          return {
            allowed: true,
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          };
        },
      }),
      getStorageAccountingService: () => ({
        estimateReplicaBytes(options = {}) {
          estimateCalls.push(options);
          return 64;
        },
      }),
      classifySystemPartition: () => ({systemTable: false}),
      normalizeMoveType: (moveType) => moveType,
      resolveEntitySizeBytes: ({entityId}) =>
        entityId === 'partition-sized' ? 777 : 0,
    },
  });

  const probe = await policy.checkProvisioningAdmission({
    type: 'ADD',
    partitionId: 'partition-sized',
    nodeId: 'node-remote',
  });

  t.equal(probe.allowed, true);
  t.equal(estimateCalls.length, 1);
  t.equal(
    estimateCalls[0].sizeBytes,
    777,
    'probe admission must size on the delegate-resolved real size_bytes',
  );
  t.end();
});
