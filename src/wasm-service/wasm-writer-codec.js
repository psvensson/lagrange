import {createHash} from 'node:crypto';
import {WASM_WRITER_PROFILE as P, WRITER_ACTION as A, WRITER_REASON as R,
  WRITER_ENCODING, WRITER_DIGEST, WRITER_HEX} from './wasm-writer-profile.js';

const ID_FIELDS = ['serviceId', 'incarnation', 'slot', 'generation', 'sequence'];
const PREFIX = ['type', 'profile', 'action'];
const WRITE_FIELDS = [...PREFIX, 'identity', 'ack', 'sessionId', 'key', 'value', 'valueEncoding'];
const INIT_FIELDS = [...PREFIX, 'serviceId', 'incarnation', 'nonce'];
const ADMIN_FIELDS = [...PREFIX, 'serviceId', 'incarnation', 'slot', 'expectedGeneration',
  'expectedCompletedSequence', 'expectedReceiptDigest', 'newGeneration', 'nonce'];
const DELIVERY_FIELDS = ['operation', 'requestId', 'ack', 'sessionId', 'key', 'value'];
const OPTIONAL_DELIVERY_FIELDS = ['deadlineMs'];

function writerError(code = R.INVALID) {
  return Object.assign(new Error(code), {code});
}

function requireCondition(condition, code = R.INVALID) {
  if (!condition) throw writerError(code);
}

function fields(value, required, optional = []) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireCondition(required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key)));
}

function text(value, max) {
  requireCondition(typeof value === 'string' && Buffer.byteLength(value) <= max);
  return value;
}

function counter(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  requireCondition(Number.isSafeInteger(value) && value >= min && value <= max);
  return value;
}

function hex(value) {
  requireCondition(typeof value === 'string' && WRITER_HEX.test(value));
  return value;
}

function acknowledgment(value) {
  return value === null ? null : hex(value);
}

function writerIdentity(value) {
  fields(value, ID_FIELDS);
  return {serviceId: text(value.serviceId, P.serviceBytes), incarnation: hex(value.incarnation),
    slot: counter(value.slot, 0, P.slots - 1), generation: counter(value.generation, 1),
    sequence: counter(value.sequence, 1)};
}

function boundedJson(value, limit) {
  const bytes = JSON.stringify(value);
  requireCondition(Buffer.byteLength(bytes) <= limit);
  return bytes;
}

function canonicalWrite(command, prefix) {
  fields(command, WRITE_FIELDS);
  requireCondition(command.valueEncoding === WRITER_ENCODING &&
    typeof command.value === 'string');
  requireCondition(command.value.length <= Math.ceil(P.valueBytes / 3) * 4);
  const bytes = Buffer.from(command.value, WRITER_ENCODING);
  requireCondition(bytes.length <= P.valueBytes &&
    bytes.toString(WRITER_ENCODING) === command.value);
  return {...prefix, identity: writerIdentity(command.identity), ack: acknowledgment(command.ack),
    sessionId: text(command.sessionId, P.keyBytes), key: text(command.key, P.keyBytes),
    value: command.value, valueEncoding: WRITER_ENCODING};
}

function canonicalAdmin(command, prefix) {
  fields(command, command.action === A.INIT ? INIT_FIELDS : ADMIN_FIELDS);
  const common = {...prefix, serviceId: text(command.serviceId, P.serviceBytes),
    incarnation: hex(command.incarnation)};
  if (command.action === A.INIT) return {...common, nonce: hex(command.nonce)};
  const expected = counter(command.expectedGeneration, 0, Number.MAX_SAFE_INTEGER - 1);
  requireCondition(command.newGeneration === expected + 1);
  return {...common, slot: counter(command.slot, 0, P.slots - 1), expectedGeneration: expected,
    expectedCompletedSequence: counter(command.expectedCompletedSequence),
    expectedReceiptDigest: acknowledgment(command.expectedReceiptDigest),
    newGeneration: command.newGeneration, nonce: hex(command.nonce)};
}

function canonicalWriterCommand(command) {
  requireCondition(command?.type === P.type && command.profile === P.id &&
    Object.values(A).includes(command.action));
  const prefix = {type: P.type, profile: P.id, action: command.action};
  const canonical = command.action === A.WRITE ?
    canonicalWrite(command, prefix) : canonicalAdmin(command, prefix);
  boundedJson(canonical, P.commandBytes);
  return canonical;
}

function writerCommandFromDelivery(payload) {
  fields(payload, DELIVERY_FIELDS, OPTIONAL_DELIVERY_FIELDS);
  requireCondition(payload.operation === 'write');
  requireCondition(payload.value instanceof Uint8Array || typeof payload.value === 'string');
  const size = typeof payload.value === 'string' ?
    Buffer.byteLength(payload.value) : payload.value.length;
  requireCondition(size <= P.valueBytes);
  const bytes = Buffer.from(payload.value);
  return canonicalWriterCommand({type: P.type, profile: P.id, action: A.WRITE,
    identity: payload.requestId, ack: payload.ack, sessionId: payload.sessionId,
    key: payload.key, value: bytes.toString(WRITER_ENCODING), valueEncoding: WRITER_ENCODING});
}

function writerDigest(value) {
  return createHash(WRITER_DIGEST).update(JSON.stringify(value)).digest('hex');
}

function writerInterestKey(command) {
  return command.action === A.WRITE ? JSON.stringify(command.identity) : writerDigest(command);
}

function exactWriterPosition(index, term) {
  requireCondition(Number.isSafeInteger(index) && index > 0 &&
    Number.isSafeInteger(term) && term >= 0, R.POSITION);
}

export {canonicalWriterCommand, writerCommandFromDelivery, writerDigest, writerIdentity,
  writerInterestKey, boundedJson, exactWriterPosition, writerError};
