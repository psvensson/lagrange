import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {PartitionNodeCluster} from './partition-node-cluster.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC_RAFT = path.join(ROOT, 'src', 'raft');
const BINDING_IMPORT = /from ['"]\.\/raft-rs-core\.js['"]/u;

function raftSourceFiles() {
  return fs.readdirSync(SRC_RAFT)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(SRC_RAFT, name));
}

function sourceOf(file) {
  return fs.readFileSync(file, 'utf8');
}

function ownSurface(value) {
  return Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const member = descriptor && Object.hasOwn(descriptor, 'value') ?
      descriptor.value : null;
    return {
      key: String(key),
      kind: descriptor && Object.hasOwn(descriptor, 'value') ?
        typeof member : 'accessor',
      frozen: member === null || typeof member !== 'object' ||
        Object.isFrozen(member),
    };
  });
}

test('the partition receives only a frozen operation port and immutable snapshots',
  () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'operation-port-red',
      replicaIds: ['operation-port-replica'],
    });
    try {
      const port = cluster.node('operation-port-replica');
      const surface = ownSurface(port);
      assert.equal(Object.isFrozen(port), true,
        'the public partition value itself is frozen');
      assert.equal(surface.every((entry) =>
        entry.kind === 'function' || entry.frozen), true,
      `only functions and immutable values cross; got ${JSON.stringify(surface)}`);
      for (const forbidden of [
        'host', 'store', 'core', 'handle', 'key', 'runtime', 'lifecycle',
        'record', 'db', 'database',
      ]) {
        assert.equal(Reflect.has(port, forbidden), false,
          `${forbidden} is not publicly reachable`);
      }
      assert.equal(typeof port.raftRsGroupParts, 'undefined',
        'no helper returns the implementation graph');
    } finally {
      cluster.dispose();
    }
  });

test('one private runtime owner is the only production binding importer', () => {
  const importers = raftSourceFiles()
    .filter((file) => BINDING_IMPORT.test(sourceOf(file)))
    .map((file) => path.basename(file));
  assert.deepEqual(importers, ['raft-rs-runtime-owner.js']);
});

test('retirement has one production writer and no provider control accessor',
  () => {
    const sources = raftSourceFiles().map((file) => ({
      file: path.basename(file), source: sourceOf(file),
    }));
    const writers = sources.filter(({source}) =>
      /\.putRetirement\s*\(/u.test(source)).map(({file}) => file);
    assert.deepEqual(writers, ['raft-rs-replica-lifecycle-owner.js']);
    const provider = sourceOf(path.join(SRC_RAFT, 'raft-rs-provider.js'));
    assert.equal(provider.includes('partitionControlOf'), false);
    assert.equal(provider.includes('partitionControls'), false);
  });

test('the private owner instruments actual core entry rather than gate checks',
  () => {
    const ownerFile = path.join(SRC_RAFT, 'raft-rs-runtime-owner.js');
    assert.equal(fs.existsSync(ownerFile), true,
      'the private runtime owner exists');
    const owner = sourceOf(ownerFile);
    assert.match(owner, /actualCoreEntr(?:y|ies)/u);
    assert.match(owner, /lifecycle/u);
    assert.doesNotMatch(owner, /partitionControlOf|walkObjectGraph|depth/u);
  });

test('the operation boundary removes public capability instead of renaming it',
  () => {
    const provider = sourceOf(path.join(SRC_RAFT, 'raft-rs-provider.js'));
    assert.doesNotMatch(provider,
      /RaftRsGroupHandle|raftRsGroupOf|partitionControlOf|retireFromScheduling/u);
    assert.match(provider, /createPartitionPort/u);
  });
