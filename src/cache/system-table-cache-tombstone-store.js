import {
  getRecordHlc,
  getRecordTimestamp,
} from './system-table-cache-row-merge.js';

const TOMBSTONE_TTL_MS = 30000;
const TOMBSTONE_MAX_PER_TABLE = 1024;

function versionStampsOf(source) {
  return {
    hlc: getRecordHlc(source),
    updatedAt: getRecordTimestamp(source),
  };
}

function effectiveTimestampOf(stamps) {
  if (Number.isFinite(stamps?.hlc?.physical)) {
    return stamps.hlc.physical;
  }
  return Number.isFinite(stamps?.updatedAt) ? stamps.updatedAt : null;
}

function incomingFollowsAuthoritativeObservation(incoming, tombstone) {
  if (!Number.isFinite(tombstone.authoritativeObservedAtMs)) {
    return false;
  }
  const incomingTimestamp = effectiveTimestampOf(incoming);
  return Number.isFinite(incomingTimestamp) &&
    incomingTimestamp > tombstone.authoritativeObservedAtMs;
}

function writeFollowsAuthoritativeObservation(data, observedAtMs) {
  const incomingTimestamp = effectiveTimestampOf(versionStampsOf(data));
  return Number.isFinite(incomingTimestamp) &&
    incomingTimestamp > observedAtMs;
}

function authoritativeWriteSupersedesTombstone(incoming, tombstone) {
  if (!incomingFollowsAuthoritativeObservation(incoming, tombstone)) {
    return false;
  }
  if (incoming.hlc && tombstone.hlc) {
    return incoming.hlc.compare(tombstone.hlc) > 0;
  }
  const incomingTimestamp = effectiveTimestampOf(incoming);
  const tombstoneTimestamp = effectiveTimestampOf(tombstone);
  return Number.isFinite(incomingTimestamp) &&
    (
      !Number.isFinite(tombstoneTimestamp) ||
      incomingTimestamp > tombstoneTimestamp
    );
}

function completeObservationSupersedesTombstone(observedAtMs, tombstone) {
  if (!Number.isFinite(observedAtMs)) {
    return false;
  }
  const causalBoundaries = [
    effectiveTimestampOf(tombstone),
    tombstone.authoritativeObservedAtMs,
  ].filter((value) => Number.isFinite(value));
  return causalBoundaries.length > 0 &&
    causalBoundaries.every((boundary) => observedAtMs > boundary);
}

/**
 * Whether an incoming write proves that it follows a retained deletion.
 * Ordinary CDC tombstones preserve the equal-millisecond/no-version recreate
 * behavior. Leader-confirmed absence is fail closed when the incoming write
 * cannot establish a later causal version.
 * @param {Object} data
 * @param {Object} tombstone
 * @return {boolean}
 */
function writeSupersedesTombstone(data, tombstone) {
  const incoming = versionStampsOf(data);
  if (tombstone.authoritativeAbsence === true) {
    return authoritativeWriteSupersedesTombstone(incoming, tombstone);
  }
  if (incoming.hlc && tombstone.hlc) {
    return incoming.hlc.compare(tombstone.hlc) > 0;
  }
  if (
    Number.isFinite(incoming.updatedAt) &&
    Number.isFinite(tombstone.updatedAt)
  ) {
    return incoming.updatedAt >= tombstone.updatedAt;
  }
  return true;
}

