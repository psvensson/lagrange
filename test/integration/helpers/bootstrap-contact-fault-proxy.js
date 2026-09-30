import {createServer, request as httpRequest} from 'node:http';
import {BOOTSTRAP_API_ROUTE} from '../../../src/bootstrap/bootstrap-api-constants.js';
import {JOINING_HTTP} from '../../../src/bootstrap/node-joining-constants.js';

const PROXY_FAILURE = Object.freeze({
  LISTEN: 'proxy_listen_failed',
  FORWARD: 'proxy_forward_failed',
  CLOSE: 'proxy_close_failed',
});

function proxyError(code, cause) {
  return Object.assign(new Error(code, {cause}), {code});
}

function proxyAggregateError(code, errors) {
  return Object.assign(new AggregateError(errors, code), {code});
}

async function listenForConnections(server, signal) {
  if (!(signal instanceof globalThis.AbortSignal)) {
    throw proxyError(PROXY_FAILURE.LISTEN,
      new TypeError('proxy listen requires an AbortSignal'));
  }
  if (signal.aborted) throw proxyError(PROXY_FAILURE.LISTEN, signal.reason);
  await new Promise((resolve, reject) => {
    let abortClose = null;
    let failed = null;
    let aborted = null;
    const cleanup = () => {
      server.off('error', failed);
      signal.removeEventListener('abort', aborted);
      if (abortClose) server.off('close', abortClose);
    };
    const settle = (complete, value) => {
      cleanup();
      complete(value);
    };
    failed = (cause) => {
      if (!signal.aborted) settle(reject, proxyError(PROXY_FAILURE.LISTEN, cause));
    };
    aborted = () => {
      const failure = proxyError(PROXY_FAILURE.LISTEN, signal.reason);
      abortClose = () => settle(reject, failure);
      server.once('close', abortClose);
    };
    server.once('error', failed);
    signal.addEventListener('abort', aborted, {once: true});
    try {
      server.listen({port: 0, host: '127.0.0.1', signal}, () => settle(resolve));
    } catch (cause) {
      settle(reject, proxyError(PROXY_FAILURE.LISTEN, cause));
    }
  });
}

/**
 * A network fault, not a bootstrap fixture: readiness and successful requests
 * are streamed from the real upstream unchanged. Exactly the first bootstrap
 * POST loses its connection before reaching that upstream.
 */
async function createBootstrapContactFaultProxy(upstream, {signal} = {}) {
  const ledger = [];
  const sockets = new Set();
  const requests = new Set();
  const responses = new Set();
  const failures = [];
  let dropped = false;
  let stopPromise = null;

  const forward = (incoming, outgoing, entry) => {
    const target = new URL(incoming.url, upstream);
    const request = httpRequest(target, {
      method: incoming.method,
      headers: {...incoming.headers, host: target.host},
      agent: false,
    }, (response) => {
      if (stopPromise) {
        response.destroy();
        outgoing.destroy();
        return;
      }
      responses.add(response);
      response.once('close', () => responses.delete(response));
      entry.statusCode = response.statusCode;
      outgoing.writeHead(response.statusCode, response.headers);
      response.once('error', (cause) => {
        if (!stopPromise) failures.push(proxyError(PROXY_FAILURE.FORWARD, cause));
        outgoing.destroy(cause);
      });
      response.pipe(outgoing);
    });
    requests.add(request);
    request.once('close', () => requests.delete(request));
    request.once('error', (cause) => {
      if (!stopPromise) failures.push(proxyError(PROXY_FAILURE.FORWARD, cause));
      outgoing.destroy(cause);
    });
    incoming.once('error', (cause) => request.destroy(cause));
    incoming.pipe(request);
  };

  const server = createServer((incoming, outgoing) => {
    if (stopPromise) {
      incoming.socket.destroy();
      return;
    }
    const entry = {method: incoming.method, path: incoming.url, dropped: false};
    ledger.push(entry);
    if (!dropped && incoming.method === JOINING_HTTP.METHOD_POST &&
        incoming.url === BOOTSTRAP_API_ROUTE.BOOTSTRAP) {
      dropped = true;
      entry.dropped = true;
      incoming.socket.destroy();
      return;
    }
    forward(incoming, outgoing, entry);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await listenForConnections(server, signal);
  server.on('error', (cause) => failures.push(proxyError(PROXY_FAILURE.FORWARD, cause)));

  const stop = () => {
    if (stopPromise) return stopPromise;
    // Publish retirement before destruction emits any request errors.
    const completion = Promise.withResolvers();
    stopPromise = completion.promise;
    const closedSockets = [...sockets].map((socket) =>
      new Promise((resolve) => socket.once('close', resolve)),
    );
    const closedRequests = [...requests].map((request) =>
      new Promise((resolve) => request.once('close', resolve)),
    );
    const closedResponses = [...responses].map((response) =>
      new Promise((resolve) => response.once('close', resolve)),
    );
    const closedServer = new Promise((resolve, reject) => {
      server.close((cause) => cause ?
        reject(proxyError(PROXY_FAILURE.CLOSE, cause)) : resolve());
    });
    const destroyResources = [...requests, ...responses, ...sockets]
      .map((resource) => Promise.resolve().then(() => resource.destroy())
        .catch((cause) => {
          throw proxyError(PROXY_FAILURE.CLOSE, cause);
        }));
    Promise.allSettled([
      closedServer, ...closedSockets, ...closedRequests, ...closedResponses,
      ...destroyResources,
    ]).then((results) => {
      const closeFailures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      const observedFailures = [...closeFailures, ...failures];
      if (!observedFailures.length) return completion.resolve();
      const code = closeFailures.length ? PROXY_FAILURE.CLOSE : PROXY_FAILURE.FORWARD;
      completion.reject(proxyAggregateError(code, observedFailures));
    });
    return stopPromise;
  };
  return {
    address: `http://127.0.0.1:${server.address().port}`,
    ledger,
    failures,
    stop,
  };
}

export {createBootstrapContactFaultProxy};
