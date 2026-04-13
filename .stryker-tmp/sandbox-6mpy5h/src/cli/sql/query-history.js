/**
 * QueryHistory - Manages SQL query history with persistence
 *
 * Stores previously executed queries for reuse, with support for
 * persistence to disk and a configurable maximum entry limit.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
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
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CLI_DEFAULT, CLI_PATH } from '../cli-constants.js';

/**
 * Default maximum number of history entries
 */
export const DEFAULT_MAX_ENTRIES = CLI_DEFAULT.MAX_HISTORY;

/**
 * Default persistence path
 */
export const DEFAULT_PERSIST_PATH = path.posix.join(stryMutAct_9fa48("46762") ? "" : (stryCov_9fa48("46762"), '~'), CLI_PATH.CONFIG_DIR_NAME, CLI_PATH.QUERY_HISTORY_FILE);

/**
 * QueryHistory class for managing query history
 */
export class QueryHistory {
  /**
   * Creates a new QueryHistory
   * @param {Object} options - History options
   * @param {number} [options.maxEntries=100] - Maximum entries to store
   * @param {string} [options.persistPath] - Path for persistence
   * @param {boolean} [options.autoLoad=true] - Auto-load on creation
   * @param {boolean} [options.autoSave=true] - Auto-save on changes
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("46763")) {
      {}
    } else {
      stryCov_9fa48("46763");
      this.maxEntries = stryMutAct_9fa48("46766") ? options.maxEntries && DEFAULT_MAX_ENTRIES : stryMutAct_9fa48("46765") ? false : stryMutAct_9fa48("46764") ? true : (stryCov_9fa48("46764", "46765", "46766"), options.maxEntries || DEFAULT_MAX_ENTRIES);
      this.persistPath = stryMutAct_9fa48("46769") ? options.persistPath && null : stryMutAct_9fa48("46768") ? false : stryMutAct_9fa48("46767") ? true : (stryCov_9fa48("46767", "46768", "46769"), options.persistPath || null);
      this.autoSave = stryMutAct_9fa48("46772") ? options.autoSave === false : stryMutAct_9fa48("46771") ? false : stryMutAct_9fa48("46770") ? true : (stryCov_9fa48("46770", "46771", "46772"), options.autoSave !== (stryMutAct_9fa48("46773") ? true : (stryCov_9fa48("46773"), false)));
      this.entries = stryMutAct_9fa48("46774") ? ["Stryker was here"] : (stryCov_9fa48("46774"), []);

      // Auto-load if path provided and autoLoad not disabled
      if (stryMutAct_9fa48("46777") ? this.persistPath || options.autoLoad !== false : stryMutAct_9fa48("46776") ? false : stryMutAct_9fa48("46775") ? true : (stryCov_9fa48("46775", "46776", "46777"), this.persistPath && (stryMutAct_9fa48("46779") ? options.autoLoad === false : stryMutAct_9fa48("46778") ? true : (stryCov_9fa48("46778", "46779"), options.autoLoad !== (stryMutAct_9fa48("46780") ? true : (stryCov_9fa48("46780"), false)))))) {
        if (stryMutAct_9fa48("46781")) {
          {}
        } else {
          stryCov_9fa48("46781");
          this.load();
        }
      }
    }
  }

  /**
   * Add a query to history
   * Requirements: 8.1, 8.4
   * @param {string} query - Query to add
   */
  add(query) {
    if (stryMutAct_9fa48("46782")) {
      {}
    } else {
      stryCov_9fa48("46782");
      const trimmed = stryMutAct_9fa48("46783") ? query || '' : (stryCov_9fa48("46783"), (stryMutAct_9fa48("46786") ? query && '' : stryMutAct_9fa48("46785") ? false : stryMutAct_9fa48("46784") ? true : (stryCov_9fa48("46784", "46785", "46786"), query || (stryMutAct_9fa48("46787") ? "Stryker was here!" : (stryCov_9fa48("46787"), '')))).trim());
      if (stryMutAct_9fa48("46790") ? false : stryMutAct_9fa48("46789") ? true : stryMutAct_9fa48("46788") ? trimmed : (stryCov_9fa48("46788", "46789", "46790"), !trimmed)) {
        if (stryMutAct_9fa48("46791")) {
          {}
        } else {
          stryCov_9fa48("46791");
          return;
        }
      }

      // Remove existing entry if present (to move to front)
      const existingIndex = this.entries.indexOf(trimmed);
      if (stryMutAct_9fa48("46794") ? existingIndex === -1 : stryMutAct_9fa48("46793") ? false : stryMutAct_9fa48("46792") ? true : (stryCov_9fa48("46792", "46793", "46794"), existingIndex !== (stryMutAct_9fa48("46795") ? +1 : (stryCov_9fa48("46795"), -1)))) {
        if (stryMutAct_9fa48("46796")) {
          {}
        } else {
          stryCov_9fa48("46796");
          this.entries.splice(existingIndex, 1);
        }
      }

      // Add to front
      this.entries.unshift(trimmed);

      // Enforce max entries limit
      if (stryMutAct_9fa48("46800") ? this.entries.length <= this.maxEntries : stryMutAct_9fa48("46799") ? this.entries.length >= this.maxEntries : stryMutAct_9fa48("46798") ? false : stryMutAct_9fa48("46797") ? true : (stryCov_9fa48("46797", "46798", "46799", "46800"), this.entries.length > this.maxEntries)) {
        if (stryMutAct_9fa48("46801")) {
          {}
        } else {
          stryCov_9fa48("46801");
          this.entries = stryMutAct_9fa48("46802") ? this.entries : (stryCov_9fa48("46802"), this.entries.slice(0, this.maxEntries));
        }
      }

      // Auto-save if enabled
      if (stryMutAct_9fa48("46805") ? this.autoSave || this.persistPath : stryMutAct_9fa48("46804") ? false : stryMutAct_9fa48("46803") ? true : (stryCov_9fa48("46803", "46804", "46805"), this.autoSave && this.persistPath)) {
        if (stryMutAct_9fa48("46806")) {
          {}
        } else {
          stryCov_9fa48("46806");
          this.save();
        }
      }
    }
  }

