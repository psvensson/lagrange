import {test} from '../../src/test-helpers/tap.js';
import {AdminControlSnapshot} from '../../src/admin/admin-control-snapshot.js';

const TEST_NODE_ID = 'node-1';
const TEST_CAPTURED_AT_MS = 1000;
const OBSERVATION_MODE_LOCAL_CACHE = 'local_cache';
const OBSERVATION_MODE_FRESH_OWNER = 'fresh_owner';
const OBSERVATION_MODE_SCHEDULED_REPAIR = 'scheduled_repair';
const OBSERVATION_MODE_REPAIR_DEFERRED = 'repair_deferred';
const OBSERVATION_MODE_FORCED_REPAIR = 'forced_repair';
const REPAIR_TRIGGER_TOPOLOGY_GAP = 'topology_gap';
const SNAPSHOT_OBSERVATION_STATE_FRESH = 'fresh';
const SNAPSHOT_OBSERVATION_STATE_STALE_USABLE = 'stale_usable';
const SNAPSHOT_REFRESH_STATE_IDLE = 'idle';
const SNAPSHOT_REFRESH_STATE_SCHEDULED = 'scheduled';
const PARTITION_LEADER_AUTHORITY_SCHEMA_VERSION = 1;
const PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS = 'partitions';
const TEST_REPLICA_SERVICE_TYPE = 'partition';
const TEST_RAFT_ROLE_LEADER = 'leader';
const TEST_PARTITION_ID = 'p1';
const TEST_PARTITION_VERSION = 7;
const TEST_PUBLICATION_EPOCH = 12;
const TEST_REPLICA_ID = 'p1-r1';
const TEST_REPLICA_ROLE_LEADER_NODE_ID = 'node-current';
const TEST_STALE_PARTITION_LEADER_NODE_ID = 'node-stale';
const TEST_DEFER_INLINE_OWNER_COMMAND_FIELD = 'deferInlineOwnerCommand';

function createSnapshot() {
  return new AdminControlSnapshot({
    nodeId: TEST_NODE_ID,
    nowFn: () => TEST_CAPTURED_AT_MS,
  });
}

function createOwnerBackedSnapshot(snapshotObservation) {
  const snapshot = new AdminControlSnapshot({
    nodeId: TEST_NODE_ID,
    nowFn: () => TEST_CAPTURED_AT_MS,
    controlPlaneSnapshotOwner: {
      async resolveControlSnapshot(localSnapshot) {
        return {
          ...localSnapshot,
          snapshotObservation,
        };
      },
    },
  });
  snapshot.buildLocalControlSnapshot = async () => ({
    nodeId: TEST_NODE_ID,
    capturedAt: TEST_CAPTURED_AT_MS,
  });
  return snapshot;
}

test('AdminControlSnapshot builds partition leader authority certificates',
  async (t) => {
    const snapshot = createSnapshot();
    const summary = snapshot.buildControlSnapshotLeaderSummary([
      {
        partition_id: TEST_PARTITION_ID,
        partition_version: TEST_PARTITION_VERSION,
        leader_node_id: TEST_NODE_ID,
      },
    ], [
      {
        service_type: TEST_REPLICA_SERVICE_TYPE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_REPLICA_ID,
        raft_role: TEST_RAFT_ROLE_LEADER,
        node_id: TEST_NODE_ID,
      },
    ], {
      publicationEpoch: TEST_PUBLICATION_EPOCH,
    });

    t.same(
      summary.partitionLeaderAuthority[TEST_PARTITION_ID],
      {
        schemaVersion: PARTITION_LEADER_AUTHORITY_SCHEMA_VERSION,
        partitionId: TEST_PARTITION_ID,
        leaderNodeId: TEST_NODE_ID,
        leaderSource: PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS,
        replicaRoleConsistent: true,
        replicaLeaderNodeIds: [TEST_NODE_ID],
        topologyEpoch: TEST_PARTITION_VERSION,
        membershipEpoch: TEST_PUBLICATION_EPOCH,
      },
      'leader authority should carry partition, leader, topology, and membership evidence',
    );
  });

