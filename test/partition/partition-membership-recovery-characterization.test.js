// Characterization of the group-bound permanent member loss recovery store,
// its intent entry points and the target's admission fence branch (static
// repair B03, 2026-11-28). Written against the unchanged tree BEFORE the
// decisions were split into named steps, so it pins every exit those steps
// must keep: the binding validation's absent/invalid/target refusals, the
// row-to-command identity, the authoritative member binding (durable,
// metadata, contradicted, unavailable), every refusal of the log-entry
// validation in both modes, the observed-service exclusion, the local fence
// row (full and placeholder-filled), the excluded-peer lookup, the staged
// intent's refusals and recorded replays, the applied command's settled
// replays and persisted digest, and the RETIRED_MEMBER_FENCED admission
// answer that writes the local fence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {ERRORS} from '../../src/constants/errors.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry, deriveRaftRsPeerId} from
  '../../src/raft/raft-rs-peer-identity.js';
import {
  committedStatementEntryKey,
  createCommittedStatementOutcomeTable,
  readCommittedStatementOutcome,
  recordCommittedStatementOutcome,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY,
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_MEMBERSHIP_RECOVERY_ERROR as ERROR,
  PARTITION_MEMBERSHIP_RECOVERY_OUTCOME as OUTCOME,
  PARTITION_MEMBERSHIP_RECOVERY_RESULT_FIELD as RESULT_FIELD,
  PARTITION_MEMBERSHIP_RECOVERY_SQL as SQL,
  PARTITION_MEMBERSHIP_RECOVERY_TYPE,
} from '../../src/partition/partition-membership-recovery-constants.js';
import {
  ensureMembershipRecoveryTables,
  isExcludedRecoveryServiceReplica,
  isLocalReplicaExcludedFenced,
  isPeerExcludedInGroup,
  markLocalReplicaExcludedFence,
  noteExcludedRecoveryServiceReplica,
  noteMembershipRecoveryOrFenceRowWritten,
  recordPartitionMemberBinding,
  recoveryRowMatchesCommand,
  registerRecoveryPublicationPartitionService,
  resolveAuthoritativeMemberBinding,
  validateMembershipRecoveryBinding,
  validateMembershipRecoveryIntentAtLogEntry,
} from '../../src/partition/partition-membership-recovery-store.js';
import {
  applyPartitionMembershipRecoveryCommand,
  stagePartitionMembershipRecoveryIntent,
} from '../../src/partition/partition-membership-recovery.js';
import {driveReplicaAdmission} from '../../src/partition/partition-replica-admission.js';

const PARTITION = 'users-p1';
const SELF = 'users-p1-r1';
const SOURCE = 'users-p1-r2';
const OTHER = 'users-p1-r3';
const TARGET = 'users-p1-r4';
const STRANGER = 'users-p1-r9';
const SOURCE_NODE = 'node-b';
const TARGET_NODE = 'node-d';
const SOURCE_CREATED_AT = 1000;
const SOURCE_BOOT = 3;
const TARGET_CREATED_AT = 2000;
const TARGET_BOOT = 5;
const DECISION_ID = 'decision-1';
const ENTRY_ID = 'entry-1';
const LOG_INDEX = 41;
const TERM = 7;
const FENCE_DEFAULT_DECISION_ID = 'retired-fence';
const REFUSED_ADMISSION = 'refused';
const PENDING_REQUEST = 'pending';
const STRING_FIELDS = Object.freeze(['partitionId', 'configurationKey',
  'sourceReplicaId', 'sourceNodeId', 'targetReplicaId', 'targetNodeId']);
const INTEGER_FIELDS = Object.freeze(['sourceReplicaCreatedAt',
  'sourceNodeBootIncarnation', 'targetReplicaCreatedAt',
  'targetNodeBootIncarnation']);
const IDENTITY_FIELDS = Object.freeze(['decisionId', 'entryId', 'partitionId',
  'configurationKey', 'membershipGenerationIndex', 'sourcePeerId',
  'sourceReplicaId', 'sourceReplicaCreatedAt', 'sourceNodeId',
  'sourceNodeBootIncarnation', 'targetPeerId', 'targetReplicaId',
  'targetReplicaCreatedAt', 'targetNodeId', 'targetNodeBootIncarnation']);

function peer(replicaId) {
  return String(deriveRaftRsPeerId(replicaId));
}

const VOTERS = Object.freeze([peer(SELF), peer(SOURCE), peer(OTHER)]);

function refusalOf(failureCode) {
  return {valid: false, failureCode};
}

