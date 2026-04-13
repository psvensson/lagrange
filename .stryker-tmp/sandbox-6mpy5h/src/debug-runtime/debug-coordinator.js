/**
 * Distributed debug coordinator for lineage stage handoff.
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
import { EventEmitter } from 'node:events';
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { CDC_EVENT } from '../cdc/cdc-constants.js';
import { DEBUG_METADATA_TABLE as DT, DEBUG_SESSION_FIELD as DSF } from './debug-metadata-constants.js';
import { DEBUG_COORDINATOR_DEFAULT as DEF, DEBUG_COORDINATOR_EVENT as EVENT, DEBUG_COORDINATOR_ERROR_MSG as ERR } from './debug-coordinator-constants.js';
const COORDINATOR_CDC_EVENTS = Object.freeze(stryMutAct_9fa48("76297") ? [] : (stryCov_9fa48("76297"), [CDC_EVENT.INSERT, CDC_EVENT.UPDATE, CDC_EVENT.UPSERT]));

/**
 * Coordinates active debug endpoint by lineage+stage transitions.
 */
class DebugCoordinator {
  /**
   * @param {Object} [options]
   * @param {Object} [options.systemTableCache] - Cache owner.
   * @param {Object} [options.cdcIntegrationService] - CDC emitter.
   * @param {Function} [options.now] - Timestamp provider.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("76298")) {
      {}
    } else {
      stryCov_9fa48("76298");
      this.systemTableCache = stryMutAct_9fa48("76301") ? options.systemTableCache && null : stryMutAct_9fa48("76300") ? false : stryMutAct_9fa48("76299") ? true : (stryCov_9fa48("76299", "76300", "76301"), options.systemTableCache || null);
      this.cdcIntegrationService = null;
      this.now = stryMutAct_9fa48("76304") ? options.now && (() => Date.now()) : stryMutAct_9fa48("76303") ? false : stryMutAct_9fa48("76302") ? true : (stryCov_9fa48("76302", "76303", "76304"), options.now || (stryMutAct_9fa48("76305") ? () => undefined : (stryCov_9fa48("76305"), () => Date.now())));
      this.lineageState = new Map();
      this.emitter = new EventEmitter();
      this.boundCdcHandlers = new Map();
      if (stryMutAct_9fa48("76307") ? false : stryMutAct_9fa48("76306") ? true : (stryCov_9fa48("76306", "76307"), options.cdcIntegrationService)) {
        if (stryMutAct_9fa48("76308")) {
          {}
        } else {
          stryCov_9fa48("76308");
          this.bindCdcIntegrationService(options.cdcIntegrationService);
        }
      }
    }
  }

  /**
   * Subscribe to all handoff notifications.
   *
   * @param {Function} listener - Event listener.
   * @return {Function} Unsubscribe callback.
   */
  subscribe(listener) {
    if (stryMutAct_9fa48("76309")) {
      {}
    } else {
      stryCov_9fa48("76309");
      if (stryMutAct_9fa48("76312") ? typeof listener === TYPEOF.FUNCTION : stryMutAct_9fa48("76311") ? false : stryMutAct_9fa48("76310") ? true : (stryCov_9fa48("76310", "76311", "76312"), typeof listener !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("76313")) {
          {}
        } else {
          stryCov_9fa48("76313");
          throw new Error(ERR.LISTENER_REQUIRED);
        }
      }
      this.emitter.on(EVENT.HANDOFF, listener);
      return () => {
        if (stryMutAct_9fa48("76314")) {
          {}
        } else {
          stryCov_9fa48("76314");
          this.emitter.off(EVENT.HANDOFF, listener);
        }
      };
    }
  }

  /**
   * Subscribe to lineage-specific handoff notifications.
   *
   * @param {string} lineageId - Lineage id.
   * @param {Function} listener - Event listener.
   * @return {Function} Unsubscribe callback.
   */
  subscribeLineage(lineageId, listener) {
    if (stryMutAct_9fa48("76315")) {
      {}
    } else {
      stryCov_9fa48("76315");
      assertLineageId(lineageId);
      if (stryMutAct_9fa48("76318") ? typeof listener === TYPEOF.FUNCTION : stryMutAct_9fa48("76317") ? false : stryMutAct_9fa48("76316") ? true : (stryCov_9fa48("76316", "76317", "76318"), typeof listener !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("76319")) {
          {}
        } else {
          stryCov_9fa48("76319");
          throw new Error(ERR.LISTENER_REQUIRED);
        }
      }
      const wrapped = event => {
        if (stryMutAct_9fa48("76320")) {
          {}
        } else {
          stryCov_9fa48("76320");
          if (stryMutAct_9fa48("76323") ? event.lineageId !== lineageId : stryMutAct_9fa48("76322") ? false : stryMutAct_9fa48("76321") ? true : (stryCov_9fa48("76321", "76322", "76323"), event.lineageId === lineageId)) {
            if (stryMutAct_9fa48("76324")) {
              {}
            } else {
              stryCov_9fa48("76324");
              listener(event);
            }
          }
        }
      };
      this.emitter.on(EVENT.HANDOFF, wrapped);
      return () => {
        if (stryMutAct_9fa48("76325")) {
          {}
        } else {
          stryCov_9fa48("76325");
          this.emitter.off(EVENT.HANDOFF, wrapped);
        }
      };
    }
  }

