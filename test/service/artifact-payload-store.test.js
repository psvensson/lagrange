/**
 * Deterministic guard tests for the cluster-owned artifact payload store
 * (src/service/artifact-payload-store.js, brief §1).
 *
 * Drives the store through a real in-memory SQLite database whose two
 * tables are created from the REAL registered schemas
 * (generateCreateTableSQL / generateCreateIndexSQL over
 * ARTIFACT_PAYLOADS_SCHEMA and ARTIFACT_PAYLOAD_CHUNKS_SCHEMA), with an
 * executeInternal shim that translates the store's $n parameter grammar
 * to SQLite placeholders and — mirroring production replicated-write
 * semantics — surfaces every SQLite failure as an opaque
 * participant-failure result, never a clean constraint error.
 *
 * Proves: multi-chunk put → seal → verified read round-trip; idempotent
 * byte-identical retries (including convergence to SEALED from any
 * interruption point); fail-closed conflicting retries (identity, chunk
 * layout, conflicting chunk rows); typed refusals for unsealed, absent,
 * oversized, and format-invalid requests; typed corruption detection
 * naming the failing chunk; ORDER BY-driven chunk reassembly; and the
 * explicit-variant metadata lookup by artifact digest.
 */

import {createHash} from 'node:crypto';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ARTIFACT_PAYLOAD_STATE,
  ARTIFACT_PAYLOADS_SCHEMA,
} from '../../src/bootstrap/system-table-artifact-schema-definitions.js';
import {
  ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES,
  ARTIFACT_PAYLOAD_ERROR_CODE,
  ArtifactPayloadStoreError,
  createArtifactPayloadStore,
} from '../../src/service/artifact-payload-store.js';

const TEST_CHUNK_SIZE = 8;
const CONFLICTING_CHUNK_SIZE = 4;
const START_NOW = 10_000;
const ONE_MIB = 1024 * 1024;
const MEDIA_TYPE = 'application/wasm';
const OTHER_MEDIA_TYPE = 'application/octet-stream';
const OPAQUE_FAILURE =
  'Distributed operation failed due to participant failures';
// 37 bytes -> 5 chunks of 8, 8, 8, 8, 5 at TEST_CHUNK_SIZE.
const PAYLOAD_TEXT = 'the-artifact-payload-bytes-0123456789';
const ARTIFACT_SEED = 'artifact-identity-seed';
const OTHER_ARTIFACT_SEED = 'other-artifact-identity-seed';
const INSERT_PAYLOAD_DIRECT_SQL =
  'INSERT INTO artifact_payloads (payload_digest, artifact_digest, ' +
  'media_type, total_size, chunk_count, state, created_at, sealed_at) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
const INSERT_CHUNK_DIRECT_SQL =
  'INSERT INTO artifact_payload_chunks (payload_digest, chunk_number, ' +
  'chunk_digest, chunk_size, chunk_bytes_base64) VALUES (?, ?, ?, ?, ?)';

function sha256Of(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function payloadBytes() {
  return Buffer.from(PAYLOAD_TEXT, 'utf8');
}

function artifactDigestOf(seed) {
  return sha256Of(Buffer.from(seed, 'utf8'));
}

function buildPutRequest(bytes, overrides = {}) {
  return {
    artifactDigest: artifactDigestOf(ARTIFACT_SEED),
    bytes,
    mediaType: MEDIA_TYPE,
    payloadDigest: sha256Of(bytes),
    ...overrides,
  };
}

function chunkSlicesOf(bytes, chunkSize) {
  const slices = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    slices.push(bytes.subarray(offset, offset + chunkSize));
  }
  return slices;
}

