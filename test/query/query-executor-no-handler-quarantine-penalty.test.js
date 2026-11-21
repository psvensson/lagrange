/**
 * The penalty of one semantic refusal (query-executor-quarantine-record.md,
 * section 7; red until the lead rules on the proposal there). The services-p1
 * leader's node is alive: it answers the planner's leader-required owner-fact
 * read "no handler" once, and its handler serves 200 ms of node time later,
 * with no change to its SERVICES row. The planner issues the read every 5 s
 * of node time (the runtime-service planner's priority cadence). Production
 * today: the executor refuses the read locally, without a hop, for the whole
 * control-plane quarantine although the handler serves; the read never falls
 * back to the serving follower.
 */
import {test} from '../../src/test-helpers/tap.js';
import {openQuarantineWorld} from './query-executor-no-handler-quarantine-fixture.js';

const HANDLER_SERVES_AFTER_MS = 200;
const PLANNER_TURN_INTERVAL_MS = 5000;
// Bounds the witness: twice the turns the production quarantine spans.
const MAX_PLANNER_TURNS = 13;

test('a leader that answered no handler once and serves 200 ms later is reached ' +
  'by the next planner turn', async (t) => {
  const world = openQuarantineWorld();
  const startMs = world.clock.now();
  world.clock.setTimeout(world.serveLeader, HANDLER_SERVES_AFTER_MS);
  const turns = [];
  for (let turn = 0; turn < MAX_PLANNER_TURNS; turn += 1) {
    const hopsBefore = world.hops.length;
    const read = await world.readOwnerFact();
    turns.push(Object.freeze({atMs: world.clock.now() - startMs,
      success: read.success === true, hopped: world.hops.length > hopsBefore,
      error: read.success === true ? null : (read.error ?? null)}));
    if (read.success === true) break;
    world.clock.advance(PLANNER_TURN_INTERVAL_MS);
  }
  const firstSuccess = turns.find(({success}) => success);
  const wasted = turns.filter(({atMs, success}) =>
    atMs >= HANDLER_SERVES_AFTER_MS && !success);
  t.comment(JSON.stringify({
    quarantineMs: world.quarantineMs,
    turnIntervalMs: PLANNER_TURN_INTERVAL_MS,
    handlerServesAfterMs: HANDLER_SERVES_AFTER_MS,
    wastedTurns: wasted.length,
    localRefusals: wasted.filter(({hopped}) => !hopped).length,
    firstSuccessAtMs: firstSuccess ? firstSuccess.atMs : null,
    delayAfterServingMs: firstSuccess ?
      firstSuccess.atMs - HANDLER_SERVES_AFTER_MS : null,
    turns,
  }));

  t.same({atMs: turns[0].atMs, success: turns[0].success, hopped: turns[0].hopped},
    {atMs: 0, success: false, hopped: true},
    'the first read reached the leader node and was answered no handler');
  t.ok(world.hops.every(({address}) => address === world.leaderAddress),
    'every hop went to the leader: no fallback to the serving follower');
  t.ok(firstSuccess, 'the read is answered within the bound');
  t.equal(wasted.length, 0,
    'no planner turn after the handler serves is refused');
});
