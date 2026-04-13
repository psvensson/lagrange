/**
 * Key Range Manager - Manages partition key ranges.
 * Ensures contiguous, non-overlapping ranges for tables.
 * Requirements: 20.3, 20.5, 20.9
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
import { NUM, TYPEOF } from '../constants/index.js';
import { KEY_RANGE_ERROR_MSG, KEY_RANGE_LOG_MSG, PARTITION_SUBSYSTEM } from './partition-constants.js';

/**
 * Represents a partition key range.
 * Range is [start, end) - start is inclusive, end is exclusive.
 * NULL values represent unbounded (start=NULL means from beginning, end=NULL means to end).
 */
class KeyRange {
  /**
   * Create a new KeyRange.
   * @param {*} start - Start key (inclusive), null for unbounded.
   * @param {*} end - End key (exclusive), null for unbounded.
   */
  constructor(start = null, end = null) {
    if (stryMutAct_9fa48("97321")) {
      {}
    } else {
      stryCov_9fa48("97321");
      this.start = start;
      this.end = end;
    }
  }

  /**
   * Check if a key falls within this range.
   * @param {*} key - Key to check.
   * @return {boolean} True if key is in range.
   */
  contains(key) {
    if (stryMutAct_9fa48("97322")) {
      {}
    } else {
      stryCov_9fa48("97322");
      // NULL start means unbounded lower
      // NULL end means unbounded upper
      if (stryMutAct_9fa48("97325") ? this.start === null || this.end === null : stryMutAct_9fa48("97324") ? false : stryMutAct_9fa48("97323") ? true : (stryCov_9fa48("97323", "97324", "97325"), (stryMutAct_9fa48("97327") ? this.start !== null : stryMutAct_9fa48("97326") ? true : (stryCov_9fa48("97326", "97327"), this.start === null)) && (stryMutAct_9fa48("97329") ? this.end !== null : stryMutAct_9fa48("97328") ? true : (stryCov_9fa48("97328", "97329"), this.end === null)))) {
        if (stryMutAct_9fa48("97330")) {
          {}
        } else {
          stryCov_9fa48("97330");
          return stryMutAct_9fa48("97331") ? false : (stryCov_9fa48("97331"), true);
        }
      }
      if (stryMutAct_9fa48("97334") ? this.start !== null : stryMutAct_9fa48("97333") ? false : stryMutAct_9fa48("97332") ? true : (stryCov_9fa48("97332", "97333", "97334"), this.start === null)) {
        if (stryMutAct_9fa48("97335")) {
          {}
        } else {
          stryCov_9fa48("97335");
          return stryMutAct_9fa48("97339") ? this.compareKeys(key, this.end) >= NUM.ZERO : stryMutAct_9fa48("97338") ? this.compareKeys(key, this.end) <= NUM.ZERO : stryMutAct_9fa48("97337") ? false : stryMutAct_9fa48("97336") ? true : (stryCov_9fa48("97336", "97337", "97338", "97339"), this.compareKeys(key, this.end) < NUM.ZERO);
        }
      }
      if (stryMutAct_9fa48("97342") ? this.end !== null : stryMutAct_9fa48("97341") ? false : stryMutAct_9fa48("97340") ? true : (stryCov_9fa48("97340", "97341", "97342"), this.end === null)) {
        if (stryMutAct_9fa48("97343")) {
          {}
        } else {
          stryCov_9fa48("97343");
          return stryMutAct_9fa48("97347") ? this.compareKeys(key, this.start) < NUM.ZERO : stryMutAct_9fa48("97346") ? this.compareKeys(key, this.start) > NUM.ZERO : stryMutAct_9fa48("97345") ? false : stryMutAct_9fa48("97344") ? true : (stryCov_9fa48("97344", "97345", "97346", "97347"), this.compareKeys(key, this.start) >= NUM.ZERO);
        }
      }
      return stryMutAct_9fa48("97350") ? this.compareKeys(key, this.start) >= NUM.ZERO || this.compareKeys(key, this.end) < NUM.ZERO : stryMutAct_9fa48("97349") ? false : stryMutAct_9fa48("97348") ? true : (stryCov_9fa48("97348", "97349", "97350"), (stryMutAct_9fa48("97353") ? this.compareKeys(key, this.start) < NUM.ZERO : stryMutAct_9fa48("97352") ? this.compareKeys(key, this.start) > NUM.ZERO : stryMutAct_9fa48("97351") ? true : (stryCov_9fa48("97351", "97352", "97353"), this.compareKeys(key, this.start) >= NUM.ZERO)) && (stryMutAct_9fa48("97356") ? this.compareKeys(key, this.end) >= NUM.ZERO : stryMutAct_9fa48("97355") ? this.compareKeys(key, this.end) <= NUM.ZERO : stryMutAct_9fa48("97354") ? true : (stryCov_9fa48("97354", "97355", "97356"), this.compareKeys(key, this.end) < NUM.ZERO)));
    }
  }

