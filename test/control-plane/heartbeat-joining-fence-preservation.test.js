/**
 * Regression tests proving that HeartbeatService cannot self-promote a
 * pre-activation JOINING node.
 *
 * Bug class (epic formation-complexity-consolidation, F12): the steady-state
 * heartbeat stamped status=active, connection_state=ready, and a fresh ready
 * lease on every tick with no phase check. The JOINING formation fence held
 * only because the heartbeat service happened to start after the
 * barrier-gated ready signal — an ordering convention, not an enforced
 * contract. A heartbeat started early (legacy registerNode path) or kept
 * running across an in-process rejoin would silently re-stamp ACTIVE.
 *
 * Owner path verified: HeartbeatService.sendHeartbeat defers to the durable
 * own-node row; while it is JOINING the heartbeat renews liveness only
 * (CONNECTED, status preserved, lease untouched), matching the join
 * barrier's heartbeat-only publication. Once the barrier-gated ready signal
 * flips the row to active, full READY publication resumes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  HeartbeatService as RawHeartbeatService,
} from '../../src/control-plane/heartbeat-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {NODE_STATE, SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';

const TEST_NODE_ID = 'node-joining-fence';
const TEST_NODE_ADDRESS = '10.0.0.98:8080';
const TEST_CREATED_AT = 40000;
const TEST_EXISTING_LEASE = 41000;
const TEST_NOW = 60000;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCacheWithNodeRow(nodeRow) {
  return {
    get: (tableName, key) => {
      if (tableName === SYSTEM_TABLE_NAME.NODES && key === TEST_NODE_ID) {
        return nodeRow;
      }
      return null;
    },
  };
}

function createHeartbeatService(options = {}) {
  const controlPlaneSystemTableGateway =
    new ControlPlaneSystemTableGateway({
      nodeId: options.nodeId || null,
      cdcIntegrationService: options.cdcIntegrationService || null,
      sqlQueryEngine: null,
      systemTableCache: options.systemTableCache || null,
      messageRouter: null,
    });
  return new RawHeartbeatService({
    ...options,
    controlPlaneSystemTableGateway,
  });
}

async function captureHeartbeatReporterPayload(nodeRow, options = {}) {
  let reportedPayload = null;
  const service = createHeartbeatService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    systemTableCache: createCacheWithNodeRow(nodeRow),
    nodeMetadataMinUpdateIntervalMs: 0,
    nodeMetadataMaxStalenessMs: 5000,
    nodeStateReporter: async (payload) => {
      reportedPayload = payload;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: 'seed-1/message-group/mg-1',
      };
    },
    now: () => TEST_NOW,
    ...options,
  });
  await service.sendHeartbeat(null, null);
  return reportedPayload;
}

test('heartbeat for a JOINING node renews liveness only: no ACTIVE stamp, ' +
  'no READY state, no ready-lease grant',
async (t) => {
  initEnv();
  try {
    const payload = await captureHeartbeatReporterPayload({
      node_id: TEST_NODE_ID,
      node_address: TEST_NODE_ADDRESS,
      created_at: TEST_CREATED_AT,
      status: NODE_STATE.JOINING,
      connection_state: STATE.CONNECTED,
      ready_lease_expires_at: TEST_EXISTING_LEASE,
    });

    t.ok(payload, 'reporter should receive heartbeat payload');
    t.equal(
      payload.state,
      STATE.CONNECTED,
      'pre-activation heartbeat must publish CONNECTED, not READY',
    );
    t.equal(
      payload.nodeRow.status,
      NODE_STATE.JOINING,
      'pre-activation heartbeat must preserve status=joining',
    );
    t.equal(
      payload.nodeRow.ready_lease_expires_at,
      TEST_EXISTING_LEASE,
      'pre-activation heartbeat must not extend the ready lease',
    );
    t.equal(
      payload.nodeRow.last_heartbeat,
      TEST_NOW,
      'pre-activation heartbeat must still renew liveness',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('a READY local lifecycle authorizes promotion of a still-JOINING row: ' +
  'the seed self-promotes at bootstrap completion, a joiner after its ' +
  'barrier-gated join completes, even before the ACTIVE flip propagates',
async (t) => {
  initEnv();
  try {
    const payload = await captureHeartbeatReporterPayload(
      {
        node_id: TEST_NODE_ID,
        node_address: TEST_NODE_ADDRESS,
        created_at: TEST_CREATED_AT,
        status: NODE_STATE.JOINING,
        connection_state: STATE.CONNECTED,
        ready_lease_expires_at: null,
      },
      {isNodeLifecycleReady: () => true},
    );

    t.equal(payload.state, STATE.READY, 'lifecycle-ready publishes READY');
    t.equal(
      payload.nodeRow.status,
      SERVICE_STATUS.ACTIVE,
      'lifecycle-ready promotes status to active',
    );
    t.ok(
      payload.nodeRow.ready_lease_expires_at > TEST_NOW,
      'lifecycle-ready grants the ready lease',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('heartbeat for an activated node resumes full READY publication with ' +
  'a fresh ready lease',
async (t) => {
  initEnv();
  try {
    const payload = await captureHeartbeatReporterPayload({
      node_id: TEST_NODE_ID,
      node_address: TEST_NODE_ADDRESS,
      created_at: TEST_CREATED_AT,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      ready_lease_expires_at: TEST_EXISTING_LEASE,
    });

    t.ok(payload, 'reporter should receive heartbeat payload');
    t.equal(
      payload.state,
      STATE.READY,
      'activated heartbeat publishes READY',
    );
    t.equal(
      payload.nodeRow.status,
      SERVICE_STATUS.ACTIVE,
      'activated heartbeat publishes status=active',
    );
    t.ok(
      payload.nodeRow.ready_lease_expires_at > TEST_NOW,
      'activated heartbeat grants a fresh ready lease',
    );
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
