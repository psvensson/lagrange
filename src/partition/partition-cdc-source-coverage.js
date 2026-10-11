// Source-owned CDC coverage. Construction owners persist immutable descriptor
// evidence in the application database. Each bounded page binds one complete
// logical key range and the partition applied prefix to the same SQLite view.

import {randomUUID} from 'node:crypto';

import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  getSystemCachePrimaryKeyField as getCoveragePrimaryKeyField,
  resolveSystemCacheRowKey as resolveCoverageRowKey,
} from '../cache/system-cache-key-descriptor.js';
import {digest} from '../utils/canonical-json-data.js';
import {compareRoutingKeys} from './split-key-comparator.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {TABLES} from '../constants/index.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {readAuthoritativeControlPlaneRows} from
  '../control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {CONTROL_PLANE_READ_RECOVERY_ROUTING} from
  '../control-plane/control-plane-readiness-constants.js';
import {isValidLeaderReadAuthorityWitness} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {
  cdcCoverageCellId,
  resolveLiveCdcCoverageDomain,
  validCdcCoverageRow,
  validCdcCoverageKey,
} from '../cdc/cdc-coverage-domain.js';
import {
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence,
  compareCdcSourceScopeEpoch,
  eventCdcSourceScope,
  isActiveCdcSourceScopeEvidence,
  isCdcSourceScopeEvidence,
  sourceScopeMatchesService,
} from '../cdc/cdc-source-scope-evidence.js';
import {
  captureLargeCoverageRow,
  requestBinding,
  materializeCoverageKey,
  materializeCoverageRow,
  ordinaryCoverageRowByteBound,
  peakReservation,
  probeCoverageKeyBytes,
  probeCoverageRow,
  probeRawBytes,
  sourcePageReservationBytes,
} from './partition-cdc-coverage-transfer.js';
import {CDC_COVERAGE_TRANSFER_DEFAULT, releaseCdcCoverageTransfer,
  reserveCdcCoverageTransfer, setCdcCoverageTransferValue} from
  '../cdc/cdc-coverage-transfer-owner.js';
const CDC_COVERAGE_READ_STATE = Object.freeze({
  COMPLETE: 'complete',
  REFUSED: 'refused',
});
const CDC_COVERAGE_REFUSAL = Object.freeze({
  CAPACITY_UNAVAILABLE: 'cdc_coverage_capacity_unavailable',
  NOT_LEADER: 'cdc_coverage_source_not_leader',
  SCOPE_MISSING: 'cdc_coverage_source_scope_missing',
  SCOPE_MOVED: 'cdc_coverage_source_scope_moved',
  APPLIED_PREFIX_MISSING: 'cdc_coverage_applied_prefix_missing',
  IDENTITY_INVALID: 'cdc_coverage_identity_invalid',
  CURSOR_INVALID: 'cdc_coverage_cursor_invalid',
  SCHEMA_UNSUPPORTED: 'cdc_coverage_schema_unsupported',
  RANGE_DRIFT: 'cdc_coverage_range_drift',
  ROW_TOO_LARGE: 'cdc_coverage_row_too_large',
  ROW_CODEC_UNSUPPORTED: 'cdc_coverage_row_codec_unsupported',
  SOURCE_LIFECYCLE_MOVED: 'cdc_coverage_source_lifecycle_moved',
});
const CDC_COVERAGE_BOUND = Object.freeze({
  MAX_ROWS: 256,
  MAX_BYTES: 16 * 1024 * 1024,
});
const CDC_COVERAGE_ROW_DECISION = Object.freeze({
  APPEND: 'append',
  PAGE_FULL: 'page-full',
  ROW_TOO_LARGE: 'row-too-large',
});
function sourceNow(service) {
  const now = service?.timeSource?.now?.();
  return Number.isFinite(now) ? now : null;
}
function sourceDeadlineIsLive(service, deadlineMs) {
  const now = sourceNow(service);
  return now === null || now < deadlineMs;
}
function keyIsInScope(key, scope) {
  try {
    return (scope.rangeStart == null ||
        compareRoutingKeys(key, scope.rangeStart) >= 0) &&
      (scope.rangeEnd == null || compareRoutingKeys(key, scope.rangeEnd) < 0);
  } catch {
    return false;
  }
}

