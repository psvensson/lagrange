/**
 * Endpoint sync source query and row normalization.
 *
 * Builds SQL for service_endpoints source reads and normalizes
 * raw rows into a deterministic internal shape.
 *
 * @module runtime/endpoint-sync-source-query
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
import { SQL, TABLES, TYPEOF } from '../constants/index.js';
import { EP_COL, EP_META } from '../wasm-service/service-endpoint-builder.js';
import { ENDPOINT_SYNC_DEFAULT, ENDPOINT_SYNC_HEALTH, ENDPOINT_SYNC_LIST_SEPARATOR, ENDPOINT_SYNC_UNHEALTHY_POLICY } from './endpoint-sync-constants.js';
const ENDPOINT_SOURCE_COLUMN = Object.freeze(stryMutAct_9fa48("146260") ? {} : (stryCov_9fa48("146260"), {
  UPDATED_AT: stryMutAct_9fa48("146261") ? "" : (stryCov_9fa48("146261"), 'updated_at')
}));
const SOURCE_SELECT_COLUMNS = Object.freeze(stryMutAct_9fa48("146262") ? [] : (stryCov_9fa48("146262"), [EP_COL.ENDPOINT_ID, EP_COL.SERVICE_ID, EP_COL.NODE_ID, EP_COL.PROTOCOL, EP_COL.ADDRESS, EP_COL.PORT, EP_COL.HEALTH_STATUS, EP_COL.METADATA, ENDPOINT_SOURCE_COLUMN.UPDATED_AT]));
const SOURCE_SELECT_SQL = (stryMutAct_9fa48("146263") ? `` : (stryCov_9fa48("146263"), `${SQL.SELECT} ${SOURCE_SELECT_COLUMNS.join(stryMutAct_9fa48("146264") ? "" : (stryCov_9fa48("146264"), ', '))} `)) + (stryMutAct_9fa48("146265") ? `` : (stryCov_9fa48("146265"), `FROM ${TABLES.SERVICE_ENDPOINTS}`));
const SOURCE_ORDER_BY_SQL = (stryMutAct_9fa48("146266") ? `` : (stryCov_9fa48("146266"), `${SQL.ORDER_BY} `)) + (stryMutAct_9fa48("146267") ? `` : (stryCov_9fa48("146267"), `${EP_COL.SERVICE_ID}, ${EP_COL.NODE_ID}, ${EP_COL.ENDPOINT_ID}`));

/**
 * Build SQL "IN" filter clause with positional parameters.
 *
 * @param {string} fieldName - Table column name.
 * @param {Array<string>} values - Filter values.
 * @param {Array<*>} params - Mutable params array.
 * @return {string} SQL clause string.
 */
function buildInFilter(fieldName, values, params) {
  if (stryMutAct_9fa48("146268")) {
    {}
  } else {
    stryCov_9fa48("146268");
    const placeholders = values.map(value => {
      if (stryMutAct_9fa48("146269")) {
        {}
      } else {
        stryCov_9fa48("146269");
        params.push(value);
        return stryMutAct_9fa48("146270") ? `` : (stryCov_9fa48("146270"), `?${params.length}`);
      }
    });
    return stryMutAct_9fa48("146271") ? `` : (stryCov_9fa48("146271"), `${fieldName} ${SQL.IN} (${placeholders.join(stryMutAct_9fa48("146272") ? "" : (stryCov_9fa48("146272"), ', '))})`);
  }
}

/**
 * Build endpoint source SQL query and parameter list.
 *
 * @param {Object} [options={}] - Query filter options.
 * @param {Array<string>} [options.protocolAllowlist]
 * @param {Array<string>} [options.serviceIdAllowlist]
 * @param {boolean} [options.healthyOnly]
 * @return {{sql: string, params: Array<*>}}
 */
