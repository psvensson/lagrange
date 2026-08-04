import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_PHASE_SCOPE,
} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  NUM,
  SERVICE_STATUS,
  STATE,
  TIME_MS,
  TABLES,
} from '../../src/constants/index.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';

const TEST_NODE_ID = 'test-node-registration-owner';
const TEST_NODE_ADDRESS = 'joiner-host:8080';
const TEST_WS_PORT = 8082;
const TEST_NOW_MS = 1_710_000_000_000;
const TEST_LOGGER = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
const TEST_SERVICE_ENDPOINT_UNHEALTHY = 'unhealthy';
const TEST_NODE_CAPABILITIES = Object.freeze([]);
const TEST_CLUSTER_INCARNATION_FENCE_BLOCKED = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze(['cluster_incarnation_identity_mismatch']),
  localIdentityState: 'mismatched',
  durableMembershipState: 'present',
  peerProofState: 'recovered',
});
const TEST_CLUSTER_INCARNATION_FENCE_ALLOWED = Object.freeze({
  state: 'current',
  allowed: true,
  reasonCodes: Object.freeze([]),
  localIdentityState: 'matched',
  durableMembershipState: 'present',
  peerProofState: 'not_required',
});

function buildPublicationOwnerRecorder(publicationCalls) {
  return {
    upsertJoinNode: async (row, options) => {
      publicationCalls.push({kind: 'node', row, options});
      return {success: true};
    },
    upsertJoinNodeEndpoint: async (row, options) => {
      publicationCalls.push({kind: 'node_endpoint', row, options});
      return {success: true};
    },
    upsertJoinServiceEndpoint: async (row, options) => {
      publicationCalls.push({kind: 'service_endpoint', row, options});
      return {success: true};
    },
  };
}

function buildBudgetResolution(nodeRow) {
  return {
    budgetRow: {
      ...nodeRow,
      storage_budget_bytes: 1024,
      storage_budget_source: 'test',
      storage_budget_updated_at: nodeRow[COLUMN.CREATED_AT],
    },
    resolution: {
      isValid: true,
      budgetBytes: 1024,
      source: 'test',
      diskBytes: 1024,
    },
  };
}

function createDelegates() {
  return {
    getLogger: () => TEST_LOGGER,
    getNow: () => () => TEST_NOW_MS,
    getSleep: () => async () => {},
    getWsPort: () => TEST_WS_PORT,
    getCdcIntegrationService: () => ({sqlQueryEngine: {}}),
    getNodeStorageBudgetService: () => ({
      resolveBudgetRow: (nodeRow) => buildBudgetResolution(nodeRow),
    }),
    getNodeCapabilities: () => TEST_NODE_CAPABILITIES,
  };
}

