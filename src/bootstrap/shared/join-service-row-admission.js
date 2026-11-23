/**
 * Authoritative join-time SERVICES row admission for self-hosted message-group
 * replicas. Enforces INSERT-only birth for absent rows while allowing durable
 * rejoin (or retry of a committed birth) to observe and reuse an existing
 * authoritative row owned by the exact same node and replica identity.
 */

import {
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
} from '../../control-plane/control-plane-system-table-gateway-constants.js';
import {
  MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR,
  observeMessageGroupService,
} from '../../message-group/message-group-service-row-owner.js';
import {
  advanceServiceRowCreatedAtFloor,
} from '../../node/service-row-incarnation.js';
import {
  SERVICE_STATUS,
  isPartitionCleanupServiceRow,
} from '../../constants/index.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {JOINING_ERROR_MSG} from '../node-joining-constants.js';
import {
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
} from './node-registration-owner-constants.js';

const MESSAGE_GROUP_REGISTER_SHORTCUT_FAILED =
  'Message group service registration shortcut returned non-success';
const REUSE_EXISTING_SERVICE_OPTION = 'reuseExistingService';
const PK_CONFLICT_CODES = new Set([
  'SQLITE_CONSTRAINT_PRIMARYKEY',
  'SQLITE_CONSTRAINT_UNIQUE',
]);
const UNIQUE_CONSTRAINT_TOKEN = 'UNIQUE constraint failed';
const OBSERVED_SERVICE_STATE = Object.freeze({
  ABSENT: 'absent',
  CLEANUP: 'cleanup',
  CONFLICT: 'conflict',
  REUSABLE: 'reusable',
  UNAVAILABLE: 'unavailable',
});
const JOIN_SERVICE_ROW_ADMISSION_ERROR = Object.freeze({
  CLEANUP_IN_PROGRESS: 'Replica cleanup is in progress',
  IDENTITY_CONFLICT:
    'Observed services row does not match joining replica identity',
});

function hasPrimaryKeyConflictIndicator(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const codes = [entry.failureCode, entry.code, entry.errorCode];
  if (codes.some((code) => PK_CONFLICT_CODES.has(code))) {
    return true;
  }
  return typeof entry.error === 'string' &&
    entry.error.includes(UNIQUE_CONSTRAINT_TOKEN);
}

function isServiceRowPrimaryKeyConflict(result) {
  if (hasPrimaryKeyConflictIndicator(result)) {
    return true;
  }
  return Array.isArray(result?.participantFailures) &&
    result.participantFailures.some(hasPrimaryKeyConflictIndicator);
}

async function observeAuthoritativeJoinServiceRow(gateway, serviceId) {
  const observation = await observeMessageGroupService(gateway, serviceId);
  if (observation.available !== true) {
    return {availability: OBSERVED_SERVICE_STATE.UNAVAILABLE};
  }
  return observation.row !== null ?
    {availability: OBSERVED_SERVICE_STATE.REUSABLE, row: observation.row} :
    {availability: OBSERVED_SERVICE_STATE.ABSENT};
}

const SERVICE_IDENTITY_FIELDS = Object.freeze([
  'service_id',
  'service_type',
  'node_id',
  'group_id',
  'partition_id',
  'replica_id',
]);

function normalizeIdentityFieldValue(row, field) {
  const value = row[field];
  return value === undefined ? null : value;
}

function matchesServiceScopeIdentity(observed, expected) {
  if (!observed || !expected) {
    return false;
  }
  return SERVICE_IDENTITY_FIELDS.every(
    (field) => normalizeIdentityFieldValue(observed, field) ===
      normalizeIdentityFieldValue(expected, field),
  );
}

function hasReusableServiceLifecycle(observed) {
  const validStatus = observed?.status === SERVICE_STATUS.ACTIVE ||
    observed?.status === SERVICE_STATUS.STOPPED;
  return validStatus &&
    Number.isFinite(observed?.created_at) &&
    Number.isFinite(observed?.updated_at);
}

function buildUnavailableServiceResult(cause) {
  return {
    success: false,
    deferRetry: true,
    retryable: true,
    retryAfterMs: AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
    errorCode:
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR
        .AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
    error: AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
    ...(cause ? {cause} : {}),
  };
}

function buildReusableServiceResult(row) {
  advanceServiceRowCreatedAtFloor(row.created_at);
  const originHlc = typeof row.updated_at_hlc === 'string' &&
      row.updated_at_hlc.length > 0 ?
    row.updated_at_hlc :
    null;
  return {
    success: true,
    reused: true,
    serviceRow: row,
    originHlc,
  };
}

function isServiceRowCleanupInProgress(row) {
  return isPartitionCleanupServiceRow(row) ||
    (typeof row?.cleanup_token === 'string' && row.cleanup_token.length > 0);
}

function determineObservedServiceState(observed, expected) {
  if (observed.availability === OBSERVED_SERVICE_STATE.UNAVAILABLE) {
    return OBSERVED_SERVICE_STATE.UNAVAILABLE;
  }
  if (observed.availability === OBSERVED_SERVICE_STATE.ABSENT) {
    return OBSERVED_SERVICE_STATE.ABSENT;
  }
  if (isServiceRowCleanupInProgress(observed.row)) {
    return OBSERVED_SERVICE_STATE.CLEANUP;
  }
  if (!matchesServiceScopeIdentity(observed.row, expected) ||
      !hasReusableServiceLifecycle(observed.row)) {
    return OBSERVED_SERVICE_STATE.CONFLICT;
  }
  return OBSERVED_SERVICE_STATE.REUSABLE;
}

