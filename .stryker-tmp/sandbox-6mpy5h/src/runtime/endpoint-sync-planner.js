/**
 * Endpoint sync desired-state planner.
 *
 * Plans logical service exports from normalized endpoint rows,
 * including strict-port validation and deterministic grouping.
 *
 * @module runtime/endpoint-sync-planner
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
import { ENDPOINT_SYNC_ADDRESS_TYPE, ENDPOINT_SYNC_DEFAULT, ENDPOINT_SYNC_ERROR, ENDPOINT_SYNC_LIST_SEPARATOR, ENDPOINT_SYNC_REGEX } from './endpoint-sync-constants.js';
import { buildKubernetesServiceName, buildServiceKey } from './endpoint-sync-naming.js';

/**
 * Resolve address type for EndpointSlice planning.
 *
 * @param {string} address - Endpoint address.
 * @return {string} Address type identifier.
 */
function resolveAddressType(address) {
  if (stryMutAct_9fa48("146037")) {
    {}
  } else {
    stryCov_9fa48("146037");
    if (stryMutAct_9fa48("146039") ? false : stryMutAct_9fa48("146038") ? true : (stryCov_9fa48("146038", "146039"), ENDPOINT_SYNC_REGEX.IPV4.test(address))) {
      if (stryMutAct_9fa48("146040")) {
        {}
      } else {
        stryCov_9fa48("146040");
        return ENDPOINT_SYNC_ADDRESS_TYPE.IPV4;
      }
    }
    if (stryMutAct_9fa48("146043") ? address.includes(':') || ENDPOINT_SYNC_REGEX.IPV6.test(address) : stryMutAct_9fa48("146042") ? false : stryMutAct_9fa48("146041") ? true : (stryCov_9fa48("146041", "146042", "146043"), address.includes(stryMutAct_9fa48("146044") ? "" : (stryCov_9fa48("146044"), ':')) && ENDPOINT_SYNC_REGEX.IPV6.test(address))) {
      if (stryMutAct_9fa48("146045")) {
        {}
      } else {
        stryCov_9fa48("146045");
        return ENDPOINT_SYNC_ADDRESS_TYPE.IPV6;
      }
    }
    return ENDPOINT_SYNC_ADDRESS_TYPE.FQDN;
  }
}

/**
 * Group normalized rows by logical service key.
 *
 * @param {Array<Object>} rows - Filtered normalized endpoint rows.
 * @return {Map<string, Object>} Group map.
 */
function groupEndpointRows(rows) {
  if (stryMutAct_9fa48("146046")) {
    {}
  } else {
    stryCov_9fa48("146046");
    const groups = new Map();
    for (const row of rows) {
      if (stryMutAct_9fa48("146047")) {
        {}
      } else {
        stryCov_9fa48("146047");
        const key = buildServiceKey(row.logicalServiceName, row.protocol);
        if (stryMutAct_9fa48("146050") ? false : stryMutAct_9fa48("146049") ? true : stryMutAct_9fa48("146048") ? groups.has(key) : (stryCov_9fa48("146048", "146049", "146050"), !groups.has(key))) {
          if (stryMutAct_9fa48("146051")) {
            {}
          } else {
            stryCov_9fa48("146051");
            groups.set(key, stryMutAct_9fa48("146052") ? {} : (stryCov_9fa48("146052"), {
              serviceKey: key,
              logicalServiceName: row.logicalServiceName,
              protocol: row.protocol,
              endpoints: stryMutAct_9fa48("146053") ? ["Stryker was here"] : (stryCov_9fa48("146053"), [])
            }));
          }
        }
        groups.get(key).endpoints.push(row);
      }
    }
    return groups;
  }
}

/**
 * Chunk endpoint rows into fixed-size arrays.
 *
 * @param {Array<Object>} endpoints - Endpoints to chunk.
 * @param {number} maxEndpointsPerSlice - Chunk size.
 * @return {Array<Array<Object>>}
 */
function chunkEndpoints(endpoints, maxEndpointsPerSlice) {
  if (stryMutAct_9fa48("146054")) {
    {}
  } else {
    stryCov_9fa48("146054");
    if (stryMutAct_9fa48("146057") ? endpoints.length !== 0 : stryMutAct_9fa48("146056") ? false : stryMutAct_9fa48("146055") ? true : (stryCov_9fa48("146055", "146056", "146057"), endpoints.length === 0)) {
      if (stryMutAct_9fa48("146058")) {
        {}
      } else {
        stryCov_9fa48("146058");
        return stryMutAct_9fa48("146059") ? ["Stryker was here"] : (stryCov_9fa48("146059"), []);
      }
    }
    const chunks = stryMutAct_9fa48("146060") ? ["Stryker was here"] : (stryCov_9fa48("146060"), []);
    for (let idx = 0; stryMutAct_9fa48("146063") ? idx >= endpoints.length : stryMutAct_9fa48("146062") ? idx <= endpoints.length : stryMutAct_9fa48("146061") ? false : (stryCov_9fa48("146061", "146062", "146063"), idx < endpoints.length); stryMutAct_9fa48("146064") ? idx -= maxEndpointsPerSlice : (stryCov_9fa48("146064"), idx += maxEndpointsPerSlice)) {
      if (stryMutAct_9fa48("146065")) {
        {}
      } else {
        stryCov_9fa48("146065");
        chunks.push(stryMutAct_9fa48("146066") ? endpoints : (stryCov_9fa48("146066"), endpoints.slice(idx, stryMutAct_9fa48("146067") ? idx - maxEndpointsPerSlice : (stryCov_9fa48("146067"), idx + maxEndpointsPerSlice))));
      }
    }
    return chunks;
  }
}

