/**
 * Cluster identity at join (S4, decision D6). The real bootstrap handler
 * (BootstrapAPI over fastify inject) answers the real joiner contact phase
 * (ContactSeedPhase), and the joiner's held identity comes from a real data
 * directory. The server answers a join only when it knows its identity from
 * the durable owner (the CONFIG partition's authoritative read; its cache
 * never holds the row here, so the cache is not the source); otherwise it
 * answers the typed retryable CLUSTER_IDENTITY_UNAVAILABLE. A joiner holding
 * one id is refused by a server of another, refuses a response of another,
 * and keeps its id; a fresh node adopts the server's id.
 */

import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ContactSeedPhase} from
  '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_PROBE_REASON,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  JOIN_IDENTITY_REFUSAL_CODE,
  JOIN_RESPONSE_IDENTITY_STATE,
} from '../../src/bootstrap/join-cluster-identity.js';
import {CLUSTER_ID_CONFIG_KEY} from
  '../../src/bootstrap/cluster-identity-constants.js';
import {readLocalClusterIdentity} from
  '../../src/bootstrap/local-cluster-identity.js';
import {
  JOINING_ERROR_MSG,
  JOINING_SEED_CONTACT_FAILURE_KIND,
} from '../../src/bootstrap/node-joining-constants.js';
import {RejoinHintsPersistenceService} from '../../src/bootstrap/rejoin-hints.js';
import {resolveStartupJoinDecision} from '../../src/entrypoint-runtime-helpers.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {isRetryableControlPlaneError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {persistJoinSeedRejoinHints} from
  '../../src/entrypoint-runtime-join-decision.js';
import {
  resolveFailedJoinReattempt,
  resolveJoinedClusterId,
} from '../../src/entrypoint-runtime-join-startup-policy.js';
import {
  COLUMN,
  HTTP_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {initializeTestEnvironment} from './bootstrap-api-test-fixtures.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const SEED_NODE_ID = 'seed-node-1';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const JOINER_NODE_ADDRESS = 'ws://localhost:9090';
const CLUSTER_ID_X = '11111111-1111-4111-8111-111111111111';
const CLUSTER_ID_Y = '22222222-2222-4222-8222-222222222222';
const CONTACT_URL = 'http://seed-node-1:8080';
const OWNER_NOT_READY = Object.freeze({success: false, rows: [],
  error: 'authoritative_read_owner_unavailable'});
const CONTACT_CONFIG = Object.freeze({
  httpTimeoutMs: 1000,
  leadershipWaitTimeoutMs: 5000,
  leadershipWaitInitialDelayMs: 10,
  leadershipWaitMaxDelayMs: 20,
  leadershipWaitBackoffMultiplier: 2,
  leadershipWaitJitterRatio: 0,
});

// A seed whose cache can answer a join but never holds the cluster_id row.
function createSeedCache() {
  const rows = {
    [TABLES.NODES]: [{node_id: SEED_NODE_ID, node_address: CONTACT_URL}],
    [TABLES.PARTITIONS]: [{partition_id: 'p1', table_name: 'nodes',
      leader_node_id: SEED_NODE_ID}],
    [TABLES.SERVICES]: [
      {service_id: 'partition-leader', service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'p1', node_id: SEED_NODE_ID,
        address: `${SEED_NODE_ID}/partition/partition-leader`,
        raft_role: RAFT_ROLE.LEADER, status: SERVICE_STATUS.ACTIVE},
      {service_id: 'message-group-leader',
        service_type: SERVICE_TYPE.MESSAGE_GROUP, group_id: 'mg1',
        node_id: SEED_NODE_ID,
        address: `${SEED_NODE_ID}/message-group/message-group-leader`,
        raft_role: RAFT_ROLE.LEADER, status: SERVICE_STATUS.ACTIVE},
    ],
    [TABLES.TABLES]: [{table_id: 't1', table_name: 'nodes'}],
    [TABLES.MESSAGE_GROUPS]: [{group_id: 'mg1', leader_node_id: SEED_NODE_ID}],
  };
  return {
    get: () => null,
    getAll: (tableName) => rows[tableName] ?? [],
    filter: () => [],
    find: () => null,
    getReadyNodes: () => [],
  };
}

function identityRows(clusterId) {
  return {success: true, rows: [{[COLUMN.CONFIG_KEY]: CLUSTER_ID_CONFIG_KEY,
    [COLUMN.CONFIG_VALUE]: clusterId}]};
}

// A seed whose durable owner answers identity reads with owner.answer.
async function startSeed(t, owner) {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: CONTACT_URL,
    wsPort: 9091,
    systemTableCache: createSeedCache(),
    messageGroupServices: new Map(),
  });
  const reads = [];
  api.getControlPlaneSystemTableGateway().readAuthoritativeRows =
    async (tableName, sql, params) => {
      reads.push({tableName, params});
      return owner.answer;
    };
  await api.initialize(0, {listen: false});
  t.after(() => api.shutdown());
  return {api, reads};
}

