/**
 * Runtime service-discovery catalog builder.
 *
 * Reuses endpoint-sync source normalization/filtering and grouping so the
 * same discovery model used for Kubernetes projection is available for
 * general service-discovery consumers.
 *
 * @module runtime/service-discovery-catalog
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
import { TYPEOF } from '../constants/index.js';
import { ENDPOINT_SYNC_HEALTH, ENDPOINT_SYNC_UNHEALTHY_POLICY } from './endpoint-sync-constants.js';
import { filterNormalizedEndpointRows, normalizeEndpointRows } from './endpoint-sync-source-query.js';
import { groupEndpointRows } from './endpoint-sync-planner.js';
const SERVICE_DISCOVERY_DEFAULT = Object.freeze(stryMutAct_9fa48("148705") ? {} : (stryCov_9fa48("148705"), {
  HEALTHY_ONLY: stryMutAct_9fa48("148706") ? true : (stryCov_9fa48("148706"), false),
  UNHEALTHY_POLICY: ENDPOINT_SYNC_UNHEALTHY_POLICY.NOT_READY
}));
const SERVICE_DISCOVERY_HEALTH = Object.freeze(stryMutAct_9fa48("148707") ? {} : (stryCov_9fa48("148707"), {
  HEALTHY: stryMutAct_9fa48("148708") ? "" : (stryCov_9fa48("148708"), 'healthy'),
  PARTIAL: stryMutAct_9fa48("148709") ? "" : (stryCov_9fa48("148709"), 'partial'),
  DEGRADED: stryMutAct_9fa48("148710") ? "" : (stryCov_9fa48("148710"), 'degraded'),
  UNKNOWN: stryMutAct_9fa48("148711") ? "" : (stryCov_9fa48("148711"), 'unknown')
}));

/**
 * Build a normalized string allowlist from optional query values.
 *
 * @param {Array<string>|undefined|null} values - Raw values.
 * @return {Set<string>}
 */
function toStringAllowlist(values) {
  if (stryMutAct_9fa48("148712")) {
    {}
  } else {
    stryCov_9fa48("148712");
    if (stryMutAct_9fa48("148715") ? false : stryMutAct_9fa48("148714") ? true : stryMutAct_9fa48("148713") ? Array.isArray(values) : (stryCov_9fa48("148713", "148714", "148715"), !Array.isArray(values))) {
      if (stryMutAct_9fa48("148716")) {
        {}
      } else {
        stryCov_9fa48("148716");
        return new Set();
      }
    }
    return new Set(stryMutAct_9fa48("148718") ? values.map(value => value.trim()).filter(value => value.length > 0) : stryMutAct_9fa48("148717") ? values.filter(value => typeof value === TYPEOF.STRING).map(value => value.trim()) : (stryCov_9fa48("148717", "148718"), values.filter(stryMutAct_9fa48("148719") ? () => undefined : (stryCov_9fa48("148719"), value => stryMutAct_9fa48("148722") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("148721") ? false : stryMutAct_9fa48("148720") ? true : (stryCov_9fa48("148720", "148721", "148722"), typeof value === TYPEOF.STRING))).map(stryMutAct_9fa48("148723") ? () => undefined : (stryCov_9fa48("148723"), value => stryMutAct_9fa48("148724") ? value : (stryCov_9fa48("148724"), value.trim()))).filter(stryMutAct_9fa48("148725") ? () => undefined : (stryCov_9fa48("148725"), value => stryMutAct_9fa48("148729") ? value.length <= 0 : stryMutAct_9fa48("148728") ? value.length >= 0 : stryMutAct_9fa48("148727") ? false : stryMutAct_9fa48("148726") ? true : (stryCov_9fa48("148726", "148727", "148728", "148729"), value.length > 0)))));
  }
}

/**
 * Resolve service definition id from snake_case/camelCase rows.
 *
 * @param {Object} row - service_definitions row.
 * @return {string|null}
 */