// The durable world of one replica: its applied ConfState, generation and
// peer reservations, with optional recovery rows and member bindings.
function world(t, {confState = {voters: [...VOTERS]}, generation = 0,
  reservations = [[SELF, null], [SOURCE, SOURCE_NODE], [OTHER, null]],
  status = {role: RAFT_ROLE.LEADER}, cacheRows = {}} = {}) {
  const db = new Database(':memory:');
  t.after(() => {
    if (db.open) db.close();
  });
  const store = new RaftRsDurableStore(db);
  store.putBootstrapAppliedState(PARTITION, confState,
    {bootstrapIndex: '0', admissionIndex: '0',
      membershipGenerationIndex: String(generation)});
  const registry = new RaftRsPeerIdentityRegistry(db);
  for (const [replicaId, nodeId] of reservations) {
    registry.registerReplica(replicaId);
    if (nodeId !== null) registry.recordCommittedNodeId(replicaId, nodeId);
  }
  createCommittedStatementOutcomeTable(db, PARTITION);
  ensureMembershipRecoveryTables(db);
  const key = raftRsConfStateKey(
    RaftRsDurableStore.readDurableRecordIn(db, PARTITION).confState);
  const resolved = [];
  const service = {
    partitionId: PARTITION,
    replicaId: SELF,
    nodeId: 'node-a',
    replicaIds: [SELF, SOURCE, OTHER],
    db,
    raft: {readStatus: () => status},
    leadershipTenure: 1,
    hasKnownRemoteLeaderWitness: () => false,
    hlcClock: {now: () => ({toString: () => '0000000001000-0000-node-a'})},
    timeSource: {now: () => 5000},
    systemTableCache: cacheOf(cacheRows),
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    resolveCommittedWrite: (entryId, answer) => resolved.push({entryId, answer}),
    rejectCommittedWrite: () => assert.fail('no rollback expected'),
    emit: () => {},
  };
  return {db, service, key, resolved};
}

// The source's durable generation binding, as the committed intent records it.
function bound(fixture) {
  recordPartitionMemberBinding(fixture.db, {replicaId: SOURCE, nodeId: SOURCE_NODE,
    nodeBootIncarnation: SOURCE_BOOT, replicaCreatedAt: SOURCE_CREATED_AT});
  return fixture;
}

function cacheOf(rows) {
  return {
    get(table, key) {
      return rows[table]?.[key];
    },
  };
}

function binding(key, overrides = {}) {
  return {
    decisionId: DECISION_ID,
    entryId: ENTRY_ID,
    partitionId: PARTITION,
    configurationKey: key,
    membershipGenerationIndex: 0,
    sourcePeerId: peer(SOURCE),
    sourceReplicaId: SOURCE,
    sourceReplicaCreatedAt: SOURCE_CREATED_AT,
    sourceNodeId: SOURCE_NODE,
    sourceNodeBootIncarnation: SOURCE_BOOT,
    targetPeerId: peer(TARGET),
    targetReplicaId: TARGET,
    targetReplicaCreatedAt: TARGET_CREATED_AT,
    targetNodeId: TARGET_NODE,
    targetNodeBootIncarnation: TARGET_BOOT,
    ...overrides,
  };
}

// A pinned command: exactly the committed command's keys.
function command(key, overrides = {}) {
  return {
    type: PARTITION_MEMBERSHIP_RECOVERY_TYPE,
    ...binding(key),
    timestamp: '0000000001000-0000-node-a',
    proposedBy: SELF,
    proposedAt: 5000,
    ...overrides,
  };
}