function captureCdcCoverageSourceLifecycle(service) {
  const status = service?.raft?.readStatus?.();
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    typeof status.lifecycleIncarnation === 'string' &&
    status.lifecycleIncarnation.length > 0 && typeof status.role === 'string' ?
    Object.freeze({service, lifecycleIncarnation: status.lifecycleIncarnation,
      role: status.role}) : null;
}

function isCurrentCdcCoverageSourceLifecycle(observation) {
  if (!observation || observation.service === null) return false;
  const status = observation.service.raft?.readStatus?.();
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.lifecycleIncarnation === observation.lifecycleIncarnation &&
    status.role === observation.role;
}

function exactAppliedIndex(db, partitionId) {
  const value = RaftRsDurableStore.readAppliedIndexIn(db, partitionId);
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? value : null;
}

function completeCdcCoverageRefusal(reason, extra = {}) {
  return Object.freeze({state: CDC_COVERAGE_READ_STATE.REFUSED, reason, ...extra});
}

function normalizedPageStart(requested) {
  if (requested === null || requested === undefined) return null;
  if (!validCdcCoverageKey(requested)) return undefined;
  return requested;
}

function coverageRowDecision(rowCount, bytes, rowByteBound) {
  if (rowByteBound > CDC_COVERAGE_BOUND.MAX_BYTES && rowCount === 0) {
    return CDC_COVERAGE_ROW_DECISION.ROW_TOO_LARGE;
  }
  if (rowCount >= CDC_COVERAGE_BOUND.MAX_ROWS ||
      bytes + rowByteBound > CDC_COVERAGE_BOUND.MAX_BYTES) {
    return CDC_COVERAGE_ROW_DECISION.PAGE_FULL;
  }
  return CDC_COVERAGE_ROW_DECISION.APPEND;
}

function pageLeaseTtl(service, binding) {
  const now = service?.timeSource?.now?.();
  return Number.isFinite(now) ? Math.max(1, Math.min(
    CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS,
    Math.floor(binding.deadlineMs - now))) :
    CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS;
}

