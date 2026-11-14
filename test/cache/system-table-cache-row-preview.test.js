// SystemTableCache.previewRowAfterEachChange (quest
// cdc-obligation-range-shipping, supersession record 4, S-11): the cache
// owner answers "the row I would hold for this key after these changes, in
// order" from its own state, without applying them.
//
// Proved here, on real caches only:
// - the answer equals what the cache then does: a twin cache, brought to the
//   same state by the same history on the same clock, really applies the
//   changes one by one, and the row it holds after each equals the preview;
//   literally for each kind of state the apply path reads (the row, a delete
//   tombstone, an authoritative-absence mark, the table's authoritative
//   observation, the clock a tombstone expires on) and over seeded histories;
// - purity: the owner's whole observable state is deep-equal before and after
//   a preview, no listener is notified, nothing is scheduled, and the private
//   copy the preview works on schedules nothing either.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from '../../src/cache/cache-constants.js';
import {getSharedRowReadStats} from
  '../../src/cache/system-table-cache-observation-methods.js';
import {SERVICE_STATUS, TABLES} from '../../src/constants/index.js';

const T = 1789295948000;
const TOMBSTONE_TTL_MS = 30000;
const NODES = TABLES.NODES;
const KEY = 'n1';

function virtualTimeSource(startMs = T) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance(ms) {
      nowMs += ms;
    },
  };
}

// A history step reaches a cache through its public surface.
const cdc = (operation, data) => (cache) => cache.applySystemTableChange(NODES, operation, data);
const authoritativeAbsence = (data, observedAtMs) => (cache) =>
  cache.applySystemTableChange(NODES, 'DELETE', data, {
    mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_ABSENCE_RECONCILIATION,
    authoritativeObservedAtMs: observedAtMs});
const authoritativeObservation = (observedAtMs) => (cache) =>
  cache.recordAuthoritativeObservation(NODES, {observedAtMs});

// Two caches on one clock, brought to the same state by the same history: the
// owner is asked, the twin really applies.
function twins(history, timeSource = virtualTimeSource()) {
  const owner = new SystemTableCache({timeSource});
  const twin = new SystemTableCache({timeSource});
  for (const step of history) {
    if (typeof step === 'number') timeSource.advance(step);
    else for (const cache of [owner, twin]) step(cache);
  }
  return {owner, twin, timeSource};
}

// What the twin holds for the key after really applying each change.
function appliedRows(twin, key, changes) {
  return changes.map((change) => {
    twin.applySystemTableChange(NODES, change.operation, change.data);
    return twin.get(NODES, key) ?? null;
  });
}

// Everything a consumer of the cache can observe, as plain data.
function observableStateOf(cache) {
  const nested = (map) => [...map].map(([name, inner]) => [name, [...inner]]);
  return structuredClone({
    rows: cache.getAllData(),
    tombstones: nested(cache.tombstoneStore.tables),
    lastAuthoritativeObservedAtMs: [...cache.lastAuthoritativeObservedAtMsByTableName],
    lastAuthoritativeObservedCauseId: [...cache.lastAuthoritativeObservedCauseIdByTableName],
    lastAppliedAtMs: [...cache.lastAppliedAtMsByTableName],
    lastAppliedCauseId: [...cache.lastAppliedCauseIdByTableName],
    lastCdcObservation: nested(cache.lastCdcObservationByTableName),
    mutationVersionByTableName: [...cache.mutationVersionByTableName],
    mutationVersionByTableKey: nested(cache.mutationVersionByTableKey),
    tableRevisionWatermarks: cache.getTableRevisionWatermarks(),
    appliedSchemaVersions: [...cache.appliedSchemaVersions],
    epoch: cache.getEpoch(),
    listeners: [cache.listeners.size, cache.applyListeners.size],
  });
}

const row = (fields) => ({node_id: KEY, ...fields});
const change = (operation, fields) => ({operation, data: row(fields)});

// --- literal anchors: one per kind of state the apply path reads ---

