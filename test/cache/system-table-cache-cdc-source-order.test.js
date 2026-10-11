import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  CDC_SOURCE_ORDER,
  CDC_SOURCE_SUFFIX_BOUND,
  applyOrderedCdcSourceEvent,
  classifyCdcSourceEvent,
  recordCdcSourceEvent,
} from '../../src/cache/system-table-cache-cdc-source-order.js';
import {
  CDC_SOURCE_SCOPE_AUTHORITY,
  buildCdcSourceScopeEvidence,
} from '../../src/partition/partition-cdc-source-coverage.js';
import {digest} from '../../src/utils/canonical-json-data.js';
import {cdcCoverageCellId, resolveCdcCoverageDomain} from
  '../../src/cdc/cdc-coverage-domain.js';
import {NODES_SCHEMA} from
  '../../src/bootstrap/system-table-core-schema-definitions.js';

function scope(version = 1) {
  return buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    partitionDescriptor: {partition_id: 'p-nodes', table_id: 't-nodes',
      partition_version: version, partition_key_start: null,
      partition_key_end: null, state: 'NORMAL'},
    tableDescriptor: {table_id: 't-nodes', table_name: TABLES.NODES,
      active_partition_version: version, pending_partition_version: null,
      partition_transition_state: null,
      partition_transition_generation: version},
  });
}

function event(sourceScope, nodeId, logIndex, ordinal = 0,
  operation = CDC_OPERATION.UPSERT, extra = {}) {
  return {tableName: TABLES.NODES, operation,
    data: {node_id: nodeId, updated_at: 100, hlc_timestamp: '100-0-source',
      ...extra}, timestamp: '100-0-source', sourcePartition: 'p-nodes',
    eventKey: `${nodeId}:${logIndex}:${ordinal}`, sourceLogIndex: logIndex,
    sourceOrdinal: ordinal, sourceScope};
}

function apply(cache, value) {
  return applyOrderedCdcSourceEvent(cache, value);
}

function coverage(sourceScope, appliedIndex, rows, rangeStart = null,
  rangeEnd = null, nextPageStart = null) {
  const domain = resolveCdcCoverageDomain(sourceScope.tableName);
  const logicalCoverage = {scopeId: sourceScope.scopeId,
    tableName: sourceScope.tableName, domainDigest: domain.domainDigest,
    lower: rangeStart, upper: rangeEnd,
    coverageId: cdcCoverageCellId({scopeId: sourceScope.scopeId,
      domainDigest: domain.domainDigest, lower: rangeStart, upper: rangeEnd})};
  const sourcePrefix = {partitionId: sourceScope.partitionId,
    scopeId: sourceScope.scopeId, appliedIndex: String(appliedIndex)};
  const sourceLifecycle = {lifecycleIncarnation: 'source-lifecycle-1',
    role: 'leader'};
  const rowDigests = rows.map((value) => {
    const key = value.node_id;
    return {key, rowDigest: digest({key, row: value})};
  });
  return {state: 'complete', rows, sourceScope, logicalCoverage, sourcePrefix,
    sourceLifecycle,
    observationDigest: digest({sourceScope, logicalCoverage, sourcePrefix,
      sourceLifecycle,
      rows: rowDigests}), nextPageStart};
}

function row(nodeId, updatedAt = 100) {
  return Object.fromEntries(NODES_SCHEMA.columns.map((column) => [column.name,
    column.name === 'node_id' ? nodeId : column.type === 'TEXT' ? '' :
      column.type === 'REAL' ? 0 : updatedAt]));
}

test('C17 source order preserves UPSERT and DELETE suffix across range install', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  apply(cache, event(sourceScope, 'a', 11, 0, CDC_OPERATION.UPSERT,
    {updated_at: 101, marker: 'suffix'}));
  apply(cache, event(sourceScope, 'b', 12, 0, CDC_OPERATION.DELETE));
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT,
    row('b', 99));

  const installed = cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('a', 90), row('b', 90)]));
  t.equal(installed.installed, true, 'complete range installs');
  t.equal(cache.get(TABLES.NODES, 'a').marker, 'suffix',
    'N+1 upsert overlays snapshot N');
  t.equal(cache.has(TABLES.NODES, 'b'), false,
    'N+1 delete remains absent');
  t.end();
});

test('C17 floor subsumes suffix and makes replay a semantic no-op', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  apply(cache, event(sourceScope, 'a', 11, 0, CDC_OPERATION.UPSERT,
    {marker: 'provisional'}));
  const installed = cache.installCompleteCdcCoverage(
    coverage(sourceScope, 11, [row('a', 111)]));
  t.equal(installed.retiredSuffixEvents, 1, 'covered suffix retires');
  t.equal(classifyCdcSourceEvent(cache,
    event(sourceScope, 'a', 11)).state, CDC_SOURCE_ORDER.COVERED,
  'replay at floor is covered');
  t.equal(cache.get(TABLES.NODES, 'a').last_heartbeat, 111,
    'covered replay cannot regress snapshot row');
  t.end();
});