function buildEndpointSourceQuery(options = {}) {
  if (stryMutAct_9fa48("146273")) {
    {}
  } else {
    stryCov_9fa48("146273");
    const filters = stryMutAct_9fa48("146274") ? ["Stryker was here"] : (stryCov_9fa48("146274"), []);
    const params = stryMutAct_9fa48("146275") ? ["Stryker was here"] : (stryCov_9fa48("146275"), []);
    const protocolAllowlist = Array.isArray(options.protocolAllowlist) ? stryMutAct_9fa48("146276") ? options.protocolAllowlist : (stryCov_9fa48("146276"), options.protocolAllowlist.filter(stryMutAct_9fa48("146277") ? () => undefined : (stryCov_9fa48("146277"), value => stryMutAct_9fa48("146280") ? typeof value === TYPEOF.STRING || value.trim().length > 0 : stryMutAct_9fa48("146279") ? false : stryMutAct_9fa48("146278") ? true : (stryCov_9fa48("146278", "146279", "146280"), (stryMutAct_9fa48("146282") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("146281") ? true : (stryCov_9fa48("146281", "146282"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("146285") ? value.trim().length <= 0 : stryMutAct_9fa48("146284") ? value.trim().length >= 0 : stryMutAct_9fa48("146283") ? true : (stryCov_9fa48("146283", "146284", "146285"), (stryMutAct_9fa48("146286") ? value.length : (stryCov_9fa48("146286"), value.trim().length)) > 0)))))) : stryMutAct_9fa48("146287") ? ["Stryker was here"] : (stryCov_9fa48("146287"), []);
    const serviceIdAllowlist = Array.isArray(options.serviceIdAllowlist) ? stryMutAct_9fa48("146288") ? options.serviceIdAllowlist : (stryCov_9fa48("146288"), options.serviceIdAllowlist.filter(stryMutAct_9fa48("146289") ? () => undefined : (stryCov_9fa48("146289"), value => stryMutAct_9fa48("146292") ? typeof value === TYPEOF.STRING || value.trim().length > 0 : stryMutAct_9fa48("146291") ? false : stryMutAct_9fa48("146290") ? true : (stryCov_9fa48("146290", "146291", "146292"), (stryMutAct_9fa48("146294") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("146293") ? true : (stryCov_9fa48("146293", "146294"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("146297") ? value.trim().length <= 0 : stryMutAct_9fa48("146296") ? value.trim().length >= 0 : stryMutAct_9fa48("146295") ? true : (stryCov_9fa48("146295", "146296", "146297"), (stryMutAct_9fa48("146298") ? value.length : (stryCov_9fa48("146298"), value.trim().length)) > 0)))))) : stryMutAct_9fa48("146299") ? ["Stryker was here"] : (stryCov_9fa48("146299"), []);
    if (stryMutAct_9fa48("146303") ? protocolAllowlist.length <= 0 : stryMutAct_9fa48("146302") ? protocolAllowlist.length >= 0 : stryMutAct_9fa48("146301") ? false : stryMutAct_9fa48("146300") ? true : (stryCov_9fa48("146300", "146301", "146302", "146303"), protocolAllowlist.length > 0)) {
      if (stryMutAct_9fa48("146304")) {
        {}
      } else {
        stryCov_9fa48("146304");
        filters.push(buildInFilter(EP_COL.PROTOCOL, protocolAllowlist, params));
      }
    }
    if (stryMutAct_9fa48("146308") ? serviceIdAllowlist.length <= 0 : stryMutAct_9fa48("146307") ? serviceIdAllowlist.length >= 0 : stryMutAct_9fa48("146306") ? false : stryMutAct_9fa48("146305") ? true : (stryCov_9fa48("146305", "146306", "146307", "146308"), serviceIdAllowlist.length > 0)) {
      if (stryMutAct_9fa48("146309")) {
        {}
      } else {
        stryCov_9fa48("146309");
        filters.push(buildInFilter(EP_COL.SERVICE_ID, serviceIdAllowlist, params));
      }
    }
    const healthyOnly = (stryMutAct_9fa48("146312") ? options.healthyOnly !== undefined : stryMutAct_9fa48("146311") ? false : stryMutAct_9fa48("146310") ? true : (stryCov_9fa48("146310", "146311", "146312"), options.healthyOnly === undefined)) ? ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY : stryMutAct_9fa48("146315") ? options.healthyOnly !== true : stryMutAct_9fa48("146314") ? false : stryMutAct_9fa48("146313") ? true : (stryCov_9fa48("146313", "146314", "146315"), options.healthyOnly === (stryMutAct_9fa48("146316") ? false : (stryCov_9fa48("146316"), true)));
    if (stryMutAct_9fa48("146318") ? false : stryMutAct_9fa48("146317") ? true : (stryCov_9fa48("146317", "146318"), healthyOnly)) {
      if (stryMutAct_9fa48("146319")) {
        {}
      } else {
        stryCov_9fa48("146319");
        params.push(ENDPOINT_SYNC_HEALTH.HEALTHY);
        filters.push(stryMutAct_9fa48("146320") ? `` : (stryCov_9fa48("146320"), `${EP_COL.HEALTH_STATUS} = ?${params.length}`));
      }
    }
    let sql = SOURCE_SELECT_SQL;
    if (stryMutAct_9fa48("146324") ? filters.length <= 0 : stryMutAct_9fa48("146323") ? filters.length >= 0 : stryMutAct_9fa48("146322") ? false : stryMutAct_9fa48("146321") ? true : (stryCov_9fa48("146321", "146322", "146323", "146324"), filters.length > 0)) {
      if (stryMutAct_9fa48("146325")) {
        {}
      } else {
        stryCov_9fa48("146325");
        sql += stryMutAct_9fa48("146326") ? `` : (stryCov_9fa48("146326"), ` ${SQL.WHERE} ${filters.join(stryMutAct_9fa48("146327") ? `` : (stryCov_9fa48("146327"), ` ${SQL.AND} `))}`);
      }
    }
    sql += stryMutAct_9fa48("146328") ? `` : (stryCov_9fa48("146328"), ` ${SOURCE_ORDER_BY_SQL}`);
    return stryMutAct_9fa48("146329") ? {} : (stryCov_9fa48("146329"), {
      sql,
      params
    });
  }
}

/**
 * Parse endpoint metadata value.
 *
 * @param {*} metadataValue - Raw metadata field value.
 * @return {Object} Parsed metadata object.
 */
function parseEndpointMetadata(metadataValue) {
  if (stryMutAct_9fa48("146330")) {
    {}
  } else {
    stryCov_9fa48("146330");
    if (stryMutAct_9fa48("146333") ? metadataValue || typeof metadataValue === TYPEOF.OBJECT : stryMutAct_9fa48("146332") ? false : stryMutAct_9fa48("146331") ? true : (stryCov_9fa48("146331", "146332", "146333"), metadataValue && (stryMutAct_9fa48("146335") ? typeof metadataValue !== TYPEOF.OBJECT : stryMutAct_9fa48("146334") ? true : (stryCov_9fa48("146334", "146335"), typeof metadataValue === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("146336")) {
        {}
      } else {
        stryCov_9fa48("146336");
        return metadataValue;
      }
    }
    if (stryMutAct_9fa48("146339") ? typeof metadataValue !== TYPEOF.STRING && metadataValue.trim() === '' : stryMutAct_9fa48("146338") ? false : stryMutAct_9fa48("146337") ? true : (stryCov_9fa48("146337", "146338", "146339"), (stryMutAct_9fa48("146341") ? typeof metadataValue === TYPEOF.STRING : stryMutAct_9fa48("146340") ? false : (stryCov_9fa48("146340", "146341"), typeof metadataValue !== TYPEOF.STRING)) || (stryMutAct_9fa48("146343") ? metadataValue.trim() !== '' : stryMutAct_9fa48("146342") ? false : (stryCov_9fa48("146342", "146343"), (stryMutAct_9fa48("146344") ? metadataValue : (stryCov_9fa48("146344"), metadataValue.trim())) === (stryMutAct_9fa48("146345") ? "Stryker was here!" : (stryCov_9fa48("146345"), '')))))) {
      if (stryMutAct_9fa48("146346")) {
        {}
      } else {
        stryCov_9fa48("146346");
        return {};
      }
    }
    try {
      if (stryMutAct_9fa48("146347")) {
        {}
      } else {
        stryCov_9fa48("146347");
        const parsed = JSON.parse(metadataValue);
        if (stryMutAct_9fa48("146350") ? parsed || typeof parsed === TYPEOF.OBJECT : stryMutAct_9fa48("146349") ? false : stryMutAct_9fa48("146348") ? true : (stryCov_9fa48("146348", "146349", "146350"), parsed && (stryMutAct_9fa48("146352") ? typeof parsed !== TYPEOF.OBJECT : stryMutAct_9fa48("146351") ? true : (stryCov_9fa48("146351", "146352"), typeof parsed === TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("146353")) {
            {}
          } else {
            stryCov_9fa48("146353");
            return parsed;
          }
        }
        return {};
      }
    } catch (_error) {
      if (stryMutAct_9fa48("146354")) {
        {}
      } else {
        stryCov_9fa48("146354");
        return {};
      }
    }
  }
}

/**
 * Resolve logical service name from endpoint metadata and service_id.
 *
 * @param {string} serviceId - Canonical service id.
 * @param {Object} metadata - Parsed metadata object.
 * @return {string}
 */
function resolveLogicalServiceName(serviceId, metadata) {
  if (stryMutAct_9fa48("146355")) {
    {}
  } else {
    stryCov_9fa48("146355");
    const metaServiceName = metadata[EP_META.SERVICE_NAME];
    if (stryMutAct_9fa48("146358") ? typeof metaServiceName === TYPEOF.STRING || metaServiceName.trim().length > 0 : stryMutAct_9fa48("146357") ? false : stryMutAct_9fa48("146356") ? true : (stryCov_9fa48("146356", "146357", "146358"), (stryMutAct_9fa48("146360") ? typeof metaServiceName !== TYPEOF.STRING : stryMutAct_9fa48("146359") ? true : (stryCov_9fa48("146359", "146360"), typeof metaServiceName === TYPEOF.STRING)) && (stryMutAct_9fa48("146363") ? metaServiceName.trim().length <= 0 : stryMutAct_9fa48("146362") ? metaServiceName.trim().length >= 0 : stryMutAct_9fa48("146361") ? true : (stryCov_9fa48("146361", "146362", "146363"), (stryMutAct_9fa48("146364") ? metaServiceName.length : (stryCov_9fa48("146364"), metaServiceName.trim().length)) > 0)))) {
      if (stryMutAct_9fa48("146365")) {
        {}
      } else {
        stryCov_9fa48("146365");
        return stryMutAct_9fa48("146366") ? metaServiceName : (stryCov_9fa48("146366"), metaServiceName.trim());
      }
    }
    return serviceId;
  }
}

/**
 * Normalize one source row into internal endpoint shape.
 *
 * @param {Object} row - Raw source row.
 * @return {Object|null} Normalized row or null when invalid.
 */
function normalizeEndpointRow(row) {
  if (stryMutAct_9fa48("146367")) {
    {}
  } else {
    stryCov_9fa48("146367");
    if (stryMutAct_9fa48("146370") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("146369") ? false : stryMutAct_9fa48("146368") ? true : (stryCov_9fa48("146368", "146369", "146370"), (stryMutAct_9fa48("146371") ? row : (stryCov_9fa48("146371"), !row)) || (stryMutAct_9fa48("146373") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("146372") ? false : (stryCov_9fa48("146372", "146373"), typeof row !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("146374")) {
        {}
      } else {
        stryCov_9fa48("146374");
        return null;
      }
    }
    const endpointId = stryMutAct_9fa48("146377") ? row[EP_COL.ENDPOINT_ID] && row.endpoint_id : stryMutAct_9fa48("146376") ? false : stryMutAct_9fa48("146375") ? true : (stryCov_9fa48("146375", "146376", "146377"), row[EP_COL.ENDPOINT_ID] || row.endpoint_id);
    const serviceId = stryMutAct_9fa48("146380") ? row[EP_COL.SERVICE_ID] && row.service_id : stryMutAct_9fa48("146379") ? false : stryMutAct_9fa48("146378") ? true : (stryCov_9fa48("146378", "146379", "146380"), row[EP_COL.SERVICE_ID] || row.service_id);
    const nodeId = stryMutAct_9fa48("146383") ? row[EP_COL.NODE_ID] && row.node_id : stryMutAct_9fa48("146382") ? false : stryMutAct_9fa48("146381") ? true : (stryCov_9fa48("146381", "146382", "146383"), row[EP_COL.NODE_ID] || row.node_id);
    const protocolRaw = stryMutAct_9fa48("146386") ? row[EP_COL.PROTOCOL] && row.protocol : stryMutAct_9fa48("146385") ? false : stryMutAct_9fa48("146384") ? true : (stryCov_9fa48("146384", "146385", "146386"), row[EP_COL.PROTOCOL] || row.protocol);
    const address = stryMutAct_9fa48("146389") ? row[EP_COL.ADDRESS] && row.address : stryMutAct_9fa48("146388") ? false : stryMutAct_9fa48("146387") ? true : (stryCov_9fa48("146387", "146388", "146389"), row[EP_COL.ADDRESS] || row.address);
    const portRaw = stryMutAct_9fa48("146390") ? row[EP_COL.PORT] && row.port : (stryCov_9fa48("146390"), row[EP_COL.PORT] ?? row.port);
    const healthStatusRaw = stryMutAct_9fa48("146393") ? row[EP_COL.HEALTH_STATUS] && row.health_status : stryMutAct_9fa48("146392") ? false : stryMutAct_9fa48("146391") ? true : (stryCov_9fa48("146391", "146392", "146393"), row[EP_COL.HEALTH_STATUS] || row.health_status);
    const metadata = parseEndpointMetadata(stryMutAct_9fa48("146394") ? row[EP_COL.METADATA] && row.metadata : (stryCov_9fa48("146394"), row[EP_COL.METADATA] ?? row.metadata));
    const protocol = (stryMutAct_9fa48("146397") ? typeof protocolRaw !== TYPEOF.STRING : stryMutAct_9fa48("146396") ? false : stryMutAct_9fa48("146395") ? true : (stryCov_9fa48("146395", "146396", "146397"), typeof protocolRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("146399") ? protocolRaw.toUpperCase().trim() : stryMutAct_9fa48("146398") ? protocolRaw.toLowerCase() : (stryCov_9fa48("146398", "146399"), protocolRaw.toLowerCase().trim()) : stryMutAct_9fa48("146400") ? "Stryker was here!" : (stryCov_9fa48("146400"), '');
    const healthStatus = (stryMutAct_9fa48("146403") ? typeof healthStatusRaw !== TYPEOF.STRING : stryMutAct_9fa48("146402") ? false : stryMutAct_9fa48("146401") ? true : (stryCov_9fa48("146401", "146402", "146403"), typeof healthStatusRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("146405") ? healthStatusRaw.toUpperCase().trim() : stryMutAct_9fa48("146404") ? healthStatusRaw.toLowerCase() : (stryCov_9fa48("146404", "146405"), healthStatusRaw.toLowerCase().trim()) : stryMutAct_9fa48("146406") ? "Stryker was here!" : (stryCov_9fa48("146406"), '');
    const port = Number(portRaw);
    if (stryMutAct_9fa48("146409") ? typeof endpointId !== TYPEOF.STRING && endpointId.trim().length === 0 : stryMutAct_9fa48("146408") ? false : stryMutAct_9fa48("146407") ? true : (stryCov_9fa48("146407", "146408", "146409"), (stryMutAct_9fa48("146411") ? typeof endpointId === TYPEOF.STRING : stryMutAct_9fa48("146410") ? false : (stryCov_9fa48("146410", "146411"), typeof endpointId !== TYPEOF.STRING)) || (stryMutAct_9fa48("146413") ? endpointId.trim().length !== 0 : stryMutAct_9fa48("146412") ? false : (stryCov_9fa48("146412", "146413"), (stryMutAct_9fa48("146414") ? endpointId.length : (stryCov_9fa48("146414"), endpointId.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("146415")) {
        {}
      } else {
        stryCov_9fa48("146415");
        return null;
      }
    }
    if (stryMutAct_9fa48("146418") ? typeof serviceId !== TYPEOF.STRING && serviceId.trim().length === 0 : stryMutAct_9fa48("146417") ? false : stryMutAct_9fa48("146416") ? true : (stryCov_9fa48("146416", "146417", "146418"), (stryMutAct_9fa48("146420") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("146419") ? false : (stryCov_9fa48("146419", "146420"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("146422") ? serviceId.trim().length !== 0 : stryMutAct_9fa48("146421") ? false : (stryCov_9fa48("146421", "146422"), (stryMutAct_9fa48("146423") ? serviceId.length : (stryCov_9fa48("146423"), serviceId.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("146424")) {
        {}
      } else {
        stryCov_9fa48("146424");
        return null;
      }
    }
    if (stryMutAct_9fa48("146427") ? typeof nodeId !== TYPEOF.STRING && nodeId.trim().length === 0 : stryMutAct_9fa48("146426") ? false : stryMutAct_9fa48("146425") ? true : (stryCov_9fa48("146425", "146426", "146427"), (stryMutAct_9fa48("146429") ? typeof nodeId === TYPEOF.STRING : stryMutAct_9fa48("146428") ? false : (stryCov_9fa48("146428", "146429"), typeof nodeId !== TYPEOF.STRING)) || (stryMutAct_9fa48("146431") ? nodeId.trim().length !== 0 : stryMutAct_9fa48("146430") ? false : (stryCov_9fa48("146430", "146431"), (stryMutAct_9fa48("146432") ? nodeId.length : (stryCov_9fa48("146432"), nodeId.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("146433")) {
        {}
      } else {
        stryCov_9fa48("146433");
        return null;
      }
    }
    if (stryMutAct_9fa48("146436") ? typeof address !== TYPEOF.STRING && address.trim().length === 0 : stryMutAct_9fa48("146435") ? false : stryMutAct_9fa48("146434") ? true : (stryCov_9fa48("146434", "146435", "146436"), (stryMutAct_9fa48("146438") ? typeof address === TYPEOF.STRING : stryMutAct_9fa48("146437") ? false : (stryCov_9fa48("146437", "146438"), typeof address !== TYPEOF.STRING)) || (stryMutAct_9fa48("146440") ? address.trim().length !== 0 : stryMutAct_9fa48("146439") ? false : (stryCov_9fa48("146439", "146440"), (stryMutAct_9fa48("146441") ? address.length : (stryCov_9fa48("146441"), address.trim().length)) === 0)))) {
      if (stryMutAct_9fa48("146442")) {
        {}
      } else {
        stryCov_9fa48("146442");
        return null;
      }
    }
    if (stryMutAct_9fa48("146445") ? (protocol.length === 0 || !Number.isInteger(port)) && port <= 0 : stryMutAct_9fa48("146444") ? false : stryMutAct_9fa48("146443") ? true : (stryCov_9fa48("146443", "146444", "146445"), (stryMutAct_9fa48("146447") ? protocol.length === 0 && !Number.isInteger(port) : stryMutAct_9fa48("146446") ? false : (stryCov_9fa48("146446", "146447"), (stryMutAct_9fa48("146449") ? protocol.length !== 0 : stryMutAct_9fa48("146448") ? false : (stryCov_9fa48("146448", "146449"), protocol.length === 0)) || (stryMutAct_9fa48("146450") ? Number.isInteger(port) : (stryCov_9fa48("146450"), !Number.isInteger(port))))) || (stryMutAct_9fa48("146453") ? port > 0 : stryMutAct_9fa48("146452") ? port < 0 : stryMutAct_9fa48("146451") ? false : (stryCov_9fa48("146451", "146452", "146453"), port <= 0)))) {
      if (stryMutAct_9fa48("146454")) {
        {}
      } else {
        stryCov_9fa48("146454");
        return null;
      }
    }
    return stryMutAct_9fa48("146455") ? {} : (stryCov_9fa48("146455"), {
      endpointId: stryMutAct_9fa48("146456") ? endpointId : (stryCov_9fa48("146456"), endpointId.trim()),
      serviceId: stryMutAct_9fa48("146457") ? serviceId : (stryCov_9fa48("146457"), serviceId.trim()),
      logicalServiceName: resolveLogicalServiceName(stryMutAct_9fa48("146458") ? serviceId : (stryCov_9fa48("146458"), serviceId.trim()), metadata),
      nodeId: stryMutAct_9fa48("146459") ? nodeId : (stryCov_9fa48("146459"), nodeId.trim()),
      protocol,
      address: stryMutAct_9fa48("146460") ? address : (stryCov_9fa48("146460"), address.trim()),
      port,
      healthStatus,
      metadata,
      updatedAt: Number(stryMutAct_9fa48("146463") ? (row[ENDPOINT_SOURCE_COLUMN.UPDATED_AT] || row.updated_at) && 0 : stryMutAct_9fa48("146462") ? false : stryMutAct_9fa48("146461") ? true : (stryCov_9fa48("146461", "146462", "146463"), (stryMutAct_9fa48("146465") ? row[ENDPOINT_SOURCE_COLUMN.UPDATED_AT] && row.updated_at : stryMutAct_9fa48("146464") ? false : (stryCov_9fa48("146464", "146465"), row[ENDPOINT_SOURCE_COLUMN.UPDATED_AT] || row.updated_at)) || 0)),
      serviceKey: stryMutAct_9fa48("146466") ? serviceId.trim() + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY - protocol : (stryCov_9fa48("146466"), (stryMutAct_9fa48("146467") ? serviceId.trim() - ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY : (stryCov_9fa48("146467"), (stryMutAct_9fa48("146468") ? serviceId : (stryCov_9fa48("146468"), serviceId.trim())) + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY)) + protocol)
    });
  }
}

/**
 * Normalize source rows and drop invalid rows.
 *
 * @param {Array<Object>} rows - Raw source rows.
 * @return {Array<Object>} Normalized rows.
 */
function normalizeEndpointRows(rows) {
  if (stryMutAct_9fa48("146469")) {
    {}
  } else {
    stryCov_9fa48("146469");
    if (stryMutAct_9fa48("146472") ? false : stryMutAct_9fa48("146471") ? true : stryMutAct_9fa48("146470") ? Array.isArray(rows) : (stryCov_9fa48("146470", "146471", "146472"), !Array.isArray(rows))) {
      if (stryMutAct_9fa48("146473")) {
        {}
      } else {
        stryCov_9fa48("146473");
        return stryMutAct_9fa48("146474") ? ["Stryker was here"] : (stryCov_9fa48("146474"), []);
      }
    }
    return stryMutAct_9fa48("146475") ? rows.map(row => normalizeEndpointRow(row)) : (stryCov_9fa48("146475"), rows.map(stryMutAct_9fa48("146476") ? () => undefined : (stryCov_9fa48("146476"), row => normalizeEndpointRow(row))).filter(stryMutAct_9fa48("146477") ? () => undefined : (stryCov_9fa48("146477"), row => stryMutAct_9fa48("146480") ? row === null : stryMutAct_9fa48("146479") ? false : stryMutAct_9fa48("146478") ? true : (stryCov_9fa48("146478", "146479", "146480"), row !== null))));
  }
}

/**
 * Filter normalized rows by allowlists and health policy.
 *
 * @param {Array<Object>} rows - Normalized rows.
 * @param {Object} [options={}] - Filter options.
 * @param {Array<string>} [options.protocolAllowlist]
 * @param {Array<string>} [options.serviceIdAllowlist]
 * @param {boolean} [options.healthyOnly]
 * @param {string} [options.unhealthyPolicy]
 * @return {Array<Object>} Filtered rows sorted deterministically.
 */
function filterNormalizedEndpointRows(rows, options = {}) {
  if (stryMutAct_9fa48("146481")) {
    {}
  } else {
    stryCov_9fa48("146481");
    const protocolAllowlist = new Set(Array.isArray(options.protocolAllowlist) ? options.protocolAllowlist.map(stryMutAct_9fa48("146482") ? () => undefined : (stryCov_9fa48("146482"), value => stryMutAct_9fa48("146483") ? value.toUpperCase() : (stryCov_9fa48("146483"), value.toLowerCase()))) : ENDPOINT_SYNC_DEFAULT.PROTOCOL_ALLOWLIST);
    const serviceIdAllowlist = new Set(Array.isArray(options.serviceIdAllowlist) ? options.serviceIdAllowlist : ENDPOINT_SYNC_DEFAULT.SERVICE_ID_ALLOWLIST);
    const healthyOnly = (stryMutAct_9fa48("146486") ? options.healthyOnly !== undefined : stryMutAct_9fa48("146485") ? false : stryMutAct_9fa48("146484") ? true : (stryCov_9fa48("146484", "146485", "146486"), options.healthyOnly === undefined)) ? ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY : stryMutAct_9fa48("146489") ? options.healthyOnly !== true : stryMutAct_9fa48("146488") ? false : stryMutAct_9fa48("146487") ? true : (stryCov_9fa48("146487", "146488", "146489"), options.healthyOnly === (stryMutAct_9fa48("146490") ? false : (stryCov_9fa48("146490"), true)));
    const unhealthyPolicy = stryMutAct_9fa48("146493") ? options.unhealthyPolicy && ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY : stryMutAct_9fa48("146492") ? false : stryMutAct_9fa48("146491") ? true : (stryCov_9fa48("146491", "146492", "146493"), options.unhealthyPolicy || ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY);
    return stryMutAct_9fa48("146495") ? rows.sort((left, right) => {
      if (left.serviceId !== right.serviceId) {
        return left.serviceId.localeCompare(right.serviceId);
      }
      if (left.protocol !== right.protocol) {
        return left.protocol.localeCompare(right.protocol);
      }
      if (left.nodeId !== right.nodeId) {
        return left.nodeId.localeCompare(right.nodeId);
      }
      return left.endpointId.localeCompare(right.endpointId);
    }) : stryMutAct_9fa48("146494") ? rows.filter(row => {
      if (protocolAllowlist.size > 0 && !protocolAllowlist.has(row.protocol)) {
        return false;
      }
      if (serviceIdAllowlist.size > 0 && !serviceIdAllowlist.has(row.serviceId)) {
        return false;
      }
      if (healthyOnly) {
        return row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY;
      }
      if (unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE) {
        return row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY;
      }
      return true;
    }) : (stryCov_9fa48("146494", "146495"), rows.filter(row => {
      if (stryMutAct_9fa48("146496")) {
        {}
      } else {
        stryCov_9fa48("146496");
        if (stryMutAct_9fa48("146499") ? protocolAllowlist.size > 0 || !protocolAllowlist.has(row.protocol) : stryMutAct_9fa48("146498") ? false : stryMutAct_9fa48("146497") ? true : (stryCov_9fa48("146497", "146498", "146499"), (stryMutAct_9fa48("146502") ? protocolAllowlist.size <= 0 : stryMutAct_9fa48("146501") ? protocolAllowlist.size >= 0 : stryMutAct_9fa48("146500") ? true : (stryCov_9fa48("146500", "146501", "146502"), protocolAllowlist.size > 0)) && (stryMutAct_9fa48("146503") ? protocolAllowlist.has(row.protocol) : (stryCov_9fa48("146503"), !protocolAllowlist.has(row.protocol))))) {
          if (stryMutAct_9fa48("146504")) {
            {}
          } else {
            stryCov_9fa48("146504");
            return stryMutAct_9fa48("146505") ? true : (stryCov_9fa48("146505"), false);
          }
        }
        if (stryMutAct_9fa48("146508") ? serviceIdAllowlist.size > 0 || !serviceIdAllowlist.has(row.serviceId) : stryMutAct_9fa48("146507") ? false : stryMutAct_9fa48("146506") ? true : (stryCov_9fa48("146506", "146507", "146508"), (stryMutAct_9fa48("146511") ? serviceIdAllowlist.size <= 0 : stryMutAct_9fa48("146510") ? serviceIdAllowlist.size >= 0 : stryMutAct_9fa48("146509") ? true : (stryCov_9fa48("146509", "146510", "146511"), serviceIdAllowlist.size > 0)) && (stryMutAct_9fa48("146512") ? serviceIdAllowlist.has(row.serviceId) : (stryCov_9fa48("146512"), !serviceIdAllowlist.has(row.serviceId))))) {
          if (stryMutAct_9fa48("146513")) {
            {}
          } else {
            stryCov_9fa48("146513");
            return stryMutAct_9fa48("146514") ? true : (stryCov_9fa48("146514"), false);
          }
        }
        if (stryMutAct_9fa48("146516") ? false : stryMutAct_9fa48("146515") ? true : (stryCov_9fa48("146515", "146516"), healthyOnly)) {
          if (stryMutAct_9fa48("146517")) {
            {}
          } else {
            stryCov_9fa48("146517");
            return stryMutAct_9fa48("146520") ? row.healthStatus !== ENDPOINT_SYNC_HEALTH.HEALTHY : stryMutAct_9fa48("146519") ? false : stryMutAct_9fa48("146518") ? true : (stryCov_9fa48("146518", "146519", "146520"), row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY);
          }
        }
        if (stryMutAct_9fa48("146523") ? unhealthyPolicy !== ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE : stryMutAct_9fa48("146522") ? false : stryMutAct_9fa48("146521") ? true : (stryCov_9fa48("146521", "146522", "146523"), unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE)) {
          if (stryMutAct_9fa48("146524")) {
            {}
          } else {
            stryCov_9fa48("146524");
            return stryMutAct_9fa48("146527") ? row.healthStatus !== ENDPOINT_SYNC_HEALTH.HEALTHY : stryMutAct_9fa48("146526") ? false : stryMutAct_9fa48("146525") ? true : (stryCov_9fa48("146525", "146526", "146527"), row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY);
          }
        }
        return stryMutAct_9fa48("146528") ? false : (stryCov_9fa48("146528"), true);
      }
    }).sort((left, right) => {
      if (stryMutAct_9fa48("146529")) {
        {}
      } else {
        stryCov_9fa48("146529");
        if (stryMutAct_9fa48("146532") ? left.serviceId === right.serviceId : stryMutAct_9fa48("146531") ? false : stryMutAct_9fa48("146530") ? true : (stryCov_9fa48("146530", "146531", "146532"), left.serviceId !== right.serviceId)) {
          if (stryMutAct_9fa48("146533")) {
            {}
          } else {
            stryCov_9fa48("146533");
            return left.serviceId.localeCompare(right.serviceId);
          }
        }
        if (stryMutAct_9fa48("146536") ? left.protocol === right.protocol : stryMutAct_9fa48("146535") ? false : stryMutAct_9fa48("146534") ? true : (stryCov_9fa48("146534", "146535", "146536"), left.protocol !== right.protocol)) {
          if (stryMutAct_9fa48("146537")) {
            {}
          } else {
            stryCov_9fa48("146537");
            return left.protocol.localeCompare(right.protocol);
          }
        }
        if (stryMutAct_9fa48("146540") ? left.nodeId === right.nodeId : stryMutAct_9fa48("146539") ? false : stryMutAct_9fa48("146538") ? true : (stryCov_9fa48("146538", "146539", "146540"), left.nodeId !== right.nodeId)) {
          if (stryMutAct_9fa48("146541")) {
            {}
          } else {
            stryCov_9fa48("146541");
            return left.nodeId.localeCompare(right.nodeId);
          }
        }
        return left.endpointId.localeCompare(right.endpointId);
      }
    }));
  }
}
export { ENDPOINT_SOURCE_COLUMN, SOURCE_SELECT_COLUMNS, buildInFilter, buildEndpointSourceQuery, parseEndpointMetadata, resolveLogicalServiceName, normalizeEndpointRow, normalizeEndpointRows, filterNormalizedEndpointRows };