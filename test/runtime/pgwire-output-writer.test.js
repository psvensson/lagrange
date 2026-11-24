/**
 * Unit tests for PgWireOutputWriter and chunked DataRow UTF-8 framing,
 * including malformed unpaired UTF-16 surrogates under tight chunk limits.
 */

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import {
  buildDataRow,
  encodeDataRowChunks,
  prepareDataRowColumns,
} from '../../src/runtime/pgwire-message-builders.js';
import {PgWireOutputWriter} from '../../src/runtime/pgwire-output-writer.js';
import {PG_BACKEND_MSG} from '../../src/runtime/pgwire-protocol-constants.js';

class CapturingSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.destroyed = false;
    this.writableEnded = false;
    this.writable = true;
  }

  write(chunk) {
    this.written.push(Buffer.from(chunk));
    return true;
  }

  decodeFrames() {
    const all = Buffer.concat(this.written);
    const frames = [];
    for (let offset = 0; offset + 5 <= all.length;) {
      const type = all[offset];
      const len = all.readInt32BE(offset + 1);
      const body = all.subarray(offset + 5, offset + 1 + len);
      frames.push({type, len, body});
      offset += 1 + len;
    }
    return frames;
  }
}

const UNPAIRED_SURROGATE_CASES = [
  {name: 'lone high surrogate', text: '\ud800'},
  {name: 'lone low surrogate', text: '\udc00'},
  {name: 'unpaired high surrogate + ascii', text: '\ud800a'},
  {name: 'ascii + unpaired high + ascii', text: 'x\ud800y'},
  {name: 'consecutive unpaired high surrogates', text: '\ud800\ud83d'},
  {
    name: 'unpaired high immediately before valid surrogate pair',
    text: '\ud800\ud83d\ude00',
  },
  {
    name: 'unpaired high before U+10000 surrogate pair',
    text: '\ud800\ud800\udc00',
  },
  {
    name: 'valid pair + unpaired high + valid pair + unpaired low',
    text: '\ud83d\ude00\ud800\ud83d\ude00\udc00',
  },
  {
    name: 'mixed ascii, 2-byte, 3-byte, 4-byte, and unpaired surrogates',
    text: 'a\u00e9\u20ac\ud800\ud83d\ude80\udc00\ud800b',
  },
];

test('encodeDataRowChunks frames unpaired UTF-16 surrogates identically to ' +
  'buildDataRow across small chunk limits (1..8 bytes)', () => {
  const chunkLimits = [1, 2, 3, 4, 5, 6, 7, 8, 16];
  for (const {name, text} of UNPAIRED_SURROGATE_CASES) {
    const expectedFrame = buildDataRow([text]);
    const prepared = prepareDataRowColumns([text]);
    assert.equal(expectedFrame.length, prepared.frameByteLength, name);
    assert.equal(
      expectedFrame.readInt32BE(1) + 1,
      expectedFrame.length,
      `${name}: header length must match frame length`,
    );

    for (const chunkMaxBytes of chunkLimits) {
      const chunks = [];
      for (const chunk of encodeDataRowChunks([text], [], chunkMaxBytes)) {
        assert.ok(chunk.length > 0, `${name} @ ${chunkMaxBytes}: non-empty chunk`);
        chunks.push(chunk);
        assert.ok(
          chunks.length <= expectedFrame.length * 2 + 16,
          `${name} @ ${chunkMaxBytes}: bounded chunk count (no infinite loop)`,
        );
      }
      const assembled = Buffer.concat(chunks);
      assert.equal(
        assembled.length,
        expectedFrame.length,
        `${name} @ chunkMaxBytes=${chunkMaxBytes}: exact frame byte length`,
      );
      assert.deepEqual(
        assembled,
        expectedFrame,
        `${name} @ chunkMaxBytes=${chunkMaxBytes}: byte-for-byte frame equality`,
      );
    }
  }
});

test('PgWireOutputWriter streams rows with unpaired UTF-16 surrogates ' +
  'under tight outputBatchMaxBytes with exact frame lengths', async () => {
  const rawRows = UNPAIRED_SURROGATE_CASES.map((entry, index) => [
    index + 1,
    entry.text,
  ]);
  for (const batchMaxBytes of [3, 4, 5]) {
    const socket = new CapturingSocket();
    const writer = new PgWireOutputWriter({
      getSocket: () => socket,
      isClosed: () => false,
      batchMaxBytes,
    });
    const wrote = await writer.writeExecutionSuccess({
      result: {
        success: true,
        statementType: 'SELECT',
        columns: ['id', 'val'],
        rawRows,
      },
      executionMeta: {extended: false},
      tag: `SELECT ${rawRows.length}`,
      statementType: 'SELECT',
      session: null,
    });
    assert.equal(wrote, true);
    const frames = socket.decodeFrames();
    const dataFrames = frames.filter(
      (frame) => frame.type === PG_BACKEND_MSG.DATA_ROW,
    );
    assert.equal(dataFrames.length, rawRows.length);
    for (let i = 0; i < rawRows.length; i += 1) {
      const expected = buildDataRow(rawRows[i]);
      const actualFull = Buffer.concat([
        Buffer.from([dataFrames[i].type]),
        Buffer.from([
          (dataFrames[i].len >>> 24) & 0xff,
          (dataFrames[i].len >>> 16) & 0xff,
          (dataFrames[i].len >>> 8) & 0xff,
          dataFrames[i].len & 0xff,
        ]),
        dataFrames[i].body,
      ]);
      assert.deepEqual(
        actualFull,
        expected,
        `batchMaxBytes=${batchMaxBytes} row ${i} (${UNPAIRED_SURROGATE_CASES[i].name})`,
      );
    }
  }
});