test('C17 source position and ordinal win when HLC is equal', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  apply(cache, event(sourceScope, 'a', 20, 0, CDC_OPERATION.UPSERT,
    {marker: 'first'}));
  apply(cache, event(sourceScope, 'a', 20, 1, CDC_OPERATION.UPSERT,
    {marker: 'second'}));
  const stale = apply(cache,
    event(sourceScope, 'a', 19, 9, CDC_OPERATION.UPSERT, {marker: 'old'}));
  t.equal(stale.state, CDC_SOURCE_ORDER.STALE, 'lower log position is stale');
  t.equal(cache.get(TABLES.NODES, 'a').marker, 'second',
    'higher ordinal at equal HLC wins');
  t.end();
});

test('C17 equal source position refuses contradictory payload bytes', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  apply(cache, event(sourceScope, 'a', 20, 0, CDC_OPERATION.UPSERT,
    {marker: 'first'}));
  const conflict = apply(cache, event(sourceScope, 'a', 20, 0,
    CDC_OPERATION.UPSERT, {marker: 'changed'}));
  t.equal(conflict.state, CDC_SOURCE_ORDER.CONFLICT,
    'same position with changed semantic bytes is contradictory');
  t.equal(cache.get(TABLES.NODES, 'a').marker, 'first',
    'conflicting bytes never mutate cache');
  t.end();
});

test('C17 durable position without valid source provenance is refused', (t) => {
  const cache = new SystemTableCache();
  const incomplete = {...event(scope(), 'a', 2), sourceScope: null};
  t.equal(classifyCdcSourceEvent(cache, incomplete).state,
    CDC_SOURCE_ORDER.PROVENANCE_INVALID,
    'durable identity cannot fall through the legacy lane');
  t.equal(cache.has(TABLES.NODES, 'a'), false, 'refusal mutates nothing');
  const wrongPartition = {...event(scope(), 'a', 2),
    sourcePartition: 'another-partition'};
  t.equal(classifyCdcSourceEvent(cache, wrongPartition).state,
    CDC_SOURCE_ORDER.PROVENANCE_INVALID,
    'durable source partition must match its scope evidence');
  t.end();
});

test('C17 suffix is visible before synchronous cache listeners run', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  let observed = null;
  cache.onCacheApplyChange(() => {
    observed = classifyCdcSourceEvent(cache,
      event(sourceScope, 'a', 4, 0, CDC_OPERATION.UPSERT,
        {marker: 'first'})).state;
  });
  apply(cache, event(sourceScope, 'a', 4, 0, CDC_OPERATION.UPSERT,
    {marker: 'first'}));
  t.equal(observed, CDC_SOURCE_ORDER.STALE,
    'listener sees the retained exact event');
  t.end();
});

test('C17 failed event staging publishes neither row nor suffix', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  const clone = cache.deepClone.bind(cache);
  cache.deepClone = () => {
    throw new Error('planted ordered-event clone failure');
  };
  t.throws(() => apply(cache, event(sourceScope, 'a', 4)));
  cache.deepClone = clone;
  t.equal(cache.has(TABLES.NODES, 'a'), false,
    'failed staging publishes no row');
  t.equal(cache.getCdcSourceOrderStats().suffixEvents, 0,
    'failed staging retains no source suffix');
  t.equal(cache.getTableMutationVersion(TABLES.NODES), 0,
    'failed staging advances no cache revision');
  t.end();
});

test('C17 notification scheduling failure follows atomic publication', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache({
    scheduleCacheChangeNotification: () => {
      throw new Error('planted notification scheduling failure');
    },
  });
  cache.onCacheChange(() => {});
  const accepted = apply(cache, event(sourceScope, 'a', 4));
  t.equal(accepted.state, CDC_SOURCE_ORDER.APPLY, 'event remains accepted');
  t.equal(cache.has(TABLES.NODES, 'a'), true,
    'row is published before notification scheduling');
  t.equal(classifyCdcSourceEvent(cache,
    event(sourceScope, 'a', 4)).state, CDC_SOURCE_ORDER.STALE,
  'source suffix is published in the same commit');
  t.equal(cache.getTableMutationVersion(TABLES.NODES), 1,
    'cache revision is published in the same commit');
  t.end();
});

