/**
 * Regression: internal topology actions (rebalance add, split
 * provisioning) gate on repairEligible only and are NOT blocked by
 * serve-only readiness dimensions.
 *
 * Validates the readiness stratification fix from
 * topology-workflow-single-owner-stabilization §5 / task 6.2:
 *   StorageAdmissionService.collectFailedDimensions checks
 *   repairEligible instead of all dimensions.
 *   A node that is repair-eligible but NOT serve-eligible (e.g.
 *   loadReady = false while warming up) is correctly admitted for
 *   internal topology work.
 *
 * Requirements: 4.2, 4.4, 8.1
 * Uses: StorageAdmissionService as canonical admission owner
 */

import {test} from '../../src/test-helpers/tap.js';
import {StorageAdmissionService} from
  '../../src/rebalancer/storage-admission-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM} from '../../src/constants/index.js';
import {
  ADMISSION_MODE,
} from '../../src/rebalancer/storage-capacity-constants.js';

/**
 * Fixture constants for node and capacity identities.
 */
const FIXTURE_NODE_ID = 'node-repair-eligible';
const FIXTURE_ESTIMATED_BYTES = NUM.THOUSAND;
const FIXTURE_BUDGET_BYTES = NUM.THOUSAND * NUM.THOUSAND;

/**
 * Build a readiness snapshot where the node is repair-eligible but NOT
 * serve-eligible. repairEligible = true, serveEligible = false.
 * loadReady = false simulates a node still warming up.
 *
 * @param {string} nodeId
 * @return {Object} Readiness snapshot.
 */
function buildRepairEligibleNotServeEligible(nodeId) {
  return {
    nodeId,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        true,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    },
    reasons: [
      {
        code: CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
        dimension:
          CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
      },
    ],
  };
}

/**
 * Create a controlled readiness service that returns the given snapshot
 * for the fixture node.
 * @param {Object} snapshot - Readiness snapshot for the fixture node.
 * @return {Object} Mock readiness service.
 */
function createReadinessService(snapshot) {
  return {
    getNodeReadinessSync: (nodeId) => {
      if (nodeId === FIXTURE_NODE_ID) return snapshot;
      return buildRepairEligibleNotServeEligible(nodeId);
    },
    getNodeReadiness: async (nodeId) => {
      if (nodeId === FIXTURE_NODE_ID) return snapshot;
      return buildRepairEligibleNotServeEligible(nodeId);
    },
    getAllNodeReadiness: async () => [snapshot],
    getNodeRow: () => null,
  };
}

/**
 * Create a mock accounting service with ample capacity.
 * @return {Object} Mock accounting service.
 */
function createMockAccounting() {
  return {
    getNodeCapacity: () => ({
      totalBytes: FIXTURE_BUDGET_BYTES,
      usedBytes: NUM.ZERO,
      reservedBytes: NUM.ZERO,
      availableBytes: FIXTURE_BUDGET_BYTES,
    }),
    getCapacitySnapshotForNode: () => ({
      budgetBytes: FIXTURE_BUDGET_BYTES,
      usedBytes: NUM.ZERO,
      reservedBytes: NUM.ZERO,
    }),
    estimateReplicaBytes: () => FIXTURE_ESTIMATED_BYTES,
  };
}

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: FIXTURE_NODE_ID},
      logging: {level: 'error'},
      rebalancer: {
        storageAdmissionMode: ADMISSION_MODE.ENFORCE,
      },
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

// ── Regression: repair-eligible nodes admitted for topology work ─────

