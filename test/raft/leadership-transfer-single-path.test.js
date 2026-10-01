// One path to a leadership handoff (quest F1, raft-rs full cutover, witness
// W5).
//
// A partition's leadership is handed on through one operation of its
// consensus port, transferLeadership, asked only by the partition's one
// issuer (PartitionService.requestLeadershipTransfer), which the replica
// handler's two STEP_DOWN_REPLICA branches ask. The retired demotion path -
// the tracked demotion helper, the handler's raft.change / provider gates,
// the immediate-election control - is gone, not kept as a quieter
// alternative. The one port a partition can be handed, the rs-raft operation
// port, implements the operation.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {RAFT_OPERATION_PORT_METHODS} from
  '../../src/raft/raft-operation-port.js';
import {PartitionNodeCluster} from
  './raft-rs-backend/partition-node-cluster.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const OPERATION = 'transferLeadership';
const PARTITION_ISSUER = 'requestLeadershipTransfer';
const RETIRED_MODULE = path.join(SRC, 'raft', 'tracked-leader-demotion.js');
const RETIRED_NAMES = Object.freeze([
  'performTrackedLeaderDemotion', 'requestElectionNow',
  'REQUEST_ELECTION_NOW', 'requestTrackedReplacementLeaderElection',
]);
const HANDLER_PREFIX = 'src/node/replica-handler';

function sourceFiles(directory = SRC) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
  });
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

// Each file's code with its comments removed, so a census counts what the
// code does and not what a comment recalls.
function codeOf(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gmu, '$1');
}

function filesMatching(pattern) {
  return sourceFiles().filter((file) => pattern.test(codeOf(file)))
    .map(relative).sort();
}

test('W5: the retired demotion path has no source left', () => {
  assert.equal(fs.existsSync(RETIRED_MODULE), false,
    'the tracked demotion helper is deleted');
  for (const name of RETIRED_NAMES) {
    assert.deepEqual(filesMatching(new RegExp(`\\b${name}\\b`, 'u')), [],
      `nothing in src names ${name}`);
  }
  assert.deepEqual(filesMatching(/\.change\(/u)
    .filter((file) => file.startsWith(HANDLER_PREFIX)), [],
    'the replica handler reaches for no direct raft.change path');
  assert.deepEqual(filesMatching(/\.deferCandidacy\(/u), [],
    'the retired candidacy-deferral path has no source left');
});

test('W5: the port operation has one partition issuer and one caller of it',
  () => {
    assert.ok(RAFT_OPERATION_PORT_METHODS.includes(OPERATION),
      'transferLeadership is on the frozen operation-port method list');
    assert.deepEqual(filesMatching(new RegExp(`\\.${OPERATION}\\(`, 'u')),
      ['src/partition/partition-service-leadership-transfer.js'],
      'only the partition issuer asks the port to transfer leadership');
    assert.deepEqual(filesMatching(
      new RegExp(`\\.${PARTITION_ISSUER}\\(`, 'u')),
    ['src/node/replica-handler-leader-handoff-methods.js'],
    'only the replica handler\'s handoff asks the partition issuer');
  });

test('W5: the one port a partition can be handed implements the operation',
  () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'transfer-port-surface', replicaIds: ['surface-r1']});
    try {
      assert.equal(typeof cluster.node('surface-r1')[OPERATION], 'function',
        'the rs-raft port implements it');
    } finally {
      cluster.dispose();
    }
  });
