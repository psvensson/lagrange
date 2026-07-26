import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_RESUME_MODE,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {
  createLargeSealedSourceGeneration,
} from './snapshot-catchup-fixture.js';
import {
  createAdoptedBulkConnectionPair,
  createCountingTokenBucket,
} from './bulk-transfer-socket-fixture.js';

// S6 Phase A link 7 guard (quest raft-snapshot-live-rebuild): the SCALED
// multi-chunk fixture. A generation spanning DOZENS of chunks transfers end
// to end over the bulk-connection adapters; a mid-transfer kill resumes
// from the verified chunk boundary (only the remaining chunks are
// re-served); the attack battery — tamper, truncate, duplicate,
// stale-epoch, cancel — is typed per attack; and ONE genuinely-large
// (tens-of-MiB, default 1 MiB chunk geometry) generation completes. This
// is where "large" is earned deterministically per deterministic-first —
// the live run certifies, it does not discover.

const PARTITION_ID = 'multichunk_rows-p1';
const STATE_TABLE = 'multichunk_rows';
const TERM = 7;
const SEALED_EPOCH = 4;
const IDENTITY = Object.freeze({
  clusterId: 'multichunk-cluster-1',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const STALE_EXPECTED_IDENTITY = Object.freeze({
  ...IDENTITY,
  membershipEpoch: SEALED_EPOCH + 1,
});
// Shrunk chunk geometry (the injectable chunkSizeBytes seam) so a ~3 MiB
// generation crosses DOZENS of chunk boundaries fast.
const SMALL_CHUNK_BYTES = 64 * 1024;
const SMALL_TOTAL_PAYLOAD_BYTES = 3 * 1024 * 1024;
const DOZENS = 36;
const KILL_AFTER_CHUNKS = 10;
const CANCEL_AFTER_CHUNKS = 5;
const ATTACK_CHUNK_INDEX = 3;
// The ONE genuinely-large case: tens of MiB at the DEFAULT 1 MiB geometry.
const LARGE_TOTAL_PAYLOAD_BYTES = 24 * 1024 * 1024;
const TRANSFER_ID = 'multichunk-transfer';

async function createMultichunkFixture(prefix, totalPayloadBytes) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createLargeSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    totalPayloadBytes,
  });
  return {
    workDir,
    checkpointsRoot,
    boundaryIndex: generation.boundaryIndex,
    entryCount: generation.entryCount,
    receiveRoot: path.join(workDir, 'receive-checkpoints'),
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

// Interpose on a receiver-side socket: control (string) frames pass
// untouched; each binary chunk frame flows through transformFrame(frame,
// ordinal) -> an array of frames to deliver (mutate, truncate, duplicate).
function interceptBinaryFrames(socket, transformFrame) {
  let binaryOrdinal = 0;
  return Object.freeze({
    on(event, listener) {
      if (event !== 'message') {
        socket.on(event, listener);
        return;
      }
      socket.on(event, (data, isBinary) => {
        const isControlText = typeof data === 'string' || isBinary === false;
        if (isControlText) {
          listener(data, isBinary);
          return;
        }
        for (const frame of transformFrame(data, binaryOrdinal)) {
          listener(frame, isBinary);
        }
        binaryOrdinal += 1;
      });
    },
    send: (payload) => socket.send(payload),
  });
}

function flipLastByte(frame) {
  const mutated = Buffer.from(frame);
  mutated[mutated.length - 1] ^= 0xff;
  return mutated;
}

// Each attack run receives into its OWN fresh root: durable staging from a
// previous attack would otherwise shift the resume boundary and mask the
// attack under test.
async function runInterceptedTransfer(fixture, options) {
  const {a, b} = createInProcWebSocketPair();
  const receiveRoot = fs.mkdtempSync(
    path.join(fixture.workDir, 'attack-receive-'));
  const receiveSocket = options.transformFrame ?
    interceptBinaryFrames(b, options.transformFrame) :
    b;
  const [served, received] = await Promise.all([
    serveSnapshotTransfer({
      socket: a,
      checkpointsRoot: fixture.checkpointsRoot,
      generationIndex: fixture.boundaryIndex,
      transferId: TRANSFER_ID,
      chunkSizeBytes: SMALL_CHUNK_BYTES,
    }),
    receiveSnapshotTransfer({
      socket: receiveSocket,
      checkpointsRoot: receiveRoot,
      expectedIdentity: options.expectedIdentity || IDENTITY,
      chunkSizeBytes: SMALL_CHUNK_BYTES,
      signal: options.signal,
      onChunkVerified: options.onChunkVerified,
    }),
  ]);
  return {served, received, receiveRoot};
}

test('a generation spanning dozens of chunks transfers end to end over ' +
  'the bulk adapters', async (t) => {
  const fixture = await createMultichunkFixture(
    'multichunk-e2e-', SMALL_TOTAL_PAYLOAD_BYTES);
  const countingBucket = createCountingTokenBucket();
  const channel = createAdoptedBulkConnectionPair({
    serveTokenBucket: countingBucket,
  });
  try {
    const [served, received] = await Promise.all([
      serveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(channel.serveConnection),
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.boundaryIndex,
        transferId: TRANSFER_ID,
        chunkSizeBytes: SMALL_CHUNK_BYTES,
      }),
      receiveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(channel.receiveConnection),
        checkpointsRoot: fixture.receiveRoot,
        expectedIdentity: IDENTITY,
        chunkSizeBytes: SMALL_CHUNK_BYTES,
      }),
    ]);
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the multi-chunk serve completes');
    t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the multi-chunk receive completes');
    const chunkCount = Math.ceil(
      received.descriptor.payloadByteLength / SMALL_CHUNK_BYTES);
    t.ok(chunkCount >= DOZENS,
      `anti-vacuous: the transfer spans dozens of chunks (${chunkCount})`);
    t.ok(countingBucket.stats().acquiredBytes >=
        received.descriptor.payloadByteLength,
    'every chunk byte transited the sender token bucket at scale');
    t.same(listCheckpointGenerations(fixture.receiveRoot),
      [fixture.boundaryIndex],
      'the scaled generation is published on the receiver');
  } finally {
    channel.close();
    fixture.close();
  }
});

