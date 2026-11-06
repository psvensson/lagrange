import {createMockControlPlaneReadinessService} from '../rebalancer/test-helpers.js';
/**
 * Placement fixtures use the shared readiness factory over their declared
 * node world. Storage admission, accounting and pressure remain controlled
 * boundaries for these placement/dispatch scenarios.
 */


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
  createMockControlPlaneReadinessService,
  createMockStorageAccountingService,
  createMockStorageAdmissionService,
  createMockStoragePressureBehavior,
};
