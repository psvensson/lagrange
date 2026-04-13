/**
 * DWARF indexing pipeline orchestration.
 *
 * Parses module DWARF metadata, builds indexes, and caches results.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { DWARF_INDEX_VALUE as VALUE, DWARF_INDEX_ERROR_MSG as ERR } from './dwarf-index-constants.js';
import { VscodeDwarfParserBackend, validateDwarfModuleRequest } from './vscode-dwarf-parser-backend.js';
import { buildDwarfIndex } from './dwarf-index-builder.js';
import { DwarfIndexCache } from './dwarf-index-cache.js';

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
    if (stryMutAct_9fa48("77499")) {
      {}
    } else {
      stryCov_9fa48("77499");
      this._parserBackend = stryMutAct_9fa48("77502") ? options.parserBackend && new VscodeDwarfParserBackend() : stryMutAct_9fa48("77501") ? false : stryMutAct_9fa48("77500") ? true : (stryCov_9fa48("77500", "77501", "77502"), options.parserBackend || new VscodeDwarfParserBackend());
      this._cache = stryMutAct_9fa48("77505") ? options.cache && new DwarfIndexCache() : stryMutAct_9fa48("77504") ? false : stryMutAct_9fa48("77503") ? true : (stryCov_9fa48("77503", "77504", "77505"), options.cache || new DwarfIndexCache());
      this._buildIndex = stryMutAct_9fa48("77508") ? options.buildIndex && buildDwarfIndex : stryMutAct_9fa48("77507") ? false : stryMutAct_9fa48("77506") ? true : (stryCov_9fa48("77506", "77507", "77508"), options.buildIndex || buildDwarfIndex);
    }
  }

  /**
   * Parse + build + cache a module index.
   *
   * @param {Object} request - Module parse request.
   * @return {Promise<Object>} Built DWARF index.
   */
  async getModuleIndex(request) {
    if (stryMutAct_9fa48("77509")) {
      {}
    } else {
      stryCov_9fa48("77509");
      validateDwarfModuleRequest(request);
      const cacheKey = buildDwarfIndexCacheKey(request.moduleRef, request.moduleDigest);
      return await this._cache.getOrCreate(cacheKey, async () => {
        if (stryMutAct_9fa48("77510")) {
          {}
        } else {
          stryCov_9fa48("77510");
          const parseResult = await this._parserBackend.parseModule(request);
          return this._buildIndex(parseResult);
        }
      });
    }
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
    if (stryMutAct_9fa48("77511")) {
      {}
    } else {
      stryCov_9fa48("77511");
      assertModuleIdentityRequest(request);
      const cacheKey = buildDwarfIndexCacheKey(request.moduleRef, request.moduleDigest);
      return this._cache.get(cacheKey);
    }
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
    if (stryMutAct_9fa48("77512")) {
      {}
    } else {
      stryCov_9fa48("77512");
      assertModuleIdentityRequest(request);
      const cacheKey = buildDwarfIndexCacheKey(request.moduleRef, request.moduleDigest);
      return this._cache.delete(cacheKey);
    }
  }

  /**
   * Clear the full index cache.
   */
  clearCache() {
    if (stryMutAct_9fa48("77513")) {
      {}
    } else {
      stryCov_9fa48("77513");
      this._cache.clear();
    }
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
  if (stryMutAct_9fa48("77514")) {
    {}
  } else {
    stryCov_9fa48("77514");
    if (stryMutAct_9fa48("77517") ? false : stryMutAct_9fa48("77516") ? true : stryMutAct_9fa48("77515") ? isNonEmptyString(moduleRef) : (stryCov_9fa48("77515", "77516", "77517"), !isNonEmptyString(moduleRef))) {
      if (stryMutAct_9fa48("77518")) {
        {}
      } else {
        stryCov_9fa48("77518");
        throw new Error(ERR.MODULE_REF_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77521") ? false : stryMutAct_9fa48("77520") ? true : stryMutAct_9fa48("77519") ? isNonEmptyString(moduleDigest) : (stryCov_9fa48("77519", "77520", "77521"), !isNonEmptyString(moduleDigest))) {
      if (stryMutAct_9fa48("77522")) {
        {}
      } else {
        stryCov_9fa48("77522");
        throw new Error(ERR.MODULE_DIGEST_REQUIRED);
      }
    }
    return (stryMutAct_9fa48("77523") ? [] : (stryCov_9fa48("77523"), [moduleRef, moduleDigest])).join(VALUE.MODULE_CACHE_KEY_SEPARATOR);
  }
}

/**
 * Validate module identity shape for cache-only operations.
 *
 * @param {Object} request - Request payload.
 */
function assertModuleIdentityRequest(request) {
  if (stryMutAct_9fa48("77524")) {
    {}
  } else {
    stryCov_9fa48("77524");
    if (stryMutAct_9fa48("77527") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("77526") ? false : stryMutAct_9fa48("77525") ? true : (stryCov_9fa48("77525", "77526", "77527"), (stryMutAct_9fa48("77528") ? request : (stryCov_9fa48("77528"), !request)) || (stryMutAct_9fa48("77530") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("77529") ? false : (stryCov_9fa48("77529", "77530"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77531")) {
        {}
      } else {
        stryCov_9fa48("77531");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77534") ? false : stryMutAct_9fa48("77533") ? true : stryMutAct_9fa48("77532") ? isNonEmptyString(request.moduleRef) : (stryCov_9fa48("77532", "77533", "77534"), !isNonEmptyString(request.moduleRef))) {
      if (stryMutAct_9fa48("77535")) {
        {}
      } else {
        stryCov_9fa48("77535");
        throw new Error(ERR.MODULE_REF_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77538") ? false : stryMutAct_9fa48("77537") ? true : stryMutAct_9fa48("77536") ? isNonEmptyString(request.moduleDigest) : (stryCov_9fa48("77536", "77537", "77538"), !isNonEmptyString(request.moduleDigest))) {
      if (stryMutAct_9fa48("77539")) {
        {}
      } else {
        stryCov_9fa48("77539");
        throw new Error(ERR.MODULE_DIGEST_REQUIRED);
      }
    }
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("77540")) {
    {}
  } else {
    stryCov_9fa48("77540");
    return stryMutAct_9fa48("77543") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("77542") ? false : stryMutAct_9fa48("77541") ? true : (stryCov_9fa48("77541", "77542", "77543"), (stryMutAct_9fa48("77545") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("77544") ? true : (stryCov_9fa48("77544", "77545"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("77548") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("77547") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("77546") ? true : (stryCov_9fa48("77546", "77547", "77548"), (stryMutAct_9fa48("77549") ? value.length : (stryCov_9fa48("77549"), value.trim().length)) > NUM.ZERO)));
  }
}
export { DwarfIndexPipeline, buildDwarfIndexCacheKey };