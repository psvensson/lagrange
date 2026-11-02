/**
 * PostgreSQL wire-protocol compatibility matrix generator and regression
 * verifier for Q10 (`postgres-compatibility-certification-matrix`).
 *
 * Ensures every declared compatibility cell across `node-pg`, `psql`, and
 * `pg-pool` and all 12 protocol dimensions is backed by a deterministic live
 * test receipt, unsupported features remain explicitly visible, negative
 * controls reject before SQL state mutation, and ORM compatibility is never
 * overclaimed.
 *
 * @module query/pg/postgres-compatibility-matrix
 */

import crypto from 'node:crypto';
import {
  PG_COMPAT_ALL_CLIENTS,
  PG_COMPAT_ALL_DIMENSIONS,
  PG_COMPAT_ALL_NEGATIVE_CONTROLS,
  PG_COMPAT_CELL_STATUS,
  PG_COMPAT_CLIENT_ID,
  PG_COMPAT_DECLARED_CELL_BY_ID,
  PG_COMPAT_DECLARED_CELLS,
  PG_COMPAT_DIMENSION,
  PG_COMPAT_EDITION_SCOPE,
  PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS,
  PG_COMPAT_FEATURE_ID,
  PG_COMPAT_MATRIX_ERROR_CODE,
  PG_COMPAT_MATRIX_SCHEMA,
  PG_COMPAT_NEGATIVE_CONTROL_ID,
  PG_COMPAT_ORM_CLAIM_POLICY,
  PG_COMPAT_QUEST_ID,
  PG_COMPAT_SQLSTATE,
  PG_COMPAT_SUPPORTED_CLIENT_MAJORS,
  PostgresCompatibilityMatrixError,
  buildCompatibilityCellId,
} from './postgres-compatibility-catalog.js';

const objectFreeze = Object.freeze;
const isArray = Array.isArray;

const HASH_ALGORITHM_SHA256 = 'sha256';
const HASH_ENCODING_HEX = 'hex';
const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_BOOLEAN = 'boolean';
const EMPTY_LENGTH = 0;
const COUNT_ZERO = 0;
const COUNT_INCREMENT = 1;
const SORT_BEFORE = -1;
const SORT_AFTER = 1;
const SORT_EQUAL = 0;
const TLS_HANDSHAKE_REJECTED_CODE = 'TLS_HANDSHAKE_REJECTED';

const VALID_CLIENT_SET = new Set(PG_COMPAT_ALL_CLIENTS);
const VALID_DIMENSION_SET = new Set(PG_COMPAT_ALL_DIMENSIONS);
const VALID_STATUS_SET = new Set([
  PG_COMPAT_CELL_STATUS.SUPPORTED,
  PG_COMPAT_CELL_STATUS.UNSUPPORTED,
]);
const VALID_NEGATIVE_CONTROL_SET = new Set(PG_COMPAT_ALL_NEGATIVE_CONTROLS);
const VALID_WRONG_PASSWORD_SQLSTATES = new Set([
  PG_COMPAT_SQLSTATE.INVALID_AUTHORIZATION,
  PG_COMPAT_SQLSTATE.INVALID_PASSWORD,
]);
const VALID_WRONG_CA_CODES = new Set([
  PG_COMPAT_SQLSTATE.CONNECTION_FAILURE,
  TLS_HANDSHAKE_REJECTED_CODE,
]);

const MSG_INVALID_RECEIPT_OBJECT = 'Compatibility cell receipt must be an object';
const MSG_INVALID_CLIENT_ID = 'Receipt clientId is not a declared client';
const MSG_INVALID_DRIVER_VERSION =
  'Receipt driverVersion must be a non-empty string';
const MSG_INVALID_DIMENSION = 'Receipt dimension is not a declared dimension';
const MSG_INVALID_FEATURE_ID =
  'Receipt featureId must be a non-empty string';
const MSG_UNDECLARED_CELL =
  'Receipt does not match any declared compatibility cell';
const MSG_INVALID_CELL_STATUS =
  'Receipt status must be supported or unsupported';
