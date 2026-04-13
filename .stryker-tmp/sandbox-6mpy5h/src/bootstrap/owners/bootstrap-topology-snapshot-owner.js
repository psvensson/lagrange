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
import { ConfigurationManager } from '../../config/configuration-manager.js';
import { CONFIG_KEY } from '../../config/config-constants.js';
import { assertCritical } from '../../utils/assert.js';
import { COLUMN, NUM, SERVICE_STATUS, SERVICE_TYPE, TABLES, TYPEOF } from '../../constants/index.js';
import { RAFT_ROLE } from '../../raft/constants.js';
import { getSystemCachePrimaryKeyFieldOrFallback } from '../../cache/system-cache-key-descriptor.js';
import { buildBootstrapTopologySnapshotEnvelope } from '../bootstrap-topology-snapshot.js';
import { BOOTSTRAP_API_ERROR } from '../bootstrap-api-constants.js';
class BootstrapTopologySnapshotOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("21098")) {
      {}
    } else {
      stryCov_9fa48("21098");
      this.delegates = stryMutAct_9fa48("21101") ? options.delegates && {} : stryMutAct_9fa48("21100") ? false : stryMutAct_9fa48("21099") ? true : (stryCov_9fa48("21099", "21100", "21101"), options.delegates || {});
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("21102")) {
      {}
    } else {
      stryCov_9fa48("21102");
      return stryMutAct_9fa48("21105") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("21104") ? false : stryMutAct_9fa48("21103") ? true : (stryCov_9fa48("21103", "21104", "21105"), (stryMutAct_9fa48("21106") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("21106"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getPartitionServices() {
    if (stryMutAct_9fa48("21107")) {
      {}
    } else {
      stryCov_9fa48("21107");
      return stryMutAct_9fa48("21110") ? this.delegates.getPartitionServices?.() && null : stryMutAct_9fa48("21109") ? false : stryMutAct_9fa48("21108") ? true : (stryCov_9fa48("21108", "21109", "21110"), (stryMutAct_9fa48("21111") ? this.delegates.getPartitionServices() : (stryCov_9fa48("21111"), this.delegates.getPartitionServices?.())) || null);
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("21112")) {
      {}
    } else {
      stryCov_9fa48("21112");
      return stryMutAct_9fa48("21115") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("21114") ? false : stryMutAct_9fa48("21113") ? true : (stryCov_9fa48("21113", "21114", "21115"), (stryMutAct_9fa48("21116") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("21116"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("21117")) {
      {}
    } else {
      stryCov_9fa48("21117");
      return stryMutAct_9fa48("21120") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("21119") ? false : stryMutAct_9fa48("21118") ? true : (stryCov_9fa48("21118", "21119", "21120"), (stryMutAct_9fa48("21121") ? this.delegates.getLogger() : (stryCov_9fa48("21121"), this.delegates.getLogger?.())) || console);
    }
  }
  getCurrentEpoch() {
    if (stryMutAct_9fa48("21122")) {
      {}
    } else {
      stryCov_9fa48("21122");
      return stryMutAct_9fa48("21125") ? this.delegates.getCurrentEpoch?.() && null : stryMutAct_9fa48("21124") ? false : stryMutAct_9fa48("21123") ? true : (stryCov_9fa48("21123", "21124", "21125"), (stryMutAct_9fa48("21126") ? this.delegates.getCurrentEpoch() : (stryCov_9fa48("21126"), this.delegates.getCurrentEpoch?.())) || null);
    }
  }
  getBootstrapAuthoritativeTableRows(tableName) {
    if (stryMutAct_9fa48("21127")) {
      {}
    } else {
      stryCov_9fa48("21127");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const cacheRows = stryMutAct_9fa48("21130") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("21129") ? false : stryMutAct_9fa48("21128") ? true : (stryCov_9fa48("21128", "21129", "21130"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("21131") ? ["Stryker was here"] : (stryCov_9fa48("21131"), [])));
      const rows = this.resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows);
      return Array.isArray(rows) ? rows : stryMutAct_9fa48("21132") ? ["Stryker was here"] : (stryCov_9fa48("21132"), []);
    }
  }
  buildSystemTableSnapshots() {
    if (stryMutAct_9fa48("21133")) {
      {}
    } else {
      stryCov_9fa48("21133");
      return this.buildBootstrapTopologySnapshotEnvelope().systemTableSnapshots;
    }
  }
  buildBootstrapTopologySnapshotEnvelope(options = {}) {
    if (stryMutAct_9fa48("21134")) {
      {}
    } else {
      stryCov_9fa48("21134");
      const currentEpoch = (stryMutAct_9fa48("21137") ? options.currentEpoch !== undefined : stryMutAct_9fa48("21136") ? false : stryMutAct_9fa48("21135") ? true : (stryCov_9fa48("21135", "21136", "21137"), options.currentEpoch === undefined)) ? this.getCurrentEpoch() : options.currentEpoch;
      const envelope = buildBootstrapTopologySnapshotEnvelope(stryMutAct_9fa48("21138") ? {} : (stryCov_9fa48("21138"), {
        systemTableCache: assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED),
        currentEpoch,
        resolveSnapshotRows: stryMutAct_9fa48("21139") ? () => undefined : (stryCov_9fa48("21139"), (tableName, cacheRows) => this.resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows))
      }));
      const serviceSnapshot = stryMutAct_9fa48("21142") ? envelope.systemTableSnapshots[TABLES.SERVICES] && [] : stryMutAct_9fa48("21141") ? false : stryMutAct_9fa48("21140") ? true : (stryCov_9fa48("21140", "21141", "21142"), envelope.systemTableSnapshots[TABLES.SERVICES] || (stryMutAct_9fa48("21143") ? ["Stryker was here"] : (stryCov_9fa48("21143"), [])));
      const leaders = stryMutAct_9fa48("21144") ? serviceSnapshot : (stryCov_9fa48("21144"), serviceSnapshot.filter(stryMutAct_9fa48("21145") ? () => undefined : (stryCov_9fa48("21145"), service => stryMutAct_9fa48("21148") ? service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION && service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER || service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("21147") ? false : stryMutAct_9fa48("21146") ? true : (stryCov_9fa48("21146", "21147", "21148"), (stryMutAct_9fa48("21150") ? service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION || service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER : stryMutAct_9fa48("21149") ? true : (stryCov_9fa48("21149", "21150"), (stryMutAct_9fa48("21152") ? service[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("21151") ? true : (stryCov_9fa48("21151", "21152"), service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION)) && (stryMutAct_9fa48("21154") ? service[COLUMN.RAFT_ROLE] !== RAFT_ROLE.LEADER : stryMutAct_9fa48("21153") ? true : (stryCov_9fa48("21153", "21154"), service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER)))) && (stryMutAct_9fa48("21156") ? service[COLUMN.STATUS] !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("21155") ? true : (stryCov_9fa48("21155", "21156"), service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE))))));
      if (stryMutAct_9fa48("21159") ? leaders.length !== NUM.ZERO : stryMutAct_9fa48("21158") ? false : stryMutAct_9fa48("21157") ? true : (stryCov_9fa48("21157", "21158", "21159"), leaders.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("21160")) {
          {}
        } else {
          stryCov_9fa48("21160");
          this.getLogger().warn(stryMutAct_9fa48("21161") ? "" : (stryCov_9fa48("21161"), 'No partition leaders found in system cache'), stryMutAct_9fa48("21162") ? {} : (stryCov_9fa48("21162"), {
            seedNodeId: this.getSeedNodeId(),
            totalServices: serviceSnapshot.length
          }));
        }
      }
      return envelope;
    }
  }
  resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta = null) {
    if (stryMutAct_9fa48("21163")) {
      {}
    } else {
      stryCov_9fa48("21163");
      if (stryMutAct_9fa48("21166") ? topologySnapshotMeta || typeof topologySnapshotMeta === TYPEOF.OBJECT : stryMutAct_9fa48("21165") ? false : stryMutAct_9fa48("21164") ? true : (stryCov_9fa48("21164", "21165", "21166"), topologySnapshotMeta && (stryMutAct_9fa48("21168") ? typeof topologySnapshotMeta !== TYPEOF.OBJECT : stryMutAct_9fa48("21167") ? true : (stryCov_9fa48("21167", "21168"), typeof topologySnapshotMeta === TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("21169")) {
          {}
        } else {
          stryCov_9fa48("21169");
          return topologySnapshotMeta;
        }
      }
      return stryMutAct_9fa48("21172") ? this.buildBootstrapTopologySnapshotEnvelope().topologySnapshotMeta && null : stryMutAct_9fa48("21171") ? false : stryMutAct_9fa48("21170") ? true : (stryCov_9fa48("21170", "21171", "21172"), this.buildBootstrapTopologySnapshotEnvelope().topologySnapshotMeta || null);
    }
  }
  resolveBootstrapTopologySnapshotActiveNodeIds(topologySnapshotMeta = null) {
    if (stryMutAct_9fa48("21173")) {
      {}
    } else {
      stryCov_9fa48("21173");
      const resolvedMeta = this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
      if (stryMutAct_9fa48("21176") ? false : stryMutAct_9fa48("21175") ? true : stryMutAct_9fa48("21174") ? Array.isArray(resolvedMeta?.activeNodeIds) : (stryCov_9fa48("21174", "21175", "21176"), !Array.isArray(stryMutAct_9fa48("21177") ? resolvedMeta.activeNodeIds : (stryCov_9fa48("21177"), resolvedMeta?.activeNodeIds)))) {
        if (stryMutAct_9fa48("21178")) {
          {}
        } else {
          stryCov_9fa48("21178");
          return stryMutAct_9fa48("21179") ? ["Stryker was here"] : (stryCov_9fa48("21179"), []);
        }
      }
      return stryMutAct_9fa48("21180") ? [] : (stryCov_9fa48("21180"), [...new Set(stryMutAct_9fa48("21181") ? resolvedMeta.activeNodeIds : (stryCov_9fa48("21181"), resolvedMeta.activeNodeIds.filter(stryMutAct_9fa48("21182") ? () => undefined : (stryCov_9fa48("21182"), nodeId => stryMutAct_9fa48("21185") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("21184") ? false : stryMutAct_9fa48("21183") ? true : (stryCov_9fa48("21183", "21184", "21185"), (stryMutAct_9fa48("21187") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("21186") ? true : (stryCov_9fa48("21186", "21187"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("21190") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("21189") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("21188") ? true : (stryCov_9fa48("21188", "21189", "21190"), nodeId.length > NUM.ZERO)))))))]);
    }
  }
  resolveBootstrapTopologySnapshotEpoch(topologySnapshotMeta = null) {
    if (stryMutAct_9fa48("21191")) {
      {}
    } else {
      stryCov_9fa48("21191");
      const resolvedMeta = this.resolveBootstrapTopologySnapshotMeta(topologySnapshotMeta);
      if (stryMutAct_9fa48("21193") ? false : stryMutAct_9fa48("21192") ? true : (stryCov_9fa48("21192", "21193"), Number.isFinite(stryMutAct_9fa48("21194") ? resolvedMeta.topologyEpoch : (stryCov_9fa48("21194"), resolvedMeta?.topologyEpoch)))) {
        if (stryMutAct_9fa48("21195")) {
          {}
        } else {
          stryCov_9fa48("21195");
          return stryMutAct_9fa48("21196") ? Math.min(NUM.ZERO, Math.floor(resolvedMeta.topologyEpoch)) : (stryCov_9fa48("21196"), Math.max(NUM.ZERO, Math.floor(resolvedMeta.topologyEpoch)));
        }
      }
      const currentEpoch = this.getCurrentEpoch();
      if (stryMutAct_9fa48("21198") ? false : stryMutAct_9fa48("21197") ? true : (stryCov_9fa48("21197", "21198"), Number.isFinite(stryMutAct_9fa48("21199") ? currentEpoch.epoch : (stryCov_9fa48("21199"), currentEpoch?.epoch)))) {
        if (stryMutAct_9fa48("21200")) {
          {}
        } else {
          stryCov_9fa48("21200");
          return stryMutAct_9fa48("21201") ? Math.min(NUM.ZERO, Math.floor(currentEpoch.epoch)) : (stryCov_9fa48("21201"), Math.max(NUM.ZERO, Math.floor(currentEpoch.epoch)));
        }
      }
      return null;
    }
  }
  getBootstrapPartitionSnapshotRow(partitionId) {
    if (stryMutAct_9fa48("21202")) {
      {}
    } else {
      stryCov_9fa48("21202");
      if (stryMutAct_9fa48("21205") ? typeof partitionId !== TYPEOF.STRING && partitionId.length === NUM.ZERO : stryMutAct_9fa48("21204") ? false : stryMutAct_9fa48("21203") ? true : (stryCov_9fa48("21203", "21204", "21205"), (stryMutAct_9fa48("21207") ? typeof partitionId === TYPEOF.STRING : stryMutAct_9fa48("21206") ? false : (stryCov_9fa48("21206", "21207"), typeof partitionId !== TYPEOF.STRING)) || (stryMutAct_9fa48("21209") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("21208") ? false : (stryCov_9fa48("21208", "21209"), partitionId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("21210")) {
          {}
        } else {
          stryCov_9fa48("21210");
          return null;
        }
      }
      const partitionRows = this.getBootstrapAuthoritativeTableRows(TABLES.PARTITIONS);
      return stryMutAct_9fa48("21213") ? partitionRows.find(row => {
        return row?.[COLUMN.PARTITION_ID] === partitionId || row?.partition_id === partitionId || row?.partitionId === partitionId;
      }) && null : stryMutAct_9fa48("21212") ? false : stryMutAct_9fa48("21211") ? true : (stryCov_9fa48("21211", "21212", "21213"), partitionRows.find(row => {
        if (stryMutAct_9fa48("21214")) {
          {}
        } else {
          stryCov_9fa48("21214");
          return stryMutAct_9fa48("21217") ? (row?.[COLUMN.PARTITION_ID] === partitionId || row?.partition_id === partitionId) && row?.partitionId === partitionId : stryMutAct_9fa48("21216") ? false : stryMutAct_9fa48("21215") ? true : (stryCov_9fa48("21215", "21216", "21217"), (stryMutAct_9fa48("21219") ? row?.[COLUMN.PARTITION_ID] === partitionId && row?.partition_id === partitionId : stryMutAct_9fa48("21218") ? false : (stryCov_9fa48("21218", "21219"), (stryMutAct_9fa48("21221") ? row?.[COLUMN.PARTITION_ID] !== partitionId : stryMutAct_9fa48("21220") ? false : (stryCov_9fa48("21220", "21221"), (stryMutAct_9fa48("21222") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("21222"), row?.[COLUMN.PARTITION_ID])) === partitionId)) || (stryMutAct_9fa48("21224") ? row?.partition_id !== partitionId : stryMutAct_9fa48("21223") ? false : (stryCov_9fa48("21223", "21224"), (stryMutAct_9fa48("21225") ? row.partition_id : (stryCov_9fa48("21225"), row?.partition_id)) === partitionId)))) || (stryMutAct_9fa48("21227") ? row?.partitionId !== partitionId : stryMutAct_9fa48("21226") ? false : (stryCov_9fa48("21226", "21227"), (stryMutAct_9fa48("21228") ? row.partitionId : (stryCov_9fa48("21228"), row?.partitionId)) === partitionId)));
        }
      }) || null);
    }
  }
  resolveCanonicalPartitionLeaderNodeId(partitionId) {
    if (stryMutAct_9fa48("21229")) {
      {}
    } else {
      stryCov_9fa48("21229");
      const partition = this.getBootstrapPartitionSnapshotRow(partitionId);
      const leaderNodeId = stryMutAct_9fa48("21230") ? (partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leader_node_id ?? partition?.leaderNodeId) && null : (stryCov_9fa48("21230"), (stryMutAct_9fa48("21231") ? (partition?.[COLUMN.LEADER_NODE_ID] ?? partition?.leader_node_id) && partition?.leaderNodeId : (stryCov_9fa48("21231"), (stryMutAct_9fa48("21232") ? partition?.[COLUMN.LEADER_NODE_ID] && partition?.leader_node_id : (stryCov_9fa48("21232"), (stryMutAct_9fa48("21233") ? partition[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("21233"), partition?.[COLUMN.LEADER_NODE_ID])) ?? (stryMutAct_9fa48("21234") ? partition.leader_node_id : (stryCov_9fa48("21234"), partition?.leader_node_id)))) ?? (stryMutAct_9fa48("21235") ? partition.leaderNodeId : (stryCov_9fa48("21235"), partition?.leaderNodeId)))) ?? null);
      return (stryMutAct_9fa48("21238") ? typeof leaderNodeId === TYPEOF.STRING || leaderNodeId.length > NUM.ZERO : stryMutAct_9fa48("21237") ? false : stryMutAct_9fa48("21236") ? true : (stryCov_9fa48("21236", "21237", "21238"), (stryMutAct_9fa48("21240") ? typeof leaderNodeId !== TYPEOF.STRING : stryMutAct_9fa48("21239") ? true : (stryCov_9fa48("21239", "21240"), typeof leaderNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("21243") ? leaderNodeId.length <= NUM.ZERO : stryMutAct_9fa48("21242") ? leaderNodeId.length >= NUM.ZERO : stryMutAct_9fa48("21241") ? true : (stryCov_9fa48("21241", "21242", "21243"), leaderNodeId.length > NUM.ZERO)))) ? leaderNodeId : null;
    }
  }
  isBootstrapRoutingGraceWindow(partition) {
    if (stryMutAct_9fa48("21244")) {
      {}
    } else {
      stryCov_9fa48("21244");
      if (stryMutAct_9fa48("21247") ? false : stryMutAct_9fa48("21246") ? true : stryMutAct_9fa48("21245") ? partition : (stryCov_9fa48("21245", "21246", "21247"), !partition)) {
        if (stryMutAct_9fa48("21248")) {
          {}
        } else {
          stryCov_9fa48("21248");
          return stryMutAct_9fa48("21249") ? true : (stryCov_9fa48("21249"), false);
        }
      }
      const createdAt = stryMutAct_9fa48("21250") ? (partition?.[COLUMN.CREATED_AT] ?? partition?.created_at ?? partition?.createdAt) && null : (stryCov_9fa48("21250"), (stryMutAct_9fa48("21251") ? (partition?.[COLUMN.CREATED_AT] ?? partition?.created_at) && partition?.createdAt : (stryCov_9fa48("21251"), (stryMutAct_9fa48("21252") ? partition?.[COLUMN.CREATED_AT] && partition?.created_at : (stryCov_9fa48("21252"), (stryMutAct_9fa48("21253") ? partition[COLUMN.CREATED_AT] : (stryCov_9fa48("21253"), partition?.[COLUMN.CREATED_AT])) ?? (stryMutAct_9fa48("21254") ? partition.created_at : (stryCov_9fa48("21254"), partition?.created_at)))) ?? (stryMutAct_9fa48("21255") ? partition.createdAt : (stryCov_9fa48("21255"), partition?.createdAt)))) ?? null);
      const updatedAt = stryMutAct_9fa48("21256") ? (partition?.[COLUMN.UPDATED_AT] ?? partition?.updated_at ?? partition?.updatedAt) && null : (stryCov_9fa48("21256"), (stryMutAct_9fa48("21257") ? (partition?.[COLUMN.UPDATED_AT] ?? partition?.updated_at) && partition?.updatedAt : (stryCov_9fa48("21257"), (stryMutAct_9fa48("21258") ? partition?.[COLUMN.UPDATED_AT] && partition?.updated_at : (stryCov_9fa48("21258"), (stryMutAct_9fa48("21259") ? partition[COLUMN.UPDATED_AT] : (stryCov_9fa48("21259"), partition?.[COLUMN.UPDATED_AT])) ?? (stryMutAct_9fa48("21260") ? partition.updated_at : (stryCov_9fa48("21260"), partition?.updated_at)))) ?? (stryMutAct_9fa48("21261") ? partition.updatedAt : (stryCov_9fa48("21261"), partition?.updatedAt)))) ?? null);
      return stryMutAct_9fa48("21264") ? Number.isFinite(createdAt) && Number.isFinite(updatedAt) || createdAt === updatedAt : stryMutAct_9fa48("21263") ? false : stryMutAct_9fa48("21262") ? true : (stryCov_9fa48("21262", "21263", "21264"), (stryMutAct_9fa48("21266") ? Number.isFinite(createdAt) || Number.isFinite(updatedAt) : stryMutAct_9fa48("21265") ? true : (stryCov_9fa48("21265", "21266"), Number.isFinite(createdAt) && Number.isFinite(updatedAt))) && (stryMutAct_9fa48("21268") ? createdAt !== updatedAt : stryMutAct_9fa48("21267") ? true : (stryCov_9fa48("21267", "21268"), createdAt === updatedAt)));
    }
  }
  isFreshPartitionBootstrapWindow(partitionOrId) {
    if (stryMutAct_9fa48("21269")) {
      {}
    } else {
      stryCov_9fa48("21269");
      const partition = (stryMutAct_9fa48("21272") ? partitionOrId || typeof partitionOrId === TYPEOF.OBJECT : stryMutAct_9fa48("21271") ? false : stryMutAct_9fa48("21270") ? true : (stryCov_9fa48("21270", "21271", "21272"), partitionOrId && (stryMutAct_9fa48("21274") ? typeof partitionOrId !== TYPEOF.OBJECT : stryMutAct_9fa48("21273") ? true : (stryCov_9fa48("21273", "21274"), typeof partitionOrId === TYPEOF.OBJECT)))) ? partitionOrId : this.getBootstrapPartitionSnapshotRow(partitionOrId);
      if (stryMutAct_9fa48("21277") ? false : stryMutAct_9fa48("21276") ? true : stryMutAct_9fa48("21275") ? this.isBootstrapRoutingGraceWindow(partition) : (stryCov_9fa48("21275", "21276", "21277"), !this.isBootstrapRoutingGraceWindow(partition))) {
        if (stryMutAct_9fa48("21278")) {
          {}
        } else {
          stryCov_9fa48("21278");
          return stryMutAct_9fa48("21279") ? true : (stryCov_9fa48("21279"), false);
        }
      }
      return stryMutAct_9fa48("21282") ? this.resolveCanonicalPartitionLeaderNodeId(partition?.[COLUMN.PARTITION_ID] ?? partition?.partition_id ?? partition?.partitionId ?? null) !== null : stryMutAct_9fa48("21281") ? false : stryMutAct_9fa48("21280") ? true : (stryCov_9fa48("21280", "21281", "21282"), this.resolveCanonicalPartitionLeaderNodeId(stryMutAct_9fa48("21283") ? (partition?.[COLUMN.PARTITION_ID] ?? partition?.partition_id ?? partition?.partitionId) && null : (stryCov_9fa48("21283"), (stryMutAct_9fa48("21284") ? (partition?.[COLUMN.PARTITION_ID] ?? partition?.partition_id) && partition?.partitionId : (stryCov_9fa48("21284"), (stryMutAct_9fa48("21285") ? partition?.[COLUMN.PARTITION_ID] && partition?.partition_id : (stryCov_9fa48("21285"), (stryMutAct_9fa48("21286") ? partition[COLUMN.PARTITION_ID] : (stryCov_9fa48("21286"), partition?.[COLUMN.PARTITION_ID])) ?? (stryMutAct_9fa48("21287") ? partition.partition_id : (stryCov_9fa48("21287"), partition?.partition_id)))) ?? (stryMutAct_9fa48("21288") ? partition.partitionId : (stryCov_9fa48("21288"), partition?.partitionId)))) ?? null)) === null);
    }
  }
  getFreshBootstrapLeaderServices(partitionId, services = stryMutAct_9fa48("21289") ? ["Stryker was here"] : (stryCov_9fa48("21289"), [])) {
    if (stryMutAct_9fa48("21290")) {
      {}
    } else {
      stryCov_9fa48("21290");
      const partition = this.getBootstrapPartitionSnapshotRow(partitionId);
      if (stryMutAct_9fa48("21293") ? false : stryMutAct_9fa48("21292") ? true : stryMutAct_9fa48("21291") ? this.isFreshPartitionBootstrapWindow(partition) : (stryCov_9fa48("21291", "21292", "21293"), !this.isFreshPartitionBootstrapWindow(partition))) {
        if (stryMutAct_9fa48("21294")) {
          {}
        } else {
          stryCov_9fa48("21294");
          return stryMutAct_9fa48("21295") ? ["Stryker was here"] : (stryCov_9fa48("21295"), []);
        }
      }
      const leaderServices = stryMutAct_9fa48("21296") ? services : (stryCov_9fa48("21296"), services.filter(stryMutAct_9fa48("21297") ? () => undefined : (stryCov_9fa48("21297"), service => stryMutAct_9fa48("21300") ? String(service?.raft_role || '').toLowerCase() !== String(RAFT_ROLE.LEADER).toLowerCase() : stryMutAct_9fa48("21299") ? false : stryMutAct_9fa48("21298") ? true : (stryCov_9fa48("21298", "21299", "21300"), (stryMutAct_9fa48("21301") ? String(service?.raft_role || '').toUpperCase() : (stryCov_9fa48("21301"), String(stryMutAct_9fa48("21304") ? service?.raft_role && '' : stryMutAct_9fa48("21303") ? false : stryMutAct_9fa48("21302") ? true : (stryCov_9fa48("21302", "21303", "21304"), (stryMutAct_9fa48("21305") ? service.raft_role : (stryCov_9fa48("21305"), service?.raft_role)) || (stryMutAct_9fa48("21306") ? "Stryker was here!" : (stryCov_9fa48("21306"), '')))).toLowerCase())) === (stryMutAct_9fa48("21307") ? String(RAFT_ROLE.LEADER).toUpperCase() : (stryCov_9fa48("21307"), String(RAFT_ROLE.LEADER).toLowerCase()))))));
      if (stryMutAct_9fa48("21310") ? leaderServices.length !== NUM.ONE : stryMutAct_9fa48("21309") ? false : stryMutAct_9fa48("21308") ? true : (stryCov_9fa48("21308", "21309", "21310"), leaderServices.length === NUM.ONE)) {
        if (stryMutAct_9fa48("21311")) {
          {}
        } else {
          stryCov_9fa48("21311");
          return leaderServices;
        }
      }
      return (stryMutAct_9fa48("21314") ? services.length !== NUM.ONE : stryMutAct_9fa48("21313") ? false : stryMutAct_9fa48("21312") ? true : (stryCov_9fa48("21312", "21313", "21314"), services.length === NUM.ONE)) ? stryMutAct_9fa48("21315") ? [] : (stryCov_9fa48("21315"), [services[NUM.ZERO]]) : stryMutAct_9fa48("21316") ? ["Stryker was here"] : (stryCov_9fa48("21316"), []);
    }
  }
  resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows = stryMutAct_9fa48("21317") ? ["Stryker was here"] : (stryCov_9fa48("21317"), [])) {
    if (stryMutAct_9fa48("21318")) {
      {}
    } else {
      stryCov_9fa48("21318");
      const localRowSets = this.queryLocalAuthoritativePartitionRowSets(tableName);
      if (stryMutAct_9fa48("21321") ? localRowSets.length !== NUM.ZERO : stryMutAct_9fa48("21320") ? false : stryMutAct_9fa48("21319") ? true : (stryCov_9fa48("21319", "21320", "21321"), localRowSets.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("21322")) {
          {}
        } else {
          stryCov_9fa48("21322");
          return cacheRows;
        }
      }
      const mergedRows = this.mergeAuthoritativeSystemTableRowSets(tableName, localRowSets);
      if (stryMutAct_9fa48("21325") ? mergedRows.length === cacheRows.length : stryMutAct_9fa48("21324") ? false : stryMutAct_9fa48("21323") ? true : (stryCov_9fa48("21323", "21324", "21325"), mergedRows.length !== cacheRows.length)) {
        if (stryMutAct_9fa48("21326")) {
          {}
        } else {
          stryCov_9fa48("21326");
          this.getLogger().warn(stryMutAct_9fa48("21327") ? "" : (stryCov_9fa48("21327"), 'Bootstrap snapshot diverged from local authoritative partition state'), stryMutAct_9fa48("21328") ? {} : (stryCov_9fa48("21328"), {
            seedNodeId: this.getSeedNodeId(),
            tableName,
            cacheRowCount: cacheRows.length,
            authoritativeRowCount: mergedRows.length,
            replicaCount: localRowSets.length
          }));
        }
      }
      return mergedRows;
    }
  }
  queryLocalAuthoritativePartitionRowSets(tableName) {
    if (stryMutAct_9fa48("21329")) {
      {}
    } else {
      stryCov_9fa48("21329");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const partitionServices = this.getPartitionServices();
      if (stryMutAct_9fa48("21332") ? !partitionServices && partitionServices.size === NUM.ZERO : stryMutAct_9fa48("21331") ? false : stryMutAct_9fa48("21330") ? true : (stryCov_9fa48("21330", "21331", "21332"), (stryMutAct_9fa48("21333") ? partitionServices : (stryCov_9fa48("21333"), !partitionServices)) || (stryMutAct_9fa48("21335") ? partitionServices.size !== NUM.ZERO : stryMutAct_9fa48("21334") ? false : (stryCov_9fa48("21334", "21335"), partitionServices.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("21336")) {
          {}
        } else {
          stryCov_9fa48("21336");
          return stryMutAct_9fa48("21337") ? ["Stryker was here"] : (stryCov_9fa48("21337"), []);
        }
      }
      const partitionRows = (stryMutAct_9fa48("21340") ? typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("21339") ? false : stryMutAct_9fa48("21338") ? true : (stryCov_9fa48("21338", "21339", "21340"), typeof systemTableCache.filter === TYPEOF.FUNCTION)) ? stryMutAct_9fa48("21341") ? systemTableCache : (stryCov_9fa48("21341"), systemTableCache.filter(TABLES.PARTITIONS, row => {
        if (stryMutAct_9fa48("21342")) {
          {}
        } else {
          stryCov_9fa48("21342");
          const rowTableName = stryMutAct_9fa48("21345") ? (row?.[COLUMN.TABLE_NAME] || row?.table_name) && row?.tableName : stryMutAct_9fa48("21344") ? false : stryMutAct_9fa48("21343") ? true : (stryCov_9fa48("21343", "21344", "21345"), (stryMutAct_9fa48("21347") ? row?.[COLUMN.TABLE_NAME] && row?.table_name : stryMutAct_9fa48("21346") ? false : (stryCov_9fa48("21346", "21347"), (stryMutAct_9fa48("21348") ? row[COLUMN.TABLE_NAME] : (stryCov_9fa48("21348"), row?.[COLUMN.TABLE_NAME])) || (stryMutAct_9fa48("21349") ? row.table_name : (stryCov_9fa48("21349"), row?.table_name)))) || (stryMutAct_9fa48("21350") ? row.tableName : (stryCov_9fa48("21350"), row?.tableName)));
          const rowTableId = stryMutAct_9fa48("21353") ? (row?.[COLUMN.TABLE_ID] || row?.table_id) && row?.tableId : stryMutAct_9fa48("21352") ? false : stryMutAct_9fa48("21351") ? true : (stryCov_9fa48("21351", "21352", "21353"), (stryMutAct_9fa48("21355") ? row?.[COLUMN.TABLE_ID] && row?.table_id : stryMutAct_9fa48("21354") ? false : (stryCov_9fa48("21354", "21355"), (stryMutAct_9fa48("21356") ? row[COLUMN.TABLE_ID] : (stryCov_9fa48("21356"), row?.[COLUMN.TABLE_ID])) || (stryMutAct_9fa48("21357") ? row.table_id : (stryCov_9fa48("21357"), row?.table_id)))) || (stryMutAct_9fa48("21358") ? row.tableId : (stryCov_9fa48("21358"), row?.tableId)));
          return stryMutAct_9fa48("21361") ? rowTableName === tableName && rowTableId === tableName : stryMutAct_9fa48("21360") ? false : stryMutAct_9fa48("21359") ? true : (stryCov_9fa48("21359", "21360", "21361"), (stryMutAct_9fa48("21363") ? rowTableName !== tableName : stryMutAct_9fa48("21362") ? false : (stryCov_9fa48("21362", "21363"), rowTableName === tableName)) || (stryMutAct_9fa48("21365") ? rowTableId !== tableName : stryMutAct_9fa48("21364") ? false : (stryCov_9fa48("21364", "21365"), rowTableId === tableName)));
        }
      })) : stryMutAct_9fa48("21366") ? ["Stryker was here"] : (stryCov_9fa48("21366"), []);
      const partitionIds = stryMutAct_9fa48("21367") ? [] : (stryCov_9fa48("21367"), [...new Set(stryMutAct_9fa48("21368") ? partitionRows.map(row => row?.[COLUMN.PARTITION_ID] || row?.partition_id || row?.partitionId) : (stryCov_9fa48("21368"), partitionRows.map(stryMutAct_9fa48("21369") ? () => undefined : (stryCov_9fa48("21369"), row => stryMutAct_9fa48("21372") ? (row?.[COLUMN.PARTITION_ID] || row?.partition_id) && row?.partitionId : stryMutAct_9fa48("21371") ? false : stryMutAct_9fa48("21370") ? true : (stryCov_9fa48("21370", "21371", "21372"), (stryMutAct_9fa48("21374") ? row?.[COLUMN.PARTITION_ID] && row?.partition_id : stryMutAct_9fa48("21373") ? false : (stryCov_9fa48("21373", "21374"), (stryMutAct_9fa48("21375") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("21375"), row?.[COLUMN.PARTITION_ID])) || (stryMutAct_9fa48("21376") ? row.partition_id : (stryCov_9fa48("21376"), row?.partition_id)))) || (stryMutAct_9fa48("21377") ? row.partitionId : (stryCov_9fa48("21377"), row?.partitionId))))).filter(stryMutAct_9fa48("21378") ? () => undefined : (stryCov_9fa48("21378"), value => stryMutAct_9fa48("21381") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("21380") ? false : stryMutAct_9fa48("21379") ? true : (stryCov_9fa48("21379", "21380", "21381"), (stryMutAct_9fa48("21383") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("21382") ? true : (stryCov_9fa48("21382", "21383"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("21386") ? value.length <= NUM.ZERO : stryMutAct_9fa48("21385") ? value.length >= NUM.ZERO : stryMutAct_9fa48("21384") ? true : (stryCov_9fa48("21384", "21385", "21386"), value.length > NUM.ZERO)))))))]);
      if (stryMutAct_9fa48("21389") ? partitionIds.length !== NUM.ZERO : stryMutAct_9fa48("21388") ? false : stryMutAct_9fa48("21387") ? true : (stryCov_9fa48("21387", "21388", "21389"), partitionIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("21390")) {
          {}
        } else {
          stryCov_9fa48("21390");
          return stryMutAct_9fa48("21391") ? ["Stryker was here"] : (stryCov_9fa48("21391"), []);
        }
      }
      const rowSets = stryMutAct_9fa48("21392") ? ["Stryker was here"] : (stryCov_9fa48("21392"), []);
      const sql = stryMutAct_9fa48("21393") ? `` : (stryCov_9fa48("21393"), `SELECT * FROM ${tableName}`);
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("21394")) {
          {}
        } else {
          stryCov_9fa48("21394");
          for (const service of partitionServices.values()) {
            if (stryMutAct_9fa48("21395")) {
              {}
            } else {
              stryCov_9fa48("21395");
              if (stryMutAct_9fa48("21398") ? (service?.partitionId !== partitionId || service?.initialized !== true) && typeof service?.db?.prepare !== TYPEOF.FUNCTION : stryMutAct_9fa48("21397") ? false : stryMutAct_9fa48("21396") ? true : (stryCov_9fa48("21396", "21397", "21398"), (stryMutAct_9fa48("21400") ? service?.partitionId !== partitionId && service?.initialized !== true : stryMutAct_9fa48("21399") ? false : (stryCov_9fa48("21399", "21400"), (stryMutAct_9fa48("21402") ? service?.partitionId === partitionId : stryMutAct_9fa48("21401") ? false : (stryCov_9fa48("21401", "21402"), (stryMutAct_9fa48("21403") ? service.partitionId : (stryCov_9fa48("21403"), service?.partitionId)) !== partitionId)) || (stryMutAct_9fa48("21405") ? service?.initialized === true : stryMutAct_9fa48("21404") ? false : (stryCov_9fa48("21404", "21405"), (stryMutAct_9fa48("21406") ? service.initialized : (stryCov_9fa48("21406"), service?.initialized)) !== (stryMutAct_9fa48("21407") ? false : (stryCov_9fa48("21407"), true)))))) || (stryMutAct_9fa48("21409") ? typeof service?.db?.prepare === TYPEOF.FUNCTION : stryMutAct_9fa48("21408") ? false : (stryCov_9fa48("21408", "21409"), typeof (stryMutAct_9fa48("21411") ? service.db?.prepare : stryMutAct_9fa48("21410") ? service?.db.prepare : (stryCov_9fa48("21410", "21411"), service?.db?.prepare)) !== TYPEOF.FUNCTION)))) {
                if (stryMutAct_9fa48("21412")) {
                  {}
                } else {
                  stryCov_9fa48("21412");
                  continue;
                }
              }
              try {
                if (stryMutAct_9fa48("21413")) {
                  {}
                } else {
                  stryCov_9fa48("21413");
                  const rows = service.db.prepare(sql).all();
                  rowSets.push(Array.isArray(rows) ? rows : stryMutAct_9fa48("21414") ? ["Stryker was here"] : (stryCov_9fa48("21414"), []));
                }
              } catch (error) {
                if (stryMutAct_9fa48("21415")) {
                  {}
                } else {
                  stryCov_9fa48("21415");
                  this.getLogger().warn(stryMutAct_9fa48("21416") ? "" : (stryCov_9fa48("21416"), 'Failed to read authoritative snapshot rows from local partition'), stryMutAct_9fa48("21417") ? {} : (stryCov_9fa48("21417"), {
                    seedNodeId: this.getSeedNodeId(),
                    tableName,
                    partitionId,
                    replicaId: stryMutAct_9fa48("21420") ? (service?.replicaId || service?.service_id) && null : stryMutAct_9fa48("21419") ? false : stryMutAct_9fa48("21418") ? true : (stryCov_9fa48("21418", "21419", "21420"), (stryMutAct_9fa48("21422") ? service?.replicaId && service?.service_id : stryMutAct_9fa48("21421") ? false : (stryCov_9fa48("21421", "21422"), (stryMutAct_9fa48("21423") ? service.replicaId : (stryCov_9fa48("21423"), service?.replicaId)) || (stryMutAct_9fa48("21424") ? service.service_id : (stryCov_9fa48("21424"), service?.service_id)))) || null),
                    error: error.message
                  }));
                }
              }
            }
          }
        }
      }
      return rowSets;
    }
  }
  mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
    if (stryMutAct_9fa48("21425")) {
      {}
    } else {
      stryCov_9fa48("21425");
      const keyField = getSystemCachePrimaryKeyFieldOrFallback(tableName, stryMutAct_9fa48("21426") ? "" : (stryCov_9fa48("21426"), 'id'));
      const mergedRows = new Map();
      for (const rowSet of rowSets) {
        if (stryMutAct_9fa48("21427")) {
          {}
        } else {
          stryCov_9fa48("21427");
          const rows = Array.isArray(rowSet) ? rowSet : stryMutAct_9fa48("21428") ? ["Stryker was here"] : (stryCov_9fa48("21428"), []);
          for (const row of rows) {
            if (stryMutAct_9fa48("21429")) {
              {}
            } else {
              stryCov_9fa48("21429");
              const key = stryMutAct_9fa48("21430") ? row?.[keyField] && row?.id : (stryCov_9fa48("21430"), (stryMutAct_9fa48("21431") ? row[keyField] : (stryCov_9fa48("21431"), row?.[keyField])) ?? (stryMutAct_9fa48("21432") ? row.id : (stryCov_9fa48("21432"), row?.id)));
              if (stryMutAct_9fa48("21435") ? typeof key === TYPEOF.UNDEFINED && key === null : stryMutAct_9fa48("21434") ? false : stryMutAct_9fa48("21433") ? true : (stryCov_9fa48("21433", "21434", "21435"), (stryMutAct_9fa48("21437") ? typeof key !== TYPEOF.UNDEFINED : stryMutAct_9fa48("21436") ? false : (stryCov_9fa48("21436", "21437"), typeof key === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("21439") ? key !== null : stryMutAct_9fa48("21438") ? false : (stryCov_9fa48("21438", "21439"), key === null)))) {
                if (stryMutAct_9fa48("21440")) {
                  {}
                } else {
                  stryCov_9fa48("21440");
                  continue;
                }
              }
              const existing = mergedRows.get(key);
              if (stryMutAct_9fa48("21443") ? !existing && this.isAuthoritativeSnapshotRowNewer(row, existing) : stryMutAct_9fa48("21442") ? false : stryMutAct_9fa48("21441") ? true : (stryCov_9fa48("21441", "21442", "21443"), (stryMutAct_9fa48("21444") ? existing : (stryCov_9fa48("21444"), !existing)) || this.isAuthoritativeSnapshotRowNewer(row, existing))) {
                if (stryMutAct_9fa48("21445")) {
                  {}
                } else {
                  stryCov_9fa48("21445");
                  mergedRows.set(key, row);
                }
              }
            }
          }
        }
      }
      return stryMutAct_9fa48("21446") ? [] : (stryCov_9fa48("21446"), [...mergedRows.values()]);
    }
  }
  isAuthoritativeSnapshotRowNewer(candidate, existing) {
    if (stryMutAct_9fa48("21447")) {
      {}
    } else {
      stryCov_9fa48("21447");
      const candidateUpdatedAt = Number(stryMutAct_9fa48("21448") ? (candidate?.[COLUMN.UPDATED_AT] ?? candidate?.updated_at) && candidate?.updatedAt : (stryCov_9fa48("21448"), (stryMutAct_9fa48("21449") ? candidate?.[COLUMN.UPDATED_AT] && candidate?.updated_at : (stryCov_9fa48("21449"), (stryMutAct_9fa48("21450") ? candidate[COLUMN.UPDATED_AT] : (stryCov_9fa48("21450"), candidate?.[COLUMN.UPDATED_AT])) ?? (stryMutAct_9fa48("21451") ? candidate.updated_at : (stryCov_9fa48("21451"), candidate?.updated_at)))) ?? (stryMutAct_9fa48("21452") ? candidate.updatedAt : (stryCov_9fa48("21452"), candidate?.updatedAt))));
      const existingUpdatedAt = Number(stryMutAct_9fa48("21453") ? (existing?.[COLUMN.UPDATED_AT] ?? existing?.updated_at) && existing?.updatedAt : (stryCov_9fa48("21453"), (stryMutAct_9fa48("21454") ? existing?.[COLUMN.UPDATED_AT] && existing?.updated_at : (stryCov_9fa48("21454"), (stryMutAct_9fa48("21455") ? existing[COLUMN.UPDATED_AT] : (stryCov_9fa48("21455"), existing?.[COLUMN.UPDATED_AT])) ?? (stryMutAct_9fa48("21456") ? existing.updated_at : (stryCov_9fa48("21456"), existing?.updated_at)))) ?? (stryMutAct_9fa48("21457") ? existing.updatedAt : (stryCov_9fa48("21457"), existing?.updatedAt))));
      if (stryMutAct_9fa48("21460") ? Number.isFinite(candidateUpdatedAt) || Number.isFinite(existingUpdatedAt) : stryMutAct_9fa48("21459") ? false : stryMutAct_9fa48("21458") ? true : (stryCov_9fa48("21458", "21459", "21460"), Number.isFinite(candidateUpdatedAt) && Number.isFinite(existingUpdatedAt))) {
        if (stryMutAct_9fa48("21461")) {
          {}
        } else {
          stryCov_9fa48("21461");
          return stryMutAct_9fa48("21465") ? candidateUpdatedAt <= existingUpdatedAt : stryMutAct_9fa48("21464") ? candidateUpdatedAt >= existingUpdatedAt : stryMutAct_9fa48("21463") ? false : stryMutAct_9fa48("21462") ? true : (stryCov_9fa48("21462", "21463", "21464", "21465"), candidateUpdatedAt > existingUpdatedAt);
        }
      }
      if (stryMutAct_9fa48("21468") ? Number.isFinite(candidateUpdatedAt) || !Number.isFinite(existingUpdatedAt) : stryMutAct_9fa48("21467") ? false : stryMutAct_9fa48("21466") ? true : (stryCov_9fa48("21466", "21467", "21468"), Number.isFinite(candidateUpdatedAt) && (stryMutAct_9fa48("21469") ? Number.isFinite(existingUpdatedAt) : (stryCov_9fa48("21469"), !Number.isFinite(existingUpdatedAt))))) {
        if (stryMutAct_9fa48("21470")) {
          {}
        } else {
          stryCov_9fa48("21470");
          return stryMutAct_9fa48("21471") ? false : (stryCov_9fa48("21471"), true);
        }
      }
      const candidateCreatedAt = Number(stryMutAct_9fa48("21472") ? (candidate?.[COLUMN.CREATED_AT] ?? candidate?.created_at) && candidate?.createdAt : (stryCov_9fa48("21472"), (stryMutAct_9fa48("21473") ? candidate?.[COLUMN.CREATED_AT] && candidate?.created_at : (stryCov_9fa48("21473"), (stryMutAct_9fa48("21474") ? candidate[COLUMN.CREATED_AT] : (stryCov_9fa48("21474"), candidate?.[COLUMN.CREATED_AT])) ?? (stryMutAct_9fa48("21475") ? candidate.created_at : (stryCov_9fa48("21475"), candidate?.created_at)))) ?? (stryMutAct_9fa48("21476") ? candidate.createdAt : (stryCov_9fa48("21476"), candidate?.createdAt))));
      const existingCreatedAt = Number(stryMutAct_9fa48("21477") ? (existing?.[COLUMN.CREATED_AT] ?? existing?.created_at) && existing?.createdAt : (stryCov_9fa48("21477"), (stryMutAct_9fa48("21478") ? existing?.[COLUMN.CREATED_AT] && existing?.created_at : (stryCov_9fa48("21478"), (stryMutAct_9fa48("21479") ? existing[COLUMN.CREATED_AT] : (stryCov_9fa48("21479"), existing?.[COLUMN.CREATED_AT])) ?? (stryMutAct_9fa48("21480") ? existing.created_at : (stryCov_9fa48("21480"), existing?.created_at)))) ?? (stryMutAct_9fa48("21481") ? existing.createdAt : (stryCov_9fa48("21481"), existing?.createdAt))));
      if (stryMutAct_9fa48("21484") ? Number.isFinite(candidateCreatedAt) || Number.isFinite(existingCreatedAt) : stryMutAct_9fa48("21483") ? false : stryMutAct_9fa48("21482") ? true : (stryCov_9fa48("21482", "21483", "21484"), Number.isFinite(candidateCreatedAt) && Number.isFinite(existingCreatedAt))) {
        if (stryMutAct_9fa48("21485")) {
          {}
        } else {
          stryCov_9fa48("21485");
          return stryMutAct_9fa48("21489") ? candidateCreatedAt <= existingCreatedAt : stryMutAct_9fa48("21488") ? candidateCreatedAt >= existingCreatedAt : stryMutAct_9fa48("21487") ? false : stryMutAct_9fa48("21486") ? true : (stryCov_9fa48("21486", "21487", "21488", "21489"), candidateCreatedAt > existingCreatedAt);
        }
      }
      if (stryMutAct_9fa48("21492") ? Number.isFinite(candidateCreatedAt) || !Number.isFinite(existingCreatedAt) : stryMutAct_9fa48("21491") ? false : stryMutAct_9fa48("21490") ? true : (stryCov_9fa48("21490", "21491", "21492"), Number.isFinite(candidateCreatedAt) && (stryMutAct_9fa48("21493") ? Number.isFinite(existingCreatedAt) : (stryCov_9fa48("21493"), !Number.isFinite(existingCreatedAt))))) {
        if (stryMutAct_9fa48("21494")) {
          {}
        } else {
          stryCov_9fa48("21494");
          return stryMutAct_9fa48("21495") ? false : (stryCov_9fa48("21495"), true);
        }
      }
      return stryMutAct_9fa48("21499") ? JSON.stringify(candidate).length <= JSON.stringify(existing).length : stryMutAct_9fa48("21498") ? JSON.stringify(candidate).length >= JSON.stringify(existing).length : stryMutAct_9fa48("21497") ? false : stryMutAct_9fa48("21496") ? true : (stryCov_9fa48("21496", "21497", "21498", "21499"), JSON.stringify(candidate).length > JSON.stringify(existing).length);
    }
  }
  getLatencyTopologyHints(nodeId) {
    if (stryMutAct_9fa48("21500")) {
      {}
    } else {
      stryCov_9fa48("21500");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const config = ConfigurationManager.getInstance();
      const propagationMode = stryMutAct_9fa48("21503") ? config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE) && null : stryMutAct_9fa48("21502") ? false : stryMutAct_9fa48("21501") ? true : (stryCov_9fa48("21501", "21502", "21503"), config.get(CONFIG_KEY.LATENCY_PROPAGATION_MODE) || null);
      const joiningNode = stryMutAct_9fa48("21506") ? systemTableCache.get(TABLES.NODES, nodeId) && null : stryMutAct_9fa48("21505") ? false : stryMutAct_9fa48("21504") ? true : (stryCov_9fa48("21504", "21505", "21506"), systemTableCache.get(TABLES.NODES, nodeId) || null);
      const groups = stryMutAct_9fa48("21509") ? systemTableCache.getAll(TABLES.LATENCY_GROUPS) && [] : stryMutAct_9fa48("21508") ? false : stryMutAct_9fa48("21507") ? true : (stryCov_9fa48("21507", "21508", "21509"), systemTableCache.getAll(TABLES.LATENCY_GROUPS) || (stryMutAct_9fa48("21510") ? ["Stryker was here"] : (stryCov_9fa48("21510"), [])));
      const interGroupLatencies = stryMutAct_9fa48("21513") ? systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) && [] : stryMutAct_9fa48("21512") ? false : stryMutAct_9fa48("21511") ? true : (stryCov_9fa48("21511", "21512", "21513"), systemTableCache.getAll(TABLES.INTER_GROUP_LATENCIES) || (stryMutAct_9fa48("21514") ? ["Stryker was here"] : (stryCov_9fa48("21514"), [])));
      return stryMutAct_9fa48("21515") ? {} : (stryCov_9fa48("21515"), {
        suggestedGroupId: stryMutAct_9fa48("21518") ? joiningNode?.[COLUMN.LATENCY_GROUP_ID] && null : stryMutAct_9fa48("21517") ? false : stryMutAct_9fa48("21516") ? true : (stryCov_9fa48("21516", "21517", "21518"), (stryMutAct_9fa48("21519") ? joiningNode[COLUMN.LATENCY_GROUP_ID] : (stryCov_9fa48("21519"), joiningNode?.[COLUMN.LATENCY_GROUP_ID])) || null),
        groupCount: groups.length,
        interGroupEdgeCount: interGroupLatencies.length,
        propagationMode,
        timestamp: Date.now()
      });
    }
  }
}
export { BootstrapTopologySnapshotOwner };