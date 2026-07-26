import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
  RAFT_SNAPSHOT_TRANSFER_DIRNAME,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_RESUME_MODE,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';

// raft-snapshot-bulk-transfer (S3) protocol attacks: offer/accept round trip
// over a real sealed S1 generation, kill/restart resume from the re-digested
// verified boundary, tampered chunk digest refused, truncated staging
// restarted from zero (typed), whole-payload digest mismatch refused at
// completion with staging discarded, version/geometry mismatch aborts,
// stale-epoch aborts at accept AND completion, publication-token semantics
// (no descriptor before completion), and foreign sibling directories under
// checkpointsRoot staying invisible to listCheckpointGenerations.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const SOURCE_TERM = 4;
const SEALED_EPOCH = 7;
const ENTRY_COUNT = 3;
const TEST_CHUNK_BYTES = 4096;
const TEST_TRANSFER_ID = 'transfer-guard-1';
const KILL_AFTER_CHUNKS = 2;
const ABORT_REASON = RAFT_SNAPSHOT_TRANSFER_ABORT_REASON;
const OUTCOME = RAFT_SNAPSHOT_TRANSFER_OUTCOME;
const RESUME = RAFT_SNAPSHOT_TRANSFER_RESUME_MODE;
const KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

// Build a SOURCE replica with committed+applied entries, checkpoint it, and
// return the sealed sender generation plus an empty receiver checkpoint root
// (exactly the S1 fixture shape used by the S2 install guards).
async function createTransferFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-transfer-'));
  const sourceDb = new Database(path.join(workDir, 'source.db'));
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: PARTITION_ID, term: SOURCE_TERM});
  const storage = new PartitionRaftStorage(sourceDb, PARTITION_ID, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  let lastEntry = null;
  for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
    lastEntry = adapter.saveCommand({sql: `row-${ordinal}`}, SOURCE_TERM);
    adapter.commit(lastEntry.index);
    sourceDb.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    storage.recordAppliedAdvance();
  }
  const senderRoot = path.join(workDir, 'sender-checkpoints');
  const created = await createSqliteStateMachineCheckpoint({
    db: sourceDb,
    identity: IDENTITY,
    checkpointsRoot: senderRoot,
  });
  sourceDb.close();
  return {
    workDir,
    senderRoot,
    receiverRoot: path.join(workDir, 'receiver-checkpoints'),
    created,
    lastIndex: lastEntry.index,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

// Wrap a socket-like so outbound frames can be transformed in flight (the
// tamper seam). Inbound listeners pass through untouched.
function wrapSocketSend(socket, transform) {
  return {
    send: (data) => socket.send(transform(data)),
    on: socket.on.bind(socket),
    close: socket.close.bind(socket),
  };
}

function identityFrame(data) {
  return data;
}

// Run one full transfer over an in-process duplex pair.
async function runTransfer(fixture, options = {}) {
  const {a, b} = createInProcWebSocketPair();
  const senderSocket = options.tamperSenderFrames ?
    wrapSocketSend(a, options.tamperSenderFrames) :
    wrapSocketSend(a, identityFrame);
  const [served, received] = await Promise.all([
    serveSnapshotTransfer({
      socket: senderSocket,
      checkpointsRoot: fixture.senderRoot,
      generationIndex: options.generationIndex ?? fixture.lastIndex,
      transferId: TEST_TRANSFER_ID,
      chunkSizeBytes: TEST_CHUNK_BYTES,
    }),
    receiveSnapshotTransfer({
      socket: b,
      checkpointsRoot: fixture.receiverRoot,
      expectedIdentity: options.expectedIdentity ?? IDENTITY,
      chunkSizeBytes: options.receiverChunkBytes ?? TEST_CHUNK_BYTES,
      signal: options.signal,
      onChunkVerified: options.onChunkVerified,
    }),
  ]);
  return {served, received};
}

function transferDirOf(fixture) {
  return path.join(
    fixture.receiverRoot,
    RAFT_SNAPSHOT_TRANSFER_DIRNAME,
    String(fixture.lastIndex));
}

function generationDirOf(fixture) {
  return path.join(fixture.receiverRoot, String(fixture.lastIndex));
}

test('a full transfer publishes a sealed generation the S2 install can read',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      t.equal(fixture.created.outcome, 'created', 'S1 fixture generation seals');
      let sawDescriptorMidTransfer = false;
      const {served, received} = await runTransfer(fixture, {
        onChunkVerified: () => {
          // Publication-token semantics: no descriptor (and no generation
          // dir) may be observable before completion.
          sawDescriptorMidTransfer = sawDescriptorMidTransfer ||
            fs.existsSync(path.join(
              generationDirOf(fixture), RAFT_CHECKPOINT_DESCRIPTOR_FILE));
        },
      });
      t.equal(served.outcome, OUTCOME.COMPLETED, 'sender completes');
      t.equal(received.outcome, OUTCOME.COMPLETED, 'receiver completes');
      t.equal(received.resumeMode, RESUME.FRESH, 'first run starts fresh');
      t.equal(sawDescriptorMidTransfer, false,
        'no descriptor is observable before completion (publication token)');
      const generationDir = generationDirOf(fixture);
      t.ok(fs.existsSync(
        path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE)),
      'payload.db published at the bare-decimal layout');
      t.ok(fs.existsSync(
        path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE)),
      'checkpoint.json published after the payload');
      const published = readCheckpoint(
        {checkpointDir: generationDir, expectedIdentity: IDENTITY});
      t.equal(published.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'the published generation validates (bytes + digest + identity)');
      t.same(listCheckpointGenerations(fixture.receiverRoot),
        [fixture.lastIndex],
        'listCheckpointGenerations sees exactly the transferred generation');
      t.notOk(fs.existsSync(transferDirOf(fixture)),
        'transfer staging is cleaned up after publication');
    } finally {
      fixture.close();
    }
  });

