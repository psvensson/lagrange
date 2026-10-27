import {handlerIdentityApi} from '../test-helpers/replica-handler-identity-fixture.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome, buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
/**
 * Behavioral contract for the messageRouter seam, plus a contract-compliant
 * stub factory.
 *
 * WHY THIS EXISTS: 178 test files hand-roll inline `messageRouter: {...}`
 * literals whose `deliver()` returns a bare `{acknowledged: true}` for
 * everything — a healthier transport than reality. Tests written against
 * those stubs pass while the live system fails (affinity-demo run-25/26:
 * a stub admitted what the real seam refused; a real transport ACK carried
 * `noHandler: true` and the wake was silently dropped). The contract below
 * pins the facets CONSUMERS actually branch on; the SAME assertions run
 * against the real MessageRouter and against the stub factory, so stub
 * drift fails a test instead of shipping.
 *
 * New tests should prefer `createContractMessageRouterStub()` over inline
 * literals; existing inline stubs migrate opportunistically.
 */

const CONTRACT_DELIVERY_STATE = Object.freeze({
  DELIVERED: 'delivered',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const CONTRACT_ERROR_CODE_NO_CONNECTION = 'ROUTER_NO_CONNECTION';
const CONTRACT_DEFAULT_RETRY_AFTER_MS = 1000;

/**
 * A contract-compliant messageRouter stub.
 *
 * Facets honored (mirrors the probed real MessageRouter):
 *  - deliver() to a registered handler resolves the owner envelope, with
 *    transport DELIVERED and the handler's verbatim answer beside it.
 *  - deliver() to an UNREGISTERED address never hangs and never lies: it
 *    resolves a transport failure with a retryable signal
 *    (`deferRetry: true`, `retryAfterMs`, `errorCode`) and
 *    `deliveryState: 'deferred'`.
 *  - `simulateNoHandlerAckAddresses`: addresses listed here reproduce the
 *    remote ACK-before-handler-lookup drop: the ACK alone is insufficient;
 *    the final transport outcome is FAILED/no_handler, with no answer.
 *
 * @param {Object} [options]
 * @param {Map<string, Function>} [options.handlers]
 * @param {string[]} [options.simulateNoHandlerAckAddresses]
 * @return {Object} messageRouter-shaped stub with register/unregister/deliver
 *   plus a `deliveries` array for assertions.
 */
function createContractMessageRouterStub(options = {}) {
  const handlers = new Map(options.handlers || []);
  const noHandlerAckAddresses = new Set(
    options.simulateNoHandlerAckAddresses || [],
  );
  const deliveries = [];
  return {
    deliveries,
    register(address, handler) {
      handlers.set(address, handler);
    },
    ...handlerIdentityApi(handlers),
    async deliver(address, message, deliveryOptions = {}) {
      deliveries.push({address, message, deliveryOptions});
      if (noHandlerAckAddresses.has(address)) {
        return buildDeliveryEnvelope(
          {acknowledged: true, noHandler: true});
      }
      const handler = handlers.get(address);
      if (!handler) {
        return buildDeliveryEnvelope(
          {
            acknowledged: false,
            noHandler: false,
            deliveryState: CONTRACT_DELIVERY_STATE.DEFERRED,
            deferRetry: true,
            errorCode: CONTRACT_ERROR_CODE_NO_CONNECTION,
            retryAfterMs: CONTRACT_DEFAULT_RETRY_AFTER_MS,
          });
      }
      const handlerResult = await handler(message);
      return buildDeliveryEnvelope(
        {acknowledged: true, deliveryState: CONTRACT_DELIVERY_STATE.DELIVERED},
        handlerResult);
    },
  };
}

/**
 * The shared contract assertions. `implementation` supplies:
 *  - name: label for assertion messages
 *  - createRouter(): async -> {router, teardown} where router has
 *    register/deliver
 *  - registeredAddress / missingAddress: addresses valid for that
 *    implementation
 * @param {Object} t - tap test object
 * @param {Object} implementation
 */
function assertDeliveredFacets(t, name, delivered) {
  const transport = deliveryTransportOf(delivered);
  const answer = deliveryAnswerOf(delivered);
  t.equal(
    isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivered)),
    true,
    `${name}: registered-handler delivery acknowledges`,
  );
  t.equal(
    transport.noHandler,
    false,
    `${name}: registered-handler delivery reports noHandler=false ` +
      '(consumers branch on this field)',
  );
  t.equal(
    transport.deliveryState,
    'delivered',
    `${name}: registered-handler deliveryState is delivered`,
  );
  t.equal(
    answer?.contractProbe,
    true,
    `${name}: the handler payload is kept in the answer namespace`,
  );
}

function assertUndeliverableFacets(t, name, undeliverable) {
  const transport = deliveryTransportOf(undeliverable);
  t.equal(
    isDeliveredTransportDeliveryOutcome(deliveryTransportOf(undeliverable)),
    false,
    `${name}: an undeliverable address never fakes an ACK`,
  );
  t.ok(
    transport.deferRetry === true ||
      Number.isFinite(transport.retryAfterMs) ||
      typeof transport.errorCode === 'string',
    `${name}: an undeliverable address carries a retryable signal ` +
      '(deferRetry/retryAfterMs/errorCode) instead of hanging or throwing ' +
      'raw',
  );
  t.ok(
    transport.deliveryState === 'deferred' ||
      transport.deliveryState === 'failed',
    `${name}: undeliverable deliveryState is deferred/failed, never ` +
      'delivered',
  );
}

async function assertMessageRouterDeliveryContract(t, implementation) {
  const {router, teardown} = await implementation.createRouter();
  try {
    router.register(
      implementation.registeredAddress,
      async () => ({contractProbe: true}),
    );
    const delivered = await router.deliver(
      implementation.registeredAddress,
      {type: 'CONTRACT_PROBE'},
      {},
    );
    assertDeliveredFacets(t, implementation.name, delivered);

    const undeliverable = await router.deliver(
      implementation.missingAddress,
      {type: 'CONTRACT_PROBE'},
      {timeoutMs: 1500},
    );
    assertUndeliverableFacets(t, implementation.name, undeliverable);
  } finally {
    await teardown?.();
  }
}

export {
  assertMessageRouterDeliveryContract,
  createContractMessageRouterStub,
};
