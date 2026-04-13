/**
 * Admin websocket message -> canonical Service_Message adapter.
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
import { v4 as uuidv4 } from 'uuid';
import { META_SERVICE_ID, SERVICE_MESSAGE_FIELD, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { generateCorrelationId } from '../utils/correlation.js';
import { ADMIN_MESSAGE_TYPE } from './admin-constants.js';
const ADMIN_SERVICE_OPERATION = Object.freeze(stryMutAct_9fa48("6767") ? {} : (stryCov_9fa48("6767"), {
  EXECUTE_QUERY: stryMutAct_9fa48("6768") ? "" : (stryCov_9fa48("6768"), 'admin.execute_query'),
  EXECUTE_PARTITION_CALLBACK: stryMutAct_9fa48("6769") ? "" : (stryCov_9fa48("6769"), 'admin.execute_partition_callback'),
  GET_CACHE_DUMP: stryMutAct_9fa48("6770") ? "" : (stryCov_9fa48("6770"), 'admin.get_cache_dump')
}));
const ADMIN_ADAPTER_ERROR = Object.freeze(stryMutAct_9fa48("6771") ? {} : (stryCov_9fa48("6771"), {
  TYPE_REQUIRED: stryMutAct_9fa48("6772") ? "" : (stryCov_9fa48("6772"), 'admin websocket message must include type'),
  UNSUPPORTED_TYPE: stryMutAct_9fa48("6773") ? "" : (stryCov_9fa48("6773"), 'unsupported admin websocket message type for service dispatch')
}));
const ZERO = 0;
function resolveOptionalTimeoutMs(value) {
  if (stryMutAct_9fa48("6774")) {
    {}
  } else {
    stryCov_9fa48("6774");
    const parsedValue = Number(value);
    if (stryMutAct_9fa48("6777") ? false : stryMutAct_9fa48("6776") ? true : stryMutAct_9fa48("6775") ? Number.isFinite(parsedValue) : (stryCov_9fa48("6775", "6776", "6777"), !Number.isFinite(parsedValue))) {
      if (stryMutAct_9fa48("6778")) {
        {}
      } else {
        stryCov_9fa48("6778");
        return null;
      }
    }
    const normalizedValue = Math.floor(parsedValue);
    if (stryMutAct_9fa48("6782") ? normalizedValue > ZERO : stryMutAct_9fa48("6781") ? normalizedValue < ZERO : stryMutAct_9fa48("6780") ? false : stryMutAct_9fa48("6779") ? true : (stryCov_9fa48("6779", "6780", "6781", "6782"), normalizedValue <= ZERO)) {
      if (stryMutAct_9fa48("6783")) {
        {}
      } else {
        stryCov_9fa48("6783");
        return null;
      }
    }
    return normalizedValue;
  }
}
function resolveOptionalLane(value) {
  if (stryMutAct_9fa48("6784")) {
    {}
  } else {
    stryCov_9fa48("6784");
    if (stryMutAct_9fa48("6787") ? typeof value === 'string' : stryMutAct_9fa48("6786") ? false : stryMutAct_9fa48("6785") ? true : (stryCov_9fa48("6785", "6786", "6787"), typeof value !== (stryMutAct_9fa48("6788") ? "" : (stryCov_9fa48("6788"), 'string')))) {
      if (stryMutAct_9fa48("6789")) {
        {}
      } else {
        stryCov_9fa48("6789");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("6791") ? value.toLowerCase() : stryMutAct_9fa48("6790") ? value.trim().toUpperCase() : (stryCov_9fa48("6790", "6791"), value.trim().toLowerCase());
    if (stryMutAct_9fa48("6794") ? normalized.length !== ZERO : stryMutAct_9fa48("6793") ? false : stryMutAct_9fa48("6792") ? true : (stryCov_9fa48("6792", "6793", "6794"), normalized.length === ZERO)) {
      if (stryMutAct_9fa48("6795")) {
        {}
      } else {
        stryCov_9fa48("6795");
        return null;
      }
    }
    return normalized;
  }
}
function isAdminMessageDispatchable(type) {
  if (stryMutAct_9fa48("6796")) {
    {}
  } else {
    stryCov_9fa48("6796");
    return stryMutAct_9fa48("6799") ? (type === ADMIN_MESSAGE_TYPE.QUERY || type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK) && type === ADMIN_MESSAGE_TYPE.REFRESH : stryMutAct_9fa48("6798") ? false : stryMutAct_9fa48("6797") ? true : (stryCov_9fa48("6797", "6798", "6799"), (stryMutAct_9fa48("6801") ? type === ADMIN_MESSAGE_TYPE.QUERY && type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK : stryMutAct_9fa48("6800") ? false : (stryCov_9fa48("6800", "6801"), (stryMutAct_9fa48("6803") ? type !== ADMIN_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("6802") ? false : (stryCov_9fa48("6802", "6803"), type === ADMIN_MESSAGE_TYPE.QUERY)) || (stryMutAct_9fa48("6805") ? type !== ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK : stryMutAct_9fa48("6804") ? false : (stryCov_9fa48("6804", "6805"), type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK)))) || (stryMutAct_9fa48("6807") ? type !== ADMIN_MESSAGE_TYPE.REFRESH : stryMutAct_9fa48("6806") ? false : (stryCov_9fa48("6806", "6807"), type === ADMIN_MESSAGE_TYPE.REFRESH)));
  }
}
function mapAdminMessageToOperation(messageType) {
  if (stryMutAct_9fa48("6808")) {
    {}
  } else {
    stryCov_9fa48("6808");
    if (stryMutAct_9fa48("6811") ? messageType !== ADMIN_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("6810") ? false : stryMutAct_9fa48("6809") ? true : (stryCov_9fa48("6809", "6810", "6811"), messageType === ADMIN_MESSAGE_TYPE.QUERY)) {
      if (stryMutAct_9fa48("6812")) {
        {}
      } else {
        stryCov_9fa48("6812");
        return ADMIN_SERVICE_OPERATION.EXECUTE_QUERY;
      }
    }
    if (stryMutAct_9fa48("6815") ? messageType !== ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK : stryMutAct_9fa48("6814") ? false : stryMutAct_9fa48("6813") ? true : (stryCov_9fa48("6813", "6814", "6815"), messageType === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK)) {
      if (stryMutAct_9fa48("6816")) {
        {}
      } else {
        stryCov_9fa48("6816");
        return ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK;
      }
    }
    if (stryMutAct_9fa48("6819") ? messageType !== ADMIN_MESSAGE_TYPE.REFRESH : stryMutAct_9fa48("6818") ? false : stryMutAct_9fa48("6817") ? true : (stryCov_9fa48("6817", "6818", "6819"), messageType === ADMIN_MESSAGE_TYPE.REFRESH)) {
      if (stryMutAct_9fa48("6820")) {
        {}
      } else {
        stryCov_9fa48("6820");
        return ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP;
      }
    }
    throw new Error(stryMutAct_9fa48("6821") ? `` : (stryCov_9fa48("6821"), `${ADMIN_ADAPTER_ERROR.UNSUPPORTED_TYPE}: ${messageType}`));
  }
}
function mapAdminMessageToPayload(message) {
  if (stryMutAct_9fa48("6822")) {
    {}
  } else {
    stryCov_9fa48("6822");
    if (stryMutAct_9fa48("6825") ? message.type !== ADMIN_MESSAGE_TYPE.QUERY : stryMutAct_9fa48("6824") ? false : stryMutAct_9fa48("6823") ? true : (stryCov_9fa48("6823", "6824", "6825"), message.type === ADMIN_MESSAGE_TYPE.QUERY)) {
      if (stryMutAct_9fa48("6826")) {
        {}
      } else {
        stryCov_9fa48("6826");
        const payload = stryMutAct_9fa48("6827") ? {} : (stryCov_9fa48("6827"), {
          queryId: stryMutAct_9fa48("6830") ? message.queryId && null : stryMutAct_9fa48("6829") ? false : stryMutAct_9fa48("6828") ? true : (stryCov_9fa48("6828", "6829", "6830"), message.queryId || null),
          sql: message.sql,
          params: stryMutAct_9fa48("6833") ? message.params && [] : stryMutAct_9fa48("6832") ? false : stryMutAct_9fa48("6831") ? true : (stryCov_9fa48("6831", "6832", "6833"), message.params || (stryMutAct_9fa48("6834") ? ["Stryker was here"] : (stryCov_9fa48("6834"), [])))
        });
        const timeoutMs = resolveOptionalTimeoutMs(message.timeoutMs);
        if (stryMutAct_9fa48("6837") ? timeoutMs === null : stryMutAct_9fa48("6836") ? false : stryMutAct_9fa48("6835") ? true : (stryCov_9fa48("6835", "6836", "6837"), timeoutMs !== null)) {
          if (stryMutAct_9fa48("6838")) {
            {}
          } else {
            stryCov_9fa48("6838");
            payload.timeoutMs = timeoutMs;
          }
        }
        return payload;
      }
    }
    if (stryMutAct_9fa48("6841") ? message.type !== ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK : stryMutAct_9fa48("6840") ? false : stryMutAct_9fa48("6839") ? true : (stryCov_9fa48("6839", "6840", "6841"), message.type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK)) {
      if (stryMutAct_9fa48("6842")) {
        {}
      } else {
        stryCov_9fa48("6842");
        const payload = stryMutAct_9fa48("6843") ? {} : (stryCov_9fa48("6843"), {
          queryId: stryMutAct_9fa48("6846") ? message.queryId && null : stryMutAct_9fa48("6845") ? false : stryMutAct_9fa48("6844") ? true : (stryCov_9fa48("6844", "6845", "6846"), message.queryId || null),
          statement: stryMutAct_9fa48("6849") ? message.statement && message.sql : stryMutAct_9fa48("6848") ? false : stryMutAct_9fa48("6847") ? true : (stryCov_9fa48("6847", "6848", "6849"), message.statement || message.sql),
          parameters: stryMutAct_9fa48("6852") ? (message.parameters || message.params) && [] : stryMutAct_9fa48("6851") ? false : stryMutAct_9fa48("6850") ? true : (stryCov_9fa48("6850", "6851", "6852"), (stryMutAct_9fa48("6854") ? message.parameters && message.params : stryMutAct_9fa48("6853") ? false : (stryCov_9fa48("6853", "6854"), message.parameters || message.params)) || (stryMutAct_9fa48("6855") ? ["Stryker was here"] : (stryCov_9fa48("6855"), []))),
          callbackModuleRef: message.callbackModuleRef,
          callbackExport: message.callbackExport,
          runtimeKind: message.runtimeKind
        });
        const timeoutMs = resolveOptionalTimeoutMs(message.timeoutMs);
        if (stryMutAct_9fa48("6858") ? timeoutMs === null : stryMutAct_9fa48("6857") ? false : stryMutAct_9fa48("6856") ? true : (stryCov_9fa48("6856", "6857", "6858"), timeoutMs !== null)) {
          if (stryMutAct_9fa48("6859")) {
            {}
          } else {
            stryCov_9fa48("6859");
            payload.timeoutMs = timeoutMs;
          }
        }
        return payload;
      }
    }
    return stryMutAct_9fa48("6860") ? {} : (stryCov_9fa48("6860"), {
      queryId: stryMutAct_9fa48("6863") ? message.queryId && null : stryMutAct_9fa48("6862") ? false : stryMutAct_9fa48("6861") ? true : (stryCov_9fa48("6861", "6862", "6863"), message.queryId || null)
    });
  }
}

/**
 * Adapt an admin websocket message into a canonical Service_Message envelope.
 *
 * @param {Object} message
 * @param {Object} context
 * @return {Object}
 */
