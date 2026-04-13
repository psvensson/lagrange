/**
 * Broadcast primitive — ctx.broadcast(ref, dataset) and
 * ctx.useBroadcast(ref).
 *
 * Replicates a small versioned dataset to all participating
 * partitions for local joins. Enforces hard size caps before
 * publish and materializes a local cached view.
 *
 * Requirements: 5.1, 5.4
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
import { BROADCAST_MAX_PAYLOAD_BYTES } from '../wasm-service/query-budget-constants.js';
import { BROADCAST_FIELD, PRIMITIVE_ERROR_MSG, PRIMITIVE_TYPE } from './distributed/distributed-context-constants.js';
import { GUARDRAIL_FIELD as GF } from './guardrail-constants.js';

/**
 * Validate broadcast publish arguments.
 *
 * @param {string} ref - Broadcast reference string.
 * @param {Object} dataset - Broadcast payload with version.
 * @param {Object} [budgets] - Budget overrides.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateBroadcastArgs(ref, dataset, budgets) {
  if (stryMutAct_9fa48("108686")) {
    {}
  } else {
    stryCov_9fa48("108686");
    if (stryMutAct_9fa48("108689") ? false : stryMutAct_9fa48("108688") ? true : stryMutAct_9fa48("108687") ? ref : (stryCov_9fa48("108687", "108688", "108689"), !ref)) {
      if (stryMutAct_9fa48("108690")) {
        {}
      } else {
        stryCov_9fa48("108690");
        return stryMutAct_9fa48("108691") ? {} : (stryCov_9fa48("108691"), {
          valid: stryMutAct_9fa48("108692") ? true : (stryCov_9fa48("108692"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("108695") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("108694") ? false : stryMutAct_9fa48("108693") ? true : (stryCov_9fa48("108693", "108694", "108695"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("108696")) {
        {}
      } else {
        stryCov_9fa48("108696");
        return stryMutAct_9fa48("108697") ? {} : (stryCov_9fa48("108697"), {
          valid: stryMutAct_9fa48("108698") ? true : (stryCov_9fa48("108698"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING
        });
      }
    }
    if (stryMutAct_9fa48("108701") ? false : stryMutAct_9fa48("108700") ? true : stryMutAct_9fa48("108699") ? dataset : (stryCov_9fa48("108699", "108700", "108701"), !dataset)) {
      if (stryMutAct_9fa48("108702")) {
        {}
      } else {
        stryCov_9fa48("108702");
        return stryMutAct_9fa48("108703") ? {} : (stryCov_9fa48("108703"), {
          valid: stryMutAct_9fa48("108704") ? true : (stryCov_9fa48("108704"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_PAYLOAD_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("108707") ? dataset[BROADCAST_FIELD.VERSION] === undefined && dataset[BROADCAST_FIELD.VERSION] === null : stryMutAct_9fa48("108706") ? false : stryMutAct_9fa48("108705") ? true : (stryCov_9fa48("108705", "108706", "108707"), (stryMutAct_9fa48("108709") ? dataset[BROADCAST_FIELD.VERSION] !== undefined : stryMutAct_9fa48("108708") ? false : (stryCov_9fa48("108708", "108709"), dataset[BROADCAST_FIELD.VERSION] === undefined)) || (stryMutAct_9fa48("108711") ? dataset[BROADCAST_FIELD.VERSION] !== null : stryMutAct_9fa48("108710") ? false : (stryCov_9fa48("108710", "108711"), dataset[BROADCAST_FIELD.VERSION] === null)))) {
      if (stryMutAct_9fa48("108712")) {
        {}
      } else {
        stryCov_9fa48("108712");
        return stryMutAct_9fa48("108713") ? {} : (stryCov_9fa48("108713"), {
          valid: stryMutAct_9fa48("108714") ? true : (stryCov_9fa48("108714"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_VERSION_REQUIRED
        });
      }
    }
    const payloadBytes = estimateBroadcastBytes(dataset);
    const maxBytes = stryMutAct_9fa48("108715") ? budgets?.BROADCAST_MAX_PAYLOAD_BYTES && BROADCAST_MAX_PAYLOAD_BYTES : (stryCov_9fa48("108715"), (stryMutAct_9fa48("108716") ? budgets.BROADCAST_MAX_PAYLOAD_BYTES : (stryCov_9fa48("108716"), budgets?.BROADCAST_MAX_PAYLOAD_BYTES)) ?? BROADCAST_MAX_PAYLOAD_BYTES);
    if (stryMutAct_9fa48("108720") ? payloadBytes <= maxBytes : stryMutAct_9fa48("108719") ? payloadBytes >= maxBytes : stryMutAct_9fa48("108718") ? false : stryMutAct_9fa48("108717") ? true : (stryCov_9fa48("108717", "108718", "108719", "108720"), payloadBytes > maxBytes)) {
      if (stryMutAct_9fa48("108721")) {
        {}
      } else {
        stryCov_9fa48("108721");
        return stryMutAct_9fa48("108722") ? {} : (stryCov_9fa48("108722"), {
          valid: stryMutAct_9fa48("108723") ? true : (stryCov_9fa48("108723"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED
        });
      }
    }
    return stryMutAct_9fa48("108724") ? {} : (stryCov_9fa48("108724"), {
      valid: stryMutAct_9fa48("108725") ? false : (stryCov_9fa48("108725"), true),
      error: null
    });
  }
}

/**
 * Validate useBroadcast arguments.
 *
 * @param {string} ref - Broadcast reference string.
 * @return {{valid: boolean, error: string|null}} Validation result.
 */
