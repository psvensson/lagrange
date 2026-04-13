/**
 * Endpoint sync configuration parsing and validation.
 *
 * Parses environment variables for endpoint sync controller
 * behavior and returns a validated config object.
 *
 * @module runtime/endpoint-sync-config
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
import { ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES, ENDPOINT_SYNC_BOOLEAN, ENDPOINT_SYNC_DEFAULT, ENDPOINT_SYNC_ENV, ENDPOINT_SYNC_ERROR, ENDPOINT_SYNC_REGEX } from './endpoint-sync-constants.js';

/**
 * Parse a comma-separated list into trimmed non-empty values.
 *
 * @param {*} raw - Raw env value.
 * @return {Array<string>} Parsed values.
 */
function parseCsvList(raw) {
  if (stryMutAct_9fa48("144782")) {
    {}
  } else {
    stryCov_9fa48("144782");
    if (stryMutAct_9fa48("144785") ? typeof raw === TYPEOF.STRING : stryMutAct_9fa48("144784") ? false : stryMutAct_9fa48("144783") ? true : (stryCov_9fa48("144783", "144784", "144785"), typeof raw !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("144786")) {
        {}
      } else {
        stryCov_9fa48("144786");
        return stryMutAct_9fa48("144787") ? ["Stryker was here"] : (stryCov_9fa48("144787"), []);
      }
    }
    return stryMutAct_9fa48("144789") ? raw.split(ENDPOINT_SYNC_REGEX.COMMA_SPLIT).map(item => item.trim()).filter(item => item.length > 0) : stryMutAct_9fa48("144788") ? raw.trim().split(ENDPOINT_SYNC_REGEX.COMMA_SPLIT).map(item => item.trim()) : (stryCov_9fa48("144788", "144789"), raw.trim().split(ENDPOINT_SYNC_REGEX.COMMA_SPLIT).map(stryMutAct_9fa48("144790") ? () => undefined : (stryCov_9fa48("144790"), item => stryMutAct_9fa48("144791") ? item : (stryCov_9fa48("144791"), item.trim()))).filter(stryMutAct_9fa48("144792") ? () => undefined : (stryCov_9fa48("144792"), item => stryMutAct_9fa48("144796") ? item.length <= 0 : stryMutAct_9fa48("144795") ? item.length >= 0 : stryMutAct_9fa48("144794") ? false : stryMutAct_9fa48("144793") ? true : (stryCov_9fa48("144793", "144794", "144795", "144796"), item.length > 0))));
  }
}

/**
 * Parse boolean env value with validation.
 *
 * @param {*} raw - Raw env value.
 * @param {boolean} fallback - Default when value is absent.
 * @param {string} envKey - Env key for error context.
 * @param {Array<string>} errors - Mutable error list.
 * @return {boolean}
 */
