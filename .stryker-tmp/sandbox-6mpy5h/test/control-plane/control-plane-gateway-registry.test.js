// @ts-nocheck
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {ControlPlaneReadinessService} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
  registerControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-gateway-registry.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';

beforeEach(() => {
  clearRegisteredControlPlaneSystemTableGateway();
});

afterEach(() => {
  clearRegisteredControlPlaneSystemTableGateway();
});

test('runtime services require explicit gateway wiring while admin consumers ' +
  'may use the registered shared gateway', async (t) => {
  const sentinelGateway = {id: 'shared-gateway'};
  registerControlPlaneSystemTableGateway(sentinelGateway);

  const heartbeatService = new HeartbeatService({
    nodeId: 'node-a',
  });
  const leaseService = new LeaseService({
    nodeId: 'node-a',
    nodeLeaseOwner: {},
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'node-a',
  });
  const dispatchService = new ReplicaDispatchService({
    nodeId: 'node-a',
  });
  const serviceDiscovery = new AdminServiceDiscovery({
    nodeId: 'node-a',
  });

  t.equal(
    heartbeatService.controlPlaneSystemTableGateway,
    null,
    'HeartbeatService should not use the registered gateway implicitly',
  );
  t.equal(
    leaseService.controlPlaneSystemTableGateway,
    null,
    'LeaseService should not use the registered gateway implicitly',
  );
  t.equal(
    readinessService.controlPlaneSystemTableGateway,
    null,
    'ControlPlaneReadinessService should not use the registered gateway implicitly',
  );
  t.equal(
    dispatchService.controlPlaneSystemTableGateway,
    null,
    'ReplicaDispatchService should not use the registered gateway implicitly',
  );
  t.equal(
    serviceDiscovery.controlPlaneSystemTableGateway,
    sentinelGateway,
    'AdminServiceDiscovery should use the registered gateway',
  );
});