const ANCHORS = Object.freeze({
  'the row: an UPDATE merges, an INSERT replaces, a DELETE removes': {
    history: [cdc('INSERT', row({status: 'joining', address: 'a:1', updated_at: 10}))],
    changes: [
      change('UPDATE', {status: SERVICE_STATUS.ACTIVE, updated_at: 20}),
      change('INSERT', {status: 'joining', updated_at: 30}),
      {operation: 'DELETE', data: {node_id: KEY}},
    ],
    rows: [
      row({status: SERVICE_STATUS.ACTIVE, address: 'a:1', updated_at: 20}),
      row({status: 'joining', updated_at: 30}),
      null,
    ],
  },
  'the row: a change older than the row is refused': {
    history: [cdc('INSERT', row({status: SERVICE_STATUS.ACTIVE, updated_at: 30}))],
    changes: [change('UPDATE', {status: 'joining', updated_at: 10})],
    rows: [row({status: SERVICE_STATUS.ACTIVE, updated_at: 30})],
  },
  'a delete tombstone refuses a write older than the delete and admits a newer one': {
    history: [cdc('INSERT', row({status: 'joining', updated_at: 20})),
      cdc('DELETE', {node_id: KEY})],
    changes: [
      change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 10}),
      change('UPDATE', {status: SERVICE_STATUS.ACTIVE, updated_at: 30}),
    ],
    rows: [null, row({status: SERVICE_STATUS.ACTIVE, updated_at: 30})],
  },
  'an authoritative-absence mark refuses a write that does not follow the observation': {
    history: [cdc('INSERT', row({status: 'joining', updated_at: 50})),
      authoritativeAbsence(row({status: 'joining', updated_at: 50}), 100)],
    changes: [
      change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 60}),
      change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 150}),
    ],
    rows: [null, row({status: SERVICE_STATUS.ACTIVE, updated_at: 150})],
  },
  'the table\'s authoritative observation refuses an older write for an absent key': {
    history: [authoritativeObservation(100)],
    changes: [
      change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 60}),
      change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 150}),
    ],
    rows: [null, row({status: SERVICE_STATUS.ACTIVE, updated_at: 150})],
  },
  'a tombstone that expired on the cache clock no longer refuses': {
    history: [cdc('INSERT', row({status: 'joining', updated_at: 20})),
      cdc('DELETE', {node_id: KEY}), TOMBSTONE_TTL_MS + 1],
    changes: [change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 10})],
    rows: [row({status: SERVICE_STATUS.ACTIVE, updated_at: 10})],
  },
  'a tombstone still alive on the cache clock refuses': {
    history: [cdc('INSERT', row({status: 'joining', updated_at: 20})),
      cdc('DELETE', {node_id: KEY}), TOMBSTONE_TTL_MS],
    changes: [change('INSERT', {status: SERVICE_STATUS.ACTIVE, updated_at: 10})],
    rows: [null],
  },
});

for (const [name, anchor] of Object.entries(ANCHORS)) {
  test(`previewRowAfterEachChange, ${name}`, () => {
    const {owner, twin} = twins(anchor.history);
    const before = observableStateOf(owner);
    const preview = owner.previewRowAfterEachChange(NODES, KEY, anchor.changes);
    assert.deepEqual(preview, anchor.rows, 'the literal rows');
    assert.deepEqual(observableStateOf(owner), before, 'the preview changed nothing in the owner');
    assert.deepEqual(preview, appliedRows(twin, KEY, anchor.changes),
      'the preview equals what a cache in the same state holds after really applying');
  });
}

test('previewRowAfterEachChange answers for a key the cache never saw, and for no changes',
  () => {
    const {owner} = twins([]);
    assert.deepEqual(owner.previewRowAfterEachChange(NODES, KEY, []), []);
    assert.deepEqual(owner.previewRowAfterEachChange(NODES, KEY,
      [change('INSERT', {status: 'joining'})]), [row({status: 'joining'})]);
    assert.equal(owner.has(NODES, KEY), false);
    assert.throws(() => owner.previewRowAfterEachChange('no_such_table', KEY, []));
  });

// --- purity ---

// A cache whose notification scheduler is a spy; the private copy a preview
// works on is built by the same constructor, so it carries the spy too.
function spiedCacheClass(scheduled) {
  return class SpiedSystemTableCache extends SystemTableCache {
    constructor(options = {}) {
      super({...options, scheduleCacheChangeNotification: (callback) => {
        scheduled.push(callback);
      }});
    }
  };
}

