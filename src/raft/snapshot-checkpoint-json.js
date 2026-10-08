// The checkpoint format's bounded DATA codec. No caller object reaches the
// serializer: capture descriptors, reject proxies before reflection, project
// only the finite M/D/C/N grammar, then serialize the detached projection.
import {types, TextDecoder} from 'node:util';
import {serializeJsonData} from '../utils/canonical-json-data.js';
import {validatedRaftRsPeerIdentityReservations} from './raft-rs-peer-identity.js';
import {RAFT_RS_SNAPSHOT_JSON_LIMITS as LIMIT,
  RAFT_RS_CHECKPOINT_REASON as REASON} from './snapshot-checkpoint-constants.js';

const isProxy = types.isProxy;
const ownKeys = Reflect.ownKeys;
const descriptorOf = Object.getOwnPropertyDescriptor;
const prototypeOf = Object.getPrototypeOf;
const defineProperty = Object.defineProperty;
const isArray = Array.isArray;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const hasOwn = Object.hasOwn;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const UTF8 = 'utf8';
const INVALID = 'snapshot_json_invalid';
const LF = '\n';
const STRING = 'string';
const NUMBER = 'number';
const BOOLEAN = 'boolean';
const DECIMAL = 'decimal';
const NULLABLE_SQL = 'nullable_sql';
const ENVELOPE = {
  envelopeVersion: NUMBER, clusterId: STRING, raftGroupId: STRING,
  entity: 'entity', lastIncludedIndex: NUMBER, lastIncludedTerm: NUMBER,
  maxCommittedHlc: STRING, payloadKind: STRING, payloadVersion: NUMBER,
  payloadByteLength: NUMBER, payloadDigest: STRING, raftRs: 'raftRs',
};
const {raftRs: _raftRsShape, ...LEGACY_ENVELOPE} = ENVELOPE;
const GRAMMAR = Object.freeze({
  legacy: {...LEGACY_ENVELOPE, membershipEpoch: NUMBER},
  descriptor: {...ENVELOPE, membershipEpoch: NUMBER},
  checkpoint: ENVELOPE,
  manifest: {
    manifestVersion: NUMBER, clusterId: STRING, raftGroupId: STRING,
    entity: 'entity', lastIncludedIndex: NUMBER, lastIncludedTerm: NUMBER,
    maxCommittedHlc: STRING, payloadKind: STRING, payloadVersion: NUMBER,
    raftRs: 'raftRs', applicationSchema: ['schema'],
    sqliteSequences: ['sequence'],
  },
  binding: {bindingVersion: NUMBER, checkpoint: 'checkpoint'},
  entity: {kind: STRING, id: STRING},
  raftRs: {
    groupId: STRING, appliedIndex: DECIMAL, appliedTerm: DECIMAL,
    membershipGenerationIndex: DECIMAL, confState: 'confState',
    peerReservations: ['reservation'],
  },
  confState: {voters: [DECIMAL], learners: [DECIMAL],
    votersOutgoing: [DECIMAL], learnersNext: [DECIMAL], autoLeave: BOOLEAN},
  reservation: {replicaIdentity: STRING, peerId: DECIMAL},
  schema: {type: STRING, name: STRING, tableName: STRING, sql: NULLABLE_SQL},
  sequence: {tableName: STRING, sequence: DECIMAL},
});

function codecFailure(reason = INVALID) {
  const error = new TypeError(reason);
  error.reason = reason;
  return error;
}

function requireLimit(condition) {
  if (!condition) throw codecFailure(REASON.JSON_LIMIT_EXCEEDED);
}

function requireShape(condition) {
  if (!condition) throw codecFailure();
}

function dataDescriptor(object, key) {
  const descriptor = descriptorOf(object, key);
  requireShape(descriptor && hasOwn(descriptor, 'value') &&
    (key === 'length' || descriptor.enumerable));
  return descriptor.value;
}

function inspectContainer(value, array) {
  requireShape(value !== null && typeof value === 'object' && !isProxy(value));
  const prototype = prototypeOf(value);
  requireShape(array ? isArray(value) && prototype === arrayPrototype :
    !isArray(value) && (prototype === null || prototype === objectPrototype));
}

