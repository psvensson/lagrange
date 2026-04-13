/**
 * InMemoryLogAdapter - In-memory log storage for liferaft.
 * Used by MessageGroupService for ephemeral message routing state.
 * Implements the same interface as liferaft's Log class.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
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
import { NUM } from '../constants/index.js';

/**
 * Number of committed entries to retain after compaction.
 * Keeps a window for slow followers to catch up via getEntriesAfter.
 * @type {number}
 */
const IN_MEMORY_LOG_COMPACTION_RETENTION = 1000;

/**
 * In-memory log adapter for liferaft.
 * Implements the liferaft Log interface with async methods.
 */
class InMemoryLogAdapter {
  /**
   * Create a new in-memory log adapter.
   * @param {Object} node - The raft node using this log
   * @param {Object} _options - Options (unused for in-memory)
   */
  constructor(node, _options = {}) {
    if (stryMutAct_9fa48("126930")) {
      {}
    } else {
      stryCov_9fa48("126930");
      this.node = node;
      this.entries = new Map(); // index -> entry
      this.committedIndex = NUM.ZERO;
      this.lastIndex = NUM.ZERO;
    }
  }

  /**
   * Save a command to the log.
   * @param {Object} command - Command to save
   * @param {number} term - Term to save with
   * @param {number} [index] - Index to save at (optional, auto-increments)
   * @return {Promise<Object>} The saved entry
   */
  async saveCommand(command, term, index) {
    if (stryMutAct_9fa48("126931")) {
      {}
    } else {
      stryCov_9fa48("126931");
      if (stryMutAct_9fa48("126934") ? false : stryMutAct_9fa48("126933") ? true : stryMutAct_9fa48("126932") ? index : (stryCov_9fa48("126932", "126933", "126934"), !index)) {
        if (stryMutAct_9fa48("126935")) {
          {}
        } else {
          stryCov_9fa48("126935");
          const {
            index: lastIndex
          } = await this.getLastInfo();
          index = stryMutAct_9fa48("126936") ? lastIndex - NUM.ONE : (stryCov_9fa48("126936"), lastIndex + NUM.ONE);
        }
      }
      const entry = stryMutAct_9fa48("126937") ? {} : (stryCov_9fa48("126937"), {
        term,
        index,
        committed: stryMutAct_9fa48("126938") ? true : (stryCov_9fa48("126938"), false),
        responses: stryMutAct_9fa48("126939") ? [] : (stryCov_9fa48("126939"), [stryMutAct_9fa48("126940") ? {} : (stryCov_9fa48("126940"), {
          address: this.node.address,
          ack: stryMutAct_9fa48("126941") ? false : (stryCov_9fa48("126941"), true)
        })]),
        command
      });
      this.entries.set(index, entry);
      if (stryMutAct_9fa48("126945") ? index <= this.lastIndex : stryMutAct_9fa48("126944") ? index >= this.lastIndex : stryMutAct_9fa48("126943") ? false : stryMutAct_9fa48("126942") ? true : (stryCov_9fa48("126942", "126943", "126944", "126945"), index > this.lastIndex)) {
        if (stryMutAct_9fa48("126946")) {
          {}
        } else {
          stryCov_9fa48("126946");
          this.lastIndex = index;
        }
      }
      return entry;
    }
  }

  /**
   * Get the last entry info.
   * @return {Promise<Object>} {index, term, committedIndex}
   */
  async getLastInfo() {
    if (stryMutAct_9fa48("126947")) {
      {}
    } else {
      stryCov_9fa48("126947");
      const entry = await this.getLastEntry();
      return stryMutAct_9fa48("126948") ? {} : (stryCov_9fa48("126948"), {
        index: entry.index,
        term: entry.term,
        committedIndex: this.committedIndex
      });
    }
  }

