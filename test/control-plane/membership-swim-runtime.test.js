// Capstone end-to-end harness for the SWIM runtime (increment 3c-ii): a node's
// MembershipSwimRuntime probes real peers over real in-process MessageRouters, a peer
// partitions, and the detector drives it alive -> suspect -> dead, after which the
// SWIM active-set rule trims it. Detector/prober run on a VirtualTimeSource and are
// stepped deterministically via probeOnce()/tick(); the transport (ping/relay) settles
// on microtasks.
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {MembershipSwimRuntime} from '../../src/control-plane/membership-swim-runtime.js';
import {
  buildSwimRelayHandler,
  buildSwimPingHandler,
  buildSwimRelayAddress,
  buildSwimPingAddress,
} from '../../src/control-plane/membership-swim-prober.js';
import {SWIM_MEMBER_STATE} from '../../src/control-plane/membership-swim-detector.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'swim-runtime-test'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitFor(condition, timeoutMs = 2000, intervalMs = 10) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function makeRouter(nodeId, port) {
  const router = new MessageRouter({
    nodeId,
    nodeAddress: `ws://127.0.0.1:${port}`,
    wsPort: port,
    inProcess: true,
  });
  router.setServiceNodeResolver((address) => {
    const match = address.match(/^([^/]+)\//);
    return match ? match[1] : null;
  });
  return router;
}

