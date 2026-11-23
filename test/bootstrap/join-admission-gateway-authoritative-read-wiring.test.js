import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from '../../src/bootstrap/shared/node-registration-owner.js';
import {buildMetaServiceEndpoints} from '../../src/admin/admin-meta-endpoint-builder.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_LEADER_MODE,
  GATEWAY_ERROR_MSG,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {MEMBERSHIP_LIFECYCLE_INTENT} from
  '../../src/control-plane/membership-lifecycle-controller.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
import {engineCommittedWriteAnswer} from
  '../test-helpers/committed-write-answer.js';

const NODE_ID = '00000000-0000-4000-8000-000000000001';
const NODE_HOST = '10.166.15.231';
const NODE_ADDRESS = `${NODE_HOST}:8080`;
const WS_PORT = 8082;
const NODE_ENDPOINT_ID = `ep-${NODE_ID}-ws`;
const NOW_MS = 1795442557000;
const BUDGET_BYTES = 1024 * 1024;
const PRIOR_INCARNATION = 1;
const NEXT_INCARNATION = 2;

const ALLOWED_FENCE = Object.freeze({
  state: 'current',
  allowed: true,
  reasonCodes: Object.freeze([]),
  localIdentityState: 'matched',
  durableMembershipState: 'present',
  peerProofState: 'not_required',
});

function createSilentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function buildSeedMetaEndpoints(bootIncarnation) {
  const {wasmMetaEndpoint, adminMetaEndpoint} = buildMetaServiceEndpoints(
    NODE_ID,
    NODE_HOST,
    WS_PORT,
    NOW_MS - 1000,
  );
  return [
    {...wasmMetaEndpoint, [COLUMN.BOOT_INCARNATION]: bootIncarnation},
    {...adminMetaEndpoint, [COLUMN.BOOT_INCARNATION]: bootIncarnation},
  ];
}

function readHarnessTableRows(tables, tableName, sql, params) {
  const rows = tables[tableName] || [];
  if (!params || params.length !== 1) return [...rows];
  if (tableName === TABLES.NODES) {
    return rows.filter((row) => row[COLUMN.NODE_ID] === params[0]);
  }
  const isEndpointTable =
    tableName === TABLES.NODE_ENDPOINTS || tableName === TABLES.SERVICE_ENDPOINTS;
  if (!isEndpointTable) return [...rows];
  const key = /WHERE\s+endpoint_id\s*=/iu.test(sql) ? COLUMN.ENDPOINT_ID : COLUMN.NODE_ID;
  return rows.filter((row) => row[key] === params[0]);
}

function createUniqueConstraintError(target) {
  const error = new Error(`UNIQUE constraint failed: ${target}`);
  error.code = 'SQLITE_CONSTRAINT_UNIQUE';
  error.errorCode = 'SQLITE_CONSTRAINT_UNIQUE';
  return error;
}

function assertNoDuplicateInsert(tables, sql, params) {
  if (/^\s*INSERT\s+INTO\s+nodes\b/iu.test(sql) && tables[TABLES.NODES].length > 0) {
    throw createUniqueConstraintError('nodes.node_address');
  }
  const isDuplicateServiceEndpoint =
    /^\s*INSERT\s+INTO\s+service_endpoints\b/iu.test(sql) &&
    tables[TABLES.SERVICE_ENDPOINTS].some((row) => row[COLUMN.ENDPOINT_ID] === params[0]);
  if (isDuplicateServiceEndpoint) {
    throw createUniqueConstraintError('service_endpoints.endpoint_id');
  }
}

function applyHarnessWriteMutation(tables, sql, params) {
  if (/^\s*UPDATE\s+nodes\b/iu.test(sql)) {
    for (const row of tables[TABLES.NODES]) {
      if (row[COLUMN.NODE_ID] === NODE_ID) {
        row[COLUMN.BOOT_INCARNATION] = NEXT_INCARNATION;
        row[COLUMN.STATUS] = NODE_STATE.JOINING;
        row[COLUMN.CONNECTION_STATE] = STATE.CONNECTED;
      }
    }
    return;
  }
  if (/^\s*UPDATE\s+service_endpoints\b/iu.test(sql)) {
    const endpointId = params[params.length - 2];
    for (const row of tables[TABLES.SERVICE_ENDPOINTS]) {
      if (row[COLUMN.ENDPOINT_ID] === endpointId) {
        row[COLUMN.BOOT_INCARNATION] = NEXT_INCARNATION;
      }
    }
    return;
  }
  if (/^\s*INSERT\s+INTO\s+node_endpoints\b/iu.test(sql)) {
    tables[TABLES.NODE_ENDPOINTS].push({
      [COLUMN.ENDPOINT_ID]: NODE_ENDPOINT_ID,
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: `ws://${NODE_HOST}:${WS_PORT}`,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.BOOT_INCARNATION]: NEXT_INCARNATION,
    });
  }
}

