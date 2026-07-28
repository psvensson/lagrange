import {createHash} from 'node:crypto';
import {types} from 'node:util';

const localText = Object.freeze({
  COMMA: ',',
  OBJECT_CLOSE: '}',
  OBJECT_OPEN: '{',
  ACCEPTED: 'accepted',
  CURRENT: 'current',
  EVALUATEDAT_CANONICAL_UTC_TIMESTAMP_REQUIRED: 'evaluatedAt:canonical_utc_timestamp_required',
  EVALUATION_TIME_REQUIRED: 'evaluation_time_required',
  EXPIRED: 'expired',
  HEX: 'hex',
  INVALID: 'invalid',
  NOT_YET_VALID: 'not_yet_valid',
  RECEIPT_EXACT_SCHEMA_REQUIRED: 'receipt:exact_schema_required',
  RECEIPT_PLAIN_DATA_OBJECT_REQUIRED: 'receipt:plain_data_object_required',
  RECEIPT_UNREADABLE: 'receipt:unreadable',
  RECEIPT_CONTRACTID_UNSUPPORTED: 'receipt.contractId:unsupported',
  RECEIPT_DIGEST_MISMATCH: 'receipt.digest:mismatch',
  RECEIPT_EVIDENCEIDENTITY_MISMATCH: 'receipt.evidenceIdentity:mismatch',
  RECEIPT_EVIDENCEIDENTITY_SHA256_REQUIRED: 'receipt.evidenceIdentity:sha256_required',
  RECEIPT_EXPECTATIONS_PLAIN_DATA_OBJECT_REQUIRED: 'receipt.expectations:plain_data_object_required',
  RECEIPT_ISSUEDAT_CANONICAL_UTC_TIMESTAMP_REQUIRED: 'receipt.issuedAt:canonical_utc_timestamp_required',
  RECEIPT_PROFILEIDENTITY_MISMATCH: 'receipt.profileIdentity:mismatch',
  RECEIPT_PROFILEIDENTITY_SHA256_REQUIRED: 'receipt.profileIdentity:sha256_required',
  RECEIPT_QUESTID_MISMATCH: 'receipt.questId:mismatch',
  RECEIPT_QUESTID_REQUIRED: 'receipt.questId:required',
  RECEIPT_SCHEMAVERSION_UNSUPPORTED: 'receipt.schemaVersion:unsupported',
  RECEIPT_VALIDUNTIL_CANONICAL_UTC_TIMESTAMP_REQUIRED: 'receipt.validUntil:canonical_utc_timestamp_required',
  RECEIPT_VALIDUNTIL_MUST_FOLLOW_ISSUEDAT: 'receipt.validUntil:must_follow_issuedAt',
  REJECTED: 'rejected',
  SCALE_CERTIFICATION_TERMINAL_RECEIPT: 'scale-certification-terminal-receipt',
  SCALE_CERTIFICATION_TERMINAL_RECEIPT_V1: 'scale-certification-terminal-receipt-v1',
  SHA256: 'sha256',
  TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED: 'terminal_certification_evaluation_time_required',
  TERMINAL_CERTIFICATION_EXPIRED: 'terminal_certification_expired',
  TERMINAL_CERTIFICATION_NOT_YET_VALID: 'terminal_certification_not_yet_valid',
  TERMINAL_CERTIFICATION_RECEIPT_INVALID: 'terminal_certification_receipt_invalid',
});

const ZERO = 0;
const ONE = 1;
const DateConstructor = Date;
const arrayIsArray = Array.isArray;
const dateParse = Date.parse;
const dateToISOStringMethod = Date.prototype.toISOString;
const isProxy = types.isProxy;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const regexpExecMethod = RegExp.prototype.exec;
const stringTrimMethod = String.prototype.trim;
const canonicalObjectPrototype = Object.prototype;
const DATA_DESCRIPTOR_VALUE = 'value';
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID =
  localText.SCALE_CERTIFICATION_TERMINAL_RECEIPT;
export const SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION =
  localText.SCALE_CERTIFICATION_TERMINAL_RECEIPT_V1;