const MSG_INVALID_OBSERVED_OUTCOME =
  'Receipt observedOutcome must be a non-empty string';
const MSG_INVALID_SQLSTATE = 'Receipt sqlState must be a non-empty string';
const MSG_INVALID_MUTATION_PREVENTED =
  'Receipt mutationPrevented must be a boolean';
const MSG_RECEIPT_DIGEST_MISMATCH =
  'Receipt digest does not match canonical receipt payload';
const MSG_DUPLICATE_CELL_RECEIPT =
  'Duplicate compatibility receipt provided for declared cell';
const MSG_MISSING_SUPPORTED_RECEIPT =
  'Missing live test receipt for declared supported cell';
const MSG_OMITTED_UNSUPPORTED_CELL =
  'Declared unsupported compatibility cell was omitted';
const MSG_SUPPORTED_CELL_REGRESSED =
  'Declared supported compatibility cell regressed to unsupported';
const MSG_UNSUPPORTED_CELL_MISMATCH =
  'Declared unsupported cell receipt status must be unsupported';
const MSG_EXPECTED_SQLSTATE_MISMATCH =
  'Receipt sqlState does not match declared cell expectedSqlState';
const MSG_MUTATION_NOT_PREVENTED =
  'Receipt required mutationPrevented=true for refused or aborted execution';
const MSG_DRIVER_VERSION_UNSUPPORTED =
  'Client build is outside the matrix\'s certified client majors';
const MAJOR_VERSION_PATTERN = /^(\d+)\./u;
const MAJOR_VERSION_GROUP = 1;
const MSG_DRIVER_VERSION_MISMATCH =
  'Receipt driverVersion does not match matrix driverVersions table';
const MSG_INVALID_DRIVER_VERSIONS =
  'Matrix driverVersions must provide non-empty versions for all clients';
const MSG_ORM_OVERCLAIM =
  'Driver-level wire compatibility must not claim full ORM compatibility';
const MSG_INVALID_NEGATIVE_CONTROL =
  'Negative control receipt must be an object with a valid controlId';
const MSG_NEGATIVE_CONTROL_BREACH =
  'Negative control was not rejected before execution without mutation';
const MSG_MISSING_NEGATIVE_CONTROL =
  'Required negative control receipt is missing from compatibility matrix';
const MSG_INVALID_MATRIX_OBJECT =
  'Baseline and candidate compatibility matrices must be objects';
const MSG_MATRIX_DIGEST_MISMATCH =
  'Compatibility matrix digest or cell receipt digest does not match live receipts';

function assertObjectRecord(value, code, message) {
  if (typeof value !== TYPEOF_OBJECT || value === null || isArray(value)) {
    throw new PostgresCompatibilityMatrixError(code, message);
  }
}

function assertNonEmptyString(value, code, message, details = {}) {
  if (
    typeof value !== TYPEOF_STRING ||
    value.trim().length === EMPTY_LENGTH
  ) {
    throw new PostgresCompatibilityMatrixError(code, message, details);
  }
}

function computeSha256Hex(payload) {
  const serialized = JSON.stringify(payload);
  return crypto
    .createHash(HASH_ALGORITHM_SHA256)
    .update(serialized)
    .digest(HASH_ENCODING_HEX);
}

function compareStrings(left, right) {
  if (left < right) {
    return SORT_BEFORE;
  }
  if (left > right) {
    return SORT_AFTER;
  }
  return SORT_EQUAL;
}

function computeCellReceiptDigest(receiptFields) {
  return computeSha256Hex({
    cellId: receiptFields.cellId,
    clientId: receiptFields.clientId,
    dimension: receiptFields.dimension,
    featureId: receiptFields.featureId,
    status: receiptFields.status,
    observedOutcome: receiptFields.observedOutcome,
    sqlState: receiptFields.sqlState,
    mutationPrevented: receiptFields.mutationPrevented,
  });
}

