// The fresh-leader absence gap (S0 of the fallback-read closure, lead rulings
// Q2(b); transition record s0-transition-record.md 16.7 and 19).
//
// A leader-REQUIRED read that is not an owner fact (OWNER_RPC_REQUIRED +
// leaderMode REQUIRED) is qualified only by "the serving replica's core says
// it leads". A freshly elected leader that has not applied its election log
// can hold, unapplied, a row its predecessor committed; such a read answers
// success with an empty row set, which a consumer reads as absence. No
// absence-dependent consumer may rely on it; each migrates to readOwnerFact.
//
// 1. Property (green): at exactly that read point the owner-fact path refuses
//    typed and never answers the row as absent. The plain read's answer at the
//    same point is recorded as a comment, not asserted.
// 2. Census (green while the bound holds): the leader-REQUIRED reads not yet
//    on readOwnerFact are counted by scripts/checks/
//    leader-required-read-census-ratchet.js; the count may not exceed its
//    one-way baseline, which may only decrease as consumers migrate.
//
// Owner path: readOwnerFact / gateway.readAuthoritativeRows ->
// executeAuthoritativeSystemTableRead -> PartitionService.handleRemoteQuery.
// Real: the fixture's raft-rs ledger group. Substituted: raft traffic that
// would tell the new leader its predecessor's entry committed, and the new
// leader's appends, are held back (cdc-owner-fact-group-fixture.js
// freshLeaderBehindCommit).
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  censusLeaderRequiredReads,
  readBaselineCount,
} from '../../scripts/checks/leader-required-read-census-ratchet.js';
import {READ_SQL, TABLE, openLedgerGroupSurface, ownerFactDraft} from
  './cdc-owner-fact-group-fixture.js';

const OPERATION = 'committed-by-the-previous-leader';
const TEST_TIMEOUT_MS = 120000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STRICT = Object.freeze({
  authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER.REQUIRED,
});

test('readOwnerFact refuses typed at a fresh leader that holds, unapplied, a row its ' +
  'predecessor committed: the row is never answered as absent', {timeout: TEST_TIMEOUT_MS},
async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [previous, , fresh] = group.services;
  await group.settleLeader(previous);
  const {committedIndex} = await group.freshLeaderBehindCommit(previous, fresh, OPERATION);
  const surface = await group.surfaceOf(fresh.nodeId, {leaderNodeId: fresh.nodeId});
  const ownerFact = await readOwnerFact(surface.readLeaderRequired, ownerFactDraft([OPERATION]));
  t.equal(ownerFact.state, STATE.UNAVAILABLE, 'never READY at that read point');
  t.equal(ownerFact.reason, REASON.ELECTION_LOG_NOT_APPLIED, 'typed: the election log');
  t.equal(Object.hasOwn(ownerFact, 'rows'), false, 'no rows');
  const plain = await surface.readLeaderRequired(TABLE, READ_SQL, [OPERATION], STRICT);
  t.comment(JSON.stringify({plainLeaderRequiredRead: {success: plain.success,
    rows: plain.rows, failureCode: plain.failureCode ?? null}, committedIndex}));
});

test('census: leader-REQUIRED reads not yet on readOwnerFact stay within their one-way bound',
  async (t) => {
    const census = censusLeaderRequiredReads(ROOT);
    const baseline = readBaselineCount(ROOT);
    t.ok(census.scannedFiles > 0, 'the census scanned src');
    t.ok(census.findings.length <= baseline,
      `${census.findings.length} sites within the baseline of ${baseline}: migrate a read ` +
      'to readOwnerFact instead of adding a plain leader-REQUIRED read');
  });
