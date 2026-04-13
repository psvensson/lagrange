/**
 * CDCEventBuffer — bounded in-memory buffer for CDC events generated
 * before CDC subscribers are registered.
 *
 * Captures events at the generation site (PartitionService) when no
 * subscribers exist, and replays them in order once subscriptions
 * activate. Deduplicates on replay using event identity
 * (tableName + operation + primary key + timestamp).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 *
 * @module partition/cdc-event-buffer
 */
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
import { LoggingService } from '../logging/logging-service.js';
import { NUM } from '../constants/index.js';
import { CDC_EVENT_BUFFER_CAPACITY, CDC_EVENT_SLIDING_WINDOW_CAPACITY, CDC_LIFECYCLE_LOG_MSG } from '../constants/cdc-lifecycle-constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../cache/system-cache-key-descriptor.js';
import { isTableInternalCachePropagationEnabled } from '../cache/cdc-table-policy.js';
const BUFFER_SUBSYSTEM = stryMutAct_9fa48("97221") ? "" : (stryCov_9fa48("97221"), 'CDCEventBuffer');

/**
 * Build a deduplication identity string for a CDC event.
 * Uses tableName + operation + primary key value + timestamp.
 *
 * @param {Object} cdcEvent - CDC event object.
 * @return {string} Identity string for deduplication.
 */
function buildEventIdentity(cdcEvent) {
  if (stryMutAct_9fa48("97222")) {
    {}
  } else {
    stryCov_9fa48("97222");
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(cdcEvent.tableName);
    const pkValue = cdcEvent.data ? cdcEvent.data[pkField] : stryMutAct_9fa48("97223") ? "Stryker was here!" : (stryCov_9fa48("97223"), '');
    return stryMutAct_9fa48("97224") ? `` : (stryCov_9fa48("97224"), `${cdcEvent.tableName}:${cdcEvent.operation}:${pkValue}:${cdcEvent.timestamp}`);
  }
}

/**
 * Build a coalescing identity for internal cache propagation tables.
 * Falls back to null when the event cannot be safely coalesced.
 *
 * @param {Object} cdcEvent - CDC event object.
 * @return {string|null} Coalescing identity or null.
 */
function buildInternalCoalescingIdentity(cdcEvent) {
  if (stryMutAct_9fa48("97225")) {
    {}
  } else {
    stryCov_9fa48("97225");
    if (stryMutAct_9fa48("97228") ? false : stryMutAct_9fa48("97227") ? true : stryMutAct_9fa48("97226") ? isTableInternalCachePropagationEnabled(cdcEvent?.tableName) : (stryCov_9fa48("97226", "97227", "97228"), !isTableInternalCachePropagationEnabled(stryMutAct_9fa48("97229") ? cdcEvent.tableName : (stryCov_9fa48("97229"), cdcEvent?.tableName)))) {
      if (stryMutAct_9fa48("97230")) {
        {}
      } else {
        stryCov_9fa48("97230");
        return null;
      }
    }
    const pkField = getSystemCachePrimaryKeyFieldOrFallback(cdcEvent.tableName);
    if (stryMutAct_9fa48("97233") ? !cdcEvent?.data && !Object.prototype.hasOwnProperty.call(cdcEvent.data, pkField) : stryMutAct_9fa48("97232") ? false : stryMutAct_9fa48("97231") ? true : (stryCov_9fa48("97231", "97232", "97233"), (stryMutAct_9fa48("97234") ? cdcEvent?.data : (stryCov_9fa48("97234"), !(stryMutAct_9fa48("97235") ? cdcEvent.data : (stryCov_9fa48("97235"), cdcEvent?.data)))) || (stryMutAct_9fa48("97236") ? Object.prototype.hasOwnProperty.call(cdcEvent.data, pkField) : (stryCov_9fa48("97236"), !Object.prototype.hasOwnProperty.call(cdcEvent.data, pkField))))) {
      if (stryMutAct_9fa48("97237")) {
        {}
      } else {
        stryCov_9fa48("97237");
        return null;
      }
    }
    return stryMutAct_9fa48("97238") ? `` : (stryCov_9fa48("97238"), `${cdcEvent.tableName}:${pkField}:${cdcEvent.data[pkField]}`);
  }
}

/**
 * CDCEventBuffer captures CDC events in a bounded in-memory buffer
 * when no CDC subscribers are registered. Events are replayed in
 * generation order once subscriptions activate.
 */