// The executeInternal shim: $n params -> SQLite placeholders, reads
// return {rows}, writes return {affectedRows}; every SQLite error
// surfaces as the opaque participant-failure result the replicated
// write path produces (the store must never parse failure text).
function createExecuteInternal(database) {
  return async (sql, params = []) => {
    const ordered = [];
    const translated = sql.replace(/\$(\d+)/g, (_match, position) => {
      ordered.push(params[Number(position) - 1]);
      return '?';
    });
    try {
      const statement = database.prepare(translated);
      if (statement.reader) {
        return {rows: statement.all(...ordered), success: true};
      }
      const info = statement.run(...ordered);
      return {affectedRows: info.changes, success: true};
    } catch {
      return {error: OPAQUE_FAILURE, success: false};
    }
  };
}

function createPayloadStoreFixture(options = {}) {
  const database = new Database(':memory:');
  for (const schema of [
    ARTIFACT_PAYLOADS_SCHEMA,
    ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ]) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
  }
  const executeInternal = createExecuteInternal(database);
  const nowRef = {now: START_NOW};
  const store = createArtifactPayloadStore({
    chunkSizeBytes: options.chunkSizeBytes ?? TEST_CHUNK_SIZE,
    executeInternal: options.wrapExecute ?
      options.wrapExecute(executeInternal, database) :
      executeInternal,
    maxPayloadBytes: options.maxPayloadBytes,
    nowProvider: () => nowRef.now,
  });
  return {database, executeInternal, nowRef, store};
}

function healthyStore(fixture, options = {}) {
  return createArtifactPayloadStore({
    chunkSizeBytes: options.chunkSizeBytes ?? TEST_CHUNK_SIZE,
    executeInternal: fixture.executeInternal,
    nowProvider: () => fixture.nowRef.now,
  });
}

function allPayloadRows(database) {
  return database.prepare(
    'SELECT * FROM artifact_payloads ORDER BY payload_digest',
  ).all();
}

function allChunkRows(database) {
  return database.prepare(
    'SELECT * FROM artifact_payload_chunks ' +
    'ORDER BY payload_digest, chunk_number',
  ).all();
}

function insertPayloadRowDirect(database, row) {
  database.prepare(INSERT_PAYLOAD_DIRECT_SQL).run(
    row.payloadDigest, row.artifactDigest, row.mediaType, row.totalSize,
    row.chunkCount, row.state, row.createdAt, row.sealedAt,
  );
}

function insertChunkRowDirect(database, payloadDigest, chunkBytes, number) {
  database.prepare(INSERT_CHUNK_DIRECT_SQL).run(
    payloadDigest, number, sha256Of(chunkBytes), chunkBytes.length,
    chunkBytes.toString('base64'),
  );
}

async function expectTypedFailure(t, promise, code, message) {
  await promise.then(
    () => t.fail(`${message}: expected a typed rejection`),
    (error) => {
      t.ok(error instanceof ArtifactPayloadStoreError,
        `${message}: ArtifactPayloadStoreError`);
      t.equal(error.code, code, `${message}: code ${code}`);
    },
  );
}

// Seed one sealed multi-chunk payload through the real put path and
// return everything a corruption test needs to tamper with it.
async function sealedPayloadFixture() {
  const fixture = createPayloadStoreFixture();
  const bytes = payloadBytes();
  const request = buildPutRequest(bytes);
  await fixture.store.putPayload(request);
  return {bytes, fixture, request};
}