function validateUseBroadcastArgs(ref) {
  if (stryMutAct_9fa48("108726")) {
    {}
  } else {
    stryCov_9fa48("108726");
    if (stryMutAct_9fa48("108729") ? false : stryMutAct_9fa48("108728") ? true : stryMutAct_9fa48("108727") ? ref : (stryCov_9fa48("108727", "108728", "108729"), !ref)) {
      if (stryMutAct_9fa48("108730")) {
        {}
      } else {
        stryCov_9fa48("108730");
        return stryMutAct_9fa48("108731") ? {} : (stryCov_9fa48("108731"), {
          valid: stryMutAct_9fa48("108732") ? true : (stryCov_9fa48("108732"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("108735") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("108734") ? false : stryMutAct_9fa48("108733") ? true : (stryCov_9fa48("108733", "108734", "108735"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("108736")) {
        {}
      } else {
        stryCov_9fa48("108736");
        return stryMutAct_9fa48("108737") ? {} : (stryCov_9fa48("108737"), {
          valid: stryMutAct_9fa48("108738") ? true : (stryCov_9fa48("108738"), false),
          error: PRIMITIVE_ERROR_MSG.BROADCAST_REF_MUST_BE_STRING
        });
      }
    }
    return stryMutAct_9fa48("108739") ? {} : (stryCov_9fa48("108739"), {
      valid: stryMutAct_9fa48("108740") ? false : (stryCov_9fa48("108740"), true),
      error: null
    });
  }
}

/**
 * Estimate byte size of a broadcast dataset.
 *
 * @param {Object} dataset - Broadcast payload.
 * @return {number} Estimated byte count.
 */
function estimateBroadcastBytes(dataset) {
  if (stryMutAct_9fa48("108741")) {
    {}
  } else {
    stryCov_9fa48("108741");
    if (stryMutAct_9fa48("108744") ? false : stryMutAct_9fa48("108743") ? true : stryMutAct_9fa48("108742") ? dataset : (stryCov_9fa48("108742", "108743", "108744"), !dataset)) return NUM.ZERO;
    return JSON.stringify(dataset).length;
  }
}

/**
 * BroadcastStore — versioned in-memory store for broadcast
 * datasets. Each ref maps to a versioned, size-capped payload.
 *
 * Provides publish (broadcast) and retrieve (useBroadcast)
 * operations with version tagging and hard size enforcement.
 */
class BroadcastStore {
  /**
   * @param {Object} [options] - Store options.
   * @param {number} [options.maxPayloadBytes] - Hard size cap.
   * @param {Function} [options.onTelemetry] - Telemetry callback.
   * @param {Object} [options.lineageTracker] - LineageTracker
   *   instance for attaching lineage IDs.
   * @param {number} [options.stageIndex] - Stage index for
   *   lineage ID generation.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("108745")) {
      {}
    } else {
      stryCov_9fa48("108745");
      this.maxPayloadBytes = stryMutAct_9fa48("108746") ? options.maxPayloadBytes && BROADCAST_MAX_PAYLOAD_BYTES : (stryCov_9fa48("108746"), options.maxPayloadBytes ?? BROADCAST_MAX_PAYLOAD_BYTES);
      this.onTelemetry = stryMutAct_9fa48("108747") ? options.onTelemetry && null : (stryCov_9fa48("108747"), options.onTelemetry ?? null);
      this.lineageTracker = stryMutAct_9fa48("108748") ? options.lineageTracker && null : (stryCov_9fa48("108748"), options.lineageTracker ?? null);
      this.stageIndex = stryMutAct_9fa48("108749") ? options.stageIndex && NUM.ZERO : (stryCov_9fa48("108749"), options.stageIndex ?? NUM.ZERO);
      this._store = new Map();
      this._broadcastSeq = NUM.ZERO;
    }
  }

  /**
   * Publish a versioned broadcast dataset.
   *
   * Requirement 5.4: Broadcast datasets must be versioned and
   * below a hard server-enforced size limit.
   *
   * @param {string} ref - Broadcast reference string.
   * @param {Object} dataset - Payload with version field.
   * @return {Object} Broadcast descriptor with metadata.
   * @throws {Error} On validation failure or size exceeded.
   */
  broadcast(ref, dataset) {
    if (stryMutAct_9fa48("108750")) {
      {}
    } else {
      stryCov_9fa48("108750");
      const validation = validateBroadcastArgs(ref, dataset, stryMutAct_9fa48("108751") ? {} : (stryCov_9fa48("108751"), {
        BROADCAST_MAX_PAYLOAD_BYTES: this.maxPayloadBytes
      }));
      if (stryMutAct_9fa48("108754") ? false : stryMutAct_9fa48("108753") ? true : stryMutAct_9fa48("108752") ? validation.valid : (stryCov_9fa48("108752", "108753", "108754"), !validation.valid)) {
        if (stryMutAct_9fa48("108755")) {
          {}
        } else {
          stryCov_9fa48("108755");
          throw new Error(validation.error);
        }
      }
      const byteCount = estimateBroadcastBytes(dataset);
      const timestamp = Date.now();
      const descriptor = stryMutAct_9fa48("108756") ? {} : (stryCov_9fa48("108756"), {
        [BROADCAST_FIELD.REF]: ref,
        [BROADCAST_FIELD.VERSION]: dataset[BROADCAST_FIELD.VERSION],
        [BROADCAST_FIELD.PAYLOAD]: dataset,
        [BROADCAST_FIELD.BYTE_COUNT]: byteCount,
        [BROADCAST_FIELD.TIMESTAMP]: timestamp
      });
      if (stryMutAct_9fa48("108758") ? false : stryMutAct_9fa48("108757") ? true : (stryCov_9fa48("108757", "108758"), this.lineageTracker)) {
        if (stryMutAct_9fa48("108759")) {
          {}
        } else {
          stryCov_9fa48("108759");
          this.lineageTracker.attachLineage(descriptor, this.stageIndex, PRIMITIVE_TYPE.BROADCAST, this._broadcastSeq);
          stryMutAct_9fa48("108760") ? this._broadcastSeq -= NUM.ONE : (stryCov_9fa48("108760"), this._broadcastSeq += NUM.ONE);
        }
      }
      this._store.set(ref, descriptor);
      if (stryMutAct_9fa48("108763") ? typeof this.onTelemetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("108762") ? false : stryMutAct_9fa48("108761") ? true : (stryCov_9fa48("108761", "108762", "108763"), typeof this.onTelemetry === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108764")) {
          {}
        } else {
          stryCov_9fa48("108764");
          this.onTelemetry(stryMutAct_9fa48("108765") ? {} : (stryCov_9fa48("108765"), {
            primitive: PRIMITIVE_TYPE.BROADCAST,
            ref,
            version: dataset[BROADCAST_FIELD.VERSION],
            byteCount,
            timestamp
          }));
        }
      }
      return stryMutAct_9fa48("108766") ? {} : (stryCov_9fa48("108766"), {
        [BROADCAST_FIELD.REF]: ref,
        [BROADCAST_FIELD.VERSION]: dataset[BROADCAST_FIELD.VERSION],
        [BROADCAST_FIELD.BYTE_COUNT]: byteCount
      });
    }
  }

  /**
   * Retrieve a previously broadcast dataset by reference.
   *
   * Materializes a local cached view for the caller.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {Object} Broadcast view with payload and metadata.
   * @throws {Error} If ref is invalid or not found.
   */
  useBroadcast(ref) {
    if (stryMutAct_9fa48("108767")) {
      {}
    } else {
      stryCov_9fa48("108767");
      const validation = validateUseBroadcastArgs(ref);
      if (stryMutAct_9fa48("108770") ? false : stryMutAct_9fa48("108769") ? true : stryMutAct_9fa48("108768") ? validation.valid : (stryCov_9fa48("108768", "108769", "108770"), !validation.valid)) {
        if (stryMutAct_9fa48("108771")) {
          {}
        } else {
          stryCov_9fa48("108771");
          throw new Error(validation.error);
        }
      }
      const descriptor = this._store.get(ref);
      if (stryMutAct_9fa48("108774") ? false : stryMutAct_9fa48("108773") ? true : stryMutAct_9fa48("108772") ? descriptor : (stryCov_9fa48("108772", "108773", "108774"), !descriptor)) {
        if (stryMutAct_9fa48("108775")) {
          {}
        } else {
          stryCov_9fa48("108775");
          throw new Error(PRIMITIVE_ERROR_MSG.BROADCAST_REF_NOT_FOUND);
        }
      }
      if (stryMutAct_9fa48("108778") ? typeof this.onTelemetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("108777") ? false : stryMutAct_9fa48("108776") ? true : (stryCov_9fa48("108776", "108777", "108778"), typeof this.onTelemetry === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("108779")) {
          {}
        } else {
          stryCov_9fa48("108779");
          this.onTelemetry(stryMutAct_9fa48("108780") ? {} : (stryCov_9fa48("108780"), {
            primitive: PRIMITIVE_TYPE.USE_BROADCAST,
            ref,
            version: descriptor[BROADCAST_FIELD.VERSION],
            byteCount: descriptor[BROADCAST_FIELD.BYTE_COUNT]
          }));
        }
      }
      const view = stryMutAct_9fa48("108781") ? {} : (stryCov_9fa48("108781"), {
        [BROADCAST_FIELD.REF]: descriptor[BROADCAST_FIELD.REF],
        [BROADCAST_FIELD.VERSION]: descriptor[BROADCAST_FIELD.VERSION],
        [BROADCAST_FIELD.PAYLOAD]: descriptor[BROADCAST_FIELD.PAYLOAD],
        [BROADCAST_FIELD.BYTE_COUNT]: descriptor[BROADCAST_FIELD.BYTE_COUNT]
      });
      if (stryMutAct_9fa48("108784") ? descriptor[GF.LINEAGE_ID] === undefined : stryMutAct_9fa48("108783") ? false : stryMutAct_9fa48("108782") ? true : (stryCov_9fa48("108782", "108783", "108784"), descriptor[GF.LINEAGE_ID] !== undefined)) {
        if (stryMutAct_9fa48("108785")) {
          {}
        } else {
          stryCov_9fa48("108785");
          view[GF.LINEAGE_ID] = descriptor[GF.LINEAGE_ID];
        }
      }
      return view;
    }
  }

  /**
   * Check whether a broadcast ref exists.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {boolean} True if ref is stored.
   */
  has(ref) {
    if (stryMutAct_9fa48("108786")) {
      {}
    } else {
      stryCov_9fa48("108786");
      return this._store.has(ref);
    }
  }

  /**
   * Remove a broadcast ref from the store.
   *
   * @param {string} ref - Broadcast reference string.
   * @return {boolean} True if ref was removed.
   */
  delete(ref) {
    if (stryMutAct_9fa48("108787")) {
      {}
    } else {
      stryCov_9fa48("108787");
      return this._store.delete(ref);
    }
  }

  /**
   * Clear all stored broadcasts.
   */
  clear() {
    if (stryMutAct_9fa48("108788")) {
      {}
    } else {
      stryCov_9fa48("108788");
      this._store.clear();
    }
  }

  /**
   * Get the number of stored broadcasts.
   *
   * @return {number} Store size.
   */
  get size() {
    if (stryMutAct_9fa48("108789")) {
      {}
    } else {
      stryCov_9fa48("108789");
      return this._store.size;
    }
  }
}
export { validateBroadcastArgs, validateUseBroadcastArgs, estimateBroadcastBytes, BroadcastStore };