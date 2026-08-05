/**
 * Replica-evidence conflict detection (startup-evidence-single-identity-
 * decision-v2, frontier 2): contradictory nodes-p* replica DBs — the SAME
 * node_id carried with a DIVERGENT node_address across two readable replica
 * files — are treated as CONFLICTING durable evidence and fail closed
 * (CONFLICTING_DURABLE_EVIDENCE), never silently unioned into a trustworthy
 * membership. These tests are red-on-revert: each asserts the typed
 * conflict outcome and fails if the conflict fold/decision is reverted.
 */

import Database from 'better-sqlite3';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {test} from '../../src/test-helpers/tap.js';
import {
  resolveAutoRejoinStartupDecision,
} from '../../src/bootstrap/rejoin-hints.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
} from '../../src/bootstrap/rejoin-hints-constants.js';

const LOCAL_NODE_ID = 'node-local';
const LOCAL_NODE_ADDRESS = 'seed-node:8080';
const PEER_NODE_ID = 'node-peer-a';
const PEER_ADDRESS_A = 'peer-a:8080';
const PEER_ADDRESS_DIVERGENT = 'peer-a:9999';

async function writeReplicaDb(dataDir, partition, replica, rows) {
  const partitionDir = join(dataDir, 'partitions', partition);
  await mkdir(partitionDir, {recursive: true});
  const database = new Database(join(partitionDir, `${replica}.db`));
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
    for (const row of rows) {
      insertRow.run(row.node_id, row.node_address);
    }
  } finally {
    database.close();
  }
}

test('contradictory replica DBs (same node_id, divergent address) fail ' +
  'closed instead of unioning', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'replica-conflict-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // Two readable replica DBs agree on the local node but carry the SAME
  // peer node_id with DIVERGENT addresses — a contradiction the union
  // would previously have absorbed silently.
  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r1', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_A},
  ]);
  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r2', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_DIVERGENT},
  ]);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => false,
  });

  t.equal(
    decision.state,
    'conflicting_durable_evidence',
    'contradictory replica DBs are conflicting, not unioned',
  );
  t.equal(decision.mode, 'fail', 'the decision is terminal (fail closed)');
  t.equal(
    decision.membershipOwnerOutcome.outcomeType,
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    'the membership owner records a blocked startup',
  );
  t.equal(
    decision.membershipOwnerOutcome.reasonCode,
    'conflicting_durable_evidence',
    'the refusal carries the typed conflicting-evidence reason',
  );
  t.ok(
    typeof decision.error === 'string' && decision.error.length > 0,
    'the refusal surfaces an operator-facing message',
  );
});

test('consistent replica DBs (same node_id, same address) are NOT ' +
  'conflicting', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'replica-conflict-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  // Replicas agree — the normal multi-replica case must not trip the
  // conflict detector.
  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r1', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_A},
  ]);
  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r2', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_A},
  ]);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => true,
  });

  t.not(
    decision.state,
    'conflicting_durable_evidence',
    'agreeing replicas are not flagged conflicting',
  );
});

test('the force-new-cluster escape overrides the conflict fence', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'replica-conflict-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));

  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r1', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_A},
  ]);
  await writeReplicaDb(dataDir, 'nodes-p1', 'nodes-p1-r2', [
    {node_id: LOCAL_NODE_ID, node_address: LOCAL_NODE_ADDRESS},
    {node_id: PEER_NODE_ID, node_address: PEER_ADDRESS_DIVERGENT},
  ]);

  const decision = await resolveAutoRejoinStartupDecision({
    dataDir,
    nodeId: LOCAL_NODE_ID,
    nodeAddress: LOCAL_NODE_ADDRESS,
    probePeerAddress: async () => false,
    forceNewCluster: true,
  });

  t.not(
    decision.state,
    'conflicting_durable_evidence',
    'the explicit operator escape authorizes fresh bootstrap over conflict',
  );
});