/**
 * Build EndpointSlice planning chunks per address type.
 *
 * @param {Array<Object>} endpoints - Endpoints for one logical service.
 * @param {number} maxEndpointsPerSlice - Maximum endpoints per slice.
 * @return {Array<Object>} Planned slice records.
 */
function planEndpointSlices(endpoints, maxEndpointsPerSlice) {
  if (stryMutAct_9fa48("146068")) {
    {}
  } else {
    stryCov_9fa48("146068");
    const byAddressType = new Map();
    for (const endpoint of endpoints) {
      if (stryMutAct_9fa48("146069")) {
        {}
      } else {
        stryCov_9fa48("146069");
        const addressType = resolveAddressType(endpoint.address);
        if (stryMutAct_9fa48("146072") ? false : stryMutAct_9fa48("146071") ? true : stryMutAct_9fa48("146070") ? byAddressType.has(addressType) : (stryCov_9fa48("146070", "146071", "146072"), !byAddressType.has(addressType))) {
          if (stryMutAct_9fa48("146073")) {
            {}
          } else {
            stryCov_9fa48("146073");
            byAddressType.set(addressType, stryMutAct_9fa48("146074") ? ["Stryker was here"] : (stryCov_9fa48("146074"), []));
          }
        }
        byAddressType.get(addressType).push(endpoint);
      }
    }
    const slicePlans = stryMutAct_9fa48("146075") ? ["Stryker was here"] : (stryCov_9fa48("146075"), []);
    for (const [addressType, typedEndpoints] of byAddressType) {
      if (stryMutAct_9fa48("146076")) {
        {}
      } else {
        stryCov_9fa48("146076");
        const chunks = chunkEndpoints(typedEndpoints, maxEndpointsPerSlice);
        for (const chunk of chunks) {
          if (stryMutAct_9fa48("146077")) {
            {}
          } else {
            stryCov_9fa48("146077");
            slicePlans.push(stryMutAct_9fa48("146078") ? {} : (stryCov_9fa48("146078"), {
              addressType,
              endpoints: chunk
            }));
          }
        }
      }
    }
    return slicePlans;
  }
}

/**
 * Validate group ports under strict-port mode.
 *
 * @param {Object} group - Group with endpoints.
 * @return {{valid: boolean, ports: Array<number>}}
 */
function validateGroupPorts(group) {
  if (stryMutAct_9fa48("146079")) {
    {}
  } else {
    stryCov_9fa48("146079");
    const ports = stryMutAct_9fa48("146080") ? [...new Set(group.endpoints.map(row => row.port))] : (stryCov_9fa48("146080"), (stryMutAct_9fa48("146081") ? [] : (stryCov_9fa48("146081"), [...new Set(group.endpoints.map(stryMutAct_9fa48("146082") ? () => undefined : (stryCov_9fa48("146082"), row => row.port)))])).sort(stryMutAct_9fa48("146083") ? () => undefined : (stryCov_9fa48("146083"), (left, right) => stryMutAct_9fa48("146084") ? left + right : (stryCov_9fa48("146084"), left - right))));
    return stryMutAct_9fa48("146085") ? {} : (stryCov_9fa48("146085"), {
      valid: stryMutAct_9fa48("146088") ? ports.length !== 1 : stryMutAct_9fa48("146087") ? false : stryMutAct_9fa48("146086") ? true : (stryCov_9fa48("146086", "146087", "146088"), ports.length === 1),
      ports
    });
  }
}

/**
 * Build desired endpoint exports from filtered rows.
 *
 * @param {Array<Object>} rows - Filtered normalized rows.
 * @param {Object} [options={}] - Planner options.
 * @param {boolean} [options.strictPortMode=true]
 * @param {string} [options.serviceNamePrefix='svc']
 * @param {number} [options.maxEndpointsPerSlice=100]
 * @return {{exports: Array<Object>, conflicts: Array<Object>}}
 */
