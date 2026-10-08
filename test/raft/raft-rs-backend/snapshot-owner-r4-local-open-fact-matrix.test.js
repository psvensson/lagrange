// R4 LOCAL_OPEN supplemental owner matrix. One stopped, real replica image is
// cloned per row; each clone changes one durable fact and is reopened only
// through the production operation port. This is intentionally not a HOLD
// oracle: facts without an owner classification are reported as such.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {createRaftRsOperationPort} from
  '../../../src/raft/raft-rs-operation-port.js';
import {setActualCoreEntryObserver} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const GROUP_ID = 'r4-local-open-facts';
const REPLICA_ID = 'r4-owner';
const SETTLE_ROUNDS = 80;

function buildStoppedImage() {
  const cluster = new PartitionNodeCluster({
    partitionId: GROUP_ID, replicaIds: [REPLICA_ID],
  });
  assert.equal(cluster.node(REPLICA_ID).campaign().outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(cluster.settle(() =>
    cluster.node(REPLICA_ID).readStatus().role === 'leader',
  {rounds: SETTLE_ROUNDS}));
  assert.equal(cluster.propose(REPLICA_ID, {owner: 'r4'}).outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(cluster.settle(() =>
    Number(cluster.node(REPLICA_ID).readStatus().appliedIndex) >= 2,
  {rounds: SETTLE_ROUNDS}));
  const replica = cluster.replica(REPLICA_ID);
  const request = replica.request;
  replica.node.close();
  replica.db.close();
  return {cluster, request, source: replica.dbFile};
}

function outcomeOf(error, port) {
  if (error) {
    return {kind: 'throw', consensus: error.consensus ?? null,
      code: error.code ?? null, message: error.message};
  }
  const status = port.readStatus();
  return {kind: 'status', consensus: status, code: null, message: null};
}

test('R4 LOCAL_OPEN classifies one-fact stopped-image clones at the real ' +
  'operation-port owner', () => {
  const {cluster, request, source} = buildStoppedImage();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-local-open-matrix-'));
  const cases = [
    {name: 'legal-vote-zero', sql:
      'UPDATE _raft_rs_hard_state SET vote = 0 WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_OK'},
    {name: 'coherent-applied-lag', sql:
      'UPDATE _raft_rs_applied_state SET applied_index = 1 WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_OK'},
    {name: 'hard-state-absent', sql:
      'DELETE FROM _raft_rs_hard_state WHERE group_id = ?',
    expectedKind: 'throw', expectedOutcome: 'CORE_FATAL'},
    {name: 'hard-state-term-negative', sql:
      'UPDATE _raft_rs_hard_state SET term = -1 WHERE group_id = ?',
    expectedKind: 'throw', expectedOutcome: 'CORE_REFUSED'},
    {name: 'hard-state-vote-negative', sql:
      'UPDATE _raft_rs_hard_state SET vote = -1 WHERE group_id = ?',
    expectedKind: 'throw', expectedOutcome: 'CORE_REFUSED'},
    {name: 'committed-log-entry-absent', sql:
      'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index = 2',
    expectedKind: 'throw', expectedOutcome: 'CORE_FATAL'},
    {name: 'snapshot-term-contradiction', sql:
      'INSERT INTO _raft_rs_snapshot VALUES (?, 1, 99, NULL, ' +
        '(SELECT voters FROM _raft_rs_applied_state WHERE group_id = ?), ' +
        '\'[]\', \'[]\', \'[]\', 0, 0)', args: [GROUP_ID, GROUP_ID],
    expectedKind: 'throw', expectedOutcome: 'CORE_FATAL'},
    {name: 'applied-beyond-log', sql:
      'UPDATE _raft_rs_applied_state SET applied_index = 3 WHERE group_id = ?',
    expectedKind: 'throw', expectedOutcome: 'CORE_FATAL'},
    {name: 'conf-state-contradiction', sql:
      'UPDATE _raft_rs_applied_state SET voters = \'[]\' WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_OK'},
    {name: 'generation-negative', sql:
      'UPDATE _raft_rs_applied_state SET membership_generation_index = -1 ' +
        'WHERE group_id = ?', expectedKind: 'status', expectedOutcome: 'CORE_OK'},
    {name: 'lifecycle-retired', sql:
      'UPDATE _raft_rs_replica_lifecycle SET state = \'retired\', ' +
        'reason = \'fixture-retired\' WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_REFUSED'},
    {name: 'identity-reservation-mismatch', sql:
      'UPDATE raft_rs_peer_identity SET raft_peer_id = \'7\' ' +
        'WHERE replica_identity = ?', args: [REPLICA_ID],
    expectedKind: 'throw', expectedOutcome: null},
    {name: 'lifecycle-row-absent', sql:
      'DELETE FROM _raft_rs_replica_lifecycle WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_REFUSED'},
    {name: 'applied-row-absent', sql:
      'DELETE FROM _raft_rs_applied_state WHERE group_id = ?',
    expectedKind: 'status', expectedOutcome: 'CORE_OK'},
    {name: 'hard-state-table-unreadable', sql:
      'ALTER TABLE _raft_rs_hard_state RENAME TO _unreadable_hard_state',
    args: [], expectedKind: 'status', expectedOutcome: 'HOST_FAILURE'},
    {name: 'applied-state-table-unreadable', sql:
      'ALTER TABLE _raft_rs_applied_state RENAME TO _unreadable_applied_state',
    args: [], expectedKind: 'status', expectedOutcome: 'HOST_FAILURE'},
    {name: 'group-request-mismatch', sql:
      'SELECT 1', args: [], requestGroup: 'r4-other-group',
    expectedKind: 'status', expectedOutcome: 'CORE_OK'},
  ];
  const observations = [];
  try {
    for (const row of cases) {
      const file = path.join(root, `${row.name}.sqlite`);
      fs.copyFileSync(source, file);
      const db = new Database(file);
      db.prepare(row.sql).run(...(row.args ?? [GROUP_ID]));
      const coreEntries = [];
      let port = null;
      let error = null;
      setActualCoreEntryObserver((entry) => coreEntries.push(entry));
      try {
        port = createRaftRsOperationPort({...request,
          [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: row.requestGroup ?? GROUP_ID,
          [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: db});
      } catch (caught) {
        error = caught;
      } finally {
        setActualCoreEntryObserver(null);
      }
      const observed = outcomeOf(error, port);
      observations.push({name: row.name,
        observed, coreOperations: coreEntries.map((entry) => entry.operation)});
      assert.equal(observed.kind, row.expectedKind,
        JSON.stringify(observations.at(-1)));
      assert.equal(observed.consensus?.outcome ?? null, row.expectedOutcome,
        JSON.stringify(observations.at(-1)));
      try {
        port?.close();
      } finally {
        db.close();
      }
    }
    assert.equal(observations.length, cases.length);
  } finally {
    setActualCoreEntryObserver(null);
    fs.writeFileSync(path.join(root, 'observations.json'),
      `${JSON.stringify(observations, null, 2)}\n`);
    cluster.dispose();
  }
});
