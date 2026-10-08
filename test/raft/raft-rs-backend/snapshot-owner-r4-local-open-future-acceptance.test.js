// Future-green R4 LOCAL_OPEN acceptance. A stopped real replica image is cloned
// once per case and exactly one durable fact changes. Every clone reopens only
// through the production operation port while the private core-entry observer
// records the first owner transition. This is separate from KNOWN_WIPE: no
// database is deleted and no caller supplies prior-existence authority.

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

const GROUP_ID = 'r4-local-open-acceptance';
const REPLICA_ID = 'r4-acceptance-owner';
const SETTLE_ROUNDS = 80;
const CORE_OK = RAFT_OPERATION_OUTCOME.CORE_OK;
const CORE_REFUSED = RAFT_OPERATION_OUTCOME.CORE_REFUSED;

function stoppedImage() {
  const cluster = new PartitionNodeCluster({
    partitionId: GROUP_ID, replicaIds: [REPLICA_ID],
  });
  assert.equal(cluster.node(REPLICA_ID).campaign().outcome, CORE_OK);
  assert.ok(cluster.settle(() =>
    cluster.node(REPLICA_ID).readStatus().role === 'leader',
  {rounds: SETTLE_ROUNDS}));
  assert.equal(cluster.propose(REPLICA_ID, {owner: 'r4'}).outcome, CORE_OK);
  assert.ok(cluster.settle(() =>
    Number(cluster.node(REPLICA_ID).readStatus().appliedIndex) >= 2,
  {rounds: SETTLE_ROUNDS}));
  const replica = cluster.replica(REPLICA_ID);
  const request = replica.request;
  replica.node.close();
  replica.db.close();
  return {cluster, request, source: replica.dbFile};
}

function observeOpen({request, db, groupId}) {
  const coreEntries = [];
  let port = null;
  let error = null;
  setActualCoreEntryObserver((entry) => coreEntries.push(entry));
  try {
    port = createRaftRsOperationPort({...request,
      [RAFT_OPERATION_PORT_REQUEST.GROUP_ID]: groupId,
      [RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE]: db});
  } catch (caught) {
    error = caught;
  } finally {
    setActualCoreEntryObserver(null);
  }
  let answer;
  if (error) {
    answer = {surface: 'throw', outcome: error.consensus?.outcome ?? null,
      reason: error.consensus?.reason ?? error.message,
      phase: error.consensus?.phase ?? null};
  } else {
    const status = port.readStatus();
    answer = {surface: 'status', outcome: status.outcome,
      reason: status.reason ?? null, phase: status.phase ?? null};
  }
  return {answer, coreOperations: coreEntries.map(({operation}) => operation),
    close: () => port?.close()};
}

function lifecycleRows(db) {
  try {
    return db.prepare(
      'SELECT group_id, peer_id, replica_identity, state, incarnation FROM ' +
      '_raft_rs_replica_lifecycle ORDER BY group_id, replica_identity').all();
  } catch (error) {
    return [{readError: error.message}];
  }
}

function peerIdentityRows(db) {
  try {
    return db.prepare(
      'SELECT replica_identity, raft_peer_id FROM raft_rs_peer_identity ' +
      'ORDER BY replica_identity').all();
  } catch (error) {
    return [{readError: error.message}];
  }
}

function noSecondActiveFor(groupId) {
  return (db) => ({
    noSecondActiveGroup: groupId,
    secondActiveRows: lifecycleRows(db).filter((row) =>
      row.group_id === groupId),
  });
}

