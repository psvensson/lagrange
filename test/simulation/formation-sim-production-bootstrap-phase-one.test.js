// A2b. For node-0, a real BootstrapService owns phase-one infrastructure, and
// the host can say what happened and in what causal order.
//
// Everything the simulator composed for a node until now was the harness's
// opinion of what a node is: a cache it built, a CDC service it wired, a
// router host it faked. That is why the simulator never hosted production's
// replica population - production never got to compose anything.
//
// Here the harness supplies environment and nothing else, and the real
// SeedInfrastructurePhase runs inside a generation frame bound to node-0.
// Two layers stay apart on purpose. A node ENVIRONMENT owns what a node needs
// to exist - runtime, thread manager, clock, endpoint, router factory - and
// composes nothing semantic. A SEED HOST mounts the real bootstrap on top of
// one. The join path will mount a different production owner on the same
// environment, and merging them behind a mode flag would hide exactly the
// distinction the simulator exists to measure.
//
// The fact A2b established, and which the transcript contract now preserves:
// phaseInfrastructure() returns with the self socket OPEN and its IDENTIFY
// STILL IN FLIGHT. That is not a defect to fix in production. It means "the
// phase returned" and "the phase's consequences settled" are different facts,
// and the host - not production - is what knows how to wait for the second.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  HARNESS_COMPOSITION_REFUSAL,
  LEGACY_SIMULATED_NODE_HOST_COMPOSER,
  createInfrastructureCompositionRegistry,
} from './formation-sim-infrastructure-composition.js';
import {
  SEALED_ENTRY_REFUSAL, UNKNOWN_EVENT_REFUSAL, UNKNOWN_FIELD_REFUSAL,
  createHostTranscript,
} from './formation-sim-host-transcript.js';
import {
  createProductionSimNodeEnvironment, createProductionSimScenario,
} from './formation-sim-production-node-environment.js';
import {
  createProductionSeedSimHost,
} from './formation-sim-production-seed-host.js';

const NODE_ID = 'node-0';
const WS_PORT = 19960;
const NODE_ADDRESS = `ws://127.0.0.1:${WS_PORT}`;
const GENERATION = 'a2b-phase-one';
const LINK_DELAY_MS = 1;

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// One composed node-0, run through the real phase inside a generation frame
// bound to node-0. The phase is NOT called outside that frame: measuring this
// production path from outside the node frame would measure nothing.
async function composedNodeZero() {
  const scenario = createProductionSimScenario({linkDelayMs: LINK_DELAY_MS});
  const environment = createProductionSimNodeEnvironment({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
  });
  const host = createProductionSeedSimHost(environment);
  const before_ = {
    messageRouter: host.bootstrap.messageRouter,
    transport: host.bootstrap.transport,
    nodeServiceInitialized: environment.nodeService.isInitialized(),
    endpointRegistered: host.endpoints.hasEndpoint(WS_PORT),
  };
  await runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.phaseInfrastructure()));
  return {scenario, environment, host, before: before_};
}

// The incoming half of the self-connection carries no peer identity until an
// IDENTIFY frame is actually handled. That single field is the whole
// difference between a socket the phase opened and a peer the router knows.
function incomingPeerIdentity(router) {
  for (const connection of router.nodeConnections.values()) {
    if (connection.isIncoming) return connection.nodeId;
  }
  return undefined;
}

function eventsOf(transcript) {
  return transcript.entries().map((entry) => entry.event);
}

test('A2b-1. the real phase composes node-0\'s phase-one infrastructure',
  async () => {
    const world = await composedNodeZero();
    const {bootstrap} = world.host;
    const {nodeService} = world.environment;

    assert.equal(world.before.messageRouter, null,
      'the harness composed no router');
    assert.equal(world.before.transport, null, 'and no transport');
    assert.equal(world.before.nodeServiceInitialized, false,
      'and handed the phase an uninitialised runtime');
    assert.equal(world.before.endpointRegistered, false,
      'and registered no endpoint of its own');

    assert.equal(bootstrap.nodeService, nodeService,
      'the supplied runtime stayed the node authority');
    assert.equal(nodeService.getNodeId(), NODE_ID,
      'and the phase initialised it with node-0\'s identity');
    assert.ok(bootstrap.messageRouter, 'the phase produced a router');
    assert.equal(bootstrap.transport, bootstrap.messageRouter,
      'and that router is the node\'s transport');

    assert.equal(world.environment.routerOptionsSeen.length, 1,
      'exactly one router was created for the positive host');
    const [routerOptions] = world.environment.routerOptionsSeen;
    assert.equal(routerOptions.nodeId, NODE_ID);
    assert.equal(routerOptions.nodeAddress, NODE_ADDRESS);
    assert.equal(routerOptions.wsPort, WS_PORT);
    assert.equal(bootstrap.messageRouter.nodeId, NODE_ID);

    assert.ok(bootstrap.serviceLifecycleManager,
      'the real startup lifecycle owner established its manager');
    assert.ok(bootstrap.serviceReconciler, 'and its reconciler');
    const stats = bootstrap.serviceReconciler.getStats();
    assert.ok(stats.cycleCount > 0 && stats.cycleFailureCount === 0,
      'and the phase\'s initial reconciliation completed');
    assert.equal(stats.lastCycleReason, 'bootstrap_infrastructure_ready');

    await world.host.stop();
  });