  /**
   * Get entry at index
   * Requirements: 8.2, 8.5
   * @param {number} index - Index (0 = most recent)
   * @return {string|null} Query at index or null
   */
  getAt(index) {
    if (stryMutAct_9fa48("46807")) {
      {}
    } else {
      stryCov_9fa48("46807");
      if (stryMutAct_9fa48("46810") ? index < 0 && index >= this.entries.length : stryMutAct_9fa48("46809") ? false : stryMutAct_9fa48("46808") ? true : (stryCov_9fa48("46808", "46809", "46810"), (stryMutAct_9fa48("46813") ? index >= 0 : stryMutAct_9fa48("46812") ? index <= 0 : stryMutAct_9fa48("46811") ? false : (stryCov_9fa48("46811", "46812", "46813"), index < 0)) || (stryMutAct_9fa48("46816") ? index < this.entries.length : stryMutAct_9fa48("46815") ? index > this.entries.length : stryMutAct_9fa48("46814") ? false : (stryCov_9fa48("46814", "46815", "46816"), index >= this.entries.length)))) {
        if (stryMutAct_9fa48("46817")) {
          {}
        } else {
          stryCov_9fa48("46817");
          return null;
        }
      }
      return this.entries[index];
    }
  }

  /**
   * Get all entries
   * @return {Array<string>} All history entries
   */
  getAll() {
    if (stryMutAct_9fa48("46818")) {
      {}
    } else {
      stryCov_9fa48("46818");
      return stryMutAct_9fa48("46819") ? [] : (stryCov_9fa48("46819"), [...this.entries]);
    }
  }

  /**
   * Get the number of entries
   * @return {number} Entry count
   */
  get length() {
    if (stryMutAct_9fa48("46820")) {
      {}
    } else {
      stryCov_9fa48("46820");
      return this.entries.length;
    }
  }

