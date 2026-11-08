import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {HeartbeatService} from '../../src/control-plane/heartbeat-service.js';
import {LeaseService} from '../../src/control-plane/lease-service.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {ControlPlaneReadinessService} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  CONTROL_PLANE_READINESS_COLLABORATOR,
  CONTROL_PLANE_READINESS_ERROR_CODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createReadinessServiceForTest,
  partialReadinessFake,
} from '../helpers/readiness-service-fixture.js';
import {
  clearRegisteredControlPlaneSystemTableGateway,
  registerControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-gateway-registry.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

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
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'node-a',
  });
  const leaseService = new LeaseService({
    nodeId: 'node-a',
    nodeLeaseOwner: {},
  });
  const readinessService = createReadinessServiceForTest({nodeId: 'node-a'});
  t.teardown(() => readinessService.shutdown());
  const dispatchService = new ReplicaDispatchService({
    nodeId: 'node-a',
    controlPlaneReadinessService: partialReadinessFake(),
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
  // A readiness service without its system-table cache is a construction
  // refusal, never a degraded service that could fall back to the
  // registered gateway (quest readiness-service-constructor-injection).
  t.throws(
    () => new ControlPlaneReadinessService({nodeId: 'node-a'}),
    {
      code: CONTROL_PLANE_READINESS_ERROR_CODE.COLLABORATOR_MISSING,
      collaborator: CONTROL_PLANE_READINESS_COLLABORATOR.SYSTEM_TABLE_CACHE,
    },
    'ControlPlaneReadinessService refuses construction without its cache',
  );
  t.not(
    readinessService.controlPlaneSystemTableGateway,
    sentinelGateway,
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