function readCoveragePage(service, scope, domain, pageStart, binding) {
  const probes = [];
  let bytes = 0;
  let totalRawBytes = 0;
  let nextStart = null;
  let nextStartOffset = null;
  for (let offset = 0; offset <= CDC_COVERAGE_BOUND.MAX_ROWS; offset += 1) {
    const probe = probeCoverageRow(service, scope, domain, pageStart, offset);
    if (probe === null) break;
    const rawBytes = probeRawBytes(domain, probe);
    const peak = rawBytes === null ? null :
      peakReservation(rawBytes, domain.columns.length);
    const ordinaryBytes = rawBytes === null ? null :
      ordinaryCoverageRowByteBound(rawBytes, domain.columns.length);
    const reservation = peak === null || ordinaryBytes === null ? null :
      {...peak, maxEncodedBytes: ordinaryBytes};
    if (reservation === null) return {rowCodecUnsupported: true};
    const decision = coverageRowDecision(
      probes.length, bytes, reservation.maxEncodedBytes);
    if (decision !== CDC_COVERAGE_ROW_DECISION.APPEND) {
      if (decision === CDC_COVERAGE_ROW_DECISION.ROW_TOO_LARGE) {
        return {rowTooLarge: true};
      }
      const nextKeyBytes = probeCoverageKeyBytes(
        service, scope, domain, pageStart, offset);
      if (nextKeyBytes === null) return {rowCodecUnsupported: true};
      totalRawBytes += nextKeyBytes;
      nextStartOffset = offset;
      break;
    }
    probes.push(reservation);
    bytes += reservation.maxEncodedBytes;
    totalRawBytes += rawBytes;
  }
  const retainedBytes = sourcePageReservationBytes(totalRawBytes, bytes);
  const transferId = `page:${randomUUID()}`;
  const session = retainedBytes === null ? null : reserveCdcCoverageTransfer(
    service, {transferId, retainedBytes, category: 'source-page',
      ttlMs: pageLeaseTtl(service, binding)});
  if (session === null) return {capacityUnavailable: true};
  if (!setCdcCoverageTransferValue(service, transferId,
    Object.freeze({binding, sourceScope: scope, pageStart}))) {
    releaseCdcCoverageTransfer(service, transferId);
    return {capacityUnavailable: true};
  }
  const rows = [];
  let actualBytes = 0;
  const fail = (value) => {
    releaseCdcCoverageTransfer(service, transferId);
    return value;
  };
  if (nextStartOffset !== null) {
    nextStart = materializeCoverageKey(
      service, scope, domain, pageStart, nextStartOffset);
    if (!validCdcCoverageKey(nextStart)) return fail({rangeDrift: true});
  }
  for (let offset = 0; offset < probes.length; offset += 1) {
    const reservation = probes[offset];
    const row = materializeCoverageRow(service, scope, domain, pageStart, offset);
    if (!validCdcCoverageRow(domain, row)) {
      return fail({rowCodecUnsupported: true});
    }
    const key = resolveCoverageRowKey(scope.tableName, row);
    if (!validCdcCoverageKey(key) || !keyIsInScope(key, scope)) {
      return fail({rangeDrift: true});
    }
    const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
    if (rowBytes > reservation.maxEncodedBytes ||
        actualBytes + rowBytes > CDC_COVERAGE_BOUND.MAX_BYTES) {
      return fail({rowCodecUnsupported: true});
    }
    rows.push(row);
    actualBytes += rowBytes;
  }
  return {rows, bytes: actualBytes, nextStart,
    rangeEnd: nextStart, transferId, session};
}

function sourceReadAdmission(service, lifecycle, options) {
  if (lifecycle.role !== RAFT_ROLE.LEADER) {
    return {refusal: completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.NOT_LEADER, {deferRetry: true})};
  }
  const scope = service.cdcSourceScopeEvidence;
  if (!isActiveCdcSourceScopeEvidence(scope)) {
    return {refusal: completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SCOPE_MISSING, {deferRetry: true})};
  }
  if (!sourceScopeMatchesService(service, scope)) {
    return {refusal: completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SCOPE_MOVED, {deferRetry: true})};
  }
  if (options.expectedScopeId !== undefined &&
      options.expectedScopeId !== scope.scopeId) {
    return {refusal: completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SCOPE_MOVED, {deferRetry: true})};
  }
  const domain = resolveLiveCdcCoverageDomain(service.db, scope.tableName);
  if (domain === null || getCoveragePrimaryKeyField(scope.tableName) !==
      domain.primaryKeyField) {
    return {refusal: completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SCHEMA_UNSUPPORTED, {deferRetry: true})};
  }
  const pageStart = normalizedPageStart(options.pageStart);
  return pageStart === undefined ? {refusal: completeCdcCoverageRefusal(
    CDC_COVERAGE_REFUSAL.CURSOR_INVALID)} : {scope, domain, pageStart};
}

const SOURCE_SCOPE_READ_OPTIONS = Object.freeze({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: PRESSURE_WORK_CLASS.BACKGROUND,
  workClass: PRESSURE_WORK_CLASS.BACKGROUND,
  recoveryRouting:
    CONTROL_PLANE_READ_RECOVERY_ROUTING.PRIORITY_RECOVERY_BOOTSTRAP,
});

function oneWitnessedRow(result, partitionId) {
  return result?.success === true && Array.isArray(result.rows) &&
    result.rows.length === 1 && isValidLeaderReadAuthorityWitness(
    result.readAuthorityWitness, partitionId) ? result.rows[0] : null;
}

