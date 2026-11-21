// S0 witnesses (fallback-read closure): a receiver's typed refusal is followed
// inside the ORIGINAL request's limits. Owner path: readOwnerFact ->
// gateway.readAuthoritativeRows -> QueryExecutor.executeOnPartition, whose
// redirect delivery takes its router options from the same execution budget
// (query-executor-partition-attempt-budget.js buildRouterDeliveryOptions) ->
// PartitionService.handleRemoteQuery.
// Real: the fixture's raft-rs ledger group, routers and read surfaces.
// Substituted: query channel transit (it records each hop's remaining
// delivery lifetime); in the loop case the two receivers' answers are
// replaced in transit by redirects naming each other, a state no real pair of
// cores holds at once, to bound the delivery owner alone.
import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {test} from '../../src/test-helpers/tap.js';
import {READ_SQL, READ_TIMEOUT_MS, TABLE, openLedgerGroupSurface} from
  './cdc-owner-fact-group-fixture.js';

const OPERATION = 'redirect-deadline-operation';
const TEST_TIMEOUT_MS = 120000;
// Timer and event-loop granularity of one process, not a budget extension.
const CLOCK_SLACK_MS = 250;

function requestFor(operationId) {
  return {tableName: TABLE, sql: READ_SQL, params: [operationId],
    minimumIndex: 0, minimumTerm: 0};
}

test('readOwnerFact: a redirect inside the deadline succeeds without extending it',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [deposed, leader, reader] = group.services;
    for (const service of group.services) group.seedRow(service, OPERATION);
    await group.settleLeader(deposed);
    const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: deposed.nodeId});
    await group.transferLeadership(deposed, leader);
    await group.settleLeader(leader);
    const sentBefore = group.transit.length;
    const startedAt = Date.now();
    const answer = await readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
    const hops = group.transit.slice(sentBefore);
    t.equal(answer.state, STATE.READY, 'the redirect reaches the leader');
    t.equal(answer.witness?.servingReplicaId, leader.replicaId);
    t.same(ownerFactRows(answer), [{operation_id: OPERATION, workflow_step: leader.replicaId}]);
    t.ok(hops.some(({targetNodeId, answer: sent}) => targetNodeId === deposed.nodeId &&
      sent?.failureCode === REASON.NOT_LEADER && sent?.leaderAddress === leader.unifiedAddress),
    'the deposed replica refused and named the leader');
    t.ok(hops.every(({sentAtMs, remainingMs}) =>
      sentAtMs + remainingMs <= startedAt + READ_TIMEOUT_MS + CLOCK_SLACK_MS),
    'no hop, the redirect included, lives past the original deadline');
  });

test('readOwnerFact: an A->B->A redirect loop ends as a typed unavailable at the deadline',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [first, second, reader] = group.services;
    await group.settleLeader(first);
    const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: first.nodeId});
    group.redirectInTransit(new Map([[first.nodeId, second], [second.nodeId, first]]));
    const sentBefore = group.transit.length;
    const startedAt = Date.now();
    const answer = await readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
    const elapsedMs = Date.now() - startedAt;
    const hops = group.transit.slice(sentBefore);
    t.comment(JSON.stringify({observed: {answer, elapsedMs, hops: hops.length}}));
    t.equal(answer.state, STATE.UNAVAILABLE, 'a loop never becomes an answer');
    t.ok([REASON.NOT_LEADER, REASON.READ_FAILED].includes(answer.reason),
      `a named reason (${answer.reason})`);
    t.ok(elapsedMs <= READ_TIMEOUT_MS + CLOCK_SLACK_MS, 'ended at or before the deadline');
    t.ok(hops.length > 1, 'the loop was followed at least once');
    t.ok(hops.every(({sentAtMs, remainingMs}) =>
      sentAtMs + remainingMs <= startedAt + READ_TIMEOUT_MS + CLOCK_SLACK_MS),
    'no hop of the loop lives past the original deadline');
  });

test('readOwnerFact: a published replica that knows no leader is an explicit unavailable',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [leader, isolated, reader] = group.services;
    group.seedRow(isolated, OPERATION);
    await group.settleLeader(leader);
    await group.isolateFromConsensus(isolated);
    const surface = await group.surfaceOf(reader.nodeId, {leaderNodeId: isolated.nodeId});
    const sentBefore = group.transit.length;
    const startedAt = Date.now();
    const answer = await readOwnerFact(surface.readLeaderRequired, requestFor(OPERATION));
    const fromIsolated = group.transit.slice(sentBefore)
      .filter(({targetNodeId}) => targetNodeId === isolated.nodeId);
    t.equal(answer.state, STATE.UNAVAILABLE);
    t.equal(answer.reason, REASON.NOT_LEADER, 'unknown leadership is named, not guessed');
    t.ok(Date.now() - startedAt <= READ_TIMEOUT_MS + CLOCK_SLACK_MS);
    t.ok(fromIsolated.length > 0 && fromIsolated.every(({answer: sent}) =>
      sent?.success === false && sent?.redirect === undefined &&
      typeof sent?.leaderAddressRefusal === 'string' && sent?.rowSet === undefined),
    'the replica refused with no redirect, its address owner\'s refusal named, no rows');
  });
