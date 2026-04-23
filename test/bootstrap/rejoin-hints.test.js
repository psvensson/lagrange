import Database from 'better-sqlite3';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  persistBootstrapRejoinHints,
  readRejoinHints,
  RejoinHintsPersistenceService,
  resolveAutoRejoinStartupDecision,
  resolveAutoRejoinPeerAddress,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  REJOIN_HINTS_FILENAME,
  STARTUP_JOIN_MODE,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const DRIFTED_LOCAL_NODE_ADDRESS = 'seed-node-restarted:8080';
const PEER_NODE_ADDRESS_A = 'peer-a:8080';
const PEER_NODE_ADDRESS_B = 'peer-b:8080';
const CLUSTER_INCARNATION_FENCE_STATE_CURRENT = 'current';
const CLUSTER_INCARNATION_FENCE_STATE_IDENTITY_MISMATCH =
  'identity_mismatch';
const CLUSTER_INCARNATION_LOCAL_IDENTITY_MATCHED = 'matched';
const CLUSTER_INCARNATION_LOCAL_IDENTITY_MISMATCHED = 'mismatched';
const CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT = 'present';
const CLUSTER_INCARNATION_PEER_PROOF_RECOVERED = 'recovered';
const CLUSTER_INCARNATION_PEER_PROOF_NOT_REQUIRED = 'not_required';

function createSystemTableCache(nodeRows = []) {
  return {
    getAll(tableName) {
      if (tableName !== TABLES.NODES) {
        return [];
      }
      return nodeRows;
    },
  };
}

async function writeDurableNodesTableSnapshot(dataDir, rows = []) {
  const partitionDir = join(dataDir, 'partitions', 'nodes-p1');
  await mkdir(partitionDir, {recursive: true});
  const dbPath = join(partitionDir, 'nodes-p1-r1.db');
  const database = new Database(dbPath);
  try {
    database.exec(
      'CREATE TABLE nodes (' +
      'node_id TEXT PRIMARY KEY, ' +
      'node_address TEXT NOT NULL' +
      ')',
    );
    const insertRow = database.prepare(
      'INSERT INTO nodes (node_id, node_address) VALUES (?, ?)',
    );
    const insertMany = database.transaction((nodeRows) => {
      for (const row of nodeRows) {
        insertRow.run(row.node_id, row.node_address);
      }
    });
    insertMany(rows);
  } finally {
    database.close();
  }
}

test('buildRejoinHintsSnapshot records non-self peer addresses from nodes table',
  async (t) => {
    const snapshot = buildRejoinHintsSnapshot({
      systemTableCache: createSystemTableCache([
        {
          [COLUMN.NODE_ID]: LOCAL_NODE_ID,
          [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-a',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-b',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_B,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-a-duplicate',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
        },
      ]),
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      now: () => 1234,
    });

    t.same(snapshot, {
      localNodeId: LOCAL_NODE_ID,
      localNodeAddress: LOCAL_NODE_ADDRESS,
      localNodeRole: 'seed',
      clusterNodeCount: 4,
      peerAddresses: [PEER_NODE_ADDRESS_A, PEER_NODE_ADDRESS_B],
      requiresPeerRejoin: true,
      updatedAt: 1234,
    });
  });

test('persistBootstrapRejoinHints seeds durable rejoin from the chosen peer',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const bootstrapSnapshot = buildBootstrapRejoinHintsSnapshot({
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [PEER_NODE_ADDRESS_A],
      clusterNodeCount: 2,
      now: () => 2345,
    });

    t.same(bootstrapSnapshot, {
      localNodeId: LOCAL_NODE_ID,
      localNodeAddress: LOCAL_NODE_ADDRESS,
      localNodeRole: 'joiner',
      clusterNodeCount: 2,
      peerAddresses: [PEER_NODE_ADDRESS_A],
      requiresPeerRejoin: true,
      updatedAt: 2345,
    });

    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [PEER_NODE_ADDRESS_A],
      clusterNodeCount: 2,
      now: () => 2345,
    });

    const persistedHints = await readRejoinHints(dataDir);
    t.same(persistedHints, bootstrapSnapshot);

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });

    t.match(decision, {
      state: 'join_recovered_peer',
      mode: 'join',
      peerAddressState: 'selected',
      peerAddress: PEER_NODE_ADDRESS_A,
      source: 'rejoin_hints',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: {
        state: CLUSTER_INCARNATION_FENCE_STATE_CURRENT,
        allowed: true,
        localIdentityState: CLUSTER_INCARNATION_LOCAL_IDENTITY_MATCHED,
        durableMembershipState: CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT,
        peerProofState: CLUSTER_INCARNATION_PEER_PROOF_RECOVERED,
      },
    });
  });

