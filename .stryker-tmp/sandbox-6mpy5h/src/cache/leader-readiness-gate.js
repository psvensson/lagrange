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
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { INITIAL_PARTITION_IDS } from '../bootstrap/system-table-schemas-constants.js';
const DEFAULT_OPTIONS = Object.freeze(stryMutAct_9fa48("34068") ? {} : (stryCov_9fa48("34068"), {
  requireLeaderNodeId: stryMutAct_9fa48("34069") ? true : (stryCov_9fa48("34069"), false),
  allowLeaderServiceFallback: stryMutAct_9fa48("34070") ? true : (stryCov_9fa48("34070"), false)
}));
const OWNER_TABLE_BY_SERVICE_TYPE = Object.freeze(stryMutAct_9fa48("34071") ? {} : (stryCov_9fa48("34071"), {
  [SERVICE_TYPE.PARTITION]: TABLES.PARTITIONS,
  [SERVICE_TYPE.MESSAGE_GROUP]: TABLES.MESSAGE_GROUPS
}));
const ID_COLUMN_BY_SERVICE_TYPE = Object.freeze(stryMutAct_9fa48("34072") ? {} : (stryCov_9fa48("34072"), {
  [SERVICE_TYPE.PARTITION]: COLUMN.PARTITION_ID,
  [SERVICE_TYPE.MESSAGE_GROUP]: COLUMN.GROUP_ID
}));
const isFunction = stryMutAct_9fa48("34073") ? () => undefined : (stryCov_9fa48("34073"), (() => {
  const isFunction = value => stryMutAct_9fa48("34076") ? typeof value !== TYPEOF.FUNCTION : stryMutAct_9fa48("34075") ? false : stryMutAct_9fa48("34074") ? true : (stryCov_9fa48("34074", "34075", "34076"), typeof value === TYPEOF.FUNCTION);
  return isFunction;
})());
const getAllRecords = (cache, tableName) => {
  if (stryMutAct_9fa48("34077")) {
    {}
  } else {
    stryCov_9fa48("34077");
    if (stryMutAct_9fa48("34080") ? false : stryMutAct_9fa48("34079") ? true : stryMutAct_9fa48("34078") ? cache : (stryCov_9fa48("34078", "34079", "34080"), !cache)) {
      if (stryMutAct_9fa48("34081")) {
        {}
      } else {
        stryCov_9fa48("34081");
        return stryMutAct_9fa48("34082") ? ["Stryker was here"] : (stryCov_9fa48("34082"), []);
      }
    }
    if (stryMutAct_9fa48("34084") ? false : stryMutAct_9fa48("34083") ? true : (stryCov_9fa48("34083", "34084"), isFunction(cache.getAll))) {
      if (stryMutAct_9fa48("34085")) {
        {}
      } else {
        stryCov_9fa48("34085");
        return stryMutAct_9fa48("34088") ? cache.getAll(tableName) && [] : stryMutAct_9fa48("34087") ? false : stryMutAct_9fa48("34086") ? true : (stryCov_9fa48("34086", "34087", "34088"), cache.getAll(tableName) || (stryMutAct_9fa48("34089") ? ["Stryker was here"] : (stryCov_9fa48("34089"), [])));
      }
    }
    if (stryMutAct_9fa48("34091") ? false : stryMutAct_9fa48("34090") ? true : (stryCov_9fa48("34090", "34091"), isFunction(cache.filter))) {
      if (stryMutAct_9fa48("34092")) {
        {}
      } else {
        stryCov_9fa48("34092");
        return stryMutAct_9fa48("34095") ? cache.filter(tableName, _record => true) && [] : stryMutAct_9fa48("34094") ? false : stryMutAct_9fa48("34093") ? true : (stryCov_9fa48("34093", "34094", "34095"), (stryMutAct_9fa48("34096") ? cache : (stryCov_9fa48("34096"), cache.filter(tableName, stryMutAct_9fa48("34097") ? () => undefined : (stryCov_9fa48("34097"), _record => stryMutAct_9fa48("34098") ? false : (stryCov_9fa48("34098"), true))))) || (stryMutAct_9fa48("34099") ? ["Stryker was here"] : (stryCov_9fa48("34099"), [])));
      }
    }
    return stryMutAct_9fa48("34100") ? ["Stryker was here"] : (stryCov_9fa48("34100"), []);
  }
};
const filterRecords = (cache, tableName, predicate) => {
  if (stryMutAct_9fa48("34101")) {
    {}
  } else {
    stryCov_9fa48("34101");
    if (stryMutAct_9fa48("34104") ? false : stryMutAct_9fa48("34103") ? true : stryMutAct_9fa48("34102") ? cache : (stryCov_9fa48("34102", "34103", "34104"), !cache)) {
      if (stryMutAct_9fa48("34105")) {
        {}
      } else {
        stryCov_9fa48("34105");
        return stryMutAct_9fa48("34106") ? ["Stryker was here"] : (stryCov_9fa48("34106"), []);
      }
    }
    if (stryMutAct_9fa48("34108") ? false : stryMutAct_9fa48("34107") ? true : (stryCov_9fa48("34107", "34108"), isFunction(cache.filter))) {
      if (stryMutAct_9fa48("34109")) {
        {}
      } else {
        stryCov_9fa48("34109");
        return stryMutAct_9fa48("34112") ? cache.filter(tableName, predicate) && [] : stryMutAct_9fa48("34111") ? false : stryMutAct_9fa48("34110") ? true : (stryCov_9fa48("34110", "34111", "34112"), (stryMutAct_9fa48("34113") ? cache : (stryCov_9fa48("34113"), cache.filter(tableName, predicate))) || (stryMutAct_9fa48("34114") ? ["Stryker was here"] : (stryCov_9fa48("34114"), [])));
      }
    }
    if (stryMutAct_9fa48("34116") ? false : stryMutAct_9fa48("34115") ? true : (stryCov_9fa48("34115", "34116"), isFunction(cache.getAll))) {
      if (stryMutAct_9fa48("34117")) {
        {}
      } else {
        stryCov_9fa48("34117");
        const records = stryMutAct_9fa48("34120") ? cache.getAll(tableName) && [] : stryMutAct_9fa48("34119") ? false : stryMutAct_9fa48("34118") ? true : (stryCov_9fa48("34118", "34119", "34120"), cache.getAll(tableName) || (stryMutAct_9fa48("34121") ? ["Stryker was here"] : (stryCov_9fa48("34121"), [])));
        return stryMutAct_9fa48("34122") ? records : (stryCov_9fa48("34122"), records.filter(predicate));
      }
    }
    return stryMutAct_9fa48("34123") ? ["Stryker was here"] : (stryCov_9fa48("34123"), []);
  }
};
const hasPartitionRecord = (cache, partitionId) => {
  if (stryMutAct_9fa48("34124")) {
    {}
  } else {
    stryCov_9fa48("34124");
    const partitions = filterRecords(cache, TABLES.PARTITIONS, stryMutAct_9fa48("34125") ? () => undefined : (stryCov_9fa48("34125"), partition => stryMutAct_9fa48("34128") ? partition[COLUMN.PARTITION_ID] !== partitionId : stryMutAct_9fa48("34127") ? false : stryMutAct_9fa48("34126") ? true : (stryCov_9fa48("34126", "34127", "34128"), partition[COLUMN.PARTITION_ID] === partitionId)));
    return stryMutAct_9fa48("34132") ? partitions.length <= NUM.ZERO : stryMutAct_9fa48("34131") ? partitions.length >= NUM.ZERO : stryMutAct_9fa48("34130") ? false : stryMutAct_9fa48("34129") ? true : (stryCov_9fa48("34129", "34130", "34131", "34132"), partitions.length > NUM.ZERO);
  }
};
const getOwnerTableName = stryMutAct_9fa48("34133") ? () => undefined : (stryCov_9fa48("34133"), (() => {
  const getOwnerTableName = serviceType => stryMutAct_9fa48("34136") ? OWNER_TABLE_BY_SERVICE_TYPE[serviceType] && null : stryMutAct_9fa48("34135") ? false : stryMutAct_9fa48("34134") ? true : (stryCov_9fa48("34134", "34135", "34136"), OWNER_TABLE_BY_SERVICE_TYPE[serviceType] || null);
  return getOwnerTableName;
})());
const getOwnerIdColumn = stryMutAct_9fa48("34137") ? () => undefined : (stryCov_9fa48("34137"), (() => {
  const getOwnerIdColumn = serviceType => stryMutAct_9fa48("34140") ? ID_COLUMN_BY_SERVICE_TYPE[serviceType] && null : stryMutAct_9fa48("34139") ? false : stryMutAct_9fa48("34138") ? true : (stryCov_9fa48("34138", "34139", "34140"), ID_COLUMN_BY_SERVICE_TYPE[serviceType] || null);
  return getOwnerIdColumn;
})());
const getOwnerRecords = (cache, serviceType) => {
  if (stryMutAct_9fa48("34141")) {
    {}
  } else {
    stryCov_9fa48("34141");
    const ownerTableName = getOwnerTableName(serviceType);
    if (stryMutAct_9fa48("34144") ? false : stryMutAct_9fa48("34143") ? true : stryMutAct_9fa48("34142") ? ownerTableName : (stryCov_9fa48("34142", "34143", "34144"), !ownerTableName)) {
      if (stryMutAct_9fa48("34145")) {
        {}
      } else {
        stryCov_9fa48("34145");
        return stryMutAct_9fa48("34146") ? ["Stryker was here"] : (stryCov_9fa48("34146"), []);
      }
    }
    return getAllRecords(cache, ownerTableName);
  }
};
const getOwnerRecord = (cache, serviceType, entityId) => {
  if (stryMutAct_9fa48("34147")) {
    {}
  } else {
    stryCov_9fa48("34147");
    const idColumn = getOwnerIdColumn(serviceType);
    if (stryMutAct_9fa48("34150") ? !idColumn && !entityId : stryMutAct_9fa48("34149") ? false : stryMutAct_9fa48("34148") ? true : (stryCov_9fa48("34148", "34149", "34150"), (stryMutAct_9fa48("34151") ? idColumn : (stryCov_9fa48("34151"), !idColumn)) || (stryMutAct_9fa48("34152") ? entityId : (stryCov_9fa48("34152"), !entityId)))) {
      if (stryMutAct_9fa48("34153")) {
        {}
      } else {
        stryCov_9fa48("34153");
        return null;
      }
    }
    const ownerTableName = getOwnerTableName(serviceType);
    if (stryMutAct_9fa48("34156") ? false : stryMutAct_9fa48("34155") ? true : stryMutAct_9fa48("34154") ? ownerTableName : (stryCov_9fa48("34154", "34155", "34156"), !ownerTableName)) {
      if (stryMutAct_9fa48("34157")) {
        {}
      } else {
        stryCov_9fa48("34157");
        return null;
      }
    }
    if (stryMutAct_9fa48("34159") ? false : stryMutAct_9fa48("34158") ? true : (stryCov_9fa48("34158", "34159"), isFunction(stryMutAct_9fa48("34160") ? cache.get : (stryCov_9fa48("34160"), cache?.get)))) {
      if (stryMutAct_9fa48("34161")) {
        {}
      } else {
        stryCov_9fa48("34161");
        const record = stryMutAct_9fa48("34164") ? cache.get(ownerTableName, entityId) && null : stryMutAct_9fa48("34163") ? false : stryMutAct_9fa48("34162") ? true : (stryCov_9fa48("34162", "34163", "34164"), cache.get(ownerTableName, entityId) || null);
        if (stryMutAct_9fa48("34166") ? false : stryMutAct_9fa48("34165") ? true : (stryCov_9fa48("34165", "34166"), record)) {
          if (stryMutAct_9fa48("34167")) {
            {}
          } else {
            stryCov_9fa48("34167");
            return record;
          }
        }
      }
    }
    const records = getOwnerRecords(cache, serviceType);
    return stryMutAct_9fa48("34170") ? records.find(record => record?.[idColumn] === entityId) && null : stryMutAct_9fa48("34169") ? false : stryMutAct_9fa48("34168") ? true : (stryCov_9fa48("34168", "34169", "34170"), records.find(stryMutAct_9fa48("34171") ? () => undefined : (stryCov_9fa48("34171"), record => stryMutAct_9fa48("34174") ? record?.[idColumn] !== entityId : stryMutAct_9fa48("34173") ? false : stryMutAct_9fa48("34172") ? true : (stryCov_9fa48("34172", "34173", "34174"), (stryMutAct_9fa48("34175") ? record[idColumn] : (stryCov_9fa48("34175"), record?.[idColumn])) === entityId))) || null);
  }
};
const findCanonicalLeaderService = (services, serviceType, entityId, leaderNodeId, options = {}) => {
  if (stryMutAct_9fa48("34176")) {
    {}
  } else {
    stryCov_9fa48("34176");
    if (stryMutAct_9fa48("34179") ? false : stryMutAct_9fa48("34178") ? true : stryMutAct_9fa48("34177") ? leaderNodeId : (stryCov_9fa48("34177", "34178", "34179"), !leaderNodeId)) {
      if (stryMutAct_9fa48("34180")) {
        {}
      } else {
        stryCov_9fa48("34180");
        return null;
      }
    }
    const idColumn = getOwnerIdColumn(serviceType);
    const requireAddress = stryMutAct_9fa48("34183") ? options.requireAddress !== true : stryMutAct_9fa48("34182") ? false : stryMutAct_9fa48("34181") ? true : (stryCov_9fa48("34181", "34182", "34183"), options.requireAddress === (stryMutAct_9fa48("34184") ? false : (stryCov_9fa48("34184"), true)));
    const leaderNodeServices = stryMutAct_9fa48("34185") ? services : (stryCov_9fa48("34185"), services.filter(stryMutAct_9fa48("34186") ? () => undefined : (stryCov_9fa48("34186"), service => stryMutAct_9fa48("34189") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && service?.[COLUMN.NODE_ID] === leaderNodeId || !requireAddress || Boolean(service?.[COLUMN.ADDRESS]) : stryMutAct_9fa48("34188") ? false : stryMutAct_9fa48("34187") ? true : (stryCov_9fa48("34187", "34188", "34189"), (stryMutAct_9fa48("34191") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE || service?.[COLUMN.NODE_ID] === leaderNodeId : stryMutAct_9fa48("34190") ? true : (stryCov_9fa48("34190", "34191"), (stryMutAct_9fa48("34193") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId || service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("34192") ? true : (stryCov_9fa48("34192", "34193"), (stryMutAct_9fa48("34195") ? service?.[COLUMN.SERVICE_TYPE] === serviceType || service?.[idColumn] === entityId : stryMutAct_9fa48("34194") ? true : (stryCov_9fa48("34194", "34195"), (stryMutAct_9fa48("34197") ? service?.[COLUMN.SERVICE_TYPE] !== serviceType : stryMutAct_9fa48("34196") ? true : (stryCov_9fa48("34196", "34197"), (stryMutAct_9fa48("34198") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("34198"), service?.[COLUMN.SERVICE_TYPE])) === serviceType)) && (stryMutAct_9fa48("34200") ? service?.[idColumn] !== entityId : stryMutAct_9fa48("34199") ? true : (stryCov_9fa48("34199", "34200"), (stryMutAct_9fa48("34201") ? service[idColumn] : (stryCov_9fa48("34201"), service?.[idColumn])) === entityId)))) && (stryMutAct_9fa48("34203") ? service?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("34202") ? true : (stryCov_9fa48("34202", "34203"), (stryMutAct_9fa48("34204") ? service[COLUMN.STATUS] : (stryCov_9fa48("34204"), service?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE)))) && (stryMutAct_9fa48("34206") ? service?.[COLUMN.NODE_ID] !== leaderNodeId : stryMutAct_9fa48("34205") ? true : (stryCov_9fa48("34205", "34206"), (stryMutAct_9fa48("34207") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("34207"), service?.[COLUMN.NODE_ID])) === leaderNodeId)))) && (stryMutAct_9fa48("34209") ? !requireAddress && Boolean(service?.[COLUMN.ADDRESS]) : stryMutAct_9fa48("34208") ? true : (stryCov_9fa48("34208", "34209"), (stryMutAct_9fa48("34210") ? requireAddress : (stryCov_9fa48("34210"), !requireAddress)) || Boolean(stryMutAct_9fa48("34211") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("34211"), service?.[COLUMN.ADDRESS]))))))));
    if (stryMutAct_9fa48("34214") ? leaderNodeServices.length !== NUM.ZERO : stryMutAct_9fa48("34213") ? false : stryMutAct_9fa48("34212") ? true : (stryCov_9fa48("34212", "34213", "34214"), leaderNodeServices.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("34215")) {
        {}
      } else {
        stryCov_9fa48("34215");
        return null;
      }
    }
    if (stryMutAct_9fa48("34218") ? leaderNodeServices.length !== NUM.ONE : stryMutAct_9fa48("34217") ? false : stryMutAct_9fa48("34216") ? true : (stryCov_9fa48("34216", "34217", "34218"), leaderNodeServices.length === NUM.ONE)) {
      if (stryMutAct_9fa48("34219")) {
        {}
      } else {
        stryCov_9fa48("34219");
        return leaderNodeServices[NUM.ZERO];
      }
    }
    const explicitLeaderServices = stryMutAct_9fa48("34220") ? leaderNodeServices : (stryCov_9fa48("34220"), leaderNodeServices.filter(stryMutAct_9fa48("34221") ? () => undefined : (stryCov_9fa48("34221"), service => stryMutAct_9fa48("34224") ? String(service?.[COLUMN.RAFT_ROLE] || '').toLowerCase() !== RAFT_ROLE.LEADER : stryMutAct_9fa48("34223") ? false : stryMutAct_9fa48("34222") ? true : (stryCov_9fa48("34222", "34223", "34224"), (stryMutAct_9fa48("34225") ? String(service?.[COLUMN.RAFT_ROLE] || '').toUpperCase() : (stryCov_9fa48("34225"), String(stryMutAct_9fa48("34228") ? service?.[COLUMN.RAFT_ROLE] && '' : stryMutAct_9fa48("34227") ? false : stryMutAct_9fa48("34226") ? true : (stryCov_9fa48("34226", "34227", "34228"), (stryMutAct_9fa48("34229") ? service[COLUMN.RAFT_ROLE] : (stryCov_9fa48("34229"), service?.[COLUMN.RAFT_ROLE])) || (stryMutAct_9fa48("34230") ? "Stryker was here!" : (stryCov_9fa48("34230"), '')))).toLowerCase())) === RAFT_ROLE.LEADER))));
    if (stryMutAct_9fa48("34233") ? explicitLeaderServices.length !== NUM.ONE : stryMutAct_9fa48("34232") ? false : stryMutAct_9fa48("34231") ? true : (stryCov_9fa48("34231", "34232", "34233"), explicitLeaderServices.length === NUM.ONE)) {
      if (stryMutAct_9fa48("34234")) {
        {}
      } else {
        stryCov_9fa48("34234");
        return explicitLeaderServices[NUM.ZERO];
      }
    }

    // Services.raft_role is advisory follower metadata for many replicas. When
    // multiple active replicas for the same entity are co-located on the owner
    // node, routing still treats any active addressed replica on that node as a
    // usable canonical target.
    return stryMutAct_9fa48("34237") ? [...leaderNodeServices].sort((left, right) => {
      const leftKey = left?.[COLUMN.SERVICE_ID] || left?.replica_id || left?.[COLUMN.ADDRESS] || '';
      const rightKey = right?.[COLUMN.SERVICE_ID] || right?.replica_id || right?.[COLUMN.ADDRESS] || '';
      return String(leftKey).localeCompare(String(rightKey));
    })[NUM.ZERO] && null : stryMutAct_9fa48("34236") ? false : stryMutAct_9fa48("34235") ? true : (stryCov_9fa48("34235", "34236", "34237"), (stryMutAct_9fa48("34238") ? [...leaderNodeServices][NUM.ZERO] : (stryCov_9fa48("34238"), (stryMutAct_9fa48("34239") ? [] : (stryCov_9fa48("34239"), [...leaderNodeServices])).sort((left, right) => {
      if (stryMutAct_9fa48("34240")) {
        {}
      } else {
        stryCov_9fa48("34240");
        const leftKey = stryMutAct_9fa48("34243") ? (left?.[COLUMN.SERVICE_ID] || left?.replica_id || left?.[COLUMN.ADDRESS]) && '' : stryMutAct_9fa48("34242") ? false : stryMutAct_9fa48("34241") ? true : (stryCov_9fa48("34241", "34242", "34243"), (stryMutAct_9fa48("34245") ? (left?.[COLUMN.SERVICE_ID] || left?.replica_id) && left?.[COLUMN.ADDRESS] : stryMutAct_9fa48("34244") ? false : (stryCov_9fa48("34244", "34245"), (stryMutAct_9fa48("34247") ? left?.[COLUMN.SERVICE_ID] && left?.replica_id : stryMutAct_9fa48("34246") ? false : (stryCov_9fa48("34246", "34247"), (stryMutAct_9fa48("34248") ? left[COLUMN.SERVICE_ID] : (stryCov_9fa48("34248"), left?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("34249") ? left.replica_id : (stryCov_9fa48("34249"), left?.replica_id)))) || (stryMutAct_9fa48("34250") ? left[COLUMN.ADDRESS] : (stryCov_9fa48("34250"), left?.[COLUMN.ADDRESS])))) || (stryMutAct_9fa48("34251") ? "Stryker was here!" : (stryCov_9fa48("34251"), '')));
        const rightKey = stryMutAct_9fa48("34254") ? (right?.[COLUMN.SERVICE_ID] || right?.replica_id || right?.[COLUMN.ADDRESS]) && '' : stryMutAct_9fa48("34253") ? false : stryMutAct_9fa48("34252") ? true : (stryCov_9fa48("34252", "34253", "34254"), (stryMutAct_9fa48("34256") ? (right?.[COLUMN.SERVICE_ID] || right?.replica_id) && right?.[COLUMN.ADDRESS] : stryMutAct_9fa48("34255") ? false : (stryCov_9fa48("34255", "34256"), (stryMutAct_9fa48("34258") ? right?.[COLUMN.SERVICE_ID] && right?.replica_id : stryMutAct_9fa48("34257") ? false : (stryCov_9fa48("34257", "34258"), (stryMutAct_9fa48("34259") ? right[COLUMN.SERVICE_ID] : (stryCov_9fa48("34259"), right?.[COLUMN.SERVICE_ID])) || (stryMutAct_9fa48("34260") ? right.replica_id : (stryCov_9fa48("34260"), right?.replica_id)))) || (stryMutAct_9fa48("34261") ? right[COLUMN.ADDRESS] : (stryCov_9fa48("34261"), right?.[COLUMN.ADDRESS])))) || (stryMutAct_9fa48("34262") ? "Stryker was here!" : (stryCov_9fa48("34262"), '')));
        return String(leftKey).localeCompare(String(rightKey));
      }
    })[NUM.ZERO])) || null);
  }
};
const findObservableLeaderService = (services, serviceType, entityId, options = {}) => {
  if (stryMutAct_9fa48("34263")) {
    {}
  } else {
    stryCov_9fa48("34263");
    const idColumn = getOwnerIdColumn(serviceType);
    const requireAddress = stryMutAct_9fa48("34266") ? options.requireAddress !== true : stryMutAct_9fa48("34265") ? false : stryMutAct_9fa48("34264") ? true : (stryCov_9fa48("34264", "34265", "34266"), options.requireAddress === (stryMutAct_9fa48("34267") ? false : (stryCov_9fa48("34267"), true)));
    return stryMutAct_9fa48("34270") ? services.find(service => service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && typeof service?.[COLUMN.NODE_ID] === TYPEOF.STRING && service[COLUMN.NODE_ID].length > NUM.ZERO && (!requireAddress || Boolean(service?.[COLUMN.ADDRESS]))) && null : stryMutAct_9fa48("34269") ? false : stryMutAct_9fa48("34268") ? true : (stryCov_9fa48("34268", "34269", "34270"), services.find(stryMutAct_9fa48("34271") ? () => undefined : (stryCov_9fa48("34271"), service => stryMutAct_9fa48("34274") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && typeof service?.[COLUMN.NODE_ID] === TYPEOF.STRING && service[COLUMN.NODE_ID].length > NUM.ZERO || !requireAddress || Boolean(service?.[COLUMN.ADDRESS]) : stryMutAct_9fa48("34273") ? false : stryMutAct_9fa48("34272") ? true : (stryCov_9fa48("34272", "34273", "34274"), (stryMutAct_9fa48("34276") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE && typeof service?.[COLUMN.NODE_ID] === TYPEOF.STRING || service[COLUMN.NODE_ID].length > NUM.ZERO : stryMutAct_9fa48("34275") ? true : (stryCov_9fa48("34275", "34276"), (stryMutAct_9fa48("34278") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId && service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE || typeof service?.[COLUMN.NODE_ID] === TYPEOF.STRING : stryMutAct_9fa48("34277") ? true : (stryCov_9fa48("34277", "34278"), (stryMutAct_9fa48("34280") ? service?.[COLUMN.SERVICE_TYPE] === serviceType && service?.[idColumn] === entityId || service?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("34279") ? true : (stryCov_9fa48("34279", "34280"), (stryMutAct_9fa48("34282") ? service?.[COLUMN.SERVICE_TYPE] === serviceType || service?.[idColumn] === entityId : stryMutAct_9fa48("34281") ? true : (stryCov_9fa48("34281", "34282"), (stryMutAct_9fa48("34284") ? service?.[COLUMN.SERVICE_TYPE] !== serviceType : stryMutAct_9fa48("34283") ? true : (stryCov_9fa48("34283", "34284"), (stryMutAct_9fa48("34285") ? service[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("34285"), service?.[COLUMN.SERVICE_TYPE])) === serviceType)) && (stryMutAct_9fa48("34287") ? service?.[idColumn] !== entityId : stryMutAct_9fa48("34286") ? true : (stryCov_9fa48("34286", "34287"), (stryMutAct_9fa48("34288") ? service[idColumn] : (stryCov_9fa48("34288"), service?.[idColumn])) === entityId)))) && (stryMutAct_9fa48("34290") ? service?.[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("34289") ? true : (stryCov_9fa48("34289", "34290"), (stryMutAct_9fa48("34291") ? service[COLUMN.STATUS] : (stryCov_9fa48("34291"), service?.[COLUMN.STATUS])) === SERVICE_STATUS.ACTIVE)))) && (stryMutAct_9fa48("34293") ? typeof service?.[COLUMN.NODE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("34292") ? true : (stryCov_9fa48("34292", "34293"), typeof (stryMutAct_9fa48("34294") ? service[COLUMN.NODE_ID] : (stryCov_9fa48("34294"), service?.[COLUMN.NODE_ID])) === TYPEOF.STRING)))) && (stryMutAct_9fa48("34297") ? service[COLUMN.NODE_ID].length <= NUM.ZERO : stryMutAct_9fa48("34296") ? service[COLUMN.NODE_ID].length >= NUM.ZERO : stryMutAct_9fa48("34295") ? true : (stryCov_9fa48("34295", "34296", "34297"), service[COLUMN.NODE_ID].length > NUM.ZERO)))) && (stryMutAct_9fa48("34299") ? !requireAddress && Boolean(service?.[COLUMN.ADDRESS]) : stryMutAct_9fa48("34298") ? true : (stryCov_9fa48("34298", "34299"), (stryMutAct_9fa48("34300") ? requireAddress : (stryCov_9fa48("34300"), !requireAddress)) || Boolean(stryMutAct_9fa48("34301") ? service[COLUMN.ADDRESS] : (stryCov_9fa48("34301"), service?.[COLUMN.ADDRESS]))))))) || null);
  }
};
const resolveCanonicalLeaderService = (cache, serviceType, entityId, options = {}) => {
  if (stryMutAct_9fa48("34302")) {
    {}
  } else {
    stryCov_9fa48("34302");
    if (stryMutAct_9fa48("34305") ? (!cache || !serviceType) && !entityId : stryMutAct_9fa48("34304") ? false : stryMutAct_9fa48("34303") ? true : (stryCov_9fa48("34303", "34304", "34305"), (stryMutAct_9fa48("34307") ? !cache && !serviceType : stryMutAct_9fa48("34306") ? false : (stryCov_9fa48("34306", "34307"), (stryMutAct_9fa48("34308") ? cache : (stryCov_9fa48("34308"), !cache)) || (stryMutAct_9fa48("34309") ? serviceType : (stryCov_9fa48("34309"), !serviceType)))) || (stryMutAct_9fa48("34310") ? entityId : (stryCov_9fa48("34310"), !entityId)))) {
      if (stryMutAct_9fa48("34311")) {
        {}
      } else {
        stryCov_9fa48("34311");
        return stryMutAct_9fa48("34312") ? {} : (stryCov_9fa48("34312"), {
          ownerRecord: null,
          leaderNodeId: null,
          leaderService: null
        });
      }
    }
    const ownerRecord = getOwnerRecord(cache, serviceType, entityId);
    const leaderNodeId = stryMutAct_9fa48("34315") ? ownerRecord?.[COLUMN.LEADER_NODE_ID] && null : stryMutAct_9fa48("34314") ? false : stryMutAct_9fa48("34313") ? true : (stryCov_9fa48("34313", "34314", "34315"), (stryMutAct_9fa48("34316") ? ownerRecord[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("34316"), ownerRecord?.[COLUMN.LEADER_NODE_ID])) || null);
    const services = getAllRecords(cache, TABLES.SERVICES);
    const leaderService = stryMutAct_9fa48("34319") ? findCanonicalLeaderService(services, serviceType, entityId, leaderNodeId, options) && (options.allowLeaderServiceFallback === true && !leaderNodeId ? findObservableLeaderService(services, serviceType, entityId, options) : null) : stryMutAct_9fa48("34318") ? false : stryMutAct_9fa48("34317") ? true : (stryCov_9fa48("34317", "34318", "34319"), findCanonicalLeaderService(services, serviceType, entityId, leaderNodeId, options) || ((stryMutAct_9fa48("34322") ? options.allowLeaderServiceFallback === true || !leaderNodeId : stryMutAct_9fa48("34321") ? false : stryMutAct_9fa48("34320") ? true : (stryCov_9fa48("34320", "34321", "34322"), (stryMutAct_9fa48("34324") ? options.allowLeaderServiceFallback !== true : stryMutAct_9fa48("34323") ? true : (stryCov_9fa48("34323", "34324"), options.allowLeaderServiceFallback === (stryMutAct_9fa48("34325") ? false : (stryCov_9fa48("34325"), true)))) && (stryMutAct_9fa48("34326") ? leaderNodeId : (stryCov_9fa48("34326"), !leaderNodeId)))) ? findObservableLeaderService(services, serviceType, entityId, options) : null));
    return stryMutAct_9fa48("34327") ? {} : (stryCov_9fa48("34327"), {
      ownerRecord,
      leaderNodeId: stryMutAct_9fa48("34330") ? (leaderNodeId || leaderService?.[COLUMN.NODE_ID]) && null : stryMutAct_9fa48("34329") ? false : stryMutAct_9fa48("34328") ? true : (stryCov_9fa48("34328", "34329", "34330"), (stryMutAct_9fa48("34332") ? leaderNodeId && leaderService?.[COLUMN.NODE_ID] : stryMutAct_9fa48("34331") ? false : (stryCov_9fa48("34331", "34332"), leaderNodeId || (stryMutAct_9fa48("34333") ? leaderService[COLUMN.NODE_ID] : (stryCov_9fa48("34333"), leaderService?.[COLUMN.NODE_ID])))) || null),
      leaderService
    });
  }
};

/**
 * Check if a partition has any leader service (even without address).
 * Used for self-referential checks where the services partition needs
 * to write to itself - we can't require address in that case.
 * @param {Object} cache - System table cache.
 * @param {string} partitionId - Partition ID.
 * @return {boolean} True if leader exists.
 */
const hasCanonicalPartitionLeaderService = stryMutAct_9fa48("34334") ? () => undefined : (stryCov_9fa48("34334"), (() => {
  const hasCanonicalPartitionLeaderService = (cache, partitionId, options = {}) => Boolean(resolveCanonicalLeaderService(cache, SERVICE_TYPE.PARTITION, partitionId, options).leaderService);
  return hasCanonicalPartitionLeaderService;
})());
const hasLeaderNodeId = stryMutAct_9fa48("34335") ? () => undefined : (stryCov_9fa48("34335"), (() => {
  const hasLeaderNodeId = record => Boolean(stryMutAct_9fa48("34338") ? record || record[COLUMN.LEADER_NODE_ID] : stryMutAct_9fa48("34337") ? false : stryMutAct_9fa48("34336") ? true : (stryCov_9fa48("34336", "34337", "34338"), record && record[COLUMN.LEADER_NODE_ID]));
  return hasLeaderNodeId;
})());
const getSystemPartitionId = stryMutAct_9fa48("34339") ? () => undefined : (stryCov_9fa48("34339"), (() => {
  const getSystemPartitionId = tableName => stryMutAct_9fa48("34342") ? INITIAL_PARTITION_IDS[tableName] && null : stryMutAct_9fa48("34341") ? false : stryMutAct_9fa48("34340") ? true : (stryCov_9fa48("34340", "34341", "34342"), INITIAL_PARTITION_IDS[tableName] || null);
  return getSystemPartitionId;
})());

/**
 * Check if a system table is ready for writes.
 * For the services table itself, we use a relaxed check that doesn't require
 * the leader to have an address (since the address is what we're trying to write).
 * @param {Object} systemTableCache - System table cache.
 * @param {string} tableName - Table name.
 * @return {boolean} True if ready for writes.
 */
const isSystemTableWriteReady = (systemTableCache, tableName) => {
  if (stryMutAct_9fa48("34343")) {
    {}
  } else {
    stryCov_9fa48("34343");
    if (stryMutAct_9fa48("34346") ? false : stryMutAct_9fa48("34345") ? true : stryMutAct_9fa48("34344") ? systemTableCache : (stryCov_9fa48("34344", "34345", "34346"), !systemTableCache)) {
      if (stryMutAct_9fa48("34347")) {
        {}
      } else {
        stryCov_9fa48("34347");
        return stryMutAct_9fa48("34348") ? true : (stryCov_9fa48("34348"), false);
      }
    }
    const partitionId = getSystemPartitionId(tableName);
    if (stryMutAct_9fa48("34351") ? false : stryMutAct_9fa48("34350") ? true : stryMutAct_9fa48("34349") ? partitionId : (stryCov_9fa48("34349", "34350", "34351"), !partitionId)) {
      if (stryMutAct_9fa48("34352")) {
        {}
      } else {
        stryCov_9fa48("34352");
        return stryMutAct_9fa48("34353") ? true : (stryCov_9fa48("34353"), false);
      }
    }
    if (stryMutAct_9fa48("34356") ? false : stryMutAct_9fa48("34355") ? true : stryMutAct_9fa48("34354") ? hasPartitionRecord(systemTableCache, partitionId) : (stryCov_9fa48("34354", "34355", "34356"), !hasPartitionRecord(systemTableCache, partitionId))) {
      if (stryMutAct_9fa48("34357")) {
        {}
      } else {
        stryCov_9fa48("34357");
        return stryMutAct_9fa48("34358") ? true : (stryCov_9fa48("34358"), false);
      }
    }
    // For the services table, use relaxed check without requiring address
    // This avoids circular dependency where services-p1 leader can't write
    // its own address because it doesn't have an address yet
    if (stryMutAct_9fa48("34361") ? tableName !== TABLES.SERVICES : stryMutAct_9fa48("34360") ? false : stryMutAct_9fa48("34359") ? true : (stryCov_9fa48("34359", "34360", "34361"), tableName === TABLES.SERVICES)) {
      if (stryMutAct_9fa48("34362")) {
        {}
      } else {
        stryCov_9fa48("34362");
        return hasCanonicalPartitionLeaderService(systemTableCache, partitionId);
      }
    }
    return hasCanonicalPartitionLeaderService(systemTableCache, partitionId, stryMutAct_9fa48("34363") ? {} : (stryCov_9fa48("34363"), {
      requireAddress: stryMutAct_9fa48("34364") ? false : (stryCov_9fa48("34364"), true)
    }));
  }
};
const getMissingSystemServiceLeaders = (systemTableCache, options = {}) => {
  if (stryMutAct_9fa48("34365")) {
    {}
  } else {
    stryCov_9fa48("34365");
    const config = stryMutAct_9fa48("34366") ? {} : (stryCov_9fa48("34366"), {
      ...DEFAULT_OPTIONS,
      ...options
    });
    const partitions = getAllRecords(systemTableCache, TABLES.PARTITIONS);
    const messageGroups = getAllRecords(systemTableCache, TABLES.MESSAGE_GROUPS);
    const missingPartitionLeaders = stryMutAct_9fa48("34367") ? ["Stryker was here"] : (stryCov_9fa48("34367"), []);
    const missingMessageGroupLeaders = stryMutAct_9fa48("34368") ? ["Stryker was here"] : (stryCov_9fa48("34368"), []);
    const missingPartitionLeaderNodes = stryMutAct_9fa48("34369") ? ["Stryker was here"] : (stryCov_9fa48("34369"), []);
    const missingMessageGroupLeaderNodes = stryMutAct_9fa48("34370") ? ["Stryker was here"] : (stryCov_9fa48("34370"), []);
    const missingPartitionLeaderAddresses = stryMutAct_9fa48("34371") ? ["Stryker was here"] : (stryCov_9fa48("34371"), []);
    const missingMessageGroupLeaderAddresses = stryMutAct_9fa48("34372") ? ["Stryker was here"] : (stryCov_9fa48("34372"), []);
    for (const partition of partitions) {
      if (stryMutAct_9fa48("34373")) {
        {}
      } else {
        stryCov_9fa48("34373");
        const partitionId = partition[COLUMN.PARTITION_ID];
        if (stryMutAct_9fa48("34376") ? false : stryMutAct_9fa48("34375") ? true : stryMutAct_9fa48("34374") ? partitionId : (stryCov_9fa48("34374", "34375", "34376"), !partitionId)) {
          if (stryMutAct_9fa48("34377")) {
            {}
          } else {
            stryCov_9fa48("34377");
            continue;
          }
        }
        const {
          leaderNodeId,
          leaderService
        } = resolveCanonicalLeaderService(systemTableCache, SERVICE_TYPE.PARTITION, partitionId, stryMutAct_9fa48("34378") ? {} : (stryCov_9fa48("34378"), {
          requireAddress: stryMutAct_9fa48("34379") ? true : (stryCov_9fa48("34379"), false),
          allowLeaderServiceFallback: stryMutAct_9fa48("34382") ? config.allowLeaderServiceFallback !== true : stryMutAct_9fa48("34381") ? false : stryMutAct_9fa48("34380") ? true : (stryCov_9fa48("34380", "34381", "34382"), config.allowLeaderServiceFallback === (stryMutAct_9fa48("34383") ? false : (stryCov_9fa48("34383"), true)))
        }));
        if (stryMutAct_9fa48("34386") ? false : stryMutAct_9fa48("34385") ? true : stryMutAct_9fa48("34384") ? leaderService : (stryCov_9fa48("34384", "34385", "34386"), !leaderService)) {
          if (stryMutAct_9fa48("34387")) {
            {}
          } else {
            stryCov_9fa48("34387");
            missingPartitionLeaders.push(partitionId);
          }
        } else {
          if (stryMutAct_9fa48("34388")) {
            {}
          } else {
            stryCov_9fa48("34388");
            if (stryMutAct_9fa48("34391") ? false : stryMutAct_9fa48("34390") ? true : stryMutAct_9fa48("34389") ? leaderService[COLUMN.ADDRESS] : (stryCov_9fa48("34389", "34390", "34391"), !leaderService[COLUMN.ADDRESS])) {
              if (stryMutAct_9fa48("34392")) {
                {}
              } else {
                stryCov_9fa48("34392");
                missingPartitionLeaderAddresses.push(partitionId);
              }
            }
            if (stryMutAct_9fa48("34395") ? false : stryMutAct_9fa48("34394") ? true : stryMutAct_9fa48("34393") ? leaderNodeId : (stryCov_9fa48("34393", "34394", "34395"), !leaderNodeId)) {
              if (stryMutAct_9fa48("34396")) {
                {}
              } else {
                stryCov_9fa48("34396");
                missingPartitionLeaderNodes.push(partitionId);
              }
            }
          }
        }
        if (stryMutAct_9fa48("34399") ? !leaderService && config.requireLeaderNodeId || !hasLeaderNodeId(partition) : stryMutAct_9fa48("34398") ? false : stryMutAct_9fa48("34397") ? true : (stryCov_9fa48("34397", "34398", "34399"), (stryMutAct_9fa48("34401") ? !leaderService || config.requireLeaderNodeId : stryMutAct_9fa48("34400") ? true : (stryCov_9fa48("34400", "34401"), (stryMutAct_9fa48("34402") ? leaderService : (stryCov_9fa48("34402"), !leaderService)) && config.requireLeaderNodeId)) && (stryMutAct_9fa48("34403") ? hasLeaderNodeId(partition) : (stryCov_9fa48("34403"), !hasLeaderNodeId(partition))))) {
          if (stryMutAct_9fa48("34404")) {
            {}
          } else {
            stryCov_9fa48("34404");
            if (stryMutAct_9fa48("34407") ? false : stryMutAct_9fa48("34406") ? true : stryMutAct_9fa48("34405") ? missingPartitionLeaderNodes.includes(partitionId) : (stryCov_9fa48("34405", "34406", "34407"), !missingPartitionLeaderNodes.includes(partitionId))) {
              if (stryMutAct_9fa48("34408")) {
                {}
              } else {
                stryCov_9fa48("34408");
                missingPartitionLeaderNodes.push(partitionId);
              }
            }
          }
        }
        if (stryMutAct_9fa48("34411") ? leaderService && config.requireLeaderNodeId || !hasLeaderNodeId(partition) : stryMutAct_9fa48("34410") ? false : stryMutAct_9fa48("34409") ? true : (stryCov_9fa48("34409", "34410", "34411"), (stryMutAct_9fa48("34413") ? leaderService || config.requireLeaderNodeId : stryMutAct_9fa48("34412") ? true : (stryCov_9fa48("34412", "34413"), leaderService && config.requireLeaderNodeId)) && (stryMutAct_9fa48("34414") ? hasLeaderNodeId(partition) : (stryCov_9fa48("34414"), !hasLeaderNodeId(partition))))) {
          if (stryMutAct_9fa48("34415")) {
            {}
          } else {
            stryCov_9fa48("34415");
            if (stryMutAct_9fa48("34418") ? false : stryMutAct_9fa48("34417") ? true : stryMutAct_9fa48("34416") ? missingPartitionLeaderNodes.includes(partitionId) : (stryCov_9fa48("34416", "34417", "34418"), !missingPartitionLeaderNodes.includes(partitionId))) {
              if (stryMutAct_9fa48("34419")) {
                {}
              } else {
                stryCov_9fa48("34419");
                missingPartitionLeaderNodes.push(partitionId);
              }
            }
          }
        }
      }
    }
    for (const group of messageGroups) {
      if (stryMutAct_9fa48("34420")) {
        {}
      } else {
        stryCov_9fa48("34420");
        const groupId = group[COLUMN.GROUP_ID];
        if (stryMutAct_9fa48("34423") ? false : stryMutAct_9fa48("34422") ? true : stryMutAct_9fa48("34421") ? groupId : (stryCov_9fa48("34421", "34422", "34423"), !groupId)) {
          if (stryMutAct_9fa48("34424")) {
            {}
          } else {
            stryCov_9fa48("34424");
            continue;
          }
        }
        const {
          leaderNodeId,
          leaderService
        } = resolveCanonicalLeaderService(systemTableCache, SERVICE_TYPE.MESSAGE_GROUP, groupId, stryMutAct_9fa48("34425") ? {} : (stryCov_9fa48("34425"), {
          requireAddress: stryMutAct_9fa48("34426") ? true : (stryCov_9fa48("34426"), false),
          allowLeaderServiceFallback: stryMutAct_9fa48("34429") ? config.allowLeaderServiceFallback !== true : stryMutAct_9fa48("34428") ? false : stryMutAct_9fa48("34427") ? true : (stryCov_9fa48("34427", "34428", "34429"), config.allowLeaderServiceFallback === (stryMutAct_9fa48("34430") ? false : (stryCov_9fa48("34430"), true)))
        }));
        if (stryMutAct_9fa48("34433") ? false : stryMutAct_9fa48("34432") ? true : stryMutAct_9fa48("34431") ? leaderService : (stryCov_9fa48("34431", "34432", "34433"), !leaderService)) {
          if (stryMutAct_9fa48("34434")) {
            {}
          } else {
            stryCov_9fa48("34434");
            missingMessageGroupLeaders.push(groupId);
          }
        } else {
          if (stryMutAct_9fa48("34435")) {
            {}
          } else {
            stryCov_9fa48("34435");
            if (stryMutAct_9fa48("34438") ? false : stryMutAct_9fa48("34437") ? true : stryMutAct_9fa48("34436") ? leaderService[COLUMN.ADDRESS] : (stryCov_9fa48("34436", "34437", "34438"), !leaderService[COLUMN.ADDRESS])) {
              if (stryMutAct_9fa48("34439")) {
                {}
              } else {
                stryCov_9fa48("34439");
                missingMessageGroupLeaderAddresses.push(groupId);
              }
            }
            if (stryMutAct_9fa48("34442") ? false : stryMutAct_9fa48("34441") ? true : stryMutAct_9fa48("34440") ? leaderNodeId : (stryCov_9fa48("34440", "34441", "34442"), !leaderNodeId)) {
              if (stryMutAct_9fa48("34443")) {
                {}
              } else {
                stryCov_9fa48("34443");
                missingMessageGroupLeaderNodes.push(groupId);
              }
            }
          }
        }
        if (stryMutAct_9fa48("34446") ? !leaderService && config.requireLeaderNodeId || !hasLeaderNodeId(group) : stryMutAct_9fa48("34445") ? false : stryMutAct_9fa48("34444") ? true : (stryCov_9fa48("34444", "34445", "34446"), (stryMutAct_9fa48("34448") ? !leaderService || config.requireLeaderNodeId : stryMutAct_9fa48("34447") ? true : (stryCov_9fa48("34447", "34448"), (stryMutAct_9fa48("34449") ? leaderService : (stryCov_9fa48("34449"), !leaderService)) && config.requireLeaderNodeId)) && (stryMutAct_9fa48("34450") ? hasLeaderNodeId(group) : (stryCov_9fa48("34450"), !hasLeaderNodeId(group))))) {
          if (stryMutAct_9fa48("34451")) {
            {}
          } else {
            stryCov_9fa48("34451");
            if (stryMutAct_9fa48("34454") ? false : stryMutAct_9fa48("34453") ? true : stryMutAct_9fa48("34452") ? missingMessageGroupLeaderNodes.includes(groupId) : (stryCov_9fa48("34452", "34453", "34454"), !missingMessageGroupLeaderNodes.includes(groupId))) {
              if (stryMutAct_9fa48("34455")) {
                {}
              } else {
                stryCov_9fa48("34455");
                missingMessageGroupLeaderNodes.push(groupId);
              }
            }
          }
        }
        if (stryMutAct_9fa48("34458") ? leaderService && config.requireLeaderNodeId || !hasLeaderNodeId(group) : stryMutAct_9fa48("34457") ? false : stryMutAct_9fa48("34456") ? true : (stryCov_9fa48("34456", "34457", "34458"), (stryMutAct_9fa48("34460") ? leaderService || config.requireLeaderNodeId : stryMutAct_9fa48("34459") ? true : (stryCov_9fa48("34459", "34460"), leaderService && config.requireLeaderNodeId)) && (stryMutAct_9fa48("34461") ? hasLeaderNodeId(group) : (stryCov_9fa48("34461"), !hasLeaderNodeId(group))))) {
          if (stryMutAct_9fa48("34462")) {
            {}
          } else {
            stryCov_9fa48("34462");
            if (stryMutAct_9fa48("34465") ? false : stryMutAct_9fa48("34464") ? true : stryMutAct_9fa48("34463") ? missingMessageGroupLeaderNodes.includes(groupId) : (stryCov_9fa48("34463", "34464", "34465"), !missingMessageGroupLeaderNodes.includes(groupId))) {
              if (stryMutAct_9fa48("34466")) {
                {}
              } else {
                stryCov_9fa48("34466");
                missingMessageGroupLeaderNodes.push(groupId);
              }
            }
          }
        }
      }
    }
    return stryMutAct_9fa48("34467") ? {} : (stryCov_9fa48("34467"), {
      missingPartitionLeaders,
      missingMessageGroupLeaders,
      missingPartitionLeaderNodes,
      missingMessageGroupLeaderNodes,
      missingPartitionLeaderAddresses,
      missingMessageGroupLeaderAddresses
    });
  }
};
const getBlockingSystemServiceLeaders = (systemTableCache, requiredTables = stryMutAct_9fa48("34468") ? ["Stryker was here"] : (stryCov_9fa48("34468"), []), options = {}) => {
  if (stryMutAct_9fa48("34469")) {
    {}
  } else {
    stryCov_9fa48("34469");
    const isTableWriteSatisfied = (stryMutAct_9fa48("34472") ? typeof options.isTableWriteSatisfied !== TYPEOF.FUNCTION : stryMutAct_9fa48("34471") ? false : stryMutAct_9fa48("34470") ? true : (stryCov_9fa48("34470", "34471", "34472"), typeof options.isTableWriteSatisfied === TYPEOF.FUNCTION)) ? options.isTableWriteSatisfied : isSystemTableWriteReady;
    const missing = getMissingSystemServiceLeaders(systemTableCache, stryMutAct_9fa48("34473") ? {} : (stryCov_9fa48("34473"), {
      requireLeaderNodeId: stryMutAct_9fa48("34476") ? options.requireLeaderNodeId !== true : stryMutAct_9fa48("34475") ? false : stryMutAct_9fa48("34474") ? true : (stryCov_9fa48("34474", "34475", "34476"), options.requireLeaderNodeId === (stryMutAct_9fa48("34477") ? false : (stryCov_9fa48("34477"), true))),
      allowLeaderServiceFallback: stryMutAct_9fa48("34480") ? options.allowLeaderServiceFallback !== true : stryMutAct_9fa48("34479") ? false : stryMutAct_9fa48("34478") ? true : (stryCov_9fa48("34478", "34479", "34480"), options.allowLeaderServiceFallback === (stryMutAct_9fa48("34481") ? false : (stryCov_9fa48("34481"), true)))
    }));
    const missingPartitionLeaders = stryMutAct_9fa48("34482") ? ["Stryker was here"] : (stryCov_9fa48("34482"), []);
    const missingPartitionLeaderNodes = stryMutAct_9fa48("34483") ? ["Stryker was here"] : (stryCov_9fa48("34483"), []);
    const missingPartitionLeaderAddresses = stryMutAct_9fa48("34484") ? ["Stryker was here"] : (stryCov_9fa48("34484"), []);
    const missingRequiredTables = stryMutAct_9fa48("34485") ? ["Stryker was here"] : (stryCov_9fa48("34485"), []);
    for (const tableName of requiredTables) {
      if (stryMutAct_9fa48("34486")) {
        {}
      } else {
        stryCov_9fa48("34486");
        const partitionId = getSystemPartitionId(tableName);
        if (stryMutAct_9fa48("34489") ? !partitionId && !hasPartitionRecord(systemTableCache, partitionId) : stryMutAct_9fa48("34488") ? false : stryMutAct_9fa48("34487") ? true : (stryCov_9fa48("34487", "34488", "34489"), (stryMutAct_9fa48("34490") ? partitionId : (stryCov_9fa48("34490"), !partitionId)) || (stryMutAct_9fa48("34491") ? hasPartitionRecord(systemTableCache, partitionId) : (stryCov_9fa48("34491"), !hasPartitionRecord(systemTableCache, partitionId))))) {
          if (stryMutAct_9fa48("34492")) {
            {}
          } else {
            stryCov_9fa48("34492");
            continue;
          }
        }
        if (stryMutAct_9fa48("34494") ? false : stryMutAct_9fa48("34493") ? true : (stryCov_9fa48("34493", "34494"), isTableWriteSatisfied(systemTableCache, tableName))) {
          if (stryMutAct_9fa48("34495")) {
            {}
          } else {
            stryCov_9fa48("34495");
            continue;
          }
        }
        missingRequiredTables.push(tableName);
        missingPartitionLeaders.push(partitionId);
        if (stryMutAct_9fa48("34497") ? false : stryMutAct_9fa48("34496") ? true : (stryCov_9fa48("34496", "34497"), missing.missingPartitionLeaderNodes.includes(partitionId))) {
          if (stryMutAct_9fa48("34498")) {
            {}
          } else {
            stryCov_9fa48("34498");
            missingPartitionLeaderNodes.push(partitionId);
          }
        }
        if (stryMutAct_9fa48("34500") ? false : stryMutAct_9fa48("34499") ? true : (stryCov_9fa48("34499", "34500"), missing.missingPartitionLeaderAddresses.includes(partitionId))) {
          if (stryMutAct_9fa48("34501")) {
            {}
          } else {
            stryCov_9fa48("34501");
            missingPartitionLeaderAddresses.push(partitionId);
          }
        }
      }
    }
    return stryMutAct_9fa48("34502") ? {} : (stryCov_9fa48("34502"), {
      ...missing,
      missingPartitionLeaders,
      missingPartitionLeaderNodes,
      missingPartitionLeaderAddresses,
      missingMessageGroupLeaders: stryMutAct_9fa48("34503") ? ["Stryker was here"] : (stryCov_9fa48("34503"), []),
      missingMessageGroupLeaderNodes: stryMutAct_9fa48("34504") ? ["Stryker was here"] : (stryCov_9fa48("34504"), []),
      missingMessageGroupLeaderAddresses: stryMutAct_9fa48("34505") ? ["Stryker was here"] : (stryCov_9fa48("34505"), []),
      missingRequiredTables
    });
  }
};
const getMissingSystemServiceLeaderCount = stryMutAct_9fa48("34506") ? () => undefined : (stryCov_9fa48("34506"), (() => {
  const getMissingSystemServiceLeaderCount = (missing = {}) => stryMutAct_9fa48("34507") ? (missing.missingPartitionLeaders?.length || NUM.ZERO) + (missing.missingMessageGroupLeaders?.length || NUM.ZERO) + (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) + (missing.missingMessageGroupLeaderNodes?.length || NUM.ZERO) + (missing.missingPartitionLeaderAddresses?.length || NUM.ZERO) - (missing.missingMessageGroupLeaderAddresses?.length || NUM.ZERO) : (stryCov_9fa48("34507"), (stryMutAct_9fa48("34508") ? (missing.missingPartitionLeaders?.length || NUM.ZERO) + (missing.missingMessageGroupLeaders?.length || NUM.ZERO) + (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) + (missing.missingMessageGroupLeaderNodes?.length || NUM.ZERO) - (missing.missingPartitionLeaderAddresses?.length || NUM.ZERO) : (stryCov_9fa48("34508"), (stryMutAct_9fa48("34509") ? (missing.missingPartitionLeaders?.length || NUM.ZERO) + (missing.missingMessageGroupLeaders?.length || NUM.ZERO) + (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) - (missing.missingMessageGroupLeaderNodes?.length || NUM.ZERO) : (stryCov_9fa48("34509"), (stryMutAct_9fa48("34510") ? (missing.missingPartitionLeaders?.length || NUM.ZERO) + (missing.missingMessageGroupLeaders?.length || NUM.ZERO) - (missing.missingPartitionLeaderNodes?.length || NUM.ZERO) : (stryCov_9fa48("34510"), (stryMutAct_9fa48("34511") ? (missing.missingPartitionLeaders?.length || NUM.ZERO) - (missing.missingMessageGroupLeaders?.length || NUM.ZERO) : (stryCov_9fa48("34511"), (stryMutAct_9fa48("34514") ? missing.missingPartitionLeaders?.length && NUM.ZERO : stryMutAct_9fa48("34513") ? false : stryMutAct_9fa48("34512") ? true : (stryCov_9fa48("34512", "34513", "34514"), (stryMutAct_9fa48("34515") ? missing.missingPartitionLeaders.length : (stryCov_9fa48("34515"), missing.missingPartitionLeaders?.length)) || NUM.ZERO)) + (stryMutAct_9fa48("34518") ? missing.missingMessageGroupLeaders?.length && NUM.ZERO : stryMutAct_9fa48("34517") ? false : stryMutAct_9fa48("34516") ? true : (stryCov_9fa48("34516", "34517", "34518"), (stryMutAct_9fa48("34519") ? missing.missingMessageGroupLeaders.length : (stryCov_9fa48("34519"), missing.missingMessageGroupLeaders?.length)) || NUM.ZERO)))) + (stryMutAct_9fa48("34522") ? missing.missingPartitionLeaderNodes?.length && NUM.ZERO : stryMutAct_9fa48("34521") ? false : stryMutAct_9fa48("34520") ? true : (stryCov_9fa48("34520", "34521", "34522"), (stryMutAct_9fa48("34523") ? missing.missingPartitionLeaderNodes.length : (stryCov_9fa48("34523"), missing.missingPartitionLeaderNodes?.length)) || NUM.ZERO)))) + (stryMutAct_9fa48("34526") ? missing.missingMessageGroupLeaderNodes?.length && NUM.ZERO : stryMutAct_9fa48("34525") ? false : stryMutAct_9fa48("34524") ? true : (stryCov_9fa48("34524", "34525", "34526"), (stryMutAct_9fa48("34527") ? missing.missingMessageGroupLeaderNodes.length : (stryCov_9fa48("34527"), missing.missingMessageGroupLeaderNodes?.length)) || NUM.ZERO)))) + (stryMutAct_9fa48("34530") ? missing.missingPartitionLeaderAddresses?.length && NUM.ZERO : stryMutAct_9fa48("34529") ? false : stryMutAct_9fa48("34528") ? true : (stryCov_9fa48("34528", "34529", "34530"), (stryMutAct_9fa48("34531") ? missing.missingPartitionLeaderAddresses.length : (stryCov_9fa48("34531"), missing.missingPartitionLeaderAddresses?.length)) || NUM.ZERO)))) + (stryMutAct_9fa48("34534") ? missing.missingMessageGroupLeaderAddresses?.length && NUM.ZERO : stryMutAct_9fa48("34533") ? false : stryMutAct_9fa48("34532") ? true : (stryCov_9fa48("34532", "34533", "34534"), (stryMutAct_9fa48("34535") ? missing.missingMessageGroupLeaderAddresses.length : (stryCov_9fa48("34535"), missing.missingMessageGroupLeaderAddresses?.length)) || NUM.ZERO)));
  return getMissingSystemServiceLeaderCount;
})());
export { getBlockingSystemServiceLeaders, getOwnerRecords, getOwnerRecord, getMissingSystemServiceLeaders, getMissingSystemServiceLeaderCount, isSystemTableWriteReady, resolveCanonicalLeaderService };