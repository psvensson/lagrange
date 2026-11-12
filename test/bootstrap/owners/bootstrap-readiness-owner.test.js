import {test} from '../../../src/test-helpers/tap.js';
import {BootstrapReadinessOwner} from '../../../src/bootstrap/owners/bootstrap-readiness-owner.js';
import {ROUTER_ERROR_MSG} from '../../../src/constants/transport.js';
import {ROUTER_CONNECTION_CLOSED_ERROR_CODE} from
  '../../../src/transport/transport-error-codes.js';

test('BootstrapReadinessOwner buildPriorityControlPlaneRecoveryUnavailableHealth maps diagnostic failure to unavailable reason code', async (t) => {
  const owner = new BootstrapReadinessOwner({
    nodeId: 'test-node',
    now: () => 1234,
  });

  const health = owner.buildPriorityControlPlaneRecoveryUnavailableHealth(
    'control_plane_recovery_diagnostics_read_failed',
    // The router's own close before any frame left (its code, not its text,
    // makes it a transport failure a re-read may cure).
    Object.assign(new Error(ROUTER_ERROR_MSG.connectionClosed('seed-node')), {
      code: ROUTER_CONNECTION_CLOSED_ERROR_CODE, recoverableBeforeSend: true,
    }),
  );

  t.equal(health.healthy, false);
  t.equal(health.reasonCode, 'priority_control_plane_recovery_diagnostics_unavailable');
  t.equal(health.retryAfterMs, 15000);
  t.equal(health.details.retryAfterMs, 15000);
  t.end();
});