function createAuthoritativeTableHarness({
  existingNodes,
  existingNodeEndpoints,
  existingServiceEndpoints,
  failEndpointUpdateWithZeroRows = false,
}) {
  const authoritativeReads = [];
  const sqlCalls = [];
  const tables = {
    [TABLES.NODES]: [...existingNodes],
    [TABLES.NODE_ENDPOINTS]: [...existingNodeEndpoints],
    [TABLES.SERVICE_ENDPOINTS]: [...existingServiceEndpoints],
    [TABLES.SERVICES]: [],
  };

  const cdcIntegrationService = {
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      authoritativeReads.push({
        tableName,
        sql,
        params,
        leaderMode: options?.readAuthority?.leaderMode ?? null,
        authoritativeReadMode: options?.readAuthority?.authoritativeReadMode ?? null,
      });
      return {
        success: true,
        rows: readHarnessTableRows(tables, tableName, sql, params),
        source: 'owner_rpc_lane',
      };
    },
  };

  const joinAdmissionSqlQueryEngine = {
    async executeQuery(sql, params, options) {
      sqlCalls.push({sql, params, options});
      assertNoDuplicateInsert(tables, sql, params);
      if (failEndpointUpdateWithZeroRows && /^\s*UPDATE\s+node_endpoints\b/iu.test(sql)) {
        return {
          ...engineCommittedWriteAnswer(sql, params, options),
          affectedRows: 0,
          changes: 0,
        };
      }
      applyHarnessWriteMutation(tables, sql, params);
      return engineCommittedWriteAnswer(sql, params, options);
    },
  };

  return {authoritativeReads, sqlCalls, tables, cdcIntegrationService, joinAdmissionSqlQueryEngine};
}

function createOwnerForRestart({
  cdcIntegrationService,
  joinAdmissionSqlQueryEngine,
  bootIncarnation,
}) {
  const systemTableCache = new SystemTableCache();
  let nowMs = NOW_MS;
  return new NodeRegistrationOwner({
    nodeId: NODE_ID,
    nodeAddress: NODE_ADDRESS,
    hostId: LOCAL_MACHINE_HOST_ID,
    delegates: {
      getLogger: () => createSilentLogger(),
      getNow: () => () => nowMs,
      getSleep: () => async (delayMs = 1) => {
        nowMs += Math.max(1, Number(delayMs) || 1);
      },
      getConfig: () => ({joinAdmissionWriteRetryTimeoutMs: 50}),
      getWsPort: () => WS_PORT,
      getSystemTableCache: () => systemTableCache,
      getCdcIntegrationService: () => cdcIntegrationService,
      getJoinAdmissionSqlQueryEngine: () => joinAdmissionSqlQueryEngine,
      getBootIncarnation: () => bootIncarnation,
      getJoinLifecycleIntentType: () => MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
      getClusterIncarnationFence: async () => ALLOWED_FENCE,
      getNodeCapabilities: () => ['storage'],
      getNodeStorageBudgetService: () => ({
        resolveBudgetRow: (nodeRow) => ({
          budgetRow: {
            ...nodeRow,
            storage_budget_bytes: BUDGET_BYTES,
            storage_budget_source: 'test',
            storage_budget_updated_at: NOW_MS,
          },
          resolution: {
            isValid: true,
            budgetBytes: BUDGET_BYTES,
            source: 'test',
            diskBytes: BUDGET_BYTES,
          },
        }),
      }),
      readLocalReplicaStorageState: () => ({exists: true}),
      getReplicaStateMachine: () => ({}),
    },
  });
}

