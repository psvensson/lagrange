// T7 static census (owner decision O1, committed-read amendment 1, section 5
// last bullet): who reads the committed configuration, who produces a
// committed-membership stamp, who carries it, and that the boundary's
// values are imported from their owner rather than written again.
//
// Every expected set below is the census this change declares; a new reader,
// producer, carrier or hand-written value turns the census red, and the
// change that adds one must extend the census (and say why) instead.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  BOOTSTRAP_MEMBERSHIP_SOURCE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
  PARTICIPATION_GATE,
} from '../../../src/raft/raft-committed-membership-constants.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = path.join(ROOT, 'src');
const CONSTANTS_MODULE = 'src/raft/raft-committed-membership-constants.js';

function sourceFiles(directory = SRC) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(resolved);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [resolved] : [];
  });
}

// Source text without comments, so a mention in prose is no reader.
function codeOf(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
}

const FILES = sourceFiles().map((file) => ({
  relative: path.relative(ROOT, file).split(path.sep).join('/'),
  code: codeOf(file),
}));

function filesMatching(pattern, {outsideRaft = false} = {}) {
  return FILES.filter(({relative, code}) =>
    (!outsideRaft || !relative.startsWith('src/raft/')) &&
    pattern.test(code)).map(({relative}) => relative).sort();
}

