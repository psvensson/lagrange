// A2b. For node-0, a real BootstrapService owns phase-one infrastructure.
//
// Everything the simulator has composed for a node until now was the harness's
// opinion of what a node is: a cache it built, a CDC service it wired, a
// router host it faked. That is why the simulator never hosted production's
// replica population - production never got to compose anything.
//
// Here the harness supplies environment and nothing else: a node identity, a
// runtime, a thread manager, a virtual network, that node's clock and the
// physical connection environment a router is built in. Then the real
// SeedInfrastructurePhase runs, inside a generation frame bound to node-0, and
// every object it produces is production's.
//
// This is the first time the real phase-one path enters the strict proof cone,
// so the clock seams it reaches are named here too: they were repaired at
// their semantic owners, never by putting time into the harness.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  runOnExecutionNode, runOnSimulationGenerationRoot,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  createVirtualConnectionEnvironment,
} from '../distributed/harness/virtual-connection-environment.js';
import {
  HARNESS_COMPOSITION_REFUSAL,
  LEGACY_SIMULATED_NODE_HOST_COMPOSER,
  createInfrastructureCompositionRegistry,
} from './formation-sim-infrastructure-composition.js';
import {
  createProductionBootstrapPhaseOneHost, runProductionPhaseOneTranscript,
} from './formation-sim-production-bootstrap-host.js';
import {
  deterministicProofEligibility, installDeterministicOwnerGuard,
  nondeterministicOwnerSeamLedger, resetNondeterministicOwnerSeamLedger,
} from './formation-sim-guard.js';

const NODE_ID = 'node-0';
const WS_PORT = 19950;
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

async function settleHost(turns = 16) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Run the network to a virtual horizon rather than to an empty queue: a
// composed node arms REAL periodic work - the router's keepalive, the
// reconciler's cadence - on its own clock, so the queue is never empty again
// and "drain until nothing is left" would never return. That is the right
// behavior; the horizon is the caller's contract.
const DELIVERY_HORIZON_MS = 10;
const TEARDOWN_HORIZON_MS = 50;

async function drainNetwork(network, {untilMs = DELIVERY_HORIZON_MS} = {}) {
  await settleHost();
  for (let step = 0; step < 400; step += 1) {
    const result = network.runStep({untilMs});
    await settleHost();
    if (!result.delivered) return;
  }
  throw new Error('the virtual link did not settle within the horizon');
}

// Environment only. Nothing semantic is composed here; that is the claim.
function environment() {
  const network = createVirtualNetwork({startMs: 0});
  const connectionEnvironment = createVirtualConnectionEnvironment({
    network, linkDelayMs: LINK_DELAY_MS,
  });
  network.registerNode(NODE_ID, (message, api) =>
    connectionEnvironment.handleMessage(NODE_ID, message, api));
  return {network, connectionEnvironment};
}

