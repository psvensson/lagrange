import {types} from 'node:util';
import {
  SCALE_EVIDENCE_CONTRACT_ID,
  SCALE_EVIDENCE_SCHEMA_VERSION,
  SCALE_PROFILE_ID,
  computeScaleProfileIdentity,
  validateScaleProfileFields,
} from './scale-evidence-contract.js';

const inputKeys = Object.freeze([
  'profile',
  'software',
  'hardware',
  'topology',
  'data',
  'workload',
]);
const envelopeKeys = Object.freeze([
  'contractId',
  'schemaVersion',
  ...inputKeys,
  'profileIdentity',
]);
const profileKeys = Object.freeze(['id', 'version']);
const profileIds = new Set(Object.values(SCALE_PROFILE_ID));
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectCreate = Object.create;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const setHasMethod = Set.prototype.has;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const dataValueKey = 'value';
const localText = Object.freeze({
  PROFILE_ID_UNSUPPORTED: 'profileEnvelope.profile.id:unsupported',
  PROFILE_VERSION_POSITIVE_INTEGER_REQUIRED:
    'profileEnvelope.profile.version:positive_integer_required',
  CONTRACT_MISMATCH: 'profileEnvelope:contract_mismatch',
  IDENTITY_MISMATCH: 'profileEnvelope.profileIdentity:mismatch',
  SEMANTIC_FIELDS_INVALID: 'profileEnvelope:semantic_fields_invalid',
  VALID: 'valid',
});

function fail(message) {
  throw new TypeError(message);
}

function copyData(value, path) {
  if (value === null || typeof value !== 'object') return value;
  if (types.isProxy(value)) fail(`${path}:proxy_forbidden`);
  const keys = reflectOwnKeys(value);
  const copy = arrayIsArray(value) ? [] : objectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string') fail(`${path}:symbol_key_forbidden`);
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
      fail(`${path}.${key}:own_data_property_required`);
    }
    copy[key] = copyData(descriptor.value, `${path}.${key}`);
  }
  return copy;
}

function exactOwnDataRecord(value, keys, path) {
  if (
    value === null ||
    typeof value !== 'object' ||
    arrayIsArray(value) ||
    types.isProxy(value)
  ) {
    fail(`${path}:plain_record_required`);
  }
  const actual = reflectOwnKeys(value);
  let keysMatch = actual.length === keys.length;
  for (let index = 0; index < keys.length; index += 1) {
    if (!objectHasOwn(value, keys[index])) keysMatch = false;
  }
  if (!keysMatch) {
    fail(`${path}:exact_keys_required`);
  }
  const copy = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
      fail(`${path}.${key}:own_data_property_required`);
    }
    copy[key] = copyData(descriptor.value, `${path}.${key}`);
  }
  return copy;
}

function assertProfile(profile) {
  const copy = exactOwnDataRecord(profile, profileKeys, 'profileEnvelope.profile');
  if (!reflectApply(setHasMethod, profileIds, [copy.id])) {
    fail(localText.PROFILE_ID_UNSUPPORTED);
  }
  if (!numberIsSafeInteger(copy.version) || copy.version <= 0) {
    fail(localText.PROFILE_VERSION_POSITIVE_INTEGER_REQUIRED);
  }
  return copy;
}

function assertOwnerValidatedFields(envelope) {
  const errors = [];
  validateScaleProfileFields(envelope, errors);
  if (errors.length > 0) {
    fail(`${localText.SEMANTIC_FIELDS_INVALID}:${errors[0]}`);
  }
}

export function createScaleProfileEnvelope(input) {
  const copied = exactOwnDataRecord(input, inputKeys, 'profileEnvelope');
  copied.profile = assertProfile(copied.profile);
  assertOwnerValidatedFields(copied);
  const envelope = {
    contractId: SCALE_EVIDENCE_CONTRACT_ID,
    schemaVersion: SCALE_EVIDENCE_SCHEMA_VERSION,
    ...copied,
  };
  envelope.profileIdentity = computeScaleProfileIdentity(envelope);
  return envelope;
}

export function inspectScaleProfileEnvelope(envelope) {
  try {
    const copied = exactOwnDataRecord(
      envelope,
      envelopeKeys,
      'profileEnvelope',
    );
    if (
      copied.contractId !== SCALE_EVIDENCE_CONTRACT_ID ||
      copied.schemaVersion !== SCALE_EVIDENCE_SCHEMA_VERSION
    ) {
      fail(localText.CONTRACT_MISMATCH);
    }
    copied.profile = assertProfile(copied.profile);
    assertOwnerValidatedFields(copied);
    if (computeScaleProfileIdentity(copied) !== copied.profileIdentity) {
      fail(localText.IDENTITY_MISMATCH);
    }
    return {
      valid: true,
      reason: localText.VALID,
      profile: {
        id: copied.profile.id,
        identity: copied.profileIdentity,
      },
    };
  } catch (error) {
    return {valid: false, reason: error.message, profile: null};
  }
}
