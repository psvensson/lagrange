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
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../../src/bootstrap/rejoin-hints-constants.js';

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
const TEST_UNAVAILABLE_READ_ROWS = async () => ({
  success: false,
  error: 'authoritative_row_source_unavailable',
});
const TEST_READABLE_EMPTY_READ_ROWS = async () => ({
  success: true,
  rows: [],
});

/**
 * Point the owner's authoritative control-plane view at an injected read
 * stub. readAuthoritativeRows stays the real implementation so the test
 * fails red if the typed {state, rows} outcome is reverted to the
 * bare-array collapse.
 * @param {Object} owner - NodeRegistrationOwner under test.
 * @param {Function} readRows - Injected authoritative readRows stub.
 */
function stubAuthoritativeViewReads(owner, readRows) {
  owner.getAuthoritativeControlPlaneView = () => ({
    canRead: () => true,
    readRows,
  });
}
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

function createFailedJoinWithdrawalOwner(nodeMutationResult) {
  const owner = new NodeRegistrationOwner({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    delegates: createDelegates(),
  });
  owner.getJoinAdmissionWriteRetryTimeoutMs = () => 0;
  owner.getJoinAdmissionControlPlaneSystemTableGateway = () => ({
    updateSystemTableRow: async (tableName) =>
      tableName === TABLES.NODES ?
        nodeMutationResult :
        {success: true},
  });
  owner.readAuthoritativeMetaEndpointRowsOutcome = async () => ({
    state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
    tableName: TABLES.SERVICE_ENDPOINTS,
    rows: [],
  });
  return owner;
}

async function withdrawWithNodeMutationResult(nodeMutationResult) {
  return createFailedJoinWithdrawalOwner(nodeMutationResult)
    .withdrawFailedJoinAdmission({registeredNodeId: TEST_NODE_ID});
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
    owner.readAuthoritativeNodeEndpointRowOutcome = async () => ({
      state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
      rows: [],
      tableName: TABLES.NODE_ENDPOINTS,
      row: null,
    });
    owner.readAuthoritativeMetaEndpointRowsOutcome = async () => ({
      state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
      rows: [],
      tableName: TABLES.SERVICE_ENDPOINTS,
    });

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
    owner.readAuthoritativeMetaEndpointRowsOutcome = async () => ({
      state: AUTHORITATIVE_ROW_READ_STATE.READABLE,
      tableName: TABLES.SERVICE_ENDPOINTS,
      rows: [{
        [COLUMN.ENDPOINT_ID]: 'meta-endpoint-1',
        [COLUMN.NODE_ID]: TEST_NODE_ID,
      }],
    });

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
      'deferred outcome should not default missing success to applied');
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

test(
  'NodeRegistrationOwner failed-join withdrawal consumes every canonical ' +
  'mutation outcome without success defaults',
  async (t) => {
    const expectedByOutcome = Object.freeze({
      [CONTROL_PLANE_MUTATION_OUTCOME.APPLIED]:
        {success: true, accepted: true, withdrawalDeferred: false},
      [CONTROL_PLANE_MUTATION_OUTCOME.NO_OP]:
        {success: false, accepted: true, withdrawalDeferred: true},
      [CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY]:
        {success: true, accepted: true, withdrawalDeferred: true},
      [CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED]:
        {success: false, accepted: true, withdrawalDeferred: true},
      [CONTROL_PLANE_MUTATION_OUTCOME.REJECTED]:
        {success: false, accepted: false, withdrawalDeferred: false},
      [CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY]:
        {success: false, accepted: true, withdrawalDeferred: true},
      [CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED]:
        {success: false, accepted: true, withdrawalDeferred: true},
    });
    t.same(
      Object.keys(expectedByOutcome).sort(),
      Object.values(CONTROL_PLANE_MUTATION_OUTCOME).sort(),
      'withdrawal coverage must exhaust the frozen gateway enum',
    );

    for (const outcome of Object.values(CONTROL_PLANE_MUTATION_OUTCOME)) {
      const result = await withdrawWithNodeMutationResult({outcome});
      t.match(result, expectedByOutcome[outcome],
        `${outcome} should use the canonical effect tuple`);
      t.equal(result.outcome, outcome,
        `${outcome} should remain visible to withdrawal diagnostics`);
    }
  },
);

