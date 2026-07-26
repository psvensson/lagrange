import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createBulkTransferChannelRegistry,
  createByteRateTokenBucket,
} from '../../src/transport/bulk-transfer-channel.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';

// Shared S6 guard fixture: one REAL in-process bulk connection pair — each
// end adopted into its own createBulkTransferChannelRegistry (the exact
// production connection type), so adapter/router guards exercise the true
// sendChunkFrame/token-bucket/close machinery instead of a bare socket.

const FIXTURE_SERVE_NODE_ID = 'serve-node';
const FIXTURE_RECEIVE_NODE_ID = 'receive-node';
// Fast pacing for deterministic guards: pacing TRANSIT is asserted (every
// chunk byte acquires), never wall-clock rate.
const FIXTURE_FAST_BYTES_PER_SECOND = 1024 * 1024 * 1024;
const FIXTURE_FAST_CAPACITY_BYTES = 8 * 1024 * 1024;

/**
 * A token bucket that counts every acquire (bytes and calls) before
 * delegating to a real fast bucket — the "every chunk byte transited the
 * bucket" witness.
 * @return {Object} bucket with an extra stats() surface
 */
function createCountingTokenBucket() {
  const inner = createByteRateTokenBucket({
    bytesPerSecond: FIXTURE_FAST_BYTES_PER_SECOND,
    capacityBytes: FIXTURE_FAST_CAPACITY_BYTES,
  });
  const counters = {acquiredBytes: 0, acquireCount: 0};
  return Object.freeze({
    acquire(bytes, acquireOptions) {
      counters.acquireCount += 1;
      counters.acquiredBytes += bytes;
      return inner.acquire(bytes, acquireOptions);
    },
    depthBytes: () => inner.depthBytes(),
    pendingCount: () => inner.pendingCount(),
    dispose: () => inner.dispose(),
    stats: () => Object.freeze({...counters}),
  });
}

function createFastTokenBucket() {
  return createByteRateTokenBucket({
    bytesPerSecond: FIXTURE_FAST_BYTES_PER_SECOND,
    capacityBytes: FIXTURE_FAST_CAPACITY_BYTES,
  });
}

/**
 * Build one in-proc bulk connection pair adopted through two real
 * registries.
 * @param {Object} [options] {serveTokenBucket, receiveTokenBucket}
 * @return {Object} {pair, serveRegistry, receiveRegistry, serveConnection,
 *   receiveConnection, close}
 */
function createAdoptedBulkConnectionPair(options = {}) {
  const pair = createInProcWebSocketPair();
  const serveRegistry = createBulkTransferChannelRegistry({
    nodeId: FIXTURE_SERVE_NODE_ID,
    tokenBucket: options.serveTokenBucket || createFastTokenBucket(),
  });
  const receiveRegistry = createBulkTransferChannelRegistry({
    nodeId: FIXTURE_RECEIVE_NODE_ID,
    tokenBucket: options.receiveTokenBucket || createFastTokenBucket(),
  });
  const serveConnection = serveRegistry.adoptIncomingSocket({
    nodeId: FIXTURE_RECEIVE_NODE_ID,
    ws: pair.a,
  });
  const receiveConnection = receiveRegistry.adoptIncomingSocket({
    nodeId: FIXTURE_SERVE_NODE_ID,
    ws: pair.b,
  });
  return {
    pair,
    serveRegistry,
    receiveRegistry,
    serveConnection,
    receiveConnection,
    close() {
      serveRegistry.closeAll();
      receiveRegistry.closeAll();
    },
  };
}

const WAIT_TIMEOUT_MS = 10000;
const WAIT_POLL_MS = 10;

/**
 * Poll an async predicate until truthy (shared S6 guard wait loop).
 * @param {Function} predicate async or sync condition
 * @param {string} label timeout diagnostics label
 * @return {Promise<*>} the first truthy predicate value
 */
async function waitForCondition(predicate, label) {
  const startMs = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) {
      return value;
    }
    if (Date.now() - startMs > WAIT_TIMEOUT_MS) {
      throw new Error(`waitFor timeout: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

/**
 * One sealed guard generation in a disposable work dir, plus an empty
 * receive root (the shared serve/receive guard scaffold).
 * @param {Object} options {prefix, partitionId, stateTable, term, identity,
 *   entryCount}
 * @return {Promise<Object>} {workDir, checkpointsRoot, boundaryIndex,
 *   receiveRoot, close}
 */
async function createSealedGuardGeneration(options) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), options.prefix));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: options.partitionId,
    stateTable: options.stateTable,
    term: options.term,
    identity: options.identity,
    entryCount: options.entryCount,
  });
  return {
    workDir,
    checkpointsRoot,
    boundaryIndex: generation.boundaryIndex,
    receiveRoot: path.join(workDir, 'receive-checkpoints'),
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

export {
  createAdoptedBulkConnectionPair,
  createCountingTokenBucket,
  createSealedGuardGeneration,
  waitForCondition,
};
