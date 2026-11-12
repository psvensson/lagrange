import {captureReplicaRuntimeHost, captureReplicaRuntimeProducer, requireReplicaRuntimeProducer} from
  '../../src/node/replica-runtime-producer.js';
import {createReplicaHandlerFixture} from
  '../test-helpers/replica-handler-construction-fixture.js';
/**
 * Shared test support for Node Joining Service suites.
 *
 * Extracted from the parent suite and the formerly-orphaned
 * node-joining-service.test-part-N.js files, which each carried a
 * byte-identical local copy of initializeTestEnvironment(). The helper body
 * is preserved verbatim; the parent and the re-enabled concern suites import
 * it from here instead of redefining it.
 */

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {ReplicaStateMachine} from
  '../../src/node/replica-state-machine.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {EventEmitter} from 'node:events';
import {assertDurableRejoinStorageAdmission} from
  '../../src/bootstrap/durable-rejoin-storage-admission.js';
import {createReplicaRuntimePublication} from
  '../../src/node/replica-runtime-publication.js';
import {attachPartitionRuntimePublication} from
  '../../src/partition/partition-runtime-publication.js';
import {bindRegisteredReplicaHandler} from '../test-helpers/replica-handler-identity-fixture.js';
import {TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createLifecycleStateStore} from
  '../test-helpers/lifecycle-state-store.js';

// Initialize configuration and logging for tests
export function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

/**
 * Install the real restore/lifecycle owners used by join-workflow fixtures.
 * Full declared ACTIVE rows are authoritative input. Controlled runtimes
 * acquire production restore admission before construction; this is workflow
 * evidence, not proof of native durable opening.
 * @param {Object} service NodeJoiningService fixture.
 * @param {Object} systemTableCache Canonical row fixture.
 * @param {Function} onConfirmed Successful exact-runtime confirmation observer.
 * @return {Object} Installed lifecycle owner and authoritative store.
 */
export function installNodeJoiningRestoreOwner(
  service,
  systemTableCache,
  onConfirmed = () => {},
) {
  const store = createLifecycleStateStore({
    services: systemTableCache.getAll(TABLES.SERVICES),
    partitions: systemTableCache.getAll(TABLES.PARTITIONS),
    preserveRowsExactly: true,
  });
  const timeSource = new VirtualTimeSource();
  const replicaStateMachine = new ReplicaStateMachine({
    nodeId: service.nodeId,
    ownerIncarnation: service.bootIncarnation,
    systemTableCache,
    controlPlaneSystemTableGateway: store.gateway,
    timeSource,
  });
  service.replicaStateMachine = replicaStateMachine;
  service.replicaHandler = createReplicaHandlerFixture(ReplicaHandler, {nodeId: service.nodeId,
    ownerIncarnation: service.bootIncarnation, replicaStateMachine,
    systemTableCache, controlPlaneSystemTableGateway: store.gateway,
    cdcIntegrationService: {},
    createPartitionService: () => {
      throw new Error('restore workflow fixture constructs through its admitted factory');
    }, timeSource});
  const confirm = service.confirmDurableRejoinPartitionRuntimes.bind(service);
  service.confirmDurableRejoinPartitionRuntimes = async (replicaIds) => {
    const result = await confirm(replicaIds);
    for (const replicaId of replicaIds) onConfirmed({replicaId});
    return result;
  };
  return Object.freeze({replicaStateMachine, store});
}

export function captureNodeJoiningRestoreProducer(service, replicaId) {
  return captureReplicaRuntimeHost(service, replicaId,
    captureReplicaRuntimeProducer(service.replicaHandler, service.replicaStateMachine, replicaId));
}

export async function publishNodeJoiningRestoredRuntime(service, options, producer, runtimeProperties = {}) {
  const {handler, owner, nodeId, hostServices} = requireReplicaRuntimeProducer(producer, options.replicaId);
  const admission = await assertDurableRejoinStorageAdmission(owner, options);
  const publication = createReplicaRuntimePublication(producer, admission.row, admission.admission);
  const runtime = Object.assign(new EventEmitter(), runtimeProperties, {
    replicaId: options.replicaId, partitionId: options.partitionId, nodeId,
    tableName: options.tableName, initialized: true, isShutdown: false, raft: {},
  });
  attachPartitionRuntimePublication(runtime, publication);
  publication.assertCurrent(runtime);
  bindRegisteredReplicaHandler(runtime, {nodeId,
    resolveHandlerRetirementLane: () => owner});
  service.trackJoinPartitionReplica(options.replicaId, options.partitionId, runtime,
    {...admission, handler, hostServices});
  return runtime;
}

/**
 * Establish the joiner's replica lifecycle owner through the real acquisition
 * owner, as the infrastructure segment does. Join infrastructure readiness is
 * answered by that owner for the service's boot incarnation, so a fixture
 * that declares the infrastructure ready must acquire it, not set a field.
 * The owner's timer runs on a private virtual clock (never a host timer).
 * @param {Object} service NodeJoiningService fixture.
 * @return {{replicaHandler: Object, replicaStateMachine: Object}}
 */
export function establishJoinReplicaLifecycleOwner(service) {
  const acquired = service.replicaLifecycleOwner.acquire({
    nodeId: service.nodeId,
    messageRouter: {register() {}, unregister() {}},
    cdcIntegrationService: {updateSystemTableRow: async () => true},
    systemTableCache: new SystemTableCache(),
    createPartitionService: async () => null,
    ownerIncarnation: service.bootIncarnation,
    timeSource: new VirtualTimeSource(),
  });
  service.replicaHandler = acquired.replicaHandler;
  service.replicaStateMachine = acquired.replicaStateMachine;
  return acquired;
}
