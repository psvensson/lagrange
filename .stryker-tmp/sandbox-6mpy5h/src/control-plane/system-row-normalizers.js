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
import { COLUMN, TABLES } from '../constants/index.js';
const CONTROL_PLANE_PUBLICATION_DEFAULT = Object.freeze(stryMutAct_9fa48("74791") ? {} : (stryCov_9fa48("74791"), {
  KIND: stryMutAct_9fa48("74792") ? "" : (stryCov_9fa48("74792"), 'cluster_membership'),
  STATUS: stryMutAct_9fa48("74793") ? "" : (stryCov_9fa48("74793"), 'OPEN')
}));
function readText(...values) {
  if (stryMutAct_9fa48("74794")) {
    {}
  } else {
    stryCov_9fa48("74794");
    for (const value of values) {
      if (stryMutAct_9fa48("74795")) {
        {}
      } else {
        stryCov_9fa48("74795");
        if (stryMutAct_9fa48("74798") ? typeof value === 'string' || value.length > 0 : stryMutAct_9fa48("74797") ? false : stryMutAct_9fa48("74796") ? true : (stryCov_9fa48("74796", "74797", "74798"), (stryMutAct_9fa48("74800") ? typeof value !== 'string' : stryMutAct_9fa48("74799") ? true : (stryCov_9fa48("74799", "74800"), typeof value === (stryMutAct_9fa48("74801") ? "" : (stryCov_9fa48("74801"), 'string')))) && (stryMutAct_9fa48("74804") ? value.length <= 0 : stryMutAct_9fa48("74803") ? value.length >= 0 : stryMutAct_9fa48("74802") ? true : (stryCov_9fa48("74802", "74803", "74804"), value.length > 0)))) {
          if (stryMutAct_9fa48("74805")) {
            {}
          } else {
            stryCov_9fa48("74805");
            return value;
          }
        }
        if (stryMutAct_9fa48("74808") ? value !== null || value !== undefined : stryMutAct_9fa48("74807") ? false : stryMutAct_9fa48("74806") ? true : (stryCov_9fa48("74806", "74807", "74808"), (stryMutAct_9fa48("74810") ? value === null : stryMutAct_9fa48("74809") ? true : (stryCov_9fa48("74809", "74810"), value !== null)) && (stryMutAct_9fa48("74812") ? value === undefined : stryMutAct_9fa48("74811") ? true : (stryCov_9fa48("74811", "74812"), value !== undefined)))) {
          if (stryMutAct_9fa48("74813")) {
            {}
          } else {
            stryCov_9fa48("74813");
            const normalized = String(value);
            if (stryMutAct_9fa48("74817") ? normalized.length <= 0 : stryMutAct_9fa48("74816") ? normalized.length >= 0 : stryMutAct_9fa48("74815") ? false : stryMutAct_9fa48("74814") ? true : (stryCov_9fa48("74814", "74815", "74816", "74817"), normalized.length > 0)) {
              if (stryMutAct_9fa48("74818")) {
                {}
              } else {
                stryCov_9fa48("74818");
                return normalized;
              }
            }
          }
        }
      }
    }
    return stryMutAct_9fa48("74819") ? "Stryker was here!" : (stryCov_9fa48("74819"), '');
  }
}
function readLowerText(...values) {
  if (stryMutAct_9fa48("74820")) {
    {}
  } else {
    stryCov_9fa48("74820");
    return stryMutAct_9fa48("74821") ? readText(...values).toUpperCase() : (stryCov_9fa48("74821"), readText(...values).toLowerCase());
  }
}
function readInteger(...values) {
  if (stryMutAct_9fa48("74822")) {
    {}
  } else {
    stryCov_9fa48("74822");
    for (const value of values) {
      if (stryMutAct_9fa48("74823")) {
        {}
      } else {
        stryCov_9fa48("74823");
        if (stryMutAct_9fa48("74826") ? (value === null || value === undefined) && value === '' : stryMutAct_9fa48("74825") ? false : stryMutAct_9fa48("74824") ? true : (stryCov_9fa48("74824", "74825", "74826"), (stryMutAct_9fa48("74828") ? value === null && value === undefined : stryMutAct_9fa48("74827") ? false : (stryCov_9fa48("74827", "74828"), (stryMutAct_9fa48("74830") ? value !== null : stryMutAct_9fa48("74829") ? false : (stryCov_9fa48("74829", "74830"), value === null)) || (stryMutAct_9fa48("74832") ? value !== undefined : stryMutAct_9fa48("74831") ? false : (stryCov_9fa48("74831", "74832"), value === undefined)))) || (stryMutAct_9fa48("74834") ? value !== '' : stryMutAct_9fa48("74833") ? false : (stryCov_9fa48("74833", "74834"), value === (stryMutAct_9fa48("74835") ? "Stryker was here!" : (stryCov_9fa48("74835"), '')))))) {
          if (stryMutAct_9fa48("74836")) {
            {}
          } else {
            stryCov_9fa48("74836");
            continue;
          }
        }
        const normalized = Number(value);
        if (stryMutAct_9fa48("74838") ? false : stryMutAct_9fa48("74837") ? true : (stryCov_9fa48("74837", "74838"), Number.isFinite(normalized))) {
          if (stryMutAct_9fa48("74839")) {
            {}
          } else {
            stryCov_9fa48("74839");
            return Math.trunc(normalized);
          }
        }
      }
    }
    return null;
  }
}
function readJsonValue(value, fallbackValue) {
  if (stryMutAct_9fa48("74840")) {
    {}
  } else {
    stryCov_9fa48("74840");
    if (stryMutAct_9fa48("74843") ? value === null && value === undefined : stryMutAct_9fa48("74842") ? false : stryMutAct_9fa48("74841") ? true : (stryCov_9fa48("74841", "74842", "74843"), (stryMutAct_9fa48("74845") ? value !== null : stryMutAct_9fa48("74844") ? false : (stryCov_9fa48("74844", "74845"), value === null)) || (stryMutAct_9fa48("74847") ? value !== undefined : stryMutAct_9fa48("74846") ? false : (stryCov_9fa48("74846", "74847"), value === undefined)))) {
      if (stryMutAct_9fa48("74848")) {
        {}
      } else {
        stryCov_9fa48("74848");
        return fallbackValue;
      }
    }
    if (stryMutAct_9fa48("74851") ? typeof value !== 'string' : stryMutAct_9fa48("74850") ? false : stryMutAct_9fa48("74849") ? true : (stryCov_9fa48("74849", "74850", "74851"), typeof value === (stryMutAct_9fa48("74852") ? "" : (stryCov_9fa48("74852"), 'string')))) {
      if (stryMutAct_9fa48("74853")) {
        {}
      } else {
        stryCov_9fa48("74853");
        try {
          if (stryMutAct_9fa48("74854")) {
            {}
          } else {
            stryCov_9fa48("74854");
            return JSON.parse(value);
          }
        } catch {
          if (stryMutAct_9fa48("74855")) {
            {}
          } else {
            stryCov_9fa48("74855");
            return fallbackValue;
          }
        }
      }
    }
    return value;
  }
}
function readArrayValue(...values) {
  if (stryMutAct_9fa48("74856")) {
    {}
  } else {
    stryCov_9fa48("74856");
    for (const value of values) {
      if (stryMutAct_9fa48("74857")) {
        {}
      } else {
        stryCov_9fa48("74857");
        const normalized = readJsonValue(value, null);
        if (stryMutAct_9fa48("74859") ? false : stryMutAct_9fa48("74858") ? true : (stryCov_9fa48("74858", "74859"), Array.isArray(normalized))) {
          if (stryMutAct_9fa48("74860")) {
            {}
          } else {
            stryCov_9fa48("74860");
            return normalized;
          }
        }
      }
    }
    return stryMutAct_9fa48("74861") ? ["Stryker was here"] : (stryCov_9fa48("74861"), []);
  }
}
function readObjectValue(...values) {
  if (stryMutAct_9fa48("74862")) {
    {}
  } else {
    stryCov_9fa48("74862");
    for (const value of values) {
      if (stryMutAct_9fa48("74863")) {
        {}
      } else {
        stryCov_9fa48("74863");
        const normalized = readJsonValue(value, null);
        if (stryMutAct_9fa48("74866") ? normalized && typeof normalized === 'object' || !Array.isArray(normalized) : stryMutAct_9fa48("74865") ? false : stryMutAct_9fa48("74864") ? true : (stryCov_9fa48("74864", "74865", "74866"), (stryMutAct_9fa48("74868") ? normalized || typeof normalized === 'object' : stryMutAct_9fa48("74867") ? true : (stryCov_9fa48("74867", "74868"), normalized && (stryMutAct_9fa48("74870") ? typeof normalized !== 'object' : stryMutAct_9fa48("74869") ? true : (stryCov_9fa48("74869", "74870"), typeof normalized === (stryMutAct_9fa48("74871") ? "" : (stryCov_9fa48("74871"), 'object')))))) && (stryMutAct_9fa48("74872") ? Array.isArray(normalized) : (stryCov_9fa48("74872"), !Array.isArray(normalized))))) {
          if (stryMutAct_9fa48("74873")) {
            {}
          } else {
            stryCov_9fa48("74873");
            return normalized;
          }
        }
      }
    }
    return null;
  }
}
function normalizeNodeRow(row) {
  if (stryMutAct_9fa48("74874")) {
    {}
  } else {
    stryCov_9fa48("74874");
    return stryMutAct_9fa48("74875") ? {} : (stryCov_9fa48("74875"), {
      nodeId: readText(stryMutAct_9fa48("74876") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("74876"), row?.[COLUMN.NODE_ID]), stryMutAct_9fa48("74877") ? row.node_id : (stryCov_9fa48("74877"), row?.node_id), stryMutAct_9fa48("74878") ? row.nodeId : (stryCov_9fa48("74878"), row?.nodeId)),
      status: readLowerText(stryMutAct_9fa48("74879") ? row[COLUMN.STATUS] : (stryCov_9fa48("74879"), row?.[COLUMN.STATUS]), stryMutAct_9fa48("74880") ? row.status : (stryCov_9fa48("74880"), row?.status)),
      connectionState: readLowerText(stryMutAct_9fa48("74881") ? row[COLUMN.CONNECTION_STATE] : (stryCov_9fa48("74881"), row?.[COLUMN.CONNECTION_STATE]), stryMutAct_9fa48("74882") ? row.connection_state : (stryCov_9fa48("74882"), row?.connection_state), stryMutAct_9fa48("74883") ? row.connectionState : (stryCov_9fa48("74883"), row?.connectionState))
    });
  }
}
function normalizeServiceRow(row) {
  if (stryMutAct_9fa48("74884")) {
    {}
  } else {
    stryCov_9fa48("74884");
    return stryMutAct_9fa48("74885") ? {} : (stryCov_9fa48("74885"), {
      serviceId: readText(stryMutAct_9fa48("74886") ? row[COLUMN.SERVICE_ID] : (stryCov_9fa48("74886"), row?.[COLUMN.SERVICE_ID]), stryMutAct_9fa48("74887") ? row.service_id : (stryCov_9fa48("74887"), row?.service_id), stryMutAct_9fa48("74888") ? row.serviceId : (stryCov_9fa48("74888"), row?.serviceId)),
      serviceType: readLowerText(stryMutAct_9fa48("74889") ? row[COLUMN.SERVICE_TYPE] : (stryCov_9fa48("74889"), row?.[COLUMN.SERVICE_TYPE]), stryMutAct_9fa48("74890") ? row.service_type : (stryCov_9fa48("74890"), row?.service_type), stryMutAct_9fa48("74891") ? row.serviceType : (stryCov_9fa48("74891"), row?.serviceType)),
      nodeId: readText(stryMutAct_9fa48("74892") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("74892"), row?.[COLUMN.NODE_ID]), stryMutAct_9fa48("74893") ? row.node_id : (stryCov_9fa48("74893"), row?.node_id), stryMutAct_9fa48("74894") ? row.nodeId : (stryCov_9fa48("74894"), row?.nodeId)),
      partitionId: readText(stryMutAct_9fa48("74895") ? row[COLUMN.PARTITION_ID] : (stryCov_9fa48("74895"), row?.[COLUMN.PARTITION_ID]), stryMutAct_9fa48("74896") ? row.partition_id : (stryCov_9fa48("74896"), row?.partition_id), stryMutAct_9fa48("74897") ? row.partitionId : (stryCov_9fa48("74897"), row?.partitionId)),
      groupId: readText(stryMutAct_9fa48("74898") ? row[COLUMN.GROUP_ID] : (stryCov_9fa48("74898"), row?.[COLUMN.GROUP_ID]), stryMutAct_9fa48("74899") ? row.group_id : (stryCov_9fa48("74899"), row?.group_id), stryMutAct_9fa48("74900") ? row.groupId : (stryCov_9fa48("74900"), row?.groupId)),
      replicaId: readText(stryMutAct_9fa48("74901") ? row[COLUMN.REPLICA_ID] : (stryCov_9fa48("74901"), row?.[COLUMN.REPLICA_ID]), stryMutAct_9fa48("74902") ? row.replica_id : (stryCov_9fa48("74902"), row?.replica_id), stryMutAct_9fa48("74903") ? row.replicaId : (stryCov_9fa48("74903"), row?.replicaId)),
      raftRole: readLowerText(stryMutAct_9fa48("74904") ? row[COLUMN.RAFT_ROLE] : (stryCov_9fa48("74904"), row?.[COLUMN.RAFT_ROLE]), stryMutAct_9fa48("74905") ? row.raft_role : (stryCov_9fa48("74905"), row?.raft_role), stryMutAct_9fa48("74906") ? row.raftRole : (stryCov_9fa48("74906"), row?.raftRole)),
      status: readLowerText(stryMutAct_9fa48("74907") ? row[COLUMN.STATUS] : (stryCov_9fa48("74907"), row?.[COLUMN.STATUS]), stryMutAct_9fa48("74908") ? row.status : (stryCov_9fa48("74908"), row?.status)),
      address: readText(stryMutAct_9fa48("74909") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("74909"), row?.[COLUMN.ADDRESS]), stryMutAct_9fa48("74910") ? row.address : (stryCov_9fa48("74910"), row?.address))
    });
  }
}
function normalizeNodeEndpointRow(row) {
  if (stryMutAct_9fa48("74911")) {
    {}
  } else {
    stryCov_9fa48("74911");
    return stryMutAct_9fa48("74912") ? {} : (stryCov_9fa48("74912"), {
      nodeId: readText(stryMutAct_9fa48("74913") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("74913"), row?.[COLUMN.NODE_ID]), stryMutAct_9fa48("74914") ? row.node_id : (stryCov_9fa48("74914"), row?.node_id), stryMutAct_9fa48("74915") ? row.nodeId : (stryCov_9fa48("74915"), row?.nodeId)),
      status: readLowerText(stryMutAct_9fa48("74916") ? row[COLUMN.STATUS] : (stryCov_9fa48("74916"), row?.[COLUMN.STATUS]), stryMutAct_9fa48("74917") ? row.status : (stryCov_9fa48("74917"), row?.status)),
      transportType: readLowerText(stryMutAct_9fa48("74918") ? row[COLUMN.TRANSPORT_TYPE] : (stryCov_9fa48("74918"), row?.[COLUMN.TRANSPORT_TYPE]), stryMutAct_9fa48("74919") ? row.transport_type : (stryCov_9fa48("74919"), row?.transport_type), stryMutAct_9fa48("74920") ? row.transportType : (stryCov_9fa48("74920"), row?.transportType)),
      address: readText(stryMutAct_9fa48("74921") ? row[COLUMN.ADDRESS] : (stryCov_9fa48("74921"), row?.[COLUMN.ADDRESS]), stryMutAct_9fa48("74922") ? row.address : (stryCov_9fa48("74922"), row?.address))
    });
  }
}
function normalizeServiceEndpointRow(row) {
  if (stryMutAct_9fa48("74923")) {
    {}
  } else {
    stryCov_9fa48("74923");
    return stryMutAct_9fa48("74924") ? {} : (stryCov_9fa48("74924"), {
      nodeId: readText(stryMutAct_9fa48("74925") ? row[COLUMN.NODE_ID] : (stryCov_9fa48("74925"), row?.[COLUMN.NODE_ID]), stryMutAct_9fa48("74926") ? row.node_id : (stryCov_9fa48("74926"), row?.node_id), stryMutAct_9fa48("74927") ? row.nodeId : (stryCov_9fa48("74927"), row?.nodeId)),
      serviceId: readText(stryMutAct_9fa48("74928") ? row[COLUMN.SERVICE_ID] : (stryCov_9fa48("74928"), row?.[COLUMN.SERVICE_ID]), stryMutAct_9fa48("74929") ? row.service_id : (stryCov_9fa48("74929"), row?.service_id), stryMutAct_9fa48("74930") ? row.serviceId : (stryCov_9fa48("74930"), row?.serviceId)),
      healthStatus: readLowerText(stryMutAct_9fa48("74931") ? row.health_status : (stryCov_9fa48("74931"), row?.health_status), stryMutAct_9fa48("74932") ? row.healthStatus : (stryCov_9fa48("74932"), row?.healthStatus)),
      endpoint: readText(stryMutAct_9fa48("74933") ? row.endpoint : (stryCov_9fa48("74933"), row?.endpoint))
    });
  }
}
function normalizeControlPlanePublicationRow(row) {
  if (stryMutAct_9fa48("74934")) {
    {}
  } else {
    stryCov_9fa48("74934");
    return stryMutAct_9fa48("74935") ? {} : (stryCov_9fa48("74935"), {
      publicationId: readText(stryMutAct_9fa48("74936") ? row.publication_id : (stryCov_9fa48("74936"), row?.publication_id), stryMutAct_9fa48("74937") ? row.publicationId : (stryCov_9fa48("74937"), row?.publicationId)),
      publicationKind: readLowerText(stryMutAct_9fa48("74938") ? row.publication_kind : (stryCov_9fa48("74938"), row?.publication_kind), stryMutAct_9fa48("74939") ? row.publicationKind : (stryCov_9fa48("74939"), row?.publicationKind)),
      publicationEpoch: readInteger(stryMutAct_9fa48("74940") ? row.publication_epoch : (stryCov_9fa48("74940"), row?.publication_epoch), stryMutAct_9fa48("74941") ? row.publicationEpoch : (stryCov_9fa48("74941"), row?.publicationEpoch)),
      publisherNodeId: readText(stryMutAct_9fa48("74942") ? row.publisher_node_id : (stryCov_9fa48("74942"), row?.publisher_node_id), stryMutAct_9fa48("74943") ? row.publisherNodeId : (stryCov_9fa48("74943"), row?.publisherNodeId)),
      sourceTopologyEpoch: readInteger(stryMutAct_9fa48("74944") ? row.source_topology_epoch : (stryCov_9fa48("74944"), row?.source_topology_epoch), stryMutAct_9fa48("74945") ? row.sourceTopologyEpoch : (stryCov_9fa48("74945"), row?.sourceTopologyEpoch)),
      sourceSnapshotVersion: readInteger(stryMutAct_9fa48("74946") ? row.source_snapshot_version : (stryCov_9fa48("74946"), row?.source_snapshot_version), stryMutAct_9fa48("74947") ? row.sourceSnapshotVersion : (stryCov_9fa48("74947"), row?.sourceSnapshotVersion)),
      status: readUpperText(stryMutAct_9fa48("74948") ? row.status : (stryCov_9fa48("74948"), row?.status)),
      reasonCode: readText(stryMutAct_9fa48("74949") ? row.reason_code : (stryCov_9fa48("74949"), row?.reason_code), stryMutAct_9fa48("74950") ? row.reasonCode : (stryCov_9fa48("74950"), row?.reasonCode)),
      publishedActiveNodeIds: stryMutAct_9fa48("74951") ? readArrayValue(row?.published_active_node_ids, row?.publishedActiveNodeIds).map(value => readText(value)) : (stryCov_9fa48("74951"), readArrayValue(stryMutAct_9fa48("74952") ? row.published_active_node_ids : (stryCov_9fa48("74952"), row?.published_active_node_ids), stryMutAct_9fa48("74953") ? row.publishedActiveNodeIds : (stryCov_9fa48("74953"), row?.publishedActiveNodeIds)).map(stryMutAct_9fa48("74954") ? () => undefined : (stryCov_9fa48("74954"), value => readText(value))).filter(Boolean)),
      requiredAckNodeIds: stryMutAct_9fa48("74955") ? readArrayValue(row?.required_ack_node_ids, row?.requiredAckNodeIds).map(value => readText(value)) : (stryCov_9fa48("74955"), readArrayValue(stryMutAct_9fa48("74956") ? row.required_ack_node_ids : (stryCov_9fa48("74956"), row?.required_ack_node_ids), stryMutAct_9fa48("74957") ? row.requiredAckNodeIds : (stryCov_9fa48("74957"), row?.requiredAckNodeIds)).map(stryMutAct_9fa48("74958") ? () => undefined : (stryCov_9fa48("74958"), value => readText(value))).filter(Boolean)),
      acknowledgedNodeIds: stryMutAct_9fa48("74959") ? readArrayValue(row?.acknowledged_node_ids, row?.acknowledgedNodeIds).map(value => readText(value)) : (stryCov_9fa48("74959"), readArrayValue(stryMutAct_9fa48("74960") ? row.acknowledged_node_ids : (stryCov_9fa48("74960"), row?.acknowledged_node_ids), stryMutAct_9fa48("74961") ? row.acknowledgedNodeIds : (stryCov_9fa48("74961"), row?.acknowledgedNodeIds)).map(stryMutAct_9fa48("74962") ? () => undefined : (stryCov_9fa48("74962"), value => readText(value))).filter(Boolean)),
      priorityPartitionSummary: readObjectValue(stryMutAct_9fa48("74963") ? row.priority_partition_summary : (stryCov_9fa48("74963"), row?.priority_partition_summary), stryMutAct_9fa48("74964") ? row.priorityPartitionSummary : (stryCov_9fa48("74964"), row?.priorityPartitionSummary)),
      membershipLifecycleSummary: readObjectValue(stryMutAct_9fa48("74965") ? row.membership_lifecycle_summary : (stryCov_9fa48("74965"), row?.membership_lifecycle_summary), stryMutAct_9fa48("74966") ? row.membershipLifecycleSummary : (stryCov_9fa48("74966"), row?.membershipLifecycleSummary)),
      transitionHistory: readArrayValue(stryMutAct_9fa48("74967") ? row.transition_history : (stryCov_9fa48("74967"), row?.transition_history), stryMutAct_9fa48("74968") ? row.transitionHistory : (stryCov_9fa48("74968"), row?.transitionHistory))
    });
  }
}
function serializeControlPlanePublicationRow(row) {
  if (stryMutAct_9fa48("74969")) {
    {}
  } else {
    stryCov_9fa48("74969");
    const normalizedRow = normalizeControlPlanePublicationRow(row);
    return stryMutAct_9fa48("74970") ? {} : (stryCov_9fa48("74970"), {
      publication_id: readText(normalizedRow.publicationId, stryMutAct_9fa48("74971") ? row.publication_id : (stryCov_9fa48("74971"), row?.publication_id), stryMutAct_9fa48("74972") ? row.publicationId : (stryCov_9fa48("74972"), row?.publicationId)),
      publication_kind: readText(normalizedRow.publicationKind, stryMutAct_9fa48("74973") ? row.publication_kind : (stryCov_9fa48("74973"), row?.publication_kind), stryMutAct_9fa48("74974") ? row.publicationKind : (stryCov_9fa48("74974"), row?.publicationKind), CONTROL_PLANE_PUBLICATION_DEFAULT.KIND),
      publication_epoch: readInteger(normalizedRow.publicationEpoch, stryMutAct_9fa48("74975") ? row.publication_epoch : (stryCov_9fa48("74975"), row?.publication_epoch), stryMutAct_9fa48("74976") ? row.publicationEpoch : (stryCov_9fa48("74976"), row?.publicationEpoch), 1),
      publisher_node_id: readText(normalizedRow.publisherNodeId, stryMutAct_9fa48("74977") ? row.publisher_node_id : (stryCov_9fa48("74977"), row?.publisher_node_id), stryMutAct_9fa48("74978") ? row.publisherNodeId : (stryCov_9fa48("74978"), row?.publisherNodeId)),
      source_topology_epoch: readInteger(normalizedRow.sourceTopologyEpoch, stryMutAct_9fa48("74979") ? row.source_topology_epoch : (stryCov_9fa48("74979"), row?.source_topology_epoch), stryMutAct_9fa48("74980") ? row.sourceTopologyEpoch : (stryCov_9fa48("74980"), row?.sourceTopologyEpoch)),
      source_snapshot_version: readInteger(normalizedRow.sourceSnapshotVersion, stryMutAct_9fa48("74981") ? row.source_snapshot_version : (stryCov_9fa48("74981"), row?.source_snapshot_version), stryMutAct_9fa48("74982") ? row.sourceSnapshotVersion : (stryCov_9fa48("74982"), row?.sourceSnapshotVersion)),
      published_active_node_ids: stryMutAct_9fa48("74983") ? readArrayValue(normalizedRow.publishedActiveNodeIds, row?.published_active_node_ids, row?.publishedActiveNodeIds).map(value => readText(value)) : (stryCov_9fa48("74983"), readArrayValue(normalizedRow.publishedActiveNodeIds, stryMutAct_9fa48("74984") ? row.published_active_node_ids : (stryCov_9fa48("74984"), row?.published_active_node_ids), stryMutAct_9fa48("74985") ? row.publishedActiveNodeIds : (stryCov_9fa48("74985"), row?.publishedActiveNodeIds)).map(stryMutAct_9fa48("74986") ? () => undefined : (stryCov_9fa48("74986"), value => readText(value))).filter(Boolean)),
      required_ack_node_ids: stryMutAct_9fa48("74987") ? readArrayValue(normalizedRow.requiredAckNodeIds, row?.required_ack_node_ids, row?.requiredAckNodeIds).map(value => readText(value)) : (stryCov_9fa48("74987"), readArrayValue(normalizedRow.requiredAckNodeIds, stryMutAct_9fa48("74988") ? row.required_ack_node_ids : (stryCov_9fa48("74988"), row?.required_ack_node_ids), stryMutAct_9fa48("74989") ? row.requiredAckNodeIds : (stryCov_9fa48("74989"), row?.requiredAckNodeIds)).map(stryMutAct_9fa48("74990") ? () => undefined : (stryCov_9fa48("74990"), value => readText(value))).filter(Boolean)),
      acknowledged_node_ids: stryMutAct_9fa48("74991") ? readArrayValue(normalizedRow.acknowledgedNodeIds, row?.acknowledged_node_ids, row?.acknowledgedNodeIds).map(value => readText(value)) : (stryCov_9fa48("74991"), readArrayValue(normalizedRow.acknowledgedNodeIds, stryMutAct_9fa48("74992") ? row.acknowledged_node_ids : (stryCov_9fa48("74992"), row?.acknowledged_node_ids), stryMutAct_9fa48("74993") ? row.acknowledgedNodeIds : (stryCov_9fa48("74993"), row?.acknowledgedNodeIds)).map(stryMutAct_9fa48("74994") ? () => undefined : (stryCov_9fa48("74994"), value => readText(value))).filter(Boolean)),
      priority_partition_summary: readObjectValue(normalizedRow.priorityPartitionSummary, stryMutAct_9fa48("74995") ? row.priority_partition_summary : (stryCov_9fa48("74995"), row?.priority_partition_summary), stryMutAct_9fa48("74996") ? row.priorityPartitionSummary : (stryCov_9fa48("74996"), row?.priorityPartitionSummary)),
      membership_lifecycle_summary: readObjectValue(normalizedRow.membershipLifecycleSummary, stryMutAct_9fa48("74997") ? row.membership_lifecycle_summary : (stryCov_9fa48("74997"), row?.membership_lifecycle_summary), stryMutAct_9fa48("74998") ? row.membershipLifecycleSummary : (stryCov_9fa48("74998"), row?.membershipLifecycleSummary)),
      status: readUpperText(normalizedRow.status, stryMutAct_9fa48("74999") ? row.status : (stryCov_9fa48("74999"), row?.status), CONTROL_PLANE_PUBLICATION_DEFAULT.STATUS),
      reason_code: readText(normalizedRow.reasonCode, stryMutAct_9fa48("75000") ? row.reason_code : (stryCov_9fa48("75000"), row?.reason_code), stryMutAct_9fa48("75001") ? row.reasonCode : (stryCov_9fa48("75001"), row?.reasonCode)),
      created_at: readInteger(stryMutAct_9fa48("75002") ? row.created_at : (stryCov_9fa48("75002"), row?.created_at), stryMutAct_9fa48("75003") ? row.createdAt : (stryCov_9fa48("75003"), row?.createdAt)),
      updated_at: readInteger(stryMutAct_9fa48("75004") ? row.updated_at : (stryCov_9fa48("75004"), row?.updated_at), stryMutAct_9fa48("75005") ? row.updatedAt : (stryCov_9fa48("75005"), row?.updatedAt), Date.now()),
      published_at: readInteger(stryMutAct_9fa48("75006") ? row.published_at : (stryCov_9fa48("75006"), row?.published_at), stryMutAct_9fa48("75007") ? row.publishedAt : (stryCov_9fa48("75007"), row?.publishedAt)),
      closed_at: readInteger(stryMutAct_9fa48("75008") ? row.closed_at : (stryCov_9fa48("75008"), row?.closed_at), stryMutAct_9fa48("75009") ? row.closedAt : (stryCov_9fa48("75009"), row?.closedAt)),
      transition_history: readArrayValue(stryMutAct_9fa48("75010") ? row.transition_history : (stryCov_9fa48("75010"), row?.transition_history), stryMutAct_9fa48("75011") ? row.transitionHistory : (stryCov_9fa48("75011"), row?.transitionHistory), normalizedRow.transitionHistory)
    });
  }
}
function canonicalizeSystemTableRow(tableName, row) {
  if (stryMutAct_9fa48("75012")) {
    {}
  } else {
    stryCov_9fa48("75012");
    if (stryMutAct_9fa48("75015") ? tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS : stryMutAct_9fa48("75014") ? false : stryMutAct_9fa48("75013") ? true : (stryCov_9fa48("75013", "75014", "75015"), tableName === TABLES.CONTROL_PLANE_PUBLICATIONS)) {
      if (stryMutAct_9fa48("75016")) {
        {}
      } else {
        stryCov_9fa48("75016");
        return serializeControlPlanePublicationRow(row);
      }
    }
    return row;
  }
}
function readUpperText(...values) {
  if (stryMutAct_9fa48("75017")) {
    {}
  } else {
    stryCov_9fa48("75017");
    return stryMutAct_9fa48("75018") ? readText(...values).toLowerCase() : (stryCov_9fa48("75018"), readText(...values).toUpperCase());
  }
}
export { canonicalizeSystemTableRow, normalizeControlPlanePublicationRow, normalizeNodeEndpointRow, normalizeNodeRow, normalizeServiceEndpointRow, normalizeServiceRow, serializeControlPlanePublicationRow };