test('SWIM runtime drives a partitioned peer alive->suspect->dead end to end', async (t) => {
  initEnv();
  const [A, B, C] = ['swim-rt-A', 'swim-rt-B', 'swim-rt-C'];
  const [pa, pb, pc] = [21851, 21852, 21853];
  const ra = makeRouter(A, pa);
  const rb = makeRouter(B, pb);
  const rc = makeRouter(C, pc);
  let bShutdown = false;
  try {
    await ra.initialize({startServer: true});
    await rb.initialize({startServer: true});
    await rc.initialize({startServer: true});

    // B and C are probe targets/helpers -> they answer the direct swim-ping + relay.
    rb.register(buildSwimPingAddress(B), buildSwimPingHandler({}));
    rc.register(buildSwimPingAddress(C), buildSwimPingHandler({}));
    rb.register(buildSwimRelayAddress(B), buildSwimRelayHandler({messageRouter: rb}));
    rc.register(buildSwimRelayAddress(C), buildSwimRelayHandler({messageRouter: rc}));

    await ra.connectToNode(B, `ws://127.0.0.1:${pb}`);
    await ra.connectToNode(C, `ws://127.0.0.1:${pc}`);
    await rc.connectToNode(B, `ws://127.0.0.1:${pb}`); // C can ping B (indirect)
    const connected = await waitFor(
      () =>
        ra.getConnectionState(B) === 'connected' &&
        ra.getConnectionState(C) === 'connected' &&
        rc.getConnectionState(B) === 'connected',
    );
    t.ok(connected, 'probe mesh connected');

    const runtime = new MembershipSwimRuntime({
      nodeId: A,
      messageRouter: ra,
      timeSource: new VirtualTimeSource({startMs: 0}),
      randomSource: new SeededRandomSource({seed: 5}),
      getMembers: () => [B, C],
      pingTimeoutMs: 200,
    });

    // Healthy phase: probe each peer; both must be ALIVE.
    for (let i = 0; i < 4; i++) {
      await runtime.probeOnce();
    }
    const healthy = runtime.verdictByNodeId();
    t.equal(healthy[B], SWIM_MEMBER_STATE.ALIVE, 'B alive while connected');
    t.equal(healthy[C], SWIM_MEMBER_STATE.ALIVE, 'C alive while connected');

    // Partition B.
    await rb.shutdown();
    bShutdown = true;
    const bGone = await waitFor(
      () =>
        ra.getConnectionState(B) !== 'connected' &&
        rc.getConnectionState(B) !== 'connected',
    );
    t.ok(bGone, 'B disconnected');

    // Probe through the partition: direct + indirect (via C) both miss for B.
    for (let i = 0; i < 6; i++) {
      await runtime.probeOnce();
    }
    t.equal(
      runtime.verdictByNodeId()[B],
      SWIM_MEMBER_STATE.SUSPECT,
      'B suspect after probes miss (not yet past deadline)',
    );
    t.equal(runtime.verdictByNodeId()[C], SWIM_MEMBER_STATE.ALIVE, 'C still alive');

    // Elapse the suspicion deadline.
    runtime.tick(10 ** 9);
    t.equal(runtime.verdictByNodeId()[B], SWIM_MEMBER_STATE.DEAD, 'B confirmed dead');

    // The SWIM active set trims the dead peer (self A retained, C alive retained).
    const active = runtime.activeMemberSet({
      publishedBaselineNodeIds: [A, B, C],
      memberStatesByNodeId: {},
      membershipFreezeActive: false,
    });
    t.same(active, [A, C], 'dead peer trimmed from the SWIM active set');

    // Under freeze the same dead verdict must NOT trim (suspicion-quorum clamp).
    const frozen = runtime.activeMemberSet({
      publishedBaselineNodeIds: [A, B, C],
      memberStatesByNodeId: {},
      membershipFreezeActive: true,
    });
    t.same(frozen, [A, B, C], 'freeze retains the baseline despite the dead verdict');
  } finally {
    await ra.shutdown();
    await rc.shutdown();
    if (!bShutdown) {
      await rb.shutdown();
    }
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('runtime.start registers the relay handler and toggles running state', async (t) => {
  initEnv();
  const [A, C] = ['swim-life-A', 'swim-life-C'];
  const [pa, pc] = [21861, 21862];
  const ra = makeRouter(A, pa);
  const rc = makeRouter(C, pc);
  try {
    await ra.initialize({startServer: true});
    await rc.initialize({startServer: true});
    await rc.connectToNode(A, `ws://127.0.0.1:${pa}`);
    await waitFor(() => rc.getConnectionState(A) === 'connected');

    const runtime = new MembershipSwimRuntime({
      nodeId: A,
      messageRouter: ra,
      timeSource: new VirtualTimeSource({startMs: 0}),
      randomSource: new SeededRandomSource({seed: 1}),
      getMembers: () => [C],
      pingTimeoutMs: 200,
    });
    t.equal(runtime.isRunning(), false, 'not running before start');
    runtime.start();
    t.equal(runtime.isRunning(), true, 'running after start');

    // The relay handler is now reachable: ask A (via its relay) to ping C.
    const relayed = await rc.deliver(
      buildSwimRelayAddress(A),
      {type: 'swim_indirect_probe', targetNodeId: C},
      {timeoutMs: 200},
    );
    t.equal(relayed.acknowledged, true, 'A relay handler acknowledged');
    t.equal(relayed.reachable, true, 'A relay reports C reachable');

    runtime.stop();
    t.equal(runtime.isRunning(), false, 'not running after stop');
  } finally {
    await ra.shutdown();
    await rc.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('gossip propagates between two runtimes over real transport', async (t) => {
  initEnv();
  const [A, B] = ['swim-gossip-A', 'swim-gossip-B'];
  const [pa, pb] = [21871, 21872];
  const ra = makeRouter(A, pa);
  const rb = makeRouter(B, pb);
  try {
    await ra.initialize({startServer: true});
    await rb.initialize({startServer: true});
    await ra.connectToNode(B, `ws://127.0.0.1:${pb}`);
    await waitFor(
      () =>
        ra.getConnectionState(B) === 'connected' &&
        rb.getConnectionState(A) === 'connected',
    );

    const runtimeA = new MembershipSwimRuntime({
      nodeId: A,
      messageRouter: ra,
      timeSource: new VirtualTimeSource({startMs: 0}),
      randomSource: new SeededRandomSource({seed: 2}),
      getMembers: () => [B],
      pingTimeoutMs: 200,
    });
    const runtimeB = new MembershipSwimRuntime({
      nodeId: B,
      messageRouter: rb,
      timeSource: new VirtualTimeSource({startMs: 0}),
      randomSource: new SeededRandomSource({seed: 2}),
      getMembers: () => [A],
      pingTimeoutMs: 200,
    });
    runtimeA.start(); // registers A's swim-ping handler
    runtimeB.start(); // registers B's swim-ping handler

    // A learns (from elsewhere) that a phantom node C is suspect; this must
    // disseminate to B when A next probes B.
    runtimeA.detector().recordSuspect('swim-gossip-C', 'X', 0);
    t.equal(
      runtimeB.detector().verdictFor('swim-gossip-C'),
      SWIM_MEMBER_STATE.ALIVE,
      'B has not heard about C yet',
    );

    await runtimeA.probeOnce(); // swim-ping to B carries the suspect(C) gossip

    t.equal(
      runtimeB.detector().verdictFor('swim-gossip-C'),
      SWIM_MEMBER_STATE.SUSPECT,
      'B received the suspect(C) gossip over the real probe exchange',
    );
    runtimeA.stop();
    runtimeB.stop();
  } finally {
    await ra.shutdown();
    await rb.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
