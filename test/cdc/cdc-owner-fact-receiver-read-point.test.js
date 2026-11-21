// S0 witnesses (fallback-read closure) of the owner-fact receiver contract.
// Owner path: readOwnerFact -> gateway.readAuthoritativeRows ->
// executeAuthoritativeSystemTableRead (in-process arm, or the owner RPC arm)
// -> PartitionService.handleRemoteQuery with the leaderRead field.
// Real: the fixture's three-replica raft-rs ledger group and per-node read
// surfaces (cdc-owner-fact-group-fixture.js). Substituted, per case and
// named there: raft traffic held back from one replica (a fresh leader that
// has not committed an entry of its own term), raft sends left pending (a
// leader whose core turn is pending at a peer send), a leader's statement held
// at a gate so that an event lands while its read is in flight, and a SQLite
// transaction opened on a replica's own connection by the test.
// Ceiling: one process; a held statement stands for a read that spans an
// event, it does not make SQLite slow.
import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {setTimeout as delay} from 'node:timers/promises';

import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION as DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {readPartitionAppliedIndex} from '../../src/partition/partition-committed-log.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION,
  READ_SQL,
  READ_TIMEOUT_MS,
  TABLE,
  openLedgerGroupSurface,
  ownerFactDraft,
  ownerFactRequestTo,
} from './cdc-owner-fact-group-fixture.js';

const TEST_TIMEOUT_MS = 120000;
const OPERATION = 'read-point-operation';
const DELETE_SQL = 'DELETE FROM replica_operations WHERE operation_id = ?';
// Reasons this round adds (literal: a witness must not pass on an undefined name).
const FOREIGN_TRANSACTION = 'owner_fact_foreign_transaction';
const FLOOR_OTHER_PARTITION = 'owner_fact_floor_other_partition';
// Long enough for an unshared owner fact to be answered, far below the
// plain read's own deadline.
const OWN_ANSWER_WAIT_MS = 1000;

function requestFor(operationId) {
  return ownerFactDraft([operationId]);
}

// The fields of a receiver's answer that are its decision (not its clock).
function decisionOf(answer) {
  const witness = answer?.readAuthorityWitness ?? null;
  return {success: answer?.success ?? null, failureCode: answer?.failureCode ?? null,
    redirect: answer?.redirect ?? null, leaderAddress: answer?.leaderAddress ?? null,
    shipsRows: answer?.rowSet !== undefined || Array.isArray(answer?.rows),
    role: witness?.role ?? null, servingReplicaId: witness?.servingReplicaId ?? null,
    term: witness?.term ?? null, appliedIndex: witness?.appliedIndex ?? null};
}

// Hold the next statement a replica executes until released; the hold sits
// before the statement (beforeRead) or after it ran (afterRead).
// readAt() is the replica's durable applied index read in the same
// synchronous run as the statement (immediately before it).
function holdNextStatement(service, placement) {
  const original = service.executeQuery;
  const entered = Promise.withResolvers();
  const released = Promise.withResolvers();
  let readAt = null;
  const run = (args) => {
    readAt = Number(readPartitionAppliedIndex(service));
    return original.apply(service, args);
  };
  service.executeQuery = async function heldOnce(...args) {
    service.executeQuery = original;
    if (placement === 'beforeRead') {
      entered.resolve();
      await released.promise;
      return run(args);
    }
    const result = await run(args);
    entered.resolve();
    await released.promise;
    return result;
  };
  return {entered: entered.promise, release: () => released.resolve(), readAt: () => readAt};
}

test('readOwnerFact: a fresh leader that has not applied its election log refuses typed, ' +
  'in process and routed', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [previous, other, fresh] = group.services;
  await group.settleLeader(previous);
  await group.freshLeaderBehindCommit(previous, fresh, OPERATION);
  const inProcess = await group.surfaceOf(fresh.nodeId, {leaderNodeId: fresh.nodeId});
  const hosted = await readOwnerFact(inProcess.readLeaderRequired, requestFor(OPERATION));
  t.equal(hosted.state, STATE.UNAVAILABLE, 'in process: never READY without the row');
  t.equal(hosted.reason, REASON.ELECTION_LOG_NOT_APPLIED);
  t.equal(Object.hasOwn(hosted, 'rows'), false);
  const routedSurface = await group.surfaceOf(other.nodeId, {leaderNodeId: fresh.nodeId});
  const routed = await readOwnerFact(routedSurface.readLeaderRequired, requestFor(OPERATION));
  t.equal(routed.state, STATE.UNAVAILABLE, 'routed: never READY without the row');
  t.equal(routed.reason, REASON.ELECTION_LOG_NOT_APPLIED);
  t.ok(group.transit.filter(({targetNodeId}) => targetNodeId === fresh.nodeId)
    .every(({answer}) => answer?.success === false && answer?.rowSet === undefined),
  'the fresh leader ships no rows');
});

