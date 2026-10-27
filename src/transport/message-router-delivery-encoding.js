// The transport owns the final JSON/UTF-8 handoff, including one caller-named
// transient duration field. No event schema, source clock or private grant is
// serialized here. Local handlers continue to receive ordinary data objects.
import {isRecord, serializeJsonData} from '../utils/canonical-json-data.js';

const INVALID_DELIVERY_ENCODING = 'router_delivery_encoding_invalid';
// Every positive finite IEEE-754 number's JSON representation fits this slot
// (at most 24 characters). Spare bytes are private workspace, not a wire
// padding overhead or a duration/payload cap.
const DURATION_SLOT_BYTES = 32;
const FRAME_SUFFIX = '}}';
const UTF8 = 'utf8';
const ASCII = 'ascii';
const ownKeys = Object.keys;
const hasOwn = Object.hasOwn;
const sameValue = Object.is;
const isFiniteNumber = Number.isFinite;
const minimum = Math.min;
const createRecord = Object.create;
const sliceText = Function.call.bind(String.prototype.slice);
const padText = Function.call.bind(String.prototype.padEnd);
const bufferFrom = Buffer.from;
const writeBuffer = Function.call.bind(Buffer.prototype.write);
const bufferView = Function.call.bind(Buffer.prototype.subarray);

function invalidEncoding() {
  return Object.assign(new Error(INVALID_DELIVERY_ENCODING), {code: INVALID_DELIVERY_ENCODING});
}

function durationPayload(lifetime, payload, field) {
  if (!isRecord(payload)) throw invalidEncoding();
  const prepared = lifetime.prepareMessage(payload);
  if (!isRecord(prepared) || !hasOwn(prepared, field) ||
      !isFiniteNumber(prepared[field]) || prepared[field] <= 0) throw invalidEncoding();
  return prepared;
}

function withoutDuration(payload, field) {
  const body = createRecord(null);
  const keys = ownKeys(payload);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key !== field) body[key] = payload[key];
  }
  return body;
}

function assertSamePayload(first, current, field) {
  const keys = ownKeys(first);
  if (keys.length !== ownKeys(current).length) throw invalidEncoding();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!hasOwn(current, key) || (key !== field && !sameValue(first[key], current[key]))) {
      throw invalidEncoding();
    }
  }
}

function encodeDurationFrame(envelope, prepared, field) {
  const {payload: _payload, ...metadata} = envelope;
  const header = serializeJsonData(metadata);
  const body = serializeJsonData(withoutDuration(prepared, field));
  const headerSeparator = header === '{}' ? '' : ',';
  const bodySeparator = body === '{}' ? '' : ',';
  const prefix = `${sliceText(header, 0, -1)}${headerSeparator}"payload":` +
    `${sliceText(body, 0, -1)}${bodySeparator}${serializeJsonData(field)}:`;
  // The slot is structurally the final payload member and the payload is the
  // final frame member. Its offset never searches arbitrary event contents.
  const bytes = bufferFrom(`${prefix}${padText('', DURATION_SLOT_BYTES, ' ')}${FRAME_SUFFIX}`, UTF8);
  return {bytes, offset: bytes.length - FRAME_SUFFIX.length - DURATION_SLOT_BYTES};
}

function encodeDeliveryMessage(envelope, lifetime) {
  const field = lifetime.durationField;
  if (field === undefined) {
    const payload = lifetime.prepareMessage(envelope.payload);
    const bytes = JSON.stringify({...envelope, payload});
    return {stamp: () => {
      lifetime.remainingMs();
      return bytes;
    }};
  }
  if (!isRecord(envelope)) throw invalidEncoding();
  const prepared = durationPayload(lifetime, envelope.payload, field);
  const {bytes, offset} = encodeDurationFrame(envelope, prepared, field);
  const stamp = () => {
    // Re-run the owner's native-target/currentness guard after complete body
    // serialization and UTF-8 conversion. It may change only the named scalar.
    const current = durationPayload(lifetime, envelope.payload, field);
    assertSamePayload(prepared, current, field);
    const remaining = minimum(current[field], lifetime.remainingMs());
    const encoded = serializeJsonData(remaining);
    if (encoded.length > DURATION_SLOT_BYTES) throw invalidEncoding();
    writeBuffer(bytes, encoded, offset, DURATION_SLOT_BYTES, ASCII);
    writeBuffer(bytes, FRAME_SUFFIX, offset + encoded.length, FRAME_SUFFIX.length, ASCII);
    // A completely spent grant never leaves the process, even if its timeout
    // callback has not run. Only fixed-size scalar/framing work follows the
    // duration cut; post-handoff compression/masking belongs to socket custody.
    lifetime.remainingMs();
    // No padding reaches the wire: even an event at the existing payload
    // boundary keeps the original JSON byte domain. This view copies no body.
    return bufferView(bytes, 0, offset + encoded.length + FRAME_SUFFIX.length);
  };
  return {stamp};
}

export {encodeDeliveryMessage};