test(
  'NodeRegistrationOwner routes join admission rows through ' +
  'membership publication runtime owner',
  async (t) => {
    const publicationCalls = [];
    const membershipPublicationRuntimeOwner = {
      upsertJoinNode: async (row, options) => {
        publicationCalls.push({kind: 'node', row, options});
        return {success: true};
      },
      upsertJoinNodeEndpoint: async (row, options) => {
        publicationCalls.push({kind: 'node_endpoint', row, options});
        return {success: true};
      },
      upsertJoinServiceEndpoint: async (row, options) => {
        publicationCalls.push({kind: 'service_endpoint', row, options});
        return {success: true};
      },
    };
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: createDelegates(),
    });
    owner.seedJoinTimeCacheRow = () => {};

    const result = await owner.registerNodeInCluster();

    t.ok(result, 'registerNodeInCluster should return registration result');
    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    const endpointCalls =
      publicationCalls.filter((call) => call.kind === 'node_endpoint');
    const serviceEndpointCalls = publicationCalls.filter((call) =>
      call.kind === 'service_endpoint',
    );
    t.equal(nodeCalls.length, 1,
      'should publish exactly one nodes row via the membership owner');
    t.equal(endpointCalls.length, 1,
      'should publish exactly one node_endpoints row via the membership owner');
    t.equal(serviceEndpointCalls.length, NUM.THREE,
      'should publish all built-in meta service endpoints via the membership owner');
    t.equal(
      nodeCalls[0].row[COLUMN.NODE_ID],
      TEST_NODE_ID,
      'should publish canonical node identity through the membership owner',
    );
    t.equal(
      nodeCalls[0].row[COLUMN.CONNECTION_STATE],
      STATE.CONNECTED,
      'should preserve CONNECTED admission state on the canonical nodes row',
    );
    t.equal(
      nodeCalls[0].row[COLUMN.STATUS],
      NODE_STATE.JOINING,
      'join admission stays non-active until the ready-lease heartbeat',
    );
    const joinMutationOptions = publicationCalls.map((call) => call.options);
    t.ok(
      joinMutationOptions.every((options) => options?.skipCacheWait === true),
      'membership owner join writes should skip cache wait during registration',
    );
    t.ok(
      joinMutationOptions.every((options) =>
        Number.isFinite(options?.queryTimeoutMs) &&
        options.queryTimeoutMs >= TIME_MS.SECOND,
      ),
      'membership owner join writes should retain bounded query timeout policy',
    );
    t.ok(
      joinMutationOptions.every((options) =>
        options?.phaseScope === CONTROL_PLANE_PHASE_SCOPE.JOIN,
      ),
      'membership owner join writes should declare join phase scope explicitly',
    );
    t.equal(
      endpointCalls[0].row[COLUMN.NODE_ID],
      TEST_NODE_ID,
      'node endpoint publication should be routed through the owner',
    );
  });

test(
  'NodeRegistrationOwner resumes join admission from authoritative ' +
  'node progress before publishing missing endpoints',
  async (t) => {
    const publicationCalls = [];
    const membershipPublicationRuntimeOwner = {
      upsertJoinNode: async (row, options) => {
        publicationCalls.push({kind: 'node', row, options});
        return {success: true};
      },
      upsertJoinNodeEndpoint: async (row, options) => {
        publicationCalls.push({kind: 'node_endpoint', row, options});
        return {success: true};
      },
      upsertJoinServiceEndpoint: async (row, options) => {
        publicationCalls.push({kind: 'service_endpoint', row, options});
        return {success: true};
      },
    };
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createDelegates(),
        getClusterIncarnationFence: () =>
          TEST_CLUSTER_INCARNATION_FENCE_ALLOWED,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    owner.readAuthoritativeDurableRejoinNodeRow = async () => ({
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.NODE_ADDRESS]: TEST_NODE_ADDRESS,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.STATUS]: 'active',
      [COLUMN.CREATED_AT]: TEST_NOW_MS,
      [COLUMN.LAST_HEARTBEAT]: TEST_NOW_MS,
    });
    owner.readAuthoritativeNodeEndpointRow = async () => null;
    owner.readAuthoritativeMetaEndpointRows = async () => [];

    const result = await owner.registerNodeInCluster();

    t.ok(result, 'registerNodeInCluster should return registration result');
    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    const endpointCalls =
      publicationCalls.filter((call) => call.kind === 'node_endpoint');
    const serviceEndpointCalls = publicationCalls.filter((call) =>
      call.kind === 'service_endpoint',
    );
    t.equal(
      nodeCalls.length,
      0,
      'should not rewrite the canonical nodes row when authoritative progress exists',
    );
    t.equal(
      endpointCalls.length,
      1,
      'should continue with missing node endpoint publication',
    );
    t.equal(
      serviceEndpointCalls.length,
      NUM.THREE,
      'should continue with missing built-in meta endpoint publication',
    );
    t.equal(
      result.nodeRow[COLUMN.NODE_ID],
      TEST_NODE_ID,
      'should reuse the authoritative nodes row for resumed admission',
    );
    t.equal(
      result.resolution?.source,
      'existing_join_admission_progress',
      'should surface authoritative join progress as the resolution source',
    );
  });

