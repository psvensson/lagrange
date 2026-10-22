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

test('T7: the committed-membership read has exactly three callers outside ' +
  'src/raft - the bootstrap read, the REPLACE completion witness and a ' +
  'message group\'s witness read of its own configuration', () => {
  assert.deepEqual(filesMatching(
    /RAFT_OPERATION\.READ_COMMITTED_MEMBERSHIP|\.readCommittedMembership\(/u,
    {outsideRaft: true}), [
    // R3: a message-group replica reads its applied ConfState only through
    // its own port's witness read.
    'src/message-group/message-group-consensus-port.js',
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

test('T7: the stamp origins - the leader\'s COMMITTED answer at creation, ' +
  'and the GENESIS founding sets of the provisioner and the seed', () => {
  assert.deepEqual(filesMatching(/\bcommittedStampOfAnswer\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  ['src/rebalancer/committed-membership-bootstrap-read.js']);
  assert.deepEqual(filesMatching(/\bgenesisStamp\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  [
    // V1a: the seed founds its system partitions from an explicit stamp.
    'src/bootstrap/phases/seed-partitions-phase.js',
    // R3: a message-group replica without a durable record founds its
    // group from the replica set it was created with.
    'src/message-group/message-group-consensus-port.js',
    'src/query/sql-query-engine-initial-partition-provisioning.js',
    // R4 (raft-rs-only cutover): a WASM service replica runs on its own raft-rs
    // port and, like a message group, founds a group without a durable
    // record from the replica set it was created with.
    'src/wasm-service/wasm-service-consensus-port.js',
  ]);
  assert.deepEqual(filesMatching(/\bdurableRecordBootstrap\(/u)
    .filter((file) => file !== 'src/raft/raft-committed-membership-stamp.js'),
  [
    'src/bootstrap/shared/durable-rejoin-partition-restore-planner.js',
    // V1a: a snapshot install's replacement reopens from its record.
    'src/raft/snapshot-catchup.js',
  ],
  'the one non-stamp bootstrap source (O4): a durable rejoin and a ' +
    'snapshot-install replacement');
});

test('T7: the stamp is carried, never re-derived: the set of files that ' +
  'touch it is the declared carrier set', () => {
  assert.deepEqual(filesMatching(
    /BOOTSTRAP_MEMBERSHIP\b|\bbootstrapMembership\b|bootstrap_membership/u), [
    // Producers.
    'src/message-group/message-group-consensus-port.js',
    // R4: the WASM service replica's genesis founding set (see above).
    'src/wasm-service/wasm-service-consensus-port.js',
    'src/query/sql-query-engine-initial-partition-provisioning.js',
    'src/rebalancer/committed-membership-bootstrap-read.js',
    'src/rebalancer/rebalance-coordinator-operation-creation.js',
    'src/bootstrap/shared/durable-rejoin-partition-restore-planner.js',
    'src/bootstrap/phases/seed-partitions-phase.js',
    'src/raft/snapshot-catchup.js',
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
    'src/raft/raft-operation-port-request.js',
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
  [
    'src/node/replica-handler-membership-methods.js',
    // F2: a retiring replica reads its own configuration to leave consensus
    // (the same witness read, addressed to itself; no REPLACE module).
    'src/node/replica-removal-consensus-exit.js',
  ],
  'the witness message has one handler reader');
});

// V1a (verification O1 round 1; round 2 F-4): a partition replica opens
// from a stamp or the durable-record bootstrap, and from nothing else.
// Every construction SITE of a partition service in src - every call
// expression, not every file - is declared here with how its bootstrap
// arrives; a new site (a new file, or a second site in a declared file)
// turns this red, and at runtime the port refuses a replica opened without
// one (STAMP_INVALID, MISSING), so a third origin fails visibly both ways.
// The method definition `async createJoinLocalPartitionService(` is not a
// site.
const PARTITION_CONSTRUCTION =
  /(?<!async )(?:new PartitionService|createPartitionService|createJoinLocalPartitionService)\(/gu;
const PARTITION_CONSTRUCTION_SITES = Object.freeze({
  // The seed founds its system partitions: an explicit GENESIS stamp.
  'src/bootstrap/phases/seed-partitions-phase.js': [
    /new PartitionService\(\{[\s\S]{0,600}?bootstrapMembership: genesisStamp\(options\.replicaIds\)/u,
  ],
  // The replica handler's create: the stamp it validated on arrival.
  'src/node/replica-handler-create-methods.js': [
    /this\.createPartitionService\(\{[\s\S]{0,900}?bootstrapMembership: context\.bootstrapMembership,/u,
  ],
  // A snapshot install's replacement: the durable-record bootstrap.
  'src/raft/snapshot-catchup.js': [
    /buildReplacementServiceOptions\(service\) \{[\s\S]{0,400}?bootstrapMembership: durableRecordBootstrap\(\)/u,
  ],
  // Factories: they forward their caller's options unchanged (the handler's
  // stamp, a durable rejoin's restore plan, a replacement's bootstrap).
  'src/bootstrap/bootstrap-service-replica-registration-methods.js': [
    /new PartitionService\(\{\s*\.\.\.options,/u,
  ],
  'src/bootstrap/node-joining-publication-activation.js': [
    // The handler setup's factory: the handler's options, forwarded.
    /this\.createJoinLocalPartitionService\(\{\.\.\.options, messageGroupService\}\)/u,
    // The join's own construction: its caller's options, forwarded.
    /new PartitionService\(\{\s*\.\.\.options,/u,
  ],
  'src/bootstrap/shared/snapshot-catchup-wiring.js': [
    // The catch-up wrapper: the wrapped factory's own options.
    /const service = await createPartitionService\(serviceOptions\)/u,
    // The replacement's factory: the handler's create with its options.
    /replicaHandler\.createPartitionService\(serviceOptions\)/u,
  ],
  // The durable-rejoin lifecycle: a restore plan (durableRecordBootstrap)
  // or the join options it queued, which are restore plans.
  'src/bootstrap/node-joining-message-group-runtime-delegation.js': [
    /directOptions \|\|\s*this\.resolveJoinReplicaOptions\(/u,
  ],
});

function constructionSitesOf(code) {
  return [...code.matchAll(PARTITION_CONSTRUCTION)].length;
}

test('V1a census: every partition-service construction site in src opens ' +
  'from a stamp or the durable-record bootstrap - counted per site, not ' +
  'per file', () => {
  const found = FILES.filter(({code}) => constructionSitesOf(code) > 0)
    .map(({relative}) => relative).sort();
  assert.deepEqual(found, Object.keys(PARTITION_CONSTRUCTION_SITES).sort(),
    'the files holding construction sites are the declared set');
  for (const [file, sites] of Object.entries(PARTITION_CONSTRUCTION_SITES)) {
    const {code} = FILES.find(({relative}) => relative === file);
    assert.equal(constructionSitesOf(code), sites.length,
      `${file}: every construction site is declared (${sites.length})`);
    for (const evidence of sites) {
      assert.match(code, evidence, `${file}: a site's bootstrap is declared`);
    }
  }
  assert.equal(Object.values(PARTITION_CONSTRUCTION_SITES).flat().length,
    FILES.reduce((sum, {code}) => sum + constructionSitesOf(code), 0),
    'the declared sites are all the sites in src');
});
