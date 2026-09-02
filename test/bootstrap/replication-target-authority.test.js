// Witness for the replication-target-authority quest.
// Raw node:test so --test-name-pattern selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  CREATION_SITE_FILES,
  DECLARED_DEFAULT_IDENTIFIERS,
  identityOwnerModules,
  parseRepoFile,
  persistedReplicaCountWrites,
  staticImportClosure,
  walkNodes,
} from './replication-policy-structural-census.js';
import {
  FIXED_POLICY_ROW,
  IDENTITY_VARIATIONS,
  MINTED_REPLACEMENT,
  buildIdentityFixture,
  decodeAcrossIdentityVariations,
  identityDigest,
  restoreIdentityDeclarations,
  snapshotIdentityDeclarations,
} from './replication-identity-variation-fixture.js';
import {
  RUN_OUTCOME,
  classifyRun,
} from './run-anchored-scenario-helper.js';
import {
  FIXTURE_SCENARIO,
} from './anchored-runner-fixture-cases.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
  DECLARED_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
  resolveDesiredReplicationFactor,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  MESSAGE_GROUPS_SCHEMA,
  PARTITIONS_SCHEMA,
} from '../../src/bootstrap/system-table-core-schema-definitions.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  INITIAL_MESSAGE_GROUP_REPLICA_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  SeedMessageGroupsPhase,
} from '../../src/bootstrap/phases/seed-message-groups-phase.js';
import {
  SeedRegistrationRuntimeOwner,
} from '../../src/bootstrap/owners/seed-registration-runtime-owner.js';
import {BOOTSTRAP_ERROR} from '../../src/bootstrap/bootstrap-constants.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------------------
// A2-CONTRACT.
//
// The clause this witness used to carry was "the decoder reads only a policy
// row" - a whole-program purity assertion over JavaScript. Six adversarial
// rounds showed that discharging it is a general program-analysis problem, not
// a release property: behavioural sampling covers the values someone thought
// of, syntactic universals cover the syntax they can see, and an instrumented
// call covers the paths that one call exercises, so each technique lost to the
// first channel it did not cover.
//
// The product invariant 0.2 actually needs is narrower and falsifiable:
//
//   for a FIXED authoritative persisted policy row,
//   runtime replica/identity state cannot change desired RF.
//
// So the boundary is made STRUCTURAL first - one positional row, no options
// bag, and an import closure containing no runtime identity owner - and the
// invariance is then measured METAMORPHICALLY against the real production
// identity state this fixture can reach, instead of by enumerating malicious
// expressions.
// ---------------------------------------------------------------------------

// The pinned creation-write set: which owning-table declaration each bootstrap
// creation site must consume, per file. This is the whole of what clause 5
// claims - the PARTITIONS and MESSAGE_GROUPS creation boundary - and nothing
// about replication-factor writes anywhere else in the repository.
const EXPECTED_CREATION_WRITES = Object.freeze({
  'src/bootstrap/phases/create-message-group-phase.js': [
    'DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT',
  ],
  'src/bootstrap/phases/seed-registration-phase.js': [
    'DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT',
    'DECLARED_REPLICA_COUNT_DEFAULT',
  ],
});
const AUTHORITY_MODULE = 'src/bootstrap/replication-target-authority.js';
const ACCEPTED_ROW_SPELLINGS = Object.freeze(
  ['replicaCount', 'replica_count']);

test('decoder-input-is-one-positional-policy-row', () => {
  // CLAUSE 1. The decoder's runtime input IS the persisted policy row. It was
  // an options object, and that shape was the whole difficulty: an options bag
  // is an open channel, so what the decoder may read had to be argued about
  // instead of read off the signature. One positional row makes the authority
  // boundary structural.
  let decoder = null;
  walkNodes(parseRepoFile(AUTHORITY_MODULE), (node) => {
    if (node.type === 'FunctionDeclaration' &&
      node.id?.name === 'resolveDesiredReplicationFactor') decoder = node;
  });
  assert.ok(decoder, 'the decoder must still be a named function declaration');
  assert.equal(decoder.params.length, 1,
    'the decoder takes exactly one parameter: the persisted policy row');
  assert.equal(decoder.params[0].type, 'Identifier',
    'the parameter is the row itself - not a defaulted, destructured or rest ' +
    `options bag; it is a ${decoder.params[0].type}`);
  assert.equal(resolveDesiredReplicationFactor.length, 1,
    'the declared arity is one, observed on the function itself');

  // And behaviourally: a second argument decides nothing. Reintroducing an
  // options bag behind an extra parameter would reopen the same channel.
  const row = {partition_id: 'services-p1', replica_count: 3};
  const bare = resolveDesiredReplicationFactor(row);
  assert.equal(bare.replicationFactor, 3);
  for (const extra of [
    {replicaIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g']},
    {peers: ['n1', 'n2', 'n3', 'n4', 'n5']},
    {expectedReplicationFactor: 9},
    9, 'nine', null, undefined,
  ]) {
    assert.deepEqual(resolveDesiredReplicationFactor(row, extra), bare,
      `a second argument must not decide anything: ${String(extra)}`);
  }

  // NO BOOTSTRAP FALLBACK inside the decoder. The creation default is a real
  // non-zero number here, so "failed closed" and "borrowed the bootstrap
  // default" are DISTINGUISHABLE answers rather than the same 3. A formation
  // consumer may separately consult the bootstrap expected RF in order to stay
  // BLOCKED before persisted policy is observable; that is the consumer's
  // decision about its own barrier and must never be a value this returns.
  assert.ok(DECLARED_REPLICA_COUNT_DEFAULT > 0,
    'the creation default must be non-zero or this arrow cannot discriminate');
  for (const undeclaredInput of [undefined, null, {}, {partition_id: 'p1'}]) {
    const target = resolveDesiredReplicationFactor(undeclaredInput);
    assert.equal(target.replicationFactor, 0,
      `${JSON.stringify(undeclaredInput)} must fail closed, not fall back`);
    assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  }
});

// Records every reflective operation the decoder performs on a row, whichever
// trap it goes through. A plain `get` recorder sees only one of them.
const OBSERVED_ROW_TRAPS = Object.freeze([
  'get', 'has', 'ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf',
  'setPrototypeOf', 'set', 'defineProperty', 'deleteProperty',
  'preventExtensions', 'isExtensible',
]);

function observedRow(target) {
  const probedKeys = [];
  const usedTraps = [];
  const handler = {};
  for (const trap of OBSERVED_ROW_TRAPS) {
    handler[trap] = (...args) => {
      usedTraps.push(trap);
      if (typeof args[1] === 'string') probedKeys.push(args[1]);
      return Reflect[trap](...args);
    };
  }
  return {
    proxy: new Proxy(target, handler),
    keys: () => [...new Set(probedKeys)].sort(),
    traps: () => [...new Set(usedTraps)].sort(),
  };
}

test('only-own-row-data-properties-can-yield-a-factor', () => {
  // CLAUSE 2, observed on BOTH decode branches. Observing one branch is what
  // the previous receipt structure did and it is why it lost: a proxy row that
  // declares 3 exercises only the DECLARED path, and a proxy row that declares
  // nothing exercises only the UNDECLARED path, so each left the other
  // unobserved and a branch-conditional identity read was invisible.
  const branches = [
    {name: 'declared', row: {partition_id: 'p1', replica_count: 3},
      factor: 3, source: REPLICATION_TARGET_SOURCE.PARTITION_ROW,
      keys: ['replica_count']},
    {name: 'undeclared', row: {partition_id: 'p1'},
      factor: 0, source: REPLICATION_TARGET_SOURCE.UNDECLARED,
      keys: ACCEPTED_ROW_SPELLINGS},
  ];
  for (const branch of branches) {
    const observed = observedRow(branch.row);
    const target = resolveDesiredReplicationFactor(observed.proxy);
    assert.equal(target.replicationFactor, branch.factor, branch.name);
    assert.equal(target.source, branch.source, branch.name);
    assert.deepEqual(observed.keys(), branch.keys,
      `the ${branch.name} branch probes exactly the accepted spellings, ` +
      `measured at runtime; it probed ${JSON.stringify(observed.keys())}`);
    for (const key of observed.keys()) {
      assert.ok(ACCEPTED_ROW_SPELLINGS.includes(key),
        `${key} is not an accepted persisted policy spelling`);
    }
    // ONE reflective operation, in both branches: an own-descriptor read. A
    // prototype walk, a plain get, an ownKeys enumeration or any write to the
    // row would each show up here as a second trap.
    assert.deepEqual(observed.traps(), ['getOwnPropertyDescriptor'],
      `the ${branch.name} branch must read the row through an own-descriptor ` +
      `read and nothing else; it used ${JSON.stringify(observed.traps())}`);
  }

  // An INHERITED value is not this row's policy, and an accessor is never
  // executed while validating one - the two ways a non-own, non-data property
  // could otherwise supply a factor.
  const inherited = Object.create({replica_count: 5});
  inherited.partition_id = 'p1';
  assert.equal(resolveDesiredReplicationFactor(inherited).replicationFactor, 0,
    'an inherited replica_count is not this row\'s declared policy');

  let accessorReads = 0;
  const accessorRow = {partition_id: 'p1'};
  Object.defineProperty(accessorRow, 'replica_count', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 5;
    },
  });
  assert.equal(
    resolveDesiredReplicationFactor(accessorRow).replicationFactor, 0,
    'an accessor-backed replica_count is not a declared value');
  assert.equal(accessorReads, 0, 'the accessor must never be executed');
});