function parseBooleanEnv(raw, fallback, envKey, errors) {
  if (stryMutAct_9fa48("144797")) {
    {}
  } else {
    stryCov_9fa48("144797");
    if (stryMutAct_9fa48("144800") ? (raw === undefined || raw === null) && raw === '' : stryMutAct_9fa48("144799") ? false : stryMutAct_9fa48("144798") ? true : (stryCov_9fa48("144798", "144799", "144800"), (stryMutAct_9fa48("144802") ? raw === undefined && raw === null : stryMutAct_9fa48("144801") ? false : (stryCov_9fa48("144801", "144802"), (stryMutAct_9fa48("144804") ? raw !== undefined : stryMutAct_9fa48("144803") ? false : (stryCov_9fa48("144803", "144804"), raw === undefined)) || (stryMutAct_9fa48("144806") ? raw !== null : stryMutAct_9fa48("144805") ? false : (stryCov_9fa48("144805", "144806"), raw === null)))) || (stryMutAct_9fa48("144808") ? raw !== '' : stryMutAct_9fa48("144807") ? false : (stryCov_9fa48("144807", "144808"), raw === (stryMutAct_9fa48("144809") ? "Stryker was here!" : (stryCov_9fa48("144809"), '')))))) {
      if (stryMutAct_9fa48("144810")) {
        {}
      } else {
        stryCov_9fa48("144810");
        return fallback;
      }
    }
    if (stryMutAct_9fa48("144813") ? typeof raw === TYPEOF.STRING : stryMutAct_9fa48("144812") ? false : stryMutAct_9fa48("144811") ? true : (stryCov_9fa48("144811", "144812", "144813"), typeof raw !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("144814")) {
        {}
      } else {
        stryCov_9fa48("144814");
        errors.push(stryMutAct_9fa48("144815") ? `` : (stryCov_9fa48("144815"), `${ENDPOINT_SYNC_ERROR.INVALID_BOOLEAN_PREFIX}: ${envKey}`));
        return fallback;
      }
    }
    const normalized = stryMutAct_9fa48("144817") ? raw.toLowerCase() : stryMutAct_9fa48("144816") ? raw.trim().toUpperCase() : (stryCov_9fa48("144816", "144817"), raw.trim().toLowerCase());
    if (stryMutAct_9fa48("144820") ? normalized === ENDPOINT_SYNC_BOOLEAN.TRUE && normalized === ENDPOINT_SYNC_BOOLEAN.ONE : stryMutAct_9fa48("144819") ? false : stryMutAct_9fa48("144818") ? true : (stryCov_9fa48("144818", "144819", "144820"), (stryMutAct_9fa48("144822") ? normalized !== ENDPOINT_SYNC_BOOLEAN.TRUE : stryMutAct_9fa48("144821") ? false : (stryCov_9fa48("144821", "144822"), normalized === ENDPOINT_SYNC_BOOLEAN.TRUE)) || (stryMutAct_9fa48("144824") ? normalized !== ENDPOINT_SYNC_BOOLEAN.ONE : stryMutAct_9fa48("144823") ? false : (stryCov_9fa48("144823", "144824"), normalized === ENDPOINT_SYNC_BOOLEAN.ONE)))) {
      if (stryMutAct_9fa48("144825")) {
        {}
      } else {
        stryCov_9fa48("144825");
        return stryMutAct_9fa48("144826") ? false : (stryCov_9fa48("144826"), true);
      }
    }
    if (stryMutAct_9fa48("144829") ? normalized === ENDPOINT_SYNC_BOOLEAN.FALSE && normalized === ENDPOINT_SYNC_BOOLEAN.ZERO : stryMutAct_9fa48("144828") ? false : stryMutAct_9fa48("144827") ? true : (stryCov_9fa48("144827", "144828", "144829"), (stryMutAct_9fa48("144831") ? normalized !== ENDPOINT_SYNC_BOOLEAN.FALSE : stryMutAct_9fa48("144830") ? false : (stryCov_9fa48("144830", "144831"), normalized === ENDPOINT_SYNC_BOOLEAN.FALSE)) || (stryMutAct_9fa48("144833") ? normalized !== ENDPOINT_SYNC_BOOLEAN.ZERO : stryMutAct_9fa48("144832") ? false : (stryCov_9fa48("144832", "144833"), normalized === ENDPOINT_SYNC_BOOLEAN.ZERO)))) {
      if (stryMutAct_9fa48("144834")) {
        {}
      } else {
        stryCov_9fa48("144834");
        return stryMutAct_9fa48("144835") ? true : (stryCov_9fa48("144835"), false);
      }
    }
    errors.push(stryMutAct_9fa48("144836") ? `` : (stryCov_9fa48("144836"), `${ENDPOINT_SYNC_ERROR.INVALID_BOOLEAN_PREFIX}: ${envKey}`));
    return fallback;
  }
}

/**
 * Parse positive integer env value with validation.
 *
 * @param {*} raw - Raw env value.
 * @param {number} fallback - Default when value is absent.
 * @param {string} envKey - Env key for error context.
 * @param {Array<string>} errors - Mutable error list.
 * @return {number}
 */
