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
import { assertCritical } from '../../utils/assert.js';
import { ADDRESS, COLUMN, ENTITY_TYPE, NUM, SERVICE_TYPE, TABLES, TYPEOF } from '../../constants/index.js';
import { RAFT_ROLE } from '../../raft/constants.js';
import { getMissingSystemServiceLeaderCount, getMissingSystemServiceLeaders, getOwnerRecords, resolveCanonicalLeaderService } from '../../cache/leader-readiness-gate.js';
import { BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT } from '../bootstrap-constants.js';
import { BOOTSTRAP_API_ERROR, BOOTSTRAP_API_LOG_MSG } from '../bootstrap-api-constants.js';
import { MEMBERSHIP_LIFECYCLE_INTENT, resolveMembershipJoinIntentType } from '../../control-plane/membership-lifecycle-controller.js';
const BOOTSTRAP_REQUIRED_LEADER_TABLES = Object.freeze(stryMutAct_9fa48("23316") ? [] : (stryCov_9fa48("23316"), [TABLES.NODES, TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.MESSAGE_GROUPS, TABLES.REPLICA_OPERATIONS, TABLES.NODE_ENDPOINTS, TABLES.CONFIG]));
const TRAFFIC_REQUIRED_LEADER_TABLES = Object.freeze(stryMutAct_9fa48("23317") ? [] : (stryCov_9fa48("23317"), [TABLES.NODES, TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES, TABLES.NODE_ENDPOINTS]));
function isLiveServiceLeader(service) {
  if (stryMutAct_9fa48("23318")) {
    {}
  } else {
    stryCov_9fa48("23318");
    if (stryMutAct_9fa48("23321") ? false : stryMutAct_9fa48("23320") ? true : stryMutAct_9fa48("23319") ? service : (stryCov_9fa48("23319", "23320", "23321"), !service)) {
      if (stryMutAct_9fa48("23322")) {
        {}
      } else {
        stryCov_9fa48("23322");
        return stryMutAct_9fa48("23323") ? true : (stryCov_9fa48("23323"), false);
      }
    }
    const role = (stryMutAct_9fa48("23326") ? typeof service.getRole !== TYPEOF.FUNCTION : stryMutAct_9fa48("23325") ? false : stryMutAct_9fa48("23324") ? true : (stryCov_9fa48("23324", "23325", "23326"), typeof service.getRole === TYPEOF.FUNCTION)) ? service.getRole() : service.role;
    return stryMutAct_9fa48("23329") ? (service.isLeader === true || role === RAFT_ROLE.LEADER) && typeof service.isLeaderReplica === TYPEOF.FUNCTION && service.isLeaderReplica() : stryMutAct_9fa48("23328") ? false : stryMutAct_9fa48("23327") ? true : (stryCov_9fa48("23327", "23328", "23329"), (stryMutAct_9fa48("23331") ? service.isLeader === true && role === RAFT_ROLE.LEADER : stryMutAct_9fa48("23330") ? false : (stryCov_9fa48("23330", "23331"), (stryMutAct_9fa48("23333") ? service.isLeader !== true : stryMutAct_9fa48("23332") ? false : (stryCov_9fa48("23332", "23333"), service.isLeader === (stryMutAct_9fa48("23334") ? false : (stryCov_9fa48("23334"), true)))) || (stryMutAct_9fa48("23336") ? role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("23335") ? false : (stryCov_9fa48("23335", "23336"), role === RAFT_ROLE.LEADER)))) || (stryMutAct_9fa48("23338") ? typeof service.isLeaderReplica === TYPEOF.FUNCTION || service.isLeaderReplica() : stryMutAct_9fa48("23337") ? false : (stryCov_9fa48("23337", "23338"), (stryMutAct_9fa48("23340") ? typeof service.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("23339") ? true : (stryCov_9fa48("23339", "23340"), typeof service.isLeaderReplica === TYPEOF.FUNCTION)) && service.isLeaderReplica())));
  }
}
class ServiceLeaderReadinessOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("23341")) {
      {}
    } else {
      stryCov_9fa48("23341");
      this.delegates = stryMutAct_9fa48("23344") ? options.delegates && {} : stryMutAct_9fa48("23343") ? false : stryMutAct_9fa48("23342") ? true : (stryCov_9fa48("23342", "23343", "23344"), options.delegates || {});
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("23345")) {
      {}
    } else {
      stryCov_9fa48("23345");
      return stryMutAct_9fa48("23348") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("23347") ? false : stryMutAct_9fa48("23346") ? true : (stryCov_9fa48("23346", "23347", "23348"), (stryMutAct_9fa48("23349") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("23349"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getPartitionServices() {
    if (stryMutAct_9fa48("23350")) {
      {}
    } else {
      stryCov_9fa48("23350");
      return stryMutAct_9fa48("23353") ? this.delegates.getPartitionServices?.() && null : stryMutAct_9fa48("23352") ? false : stryMutAct_9fa48("23351") ? true : (stryCov_9fa48("23351", "23352", "23353"), (stryMutAct_9fa48("23354") ? this.delegates.getPartitionServices() : (stryCov_9fa48("23354"), this.delegates.getPartitionServices?.())) || null);
    }
  }
  getBootstrapService() {
    if (stryMutAct_9fa48("23355")) {
      {}
    } else {
      stryCov_9fa48("23355");
      return stryMutAct_9fa48("23358") ? this.delegates.getBootstrapService?.() && null : stryMutAct_9fa48("23357") ? false : stryMutAct_9fa48("23356") ? true : (stryCov_9fa48("23356", "23357", "23358"), (stryMutAct_9fa48("23359") ? this.delegates.getBootstrapService() : (stryCov_9fa48("23359"), this.delegates.getBootstrapService?.())) || null);
    }
  }
  getSeedNodeId() {
    if (stryMutAct_9fa48("23360")) {
      {}
    } else {
      stryCov_9fa48("23360");
      return stryMutAct_9fa48("23363") ? this.delegates.getSeedNodeId?.() && null : stryMutAct_9fa48("23362") ? false : stryMutAct_9fa48("23361") ? true : (stryCov_9fa48("23361", "23362", "23363"), (stryMutAct_9fa48("23364") ? this.delegates.getSeedNodeId() : (stryCov_9fa48("23364"), this.delegates.getSeedNodeId?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("23365")) {
      {}
    } else {
      stryCov_9fa48("23365");
      return stryMutAct_9fa48("23368") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("23367") ? false : stryMutAct_9fa48("23366") ? true : (stryCov_9fa48("23366", "23367", "23368"), (stryMutAct_9fa48("23369") ? this.delegates.getLogger() : (stryCov_9fa48("23369"), this.delegates.getLogger?.())) || console);
    }
  }
  getLeaderReadinessStatusForProbe() {
    if (stryMutAct_9fa48("23370")) {
      {}
    } else {
      stryCov_9fa48("23370");
      const systemTableCache = this.getSystemTableCache();
      if (stryMutAct_9fa48("23373") ? false : stryMutAct_9fa48("23372") ? true : stryMutAct_9fa48("23371") ? systemTableCache : (stryCov_9fa48("23371", "23372", "23373"), !systemTableCache)) {
        if (stryMutAct_9fa48("23374")) {
          {}
        } else {
          stryCov_9fa48("23374");
          return stryMutAct_9fa48("23375") ? {} : (stryCov_9fa48("23375"), {
            ready: stryMutAct_9fa48("23376") ? true : (stryCov_9fa48("23376"), false)
          });
        }
      }
      const missing = this.normalizeLeaderStatusForRequiredTables(this.getMissingServiceLeaders(), TRAFFIC_REQUIRED_LEADER_TABLES);
      const blockingMissing = this.getBlockingLeaderStatusForReadiness(missing);
      return this.buildLeaderStatusResult(stryMutAct_9fa48("23379") ? this.countMissingLeaderInfo(blockingMissing) !== NUM.ZERO : stryMutAct_9fa48("23378") ? false : stryMutAct_9fa48("23377") ? true : (stryCov_9fa48("23377", "23378", "23379"), this.countMissingLeaderInfo(blockingMissing) === NUM.ZERO), blockingMissing, missing);
    }
  }
  async waitForPartitionLeaders() {
    if (stryMutAct_9fa48("23380")) {
      {}
    } else {
      stryCov_9fa48("23380");
      const bootstrapService = this.getBootstrapService();
      if (stryMutAct_9fa48("23383") ? typeof bootstrapService?.waitForPartitionLeadership !== TYPEOF.FUNCTION : stryMutAct_9fa48("23382") ? false : stryMutAct_9fa48("23381") ? true : (stryCov_9fa48("23381", "23382", "23383"), typeof (stryMutAct_9fa48("23384") ? bootstrapService.waitForPartitionLeadership : (stryCov_9fa48("23384"), bootstrapService?.waitForPartitionLeadership)) === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("23385")) {
          {}
        } else {
          stryCov_9fa48("23385");
          await bootstrapService.waitForPartitionLeadership();
          return;
        }
      }
      const services = this.getPartitionServices();
      if (stryMutAct_9fa48("23388") ? !services && services.size === NUM.ZERO : stryMutAct_9fa48("23387") ? false : stryMutAct_9fa48("23386") ? true : (stryCov_9fa48("23386", "23387", "23388"), (stryMutAct_9fa48("23389") ? services : (stryCov_9fa48("23389"), !services)) || (stryMutAct_9fa48("23391") ? services.size !== NUM.ZERO : stryMutAct_9fa48("23390") ? false : (stryCov_9fa48("23390", "23391"), services.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("23392")) {
          {}
        } else {
          stryCov_9fa48("23392");
          return;
        }
      }
      const partitionIds = new Set();
      for (const service of services.values()) {
        if (stryMutAct_9fa48("23393")) {
          {}
        } else {
          stryCov_9fa48("23393");
          if (stryMutAct_9fa48("23396") ? service.partitionId : stryMutAct_9fa48("23395") ? false : stryMutAct_9fa48("23394") ? true : (stryCov_9fa48("23394", "23395", "23396"), service?.partitionId)) {
            if (stryMutAct_9fa48("23397")) {
              {}
            } else {
              stryCov_9fa48("23397");
              partitionIds.add(service.partitionId);
            }
          }
        }
      }
      if (stryMutAct_9fa48("23400") ? partitionIds.size !== NUM.ZERO : stryMutAct_9fa48("23399") ? false : stryMutAct_9fa48("23398") ? true : (stryCov_9fa48("23398", "23399", "23400"), partitionIds.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("23401")) {
          {}
        } else {
          stryCov_9fa48("23401");
          return;
        }
      }
      const configuredTimeoutMs = stryMutAct_9fa48("23403") ? bootstrapService.config?.leadershipWaitTimeoutMs : stryMutAct_9fa48("23402") ? bootstrapService?.config.leadershipWaitTimeoutMs : (stryCov_9fa48("23402", "23403"), bootstrapService?.config?.leadershipWaitTimeoutMs);
      const timeoutMs = (stryMutAct_9fa48("23406") ? Number.isFinite(configuredTimeoutMs) || configuredTimeoutMs > NUM.ZERO : stryMutAct_9fa48("23405") ? false : stryMutAct_9fa48("23404") ? true : (stryCov_9fa48("23404", "23405", "23406"), Number.isFinite(configuredTimeoutMs) && (stryMutAct_9fa48("23409") ? configuredTimeoutMs <= NUM.ZERO : stryMutAct_9fa48("23408") ? configuredTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("23407") ? true : (stryCov_9fa48("23407", "23408", "23409"), configuredTimeoutMs > NUM.ZERO)))) ? Math.floor(configuredTimeoutMs) : BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.TIMEOUT_CAP_MS;
      let delay = stryMutAct_9fa48("23412") ? bootstrapService?.config?.leadershipWaitInitialDelayMs && BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS : stryMutAct_9fa48("23411") ? false : stryMutAct_9fa48("23410") ? true : (stryCov_9fa48("23410", "23411", "23412"), (stryMutAct_9fa48("23414") ? bootstrapService.config?.leadershipWaitInitialDelayMs : stryMutAct_9fa48("23413") ? bootstrapService?.config.leadershipWaitInitialDelayMs : (stryCov_9fa48("23413", "23414"), bootstrapService?.config?.leadershipWaitInitialDelayMs)) || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.INITIAL_DELAY_MS);
      const maxDelay = stryMutAct_9fa48("23417") ? bootstrapService?.config?.leadershipWaitMaxDelayMs && BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS : stryMutAct_9fa48("23416") ? false : stryMutAct_9fa48("23415") ? true : (stryCov_9fa48("23415", "23416", "23417"), (stryMutAct_9fa48("23419") ? bootstrapService.config?.leadershipWaitMaxDelayMs : stryMutAct_9fa48("23418") ? bootstrapService?.config.leadershipWaitMaxDelayMs : (stryCov_9fa48("23418", "23419"), bootstrapService?.config?.leadershipWaitMaxDelayMs)) || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.MAX_DELAY_MS);
      const backoff = stryMutAct_9fa48("23422") ? bootstrapService?.config?.leadershipWaitBackoffMultiplier && BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER : stryMutAct_9fa48("23421") ? false : stryMutAct_9fa48("23420") ? true : (stryCov_9fa48("23420", "23421", "23422"), (stryMutAct_9fa48("23424") ? bootstrapService.config?.leadershipWaitBackoffMultiplier : stryMutAct_9fa48("23423") ? bootstrapService?.config.leadershipWaitBackoffMultiplier : (stryCov_9fa48("23423", "23424"), bootstrapService?.config?.leadershipWaitBackoffMultiplier)) || BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT.BACKOFF_MULTIPLIER);
      const start = Date.now();
      while (stryMutAct_9fa48("23427") ? Date.now() - start >= timeoutMs : stryMutAct_9fa48("23426") ? Date.now() - start <= timeoutMs : stryMutAct_9fa48("23425") ? false : (stryCov_9fa48("23425", "23426", "23427"), (stryMutAct_9fa48("23428") ? Date.now() + start : (stryCov_9fa48("23428"), Date.now() - start)) < timeoutMs)) {
        if (stryMutAct_9fa48("23429")) {
          {}
        } else {
          stryCov_9fa48("23429");
          const leaders = this.getSystemPartitionLeaders();
          if (stryMutAct_9fa48("23433") ? Object.keys(leaders).length <= NUM.ZERO : stryMutAct_9fa48("23432") ? Object.keys(leaders).length >= NUM.ZERO : stryMutAct_9fa48("23431") ? false : stryMutAct_9fa48("23430") ? true : (stryCov_9fa48("23430", "23431", "23432", "23433"), Object.keys(leaders).length > NUM.ZERO)) {
            if (stryMutAct_9fa48("23434")) {
              {}
            } else {
              stryCov_9fa48("23434");
              return;
            }
          }
          await new Promise(stryMutAct_9fa48("23435") ? () => undefined : (stryCov_9fa48("23435"), resolve => setTimeout(resolve, delay)));
          delay = stryMutAct_9fa48("23436") ? Math.max(delay * backoff, maxDelay) : (stryCov_9fa48("23436"), Math.min(stryMutAct_9fa48("23437") ? delay / backoff : (stryCov_9fa48("23437"), delay * backoff), maxDelay));
        }
      }
    }
  }
  getMissingServiceLeaders() {
    if (stryMutAct_9fa48("23438")) {
      {}
    } else {
      stryCov_9fa48("23438");
      const override = stryMutAct_9fa48("23439") ? this.delegates.getMissingServiceLeaders() : (stryCov_9fa48("23439"), this.delegates.getMissingServiceLeaders?.());
      if (stryMutAct_9fa48("23441") ? false : stryMutAct_9fa48("23440") ? true : (stryCov_9fa48("23440", "23441"), override)) {
        if (stryMutAct_9fa48("23442")) {
          {}
        } else {
          stryCov_9fa48("23442");
          return override;
        }
      }
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      return getMissingSystemServiceLeaders(systemTableCache, stryMutAct_9fa48("23443") ? {} : (stryCov_9fa48("23443"), {
        requireLeaderNodeId: stryMutAct_9fa48("23444") ? false : (stryCov_9fa48("23444"), true)
      }));
    }
  }
  getLeaderReadinessPartitionSets() {
    if (stryMutAct_9fa48("23445")) {
      {}
    } else {
      stryCov_9fa48("23445");
      return this.getLeaderReadinessPartitionSetsForTables(BOOTSTRAP_REQUIRED_LEADER_TABLES);
    }
  }
  getLeaderReadinessPartitionSetsForTables(requiredTablesList = stryMutAct_9fa48("23446") ? ["Stryker was here"] : (stryCov_9fa48("23446"), [])) {
    if (stryMutAct_9fa48("23447")) {
      {}
    } else {
      stryCov_9fa48("23447");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const partitions = stryMutAct_9fa48("23450") ? systemTableCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("23449") ? false : stryMutAct_9fa48("23448") ? true : (stryCov_9fa48("23448", "23449", "23450"), systemTableCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("23451") ? ["Stryker was here"] : (stryCov_9fa48("23451"), [])));
      const knownPartitionIds = new Set();
      const requiredPartitionIds = new Set();
      const requiredTables = new Set(requiredTablesList);
      for (const partition of partitions) {
        if (stryMutAct_9fa48("23452")) {
          {}
        } else {
          stryCov_9fa48("23452");
          const partitionId = partition[COLUMN.PARTITION_ID];
          if (stryMutAct_9fa48("23455") ? false : stryMutAct_9fa48("23454") ? true : stryMutAct_9fa48("23453") ? partitionId : (stryCov_9fa48("23453", "23454", "23455"), !partitionId)) {
            if (stryMutAct_9fa48("23456")) {
              {}
            } else {
              stryCov_9fa48("23456");
              continue;
            }
          }
          knownPartitionIds.add(partitionId);
          const tableName = stryMutAct_9fa48("23459") ? partition[COLUMN.TABLE_ID] && partition.table_name : stryMutAct_9fa48("23458") ? false : stryMutAct_9fa48("23457") ? true : (stryCov_9fa48("23457", "23458", "23459"), partition[COLUMN.TABLE_ID] || partition.table_name);
          if (stryMutAct_9fa48("23461") ? false : stryMutAct_9fa48("23460") ? true : (stryCov_9fa48("23460", "23461"), requiredTables.has(tableName))) {
            if (stryMutAct_9fa48("23462")) {
              {}
            } else {
              stryCov_9fa48("23462");
              requiredPartitionIds.add(partitionId);
            }
          }
        }
      }
      return stryMutAct_9fa48("23463") ? {} : (stryCov_9fa48("23463"), {
        knownPartitionIds,
        requiredPartitionIds
      });
    }
  }
  filterMissingRequiredPartitionIds(partitionIds = stryMutAct_9fa48("23464") ? ["Stryker was here"] : (stryCov_9fa48("23464"), []), requiredTablesList = BOOTSTRAP_REQUIRED_LEADER_TABLES) {
    if (stryMutAct_9fa48("23465")) {
      {}
    } else {
      stryCov_9fa48("23465");
      if (stryMutAct_9fa48("23468") ? !Array.isArray(partitionIds) && partitionIds.length === NUM.ZERO : stryMutAct_9fa48("23467") ? false : stryMutAct_9fa48("23466") ? true : (stryCov_9fa48("23466", "23467", "23468"), (stryMutAct_9fa48("23469") ? Array.isArray(partitionIds) : (stryCov_9fa48("23469"), !Array.isArray(partitionIds))) || (stryMutAct_9fa48("23471") ? partitionIds.length !== NUM.ZERO : stryMutAct_9fa48("23470") ? false : (stryCov_9fa48("23470", "23471"), partitionIds.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("23472")) {
          {}
        } else {
          stryCov_9fa48("23472");
          return stryMutAct_9fa48("23473") ? ["Stryker was here"] : (stryCov_9fa48("23473"), []);
        }
      }
      const {
        knownPartitionIds,
        requiredPartitionIds
      } = this.getLeaderReadinessPartitionSetsForTables(requiredTablesList);
      if (stryMutAct_9fa48("23476") ? knownPartitionIds.size === NUM.ZERO && requiredPartitionIds.size === NUM.ZERO : stryMutAct_9fa48("23475") ? false : stryMutAct_9fa48("23474") ? true : (stryCov_9fa48("23474", "23475", "23476"), (stryMutAct_9fa48("23478") ? knownPartitionIds.size !== NUM.ZERO : stryMutAct_9fa48("23477") ? false : (stryCov_9fa48("23477", "23478"), knownPartitionIds.size === NUM.ZERO)) || (stryMutAct_9fa48("23480") ? requiredPartitionIds.size !== NUM.ZERO : stryMutAct_9fa48("23479") ? false : (stryCov_9fa48("23479", "23480"), requiredPartitionIds.size === NUM.ZERO)))) {
        if (stryMutAct_9fa48("23481")) {
          {}
        } else {
          stryCov_9fa48("23481");
          return partitionIds;
        }
      }
      return stryMutAct_9fa48("23482") ? partitionIds : (stryCov_9fa48("23482"), partitionIds.filter(stryMutAct_9fa48("23483") ? () => undefined : (stryCov_9fa48("23483"), partitionId => stryMutAct_9fa48("23486") ? !knownPartitionIds.has(partitionId) && requiredPartitionIds.has(partitionId) : stryMutAct_9fa48("23485") ? false : stryMutAct_9fa48("23484") ? true : (stryCov_9fa48("23484", "23485", "23486"), (stryMutAct_9fa48("23487") ? knownPartitionIds.has(partitionId) : (stryCov_9fa48("23487"), !knownPartitionIds.has(partitionId))) || requiredPartitionIds.has(partitionId)))));
    }
  }
  getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
    if (stryMutAct_9fa48("23488")) {
      {}
    } else {
      stryCov_9fa48("23488");
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const ownerRecords = getOwnerRecords(systemTableCache, serviceType);
      const metadata = new Map();
      for (const ownerRecord of ownerRecords) {
        if (stryMutAct_9fa48("23489")) {
          {}
        } else {
          stryCov_9fa48("23489");
          const entityId = stryMutAct_9fa48("23490") ? ownerRecord[idColumn] : (stryCov_9fa48("23490"), ownerRecord?.[idColumn]);
          if (stryMutAct_9fa48("23493") ? false : stryMutAct_9fa48("23492") ? true : stryMutAct_9fa48("23491") ? entityId : (stryCov_9fa48("23491", "23492", "23493"), !entityId)) {
            if (stryMutAct_9fa48("23494")) {
              {}
            } else {
              stryCov_9fa48("23494");
              continue;
            }
          }
          const {
            leaderNodeId,
            leaderService
          } = resolveCanonicalLeaderService(systemTableCache, serviceType, entityId);
          metadata.set(entityId, stryMutAct_9fa48("23495") ? {} : (stryCov_9fa48("23495"), {
            hasLeaderRecord: Boolean(stryMutAct_9fa48("23498") ? leaderNodeId || leaderService : stryMutAct_9fa48("23497") ? false : stryMutAct_9fa48("23496") ? true : (stryCov_9fa48("23496", "23497", "23498"), leaderNodeId && leaderService)),
            hasNodeId: Boolean(leaderNodeId),
            hasAddress: Boolean(stryMutAct_9fa48("23499") ? leaderService[COLUMN.ADDRESS] : (stryCov_9fa48("23499"), leaderService?.[COLUMN.ADDRESS]))
          }));
        }
      }
      return metadata;
    }
  }
  isLiveServiceLeader(service) {
    if (stryMutAct_9fa48("23500")) {
      {}
    } else {
      stryCov_9fa48("23500");
      return isLiveServiceLeader(service);
    }
  }
  normalizeLeaderStatusForRequiredTables(missing = {}, requiredTablesList = BOOTSTRAP_REQUIRED_LEADER_TABLES) {
    if (stryMutAct_9fa48("23501")) {
      {}
    } else {
      stryCov_9fa48("23501");
      const cachedPartitionLeaders = this.getCachedLeaderMetadataByServiceType(SERVICE_TYPE.PARTITION, COLUMN.PARTITION_ID);
      const cachedMessageGroupLeaders = this.getCachedLeaderMetadataByServiceType(SERVICE_TYPE.MESSAGE_GROUP, COLUMN.GROUP_ID);
      return stryMutAct_9fa48("23502") ? {} : (stryCov_9fa48("23502"), {
        ...missing,
        missingPartitionLeaders: stryMutAct_9fa48("23503") ? this.filterMissingRequiredPartitionIds(missing.missingPartitionLeaders || [], requiredTablesList) : (stryCov_9fa48("23503"), this.filterMissingRequiredPartitionIds(stryMutAct_9fa48("23506") ? missing.missingPartitionLeaders && [] : stryMutAct_9fa48("23505") ? false : stryMutAct_9fa48("23504") ? true : (stryCov_9fa48("23504", "23505", "23506"), missing.missingPartitionLeaders || (stryMutAct_9fa48("23507") ? ["Stryker was here"] : (stryCov_9fa48("23507"), []))), requiredTablesList).filter(partitionId => {
          if (stryMutAct_9fa48("23508")) {
            {}
          } else {
            stryCov_9fa48("23508");
            const cached = cachedPartitionLeaders.get(partitionId);
            return stryMutAct_9fa48("23511") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23510") ? false : stryMutAct_9fa48("23509") ? true : (stryCov_9fa48("23509", "23510", "23511"), (stryMutAct_9fa48("23512") ? cached : (stryCov_9fa48("23512"), !cached)) || (stryMutAct_9fa48("23513") ? cached.hasLeaderRecord : (stryCov_9fa48("23513"), !cached.hasLeaderRecord)));
          }
        })),
        missingPartitionLeaderNodes: stryMutAct_9fa48("23514") ? this.filterMissingRequiredPartitionIds(missing.missingPartitionLeaderNodes || [], requiredTablesList) : (stryCov_9fa48("23514"), this.filterMissingRequiredPartitionIds(stryMutAct_9fa48("23517") ? missing.missingPartitionLeaderNodes && [] : stryMutAct_9fa48("23516") ? false : stryMutAct_9fa48("23515") ? true : (stryCov_9fa48("23515", "23516", "23517"), missing.missingPartitionLeaderNodes || (stryMutAct_9fa48("23518") ? ["Stryker was here"] : (stryCov_9fa48("23518"), []))), requiredTablesList).filter(partitionId => {
          if (stryMutAct_9fa48("23519")) {
            {}
          } else {
            stryCov_9fa48("23519");
            const cached = cachedPartitionLeaders.get(partitionId);
            return stryMutAct_9fa48("23522") ? (!cached || !cached.hasLeaderRecord) && !cached.hasNodeId : stryMutAct_9fa48("23521") ? false : stryMutAct_9fa48("23520") ? true : (stryCov_9fa48("23520", "23521", "23522"), (stryMutAct_9fa48("23524") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23523") ? false : (stryCov_9fa48("23523", "23524"), (stryMutAct_9fa48("23525") ? cached : (stryCov_9fa48("23525"), !cached)) || (stryMutAct_9fa48("23526") ? cached.hasLeaderRecord : (stryCov_9fa48("23526"), !cached.hasLeaderRecord)))) || (stryMutAct_9fa48("23527") ? cached.hasNodeId : (stryCov_9fa48("23527"), !cached.hasNodeId)));
          }
        })),
        missingPartitionLeaderAddresses: stryMutAct_9fa48("23528") ? this.filterMissingRequiredPartitionIds(missing.missingPartitionLeaderAddresses || [], requiredTablesList) : (stryCov_9fa48("23528"), this.filterMissingRequiredPartitionIds(stryMutAct_9fa48("23531") ? missing.missingPartitionLeaderAddresses && [] : stryMutAct_9fa48("23530") ? false : stryMutAct_9fa48("23529") ? true : (stryCov_9fa48("23529", "23530", "23531"), missing.missingPartitionLeaderAddresses || (stryMutAct_9fa48("23532") ? ["Stryker was here"] : (stryCov_9fa48("23532"), []))), requiredTablesList).filter(partitionId => {
          if (stryMutAct_9fa48("23533")) {
            {}
          } else {
            stryCov_9fa48("23533");
            const cached = cachedPartitionLeaders.get(partitionId);
            return stryMutAct_9fa48("23536") ? (!cached || !cached.hasLeaderRecord) && !cached.hasAddress : stryMutAct_9fa48("23535") ? false : stryMutAct_9fa48("23534") ? true : (stryCov_9fa48("23534", "23535", "23536"), (stryMutAct_9fa48("23538") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23537") ? false : (stryCov_9fa48("23537", "23538"), (stryMutAct_9fa48("23539") ? cached : (stryCov_9fa48("23539"), !cached)) || (stryMutAct_9fa48("23540") ? cached.hasLeaderRecord : (stryCov_9fa48("23540"), !cached.hasLeaderRecord)))) || (stryMutAct_9fa48("23541") ? cached.hasAddress : (stryCov_9fa48("23541"), !cached.hasAddress)));
          }
        })),
        missingMessageGroupLeaders: stryMutAct_9fa48("23542") ? missing.missingMessageGroupLeaders || [] : (stryCov_9fa48("23542"), (stryMutAct_9fa48("23545") ? missing.missingMessageGroupLeaders && [] : stryMutAct_9fa48("23544") ? false : stryMutAct_9fa48("23543") ? true : (stryCov_9fa48("23543", "23544", "23545"), missing.missingMessageGroupLeaders || (stryMutAct_9fa48("23546") ? ["Stryker was here"] : (stryCov_9fa48("23546"), [])))).filter(groupId => {
          if (stryMutAct_9fa48("23547")) {
            {}
          } else {
            stryCov_9fa48("23547");
            const cached = cachedMessageGroupLeaders.get(groupId);
            return stryMutAct_9fa48("23550") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23549") ? false : stryMutAct_9fa48("23548") ? true : (stryCov_9fa48("23548", "23549", "23550"), (stryMutAct_9fa48("23551") ? cached : (stryCov_9fa48("23551"), !cached)) || (stryMutAct_9fa48("23552") ? cached.hasLeaderRecord : (stryCov_9fa48("23552"), !cached.hasLeaderRecord)));
          }
        })),
        missingMessageGroupLeaderNodes: stryMutAct_9fa48("23553") ? missing.missingMessageGroupLeaderNodes || [] : (stryCov_9fa48("23553"), (stryMutAct_9fa48("23556") ? missing.missingMessageGroupLeaderNodes && [] : stryMutAct_9fa48("23555") ? false : stryMutAct_9fa48("23554") ? true : (stryCov_9fa48("23554", "23555", "23556"), missing.missingMessageGroupLeaderNodes || (stryMutAct_9fa48("23557") ? ["Stryker was here"] : (stryCov_9fa48("23557"), [])))).filter(groupId => {
          if (stryMutAct_9fa48("23558")) {
            {}
          } else {
            stryCov_9fa48("23558");
            const cached = cachedMessageGroupLeaders.get(groupId);
            return stryMutAct_9fa48("23561") ? (!cached || !cached.hasLeaderRecord) && !cached.hasNodeId : stryMutAct_9fa48("23560") ? false : stryMutAct_9fa48("23559") ? true : (stryCov_9fa48("23559", "23560", "23561"), (stryMutAct_9fa48("23563") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23562") ? false : (stryCov_9fa48("23562", "23563"), (stryMutAct_9fa48("23564") ? cached : (stryCov_9fa48("23564"), !cached)) || (stryMutAct_9fa48("23565") ? cached.hasLeaderRecord : (stryCov_9fa48("23565"), !cached.hasLeaderRecord)))) || (stryMutAct_9fa48("23566") ? cached.hasNodeId : (stryCov_9fa48("23566"), !cached.hasNodeId)));
          }
        })),
        missingMessageGroupLeaderAddresses: stryMutAct_9fa48("23567") ? missing.missingMessageGroupLeaderAddresses || [] : (stryCov_9fa48("23567"), (stryMutAct_9fa48("23570") ? missing.missingMessageGroupLeaderAddresses && [] : stryMutAct_9fa48("23569") ? false : stryMutAct_9fa48("23568") ? true : (stryCov_9fa48("23568", "23569", "23570"), missing.missingMessageGroupLeaderAddresses || (stryMutAct_9fa48("23571") ? ["Stryker was here"] : (stryCov_9fa48("23571"), [])))).filter(groupId => {
          if (stryMutAct_9fa48("23572")) {
            {}
          } else {
            stryCov_9fa48("23572");
            const cached = cachedMessageGroupLeaders.get(groupId);
            return stryMutAct_9fa48("23575") ? (!cached || !cached.hasLeaderRecord) && !cached.hasAddress : stryMutAct_9fa48("23574") ? false : stryMutAct_9fa48("23573") ? true : (stryCov_9fa48("23573", "23574", "23575"), (stryMutAct_9fa48("23577") ? !cached && !cached.hasLeaderRecord : stryMutAct_9fa48("23576") ? false : (stryCov_9fa48("23576", "23577"), (stryMutAct_9fa48("23578") ? cached : (stryCov_9fa48("23578"), !cached)) || (stryMutAct_9fa48("23579") ? cached.hasLeaderRecord : (stryCov_9fa48("23579"), !cached.hasLeaderRecord)))) || (stryMutAct_9fa48("23580") ? cached.hasAddress : (stryCov_9fa48("23580"), !cached.hasAddress)));
          }
        }))
      });
    }
  }
  getBlockingLeaderStatusForReadiness(missing = {}) {
    if (stryMutAct_9fa48("23581")) {
      {}
    } else {
      stryCov_9fa48("23581");
      return stryMutAct_9fa48("23582") ? {} : (stryCov_9fa48("23582"), {
        ...missing,
        missingMessageGroupLeaders: stryMutAct_9fa48("23583") ? ["Stryker was here"] : (stryCov_9fa48("23583"), []),
        missingMessageGroupLeaderNodes: stryMutAct_9fa48("23584") ? ["Stryker was here"] : (stryCov_9fa48("23584"), []),
        missingMessageGroupLeaderAddresses: stryMutAct_9fa48("23585") ? ["Stryker was here"] : (stryCov_9fa48("23585"), [])
      });
    }
  }
  resolveRequiredLeaderTables(options = {}) {
    if (stryMutAct_9fa48("23586")) {
      {}
    } else {
      stryCov_9fa48("23586");
      return (stryMutAct_9fa48("23589") ? resolveMembershipJoinIntentType(options.startupMode) !== MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY : stryMutAct_9fa48("23588") ? false : stryMutAct_9fa48("23587") ? true : (stryCov_9fa48("23587", "23588", "23589"), resolveMembershipJoinIntentType(options.startupMode) === MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY)) ? TRAFFIC_REQUIRED_LEADER_TABLES : BOOTSTRAP_REQUIRED_LEADER_TABLES;
    }
  }
  async waitForServiceLeaders(options = {}) {
    if (stryMutAct_9fa48("23590")) {
      {}
    } else {
      stryCov_9fa48("23590");
      const requiredTables = this.resolveRequiredLeaderTables(options);
      const missing = this.normalizeLeaderStatusForRequiredTables(this.getMissingServiceLeaders(), requiredTables);
      const blockingMissing = this.getBlockingLeaderStatusForReadiness(missing);
      const missingCount = this.countMissingLeaderInfo(blockingMissing);
      const ready = stryMutAct_9fa48("23593") ? missingCount !== NUM.ZERO : stryMutAct_9fa48("23592") ? false : stryMutAct_9fa48("23591") ? true : (stryCov_9fa48("23591", "23592", "23593"), missingCount === NUM.ZERO);
      if (stryMutAct_9fa48("23595") ? false : stryMutAct_9fa48("23594") ? true : (stryCov_9fa48("23594", "23595"), ready)) {
        if (stryMutAct_9fa48("23596")) {
          {}
        } else {
          stryCov_9fa48("23596");
          this.getLogger().info(stryMutAct_9fa48("23599") ? BOOTSTRAP_API_LOG_MSG.LEADERS_READY && 'All service leaders ready' : stryMutAct_9fa48("23598") ? false : stryMutAct_9fa48("23597") ? true : (stryCov_9fa48("23597", "23598", "23599"), BOOTSTRAP_API_LOG_MSG.LEADERS_READY || (stryMutAct_9fa48("23600") ? "" : (stryCov_9fa48("23600"), 'All service leaders ready'))), stryMutAct_9fa48("23601") ? {} : (stryCov_9fa48("23601"), {
            seedNodeId: this.getSeedNodeId(),
            elapsedMs: NUM.ZERO
          }));
        }
      } else {
        if (stryMutAct_9fa48("23602")) {
          {}
        } else {
          stryCov_9fa48("23602");
          this.getLogger().debug(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, stryMutAct_9fa48("23603") ? {} : (stryCov_9fa48("23603"), {
            seedNodeId: this.getSeedNodeId(),
            missingCount,
            ...blockingMissing,
            nonBlockingMissingMessageGroupLeaders: stryMutAct_9fa48("23606") ? missing.missingMessageGroupLeaders && [] : stryMutAct_9fa48("23605") ? false : stryMutAct_9fa48("23604") ? true : (stryCov_9fa48("23604", "23605", "23606"), missing.missingMessageGroupLeaders || (stryMutAct_9fa48("23607") ? ["Stryker was here"] : (stryCov_9fa48("23607"), []))),
            nonBlockingMissingMessageGroupLeaderNodes: stryMutAct_9fa48("23610") ? missing.missingMessageGroupLeaderNodes && [] : stryMutAct_9fa48("23609") ? false : stryMutAct_9fa48("23608") ? true : (stryCov_9fa48("23608", "23609", "23610"), missing.missingMessageGroupLeaderNodes || (stryMutAct_9fa48("23611") ? ["Stryker was here"] : (stryCov_9fa48("23611"), []))),
            nonBlockingMissingMessageGroupLeaderAddresses: stryMutAct_9fa48("23614") ? missing.missingMessageGroupLeaderAddresses && [] : stryMutAct_9fa48("23613") ? false : stryMutAct_9fa48("23612") ? true : (stryCov_9fa48("23612", "23613", "23614"), missing.missingMessageGroupLeaderAddresses || (stryMutAct_9fa48("23615") ? ["Stryker was here"] : (stryCov_9fa48("23615"), [])))
          }));
        }
      }
      return this.buildLeaderStatusResult(ready, missing, missing);
    }
  }
  countMissingLeaderInfo(missing) {
    if (stryMutAct_9fa48("23616")) {
      {}
    } else {
      stryCov_9fa48("23616");
      return getMissingSystemServiceLeaderCount(missing);
    }
  }
  getSystemPartitionLeaders() {
    if (stryMutAct_9fa48("23617")) {
      {}
    } else {
      stryCov_9fa48("23617");
      const leaders = {};
      const partitionServices = this.getPartitionServices();
      if (stryMutAct_9fa48("23620") ? partitionServices || partitionServices.size > NUM.ZERO : stryMutAct_9fa48("23619") ? false : stryMutAct_9fa48("23618") ? true : (stryCov_9fa48("23618", "23619", "23620"), partitionServices && (stryMutAct_9fa48("23623") ? partitionServices.size <= NUM.ZERO : stryMutAct_9fa48("23622") ? partitionServices.size >= NUM.ZERO : stryMutAct_9fa48("23621") ? true : (stryCov_9fa48("23621", "23622", "23623"), partitionServices.size > NUM.ZERO)))) {
        if (stryMutAct_9fa48("23624")) {
          {}
        } else {
          stryCov_9fa48("23624");
          for (const service of partitionServices.values()) {
            if (stryMutAct_9fa48("23625")) {
              {}
            } else {
              stryCov_9fa48("23625");
              const tableName = stryMutAct_9fa48("23628") ? service.tableId && service.tableName : stryMutAct_9fa48("23627") ? false : stryMutAct_9fa48("23626") ? true : (stryCov_9fa48("23626", "23627", "23628"), service.tableId || service.tableName);
              if (stryMutAct_9fa48("23631") ? (!tableName || leaders[tableName]) && !this.isLiveServiceLeader(service) : stryMutAct_9fa48("23630") ? false : stryMutAct_9fa48("23629") ? true : (stryCov_9fa48("23629", "23630", "23631"), (stryMutAct_9fa48("23633") ? !tableName && leaders[tableName] : stryMutAct_9fa48("23632") ? false : (stryCov_9fa48("23632", "23633"), (stryMutAct_9fa48("23634") ? tableName : (stryCov_9fa48("23634"), !tableName)) || leaders[tableName])) || (stryMutAct_9fa48("23635") ? this.isLiveServiceLeader(service) : (stryCov_9fa48("23635"), !this.isLiveServiceLeader(service))))) {
                if (stryMutAct_9fa48("23636")) {
                  {}
                } else {
                  stryCov_9fa48("23636");
                  continue;
                }
              }
              const nodeId = stryMutAct_9fa48("23639") ? service.nodeId && this.getSeedNodeId() : stryMutAct_9fa48("23638") ? false : stryMutAct_9fa48("23637") ? true : (stryCov_9fa48("23637", "23638", "23639"), service.nodeId || this.getSeedNodeId());
              const replicaId = stryMutAct_9fa48("23642") ? service.replicaId && service.service_id : stryMutAct_9fa48("23641") ? false : stryMutAct_9fa48("23640") ? true : (stryCov_9fa48("23640", "23641", "23642"), service.replicaId || service.service_id);
              const address = stryMutAct_9fa48("23645") ? service.unifiedAddress && `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}` + `${ADDRESS.SEPARATOR}${replicaId}` : stryMutAct_9fa48("23644") ? false : stryMutAct_9fa48("23643") ? true : (stryCov_9fa48("23643", "23644", "23645"), service.unifiedAddress || (stryMutAct_9fa48("23646") ? `` : (stryCov_9fa48("23646"), `${nodeId}${ADDRESS.SEPARATOR}${ENTITY_TYPE.PARTITION}`)) + (stryMutAct_9fa48("23647") ? `` : (stryCov_9fa48("23647"), `${ADDRESS.SEPARATOR}${replicaId}`)));
              leaders[tableName] = stryMutAct_9fa48("23648") ? {} : (stryCov_9fa48("23648"), {
                partitionId: service.partitionId,
                replicaId,
                nodeId,
                address
              });
            }
          }
          if (stryMutAct_9fa48("23652") ? Object.keys(leaders).length <= NUM.ZERO : stryMutAct_9fa48("23651") ? Object.keys(leaders).length >= NUM.ZERO : stryMutAct_9fa48("23650") ? false : stryMutAct_9fa48("23649") ? true : (stryCov_9fa48("23649", "23650", "23651", "23652"), Object.keys(leaders).length > NUM.ZERO)) {
            if (stryMutAct_9fa48("23653")) {
              {}
            } else {
              stryCov_9fa48("23653");
              return leaders;
            }
          }
        }
      }
      const systemTableCache = assertCritical(this.getSystemTableCache(), BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED);
      const partitions = stryMutAct_9fa48("23656") ? systemTableCache.getAll(TABLES.PARTITIONS) && [] : stryMutAct_9fa48("23655") ? false : stryMutAct_9fa48("23654") ? true : (stryCov_9fa48("23654", "23655", "23656"), systemTableCache.getAll(TABLES.PARTITIONS) || (stryMutAct_9fa48("23657") ? ["Stryker was here"] : (stryCov_9fa48("23657"), [])));
      for (const partition of partitions) {
        if (stryMutAct_9fa48("23658")) {
          {}
        } else {
          stryCov_9fa48("23658");
          const tableName = stryMutAct_9fa48("23661") ? partition.table_id && partition.table_name : stryMutAct_9fa48("23660") ? false : stryMutAct_9fa48("23659") ? true : (stryCov_9fa48("23659", "23660", "23661"), partition.table_id || partition.table_name);
          if (stryMutAct_9fa48("23664") ? !tableName && leaders[tableName] : stryMutAct_9fa48("23663") ? false : stryMutAct_9fa48("23662") ? true : (stryCov_9fa48("23662", "23663", "23664"), (stryMutAct_9fa48("23665") ? tableName : (stryCov_9fa48("23665"), !tableName)) || leaders[tableName])) {
            if (stryMutAct_9fa48("23666")) {
              {}
            } else {
              stryCov_9fa48("23666");
              continue;
            }
          }
          const {
            leaderNodeId,
            leaderService
          } = resolveCanonicalLeaderService(systemTableCache, SERVICE_TYPE.PARTITION, partition[COLUMN.PARTITION_ID]);
          if (stryMutAct_9fa48("23669") ? false : stryMutAct_9fa48("23668") ? true : stryMutAct_9fa48("23667") ? leaderService : (stryCov_9fa48("23667", "23668", "23669"), !leaderService)) {
            if (stryMutAct_9fa48("23670")) {
              {}
            } else {
              stryCov_9fa48("23670");
              continue;
            }
          }
          leaders[tableName] = stryMutAct_9fa48("23671") ? {} : (stryCov_9fa48("23671"), {
            partitionId: partition[COLUMN.PARTITION_ID],
            replicaId: stryMutAct_9fa48("23674") ? leaderService[COLUMN.REPLICA_ID] && leaderService[COLUMN.SERVICE_ID] : stryMutAct_9fa48("23673") ? false : stryMutAct_9fa48("23672") ? true : (stryCov_9fa48("23672", "23673", "23674"), leaderService[COLUMN.REPLICA_ID] || leaderService[COLUMN.SERVICE_ID]),
            nodeId: leaderNodeId,
            address: leaderService[COLUMN.ADDRESS]
          });
        }
      }
      return leaders;
    }
  }
  buildLeaderStatusResult(ready, resultMissing = {}, fullMissing = resultMissing) {
    if (stryMutAct_9fa48("23675")) {
      {}
    } else {
      stryCov_9fa48("23675");
      return stryMutAct_9fa48("23676") ? {} : (stryCov_9fa48("23676"), {
        ready,
        ...resultMissing,
        nonBlockingMissingMessageGroupLeaders: stryMutAct_9fa48("23679") ? fullMissing.missingMessageGroupLeaders && [] : stryMutAct_9fa48("23678") ? false : stryMutAct_9fa48("23677") ? true : (stryCov_9fa48("23677", "23678", "23679"), fullMissing.missingMessageGroupLeaders || (stryMutAct_9fa48("23680") ? ["Stryker was here"] : (stryCov_9fa48("23680"), []))),
        nonBlockingMissingMessageGroupLeaderNodes: stryMutAct_9fa48("23683") ? fullMissing.missingMessageGroupLeaderNodes && [] : stryMutAct_9fa48("23682") ? false : stryMutAct_9fa48("23681") ? true : (stryCov_9fa48("23681", "23682", "23683"), fullMissing.missingMessageGroupLeaderNodes || (stryMutAct_9fa48("23684") ? ["Stryker was here"] : (stryCov_9fa48("23684"), []))),
        nonBlockingMissingMessageGroupLeaderAddresses: stryMutAct_9fa48("23687") ? fullMissing.missingMessageGroupLeaderAddresses && [] : stryMutAct_9fa48("23686") ? false : stryMutAct_9fa48("23685") ? true : (stryCov_9fa48("23685", "23686", "23687"), fullMissing.missingMessageGroupLeaderAddresses || (stryMutAct_9fa48("23688") ? ["Stryker was here"] : (stryCov_9fa48("23688"), [])))
      });
    }
  }
}
export { BOOTSTRAP_REQUIRED_LEADER_TABLES, ServiceLeaderReadinessOwner, TRAFFIC_REQUIRED_LEADER_TABLES, isLiveServiceLeader };