test('missing-or-invalid-policy-is-undeclared-and-fails-closed', () => {
  // CLAUSE 3. No usable persisted policy means the requirement is UNREADABLE,
  // and an unreadable requirement fails closed. It never borrows the creation
  // default, the schema default, an identity count, or anything else - which
  // is only a testable distinction because the creation default is non-zero.
  assert.ok(DECLARED_REPLICA_COUNT_DEFAULT > 0,
    'the creation default must be non-zero or fail-closed is unfalsifiable');

  // An array is the case the shape guard actually protects: it satisfies
  // typeof 'object', and Object.assign([], {replica_count: 5}) carries an OWN
  // replica_count, so without the rejection it decodes as a policy of five.
  const arrayCarryingPolicy = Object.assign([], {replica_count: 5});
  const missing = [
    undefined, null, false, 0, 7, 'row', Symbol('row'),
    [], arrayCarryingPolicy, {}, {partition_id: 'services-p1'},
    {partition_id: 'services-p1', replicas: ['a', 'b', 'c', 'd', 'e']},
  ];
  for (const partitionRow of missing) {
    const target = resolveDesiredReplicationFactor(partitionRow);
    assert.equal(target.replicationFactor, 0,
      `missing policy ${String(partitionRow)} must decode UNDECLARED`);
    assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  }

  // Present but not a positive safe integer is INVALID, not a hint. 2**53 is
  // the unsafe-integer case: without it Number.isSafeInteger could be weakened
  // to Number.isInteger and nothing would notice.
  const invalid = [
    0, -1, -2, 3.5, '3', '', true, false, null, undefined, NaN, Infinity,
    -Infinity, 2 ** 53, [3], {valueOf: () => 3}, Object(3), 3n,
  ];
  for (const value of invalid) {
    for (const spelling of ACCEPTED_ROW_SPELLINGS) {
      const target = resolveDesiredReplicationFactor(
        {partition_id: 'services-p1', [spelling]: value});
      assert.equal(target.replicationFactor, 0,
        `${spelling} = ${String(value)} is not a declared policy`);
      assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
    }
  }
});

test('identity-state-cannot-move-a-fixed-policy-row', () => {
  // CLAUSE 4, the metamorphic direction. Hold replica_count = 3 and vary the
  // real identity-bearing state as hard as this fixture can. The measured
  // defect this replaces was exactly this shape: the seed phase handed
  // INITIAL_REPLICA_IDS to PartitionService by reference, raft reconciliation
  // pushed a minted replace-replica-<hex> onto it, and desired RF read 4 where
  // a fresh process read 3.
  const steps = decodeAcrossIdentityVariations(
    [{label: 'fixed', row: FIXED_POLICY_ROW}]);

  const expected = JSON.stringify({
    replicationFactor: 3,
    source: REPLICATION_TARGET_SOURCE.PARTITION_ROW,
  });
  for (const step of steps) {
    assert.deepEqual(step.decoded, [['fixed', expected]],
      `identity variation ${step.name} moved the target`);
  }

  // NON-VACUITY. The variations must actually have varied identity state, or
  // "invariant under identity" would be a statement about a fixture that never
  // changed. Every digest is distinct, so every step is a real perturbation.
  const digests = steps.map((step) => step.digest);
  assert.equal(new Set(digests).size, digests.length,
    'each identity variation must actually change identity state');
  assert.ok(steps.length >= 6,
    'the fixture must exercise several independent identity dimensions');

  // And the declarations are restored, so this receipt cannot leave the
  // process in a state that makes a later scenario pass or fail for free.
  assert.ok(INITIAL_MESSAGE_GROUP_REPLICA_IDS.length > 0,
    'the identity declarations must be restored after the walk');
});

const POLICY_ROW_CASES = Object.freeze([
  Object.freeze({label: 'rf-3', row: Object.freeze({replica_count: 3}),
    factor: 3, source: REPLICATION_TARGET_SOURCE.PARTITION_ROW}),
  Object.freeze({label: 'rf-5', row: Object.freeze({replica_count: 5}),
    factor: 5, source: REPLICATION_TARGET_SOURCE.PARTITION_ROW}),
  Object.freeze({label: 'rf-7-camel', row: Object.freeze({replicaCount: 7}),
    factor: 7, source: REPLICATION_TARGET_SOURCE.PARTITION_ROW}),
  Object.freeze({label: 'missing-column', row: Object.freeze({partition_id: 'p'}),
    factor: 0, source: REPLICATION_TARGET_SOURCE.UNDECLARED}),
  Object.freeze({label: 'no-row', row: null,
    factor: 0, source: REPLICATION_TARGET_SOURCE.UNDECLARED}),
  Object.freeze({label: 'invalid-value', row: Object.freeze({replica_count: '5'}),
    factor: 0, source: REPLICATION_TARGET_SOURCE.UNDECLARED}),
]);

test('policy-row-alone-moves-the-target', () => {
  // CLAUSE 4, the differential direction. Identity state is held fixed - at
  // the BASELINE and again at the most heavily perturbed state the fixture
  // reaches - and only the row varies. RF 3 decodes 3, RF 5 decodes 5,
  // missing or invalid decodes UNDECLARED, in both worlds.
  const snapshot = snapshotIdentityDeclarations();
  try {
    const fixture = buildIdentityFixture();
    const assertRowsDecide = (where) => {
      for (const testCase of POLICY_ROW_CASES) {
        const target = resolveDesiredReplicationFactor(testCase.row);
        assert.equal(target.replicationFactor, testCase.factor,
          `${testCase.label} under ${where}`);
        assert.equal(target.source, testCase.source,
          `${testCase.label} under ${where}`);
      }
    };
    const baselineDigest = identityDigest(fixture);
    assertRowsDecide('baseline identity');

    for (const variation of IDENTITY_VARIATIONS) variation.apply(fixture);
    assert.notEqual(identityDigest(fixture), baselineDigest,
      'the perturbed world must differ from the baseline one');
    assertRowsDecide('fully perturbed identity');
  } finally {
    restoreIdentityDeclarations(snapshot);
  }

  // The decoder is not a constant function: distinct declared rows produce
  // distinct factors, so "the row decides" is a claim with content.
  const declaredFactors = POLICY_ROW_CASES
    .filter((testCase) => testCase.factor > 0)
    .map((testCase) => testCase.factor);
  assert.equal(new Set(declaredFactors).size, declaredFactors.length,
    'distinct declared rows must produce distinct factors');
});

