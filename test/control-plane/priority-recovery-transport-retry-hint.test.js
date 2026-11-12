// The priority-recovery diagnostics answer carries a retry hint when the
// failure that made it unavailable is a transport failure a re-read may cure
// (the transport's one delivery-failure decision), never when an error text
// happens to say "closed", "WebSocket" or "transport". The readiness owner
// and the bootstrap owner answer alike: one function, one hint.
import {test} from '../../src/test-helpers/tap.js';
import {withPriorityRecoveryTransportRetryHint} from
  '../../src/control-plane/control-plane-readiness-evidence-reasons.js';
import {PRIORITY_RECOVERY_TRANSPORT_RETRY_AFTER_MS} from
  '../../src/control-plane/priority-recovery-transport-retry-hint.js';
import {assignBootstrapControlPlaneRecoveryHealthMethods} from
  '../../src/bootstrap/owners/bootstrap-control-plane-recovery-health.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {
  ROUTER_HANDLER_FAILED_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';

class BootstrapOwner {}
assignBootstrapControlPlaneRecoveryHealthMethods(BootstrapOwner);

const hintOf = {
  readiness: (error) => withPriorityRecoveryTransportRetryHint(
    {healthy: false, details: {}}, error).retryAfterMs,
  bootstrap: (error) => new BootstrapOwner()
    .buildPriorityControlPlaneRecoveryUnavailableHealth('x', error)
    .retryAfterMs,
};

for (const [owner, hint] of Object.entries(hintOf)) {
  test(`${owner}: the hint follows the transport decision`, async (t) => {
    t.equal(hint(Object.assign(
      new Error(ROUTER_ERROR_MSG.noConnectionToNode('n2')),
      {code: ROUTER_NO_CONNECTION_ERROR_CODE})),
    PRIORITY_RECOVERY_TRANSPORT_RETRY_AFTER_MS, 'no connection: hinted');
    t.equal(hint(Object.assign(new Error('WebSocket connection timeout'),
      {code: WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE, retryAfterMs: 250})), 250,
    'the failure\'s own retry hint is kept');
    t.equal(hint(Object.assign(new Error('handler threw'),
      {code: ROUTER_HANDLER_FAILED_ERROR_CODE})), undefined,
    'a refusal is not hinted');
    t.equal(hint(new Error('The database connection is closed')), undefined,
      'a text that says "closed" is no transport failure');
  });
}