function planEndpointExports(rows, options = {}) {
  if (stryMutAct_9fa48("146089")) {
    {}
  } else {
    stryCov_9fa48("146089");
    const strictPortMode = (stryMutAct_9fa48("146092") ? options.strictPortMode !== undefined : stryMutAct_9fa48("146091") ? false : stryMutAct_9fa48("146090") ? true : (stryCov_9fa48("146090", "146091", "146092"), options.strictPortMode === undefined)) ? ENDPOINT_SYNC_DEFAULT.STRICT_PORT_MODE : stryMutAct_9fa48("146095") ? options.strictPortMode !== true : stryMutAct_9fa48("146094") ? false : stryMutAct_9fa48("146093") ? true : (stryCov_9fa48("146093", "146094", "146095"), options.strictPortMode === (stryMutAct_9fa48("146096") ? false : (stryCov_9fa48("146096"), true)));
    const serviceNamePrefix = stryMutAct_9fa48("146099") ? options.serviceNamePrefix && ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX : stryMutAct_9fa48("146098") ? false : stryMutAct_9fa48("146097") ? true : (stryCov_9fa48("146097", "146098", "146099"), options.serviceNamePrefix || ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX);
    const maxEndpointsPerSlice = stryMutAct_9fa48("146102") ? options.maxEndpointsPerSlice && ENDPOINT_SYNC_DEFAULT.MAX_ENDPOINTS_PER_SLICE : stryMutAct_9fa48("146101") ? false : stryMutAct_9fa48("146100") ? true : (stryCov_9fa48("146100", "146101", "146102"), options.maxEndpointsPerSlice || ENDPOINT_SYNC_DEFAULT.MAX_ENDPOINTS_PER_SLICE);
    const groups = groupEndpointRows(rows);
    const orderedGroupKeys = stryMutAct_9fa48("146103") ? [...groups.keys()] : (stryCov_9fa48("146103"), (stryMutAct_9fa48("146104") ? [] : (stryCov_9fa48("146104"), [...groups.keys()])).sort(stryMutAct_9fa48("146105") ? () => undefined : (stryCov_9fa48("146105"), (left, right) => left.localeCompare(right))));
    const plannedExports = stryMutAct_9fa48("146106") ? ["Stryker was here"] : (stryCov_9fa48("146106"), []);
    const conflicts = stryMutAct_9fa48("146107") ? ["Stryker was here"] : (stryCov_9fa48("146107"), []);
    for (const groupKey of orderedGroupKeys) {
      if (stryMutAct_9fa48("146108")) {
        {}
      } else {
        stryCov_9fa48("146108");
        const group = groups.get(groupKey);
        stryMutAct_9fa48("146109") ? group.endpoints : (stryCov_9fa48("146109"), group.endpoints.sort(stryMutAct_9fa48("146110") ? () => undefined : (stryCov_9fa48("146110"), (left, right) => left.endpointId.localeCompare(right.endpointId))));
        const portValidation = validateGroupPorts(group);
        if (stryMutAct_9fa48("146113") ? strictPortMode || !portValidation.valid : stryMutAct_9fa48("146112") ? false : stryMutAct_9fa48("146111") ? true : (stryCov_9fa48("146111", "146112", "146113"), strictPortMode && (stryMutAct_9fa48("146114") ? portValidation.valid : (stryCov_9fa48("146114"), !portValidation.valid)))) {
          if (stryMutAct_9fa48("146115")) {
            {}
          } else {
            stryCov_9fa48("146115");
            conflicts.push(stryMutAct_9fa48("146116") ? {} : (stryCov_9fa48("146116"), {
              serviceKey: group.serviceKey,
              logicalServiceName: group.logicalServiceName,
              protocol: group.protocol,
              ports: portValidation.ports,
              reason: ENDPOINT_SYNC_ERROR.STRICT_PORT_CONFLICT
            }));
            continue;
          }
        }
        const selectedPort = portValidation.ports[0];
        const serviceName = buildKubernetesServiceName(serviceNamePrefix, group.logicalServiceName, group.protocol);
        plannedExports.push(stryMutAct_9fa48("146117") ? {} : (stryCov_9fa48("146117"), {
          serviceKey: group.serviceKey,
          logicalServiceName: group.logicalServiceName,
          protocol: group.protocol,
          serviceName,
          port: selectedPort,
          endpointCount: group.endpoints.length,
          endpoints: group.endpoints,
          slicePlans: planEndpointSlices(group.endpoints, maxEndpointsPerSlice),
          sourceGroupKey: stryMutAct_9fa48("146118") ? group.logicalServiceName + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY - group.protocol : (stryCov_9fa48("146118"), (stryMutAct_9fa48("146119") ? group.logicalServiceName - ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY : (stryCov_9fa48("146119"), group.logicalServiceName + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY)) + group.protocol)
        }));
      }
    }
    return stryMutAct_9fa48("146120") ? {} : (stryCov_9fa48("146120"), {
      exports: plannedExports,
      conflicts
    });
  }
}
export { resolveAddressType, groupEndpointRows, chunkEndpoints, planEndpointSlices, validateGroupPorts, planEndpointExports };