function parsePositiveIntegerEnv(raw, fallback, envKey, errors) {
  if (stryMutAct_9fa48("144837")) {
    {}
  } else {
    stryCov_9fa48("144837");
    if (stryMutAct_9fa48("144840") ? (raw === undefined || raw === null) && raw === '' : stryMutAct_9fa48("144839") ? false : stryMutAct_9fa48("144838") ? true : (stryCov_9fa48("144838", "144839", "144840"), (stryMutAct_9fa48("144842") ? raw === undefined && raw === null : stryMutAct_9fa48("144841") ? false : (stryCov_9fa48("144841", "144842"), (stryMutAct_9fa48("144844") ? raw !== undefined : stryMutAct_9fa48("144843") ? false : (stryCov_9fa48("144843", "144844"), raw === undefined)) || (stryMutAct_9fa48("144846") ? raw !== null : stryMutAct_9fa48("144845") ? false : (stryCov_9fa48("144845", "144846"), raw === null)))) || (stryMutAct_9fa48("144848") ? raw !== '' : stryMutAct_9fa48("144847") ? false : (stryCov_9fa48("144847", "144848"), raw === (stryMutAct_9fa48("144849") ? "Stryker was here!" : (stryCov_9fa48("144849"), '')))))) {
      if (stryMutAct_9fa48("144850")) {
        {}
      } else {
        stryCov_9fa48("144850");
        return fallback;
      }
    }
    const parsed = Number(raw);
    if (stryMutAct_9fa48("144853") ? !Number.isInteger(parsed) && parsed <= 0 : stryMutAct_9fa48("144852") ? false : stryMutAct_9fa48("144851") ? true : (stryCov_9fa48("144851", "144852", "144853"), (stryMutAct_9fa48("144854") ? Number.isInteger(parsed) : (stryCov_9fa48("144854"), !Number.isInteger(parsed))) || (stryMutAct_9fa48("144857") ? parsed > 0 : stryMutAct_9fa48("144856") ? parsed < 0 : stryMutAct_9fa48("144855") ? false : (stryCov_9fa48("144855", "144856", "144857"), parsed <= 0)))) {
      if (stryMutAct_9fa48("144858")) {
        {}
      } else {
        stryCov_9fa48("144858");
        errors.push(stryMutAct_9fa48("144859") ? `` : (stryCov_9fa48("144859"), `${ENDPOINT_SYNC_ERROR.INVALID_INTEGER_PREFIX}: ${envKey}`));
        return fallback;
      }
    }
    return parsed;
  }
}

/**
 * Normalize protocol identifiers to lowercase.
 *
 * @param {Array<string>} protocols - Parsed protocol list.
 * @return {Array<string>}
 */
function normalizeProtocols(protocols) {
  if (stryMutAct_9fa48("144860")) {
    {}
  } else {
    stryCov_9fa48("144860");
    return protocols.map(stryMutAct_9fa48("144861") ? () => undefined : (stryCov_9fa48("144861"), protocol => stryMutAct_9fa48("144862") ? protocol.toUpperCase() : (stryCov_9fa48("144862"), protocol.toLowerCase())));
  }
}

/**
 * Build endpoint-sync configuration from env values.
 *
 * @param {Object} [env=process.env] - Environment key-value map.
 * @return {{valid: boolean, errors: Array<string>, config: Object}}
 */
