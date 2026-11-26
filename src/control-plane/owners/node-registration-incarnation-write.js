import {types as nodeUtilTypes} from 'node:util';
import {encodeResourceSample} from '../../diagnostics/placement-resource-sample.js';
import {COLUMN, TABLES} from '../../constants/index.js';
import {
  buildStaleNodeIncarnationError,
  normalizeKnownNodeBootIncarnation,
} from '../control-plane-error-classification.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {
  controlPlaneWriteIdentity,
  isControlPlaneWriteDefinitivelyUnappliedError,
  isControlPlaneWriteOutcomeUnknown,
  isPendingInstanceApplied,
  releaseControlPlaneWriteIdentities,
} from '../control-plane-write-identity.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {isNodeRecordReady} from '../../node/node-readiness-policy.js';
import {
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
  requireDeclaredNodeHostId,
} from '../../topology/node-host-identity.js';

const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectPrototype = Object.prototype;
const objectSeal = Object.seal;
const numberIsSafeInteger = Number.isSafeInteger;
const utilIsProxy = nodeUtilTypes.isProxy;
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';

/**
 * The NODES registration write is monotonic in the mutation itself
 * (invariant I9, owner decision D-7): there is no generic UPSERT. A row is
 * born by an INSERT (which can never replace an existing row) or advanced by
 * one CAS on the exact incarnation observed, and only when that incarnation
 * is older. So a late registration from an older incarnation can neither
 * overwrite nor lower a newer row.
 */
const NODE_REGISTRATION_OUTCOME = objectFreeze({
  ACCEPTED: 'accepted',
  CURRENT: 'current',
  REFUSED_STALE: 'refused_stale_incarnation',
  UNRESOLVED: 'unresolved',
});

const NODE_REGISTRATION_AUTHORITATIVE_READ = objectFreeze({
  owner: 'node_registration_incarnation_write',
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});

const REGISTRATION_WRITE_VERB = objectFreeze({
  BIRTH: 'birth',
  ADVANCE_FROM: 'advance-from',
});

const NODE_REGISTRATION_INCARNATION_REQUIRED =
  'NODE_REGISTRATION_INCARNATION_REQUIRED';
const NODE_REGISTRATION_ISSUE_RECORD_REQUIRED =
  'NODE_REGISTRATION_ISSUE_RECORD_REQUIRED';
const NODE_REGISTRATION_CLOCK_REQUIRED =
  'NODE_REGISTRATION_CLOCK_REQUIRED';
const NODE_IDENTITY_TWIN_SUSPECTED = 'NODE_IDENTITY_TWIN_SUSPECTED';
const NODE_IDENTITY_TWIN_SUSPECTED_MESSAGE =
  'Node id is held by a live node on another host (valid READY lease, ' +
  'different declared host_id); an operator must remove or rename one of ' +
  'them';
const NODE_REGISTRATION_NOT_APPLIED = 'Node registration write not applied';
const FAILED_RESULT_ERROR_FIELDS = objectFreeze([
  'code',
  'errorCode',
  'retryAfterMs',
  'deferRetry',
  'failureCode',
]);

const NODE_INCARNATION_RELATION = objectFreeze({
  ABSENT: 'absent',
  OLDER: 'older',
  CURRENT: 'current',
  NEWER: 'newer',
});

const ISSUE_INDETERMINATE_MODE = objectFreeze({
  AUTHORITATIVE: 'authoritative',
  BLIND_BIRTH: 'blind_birth',
});

const ISSUE_RECORD_FIELD = objectFreeze({
  ISSUED_AT: 'issuedAtIncarnation',
  INDETERMINATE_AT: 'indeterminateAtIncarnation',
  INDETERMINATE_MODE: 'indeterminateMode',
  INDETERMINATE_ROW: 'indeterminateRow',
});

function incarnationOf(row) {
  return normalizeKnownNodeBootIncarnation(row?.[COLUMN.BOOT_INCARNATION]);
}

function isPositiveSafeInteger(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) && value > 0;
}

function requirePositiveBootIncarnation(bootIncarnation) {
  if (isPositiveSafeInteger(bootIncarnation)) {
    return bootIncarnation;
  }
  const error = new Error(NODE_REGISTRATION_INCARNATION_REQUIRED);
  error.code = NODE_REGISTRATION_INCARNATION_REQUIRED;
  throw error;
}