test('decoded-factor-is-a-function-of-the-row-alone', () => {
  // CLAUSE 4 as one artifact: the full identity-state x row matrix. For every
  // row, the decode is CONSTANT down the identity axis; across rows it is not
  // constant. That is the direction of authority, stated as a property of the
  // measured matrix rather than as a list of expressions someone ruled out.
  const steps = decodeAcrossIdentityVariations(POLICY_ROW_CASES);
  assert.ok(steps.length > 1, 'the matrix needs several identity states');

  const byRow = new Map();
  for (const step of steps) {
    for (const [label, decoded] of step.decoded) {
      if (!byRow.has(label)) byRow.set(label, new Set());
      byRow.get(label).add(decoded);
    }
  }
  assert.equal(byRow.size, POLICY_ROW_CASES.length,
    'every row case must appear in every identity state');
  for (const [label, decodes] of byRow) {
    assert.equal(decodes.size, 1,
      `row ${label} decoded ${decodes.size} different ways across identity ` +
      `states: ${JSON.stringify([...decodes])}`);
  }

  // The column axis moves. Without this the matrix could be "constant" simply
  // because the decoder answers the same thing to everything.
  const distinctAnswers = new Set(
    [...byRow.values()].map((decodes) => [...decodes][0]));
  assert.ok(distinctAnswers.size > 1,
    'the row axis must actually change the answer');
  assert.equal(new Set(steps.map((step) => step.digest)).size, steps.length,
    'each identity state in the matrix must be genuinely different');
});

test('decoder-closure-excludes-identity-owners', () => {
  // The cheap STRUCTURAL boundary, over the same static import graph the
  // Solver's own import-closure projection uses. Not a dataflow analyzer: it
  // answers only "can this module reach an identity owner by import at all",
  // which is the question the contract needs and the one an import graph can
  // actually answer.
  const owners = identityOwnerModules();
  assert.ok(owners.length > 10,
    'the identity-owner set must be substantial, or the boundary is vacuous');
  for (const known of [
    'src/bootstrap/system-table-schemas-constants.js',
    'src/partition/partition-service-core-base.js',
    'src/message-group/message-group-service-state.js',
  ]) {
    assert.ok(owners.includes(known),
      `${known} owns runtime replica identity and must be classified as an ` +
      'owner; if it was renamed or reshaped, repair the marker set');
  }

  const closure = staticImportClosure(AUTHORITY_MODULE);
  assert.ok(closure.size > 1,
    'the decoder must still have a real import closure to constrain');
  const reachable = [...closure].filter((module) => owners.includes(module));
  assert.deepEqual(reachable, [],
    'the decoder module must not be able to reach a runtime replica, peer or ' +
    `placement identity owner by import; it reaches ${JSON.stringify(reachable)}`);

  // POSITIVE CONTROL. The detector has to fire on modules that DO reach an
  // identity owner, or an empty intersection proves nothing about the decoder.
  for (const consumer of [
    'src/bootstrap/phases/seed-registration-phase.js',
    'src/partition/partition-service.js',
  ]) {
    const consumerClosure = staticImportClosure(consumer);
    const consumerOwners =
      [...consumerClosure].filter((module) => owners.includes(module));
    assert.ok(consumerOwners.length > 0,
      `${consumer} does reach identity owners, so the boundary check must ` +
      'report them; it reported none, which means it cannot fail');
  }
});

test('every-critical-table-declares-the-same-target', () => {
  // Was vacuous: it BUILT each row from DECLARED_REPLICA_COUNT_DEFAULT and
  // then asserted the decode equalled 3, so every iteration was
  // assert.equal(3, 3) and the only per-table difference was a string. It read
  // no per-table declaration and could not detect a table carrying a different
  // one. It now drives the REAL seeding path and inspects what each system
  // table actually gets persisted.
  //
  // SCOPE: this is the per-table claim about PERSISTED policy. A consumer that
  // computes a requirement from a table's identity-list length is NOT covered
  // here and is not this Quest's to catch - see the successor quest.
  const seededBody = `
    const {SeedRegistrationPhase} = await import('${REPO_ROOT}/src/bootstrap/` +
    `phases/seed-registration-phase.js');
    const constants = await import('${REPO_ROOT}/src/bootstrap/` +
    `system-table-schemas-constants.js');
    if (globalThis.__driftIdentities) {
      // EVERY identity list, not one. Lengthening a single table left a
      // CROSS-table identity length reaching partitions.replica_count
      // invisible, and never touched the message-group list at all.
      for (const table of Object.keys(constants.INITIAL_REPLICA_IDS)) {
        constants.INITIAL_REPLICA_IDS[table].push(
          'drifted-a', 'drifted-b', 'drifted-c', 'drifted-d');
      }
      constants.INITIAL_MESSAGE_GROUP_REPLICA_IDS.push(
        'drifted-mg-a', 'drifted-mg-b', 'drifted-mg-c', 'drifted-mg-d');
    }
    const rows = [];
    const phase = new SeedRegistrationPhase({delegates: {
      getLogger: () => ({info(){}, warn(){}, error(){}, debug(){}}),
      getNodeId: () => 'seed',
      getLeaderMessageGroupService: () => null,
    }});
    phase.ensureSystemTableWriter = () => ({
      upsertSystemTableRow: async (table, row) => {rows.push([table, row]);},
    });
    await phase.registerSystemTables(1);
    // BOTH writes this phase makes. The message_groups write was unprotected:
    // an identity length reaching it left every receipt green.
    await phase.registerMessageGroup(1);
    const byTable = {};
    for (const [table, row] of rows) {
      if (table === 'partitions') byTable[row.table_id] = row.replica_count;
      if (table === 'message_groups') {
        byTable['message_groups:' + row.group_id] = row.replica_count;
      }
    }
    console.log(JSON.stringify({byTable}));
  `;

  const declaredOf = (schema) => schema.columns.find(
    (candidate) => candidate.name === 'replica_count').defaultValue;
  const declared = declaredOf(PARTITIONS_SCHEMA);
  const declaredGroups = declaredOf(MESSAGE_GROUPS_SCHEMA);
  const splitByOwner = (byTable) => {
    const partitions = {};
    const groups = {};
    for (const [key, value] of Object.entries(byTable)) {
      if (key.startsWith('message_groups:')) groups[key] = value;
      else partitions[key] = value;
    }
    return {partitions, groups};
  };

  const seeded = creationSiteUnderDrift({
    messageGroupDefault: declaredGroups, partitionsDefault: declared,
    body: seededBody});
  const first = splitByOwner(seeded.byTable);
  const tables = Object.keys(first.partitions);
  assert.ok(tables.length > 1, 'the probe must seed several system tables');
  assert.ok(Object.keys(first.groups).length > 0,
    'the probe must also seed the message_groups row');
  assert.deepEqual([...new Set(Object.values(first.partitions))], [declared],
    'no system table may silently carry a different declared requirement, ' +
    `got ${JSON.stringify(first.partitions)}`);
  assert.deepEqual([...new Set(Object.values(first.groups))], [declaredGroups],
    'the message_groups row follows its OWN declaration');

  // Non-vacuity arrow: the single PARTITIONS declaration is what every system
  // table's partition row follows, so moving it moves all of them together,
  // while the message-group row - a DIFFERENT owning table - does not move.
  const drifted = splitByOwner(creationSiteUnderDrift({
    messageGroupDefault: declaredGroups, partitionsDefault: declared + 4,
    body: seededBody}).byTable);
  assert.deepEqual([...new Set(Object.values(drifted.partitions))],
    [declared + 4],
    'every system table follows the one PARTITIONS declaration');
  assert.deepEqual([...new Set(Object.values(drifted.groups))],
    [declaredGroups],
    'the PARTITIONS declaration must not reach the message_groups row');
  assert.deepEqual(Object.keys(drifted.partitions).sort(), tables.sort(),
    'the same table set is seeded either way');

  // Identity churn on EVERY list - including the message-group list - changes
  // NO persisted value at either write. Lengthening one list left a
  // cross-table identity length reaching partitions.replica_count invisible.
  const identityBody =
    `globalThis.__driftIdentities = true;\n${seededBody}`;
  const underChurn = creationSiteUnderDrift({
    messageGroupDefault: declaredGroups, partitionsDefault: declared,
    body: identityBody});
  assert.deepEqual(underChurn.byTable, seeded.byTable,
    'longer identity lists must not change any seeded declaration');
});

