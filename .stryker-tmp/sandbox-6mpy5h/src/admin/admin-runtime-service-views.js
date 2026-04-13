/**
 * Admin view helpers for runtime-service replicas.
 *
 * Provides functions to query and format runtime-service replicas
 * for admin views, group replicas by logical service, format
 * endpoint details with protocol/address/port, and distinguish
 * logical services from individual replica rows.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
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
import { SQL, TABLES, COLUMN, STRING } from '../constants/index.js';
import { EP_COL } from '../wasm-service/service-endpoint-builder.js';
import { WASM_SERVICE_PROTOCOL, WASM_SERVICE_HEALTH_STATUS } from '../wasm-service/wasm-service-constants.js';
import { LOGICAL_SERVICE_HEALTH, VIEW_ROW_KIND, PROTOCOL_URI_SCHEME, BUILT_IN_RUNTIME_SERVICE_IDS, PORT_UNKNOWN } from './admin-runtime-service-view-constants.js';
const SELECT_ALL_FROM = stryMutAct_9fa48("4719") ? `` : (stryCov_9fa48("4719"), `${SQL.SELECT} * FROM`);

/**
 * Handle listRuntimeServiceReplicas command.
 * Returns SQL to query service_endpoints joined conceptually
 * with service_definitions for runtime-service replicas.
 * Optionally filtered by serviceId or nodeId.
 *
 * @param {Object} params - Optional {serviceId, nodeId}.
 * @return {Object} Result with sql/params for execution.
 */
