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
const SYSTEM_METADATA_ACCESS_ERROR_CODE = Object.freeze(stryMutAct_9fa48("74731") ? {} : (stryCov_9fa48("74731"), {
  OWNER_REQUIRED: stryMutAct_9fa48("74732") ? "" : (stryCov_9fa48("74732"), 'SYSTEM_METADATA_OWNER_REQUIRED'),
  GATEWAY_REQUIRED: stryMutAct_9fa48("74733") ? "" : (stryCov_9fa48("74733"), 'SYSTEM_METADATA_GATEWAY_REQUIRED')
}));
const SYSTEM_METADATA_ACCESS_OUTCOME = Object.freeze(stryMutAct_9fa48("74734") ? {} : (stryCov_9fa48("74734"), {
  OWNER_NOT_READY: stryMutAct_9fa48("74735") ? "" : (stryCov_9fa48("74735"), 'owner_not_ready')
}));
function createSystemMetadataAccessError({
  code,
  message,
  ownerName = null,
  tableName = null,
  operation = null,
  serviceName = null
} = {}) {
  if (stryMutAct_9fa48("74736")) {
    {}
  } else {
    stryCov_9fa48("74736");
    const error = new Error(stryMutAct_9fa48("74739") ? message && 'System metadata access error' : stryMutAct_9fa48("74738") ? false : stryMutAct_9fa48("74737") ? true : (stryCov_9fa48("74737", "74738", "74739"), message || (stryMutAct_9fa48("74740") ? "" : (stryCov_9fa48("74740"), 'System metadata access error'))));
    error.name = stryMutAct_9fa48("74741") ? "" : (stryCov_9fa48("74741"), 'SystemMetadataAccessError');
    error.code = stryMutAct_9fa48("74744") ? code && SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED : stryMutAct_9fa48("74743") ? false : stryMutAct_9fa48("74742") ? true : (stryCov_9fa48("74742", "74743", "74744"), code || SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED);
    error.outcome = SYSTEM_METADATA_ACCESS_OUTCOME.OWNER_NOT_READY;
    if (stryMutAct_9fa48("74746") ? false : stryMutAct_9fa48("74745") ? true : (stryCov_9fa48("74745", "74746"), ownerName)) {
      if (stryMutAct_9fa48("74747")) {
        {}
      } else {
        stryCov_9fa48("74747");
        error.ownerName = ownerName;
      }
    }
    if (stryMutAct_9fa48("74749") ? false : stryMutAct_9fa48("74748") ? true : (stryCov_9fa48("74748", "74749"), tableName)) {
      if (stryMutAct_9fa48("74750")) {
        {}
      } else {
        stryCov_9fa48("74750");
        error.tableName = tableName;
      }
    }
    if (stryMutAct_9fa48("74752") ? false : stryMutAct_9fa48("74751") ? true : (stryCov_9fa48("74751", "74752"), operation)) {
      if (stryMutAct_9fa48("74753")) {
        {}
      } else {
        stryCov_9fa48("74753");
        error.operation = operation;
      }
    }
    if (stryMutAct_9fa48("74755") ? false : stryMutAct_9fa48("74754") ? true : (stryCov_9fa48("74754", "74755"), serviceName)) {
      if (stryMutAct_9fa48("74756")) {
        {}
      } else {
        stryCov_9fa48("74756");
        error.serviceName = serviceName;
      }
    }
    return error;
  }
}
function createSystemMetadataOwnerRequiredError({
  serviceName,
  ownerName,
  tableName = null,
  operation = null,
  message = null
} = {}) {
  if (stryMutAct_9fa48("74757")) {
    {}
  } else {
    stryCov_9fa48("74757");
    return createSystemMetadataAccessError(stryMutAct_9fa48("74758") ? {} : (stryCov_9fa48("74758"), {
      code: SYSTEM_METADATA_ACCESS_ERROR_CODE.OWNER_REQUIRED,
      message: stryMutAct_9fa48("74761") ? message && `${serviceName || 'SystemMetadataConsumer'} requires ${ownerName}` : stryMutAct_9fa48("74760") ? false : stryMutAct_9fa48("74759") ? true : (stryCov_9fa48("74759", "74760", "74761"), message || (stryMutAct_9fa48("74762") ? `` : (stryCov_9fa48("74762"), `${stryMutAct_9fa48("74765") ? serviceName && 'SystemMetadataConsumer' : stryMutAct_9fa48("74764") ? false : stryMutAct_9fa48("74763") ? true : (stryCov_9fa48("74763", "74764", "74765"), serviceName || (stryMutAct_9fa48("74766") ? "" : (stryCov_9fa48("74766"), 'SystemMetadataConsumer')))} requires ${ownerName}`))),
      ownerName,
      tableName,
      operation,
      serviceName
    }));
  }
}
function createSystemMetadataGatewayRequiredError({
  ownerName,
  tableName = null,
  operation = null,
  message = null,
  serviceName = null
} = {}) {
  if (stryMutAct_9fa48("74767")) {
    {}
  } else {
    stryCov_9fa48("74767");
    const ownerLabel = stryMutAct_9fa48("74770") ? (ownerName || serviceName) && 'SystemMetadataConsumer' : stryMutAct_9fa48("74769") ? false : stryMutAct_9fa48("74768") ? true : (stryCov_9fa48("74768", "74769", "74770"), (stryMutAct_9fa48("74772") ? ownerName && serviceName : stryMutAct_9fa48("74771") ? false : (stryCov_9fa48("74771", "74772"), ownerName || serviceName)) || (stryMutAct_9fa48("74773") ? "" : (stryCov_9fa48("74773"), 'SystemMetadataConsumer')));
    return createSystemMetadataAccessError(stryMutAct_9fa48("74774") ? {} : (stryCov_9fa48("74774"), {
      code: SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED,
      message: stryMutAct_9fa48("74777") ? message && `${ownerLabel} requires controlPlaneSystemTableGateway` : stryMutAct_9fa48("74776") ? false : stryMutAct_9fa48("74775") ? true : (stryCov_9fa48("74775", "74776", "74777"), message || (stryMutAct_9fa48("74778") ? `` : (stryCov_9fa48("74778"), `${ownerLabel} requires controlPlaneSystemTableGateway`))),
      ownerName,
      tableName,
      operation,
      serviceName
    }));
  }
}
function buildSystemMetadataOwnerNotReadyFailure(error) {
  if (stryMutAct_9fa48("74779")) {
    {}
  } else {
    stryCov_9fa48("74779");
    return stryMutAct_9fa48("74780") ? {} : (stryCov_9fa48("74780"), {
      success: stryMutAct_9fa48("74781") ? true : (stryCov_9fa48("74781"), false),
      outcome: SYSTEM_METADATA_ACCESS_OUTCOME.OWNER_NOT_READY,
      error: stryMutAct_9fa48("74784") ? error?.message && 'System metadata access error' : stryMutAct_9fa48("74783") ? false : stryMutAct_9fa48("74782") ? true : (stryCov_9fa48("74782", "74783", "74784"), (stryMutAct_9fa48("74785") ? error.message : (stryCov_9fa48("74785"), error?.message)) || (stryMutAct_9fa48("74786") ? "" : (stryCov_9fa48("74786"), 'System metadata access error'))),
      errorCode: stryMutAct_9fa48("74789") ? error?.code && SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED : stryMutAct_9fa48("74788") ? false : stryMutAct_9fa48("74787") ? true : (stryCov_9fa48("74787", "74788", "74789"), (stryMutAct_9fa48("74790") ? error.code : (stryCov_9fa48("74790"), error?.code)) || SYSTEM_METADATA_ACCESS_ERROR_CODE.GATEWAY_REQUIRED)
    });
  }
}
export { SYSTEM_METADATA_ACCESS_ERROR_CODE, SYSTEM_METADATA_ACCESS_OUTCOME, buildSystemMetadataOwnerNotReadyFailure, createSystemMetadataAccessError, createSystemMetadataGatewayRequiredError, createSystemMetadataOwnerRequiredError };