function adaptAdminMessageToServiceMessage(message, context = {}) {
  if (stryMutAct_9fa48("6864")) {
    {}
  } else {
    stryCov_9fa48("6864");
    const messageType = stryMutAct_9fa48("6865") ? message.type : (stryCov_9fa48("6865"), message?.type);
    if (stryMutAct_9fa48("6868") ? false : stryMutAct_9fa48("6867") ? true : stryMutAct_9fa48("6866") ? messageType : (stryCov_9fa48("6866", "6867", "6868"), !messageType)) {
      if (stryMutAct_9fa48("6869")) {
        {}
      } else {
        stryCov_9fa48("6869");
        throw new Error(ADMIN_ADAPTER_ERROR.TYPE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("6872") ? false : stryMutAct_9fa48("6871") ? true : stryMutAct_9fa48("6870") ? isAdminMessageDispatchable(messageType) : (stryCov_9fa48("6870", "6871", "6872"), !isAdminMessageDispatchable(messageType))) {
      if (stryMutAct_9fa48("6873")) {
        {}
      } else {
        stryCov_9fa48("6873");
        throw new Error(stryMutAct_9fa48("6874") ? `` : (stryCov_9fa48("6874"), `${ADMIN_ADAPTER_ERROR.UNSUPPORTED_TYPE}: ${messageType}`));
      }
    }
    const messageId = stryMutAct_9fa48("6877") ? (message.queryId || message.messageId) && uuidv4() : stryMutAct_9fa48("6876") ? false : stryMutAct_9fa48("6875") ? true : (stryCov_9fa48("6875", "6876", "6877"), (stryMutAct_9fa48("6879") ? message.queryId && message.messageId : stryMutAct_9fa48("6878") ? false : (stryCov_9fa48("6878", "6879"), message.queryId || message.messageId)) || uuidv4());
    const traceId = stryMutAct_9fa48("6882") ? (context.traceId || message.traceId) && generateCorrelationId() : stryMutAct_9fa48("6881") ? false : stryMutAct_9fa48("6880") ? true : (stryCov_9fa48("6880", "6881", "6882"), (stryMutAct_9fa48("6884") ? context.traceId && message.traceId : stryMutAct_9fa48("6883") ? false : (stryCov_9fa48("6883", "6884"), context.traceId || message.traceId)) || generateCorrelationId());
    return stryMutAct_9fa48("6885") ? {} : (stryCov_9fa48("6885"), {
      [SERVICE_MESSAGE_FIELD.MESSAGE_ID]: messageId,
      [SERVICE_MESSAGE_FIELD.SERVICE_ID]: stryMutAct_9fa48("6888") ? context.serviceId && META_SERVICE_ID.ADMIN_META : stryMutAct_9fa48("6887") ? false : stryMutAct_9fa48("6886") ? true : (stryCov_9fa48("6886", "6887", "6888"), context.serviceId || META_SERVICE_ID.ADMIN_META),
      [SERVICE_MESSAGE_FIELD.SERVICE_TYPE]: stryMutAct_9fa48("6891") ? context.serviceType && UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE : stryMutAct_9fa48("6890") ? false : stryMutAct_9fa48("6889") ? true : (stryCov_9fa48("6889", "6890", "6891"), context.serviceType || UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE),
      [SERVICE_MESSAGE_FIELD.OPERATION]: mapAdminMessageToOperation(messageType),
      [SERVICE_MESSAGE_FIELD.PAYLOAD]: mapAdminMessageToPayload(message),
      [SERVICE_MESSAGE_FIELD.METADATA]: stryMutAct_9fa48("6892") ? {} : (stryCov_9fa48("6892"), {
        adminMessageType: messageType,
        clientId: stryMutAct_9fa48("6895") ? context.clientId && null : stryMutAct_9fa48("6894") ? false : stryMutAct_9fa48("6893") ? true : (stryCov_9fa48("6893", "6894", "6895"), context.clientId || null),
        lane: resolveOptionalLane(stryMutAct_9fa48("6898") ? context.lane && message.lane : stryMutAct_9fa48("6897") ? false : stryMutAct_9fa48("6896") ? true : (stryCov_9fa48("6896", "6897", "6898"), context.lane || message.lane))
      }),
      [SERVICE_MESSAGE_FIELD.TENANT_ID]: stryMutAct_9fa48("6901") ? context.tenantId && null : stryMutAct_9fa48("6900") ? false : stryMutAct_9fa48("6899") ? true : (stryCov_9fa48("6899", "6900", "6901"), context.tenantId || null),
      [SERVICE_MESSAGE_FIELD.PRINCIPAL]: stryMutAct_9fa48("6904") ? context.principal && null : stryMutAct_9fa48("6903") ? false : stryMutAct_9fa48("6902") ? true : (stryCov_9fa48("6902", "6903", "6904"), context.principal || null),
      [SERVICE_MESSAGE_FIELD.TRACE_ID]: traceId,
      [SERVICE_MESSAGE_FIELD.TIMESTAMP]: Date.now()
    });
  }
}
export { ADMIN_SERVICE_OPERATION, adaptAdminMessageToServiceMessage, isAdminMessageDispatchable };