export const SCALE_CERTIFICATION_RECEIPT_DECISION_STATE = Object.freeze({
  CURRENT: localText.CURRENT,
  INVALID: localText.INVALID,
  EVALUATION_TIME_REQUIRED: localText.EVALUATION_TIME_REQUIRED,
  NOT_YET_VALID: localText.NOT_YET_VALID,
  EXPIRED: localText.EXPIRED,
});

export const SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON = Object.freeze({
  RECEIPT_INVALID: localText.TERMINAL_CERTIFICATION_RECEIPT_INVALID,
  EVALUATION_TIME_REQUIRED:
    localText.TERMINAL_CERTIFICATION_EVALUATION_TIME_REQUIRED,
  NOT_YET_VALID: localText.TERMINAL_CERTIFICATION_NOT_YET_VALID,
  EXPIRED: localText.TERMINAL_CERTIFICATION_EXPIRED,
});

const RECEIPT_FIELDS = Object.freeze([
  'contractId',
  'evidenceIdentity',
  'issuedAt',
  'profileIdentity',
  'questId',
  'schemaVersion',
  'validUntil',
]);
const EXPECTATION_FIELDS = Object.freeze([
  'terminalReceiptDigest',
  'questId',
  'profileIdentity',
  'evidenceIdentity',
  'evaluatedAt',
]);

function appendOwnArrayValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function matchesPattern(pattern, value) {
  return reflectApply(regexpExecMethod, pattern, [value]) !== null;
}

export function isScaleSha256Digest(value) {
  return typeof value === 'string' && matchesPattern(SHA256_PATTERN, value);
}

function canonicalUtcTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !matchesPattern(CANONICAL_UTC_TIMESTAMP_PATTERN, value)
  ) {
    return {valid: false, milliseconds: ZERO};
  }
  const milliseconds = reflectApply(dateParse, DateConstructor, [value]);
  return {
    valid: numberIsFinite(milliseconds) &&
      reflectApply(
        dateToISOStringMethod,
        new DateConstructor(milliseconds),
        [],
      ) === value,
    milliseconds: numberIsFinite(milliseconds) ? milliseconds : ZERO,
  };
}

function receiptDecision(state, reasonCodes, errors) {
  return {state, reasonCodes, errors};
}

function invalidReceiptDecision(errors = [localText.RECEIPT_UNREADABLE]) {
  return receiptDecision(
    SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.INVALID,
    [SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.RECEIPT_INVALID],
    errors,
  );
}

