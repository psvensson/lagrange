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
import { COLUMN, NUM, TABLES, TYPEOF } from '../constants/index.js';
import { LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY } from '../cdc/cdc-integration-service.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { buildPressureAdmissionFailure, PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from './pressure-governor.js';
import { resolveReadProfileOptions } from './control-plane-system-table-gateway.js';
const AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE = Object.freeze(stryMutAct_9fa48("56355") ? {} : (stryCov_9fa48("56355"), {
  LOCAL_PARTITION_REPLICA: stryMutAct_9fa48("56356") ? "" : (stryCov_9fa48("56356"), 'local_partition_replica'),
  OWNER_RPC_LANE: stryMutAct_9fa48("56357") ? "" : (stryCov_9fa48("56357"), 'owner_rpc_lane'),
  SQL_QUERY_ENGINE: stryMutAct_9fa48("56358") ? "" : (stryCov_9fa48("56358"), 'sql_query_engine'),
  MIXED: stryMutAct_9fa48("56359") ? "" : (stryCov_9fa48("56359"), 'mixed'),
  UNAVAILABLE: stryMutAct_9fa48("56360") ? "" : (stryCov_9fa48("56360"), 'unavailable')
}));
const AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY = stryMutAct_9fa48("56361") ? "" : (stryCov_9fa48("56361"), 'local_leader');
const AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS = 1500;
function normalizeReadSource(source) {
  if (stryMutAct_9fa48("56362")) {
    {}
  } else {
    stryCov_9fa48("56362");
    const normalized = String(stryMutAct_9fa48("56365") ? source && '' : stryMutAct_9fa48("56364") ? false : stryMutAct_9fa48("56363") ? true : (stryCov_9fa48("56363", "56364", "56365"), source || (stryMutAct_9fa48("56366") ? "Stryker was here!" : (stryCov_9fa48("56366"), ''))));
    if (stryMutAct_9fa48("56369") ? normalized !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA : stryMutAct_9fa48("56368") ? false : stryMutAct_9fa48("56367") ? true : (stryCov_9fa48("56367", "56368", "56369"), normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA)) {
      if (stryMutAct_9fa48("56370")) {
        {}
      } else {
        stryCov_9fa48("56370");
        return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.LOCAL_PARTITION_REPLICA;
      }
    }
    if (stryMutAct_9fa48("56373") ? normalized !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE : stryMutAct_9fa48("56372") ? false : stryMutAct_9fa48("56371") ? true : (stryCov_9fa48("56371", "56372", "56373"), normalized === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE)) {
      if (stryMutAct_9fa48("56374")) {
        {}
      } else {
        stryCov_9fa48("56374");
        return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE;
      }
    }
    if (stryMutAct_9fa48("56377") ? normalized !== 'sql_query_engine' : stryMutAct_9fa48("56376") ? false : stryMutAct_9fa48("56375") ? true : (stryCov_9fa48("56375", "56376", "56377"), normalized === (stryMutAct_9fa48("56378") ? "" : (stryCov_9fa48("56378"), 'sql_query_engine')))) {
      if (stryMutAct_9fa48("56379")) {
        {}
      } else {
        stryCov_9fa48("56379");
        return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE;
      }
    }
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
  }
}
function normalizePositiveInteger(value, fallback) {
  if (stryMutAct_9fa48("56380")) {
    {}
  } else {
    stryCov_9fa48("56380");
    return (stryMutAct_9fa48("56383") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("56382") ? false : stryMutAct_9fa48("56381") ? true : (stryCov_9fa48("56381", "56382", "56383"), Number.isFinite(value) && (stryMutAct_9fa48("56386") ? value <= NUM.ZERO : stryMutAct_9fa48("56385") ? value >= NUM.ZERO : stryMutAct_9fa48("56384") ? true : (stryCov_9fa48("56384", "56385", "56386"), value > NUM.ZERO)))) ? Math.floor(value) : fallback;
  }
}
function isReadyLocalQueryTransport(localQueryTransport = null) {
  if (stryMutAct_9fa48("56387")) {
    {}
  } else {
    stryCov_9fa48("56387");
    if (stryMutAct_9fa48("56390") ? !localQueryTransport && typeof localQueryTransport !== TYPEOF.OBJECT : stryMutAct_9fa48("56389") ? false : stryMutAct_9fa48("56388") ? true : (stryCov_9fa48("56388", "56389", "56390"), (stryMutAct_9fa48("56391") ? localQueryTransport : (stryCov_9fa48("56391"), !localQueryTransport)) || (stryMutAct_9fa48("56393") ? typeof localQueryTransport === TYPEOF.OBJECT : stryMutAct_9fa48("56392") ? false : (stryCov_9fa48("56392", "56393"), typeof localQueryTransport !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("56394")) {
        {}
      } else {
        stryCov_9fa48("56394");
        return stryMutAct_9fa48("56395") ? true : (stryCov_9fa48("56395"), false);
      }
    }
    if (stryMutAct_9fa48("56398") ? localQueryTransport.ready !== true : stryMutAct_9fa48("56397") ? false : stryMutAct_9fa48("56396") ? true : (stryCov_9fa48("56396", "56397", "56398"), localQueryTransport.ready === (stryMutAct_9fa48("56399") ? false : (stryCov_9fa48("56399"), true)))) {
      if (stryMutAct_9fa48("56400")) {
        {}
      } else {
        stryCov_9fa48("56400");
        return stryMutAct_9fa48("56401") ? false : (stryCov_9fa48("56401"), true);
      }
    }
    return stryMutAct_9fa48("56404") ? String(localQueryTransport.state || '').toLowerCase() !== 'ready' : stryMutAct_9fa48("56403") ? false : stryMutAct_9fa48("56402") ? true : (stryCov_9fa48("56402", "56403", "56404"), (stryMutAct_9fa48("56405") ? String(localQueryTransport.state || '').toUpperCase() : (stryCov_9fa48("56405"), String(stryMutAct_9fa48("56408") ? localQueryTransport.state && '' : stryMutAct_9fa48("56407") ? false : stryMutAct_9fa48("56406") ? true : (stryCov_9fa48("56406", "56407", "56408"), localQueryTransport.state || (stryMutAct_9fa48("56409") ? "Stryker was here!" : (stryCov_9fa48("56409"), '')))).toLowerCase())) === (stryMutAct_9fa48("56410") ? "" : (stryCov_9fa48("56410"), 'ready')));
  }
}
function shouldRetryAuthoritativeReadWithoutOwnerRpc(result, options = {}) {
  if (stryMutAct_9fa48("56411")) {
    {}
  } else {
    stryCov_9fa48("56411");
    if (stryMutAct_9fa48("56414") ? result?.success !== true : stryMutAct_9fa48("56413") ? false : stryMutAct_9fa48("56412") ? true : (stryCov_9fa48("56412", "56413", "56414"), (stryMutAct_9fa48("56415") ? result.success : (stryCov_9fa48("56415"), result?.success)) === (stryMutAct_9fa48("56416") ? false : (stryCov_9fa48("56416"), true)))) {
      if (stryMutAct_9fa48("56417")) {
        {}
      } else {
        stryCov_9fa48("56417");
        return stryMutAct_9fa48("56418") ? true : (stryCov_9fa48("56418"), false);
      }
    }
    if (stryMutAct_9fa48("56421") ? options?.requireOwnerRpcRead === true && options?.allowSqlFallback === false : stryMutAct_9fa48("56420") ? false : stryMutAct_9fa48("56419") ? true : (stryCov_9fa48("56419", "56420", "56421"), (stryMutAct_9fa48("56423") ? options?.requireOwnerRpcRead !== true : stryMutAct_9fa48("56422") ? false : (stryCov_9fa48("56422", "56423"), (stryMutAct_9fa48("56424") ? options.requireOwnerRpcRead : (stryCov_9fa48("56424"), options?.requireOwnerRpcRead)) === (stryMutAct_9fa48("56425") ? false : (stryCov_9fa48("56425"), true)))) || (stryMutAct_9fa48("56427") ? options?.allowSqlFallback !== false : stryMutAct_9fa48("56426") ? false : (stryCov_9fa48("56426", "56427"), (stryMutAct_9fa48("56428") ? options.allowSqlFallback : (stryCov_9fa48("56428"), options?.allowSqlFallback)) === (stryMutAct_9fa48("56429") ? true : (stryCov_9fa48("56429"), false)))))) {
      if (stryMutAct_9fa48("56430")) {
        {}
      } else {
        stryCov_9fa48("56430");
        return stryMutAct_9fa48("56431") ? true : (stryCov_9fa48("56431"), false);
      }
    }
    if (stryMutAct_9fa48("56434") ? normalizeReadSource(result?.source) === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE : stryMutAct_9fa48("56433") ? false : stryMutAct_9fa48("56432") ? true : (stryCov_9fa48("56432", "56433", "56434"), normalizeReadSource(stryMutAct_9fa48("56435") ? result.source : (stryCov_9fa48("56435"), result?.source)) !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.OWNER_RPC_LANE)) {
      if (stryMutAct_9fa48("56436")) {
        {}
      } else {
        stryCov_9fa48("56436");
        return stryMutAct_9fa48("56437") ? true : (stryCov_9fa48("56437"), false);
      }
    }
    if (stryMutAct_9fa48("56440") ? false : stryMutAct_9fa48("56439") ? true : stryMutAct_9fa48("56438") ? isReadyLocalQueryTransport(result?.localQueryTransport) : (stryCov_9fa48("56438", "56439", "56440"), !isReadyLocalQueryTransport(stryMutAct_9fa48("56441") ? result.localQueryTransport : (stryCov_9fa48("56441"), result?.localQueryTransport)))) {
      if (stryMutAct_9fa48("56442")) {
        {}
      } else {
        stryCov_9fa48("56442");
        return stryMutAct_9fa48("56443") ? true : (stryCov_9fa48("56443"), false);
      }
    }
    const errorCode = stryMutAct_9fa48("56445") ? String(result?.errorCode || '').toUpperCase() : stryMutAct_9fa48("56444") ? String(result?.errorCode || '').trim().toLowerCase() : (stryCov_9fa48("56444", "56445"), String(stryMutAct_9fa48("56448") ? result?.errorCode && '' : stryMutAct_9fa48("56447") ? false : stryMutAct_9fa48("56446") ? true : (stryCov_9fa48("56446", "56447", "56448"), (stryMutAct_9fa48("56449") ? result.errorCode : (stryCov_9fa48("56449"), result?.errorCode)) || (stryMutAct_9fa48("56450") ? "Stryker was here!" : (stryCov_9fa48("56450"), '')))).trim().toUpperCase());
    const errorText = stryMutAct_9fa48("56451") ? String(result?.error || '').toUpperCase() : (stryCov_9fa48("56451"), String(stryMutAct_9fa48("56454") ? result?.error && '' : stryMutAct_9fa48("56453") ? false : stryMutAct_9fa48("56452") ? true : (stryCov_9fa48("56452", "56453", "56454"), (stryMutAct_9fa48("56455") ? result.error : (stryCov_9fa48("56455"), result?.error)) || (stryMutAct_9fa48("56456") ? "Stryker was here!" : (stryCov_9fa48("56456"), '')))).toLowerCase());
    const causeChain = Array.isArray(stryMutAct_9fa48("56457") ? result.causeChain : (stryCov_9fa48("56457"), result?.causeChain)) ? result.causeChain.map(stryMutAct_9fa48("56458") ? () => undefined : (stryCov_9fa48("56458"), cause => stryMutAct_9fa48("56459") ? String(cause || '').toUpperCase() : (stryCov_9fa48("56459"), String(stryMutAct_9fa48("56462") ? cause && '' : stryMutAct_9fa48("56461") ? false : stryMutAct_9fa48("56460") ? true : (stryCov_9fa48("56460", "56461", "56462"), cause || (stryMutAct_9fa48("56463") ? "Stryker was here!" : (stryCov_9fa48("56463"), '')))).toLowerCase()))) : stryMutAct_9fa48("56464") ? ["Stryker was here"] : (stryCov_9fa48("56464"), []);
    return stryMutAct_9fa48("56467") ? (result?.deferRetry === true || errorCode === 'ROUTER_CONNECTION_CLOSED' || causeChain.includes('control_plane_backpressure') || errorText.includes('connection to node')) && errorText.includes('control_plane_backpressure') : stryMutAct_9fa48("56466") ? false : stryMutAct_9fa48("56465") ? true : (stryCov_9fa48("56465", "56466", "56467"), (stryMutAct_9fa48("56469") ? (result?.deferRetry === true || errorCode === 'ROUTER_CONNECTION_CLOSED' || causeChain.includes('control_plane_backpressure')) && errorText.includes('connection to node') : stryMutAct_9fa48("56468") ? false : (stryCov_9fa48("56468", "56469"), (stryMutAct_9fa48("56471") ? (result?.deferRetry === true || errorCode === 'ROUTER_CONNECTION_CLOSED') && causeChain.includes('control_plane_backpressure') : stryMutAct_9fa48("56470") ? false : (stryCov_9fa48("56470", "56471"), (stryMutAct_9fa48("56473") ? result?.deferRetry === true && errorCode === 'ROUTER_CONNECTION_CLOSED' : stryMutAct_9fa48("56472") ? false : (stryCov_9fa48("56472", "56473"), (stryMutAct_9fa48("56475") ? result?.deferRetry !== true : stryMutAct_9fa48("56474") ? false : (stryCov_9fa48("56474", "56475"), (stryMutAct_9fa48("56476") ? result.deferRetry : (stryCov_9fa48("56476"), result?.deferRetry)) === (stryMutAct_9fa48("56477") ? false : (stryCov_9fa48("56477"), true)))) || (stryMutAct_9fa48("56479") ? errorCode !== 'ROUTER_CONNECTION_CLOSED' : stryMutAct_9fa48("56478") ? false : (stryCov_9fa48("56478", "56479"), errorCode === (stryMutAct_9fa48("56480") ? "" : (stryCov_9fa48("56480"), 'ROUTER_CONNECTION_CLOSED')))))) || causeChain.includes(stryMutAct_9fa48("56481") ? "" : (stryCov_9fa48("56481"), 'control_plane_backpressure')))) || errorText.includes(stryMutAct_9fa48("56482") ? "" : (stryCov_9fa48("56482"), 'connection to node')))) || errorText.includes(stryMutAct_9fa48("56483") ? "" : (stryCov_9fa48("56483"), 'control_plane_backpressure')));
  }
}
function freezeRows(rows) {
  if (stryMutAct_9fa48("56484")) {
    {}
  } else {
    stryCov_9fa48("56484");
    if (stryMutAct_9fa48("56487") ? !Array.isArray(rows) && rows.length === NUM.ZERO : stryMutAct_9fa48("56486") ? false : stryMutAct_9fa48("56485") ? true : (stryCov_9fa48("56485", "56486", "56487"), (stryMutAct_9fa48("56488") ? Array.isArray(rows) : (stryCov_9fa48("56488"), !Array.isArray(rows))) || (stryMutAct_9fa48("56490") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("56489") ? false : (stryCov_9fa48("56489", "56490"), rows.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("56491")) {
        {}
      } else {
        stryCov_9fa48("56491");
        return Object.freeze(stryMutAct_9fa48("56492") ? ["Stryker was here"] : (stryCov_9fa48("56492"), []));
      }
    }
    return Object.freeze(rows.map(row => {
      if (stryMutAct_9fa48("56493")) {
        {}
      } else {
        stryCov_9fa48("56493");
        return (stryMutAct_9fa48("56496") ? row || typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("56495") ? false : stryMutAct_9fa48("56494") ? true : (stryCov_9fa48("56494", "56495", "56496"), row && (stryMutAct_9fa48("56498") ? typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("56497") ? true : (stryCov_9fa48("56497", "56498"), typeof row === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56499") ? {} : (stryCov_9fa48("56499"), {
          ...row
        })) : row;
      }
    }));
  }
}
function buildAuthoritativeReadKey(tableName, sql, params, options, queryTimeoutMs) {
  if (stryMutAct_9fa48("56500")) {
    {}
  } else {
    stryCov_9fa48("56500");
    const resolvedOptions = resolveReadProfileOptions(stryMutAct_9fa48("56503") ? options && {} : stryMutAct_9fa48("56502") ? false : stryMutAct_9fa48("56501") ? true : (stryCov_9fa48("56501", "56502", "56503"), options || {}));
    const queryOptions = (stryMutAct_9fa48("56506") ? resolvedOptions?.queryOptions || typeof resolvedOptions.queryOptions === TYPEOF.OBJECT : stryMutAct_9fa48("56505") ? false : stryMutAct_9fa48("56504") ? true : (stryCov_9fa48("56504", "56505", "56506"), (stryMutAct_9fa48("56507") ? resolvedOptions.queryOptions : (stryCov_9fa48("56507"), resolvedOptions?.queryOptions)) && (stryMutAct_9fa48("56509") ? typeof resolvedOptions.queryOptions !== TYPEOF.OBJECT : stryMutAct_9fa48("56508") ? true : (stryCov_9fa48("56508", "56509"), typeof resolvedOptions.queryOptions === TYPEOF.OBJECT)))) ? resolvedOptions.queryOptions : {};
    return JSON.stringify(stryMutAct_9fa48("56510") ? {} : (stryCov_9fa48("56510"), {
      tableName: stryMutAct_9fa48("56513") ? tableName && null : stryMutAct_9fa48("56512") ? false : stryMutAct_9fa48("56511") ? true : (stryCov_9fa48("56511", "56512", "56513"), tableName || null),
      sql: stryMutAct_9fa48("56516") ? sql && null : stryMutAct_9fa48("56515") ? false : stryMutAct_9fa48("56514") ? true : (stryCov_9fa48("56514", "56515", "56516"), sql || null),
      params: Array.isArray(params) ? params : stryMutAct_9fa48("56517") ? ["Stryker was here"] : (stryCov_9fa48("56517"), []),
      workClass: stryMutAct_9fa48("56520") ? resolvedOptions?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("56519") ? false : stryMutAct_9fa48("56518") ? true : (stryCov_9fa48("56518", "56519", "56520"), (stryMutAct_9fa48("56521") ? resolvedOptions.workClass : (stryCov_9fa48("56521"), resolvedOptions?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
      allowPressureDegrade: stryMutAct_9fa48("56524") ? resolvedOptions?.allowPressureDegrade === false : stryMutAct_9fa48("56523") ? false : stryMutAct_9fa48("56522") ? true : (stryCov_9fa48("56522", "56523", "56524"), (stryMutAct_9fa48("56525") ? resolvedOptions.allowPressureDegrade : (stryCov_9fa48("56525"), resolvedOptions?.allowPressureDegrade)) !== (stryMutAct_9fa48("56526") ? true : (stryCov_9fa48("56526"), false))),
      allowPressureDefer: stryMutAct_9fa48("56529") ? resolvedOptions?.allowPressureDefer !== true : stryMutAct_9fa48("56528") ? false : stryMutAct_9fa48("56527") ? true : (stryCov_9fa48("56527", "56528", "56529"), (stryMutAct_9fa48("56530") ? resolvedOptions.allowPressureDefer : (stryCov_9fa48("56530"), resolvedOptions?.allowPressureDefer)) === (stryMutAct_9fa48("56531") ? false : (stryCov_9fa48("56531"), true))),
      allowOwnerRpcFallback: stryMutAct_9fa48("56534") ? resolvedOptions?.allowOwnerRpcFallback === false : stryMutAct_9fa48("56533") ? false : stryMutAct_9fa48("56532") ? true : (stryCov_9fa48("56532", "56533", "56534"), (stryMutAct_9fa48("56535") ? resolvedOptions.allowOwnerRpcFallback : (stryCov_9fa48("56535"), resolvedOptions?.allowOwnerRpcFallback)) !== (stryMutAct_9fa48("56536") ? true : (stryCov_9fa48("56536"), false))),
      preferOwnerRpcRead: stryMutAct_9fa48("56539") ? resolvedOptions?.preferOwnerRpcRead !== true : stryMutAct_9fa48("56538") ? false : stryMutAct_9fa48("56537") ? true : (stryCov_9fa48("56537", "56538", "56539"), (stryMutAct_9fa48("56540") ? resolvedOptions.preferOwnerRpcRead : (stryCov_9fa48("56540"), resolvedOptions?.preferOwnerRpcRead)) === (stryMutAct_9fa48("56541") ? false : (stryCov_9fa48("56541"), true))),
      requireOwnerRpcRead: stryMutAct_9fa48("56544") ? resolvedOptions?.requireOwnerRpcRead !== true : stryMutAct_9fa48("56543") ? false : stryMutAct_9fa48("56542") ? true : (stryCov_9fa48("56542", "56543", "56544"), (stryMutAct_9fa48("56545") ? resolvedOptions.requireOwnerRpcRead : (stryCov_9fa48("56545"), resolvedOptions?.requireOwnerRpcRead)) === (stryMutAct_9fa48("56546") ? false : (stryCov_9fa48("56546"), true))),
      confirmEmptyLocalReadWithOwnerRpc: stryMutAct_9fa48("56549") ? resolvedOptions?.confirmEmptyLocalReadWithOwnerRpc !== true : stryMutAct_9fa48("56548") ? false : stryMutAct_9fa48("56547") ? true : (stryCov_9fa48("56547", "56548", "56549"), (stryMutAct_9fa48("56550") ? resolvedOptions.confirmEmptyLocalReadWithOwnerRpc : (stryCov_9fa48("56550"), resolvedOptions?.confirmEmptyLocalReadWithOwnerRpc)) === (stryMutAct_9fa48("56551") ? false : (stryCov_9fa48("56551"), true))),
      localReadConsistency: stryMutAct_9fa48("56554") ? resolvedOptions?.localReadConsistency && AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY : stryMutAct_9fa48("56553") ? false : stryMutAct_9fa48("56552") ? true : (stryCov_9fa48("56552", "56553", "56554"), (stryMutAct_9fa48("56555") ? resolvedOptions.localReadConsistency : (stryCov_9fa48("56555"), resolvedOptions?.localReadConsistency)) || AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY),
      replicaFallbackConsistency: stryMutAct_9fa48("56558") ? resolvedOptions?.replicaFallbackConsistency && null : stryMutAct_9fa48("56557") ? false : stryMutAct_9fa48("56556") ? true : (stryCov_9fa48("56556", "56557", "56558"), (stryMutAct_9fa48("56559") ? resolvedOptions.replicaFallbackConsistency : (stryCov_9fa48("56559"), resolvedOptions?.replicaFallbackConsistency)) || null),
      routingReadinessDimension: stryMutAct_9fa48("56562") ? (queryOptions.routingReadinessDimension || resolvedOptions?.routingReadinessDimension) && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("56561") ? false : stryMutAct_9fa48("56560") ? true : (stryCov_9fa48("56560", "56561", "56562"), (stryMutAct_9fa48("56564") ? queryOptions.routingReadinessDimension && resolvedOptions?.routingReadinessDimension : stryMutAct_9fa48("56563") ? false : (stryCov_9fa48("56563", "56564"), queryOptions.routingReadinessDimension || (stryMutAct_9fa48("56565") ? resolvedOptions.routingReadinessDimension : (stryCov_9fa48("56565"), resolvedOptions?.routingReadinessDimension)))) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
      timeoutMs: queryTimeoutMs
    }));
  }
}
function extractRowVersion(row) {
  if (stryMutAct_9fa48("56566")) {
    {}
  } else {
    stryCov_9fa48("56566");
    const candidates = stryMutAct_9fa48("56567") ? [] : (stryCov_9fa48("56567"), [stryMutAct_9fa48("56568") ? row[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("56568"), row?.[COLUMN.LAST_HEARTBEAT]), stryMutAct_9fa48("56569") ? row.last_heartbeat : (stryCov_9fa48("56569"), row?.last_heartbeat), stryMutAct_9fa48("56570") ? row.updated_at : (stryCov_9fa48("56570"), row?.updated_at), stryMutAct_9fa48("56571") ? row.updatedAt : (stryCov_9fa48("56571"), row?.updatedAt), stryMutAct_9fa48("56572") ? row.created_at : (stryCov_9fa48("56572"), row?.created_at), stryMutAct_9fa48("56573") ? row.createdAt : (stryCov_9fa48("56573"), row?.createdAt)]);
    let maxVersion = null;
    for (const candidate of candidates) {
      if (stryMutAct_9fa48("56574")) {
        {}
      } else {
        stryCov_9fa48("56574");
        const numeric = Number(candidate);
        if (stryMutAct_9fa48("56577") ? false : stryMutAct_9fa48("56576") ? true : stryMutAct_9fa48("56575") ? Number.isFinite(numeric) : (stryCov_9fa48("56575", "56576", "56577"), !Number.isFinite(numeric))) {
          if (stryMutAct_9fa48("56578")) {
            {}
          } else {
            stryCov_9fa48("56578");
            continue;
          }
        }
        maxVersion = (stryMutAct_9fa48("56581") ? maxVersion !== null : stryMutAct_9fa48("56580") ? false : stryMutAct_9fa48("56579") ? true : (stryCov_9fa48("56579", "56580", "56581"), maxVersion === null)) ? numeric : stryMutAct_9fa48("56582") ? Math.min(maxVersion, numeric) : (stryCov_9fa48("56582"), Math.max(maxVersion, numeric));
      }
    }
    return maxVersion;
  }
}
function resolveSnapshotVersion(rows) {
  if (stryMutAct_9fa48("56583")) {
    {}
  } else {
    stryCov_9fa48("56583");
    let snapshotVersion = null;
    for (const row of Array.isArray(rows) ? rows : stryMutAct_9fa48("56584") ? ["Stryker was here"] : (stryCov_9fa48("56584"), [])) {
      if (stryMutAct_9fa48("56585")) {
        {}
      } else {
        stryCov_9fa48("56585");
        const rowVersion = extractRowVersion(row);
        if (stryMutAct_9fa48("56588") ? false : stryMutAct_9fa48("56587") ? true : stryMutAct_9fa48("56586") ? Number.isFinite(rowVersion) : (stryCov_9fa48("56586", "56587", "56588"), !Number.isFinite(rowVersion))) {
          if (stryMutAct_9fa48("56589")) {
            {}
          } else {
            stryCov_9fa48("56589");
            continue;
          }
        }
        snapshotVersion = (stryMutAct_9fa48("56592") ? snapshotVersion !== null : stryMutAct_9fa48("56591") ? false : stryMutAct_9fa48("56590") ? true : (stryCov_9fa48("56590", "56591", "56592"), snapshotVersion === null)) ? rowVersion : stryMutAct_9fa48("56593") ? Math.min(snapshotVersion, rowVersion) : (stryCov_9fa48("56593"), Math.max(snapshotVersion, rowVersion));
      }
    }
    return snapshotVersion;
  }
}
function resolveCompositeSource(reads) {
  if (stryMutAct_9fa48("56594")) {
    {}
  } else {
    stryCov_9fa48("56594");
    const sources = stryMutAct_9fa48("56595") ? [] : (stryCov_9fa48("56595"), [...new Set(stryMutAct_9fa48("56596") ? (Array.isArray(reads) ? reads : []).map(entry => entry?.source) : (stryCov_9fa48("56596"), (Array.isArray(reads) ? reads : stryMutAct_9fa48("56597") ? ["Stryker was here"] : (stryCov_9fa48("56597"), [])).map(stryMutAct_9fa48("56598") ? () => undefined : (stryCov_9fa48("56598"), entry => stryMutAct_9fa48("56599") ? entry.source : (stryCov_9fa48("56599"), entry?.source))).filter(source => {
      if (stryMutAct_9fa48("56600")) {
        {}
      } else {
        stryCov_9fa48("56600");
        return stryMutAct_9fa48("56603") ? source || source !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE : stryMutAct_9fa48("56602") ? false : stryMutAct_9fa48("56601") ? true : (stryCov_9fa48("56601", "56602", "56603"), source && (stryMutAct_9fa48("56605") ? source === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE : stryMutAct_9fa48("56604") ? true : (stryCov_9fa48("56604", "56605"), source !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE)));
      }
    })))]);
    if (stryMutAct_9fa48("56608") ? sources.length !== NUM.ZERO : stryMutAct_9fa48("56607") ? false : stryMutAct_9fa48("56606") ? true : (stryCov_9fa48("56606", "56607", "56608"), sources.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("56609")) {
        {}
      } else {
        stryCov_9fa48("56609");
        return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE;
      }
    }
    if (stryMutAct_9fa48("56612") ? sources.length !== NUM.ONE : stryMutAct_9fa48("56611") ? false : stryMutAct_9fa48("56610") ? true : (stryCov_9fa48("56610", "56611", "56612"), sources.length === NUM.ONE)) {
      if (stryMutAct_9fa48("56613")) {
        {}
      } else {
        stryCov_9fa48("56613");
        return sources[NUM.ZERO];
      }
    }
    return AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.MIXED;
  }
}
class AuthoritativeControlPlaneView {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("56614")) {
      {}
    } else {
      stryCov_9fa48("56614");
      this.nodeId = stryMutAct_9fa48("56617") ? options.nodeId && null : stryMutAct_9fa48("56616") ? false : stryMutAct_9fa48("56615") ? true : (stryCov_9fa48("56615", "56616", "56617"), options.nodeId || null);
      this.cdcIntegrationService = stryMutAct_9fa48("56620") ? options.cdcIntegrationService && null : stryMutAct_9fa48("56619") ? false : stryMutAct_9fa48("56618") ? true : (stryCov_9fa48("56618", "56619", "56620"), options.cdcIntegrationService || null);
      this.messageRouter = stryMutAct_9fa48("56623") ? options.messageRouter && null : stryMutAct_9fa48("56622") ? false : stryMutAct_9fa48("56621") ? true : (stryCov_9fa48("56621", "56622", "56623"), options.messageRouter || null);
      this.pressureGovernor = stryMutAct_9fa48("56626") ? options.pressureGovernor && null : stryMutAct_9fa48("56625") ? false : stryMutAct_9fa48("56624") ? true : (stryCov_9fa48("56624", "56625", "56626"), options.pressureGovernor || null);
      this.now = (stryMutAct_9fa48("56629") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("56628") ? false : stryMutAct_9fa48("56627") ? true : (stryCov_9fa48("56627", "56628", "56629"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("56630") ? () => undefined : (stryCov_9fa48("56630"), () => Date.now());
      this.queryTimeoutMs = normalizePositiveInteger(options.queryTimeoutMs, AUTHORITATIVE_CONTROL_PLANE_DEFAULT_QUERY_TIMEOUT_MS);
      this.inFlightReadsByKey = new Map();
    }
  }

  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("56631")) {
      {}
    } else {
      stryCov_9fa48("56631");
      if (stryMutAct_9fa48("56633") ? false : stryMutAct_9fa48("56632") ? true : (stryCov_9fa48("56632", "56633"), Object.hasOwn(options, stryMutAct_9fa48("56634") ? "" : (stryCov_9fa48("56634"), 'cdcIntegrationService')))) {
        if (stryMutAct_9fa48("56635")) {
          {}
        } else {
          stryCov_9fa48("56635");
          this.cdcIntegrationService = stryMutAct_9fa48("56638") ? options.cdcIntegrationService && null : stryMutAct_9fa48("56637") ? false : stryMutAct_9fa48("56636") ? true : (stryCov_9fa48("56636", "56637", "56638"), options.cdcIntegrationService || null);
        }
      }
      if (stryMutAct_9fa48("56640") ? false : stryMutAct_9fa48("56639") ? true : (stryCov_9fa48("56639", "56640"), Object.hasOwn(options, stryMutAct_9fa48("56641") ? "" : (stryCov_9fa48("56641"), 'messageRouter')))) {
        if (stryMutAct_9fa48("56642")) {
          {}
        } else {
          stryCov_9fa48("56642");
          this.messageRouter = stryMutAct_9fa48("56645") ? options.messageRouter && null : stryMutAct_9fa48("56644") ? false : stryMutAct_9fa48("56643") ? true : (stryCov_9fa48("56643", "56644", "56645"), options.messageRouter || null);
        }
      }
    }
  }

  /**
   * Return true when authoritative reads are available.
   * @return {boolean}
   */
  canRead() {
    if (stryMutAct_9fa48("56646")) {
      {}
    } else {
      stryCov_9fa48("56646");
      return Boolean(stryMutAct_9fa48("56649") ? this.cdcIntegrationService || typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION : stryMutAct_9fa48("56648") ? false : stryMutAct_9fa48("56647") ? true : (stryCov_9fa48("56647", "56648", "56649"), this.cdcIntegrationService && (stryMutAct_9fa48("56651") ? typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead !== TYPEOF.FUNCTION : stryMutAct_9fa48("56650") ? true : (stryCov_9fa48("56650", "56651"), typeof this.cdcIntegrationService.executeAuthoritativeSystemTableRead === TYPEOF.FUNCTION))));
    }
  }

  /**
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (stryMutAct_9fa48("56652")) {
      {}
    } else {
      stryCov_9fa48("56652");
      if (stryMutAct_9fa48("56654") ? false : stryMutAct_9fa48("56653") ? true : (stryCov_9fa48("56653", "56654"), this.pressureGovernor)) {
        if (stryMutAct_9fa48("56655")) {
          {}
        } else {
          stryCov_9fa48("56655");
          this.pressureGovernor.configure(stryMutAct_9fa48("56656") ? {} : (stryCov_9fa48("56656"), {
            nodeId: this.nodeId,
            messageRouter: this.messageRouter
          }));
          return this.pressureGovernor;
        }
      }
      this.pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("56657") ? {} : (stryCov_9fa48("56657"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * Execute one authoritative control-plane table read.
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readRows(tableName, sql, params = stryMutAct_9fa48("56658") ? ["Stryker was here"] : (stryCov_9fa48("56658"), []), options = {}) {
    if (stryMutAct_9fa48("56659")) {
      {}
    } else {
      stryCov_9fa48("56659");
      const resolvedOptions = resolveReadProfileOptions(stryMutAct_9fa48("56662") ? options && {} : stryMutAct_9fa48("56661") ? false : stryMutAct_9fa48("56660") ? true : (stryCov_9fa48("56660", "56661", "56662"), options || {}));
      const queryTimeoutMs = normalizePositiveInteger(resolvedOptions.queryTimeoutMs, this.queryTimeoutMs);
      const readKey = buildAuthoritativeReadKey(tableName, sql, params, resolvedOptions, queryTimeoutMs);
      if (stryMutAct_9fa48("56664") ? false : stryMutAct_9fa48("56663") ? true : (stryCov_9fa48("56663", "56664"), this.inFlightReadsByKey.has(readKey))) {
        if (stryMutAct_9fa48("56665")) {
          {}
        } else {
          stryCov_9fa48("56665");
          return this.inFlightReadsByKey.get(readKey);
        }
      }
      let inFlightRead = null;
      inFlightRead = (async () => {
        if (stryMutAct_9fa48("56666")) {
          {}
        } else {
          stryCov_9fa48("56666");
          const observedAtMs = this.now();
          const observedAt = new Date(observedAtMs).toISOString();
          const pressureDecision = this.getPressureGovernor().evaluate(stryMutAct_9fa48("56667") ? {} : (stryCov_9fa48("56667"), {
            workClass: stryMutAct_9fa48("56670") ? resolvedOptions?.workClass && PRESSURE_WORK_CLASS.INTERACTIVE : stryMutAct_9fa48("56669") ? false : stryMutAct_9fa48("56668") ? true : (stryCov_9fa48("56668", "56669", "56670"), (stryMutAct_9fa48("56671") ? resolvedOptions.workClass : (stryCov_9fa48("56671"), resolvedOptions?.workClass)) || PRESSURE_WORK_CLASS.INTERACTIVE),
            resourceKeys: stryMutAct_9fa48("56672") ? [] : (stryCov_9fa48("56672"), [stryMutAct_9fa48("56673") ? "" : (stryCov_9fa48("56673"), 'control-plane:read'), stryMutAct_9fa48("56674") ? `` : (stryCov_9fa48("56674"), `control-plane:table:${stryMutAct_9fa48("56677") ? tableName && 'unknown' : stryMutAct_9fa48("56676") ? false : stryMutAct_9fa48("56675") ? true : (stryCov_9fa48("56675", "56676", "56677"), tableName || (stryMutAct_9fa48("56678") ? "" : (stryCov_9fa48("56678"), 'unknown')))}`)]),
            allowDegrade: stryMutAct_9fa48("56681") ? resolvedOptions?.allowPressureDegrade === false : stryMutAct_9fa48("56680") ? false : stryMutAct_9fa48("56679") ? true : (stryCov_9fa48("56679", "56680", "56681"), (stryMutAct_9fa48("56682") ? resolvedOptions.allowPressureDegrade : (stryCov_9fa48("56682"), resolvedOptions?.allowPressureDegrade)) !== (stryMutAct_9fa48("56683") ? true : (stryCov_9fa48("56683"), false))),
            allowDefer: stryMutAct_9fa48("56686") ? resolvedOptions?.allowPressureDefer !== true : stryMutAct_9fa48("56685") ? false : stryMutAct_9fa48("56684") ? true : (stryCov_9fa48("56684", "56685", "56686"), (stryMutAct_9fa48("56687") ? resolvedOptions.allowPressureDefer : (stryCov_9fa48("56687"), resolvedOptions?.allowPressureDefer)) === (stryMutAct_9fa48("56688") ? false : (stryCov_9fa48("56688"), true))),
            retryAfterMs: stryMutAct_9fa48("56689") ? resolvedOptions.pressureRetryAfterMs : (stryCov_9fa48("56689"), resolvedOptions?.pressureRetryAfterMs)
          }));
          const queryOptions = stryMutAct_9fa48("56690") ? {} : (stryCov_9fa48("56690"), {
            ...((stryMutAct_9fa48("56693") ? resolvedOptions.queryOptions || typeof resolvedOptions.queryOptions === TYPEOF.OBJECT : stryMutAct_9fa48("56692") ? false : stryMutAct_9fa48("56691") ? true : (stryCov_9fa48("56691", "56692", "56693"), resolvedOptions.queryOptions && (stryMutAct_9fa48("56695") ? typeof resolvedOptions.queryOptions !== TYPEOF.OBJECT : stryMutAct_9fa48("56694") ? true : (stryCov_9fa48("56694", "56695"), typeof resolvedOptions.queryOptions === TYPEOF.OBJECT)))) ? resolvedOptions.queryOptions : {}),
            timeoutMs: queryTimeoutMs,
            sessionId: (stryMutAct_9fa48("56698") ? typeof resolvedOptions?.queryOptions?.sessionId === TYPEOF.STRING || resolvedOptions.queryOptions.sessionId.length > NUM.ZERO : stryMutAct_9fa48("56697") ? false : stryMutAct_9fa48("56696") ? true : (stryCov_9fa48("56696", "56697", "56698"), (stryMutAct_9fa48("56700") ? typeof resolvedOptions?.queryOptions?.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("56699") ? true : (stryCov_9fa48("56699", "56700"), typeof (stryMutAct_9fa48("56702") ? resolvedOptions.queryOptions?.sessionId : stryMutAct_9fa48("56701") ? resolvedOptions?.queryOptions.sessionId : (stryCov_9fa48("56701", "56702"), resolvedOptions?.queryOptions?.sessionId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("56705") ? resolvedOptions.queryOptions.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("56704") ? resolvedOptions.queryOptions.sessionId.length >= NUM.ZERO : stryMutAct_9fa48("56703") ? true : (stryCov_9fa48("56703", "56704", "56705"), resolvedOptions.queryOptions.sessionId.length > NUM.ZERO)))) ? resolvedOptions.queryOptions.sessionId : (stryMutAct_9fa48("56706") ? `` : (stryCov_9fa48("56706"), `authoritative-control-plane-read:${stryMutAct_9fa48("56709") ? this.nodeId && 'unknown' : stryMutAct_9fa48("56708") ? false : stryMutAct_9fa48("56707") ? true : (stryCov_9fa48("56707", "56708", "56709"), this.nodeId || (stryMutAct_9fa48("56710") ? "" : (stryCov_9fa48("56710"), 'unknown')))}:`)) + (stryMutAct_9fa48("56711") ? `` : (stryCov_9fa48("56711"), `${tableName}:${observedAtMs}`)),
            routingReadinessDimension: stryMutAct_9fa48("56714") ? (resolvedOptions?.queryOptions?.routingReadinessDimension || resolvedOptions?.routingReadinessDimension) && CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("56713") ? false : stryMutAct_9fa48("56712") ? true : (stryCov_9fa48("56712", "56713", "56714"), (stryMutAct_9fa48("56716") ? resolvedOptions?.queryOptions?.routingReadinessDimension && resolvedOptions?.routingReadinessDimension : stryMutAct_9fa48("56715") ? false : (stryCov_9fa48("56715", "56716"), (stryMutAct_9fa48("56718") ? resolvedOptions.queryOptions?.routingReadinessDimension : stryMutAct_9fa48("56717") ? resolvedOptions?.queryOptions.routingReadinessDimension : (stryCov_9fa48("56717", "56718"), resolvedOptions?.queryOptions?.routingReadinessDimension)) || (stryMutAct_9fa48("56719") ? resolvedOptions.routingReadinessDimension : (stryCov_9fa48("56719"), resolvedOptions?.routingReadinessDimension)))) || CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)
          });
          if (stryMutAct_9fa48("56722") ? false : stryMutAct_9fa48("56721") ? true : stryMutAct_9fa48("56720") ? this.canRead() : (stryCov_9fa48("56720", "56721", "56722"), !this.canRead())) {
            if (stryMutAct_9fa48("56723")) {
              {}
            } else {
              stryCov_9fa48("56723");
              return Object.freeze(stryMutAct_9fa48("56724") ? {} : (stryCov_9fa48("56724"), {
                success: stryMutAct_9fa48("56725") ? true : (stryCov_9fa48("56725"), false),
                tableName,
                rows: Object.freeze(stryMutAct_9fa48("56726") ? ["Stryker was here"] : (stryCov_9fa48("56726"), [])),
                rowCount: NUM.ZERO,
                source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
                usedSqlFallback: stryMutAct_9fa48("56727") ? true : (stryCov_9fa48("56727"), false),
                snapshotVersion: null,
                observedAt,
                observedAtMs,
                error: stryMutAct_9fa48("56728") ? "" : (stryCov_9fa48("56728"), 'authoritative_row_source_unavailable')
              }));
            }
          }
          if (stryMutAct_9fa48("56731") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER && pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("56730") ? false : stryMutAct_9fa48("56729") ? true : (stryCov_9fa48("56729", "56730", "56731"), (stryMutAct_9fa48("56733") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("56732") ? false : (stryCov_9fa48("56732", "56733"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) || (stryMutAct_9fa48("56735") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("56734") ? false : (stryCov_9fa48("56734", "56735"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT)))) {
            if (stryMutAct_9fa48("56736")) {
              {}
            } else {
              stryCov_9fa48("56736");
              const failure = buildPressureAdmissionFailure(pressureDecision, stryMutAct_9fa48("56737") ? {} : (stryCov_9fa48("56737"), {
                tableName
              }));
              return Object.freeze(stryMutAct_9fa48("56738") ? {} : (stryCov_9fa48("56738"), {
                ...failure,
                rows: freezeRows(failure.rows),
                rowCount: NUM.ZERO,
                source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
                usedSqlFallback: stryMutAct_9fa48("56739") ? true : (stryCov_9fa48("56739"), false),
                snapshotVersion: null,
                observedAt,
                observedAtMs
              }));
            }
          }
          let result = await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(tableName, sql, params, stryMutAct_9fa48("56740") ? {} : (stryCov_9fa48("56740"), {
            localReadConsistency: AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            replicaFallbackConsistency: stryMutAct_9fa48("56741") ? resolvedOptions.replicaFallbackConsistency : (stryCov_9fa48("56741"), resolvedOptions?.replicaFallbackConsistency),
            allowOwnerRpcFallback: stryMutAct_9fa48("56744") ? resolvedOptions?.allowOwnerRpcFallback !== false || pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56743") ? false : stryMutAct_9fa48("56742") ? true : (stryCov_9fa48("56742", "56743", "56744"), (stryMutAct_9fa48("56746") ? resolvedOptions?.allowOwnerRpcFallback === false : stryMutAct_9fa48("56745") ? true : (stryCov_9fa48("56745", "56746"), (stryMutAct_9fa48("56747") ? resolvedOptions.allowOwnerRpcFallback : (stryCov_9fa48("56747"), resolvedOptions?.allowOwnerRpcFallback)) !== (stryMutAct_9fa48("56748") ? true : (stryCov_9fa48("56748"), false)))) && (stryMutAct_9fa48("56750") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56749") ? true : (stryCov_9fa48("56749", "56750"), pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE))),
            preferOwnerRpcRead: stryMutAct_9fa48("56753") ? resolvedOptions?.preferOwnerRpcRead !== true : stryMutAct_9fa48("56752") ? false : stryMutAct_9fa48("56751") ? true : (stryCov_9fa48("56751", "56752", "56753"), (stryMutAct_9fa48("56754") ? resolvedOptions.preferOwnerRpcRead : (stryCov_9fa48("56754"), resolvedOptions?.preferOwnerRpcRead)) === (stryMutAct_9fa48("56755") ? false : (stryCov_9fa48("56755"), true))),
            requireOwnerRpcRead: stryMutAct_9fa48("56758") ? resolvedOptions?.requireOwnerRpcRead !== true : stryMutAct_9fa48("56757") ? false : stryMutAct_9fa48("56756") ? true : (stryCov_9fa48("56756", "56757", "56758"), (stryMutAct_9fa48("56759") ? resolvedOptions.requireOwnerRpcRead : (stryCov_9fa48("56759"), resolvedOptions?.requireOwnerRpcRead)) === (stryMutAct_9fa48("56760") ? false : (stryCov_9fa48("56760"), true))),
            confirmEmptyLocalReadWithOwnerRpc: stryMutAct_9fa48("56763") ? resolvedOptions?.confirmEmptyLocalReadWithOwnerRpc !== true : stryMutAct_9fa48("56762") ? false : stryMutAct_9fa48("56761") ? true : (stryCov_9fa48("56761", "56762", "56763"), (stryMutAct_9fa48("56764") ? resolvedOptions.confirmEmptyLocalReadWithOwnerRpc : (stryCov_9fa48("56764"), resolvedOptions?.confirmEmptyLocalReadWithOwnerRpc)) === (stryMutAct_9fa48("56765") ? false : (stryCov_9fa48("56765"), true))),
            allowSqlFallback: stryMutAct_9fa48("56768") ? resolvedOptions?.allowSqlFallback !== false || pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56767") ? false : stryMutAct_9fa48("56766") ? true : (stryCov_9fa48("56766", "56767", "56768"), (stryMutAct_9fa48("56770") ? resolvedOptions?.allowSqlFallback === false : stryMutAct_9fa48("56769") ? true : (stryCov_9fa48("56769", "56770"), (stryMutAct_9fa48("56771") ? resolvedOptions.allowSqlFallback : (stryCov_9fa48("56771"), resolvedOptions?.allowSqlFallback)) !== (stryMutAct_9fa48("56772") ? true : (stryCov_9fa48("56772"), false)))) && (stryMutAct_9fa48("56774") ? pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56773") ? true : (stryCov_9fa48("56773", "56774"), pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE))),
            queryOptions
          }));
          if (stryMutAct_9fa48("56776") ? false : stryMutAct_9fa48("56775") ? true : (stryCov_9fa48("56775", "56776"), shouldRetryAuthoritativeReadWithoutOwnerRpc(result, resolvedOptions))) {
            if (stryMutAct_9fa48("56777")) {
              {}
            } else {
              stryCov_9fa48("56777");
              result = await this.cdcIntegrationService.executeAuthoritativeSystemTableRead(tableName, sql, params, stryMutAct_9fa48("56778") ? {} : (stryCov_9fa48("56778"), {
                localReadConsistency: AUTHORITATIVE_CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
                replicaFallbackConsistency: stryMutAct_9fa48("56779") ? options.replicaFallbackConsistency : (stryCov_9fa48("56779"), options?.replicaFallbackConsistency),
                allowOwnerRpcFallback: stryMutAct_9fa48("56780") ? true : (stryCov_9fa48("56780"), false),
                preferOwnerRpcRead: stryMutAct_9fa48("56781") ? true : (stryCov_9fa48("56781"), false),
                requireOwnerRpcRead: stryMutAct_9fa48("56782") ? true : (stryCov_9fa48("56782"), false),
                confirmEmptyLocalReadWithOwnerRpc: stryMutAct_9fa48("56783") ? true : (stryCov_9fa48("56783"), false),
                allowSqlFallback: stryMutAct_9fa48("56786") ? resolvedOptions?.allowSqlFallback === false : stryMutAct_9fa48("56785") ? false : stryMutAct_9fa48("56784") ? true : (stryCov_9fa48("56784", "56785", "56786"), (stryMutAct_9fa48("56787") ? resolvedOptions.allowSqlFallback : (stryCov_9fa48("56787"), resolvedOptions?.allowSqlFallback)) !== (stryMutAct_9fa48("56788") ? true : (stryCov_9fa48("56788"), false))),
                queryOptions: stryMutAct_9fa48("56789") ? {} : (stryCov_9fa48("56789"), {
                  ...queryOptions,
                  sessionId: stryMutAct_9fa48("56790") ? `` : (stryCov_9fa48("56790"), `${queryOptions.sessionId}:owner-rpc-recovery`)
                })
              }));
            }
          }
          if (stryMutAct_9fa48("56793") ? result?.success !== true || pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56792") ? false : stryMutAct_9fa48("56791") ? true : (stryCov_9fa48("56791", "56792", "56793"), (stryMutAct_9fa48("56795") ? result?.success === true : stryMutAct_9fa48("56794") ? true : (stryCov_9fa48("56794", "56795"), (stryMutAct_9fa48("56796") ? result.success : (stryCov_9fa48("56796"), result?.success)) !== (stryMutAct_9fa48("56797") ? false : (stryCov_9fa48("56797"), true)))) && (stryMutAct_9fa48("56799") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEGRADE : stryMutAct_9fa48("56798") ? true : (stryCov_9fa48("56798", "56799"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)))) {
            if (stryMutAct_9fa48("56800")) {
              {}
            } else {
              stryCov_9fa48("56800");
              const failure = buildPressureAdmissionFailure(pressureDecision, stryMutAct_9fa48("56801") ? {} : (stryCov_9fa48("56801"), {
                tableName,
                error: stryMutAct_9fa48("56804") ? result?.error && undefined : stryMutAct_9fa48("56803") ? false : stryMutAct_9fa48("56802") ? true : (stryCov_9fa48("56802", "56803", "56804"), (stryMutAct_9fa48("56805") ? result.error : (stryCov_9fa48("56805"), result?.error)) || undefined)
              }));
              return Object.freeze(stryMutAct_9fa48("56806") ? {} : (stryCov_9fa48("56806"), {
                ...failure,
                rows: freezeRows(failure.rows),
                rowCount: NUM.ZERO,
                source: AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.UNAVAILABLE,
                usedSqlFallback: stryMutAct_9fa48("56807") ? true : (stryCov_9fa48("56807"), false),
                snapshotVersion: null,
                observedAt,
                observedAtMs
              }));
            }
          }
          const rows = freezeRows(stryMutAct_9fa48("56808") ? result.rows : (stryCov_9fa48("56808"), result?.rows));
          const source = normalizeReadSource(stryMutAct_9fa48("56809") ? result.source : (stryCov_9fa48("56809"), result?.source));
          return Object.freeze(stryMutAct_9fa48("56810") ? {} : (stryCov_9fa48("56810"), {
            success: stryMutAct_9fa48("56813") ? result?.success !== true : stryMutAct_9fa48("56812") ? false : stryMutAct_9fa48("56811") ? true : (stryCov_9fa48("56811", "56812", "56813"), (stryMutAct_9fa48("56814") ? result.success : (stryCov_9fa48("56814"), result?.success)) === (stryMutAct_9fa48("56815") ? false : (stryCov_9fa48("56815"), true))),
            tableName,
            rows,
            rowCount: rows.length,
            source,
            localReadHit: stryMutAct_9fa48("56818") ? result?.localReadHit !== true : stryMutAct_9fa48("56817") ? false : stryMutAct_9fa48("56816") ? true : (stryCov_9fa48("56816", "56817", "56818"), (stryMutAct_9fa48("56819") ? result.localReadHit : (stryCov_9fa48("56819"), result?.localReadHit)) === (stryMutAct_9fa48("56820") ? false : (stryCov_9fa48("56820"), true))),
            localReplicaFallbackHit: stryMutAct_9fa48("56823") ? result?.localReplicaFallbackHit !== true : stryMutAct_9fa48("56822") ? false : stryMutAct_9fa48("56821") ? true : (stryCov_9fa48("56821", "56822", "56823"), (stryMutAct_9fa48("56824") ? result.localReplicaFallbackHit : (stryCov_9fa48("56824"), result?.localReplicaFallbackHit)) === (stryMutAct_9fa48("56825") ? false : (stryCov_9fa48("56825"), true))),
            usedSqlFallback: stryMutAct_9fa48("56828") ? result?.usedSqlFallback === true && source === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE : stryMutAct_9fa48("56827") ? false : stryMutAct_9fa48("56826") ? true : (stryCov_9fa48("56826", "56827", "56828"), (stryMutAct_9fa48("56830") ? result?.usedSqlFallback !== true : stryMutAct_9fa48("56829") ? false : (stryCov_9fa48("56829", "56830"), (stryMutAct_9fa48("56831") ? result.usedSqlFallback : (stryCov_9fa48("56831"), result?.usedSqlFallback)) === (stryMutAct_9fa48("56832") ? false : (stryCov_9fa48("56832"), true)))) || (stryMutAct_9fa48("56834") ? source !== AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE : stryMutAct_9fa48("56833") ? false : (stryCov_9fa48("56833", "56834"), source === AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE.SQL_QUERY_ENGINE))),
            queryTimeoutMs: Number.isFinite(stryMutAct_9fa48("56835") ? result.queryTimeoutMs : (stryCov_9fa48("56835"), result?.queryTimeoutMs)) ? result.queryTimeoutMs : queryTimeoutMs,
            systemTableDiagnostics: (stryMutAct_9fa48("56838") ? result?.systemTableDiagnostics || typeof result.systemTableDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56837") ? false : stryMutAct_9fa48("56836") ? true : (stryCov_9fa48("56836", "56837", "56838"), (stryMutAct_9fa48("56839") ? result.systemTableDiagnostics : (stryCov_9fa48("56839"), result?.systemTableDiagnostics)) && (stryMutAct_9fa48("56841") ? typeof result.systemTableDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56840") ? true : (stryCov_9fa48("56840", "56841"), typeof result.systemTableDiagnostics === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56842") ? {} : (stryCov_9fa48("56842"), {
              ...result.systemTableDiagnostics
            })) : null,
            snapshotVersion: resolveSnapshotVersion(rows),
            observedAt,
            observedAtMs,
            error: (stryMutAct_9fa48("56845") ? result?.success !== true : stryMutAct_9fa48("56844") ? false : stryMutAct_9fa48("56843") ? true : (stryCov_9fa48("56843", "56844", "56845"), (stryMutAct_9fa48("56846") ? result.success : (stryCov_9fa48("56846"), result?.success)) === (stryMutAct_9fa48("56847") ? false : (stryCov_9fa48("56847"), true)))) ? null : stryMutAct_9fa48("56850") ? result?.error && 'authoritative_query_failed' : stryMutAct_9fa48("56849") ? false : stryMutAct_9fa48("56848") ? true : (stryCov_9fa48("56848", "56849", "56850"), (stryMutAct_9fa48("56851") ? result.error : (stryCov_9fa48("56851"), result?.error)) || (stryMutAct_9fa48("56852") ? "" : (stryCov_9fa48("56852"), 'authoritative_query_failed')))
          }));
        }
      })().finally(() => {
        if (stryMutAct_9fa48("56853")) {
          {}
        } else {
          stryCov_9fa48("56853");
          if (stryMutAct_9fa48("56856") ? this.inFlightReadsByKey.get(readKey) !== inFlightRead : stryMutAct_9fa48("56855") ? false : stryMutAct_9fa48("56854") ? true : (stryCov_9fa48("56854", "56855", "56856"), this.inFlightReadsByKey.get(readKey) === inFlightRead)) {
            if (stryMutAct_9fa48("56857")) {
              {}
            } else {
              stryCov_9fa48("56857");
              this.inFlightReadsByKey.delete(readKey);
            }
          }
        }
      });
      this.inFlightReadsByKey.set(readKey, inFlightRead);
      return inFlightRead;
    }
  }

  /**
   * Read node and service evidence for one node through the canonical
   * authoritative owner path.
   * @param {string} nodeId
   * @param {Object} [options]
   * @return {Promise<Object>}
   */
  async readNodeSnapshot(nodeId, options = {}) {
    if (stryMutAct_9fa48("56858")) {
      {}
    } else {
      stryCov_9fa48("56858");
      const normalizedNodeId = String(stryMutAct_9fa48("56861") ? nodeId && '' : stryMutAct_9fa48("56860") ? false : stryMutAct_9fa48("56859") ? true : (stryCov_9fa48("56859", "56860", "56861"), nodeId || (stryMutAct_9fa48("56862") ? "Stryker was here!" : (stryCov_9fa48("56862"), ''))));
      const readOptions = stryMutAct_9fa48("56863") ? {} : (stryCov_9fa48("56863"), {
        ...options,
        replicaFallbackConsistency: stryMutAct_9fa48("56866") ? options?.replicaFallbackConsistency && LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA : stryMutAct_9fa48("56865") ? false : stryMutAct_9fa48("56864") ? true : (stryCov_9fa48("56864", "56865", "56866"), (stryMutAct_9fa48("56867") ? options.replicaFallbackConsistency : (stryCov_9fa48("56867"), options?.replicaFallbackConsistency)) || LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA)
      });
      const [nodeRead, serviceRead] = await Promise.all(stryMutAct_9fa48("56868") ? [] : (stryCov_9fa48("56868"), [this.readRows(TABLES.NODES, stryMutAct_9fa48("56869") ? `` : (stryCov_9fa48("56869"), `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("56870") ? [] : (stryCov_9fa48("56870"), [normalizedNodeId]), readOptions), this.readRows(TABLES.SERVICES, stryMutAct_9fa48("56871") ? `` : (stryCov_9fa48("56871"), `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.NODE_ID} = ?`), stryMutAct_9fa48("56872") ? [] : (stryCov_9fa48("56872"), [normalizedNodeId]), readOptions)]));
      const nodeRows = nodeRead.rows;
      const serviceRows = serviceRead.rows;
      const nodeRow = stryMutAct_9fa48("56875") ? (nodeRows.find(row => {
        return row?.[COLUMN.NODE_ID] === normalizedNodeId || row?.node_id === normalizedNodeId;
      }) || nodeRows[NUM.ZERO]) && null : stryMutAct_9fa48("56874") ? false : stryMutAct_9fa48("56873") ? true : (stryCov_9fa48("56873", "56874", "56875"), (stryMutAct_9fa48("56877") ? nodeRows.find(row => {
        return row?.[COLUMN.NODE_ID] === normalizedNodeId || row?.node_id === normalizedNodeId;
      }) && nodeRows[NUM.ZERO] : stryMutAct_9fa48("56876") ? false : (stryCov_9fa48("56876", "56877"), nodeRows.find(row => {
        if (stryMutAct_9fa48("56878")) {
          {}
        } else {
          stryCov_9fa48("56878");
          return stryMutAct_9fa48("56881") ? row?.[COLUMN.NODE_ID] === normalizedNodeId && row?.node_id === normalizedNodeId : stryMutAct_9fa48("56880") ? false : stryMutAct_9fa48("56879") ? true : (stryCov_9fa48("56879", "56880", "56881"), (stryMutAct_9fa48("56883") ? row?.[COLUMN.NODE_ID] !== normalizedNodeId : stryMutAct_9fa48("56882") ? false : (stryCov_9fa48("56882", "56883"), (stryMutAct_9fa48("56884") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("56884"), row?.[COLUMN.NODE_ID])) === normalizedNodeId)) || (stryMutAct_9fa48("56886") ? row?.node_id !== normalizedNodeId : stryMutAct_9fa48("56885") ? false : (stryCov_9fa48("56885", "56886"), (stryMutAct_9fa48("56887") ? row.node_id : (stryCov_9fa48("56887"), row?.node_id)) === normalizedNodeId)));
        }
      }) || nodeRows[NUM.ZERO])) || null);
      const lastHeartbeat = Number(stryMutAct_9fa48("56888") ? nodeRow?.[COLUMN.LAST_HEARTBEAT] && nodeRow?.last_heartbeat : (stryCov_9fa48("56888"), (stryMutAct_9fa48("56889") ? nodeRow[COLUMN.LAST_HEARTBEAT] : (stryCov_9fa48("56889"), nodeRow?.[COLUMN.LAST_HEARTBEAT])) ?? (stryMutAct_9fa48("56890") ? nodeRow.last_heartbeat : (stryCov_9fa48("56890"), nodeRow?.last_heartbeat))));
      const snapshotObservedAtMs = Number.isFinite(stryMutAct_9fa48("56891") ? nodeRead.observedAtMs : (stryCov_9fa48("56891"), nodeRead?.observedAtMs)) ? nodeRead.observedAtMs : Number.isFinite(stryMutAct_9fa48("56892") ? serviceRead.observedAtMs : (stryCov_9fa48("56892"), serviceRead?.observedAtMs)) ? serviceRead.observedAtMs : this.now();
      return Object.freeze(stryMutAct_9fa48("56893") ? {} : (stryCov_9fa48("56893"), {
        nodeId: normalizedNodeId,
        nodeRow,
        nodeRows,
        serviceRows,
        source: resolveCompositeSource(stryMutAct_9fa48("56894") ? [] : (stryCov_9fa48("56894"), [nodeRead, serviceRead])),
        snapshotVersion: stryMutAct_9fa48("56895") ? resolveSnapshotVersion(nodeRows) && resolveSnapshotVersion(serviceRows) : (stryCov_9fa48("56895"), resolveSnapshotVersion(nodeRows) ?? resolveSnapshotVersion(serviceRows)),
        freshness: Object.freeze(stryMutAct_9fa48("56896") ? {} : (stryCov_9fa48("56896"), {
          lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
          heartbeatAgeMs: Number.isFinite(lastHeartbeat) ? stryMutAct_9fa48("56897") ? Math.min(NUM.ZERO, snapshotObservedAtMs - lastHeartbeat) : (stryCov_9fa48("56897"), Math.max(NUM.ZERO, stryMutAct_9fa48("56898") ? snapshotObservedAtMs + lastHeartbeat : (stryCov_9fa48("56898"), snapshotObservedAtMs - lastHeartbeat))) : null
        })),
        tables: Object.freeze(stryMutAct_9fa48("56899") ? {} : (stryCov_9fa48("56899"), {
          nodes: nodeRead,
          services: serviceRead
        }))
      }));
    }
  }
}
export { AUTHORITATIVE_CONTROL_PLANE_VIEW_SOURCE, AuthoritativeControlPlaneView };