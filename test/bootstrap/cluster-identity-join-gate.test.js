/**
 * Cluster-identity join gate: the seed-side admission owner refuses a
 * bootstrap request whose expectedClusterId names a DIFFERENT cluster with
 * the typed 409 CLUSTER_ID_MISMATCH rejection, and the joiner-side contact
 * phase sends expectedClusterId from its persisted identity. A request
 * without the field (pre-identity joiner) is accepted by the explicit
 * compatibility policy — never silently "matched".
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ContactSeedPhase,
} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  CLUSTER_ID_CONFIG_KEY,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {
  BOOTSTRAP_API_ERROR,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const SEED_NODE_ID = 'seed-node-1';
const SEED_NODE_ADDRESS = 'ws://localhost:8080';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const JOINER_NODE_ADDRESS = 'ws://localhost:9090';
const CLUSTER_ID_A = '11111111-1111-4111-8111-111111111111';
const CLUSTER_ID_B = '22222222-2222-4222-8222-222222222222';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCacheWithClusterId(clusterId) {
  return {
    get(table, key) {
      if (table === TABLES.CONFIG && key === CLUSTER_ID_CONFIG_KEY) {
        return clusterId === null ?
          null :
          {[COLUMN.CONFIG_VALUE]: clusterId};
      }
      return null;
    },
    getAll() {
      return [];
    },
  };
}

test('checkForConflicts rejects a foreign cluster identity with the typed ' +
  'mismatch refusal', async (t) => {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithClusterId(CLUSTER_ID_A),
  });

  const result = await api.checkForConflicts(
    JOINER_NODE_ID,
    JOINER_NODE_ADDRESS,
    {expectedClusterId: CLUSTER_ID_B},
  );
  t.equal(
    result,
    BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH,
    'a request naming another cluster is refused before any node conflict check',
  );
});

test('checkForConflicts accepts the matching cluster identity and the ' +
  'pre-identity compatibility policy', async (t) => {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithClusterId(CLUSTER_ID_A),
  });

  t.equal(
    await api.checkForConflicts(
      JOINER_NODE_ID,
      JOINER_NODE_ADDRESS,
      {expectedClusterId: CLUSTER_ID_A},
    ),
    null,
    'a matching expectedClusterId passes the gate',
  );
  t.equal(
    await api.checkForConflicts(
      JOINER_NODE_ID,
      JOINER_NODE_ADDRESS,
      {},
    ),
    null,
    'a pre-identity joiner (no expectedClusterId) is accepted by policy',
  );
});

test('a pre-identity seed accepts any named cluster by compatibility ' +
  'policy', async (t) => {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithClusterId(null),
  });

  t.equal(
    await api.checkForConflicts(
      JOINER_NODE_ID,
      JOINER_NODE_ADDRESS,
      {expectedClusterId: CLUSTER_ID_A},
    ),
    null,
    'a seed with no durable identity yet does not fence (UNKNOWN, not match)',
  );
});

test('buildSeedContactRequest carries expectedClusterId from the joiner ' +
  'delegates', async (t) => {
  const phase = new ContactSeedPhase({
    nodeId: JOINER_NODE_ID,
    delegates: {
      getExpectedClusterId: () => CLUSTER_ID_A,
    },
  });
  const request = phase.buildSeedContactRequest(
    {nodeAddress: JOINER_NODE_ADDRESS},
    {startedAtMs: 1000, requestTimeoutMs: 500},
  );
  t.equal(
    request.expectedClusterId,
    CLUSTER_ID_A,
    'the bootstrap request names the cluster the joiner belongs to',
  );

  const freshPhase = new ContactSeedPhase({
    nodeId: JOINER_NODE_ID,
    delegates: {
      getExpectedClusterId: () => null,
    },
  });
  const freshRequest = freshPhase.buildSeedContactRequest(
    {nodeAddress: JOINER_NODE_ADDRESS},
    {startedAtMs: 1000, requestTimeoutMs: 500},
  );
  t.equal(
    Object.prototype.hasOwnProperty.call(freshRequest, 'expectedClusterId'),
    false,
    'a fresh joiner sends no expectedClusterId (compatibility policy)',
  );
});

test('the seed stamps its cluster identity onto the bootstrap response ' +
  'shape', async (t) => {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithClusterId(CLUSTER_ID_A),
  });
  t.equal(
    api.getClusterId(),
    CLUSTER_ID_A,
    'the bootstrap API exposes the durable identity for the response builder',
  );

  // The response builder reads the identity through the request owner's
  // getClusterId delegate and stamps it onto the response object — the seam
  // a pre-identity joiner learns the cluster id from.
  const owner = api.bootstrapRequestOwner;
  t.equal(
    typeof owner.getClusterId,
    'function',
    'the request owner exposes getClusterId for the response builder',
  );
  t.equal(
    owner.getClusterId(),
    CLUSTER_ID_A,
    'the request owner reads the same durable identity the response stamps',
  );
});