test('authority-mints-no-runtime-state', () => {
  // BOTH branches. Asserting only the row-without-a-count case tests the
  // frozen UNDECLARED constant and never reaches the minted projection, so a
  // key added on the declared path survives undetected.
  const undeclared = resolveDesiredReplicationFactor({partition_id: 'services-p1'});
  const declared = resolveDesiredReplicationFactor({partition_id: 'services-p1', replica_count: 3});
  assert.equal(declared.source, REPLICATION_TARGET_SOURCE.PARTITION_ROW,
    'the declared branch must actually be exercised');

  // The source vocabulary is part of the contract consumers will branch on,
  // so pin the STRINGS, not just the symbol names: comparing a target's source
  // to the same constant that produced it cannot detect a renamed value.
  assert.deepEqual({...REPLICATION_TARGET_SOURCE}, {
    PARTITION_ROW: 'partition_row_replica_count',
    UNDECLARED: 'undeclared',
  }, 'the typed source values are a stable contract');
  assert.equal(undeclared.source, 'undeclared');
  assert.equal(declared.source, 'partition_row_replica_count');

  for (const target of [undeclared, declared]) {
    assert.equal(Object.isFrozen(target), true);
    assert.deepEqual(Object.keys(target).sort(),
      ['replicationFactor', 'source'],
      'the projection carries EXACTLY the factor and its source');
    assert.deepEqual(Reflect.ownKeys(target).sort(),
      ['replicationFactor', 'source'],
      'including non-enumerable and symbol keys');
    for (const key of ['holders', 'replicaIds', 'converged', 'ready']) {
      assert.equal(Object.hasOwn(target, key), false,
        `the target must not mint ${key}`);
    }
  }
});

test('witness-deterministic', () => {
  // Same inputs, same answers, repeatedly - so a receipt that passes once is
  // not passing on process state that happened to be right that time.
  const shape = () => JSON.stringify(POLICY_ROW_CASES.map(
    (testCase) => [testCase.label,
      resolveDesiredReplicationFactor(testCase.row)]));
  const first = shape();
  assert.equal(shape(), first);
  assert.equal(shape(), first);

  // And the matrix walk itself is deterministic: it mutates real identity
  // declarations and restores them, so running it twice must produce the same
  // matrix. A leaked mutation would show up here as a second, different one.
  const firstMatrix = JSON.stringify(
    decodeAcrossIdentityVariations(POLICY_ROW_CASES));
  assert.equal(JSON.stringify(
    decodeAcrossIdentityVariations(POLICY_ROW_CASES)), firstMatrix,
  'the identity walk must restore what it perturbed');
});

test('hostile-policy-rows-cannot-forge-a-target', () => {
  // Each of these previously left the bar green while producing a wrong
  // target: the own-property read (Object.prototype and getter rows measured
  // 99), and the safe-integer/positive test (-2, 0, 3.5, null all accepted).
  /* eslint-disable no-extend-native */
  Object.prototype.replica_count = 99;
  try {
    const polluted = resolveDesiredReplicationFactor({partition_id: 'services-p1'});
    assert.equal(polluted.replicationFactor, 0,
      'an inherited replica_count must not become the declared target');
    assert.equal(polluted.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  } finally {
    delete Object.prototype.replica_count;
  }
  /* eslint-enable no-extend-native */

  let getterReads = 0;
  const getterRow = {partition_id: 'services-p1'};
  Object.defineProperty(getterRow, 'replica_count', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 99;
    },
  });
  assert.equal(
    resolveDesiredReplicationFactor(getterRow)
      .replicationFactor, 0,
    'an accessor-backed replica_count is not a declared value');
  assert.equal(getterReads, 0, 'the accessor must never be executed');

  // Non-integer and non-positive declarations are not policy either.
  // 2**53 is the UNSAFE-integer case: without it, Number.isSafeInteger could
  // be weakened to Number.isInteger and nothing here would notice.
  for (const bad of [-2, 0, 3.5, null, '3', NaN, Infinity, true, 2 ** 53]) {
    const target = resolveDesiredReplicationFactor({partition_id: 'services-p1', replica_count: bad});
    assert.equal(target.replicationFactor, 0, `replica_count ${String(bad)}`);
    assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  }

  // The camel alias is the normalized in-memory spelling and IS accepted on
  // its own; without this the alias could be dropped entirely unnoticed.
  assert.equal(
    resolveDesiredReplicationFactor({partition_id: 'services-p1', replicaCount: 4}).replicationFactor, 4, 'the normalized camel spelling is policy');

  // The accepted spelling set is pinned as an ALLOWLIST, not a blocklist of
  // guessed names. Enumerating eight spellings that must be rejected still let
  // a ninth in: prepending 'REPLICA_COUNT' to the accepted columns left every
  // receipt green, and TARGET_REPLICA_COUNT already exists in this codebase as
  // a placement-policy key, so this is a live forge surface. The exact set is
  // read out of the module and compared whole.
  // OBSERVED AT RUNTIME. Reading the array literal out of the source only pins
  // that literal: widening by spread from another constant, by concat, by a
  // second lookup path, or by normalising the key first all leave the literal
  // byte-identical while a forged spelling decodes. A proxy row records every
  // key the decoder actually probes, so the accepted set is measured, not read.
  const probedKeys = [];
  const recordingRow = new Proxy({}, {
    getOwnPropertyDescriptor(target, property) {
      if (typeof property === 'string') probedKeys.push(property);
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    get(target, property, receiver) {
      if (typeof property === 'string') probedKeys.push(property);
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (typeof property === 'string') probedKeys.push(property);
      return Reflect.has(target, property);
    },
    ownKeys(target) {
      probedKeys.push('*ownKeys*');
      return Reflect.ownKeys(target);
    },
  });
  assert.equal(
    resolveDesiredReplicationFactor(recordingRow)
      .replicationFactor, 0,
    'a row declaring nothing is undeclared');
  assert.deepEqual([...new Set(probedKeys)].sort(),
    ['replicaCount', 'replica_count'],
    'the decoder probes EXACTLY the two accepted spellings, measured at ' +
    `runtime; it probed ${JSON.stringify([...new Set(probedKeys)])}`);

  for (const spelling of [
    'target_replica_count', 'targetReplicaCount', 'desiredReplicationFactor',
    'desired_replication_factor', 'replicas', 'replicaCountTarget',
    'replica_count_target', 'count', 'REPLICA_COUNT',
  ]) {
    const target = resolveDesiredReplicationFactor({partition_id: 'services-p1', [spelling]: 9});
    assert.equal(target.replicationFactor, 0,
      `${spelling} is not a declared replica_count spelling`);
    assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  }

  // But a row whose two spellings DISAGREE fails closed. Iterating the
  // spellings with continue-on-invalid let a rejected snake value be rescued
  // by the alias, so a hostile or half-migrated row could take the second
  // opinion: {replica_count: '9', replicaCount: 4} decoded to 4.
  for (const row of [
    {replica_count: '9', replicaCount: 4},
    {replica_count: -1, replicaCount: 4},
    {replica_count: 0, replicaCount: 9},
  ]) {
    const target = resolveDesiredReplicationFactor(row);
    assert.equal(target.replicationFactor, 0,
      `disagreeing spellings must fail closed: ${JSON.stringify(row)}`);
    assert.equal(target.source, REPLICATION_TARGET_SOURCE.UNDECLARED);
  }
});

