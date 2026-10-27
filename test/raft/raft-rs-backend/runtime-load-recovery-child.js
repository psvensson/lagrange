// Isolated native witness, invoked by runtime-load-recovery.integration.test.js.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {setActualCoreEntryObserver, setCoreFaultInjector} from
  '../../../src/raft/raft-rs-runtime-owner.js';
import {verifyRaftRsBinding} from '../../../src/raft/raft-rs-operation-port.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_WASM_FILE, RAFT_RS_DIGEST_KEY, RAFT_RS_BINDING_STATE} from
  '../../../src/raft/raft-rs-core-constants.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scenario = process.argv[2];
assert.ok(['control', 'missing-glue', 'changed-glue', 'repeated-refusal'].includes(scenario));
const receipt = {scenario, phase: 'start', traps: 0, failures: [], entries: []};
const groups = [];
const clock = new VirtualTimeSource({startMs: 1000});
let manifestPath;
let gluePath;
let originalManifest;
let originalGlue;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function rows(cluster) {
  const database = new Database(cluster.replica(cluster.replicaIds[0]).dbFile, {readonly: true});
  try {
    return database.prepare('SELECT marker, group_id, log_index FROM recovery_witness ORDER BY log_index').all();
  } finally {
    database.close();
  }
}
function makeGroup(name) {
  const id = `${name}-replica`;
  const cluster = new PartitionNodeCluster({partitionId: name, replicaIds: [id], tempRoot: root,
    substrateFor: () => ({timeSource: clock}),
    applyFor(replicaId, marker, {index}) {
      cluster.replica(replicaId).db.prepare('INSERT INTO recovery_witness VALUES (?, ?, ?)')
        .run(marker, name, index);
    }});
  groups.push(cluster);
  cluster.replica(id).db.exec('CREATE TABLE recovery_witness (marker TEXT PRIMARY KEY, group_id TEXT NOT NULL, log_index INTEGER NOT NULL)');
  return cluster;
}
function restoreArtifacts() {
  if (originalGlue !== undefined) fs.writeFileSync(gluePath, originalGlue);
  if (originalManifest !== undefined) fs.writeFileSync(manifestPath, originalManifest);
}
try {
  const a = makeGroup('load-recovery-a');
  const b = makeGroup('load-recovery-b');
  const portA = a.node(a.replicaIds[0]);
  const portB = b.node(b.replicaIds[0]);
  setActualCoreEntryObserver((entry) => receipt.entries.push(entry));
  for (const [group, port] of [[a, portA], [b, portB]]) {
    assert.equal((await port.campaign()).outcome, OUTCOME.CORE_OK);
    assert.equal((await port.propose(`before:${group.partitionId}`)).outcome, OUTCOME.CORE_OK);
    assert.equal(rows(group).length, 1, 'pre-fault data must be committed to a real SQLite file');
  }
  const initialA = await portA.readStatus();
  const initialB = await portB.readStatus();
  assert.equal(initialA.runtimeGeneration, initialB.runtimeGeneration);
  receipt.initialGeneration = initialA.runtimeGeneration;
  receipt.beforeRows = [rows(a), rows(b)];
  const binding = verifyRaftRsBinding();
  assert.equal(binding.state, RAFT_RS_BINDING_STATE.VERIFIED);
  manifestPath = binding.digestFile;
  const expectedManifest = path.join(root, 'vendor/raft-rs-wasm', RAFT_RS_WASM_FILE.DIGEST);
  assert.equal(fs.realpathSync(manifestPath), fs.realpathSync(expectedManifest),
    'faults may edit only the private fixture artifact, never a shared installation');
  gluePath = path.join(
    path.dirname(manifestPath), RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY, RAFT_RS_WASM_FILE.GLUE);
  originalManifest = fs.readFileSync(manifestPath);
  originalGlue = fs.readFileSync(gluePath);
  receipt.artifactDigests = binding.artifactDigests;
  receipt.phase = 'trap';
  setCoreFaultInjector((groupId, operation) => {
    if (groupId === a.partitionId && operation === 'propose') {
      setCoreFaultInjector(null);
      receipt.traps += 1;
      throw new globalThis.WebAssembly.RuntimeError('injected native load-recovery witness');
    }
  });
  assert.equal((await portA.propose('uncommitted-trap-command')).outcome, OUTCOME.CORE_FATAL);
  assert.equal(receipt.traps, 1);
  const entriesAtTrap = receipt.entries.length;
  if (scenario !== 'control') {
    receipt.phase = 'load-refusal';
    if (scenario === 'changed-glue') {
      const changed = Buffer.concat([originalGlue, Buffer.from('\n// coherent replacement for reload refusal witness\n')]);
      fs.writeFileSync(gluePath, changed);
      const manifest = JSON.parse(originalManifest);
      manifest[RAFT_RS_DIGEST_KEY.GLUE] = hash(changed);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest) + '\n');
    } else {
      fs.unlinkSync(gluePath);
    }
    assert.deepEqual(verifyRaftRsBinding().artifactDigests, binding.artifactDigests,
      'disk changes cannot relabel already loaded artifacts');
    const count = scenario === 'repeated-refusal' ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const failure = await portA.readStatus();
      receipt.failures.push(failure);
      assert.equal(failure.outcome, OUTCOME.HOST_FAILURE, 'failed reload must be typed');
      assert.equal(failure.recoveryRequired, true);
      if (scenario === 'changed-glue') {
        assert.match(failure.reason, /loaded artifact changed within one process/);
      } else {
        assert.match(failure.failure?.reason ?? failure.reason, /ENOENT/);
      }
      assert.equal(receipt.entries.length, entriesAtTrap, 'rejected load must enter no core primitive');
    }
    restoreArtifacts();
    // A restored artifact does not waive the runtime owner's retry window.
    clock.advance(receipt.failures.at(-1).retryAfterMs ?? 0);
  }
  receipt.phase = 'recover-from-other-group';
  const recoveredB = await portB.readStatus();
  receipt.recoveredB = recoveredB;
  assert.equal(recoveredB.outcome, OUTCOME.CORE_OK,
    'a different group must drive shared reconstruction, never enter a stale native handle');
  const created = receipt.entries.slice(entriesAtTrap).filter((entry) => entry.operation === 'create_node');
  assert.deepEqual(
    created.map((entry) => entry.groupId).sort(), [a.partitionId, b.partitionId].sort(),
    'both durable groups must be recreated before recovery returns to the caller');
  receipt.groupsRestored = created.length;
  for (const [group, port, before] of [[a, portA, initialA], [b, portB, initialB]]) {
    const status = await port.readStatus();
    assert.equal(status.outcome, OUTCOME.CORE_OK);
    assert.equal(status.runtimeHealth, 'healthy');
    assert.equal(status.groupHealth, 'usable');
    assert.equal(status.runtimeGeneration, before.runtimeGeneration + 1);
    assert.equal(status.peerId, before.peerId);
    assert.equal(status.replicaIdentity, before.replicaIdentity);
    assert.equal((await port.propose(`after:${group.partitionId}`)).outcome, OUTCOME.CORE_OK);
    const committed = rows(group);
    assert.deepEqual(committed.map((row) => row.marker),
      [`before:${group.partitionId}`, `after:${group.partitionId}`],
      'old and new data must be durable exactly once, with no trapped command');
    assert.ok(committed.every((row) => row.group_id === group.partitionId));
    assert.ok(committed[1].log_index > committed[0].log_index);
  }
  receipt.afterRows = [rows(a), rows(b)];
  assert.deepEqual(verifyRaftRsBinding().artifactDigests, binding.artifactDigests);
  receipt.phase = 'complete';
} finally {
  setCoreFaultInjector(null);
  restoreArtifacts();
  receipt.artifactsRestored = originalGlue !== undefined &&
    fs.readFileSync(gluePath).equals(originalGlue) &&
    fs.readFileSync(manifestPath).equals(originalManifest);
  setActualCoreEntryObserver(null);
  for (const group of groups) group.dispose();
  console.log('NATIVE_RECOVERY ' + JSON.stringify(receipt));
}
