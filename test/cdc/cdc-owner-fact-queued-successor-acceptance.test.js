// ACCEPTANCE WITNESS FOR THE RAFT OWNER'S CORRECTION B-1, RED ON PURPOSE until
// it lands (reports/verify-raft-owner-authority.md B-1; S0 corrective round,
// coordinator instruction; transition record section 19). Nothing else in the
// owner-fact read is excluded by it: every other S0 witness stays green.
//
// A leader whose own core turn is pending (here: every raft send it makes is
// held, not dropped) queues its ticks behind that turn, so check-quorum cannot
// depose it; a successor elected meanwhile delivers envelopes of the newer
// term into the old leader's inbound queue, where they wait behind the turn
// without being stepped. The raft owner's current authority observation then
// still reports the old leader as LEADER with its term applied, and the
// receiver answers an owner fact from it. The correction reports such a leader
// unsettled (a queued envelope's term exceeds its status term); this witness
// turns green when the receiver refuses on that signal.
//
// Owner path: PartitionService.handleRemoteQuery with the owner-fact leaderRead
// field, in process and over the query transport. Real: the fixture's
// three-replica raft-rs ledger group and a real election of a successor.
// Substituted: the old leader's raft sends are left pending
// (cdc-owner-fact-group-fixture.js holdPendingSendsOf).
import {OWNER_FACT_UNAVAILABLE_REASON as REASON} from
  '../../src/control-plane/control-plane-owner-fact-read.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {test} from '../../src/test-helpers/tap.js';
import {openLedgerGroupSurface, ownerFactRequestTo} from './cdc-owner-fact-group-fixture.js';

const OPERATION = 'queued-successor-operation';
const TEST_TIMEOUT_MS = 120000;

function refusedWithoutRows(answer) {
  return answer?.success === false && answer?.rowSet === undefined &&
    answer?.rows === undefined;
}

test('B-1 ACCEPTANCE (red until the raft owner\'s correction): a leader whose successor\'s ' +
  'envelope is delivered but still queued behind its own pending turn refuses an owner fact',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  const group = await openLedgerGroupSurface(t, import.meta.url);
  const [old, first, second] = group.services;
  await group.settleLeader(old);
  for (const service of group.services) group.seedRow(service, OPERATION);
  const oldTerm = Number(old.raft.readStatus().term);
  const held = group.holdPendingSendsOf(old, () => true);
  const successor = () => [first, second].find((service) => {
    const status = service.raft.readStatus();
    return status.role === RAFT_ROLE.LEADER && Number(status.term) > oldTerm;
  });
  t.equal(await group.waitFor(() => successor() !== undefined &&
    group.deliveredTo(old, (message) => Number(message.term) > oldTerm) > 0), true,
  'setup: a successor leads a newer term and its envelope was delivered to the old leader');
  t.ok(held.held() > 0, 'setup: the old leader\'s turn is pending at a held send');
  t.equal(old.raft.readStatus().role, RAFT_ROLE.LEADER,
    'setup: the old leader has not stepped the newer term');
  const request = ownerFactRequestTo(old, [OPERATION]);
  const local = await old.handleRemoteQuery(structuredClone(request));
  const remote = await group.deliverOverTransport(second.nodeId, old, structuredClone(request));
  t.ok(refusedWithoutRows(local), 'in process: refused, no rows');
  t.ok(refusedWithoutRows(remote), 'over the transport: refused, no rows');
  t.not(local?.failureCode, REASON.ELECTION_LOG_NOT_APPLIED,
    'the refusal is about leadership, not the election log');
  held.release();
});
