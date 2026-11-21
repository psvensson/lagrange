// Residual witness (ruling 6 of the stage-2 brief; written, not repaired):
// the published services-p1 leader is deposed without knowing it yet, the
// operation that placed a runtime replica on the target node completes
// through the new leader, and the planner's topology guard then asks the
// deposed leader for the inventory. A complete but stale answer from it
// would admit a second replica onto the node that just received one; the
// ledger admission checks nothing that would refuse it (placement admission
// census: incomplete operations only).
//
// What it shows depends on whether the deposed replica still believes it
// leads when the guard's read reaches it (check_quorum steps it down within
// one to two election timeouts of losing its quorum): the observation line
// records the deposed replica's core role at the read, the answer, and the
// decision. Red = the residual is demonstrated at this head.
//
// Composition: topology-guard-inventory-authority-fixture.js. Substituted:
// the old leader's raft traffic is held in both directions (it is cut off
// from the quorum while the query transport still reaches it); the new
// quorum's SERVICES effect of the completed operation is placed in the new
// leader's and its follower's tables (the commit through the new leader is
// not the subject; the reader answering from the deposed leader is).
import {test} from '../../src/test-helpers/tap.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {
  NODE,
  buildRuntimeOccupantRow,
  initializeGuardEnvironment,
  openPlannerHost,
  openServicesWorld,
  refusalOf,
  resetGuardEnvironment,
} from './topology-guard-inventory-authority-fixture.js';

const PORTS = createPortAllocator(import.meta.url);
const CASE_TIMEOUT_MS = 120000;

test('residual: the guard asks a deposed services-p1 leader that does not know it yet ' +
  'and must not admit a second replica onto the node that just received one',
{timeout: CASE_TIMEOUT_MS}, async (t) => {
  initializeGuardEnvironment();
  let world = null;
  try {
    world = await openServicesWorld({leaderNodeId: NODE.PEER_A, ports: PORTS});
  } finally {
    t.teardown(async () => {
      await world?.close();
      resetGuardEnvironment();
    });
  }
  await world.settleLeader(NODE.PEER_A);
  world.cutOffFromConsensus(NODE.PEER_A);
  const newLeaderNodeId = await world.awaitLeaderOtherThan(NODE.PEER_A);
  const electedAtMs = Date.now();
  // The completed operation's effect: a runtime replica on the target node,
  // in the new quorum's tables only.
  world.seedRowOnNodes([NODE.PLANNER, NODE.PEER_B],
    buildRuntimeOccupantRow(NODE.PLANNER, Date.now()));
  const host = openPlannerHost(t, world, {publishedLeaderNodeId: NODE.PEER_A});
  const deposedRoleAtRead = world.replicaOn(NODE.PEER_A).raft.readStatus().role;
  const readAtMs = Date.now();
  const first = await host.createAdd();
  const ledger = host.ledgerRows();
  t.comment(`OBSERVATION deposed-leader ${JSON.stringify({newLeaderNodeId,
    deposedRoleAtRead, msFromElectionToRead: readAtMs - electedAtMs,
    hops: first.hops.map(({nodeId, refused, answer}) => ({nodeId, refused,
      success: answer?.success ?? null, failureCode: answer?.failureCode ?? null,
      witnessRole: answer?.readAuthorityWitness?.role ?? null})),
    refusal: refusalOf(first.error),
    ledger: ledger.map((row) => [row.target_node_id, row.replica_id])})}`);
  t.notEqual(newLeaderNodeId, NODE.PEER_A, 'setup: another replica leads services-p1');
  t.type(deposedRoleAtRead, 'string',
    `setup: the deposed replica's core role at the read is recorded (${deposedRoleAtRead})`);
  t.same(ledger, [], 'no second replica is admitted onto the node that just received one');
});