test('a mid-transfer kill resumes from the verified chunk boundary',
  async (t) => {
    const fixture = await createMultichunkFixture(
      'multichunk-resume-', SMALL_TOTAL_PAYLOAD_BYTES);
    const firstChannel = createAdoptedBulkConnectionPair();
    try {
      const [killedServe, killedReceive] = await Promise.all([
        serveSnapshotTransfer({
          socket: bulkConnectionTransferSocket(firstChannel.serveConnection),
          checkpointsRoot: fixture.checkpointsRoot,
          generationIndex: fixture.boundaryIndex,
          transferId: TRANSFER_ID,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
        }),
        receiveSnapshotTransfer({
          socket: bulkConnectionTransferSocket(
            firstChannel.receiveConnection),
          checkpointsRoot: fixture.receiveRoot,
          expectedIdentity: IDENTITY,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
          onChunkVerified: ({verifiedChunkCount}) => {
            if (verifiedChunkCount === KILL_AFTER_CHUNKS) {
              // The kill: the connection dies mid-transfer.
              firstChannel.serveConnection.close();
            }
          },
        }),
      ]);
      t.equal(killedServe.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.ABORTED,
        'the killed serve aborts typed');
      t.equal(killedReceive.reason,
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHANNEL_CLOSED,
        'the killed receive is the typed channel_closed abort');
      t.equal(killedReceive.verifiedChunkCount, KILL_AFTER_CHUNKS,
        'the durable verified boundary sits at the kill point');

      // Fresh channel, same roots: the resume must re-serve ONLY the
      // remaining chunks (counting-bucket witness on the second serve).
      const resumeBucket = createCountingTokenBucket();
      const resumeChannel = createAdoptedBulkConnectionPair({
        serveTokenBucket: resumeBucket,
      });
      try {
        const [resumedServe, resumedReceive] = await Promise.all([
          serveSnapshotTransfer({
            socket: bulkConnectionTransferSocket(
              resumeChannel.serveConnection),
            checkpointsRoot: fixture.checkpointsRoot,
            generationIndex: fixture.boundaryIndex,
            transferId: TRANSFER_ID,
            chunkSizeBytes: SMALL_CHUNK_BYTES,
          }),
          receiveSnapshotTransfer({
            socket: bulkConnectionTransferSocket(
              resumeChannel.receiveConnection),
            checkpointsRoot: fixture.receiveRoot,
            expectedIdentity: IDENTITY,
            chunkSizeBytes: SMALL_CHUNK_BYTES,
          }),
        ]);
        t.equal(resumedServe.outcome,
          RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
          'the resumed serve completes');
        t.equal(resumedReceive.outcome,
          RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
          'the resumed receive completes');
        t.equal(resumedReceive.resumeMode,
          RAFT_SNAPSHOT_TRANSFER_RESUME_MODE.RESUMED_FROM_BOUNDARY,
          'the resume is the typed resumed_from_boundary mode');
        t.equal(resumedReceive.resumeChunkCount, KILL_AFTER_CHUNKS,
          'the resume starts exactly at the verified boundary');
        const chunkCount = Math.ceil(
          resumedReceive.descriptor.payloadByteLength / SMALL_CHUNK_BYTES);
        const remainingChunks = chunkCount - KILL_AFTER_CHUNKS;
        t.equal(resumeBucket.stats().acquireCount, remainingChunks,
          'ONLY the remaining chunks were re-served after the resume');
        t.same(listCheckpointGenerations(fixture.receiveRoot),
          [fixture.boundaryIndex],
          'the resumed transfer published the generation');
      } finally {
        resumeChannel.close();
      }
    } finally {
      firstChannel.close();
      fixture.close();
    }
  });

