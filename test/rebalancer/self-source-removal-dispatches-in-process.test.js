import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Deterministic repro / instrument for the self-dispatch source-removal stall
// (the now-dominant settle-gate blocker: a REPLACE/REMOVE source-removal whose
// dispatchNodeId === self sends REMOVE_REPLICA to `${self}/service/replica-handler`).
//
// The dispatch path is: coordinator.deliverReplicaOperationRequest →
// messageRouter.deliver(`${self}/service/replica-handler`, ...) →
// resolveDeliveryOutcome (targetNodeId === nodeId) → deliverLocal →
// router.handlers.get(targetAddress). On a MISS, deliverLocal falls through to
// deliverRemote(..., router.nodeId, ...) — a loopback websocket self-send that
// returns no_handler, so the REMOVE never terminalizes and the surplus voter
// never drains (partition parks at 4/target-3 → convergence_timeout).
//
// PURPOSE OF THIS TEST: pin WHERE the miss actually comes from. The gate logs
// claim the replica-handler IS registered at the matching address on the shared
// router, yet deliverLocal misses on the self path only. This test isolates the
// router layer: with a single shared router and the handler registered at the
// exact dispatch address, a self-targeted deliver MUST be delivered in-process
// (handler invoked), NOT looped back. If this is GREEN, the bare router is sound
// and the production miss is a wiring/instance/lifecycle divergence (escalate to
// bootstrap); if RED, the miss is in the router/deliver layer itself.

const REPLICA_HANDLER_ADDRESS = (nodeId) => `${nodeId}/service/replica-handler`;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms waiting for ${label}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('a self-targeted source-removal REMOVE delivers in-process to its ' +
  'registered replica-handler instead of looping back as a remote self-send',
async (t) => {
  const nodeId = 'self-source-removal-node';
  const router = new MessageRouter({nodeId});
  await router.initialize({startServer: false});
  router.logger = {info() {}, error() {}, warn() {}, debug() {}};

  const handlerAddress = REPLICA_HANDLER_ADDRESS(nodeId);
  const envelopes = [];
  router.register(handlerAddress, async (envelope) => {
    envelopes.push(envelope);
    return {acknowledged: true, removed: true};
  });

  try {
    const request = {
      type: 'REMOVE_REPLICA',
      operationId: 'op-self-source-removal-1',
      partitionId: 'control_plane_publications-p1',
      sourceNodeId: nodeId,
      reason: 'replace_source_removal',
    };

    // deliver to the SELF replica-handler address. A loopback miss with
    // startServer:false would hang on a non-existent self websocket — the
    // timeout converts that failure mode into a deterministic assertion.
    const response = await withTimeout(
      router.deliver(handlerAddress, request, {}),
      2000,
      'self replica-handler delivery',
    );

    t.equal(
      envelopes.length,
      1,
      'the registered self replica-handler is invoked in-process',
    );
    const result = response?.result ?? response;
    t.notOk(
      result?.noHandler,
      'delivery must NOT fall through to a no-handler loopback self-send',
    );
    t.equal(
      result?.acknowledged,
      true,
      'the in-process delivery is acknowledged by the handler',
    );
  } finally {
    await router.shutdown();
  }
});