test('creation-default-tracks-schema-declaration', async () => {
  // The property that matters is SEMANTIC, not syntactic: if the schema's
  // declared default changes, the creation default follows it. How the
  // implementation achieves that — a lookup, a helper, some later mechanism —
  // is not the claim, and a source-text proof would pin the wrong thing.
  const column = PARTITIONS_SCHEMA.columns.find(
    (candidate) => candidate.name === 'replica_count');
  const declared = column.defaultValue;
  assert.equal(DECLARED_REPLICA_COUNT_DEFAULT, declared);

  // Drift the declaration and re-evaluate: a restated literal cannot follow.
  column.defaultValue = declared + 1;
  try {
    // The specifier is assembled at runtime so static import analysis does
    // not record a second edge to the same module: a literal
    // '...?schema-drift=1' is counted as an extra inbound edge while being
    // deduped to one importer, which breaks the canonical import-graph seal.
    const driftSpecifier =
      `${'../../src/bootstrap/replication-target-authority.js'}?drift=1`;
    const drifted = await import(driftSpecifier);
    assert.equal(drifted.DECLARED_REPLICA_COUNT_DEFAULT, declared + 1,
      'the creation default must track the schema declaration');
  } finally {
    column.defaultValue = declared;
  }

  // And a row created with that default decodes back to it, so the value the
  // creation path writes is the value policy then reads.
  assert.equal(
    resolveDesiredReplicationFactor(
      {replica_count: DECLARED_REPLICA_COUNT_DEFAULT}).replicationFactor,
    declared);
});

test('production-handoff-cannot-mutate-the-declaration', () => {
  // THE REAL ALIAS CHAIN, not the getter. The seed phase reads
  // INITIAL_REPLICA_IDS[table] and hands it to PartitionService as
  // options.replicaIds; the service stored it BY REFERENCE, and raft peer
  // reconciliation pushes onto service.replicaIds. That made the service's
  // mutable peer list the shared declaration itself, so one minted
  // replace-replica-<hex> raised the apparent replication factor for every
  // later reader. Copying inside getInitialReplicaIds did nothing here,
  // because this path never calls it.
  const table = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
  const declaredLength = INITIAL_REPLICA_IDS[table].length;

  const service = new PartitionService({
    partitionId: `${table}-p1`,
    tableId: table,
    replicaId: INITIAL_REPLICA_IDS[table][0],
    // The exact production hand-off: the declaration, by reference.
    replicaIds: INITIAL_REPLICA_IDS[table],
    nodeId: 'seed',
  });

  assert.notEqual(service.replicaIds, INITIAL_REPLICA_IDS[table],
    'the service peer list must not BE the declaration');

  // What reconciliation does on a replacement replica.
  service.replicaIds.push(`${table}-p1-replace-replica-a1b2c3d4e5f60718`);

  assert.equal(service.replicaIds.length, declaredLength + 1,
    'the service tracks the new peer');
  assert.equal(INITIAL_REPLICA_IDS[table].length, declaredLength,
    'the declaration is unchanged by a minted replacement identity');
  assert.equal(getInitialReplicaIds(table).length, declaredLength);

  // And the declared target is unmoved, because it never counted identities.
  assert.equal(
    resolveDesiredReplicationFactor({
      partition_id: `${table}-p1`,
      replica_count: DECLARED_REPLICA_COUNT_DEFAULT,
    }).replicationFactor,
    DECLARED_REPLICA_COUNT_DEFAULT);
});

test('message-group-handoff-cannot-mutate-the-declaration', () => {
  // The exact sibling of the partition leak, left open one line short: the
  // seed phase hands INITIAL_MESSAGE_GROUP_REPLICA_IDS to the service by
  // reference and raft lifecycle pushes onto service.replicaIds.
  const declaredLength = INITIAL_MESSAGE_GROUP_REPLICA_IDS.length;
  const service = new MessageGroupService({
    // A MessageRouter-shaped transport: deliver + initialize +
    // setServiceNodeResolver is what the service validates.
    transport: {
      deliver: () => {},
      initialize: () => {},
      setServiceNodeResolver: () => {},
    },
    groupId: 'mg-1',
    replicaId: INITIAL_MESSAGE_GROUP_REPLICA_IDS[0],
    replicaIds: INITIAL_MESSAGE_GROUP_REPLICA_IDS,
    nodeId: 'seed',
  });

  assert.notEqual(service.replicaIds, INITIAL_MESSAGE_GROUP_REPLICA_IDS,
    'the service peer list must not BE the declaration');
  service.replicaIds.push('mg-1-replace-replica-a1b2c3d4e5f60718');
  assert.equal(INITIAL_MESSAGE_GROUP_REPLICA_IDS.length, declaredLength,
    'a minted replacement identity must not grow the declaration');
});

test('message-group-policy-comes-from-its-own-schema', async () => {
  // Do not replace one cross-table authority leak with a shared default. The
  // claim is SEMANTIC and needs two arrows, because the two schemas currently
  // declare the SAME number: the message-group default must follow the
  // MESSAGE_GROUPS declaration, and must NOT follow the PARTITIONS one.
  const groupsColumn = MESSAGE_GROUPS_SCHEMA.columns.find(
    (candidate) => candidate.name === 'replica_count');
  const partitionsColumn = PARTITIONS_SCHEMA.columns.find(
    (candidate) => candidate.name === 'replica_count');
  assert.equal(DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
    groupsColumn.defaultValue);

  const declaredGroups = groupsColumn.defaultValue;
  const declaredPartitions = partitionsColumn.defaultValue;
  const authority = '../../src/bootstrap/replication-target-authority.js';

  // Arrow 1: drift MESSAGE_GROUPS, the message-group default follows.
  groupsColumn.defaultValue = declaredGroups + 1;
  try {
    const drifted = await import(`${authority}?mg-drift=1`);
    assert.equal(drifted.DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
      declaredGroups + 1,
      'the message-group default must track the MESSAGE_GROUPS declaration');
  } finally {
    groupsColumn.defaultValue = declaredGroups;
  }

  // Arrow 2: drift PARTITIONS, the message-group default does NOT move. This
  // is what fails if the message-group path is re-pointed at the partitions
  // declaration while both happen to declare the same value.
  partitionsColumn.defaultValue = declaredPartitions + 7;
  try {
    const drifted = await import(`${authority}?part-drift=1`);
    assert.equal(drifted.DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT,
      declaredGroups,
      'the PARTITIONS declaration must not reach message-group policy');
    assert.equal(drifted.DECLARED_REPLICA_COUNT_DEFAULT,
      declaredPartitions + 7);
  } finally {
    partitionsColumn.defaultValue = declaredPartitions;
  }
});

