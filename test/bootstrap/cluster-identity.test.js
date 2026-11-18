import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  AUTO_REJOIN_DECISION_STATE,
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  persistBootstrapRejoinHints,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  LOCAL_IDENTITY_MISMATCH_REASON,
  LOCAL_IDENTITY_UNKNOWN_REASON,
  readLocalClusterIdentity,
} from '../../src/bootstrap/local-cluster-identity.js';
import {resolveStartupJoinDecision} from
  '../../src/entrypoint-runtime-helpers.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {writeDurableConfigReplica} from
  '../test-helpers/durable-config-replica-fixture.js';
import {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const CLUSTER_ID_A = '11111111-1111-4111-8111-111111111111';
const CLUSTER_ID_B = '22222222-2222-4222-8222-222222222222';
const OTHER_NODE_ADDRESS = 'other-node:8080';
const SEED_ADDRESS = 'seed-node:9090';

async function withDataDir(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  return dataDir;
}

// The hints a joined node writes (the join-time hints writer).
function persistJoinerHints(dataDir, clusterId) {
  return persistBootstrapRejoinHints({
    bootIncarnation: TEST_BOOT_INCARNATION,
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'joiner',
    peerAddresses: [OTHER_NODE_ADDRESS],
    clusterId,
  });
}

// The production startup decision's inputs (entrypoint-runtime-helpers).
function startupDecisionOptions(dataDir, env = {}) {
  const values = new Map([[CONFIG_KEY.NODE_ID, LOCAL_NODE_ID],
    [CONFIG_KEY.NODE_ADDRESS, 'node-local'],
    [CONFIG_KEY.NODE_REST_API_PORT, 8080], [CONFIG_KEY.NODE_WS_PORT, 8082]]);
  return {cliArgs: {}, env, config: {get: (key) => values.get(key) ?? null},
    dataDirectoryManager: {getDataDir: () => dataDir},
    logger: {info() {}}, probePeerAddress: async () => false};
}

function createCache({nodeRows = [], clusterId = null} = {}) {
  return {
    getAll(tableName) {
      return tableName === TABLES.NODES ? nodeRows : [];
    },
    get(tableName, key) {
      if (tableName !== TABLES.CONFIG || key !== CLUSTER_ID_CONFIG_KEY) {
        return undefined;
      }
      return clusterId === null ?
        undefined :
        {[COLUMN.CONFIG_VALUE]: clusterId};
    },
  };
}

test('classifyClusterIdMatch is an explicit three-valued comparison',
  async (t) => {
    t.equal(
      classifyClusterIdMatch(CLUSTER_ID_A, CLUSTER_ID_A),
      CLUSTER_ID_MATCH_STATE.MATCH,
      'identical ids match',
    );
    t.equal(
      classifyClusterIdMatch(CLUSTER_ID_A, CLUSTER_ID_B),
      CLUSTER_ID_MATCH_STATE.MISMATCH,
      'different ids mismatch',
    );
    t.equal(
      classifyClusterIdMatch(null, CLUSTER_ID_A),
      CLUSTER_ID_MATCH_STATE.UNKNOWN,
      'absent expected id is unknown, never a silent match',
    );
    t.equal(
      classifyClusterIdMatch(CLUSTER_ID_A, undefined),
      CLUSTER_ID_MATCH_STATE.UNKNOWN,
      'absent actual id is unknown (pre-identity source)',
    );
  });

test('the hints persistence latches the cluster identity and never erases it',
  async (t) => {
    const dataDir = await withDataDir(t);
    let cache = createCache({clusterId: null});
    const persistence = new RejoinHintsPersistenceService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      getSystemTableCache: () => cache,
      now: () => 1234,
      logger: {warn() {}},
    });
    t.equal(Object.hasOwn(await persistence.persistNow(), 'clusterId'), false,
      'no identity is known yet: the field stays off');
    cache = createCache({clusterId: CLUSTER_ID_A});
    t.equal((await persistence.persistNow()).clusterId, CLUSTER_ID_A,
      'the CONFIG row, once the cache holds it, is recorded');
    cache = createCache({clusterId: null});
    t.equal((await persistence.persistNow()).clusterId, CLUSTER_ID_A,
      'a later write without the row keeps the identity');

    // A restarted node's first writes, before its cache holds the row, keep
    // the identity its record already carries.
    const restarted = new RejoinHintsPersistenceService({
      bootIncarnation: TEST_BOOT_INCARNATION,
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      getSystemTableCache: () => createCache({clusterId: null}),
      logger: {warn() {}},
    });
    t.equal((await restarted.persistNow()).clusterId, CLUSTER_ID_A);
    t.equal(buildRejoinHintsSnapshot({bootIncarnation: TEST_BOOT_INCARNATION,
      systemTableCache: createCache({clusterId: CLUSTER_ID_B}),
      nodeId: LOCAL_NODE_ID, now: () => 1}).clusterId, undefined,
    'the snapshot builder records only the identity it is given');
  });

test('buildBootstrapRejoinHintsSnapshot carries an explicit cluster identity',
  async (t) => {
    const snapshot = buildBootstrapRejoinHintsSnapshot({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [OTHER_NODE_ADDRESS],
      clusterId: CLUSTER_ID_A,
      now: () => 1234,
    });
    t.equal(
      snapshot.clusterId,
      CLUSTER_ID_A,
      'join-time hints record the cluster the node joined',
    );
  });