function requireRegistrationClockReading(nowMs) {
  if (typeof nowMs === 'number' &&
      numberIsSafeInteger(nowMs) &&
      nowMs >= 0 &&
      !objectIs(nowMs, -0)) {
    return nowMs;
  }
  const error = new Error(NODE_REGISTRATION_CLOCK_REQUIRED);
  error.code = NODE_REGISTRATION_CLOCK_REQUIRED;
  throw error;
}

/**
 * One boot lifecycle's record of the registration write it issued or left
 * unsettled across an indeterminate network boundary:
 * - issuedAtIncarnation: confirmed (or readback-promoted) incarnation, or null
 * - indeterminateMode: 'authoritative' | 'blind_birth' | null
 * - indeterminateAtIncarnation: incarnation of the unsettled attempt, or null
 * - indeterminateRow: frozen {host_id, status, node_address} for authoritative
 *   mode, or null
 * @return {Object}
 */
function createNodeRegistrationIssueRecord() {
  return objectSeal({
    issuedAtIncarnation: null,
    indeterminateAtIncarnation: null,
    indeterminateMode: null,
    indeterminateRow: null,
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || utilIsProxy(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === objectPrototype || prototype === null;
}

function readWritableDataDescriptor(target, property) {
  const descriptor = objectGetOwnPropertyDescriptor(target, property);
  if (!descriptor ||
      !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY) ||
      descriptor.writable !== true) {
    return null;
  }
  return descriptor;
}

function readOptionalDataString(target, property) {
  const descriptor = objectGetOwnPropertyDescriptor(target, property);
  if (!descriptor) return {valid: true, value: undefined};
  if (!objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY)) {
    return {valid: false, value: undefined};
  }
  const val = descriptor.value;
  const ok = val === undefined || typeof val === 'string';
  return {valid: ok, value: val};
}

function isValidIndeterminateRowSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return false;
  const host = readOptionalDataString(snapshot, COLUMN.HOST_ID);
  const status = readOptionalDataString(snapshot, COLUMN.STATUS);
  const addr = readOptionalDataString(snapshot, COLUMN.NODE_ADDRESS);
  return host.valid && typeof host.value === 'string' && host.value.length > 0 &&
    status.valid && addr.valid;
}

function isValidIndeterminateTuple(mode, inc, row) {
  if (mode === null) {
    return inc === null && row === null;
  }
  if (!isPositiveSafeInteger(inc)) return false;
  if (mode === ISSUE_INDETERMINATE_MODE.BLIND_BIRTH) {
    return row === null;
  }
  return mode === ISSUE_INDETERMINATE_MODE.AUTHORITATIVE &&
    isValidIndeterminateRowSnapshot(row);
}

function throwIssueRecordRequired() {
  const error = new Error(NODE_REGISTRATION_ISSUE_RECORD_REQUIRED);
  error.code = NODE_REGISTRATION_ISSUE_RECORD_REQUIRED;
  throw error;
}

function readVerifiedIssueRecord(issueRecord) {
  if (!isPlainObject(issueRecord)) throwIssueRecordRequired();
  const issuedDesc = readWritableDataDescriptor(
    issueRecord, ISSUE_RECORD_FIELD.ISSUED_AT);
  const indetAtDesc = readWritableDataDescriptor(
    issueRecord, ISSUE_RECORD_FIELD.INDETERMINATE_AT);
  const indetModeDesc = readWritableDataDescriptor(
    issueRecord, ISSUE_RECORD_FIELD.INDETERMINATE_MODE);
  const indetRowDesc = readWritableDataDescriptor(
    issueRecord, ISSUE_RECORD_FIELD.INDETERMINATE_ROW);
  if (!issuedDesc || !indetAtDesc || !indetModeDesc || !indetRowDesc) {
    throwIssueRecordRequired();
  }
  const issued = issuedDesc.value;
  const indeterminateAt = indetAtDesc.value;
  const indeterminateMode = indetModeDesc.value;
  const indeterminateRow = indetRowDesc.value;
  if ((issued !== null && !isPositiveSafeInteger(issued)) ||
      !isValidIndeterminateTuple(
        indeterminateMode, indeterminateAt, indeterminateRow)) {
    throwIssueRecordRequired();
  }
  return {
    record: issueRecord,
    issuedAtIncarnation: issued,
    indeterminateAtIncarnation: indeterminateAt,
    indeterminateMode,
    indeterminateRow,
  };
}

