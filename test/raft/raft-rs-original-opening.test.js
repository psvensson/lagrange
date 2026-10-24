// Original opening is a process-local continuation of complete preparation,
// never permission reconstructed from a serialized original declaration.
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
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

// Frozen proposed contract spelling also engages the predecessor constructor,
// which silently ignores this purported original-opening authority.
const ORIGINAL_OPENING = 'originalAllocationOpening';
const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-opening-'));
  const directoryOwner = acquireDataDirectoryProcessOwner(dataDir);
  const identity = {dataDir, nodeId: 'original-node', buildDigest: 'test-build'};
  const draft = createSeedOriginalAllocation({...identity, now: 1234});
  const preparation = new RaftRsOriginalAllocationPreparation({directoryOwner, ...identity});
  const resources = [];
  t.after(() => {
    setActualCoreEntryObserver(null);
    for (const resource of resources.reverse()) {
      resource.port?.close();
      if (resource.db.open) resource.db.close();
    }
    preparation.close();
    directoryOwner.release();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  const f = {identity, directoryOwner, draft, declaration: null, preparation, resources};
  // The issued declaration carries the stamps the lifecycle owner minted.
  f.prepare = () => {
    f.declaration = preparation.prepare(draft);
    return f.declaration;
  };
  return f;
}

function requestFor(f, member, extra = {}) {
  const db = new Database(member.dbPath, {fileMustExist: true});
  const resource = {db, port: null};
  f.resources.push(resource);
  const request = {groupId: member.groupId, peerId: member.replicaId,
    peerAddress: `raft-rs://replica-${member.replicaId}`,
    durableStorage: db, bootstrapPeerIds: member.replicaIds,
    bootstrapMembership: member.membership, identityExisted: false,
    timing: TIMING, deferElection: true,
    resolvePeerAddress: (id) => `raft-rs://replica-${id}`,
    sendToPeer: () => {}, applyCommittedEntry: () => {}, ...extra};
  return {request, resource};
}

function hold(reason) {
  return (error) => error.code === STATE.HOLD && error.reason === reason;
}

for (const [name, grant] of [
  ['missing', undefined], ['null', null], ['serialized', {}],
  ['claimed mode', {mode: STATE.LIVE_ISSUER}],
]) {
  test(`native opening refuses ${name} original authority before core or storage effects`, (t) => {
    const f = fixture(t);
    f.prepare();
    const member = f.declaration.members[0];
    const {request, resource} = requestFor(f, member, {[ORIGINAL_OPENING]: grant});
    const before = resource.db.prepare('SELECT name, sql FROM sqlite_master ORDER BY name').all();
    const coreEntries = [];
    setActualCoreEntryObserver((entry) => coreEntries.push(entry));
    assert.throws(() => {
      resource.port = createRaftRsOperationPort(request);
    }, hold(REASON.AUTHORITY));
    assert.deepEqual(coreEntries, [], 'the real native entry observer stays empty');
    assert.deepEqual(resource.db.prepare('SELECT name, sql FROM sqlite_master ORDER BY name').all(),
      before, 'refusal precedes even writable formatting');
    assert.equal(originalAllocationRow(resource.db, member).native_history_state,
      HISTORY.NEVER_OPENED);
  });
}

test('ordinary port requests retain the existing constructor path', (t) => {
  const f = fixture(t);
  f.prepare();
  const member = f.declaration.members[0];
  const {request, resource} = requestFor(f, member);
  resource.port = createRaftRsOperationPort(request);
  assert.equal(resource.port.readStatus().outcome, 'CORE_OK');
  assert.equal(originalAllocationRow(resource.db, member).native_history_state,
    HISTORY.ESTABLISHED);
});
