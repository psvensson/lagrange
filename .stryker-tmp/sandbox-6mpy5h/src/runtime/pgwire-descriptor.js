/**
 * PG wire runtime descriptor validation.
 *
 * Validates runtime_config shape and type constraints for
 * sys-postgres-wire service definitions. Enforces fail-closed
 * semantics: invalid or missing required config fields produce
 * explicit errors.
 *
 * Requirements: 2.4, 7.1, 10.1
 *
 * @module runtime/pgwire-descriptor
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
import { TYPEOF } from '../constants/types.js';
import { MIN_PORT, MAX_PORT } from '../constants/runtime.js';
import { META_SERVICE_RUNTIME_REF } from '../constants/wasm-meta.js';

// --- PG wire runtime config field names ---

const PGWIRE_CONFIG_FIELD = Object.freeze(stryMutAct_9fa48("147420") ? {} : (stryCov_9fa48("147420"), {
  HOST: stryMutAct_9fa48("147421") ? "" : (stryCov_9fa48("147421"), 'host'),
  PORT: stryMutAct_9fa48("147422") ? "" : (stryCov_9fa48("147422"), 'port'),
  PORT_RANGE_START: stryMutAct_9fa48("147423") ? "" : (stryCov_9fa48("147423"), 'portRangeStart'),
  PORT_RANGE_END: stryMutAct_9fa48("147424") ? "" : (stryCov_9fa48("147424"), 'portRangeEnd'),
  MAX_SESSIONS: stryMutAct_9fa48("147425") ? "" : (stryCov_9fa48("147425"), 'maxSessions'),
  AUTH_MODE: stryMutAct_9fa48("147426") ? "" : (stryCov_9fa48("147426"), 'authMode'),
  TLS_MODE: stryMutAct_9fa48("147427") ? "" : (stryCov_9fa48("147427"), 'tlsMode')
}));

// --- Allowed auth mode values ---

const PGWIRE_AUTH_MODE = Object.freeze(stryMutAct_9fa48("147428") ? {} : (stryCov_9fa48("147428"), {
  TRUST: stryMutAct_9fa48("147429") ? "" : (stryCov_9fa48("147429"), 'trust'),
  PASSWORD: stryMutAct_9fa48("147430") ? "" : (stryCov_9fa48("147430"), 'password'),
  SCRAM_SHA_256: stryMutAct_9fa48("147431") ? "" : (stryCov_9fa48("147431"), 'scram-sha-256')
}));
const ALLOWED_AUTH_MODES = Object.freeze(new Set(Object.values(PGWIRE_AUTH_MODE)));

// --- Allowed TLS mode values ---

const PGWIRE_TLS_MODE = Object.freeze(stryMutAct_9fa48("147432") ? {} : (stryCov_9fa48("147432"), {
  DISABLE: stryMutAct_9fa48("147433") ? "" : (stryCov_9fa48("147433"), 'disable'),
  PREFER: stryMutAct_9fa48("147434") ? "" : (stryCov_9fa48("147434"), 'prefer'),
  REQUIRE: stryMutAct_9fa48("147435") ? "" : (stryCov_9fa48("147435"), 'require')
}));
const ALLOWED_TLS_MODES = Object.freeze(new Set(Object.values(PGWIRE_TLS_MODE)));

// --- PG wire descriptor error messages ---

const PGWIRE_DESCRIPTOR_ERROR = Object.freeze(stryMutAct_9fa48("147436") ? {} : (stryCov_9fa48("147436"), {
  CONFIG_NOT_STRING: stryMutAct_9fa48("147437") ? "" : (stryCov_9fa48("147437"), 'runtime_config must be a string when provided'),
  CONFIG_INVALID_JSON: stryMutAct_9fa48("147438") ? "" : (stryCov_9fa48("147438"), 'runtime_config must be valid JSON when provided'),
  HOST_NOT_STRING: stryMutAct_9fa48("147439") ? "" : (stryCov_9fa48("147439"), 'host must be a string when provided'),
  HOST_EMPTY: stryMutAct_9fa48("147440") ? "" : (stryCov_9fa48("147440"), 'host must be a non-empty string when provided'),
  PORT_NOT_INTEGER: stryMutAct_9fa48("147441") ? "" : (stryCov_9fa48("147441"), 'port must be a positive integer'),
  PORT_OUT_OF_RANGE: stryMutAct_9fa48("147442") ? `` : (stryCov_9fa48("147442"), `port must be between ${MIN_PORT} and ${MAX_PORT}`),
  PORT_RANGE_START_NOT_INTEGER: stryMutAct_9fa48("147443") ? "" : (stryCov_9fa48("147443"), 'portRangeStart must be a positive integer'),
  PORT_RANGE_START_OUT_OF_RANGE: stryMutAct_9fa48("147444") ? `` : (stryCov_9fa48("147444"), `portRangeStart must be between ${MIN_PORT} and ${MAX_PORT}`),
  PORT_RANGE_END_NOT_INTEGER: stryMutAct_9fa48("147445") ? "" : (stryCov_9fa48("147445"), 'portRangeEnd must be a positive integer'),
  PORT_RANGE_END_OUT_OF_RANGE: stryMutAct_9fa48("147446") ? `` : (stryCov_9fa48("147446"), `portRangeEnd must be between ${MIN_PORT} and ${MAX_PORT}`),
  PORT_RANGE_INVERTED: stryMutAct_9fa48("147447") ? "" : (stryCov_9fa48("147447"), 'portRangeEnd must be >= portRangeStart'),
  MAX_SESSIONS_NOT_INTEGER: stryMutAct_9fa48("147448") ? "" : (stryCov_9fa48("147448"), 'maxSessions must be a positive integer'),
  AUTH_MODE_INVALID: stryMutAct_9fa48("147449") ? "" : (stryCov_9fa48("147449"), 'authMode must be one of: trust, password, scram-sha-256'),
  TLS_MODE_INVALID: stryMutAct_9fa48("147450") ? "" : (stryCov_9fa48("147450"), 'tlsMode must be one of: disable, prefer, require')
}));

// --- Validation functions ---

/**
 * Validate a port number value.
 *
 * @param {*} val - The value to check.
 * @param {string} notIntError - Error for non-integer.
 * @param {string} rangeError - Error for out-of-range.
 * @return {string|null} Error message or null if valid.
 */