function clearIndeterminateFields(record) {
  record[ISSUE_RECORD_FIELD.INDETERMINATE_AT] = null;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_MODE] = null;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_ROW] = null;
}

function clearIndeterminateRegistrationIssue(issueRecord) {
  const {record} = readVerifiedIssueRecord(issueRecord);
  clearIndeterminateFields(record);
}

function snapshotIndeterminateAttemptRow(attemptedRow) {
  return objectFreeze({
    [COLUMN.HOST_ID]: requireDeclaredNodeHostId(attemptedRow?.[COLUMN.HOST_ID]),
    [COLUMN.STATUS]: attemptedRow?.[COLUMN.STATUS],
    [COLUMN.NODE_ADDRESS]: attemptedRow?.[COLUMN.NODE_ADDRESS],
  });
}

function recordAuthoritativeIndeterminateIssue(issueRecord, bootIncarnation,
  attemptedRow) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {record} = readVerifiedIssueRecord(issueRecord);
  record[ISSUE_RECORD_FIELD.INDETERMINATE_AT] = incarnation;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_MODE] =
    ISSUE_INDETERMINATE_MODE.AUTHORITATIVE;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_ROW] =
    snapshotIndeterminateAttemptRow(attemptedRow);
}

function recordBlindBirthIndeterminateIssue(issueRecord, bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {record} = readVerifiedIssueRecord(issueRecord);
  record[ISSUE_RECORD_FIELD.INDETERMINATE_AT] = incarnation;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_MODE] =
    ISSUE_INDETERMINATE_MODE.BLIND_BIRTH;
  record[ISSUE_RECORD_FIELD.INDETERMINATE_ROW] = null;
}

function hasPendingBlindBirthIssue(issueRecord, bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const verified = readVerifiedIssueRecord(issueRecord);
  return verified.indeterminateMode === ISSUE_INDETERMINATE_MODE.BLIND_BIRTH &&
    verified.indeterminateAtIncarnation === incarnation;
}

function hasPendingAuthoritativeIssue(issueRecord, bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const verified = readVerifiedIssueRecord(issueRecord);
  return verified.indeterminateMode === ISSUE_INDETERMINATE_MODE.AUTHORITATIVE &&
    verified.indeterminateAtIncarnation === incarnation;
}

function matchesIndeterminateAttemptRow(attemptedRow, rereadRow,
  bootIncarnation) {
  return Boolean(attemptedRow) &&
    Boolean(rereadRow) &&
    incarnationOf(rereadRow) === bootIncarnation &&
    rereadRow[COLUMN.HOST_ID] === attemptedRow[COLUMN.HOST_ID] &&
    (attemptedRow[COLUMN.STATUS] === undefined ||
      rereadRow[COLUMN.STATUS] === attemptedRow[COLUMN.STATUS]) &&
    (attemptedRow[COLUMN.NODE_ADDRESS] === undefined ||
      rereadRow[COLUMN.NODE_ADDRESS] === attemptedRow[COLUMN.NODE_ADDRESS]);
}

/**
 * Reconcile a successful authoritative NODES observation against any pending
 * unsettled indeterminate attempt recorded on issueRecord.
 * @param {Object} issueRecord
 * @param {Object|null} observedRow
 * @param {number} bootIncarnation
 * @return {{promoted: boolean}}
 */
function reconcileAuthoritativeObservation(issueRecord, observedRow,
  bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const verified = readVerifiedIssueRecord(issueRecord);
  if (verified.indeterminateMode === null) {
    return {promoted: false};
  }
  if (verified.indeterminateAtIncarnation !== incarnation) {
    clearIndeterminateFields(verified.record);
    return {promoted: false};
  }
  if (verified.indeterminateMode === ISSUE_INDETERMINATE_MODE.AUTHORITATIVE) {
    const matches = matchesIndeterminateAttemptRow(
      verified.indeterminateRow, observedRow, incarnation);
    clearIndeterminateFields(verified.record);
    if (matches) {
      verified.record[ISSUE_RECORD_FIELD.ISSUED_AT] = incarnation;
      return {promoted: true};
    }
    return {promoted: false};
  }
  // BLIND_BIRTH: only an observed row at this exact incarnation keeps the
  // blind-birth marker alive for writeIdentity replay; ABSENT/OLDER/NEWER
  // proves no blind birth at this incarnation holds the row.
  if (incarnationOf(observedRow) !== incarnation) {
    clearIndeterminateFields(verified.record);
  }
  return {promoted: false};
}

