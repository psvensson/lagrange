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
import { AddressManager } from '../address/address-manager.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { ENTITY_TYPE, SERVICE_STATUS, SERVICE_TYPE, TYPEOF } from '../constants/index.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { normalizePublishedRaftRole } from '../raft/published-raft-role.js';
const PARTITION_SERVICE_ROW_OWNER_ERROR = Object.freeze(stryMutAct_9fa48("101357") ? {} : (stryCov_9fa48("101357"), {
  PARTITION_ID_REQUIRED: stryMutAct_9fa48("101358") ? "" : (stryCov_9fa48("101358"), 'PartitionServiceRowOwner requires partitionId'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("101359") ? "" : (stryCov_9fa48("101359"), 'PartitionServiceRowOwner requires nodeId'),
  REPLICA_ID_REQUIRED: stryMutAct_9fa48("101360") ? "" : (stryCov_9fa48("101360"), 'PartitionServiceRowOwner requires replicaId'),
  UPSERT_REQUIRED: stryMutAct_9fa48("101361") ? "" : (stryCov_9fa48("101361"), 'PartitionServiceRowOwner requires upsertSystemTableRow for registration'),
  DELETE_REQUIRED: stryMutAct_9fa48("101362") ? "" : (stryCov_9fa48("101362"), 'PartitionServiceRowOwner requires deleteSystemTableRow for removal')
}));
const SERVICE_ROW_UPDATE_OPTION = Object.freeze(stryMutAct_9fa48("101363") ? {} : (stryCov_9fa48("101363"), {
  allowCoalescing: stryMutAct_9fa48("101364") ? false : (stryCov_9fa48("101364"), true),
  allowPressureDefer: stryMutAct_9fa48("101365") ? false : (stryCov_9fa48("101365"), true),
  deliveryPriority: stryMutAct_9fa48("101366") ? "" : (stryCov_9fa48("101366"), 'background'),
  pressureRetryAfterMs: 250,
  skipCacheWait: stryMutAct_9fa48("101367") ? false : (stryCov_9fa48("101367"), true),
  workClass: stryMutAct_9fa48("101368") ? "" : (stryCov_9fa48("101368"), 'background')
}));
const CRITICAL_SERVICE_ROW_UPDATE_OPTION = Object.freeze(stryMutAct_9fa48("101369") ? {} : (stryCov_9fa48("101369"), {
  allowCoalescing: stryMutAct_9fa48("101370") ? false : (stryCov_9fa48("101370"), true),
  allowPressureDefer: stryMutAct_9fa48("101371") ? true : (stryCov_9fa48("101371"), false),
  deliveryPriority: stryMutAct_9fa48("101372") ? "" : (stryCov_9fa48("101372"), 'critical'),
  pressureRetryAfterMs: 250,
  skipCacheWait: stryMutAct_9fa48("101373") ? false : (stryCov_9fa48("101373"), true),
  workClass: stryMutAct_9fa48("101374") ? "" : (stryCov_9fa48("101374"), 'critical')
}));
const CRITICAL_SYSTEM_PARTITION_IDS = new Set(Object.values(SYSTEM_TABLE_NAME).map(stryMutAct_9fa48("101375") ? () => undefined : (stryCov_9fa48("101375"), tableName => stryMutAct_9fa48("101376") ? `` : (stryCov_9fa48("101376"), `${tableName}-p1`))));
function assertRequiredString(value, errorMessage) {
  if (stryMutAct_9fa48("101377")) {
    {}
  } else {
    stryCov_9fa48("101377");
    if (stryMutAct_9fa48("101380") ? typeof value !== TYPEOF.STRING && value.length === 0 : stryMutAct_9fa48("101379") ? false : stryMutAct_9fa48("101378") ? true : (stryCov_9fa48("101378", "101379", "101380"), (stryMutAct_9fa48("101382") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("101381") ? false : (stryCov_9fa48("101381", "101382"), typeof value !== TYPEOF.STRING)) || (stryMutAct_9fa48("101384") ? value.length !== 0 : stryMutAct_9fa48("101383") ? false : (stryCov_9fa48("101383", "101384"), value.length === 0)))) {
      if (stryMutAct_9fa48("101385")) {
        {}
      } else {
        stryCov_9fa48("101385");
        throw new Error(errorMessage);
      }
    }
  }
}
function resolvePartitionRaftRole(service) {
  if (stryMutAct_9fa48("101386")) {
    {}
  } else {
    stryCov_9fa48("101386");
    const isLeader = stryMutAct_9fa48("101389") ? service?.isLeader === true && typeof service?.isLeaderReplica === TYPEOF.FUNCTION && service.isLeaderReplica() : stryMutAct_9fa48("101388") ? false : stryMutAct_9fa48("101387") ? true : (stryCov_9fa48("101387", "101388", "101389"), (stryMutAct_9fa48("101391") ? service?.isLeader !== true : stryMutAct_9fa48("101390") ? false : (stryCov_9fa48("101390", "101391"), (stryMutAct_9fa48("101392") ? service.isLeader : (stryCov_9fa48("101392"), service?.isLeader)) === (stryMutAct_9fa48("101393") ? false : (stryCov_9fa48("101393"), true)))) || (stryMutAct_9fa48("101395") ? typeof service?.isLeaderReplica === TYPEOF.FUNCTION || service.isLeaderReplica() : stryMutAct_9fa48("101394") ? false : (stryCov_9fa48("101394", "101395"), (stryMutAct_9fa48("101397") ? typeof service?.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("101396") ? true : (stryCov_9fa48("101396", "101397"), typeof (stryMutAct_9fa48("101398") ? service.isLeaderReplica : (stryCov_9fa48("101398"), service?.isLeaderReplica)) === TYPEOF.FUNCTION)) && service.isLeaderReplica())));
    if (stryMutAct_9fa48("101400") ? false : stryMutAct_9fa48("101399") ? true : (stryCov_9fa48("101399", "101400"), isLeader)) {
      if (stryMutAct_9fa48("101401")) {
        {}
      } else {
        stryCov_9fa48("101401");
        return RAFT_ROLE.LEADER;
      }
    }
    if (stryMutAct_9fa48("101404") ? typeof service?.getRole !== TYPEOF.FUNCTION : stryMutAct_9fa48("101403") ? false : stryMutAct_9fa48("101402") ? true : (stryCov_9fa48("101402", "101403", "101404"), typeof (stryMutAct_9fa48("101405") ? service.getRole : (stryCov_9fa48("101405"), service?.getRole)) === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("101406")) {
        {}
      } else {
        stryCov_9fa48("101406");
        return normalizePublishedRaftRole(service.getRole());
      }
    }
    return normalizePublishedRaftRole(stryMutAct_9fa48("101407") ? service.role : (stryCov_9fa48("101407"), service?.role));
  }
}
class PartitionServiceRowOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("101408")) {
      {}
    } else {
      stryCov_9fa48("101408");
      this.systemTableWriter = stryMutAct_9fa48("101411") ? options.systemTableWriter && null : stryMutAct_9fa48("101410") ? false : stryMutAct_9fa48("101409") ? true : (stryCov_9fa48("101409", "101410", "101411"), options.systemTableWriter || null);
      this.now = (stryMutAct_9fa48("101414") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("101413") ? false : stryMutAct_9fa48("101412") ? true : (stryCov_9fa48("101412", "101413", "101414"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("101415") ? () => undefined : (stryCov_9fa48("101415"), () => Date.now());
    }
  }
  static buildServiceRow(options = {}) {
    if (stryMutAct_9fa48("101416")) {
      {}
    } else {
      stryCov_9fa48("101416");
      const {
        partitionId,
        replicaId,
        nodeId,
        service = null,
        timestamp = Date.now(),
        status = SERVICE_STATUS.STOPPED,
        extraFields = null
      } = options;
      assertRequiredString(partitionId, PARTITION_SERVICE_ROW_OWNER_ERROR.PARTITION_ID_REQUIRED);
      assertRequiredString(replicaId, PARTITION_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED);
      assertRequiredString(nodeId, PARTITION_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED);
      const address = AddressManager.getInstance().format(nodeId, ENTITY_TYPE.PARTITION, replicaId);
      return stryMutAct_9fa48("101417") ? {} : (stryCov_9fa48("101417"), {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION,
        node_id: nodeId,
        partition_id: partitionId,
        group_id: null,
        replica_id: replicaId,
        raft_role: resolvePartitionRaftRole(service),
        status,
        address,
        created_at: timestamp,
        updated_at: timestamp,
        ...(stryMutAct_9fa48("101420") ? extraFields && {} : stryMutAct_9fa48("101419") ? false : stryMutAct_9fa48("101418") ? true : (stryCov_9fa48("101418", "101419", "101420"), extraFields || {}))
      });
    }
  }
  isCriticalSystemPartition(partitionId) {
    if (stryMutAct_9fa48("101421")) {
      {}
    } else {
      stryCov_9fa48("101421");
      return stryMutAct_9fa48("101424") ? typeof partitionId === TYPEOF.STRING || CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId) : stryMutAct_9fa48("101423") ? false : stryMutAct_9fa48("101422") ? true : (stryCov_9fa48("101422", "101423", "101424"), (stryMutAct_9fa48("101426") ? typeof partitionId !== TYPEOF.STRING : stryMutAct_9fa48("101425") ? true : (stryCov_9fa48("101425", "101426"), typeof partitionId === TYPEOF.STRING)) && CRITICAL_SYSTEM_PARTITION_IDS.has(partitionId));
    }
  }
  buildDeferredUpdateOptions(serviceId, partitionId = null) {
    if (stryMutAct_9fa48("101427")) {
      {}
    } else {
      stryCov_9fa48("101427");
      return stryMutAct_9fa48("101428") ? {} : (stryCov_9fa48("101428"), {
        ...(this.isCriticalSystemPartition(partitionId) ? CRITICAL_SERVICE_ROW_UPDATE_OPTION : SERVICE_ROW_UPDATE_OPTION),
        coalescingKey: stryMutAct_9fa48("101429") ? `` : (stryCov_9fa48("101429"), `services:${serviceId}`)
      });
    }
  }
  buildPartitionLeaderUpdateOptions(partitionId) {
    if (stryMutAct_9fa48("101430")) {
      {}
    } else {
      stryCov_9fa48("101430");
      return stryMutAct_9fa48("101431") ? {} : (stryCov_9fa48("101431"), {
        ...(this.isCriticalSystemPartition(partitionId) ? CRITICAL_SERVICE_ROW_UPDATE_OPTION : SERVICE_ROW_UPDATE_OPTION),
        coalescingKey: stryMutAct_9fa48("101432") ? `` : (stryCov_9fa48("101432"), `partitions:leader:${partitionId}`)
      });
    }
  }
  async publishCanonicalLeaderNodeId(row) {
    if (stryMutAct_9fa48("101433")) {
      {}
    } else {
      stryCov_9fa48("101433");
      if (stryMutAct_9fa48("101436") ? (!row || row.service_type !== SERVICE_TYPE.PARTITION || row.status !== SERVICE_STATUS.ACTIVE || row.raft_role !== RAFT_ROLE.LEADER || !this.systemTableWriter) && typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("101435") ? false : stryMutAct_9fa48("101434") ? true : (stryCov_9fa48("101434", "101435", "101436"), (stryMutAct_9fa48("101438") ? (!row || row.service_type !== SERVICE_TYPE.PARTITION || row.status !== SERVICE_STATUS.ACTIVE || row.raft_role !== RAFT_ROLE.LEADER) && !this.systemTableWriter : stryMutAct_9fa48("101437") ? false : (stryCov_9fa48("101437", "101438"), (stryMutAct_9fa48("101440") ? (!row || row.service_type !== SERVICE_TYPE.PARTITION || row.status !== SERVICE_STATUS.ACTIVE) && row.raft_role !== RAFT_ROLE.LEADER : stryMutAct_9fa48("101439") ? false : (stryCov_9fa48("101439", "101440"), (stryMutAct_9fa48("101442") ? (!row || row.service_type !== SERVICE_TYPE.PARTITION) && row.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("101441") ? false : (stryCov_9fa48("101441", "101442"), (stryMutAct_9fa48("101444") ? !row && row.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("101443") ? false : (stryCov_9fa48("101443", "101444"), (stryMutAct_9fa48("101445") ? row : (stryCov_9fa48("101445"), !row)) || (stryMutAct_9fa48("101447") ? row.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("101446") ? false : (stryCov_9fa48("101446", "101447"), row.service_type !== SERVICE_TYPE.PARTITION)))) || (stryMutAct_9fa48("101449") ? row.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("101448") ? false : (stryCov_9fa48("101448", "101449"), row.status !== SERVICE_STATUS.ACTIVE)))) || (stryMutAct_9fa48("101451") ? row.raft_role === RAFT_ROLE.LEADER : stryMutAct_9fa48("101450") ? false : (stryCov_9fa48("101450", "101451"), row.raft_role !== RAFT_ROLE.LEADER)))) || (stryMutAct_9fa48("101452") ? this.systemTableWriter : (stryCov_9fa48("101452"), !this.systemTableWriter)))) || (stryMutAct_9fa48("101454") ? typeof this.systemTableWriter.updateSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("101453") ? false : (stryCov_9fa48("101453", "101454"), typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("101455")) {
          {}
        } else {
          stryCov_9fa48("101455");
          return;
        }
      }
      await this.systemTableWriter.updateSystemTableRow(SYSTEM_TABLE_NAME.PARTITIONS, stryMutAct_9fa48("101456") ? {} : (stryCov_9fa48("101456"), {
        partition_id: row.partition_id
      }), stryMutAct_9fa48("101457") ? {} : (stryCov_9fa48("101457"), {
        leader_node_id: row.node_id,
        updated_at: row.updated_at
      }), this.buildPartitionLeaderUpdateOptions(row.partition_id));
    }
  }
  async registerReplica(options = {}) {
    if (stryMutAct_9fa48("101458")) {
      {}
    } else {
      stryCov_9fa48("101458");
      if (stryMutAct_9fa48("101461") ? !this.systemTableWriter && typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("101460") ? false : stryMutAct_9fa48("101459") ? true : (stryCov_9fa48("101459", "101460", "101461"), (stryMutAct_9fa48("101462") ? this.systemTableWriter : (stryCov_9fa48("101462"), !this.systemTableWriter)) || (stryMutAct_9fa48("101464") ? typeof this.systemTableWriter.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("101463") ? false : (stryCov_9fa48("101463", "101464"), typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("101465")) {
          {}
        } else {
          stryCov_9fa48("101465");
          throw new Error(PARTITION_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED);
        }
      }
      const row = PartitionServiceRowOwner.buildServiceRow(stryMutAct_9fa48("101466") ? {} : (stryCov_9fa48("101466"), {
        ...options,
        timestamp: stryMutAct_9fa48("101467") ? options.timestamp && this.now() : (stryCov_9fa48("101467"), options.timestamp ?? this.now())
      }));
      await this.systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, row, this.buildDeferredUpdateOptions(row.service_id, row.partition_id));
      await this.publishCanonicalLeaderNodeId(row);
      return row;
    }
  }
  async activateReplica(options = {}) {
    if (stryMutAct_9fa48("101468")) {
      {}
    } else {
      stryCov_9fa48("101468");
      return this.updateReplicaStatus(stryMutAct_9fa48("101469") ? {} : (stryCov_9fa48("101469"), {
        ...options,
        status: SERVICE_STATUS.ACTIVE
      }));
    }
  }
  async updateReplicaStatus(options = {}) {
    if (stryMutAct_9fa48("101470")) {
      {}
    } else {
      stryCov_9fa48("101470");
      if (stryMutAct_9fa48("101473") ? !this.systemTableWriter && typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("101472") ? false : stryMutAct_9fa48("101471") ? true : (stryCov_9fa48("101471", "101472", "101473"), (stryMutAct_9fa48("101474") ? this.systemTableWriter : (stryCov_9fa48("101474"), !this.systemTableWriter)) || (stryMutAct_9fa48("101476") ? typeof this.systemTableWriter.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("101475") ? false : (stryCov_9fa48("101475", "101476"), typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("101477")) {
          {}
        } else {
          stryCov_9fa48("101477");
          throw new Error(PARTITION_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED);
        }
      }
      const row = PartitionServiceRowOwner.buildServiceRow(stryMutAct_9fa48("101478") ? {} : (stryCov_9fa48("101478"), {
        ...options,
        timestamp: stryMutAct_9fa48("101479") ? options.timestamp && this.now() : (stryCov_9fa48("101479"), options.timestamp ?? this.now())
      }));
      if (stryMutAct_9fa48("101482") ? typeof this.systemTableWriter.updateSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("101481") ? false : stryMutAct_9fa48("101480") ? true : (stryCov_9fa48("101480", "101481", "101482"), typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("101483")) {
          {}
        } else {
          stryCov_9fa48("101483");
          await this.systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, row, this.buildDeferredUpdateOptions(row.service_id, row.partition_id));
          return row;
        }
      }
      const {
        created_at: _createdAt,
        ...updates
      } = row;
      await this.systemTableWriter.updateSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("101484") ? {} : (stryCov_9fa48("101484"), {
        service_id: row.service_id,
        service_type: row.service_type
      }), updates, this.buildDeferredUpdateOptions(row.service_id, row.partition_id));
      await this.publishCanonicalLeaderNodeId(row);
      return row;
    }
  }
  async removeReplica(options = {}) {
    if (stryMutAct_9fa48("101485")) {
      {}
    } else {
      stryCov_9fa48("101485");
      if (stryMutAct_9fa48("101488") ? !this.systemTableWriter && typeof this.systemTableWriter.deleteSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("101487") ? false : stryMutAct_9fa48("101486") ? true : (stryCov_9fa48("101486", "101487", "101488"), (stryMutAct_9fa48("101489") ? this.systemTableWriter : (stryCov_9fa48("101489"), !this.systemTableWriter)) || (stryMutAct_9fa48("101491") ? typeof this.systemTableWriter.deleteSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("101490") ? false : (stryCov_9fa48("101490", "101491"), typeof this.systemTableWriter.deleteSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("101492")) {
          {}
        } else {
          stryCov_9fa48("101492");
          throw new Error(PARTITION_SERVICE_ROW_OWNER_ERROR.DELETE_REQUIRED);
        }
      }
      const {
        partitionId,
        replicaId,
        nodeId
      } = options;
      assertRequiredString(replicaId, PARTITION_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED);
      const whereClause = stryMutAct_9fa48("101493") ? {} : (stryCov_9fa48("101493"), {
        service_id: replicaId,
        service_type: SERVICE_TYPE.PARTITION
      });
      if (stryMutAct_9fa48("101496") ? typeof partitionId === TYPEOF.STRING || partitionId.length > 0 : stryMutAct_9fa48("101495") ? false : stryMutAct_9fa48("101494") ? true : (stryCov_9fa48("101494", "101495", "101496"), (stryMutAct_9fa48("101498") ? typeof partitionId !== TYPEOF.STRING : stryMutAct_9fa48("101497") ? true : (stryCov_9fa48("101497", "101498"), typeof partitionId === TYPEOF.STRING)) && (stryMutAct_9fa48("101501") ? partitionId.length <= 0 : stryMutAct_9fa48("101500") ? partitionId.length >= 0 : stryMutAct_9fa48("101499") ? true : (stryCov_9fa48("101499", "101500", "101501"), partitionId.length > 0)))) {
        if (stryMutAct_9fa48("101502")) {
          {}
        } else {
          stryCov_9fa48("101502");
          whereClause.partition_id = partitionId;
        }
      }
      if (stryMutAct_9fa48("101505") ? typeof nodeId === TYPEOF.STRING || nodeId.length > 0 : stryMutAct_9fa48("101504") ? false : stryMutAct_9fa48("101503") ? true : (stryCov_9fa48("101503", "101504", "101505"), (stryMutAct_9fa48("101507") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("101506") ? true : (stryCov_9fa48("101506", "101507"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("101510") ? nodeId.length <= 0 : stryMutAct_9fa48("101509") ? nodeId.length >= 0 : stryMutAct_9fa48("101508") ? true : (stryCov_9fa48("101508", "101509", "101510"), nodeId.length > 0)))) {
        if (stryMutAct_9fa48("101511")) {
          {}
        } else {
          stryCov_9fa48("101511");
          whereClause.node_id = nodeId;
        }
      }
      await this.systemTableWriter.deleteSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, whereClause, this.buildDeferredUpdateOptions(replicaId, stryMutAct_9fa48("101514") ? partitionId && null : stryMutAct_9fa48("101513") ? false : stryMutAct_9fa48("101512") ? true : (stryCov_9fa48("101512", "101513", "101514"), partitionId || null)));
    }
  }
}
export { PartitionServiceRowOwner };