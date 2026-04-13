/**
 * Lookup primitive — ctx.lookup(table, keys[]).
 *
 * Vectorized/batched key fetch with deduplication and access
 * path enforcement. Only primary key, unique index, or bounded
 * index lookups are allowed.
 *
 * Requirements: 5.1, 5.2
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
import { LOOKUP_MAX_KEYS, LOOKUP_MAX_BYTES } from '../wasm-service/query-budget-constants.js';
import { LOOKUP_ACCESS_PATH, LOOKUP_KEY_FIELD, LOOKUP_RESULT_FIELD as LRF, PRIMITIVE_ERROR_MSG, PRIMITIVE_TYPE } from './distributed/distributed-context-constants.js';

/**
 * Set of allowed access path values for fast membership check.
 * @type {Set<string>}
 */
const KEY_SERIALIZATION_DELIMITER = stryMutAct_9fa48("113210") ? "" : (stryCov_9fa48("113210"), '\0');
const ALLOWED_ACCESS_PATHS = new Set(stryMutAct_9fa48("113211") ? [] : (stryCov_9fa48("113211"), [LOOKUP_ACCESS_PATH.PRIMARY_KEY, LOOKUP_ACCESS_PATH.UNIQUE_INDEX, LOOKUP_ACCESS_PATH.BOUNDED_INDEX]));

