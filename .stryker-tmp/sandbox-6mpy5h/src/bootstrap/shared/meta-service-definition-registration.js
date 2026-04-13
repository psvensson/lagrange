/**
 * Shared owner for built-in meta service-definition registration.
 *
 * Persists sys-wasm-meta, sys-admin-meta, and sys-postgres-wire definitions
 * through a caller-provided system-table upsert function.
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
import { URL } from 'node:url';
import { TYPEOF } from '../../constants/index.js';
import { SYSTEM_TABLE_NAME } from '../system-table-schemas-constants.js';
import { createAdminMetaDefinition, createWasmMetaDefinition, createPostgresWireDefinition } from '../../wasm-service/meta-service-factory.js';
import { serializeServiceDefinition } from '../../wasm-service/wasm-service-models.js';
import { META_ENDPOINT_VERSION, buildMetaServiceEndpoints } from '../../admin/admin-meta-endpoint-builder.js';
import { buildEndpointRecord } from '../../wasm-service/service-endpoint-builder.js';
import { resolveAdvertisedEndpointHost } from '../../transport/node-address-resolution.js';
const META_SERVICE_DEFINITION_REGISTRATION_ERROR = Object.freeze(stryMutAct_9fa48("29595") ? {} : (stryCov_9fa48("29595"), {
  UPSERT_REQUIRED: stryMutAct_9fa48("29596") ? "" : (stryCov_9fa48("29596"), 'Meta service definition registration requires upsertRow function'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("29597") ? "" : (stryCov_9fa48("29597"), 'Meta service endpoint registration requires nodeId'),
  ENDPOINT_ADDRESS_REQUIRED: stryMutAct_9fa48("29598") ? "" : (stryCov_9fa48("29598"), 'Meta service endpoint registration requires a valid address'),
  ENDPOINT_PORT_REQUIRED: stryMutAct_9fa48("29599") ? "" : (stryCov_9fa48("29599"), 'Meta service endpoint registration requires a valid port')
}));
const POSTGRES_WIRE_DEFAULT_PORT = 5432;

/**
 * Register built-in meta service definitions in service_definitions.
 * @param {Object} options
 * @param {Function} options.upsertRow - Async callback (tableName, row) => Promise<void>.
 * @return {Promise<string[]>} Registered service IDs.
 */
async function registerBuiltInMetaServiceDefinitions(options = {}) {
  if (stryMutAct_9fa48("29600")) {
    {}
  } else {
    stryCov_9fa48("29600");
    const {
      upsertRow
    } = options;
    if (stryMutAct_9fa48("29603") ? typeof upsertRow === TYPEOF.FUNCTION : stryMutAct_9fa48("29602") ? false : stryMutAct_9fa48("29601") ? true : (stryCov_9fa48("29601", "29602", "29603"), typeof upsertRow !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("29604")) {
        {}
      } else {
        stryCov_9fa48("29604");
        throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
      }
    }
    const definitions = stryMutAct_9fa48("29605") ? [] : (stryCov_9fa48("29605"), [createWasmMetaDefinition(), createAdminMetaDefinition(), createPostgresWireDefinition()]);
    for (const definition of definitions) {
      if (stryMutAct_9fa48("29606")) {
        {}
      } else {
        stryCov_9fa48("29606");
        const row = serializeServiceDefinition(definition);
        await upsertRow(SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, row);
      }
    }
    return definitions.map(stryMutAct_9fa48("29607") ? () => undefined : (stryCov_9fa48("29607"), definition => definition.serviceId));
  }
}

/**
 * Register built-in meta service endpoints in service_endpoints.
 * @param {Object} options
 * @param {Function} options.upsertRow - Async callback (tableName, row) => Promise<void>.
 * @param {string} options.nodeId - Hosting node identifier.
 * @param {string} [options.nodeAddress] - Host or URL string used to derive endpoint address/port.
 * @param {number} [options.wsPort] - Explicit endpoint port.
 * @return {Promise<string[]>} Registered endpoint IDs.
 */