test('join-admission gateway wires cdcIntegrationService for OWNER_RPC_REQUIRED incarnation reads on seed durable rejoin', async (t) => {
  const harness = createAuthoritativeTableHarness({
    existingNodes: [{
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
      [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
      [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
      [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
      [COLUMN.BOOT_INCARNATION]: PRIOR_INCARNATION,
    }],
    existingNodeEndpoints: [],
    existingServiceEndpoints: buildSeedMetaEndpoints(PRIOR_INCARNATION),
  });
  const owner = createOwnerForRestart({
    cdcIntegrationService: harness.cdcIntegrationService,
    joinAdmissionSqlQueryEngine: harness.joinAdmissionSqlQueryEngine,
    bootIncarnation: NEXT_INCARNATION,
  });

  const registration = await owner.registerNodeInCluster();

  t.equal(registration.nodeRow[COLUMN.BOOT_INCARNATION], NEXT_INCARNATION,
    'nodes row advances to the restarting boot incarnation');
  t.equal(
    harness.sqlCalls.some((c) => /^\s*INSERT\s+INTO\s+nodes\b/iu.test(c.sql)),
    false,
    'existing nodes row must NOT trigger a blind INSERT INTO nodes',
  );
  t.equal(
    harness.sqlCalls.some((c) =>
      /^\s*UPDATE\s+nodes\b/iu.test(c.sql) && /boot_incarnation\s*=\s*\?/iu.test(c.sql)),
    true,
    'existing nodes row advances via incarnation-guarded CAS UPDATE through startup SQL',
  );
  t.equal(
    harness.sqlCalls.some((c) => /^\s*INSERT\s+INTO\s+service_endpoints\b/iu.test(c.sql)),
    false,
    'existing seed service_endpoints rows must NOT trigger blind INSERTs',
  );
  t.equal(
    harness.sqlCalls.filter((c) =>
      /^\s*UPDATE\s+service_endpoints\b/iu.test(c.sql) && /boot_incarnation\s*=\s*\?/iu.test(c.sql))
      .length,
    2,
    'both existing built-in meta service_endpoints rows advance via guarded CAS UPDATE',
  );
  t.equal(
    harness.sqlCalls.some((c) => /^\s*INSERT\s+INTO\s+node_endpoints\b/iu.test(c.sql)),
    true,
    'absent node_endpoints row still births via INSERT through startup SQL',
  );

  const ownerRpcReads = harness.authoritativeReads.filter(
    (read) =>
      read.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED &&
      read.leaderMode === CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  );
  t.ok(
    ownerRpcReads.some((read) => read.tableName === TABLES.NODES),
    'registerJoinNodeAtIncarnation reads authoritative NODES via OWNER_RPC_REQUIRED on join gateway',
  );
  t.ok(
    ownerRpcReads.some((read) => read.tableName === TABLES.SERVICE_ENDPOINTS),
    'writeJoinEndpointAtIncarnation reads authoritative SERVICE_ENDPOINTS via OWNER_RPC_REQUIRED on join gateway',
  );
  t.ok(
    ownerRpcReads.some((read) => read.tableName === TABLES.NODE_ENDPOINTS),
    'writeJoinEndpointAtIncarnation reads authoritative NODE_ENDPOINTS via OWNER_RPC_REQUIRED on join gateway',
  );
});

test('withdrawEndpointAtIncarnation resolves readback through wired cdcIntegrationService instead of authority_unavailable', async (t) => {
  const harness = createAuthoritativeTableHarness({
    existingNodes: [{
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.NODE_ADDRESS]: NODE_ADDRESS,
      [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
      [COLUMN.STATUS]: NODE_STATE.JOINING,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.BOOT_INCARNATION]: NEXT_INCARNATION,
    }],
    existingNodeEndpoints: [{
      [COLUMN.ENDPOINT_ID]: NODE_ENDPOINT_ID,
      [COLUMN.NODE_ID]: NODE_ID,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.ADDRESS]: `ws://${NODE_HOST}:${WS_PORT}`,
      [COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE,
      [COLUMN.BOOT_INCARNATION]: NEXT_INCARNATION,
    }],
    existingServiceEndpoints: [],
    failEndpointUpdateWithZeroRows: true,
  });
  const owner = createOwnerForRestart({
    cdcIntegrationService: harness.cdcIntegrationService,
    joinAdmissionSqlQueryEngine: harness.joinAdmissionSqlQueryEngine,
    bootIncarnation: NEXT_INCARNATION,
  });

  const withdrawn = await owner.withdrawEndpointAtIncarnation(
    TABLES.NODE_ENDPOINTS,
    NODE_ENDPOINT_ID,
    {[COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE, [COLUMN.UPDATED_AT]: NOW_MS},
    'failed join node endpoint withdrawal',
  );

  t.equal(withdrawn, true,
    'zero-row endpoint withdrawal resolves via OWNER_RPC_REQUIRED authoritative readback');
  t.ok(
    harness.authoritativeReads.some(
      (read) => read.tableName === TABLES.NODE_ENDPOINTS &&
        read.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    ),
    'withdrawEndpointAtIncarnation reads NODE_ENDPOINTS authoritatively on the join gateway',
  );
});

test('join-admission gateway still fences control_plane_publications off startup SQL when CDC is absent', async (t) => {
  const harness = createAuthoritativeTableHarness({
    existingNodes: [],
    existingNodeEndpoints: [],
    existingServiceEndpoints: [],
  });
  const owner = createOwnerForRestart({
    cdcIntegrationService: null,
    joinAdmissionSqlQueryEngine: harness.joinAdmissionSqlQueryEngine,
    bootIncarnation: PRIOR_INCARNATION,
  });
  const gateway = owner.getJoinAdmissionControlPlaneSystemTableGateway();
  await t.rejects(
    gateway.submitMutation(
      {operation: 'insert', tableName: TABLES.CONTROL_PLANE_PUBLICATIONS, row: {publication_id: 'p-1'}},
      {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN},
    ),
    {message: GATEWAY_ERROR_MSG.CDC_REQUIRED},
  );
  t.equal(harness.sqlCalls.length, 0, 'control_plane_publications never reaches startup SQL');
});