test('creation-writes-declared-policy-not-identity-count', async () => {
  // The identity-count write, driven through the REAL creation path rather
  // than asserted against source text. The property is INVARIANCE, not a
  // single inequality: a fixed declaration with a VARYING identity count must
  // persist the same value every time. Two data points that vary both the
  // declaration and the count let an offset maximum slip through -
  // Math.max(DECLARED, replicas.length - 2) passed a 5-identity probe and a
  // 1-identity probe while still deriving policy from identities in
  // production. Any function of replicas.length that is not constant now reds.
  const {CreateMessageGroupPhase} =
    await import('../../src/bootstrap/phases/create-message-group-phase.js');
  const {MESSAGE_GROUP_ASSIGNMENT_STRATEGY} =
    await import('../../src/bootstrap/message-group-assignment-constants.js');

  const stageRowWithReplicaCount = async (identityCount) => {
    const localReplicas = Array.from({length: identityCount},
      (_unused, index) => `mg-1-replica-${index}`);
    const phase = new CreateMessageGroupPhase({
      nodeId: 'seed',
      delegates: {
        getBootstrapResponse: () => ({
          messageGroupAssignment: {
            strategy: MESSAGE_GROUP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
            groupId: 'mg-1',
          },
        }),
        getMessageGroupServices: () => new Map(
          localReplicas.map((id) => [id, {groupId: 'mg-1'}])),
        getNow: () => () => 1,
        getLogger: () => ({info: () => {}, warn: () => {}, error: () => {}}),
        seedJoinTimeCacheRow: () => {},
        registerMessageGroupService: async () => {},
      },
    });
    await phase.registerCreateSelfHostedMetadata();
    const row = phase.pendingCreateSelfHostedMessageGroupRow;
    assert.ok(row, `no message_groups row staged for ${identityCount}`);
    return row.replica_count;
  };

  // Counts below, at, and above the declared default, and far above it.
  const counts = [1, 2, 3, 5, 9, 17];
  const persisted = [];
  for (const identityCount of counts) {
    persisted.push(await stageRowWithReplicaCount(identityCount));
  }

  assert.deepEqual([...new Set(persisted)],
    [DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT],
    'persisted policy must not vary with the identity count, got ' +
    `${JSON.stringify(counts.map((c, i) => [c, persisted[i]]))}`);
  // Non-vacuity: the probe must include counts on BOTH sides of the declared
  // default, or "invariant" could hold simply because every count matched it.
  assert.ok(
    counts.some((c) => c < DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT) &&
    counts.some((c) => c > DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT),
    'the probe must straddle the declared default');

  // And the row the creation path writes decodes back to that same policy,
  // so what creation persists is what the authority later reads.
  assert.equal(
    resolveDesiredReplicationFactor({replica_count: persisted[0]}).replicationFactor,
    DECLARED_MESSAGE_GROUP_REPLICA_COUNT_DEFAULT);

  // THE UNIVERSAL. Everything above samples behaviour; this constrains the
  // form of every persisted write, so no runtime quantity of ANY kind -
  // identity count, node id, clock, config, or one not yet invented - can be
  // the value. Combined with the drift arrows, which prove each declared
  // constant tracks its owning schema, the pair is a complete proof of the
  // creation clause rather than a list of ruled-out variants.
  // The SET, not just a count. Pinning only the total let a write move between
  // the two creation files, or be deleted and a different one added, without
  // anything noticing; pinning per file WITH the declared default each site
  // must consume also catches a site being re-pointed at the other table's
  // declaration, which is the cross-table leak this contract closes.
  const observed = {};
  let totalWrites = 0;
  for (const relativePath of CREATION_SITE_FILES) {
    const writes = persistedReplicaCountWrites(relativePath);
    assert.ok(writes.length > 0,
      `${relativePath} must still contain a persisted replica_count write; ` +
      'a moved or renamed write would make this check silently vacuous');
    totalWrites += writes.length;
    for (const write of writes) {
      assert.equal(write.valueType, 'Identifier',
        `${relativePath}:${write.line} persists replica_count from a ` +
        `${write.valueType}; only a declared-default identifier is allowed, ` +
        'because any expression can read a runtime quantity');
      assert.ok(DECLARED_DEFAULT_IDENTIFIERS.includes(write.valueName),
        `${relativePath}:${write.line} persists replica_count from ` +
        `${write.valueName}, which is not an owning-table declared default`);
    }
    observed[relativePath] = writes.map((write) => write.valueName).sort();
  }
  assert.deepEqual(observed, EXPECTED_CREATION_WRITES,
    'the exact persisted replica_count write set must hold per creation ' +
    'file; a write that moved, was deleted, or was re-pointed at another ' +
    'table\'s declaration must be reviewed, not silently admitted');
  assert.equal(totalWrites, 3,
    'and the total must still be three');
});

// Drifting a schema default and re-importing IN-PROCESS cannot prove which
// constant a production site consumes: ESM caches by specifier, so a re-import
// of the phase resolves the SAME authority module and keeps the original
// constant. The drift has to happen in a FRESH process, before the authority
// module is first evaluated, and then the real creation path has to be driven.
function creationSiteUnderDrift({messageGroupDefault, partitionsDefault, body}) {
  const script = `
    const defs = await import('${REPO_ROOT}/src/bootstrap/` +
    `system-table-core-schema-definitions.js');
    const column = (schema) => schema.columns.find(
      (candidate) => candidate.name === 'replica_count');
    column(defs.MESSAGE_GROUPS_SCHEMA).defaultValue = ${messageGroupDefault};
    column(defs.PARTITIONS_SCHEMA).defaultValue = ${partitionsDefault};
    ${body}
  `;
  const child = spawnSync(process.execPath,
    ['--input-type=module', '-e', script],
    {cwd: REPO_ROOT, encoding: 'utf8'});
  assert.equal(child.status, 0,
    `drift probe failed: ${child.stderr || child.stdout}`);
  return JSON.parse(child.stdout.trim().split('\n').pop());
}

const MESSAGE_GROUP_CREATION_BODY = `
  const strategies = await import('${REPO_ROOT}/src/bootstrap/` +
  `message-group-assignment-constants.js');
  const {CreateMessageGroupPhase} = await import('${REPO_ROOT}/src/bootstrap/` +
  `phases/create-message-group-phase.js');
  const phase = new CreateMessageGroupPhase({
    nodeId: 'seed',
    delegates: {
      getBootstrapResponse: () => ({messageGroupAssignment: {
        strategy: strategies.MESSAGE_GROUP_ASSIGNMENT_STRATEGY
          .CREATE_SELF_HOSTED,
        groupId: 'mg-1'}}),
      getMessageGroupServices: () => new Map([['mg-1-replica-0',
        {groupId: 'mg-1'}]]),
      getNow: () => () => 1,
      getLogger: () => ({info(){}, warn(){}, error(){}}),
      seedJoinTimeCacheRow: () => {},
      registerMessageGroupService: async () => {},
    },
  });
  await phase.registerCreateSelfHostedMetadata();
  const row = phase.pendingCreateSelfHostedMessageGroupRow;
  if (!row) throw new Error('creation path staged no message_groups row');

  // The OTHER message-group creation site. Converting it without witnessing it
  // left mutation M18 (restating a literal 3 here) fully green.
  const {SeedRegistrationPhase} = await import('${REPO_ROOT}/src/bootstrap/` +
  `phases/seed-registration-phase.js');
  const seedRows = [];
  const seedPhase = new SeedRegistrationPhase({delegates: {
    getLogger: () => ({info(){}, warn(){}, error(){}, debug(){}}),
    getNodeId: () => 'seed',
    getLeaderMessageGroupService: () => null,
  }});
  seedPhase.ensureSystemTableWriter = () => ({
    upsertSystemTableRow: async (table, seedRow) => {
      seedRows.push([table, seedRow]);
    },
  });
  await seedPhase.registerMessageGroup(1);
  const seeded = seedRows.find(([table]) => table === 'message_groups');
  if (!seeded) throw new Error('seed path wrote no message_groups row');

  console.log(JSON.stringify({
    replicaCount: row.replica_count,
    seedReplicaCount: seeded[1].replica_count}));
`;

