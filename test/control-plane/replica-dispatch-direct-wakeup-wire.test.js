// Retained 72d wire inputs. Only ACK/reply timing, the durable refresh input
// and work after admission to the receiving dispatch queue are controlled.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ROUTER_MESSAGE_TYPE as FRAME} from '../../src/constants/transport.js';
import {ControlPlaneField as FIELD, ControlPlaneMessageType} from '../../src/control-plane/control-plane-constants.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {buildReplicaOperationWakeRow} from '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {cdcRouterFixture, nextTurn} from '../test-helpers/message-router-cdc-fixture.js';
import {retainedDispatchOperations} from '../test-helpers/replica-dispatch-72d-history.js';
import {createService, initEnv} from './replica-dispatch-node-state-update-test-support.js';

const ports = createPortAllocator(import.meta.url);

function inputRow(record) {
  const history = record.steps;
  const step = history.at(-1);
  return buildReplicaOperationWakeRow({...record, entityType: 'partition', entityId: record.partitionId,
    sourceReplicaId: history[0].promoteReplicaIds?.[1] ?? null,
    workflowStep: step.step, status: 'pending', createdAt: history[0].timestamp,
    updatedAt: step.timestamp, completedAt: null, errorMessage: null, stepsHistory: history});
}

async function attachReceiver(f, nodeId, bootIncarnation, admitted, frames) {
  const port = ports.getPort();
  const router = new MessageRouter({nodeId, bootIncarnation, wsHost: '127.0.0.1', wsPort: port});
  await router.initialize({startServer: true});
  const service = createService({nodeId, messageRouter: router, cdcIntegrationService: {}});
  // Stop at the real handler's admission of the whole row, after its subject check.
  service.operationDispatchQueue.enqueue = (id, reason, context) =>
    admitted.push({id, reason, ...context});
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    service.stop();
    await router.shutdown();
  }
  f.closes.push(close);
  await f.router.connectToNode(nodeId, 'ws://127.0.0.1:' + port);
  const connection = f.router.nodeConnections.get(nodeId);
  // connectToNode resolves on OPEN; IDENTIFY binds the remote boot later.
  while (connection.bootIncarnation === 0) await once(connection.ws, 'message');
  assert.equal(connection.bootIncarnation, bootIncarnation);
  const send = connection.ws.send.bind(connection.ws);
  connection.ws.send = (bytes, ...rest) => {
    const frame = JSON.parse(bytes.toString());
    if (frame.type === FRAME.SERVICE_MESSAGE) frames.push({frame, bytes: Buffer.byteLength(bytes)});
    return send(bytes, ...rest);
  };
  return {router, connection, close};
}

