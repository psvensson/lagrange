// The simulator's in-process link is a real MessageRouter link whose physics
// the VirtualNetwork owns.
//
// A2a's question is narrow: can the production transport be composed into a
// deterministic scenario WITHOUT the simulator reproducing any production
// decision? The seam says yes, and draws the line at physics. The environment
// decides two things - which router answers a dial, and when a frame arrives.
// Everything above that line is the router's: IDENTIFY, external admission,
// the incarnation fence, reconnect suppression, self-connection, ACK.
//
// These witnesses are about that line. Each one asserts a production decision
// is still made by production code, over frames that really crossed virtual
// time. Two red mutations at the end move the line - one delivers frames on
// the host instead of the link, the other pre-admits the peer before its
// IDENTIFY lands - and both must be caught here.
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {INPROC} from '../../src/transport/message-router-shared-vocabulary.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  VIRTUAL_LINK_FRAME_TYPE, createVirtualConnectionEnvironment,
} from '../distributed/harness/virtual-connection-environment.js';

const LINK_DELAY_MS = 5;
const PORT_A = 19900;
const PORT_B = 19901;
const ADDRESS_A = `ws://127.0.0.1:${PORT_A}`;
const ADDRESS_B = `ws://127.0.0.1:${PORT_B}`;

before(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'node-a'}, logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