test(
  'NodeRegistrationOwner falls back to fresh admission writes when the ' +
  'cluster-incarnation fence blocks durable rejoin reuse',
  async (t) => {
    const publicationCalls = [];
    const membershipPublicationRuntimeOwner = buildPublicationOwnerRecorder(
      publicationCalls,
    );
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createDelegates(),
        getJoinLifecycleIntentType: () =>
          MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
        getClusterIncarnationFence: () =>
          TEST_CLUSTER_INCARNATION_FENCE_BLOCKED,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    owner.readAuthoritativeDurableRejoinNodeRow = async () => ({
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.NODE_ADDRESS]: TEST_NODE_ADDRESS,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.STATUS]: 'active',
      [COLUMN.CREATED_AT]: TEST_NOW_MS,
      [COLUMN.LAST_HEARTBEAT]: TEST_NOW_MS,
    });
    owner.readAuthoritativeNodeEndpointRow = async () => ({
      endpoint_id: 'ep-reused',
      node_id: TEST_NODE_ID,
      transport_type: 'websocket',
      address: 'ws://joiner-host:8082',
      status: 'active',
    });
    owner.readAuthoritativeMetaEndpointRows = async () => ([{
      endpoint_id: 'svc-reused',
      service_id: 'sys-postgres-wire',
      node_id: TEST_NODE_ID,
    }]);

    const result = await owner.registerNodeInCluster();

    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    t.equal(
      nodeCalls.length,
      1,
      'blocked incarnation fence should force fresh join admission publication',
    );
    t.notOk(
      result?.reusedExistingMembership,
      'blocked incarnation fence must prevent durable membership reuse',
    );
    t.not(
      result?.resolution?.source,
      'durable_rejoin_existing_membership',
      'blocked incarnation fence must not report durable rejoin membership reuse',
    );
  },
);

test(
  'NodeRegistrationOwner blocks durable rejoin reuse when the ' +
  'cluster-incarnation fence is unavailable',
  async (t) => {
    const publicationCalls = [];
    const warnings = [];
    const membershipPublicationRuntimeOwner = buildPublicationOwnerRecorder(
      publicationCalls,
    );
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createDelegates(),
        getLogger: () => ({
          ...TEST_LOGGER,
          warn: (message, metadata) => warnings.push({message, metadata}),
        }),
        getJoinLifecycleIntentType: () =>
          MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
        getClusterIncarnationFence: () => null,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    owner.readAuthoritativeDurableRejoinNodeRow = async () => ({
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.NODE_ADDRESS]: TEST_NODE_ADDRESS,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.STATUS]: NODE_STATE.ACTIVE,
      [COLUMN.CREATED_AT]: TEST_NOW_MS,
      [COLUMN.LAST_HEARTBEAT]: TEST_NOW_MS,
    });
    owner.readAuthoritativeNodeEndpointRow = async () => null;
    owner.readAuthoritativeMetaEndpointRows = async () => [];

    const result = await owner.registerNodeInCluster();

    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    t.equal(
      nodeCalls.length,
      1,
      'an unavailable fence must fail closed into fresh join admission',
    );
    t.notOk(
      result?.reusedExistingMembership,
      'an unavailable fence must not reuse durable membership',
    );
    t.equal(
      warnings.length,
      2,
      'each gated reuse path should emit a fail-closed diagnostic',
    );
  },
);

test(
  'NodeRegistrationOwner refuses join admission progress reuse for a ' +
  'terminal durable node status',
  async (t) => {
    const publicationCalls = [];
    const membershipPublicationRuntimeOwner = buildPublicationOwnerRecorder(
      publicationCalls,
    );
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      membershipPublicationRuntimeOwner,
      delegates: {
        ...createDelegates(),
        getClusterIncarnationFence: () =>
          TEST_CLUSTER_INCARNATION_FENCE_ALLOWED,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    owner.readAuthoritativeDurableRejoinNodeRow = async () => ({
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.NODE_ADDRESS]: TEST_NODE_ADDRESS,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.STATUS]: NODE_STATE.STOPPED,
      [COLUMN.CREATED_AT]: TEST_NOW_MS,
      [COLUMN.LAST_HEARTBEAT]: TEST_NOW_MS,
    });
    owner.readAuthoritativeNodeEndpointRow = async () => null;
    owner.readAuthoritativeMetaEndpointRows = async () => [];

    const result = await owner.registerNodeInCluster();

    const nodeCalls = publicationCalls.filter((call) => call.kind === 'node');
    t.equal(
      nodeCalls.length,
      1,
      'a terminal durable status must not be reused as join progress',
    );
    t.equal(
      nodeCalls[0].row[COLUMN.STATUS],
      NODE_STATE.JOINING,
      'fresh admission must publish JOINING over a terminal durable status',
    );
    t.not(
      result?.resolution?.source,
      'existing_join_admission_progress',
      'a terminal durable status must not report progress reuse',
    );
  },
);

