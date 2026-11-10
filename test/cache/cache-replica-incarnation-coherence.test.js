import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  applyStaleRowBackfill,
} from '../../src/cache/system-table-cache-row-merge.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

const SERVICE_ID = 'priority-partition-r4';
const PARTITION_ID = 'priority-partition';
const NODE_ID = 'node-b';
const SERVICE_TYPE_PARTITION = 'partition';
const SUCCESSOR_REPLICA_ID = 'priority-partition-r4#succ-1';
const PREDECESSOR_REPLICA_ID = 'priority-partition-r4#pred-1';
const SUCCESSOR_ATTEMPT_TOKEN = 'attempt-succ-1';
const PREDECESSOR_ATTEMPT_TOKEN = 'attempt-pred-1';
const CLEANUP_TOKEN_A = 'cleanup-token-a';
const CLEANUP_TOKEN_B = 'cleanup-token-b';
const BOOT_ID_A = 'boot-a';
const BOOT_ID_B = 'boot-b';
const ADDRESS = 'node-b/partition/priority-partition-r4';

const TS_500 = 500;
const TS_1000 = 1000;
const TS_1500 = 1500;
const TS_2000 = 2000;
const TS_3000 = 3000;
const TS_4000 = 4000;
const TS_5000 = 5000;

function createSuccessorCreatingRow(overrides = {}) {
  return {
    service_id: SERVICE_ID,
    service_type: SERVICE_TYPE_PARTITION,
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    replica_id: SUCCESSOR_REPLICA_ID,
    create_attempt_token: SUCCESSOR_ATTEMPT_TOKEN,
    status: ReplicaStatus.CREATING,
    state_entered_at: TS_1000,
    previous_state: ReplicaStatus.PENDING,
    trigger_reason: 'replica_create',
    raft_role: null,
    address: ADDRESS,
    created_at: TS_2000,
    updated_at: TS_3000,
    ...overrides,
  };
}

function createPredecessorStaleRow(overrides = {}) {
  return {
    service_id: SERVICE_ID,
    service_type: SERVICE_TYPE_PARTITION,
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    replica_id: PREDECESSOR_REPLICA_ID,
    create_attempt_token: PREDECESSOR_ATTEMPT_TOKEN,
    raft_role: RAFT_ROLE.FOLLOWER,
    status: ReplicaStatus.ACTIVE,
    state_entered_at: TS_500,
    created_at: TS_1000,
    updated_at: TS_1500,
    ...overrides,
  };
}

test(
  'predecessor-backfill-refused: stale predecessor row cannot backfill role or metadata onto successor cached service row',
  () => {
    const cache = new SystemTableCache();
    const successorRow = createSuccessorCreatingRow();
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      successorRow,
      {causeId: 'seed-successor'},
    );

    const predecessorRow = createPredecessorStaleRow();
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      predecessorRow,
      {causeId: 'stale-predecessor'},
    );

    const cached = cache.get(TABLES.SERVICES, SERVICE_ID);
    assert.equal(
      cached.replica_id,
      SUCCESSOR_REPLICA_ID,
      'successor replica identity is preserved',
    );
    assert.equal(
      cached.create_attempt_token,
      SUCCESSOR_ATTEMPT_TOKEN,
      'successor create attempt token is preserved',
    );
    assert.equal(
      cached.raft_role,
      null,
      'predecessor raft_role must not be backfilled onto successor',
    );
    assert.equal(
      cached.status,
      ReplicaStatus.CREATING,
      'status does not regress to predecessor',
    );
    assert.equal(
      cached.state_entered_at,
      TS_1000,
      'state_entered_at is preserved',
    );
    assert.equal(
      cached.updated_at,
      TS_3000,
      'successor updated_at is preserved',
    );

    const table = cache.tables.get(TABLES.SERVICES);
    const directResult = applyStaleRowBackfill(
      TABLES.SERVICES,
      table,
      SERVICE_ID,
      successorRow,
      predecessorRow,
    );
    assert.equal(
      directResult.applied,
      false,
      'direct stale backfill is refused',
    );
    assert.equal(
      directResult.backfilledFields.length,
      0,
      'no fields are backfilled from predecessor',
    );
  },
);

