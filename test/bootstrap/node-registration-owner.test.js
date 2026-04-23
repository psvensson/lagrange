import {test} from '../../src/test-helpers/tap.js';
import {NodeRegistrationOwner} from
  '../../src/bootstrap/shared/node-registration-owner.js';
import {CONTROL_PLANE_PHASE_SCOPE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  COLUMN,
  NUM,
  STATE,
  TIME_MS,
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
const TEST_NODE_CAPABILITIES = Object.freeze([]);
const TEST_CLUSTER_INCARNATION_FENCE_BLOCKED = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze(['cluster_incarnation_identity_mismatch']),
  localIdentityState: 'mismatched',
  durableMembershipState: 'present',
  peerProofState: 'recovered',
});

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
    t.equal(nodeCalls.length, NUM.ONE,
      'should publish exactly one nodes row via the membership owner');
    t.equal(endpointCalls.length, NUM.ONE,
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
      delegates: createDelegates(),
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
      NUM.ZERO,
      'should not rewrite the canonical nodes row when authoritative progress exists',
    );
    t.equal(
      endpointCalls.length,
      NUM.ONE,
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
      NUM.ONE,
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