/**
 * Validate lookup arguments before execution.
 *
 * @param {string} table - Table name.
 * @param {Array<Object>} keys - Key-value objects.
 * @param {Object} budgets - Budget limits.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateLookupArgs(table, keys, budgets) {
  if (stryMutAct_9fa48("113212")) {
    {}
  } else {
    stryCov_9fa48("113212");
    if (stryMutAct_9fa48("113215") ? false : stryMutAct_9fa48("113214") ? true : stryMutAct_9fa48("113213") ? table : (stryCov_9fa48("113213", "113214", "113215"), !table)) {
      if (stryMutAct_9fa48("113216")) {
        {}
      } else {
        stryCov_9fa48("113216");
        return stryMutAct_9fa48("113217") ? {} : (stryCov_9fa48("113217"), {
          valid: stryMutAct_9fa48("113218") ? true : (stryCov_9fa48("113218"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("113221") ? typeof table === TYPEOF.STRING : stryMutAct_9fa48("113220") ? false : stryMutAct_9fa48("113219") ? true : (stryCov_9fa48("113219", "113220", "113221"), typeof table !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("113222")) {
        {}
      } else {
        stryCov_9fa48("113222");
        return stryMutAct_9fa48("113223") ? {} : (stryCov_9fa48("113223"), {
          valid: stryMutAct_9fa48("113224") ? true : (stryCov_9fa48("113224"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_TABLE_MUST_BE_STRING
        });
      }
    }
    if (stryMutAct_9fa48("113227") ? false : stryMutAct_9fa48("113226") ? true : stryMutAct_9fa48("113225") ? keys : (stryCov_9fa48("113225", "113226", "113227"), !keys)) {
      if (stryMutAct_9fa48("113228")) {
        {}
      } else {
        stryCov_9fa48("113228");
        return stryMutAct_9fa48("113229") ? {} : (stryCov_9fa48("113229"), {
          valid: stryMutAct_9fa48("113230") ? true : (stryCov_9fa48("113230"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("113233") ? false : stryMutAct_9fa48("113232") ? true : stryMutAct_9fa48("113231") ? Array.isArray(keys) : (stryCov_9fa48("113231", "113232", "113233"), !Array.isArray(keys))) {
      if (stryMutAct_9fa48("113234")) {
        {}
      } else {
        stryCov_9fa48("113234");
        return stryMutAct_9fa48("113235") ? {} : (stryCov_9fa48("113235"), {
          valid: stryMutAct_9fa48("113236") ? true : (stryCov_9fa48("113236"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_MUST_BE_ARRAY
        });
      }
    }
    if (stryMutAct_9fa48("113239") ? keys.length !== NUM.ZERO : stryMutAct_9fa48("113238") ? false : stryMutAct_9fa48("113237") ? true : (stryCov_9fa48("113237", "113238", "113239"), keys.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("113240")) {
        {}
      } else {
        stryCov_9fa48("113240");
        return stryMutAct_9fa48("113241") ? {} : (stryCov_9fa48("113241"), {
          valid: stryMutAct_9fa48("113242") ? true : (stryCov_9fa48("113242"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_KEYS_EMPTY
        });
      }
    }
    for (const key of keys) {
      if (stryMutAct_9fa48("113243")) {
        {}
      } else {
        stryCov_9fa48("113243");
        if (stryMutAct_9fa48("113246") ? key[LOOKUP_KEY_FIELD.COLUMN] === undefined && key[LOOKUP_KEY_FIELD.COLUMN] === null : stryMutAct_9fa48("113245") ? false : stryMutAct_9fa48("113244") ? true : (stryCov_9fa48("113244", "113245", "113246"), (stryMutAct_9fa48("113248") ? key[LOOKUP_KEY_FIELD.COLUMN] !== undefined : stryMutAct_9fa48("113247") ? false : (stryCov_9fa48("113247", "113248"), key[LOOKUP_KEY_FIELD.COLUMN] === undefined)) || (stryMutAct_9fa48("113250") ? key[LOOKUP_KEY_FIELD.COLUMN] !== null : stryMutAct_9fa48("113249") ? false : (stryCov_9fa48("113249", "113250"), key[LOOKUP_KEY_FIELD.COLUMN] === null)))) {
          if (stryMutAct_9fa48("113251")) {
            {}
          } else {
            stryCov_9fa48("113251");
            return stryMutAct_9fa48("113252") ? {} : (stryCov_9fa48("113252"), {
              valid: stryMutAct_9fa48("113253") ? true : (stryCov_9fa48("113253"), false),
              error: PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_COLUMN
            });
          }
        }
        if (stryMutAct_9fa48("113256") ? key[LOOKUP_KEY_FIELD.VALUE] === undefined && key[LOOKUP_KEY_FIELD.VALUE] === null : stryMutAct_9fa48("113255") ? false : stryMutAct_9fa48("113254") ? true : (stryCov_9fa48("113254", "113255", "113256"), (stryMutAct_9fa48("113258") ? key[LOOKUP_KEY_FIELD.VALUE] !== undefined : stryMutAct_9fa48("113257") ? false : (stryCov_9fa48("113257", "113258"), key[LOOKUP_KEY_FIELD.VALUE] === undefined)) || (stryMutAct_9fa48("113260") ? key[LOOKUP_KEY_FIELD.VALUE] !== null : stryMutAct_9fa48("113259") ? false : (stryCov_9fa48("113259", "113260"), key[LOOKUP_KEY_FIELD.VALUE] === null)))) {
          if (stryMutAct_9fa48("113261")) {
            {}
          } else {
            stryCov_9fa48("113261");
            return stryMutAct_9fa48("113262") ? {} : (stryCov_9fa48("113262"), {
              valid: stryMutAct_9fa48("113263") ? true : (stryCov_9fa48("113263"), false),
              error: PRIMITIVE_ERROR_MSG.LOOKUP_KEY_MISSING_VALUE
            });
          }
        }
      }
    }
    const maxKeys = stryMutAct_9fa48("113264") ? budgets?.LOOKUP_MAX_KEYS && LOOKUP_MAX_KEYS : (stryCov_9fa48("113264"), (stryMutAct_9fa48("113265") ? budgets.LOOKUP_MAX_KEYS : (stryCov_9fa48("113265"), budgets?.LOOKUP_MAX_KEYS)) ?? LOOKUP_MAX_KEYS);
    if (stryMutAct_9fa48("113269") ? keys.length <= maxKeys : stryMutAct_9fa48("113268") ? keys.length >= maxKeys : stryMutAct_9fa48("113267") ? false : stryMutAct_9fa48("113266") ? true : (stryCov_9fa48("113266", "113267", "113268", "113269"), keys.length > maxKeys)) {
      if (stryMutAct_9fa48("113270")) {
        {}
      } else {
        stryCov_9fa48("113270");
        return stryMutAct_9fa48("113271") ? {} : (stryCov_9fa48("113271"), {
          valid: stryMutAct_9fa48("113272") ? true : (stryCov_9fa48("113272"), false),
          error: PRIMITIVE_ERROR_MSG.LOOKUP_MAX_KEYS_EXCEEDED
        });
      }
    }
    return stryMutAct_9fa48("113273") ? {} : (stryCov_9fa48("113273"), {
      valid: stryMutAct_9fa48("113274") ? false : (stryCov_9fa48("113274"), true),
      error: null
    });
  }
}

/**
 * Validate that the access path is allowed for lookup.
 *
 * @param {string} accessPath - Access path type.
 * @return {boolean} True if allowed.
 */