test('T7: the committed-membership read has exactly two callers outside ' +
  'src/raft - the bootstrap read and the REPLACE completion witness', () => {
  assert.deepEqual(filesMatching(
    /RAFT_OPERATION\.READ_COMMITTED_MEMBERSHIP|\.readCommittedMembership\(/u,
    {outsideRaft: true}), [
    'src/node/replica-handler-committed-membership-methods.js',
    'src/partition/partition-service-raft-membership-administration.js',
  ]);
});

test('T7: no reader outside src/raft takes membership from a status ' +
  'confState; the remaining mentions carry the MEMBERSHIP_CHANGED wake-up ' +
  'as data', () => {
  assert.deepEqual(filesMatching(/\bconfState\b/u, {outsideRaft: true}), [
    // The port's MEMBERSHIP_CHANGED relayed as the partition's event.
    'src/partition/partition-service-raft-lifecycle-wiring.js',
    // The REPLACE owner's wake de-duplication key: a wake-up, never an
    // authority (it re-reads through the witness read).
    'src/rebalancer/operation-workflow-replace-owner-wake.js',
  ]);
  assert.deepEqual(filesMatching(/readStatus\(\)[^;]*\.confState/u,
    {outsideRaft: true}), [], 'nobody reads confState off a status');
});

test('T7: exactly two stamp origins - the leader\'s COMMITTED answer at ' +
  'creation and the provisioner\'s GENESIS founding set', () => {
  assert.deepEqual(filesMatching(/\bcommittedStampOfAnswer\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  ['src/rebalancer/committed-membership-bootstrap-read.js']);
  assert.deepEqual(filesMatching(/\bgenesisStamp\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  ['src/query/sql-query-engine-initial-partition-provisioning.js']);
  assert.deepEqual(filesMatching(/\bdurableRecordBootstrap\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  ['src/bootstrap/shared/durable-rejoin-partition-restore-planner.js'],
  'the one non-stamp bootstrap source (O4) has one origin');
});

test('T7: the stamp is carried, never re-derived: the set of files that ' +
  'touch it is the declared carrier set', () => {
  assert.deepEqual(filesMatching(
    /BOOTSTRAP_MEMBERSHIP\b|\bbootstrapMembership\b|bootstrap_membership/u), [
    // Producers.
    'src/query/sql-query-engine-initial-partition-provisioning.js',
    'src/rebalancer/committed-membership-bootstrap-read.js',
    'src/rebalancer/rebalance-coordinator-operation-creation.js',
    'src/bootstrap/shared/durable-rejoin-partition-restore-planner.js',
    // Carriers: the dispatch request, row rehydration (two readers), the
    // owner-port merge, the legacy lifecycle adapter.
    'src/control-plane/replica-dispatch-readiness-capture.js',
    'src/rebalancer/operation-workflow-dispatch-response-reconcile.js',
    'src/rebalancer/operation-workflow-owner-ports.js',
    'src/rebalancer/replica-operation-repository-row-methods.js',
    'src/node/replica-lifecycle-manager.js',
    // The target: request intake, validation, the partition, the port.
    'src/node/replica-handler-create-methods.js',
    'src/node/replica-handler-committed-membership-methods.js',
    'src/node/replica-handler-runtime-metadata-methods.js',
    'src/partition/partition-service-core-base.js',
    'src/partition/partition-service-raft-init-base.js',
    'src/raft/raft-rs-operation-port.js',
    // The field names' owners.
    'src/constants/fields.js',
    'src/raft/raft-provider-contract-constants.js',
    'src/rebalancer/replica-operation-constants.js',
    'src/rebalancer/replica-operation-progress.js',
  ].sort());
});

test('T7: the partition branch of the creation stamp reads no rows for ' +
  'membership - only the committed read feeds the stamp and its replica ' +
  'list', () => {
  const creation = FILES.find(({relative}) => relative ===
    'src/rebalancer/rebalance-coordinator-operation-creation.js').code;
  const branchStart = creation.indexOf(
    'if (entityType === SERVICE_TYPE.PARTITION) {');
  assert.ok(branchStart > 0, 'the partition branch exists');
  const branch = creation.slice(branchStart,
    creation.indexOf('\n    }\n', branchStart));
  assert.equal(branch.includes('buildReplicatedServiceBootstrapTopology'),
    false, 'no row-derived cohort in the partition branch');
  assert.match(branch, /readStamp: \(\) => readCommittedMembershipStamp\(/u);
  const read = FILES.find(({relative}) => relative ===
    'src/rebalancer/committed-membership-bootstrap-read.js').code;
  assert.match(read,
    /const bootstrapMembership = await readStamp\(\);\s*const replicaIds = replicaIdsOfStamp\(bootstrapMembership, targetReplicaId\);/u,
    'the stamp and its replica list come from the committed read alone');
});

test('T7: the boundary\'s values are imported from their owner, never ' +
  'written as literals elsewhere in src', () => {
  // Refusals, stamp defects and the gate's names are unique strings; the
  // bootstrap-source names ('committed', 'genesis') are ordinary words other
  // domains use, so for them the census looks for a hand-written kind.
  const values = [
    ...Object.values(COMMITTED_MEMBERSHIP_REFUSAL),
    ...Object.values(COMMITTED_MEMBERSHIP_STAMP_DEFECT),
    ...Object.values(PARTICIPATION_GATE),
  ];
  for (const value of values) {
    const quoted = new RegExp(`['"\`]${value}['"\`]`, 'u');
    assert.deepEqual(filesMatching(quoted).filter((file) =>
      file !== CONSTANTS_MODULE), [],
    `the value ${value} is written only by its owner`);
  }
  for (const kind of Object.values(BOOTSTRAP_MEMBERSHIP_SOURCE)) {
    const handWritten = new RegExp(`kind:\\s*['"\`]${kind}['"\`]`, 'u');
    assert.deepEqual(filesMatching(handWritten), [],
      `no stamp kind ${kind} is written by hand`);
  }
});

// Integration (I3): the REPLACE owner's witness reads - its target, and in a
// D2 target death the surviving members, source first - are ONE caller of the
// committed-membership read with different addressees: each goes through the
// READ_REPLICA_MEMBERSHIP message to that replica's handler, whose one
// reader is the port-backed witness read. No REPLACE module reads a port,
// a status or a row for membership on its own.
test('T7 (integration): the REPLACE target and surviving-member reads are ' +
  'the witness caller - one message, one handler reader, one port read',
() => {
  const replaceModules = FILES.filter(({relative}) =>
    /^src\/rebalancer\/(operation-workflow-replace|priority-publication-handoff)/u
      .test(relative));
  assert.deepEqual(replaceModules.filter(({code}) =>
    /READ_REPLICA_MEMBERSHIP/u.test(code)).map(({relative}) => relative),
  ['src/rebalancer/operation-workflow-replace-witness.js'],
  'one sender of the witness message');
  assert.deepEqual(replaceModules.filter(({code}) =>
    /\.readStatus\(|\.confState\b|READ_COMMITTED_MEMBERSHIP/u.test(code))
    .map(({relative}) => relative),
  // The MEMBERSHIP_CHANGED wake key only (declared above): a wake-up.
  ['src/rebalancer/operation-workflow-replace-owner-wake.js'],
  'no REPLACE module reads a port or a status itself');
  const surviving = FILES.find(({relative}) => relative ===
    'src/rebalancer/operation-workflow-replace-surviving-membership.js').code;
  assert.match(surviving, /readReplaceWitnessMembership\(owner, operation, member\)/u,
    'the surviving-member read is the witness read with another addressee');
  assert.equal(/messageRouter|\.deliver\(/u.test(surviving), false,
    'and has no delivery of its own');
  assert.deepEqual(filesMatching(/readPartitionReplicaMembership\(/u)
    .filter((file) => file !==
      'src/partition/partition-service-raft-membership-administration.js'),
  ['src/node/replica-handler-membership-methods.js'],
  'the witness message has one handler reader');
});