test('putPayload chunks, seals, and getSealedPayload round-trips a ' +
  'multi-chunk payload', async (t) => {
  const {database, nowRef, store} = createPayloadStoreFixture();
  const bytes = payloadBytes();
  const request = buildPutRequest(bytes);

  const put = await store.putPayload(request);
  t.equal(put.alreadySealed, false, 'a fresh put seals the payload');
  t.equal(put.chunkCount, 5, '37 bytes at chunk size 8 give 5 chunks');
  t.equal(put.totalSize, bytes.length, 'the put reports the byte size');
  t.equal(put.sealedAt, nowRef.now, 'the seal is stamped by nowProvider');

  const payloadRow = allPayloadRows(database)[0];
  t.equal(payloadRow.state, ARTIFACT_PAYLOAD_STATE.SEALED,
    'the durable row is SEALED');
  t.equal(payloadRow.chunk_count, 5, 'the row records the chunk count');
  t.equal(payloadRow.total_size, bytes.length,
    'the row records the total size');

  const chunkRows = allChunkRows(database);
  t.equal(chunkRows.length, 5, 'every chunk row is durable');
  const slices = chunkSlicesOf(bytes, TEST_CHUNK_SIZE);
  t.same(
    chunkRows.map((row) => row.chunk_bytes_base64),
    slices.map((slice) => slice.toString('base64')),
    'chunk bytes ride as base64 TEXT of exactly each raw slice',
  );
  t.same(
    chunkRows.map((row) => row.chunk_digest),
    slices.map((slice) => sha256Of(slice)),
    'each chunk digest covers the decoded chunk bytes',
  );

  const read = await store.getSealedPayload(request.payloadDigest);
  t.ok(read.bytes.equals(bytes), 'the verified read returns the bytes');
  t.equal(read.artifactDigest, request.artifactDigest,
    'the read carries the artifact identity');
  t.equal(read.mediaType, MEDIA_TYPE, 'the read carries the media type');
  t.equal(read.totalSize, bytes.length, 'the read carries the size');

  t.equal(ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES, ONE_MIB,
    'the production chunk policy constant is 1 MiB');
  t.end();
});

test('a byte-identical duplicate put is idempotent with no row churn',
  async (t) => {
    const {bytes, fixture, request} = await sealedPayloadFixture();
    const payloadRowsBefore = allPayloadRows(fixture.database);
    const chunkRowsBefore = allChunkRows(fixture.database);

    fixture.nowRef.now += 5_000;
    const replay = await fixture.store.putPayload(
      buildPutRequest(bytes),
    );
    t.equal(replay.alreadySealed, true,
      'a byte-identical retry reports alreadySealed');
    t.equal(replay.payloadDigest, request.payloadDigest,
      'the idempotent result names the payload identity');
    t.equal(replay.sealedAt, START_NOW,
      'the original seal time is preserved');
    t.same(allPayloadRows(fixture.database), payloadRowsBefore,
      'the payload row is untouched — no churn');
    t.same(allChunkRows(fixture.database), chunkRowsBefore,
      'the chunk rows are untouched — no churn');
    t.end();
  });

test('a conflicting retry fails closed typed: identity and chunk layout',
  async (t) => {
    const {bytes, fixture, request} = await sealedPayloadFixture();

    await expectTypedFailure(
      t,
      fixture.store.putPayload(
        buildPutRequest(bytes, {mediaType: OTHER_MEDIA_TYPE}),
      ),
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      'same digest with a different media type',
    );
    await expectTypedFailure(
      t,
      fixture.store.putPayload(buildPutRequest(bytes, {
        artifactDigest: artifactDigestOf(OTHER_ARTIFACT_SEED),
      })),
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      'same digest bound to a different artifact identity',
    );

    const differentLayoutStore = healthyStore(fixture, {
      chunkSizeBytes: CONFLICTING_CHUNK_SIZE,
    });
    await expectTypedFailure(
      t,
      differentLayoutStore.putPayload(buildPutRequest(bytes)),
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      'same digest with a different chunk layout',
    );

    const read = await fixture.store.getSealedPayload(
      request.payloadDigest,
    );
    t.ok(read.bytes.equals(bytes),
      'the sealed payload stays intact after refused conflicts');
    t.end();
  });