const CASES = Object.freeze([
  {name: 'legal-vote-zero', sql:
    'UPDATE _raft_rs_hard_state SET vote = 0 WHERE group_id = ?',
  desiredOutcome: CORE_OK, mayEnterCore: true},
  // This is native-record tolerance only. A full application-state coherent
  // lag positive belongs to the later application snapshot suite.
  {name: 'native-record-coherent-applied-lag', sql:
    'UPDATE _raft_rs_applied_state SET applied_index = 1 WHERE group_id = ?',
  desiredOutcome: CORE_OK, mayEnterCore: true},
  {name: 'hard-state-row-missing', sql:
    'DELETE FROM _raft_rs_hard_state WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'hard-state-term-negative', sql:
    'UPDATE _raft_rs_hard_state SET term = -1 WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'hard-state-vote-negative', sql:
    'UPDATE _raft_rs_hard_state SET vote = -1 WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'committed-log-entry-missing', sql:
    'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index = 2',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'snapshot-term-contradiction', sql:
    'INSERT INTO _raft_rs_snapshot VALUES (?, 1, 99, NULL, ' +
      '(SELECT voters FROM _raft_rs_applied_state WHERE group_id = ?), ' +
      '\'[]\', \'[]\', \'[]\', 0, 0)', args: [GROUP_ID, GROUP_ID],
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'applied-index-beyond-log', sql:
    'UPDATE _raft_rs_applied_state SET applied_index = 3 WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'conf-state-empty-contradiction', sql:
    'UPDATE _raft_rs_applied_state SET voters = \'[]\' WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'membership-generation-negative', sql:
    'UPDATE _raft_rs_applied_state SET membership_generation_index = -1 ' +
      'WHERE group_id = ?', desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'lifecycle-retired', sql:
    'UPDATE _raft_rs_replica_lifecycle SET state = \'retired\', ' +
      'reason = \'fixture-retired\' WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'identity-reservation-mismatch', sql:
    'UPDATE raft_rs_peer_identity SET raft_peer_id = \'7\' ' +
      'WHERE replica_identity = ?', args: [REPLICA_ID],
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'lifecycle-row-missing', sql:
    'DELETE FROM _raft_rs_replica_lifecycle WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'applied-row-missing', sql:
    'DELETE FROM _raft_rs_applied_state WHERE group_id = ?',
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'hard-state-table-unreadable', sql:
    'ALTER TABLE _raft_rs_hard_state RENAME TO _unreadable_hard_state',
  args: [], desiredOutcome: 'HOST_FAILURE', mayEnterCore: false},
  {name: 'applied-state-table-unreadable', sql:
    'ALTER TABLE _raft_rs_applied_state RENAME TO _unreadable_applied_state',
  args: [], desiredOutcome: 'HOST_FAILURE', mayEnterCore: false},
  {name: 'lifecycle-table-unreadable', sql:
    'ALTER TABLE _raft_rs_replica_lifecycle RENAME TO _unreadable_lifecycle',
  args: [], desiredOutcome: 'HOST_FAILURE', mayEnterCore: false},
  {name: 'peer-identity-table-unreadable', sql:
    'ALTER TABLE raft_rs_peer_identity RENAME TO _unreadable_peer_identity',
  args: [], desiredOutcome: 'HOST_FAILURE', mayEnterCore: false},
  {name: 'lifecycle-group-mismatch', sql:
    'UPDATE _raft_rs_replica_lifecycle SET group_id = ? WHERE group_id = ?',
  args: ['r4-other-group', GROUP_ID], desiredOutcome: CORE_REFUSED,
  mayEnterCore: false},
  {name: 'lifecycle-peer-mismatch', sql:
    'UPDATE _raft_rs_replica_lifecycle SET peer_id = ? WHERE group_id = ?',
  args: ['9', GROUP_ID], desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'lifecycle-replica-mismatch', sql:
    'UPDATE _raft_rs_replica_lifecycle SET replica_identity = ? ' +
      'WHERE group_id = ?', args: ['r4-other-replica', GROUP_ID],
  desiredOutcome: CORE_REFUSED, mayEnterCore: false},
  {name: 'lifecycle-incarnation-missing', sql:
    'UPDATE _raft_rs_replica_lifecycle SET incarnation = NULL ' +
      'WHERE group_id = ?', desiredOutcome: CORE_REFUSED,
  mayEnterCore: false},
  {name: 'durable-group-request-mismatch', sql: 'SELECT 1', args: [],
    requestGroup: 'r4-other-group', desiredOutcome: CORE_REFUSED,
    mayEnterCore: false, verify: noSecondActiveFor('r4-other-group')},
]);

test('R4 future acceptance: incomplete or contradictory LOCAL_OPEN facts ' +
  'refuse before core while legal vote zero and native lag restore', () => {
  const {cluster, request, source} = stoppedImage();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r4-local-acceptance-'));
  const observed = [];
  try {
    for (const candidate of CASES) {
      const file = path.join(root, `${candidate.name}.sqlite`);
      fs.copyFileSync(source, file);
      const db = new Database(file);
      let observation;
      try {
        db.prepare(candidate.sql).run(...(candidate.args ?? [GROUP_ID]));
        observation = observeOpen({request, db,
          groupId: candidate.requestGroup ?? GROUP_ID});
        const postcondition = candidate.verify?.(db, observation) ?? null;
        observed.push({name: candidate.name,
          desiredOutcome: candidate.desiredOutcome,
          desiredCoreEntry: candidate.mayEnterCore,
          desiredPostcondition: candidate.verify === undefined ? null :
            {noSecondActiveGroup: candidate.requestGroup,
              secondActiveRows: []},
          actual: observation.answer,
          coreOperations: observation.coreOperations,
          lifecycleRows: lifecycleRows(db),
          peerIdentityRows: peerIdentityRows(db),
          postcondition});
      } finally {
        observation?.close();
        db.close();
      }
    }
  } finally {
    setActualCoreEntryObserver(null);
    cluster.dispose();
    fs.rmSync(root, {recursive: true, force: true});
  }

  // Emit every first transition before the single binary acceptance assertion,
  // so the baseline cannot stop after the first native trap and hide later
  // silent-open gaps.
  console.log(JSON.stringify({r4LocalOpenObservations: observed}));
  assert.deepEqual(observed.map(({name, desiredOutcome, desiredCoreEntry,
    actual, coreOperations, postcondition}) => ({
    name,
    outcome: actual.outcome,
    enteredCore: coreOperations.includes('create_node'),
    postcondition,
    desiredOutcome,
    desiredCoreEntry,
  })), observed.map(({name, desiredOutcome, desiredCoreEntry,
    desiredPostcondition}) => ({
    name,
    outcome: desiredOutcome,
    enteredCore: desiredCoreEntry,
    postcondition: desiredPostcondition,
    desiredOutcome,
    desiredCoreEntry,
  })));
});