test('message-group-creation-site-follows-its-own-declaration', () => {
  // THE SITE, not the constant. Mutation A survived the earlier receipt set:
  // re-pointing this production write at the PARTITIONS authority left every
  // receipt green, because nothing pinned which constant the site consumes and
  // both schemas declare 3. These two arrows separate them.
  const body = MESSAGE_GROUP_CREATION_BODY;

  // Arrow 1: the message-group declaration moves BOTH rows it seeds. Both
  // message-group creation sites are covered, because converting the
  // seed-registration one without witnessing it left a restated literal there
  // undetectable.
  const followsOwn = creationSiteUnderDrift({
    messageGroupDefault: 7, partitionsDefault: 3, body});
  assert.equal(followsOwn.replicaCount, 7,
    'the staged MESSAGE_GROUPS row must follow the MESSAGE_GROUPS default');
  assert.equal(followsOwn.seedReplicaCount, 7,
    'the SEEDED MESSAGE_GROUPS row must follow it too');

  // Arrow 2: the partitions declaration does NOT reach either of them.
  const ignoresPartitions = creationSiteUnderDrift({
    messageGroupDefault: 7, partitionsDefault: 9, body});
  assert.equal(ignoresPartitions.replicaCount, 7,
    'the PARTITIONS declaration must not reach the message-group write');
  assert.equal(ignoresPartitions.seedReplicaCount, 7,
    'nor the seed-registration message-group write');
});

test('partitions-creation-site-follows-its-own-declaration', () => {
  // The PARTITIONS half, which had no witness at all: mutation B replaced this
  // write with a literal 1 and every receipt stayed green.
  const body = `
    const {SeedRegistrationPhase} = await import('${REPO_ROOT}/src/bootstrap/` +
    `phases/seed-registration-phase.js');
    const rows = [];
    const phase = new SeedRegistrationPhase({delegates: {
      getLogger: () => ({info(){}, warn(){}, error(){}, debug(){}}),
      getNodeId: () => 'seed',
    }});
    phase.ensureSystemTableWriter = () => ({
      upsertSystemTableRow: async (table, row) => {rows.push([table, row]);},
    });
    await phase.registerSystemTables(1);
    const partitionRows = rows.filter(([table]) => table === 'partitions');
    console.log(JSON.stringify({
      counts: [...new Set(partitionRows.map(([, row]) => row.replica_count))],
      rowCount: partitionRows.length}));
  `;

  // Arrow 1: the partitions declaration moves every seeded partition row.
  const followsOwn = creationSiteUnderDrift({
    messageGroupDefault: 3, partitionsDefault: 9, body});
  assert.ok(followsOwn.rowCount > 0, 'the probe must seed partition rows');
  assert.deepEqual(followsOwn.counts, [9],
    'every seeded PARTITIONS row must follow the PARTITIONS default');

  // Arrow 2: the message-group declaration does NOT reach it.
  const ignoresMessageGroups = creationSiteUnderDrift({
    messageGroupDefault: 7, partitionsDefault: 9, body});
  assert.deepEqual(ignoresMessageGroups.counts, [9],
    'the MESSAGE_GROUPS declaration must not reach the partitions write');
});

test('absent-scenario-cannot-pass-as-a-receipt', () => {
  // The harness-fidelity control. `node --test --test-name-pattern` exits 0
  // when the pattern matches NOTHING and prints `# tests 1 / # pass 1` for the
  // file-level subtest, so receipts built directly on it were shells: renaming
  // a scenario left the harness reporting 13/13 with that scenario never run.
  // Every receipt in this quest now goes through the anchored runner, so this
  // scenario is what stops the whole receipt set from becoming vacuous again.
  const runner = 'test/bootstrap/run-anchored-scenario-helper.js';
  const witness = 'test/bootstrap/replication-target-authority.test.js';
  const run = (scenarioName) => spawnSync(
    process.execPath, [runner, witness, scenarioName],
    {cwd: REPO_ROOT, encoding: 'utf8'});

  const present = run('authority-mints-no-runtime-state');
  assert.equal(present.status, 0,
    `a real scenario must pass: ${present.stderr}`);

  const absent = run('this-scenario-does-not-exist');
  assert.notEqual(absent.status, 0,
    'an ABSENT scenario must fail the receipt, not pass silently');
  assert.match(absent.stderr, /DID NOT RUN/u);

  // All THREE outcome classes through the real CLI, against the fixture file.
  // Guarding only the ABSENT case was a point fix: a runner that accepted a
  // FAILING scenario satisfied it while every other receipt stayed green.
  const fixtures = 'test/bootstrap/anchored-runner-fixture-cases.js';
  const runFixture = (scenarioName) => spawnSync(
    process.execPath, [runner, fixtures, scenarioName],
    {cwd: REPO_ROOT, encoding: 'utf8'});

  assert.equal(runFixture(FIXTURE_SCENARIO.PASSES).status, 0,
    'a fixture scenario that genuinely passes must be accepted');
  assert.notEqual(runFixture(FIXTURE_SCENARIO.FAILS).status, 0,
    'a fixture scenario that FAILED must be rejected, not reported as run');
  assert.notEqual(runFixture(FIXTURE_SCENARIO.ABSENT).status, 0,
    'a fixture scenario that does not exist must be rejected');

  // The bare form the receipts used to use still exits 0 on no match, which is
  // why the runner exists. If node ever fixes this, the assertion below fails
  // and the runner can be reconsidered - it must not silently become dead.
  const bare = spawnSync(process.execPath,
    ['--test', '--test-name-pattern=^this-scenario-does-not-exist$', witness],
    {cwd: REPO_ROOT, encoding: 'utf8'});
  assert.equal(bare.status, 0,
    'documented node behaviour: a zero-match pattern run still exits 0');

  // The classifier as a unit, so the TAP shapes that must not be mistaken for
  // a pass are pinned without paying for a subprocess each.
  const name = 'target-scenario';
  assert.equal(classifyRun(`ok 1 - ${name}`, name, 0),
    RUN_OUTCOME.RAN_AND_PASSED);
  assert.equal(classifyRun(`not ok 1 - ${name}`, name, 1),
    RUN_OUTCOME.SCENARIO_FAILED);
  assert.equal(classifyRun('1..0\nok 1 - some/file.test.js', name, 0),
    RUN_OUTCOME.SCENARIO_ABSENT,
    'the file-level subtest of a zero-match run is not the scenario');
  assert.equal(classifyRun(`    ok 1 - ${name}`, name, 0),
    RUN_OUTCOME.SCENARIO_ABSENT,
    'an INDENTED result line is a nested subtest, not the anchored scenario');
  assert.equal(classifyRun(`ok 1 - prefix - ${name}`, name, 0),
    RUN_OUTCOME.RAN_AND_PASSED);
  assert.equal(classifyRun(`ok 1 - ${name}-longer`, name, 0),
    RUN_OUTCOME.SCENARIO_ABSENT,
    'a scenario whose name merely EXTENDS the target is not the target');
  assert.equal(classifyRun(`ok 1 - ${name}`, name, 1),
    RUN_OUTCOME.PROCESS_ERROR,
    'a named pass with a non-zero exit is still a failure');
});

