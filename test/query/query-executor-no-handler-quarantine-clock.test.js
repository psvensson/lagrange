/**
 * The no-handler address quarantine runs on the executor's node clock
 * (one-clock finding, topology-guard owner-fact record 10.4). The executor is
 * constructed with its node's clock; an address quarantined at node time t is
 * refused until t + duration of THAT clock and routed again at exactly
 * t + duration, with no real-time wait, and host time passing alone changes
 * nothing. Witnessed through the SERVICES owner-fact read (leader required)
 * of the planner node, on services-p1, with the production duration.
 */
import {test} from '../../src/test-helpers/tap.js';
import {QUERY_DEFAULTS} from '../../src/query/query-constants.js';
import {openQuarantineWorld} from './query-executor-no-handler-quarantine-fixture.js';

function hopShape(hops) {
  return hops.map(({address, handled}) => ({address, handled}));
}

test('a no-handler quarantine of the services-p1 leader expires on the executor ' +
  'node clock at exactly its duration, with no real wait', async (t) => {
  const world = openQuarantineWorld();
  t.equal(world.quarantineMs,
    QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS,
    'the production quarantine of a control-plane partition applies');

  const refused = await world.readOwnerFact();
  t.equal(refused.success, false, 'the read is refused');
  t.same(hopShape(world.hops), [{address: world.leaderAddress, handled: false}],
    'one hop reached the leader node, which had no handler for the replica');

  world.serveLeader();
  world.clock.advance(world.quarantineMs - 1);
  const beforeExpiry = await world.readOwnerFact();
  world.clock.advance(1);
  const atExpiry = await world.readOwnerFact();
  t.comment(JSON.stringify({quarantineMs: world.quarantineMs,
    beforeExpiry: {success: beforeExpiry.success, error: beforeExpiry.error ?? null},
    atExpiry: {success: atExpiry.success, error: atExpiry.error ?? null},
    hops: hopShape(world.hops)}));

  t.equal(beforeExpiry.success, false,
    'one millisecond of node time before expiry the address is still quarantined');
  t.equal(atExpiry.success, true,
    'at mark + duration of node time the leader is routed again and answers');
  t.same(hopShape(world.hops), [
    {address: world.leaderAddress, handled: false},
    {address: world.leaderAddress, handled: true},
  ], 'the read before expiry left no hop; the read at expiry reached the leader, ' +
    'never the serving follower');
});

test('host time passing alone leaves the no-handler quarantine in force', async (t) => {
  const world = openQuarantineWorld();
  await world.readOwnerFact();
  world.serveLeader();
  const hostNow = Date.now;
  // Twice the quarantine of host time passes; the node clock does not move.
  Date.now = () => hostNow() + 2 * world.quarantineMs;
  let read;
  try {
    read = await world.readOwnerFact();
  } finally {
    Date.now = hostNow;
  }
  t.comment(JSON.stringify({success: read.success, error: read.error ?? null,
    hops: hopShape(world.hops)}));
  t.equal(read.success, false, 'the read is still refused');
  t.same(hopShape(world.hops), [{address: world.leaderAddress, handled: false}],
    'refused locally: no hop after the no-handler answer');
});