test('resolveAutoRejoinPeerAddress prefers a reachable persisted peer', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const persistence = new RejoinHintsPersistenceService({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'joiner',
    getSystemTableCache: () => createSystemTableCache([
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-b',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_B,
      },
    ]),
    now: () => 4567,
    logger: {warn() {}, debug() {}},
  });

  await persistence.persistNow();

  const selectedPeer = await resolveAutoRejoinPeerAddress({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async (address) => address === PEER_NODE_ADDRESS_B,
  });

  t.equal(
    selectedPeer,
    PEER_NODE_ADDRESS_B,
    'startup recovery should choose a reachable peer over an unreachable one',
  );
});

test('resolveAutoRejoinPeerAddress rejects persisted hints from another node', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const persistence = new RejoinHintsPersistenceService({
    dataDir,
    nodeId: 'different-node',
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'joiner',
    getSystemTableCache: () => createSystemTableCache([
      {
        [COLUMN.NODE_ID]: 'different-node',
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ]),
    now: () => 7890,
    logger: {warn() {}, debug() {}},
  });

  await persistence.persistNow();

  const selectedPeer = await resolveAutoRejoinPeerAddress({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => true,
  });

  t.equal(
    selectedPeer,
    null,
    'startup recovery must ignore hints persisted for a different node identity',
  );
});

test('resolveAutoRejoinStartupDecision accepts address drift when node ID matches',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const persistence = new RejoinHintsPersistenceService({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      getSystemTableCache: () => createSystemTableCache([
        {
          [COLUMN.NODE_ID]: LOCAL_NODE_ID,
          [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-a',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
        },
      ]),
      logger: {warn() {}, debug() {}},
    });

    await persistence.persistNow();

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: DRIFTED_LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });

    t.match(decision, {
      state: 'join_recovered_peer',
      mode: 'join',
      peerAddressState: 'selected',
      peerAddress: PEER_NODE_ADDRESS_A,
      source: 'rejoin_hints',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: {
        state: CLUSTER_INCARNATION_FENCE_STATE_CURRENT,
        allowed: true,
        localIdentityState: CLUSTER_INCARNATION_LOCAL_IDENTITY_MATCHED,
        durableMembershipState: CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT,
        peerProofState: CLUSTER_INCARNATION_PEER_PROOF_RECOVERED,
      },
    });
  });

test('resolveAutoRejoinStartupDecision keeps persisted seed role in seed mode',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const persistence = new RejoinHintsPersistenceService({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      getSystemTableCache: () => createSystemTableCache([
        {
          [COLUMN.NODE_ID]: LOCAL_NODE_ID,
          [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-a',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
        },
      ]),
      logger: {warn() {}, debug() {}},
    });

    await persistence.persistNow();

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => true,
    });

    t.match(decision, {
      state: 'durable_seed',
      mode: 'seed',
      peerAddressState: 'unavailable',
      peerAddress: null,
      source: 'rejoin_hints',
      startupMode: STARTUP_JOIN_MODE.SEED,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: {
        state: CLUSTER_INCARNATION_FENCE_STATE_CURRENT,
        allowed: true,
        localIdentityState: CLUSTER_INCARNATION_LOCAL_IDENTITY_MATCHED,
        durableMembershipState: CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT,
        peerProofState: CLUSTER_INCARNATION_PEER_PROOF_NOT_REQUIRED,
      },
    });
  });