// The joiner's HTTP POST (node-joining httpPost) over fastify inject: a
// non-2xx answer throws the same shaped error.
function injectHttpPost(api, exchanges, rewriteBody = (body) => body) {
  return async (_url, body) => {
    const response = await api.getFastify().inject({method: 'POST',
      url: '/bootstrap', payload: rewriteBody(body)});
    const json = JSON.parse(response.body);
    exchanges.push({statusCode: response.statusCode, body: json});
    if (response.statusCode >= HTTP_STATUS.BAD_REQUEST) {
      throw Object.assign(new Error(JOINING_ERROR_MSG.httpStatus(
        response.statusCode, response.body)), {statusCode: response.statusCode,
        responseBody: response.body, responseJson: json,
        retryAfterMs: json.retryAfterMs});
    }
    return json;
  };
}

// The real contact phase of a joiner whose held identity is read from its
// data directory, exactly as startJoinNode reads it.
async function createJoiner(dataDir, httpPost, config = CONTACT_CONFIG) {
  const heldClusterId = (await readLocalClusterIdentity(dataDir)).heldValue;
  const state = {bootstrapResponse: null};
  const phase = new ContactSeedPhase({
    nodeId: JOINER_NODE_ID,
    delegates: {
      getSeedNodeAddresses: () => [CONTACT_URL],
      getSeedNodeAddress: () => CONTACT_URL,
      getNodeAddress: () => JOINER_NODE_ADDRESS,
      getJoinStartupMode: () => STARTUP_JOIN_MODE.DURABLE_REJOIN,
      getExpectedClusterId: () => heldClusterId,
      getLogger: () => ({debug() {}, info() {}, warn() {}, error() {}}),
      getConfig: () => config,
      getNow: () => () => Date.now(),
      getSleep: () => async () => {},
      getRandom: () => () => 0,
      getHttpPostImpl: () => httpPost,
      setBootstrapResponse: (value) => {
        state.bootstrapResponse = value;
      },
      setSeedNodeId: () => {},
      getSeedNodeWsAddress: () => null,
      setSeedNodeWsAddress: () => {},
    },
  });
  return {phase, state, heldClusterId};
}

function persistHeldHints(dataDir, clusterId) {
  return persistJoinSeedRejoinHints({dataDir, nodeId: JOINER_NODE_ID,
    nodeAddress: JOINER_NODE_ADDRESS, peerAddresses: [CONTACT_URL], clusterId,
    bootIncarnation: TEST_BOOT_INCARNATION, logger: {warn() {}}});
}

async function withDataDir(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-join-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  return dataDir;
}

