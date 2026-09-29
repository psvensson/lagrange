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
import {TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createCanonicalLifecycleServiceRow} from
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
 * Install the minimum real lifecycle owner used by node-joining fixtures.
 * The fixture writer exposes the same authoritative point-read boundary that
 * production activation consumes; tests may observe successful activation,
 * but cannot replace the owner's decision with a direct status-write stub.
 * @param {Object} service NodeJoiningService fixture.
 * @param {Object} systemTableCache Canonical row fixture.
 * @param {Function} onActivated Successful activation observer.
 * @return {ReplicaStateMachine} Installed lifecycle owner.
 */
export function installNodeJoiningReplicaStateMachine(
  service,
  systemTableCache,
  onActivated = () => {},
) {
  const writer = service.cdcIntegrationService;
  if (!writer || typeof systemTableCache?.get !== 'function') {
    throw new Error(
      'Node joining lifecycle fixture requires writer and canonical cache',
    );
  }
  writer.readAuthoritativeRows = async (_tableName, _sql, parameters) => {
    const replicaId = parameters?.[0];
    const row = systemTableCache.get(TABLES.SERVICES, replicaId);
    return {
      success: true,
      rows: row ? [createCanonicalLifecycleServiceRow(row)] : [],
    };
  };
  const replicaStateMachine = new ReplicaStateMachine({
    nodeId: service.nodeId,
    controlPlaneSystemTableGateway: {},
  });
  const activateRegisteredReplica =
    replicaStateMachine.activateRegisteredReplica.bind(replicaStateMachine);
  replicaStateMachine.activateRegisteredReplica = async (options) => {
    const row = await activateRegisteredReplica(options);
    onActivated(options, row);
    return row;
  };
  service.replicaStateMachine = replicaStateMachine;
  return replicaStateMachine;
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