test('input refusals: digest format, claimed-digest mismatch, oversized ' +
  'payload, bytes shape, media type', async (t) => {
  const {store} = createPayloadStoreFixture({maxPayloadBytes: 16});
  const bytes = payloadBytes();

  await expectTypedFailure(
    t,
    store.putPayload(
      buildPutRequest(bytes, {payloadDigest: 'sha999:not-a-digest'}),
    ),
    ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
    'a malformed payload digest',
  );
  await expectTypedFailure(
    t,
    store.putPayload(
      buildPutRequest(bytes, {artifactDigest: 'md5:abcdef'}),
    ),
    ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
    'a malformed artifact digest',
  );
  await expectTypedFailure(
    t,
    store.putPayload(buildPutRequest(bytes, {
      payloadDigest: sha256Of(Buffer.from(OTHER_ARTIFACT_SEED, 'utf8')),
    })),
    ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_DIGEST_MISMATCH,
    'bytes that do not hash to the claimed digest',
  );
  await expectTypedFailure(
    t,
    store.putPayload(buildPutRequest(bytes)),
    ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_OVERSIZED,
    'a payload above maxPayloadBytes',
  );
  await expectTypedFailure(
    t,
    store.putPayload(buildPutRequest(bytes, {bytes: PAYLOAD_TEXT})),
    ARTIFACT_PAYLOAD_ERROR_CODE.INVALID_ARGUMENT,
    'bytes that are not a Buffer or Uint8Array',
  );
  await expectTypedFailure(
    t,
    store.putPayload(buildPutRequest(bytes, {mediaType: ''})),
    ARTIFACT_PAYLOAD_ERROR_CODE.INVALID_ARGUMENT,
    'an empty media type',
  );
  t.end();
});

test('an upload interrupted before sealing refuses reads and a ' +
  'byte-identical retry converges to SEALED', async (t) => {
  const fixture = createPayloadStoreFixture({
    wrapExecute: (base) => async (sql, params) => {
      if (sql.startsWith('UPDATE artifact_payloads')) {
        return {error: OPAQUE_FAILURE, success: false};
      }
      return base(sql, params);
    },
  });
  const bytes = payloadBytes();
  const request = buildPutRequest(bytes);

  await expectTypedFailure(
    t,
    fixture.store.putPayload(request),
    ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
    'the interrupted put surfaces the write failure',
  );
  t.equal(allPayloadRows(fixture.database)[0].state,
    ARTIFACT_PAYLOAD_STATE.UPLOADING,
    'the interrupted payload row stays UPLOADING — never bindable');
  await expectTypedFailure(
    t,
    healthyStore(fixture).getSealedPayload(request.payloadDigest),
    ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_UNSEALED,
    'an unsealed payload refuses verified reads',
  );

  const retry = await healthyStore(fixture).putPayload(request);
  t.equal(retry.alreadySealed, false,
    'the byte-identical retry performs the seal');
  const read = await healthyStore(fixture).getSealedPayload(
    request.payloadDigest,
  );
  t.ok(read.bytes.equals(bytes), 'the converged payload round-trips');
  t.end();
});

test('an upload interrupted mid-chunk converges to SEALED on a ' +
  'byte-identical retry', async (t) => {
  let chunkInsertCount = 0;
  const fixture = createPayloadStoreFixture({
    wrapExecute: (base) => async (sql, params) => {
      if (sql.startsWith('INSERT INTO artifact_payload_chunks')) {
        chunkInsertCount += 1;
        if (chunkInsertCount === 3) {
          return {error: OPAQUE_FAILURE, success: false};
        }
      }
      return base(sql, params);
    },
  });
  const bytes = payloadBytes();
  const request = buildPutRequest(bytes);

  await expectTypedFailure(
    t,
    fixture.store.putPayload(request),
    ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
    'the mid-chunk interruption surfaces the write failure',
  );
  t.equal(allChunkRows(fixture.database).length, 2,
    'only the chunks before the interruption are durable');

  const retry = await healthyStore(fixture).putPayload(request);
  t.equal(retry.alreadySealed, false, 'the retry completes the upload');
  t.equal(retry.chunkCount, 5, 'the retry reports the full chunk set');
  t.equal(allChunkRows(fixture.database).length, 5,
    'the retry fills in exactly the missing chunks');
  const read = await healthyStore(fixture).getSealedPayload(
    request.payloadDigest,
  );
  t.ok(read.bytes.equals(bytes),
    'the payload converges to SEALED with verified bytes');
  t.end();
});

