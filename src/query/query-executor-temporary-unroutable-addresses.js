import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  QUERY_DEFAULTS,
  QUERY_EXECUTOR_LITERAL,
  SYSTEM_TABLE_NAMES,
  buildPartitionServiceWitnessFingerprint,
} = QUERY_EXECUTOR_SHARED;

const queryExecutorTemporaryUnroutableAddressMethods = {
  /**
   * Mark one partition service endpoint as temporarily unroutable after a
   * runtime no-handler witness so follow-up calls do not immediately retry the
   * same stale address.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  markTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0 ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === 0
    ) {
      return;
    }
    const expiresAt =
      Date.now() + this.resolveNoHandlerAddressQuarantineMs(partitionId);
    const fingerprint = buildPartitionServiceWitnessFingerprint(service);
    this.recordAddressQuarantineRetryDue(partitionId, expiresAt);
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (existing instanceof Map) {
      existing.set(
        address,
        Object.freeze({
          expiresAt,
          fingerprint,
        }),
      );
      return;
    }
    const addressExpiryMap = new Map();
    addressExpiryMap.set(
      address,
      Object.freeze({
        expiresAt,
        fingerprint,
      }),
    );
    this.temporarilyUnroutableAddressesByPartition.set(
      partitionId,
      addressExpiryMap,
    );
  },

  /**
   * Clear one temporary unroutable endpoint marker after a successful route.
   * @param {string} partitionId
   * @param {string} address
   * @private
   */
  clearTemporarilyUnroutableAddress(partitionId, address) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0 ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === 0
    ) {
      return;
    }
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return;
    }
    existing.delete(address);
    if (existing.size === 0) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
  },

  /**
   * Return true when one partition endpoint is still inside the temporary
   * no-handler quarantine window.
   * @param {string} partitionId
   * @param {string} address
   * @return {boolean}
   * @private
   */
  isTemporarilyUnroutableAddress(partitionId, address, service = null) {
    if (
      typeof partitionId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      partitionId.length === 0 ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === 0
    ) {
      return false;
    }
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return false;
    }
    const entry = existing.get(address);
    const expiresAt = Number.isFinite(entry) ?
      entry :
      Number.isFinite(entry?.expiresAt) ?
        entry.expiresAt :
        null;
    if (!Number.isFinite(expiresAt)) {
      existing.delete(address);
      if (existing.size === 0) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    const currentFingerprint = buildPartitionServiceWitnessFingerprint(service);
    if (
      typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      entry.fingerprint.length > 0 &&
      typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      currentFingerprint.length > 0 &&
      currentFingerprint !== entry.fingerprint
    ) {
      existing.delete(address);
      if (existing.size === 0) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    if (expiresAt > Date.now()) {
      return true;
    }
    existing.delete(address);
    if (existing.size === 0) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
    return false;
  },

  /**
   * Record the instant one address quarantine of a partition ends: the
   * routing owner's retry point for that partition's exclusion.
   * @param {string} partitionId
   * @param {number} expiresAt this owner's clock (Date.now)
   * @private
   */
  recordAddressQuarantineRetryDue(partitionId, expiresAt) {
    const dues = this.addressQuarantineRetryDueAtMsByPartition;
    dues.set(partitionId, [...(dues.get(partitionId) || []), expiresAt]);
  },

  /**
   * The routing owner's stated retry point for one partition: the earliest
   * instant (this owner's clock, Date.now) at which a live address
   * quarantine of it ends, or null when none is live. A quarantine ends by
   * time with no metadata change, so a waiter on metadata alone would miss
   * it; this is the wake a waiter arms. It is never routing authority: at
   * that instant the waiter re-runs its route read, which answers.
   * @param {string} partitionId
   * @return {number|null}
   */
  resolveAddressQuarantineRetryDueAtMs(partitionId) {
    const nowMs = Date.now();
    const dues = this.addressQuarantineRetryDueAtMsByPartition;
    const live = (dues.get(partitionId) || [])
      .filter((dueAtMs) => dueAtMs > nowMs);
    if (live.length === 0) {
      dues.delete(partitionId);
      return null;
    }
    dues.set(partitionId, live);
    return Math.min(...live);
  },

  /**
   * Resolve the quarantine duration for one runtime no-handler witness.
   * Control-plane partitions keep stale addresses shadowed longer so routed
   * writes stop chasing cache rows that lag behind removal/publication.
   * @param {string} partitionId
   * @return {number}
   * @private
   */
  resolveNoHandlerAddressQuarantineMs(partitionId) {
    if (this.noHandlerAddressQuarantineMsExplicit) {
      return this.noHandlerAddressQuarantineMs;
    }
    const tableName = this.resolvePartitionTableName(partitionId);
    if (
      SYSTEM_TABLE_NAMES.has(
        String(tableName || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
      )
    ) {
      return Math.max(
        this.noHandlerAddressQuarantineMs,
        QUERY_DEFAULTS.CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS,
      );
    }
    return this.noHandlerAddressQuarantineMs;
  },
};

function installQueryExecutorTemporaryUnroutableAddressMethods(target) {
  for (const [name, value] of Object.entries(
    queryExecutorTemporaryUnroutableAddressMethods,
  )) {
    Object.defineProperty(target.prototype, name, {
      value,
      configurable: true,
      writable: true,
    });
  }
}

export {installQueryExecutorTemporaryUnroutableAddressMethods};