function hasExpectedReceiptFields(keys) {
  if (keys.length !== RECEIPT_FIELDS.length) return false;
  for (let keyIndex = ZERO; keyIndex < keys.length; keyIndex += ONE) {
    const key = keys[keyIndex];
    if (typeof key !== 'string') return false;
    let matched = false;
    for (
      let fieldIndex = ZERO;
      fieldIndex < RECEIPT_FIELDS.length;
      fieldIndex += ONE
    ) {
      if (key === RECEIPT_FIELDS[fieldIndex]) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function snapshotReceipt(receipt) {
  let result;
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    arrayIsArray(receipt) ||
    isProxy(receipt) ||
    objectGetPrototypeOf(receipt) !== canonicalObjectPrototype
  ) {
    result = {
      state: localText.REJECTED,
      errors: [localText.RECEIPT_PLAIN_DATA_OBJECT_REQUIRED],
    };
  } else {
    const keys = reflectOwnKeys(receipt);
    if (!hasExpectedReceiptFields(keys)) {
      result = {
        state: localText.REJECTED,
        errors: [localText.RECEIPT_EXACT_SCHEMA_REQUIRED],
      };
    } else {
      const errors = [];
      const snapshot = objectCreate(null);
      for (
        let fieldIndex = ZERO;
        fieldIndex < RECEIPT_FIELDS.length;
        fieldIndex += ONE
      ) {
        const field = RECEIPT_FIELDS[fieldIndex];
        const descriptor = objectGetOwnPropertyDescriptor(receipt, field);
        if (
          !descriptor ||
          descriptor.enumerable !== true ||
          !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE)
        ) {
          appendOwnArrayValue(
            errors,
            `receipt.${field}:own_enumerable_data_property_required`,
          );
        } else {
          objectDefineProperty(snapshot, field, {
            configurable: false,
            enumerable: true,
            writable: false,
            value: descriptor.value,
          });
        }
      }
      result = errors.length > ZERO ?
        {state: localText.REJECTED, errors} :
        {state: localText.ACCEPTED, receipt: snapshot, errors};
    }
  }
  return result;
}

function snapshotExpectations(expected) {
  let result;
  if (
    !expected ||
    typeof expected !== 'object' ||
    arrayIsArray(expected) ||
    isProxy(expected)
  ) {
    result = {
      state: localText.REJECTED,
      errors: [localText.RECEIPT_EXPECTATIONS_PLAIN_DATA_OBJECT_REQUIRED],
    };
  } else {
    const errors = [];
    const snapshot = objectCreate(null);
    for (
      let fieldIndex = ZERO;
      fieldIndex < EXPECTATION_FIELDS.length;
      fieldIndex += ONE
    ) {
      const field = EXPECTATION_FIELDS[fieldIndex];
      const descriptor = objectGetOwnPropertyDescriptor(expected, field);
      if (descriptor && !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE)) {
        appendOwnArrayValue(
          errors,
          `receipt.expectations.${field}:own_data_property_required`,
        );
      } else {
        objectDefineProperty(snapshot, field, {
          configurable: false,
          enumerable: true,
          writable: false,
          value: descriptor?.value,
        });
      }
    }
    result = errors.length > ZERO ?
      {state: localText.REJECTED, errors} :
      {state: localText.ACCEPTED, expectations: snapshot, errors};
  }
  return result;
}

function validateReceiptSchema(receipt) {
  const errors = [];
  if (receipt.contractId !== SCALE_CERTIFICATION_RECEIPT_CONTRACT_ID) {
    appendOwnArrayValue(errors, localText.RECEIPT_CONTRACTID_UNSUPPORTED);
  }
  if (receipt.schemaVersion !== SCALE_CERTIFICATION_RECEIPT_SCHEMA_VERSION) {
    appendOwnArrayValue(errors, localText.RECEIPT_SCHEMAVERSION_UNSUPPORTED);
  }
  if (
    typeof receipt.questId !== 'string' ||
    reflectApply(stringTrimMethod, receipt.questId, []).length === ZERO
  ) {
    appendOwnArrayValue(errors, localText.RECEIPT_QUESTID_REQUIRED);
  }
  if (!isScaleSha256Digest(receipt.profileIdentity)) {
    appendOwnArrayValue(errors, localText.RECEIPT_PROFILEIDENTITY_SHA256_REQUIRED);
  }
  if (!isScaleSha256Digest(receipt.evidenceIdentity)) {
    appendOwnArrayValue(errors, localText.RECEIPT_EVIDENCEIDENTITY_SHA256_REQUIRED);
  }
  const issuedAt = canonicalUtcTimestamp(receipt.issuedAt);
  const validUntil = canonicalUtcTimestamp(receipt.validUntil);
  if (!issuedAt.valid) {
    appendOwnArrayValue(
      errors,
      localText.RECEIPT_ISSUEDAT_CANONICAL_UTC_TIMESTAMP_REQUIRED,
    );
  }
  if (!validUntil.valid) {
    appendOwnArrayValue(
      errors,
      localText.RECEIPT_VALIDUNTIL_CANONICAL_UTC_TIMESTAMP_REQUIRED,
    );
  }
  if (
    issuedAt.valid &&
    validUntil.valid &&
    validUntil.milliseconds <= issuedAt.milliseconds
  ) {
    appendOwnArrayValue(errors, localText.RECEIPT_VALIDUNTIL_MUST_FOLLOW_ISSUEDAT);
  }
  return errors;
}

