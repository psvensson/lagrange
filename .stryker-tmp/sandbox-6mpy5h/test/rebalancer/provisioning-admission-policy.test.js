// @ts-nocheck
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
    isCriticalSystemPartition:
      typeof options.isCriticalSystemPartition === 'function' ?
        options.isCriticalSystemPartition :
        () => false,
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
      isCriticalSystemPartition: (partitionId) =>
        state.isCriticalSystemPartition(partitionId),
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
      isCriticalSystemPartition: (partitionId) =>
        partitionId === 'control_plane_publications-p1',
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