  /**
   * Get current endpoint record for a lineage.
   *
   * @param {Object} request
   * @param {string} request.lineageId
   * @return {Object|null}
   */
  getCurrentEndpoint(request) {
    if (stryMutAct_9fa48("76326")) {
      {}
    } else {
      stryCov_9fa48("76326");
      assertRequest(request);
      assertLineageId(request.lineageId);
      const state = stryMutAct_9fa48("76329") ? this.lineageState.get(request.lineageId) && null : stryMutAct_9fa48("76328") ? false : stryMutAct_9fa48("76327") ? true : (stryCov_9fa48("76327", "76328", "76329"), this.lineageState.get(request.lineageId) || null);
      return state ? stryMutAct_9fa48("76330") ? {} : (stryCov_9fa48("76330"), {
        ...state
      }) : null;
    }
  }

  /**
   * Upsert stage endpoint transition with monotonic guardrails.
   *
   * @param {Object} request
   * @param {string} request.lineageId
   * @param {number} request.stageId
   * @param {string} request.endpoint
   * @param {string} [request.nodeId]
   * @param {string} [request.sessionId]
   * @param {number} [request.updatedAt]
   * @param {string} [source] - Optional source label.
   * @return {{applied: boolean, reason: string, current: Object}}
   */
  upsertStageEndpoint(request, source = stryMutAct_9fa48("76331") ? "" : (stryCov_9fa48("76331"), 'manual')) {
    if (stryMutAct_9fa48("76332")) {
      {}
    } else {
      stryCov_9fa48("76332");
      assertRequest(request);
      assertLineageId(request.lineageId);
      assertStageId(request.stageId);
      assertEndpoint(request.endpoint);
      const next = normalizeStageEndpointRecord(request, this.now());
      const previous = stryMutAct_9fa48("76335") ? this.lineageState.get(next.lineageId) && null : stryMutAct_9fa48("76334") ? false : stryMutAct_9fa48("76333") ? true : (stryCov_9fa48("76333", "76334", "76335"), this.lineageState.get(next.lineageId) || null);
      const decision = decideMonotonicTransition(previous, next);
      if (stryMutAct_9fa48("76338") ? false : stryMutAct_9fa48("76337") ? true : stryMutAct_9fa48("76336") ? decision.applied : (stryCov_9fa48("76336", "76337", "76338"), !decision.applied)) {
        if (stryMutAct_9fa48("76339")) {
          {}
        } else {
          stryCov_9fa48("76339");
          return stryMutAct_9fa48("76340") ? {} : (stryCov_9fa48("76340"), {
            applied: stryMutAct_9fa48("76341") ? true : (stryCov_9fa48("76341"), false),
            reason: decision.reason,
            current: previous ? stryMutAct_9fa48("76342") ? {} : (stryCov_9fa48("76342"), {
              ...previous
            }) : null
          });
        }
      }
      this.lineageState.set(next.lineageId, next);
      this.emitter.emit(EVENT.HANDOFF, stryMutAct_9fa48("76343") ? {} : (stryCov_9fa48("76343"), {
        lineageId: next.lineageId,
        previous,
        current: next,
        source,
        reason: decision.reason
      }));
      return stryMutAct_9fa48("76344") ? {} : (stryCov_9fa48("76344"), {
        applied: stryMutAct_9fa48("76345") ? false : (stryCov_9fa48("76345"), true),
        reason: decision.reason,
        current: stryMutAct_9fa48("76346") ? {} : (stryCov_9fa48("76346"), {
          ...next
        })
      });
    }
  }