test('the held cluster identity is read from both durable records',
  async (t) => {
    const fresh = await withDataDir(t);
    t.match(await readLocalClusterIdentity(fresh), {
      state: CLUSTER_ID_MATCH_STATE.UNKNOWN,
      reason: LOCAL_IDENTITY_UNKNOWN_REASON.HINTS_IDENTITY_ABSENT,
      heldValue: null,
    }, 'a fresh data directory holds no identity');

    const hintsOnly = await withDataDir(t);
    await persistJoinerHints(hintsOnly, CLUSTER_ID_A);
    t.match(await readLocalClusterIdentity(hintsOnly), {
      state: CLUSTER_ID_MATCH_STATE.UNKNOWN,
      reason: LOCAL_IDENTITY_UNKNOWN_REASON.NO_LOCAL_CONFIG_REPLICA,
      recordedValue: CLUSTER_ID_A,
      durableValue: null,
      heldValue: CLUSTER_ID_A,
    }, 'a node without a CONFIG replica holds its hints record, unconfirmed');

    const durableOnly = await withDataDir(t);
    await writeDurableConfigReplica(durableOnly, {clusterId: CLUSTER_ID_A});
    t.match(await readLocalClusterIdentity(durableOnly), {
      state: CLUSTER_ID_MATCH_STATE.UNKNOWN,
      reason: LOCAL_IDENTITY_UNKNOWN_REASON.HINTS_IDENTITY_ABSENT,
      durableValue: CLUSTER_ID_A,
      heldValue: CLUSTER_ID_A,
    }, 'the durable CONFIG row is held even without a hints record');

    const rowPending = await withDataDir(t);
    await persistJoinerHints(rowPending, CLUSTER_ID_A);
    await writeDurableConfigReplica(rowPending, {clusterId: null});
    t.match(await readLocalClusterIdentity(rowPending), {
      state: CLUSTER_ID_MATCH_STATE.UNKNOWN,
      reason: LOCAL_IDENTITY_UNKNOWN_REASON.DURABLE_ROW_ABSENT,
    }, 'a replica without the row (not yet applied) is UNKNOWN, never MATCH');

    const both = await withDataDir(t);
    await persistJoinerHints(both, CLUSTER_ID_A);
    await writeDurableConfigReplica(both, {clusterId: CLUSTER_ID_A});
    t.match(await readLocalClusterIdentity(both), {
      state: CLUSTER_ID_MATCH_STATE.MATCH,
      heldValue: CLUSTER_ID_A,
    }, 'MATCH needs two independent records that agree');

    const disagreeing = await withDataDir(t);
    await persistJoinerHints(disagreeing, CLUSTER_ID_A);
    await writeDurableConfigReplica(disagreeing, {clusterId: CLUSTER_ID_A});
    await writeDurableConfigReplica(disagreeing,
      {clusterId: CLUSTER_ID_B, replicaIndex: 1});
    t.match(await readLocalClusterIdentity(disagreeing), {
      state: CLUSTER_ID_MATCH_STATE.MISMATCH,
      reason: LOCAL_IDENTITY_MISMATCH_REASON.DURABLE_REPLICAS_DISAGREE,
      heldValue: null,
    }, 'local CONFIG replicas carrying two identities are a mismatch');
  });

test('startup refuses a data directory whose hints differ from its durable ' +
  'CONFIG row with the typed MISMATCH', async (t) => {
  const dataDir = await withDataDir(t);
  // A node that joined cluster A (its hints say so) over a data directory
  // whose CONFIG replica belongs to cluster B.
  await persistJoinerHints(dataDir, CLUSTER_ID_A);
  await writeDurableConfigReplica(dataDir, {clusterId: CLUSTER_ID_B});

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => true,
  });
  t.equal(decision.state, AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH,
    'the two independent records disagree');
  t.equal(decision.mode, 'fail', 'the decision is terminal');
  t.equal(decision.clusterIdentity.reason,
    LOCAL_IDENTITY_MISMATCH_REASON.HINTS_DIFFER_FROM_DURABLE);
  t.ok(decision.error.includes(CLUSTER_ID_A) &&
    decision.error.includes(CLUSTER_ID_B), 'the refusal names both ids');

  for (const env of [{}, {[ENTRYPOINT_ENV.SEED_NODE_ADDRESS]: SEED_ADDRESS}]) {
    await t.rejects(resolveStartupJoinDecision(startupDecisionOptions(dataDir, env)), {
      code: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
      reason: MEMBERSHIP_OWNER_REASON.CLUSTER_ID_MISMATCH,
    }, 'the runtime startup decision refuses typed, with and without an ' +
      'explicit seed');
  }
});

test('startup admits a confirmed identity and a node with no CONFIG replica',
  async (t) => {
    const confirmed = await withDataDir(t);
    await persistJoinerHints(confirmed, CLUSTER_ID_A);
    await writeDurableConfigReplica(confirmed, {clusterId: CLUSTER_ID_A});
    const matched = await resolveAutoRejoinStartupDecision({
      dataDir: confirmed,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => true,
    });
    t.equal(matched.mode, 'join', 'a confirmed identity rejoins normally');

    // No local CONFIG replica: the startup has no second record, so it does
    // not refuse; the cluster's answer at join is this node's check.
    const noReplica = await withDataDir(t);
    await persistJoinerHints(noReplica, CLUSTER_ID_A);
    const unknown = await resolveAutoRejoinStartupDecision({
      dataDir: noReplica,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => true,
    });
    t.equal(unknown.mode, 'join');
    t.equal(unknown.startupMode, STARTUP_JOIN_MODE.DURABLE_REJOIN);
  });
