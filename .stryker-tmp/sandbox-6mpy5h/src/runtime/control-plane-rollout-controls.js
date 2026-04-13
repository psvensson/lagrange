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
import { NUM, TYPEOF } from '../constants/index.js';
const CONTROL_PLANE_ROLLOUT_CONTROL = Object.freeze(stryMutAct_9fa48("144690") ? {} : (stryCov_9fa48("144690"), {
  LIFECYCLE_PROBES: stryMutAct_9fa48("144691") ? "" : (stryCov_9fa48("144691"), 'lifecycleProbes'),
  WORK_CLASS_SCHEDULER: stryMutAct_9fa48("144692") ? "" : (stryCov_9fa48("144692"), 'workClassScheduler'),
  DURABLE_JOIN_SESSIONS: stryMutAct_9fa48("144693") ? "" : (stryCov_9fa48("144693"), 'durableJoinSessions')
}));
const CONTROL_PLANE_ROLLOUT_DEFAULT = Object.freeze(stryMutAct_9fa48("144694") ? {} : (stryCov_9fa48("144694"), {
  LIFECYCLE_PROBES: stryMutAct_9fa48("144695") ? false : (stryCov_9fa48("144695"), true),
  WORK_CLASS_SCHEDULER: stryMutAct_9fa48("144696") ? false : (stryCov_9fa48("144696"), true),
  DURABLE_JOIN_SESSIONS: stryMutAct_9fa48("144697") ? false : (stryCov_9fa48("144697"), true)
}));
const CONTROL_PLANE_ROLLOUT_REQUIRED = Object.freeze(stryMutAct_9fa48("144698") ? {} : (stryCov_9fa48("144698"), {
  BOOTSTRAP_API: Object.freeze(stryMutAct_9fa48("144699") ? [] : (stryCov_9fa48("144699"), [CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES])),
  BOOTSTRAP_SERVICE: Object.freeze(stryMutAct_9fa48("144700") ? [] : (stryCov_9fa48("144700"), [CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER])),
  NODE_JOINING_SERVICE: Object.freeze(stryMutAct_9fa48("144701") ? [] : (stryCov_9fa48("144701"), [CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER, CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS])),
  LOGS_TABLE_SERVICE: Object.freeze(stryMutAct_9fa48("144702") ? [] : (stryCov_9fa48("144702"), [CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER]))
}));
const CONTROL_PLANE_ROLLOUT_BOOLEAN = Object.freeze(stryMutAct_9fa48("144703") ? {} : (stryCov_9fa48("144703"), {
  TRUE: stryMutAct_9fa48("144704") ? "" : (stryCov_9fa48("144704"), 'true'),
  FALSE: stryMutAct_9fa48("144705") ? "" : (stryCov_9fa48("144705"), 'false'),
  ONE: stryMutAct_9fa48("144706") ? "" : (stryCov_9fa48("144706"), '1'),
  ZERO: stryMutAct_9fa48("144707") ? "" : (stryCov_9fa48("144707"), '0')
}));
const CONTROL_PLANE_ROLLOUT_ERROR = Object.freeze(stryMutAct_9fa48("144708") ? {} : (stryCov_9fa48("144708"), {
  requiredControlDisabled: stryMutAct_9fa48("144709") ? () => undefined : (stryCov_9fa48("144709"), (owner, controlName) => stryMutAct_9fa48("144710") ? `` : (stryCov_9fa48("144710"), `${owner} rollout control "${controlName}" must be true`))
}));

/**
 * Parse rollout control boolean from mixed input.
 * @param {*} value
 * @param {boolean} fallback
 * @return {boolean}
 */
