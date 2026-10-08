// Test-only codec oracles. Inputs are real content-owner artifacts; no native
// packet or admission is manufactured here. This file grants no authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as Format from '../../../src/raft/snapshot-checkpoint-format.js';
import * as Constants from '../../../src/raft/snapshot-checkpoint-constants.js';
import {readCheckpoint} from '../../../src/raft/snapshot-checkpoint-store.js';
import {serializeJsonData} from '../../../src/utils/canonical-json-data.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';

const EXPECTED_LIMITS = Object.freeze({
  MAX_CANONICAL_BYTES: 16777216,
  MAX_CONTAINER_DEPTH: 8,
  MAX_PROJECTED_VALUES: 262144,
  MAX_TOTAL_PROPERTIES_AND_ELEMENTS: 262144,
  MAX_RECORD_KEYS: 32,
  MAX_ARRAY_ELEMENTS: 65536,
  MAX_STRING_CODE_UNITS: 1048576,
  MAX_TOTAL_STRING_UTF8_BYTES: 8388608,
});

function refused(work) {
  let failure = null;
  try {
    work();
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error, 'invalid codec input must refuse');
  assert.notEqual(failure.name, 'RangeError',
    'bounded validation must not leak recursive/allocation RangeError');
}

function assertNoCallerExecution(encode, binding) {
  let reads = 0;
  const getter = Object.defineProperty({...binding}, 'checkpoint', {
    enumerable: true,
    get() {
      reads += 1;
      return binding.checkpoint;
    },
  });
  refused(() => encode(getter));
  assert.equal(reads, 0, 'otherwise-valid root getter never runs');
  const trap = () => {
    reads += 1;
    throw new Error('FORBIDDEN_CALLER_EXECUTION');
  };
  refused(() => encode(new Proxy(binding, {
    getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap,
    get: trap,
  })));
  assert.equal(reads, 0, 'Proxy rejection occurs before every trap');
  const forging = new Proxy(binding, {
    getOwnPropertyDescriptor(target, key) {
      reads += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    get(target, key) {
      reads += 1;
      return key === 'bindingVersion' ? 99 : Reflect.get(target, key);
    },
  });
  refused(() => encode(forging));
  assert.equal(reads, 0, 'descriptor-forging Proxy never enters projection');
  const revoked = Proxy.revocable(binding, {});
  revoked.revoke();
  refused(() => encode(revoked.proxy));
  const withToJson = {...binding, toJSON: trap};
  refused(() => encode(withToJson));
  assert.equal(reads, 0, 'toJSON never executes');
  const nested = structuredClone(binding);
  nested.checkpoint.entity = new Proxy(nested.checkpoint.entity, {
    getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap,
    get: trap,
  });
  refused(() => encode(nested));
  assert.equal(reads, 0, 'nested Proxy is rejected without traps');
}

function assertStrictBytes(encode, parse, binding, bytes) {
  assert.deepEqual(bytes,
    Buffer.from(serializeJsonData(binding, {sortKeys: true}) + '\n'),
    'frozen serializer grammar, not encoder/parser agreement alone');
  assert.equal(bytes.at(-1), 10);
  assert.notEqual(bytes.at(-2), 10, 'one final LF');
  assert.deepEqual(JSON.parse(bytes.toString('utf8')), binding);
  assert.deepEqual(encode(parse(bytes)), bytes,
    'round trip preserves exact bytes without constraining record prototype');
  refused(() => parse(bytes.subarray(0, -1)));
  refused(() => parse(Buffer.concat([bytes, Buffer.from('\n')])));
  const duplicate = bytes.toString('utf8').replace(
    '"bindingVersion":1,', '"bindingVersion":1,"bindingVersion":1,');
  assert.notEqual(duplicate, bytes.toString('utf8'));
  refused(() => parse(Buffer.from(duplicate)));
  refused(() => parse(Buffer.concat([Buffer.from([0xff]), bytes])));
  refused(() => parse(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])));
  const unordered = Buffer.from(JSON.stringify({
    checkpoint: binding.checkpoint, bindingVersion: 1,
  }) + '\n');
  assert.notDeepEqual(unordered, bytes);
  refused(() => parse(unordered));
}