async function acquireCurrentSourceScope(service, lifecycle, options) {
  const current = service.cdcSourceScopeEvidence;
  const currentMatches = isActiveCdcSourceScopeEvidence(current) &&
      current.scopeId === options.expectedScopeId &&
      sourceScopeMatchesService(service, current);
  const mismatchReason = isActiveCdcSourceScopeEvidence(current) ?
    CDC_COVERAGE_REFUSAL.SCOPE_MOVED : CDC_COVERAGE_REFUSAL.SCOPE_MISSING;
  const gateway = service.controlPlaneSystemTableGateway;
  const canReacquire = gateway && Number.isFinite(options.deadlineMs) &&
    service.timeSource?.now?.() < options.deadlineMs;
  const read = (tableName, sql, params) => {
    const now = sourceNow(service);
    const remaining = Math.floor(now === null ?
      CDC_COVERAGE_TRANSFER_DEFAULT.SESSION_TTL_MS :
      options.deadlineMs - now);
    if (remaining <= 0) throw new Error(CDC_COVERAGE_REFUSAL.IDENTITY_INVALID);
    return readAuthoritativeControlPlaneRows(gateway, tableName, sql, params, {
      ...SOURCE_SCOPE_READ_OPTIONS,
      timeoutMs: remaining,
    });
  };
  let tableBefore;
  let partition;
  let tableAfter;
  let readFailed = !canReacquire || currentMatches;
  if (!readFailed) {
    try {
      tableBefore = await read(TABLES.TABLES,
        `SELECT * FROM ${TABLES.TABLES} WHERE table_id = ?`, [service.tableId]);
      if (isCurrentCdcCoverageSourceLifecycle(lifecycle) &&
          sourceDeadlineIsLive(service, options.deadlineMs)) {
        partition = await read(TABLES.PARTITIONS,
          `SELECT * FROM ${TABLES.PARTITIONS} WHERE partition_id = ?`,
          [service.partitionId]);
      }
      if (isCurrentCdcCoverageSourceLifecycle(lifecycle) &&
          sourceDeadlineIsLive(service, options.deadlineMs)) {
        tableAfter = await read(TABLES.TABLES,
          `SELECT * FROM ${TABLES.TABLES} WHERE table_id = ?`, [service.tableId]);
      }
    } catch {
      readFailed = true;
    }
  }
  const beforeRow = oneWitnessedRow(
    tableBefore, INITIAL_PARTITION_IDS[TABLES.TABLES]);
  const partitionRow = oneWitnessedRow(
    partition, INITIAL_PARTITION_IDS[TABLES.PARTITIONS]);
  const afterRow = oneWitnessedRow(
    tableAfter, INITIAL_PARTITION_IDS[TABLES.TABLES]);
  const before = buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    tableDescriptor: beforeRow, partitionDescriptor: partitionRow});
  const after = buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    tableDescriptor: afterRow, partitionDescriptor: partitionRow});
  const witnessed = !readFailed && before && after &&
      before.scopeId === after.scopeId &&
      before.scopeId === options.expectedScopeId;
  const installed = sourceDeadlineIsLive(service, options.deadlineMs) &&
    (currentMatches || witnessed &&
    sourceScopeMatchesService(service, before) &&
    isCurrentCdcCoverageSourceLifecycle(lifecycle) &&
    service.installCdcSourceScopeEvidence(before) === true);
  return installed ?
    {success: true} : {success: false, reason: mismatchReason};
}

function capturedReadRefusal(captured) {
  if (captured === null) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.APPLIED_PREFIX_MISSING, {deferRetry: true});
  }
  if (captured.rowTooLarge) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.ROW_TOO_LARGE, {deferRetry: true});
  }
  if (captured.rangeDrift) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.RANGE_DRIFT, {deferRetry: true});
  }
  if (captured.rowCodecUnsupported) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.ROW_CODEC_UNSUPPORTED, {deferRetry: true});
  }
  if (captured.capacityUnavailable) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.CAPACITY_UNAVAILABLE, {deferRetry: true});
  }
  return null;
}

