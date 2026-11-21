// S0 witness 2 (fallback-read closure). Owner path:
// gateway.readAuthoritativeRows -> executeAuthoritativeSystemTableRead ->
// QueryExecutor.resolvePartitionServiceCandidates (leader REQUIRED) ->
// PartitionService.handleRemoteQuery.
// The published leader is a routing hint. When it names a deposed replica,
// that replica must refuse the owner-fact read with a typed answer that
// carries no rows, and the read must still reach the replica that leads.
// The witness order is replayed: the same read first succeeds through the
// then-correct publication, leadership really moves, the publication stays.
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {PARTITION, READ_SQL, TABLE, openLedgerGroupSurface} from
  './cdc-owner-fact-group-fixture.js';

const OPERATION = 'stale-published-leader-operation';
const TEST_TIMEOUT_MS = 120000;
const STRICT = Object.freeze({
  authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER.REQUIRED,
});
// The receiver's typed refusal of an owner-fact read it may not serve
// (transition record s0-transition-record.md, "Receiver-side refusal").
const OWNER_FACT_NOT_LEADER = 'owner_fact_not_leader';

function carriesRows(answer) {
  return (Array.isArray(answer?.rows) && answer.rows.length > 0) ||
    (answer?.rowSet !== undefined && answer?.rowSet !== null);
}

function summarize(entries) {
  return entries.map(({targetNodeId, reached, answer}) => ({
    targetNodeId, reached, success: answer?.success ?? null,
    failureCode: answer?.failureCode ?? null, carriesRows: carriesRows(answer),
    witnessRole: answer?.readAuthorityWitness?.role ?? null,
    witnessTerm: answer?.readAuthorityWitness?.term ?? null,
  }));
}

test('gateway.readAuthoritativeRows leader-REQUIRED: a stale published leader refuses and ' +
  'the replica that leads answers', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [deposed, leader, local] = group.services;
  for (const service of group.services) group.seedRow(service, OPERATION);
  await group.settleLeader(deposed);
  // The reading node hosts a follower; its projection names the first leader.
  const surface = await group.surfaceOf(local.nodeId, {leaderNodeId: deposed.nodeId});

  const before = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], STRICT);
  t.equal(before.success, true, 'earlier witness: the published leader leads and answers');
  t.equal(before.readAuthorityWitness?.servingReplicaId, deposed.replicaId);
  t.same(before.rows, [{operation_id: OPERATION, workflow_step: deposed.replicaId}]);
  const termBefore = before.readAuthorityWitness?.term;

  await group.transferLeadership(deposed, leader);
  // The publication is not updated: it still names the deposed node.
  const sentBefore = group.transit.length;
  const after = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], STRICT);
  const asked = group.transit.slice(sentBefore);
  const witness = after.readAuthorityWitness;
  t.comment(JSON.stringify({
    observed: {success: after.success, error: after.error ?? null,
      authorityFailureReason: after.authorityFailureReason ?? null, rows: after.rows,
      witness: witness ?? null, deposedServiceRole: deposed.role,
      deposedCoreRole: deposed.raft.readStatus().role, asked: summarize(asked)},
  }));

  t.equal(after.success, true,
    'the strict read reaches the replica that leads (today: unavailable behind the stale leader)');
  t.equal(witness?.servingReplicaId, leader.replicaId, 'the answer is the leading replica\'s');
  t.equal(witness?.servingNodeId, leader.nodeId);
  t.equal(witness?.partitionId, PARTITION);
  t.equal(witness?.role, 'leader');
  t.ok(Number.isSafeInteger(witness?.term) && witness.term > termBefore,
    'the witness term is newer than the deposed leader\'s');
  t.ok(Number.isSafeInteger(witness?.appliedIndex) &&
    witness.appliedIndex === witness?.commitIndex,
  'the witness names an applied index equal to its commit index');
  t.same(after.rows, [{operation_id: OPERATION, workflow_step: leader.replicaId}],
    'the rows are the leading replica\'s, never a follower\'s');
  t.equal(after.rowSetComplete, true);

  const fromDeposed = asked.filter(({targetNodeId}) => targetNodeId === deposed.nodeId);
  const fromNonLeaders = asked.filter(({targetNodeId}) => targetNodeId !== leader.nodeId);
  t.ok(fromDeposed.length > 0, 'the published replica is asked');
  t.ok(fromNonLeaders.every(({answer}) => answer?.success === false),
    'no replica that does not lead answers the owner-fact read successfully');
  t.ok(fromNonLeaders.every(({answer}) => !carriesRows(answer)),
    'a refusing replica ships no rows');
  t.ok(fromDeposed.every(({answer}) => answer?.failureCode === OWNER_FACT_NOT_LEADER),
    'the deposed replica refuses with the typed owner-fact refusal');
  t.ok(asked.some(({targetNodeId, answer}) =>
    targetNodeId === leader.nodeId && answer?.success === true),
  'the leading replica is asked and answers');
});