test('rebalance add admission allows repair-eligible node even when ' +
  'not serve-eligible ' +
  '(uses StorageAdmissionService.collectFailedDimensions with ' +
  'repairEligible gate)',
async (t) => {
  initEnv();

  const snapshot =
    buildRepairEligibleNotServeEligible(FIXTURE_NODE_ID);
  const readinessService = createReadinessService(snapshot);
  const accounting = createMockAccounting();

  const admission = new StorageAdmissionService({
    nodeId: FIXTURE_NODE_ID,
    accountingService: accounting,
    controlPlaneReadinessService: readinessService,
  });

  // ── Precondition: node is repair-eligible but not serve-eligible ──
  await t.test('precondition: repair-eligible, not serve-eligible',
    async (t) => {
      t.equal(
        snapshot.dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE
        ],
        true,
        'node must be repair-eligible',
      );
      t.equal(
        snapshot.dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE
        ],
        false,
        'node must not be serve-eligible',
      );
      t.equal(
        snapshot.dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY
        ],
        false,
        'loadReady must be false (node warming up)',
      );
    });

  // ── Rebalance add: internal topology work gates on repairEligible ──
  await t.test('rebalance add admission succeeds for ' +
    'repair-eligible node', async (t) => {
    const result = await admission.checkAdd({
      targetNodeId: FIXTURE_NODE_ID,
      estimatedBytes: FIXTURE_ESTIMATED_BYTES,
    });

    t.equal(
      result.allowed,
      true,
      'repair-eligible node must be admitted for rebalance add',
    );

    const ineligible = result.ineligibleNodes || [];
    t.equal(
      ineligible.length,
      NUM.ZERO,
      'no nodes must be ineligible when repair-eligible',
    );
  });
});

test('split provisioning admission allows repair-eligible node even ' +
  'when not serve-eligible ' +
  '(uses StorageAdmissionService.collectFailedDimensions with ' +
  'repairEligible gate)',
async (t) => {
  initEnv();

  const snapshot =
    buildRepairEligibleNotServeEligible(FIXTURE_NODE_ID);
  const readinessService = createReadinessService(snapshot);
  const accounting = createMockAccounting();

  const admission = new StorageAdmissionService({
    nodeId: FIXTURE_NODE_ID,
    accountingService: accounting,
    controlPlaneReadinessService: readinessService,
  });

  const result = await admission.checkSplit({
    targetNodeIds: [FIXTURE_NODE_ID],
    estimatedBytes: FIXTURE_ESTIMATED_BYTES,
    requiredReplicaCount: NUM.ONE,
  });

  t.equal(
    result.allowed,
    true,
    'repair-eligible node must be admitted for split provisioning',
  );
});

// ── Negative: not-repair-eligible node is still blocked ─────────────

test('admission blocks node that is not repair-eligible ' +
  '(uses StorageAdmissionService.collectFailedDimensions with ' +
  'repairEligible gate)',
async (t) => {
  initEnv();

  const snapshot = {
    nodeId: FIXTURE_NODE_ID,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    },
    reasons: [
      {
        code: CONTROL_PLANE_READINESS_REASON
          .CLUSTER_MEMBER_UNHEALTHY,
        dimension:
          CONTROL_PLANE_READINESS_DIMENSION
            .CLUSTER_MEMBER_HEALTHY,
      },
    ],
  };

  const readinessService = createReadinessService(snapshot);
  const accounting = createMockAccounting();

  const admission = new StorageAdmissionService({
    nodeId: FIXTURE_NODE_ID,
    accountingService: accounting,
    controlPlaneReadinessService: readinessService,
  });

  const result = await admission.checkAdd({
    targetNodeId: FIXTURE_NODE_ID,
    estimatedBytes: FIXTURE_ESTIMATED_BYTES,
  });

  t.equal(
    result.allowed,
    false,
    'not-repair-eligible node must be blocked',
  );

  const ineligible = result.ineligibleNodes || [];
  t.ok(
    ineligible.length > NUM.ZERO,
    'node must appear in ineligible list',
  );
  const failedDims = ineligible[NUM.ZERO].failedDimensions;
  t.ok(
    failedDims.includes(
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
    ),
    'clusterMemberHealthy must be among failed dimensions',
  );
});
