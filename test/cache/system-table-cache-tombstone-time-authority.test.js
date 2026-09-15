// A tombstone's lifetime is measured on the cache's clock.
//
// The tombstone store is a CHILD of SystemTableCache, not a time authority:
// its deletion instant, TTL expiry and prune time are compared inside the same
// authoritative-absence decision as the cache's own watermarks and the row
// timestamps the sweep reads, so they all have to be one physical-time domain.
// Reading the process clock here meant a deterministic node's tombstone aged
// at host speed while everything it was compared against aged at virtual speed.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SystemTableCacheTombstoneStore} from
  '../../src/cache/system-table-cache-tombstone-store.js';
import {TABLES} from '../../src/constants/index.js';

const T = 1789295948000;
const TOMBSTONE_TTL_MS = 30000;

function virtualTimeSource(startMs) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advanceTo(nextMs) {
      nowMs = nextMs;
    },
  };
}

function storeOnClock(timeSource) {
  return new SystemTableCacheTombstoneStore([TABLES.SERVICES], {timeSource});
}

// A later write than the tombstone it meets, so only TTL expiry decides.
function supersedingWrite(updatedAt) {
  return {service_id: 'svc-a', status: 'active', updated_at: updatedAt};
}

test('a tombstone ages on the cache clock, not on the process clock', () => {
  const timeSource = virtualTimeSource(T);
  const store = storeOnClock(timeSource);
  store.record(TABLES.SERVICES, 'svc-a', {service_id: 'svc-a', updated_at: T});
  const tombstone = store.tables.get(TABLES.SERVICES).get('svc-a');
  assert.equal(tombstone.deletedAtMs, T,
    'the deletion instant is the owner clock\'s');

  // At exactly the TTL boundary the tombstone is still alive.
  timeSource.advanceTo(T + TOMBSTONE_TTL_MS);
  assert.equal(
    store.evictIfExpired(TABLES.SERVICES, store.tables.get(TABLES.SERVICES),
      'svc-a', tombstone, timeSource.now()),
    false,
    'not expired at the TTL boundary');

  // One virtual millisecond past it, and only then, it expires.
  timeSource.advanceTo(T + TOMBSTONE_TTL_MS + 1);
  assert.equal(
    store.evictIfExpired(TABLES.SERVICES, store.tables.get(TABLES.SERVICES),
      'svc-a', tombstone, timeSource.now()),
    true,
    'expired one virtual millisecond later');
});

test('fencing follows the same clock through record and prune', () => {
  const timeSource = virtualTimeSource(T);
  const store = storeOnClock(timeSource);
  store.record(TABLES.SERVICES, 'svc-a', {service_id: 'svc-a', updated_at: T});
  assert.equal(store.writeIsFenced(TABLES.SERVICES, 'svc-a',
    supersedingWrite(T - 1000)), true,
  'an older write is fenced while the tombstone is alive');
  timeSource.advanceTo(T + TOMBSTONE_TTL_MS + 1);
  assert.equal(store.writeIsFenced(TABLES.SERVICES, 'svc-a',
    supersedingWrite(T - 1000)), false,
  'and stops being fenced once the owner clock passes the TTL');
});

test('MUTATION: an ambient tombstone clock leaves the comparison domain', () => {
  const timeSource = virtualTimeSource(T);
  const store = storeOnClock(timeSource);
  // The store's clock becomes the process clock, as it was before.
  store.timeSource = {now: () => Date.now()};
  store.record(TABLES.SERVICES, 'svc-a', {service_id: 'svc-a', updated_at: T});
  const tombstone = store.tables.get(TABLES.SERVICES).get('svc-a');
  assert.notEqual(tombstone.deletedAtMs, T,
    'the deletion instant is no longer the owner\'s, so it is no longer ' +
    'comparable with the row and watermark timestamps it is judged against');
});

test('the default store keeps platform time', () => {
  const before = Date.now();
  const store = new SystemTableCacheTombstoneStore([TABLES.SERVICES]);
  store.record(TABLES.SERVICES, 'svc-a', {service_id: 'svc-a', updated_at: 1});
  assert.ok(
    store.tables.get(TABLES.SERVICES).get('svc-a').deletedAtMs >= before,
    'production is unchanged when no clock is supplied');
});
