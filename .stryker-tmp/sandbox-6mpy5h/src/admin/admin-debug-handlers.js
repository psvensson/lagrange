/**
 * Debug session HTTP handlers for the admin WebSocket API.
 *
 * This module owns all debug-session REST endpoints: session CRUD,
 * breakpoints, snapshots, DAP request forwarding, playback viewer,
 * output file serving, and trace-stream WebSocket handling. The parent
 * AdminWebSocketAPI instantiates one AdminDebugHandlers and delegates
 * all debug-related calls to it.
 *
 * Single-use helpers that exist only for debug-handler logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { TRANSPORT_EVENT } from '../constants/transport.js';
import { DEBUG_METADATA_ERROR_CODE as DEBUG_METADATA_CODE, DEBUG_METADATA_ERROR_MSG as DEBUG_METADATA_ERR } from '../debug-runtime/debug-metadata-service-constants.js';
import { DEBUG_SESSION_STATUS as DEBUG_METADATA_SESSION_STATUS } from '../debug-runtime/debug-metadata-constants.js';
import { ADMIN_CONTENT_TYPE, ADMIN_DEBUG_ERROR_MSG, ADMIN_HEADER, ADMIN_LOG_MSG, ADMIN_TEST_ERROR_MSG } from './admin-constants.js';

// ── file-local constants ────────────────────────────────────────────────────
const HTTP_STATUS = Object.freeze(stryMutAct_9fa48("3538") ? {} : (stryCov_9fa48("3538"), {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
}));
const HTTP_HEADER = Object.freeze(stryMutAct_9fa48("3539") ? {} : (stryCov_9fa48("3539"), {
  CACHE_CONTROL: stryMutAct_9fa48("3540") ? "" : (stryCov_9fa48("3540"), 'Cache-Control')
}));
const HTTP_HEADER_VALUE = Object.freeze(stryMutAct_9fa48("3541") ? {} : (stryCov_9fa48("3541"), {
  NO_STORE: stryMutAct_9fa48("3542") ? "" : (stryCov_9fa48("3542"), 'no-store')
}));

// ── single-use helper functions ─────────────────────────────────────────────

/**
 * Parse comma-separated role header to string array.
 * @param {*} rolesHeader
 * @return {Array<string>}
 */
function parseHeaderRoles(rolesHeader) {
  if (stryMutAct_9fa48("3543")) {
    {}
  } else {
    stryCov_9fa48("3543");
    if (stryMutAct_9fa48("3546") ? typeof rolesHeader === TYPEOF.STRING : stryMutAct_9fa48("3545") ? false : stryMutAct_9fa48("3544") ? true : (stryCov_9fa48("3544", "3545", "3546"), typeof rolesHeader !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3547")) {
        {}
      } else {
        stryCov_9fa48("3547");
        return stryMutAct_9fa48("3548") ? ["Stryker was here"] : (stryCov_9fa48("3548"), []);
      }
    }
    return stryMutAct_9fa48("3549") ? rolesHeader.split(',').map(value => value.trim()) : (stryCov_9fa48("3549"), rolesHeader.split(stryMutAct_9fa48("3550") ? "" : (stryCov_9fa48("3550"), ',')).map(stryMutAct_9fa48("3551") ? () => undefined : (stryCov_9fa48("3551"), value => stryMutAct_9fa48("3552") ? value : (stryCov_9fa48("3552"), value.trim()))).filter(stryMutAct_9fa48("3553") ? () => undefined : (stryCov_9fa48("3553"), value => stryMutAct_9fa48("3557") ? value.length <= NUM.ZERO : stryMutAct_9fa48("3556") ? value.length >= NUM.ZERO : stryMutAct_9fa48("3555") ? false : stryMutAct_9fa48("3554") ? true : (stryCov_9fa48("3554", "3555", "3556", "3557"), value.length > NUM.ZERO))));
  }
}

/**
 * Parse limit query parameter.
 * @param {*} limitParam
 * @return {number|undefined}
 */
function parseRequestLimit(limitParam) {
  if (stryMutAct_9fa48("3558")) {
    {}
  } else {
    stryCov_9fa48("3558");
    if (stryMutAct_9fa48("3561") ? typeof limitParam !== TYPEOF.STRING : stryMutAct_9fa48("3560") ? false : stryMutAct_9fa48("3559") ? true : (stryCov_9fa48("3559", "3560", "3561"), typeof limitParam === TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3562")) {
        {}
      } else {
        stryCov_9fa48("3562");
        const parsed = Number.parseInt(limitParam, 10);
        return Number.isInteger(parsed) ? parsed : undefined;
      }
    }
    if (stryMutAct_9fa48("3564") ? false : stryMutAct_9fa48("3563") ? true : (stryCov_9fa48("3563", "3564"), Number.isInteger(limitParam))) {
      if (stryMutAct_9fa48("3565")) {
        {}
      } else {
        stryCov_9fa48("3565");
        return limitParam;
      }
    }
    return undefined;
  }
}

/**
 * Build trace stream subscription filter from query params.
 * @param {Object} query
 * @return {Object}
 */