  /**
   * Get the last entry.
   * @return {Promise<Object>} Last entry or default
   */
  async getLastEntry() {
    if (stryMutAct_9fa48("126949")) {
      {}
    } else {
      stryCov_9fa48("126949");
      if (stryMutAct_9fa48("126952") ? this.lastIndex !== NUM.ZERO : stryMutAct_9fa48("126951") ? false : stryMutAct_9fa48("126950") ? true : (stryCov_9fa48("126950", "126951", "126952"), this.lastIndex === NUM.ZERO)) {
        if (stryMutAct_9fa48("126953")) {
          {}
        } else {
          stryCov_9fa48("126953");
          return stryMutAct_9fa48("126954") ? {} : (stryCov_9fa48("126954"), {
            index: NUM.ZERO,
            term: this.node ? this.node.term : NUM.ZERO
          });
        }
      }
      return stryMutAct_9fa48("126957") ? this.entries.get(this.lastIndex) && {
        index: NUM.ZERO,
        term: this.node ? this.node.term : NUM.ZERO
      } : stryMutAct_9fa48("126956") ? false : stryMutAct_9fa48("126955") ? true : (stryCov_9fa48("126955", "126956", "126957"), this.entries.get(this.lastIndex) || (stryMutAct_9fa48("126958") ? {} : (stryCov_9fa48("126958"), {
        index: NUM.ZERO,
        term: this.node ? this.node.term : NUM.ZERO
      })));
    }
  }

  /**
   * Check if an entry exists at index.
   * @param {number} index - Index to check
   * @return {Promise<boolean>} True if exists
   */
  async has(index) {
    if (stryMutAct_9fa48("126959")) {
      {}
    } else {
      stryCov_9fa48("126959");
      return this.entries.has(index);
    }
  }

  /**
   * Get an entry at index.
   * @param {number} index - Index to get
   * @return {Promise<Object|null>} Entry at index or null if missing
   */
  async get(index) {
    if (stryMutAct_9fa48("126960")) {
      {}
    } else {
      stryCov_9fa48("126960");
      return stryMutAct_9fa48("126963") ? this.entries.get(index) && null : stryMutAct_9fa48("126962") ? false : stryMutAct_9fa48("126961") ? true : (stryCov_9fa48("126961", "126962", "126963"), this.entries.get(index) || null);
    }
  }

  /**
   * Remove all entries after index.
   * @param {number} index - Index to remove after
   * @return {Promise<void>}
   */
  async removeEntriesAfter(index) {
    if (stryMutAct_9fa48("126964")) {
      {}
    } else {
      stryCov_9fa48("126964");
      for (const [key] of this.entries) {
        if (stryMutAct_9fa48("126965")) {
          {}
        } else {
          stryCov_9fa48("126965");
          if (stryMutAct_9fa48("126969") ? key <= index : stryMutAct_9fa48("126968") ? key >= index : stryMutAct_9fa48("126967") ? false : stryMutAct_9fa48("126966") ? true : (stryCov_9fa48("126966", "126967", "126968", "126969"), key > index)) {
            if (stryMutAct_9fa48("126970")) {
              {}
            } else {
              stryCov_9fa48("126970");
              this.entries.delete(key);
            }
          }
        }
      }
      // Update lastIndex
      this.lastIndex = NUM.ZERO;
      for (const [key] of this.entries) {
        if (stryMutAct_9fa48("126971")) {
          {}
        } else {
          stryCov_9fa48("126971");
          if (stryMutAct_9fa48("126975") ? key <= this.lastIndex : stryMutAct_9fa48("126974") ? key >= this.lastIndex : stryMutAct_9fa48("126973") ? false : stryMutAct_9fa48("126972") ? true : (stryCov_9fa48("126972", "126973", "126974", "126975"), key > this.lastIndex)) {
            if (stryMutAct_9fa48("126976")) {
              {}
            } else {
              stryCov_9fa48("126976");
              this.lastIndex = key;
            }
          }
        }
      }
    }
  }

  /**
   * Get entries after index.
   * @param {number} index - Index to get after
   * @return {Promise<Array>} Entries after index
   */
  async getEntriesAfter(index) {
    if (stryMutAct_9fa48("126977")) {
      {}
    } else {
      stryCov_9fa48("126977");
      const result = stryMutAct_9fa48("126978") ? ["Stryker was here"] : (stryCov_9fa48("126978"), []);
      for (const [key, entry] of this.entries) {
        if (stryMutAct_9fa48("126979")) {
          {}
        } else {
          stryCov_9fa48("126979");
          if (stryMutAct_9fa48("126983") ? key <= index : stryMutAct_9fa48("126982") ? key >= index : stryMutAct_9fa48("126981") ? false : stryMutAct_9fa48("126980") ? true : (stryCov_9fa48("126980", "126981", "126982", "126983"), key > index)) {
            if (stryMutAct_9fa48("126984")) {
              {}
            } else {
              stryCov_9fa48("126984");
              result.push(entry);
            }
          }
        }
      }
      return stryMutAct_9fa48("126985") ? result : (stryCov_9fa48("126985"), result.sort(stryMutAct_9fa48("126986") ? () => undefined : (stryCov_9fa48("126986"), (a, b) => stryMutAct_9fa48("126987") ? a.index + b.index : (stryCov_9fa48("126987"), a.index - b.index))));
    }
  }