  /**
   * Clear all history
   */
  clear() {
    if (stryMutAct_9fa48("46821")) {
      {}
    } else {
      stryCov_9fa48("46821");
      this.entries = stryMutAct_9fa48("46822") ? ["Stryker was here"] : (stryCov_9fa48("46822"), []);
      if (stryMutAct_9fa48("46825") ? this.autoSave || this.persistPath : stryMutAct_9fa48("46824") ? false : stryMutAct_9fa48("46823") ? true : (stryCov_9fa48("46823", "46824", "46825"), this.autoSave && this.persistPath)) {
        if (stryMutAct_9fa48("46826")) {
          {}
        } else {
          stryCov_9fa48("46826");
          this.save();
        }
      }
    }
  }

  /**
   * Check if history contains a query
   * @param {string} query - Query to check
   * @return {boolean} True if query exists
   */
  contains(query) {
    if (stryMutAct_9fa48("46827")) {
      {}
    } else {
      stryCov_9fa48("46827");
      const trimmed = stryMutAct_9fa48("46828") ? query || '' : (stryCov_9fa48("46828"), (stryMutAct_9fa48("46831") ? query && '' : stryMutAct_9fa48("46830") ? false : stryMutAct_9fa48("46829") ? true : (stryCov_9fa48("46829", "46830", "46831"), query || (stryMutAct_9fa48("46832") ? "Stryker was here!" : (stryCov_9fa48("46832"), '')))).trim());
      return this.entries.includes(trimmed);
    }
  }

  /**
   * Search history for matching queries
   * @param {string} pattern - Search pattern
   * @return {Array<string>} Matching queries
   */
  search(pattern) {
    if (stryMutAct_9fa48("46833")) {
      {}
    } else {
      stryCov_9fa48("46833");
      if (stryMutAct_9fa48("46836") ? false : stryMutAct_9fa48("46835") ? true : stryMutAct_9fa48("46834") ? pattern : (stryCov_9fa48("46834", "46835", "46836"), !pattern)) {
        if (stryMutAct_9fa48("46837")) {
          {}
        } else {
          stryCov_9fa48("46837");
          return this.getAll();
        }
      }
      const lowerPattern = stryMutAct_9fa48("46838") ? pattern.toUpperCase() : (stryCov_9fa48("46838"), pattern.toLowerCase());
      return stryMutAct_9fa48("46839") ? this.entries : (stryCov_9fa48("46839"), this.entries.filter(stryMutAct_9fa48("46840") ? () => undefined : (stryCov_9fa48("46840"), entry => stryMutAct_9fa48("46841") ? entry.toUpperCase().includes(lowerPattern) : (stryCov_9fa48("46841"), entry.toLowerCase().includes(lowerPattern)))));
    }
  }

  /**
   * Load history from disk
   * Requirements: 8.3
   */
  load() {
    if (stryMutAct_9fa48("46842")) {
      {}
    } else {
      stryCov_9fa48("46842");
      if (stryMutAct_9fa48("46845") ? false : stryMutAct_9fa48("46844") ? true : stryMutAct_9fa48("46843") ? this.persistPath : (stryCov_9fa48("46843", "46844", "46845"), !this.persistPath)) {
        if (stryMutAct_9fa48("46846")) {
          {}
        } else {
          stryCov_9fa48("46846");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("46847")) {
          {}
        } else {
          stryCov_9fa48("46847");
          const resolvedPath = this.resolvePath(this.persistPath);
          if (stryMutAct_9fa48("46849") ? false : stryMutAct_9fa48("46848") ? true : (stryCov_9fa48("46848", "46849"), fs.existsSync(resolvedPath))) {
            if (stryMutAct_9fa48("46850")) {
              {}
            } else {
              stryCov_9fa48("46850");
              const data = fs.readFileSync(resolvedPath, stryMutAct_9fa48("46851") ? "" : (stryCov_9fa48("46851"), 'utf8'));
              const parsed = JSON.parse(data);
              if (stryMutAct_9fa48("46853") ? false : stryMutAct_9fa48("46852") ? true : (stryCov_9fa48("46852", "46853"), Array.isArray(parsed))) {
                if (stryMutAct_9fa48("46854")) {
                  {}
                } else {
                  stryCov_9fa48("46854");
                  // Validate and filter entries
                  this.entries = stryMutAct_9fa48("46856") ? parsed.slice(0, this.maxEntries) : stryMutAct_9fa48("46855") ? parsed.filter(entry => typeof entry === 'string' && entry.trim()) : (stryCov_9fa48("46855", "46856"), parsed.filter(stryMutAct_9fa48("46857") ? () => undefined : (stryCov_9fa48("46857"), entry => stryMutAct_9fa48("46860") ? typeof entry === 'string' || entry.trim() : stryMutAct_9fa48("46859") ? false : stryMutAct_9fa48("46858") ? true : (stryCov_9fa48("46858", "46859", "46860"), (stryMutAct_9fa48("46862") ? typeof entry !== 'string' : stryMutAct_9fa48("46861") ? true : (stryCov_9fa48("46861", "46862"), typeof entry === (stryMutAct_9fa48("46863") ? "" : (stryCov_9fa48("46863"), 'string')))) && (stryMutAct_9fa48("46864") ? entry : (stryCov_9fa48("46864"), entry.trim()))))).slice(0, this.maxEntries));
                }
              }
            }
          }
        }
      } catch (_error) {
        if (stryMutAct_9fa48("46865")) {
          {}
        } else {
          stryCov_9fa48("46865");
          // Ignore load errors, start with empty history
          this.entries = stryMutAct_9fa48("46866") ? ["Stryker was here"] : (stryCov_9fa48("46866"), []);
        }
      }
    }
  }