test(
  'NodeRegistrationOwner failed-join withdrawal preserves valid legacy ' +
  'and explicit owner-contract fallback semantics',
  async (t) => {
    const cases = [
      {
        label: 'legacy positive rows',
        value: {success: true, partitionResult: {affectedRows: 1}},
        expected: {success: true, accepted: true, withdrawalDeferred: false},
      },
      {
        label: 'legacy zero rows',
        value: {success: true, partitionResult: {affectedRows: 0}},
        expected: {success: false, accepted: false, withdrawalDeferred: false},
      },
      {
        label: 'legacy failure',
        value: {success: false},
        expected: {success: false, accepted: false, withdrawalDeferred: false},
      },
      {
        label: 'unknown typed success',
        value: {outcome: 'future_outcome', success: true, affectedRows: 1},
        expected: {success: false, accepted: false, withdrawalDeferred: false},
      },
      {
        label: 'safe pending fallback',
        value: {success: false, contractState: 'pending', nextAction: 'wait'},
        expected: {success: false, accepted: true, withdrawalDeferred: true},
      },
      {
        label: 'safe deferred fallback',
        value: {success: false, contractState: 'deferred', nextAction: 'retry'},
        expected: {success: false, accepted: true, withdrawalDeferred: true},
      },
      {
        label: 'explicit terminal owner contract',
        value: {success: true, contractState: 'blocked', nextAction: 'stop'},
        expected: {success: false, accepted: false, withdrawalDeferred: false},
      },
    ];

    for (const entry of cases) {
      const result = await withdrawWithNodeMutationResult(entry.value);
      t.match(result, entry.expected, entry.label);
    }

    const primaryHint = await withdrawWithNodeMutationResult({
      success: false,
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: 250,
      pressureRetryAfterMs: 500,
    });
    t.equal(primaryHint.retryAfterMs, 250,
      'safe primary retry hint has precedence');
    const pressureHint = await withdrawWithNodeMutationResult({
      success: false,
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: 'invalid',
      pressureRetryAfterMs: 500,
    });
    t.equal(pressureHint.retryAfterMs, 500,
      'safe pressure retry hint is the fallback');

    for (const invalidPrimary of [
      Number.NaN,
      -0,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.POSITIVE_INFINITY,
    ]) {
      const result = await withdrawWithNodeMutationResult({
        success: false,
        contractState: 'pending',
        nextAction: 'retry',
        retryAfterMs: invalidPrimary,
        pressureRetryAfterMs: 500,
      });
      t.equal(result.retryAfterMs, 500,
        'invalid numeric primary retry hint falls back to safe pressure hint');
    }
    const zeroHint = await withdrawWithNodeMutationResult({
      success: false,
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: 0,
      pressureRetryAfterMs: 500,
    });
    t.equal(zeroHint.retryAfterMs, 0,
      'positive zero is a safe immediate primary retry hint');
  },
);