function digestReceiptSnapshot(receipt) {
  let bytes = localText.OBJECT_OPEN;
  for (
    let fieldIndex = ZERO;
    fieldIndex < RECEIPT_FIELDS.length;
    fieldIndex += ONE
  ) {
    if (fieldIndex > ZERO) bytes += localText.COMMA;
    const field = RECEIPT_FIELDS[fieldIndex];
    bytes += `${jsonStringify(field)}:${jsonStringify(receipt[field])}`;
  }
  bytes += localText.OBJECT_CLOSE;
  return `sha256:${createHash(localText.SHA256).update(bytes).digest(localText.HEX)}`;
}

function validateReceiptTuple(receipt, expected) {
  const errors = [];
  if (digestReceiptSnapshot(receipt) !== expected.terminalReceiptDigest) {
    appendOwnArrayValue(errors, localText.RECEIPT_DIGEST_MISMATCH);
  }
  if (receipt.questId !== expected.questId) {
    appendOwnArrayValue(errors, localText.RECEIPT_QUESTID_MISMATCH);
  }
  if (receipt.profileIdentity !== expected.profileIdentity) {
    appendOwnArrayValue(errors, localText.RECEIPT_PROFILEIDENTITY_MISMATCH);
  }
  if (receipt.evidenceIdentity !== expected.evidenceIdentity) {
    appendOwnArrayValue(errors, localText.RECEIPT_EVIDENCEIDENTITY_MISMATCH);
  }
  return errors;
}

export function computeScaleCertificationReceiptDigest(receipt) {
  const snapshotResult = snapshotReceipt(receipt);
  if (snapshotResult.state !== localText.ACCEPTED) {
    throw new TypeError(snapshotResult.errors[ZERO]);
  }
  const schemaErrors = validateReceiptSchema(snapshotResult.receipt);
  if (schemaErrors.length > ZERO) {
    throw new TypeError(schemaErrors[ZERO]);
  }
  return digestReceiptSnapshot(snapshotResult.receipt);
}

export function validateScaleCertificationReceipt(receipt, expected = {}) {
  try {
    const snapshotResult = snapshotReceipt(receipt);
    if (snapshotResult.state !== localText.ACCEPTED) {
      return invalidReceiptDecision(snapshotResult.errors);
    }
    const expectationResult = snapshotExpectations(expected);
    if (expectationResult.state !== localText.ACCEPTED) {
      return invalidReceiptDecision(expectationResult.errors);
    }
    const receiptSnapshot = snapshotResult.receipt;
    const expectedSnapshot = expectationResult.expectations;
    const errors = validateReceiptSchema(receiptSnapshot);
    if (errors.length > ZERO) return invalidReceiptDecision(errors);
    const tupleErrors = validateReceiptTuple(receiptSnapshot, expectedSnapshot);
    for (
      let errorIndex = ZERO;
      errorIndex < tupleErrors.length;
      errorIndex += ONE
    ) {
      appendOwnArrayValue(errors, tupleErrors[errorIndex]);
    }
    if (errors.length > ZERO) return invalidReceiptDecision(errors);

    const evaluatedAt = canonicalUtcTimestamp(expectedSnapshot.evaluatedAt);
    if (!evaluatedAt.valid) {
      return receiptDecision(
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE
          .EVALUATION_TIME_REQUIRED,
        [
          SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON
            .EVALUATION_TIME_REQUIRED,
        ],
        [localText.EVALUATEDAT_CANONICAL_UTC_TIMESTAMP_REQUIRED],
      );
    }
    const issuedAt = canonicalUtcTimestamp(receiptSnapshot.issuedAt);
    if (evaluatedAt.milliseconds < issuedAt.milliseconds) {
      return receiptDecision(
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.NOT_YET_VALID,
        [SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.NOT_YET_VALID],
        [],
      );
    }
    const validUntil = canonicalUtcTimestamp(receiptSnapshot.validUntil);
    if (evaluatedAt.milliseconds >= validUntil.milliseconds) {
      return receiptDecision(
        SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.EXPIRED,
        [SCALE_CERTIFICATION_RECEIPT_CLAIM_REASON.EXPIRED],
        [],
      );
    }
    return receiptDecision(
      SCALE_CERTIFICATION_RECEIPT_DECISION_STATE.CURRENT,
      [],
      [],
    );
  } catch {
    return invalidReceiptDecision();
  }
}