test('foreign sibling directories under checkpointsRoot stay invisible',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      fs.mkdirSync(path.join(fixture.receiverRoot, 'junk-sibling'),
        {recursive: true});
      fs.mkdirSync(path.join(fixture.receiverRoot, `00${fixture.lastIndex}`),
        {recursive: true});
      const {received} = await runTransfer(fixture);
      t.equal(received.outcome, OUTCOME.COMPLETED, 'transfer completes');
      t.same(listCheckpointGenerations(fixture.receiverRoot),
        [fixture.lastIndex],
        'non-bare-decimal siblings (junk, zero-padded, transfer/) ignored');
    } finally {
      fixture.close();
    }
  });

test('kill mid-transfer, restart, resume ONLY from the verified boundary',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      const controller = new AbortController();
      const first = await runTransfer(fixture, {
        signal: controller.signal,
        onChunkVerified: ({verifiedChunkCount}) => {
          if (verifiedChunkCount === KILL_AFTER_CHUNKS) {
            controller.abort();
          }
        },
      });
      t.equal(first.received.outcome, OUTCOME.ABORTED,
        'the killed run ends aborted');
      t.equal(first.received.reason, ABORT_REASON.TRANSFER_CANCELLED,
        'the kill is the typed cancellation');
      t.equal(first.received.verifiedChunkCount, KILL_AFTER_CHUNKS,
        'the verified boundary is exactly the chunks verified before the kill');
      t.ok(fs.existsSync(transferDirOf(fixture)),
        'durable transfer staging survives the kill');
      t.notOk(fs.existsSync(generationDirOf(fixture)),
        'nothing is published by a killed transfer');

      const second = await runTransfer(fixture);
      t.equal(second.received.outcome, OUTCOME.COMPLETED,
        'the restarted transfer completes');
      t.equal(second.received.resumeMode, RESUME.RESUMED_FROM_BOUNDARY,
        'restart resumes from the recorded verified boundary');
      t.equal(second.received.resumeChunkCount, KILL_AFTER_CHUNKS,
        'the fresh accept carries the boundary back to the sender');
      const published = readCheckpoint({
        checkpointDir: generationDirOf(fixture),
        expectedIdentity: IDENTITY,
      });
      t.equal(published.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'the resumed bytes re-verify end-to-end (whole-payload digest)');
    } finally {
      fixture.close();
    }
  });