  /**
   * Compare two keys.
   * @param {*} a - First key.
   * @param {*} b - Second key.
   * @return {number} Negative if a < b, positive if a > b, 0 if equal.
   */
  compareKeys(a, b) {
    if (stryMutAct_9fa48("97357")) {
      {}
    } else {
      stryCov_9fa48("97357");
      if (stryMutAct_9fa48("97360") ? a === null || b === null : stryMutAct_9fa48("97359") ? false : stryMutAct_9fa48("97358") ? true : (stryCov_9fa48("97358", "97359", "97360"), (stryMutAct_9fa48("97362") ? a !== null : stryMutAct_9fa48("97361") ? true : (stryCov_9fa48("97361", "97362"), a === null)) && (stryMutAct_9fa48("97364") ? b !== null : stryMutAct_9fa48("97363") ? true : (stryCov_9fa48("97363", "97364"), b === null)))) return NUM.ZERO;
      if (stryMutAct_9fa48("97367") ? a !== null : stryMutAct_9fa48("97366") ? false : stryMutAct_9fa48("97365") ? true : (stryCov_9fa48("97365", "97366", "97367"), a === null)) return NUM.NEGATIVE_ONE;
      if (stryMutAct_9fa48("97370") ? b !== null : stryMutAct_9fa48("97369") ? false : stryMutAct_9fa48("97368") ? true : (stryCov_9fa48("97368", "97369", "97370"), b === null)) return NUM.ONE;
      if (stryMutAct_9fa48("97373") ? typeof a === TYPEOF.STRING || typeof b === TYPEOF.STRING : stryMutAct_9fa48("97372") ? false : stryMutAct_9fa48("97371") ? true : (stryCov_9fa48("97371", "97372", "97373"), (stryMutAct_9fa48("97375") ? typeof a !== TYPEOF.STRING : stryMutAct_9fa48("97374") ? true : (stryCov_9fa48("97374", "97375"), typeof a === TYPEOF.STRING)) && (stryMutAct_9fa48("97377") ? typeof b !== TYPEOF.STRING : stryMutAct_9fa48("97376") ? true : (stryCov_9fa48("97376", "97377"), typeof b === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("97378")) {
          {}
        } else {
          stryCov_9fa48("97378");
          return a.localeCompare(b);
        }
      }
      if (stryMutAct_9fa48("97381") ? typeof a === TYPEOF.NUMBER || typeof b === TYPEOF.NUMBER : stryMutAct_9fa48("97380") ? false : stryMutAct_9fa48("97379") ? true : (stryCov_9fa48("97379", "97380", "97381"), (stryMutAct_9fa48("97383") ? typeof a !== TYPEOF.NUMBER : stryMutAct_9fa48("97382") ? true : (stryCov_9fa48("97382", "97383"), typeof a === TYPEOF.NUMBER)) && (stryMutAct_9fa48("97385") ? typeof b !== TYPEOF.NUMBER : stryMutAct_9fa48("97384") ? true : (stryCov_9fa48("97384", "97385"), typeof b === TYPEOF.NUMBER)))) {
        if (stryMutAct_9fa48("97386")) {
          {}
        } else {
          stryCov_9fa48("97386");
          return stryMutAct_9fa48("97387") ? a + b : (stryCov_9fa48("97387"), a - b);
        }
      }

      // Convert to string for comparison
      return String(a).localeCompare(String(b));
    }
  }

  /**
   * Check if this range is adjacent to another (this.end === other.start).
   * @param {KeyRange} other - Other range.
   * @return {boolean} True if adjacent.
   */
  isAdjacentTo(other) {
    if (stryMutAct_9fa48("97388")) {
      {}
    } else {
      stryCov_9fa48("97388");
      if (stryMutAct_9fa48("97391") ? this.end === null && other.start === null : stryMutAct_9fa48("97390") ? false : stryMutAct_9fa48("97389") ? true : (stryCov_9fa48("97389", "97390", "97391"), (stryMutAct_9fa48("97393") ? this.end !== null : stryMutAct_9fa48("97392") ? false : (stryCov_9fa48("97392", "97393"), this.end === null)) || (stryMutAct_9fa48("97395") ? other.start !== null : stryMutAct_9fa48("97394") ? false : (stryCov_9fa48("97394", "97395"), other.start === null)))) {
        if (stryMutAct_9fa48("97396")) {
          {}
        } else {
          stryCov_9fa48("97396");
          return stryMutAct_9fa48("97397") ? true : (stryCov_9fa48("97397"), false);
        }
      }
      return stryMutAct_9fa48("97400") ? this.compareKeys(this.end, other.start) !== NUM.ZERO : stryMutAct_9fa48("97399") ? false : stryMutAct_9fa48("97398") ? true : (stryCov_9fa48("97398", "97399", "97400"), this.compareKeys(this.end, other.start) === NUM.ZERO);
    }
  }

  /**
   * Check if this range overlaps with another.
   * @param {KeyRange} other - Other range.
   * @return {boolean} True if ranges overlap.
   */
  overlaps(other) {
    if (stryMutAct_9fa48("97401")) {
      {}
    } else {
      stryCov_9fa48("97401");
      // Check if one range is completely before the other
      if (stryMutAct_9fa48("97404") ? this.end !== null || other.start !== null : stryMutAct_9fa48("97403") ? false : stryMutAct_9fa48("97402") ? true : (stryCov_9fa48("97402", "97403", "97404"), (stryMutAct_9fa48("97406") ? this.end === null : stryMutAct_9fa48("97405") ? true : (stryCov_9fa48("97405", "97406"), this.end !== null)) && (stryMutAct_9fa48("97408") ? other.start === null : stryMutAct_9fa48("97407") ? true : (stryCov_9fa48("97407", "97408"), other.start !== null)))) {
        if (stryMutAct_9fa48("97409")) {
          {}
        } else {
          stryCov_9fa48("97409");
          if (stryMutAct_9fa48("97413") ? this.compareKeys(this.end, other.start) > NUM.ZERO : stryMutAct_9fa48("97412") ? this.compareKeys(this.end, other.start) < NUM.ZERO : stryMutAct_9fa48("97411") ? false : stryMutAct_9fa48("97410") ? true : (stryCov_9fa48("97410", "97411", "97412", "97413"), this.compareKeys(this.end, other.start) <= NUM.ZERO)) {
            if (stryMutAct_9fa48("97414")) {
              {}
            } else {
              stryCov_9fa48("97414");
              return stryMutAct_9fa48("97415") ? true : (stryCov_9fa48("97415"), false);
            }
          }
        }
      }
      if (stryMutAct_9fa48("97418") ? other.end !== null || this.start !== null : stryMutAct_9fa48("97417") ? false : stryMutAct_9fa48("97416") ? true : (stryCov_9fa48("97416", "97417", "97418"), (stryMutAct_9fa48("97420") ? other.end === null : stryMutAct_9fa48("97419") ? true : (stryCov_9fa48("97419", "97420"), other.end !== null)) && (stryMutAct_9fa48("97422") ? this.start === null : stryMutAct_9fa48("97421") ? true : (stryCov_9fa48("97421", "97422"), this.start !== null)))) {
        if (stryMutAct_9fa48("97423")) {
          {}
        } else {
          stryCov_9fa48("97423");
          if (stryMutAct_9fa48("97427") ? this.compareKeys(other.end, this.start) > NUM.ZERO : stryMutAct_9fa48("97426") ? this.compareKeys(other.end, this.start) < NUM.ZERO : stryMutAct_9fa48("97425") ? false : stryMutAct_9fa48("97424") ? true : (stryCov_9fa48("97424", "97425", "97426", "97427"), this.compareKeys(other.end, this.start) <= NUM.ZERO)) {
            if (stryMutAct_9fa48("97428")) {
              {}
            } else {
              stryCov_9fa48("97428");
              return stryMutAct_9fa48("97429") ? true : (stryCov_9fa48("97429"), false);
            }
          }
        }
      }
      return stryMutAct_9fa48("97430") ? false : (stryCov_9fa48("97430"), true);
    }
  }

  /**
   * Check if this range covers the full key space.
   * @return {boolean} True if full range.
   */
  isFullRange() {
    if (stryMutAct_9fa48("97431")) {
      {}
    } else {
      stryCov_9fa48("97431");
      return stryMutAct_9fa48("97434") ? this.start === null || this.end === null : stryMutAct_9fa48("97433") ? false : stryMutAct_9fa48("97432") ? true : (stryCov_9fa48("97432", "97433", "97434"), (stryMutAct_9fa48("97436") ? this.start !== null : stryMutAct_9fa48("97435") ? true : (stryCov_9fa48("97435", "97436"), this.start === null)) && (stryMutAct_9fa48("97438") ? this.end !== null : stryMutAct_9fa48("97437") ? true : (stryCov_9fa48("97437", "97438"), this.end === null)));
    }
  }

  /**
   * Create a copy of this range.
   * @return {KeyRange} New KeyRange with same values.
   */
  clone() {
    if (stryMutAct_9fa48("97439")) {
      {}
    } else {
      stryCov_9fa48("97439");
      return new KeyRange(this.start, this.end);
    }
  }

  /**
   * Convert to plain object.
   * @return {Object} Plain object representation.
   */
  toObject() {
    if (stryMutAct_9fa48("97440")) {
      {}
    } else {
      stryCov_9fa48("97440");
      return stryMutAct_9fa48("97441") ? {} : (stryCov_9fa48("97441"), {
        start: this.start,
        end: this.end
      });
    }
  }

  /**
   * Create from plain object.
   * @param {Object} obj - Plain object with start and end.
   * @return {KeyRange} New KeyRange.
   */
  static fromObject(obj) {
    if (stryMutAct_9fa48("97442")) {
      {}
    } else {
      stryCov_9fa48("97442");
      return new KeyRange(obj.start, obj.end);
    }
  }

  /**
   * Create a full range covering all keys.
   * @return {KeyRange} Full range [NULL, NULL).
   */
  static fullRange() {
    if (stryMutAct_9fa48("97443")) {
      {}
    } else {
      stryCov_9fa48("97443");
      return new KeyRange(null, null);
    }
  }
}

/**
 * KeyRangeManager manages partition key ranges for a table.
 * Ensures ranges are contiguous and non-overlapping.
 */
class KeyRangeManager {
  /**
   * Create a new KeyRangeManager.
   * @param {string} tableId - Table ID.
   */
  constructor(tableId) {
    if (stryMutAct_9fa48("97444")) {
      {}
    } else {
      stryCov_9fa48("97444");
      this.tableId = tableId;
      this.ranges = new Map(); // partitionId -> KeyRange

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(PARTITION_SUBSYSTEM.KEY_RANGE_MANAGER) : console;
    }
  }

  /**
   * Add a partition with its key range.
   * @param {string} partitionId - Partition ID.
   * @param {KeyRange|Object} range - Key range.
   * @throws {Error} If range overlaps with existing ranges.
   */
  addPartition(partitionId, range) {
    if (stryMutAct_9fa48("97445")) {
      {}
    } else {
      stryCov_9fa48("97445");
      const keyRange = range instanceof KeyRange ? range : KeyRange.fromObject(range);

      // Check for overlaps with existing ranges
      for (const [existingId, existingRange] of this.ranges) {
        if (stryMutAct_9fa48("97446")) {
          {}
        } else {
          stryCov_9fa48("97446");
          if (stryMutAct_9fa48("97449") ? existingId !== partitionId || keyRange.overlaps(existingRange) : stryMutAct_9fa48("97448") ? false : stryMutAct_9fa48("97447") ? true : (stryCov_9fa48("97447", "97448", "97449"), (stryMutAct_9fa48("97451") ? existingId === partitionId : stryMutAct_9fa48("97450") ? true : (stryCov_9fa48("97450", "97451"), existingId !== partitionId)) && keyRange.overlaps(existingRange))) {
            if (stryMutAct_9fa48("97452")) {
              {}
            } else {
              stryCov_9fa48("97452");
              throw new Error(KEY_RANGE_ERROR_MSG.overlap(partitionId, existingId));
            }
          }
        }
      }
      this.ranges.set(partitionId, keyRange);
      this.logger.debug(KEY_RANGE_LOG_MSG.ADDED_PARTITION_RANGE, stryMutAct_9fa48("97453") ? {} : (stryCov_9fa48("97453"), {
        tableId: this.tableId,
        partitionId,
        start: keyRange.start,
        end: keyRange.end
      }));
    }
  }

  /**
   * Remove a partition.
   * @param {string} partitionId - Partition ID.
   */
  removePartition(partitionId) {
    if (stryMutAct_9fa48("97454")) {
      {}
    } else {
      stryCov_9fa48("97454");
      this.ranges.delete(partitionId);
      this.logger.debug(KEY_RANGE_LOG_MSG.REMOVED_PARTITION_RANGE, stryMutAct_9fa48("97455") ? {} : (stryCov_9fa48("97455"), {
        tableId: this.tableId,
        partitionId
      }));
    }
  }

  /**
   * Get the key range for a partition.
   * @param {string} partitionId - Partition ID.
   * @return {KeyRange|null} Key range or null.
   */
  getRange(partitionId) {
    if (stryMutAct_9fa48("97456")) {
      {}
    } else {
      stryCov_9fa48("97456");
      return stryMutAct_9fa48("97459") ? this.ranges.get(partitionId) && null : stryMutAct_9fa48("97458") ? false : stryMutAct_9fa48("97457") ? true : (stryCov_9fa48("97457", "97458", "97459"), this.ranges.get(partitionId) || null);
    }
  }

  /**
   * Find the partition that contains a key.
   * @param {*} key - Key to find.
   * @return {string|null} Partition ID or null.
   */
  findPartitionForKey(key) {
    if (stryMutAct_9fa48("97460")) {
      {}
    } else {
      stryCov_9fa48("97460");
      for (const [partitionId, range] of this.ranges) {
        if (stryMutAct_9fa48("97461")) {
          {}
        } else {
          stryCov_9fa48("97461");
          if (stryMutAct_9fa48("97463") ? false : stryMutAct_9fa48("97462") ? true : (stryCov_9fa48("97462", "97463"), range.contains(key))) {
            if (stryMutAct_9fa48("97464")) {
              {}
            } else {
              stryCov_9fa48("97464");
              return partitionId;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Get all partitions whose ranges overlap with a key range.
   * @param {KeyRange|Object} queryRange - Query range.
   * @return {Array<string>} Array of partition IDs.
   */
  findPartitionsInRange(queryRange) {
    if (stryMutAct_9fa48("97465")) {
      {}
    } else {
      stryCov_9fa48("97465");
      const range = queryRange instanceof KeyRange ? queryRange : KeyRange.fromObject(queryRange);
      const result = stryMutAct_9fa48("97466") ? ["Stryker was here"] : (stryCov_9fa48("97466"), []);
      for (const [partitionId, partitionRange] of this.ranges) {
        if (stryMutAct_9fa48("97467")) {
          {}
        } else {
          stryCov_9fa48("97467");
          if (stryMutAct_9fa48("97469") ? false : stryMutAct_9fa48("97468") ? true : (stryCov_9fa48("97468", "97469"), range.overlaps(partitionRange))) {
            if (stryMutAct_9fa48("97470")) {
              {}
            } else {
              stryCov_9fa48("97470");
              result.push(partitionId);
            }
          }
        }
      }
      return result;
    }
  }

  /**
   * Get all partition IDs.
   * @return {Array<string>} Array of partition IDs.
   */
  getAllPartitions() {
    if (stryMutAct_9fa48("97471")) {
      {}
    } else {
      stryCov_9fa48("97471");
      return Array.from(this.ranges.keys());
    }
  }

  /**
   * Get partitions sorted by their start key.
   * @return {Array<{partitionId: string, range: KeyRange}>} Sorted partitions.
   */
  getSortedPartitions() {
    if (stryMutAct_9fa48("97472")) {
      {}
    } else {
      stryCov_9fa48("97472");
      const entries = Array.from(this.ranges.entries()).map(stryMutAct_9fa48("97473") ? () => undefined : (stryCov_9fa48("97473"), ([partitionId, range]) => stryMutAct_9fa48("97474") ? {} : (stryCov_9fa48("97474"), {
        partitionId,
        range
      })));
      stryMutAct_9fa48("97475") ? entries : (stryCov_9fa48("97475"), entries.sort((a, b) => {
        if (stryMutAct_9fa48("97476")) {
          {}
        } else {
          stryCov_9fa48("97476");
          if (stryMutAct_9fa48("97479") ? a.range.start !== null : stryMutAct_9fa48("97478") ? false : stryMutAct_9fa48("97477") ? true : (stryCov_9fa48("97477", "97478", "97479"), a.range.start === null)) return NUM.NEGATIVE_ONE;
          if (stryMutAct_9fa48("97482") ? b.range.start !== null : stryMutAct_9fa48("97481") ? false : stryMutAct_9fa48("97480") ? true : (stryCov_9fa48("97480", "97481", "97482"), b.range.start === null)) return NUM.ONE;
          return a.range.compareKeys(a.range.start, b.range.start);
        }
      }));
      return entries;
    }
  }

  /**
   * Find adjacent partition (the one whose start equals this partition's end).
   * @param {string} partitionId - Partition ID.
   * @return {string|null} Adjacent partition ID or null.
   */
  findAdjacentPartition(partitionId) {
    if (stryMutAct_9fa48("97483")) {
      {}
    } else {
      stryCov_9fa48("97483");
      const range = this.ranges.get(partitionId);
      if (stryMutAct_9fa48("97486") ? !range && range.end === null : stryMutAct_9fa48("97485") ? false : stryMutAct_9fa48("97484") ? true : (stryCov_9fa48("97484", "97485", "97486"), (stryMutAct_9fa48("97487") ? range : (stryCov_9fa48("97487"), !range)) || (stryMutAct_9fa48("97489") ? range.end !== null : stryMutAct_9fa48("97488") ? false : (stryCov_9fa48("97488", "97489"), range.end === null)))) {
        if (stryMutAct_9fa48("97490")) {
          {}
        } else {
          stryCov_9fa48("97490");
          return null;
        }
      }
      for (const [otherId, otherRange] of this.ranges) {
        if (stryMutAct_9fa48("97491")) {
          {}
        } else {
          stryCov_9fa48("97491");
          if (stryMutAct_9fa48("97494") ? otherId !== partitionId || range.isAdjacentTo(otherRange) : stryMutAct_9fa48("97493") ? false : stryMutAct_9fa48("97492") ? true : (stryCov_9fa48("97492", "97493", "97494"), (stryMutAct_9fa48("97496") ? otherId === partitionId : stryMutAct_9fa48("97495") ? true : (stryCov_9fa48("97495", "97496"), otherId !== partitionId)) && range.isAdjacentTo(otherRange))) {
            if (stryMutAct_9fa48("97497")) {
              {}
            } else {
              stryCov_9fa48("97497");
              return otherId;
            }
          }
        }
      }
      return null;
    }
  }

  /**
   * Validate that all ranges are contiguous and non-overlapping.
   * @return {{valid: boolean, errors: Array<string>}} Validation result.
   */
  validateRanges() {
    if (stryMutAct_9fa48("97498")) {
      {}
    } else {
      stryCov_9fa48("97498");
      const errors = stryMutAct_9fa48("97499") ? ["Stryker was here"] : (stryCov_9fa48("97499"), []);
      const sorted = this.getSortedPartitions();
      if (stryMutAct_9fa48("97502") ? sorted.length !== NUM.ZERO : stryMutAct_9fa48("97501") ? false : stryMutAct_9fa48("97500") ? true : (stryCov_9fa48("97500", "97501", "97502"), sorted.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("97503")) {
          {}
        } else {
          stryCov_9fa48("97503");
          return stryMutAct_9fa48("97504") ? {} : (stryCov_9fa48("97504"), {
            valid: stryMutAct_9fa48("97505") ? false : (stryCov_9fa48("97505"), true),
            errors: stryMutAct_9fa48("97506") ? ["Stryker was here"] : (stryCov_9fa48("97506"), [])
          });
        }
      }

      // Check first partition starts at NULL (unbounded)
      if (stryMutAct_9fa48("97509") ? sorted[NUM.ZERO].range.start === null : stryMutAct_9fa48("97508") ? false : stryMutAct_9fa48("97507") ? true : (stryCov_9fa48("97507", "97508", "97509"), sorted[NUM.ZERO].range.start !== null)) {
        if (stryMutAct_9fa48("97510")) {
          {}
        } else {
          stryCov_9fa48("97510");
          errors.push(KEY_RANGE_ERROR_MSG.firstPartitionStarts(sorted[NUM.ZERO].partitionId));
        }
      }

      // Check last partition ends at NULL (unbounded)
      if (stryMutAct_9fa48("97513") ? sorted[sorted.length - NUM.ONE].range.end === null : stryMutAct_9fa48("97512") ? false : stryMutAct_9fa48("97511") ? true : (stryCov_9fa48("97511", "97512", "97513"), sorted[stryMutAct_9fa48("97514") ? sorted.length + NUM.ONE : (stryCov_9fa48("97514"), sorted.length - NUM.ONE)].range.end !== null)) {
        if (stryMutAct_9fa48("97515")) {
          {}
        } else {
          stryCov_9fa48("97515");
          errors.push(KEY_RANGE_ERROR_MSG.lastPartitionEnds(sorted[stryMutAct_9fa48("97516") ? sorted.length + NUM.ONE : (stryCov_9fa48("97516"), sorted.length - NUM.ONE)].partitionId));
        }
      }

      // Check contiguity and no overlaps
      for (let i = NUM.ZERO; stryMutAct_9fa48("97519") ? i >= sorted.length - NUM.ONE : stryMutAct_9fa48("97518") ? i <= sorted.length - NUM.ONE : stryMutAct_9fa48("97517") ? false : (stryCov_9fa48("97517", "97518", "97519"), i < (stryMutAct_9fa48("97520") ? sorted.length + NUM.ONE : (stryCov_9fa48("97520"), sorted.length - NUM.ONE))); stryMutAct_9fa48("97521") ? i-- : (stryCov_9fa48("97521"), i++)) {
        if (stryMutAct_9fa48("97522")) {
          {}
        } else {
          stryCov_9fa48("97522");
          const current = sorted[i];
          const next = sorted[stryMutAct_9fa48("97523") ? i - NUM.ONE : (stryCov_9fa48("97523"), i + NUM.ONE)];

          // Check for gap
          if (stryMutAct_9fa48("97526") ? false : stryMutAct_9fa48("97525") ? true : stryMutAct_9fa48("97524") ? current.range.isAdjacentTo(next.range) : (stryCov_9fa48("97524", "97525", "97526"), !current.range.isAdjacentTo(next.range))) {
            if (stryMutAct_9fa48("97527")) {
              {}
            } else {
              stryCov_9fa48("97527");
              const currentEnd = current.range.end;
              const nextStart = next.range.start;
              if (stryMutAct_9fa48("97531") ? current.range.compareKeys(currentEnd, nextStart) >= NUM.ZERO : stryMutAct_9fa48("97530") ? current.range.compareKeys(currentEnd, nextStart) <= NUM.ZERO : stryMutAct_9fa48("97529") ? false : stryMutAct_9fa48("97528") ? true : (stryCov_9fa48("97528", "97529", "97530", "97531"), current.range.compareKeys(currentEnd, nextStart) < NUM.ZERO)) {
                if (stryMutAct_9fa48("97532")) {
                  {}
                } else {
                  stryCov_9fa48("97532");
                  errors.push(KEY_RANGE_ERROR_MSG.gapBetweenPartitions(current.partitionId, next.partitionId, currentEnd, nextStart));
                }
              } else if (stryMutAct_9fa48("97536") ? current.range.compareKeys(currentEnd, nextStart) <= NUM.ZERO : stryMutAct_9fa48("97535") ? current.range.compareKeys(currentEnd, nextStart) >= NUM.ZERO : stryMutAct_9fa48("97534") ? false : stryMutAct_9fa48("97533") ? true : (stryCov_9fa48("97533", "97534", "97535", "97536"), current.range.compareKeys(currentEnd, nextStart) > NUM.ZERO)) {
                if (stryMutAct_9fa48("97537")) {
                  {}
                } else {
                  stryCov_9fa48("97537");
                  errors.push(KEY_RANGE_ERROR_MSG.overlapBetweenPartitions(current.partitionId, next.partitionId));
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("97538") ? {} : (stryCov_9fa48("97538"), {
        valid: stryMutAct_9fa48("97541") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("97540") ? false : stryMutAct_9fa48("97539") ? true : (stryCov_9fa48("97539", "97540", "97541"), errors.length === NUM.ZERO),
        errors
      });
    }
  }

  /**
   * Split a partition at a given key.
   * @param {string} partitionId - Partition to split.
   * @param {*} splitKey - Key to split at.
   * @param {string} leftPartitionId - ID for left partition.
   * @param {string} rightPartitionId - ID for right partition.
   * @return {{left: KeyRange, right: KeyRange}} New ranges.
   */
  splitPartition(partitionId, splitKey, leftPartitionId, rightPartitionId) {
    if (stryMutAct_9fa48("97542")) {
      {}
    } else {
      stryCov_9fa48("97542");
      const range = this.ranges.get(partitionId);
      if (stryMutAct_9fa48("97545") ? false : stryMutAct_9fa48("97544") ? true : stryMutAct_9fa48("97543") ? range : (stryCov_9fa48("97543", "97544", "97545"), !range)) {
        if (stryMutAct_9fa48("97546")) {
          {}
        } else {
          stryCov_9fa48("97546");
          throw new Error(KEY_RANGE_ERROR_MSG.partitionNotFound(partitionId));
        }
      }
      if (stryMutAct_9fa48("97549") ? false : stryMutAct_9fa48("97548") ? true : stryMutAct_9fa48("97547") ? range.contains(splitKey) : (stryCov_9fa48("97547", "97548", "97549"), !range.contains(splitKey))) {
        if (stryMutAct_9fa48("97550")) {
          {}
        } else {
          stryCov_9fa48("97550");
          throw new Error(KEY_RANGE_ERROR_MSG.splitKeyOutOfRange(splitKey));
        }
      }
      const leftRange = new KeyRange(range.start, splitKey);
      const rightRange = new KeyRange(splitKey, range.end);

      // Remove old partition
      this.ranges.delete(partitionId);

      // Add new partitions
      this.ranges.set(leftPartitionId, leftRange);
      this.ranges.set(rightPartitionId, rightRange);
      this.logger.info(KEY_RANGE_LOG_MSG.SPLIT_PARTITION, stryMutAct_9fa48("97551") ? {} : (stryCov_9fa48("97551"), {
        tableId: this.tableId,
        originalPartition: partitionId,
        leftPartition: leftPartitionId,
        rightPartition: rightPartitionId,
        splitKey
      }));
      return stryMutAct_9fa48("97552") ? {} : (stryCov_9fa48("97552"), {
        left: leftRange,
        right: rightRange
      });
    }
  }

  /**
   * Merge two adjacent partitions.
   * @param {string} leftPartitionId - Left partition ID.
   * @param {string} rightPartitionId - Right partition ID.
   * @param {string} mergedPartitionId - ID for merged partition.
   * @return {KeyRange} Merged range.
   */
  mergePartitions(leftPartitionId, rightPartitionId, mergedPartitionId) {
    if (stryMutAct_9fa48("97553")) {
      {}
    } else {
      stryCov_9fa48("97553");
      const leftRange = this.ranges.get(leftPartitionId);
      const rightRange = this.ranges.get(rightPartitionId);
      if (stryMutAct_9fa48("97556") ? false : stryMutAct_9fa48("97555") ? true : stryMutAct_9fa48("97554") ? leftRange : (stryCov_9fa48("97554", "97555", "97556"), !leftRange)) {
        if (stryMutAct_9fa48("97557")) {
          {}
        } else {
          stryCov_9fa48("97557");
          throw new Error(KEY_RANGE_ERROR_MSG.leftPartitionNotFound(leftPartitionId));
        }
      }
      if (stryMutAct_9fa48("97560") ? false : stryMutAct_9fa48("97559") ? true : stryMutAct_9fa48("97558") ? rightRange : (stryCov_9fa48("97558", "97559", "97560"), !rightRange)) {
        if (stryMutAct_9fa48("97561")) {
          {}
        } else {
          stryCov_9fa48("97561");
          throw new Error(KEY_RANGE_ERROR_MSG.rightPartitionNotFound(rightPartitionId));
        }
      }
      if (stryMutAct_9fa48("97564") ? false : stryMutAct_9fa48("97563") ? true : stryMutAct_9fa48("97562") ? leftRange.isAdjacentTo(rightRange) : (stryCov_9fa48("97562", "97563", "97564"), !leftRange.isAdjacentTo(rightRange))) {
        if (stryMutAct_9fa48("97565")) {
          {}
        } else {
          stryCov_9fa48("97565");
          throw new Error(KEY_RANGE_ERROR_MSG.partitionsNotAdjacent(leftPartitionId, rightPartitionId));
        }
      }
      const mergedRange = new KeyRange(leftRange.start, rightRange.end);

      // Remove old partitions
      this.ranges.delete(leftPartitionId);
      this.ranges.delete(rightPartitionId);

      // Add merged partition
      this.ranges.set(mergedPartitionId, mergedRange);
      this.logger.info(KEY_RANGE_LOG_MSG.MERGED_PARTITIONS, stryMutAct_9fa48("97566") ? {} : (stryCov_9fa48("97566"), {
        tableId: this.tableId,
        leftPartition: leftPartitionId,
        rightPartition: rightPartitionId,
        mergedPartition: mergedPartitionId
      }));
      return mergedRange;
    }
  }

  /**
   * Get the number of partitions.
   * @return {number} Partition count.
   */
  getPartitionCount() {
    if (stryMutAct_9fa48("97567")) {
      {}
    } else {
      stryCov_9fa48("97567");
      return this.ranges.size;
    }
  }

  /**
   * Clear all partitions.
   */
  clear() {
    if (stryMutAct_9fa48("97568")) {
      {}
    } else {
      stryCov_9fa48("97568");
      this.ranges.clear();
    }
  }
}
export { KeyRange, KeyRangeManager };