test('one receiver contract: the same owner-fact request gets the same typed answer in ' +
  'process and over the transport', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [first, follower, second] = group.services;
  await group.settleLeader(first);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const compare = async (label, service, viaNodeId) => {
    const request = ownerFactRequestTo(service, [OPERATION]);
    const local = await service.handleRemoteQuery(structuredClone(request));
    const remote = await group.deliverOverTransport(viaNodeId, service, structuredClone(request));
    t.same(decisionOf(remote), decisionOf(local), `${label}: same typed answer`);
    return decisionOf(local);
  };
  const leader = await compare('leader', first, follower.nodeId);
  t.equal(leader.success, true);
  t.equal(leader.role, 'leader');
  const followerAnswer = await compare('follower', follower, second.nodeId);
  t.equal(followerAnswer.failureCode, REASON.NOT_LEADER);
  t.equal(followerAnswer.shipsRows, false);
  t.equal(followerAnswer.leaderAddress, first.unifiedAddress, 'names the leader it knows');
  await group.freshLeaderBehindCommit(first, second, `${OPERATION}-fresh`);
  const insufficient = await compare('insufficiently applied leader', second, follower.nodeId);
  t.equal(insufficient.failureCode, REASON.ELECTION_LOG_NOT_APPLIED);
  t.equal(insufficient.shipsRows, false);
  // A deposed replica learns its successor from the successor's first
  // heartbeat; the comparison is made once it has.
  await group.awaitKnownLeader(first, second);
  const deposed = await compare('deposed leader', first, follower.nodeId);
  t.equal(deposed.failureCode, REASON.NOT_LEADER);
  t.equal(deposed.shipsRows, false);
  t.equal(deposed.leaderAddress, second.unifiedAddress, 'names the leader that replaced it');
});

test('readOwnerFact: leadership moving while the leader reads never yields the old ' +
  'leader\'s rows', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [old, successor, reader] = group.services;
  await group.settleLeader(old);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: old.nodeId});
  const held = holdNextStatement(old, 'afterRead');
  const sentBefore = group.transit.length;
  const pending = readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
  await held.entered;
  await group.transferLeadership(old, successor);
  await group.settleLeader(successor);
  held.release();
  const answer = await pending;
  const fromOld = group.transit.slice(sentBefore)
    .filter(({targetNodeId}) => targetNodeId === old.nodeId);
  t.equal(answer.state, STATE.READY, 'the read reaches the replica that leads now');
  t.equal(answer.witness?.servingReplicaId, successor.replicaId,
    'never the replica that stopped leading during its read');
  t.same(ownerFactRows(answer), [{operation_id: OPERATION, workflow_step: successor.replicaId}]);
  t.ok(fromOld.length > 0 && fromOld.every(({answer: sent}) => sent?.success === false &&
    sent?.failureCode === REASON.NOT_LEADER && sent?.rowSet === undefined),
  'the old leader refused after its read, shipping no rows');
});

test('readOwnerFact: an apply landing between the receiver\'s observation and its statement, ' +
  'or after the statement, is READY at the position the rows reflect, in process and remote',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, reader] = group.services;
  await group.settleLeader(leader);
  const surfaces = {
    'in process': await group.surfaceOf(leader.nodeId, {leaderNodeId: leader.nodeId}),
    'remote': await group.surfaceOf(reader.nodeId, {leaderNodeId: leader.nodeId}),
  };
  // beforeRead: the row applies after the receiver observed its core and
  // before the statement reads; afterRead: after the statement read and
  // before the receiver answers.
  for (const [path, surface] of Object.entries(surfaces)) {
    for (const placement of ['beforeRead', 'afterRead']) {
      const label = `${path}, ${placement}`;
      const operationId = `${OPERATION}-${path.replace(' ', '-')}-${placement}`;
      const held = holdNextStatement(leader, placement);
      const pending = readOwnerFact(surface.readLeaderRequired, requestFor(operationId));
      await held.entered;
      const writtenAt = await group.writeRow(leader, operationId);
      held.release();
      const answer = await pending;
      t.equal(answer.state, STATE.READY, `${label}: READY, the position is read, not inferred`);
      t.equal(answer.witness?.appliedIndex, held.readAt(),
        `${label}: the witness names the applied position the statement read at`);
      const when = placement === 'beforeRead' ? 'before' : 'after';
      t.equal(held.readAt() >= writtenAt, placement === 'beforeRead',
        `${label}: the write applied ${when} that position`);
      t.same(answer.state === STATE.READY ? ownerFactRows(answer) : null,
        placement === 'beforeRead' ?
          [{operation_id: operationId, workflow_step: leader.replicaId}] : [],
        `${label}: the rows are those of that position`);
    }
  }
});

