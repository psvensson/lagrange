/**
 * Regression tests for bounded admin diagnostics payloads on 46+ partition RF3
 * clusters with 140+ multi-step replica operations.
 *
 * Proves that GET /api/admin/diagnostics/partitions,
 * GET /api/admin/discovery/services, and GET /api/admin/control-snapshot stay
 * well under the 1 MiB transport safety bound while preserving exact aggregate
 * counts, all in-flight operations, priority-partition terminal coverage, and
 * step-entry timing without leaking heavy readiness/bootstrap blobs.
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  ADMIN_ROUTE,
} from '../../src/admin/admin-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {compactEligibilitySnapshot} from
  '../../src/control-plane/eligibility-snapshot.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {resolveOperationCurrentStepEntry} from
  '../../src/rebalancer/operation-step-age.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const PARTITION_COUNT = 46;
const COMPLETED_OP_COUNT = 140;
const IN_FLIGHT_OP_COUNT = 12;
const TERMINAL_RETENTION_LIMIT =
  ADMIN_CONTROL_SNAPSHOT.REPLICA_OPERATION_TERMINAL_ROWS_LIMIT;
const MAX_PARTITION_DIAGNOSTICS_BYTES = 256 * 1024;
const MAX_DISCOVERY_BYTES = 128 * 1024;
const MAX_CONTROL_SNAPSHOT_BYTES = 1024 * 1024;
const MAX_REPLICA_OPERATIONS_BYTES = 64 * 1024;
const FIXTURE_BOOT_INCARNATION = 1;
const BASE_TIMESTAMP_MS = 1763890000000;
const NOW_MS = BASE_TIMESTAMP_MS + 600_000;
const STALE_STOPPING_AGE_MS = 240_000;
const NODE_IDS = Object.freeze([
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
]);
const PRIORITY_PARTITION_IDS = Object.freeze([
  'control_plane_publications-p1',
  'replica_operations-p1',
  'sql_transaction_participants-p1',
  'sql_transactions-p1',
  'sql_write_operations-p1',
]);
const FORBIDDEN_HEAVY_KEYS = Object.freeze([
  'readinessSnapshot',
  'runtimeAuthority',
  'projectionReadinessContract',
  'bootstrapMembership',
  'placementAdmission',
  'peerAddresses',
  'replicaIds',
]);

function buildRealisticReadinessSnapshot(nodeId, observedAtMs) {
  return compactEligibilitySnapshot({
    nodeId,
    lifecycleState: 'ready',
    observedAt: new Date(observedAtMs).toISOString(),
    membershipPublication: {
      publicationBoundaryOutcome: {
        ready: true,
        active: false,
        reasonCodes: [],
        publicationEpoch: 4,
      },
    },
    priorityControlPlaneRecovery: {
      active: false,
      reasonCodes: [],
    },
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
    },
    runtimeAuthority: {
      state: RUNTIME_AUTHORITY_STATE.READY,
      authorityAvailable: true,
      ready: true,
      processAlive: true,
      clusterMemberHealthy: true,
      routingReady: true,
      writeEligible: true,
      recoveryEligible: true,
      repairEligible: true,
      publication: {
        state: RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY,
        healthy: true,
        mode: 'published',
        reason: null,
      },
      visibility: {
        state: RUNTIME_AUTHORITY_VISIBILITY_STATE.PUBLISHED,
        published: true,
        observedAt: new Date(observedAtMs).toISOString(),
      },
      repair: {
        state: RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
        applied: false,
        observedAt: null,
      },
      provisioning: {
        state: PROVISIONING_ELIGIBILITY_STATE.ELIGIBLE,
        eligible: true,
      },
      failure: null,
      reasonCodes: [],
    },
    reasons: [],
  }, CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE);
}

function buildRealisticStepsHistory({
  operationId,
  partitionId,
  targetNodeId,
  replicaId,
  startedAtMs,
  steps,
}) {
  const replicaIds = [
    `${partitionId}-r1`,
    `${partitionId}-r2`,
    `${partitionId}-r3`,
  ];
  const peerAddresses = [
    `${NODE_IDS[0]}/partition/${replicaIds[0]}`,
    `${NODE_IDS[1]}/partition/${replicaIds[1]}`,
    `${NODE_IDS[2]}/partition/${replicaIds[2]}`,
  ];
  return steps.map((step, stepIndex) => {
    const timestamp = startedAtMs + stepIndex * 1000;
    const entry = {
      step,
      timestamp,
      previousStep: stepIndex === 0 ? null : steps[stepIndex - 1],
      reason: `transition_${step.toLowerCase()}`,
      ownerKey: operationId,
      readinessSnapshot: buildRealisticReadinessSnapshot(
        targetNodeId,
        timestamp,
      ),
    };
    if (stepIndex === 0) {
      entry.replicaIds = replicaIds;
      entry.peerAddresses = peerAddresses;
      entry.bootstrapMembership = {
        partitionId,
        voters: replicaIds,
        learners: [replicaId],
        confEpoch: 1,
      };
      entry.placementAdmission = {
        admittedAtMs: timestamp,
        leaseEpoch: 1,
        targetNodeId,
        replicaId,
      };
    }
    return entry;
  });
}

function buildFormationPartitionIds() {
  const ids = [...PRIORITY_PARTITION_IDS];
  while (ids.length < PARTITION_COUNT) {
    ids.push(`sys_table_${String(ids.length).padStart(2, '0')}-p1`);
  }
  return ids;
}

function seedFormationNodesAndPartitions(cache, partitionIds) {
  for (let nodeIndex = 0; nodeIndex < NODE_IDS.length; nodeIndex += 1) {
    const nodeId = NODE_IDS[nodeIndex];
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      boot_incarnation: FIXTURE_BOOT_INCARNATION,
      address: `10.166.15.${216 + nodeIndex}:8080`,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: NOW_MS + 60_000,
      last_heartbeat: NOW_MS - 500,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: `${nodeId}-ws`,
      node_id: nodeId,
      transport_type: 'ws',
      status: 'active',
      address: `ws://10.166.15.${216 + nodeIndex}:8082`,
    });
  }
  cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
    boot_incarnation: FIXTURE_BOOT_INCARNATION,
    endpoint_id: 'sys-postgres-wire-node-1',
    service_id: 'sys-postgres-wire',
    node_id: NODE_IDS[0],
    protocol: 'postgresql',
    address: '10.166.15.216',
    port: 5432,
    health_status: 'healthy',
    status: 'active',
  });
  for (let idx = 0; idx < partitionIds.length; idx += 1) {
    const partitionId = partitionIds[idx];
    const tableName = partitionId.replace(/-p\d+$/, '');
    const leaderNodeId = NODE_IDS[idx % NODE_IDS.length];
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: partitionId,
      table_id: `tbl-${tableName}`,
      table_name: tableName,
      state: 'NORMAL',
      leader_node_id: leaderNodeId,
      replica_count: 3,
    });
    for (let repIndex = 0; repIndex < NODE_IDS.length; repIndex += 1) {
      const nodeId = NODE_IDS[repIndex];
      const replicaId = `${partitionId}-r${repIndex + 1}`;
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: replicaId,
        service_type: 'partition',
        partition_id: partitionId,
        replica_id: replicaId,
        node_id: nodeId,
        raft_role: nodeId === leaderNodeId ? 'leader' : 'follower',
        status: 'active',
        address: `${nodeId}/partition/${replicaId}`,
      });
    }
  }
}

function seedCompletedFormationOperations(cache, partitionIds) {
  const completedSteps = ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'];
  for (let opIndex = 0; opIndex < COMPLETED_OP_COUNT; opIndex += 1) {
    const partitionId = partitionIds[opIndex % partitionIds.length];
    const targetNodeId = NODE_IDS[(opIndex + 1) % NODE_IDS.length];
    const operationId = `op-completed-${String(opIndex).padStart(4, '0')}`;
    const replicaId = `${partitionId}-r${(opIndex % 2) + 2}`;
    const startedAtMs = BASE_TIMESTAMP_MS + opIndex * 1000;
    const completedAtMs = startedAtMs + 4000;
    const stepsHistory = buildRealisticStepsHistory({
      operationId,
      partitionId,
      targetNodeId,
      replicaId,
      startedAtMs,
      steps: completedSteps,
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: operationId,
      type: 'ADD',
      partition_id: partitionId,
      partition_group_id: partitionId,
      entity_type: 'partition',
      entity_id: partitionId,
      source_node_id: NODE_IDS[0],
      target_node_id: targetNodeId,
      replica_id: replicaId,
      status: 'active',
      workflow_step: 'ACTIVE',
      created_at: startedAtMs,
      updated_at: completedAtMs,
      completed_at: completedAtMs,
      steps_history: JSON.stringify(stepsHistory),
    });
  }
}

function resolveInFlightOperationSpec(idx, partitionId) {
  if (idx === 0) {
    return {
      type: 'REMOVE',
      workflowStep: 'STOPPING',
      status: 'removing',
      steps: ['PENDING', 'STOPPING'],
      stepEnteredAtMs: NOW_MS - STALE_STOPPING_AGE_MS,
      sourceReplicaId: '',
    };
  }
  if (idx === 1) {
    return {
      type: 'REPLACE',
      workflowStep: 'ACTIVE',
      status: 'active',
      steps: ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE'],
      stepEnteredAtMs: NOW_MS - 5000,
      sourceReplicaId: `${partitionId}-r1`,
    };
  }
  return {
    type: 'ADD',
    workflowStep: 'SYNCING',
    status: 'syncing',
    steps: ['PENDING', 'SENDING', 'CREATING', 'SYNCING'],
    stepEnteredAtMs: NOW_MS - 5000,
    sourceReplicaId: '',
  };
}

function seedInFlightFormationOperations(cache, partitionIds) {
  const inFlightOperationIds = [];
  for (let idx = 0; idx < IN_FLIGHT_OP_COUNT; idx += 1) {
    const partitionId = partitionIds[(idx + 5) % partitionIds.length];
    const operationId = `op-inflight-${String(idx).padStart(2, '0')}`;
    const spec = resolveInFlightOperationSpec(idx, partitionId);
    const startedAtMs = spec.stepEnteredAtMs - (spec.steps.length - 1) * 1000;
    const targetNodeId = NODE_IDS[(idx + 1) % NODE_IDS.length];
    const replicaId = `${partitionId}-r${idx + 4}`;
    const stepsHistory = buildRealisticStepsHistory({
      operationId,
      partitionId,
      targetNodeId,
      replicaId,
      startedAtMs,
      steps: spec.steps,
    });
    if (idx === 2) delete stepsHistory.find((entry) => entry.step === 'CREATING').timestamp;
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: operationId,
      type: spec.type,
      partition_id: partitionId,
      partition_group_id: partitionId,
      entity_type: 'partition',
      entity_id: partitionId,
      source_node_id: NODE_IDS[0],
      source_replica_id: spec.sourceReplicaId,
      target_node_id: targetNodeId,
      replica_id: replicaId,
      status: spec.status,
      workflow_step: spec.workflowStep,
      created_at: startedAtMs,
      // Retry loop re-stamps updated_at recently even when the step is stale.
      updated_at: NOW_MS - 500,
      completed_at: null,
      steps_history: JSON.stringify(stepsHistory),
    });
    inFlightOperationIds.push(operationId);
  }
  return inFlightOperationIds;
}

function populateRf3FormationCache({includeInFlight = false} = {}) {
  const cache = new SystemTableCache();
  const partitionIds = buildFormationPartitionIds();
  seedFormationNodesAndPartitions(cache, partitionIds);
  seedCompletedFormationOperations(cache, partitionIds);
  const inFlightOperationIds = includeInFlight ?
    seedInFlightFormationOperations(cache, partitionIds) :
    [];
  return {cache, partitionIds, inFlightOperationIds};
}

function assertNoHeavyKeysInSummary(t, replicaOperations, label) {
  const serialized = JSON.stringify(replicaOperations);
  for (const forbiddenKey of FORBIDDEN_HEAVY_KEYS) {
    t.equal(
      serialized.includes(`"${forbiddenKey}"`),
      false,
      `${label} must not embed heavy nested "${forbiddenKey}" blobs`,
    );
  }
}

test(
  'GET /api/admin/diagnostics/partitions stays well under 1 MiB for 46 RF3 partitions and 140 completed multi-step operations',
  async (t) => {
    const {cache, partitionIds} = populateRf3FormationCache();
    const api = new AdminWebSocketAPI({
      nodeId: NODE_IDS[0],
      nowFn: () => NOW_MS,
      systemTableCache: cache,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const payloadBytes = Buffer.byteLength(response.body, 'utf8');
    const payload = response.json();

    t.equal(response.statusCode, 200, 'partition diagnostics returns 200');
    t.ok(
      payloadBytes < MAX_PARTITION_DIAGNOSTICS_BYTES,
      `partition diagnostics (${payloadBytes} bytes) must stay below ${MAX_PARTITION_DIAGNOSTICS_BYTES} bytes`,
    );
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
      'schemaVersion is preserved',
    );
    t.equal(payload.partitionCount, PARTITION_COUNT, 'all 46 partitions are counted');
    t.equal(
      Object.keys(payload.partitionsById).length,
      PARTITION_COUNT,
      'all 46 partitionsById entries are preserved',
    );
    t.equal(
      Object.keys(payload.leaders).length,
      PARTITION_COUNT,
      'all 46 leader entries are preserved',
    );
    t.equal(
      Object.keys(payload.voterCounts).length,
      PARTITION_COUNT,
      'all 46 voterCount entries are preserved',
    );
    for (const partitionId of partitionIds) {
      t.equal(payload.partitionsById[partitionId].voterCount, 3);
      t.equal(payload.partitionsById[partitionId].replicas.length, 3);
    }

    const summary = payload.replicaOperations;
    t.equal(summary.inFlightCount, 0, 'inFlightCount stays exact');
    t.equal(
      summary.statusHistogram.active,
      COMPLETED_OP_COUNT,
      'statusHistogram still counts all 140 completed rows',
    );
    t.equal(
      summary.totalRowCount,
      COMPLETED_OP_COUNT,
      'totalRowCount reports all 140 rows before terminal windowing',
    );
    t.equal(
      summary.rows.length,
      TERMINAL_RETENTION_LIMIT,
      'terminal rows are bounded by the retention limit',
    );
    t.equal(
      summary.omittedTerminalRowCount,
      COMPLETED_OP_COUNT - TERMINAL_RETENTION_LIMIT,
      'omittedTerminalRowCount explicitly accounts for bounded historical rows',
    );
    t.equal(
      Object.keys(summary.operationTimelineById).length,
      TERMINAL_RETENTION_LIMIT,
      'operationTimelineById matches the retained bounded row set',
    );
    for (const priorityPartitionId of PRIORITY_PARTITION_IDS) {
      const retainedPriorityRow = summary.rows.find(
        (row) => row.partitionId === priorityPartitionId,
      );
      t.ok(
        retainedPriorityRow,
        `latest completed operation for priority partition ${priorityPartitionId} is retained`,
      );
      const priorityTimeline =
        summary.operationTimelineById[retainedPriorityRow.operationId];
      t.ok(
        Array.isArray(priorityTimeline) && priorityTimeline.length === 1,
        `retained priority terminal operation ${retainedPriorityRow.operationId} keeps compact state timeline`,
      );
      t.equal(priorityTimeline[0].eventType, 'state');
      t.equal(priorityTimeline[0].step, 'ACTIVE');
      t.equal(priorityTimeline[0].inFlight, false);
    }
    for (const row of summary.rows) {
      t.equal(
        row.stepsHistory.length,
        1,
        'completed diagnostic rows retain only their latest compact step',
      );
      t.equal(row.stepsHistory[0].step, 'ACTIVE');
      t.same(row.completedCopyStages.SYNCING, {
        startedAtMs: row.completedAt - 1000,
        endedAtMs: row.completedAt,
        nextStep: 'ACTIVE',
        durationMs: 1000,
      });
      t.equal(Number.isFinite(row.stepsHistory[0].timestamp), true);
    }
    assertNoHeavyKeysInSummary(t, summary, 'partition diagnostics');
  },
);

test(
  'GET /api/admin/discovery/services stays bounded under 1 MiB after 140 completed multi-step operations',
  async (t) => {
    const {cache} = populateRf3FormationCache();
    const api = new AdminWebSocketAPI({
      nodeId: NODE_IDS[0],
      nowFn: () => NOW_MS,
      systemTableCache: cache,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.SERVICE_DISCOVERY}?serviceId=sys-postgres-wire`,
    });
    const payloadBytes = Buffer.byteLength(response.body, 'utf8');
    const payload = response.json();

    t.equal(response.statusCode, 200, 'service discovery returns 200');
    t.ok(
      payloadBytes < MAX_DISCOVERY_BYTES,
      `service discovery (${payloadBytes} bytes) must stay below ${MAX_DISCOVERY_BYTES} bytes`,
    );
    t.equal(payload.serviceCount, 1);
    t.equal(payload.services[0].replicas[0].serviceId, 'sys-postgres-wire');
    t.equal(payload.services[0].replicas[0].healthStatus, 'healthy');
    t.equal(payload.services[0].replicas[0].port, 5432);
    t.equal(payload.replicaOperations.inFlightCount, 0);
    t.equal(payload.replicaOperations.statusHistogram.active, COMPLETED_OP_COUNT);
    assertNoHeavyKeysInSummary(t, payload.replicaOperations, 'service discovery');
  },
);

test(
  'in-flight operations are never omitted, keep step-entry timestamps for staleness, and stay compact alongside 140 completed operations',
  async (t) => {
    const {cache, inFlightOperationIds} = populateRf3FormationCache({
      includeInFlight: true,
    });
    const api = new AdminWebSocketAPI({
      nodeId: NODE_IDS[0],
      nowFn: () => NOW_MS,
      systemTableCache: cache,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const payloadBytes = Buffer.byteLength(response.body, 'utf8');
    const payload = response.json();
    const summary = payload.replicaOperations;

    t.equal(response.statusCode, 200);
    t.ok(
      payloadBytes < MAX_PARTITION_DIAGNOSTICS_BYTES,
      `mixed partition diagnostics (${payloadBytes} bytes) stays below ${MAX_PARTITION_DIAGNOSTICS_BYTES} bytes`,
    );
    t.equal(summary.inFlightCount, IN_FLIGHT_OP_COUNT);
    t.equal(summary.inFlightOperationIds.length, IN_FLIGHT_OP_COUNT);
    t.equal(summary.staleInFlightCount, 1, 'stale STOPPING op is counted via step timestamp');
    t.equal(
      summary.totalRowCount,
      COMPLETED_OP_COUNT + IN_FLIGHT_OP_COUNT,
    );
    t.equal(
      summary.rows.length,
      IN_FLIGHT_OP_COUNT + TERMINAL_RETENTION_LIMIT,
      'all in-flight rows plus bounded terminal window are retained',
    );
    const rowsById = new Map(summary.rows.map((row) => [row.operationId, row]));
    for (const opId of inFlightOperationIds) {
      const row = rowsById.get(opId);
      t.ok(row, `in-flight op ${opId} is retained in rows`);
      const currentStepEntry = resolveOperationCurrentStepEntry(row);
      t.ok(
        currentStepEntry && Number.isFinite(currentStepEntry.timestamp),
        `in-flight op ${opId} preserves current step entry timestamp`,
      );
      const timeline = summary.operationTimelineById[opId];
      t.ok(
        Array.isArray(timeline) && timeline.length >= 2,
        `in-flight op ${opId} preserves compact multi-entry timeline`,
      );
      const latestState = timeline[timeline.length - 1];
      t.equal(latestState.eventType, 'state');
      t.equal(latestState.inFlight, true);
    }
    const partial = rowsById.get('op-inflight-02');
    t.equal(partial.completedCopyStages.CREATING, undefined,
      'missing stage entry time cannot be inferred from other steps or row creation');
    t.equal(partial.completedCopyStages.SYNCING, undefined,
      'an ongoing stage has no completion timestamp');
    const staleRow = rowsById.get('op-inflight-00');
    t.equal(staleRow.completedCopyStages, null, 'REMOVE is not a copy');
    t.equal(
      resolveOperationCurrentStepEntry(staleRow).timestamp,
      NOW_MS - STALE_STOPPING_AGE_MS,
      'stale in-flight op preserves exact step-entered timestamp for downstream age/staleness checks',
    );
    const staleTimeline = summary.operationTimelineById['op-inflight-00'];
    t.equal(staleTimeline[staleTimeline.length - 1].staleTimeout, true);
    assertNoHeavyKeysInSummary(t, summary, 'mixed partition diagnostics');
  },
);

test(
  'GET /api/admin/control-snapshot?scope=local stays bounded with 140 completed multi-step operations',
  async (t) => {
    const {cache} = populateRf3FormationCache();
    const api = new AdminWebSocketAPI({
      nodeId: NODE_IDS[0],
      nowFn: () => NOW_MS,
      systemTableCache: cache,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local`,
    });
    const payloadBytes = Buffer.byteLength(response.body, 'utf8');
    const payload = response.json();

    t.equal(response.statusCode, 200);
    t.ok(
      payloadBytes < MAX_CONTROL_SNAPSHOT_BYTES,
      `local control snapshot (${payloadBytes} bytes) stays below ${MAX_CONTROL_SNAPSHOT_BYTES} bytes`,
    );
    const replicaOperationsBytes = Buffer.byteLength(
      JSON.stringify(payload.replicaOperations),
      'utf8',
    );
    t.ok(
      replicaOperationsBytes < MAX_REPLICA_OPERATIONS_BYTES,
      `control snapshot replicaOperations (${replicaOperationsBytes} bytes) stays below ${MAX_REPLICA_OPERATIONS_BYTES} bytes`,
    );
    t.equal(payload.replicaOperations.inFlightCount, 0);
    assertNoHeavyKeysInSummary(t, payload.replicaOperations, 'control snapshot');
    assertNoHeavyKeysInSummary(
      t,
      payload.controlPlaneDiagnostics.replicaOperations,
      'control-plane diagnostics',
    );
  },
);

test(
  'GET /api/admin/diagnostics/partitions?view=placement excludes replicaOperations and retains all placement assertion fields',
  async (t) => {
    const {cache, partitionIds} = populateRf3FormationCache({
      includeInFlight: true,
    });
    const api = new AdminWebSocketAPI({
      nodeId: NODE_IDS[0],
      nowFn: () => NOW_MS,
      systemTableCache: cache,
    });
    let replicaOpSummaryCalls = 0;
    const originalSummaryBuilder =
      api.controlSnapshot.buildControlSnapshotReplicaOperationSummary.bind(
        api.controlSnapshot,
      );
    api.controlSnapshot.buildControlSnapshotReplicaOperationSummary = (
      rows,
      options,
    ) => {
      replicaOpSummaryCalls += 1;
      return originalSummaryBuilder(rows, options);
    };
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.PARTITION_DIAGNOSTICS}?view=placement`,
    });
    const payloadBytes = Buffer.byteLength(response.body, 'utf8');
    const payload = response.json();

    t.equal(response.statusCode, 200, 'view=placement returns 200');
    t.ok(
      payloadBytes < MAX_DISCOVERY_BYTES,
      `view=placement (${payloadBytes} bytes) stays well below ${MAX_DISCOVERY_BYTES} bytes`,
    );
    t.equal(
      Object.hasOwn(payload, 'replicaOperations'),
      false,
      'view=placement omits replicaOperations entirely',
    );
    t.equal(
      replicaOpSummaryCalls,
      0,
      'view=placement does not invoke buildControlSnapshotReplicaOperationSummary',
    );
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
      'view=placement preserves schemaVersion',
    );
    t.equal(payload.nodeId, NODE_IDS[0], 'view=placement preserves nodeId');
    t.equal(payload.capturedAt, NOW_MS, 'view=placement preserves capturedAt');
    t.equal(payload.partitionCount, PARTITION_COUNT, 'view=placement preserves partitionCount');
    t.equal(
      Object.keys(payload.leaders).length,
      PARTITION_COUNT,
      'view=placement preserves leaders map',
    );
    t.equal(
      Object.keys(payload.voterCounts).length,
      PARTITION_COUNT,
      'view=placement preserves voterCounts map',
    );
    t.equal(
      Object.keys(payload.replicaRoleDiagnostics).length,
      PARTITION_COUNT,
      'view=placement preserves replicaRoleDiagnostics map',
    );
    t.equal(
      Object.keys(payload.partitionsById).length,
      PARTITION_COUNT,
      'view=placement preserves partitionsById map',
    );
    for (const partitionId of partitionIds) {
      const partition = payload.partitionsById[partitionId];
      t.equal(partition.partitionId, partitionId);
      t.equal(typeof partition.tableName, 'string');
      t.equal(partition.voterCount, 3);
      t.equal(partition.replicaCount, 3);
      t.equal(partition.activeReplicaCount, 3);
      t.equal(partition.replicas.length, 3);
    }
  },
);
