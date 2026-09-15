// The gateway's current-work completion boundary: "has every request this
// gateway already accepted reached its terminal owner bookkeeping?"
//
// The four coalescing ledgers are the authority, and the defect these
// witnesses seal is an ORDERING one: the terminal section used to retire the
// completed request before installing the replacement it had already
// accepted, leaving a transient interval in which an observer of the ledgers
// saw zero accepted work while work was in fact outstanding. Every caller
// result still looked correct, which is exactly why the counterexample below
// asserts the interval rather than the final values.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';

const REQUEST_KEY = 'nodes:node-a';

function heldPromise() {
  let release = null;
  let fail = null;
  const promise = new Promise((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  return {promise, release, fail};
}

// Pending without counting host turns: a genuinely held promise never
// settles, and the sentinel is deferred past an async function's own
// continuation so a resolved-but-chained promise is not misread as pending.
async function isPending(promise) {
  const sentinel = Symbol('pending');
  let deferred = Promise.resolve(sentinel);
  for (let turn = 0; turn < 8; turn += 1) deferred = deferred.then((v) => v);
  const winner = await Promise.race([
    promise.then(() => 'settled', () => 'settled'), deferred]);
  return winner === sentinel;
}

function createGateway() {
  return new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {async executeAuthoritativeSystemTableRead() {
      return {success: true, rows: []};
    }},
    sqlQueryEngine: {async executeQuery() {
      return {success: true, rows: []};
    }},
    systemTableCache: {getAll: () => [], applySystemTableChange() {}},
  });
}

test('1. an accepted single-flight mutation keeps the owner busy until its terminal bookkeeping',
  async () => {
    const gateway = createGateway();
    const held = heldPromise();
    const caller = gateway.scheduleMutationExecution(
      REQUEST_KEY, () => held.promise);
    assert.equal(gateway.inFlightMutationRequestsByKey.size, 1,
      'the ledger holds the accepted work');
    assert.equal(await isPending(caller), true, 'the caller result is pending');
    const idle = gateway.awaitCurrentWorkIdle();
    assert.equal(await isPending(idle), true, 'and the owner is not idle');
    held.release({success: true});
    await caller;
    await idle;
    assert.equal(gateway.inFlightMutationRequestsByKey.size, 0,
      'the ledger is empty once terminal bookkeeping has run');
  });

test('2. a replacement accepted behind an in-flight mutation is never invisible',
  async () => {
    const gateway = createGateway();
    const first = heldPromise();
    const second = heldPromise();
    const callerA = gateway.scheduleMutationExecution(
      REQUEST_KEY, () => first.promise);
    const callerB = gateway.runReplacePendingMutation(
      REQUEST_KEY, () => second.promise);
    assert.equal(gateway.pendingReplaceMutationRequestsByKey.size, 1,
      'the replacement is accepted work while it waits');
    const idle = gateway.awaitCurrentWorkIdle();
    assert.equal(await isPending(idle), true);
    // The transition itself: at no point may both ledgers be empty while the
    // replacement is still owed. Sampling after A settles is the observation
    // the old ordering failed.
    first.release({success: true});
    await callerA;
    const accepted = gateway.inFlightMutationRequestsByKey.size +
      gateway.pendingReplaceMutationRequestsByKey.size;
    assert.ok(accepted > 0,
      'accepted work is continuously represented across the handoff');
    assert.equal(await isPending(idle), true,
      'and the owner is still not idle while the replacement runs');
    second.release({success: true});
    await callerB;
    await idle;
    assert.equal(gateway.inFlightMutationRequestsByKey.size, 0);
    assert.equal(gateway.pendingReplaceMutationRequestsByKey.size, 0);
  });

test('3. a superseded replacement settles for its caller while the owner stays busy',
  async () => {
    const gateway = createGateway();
    const first = heldPromise();
    const third = heldPromise();
    const callerA = gateway.scheduleMutationExecution(
      REQUEST_KEY, () => first.promise);
    const callerB = gateway.runReplacePendingMutation(
      REQUEST_KEY, () => Promise.resolve({success: true, from: 'B'}));
    const callerC = gateway.runReplacePendingMutation(
      REQUEST_KEY, () => third.promise);
    // B is superseded by C and receives its existing terminal result.
    const supersededResult = await callerB;
    assert.ok(supersededResult, 'the superseded caller gets its result');
    assert.equal(gateway.pendingReplaceMutationRequestsByKey.size, 1,
      'C is the accepted replacement and is represented before B disappears');
    const idle = gateway.awaitCurrentWorkIdle();
    assert.equal(await isPending(idle), true);
    first.release({success: true});
    await callerA;
    assert.equal(await isPending(idle), true, 'C is still owed');
    third.release({success: true});
    await callerC;
    await idle;
    assert.equal(gateway.inFlightMutationRequestsByKey.size, 0);
    assert.equal(gateway.pendingReplaceMutationRequestsByKey.size, 0);
  });

test('4. caller completion and owner completion are different events', async () => {
  // The causal witness. A saturation-bypassed execution is accepted work that
  // enters no keyed map at all, so the coalescing ledgers cannot answer
  // whether the gateway is idle; only the lifecycle registry can. Collapsing
  // owner completion back onto the caller's result promise makes this red.
  const gateway = createGateway();
  const firstHeld = heldPromise();
  const bypassHeld = heldPromise();
  // Fill the single tracked slot, then force the bypass path behind it.
  const tracked = gateway.runSingleFlight(
    gateway.inFlightReadRequestsByKey, 'read:a', () => firstHeld.promise,
    {maxTrackedRequests: 1});
  const bypassed = gateway.runSingleFlight(
    gateway.inFlightReadRequestsByKey, 'read:b', () => bypassHeld.promise,
    {maxTrackedRequests: 1});
  assert.equal(gateway.inFlightReadRequestsByKey.size, 1,
    'the bypassed request is in no keyed map');
  assert.equal(gateway.activeOwnerWorkCount(), 2,
    'but the gateway owns both accepted executions');
  const idle = gateway.awaitCurrentWorkIdle();
  // The tracked caller may finish while the bypassed work is still owed.
  firstHeld.release({success: true});
  await tracked;
  assert.equal(await isPending(idle), true,
    'a resolved caller result is not owner completion');
  assert.equal(gateway.inFlightReadRequestsByKey.size, 0,
    'every keyed ledger is empty while accepted work is still outstanding');
  assert.ok(gateway.activeOwnerWorkCount() > 0,
    'and the lifecycle registry still reports owned work');
  bypassHeld.release({success: true});
  await bypassed;
  await idle;
  assert.equal(gateway.activeOwnerWorkCount(), 0);
});

test('5. a rejected execution still retires its lifecycle record', async () => {
  const gateway = createGateway();
  const held = heldPromise();
  const caller = gateway.scheduleMutationExecution(
    REQUEST_KEY, () => held.promise);
  caller.catch(() => undefined);
  assert.equal(gateway.activeOwnerWorkCount(), 1);
  const idle = gateway.awaitCurrentWorkIdle();
  held.fail(new Error('execution failed'));
  await caller.catch(() => undefined);
  await idle;
  assert.equal(gateway.activeOwnerWorkCount(), 0,
    'a failure never leaves the owner permanently busy');
  assert.equal(gateway.inFlightMutationRequestsByKey.size, 0);
});