  /**
   * Save history to disk
   * Requirements: 8.3
   */
  save() {
    if (stryMutAct_9fa48("46867")) {
      {}
    } else {
      stryCov_9fa48("46867");
      if (stryMutAct_9fa48("46870") ? false : stryMutAct_9fa48("46869") ? true : stryMutAct_9fa48("46868") ? this.persistPath : (stryCov_9fa48("46868", "46869", "46870"), !this.persistPath)) {
        if (stryMutAct_9fa48("46871")) {
          {}
        } else {
          stryCov_9fa48("46871");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("46872")) {
          {}
        } else {
          stryCov_9fa48("46872");
          const resolvedPath = this.resolvePath(this.persistPath);
          const dir = path.dirname(resolvedPath);

          // Create directory if needed
          if (stryMutAct_9fa48("46875") ? false : stryMutAct_9fa48("46874") ? true : stryMutAct_9fa48("46873") ? fs.existsSync(dir) : (stryCov_9fa48("46873", "46874", "46875"), !fs.existsSync(dir))) {
            if (stryMutAct_9fa48("46876")) {
              {}
            } else {
              stryCov_9fa48("46876");
              fs.mkdirSync(dir, stryMutAct_9fa48("46877") ? {} : (stryCov_9fa48("46877"), {
                recursive: stryMutAct_9fa48("46878") ? false : (stryCov_9fa48("46878"), true)
              }));
            }
          }
          fs.writeFileSync(resolvedPath, JSON.stringify(this.entries, null, 2));
        }
      } catch (_error) {
        // Ignore save errors
      }
    }
  }

  /**
   * Serialize history to JSON string
   * @return {string} JSON string
   */
  serialize() {
    if (stryMutAct_9fa48("46879")) {
      {}
    } else {
      stryCov_9fa48("46879");
      return JSON.stringify(this.entries);
    }
  }

  /**
   * Deserialize history from JSON string
   * @param {string} json - JSON string
   */
  deserialize(json) {
    if (stryMutAct_9fa48("46880")) {
      {}
    } else {
      stryCov_9fa48("46880");
      try {
        if (stryMutAct_9fa48("46881")) {
          {}
        } else {
          stryCov_9fa48("46881");
          const parsed = JSON.parse(json);
          if (stryMutAct_9fa48("46883") ? false : stryMutAct_9fa48("46882") ? true : (stryCov_9fa48("46882", "46883"), Array.isArray(parsed))) {
            if (stryMutAct_9fa48("46884")) {
              {}
            } else {
              stryCov_9fa48("46884");
              this.entries = stryMutAct_9fa48("46886") ? parsed.slice(0, this.maxEntries) : stryMutAct_9fa48("46885") ? parsed.filter(entry => typeof entry === 'string' && entry.trim()) : (stryCov_9fa48("46885", "46886"), parsed.filter(stryMutAct_9fa48("46887") ? () => undefined : (stryCov_9fa48("46887"), entry => stryMutAct_9fa48("46890") ? typeof entry === 'string' || entry.trim() : stryMutAct_9fa48("46889") ? false : stryMutAct_9fa48("46888") ? true : (stryCov_9fa48("46888", "46889", "46890"), (stryMutAct_9fa48("46892") ? typeof entry !== 'string' : stryMutAct_9fa48("46891") ? true : (stryCov_9fa48("46891", "46892"), typeof entry === (stryMutAct_9fa48("46893") ? "" : (stryCov_9fa48("46893"), 'string')))) && (stryMutAct_9fa48("46894") ? entry : (stryCov_9fa48("46894"), entry.trim()))))).slice(0, this.maxEntries));
            }
          }
        }
      } catch (_error) {
        // Ignore parse errors
      }
    }
  }