// One composed node-0, run through the real phase inside a generation frame
// bound to node-0. The phase is NOT called outside that frame: A2b is the
// first time this production path is measured, and measuring it from outside
// the node frame would measure nothing.
async function composedNodeZero({guard = true} = {}) {
  const {network, connectionEnvironment} = environment();
  if (guard) {
    installDeterministicOwnerGuard();
    resetNondeterministicOwnerSeamLedger();
  }
  const host = createProductionBootstrapPhaseOneHost({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
    network, connectionEnvironment,
  });
  const before = {
    messageRouter: host.bootstrap.messageRouter,
    transport: host.bootstrap.transport,
    nodeServiceInitialized: host.nodeService.isInitialized(),
    endpointRegistered:
      connectionEnvironment.environment.hasEndpoint(WS_PORT),
  };
  await runOnSimulationGenerationRoot(GENERATION, () =>
    runOnExecutionNode(NODE_ID, () => host.phaseInfrastructure()));
  await settleHost();
  return {network, connectionEnvironment, host, before};
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

test('A2b-1. the real phase composes node-0\'s phase-one infrastructure',
  async () => {
    const world = await composedNodeZero();
    const {bootstrap, nodeService} = world.host;

    assert.equal(world.before.messageRouter, null,
      'the harness composed no router');
    assert.equal(world.before.transport, null,
      'and no transport');
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

    // Created by MessageRouterSetup, once, with node-0's identity: the
    // factory is the only way a router can be built on this path, and the
    // options it was handed are the setup owner's.
    assert.equal(world.host.routerOptionsSeen.length, 1,
      'exactly one router was created for the positive host');
    const [routerOptions] = world.host.routerOptionsSeen;
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
    assert.equal(stats.lastCycleReason, 'bootstrap_infrastructure_ready',
      'the last cycle is the one the phase triggered');

    await world.host.stop();
  });

test('A2b-2. phase one begins no message-group, partition or later semantics',
  async () => {
    const world = await composedNodeZero();
    const {bootstrap} = world.host;

    // Desired state is empty: the reconciler ran, and had nothing to do.
    assert.equal(bootstrap.messageGroupServices.size, 0);
    assert.equal(bootstrap.partitionServices.size, 0);
    assert.equal(bootstrap.messageGroupReplicas.length, 0);
    assert.equal(bootstrap.partitionReplicas.length, 0);
    assert.equal(bootstrap.serviceReconciler.getStats().actionCount, 0,
      'the reconciler took no service action, because none was desired');

    // Later-phase infrastructure did not appear merely because phase one ran.
    assert.equal(bootstrap.cdcIntegrationService, null);
    assert.equal(bootstrap.rebalanceCoordinator, null);
    assert.equal(bootstrap.tablePolicyService, null);

    await world.host.stop();
  });

test('A2b-3. the self-connection is production\'s, over the virtual network',
  async () => {
    const world = await composedNodeZero();
    const {network, connectionEnvironment, host} = world;
    const router = host.bootstrap.messageRouter;

    // The endpoint the dial resolved is the router the PHASE created, in the
    // scenario's own registry. The witness registered nothing.
    assert.equal(
      connectionEnvironment.environment.lookupEndpoint(WS_PORT).router, router,
      'the phase\'s own router is what answers a dial on its port');
    assert.equal(connectionEnvironment.linkCount(), 1,
      'and the only link is the one the router dialled for itself');
    assert.ok(connectionEnvironment.frameCount() > 0,
      'its IDENTIFY is a frame on the link');

    // The phase does not wait for identification: the socket is open, the
    // IDENTIFY is in flight, and the peer is not known yet. Nothing here
    // called connectToNode - the router did, from initialize().
    assert.equal(incomingPeerIdentity(router), null,
      'the inbound half carries no peer identity before delivery');
    assert.equal(network.now(), 0, 'and no virtual time has passed');

    await drainNetwork(network);

    assert.equal(incomingPeerIdentity(router), NODE_ID,
      'real inbound IDENTIFY handling established the self connection');
    assert.ok(router.hasSelfConnection(), 'which the router reports as its own');
    assert.ok(network.now() >= LINK_DELAY_MS,
      `identification consumed link time (now=${network.now()})`);
    const selfFrames = network.getRecords().filter((record) =>
      record.from === NODE_ID && record.to === NODE_ID);
    assert.ok(selfFrames.length > 0,
      'node-0 dialling itself still crossed the network, with no shortcut');

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
    // The one thing the harness is allowed to own is the physical transport,
    // and it is named as an environment rather than as an owner.
    const owners = [packet.nodeService, packet.router,
      packet.serviceLifecycleManager, packet.serviceReconciler]
      .map((entry) => entry.owner);
    assert.ok(!owners.includes('formation harness'),
      'nothing composed here is owned by the harness');
    await world.host.stop();
  });

test('A2b-5. the strict guard is clean across the whole phase', async () => {
  const world = await composedNodeZero();
  await drainNetwork(world.network);
  const eligibility = deterministicProofEligibility();
  assert.deepEqual(nondeterministicOwnerSeamLedger().samples, [],
    'no ambient seam was reached');
  assert.equal(eligibility.ambientSeamViolationCount, 0);
  assert.equal(eligibility.ambientSeamSubstitutionCount, 0);
  assert.equal(eligibility.ambientSeamMode, 'strict');
  assert.equal(eligibility.deterministicProofEligible, true);
  await world.host.stop();
});

test('A2b-6. teardown follows owner order and leaves nothing behind',
  async () => {
    const world = await composedNodeZero();
    const {network, connectionEnvironment, host} = world;
    await drainNetwork(network);
    assert.equal(connectionEnvironment.environment.hasEndpoint(WS_PORT), true);

    // Teardown has consequences on the link of its own - a socket close is a
    // frame like any other - so the horizon reaches past them.
    const stopping = host.stop();
    await drainNetwork(network, {untilMs: TEARDOWN_HORIZON_MS});
    await stopping;
    await drainNetwork(network, {untilMs: TEARDOWN_HORIZON_MS});

    // Released by the environment's own operation, not by the witness
    // reaching into a registry.
    assert.equal(connectionEnvironment.environment.hasEndpoint(WS_PORT), false,
      'the router\'s own shutdown released its endpoint');
    assert.equal(host.bootstrap.messageRouter.server, null,
      'and closed its server');
    assert.equal(host.compositionRegistry.composerFor(NODE_ID), null,
      'and the node\'s composer claim is released');

    const epochAtSeal = network.enqueueEpoch();
    await settleHost(32);
    assert.equal(network.enqueueEpoch(), epochAtSeal,
      'nothing production owns enqueued work after the seal');
    assert.equal(network.pendingEventCount(), 0, 'and nothing is left pending');
  });

test('A2b-7. red: a second infrastructure composer for node-0 is refused',
  async () => {
    // The controlled negative: the legacy composer builds node-0's cache, CDC
    // service and router host, and the production host is then asked to
    // compose node-0 too. Without the refusal the scenario would hold two
    // infrastructure sets and silently use whichever it reached first.
    const {network, connectionEnvironment} = environment();
    const compositionRegistry = createInfrastructureCompositionRegistry();
    compositionRegistry.claim(NODE_ID, LEGACY_SIMULATED_NODE_HOST_COMPOSER);

    assert.throws(
      () => createProductionBootstrapPhaseOneHost({
        nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
        network, connectionEnvironment, compositionRegistry,
      }),
      (error) => error.code ===
        HARNESS_COMPOSITION_REFUSAL.DUPLICATE_INFRASTRUCTURE_COMPOSER,
      'composition admission refuses the second composer');

    // And the reverse order refuses too: whoever is second loses.
    const second = createInfrastructureCompositionRegistry();
    const host = createProductionBootstrapPhaseOneHost({
      nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
      network, connectionEnvironment, compositionRegistry: second,
    });
    assert.throws(
      () => second.claim(NODE_ID, LEGACY_SIMULATED_NODE_HOST_COMPOSER),
      (error) => error.code ===
        HARNESS_COMPOSITION_REFUSAL.DUPLICATE_INFRASTRUCTURE_COMPOSER);
    assert.equal(host.bootstrap.messageRouter, null,
      'the refused scenario composed nothing');
  });

test('A2b-8. red: precomposed infrastructure is refused as an argument',
  async () => {
    // The same rule at the argument boundary: a caller that already holds a
    // cache or a router for this node is a second composer whether or not it
    // reached a registry.
    const {network, connectionEnvironment} = environment();
    for (const key of ['legacyHost', 'messageRouter', 'systemTableCache',
      'cdcIntegrationService', 'rebalanceCoordinator']) {
      assert.throws(
        () => createProductionBootstrapPhaseOneHost({
          nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
          network, connectionEnvironment, [key]: {},
        }),
        (error) => error.code ===
          HARNESS_COMPOSITION_REFUSAL.PRECOMPOSED_INFRASTRUCTURE_ARGUMENT,
        `${key} is refused at composition admission`);
    }
  });

// The composed node's transcript is a pure function of the scenario. These
// are the same three readings the substrate certification takes, applied for
// the first time to a node production composed.
const HOST_BURN_ITERATIONS = 200000;

test('A2b-9. the composed transcript is exact in-process and under host load',
  async () => {
    const first = await runProductionPhaseOneTranscript();
    const second = await runProductionPhaseOneTranscript();
    assert.ok(first.transcript.length > 0, 'the run has a transcript at all');
    assert.equal(second.digest, first.digest,
      'two composed runs in one process produce the same transcript');
    assert.equal(second.nowMs, first.nowMs, 'and end at the same instant');
    assert.equal(first.pendingEventCount, 0,
      'with nothing left pending after teardown');

    // Ordinary host burden between settlement turns. If host speed had any
    // authority over the composed node, this is where it would show.
    const loaded = await runProductionPhaseOneTranscript({
      hostLoad: () => {
        let burn = 0;
        for (let index = 0; index < HOST_BURN_ITERATIONS; index += 1) {
          burn += index % 7;
        }
        return burn;
      },
    });
    assert.equal(loaded.digest, first.digest,
      'synchronous host load changes nothing about the transcript');
    assert.equal(loaded.nowMs, first.nowMs);
  });

test('A2b-10. the composed transcript is exact in a fresh process', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const program = [
    `const host = await import(${JSON.stringify(
      path.join(here, 'formation-sim-production-bootstrap-host.js'))});`,
    `const {ConfigurationManager} = await import(${JSON.stringify(
      path.join(here, '..', '..', 'src', 'config', 'configuration-manager.js'))});`,
    `const {LoggingService} = await import(${JSON.stringify(
      path.join(here, '..', '..', 'src', 'logging', 'logging-service.js'))});`,
    'ConfigurationManager.getInstance().initialize(' +
      '{node: {id: \'node-0\'}, logging: {level: \'error\'}});',
    'LoggingService.getInstance().initialize({level: \'error\'});',
    'const run = await host.runProductionPhaseOneTranscript();',
    'process.stdout.write(`${run.digest}\n${run.nowMs}\n`);',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program],
    {encoding: 'utf8'});
  assert.equal(child.status, 0,
    `the composed node runs in a fresh process: ${child.stderr}`);
  const [digest, nowMs] = child.stdout.trim().split('\n');
  const local = await runProductionPhaseOneTranscript();
  assert.equal(digest, local.digest,
    'a fresh process produces the same transcript as this one');
  assert.equal(Number(nowMs), local.nowMs, 'and the same final instant');
});