test('readOwnerFact: a leader whose core has stepped its successor\'s term while its own turn ' +
  'is pending refuses typed, in process and over the transport',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [old, successor, other] = group.services;
  await group.settleLeader(old);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const oldTerm = Number(old.raft.readStatus().term);
  // Whatever the old leader sends once its core knows a newer term (its vote
  // for the successor) stays pending: the turn that stepped the successor's
  // message does not finish.
  const held = group.holdPendingSendsOf(old, (message) => Number(message.term) > oldTerm);
  await group.requestLeadershipTransfer(old, successor);
  t.equal(await group.waitFor(() => held.held() > 0 &&
    successor.raft.readStatus().role === RAFT_ROLE.LEADER), true,
  'setup: the old leader\'s core answered the successor\'s term, and that send is pending');
  t.equal(old.raft.readStatus().role, RAFT_ROLE.LEADER,
    'setup: the status the old leader reports is still its last announced observation');
  const request = ownerFactRequestTo(old, [OPERATION]);
  const local = decisionOf(await old.handleRemoteQuery(structuredClone(request)));
  const remote = decisionOf(
    await group.deliverOverTransport(other.nodeId, old, structuredClone(request)));
  t.equal(local.failureCode, REASON.NOT_LEADER, 'in process: its core no longer leads, so it refuses');
  t.equal(local.shipsRows, false, 'in process: no rows');
  t.same(remote, local, 'over the transport: the same typed answer');
  held.release();
});

test('readOwnerFact: an owner fact arriving while a plain strict read of the same statement is ' +
  'in flight gets its own decided answer', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, reader] = group.services;
  await group.settleLeader(leader);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: leader.nodeId});
  const held = holdNextStatement(leader, 'afterRead');
  const sentBefore = group.transit.length;
  const plain = surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], {
    authoritativeReadMode: MODE.OWNER_RPC_REQUIRED, leaderMode: LEADER.REQUIRED});
  await held.entered;
  const ownerFact = readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
  const answer = await Promise.race([ownerFact, delay(OWN_ANSWER_WAIT_MS).then(() => null)]);
  held.release();
  await plain;
  await ownerFact;
  t.not(answer, null, 'it does not wait on the plain read\'s flight');
  const decided = group.transit.slice(sentBefore).filter(({targetNodeId, leaderRead}) =>
    targetNodeId === leader.nodeId && leaderRead?.kind === 'owner_fact');
  t.equal(decided.length, 1, 'the leader received the owner-fact request and decided it');
  t.equal(answer?.state, STATE.READY);
  t.equal(answer?.witness?.leaderRead?.kind, 'owner_fact',
    'the answer echoes an owner-fact decision');
  t.same(answer?.witness?.leaderRead, decided[0]?.leaderRead,
    'the answer echoes exactly the request its receiver decided');
});

test('readOwnerFact: a read on a connection inside a transaction the receiver did not open is ' +
  'refused typed, never answered with the staged rows', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, reader] = group.services;
  await group.settleLeader(leader);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const surfaces = {
    'in process': await group.surfaceOf(leader.nodeId, {leaderNodeId: leader.nodeId}),
    'remote': await group.surfaceOf(reader.nodeId, {leaderNodeId: leader.nodeId}),
  };
  // A staged, never-committed DELETE of a committed row on the leader's own
  // connection: read through that connection it is a false absence.
  leader.db.prepare('BEGIN').run();
  try {
    leader.db.prepare(DELETE_SQL).run(OPERATION);
    for (const [path, surface] of Object.entries(surfaces)) {
      const answer = await readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
      t.equal(answer.state, STATE.UNAVAILABLE, `${path}: never the staged absence`);
      t.equal(answer.reason, FOREIGN_TRANSACTION, `${path}: typed`);
      t.equal(Object.hasOwn(answer, 'rows'), false, `${path}: no rows`);
    }
  } finally {
    leader.db.prepare('ROLLBACK').run();
  }
  const after = await readOwnerFact(surfaces['in process'].readLeaderRequired,
    requestFor(OPERATION));
  t.equal(after.state, STATE.READY, 'with the transaction gone the leader answers');
  t.same(after.state === STATE.READY ? ownerFactRows(after) : null,
    [{operation_id: OPERATION, workflow_step: leader.replicaId}]);
});