test('resolveAutoRejoinStartupDecision recovers peers from durable local nodes metadata',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    await writeDurableNodesTableSnapshot(dataDir, [
      {
        node_id: LOCAL_NODE_ID,
        node_address: LOCAL_NODE_ADDRESS,
      },
      {
        node_id: 'node-peer-a',
        node_address: PEER_NODE_ADDRESS_A,
      },
      {
        node_id: 'node-peer-b',
        node_address: PEER_NODE_ADDRESS_B,
      },
    ]);

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async (address) => address === PEER_NODE_ADDRESS_B,
    });

    t.match(decision, {
      state: 'join_probed_peer',
      mode: 'join',
      peerAddressState: 'selected',
      peerAddress: PEER_NODE_ADDRESS_B,
      source: 'durable_nodes_table',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      durableStateDetected: true,
      identityMismatch: false,
      clusterIncarnationFence: {
        state: CLUSTER_INCARNATION_FENCE_STATE_CURRENT,
        allowed: true,
        localIdentityState: CLUSTER_INCARNATION_LOCAL_IDENTITY_MATCHED,
        durableMembershipState: CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT,
        peerProofState: CLUSTER_INCARNATION_PEER_PROOF_RECOVERED,
      },
    });
  });

test('resolveAutoRejoinStartupDecision fails closed on mismatched durable node identity',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    await writeDurableNodesTableSnapshot(dataDir, [
      {
        node_id: 'other-node',
        node_address: 'other-node:8080',
      },
      {
        node_id: 'node-peer-a',
        node_address: PEER_NODE_ADDRESS_A,
      },
    ]);

    const decision = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => false,
    });

    t.equal(decision.mode, 'fail');
    t.equal(decision.source, 'durable_nodes_table');
    t.equal(
      decision.startupMode,
      STARTUP_JOIN_MODE.DURABLE_REJOIN,
      'mismatched durable state should still classify startup as durable rejoin',
    );
    t.equal(
      decision.identityMismatch,
      true,
      'mismatched durable node identity should be explicit in startup diagnostics',
    );
    t.match(decision.clusterIncarnationFence, {
      state: CLUSTER_INCARNATION_FENCE_STATE_IDENTITY_MISMATCH,
      allowed: false,
      localIdentityState: CLUSTER_INCARNATION_LOCAL_IDENTITY_MISMATCHED,
      durableMembershipState: CLUSTER_INCARNATION_DURABLE_MEMBERSHIP_PRESENT,
    });
    t.match(
      decision.error,
      /different node identity/,
    );
  });

test('RejoinHintsPersistenceService writes the canonical hints file', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  const persistence = new RejoinHintsPersistenceService({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    nodeRole: 'seed',
    getSystemTableCache: () => createSystemTableCache([
      {
        [COLUMN.NODE_ID]: LOCAL_NODE_ID,
        [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
      },
      {
        [COLUMN.NODE_ID]: 'node-peer-a',
        [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
      },
    ]),
    now: () => 9999,
    logger: {warn() {}, debug() {}},
  });

  await persistence.persistNow();

  const persistedHints = await readRejoinHints(dataDir);
  t.same(persistedHints, {
    localNodeId: LOCAL_NODE_ID,
    localNodeAddress: LOCAL_NODE_ADDRESS,
    localNodeRole: 'seed',
    clusterNodeCount: 2,
    peerAddresses: [PEER_NODE_ADDRESS_A],
    requiresPeerRejoin: true,
    updatedAt: 9999,
  });

  const rawPersistedHints = JSON.parse(
    await readFile(join(dataDir, REJOIN_HINTS_FILENAME), 'utf8'),
  );
  t.same(rawPersistedHints, persistedHints);
});

test('RejoinHintsPersistenceService serializes overlapping writes without warnings',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'rejoin-hints-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));

    const warnings = [];
    let nowValue = 1000;
    const persistence = new RejoinHintsPersistenceService({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      getSystemTableCache: () => createSystemTableCache([
        {
          [COLUMN.NODE_ID]: LOCAL_NODE_ID,
          [COLUMN.NODE_ADDRESS]: LOCAL_NODE_ADDRESS,
        },
        {
          [COLUMN.NODE_ID]: 'node-peer-a',
          [COLUMN.NODE_ADDRESS]: PEER_NODE_ADDRESS_A,
        },
      ]),
      now: () => ++nowValue,
      logger: {
        warn(message, metadata) {
          warnings.push({message, metadata});
        },
        debug() {},
      },
    });

    await Promise.all([
      persistence.persistNow(),
      persistence.persistNow(),
      persistence.persistNow(),
      persistence.persistNow(),
    ]);

    t.equal(warnings.length, 0, 'overlapping persists should not emit rename warnings');
    const persistedHints = await readRejoinHints(dataDir);
    t.equal(
      persistedHints?.updatedAt,
      nowValue,
      'the final persisted snapshot should reflect the latest queued write',
    );
  });
