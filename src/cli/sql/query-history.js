/**
 * QueryHistory - Manages SQL query history with persistence
 *
 * Stores previously executed queries for reuse, with support for
 * persistence to disk and a configurable maximum entry limit.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {CLI_DEFAULT, CLI_PATH} from '../cli-constants.js';

const LOCAL_STR_1XNND = '~';
const LOCAL_NUM_ONE = 1;
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_TWO = 2;

/**
 * Default maximum number of history entries
 */
export const DEFAULT_MAX_ENTRIES = CLI_DEFAULT.MAX_HISTORY;

/**
 * Default persistence path
 */
export const DEFAULT_PERSIST_PATH = path.posix.join(
  LOCAL_STR_1XNND,
  CLI_PATH.CONFIG_DIR_NAME,
  CLI_PATH.QUERY_HISTORY_FILE,
);

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
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.persistPath = options.persistPath || null;
    this.autoSave = options.autoSave !== false;
    this.entries = [];

    // Auto-load if path provided and autoLoad not disabled
    if (this.persistPath && options.autoLoad !== false) {
      this.load();
    }
  }

  /**
   * Add a query to history
   * Requirements: 8.1, 8.4
   * @param {string} query - Query to add
   */
  add(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return;
    }

    // Remove existing entry if present (to move to front)
    const existingIndex = this.entries.indexOf(trimmed);
    if (existingIndex !== -LOCAL_NUM_ONE) {
      this.entries.splice(existingIndex, LOCAL_NUM_ONE);
    }

    // Add to front
    this.entries.unshift(trimmed);

    // Enforce max entries limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(LOCAL_NUM_ZERO, this.maxEntries);
    }

    // Auto-save if enabled
    if (this.autoSave && this.persistPath) {
      this.save();
    }
  }

  /**
   * Get entry at index
   * Requirements: 8.2, 8.5
   * @param {number} index - Index (0 = most recent)
   * @return {string|null} Query at index or null
   */
  getAt(index) {
    if (index < LOCAL_NUM_ZERO || index >= this.entries.length) {
      return null;
    }
    return this.entries[index];
  }

  /**
   * Get all entries
   * @return {Array<string>} All history entries
   */
  getAll() {
    return [...this.entries];
  }

  /**
   * Get the number of entries
   * @return {number} Entry count
   */
  get length() {
    return this.entries.length;
  }

  /**
   * Clear all history
   */
  clear() {
    this.entries = [];
    if (this.autoSave && this.persistPath) {
      this.save();
    }
  }

  /**
   * Check if history contains a query
   * @param {string} query - Query to check
   * @return {boolean} True if query exists
   */
  contains(query) {
    const trimmed = (query || '').trim();
    return this.entries.includes(trimmed);
  }

  /**
   * Search history for matching queries
   * @param {string} pattern - Search pattern
   * @return {Array<string>} Matching queries
   */
  search(pattern) {
    if (!pattern) {
      return this.getAll();
    }
    const lowerPattern = pattern.toLowerCase();
    return this.entries.filter((entry) =>
      entry.toLowerCase().includes(lowerPattern),
    );
  }

  /**
   * Load history from disk
   * Requirements: 8.3
   */
  load() {
    if (!this.persistPath) {
      return;
    }

    try {
      const resolvedPath = this.resolvePath(this.persistPath);
      if (fs.existsSync(resolvedPath)) {
        const data = fs.readFileSync(resolvedPath, 'utf8');
        const parsed = JSON.parse(data);

        if (Array.isArray(parsed)) {
          // Validate and filter entries
          this.entries = parsed
            .filter((entry) => typeof entry === LOCAL_STR_STRING && entry.trim())
            .slice(LOCAL_NUM_ZERO, this.maxEntries);
        }
      }
    } catch (_error) {
      // Ignore load errors, start with empty history
      this.entries = [];
    }
  }

  /**
   * Save history to disk
   * Requirements: 8.3
   */
  save() {
    if (!this.persistPath) {
      return;
    }

    try {
      const resolvedPath = this.resolvePath(this.persistPath);
      const dir = path.dirname(resolvedPath);

      // Create directory if needed
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
      }

      fs.writeFileSync(resolvedPath, JSON.stringify(this.entries, null, LOCAL_NUM_TWO));
    } catch (_error) {
      // Ignore save errors
    }
  }

  /**
   * Serialize history to JSON string
   * @return {string} JSON string
   */
  serialize() {
    return JSON.stringify(this.entries);
  }

  /**
   * Deserialize history from JSON string
   * @param {string} json - JSON string
   */
  deserialize(json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        this.entries = parsed
          .filter((entry) => typeof entry === LOCAL_STR_STRING && entry.trim())
          .slice(LOCAL_NUM_ZERO, this.maxEntries);
      }
    } catch (_error) {
      // Ignore parse errors
    }
  }

  /**
   * Resolve path with home directory expansion
   * @param {string} p - Path to resolve
   * @return {string} Resolved path
   */
  resolvePath(p) {
    if (!p) return p;
    if (p.startsWith(LOCAL_STR_1XNND)) {
      return path.join(os.homedir(), p.slice(LOCAL_NUM_ONE));
    }
    return p;
  }

  /**
   * Get the most recent query
   * @return {string|null} Most recent query or null
   */
  getMostRecent() {
    return this.getAt(LOCAL_NUM_ZERO);
  }

  /**
   * Remove a specific query from history
   * @param {string} query - Query to remove
   * @return {boolean} True if removed
   */
  remove(query) {
    const trimmed = (query || '').trim();
    const index = this.entries.indexOf(trimmed);
    if (index !== -LOCAL_NUM_ONE) {
      this.entries.splice(index, LOCAL_NUM_ONE);
      if (this.autoSave && this.persistPath) {
        this.save();
      }
      return true;
    }
    return false;
  }
}
