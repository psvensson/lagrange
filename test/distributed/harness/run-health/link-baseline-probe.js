/**
 * Link baseline probe: a tiny TCP round-trip and throughput check between
 * two hosts, using nothing but Node's own `net`. It imports only Node
 * built-ins because the lab adapter ships this file's text to each host over
 * its existing ssh command channel and runs it there from standard input:
 *
 *   node --input-type=module - server <bindHost> <port> <lifetimeMs>
 *   node --input-type=module - client <host> <port> <pings> <capBytes> <capMs>
 *
 * One TCP connection per measurement, its first byte naming the operation:
 *   P  echo: the client sends one byte at a time and times each echo.
 *   U  upload: the client sends until its byte or time cap, then ends; the
 *      server answers with the bytes it received and the time it took.
 *   D  download: the server sends until the byte or time cap the client
 *      named, then ends; the client counts and times what it received.
 *   Q  quit: the server stops.
 *
 * The transfer is bounded in bytes AND time by the caller, so the probe
 * never becomes a bulk copy on a shared household network. A throughput
 * estimate from a few megabytes is dominated by TCP slow start on a fast
 * link: read it as a lower bound of what the path carried when idle.
 *
 * The client prints one JSON line (its result or its typed failure) and the
 * server prints one JSON line when it stops.
 */

import net from 'node:net';
import {readFileSync} from 'node:fs';

// Prototype methods captured at module load (the harness convention).
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);

function includesOf(value, item) {
  return typeof value === 'string' ? stringIncludes(value, item) : arrayIncludes(value, item);
}

function indexOfIn(value, item) {
  return typeof value === 'string' ? stringIndexOf(value, item) : arrayIndexOf(value, item);
}

const OPERATION = Object.freeze({PING: 'P', UPLOAD: 'U', DOWNLOAD: 'D', QUIT: 'Q'});
const MODE = Object.freeze({SERVER: 'server', CLIENT: 'client'});
const PROBE_OUTCOME = Object.freeze({MEASURED: 'measured', UNAVAILABLE: 'unavailable'});
const PROBE_UNAVAILABLE_REASON = Object.freeze({
  CONNECT_FAILED: 'connect_failed',
  CONNECTION_FAILED: 'connection_failed',
  OPERATION_TIMED_OUT: 'operation_timed_out',
  LISTEN_FAILED: 'listen_failed',
  BAD_ARGUMENTS: 'bad_arguments',
});
const CHUNK_BYTES = 64 * 1024;
const DOWNLOAD_REQUEST_BYTES = 1 + 8;
const CONNECT_RETRY_MS = 200;
const CONNECT_BUDGET_MS = 3000;
const OPERATION_GRACE_MS = 2000;
const NANOSECONDS_PER_MILLISECOND = 1e6;
const MILLISECONDS_PER_SECOND = 1000;
const TCP_SNMP_PATH = '/proc/net/snmp';
const TCP_SNMP_PREFIX = 'Tcp:';
const STDIN_SCRIPT_ARGUMENT = '-';

function nowMs() {
  return Number(process.hrtime.bigint()) / NANOSECONDS_PER_MILLISECOND;
}

function round(value) {
  return Number(value.toFixed(3));
}

function throughput(bytes, elapsedMs) {
  return {
    bytes,
    elapsedMs: round(elapsedMs),
    bytesPerSecond: elapsedMs > 0 ?
      Math.round(bytes / (elapsedMs / MILLISECONDS_PER_SECOND)) : null,
  };
}

// Retransmitted and sent TCP segments of this host's network namespace, or
// null where the kernel does not expose them.
function readTcpSegments(readText = (path) => readFileSync(path, 'utf8')) {
  let text = '';
  try {
    text = readText(TCP_SNMP_PATH);
  } catch (error) {
    text = String(error?.code ?? '');
  }
  const rows = arrayMap(arrayFilter(stringSplit(text, '\n'), (line) => stringStartsWith(line, TCP_SNMP_PREFIX)), (line) => stringSplit(stringTrim(line.slice(TCP_SNMP_PREFIX.length)), /\s+/u));
  if (rows.length < 2) return null;
  const read = (name) => Number(rows[1][indexOfIn(rows[0], name)]);
  const segments = {retransmitted: read('RetransSegs'), sent: read('OutSegs')};
  return Number.isFinite(segments.retransmitted) && Number.isFinite(segments.sent) ?
    segments : null;
}

function serveUpload(socket, firstChunk) {
  const startedAt = nowMs();
  let bytes = firstChunk.length;
  socket.on('data', (chunk) => {
    bytes += chunk.length;
  });
  socket.on('end', () => {
    socket.end(JSON.stringify(throughput(bytes, nowMs() - startedAt)));
  });
}

