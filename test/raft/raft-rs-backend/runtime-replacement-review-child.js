// Native adversarial follow-up to PR #117 review 5488915088.
// Faults alter only this process's private fixture files or existing test seams.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {setActualCoreEntryObserver, setCoreFaultInjector} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {verifyRaftRsBinding} from '../../../src/raft/raft-rs-operation-port.js';
import {RAFT_EVENT, RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {CORE_REFUSAL_KIND} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_WASM_FILE} from '../../../src/raft/raft-rs-core-constants.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scenario = process.argv[2];
assert.ok(['control', 'partial-restore', 'reentrant-restore', 'reload-backoff'].includes(scenario));
const clock = new VirtualTimeSource({startMs: 1000});
const readFault = {enabled: false};
const receipt = {scenario, phase: 'setup', traps: 0, entries: [], callbacks: [], loadAttempts: 0};
const clusters = [];
const nativeReadFile = fs.readFileSync;
let gluePath;
let originalGlue;
let unsubscribe;
function readRows(cluster) {
  const db = new Database(cluster.replica(cluster.replicaIds[0]).dbFile, {readonly: true});
  try { return db.prepare('SELECT marker FROM review_witness ORDER BY log_index').pluck().all(); }
  finally { db.close(); }
}
function makeGroup(suffix) {
  const name = `review-${suffix}`;
  const id = `${name}-replica`;
  let cluster;
  cluster = new PartitionNodeCluster({partitionId: name, replicaIds: [id], tempRoot: root,
    substrateFor: () => ({timeSource: clock}),
    wrapDatabase: (_id, db) => new Proxy(db, {get(target, property) {
      if (property === 'prepare') return (sql) => {
        if (suffix === 'a' && readFault.enabled && /^\s*SELECT/iu.test(sql) && /_raft_rs_/u.test(sql)) {
          throw Object.assign(new Error('injected real-store read unavailability'), {code: 'SQLITE_IOERR'});
        }
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }}),
    applyFor(replicaId, marker, {index}) {
      cluster.replica(replicaId).db.prepare('INSERT INTO review_witness VALUES (?, ?)').run(marker, index);
    }});
  clusters.push(cluster);
  cluster.replica(id).db.exec('CREATE TABLE review_witness (marker TEXT PRIMARY KEY, log_index INTEGER NOT NULL)');
  return cluster;
}
const portOf = (cluster) => cluster.node(cluster.replicaIds[0]);
try {
  const a = makeGroup('a');
  const b = makeGroup('b');
  const c = makeGroup('c');
  const pa = portOf(a); const pb = portOf(b); const pc = portOf(c);
  setActualCoreEntryObserver((entry) => receipt.entries.push(entry));
  for (const group of clusters) {
    assert.equal((await portOf(group).campaign()).outcome, OUTCOME.CORE_OK);
    assert.equal((await portOf(group).propose(`before:${group.partitionId}`)).outcome, OUTCOME.CORE_OK);
    assert.deepEqual(readRows(group), [`before:${group.partitionId}`]);
  }
  receipt.initial = await pa.readStatus();
  setCoreFaultInjector((groupId, operation) => {
    if (groupId === a.partitionId && operation === 'propose') {
      setCoreFaultInjector(null); receipt.traps += 1;
      throw new WebAssembly.RuntimeError('PR117 native-boundary trap');
    }
  });
  receipt.phase = 'trap';
  assert.equal((await pa.propose('must-not-commit')).outcome, OUTCOME.CORE_FATAL);
  assert.equal(receipt.traps, 1);
  if (scenario === 'partial-restore') {
    receipt.phase = 'partial-restore:other-group';
    receipt.refusals = 0;
    setCoreFaultInjector((groupId, operation) => {
      if (groupId === b.partitionId && operation === 'create_node') {
        setCoreFaultInjector(null); receipt.refusals += 1;
        throw Object.assign(new Error('injected native create refusal'), {kind: CORE_REFUSAL_KIND});
      }
    });
    receipt.initiator = await pa.readStatus();
    receipt.other = await pc.readStatus();
    assert.equal(receipt.refusals, 1, 'the middle group must refuse real reconstruction');
    assert.equal(receipt.other.outcome, OUTCOME.CORE_OK,
      'later group must not use a discarded handle after an earlier restoration refusal');
    assert.ok(receipt.entries.some((entry) => entry.operation === 'create_node' &&
      entry.groupId === c.partitionId && entry.runtimeGeneration > receipt.initial.runtimeGeneration));
  } else if (scenario === 'reentrant-restore') {
    receipt.phase = 'reentrant-restore:callback';
    unsubscribe = pa.subscribe(RAFT_EVENT.FOLLOWER, () => {
      const before = receipt.entries.length;
      const status = pb.readStatus();
      receipt.callbacks.push({status, enteredCore: receipt.entries.length - before});
    });
    readFault.enabled = true;
    receipt.initiator = await pc.readStatus();
    readFault.enabled = false;
    assert.equal(receipt.callbacks.length, 1, 'an actual recovery announcement must invoke the callback');
    assert.equal(receipt.callbacks[0].enteredCore, 0,
      'cross-group callback must enter no native primitive during replacement');
    assert.equal(receipt.callbacks[0].status.outcome, OUTCOME.HOST_FAILURE,
      'replacement-in-progress must be a typed hold, not cached healthy or a core fault');
    unsubscribe(); unsubscribe = undefined;
  } else if (scenario === 'reload-backoff') {
    receipt.phase = 'reload-backoff:shared-window';
    const binding = verifyRaftRsBinding();
    const manifest = binding.digestFile;
    assert.equal(fs.realpathSync(manifest), fs.realpathSync(path.join(root, 'vendor/raft-rs-wasm/artifact-digest.json')));
    gluePath = path.join(path.dirname(manifest), RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY, RAFT_RS_WASM_FILE.GLUE);
    originalGlue = nativeReadFile(gluePath);
    fs.unlinkSync(gluePath);
    fs.readFileSync = function(file, ...args) {
      if (file === manifest) receipt.loadAttempts += 1;
      return nativeReadFile.call(this, file, ...args);
    };
    const first = await pa.readStatus(); receipt.firstRefusal = first;
    assert.equal(first.outcome, OUTCOME.HOST_FAILURE);
    const initialAttempts = receipt.loadAttempts;
    assert.equal(initialAttempts, 1, 'the first failed real artifact read must engage');
    for (let index = 0; index < 24; index += 1) {
      const refusal = await [pb, pc, pa][index % 3].readStatus();
      assert.equal(refusal.outcome, OUTCOME.HOST_FAILURE);
    }
    assert.equal(receipt.loadAttempts, initialAttempts,
      'all groups must share one reload attempt per retry window');
    assert.ok(first.retryAfterMs > 0, 'the shared hold must name a positive remaining window');
    clock.advance(first.retryAfterMs - 1);
    assert.equal((await pb.readStatus()).outcome, OUTCOME.HOST_FAILURE);
    assert.equal(receipt.loadAttempts, initialAttempts, 'no retry before the existing deadline');
    fs.writeFileSync(gluePath, originalGlue);
    clock.advance(1);
    assert.equal((await pb.readStatus()).outcome, OUTCOME.CORE_OK);
    assert.equal(receipt.loadAttempts, initialAttempts + 1, 'another group resumes the one due attempt');
  } else {
    receipt.phase = 'control:recovery';
    assert.equal((await pc.readStatus()).outcome, OUTCOME.CORE_OK);
  }
  setCoreFaultInjector(null); readFault.enabled = false;
  // A held individual group may need its owner-advertised window. Never invent a new budget.
  for (const group of clusters) {
    let status = await portOf(group).readStatus();
    if (status.outcome === OUTCOME.HOST_FAILURE && status.retryAfterMs > 0) {
      clock.advance(status.retryAfterMs); status = await portOf(group).readStatus();
    }
    assert.equal(status.outcome, OUTCOME.CORE_OK);
    assert.equal((await portOf(group).propose(`after:${group.partitionId}`)).outcome, OUTCOME.CORE_OK);
    assert.deepEqual(readRows(group), [`before:${group.partitionId}`, `after:${group.partitionId}`]);
  }
  receipt.phase = 'complete';
} finally {
  readFault.enabled = false; setCoreFaultInjector(null);
  if (unsubscribe) unsubscribe();
  fs.readFileSync = nativeReadFile;
  if (originalGlue) fs.writeFileSync(gluePath, originalGlue);
  setActualCoreEntryObserver(null);
  for (const cluster of clusters) cluster.dispose();
  console.log('RUNTIME_REVIEW ' + JSON.stringify(receipt));
}
