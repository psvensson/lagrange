// Accepted work at instant T cannot escape T through an invisible promise
// continuation.
//
// This is the structural proof for the rebalancer's current-work completion
// contract, and it replaces a retired witness that rested on incidental
// planning-read traffic. A reconcile chain need not create a timer or a
// virtual event, so nothing the deterministic scheduler can see reports it:
// only the owner's own contract does. If instant closure does not consume
// that contract, T closes while the reconcile is still running and the effect
// lands in a later instant - or, at the end of a scenario, in the next
// scenario.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from
  '../../src/workflow/reconcile-queue-constants.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {closeCurrentInstant} from '../simulation/formation-sim-quiescence.js';

const OWNER_KEY = 'partition/ledger-p1';

// One real queue, one reconcile that crosses a pure promise continuation and
// only then produces its effect. Nothing here is a timer or a virtual event,
// which is the whole point.
function scenario() {
  const network = createVirtualNetwork({startMs: 0});
  network.registerNode('node-0', () => {});
  const effects = [];
  let release = null;
  const crossed = new Promise((resolve) => {
    release = resolve;
  });
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async () => {
      await crossed;
      effects.push(`effect@${network.now()}`);
    },
  });
  return {network, queue, effects, release};
}

test('with the owner in the closure set the effect lands before T closes',
  async () => {
    const {network, queue, effects, release} = scenario();
    queue.enqueue(OWNER_KEY, RECONCILE_REASON.PERIODIC_CHECK);
    // The continuation is released by ordinary owner progress, exactly as a
    // production chain resumes; the closure must not be able to finish before
    // the work the owner already accepted.
    release();
    await closeCurrentInstant({
      network,
      owners: [() => queue.awaitCurrentWorkIdle()],
    });
    assert.deepEqual(effects, ['effect@0'],
      'the accepted reconcile completed inside the instant that admitted it');
    queue.shutdown();
  });

test('MUTATION: without the owner in the closure set, T closes first',
  async () => {
    const {network, queue, effects, release} = scenario();
    queue.enqueue(OWNER_KEY, RECONCILE_REASON.PERIODIC_CHECK);
    release();
    // The mutation is the omission itself: closure that consults only the
    // deterministic scheduler, as it did before the planner had a contract.
    await closeCurrentInstant({network, owners: []});
    assert.deepEqual(effects, [],
      'the instant closed while accepted work was still running, which is ' +
      'exactly the escape the completion contract exists to prevent');
    // The work is still owed, and the contract still knows it.
    await queue.awaitCurrentWorkIdle();
    assert.deepEqual(effects, ['effect@0'],
      'it lands afterwards - in a later instant, or in the next scenario');
    queue.shutdown();
  });