function classifyNodeIncarnationRelation(observedRow, bootIncarnation,
  issueRecord) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {issuedAtIncarnation} = readVerifiedIssueRecord(issueRecord);
  if (!observedRow) return NODE_INCARNATION_RELATION.ABSENT;
  const observed = incarnationOf(observedRow);
  if (observed > incarnation) return NODE_INCARNATION_RELATION.NEWER;
  if (observed < incarnation) return NODE_INCARNATION_RELATION.OLDER;
  return issuedAtIncarnation === incarnation ?
    NODE_INCARNATION_RELATION.CURRENT : NODE_INCARNATION_RELATION.NEWER;
}

function recordNodeRegistrationIssue(issueRecord, bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {record} = readVerifiedIssueRecord(issueRecord);
  record[ISSUE_RECORD_FIELD.ISSUED_AT] = incarnation;
  clearIndeterminateFields(record);
}

async function readAuthoritativeNodeRow(gateway, nodeId) {
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(
      gateway,
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
      [nodeId],
      NODE_REGISTRATION_AUTHORITATIVE_READ,
    );
  } catch (_error) {
    result = null;
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
    return {available: false, row: null};
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    available: true,
    row: rows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) || null,
  };
}

async function attempt(write) {
  try {
    const result = await write();
    if ((result?.success === true && classifyControlPlaneMutationResult(result).applied === true) ||
        isPendingInstanceApplied(result)) {
      return {applied: true, result, error: null};
    }
    return {applied: false, result, error: result?.success === false ?
      failedResultError(result) : null};
  } catch (error) {
    return {applied: false, result: null, error};
  }
}

function isRegistrationAttemptIndeterminate(result, error) {
  if (isControlPlaneWriteOutcomeUnknown(result) ||
      isControlPlaneWriteOutcomeUnknown(error)) {
    return true;
  }
  if (result !== null) {
    return false;
  }
  return error !== null &&
    !isControlPlaneWriteDefinitivelyUnappliedError(error);
}

function isAttemptOutcomeIndeterminate(attemptOutcome) {
  return isRegistrationAttemptIndeterminate(
    attemptOutcome?.result ?? null,
    attemptOutcome?.error ?? null,
  );
}

function failedResultError(result) {
  const error = new Error(typeof result.error === 'string' ?
    result.error : result.error?.message || NODE_REGISTRATION_NOT_APPLIED, {cause: result});
  for (const field of FAILED_RESULT_ERROR_FIELDS) {
    if (result[field] !== undefined) error[field] = result[field];
  }
  return error;
}

function registrationWriteSubject(row) {
  return [TABLES.NODES, row[COLUMN.NODE_ID], row[COLUMN.BOOT_INCARNATION]];
}

function registrationWriteIdentity(row, ...verb) {
  return {writeIdentity: controlPlaneWriteIdentity(
    ...registrationWriteSubject(row), ...verb), pendingAppliedSettles: true};
}

function buildBirthWrite(options, row) {
  return () => options.insert(
    row,
    registrationWriteIdentity(row, REGISTRATION_WRITE_VERB.BIRTH),
  );
}

// UPDATE merges columns on an incumbent row. A boot advance must therefore
// clear the complete previous interval and its identity in the registration CAS.
const EMPTY_BOOT_RESOURCE_SAMPLE = Object.freeze({
  ...encodeResourceSample(null), telemetry_sampled_at: null, telemetry_sample_id: null,
});

function planRegistration(options, row, observedRow, bootIncarnation) {
  const relation = classifyNodeIncarnationRelation(observedRow,
    bootIncarnation, options.issueRecord);
  if (relation === NODE_INCARNATION_RELATION.ABSENT) {
    return buildBirthWrite(options, row);
  }
  if (relation !== NODE_INCARNATION_RELATION.OLDER) return null;
  const observedValue = observedRow[COLUMN.BOOT_INCARNATION] ?? null;
  const nextRow = {...row, ...EMPTY_BOOT_RESOURCE_SAMPLE};
  return () => options.advance({
    [COLUMN.NODE_ID]: row[COLUMN.NODE_ID],
    [COLUMN.BOOT_INCARNATION]: observedValue,
  }, nextRow, registrationWriteIdentity(row, REGISTRATION_WRITE_VERB.ADVANCE_FROM, observedValue));
}