function rootGrammar(value) {
  inspectContainer(value, false);
  // Discriminators are captured data, not property access. Unknown keys are
  // rejected by projectRecord before any unknown child's value is visited.
  const keys = ownKeys(value);
  requireLimit(keys.length <= LIMIT.MAX_RECORD_KEYS);
  if (keys.includes('bindingVersion')) return 'binding';
  if (keys.includes('manifestVersion')) return 'manifest';
  if (keys.includes('membershipEpoch') && !keys.includes('raftRs')) return 'legacy';
  return keys.includes('membershipEpoch') ? 'descriptor' : 'checkpoint';
}

function accountBytes(budget, bytes) {
  budget.bytes += bytes;
  requireLimit(budget.bytes <= LIMIT.MAX_CANONICAL_BYTES);
}

function accountString(value, budget) {
  requireLimit(value.length <= LIMIT.MAX_STRING_CODE_UNITS);
  // String iteration never runs caller code: value is already a primitive.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      requireShape(next >= 0xdc00 && next <= 0xdfff);
    } else {
      requireShape(code < 0xdc00 || code > 0xdfff);
    }
  }
  budget.strings += Buffer.byteLength(value, UTF8);
  requireLimit(budget.strings <= LIMIT.MAX_TOTAL_STRING_UTF8_BYTES);
  // Individual strings are capped before quoting; the full result is never
  // serialized before its cumulative escaped byte budget is established.
  accountBytes(budget, Buffer.byteLength(jsonStringify(value), UTF8));
}

function scalar(value, kind, budget) {
  if (kind === NULLABLE_SQL && value === null) {
    accountBytes(budget, 'null'.length);
    return value;
  }
  if ([STRING, DECIMAL, NULLABLE_SQL].includes(kind)) {
    requireShape(typeof value === STRING);
    accountString(value, budget);
    if (kind === DECIMAL) requireShape(/^(0|[1-9][0-9]*)$/.test(value));
    return value;
  }
  requireShape(kind === BOOLEAN ? typeof value === BOOLEAN :
    typeof value === NUMBER && Number.isSafeInteger(value) &&
      value >= 0 && !Object.is(value, -0));
  accountBytes(budget, String(value).length);
  return value;
}

function put(output, key, value) {
  defineProperty(output, key, {value, enumerable: true,
    configurable: true, writable: true});
}

function accountChildren(budget, count) {
  budget.children += count;
  budget.values += count;
  requireLimit(budget.children <= LIMIT.MAX_TOTAL_PROPERTIES_AND_ELEMENTS &&
    budget.values <= LIMIT.MAX_PROJECTED_VALUES);
}

function enqueueChildren(value, kind, output, frame, budget, stack) {
  const array = isArray(kind);
  inspectContainer(value, array);
  const shape = array ? null : GRAMMAR[kind];
  let keys;
  if (array) {
    const length = dataDescriptor(value, 'length');
    requireLimit(length <= LIMIT.MAX_ARRAY_ELEMENTS);
    keys = ownKeys(value);
    requireShape(keys.length === length + 1 && keys.includes('length'));
    keys = Array.from({length}, (_, index) => String(index));
  } else {
    keys = ownKeys(value);
    requireLimit(keys.length <= LIMIT.MAX_RECORD_KEYS);
    requireShape(keys.length === Object.keys(shape).length &&
      keys.every((key) => typeof key === STRING && hasOwn(shape, key)));
  }
  accountChildren(budget, keys.length);
  accountBytes(budget, 2 + Math.max(0, keys.length - 1));
  const ancestors = [...frame.ancestors, value];
  // Check immediate descriptor/type before children are enqueued. The stack
  // remains bounded even for repeated acyclic references.
  for (const key of keys) {
    const child = dataDescriptor(value, key);
    const childKind = array ? kind[0] : shape[key];
    if (!array) {
      accountString(key, budget);
      accountBytes(budget, 1);
    }
    if (isArray(childKind) || hasOwn(GRAMMAR, childKind)) {
      inspectContainer(child, isArray(childKind));
      stack.push({value: child, kind: childKind, parent: output, key,
        depth: frame.depth + 1, ancestors});
    } else {
      put(output, key, scalar(child, childKind, budget));
    }
  }
}

