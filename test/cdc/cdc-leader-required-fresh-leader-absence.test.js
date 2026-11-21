// RECORDED SAFETY FINDING, LEFT RED ON PURPOSE (S0 of the fallback-read
// closure, lead rulings Q2(b); transition record s0-transition-record.md).
// It turns green only when the leader-REQUIRED consumers that are not owner
// facts migrate to readOwnerFact in the following slices; do not weaken it.
//
// A leader-REQUIRED read that is not an owner fact (every existing
// OWNER_RPC_REQUIRED + leaderMode REQUIRED site) is qualified only by "the
// serving replica's core says it leads". A freshly elected leader that has
// not yet committed an entry of its own term can hold, unapplied, a row its
// predecessor committed; such a read then answers success with an empty row
// set, which a consumer reads as absence. readOwnerFact refuses the same read
// point typed (test/cdc/cdc-owner-fact-receiver-read-point.test.js); until a
// consumer has migrated, NO absence-dependent consumer may rely on a plain
// leader-REQUIRED read, and an effect-time condition protects it only if it
// revalidates the same predicate.
//
// Owner path: gateway.readAuthoritativeRows (OWNER_RPC_REQUIRED, leader
// REQUIRED) -> executeAuthoritativeSystemTableRead ->
// PartitionService.handleRemoteQuery. Real: the fixture's raft-rs ledger
// group. Substituted: raft traffic that would tell the new leader its
// predecessor's entry committed, and the new leader's appends, are held back
// (cdc-owner-fact-group-fixture.js freshLeaderBehindCommit).
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {READ_SQL, TABLE, openLedgerGroupSurface} from './cdc-owner-fact-group-fixture.js';

const OPERATION = 'committed-by-the-previous-leader';
const TEST_TIMEOUT_MS = 120000;
const STRICT = Object.freeze({
  authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER.REQUIRED,
});

test('FINDING (open): a leader-REQUIRED read that is not an owner fact answers a row its ' +
  'leader\'s predecessor committed as absent', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [previous, , fresh] = group.services;
  await group.settleLeader(previous);
  const {committedIndex} = await group.freshLeaderBehindCommit(previous, fresh, OPERATION);
  const surface = await group.surfaceOf(fresh.nodeId, {leaderNodeId: fresh.nodeId});
  const answer = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], STRICT);
  const status = fresh.raft.readStatus();
  t.comment(JSON.stringify({observed: {success: answer.success, rows: answer.rows,
    failureCode: answer.failureCode ?? null, witness: answer.readAuthorityWitness ?? null,
    committedIndex, freshLeader: {role: status.role, commitIndex: status.commitIndex,
      appliedIndex: status.appliedIndex, confChangePending: status.confChangePending}}}));
  t.notOk(answer.success === true && Array.isArray(answer.rows) && answer.rows.length === 0,
    'a committed row is never answered as absent (OPEN: the plain leader-REQUIRED read ' +
    'has no read-point refusal; consumers must migrate to readOwnerFact)');
});
