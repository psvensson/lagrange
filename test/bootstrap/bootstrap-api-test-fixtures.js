import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SERVER_IDENTITY_STATE} from '../../src/bootstrap/join-cluster-identity.js';

const TEST_CLUSTER_ID = '00000000-0000-4000-8000-000000000000';

/**
 * For test files about other bootstrap concerns: every BootstrapAPI in this
 * process knows its cluster identity (the durable owner's KNOWN answer), so
 * the join identity gate (join-cluster-identity.js, witnessed in
 * cluster-identity-join-gate.test.js) admits and the response carries the id.
 * @param {string} [clusterId]
 */
export function answerKnownClusterIdentity(clusterId = TEST_CLUSTER_ID) {
  BootstrapAPI.prototype.readClusterIdentity = async () => Object.freeze({
    state: SERVER_IDENTITY_STATE.KNOWN, reason: null, cause: null,
    facts: Object.freeze({clusterId}),
  });
}

const EMPTY_REASONS = Object.freeze([]);

function createCanonicalReadyNodeSnapshot(nodeId) {
  const dimensions = Object.freeze({
    [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
  });
  const projectionReadinessContract = buildProjectionReadinessContract({
    dimensions,
  });
  return Object.freeze({
    nodeId,
    ready: projectionReadinessContract.ready,
    dimensions,
    projectionReadinessContract,
    reasons: EMPTY_REASONS,
  });
}

export function createCanonicalReadinessService(readyNodeIds) {
  const readinessByNodeId = new Map(
    readyNodeIds.map((nodeId) => [
      nodeId,
      createCanonicalReadyNodeSnapshot(nodeId),
    ]),
  );
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      return readinessByNodeId.get(nodeId) || null;
    },
  });
}

export const BOOTSTRAP_LEADER_NOT_READY_STARTUP_AUTHORITY = Object.freeze({
  state: 'recovery_pending',
  ready: false,
  authorityAvailable: true,
  publication: Object.freeze({
    observationState: 'establishing',
  }),
  canonicalStartupNodeIds: Object.freeze(['seed-node-1']),
  failure: Object.freeze({
    state: 'none',
  }),
});

export function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

export function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}