test(
  'NodeRegistrationOwner failed-join withdrawal rejects inherited and ' +
  'hostile mutation metadata without executing it',
  async (t) => {
    const inherited = Object.create({
      success: false,
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: 900,
    });
    const inheritedResult = await withdrawWithNodeMutationResult(inherited);
    t.match(inheritedResult, {
      success: false,
      accepted: false,
      withdrawalDeferred: false,
    }, 'custom-prototype inherited fallback must fail closed');

    const pollutedFields = {
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: 900,
    };
    const savedDescriptors = {};
    try {
      for (const [property, value] of Object.entries(pollutedFields)) {
        savedDescriptors[property] = Object.getOwnPropertyDescriptor(
          Object.prototype,
          property,
        );
        Reflect.defineProperty(Object.prototype, property, {
          configurable: true,
          value,
        });
      }
      const pollutedResult =
        await withdrawWithNodeMutationResult({success: false});
      t.match(pollutedResult, {
        success: false,
        accepted: false,
        withdrawalDeferred: false,
        retryAfterMs: null,
      }, 'Object.prototype owner-contract pollution cannot activate fallback');
    } finally {
      for (const property of Object.keys(pollutedFields)) {
        const savedDescriptor = savedDescriptors[property];
        if (savedDescriptor) {
          Reflect.defineProperty(Object.prototype, property, savedDescriptor);
        } else {
          Reflect.deleteProperty(Object.prototype, property);
        }
      }
    }

    const nullPrototype = Object.create(null);
    nullPrototype.success = false;
    nullPrototype.contractState = 'pending';
    nullPrototype.nextAction = 'wait';
    nullPrototype.retryAfterMs = 300;
    const nullPrototypeResult =
      await withdrawWithNodeMutationResult(nullPrototype);
    t.match(nullPrototypeResult, {
      success: false,
      accepted: true,
      withdrawalDeferred: true,
      retryAfterMs: 300,
    }, 'own null-prototype metadata remains valid');

    let accessorCalls = 0;
    const appliedWithAccessors = {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    };
    for (const property of [
      'contractState',
      'nextAction',
      'retryAfterMs',
      'pressureRetryAfterMs',
    ]) {
      Object.defineProperty(appliedWithAccessors, property, {
        get() {
          accessorCalls += 1;
          throw new Error(`must not read ${property}`);
        },
      });
    }
    const accessorResult =
      await withdrawWithNodeMutationResult(appliedWithAccessors);
    t.match(accessorResult, {
      success: true,
      accepted: true,
      withdrawalDeferred: false,
      contractState: '',
      nextAction: '',
      retryAfterMs: null,
    }, 'adapter accessors are neutral and cannot override a canonical apply');
    t.equal(accessorCalls, 0, 'adapter metadata accessors never execute');

    let coercionCalls = 0;
    const coerciveRetry = {
      valueOf() {
        coercionCalls += 1;
        return 700;
      },
    };
    const coerciveResult = await withdrawWithNodeMutationResult({
      success: false,
      contractState: 'pending',
      nextAction: 'retry',
      retryAfterMs: coerciveRetry,
    });
    t.equal(coerciveResult.retryAfterMs, null,
      'coercive retry hints are ignored');
    t.equal(coercionCalls, 0, 'retry hints are never coerced');

    const originalTrim = String.prototype.trim;
    let poisonedTrimCalls = 0;
    let trimSafeResult;
    try {
      Reflect.defineProperty(String.prototype, 'trim', {
        configurable: true,
        value: function poisonedTrim() {
          poisonedTrimCalls += 1;
          return 'blocked';
        },
      });
      const trimSafeOwner = createFailedJoinWithdrawalOwner({
        success: false,
        contractState: ' pending ',
        nextAction: ' wait ',
      });
      trimSafeResult = await trimSafeOwner.withdrawFailedJoinAdmission({});
    } finally {
      Reflect.defineProperty(String.prototype, 'trim', {
        configurable: true,
        value: originalTrim,
      });
    }
    t.match(trimSafeResult, {
      success: false,
      accepted: true,
      withdrawalDeferred: true,
      contractState: 'pending',
      nextAction: 'wait',
    }, 'captured trim preserves safe fallback after intrinsic replacement');
    t.equal(poisonedTrimCalls, 0,
      'post-import String.prototype.trim replacement never executes');

    const proxyReads = [];
    const proxy = new Proxy({}, {
      get(_target, property) {
        proxyReads.push(String(property));
        return property === 'then' ? undefined : 'pending';
      },
      getOwnPropertyDescriptor(_target, property) {
        proxyReads.push(`descriptor:${String(property)}`);
        return {configurable: true, value: 'pending'};
      },
    });
    const proxyResult = await withdrawWithNodeMutationResult(proxy);
    t.match(proxyResult, {
      success: false,
      accepted: false,
      withdrawalDeferred: false,
    }, 'proxy mutation envelopes fail closed');
    t.notOk(proxyReads.some((property) =>
      property === 'contractState' || property === 'nextAction' ||
      property === 'retryAfterMs' || property === 'pressureRetryAfterMs' ||
      property.startsWith('descriptor:')),
    'classification and adapter normalization add no proxy metadata traps');
  },
);

