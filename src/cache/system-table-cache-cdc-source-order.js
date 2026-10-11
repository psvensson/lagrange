// Volatile source-order and complete-coverage owner for durable CDC events.

import {CDC_OPERATION} from '../constants/index.js';
import {compareRoutingKeys} from '../partition/split-key-comparator.js';
import {compareCdcSourceScopeEpoch, isActiveCdcSourceScopeEvidence} from
  '../cdc/cdc-source-scope-evidence.js';
import {cdcCoverageCellId, compareCdcCoverageKeys,
  keyInCdcCoverageInterval, resolveCdcCoverageDomain,
  validCdcCoverageKey, validCdcCoverageRow} from
  '../cdc/cdc-coverage-domain.js';
import {resolveSystemCacheRowKey} from './system-cache-key-descriptor.js';
import {buildCoverageAtoms, compareFloor, coveringCoverageAtom,
  coverageAtomsStats, overlayCoverageAtoms,
  trimCoverageAtomsOutsideCell} from './system-table-cache-cdc-cover.js';
import {digest} from '../utils/canonical-json-data.js';
import {SystemTableCacheTombstoneStore} from
  './system-table-cache-tombstone-store.js';
import {updateSystemTableCacheCdcObservation as updateCoverageObservation} from
  './system-table-cache-cdc-observation.js';
import {normalizeCauseId} from '../utils/cause-id.js';

const CDC_SOURCE_ORDER = Object.freeze({APPLY: 'apply',
  BACKPRESSURE: 'backpressure', COVERED: 'covered', LEGACY: 'legacy',
  CONFLICT: 'conflict', PROVENANCE_INVALID: 'provenance-invalid', STALE: 'stale'});
const CDC_SOURCE_SUFFIX_BOUND = Object.freeze({MAX_EVENTS: 10000,
  MAX_BYTES: 16 * 1024 * 1024, RETRY_AFTER_MS: 100});
const CDC_COVERAGE_ATOM_BOUND = Object.freeze({MAX_ATOMS: 20000,
  MAX_BYTES: 16 * 1024 * 1024});
const CDC_COVERAGE_INSTALL_REASON = Object.freeze({
  ATOM_CAPACITY: 'cdc_coverage_atom_capacity_unavailable',
  GENERATION_NOT_NEWER: 'cdc_coverage_generation_not_newer',
  INCOMPLETE: 'incomplete', INVALID_ROW_SET: 'invalid-row-set',
  PREFIX_CONFLICT: 'prefix-conflict', PREFIX_STALE: 'prefix-regression'});
const CDC_COVERAGE_INTERNAL_STATE = Object.freeze({
  COMPLETE: 'complete',
  CONFLICT: 'conflict',
  INSTALLED: 'installed',
});
const CDC_CACHE_PUBLICATION_FAILURE =
  'CDC cache publication scheduling failed';
const CDC_COVERAGE_SOURCE_ROLE = 'leader';
const states = new WeakMap();

