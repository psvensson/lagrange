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

function buildSystemTableCache(nodeRows, cdcObservations = {}) {
  return {
    getAll(tableName) {
      return tableName === TABLES.NODES ? nodeRows : [];
    },
    getLastCdcObservation(tableName, key) {
      return tableName === TABLES.NODES ?
        cdcObservations[key] || null :
        null;
    },
  };
}

function buildControlSnapshot(nodeRows, cdcObservations = {}) {
  return new AdminControlSnapshot({
    nodeId: 'node-seed',
    systemTableCache: buildSystemTableCache(nodeRows, cdcObservations),
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
    t.same(result.controlPlaneDiagnostics.readyLeaseAgeWitness, {
      schemaVersion: 1,
      state: 'unavailable',
      reason: 'no_stale_active_node',
    }, 'fresh active rows publish an explicit unavailable witness variant');
    t.end();
  });

test('snapshot owner keeps expired or missing lease evidence stale',
  async (t) => {
    for (const nodeRow of [
      buildNodeRow('expired', {
        last_heartbeat: NOW_MS - 1_000,
        ready_lease_expires_at: NOW_MS - 1,
        updated_at_hlc: `${NOW_MS - 2_000}-4-write-owner`,
      }),
      buildNodeRow('missing', {
        last_heartbeat: NOW_MS - 1_000,
        ready_lease_expires_at: null,
      }),
    ]) {
      const cdcObservation = nodeRow.node_id === 'expired' ? {
        observedAtMs: NOW_MS - 1_500,
        originHlc: nodeRow.updated_at_hlc,
      } : null;
      const controlSnapshot = buildControlSnapshot(
        [nodeRow],
        cdcObservation ? {[nodeRow.node_id]: cdcObservation} : {},
      );
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
      t.equal(
        result.controlPlaneDiagnostics.readyLeaseAgeWitness.nodeId,
        nodeRow.node_id,
        `${nodeRow.node_id} is the exact row selected by the stale scan`,
      );
      t.equal(
        result.controlPlaneDiagnostics.readyLeaseAgeWitness.state,
        'available',
      );
      if (nodeRow.node_id === 'expired') {
        t.same(
          result.controlPlaneDiagnostics.readyLeaseAgeWitness,
          {
            schemaVersion: 1,
            state: 'available',
            nodeId: 'expired',
            status: NODE_STATUS_ACTIVE,
            connectionState: CONNECTION_STATE_READY,
            snapshotObservedAtMs: NOW_MS,
            heartbeat: {
              state: 'available',
              atMs: NOW_MS - 1_000,
              ageMs: 1_000,
            },
            readyLease: {
              state: 'available',
              expiresAtMs: NOW_MS - 1,
              ageMs: 1,
            },
            ownerWrite: {
              state: 'available',
              originHlc: `${NOW_MS - 2_000}-4-write-owner`,
              atMs: NOW_MS - 2_000,
              ageMs: 2_000,
            },
            cdcObservation: {
              state: 'available',
              originHlc: `${NOW_MS - 2_000}-4-write-owner`,
              observedAtMs: NOW_MS - 1_500,
              ageMs: 1_500,
              ownerToCdcDelayMs: 500,
            },
          },
          'witness correlates lease, owner write, and matching key CDC receipt',
        );
      } else {
        t.same(
          result.controlPlaneDiagnostics.readyLeaseAgeWitness.readyLease,
          {
            state: 'unavailable',
            reason: 'ready_lease_expiry_unavailable',
          },
          'missing lease is an explicit unavailable evidence variant',
        );
      }
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
    t.same(stoppedResult.controlPlaneDiagnostics.readyLeaseAgeWitness, {
      schemaVersion: 1,
      state: 'unavailable',
      reason: 'no_stale_active_node',
    });
    t.end();
  });

test('snapshot witness preserves signed ages and explicit missing evidence',
  async (t) => {
    const futureOriginHlc = `${NOW_MS + 20}-1-write-owner`;
    const futureSnapshot = buildControlSnapshot(
      [buildNodeRow('clock-skewed', {
        last_heartbeat: NOW_MS + 50,
        ready_lease_expires_at: NOW_MS - 1,
        updated_at_hlc: futureOriginHlc,
      })],
      {
        'clock-skewed': {
          observedAtMs: NOW_MS + 30,
          originHlc: futureOriginHlc,
        },
      },
    );
    const futureResult = await new ControlPlaneSnapshotOwner({
      controlSnapshot: futureSnapshot,
    }).resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );
    const futureWitness =
      futureResult.controlPlaneDiagnostics.readyLeaseAgeWitness;

    t.equal(futureWitness.heartbeat.ageMs, -50,
      'future heartbeat evidence keeps its signed age');
    t.equal(futureWitness.ownerWrite.ageMs, -20,
      'future owner HLC evidence keeps its signed age');
    t.equal(futureWitness.cdcObservation.ageMs, -30,
      'future CDC receipt evidence keeps its signed age');
    t.equal(futureWitness.cdcObservation.ownerToCdcDelayMs, 10,
      'owner-to-CDC chronology remains independently signed');

    const missingResult = await new ControlPlaneSnapshotOwner({
      controlSnapshot: buildControlSnapshot([
        buildNodeRow('missing-origin', {
          ready_lease_expires_at: NOW_MS - 1,
        }),
      ]),
    }).resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );
    const missingWitness =
      missingResult.controlPlaneDiagnostics.readyLeaseAgeWitness;
    t.same(missingWitness.ownerWrite, {
      state: 'unavailable',
      reason: 'row_origin_hlc_unavailable',
    }, 'missing owner HLC is explicit');
    t.same(missingWitness.cdcObservation, {
      state: 'unavailable',
      reason: 'per_key_cdc_observation_unavailable',
    }, 'missing per-key CDC receipt is explicit');

    const mismatchOriginHlc = `${NOW_MS - 2_000}-1-write-owner`;
    const mismatchResult = await new ControlPlaneSnapshotOwner({
      controlSnapshot: buildControlSnapshot(
        [buildNodeRow('origin-mismatch', {
          ready_lease_expires_at: NOW_MS - 1,
          updated_at_hlc: mismatchOriginHlc,
        })],
        {
          'origin-mismatch': {
            observedAtMs: NOW_MS - 1_000,
            originHlc: `${NOW_MS - 3_000}-1-other-owner`,
          },
        },
      ),
    }).resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );
    t.same(
      mismatchResult.controlPlaneDiagnostics.readyLeaseAgeWitness
        .cdcObservation,
      {
        state: 'unavailable',
        reason: 'cdc_origin_hlc_mismatch',
      },
      'CDC receipt with another origin cannot impersonate the selected row',
    );
    t.end();
  });

test('snapshot witness names the first row rejected by the existing scan',
  async (t) => {
    const controlSnapshot = buildControlSnapshot([
      buildNodeRow('fresh'),
      buildNodeRow('first-stale', {ready_lease_expires_at: NOW_MS - 1}),
      buildNodeRow('later-stale', {ready_lease_expires_at: NOW_MS - 2}),
    ]);
    const owner = new ControlPlaneSnapshotOwner({controlSnapshot});

    const result = await owner.resolveControlSnapshot(
      buildLocalSnapshot(),
      {allowAuthoritativeRepair: false},
    );

    t.equal(
      result.controlPlaneDiagnostics.readyLeaseAgeWitness.nodeId,
      'first-stale',
      'diagnostics do not introduce a second freshness detector',
    );
    t.same(
      result.snapshotObservation.reasonCodes,
      [AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK],
      'the existing repair reason remains unchanged',
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