test('attack battery: tamper, truncate, duplicate, stale-epoch, and ' +
  'cancel are each typed', async (t) => {
  const fixture = await createMultichunkFixture(
    'multichunk-attack-', SMALL_TOTAL_PAYLOAD_BYTES);
  try {
    const tampered = await runInterceptedTransfer(fixture, {
      transformFrame: (frame, ordinal) =>
        ordinal === ATTACK_CHUNK_INDEX ? [flipLastByte(frame)] : [frame],
    });
    t.equal(tampered.received.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHUNK_DIGEST_MISMATCH,
      'a tampered chunk byte is the typed chunk_digest_mismatch abort');
    t.equal(tampered.received.verifiedChunkCount, ATTACK_CHUNK_INDEX,
      'nothing past the tampered chunk is ever counted verified');

    const truncated = await runInterceptedTransfer(fixture, {
      transformFrame: (frame, ordinal) =>
        ordinal === ATTACK_CHUNK_INDEX ?
          [frame.subarray(0, frame.length - 1)] :
          [frame],
    });
    t.equal(truncated.received.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHUNK_FRAME_INVALID,
      'a truncated chunk frame is the typed chunk_frame_invalid abort');

    const duplicated = await runInterceptedTransfer(fixture, {
      transformFrame: (frame, ordinal) =>
        ordinal === ATTACK_CHUNK_INDEX ? [frame, frame] : [frame],
    });
    t.equal(duplicated.received.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.CHUNK_FRAME_INVALID,
      'a duplicated chunk frame is a typed abort (lockstep index check)');

    const stale = await runInterceptedTransfer(fixture, {
      expectedIdentity: STALE_EXPECTED_IDENTITY,
    });
    t.equal(stale.received.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.STALE_EPOCH,
      'a stale sealed epoch is refused at offer admission, typed');
    t.equal(stale.served.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.STALE_EPOCH,
      'the serving side sees the same typed stale_epoch abort');

    const cancelController = new AbortController();
    const cancelled = await runInterceptedTransfer(fixture, {
      signal: cancelController.signal,
      onChunkVerified: ({verifiedChunkCount}) => {
        if (verifiedChunkCount === CANCEL_AFTER_CHUNKS) {
          cancelController.abort();
        }
      },
    });
    t.equal(cancelled.received.reason,
      RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.TRANSFER_CANCELLED,
      'a mid-transfer cancel is the typed transfer_cancelled abort');
    t.equal(cancelled.received.verifiedChunkCount, CANCEL_AFTER_CHUNKS,
      'the cancel boundary is recorded');
    for (const attack of [tampered, truncated, duplicated, stale,
      cancelled]) {
      t.same(listCheckpointGenerations(attack.receiveRoot), [],
        'no attack ever published a generation');
    }
  } finally {
    fixture.close();
  }
});

test('ONE genuinely-large generation (tens of MiB, default 1 MiB chunks) ' +
  'transfers end to end', async (t) => {
  const fixture = await createMultichunkFixture(
    'multichunk-large-', LARGE_TOTAL_PAYLOAD_BYTES);
  const countingBucket = createCountingTokenBucket();
  const channel = createAdoptedBulkConnectionPair({
    serveTokenBucket: countingBucket,
  });
  try {
    const [served, received] = await Promise.all([
      serveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(channel.serveConnection),
        checkpointsRoot: fixture.checkpointsRoot,
        generationIndex: fixture.boundaryIndex,
        transferId: TRANSFER_ID,
        // DEFAULT production geometry — no shrink on the large case.
      }),
      receiveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(channel.receiveConnection),
        checkpointsRoot: fixture.receiveRoot,
        expectedIdentity: IDENTITY,
      }),
    ]);
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the large serve completes at the default geometry');
    t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the large receive completes at the default geometry');
    t.ok(received.descriptor.payloadByteLength >=
        LARGE_TOTAL_PAYLOAD_BYTES,
    'anti-vacuous: the sealed payload is genuinely tens of MiB ' +
      `(${received.descriptor.payloadByteLength} bytes)`);
    const chunkCount = Math.ceil(received.descriptor.payloadByteLength /
      RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES);
    t.ok(chunkCount >= 24,
      `the default-geometry transfer spans many chunks (${chunkCount})`);
    t.ok(countingBucket.stats().acquiredBytes >=
        received.descriptor.payloadByteLength,
    'tens of MiB transited the token bucket');
    t.same(listCheckpointGenerations(fixture.receiveRoot),
      [fixture.boundaryIndex],
      'the large generation is published on the receiver');
  } finally {
    channel.close();
    fixture.close();
  }
});