function detachedProjection(value) {
  const budget = {bytes: 1, strings: 0, values: 1, children: 0};
  const holder = Object.create(null);
  const stack = [{value, kind: rootGrammar(value), parent: holder,
    key: 'root', depth: 1, ancestors: []}];
  while (stack.length) {
    const frame = stack.pop();
    requireLimit(frame.depth <= LIMIT.MAX_CONTAINER_DEPTH);
    requireShape(!frame.ancestors.includes(frame.value));
    const output = isArray(frame.kind) ? [] : Object.create(null);
    enqueueChildren(frame.value, frame.kind, output, frame, budget, stack);
    put(frame.parent, frame.key, output);
  }
  validateProjectedShape(holder.root);
  return holder.root;
}

function numericSorted(values) {
  return values.every((value, index) => BigInt(value) > 0n &&
    (index === 0 || BigInt(values[index - 1]) < BigInt(value)));
}

function validateConfiguration(raftRs) {
  requireShape(BigInt(raftRs.membershipGenerationIndex) <= BigInt(raftRs.appliedIndex));
  const reservations = validatedRaftRsPeerIdentityReservations(raftRs.peerReservations);
  const peers = new Set(reservations.map(({peerId}) => peerId));
  requireShape(numericSorted(reservations.map(({peerId}) => peerId)));
  const conf = raftRs.confState;
  for (const field of ['voters', 'learners', 'votersOutgoing', 'learnersNext']) {
    requireShape(numericSorted(conf[field]) && conf[field].every((peer) => peers.has(peer)));
  }
  requireShape(conf.voters.length > 0 &&
    conf.learners.every((peer) => !conf.voters.includes(peer) &&
      !conf.votersOutgoing.includes(peer)) &&
    conf.learnersNext.every((peer) => !conf.voters.includes(peer) &&
      conf.votersOutgoing.includes(peer)));
  requireShape(conf.votersOutgoing.length > 0 ||
    (!conf.autoLeave && conf.learnersNext.length === 0));
}

function validateManifestInventory(manifest) {
  let previous = '';
  for (const row of manifest.applicationSchema) {
    const key = `${row.type}\0${row.name}`;
    requireShape(['table', 'index', 'trigger', 'view'].includes(row.type) &&
      key > previous && row.name.length > 0 && row.tableName.length > 0);
    requireShape(row.sql !== null || row.type === 'index' &&
      row.name.startsWith('sqlite_autoindex_'));
    previous = key;
  }
  previous = '';
  for (const row of manifest.sqliteSequences) {
    requireShape(row.tableName > previous);
    previous = row.tableName;
  }
}

function validateProjectedShape(root) {
  const binding = hasOwn(root, 'bindingVersion');
  if (binding) requireShape(root.bindingVersion === 1);
  const value = binding ? root.checkpoint : root;
  const manifest = hasOwn(value, 'manifestVersion');
  if (manifest) requireShape(value.manifestVersion === 1);
  if (manifest || binding) requireShape(value.payloadVersion === 2);
  // The legacy v1 descriptor remains subject to its existing format owner.
  if (value.payloadVersion !== 2) return;
  requireShape(value.payloadKind === 'raft_rs_replica_image' &&
    value.clusterId.length > 0 && value.raftGroupId.length > 0 &&
    value.entity.kind === 'partition' && value.entity.id.length > 0);
  requireShape(value.raftRs.groupId === value.raftGroupId &&
    value.raftRs.appliedIndex === String(value.lastIncludedIndex) &&
    value.raftRs.appliedTerm === String(value.lastIncludedTerm));
  validateConfiguration(value.raftRs);
  if (manifest) validateManifestInventory(value);
}

function canonicalSnapshotJsonBytes(value) {
  const projected = detachedProjection(value);
  return Buffer.from(serializeJsonData(projected, {sortKeys: true}) + LF, UTF8);
}

function parseCanonicalSnapshotJson(bytes) {
  requireShape(Buffer.isBuffer(bytes));
  requireLimit(bytes.length <= LIMIT.MAX_CANONICAL_BYTES);
  // ignoreBOM keeps a BOM in the decoded string, where JSON.parse refuses it.
  const text = new TextDecoder(UTF8, {fatal: true, ignoreBOM: true}).decode(bytes);
  const projected = detachedProjection(jsonParse(text));
  const canonical = canonicalSnapshotJsonBytes(projected);
  requireShape(bytes.equals(canonical));
  return projected;
}

export {canonicalSnapshotJsonBytes, parseCanonicalSnapshotJson, codecFailure};