test('a joiner holding cluster X is refused by a server of cluster Y, ' +
  'refuses a response for Y, and still holds X', async (t) => {
  const dataDir = await withDataDir(t);
  await persistHeldHints(dataDir, CLUSTER_ID_X);
  const {api} = await startSeed(t, {answer: identityRows(CLUSTER_ID_Y)});

  // The server fences: a request naming X is refused 409 (terminal).
  const fenced = [];
  const refused = await createJoiner(dataDir, injectHttpPost(api, fenced));
  t.equal(refused.heldClusterId, CLUSTER_ID_X);
  await t.rejects(refused.phase.phaseContactSeed(), /HTTP 409/u);
  t.equal(fenced.length, 1, 'a positive mismatch is not retried');
  t.match(fenced[0], {statusCode: HTTP_STATUS.CONFLICT, body: {
    error: BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH,
    code: JOIN_IDENTITY_REFUSAL_CODE.REQUEST_MISMATCH,
    expected: CLUSTER_ID_X, actual: CLUSTER_ID_Y}});
  t.equal(refused.state.bootstrapResponse, null, 'nothing is adopted');

  // The joiner fences too: a response for Y (here from a server that was
  // not told the expected id) is a typed terminal refusal naming both ids.
  const unfenced = [];
  const joiner = await createJoiner(dataDir, injectHttpPost(api, unfenced,
    ({expectedClusterId: _dropped, ...body}) => body));
  await t.rejects(joiner.phase.phaseContactSeed(), {
    code: JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_MISMATCH,
    state: JOIN_RESPONSE_IDENTITY_STATE.MISMATCH,
    heldClusterId: CLUSTER_ID_X,
    responseClusterId: CLUSTER_ID_Y,
    retryable: false,
  });
  t.equal(unfenced.length, 1, 'the refusal is terminal, never retried');
  t.equal(unfenced[0].body.clusterId, CLUSTER_ID_Y);
  t.equal(joiner.state.bootstrapResponse, null, 'the response is not adopted');
  t.throws(() => resolveJoinedClusterId(
    {bootstrapResponse: unfenced[0].body}, CLUSTER_ID_X),
  {code: JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_MISMATCH},
  'the post-join persistence site applies the same acceptance');
  t.match(await readLocalClusterIdentity(dataDir), {heldValue: CLUSTER_ID_X},
    'the persisted id is still X');

  // The typed refusal reaches the startup boundary with its code.
  await t.rejects(resolveFailedJoinReattempt({
    bootstrapAPI: {shutdown: async () => {}},
    nodeJoiningService: {cleanup: async () => {}},
    dataDir,
    joinAttempt: 0,
    joinResult: {success: false, retryable: false,
      code: JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_MISMATCH, error: 'refused'},
    logger: {error() {}, warn() {}},
    nodeId: JOINER_NODE_ID,
    reattemptPolicy: {maxAttempts: 3},
  }), {code: JOIN_IDENTITY_REFUSAL_CODE.RESPONSE_MISMATCH});
});

test('a server that cannot read its identity from the durable owner answers ' +
  'typed retryable unavailability, then admits the same join once it can',
async (t) => {
  const dataDir = await withDataDir(t);
  await persistHeldHints(dataDir, CLUSTER_ID_X);
  const owner = {answer: OWNER_NOT_READY};
  const {api, reads} = await startSeed(t, owner);
  const exchanges = [];
  const joiner = await createJoiner(dataDir, injectHttpPost(api, exchanges));

  // The durable owner cannot answer (e.g. the seed before its CONFIG group
  // serves reads): the contact phase retries within its bound, then
  // surfaces a retryable error the join's resume loop re-runs.
  const deferred = await joiner.phase.phaseContactSeed().then(
    () => null, (error) => error);
  t.ok(deferred, 'no join is admitted while the identity is unknown');
  t.equal(isRetryableControlPlaneError(deferred), true,
    'the join resumes on this error (existing retry path)');
  t.ok(exchanges.length >= 1);
  for (const exchange of exchanges) {
    t.equal(exchange.statusCode, HTTP_STATUS.SERVICE_UNAVAILABLE);
    t.ok(exchange.body.reasons.includes(
      BOOTSTRAP_API_PROBE_REASON.CLUSTER_IDENTITY_UNAVAILABLE),
    'unknown identity is a typed retryable refusal, never an admit');
    t.equal(exchange.body.identityUnavailableReason, 'read_failed');
  }
  t.equal(joiner.state.bootstrapResponse, null);

  owner.answer = identityRows(CLUSTER_ID_X);
  exchanges.length = 0;
  await joiner.phase.phaseContactSeed();
  t.equal(exchanges.length, 1);
  t.equal(exchanges[0].statusCode, 200, 'the resumed join is admitted');
  t.equal(joiner.state.bootstrapResponse.clusterId, CLUSTER_ID_X,
    'the admitted response carries the durable identity');
  t.ok(reads.every((read) => read.tableName === TABLES.CONFIG &&
    read.params.includes(CLUSTER_ID_CONFIG_KEY)),
  'every identity answer came from the durable CONFIG owner');
});