// The persisted command digest (`command_digest`): the identity fields in
// this exact order, JSON, sha256 hex.
function digestOf(cmd) {
  const payload = {type: cmd.type, entryId: cmd.entryId,
    decisionId: cmd.decisionId};
  for (const field of IDENTITY_FIELDS.slice(2)) payload[field] = cmd[field];
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function insertRecovery(db, row) {
  db.prepare(SQL.INSERT_RECOVERY).run(
    ...IDENTITY_FIELDS.map((field) => row[field]), LOG_INDEX, TERM);
  noteMembershipRecoveryOrFenceRowWritten(db);
}

function refusalAnswer(failureCode, extra = {}) {
  return {success: false, committed: false, partitionId: PARTITION, failureCode,
    [RESULT_FIELD]: {outcome: OUTCOME.REFUSED, failureCode}, ...extra};
}

function applyCollecting(service, cmd, index = LOG_INDEX) {
  const afterCommit = [];
  const outcome = applyPartitionMembershipRecoveryCommand(service, {
    command: cmd, index, term: TERM,
    afterCommit: (callback) => afterCommit.push(callback),
    afterRollback: () => assert.fail('no rollback registration expected'),
  });
  for (const callback of afterCommit) callback();
  return outcome;
}

test('binding validation: every absent, invalid and target refusal, and the ' +
  'normalized binding', (t) => {
  const key = 'key';
  const valid = binding(key);
  const normalized = {...valid};
  assert.deepEqual(validateMembershipRecoveryBinding(valid),
    {valid: true, normalized});
  assert.deepEqual(validateMembershipRecoveryBinding(
    binding(key, {decisionId: undefined})).normalized.decisionId, ENTRY_ID,
  'an absent decision id is the entry id');
  assert.deepEqual(validateMembershipRecoveryBinding(
    binding(key, {entryId: null})).normalized.entryId, DECISION_ID,
  'an absent entry id is the decision id');
  assert.deepEqual(validateMembershipRecoveryBinding(
    binding(key, {targetPeerId: ''})).normalized.targetPeerId, peer(TARGET),
  'an absent target peer id is derived');
  const absent = refusalOf(ERROR.BINDING_ABSENT);
  const invalid = refusalOf(ERROR.BINDING_INVALID);
  const target = refusalOf(ERROR.TARGET_INVALID);
  const cases = [
    [null, absent],
    ['binding', absent],
    [binding(key, {decisionId: undefined, entryId: undefined}), absent],
    [binding(key, {membershipGenerationIndex: ''}), absent],
    [binding(key, {sourcePeerId: null}), absent],
    ...STRING_FIELDS.map((field) => [binding(key, {[field]: ''}), absent]),
    ...STRING_FIELDS.map((field) => [binding(key, {[field]: 7}), invalid]),
    ...INTEGER_FIELDS.map((field) => [binding(key, {[field]: null}), absent]),
    ...INTEGER_FIELDS.map((field) => [binding(key, {[field]: 0}), invalid]),
    ...INTEGER_FIELDS.map((field) => [binding(key, {[field]: 1.5}), invalid]),
    ...INTEGER_FIELDS.map((field) => [binding(key, {[field]: '3'}), invalid]),
    [binding(key, {decisionId: 5}), invalid],
    [binding(key, {entryId: 5}), invalid],
    [binding(key, {membershipGenerationIndex: -1}), invalid],
    [binding(key, {membershipGenerationIndex: -0}), invalid],
    [binding(key, {membershipGenerationIndex: '0'}), invalid],
    [binding(key, {sourcePeerId: 9}), invalid],
    [binding(key, {sourcePeerId: peer(OTHER)}), invalid],
    [binding(key, {targetPeerId: peer(OTHER)}), invalid],
    [binding(key, {targetReplicaId: SOURCE, targetPeerId: peer(SOURCE)}), target],
    [binding(key, {targetNodeId: SOURCE_NODE}), target],
  ];
  for (const [payload, expected] of cases) {
    assert.deepEqual(validateMembershipRecoveryBinding(payload), expected,
      JSON.stringify(payload));
  }
  assert.ok(Object.isFrozen(validateMembershipRecoveryBinding(null)));
  t.diagnostic(`binding cases: ${cases.length}`);
});

test('row-to-command identity: all fifteen fields, in order, and absent rows',
  () => {
    const record = binding('key');
    assert.equal(recoveryRowMatchesCommand(record, {...record}), true);
    assert.equal(recoveryRowMatchesCommand(null, record), false);
    assert.equal(recoveryRowMatchesCommand(record, undefined), false);
    for (const field of IDENTITY_FIELDS) {
      assert.equal(recoveryRowMatchesCommand(record,
        {...record, [field]: `${record[field]}x`}), false, field);
    }
    const reads = [];
    const probe = new Proxy({...record, decisionId: 'other'}, {
      get(target, property) {
        reads.push(property);
        return target[property];
      },
    });
    assert.equal(recoveryRowMatchesCommand(record, probe), false);
    assert.deepEqual(reads, ['decisionId'], 'the first difference stops it');
  });

test('authoritative member binding: durable, metadata, contradicted and ' +
  'unavailable answers', (t) => {
  const {service} = bound(world(t));
  const durable = {available: true, contradicted: false, replicaId: SOURCE,
    peerId: peer(SOURCE), nodeId: SOURCE_NODE,
    replicaCreatedAt: SOURCE_CREATED_AT, nodeBootIncarnation: SOURCE_BOOT};
  assert.deepEqual(resolveAuthoritativeMemberBinding(service, SOURCE), durable);
  assert.deepEqual(resolveAuthoritativeMemberBinding(service, SOURCE, SOURCE_NODE),
    durable);
  assert.deepEqual(resolveAuthoritativeMemberBinding(service, SOURCE, 'node-z'),
    {available: false, contradicted: true});

  const unavailable = {available: false, contradicted: false};
  const bare = {...service, systemTableCache: null};
  assert.deepEqual(resolveAuthoritativeMemberBinding(bare, OTHER), unavailable,
    'no cache: unavailable');
  assert.deepEqual(resolveAuthoritativeMemberBinding(bare, OTHER, 'node-c'),
    unavailable, 'no cache with a supplied node: unavailable');

  const cached = (services, nodes) => ({...service, systemTableCache: cacheOf({
    [TABLES.SERVICES]: services, [TABLES.NODES]: nodes})});
  const row = {[COLUMN.NODE_ID]: 'node-c', [COLUMN.CREATED_AT]: 1500};
  const nodes = {'node-c': {[COLUMN.BOOT_INCARNATION]: 4},
    'node-y': {[COLUMN.BOOT_INCARNATION]: 6}};
  const fromMetadata = {available: true, contradicted: false, replicaId: OTHER,
    peerId: peer(OTHER), nodeId: 'node-c', replicaCreatedAt: 1500,
    nodeBootIncarnation: 4};
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: row}, nodes), OTHER), fromMetadata);
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: row}, nodes), OTHER, 'node-c'), fromMetadata);
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: row}, nodes), OTHER, 'node-y'),
  {available: false, contradicted: true});
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: {[COLUMN.CREATED_AT]: 1500}}, nodes), OTHER, 'node-y'),
  {...fromMetadata, nodeId: 'node-y', nodeBootIncarnation: 6},
  'a services row without a node: the supplied node is read');
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: {...row, [COLUMN.CREATED_AT]: 0}}, nodes), OTHER),
  unavailable, 'no positive creation time');
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({[OTHER]: row}, {}), OTHER), unavailable, 'no boot incarnation');
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({}, nodes), OTHER), unavailable, 'no services row');
  assert.deepEqual(resolveAuthoritativeMemberBinding(
    cached({'': row}, nodes), ''), unavailable, 'no replica id');
});