function assertShapeRefusals(encode, parse, binding) {
  for (const scalar of ['\ud800', '\udfff']) {
    const invalid = structuredClone(binding);
    invalid.checkpoint.clusterId = scalar;
    refused(() => encode(invalid));
  }
  const unsafe = structuredClone(binding);
  unsafe.checkpoint.lastIncludedIndex = Number.MAX_SAFE_INTEGER + 1;
  refused(() => encode(unsafe));
  const minusZero = structuredClone(binding);
  minusZero.checkpoint.lastIncludedIndex = -0;
  refused(() => encode(minusZero));
  const hole = structuredClone(binding);
  delete hole.checkpoint.raftRs.peerReservations[0];
  refused(() => encode(hole));
  const extraArrayKey = structuredClone(binding);
  extraArrayKey.checkpoint.raftRs.peerReservations.extra = 1;
  refused(() => encode(extraArrayKey));
  const cyclic = structuredClone(binding);
  cyclic.checkpoint.entity = cyclic;
  refused(() => encode(cyclic));
  // Explicitly structural controls; no claim a later depth budget engaged.
  let deep = {};
  for (let index = 0; index < 100000; index += 1) deep = {unknown: deep};
  refused(() => encode({...binding, unknown: deep}));
  const deepBytes = Buffer.from('{"unknown":' + '['.repeat(100000) +
    '0' + ']'.repeat(100000) + '}\n');
  refused(() => parse(deepBytes));
}

function assertTypedReadLimit(root, bytes, label) {
  const directory = path.join(root, `codec-limit-${label}`);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory,
    Constants.RAFT_CHECKPOINT_DESCRIPTOR_FILE), bytes);
  const answer = readCheckpoint({checkpointDir: directory});
  assert.equal(answer.outcome,
    Constants.RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR);
  assert.deepEqual(answer.reasons, [
    Constants.RAFT_RS_CHECKPOINT_REASON.JSON_LIMIT_EXCEEDED,
  ], 'typed budget refusal, not ordinary JSON syntax or missing payload');
}

function assertLimits(encode, parse, binding, root) {
  assert.deepEqual(Constants.RAFT_RS_SNAPSHOT_JSON_LIMITS, EXPECTED_LIMITS);
  assert.equal(Constants.RAFT_RS_CHECKPOINT_REASON.JSON_LIMIT_EXCEEDED,
    'snapshot_json_limit_exceeded');
  const largeBytes = Buffer.alloc(EXPECTED_LIMITS.MAX_CANONICAL_BYTES + 1, 32);
  refused(() => parse(largeBytes));
  assertTypedReadLimit(root, largeBytes, 'bytes');
  const long = structuredClone(binding);
  long.checkpoint.clusterId = 'x'.repeat(EXPECTED_LIMITS.MAX_STRING_CODE_UNITS);
  assert.deepEqual(encode(parse(encode(long))), encode(long),
    'exact individual string budget remains legal inside total budgets');
  long.checkpoint.clusterId = 'x'.repeat(
    EXPECTED_LIMITS.MAX_STRING_CODE_UNITS + 1);
  refused(() => encode(long));
  const descriptor = {...long.checkpoint, membershipEpoch: 9};
  // Deliberately adversarial bytes bypass encoder. The typed reader must
  // identify the budget before payload/digest checks can mask this branch.
  assertTypedReadLimit(root, Buffer.from(JSON.stringify(descriptor) + '\n'),
    'string');
  const oversizedArray = structuredClone(binding);
  oversizedArray.checkpoint.raftRs.peerReservations = new Array(
    EXPECTED_LIMITS.MAX_ARRAY_ELEMENTS + 1).fill(
    binding.checkpoint.raftRs.peerReservations[0]);
  refused(() => encode(oversizedArray));
  assertTypedReadLimit(root, Buffer.from(JSON.stringify({
    ...oversizedArray.checkpoint, membershipEpoch: 9,
  }) + '\n'), 'array');
  // Repeated references are counted/rejected; not advertised as a valid
  // duplicate reservation or a separately isolated cumulative budget test.
}

