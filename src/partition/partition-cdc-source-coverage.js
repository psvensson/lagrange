// Source-owned CDC coverage. Construction owners persist immutable descriptor
// evidence in the application database. Each bounded page binds one complete
// logical key range and the partition applied prefix to the same SQLite view.

import {RaftRsDurableStore} from '../raft/raft-rs-durable-store.js';
import {
  getSystemCachePrimaryKeyField as getCoveragePrimaryKeyField,
  resolveSystemCacheRowKey as resolveCoverageRowKey,
} from '../cache/system-cache-key-descriptor.js';
import {digest} from '../utils/canonical-json-data.js';
import {compareRoutingKeys} from './split-key-comparator.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
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
  materializeCoverageKey,
  materializeCoverageRow,
  peakReservation,
  probeCoverageRow,
  probeRawBytes,
} from './partition-cdc-coverage-transfer.js';
import {releaseCdcCoverageTransfer} from
  '../cdc/cdc-coverage-transfer-owner.js';
const CDC_COVERAGE_READ_STATE = Object.freeze({
  COMPLETE: 'complete',
  REFUSED: 'refused',
});
const CDC_COVERAGE_REFUSAL = Object.freeze({
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

function coverageRowDecision(rows, bytes, rowByteBound) {
  if (rowByteBound > CDC_COVERAGE_BOUND.MAX_BYTES && rows.length === 0) {
    return CDC_COVERAGE_ROW_DECISION.ROW_TOO_LARGE;
  }
  if (rows.length >= CDC_COVERAGE_BOUND.MAX_ROWS ||
      bytes + rowByteBound > CDC_COVERAGE_BOUND.MAX_BYTES) {
    return CDC_COVERAGE_ROW_DECISION.PAGE_FULL;
  }
  return CDC_COVERAGE_ROW_DECISION.APPEND;
}

function readCoveragePage(service, scope, domain, pageStart) {
  const rows = [];
  let bytes = 0;
  let nextStart = null;
  for (let offset = 0; offset <= CDC_COVERAGE_BOUND.MAX_ROWS; offset += 1) {
    const probe = probeCoverageRow(service, scope, domain, pageStart, offset);
    if (probe === null) break;
    const rawBytes = probeRawBytes(domain, probe);
    const reservation = rawBytes === null ? null :
      peakReservation(rawBytes, domain.columns.length);
    if (reservation === null) return {rowCodecUnsupported: true};
    const decision = coverageRowDecision(
      rows, bytes, reservation.maxEncodedBytes);
    if (decision !== CDC_COVERAGE_ROW_DECISION.APPEND) {
      if (decision === CDC_COVERAGE_ROW_DECISION.ROW_TOO_LARGE) {
        return {rowTooLarge: true};
      }
      nextStart = materializeCoverageKey(
        service, scope, domain, pageStart, offset);
      if (!validCdcCoverageKey(nextStart)) return {rangeDrift: true};
      break;
    }
    const row = materializeCoverageRow(
      service, scope, domain, pageStart, offset);
    if (!validCdcCoverageRow(domain, row)) return {rowCodecUnsupported: true};
    const key = resolveCoverageRowKey(scope.tableName, row);
    if (!validCdcCoverageKey(key) || !keyIsInScope(key, scope)) {
      return {rangeDrift: true};
    }
    const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
    if (rowBytes > reservation.maxEncodedBytes ||
        bytes + rowBytes > CDC_COVERAGE_BOUND.MAX_BYTES) {
      return {rowCodecUnsupported: true};
    }
    rows.push(row);
    bytes += rowBytes;
  }
  return {rows, bytes, nextStart,
    rangeEnd: nextStart};
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
  return null;
}

function readCompleteCdcCoverage(service, options = {}) {
  const lifecycle = options.sourceLifecycle ??
    captureCdcCoverageSourceLifecycle(service);
  if (!isCurrentCdcCoverageSourceLifecycle(lifecycle) ||
      lifecycle.service !== service) {
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED, {deferRetry: true});
  }
  const admitted = sourceReadAdmission(service, lifecycle, options);
  if (admitted.refusal) return admitted.refusal;
  const {scope, domain, pageStart} = admitted;
  const captured = service.db.transaction(() => {
    const appliedIndex = exactAppliedIndex(service.db, service.partitionId);
    if (appliedIndex === null) return null;
    const page = readCoveragePage(service, scope, domain, pageStart);
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
    return completeCdcCoverageRefusal(
      CDC_COVERAGE_REFUSAL.SOURCE_LIFECYCLE_MOVED, {deferRetry: true});
  }
  const refusal = capturedReadRefusal(captured);
  if (refusal) return refusal;
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