test('a preview changes nothing observable in the owner: state, tombstones, marks, ' +
  'observation and version records, listeners, notifications, read statistics', () => {
  const scheduled = [];
  const Spied = spiedCacheClass(scheduled);
  const timeSource = virtualTimeSource();
  const owner = new Spied({timeSource});
  const heard = [];
  owner.onCacheChange((...args) => heard.push(['deferred', ...args]));
  owner.onCacheApplyChange((...args) => heard.push(['apply', ...args]));
  // A state with every kind of record the apply path reads: live rows, a
  // delete tombstone, an authoritative-absence mark, an authoritative
  // observation, CDC observations.
  owner.applySystemTableChange(NODES, 'INSERT', row({status: 'joining', updated_at: 20}),
    {cdcObservedAtMs: T, sourceLogIndex: 7});
  owner.applySystemTableChange(NODES, 'INSERT',
    {node_id: 'n2', status: SERVICE_STATUS.ACTIVE, updated_at: 20});
  owner.applySystemTableChange(NODES, 'DELETE', {node_id: 'n2'});
  owner.applySystemTableChange(NODES, 'INSERT', {node_id: 'n3', updated_at: 50});
  authoritativeAbsence({node_id: 'n3', updated_at: 50}, 100)(owner);
  owner.recordAuthoritativeObservation(NODES, {observedAtMs: 90});
  // The tombstones of n2 and n3 are past their lifetime: the owner would evict
  // them on its next write, a preview must not.
  timeSource.advance(TOMBSTONE_TTL_MS + 1);
  scheduled.length = 0;
  heard.length = 0;
  const before = observableStateOf(owner);
  const readStatistics = getSharedRowReadStats();
  const clock = timeSource.now();

  for (const key of [KEY, 'n2', 'n3', 'never-seen']) {
    owner.previewRowAfterEachChange(NODES, key, [
      {operation: 'UPDATE', data: {node_id: key, status: SERVICE_STATUS.ACTIVE, updated_at: 30}},
      {operation: 'DELETE', data: {node_id: key}},
      {operation: 'INSERT', data: {node_id: key, status: 'joining', updated_at: 200}},
    ]);
  }

  assert.deepEqual(observableStateOf(owner), before,
    'rows, tombstones, authoritative marks, observation and version records are unchanged');
  assert.deepEqual(heard, [], 'no listener was notified');
  assert.deepEqual(scheduled, [],
    'nothing was scheduled, by the owner or by the private copy of a preview');
  assert.deepEqual(getSharedRowReadStats(), readStatistics, 'read statistics are unchanged');
  assert.equal(timeSource.now(), clock);
});

// --- the differential over generated histories ---

function generatorOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A history and a list of changes for KEY. Versions are small numbers on the
// same scale as the authoritative observation instants, some older than what
// came before; the clock moves between steps, sometimes past a tombstone's
// lifetime. Described as data so a failure prints it.
function generatedScenario(seed) {
  const random = generatorOf(seed);
  const pick = (values) => values[Math.floor(random() * values.length)];
  let version = 10;
  const write = (key) => {
    version += 10;
    const data = {node_id: key};
    if (random() < 0.7) data.status = pick(['joining', SERVICE_STATUS.ACTIVE]);
    if (random() < 0.8) data.updated_at = random() < 0.25 ? 5 : version;
    if (random() < 0.4) data.last_heartbeat = random() < 0.25 ? 1 : version;
    if (random() < 0.3) data.address = `${key}:${version}`;
    return {kind: 'cdc', operation: pick(['INSERT', 'UPDATE', 'UPDATE']), data};
  };
  const step = () => {
    const key = pick([KEY, KEY, 'other']);
    const kind = pick(['write', 'write', 'write', 'delete', 'absence', 'observation', 'clock']);
    if (kind === 'write') return write(key);
    if (kind === 'delete') return {kind: 'cdc', operation: 'DELETE', data: {node_id: key}};
    if (kind === 'absence') {
      return {kind, data: {node_id: key, updated_at: version}, observedAtMs: version + 5};
    }
    if (kind === 'observation') return {kind, observedAtMs: version + 5};
    return {kind, ms: pick([1, 1000, TOMBSTONE_TTL_MS, TOMBSTONE_TTL_MS + 1])};
  };
  const history = Array.from({length: Math.floor(random() * 7)}, step);
  const changes = Array.from({length: 1 + Math.floor(random() * 5)}, () =>
    random() < 0.2 ? {operation: 'DELETE', data: {node_id: KEY}} : write(KEY))
    .map(({operation, data}) => ({operation, data}));
  return {history, changes};
}

function stepOf(described) {
  if (described.kind === 'cdc') return cdc(described.operation, described.data);
  if (described.kind === 'absence') {
    return authoritativeAbsence(described.data, described.observedAtMs);
  }
  if (described.kind === 'observation') return authoritativeObservation(described.observedAtMs);
  return described.ms;
}

test('seeded differential: over generated histories with rows, delete tombstones, ' +
  'authoritative-absence marks, authoritative observations and a moving clock, the preview ' +
  'equals what the cache then holds, and changes nothing', () => {
  for (let seed = 9001; seed <= 9400; seed += 1) {
    const scenario = generatedScenario(seed);
    const context = `seed ${seed}: ${JSON.stringify(scenario)}`;
    const {owner, twin} = twins(scenario.history.map(stepOf));
    const before = observableStateOf(owner);
    const preview = owner.previewRowAfterEachChange(NODES, KEY, scenario.changes);
    assert.deepEqual(observableStateOf(owner), before, `the owner is unchanged, ${context}`);
    assert.deepEqual(preview, appliedRows(twin, KEY, scenario.changes),
      `preview equals apply, ${context}`);
  }
});