function buildTraceStreamFilter(query) {
  if (stryMutAct_9fa48("3566")) {
    {}
  } else {
    stryCov_9fa48("3566");
    const filter = {};
    const lineagePrefix = normalizeQueryFilterValue(query.lineagePrefix);
    const level = normalizeQueryFilterValue(query.level);
    const nodeId = normalizeQueryFilterValue(query.nodeId);
    const source = normalizeQueryFilterValue(query.source);
    const levels = parseTraceLevels(query.levels);
    if (stryMutAct_9fa48("3568") ? false : stryMutAct_9fa48("3567") ? true : (stryCov_9fa48("3567", "3568"), lineagePrefix)) {
      if (stryMutAct_9fa48("3569")) {
        {}
      } else {
        stryCov_9fa48("3569");
        filter.lineagePrefix = lineagePrefix;
      }
    }
    if (stryMutAct_9fa48("3571") ? false : stryMutAct_9fa48("3570") ? true : (stryCov_9fa48("3570", "3571"), level)) {
      if (stryMutAct_9fa48("3572")) {
        {}
      } else {
        stryCov_9fa48("3572");
        filter.level = level;
      }
    }
    if (stryMutAct_9fa48("3574") ? false : stryMutAct_9fa48("3573") ? true : (stryCov_9fa48("3573", "3574"), nodeId)) {
      if (stryMutAct_9fa48("3575")) {
        {}
      } else {
        stryCov_9fa48("3575");
        filter.nodeId = nodeId;
      }
    }
    if (stryMutAct_9fa48("3577") ? false : stryMutAct_9fa48("3576") ? true : (stryCov_9fa48("3576", "3577"), source)) {
      if (stryMutAct_9fa48("3578")) {
        {}
      } else {
        stryCov_9fa48("3578");
        filter.source = source;
      }
    }
    if (stryMutAct_9fa48("3582") ? levels.length <= NUM.ZERO : stryMutAct_9fa48("3581") ? levels.length >= NUM.ZERO : stryMutAct_9fa48("3580") ? false : stryMutAct_9fa48("3579") ? true : (stryCov_9fa48("3579", "3580", "3581", "3582"), levels.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("3583")) {
        {}
      } else {
        stryCov_9fa48("3583");
        filter.levels = levels;
      }
    }
    return filter;
  }
}

/**
 * Parse comma-separated trace levels query parameter.
 * @param {*} levelsParam
 * @return {Array<string>}
 */
function parseTraceLevels(levelsParam) {
  if (stryMutAct_9fa48("3584")) {
    {}
  } else {
    stryCov_9fa48("3584");
    if (stryMutAct_9fa48("3587") ? typeof levelsParam === TYPEOF.STRING : stryMutAct_9fa48("3586") ? false : stryMutAct_9fa48("3585") ? true : (stryCov_9fa48("3585", "3586", "3587"), typeof levelsParam !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3588")) {
        {}
      } else {
        stryCov_9fa48("3588");
        return stryMutAct_9fa48("3589") ? ["Stryker was here"] : (stryCov_9fa48("3589"), []);
      }
    }
    return stryMutAct_9fa48("3590") ? levelsParam.split(',').map(value => value.trim()) : (stryCov_9fa48("3590"), levelsParam.split(stryMutAct_9fa48("3591") ? "" : (stryCov_9fa48("3591"), ',')).map(stryMutAct_9fa48("3592") ? () => undefined : (stryCov_9fa48("3592"), value => stryMutAct_9fa48("3593") ? value : (stryCov_9fa48("3593"), value.trim()))).filter(stryMutAct_9fa48("3594") ? () => undefined : (stryCov_9fa48("3594"), value => stryMutAct_9fa48("3598") ? value.length <= NUM.ZERO : stryMutAct_9fa48("3597") ? value.length >= NUM.ZERO : stryMutAct_9fa48("3596") ? false : stryMutAct_9fa48("3595") ? true : (stryCov_9fa48("3595", "3596", "3597", "3598"), value.length > NUM.ZERO))));
  }
}

/**
 * Parse one query filter value to trimmed string.
 * @param {*} value
 * @return {string|null}
 */