test('log-entry validation: every exit, with and without the pending ' +
  'configuration check', (t) => {
  const pending = {checkPendingConfChange: true};
  const applied = {checkPendingConfChange: false};
  const both = (fixture, cmd, expected, label) => {
    for (const options of [pending, applied]) {
      assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(
        fixture.service, cmd, options), expected, `${label} ${JSON.stringify(options)}`);
    }
  };
  const base = bound(world(t));
  both(base, command(base.key), {valid: true, replayed: false}, 'valid');
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(base.service,
    command(base.key)), {valid: true, replayed: false}, 'default options');
  both(base, command(base.key, {partitionId: 'users-p2'}),
    refusalOf(ERROR.PARTITION_MISMATCH), 'partition');
  both(base, command(base.key, {configurationKey: 'stale'}),
    refusalOf(ERROR.CONFIGURATION_STALE), 'stale key');
  both(base, command(base.key, {membershipGenerationIndex: 1}),
    refusalOf(ERROR.CONFIGURATION_STALE), 'stale generation');
  both(base, command(base.key, {sourcePeerId: peer(STRANGER)}),
    refusalOf(ERROR.SOURCE_NOT_VOTER), 'source not a voter');
  both(base, command(base.key, {sourceNodeId: 'node-z'}),
    refusalOf(ERROR.SOURCE_NOT_VOTER), 'reservation on another node');
  both(base, command(base.key, {sourceReplicaId: STRANGER}),
    refusalOf(ERROR.SOURCE_NOT_VOTER), 'reservation of another replica');
  both(base, command(base.key, {targetPeerId: peer(OTHER)}),
    refusalOf(ERROR.TARGET_INVALID), 'target already a voter');
  const generationMismatch = refusalOf(ERROR.SOURCE_GENERATION_MISMATCH);
  both(base, command(base.key, {sourceNodeBootIncarnation: SOURCE_BOOT + 1}),
    generationMismatch, 'durable binding, another boot');
  both(base, command(base.key, {sourceReplicaCreatedAt: SOURCE_CREATED_AT + 1}),
    generationMismatch, 'durable binding, another creation');

  const unreserved = world(t, {reservations: [[SELF, null], [OTHER, null]]});
  both(unreserved, command(unreserved.key), refusalOf(ERROR.SOURCE_NOT_VOTER),
    'no source reservation');

  const unbound = world(t);
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(unbound.service,
    command(unbound.key), pending), refusalOf(ERROR.BINDING_ABSENT),
  'leader precheck without any binding');
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(unbound.service,
    command(unbound.key), applied), {valid: true, replayed: false},
  'apply without a durable binding');

  const metadata = world(t, {cacheRows: {
    [TABLES.SERVICES]: {[SOURCE]: {[COLUMN.NODE_ID]: 'node-z',
      [COLUMN.CREATED_AT]: SOURCE_CREATED_AT}},
    [TABLES.NODES]: {[SOURCE_NODE]: {[COLUMN.BOOT_INCARNATION]: SOURCE_BOOT}}}});
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(metadata.service,
    command(metadata.key), pending), generationMismatch,
  'leader precheck: metadata contradicts the source node');
  const metadataBoot = world(t, {cacheRows: {
    [TABLES.SERVICES]: {[SOURCE]: {[COLUMN.CREATED_AT]: SOURCE_CREATED_AT}},
    [TABLES.NODES]: {[SOURCE_NODE]: {[COLUMN.BOOT_INCARNATION]: SOURCE_BOOT + 1}}}});
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(metadataBoot.service,
    command(metadataBoot.key), pending), generationMismatch,
  'leader precheck: metadata names another boot');
  const metadataMatch = world(t, {cacheRows: {
    [TABLES.SERVICES]: {[SOURCE]: {[COLUMN.CREATED_AT]: SOURCE_CREATED_AT}},
    [TABLES.NODES]: {[SOURCE_NODE]: {[COLUMN.BOOT_INCARNATION]: SOURCE_BOOT}}}});
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(metadataMatch.service,
    command(metadataMatch.key), pending), {valid: true, replayed: false},
  'leader precheck: matching metadata');

  const outgoing = world(t, {confState: {voters: [...VOTERS],
    votersOutgoing: [...VOTERS]}});
  both(outgoing, command(outgoing.key), refusalOf(ERROR.CONFIGURATION_IN_TRANSITION),
    'joint configuration');
  const learnersNext = world(t, {confState: {voters: [...VOTERS],
    learnersNext: [peer(TARGET)]}});
  both(learnersNext, command(learnersNext.key),
    refusalOf(ERROR.CONFIGURATION_IN_TRANSITION), 'learners next');
  const changing = bound(world(t, {status: {role: RAFT_ROLE.LEADER,
    confChangePending: true}}));
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(changing.service,
    command(changing.key), pending), refusalOf(ERROR.CONFIGURATION_IN_TRANSITION),
  'a pending conf change refuses the leader precheck');
  assert.deepEqual(validateMembershipRecoveryIntentAtLogEntry(changing.service,
    command(changing.key), applied), {valid: true, replayed: false},
  'apply does not read the pending conf change');
  const generation = bound(world(t, {generation: 3}));
  both(generation, command(generation.key, {membershipGenerationIndex: 3}),
    {valid: true, replayed: false}, 'the durable generation is the one compared');
  both(generation, command(generation.key), refusalOf(ERROR.CONFIGURATION_STALE),
    'generation 0 against durable generation 3');

  const reservedTarget = bound(world(t, {reservations: [[SELF, null],
    [SOURCE, SOURCE_NODE], [OTHER, null], [TARGET, 'node-z']]}));
  both(reservedTarget, command(reservedTarget.key), refusalOf(ERROR.TARGET_INVALID),
    'target reserved on another node');
  const targetPeerOfOther = bound(world(t, {reservations: [[SELF, null],
    [SOURCE, SOURCE_NODE], [OTHER, null], [STRANGER, null]]}));
  both(targetPeerOfOther, command(targetPeerOfOther.key,
    {targetPeerId: peer(STRANGER)}), refusalOf(ERROR.TARGET_INVALID),
  'target peer reserved by another replica');
  const reservedSame = bound(world(t, {reservations: [[SELF, null],
    [SOURCE, SOURCE_NODE], [OTHER, null], [TARGET, TARGET_NODE]]}));
  both(reservedSame, command(reservedSame.key), {valid: true, replayed: false},
    'target reserved on its own node');
  const reservedUnplaced = bound(world(t, {reservations: [[SELF, null],
    [SOURCE, SOURCE_NODE], [OTHER, null], [TARGET, null]]}));
  both(reservedUnplaced, command(reservedUnplaced.key), {valid: true, replayed: false},
    'target reserved with no committed node');

  const replay = world(t);
  const recorded = command(replay.key);
  insertRecovery(replay.db, recorded);
  const replayed = validateMembershipRecoveryIntentAtLogEntry(replay.service,
    command(replay.key), pending);
  assert.equal(replayed.valid, true);
  assert.equal(replayed.replayed, true);
  assert.deepEqual({...replayed.record}, {...binding(replay.key),
    intentLogIndex: LOG_INDEX, intentTerm: TERM});
  both(replay, command(replay.key, {targetNodeBootIncarnation: TARGET_BOOT + 1}),
    refusalOf(ERROR.INTENT_CONFLICT), 'same decision, other identity');
  both(replay, command(replay.key, {decisionId: 'decision-2'}),
    refusalOf(ERROR.INTENT_CONFLICT), 'same entry, other decision');
  both(replay, command(replay.key, {partitionId: 'users-p2'}),
    refusalOf(ERROR.PARTITION_MISMATCH), 'partition before replay');
});