test(
  'lifecycle-advance-incarnation-fenced: stale higher state_entered_at from predecessor cannot advance successor lifecycle',
  () => {
    const cache = new SystemTableCache();
    const successorRow = createSuccessorCreatingRow({
      status: ReplicaStatus.CREATING,
      state_entered_at: TS_1000,
      updated_at: TS_3000,
    });
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      successorRow,
    );

    // Predecessor carries a higher state_entered_at (TS_5000 > TS_1000)
    // but an older updated_at (TS_2000 < TS_3000).
    const predecessorHigherLifecycleRow = createPredecessorStaleRow({
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    });

    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      predecessorHigherLifecycleRow,
    );

    const cached = cache.get(TABLES.SERVICES, SERVICE_ID);
    assert.equal(
      cached.status,
      ReplicaStatus.CREATING,
      'predecessor lifecycle status does not advance successor',
    );
    assert.equal(
      cached.state_entered_at,
      TS_1000,
      'predecessor state_entered_at does not advance successor',
    );

    const table = cache.tables.get(TABLES.SERVICES);
    const backfillResult = applyStaleRowBackfill(
      TABLES.SERVICES,
      table,
      SERVICE_ID,
      successorRow,
      predecessorHigherLifecycleRow,
    );
    assert.equal(
      backfillResult.applied,
      false,
      'applyStaleRowBackfill refuses predecessor lifecycle advance',
    );
  },
);

test(
  'missing-identity-refused: incoming event missing positive matching replica incarnation identity cannot advance lifecycle or backfill incarnation-sensitive fields',
  () => {
    const cache = new SystemTableCache();
    const successorRow = createSuccessorCreatingRow({
      raft_role: null,
      status: ReplicaStatus.CREATING,
      state_entered_at: TS_1000,
      updated_at: TS_3000,
    });
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      successorRow,
    );

    // Incoming event has no replica_id and no create_attempt_token.
    const partialIncomingMissingIdentity = {
      service_id: SERVICE_ID,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_4000,
      raft_role: RAFT_ROLE.FOLLOWER,
      updated_at: TS_2000,
    };

    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      partialIncomingMissingIdentity,
    );

    const cached = cache.get(TABLES.SERVICES, SERVICE_ID);
    assert.equal(
      cached.status,
      ReplicaStatus.CREATING,
      'lifecycle advance is refused when identity is missing',
    );
    assert.equal(
      cached.state_entered_at,
      TS_1000,
      'state_entered_at is not updated',
    );
    assert.equal(
      cached.raft_role,
      null,
      'raft_role is not backfilled from event missing identity',
    );

    const table = cache.tables.get(TABLES.SERVICES);
    const backfillResult = applyStaleRowBackfill(
      TABLES.SERVICES,
      table,
      SERVICE_ID,
      successorRow,
      partialIncomingMissingIdentity,
    );
    assert.equal(
      backfillResult.applied,
      false,
      'applyStaleRowBackfill refused when missing identity',
    );
  },
);

test(
  'same-incarnation-delayed-update: legitimate same-incarnation delayed lifecycle advance and backfill succeeds while preserving row LWW',
  () => {
    const cache = new SystemTableCache();
    // Existing row has newer composite updated_at (TS_3000) from a role writer,
    // and is at status 'syncing' with state_entered_at TS_1000.
    const existingRow = createSuccessorCreatingRow({
      status: ReplicaStatus.SYNCING,
      state_entered_at: TS_1000,
      raft_role: RAFT_ROLE.FOLLOWER,
      updated_at: TS_3000,
    });
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      existingRow,
    );

    // Delayed update from the SAME replica incarnation carries newer
    // state_entered_at (TS_2000) but older updated_at (TS_2000).
    const sameIncarnationDelayedRow = {
      service_id: SERVICE_ID,
      service_type: SERVICE_TYPE_PARTITION,
      partition_id: PARTITION_ID,
      node_id: NODE_ID,
      replica_id: SUCCESSOR_REPLICA_ID,
      create_attempt_token: SUCCESSOR_ATTEMPT_TOKEN,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_2000,
      previous_state: ReplicaStatus.SYNCING,
      trigger_reason: 'voter_ready',
      updated_at: TS_2000,
    };

    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      sameIncarnationDelayedRow,
    );

    const cached = cache.get(TABLES.SERVICES, SERVICE_ID);
    assert.equal(
      cached.status,
      ReplicaStatus.ACTIVE,
      'same-incarnation status advances to active',
    );
    assert.equal(
      cached.state_entered_at,
      TS_2000,
      'same-incarnation state_entered_at advances to TS_2000',
    );
    assert.equal(
      cached.previous_state,
      ReplicaStatus.SYNCING,
      'previous_state advances',
    );
    assert.equal(
      cached.trigger_reason,
      'voter_ready',
      'trigger_reason advances',
    );
    assert.equal(
      cached.raft_role,
      RAFT_ROLE.FOLLOWER,
      'role-writer raft_role is preserved',
    );
    assert.equal(
      cached.updated_at,
      TS_3000,
      'newer composite row version is preserved',
    );
  },
);