  /**
   * Resolve path with home directory expansion
   * @param {string} p - Path to resolve
   * @return {string} Resolved path
   */
  resolvePath(p) {
    if (stryMutAct_9fa48("46895")) {
      {}
    } else {
      stryCov_9fa48("46895");
      if (stryMutAct_9fa48("46898") ? false : stryMutAct_9fa48("46897") ? true : stryMutAct_9fa48("46896") ? p : (stryCov_9fa48("46896", "46897", "46898"), !p)) return p;
      if (stryMutAct_9fa48("46901") ? p.endsWith('~') : stryMutAct_9fa48("46900") ? false : stryMutAct_9fa48("46899") ? true : (stryCov_9fa48("46899", "46900", "46901"), p.startsWith(stryMutAct_9fa48("46902") ? "" : (stryCov_9fa48("46902"), '~')))) {
        if (stryMutAct_9fa48("46903")) {
          {}
        } else {
          stryCov_9fa48("46903");
          return path.join(os.homedir(), stryMutAct_9fa48("46904") ? p : (stryCov_9fa48("46904"), p.slice(1)));
        }
      }
      return p;
    }
  }

  /**
   * Get the most recent query
   * @return {string|null} Most recent query or null
   */
  getMostRecent() {
    if (stryMutAct_9fa48("46905")) {
      {}
    } else {
      stryCov_9fa48("46905");
      return this.getAt(0);
    }
  }

  /**
   * Remove a specific query from history
   * @param {string} query - Query to remove
   * @return {boolean} True if removed
   */
  remove(query) {
    if (stryMutAct_9fa48("46906")) {
      {}
    } else {
      stryCov_9fa48("46906");
      const trimmed = stryMutAct_9fa48("46907") ? query || '' : (stryCov_9fa48("46907"), (stryMutAct_9fa48("46910") ? query && '' : stryMutAct_9fa48("46909") ? false : stryMutAct_9fa48("46908") ? true : (stryCov_9fa48("46908", "46909", "46910"), query || (stryMutAct_9fa48("46911") ? "Stryker was here!" : (stryCov_9fa48("46911"), '')))).trim());
      const index = this.entries.indexOf(trimmed);
      if (stryMutAct_9fa48("46914") ? index === -1 : stryMutAct_9fa48("46913") ? false : stryMutAct_9fa48("46912") ? true : (stryCov_9fa48("46912", "46913", "46914"), index !== (stryMutAct_9fa48("46915") ? +1 : (stryCov_9fa48("46915"), -1)))) {
        if (stryMutAct_9fa48("46916")) {
          {}
        } else {
          stryCov_9fa48("46916");
          this.entries.splice(index, 1);
          if (stryMutAct_9fa48("46919") ? this.autoSave || this.persistPath : stryMutAct_9fa48("46918") ? false : stryMutAct_9fa48("46917") ? true : (stryCov_9fa48("46917", "46918", "46919"), this.autoSave && this.persistPath)) {
            if (stryMutAct_9fa48("46920")) {
              {}
            } else {
              stryCov_9fa48("46920");
              this.save();
            }
          }
          return stryMutAct_9fa48("46921") ? false : (stryCov_9fa48("46921"), true);
        }
      }
      return stryMutAct_9fa48("46922") ? true : (stryCov_9fa48("46922"), false);
    }
  }
}