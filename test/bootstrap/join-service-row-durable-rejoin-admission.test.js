import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from '../../src/bootstrap/shared/node-registration-owner.js';
import {CreateMessageGroupPhase} from '../../src/bootstrap/phases/create-message-group-phase.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {
  MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR,
  MessageGroupServiceRowOwner,
} from '../../src/message-group/message-group-service-row-owner.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_LEADER_MODE,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';

const NODE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_NODE_ID = '00000000-0000-4000-8000-000000000002';
const GROUP_ID = 'mg-1';
const REPLICA_ID = 'mg-1-r1';
const BOOT1_CREATED_AT = 1_795_440_000_000;
const BOOT2_NOW = 1_795_449_592_000;

function createExistingServiceRow(overrides = {}) {
  return {
    service_id: REPLICA_ID,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: NODE_ID,
    partition_id: null,
    group_id: GROUP_ID,
    replica_id: REPLICA_ID,
    raft_role: 'leader',
    status: SERVICE_STATUS.ACTIVE,
    address: `${NODE_ID}/message-group/${REPLICA_ID}`,
    create_attempt_token: null,
    cleanup_token: null,
    created_at: BOOT1_CREATED_AT,
    state_entered_at: BOOT1_CREATED_AT + 10,
    updated_at: BOOT1_CREATED_AT + 20,
    updated_at_hlc: 'hlc-boot-1-mg',
    ...overrides,
  };
}

function createMockGateway({existingRow = null, readAvailable = true} = {}) {
  const inserts = [];
  const reads = [];
  const updates = [];
  let storedRow = existingRow ? {...existingRow} : null;

  const gateway = {
    inserts,
    reads,
    updates,
    getStoredRow: () => (storedRow ? {...storedRow} : null),
    async readAuthoritativeRows(tableName, sql, params, options) {
      reads.push({tableName, sql, params, options});
      if (!readAvailable) {
        return {
          success: false,
          errorCode: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
          error: 'services-p1 leader unavailable',
        };
      }
      return {
        success: true,
        rows: storedRow && storedRow.service_id === params?.[0] ? [{...storedRow}] : [],
      };
    },
    async submitMutation(mutation, options) {
      inserts.push({mutation, options});
      if (mutation.operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT &&
          mutation.tableName === TABLES.SERVICES) {
        if (storedRow && storedRow.service_id === mutation.row.service_id) {
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            participantFailures: [{
              partitionId: 'services-p1',
              failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
              committed: true,
              outcome: 'statement_failed',
              error: 'UNIQUE constraint failed: services.service_id',
              failedTable: 'services',
            }],
          };
        }
        storedRow = {...mutation.row};
        return {success: true, affectedRows: 1, partitionResult: {affectedRows: 1}};
      }
      throw new Error(`unexpected mutation ${mutation.operation}`);
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      updates.push({tableName, whereClause, data});
      const matches = storedRow && Object.entries(whereClause).every(
        ([k, v]) => (storedRow[k] ?? null) === v,
      );
      if (!matches) {
        return {success: true, affectedRows: 0, partitionResult: {affectedRows: 0}};
      }
      storedRow = {...storedRow, ...data};
      return {success: true, affectedRows: 1, partitionResult: {affectedRows: 1}};
    },
  };
  return gateway;
}

function createOwners(gateway, {reuseExistingGroup = true, startupReplicaIds = [REPLICA_ID]} = {}) {
  const seeded = [];
  const regOwner = new NodeRegistrationOwner({
    nodeId: NODE_ID,
    nodeAddress: '172.28.0.11:8080',
    hostId: LOCAL_MACHINE_HOST_ID,
    delegates: {
      getLogger: () => ({info() {}, warn() {}, error() {}, debug() {}}),
      getNow: () => () => BOOT2_NOW,
      getBootIncarnation: () => 2,
      getSystemTableCache: () => ({applySystemTableChange() {}}),
      getJoinAdmissionControlPlaneSystemTableGateway: () => gateway,
    },
  });

  const mgServices = new Map([
    [REPLICA_ID, {groupId: GROUP_ID, role: 'leader', getRole: () => 'leader'}],
  ]);

  const phase = new CreateMessageGroupPhase({
    nodeId: NODE_ID,
    delegates: {
      getLogger: () => ({info() {}, warn() {}, error() {}, debug() {}}),
      getNow: () => () => BOOT2_NOW,
      getSleep: () => async () => {},
      getConfig: () => ({httpTimeoutMs: 1000}),
      getSeedNodeAddress: () => 'http://172.28.0.12:8081',
      getSeedNodeId: () => OTHER_NODE_ID,
      getBootstrapResponse: () => ({
        messageGroupAssignment: {
          strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          groupId: GROUP_ID,
          replicaCount: 3,
          reuseExistingGroup,
          startupReplicaIds,
        },
      }),
      getMessageGroupServices: () => mgServices,
      upsertJoinServiceRowWithRetry: (rowData, options) =>
        regOwner.upsertJoinServiceRowWithRetry(rowData, options),
      seedJoinTimeCacheRow: (tableName, row) => seeded.push({tableName, row}),
      registerMessageGroupService: (gId, rId, svc, opts) =>
        phase.registerMessageGroupService(gId, rId, svc, opts),
    },
  });

  return {regOwner, phase, seeded, mgServices};
}

