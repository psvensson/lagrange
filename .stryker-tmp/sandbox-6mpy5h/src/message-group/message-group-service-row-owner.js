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
const MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR = Object.freeze(stryMutAct_9fa48("86910") ? {} : (stryCov_9fa48("86910"), {
  GROUP_ID_REQUIRED: stryMutAct_9fa48("86911") ? "" : (stryCov_9fa48("86911"), 'MessageGroupServiceRowOwner requires groupId'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("86912") ? "" : (stryCov_9fa48("86912"), 'MessageGroupServiceRowOwner requires nodeId'),
  REPLICA_ID_REQUIRED: stryMutAct_9fa48("86913") ? "" : (stryCov_9fa48("86913"), 'MessageGroupServiceRowOwner requires replicaId'),
  UPSERT_REQUIRED: stryMutAct_9fa48("86914") ? "" : (stryCov_9fa48("86914"), 'MessageGroupServiceRowOwner requires upsertSystemTableRow for registration'),
  DELETE_REQUIRED: stryMutAct_9fa48("86915") ? "" : (stryCov_9fa48("86915"), 'MessageGroupServiceRowOwner requires deleteSystemTableRow for removal')
}));
const SERVICE_ROW_UPDATE_OPTION = Object.freeze(stryMutAct_9fa48("86916") ? {} : (stryCov_9fa48("86916"), {
  allowCoalescing: stryMutAct_9fa48("86917") ? false : (stryCov_9fa48("86917"), true),
  allowPressureDefer: stryMutAct_9fa48("86918") ? false : (stryCov_9fa48("86918"), true),
  deliveryPriority: stryMutAct_9fa48("86919") ? "" : (stryCov_9fa48("86919"), 'background'),
  pressureRetryAfterMs: 250,
  skipCacheWait: stryMutAct_9fa48("86920") ? false : (stryCov_9fa48("86920"), true),
  workClass: stryMutAct_9fa48("86921") ? "" : (stryCov_9fa48("86921"), 'background')
}));
function assertRequiredString(value, errorMessage) {
  if (stryMutAct_9fa48("86922")) {
    {}
  } else {
    stryCov_9fa48("86922");
    if (stryMutAct_9fa48("86925") ? typeof value !== TYPEOF.STRING && value.length === 0 : stryMutAct_9fa48("86924") ? false : stryMutAct_9fa48("86923") ? true : (stryCov_9fa48("86923", "86924", "86925"), (stryMutAct_9fa48("86927") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("86926") ? false : (stryCov_9fa48("86926", "86927"), typeof value !== TYPEOF.STRING)) || (stryMutAct_9fa48("86929") ? value.length !== 0 : stryMutAct_9fa48("86928") ? false : (stryCov_9fa48("86928", "86929"), value.length === 0)))) {
      if (stryMutAct_9fa48("86930")) {
        {}
      } else {
        stryCov_9fa48("86930");
        throw new Error(errorMessage);
      }
    }
  }
}
function resolveMessageGroupRaftRole(service) {
  if (stryMutAct_9fa48("86931")) {
    {}
  } else {
    stryCov_9fa48("86931");
    const isLeader = stryMutAct_9fa48("86934") ? service?.isLeader === true && typeof service?.isLeaderReplica === TYPEOF.FUNCTION && service.isLeaderReplica() : stryMutAct_9fa48("86933") ? false : stryMutAct_9fa48("86932") ? true : (stryCov_9fa48("86932", "86933", "86934"), (stryMutAct_9fa48("86936") ? service?.isLeader !== true : stryMutAct_9fa48("86935") ? false : (stryCov_9fa48("86935", "86936"), (stryMutAct_9fa48("86937") ? service.isLeader : (stryCov_9fa48("86937"), service?.isLeader)) === (stryMutAct_9fa48("86938") ? false : (stryCov_9fa48("86938"), true)))) || (stryMutAct_9fa48("86940") ? typeof service?.isLeaderReplica === TYPEOF.FUNCTION || service.isLeaderReplica() : stryMutAct_9fa48("86939") ? false : (stryCov_9fa48("86939", "86940"), (stryMutAct_9fa48("86942") ? typeof service?.isLeaderReplica !== TYPEOF.FUNCTION : stryMutAct_9fa48("86941") ? true : (stryCov_9fa48("86941", "86942"), typeof (stryMutAct_9fa48("86943") ? service.isLeaderReplica : (stryCov_9fa48("86943"), service?.isLeaderReplica)) === TYPEOF.FUNCTION)) && service.isLeaderReplica())));
    if (stryMutAct_9fa48("86945") ? false : stryMutAct_9fa48("86944") ? true : (stryCov_9fa48("86944", "86945"), isLeader)) {
      if (stryMutAct_9fa48("86946")) {
        {}
      } else {
        stryCov_9fa48("86946");
        return RAFT_ROLE.LEADER;
      }
    }
    if (stryMutAct_9fa48("86949") ? typeof service?.getRole !== TYPEOF.FUNCTION : stryMutAct_9fa48("86948") ? false : stryMutAct_9fa48("86947") ? true : (stryCov_9fa48("86947", "86948", "86949"), typeof (stryMutAct_9fa48("86950") ? service.getRole : (stryCov_9fa48("86950"), service?.getRole)) === TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("86951")) {
        {}
      } else {
        stryCov_9fa48("86951");
        return normalizePublishedRaftRole(service.getRole());
      }
    }
    return normalizePublishedRaftRole(stryMutAct_9fa48("86952") ? service.role : (stryCov_9fa48("86952"), service?.role));
  }
}
class MessageGroupServiceRowOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("86953")) {
      {}
    } else {
      stryCov_9fa48("86953");
      this.systemTableWriter = stryMutAct_9fa48("86956") ? options.systemTableWriter && null : stryMutAct_9fa48("86955") ? false : stryMutAct_9fa48("86954") ? true : (stryCov_9fa48("86954", "86955", "86956"), options.systemTableWriter || null);
      this.now = (stryMutAct_9fa48("86959") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("86958") ? false : stryMutAct_9fa48("86957") ? true : (stryCov_9fa48("86957", "86958", "86959"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("86960") ? () => undefined : (stryCov_9fa48("86960"), () => Date.now());
    }
  }
  static buildServiceRow(options = {}) {
    if (stryMutAct_9fa48("86961")) {
      {}
    } else {
      stryCov_9fa48("86961");
      const {
        groupId,
        replicaId,
        nodeId,
        service = null,
        timestamp = Date.now(),
        status = SERVICE_STATUS.ACTIVE,
        extraFields = null
      } = options;
      assertRequiredString(groupId, MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.GROUP_ID_REQUIRED);
      assertRequiredString(replicaId, MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED);
      assertRequiredString(nodeId, MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.NODE_ID_REQUIRED);
      const address = AddressManager.getInstance().format(nodeId, ENTITY_TYPE.MESSAGE_GROUP, replicaId);
      return stryMutAct_9fa48("86962") ? {} : (stryCov_9fa48("86962"), {
        service_id: replicaId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: nodeId,
        partition_id: null,
        group_id: groupId,
        replica_id: replicaId,
        raft_role: resolveMessageGroupRaftRole(service),
        status,
        address,
        created_at: timestamp,
        updated_at: timestamp,
        ...(stryMutAct_9fa48("86965") ? extraFields && {} : stryMutAct_9fa48("86964") ? false : stryMutAct_9fa48("86963") ? true : (stryCov_9fa48("86963", "86964", "86965"), extraFields || {}))
      });
    }
  }
  buildDeferredUpdateOptions(serviceId) {
    if (stryMutAct_9fa48("86966")) {
      {}
    } else {
      stryCov_9fa48("86966");
      return stryMutAct_9fa48("86967") ? {} : (stryCov_9fa48("86967"), {
        ...SERVICE_ROW_UPDATE_OPTION,
        coalescingKey: stryMutAct_9fa48("86968") ? `` : (stryCov_9fa48("86968"), `services:${serviceId}`)
      });
    }
  }
  async registerReplica(options = {}) {
    if (stryMutAct_9fa48("86969")) {
      {}
    } else {
      stryCov_9fa48("86969");
      if (stryMutAct_9fa48("86972") ? !this.systemTableWriter && typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("86971") ? false : stryMutAct_9fa48("86970") ? true : (stryCov_9fa48("86970", "86971", "86972"), (stryMutAct_9fa48("86973") ? this.systemTableWriter : (stryCov_9fa48("86973"), !this.systemTableWriter)) || (stryMutAct_9fa48("86975") ? typeof this.systemTableWriter.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("86974") ? false : (stryCov_9fa48("86974", "86975"), typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("86976")) {
          {}
        } else {
          stryCov_9fa48("86976");
          throw new Error(MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED);
        }
      }
      const row = MessageGroupServiceRowOwner.buildServiceRow(stryMutAct_9fa48("86977") ? {} : (stryCov_9fa48("86977"), {
        ...options,
        timestamp: stryMutAct_9fa48("86978") ? options.timestamp && this.now() : (stryCov_9fa48("86978"), options.timestamp ?? this.now())
      }));
      await this.systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, row);
      return row;
    }
  }
  async activateReplica(options = {}) {
    if (stryMutAct_9fa48("86979")) {
      {}
    } else {
      stryCov_9fa48("86979");
      return this.updateReplicaStatus(stryMutAct_9fa48("86980") ? {} : (stryCov_9fa48("86980"), {
        ...options,
        status: SERVICE_STATUS.ACTIVE
      }));
    }
  }
  async updateReplicaStatus(options = {}) {
    if (stryMutAct_9fa48("86981")) {
      {}
    } else {
      stryCov_9fa48("86981");
      if (stryMutAct_9fa48("86984") ? !this.systemTableWriter && typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("86983") ? false : stryMutAct_9fa48("86982") ? true : (stryCov_9fa48("86982", "86983", "86984"), (stryMutAct_9fa48("86985") ? this.systemTableWriter : (stryCov_9fa48("86985"), !this.systemTableWriter)) || (stryMutAct_9fa48("86987") ? typeof this.systemTableWriter.upsertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("86986") ? false : (stryCov_9fa48("86986", "86987"), typeof this.systemTableWriter.upsertSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("86988")) {
          {}
        } else {
          stryCov_9fa48("86988");
          throw new Error(MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.UPSERT_REQUIRED);
        }
      }
      const row = MessageGroupServiceRowOwner.buildServiceRow(stryMutAct_9fa48("86989") ? {} : (stryCov_9fa48("86989"), {
        ...options,
        timestamp: stryMutAct_9fa48("86990") ? options.timestamp && this.now() : (stryCov_9fa48("86990"), options.timestamp ?? this.now())
      }));
      if (stryMutAct_9fa48("86993") ? typeof this.systemTableWriter.updateSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("86992") ? false : stryMutAct_9fa48("86991") ? true : (stryCov_9fa48("86991", "86992", "86993"), typeof this.systemTableWriter.updateSystemTableRow !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("86994")) {
          {}
        } else {
          stryCov_9fa48("86994");
          await this.systemTableWriter.upsertSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, row, this.buildDeferredUpdateOptions(row.service_id));
          return row;
        }
      }
      const {
        created_at: _createdAt,
        ...updates
      } = row;
      await this.systemTableWriter.updateSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("86995") ? {} : (stryCov_9fa48("86995"), {
        service_id: row.service_id,
        service_type: row.service_type
      }), updates, this.buildDeferredUpdateOptions(row.service_id));
      return row;
    }
  }
  async removeReplica(options = {}) {
    if (stryMutAct_9fa48("86996")) {
      {}
    } else {
      stryCov_9fa48("86996");
      if (stryMutAct_9fa48("86999") ? !this.systemTableWriter && typeof this.systemTableWriter.deleteSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("86998") ? false : stryMutAct_9fa48("86997") ? true : (stryCov_9fa48("86997", "86998", "86999"), (stryMutAct_9fa48("87000") ? this.systemTableWriter : (stryCov_9fa48("87000"), !this.systemTableWriter)) || (stryMutAct_9fa48("87002") ? typeof this.systemTableWriter.deleteSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("87001") ? false : (stryCov_9fa48("87001", "87002"), typeof this.systemTableWriter.deleteSystemTableRow !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("87003")) {
          {}
        } else {
          stryCov_9fa48("87003");
          throw new Error(MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.DELETE_REQUIRED);
        }
      }
      const {
        replicaId,
        nodeId
      } = options;
      assertRequiredString(replicaId, MESSAGE_GROUP_SERVICE_ROW_OWNER_ERROR.REPLICA_ID_REQUIRED);
      const whereClause = stryMutAct_9fa48("87004") ? {} : (stryCov_9fa48("87004"), {
        service_id: replicaId,
        service_type: SERVICE_TYPE.MESSAGE_GROUP
      });
      if (stryMutAct_9fa48("87007") ? typeof nodeId === TYPEOF.STRING || nodeId.length > 0 : stryMutAct_9fa48("87006") ? false : stryMutAct_9fa48("87005") ? true : (stryCov_9fa48("87005", "87006", "87007"), (stryMutAct_9fa48("87009") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("87008") ? true : (stryCov_9fa48("87008", "87009"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("87012") ? nodeId.length <= 0 : stryMutAct_9fa48("87011") ? nodeId.length >= 0 : stryMutAct_9fa48("87010") ? true : (stryCov_9fa48("87010", "87011", "87012"), nodeId.length > 0)))) {
        if (stryMutAct_9fa48("87013")) {
          {}
        } else {
          stryCov_9fa48("87013");
          whereClause.node_id = nodeId;
        }
      }
      await this.systemTableWriter.deleteSystemTableRow(SYSTEM_TABLE_NAME.SERVICES, whereClause);
    }
  }
}
export { MessageGroupServiceRowOwner };