test('observed-service exclusion: recorded, replaced, still voting and closed ' +
  'services', (t) => {
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, 1, null), false, 'no holder');
  const holder = {};
  assert.equal(isExcludedRecoveryServiceReplica('', 1, holder), false, 'no replica');
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, 1, holder), false, 'unknown');
  noteExcludedRecoveryServiceReplica(OTHER, 1500, holder);
  noteExcludedRecoveryServiceReplica(OTHER, 1200, holder);
  assert.equal(holder.excludedRecoveryServiceReplicas.get(OTHER), 1500,
    'the fence keeps the newest creation');
  assert.equal(isExcludedRecoveryServiceReplica(OTHER, 1500, holder), true);
  assert.equal(isExcludedRecoveryServiceReplica(OTHER, 1600, holder), false,
    'a later incarnation is not excluded');
  assert.equal(isExcludedRecoveryServiceReplica(OTHER, null, holder), true);
  noteExcludedRecoveryServiceReplica(STRANGER, null, holder);
  assert.equal(isExcludedRecoveryServiceReplica(STRANGER, 99, holder), true,
    'an unknown fence creation excludes every incarnation');

  const retired = world(t, {confState: {voters: [peer(SELF), peer(OTHER)]}});
  insertRecovery(retired.db, binding(retired.key));
  const observer = {};
  registerRecoveryPublicationPartitionService(retired.service, observer);
  assert.ok(observer.observedRecoveryPartitionServices.has(retired.service));
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, SOURCE_CREATED_AT, observer),
    true, 'a source absent from the voters is excluded');
  assert.equal(observer.excludedRecoveryServiceReplicas.get(SOURCE), SOURCE_CREATED_AT);
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, SOURCE_CREATED_AT + 1, observer),
    false, 'a newer incarnation of it is not');

  const voting = world(t);
  insertRecovery(voting.db, binding(voting.key));
  const votingObserver = {};
  registerRecoveryPublicationPartitionService(voting.service, votingObserver);
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, SOURCE_CREATED_AT,
    votingObserver), false, 'a source still voting is not excluded');
  assert.equal(isExcludedRecoveryServiceReplica(TARGET, TARGET_CREATED_AT,
    votingObserver), false, 'a target that was never a source is not');

  const chained = world(t);
  insertRecovery(chained.db, binding(chained.key));
  insertRecovery(chained.db, binding(chained.key, {decisionId: 'decision-2',
    entryId: 'entry-2', sourceReplicaId: TARGET, sourcePeerId: peer(TARGET),
    sourceNodeId: TARGET_NODE, targetReplicaId: STRANGER,
    targetPeerId: peer(STRANGER), targetNodeId: 'node-z'}));
  const chainedObserver = {};
  registerRecoveryPublicationPartitionService(chained.service, chainedObserver);
  assert.equal(isExcludedRecoveryServiceReplica(TARGET, 1, chainedObserver), true,
    'a former recovery target that is now a source is excluded');

  const closing = world(t);
  const closedObserver = {};
  registerRecoveryPublicationPartitionService(closing.service, closedObserver);
  closing.db.close();
  assert.equal(isExcludedRecoveryServiceReplica(SOURCE, 1, closedObserver), false);
  assert.equal(closedObserver.observedRecoveryPartitionServices.size, 0,
    'a closed service is forgotten');
});