test('durable rejoin reuses authoritative services row without blind INSERT ' +
  'and preserves true birth generation for activation CAS', async (t) => {
  const existingStopped = createExistingServiceRow({status: SERVICE_STATUS.STOPPED});
  const gateway = createMockGateway({existingRow: existingStopped});
  const {phase, seeded, mgServices} = createOwners(gateway);

  await phase.registerCreateSelfHostedMetadata();

  t.equal(gateway.inserts.length, 0,
    'durable rejoin must not issue a blind INSERT for an existing replica row');
  t.equal(gateway.reads.length, 1,
    'durable rejoin performs one authoritative OWNER_RPC_REQUIRED read');
  t.equal(
    gateway.reads[0].options.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  );
  t.equal(
    gateway.reads[0].options.leaderMode,
    CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  );

  const evidence = phase.registrationEvidenceByReplicaId.get(REPLICA_ID);
  t.equal(evidence?.[COLUMN.CREATED_AT], BOOT1_CREATED_AT,
    'registration evidence preserves the true authoritative created_at generation');
  t.equal(evidence?.state_entered_at, existingStopped.state_entered_at,
    'registration evidence preserves the true authoritative state_entered_at');
  t.equal(seeded.length, 1);
  t.equal(seeded[0].row[COLUMN.CREATED_AT], BOOT1_CREATED_AT,
    'join-time cache is seeded with the authoritative row, not a freshly minted birth');

  // Prove MessageGroupServiceRowOwner.activateReplica CAS succeeds against
  // the preserved evidence without IDENTITY_CONFLICT.
  const rowOwner = new MessageGroupServiceRowOwner({
    systemTableWriter: gateway,
    replicaStateMachine: {
      async runHandlerBoundActivation(_id, {resolveSource, requireHandler, effect}) {
        const source = await resolveSource();
        requireHandler();
        return effect(source);
      },
    },
    now: () => BOOT2_NOW,
  });
  const activated = await rowOwner.activateReplica({
    groupId: GROUP_ID,
    replicaId: REPLICA_ID,
    nodeId: NODE_ID,
    service: mgServices.get(REPLICA_ID),
    registrationEvidence: evidence,
    isEffectHandlerCurrent: () => true,
  });
  t.equal(activated.status, SERVICE_STATUS.ACTIVE,
    'activation CAS succeeds using the preserved authoritative birth generation');
  t.equal(gateway.updates.length, 1);
  t.equal(gateway.updates[0].whereClause.created_at, BOOT1_CREATED_AT);
});

test('SQLITE_CONSTRAINT_PRIMARYKEY on unflagged INSERT retry verifies ' +
  'authoritative ownership and reuses matching row', async (t) => {
  const existingActive = createExistingServiceRow({status: SERVICE_STATUS.ACTIVE});
  const gateway = createMockGateway({existingRow: existingActive});
  const {phase} = createOwners(gateway, {
    reuseExistingGroup: false,
    startupReplicaIds: [],
  });

  await phase.registerCreateSelfHostedMetadata();

  t.equal(gateway.inserts.length, 1, 'fresh-join attempt issued INSERT first');
  t.equal(gateway.reads.length, 1, 'PK conflict triggered authoritative readback');
  t.equal(
    phase.registrationEvidenceByReplicaId.get(REPLICA_ID)?.[COLUMN.CREATED_AT],
    BOOT1_CREATED_AT,
    'resolved row preserves authoritative birth generation',
  );
});

test('authoritative service-row reuse fails closed on foreign owner, ' +
  'cleanup-in-progress, or unavailable authority', async (t) => {
  // 1. Foreign owner -> non-retryable IDENTITY_CONFLICT
  const foreignGateway = createMockGateway({
    existingRow: createExistingServiceRow({node_id: OTHER_NODE_ID}),
  });
  const foreignOwners = createOwners(foreignGateway);
  const conflictErr = await t.rejects(
    foreignOwners.phase.registerCreateSelfHostedMetadata(),
  );
  t.not(conflictErr.retryable, true, 'foreign node ownership conflict is non-retryable');
  t.equal(foreignGateway.inserts.length, 0, 'no INSERT attempted on foreign conflict');

  // 2. Cleanup in progress -> retryable CLEANUP_IN_PROGRESS
  const cleanupGateway = createMockGateway({
    existingRow: createExistingServiceRow({cleanup_token: 'tok-cleanup-1'}),
  });
  const cleanupOwners = createOwners(cleanupGateway);
  const cleanupErr = await t.rejects(
    cleanupOwners.phase.registerCreateSelfHostedMetadata(),
  );
  t.equal(cleanupErr.deferRetry, true, 'cleanup in progress defers retry');
  t.equal(cleanupErr.code, MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS);
  t.equal(cleanupGateway.inserts.length, 0, 'no INSERT attempted during cleanup');

  // 3. Authoritative read unavailable -> retryable unavailable, never blind INSERT
  const unavailableGateway = createMockGateway({readAvailable: false});
  const unavailableOwners = createOwners(unavailableGateway);
  const unavailableErr = await t.rejects(
    unavailableOwners.phase.registerCreateSelfHostedMetadata(),
  );
  t.equal(unavailableErr.deferRetry, true, 'unavailable authority defers retry');
  t.equal(unavailableGateway.inserts.length, 0,
    'unavailable authority must never fall back to blind INSERT');

  // 4. Genuine absent row on reuseExistingService -> births row via INSERT
  const absentGateway = createMockGateway({existingRow: null});
  const absentOwners = createOwners(absentGateway);
  await absentOwners.phase.registerCreateSelfHostedMetadata();
  t.equal(absentGateway.reads.length, 1, 'checked authority first');
  t.equal(absentGateway.inserts.length, 1, 'birthed absent row via INSERT');
});
