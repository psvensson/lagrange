/**
 * DWARF indexing pipeline orchestration.
 *
 * Parses module DWARF metadata, builds indexes, and caches results.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  DWARF_INDEX_VALUE as VALUE,
  DWARF_INDEX_ERROR_MSG as ERR,
} from './dwarf-index-constants.js';
import {
  VscodeDwarfParserBackend,
  validateDwarfModuleRequest,
} from './vscode-dwarf-parser-backend.js';
import {buildDwarfIndex} from './dwarf-index-builder.js';
import {DwarfIndexCache} from './dwarf-index-cache.js';

/**
 * Orchestrates parser + builder + cache for DWARF indexes.
 */
class DwarfIndexPipeline {
  /**
   * @param {Object} [options]
   * @param {Object} [options.parserBackend] - Parse backend.
   * @param {Object} [options.cache] - Cache instance.
   * @param {Function} [options.buildIndex] - Index builder.
   */
  constructor(options = {}) {
    this._parserBackend =
      options.parserBackend || new VscodeDwarfParserBackend();
    this._cache = options.cache || new DwarfIndexCache();
    this._buildIndex = options.buildIndex || buildDwarfIndex;
  }

  /**
   * Parse + build + cache a module index.
   *
   * @param {Object} request - Module parse request.
   * @return {Promise<Object>} Built DWARF index.
   */
  async getModuleIndex(request) {
    validateDwarfModuleRequest(request);
    const cacheKey = buildDwarfIndexCacheKey(
      request.moduleRef,
      request.moduleDigest,
    );

    return await this._cache.getOrCreate(cacheKey, async () => {
      const parseResult = await this._parserBackend.parseModule(request);
      return this._buildIndex(parseResult);
    });
  }

  /**
   * Get cached index without parsing.
   *
   * @param {Object} request - Module identity request.
   * @param {string} request.moduleRef - Module ref.
   * @param {string} request.moduleDigest - Module digest.
   * @return {Object|null} Cached index.
   */
  getCachedModuleIndex(request) {
    assertModuleIdentityRequest(request);
    const cacheKey = buildDwarfIndexCacheKey(
      request.moduleRef,
      request.moduleDigest,
    );
    return this._cache.get(cacheKey);
  }

  /**
   * Evict a module index from cache.
   *
   * @param {Object} request - Module identity request.
   * @param {string} request.moduleRef - Module ref.
   * @param {string} request.moduleDigest - Module digest.
   * @return {boolean} True if an entry was removed.
   */
  evictModuleIndex(request) {
    assertModuleIdentityRequest(request);
    const cacheKey = buildDwarfIndexCacheKey(
      request.moduleRef,
      request.moduleDigest,
    );
    return this._cache.delete(cacheKey);
  }

  /**
   * Clear the full index cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

/**
 * Build a deterministic cache key from module identity.
 *
 * @param {string} moduleRef - Module reference.
 * @param {string} moduleDigest - Module digest.
 * @return {string} Cache key.
 */
function buildDwarfIndexCacheKey(moduleRef, moduleDigest) {
  if (!isNonEmptyString(moduleRef)) {
    throw new Error(ERR.MODULE_REF_REQUIRED);
  }
  if (!isNonEmptyString(moduleDigest)) {
    throw new Error(ERR.MODULE_DIGEST_REQUIRED);
  }

  return [
    moduleRef,
    moduleDigest,
  ].join(VALUE.MODULE_CACHE_KEY_SEPARATOR);
}

/**
 * Validate module identity shape for cache-only operations.
 *
 * @param {Object} request - Request payload.
 */
function assertModuleIdentityRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
  if (!isNonEmptyString(request.moduleRef)) {
    throw new Error(ERR.MODULE_REF_REQUIRED);
  }
  if (!isNonEmptyString(request.moduleDigest)) {
    throw new Error(ERR.MODULE_DIGEST_REQUIRED);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

export {
  DwarfIndexPipeline,
  buildDwarfIndexCacheKey,
};
