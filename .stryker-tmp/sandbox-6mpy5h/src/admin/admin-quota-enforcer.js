/**
 * Quota enforcement for WASM module operations.
 * Requirements: 9.3, 9.4
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
const BYTES_PER_MIB_100 = stryMutAct_9fa48("4650") ? NUM.BYTES_PER_MIB / NUM.HUNDRED : (stryCov_9fa48("4650"), NUM.BYTES_PER_MIB * NUM.HUNDRED);
const DEFAULT_MAX_PACKAGE_COUNT = NUM.THOUSAND;
const DEFAULT_MAX_CONCURRENT_OPS = 50;
const QUOTA_LIMIT = Object.freeze(stryMutAct_9fa48("4651") ? {} : (stryCov_9fa48("4651"), {
  MAX_MODULE_SIZE_BYTES: BYTES_PER_MIB_100,
  MAX_PACKAGE_COUNT: DEFAULT_MAX_PACKAGE_COUNT,
  MAX_CONCURRENT_OPERATIONS: DEFAULT_MAX_CONCURRENT_OPS
}));
const QUOTA_ERROR_CODE = Object.freeze(stryMutAct_9fa48("4652") ? {} : (stryCov_9fa48("4652"), {
  MODULE_SIZE_EXCEEDED: stryMutAct_9fa48("4653") ? "" : (stryCov_9fa48("4653"), 'MODULE_SIZE_EXCEEDED'),
  PACKAGE_COUNT_EXCEEDED: stryMutAct_9fa48("4654") ? "" : (stryCov_9fa48("4654"), 'PACKAGE_COUNT_EXCEEDED'),
  CONCURRENT_OPS_EXCEEDED: stryMutAct_9fa48("4655") ? "" : (stryCov_9fa48("4655"), 'CONCURRENT_OPS_EXCEEDED')
}));
const QUOTA_ERROR_MSG = Object.freeze(stryMutAct_9fa48("4656") ? {} : (stryCov_9fa48("4656"), {
  MODULE_SIZE_EXCEEDED: stryMutAct_9fa48("4657") ? "" : (stryCov_9fa48("4657"), 'Module size exceeds maximum allowed'),
  PACKAGE_COUNT_EXCEEDED: stryMutAct_9fa48("4658") ? "" : (stryCov_9fa48("4658"), 'Package count exceeds maximum allowed'),
  CONCURRENT_OPS_EXCEEDED: stryMutAct_9fa48("4659") ? "" : (stryCov_9fa48("4659"), 'Concurrent operations exceed maximum allowed'),
  SIZE_REQUIRED: stryMutAct_9fa48("4660") ? "" : (stryCov_9fa48("4660"), 'Module size is required'),
  COUNT_REQUIRED: stryMutAct_9fa48("4661") ? "" : (stryCov_9fa48("4661"), 'Current count is required')
}));
const ALLOWED_RESULT = Object.freeze(stryMutAct_9fa48("4662") ? {} : (stryCov_9fa48("4662"), {
  allowed: stryMutAct_9fa48("4663") ? false : (stryCov_9fa48("4663"), true)
}));

/**
 * Check if module size is within quota.
 * @param {number|null|undefined} sizeBytes
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkModuleSize(sizeBytes, limit = QUOTA_LIMIT.MAX_MODULE_SIZE_BYTES) {
  if (stryMutAct_9fa48("4664")) {
    {}
  } else {
    stryCov_9fa48("4664");
    if (stryMutAct_9fa48("4667") ? sizeBytes != null : stryMutAct_9fa48("4666") ? false : stryMutAct_9fa48("4665") ? true : (stryCov_9fa48("4665", "4666", "4667"), sizeBytes == null)) {
      if (stryMutAct_9fa48("4668")) {
        {}
      } else {
        stryCov_9fa48("4668");
        return stryMutAct_9fa48("4669") ? {} : (stryCov_9fa48("4669"), {
          allowed: stryMutAct_9fa48("4670") ? true : (stryCov_9fa48("4670"), false),
          error: QUOTA_ERROR_MSG.SIZE_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("4674") ? sizeBytes <= limit : stryMutAct_9fa48("4673") ? sizeBytes >= limit : stryMutAct_9fa48("4672") ? false : stryMutAct_9fa48("4671") ? true : (stryCov_9fa48("4671", "4672", "4673", "4674"), sizeBytes > limit)) {
      if (stryMutAct_9fa48("4675")) {
        {}
      } else {
        stryCov_9fa48("4675");
        return stryMutAct_9fa48("4676") ? {} : (stryCov_9fa48("4676"), {
          allowed: stryMutAct_9fa48("4677") ? true : (stryCov_9fa48("4677"), false),
          error: QUOTA_ERROR_MSG.MODULE_SIZE_EXCEEDED,
          code: QUOTA_ERROR_CODE.MODULE_SIZE_EXCEEDED
        });
      }
    }
    return ALLOWED_RESULT;
  }
}

/**
 * Check if package count is within quota.
 * @param {number|null|undefined} currentCount
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkPackageCount(currentCount, limit = QUOTA_LIMIT.MAX_PACKAGE_COUNT) {
  if (stryMutAct_9fa48("4678")) {
    {}
  } else {
    stryCov_9fa48("4678");
    if (stryMutAct_9fa48("4681") ? currentCount != null : stryMutAct_9fa48("4680") ? false : stryMutAct_9fa48("4679") ? true : (stryCov_9fa48("4679", "4680", "4681"), currentCount == null)) {
      if (stryMutAct_9fa48("4682")) {
        {}
      } else {
        stryCov_9fa48("4682");
        return stryMutAct_9fa48("4683") ? {} : (stryCov_9fa48("4683"), {
          allowed: stryMutAct_9fa48("4684") ? true : (stryCov_9fa48("4684"), false),
          error: QUOTA_ERROR_MSG.COUNT_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("4688") ? currentCount < limit : stryMutAct_9fa48("4687") ? currentCount > limit : stryMutAct_9fa48("4686") ? false : stryMutAct_9fa48("4685") ? true : (stryCov_9fa48("4685", "4686", "4687", "4688"), currentCount >= limit)) {
      if (stryMutAct_9fa48("4689")) {
        {}
      } else {
        stryCov_9fa48("4689");
        return stryMutAct_9fa48("4690") ? {} : (stryCov_9fa48("4690"), {
          allowed: stryMutAct_9fa48("4691") ? true : (stryCov_9fa48("4691"), false),
          error: QUOTA_ERROR_MSG.PACKAGE_COUNT_EXCEEDED,
          code: QUOTA_ERROR_CODE.PACKAGE_COUNT_EXCEEDED
        });
      }
    }
    return ALLOWED_RESULT;
  }
}

/**
 * Check if concurrent operations are within quota.
 * @param {number|null|undefined} currentCount
 * @param {number} [limit]
 * @returns {{allowed: boolean, error?: string, code?: string}}
 */