function validateCellReceiptInput(receiptInput) {
  assertObjectRecord(
    receiptInput,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_RECEIPT_OBJECT,
  );
  if (!VALID_CLIENT_SET.has(receiptInput.clientId)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_CLIENT_ID,
      {clientId: receiptInput.clientId},
    );
  }
  assertNonEmptyString(
    receiptInput.driverVersion,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_DRIVER_VERSION,
    {clientId: receiptInput.clientId},
  );
  if (!VALID_DIMENSION_SET.has(receiptInput.dimension)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_DIMENSION,
      {dimension: receiptInput.dimension},
    );
  }
  assertNonEmptyString(
    receiptInput.featureId,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_FEATURE_ID,
  );
  if (!VALID_STATUS_SET.has(receiptInput.status)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_CELL_STATUS,
      {featureId: receiptInput.featureId},
    );
  }
  assertNonEmptyString(
    receiptInput.observedOutcome,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_OBSERVED_OUTCOME,
    {featureId: receiptInput.featureId},
  );
  assertNonEmptyString(
    receiptInput.sqlState,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_SQLSTATE,
    {featureId: receiptInput.featureId},
  );
  if (typeof receiptInput.mutationPrevented !== TYPEOF_BOOLEAN) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_MUTATION_PREVENTED,
      {featureId: receiptInput.featureId},
    );
  }
}

function createCompatibilityCellReceipt(receiptInput) {
  validateCellReceiptInput(receiptInput);
  const cellId = buildCompatibilityCellId(
    receiptInput.clientId,
    receiptInput.dimension,
    receiptInput.featureId,
  );
  if (!PG_COMPAT_DECLARED_CELL_BY_ID.has(cellId)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_UNDECLARED_CELL,
      {cellId},
    );
  }
  const normalizedFields = {
    cellId,
    clientId: receiptInput.clientId,
    driverVersion: receiptInput.driverVersion.trim(),
    dimension: receiptInput.dimension,
    featureId: receiptInput.featureId,
    status: receiptInput.status,
    observedOutcome: receiptInput.observedOutcome.trim(),
    sqlState: receiptInput.sqlState.trim(),
    mutationPrevented: receiptInput.mutationPrevented,
  };
  const receiptDigest = computeCellReceiptDigest(normalizedFields);
  if (
    typeof receiptInput.receiptDigest === TYPEOF_STRING &&
    receiptInput.receiptDigest !== receiptDigest
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MATRIX_RECEIPT_DIGEST_MISMATCH,
      MSG_RECEIPT_DIGEST_MISMATCH,
      {cellId},
    );
  }
  return objectFreeze({
    ...normalizedFields,
    receiptDigest,
  });
}

function assertNegativeControlSqlState(controlId, sqlStateValue) {
  if (
    controlId === PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_PASSWORD &&
    !VALID_WRONG_PASSWORD_SQLSTATES.has(sqlStateValue)
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_NEGATIVE_CONTROL_BREACH,
      {controlId, sqlState: sqlStateValue},
    );
  }
  if (
    controlId === PG_COMPAT_NEGATIVE_CONTROL_ID.WRONG_CA &&
    !VALID_WRONG_CA_CODES.has(sqlStateValue)
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_NEGATIVE_CONTROL_BREACH,
      {controlId, sqlState: sqlStateValue},
    );
  }
  if (
    controlId === PG_COMPAT_NEGATIVE_CONTROL_ID.UNSUPPORTED_SQL &&
    sqlStateValue !== PG_COMPAT_SQLSTATE.FEATURE_NOT_SUPPORTED
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_NEGATIVE_CONTROL_BREACH,
      {controlId, sqlState: sqlStateValue},
    );
  }
}