test('C17 partial or unproven row sets never mint a floor', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  const malformed = coverage(sourceScope, 10, [row('z')], 'a', 'm');
  t.equal(cache.installCompleteCdcCoverage(malformed).installed, false,
    'row outside claimed complete range is refused');
  const missingAuthority = {...coverage(sourceScope, 10, []), sourceScope: null};
  t.equal(cache.installCompleteCdcCoverage(missingAuthority).installed, false,
    'missing source evidence is refused');
  const missingLifecycle = {...coverage(sourceScope, 10, []),
    sourceLifecycle: null};
  t.equal(cache.installCompleteCdcCoverage(missingLifecycle).installed, false,
    'missing source lifecycle receipt is refused');
  t.equal(apply(cache, event(sourceScope, 'a', 9)).state,
    CDC_SOURCE_ORDER.APPLY, 'refusal created no floor');
  t.end();
});

test('C17 hostile coverage rows cannot run accessors or mint absence', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  let getterReads = 0;
  const hostile = row('a');
  Object.defineProperty(hostile, 'node_id', {enumerable: true,
    get() {
      getterReads += 1;
      return 'a';
    }});
  const claimed = {...coverage(sourceScope, 10, [row('a')]), rows: [hostile]};
  const refused = cache.installCompleteCdcCoverage(claimed);
  t.equal(refused.installed, false);
  t.equal(refused.reason, 'invalid-row-set');
  t.equal(getterReads, 0, 'coverage validation never invokes hostile getters');
  t.equal(apply(cache, event(sourceScope, 'a', 9)).state,
    CDC_SOURCE_ORDER.APPLY, 'hostile row minted no floor');
  t.end();
});

test('C17 bounded pages cover only their own logical ranges', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('b')], 'a', 'm', 'm'));
  t.equal(classifyCdcSourceEvent(cache, event(sourceScope, 'b', 9)).state,
    CDC_SOURCE_ORDER.COVERED, 'event inside page is covered');
  t.equal(classifyCdcSourceEvent(cache, event(sourceScope, 'z', 9)).state,
    CDC_SOURCE_ORDER.APPLY, 'event outside page remains owed');
  t.end();
});

test('C17 newer generation page fences only its covered range', (t) => {
  const oldScope = scope(1);
  const newScope = scope(2);
  const cache = new SystemTableCache();
  cache.installCompleteCdcCoverage(coverage(oldScope, 100,
    [row('b'), row('z')], null, null));
  cache.installCompleteCdcCoverage(coverage(newScope, 2,
    [row('b', 200)], 'a', 'm', 'm'));
  t.equal(classifyCdcSourceEvent(cache, event(oldScope, 'b', 101)).state,
    CDC_SOURCE_ORDER.STALE, 'old generation is fenced in replaced range');
  t.equal(classifyCdcSourceEvent(cache, event(newScope, 'z', 3)).state,
    CDC_SOURCE_ORDER.BACKPRESSURE,
    'new generation cannot cross an uncovered old range');
  t.equal(cache.get(TABLES.NODES, 'z').last_heartbeat, 100,
    'uncovered range remains unchanged');
  const older = cache.installCompleteCdcCoverage(coverage(oldScope, 101,
    [row('b', 50)], 'a', 'm', 'm'));
  t.equal(older.reason, 'cdc_coverage_generation_not_newer',
    'later arriving old scope cannot supersede current authority');
  t.equal(cache.get(TABLES.NODES, 'b').last_heartbeat, 200,
    'refused generation mutates nothing');
  t.end();
});

test('C17 fully superseded scope metadata is retired', (t) => {
  const cache = new SystemTableCache();
  for (let version = 1; version <= 20; version += 1) {
    const sourceScope = scope(version);
    const installed = cache.installCompleteCdcCoverage(
      coverage(sourceScope, version, [row('a', version)]));
    t.equal(installed.installed, true, `generation ${version} installs`);
  }
  const stats = cache.getCdcSourceOrderStats();
  t.equal(stats.scopes, 1,
    'fully replaced generations do not append volatile scope metadata');
  t.equal(stats.activeRanges, 1, 'only current range authority remains');
  t.end();
});

test('C17 repeated hydration replaces floor and active range metadata', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  for (let index = 1; index <= 20; index += 1) {
    cache.installCompleteCdcCoverage(coverage(sourceScope, index,
      [row('a', index)]));
  }
  const stats = cache.getCdcSourceOrderStats();
  t.equal(stats.floors, 3,
    'exact one-row range retains one key and two absence atoms');
  t.equal(stats.activeRanges, 1, 'exact range retains one active authority');
  t.end();
});

test('C17 failed coverage staging preserves the previous table and floor', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT,
    {...row('old'), marker: 'old'});
  const clone = cache.deepClone.bind(cache);
  cache.deepClone = () => {
    throw new Error('planted clone failure');
  };
  t.throws(() => cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('new')])));
  cache.deepClone = clone;
  t.equal(cache.get(TABLES.NODES, 'old').marker, 'old',
    'old table image survives failed staging');
  t.equal(classifyCdcSourceEvent(cache, event(sourceScope, 'new', 9)).state,
    CDC_SOURCE_ORDER.APPLY, 'failed staging published no floor');
  t.end();
});