test('a pre-existing conflicting chunk row fails the retry closed',
  async (t) => {
    const fixture = createPayloadStoreFixture();
    const bytes = payloadBytes();
    const request = buildPutRequest(bytes);
    insertPayloadRowDirect(fixture.database, {
      artifactDigest: request.artifactDigest,
      chunkCount: 5,
      createdAt: START_NOW,
      mediaType: MEDIA_TYPE,
      payloadDigest: request.payloadDigest,
      sealedAt: 0,
      state: ARTIFACT_PAYLOAD_STATE.UPLOADING,
      totalSize: bytes.length,
    });
    insertChunkRowDirect(
      fixture.database, request.payloadDigest,
      Buffer.from('wrong-chunk-bytes', 'utf8'), 0,
    );

    await expectTypedFailure(
      t,
      fixture.store.putPayload(request),
      ARTIFACT_PAYLOAD_ERROR_CODE.CONFLICTING_PAYLOAD,
      'a chunk row with a different digest under the same number',
    );
    t.equal(allPayloadRows(fixture.database)[0].state,
      ARTIFACT_PAYLOAD_STATE.UPLOADING,
      'the conflicting payload is never sealed');
    t.end();
  });

test('a concurrent sealer winning the guarded seal is benign success',
  async (t) => {
    const fixture = createPayloadStoreFixture({
      wrapExecute: (base, database) => async (sql, params) => {
        if (sql.startsWith('UPDATE artifact_payloads')) {
          // A concurrent byte-identical publisher seals first; the
          // guarded UPDATE (state = UPLOADING) then matches zero rows.
          // The store renders parameters into the statement as inline
          // literals, so the digest is recovered from the SQL itself.
          const digest = /payload_digest = '([^']+)'/.exec(sql)[1];
          database.prepare(
            'UPDATE artifact_payloads SET state = ?, sealed_at = ? ' +
            'WHERE payload_digest = ?',
          ).run(ARTIFACT_PAYLOAD_STATE.SEALED, START_NOW + 7, digest);
        }
        return base(sql, params);
      },
    });
    const bytes = payloadBytes();
    const request = buildPutRequest(bytes);

    const put = await fixture.store.putPayload(request);
    t.equal(put.alreadySealed, false,
      'the losing sealer still resolves as success');
    t.equal(put.sealedAt, START_NOW + 7,
      'the winning sealer\'s seal time is the visible one');
    const read = await healthyStore(fixture).getSealedPayload(
      request.payloadDigest,
    );
    t.ok(read.bytes.equals(bytes),
      'the once-sealed payload reads back verified');
    t.end();
  });

test('corruption reads refuse typed naming the failing chunk', async (t) => {
  const missing = await sealedPayloadFixture();
  missing.fixture.database.prepare(
    'DELETE FROM artifact_payload_chunks WHERE chunk_number = ?',
  ).run(2);
  await missing.fixture.store.getSealedPayload(
    missing.request.payloadDigest,
  ).then(
    () => t.fail('a missing chunk must refuse the read'),
    (error) => {
      t.equal(error.code, ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_MISSING,
        'a deleted chunk row reads as CHUNK_MISSING');
      t.equal(error.details.chunkNumber, 2,
        'the error names the missing chunk');
    },
  );

  const tampered = await sealedPayloadFixture();
  const sameLengthBytes = Buffer.from('EVILBYTE', 'utf8');
  tampered.fixture.database.prepare(
    'UPDATE artifact_payload_chunks SET chunk_bytes_base64 = ? ' +
    'WHERE chunk_number = ?',
  ).run(sameLengthBytes.toString('base64'), 1);
  await tampered.fixture.store.getSealedPayload(
    tampered.request.payloadDigest,
  ).then(
    () => t.fail('a tampered chunk must refuse the read'),
    (error) => {
      t.equal(error.code,
        ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_DIGEST_MISMATCH,
        'same-length tampering reads as CHUNK_DIGEST_MISMATCH ' +
          'over the decoded bytes');
      t.equal(error.details.chunkNumber, 1,
        'the error names the tampered chunk');
    },
  );

  const truncated = await sealedPayloadFixture();
  truncated.fixture.database.prepare(
    'UPDATE artifact_payload_chunks SET chunk_bytes_base64 = ? ' +
    'WHERE chunk_number = ?',
  ).run(Buffer.from('xyz', 'utf8').toString('base64'), 3);
  await truncated.fixture.store.getSealedPayload(
    truncated.request.payloadDigest,
  ).then(
    () => t.fail('a truncated chunk must refuse the read'),
    (error) => {
      t.equal(error.code,
        ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_SIZE_MISMATCH,
        'a decoded-size mismatch reads as CHUNK_SIZE_MISMATCH');
      t.equal(error.details.chunkNumber, 3,
        'the error names the truncated chunk');
    },
  );
  t.end();
});