  /**
   * Acknowledge a command from a follower.
   * @param {number} index - Index of entry
   * @param {string} address - Address of follower
   * @return {Promise<Object>} Updated entry
   */
  async commandAck(index, address) {
    if (stryMutAct_9fa48("126988")) {
      {}
    } else {
      stryCov_9fa48("126988");
      const entry = await this.get(index);
      if (stryMutAct_9fa48("126991") ? false : stryMutAct_9fa48("126990") ? true : stryMutAct_9fa48("126989") ? entry : (stryCov_9fa48("126989", "126990", "126991"), !entry)) {
        if (stryMutAct_9fa48("126992")) {
          {}
        } else {
          stryCov_9fa48("126992");
          return stryMutAct_9fa48("126993") ? {} : (stryCov_9fa48("126993"), {
            responses: stryMutAct_9fa48("126994") ? ["Stryker was here"] : (stryCov_9fa48("126994"), [])
          });
        }
      }
      const existingIndex = entry.responses.findIndex(stryMutAct_9fa48("126995") ? () => undefined : (stryCov_9fa48("126995"), r => stryMutAct_9fa48("126998") ? r.address !== address : stryMutAct_9fa48("126997") ? false : stryMutAct_9fa48("126996") ? true : (stryCov_9fa48("126996", "126997", "126998"), r.address === address)));
      if (stryMutAct_9fa48("127001") ? existingIndex !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("127000") ? false : stryMutAct_9fa48("126999") ? true : (stryCov_9fa48("126999", "127000", "127001"), existingIndex === NUM.NEGATIVE_ONE)) {
        if (stryMutAct_9fa48("127002")) {
          {}
        } else {
          stryCov_9fa48("127002");
          entry.responses.push(stryMutAct_9fa48("127003") ? {} : (stryCov_9fa48("127003"), {
            address,
            ack: stryMutAct_9fa48("127004") ? false : (stryCov_9fa48("127004"), true)
          }));
        }
      }
      this.entries.set(index, entry);
      return entry;
    }
  }

  /**
   * Get uncommitted entries up to index.
   * @param {number} index - Max index
   * @param {number} _term - Term (unused)
   * @return {Promise<Array>} Uncommitted entries
   */
  async getUncommittedEntriesUpToIndex(index, _term) {
    if (stryMutAct_9fa48("127005")) {
      {}
    } else {
      stryCov_9fa48("127005");
      const result = stryMutAct_9fa48("127006") ? ["Stryker was here"] : (stryCov_9fa48("127006"), []);
      for (const [key, entry] of this.entries) {
        if (stryMutAct_9fa48("127007")) {
          {}
        } else {
          stryCov_9fa48("127007");
          if (stryMutAct_9fa48("127010") ? key > this.committedIndex && key <= index || !entry.committed : stryMutAct_9fa48("127009") ? false : stryMutAct_9fa48("127008") ? true : (stryCov_9fa48("127008", "127009", "127010"), (stryMutAct_9fa48("127012") ? key > this.committedIndex || key <= index : stryMutAct_9fa48("127011") ? true : (stryCov_9fa48("127011", "127012"), (stryMutAct_9fa48("127015") ? key <= this.committedIndex : stryMutAct_9fa48("127014") ? key >= this.committedIndex : stryMutAct_9fa48("127013") ? true : (stryCov_9fa48("127013", "127014", "127015"), key > this.committedIndex)) && (stryMutAct_9fa48("127018") ? key > index : stryMutAct_9fa48("127017") ? key < index : stryMutAct_9fa48("127016") ? true : (stryCov_9fa48("127016", "127017", "127018"), key <= index)))) && (stryMutAct_9fa48("127019") ? entry.committed : (stryCov_9fa48("127019"), !entry.committed)))) {
            if (stryMutAct_9fa48("127020")) {
              {}
            } else {
              stryCov_9fa48("127020");
              result.push(entry);
            }
          }
        }
      }
      return stryMutAct_9fa48("127021") ? result : (stryCov_9fa48("127021"), result.sort(stryMutAct_9fa48("127022") ? () => undefined : (stryCov_9fa48("127022"), (a, b) => stryMutAct_9fa48("127023") ? a.index + b.index : (stryCov_9fa48("127023"), a.index - b.index))));
    }
  }