function validatePort(val, notIntError, rangeError) {
  if (stryMutAct_9fa48("147451")) {
    {}
  } else {
    stryCov_9fa48("147451");
    if (stryMutAct_9fa48("147454") ? (typeof val !== TYPEOF.NUMBER || !Number.isInteger(val)) && val <= 0 : stryMutAct_9fa48("147453") ? false : stryMutAct_9fa48("147452") ? true : (stryCov_9fa48("147452", "147453", "147454"), (stryMutAct_9fa48("147456") ? typeof val !== TYPEOF.NUMBER && !Number.isInteger(val) : stryMutAct_9fa48("147455") ? false : (stryCov_9fa48("147455", "147456"), (stryMutAct_9fa48("147458") ? typeof val === TYPEOF.NUMBER : stryMutAct_9fa48("147457") ? false : (stryCov_9fa48("147457", "147458"), typeof val !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("147459") ? Number.isInteger(val) : (stryCov_9fa48("147459"), !Number.isInteger(val))))) || (stryMutAct_9fa48("147462") ? val > 0 : stryMutAct_9fa48("147461") ? val < 0 : stryMutAct_9fa48("147460") ? false : (stryCov_9fa48("147460", "147461", "147462"), val <= 0)))) {
      if (stryMutAct_9fa48("147463")) {
        {}
      } else {
        stryCov_9fa48("147463");
        return notIntError;
      }
    }
    if (stryMutAct_9fa48("147466") ? val < MIN_PORT && val > MAX_PORT : stryMutAct_9fa48("147465") ? false : stryMutAct_9fa48("147464") ? true : (stryCov_9fa48("147464", "147465", "147466"), (stryMutAct_9fa48("147469") ? val >= MIN_PORT : stryMutAct_9fa48("147468") ? val <= MIN_PORT : stryMutAct_9fa48("147467") ? false : (stryCov_9fa48("147467", "147468", "147469"), val < MIN_PORT)) || (stryMutAct_9fa48("147472") ? val <= MAX_PORT : stryMutAct_9fa48("147471") ? val >= MAX_PORT : stryMutAct_9fa48("147470") ? false : (stryCov_9fa48("147470", "147471", "147472"), val > MAX_PORT)))) {
      if (stryMutAct_9fa48("147473")) {
        {}
      } else {
        stryCov_9fa48("147473");
        return rangeError;
      }
    }
    return null;
  }
}

/**
 * Validate PG wire runtime_config JSON string.
 *
 * Checks listener config shape (host, port, port range) and
 * auth/TLS config shape. Fails closed on invalid values.
 *
 * @param {*} configStr - The runtime_config value (string or null).
 * @return {{valid: boolean, errors?: string[], config?: Object}}
 */
function validatePgwireRuntimeConfig(configStr) {
  if (stryMutAct_9fa48("147474")) {
    {}
  } else {
    stryCov_9fa48("147474");
    if (stryMutAct_9fa48("147477") ? configStr === undefined && configStr === null : stryMutAct_9fa48("147476") ? false : stryMutAct_9fa48("147475") ? true : (stryCov_9fa48("147475", "147476", "147477"), (stryMutAct_9fa48("147479") ? configStr !== undefined : stryMutAct_9fa48("147478") ? false : (stryCov_9fa48("147478", "147479"), configStr === undefined)) || (stryMutAct_9fa48("147481") ? configStr !== null : stryMutAct_9fa48("147480") ? false : (stryCov_9fa48("147480", "147481"), configStr === null)))) {
      if (stryMutAct_9fa48("147482")) {
        {}
      } else {
        stryCov_9fa48("147482");
        return stryMutAct_9fa48("147483") ? {} : (stryCov_9fa48("147483"), {
          valid: stryMutAct_9fa48("147484") ? false : (stryCov_9fa48("147484"), true)
        });
      }
    }
    if (stryMutAct_9fa48("147487") ? typeof configStr === TYPEOF.STRING : stryMutAct_9fa48("147486") ? false : stryMutAct_9fa48("147485") ? true : (stryCov_9fa48("147485", "147486", "147487"), typeof configStr !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("147488")) {
        {}
      } else {
        stryCov_9fa48("147488");
        return stryMutAct_9fa48("147489") ? {} : (stryCov_9fa48("147489"), {
          valid: stryMutAct_9fa48("147490") ? true : (stryCov_9fa48("147490"), false),
          errors: stryMutAct_9fa48("147491") ? [] : (stryCov_9fa48("147491"), [PGWIRE_DESCRIPTOR_ERROR.CONFIG_NOT_STRING])
        });
      }
    }
    let parsed;
    try {
      if (stryMutAct_9fa48("147492")) {
        {}
      } else {
        stryCov_9fa48("147492");
        parsed = JSON.parse(configStr);
      }
    } catch (_e) {
      if (stryMutAct_9fa48("147493")) {
        {}
      } else {
        stryCov_9fa48("147493");
        return stryMutAct_9fa48("147494") ? {} : (stryCov_9fa48("147494"), {
          valid: stryMutAct_9fa48("147495") ? true : (stryCov_9fa48("147495"), false),
          errors: stryMutAct_9fa48("147496") ? [] : (stryCov_9fa48("147496"), [PGWIRE_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON])
        });
      }
    }
    const errors = stryMutAct_9fa48("147497") ? ["Stryker was here"] : (stryCov_9fa48("147497"), []);

    // --- host ---
    if (stryMutAct_9fa48("147499") ? false : stryMutAct_9fa48("147498") ? true : (stryCov_9fa48("147498", "147499"), PGWIRE_CONFIG_FIELD.HOST in parsed)) {
      if (stryMutAct_9fa48("147500")) {
        {}
      } else {
        stryCov_9fa48("147500");
        const val = parsed[PGWIRE_CONFIG_FIELD.HOST];
        if (stryMutAct_9fa48("147503") ? typeof val === TYPEOF.STRING : stryMutAct_9fa48("147502") ? false : stryMutAct_9fa48("147501") ? true : (stryCov_9fa48("147501", "147502", "147503"), typeof val !== TYPEOF.STRING)) {
          if (stryMutAct_9fa48("147504")) {
            {}
          } else {
            stryCov_9fa48("147504");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.HOST_NOT_STRING);
          }
        } else if (stryMutAct_9fa48("147507") ? val.trim().length !== 0 : stryMutAct_9fa48("147506") ? false : stryMutAct_9fa48("147505") ? true : (stryCov_9fa48("147505", "147506", "147507"), (stryMutAct_9fa48("147508") ? val.length : (stryCov_9fa48("147508"), val.trim().length)) === 0)) {
          if (stryMutAct_9fa48("147509")) {
            {}
          } else {
            stryCov_9fa48("147509");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.HOST_EMPTY);
          }
        }
      }
    }

    // --- port ---
    if (stryMutAct_9fa48("147511") ? false : stryMutAct_9fa48("147510") ? true : (stryCov_9fa48("147510", "147511"), PGWIRE_CONFIG_FIELD.PORT in parsed)) {
      if (stryMutAct_9fa48("147512")) {
        {}
      } else {
        stryCov_9fa48("147512");
        const err = validatePort(parsed[PGWIRE_CONFIG_FIELD.PORT], PGWIRE_DESCRIPTOR_ERROR.PORT_NOT_INTEGER, PGWIRE_DESCRIPTOR_ERROR.PORT_OUT_OF_RANGE);
        if (stryMutAct_9fa48("147514") ? false : stryMutAct_9fa48("147513") ? true : (stryCov_9fa48("147513", "147514"), err)) errors.push(err);
      }
    }

    // --- portRangeStart ---
    if (stryMutAct_9fa48("147516") ? false : stryMutAct_9fa48("147515") ? true : (stryCov_9fa48("147515", "147516"), PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed)) {
      if (stryMutAct_9fa48("147517")) {
        {}
      } else {
        stryCov_9fa48("147517");
        const err = validatePort(parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_START], PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER, PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE);
        if (stryMutAct_9fa48("147519") ? false : stryMutAct_9fa48("147518") ? true : (stryCov_9fa48("147518", "147519"), err)) errors.push(err);
      }
    }

    // --- portRangeEnd ---
    if (stryMutAct_9fa48("147521") ? false : stryMutAct_9fa48("147520") ? true : (stryCov_9fa48("147520", "147521"), PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed)) {
      if (stryMutAct_9fa48("147522")) {
        {}
      } else {
        stryCov_9fa48("147522");
        const err = validatePort(parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_END], PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER, PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE);
        if (stryMutAct_9fa48("147524") ? false : stryMutAct_9fa48("147523") ? true : (stryCov_9fa48("147523", "147524"), err)) errors.push(err);
      }
    }

    // --- portRangeStart <= portRangeEnd ---
    if (stryMutAct_9fa48("147527") ? PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed && PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed || !errors.some(e => e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE) : stryMutAct_9fa48("147526") ? false : stryMutAct_9fa48("147525") ? true : (stryCov_9fa48("147525", "147526", "147527"), (stryMutAct_9fa48("147529") ? PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed || PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed : stryMutAct_9fa48("147528") ? true : (stryCov_9fa48("147528", "147529"), PGWIRE_CONFIG_FIELD.PORT_RANGE_START in parsed && PGWIRE_CONFIG_FIELD.PORT_RANGE_END in parsed)) && (stryMutAct_9fa48("147530") ? errors.some(e => e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE) : (stryCov_9fa48("147530"), !(stryMutAct_9fa48("147531") ? errors.every(e => e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE) : (stryCov_9fa48("147531"), errors.some(stryMutAct_9fa48("147532") ? () => undefined : (stryCov_9fa48("147532"), e => stryMutAct_9fa48("147535") ? (e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER) && e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE : stryMutAct_9fa48("147534") ? false : stryMutAct_9fa48("147533") ? true : (stryCov_9fa48("147533", "147534", "147535"), (stryMutAct_9fa48("147537") ? (e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER || e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE) && e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER : stryMutAct_9fa48("147536") ? false : (stryCov_9fa48("147536", "147537"), (stryMutAct_9fa48("147539") ? e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER && e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE : stryMutAct_9fa48("147538") ? false : (stryCov_9fa48("147538", "147539"), (stryMutAct_9fa48("147541") ? e !== PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER : stryMutAct_9fa48("147540") ? false : (stryCov_9fa48("147540", "147541"), e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_NOT_INTEGER)) || (stryMutAct_9fa48("147543") ? e !== PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE : stryMutAct_9fa48("147542") ? false : (stryCov_9fa48("147542", "147543"), e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_START_OUT_OF_RANGE)))) || (stryMutAct_9fa48("147545") ? e !== PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER : stryMutAct_9fa48("147544") ? false : (stryCov_9fa48("147544", "147545"), e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_NOT_INTEGER)))) || (stryMutAct_9fa48("147547") ? e !== PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE : stryMutAct_9fa48("147546") ? false : (stryCov_9fa48("147546", "147547"), e === PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_END_OUT_OF_RANGE))))))))))) {
      if (stryMutAct_9fa48("147548")) {
        {}
      } else {
        stryCov_9fa48("147548");
        const start = parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_START];
        const end = parsed[PGWIRE_CONFIG_FIELD.PORT_RANGE_END];
        if (stryMutAct_9fa48("147552") ? end >= start : stryMutAct_9fa48("147551") ? end <= start : stryMutAct_9fa48("147550") ? false : stryMutAct_9fa48("147549") ? true : (stryCov_9fa48("147549", "147550", "147551", "147552"), end < start)) {
          if (stryMutAct_9fa48("147553")) {
            {}
          } else {
            stryCov_9fa48("147553");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.PORT_RANGE_INVERTED);
          }
        }
      }
    }

    // --- maxSessions ---
    if (stryMutAct_9fa48("147555") ? false : stryMutAct_9fa48("147554") ? true : (stryCov_9fa48("147554", "147555"), PGWIRE_CONFIG_FIELD.MAX_SESSIONS in parsed)) {
      if (stryMutAct_9fa48("147556")) {
        {}
      } else {
        stryCov_9fa48("147556");
        const val = parsed[PGWIRE_CONFIG_FIELD.MAX_SESSIONS];
        if (stryMutAct_9fa48("147559") ? (typeof val !== TYPEOF.NUMBER || !Number.isInteger(val)) && val <= 0 : stryMutAct_9fa48("147558") ? false : stryMutAct_9fa48("147557") ? true : (stryCov_9fa48("147557", "147558", "147559"), (stryMutAct_9fa48("147561") ? typeof val !== TYPEOF.NUMBER && !Number.isInteger(val) : stryMutAct_9fa48("147560") ? false : (stryCov_9fa48("147560", "147561"), (stryMutAct_9fa48("147563") ? typeof val === TYPEOF.NUMBER : stryMutAct_9fa48("147562") ? false : (stryCov_9fa48("147562", "147563"), typeof val !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("147564") ? Number.isInteger(val) : (stryCov_9fa48("147564"), !Number.isInteger(val))))) || (stryMutAct_9fa48("147567") ? val > 0 : stryMutAct_9fa48("147566") ? val < 0 : stryMutAct_9fa48("147565") ? false : (stryCov_9fa48("147565", "147566", "147567"), val <= 0)))) {
          if (stryMutAct_9fa48("147568")) {
            {}
          } else {
            stryCov_9fa48("147568");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.MAX_SESSIONS_NOT_INTEGER);
          }
        }
      }
    }

    // --- authMode ---
    if (stryMutAct_9fa48("147570") ? false : stryMutAct_9fa48("147569") ? true : (stryCov_9fa48("147569", "147570"), PGWIRE_CONFIG_FIELD.AUTH_MODE in parsed)) {
      if (stryMutAct_9fa48("147571")) {
        {}
      } else {
        stryCov_9fa48("147571");
        if (stryMutAct_9fa48("147574") ? false : stryMutAct_9fa48("147573") ? true : stryMutAct_9fa48("147572") ? ALLOWED_AUTH_MODES.has(parsed[PGWIRE_CONFIG_FIELD.AUTH_MODE]) : (stryCov_9fa48("147572", "147573", "147574"), !ALLOWED_AUTH_MODES.has(parsed[PGWIRE_CONFIG_FIELD.AUTH_MODE]))) {
          if (stryMutAct_9fa48("147575")) {
            {}
          } else {
            stryCov_9fa48("147575");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.AUTH_MODE_INVALID);
          }
        }
      }
    }

    // --- tlsMode ---
    if (stryMutAct_9fa48("147577") ? false : stryMutAct_9fa48("147576") ? true : (stryCov_9fa48("147576", "147577"), PGWIRE_CONFIG_FIELD.TLS_MODE in parsed)) {
      if (stryMutAct_9fa48("147578")) {
        {}
      } else {
        stryCov_9fa48("147578");
        if (stryMutAct_9fa48("147581") ? false : stryMutAct_9fa48("147580") ? true : stryMutAct_9fa48("147579") ? ALLOWED_TLS_MODES.has(parsed[PGWIRE_CONFIG_FIELD.TLS_MODE]) : (stryCov_9fa48("147579", "147580", "147581"), !ALLOWED_TLS_MODES.has(parsed[PGWIRE_CONFIG_FIELD.TLS_MODE]))) {
          if (stryMutAct_9fa48("147582")) {
            {}
          } else {
            stryCov_9fa48("147582");
            errors.push(PGWIRE_DESCRIPTOR_ERROR.TLS_MODE_INVALID);
          }
        }
      }
    }
    if (stryMutAct_9fa48("147586") ? errors.length <= 0 : stryMutAct_9fa48("147585") ? errors.length >= 0 : stryMutAct_9fa48("147584") ? false : stryMutAct_9fa48("147583") ? true : (stryCov_9fa48("147583", "147584", "147585", "147586"), errors.length > 0)) {
      if (stryMutAct_9fa48("147587")) {
        {}
      } else {
        stryCov_9fa48("147587");
        return stryMutAct_9fa48("147588") ? {} : (stryCov_9fa48("147588"), {
          valid: stryMutAct_9fa48("147589") ? true : (stryCov_9fa48("147589"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("147590") ? {} : (stryCov_9fa48("147590"), {
      valid: stryMutAct_9fa48("147591") ? false : (stryCov_9fa48("147591"), true),
      config: parsed
    });
  }
}

/**
 * Check whether a runtime_ref identifies the PG wire runtime.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {boolean}
 */
function isPgwireRuntimeRef(ref) {
  if (stryMutAct_9fa48("147592")) {
    {}
  } else {
    stryCov_9fa48("147592");
    return stryMutAct_9fa48("147595") ? ref !== META_SERVICE_RUNTIME_REF.POSTGRES_WIRE : stryMutAct_9fa48("147594") ? false : stryMutAct_9fa48("147593") ? true : (stryCov_9fa48("147593", "147594", "147595"), ref === META_SERVICE_RUNTIME_REF.POSTGRES_WIRE);
  }
}
export { PGWIRE_CONFIG_FIELD, PGWIRE_AUTH_MODE, ALLOWED_AUTH_MODES, PGWIRE_TLS_MODE, ALLOWED_TLS_MODES, PGWIRE_DESCRIPTOR_ERROR, validatePgwireRuntimeConfig, isPgwireRuntimeRef };