function resolveDefinitionServiceId(row) {
  if (stryMutAct_9fa48("148730")) {
    {}
  } else {
    stryCov_9fa48("148730");
    if (stryMutAct_9fa48("148733") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("148732") ? false : stryMutAct_9fa48("148731") ? true : (stryCov_9fa48("148731", "148732", "148733"), (stryMutAct_9fa48("148734") ? row : (stryCov_9fa48("148734"), !row)) || (stryMutAct_9fa48("148736") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("148735") ? false : (stryCov_9fa48("148735", "148736"), typeof row !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("148737")) {
        {}
      } else {
        stryCov_9fa48("148737");
        return null;
      }
    }
    const serviceId = stryMutAct_9fa48("148740") ? (row.service_id || row.serviceId || row.id) && null : stryMutAct_9fa48("148739") ? false : stryMutAct_9fa48("148738") ? true : (stryCov_9fa48("148738", "148739", "148740"), (stryMutAct_9fa48("148742") ? (row.service_id || row.serviceId) && row.id : stryMutAct_9fa48("148741") ? false : (stryCov_9fa48("148741", "148742"), (stryMutAct_9fa48("148744") ? row.service_id && row.serviceId : stryMutAct_9fa48("148743") ? false : (stryCov_9fa48("148743", "148744"), row.service_id || row.serviceId)) || row.id)) || null);
    if (stryMutAct_9fa48("148747") ? typeof serviceId !== TYPEOF.STRING && serviceId.trim().length === 0 : stryMutAct_9fa48("148746") ? false : stryMutAct_9fa48("148745") ? true : (stryCov_9fa48("148745", "148746", "148747"), (stryMutAct_9fa48("148749") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("148748") ? false : (stryCov_9fa48("148748", "148749"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("148751") ? serviceId.trim().length !== 0 : stryMutAct_9fa48("148750") ? false : (stryCov_9fa48("148750", "148751"), (stryMutAct_9fa48("148752") ? serviceId.length : (stryCov_9fa48("148752"), serviceId.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("148753")) {
        {}
      } else {
        stryCov_9fa48("148753");
        return null;
      }
    }
    return stryMutAct_9fa48("148754") ? serviceId : (stryCov_9fa48("148754"), serviceId.trim());
  }
}

/**
 * Resolve replica count from a service definition row.
 *
 * @param {Object} row - service_definitions row.
 * @return {number|null}
 */
function resolveDefinitionReplicaCount(row) {
  if (stryMutAct_9fa48("148755")) {
    {}
  } else {
    stryCov_9fa48("148755");
    if (stryMutAct_9fa48("148758") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("148757") ? false : stryMutAct_9fa48("148756") ? true : (stryCov_9fa48("148756", "148757", "148758"), (stryMutAct_9fa48("148759") ? row : (stryCov_9fa48("148759"), !row)) || (stryMutAct_9fa48("148761") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("148760") ? false : (stryCov_9fa48("148760", "148761"), typeof row !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("148762")) {
        {}
      } else {
        stryCov_9fa48("148762");
        return null;
      }
    }
    const rawReplicaCount = stryMutAct_9fa48("148763") ? row.replica_count && row.replicaCount : (stryCov_9fa48("148763"), row.replica_count ?? row.replicaCount);
    const parsedReplicaCount = Number(rawReplicaCount);
    if (stryMutAct_9fa48("148766") ? !Number.isInteger(parsedReplicaCount) && parsedReplicaCount < 0 : stryMutAct_9fa48("148765") ? false : stryMutAct_9fa48("148764") ? true : (stryCov_9fa48("148764", "148765", "148766"), (stryMutAct_9fa48("148767") ? Number.isInteger(parsedReplicaCount) : (stryCov_9fa48("148767"), !Number.isInteger(parsedReplicaCount))) || (stryMutAct_9fa48("148770") ? parsedReplicaCount >= 0 : stryMutAct_9fa48("148769") ? parsedReplicaCount <= 0 : stryMutAct_9fa48("148768") ? false : (stryCov_9fa48("148768", "148769", "148770"), parsedReplicaCount < 0)))) {
      if (stryMutAct_9fa48("148771")) {
        {}
      } else {
        stryCov_9fa48("148771");
        return null;
      }
    }
    return parsedReplicaCount;
  }
}

/**
 * Build desired replica-count map keyed by service_id.
 *
 * @param {Array<Object>|undefined|null} definitionRows - Definitions table rows.
 * @return {Map<string, number>}
 */
function buildDesiredReplicaCountByServiceId(definitionRows) {
  if (stryMutAct_9fa48("148772")) {
    {}
  } else {
    stryCov_9fa48("148772");
    const desiredReplicaCountByServiceId = new Map();
    if (stryMutAct_9fa48("148775") ? false : stryMutAct_9fa48("148774") ? true : stryMutAct_9fa48("148773") ? Array.isArray(definitionRows) : (stryCov_9fa48("148773", "148774", "148775"), !Array.isArray(definitionRows))) {
      if (stryMutAct_9fa48("148776")) {
        {}
      } else {
        stryCov_9fa48("148776");
        return desiredReplicaCountByServiceId;
      }
    }
    for (const definitionRow of definitionRows) {
      if (stryMutAct_9fa48("148777")) {
        {}
      } else {
        stryCov_9fa48("148777");
        const serviceId = resolveDefinitionServiceId(definitionRow);
        if (stryMutAct_9fa48("148780") ? false : stryMutAct_9fa48("148779") ? true : stryMutAct_9fa48("148778") ? serviceId : (stryCov_9fa48("148778", "148779", "148780"), !serviceId)) {
          if (stryMutAct_9fa48("148781")) {
            {}
          } else {
            stryCov_9fa48("148781");
            continue;
          }
        }
        const replicaCount = resolveDefinitionReplicaCount(definitionRow);
        if (stryMutAct_9fa48("148784") ? replicaCount !== null : stryMutAct_9fa48("148783") ? false : stryMutAct_9fa48("148782") ? true : (stryCov_9fa48("148782", "148783", "148784"), replicaCount === null)) {
          if (stryMutAct_9fa48("148785")) {
            {}
          } else {
            stryCov_9fa48("148785");
            continue;
          }
        }
        desiredReplicaCountByServiceId.set(serviceId, replicaCount);
      }
    }
    return desiredReplicaCountByServiceId;
  }
}

/**
 * Build deterministic per-service desired replica-count object.
 *
 * @param {Array<string>} serviceIds - Unique service ids for one group.
 * @param {Map<string, number>} desiredByServiceId - Desired count map.
 * @return {Object}
 */
function buildDesiredReplicaCountMap(serviceIds, desiredByServiceId) {
  if (stryMutAct_9fa48("148786")) {
    {}
  } else {
    stryCov_9fa48("148786");
    const desiredReplicaCountByServiceId = {};
    for (const serviceId of serviceIds) {
      if (stryMutAct_9fa48("148787")) {
        {}
      } else {
        stryCov_9fa48("148787");
        if (stryMutAct_9fa48("148790") ? false : stryMutAct_9fa48("148789") ? true : stryMutAct_9fa48("148788") ? desiredByServiceId.has(serviceId) : (stryCov_9fa48("148788", "148789", "148790"), !desiredByServiceId.has(serviceId))) {
          if (stryMutAct_9fa48("148791")) {
            {}
          } else {
            stryCov_9fa48("148791");
            continue;
          }
        }
        desiredReplicaCountByServiceId[serviceId] = desiredByServiceId.get(serviceId);
      }
    }
    return desiredReplicaCountByServiceId;
  }
}

/**
 * Resolve top-level desired replica count for one group.
 * Uses direct value when group maps to one service_id; otherwise null.
 *
 * @param {Array<string>} serviceIds - Unique service ids for one group.
 * @param {Map<string, number>} desiredByServiceId - Desired count map.
 * @return {number|null}
 */
function resolveDesiredReplicaCount(serviceIds, desiredByServiceId) {
  if (stryMutAct_9fa48("148792")) {
    {}
  } else {
    stryCov_9fa48("148792");
    if (stryMutAct_9fa48("148795") ? serviceIds.length === 1 : stryMutAct_9fa48("148794") ? false : stryMutAct_9fa48("148793") ? true : (stryCov_9fa48("148793", "148794", "148795"), serviceIds.length !== 1)) {
      if (stryMutAct_9fa48("148796")) {
        {}
      } else {
        stryCov_9fa48("148796");
        return null;
      }
    }
    const serviceId = serviceIds[0];
    if (stryMutAct_9fa48("148799") ? false : stryMutAct_9fa48("148798") ? true : stryMutAct_9fa48("148797") ? desiredByServiceId.has(serviceId) : (stryCov_9fa48("148797", "148798", "148799"), !desiredByServiceId.has(serviceId))) {
      if (stryMutAct_9fa48("148800")) {
        {}
      } else {
        stryCov_9fa48("148800");
        return null;
      }
    }
    return desiredByServiceId.get(serviceId);
  }
}

/**
 * Resolve aggregate health classification.
 *
 * @param {number} observedReplicaCount - Observed replicas.
 * @param {number} healthyReplicaCount - Healthy replicas.
 * @return {string}
 */
function resolveDiscoveryHealth(observedReplicaCount, healthyReplicaCount) {
  if (stryMutAct_9fa48("148801")) {
    {}
  } else {
    stryCov_9fa48("148801");
    if (stryMutAct_9fa48("148805") ? observedReplicaCount > 0 : stryMutAct_9fa48("148804") ? observedReplicaCount < 0 : stryMutAct_9fa48("148803") ? false : stryMutAct_9fa48("148802") ? true : (stryCov_9fa48("148802", "148803", "148804", "148805"), observedReplicaCount <= 0)) {
      if (stryMutAct_9fa48("148806")) {
        {}
      } else {
        stryCov_9fa48("148806");
        return SERVICE_DISCOVERY_HEALTH.UNKNOWN;
      }
    }
    if (stryMutAct_9fa48("148810") ? healthyReplicaCount < observedReplicaCount : stryMutAct_9fa48("148809") ? healthyReplicaCount > observedReplicaCount : stryMutAct_9fa48("148808") ? false : stryMutAct_9fa48("148807") ? true : (stryCov_9fa48("148807", "148808", "148809", "148810"), healthyReplicaCount >= observedReplicaCount)) {
      if (stryMutAct_9fa48("148811")) {
        {}
      } else {
        stryCov_9fa48("148811");
        return SERVICE_DISCOVERY_HEALTH.HEALTHY;
      }
    }
    if (stryMutAct_9fa48("148814") ? healthyReplicaCount !== 0 : stryMutAct_9fa48("148813") ? false : stryMutAct_9fa48("148812") ? true : (stryCov_9fa48("148812", "148813", "148814"), healthyReplicaCount === 0)) {
      if (stryMutAct_9fa48("148815")) {
        {}
      } else {
        stryCov_9fa48("148815");
        return SERVICE_DISCOVERY_HEALTH.DEGRADED;
      }
    }
    return SERVICE_DISCOVERY_HEALTH.PARTIAL;
  }
}

/**
 * Build one deterministic replica row.
 *
 * @param {Object} endpointRow - Normalized endpoint row.
 * @return {Object}
 */
function buildReplicaRecord(endpointRow) {
  if (stryMutAct_9fa48("148816")) {
    {}
  } else {
    stryCov_9fa48("148816");
    return stryMutAct_9fa48("148817") ? {} : (stryCov_9fa48("148817"), {
      endpointId: endpointRow.endpointId,
      serviceId: endpointRow.serviceId,
      nodeId: endpointRow.nodeId,
      address: endpointRow.address,
      port: endpointRow.port,
      healthStatus: endpointRow.healthStatus,
      updatedAt: endpointRow.updatedAt,
      metadata: endpointRow.metadata
    });
  }
}

/**
 * Build general-purpose discovery catalog from endpoint rows.
 *
 * @param {Array<Object>} endpointRows - service_endpoints rows.
 * @param {Object} [options={}] - Discovery options.
 * @param {Array<string>} [options.protocolAllowlist] - Protocol allowlist.
 * @param {Array<string>} [options.serviceIdAllowlist] - Service id allowlist.
 * @param {Array<string>} [options.nodeIdAllowlist] - Node id allowlist.
 * @param {boolean} [options.healthyOnly=false] - Keep only healthy endpoints.
 * @param {string} [options.unhealthyPolicy='not_ready'] - Unhealthy policy.
 * @param {Array<Object>} [options.definitionRows] - service_definitions rows.
 * @return {Array<Object>} Discovery catalog entries.
 */
function buildServiceDiscoveryCatalog(endpointRows, options = {}) {
  if (stryMutAct_9fa48("148818")) {
    {}
  } else {
    stryCov_9fa48("148818");
    const normalizedRows = normalizeEndpointRows(endpointRows);
    const filteredRows = filterNormalizedEndpointRows(normalizedRows, stryMutAct_9fa48("148819") ? {} : (stryCov_9fa48("148819"), {
      protocolAllowlist: options.protocolAllowlist,
      serviceIdAllowlist: options.serviceIdAllowlist,
      healthyOnly: (stryMutAct_9fa48("148822") ? options.healthyOnly !== undefined : stryMutAct_9fa48("148821") ? false : stryMutAct_9fa48("148820") ? true : (stryCov_9fa48("148820", "148821", "148822"), options.healthyOnly === undefined)) ? SERVICE_DISCOVERY_DEFAULT.HEALTHY_ONLY : stryMutAct_9fa48("148825") ? options.healthyOnly !== true : stryMutAct_9fa48("148824") ? false : stryMutAct_9fa48("148823") ? true : (stryCov_9fa48("148823", "148824", "148825"), options.healthyOnly === (stryMutAct_9fa48("148826") ? false : (stryCov_9fa48("148826"), true))),
      unhealthyPolicy: stryMutAct_9fa48("148829") ? options.unhealthyPolicy && SERVICE_DISCOVERY_DEFAULT.UNHEALTHY_POLICY : stryMutAct_9fa48("148828") ? false : stryMutAct_9fa48("148827") ? true : (stryCov_9fa48("148827", "148828", "148829"), options.unhealthyPolicy || SERVICE_DISCOVERY_DEFAULT.UNHEALTHY_POLICY)
    }));
    const nodeAllowlist = toStringAllowlist(options.nodeIdAllowlist);
    const scopedRows = (stryMutAct_9fa48("148833") ? nodeAllowlist.size <= 0 : stryMutAct_9fa48("148832") ? nodeAllowlist.size >= 0 : stryMutAct_9fa48("148831") ? false : stryMutAct_9fa48("148830") ? true : (stryCov_9fa48("148830", "148831", "148832", "148833"), nodeAllowlist.size > 0)) ? stryMutAct_9fa48("148834") ? filteredRows : (stryCov_9fa48("148834"), filteredRows.filter(stryMutAct_9fa48("148835") ? () => undefined : (stryCov_9fa48("148835"), row => nodeAllowlist.has(row.nodeId)))) : filteredRows;
    const desiredByServiceId = buildDesiredReplicaCountByServiceId(options.definitionRows);
    const groupedRows = groupEndpointRows(scopedRows);
    const orderedKeys = stryMutAct_9fa48("148836") ? [...groupedRows.keys()] : (stryCov_9fa48("148836"), (stryMutAct_9fa48("148837") ? [] : (stryCov_9fa48("148837"), [...groupedRows.keys()])).sort(stryMutAct_9fa48("148838") ? () => undefined : (stryCov_9fa48("148838"), (left, right) => left.localeCompare(right))));
    const catalog = stryMutAct_9fa48("148839") ? ["Stryker was here"] : (stryCov_9fa48("148839"), []);
    for (const serviceKey of orderedKeys) {
      if (stryMutAct_9fa48("148840")) {
        {}
      } else {
        stryCov_9fa48("148840");
        const group = groupedRows.get(serviceKey);
        const replicas = stryMutAct_9fa48("148841") ? [...group.endpoints].map(endpointRow => buildReplicaRecord(endpointRow)) : (stryCov_9fa48("148841"), (stryMutAct_9fa48("148842") ? [] : (stryCov_9fa48("148842"), [...group.endpoints])).sort(stryMutAct_9fa48("148843") ? () => undefined : (stryCov_9fa48("148843"), (left, right) => left.endpointId.localeCompare(right.endpointId))).map(stryMutAct_9fa48("148844") ? () => undefined : (stryCov_9fa48("148844"), endpointRow => buildReplicaRecord(endpointRow))));
        const serviceIds = stryMutAct_9fa48("148845") ? [...new Set(replicas.map(replica => replica.serviceId))] : (stryCov_9fa48("148845"), (stryMutAct_9fa48("148846") ? [] : (stryCov_9fa48("148846"), [...new Set(replicas.map(stryMutAct_9fa48("148847") ? () => undefined : (stryCov_9fa48("148847"), replica => replica.serviceId)))])).sort(stryMutAct_9fa48("148848") ? () => undefined : (stryCov_9fa48("148848"), (left, right) => left.localeCompare(right))));
        const nodes = stryMutAct_9fa48("148849") ? [...new Set(replicas.map(replica => replica.nodeId))] : (stryCov_9fa48("148849"), (stryMutAct_9fa48("148850") ? [] : (stryCov_9fa48("148850"), [...new Set(replicas.map(stryMutAct_9fa48("148851") ? () => undefined : (stryCov_9fa48("148851"), replica => replica.nodeId)))])).sort(stryMutAct_9fa48("148852") ? () => undefined : (stryCov_9fa48("148852"), (left, right) => left.localeCompare(right))));
        const observedReplicaCount = replicas.length;
        const healthyReplicaCount = stryMutAct_9fa48("148853") ? replicas.length : (stryCov_9fa48("148853"), replicas.filter(stryMutAct_9fa48("148854") ? () => undefined : (stryCov_9fa48("148854"), replica => stryMutAct_9fa48("148857") ? replica.healthStatus !== ENDPOINT_SYNC_HEALTH.HEALTHY : stryMutAct_9fa48("148856") ? false : stryMutAct_9fa48("148855") ? true : (stryCov_9fa48("148855", "148856", "148857"), replica.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY))).length);
        const unhealthyReplicaCount = stryMutAct_9fa48("148858") ? observedReplicaCount + healthyReplicaCount : (stryCov_9fa48("148858"), observedReplicaCount - healthyReplicaCount);
        const desiredReplicaCountByServiceId = buildDesiredReplicaCountMap(serviceIds, desiredByServiceId);
        catalog.push(stryMutAct_9fa48("148859") ? {} : (stryCov_9fa48("148859"), {
          serviceKey,
          logicalServiceName: group.logicalServiceName,
          protocol: group.protocol,
          serviceIds,
          desiredReplicaCount: resolveDesiredReplicaCount(serviceIds, desiredByServiceId),
          desiredReplicaCountByServiceId,
          observedReplicaCount,
          healthyReplicaCount,
          unhealthyReplicaCount,
          health: resolveDiscoveryHealth(observedReplicaCount, healthyReplicaCount),
          nodeCount: nodes.length,
          nodes,
          replicas
        }));
      }
    }
    return catalog;
  }
}
export { SERVICE_DISCOVERY_DEFAULT, SERVICE_DISCOVERY_HEALTH, toStringAllowlist, resolveDefinitionServiceId, resolveDefinitionReplicaCount, buildDesiredReplicaCountByServiceId, buildDesiredReplicaCountMap, resolveDesiredReplicaCount, resolveDiscoveryHealth, buildReplicaRecord, buildServiceDiscoveryCatalog };