function createNegativeControlReceipt(controlInput) {
  assertObjectRecord(
    controlInput,
    PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
    MSG_INVALID_NEGATIVE_CONTROL,
  );
  if (
    !VALID_NEGATIVE_CONTROL_SET.has(controlInput.controlId) ||
    !VALID_CLIENT_SET.has(controlInput.clientId)
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_INVALID_NEGATIVE_CONTROL,
      {controlId: controlInput.controlId, clientId: controlInput.clientId},
    );
  }
  if (
    controlInput.rejectedBeforeExecution !== true ||
    controlInput.mutationPrevented !== true
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_NEGATIVE_CONTROL_BREACH,
      {controlId: controlInput.controlId, clientId: controlInput.clientId},
    );
  }
  assertNonEmptyString(
    controlInput.sqlState,
    PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
    MSG_NEGATIVE_CONTROL_BREACH,
    {controlId: controlInput.controlId},
  );
  assertNonEmptyString(
    controlInput.observedError,
    PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
    MSG_NEGATIVE_CONTROL_BREACH,
    {controlId: controlInput.controlId},
  );
  assertNegativeControlSqlState(
    controlInput.controlId,
    controlInput.sqlState.trim(),
  );
  const baseControl = {
    controlId: controlInput.controlId,
    clientId: controlInput.clientId,
    rejectedBeforeExecution: true,
    mutationPrevented: true,
    sqlState: controlInput.sqlState.trim(),
    observedError: controlInput.observedError.trim(),
  };
  const controlDigest = computeSha256Hex(baseControl);
  if (
    typeof controlInput.controlDigest === TYPEOF_STRING &&
    controlInput.controlDigest !== controlDigest
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MATRIX_RECEIPT_DIGEST_MISMATCH,
      MSG_MATRIX_DIGEST_MISMATCH,
      {controlId: controlInput.controlId},
    );
  }
  return objectFreeze({
    ...baseControl,
    controlDigest,
  });
}

function validateDriverVersions(driverVersions) {
  assertObjectRecord(
    driverVersions,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_DRIVER_VERSIONS,
  );
  const normalized = {};
  for (const clientId of PG_COMPAT_ALL_CLIENTS) {
    assertNonEmptyString(
      driverVersions[clientId],
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_DRIVER_VERSIONS,
      {clientId},
    );
    normalized[clientId] = driverVersions[clientId].trim();
    assertSupportedClientBuild(clientId, normalized[clientId]);
  }
  return objectFreeze(normalized);
}

// A client build the matrix does not certify is refused, typed: the claim
// covers the declared majors only (PG_COMPAT_SUPPORTED_CLIENT_MAJORS).
function assertSupportedClientBuild(clientId, version) {
  const match = MAJOR_VERSION_PATTERN.exec(version);
  const major = match ? Number(match[MAJOR_VERSION_GROUP]) : null;
  const supportedMajors = PG_COMPAT_SUPPORTED_CLIENT_MAJORS[clientId];
  if (major === null || !supportedMajors.includes(major)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.DRIVER_VERSION_UNSUPPORTED,
      MSG_DRIVER_VERSION_UNSUPPORTED,
      {clientId, version, supportedMajors: [...supportedMajors]},
    );
  }
}

function indexValidatedReceipts(receipts, normalizedDriverVersions) {
  if (!isArray(receipts)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MISSING_CELL_RECEIPT,
      MSG_MISSING_SUPPORTED_RECEIPT,
    );
  }
  const receiptById = new Map();
  for (const rawReceipt of receipts) {
    const receipt = createCompatibilityCellReceipt(rawReceipt);
    if (receiptById.has(receipt.cellId)) {
      throw new PostgresCompatibilityMatrixError(
        PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
        MSG_DUPLICATE_CELL_RECEIPT,
        {cellId: receipt.cellId},
      );
    }
    if (
      normalizedDriverVersions &&
      receipt.driverVersion !== normalizedDriverVersions[receipt.clientId]
    ) {
      throw new PostgresCompatibilityMatrixError(
        PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
        MSG_DRIVER_VERSION_MISMATCH,
        {cellId: receipt.cellId},
      );
    }
    receiptById.set(receipt.cellId, receipt);
  }
  return receiptById;
}

