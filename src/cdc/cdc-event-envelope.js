import {CDC_EVENT_IDENTITY} from '../constants/cdc-lifecycle-constants.js';
import {buildEventIdentity} from '../partition/cdc-event-buffer.js';
import {copyArrayByIndex, isDenseDataArray, isRecord} from '../utils/canonical-json-data.js';
import {CDC_OPERATION} from '../constants/cdc.js';
import {CDC_EMITTER_FIELD} from './cdc-emitter-constants.js';
import {PARTITION_CDC_OBLIGATION_EVENT_FIELD} from
  '../partition/partition-cdc-obligation-constants.js';
import {isCdcSourceScopeEvidence} from './cdc-source-scope-evidence.js';

const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectFreeze = Object.freeze;
const objectAssign = Object.assign;
const objectDefineProperty = Object.defineProperty;
const numberIsSafeInteger = Number.isSafeInteger;
const numberIsFinite = Number.isFinite;
const SetConstructor = Set;
const setHas = Function.call.bind(Set.prototype.has);
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const weakSetHas = Function.call.bind(WeakSet.prototype.has);
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);

const CDC_OPERATIONS = new SetConstructor(Object.values(CDC_OPERATION));
const capturedCdcData = new WeakSet();

const CDC_EVENT_METADATA_FIELD = objectFreeze({
  TIMESTAMP: CDC_EMITTER_FIELD.TIMESTAMP,
  SOURCE_PARTITION: CDC_EMITTER_FIELD.SOURCE_PARTITION,
  SOURCE_REPLICA: CDC_EMITTER_FIELD.SOURCE_REPLICA,
  EVENT_KEY: PARTITION_CDC_OBLIGATION_EVENT_FIELD.EVENT_KEY,
  ENTRY_ID: PARTITION_CDC_OBLIGATION_EVENT_FIELD.ENTRY_ID,
  SOURCE_LOG_INDEX: 'sourceLogIndex',
  SOURCE_ORDINAL: 'sourceOrdinal',
  SOURCE_SCOPE: 'sourceScope',
  CAUSE_ID: 'causeId',
  REPLAY_ONLY: 'replayOnly',
});
const CDC_METADATA_FIELDS = objectFreeze(Object.values(CDC_EVENT_METADATA_FIELD));
const CDC_REQUIRED_FIELDS = objectFreeze([
  CDC_EMITTER_FIELD.TABLE_NAME, CDC_EMITTER_FIELD.OPERATION, CDC_EMITTER_FIELD.DATA,
]);

function invalidCdcIdentity() {
  return objectAssign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
    {code: CDC_EVENT_IDENTITY.INVALID_CODE});
}

function assertSourcePosition(event, field, minimum) {
  if (objectHasOwn(event, field) &&
      (!numberIsSafeInteger(event[field]) || event[field] < minimum)) {
    throw invalidCdcIdentity();
  }
}

function hasAssignedTimestamp(event) {
  return objectHasOwn(event, CDC_EVENT_METADATA_FIELD.TIMESTAMP) &&
    typeof event.timestamp === 'string' && event.timestamp.length > 0;
}

// Forward the producer's envelope. A durable event cannot acquire a new
// identity or timestamp when crossing a transport/normalization boundary.
function copyCdcEventMetadata(event) {
  if (!isRecord(event)) throw invalidCdcIdentity();
  const timestampAssigned = hasAssignedTimestamp(event);
  if (objectHasOwn(event, CDC_EVENT_METADATA_FIELD.EVENT_KEY)) {
    if (!objectHasOwn(event, CDC_EVENT_METADATA_FIELD.SOURCE_PARTITION)) throw invalidCdcIdentity();
    buildEventIdentity(event);
    if (!timestampAssigned) throw invalidCdcIdentity();
    assertSourcePosition(event, CDC_EVENT_METADATA_FIELD.SOURCE_LOG_INDEX, 1);
    assertSourcePosition(event, CDC_EVENT_METADATA_FIELD.SOURCE_ORDINAL, 0);
  }
  const metadata = {};
  for (let index = 0; index < CDC_METADATA_FIELDS.length; index += 1) {
    const field = CDC_METADATA_FIELDS[index];
    // An ordinary unassigned stamp remains absent until the existing MG
    // normalizer supplies it. Never coerce it or borrow a stamp from a prototype.
    if (field === CDC_EVENT_METADATA_FIELD.TIMESTAMP && !timestampAssigned) continue;
    if (objectHasOwn(event, field)) {
      objectDefineProperty(metadata, field, {
        value: event[field], enumerable: true, configurable: true, writable: true,
      });
    }
  }
  return metadata;
}

function copyCdcEvent(event) {
  if (!isRecord(event)) throw invalidCdcIdentity();
  for (let index = 0; index < CDC_REQUIRED_FIELDS.length; index += 1) {
    if (!objectHasOwn(event, CDC_REQUIRED_FIELDS[index])) throw invalidCdcIdentity();
  }
  return {
    tableName: event.tableName,
    operation: event.operation,
    data: event.data,
    ...copyCdcEventMetadata(event),
  };
}

// Capture DATA, without invoking accessors or toJSON and without keeping a
// caller-owned descendant. Capacity is reserved by the delivery owner before
// it calls this synchronous capture; there is no separate payload queue.
function captureCdcData(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && numberIsFinite(value))) return value;
  // Only this owner's already-detached frozen descendants can be borrowed.
  // objectFreeze on caller-owned data alone supplies no such authority.
  if (weakSetHas(capturedCdcData, value)) return value;
  const array = isDenseDataArray(value);
  if ((!array && !isRecord(value)) || setHas(ancestors, value)) throw invalidCdcIdentity();
  setAdd(ancestors, value);
  let captured;
  if (array) {
    captured = copyArrayByIndex(value, (item) => captureCdcData(item, ancestors));
  } else {
    captured = {};
    const keys = objectKeys(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      objectDefineProperty(captured, key, {
        value: captureCdcData(value[key], ancestors), enumerable: true,
      });
    }
  }
  setDelete(ancestors, value);
  objectFreeze(captured);
  weakSetAdd(capturedCdcData, captured);
  return captured;
}

function captureCdcEvents(events) {
  if (!isDenseDataArray(events) || events.length === 0) throw invalidCdcIdentity();
  const identities = new SetConstructor();
  const captured = copyArrayByIndex(events, (event) => {
    if (!isRecord(event)) throw invalidCdcIdentity();
    const envelope = copyCdcEvent(event);
    if (objectHasOwn(envelope, CDC_EVENT_METADATA_FIELD.EVENT_KEY)) {
      const identity = buildEventIdentity(envelope);
      if (setHas(identities, identity)) throw invalidCdcIdentity();
      setAdd(identities, identity);
    }
    const capturedEvent = captureCdcData(envelope, new SetConstructor());
    assertCapturedCdcEvent(capturedEvent);
    return capturedEvent;
  });
  return objectFreeze(captured);
}

function assertCapturedCdcEvent(event) {
  if (typeof event.tableName !== 'string' || event.tableName.length === 0 ||
      !setHas(CDC_OPERATIONS, event.operation) || !isRecord(event.data)) throw invalidCdcIdentity();
  if (objectHasOwn(event, CDC_EVENT_METADATA_FIELD.SOURCE_SCOPE) &&
      (!isCdcSourceScopeEvidence(event.sourceScope) ||
       event.sourceScope.partitionId !== event.sourcePartition ||
       event.sourceScope.tableName !== event.tableName)) throw invalidCdcIdentity();
}

export {CDC_EVENT_METADATA_FIELD, captureCdcEvents, copyCdcEvent, copyCdcEventMetadata};