class CDCEventBuffer {
  /**
   * @param {Object} options
   * @param {number} [options.capacity] — max buffered events
   * @param {Object} [options.logger] — logger instance
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("97239")) {
      {}
    } else {
      stryCov_9fa48("97239");
      this.capacity = stryMutAct_9fa48("97242") ? options.capacity && CDC_EVENT_BUFFER_CAPACITY : stryMutAct_9fa48("97241") ? false : stryMutAct_9fa48("97240") ? true : (stryCov_9fa48("97240", "97241", "97242"), options.capacity || CDC_EVENT_BUFFER_CAPACITY);
      this.slidingWindowCapacity = stryMutAct_9fa48("97245") ? options.slidingWindowCapacity && CDC_EVENT_SLIDING_WINDOW_CAPACITY : stryMutAct_9fa48("97244") ? false : stryMutAct_9fa48("97243") ? true : (stryCov_9fa48("97243", "97244", "97245"), options.slidingWindowCapacity || CDC_EVENT_SLIDING_WINDOW_CAPACITY);
      const loggingService = LoggingService.getInstance();
      this.logger = stryMutAct_9fa48("97248") ? options.logger && (loggingService.isInitialized() ? loggingService.forSubsystem(BUFFER_SUBSYSTEM) : console) : stryMutAct_9fa48("97247") ? false : stryMutAct_9fa48("97246") ? true : (stryCov_9fa48("97246", "97247", "97248"), options.logger || (loggingService.isInitialized() ? loggingService.forSubsystem(BUFFER_SUBSYSTEM) : console));
      this.events = stryMutAct_9fa48("97249") ? ["Stryker was here"] : (stryCov_9fa48("97249"), []);
      this.recentEvents = stryMutAct_9fa48("97250") ? ["Stryker was here"] : (stryCov_9fa48("97250"), []);
      this.recentEventsHead = NUM.ZERO;
    }
  }

  /**
   * Buffer a CDC event when no subscribers are present.
   * Drops the oldest event when capacity is exceeded.
   *
   * @param {Object} cdcEvent - CDC event to buffer.
   * @return {boolean} true if buffered, false if an event was dropped.
   */
  buffer(cdcEvent) {
    if (stryMutAct_9fa48("97251")) {
      {}
    } else {
      stryCov_9fa48("97251");
      const coalescingIdentity = buildInternalCoalescingIdentity(cdcEvent);
      if (stryMutAct_9fa48("97253") ? false : stryMutAct_9fa48("97252") ? true : (stryCov_9fa48("97252", "97253"), coalescingIdentity)) {
        if (stryMutAct_9fa48("97254")) {
          {}
        } else {
          stryCov_9fa48("97254");
          const compactedEvents = stryMutAct_9fa48("97255") ? this.events : (stryCov_9fa48("97255"), this.events.filter(stryMutAct_9fa48("97256") ? () => undefined : (stryCov_9fa48("97256"), bufferedEvent => stryMutAct_9fa48("97259") ? buildInternalCoalescingIdentity(bufferedEvent) === coalescingIdentity : stryMutAct_9fa48("97258") ? false : stryMutAct_9fa48("97257") ? true : (stryCov_9fa48("97257", "97258", "97259"), buildInternalCoalescingIdentity(bufferedEvent) !== coalescingIdentity))));
          if (stryMutAct_9fa48("97262") ? compactedEvents.length === this.events.length : stryMutAct_9fa48("97261") ? false : stryMutAct_9fa48("97260") ? true : (stryCov_9fa48("97260", "97261", "97262"), compactedEvents.length !== this.events.length)) {
            if (stryMutAct_9fa48("97263")) {
              {}
            } else {
              stryCov_9fa48("97263");
              compactedEvents.push(cdcEvent);
              this.events = compactedEvents;
              return stryMutAct_9fa48("97264") ? false : (stryCov_9fa48("97264"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("97268") ? this.events.length < this.capacity : stryMutAct_9fa48("97267") ? this.events.length > this.capacity : stryMutAct_9fa48("97266") ? false : stryMutAct_9fa48("97265") ? true : (stryCov_9fa48("97265", "97266", "97267", "97268"), this.events.length >= this.capacity)) {
        if (stryMutAct_9fa48("97269")) {
          {}
        } else {
          stryCov_9fa48("97269");
          const dropped = this.events.shift();
          this.logger.warn(CDC_LIFECYCLE_LOG_MSG.EVENT_DROPPED_OVERFLOW, stryMutAct_9fa48("97270") ? {} : (stryCov_9fa48("97270"), {
            droppedCount: NUM.ONE,
            bufferCapacity: this.capacity,
            tableName: dropped.tableName,
            operation: dropped.operation
          }));
          this.events.push(cdcEvent);
          return stryMutAct_9fa48("97271") ? true : (stryCov_9fa48("97271"), false);
        }
      }
      this.events.push(cdcEvent);
      return stryMutAct_9fa48("97272") ? false : (stryCov_9fa48("97272"), true);
    }
  }

  /**
   * Replay all buffered events to the given subscriber callback.
   * Deduplicates events using event identity. Clears the buffer
   * after replay.
   *
   * @param {Function} subscriber — async (cdcEvent) => void
   * @param {Set<string>} [deliveredIdentities] — identities already
   *   delivered through the normal subscription path
   * @return {Promise<number>} count of replayed events
   */
  async replay(subscriber, deliveredIdentities) {
    if (stryMutAct_9fa48("97273")) {
      {}
    } else {
      stryCov_9fa48("97273");
      const seen = stryMutAct_9fa48("97276") ? deliveredIdentities && new Set() : stryMutAct_9fa48("97275") ? false : stryMutAct_9fa48("97274") ? true : (stryCov_9fa48("97274", "97275", "97276"), deliveredIdentities || new Set());
      const eventsToReplay = stryMutAct_9fa48("97277") ? this.events : (stryCov_9fa48("97277"), this.events.slice());
      this.events = stryMutAct_9fa48("97278") ? ["Stryker was here"] : (stryCov_9fa48("97278"), []);
      let replayedCount = NUM.ZERO;
      for (let index = NUM.ZERO; stryMutAct_9fa48("97281") ? index >= eventsToReplay.length : stryMutAct_9fa48("97280") ? index <= eventsToReplay.length : stryMutAct_9fa48("97279") ? false : (stryCov_9fa48("97279", "97280", "97281"), index < eventsToReplay.length); stryMutAct_9fa48("97282") ? index-- : (stryCov_9fa48("97282"), index++)) {
        if (stryMutAct_9fa48("97283")) {
          {}
        } else {
          stryCov_9fa48("97283");
          const cdcEvent = eventsToReplay[index];
          const identity = buildEventIdentity(cdcEvent);
          if (stryMutAct_9fa48("97285") ? false : stryMutAct_9fa48("97284") ? true : (stryCov_9fa48("97284", "97285"), seen.has(identity))) {
            if (stryMutAct_9fa48("97286")) {
              {}
            } else {
              stryCov_9fa48("97286");
              continue;
            }
          }
          seen.add(identity);
          try {
            if (stryMutAct_9fa48("97287")) {
              {}
            } else {
              stryCov_9fa48("97287");
              await subscriber(cdcEvent);
              stryMutAct_9fa48("97288") ? replayedCount-- : (stryCov_9fa48("97288"), replayedCount++);
            }
          } catch (error) {
            if (stryMutAct_9fa48("97289")) {
              {}
            } else {
              stryCov_9fa48("97289");
              // Preserve the failed event and any remaining tail for the next replay.
              // This prevents silent CDC loss when a subscriber fails transiently.
              seen.delete(identity);
              this.events = stryMutAct_9fa48("97290") ? eventsToReplay.concat(this.events) : (stryCov_9fa48("97290"), eventsToReplay.slice(index).concat(this.events));
              throw error;
            }
          }
        }
      }
      return replayedCount;
    }
  }

  /**
   * @return {number} current buffer size
   */
  size() {
    if (stryMutAct_9fa48("97291")) {
      {}
    } else {
      stryCov_9fa48("97291");
      return this.events.length;
    }
  }

  /**
   * @return {boolean} true if buffer has events
   */
  hasEvents() {
    if (stryMutAct_9fa48("97292")) {
      {}
    } else {
      stryCov_9fa48("97292");
      return stryMutAct_9fa48("97296") ? this.events.length <= NUM.ZERO : stryMutAct_9fa48("97295") ? this.events.length >= NUM.ZERO : stryMutAct_9fa48("97294") ? false : stryMutAct_9fa48("97293") ? true : (stryCov_9fa48("97293", "97294", "97295", "97296"), this.events.length > NUM.ZERO);
    }
  }

  /**
   * Clear all buffered events and the sliding window.
   */
  clear() {
    if (stryMutAct_9fa48("97297")) {
      {}
    } else {
      stryCov_9fa48("97297");
      this.events = stryMutAct_9fa48("97298") ? ["Stryker was here"] : (stryCov_9fa48("97298"), []);
      this.clearRecentEvents();
    }
  }

  /**
   * Record a successfully delivered CDC event in the bounded sliding
   * window. Uses a circular array: pushes when not full, overwrites
   * the oldest entry and advances the head pointer when full.
   *
   * @param {Object} cdcEvent - CDC event to record.
   */
  recordDelivered(cdcEvent) {
    if (stryMutAct_9fa48("97299")) {
      {}
    } else {
      stryCov_9fa48("97299");
      if (stryMutAct_9fa48("97303") ? this.recentEvents.length >= this.slidingWindowCapacity : stryMutAct_9fa48("97302") ? this.recentEvents.length <= this.slidingWindowCapacity : stryMutAct_9fa48("97301") ? false : stryMutAct_9fa48("97300") ? true : (stryCov_9fa48("97300", "97301", "97302", "97303"), this.recentEvents.length < this.slidingWindowCapacity)) {
        if (stryMutAct_9fa48("97304")) {
          {}
        } else {
          stryCov_9fa48("97304");
          this.recentEvents.push(cdcEvent);
        }
      } else {
        if (stryMutAct_9fa48("97305")) {
          {}
        } else {
          stryCov_9fa48("97305");
          this.recentEvents[this.recentEventsHead] = cdcEvent;
          this.recentEventsHead = stryMutAct_9fa48("97306") ? (this.recentEventsHead + NUM.ONE) * this.slidingWindowCapacity : (stryCov_9fa48("97306"), (stryMutAct_9fa48("97307") ? this.recentEventsHead - NUM.ONE : (stryCov_9fa48("97307"), this.recentEventsHead + NUM.ONE)) % this.slidingWindowCapacity);
        }
      }
    }
  }

  /**
   * Return a copy of the sliding window contents in insertion order.
   *
   * @return {Array<Object>} recent events in delivery order.
   */
  getRecentEvents() {
    if (stryMutAct_9fa48("97308")) {
      {}
    } else {
      stryCov_9fa48("97308");
      if (stryMutAct_9fa48("97312") ? this.recentEvents.length >= this.slidingWindowCapacity : stryMutAct_9fa48("97311") ? this.recentEvents.length <= this.slidingWindowCapacity : stryMutAct_9fa48("97310") ? false : stryMutAct_9fa48("97309") ? true : (stryCov_9fa48("97309", "97310", "97311", "97312"), this.recentEvents.length < this.slidingWindowCapacity)) {
        if (stryMutAct_9fa48("97313")) {
          {}
        } else {
          stryCov_9fa48("97313");
          return stryMutAct_9fa48("97314") ? this.recentEvents : (stryCov_9fa48("97314"), this.recentEvents.slice());
        }
      }
      return stryMutAct_9fa48("97315") ? [] : (stryCov_9fa48("97315"), [...(stryMutAct_9fa48("97316") ? this.recentEvents : (stryCov_9fa48("97316"), this.recentEvents.slice(this.recentEventsHead))), ...(stryMutAct_9fa48("97317") ? this.recentEvents : (stryCov_9fa48("97317"), this.recentEvents.slice(NUM.ZERO, this.recentEventsHead)))]);
    }
  }

  /**
   * @return {number} number of events in the sliding window.
   */
  recentEventsSize() {
    if (stryMutAct_9fa48("97318")) {
      {}
    } else {
      stryCov_9fa48("97318");
      return this.recentEvents.length;
    }
  }

  /**
   * Reset the sliding window to empty state.
   */
  clearRecentEvents() {
    if (stryMutAct_9fa48("97319")) {
      {}
    } else {
      stryCov_9fa48("97319");
      this.recentEvents = stryMutAct_9fa48("97320") ? ["Stryker was here"] : (stryCov_9fa48("97320"), []);
      this.recentEventsHead = NUM.ZERO;
    }
  }
}
export { CDCEventBuffer, buildEventIdentity, buildInternalCoalescingIdentity };