async function exercise(t, record, reference) {
  const f = await cdcRouterFixture(t);
  const frames = [];
  const admitted = [];
  const initial = inputRow(record);
  const id = initial.operation_id;
  const advanced = {...initial, membership_publication_epoch: 4,
    updated_at: initial.updated_at + 1};
  const advancedHistory = JSON.parse(initial.steps_history);
  advancedHistory.push({step: initial.workflow_step, timestamp: advanced.updated_at,
    previousStep: initial.workflow_step, targetNodeBootIncarnation: 2});
  advanced.steps_history = JSON.stringify(advancedHistory);
  const receiver = await attachReceiver(f, record.sourceNodeId, 1, admitted, frames);
  const sender = createService({nodeId: f.router.nodeId, messageRouter: f.router,
    cdcIntegrationService: {}, replicaOperationDispatchTimeoutMs: 1000,
    setTimeoutFn: (callback) => ({callback}), clearTimeoutFn() {},
    rebalanceCoordinator: {resolveOperationOwnerNodeId: () => record.sourceNodeId}});
  f.closes.push(() => sender.stop());

  // Run the exact former replay expression for the reference. Both variants
  // enter dispatchOperationRow for the remote owner and use the same transport.
  if (reference) {
    sender.sendDirectDispatchWakeupFromRow = (row) =>
      sender.sendDirectDispatchWakeup(sender.buildOperationFromRow(row));
  }

  let builds = 0;
  let historyBytes = 0;
  const build = sender.buildOperationRowFromCoordinator.bind(sender);
  sender.buildOperationRowFromCoordinator = (op) => {
    const row = build(op);
    builds++;
    historyBytes += Buffer.byteLength(row.steps_history);
    return row;
  };
  const ackHeld = Promise.withResolvers();
  const replyDropped = Promise.withResolvers();
  const sendRaw = receiver.router.sendRaw.bind(receiver.router);
  receiver.router.sendRaw = (ws, frame) => {
    if (frame.type === FRAME.ACK) {
      ackHeld.resolve(() => sendRaw(ws, frame));
      return;
    }
    if (frame.type === FRAME.SERVICE_RESPONSE) {
      replyDropped.resolve();
      return;
    }
    return sendRaw(ws, frame);
  };

  const first = sender.dispatchOperationRow(initial);
  const releaseAck = await ackHeld.promise;
  await replyDropped.promise;
  assert.deepEqual(admitted[0].row, initial);
  assert.throws(() => sender.replayReplicaOperationRow({...initial, steps_history: '{}'}, {}),
    /history|operation/i);
  await sender.dispatchOperationRow({...initial});
  assert.equal(builds, reference ? 2 : 1);
  await sender.dispatchOperationRow(advanced);
  assert.equal(builds, reference ? 3 : 2);
  await sender.dispatchOperationRow({...advanced});
  assert.equal(builds, reference ? 4 : 2);
  assert.equal(frames.length, 1);
  const ackSeen = Promise.withResolvers();
  const acknowledge = f.router.handleAcknowledgment.bind(f.router);
  f.router.handleAcknowledgment = (message) => {
    acknowledge(message);
    ackSeen.resolve();
  };
  releaseAck();
  await ackSeen.promise;
  await nextTurn();
  f.clock.elapse(1001);
  f.clock.dispatchDue();
  await first;
  const retry = sender.operationDispatchDeferredRetries.get(id);
  assert.deepEqual(retry?.row, advanced);
  assert.equal(retry.refreshRowBeforeDispatch, true);

  const disconnected = once(receiver.connection.ws, 'close');
  await receiver.close();
  await disconnected;
  await attachReceiver(f, record.sourceNodeId, 2, admitted, frames);
  sender.getReplicaOperationRow = async () => advanced;
  const redrive = Promise.withResolvers();
  sender.operationDispatchQueue.enqueue = (key, reason, context) => {
    sender.reconcileOperationDispatch(key, context, [reason]).then(redrive.resolve, redrive.reject);
  };
  retry.timeoutHandle.callback();
  await redrive.promise;
  assert.deepEqual(admitted.map((entry) => entry.row), [initial, advanced]);
  assert.deepEqual(sender.operationDispatchDeferredRetries.get(id)?.row, advanced);
  assert.equal(builds, reference ? 5 : 3);
  const initialBytes = Buffer.byteLength(initial.steps_history);
  const advancedBytes = Buffer.byteLength(advanced.steps_history);
  assert.equal(historyBytes,
    reference ? 2 * initialBytes + 3 * advancedBytes : initialBytes + 2 * advancedBytes);
  assert.equal(frames.length, 2);
  for (const [i, row] of [initial, advanced].entries()) {
    const {frame, bytes} = frames[i];
    const payload = {type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
      [FIELD.OPERATION_ID]: id, [FIELD.OPERATION_ROW]: row};
    assert.deepEqual(frame.payload, payload);
    assert.equal(bytes, Buffer.byteLength(JSON.stringify({...frame, payload})));
  }
  const metrics = {builds, historyBytes, wireBytes: frames.map(({bytes}) => bytes)};
  t.diagnostic(JSON.stringify({type: record.type, reference, ...metrics}));
  return metrics;
}

for (const record of retainedDispatchOperations) {
  test(record.type + ' remote wake retains its fenced retry across lost response and new boot', async (t) => {
    let reference;
    let candidate;
    await t.test('former replay expression', {timeout: 15000}, async (stage) => {
      reference = await exercise(stage, record, true);
    });
    await t.test('validated in-flight replay', {timeout: 15000}, async (stage) => {
      candidate = await exercise(stage, record, false);
    });
    assert.deepEqual(candidate.wireBytes, reference.wireBytes, 'both actual frames retain their complete byte sizes');
  });
}

test('coordinator-originated in-flight custody never authorizes persisted replay validation', async () => {
  initEnv();
  const held = Promise.withResolvers();
  const row = inputRow(retainedDispatchOperations[0]);
  const service = createService({cdcIntegrationService: {},
    messageRouter: {deliver: () => held.promise},
    rebalanceCoordinator: {resolveOperationOwnerNodeId: () => row.source_node_id}});
  const op = {...service.buildOperationFromRow(row), membershipPublicationEpoch: -1};
  const run = service.sendDirectDispatchWakeup(op);
  try {
    const invalid = buildReplicaOperationWakeRow(op);
    assert.throws(() => service.replayReplicaOperationRow(invalid, {}), /epoch/i);
    assert.throws(() => service.sendDirectDispatchWakeupFromRow({...row, steps_history: '{}'}), /history/i);
  } finally {
    held.reject(new Error('Message timeout'));
    await run;
    service.stop();
  }
});
