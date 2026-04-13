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
import { COLUMN, NUM, TYPEOF } from '../constants/index.js';
function normalizeNodeId(value) {
  if (stryMutAct_9fa48("6905")) {
    {}
  } else {
    stryCov_9fa48("6905");
    if (stryMutAct_9fa48("6908") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("6907") ? false : stryMutAct_9fa48("6906") ? true : (stryCov_9fa48("6906", "6907", "6908"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("6909")) {
        {}
      } else {
        stryCov_9fa48("6909");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("6910") ? value : (stryCov_9fa48("6910"), value.trim());
    return (stryMutAct_9fa48("6914") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("6913") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("6912") ? false : stryMutAct_9fa48("6911") ? true : (stryCov_9fa48("6911", "6912", "6913", "6914"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function normalizeNonEmptyString(value) {
  if (stryMutAct_9fa48("6915")) {
    {}
  } else {
    stryCov_9fa48("6915");
    if (stryMutAct_9fa48("6918") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("6917") ? false : stryMutAct_9fa48("6916") ? true : (stryCov_9fa48("6916", "6917", "6918"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("6919")) {
        {}
      } else {
        stryCov_9fa48("6919");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("6920") ? value : (stryCov_9fa48("6920"), value.trim());
    return (stryMutAct_9fa48("6924") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("6923") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("6922") ? false : stryMutAct_9fa48("6921") ? true : (stryCov_9fa48("6921", "6922", "6923", "6924"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function normalizeLowerString(value) {
  if (stryMutAct_9fa48("6925")) {
    {}
  } else {
    stryCov_9fa48("6925");
    if (stryMutAct_9fa48("6928") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("6927") ? false : stryMutAct_9fa48("6926") ? true : (stryCov_9fa48("6926", "6927", "6928"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("6929")) {
        {}
      } else {
        stryCov_9fa48("6929");
        return null;
      }
    }
    const normalized = stryMutAct_9fa48("6931") ? value.toLowerCase() : stryMutAct_9fa48("6930") ? value.trim().toUpperCase() : (stryCov_9fa48("6930", "6931"), value.trim().toLowerCase());
    return (stryMutAct_9fa48("6935") ? normalized.length <= NUM.ZERO : stryMutAct_9fa48("6934") ? normalized.length >= NUM.ZERO : stryMutAct_9fa48("6933") ? false : stryMutAct_9fa48("6932") ? true : (stryCov_9fa48("6932", "6933", "6934", "6935"), normalized.length > NUM.ZERO)) ? normalized : null;
  }
}
function collectNodeIds(rows, fieldCandidates, predicate = null) {
  if (stryMutAct_9fa48("6936")) {
    {}
  } else {
    stryCov_9fa48("6936");
    const nodeIds = new Set();
    const normalizedRows = Array.isArray(rows) ? rows : stryMutAct_9fa48("6937") ? ["Stryker was here"] : (stryCov_9fa48("6937"), []);
    for (const row of normalizedRows) {
      if (stryMutAct_9fa48("6938")) {
        {}
      } else {
        stryCov_9fa48("6938");
        if (stryMutAct_9fa48("6941") ? predicate || predicate(row) !== true : stryMutAct_9fa48("6940") ? false : stryMutAct_9fa48("6939") ? true : (stryCov_9fa48("6939", "6940", "6941"), predicate && (stryMutAct_9fa48("6943") ? predicate(row) === true : stryMutAct_9fa48("6942") ? true : (stryCov_9fa48("6942", "6943"), predicate(row) !== (stryMutAct_9fa48("6944") ? false : (stryCov_9fa48("6944"), true)))))) {
          if (stryMutAct_9fa48("6945")) {
            {}
          } else {
            stryCov_9fa48("6945");
            continue;
          }
        }
        for (const fieldName of fieldCandidates) {
          if (stryMutAct_9fa48("6946")) {
            {}
          } else {
            stryCov_9fa48("6946");
            const nodeId = normalizeNodeId(stryMutAct_9fa48("6947") ? row[fieldName] : (stryCov_9fa48("6947"), row?.[fieldName]));
            if (stryMutAct_9fa48("6949") ? false : stryMutAct_9fa48("6948") ? true : (stryCov_9fa48("6948", "6949"), nodeId)) {
              if (stryMutAct_9fa48("6950")) {
                {}
              } else {
                stryCov_9fa48("6950");
                nodeIds.add(nodeId);
                break;
              }
            }
          }
        }
      }
    }
    return nodeIds;
  }
}
function isActiveServiceRow(row) {
  if (stryMutAct_9fa48("6951")) {
    {}
  } else {
    stryCov_9fa48("6951");
    const status = normalizeLowerString(stryMutAct_9fa48("6952") ? row?.[COLUMN.STATUS] && row?.status : (stryCov_9fa48("6952"), (stryMutAct_9fa48("6953") ? row[COLUMN.STATUS] : (stryCov_9fa48("6953"), row?.[COLUMN.STATUS])) ?? (stryMutAct_9fa48("6954") ? row.status : (stryCov_9fa48("6954"), row?.status))));
    return stryMutAct_9fa48("6957") ? status !== 'active' : stryMutAct_9fa48("6956") ? false : stryMutAct_9fa48("6955") ? true : (stryCov_9fa48("6955", "6956", "6957"), status === (stryMutAct_9fa48("6958") ? "" : (stryCov_9fa48("6958"), 'active')));
  }
}
function isActiveEndpointRow(row) {
  if (stryMutAct_9fa48("6959")) {
    {}
  } else {
    stryCov_9fa48("6959");
    const status = normalizeLowerString(stryMutAct_9fa48("6960") ? row?.[COLUMN.STATUS] && row?.status : (stryCov_9fa48("6960"), (stryMutAct_9fa48("6961") ? row[COLUMN.STATUS] : (stryCov_9fa48("6961"), row?.[COLUMN.STATUS])) ?? (stryMutAct_9fa48("6962") ? row.status : (stryCov_9fa48("6962"), row?.status))));
    return stryMutAct_9fa48("6965") ? status === 'active' && status === null : stryMutAct_9fa48("6964") ? false : stryMutAct_9fa48("6963") ? true : (stryCov_9fa48("6963", "6964", "6965"), (stryMutAct_9fa48("6967") ? status !== 'active' : stryMutAct_9fa48("6966") ? false : (stryCov_9fa48("6966", "6967"), status === (stryMutAct_9fa48("6968") ? "" : (stryCov_9fa48("6968"), 'active')))) || (stryMutAct_9fa48("6970") ? status !== null : stryMutAct_9fa48("6969") ? false : (stryCov_9fa48("6969", "6970"), status === null)));
  }
}
function sortNodeIds(nodeIds) {
  if (stryMutAct_9fa48("6971")) {
    {}
  } else {
    stryCov_9fa48("6971");
    return stryMutAct_9fa48("6972") ? [...nodeIds] : (stryCov_9fa48("6972"), (stryMutAct_9fa48("6973") ? [] : (stryCov_9fa48("6973"), [...nodeIds])).sort(stryMutAct_9fa48("6974") ? () => undefined : (stryCov_9fa48("6974"), (left, right) => left.localeCompare(right))));
  }
}
function hasUsableAddress(row) {
  if (stryMutAct_9fa48("6975")) {
    {}
  } else {
    stryCov_9fa48("6975");
    return stryMutAct_9fa48("6978") ? normalizeNonEmptyString(row?.[COLUMN.ADDRESS] ?? row?.address) === null : stryMutAct_9fa48("6977") ? false : stryMutAct_9fa48("6976") ? true : (stryCov_9fa48("6976", "6977", "6978"), normalizeNonEmptyString(stryMutAct_9fa48("6979") ? row?.[COLUMN.ADDRESS] && row?.address : (stryCov_9fa48("6979"), (stryMutAct_9fa48("6980") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("6980"), row?.[COLUMN.ADDRESS])) ?? (stryMutAct_9fa48("6981") ? row.address : (stryCov_9fa48("6981"), row?.address)))) !== null);
  }
}
function isPartitionServiceRow(row) {
  if (stryMutAct_9fa48("6982")) {
    {}
  } else {
    stryCov_9fa48("6982");
    const serviceType = normalizeLowerString(stryMutAct_9fa48("6983") ? (row?.[COLUMN.SERVICE_TYPE] ?? row?.service_type) && row?.serviceType : (stryCov_9fa48("6983"), (stryMutAct_9fa48("6984") ? row?.[COLUMN.SERVICE_TYPE] && row?.service_type : (stryCov_9fa48("6984"), (stryMutAct_9fa48("6985") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("6985"), row?.[COLUMN.SERVICE_TYPE])) ?? (stryMutAct_9fa48("6986") ? row.service_type : (stryCov_9fa48("6986"), row?.service_type)))) ?? (stryMutAct_9fa48("6987") ? row.serviceType : (stryCov_9fa48("6987"), row?.serviceType))));
    return stryMutAct_9fa48("6990") ? serviceType === null && serviceType === 'partition' : stryMutAct_9fa48("6989") ? false : stryMutAct_9fa48("6988") ? true : (stryCov_9fa48("6988", "6989", "6990"), (stryMutAct_9fa48("6992") ? serviceType !== null : stryMutAct_9fa48("6991") ? false : (stryCov_9fa48("6991", "6992"), serviceType === null)) || (stryMutAct_9fa48("6994") ? serviceType !== 'partition' : stryMutAct_9fa48("6993") ? false : (stryCov_9fa48("6993", "6994"), serviceType === (stryMutAct_9fa48("6995") ? "" : (stryCov_9fa48("6995"), 'partition')))));
  }
}
function evaluatePartitionReplicaTopology(options = {}) {
  if (stryMutAct_9fa48("6996")) {
    {}
  } else {
    stryCov_9fa48("6996");
    const partitionRow = (stryMutAct_9fa48("6999") ? options.partitionRow || typeof options.partitionRow === TYPEOF.OBJECT : stryMutAct_9fa48("6998") ? false : stryMutAct_9fa48("6997") ? true : (stryCov_9fa48("6997", "6998", "6999"), options.partitionRow && (stryMutAct_9fa48("7001") ? typeof options.partitionRow !== TYPEOF.OBJECT : stryMutAct_9fa48("7000") ? true : (stryCov_9fa48("7000", "7001"), typeof options.partitionRow === TYPEOF.OBJECT)))) ? options.partitionRow : null;
    const partitionId = normalizeNonEmptyString(stryMutAct_9fa48("7002") ? (partitionRow?.[COLUMN.PARTITION_ID] ?? partitionRow?.partition_id) && partitionRow?.partitionId : (stryCov_9fa48("7002"), (stryMutAct_9fa48("7003") ? partitionRow?.[COLUMN.PARTITION_ID] && partitionRow?.partition_id : (stryCov_9fa48("7003"), (stryMutAct_9fa48("7004") ? partitionRow[COLUMN.PARTITION_ID] : (stryCov_9fa48("7004"), partitionRow?.[COLUMN.PARTITION_ID])) ?? (stryMutAct_9fa48("7005") ? partitionRow.partition_id : (stryCov_9fa48("7005"), partitionRow?.partition_id)))) ?? (stryMutAct_9fa48("7006") ? partitionRow.partitionId : (stryCov_9fa48("7006"), partitionRow?.partitionId))));
    const leaderNodeId = normalizeNodeId(stryMutAct_9fa48("7007") ? (partitionRow?.[COLUMN.LEADER_NODE_ID] ?? partitionRow?.leader_node_id) && partitionRow?.leaderNodeId : (stryCov_9fa48("7007"), (stryMutAct_9fa48("7008") ? partitionRow?.[COLUMN.LEADER_NODE_ID] && partitionRow?.leader_node_id : (stryCov_9fa48("7008"), (stryMutAct_9fa48("7009") ? partitionRow[COLUMN.LEADER_NODE_ID] : (stryCov_9fa48("7009"), partitionRow?.[COLUMN.LEADER_NODE_ID])) ?? (stryMutAct_9fa48("7010") ? partitionRow.leader_node_id : (stryCov_9fa48("7010"), partitionRow?.leader_node_id)))) ?? (stryMutAct_9fa48("7011") ? partitionRow.leaderNodeId : (stryCov_9fa48("7011"), partitionRow?.leaderNodeId))));
    const desiredReplicaCount = Number(stryMutAct_9fa48("7012") ? (partitionRow?.[COLUMN.REPLICA_COUNT] ?? partitionRow?.replica_count ?? partitionRow?.replicaCount) && NUM.ZERO : (stryCov_9fa48("7012"), (stryMutAct_9fa48("7013") ? (partitionRow?.[COLUMN.REPLICA_COUNT] ?? partitionRow?.replica_count) && partitionRow?.replicaCount : (stryCov_9fa48("7013"), (stryMutAct_9fa48("7014") ? partitionRow?.[COLUMN.REPLICA_COUNT] && partitionRow?.replica_count : (stryCov_9fa48("7014"), (stryMutAct_9fa48("7015") ? partitionRow[COLUMN.REPLICA_COUNT] : (stryCov_9fa48("7015"), partitionRow?.[COLUMN.REPLICA_COUNT])) ?? (stryMutAct_9fa48("7016") ? partitionRow.replica_count : (stryCov_9fa48("7016"), partitionRow?.replica_count)))) ?? (stryMutAct_9fa48("7017") ? partitionRow.replicaCount : (stryCov_9fa48("7017"), partitionRow?.replicaCount)))) ?? NUM.ZERO));
    const requiresAddress = stryMutAct_9fa48("7020") ? options.requiresAddress !== true : stryMutAct_9fa48("7019") ? false : stryMutAct_9fa48("7018") ? true : (stryCov_9fa48("7018", "7019", "7020"), options.requiresAddress === (stryMutAct_9fa48("7021") ? false : (stryCov_9fa48("7021"), true)));
    const requireLeaderNodeId = stryMutAct_9fa48("7024") ? options.requireLeaderNodeId !== true : stryMutAct_9fa48("7023") ? false : stryMutAct_9fa48("7022") ? true : (stryCov_9fa48("7022", "7023", "7024"), options.requireLeaderNodeId === (stryMutAct_9fa48("7025") ? false : (stryCov_9fa48("7025"), true)));
    const matchingServiceRows = stryMutAct_9fa48("7028") ? (Array.isArray(options.serviceRows) ? options.serviceRows : []).filter(row => isActiveServiceRow(row)).filter(row => {
      if (!partitionId) {
        return true;
      }
      return normalizeNonEmptyString(row?.[COLUMN.PARTITION_ID] ?? row?.partition_id ?? row?.partitionId) === partitionId;
    }) : stryMutAct_9fa48("7027") ? (Array.isArray(options.serviceRows) ? options.serviceRows : []).filter(row => isPartitionServiceRow(row)).filter(row => {
      if (!partitionId) {
        return true;
      }
      return normalizeNonEmptyString(row?.[COLUMN.PARTITION_ID] ?? row?.partition_id ?? row?.partitionId) === partitionId;
    }) : stryMutAct_9fa48("7026") ? (Array.isArray(options.serviceRows) ? options.serviceRows : []).filter(row => isPartitionServiceRow(row)).filter(row => isActiveServiceRow(row)) : (stryCov_9fa48("7026", "7027", "7028"), (Array.isArray(options.serviceRows) ? options.serviceRows : stryMutAct_9fa48("7029") ? ["Stryker was here"] : (stryCov_9fa48("7029"), [])).filter(stryMutAct_9fa48("7030") ? () => undefined : (stryCov_9fa48("7030"), row => isPartitionServiceRow(row))).filter(stryMutAct_9fa48("7031") ? () => undefined : (stryCov_9fa48("7031"), row => isActiveServiceRow(row))).filter(row => {
      if (stryMutAct_9fa48("7032")) {
        {}
      } else {
        stryCov_9fa48("7032");
        if (stryMutAct_9fa48("7035") ? false : stryMutAct_9fa48("7034") ? true : stryMutAct_9fa48("7033") ? partitionId : (stryCov_9fa48("7033", "7034", "7035"), !partitionId)) {
          if (stryMutAct_9fa48("7036")) {
            {}
          } else {
            stryCov_9fa48("7036");
            return stryMutAct_9fa48("7037") ? false : (stryCov_9fa48("7037"), true);
          }
        }
        return stryMutAct_9fa48("7040") ? normalizeNonEmptyString(row?.[COLUMN.PARTITION_ID] ?? row?.partition_id ?? row?.partitionId) !== partitionId : stryMutAct_9fa48("7039") ? false : stryMutAct_9fa48("7038") ? true : (stryCov_9fa48("7038", "7039", "7040"), normalizeNonEmptyString(stryMutAct_9fa48("7041") ? (row?.[COLUMN.PARTITION_ID] ?? row?.partition_id) && row?.partitionId : (stryCov_9fa48("7041"), (stryMutAct_9fa48("7042") ? row?.[COLUMN.PARTITION_ID] && row?.partition_id : (stryCov_9fa48("7042"), (stryMutAct_9fa48("7043") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("7043"), row?.[COLUMN.PARTITION_ID])) ?? (stryMutAct_9fa48("7044") ? row.partition_id : (stryCov_9fa48("7044"), row?.partition_id)))) ?? (stryMutAct_9fa48("7045") ? row.partitionId : (stryCov_9fa48("7045"), row?.partitionId)))) === partitionId);
      }
    }));
    const activeReplicaNodeIds = sortNodeIds(collectNodeIds(matchingServiceRows, stryMutAct_9fa48("7046") ? [] : (stryCov_9fa48("7046"), [COLUMN.NODE_ID, stryMutAct_9fa48("7047") ? "" : (stryCov_9fa48("7047"), 'node_id'), stryMutAct_9fa48("7048") ? "" : (stryCov_9fa48("7048"), 'nodeId')])));
    const leaderRoleNodeIds = sortNodeIds(collectNodeIds(matchingServiceRows, stryMutAct_9fa48("7049") ? [] : (stryCov_9fa48("7049"), [COLUMN.NODE_ID, stryMutAct_9fa48("7050") ? "" : (stryCov_9fa48("7050"), 'node_id'), stryMutAct_9fa48("7051") ? "" : (stryCov_9fa48("7051"), 'nodeId')]), row => {
      if (stryMutAct_9fa48("7052")) {
        {}
      } else {
        stryCov_9fa48("7052");
        if (stryMutAct_9fa48("7055") ? requiresAddress || hasUsableAddress(row) !== true : stryMutAct_9fa48("7054") ? false : stryMutAct_9fa48("7053") ? true : (stryCov_9fa48("7053", "7054", "7055"), requiresAddress && (stryMutAct_9fa48("7057") ? hasUsableAddress(row) === true : stryMutAct_9fa48("7056") ? true : (stryCov_9fa48("7056", "7057"), hasUsableAddress(row) !== (stryMutAct_9fa48("7058") ? false : (stryCov_9fa48("7058"), true)))))) {
          if (stryMutAct_9fa48("7059")) {
            {}
          } else {
            stryCov_9fa48("7059");
            return stryMutAct_9fa48("7060") ? true : (stryCov_9fa48("7060"), false);
          }
        }
        return stryMutAct_9fa48("7063") ? normalizeLowerString(row?.[COLUMN.RAFT_ROLE] ?? row?.raft_role ?? row?.raftRole) !== 'leader' : stryMutAct_9fa48("7062") ? false : stryMutAct_9fa48("7061") ? true : (stryCov_9fa48("7061", "7062", "7063"), normalizeLowerString(stryMutAct_9fa48("7064") ? (row?.[COLUMN.RAFT_ROLE] ?? row?.raft_role) && row?.raftRole : (stryCov_9fa48("7064"), (stryMutAct_9fa48("7065") ? row?.[COLUMN.RAFT_ROLE] && row?.raft_role : (stryCov_9fa48("7065"), (stryMutAct_9fa48("7066") ? row[COLUMN.RAFT_ROLE] : (stryCov_9fa48("7066"), row?.[COLUMN.RAFT_ROLE])) ?? (stryMutAct_9fa48("7067") ? row.raft_role : (stryCov_9fa48("7067"), row?.raft_role)))) ?? (stryMutAct_9fa48("7068") ? row.raftRole : (stryCov_9fa48("7068"), row?.raftRole)))) === (stryMutAct_9fa48("7069") ? "" : (stryCov_9fa48("7069"), 'leader')));
      }
    }));
    const canonicalLeaderReplica = leaderNodeId ? activeReplicaNodeIds.includes(leaderNodeId) : stryMutAct_9fa48("7070") ? true : (stryCov_9fa48("7070"), false);
    const leaderServiceVisible = stryMutAct_9fa48("7074") ? leaderRoleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("7073") ? leaderRoleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("7072") ? false : stryMutAct_9fa48("7071") ? true : (stryCov_9fa48("7071", "7072", "7073", "7074"), leaderRoleNodeIds.length > NUM.ZERO);
    const leaderKnown = stryMutAct_9fa48("7077") ? canonicalLeaderReplica && leaderServiceVisible : stryMutAct_9fa48("7076") ? false : stryMutAct_9fa48("7075") ? true : (stryCov_9fa48("7075", "7076", "7077"), canonicalLeaderReplica || leaderServiceVisible);
    const hasLeaderMetadata = stryMutAct_9fa48("7080") ? Boolean(leaderNodeId) && leaderRoleNodeIds.length > NUM.ZERO : stryMutAct_9fa48("7079") ? false : stryMutAct_9fa48("7078") ? true : (stryCov_9fa48("7078", "7079", "7080"), Boolean(leaderNodeId) || (stryMutAct_9fa48("7083") ? leaderRoleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("7082") ? leaderRoleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("7081") ? false : (stryCov_9fa48("7081", "7082", "7083"), leaderRoleNodeIds.length > NUM.ZERO)));
    const overTargetReplicaCount = stryMutAct_9fa48("7086") ? Number.isInteger(desiredReplicaCount) && desiredReplicaCount > NUM.ZERO || activeReplicaNodeIds.length > desiredReplicaCount : stryMutAct_9fa48("7085") ? false : stryMutAct_9fa48("7084") ? true : (stryCov_9fa48("7084", "7085", "7086"), (stryMutAct_9fa48("7088") ? Number.isInteger(desiredReplicaCount) || desiredReplicaCount > NUM.ZERO : stryMutAct_9fa48("7087") ? true : (stryCov_9fa48("7087", "7088"), Number.isInteger(desiredReplicaCount) && (stryMutAct_9fa48("7091") ? desiredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("7090") ? desiredReplicaCount >= NUM.ZERO : stryMutAct_9fa48("7089") ? true : (stryCov_9fa48("7089", "7090", "7091"), desiredReplicaCount > NUM.ZERO)))) && (stryMutAct_9fa48("7094") ? activeReplicaNodeIds.length <= desiredReplicaCount : stryMutAct_9fa48("7093") ? activeReplicaNodeIds.length >= desiredReplicaCount : stryMutAct_9fa48("7092") ? true : (stryCov_9fa48("7092", "7093", "7094"), activeReplicaNodeIds.length > desiredReplicaCount)));
    const missingLeaderNodeId = stryMutAct_9fa48("7097") ? requireLeaderNodeId && !leaderNodeId || activeReplicaNodeIds.length > NUM.ZERO : stryMutAct_9fa48("7096") ? false : stryMutAct_9fa48("7095") ? true : (stryCov_9fa48("7095", "7096", "7097"), (stryMutAct_9fa48("7099") ? requireLeaderNodeId || !leaderNodeId : stryMutAct_9fa48("7098") ? true : (stryCov_9fa48("7098", "7099"), requireLeaderNodeId && (stryMutAct_9fa48("7100") ? leaderNodeId : (stryCov_9fa48("7100"), !leaderNodeId)))) && (stryMutAct_9fa48("7103") ? activeReplicaNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("7102") ? activeReplicaNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("7101") ? true : (stryCov_9fa48("7101", "7102", "7103"), activeReplicaNodeIds.length > NUM.ZERO)));
    let lastErrorCode = null;
    if (stryMutAct_9fa48("7105") ? false : stryMutAct_9fa48("7104") ? true : (stryCov_9fa48("7104", "7105"), missingLeaderNodeId)) {
      if (stryMutAct_9fa48("7106")) {
        {}
      } else {
        stryCov_9fa48("7106");
        lastErrorCode = stryMutAct_9fa48("7107") ? "" : (stryCov_9fa48("7107"), 'leader_node_id_missing');
      }
    } else if (stryMutAct_9fa48("7110") ? hasLeaderMetadata && activeReplicaNodeIds.length > NUM.ZERO || leaderKnown !== true : stryMutAct_9fa48("7109") ? false : stryMutAct_9fa48("7108") ? true : (stryCov_9fa48("7108", "7109", "7110"), (stryMutAct_9fa48("7112") ? hasLeaderMetadata || activeReplicaNodeIds.length > NUM.ZERO : stryMutAct_9fa48("7111") ? true : (stryCov_9fa48("7111", "7112"), hasLeaderMetadata && (stryMutAct_9fa48("7115") ? activeReplicaNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("7114") ? activeReplicaNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("7113") ? true : (stryCov_9fa48("7113", "7114", "7115"), activeReplicaNodeIds.length > NUM.ZERO)))) && (stryMutAct_9fa48("7117") ? leaderKnown === true : stryMutAct_9fa48("7116") ? true : (stryCov_9fa48("7116", "7117"), leaderKnown !== (stryMutAct_9fa48("7118") ? false : (stryCov_9fa48("7118"), true)))))) {
      if (stryMutAct_9fa48("7119")) {
        {}
      } else {
        stryCov_9fa48("7119");
        lastErrorCode = stryMutAct_9fa48("7120") ? "" : (stryCov_9fa48("7120"), 'leader_service_missing');
      }
    }
    const topologyState = (stryMutAct_9fa48("7123") ? overTargetReplicaCount && lastErrorCode : stryMutAct_9fa48("7122") ? false : stryMutAct_9fa48("7121") ? true : (stryCov_9fa48("7121", "7122", "7123"), overTargetReplicaCount || lastErrorCode)) ? stryMutAct_9fa48("7124") ? "" : (stryCov_9fa48("7124"), 'invalid') : leaderKnown ? stryMutAct_9fa48("7125") ? "" : (stryCov_9fa48("7125"), 'routable') : stryMutAct_9fa48("7126") ? "" : (stryCov_9fa48("7126"), 'opaque');
    return Object.freeze(stryMutAct_9fa48("7127") ? {} : (stryCov_9fa48("7127"), {
      partitionId,
      leaderNodeId,
      desiredReplicaCount: (stryMutAct_9fa48("7130") ? Number.isInteger(desiredReplicaCount) || desiredReplicaCount > NUM.ZERO : stryMutAct_9fa48("7129") ? false : stryMutAct_9fa48("7128") ? true : (stryCov_9fa48("7128", "7129", "7130"), Number.isInteger(desiredReplicaCount) && (stryMutAct_9fa48("7133") ? desiredReplicaCount <= NUM.ZERO : stryMutAct_9fa48("7132") ? desiredReplicaCount >= NUM.ZERO : stryMutAct_9fa48("7131") ? true : (stryCov_9fa48("7131", "7132", "7133"), desiredReplicaCount > NUM.ZERO)))) ? desiredReplicaCount : null,
      activeReplicaNodeIds: Object.freeze(activeReplicaNodeIds),
      observedReplicaCount: activeReplicaNodeIds.length,
      leaderRoleNodeIds: Object.freeze(leaderRoleNodeIds),
      leaderServiceVisible,
      canonicalLeaderReplica,
      leaderKnown,
      overTargetReplicaCount,
      lastErrorCode,
      topologyState
    }));
  }
}
function evaluateSharedMetadataNodeCoverage(options = {}) {
  if (stryMutAct_9fa48("7134")) {
    {}
  } else {
    stryCov_9fa48("7134");
    const observedNodeIds = collectNodeIds(options.nodeRows, stryMutAct_9fa48("7135") ? [] : (stryCov_9fa48("7135"), [COLUMN.NODE_ID, stryMutAct_9fa48("7136") ? "" : (stryCov_9fa48("7136"), 'node_id'), stryMutAct_9fa48("7137") ? "" : (stryCov_9fa48("7137"), 'nodeId'), stryMutAct_9fa48("7138") ? "" : (stryCov_9fa48("7138"), 'id')]));
    const referencedNodeIds = new Set();
    for (const nodeId of collectNodeIds(options.serviceRows, stryMutAct_9fa48("7139") ? [] : (stryCov_9fa48("7139"), [COLUMN.NODE_ID, stryMutAct_9fa48("7140") ? "" : (stryCov_9fa48("7140"), 'node_id'), stryMutAct_9fa48("7141") ? "" : (stryCov_9fa48("7141"), 'nodeId')]), isActiveServiceRow)) {
      if (stryMutAct_9fa48("7142")) {
        {}
      } else {
        stryCov_9fa48("7142");
        referencedNodeIds.add(nodeId);
      }
    }
    for (const nodeId of collectNodeIds(options.nodeEndpointRows, stryMutAct_9fa48("7143") ? [] : (stryCov_9fa48("7143"), [COLUMN.NODE_ID, stryMutAct_9fa48("7144") ? "" : (stryCov_9fa48("7144"), 'node_id'), stryMutAct_9fa48("7145") ? "" : (stryCov_9fa48("7145"), 'nodeId')]), isActiveEndpointRow)) {
      if (stryMutAct_9fa48("7146")) {
        {}
      } else {
        stryCov_9fa48("7146");
        referencedNodeIds.add(nodeId);
      }
    }
    for (const nodeId of collectNodeIds(options.partitionRows, stryMutAct_9fa48("7147") ? [] : (stryCov_9fa48("7147"), [COLUMN.LEADER_NODE_ID, stryMutAct_9fa48("7148") ? "" : (stryCov_9fa48("7148"), 'leader_node_id'), stryMutAct_9fa48("7149") ? "" : (stryCov_9fa48("7149"), 'leaderNodeId')]))) {
      if (stryMutAct_9fa48("7150")) {
        {}
      } else {
        stryCov_9fa48("7150");
        referencedNodeIds.add(nodeId);
      }
    }
    const missingNodeIds = sortNodeIds(new Set(stryMutAct_9fa48("7151") ? [...referencedNodeIds] : (stryCov_9fa48("7151"), (stryMutAct_9fa48("7152") ? [] : (stryCov_9fa48("7152"), [...referencedNodeIds])).filter(stryMutAct_9fa48("7153") ? () => undefined : (stryCov_9fa48("7153"), nodeId => stryMutAct_9fa48("7154") ? observedNodeIds.has(nodeId) : (stryCov_9fa48("7154"), !observedNodeIds.has(nodeId)))))));
    return Object.freeze(stryMutAct_9fa48("7155") ? {} : (stryCov_9fa48("7155"), {
      hasCoverageGap: stryMutAct_9fa48("7159") ? missingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("7158") ? missingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("7157") ? false : stryMutAct_9fa48("7156") ? true : (stryCov_9fa48("7156", "7157", "7158", "7159"), missingNodeIds.length > NUM.ZERO),
      observedNodeIds: Object.freeze(sortNodeIds(observedNodeIds)),
      referencedNodeIds: Object.freeze(sortNodeIds(referencedNodeIds)),
      missingNodeIds: Object.freeze(missingNodeIds)
    }));
  }
}
export { evaluateSharedMetadataNodeCoverage };
export { evaluatePartitionReplicaTopology };