function buildEndpointSyncConfig(env = process.env) {
  if (stryMutAct_9fa48("144863")) {
    {}
  } else {
    stryCov_9fa48("144863");
    const errors = stryMutAct_9fa48("144864") ? ["Stryker was here"] : (stryCov_9fa48("144864"), []);
    const adminStreamUrlRaw = stryMutAct_9fa48("144867") ? env[ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL] && '' : stryMutAct_9fa48("144866") ? false : stryMutAct_9fa48("144865") ? true : (stryCov_9fa48("144865", "144866", "144867"), env[ENDPOINT_SYNC_ENV.ADMIN_STREAM_URL] || (stryMutAct_9fa48("144868") ? "Stryker was here!" : (stryCov_9fa48("144868"), '')));
    const adminStreamUrl = (stryMutAct_9fa48("144871") ? typeof adminStreamUrlRaw !== TYPEOF.STRING : stryMutAct_9fa48("144870") ? false : stryMutAct_9fa48("144869") ? true : (stryCov_9fa48("144869", "144870", "144871"), typeof adminStreamUrlRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144872") ? adminStreamUrlRaw : (stryCov_9fa48("144872"), adminStreamUrlRaw.trim()) : stryMutAct_9fa48("144873") ? "Stryker was here!" : (stryCov_9fa48("144873"), '');
    if (stryMutAct_9fa48("144876") ? adminStreamUrl.length !== 0 : stryMutAct_9fa48("144875") ? false : stryMutAct_9fa48("144874") ? true : (stryCov_9fa48("144874", "144875", "144876"), adminStreamUrl.length === 0)) {
      if (stryMutAct_9fa48("144877")) {
        {}
      } else {
        stryCov_9fa48("144877");
        errors.push(ENDPOINT_SYNC_ERROR.ADMIN_STREAM_URL_REQUIRED);
      }
    } else if (stryMutAct_9fa48("144880") ? false : stryMutAct_9fa48("144879") ? true : stryMutAct_9fa48("144878") ? ENDPOINT_SYNC_REGEX.WS_SCHEME.test(adminStreamUrl) : (stryCov_9fa48("144878", "144879", "144880"), !ENDPOINT_SYNC_REGEX.WS_SCHEME.test(adminStreamUrl))) {
      if (stryMutAct_9fa48("144881")) {
        {}
      } else {
        stryCov_9fa48("144881");
        errors.push(ENDPOINT_SYNC_ERROR.ADMIN_STREAM_URL_INVALID);
      }
    }
    const protocolAllowlistRaw = env[ENDPOINT_SYNC_ENV.PROTOCOL_ALLOWLIST];
    const protocolAllowlist = (stryMutAct_9fa48("144884") ? protocolAllowlistRaw === undefined : stryMutAct_9fa48("144883") ? false : stryMutAct_9fa48("144882") ? true : (stryCov_9fa48("144882", "144883", "144884"), protocolAllowlistRaw !== undefined)) ? normalizeProtocols(parseCsvList(protocolAllowlistRaw)) : stryMutAct_9fa48("144885") ? [] : (stryCov_9fa48("144885"), [...ENDPOINT_SYNC_DEFAULT.PROTOCOL_ALLOWLIST]);
    if (stryMutAct_9fa48("144888") ? protocolAllowlist.length !== 0 : stryMutAct_9fa48("144887") ? false : stryMutAct_9fa48("144886") ? true : (stryCov_9fa48("144886", "144887", "144888"), protocolAllowlist.length === 0)) {
      if (stryMutAct_9fa48("144889")) {
        {}
      } else {
        stryCov_9fa48("144889");
        errors.push(ENDPOINT_SYNC_ERROR.PROTOCOL_ALLOWLIST_EMPTY);
      }
    }
    const serviceIdAllowlist = parseCsvList(env[ENDPOINT_SYNC_ENV.SERVICE_ID_ALLOWLIST]);
    const unhealthyPolicyRaw = stryMutAct_9fa48("144892") ? env[ENDPOINT_SYNC_ENV.UNHEALTHY_POLICY] && ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY : stryMutAct_9fa48("144891") ? false : stryMutAct_9fa48("144890") ? true : (stryCov_9fa48("144890", "144891", "144892"), env[ENDPOINT_SYNC_ENV.UNHEALTHY_POLICY] || ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY);
    const unhealthyPolicy = (stryMutAct_9fa48("144895") ? typeof unhealthyPolicyRaw !== TYPEOF.STRING : stryMutAct_9fa48("144894") ? false : stryMutAct_9fa48("144893") ? true : (stryCov_9fa48("144893", "144894", "144895"), typeof unhealthyPolicyRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144896") ? unhealthyPolicyRaw : (stryCov_9fa48("144896"), unhealthyPolicyRaw.trim()) : stryMutAct_9fa48("144897") ? "Stryker was here!" : (stryCov_9fa48("144897"), '');
    if (stryMutAct_9fa48("144900") ? false : stryMutAct_9fa48("144899") ? true : stryMutAct_9fa48("144898") ? ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES.has(unhealthyPolicy) : (stryCov_9fa48("144898", "144899", "144900"), !ENDPOINT_SYNC_ALLOWED_UNHEALTHY_POLICIES.has(unhealthyPolicy))) {
      if (stryMutAct_9fa48("144901")) {
        {}
      } else {
        stryCov_9fa48("144901");
        errors.push(ENDPOINT_SYNC_ERROR.INVALID_UNHEALTHY_POLICY);
      }
    }
    const serviceNamePrefixRaw = stryMutAct_9fa48("144904") ? env[ENDPOINT_SYNC_ENV.SERVICE_NAME_PREFIX] && ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX : stryMutAct_9fa48("144903") ? false : stryMutAct_9fa48("144902") ? true : (stryCov_9fa48("144902", "144903", "144904"), env[ENDPOINT_SYNC_ENV.SERVICE_NAME_PREFIX] || ENDPOINT_SYNC_DEFAULT.SERVICE_NAME_PREFIX);
    const serviceNamePrefix = (stryMutAct_9fa48("144907") ? typeof serviceNamePrefixRaw !== TYPEOF.STRING : stryMutAct_9fa48("144906") ? false : stryMutAct_9fa48("144905") ? true : (stryCov_9fa48("144905", "144906", "144907"), typeof serviceNamePrefixRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144909") ? serviceNamePrefixRaw.toLowerCase() : stryMutAct_9fa48("144908") ? serviceNamePrefixRaw.trim().toUpperCase() : (stryCov_9fa48("144908", "144909"), serviceNamePrefixRaw.trim().toLowerCase()) : stryMutAct_9fa48("144910") ? "Stryker was here!" : (stryCov_9fa48("144910"), '');
    if (stryMutAct_9fa48("144913") ? serviceNamePrefix.length !== 0 : stryMutAct_9fa48("144912") ? false : stryMutAct_9fa48("144911") ? true : (stryCov_9fa48("144911", "144912", "144913"), serviceNamePrefix.length === 0)) {
      if (stryMutAct_9fa48("144914")) {
        {}
      } else {
        stryCov_9fa48("144914");
        errors.push(ENDPOINT_SYNC_ERROR.SERVICE_NAME_PREFIX_REQUIRED);
      }
    }
    const leaseNameRaw = stryMutAct_9fa48("144917") ? env[ENDPOINT_SYNC_ENV.LEASE_NAME] && ENDPOINT_SYNC_DEFAULT.LEASE_NAME : stryMutAct_9fa48("144916") ? false : stryMutAct_9fa48("144915") ? true : (stryCov_9fa48("144915", "144916", "144917"), env[ENDPOINT_SYNC_ENV.LEASE_NAME] || ENDPOINT_SYNC_DEFAULT.LEASE_NAME);
    const leaseName = (stryMutAct_9fa48("144920") ? typeof leaseNameRaw !== TYPEOF.STRING : stryMutAct_9fa48("144919") ? false : stryMutAct_9fa48("144918") ? true : (stryCov_9fa48("144918", "144919", "144920"), typeof leaseNameRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144921") ? leaseNameRaw : (stryCov_9fa48("144921"), leaseNameRaw.trim()) : stryMutAct_9fa48("144922") ? "Stryker was here!" : (stryCov_9fa48("144922"), '');
    if (stryMutAct_9fa48("144925") ? leaseName.length !== 0 : stryMutAct_9fa48("144924") ? false : stryMutAct_9fa48("144923") ? true : (stryCov_9fa48("144923", "144924", "144925"), leaseName.length === 0)) {
      if (stryMutAct_9fa48("144926")) {
        {}
      } else {
        stryCov_9fa48("144926");
        errors.push(ENDPOINT_SYNC_ERROR.LEASE_NAME_REQUIRED);
      }
    }
    const targetNamespaceRaw = stryMutAct_9fa48("144929") ? env[ENDPOINT_SYNC_ENV.TARGET_NAMESPACE] && '' : stryMutAct_9fa48("144928") ? false : stryMutAct_9fa48("144927") ? true : (stryCov_9fa48("144927", "144928", "144929"), env[ENDPOINT_SYNC_ENV.TARGET_NAMESPACE] || (stryMutAct_9fa48("144930") ? "Stryker was here!" : (stryCov_9fa48("144930"), '')));
    const targetNamespace = (stryMutAct_9fa48("144933") ? typeof targetNamespaceRaw !== TYPEOF.STRING : stryMutAct_9fa48("144932") ? false : stryMutAct_9fa48("144931") ? true : (stryCov_9fa48("144931", "144932", "144933"), typeof targetNamespaceRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144934") ? targetNamespaceRaw : (stryCov_9fa48("144934"), targetNamespaceRaw.trim()) : stryMutAct_9fa48("144935") ? "Stryker was here!" : (stryCov_9fa48("144935"), '');
    const leaseNamespaceRaw = stryMutAct_9fa48("144938") ? env[ENDPOINT_SYNC_ENV.LEASE_NAMESPACE] && '' : stryMutAct_9fa48("144937") ? false : stryMutAct_9fa48("144936") ? true : (stryCov_9fa48("144936", "144937", "144938"), env[ENDPOINT_SYNC_ENV.LEASE_NAMESPACE] || (stryMutAct_9fa48("144939") ? "Stryker was here!" : (stryCov_9fa48("144939"), '')));
    const leaseNamespace = (stryMutAct_9fa48("144942") ? typeof leaseNamespaceRaw !== TYPEOF.STRING : stryMutAct_9fa48("144941") ? false : stryMutAct_9fa48("144940") ? true : (stryCov_9fa48("144940", "144941", "144942"), typeof leaseNamespaceRaw === TYPEOF.STRING)) ? stryMutAct_9fa48("144943") ? leaseNamespaceRaw : (stryCov_9fa48("144943"), leaseNamespaceRaw.trim()) : stryMutAct_9fa48("144944") ? "Stryker was here!" : (stryCov_9fa48("144944"), '');
    const config = stryMutAct_9fa48("144945") ? {} : (stryCov_9fa48("144945"), {
      adminStreamUrl,
      adminAuthToken: stryMutAct_9fa48("144948") ? env[ENDPOINT_SYNC_ENV.ADMIN_AUTH_TOKEN] && null : stryMutAct_9fa48("144947") ? false : stryMutAct_9fa48("144946") ? true : (stryCov_9fa48("144946", "144947", "144948"), env[ENDPOINT_SYNC_ENV.ADMIN_AUTH_TOKEN] || null),
      intervalMs: parsePositiveIntegerEnv(env[ENDPOINT_SYNC_ENV.INTERVAL_MS], ENDPOINT_SYNC_DEFAULT.INTERVAL_MS, ENDPOINT_SYNC_ENV.INTERVAL_MS, errors),
      protocolAllowlist,
      serviceIdAllowlist,
      healthyOnly: parseBooleanEnv(env[ENDPOINT_SYNC_ENV.HEALTHY_ONLY], ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY, ENDPOINT_SYNC_ENV.HEALTHY_ONLY, errors),
      strictPortMode: parseBooleanEnv(env[ENDPOINT_SYNC_ENV.STRICT_PORT_MODE], ENDPOINT_SYNC_DEFAULT.STRICT_PORT_MODE, ENDPOINT_SYNC_ENV.STRICT_PORT_MODE, errors),
      unhealthyPolicy,
      maxEndpointsPerSlice: parsePositiveIntegerEnv(env[ENDPOINT_SYNC_ENV.MAX_ENDPOINTS_PER_SLICE], ENDPOINT_SYNC_DEFAULT.MAX_ENDPOINTS_PER_SLICE, ENDPOINT_SYNC_ENV.MAX_ENDPOINTS_PER_SLICE, errors),
      sourceQueryTimeoutMs: parsePositiveIntegerEnv(env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_TIMEOUT_MS], ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_TIMEOUT_MS, ENDPOINT_SYNC_ENV.SOURCE_QUERY_TIMEOUT_MS, errors),
      sourceQueryMaxRetries: parsePositiveIntegerEnv(env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_MAX_RETRIES], ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_MAX_RETRIES, ENDPOINT_SYNC_ENV.SOURCE_QUERY_MAX_RETRIES, errors),
      sourceQueryRetryDelayMs: parsePositiveIntegerEnv(env[ENDPOINT_SYNC_ENV.SOURCE_QUERY_RETRY_DELAY_MS], ENDPOINT_SYNC_DEFAULT.SOURCE_QUERY_RETRY_DELAY_MS, ENDPOINT_SYNC_ENV.SOURCE_QUERY_RETRY_DELAY_MS, errors),
      targetNamespace,
      serviceNamePrefix,
      leaderElectionEnabled: parseBooleanEnv(env[ENDPOINT_SYNC_ENV.LEADER_ELECTION_ENABLED], ENDPOINT_SYNC_DEFAULT.LEADER_ELECTION_ENABLED, ENDPOINT_SYNC_ENV.LEADER_ELECTION_ENABLED, errors),
      leaseName,
      leaseNamespace,
      metricsEnabled: parseBooleanEnv(env[ENDPOINT_SYNC_ENV.METRICS_ENABLED], ENDPOINT_SYNC_DEFAULT.METRICS_ENABLED, ENDPOINT_SYNC_ENV.METRICS_ENABLED, errors)
    });
    return stryMutAct_9fa48("144949") ? {} : (stryCov_9fa48("144949"), {
      valid: stryMutAct_9fa48("144952") ? errors.length !== 0 : stryMutAct_9fa48("144951") ? false : stryMutAct_9fa48("144950") ? true : (stryCov_9fa48("144950", "144951", "144952"), errors.length === 0),
      errors,
      config
    });
  }
}
export { parseCsvList, parseBooleanEnv, parsePositiveIntegerEnv, normalizeProtocols, buildEndpointSyncConfig };