async function registerBuiltInMetaServiceEndpoints(options = {}) {
  if (stryMutAct_9fa48("29608")) {
    {}
  } else {
    stryCov_9fa48("29608");
    const {
      upsertRow,
      nodeId,
      nodeAddress,
      advertisedNodeWsAddress,
      wsPort,
      postgresPort
    } = options;
    if (stryMutAct_9fa48("29611") ? typeof upsertRow === TYPEOF.FUNCTION : stryMutAct_9fa48("29610") ? false : stryMutAct_9fa48("29609") ? true : (stryCov_9fa48("29609", "29610", "29611"), typeof upsertRow !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("29612")) {
        {}
      } else {
        stryCov_9fa48("29612");
        throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.UPSERT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("29615") ? typeof nodeId !== TYPEOF.STRING && nodeId.length === 0 : stryMutAct_9fa48("29614") ? false : stryMutAct_9fa48("29613") ? true : (stryCov_9fa48("29613", "29614", "29615"), (stryMutAct_9fa48("29617") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("29616") ? false : (stryCov_9fa48("29616", "29617"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("29619") ? nodeId.length !== 0 : stryMutAct_9fa48("29618") ? false : (stryCov_9fa48("29618", "29619"), nodeId.length === 0)))) {
      if (stryMutAct_9fa48("29620")) {
        {}
      } else {
        stryCov_9fa48("29620");
        throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.NODE_ID_REQUIRED);
      }
    }
    const endpointAddress = resolveEndpointAddress(stryMutAct_9fa48("29621") ? {} : (stryCov_9fa48("29621"), {
      nodeAddress,
      advertisedNodeWsAddress,
      nodeId
    }));
    if (stryMutAct_9fa48("29624") ? typeof endpointAddress !== TYPEOF.STRING && endpointAddress.length === 0 : stryMutAct_9fa48("29623") ? false : stryMutAct_9fa48("29622") ? true : (stryCov_9fa48("29622", "29623", "29624"), (stryMutAct_9fa48("29626") ? typeof endpointAddress === TYPEOF.STRING : stryMutAct_9fa48("29625") ? false : (stryCov_9fa48("29625", "29626"), typeof endpointAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("29628") ? endpointAddress.length !== 0 : stryMutAct_9fa48("29627") ? false : (stryCov_9fa48("29627", "29628"), endpointAddress.length === 0)))) {
      if (stryMutAct_9fa48("29629")) {
        {}
      } else {
        stryCov_9fa48("29629");
        throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_ADDRESS_REQUIRED);
      }
    }
    const endpointPort = resolveEndpointPort(wsPort, nodeAddress);
    if (stryMutAct_9fa48("29632") ? !Number.isInteger(endpointPort) && endpointPort <= 0 : stryMutAct_9fa48("29631") ? false : stryMutAct_9fa48("29630") ? true : (stryCov_9fa48("29630", "29631", "29632"), (stryMutAct_9fa48("29633") ? Number.isInteger(endpointPort) : (stryCov_9fa48("29633"), !Number.isInteger(endpointPort))) || (stryMutAct_9fa48("29636") ? endpointPort > 0 : stryMutAct_9fa48("29635") ? endpointPort < 0 : stryMutAct_9fa48("29634") ? false : (stryCov_9fa48("29634", "29635", "29636"), endpointPort <= 0)))) {
      if (stryMutAct_9fa48("29637")) {
        {}
      } else {
        stryCov_9fa48("29637");
        throw new Error(META_SERVICE_DEFINITION_REGISTRATION_ERROR.ENDPOINT_PORT_REQUIRED);
      }
    }
    const {
      wasmMetaEndpoint,
      adminMetaEndpoint
    } = buildMetaServiceEndpoints(nodeId, endpointAddress, endpointPort);
    const resolvedPostgresPort = (stryMutAct_9fa48("29640") ? Number.isInteger(postgresPort) || postgresPort > 0 : stryMutAct_9fa48("29639") ? false : stryMutAct_9fa48("29638") ? true : (stryCov_9fa48("29638", "29639", "29640"), Number.isInteger(postgresPort) && (stryMutAct_9fa48("29643") ? postgresPort <= 0 : stryMutAct_9fa48("29642") ? postgresPort >= 0 : stryMutAct_9fa48("29641") ? true : (stryCov_9fa48("29641", "29642", "29643"), postgresPort > 0)))) ? postgresPort : POSTGRES_WIRE_DEFAULT_PORT;
    const postgresWireEndpoint = buildEndpointRecord(stryMutAct_9fa48("29644") ? {} : (stryCov_9fa48("29644"), {
      serviceDefinition: createPostgresWireDefinition(),
      nodeId,
      address: endpointAddress,
      port: resolvedPostgresPort,
      version: META_ENDPOINT_VERSION
    }));
    const endpoints = stryMutAct_9fa48("29645") ? [] : (stryCov_9fa48("29645"), [wasmMetaEndpoint, adminMetaEndpoint, postgresWireEndpoint]);
    for (const endpoint of endpoints) {
      if (stryMutAct_9fa48("29646")) {
        {}
      } else {
        stryCov_9fa48("29646");
        await upsertRow(SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS, endpoint);
      }
    }
    return endpoints.map(stryMutAct_9fa48("29647") ? () => undefined : (stryCov_9fa48("29647"), endpoint => endpoint.endpoint_id));
  }
}

/**
 * Resolve endpoint address from advertised/node transport authority.
 * @param {Object} options
 * @param {string|undefined|null} options.nodeAddress
 * @param {string|undefined|null} options.advertisedNodeWsAddress
 * @param {string} options.nodeId
 * @return {string|null}
 */
function resolveEndpointAddress(options = {}) {
  if (stryMutAct_9fa48("29648")) {
    {}
  } else {
    stryCov_9fa48("29648");
    const advertisedHost = resolveAdvertisedEndpointHost(stryMutAct_9fa48("29649") ? {} : (stryCov_9fa48("29649"), {
      advertisedAddress: options.advertisedNodeWsAddress,
      nodeAddress: options.nodeAddress,
      wsPort: null
    }));
    if (stryMutAct_9fa48("29652") ? typeof advertisedHost === TYPEOF.STRING || advertisedHost.length > 0 : stryMutAct_9fa48("29651") ? false : stryMutAct_9fa48("29650") ? true : (stryCov_9fa48("29650", "29651", "29652"), (stryMutAct_9fa48("29654") ? typeof advertisedHost !== TYPEOF.STRING : stryMutAct_9fa48("29653") ? true : (stryCov_9fa48("29653", "29654"), typeof advertisedHost === TYPEOF.STRING)) && (stryMutAct_9fa48("29657") ? advertisedHost.length <= 0 : stryMutAct_9fa48("29656") ? advertisedHost.length >= 0 : stryMutAct_9fa48("29655") ? true : (stryCov_9fa48("29655", "29656", "29657"), advertisedHost.length > 0)))) {
      if (stryMutAct_9fa48("29658")) {
        {}
      } else {
        stryCov_9fa48("29658");
        return advertisedHost;
      }
    }
    const nodeAddress = options.nodeAddress;
    if (stryMutAct_9fa48("29661") ? typeof nodeAddress !== TYPEOF.STRING && nodeAddress.length === 0 : stryMutAct_9fa48("29660") ? false : stryMutAct_9fa48("29659") ? true : (stryCov_9fa48("29659", "29660", "29661"), (stryMutAct_9fa48("29663") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("29662") ? false : (stryCov_9fa48("29662", "29663"), typeof nodeAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("29665") ? nodeAddress.length !== 0 : stryMutAct_9fa48("29664") ? false : (stryCov_9fa48("29664", "29665"), nodeAddress.length === 0)))) {
      if (stryMutAct_9fa48("29666")) {
        {}
      } else {
        stryCov_9fa48("29666");
        return null;
      }
    }
    const trimmed = stryMutAct_9fa48("29667") ? nodeAddress : (stryCov_9fa48("29667"), nodeAddress.trim());
    if (stryMutAct_9fa48("29670") ? trimmed.length !== 0 : stryMutAct_9fa48("29669") ? false : stryMutAct_9fa48("29668") ? true : (stryCov_9fa48("29668", "29669", "29670"), trimmed.length === 0)) {
      if (stryMutAct_9fa48("29671")) {
        {}
      } else {
        stryCov_9fa48("29671");
        return null;
      }
    }
    if (stryMutAct_9fa48("29673") ? false : stryMutAct_9fa48("29672") ? true : (stryCov_9fa48("29672", "29673"), trimmed.includes(stryMutAct_9fa48("29674") ? "" : (stryCov_9fa48("29674"), '://')))) {
      if (stryMutAct_9fa48("29675")) {
        {}
      } else {
        stryCov_9fa48("29675");
        try {
          if (stryMutAct_9fa48("29676")) {
            {}
          } else {
            stryCov_9fa48("29676");
            const parsed = new URL(trimmed);
            if (stryMutAct_9fa48("29678") ? false : stryMutAct_9fa48("29677") ? true : (stryCov_9fa48("29677", "29678"), parsed.hostname)) {
              if (stryMutAct_9fa48("29679")) {
                {}
              } else {
                stryCov_9fa48("29679");
                return parsed.hostname;
              }
            }
          }
        } catch (_error) {
          // Non-URL node addresses are parsed below.
        }
      }
    }
    if (stryMutAct_9fa48("29682") ? trimmed.endsWith('[') : stryMutAct_9fa48("29681") ? false : stryMutAct_9fa48("29680") ? true : (stryCov_9fa48("29680", "29681", "29682"), trimmed.startsWith(stryMutAct_9fa48("29683") ? "" : (stryCov_9fa48("29683"), '[')))) {
      if (stryMutAct_9fa48("29684")) {
        {}
      } else {
        stryCov_9fa48("29684");
        const bracketClose = trimmed.indexOf(stryMutAct_9fa48("29685") ? "" : (stryCov_9fa48("29685"), ']'));
        if (stryMutAct_9fa48("29689") ? bracketClose <= 1 : stryMutAct_9fa48("29688") ? bracketClose >= 1 : stryMutAct_9fa48("29687") ? false : stryMutAct_9fa48("29686") ? true : (stryCov_9fa48("29686", "29687", "29688", "29689"), bracketClose > 1)) {
          if (stryMutAct_9fa48("29690")) {
            {}
          } else {
            stryCov_9fa48("29690");
            return stryMutAct_9fa48("29691") ? trimmed : (stryCov_9fa48("29691"), trimmed.substring(1, bracketClose));
          }
        }
      }
    }
    const lastColon = trimmed.lastIndexOf(stryMutAct_9fa48("29692") ? "" : (stryCov_9fa48("29692"), ':'));
    if (stryMutAct_9fa48("29695") ? lastColon > 0 || trimmed.indexOf(':') === lastColon : stryMutAct_9fa48("29694") ? false : stryMutAct_9fa48("29693") ? true : (stryCov_9fa48("29693", "29694", "29695"), (stryMutAct_9fa48("29698") ? lastColon <= 0 : stryMutAct_9fa48("29697") ? lastColon >= 0 : stryMutAct_9fa48("29696") ? true : (stryCov_9fa48("29696", "29697", "29698"), lastColon > 0)) && (stryMutAct_9fa48("29700") ? trimmed.indexOf(':') !== lastColon : stryMutAct_9fa48("29699") ? true : (stryCov_9fa48("29699", "29700"), trimmed.indexOf(stryMutAct_9fa48("29701") ? "" : (stryCov_9fa48("29701"), ':')) === lastColon)))) {
      if (stryMutAct_9fa48("29702")) {
        {}
      } else {
        stryCov_9fa48("29702");
        return stryMutAct_9fa48("29703") ? trimmed : (stryCov_9fa48("29703"), trimmed.substring(0, lastColon));
      }
    }
    return trimmed;
  }
}

/**
 * Resolve endpoint port from explicit wsPort or nodeAddress.
 * @param {number|undefined|null} wsPort
 * @param {string|undefined|null} nodeAddress
 * @return {number}
 */
function resolveEndpointPort(wsPort, nodeAddress) {
  if (stryMutAct_9fa48("29704")) {
    {}
  } else {
    stryCov_9fa48("29704");
    if (stryMutAct_9fa48("29707") ? Number.isInteger(wsPort) || wsPort > 0 : stryMutAct_9fa48("29706") ? false : stryMutAct_9fa48("29705") ? true : (stryCov_9fa48("29705", "29706", "29707"), Number.isInteger(wsPort) && (stryMutAct_9fa48("29710") ? wsPort <= 0 : stryMutAct_9fa48("29709") ? wsPort >= 0 : stryMutAct_9fa48("29708") ? true : (stryCov_9fa48("29708", "29709", "29710"), wsPort > 0)))) {
      if (stryMutAct_9fa48("29711")) {
        {}
      } else {
        stryCov_9fa48("29711");
        return wsPort;
      }
    }
    if (stryMutAct_9fa48("29714") ? typeof nodeAddress !== TYPEOF.STRING && nodeAddress.length === 0 : stryMutAct_9fa48("29713") ? false : stryMutAct_9fa48("29712") ? true : (stryCov_9fa48("29712", "29713", "29714"), (stryMutAct_9fa48("29716") ? typeof nodeAddress === TYPEOF.STRING : stryMutAct_9fa48("29715") ? false : (stryCov_9fa48("29715", "29716"), typeof nodeAddress !== TYPEOF.STRING)) || (stryMutAct_9fa48("29718") ? nodeAddress.length !== 0 : stryMutAct_9fa48("29717") ? false : (stryCov_9fa48("29717", "29718"), nodeAddress.length === 0)))) {
      if (stryMutAct_9fa48("29719")) {
        {}
      } else {
        stryCov_9fa48("29719");
        return 0;
      }
    }
    const trimmed = stryMutAct_9fa48("29720") ? nodeAddress : (stryCov_9fa48("29720"), nodeAddress.trim());
    if (stryMutAct_9fa48("29723") ? trimmed.length !== 0 : stryMutAct_9fa48("29722") ? false : stryMutAct_9fa48("29721") ? true : (stryCov_9fa48("29721", "29722", "29723"), trimmed.length === 0)) {
      if (stryMutAct_9fa48("29724")) {
        {}
      } else {
        stryCov_9fa48("29724");
        return 0;
      }
    }
    if (stryMutAct_9fa48("29726") ? false : stryMutAct_9fa48("29725") ? true : (stryCov_9fa48("29725", "29726"), trimmed.includes(stryMutAct_9fa48("29727") ? "" : (stryCov_9fa48("29727"), '://')))) {
      if (stryMutAct_9fa48("29728")) {
        {}
      } else {
        stryCov_9fa48("29728");
        try {
          if (stryMutAct_9fa48("29729")) {
            {}
          } else {
            stryCov_9fa48("29729");
            const parsed = new URL(trimmed);
            const parsedPort = Number(parsed.port);
            return (stryMutAct_9fa48("29732") ? Number.isInteger(parsedPort) || parsedPort > 0 : stryMutAct_9fa48("29731") ? false : stryMutAct_9fa48("29730") ? true : (stryCov_9fa48("29730", "29731", "29732"), Number.isInteger(parsedPort) && (stryMutAct_9fa48("29735") ? parsedPort <= 0 : stryMutAct_9fa48("29734") ? parsedPort >= 0 : stryMutAct_9fa48("29733") ? true : (stryCov_9fa48("29733", "29734", "29735"), parsedPort > 0)))) ? parsedPort : 0;
          }
        } catch (_error) {
          // Non-URL node addresses are parsed below.
        }
      }
    }
    if (stryMutAct_9fa48("29738") ? trimmed.endsWith('[') : stryMutAct_9fa48("29737") ? false : stryMutAct_9fa48("29736") ? true : (stryCov_9fa48("29736", "29737", "29738"), trimmed.startsWith(stryMutAct_9fa48("29739") ? "" : (stryCov_9fa48("29739"), '[')))) {
      if (stryMutAct_9fa48("29740")) {
        {}
      } else {
        stryCov_9fa48("29740");
        const bracketClose = trimmed.indexOf(stryMutAct_9fa48("29741") ? "" : (stryCov_9fa48("29741"), ']'));
        const colonAfterBracket = trimmed.lastIndexOf(stryMutAct_9fa48("29742") ? "" : (stryCov_9fa48("29742"), ':'));
        if (stryMutAct_9fa48("29745") ? bracketClose > 1 || colonAfterBracket > bracketClose : stryMutAct_9fa48("29744") ? false : stryMutAct_9fa48("29743") ? true : (stryCov_9fa48("29743", "29744", "29745"), (stryMutAct_9fa48("29748") ? bracketClose <= 1 : stryMutAct_9fa48("29747") ? bracketClose >= 1 : stryMutAct_9fa48("29746") ? true : (stryCov_9fa48("29746", "29747", "29748"), bracketClose > 1)) && (stryMutAct_9fa48("29751") ? colonAfterBracket <= bracketClose : stryMutAct_9fa48("29750") ? colonAfterBracket >= bracketClose : stryMutAct_9fa48("29749") ? true : (stryCov_9fa48("29749", "29750", "29751"), colonAfterBracket > bracketClose)))) {
          if (stryMutAct_9fa48("29752")) {
            {}
          } else {
            stryCov_9fa48("29752");
            const bracketPort = Number(stryMutAct_9fa48("29753") ? trimmed : (stryCov_9fa48("29753"), trimmed.substring(stryMutAct_9fa48("29754") ? colonAfterBracket - 1 : (stryCov_9fa48("29754"), colonAfterBracket + 1))));
            return (stryMutAct_9fa48("29757") ? Number.isInteger(bracketPort) || bracketPort > 0 : stryMutAct_9fa48("29756") ? false : stryMutAct_9fa48("29755") ? true : (stryCov_9fa48("29755", "29756", "29757"), Number.isInteger(bracketPort) && (stryMutAct_9fa48("29760") ? bracketPort <= 0 : stryMutAct_9fa48("29759") ? bracketPort >= 0 : stryMutAct_9fa48("29758") ? true : (stryCov_9fa48("29758", "29759", "29760"), bracketPort > 0)))) ? bracketPort : 0;
          }
        }
        return 0;
      }
    }
    const lastColon = trimmed.lastIndexOf(stryMutAct_9fa48("29761") ? "" : (stryCov_9fa48("29761"), ':'));
    if (stryMutAct_9fa48("29764") ? lastColon <= 0 && trimmed.indexOf(':') !== lastColon : stryMutAct_9fa48("29763") ? false : stryMutAct_9fa48("29762") ? true : (stryCov_9fa48("29762", "29763", "29764"), (stryMutAct_9fa48("29767") ? lastColon > 0 : stryMutAct_9fa48("29766") ? lastColon < 0 : stryMutAct_9fa48("29765") ? false : (stryCov_9fa48("29765", "29766", "29767"), lastColon <= 0)) || (stryMutAct_9fa48("29769") ? trimmed.indexOf(':') === lastColon : stryMutAct_9fa48("29768") ? false : (stryCov_9fa48("29768", "29769"), trimmed.indexOf(stryMutAct_9fa48("29770") ? "" : (stryCov_9fa48("29770"), ':')) !== lastColon)))) {
      if (stryMutAct_9fa48("29771")) {
        {}
      } else {
        stryCov_9fa48("29771");
        return 0;
      }
    }
    const parsedPort = Number(stryMutAct_9fa48("29772") ? trimmed : (stryCov_9fa48("29772"), trimmed.substring(stryMutAct_9fa48("29773") ? lastColon - 1 : (stryCov_9fa48("29773"), lastColon + 1))));
    return (stryMutAct_9fa48("29776") ? Number.isInteger(parsedPort) || parsedPort > 0 : stryMutAct_9fa48("29775") ? false : stryMutAct_9fa48("29774") ? true : (stryCov_9fa48("29774", "29775", "29776"), Number.isInteger(parsedPort) && (stryMutAct_9fa48("29779") ? parsedPort <= 0 : stryMutAct_9fa48("29778") ? parsedPort >= 0 : stryMutAct_9fa48("29777") ? true : (stryCov_9fa48("29777", "29778", "29779"), parsedPort > 0)))) ? parsedPort : 0;
  }
}
export { META_SERVICE_DEFINITION_REGISTRATION_ERROR, registerBuiltInMetaServiceDefinitions, registerBuiltInMetaServiceEndpoints };