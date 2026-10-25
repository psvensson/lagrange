/**
 * Delivery-lifetime deadline liveness (contract F1, R07, R13).
 *
 * The sender owns one deadline covering queue residence, connection wait,
 * ACK and SERVICE_RESPONSE. That deadline settles an owned obligation, so its
 * timer must hold the event loop: a process whose only pending work is a
 * waiting delivery must still observe the typed ROUTER_MESSAGE_TIMEOUT
 * refusal instead of exiting with the delivery unsettled. The owner's
 * dispose and router shutdown paths clear the timer, so a settled or
 * shut-down lifetime holds nothing open.
 *
 * Each case runs in a child process whose event loop contains only the
 * router and a handle-free fake socket, so nothing else can keep it alive.
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from '../../src/test-helpers/tap.js';

const WITNESS_KEY = 'deliveryDeadlineWitness';
const SHORT_DEADLINE_MS = 100;
// A leaked ref'd deadline would hold the child for this long.
const LONG_DEADLINE_MS = 60000;
const CHILD_KILL_MS = 20000;
const PROMPT_EXIT_MS = 15000;
const UNSETTLED_TOP_LEVEL_AWAIT_EXIT_CODE = 13;
const TIMER_RESOURCE = 'Timeout';
const MODE = Object.freeze({
  NO_ACK: 'no-ack',
  ACK_NO_RESPONSE: 'ack-no-response',
  SHUTDOWN: 'shutdown',
  ACK_AND_RESPONSE: 'ack-and-response',
});

function moduleUrl(relativePath) {
  return JSON.stringify(pathToFileURL(path.resolve(relativePath)).href);
}

function childProgram(mode, deadlineMs) {
  return `
    import {EventEmitter} from 'node:events';
    import {MessageRouter, ConnectionState} from
      ${moduleUrl('src/transport/message-router.js')};
    import {ConfigurationManager} from
      ${moduleUrl('src/config/configuration-manager.js')};
    import {LoggingService} from ${moduleUrl('src/logging/logging-service.js')};
    import {TEST_BOOT_INCARNATION} from
      ${moduleUrl('test/test-helpers/boot-incarnation-fixture.js')};
    import {acknowledgeThenRespondFrames} from
      ${moduleUrl('test/test-helpers/message-router-remote-answer.js')};
    const mode = ${JSON.stringify(mode)};
    ConfigurationManager.getInstance().initialize({
      node: {id: 'node-a'}, logging: {level: 'fatal'},
      transport: {messageTimeoutMs: ${deadlineMs}},
    });
    LoggingService.getInstance().initialize({level: 'fatal'});
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION, nodeId: 'node-a'});
    await router.initialize({startServer: false});
    const ws = Object.assign(new EventEmitter(), {
      readyState: 1,
      terminate() {
        this.readyState = 3;
        setImmediate(() => this.emit('close'));
      },
      send(bytes, _options, written) {
        written?.();
        if (mode !== ${JSON.stringify(MODE.ACK_NO_RESPONSE)} &&
            mode !== ${JSON.stringify(MODE.ACK_AND_RESPONSE)}) return;
        const {messageId} = JSON.parse(String(bytes));
        const [ack, response] = acknowledgeThenRespondFrames(messageId, {ok: true});
        setImmediate(() => {
          router.handleAcknowledgment(ack);
          if (mode !== ${JSON.stringify(MODE.ACK_AND_RESPONSE)}) return;
          setImmediate(() => router.handleServiceResponse(response));
        });
      },
    });
    router.nodeConnections.set('node-b', {
      nodeId: 'node-b', connectionId: 'node-b-conn-1', ws,
      state: ConnectionState.CONNECTED, isIncoming: false,
      reconnectAttempts: 0, reconnectTimeout: null, pingInterval: null,
      address: 'ws://node-b:9999', nodeAddress: 'ws://node-b:9999',
      isSelfConnection: false, ackTimeoutStreak: 0, lastAckAt: null,
      lastAckTimeoutAt: null,
    });
    let stopping = null;
    if (mode === ${JSON.stringify(MODE.SHUTDOWN)}) {
      setImmediate(() => {
        stopping = router.shutdown();
      });
    }
    const outcome = await router.deliver('node-b/service/witness', {type: 'T'})
      .then((result) => ({result}), (error) => ({error}));
    const settledResources = process.getActiveResourcesInfo();
    await (stopping ?? router.shutdown());
    console.log(JSON.stringify({${WITNESS_KEY}: {
      deliveryState: outcome.result?.transport.deliveryState ?? null,
      errorCode: outcome.result?.transport.errorCode ?? outcome.error?.code ?? null,
      error: outcome.result?.transport.error ?? outcome.error?.message ?? null,
      settledResources,
      closedResources: process.getActiveResourcesInfo(),
    }}));
  `;
}

function runChild(mode, deadlineMs) {
  const startedAt = Date.now();
  const child = spawnSync(process.execPath,
    ['--input-type=module', '--eval', childProgram(mode, deadlineMs)],
    {encoding: 'utf8', timeout: CHILD_KILL_MS});
  const line = child.stdout.split('\n').find((entry) => entry.includes(WITNESS_KEY));
  return {
    status: child.status,
    signal: child.signal,
    stderr: child.stderr,
    wallMs: Date.now() - startedAt,
    witness: line ? JSON.parse(line)[WITNESS_KEY] : null,
  };
}

function assertTypedTimeout(t, run) {
  t.not(run.status, UNSETTLED_TOP_LEVEL_AWAIT_EXIT_CODE,
    'the child must not exit with the delivery still unsettled');
  t.equal(run.status, 0, `the child exits cleanly (stderr: ${run.stderr})`);
  t.ok(run.witness, 'the delivery settled and the child reported it');
  t.equal(run.witness?.deliveryState === 'delivered', false, 'the delivery is refused');
  t.equal(run.witness?.errorCode, 'ROUTER_MESSAGE_TIMEOUT',
    'the refusal is the typed delivery-deadline timeout');
}

function assertNothingHeldOpen(t, run) {
  t.equal(run.status, 0, `the child exits cleanly (stderr: ${run.stderr})`);
  t.ok(run.wallMs < PROMPT_EXIT_MS,
    `the closed lifetime holds nothing open (${run.wallMs}ms, deadline ${LONG_DEADLINE_MS}ms)`);
  t.notOk(run.witness?.closedResources.includes(TIMER_RESOURCE),
    'no ref\'d timer survives the closed lifetime and router shutdown');
}

test('a pending ACK deadline fires with nothing else on the event loop', async (t) => {
  assertTypedTimeout(t, runChild(MODE.NO_ACK, SHORT_DEADLINE_MS));
});

test('a pending SERVICE_RESPONSE deadline after ACK fires with nothing else on the loop',
  async (t) => {
    assertTypedTimeout(t, runChild(MODE.ACK_NO_RESPONSE, SHORT_DEADLINE_MS));
  });

test('router shutdown clears a pending delivery deadline', async (t) => {
  const run = runChild(MODE.SHUTDOWN, LONG_DEADLINE_MS);
  t.ok(run.witness, 'the shutdown refusal settled the delivery');
  t.equal(run.witness?.deliveryState === 'delivered', false, 'the delivery is refused at shutdown');
  t.equal(run.witness?.error, 'Router shutdown', 'the refusal names the router shutdown');
  assertNothingHeldOpen(t, run);
});

test('a settled delivery disposes its deadline timer', async (t) => {
  const run = runChild(MODE.ACK_AND_RESPONSE, LONG_DEADLINE_MS);
  t.equal(run.witness?.deliveryState, 'delivered',
    'the ACK and SERVICE_RESPONSE settle the delivery');
  t.notOk(run.witness?.settledResources.includes(TIMER_RESOURCE),
    'dispose cleared the deadline timer as soon as the delivery settled');
  assertNothingHeldOpen(t, run);
});
