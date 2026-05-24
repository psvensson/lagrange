import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  NUM,
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
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return;
    }
    const expiresAt =
      Date.now() + this.resolveNoHandlerAddressQuarantineMs(partitionId);
    const fingerprint = buildPartitionServiceWitnessFingerprint(service);
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
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
    ) {
      return;
    }
    const existing =
      this.temporarilyUnroutableAddressesByPartition.get(partitionId);
    if (!(existing instanceof Map)) {
      return;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
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
      partitionId.length === NUM.ZERO ||
      typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
      address.length === NUM.ZERO
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
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    const currentFingerprint = buildPartitionServiceWitnessFingerprint(service);
    if (
      typeof entry?.fingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      entry.fingerprint.length > NUM.ZERO &&
      typeof currentFingerprint === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      currentFingerprint.length > NUM.ZERO &&
      currentFingerprint !== entry.fingerprint
    ) {
      existing.delete(address);
      if (existing.size === NUM.ZERO) {
        this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
      }
      return false;
    }
    if (expiresAt > Date.now()) {
      return true;
    }
    existing.delete(address);
    if (existing.size === NUM.ZERO) {
      this.temporarilyUnroutableAddressesByPartition.delete(partitionId);
    }
    return false;
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
