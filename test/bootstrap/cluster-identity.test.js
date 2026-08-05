import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  AUTO_REJOIN_DECISION_STATE,
  buildBootstrapRejoinHintsSnapshot,
  buildRejoinHintsSnapshot,
  persistBootstrapRejoinHints,
  readPersistedLocalClusterId,
  resolveAutoRejoinStartupDecision,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  CLUSTER_ID_CONFIG_KEY,
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
} from '../../src/bootstrap/cluster-identity-constants.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const CLUSTER_ID_A = '11111111-1111-4111-8111-111111111111';
const CLUSTER_ID_B = '22222222-2222-4222-8222-222222222222';
const OTHER_NODE_ADDRESS = 'other-node:8080';

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

test('buildRejoinHintsSnapshot carries the CONFIG-row cluster identity',
  async (t) => {
    const snapshot = buildRejoinHintsSnapshot({
      systemTableCache: createCache({clusterId: CLUSTER_ID_A}),
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      now: () => 1234,
    });
    t.equal(
      snapshot.clusterId,
      CLUSTER_ID_A,
      'hints snapshot reads the durable identity from the CONFIG row',
    );

    const preIdentity = buildRejoinHintsSnapshot({
      systemTableCache: createCache({clusterId: null}),
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'seed',
      now: () => 1234,
    });
    t.equal(
      Object.prototype.hasOwnProperty.call(preIdentity, 'clusterId'),
      false,
      'absent CONFIG row leaves the field off (pre-identity compatible)',
    );
  });

test('buildBootstrapRejoinHintsSnapshot carries an explicit cluster identity',
  async (t) => {
    const snapshot = buildBootstrapRejoinHintsSnapshot({
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

test('persisted hints cluster identity survives a restart read', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-'));
  try {
    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [OTHER_NODE_ADDRESS],
      clusterId: CLUSTER_ID_A,
    });
    t.equal(
      await readPersistedLocalClusterId(dataDir),
      CLUSTER_ID_A,
      'the persisted identity is readable before any hydration',
    );
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

test('readPersistedLocalClusterId returns null without usable hints',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-'));
    try {
      t.equal(
        await readPersistedLocalClusterId(dataDir),
        null,
        'a fresh data directory has no identity to restore',
      );
      t.equal(
        await readPersistedLocalClusterId(''),
        null,
        'a blank data directory cannot resolve a hints path',
      );
    } finally {
      await rm(dataDir, {recursive: true, force: true});
    }
  });

test('auto-rejoin fails closed when the hints cluster identity mismatches',
  async (t) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-'));
    try {
      await persistBootstrapRejoinHints({
        dataDir,
        nodeId: LOCAL_NODE_ID,
        nodeAddress: LOCAL_NODE_ADDRESS,
        nodeRole: 'joiner',
        peerAddresses: [OTHER_NODE_ADDRESS],
        clusterId: CLUSTER_ID_A,
      });
      const decision = await resolveAutoRejoinStartupDecision({
        dataDir,
        nodeId: LOCAL_NODE_ID,
        nodeAddress: LOCAL_NODE_ADDRESS,
        expectedClusterId: CLUSTER_ID_B,
        probePeerAddress: async () => false,
      });
      t.equal(
        decision.state,
        AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH,
        'a data directory from another cluster blocks startup',
      );
      t.equal(decision.mode, 'fail', 'the decision is terminal');
      t.equal(
        decision.membershipOwnerOutcome.outcomeType,
        MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
        'the membership owner records a blocked startup',
      );
      t.equal(
        decision.membershipOwnerOutcome.reasonCode,
        MEMBERSHIP_OWNER_REASON.CLUSTER_ID_MISMATCH,
        'the refusal carries the typed cluster-id-mismatch reason',
      );
    } finally {
      await rm(dataDir, {recursive: true, force: true});
    }
  });

test('auto-rejoin accepts matching or unknown cluster identity', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'cluster-identity-'));
  try {
    await persistBootstrapRejoinHints({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      nodeRole: 'joiner',
      peerAddresses: [OTHER_NODE_ADDRESS],
      clusterId: CLUSTER_ID_A,
    });
    const matched = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      expectedClusterId: CLUSTER_ID_A,
      probePeerAddress: async () => true,
    });
    t.not(
      matched.state === AUTO_REJOIN_DECISION_STATE.CLUSTER_ID_MISMATCH,
      'a matching identity never trips the fence',
    );
    t.equal(matched.mode, 'join', 'a matching identity rejoins normally');

    const unknown = await resolveAutoRejoinStartupDecision({
      dataDir,
      nodeId: LOCAL_NODE_ID,
      nodeAddress: LOCAL_NODE_ADDRESS,
      probePeerAddress: async () => true,
    });
    t.equal(
      unknown.mode,
      'join',
      'no expected identity (fresh boot over own hints) stays open',
    );
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});