test(
  'create-cleanup-and-boot-identity-cases: create attempt mismatch, cleanup token conflict, and boot id mismatch refuse merge',
  () => {
    const baseExisting = createSuccessorCreatingRow({
      create_attempt_token: SUCCESSOR_ATTEMPT_TOKEN,
      cleanup_token: CLEANUP_TOKEN_A,
      boot_id: BOOT_ID_A,
      created_at: TS_1000,
    });

    const cache = new SystemTableCache();
    const table = cache.tables.get(TABLES.SERVICES);

    // Case A: create_attempt_token mismatch
    const attemptMismatchIncoming = {
      ...baseExisting,
      create_attempt_token: PREDECESSOR_ATTEMPT_TOKEN,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    };
    assert.equal(
      applyStaleRowBackfill(
        TABLES.SERVICES,
        table,
        SERVICE_ID,
        baseExisting,
        attemptMismatchIncoming,
      ).applied,
      false,
      'attempt mismatch refuses stale backfill',
    );

    // Case B: cleanup_token conflict (different cleanup token)
    const cleanupConflictIncoming = {
      ...baseExisting,
      cleanup_token: CLEANUP_TOKEN_B,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    };
    assert.equal(
      applyStaleRowBackfill(
        TABLES.SERVICES,
        table,
        SERVICE_ID,
        baseExisting,
        cleanupConflictIncoming,
      ).applied,
      false,
      'cleanup conflict refuses stale backfill',
    );

    // Case B2: cleanup_token conflict (existing has cleanup token, incoming has null)
    const cleanupNullIncoming = {
      ...baseExisting,
      cleanup_token: null,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    };
    assert.equal(
      applyStaleRowBackfill(
        TABLES.SERVICES,
        table,
        SERVICE_ID,
        baseExisting,
        cleanupNullIncoming,
      ).applied,
      false,
      'missing cleanup token on cleaned-up row refuses advance',
    );

    // Case C: boot_id mismatch
    const bootMismatchIncoming = {
      ...baseExisting,
      boot_id: BOOT_ID_B,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    };
    assert.equal(
      applyStaleRowBackfill(
        TABLES.SERVICES,
        table,
        SERVICE_ID,
        baseExisting,
        bootMismatchIncoming,
      ).applied,
      false,
      'boot_id mismatch refuses stale backfill',
    );

    // Case D: created_at mismatch
    const createdMismatchIncoming = {
      ...baseExisting,
      created_at: TS_500,
      status: ReplicaStatus.ACTIVE,
      state_entered_at: TS_5000,
      updated_at: TS_2000,
    };
    assert.equal(
      applyStaleRowBackfill(
        TABLES.SERVICES,
        table,
        SERVICE_ID,
        baseExisting,
        createdMismatchIncoming,
      ).applied,
      false,
      'created_at mismatch refuses stale backfill',
    );
  },
);

test(
  'cache-to-lifecycle-payload-composition: cached row across replica state machine buildUpdateCdcData prevents role contamination and preserves same-incarnation role',
  () => {
    const cache = new SystemTableCache();
    // 1. Seed successor row in cache without a raft_role
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      createSuccessorCreatingRow({
        raft_role: null,
        updated_at: TS_3000,
      }),
    );

    // 2. Predecessor stale event arrives carrying follower raft_role
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPDATE,
      createPredecessorStaleRow({
        raft_role: RAFT_ROLE.FOLLOWER,
        updated_at: TS_1500,
      }),
    );

    // 3. Initialize ReplicaStateMachine with the cache
    const stateMachine = new ReplicaStateMachine({
      nodeId: NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: {
        updateSystemTableRow: async () => ({success: true, affectedRows: 1}),
      },
    });

    const successorReplicaState = {
      replicaId: SERVICE_ID,
      serviceId: SERVICE_ID,
      replicaIdentity: SUCCESSOR_REPLICA_ID,
      partitionId: PARTITION_ID,
      nodeId: NODE_ID,
      state: ReplicaStatus.ACTIVE,
      previousState: ReplicaStatus.CREATING,
      stateEnteredAt: TS_4000,
      triggerReason: 'voter_ready',
      createdAt: TS_2000,
      createAttemptToken: SUCCESSOR_ATTEMPT_TOKEN,
      cleanupToken: null,
    };

    // 4. Build update CDC data for successor
    const updatePayload = stateMachine._buildUpdateCdcData(
      successorReplicaState,
      ReplicaStatus.CREATING,
    );

    assert.equal(
      updatePayload.raft_role,
      undefined,
      'successor buildUpdateCdcData must not contain predecessor raft_role',
    );

    // 5. Positive control: when cached row carries raft_role for the SAME incarnation
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      createSuccessorCreatingRow({
        raft_role: RAFT_ROLE.FOLLOWER,
        updated_at: TS_4000,
      }),
    );

    const matchingUpdatePayload = stateMachine._buildUpdateCdcData(
      successorReplicaState,
      ReplicaStatus.SYNCING,
    );

    assert.equal(
      matchingUpdatePayload.raft_role,
      RAFT_ROLE.FOLLOWER,
      'successor buildUpdateCdcData preserves same-incarnation voter raft_role',
    );
  },
);