function serveDownload(socket, request) {
  const capBytes = request.readUInt32BE(1);
  const capMs = request.readUInt32BE(1 + 4);
  const chunk = Buffer.alloc(CHUNK_BYTES);
  const deadline = nowMs() + capMs;
  let sent = 0;
  const pump = () => {
    while (sent < capBytes && nowMs() < deadline) {
      const size = Math.min(CHUNK_BYTES, capBytes - sent);
      sent += size;
      if (!socket.write(size === CHUNK_BYTES ? chunk : chunk.subarray(0, size))) {
        socket.once('drain', pump);
        return;
      }
    }
    socket.end();
  };
  pump();
}

/**
 * Serve probe connections until a quit, or until the lifetime is spent.
 * @param {Object} options - {host, port, lifetimeMs}.
 * @return {Promise<Object>} Resolves when the server has stopped, with the
 *   address it listened on and how many connections it served.
 */
function runLinkProbeServer({host, port, lifetimeMs, onListening = () => {}}) {
  return new Promise((resolvePromise) => {
    let connections = 0;
    const sockets = new Set();
    const server = net.createServer((socket) => {
      connections += 1;
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.on('error', () => socket.destroy());
      socket.on('close', () => sockets.delete(socket));
      let operation = null;
      let pending = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        if (operation === OPERATION.PING) return void socket.write(chunk);
        if (operation !== null) return undefined;
        pending = Buffer.concat([pending, chunk]);
        const requested = String.fromCharCode(pending[0]);
        if (requested === OPERATION.DOWNLOAD && pending.length < DOWNLOAD_REQUEST_BYTES) {
          return undefined;
        }
        operation = requested;
        socket.removeAllListeners('data');
        if (operation === OPERATION.PING) {
          socket.on('data', (echo) => socket.write(echo));
          if (pending.length > 1) socket.write(pending.subarray(1));
        } else if (operation === OPERATION.UPLOAD) {
          serveUpload(socket, pending.subarray(1));
        } else if (operation === OPERATION.DOWNLOAD) {
          serveDownload(socket, pending);
        } else {
          stop(PROBE_OUTCOME.MEASURED);
        }
        return undefined;
      });
    });
    const lifetime = setTimeout(() => stop(PROBE_OUTCOME.MEASURED), lifetimeMs);
    function stop(outcome, reason = null) {
      clearTimeout(lifetime);
      for (const socket of sockets) socket.destroy();
      server.close(() => resolvePromise({outcome, reason, connections}));
    }
    server.on('error', (error) => {
      clearTimeout(lifetime);
      resolvePromise({outcome: PROBE_OUTCOME.UNAVAILABLE,
        reason: PROBE_UNAVAILABLE_REASON.LISTEN_FAILED, detail: String(error.code), connections});
    });
    server.listen(port, host, () => onListening(server.address()));
  });
}

function connect(host, port) {
  const deadline = nowMs() + CONNECT_BUDGET_MS;
  return new Promise((resolvePromise, rejectPromise) => {
    const attempt = () => {
      const socket = net.connect({host, port});
      socket.setNoDelay(true);
      socket.once('connect', () => {
        socket.removeAllListeners('error');
        resolvePromise(socket);
      });
      socket.once('error', (error) => {
        socket.destroy();
        if (nowMs() >= deadline) {
          rejectPromise(Object.assign(error,
            {probeReason: PROBE_UNAVAILABLE_REASON.CONNECT_FAILED}));
        } else {
          setTimeout(attempt, CONNECT_RETRY_MS);
        }
      });
    };
    attempt();
  });
}

// One operation on its own connection, failed with a typed reason when the
// connection breaks or the operation outlives its bound.
async function withConnection(host, port, boundMs, operate) {
  const socket = await connect(host, port);
  return new Promise((resolvePromise, rejectPromise) => {
    let timer = null;
    const fail = (reason, error) => {
      clearTimeout(timer);
      socket.destroy();
      rejectPromise(Object.assign(error, {probeReason: reason}));
    };
    timer = setTimeout(() => fail(PROBE_UNAVAILABLE_REASON.OPERATION_TIMED_OUT,
      new Error(`link probe operation exceeded ${boundMs} ms`)), boundMs);
    socket.on('error', (error) => fail(PROBE_UNAVAILABLE_REASON.CONNECTION_FAILED, error));
    operate(socket, (value) => {
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(value);
    });
  });
}