function normalizeQueryFilterValue(value) {
  if (stryMutAct_9fa48("3599")) {
    {}
  } else {
    stryCov_9fa48("3599");
    if (stryMutAct_9fa48("3602") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("3601") ? false : stryMutAct_9fa48("3600") ? true : (stryCov_9fa48("3600", "3601", "3602"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("3603")) {
        {}
      } else {
        stryCov_9fa48("3603");
        return null;
      }
    }
    const trimmed = stryMutAct_9fa48("3604") ? value : (stryCov_9fa48("3604"), value.trim());
    return (stryMutAct_9fa48("3608") ? trimmed.length <= NUM.ZERO : stryMutAct_9fa48("3607") ? trimmed.length >= NUM.ZERO : stryMutAct_9fa48("3606") ? false : stryMutAct_9fa48("3605") ? true : (stryCov_9fa48("3605", "3606", "3607", "3608"), trimmed.length > NUM.ZERO)) ? trimmed : null;
  }
}

/**
 * Convert snapshot payload to JSON-safe response.
 * @param {Object} snapshot
 * @return {Object}
 */
function normalizeSnapshotApiPayload(snapshot) {
  if (stryMutAct_9fa48("3609")) {
    {}
  } else {
    stryCov_9fa48("3609");
    if (stryMutAct_9fa48("3612") ? !snapshot && typeof snapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("3611") ? false : stryMutAct_9fa48("3610") ? true : (stryCov_9fa48("3610", "3611", "3612"), (stryMutAct_9fa48("3613") ? snapshot : (stryCov_9fa48("3613"), !snapshot)) || (stryMutAct_9fa48("3615") ? typeof snapshot === TYPEOF.OBJECT : stryMutAct_9fa48("3614") ? false : (stryCov_9fa48("3614", "3615"), typeof snapshot !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("3616")) {
        {}
      } else {
        stryCov_9fa48("3616");
        return snapshot;
      }
    }
    if (stryMutAct_9fa48("3619") ? !snapshot.envelope && !Buffer.isBuffer(snapshot.envelope) : stryMutAct_9fa48("3618") ? false : stryMutAct_9fa48("3617") ? true : (stryCov_9fa48("3617", "3618", "3619"), (stryMutAct_9fa48("3620") ? snapshot.envelope : (stryCov_9fa48("3620"), !snapshot.envelope)) || (stryMutAct_9fa48("3621") ? Buffer.isBuffer(snapshot.envelope) : (stryCov_9fa48("3621"), !Buffer.isBuffer(snapshot.envelope))))) {
      if (stryMutAct_9fa48("3622")) {
        {}
      } else {
        stryCov_9fa48("3622");
        return snapshot;
      }
    }
    return stryMutAct_9fa48("3623") ? {} : (stryCov_9fa48("3623"), {
      ...snapshot,
      envelopeBase64: snapshot.envelope.toString(stryMutAct_9fa48("3624") ? "" : (stryCov_9fa48("3624"), 'base64')),
      envelope: undefined
    });
  }
}

// ── AdminDebugHandlers class ────────────────────────────────────────────────

/**
 * Debug session handler class.
 *
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (test run service) are injected so this module
 * has no back-reference to AdminWebSocketAPI.
 */
class AdminDebugHandlers {
  /**
   * @param {Object} deps
   * @param {Object|null} deps.debugMetadataStore
   * @param {Object|null} deps.debugDapRouter
   * @param {Object} deps.traceCollector
   * @param {Object} deps.logger
   * @param {Object} deps.testRunService
   */
  constructor(deps = {}) {
    if (stryMutAct_9fa48("3625")) {
      {}
    } else {
      stryCov_9fa48("3625");
      this.debugMetadataStore = stryMutAct_9fa48("3628") ? deps.debugMetadataStore && null : stryMutAct_9fa48("3627") ? false : stryMutAct_9fa48("3626") ? true : (stryCov_9fa48("3626", "3627", "3628"), deps.debugMetadataStore || null);
      this.debugDapRouter = stryMutAct_9fa48("3631") ? deps.debugDapRouter && null : stryMutAct_9fa48("3630") ? false : stryMutAct_9fa48("3629") ? true : (stryCov_9fa48("3629", "3630", "3631"), deps.debugDapRouter || null);
      this.traceCollector = stryMutAct_9fa48("3634") ? deps.traceCollector && null : stryMutAct_9fa48("3633") ? false : stryMutAct_9fa48("3632") ? true : (stryCov_9fa48("3632", "3633", "3634"), deps.traceCollector || null);
      this.logger = stryMutAct_9fa48("3637") ? deps.logger && null : stryMutAct_9fa48("3636") ? false : stryMutAct_9fa48("3635") ? true : (stryCov_9fa48("3635", "3636", "3637"), deps.logger || null);
      this.testRunService = stryMutAct_9fa48("3640") ? deps.testRunService && null : stryMutAct_9fa48("3639") ? false : stryMutAct_9fa48("3638") ? true : (stryCov_9fa48("3638", "3639", "3640"), deps.testRunService || null);
    }
  }

  /**
   * Create a new debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleCreateDebugSession(request, reply) {
    if (stryMutAct_9fa48("3641")) {
      {}
    } else {
      stryCov_9fa48("3641");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3644") ? !securityContext && !store : stryMutAct_9fa48("3643") ? false : stryMutAct_9fa48("3642") ? true : (stryCov_9fa48("3642", "3643", "3644"), (stryMutAct_9fa48("3645") ? securityContext : (stryCov_9fa48("3645"), !securityContext)) || (stryMutAct_9fa48("3646") ? store : (stryCov_9fa48("3646"), !store)))) {
        if (stryMutAct_9fa48("3647")) {
          {}
        } else {
          stryCov_9fa48("3647");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3648")) {
          {}
        } else {
          stryCov_9fa48("3648");
          const session = await store.createSession(stryMutAct_9fa48("3649") ? {} : (stryCov_9fa48("3649"), {
            securityContext,
            ...(stryMutAct_9fa48("3652") ? request.body && {} : stryMutAct_9fa48("3651") ? false : stryMutAct_9fa48("3650") ? true : (stryCov_9fa48("3650", "3651", "3652"), request.body || {}))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3653") ? {} : (stryCov_9fa48("3653"), {
            session
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3654")) {
          {}
        } else {
          stryCov_9fa48("3654");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3655") ? {} : (stryCov_9fa48("3655"), {
            error: error.message,
            code: stryMutAct_9fa48("3658") ? error.code && null : stryMutAct_9fa48("3657") ? false : stryMutAct_9fa48("3656") ? true : (stryCov_9fa48("3656", "3657", "3658"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Get one debug session by ID.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleGetDebugSession(request, reply) {
    if (stryMutAct_9fa48("3659")) {
      {}
    } else {
      stryCov_9fa48("3659");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3662") ? !securityContext && !store : stryMutAct_9fa48("3661") ? false : stryMutAct_9fa48("3660") ? true : (stryCov_9fa48("3660", "3661", "3662"), (stryMutAct_9fa48("3663") ? securityContext : (stryCov_9fa48("3663"), !securityContext)) || (stryMutAct_9fa48("3664") ? store : (stryCov_9fa48("3664"), !store)))) {
        if (stryMutAct_9fa48("3665")) {
          {}
        } else {
          stryCov_9fa48("3665");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3666")) {
          {}
        } else {
          stryCov_9fa48("3666");
          const session = await store.getSession(stryMutAct_9fa48("3667") ? {} : (stryCov_9fa48("3667"), {
            securityContext,
            sessionId: request.params.sessionId
          }));
          if (stryMutAct_9fa48("3670") ? false : stryMutAct_9fa48("3669") ? true : stryMutAct_9fa48("3668") ? session : (stryCov_9fa48("3668", "3669", "3670"), !session)) {
            if (stryMutAct_9fa48("3671")) {
              {}
            } else {
              stryCov_9fa48("3671");
              reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("3672") ? {} : (stryCov_9fa48("3672"), {
                error: DEBUG_METADATA_ERR.SESSION_NOT_FOUND
              }));
              return;
            }
          }
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3673") ? {} : (stryCov_9fa48("3673"), {
            session
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3674")) {
          {}
        } else {
          stryCov_9fa48("3674");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3675") ? {} : (stryCov_9fa48("3675"), {
            error: error.message,
            code: stryMutAct_9fa48("3678") ? error.code && null : stryMutAct_9fa48("3677") ? false : stryMutAct_9fa48("3676") ? true : (stryCov_9fa48("3676", "3677", "3678"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Update or detach an existing debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleUpdateDebugSession(request, reply) {
    if (stryMutAct_9fa48("3679")) {
      {}
    } else {
      stryCov_9fa48("3679");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3682") ? !securityContext && !store : stryMutAct_9fa48("3681") ? false : stryMutAct_9fa48("3680") ? true : (stryCov_9fa48("3680", "3681", "3682"), (stryMutAct_9fa48("3683") ? securityContext : (stryCov_9fa48("3683"), !securityContext)) || (stryMutAct_9fa48("3684") ? store : (stryCov_9fa48("3684"), !store)))) {
        if (stryMutAct_9fa48("3685")) {
          {}
        } else {
          stryCov_9fa48("3685");
          return;
        }
      }
      const body = stryMutAct_9fa48("3688") ? request.body && {} : stryMutAct_9fa48("3687") ? false : stryMutAct_9fa48("3686") ? true : (stryCov_9fa48("3686", "3687", "3688"), request.body || {});
      const isDetachRequest = stryMutAct_9fa48("3691") ? body.detach === true && body.status === DEBUG_METADATA_SESSION_STATUS.DETACHED : stryMutAct_9fa48("3690") ? false : stryMutAct_9fa48("3689") ? true : (stryCov_9fa48("3689", "3690", "3691"), (stryMutAct_9fa48("3693") ? body.detach !== true : stryMutAct_9fa48("3692") ? false : (stryCov_9fa48("3692", "3693"), body.detach === (stryMutAct_9fa48("3694") ? false : (stryCov_9fa48("3694"), true)))) || (stryMutAct_9fa48("3696") ? body.status !== DEBUG_METADATA_SESSION_STATUS.DETACHED : stryMutAct_9fa48("3695") ? false : (stryCov_9fa48("3695", "3696"), body.status === DEBUG_METADATA_SESSION_STATUS.DETACHED)));
      try {
        if (stryMutAct_9fa48("3697")) {
          {}
        } else {
          stryCov_9fa48("3697");
          const session = isDetachRequest ? await store.detachSession(stryMutAct_9fa48("3698") ? {} : (stryCov_9fa48("3698"), {
            securityContext,
            sessionId: request.params.sessionId,
            ...body
          })) : await store.updateSession(stryMutAct_9fa48("3699") ? {} : (stryCov_9fa48("3699"), {
            securityContext,
            sessionId: request.params.sessionId,
            ...body
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3700") ? {} : (stryCov_9fa48("3700"), {
            session
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3701")) {
          {}
        } else {
          stryCov_9fa48("3701");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3702") ? {} : (stryCov_9fa48("3702"), {
            error: error.message,
            code: stryMutAct_9fa48("3705") ? error.code && null : stryMutAct_9fa48("3704") ? false : stryMutAct_9fa48("3703") ? true : (stryCov_9fa48("3703", "3704", "3705"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Attach a debugger to an existing session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleAttachDebugSession(request, reply) {
    if (stryMutAct_9fa48("3706")) {
      {}
    } else {
      stryCov_9fa48("3706");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3709") ? !securityContext && !store : stryMutAct_9fa48("3708") ? false : stryMutAct_9fa48("3707") ? true : (stryCov_9fa48("3707", "3708", "3709"), (stryMutAct_9fa48("3710") ? securityContext : (stryCov_9fa48("3710"), !securityContext)) || (stryMutAct_9fa48("3711") ? store : (stryCov_9fa48("3711"), !store)))) {
        if (stryMutAct_9fa48("3712")) {
          {}
        } else {
          stryCov_9fa48("3712");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3713")) {
          {}
        } else {
          stryCov_9fa48("3713");
          const session = await store.attachSession(stryMutAct_9fa48("3714") ? {} : (stryCov_9fa48("3714"), {
            securityContext,
            sessionId: request.params.sessionId
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3715") ? {} : (stryCov_9fa48("3715"), {
            session
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3716")) {
          {}
        } else {
          stryCov_9fa48("3716");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3717") ? {} : (stryCov_9fa48("3717"), {
            error: error.message,
            code: stryMutAct_9fa48("3720") ? error.code && null : stryMutAct_9fa48("3719") ? false : stryMutAct_9fa48("3718") ? true : (stryCov_9fa48("3718", "3719", "3720"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Persist breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleWriteDebugBreakpoints(request, reply) {
    if (stryMutAct_9fa48("3721")) {
      {}
    } else {
      stryCov_9fa48("3721");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3724") ? !securityContext && !store : stryMutAct_9fa48("3723") ? false : stryMutAct_9fa48("3722") ? true : (stryCov_9fa48("3722", "3723", "3724"), (stryMutAct_9fa48("3725") ? securityContext : (stryCov_9fa48("3725"), !securityContext)) || (stryMutAct_9fa48("3726") ? store : (stryCov_9fa48("3726"), !store)))) {
        if (stryMutAct_9fa48("3727")) {
          {}
        } else {
          stryCov_9fa48("3727");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3728")) {
          {}
        } else {
          stryCov_9fa48("3728");
          const breakpoints = await store.writeBreakpoints(stryMutAct_9fa48("3729") ? {} : (stryCov_9fa48("3729"), {
            securityContext,
            sessionId: request.params.sessionId,
            ...(stryMutAct_9fa48("3732") ? request.body && {} : stryMutAct_9fa48("3731") ? false : stryMutAct_9fa48("3730") ? true : (stryCov_9fa48("3730", "3731", "3732"), request.body || {}))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3733") ? {} : (stryCov_9fa48("3733"), {
            breakpoints
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3734")) {
          {}
        } else {
          stryCov_9fa48("3734");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3735") ? {} : (stryCov_9fa48("3735"), {
            error: error.message,
            code: stryMutAct_9fa48("3738") ? error.code && null : stryMutAct_9fa48("3737") ? false : stryMutAct_9fa48("3736") ? true : (stryCov_9fa48("3736", "3737", "3738"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * List breakpoints for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListDebugBreakpoints(request, reply) {
    if (stryMutAct_9fa48("3739")) {
      {}
    } else {
      stryCov_9fa48("3739");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3742") ? !securityContext && !store : stryMutAct_9fa48("3741") ? false : stryMutAct_9fa48("3740") ? true : (stryCov_9fa48("3740", "3741", "3742"), (stryMutAct_9fa48("3743") ? securityContext : (stryCov_9fa48("3743"), !securityContext)) || (stryMutAct_9fa48("3744") ? store : (stryCov_9fa48("3744"), !store)))) {
        if (stryMutAct_9fa48("3745")) {
          {}
        } else {
          stryCov_9fa48("3745");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3746")) {
          {}
        } else {
          stryCov_9fa48("3746");
          const breakpoints = await store.listBreakpoints(stryMutAct_9fa48("3747") ? {} : (stryCov_9fa48("3747"), {
            securityContext,
            sessionId: request.params.sessionId,
            limit: parseRequestLimit(stryMutAct_9fa48("3748") ? request.query.limit : (stryCov_9fa48("3748"), request.query?.limit))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3749") ? {} : (stryCov_9fa48("3749"), {
            breakpoints
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3750")) {
          {}
        } else {
          stryCov_9fa48("3750");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3751") ? {} : (stryCov_9fa48("3751"), {
            error: error.message,
            code: stryMutAct_9fa48("3754") ? error.code && null : stryMutAct_9fa48("3753") ? false : stryMutAct_9fa48("3752") ? true : (stryCov_9fa48("3752", "3753", "3754"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Persist one snapshot artifact for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleWriteDebugSnapshot(request, reply) {
    if (stryMutAct_9fa48("3755")) {
      {}
    } else {
      stryCov_9fa48("3755");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3758") ? !securityContext && !store : stryMutAct_9fa48("3757") ? false : stryMutAct_9fa48("3756") ? true : (stryCov_9fa48("3756", "3757", "3758"), (stryMutAct_9fa48("3759") ? securityContext : (stryCov_9fa48("3759"), !securityContext)) || (stryMutAct_9fa48("3760") ? store : (stryCov_9fa48("3760"), !store)))) {
        if (stryMutAct_9fa48("3761")) {
          {}
        } else {
          stryCov_9fa48("3761");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3762")) {
          {}
        } else {
          stryCov_9fa48("3762");
          const snapshot = await store.writeSnapshot(stryMutAct_9fa48("3763") ? {} : (stryCov_9fa48("3763"), {
            securityContext,
            sessionId: request.params.sessionId,
            ...(stryMutAct_9fa48("3766") ? request.body && {} : stryMutAct_9fa48("3765") ? false : stryMutAct_9fa48("3764") ? true : (stryCov_9fa48("3764", "3765", "3766"), request.body || {}))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3767") ? {} : (stryCov_9fa48("3767"), {
            snapshot: normalizeSnapshotApiPayload(snapshot)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3768")) {
          {}
        } else {
          stryCov_9fa48("3768");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3769") ? {} : (stryCov_9fa48("3769"), {
            error: error.message,
            code: stryMutAct_9fa48("3772") ? error.code && null : stryMutAct_9fa48("3771") ? false : stryMutAct_9fa48("3770") ? true : (stryCov_9fa48("3770", "3771", "3772"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * List snapshots for a debug session.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListDebugSnapshots(request, reply) {
    if (stryMutAct_9fa48("3773")) {
      {}
    } else {
      stryCov_9fa48("3773");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3776") ? !securityContext && !store : stryMutAct_9fa48("3775") ? false : stryMutAct_9fa48("3774") ? true : (stryCov_9fa48("3774", "3775", "3776"), (stryMutAct_9fa48("3777") ? securityContext : (stryCov_9fa48("3777"), !securityContext)) || (stryMutAct_9fa48("3778") ? store : (stryCov_9fa48("3778"), !store)))) {
        if (stryMutAct_9fa48("3779")) {
          {}
        } else {
          stryCov_9fa48("3779");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3780")) {
          {}
        } else {
          stryCov_9fa48("3780");
          const snapshots = await store.listSnapshots(stryMutAct_9fa48("3781") ? {} : (stryCov_9fa48("3781"), {
            securityContext,
            sessionId: request.params.sessionId,
            limit: parseRequestLimit(stryMutAct_9fa48("3782") ? request.query.limit : (stryCov_9fa48("3782"), request.query?.limit))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3783") ? {} : (stryCov_9fa48("3783"), {
            snapshots: snapshots.map(stryMutAct_9fa48("3784") ? () => undefined : (stryCov_9fa48("3784"), snapshot => normalizeSnapshotApiPayload(snapshot)))
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3785")) {
          {}
        } else {
          stryCov_9fa48("3785");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3786") ? {} : (stryCov_9fa48("3786"), {
            error: error.message,
            code: stryMutAct_9fa48("3789") ? error.code && null : stryMutAct_9fa48("3788") ? false : stryMutAct_9fa48("3787") ? true : (stryCov_9fa48("3787", "3788", "3789"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Fetch one snapshot by snapshotId.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleGetDebugSnapshot(request, reply) {
    if (stryMutAct_9fa48("3790")) {
      {}
    } else {
      stryCov_9fa48("3790");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      const store = this.requireDebugMetadataStore(reply);
      if (stryMutAct_9fa48("3793") ? !securityContext && !store : stryMutAct_9fa48("3792") ? false : stryMutAct_9fa48("3791") ? true : (stryCov_9fa48("3791", "3792", "3793"), (stryMutAct_9fa48("3794") ? securityContext : (stryCov_9fa48("3794"), !securityContext)) || (stryMutAct_9fa48("3795") ? store : (stryCov_9fa48("3795"), !store)))) {
        if (stryMutAct_9fa48("3796")) {
          {}
        } else {
          stryCov_9fa48("3796");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3797")) {
          {}
        } else {
          stryCov_9fa48("3797");
          const snapshot = await store.getSnapshot(stryMutAct_9fa48("3798") ? {} : (stryCov_9fa48("3798"), {
            securityContext,
            snapshotId: request.params.snapshotId,
            sessionId: stryMutAct_9fa48("3801") ? request.query?.sessionId && null : stryMutAct_9fa48("3800") ? false : stryMutAct_9fa48("3799") ? true : (stryCov_9fa48("3799", "3800", "3801"), (stryMutAct_9fa48("3802") ? request.query.sessionId : (stryCov_9fa48("3802"), request.query?.sessionId)) || null),
            includeEnvelope: stryMutAct_9fa48("3805") ? request.query?.includeEnvelope === 'false' : stryMutAct_9fa48("3804") ? false : stryMutAct_9fa48("3803") ? true : (stryCov_9fa48("3803", "3804", "3805"), (stryMutAct_9fa48("3806") ? request.query.includeEnvelope : (stryCov_9fa48("3806"), request.query?.includeEnvelope)) !== (stryMutAct_9fa48("3807") ? "" : (stryCov_9fa48("3807"), 'false')))
          }));
          if (stryMutAct_9fa48("3810") ? false : stryMutAct_9fa48("3809") ? true : stryMutAct_9fa48("3808") ? snapshot : (stryCov_9fa48("3808", "3809", "3810"), !snapshot)) {
            if (stryMutAct_9fa48("3811")) {
              {}
            } else {
              stryCov_9fa48("3811");
              reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("3812") ? {} : (stryCov_9fa48("3812"), {
                error: DEBUG_METADATA_ERR.SNAPSHOT_NOT_FOUND
              }));
              return;
            }
          }
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3813") ? {} : (stryCov_9fa48("3813"), {
            snapshot: normalizeSnapshotApiPayload(snapshot)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3814")) {
          {}
        } else {
          stryCov_9fa48("3814");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3815") ? {} : (stryCov_9fa48("3815"), {
            error: error.message,
            code: stryMutAct_9fa48("3818") ? error.code && null : stryMutAct_9fa48("3817") ? false : stryMutAct_9fa48("3816") ? true : (stryCov_9fa48("3816", "3817", "3818"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Route one DAP request through admin ingress ownership.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleDebugDapRequest(request, reply) {
    if (stryMutAct_9fa48("3819")) {
      {}
    } else {
      stryCov_9fa48("3819");
      const securityContext = this.resolveDebugSecurityContext(request, reply);
      if (stryMutAct_9fa48("3822") ? false : stryMutAct_9fa48("3821") ? true : stryMutAct_9fa48("3820") ? securityContext : (stryCov_9fa48("3820", "3821", "3822"), !securityContext)) {
        if (stryMutAct_9fa48("3823")) {
          {}
        } else {
          stryCov_9fa48("3823");
          return;
        }
      }
      if (stryMutAct_9fa48("3826") ? !this.debugDapRouter && typeof this.debugDapRouter.handleRequest !== TYPEOF.FUNCTION : stryMutAct_9fa48("3825") ? false : stryMutAct_9fa48("3824") ? true : (stryCov_9fa48("3824", "3825", "3826"), (stryMutAct_9fa48("3827") ? this.debugDapRouter : (stryCov_9fa48("3827"), !this.debugDapRouter)) || (stryMutAct_9fa48("3829") ? typeof this.debugDapRouter.handleRequest === TYPEOF.FUNCTION : stryMutAct_9fa48("3828") ? false : (stryCov_9fa48("3828", "3829"), typeof this.debugDapRouter.handleRequest !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("3830")) {
          {}
        } else {
          stryCov_9fa48("3830");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("3831") ? {} : (stryCov_9fa48("3831"), {
            error: ADMIN_DEBUG_ERROR_MSG.DAP_UNAVAILABLE
          }));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("3832")) {
          {}
        } else {
          stryCov_9fa48("3832");
          const response = await this.debugDapRouter.handleRequest(stryMutAct_9fa48("3833") ? {} : (stryCov_9fa48("3833"), {
            securityContext,
            ...(stryMutAct_9fa48("3836") ? request.body && {} : stryMutAct_9fa48("3835") ? false : stryMutAct_9fa48("3834") ? true : (stryCov_9fa48("3834", "3835", "3836"), request.body || {}))
          }));
          reply.code(HTTP_STATUS.OK).send(stryMutAct_9fa48("3837") ? {} : (stryCov_9fa48("3837"), {
            response
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("3838")) {
          {}
        } else {
          stryCov_9fa48("3838");
          reply.code(this.resolveDebugApiErrorStatus(error)).send(stryMutAct_9fa48("3839") ? {} : (stryCov_9fa48("3839"), {
            error: error.message,
            code: stryMutAct_9fa48("3842") ? error.code && null : stryMutAct_9fa48("3841") ? false : stryMutAct_9fa48("3840") ? true : (stryCov_9fa48("3840", "3841", "3842"), error.code || null)
          }));
        }
      }
    }
  }

  /**
   * Serve shared playback viewer page.
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handlePlaybackViewerPage(reply) {
    if (stryMutAct_9fa48("3843")) {
      {}
    } else {
      stryCov_9fa48("3843");
      try {
        if (stryMutAct_9fa48("3844")) {
          {}
        } else {
          stryCov_9fa48("3844");
          const page = await this.testRunService.readPlaybackViewer();
          reply.code(HTTP_STATUS.OK).header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE).type(ADMIN_CONTENT_TYPE.HTML).send(page);
        }
      } catch (error) {
        if (stryMutAct_9fa48("3845")) {
          {}
        } else {
          stryCov_9fa48("3845");
          reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("3846") ? {} : (stryCov_9fa48("3846"), {
            error: ADMIN_TEST_ERROR_MSG.PLAYBACK_VIEWER_NOT_FOUND,
            details: error.message
          }));
        }
      }
    }
  }

  /**
   * Serve files under test-output for report/playback assets.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleOutputFile(request, reply) {
    if (stryMutAct_9fa48("3847")) {
      {}
    } else {
      stryCov_9fa48("3847");
      const wildcardPath = request.params[stryMutAct_9fa48("3848") ? "" : (stryCov_9fa48("3848"), '*')];
      const filePayload = await this.testRunService.readOutputAsset(wildcardPath);
      if (stryMutAct_9fa48("3851") ? false : stryMutAct_9fa48("3850") ? true : stryMutAct_9fa48("3849") ? filePayload : (stryCov_9fa48("3849", "3850", "3851"), !filePayload)) {
        if (stryMutAct_9fa48("3852")) {
          {}
        } else {
          stryCov_9fa48("3852");
          reply.code(HTTP_STATUS.NOT_FOUND).send(stryMutAct_9fa48("3853") ? {} : (stryCov_9fa48("3853"), {
            error: ADMIN_TEST_ERROR_MSG.OUTPUT_PATH_INVALID
          }));
          return;
        }
      }
      reply.code(HTTP_STATUS.OK).type(filePayload.contentType).send(filePayload.body);
    }
  }

  /**
   * Resolve security context from debug route headers.
   * @param {Object} request
   * @param {Object} reply
   * @return {Object|null}
   */
  resolveDebugSecurityContext(request, reply) {
    if (stryMutAct_9fa48("3854")) {
      {}
    } else {
      stryCov_9fa48("3854");
      const tenantId = request.headers[ADMIN_HEADER.TENANT_ID];
      const principal = request.headers[ADMIN_HEADER.PRINCIPAL];
      if (stryMutAct_9fa48("3857") ? !tenantId && !principal : stryMutAct_9fa48("3856") ? false : stryMutAct_9fa48("3855") ? true : (stryCov_9fa48("3855", "3856", "3857"), (stryMutAct_9fa48("3858") ? tenantId : (stryCov_9fa48("3858"), !tenantId)) || (stryMutAct_9fa48("3859") ? principal : (stryCov_9fa48("3859"), !principal)))) {
        if (stryMutAct_9fa48("3860")) {
          {}
        } else {
          stryCov_9fa48("3860");
          reply.code(HTTP_STATUS.UNAUTHORIZED).send(stryMutAct_9fa48("3861") ? {} : (stryCov_9fa48("3861"), {
            error: ADMIN_DEBUG_ERROR_MSG.SECURITY_CONTEXT_REQUIRED
          }));
          return null;
        }
      }
      const rolesHeader = request.headers[ADMIN_HEADER.ROLES];
      return stryMutAct_9fa48("3862") ? {} : (stryCov_9fa48("3862"), {
        tenantId,
        principal,
        roles: parseHeaderRoles(rolesHeader)
      });
    }
  }

  /**
   * @param {Object} reply
   * @return {Object|null}
   */
  requireDebugMetadataStore(reply) {
    if (stryMutAct_9fa48("3863")) {
      {}
    } else {
      stryCov_9fa48("3863");
      if (stryMutAct_9fa48("3866") ? false : stryMutAct_9fa48("3865") ? true : stryMutAct_9fa48("3864") ? this.debugMetadataStore : (stryCov_9fa48("3864", "3865", "3866"), !this.debugMetadataStore)) {
        if (stryMutAct_9fa48("3867")) {
          {}
        } else {
          stryCov_9fa48("3867");
          reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send(stryMutAct_9fa48("3868") ? {} : (stryCov_9fa48("3868"), {
            error: ADMIN_DEBUG_ERROR_MSG.SERVICE_UNAVAILABLE
          }));
          return null;
        }
      }
      return this.debugMetadataStore;
    }
  }

  /**
   * Resolve debug API HTTP status from error code.
   * @param {Error} error
   * @return {number}
   */
  resolveDebugApiErrorStatus(error) {
    if (stryMutAct_9fa48("3869")) {
      {}
    } else {
      stryCov_9fa48("3869");
      switch (stryMutAct_9fa48("3870") ? error.code : (stryCov_9fa48("3870"), error?.code)) {
        case DEBUG_METADATA_CODE.INVALID_CONTEXT:
          if (stryMutAct_9fa48("3871")) {} else {
            stryCov_9fa48("3871");
            return HTTP_STATUS.UNAUTHORIZED;
          }
        case DEBUG_METADATA_CODE.UNAUTHORIZED:
          if (stryMutAct_9fa48("3872")) {} else {
            stryCov_9fa48("3872");
            return HTTP_STATUS.FORBIDDEN;
          }
        case DEBUG_METADATA_CODE.ENGINE_REQUIRED:
          if (stryMutAct_9fa48("3873")) {} else {
            stryCov_9fa48("3873");
            return HTTP_STATUS.SERVICE_UNAVAILABLE;
          }
        case DEBUG_METADATA_CODE.INVALID_REQUEST:
        case DEBUG_METADATA_CODE.BREAKPOINTS_REQUIRED:
          if (stryMutAct_9fa48("3874")) {} else {
            stryCov_9fa48("3874");
            return HTTP_STATUS.BAD_REQUEST;
          }
        case DEBUG_METADATA_CODE.SESSION_NOT_FOUND:
        case DEBUG_METADATA_CODE.SNAPSHOT_NOT_FOUND:
          if (stryMutAct_9fa48("3875")) {} else {
            stryCov_9fa48("3875");
            return HTTP_STATUS.NOT_FOUND;
          }
        default:
          if (stryMutAct_9fa48("3876")) {} else {
            stryCov_9fa48("3876");
            return HTTP_STATUS.INTERNAL_ERROR;
          }
      }
    }
  }

  /**
   * Handle one trace-stream websocket connection.
   * @param {Object} socket - WebSocket connection.
   * @param {Object} request - Fastify request.
   */
  handleDebugTraceConnection(socket, request) {
    if (stryMutAct_9fa48("3877")) {
      {}
    } else {
      stryCov_9fa48("3877");
      const filter = buildTraceStreamFilter(stryMutAct_9fa48("3880") ? request?.query && {} : stryMutAct_9fa48("3879") ? false : stryMutAct_9fa48("3878") ? true : (stryCov_9fa48("3878", "3879", "3880"), (stryMutAct_9fa48("3881") ? request.query : (stryCov_9fa48("3881"), request?.query)) || {}));
      const subscription = this.traceCollector.subscribe(socket, filter);
      let closed = stryMutAct_9fa48("3882") ? true : (stryCov_9fa48("3882"), false);
      this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_SUBSCRIBED, stryMutAct_9fa48("3883") ? {} : (stryCov_9fa48("3883"), {
        subscriberId: subscription.subscriberId,
        filter
      }));
      const cleanup = () => {
        if (stryMutAct_9fa48("3884")) {
          {}
        } else {
          stryCov_9fa48("3884");
          if (stryMutAct_9fa48("3886") ? false : stryMutAct_9fa48("3885") ? true : (stryCov_9fa48("3885", "3886"), closed)) {
            if (stryMutAct_9fa48("3887")) {
              {}
            } else {
              stryCov_9fa48("3887");
              return;
            }
          }
          closed = stryMutAct_9fa48("3888") ? false : (stryCov_9fa48("3888"), true);
          subscription.unsubscribe();
          this.logger.info(ADMIN_LOG_MSG.TRACE_STREAM_UNSUBSCRIBED, stryMutAct_9fa48("3889") ? {} : (stryCov_9fa48("3889"), {
            subscriberId: subscription.subscriberId
          }));
        }
      };
      socket.on(TRANSPORT_EVENT.CLOSE, cleanup);
      socket.on(TRANSPORT_EVENT.ERROR, cleanup);
    }
  }
}
export { AdminDebugHandlers };