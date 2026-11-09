// A coordinator mock carrying the node's readiness service, as every
// production coordinator does (the rebalancer requires it).
import {
  createMockControlPlaneReadinessService,
  createMockCoordinator,
} from '../rebalancer/test-helpers.js';

export function createReadinessHoldingCoordinator() {
  return createMockCoordinator({
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
  });
}