function parseRolloutControlBoolean(value, fallback) {
  if (stryMutAct_9fa48("144711")) {
    {}
  } else {
    stryCov_9fa48("144711");
    if (stryMutAct_9fa48("144714") ? (value === undefined || value === null) && value === '' : stryMutAct_9fa48("144713") ? false : stryMutAct_9fa48("144712") ? true : (stryCov_9fa48("144712", "144713", "144714"), (stryMutAct_9fa48("144716") ? value === undefined && value === null : stryMutAct_9fa48("144715") ? false : (stryCov_9fa48("144715", "144716"), (stryMutAct_9fa48("144718") ? value !== undefined : stryMutAct_9fa48("144717") ? false : (stryCov_9fa48("144717", "144718"), value === undefined)) || (stryMutAct_9fa48("144720") ? value !== null : stryMutAct_9fa48("144719") ? false : (stryCov_9fa48("144719", "144720"), value === null)))) || (stryMutAct_9fa48("144722") ? value !== '' : stryMutAct_9fa48("144721") ? false : (stryCov_9fa48("144721", "144722"), value === (stryMutAct_9fa48("144723") ? "Stryker was here!" : (stryCov_9fa48("144723"), '')))))) {
      if (stryMutAct_9fa48("144724")) {
        {}
      } else {
        stryCov_9fa48("144724");
        return fallback;
      }
    }
    if (stryMutAct_9fa48("144727") ? typeof value !== TYPEOF.BOOLEAN : stryMutAct_9fa48("144726") ? false : stryMutAct_9fa48("144725") ? true : (stryCov_9fa48("144725", "144726", "144727"), typeof value === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("144728")) {
        {}
      } else {
        stryCov_9fa48("144728");
        return value;
      }
    }
    if (stryMutAct_9fa48("144731") ? typeof value !== TYPEOF.NUMBER : stryMutAct_9fa48("144730") ? false : stryMutAct_9fa48("144729") ? true : (stryCov_9fa48("144729", "144730", "144731"), typeof value === TYPEOF.NUMBER)) {
      if (stryMutAct_9fa48("144732")) {
        {}
      } else {
        stryCov_9fa48("144732");
        return stryMutAct_9fa48("144735") ? value !== NUM.ONE : stryMutAct_9fa48("144734") ? false : stryMutAct_9fa48("144733") ? true : (stryCov_9fa48("144733", "144734", "144735"), value === NUM.ONE);
      }
    }
    if (stryMutAct_9fa48("144738") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("144737") ? false : stryMutAct_9fa48("144736") ? true : (stryCov_9fa48("144736", "144737", "144738"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("144739")) {
        {}
      } else {
        stryCov_9fa48("144739");
        return fallback;
      }
    }
    const normalized = stryMutAct_9fa48("144741") ? value.toLowerCase() : stryMutAct_9fa48("144740") ? value.trim().toUpperCase() : (stryCov_9fa48("144740", "144741"), value.trim().toLowerCase());
    if (stryMutAct_9fa48("144744") ? normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.TRUE && normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ONE : stryMutAct_9fa48("144743") ? false : stryMutAct_9fa48("144742") ? true : (stryCov_9fa48("144742", "144743", "144744"), (stryMutAct_9fa48("144746") ? normalized !== CONTROL_PLANE_ROLLOUT_BOOLEAN.TRUE : stryMutAct_9fa48("144745") ? false : (stryCov_9fa48("144745", "144746"), normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.TRUE)) || (stryMutAct_9fa48("144748") ? normalized !== CONTROL_PLANE_ROLLOUT_BOOLEAN.ONE : stryMutAct_9fa48("144747") ? false : (stryCov_9fa48("144747", "144748"), normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ONE)))) {
      if (stryMutAct_9fa48("144749")) {
        {}
      } else {
        stryCov_9fa48("144749");
        return stryMutAct_9fa48("144750") ? false : (stryCov_9fa48("144750"), true);
      }
    }
    if (stryMutAct_9fa48("144753") ? normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.FALSE && normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ZERO : stryMutAct_9fa48("144752") ? false : stryMutAct_9fa48("144751") ? true : (stryCov_9fa48("144751", "144752", "144753"), (stryMutAct_9fa48("144755") ? normalized !== CONTROL_PLANE_ROLLOUT_BOOLEAN.FALSE : stryMutAct_9fa48("144754") ? false : (stryCov_9fa48("144754", "144755"), normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.FALSE)) || (stryMutAct_9fa48("144757") ? normalized !== CONTROL_PLANE_ROLLOUT_BOOLEAN.ZERO : stryMutAct_9fa48("144756") ? false : (stryCov_9fa48("144756", "144757"), normalized === CONTROL_PLANE_ROLLOUT_BOOLEAN.ZERO)))) {
      if (stryMutAct_9fa48("144758")) {
        {}
      } else {
        stryCov_9fa48("144758");
        return stryMutAct_9fa48("144759") ? true : (stryCov_9fa48("144759"), false);
      }
    }
    return fallback;
  }
}

/**
 * Resolve rollout controls with defaults.
 * @param {Object} [controls]
 * @return {Object}
 */
function resolveControlPlaneRolloutControls(controls = {}) {
  if (stryMutAct_9fa48("144760")) {
    {}
  } else {
    stryCov_9fa48("144760");
    return stryMutAct_9fa48("144761") ? {} : (stryCov_9fa48("144761"), {
      [CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES]: parseRolloutControlBoolean(controls[CONTROL_PLANE_ROLLOUT_CONTROL.LIFECYCLE_PROBES], CONTROL_PLANE_ROLLOUT_DEFAULT.LIFECYCLE_PROBES),
      [CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER]: parseRolloutControlBoolean(controls[CONTROL_PLANE_ROLLOUT_CONTROL.WORK_CLASS_SCHEDULER], CONTROL_PLANE_ROLLOUT_DEFAULT.WORK_CLASS_SCHEDULER),
      [CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS]: parseRolloutControlBoolean(controls[CONTROL_PLANE_ROLLOUT_CONTROL.DURABLE_JOIN_SESSIONS], CONTROL_PLANE_ROLLOUT_DEFAULT.DURABLE_JOIN_SESSIONS)
    });
  }
}

/**
 * Validate required rollout controls for an owner.
 * @param {Object} options
 * @param {string} options.owner
 * @param {Object} [options.controls]
 * @param {Array<string>} [options.required]
 * @return {Object}
 */
function assertRequiredControlPlaneRollout(options = {}) {
  if (stryMutAct_9fa48("144762")) {
    {}
  } else {
    stryCov_9fa48("144762");
    const owner = (stryMutAct_9fa48("144765") ? typeof options.owner === TYPEOF.STRING || options.owner.length > NUM.ZERO : stryMutAct_9fa48("144764") ? false : stryMutAct_9fa48("144763") ? true : (stryCov_9fa48("144763", "144764", "144765"), (stryMutAct_9fa48("144767") ? typeof options.owner !== TYPEOF.STRING : stryMutAct_9fa48("144766") ? true : (stryCov_9fa48("144766", "144767"), typeof options.owner === TYPEOF.STRING)) && (stryMutAct_9fa48("144770") ? options.owner.length <= NUM.ZERO : stryMutAct_9fa48("144769") ? options.owner.length >= NUM.ZERO : stryMutAct_9fa48("144768") ? true : (stryCov_9fa48("144768", "144769", "144770"), options.owner.length > NUM.ZERO)))) ? options.owner : stryMutAct_9fa48("144771") ? "" : (stryCov_9fa48("144771"), 'control-plane');
    const controls = resolveControlPlaneRolloutControls(stryMutAct_9fa48("144774") ? options.controls && {} : stryMutAct_9fa48("144773") ? false : stryMutAct_9fa48("144772") ? true : (stryCov_9fa48("144772", "144773", "144774"), options.controls || {}));
    const required = Array.isArray(options.required) ? options.required : stryMutAct_9fa48("144775") ? ["Stryker was here"] : (stryCov_9fa48("144775"), []);
    for (const controlName of required) {
      if (stryMutAct_9fa48("144776")) {
        {}
      } else {
        stryCov_9fa48("144776");
        if (stryMutAct_9fa48("144779") ? controls[controlName] === true : stryMutAct_9fa48("144778") ? false : stryMutAct_9fa48("144777") ? true : (stryCov_9fa48("144777", "144778", "144779"), controls[controlName] !== (stryMutAct_9fa48("144780") ? false : (stryCov_9fa48("144780"), true)))) {
          if (stryMutAct_9fa48("144781")) {
            {}
          } else {
            stryCov_9fa48("144781");
            throw new Error(CONTROL_PLANE_ROLLOUT_ERROR.requiredControlDisabled(owner, controlName));
          }
        }
      }
    }
    return controls;
  }
}
export { CONTROL_PLANE_ROLLOUT_CONTROL, CONTROL_PLANE_ROLLOUT_DEFAULT, CONTROL_PLANE_ROLLOUT_REQUIRED, CONTROL_PLANE_ROLLOUT_ERROR, assertRequiredControlPlaneRollout, resolveControlPlaneRolloutControls };