test('readOwnerFact: a floor is a position of one raft group; the receiver refuses a floor of ' +
  'another group', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, reader] = group.services;
  await group.settleLeader(leader);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const otherGroup = {
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES], index: 0, term: 0};
  const direct = await leader.handleRemoteQuery(
    ownerFactRequestTo(leader, [OPERATION], otherGroup));
  t.equal(direct?.failureCode, FLOOR_OTHER_PARTITION, 'the receiver refuses it typed');
  t.equal(direct?.rowSet === undefined && direct?.rows === undefined, true, 'with no rows');
  const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: leader.nodeId});
  const answer = await readOwnerFact(surface.readLeaderRequired,
    ownerFactDraft([OPERATION], {floor: otherGroup}));
  t.equal(answer.state, STATE.UNAVAILABLE);
  t.equal(answer.reason, FLOOR_OTHER_PARTITION, 'readOwnerFact names it');
  const own = await readOwnerFact(surface.readLeaderRequired, ownerFactDraft([OPERATION]));
  t.equal(own.state, STATE.READY, 'a floor of the read partition is answered');
});

test('readOwnerFact: the deadline and the routing class are required and travel to the ' +
  'query owner', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, reader] = group.services;
  await group.settleLeader(leader);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: leader.nodeId});
  const seen = [];
  const executeOnPartition = surface.queryExecutor.executeOnPartition;
  surface.queryExecutor.executeOnPartition = function observed(...args) {
    seen.push(args[6]);
    return executeOnPartition.apply(this, args);
  };
  const timeoutMs = READ_TIMEOUT_MS - 300;
  const answer = await readOwnerFact(surface.readLeaderRequired, ownerFactDraft([OPERATION], {
    deadline: {timeoutMs}, routingReadinessDimension: DIMENSION.CONTROL_PLANE_PUBLISHED}));
  t.equal(answer.state, STATE.READY);
  t.equal(seen.at(-1)?.routingReadinessDimension, DIMENSION.CONTROL_PLANE_PUBLISHED,
    'the caller\'s routing class reaches the query owner');
  t.equal(seen.at(-1)?.readAuthority?.routingReadinessDimension,
    DIMENSION.CONTROL_PLANE_PUBLISHED, 'and its frozen read authority');
  t.ok(seen.at(-1)?.timeoutMs > 0 && seen.at(-1)?.timeoutMs <= timeoutMs,
    'the caller\'s deadline bounds the query owner\'s');
  const {deadline: _deadline, ...withoutDeadline} = ownerFactDraft([OPERATION]);
  const calls = seen.length;
  await t.rejects(readOwnerFact(surface.readLeaderRequired, withoutDeadline),
    {name: 'OwnerFactRequestRefusal', field: 'deadline'}, 'a call without a deadline is refused');
  t.equal(seen.length, calls, 'and issues no read');
});

test('readOwnerFact: an answer decided for another floor is not this read\'s answer',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [leader] = group.services;
    await group.settleLeader(leader);
    group.seedRow(leader, OPERATION);
    // The leader's own decided answer for floor index 0, handed back as the
    // answer to a read with floor index 1 (a shared or rebuilt answer).
    const decided = await leader.handleRemoteQuery(
      ownerFactRequestTo(leader, [OPERATION], {partitionId: PARTITION, index: 0, term: 0}));
    const answerOf = async () => ({success: true, rows: [], rowSetComplete: true,
      readAuthorityWitness: decided.readAuthorityWitness});
    const other = await readOwnerFact(answerOf,
      ownerFactDraft([OPERATION], {floor: {partitionId: PARTITION, index: 1, term: 0}}));
    t.equal(other.state, STATE.UNAVAILABLE, 'never READY on another request\'s decision');
    t.equal(other.reason, REASON.ANSWER_FOR_ANOTHER_REQUEST);
    const own = await readOwnerFact(answerOf, ownerFactDraft([OPERATION]));
    t.equal(own.state, STATE.READY, 'the decision of exactly this request is its answer');
  });

test('readOwnerFact: the caller verifies what it received; a successful empty answer ' +
  'carrying a follower\'s witness is not absence', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [leader, follower] = group.services;
  await group.settleLeader(leader);
  // As a receiver that never saw the leaderRead field (or an answer shared
  // with another read) would send it: the follower's own witness, produced
  // by its witness owner, on a successful complete empty row set.
  const unverified = async () => ({success: true, rows: [], rowSetComplete: true,
    readAuthorityWitness: follower.buildRemoteReadAuthorityWitness(false)});
  const answer = await readOwnerFact(unverified, requestFor(OPERATION));
  t.equal(answer.state, STATE.UNAVAILABLE, 'never READY with no rows');
  t.equal(answer.reason, REASON.NOT_LEADER);
  t.equal(Object.hasOwn(answer, 'rows'), false);
});
