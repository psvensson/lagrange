import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../src/test-helpers/tap.js';
import {
  persistBootstrapRejoinHints,
} from '../src/bootstrap/rejoin-hints.js';
import {STARTUP_JOIN_MODE} from '../src/bootstrap/rejoin-hints-constants.js';
import {CONFIG_KEY} from '../src/config/config-constants.js';
import {ENTRYPOINT_ENV} from '../src/constants/entrypoint.js';
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

function createDecisionOptions(dataDir, env = {}) {
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
  };
}

test(
  'resolveStartupJoinDecision prefers recovered durable-rejoin peer over explicit seed',
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
      }),
    );

    t.same(decision, {
      seedNodeAddress: TEST_PEER_ADDRESS,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      source: TEST_DECISION_SOURCE_REJOIN_HINTS,
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

  t.same(decision, {
    seedNodeAddress: TEST_EXPLICIT_SEED_NODE_ADDRESS,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    source: TEST_DECISION_SOURCE_EXPLICIT,
  });
});
