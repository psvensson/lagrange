import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {setImmediate as waitForTurn} from 'node:timers/promises';
import {test} from '../../src/test-helpers/tap.js';
import {BOOTSTRAP_API_ROUTE} from '../../src/bootstrap/bootstrap-api-constants.js';
import {createBootstrapContactFaultProxy} from
  '../integration/helpers/bootstrap-contact-fault-proxy.js';

async function createProxyFixture(t, onRequest, expectedFailure = false) {
  const upstream = createServer(onRequest);
  let proxy = null;
  t.teardown(async () => {
    const results = await Promise.allSettled([
      new Promise((resolve, reject) => {
        upstream.closeAllConnections();
        upstream.close((error) => error ? reject(error) : resolve());
      }),
      expectedFailure && proxy ?
        assert.rejects(proxy.stop(), {message: 'proxy_forward_failed'}) : proxy?.stop(),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((entry) => entry.reason));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  proxy = await createBootstrapContactFaultProxy(
    `http://127.0.0.1:${upstream.address().port}`,
    {signal: new AbortController().signal},
  );
  return proxy;
}

test('bootstrap fault proxy preserves upstream truth and drops only first POST', async (t) => {
  const seen = [];
  const body = '{"ready":true,"source":"real-upstream"}\n';
  const proxy = await createProxyFixture(t, (request, response) => {
    seen.push(`${request.method} ${request.url}`);
    response.writeHead(201, {'content-type': 'application/json', 'x-owner': 'upstream'});
    response.end(body);
  });
  const ready = await fetch(`${proxy.address}${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`);
  t.equal(ready.status, 201, 'upstream status is not fabricated');
  t.equal(ready.headers.get('x-owner'), 'upstream');
  t.equal(await ready.text(), body, 'readiness bytes are unchanged');
  await t.rejects(fetch(`${proxy.address}${BOOTSTRAP_API_ROUTE.BOOTSTRAP}`, {method: 'POST'}),
    'first POST fails through the real socket');
  t.same(seen, [`GET ${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`], 'fault never reaches upstream');
  const subsequent = await fetch(`${proxy.address}${BOOTSTRAP_API_ROUTE.BOOTSTRAP}`, {method: 'POST'});
  t.equal(await subsequent.text(), body, 'later POST forwards normally');
  t.same(seen, [`GET ${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`, `POST ${BOOTSTRAP_API_ROUTE.BOOTSTRAP}`]);
  t.same(proxy.ledger.map(({method, path, dropped}) => ({method, path, dropped})), [
    {method: 'GET', path: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, dropped: false},
    {method: 'POST', path: BOOTSTRAP_API_ROUTE.BOOTSTRAP, dropped: true},
    {method: 'POST', path: BOOTSTRAP_API_ROUTE.BOOTSTRAP, dropped: false},
  ]);
  const stopping = proxy.stop();
  t.equal(proxy.stop(), stopping, 'one teardown promise owns every resource');
  await stopping;
  t.same(proxy.failures, []);
});

test('proxy teardown owns an unfinished real response without fabricating forwarding failure', async (t) => {
  const proxy = await createProxyFixture(t, (_request, response) => {
    response.writeHead(200, {'content-type': 'application/json'});
    response.write('{');
  });
  const response = await fetch(`${proxy.address}${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`);
  const pendingBody = t.rejects(response.text(), 'owned incomplete response is cancelled');
  await t.resolves(proxy.stop(), 'retirement is not an upstream forwarding failure');
  await pendingBody;
  t.same(proxy.failures, [], 'deliberate owner teardown records no false failure');
});

test('proxy does not absorb a real upstream failure before retirement', async (t) => {
  let upstreamResponse = null;
  const proxy = await createProxyFixture(t, (_request, response) => {
    upstreamResponse = response;
    response.writeHead(200, {'content-type': 'application/json'});
    response.write('{');
  }, true);
  const response = await fetch(`${proxy.address}${BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY}`);
  const failedBody = t.rejects(response.text(), 'unexpected upstream disconnect reaches client');
  upstreamResponse.destroy();
  await failedBody;
  t.ok(proxy.failures.length >= 1, 'upstream failure remains loud typed evidence');
  t.equal(proxy.failures[0].code, 'proxy_forward_failed');
  await t.rejects(proxy.stop(), {message: 'proxy_forward_failed'},
    'teardown retains the observed upstream failure');
});

test('proxy refuses an accepted HTTP callback dispatched after retirement', async (t) => {
  let dispatchRequest = null;
  let upstreamAllocations = 0;
  const loaded = await t.mockImport(
    '../integration/helpers/bootstrap-contact-fault-proxy.js', {
      'node:http': {
        createServer(handler) {
          dispatchRequest = handler;
          return createServer(handler);
        },
        request() {
          upstreamAllocations += 1;
          throw new Error('retired callback allocated upstream request');
        },
      },
    },
  );
  const proxy = await loaded.createBootstrapContactFaultProxy('http://127.0.0.1:1', {
    signal: new AbortController().signal,
  });
  await proxy.stop();
  let destroyed = false;
  // Replay the server dispatch boundary, not the TCP accept boundary. A request
  // already accepted before server.close can be dispatched after its owner retires.
  t.doesNotThrow(() => dispatchRequest({
    method: 'GET', url: BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY, headers: {},
    socket: {
      destroy() {
        destroyed = true;
      },
    },
  }, {}), 'retired dispatch never allocates another upstream request');
  t.equal(upstreamAllocations, 0);
  t.equal(destroyed, true, 'late accepted socket is retired');
});

test('proxy rejects an already-cancelled listen without retaining a server', async (t) => {
  const controller = new AbortController();
  const reason = new Error('scenario deadline exhausted');
  controller.abort(reason);
  const outcome = await createBootstrapContactFaultProxy('http://127.0.0.1:1', {
    signal: controller.signal,
  }).then(
    (value) => ({value}),
    (error) => ({error}),
  );
  if (outcome.value) await outcome.value.stop();
  t.equal(outcome.value, undefined, 'cancelled acquisition publishes no proxy handle');
  t.equal(outcome.error?.code, 'proxy_listen_failed');
  t.equal(outcome.error?.cause, reason, 'the scenario deadline remains the refusal cause');
});

test('proxy cancellation owns a real listen that has not completed', async (t) => {
  const controller = new AbortController();
  const reason = new Error('scenario stopped during proxy acquisition');
  const acquisition = createBootstrapContactFaultProxy('http://127.0.0.1:1', {
    signal: controller.signal,
  });
  controller.abort(reason);
  await t.rejects(acquisition, {
    code: 'proxy_listen_failed',
    cause: reason,
  }, 'listen cancellation is observed only after the real server closes');
});

test('late upstream response cannot regain authority after proxy retirement', async (t) => {
  let dispatchRequest = null;
  let receiveResponse = null;
  const upstreamRequest = new EventEmitter();
  upstreamRequest.destroy = () => upstreamRequest.emit('close');
  const loaded = await t.mockImport(
    '../integration/helpers/bootstrap-contact-fault-proxy.js', {
      'node:http': {
        createServer(handler) {
          dispatchRequest = handler;
          return createServer(handler);
        },
        request(_target, _options, callback) {
          receiveResponse = callback;
          return upstreamRequest;
        },
      },
    },
  );
  const proxy = await loaded.createBootstrapContactFaultProxy('http://127.0.0.1:1', {
    signal: new AbortController().signal,
  });
  let responseWrites = 0;
  let outgoingDestroyed = 0;
  const incoming = new EventEmitter();
  incoming.method = 'GET';
  incoming.url = BOOTSTRAP_API_ROUTE.BOOTSTRAP_READY;
  incoming.headers = {};
  incoming.socket = {destroy() {}};
  incoming.pipe = () => {};
  const outgoing = {
    writeHead() {
      responseWrites += 1;
    },
    destroy() {
      outgoingDestroyed += 1;
    },
  };
  dispatchRequest(incoming, outgoing);
  await proxy.stop();
  let upstreamDestroyed = 0;
  let upstreamPipes = 0;
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.destroy = () => {
    upstreamDestroyed += 1;
    response.emit('close');
  };
  response.pipe = () => {
    upstreamPipes += 1;
  };
  receiveResponse(response);
  t.equal(upstreamDestroyed, 1, 'retired response is destroyed by the proxy owner');
  t.equal(outgoingDestroyed, 1, 'the downstream half is retired with it');
  t.equal(responseWrites, 0, 'late metadata cannot be presented as upstream truth');
  t.equal(upstreamPipes, 0, 'late bytes cannot escape into the downstream response');
});

test('proxy stop waits for every accepted resource after a close failure', async (t) => {
  let server = null;
  const closeFailure = new Error('server close failed');
  const destroyFailure = new Error('socket destroy threw synchronously');
  const loaded = await t.mockImport(
    '../integration/helpers/bootstrap-contact-fault-proxy.js', {
      'node:http': {
        createServer(handler) {
          server = new EventEmitter();
          server.handler = handler;
          server.address = () => ({port: 19090});
          server.listen = (...args) => args.at(-1)();
          server.close = (callback) => queueMicrotask(() => callback(closeFailure));
          return server;
        },
        request() {
          throw new Error('unexpected forwarding request');
        },
      },
    },
  );
  const proxy = await loaded.createBootstrapContactFaultProxy('http://127.0.0.1:1', {
    signal: new AbortController().signal,
  });
  const socket = new EventEmitter();
  socket.destroy = () => {
    throw destroyFailure;
  };
  server.emit('connection', socket);
  let settled = false;
  const stopping = proxy.stop().then(
    () => {
      settled = true;
      return null;
    },
    (error) => {
      settled = true;
      return error;
    },
  );
  await waitForTurn();
  t.equal(settled, false, 'a close error cannot abandon another accepted resource');
  socket.emit('close');
  const error = await stopping;
  t.equal(error?.code, 'proxy_close_failed');
  t.equal(error?.errors?.[0]?.cause, closeFailure,
    'the completed stop retains the exact close failure');
  t.equal(error?.errors?.[1]?.cause, destroyFailure,
    'the completed stop retains the synchronous destruction failure');
});