function isAllowedAccessPath(accessPath) {
  if (stryMutAct_9fa48("113275")) {
    {}
  } else {
    stryCov_9fa48("113275");
    return ALLOWED_ACCESS_PATHS.has(accessPath);
  }
}

/**
 * Deduplicate keys by serializing column+value pairs.
 * Returns unique keys preserving first-seen order.
 *
 * @param {Array<Object>} keys - Key-value objects.
 * @return {{uniqueKeys: Array<Object>, originalCount: number,
 *   dedupedCount: number}} Deduplication result.
 */
function deduplicateKeys(keys) {
  if (stryMutAct_9fa48("113276")) {
    {}
  } else {
    stryCov_9fa48("113276");
    const seen = new Set();
    const uniqueKeys = stryMutAct_9fa48("113277") ? ["Stryker was here"] : (stryCov_9fa48("113277"), []);
    for (const key of keys) {
      if (stryMutAct_9fa48("113278")) {
        {}
      } else {
        stryCov_9fa48("113278");
        const serialized = stryMutAct_9fa48("113279") ? key[LOOKUP_KEY_FIELD.COLUMN] + KEY_SERIALIZATION_DELIMITER - String(key[LOOKUP_KEY_FIELD.VALUE]) : (stryCov_9fa48("113279"), (stryMutAct_9fa48("113280") ? key[LOOKUP_KEY_FIELD.COLUMN] - KEY_SERIALIZATION_DELIMITER : (stryCov_9fa48("113280"), key[LOOKUP_KEY_FIELD.COLUMN] + KEY_SERIALIZATION_DELIMITER)) + String(key[LOOKUP_KEY_FIELD.VALUE]));
        if (stryMutAct_9fa48("113283") ? false : stryMutAct_9fa48("113282") ? true : stryMutAct_9fa48("113281") ? seen.has(serialized) : (stryCov_9fa48("113281", "113282", "113283"), !seen.has(serialized))) {
          if (stryMutAct_9fa48("113284")) {
            {}
          } else {
            stryCov_9fa48("113284");
            seen.add(serialized);
            uniqueKeys.push(key);
          }
        }
      }
    }
    return stryMutAct_9fa48("113285") ? {} : (stryCov_9fa48("113285"), {
      uniqueKeys,
      originalCount: keys.length,
      dedupedCount: uniqueKeys.length
    });
  }
}

/**
 * Group keys by destination partition for vectorized dispatch.
 *
 * @param {Array<Object>} keys - Deduplicated key-value objects.
 * @param {Function} partitionResolver - Function(table, key) =>
 *   partitionId. Maps a key to its owning partition.
 * @return {Map<string, Array<Object>>} Keys grouped by partition.
 */
function groupKeysByPartition(keys, partitionResolver) {
  if (stryMutAct_9fa48("113286")) {
    {}
  } else {
    stryCov_9fa48("113286");
    const groups = new Map();
    for (const key of keys) {
      if (stryMutAct_9fa48("113287")) {
        {}
      } else {
        stryCov_9fa48("113287");
        const partitionId = partitionResolver(key);
        if (stryMutAct_9fa48("113290") ? false : stryMutAct_9fa48("113289") ? true : stryMutAct_9fa48("113288") ? groups.has(partitionId) : (stryCov_9fa48("113288", "113289", "113290"), !groups.has(partitionId))) {
          if (stryMutAct_9fa48("113291")) {
            {}
          } else {
            stryCov_9fa48("113291");
            groups.set(partitionId, stryMutAct_9fa48("113292") ? ["Stryker was here"] : (stryCov_9fa48("113292"), []));
          }
        }
        groups.get(partitionId).push(key);
      }
    }
    return groups;
  }
}