test('truncated staging fails the boundary re-digest and restarts from zero',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      const controller = new AbortController();
      await runTransfer(fixture, {
        signal: controller.signal,
        onChunkVerified: ({verifiedChunkCount}) => {
          if (verifiedChunkCount === KILL_AFTER_CHUNKS) {
            controller.abort();
          }
        },
      });
      const stagedPath = path.join(transferDirOf(fixture), 'transfer-payload');
      const stagedSize = fs.statSync(stagedPath).size;
      fs.truncateSync(stagedPath, stagedSize - 1);

      const second = await runTransfer(fixture);
      t.equal(second.received.outcome, OUTCOME.COMPLETED,
        'the transfer still completes after the typed restart');
      t.equal(second.received.resumeMode, RESUME.RESTARTED_FROM_ZERO,
        'a boundary whose staged bytes fail re-verification restarts from ' +
          'zero (typed)');
      t.equal(second.received.resumeChunkCount, 0,
        'the restarted accept carries a zero boundary');
      const published = readCheckpoint({
        checkpointDir: generationDirOf(fixture),
        expectedIdentity: IDENTITY,
      });
      t.equal(published.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'the restarted transfer publishes valid bytes');
    } finally {
      fixture.close();
    }
  });

test('a corrupted staged prefix fails the re-digest and restarts from zero',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      const controller = new AbortController();
      await runTransfer(fixture, {
        signal: controller.signal,
        onChunkVerified: ({verifiedChunkCount}) => {
          if (verifiedChunkCount === KILL_AFTER_CHUNKS) {
            controller.abort();
          }
        },
      });
      const stagedPath = path.join(transferDirOf(fixture), 'transfer-payload');
      const staged = fs.readFileSync(stagedPath);
      staged[0] ^= 0xff;
      fs.writeFileSync(stagedPath, staged);

      const second = await runTransfer(fixture);
      t.equal(second.received.resumeMode, RESUME.RESTARTED_FROM_ZERO,
        'staged bytes that fail the prefix re-digest restart from zero');
      t.equal(second.received.outcome, OUTCOME.COMPLETED,
        'and the transfer completes with verified bytes');
    } finally {
      fixture.close();
    }
  });

test('a tampered chunk digest is refused with a typed abort', async (t) => {
  const fixture = await createTransferFixture();
  try {
    const {served, received} = await runTransfer(fixture, {
      tamperSenderFrames: (data) => {
        if (Buffer.isBuffer(data)) {
          const tampered = Buffer.from(data);
          tampered[tampered.length - 1] ^= 0xff;
          return tampered;
        }
        return data;
      },
    });
    t.equal(received.outcome, OUTCOME.ABORTED, 'receiver aborts');
    t.equal(received.reason, ABORT_REASON.CHUNK_DIGEST_MISMATCH,
      'the refusal is the typed chunk-digest mismatch');
    t.equal(served.outcome, OUTCOME.ABORTED,
      'the sender observes the typed abort');
    t.equal(served.reason, ABORT_REASON.CHUNK_DIGEST_MISMATCH,
      'the abort reason crosses the wire');
    t.notOk(fs.existsSync(generationDirOf(fixture)),
      'nothing is published from tampered bytes');
  } finally {
    fixture.close();
  }
});

test('a whole-payload digest mismatch is refused at completion and staging ' +
  'is discarded', async (t) => {
  const fixture = await createTransferFixture();
  try {
    const {served, received} = await runTransfer(fixture, {
      tamperSenderFrames: (data) => {
        if (typeof data !== 'string') {
          return data;
        }
        const message = JSON.parse(data);
        if (message.kind !== KIND.OFFER) {
          return data;
        }
        // Forge the sealed whole-payload digest while leaving every
        // per-chunk digest honest: chunks verify, completion must not.
        const digest = message.descriptor.payloadDigest;
        const lastChar = digest.endsWith('0') ? '1' : '0';
        message.descriptor.payloadDigest =
          digest.slice(0, digest.length - 1) + lastChar;
        return JSON.stringify(message);
      },
    });
    t.equal(received.outcome, OUTCOME.ABORTED, 'completion refuses');
    t.equal(received.reason, ABORT_REASON.PAYLOAD_DIGEST_MISMATCH,
      'the refusal is the typed whole-payload digest mismatch');
    t.equal(served.outcome, OUTCOME.ABORTED,
      'the sender observes the completion abort');
    t.notOk(fs.existsSync(transferDirOf(fixture)),
      'the staging is discarded on a completion digest mismatch');
    t.notOk(fs.existsSync(generationDirOf(fixture)),
      'no generation directory is created for refused bytes');
    t.same(listCheckpointGenerations(fixture.receiverRoot), [],
      'nothing is advertised as a generation');
  } finally {
    fixture.close();
  }
});