function verifyReceiptMatchesDeclaredCell(declaredCell, receipt) {
  if (!receipt) {
    if (declaredCell.status === PG_COMPAT_CELL_STATUS.UNSUPPORTED) {
      throw new PostgresCompatibilityMatrixError(
        PG_COMPAT_MATRIX_ERROR_CODE.UNSUPPORTED_CELL_OMITTED,
        MSG_OMITTED_UNSUPPORTED_CELL,
        {cellId: declaredCell.cellId},
      );
    }
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MISSING_CELL_RECEIPT,
      MSG_MISSING_SUPPORTED_RECEIPT,
      {cellId: declaredCell.cellId},
    );
  }
  if (
    declaredCell.status === PG_COMPAT_CELL_STATUS.SUPPORTED &&
    receipt.status !== PG_COMPAT_CELL_STATUS.SUPPORTED
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.SUPPORTED_CELL_REGRESSION,
      MSG_SUPPORTED_CELL_REGRESSED,
      {cellId: declaredCell.cellId},
    );
  }
  if (
    declaredCell.status === PG_COMPAT_CELL_STATUS.UNSUPPORTED &&
    receipt.status !== PG_COMPAT_CELL_STATUS.UNSUPPORTED
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_UNSUPPORTED_CELL_MISMATCH,
      {cellId: declaredCell.cellId},
    );
  }
  if (receipt.sqlState !== declaredCell.expectedSqlState) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_EXPECTED_SQLSTATE_MISMATCH,
      {
        cellId: declaredCell.cellId,
        expectedSqlState: declaredCell.expectedSqlState,
        actualSqlState: receipt.sqlState,
      },
    );
  }
  if (
    declaredCell.requiresMutationPrevented &&
    receipt.mutationPrevented !== true
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_MUTATION_NOT_PREVENTED,
      {cellId: declaredCell.cellId},
    );
  }
}

function normalizeNegativeControls(negativeControls) {
  if (!isArray(negativeControls)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
      MSG_MISSING_NEGATIVE_CONTROL,
    );
  }
  const normalized = negativeControls.map((entry) =>
    createNegativeControlReceipt(entry),
  );
  const coveredControls = new Set(normalized.map((entry) => entry.controlId));
  for (const requiredControlId of PG_COMPAT_ALL_NEGATIVE_CONTROLS) {
    if (!coveredControls.has(requiredControlId)) {
      throw new PostgresCompatibilityMatrixError(
        PG_COMPAT_MATRIX_ERROR_CODE.NEGATIVE_CONTROL_BREACH,
        MSG_MISSING_NEGATIVE_CONTROL,
        {controlId: requiredControlId},
      );
    }
  }
  normalized.sort((left, right) => {
    const byControl = compareStrings(left.controlId, right.controlId);
    if (byControl !== SORT_EQUAL) {
      return byControl;
    }
    const byClient = compareStrings(left.clientId, right.clientId);
    if (byClient !== SORT_EQUAL) {
      return byClient;
    }
    return compareStrings(left.observedError, right.observedError);
  });
  return objectFreeze(normalized);
}

function computeCompatibilityMatrixDigest(matrixPayload) {
  return computeSha256Hex({
    schema: matrixPayload.schema,
    questId: matrixPayload.questId,
    editionScope: matrixPayload.editionScope,
    ormCompatibilityClaimed: matrixPayload.ormCompatibilityClaimed,
    ormClaimPolicy: matrixPayload.ormClaimPolicy,
    supportedClientMajors: matrixPayload.supportedClientMajors,
    cells: matrixPayload.cells,
    negativeControls: matrixPayload.negativeControls,
  });
}

function assertNoOrmOverclaim(ormCompatibilityClaimed) {
  if (ormCompatibilityClaimed !== false) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.ORM_OVERCLAIM_FORBIDDEN,
      MSG_ORM_OVERCLAIM,
      {ormCompatibilityClaimed},
    );
  }
}

