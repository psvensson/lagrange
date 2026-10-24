// Two hosted node runtimes must not collapse onto one node identity.
//
// A1c, the hostile witness. The process ConfigurationManager is initialised
// with a node id that belongs to NEITHER runtime, and two seed infrastructure
// phases are run back to back without resetting anything. Each must end up
// with its own runtime's identity, and the process configuration value must
// never appear as the current identity of an explicitly constructed runtime.
//
// The witness exercises the real SeedInfrastructurePhase the bootstrap owner
// itself built, with the owner's composed delegates, over a seed that entered
// the original attempt the way production does. The recorder only observes the
// identity setters the phase calls, so a phase that never set an identity
// records none. Router establishment, unified-lifecycle owner init and the
// initial reconciler trigger are made inert, because they are not the subject.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {createPreparedVirginSeedBootstrapService} from
  '../integration/helpers/cluster-test-helpers.js';

const WRONG_PROCESS_ID = 'wrong-process-id';
const A = {nodeId: 'node-A', nodeAddress: 'virtual://node-A'};
const B = {nodeId: 'node-B', nodeAddress: 'virtual://node-B'};

const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function runtimeFor(runtime) {
  const nodeService = new NodeService();
  // Identity is supplied explicitly; the phase initialises it.
  nodeService.pendingIdentity = runtime;
  return nodeService;
}

// The owner's own seed infrastructure phase on its own runtime. A recorder,
// not a reimplementation: it observes the identity setters the phase calls on
// the owner's delegates and forwards each one unchanged.
async function recordedSeedPhase(t, runtime) {
  const service = await createPreparedVirginSeedBootstrapService({
    nodeId: runtime.nodeId, nodeAddress: runtime.nodeAddress,
    nodeService: runtimeFor(runtime),
  });
  t.after(() => service.shutdown());
  service.logger = QUIET;
  const phase = service.seedInfrastructurePhase;
  const recorded = {nodeId: null, nodeAddress: null};
  const {setNodeId, setNodeAddress} = phase.delegates;
  phase.delegates.setNodeId = (value) => {
    recorded.nodeId = value;
    setNodeId(value);
  };
  phase.delegates.setNodeAddress = (value) => {
    recorded.nodeAddress = value;
    setNodeAddress(value);
  };
  // Not the subject of this witness.
  phase.createSeedMessageRouter = async () => ({hasSelfConnection: () => false});
  phase.initializeUnifiedLifecycleOwners = async () => {};
  phase.triggerBootstrapReconciler = async () => {};
  return {phase, recorded};
}

test('A1c. two seed infrastructure phases keep their own runtime identity',
  async (t) => {
    // The hostile witness. The process ConfigurationManager holds a node id
    // belonging to NEITHER runtime, and two real phases run back to back with
    // nothing reset. Each must end with its own runtime's identity; the
    // configuration value must never become a runtime identity.
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: WRONG_PROCESS_ID}});

    const a = await recordedSeedPhase(t, A);
    const b = await recordedSeedPhase(t, B);
    await a.phase.phaseInfrastructure();
    // No reset between them: that is the whole point.
    await b.phase.phaseInfrastructure();

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
  async (t) => {
    // The revert at the most central consumer: ignore the supplied runtime
    // and resolve NodeService.getInstance(), as the phase did before.
    ConfigurationManager.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: WRONG_PROCESS_ID}});
    NodeService.resetInstance();

    const a = await recordedSeedPhase(t, A);
    const b = await recordedSeedPhase(t, B);
    const phaseA = a.phase;
    const phaseB = b.phase;
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