function assertJointShape(encode, parse, binding) {
  const extended = structuredClone(binding);
  const identities = ['codec-joint-a', 'codec-joint-b', 'codec-joint-c'];
  const reservations = identities.map((replicaIdentity) => ({
    replicaIdentity, peerId: deriveRaftRsPeerId(replicaIdentity),
  })).sort((left, right) => BigInt(left.peerId) < BigInt(right.peerId) ? -1 : 1);
  const [first, second, third] = reservations.map(({peerId}) => peerId);
  extended.checkpoint.raftRs.peerReservations = reservations;
  extended.checkpoint.raftRs.confState = {
    voters: [first], learners: [third], votersOutgoing: [first, second],
    learnersNext: [second], autoLeave: true,
  };
  // Codec-only canonical joint shape with real derived reservations. This is
  // never delivered as a native packet or used as committed authority.
  assert.deepEqual(JSON.parse(encode(parse(encode(extended)))), extended);
  assert.ok(encode(extended).includes(Buffer.from('"autoLeave":true')));
}

function withDeclaredIndexes(manifest, count, sqlSize = 0, filler = 'x') {
  const result = structuredClone(manifest);
  const tableName = manifest.entity.id;
  const additions = Array.from({length: count}, (_, index) => {
    const name = `codec_budget_${String(index).padStart(6, '0')}`;
    const prefix = `CREATE INDEX ${name} ON ${tableName}(payload) /*`;
    const suffix = '*/';
    const sql = sqlSize === 0 ? `${prefix}${suffix}` :
      prefix + filler.repeat(sqlSize - prefix.length - suffix.length) + suffix;
    return {type: 'index', name, tableName, sql};
  });
  result.applicationSchema.push(...additions);
  result.applicationSchema.sort((left, right) => {
    const a = `${left.type}\0${left.name}`;
    const b = `${right.type}\0${right.name}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return result;
}

function assertCumulativeBudgets(encode, manifest) {
  // Format-only inventories; not claimed to be sealed SQLite images or
  // production pressure evidence. Every declared index names the existing
  // application table and has matching SQL/name. Contrast remains inside
  // the other budgets so a generic unknown-field rejection cannot pass.
  const belowValues = withDeclaredIndexes(manifest, 40000);
  assert.ok(encode(belowValues).length > 0,
    'large supported shallow inventory stays below cumulative work limits');
  refused(() => encode(withDeclaredIndexes(manifest, 60000)));
  const size = EXPECTED_LIMITS.MAX_STRING_CODE_UNITS;
  assert.ok(encode(withDeclaredIndexes(manifest, 7, size)).length > 0,
    'seven maximum SQL strings fit cumulative UTF8 metadata budget');
  refused(() => encode(withDeclaredIndexes(manifest, 8, size)));
  assert.ok(encode(withDeclaredIndexes(manifest, 2, size, '\u0001'))
    .length < EXPECTED_LIMITS.MAX_CANONICAL_BYTES,
  'escaped output below byte cap remains legal');
  refused(() => encode(withDeclaredIndexes(manifest, 3, size, '\u0001')));
}

function assertSnapshotCodecContract({descriptor, manifest, root}) {
  const encode = Format.canonicalSnapshotJsonBytes;
  const parse = Format.parseCanonicalSnapshotJson;
  assert.equal(typeof encode, 'function');
  assert.equal(typeof parse, 'function');
  const checkpoint = {...descriptor};
  delete checkpoint.membershipEpoch;
  const binding = {bindingVersion: 1, checkpoint};
  assertStrictBytes(encode, parse, binding, encode(binding));
  assertNoCallerExecution(encode, binding);
  assertShapeRefusals(encode, parse, binding);
  assertLimits(encode, parse, binding, root);
  assertJointShape(encode, parse, binding);
  const manifestBytes = encode(manifest);
  assert.deepEqual(encode(parse(manifestBytes)), manifestBytes);
  assert.ok(manifest.applicationSchema.some((row) => row.sql === null),
    'real implicit-index null remains accepted');
  assert.ok(manifest.applicationSchema.some((row) => row.sql?.includes('\n')),
    'real multiline SQL remains accepted');
  assertCumulativeBudgets(encode, manifest);
}

export {assertSnapshotCodecContract};