function classifyObservation(read, bootIncarnation, afterAttempt,
  issueRecord) {
  if (read.available !== true || !read.row) {
    return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
  }
  const relation = classifyNodeIncarnationRelation(read.row, bootIncarnation,
    issueRecord);
  if (relation === NODE_INCARNATION_RELATION.NEWER) {
    return NODE_REGISTRATION_OUTCOME.REFUSED_STALE;
  }
  if (relation === NODE_INCARNATION_RELATION.CURRENT) {
    return afterAttempt ? NODE_REGISTRATION_OUTCOME.ACCEPTED :
      NODE_REGISTRATION_OUTCOME.CURRENT;
  }
  return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
}

function resolveAttemptOriginHlc(result, observedRow) {
  const resultOriginHlc =
    result?.originHlc ||
    result?.partitionResult?.originHlc ||
    observedRow?.[COLUMN.UPDATED_AT_HLC];
  return typeof resultOriginHlc === 'string' && resultOriginHlc.length > 0 ?
    resultOriginHlc :
    null;
}

function freezeOutcome(outcome, observedRow = null, error = null, result = null) {
  return objectFreeze({
    outcome,
    observedRow,
    error,
    originHlc: resolveAttemptOriginHlc(result, observedRow),
  });
}

function settleRegistration(row, outcome) {
  if (outcome.outcome !== NODE_REGISTRATION_OUTCOME.UNRESOLVED) {
    releaseControlPlaneWriteIdentities(...registrationWriteSubject(row));
  }
  return outcome;
}

async function replayBlindIndeterminateBirth(birthWrite, options,
  bootIncarnation, observedRow) {
  const replay = await attempt(birthWrite);
  if (replay.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      observedRow,
      null,
      replay.result,
    );
  }
  if (isAttemptOutcomeIndeterminate(replay)) {
    recordBlindBirthIndeterminateIssue(options.issueRecord, bootIncarnation);
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.UNRESOLVED,
      observedRow,
      replay.error,
      replay.result,
    );
  }
  clearIndeterminateRegistrationIssue(options.issueRecord);
  return null;
}

function recordUnappliedAttemptIssueState(options, row, bootIncarnation,
  attemptOutcome, authoritative) {
  if (!isAttemptOutcomeIndeterminate(attemptOutcome)) {
    clearIndeterminateRegistrationIssue(options.issueRecord);
    return;
  }
  if (authoritative) {
    recordAuthoritativeIndeterminateIssue(
      options.issueRecord, bootIncarnation, row);
  } else {
    recordBlindBirthIndeterminateIssue(options.issueRecord, bootIncarnation);
  }
}

async function settleObservedReadback(options, row, bootIncarnation, read,
  attemptOutcome) {
  if (read.available !== true) return null;
  if (hasPendingBlindBirthIssue(options.issueRecord, bootIncarnation) &&
      incarnationOf(read.row) === bootIncarnation) {
    return replayBlindIndeterminateBirth(
      buildBirthWrite(options, row), options, bootIncarnation, read.row);
  }
  const {promoted} = reconcileAuthoritativeObservation(
    options.issueRecord, read.row, bootIncarnation);
  return promoted ?
    freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      read.row,
      null,
      attemptOutcome?.result ?? null,
    ) :
    null;
}

async function writeNodeRegistrationAtIncarnation(options) {
  const bootIncarnation =
    requirePositiveBootIncarnation(options?.bootIncarnation);
  readVerifiedIssueRecord(options?.issueRecord);
  const declaredHostId = requireDeclaredNodeHostId(options?.row?.[COLUMN.HOST_ID]);
  requireRegistrationClockReading(options?.nowMs);
  const row = {
    ...options.row,
    [COLUMN.HOST_ID]: declaredHostId,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  };
  const observed = await options.observe();
  const authoritative = observed.available === true;
  if (authoritative) {
    const priorSettled = await settleObservedReadback(
      options, row, bootIncarnation, observed, null);
    if (priorSettled !== null) {
      return settleRegistration(row, priorSettled);
    }
  } else if (hasPendingAuthoritativeIssue(options.issueRecord, bootIncarnation)) {
    return settleRegistration(row, await resolveUnappliedRegistration(
      options, row, bootIncarnation, {applied: false, result: null, error: null}));
  }
  const observedRow = authoritative ? observed.row : null;
  const first = planRegistration(options, row, observedRow, bootIncarnation);
  if (first === null) {
    return settleRegistration(row, freezeOutcome(
      classifyObservation(observed, bootIncarnation, false,
        options.issueRecord), observedRow));
  }
  const firstAttempt = await attempt(first);
  if (firstAttempt.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return settleRegistration(row, freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED, observedRow, null,
      firstAttempt.result));
  }
  recordUnappliedAttemptIssueState(
    options, row, bootIncarnation, firstAttempt, authoritative);
  return settleRegistration(row, await resolveUnappliedRegistration(
    options, row, bootIncarnation, firstAttempt));
}

