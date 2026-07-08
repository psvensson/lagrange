import {test} from '../../src/test-helpers/tap.js';
import {STATE} from '../../src/constants/index.js';
import {CONNECTION_STATE} from '../../src/constants/transport.js';
import {
  hasLiveTransportEvidence,
} from '../../src/control-plane/live-transport-evidence.js';

const NODE = 'node-a';

/**
 * Build a stub message router whose getConnectionState returns a fixed value.
 * @param {*} value - Value to return for any nodeId.
 * @return {{getConnectionState: Function}}
 */
function routerReturning(value) {
  return {getConnectionState: () => value};
}

test('hasLiveTransportEvidence is true for a CONNECTED live router', (t) => {
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: routerReturning(STATE.CONNECTED)}),
    true,
    'connected → true',
  );
  t.end();
});

test('hasLiveTransportEvidence lowercases mixed-case CONNECTED', (t) => {
  for (const variant of ['CONNECTED', 'Connected', 'ConNecTed']) {
    t.equal(
      hasLiveTransportEvidence(NODE, {messageRouter: routerReturning(variant)}),
      true,
      `${variant} → true (case-folded)`,
    );
  }
  t.end();
});

test('hasLiveTransportEvidence is false for every non-connected live state', (t) => {
  const nonConnected = [
    CONNECTION_STATE.DISCONNECTED,
    CONNECTION_STATE.CONNECTING,
    CONNECTION_STATE.RECONNECTING,
    CONNECTION_STATE.CLOSED,
    STATE.READY,
  ];
  for (const state of nonConnected) {
    t.equal(
      hasLiveTransportEvidence(NODE, {messageRouter: routerReturning(state)}),
      false,
      `${state} → false`,
    );
  }
  t.end();
});

test('hasLiveTransportEvidence is false for an absent/unknown nodeId', (t) => {
  // A node the router has never seen typically yields undefined/null.
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: routerReturning(undefined)}),
    false,
    'undefined router state → false',
  );
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: routerReturning(null)}),
    false,
    'null router state → false',
  );
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: routerReturning('')}),
    false,
    'empty router state → false',
  );
  t.end();
});

test('hasLiveTransportEvidence fails closed on a missing router', (t) => {
  t.equal(
    hasLiveTransportEvidence(NODE, {}),
    false,
    'no messageRouter → false',
  );
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: null}),
    false,
    'null messageRouter → false',
  );
  t.equal(
    hasLiveTransportEvidence(NODE),
    false,
    'no evidence object → false',
  );
  t.end();
});

test('hasLiveTransportEvidence fails closed when getConnectionState is not a function', (t) => {
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: {}}),
    false,
    'absent accessor → false',
  );
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: {getConnectionState: 'nope'}}),
    false,
    'non-function accessor → false',
  );
  t.end();
});

test('hasLiveTransportEvidence fails closed when getConnectionState throws', (t) => {
  const throwingRouter = {
    getConnectionState() {
      throw new Error('router unavailable');
    },
  };
  t.equal(
    hasLiveTransportEvidence(NODE, {messageRouter: throwingRouter}),
    false,
    'throwing accessor → false',
  );
  t.end();
});
