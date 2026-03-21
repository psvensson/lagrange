import {test} from '../../src/test-helpers/tap.js';
import {
  BootstrapService,
} from '../../src/bootstrap/bootstrap-service.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  SERVICE_LIFECYCLE_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';

function noop() {}
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

test('BootstrapService routes replica lifecycle through unified adapters', async (t) => {
  const service = new BootstrapService({
    nodeId: 'seed-node-1',
    nodeAddress: 'ws://localhost:8080',
  });
  service.logger = silentLogger;

  let createCount = 0;
  let startCount = 0;

  // Patch phase owners directly — delegate bundles route to them (D2.3).
  service.seedMessageGroupsPhase
    .createBootstrapMessageGroupReplica = async () => {
      createCount += 1;
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    };
  service.seedMessageGroupsPhase
    .startBootstrapMessageGroupReplica = async () => {
      startCount += 1;
      return {status: SERVICE_LIFECYCLE_STATE.RUNNING};
    };

  await service.seedInfrastructurePhase
    .initializeUnifiedLifecycleOwners();

  const descriptor = service.seedInfrastructurePhase
    .createBootstrapServiceDescriptor(
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      'mg-1-r0',
    );
  service.seedInfrastructurePhase
    .queueBootstrapServiceReplica(descriptor, {
      serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      replicaId: 'mg-1-r0',
    });

  await service.seedInfrastructurePhase
    .triggerBootstrapReconciler(
      'test_bootstrap_lifecycle_routing',
    );

  t.equal(createCount, 1,
    'create hook should execute via lifecycle adapter');
  t.equal(startCount, 1,
    'start hook should execute via lifecycle adapter');

  service.seedInfrastructurePhase
    .stopUnifiedLifecycleOwners();
});

test('NodeJoiningService routes replica lifecycle through unified adapters', async (t) => {
  const service = new NodeJoiningService({
    nodeId: 'joining-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });
  service.logger = silentLogger;

  let createCount = 0;
  let startCount = 0;

  service.createJoinMessageGroupReplica = async () => {
    createCount += 1;
    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  };
  service.startJoinMessageGroupReplica = async () => {
    startCount += 1;
    return {status: SERVICE_LIFECYCLE_STATE.RUNNING};
  };

  await service.initializeJoiningLifecycleOwners();

  const descriptor = service.createJoinServiceDescriptor(
    UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    'mg-join-r0',
  );
  service.queueJoinServiceReplica(descriptor, {
    serviceType: UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
    replicaId: 'mg-join-r0',
  });

  await service.triggerJoinReconciler('test_join_lifecycle_routing');

  t.equal(createCount, 1,
    'create hook should execute via lifecycle adapter');
  t.equal(startCount, 1,
    'start hook should execute via lifecycle adapter');

  service.stopJoiningLifecycleOwners();
});
