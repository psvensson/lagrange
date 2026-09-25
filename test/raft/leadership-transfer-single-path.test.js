// One path to a leadership handoff (quest F1, raft-rs full cutover, witness
// W5 and the Liferaft refusal).
//
// A partition's leadership is handed on through one operation of its
// consensus port, transferLeadership, asked only by the partition's one
// issuer (PartitionService.requestLeadershipTransfer), which the replica
// handler's two STEP_DOWN_REPLICA branches ask. The retired demotion path -
// the tracked demotion helper, the handler's raft.change / raftProvider
// gates, the provider's immediate-election control - is gone, not kept as a
// quieter alternative. Every port the partition can be handed implements the
// operation; the Liferaft port, which cannot transfer, refuses it typed and
// changes nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {RAFT_OPERATION_PORT_METHODS} from
  '../../src/raft/raft-operation-port.js';
import * as portConstants from
  '../../src/raft/raft-operation-port-constants.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
  RAFT_PROVIDER_CONTRACT_METHOD,
} from '../../src/raft/raft-provider-contract-constants.js';
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
const LIFERAFT_INTERNALS = /^src\/raft\/liferaft[^/]*\.js$/u;
const LIFERAFT_REPLICA = 'liferaft-replica';
const LIFERAFT_TIMING = Object.freeze({
  heartbeatMs: 50, electionMinMs: 150, electionMaxMs: 300,
});

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

function liferaftRequest() {
  return {
    [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: 'liferaft-transfer',
    [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: LIFERAFT_REPLICA,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: LIFERAFT_REPLICA,
    [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: [LIFERAFT_REPLICA],
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_LOG]: {
      end: () => undefined,
      getLastInfo: async () => ({index: 0, term: 0, committedIndex: 0}),
    },
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE]: new Database(':memory:'),
    [RAFT_PARTITION_NODE_REQUEST.TIMING]: LIFERAFT_TIMING,
    [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]: {},
    [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: true,
    [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: () => Promise.resolve(),
    [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (value) => value,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_TRANSACTION_ROLLED_BACK]: () =>
      undefined,
    [RAFT_PARTITION_NODE_REQUEST.INITIAL_TERM]: 0,
  };
}

test('W5: the retired demotion path has no source left', () => {
  assert.equal(fs.existsSync(RETIRED_MODULE), false,
    'the tracked demotion helper is deleted');
  for (const name of RETIRED_NAMES) {
    assert.deepEqual(filesMatching(new RegExp(`\\b${name}\\b`, 'u')), [],
      `nothing in src names ${name}`);
  }
  assert.equal(Object.values(RAFT_PROVIDER_CONTRACT_METHOD)
    .includes('requestElectionNow'), false,
  'the provider contract carries no immediate-election control');
  assert.deepEqual(filesMatching(/\braftProvider\b|\.change\(/u)
    .filter((file) => file.startsWith(HANDLER_PREFIX)), [],
  'the replica handler reaches for no provider and no raft.change');
  assert.deepEqual(filesMatching(/\.deferCandidacy\(/u)
    .filter((file) => !LIFERAFT_INTERNALS.test(file)), [],
  'candidacy deferral is called only inside Liferaft itself');
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

test('W5: every port a partition can be handed implements the operation',
  () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'transfer-port-surface', replicaIds: ['surface-r1']});
    const request = liferaftRequest();
    const liferaftPort = new LiferaftProvider().createPartitionPort(request);
    try {
      assert.equal(typeof cluster.node('surface-r1')[OPERATION], 'function',
        'the rs-raft port implements it');
      assert.equal(typeof liferaftPort[OPERATION], 'function',
        'the Liferaft port implements it');
    } finally {
      liferaftPort.close();
      request[RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE].close();
      cluster.dispose();
    }
  });

test('the Liferaft port refuses a leadership transfer typed and changes ' +
  'nothing', async () => {
  const request = liferaftRequest();
  const port = new LiferaftProvider().createPartitionPort(request);
  try {
    const before = port.readStatus();
    const successor = portConstants.RAFT_LEADERSHIP_TRANSFER_SUCCESSOR;
    for (const transfer of [
      {successor: successor?.NAMED, replicaIdentity: LIFERAFT_REPLICA},
      {successor: successor?.MOST_CAUGHT_UP},
    ]) {
      const answer = await port[OPERATION]?.(transfer);
      assert.equal(answer?.outcome,
        portConstants.RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'the backend that cannot transfer refuses, never a no-op CORE_OK');
      assert.equal(answer?.reason,
        portConstants.RAFT_LEADERSHIP_TRANSFER_REASON?.UNSUPPORTED_BACKEND,
        'the refusal names the unsupported backend');
      assert.equal(Object.isFrozen(answer), true, 'the answer is frozen');
    }
    const after = port.readStatus();
    assert.deepEqual({term: after.term, role: after.role,
      leaderId: after.leaderId}, {term: before.term, role: before.role,
      leaderId: before.leaderId}, 'the node is unchanged');
  } finally {
    port.close();
    request[RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE].close();
  }
});