function maxAuthoritativeObservedAtMs(existing, incoming) {
  const values = [existing?.authoritativeObservedAtMs, Number(incoming)]
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

class SystemTableCacheTombstoneStore {
  /**
   * @param {Array<string>} tableNames
   * @param {Object} [options]
   * @param {Function} [options.onEvict]
   */
  constructor(tableNames, options = {}) {
    this.tables = new Map(tableNames.map((tableName) => [tableName, new Map()]));
    this.onEvict = typeof options.onEvict === 'function' ?
      options.onEvict :
      () => {};
    // The tombstone store is the cache's CHILD, not a time authority. Its
    // deletion instants, TTL and expiry checks are compared against the same
    // physical-time domain as everything else in the authoritative-absence
    // comparison, so it reads the clock its parent was given rather than
    // resolving one of its own. The ambient default keeps every caller that
    // supplies nothing byte-identical.
    this.timeSource = options.timeSource && typeof options.timeSource.now === 'function' ?
      options.timeSource :
      {now: () => Date.now()};
  }

  writeIsFencedByAuthoritativeTableAbsence(
    data,
    keyPresent,
    authoritativeObservedAtMs,
  ) {
    if (keyPresent === true) {
      return false;
    }
    return Number.isFinite(authoritativeObservedAtMs) &&
      !writeFollowsAuthoritativeObservation(data, authoritativeObservedAtMs);
  }

  evict(tableName, tombstoneTable, key) {
    tombstoneTable.delete(key);
    this.onEvict(tableName, key);
  }

  clearKey(tableName, key) {
    const tombstoneTable = this.tables.get(tableName);
    if (tombstoneTable?.has(key)) {
      this.evict(tableName, tombstoneTable, key);
    }
  }

  evictIfExpired(tableName, tombstoneTable, key, tombstone, nowMs) {
    if (nowMs - tombstone.deletedAtMs <= TOMBSTONE_TTL_MS) {
      return false;
    }
    this.evict(tableName, tombstoneTable, key);
    return true;
  }

  prune(tableName, tombstoneTable) {
    const nowMs = this.timeSource.now();
    for (const [key, tombstone] of tombstoneTable) {
      this.evictIfExpired(
        tableName,
        tombstoneTable,
        key,
        tombstone,
        nowMs,
      );
    }
    while (tombstoneTable.size > TOMBSTONE_MAX_PER_TABLE) {
      this.evict(tableName, tombstoneTable, tombstoneTable.keys().next().value);
    }
  }

  record(tableName, key, data, options = {}) {
    const tombstoneTable = this.tables.get(tableName);
    const existing = tombstoneTable?.get(key);
    if (!tombstoneTable) {
      return;
    }
    const authoritativeAbsence = existing?.authoritativeAbsence === true ||
      options.authoritativeAbsence === true;
    const authoritativeObservedAtMs = maxAuthoritativeObservedAtMs(
      existing,
      options.authoritativeObservedAtMs,
    );
    if (existing && !writeSupersedesTombstone(data, existing)) {
      if (options.authoritativeAbsence === true) {
        tombstoneTable.delete(key);
        tombstoneTable.set(key, {
          ...existing,
          deletedAtMs: this.timeSource.now(),
          authoritativeAbsence,
          authoritativeObservedAtMs,
        });
        this.prune(tableName, tombstoneTable);
      }
      return;
    }
    const incoming = versionStampsOf(data);
    tombstoneTable.delete(key);
    tombstoneTable.set(key, {
      hlc: incoming.hlc,
      updatedAt: incoming.updatedAt,
      deletedAtMs: this.timeSource.now(),
      authoritativeAbsence,
      authoritativeObservedAtMs,
    });
    this.prune(tableName, tombstoneTable);
  }

  writeIsFenced(tableName, key, data, options = {}) {
    const tombstoneTable = this.tables.get(tableName);
    const tombstone = tombstoneTable?.get(key);
    if (tombstone && !this.evictIfExpired(
      tableName, tombstoneTable, key, tombstone, this.timeSource.now(),
    )) {
      if (!writeSupersedesTombstone(data, tombstone)) {
        return true;
      }
      this.evict(tableName, tombstoneTable, key);
    }
    return this.writeIsFencedByAuthoritativeTableAbsence(
      data,
      options.keyPresent,
      options.authoritativeObservedAtMs,
    );
  }

  completeObservationWriteIsFenced(
    tableName,
    key,
    observedAtMs,
    readStartedAtMs,
  ) {
    const tombstoneTable = this.tables.get(tableName);
    const tombstone = tombstoneTable?.get(key);
    if (!tombstone || this.evictIfExpired(
      tableName,
      tombstoneTable,
      key,
      tombstone,
      this.timeSource.now(),
    )) {
      return false;
    }
    if (
      !Number.isFinite(readStartedAtMs) ||
      !Number.isFinite(tombstone.deletedAtMs) ||
      tombstone.deletedAtMs >= readStartedAtMs ||
      !completeObservationSupersedesTombstone(observedAtMs, tombstone)
    ) {
      return true;
    }
    this.evict(tableName, tombstoneTable, key);
    return false;
  }

  clear() {
    for (const tombstoneTable of this.tables.values()) {
      tombstoneTable.clear();
    }
  }
}

export {SystemTableCacheTombstoneStore};