test(
  'NodeRegistrationOwner returns a typed {state, rows} authoritative read ' +
  'outcome (unavailable on failure or unreadable source)',
  async (t) => {
    const owner = new NodeRegistrationOwner({
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      delegates: createDelegates(),
    });

    const noViewOutcome = await owner.readAuthoritativeRows(
      TABLES.NODES,
      'SELECT * FROM nodes',
      [],
    );
    t.equal(
      noViewOutcome.state,
      AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE,
      'a missing authoritative view must be UNAVAILABLE, not absence',
    );
    t.same(noViewOutcome.rows, [], 'an unavailable read carries no rows');

    const failingView = {
      canRead: () => true,
      readRows: async () => ({
        success: false,
        error: 'authoritative_row_source_unavailable',
      }),
    };
    const failedOutcome = await owner.readAuthoritativeRows.call(
      {getAuthoritativeControlPlaneView: () => failingView},
      TABLES.NODES,
      'SELECT * FROM nodes',
      [],
    );
    t.equal(
      failedOutcome.state,
      AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE,
      'a failed authoritative read must be UNAVAILABLE, not absence',
    );

    const emptyView = {
      canRead: () => true,
      readRows: async () => ({success: true, rows: []}),
    };
    const readableOutcome = await owner.readAuthoritativeRows.call(
      {getAuthoritativeControlPlaneView: () => emptyView},
      TABLES.NODES,
      'SELECT * FROM nodes',
      [],
    );
    t.equal(
      readableOutcome.state,
      AUTHORITATIVE_ROW_READ_STATE.READABLE,
      'a successful empty read is READABLE (genuine absence)',
    );
    t.same(
      readableOutcome.rows,
      [],
      'a READABLE empty outcome is proven absence, not unavailability',
    );
  },
);

test(
  'NodeRegistrationOwner defers restart rejoin with a typed retryable ' +
  'outcome when the authoritative row source is unavailable',
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
          TEST_CLUSTER_INCARNATION_FENCE_ALLOWED,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    stubAuthoritativeViewReads(owner, TEST_UNAVAILABLE_READ_ROWS);

    let caughtError = null;
    try {
      await owner.registerNodeInCluster();
    } catch (error) {
      caughtError = error;
    }

    t.ok(caughtError, 'an unavailable authority must fail registration');
    t.match(
      caughtError.message,
      /Authoritative control-plane row source unavailable/u,
      'the deferred error must name the unavailable authoritative source',
    );
    t.equal(
      caughtError.deferRetry,
      true,
      'the deferred outcome must stay retryable through the wrapped carrier',
    );
    t.equal(
      caughtError.retryAfterMs,
      TIME_MS.SECOND,
      'the deferred outcome must carry a retryAfterMs hint',
    );
    t.equal(
      caughtError.cause?.authoritativeRowReadState,
      AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE,
      'the deferred outcome must surface the typed authoritative read state',
    );
    t.equal(
      publicationCalls.length,
      0,
      'an unavailable authority must not fall through to any fresh upsert',
    );
  },
);

test(
  'NodeRegistrationOwner defers join admission progress resolution when ' +
  'the authoritative row source is unavailable',
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
    stubAuthoritativeViewReads(owner, TEST_UNAVAILABLE_READ_ROWS);

    let caughtError = null;
    try {
      await owner.registerNodeInCluster();
    } catch (error) {
      caughtError = error;
    }

    t.ok(caughtError, 'an unavailable authority must fail registration');
    t.equal(
      caughtError.deferRetry,
      true,
      'join admission progress resolution must defer retryable',
    );
    t.equal(
      caughtError.retryAfterMs,
      TIME_MS.SECOND,
      'join admission progress resolution must carry retryAfterMs',
    );
    t.equal(
      publicationCalls.filter((call) => call.kind === 'node').length,
      0,
      'an unavailable authority must not trigger a fresh nodes upsert',
    );
  },
);

test(
  'NodeRegistrationOwner fresh-upserts when the authoritative row source ' +
  'is readable but empty (genuine absence)',
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
          TEST_CLUSTER_INCARNATION_FENCE_ALLOWED,
      },
    });
    owner.seedJoinTimeCacheRow = () => {};
    stubAuthoritativeViewReads(owner, TEST_READABLE_EMPTY_READ_ROWS);

    const result = await owner.registerNodeInCluster();

    t.ok(result, 'a readable-empty authority allows fresh registration');
    t.equal(
      publicationCalls.filter((call) => call.kind === 'node').length,
      1,
      'genuine absence must proceed down the fresh upsert path',
    );
    t.equal(
      result.nodeRow[COLUMN.NODE_ID],
      TEST_NODE_ID,
      'fresh admission over proven absence registers the joining node',
    );
  },
);
