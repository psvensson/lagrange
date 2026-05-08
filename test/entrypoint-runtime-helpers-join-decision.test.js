import {mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../src/test-helpers/tap.js';
import {
  persistBootstrapRejoinHints,
} from '../src/bootstrap/rejoin-hints.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
} from '../src/bootstrap/rejoin-hints-constants.js';
import {CONFIG_KEY} from '../src/config/config-constants.js';
import {
  ENTRYPOINT_DEFAULT,
  ENTRYPOINT_ENV,
} from '../src/constants/entrypoint.js';
import {HTTP_STATUS} from '../src/constants/index.js';
import {
  resolveStartupJoinDecision,
} from '../src/entrypoint-runtime-helpers.js';

const TEST_NODE_ID = 'node-local';
const TEST_NODE_ADDRESS = 'node-local:8080';
const TEST_PEER_ADDRESS = 'peer-node:8080';
const TEST_EXPLICIT_SEED_NODE_ADDRESS = 'seed-node:8080';
const TEST_CLUSTER_NODE_COUNT = 2;
const TEST_UPDATED_AT = 1234;
const TEST_NODE_REST_API_PORT = 8080;
const TEST_NODE_WS_PORT = 8082;
const TEST_NODE_ROLE_JOINER = 'joiner';
const TEST_DECISION_SOURCE_REJOIN_HINTS = 'rejoin_hints';
const TEST_DECISION_SOURCE_EXPLICIT = 'explicit';
const TEST_MEMBERSHIP_REASON_EXPLICIT_SEED = 'explicit_seed';
const TEST_MEMBERSHIP_REASON_JOIN_PROBED_PEER = 'join_probed_peer';
const TEST_PROBE_MISS = async () => false;
const TEST_PROBE_HIT = async () => true;
const TEST_SERVER_HOST = '127.0.0.1';
const TEST_RESPONSE_BODY_OK = 'ok';
const TEST_RESPONSE_BODY_EMPTY = '';

function createConfig() {
  const values = new Map([
    [CONFIG_KEY.NODE_ID, TEST_NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, TEST_NODE_ADDRESS],
    [CONFIG_KEY.NODE_REST_API_PORT, TEST_NODE_REST_API_PORT],
    [CONFIG_KEY.NODE_WS_PORT, TEST_NODE_WS_PORT],
  ]);
  return {
    get(key) {
      return values.has(key) ? values.get(key) : null;
    },
  };
}

function createLogger() {
  return {
    info() {},
  };
}

function createProbeServer(routes) {
  return createServer((request, response) => {
    const route = routes[request.url] || {
      statusCode: HTTP_STATUS.NOT_FOUND,
      body: TEST_RESPONSE_BODY_EMPTY,
    };
    response.statusCode = route.statusCode;
    response.end(route.body);
  });
}

async function listenProbeServer(server) {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      reject(error);
    };
    server.once('error', handleError);
    server.listen(0, TEST_SERVER_HOST, () => {
      server.off('error', handleError);
      const address = server.address();
      resolve(
        `${ENTRYPOINT_DEFAULT.HTTP_PREFIX}${TEST_SERVER_HOST}:${address.port}`,
      );
    });
  });
}

async function closeProbeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createDecisionOptions(dataDir, env = {}, overrides = {}) {
  return {
    cliArgs: {},
    env,
    config: createConfig(),
    dataDirectoryManager: {
      getDataDir() {
        return dataDir;
      },
    },
    logger: createLogger(),
    ...overrides,
  };
}

test(
  'resolveStartupJoinDecision keeps explicit seed when durable peer is recovered but unprobed',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'entrypoint-join-decision-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      nodeRole: TEST_NODE_ROLE_JOINER,
      peerAddresses: [TEST_PEER_ADDRESS],
      clusterNodeCount: TEST_CLUSTER_NODE_COUNT,
      now: () => TEST_UPDATED_AT,
    });

    const decision = await resolveStartupJoinDecision(
      createDecisionOptions(dataDir, {
        [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: TEST_EXPLICIT_SEED_NODE_ADDRESS,
      }, {
        probePeerAddress: TEST_PROBE_MISS,
      }),
    );

    t.match(decision, {
      seedNodeAddress: TEST_EXPLICIT_SEED_NODE_ADDRESS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: TEST_DECISION_SOURCE_EXPLICIT,
      membershipOwnerOutcome: {
        semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
        boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
        outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        reasonCode: TEST_MEMBERSHIP_REASON_EXPLICIT_SEED,
        evidenceSource: TEST_DECISION_SOURCE_EXPLICIT,
      },
    });
  },
);

