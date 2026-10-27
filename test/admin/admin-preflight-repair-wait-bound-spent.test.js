/**
 * Spent-wait witness for the admin owner: the preflight's bounded wait for
 * the authoritative discovery repair logs exactly one wait_bound_spent
 * ERROR when the budget is spent, none when the repair settles in time,
 * and still answers the skipped-repair result on expiry.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {AdminPreflightSnapshot} from
  '../../src/admin/admin-preflight-snapshot.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';


function createSnapshot(capture) {
  return new AdminPreflightSnapshot({
    nodeId: 'node-preflight-1',
    logger: capture.logger,
    authoritativeRepairWaitBudgetMs: 5,
  });
}

test('preflight repair wait expiry logs one wait_bound_spent ERROR and ' +
  'still answers the skipped repair', async (t) => {
  const capture = captureLogger();
  const snapshot = createSnapshot(capture);

  const repair = await snapshot.awaitAuthoritativeRepairWithinBudget(
    new Promise(() => {}),
  );

  t.same(repair, {applied: false, skipped: true, tableCount: 0});
  t.equal(capture.errors().length, 1, 'exactly one ERROR');
  const context = capture.errors()[0].context;
  t.equal(context.event, WAIT_BOUND_SPENT_EVENT);
  t.equal(context.wait, 'PREFLIGHT_AUTHORITATIVE_REPAIR_WAIT_BUDGET_MS');
  t.equal(context.boundMs, 5);
  t.same(context.lastObserved, {repairState: 'in_flight'});
  t.same(context.scope, {nodeId: 'node-preflight-1'});
  t.end();
});

test('a repair that settles within the preflight budget logs no ERROR',
  async (t) => {
    const capture = captureLogger();
    const snapshot = createSnapshot(capture);
    const settled = {applied: true, skipped: false, tableCount: 2};

    const repair = await snapshot.awaitAuthoritativeRepairWithinBudget(
      Promise.resolve(settled),
    );

    t.same(repair, settled);
    t.equal(capture.errors().length, 0);
    t.end();
  });