function buildVerifiedMatrixCells(receiptById) {
  const cells = [];
  let supportedCells = COUNT_ZERO;
  let unsupportedCells = COUNT_ZERO;
  for (const declaredCell of PG_COMPAT_DECLARED_CELLS) {
    const receipt = receiptById.get(declaredCell.cellId);
    verifyReceiptMatchesDeclaredCell(declaredCell, receipt);
    if (declaredCell.status === PG_COMPAT_CELL_STATUS.SUPPORTED) {
      supportedCells += COUNT_INCREMENT;
    } else {
      unsupportedCells += COUNT_INCREMENT;
    }
    cells.push(objectFreeze({
      cellId: declaredCell.cellId,
      clientId: declaredCell.clientId,
      dimension: declaredCell.dimension,
      featureId: declaredCell.featureId,
      status: receipt.status,
      expectedSqlState: declaredCell.expectedSqlState,
      sqlState: receipt.sqlState,
      requiresMutationPrevented: declaredCell.requiresMutationPrevented,
      mutationPrevented: receipt.mutationPrevented,
      observedOutcome: receipt.observedOutcome,
      description: declaredCell.description,
      receiptDigest: receipt.receiptDigest,
    }));
  }
  return {
    cells: objectFreeze(cells),
    supportedCells,
    unsupportedCells,
  };
}

function generatePostgresCompatibilityMatrix(options = {}) {
  assertObjectRecord(
    options,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_MATRIX_OBJECT,
  );
  const {
    receipts,
    driverVersions,
    negativeControls,
    ormCompatibilityClaimed = false,
  } = options;
  assertNoOrmOverclaim(ormCompatibilityClaimed);
  const normalizedDriverVersions = validateDriverVersions(driverVersions);
  const receiptById = indexValidatedReceipts(
    receipts,
    normalizedDriverVersions,
  );
  const {cells, supportedCells, unsupportedCells} =
    buildVerifiedMatrixCells(receiptById);
  const normalizedControls = normalizeNegativeControls(negativeControls);
  const summary = objectFreeze({
    totalCells: cells.length,
    supportedCells,
    unsupportedCells,
    negativeControlCount: normalizedControls.length,
  });
  const baseMatrix = {
    schema: PG_COMPAT_MATRIX_SCHEMA,
    questId: PG_COMPAT_QUEST_ID,
    editionScope: PG_COMPAT_EDITION_SCOPE,
    ormCompatibilityClaimed: false,
    ormClaimPolicy: PG_COMPAT_ORM_CLAIM_POLICY,
    clients: PG_COMPAT_ALL_CLIENTS,
    supportedClientMajors: PG_COMPAT_SUPPORTED_CLIENT_MAJORS,
    dimensions: PG_COMPAT_ALL_DIMENSIONS,
    summary,
    cells,
    negativeControls: normalizedControls,
  };
  const matrixDigest = computeCompatibilityMatrixDigest(baseMatrix);
  return objectFreeze({
    ...baseMatrix,
    matrixDigest,
    // The generating host's client builds: provenance, not the claim, and
    // outside the digest.
    environment: objectFreeze({driverVersions: normalizedDriverVersions}),
  });
}

function indexMatrixCells(matrix) {
  if (!isArray(matrix.cells)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MISSING_CELL_RECEIPT,
      MSG_MISSING_SUPPORTED_RECEIPT,
    );
  }
  const map = new Map();
  for (const cell of matrix.cells) {
    assertObjectRecord(
      cell,
      PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
      MSG_INVALID_RECEIPT_OBJECT,
    );
    map.set(cell.cellId, cell);
  }
  return map;
}

function throwMissingForBaseline(baselineCell) {
  if (baselineCell.status === PG_COMPAT_CELL_STATUS.UNSUPPORTED) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.UNSUPPORTED_CELL_OMITTED,
      MSG_OMITTED_UNSUPPORTED_CELL,
      {cellId: baselineCell.cellId},
    );
  }
  throw new PostgresCompatibilityMatrixError(
    PG_COMPAT_MATRIX_ERROR_CODE.MISSING_CELL_RECEIPT,
    MSG_MISSING_SUPPORTED_RECEIPT,
    {cellId: baselineCell.cellId},
  );
}

function assertNotRegressed(baselineCell, actualStatus) {
  if (
    baselineCell.status === PG_COMPAT_CELL_STATUS.SUPPORTED &&
    actualStatus !== PG_COMPAT_CELL_STATUS.SUPPORTED
  ) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.SUPPORTED_CELL_REGRESSION,
      MSG_SUPPORTED_CELL_REGRESSED,
      {cellId: baselineCell.cellId},
    );
  }
}