test('AdminControlSnapshot keeps partition leader authority when replica-role ' +
  'leader evidence disagrees', async (t) => {
  const snapshot = createSnapshot();
  const summary = snapshot.buildControlSnapshotLeaderSummary([
    {
      partition_id: TEST_PARTITION_ID,
      partition_version: TEST_PARTITION_VERSION,
      leader_node_id: TEST_STALE_PARTITION_LEADER_NODE_ID,
    },
  ], [
    {
      service_type: TEST_REPLICA_SERVICE_TYPE,
      partition_id: TEST_PARTITION_ID,
      replica_id: TEST_REPLICA_ID,
      raft_role: TEST_RAFT_ROLE_LEADER,
      node_id: TEST_REPLICA_ROLE_LEADER_NODE_ID,
    },
  ], {
    publicationEpoch: TEST_PUBLICATION_EPOCH,
  });

  t.equal(
    summary.leaders[TEST_PARTITION_ID],
    TEST_STALE_PARTITION_LEADER_NODE_ID,
    'strict leaders should remain owned by the partition row',
  );
  t.same(
    summary.partitionLeaderAuthority[TEST_PARTITION_ID],
    {
      schemaVersion: PARTITION_LEADER_AUTHORITY_SCHEMA_VERSION,
      partitionId: TEST_PARTITION_ID,
      leaderNodeId: TEST_STALE_PARTITION_LEADER_NODE_ID,
      leaderSource: PARTITION_LEADER_AUTHORITY_SOURCE_PARTITIONS,
      replicaRoleConsistent: false,
      replicaLeaderNodeIds: [TEST_REPLICA_ROLE_LEADER_NODE_ID],
      topologyEpoch: TEST_PARTITION_VERSION,
      membershipEpoch: TEST_PUBLICATION_EPOCH,
    },
    'replica-role disagreement should stay diagnostic-only',
  );
  t.equal(
    summary.replicaRoleDiagnostics[TEST_PARTITION_ID]
      .inconsistentReplicaRoles,
    true,
    'diagnostics should still surface the replica-role disagreement',
  );
});

test('AdminControlSnapshot exposes explicit publication response state when available',
  async (t) => {
    const snapshot = createSnapshot();

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics([], {
      publicationEpoch: 12,
      status: 'ACK_PENDING',
      publishedActiveNodeIds: ['node-1'],
      requiredAckNodeIds: ['node-1', 'node-2'],
      acknowledgedNodeIds: ['node-1'],
      publishedAt: 111,
      updatedAt: 222,
      membershipLifecycleSummary: {
        publishedActiveNodeIds: ['node-1'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeIds: ['node-1', 'node-2'],
        recoveryActiveNodeSource: 'recovery_eligible_projection',
        missingPublishedRecoveryActiveNodeIds: ['node-2'],
      },
    });

    t.same(
      diagnostics.publicationObservation,
      {
        state: 'available',
        epoch: 12,
        status: 'ACK_PENDING',
      },
      'publication convergence diagnostics should expose explicit availability',
    );
    t.same(diagnostics.timestamps.publishedAt, {
      state: 'known',
      value: 111,
    });
    t.same(diagnostics.timestamps.updatedAt, {
      state: 'known',
      value: 222,
    });
  });

test('AdminControlSnapshot exposes explicit publication response state when unavailable',
  async (t) => {
    const snapshot = createSnapshot();

    const diagnostics = snapshot.resolvePublicationConvergenceDiagnostics();

    t.same(
      diagnostics,
      {
        queryEngineAvailable: false,
        queryEngineAvailability: {
          state: 'unavailable',
          reasonCode: 'sql_query_engine_unavailable',
          queryEngineAvailable: false,
        },
        publicationObservation: {
          state: 'unavailable',
        },
        timestamps: {
          publishedAt: {
            state: 'unavailable',
          },
          updatedAt: {
            state: 'unavailable',
          },
        },
      },
      'absence should be encoded explicitly instead of returning null',
    );
  });

test('AdminControlSnapshot labels local-cache observation mode',
  async (t) => {
    const snapshot = createSnapshot();
    snapshot.buildLocalControlSnapshot = async () => ({
      nodeId: TEST_NODE_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
    });

    const result = await snapshot.buildControlSnapshotQueryResult();

    t.match(
      result.rows[0],
      {
        observationMode: OBSERVATION_MODE_LOCAL_CACHE,
        adminObservation: {
          mode: OBSERVATION_MODE_LOCAL_CACHE,
          sharedOwnerResolved: false,
          repair: {
            applied: false,
            forced: false,
            deferred: false,
            failed: false,
            triggerCodes: [],
          },
        },
      },
      'local control snapshot rows should name the local-cache mode',
    );
  });

test('AdminControlSnapshot query result does not defer owner handoff commands by default',
  async (t) => {
    const snapshot = createSnapshot();
    let receivedOptions = null;
    snapshot.resolveLocalControlSnapshot = async (options = {}) => {
      receivedOptions = options;
      return {
        nodeId: TEST_NODE_ID,
        capturedAt: TEST_CAPTURED_AT_MS,
      };
    };

    await snapshot.buildControlSnapshotQueryResult();

    t.equal(
      receivedOptions?.[TEST_DEFER_INLINE_OWNER_COMMAND_FIELD],
      undefined,
      'control snapshot query results should let the owner command run inline when possible',
    );
  });

test('AdminControlSnapshot query result preserves explicit owner handoff deferral',
  async (t) => {
    const snapshot = createSnapshot();
    let receivedOptions = null;
    snapshot.resolveLocalControlSnapshot = async (options = {}) => {
      receivedOptions = options;
      return {
        nodeId: TEST_NODE_ID,
        capturedAt: TEST_CAPTURED_AT_MS,
      };
    };

    await snapshot.buildControlSnapshotQueryResult({
      [TEST_DEFER_INLINE_OWNER_COMMAND_FIELD]: true,
    });

    t.equal(
      receivedOptions?.[TEST_DEFER_INLINE_OWNER_COMMAND_FIELD],
      true,
      'explicit snapshot-query owner handoff deferral should still reach the resolver',
    );
  });

test('AdminControlSnapshot derives shared-owner observation modes',
  async (t) => {
    const freshSnapshot = createOwnerBackedSnapshot({
      state: SNAPSHOT_OBSERVATION_STATE_FRESH,
      refreshState: SNAPSHOT_REFRESH_STATE_IDLE,
    });
    const scheduledSnapshot = createOwnerBackedSnapshot({
      state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
      refreshState: SNAPSHOT_REFRESH_STATE_SCHEDULED,
    });

    const freshResult = await freshSnapshot.buildControlSnapshotQueryResult();
    const scheduledResult =
      await scheduledSnapshot.buildControlSnapshotQueryResult();

    t.equal(
      freshResult.rows[0].observationMode,
      OBSERVATION_MODE_FRESH_OWNER,
      'fresh owner snapshots should name the fresh-owner mode',
    );
    t.equal(
      scheduledResult.rows[0].observationMode,
      OBSERVATION_MODE_SCHEDULED_REPAIR,
      'scheduled owner repair snapshots should name the scheduled-repair mode',
    );
  });

test('AdminControlSnapshot labels forced repair observation mode',
  async (t) => {
    const snapshot = createSnapshot();
    snapshot.buildLocalControlSnapshot = async () => ({
      nodeId: TEST_NODE_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
    });
    snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
    snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
      shouldRepair: true,
      triggerCodes: [REPAIR_TRIGGER_TOPOLOGY_GAP],
    });
    snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => ({
      applied: true,
    });

    const result = await snapshot.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
      allowAuthoritativeRepair: true,
    });

    t.match(
      result.rows[0],
      {
        observationMode: OBSERVATION_MODE_FORCED_REPAIR,
        adminObservation: {
          mode: OBSERVATION_MODE_FORCED_REPAIR,
          repair: {
            applied: true,
            forced: true,
            deferred: false,
            failed: false,
            triggerCodes: [REPAIR_TRIGGER_TOPOLOGY_GAP],
          },
        },
      },
      'forced control snapshot rows should name the forced-repair mode',
    );
  });