/**
 * Estimate byte size of lookup result rows.
 *
 * @param {Array<Object>} rows - Result rows.
 * @return {number} Estimated byte count.
 */
function estimateLookupBytes(rows) {
  if (stryMutAct_9fa48("113293")) {
    {}
  } else {
    stryCov_9fa48("113293");
    let total = NUM.ZERO;
    for (const row of rows) {
      if (stryMutAct_9fa48("113294")) {
        {}
      } else {
        stryCov_9fa48("113294");
        stryMutAct_9fa48("113295") ? total -= JSON.stringify(row).length : (stryCov_9fa48("113295"), total += JSON.stringify(row).length);
      }
    }
    return total;
  }
}

/**
 * Execute a lookup operation with validation, deduplication,
 * batching by partition, and budget enforcement.
 *
 * Requirement 5.1: Cross-partition data movement only through
 * explicit primitives.
 * Requirement 5.2: Lookup is batched key access limited to
 * primary, unique, or bounded index lookups.
 *
 * @param {Object} options - Lookup options.
 * @param {string} options.table - Table name.
 * @param {Array<Object>} options.keys - Key-value objects with
 *   {column, value} shape.
 * @param {string} options.accessPath - Access path type from
 *   LOOKUP_ACCESS_PATH.
 * @param {Function} options.partitionResolver - Maps key to
 *   partition ID.
 * @param {Function} options.fetchFn - Async function
 *   (partitionId, table, keys) => rows.
 * @param {Object} [options.budgets] - Budget overrides.
 * @param {Function} [options.onTelemetry] - Telemetry callback.
 * @param {Object} [options.lineageTracker] - LineageTracker
 *   instance for attaching lineage IDs.
 * @param {number} [options.stageIndex] - Stage index for
 *   lineage ID generation.
 * @param {number} [options.sequenceNum] - Sequence number for
 *   lineage ID generation.
 * @return {Promise<Object>} Lookup result with rows, counts,
 *   and metadata.
 */
