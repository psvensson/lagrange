// The partition's committed write traffic: the one counter the managed
// split/merge QPM authority (managed-split-metrics-provider.js) measures.
// It counts every applied data operation of a committed entry - an ordinary
// statement, or each operation of a committed participant decision - after
// the entry's application transaction commits, on every replica alike. It is
// independent of CDC: whether the table records a CDC obligation (owner
// decision D2, cdc-table-policy.js) does not change its traffic.

const PARTITION_WRITE_TRAFFIC_METRIC = Object.freeze({
  COMMITTED_WRITES: 'committedWrites',
});

/** In-memory committed-write counter of one partition service instance. */
class PartitionWriteTraffic {
  constructor() {
    this.committedWrites = 0;
  }

  /**
   * @param {number} operations - Applied data operations of one committed entry.
   */
  record(operations) {
    if (Number.isSafeInteger(operations) && operations > 0) {
      this.committedWrites += operations;
    }
  }

  /** @return {Object} Frozen {committedWrites}. */
  getSnapshot() {
    return Object.freeze({
      [PARTITION_WRITE_TRAFFIC_METRIC.COMMITTED_WRITES]: this.committedWrites,
    });
  }
}

/**
 * Count a committed entry's applied data operations once its application
 * transaction commits (a rolled-back entry counts nothing).
 * @param {Object} service - The partition.
 * @param {Function} afterCommit - The entry's after-commit scheduler.
 * @param {number} operations - Applied data operations.
 */
function recordCommittedWriteTraffic(service, afterCommit, operations) {
  if (operations > 0) afterCommit(() => service.writeTraffic.record(operations));
}

export {
  PARTITION_WRITE_TRAFFIC_METRIC,
  PartitionWriteTraffic,
  recordCommittedWriteTraffic,
};
