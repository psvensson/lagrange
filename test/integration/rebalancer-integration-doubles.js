/**
 * Rebalancer integration doubles shared by the multi-node placement suites:
 * an always-ready control-plane readiness service (liveness projected as
 * ready now, repair-eligible) and permissive storage admission, accounting,
 * and pressure behaviour, so the suites exercise placement and dispatch
 * rather than readiness or capacity gating.
 */

import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function createAlwaysReadyControlPlaneReadinessService() {
  return {
    projectNodeLiveness: () => ({readyNow: true}),
    getNodeReadinessSync: () => ({
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      },
    }),
  };
}

function createMockStorageAdmissionService() {
  return {
    checkAdd: async () => ({decision: 'allow'}),
    checkReplace: async () => ({decision: 'allow'}),
  };
}

function createMockStorageAccountingService() {
  return {
    estimateReplicaBytes: () => 1,
  };
}

function createMockStoragePressureBehavior() {
  return {
    shouldAllowMove: async () => ({decision: 'allow'}),
  };
}

export {
  createAlwaysReadyControlPlaneReadinessService,
  createMockStorageAccountingService,
  createMockStorageAdmissionService,
  createMockStoragePressureBehavior,
};