test('A2b-2. phase one begins no message-group, partition or later semantics',
  async () => {
    const world = await composedNodeZero();
    const {bootstrap} = world.host;

    assert.equal(bootstrap.messageGroupServices.size, 0);
    assert.equal(bootstrap.partitionServices.size, 0);
    assert.equal(bootstrap.messageGroupReplicas.length, 0);
    assert.equal(bootstrap.partitionReplicas.length, 0);
    assert.equal(bootstrap.serviceReconciler.getStats().actionCount, 0,
      'the reconciler took no service action, because none was desired');

    assert.equal(bootstrap.cdcIntegrationService, null);
    assert.equal(bootstrap.rebalanceCoordinator, null);
    assert.equal(bootstrap.tablePolicyService, null);

    await world.host.stop();
  });

test('A2b-3. the phase returns before its IDENTIFY lands, and the host settles it',
  async () => {
    const world = await composedNodeZero();
    const {scenario, host} = world;
    const router = host.bootstrap.messageRouter;
    const transcript = host.transcript();

    // The endpoint the dial resolved is the router the PHASE created, in the
    // scenario's own registry. The witness registered nothing and dialled
    // nothing: the router did, from initialize().
    assert.equal(host.endpoints.lookupEndpoint(WS_PORT).router, router,
      'the phase\'s own router is what answers a dial on its port');

    // The asynchronous tail, stated as a fact rather than repaired.
    const atReturn = eventsOf(transcript);
    assert.ok(atReturn.includes('phase_infrastructure_completed'),
      'the phase returned');
    assert.ok(atReturn.includes('physical_socket_open'),
      'with the self socket physically open');
    assert.ok(atReturn.includes('frame_enqueued'),
      'and its IDENTIFY enqueued on the link');
    assert.ok(!atReturn.includes('frame_delivered'),
      'but not delivered');
    assert.ok(!atReturn.includes('self_identity_bound'),
      'so no self identity is bound yet');
    assert.equal(incomingPeerIdentity(router), null,
      'which the router\'s own inbound record agrees with');
    assert.equal(scenario.network.now(), 0, 'and no virtual time has passed');

    // The host, not production, knows how to wait.
    await host.settleCausalConsequences();

    const settled = eventsOf(transcript);
    const order = (event) => settled.indexOf(event);
    assert.ok(order('phase_infrastructure_completed') < order('frame_delivered'),
      'the phase completed before its frame was delivered');
    assert.ok(order('frame_delivered') < order('identify_received'),
      'delivery came before the router decided the frame was an IDENTIFY');
    assert.ok(order('identify_received') < order('self_identity_bound'),
      'and identification before the self identity was bound');
    assert.equal(incomingPeerIdentity(router), NODE_ID,
      'real inbound IDENTIFY handling established the self connection');
    assert.ok(router.hasSelfConnection());
    assert.ok(scenario.network.now() >= LINK_DELAY_MS,
      `identification consumed link time (now=${scenario.network.now()})`);

    // No same-node shortcut: node-0 dialling itself still crossed the link.
    const selfFrames = scenario.network.getRecords().filter((entry) =>
      entry.from === NODE_ID && entry.to === NODE_ID);
    assert.ok(selfFrames.length > 0);

    await host.stop();
  });

test('A2b-4. provenance names a production owner for everything but physics',
  async () => {
    const world = await composedNodeZero();
    const packet = world.host.provenance();
    assert.equal(packet.nodeId, NODE_ID);
    assert.equal(packet.router.owner,
      'SeedInfrastructurePhase -> MessageRouterSetup');
    assert.equal(packet.router.physicalEnvironment,
      'VirtualConnectionEnvironment');
    assert.equal(packet.serviceLifecycleManager.owner,
      'StartupServiceLifecycleOwner');
    assert.equal(packet.serviceReconciler.owner,
      'StartupServiceLifecycleOwner');
    assert.equal(packet.physicalEnvironment.owner,
      'VirtualConnectionEnvironment',
      'the one thing the harness owns is named as an environment');
    const owners = Object.values(packet)
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => entry.owner);
    assert.ok(!owners.includes('formation harness'),
      'nothing composed here is owned by the harness');
    await world.host.stop();
  });