async function executeLookup(options) {
  if (stryMutAct_9fa48("113296")) {
    {}
  } else {
    stryCov_9fa48("113296");
    const {
      table,
      keys,
      accessPath,
      partitionResolver,
      fetchFn,
      budgets,
      onTelemetry,
      lineageTracker,
      stageIndex,
      sequenceNum
    } = options;
    const startTime = Date.now();

    // Validate arguments
    const validation = validateLookupArgs(table, keys, budgets);
    if (stryMutAct_9fa48("113299") ? false : stryMutAct_9fa48("113298") ? true : stryMutAct_9fa48("113297") ? validation.valid : (stryCov_9fa48("113297", "113298", "113299"), !validation.valid)) {
      if (stryMutAct_9fa48("113300")) {
        {}
      } else {
        stryCov_9fa48("113300");
        throw new Error(validation.error);
      }
    }

    // Enforce access path
    if (stryMutAct_9fa48("113303") ? false : stryMutAct_9fa48("113302") ? true : stryMutAct_9fa48("113301") ? isAllowedAccessPath(accessPath) : (stryCov_9fa48("113301", "113302", "113303"), !isAllowedAccessPath(accessPath))) {
      if (stryMutAct_9fa48("113304")) {
        {}
      } else {
        stryCov_9fa48("113304");
        throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_ACCESS_PATH_DENIED);
      }
    }

    // Deduplicate keys
    const deduped = deduplicateKeys(keys);

    // Group by partition for vectorized dispatch
    const partitionGroups = groupKeysByPartition(deduped.uniqueKeys, partitionResolver);

    // Fetch from each partition
    const allRows = stryMutAct_9fa48("113305") ? ["Stryker was here"] : (stryCov_9fa48("113305"), []);
    for (const [partitionId, partitionKeys] of partitionGroups) {
      if (stryMutAct_9fa48("113306")) {
        {}
      } else {
        stryCov_9fa48("113306");
        const rows = await fetchFn(partitionId, table, partitionKeys);
        if (stryMutAct_9fa48("113308") ? false : stryMutAct_9fa48("113307") ? true : (stryCov_9fa48("113307", "113308"), Array.isArray(rows))) {
          if (stryMutAct_9fa48("113309")) {
            {}
          } else {
            stryCov_9fa48("113309");
            allRows.push(...rows);
          }
        }
      }
    }

    // Enforce byte budget
    const byteCount = estimateLookupBytes(allRows);
    const maxBytes = stryMutAct_9fa48("113310") ? budgets?.LOOKUP_MAX_BYTES && LOOKUP_MAX_BYTES : (stryCov_9fa48("113310"), (stryMutAct_9fa48("113311") ? budgets.LOOKUP_MAX_BYTES : (stryCov_9fa48("113311"), budgets?.LOOKUP_MAX_BYTES)) ?? LOOKUP_MAX_BYTES);
    if (stryMutAct_9fa48("113315") ? byteCount <= maxBytes : stryMutAct_9fa48("113314") ? byteCount >= maxBytes : stryMutAct_9fa48("113313") ? false : stryMutAct_9fa48("113312") ? true : (stryCov_9fa48("113312", "113313", "113314", "113315"), byteCount > maxBytes)) {
      if (stryMutAct_9fa48("113316")) {
        {}
      } else {
        stryCov_9fa48("113316");
        throw new Error(PRIMITIVE_ERROR_MSG.LOOKUP_MAX_BYTES_EXCEEDED);
      }
    }
    const durationMs = stryMutAct_9fa48("113317") ? Date.now() + startTime : (stryCov_9fa48("113317"), Date.now() - startTime);
    const result = stryMutAct_9fa48("113318") ? {} : (stryCov_9fa48("113318"), {
      [LRF.ROWS]: allRows,
      [LRF.KEY_COUNT]: deduped.originalCount,
      [LRF.BYTE_COUNT]: byteCount,
      [LRF.DEDUPED_KEY_COUNT]: deduped.dedupedCount,
      [LRF.PARTITION_COUNT]: partitionGroups.size,
      [LRF.ACCESS_PATH]: accessPath
    });
    if (stryMutAct_9fa48("113320") ? false : stryMutAct_9fa48("113319") ? true : (stryCov_9fa48("113319", "113320"), lineageTracker)) {
      if (stryMutAct_9fa48("113321")) {
        {}
      } else {
        stryCov_9fa48("113321");
        lineageTracker.attachLineage(result, stryMutAct_9fa48("113322") ? stageIndex && NUM.ZERO : (stryCov_9fa48("113322"), stageIndex ?? NUM.ZERO), PRIMITIVE_TYPE.LOOKUP, stryMutAct_9fa48("113323") ? sequenceNum && NUM.ZERO : (stryCov_9fa48("113323"), sequenceNum ?? NUM.ZERO));
      }
    }

    // Report telemetry
    if (stryMutAct_9fa48("113326") ? typeof onTelemetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("113325") ? false : stryMutAct_9fa48("113324") ? true : (stryCov_9fa48("113324", "113325", "113326"), typeof onTelemetry === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("113327")) {
        {}
      } else {
        stryCov_9fa48("113327");
        onTelemetry(stryMutAct_9fa48("113328") ? {} : (stryCov_9fa48("113328"), {
          primitive: PRIMITIVE_TYPE.LOOKUP,
          table,
          keyCount: deduped.originalCount,
          dedupedKeyCount: deduped.dedupedCount,
          partitionCount: partitionGroups.size,
          byteCount,
          durationMs
        }));
      }
    }
    return result;
  }
}
export { validateLookupArgs, isAllowedAccessPath, deduplicateKeys, groupKeysByPartition, estimateLookupBytes, executeLookup };