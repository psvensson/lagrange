import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';
import {
  AUTHORITATIVE_REPAIR_TRIGGER,
} from '../../src/admin/admin-authoritative-repair-policy.js';
import {
  ControlPlaneSnapshotOwner,
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {TABLES} from '../../src/constants/index.js';

const NOW_MS = 100_000;
const NODE_STATUS_ACTIVE = 'active';
const NODE_STATUS_STOPPED = 'stopped';
const CONNECTION_STATE_READY = 'ready';
const CONNECTION_STATE_DISCONNECTED = 'disconnected';

function buildNodeRow(nodeId, overrides = {}) {
  return {
    node_id: nodeId,
    status: NODE_STATUS_ACTIVE,
    connection_state: CONNECTION_STATE_READY,
    last_heartbeat: NOW_MS - 12_000,
    ready_lease_expires_at: NOW_MS + 3_000,
    ...overrides,
  };
}

function buildSystemTableCache(nodeRows) {
  return {
    getAll(tableName) {
      return tableName === TABLES.NODES ? nodeRows : [];
    },
  };
}

function buildControlSnapshot(nodeRows) {
  return new AdminControlSnapshot({
    nodeId: 'node-seed',
    systemTableCache: buildSystemTableCache(nodeRows),
    cacheMutationTarget: {applySystemTableChange() {}},
    ensureAuthoritativeDiscoveryCacheRepair: async () => ({applied: true}),
    nowFn: () => NOW_MS,
  });
}

function buildLocalSnapshot() {
  return {
    capturedAt: NOW_MS,
    replicaOperations: {
      inFlightCount: 0,
      staleInFlightCount: 0,
    },
    leaders: {},
    controlPlaneDiagnostics: {},
  };
}

test('snapshot owner treats staggered heartbeats as fresh within owner leases',
  async (t) => {
    const controlSnapshot = buildControlSnapshot([
      buildNodeRow('node-seed'),
      buildNodeRow('node-1', {last_heartbeat: NOW_MS - 9_000}),
      buildNodeRow('node-2', {last_heartbeat: NOW_MS - 7_000}),
      buildNodeRow('node-3', {last_heartbeat: NOW_MS - 5_500}),
      buildNodeRow('node-4', {last_heartbeat: NOW_MS - 2_500}),
    ]);
    const owner = new ControlPlaneSnapshotOwner({controlSnapshot});

    const result = await owner.resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );

    t.equal(
      result.snapshotObservation.state,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
      'owner-authored unexpired leases bound tolerated heartbeat age',
    );
    t.notOk(
      result.snapshotObservation.reasonCodes.includes(
        AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
      ),
      'heartbeat cadence alone cannot create a stale watermark',
    );
    t.end();
  });

test('snapshot owner keeps expired or missing lease evidence stale',
  async (t) => {
    for (const nodeRow of [
      buildNodeRow('expired', {
        last_heartbeat: NOW_MS - 1_000,
        ready_lease_expires_at: NOW_MS - 1,
      }),
      buildNodeRow('missing', {
        last_heartbeat: NOW_MS - 1_000,
        ready_lease_expires_at: null,
      }),
    ]) {
      const controlSnapshot = buildControlSnapshot([nodeRow]);
      const owner = new ControlPlaneSnapshotOwner({controlSnapshot});
      const result = await owner.resolveControlSnapshot(
        buildLocalSnapshot(),
        {allowAuthoritativeRepair: false},
      );

      t.equal(
        result.snapshotObservation.state,
        CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
        `${nodeRow.node_id} lease evidence remains fail-closed`,
      );
      t.ok(
        result.snapshotObservation.reasonCodes.includes(
          AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
        ),
        `${nodeRow.node_id} lease evidence schedules freshness repair`,
      );
    }

    const stoppedSnapshot = buildControlSnapshot([
      buildNodeRow('stopped', {
        status: NODE_STATUS_STOPPED,
        connection_state: CONNECTION_STATE_DISCONNECTED,
        last_heartbeat: null,
        ready_lease_expires_at: null,
      }),
    ]);
    const stoppedOwner = new ControlPlaneSnapshotOwner({
      controlSnapshot: stoppedSnapshot,
    });
    const stoppedResult = await stoppedOwner.resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );
    t.equal(
      stoppedResult.snapshotObservation.state,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.FRESH,
      'terminal disconnected rows do not poison active-node freshness',
    );
    t.end();
  });

test('snapshot owner schedules bounded repair after lease expiry',
  async (t) => {
    const scheduledRepairs = [];
    const controlSnapshot = buildControlSnapshot([
      buildNodeRow('expired', {
        ready_lease_expires_at: NOW_MS - 1,
      }),
    ]);
    const owner = new ControlPlaneSnapshotOwner({
      controlSnapshot,
      serviceDiscovery: {
        buildAuthoritativeDiscoveryRepairScheduleDecision() {
          return {state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED};
        },
        scheduleAuthoritativeDiscoveryCacheRepair(options) {
          scheduledRepairs.push(options);
        },
      },
    });

    const result = await owner.resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: true},
    );

    t.equal(
      result.snapshotObservation.state,
      CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.STALE_BUT_USABLE,
    );
    t.equal(
      result.snapshotObservation.refreshState,
      CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED,
    );
    t.equal(scheduledRepairs.length, 1);
    t.ok(scheduledRepairs[0].triggerCodes.includes(
      AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
    ));
    t.end();
  });