test('C17 hydration floor survives volatile handler dedup reset by reinstall', (t) => {
  const sourceScope = scope();
  const cacheAfterRestart = new SystemTableCache();
  cacheAfterRestart.installCompleteCdcCoverage(
    coverage(sourceScope, 30, [row('a', 300)]));
  t.equal(classifyCdcSourceEvent(cacheAfterRestart,
    event(sourceScope, 'a', 29)).state, CDC_SOURCE_ORDER.COVERED,
  'fresh volatile owner uses rehydrated source prefix');
  t.end();
});

test('C17 suffix capacity refuses before accepting an unretained event', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  for (let index = 0; index < CDC_SOURCE_SUFFIX_BOUND.MAX_EVENTS; index += 1) {
    const value = event(sourceScope, `n-${index}`, index + 1);
    const decision = classifyCdcSourceEvent(cache, value);
    recordCdcSourceEvent(cache, value, decision);
  }
  const refused = classifyCdcSourceEvent(cache,
    event(sourceScope, 'overflow', CDC_SOURCE_SUFFIX_BOUND.MAX_EVENTS + 1));
  t.equal(refused.state, CDC_SOURCE_ORDER.BACKPRESSURE,
    'next event is refused at exact count bound');
  t.equal(cache.getCdcSourceOrderStats().suffixEvents,
    CDC_SOURCE_SUFFIX_BOUND.MAX_EVENTS, 'no event was dropped');
  t.end();
});

test('C17 moving page boundaries replace only their newer interval', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('b')], 'a', 'm', 'm'));
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 11, [row('c', 110)], 'a', 'h', 'h'));
  t.equal(classifyCdcSourceEvent(cache,
    event(sourceScope, 'i', 10)).state, CDC_SOURCE_ORDER.COVERED,
  'unreplaced right tail retains its N=10 absence atom');
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 11, [], 'h', 'm', 'm'));
  t.equal(classifyCdcSourceEvent(cache,
    event(sourceScope, 'i', 10)).state, CDC_SOURCE_ORDER.COVERED,
  'second page advances the right tail to N=11');
  const late = cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('b', 1)], 'a', 'm', 'm'));
  t.equal(late.reason, 'prefix-regression', 'late old page is stale as a unit');
  t.equal(cache.has(TABLES.NODES, 'b'), false,
    'late page cannot resurrect a row removed by newer absence');
  t.end();
});

test('C17 equal-prefix row versus absence bytes are contradictory', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache();
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('b')], 'a', 'm', 'm'));
  const conflict = cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [], 'a', 'm', 'm'));
  t.equal(conflict.reason, 'prefix-conflict',
    'equal N cannot reinterpret a present key as absence');
  t.equal(cache.has(TABLES.NODES, 'b'), true,
    'contradictory observation leaves the prior image intact');
  t.end();
});

test('C17 identical nonempty page replay is idempotent at the same prefix',
  (t) => {
    const sourceScope = scope();
    const cache = new SystemTableCache();
    const page = coverage(sourceScope, 10, [row('a')]);
    const first = cache.installCompleteCdcCoverage(page);
    const replay = cache.installCompleteCdcCoverage(page);
    t.equal(first.installed, true, 'initial exact page installs');
    t.equal(replay.installed, true,
      'the open absence atom after the row does not overlap that row');
    t.equal(replay.changes, 0, 'same prefix and bytes publish no new change');
    t.equal(cache.has(TABLES.NODES, 'a'), true,
      'idempotent replay retains the witnessed row');
    t.end();
  });

test('C17 atom capacity refusal preserves old cover and cache image', (t) => {
  const sourceScope = scope();
  const cache = new SystemTableCache({
    cdcCoverageAtomCapacity: {maxAtoms: 5, maxBytes: 1024 * 1024},
  });
  cache.installCompleteCdcCoverage(
    coverage(sourceScope, 10, [row('b')], 'a', 'm', 'm'));
  const refused = cache.installCompleteCdcCoverage(
    coverage(sourceScope, 11, [row('c')], 'a', 'm', 'm'));
  t.equal(refused.reason, 'cdc_coverage_atom_capacity_unavailable');
  t.equal(refused.deferRetry, true, 'capacity refusal retains recoverable debt');
  t.equal(cache.has(TABLES.NODES, 'b'), true,
    'old row survives candidate-capacity refusal');
  t.equal(classifyCdcSourceEvent(cache,
    event(sourceScope, 'b', 10)).state, CDC_SOURCE_ORDER.COVERED,
  'old atom survives candidate-capacity refusal');
  t.end();
});
