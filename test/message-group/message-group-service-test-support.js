/**
 * Shared test support for the MessageGroupService unit suites.
 *
 * Extracted from the split MessageGroupService unit files so the parent suite
 * and every concern-specific suite share one definition of the WebSocket
 * transport factory, the lifecycle reset hooks, and the traffic-readiness
 * test double. Helper bodies are preserved verbatim from the original split
 * files.
 */

import {EventEmitter} from 'node:events';
import {beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {ControllableConsensusPort} from
  '../test-helpers/controllable-consensus-port.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';

// Port counter for unique ports per test. Each suite file runs in its own
// worker process, so a per-file base keeps the originally-monolithic suites
// from binding the same ports when run together by the runner glob.
let testPortCounter = 24000;

/**
 * Set the base port for this suite file's transports. Call once at module load
 * with a distinct value per suite so concurrently-running suite files do not
 * collide on WebSocket ports.
 * @param {number} basePort starting port for this suite file
 */
export function setTestPortBase(basePort) {
  testPortCounter = basePort;
}

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
export async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION, nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
}

/**
 * Build a traffic-readiness lifecycle test double.
 * @return {object} readiness state stub with transitionTo/getSnapshot/on/off
 */
export function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

/**
 * Register the shared singleton reset hooks used by every MessageGroupService
 * suite. Resets NodeService/ConfigurationManager/LoggingService before and
 * after each test, re-initializing config + logger to error level.
 */
export function registerMessageGroupServiceLifecycleHooks() {
  beforeEach(() => {
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({node: {id: 'test-node'}});
    const logger = LoggingService.getInstance();
    logger.initialize({level: 'error'});
  });

  afterEach(() => {
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

// The test seam for a controllable consensus port. Production construction
// names no implementation; a suite that drives roles, steps and scheduling by
// hand subclasses the service and builds its port from the double instead.
class ControllableMessageGroupService extends MessageGroupService {
  constructor(options, controllablePort) {
    super(options);
    this.controllablePort = controllablePort;
  }

  createOperationPort(request) {
    return this.controllablePort.createOperationPort(request);
  }
}

/**
 * Construct a MessageGroupService (over its own test database path) whose
 * operation port the given controllable port builds.
 * @param {Object} options - MessageGroupService construction options.
 * @param {ControllableConsensusPort} [controllablePort] - The port double.
 * @return {MessageGroupService} The service.
 */
export function createControllableMessageGroupService(
  options,
  controllablePort = new ControllableConsensusPort(),
) {
  return new ControllableMessageGroupService(
    withTestDbPath(options), controllablePort);
}

/**
 * An operation port that only reports what a test states (role, leader,
 * term, configured peers), for a replica the test does not initialize.
 * @param {Object} [status] - ControllableConsensusPort options.
 * @return {Object} The frozen operation port.
 */
export function reportingConsensusPort(status = {}) {
  return new ControllableConsensusPort({peers: [], ...status})
    .createOperationPort({});
}

/**
 * Configure the port double's peers the way the replica's peer address hints
 * name them: each address's replica identity, at that address (the
 * configuration a follower's consensus reports for its group).
 * @param {ControllableConsensusPort} controllablePort - The port double.
 * @param {string[]} peerAddresses - Unified peer addresses.
 * @return {void}
 */
export function seedConsensusPeersFromPeerAddresses(controllablePort,
  peerAddresses) {
  controllablePort.peers = (Array.isArray(peerAddresses) ? peerAddresses : [])
    .filter((address) => typeof address === 'string' && address.length > 0)
    .map((address) => ({
      address,
      replicaIdentity: address.slice(address.lastIndexOf('/') + 1),
    }));
}