function isCandidateCellReceiptMatch(candidateCell, receipt) {
  return (
    candidateCell.receiptDigest === receipt.receiptDigest &&
    candidateCell.status === receipt.status &&
    candidateCell.observedOutcome === receipt.observedOutcome &&
    candidateCell.sqlState === receipt.sqlState &&
    candidateCell.mutationPrevented === receipt.mutationPrevented
  );
}

function verifySingleCandidateCell(baselineCell, candidateCell, receipt) {
  if (!candidateCell) {
    throwMissingForBaseline(baselineCell);
  }
  assertNotRegressed(baselineCell, candidateCell.status);
  if (!receipt) {
    throwMissingForBaseline(baselineCell);
  }
  assertNotRegressed(baselineCell, receipt.status);
  if (!isCandidateCellReceiptMatch(candidateCell, receipt)) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MATRIX_RECEIPT_DIGEST_MISMATCH,
      MSG_MATRIX_DIGEST_MISMATCH,
      {cellId: baselineCell.cellId},
    );
  }
}

function verifyCompatibilityMatrixRegression(options = {}) {
  assertObjectRecord(
    options,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_MATRIX_OBJECT,
  );
  const {baselineMatrix, candidateMatrix, receipts} = options;
  assertObjectRecord(
    baselineMatrix,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_MATRIX_OBJECT,
  );
  assertObjectRecord(
    candidateMatrix,
    PG_COMPAT_MATRIX_ERROR_CODE.INVALID_CELL_RECEIPT,
    MSG_INVALID_MATRIX_OBJECT,
  );
  assertNoOrmOverclaim(candidateMatrix.ormCompatibilityClaimed);
  const normalizedDriverVersions = validateDriverVersions(
    candidateMatrix.environment?.driverVersions,
  );
  const receiptById = indexValidatedReceipts(
    receipts,
    normalizedDriverVersions,
  );
  const baselineCells = isArray(baselineMatrix.cells) ?
    baselineMatrix.cells :
    PG_COMPAT_DECLARED_CELLS;
  const candidateById = indexMatrixCells(candidateMatrix);
  for (const baselineCell of baselineCells) {
    const candidateCell = candidateById.get(baselineCell.cellId);
    const receipt = receiptById.get(baselineCell.cellId);
    verifySingleCandidateCell(baselineCell, candidateCell, receipt);
  }
  for (const declaredCell of PG_COMPAT_DECLARED_CELLS) {
    const candidateCell = candidateById.get(declaredCell.cellId);
    const receipt = receiptById.get(declaredCell.cellId);
    verifySingleCandidateCell(declaredCell, candidateCell, receipt);
  }
  normalizeNegativeControls(candidateMatrix.negativeControls);
  const expectedDigest = computeCompatibilityMatrixDigest(candidateMatrix);
  if (candidateMatrix.matrixDigest !== expectedDigest) {
    throw new PostgresCompatibilityMatrixError(
      PG_COMPAT_MATRIX_ERROR_CODE.MATRIX_RECEIPT_DIGEST_MISMATCH,
      MSG_MATRIX_DIGEST_MISMATCH,
    );
  }
  return objectFreeze({
    verified: true,
    totalCells: candidateMatrix.cells.length,
    matrixDigest: expectedDigest,
  });
}

export {
  PG_COMPAT_ALL_CLIENTS,
  PG_COMPAT_ALL_DIMENSIONS,
  PG_COMPAT_CELL_STATUS,
  PG_COMPAT_CLIENT_ID,
  PG_COMPAT_DECLARED_CELLS,
  PG_COMPAT_DIMENSION,
  PG_COMPAT_EXTENDED_PROTOCOL_CLIENTS,
  PG_COMPAT_FEATURE_ID,
  PG_COMPAT_MATRIX_ERROR_CODE,
  PG_COMPAT_NEGATIVE_CONTROL_ID,
  PG_COMPAT_SQLSTATE,
  PostgresCompatibilityMatrixError,
  createCompatibilityCellReceipt,
  createNegativeControlReceipt,
  generatePostgresCompatibilityMatrix,
  verifyCompatibilityMatrixRegression,
};
