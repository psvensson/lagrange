'use strict';

const asyncHooks = require('node:async_hooks');
const net = require('node:net');
const {isMainThread, parentPort, workerData, Worker} = require('node:worker_threads');

if (!isMainThread) {
  const sockets = [];
  let completed = 0;
  for (let index = 0; index < workerData.connections; index++) {
    const socket = net.createConnection({host: '127.0.0.1', port: workerData.port});
    sockets.push(socket);
    const done = () => {
      if (++completed === workerData.connections) parentPort.postMessage('done');
    };
    socket.once('error', done);
    socket.once('close', () => {
      if (!socket.errored) done();
    });
  }
  setTimeout(() => {
    for (const socket of sockets) socket.destroy();
  }, 200);
  return;
}

const connectionCount = 256;
const tcpWraps = new Set();
let peakTcpWraps = 0;
const hook = asyncHooks.createHook({
  init(asyncId, type) {
    if (type !== 'TCPWRAP') return;
    tcpWraps.add(asyncId);
    peakTcpWraps = Math.max(peakTcpWraps, tcpWraps.size);
  },
  destroy(asyncId) {
    tcpWraps.delete(asyncId);
  },
});
hook.enable();

const server = net.createServer({pauseOnConnect: true});
server.maxConnections = 0;
let drops = 0;
let connectionEvents = 0;
server.on('connection', () => {
  connectionEvents++;
});
server.on('drop', () => {
  drops++;
});
server.listen({host: '127.0.0.1', port: 0, backlog: 8}, () => {
  const port = server.address().port;
  const worker = new Worker(__filename, {workerData: {connections: connectionCount, port}});
  worker.once('message', () => {
    setTimeout(() => server.close(() => {
      setImmediate(() => {
        hook.disable();
        const output = {
          schema: 'cdc-adrop-runtime-probe/1',
          node: process.version,
          uv: process.versions.uv,
          platform: process.platform,
          arch: process.arch,
          attemptedConnections: connectionCount,
          drops,
          connectionEvents,
          peakMainIsolateTcpWraps: peakTcpWraps,
          tcpWrapsAfterClose: tcpWraps.size,
        };
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      });
    }), 50);
  });
  worker.once('error', (error) => {
    throw error;
  });
});