test('local fence: the full row, the placeholder-filled row and the refusals',
  (t) => {
    const fenceRow = (db, replicaId) => ({...db.prepare(SQL.SELECT_LOCAL_FENCE).get(replicaId)});
    assert.equal(markLocalReplicaExcludedFence(null, {}), false, 'no service');
    const full = world(t);
    assert.equal(markLocalReplicaExcludedFence(full.service, null), false, 'no recovery');
    assert.equal(markLocalReplicaExcludedFence({db: full.db}, {}), false,
      'no replica');
    assert.equal(isLocalReplicaExcludedFenced(full.service), false);
    assert.equal(markLocalReplicaExcludedFence(full.service, {
      decisionId: DECISION_ID, partitionId: PARTITION, sourceReplicaId: SELF,
      sourcePeerId: 'peer-given', sourceNodeId: 'node-a', sourceNodeBootIncarnation: 9,
      sourceReplicaCreatedAt: 99, configurationKey: full.key,
      membershipGenerationIndex: 4}), true);
    assert.deepEqual(fenceRow(full.db, SELF), {replica_id: SELF,
      decision_id: DECISION_ID, partition_id: PARTITION, source_peer_id: 'peer-given',
      source_node_id: 'node-a', source_node_boot_incarnation: 9,
      source_replica_created_at: 99, configuration_key: full.key,
      membership_generation_index: 4});
    assert.equal(full.service.excludedMemberGenerationFenced, true);
    assert.equal(isLocalReplicaExcludedFenced(full.service), true);

    const partial = world(t);
    assert.equal(markLocalReplicaExcludedFence(partial.service, {
      partitionId: PARTITION, sourceReplicaId: SOURCE, sourceNodeId: SOURCE_NODE}), true);
    assert.deepEqual(fenceRow(partial.db, SOURCE), {replica_id: SOURCE,
      decision_id: FENCE_DEFAULT_DECISION_ID, partition_id: PARTITION,
      source_peer_id: peer(SOURCE), source_node_id: SOURCE_NODE,
      source_node_boot_incarnation: 1, source_replica_created_at: 1,
      configuration_key: '', membership_generation_index: 0});

    const fromService = world(t);
    assert.equal(markLocalReplicaExcludedFence(fromService.service, {}), true);
    assert.deepEqual(fenceRow(fromService.db, SELF), {replica_id: SELF,
      decision_id: FENCE_DEFAULT_DECISION_ID, partition_id: PARTITION,
      source_peer_id: peer(SELF), source_node_id: 'node-a',
      source_node_boot_incarnation: 1, source_replica_created_at: 1,
      configuration_key: '', membership_generation_index: 0});
    const handleOnly = world(t);
    assert.equal(markLocalReplicaExcludedFence(handleOnly.db, {sourceReplicaId: OTHER}), true,
      'a bare database handle is fenced too');
    assert.equal(fenceRow(handleOnly.db, OTHER).partition_id, '',
      'with no service the partition is empty');
  });

test('excluded peer lookup: by replica, by peer, still voting, and no rows',
  (t) => {
    assert.equal(isPeerExcludedInGroup({}, {replicaId: SOURCE}), null, 'no database');
    const empty = world(t);
    assert.equal(isPeerExcludedInGroup(empty.service, {replicaId: SOURCE}), null);
    const retired = world(t, {confState: {voters: [peer(SELF), peer(OTHER)]}});
    insertRecovery(retired.db, binding(retired.key));
    const expected = {...binding(retired.key), intentLogIndex: LOG_INDEX, intentTerm: TERM};
    assert.deepEqual({...isPeerExcludedInGroup(retired.service, {replicaId: SOURCE})},
      expected);
    assert.deepEqual({...isPeerExcludedInGroup(retired.service,
      {peerId: peer(SOURCE)})}, expected);
    assert.deepEqual({...isPeerExcludedInGroup(retired.service,
      {replicaId: STRANGER, peerId: peer(SOURCE)})}, expected,
    'an unknown replica falls through to the peer id');
    assert.equal(isPeerExcludedInGroup(retired.service, {replicaId: STRANGER}), null);
    assert.equal(isPeerExcludedInGroup(retired.service), null, 'no query');
    const voting = world(t);
    insertRecovery(voting.db, binding(voting.key));
    assert.equal(isPeerExcludedInGroup(voting.service, {replicaId: SOURCE}), null,
      'a source still voting is not excluded');
  });