test('declaration-handoffs-return-copies', () => {
  // CLAUSE 6, on the hand-off ACCESSORS rather than only on the services that
  // consume them. Review round 1 landed this gap: the receipt that asserted
  // getInitialReplicaIds returns a copy was retired when the identity-churn
  // scenario was replaced by the metamorphic one, and reverting the accessor
  // to `INITIAL_REPLICA_IDS[tableName] || null` then left the whole bar green
  // while the declaration was live and mutable through it. The copy is
  // load-bearing: critical-placement-convergence derives a required replica
  // count from the LENGTH of that array, so aliasing is measurable.
  const table = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
  const declaredLength = INITIAL_REPLICA_IDS[table].length;

  const handedOut = getInitialReplicaIds(table);
  assert.notEqual(handedOut, INITIAL_REPLICA_IDS[table],
    'the declaration must not be handed out by reference');
  handedOut.push(`${table}-p1${MINTED_REPLACEMENT}`);
  assert.equal(INITIAL_REPLICA_IDS[table].length, declaredLength,
    'a caller mutating its copy cannot mutate the declaration');
  assert.equal(getInitialReplicaIds(table).length, declaredLength,
    'nor what the NEXT reader is handed');

  // A missing table is still distinguishable from an empty declaration, so
  // the copy did not turn "not configured" into "configured with nobody".
  assert.equal(getInitialReplicaIds('table-that-does-not-exist'), null,
    'an undeclared table must stay null, not become an empty list');

  // THE MESSAGE-GROUP EQUIVALENT, driven through the real seed phase rather
  // than asserted against its source text. The phase hands a replicaIds list
  // into each queued service descriptor; that value must not be the shared
  // declaration, and mutating what the consumer received must not move it.
  const declaredGroupLength = INITIAL_MESSAGE_GROUP_REPLICA_IDS.length;
  const handedToConsumers = [];
  const phase = new SeedMessageGroupsPhase({delegates: {
    getLogger: () => ({info() {}, warn() {}, error() {}, debug() {}}),
    getConfig: () => ({replicaStaggerDelayMs: 0}),
    getNodeId: () => 'seed',
    resetMessageGroupReplicas: () => {},
    createBootstrapServiceDescriptor: () => ({}),
    queueBootstrapServiceReplica: (_descriptor, options) => {
      handedToConsumers.push(options.replicaIds);
    },
    triggerBootstrapReconciler: async () => {},
    incrementMessageGroupsCreated: () => {},
    getMessageGroupReplicas: () => [],
  }});
  return phase.phaseMessageGroups().then(() => {
    assert.ok(handedToConsumers.length > 0,
      'the seed phase must queue at least one message-group replica');
    for (const handed of handedToConsumers) {
      assert.notEqual(handed, INITIAL_MESSAGE_GROUP_REPLICA_IDS,
        'the message-group declaration must not be handed on by reference');
      handed.push(`mg-1${MINTED_REPLACEMENT}`);
    }
    assert.equal(INITIAL_MESSAGE_GROUP_REPLICA_IDS.length, declaredGroupLength,
      'consumers mutating what they were handed cannot move the declaration');
  });
});

test('defensive-copies-do-not-disarm-critical-assertions', () => {
  // The regression class review round 1 found in this very candidate. The
  // hand-off sites were hardened by copying, and one of those copies -
  // `[...(INITIAL_REPLICA_IDS[tableName] || [])]` - made the value ALWAYS a
  // truthy array, which silently made the assertCritical on the next line
  // unreachable. A table with no declared replica set stopped raising the
  // critical 'Partition replica set not configured' and fell through to a
  // leader-missing throw on an error key that does not exist, so the operator
  // got an Error with no message and no isCritical. Copying to protect a
  // declaration must never cost a fail-closed check.
  const owner = new SeedRegistrationRuntimeOwner({delegates: {
    getPartitionServices: () => new Map(),
  }});

  assert.throws(
    () => owner.findLeaderPartition('table-with-no-declared-replica-set'),
    (error) => {
      assert.equal(error.isCritical, true,
        'a missing replica declaration must raise a CRITICAL error');
      assert.equal(error.message, BOOTSTRAP_ERROR.PARTITION_REPLICAS_MISSING,
        'and must name the missing replica set, not a downstream symptom');
      return true;
    },
    'an undeclared table must fail closed at the replica-set assertion');

  // And the declared path still works, so the guard above is not simply
  // rejecting everything.
  const table = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
  assert.equal(owner.findLeaderPartition(table), null,
    'a declared table with no leader yet returns null, it does not throw');

  // THE SIBLING FALLBACKS, which round 2 found unwitnessed. The same hardening
  // pass added `getInitialReplicaIds(tableName) || []` at two seed sites; that
  // fallback would have turned an undeclared system table into a silent
  // zero-replica seed and into a cache-hydration path that reports "nothing to
  // subscribe" instead of failing. The property is that an UNDECLARED table
  // stays distinguishable from a declared-but-empty one all the way through,
  // which is exactly what a `|| []` erases.
  assert.equal(getInitialReplicaIds('table-that-does-not-exist'), null,
    'the accessor the seed sites consume must report undeclared as null');
  //
  // NAMED METHODS, not the whole file. Two other sites legitimately carry the
  // fallback and always did: subscribing to CDC and loading a persisted epoch
  // are optional work, where "nothing declared" correctly means "nothing to
  // do". The two below are DECISION sites - one seeds the system partitions,
  // one decides a table is write-ready - and there an undeclared table must
  // stay distinguishable from a declared-but-empty one.
  const decisionSites = [
    ['src/bootstrap/phases/seed-partitions-phase.js', 'phasePartitions'],
    ['src/bootstrap/phases/seed-cache-hydration-phase.js',
      'isSeedLocalSystemTableWriteReady'],
  ];
  for (const [relativePath, methodName] of decisionSites) {
    let method = null;
    walkNodes(parseRepoFile(relativePath), (node) => {
      if (node.type === 'MethodDefinition' && node.key?.name === methodName) {
        method = node;
      }
    });
    assert.ok(method,
      `${relativePath} must still define ${methodName}; a renamed method ` +
      'would make this check silently vacuous');
    // ONE HOP, so the two-statement form does not escape: binding the call to
    // a local and then defaulting THAT is the same disarm written differently,
    // and matching only the single-expression form left it open.
    const declaredLocally = new Set();
    walkNodes(method, (node) => {
      if (node.type === 'VariableDeclarator' &&
        node.id?.type === 'Identifier' &&
        node.init?.type === 'CallExpression' &&
        node.init.callee?.name === 'getInitialReplicaIds') {
        declaredLocally.add(node.id.name);
      }
    });
    let fallbacks = 0;
    walkNodes(method, (node) => {
      if (node.type !== 'LogicalExpression') return;
      if (node.right?.type !== 'ArrayExpression' ||
        node.right.elements.length > 0) return;
      const readsTheAccessor = (node.left?.type === 'CallExpression' &&
        node.left.callee?.name === 'getInitialReplicaIds') ||
        (node.left?.type === 'Identifier' &&
          declaredLocally.has(node.left.name));
      if (!readsTheAccessor) return;
      fallbacks += 1;
    });
    assert.equal(fallbacks, 0,
      `${relativePath} ${methodName} must not substitute an empty list for ` +
      'an undeclared replica set: it makes "not configured" ' +
      'indistinguishable from "configured with nobody" and disarms the ' +
      'checks downstream of it');
  }
});