function measureRoundTrips(host, port, pings, boundMs) {
  return withConnection(host, port, boundMs, (socket, done) => {
    const samples = [];
    let sentAt = 0;
    const send = () => {
      sentAt = nowMs();
      socket.write(samples.length === 0 && sentAt === 0 ? OPERATION.PING : 'x');
    };
    let opened = false;
    socket.on('data', () => {
      samples.push(round(nowMs() - sentAt));
      if (samples.length >= pings) return done(samples);
      return send();
    });
    // The operation byte is not echoed; the first timed byte follows it.
    socket.write(OPERATION.PING, () => {
      opened = true;
      sentAt = nowMs();
      socket.write('x');
    });
    return opened;
  });
}

function measureUpload(host, port, capBytes, capMs) {
  return withConnection(host, port, capMs + OPERATION_GRACE_MS, (socket, done) => {
    const chunk = Buffer.alloc(CHUNK_BYTES);
    const deadline = nowMs() + capMs;
    let sent = 0;
    let answer = '';
    socket.on('data', (data) => {
      answer += data;
    });
    socket.on('end', () => done(JSON.parse(answer)));
    socket.write(OPERATION.UPLOAD);
    const pump = () => {
      while (sent < capBytes && nowMs() < deadline) {
        const size = Math.min(CHUNK_BYTES, capBytes - sent);
        sent += size;
        if (!socket.write(size === CHUNK_BYTES ? chunk : chunk.subarray(0, size))) {
          socket.once('drain', pump);
          return;
        }
      }
      socket.end();
    };
    pump();
  });
}

function measureDownload(host, port, capBytes, capMs) {
  return withConnection(host, port, capMs + OPERATION_GRACE_MS, (socket, done) => {
    const request = Buffer.alloc(DOWNLOAD_REQUEST_BYTES);
    request.write(OPERATION.DOWNLOAD, 0);
    request.writeUInt32BE(capBytes, 1);
    request.writeUInt32BE(capMs, 1 + 4);
    let bytes = 0;
    let startedAt = null;
    socket.on('data', (data) => {
      if (startedAt === null) startedAt = nowMs();
      bytes += data.length;
    });
    socket.on('end', () => done(throughput(bytes, startedAt === null ? 0 : nowMs() - startedAt)));
    socket.write(request);
  });
}

function quitServer(host, port) {
  return withConnection(host, port, OPERATION_GRACE_MS, (socket, done) => {
    socket.on('close', () => done(true));
    socket.write(OPERATION.QUIT);
  });
}

function percentile50(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Measure one direction pair from this host to a probe server.
 * @param {Object} options - {host, port, pings, capBytes, capMs,
 *   readSegments}.
 * @return {Promise<Object>} The measurement, or its typed failure.
 */
async function runLinkProbeClient({host, port, pings, capBytes, capMs,
  readSegments = readTcpSegments}) {
  try {
    const samples = await measureRoundTrips(host, port, pings, CONNECT_BUDGET_MS);
    const before = readSegments();
    const upload = await measureUpload(host, port, capBytes, capMs);
    const download = await measureDownload(host, port, capBytes, capMs);
    const after = readSegments();
    await quitServer(host, port);
    return {
      outcome: PROBE_OUTCOME.MEASURED,
      roundTripMs: {samples, p50: percentile50(samples), max: Math.max(...samples)},
      upload,
      download,
      // This host's whole TCP stack over the two transfers, not this
      // connection alone; null where the kernel exposes no counters.
      tcpSegments: before === null || after === null ? null : {
        retransmitted: after.retransmitted - before.retransmitted,
        sent: after.sent - before.sent,
      },
    };
  } catch (error) {
    return {
      outcome: PROBE_OUTCOME.UNAVAILABLE,
      reason: error.probeReason ?? PROBE_UNAVAILABLE_REASON.CONNECTION_FAILED,
      detail: String(error.code ?? error.message),
    };
  }
}

async function main(argv) {
  const [mode, host, port, ...rest] = argv;
  const numbers = arrayMap([port, ...rest], Number);
  if (!includesOf(Object.values(MODE), mode) || !host || !arrayEvery(numbers, Number.isFinite)) {
    return {outcome: PROBE_OUTCOME.UNAVAILABLE,
      reason: PROBE_UNAVAILABLE_REASON.BAD_ARGUMENTS};
  }
  if (mode === MODE.SERVER) {
    return runLinkProbeServer({host, port: numbers[0], lifetimeMs: numbers[1]});
  }
  return runLinkProbeClient({host, port: numbers[0], pings: numbers[1],
    capBytes: numbers[2], capMs: numbers[3]});
}

if (process.argv[1] === STDIN_SCRIPT_ARGUMENT) {
  main(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  });
}

export {
  MODE,
  PROBE_OUTCOME,
  PROBE_UNAVAILABLE_REASON,
  readTcpSegments,
  runLinkProbeClient,
  runLinkProbeServer,
};