test('total-size tampering and an extra chunk row refuse typed',
  async (t) => {
    const tampered = await sealedPayloadFixture();
    tampered.fixture.database.prepare(
      'UPDATE artifact_payloads SET total_size = ?',
    ).run(tampered.bytes.length + 1);
    await expectTypedFailure(
      t,
      tampered.fixture.store.getSealedPayload(
        tampered.request.payloadDigest,
      ),
      ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_SIZE_MISMATCH,
      'a sealed total_size that disagrees with the stored bytes',
    );

    const extra = await sealedPayloadFixture();
    insertChunkRowDirect(
      extra.fixture.database, extra.request.payloadDigest,
      Buffer.from('extra', 'utf8'), 5,
    );
    await expectTypedFailure(
      t,
      extra.fixture.store.getSealedPayload(extra.request.payloadDigest),
      ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_SIZE_MISMATCH,
      'more chunk rows than the sealed chunk count',
    );
    t.end();
  });

test('chunk-consistent tampering fails the final reassembled digest',
  async (t) => {
    const fixture = createPayloadStoreFixture();
    const first = Buffer.from('AAAAAAAA', 'utf8');
    const second = Buffer.from('BBBBBBBB', 'utf8');
    const bytes = Buffer.concat([first, second]);
    const request = buildPutRequest(bytes);
    await fixture.store.putPayload(request);

    // Swap the two chunks' contents keeping every per-chunk digest and
    // size self-consistent: only the reassembled payload digest can
    // catch the reordering.
    const swap = fixture.database.prepare(
      'UPDATE artifact_payload_chunks SET chunk_digest = ?, ' +
      'chunk_bytes_base64 = ? WHERE chunk_number = ?',
    );
    swap.run(sha256Of(second), second.toString('base64'), 0);
    swap.run(sha256Of(first), first.toString('base64'), 1);

    await expectTypedFailure(
      t,
      fixture.store.getSealedPayload(request.payloadDigest),
      ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_DIGEST_MISMATCH,
      'chunk-consistent reordering fails the assembled digest',
    );
    t.end();
  });

test('chunks inserted in shuffled order read back assembled in ' +
  'chunk-number order', async (t) => {
  const fixture = createPayloadStoreFixture();
  const bytes = Buffer.from('ordered-chunk-payload', 'utf8');
  const payloadDigest = sha256Of(bytes);
  const slices = chunkSlicesOf(bytes, TEST_CHUNK_SIZE);
  insertPayloadRowDirect(fixture.database, {
    artifactDigest: artifactDigestOf(ARTIFACT_SEED),
    chunkCount: slices.length,
    createdAt: START_NOW,
    mediaType: MEDIA_TYPE,
    payloadDigest,
    sealedAt: START_NOW,
    state: ARTIFACT_PAYLOAD_STATE.SEALED,
    totalSize: bytes.length,
  });
  for (const number of [2, 0, 1]) {
    insertChunkRowDirect(
      fixture.database, payloadDigest, slices[number], number,
    );
  }

  const read = await fixture.store.getSealedPayload(payloadDigest);
  t.ok(read.bytes.equals(bytes),
    'ORDER BY chunk_number reassembles shuffled inserts correctly');
  t.end();
});

