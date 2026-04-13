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
import { METRICS_LOG_TAG, NUM, TYPEOF } from '../constants/index.js';
const PRESSURE_GOVERNOR_LITERAL = Object.freeze(stryMutAct_9fa48("70032") ? {} : (stryCov_9fa48("70032"), {
  DEFAULT: stryMutAct_9fa48("70033") ? "" : (stryCov_9fa48("70033"), 'default'),
  NONE: stryMutAct_9fa48("70034") ? "" : (stryCov_9fa48("70034"), 'none'),
  TRANSPORT_OUTBOUND: stryMutAct_9fa48("70035") ? "" : (stryCov_9fa48("70035"), 'transport:outbound'),
  CONTROL_PLANE: stryMutAct_9fa48("70036") ? "" : (stryCov_9fa48("70036"), 'control-plane:'),
  QUERY_PLANE: stryMutAct_9fa48("70037") ? "" : (stryCov_9fa48("70037"), 'query-plane:'),
  QUERY: stryMutAct_9fa48("70038") ? "" : (stryCov_9fa48("70038"), 'query:'),
  CONTROL_PLANE_PRESSURE_DEGRADED: stryMutAct_9fa48("70039") ? "" : (stryCov_9fa48("70039"), 'control_plane_pressure_degraded'),
  MESSAGEROUTER: stryMutAct_9fa48("70040") ? "" : (stryCov_9fa48("70040"), 'messageRouter'),
  LOGGER: stryMutAct_9fa48("70041") ? "" : (stryCov_9fa48("70041"), 'logger')
}));
const PRESSURE_WORK_CLASS = Object.freeze(stryMutAct_9fa48("70042") ? {} : (stryCov_9fa48("70042"), {
  CRITICAL: stryMutAct_9fa48("70043") ? "" : (stryCov_9fa48("70043"), 'critical'),
  INTERACTIVE: stryMutAct_9fa48("70044") ? "" : (stryCov_9fa48("70044"), 'interactive'),
  BACKGROUND: stryMutAct_9fa48("70045") ? "" : (stryCov_9fa48("70045"), 'background')
}));
const PRESSURE_GOVERNOR_ACTION = Object.freeze(stryMutAct_9fa48("70046") ? {} : (stryCov_9fa48("70046"), {
  ALLOW: stryMutAct_9fa48("70047") ? "" : (stryCov_9fa48("70047"), 'allow'),
  DEGRADE: stryMutAct_9fa48("70048") ? "" : (stryCov_9fa48("70048"), 'degrade'),
  DEFER: stryMutAct_9fa48("70049") ? "" : (stryCov_9fa48("70049"), 'defer'),
  REJECT: stryMutAct_9fa48("70050") ? "" : (stryCov_9fa48("70050"), 'reject')
}));
const PRESSURE_GOVERNOR_REASON = Object.freeze(stryMutAct_9fa48("70051") ? {} : (stryCov_9fa48("70051"), {
  NONE: stryMutAct_9fa48("70052") ? "" : (stryCov_9fa48("70052"), 'none'),
  CRITICAL_BYPASS: stryMutAct_9fa48("70053") ? "" : (stryCov_9fa48("70053"), 'critical_bypass'),
  TRANSPORT_BACKPRESSURE: stryMutAct_9fa48("70054") ? "" : (stryCov_9fa48("70054"), 'transport_backpressure')
}));
const PRESSURE_GOVERNOR_ERROR_CODE = Object.freeze(stryMutAct_9fa48("70055") ? {} : (stryCov_9fa48("70055"), {
  CONTROL_PLANE_PRESSURE_DEGRADED: stryMutAct_9fa48("70056") ? "" : (stryCov_9fa48("70056"), 'CONTROL_PLANE_PRESSURE_DEGRADED')
}));
const PRESSURE_GOVERNOR_DEFAULT = Object.freeze(stryMutAct_9fa48("70057") ? {} : (stryCov_9fa48("70057"), {
  RETRY_AFTER_MS: 250
}));
const SHARED_GOVERNORS = new Map();
const PRESSURE_CAPACITY_PARTITION = Object.freeze(stryMutAct_9fa48("70058") ? {} : (stryCov_9fa48("70058"), {
  SHARED: stryMutAct_9fa48("70059") ? "" : (stryCov_9fa48("70059"), 'shared'),
  CONTROL_PLANE: stryMutAct_9fa48("70060") ? "" : (stryCov_9fa48("70060"), 'control-plane'),
  QUERY_PLANE: stryMutAct_9fa48("70061") ? "" : (stryCov_9fa48("70061"), 'query-plane')
}));
const TRANSPORT_RESOURCE_PREFIXES = Object.freeze(stryMutAct_9fa48("70062") ? [] : (stryCov_9fa48("70062"), [stryMutAct_9fa48("70063") ? "" : (stryCov_9fa48("70063"), 'transport:'), stryMutAct_9fa48("70064") ? "" : (stryCov_9fa48("70064"), 'control-plane:'), stryMutAct_9fa48("70065") ? "" : (stryCov_9fa48("70065"), 'query-plane:'), stryMutAct_9fa48("70066") ? "" : (stryCov_9fa48("70066"), 'query:'), stryMutAct_9fa48("70067") ? "" : (stryCov_9fa48("70067"), 'join:'), stryMutAct_9fa48("70068") ? "" : (stryCov_9fa48("70068"), 'cdc:'), stryMutAct_9fa48("70069") ? "" : (stryCov_9fa48("70069"), 'rebalancer:'), stryMutAct_9fa48("70070") ? "" : (stryCov_9fa48("70070"), 'bootstrap:')]));
function normalizeWorkClass(workClass) {
  if (stryMutAct_9fa48("70071")) {
    {}
  } else {
    stryCov_9fa48("70071");
    if (stryMutAct_9fa48("70074") ? workClass !== PRESSURE_WORK_CLASS.CRITICAL : stryMutAct_9fa48("70073") ? false : stryMutAct_9fa48("70072") ? true : (stryCov_9fa48("70072", "70073", "70074"), workClass === PRESSURE_WORK_CLASS.CRITICAL)) {
      if (stryMutAct_9fa48("70075")) {
        {}
      } else {
        stryCov_9fa48("70075");
        return PRESSURE_WORK_CLASS.CRITICAL;
      }
    }
    if (stryMutAct_9fa48("70078") ? workClass !== PRESSURE_WORK_CLASS.BACKGROUND : stryMutAct_9fa48("70077") ? false : stryMutAct_9fa48("70076") ? true : (stryCov_9fa48("70076", "70077", "70078"), workClass === PRESSURE_WORK_CLASS.BACKGROUND)) {
      if (stryMutAct_9fa48("70079")) {
        {}
      } else {
        stryCov_9fa48("70079");
        return PRESSURE_WORK_CLASS.BACKGROUND;
      }
    }
    return PRESSURE_WORK_CLASS.INTERACTIVE;
  }
}
function normalizeRetryAfterMs(value) {
  if (stryMutAct_9fa48("70080")) {
    {}
  } else {
    stryCov_9fa48("70080");
    return (stryMutAct_9fa48("70083") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("70082") ? false : stryMutAct_9fa48("70081") ? true : (stryCov_9fa48("70081", "70082", "70083"), Number.isFinite(value) && (stryMutAct_9fa48("70086") ? value <= NUM.ZERO : stryMutAct_9fa48("70085") ? value >= NUM.ZERO : stryMutAct_9fa48("70084") ? true : (stryCov_9fa48("70084", "70085", "70086"), value > NUM.ZERO)))) ? Math.floor(value) : PRESSURE_GOVERNOR_DEFAULT.RETRY_AFTER_MS;
  }
}
function normalizeNodeId(nodeId) {
  if (stryMutAct_9fa48("70087")) {
    {}
  } else {
    stryCov_9fa48("70087");
    if (stryMutAct_9fa48("70090") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("70089") ? false : stryMutAct_9fa48("70088") ? true : (stryCov_9fa48("70088", "70089", "70090"), typeof nodeId !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("70091")) {
        {}
      } else {
        stryCov_9fa48("70091");
        return PRESSURE_GOVERNOR_LITERAL.DEFAULT;
      }
    }
    const normalized = stryMutAct_9fa48("70092") ? nodeId : (stryCov_9fa48("70092"), nodeId.trim());
    return (stryMutAct_9fa48("70096") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("70095") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("70094") ? false : stryMutAct_9fa48("70093") ? true : (stryCov_9fa48("70093", "70094", "70095", "70096"), normalized.length > NUM.ZERO)) ? normalized : PRESSURE_GOVERNOR_LITERAL.DEFAULT;
  }
}
function normalizeResourceKeys(resourceKeys) {
  if (stryMutAct_9fa48("70097")) {
    {}
  } else {
    stryCov_9fa48("70097");
    if (stryMutAct_9fa48("70100") ? false : stryMutAct_9fa48("70099") ? true : stryMutAct_9fa48("70098") ? Array.isArray(resourceKeys) : (stryCov_9fa48("70098", "70099", "70100"), !Array.isArray(resourceKeys))) {
      if (stryMutAct_9fa48("70101")) {
        {}
      } else {
        stryCov_9fa48("70101");
        return stryMutAct_9fa48("70102") ? ["Stryker was here"] : (stryCov_9fa48("70102"), []);
      }
    }
    return stryMutAct_9fa48("70103") ? [] : (stryCov_9fa48("70103"), [...new Set(stryMutAct_9fa48("70104") ? resourceKeys : (stryCov_9fa48("70104"), resourceKeys.filter(resourceKey => {
      if (stryMutAct_9fa48("70105")) {
        {}
      } else {
        stryCov_9fa48("70105");
        return stryMutAct_9fa48("70108") ? typeof resourceKey === TYPEOF.STRING || resourceKey.length > NUM.ZERO : stryMutAct_9fa48("70107") ? false : stryMutAct_9fa48("70106") ? true : (stryCov_9fa48("70106", "70107", "70108"), (stryMutAct_9fa48("70110") ? typeof resourceKey !== TYPEOF.STRING : stryMutAct_9fa48("70109") ? true : (stryCov_9fa48("70109", "70110"), typeof resourceKey === TYPEOF.STRING)) && (stryMutAct_9fa48("70113") ? resourceKey.length <= NUM.ZERO : stryMutAct_9fa48("70112") ? resourceKey.length >= NUM.ZERO : stryMutAct_9fa48("70111") ? true : (stryCov_9fa48("70111", "70112", "70113"), resourceKey.length > NUM.ZERO)));
      }
    })))]);
  }
}
function buildNoPressureSummary(sensor = PRESSURE_GOVERNOR_LITERAL.NONE) {
  if (stryMutAct_9fa48("70114")) {
    {}
  } else {
    stryCov_9fa48("70114");
    return Object.freeze(stryMutAct_9fa48("70115") ? {} : (stryCov_9fa48("70115"), {
      sensor,
      capacityPartition: PRESSURE_CAPACITY_PARTITION.SHARED,
      backpressured: stryMutAct_9fa48("70116") ? true : (stryCov_9fa48("70116"), false),
      saturatedNodeCount: NUM.ZERO,
      totalPending: NUM.ZERO,
      totalPendingCritical: NUM.ZERO,
      totalPendingBackground: NUM.ZERO,
      maxPendingUtilization: NUM.ZERO
    }));
  }
}
function buildTransportPressureSummary(summary = {}, capacityPartition = PRESSURE_CAPACITY_PARTITION.SHARED) {
  if (stryMutAct_9fa48("70117")) {
    {}
  } else {
    stryCov_9fa48("70117");
    return Object.freeze(stryMutAct_9fa48("70118") ? {} : (stryCov_9fa48("70118"), {
      sensor: PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND,
      capacityPartition,
      backpressured: stryMutAct_9fa48("70121") ? summary?.backpressured !== true : stryMutAct_9fa48("70120") ? false : stryMutAct_9fa48("70119") ? true : (stryCov_9fa48("70119", "70120", "70121"), (stryMutAct_9fa48("70122") ? summary.backpressured : (stryCov_9fa48("70122"), summary?.backpressured)) === (stryMutAct_9fa48("70123") ? false : (stryCov_9fa48("70123"), true))),
      saturatedNodeCount: Number.isFinite(stryMutAct_9fa48("70124") ? summary.saturatedNodeCount : (stryCov_9fa48("70124"), summary?.saturatedNodeCount)) ? summary.saturatedNodeCount : NUM.ZERO,
      totalPending: Number.isFinite(stryMutAct_9fa48("70125") ? summary.totalPending : (stryCov_9fa48("70125"), summary?.totalPending)) ? summary.totalPending : NUM.ZERO,
      totalPendingCritical: Number.isFinite(stryMutAct_9fa48("70126") ? summary.totalPendingCritical : (stryCov_9fa48("70126"), summary?.totalPendingCritical)) ? summary.totalPendingCritical : NUM.ZERO,
      totalPendingBackground: Number.isFinite(stryMutAct_9fa48("70127") ? summary.totalPendingBackground : (stryCov_9fa48("70127"), summary?.totalPendingBackground)) ? summary.totalPendingBackground : NUM.ZERO,
      maxPendingUtilization: Number.isFinite(stryMutAct_9fa48("70128") ? summary.maxPendingUtilization : (stryCov_9fa48("70128"), summary?.maxPendingUtilization)) ? summary.maxPendingUtilization : NUM.ZERO
    }));
  }
}
function resolveCapacityPartition(resourceKeys = stryMutAct_9fa48("70129") ? ["Stryker was here"] : (stryCov_9fa48("70129"), [])) {
  if (stryMutAct_9fa48("70130")) {
    {}
  } else {
    stryCov_9fa48("70130");
    if (stryMutAct_9fa48("70133") ? false : stryMutAct_9fa48("70132") ? true : stryMutAct_9fa48("70131") ? Array.isArray(resourceKeys) : (stryCov_9fa48("70131", "70132", "70133"), !Array.isArray(resourceKeys))) {
      if (stryMutAct_9fa48("70134")) {
        {}
      } else {
        stryCov_9fa48("70134");
        return PRESSURE_CAPACITY_PARTITION.SHARED;
      }
    }
    if (stryMutAct_9fa48("70137") ? resourceKeys.every(resourceKey => {
      return typeof resourceKey === TYPEOF.STRING && resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE);
    }) : stryMutAct_9fa48("70136") ? false : stryMutAct_9fa48("70135") ? true : (stryCov_9fa48("70135", "70136", "70137"), resourceKeys.some(resourceKey => {
      if (stryMutAct_9fa48("70138")) {
        {}
      } else {
        stryCov_9fa48("70138");
        return stryMutAct_9fa48("70141") ? typeof resourceKey === TYPEOF.STRING || resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE) : stryMutAct_9fa48("70140") ? false : stryMutAct_9fa48("70139") ? true : (stryCov_9fa48("70139", "70140", "70141"), (stryMutAct_9fa48("70143") ? typeof resourceKey !== TYPEOF.STRING : stryMutAct_9fa48("70142") ? true : (stryCov_9fa48("70142", "70143"), typeof resourceKey === TYPEOF.STRING)) && (stryMutAct_9fa48("70144") ? resourceKey.endsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE) : (stryCov_9fa48("70144"), resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE))));
      }
    }))) {
      if (stryMutAct_9fa48("70145")) {
        {}
      } else {
        stryCov_9fa48("70145");
        return PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE;
      }
    }
    if (stryMutAct_9fa48("70148") ? resourceKeys.every(resourceKey => {
      return typeof resourceKey === TYPEOF.STRING && (resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) || resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY));
    }) : stryMutAct_9fa48("70147") ? false : stryMutAct_9fa48("70146") ? true : (stryCov_9fa48("70146", "70147", "70148"), resourceKeys.some(resourceKey => {
      if (stryMutAct_9fa48("70149")) {
        {}
      } else {
        stryCov_9fa48("70149");
        return stryMutAct_9fa48("70152") ? typeof resourceKey === TYPEOF.STRING || resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) || resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY) : stryMutAct_9fa48("70151") ? false : stryMutAct_9fa48("70150") ? true : (stryCov_9fa48("70150", "70151", "70152"), (stryMutAct_9fa48("70154") ? typeof resourceKey !== TYPEOF.STRING : stryMutAct_9fa48("70153") ? true : (stryCov_9fa48("70153", "70154"), typeof resourceKey === TYPEOF.STRING)) && (stryMutAct_9fa48("70156") ? resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) && resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY) : stryMutAct_9fa48("70155") ? true : (stryCov_9fa48("70155", "70156"), (stryMutAct_9fa48("70157") ? resourceKey.endsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) : (stryCov_9fa48("70157"), resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE))) || (stryMutAct_9fa48("70158") ? resourceKey.endsWith(PRESSURE_GOVERNOR_LITERAL.QUERY) : (stryCov_9fa48("70158"), resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY))))));
      }
    }))) {
      if (stryMutAct_9fa48("70159")) {
        {}
      } else {
        stryCov_9fa48("70159");
        return PRESSURE_CAPACITY_PARTITION.QUERY_PLANE;
      }
    }
    return PRESSURE_CAPACITY_PARTITION.SHARED;
  }
}
function normalizeQueueStat(value) {
  if (stryMutAct_9fa48("70160")) {
    {}
  } else {
    stryCov_9fa48("70160");
    return (stryMutAct_9fa48("70163") ? Number.isFinite(value) || value > NUM.ZERO : stryMutAct_9fa48("70162") ? false : stryMutAct_9fa48("70161") ? true : (stryCov_9fa48("70161", "70162", "70163"), Number.isFinite(value) && (stryMutAct_9fa48("70166") ? value <= NUM.ZERO : stryMutAct_9fa48("70165") ? value >= NUM.ZERO : stryMutAct_9fa48("70164") ? true : (stryCov_9fa48("70164", "70165", "70166"), value > NUM.ZERO)))) ? value : NUM.ZERO;
  }
}
function isPartitionBackpressured(queue = {}, capacityPartition) {
  if (stryMutAct_9fa48("70167")) {
    {}
  } else {
    stryCov_9fa48("70167");
    const pending = normalizeQueueStat(queue.pending);
    const maxPending = normalizeQueueStat(queue.maxPending);
    const pendingCritical = normalizeQueueStat(queue.pendingCritical);
    const pendingBackground = normalizeQueueStat(queue.pendingBackground);
    const criticalReserve = normalizeQueueStat(queue.criticalReserve);
    const backgroundPendingLimit = normalizeQueueStat(queue.backgroundPendingLimit);
    if (stryMutAct_9fa48("70170") ? maxPending > NUM.ZERO || pending >= maxPending : stryMutAct_9fa48("70169") ? false : stryMutAct_9fa48("70168") ? true : (stryCov_9fa48("70168", "70169", "70170"), (stryMutAct_9fa48("70173") ? maxPending <= NUM.ZERO : stryMutAct_9fa48("70172") ? maxPending >= NUM.ZERO : stryMutAct_9fa48("70171") ? true : (stryCov_9fa48("70171", "70172", "70173"), maxPending > NUM.ZERO)) && (stryMutAct_9fa48("70176") ? pending < maxPending : stryMutAct_9fa48("70175") ? pending > maxPending : stryMutAct_9fa48("70174") ? true : (stryCov_9fa48("70174", "70175", "70176"), pending >= maxPending)))) {
      if (stryMutAct_9fa48("70177")) {
        {}
      } else {
        stryCov_9fa48("70177");
        return stryMutAct_9fa48("70178") ? false : (stryCov_9fa48("70178"), true);
      }
    }
    if (stryMutAct_9fa48("70181") ? capacityPartition !== PRESSURE_CAPACITY_PARTITION.QUERY_PLANE : stryMutAct_9fa48("70180") ? false : stryMutAct_9fa48("70179") ? true : (stryCov_9fa48("70179", "70180", "70181"), capacityPartition === PRESSURE_CAPACITY_PARTITION.QUERY_PLANE)) {
      if (stryMutAct_9fa48("70182")) {
        {}
      } else {
        stryCov_9fa48("70182");
        return stryMutAct_9fa48("70185") ? pending > NUM.ZERO && backgroundPendingLimit > NUM.ZERO || pendingBackground >= backgroundPendingLimit : stryMutAct_9fa48("70184") ? false : stryMutAct_9fa48("70183") ? true : (stryCov_9fa48("70183", "70184", "70185"), (stryMutAct_9fa48("70187") ? pending > NUM.ZERO || backgroundPendingLimit > NUM.ZERO : stryMutAct_9fa48("70186") ? true : (stryCov_9fa48("70186", "70187"), (stryMutAct_9fa48("70190") ? pending <= NUM.ZERO : stryMutAct_9fa48("70189") ? pending >= NUM.ZERO : stryMutAct_9fa48("70188") ? true : (stryCov_9fa48("70188", "70189", "70190"), pending > NUM.ZERO)) && (stryMutAct_9fa48("70193") ? backgroundPendingLimit <= NUM.ZERO : stryMutAct_9fa48("70192") ? backgroundPendingLimit >= NUM.ZERO : stryMutAct_9fa48("70191") ? true : (stryCov_9fa48("70191", "70192", "70193"), backgroundPendingLimit > NUM.ZERO)))) && (stryMutAct_9fa48("70196") ? pendingBackground < backgroundPendingLimit : stryMutAct_9fa48("70195") ? pendingBackground > backgroundPendingLimit : stryMutAct_9fa48("70194") ? true : (stryCov_9fa48("70194", "70195", "70196"), pendingBackground >= backgroundPendingLimit)));
      }
    }
    if (stryMutAct_9fa48("70199") ? capacityPartition !== PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE : stryMutAct_9fa48("70198") ? false : stryMutAct_9fa48("70197") ? true : (stryCov_9fa48("70197", "70198", "70199"), capacityPartition === PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE)) {
      if (stryMutAct_9fa48("70200")) {
        {}
      } else {
        stryCov_9fa48("70200");
        return stryMutAct_9fa48("70203") ? criticalReserve > NUM.ZERO || pendingCritical >= criticalReserve : stryMutAct_9fa48("70202") ? false : stryMutAct_9fa48("70201") ? true : (stryCov_9fa48("70201", "70202", "70203"), (stryMutAct_9fa48("70206") ? criticalReserve <= NUM.ZERO : stryMutAct_9fa48("70205") ? criticalReserve >= NUM.ZERO : stryMutAct_9fa48("70204") ? true : (stryCov_9fa48("70204", "70205", "70206"), criticalReserve > NUM.ZERO)) && (stryMutAct_9fa48("70209") ? pendingCritical < criticalReserve : stryMutAct_9fa48("70208") ? pendingCritical > criticalReserve : stryMutAct_9fa48("70207") ? true : (stryCov_9fa48("70207", "70208", "70209"), pendingCritical >= criticalReserve)));
      }
    }
    return stryMutAct_9fa48("70210") ? true : (stryCov_9fa48("70210"), false);
  }
}
function buildPartitionedTransportPressureSummary(routerStats = {}, capacityPartition) {
  if (stryMutAct_9fa48("70211")) {
    {}
  } else {
    stryCov_9fa48("70211");
    const outboundQueues = stryMutAct_9fa48("70214") ? routerStats?.outboundQueues && {} : stryMutAct_9fa48("70213") ? false : stryMutAct_9fa48("70212") ? true : (stryCov_9fa48("70212", "70213", "70214"), (stryMutAct_9fa48("70215") ? routerStats.outboundQueues : (stryCov_9fa48("70215"), routerStats?.outboundQueues)) || {});
    let saturatedNodeCount = NUM.ZERO;
    let totalPending = NUM.ZERO;
    let totalPendingCritical = NUM.ZERO;
    let totalPendingBackground = NUM.ZERO;
    let maxPendingUtilization = NUM.ZERO;
    for (const queue of Object.values(outboundQueues)) {
      if (stryMutAct_9fa48("70216")) {
        {}
      } else {
        stryCov_9fa48("70216");
        const pending = normalizeQueueStat(queue.pending);
        const pendingCritical = normalizeQueueStat(queue.pendingCritical);
        const pendingBackground = normalizeQueueStat(queue.pendingBackground);
        const maxPending = normalizeQueueStat(queue.maxPending);
        if (stryMutAct_9fa48("70218") ? false : stryMutAct_9fa48("70217") ? true : (stryCov_9fa48("70217", "70218"), isPartitionBackpressured(queue, capacityPartition))) {
          if (stryMutAct_9fa48("70219")) {
            {}
          } else {
            stryCov_9fa48("70219");
            stryMutAct_9fa48("70220") ? saturatedNodeCount -= NUM.ONE : (stryCov_9fa48("70220"), saturatedNodeCount += NUM.ONE);
          }
        }
        stryMutAct_9fa48("70221") ? totalPending -= pending : (stryCov_9fa48("70221"), totalPending += pending);
        stryMutAct_9fa48("70222") ? totalPendingCritical -= pendingCritical : (stryCov_9fa48("70222"), totalPendingCritical += pendingCritical);
        stryMutAct_9fa48("70223") ? totalPendingBackground -= pendingBackground : (stryCov_9fa48("70223"), totalPendingBackground += pendingBackground);
        if (stryMutAct_9fa48("70227") ? maxPending <= NUM.ZERO : stryMutAct_9fa48("70226") ? maxPending >= NUM.ZERO : stryMutAct_9fa48("70225") ? false : stryMutAct_9fa48("70224") ? true : (stryCov_9fa48("70224", "70225", "70226", "70227"), maxPending > NUM.ZERO)) {
          if (stryMutAct_9fa48("70228")) {
            {}
          } else {
            stryCov_9fa48("70228");
            maxPendingUtilization = stryMutAct_9fa48("70229") ? Math.min(maxPendingUtilization, pending / maxPending) : (stryCov_9fa48("70229"), Math.max(maxPendingUtilization, stryMutAct_9fa48("70230") ? pending * maxPending : (stryCov_9fa48("70230"), pending / maxPending)));
          }
        }
      }
    }
    return buildTransportPressureSummary(stryMutAct_9fa48("70231") ? {} : (stryCov_9fa48("70231"), {
      backpressured: stryMutAct_9fa48("70235") ? saturatedNodeCount <= NUM.ZERO : stryMutAct_9fa48("70234") ? saturatedNodeCount >= NUM.ZERO : stryMutAct_9fa48("70233") ? false : stryMutAct_9fa48("70232") ? true : (stryCov_9fa48("70232", "70233", "70234", "70235"), saturatedNodeCount > NUM.ZERO),
      saturatedNodeCount,
      totalPending,
      totalPendingCritical,
      totalPendingBackground,
      maxPendingUtilization
    }), capacityPartition);
  }
}
function shouldUseTransportSensor(resourceKeys) {
  if (stryMutAct_9fa48("70236")) {
    {}
  } else {
    stryCov_9fa48("70236");
    if (stryMutAct_9fa48("70239") ? !Array.isArray(resourceKeys) && resourceKeys.length === NUM.ZERO : stryMutAct_9fa48("70238") ? false : stryMutAct_9fa48("70237") ? true : (stryCov_9fa48("70237", "70238", "70239"), (stryMutAct_9fa48("70240") ? Array.isArray(resourceKeys) : (stryCov_9fa48("70240"), !Array.isArray(resourceKeys))) || (stryMutAct_9fa48("70242") ? resourceKeys.length !== NUM.ZERO : stryMutAct_9fa48("70241") ? false : (stryCov_9fa48("70241", "70242"), resourceKeys.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("70243")) {
        {}
      } else {
        stryCov_9fa48("70243");
        return stryMutAct_9fa48("70244") ? false : (stryCov_9fa48("70244"), true);
      }
    }
    return stryMutAct_9fa48("70245") ? resourceKeys.every(resourceKey => {
      return TRANSPORT_RESOURCE_PREFIXES.some(prefix => {
        return resourceKey.startsWith(prefix);
      });
    }) : (stryCov_9fa48("70245"), resourceKeys.some(resourceKey => {
      if (stryMutAct_9fa48("70246")) {
        {}
      } else {
        stryCov_9fa48("70246");
        return stryMutAct_9fa48("70247") ? TRANSPORT_RESOURCE_PREFIXES.every(prefix => {
          return resourceKey.startsWith(prefix);
        }) : (stryCov_9fa48("70247"), TRANSPORT_RESOURCE_PREFIXES.some(prefix => {
          if (stryMutAct_9fa48("70248")) {
            {}
          } else {
            stryCov_9fa48("70248");
            return stryMutAct_9fa48("70249") ? resourceKey.endsWith(prefix) : (stryCov_9fa48("70249"), resourceKey.startsWith(prefix));
          }
        }));
      }
    }));
  }
}
function buildDecision(action, reason, summary, retryAfterMs = NUM.ZERO) {
  if (stryMutAct_9fa48("70250")) {
    {}
  } else {
    stryCov_9fa48("70250");
    return Object.freeze(stryMutAct_9fa48("70251") ? {} : (stryCov_9fa48("70251"), {
      action,
      reason,
      retryAfterMs: normalizeRetryAfterMs(retryAfterMs),
      summary
    }));
  }
}
function buildPressureAdmissionFailure(decision, overrides = {}) {
  if (stryMutAct_9fa48("70252")) {
    {}
  } else {
    stryCov_9fa48("70252");
    const summary = stryMutAct_9fa48("70255") ? decision?.summary && buildNoPressureSummary() : stryMutAct_9fa48("70254") ? false : stryMutAct_9fa48("70253") ? true : (stryCov_9fa48("70253", "70254", "70255"), (stryMutAct_9fa48("70256") ? decision.summary : (stryCov_9fa48("70256"), decision?.summary)) || buildNoPressureSummary());
    return stryMutAct_9fa48("70257") ? {} : (stryCov_9fa48("70257"), {
      success: stryMutAct_9fa48("70258") ? true : (stryCov_9fa48("70258"), false),
      error: stryMutAct_9fa48("70261") ? overrides.error && PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED : stryMutAct_9fa48("70260") ? false : stryMutAct_9fa48("70259") ? true : (stryCov_9fa48("70259", "70260", "70261"), overrides.error || PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED),
      errorCode: stryMutAct_9fa48("70264") ? overrides.errorCode && PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED : stryMutAct_9fa48("70263") ? false : stryMutAct_9fa48("70262") ? true : (stryCov_9fa48("70262", "70263", "70264"), overrides.errorCode || PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED),
      pressureAction: stryMutAct_9fa48("70267") ? decision?.action && PRESSURE_GOVERNOR_ACTION.REJECT : stryMutAct_9fa48("70266") ? false : stryMutAct_9fa48("70265") ? true : (stryCov_9fa48("70265", "70266", "70267"), (stryMutAct_9fa48("70268") ? decision.action : (stryCov_9fa48("70268"), decision?.action)) || PRESSURE_GOVERNOR_ACTION.REJECT),
      pressureReason: stryMutAct_9fa48("70271") ? decision?.reason && PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE : stryMutAct_9fa48("70270") ? false : stryMutAct_9fa48("70269") ? true : (stryCov_9fa48("70269", "70270", "70271"), (stryMutAct_9fa48("70272") ? decision.reason : (stryCov_9fa48("70272"), decision?.reason)) || PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE),
      retryAfterMs: Number.isFinite(stryMutAct_9fa48("70273") ? decision.retryAfterMs : (stryCov_9fa48("70273"), decision?.retryAfterMs)) ? decision.retryAfterMs : NUM.ZERO,
      pressureSummary: summary,
      rows: Array.isArray(overrides.rows) ? overrides.rows : stryMutAct_9fa48("70274") ? ["Stryker was here"] : (stryCov_9fa48("70274"), []),
      tableName: stryMutAct_9fa48("70277") ? overrides.tableName && null : stryMutAct_9fa48("70276") ? false : stryMutAct_9fa48("70275") ? true : (stryCov_9fa48("70275", "70276", "70277"), overrides.tableName || null)
    });
  }
}
class PressureGovernor {
  constructor(options = {}) {
    if (stryMutAct_9fa48("70278")) {
      {}
    } else {
      stryCov_9fa48("70278");
      this.nodeId = normalizeNodeId(options.nodeId);
      this.now = (stryMutAct_9fa48("70281") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("70280") ? false : stryMutAct_9fa48("70279") ? true : (stryCov_9fa48("70279", "70280", "70281"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("70282") ? () => undefined : (stryCov_9fa48("70282"), () => Date.now());
      this.messageRouter = stryMutAct_9fa48("70285") ? options.messageRouter && null : stryMutAct_9fa48("70284") ? false : stryMutAct_9fa48("70283") ? true : (stryCov_9fa48("70283", "70284", "70285"), options.messageRouter || null);
      this.logger = stryMutAct_9fa48("70288") ? options.logger && null : stryMutAct_9fa48("70287") ? false : stryMutAct_9fa48("70286") ? true : (stryCov_9fa48("70286", "70287", "70288"), options.logger || null);
    }
  }
  static getShared(options = {}) {
    if (stryMutAct_9fa48("70289")) {
      {}
    } else {
      stryCov_9fa48("70289");
      const nodeId = normalizeNodeId(options.nodeId);
      if (stryMutAct_9fa48("70292") ? false : stryMutAct_9fa48("70291") ? true : stryMutAct_9fa48("70290") ? SHARED_GOVERNORS.has(nodeId) : (stryCov_9fa48("70290", "70291", "70292"), !SHARED_GOVERNORS.has(nodeId))) {
        if (stryMutAct_9fa48("70293")) {
          {}
        } else {
          stryCov_9fa48("70293");
          SHARED_GOVERNORS.set(nodeId, new PressureGovernor(options));
          return SHARED_GOVERNORS.get(nodeId);
        }
      }
      const shared = SHARED_GOVERNORS.get(nodeId);
      shared.configure(options);
      return shared;
    }
  }
  static clearSharedForTests() {
    if (stryMutAct_9fa48("70294")) {
      {}
    } else {
      stryCov_9fa48("70294");
      SHARED_GOVERNORS.clear();
    }
  }
  configure(options = {}) {
    if (stryMutAct_9fa48("70295")) {
      {}
    } else {
      stryCov_9fa48("70295");
      if (stryMutAct_9fa48("70297") ? false : stryMutAct_9fa48("70296") ? true : (stryCov_9fa48("70296", "70297"), Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.MESSAGEROUTER))) {
        if (stryMutAct_9fa48("70298")) {
          {}
        } else {
          stryCov_9fa48("70298");
          this.messageRouter = stryMutAct_9fa48("70301") ? options.messageRouter && null : stryMutAct_9fa48("70300") ? false : stryMutAct_9fa48("70299") ? true : (stryCov_9fa48("70299", "70300", "70301"), options.messageRouter || null);
        }
      }
      if (stryMutAct_9fa48("70304") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("70303") ? false : stryMutAct_9fa48("70302") ? true : (stryCov_9fa48("70302", "70303", "70304"), typeof options.now === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("70305")) {
          {}
        } else {
          stryCov_9fa48("70305");
          this.now = options.now;
        }
      }
      if (stryMutAct_9fa48("70307") ? false : stryMutAct_9fa48("70306") ? true : (stryCov_9fa48("70306", "70307"), Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.LOGGER))) {
        if (stryMutAct_9fa48("70308")) {
          {}
        } else {
          stryCov_9fa48("70308");
          this.logger = stryMutAct_9fa48("70311") ? options.logger && null : stryMutAct_9fa48("70310") ? false : stryMutAct_9fa48("70309") ? true : (stryCov_9fa48("70309", "70310", "70311"), options.logger || null);
        }
      }
    }
  }
  emitPressureMetric(request = {}, decision = null) {
    if (stryMutAct_9fa48("70312")) {
      {}
    } else {
      stryCov_9fa48("70312");
      if (stryMutAct_9fa48("70315") ? typeof this.logger?.info !== TYPEOF.FUNCTION && !decision : stryMutAct_9fa48("70314") ? false : stryMutAct_9fa48("70313") ? true : (stryCov_9fa48("70313", "70314", "70315"), (stryMutAct_9fa48("70317") ? typeof this.logger?.info === TYPEOF.FUNCTION : stryMutAct_9fa48("70316") ? false : (stryCov_9fa48("70316", "70317"), typeof (stryMutAct_9fa48("70318") ? this.logger.info : (stryCov_9fa48("70318"), this.logger?.info)) !== TYPEOF.FUNCTION)) || (stryMutAct_9fa48("70319") ? decision : (stryCov_9fa48("70319"), !decision)))) {
        if (stryMutAct_9fa48("70320")) {
          {}
        } else {
          stryCov_9fa48("70320");
          return;
        }
      }
      const summary = stryMutAct_9fa48("70323") ? decision.summary && buildNoPressureSummary() : stryMutAct_9fa48("70322") ? false : stryMutAct_9fa48("70321") ? true : (stryCov_9fa48("70321", "70322", "70323"), decision.summary || buildNoPressureSummary());
      if (stryMutAct_9fa48("70326") ? decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW || summary.backpressured !== true : stryMutAct_9fa48("70325") ? false : stryMutAct_9fa48("70324") ? true : (stryCov_9fa48("70324", "70325", "70326"), (stryMutAct_9fa48("70328") ? decision.action !== PRESSURE_GOVERNOR_ACTION.ALLOW : stryMutAct_9fa48("70327") ? true : (stryCov_9fa48("70327", "70328"), decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW)) && (stryMutAct_9fa48("70330") ? summary.backpressured === true : stryMutAct_9fa48("70329") ? true : (stryCov_9fa48("70329", "70330"), summary.backpressured !== (stryMutAct_9fa48("70331") ? false : (stryCov_9fa48("70331"), true)))))) {
        if (stryMutAct_9fa48("70332")) {
          {}
        } else {
          stryCov_9fa48("70332");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("70333")) {
          {}
        } else {
          stryCov_9fa48("70333");
          this.logger.info(METRICS_LOG_TAG.PRESSURE_POLICY, stryMutAct_9fa48("70334") ? {} : (stryCov_9fa48("70334"), {
            nodeId: this.nodeId,
            action: decision.action,
            reason: decision.reason,
            workClass: normalizeWorkClass(request.workClass),
            resourceKeys: normalizeResourceKeys(request.resourceKeys),
            retryAfterMs: normalizeRetryAfterMs(decision.retryAfterMs),
            sensor: stryMutAct_9fa48("70337") ? summary.sensor && PRESSURE_GOVERNOR_LITERAL.NONE : stryMutAct_9fa48("70336") ? false : stryMutAct_9fa48("70335") ? true : (stryCov_9fa48("70335", "70336", "70337"), summary.sensor || PRESSURE_GOVERNOR_LITERAL.NONE),
            capacityPartition: stryMutAct_9fa48("70340") ? summary.capacityPartition && PRESSURE_CAPACITY_PARTITION.SHARED : stryMutAct_9fa48("70339") ? false : stryMutAct_9fa48("70338") ? true : (stryCov_9fa48("70338", "70339", "70340"), summary.capacityPartition || PRESSURE_CAPACITY_PARTITION.SHARED),
            backpressured: stryMutAct_9fa48("70343") ? summary.backpressured !== true : stryMutAct_9fa48("70342") ? false : stryMutAct_9fa48("70341") ? true : (stryCov_9fa48("70341", "70342", "70343"), summary.backpressured === (stryMutAct_9fa48("70344") ? false : (stryCov_9fa48("70344"), true))),
            saturatedNodeCount: normalizeQueueStat(summary.saturatedNodeCount),
            totalPending: normalizeQueueStat(summary.totalPending),
            totalPendingCritical: normalizeQueueStat(summary.totalPendingCritical),
            totalPendingBackground: normalizeQueueStat(summary.totalPendingBackground),
            maxPendingUtilization: Number.isFinite(summary.maxPendingUtilization) ? summary.maxPendingUtilization : NUM.ZERO
          }));
        }
      } catch (_error) {

        // Metrics logging must not change admission behavior.
      }
    }
  }
  getPressureSummary(resourceKeys = stryMutAct_9fa48("70345") ? ["Stryker was here"] : (stryCov_9fa48("70345"), [])) {
    if (stryMutAct_9fa48("70346")) {
      {}
    } else {
      stryCov_9fa48("70346");
      const normalizedKeys = normalizeResourceKeys(resourceKeys);
      const capacityPartition = resolveCapacityPartition(normalizedKeys);
      if (stryMutAct_9fa48("70349") ? false : stryMutAct_9fa48("70348") ? true : stryMutAct_9fa48("70347") ? shouldUseTransportSensor(normalizedKeys) : (stryCov_9fa48("70347", "70348", "70349"), !shouldUseTransportSensor(normalizedKeys))) {
        if (stryMutAct_9fa48("70350")) {
          {}
        } else {
          stryCov_9fa48("70350");
          return buildNoPressureSummary();
        }
      }
      if (stryMutAct_9fa48("70353") ? typeof this.messageRouter?.getStats !== TYPEOF.FUNCTION : stryMutAct_9fa48("70352") ? false : stryMutAct_9fa48("70351") ? true : (stryCov_9fa48("70351", "70352", "70353"), typeof (stryMutAct_9fa48("70354") ? this.messageRouter.getStats : (stryCov_9fa48("70354"), this.messageRouter?.getStats)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("70355")) {
          {}
        } else {
          stryCov_9fa48("70355");
          return buildPartitionedTransportPressureSummary(this.messageRouter.getStats(), capacityPartition);
        }
      }
      if (stryMutAct_9fa48("70358") ? typeof this.messageRouter?.getOutboundPressureSummary === TYPEOF.FUNCTION : stryMutAct_9fa48("70357") ? false : stryMutAct_9fa48("70356") ? true : (stryCov_9fa48("70356", "70357", "70358"), typeof (stryMutAct_9fa48("70359") ? this.messageRouter.getOutboundPressureSummary : (stryCov_9fa48("70359"), this.messageRouter?.getOutboundPressureSummary)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("70360")) {
          {}
        } else {
          stryCov_9fa48("70360");
          return buildTransportPressureSummary(buildNoPressureSummary(PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND), capacityPartition);
        }
      }
      return buildTransportPressureSummary(this.messageRouter.getOutboundPressureSummary(), capacityPartition);
    }
  }
  isBackpressured(request = {}) {
    if (stryMutAct_9fa48("70361")) {
      {}
    } else {
      stryCov_9fa48("70361");
      return stryMutAct_9fa48("70364") ? this.getPressureSummary(request.resourceKeys).backpressured !== true : stryMutAct_9fa48("70363") ? false : stryMutAct_9fa48("70362") ? true : (stryCov_9fa48("70362", "70363", "70364"), this.getPressureSummary(request.resourceKeys).backpressured === (stryMutAct_9fa48("70365") ? false : (stryCov_9fa48("70365"), true)));
    }
  }
  emitDecision(request, decision) {
    if (stryMutAct_9fa48("70366")) {
      {}
    } else {
      stryCov_9fa48("70366");
      this.emitPressureMetric(request, decision);
      return decision;
    }
  }
  evaluate(request = {}) {
    if (stryMutAct_9fa48("70367")) {
      {}
    } else {
      stryCov_9fa48("70367");
      const workClass = normalizeWorkClass(request.workClass);
      const summary = this.getPressureSummary(request.resourceKeys);
      if (stryMutAct_9fa48("70370") ? summary.backpressured === true : stryMutAct_9fa48("70369") ? false : stryMutAct_9fa48("70368") ? true : (stryCov_9fa48("70368", "70369", "70370"), summary.backpressured !== (stryMutAct_9fa48("70371") ? false : (stryCov_9fa48("70371"), true)))) {
        if (stryMutAct_9fa48("70372")) {
          {}
        } else {
          stryCov_9fa48("70372");
          return this.emitDecision(request, buildDecision(PRESSURE_GOVERNOR_ACTION.ALLOW, PRESSURE_GOVERNOR_REASON.NONE, summary, NUM.ZERO));
        }
      }
      if (stryMutAct_9fa48("70375") ? workClass !== PRESSURE_WORK_CLASS.CRITICAL : stryMutAct_9fa48("70374") ? false : stryMutAct_9fa48("70373") ? true : (stryCov_9fa48("70373", "70374", "70375"), workClass === PRESSURE_WORK_CLASS.CRITICAL)) {
        if (stryMutAct_9fa48("70376")) {
          {}
        } else {
          stryCov_9fa48("70376");
          return this.emitDecision(request, buildDecision(PRESSURE_GOVERNOR_ACTION.ALLOW, PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS, summary, NUM.ZERO));
        }
      }
      if (stryMutAct_9fa48("70379") ? request.allowDegrade === false : stryMutAct_9fa48("70378") ? false : stryMutAct_9fa48("70377") ? true : (stryCov_9fa48("70377", "70378", "70379"), request.allowDegrade !== (stryMutAct_9fa48("70380") ? true : (stryCov_9fa48("70380"), false)))) {
        if (stryMutAct_9fa48("70381")) {
          {}
        } else {
          stryCov_9fa48("70381");
          return this.emitDecision(request, buildDecision(PRESSURE_GOVERNOR_ACTION.DEGRADE, PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE, summary, request.retryAfterMs));
        }
      }
      if (stryMutAct_9fa48("70384") ? request.allowDefer !== true : stryMutAct_9fa48("70383") ? false : stryMutAct_9fa48("70382") ? true : (stryCov_9fa48("70382", "70383", "70384"), request.allowDefer === (stryMutAct_9fa48("70385") ? false : (stryCov_9fa48("70385"), true)))) {
        if (stryMutAct_9fa48("70386")) {
          {}
        } else {
          stryCov_9fa48("70386");
          return this.emitDecision(request, buildDecision(PRESSURE_GOVERNOR_ACTION.DEFER, PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE, summary, request.retryAfterMs));
        }
      }
      return this.emitDecision(request, buildDecision(PRESSURE_GOVERNOR_ACTION.REJECT, PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE, summary, request.retryAfterMs));
    }
  }
}
export { buildPressureAdmissionFailure, PRESSURE_GOVERNOR_ACTION, PRESSURE_GOVERNOR_DEFAULT, PRESSURE_GOVERNOR_ERROR_CODE, PRESSURE_GOVERNOR_REASON, PRESSURE_WORK_CLASS, PressureGovernor };