// Two hosted node runtimes must not collapse onto one node identity.
//
// A1c, the hostile witness. The process ConfigurationManager is initialised
// with a node id that belongs to NEITHER runtime, and two seed infrastructure
// phases are run back to back without resetting anything. Each must end up
// with its own runtime's identity, and the process configuration value must
// never appear as the current identity of an explicitly constructed runtime.
//
// The witness exercises the real SeedInfrastructurePhase: the identity logic
// under test is production's, and the delegate stub only records what the
// phase tells it. Router establishment, unified-lifecycle owner init and the
// initial reconciler trigger are made inert, because they are not the subject.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {SeedInfrastructurePhase} from
  '../../src/bootstrap/phases/seed-infrastructure-phase.js';

const WRONG_PROCESS_ID = 'wrong-process-id';
const A = {nodeId: 'node-A', nodeAddress: 'virtual://node-A'};
const B = {nodeId: 'node-B', nodeAddress: 'virtual://node-B'};

// A recorder, not a reimplementation: every value here is one the phase set.
function recordingDelegates(runtime) {
  const recorded = {nodeId: null, nodeAddress: null, messageRouter: null};
  return {
    recorded,
    delegates: {
      getLogger: () => ({debug() {}, info() {}, warn() {}, error() {}}),
      getConfig: () => ({wsPort: 0}),
      getNodeId: () => runtime.nodeId,
      getNodeAddress: () => recorded.nodeAddress ?? runtime.nodeAddress,
      getWsPort: () => 0,
      setNodeId: (value) => {
        recorded.nodeId = value;
      },
      setNodeAddress: (value) => {
        recorded.nodeAddress = value;
      },
      setMessageRouter: (value) => {
        recorded.messageRouter = value;
      },
      setTransport: () => {},
    },
  };
}

function runtimeFor(runtime) {
  const nodeService = new NodeService();
  // Identity is supplied explicitly; the phase initialises it.
  nodeService.pendingIdentity = runtime;
  return nodeService;
}

function inertPhase(delegates, nodeService) {
  const phase = new SeedInfrastructurePhase({delegates, nodeService});
  // Not the subject of this witness.
  phase.createSeedMessageRouter = async () => ({hasSelfConnection: () => false});
  phase.initializeUnifiedLifecycleOwners = async () => {};
  phase.triggerBootstrapReconciler = async () => {};
  return phase;
}

test('A1c. two seed infrastructure phases keep their own runtime identity',
  async () => {
    // The hostile witness. The process ConfigurationManager holds a node id
    // belonging to NEITHER runtime, and two real phases run back to back with
    // nothing reset. Each must end with its own runtime's identity; the
    // configuration value must never become a runtime identity.
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: WRONG_PROCESS_ID}});

    const a = recordingDelegates(A);
    const b = recordingDelegates(B);
    await inertPhase(a.delegates, runtimeFor(A)).phaseInfrastructure();
    // No reset between them: that is the whole point.
    await inertPhase(b.delegates, runtimeFor(B)).phaseInfrastructure();

    assert.equal(a.recorded.nodeId, A.nodeId,
      'phase A ends with runtime A\'s identity');
    assert.equal(a.recorded.nodeAddress, A.nodeAddress);
    assert.equal(b.recorded.nodeId, B.nodeId,
      'and phase B with runtime B\'s, not the one A initialised');
    assert.equal(b.recorded.nodeAddress, B.nodeAddress);
    assert.notEqual(a.recorded.nodeId, WRONG_PROCESS_ID,
      'the process configuration id is never a runtime identity');
    assert.notEqual(b.recorded.nodeId, WRONG_PROCESS_ID);
  });

test('MUTATION: a phase that reacquires the singleton collapses the identities',
  async () => {
    // The revert at the most central consumer: ignore the supplied runtime
    // and resolve NodeService.getInstance(), as the phase did before.
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: WRONG_PROCESS_ID}});
    NodeService.resetInstance();

    const a = recordingDelegates(A);
    const b = recordingDelegates(B);
    const phaseA = inertPhase(a.delegates, runtimeFor(A));
    const phaseB = inertPhase(b.delegates, runtimeFor(B));
    phaseA.nodeService = NodeService.getInstance();
    phaseB.nodeService = NodeService.getInstance();
    await phaseA.phaseInfrastructure();
    await phaseB.phaseInfrastructure();

    assert.equal(b.recorded.nodeId, A.nodeId,
      'the second phase reads the first runtime\'s identity back out of the ' +
      'singleton, because initialize() returns early once initialised - ' +
      'which is why the explicit dependency is semantically required');
    NodeService.resetInstance();
  });

test('the address registry does not decide either runtime\'s identity', () => {
  // The AddressManager discriminator, by hostile observation rather than
  // injection: with explicit addresses, neither runtime needs the shared
  // registry to resolve who it is.
  const a = new NodeService();
  const b = new NodeService();
  a.initialize({nodeId: A.nodeId, nodeAddress: A.nodeAddress, now: () => 1});
  b.initialize({nodeId: B.nodeId, nodeAddress: B.nodeAddress, now: () => 2});
  assert.equal(a.addressManager, b.addressManager,
    'the address registry is process-wide today');
  assert.equal(a.getNodeAddress(), A.nodeAddress,
    'and it decided neither address, because both were supplied');
  assert.equal(b.getNodeAddress(), B.nodeAddress);
});