test('staged intent: refusals before the command, recorded answers, and the ' +
  'leader precheck', async (t) => {
  const fenced = world(t);
  fenced.service.excludedMemberGenerationFenced = true;
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(fenced.service,
    binding(fenced.key)), refusalAnswer(ERROR.RETIRED_MEMBER_FENCED));
  const leader = world(t);
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(leader.service, {}),
    refusalAnswer(ERROR.BINDING_ABSENT));
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(leader.service,
    binding(leader.key, {targetNodeId: SOURCE_NODE})), refusalAnswer(ERROR.TARGET_INVALID));
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(leader.service,
    binding(leader.key, {partitionId: 'users-p2'})),
  refusalAnswer(ERROR.PARTITION_MISMATCH));
  const follower = world(t, {status: {role: RAFT_ROLE.FOLLOWER}});
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(follower.service,
    binding(follower.key)), {success: false, error: ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE,
    failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER, partitionId: PARTITION,
    [RESULT_FIELD]: {outcome: OUTCOME.REFUSED,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER}});

  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(leader.service,
    binding(leader.key)), refusalAnswer(ERROR.BINDING_ABSENT),
  'the leader precheck runs last');
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(leader.service,
    binding(leader.key, {configurationKey: 'stale'})),
  refusalAnswer(ERROR.CONFIGURATION_STALE));

  const recordedRefusal = world(t);
  assert.equal(applyCollecting(recordedRefusal.service,
    command(recordedRefusal.key, {configurationKey: 'stale'})), APPLY.APPLIED);
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(recordedRefusal.service,
    binding(recordedRefusal.key, {configurationKey: 'stale'})),
  refusalAnswer(ERROR.CONFIGURATION_STALE, {committed: true, logIndex: LOG_INDEX,
    term: TERM}), 'the same command already refused at its entry');
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(recordedRefusal.service,
    binding(recordedRefusal.key)), refusalAnswer(ERROR.INTENT_CONFLICT),
  'another record under the entry');

  const committed = world(t);
  insertRecovery(committed.db, binding(committed.key));
  const replay = await stagePartitionMembershipRecoveryIntent(committed.service,
    binding(committed.key));
  const record = {...binding(committed.key), intentLogIndex: LOG_INDEX, intentTerm: TERM};
  assert.deepEqual(JSON.parse(JSON.stringify(replay)), {success: true, committed: true,
    partitionId: PARTITION, entryId: ENTRY_ID, decisionId: DECISION_ID,
    logIndex: LOG_INDEX, term: TERM, recovery: record,
    [RESULT_FIELD]: {outcome: OUTCOME.REPLAYED, recovery: record}, replayed: true});
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(committed.service,
    binding(committed.key, {targetNodeBootIncarnation: TARGET_BOOT + 1})),
  refusalAnswer(ERROR.INTENT_CONFLICT), 'the decision exists with another identity');

  const committedOutcome = world(t);
  const cmd = command(committedOutcome.key);
  recordCommittedStatementOutcome(committedOutcome.service, {
    entryKey: committedStatementEntryKey(cmd), outcome: APPLY.APPLIED, index: LOG_INDEX,
    term: TERM, result: {changes: 1, lastInsertRowid: null},
    ownerResultText: JSON.stringify({outcome: OUTCOME.COMMITTED, recovery: record}),
    commandDigest: digestOf(cmd)});
  assert.deepEqual(await stagePartitionMembershipRecoveryIntent(committedOutcome.service,
    binding(committedOutcome.key)), refusalAnswer(ERROR.BINDING_ABSENT),
  'same command settled as committed with no row: on to the leader precheck');
  // Only reachable with inconsistent durable state (entry_id and decision_id
  // are written together): pins that the entry's row answers the replay.
  const entryRow = binding(committedOutcome.key, {decisionId: 'decision-other'});
  insertRecovery(committedOutcome.db, entryRow);
  const entryReplay = await stagePartitionMembershipRecoveryIntent(
    committedOutcome.service, binding(committedOutcome.key));
  const entryRecord = {...entryRow, intentLogIndex: LOG_INDEX, intentTerm: TERM};
  assert.deepEqual(JSON.parse(JSON.stringify(entryReplay)), {success: true,
    committed: true, partitionId: PARTITION, entryId: ENTRY_ID,
    decisionId: 'decision-other', logIndex: LOG_INDEX, term: TERM, recovery: entryRecord,
    [RESULT_FIELD]: {outcome: OUTCOME.REPLAYED, recovery: entryRecord}, replayed: true},
  'same command settled as committed: the row under its entry answers');
});