function newScope() {
  return {coverByTable: new Map(), suffixByTable: new Map(), evidence: null};
}
function stateOf(cache) {
  let value = states.get(cache);
  if (!value) {
    const configured = cache?.cdcCoverageAtomCapacity ?? {};
    value = {scopes: new Map(), maxEpochByTable: new Map(),
      suffixEvents: 0, suffixBytes: 0, limits: {
        maxAtoms: Number.isSafeInteger(configured.maxAtoms) &&
          configured.maxAtoms > 0 ? configured.maxAtoms :
          CDC_COVERAGE_ATOM_BOUND.MAX_ATOMS,
        maxBytes: Number.isSafeInteger(configured.maxBytes) &&
          configured.maxBytes > 0 ? configured.maxBytes :
          CDC_COVERAGE_ATOM_BOUND.MAX_BYTES,
      }};
    states.set(cache, value);
  }
  return value;
}
function scopeOf(state, id, create = false) {
  let value = state.scopes.get(id);
  if (!value && create) {
    value = newScope();
    state.scopes.set(id, value);
  }
  return value ?? newScope();
}
function positionOf(event) {
  return Number.isSafeInteger(event?.sourceLogIndex) && event.sourceLogIndex > 0 &&
    Number.isSafeInteger(event?.sourceOrdinal) && event.sourceOrdinal >= 0 ?
    {logIndex: event.sourceLogIndex, ordinal: event.sourceOrdinal} : null;
}
function inRoutingScope(key, scope) {
  try {
    return (scope.rangeStart == null ||
        compareRoutingKeys(key, scope.rangeStart) >= 0) &&
      (scope.rangeEnd == null || compareRoutingKeys(key, scope.rangeEnd) < 0);
  } catch {
    return false;
  }
}
function routingOverlaps(left, right) {
  try {
    return !((left.rangeEnd != null && right.rangeStart != null &&
        compareRoutingKeys(left.rangeEnd, right.rangeStart) <= 0) ||
      (right.rangeEnd != null && left.rangeStart != null &&
        compareRoutingKeys(right.rangeEnd, left.rangeStart) <= 0));
  } catch {
    return true;
  }
}
function bindingOf(cache, event) {
  if (!cache || !isActiveCdcSourceScopeEvidence(event?.sourceScope)) return null;
  const position = positionOf(event);
  const key = resolveSystemCacheRowKey(event?.tableName, event?.data);
  if (!position || !validCdcCoverageKey(key) ||
      event.sourcePartition !== event.sourceScope.partitionId ||
      event.tableName !== event.sourceScope.tableName ||
      !inRoutingScope(key, event.sourceScope)) return null;
  const state = stateOf(cache);
  return {state, scope: scopeOf(state, event.sourceScope.scopeId),
    scopeId: event.sourceScope.scopeId, sourceScope: event.sourceScope,
    position, key};
}
function hasDurablePosition(event) {
  return (typeof event?.eventKey === 'string' && event.eventKey.length > 0) ||
    event?.sourceLogIndex !== undefined || event?.sourceOrdinal !== undefined;
}
function semanticDigest(event) {
  return digest({tableName: event.tableName, operation: event.operation,
    data: event.data, sourcePartition: event.sourcePartition,
    eventKey: event.eventKey, sourceLogIndex: event.sourceLogIndex,
    sourceOrdinal: event.sourceOrdinal, sourceScope: event.sourceScope});
}
function retainedBytes(event) {
  return Buffer.byteLength(JSON.stringify({tableName: event.tableName,
    operation: event.operation, data: event.data,
    sourcePartition: event.sourcePartition, eventKey: event.eventKey,
    sourceLogIndex: event.sourceLogIndex, sourceOrdinal: event.sourceOrdinal,
    sourceScope: event.sourceScope}));
}
function decision(state, binding, extra = {}) {
  return Object.freeze({state, binding, ...extra});
}
function foreignCoverMatch(binding, tableName) {
  const max = binding.state.maxEpochByTable.get(tableName) ?? null;
  if (max && compareCdcSourceScopeEpoch(binding.sourceScope, max) < 0) {
    return decision(CDC_SOURCE_ORDER.STALE, binding);
  }
  for (const [id, scope] of binding.state.scopes) {
    if (id === binding.scopeId || !scope.evidence ||
        !inRoutingScope(binding.key, scope.evidence)) continue;
    const atom = coveringCoverageAtom(scope.coverByTable.get(tableName) ?? [],
      binding.key);
    if (!atom) continue;
    const compared = compareCdcSourceScopeEpoch(
      scope.evidence, binding.sourceScope);
    if (compared > 0) return decision(CDC_SOURCE_ORDER.STALE, binding);
    if (compared === 0) return decision(CDC_SOURCE_ORDER.CONFLICT, binding);
    return decision(CDC_SOURCE_ORDER.BACKPRESSURE, binding,
      {retryAfterMs: CDC_SOURCE_SUFFIX_BOUND.RETRY_AFTER_MS});
  }
  return null;
}
function invalidBindingDecision(event) {
  return Object.freeze({state: hasDurablePosition(event) ?
    CDC_SOURCE_ORDER.PROVENANCE_INVALID : CDC_SOURCE_ORDER.LEGACY});
}
function retainedSuffixMatch(binding, event) {
  const prior = binding.scope.suffixByTable.get(event.tableName)?.get(binding.key);
  if (!prior) return null;
  const compared = compareFloor(binding.position, prior.position);
  if (compared === 0 && prior.semanticDigest !== semanticDigest(event)) {
    return decision(CDC_SOURCE_ORDER.CONFLICT, binding);
  }
  return compared <= 0 ? decision(CDC_SOURCE_ORDER.STALE, binding) : null;
}
function suffixCapacityDecision(binding, event) {
  const prior = binding.scope.suffixByTable.get(event.tableName)?.get(binding.key);
  const bytes = retainedBytes(event);
  const eventCount = binding.state.suffixEvents + (prior ? 0 : 1);
  const byteCount = binding.state.suffixBytes -
    (prior?.retainedBytes ?? 0) + bytes;
  if (eventCount > CDC_SOURCE_SUFFIX_BOUND.MAX_EVENTS ||
      byteCount > CDC_SOURCE_SUFFIX_BOUND.MAX_BYTES) {
    return decision(CDC_SOURCE_ORDER.BACKPRESSURE, binding,
      {retryAfterMs: CDC_SOURCE_SUFFIX_BOUND.RETRY_AFTER_MS});
  }
  return decision(CDC_SOURCE_ORDER.APPLY, binding, {retainedBytes: bytes});
}
function classifyCdcSourceEvent(projection, event) {
  const binding = bindingOf(projection, event);
  if (!binding) return invalidBindingDecision(event);
  const foreign = foreignCoverMatch(binding, event.tableName);
  if (foreign) return foreign;
  const atom = coveringCoverageAtom(
    binding.scope.coverByTable.get(event.tableName) ?? [], binding.key);
  if (atom && compareFloor(binding.position, atom.floor) <= 0) {
    return decision(CDC_SOURCE_ORDER.COVERED, binding);
  }
  const retained = retainedSuffixMatch(binding, event);
  return retained ?? suffixCapacityDecision(binding, event);
}
function recordCdcSourceEvent(projection, event, outcome) {
  if (outcome?.state !== CDC_SOURCE_ORDER.APPLY) return;
  const {binding, retainedBytes: bytes} = outcome;
  const scope = scopeOf(binding.state, binding.scopeId, true);
  scope.evidence = binding.sourceScope;
  let table = scope.suffixByTable.get(event.tableName);
  if (!table) scope.suffixByTable.set(event.tableName, table = new Map());
  const prior = table.get(binding.key);
  binding.state.suffixEvents += prior ? 0 : 1;
  binding.state.suffixBytes += bytes - (prior?.retainedBytes ?? 0);
  table.set(binding.key, Object.freeze({position: binding.position,
    operation: event.operation, data: projection.deepClone(event.data),
    key: binding.key, retainedBytes: bytes,
    semanticDigest: semanticDigest(event)}));
}
function cloneTombstones(cache) {
  const clone = new SystemTableCacheTombstoneStore(
    cache.getTableNames(), {timeSource: cache.timeSource});
  clone.tables = new Map([...cache.tombstoneStore.tables].map(
    ([name, values]) => [name, new Map([...values].map(
      ([key, value]) => [key, {...value}]))]));
  return clone;
}
function cloneState(current) {
  const scopes = new Map();
  for (const [id, source] of current.scopes) {
    scopes.set(id, {evidence: source.evidence,
      coverByTable: new Map([...source.coverByTable].map(
        ([name, cover]) => [name, [...cover]])),
      suffixByTable: new Map([...source.suffixByTable].map(
        ([name, suffix]) => [name, new Map(suffix)]))});
  }
  return {scopes, maxEpochByTable: new Map(current.maxEpochByTable),
    suffixEvents: current.suffixEvents, suffixBytes: current.suffixBytes,
    limits: current.limits};
}
function stageSuffix(projection, event, outcome, data) {
  const state = cloneState(stateOf(projection));
  const binding = outcome.binding;
  const scope = scopeOf(state, binding.scopeId, true);
  scope.evidence = binding.sourceScope;
  const priorTable = scope.suffixByTable.get(event.tableName);
  const table = new Map(priorTable ?? []);
  const prior = table.get(binding.key);
  table.set(binding.key, Object.freeze({position: binding.position,
    operation: event.operation, data, key: binding.key,
    retainedBytes: outcome.retainedBytes,
    semanticDigest: semanticDigest(event)}));
  scope.suffixByTable.set(event.tableName, table);
  state.suffixEvents += prior ? 0 : 1;
  state.suffixBytes += outcome.retainedBytes - (prior?.retainedBytes ?? 0);
  return state;
}
function publish(cache, values) {
  for (const value of values) {
    try {
      cache.notifyApplyListeners(value.tableName, value.operation,
        value.record, value.metadata);
      cache.notifyListeners(value.tableName, value.operation,
        value.record, value.metadata);
    } catch (error) {
      cache.logger?.warn?.(CDC_CACHE_PUBLICATION_FAILURE,
        {error: error?.message || String(error)});
    }
  }
}
function applyOrderedCdcSourceEvent(projection, event, options = {}) {
  const outcome = classifyCdcSourceEvent(projection, event);
  if (outcome.state !== CDC_SOURCE_ORDER.APPLY) return outcome;
  projection.validateTableName(event.tableName);
  projection.validateOperation(event.operation);
  const key = outcome.binding.key;
  const table = new Map(projection.tables.get(event.tableName));
  const data = projection.deepClone(event.data);
  const record = projection.deepClone(event.operation === CDC_OPERATION.DELETE ?
    table.get(key) ?? data : data);
  if (event.operation === CDC_OPERATION.DELETE) table.delete(key);
  else table.set(key, data);
  const tombstones = cloneTombstones(projection);
  if (event.operation === CDC_OPERATION.DELETE) {
    tombstones.record(event.tableName, key, data);
  } else tombstones.clearKey(event.tableName, key);
  const observation = new Map(
    projection.lastCdcObservationByTableName.get(event.tableName));
  updateCoverageObservation({tableName: event.tableName, key,
    operation: event.operation, data, options, incomingVersionAccepted: true,
    observationTable: observation, resultingRow: table.get(key)});
  const revision = (projection.mutationVersionByTableName.get(
    event.tableName) || 0) + 1;
  const keyRevisions = new Map(
    projection.mutationVersionByTableKey.get(event.tableName));
  keyRevisions.set(key, revision);
  const appliedAt = projection.timeSource.now();
  const causeId = normalizeCauseId(options?.causeId);
  const sourceState = stageSuffix(projection, event, outcome, data);
  projection.tables.set(event.tableName, table);
  projection.tombstoneStore.tables.set(event.tableName,
    tombstones.tables.get(event.tableName));
  projection.lastCdcObservationByTableName.set(event.tableName, observation);
  projection.lastAppliedAtMsByTableName.set(event.tableName, appliedAt);
  projection.lastAppliedCauseIdByTableName.set(event.tableName, causeId);
  projection.mutationVersionByTableName.set(event.tableName, revision);
  projection.mutationVersionByTableKey.set(event.tableName, keyRevisions);
  states.set(projection, sourceState);
  publish(projection, [{tableName: event.tableName, operation: event.operation,
    record, metadata: Object.freeze({causeId, tableMutationRevision: revision})}]);
  return outcome;
}
function cdcSourceEventCapacity(cache, event) {
  if (!cache) return {ready: true};
  const outcome = classifyCdcSourceEvent(cache, event);
  return [CDC_SOURCE_ORDER.BACKPRESSURE, CDC_SOURCE_ORDER.CONFLICT,
    CDC_SOURCE_ORDER.PROVENANCE_INVALID].includes(outcome.state) ?
    {ready: false, reason: outcome.state, retryAfterMs: outcome.retryAfterMs} :
    {ready: true};
}
function validCoverageCell(cell, scope, domain) {
  if (cell?.scopeId !== scope.scopeId || cell?.tableName !== scope.tableName ||
      cell?.domainDigest !== domain.domainDigest) return false;
  if (!validCoverageBounds(cell.lower, cell.upper)) return false;
  return cell.coverageId === cdcCoverageCellId({scopeId: scope.scopeId,
    domainDigest: domain.domainDigest, lower: cell.lower, upper: cell.upper});
}
function validCoverageBounds(lower, upper) {
  if (lower !== null && !validCdcCoverageKey(lower)) return false;
  if (upper !== null && !validCdcCoverageKey(upper)) return false;
  return lower === null || upper === null ||
    compareCdcCoverageKeys(lower, upper) < 0;
}
function validCoveragePrefix(prefix, scope) {
  return prefix?.scopeId === scope.scopeId &&
    prefix?.partitionId === scope.partitionId &&
    /^(0|[1-9][0-9]*)$/.test(prefix.appliedIndex ?? '');
}
function normalizeCoverage(read) {
  const scope = read?.sourceScope;
  if (read?.state !== CDC_COVERAGE_INTERNAL_STATE.COMPLETE ||
      !Array.isArray(read.rows) ||
      !isActiveCdcSourceScopeEvidence(scope)) return null;
  const cell = read.logicalCoverage;
  const domain = resolveCdcCoverageDomain(scope.tableName);
  if (!domain || !validCoverageCell(cell, scope, domain) ||
      !validCoveragePrefix(read.sourcePrefix, scope) ||
      typeof read.sourceLifecycle?.lifecycleIncarnation !== 'string' ||
      read.sourceLifecycle.lifecycleIncarnation.length === 0 ||
      read.sourceLifecycle.role !== CDC_COVERAGE_SOURCE_ROLE) return null;
  const index = BigInt(read.sourcePrefix.appliedIndex);
  return index <= BigInt(Number.MAX_SAFE_INTEGER) ? {sourceScope: scope,
    logicalCoverage: cell, domain,
    floor: {logIndex: Number(index), ordinal: Number.MAX_SAFE_INTEGER}} : null;
}
function authoritativeRows(cache, read, normalized) {
  const rows = [];
  let prior = null;
  for (const row of read.rows) {
    if (!validCdcCoverageRow(normalized.domain, row)) return null;
    const key = resolveSystemCacheRowKey(normalized.sourceScope.tableName, row);
    if (!validCdcCoverageKey(key) || !inRoutingScope(key, normalized.sourceScope) ||
        !keyInCdcCoverageInterval(key, normalized.logicalCoverage.lower,
          normalized.logicalCoverage.upper) ||
        (prior !== null && compareCdcCoverageKeys(prior, key) >= 0)) return null;
    const value = cache.deepClone(row);
    rows.push({key, row: value, rowDigest: digest({key, row: value})});
    prior = key;
  }
  const expected = digest({sourceScope: normalized.sourceScope,
    logicalCoverage: normalized.logicalCoverage,
    sourcePrefix: read.sourcePrefix, sourceLifecycle: read.sourceLifecycle,
    rows: rows.map(({key, rowDigest}) => ({key, rowDigest}))});
  return read.observationDigest === expected ? rows : null;
}
function generationRefusal(state, scope) {
  const max = state.maxEpochByTable.get(scope.tableName) ?? null;
  if (max && compareCdcSourceScopeEpoch(scope, max) < 0) return true;
  for (const [id, other] of state.scopes) {
    if (id !== scope.scopeId && other.evidence &&
        routingOverlaps(scope, other.evidence) &&
        compareCdcSourceScopeEpoch(scope, other.evidence) <= 0) return true;
  }
  return false;
}
function retireSuffix(state, scope, tableName, routingScope, cell, floor, force) {
  const suffix = scope.suffixByTable.get(tableName) ?? new Map();
  let retired = 0;
  for (const [key, event] of suffix) {
    if (inRoutingScope(key, routingScope) &&
        keyInCdcCoverageInterval(key, cell.lower, cell.upper) &&
        (force || compareFloor(event.position, floor) <= 0)) {
      suffix.delete(key); state.suffixEvents -= 1;
      state.suffixBytes -= event.retainedBytes; retired += 1;
    }
  }
  return retired;
}
function scopeRetainsOrderState(scope) {
  for (const cover of scope.coverByTable.values()) {
    if (cover.length > 0) return true;
  }
  for (const suffix of scope.suffixByTable.values()) {
    if (suffix.size > 0) return true;
  }
  return false;
}
function stageCover(current, normalized, incoming) {
  const state = cloneState(current);
  const {sourceScope: scope, logicalCoverage: cell, floor} = normalized;
  const owner = scopeOf(state, scope.scopeId, true);
  owner.evidence = scope;
  const overlaid = overlayCoverageAtoms(
    owner.coverByTable.get(scope.tableName) ?? [], incoming, cell);
  if (overlaid.state !== CDC_COVERAGE_INTERNAL_STATE.INSTALLED) {
    return {state: overlaid.state};
  }
  owner.coverByTable.set(scope.tableName, overlaid.atoms);
  let retired = retireSuffix(state, owner, scope.tableName, scope, cell, floor, false);
  for (const [id, other] of state.scopes) {
    if (id === scope.scopeId || !other.evidence ||
        !routingOverlaps(scope, other.evidence) ||
        compareCdcSourceScopeEpoch(other.evidence, scope) >= 0) continue;
    other.coverByTable.set(scope.tableName, trimCoverageAtomsOutsideCell(
      other.coverByTable.get(scope.tableName) ?? [], cell));
    retired += retireSuffix(state, other, scope.tableName,
      other.evidence, cell, floor, true);
    if (!scopeRetainsOrderState(other)) state.scopes.delete(id);
  }
  const maximum = state.maxEpochByTable.get(scope.tableName);
  if (!maximum || compareCdcSourceScopeEpoch(scope, maximum) > 0) {
    state.maxEpochByTable.set(scope.tableName, scope);
  }
  return {state: CDC_COVERAGE_INTERNAL_STATE.INSTALLED,
    value: state, retired};
}
function capacityAdmits(current, candidate) {
  const oldStats = coverageAtomsStats(current.scopes);
  const newStats = coverageAtomsStats(candidate.scopes);
  return oldStats.atoms + newStats.atoms <= current.limits.maxAtoms &&
    oldStats.bytes + newStats.bytes <= current.limits.maxBytes;
}
function finalCoverageRows(cache, normalized, authoritative, suffix) {
  const {sourceScope: scope, logicalCoverage: cell, floor} = normalized;
  const previous = cache.tables.get(scope.tableName);
  const final = new Map(previous);
  for (const [key, row] of final) {
    const rowKey = resolveSystemCacheRowKey(scope.tableName, row);
    if (validCdcCoverageKey(rowKey) && inRoutingScope(rowKey, scope) &&
        keyInCdcCoverageInterval(rowKey, cell.lower, cell.upper)) final.delete(key);
  }
  for (const value of authoritative) final.set(value.key, value.row);
  for (const event of suffix.values()) {
    if (!inRoutingScope(event.key, scope) ||
        !keyInCdcCoverageInterval(event.key, cell.lower, cell.upper) ||
        compareFloor(event.position, floor) <= 0) continue;
    if (event.operation === CDC_OPERATION.DELETE) final.delete(event.key);
    else final.set(event.key, cache.deepClone(event.data));
  }
  return {previous, final};
}
function changesBetween(previous, final) {
  const changes = [];
  for (const [key, row] of previous) {
    if (!final.has(key)) changes.push({operation: CDC_OPERATION.DELETE, key, row});
  }
  for (const [key, row] of final) {
    if (JSON.stringify(previous.get(key)) !== JSON.stringify(row)) {
      changes.push({operation: CDC_OPERATION.UPSERT, key, row});
    }
  }
  return changes;
}
function coverageInstallPreparation(cache, read) {
  const normalized = normalizeCoverage(read);
  if (!normalized) return {refusal: CDC_COVERAGE_INSTALL_REASON.INCOMPLETE};
  cache.validateTableName(normalized.sourceScope.tableName);
  const authoritative = authoritativeRows(cache, read, normalized);
  if (!authoritative) {
    return {refusal: CDC_COVERAGE_INSTALL_REASON.INVALID_ROW_SET};
  }
  const current = stateOf(cache);
  if (generationRefusal(current, normalized.sourceScope)) {
    return {refusal: CDC_COVERAGE_INSTALL_REASON.GENERATION_NOT_NEWER};
  }
  return {normalized, authoritative, current};
}
function coverageInstallStaging(prepared) {
  const {normalized, authoritative, current} = prepared;
  const atoms = buildCoverageAtoms({scopeId: normalized.sourceScope.scopeId,
    domainDigest: normalized.domain.domainDigest,
    lower: normalized.logicalCoverage.lower,
    upper: normalized.logicalCoverage.upper, floor: normalized.floor,
    rows: authoritative});
  const cover = stageCover(current, normalized, atoms);
  if (cover.state !== CDC_COVERAGE_INTERNAL_STATE.INSTALLED) {
    return {refusal: cover.state === CDC_COVERAGE_INTERNAL_STATE.CONFLICT ?
      CDC_COVERAGE_INSTALL_REASON.PREFIX_CONFLICT :
      CDC_COVERAGE_INSTALL_REASON.PREFIX_STALE};
  }
  if (!capacityAdmits(current, cover.value)) {
    return {refusal: CDC_COVERAGE_INSTALL_REASON.ATOM_CAPACITY,
      deferRetry: true};
  }
  return {...prepared, cover};
}
function stageCoveragePublication(cache, normalized, changes) {
  const tableName = normalized.sourceScope.tableName;
  const tombstones = cloneTombstones(cache);
  let revision = cache.mutationVersionByTableName.get(tableName) || 0;
  const keyRevisions = new Map(cache.mutationVersionByTableKey.get(tableName));
  const emissions = [];
  for (const change of changes) {
    if (change.operation === CDC_OPERATION.DELETE) {
      tombstones.record(tableName, change.key, change.row);
    } else tombstones.clearKey(tableName, change.key);
    revision += 1;
    keyRevisions.set(change.key, revision);
    emissions.push({tableName, operation: change.operation,
      record: cache.deepClone(change.row), metadata: Object.freeze({causeId: null,
        tableMutationRevision: revision,
        cdcCoverageScopeId: normalized.sourceScope.scopeId,
        cdcCoverageAppliedIndex: normalized.floor.logIndex})});
  }
  return {keyRevisions, publications: emissions, revision, tableName,
    tombstones};
}
function installCompleteCdcCoverage(cache, read) {
  const prepared = coverageInstallPreparation(cache, read);
  if (prepared.refusal) {
    return Object.freeze({installed: false,
      reason: prepared.refusal});
  }
  const staged = coverageInstallStaging(prepared);
  if (staged.refusal) {
    return Object.freeze({installed: false,
      reason: staged.refusal, ...(staged.deferRetry ? {deferRetry: true,
        retryAfterMs: CDC_SOURCE_SUFFIX_BOUND.RETRY_AFTER_MS} : {})});
  }
  const {normalized, authoritative, cover} = staged;
  const tableName = normalized.sourceScope.tableName;
  const suffix = cover.value.scopes.get(normalized.sourceScope.scopeId)
    ?.suffixByTable.get(tableName) ?? new Map();
  const {previous, final} = finalCoverageRows(
    cache, normalized, authoritative, suffix);
  const changes = changesBetween(previous, final);
  const publication = stageCoveragePublication(cache, normalized, changes);
  cache.tables.set(tableName, final);
  cache.tombstoneStore.tables.set(tableName,
    publication.tombstones.tables.get(tableName));
  cache.mutationVersionByTableName.set(tableName, publication.revision);
  cache.mutationVersionByTableKey.set(tableName, publication.keyRevisions);
  states.set(cache, cover.value);
  publish(cache, publication.publications);
  return Object.freeze({installed: true, rows: final.size,
    changes: changes.length, retiredSuffixEvents: cover.retired,
    nextPageStart: read.nextPageStart ?? null});
}
function readCdcSourceOrderStats(cache) {
  const state = stateOf(cache);
  const cover = coverageAtomsStats(state.scopes);
  let activeRanges = 0;
  for (const scope of state.scopes.values()) {
    for (const atoms of scope.coverByTable.values()) {
      if (atoms.length > 0) activeRanges += 1;
    }
  }
  return {suffixEvents: state.suffixEvents, suffixBytes: state.suffixBytes,
    scopes: state.scopes.size, floors: cover.atoms,
    activeRanges, coverageAtoms: cover.atoms,
    coverageBytes: cover.bytes};
}

export {CDC_COVERAGE_ATOM_BOUND, CDC_COVERAGE_INSTALL_REASON,
  CDC_SOURCE_ORDER, CDC_SOURCE_SUFFIX_BOUND, cdcSourceEventCapacity,
  applyOrderedCdcSourceEvent, classifyCdcSourceEvent,
  installCompleteCdcCoverage, readCdcSourceOrderStats, recordCdcSourceEvent};