function classifyObservedJoinServiceRow(observed, expected) {
  const state = determineObservedServiceState(observed, expected);
  switch (state) {
  case OBSERVED_SERVICE_STATE.UNAVAILABLE:
    return {state, result: buildUnavailableServiceResult(observed.cause)};
  case OBSERVED_SERVICE_STATE.ABSENT:
    return {state, result: null};
  case OBSERVED_SERVICE_STATE.CLEANUP:
    return {
      state,
      result: {
        success: false,
        deferRetry: true,
        retryable: true,
        retryAfterMs: AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
        errorCode: MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.CLEANUP_IN_PROGRESS,
        error: JOIN_SERVICE_ROW_ADMISSION_ERROR.CLEANUP_IN_PROGRESS,
      },
    };
  case OBSERVED_SERVICE_STATE.CONFLICT:
    return {
      state,
      result: {
        success: false,
        retryable: false,
        errorCode: MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.IDENTITY_CONFLICT,
        error: JOIN_SERVICE_ROW_ADMISSION_ERROR.IDENTITY_CONFLICT,
      },
    };
  default:
    return {state, result: buildReusableServiceResult(observed.row)};
  }
}

async function resolveExistingJoinServiceRow(gateway, rowData) {
  const observed = await observeAuthoritativeJoinServiceRow(
    gateway,
    rowData.service_id,
  );
  return classifyObservedJoinServiceRow(observed, rowData);
}

/**
 * Admit one join-time SERVICES row: on durable rejoin (`reuseExistingService`)
 * authoritatively observe the existing row first to avoid blind INSERTs;
 * otherwise birth via INSERT and verify authoritative ownership on PK conflict.
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function admitJoinServiceRow({
  gateway,
  rowData,
  reuseExistingService = false,
  insertRow,
}) {
  if (reuseExistingService === true) {
    const preCheck = await resolveExistingJoinServiceRow(gateway, rowData);
    if (preCheck.state !== OBSERVED_SERVICE_STATE.ABSENT) {
      return preCheck.result;
    }
  }
  const insertResult = await insertRow();
  if (insertResult?.success === true) {
    return insertResult;
  }
  if (!isServiceRowPrimaryKeyConflict(insertResult)) {
    return insertResult;
  }
  const conflictCheck = await resolveExistingJoinServiceRow(gateway, rowData);
  return conflictCheck.state !== OBSERVED_SERVICE_STATE.ABSENT ?
    conflictCheck.result :
    insertResult;
}

function buildRetryableMessageGroupRegistrationError(error, classification) {
  const details = classification || {};
  const message = typeof error?.message === 'string' && error.message.length > 0 ?
    error.message :
    JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED;
  const retryableError = new Error(message);
  retryableError.deferRetry = true;
  retryableError.retryable = true;
  if (Number.isFinite(details.retryAfterMs) && details.retryAfterMs > 0) {
    retryableError.retryAfterMs = Math.floor(details.retryAfterMs);
  }
  if (details.parsedError) {
    retryableError.bootstrapResponse = details.parsedError;
  }
  if (typeof details.code === 'string' && details.code.length > 0) {
    retryableError.code = details.code;
  }
  if (Number.isFinite(details.statusCode)) {
    retryableError.statusCode = Math.floor(details.statusCode);
  }
  if (error) {
    retryableError.cause = error;
  }
  return retryableError;
}

function readShortcutFailureCode(shortcutResult) {
  const fromClassification =
    getControlPlaneErrorCode(shortcutResult) ||
    getControlPlaneErrorCode(shortcutResult?.error);
  if (fromClassification) {
    return fromClassification;
  }
  const raw = shortcutResult?.code || shortcutResult?.errorCode;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function isShortcutFailureRetryable(shortcutResult) {
  return shortcutResult?.deferRetry === true ||
    isRetryableControlPlaneError(shortcutResult) ||
    isRetryableControlPlaneError(shortcutResult?.error);
}

function buildShortcutMessageGroupRegistrationError(shortcutResult) {
  const error = new Error(MESSAGE_GROUP_REGISTER_SHORTCUT_FAILED);
  if (shortcutResult?.error) {
    error.cause = shortcutResult.error;
  }
  const code = readShortcutFailureCode(shortcutResult);
  if (code) {
    error.code = code;
  }
  if (shortcutResult?.retryable === false) {
    error.retryable = false;
    return error;
  }
  if (isShortcutFailureRetryable(shortcutResult) !== true) {
    return error;
  }

  return buildRetryableMessageGroupRegistrationError(
    error,
    {
      parsedError: shortcutResult || null,
      retryAfterMs: Math.max(
        getControlPlaneRetryAfterMs(shortcutResult),
        getControlPlaneRetryAfterMs(shortcutResult?.error),
      ),
      code,
    },
  );
}

function buildJoinServiceShortcutOptions(admissionTarget, options) {
  const shortcutOptions = {admissionTarget};
  if (options?.[REUSE_EXISTING_SERVICE_OPTION] === true) {
    shortcutOptions[REUSE_EXISTING_SERVICE_OPTION] = true;
  }
  return shortcutOptions;
}

function selectRegisteredJoinServiceRow(shortcutResult, serviceData) {
  return shortcutResult?.serviceRow &&
      typeof shortcutResult.serviceRow === 'object' ?
    {...shortcutResult.serviceRow} :
    serviceData;
}

export {
  admitJoinServiceRow,
  buildJoinServiceShortcutOptions,
  buildShortcutMessageGroupRegistrationError,
  selectRegisteredJoinServiceRow,
};
