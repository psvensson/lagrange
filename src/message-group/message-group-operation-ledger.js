import {NUM, TYPEOF} from '../constants/index.js';
import {
  MESSAGE_GROUP_OPERATION_LEDGER,
  MESSAGE_GROUP_OPERATION_LEDGER_NOW,
} from './constants.js';

const MESSAGE_GROUP_OPERATION_LEDGER_NUM = Object.freeze({
  INITIAL_INDEX: NUM.ZERO,
  INITIAL_TERM: NUM.ZERO,
  FIRST_INDEX: NUM.ONE,
});
const MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY = null;

/**
 * Local ledger entry for service-visible message-group operations.
 * This is distinct from the canonical consensus log owned by InMemoryLogAdapter.
 */
class MessageGroupOperationLedgerEntry {
  /**
   * @param {number} term - Observed Raft term at append time.
   * @param {number} index - Monotonic local operation index.
   * @param {Object} data - Stored operation payload.
   * @param {Function} now - Time source.
   */
  constructor(term, index, data, now = MESSAGE_GROUP_OPERATION_LEDGER_NOW) {
    this.term = term;
    this.index = index;
    this.data = data;
    this.timestamp = now();
  }
}

/**
 * Local in-memory ledger for message-group service operations.
 * This is not the shared Raft log implementation; it exists for
 * service status, diagnostics, and compatibility tests only.
 */
class MessageGroupOperationLedger {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Time source for entry timestamps.
   */
  constructor(options = MESSAGE_GROUP_OPERATION_LEDGER.DEFAULT_OPTIONS) {
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      MESSAGE_GROUP_OPERATION_LEDGER_NOW;
    this.log = [];
    this.currentTerm = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_TERM;
    this.votedFor = MESSAGE_GROUP_OPERATION_LEDGER.DEFAULT_VOTED_FOR;
    this.commitIndex = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX;
    this.lastApplied = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX;
  }

  /**
   * @param {Object} data - Entry data.
   * @return {MessageGroupOperationLedgerEntry} Appended entry.
   */
  appendEntry(data) {
    const index = this.log.length +
      MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX;
    const entry = new MessageGroupOperationLedgerEntry(
      this.currentTerm,
      index,
      data,
      this.now,
    );
    this.log.push(entry);
    return entry;
  }

  /**
   * @param {number} startIndex - Starting index (FIRST_INDEX-based).
   * @return {Array<MessageGroupOperationLedgerEntry>} Entries from index.
   */
  getEntriesFrom(startIndex) {
    if (startIndex < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX) {
      return [...this.log];
    }
    return this.log.slice(
      startIndex - MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX,
    );
  }

  /**
   * @return {MessageGroupOperationLedgerEntry|null} Last entry or null.
   */
  getLastEntry() {
    return this.log.length > NUM.ZERO ?
      this.log[this.log.length - NUM.ONE] :
      MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY;
  }

  /**
   * @param {number} index - Log index (FIRST_INDEX-based).
   * @return {MessageGroupOperationLedgerEntry|null} Entry or null.
   */
  getEntry(index) {
    if (index < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX ||
      index > this.log.length) {
      return MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY;
    }
    return this.log[
      index - MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX
    ];
  }

  /**
   * @param {number} fromIndex - Index to truncate from (FIRST_INDEX-based).
   */
  truncateFrom(fromIndex) {
    if (fromIndex >= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX &&
      fromIndex <= this.log.length) {
      this.log = this.log.slice(
        MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX,
        fromIndex - MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX,
      );
    }
  }

  /**
   * @return {number} Number of ledger entries.
   */
  getLogLength() {
    return this.log.length;
  }
}

export {
  MessageGroupOperationLedger,
  MessageGroupOperationLedgerEntry,
};