after(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// Host turns, not virtual ones: production continuations run on the host, and
// the scenario must let them finish before the next virtual event is chosen.
async function settleHost(turns = 8) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Alternate host settlement with single virtual steps until the network has
// nothing left to deliver. Host speed cannot change what gets delivered; it
// only decides when this loop notices there is nothing more.
async function pump(network, {maxSteps = 400} = {}) {
  await settleHost();
  for (let step = 0; step < maxSteps; step += 1) {
    const result = network.runStep({});
    await settleHost();
    if (!result.delivered && network.peekNextEventInstant() === null) {
      return step;
    }
  }
  throw new Error('the virtual link did not reach quiescence');
}

// Two real routers on one VirtualNetwork, each hosting its own runtime node.
async function twoRouterScenario({
  network = createVirtualNetwork({startMs: 0}),
  linkDelayMs = LINK_DELAY_MS,
  externalAdmissionEnabled = true,
  decorateEnvironment = (environment) => environment,
} = {}) {
  const harness = createVirtualConnectionEnvironment({network, linkDelayMs});
  const environment = decorateEnvironment(harness.environment, harness);
  for (const nodeId of ['node-a', 'node-b']) {
    network.registerNode(nodeId, (message, api) =>
      harness.handleMessage(nodeId, message, api));
  }
  const routerA = new MessageRouter({
    nodeId: 'node-a', inProcess: true, wsPort: PORT_A,
    inProcessConnectionEnvironment: environment,
    resolveNodeAddress: (id) => (id === 'node-b' ? ADDRESS_B : null),
  });
  const routerB = new MessageRouter({
    nodeId: 'node-b', inProcess: true, wsPort: PORT_B,
    externalAdmissionEnabled,
    inProcessConnectionEnvironment: environment,
    resolveNodeAddress: (id) => (id === 'node-a' ? ADDRESS_A : null),
  });
  await routerA.initialize({startServer: true});
  await routerB.initialize({startServer: true});
  return {
    network, harness, routerA, routerB,
    async end() {
      await routerA.shutdown();
      await routerB.shutdown();
    },
  };
}

// The single observation all of witness 1 and both red mutations read. It
// dials once and reports what the FAR END knew at two moments: the instant
// the physical dial resolved, and after the network delivered. Everything
// that distinguishes a real link from a host callback is in that pair.
async function identificationObservations(worldOptions = {}) {
  const world = await twoRouterScenario(worldOptions);
  const {network, harness, routerA, routerB} = world;
  const framesBeforeDial = harness.frameCount();
  await routerA.connectToNode('node-b', ADDRESS_B);
  await settleHost();
  const atDial = {
    dialerState: routerA.nodeConnections.get('node-b')?.state ?? null,
    peerKnown: routerB.nodeConnections.has('node-a'),
    nowMs: network.now(),
  };
  await pump(network);
  const afterDelivery = {
    peerKnown: routerB.nodeConnections.has('node-a'),
    nowMs: network.now(),
    framesAdded: harness.frameCount() - framesBeforeDial,
    selfFrames: network.getRecords().filter((record) =>
      record.type === VIRTUAL_LINK_FRAME_TYPE && record.from === record.to).length,
  };
  await world.end();
  return {framesBeforeDial, atDial, afterDelivery};
}

test('1. identification is a real IDENTIFY that crossed the virtual link',
  async () => {
    const {framesBeforeDial, atDial, afterDelivery} =
      await identificationObservations();
    // Both routers have already opened their own loopback connection; those
    // frames are on the link too.
    assert.ok(framesBeforeDial > 0,
      'even the self-connection identifies over the link');

    // The PHYSICAL dial succeeded - that is a local process operation. The
    // LOGICAL peer relationship has not happened, because no frame has been
    // delivered yet.
    assert.equal(atDial.dialerState, 'connected',
      'the dialing end holds an open socket as soon as the dial resolves');
    assert.equal(atDial.peerKnown, false,
      'the far end knows nothing until its IDENTIFY is delivered');
    assert.equal(atDial.nowMs, 0, 'and no virtual time has passed');

    assert.equal(afterDelivery.peerKnown, true,
      'the peer is known only after the network delivered its IDENTIFY');
    assert.ok(afterDelivery.nowMs >= LINK_DELAY_MS,
      `identification consumed link time (now=${afterDelivery.nowMs})`);
    assert.ok(afterDelivery.framesAdded > 0,
      'and the frames that did it were link frames, not host callbacks');

    // No same-node shortcut: each loopback connection is a link of its own,
    // and its frames are recorded from the node to itself.
    assert.ok(afterDelivery.selfFrames > 0,
      'a link between two runtimes on one node still crosses the network');
  });

test('2. external admission still refuses the peer, over a delivered IDENTIFY',
  async () => {
    const world = await twoRouterScenario({externalAdmissionEnabled: false});
    const {network, routerA, routerB} = world;
    await routerA.connectToNode('node-b', ADDRESS_B);
    await pump(network);

    assert.equal(routerB.isExternalAdmissionEnabled(), false,
      'the closed gate is the router\'s state, not the environment\'s');
    assert.equal(routerB.nodeConnections.has('node-a'), false,
      'a delivered IDENTIFY is refused while external admission is closed');
    assert.equal(routerB.nodeConnections.has('node-b'), true,
      'and the local self-connection is admitted exactly as it was before');

    // Reopening the gate and re-dialing admits the same peer: the refusal was
    // a decision, not a broken link.
    routerB.setExternalAdmissionEnabled(true);
    await routerA.connectToNode('node-b', ADDRESS_B, {force: true});
    await pump(network);
    assert.equal(routerB.nodeConnections.has('node-a'), true,
      'the open gate admits the peer across the same environment');
    await world.end();
  });

test('3. a service message is delivered and acknowledged over the link',
  async () => {
    const world = await twoRouterScenario();
    const {network, harness, routerA, routerB} = world;
    await routerA.connectToNode('node-b', ADDRESS_B);
    await pump(network);

    const seen = [];
    routerB.register('node-b/partition/p1', (envelope) => {
      seen.push(envelope.payload.value);
      return {ok: true, echo: envelope.payload.value};
    });

    const framesBefore = harness.frameCount();
    const timeBefore = network.now();
    const deliveryPromise = routerA.deliver(
      'node-b/partition/p1', {type: 'test', value: 7});
    await pump(network);
    const outcome = await deliveryPromise;

    assert.deepEqual(seen, [7], 'the remote handler ran on the remote router');
    assert.equal(outcome.acknowledged, true,
      'the ACK came back across the link, not from a local shortcut');
    assert.equal(outcome.deliveryState, 'delivered');
    assert.ok(harness.frameCount() > framesBefore + 1,
      'request and acknowledgement were separate link frames');
    assert.ok(network.now() > timeBefore,
      'and the round trip consumed virtual time');
    await world.end();
  });

test('4. endpoints are scenario-local; no process global is consulted',
  async () => {
    const globalPortsBefore = new Set(INPROC.serversByPort.keys());
    const first = await twoRouterScenario();
    // A SECOND scenario claiming the SAME ports. Under the process-global
    // registry this is EADDRINUSE and, worse, the two scenarios would dial
    // each other's nodes.
    const second = await twoRouterScenario({
      network: createVirtualNetwork({startMs: 0}),
    });

    assert.notEqual(first.harness, second.harness,
      'each scenario owns its own endpoint registry');
    assert.equal(first.harness.environment.lookupEndpoint(PORT_B).router,
      first.routerB, 'the first scenario resolves its own node-b');
    assert.equal(second.harness.environment.lookupEndpoint(PORT_B).router,
      second.routerB, 'and the second scenario resolves its own');

    // A dial inside one scenario reaches that scenario's runtime and no other.
    await first.routerA.connectToNode('node-b', ADDRESS_B);
    await pump(first.network);
    assert.equal(first.routerB.nodeConnections.has('node-a'), true);
    assert.equal(second.routerB.nodeConnections.has('node-a'), false,
      'the identical address in a sibling scenario was never reached');
    assert.equal(second.network.now(), 0,
      'and no frame entered the sibling scenario\'s network');

    assert.deepEqual([...INPROC.serversByPort.keys()], [...globalPortsBefore],
      'the process-global in-process registry gained nothing');
    await first.end();
    await second.end();
  });

// The two mutations below move the environment's line upward, each in a way
// a plausible implementation might. Both are read through the SAME
// observation witness 1 reads, so what they falsify is witness 1 itself:
// under either mutation `atDial.peerKnown` - the whole discriminator between
// a real link and a host callback - inverts.
test('5. red: delivering frames on the host instead of the link is caught',
  async () => {
    const {atDial} = await identificationObservations({
      decorateEnvironment: (environment) => ({
        ...environment,
        createConnectionPair(context) {
          const pair = environment.createConnectionPair(context);
          // MUTATION: the frame reaches the peer handler directly, the way
          // the process-global transport does it. No link, no virtual time.
          for (const [end, peer] of [
            [pair.clientSocket, pair.serverSocket],
            [pair.serverSocket, pair.clientSocket],
          ]) {
            end.send = (data) => peer.emit('message', data);
          }
          return pair;
        },
      }),
    });
    assert.equal(atDial.peerKnown, true,
      'the mutation identifies the peer with no frame on the link');
    assert.equal(atDial.nowMs, 0, 'having consumed no virtual time');
    // Which is exactly the assertion witness 1 makes, inverted.
    assert.throws(
      () => assert.equal(atDial.peerKnown, false),
      'witness 1 fails against this mutation');
  });

test('6. red: pre-admitting the peer before its IDENTIFY lands is caught',
  async () => {
    const {atDial} = await identificationObservations({
      decorateEnvironment: (environment) => ({
        ...environment,
        createConnectionPair(context) {
          const pair = environment.createConnectionPair(context);
          // MUTATION: the environment rekeys the far end's connection table
          // for the dialing node, so the peer looks identified before any
          // IDENTIFY has crossed. This is the environment making a decision
          // that belongs to the router.
          const target = environment.lookupEndpoint(context.portKey);
          if (context.localNodeId !== context.remoteNodeId) {
            target.router.nodeConnections.set(context.localNodeId, {
              connectionId: 'pre-admitted', ws: pair.serverSocket,
              state: 'connected', nodeId: context.localNodeId,
              isIncoming: true, retired: false,
            });
          }
          return pair;
        },
      }),
    });
    assert.equal(atDial.peerKnown, true,
      'the mutation admits the peer before its IDENTIFY was delivered');
    assert.equal(atDial.nowMs, 0, 'with no frame delivered');
    assert.throws(
      () => assert.equal(atDial.peerKnown, false),
      'witness 1 fails against this mutation');
  });