async function resolveUnappliedRegistration(options, row, bootIncarnation,
  firstAttempt) {
  const reread = await options.observe();
  const rereadSettled = await settleObservedReadback(
    options, row, bootIncarnation, reread, firstAttempt);
  if (rereadSettled !== null) return rereadSettled;

  const retry = reread.available === true && reread.row ?
    planRegistration(options, row, reread.row, bootIncarnation) : null;
  if (retry === null) {
    return freezeOutcome(
      classifyObservation(reread, bootIncarnation, true, options.issueRecord),
      reread.row || null,
      firstAttempt.error,
      firstAttempt.result,
    );
  }
  const retryAttempt = await attempt(retry);
  if (retryAttempt.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED, reread.row, null,
      retryAttempt.result);
  }
  recordUnappliedAttemptIssueState(
    options, row, bootIncarnation, retryAttempt, true);
  const settled = await options.observe();
  const afterRetry = await settleObservedReadback(
    options, row, bootIncarnation, settled, retryAttempt);
  if (afterRetry !== null) return afterRetry;
  return freezeOutcome(
    classifyObservation(settled, bootIncarnation, true, options.issueRecord),
    settled.row || null,
    retryAttempt.error,
    retryAttempt.result,
  );
}

function isLiveTwinRow(observedRow, declaredHostId, nowMs) {
  const observedHost = readNodeHostIdentity(observedRow);
  return observedHost.state === NODE_HOST_IDENTITY_STATE.DECLARED &&
    observedHost.hostId !== declaredHostId &&
    isNodeRecordReady(observedRow, {now: nowMs});
}

function buildSupersededRegistrationError(options) {
  const declaredHostId = requireDeclaredNodeHostId(options?.declaredHostId);
  const nowMs = requireRegistrationClockReading(options?.nowMs);
  const receivedIncarnation =
    requirePositiveBootIncarnation(options?.receivedIncarnation);
  const knownIncarnation = incarnationOf(options?.observedRow) || null;
  if (isLiveTwinRow(options?.observedRow, declaredHostId, nowMs)) {
    const error = new Error(NODE_IDENTITY_TWIN_SUSPECTED_MESSAGE);
    error.code = NODE_IDENTITY_TWIN_SUSPECTED;
    error.retryable = false;
    error.nodeId = options.nodeId;
    error.receivedIncarnation = receivedIncarnation;
    error.observedHostId = readNodeHostIdentity(options.observedRow).hostId;
    error.declaredHostId = declaredHostId;
    return error;
  }
  const error = buildStaleNodeIncarnationError({
    nodeId: options.nodeId,
    receivedIncarnation,
    knownIncarnation,
  });
  error.retryable = true;
  return error;
}

export {
  EMPTY_BOOT_RESOURCE_SAMPLE,
  ISSUE_INDETERMINATE_MODE,
  NODE_IDENTITY_TWIN_SUSPECTED,
  NODE_INCARNATION_RELATION,
  NODE_REGISTRATION_CLOCK_REQUIRED,
  NODE_REGISTRATION_INCARNATION_REQUIRED,
  NODE_REGISTRATION_ISSUE_RECORD_REQUIRED,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  clearIndeterminateRegistrationIssue,
  createNodeRegistrationIssueRecord,
  hasPendingBlindBirthIssue,
  isRegistrationAttemptIndeterminate,
  matchesIndeterminateAttemptRow,
  readAuthoritativeNodeRow,
  reconcileAuthoritativeObservation,
  recordAuthoritativeIndeterminateIssue,
  recordNodeRegistrationIssue,
  requireRegistrationClockReading,
  writeNodeRegistrationAtIncarnation,
};
