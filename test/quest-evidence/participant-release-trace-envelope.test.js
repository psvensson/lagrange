import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {test} from 'node:test';

import {emitCompleteParticipantReleaseTrace, parseCompleteParticipantReleaseTrace,
  CHUNK_BYTE_MAX, CHUNK_SCHEMA, MANIFEST_SCHEMA} from
  '../../scripts/quest-evidence/participant-release-trace-envelope.mjs';

const SOURCE_SCHEMA = 'participant-release-delivery-trace/1';
const SHA = (source) => createHash('sha256').update(source).digest('hex');
const BIG = 'real three-voter SQL/Рафт/🚀'.repeat(110000);

function fixture() {
  return JSON.stringify({schema: SOURCE_SCHEMA, recordedCount: 1, records: [
    {callOrdinal: 1, completionOrdinal: 1, outcome: 'observed'}],
  payload: BIG});
}
function emitted(source) {
  const lines = [];
  const metadata = emitCompleteParticipantReleaseTrace(source, (line) =>
    lines.push(line));
  return {lines, metadata};
}

test('complete 3MB+ trace stays inside original 1MB TAP analysis line limit',
  () => {
    const source = fixture();
    const {lines, metadata} = emitted(source);
    const sourceBytes = Buffer.from(source, 'utf8');
    assert.ok(sourceBytes.length > 1024 * 1024,
      'the falsifier must exceed the real runner per-line analysis cap');
    assert.ok(lines.length > 3,
      'the observer must record the manifest and multiple actual chunks');
    assert.ok(lines.every((line) => Buffer.byteLength(line) < 1024 * 1024),
      'no emitted line can escape the original runner analysis bound');
    assert.equal(metadata.rawBytes, sourceBytes.length);
    assert.equal(metadata.rawSha256, SHA(sourceBytes));
    assert.equal(metadata.totalChunks, Math.ceil(sourceBytes.length / CHUNK_BYTE_MAX));
    const parsed = parseCompleteParticipantReleaseTrace(lines.join('\n'));
    assert.equal(parsed.encoding, 'verified-bounded-chunks');
    assert.equal(parsed.rawBytes, sourceBytes.length);
    assert.equal(parsed.rawSha256, SHA(sourceBytes));
    assert.equal(parsed.report.schema, SOURCE_SCHEMA);
    assert.equal(parsed.report.payload.length, BIG.length);
    assert.equal(parsed.report.payload.slice(0, 100), BIG.slice(0, 100));
    assert.equal(parsed.report.payload.slice(-100), BIG.slice(-100));
    assert.equal(parsed.report.records.length, 1);
  });

test('missing, duplicate, malformed and stale trace records refuse evidence',
  () => {
    const {lines} = emitted(fixture());
    assert.ok(lines[0].includes(MANIFEST_SCHEMA));
    assert.ok(lines[1].includes(CHUNK_SCHEMA));
    assert.throws(() => parseCompleteParticipantReleaseTrace(
      lines.filter((_, index) => index !== 2).join('\n')),
    /manifest incomplete/u);
    assert.throws(() => parseCompleteParticipantReleaseTrace(
      [...lines, lines[1]].join('\n')),
    /manifest incomplete/u);
    const altered = [...lines];
    const chunk = JSON.parse(altered[1]);
    chunk.base64 = 'AAAA' + chunk.base64.slice(4);
    altered[1] = JSON.stringify(chunk);
    assert.throws(() => parseCompleteParticipantReleaseTrace(altered.join('\n')),
      /hash differ/u);
    assert.throws(() => parseCompleteParticipantReleaseTrace(
      lines.filter((_, index) => index !== 0).join('\n')),
    /exactly one complete/u);
  });

test('historical single-line trace remains readable without manufacturing metadata',
  () => {
    const tiny = JSON.stringify({schema: SOURCE_SCHEMA, recordedCount: 0, records: []});
    const parsed = parseCompleteParticipantReleaseTrace('TAP version 13\n' + tiny);
    assert.equal(parsed.encoding, 'original-unbounded');
    assert.equal(parsed.rawSha256, null);
    assert.equal(parsed.rawBytes, null);
    assert.deepEqual(parsed.report, JSON.parse(tiny));
  });