test('getSealedPayload refuses an absent payload and a malformed digest',
  async (t) => {
    const {store} = createPayloadStoreFixture();
    await expectTypedFailure(
      t,
      store.getSealedPayload(sha256Of(payloadBytes())),
      ARTIFACT_PAYLOAD_ERROR_CODE.PAYLOAD_MISSING,
      'an unknown payload digest',
    );
    await expectTypedFailure(
      t,
      store.getSealedPayload('not-a-digest'),
      ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
      'a malformed digest string',
    );
    t.end();
  });

test('findSealedPayloadByArtifactDigest returns explicit variants and ' +
  'the newest sealed metadata only', async (t) => {
  const fixture = createPayloadStoreFixture();
  const artifactDigest = artifactDigestOf(ARTIFACT_SEED);
  const olderBytes = Buffer.from('older-payload-revision', 'utf8');
  const newerBytes = Buffer.from('newer-payload-revision', 'utf8');
  await fixture.store.putPayload(
    buildPutRequest(olderBytes, {artifactDigest}),
  );
  fixture.nowRef.now += 1_000;
  await fixture.store.putPayload(
    buildPutRequest(newerBytes, {artifactDigest}),
  );
  // An UPLOADING row for the same artifact must never surface.
  insertPayloadRowDirect(fixture.database, {
    artifactDigest,
    chunkCount: 1,
    createdAt: fixture.nowRef.now + 1,
    mediaType: MEDIA_TYPE,
    payloadDigest: sha256Of(Buffer.from('unsealed', 'utf8')),
    sealedAt: 0,
    state: ARTIFACT_PAYLOAD_STATE.UPLOADING,
    totalSize: 8,
  });

  const found = await fixture.store.findSealedPayloadByArtifactDigest(
    artifactDigest,
  );
  t.equal(found.found, true, 'a sealed payload reports found: true');
  t.equal(found.payload.payloadDigest, sha256Of(newerBytes),
    'the newest SEALED payload wins');
  t.equal(found.payload.sealedAt, START_NOW + 1_000,
    'the metadata carries the seal time');
  t.equal(found.payload.chunkCount, 3,
    'the metadata carries the chunk count');
  t.equal(found.payload.totalSize, newerBytes.length,
    'the metadata carries the total size');
  t.notOk(Object.hasOwn(found.payload, 'bytes'),
    'the lookup is metadata-only — no chunk bytes');

  const absent = await fixture.store.findSealedPayloadByArtifactDigest(
    artifactDigestOf(OTHER_ARTIFACT_SEED),
  );
  t.same(absent, {found: false},
    'an unknown artifact digest is an explicit found: false variant');

  const uploadingOnly = createPayloadStoreFixture();
  insertPayloadRowDirect(uploadingOnly.database, {
    artifactDigest,
    chunkCount: 1,
    createdAt: START_NOW,
    mediaType: MEDIA_TYPE,
    payloadDigest: sha256Of(Buffer.from('pending', 'utf8')),
    sealedAt: 0,
    state: ARTIFACT_PAYLOAD_STATE.UPLOADING,
    totalSize: 8,
  });
  const pending =
    await uploadingOnly.store.findSealedPayloadByArtifactDigest(
      artifactDigest,
    );
  t.same(pending, {found: false},
    'UPLOADING-only artifacts are explicitly not found');

  await expectTypedFailure(
    t,
    fixture.store.findSealedPayloadByArtifactDigest('bogus'),
    ARTIFACT_PAYLOAD_ERROR_CODE.DIGEST_FORMAT_INVALID,
    'a malformed artifact digest',
  );
  t.end();
});