function handleListRuntimeServiceReplicas(params) {
  if (stryMutAct_9fa48("4720")) {
    {}
  } else {
    stryCov_9fa48("4720");
    let sql = stryMutAct_9fa48("4721") ? `` : (stryCov_9fa48("4721"), `${SELECT_ALL_FROM} ${TABLES.SERVICE_ENDPOINTS}`);
    const filters = stryMutAct_9fa48("4722") ? ["Stryker was here"] : (stryCov_9fa48("4722"), []);
    const sqlParams = stryMutAct_9fa48("4723") ? ["Stryker was here"] : (stryCov_9fa48("4723"), []);
    if (stryMutAct_9fa48("4726") ? params || params.serviceId : stryMutAct_9fa48("4725") ? false : stryMutAct_9fa48("4724") ? true : (stryCov_9fa48("4724", "4725", "4726"), params && params.serviceId)) {
      if (stryMutAct_9fa48("4727")) {
        {}
      } else {
        stryCov_9fa48("4727");
        sqlParams.push(params.serviceId);
        filters.push(stryMutAct_9fa48("4728") ? `` : (stryCov_9fa48("4728"), `${EP_COL.SERVICE_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4731") ? params || params.nodeId : stryMutAct_9fa48("4730") ? false : stryMutAct_9fa48("4729") ? true : (stryCov_9fa48("4729", "4730", "4731"), params && params.nodeId)) {
      if (stryMutAct_9fa48("4732")) {
        {}
      } else {
        stryCov_9fa48("4732");
        sqlParams.push(params.nodeId);
        filters.push(stryMutAct_9fa48("4733") ? `` : (stryCov_9fa48("4733"), `${EP_COL.NODE_ID} = ?${sqlParams.length}`));
      }
    }
    if (stryMutAct_9fa48("4737") ? filters.length <= 0 : stryMutAct_9fa48("4736") ? filters.length >= 0 : stryMutAct_9fa48("4735") ? false : stryMutAct_9fa48("4734") ? true : (stryCov_9fa48("4734", "4735", "4736", "4737"), filters.length > 0)) {
      if (stryMutAct_9fa48("4738")) {
        {}
      } else {
        stryCov_9fa48("4738");
        sql += stryMutAct_9fa48("4739") ? `` : (stryCov_9fa48("4739"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("4740") ? `` : (stryCov_9fa48("4740"), ` ${SQL.AND} `))}`);
      }
    }
    return stryMutAct_9fa48("4741") ? {} : (stryCov_9fa48("4741"), {
      success: stryMutAct_9fa48("4742") ? false : (stryCov_9fa48("4742"), true),
      sql,
      params: sqlParams
    });
  }
}

/**
 * Group flat endpoint rows by logical service ID.
 * Each group contains the service ID, aggregated replica list,
 * and health summary.
 *
 * @param {Array<Object>} endpoints - Rows from service_endpoints.
 * @param {Array<Object>} definitions - Rows from service_definitions.
 * @return {Array<Object>} Logical service groups with replica details.
 */
function groupReplicasByLogicalService(endpoints, definitions) {
  if (stryMutAct_9fa48("4743")) {
    {}
  } else {
    stryCov_9fa48("4743");
    const defMap = new Map();
    for (const def of definitions) {
      if (stryMutAct_9fa48("4744")) {
        {}
      } else {
        stryCov_9fa48("4744");
        const id = stryMutAct_9fa48("4747") ? def[COLUMN.SERVICE_ID] && def.service_id : stryMutAct_9fa48("4746") ? false : stryMutAct_9fa48("4745") ? true : (stryCov_9fa48("4745", "4746", "4747"), def[COLUMN.SERVICE_ID] || def.service_id);
        if (stryMutAct_9fa48("4749") ? false : stryMutAct_9fa48("4748") ? true : (stryCov_9fa48("4748", "4749"), id)) {
          if (stryMutAct_9fa48("4750")) {
            {}
          } else {
            stryCov_9fa48("4750");
            defMap.set(id, def);
          }
        }
      }
    }
    const groups = new Map();
    for (const ep of endpoints) {
      if (stryMutAct_9fa48("4751")) {
        {}
      } else {
        stryCov_9fa48("4751");
        const serviceId = stryMutAct_9fa48("4754") ? ep[EP_COL.SERVICE_ID] && ep.service_id : stryMutAct_9fa48("4753") ? false : stryMutAct_9fa48("4752") ? true : (stryCov_9fa48("4752", "4753", "4754"), ep[EP_COL.SERVICE_ID] || ep.service_id);
        if (stryMutAct_9fa48("4757") ? false : stryMutAct_9fa48("4756") ? true : stryMutAct_9fa48("4755") ? serviceId : (stryCov_9fa48("4755", "4756", "4757"), !serviceId)) {
          if (stryMutAct_9fa48("4758")) {
            {}
          } else {
            stryCov_9fa48("4758");
            continue;
          }
        }
        if (stryMutAct_9fa48("4761") ? false : stryMutAct_9fa48("4760") ? true : stryMutAct_9fa48("4759") ? groups.has(serviceId) : (stryCov_9fa48("4759", "4760", "4761"), !groups.has(serviceId))) {
          if (stryMutAct_9fa48("4762")) {
            {}
          } else {
            stryCov_9fa48("4762");
            groups.set(serviceId, stryMutAct_9fa48("4763") ? ["Stryker was here"] : (stryCov_9fa48("4763"), []));
          }
        }
        groups.get(serviceId).push(ep);
      }
    }
    const result = stryMutAct_9fa48("4764") ? ["Stryker was here"] : (stryCov_9fa48("4764"), []);
    for (const [serviceId, replicas] of groups) {
      if (stryMutAct_9fa48("4765")) {
        {}
      } else {
        stryCov_9fa48("4765");
        const definition = stryMutAct_9fa48("4768") ? defMap.get(serviceId) && {} : stryMutAct_9fa48("4767") ? false : stryMutAct_9fa48("4766") ? true : (stryCov_9fa48("4766", "4767", "4768"), defMap.get(serviceId) || {});
        const desiredCount = stryMutAct_9fa48("4769") ? (definition.replica_count ?? definition.replicaCount) && 0 : (stryCov_9fa48("4769"), (stryMutAct_9fa48("4770") ? definition.replica_count && definition.replicaCount : (stryCov_9fa48("4770"), definition.replica_count ?? definition.replicaCount)) ?? 0);
        const healthyCount = countHealthyReplicas(replicas);
        result.push(stryMutAct_9fa48("4771") ? {} : (stryCov_9fa48("4771"), {
          row_kind: VIEW_ROW_KIND.LOGICAL_SERVICE,
          service_id: serviceId,
          service_name: stryMutAct_9fa48("4774") ? (definition.service_name || definition.serviceName) && serviceId : stryMutAct_9fa48("4773") ? false : stryMutAct_9fa48("4772") ? true : (stryCov_9fa48("4772", "4773", "4774"), (stryMutAct_9fa48("4776") ? definition.service_name && definition.serviceName : stryMutAct_9fa48("4775") ? false : (stryCov_9fa48("4775", "4776"), definition.service_name || definition.serviceName)) || serviceId),
          runtime_kind: stryMutAct_9fa48("4779") ? (definition.runtime_kind || definition.runtimeKind) && STRING.UNKNOWN : stryMutAct_9fa48("4778") ? false : stryMutAct_9fa48("4777") ? true : (stryCov_9fa48("4777", "4778", "4779"), (stryMutAct_9fa48("4781") ? definition.runtime_kind && definition.runtimeKind : stryMutAct_9fa48("4780") ? false : (stryCov_9fa48("4780", "4781"), definition.runtime_kind || definition.runtimeKind)) || STRING.UNKNOWN),
          desired_replica_count: desiredCount,
          observed_replica_count: replicas.length,
          healthy_replica_count: healthyCount,
          nodes: collectUniqueNodes(replicas),
          health: resolveLogicalServiceHealth(desiredCount, replicas.length, healthyCount),
          replicas: replicas.map(stryMutAct_9fa48("4782") ? () => undefined : (stryCov_9fa48("4782"), ep => formatReplicaRow(ep)))
        }));
      }
    }
    return result;
  }
}

/**
 * Format a single endpoint row as a replica detail object.
 * Includes protocol, address, port, health status, and
 * the row_kind label to distinguish from logical service rows.
 *
 * @param {Object} endpoint - A service_endpoints row.
 * @return {Object} Formatted replica row.
 */
function formatReplicaRow(endpoint) {
  if (stryMutAct_9fa48("4783")) {
    {}
  } else {
    stryCov_9fa48("4783");
    const protocol = stryMutAct_9fa48("4786") ? (endpoint[EP_COL.PROTOCOL] || endpoint.protocol) && WASM_SERVICE_PROTOCOL.WEBSOCKET : stryMutAct_9fa48("4785") ? false : stryMutAct_9fa48("4784") ? true : (stryCov_9fa48("4784", "4785", "4786"), (stryMutAct_9fa48("4788") ? endpoint[EP_COL.PROTOCOL] && endpoint.protocol : stryMutAct_9fa48("4787") ? false : (stryCov_9fa48("4787", "4788"), endpoint[EP_COL.PROTOCOL] || endpoint.protocol)) || WASM_SERVICE_PROTOCOL.WEBSOCKET);
    const address = stryMutAct_9fa48("4791") ? (endpoint[EP_COL.ADDRESS] || endpoint.address) && STRING.UNKNOWN : stryMutAct_9fa48("4790") ? false : stryMutAct_9fa48("4789") ? true : (stryCov_9fa48("4789", "4790", "4791"), (stryMutAct_9fa48("4793") ? endpoint[EP_COL.ADDRESS] && endpoint.address : stryMutAct_9fa48("4792") ? false : (stryCov_9fa48("4792", "4793"), endpoint[EP_COL.ADDRESS] || endpoint.address)) || STRING.UNKNOWN);
    const port = stryMutAct_9fa48("4794") ? (endpoint[EP_COL.PORT] ?? endpoint.port) && PORT_UNKNOWN : (stryCov_9fa48("4794"), (stryMutAct_9fa48("4795") ? endpoint[EP_COL.PORT] && endpoint.port : (stryCov_9fa48("4795"), endpoint[EP_COL.PORT] ?? endpoint.port)) ?? PORT_UNKNOWN);
    const healthStatus = stryMutAct_9fa48("4798") ? (endpoint[EP_COL.HEALTH_STATUS] || endpoint.health_status) && WASM_SERVICE_HEALTH_STATUS.HEALTHY : stryMutAct_9fa48("4797") ? false : stryMutAct_9fa48("4796") ? true : (stryCov_9fa48("4796", "4797", "4798"), (stryMutAct_9fa48("4800") ? endpoint[EP_COL.HEALTH_STATUS] && endpoint.health_status : stryMutAct_9fa48("4799") ? false : (stryCov_9fa48("4799", "4800"), endpoint[EP_COL.HEALTH_STATUS] || endpoint.health_status)) || WASM_SERVICE_HEALTH_STATUS.HEALTHY);
    return stryMutAct_9fa48("4801") ? {} : (stryCov_9fa48("4801"), {
      row_kind: VIEW_ROW_KIND.REPLICA,
      endpoint_id: stryMutAct_9fa48("4804") ? (endpoint[EP_COL.ENDPOINT_ID] || endpoint.endpoint_id) && STRING.UNKNOWN : stryMutAct_9fa48("4803") ? false : stryMutAct_9fa48("4802") ? true : (stryCov_9fa48("4802", "4803", "4804"), (stryMutAct_9fa48("4806") ? endpoint[EP_COL.ENDPOINT_ID] && endpoint.endpoint_id : stryMutAct_9fa48("4805") ? false : (stryCov_9fa48("4805", "4806"), endpoint[EP_COL.ENDPOINT_ID] || endpoint.endpoint_id)) || STRING.UNKNOWN),
      service_id: stryMutAct_9fa48("4809") ? (endpoint[EP_COL.SERVICE_ID] || endpoint.service_id) && STRING.UNKNOWN : stryMutAct_9fa48("4808") ? false : stryMutAct_9fa48("4807") ? true : (stryCov_9fa48("4807", "4808", "4809"), (stryMutAct_9fa48("4811") ? endpoint[EP_COL.SERVICE_ID] && endpoint.service_id : stryMutAct_9fa48("4810") ? false : (stryCov_9fa48("4810", "4811"), endpoint[EP_COL.SERVICE_ID] || endpoint.service_id)) || STRING.UNKNOWN),
      node_id: stryMutAct_9fa48("4814") ? (endpoint[EP_COL.NODE_ID] || endpoint.node_id) && STRING.UNKNOWN : stryMutAct_9fa48("4813") ? false : stryMutAct_9fa48("4812") ? true : (stryCov_9fa48("4812", "4813", "4814"), (stryMutAct_9fa48("4816") ? endpoint[EP_COL.NODE_ID] && endpoint.node_id : stryMutAct_9fa48("4815") ? false : (stryCov_9fa48("4815", "4816"), endpoint[EP_COL.NODE_ID] || endpoint.node_id)) || STRING.UNKNOWN),
      protocol,
      address,
      port,
      health_status: healthStatus,
      endpoint_uri: formatEndpointUri(protocol, address, port)
    });
  }
}

/**
 * Format a protocol-aware endpoint URI for display.
 * Maps known protocols to URI schemes (e.g. postgresql://host:port).
 *
 * @param {string} protocol - Internal protocol identifier.
 * @param {string} address - Endpoint host address.
 * @param {number|string} port - Endpoint port.
 * @return {string} Formatted URI string.
 */
function formatEndpointUri(protocol, address, port) {
  if (stryMutAct_9fa48("4817")) {
    {}
  } else {
    stryCov_9fa48("4817");
    const scheme = (stryMutAct_9fa48("4820") ? protocol !== WASM_SERVICE_PROTOCOL.POSTGRESQL : stryMutAct_9fa48("4819") ? false : stryMutAct_9fa48("4818") ? true : (stryCov_9fa48("4818", "4819", "4820"), protocol === WASM_SERVICE_PROTOCOL.POSTGRESQL)) ? PROTOCOL_URI_SCHEME.POSTGRESQL : PROTOCOL_URI_SCHEME.WEBSOCKET;
    return stryMutAct_9fa48("4821") ? `` : (stryCov_9fa48("4821"), `${scheme}${address}:${port}`);
  }
}

/**
 * Resolve logical service health from replica counts.
 *
 * @param {number} desired - Desired replica count.
 * @param {number} observed - Observed replica count.
 * @param {number} healthy - Healthy replica count.
 * @return {string} Health state constant.
 */
function resolveLogicalServiceHealth(desired, observed, healthy) {
  if (stryMutAct_9fa48("4822")) {
    {}
  } else {
    stryCov_9fa48("4822");
    if (stryMutAct_9fa48("4826") ? desired > 0 : stryMutAct_9fa48("4825") ? desired < 0 : stryMutAct_9fa48("4824") ? false : stryMutAct_9fa48("4823") ? true : (stryCov_9fa48("4823", "4824", "4825", "4826"), desired <= 0)) {
      if (stryMutAct_9fa48("4827")) {
        {}
      } else {
        stryCov_9fa48("4827");
        return (stryMutAct_9fa48("4830") ? observed !== 0 : stryMutAct_9fa48("4829") ? false : stryMutAct_9fa48("4828") ? true : (stryCov_9fa48("4828", "4829", "4830"), observed === 0)) ? LOGICAL_SERVICE_HEALTH.UNKNOWN : LOGICAL_SERVICE_HEALTH.HEALTHY;
      }
    }
    if (stryMutAct_9fa48("4834") ? healthy < desired : stryMutAct_9fa48("4833") ? healthy > desired : stryMutAct_9fa48("4832") ? false : stryMutAct_9fa48("4831") ? true : (stryCov_9fa48("4831", "4832", "4833", "4834"), healthy >= desired)) {
      if (stryMutAct_9fa48("4835")) {
        {}
      } else {
        stryCov_9fa48("4835");
        return LOGICAL_SERVICE_HEALTH.HEALTHY;
      }
    }
    if (stryMutAct_9fa48("4838") ? healthy !== 0 : stryMutAct_9fa48("4837") ? false : stryMutAct_9fa48("4836") ? true : (stryCov_9fa48("4836", "4837", "4838"), healthy === 0)) {
      if (stryMutAct_9fa48("4839")) {
        {}
      } else {
        stryCov_9fa48("4839");
        return LOGICAL_SERVICE_HEALTH.DEGRADED;
      }
    }
    return LOGICAL_SERVICE_HEALTH.PARTIAL;
  }
}

/**
 * Check whether a service ID is a built-in runtime service.
 *
 * @param {string} serviceId - Service identifier.
 * @return {boolean} True if the ID is a built-in runtime service.
 */
function isBuiltInRuntimeService(serviceId) {
  if (stryMutAct_9fa48("4840")) {
    {}
  } else {
    stryCov_9fa48("4840");
    return BUILT_IN_RUNTIME_SERVICE_IDS.includes(serviceId);
  }
}

/**
 * Count healthy replicas from endpoint rows.
 *
 * @param {Array<Object>} endpoints - Endpoint rows.
 * @return {number} Count of healthy endpoints.
 */
function countHealthyReplicas(endpoints) {
  if (stryMutAct_9fa48("4841")) {
    {}
  } else {
    stryCov_9fa48("4841");
    let count = 0;
    for (const ep of endpoints) {
      if (stryMutAct_9fa48("4842")) {
        {}
      } else {
        stryCov_9fa48("4842");
        const status = stryMutAct_9fa48("4845") ? ep[EP_COL.HEALTH_STATUS] && ep.health_status : stryMutAct_9fa48("4844") ? false : stryMutAct_9fa48("4843") ? true : (stryCov_9fa48("4843", "4844", "4845"), ep[EP_COL.HEALTH_STATUS] || ep.health_status);
        if (stryMutAct_9fa48("4848") ? status !== WASM_SERVICE_HEALTH_STATUS.HEALTHY : stryMutAct_9fa48("4847") ? false : stryMutAct_9fa48("4846") ? true : (stryCov_9fa48("4846", "4847", "4848"), status === WASM_SERVICE_HEALTH_STATUS.HEALTHY)) {
          if (stryMutAct_9fa48("4849")) {
            {}
          } else {
            stryCov_9fa48("4849");
            stryMutAct_9fa48("4850") ? count-- : (stryCov_9fa48("4850"), count++);
          }
        }
      }
    }
    return count;
  }
}

/**
 * Collect unique node IDs from endpoint rows.
 *
 * @param {Array<Object>} endpoints - Endpoint rows.
 * @return {Array<string>} Sorted unique node IDs.
 */
function collectUniqueNodes(endpoints) {
  if (stryMutAct_9fa48("4851")) {
    {}
  } else {
    stryCov_9fa48("4851");
    const nodeSet = new Set();
    for (const ep of endpoints) {
      if (stryMutAct_9fa48("4852")) {
        {}
      } else {
        stryCov_9fa48("4852");
        const nodeId = stryMutAct_9fa48("4855") ? ep[EP_COL.NODE_ID] && ep.node_id : stryMutAct_9fa48("4854") ? false : stryMutAct_9fa48("4853") ? true : (stryCov_9fa48("4853", "4854", "4855"), ep[EP_COL.NODE_ID] || ep.node_id);
        if (stryMutAct_9fa48("4857") ? false : stryMutAct_9fa48("4856") ? true : (stryCov_9fa48("4856", "4857"), nodeId)) {
          if (stryMutAct_9fa48("4858")) {
            {}
          } else {
            stryCov_9fa48("4858");
            nodeSet.add(nodeId);
          }
        }
      }
    }
    return stryMutAct_9fa48("4859") ? Array.from(nodeSet) : (stryCov_9fa48("4859"), Array.from(nodeSet).sort());
  }
}
export { handleListRuntimeServiceReplicas, groupReplicasByLogicalService, formatReplicaRow, formatEndpointUri, resolveLogicalServiceHealth, isBuiltInRuntimeService, countHealthyReplicas, collectUniqueNodes };