  /**
   * Hydrate lineage endpoint state from system metadata table.
   *
   * @return {number} Number of applied transitions.
   */
  hydrateFromSystemMetadata() {
    if (stryMutAct_9fa48("76347")) {
      {}
    } else {
      stryCov_9fa48("76347");
      if (stryMutAct_9fa48("76350") ? !this.systemTableCache && typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("76349") ? false : stryMutAct_9fa48("76348") ? true : (stryCov_9fa48("76348", "76349", "76350"), (stryMutAct_9fa48("76351") ? this.systemTableCache : (stryCov_9fa48("76351"), !this.systemTableCache)) || (stryMutAct_9fa48("76353") ? typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("76352") ? false : (stryCov_9fa48("76352", "76353"), typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("76354")) {
          {}
        } else {
          stryCov_9fa48("76354");
          return NUM.ZERO;
        }
      }
      let rows;
      try {
        if (stryMutAct_9fa48("76355")) {
          {}
        } else {
          stryCov_9fa48("76355");
          rows = this.systemTableCache.getAll(DT.SESSIONS);
        }
      } catch (_err) {
        if (stryMutAct_9fa48("76356")) {
          {}
        } else {
          stryCov_9fa48("76356");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("76359") ? !Array.isArray(rows) && rows.length === NUM.ZERO : stryMutAct_9fa48("76358") ? false : stryMutAct_9fa48("76357") ? true : (stryCov_9fa48("76357", "76358", "76359"), (stryMutAct_9fa48("76360") ? Array.isArray(rows) : (stryCov_9fa48("76360"), !Array.isArray(rows))) || (stryMutAct_9fa48("76362") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("76361") ? false : (stryCov_9fa48("76361", "76362"), rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("76363")) {
          {}
        } else {
          stryCov_9fa48("76363");
          return NUM.ZERO;
        }
      }
      const appliedRows = normalizeRowsForHydration(rows);
      let appliedCount = NUM.ZERO;
      for (const row of appliedRows) {
        if (stryMutAct_9fa48("76364")) {
          {}
        } else {
          stryCov_9fa48("76364");
          const result = this.upsertStageEndpoint(row, stryMutAct_9fa48("76365") ? "" : (stryCov_9fa48("76365"), 'cache_hydration'));
          if (stryMutAct_9fa48("76367") ? false : stryMutAct_9fa48("76366") ? true : (stryCov_9fa48("76366", "76367"), result.applied)) {
            if (stryMutAct_9fa48("76368")) {
              {}
            } else {
              stryCov_9fa48("76368");
              stryMutAct_9fa48("76369") ? appliedCount -= 1 : (stryCov_9fa48("76369"), appliedCount += 1);
            }
          }
        }
      }
      return appliedCount;
    }
  }

  /**
   * Bind coordinator to CDC row change events.
   *
   * @param {Object} cdcIntegrationService - CDC emitter.
   * @return {boolean}
   */
  bindCdcIntegrationService(cdcIntegrationService) {
    if (stryMutAct_9fa48("76370")) {
      {}
    } else {
      stryCov_9fa48("76370");
      if (stryMutAct_9fa48("76373") ? (!cdcIntegrationService || typeof cdcIntegrationService.on !== TYPEOF.FUNCTION) && typeof cdcIntegrationService.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("76372") ? false : stryMutAct_9fa48("76371") ? true : (stryCov_9fa48("76371", "76372", "76373"), (stryMutAct_9fa48("76375") ? !cdcIntegrationService && typeof cdcIntegrationService.on !== TYPEOF.FUNCTION : stryMutAct_9fa48("76374") ? false : (stryCov_9fa48("76374", "76375"), (stryMutAct_9fa48("76376") ? cdcIntegrationService : (stryCov_9fa48("76376"), !cdcIntegrationService)) || (stryMutAct_9fa48("76378") ? typeof cdcIntegrationService.on === TYPEOF.FUNCTION : stryMutAct_9fa48("76377") ? false : (stryCov_9fa48("76377", "76378"), typeof cdcIntegrationService.on !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("76380") ? typeof cdcIntegrationService.off === TYPEOF.FUNCTION : stryMutAct_9fa48("76379") ? false : (stryCov_9fa48("76379", "76380"), typeof cdcIntegrationService.off !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("76381")) {
          {}
        } else {
          stryCov_9fa48("76381");
          return stryMutAct_9fa48("76382") ? true : (stryCov_9fa48("76382"), false);
        }
      }
      this.unbindCdcIntegrationService();
      this.cdcIntegrationService = cdcIntegrationService;
      for (const eventName of COORDINATOR_CDC_EVENTS) {
        if (stryMutAct_9fa48("76383")) {
          {}
        } else {
          stryCov_9fa48("76383");
          const handler = event => {
            if (stryMutAct_9fa48("76384")) {
              {}
            } else {
              stryCov_9fa48("76384");
              this.handleCdcEvent(event);
            }
          };
          this.boundCdcHandlers.set(eventName, handler);
          cdcIntegrationService.on(eventName, handler);
        }
      }
      return stryMutAct_9fa48("76385") ? false : (stryCov_9fa48("76385"), true);
    }
  }

  /**
   * Unbind CDC listeners.
   */
  unbindCdcIntegrationService() {
    if (stryMutAct_9fa48("76386")) {
      {}
    } else {
      stryCov_9fa48("76386");
      if (stryMutAct_9fa48("76389") ? this.cdcIntegrationService || typeof this.cdcIntegrationService.off === TYPEOF.FUNCTION : stryMutAct_9fa48("76388") ? false : stryMutAct_9fa48("76387") ? true : (stryCov_9fa48("76387", "76388", "76389"), this.cdcIntegrationService && (stryMutAct_9fa48("76391") ? typeof this.cdcIntegrationService.off !== TYPEOF.FUNCTION : stryMutAct_9fa48("76390") ? true : (stryCov_9fa48("76390", "76391"), typeof this.cdcIntegrationService.off === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("76392")) {
          {}
        } else {
          stryCov_9fa48("76392");
          for (const [eventName, handler] of this.boundCdcHandlers) {
            if (stryMutAct_9fa48("76393")) {
              {}
            } else {
              stryCov_9fa48("76393");
              this.cdcIntegrationService.off(eventName, handler);
            }
          }
        }
      }
      this.boundCdcHandlers.clear();
      this.cdcIntegrationService = null;
    }
  }

  /**
   * Handle one CDC event for debug session endpoint transitions.
   *
   * @param {Object} event - CDC event payload.
   * @return {boolean} True when applied.
   */
  handleCdcEvent(event) {
    if (stryMutAct_9fa48("76394")) {
      {}
    } else {
      stryCov_9fa48("76394");
      if (stryMutAct_9fa48("76397") ? !event && typeof event !== TYPEOF.OBJECT : stryMutAct_9fa48("76396") ? false : stryMutAct_9fa48("76395") ? true : (stryCov_9fa48("76395", "76396", "76397"), (stryMutAct_9fa48("76398") ? event : (stryCov_9fa48("76398"), !event)) || (stryMutAct_9fa48("76400") ? typeof event === TYPEOF.OBJECT : stryMutAct_9fa48("76399") ? false : (stryCov_9fa48("76399", "76400"), typeof event !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76401")) {
          {}
        } else {
          stryCov_9fa48("76401");
          return stryMutAct_9fa48("76402") ? true : (stryCov_9fa48("76402"), false);
        }
      }
      if (stryMutAct_9fa48("76405") ? event.tableName !== DT.SESSIONS || event.tableName !== TABLES.CONFIG : stryMutAct_9fa48("76404") ? false : stryMutAct_9fa48("76403") ? true : (stryCov_9fa48("76403", "76404", "76405"), (stryMutAct_9fa48("76407") ? event.tableName === DT.SESSIONS : stryMutAct_9fa48("76406") ? true : (stryCov_9fa48("76406", "76407"), event.tableName !== DT.SESSIONS)) && (stryMutAct_9fa48("76409") ? event.tableName === TABLES.CONFIG : stryMutAct_9fa48("76408") ? true : (stryCov_9fa48("76408", "76409"), event.tableName !== TABLES.CONFIG)))) {
        if (stryMutAct_9fa48("76410")) {
          {}
        } else {
          stryCov_9fa48("76410");
          return stryMutAct_9fa48("76411") ? true : (stryCov_9fa48("76411"), false);
        }
      }
      if (stryMutAct_9fa48("76414") ? event.tableName !== TABLES.CONFIG : stryMutAct_9fa48("76413") ? false : stryMutAct_9fa48("76412") ? true : (stryCov_9fa48("76412", "76413", "76414"), event.tableName === TABLES.CONFIG)) {
        if (stryMutAct_9fa48("76415")) {
          {}
        } else {
          stryCov_9fa48("76415");
          return stryMutAct_9fa48("76416") ? true : (stryCov_9fa48("76416"), false);
        }
      }
      const row = stryMutAct_9fa48("76419") ? (event.data || event.whereClause) && null : stryMutAct_9fa48("76418") ? false : stryMutAct_9fa48("76417") ? true : (stryCov_9fa48("76417", "76418", "76419"), (stryMutAct_9fa48("76421") ? event.data && event.whereClause : stryMutAct_9fa48("76420") ? false : (stryCov_9fa48("76420", "76421"), event.data || event.whereClause)) || null);
      if (stryMutAct_9fa48("76424") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("76423") ? false : stryMutAct_9fa48("76422") ? true : (stryCov_9fa48("76422", "76423", "76424"), (stryMutAct_9fa48("76425") ? row : (stryCov_9fa48("76425"), !row)) || (stryMutAct_9fa48("76427") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("76426") ? false : (stryCov_9fa48("76426", "76427"), typeof row !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("76428")) {
          {}
        } else {
          stryCov_9fa48("76428");
          return stryMutAct_9fa48("76429") ? true : (stryCov_9fa48("76429"), false);
        }
      }
      const lineageId = row[DSF.LINEAGE_ID];
      const stageId = toStageId(row[DSF.STAGE_ID]);
      const endpoint = row[DSF.ENDPOINT];
      if (stryMutAct_9fa48("76432") ? (!isNonEmptyString(lineageId) || stageId === null) && !isNonEmptyString(endpoint) : stryMutAct_9fa48("76431") ? false : stryMutAct_9fa48("76430") ? true : (stryCov_9fa48("76430", "76431", "76432"), (stryMutAct_9fa48("76434") ? !isNonEmptyString(lineageId) && stageId === null : stryMutAct_9fa48("76433") ? false : (stryCov_9fa48("76433", "76434"), (stryMutAct_9fa48("76435") ? isNonEmptyString(lineageId) : (stryCov_9fa48("76435"), !isNonEmptyString(lineageId))) || (stryMutAct_9fa48("76437") ? stageId !== null : stryMutAct_9fa48("76436") ? false : (stryCov_9fa48("76436", "76437"), stageId === null)))) || (stryMutAct_9fa48("76438") ? isNonEmptyString(endpoint) : (stryCov_9fa48("76438"), !isNonEmptyString(endpoint))))) {
        if (stryMutAct_9fa48("76439")) {
          {}
        } else {
          stryCov_9fa48("76439");
          return stryMutAct_9fa48("76440") ? true : (stryCov_9fa48("76440"), false);
        }
      }
      const result = this.upsertStageEndpoint(stryMutAct_9fa48("76441") ? {} : (stryCov_9fa48("76441"), {
        lineageId,
        stageId,
        endpoint,
        nodeId: stryMutAct_9fa48("76444") ? row[DSF.NODE_ID] && null : stryMutAct_9fa48("76443") ? false : stryMutAct_9fa48("76442") ? true : (stryCov_9fa48("76442", "76443", "76444"), row[DSF.NODE_ID] || null),
        sessionId: stryMutAct_9fa48("76447") ? row[DSF.SESSION_ID] && null : stryMutAct_9fa48("76446") ? false : stryMutAct_9fa48("76445") ? true : (stryCov_9fa48("76445", "76446", "76447"), row[DSF.SESSION_ID] || null),
        updatedAt: toTimestampOrNow(row[DSF.UPDATED_AT], this.now())
      }), stryMutAct_9fa48("76448") ? "" : (stryCov_9fa48("76448"), 'cdc'));
      return result.applied;
    }
  }
}

/**
 * Decide if transition should be applied.
 *
 * Guardrails:
 * - higher stageId always wins
 * - equal stageId requires updatedAt >= current.updatedAt
 * - lower stageId is rejected
 *
 * @param {Object|null} previous
 * @param {Object} next
 * @return {{applied: boolean, reason: string}}
 */
function decideMonotonicTransition(previous, next) {
  if (stryMutAct_9fa48("76449")) {
    {}
  } else {
    stryCov_9fa48("76449");
    const transitionReason = (stryMutAct_9fa48("76450") ? previous : (stryCov_9fa48("76450"), !previous)) ? stryMutAct_9fa48("76451") ? "" : (stryCov_9fa48("76451"), 'initial') : (stryMutAct_9fa48("76455") ? next.stageId <= previous.stageId : stryMutAct_9fa48("76454") ? next.stageId >= previous.stageId : stryMutAct_9fa48("76453") ? false : stryMutAct_9fa48("76452") ? true : (stryCov_9fa48("76452", "76453", "76454", "76455"), next.stageId > previous.stageId)) ? stryMutAct_9fa48("76456") ? "" : (stryCov_9fa48("76456"), 'advance_stage') : (stryMutAct_9fa48("76460") ? next.stageId >= previous.stageId : stryMutAct_9fa48("76459") ? next.stageId <= previous.stageId : stryMutAct_9fa48("76458") ? false : stryMutAct_9fa48("76457") ? true : (stryCov_9fa48("76457", "76458", "76459", "76460"), next.stageId < previous.stageId)) ? stryMutAct_9fa48("76461") ? "" : (stryCov_9fa48("76461"), 'stale_stage') : (stryMutAct_9fa48("76465") ? next.updatedAt >= previous.updatedAt : stryMutAct_9fa48("76464") ? next.updatedAt <= previous.updatedAt : stryMutAct_9fa48("76463") ? false : stryMutAct_9fa48("76462") ? true : (stryCov_9fa48("76462", "76463", "76464", "76465"), next.updatedAt < previous.updatedAt)) ? stryMutAct_9fa48("76466") ? "" : (stryCov_9fa48("76466"), 'stale_timestamp') : (stryMutAct_9fa48("76469") ? next.endpoint === previous.endpoint && next.nodeId === previous.nodeId || next.updatedAt === previous.updatedAt : stryMutAct_9fa48("76468") ? false : stryMutAct_9fa48("76467") ? true : (stryCov_9fa48("76467", "76468", "76469"), (stryMutAct_9fa48("76471") ? next.endpoint === previous.endpoint || next.nodeId === previous.nodeId : stryMutAct_9fa48("76470") ? true : (stryCov_9fa48("76470", "76471"), (stryMutAct_9fa48("76473") ? next.endpoint !== previous.endpoint : stryMutAct_9fa48("76472") ? true : (stryCov_9fa48("76472", "76473"), next.endpoint === previous.endpoint)) && (stryMutAct_9fa48("76475") ? next.nodeId !== previous.nodeId : stryMutAct_9fa48("76474") ? true : (stryCov_9fa48("76474", "76475"), next.nodeId === previous.nodeId)))) && (stryMutAct_9fa48("76477") ? next.updatedAt !== previous.updatedAt : stryMutAct_9fa48("76476") ? true : (stryCov_9fa48("76476", "76477"), next.updatedAt === previous.updatedAt)))) ? stryMutAct_9fa48("76478") ? "" : (stryCov_9fa48("76478"), 'duplicate') : stryMutAct_9fa48("76479") ? "" : (stryCov_9fa48("76479"), 'refresh_stage');
    return stryMutAct_9fa48("76480") ? {} : (stryCov_9fa48("76480"), {
      applied: stryMutAct_9fa48("76483") ? (transitionReason === 'initial' || transitionReason === 'advance_stage') && transitionReason === 'refresh_stage' : stryMutAct_9fa48("76482") ? false : stryMutAct_9fa48("76481") ? true : (stryCov_9fa48("76481", "76482", "76483"), (stryMutAct_9fa48("76485") ? transitionReason === 'initial' && transitionReason === 'advance_stage' : stryMutAct_9fa48("76484") ? false : (stryCov_9fa48("76484", "76485"), (stryMutAct_9fa48("76487") ? transitionReason !== 'initial' : stryMutAct_9fa48("76486") ? false : (stryCov_9fa48("76486", "76487"), transitionReason === (stryMutAct_9fa48("76488") ? "" : (stryCov_9fa48("76488"), 'initial')))) || (stryMutAct_9fa48("76490") ? transitionReason !== 'advance_stage' : stryMutAct_9fa48("76489") ? false : (stryCov_9fa48("76489", "76490"), transitionReason === (stryMutAct_9fa48("76491") ? "" : (stryCov_9fa48("76491"), 'advance_stage')))))) || (stryMutAct_9fa48("76493") ? transitionReason !== 'refresh_stage' : stryMutAct_9fa48("76492") ? false : (stryCov_9fa48("76492", "76493"), transitionReason === (stryMutAct_9fa48("76494") ? "" : (stryCov_9fa48("76494"), 'refresh_stage'))))),
      reason: transitionReason
    });
  }
}

/**
 * Normalize transition row shape.
 *
 * @param {Object} row
 * @param {number} nowTs
 * @return {Object}
 */
function normalizeStageEndpointRecord(row, nowTs) {
  if (stryMutAct_9fa48("76495")) {
    {}
  } else {
    stryCov_9fa48("76495");
    return stryMutAct_9fa48("76496") ? {} : (stryCov_9fa48("76496"), {
      lineageId: row.lineageId,
      stageId: row.stageId,
      endpoint: row.endpoint,
      nodeId: stryMutAct_9fa48("76499") ? row.nodeId && null : stryMutAct_9fa48("76498") ? false : stryMutAct_9fa48("76497") ? true : (stryCov_9fa48("76497", "76498", "76499"), row.nodeId || null),
      sessionId: stryMutAct_9fa48("76502") ? row.sessionId && null : stryMutAct_9fa48("76501") ? false : stryMutAct_9fa48("76500") ? true : (stryCov_9fa48("76500", "76501", "76502"), row.sessionId || null),
      updatedAt: isNonNegativeInteger(row.updatedAt) ? row.updatedAt : nowTs
    });
  }
}

/**
 * @param {Array<Object>} rows
 * @return {Array<Object>}
 */
function normalizeRowsForHydration(rows) {
  if (stryMutAct_9fa48("76503")) {
    {}
  } else {
    stryCov_9fa48("76503");
    const normalized = stryMutAct_9fa48("76504") ? ["Stryker was here"] : (stryCov_9fa48("76504"), []);
    for (const row of rows) {
      if (stryMutAct_9fa48("76505")) {
        {}
      } else {
        stryCov_9fa48("76505");
        const lineageId = row[DSF.LINEAGE_ID];
        const stageId = toStageId(row[DSF.STAGE_ID]);
        const endpoint = row[DSF.ENDPOINT];
        if (stryMutAct_9fa48("76508") ? (!isNonEmptyString(lineageId) || stageId === null) && !isNonEmptyString(endpoint) : stryMutAct_9fa48("76507") ? false : stryMutAct_9fa48("76506") ? true : (stryCov_9fa48("76506", "76507", "76508"), (stryMutAct_9fa48("76510") ? !isNonEmptyString(lineageId) && stageId === null : stryMutAct_9fa48("76509") ? false : (stryCov_9fa48("76509", "76510"), (stryMutAct_9fa48("76511") ? isNonEmptyString(lineageId) : (stryCov_9fa48("76511"), !isNonEmptyString(lineageId))) || (stryMutAct_9fa48("76513") ? stageId !== null : stryMutAct_9fa48("76512") ? false : (stryCov_9fa48("76512", "76513"), stageId === null)))) || (stryMutAct_9fa48("76514") ? isNonEmptyString(endpoint) : (stryCov_9fa48("76514"), !isNonEmptyString(endpoint))))) {
          if (stryMutAct_9fa48("76515")) {
            {}
          } else {
            stryCov_9fa48("76515");
            continue;
          }
        }
        normalized.push(stryMutAct_9fa48("76516") ? {} : (stryCov_9fa48("76516"), {
          lineageId,
          stageId,
          endpoint,
          nodeId: stryMutAct_9fa48("76519") ? row[DSF.NODE_ID] && null : stryMutAct_9fa48("76518") ? false : stryMutAct_9fa48("76517") ? true : (stryCov_9fa48("76517", "76518", "76519"), row[DSF.NODE_ID] || null),
          sessionId: stryMutAct_9fa48("76522") ? row[DSF.SESSION_ID] && null : stryMutAct_9fa48("76521") ? false : stryMutAct_9fa48("76520") ? true : (stryCov_9fa48("76520", "76521", "76522"), row[DSF.SESSION_ID] || null),
          updatedAt: toTimestampOrNow(row[DSF.UPDATED_AT], NUM.ZERO)
        }));
      }
    }
    stryMutAct_9fa48("76523") ? normalized : (stryCov_9fa48("76523"), normalized.sort((left, right) => {
      if (stryMutAct_9fa48("76524")) {
        {}
      } else {
        stryCov_9fa48("76524");
        if (stryMutAct_9fa48("76527") ? left.lineageId === right.lineageId : stryMutAct_9fa48("76526") ? false : stryMutAct_9fa48("76525") ? true : (stryCov_9fa48("76525", "76526", "76527"), left.lineageId !== right.lineageId)) {
          if (stryMutAct_9fa48("76528")) {
            {}
          } else {
            stryCov_9fa48("76528");
            return left.lineageId.localeCompare(right.lineageId);
          }
        }
        if (stryMutAct_9fa48("76531") ? left.stageId === right.stageId : stryMutAct_9fa48("76530") ? false : stryMutAct_9fa48("76529") ? true : (stryCov_9fa48("76529", "76530", "76531"), left.stageId !== right.stageId)) {
          if (stryMutAct_9fa48("76532")) {
            {}
          } else {
            stryCov_9fa48("76532");
            return stryMutAct_9fa48("76533") ? left.stageId + right.stageId : (stryCov_9fa48("76533"), left.stageId - right.stageId);
          }
        }
        return stryMutAct_9fa48("76534") ? left.updatedAt + right.updatedAt : (stryCov_9fa48("76534"), left.updatedAt - right.updatedAt);
      }
    }));
    return normalized;
  }
}

/**
 * @param {Object} request
 */
function assertRequest(request) {
  if (stryMutAct_9fa48("76535")) {
    {}
  } else {
    stryCov_9fa48("76535");
    if (stryMutAct_9fa48("76538") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("76537") ? false : stryMutAct_9fa48("76536") ? true : (stryCov_9fa48("76536", "76537", "76538"), (stryMutAct_9fa48("76539") ? request : (stryCov_9fa48("76539"), !request)) || (stryMutAct_9fa48("76541") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("76540") ? false : (stryCov_9fa48("76540", "76541"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("76542")) {
        {}
      } else {
        stryCov_9fa48("76542");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
  }
}

/**
 * @param {string} lineageId
 */
function assertLineageId(lineageId) {
  if (stryMutAct_9fa48("76543")) {
    {}
  } else {
    stryCov_9fa48("76543");
    if (stryMutAct_9fa48("76546") ? false : stryMutAct_9fa48("76545") ? true : stryMutAct_9fa48("76544") ? isNonEmptyString(lineageId) : (stryCov_9fa48("76544", "76545", "76546"), !isNonEmptyString(lineageId))) {
      if (stryMutAct_9fa48("76547")) {
        {}
      } else {
        stryCov_9fa48("76547");
        throw new Error(ERR.LINEAGE_ID_REQUIRED);
      }
    }
  }
}

/**
 * @param {number} stageId
 */
function assertStageId(stageId) {
  if (stryMutAct_9fa48("76548")) {
    {}
  } else {
    stryCov_9fa48("76548");
    if (stryMutAct_9fa48("76551") ? !isNonNegativeInteger(stageId) && stageId < DEF.MIN_STAGE_ID : stryMutAct_9fa48("76550") ? false : stryMutAct_9fa48("76549") ? true : (stryCov_9fa48("76549", "76550", "76551"), (stryMutAct_9fa48("76552") ? isNonNegativeInteger(stageId) : (stryCov_9fa48("76552"), !isNonNegativeInteger(stageId))) || (stryMutAct_9fa48("76555") ? stageId >= DEF.MIN_STAGE_ID : stryMutAct_9fa48("76554") ? stageId <= DEF.MIN_STAGE_ID : stryMutAct_9fa48("76553") ? false : (stryCov_9fa48("76553", "76554", "76555"), stageId < DEF.MIN_STAGE_ID)))) {
      if (stryMutAct_9fa48("76556")) {
        {}
      } else {
        stryCov_9fa48("76556");
        throw new Error(ERR.STAGE_ID_REQUIRED);
      }
    }
  }
}

/**
 * @param {string} endpoint
 */
function assertEndpoint(endpoint) {
  if (stryMutAct_9fa48("76557")) {
    {}
  } else {
    stryCov_9fa48("76557");
    if (stryMutAct_9fa48("76560") ? false : stryMutAct_9fa48("76559") ? true : stryMutAct_9fa48("76558") ? isNonEmptyString(endpoint) : (stryCov_9fa48("76558", "76559", "76560"), !isNonEmptyString(endpoint))) {
      if (stryMutAct_9fa48("76561")) {
        {}
      } else {
        stryCov_9fa48("76561");
        throw new Error(ERR.ENDPOINT_REQUIRED);
      }
    }
  }
}

/**
 * @param {*} value
 * @return {number|null}
 */
function toStageId(value) {
  if (stryMutAct_9fa48("76562")) {
    {}
  } else {
    stryCov_9fa48("76562");
    if (stryMutAct_9fa48("76564") ? false : stryMutAct_9fa48("76563") ? true : (stryCov_9fa48("76563", "76564"), isNonNegativeInteger(value))) {
      if (stryMutAct_9fa48("76565")) {
        {}
      } else {
        stryCov_9fa48("76565");
        return value;
      }
    }
    if (stryMutAct_9fa48("76568") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("76567") ? false : stryMutAct_9fa48("76566") ? true : (stryCov_9fa48("76566", "76567", "76568"), (stryMutAct_9fa48("76570") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("76569") ? true : (stryCov_9fa48("76569", "76570"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("76573") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("76572") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("76571") ? true : (stryCov_9fa48("76571", "76572", "76573"), (stryMutAct_9fa48("76574") ? value.length : (stryCov_9fa48("76574"), value.trim().length)) > NUM.ZERO)))) {
      if (stryMutAct_9fa48("76575")) {
        {}
      } else {
        stryCov_9fa48("76575");
        const parsed = Number.parseInt(value, 10);
        if (stryMutAct_9fa48("76577") ? false : stryMutAct_9fa48("76576") ? true : (stryCov_9fa48("76576", "76577"), isNonNegativeInteger(parsed))) {
          if (stryMutAct_9fa48("76578")) {
            {}
          } else {
            stryCov_9fa48("76578");
            return parsed;
          }
        }
      }
    }
    return null;
  }
}

/**
 * @param {*} value
 * @param {number} fallback
 * @return {number}
 */
function toTimestampOrNow(value, fallback) {
  if (stryMutAct_9fa48("76579")) {
    {}
  } else {
    stryCov_9fa48("76579");
    return isNonNegativeInteger(value) ? value : fallback;
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("76580")) {
    {}
  } else {
    stryCov_9fa48("76580");
    return stryMutAct_9fa48("76583") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("76582") ? false : stryMutAct_9fa48("76581") ? true : (stryCov_9fa48("76581", "76582", "76583"), Number.isInteger(value) && (stryMutAct_9fa48("76586") ? value < NUM.ZERO : stryMutAct_9fa48("76585") ? value > NUM.ZERO : stryMutAct_9fa48("76584") ? true : (stryCov_9fa48("76584", "76585", "76586"), value >= NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("76587")) {
    {}
  } else {
    stryCov_9fa48("76587");
    return stryMutAct_9fa48("76590") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("76589") ? false : stryMutAct_9fa48("76588") ? true : (stryCov_9fa48("76588", "76589", "76590"), (stryMutAct_9fa48("76592") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("76591") ? true : (stryCov_9fa48("76591", "76592"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("76595") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("76594") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("76593") ? true : (stryCov_9fa48("76593", "76594", "76595"), (stryMutAct_9fa48("76596") ? value.length : (stryCov_9fa48("76596"), value.trim().length)) > NUM.ZERO)));
  }
}
export { DebugCoordinator, decideMonotonicTransition };