async function readCompleteCdcCoverage(service, options = {}) {
  const lifecycle = options.sourceLifecycle ??
    captureCdcCoverageSourceLifecycle(service);
  if (!isCurrentCdcCoverageSourceLifecycle(lifecycle) ||
      lifecycle.service !== service) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED, {deferRetry: true});
  }
  const acquiredScope = await acquireCurrentSourceScope(
    service, lifecycle, options);
  if (!acquiredScope.success) {
    return completeCdcCoverageRefusal(
      acquiredScope.reason, {deferRetry: true});
  }
  if (!Number.isFinite(options.deadlineMs) ||
      !sourceDeadlineIsLive(service, options.deadlineMs)) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.IDENTITY_INVALID, {deferRetry: true});
  }
  const admitted = sourceReadAdmission(service, lifecycle, options);
  if (admitted.refusal) return admitted.refusal;
  const binding = requestBinding(options);
  if (binding === null) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.IDENTITY_INVALID, {deferRetry: false});
  }
  const {scope, domain, pageStart} = admitted;
  const captured = service.db.transaction(() => {
    const appliedIndex = exactAppliedIndex(service.db, service.partitionId);
    if (appliedIndex === null) return null;
    const page = readCoveragePage(service, scope, domain, pageStart, binding);
    if (page.rowTooLarge) {
      return {appliedIndex, largeRowOffer: captureLargeCoverageRow(service, {
        ...options, scope, domain, pageStart, appliedIndex,
        sourceLifecycle: Object.freeze({
          lifecycleIncarnation: lifecycle.lifecycleIncarnation,
          role: lifecycle.role,
        }),
      })};
    }
    return {appliedIndex, ...page};
  })();
  if (!isCurrentCdcCoverageSourceLifecycle(lifecycle)) {
    if (captured?.largeRowOffer?.transferId) {
      releaseCdcCoverageTransfer(service,
        captured.largeRowOffer.transferId);
    }
    if (captured?.transferId) {
      releaseCdcCoverageTransfer(service, captured.transferId);
    }
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED, {deferRetry: true});
  }
  const refusal = capturedReadRefusal(captured);
  if (refusal) {
    if (captured?.transferId) {
      releaseCdcCoverageTransfer(service, captured.transferId);
    }
    return refusal;
  }
  if (captured.largeRowOffer) return captured.largeRowOffer;
  const logicalCoverage = Object.freeze({scopeId: scope.scopeId,
    tableName: scope.tableName, domainDigest: domain.domainDigest,
    lower: pageStart, upper: captured.rangeEnd,
    coverageId: cdcCoverageCellId({scopeId: scope.scopeId,
      domainDigest: domain.domainDigest, lower: pageStart,
      upper: captured.rangeEnd})});
  const rows = Object.freeze(captured.rows.map((row) => Object.freeze({...row})));
  const sourcePrefix = Object.freeze({partitionId: scope.partitionId,
    scopeId: scope.scopeId, appliedIndex: captured.appliedIndex});
  const sourceLifecycle = Object.freeze({
    lifecycleIncarnation: lifecycle.lifecycleIncarnation,
    role: lifecycle.role,
  });
  const observationDigest = digest({sourceScope: scope, logicalCoverage,
    sourcePrefix, sourceLifecycle, rows: rows.map((row) => {
      const key = resolveCoverageRowKey(scope.tableName, row);
      return {key, rowDigest: digest({key, row})};
    })});
  return Object.freeze({state: CDC_COVERAGE_READ_STATE.COMPLETE,
    ...binding,
    transferId: captured.transferId,
    rows,
    sourceScope: scope, logicalCoverage,
    sourcePrefix, sourceLifecycle, observationDigest,
    nextPageStart: captured.nextStart});
}

export {CDC_COVERAGE_BOUND, CDC_COVERAGE_READ_STATE, CDC_COVERAGE_REFUSAL,
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence, compareCdcSourceScopeEpoch,
  captureCdcCoverageSourceLifecycle, eventCdcSourceScope,
  isActiveCdcSourceScopeEvidence, isCdcSourceScopeEvidence,
  isCurrentCdcCoverageSourceLifecycle, readCompleteCdcCoverage};
