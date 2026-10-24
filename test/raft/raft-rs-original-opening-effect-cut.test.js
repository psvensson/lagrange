// A successful earlier admission cannot authorize a later native effect after
// timing callbacks revoke the attempt or a publication owner consumes its right.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {RaftRsOriginalAllocationPreparation} from
  '../../src/raft/raft-rs-original-allocation-preparation.js';
import {acquireDataDirectoryProcessOwner} from
  '../../src/storage/data-directory-process-owner.js';
import {createRaftRsOperationPort} from '../../src/raft/raft-rs-operation-port.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {readOriginalAllocationRow, transitionOriginalRight} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';
import {RAFT_OPERATION_PORT_REQUEST as REQUEST} from '../../src/raft/raft-operation-port-request.js';

const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});
const hold = (reason) => (error) => error.code === STATE.HOLD && error.reason === reason;

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-effect-cut-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'original-node', buildDigest: 'effect-cut-build'};
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
  let db = null;
  let port;
  t.after(() => {
    setActualCoreEntryObserver(null);
    port?.close();
    if (db?.open) db.close();
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  const declaration = preparation.prepare(draft);
  const member = declaration.members.find((entry) =>
    entry.replicaId === declaration.anchorReplicaId);
  db = new Database(member.dbPath, {fileMustExist: true});
  const entries = [];
  setActualCoreEntryObserver((entry) => entries.push(entry));
  const request = {groupId: member.groupId, peerId: member.replicaId,
    peerAddress: 'local-original', durableStorage: db,
    bootstrapPeerIds: member.replicaIds, bootstrapMembership: member.membership,
    identityExisted: false, timing: TIMING, deferElection: true,
    resolvePeerAddress: () => 'local-original', sendToPeer: () => {},
    applyCommittedEntry: () => {},
    [REQUEST.ORIGINAL_ALLOCATION_OPENING]: preparation.openingFor(member.replicaId)};
  const open = () => {
    port = createRaftRsOperationPort(request);
    return port;
  };
  return {db, member, preparation, entries, request, open};
}

test('unchanged original authority reaches actual native creation', (t) => {
  const f = fixture(t);
  assert.equal(f.open().readStatus().outcome, 'CORE_OK');
  assert.ok(f.entries.some(({operation}) => operation === 'create_node'));
  assert.equal(readOriginalAllocationRow({db: f.db, member: f.member}).native_history_state,
    HISTORY.ESTABLISHED);
});

test('revocation inside native tuning cannot cross the actual creation cut', (t) => {
  const f = fixture(t);
  f.request.timing = {...TIMING, get electionMinMs() {
    f.preparation.revoke();
    return TIMING.electionMinMs;
  }};
  assert.throws(f.open, hold(REASON.CLOSED));
  assert.deepEqual(f.entries, [], 'the native create boundary was not entered');
  assert.equal(readOriginalAllocationRow({db: f.db, member: f.member}).native_history_state,
    HISTORY.NEVER_OPENED);
});

for (const column of [COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT]) {
  test(`late consumption of ${column} cannot authorize native creation`, (t) => {
    const f = fixture(t);
    Object.defineProperty(f.request, 'sendToPeer', {get() {
      transitionOriginalRight({db: f.db, member: f.member, right: column,
        from: STATE.UNUSED, to: STATE.SUBMITTED});
      return () => {};
    }});
    assert.throws(f.open, hold(REASON.SPENT));
    assert.deepEqual(f.entries, []);
    assert.equal(readOriginalAllocationRow({db: f.db, member: f.member})[column], STATE.SUBMITTED);
    assert.equal(readOriginalAllocationRow({db: f.db, member: f.member}).native_history_state,
      HISTORY.NEVER_OPENED);
  });
}
