import assert from 'node:assert/strict';
import {test} from 'node:test';
import {withDeliveryLifetime} from '../../src/transport/message-router-delivery-lifetime.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {CDC_ROUTER_TEST, cdcRouterFixture} from '../test-helpers/message-router-cdc-fixture.js';

const CASE_TIMEOUT_MS = 2000;
const DELIVERY_SOURCE = 'message:cdc-boundary-witness';

test('pending-response owner classifies enforcing expiry even when its timer has not run',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const id = 'delayed-response-timer';
    const promise = f.router.registerPendingResponse(id, CDC_ROUTER_TEST.PEER,
      {deliverySource: DELIVERY_SOURCE});
    assert.equal(f.router.armPendingResponseTimeout(id, CDC_ROUTER_TEST.SHORT_MS), true);
    const old = f.router.pendingResponses.get(id);
    f.clock.elapse(CDC_ROUTER_TEST.SHORT_MS);
    assert.equal(f.router.pendingResponses.get(id), old,
      'the due timer is intentionally still undelivered');
    const disposition = f.router.resolveServiceResponseDisposition(id, {result: {accepted: true}});
    assert.equal(disposition.kind, 'absorbed_late');
    assert.equal(disposition.classification, 'late_after_timeout');
    assert.equal(disposition.deliverySource, DELIVERY_SOURCE);
    await assert.rejects(promise, {message: ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT});
    assert.equal(f.router.pendingResponses.has(id), false);

    const successor = f.router.registerPendingResponse(id, CDC_ROUTER_TEST.PEER);
    const current = f.router.pendingResponses.get(id);
    assert.notEqual(current, old);
    assert.equal(old.acceptResponse({result: {obsolete: true}}), false,
      'a captured old finalizer cannot settle a new waiter with the same text ID');
    f.clock.dispatchDue();
    assert.equal(f.router.pendingResponses.get(id), current);
    assert.equal(f.router.settlePendingResponse(id, {result: {successor: true}}), true);
    assert.deepEqual(await successor, {successor: true});
  });

test('pending-response classification consumes cancellation that wins inside remaining-time check',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const abort = new AbortController();
    const cancelled = new Error('original enclosing delivery cancelled');
    const registered = Promise.withResolvers();
    let cancelAtCheck = false;
    const id = 'synchronous-response-cancel';
    const result = withDeliveryLifetime(f.router, {
      signal: abort.signal,
      remainingMs: () => {
        if (cancelAtCheck) abort.abort(cancelled);
        return CDC_ROUTER_TEST.BUDGET_MS;
      },
    }, (options) => {
      const pending = f.router.registerPendingResponse(id, CDC_ROUTER_TEST.PEER,
        {...options, deliverySource: DELIVERY_SOURCE});
      registered.resolve();
      return pending;
    });
    result.catch(() => {});
    await registered.promise;
    cancelAtCheck = true;
    const disposition = f.router.resolveServiceResponseDisposition(id, {result: {accepted: true}});
    assert.equal(disposition.kind, 'absorbed_late');
    assert.equal(disposition.classification, 'late_after_cancelled');
    assert.equal(disposition.deliverySource, DELIVERY_SOURCE);
    await assert.rejects(result, (error) => error === cancelled,
      'classification and the public promise must agree on the actual settlement winner');
    assert.equal(f.router.pendingResponses.has(id), false);
  });

test('within-grant application refusal remains a matched service response',
  {timeout: CASE_TIMEOUT_MS}, async (t) => {
    const f = await cdcRouterFixture(t);
    const id = 'application-refusal';
    const pending = f.router.registerPendingResponse(id, CDC_ROUTER_TEST.PEER);
    f.router.armPendingResponseTimeout(id, CDC_ROUTER_TEST.SHORT_MS);
    f.clock.elapse(CDC_ROUTER_TEST.SHORT_MS - 1);
    const disposition = f.router.resolveServiceResponseDisposition(id,
      {error: 'application declined this operation'});
    assert.equal(disposition.kind, 'settled');
    assert.equal(disposition.classification, 'settled');
    await assert.rejects(pending, {message: 'application declined this operation'});
    assert.equal(f.router.retiredPendingResponses.has(id), false,
      'an application refusal is not a transport timeout retirement');
  });
