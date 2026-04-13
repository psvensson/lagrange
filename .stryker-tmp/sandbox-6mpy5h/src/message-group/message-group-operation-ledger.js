// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { NUM, TYPEOF } from '../constants/index.js';
import { MESSAGE_GROUP_OPERATION_LEDGER, MESSAGE_GROUP_OPERATION_LEDGER_NOW } from './constants.js';
const MESSAGE_GROUP_OPERATION_LEDGER_NUM = Object.freeze(stryMutAct_9fa48("86808") ? {} : (stryCov_9fa48("86808"), {
  INITIAL_INDEX: NUM.ZERO,
  INITIAL_TERM: NUM.ZERO,
  FIRST_INDEX: NUM.ONE
}));
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
    if (stryMutAct_9fa48("86809")) {
      {}
    } else {
      stryCov_9fa48("86809");
      this.term = term;
      this.index = index;
      this.data = data;
      this.timestamp = now();
    }
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
    if (stryMutAct_9fa48("86810")) {
      {}
    } else {
      stryCov_9fa48("86810");
      this.now = (stryMutAct_9fa48("86813") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("86812") ? false : stryMutAct_9fa48("86811") ? true : (stryCov_9fa48("86811", "86812", "86813"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : MESSAGE_GROUP_OPERATION_LEDGER_NOW;
      this.maxEntries = (stryMutAct_9fa48("86816") ? Number.isInteger(options.maxEntries) || options.maxEntries > NUM.ZERO : stryMutAct_9fa48("86815") ? false : stryMutAct_9fa48("86814") ? true : (stryCov_9fa48("86814", "86815", "86816"), Number.isInteger(options.maxEntries) && (stryMutAct_9fa48("86819") ? options.maxEntries <= NUM.ZERO : stryMutAct_9fa48("86818") ? options.maxEntries >= NUM.ZERO : stryMutAct_9fa48("86817") ? true : (stryCov_9fa48("86817", "86818", "86819"), options.maxEntries > NUM.ZERO)))) ? options.maxEntries : MESSAGE_GROUP_OPERATION_LEDGER.DEFAULT_MAX_ENTRIES;
      this.log = stryMutAct_9fa48("86820") ? ["Stryker was here"] : (stryCov_9fa48("86820"), []);
      this.currentTerm = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_TERM;
      this.votedFor = MESSAGE_GROUP_OPERATION_LEDGER.DEFAULT_VOTED_FOR;
      this.commitIndex = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX;
      this.lastApplied = MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX;
      this.nextIndex = MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX;
    }
  }

  /**
   * @return {number} First retained index in the bounded ledger.
   * @private
   */
  getFirstRetainedIndex() {
    if (stryMutAct_9fa48("86821")) {
      {}
    } else {
      stryCov_9fa48("86821");
      return (stryMutAct_9fa48("86825") ? this.log.length <= NUM.ZERO : stryMutAct_9fa48("86824") ? this.log.length >= NUM.ZERO : stryMutAct_9fa48("86823") ? false : stryMutAct_9fa48("86822") ? true : (stryCov_9fa48("86822", "86823", "86824", "86825"), this.log.length > NUM.ZERO)) ? this.log[NUM.ZERO].index : this.nextIndex;
    }
  }

  /**
   * Trim retained entries to the configured bounded window.
   * @return {void}
   * @private
   */
  trimRetainedEntries() {
    if (stryMutAct_9fa48("86826")) {
      {}
    } else {
      stryCov_9fa48("86826");
      if (stryMutAct_9fa48("86829") ? !Number.isInteger(this.maxEntries) && this.maxEntries <= NUM.ZERO : stryMutAct_9fa48("86828") ? false : stryMutAct_9fa48("86827") ? true : (stryCov_9fa48("86827", "86828", "86829"), (stryMutAct_9fa48("86830") ? Number.isInteger(this.maxEntries) : (stryCov_9fa48("86830"), !Number.isInteger(this.maxEntries))) || (stryMutAct_9fa48("86833") ? this.maxEntries > NUM.ZERO : stryMutAct_9fa48("86832") ? this.maxEntries < NUM.ZERO : stryMutAct_9fa48("86831") ? false : (stryCov_9fa48("86831", "86832", "86833"), this.maxEntries <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("86834")) {
          {}
        } else {
          stryCov_9fa48("86834");
          return;
        }
      }
      if (stryMutAct_9fa48("86838") ? this.log.length > this.maxEntries : stryMutAct_9fa48("86837") ? this.log.length < this.maxEntries : stryMutAct_9fa48("86836") ? false : stryMutAct_9fa48("86835") ? true : (stryCov_9fa48("86835", "86836", "86837", "86838"), this.log.length <= this.maxEntries)) {
        if (stryMutAct_9fa48("86839")) {
          {}
        } else {
          stryCov_9fa48("86839");
          return;
        }
      }
      this.log = stryMutAct_9fa48("86840") ? this.log : (stryCov_9fa48("86840"), this.log.slice(stryMutAct_9fa48("86841") ? this.log.length + this.maxEntries : (stryCov_9fa48("86841"), this.log.length - this.maxEntries)));
    }
  }

  /**
   * @param {Object} data - Entry data.
   * @return {MessageGroupOperationLedgerEntry} Appended entry.
   */
  appendEntry(data) {
    if (stryMutAct_9fa48("86842")) {
      {}
    } else {
      stryCov_9fa48("86842");
      const index = this.nextIndex;
      const entry = new MessageGroupOperationLedgerEntry(this.currentTerm, index, data, this.now);
      this.log.push(entry);
      stryMutAct_9fa48("86843") ? this.nextIndex -= NUM.ONE : (stryCov_9fa48("86843"), this.nextIndex += NUM.ONE);
      this.trimRetainedEntries();
      return entry;
    }
  }

  /**
   * @param {number} startIndex - Starting index (FIRST_INDEX-based).
   * @return {Array<MessageGroupOperationLedgerEntry>} Entries from index.
   */
  getEntriesFrom(startIndex) {
    if (stryMutAct_9fa48("86844")) {
      {}
    } else {
      stryCov_9fa48("86844");
      if (stryMutAct_9fa48("86848") ? startIndex >= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86847") ? startIndex <= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86846") ? false : stryMutAct_9fa48("86845") ? true : (stryCov_9fa48("86845", "86846", "86847", "86848"), startIndex < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX)) {
        if (stryMutAct_9fa48("86849")) {
          {}
        } else {
          stryCov_9fa48("86849");
          return stryMutAct_9fa48("86850") ? [] : (stryCov_9fa48("86850"), [...this.log]);
        }
      }
      const firstRetainedIndex = this.getFirstRetainedIndex();
      if (stryMutAct_9fa48("86854") ? startIndex > firstRetainedIndex : stryMutAct_9fa48("86853") ? startIndex < firstRetainedIndex : stryMutAct_9fa48("86852") ? false : stryMutAct_9fa48("86851") ? true : (stryCov_9fa48("86851", "86852", "86853", "86854"), startIndex <= firstRetainedIndex)) {
        if (stryMutAct_9fa48("86855")) {
          {}
        } else {
          stryCov_9fa48("86855");
          return stryMutAct_9fa48("86856") ? [] : (stryCov_9fa48("86856"), [...this.log]);
        }
      }
      return stryMutAct_9fa48("86857") ? this.log : (stryCov_9fa48("86857"), this.log.slice(stryMutAct_9fa48("86858") ? startIndex + firstRetainedIndex : (stryCov_9fa48("86858"), startIndex - firstRetainedIndex)));
    }
  }

  /**
   * @return {MessageGroupOperationLedgerEntry|null} Last entry or null.
   */
  getLastEntry() {
    if (stryMutAct_9fa48("86859")) {
      {}
    } else {
      stryCov_9fa48("86859");
      return (stryMutAct_9fa48("86863") ? this.log.length <= NUM.ZERO : stryMutAct_9fa48("86862") ? this.log.length >= NUM.ZERO : stryMutAct_9fa48("86861") ? false : stryMutAct_9fa48("86860") ? true : (stryCov_9fa48("86860", "86861", "86862", "86863"), this.log.length > NUM.ZERO)) ? this.log[stryMutAct_9fa48("86864") ? this.log.length + NUM.ONE : (stryCov_9fa48("86864"), this.log.length - NUM.ONE)] : MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY;
    }
  }

  /**
   * @param {number} index - Log index (FIRST_INDEX-based).
   * @return {MessageGroupOperationLedgerEntry|null} Entry or null.
   */
  getEntry(index) {
    if (stryMutAct_9fa48("86865")) {
      {}
    } else {
      stryCov_9fa48("86865");
      const firstRetainedIndex = this.getFirstRetainedIndex();
      if (stryMutAct_9fa48("86868") ? index < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX && index < firstRetainedIndex : stryMutAct_9fa48("86867") ? false : stryMutAct_9fa48("86866") ? true : (stryCov_9fa48("86866", "86867", "86868"), (stryMutAct_9fa48("86871") ? index >= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86870") ? index <= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86869") ? false : (stryCov_9fa48("86869", "86870", "86871"), index < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX)) || (stryMutAct_9fa48("86874") ? index >= firstRetainedIndex : stryMutAct_9fa48("86873") ? index <= firstRetainedIndex : stryMutAct_9fa48("86872") ? false : (stryCov_9fa48("86872", "86873", "86874"), index < firstRetainedIndex)))) {
        if (stryMutAct_9fa48("86875")) {
          {}
        } else {
          stryCov_9fa48("86875");
          return MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY;
        }
      }
      const offset = stryMutAct_9fa48("86876") ? index + firstRetainedIndex : (stryCov_9fa48("86876"), index - firstRetainedIndex);
      if (stryMutAct_9fa48("86880") ? offset < this.log.length : stryMutAct_9fa48("86879") ? offset > this.log.length : stryMutAct_9fa48("86878") ? false : stryMutAct_9fa48("86877") ? true : (stryCov_9fa48("86877", "86878", "86879", "86880"), offset >= this.log.length)) {
        if (stryMutAct_9fa48("86881")) {
          {}
        } else {
          stryCov_9fa48("86881");
          return MESSAGE_GROUP_OPERATION_LEDGER_NO_ENTRY;
        }
      }
      return this.log[offset];
    }
  }

  /**
   * @param {number} fromIndex - Index to truncate from (FIRST_INDEX-based).
   */
  truncateFrom(fromIndex) {
    if (stryMutAct_9fa48("86882")) {
      {}
    } else {
      stryCov_9fa48("86882");
      if (stryMutAct_9fa48("86886") ? fromIndex >= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86885") ? fromIndex <= MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX : stryMutAct_9fa48("86884") ? false : stryMutAct_9fa48("86883") ? true : (stryCov_9fa48("86883", "86884", "86885", "86886"), fromIndex < MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX)) {
        if (stryMutAct_9fa48("86887")) {
          {}
        } else {
          stryCov_9fa48("86887");
          return;
        }
      }
      const firstRetainedIndex = this.getFirstRetainedIndex();
      const lastRetainedIndex = stryMutAct_9fa48("86888") ? this.nextIndex + NUM.ONE : (stryCov_9fa48("86888"), this.nextIndex - NUM.ONE);
      if (stryMutAct_9fa48("86891") ? this.log.length !== NUM.ZERO : stryMutAct_9fa48("86890") ? false : stryMutAct_9fa48("86889") ? true : (stryCov_9fa48("86889", "86890", "86891"), this.log.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("86892")) {
          {}
        } else {
          stryCov_9fa48("86892");
          this.nextIndex = stryMutAct_9fa48("86893") ? Math.min(MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX, fromIndex) : (stryCov_9fa48("86893"), Math.max(MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX, fromIndex));
          return;
        }
      }
      if (stryMutAct_9fa48("86897") ? fromIndex > firstRetainedIndex : stryMutAct_9fa48("86896") ? fromIndex < firstRetainedIndex : stryMutAct_9fa48("86895") ? false : stryMutAct_9fa48("86894") ? true : (stryCov_9fa48("86894", "86895", "86896", "86897"), fromIndex <= firstRetainedIndex)) {
        if (stryMutAct_9fa48("86898")) {
          {}
        } else {
          stryCov_9fa48("86898");
          this.log = stryMutAct_9fa48("86899") ? ["Stryker was here"] : (stryCov_9fa48("86899"), []);
          this.nextIndex = stryMutAct_9fa48("86900") ? Math.min(MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX, fromIndex) : (stryCov_9fa48("86900"), Math.max(MESSAGE_GROUP_OPERATION_LEDGER_NUM.FIRST_INDEX, fromIndex));
          return;
        }
      }
      if (stryMutAct_9fa48("86904") ? fromIndex > lastRetainedIndex + NUM.ONE : stryMutAct_9fa48("86903") ? fromIndex < lastRetainedIndex + NUM.ONE : stryMutAct_9fa48("86902") ? false : stryMutAct_9fa48("86901") ? true : (stryCov_9fa48("86901", "86902", "86903", "86904"), fromIndex <= (stryMutAct_9fa48("86905") ? lastRetainedIndex - NUM.ONE : (stryCov_9fa48("86905"), lastRetainedIndex + NUM.ONE)))) {
        if (stryMutAct_9fa48("86906")) {
          {}
        } else {
          stryCov_9fa48("86906");
          this.log = stryMutAct_9fa48("86907") ? this.log : (stryCov_9fa48("86907"), this.log.slice(MESSAGE_GROUP_OPERATION_LEDGER_NUM.INITIAL_INDEX, stryMutAct_9fa48("86908") ? fromIndex + firstRetainedIndex : (stryCov_9fa48("86908"), fromIndex - firstRetainedIndex)));
          this.nextIndex = fromIndex;
        }
      }
    }
  }

  /**
   * @return {number} Number of ledger entries.
   */
  getLogLength() {
    if (stryMutAct_9fa48("86909")) {
      {}
    } else {
      stryCov_9fa48("86909");
      return this.log.length;
    }
  }
}
export { MessageGroupOperationLedger, MessageGroupOperationLedgerEntry };