test('protocol version and chunk geometry mismatches abort typed',
  async (t) => {
    await t.test('version mismatch', async (t) => {
      const fixture = await createTransferFixture();
      try {
        const {received} = await runTransfer(fixture, {
          tamperSenderFrames: (data) => {
            if (typeof data !== 'string') {
              return data;
            }
            const message = JSON.parse(data);
            if (message.kind !== KIND.OFFER) {
              return data;
            }
            message.protocolVersion += 1;
            return JSON.stringify(message);
          },
        });
        t.equal(received.outcome, OUTCOME.ABORTED, 'offer refused');
        t.equal(received.reason, ABORT_REASON.VERSION_MISMATCH,
          'a foreign protocol version is the typed version abort');
      } finally {
        fixture.close();
      }
    });

    await t.test('geometry mismatch', async (t) => {
      const fixture = await createTransferFixture();
      try {
        const {served, received} = await runTransfer(fixture, {
          receiverChunkBytes: TEST_CHUNK_BYTES * 2,
        });
        t.equal(received.outcome, OUTCOME.ABORTED, 'offer refused');
        t.equal(received.reason, ABORT_REASON.GEOMETRY_MISMATCH,
          'a chunk-size disagreement is the typed geometry abort');
        t.equal(served.outcome, OUTCOME.ABORTED,
          'the sender observes the typed geometry abort');
      } finally {
        fixture.close();
      }
    });
  });

test('a stale membership epoch aborts at accept time', async (t) => {
  const fixture = await createTransferFixture();
  try {
    const {served, received} = await runTransfer(fixture, {
      expectedIdentity: {...IDENTITY, membershipEpoch: SEALED_EPOCH + 1},
    });
    t.equal(received.outcome, OUTCOME.ABORTED, 'accept refuses');
    t.equal(received.reason, ABORT_REASON.STALE_EPOCH,
      'the refusal is the typed stale-epoch abort');
    t.equal(served.outcome, OUTCOME.ABORTED,
      'the sender observes the stale-epoch abort');
    t.notOk(fs.existsSync(transferDirOf(fixture)),
      'no staging is created for a stale-epoch offer');
  } finally {
    fixture.close();
  }
});

test('an epoch advance mid-transfer aborts typed at completion', async (t) => {
  const fixture = await createTransferFixture();
  try {
    const liveIdentity = {epoch: SEALED_EPOCH};
    const {served, received} = await runTransfer(fixture, {
      expectedIdentity: () => ({
        ...IDENTITY,
        membershipEpoch: liveIdentity.epoch,
      }),
      onChunkVerified: ({verifiedChunkCount}) => {
        if (verifiedChunkCount === 1) {
          liveIdentity.epoch = SEALED_EPOCH + 1;
        }
      },
    });
    t.equal(received.outcome, OUTCOME.ABORTED, 'completion refuses');
    t.equal(received.reason, ABORT_REASON.STALE_EPOCH,
      'the mid-transfer epoch advance is the typed stale-epoch abort');
    t.equal(served.outcome, OUTCOME.ABORTED,
      'the sender observes the completion stale-epoch abort');
    t.notOk(fs.existsSync(generationDirOf(fixture)),
      'nothing is published under a stale epoch');
  } finally {
    fixture.close();
  }
});

test('serving a missing generation is a typed abort for both sides',
  async (t) => {
    const fixture = await createTransferFixture();
    try {
      const {served, received} = await runTransfer(fixture, {
        generationIndex: fixture.lastIndex + 100,
      });
      t.equal(served.outcome, OUTCOME.ABORTED, 'the sender refuses to open');
      t.equal(served.reason, ABORT_REASON.GENERATION_UNAVAILABLE,
        'the refusal is the typed generation-unavailable abort');
      t.equal(received.outcome, OUTCOME.ABORTED,
        'the receiver observes the typed abort');
      t.equal(received.reason, ABORT_REASON.GENERATION_UNAVAILABLE,
        'the abort reason crosses the wire');
    } finally {
      fixture.close();
    }
  });