test('applied command: recorded refusal, settled replays and the persisted ' +
  'digest', (t) => {
  const refused = world(t);
  const stale = command(refused.key, {configurationKey: 'stale'});
  assert.throws(() => applyCollecting(refused.service, {...stale, extra: 1}),
    new Error(ERROR.BYTES), 'an unpinned command is malformed bytes');
  assert.throws(() => applyCollecting(refused.service, {...stale, partitionId: 'users-p2'}),
    new Error(ERROR.BYTES), 'another partition is malformed bytes');
  assert.equal(applyCollecting(refused.service, stale), APPLY.APPLIED);
  const recorded = readCommittedStatementOutcome(refused.service,
    committedStatementEntryKey(stale));
  assert.equal(recorded.commandDigest, digestOf(stale), 'the persisted digest');
  assert.deepEqual(JSON.parse(recorded.ownerResultText),
    {outcome: OUTCOME.REFUSED, failureCode: ERROR.CONFIGURATION_STALE});
  assert.deepEqual(recorded.changes, 0);
  assert.equal(applyCollecting(refused.service, {...stale, proposedAt: 6000,
    timestamp: 'later', proposedBy: OTHER}, LOG_INDEX + 1), APPLY.REPLAYED,
  'the digest leaves the proposal stamp out');
  assert.equal(applyCollecting(refused.service, command(refused.key), LOG_INDEX + 2),
    APPLY.REPLAYED, 'another command under the same entry');
  const answers = refused.resolved.map(({answer}) => JSON.parse(JSON.stringify(answer)));
  const committedRefusal = refusalAnswer(ERROR.CONFIGURATION_STALE,
    {committed: true, logIndex: LOG_INDEX, term: TERM});
  assert.deepEqual(answers, [committedRefusal, committedRefusal,
    refusalAnswer(ERROR.INTENT_CONFLICT, {committed: true, logIndex: LOG_INDEX + 2,
      term: TERM})]);

  const record = {...binding(refused.key), intentLogIndex: LOG_INDEX, intentTerm: TERM};
  const replayAnswer = (recovery) => ({success: true, committed: true,
    partitionId: PARTITION, entryId: ENTRY_ID, decisionId: DECISION_ID,
    logIndex: LOG_INDEX, term: TERM, recovery,
    [RESULT_FIELD]: {outcome: OUTCOME.REPLAYED, recovery}, replayed: true});
  for (const withRow of [false, true]) {
    const settled = world(t);
    const cmd = command(settled.key);
    recordCommittedStatementOutcome(settled.service, {
      entryKey: committedStatementEntryKey(cmd), outcome: APPLY.APPLIED,
      index: LOG_INDEX, term: TERM, result: {changes: 1, lastInsertRowid: null},
      ownerResultText: JSON.stringify({outcome: OUTCOME.COMMITTED,
        recovery: {...record, recordedOnly: true}}),
      commandDigest: digestOf(cmd)});
    if (withRow) insertRecovery(settled.db, cmd);
    assert.equal(applyCollecting(settled.service, cmd, LOG_INDEX + 5), APPLY.REPLAYED);
    const [{answer}] = settled.resolved;
    assert.deepEqual(JSON.parse(JSON.stringify(answer)),
      replayAnswer(withRow ? record : {...record, recordedOnly: true}),
      withRow ? 'the committed row answers' : 'the recorded result answers');
  }
});

test('admission answer RETIRED_MEMBER_FENCED writes the local fence; another ' +
  'refusal does not', async (t) => {
  for (const reason of [ERROR.RETIRED_MEMBER_FENCED, 'membership_recovery_other']) {
    const target = world(t);
    const info = [];
    const service = Object.assign(target.service, {
      replicaId: TARGET,
      nodeId: TARGET_NODE,
      isShutdown: false,
      transport: null,
      logger: {info: (message, detail) => info.push(detail)},
      sendReplicaAdmissionRequest: async () => ({outcome: REFUSED_ADMISSION, reason,
        failureCode: reason}),
    });
    service.replicaAdmissionRequest = {operationId: 'op-1', state: PENDING_REQUEST,
      lastOutcome: null, leaderHint: null, rereadStamp: false};
    const request = await driveReplicaAdmission(service);
    assert.equal(request.lastOutcome, REFUSED_ADMISSION);
    assert.equal(request.state, PENDING_REQUEST, 'a refusal keeps the request pending');
    assert.equal(request.leaderHint, null);
    assert.equal(request.rereadStamp, false);
    assert.equal(info.at(-1).reason, reason);
    const fence = target.db.prepare(SQL.SELECT_LOCAL_FENCE).get(TARGET);
    if (reason === ERROR.RETIRED_MEMBER_FENCED) {
      assert.deepEqual({...fence}, {replica_id: TARGET,
        decision_id: FENCE_DEFAULT_DECISION_ID, partition_id: PARTITION,
        source_peer_id: peer(TARGET), source_node_id: TARGET_NODE,
        source_node_boot_incarnation: 1, source_replica_created_at: 1,
        configuration_key: '', membership_generation_index: 0});
      assert.equal(isLocalReplicaExcludedFenced(service), true);
    } else {
      assert.equal(fence, undefined, 'no fence for another refusal');
      assert.equal(isLocalReplicaExcludedFenced(service), false);
    }
  }
});