test('A2b-5. the transcript carries semantics and no incidental entropy',
  async () => {
    const world = await composedNodeZero();
    await world.host.settleCausalConsequences();
    const entries = world.host.transcript().entries();

    const allowed = new Set(['seq', 'virtualTimeMs', 'event', 'nodeId',
      'peerNodeId', 'owner', 'phase', 'frameKind']);
    for (const entry of entries) {
      for (const field of Object.keys(entry)) {
        assert.ok(allowed.has(field),
          `${field} is not a host transcript field`);
      }
      for (const value of Object.values(entry)) {
        assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(value)),
          `${value} looks like a minted id, which is not semantic here`);
      }
    }
    // Sequence and virtual time are the only ordering facts, and both are the
    // transcript's to decide.
    entries.forEach((entry, index) => assert.equal(entry.seq, index));
    for (let index = 1; index < entries.length; index += 1) {
      assert.ok(entries[index].virtualTimeMs >= entries[index - 1].virtualTimeMs,
        'virtual time never goes backwards in the transcript');
    }
    await world.host.stop();
  });

test('A2b-6. the transcript contract refuses what it must never carry', () => {
  const transcript = createHostTranscript({network: null});
  assert.throws(() => transcript.record('NOT_AN_EVENT'),
    (error) => error.code === UNKNOWN_EVENT_REFUSAL);
  assert.throws(
    () => transcript.record('HOST_CREATED', {connectionId: 'abc'}),
    (error) => error.code === UNKNOWN_FIELD_REFUSAL,
    'a field outside the contract is refused rather than normalised away');
  assert.throws(() => transcript.record('HOST_CREATED', {seq: 4}),
    (error) => error.code === UNKNOWN_FIELD_REFUSAL,
    'and ordering is the transcript\'s to decide, not its caller\'s');
  transcript.record('HOST_CREATED', {nodeId: NODE_ID});
  transcript.seal();
  assert.throws(() => transcript.record('TEARDOWN_COMPLETED'),
    (error) => error.code === SEALED_ENTRY_REFUSAL,
    'a semantic entry after the seal is a failure, not a late arrival');
});

test('A2b-7. red: a second infrastructure composer for node-0 is refused',
  async () => {
    // The controlled negative: the legacy composer builds node-0's cache, CDC
    // service and router host, and the seed host is then asked to compose
    // node-0 too. Without the refusal the scenario would hold two
    // infrastructure sets and silently use whichever it reached first.
    const scenario = createProductionSimScenario();
    const environment = createProductionSimNodeEnvironment({
      nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
    });
    const compositionRegistry = createInfrastructureCompositionRegistry();
    compositionRegistry.claim(NODE_ID, LEGACY_SIMULATED_NODE_HOST_COMPOSER);

    assert.throws(
      () => createProductionSeedSimHost(environment, {compositionRegistry}),
      (error) => error.code ===
        HARNESS_COMPOSITION_REFUSAL.DUPLICATE_INFRASTRUCTURE_COMPOSER,
      'composition admission refuses the second composer');

    // And the reverse order refuses too: whoever is second loses.
    const second = createInfrastructureCompositionRegistry();
    const host = createProductionSeedSimHost(environment,
      {compositionRegistry: second});
    assert.throws(
      () => second.claim(NODE_ID, LEGACY_SIMULATED_NODE_HOST_COMPOSER),
      (error) => error.code ===
        HARNESS_COMPOSITION_REFUSAL.DUPLICATE_INFRASTRUCTURE_COMPOSER);
    assert.equal(host.bootstrap.messageRouter, null,
      'the refused scenario composed nothing');
  });

test('A2b-8. red: precomposed infrastructure is refused as an argument', () => {
  const scenario = createProductionSimScenario();
  const environment = createProductionSimNodeEnvironment({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT, scenario,
  });
  for (const key of ['legacyHost', 'messageRouter', 'systemTableCache',
    'cdcIntegrationService', 'rebalanceCoordinator']) {
    assert.throws(
      () => createProductionSeedSimHost(environment, {[key]: {}}),
      (error) => error.code ===
        HARNESS_COMPOSITION_REFUSAL.PRECOMPOSED_INFRASTRUCTURE_ARGUMENT,
      `${key} is refused at composition admission`);
  }
});