test('a fresh node with no persisted identity joins and persists the ' +
  'server\'s id', async (t) => {
  const dataDir = await withDataDir(t);
  const owner = {answer: OWNER_NOT_READY};
  const {api} = await startSeed(t, owner);
  const exchanges = [];
  const joiner = await createJoiner(dataDir, injectHttpPost(api, exchanges));
  t.equal(joiner.heldClusterId, null, 'a fresh node holds no identity');

  await t.rejects(joiner.phase.phaseContactSeed(), {deferRetry: true},
    'a first join is also answered only once the server knows its id');
  t.ok(exchanges[0].body.reasons.includes(
    BOOTSTRAP_API_PROBE_REASON.CLUSTER_IDENTITY_UNAVAILABLE));

  owner.answer = identityRows(CLUSTER_ID_Y);
  await joiner.phase.phaseContactSeed();
  const joinedClusterId = resolveJoinedClusterId(joiner.state, null);
  t.equal(joinedClusterId, CLUSTER_ID_Y, 'the first join adopts the id');
  await persistHeldHints(dataDir, joinedClusterId);
  t.match(await readLocalClusterIdentity(dataDir), {heldValue: CLUSTER_ID_Y});
});

// A former seed after formation spread its replicas: its records hold the
// cluster id and its peers, but it hosts no CONFIG replica (no second local
// record to compare with), so it asks the cluster through the join gate.
const PEER_ADDRESS = 'peer-node-2:8080';
const QUICK_CONTACT_CONFIG = Object.freeze({...CONTACT_CONFIG,
  httpTimeoutMs: 50, leadershipWaitTimeoutMs: 50});

async function persistFormerSeedRecords(dataDir) {
  const nodeRows = [
    {[COLUMN.NODE_ID]: JOINER_NODE_ID, [COLUMN.NODE_ADDRESS]: JOINER_NODE_ADDRESS},
    {[COLUMN.NODE_ID]: 'node-peer-2', [COLUMN.NODE_ADDRESS]: PEER_ADDRESS},
  ];
  const cache = {
    getAll: (tableName) => tableName === TABLES.NODES ? nodeRows : [],
    get: (tableName, key) => tableName === TABLES.CONFIG &&
      key === CLUSTER_ID_CONFIG_KEY ? {[COLUMN.CONFIG_VALUE]: CLUSTER_ID_X} : null,
  };
  await new RejoinHintsPersistenceService({bootIncarnation: TEST_BOOT_INCARNATION,
    dataDir, nodeId: JOINER_NODE_ID, nodeAddress: JOINER_NODE_ADDRESS,
    nodeRole: 'seed', getSystemTableCache: () => cache, logger: {warn() {}},
  }).persistNow();
}