test(
  'NodeRegistrationOwner withdraws failed join admission with primary-keyed ' +
  'control-plane updates',
  async (t) => {
    const updateCalls = [];
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      delegates: createDelegates(),
    });
    owner.getJoinAdmissionControlPlaneSystemTableGateway = () => ({
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updateCalls.push({tableName, whereClause, data, options});
        return {partitionResult: {affectedRows: 1}};
      },
    });
    owner.readAuthoritativeMetaEndpointRows = async () => ([{
      [COLUMN.ENDPOINT_ID]: 'meta-endpoint-1',
      [COLUMN.NODE_ID]: TEST_NODE_ID,
    }]);

    const result = await owner.withdrawFailedJoinAdmission({
      registeredNodeId: TEST_NODE_ID,
    });

    t.equal(result.success, true, 'withdrawal should report success');
    t.equal(updateCalls.length, NUM.THREE,
      'withdrawal should update node, node endpoint, and service endpoint');
    t.match(updateCalls[0], {
      tableName: TABLES.NODES,
      whereClause: {[COLUMN.NODE_ID]: TEST_NODE_ID},
      data: {
        [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
        [COLUMN.CONNECTION_STATE]: STATE.DISCONNECTED,
        [COLUMN.READY_LEASE_EXPIRES_AT]: null,
      },
    });
    t.match(updateCalls[1], {
      tableName: TABLES.NODE_ENDPOINTS,
      whereClause: {[COLUMN.ENDPOINT_ID]: `ep-${TEST_NODE_ID}-ws`},
      data: {
        [COLUMN.STATUS]: ENDPOINT_STATUS.INACTIVE,
      },
    });
    t.match(updateCalls[2], {
      tableName: TABLES.SERVICE_ENDPOINTS,
      whereClause: {[COLUMN.ENDPOINT_ID]: 'meta-endpoint-1'},
      data: {
        health_status: TEST_SERVICE_ENDPOINT_UNHEALTHY,
      },
    });
    t.ok(
      updateCalls.every((call) =>
        call.options?.phaseScope === CONTROL_PLANE_PHASE_SCOPE.JOIN &&
        call.options?.skipCacheWait === true,
      ),
      'withdrawal writes should keep join phase control-plane options',
    );
  },
);

test(
  'NodeRegistrationOwner preserves deferred failed-join withdrawal contract',
  async (t) => {
    const updateCalls = [];
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      delegates: createDelegates(),
    });
    owner.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
    owner.getJoinAdmissionControlPlaneSystemTableGateway = () => ({
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updateCalls.push({tableName, whereClause, data, options});
        if (tableName === TABLES.NODES) {
          return {
            success: false,
            outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
            contractState: 'deferred',
            nextAction: 'retry',
            retryAfterMs: TIME_MS.SECOND,
          };
        }
        return {success: true};
      },
    });
    owner.readAuthoritativeMetaEndpointRows = async () => [];

    const result = await owner.withdrawFailedJoinAdmission({
      registeredNodeId: TEST_NODE_ID,
    });

    t.equal(result.success, false,
      'deferred withdrawal should preserve raw mutation success');
    t.equal(result.accepted, true,
      'deferred owner contract should still be accepted');
    t.equal(result.withdrawalDeferred, true,
      'deferred owner contract should stay visible to diagnostics');
    t.equal(result.contractState, 'deferred');
    t.equal(result.nextAction, 'retry');
    t.equal(result.outcome, CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY);
    t.equal(result.retryAfterMs, TIME_MS.SECOND);
    t.equal(updateCalls.length, 2,
      'best-effort endpoint withdrawal can still run after deferred node write');
  },
);
