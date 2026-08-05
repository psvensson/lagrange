/**
 * Regression tests for the LeaseService stranded failed-join row reaper
 * (join-path-audit-finding-8-deferred-withdrawal-retry-owner).
 *
 * A failed-join withdrawal drives its leftover `joining` row to STOPPED on
 * the happy path; when the mutation is deferred, the in-memory reconcile
 * queue is destroyed by teardown, or the process dies first, no live writer
 * ever drives the row terminal. The reaper alongside sweepExpiredLeases owns
 * that terminal transition (status -> stopped) and reaps the row's endpoint
 * rows, never touching a row that still holds a live lease or is
 * transport-connected.
 */

import {test} from '../../src/test-helpers/tap.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {STATE} from '../../src/constants/index.js';
import {
  createMockControlPlaneSystemTableGateway,
} from './test-helpers.js';

const NOW = 1_000_000;

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

function buildNodeRow(overrides = {}) {
  return {
    node_id: 'node-x',
    node_address: 'ws://localhost:8080',
    connection_state: STATE.DISCONNECTED,
    ready_lease_expires_at: null,
    last_heartbeat: NOW - 5000,
    status: 'joining',
    created_at: NOW - 100000,
    ...overrides,
  };
}

function buildService({nodeRows, updates, isTransportConnected}) {
  initEnv();
  const gateway = createMockControlPlaneSystemTableGateway({
    readAuthoritativeRows: async () => ({success: true, rows: nodeRows}),
    updateSystemTableRow: async (tableName, whereClause, data) => {
      updates.push({tableName, whereClause, data});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  });
  const service = new LeaseService({
    nodeId: 'leader-node',
    nodeLeaseOwner: {
      disconnectNodeDueToLeaseExpiry: async () => ({
        success: true,
        partitionResult: {affectedRows: 1},
      }),
    },
    systemTableCache: {getAll: () => nodeRows},
    controlPlaneSystemTableGateway: gateway,
    messageGroupServices: [{isLeaderReplica: () => true}],
    messageRouter: isTransportConnected ?
      {getConnectionState: isTransportConnected} :
      null,
    now: () => NOW,
  });
  service.initialize();
  return service;
}

test('reaper drives a stranded joining row to STOPPED and reaps its endpoints',
  async (t) => {
    const updates = [];
    const service = buildService({
      nodeRows: [buildNodeRow({node_id: 'node-stuck'})],
      updates,
    });

    const reaped = [];
    service.on('staleRowReaped', ({nodeId}) => reaped.push(nodeId));

    await service.sweepExpiredLeases();

    const membershipUpdate = updates.find((u) =>
      u.tableName === 'nodes' && u.data.status === 'stopped');
    t.ok(membershipUpdate,
      'stranded joining row is driven to STOPPED');
    t.equal(membershipUpdate.whereClause.status, 'joining',
      'the reap is guarded on the observed joining status');
    t.ok(
      updates.some((u) =>
        u.tableName === 'node_endpoints' && u.data.status === 'inactive'),
      'node_endpoints row is reaped to inactive',
    );
    t.ok(
      updates.some((u) =>
        u.tableName === 'service_endpoints' &&
          u.data.health_status === 'unhealthy'),
      'service_endpoints rows are reaped to unhealthy',
    );
    t.same(reaped, ['node-stuck'], 'reap event names the node');
    t.end();
  });

test('reaper never touches a joining row that still holds a live lease',
  async (t) => {
    const updates = [];
    const service = buildService({
      nodeRows: [buildNodeRow({
        node_id: 'node-joining-live',
        ready_lease_expires_at: NOW + 60000,
      })],
      updates,
    });

    await service.sweepExpiredLeases();

    t.notOk(
      updates.some((u) => u.data?.status === 'stopped'),
      'a joining row with a live lease is not reaped',
    );
    t.end();
  });

test('reaper never touches a transport-connected joining row',
  async (t) => {
    const updates = [];
    const service = buildService({
      nodeRows: [buildNodeRow({node_id: 'node-connected'})],
      updates,
      isTransportConnected: () => 'connected',
    });

    await service.sweepExpiredLeases();

    t.notOk(
      updates.some((u) => u.data?.status === 'stopped'),
      'a transport-connected joining row is not reaped',
    );
    t.end();
  });

test('reaper leaves terminal and non-joining rows alone',
  async (t) => {
    const updates = [];
    const service = buildService({
      nodeRows: [
        buildNodeRow({node_id: 'node-active', status: 'active'}),
        buildNodeRow({node_id: 'node-stopped', status: 'stopped'}),
        buildNodeRow({node_id: 'node-ready', status: 'ready'}),
      ],
      updates,
    });

    await service.sweepExpiredLeases();

    t.notOk(
      updates.some((u) => u.data?.status === 'stopped'),
      'rows not stuck in joining are not reaped',
    );
    t.end();
  });