// The production startup decision (entrypoint-runtime-helpers).
function formerSeedStartupDecision(dataDir, peerReachable) {
  const values = new Map([[CONFIG_KEY.NODE_ID, JOINER_NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, 'localhost'],
    [CONFIG_KEY.NODE_REST_API_PORT, 9090], [CONFIG_KEY.NODE_WS_PORT, 9092]]);
  return resolveStartupJoinDecision({cliArgs: {}, env: {},
    config: {get: (key) => values.get(key) ?? null},
    dataDirectoryManager: {getDataDir: () => dataDir}, logger: {info() {}},
    probePeerAddress: async (address) => address === PEER_ADDRESS && peerReachable});
}

test('a former seed without a local CONFIG replica rejoins through a ' +
  'reachable peer presenting its held id, and is admitted by its cluster',
async (t) => {
  const dataDir = await withDataDir(t);
  await persistFormerSeedRecords(dataDir);
  const decision = await formerSeedStartupDecision(dataDir, true);
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN,
    'it rejoins as a member; it does not fail and does not serve as authority');
  t.equal(decision.seedNodeAddress, PEER_ADDRESS);

  const {api} = await startSeed(t, {answer: identityRows(CLUSTER_ID_X)});
  const exchanges = [];
  const joiner = await createJoiner(dataDir, injectHttpPost(api, exchanges));
  t.equal(joiner.heldClusterId, CLUSTER_ID_X, 'it presents the id it holds');
  await joiner.phase.phaseContactSeed();
  t.equal(exchanges[0].statusCode, 200);
  t.equal(joiner.state.bootstrapResponse.clusterId, CLUSTER_ID_X,
    'the cluster confirmed the identity');
});

test('the same former seed is refused terminally by another cluster and ' +
  'keeps its id', async (t) => {
  const dataDir = await withDataDir(t);
  await persistFormerSeedRecords(dataDir);
  const decision = await formerSeedStartupDecision(dataDir, true);
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);

  const {api} = await startSeed(t, {answer: identityRows(CLUSTER_ID_Y)});
  const exchanges = [];
  const joiner = await createJoiner(dataDir, injectHttpPost(api, exchanges));
  await t.rejects(joiner.phase.phaseContactSeed(), /HTTP 409/u);
  t.equal(exchanges.length, 1, 'the refusal is not retried');
  t.equal(exchanges[0].body.code, JOIN_IDENTITY_REFUSAL_CODE.REQUEST_MISMATCH);
  t.equal(joiner.state.bootstrapResponse, null);
  t.match(await readLocalClusterIdentity(dataDir), {heldValue: CLUSTER_ID_X});
});

test('the same former seed with no reachable peer serves nothing, gets the ' +
  'typed retryable contact refusal, and proceeds once a peer is reachable',
async (t) => {
  const dataDir = await withDataDir(t);
  await persistFormerSeedRecords(dataDir);
  const decision = await formerSeedStartupDecision(dataDir, false);
  t.equal(decision.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN,
    'no peer answered: still a member rejoin, never a seed or a failure');
  t.equal(decision.seedNodeAddress, PEER_ADDRESS);

  const {api} = await startSeed(t, {answer: identityRows(CLUSTER_ID_X)});
  const peer = {reachable: false};
  const exchanges = [];
  const reachablePost = injectHttpPost(api, exchanges);
  const joiner = await createJoiner(dataDir, async (url, body) => {
    if (!peer.reachable) {
      throw Object.assign(new Error('connect ECONNREFUSED'),
        {code: 'ECONNREFUSED'});
    }
    return reachablePost(url, body);
  }, QUICK_CONTACT_CONFIG);

  const unavailable = await joiner.phase.phaseContactSeed().then(
    () => null, (error) => error);
  t.equal(unavailable?.code,
    JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE);
  t.equal(isRetryableControlPlaneError(unavailable), true,
    'typed retryable: the join resumes on it');
  t.equal(joiner.state.bootstrapResponse, null);

  peer.reachable = true;
  await joiner.phase.phaseContactSeed();
  t.equal(joiner.state.bootstrapResponse.clusterId, CLUSTER_ID_X,
    'it proceeds once a peer answers and confirms the identity');
});
