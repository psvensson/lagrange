// S0 witnesses (fallback-read closure) of the owner-fact receiver contract.
// Owner path: readOwnerFact -> gateway.readAuthoritativeRows ->
// executeAuthoritativeSystemTableRead (in-process arm, or the owner RPC arm)
// -> PartitionService.handleRemoteQuery with the leaderRead field.
// Real: the fixture's three-replica raft-rs ledger group and per-node read
// surfaces (cdc-owner-fact-group-fixture.js). Substituted, per case and
// named there: raft traffic held back from one replica (a fresh leader that
// has not committed an entry of its own term), and a leader's statement held
// at a gate so that an event lands while its read is in flight.
// Ceiling: one process; a held statement stands for a read that spans an
// event, it does not make SQLite slow.
import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {test} from '../../src/test-helpers/tap.js';
import {READ_SQL, TABLE, openLedgerGroupSurface, ownerFactRequestTo} from
  './cdc-owner-fact-group-fixture.js';

const TEST_TIMEOUT_MS = 120000;
const OPERATION = 'read-point-operation';

function requestFor(operationId) {
  return {tableName: TABLE, sql: READ_SQL, params: [operationId],
    minimumIndex: 0, minimumTerm: 0};
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
function holdNextStatement(service, placement) {
  const original = service.executeQuery;
  const entered = Promise.withResolvers();
  const released = Promise.withResolvers();
  service.executeQuery = async function heldOnce(...args) {
    service.executeQuery = original;
    if (placement === 'beforeRead') {
      entered.resolve();
      await released.promise;
      return original.apply(service, args);
    }
    const result = await original.apply(service, args);
    entered.resolve();
    await released.promise;
    return result;
  };
  return {entered: entered.promise, release: () => released.resolve()};
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

test('readOwnerFact: an apply landing while the leader reads never mis-states the witness',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [leader] = group.services;
    await group.settleLeader(leader);
    const surface = await group.surfaceOf(leader.nodeId, {leaderNodeId: leader.nodeId});
    // beforeRead: the row applies after the receiver observed its core and
    // before the statement reads; afterRead: after the statement read and
    // before the receiver answers.
    for (const placement of ['beforeRead', 'afterRead']) {
      const operationId = `${OPERATION}-${placement}`;
      const held = holdNextStatement(leader, placement);
      const pending = readOwnerFact(surface.readLeaderRequired, requestFor(operationId));
      await held.entered;
      const writtenAt = await group.writeRow(leader, operationId);
      held.release();
      const answer = await pending;
      t.ok([STATE.READY, STATE.UNAVAILABLE].includes(answer.state), `${placement}: typed`);
      if (answer.state === STATE.READY) {
        t.equal(ownerFactRows(answer).length === 1, answer.witness.appliedIndex >= writtenAt,
          `${placement}: the witness names the applied position of the rows it carries`);
      } else {
        t.equal(answer.reason, REASON.READ_POINT_MOVED,
          `${placement}: the receiver cannot name the snapshot it read, so it refuses`);
      }
      const after = await readOwnerFact(surface.readLeaderRequired, requestFor(operationId));
      t.equal(after.state, STATE.READY, `${placement}: a read that spans no apply is READY`);
      t.same(ownerFactRows(after), [{operation_id: operationId, workflow_step: leader.replicaId}]);
      t.ok(after.witness.appliedIndex >= writtenAt);
    }
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