test('AdminControlSnapshot preserves revisioned snapshot metadata from the shared owner contract',
  async (t) => {
    const snapshot = new AdminControlSnapshot({
      nodeId: TEST_NODE_ID,
      nowFn: () => TEST_CAPTURED_AT_MS,
      controlPlaneSnapshotOwner: {
        async resolveControlSnapshot(localSnapshot) {
          return {
            ...localSnapshot,
            snapshotObservation: {
              state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
              revision: 22,
              revisionState: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
              resumeToken: 'control-plane-revision:captured_at:22',
            },
            snapshotRevision: 22,
            snapshotRevisionState: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
            snapshotResumeToken: 'control-plane-revision:captured_at:22',
            snapshotObservedAt: '2026-04-16T12:00:00.000Z',
            snapshotObservedAtMs: 1776331200000,
          };
        },
      },
    });
    snapshot.buildLocalControlSnapshot = async () => ({
      nodeId: TEST_NODE_ID,
      capturedAt: TEST_CAPTURED_AT_MS,
      partitionLeaderAuthority: {
        p1: {
          schemaVersion: 1,
          partitionId: 'p1',
          leaderNodeId: 'node-1',
          leaderSource: 'partitions',
          topologyEpoch: 7,
          membershipEpoch: 12,
          replicaRoleConsistent: true,
          replicaLeaderNodeIds: ['node-1'],
        },
      },
    });

    const result = await snapshot.buildControlSnapshotQueryResult();

    t.match(
      result.rows[0],
      {
        snapshotObservation: {
          state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
          revision: 22,
          revisionState: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
          resumeToken: 'control-plane-revision:captured_at:22',
        },
        snapshotRevision: 22,
        snapshotRevisionState: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
        snapshotResumeToken: 'control-plane-revision:captured_at:22',
        snapshotObservedAt: '2026-04-16T12:00:00.000Z',
        snapshotObservedAtMs: 1776331200000,
        observationMode: OBSERVATION_MODE_REPAIR_DEFERRED,
        adminObservation: {
          mode: OBSERVATION_MODE_REPAIR_DEFERRED,
          sharedOwnerResolved: true,
        },
        partitionLeaderAuthority: {
          p1: {
            snapshotRevision: 22,
          },
        },
      },
      'query-result rows should preserve the revisioned snapshot owner contract',
    );
  });