  /**
   * Get entry info before a given entry.
   * @param {Object} entry - Entry to get before
   * @return {Promise<Object>} {index, term, committedIndex}
   */
  async getEntryInfoBefore(entry) {
    if (stryMutAct_9fa48("127024")) {
      {}
    } else {
      stryCov_9fa48("127024");
      const prevEntry = await this.getEntryBefore(entry);
      return stryMutAct_9fa48("127025") ? {} : (stryCov_9fa48("127025"), {
        index: prevEntry.index,
        term: prevEntry.term,
        committedIndex: this.committedIndex
      });
    }
  }

  /**
   * Get entry before a given entry.
   * @param {Object} entry - Entry to get before
   * @return {Promise<Object>} Previous entry or default
   */
  async getEntryBefore(entry) {
    if (stryMutAct_9fa48("127026")) {
      {}
    } else {
      stryCov_9fa48("127026");
      const defaultInfo = stryMutAct_9fa48("127027") ? {} : (stryCov_9fa48("127027"), {
        index: NUM.ZERO,
        term: this.node ? this.node.term : NUM.ZERO
      });
      if (stryMutAct_9fa48("127030") ? !entry && entry.index <= NUM.ONE : stryMutAct_9fa48("127029") ? false : stryMutAct_9fa48("127028") ? true : (stryCov_9fa48("127028", "127029", "127030"), (stryMutAct_9fa48("127031") ? entry : (stryCov_9fa48("127031"), !entry)) || (stryMutAct_9fa48("127034") ? entry.index > NUM.ONE : stryMutAct_9fa48("127033") ? entry.index < NUM.ONE : stryMutAct_9fa48("127032") ? false : (stryCov_9fa48("127032", "127033", "127034"), entry.index <= NUM.ONE)))) {
        if (stryMutAct_9fa48("127035")) {
          {}
        } else {
          stryCov_9fa48("127035");
          return defaultInfo;
        }
      }

      // Find the entry just before this one
      let prevEntry = null;
      for (const [key, e] of this.entries) {
        if (stryMutAct_9fa48("127036")) {
          {}
        } else {
          stryCov_9fa48("127036");
          if (stryMutAct_9fa48("127039") ? key < entry.index || !prevEntry || key > prevEntry.index : stryMutAct_9fa48("127038") ? false : stryMutAct_9fa48("127037") ? true : (stryCov_9fa48("127037", "127038", "127039"), (stryMutAct_9fa48("127042") ? key >= entry.index : stryMutAct_9fa48("127041") ? key <= entry.index : stryMutAct_9fa48("127040") ? true : (stryCov_9fa48("127040", "127041", "127042"), key < entry.index)) && (stryMutAct_9fa48("127044") ? !prevEntry && key > prevEntry.index : stryMutAct_9fa48("127043") ? true : (stryCov_9fa48("127043", "127044"), (stryMutAct_9fa48("127045") ? prevEntry : (stryCov_9fa48("127045"), !prevEntry)) || (stryMutAct_9fa48("127048") ? key <= prevEntry.index : stryMutAct_9fa48("127047") ? key >= prevEntry.index : stryMutAct_9fa48("127046") ? false : (stryCov_9fa48("127046", "127047", "127048"), key > prevEntry.index)))))) {
            if (stryMutAct_9fa48("127049")) {
              {}
            } else {
              stryCov_9fa48("127049");
              prevEntry = e;
            }
          }
        }
      }
      return stryMutAct_9fa48("127052") ? prevEntry && defaultInfo : stryMutAct_9fa48("127051") ? false : stryMutAct_9fa48("127050") ? true : (stryCov_9fa48("127050", "127051", "127052"), prevEntry || defaultInfo);
    }
  }