function checkConcurrentOperations(currentCount, limit = QUOTA_LIMIT.MAX_CONCURRENT_OPERATIONS) {
  if (stryMutAct_9fa48("4692")) {
    {}
  } else {
    stryCov_9fa48("4692");
    if (stryMutAct_9fa48("4695") ? currentCount != null : stryMutAct_9fa48("4694") ? false : stryMutAct_9fa48("4693") ? true : (stryCov_9fa48("4693", "4694", "4695"), currentCount == null)) {
      if (stryMutAct_9fa48("4696")) {
        {}
      } else {
        stryCov_9fa48("4696");
        return stryMutAct_9fa48("4697") ? {} : (stryCov_9fa48("4697"), {
          allowed: stryMutAct_9fa48("4698") ? true : (stryCov_9fa48("4698"), false),
          error: QUOTA_ERROR_MSG.COUNT_REQUIRED
        });
      }
    }
    if (stryMutAct_9fa48("4702") ? currentCount < limit : stryMutAct_9fa48("4701") ? currentCount > limit : stryMutAct_9fa48("4700") ? false : stryMutAct_9fa48("4699") ? true : (stryCov_9fa48("4699", "4700", "4701", "4702"), currentCount >= limit)) {
      if (stryMutAct_9fa48("4703")) {
        {}
      } else {
        stryCov_9fa48("4703");
        return stryMutAct_9fa48("4704") ? {} : (stryCov_9fa48("4704"), {
          allowed: stryMutAct_9fa48("4705") ? true : (stryCov_9fa48("4705"), false),
          error: QUOTA_ERROR_MSG.CONCURRENT_OPS_EXCEEDED,
          code: QUOTA_ERROR_CODE.CONCURRENT_OPS_EXCEEDED
        });
      }
    }
    return ALLOWED_RESULT;
  }
}
export { QUOTA_LIMIT, QUOTA_ERROR_CODE, QUOTA_ERROR_MSG, checkModuleSize, checkPackageCount, checkConcurrentOperations };