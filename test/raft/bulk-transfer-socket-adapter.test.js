import {test} from '../../src/test-helpers/tap.js';

import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  BULK_CHANNEL_SEND_OUTCOME,
} from '../../src/transport/bulk-transfer-channel.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  createAdoptedBulkConnectionPair,
  createCountingTokenBucket,
  createSealedGuardGeneration,
} from './bulk-transfer-socket-fixture.js';

// S6 Phase A link 5 guard (quest raft-snapshot-live-rebuild): the
// bulk-connection/transfer-socket adapter composes the S3 transfer drivers
// with the S3 bulk connection WITHOUT voiding the lane property — a full
// serve<->receive round trip over TWO adapters wrapping a REAL in-proc bulk
// connection pair completes; EVERY chunk byte transits the sender token
// bucket (counting-bucket witness); a forced connection close mid-transfer
// aborts BOTH ends typed (no hang — drivers have no timeouts); and any
// non-SENT sendChunkFrame outcome is FATAL, never a silent drop.

const PARTITION_ID = 'adapter_rows-p1';
const STATE_TABLE = 'adapter_rows';
const TERM = 3;
const ENTRY_COUNT = 5;
const IDENTITY = Object.freeze({
  clusterId: 'adapter-cluster-1',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 2,
});
const SMALL_CHUNK_BYTES = 4096;
const TRANSFER_ID = 'adapter-guard-transfer';
const CLOSE_AFTER_CHUNKS = 2;

function createGuardGeneration(prefix) {
  return createSealedGuardGeneration({
    prefix,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: ENTRY_COUNT,
  });
}

test('a full transfer round trip over two adapters completes and every ' +
  'chunk byte transits the token bucket', async (t) => {
  const fixture = await createGuardGeneration('bulk-adapter-rt-');
  const countingBucket = createCountingTokenBucket();
  const channel = createAdoptedBulkConnectionPair({
    serveTokenBucket: countingBucket,
  });
  try {
    const serveSocket = bulkConnectionTransferSocket(channel.serveConnection);
    const receiveSocket =
      bulkConnectionTransferSocket(channel.receiveConnection);
    const [served, received] = await Promise.all([
      serveSnapshotTransfer({
        socket: serveSocket,
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.boundaryIndex,
        transferId: TRANSFER_ID,
        chunkSizeBytes: SMALL_CHUNK_BYTES,
        // Deliberately NO driver tokenBucket: pacing authority is
        // sendChunkFrame inside the adapter (double-pacing guard).
      }),
      receiveSnapshotTransfer({
        socket: receiveSocket,
        checkpointsRoot: fixture.receiveRoot,
        expectedIdentity: IDENTITY,
        chunkSizeBytes: SMALL_CHUNK_BYTES,
      }),
    ]);
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the serve side completes over the adapter');
    t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the receive side completes over the adapter');
    t.same(listCheckpointGenerations(fixture.receiveRoot),
      [fixture.boundaryIndex],
      'the generation is published on the receiving root');
    const payloadByteLength = received.descriptor.payloadByteLength;
    const chunkCount = Math.ceil(payloadByteLength / SMALL_CHUNK_BYTES);
    t.ok(chunkCount > 1, 'anti-vacuous: the transfer spans multiple chunks');
    const bucketStats = countingBucket.stats();
    t.ok(bucketStats.acquiredBytes >= payloadByteLength,
      'every served chunk byte transited the sender token bucket ' +
      `(${bucketStats.acquiredBytes} >= ${payloadByteLength})`);
    t.ok(bucketStats.acquireCount >= chunkCount,
      'the bucket was charged at least once per chunk frame');
  } finally {
    channel.close();
    fixture.close();
  }
});

test('a forced connection close mid-transfer aborts both ends typed',
  async (t) => {
    const fixture = await createGuardGeneration('bulk-adapter-close-');
    const channel = createAdoptedBulkConnectionPair();
    try {
      const serveSocket =
        bulkConnectionTransferSocket(channel.serveConnection);
      const receiveSocket =
        bulkConnectionTransferSocket(channel.receiveConnection);
      const [served, received] = await Promise.all([
        serveSnapshotTransfer({
          socket: serveSocket,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.boundaryIndex,
          transferId: TRANSFER_ID,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
        }),
        receiveSnapshotTransfer({
          socket: receiveSocket,
          checkpointsRoot: fixture.receiveRoot,
          expectedIdentity: IDENTITY,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
          onChunkVerified: ({verifiedChunkCount}) => {
            if (verifiedChunkCount === CLOSE_AFTER_CHUNKS) {
              // The kill: drop the underlying bulk connection mid-transfer.
              channel.serveConnection.close();
            }
          },
        }),
      ]);
      t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.ABORTED,
        'the serve side aborts instead of hanging');
      t.equal(served.reason,
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHANNEL_CLOSED,
        'the serve abort is the typed channel_closed reason');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.ABORTED,
        'the receive side aborts instead of hanging');
      t.equal(received.reason,
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHANNEL_CLOSED,
        'the receive abort is the typed channel_closed reason');
      t.equal(received.verifiedChunkCount, CLOSE_AFTER_CHUNKS,
        'the receiver aborted at the kill boundary');
      t.same(listCheckpointGenerations(fixture.receiveRoot), [],
        'no generation is published from a killed transfer');
    } finally {
      channel.close();
      fixture.close();
    }
  });

test('a non-SENT chunk outcome is FATAL: both driver loops abort typed',
  async (t) => {
    const fixture = await createGuardGeneration('bulk-adapter-nonsent-');
    const channel = createAdoptedBulkConnectionPair();
    try {
      // Delegate every surface to the REAL connection except chunk sends,
      // which report the typed CLOSED outcome without sending (the
      // silently-dropped-frame shape a PENDING_LIMIT/CLOSED race produces).
      const droppingConnection = {
        nodeId: channel.serveConnection.nodeId,
        isOpen: () => channel.serveConnection.isOpen(),
        onMessage: (listener) => channel.serveConnection.onMessage(listener),
        offMessage: (listener) =>
          channel.serveConnection.offMessage(listener),
        onClose: (listener) => channel.serveConnection.onClose(listener),
        sendControl: (message) =>
          channel.serveConnection.sendControl(message),
        sendChunkFrame: async () =>
          Object.freeze({outcome: BULK_CHANNEL_SEND_OUTCOME.CLOSED}),
        close: () => channel.serveConnection.close(),
      };
      const serveSocket = bulkConnectionTransferSocket(droppingConnection);
      const receiveSocket =
        bulkConnectionTransferSocket(channel.receiveConnection);
      const [served, received] = await Promise.all([
        serveSnapshotTransfer({
          socket: serveSocket,
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.boundaryIndex,
          transferId: TRANSFER_ID,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
        }),
        receiveSnapshotTransfer({
          socket: receiveSocket,
          checkpointsRoot: fixture.receiveRoot,
          expectedIdentity: IDENTITY,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
        }),
      ]);
      t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.ABORTED,
        'the serve loop aborts on the non-SENT outcome');
      t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.ABORTED,
        'the receive loop aborts too (the abort propagated as a close)');
      t.equal(received.verifiedChunkCount, 0,
        'no chunk was ever silently dropped-then-counted');
      t.same(listCheckpointGenerations(fixture.receiveRoot), [],
        'no generation is published after a fatal chunk-send outcome');
    } finally {
      channel.close();
      fixture.close();
    }
  });