  /**
   * Commit an entry.
   * @param {number} index - Index to commit
   * @return {Promise<Object>} Committed entry
   */
  async commit(index) {
    if (stryMutAct_9fa48("127053")) {
      {}
    } else {
      stryCov_9fa48("127053");
      const entry = await this.get(index);
      if (stryMutAct_9fa48("127056") ? false : stryMutAct_9fa48("127055") ? true : stryMutAct_9fa48("127054") ? entry : (stryCov_9fa48("127054", "127055", "127056"), !entry)) {
        if (stryMutAct_9fa48("127057")) {
          {}
        } else {
          stryCov_9fa48("127057");
          return stryMutAct_9fa48("127058") ? {} : (stryCov_9fa48("127058"), {
            index,
            term: this.node ? this.node.term : NUM.ZERO,
            committed: stryMutAct_9fa48("127059") ? true : (stryCov_9fa48("127059"), false)
          });
        }
      }
      entry.committed = stryMutAct_9fa48("127060") ? false : (stryCov_9fa48("127060"), true);
      this.committedIndex = index;
      this.entries.set(index, entry);
      this.compactCommittedEntries();
      return entry;
    }
  }

  /**
   * Remove committed entries older than the retention window.
   * Keeps the most recent IN_MEMORY_LOG_COMPACTION_RETENTION entries
   * so slow followers can still catch up via getEntriesAfter.
   * @private
   */
  compactCommittedEntries() {
    if (stryMutAct_9fa48("127061")) {
      {}
    } else {
      stryCov_9fa48("127061");
      if (stryMutAct_9fa48("127065") ? this.entries.size > IN_MEMORY_LOG_COMPACTION_RETENTION : stryMutAct_9fa48("127064") ? this.entries.size < IN_MEMORY_LOG_COMPACTION_RETENTION : stryMutAct_9fa48("127063") ? false : stryMutAct_9fa48("127062") ? true : (stryCov_9fa48("127062", "127063", "127064", "127065"), this.entries.size <= IN_MEMORY_LOG_COMPACTION_RETENTION)) {
        if (stryMutAct_9fa48("127066")) {
          {}
        } else {
          stryCov_9fa48("127066");
          return;
        }
      }
      const cutoff = stryMutAct_9fa48("127067") ? this.committedIndex + IN_MEMORY_LOG_COMPACTION_RETENTION : (stryCov_9fa48("127067"), this.committedIndex - IN_MEMORY_LOG_COMPACTION_RETENTION);
      if (stryMutAct_9fa48("127071") ? cutoff > NUM.ZERO : stryMutAct_9fa48("127070") ? cutoff < NUM.ZERO : stryMutAct_9fa48("127069") ? false : stryMutAct_9fa48("127068") ? true : (stryCov_9fa48("127068", "127069", "127070", "127071"), cutoff <= NUM.ZERO)) {
        if (stryMutAct_9fa48("127072")) {
          {}
        } else {
          stryCov_9fa48("127072");
          return;
        }
      }
      for (const key of this.entries.keys()) {
        if (stryMutAct_9fa48("127073")) {
          {}
        } else {
          stryCov_9fa48("127073");
          if (stryMutAct_9fa48("127077") ? key > cutoff : stryMutAct_9fa48("127076") ? key < cutoff : stryMutAct_9fa48("127075") ? false : stryMutAct_9fa48("127074") ? true : (stryCov_9fa48("127074", "127075", "127076", "127077"), key <= cutoff)) {
            if (stryMutAct_9fa48("127078")) {
              {}
            } else {
              stryCov_9fa48("127078");
              this.entries.delete(key);
            }
          }
        }
      }
    }
  }

  /**
   * End the log (cleanup).
   * @return {boolean} Success
   */
  end() {
    if (stryMutAct_9fa48("127079")) {
      {}
    } else {
      stryCov_9fa48("127079");
      this.entries.clear();
      this.lastIndex = NUM.ZERO;
      this.committedIndex = NUM.ZERO;
      return stryMutAct_9fa48("127080") ? false : (stryCov_9fa48("127080"), true);
    }
  }

  /**
   * Reset all state (for testing).
   */
  reset() {
    if (stryMutAct_9fa48("127081")) {
      {}
    } else {
      stryCov_9fa48("127081");
      this.entries.clear();
      this.lastIndex = NUM.ZERO;
      this.committedIndex = NUM.ZERO;
    }
  }
}
export { InMemoryLogAdapter, IN_MEMORY_LOG_COMPACTION_RETENTION };