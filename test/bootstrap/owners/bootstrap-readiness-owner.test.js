import {test} from '../../../src/test-helpers/tap.js';
import {BootstrapReadinessOwner} from '../../../src/bootstrap/owners/bootstrap-readiness-owner.js';

test('BootstrapReadinessOwner buildPriorityControlPlaneRecoveryUnavailableHealth maps diagnostic failure to unavailable reason code', async (t) => {
  const owner = new BootstrapReadinessOwner({
    nodeId: 'test-node',
    now: () => 1234,
  });

  const health = owner.buildPriorityControlPlaneRecoveryUnavailableHealth(
    'control_plane_recovery_diagnostics_read_failed',
    new Error('WebSocket was closed before the connection was established')
  );

  t.equal(health.healthy, false);
  t.equal(health.reasonCode, 'priority_control_plane_recovery_diagnostics_unavailable');
  t.equal(health.retryAfterMs, 15000);
  t.equal(health.details.retryAfterMs, 15000);
  t.end();
});