test(
  'resolveStartupJoinDecision prefers probed durable-rejoin peer over explicit seed',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'entrypoint-join-decision-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      nodeRole: TEST_NODE_ROLE_JOINER,
      peerAddresses: [TEST_PEER_ADDRESS],
      clusterNodeCount: TEST_CLUSTER_NODE_COUNT,
      now: () => TEST_UPDATED_AT,
    });

    const decision = await resolveStartupJoinDecision(
      createDecisionOptions(dataDir, {
        [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: TEST_EXPLICIT_SEED_NODE_ADDRESS,
      }, {
        probePeerAddress: TEST_PROBE_HIT,
      }),
    );

    t.match(decision, {
      seedNodeAddress: TEST_PEER_ADDRESS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: TEST_DECISION_SOURCE_REJOIN_HINTS,
      membershipOwnerOutcome: {
        semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
        boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
        outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        reasonCode: TEST_MEMBERSHIP_REASON_JOIN_PROBED_PEER,
        evidenceSource: TEST_DECISION_SOURCE_REJOIN_HINTS,
      },
    });
  },
);

test(
  'resolveStartupJoinDecision prefers bootstrap-ready peer over health-only peer',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'entrypoint-join-decision-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const healthOnlyPeer = createProbeServer({
      [ENTRYPOINT_DEFAULT.AUTO_REJOIN_BOOTSTRAP_READY_PATH]: {
        statusCode: HTTP_STATUS.SERVICE_UNAVAILABLE,
        body: TEST_RESPONSE_BODY_OK,
      },
      [ENTRYPOINT_DEFAULT.AUTO_REJOIN_HEALTH_PATH]: {
        statusCode: HTTP_STATUS.OK,
        body: TEST_RESPONSE_BODY_OK,
      },
    });
    const bootstrapReadyPeer = createProbeServer({
      [ENTRYPOINT_DEFAULT.AUTO_REJOIN_BOOTSTRAP_READY_PATH]: {
        statusCode: HTTP_STATUS.OK,
        body: TEST_RESPONSE_BODY_OK,
      },
      [ENTRYPOINT_DEFAULT.AUTO_REJOIN_HEALTH_PATH]: {
        statusCode: HTTP_STATUS.OK,
        body: TEST_RESPONSE_BODY_OK,
      },
    });
    const healthOnlyPeerAddress = await listenProbeServer(healthOnlyPeer);
    const bootstrapReadyPeerAddress =
      await listenProbeServer(bootstrapReadyPeer);
    t.after(() => closeProbeServer(healthOnlyPeer));
    t.after(() => closeProbeServer(bootstrapReadyPeer));

    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: TEST_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      nodeRole: TEST_NODE_ROLE_JOINER,
      peerAddresses: [healthOnlyPeerAddress, bootstrapReadyPeerAddress],
      clusterNodeCount: TEST_CLUSTER_NODE_COUNT,
      now: () => TEST_UPDATED_AT,
    });

    const decision = await resolveStartupJoinDecision(
      createDecisionOptions(dataDir, {
        [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: TEST_EXPLICIT_SEED_NODE_ADDRESS,
      }),
    );

    t.match(decision, {
      seedNodeAddress: bootstrapReadyPeerAddress,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: TEST_DECISION_SOURCE_REJOIN_HINTS,
      membershipOwnerOutcome: {
        semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
        boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
        outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        reasonCode: TEST_MEMBERSHIP_REASON_JOIN_PROBED_PEER,
        evidenceSource: TEST_DECISION_SOURCE_REJOIN_HINTS,
      },
    });
  },
);

test('resolveStartupJoinDecision keeps explicit seed for fresh join', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'entrypoint-join-decision-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const decision = await resolveStartupJoinDecision(
    createDecisionOptions(dataDir, {
      [ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: TEST_EXPLICIT_SEED_NODE_ADDRESS,
    }),
  );

  t.match(decision, {
    seedNodeAddress: TEST_EXPLICIT_SEED_NODE_ADDRESS,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    source: TEST_DECISION_SOURCE_EXPLICIT,
    membershipOwnerOutcome: {
      semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
      boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
      outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.JOIN_ADMISSION,
      startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
      reasonCode: TEST_MEMBERSHIP_REASON_EXPLICIT_SEED,
      evidenceSource: TEST_DECISION_SOURCE_EXPLICIT,
    },
  });
});
