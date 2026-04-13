/**
 * DebugSessionResolver resolves tenant/service/lineage-scoped
 * trace sessions from SQL/CDC-propagated metadata.
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
import { NUM, TABLES, TYPEOF } from '../constants/index.js';
import { DEBUG_DEFAULT, DEBUG_ERROR_MSG, DEBUG_SESSION_STATUS, DEBUG_TRACE_SOURCE } from './debug-constants.js';
const SESSION_FIELD = Object.freeze(stryMutAct_9fa48("75285") ? {} : (stryCov_9fa48("75285"), {
  SESSION_ID: stryMutAct_9fa48("75286") ? "" : (stryCov_9fa48("75286"), 'session_id'),
  SERVICE_NAME: stryMutAct_9fa48("75287") ? "" : (stryCov_9fa48("75287"), 'service_name'),
  LINEAGE_ID: stryMutAct_9fa48("75288") ? "" : (stryCov_9fa48("75288"), 'lineage_id'),
  STAGE_ID: stryMutAct_9fa48("75289") ? "" : (stryCov_9fa48("75289"), 'stage_id'),
  STATUS: stryMutAct_9fa48("75290") ? "" : (stryCov_9fa48("75290"), 'status'),
  UPDATED_AT: stryMutAct_9fa48("75291") ? "" : (stryCov_9fa48("75291"), 'updated_at'),
  CREATED_AT: stryMutAct_9fa48("75292") ? "" : (stryCov_9fa48("75292"), 'created_at')
}));

/**
 * Resolve active tracing sessions from debug metadata.
 */
class DebugSessionResolver {
  /**
   * @param {Object} [options]
   * @param {Object} [options.systemTableCache] - Read-only system cache.
   * @param {Function} [options.readSessions] - Optional metadata reader.
   * @param {Function} [options.now] - Clock function.
   * @param {number} [options.maxSessionAgeMs] - Stale-session threshold.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("75293")) {
      {}
    } else {
      stryCov_9fa48("75293");
      this.systemTableCache = stryMutAct_9fa48("75296") ? options.systemTableCache && null : stryMutAct_9fa48("75295") ? false : stryMutAct_9fa48("75294") ? true : (stryCov_9fa48("75294", "75295", "75296"), options.systemTableCache || null);
      this.readSessions = stryMutAct_9fa48("75299") ? options.readSessions && null : stryMutAct_9fa48("75298") ? false : stryMutAct_9fa48("75297") ? true : (stryCov_9fa48("75297", "75298", "75299"), options.readSessions || null);
      this.now = stryMutAct_9fa48("75302") ? options.now && (() => Date.now()) : stryMutAct_9fa48("75301") ? false : stryMutAct_9fa48("75300") ? true : (stryCov_9fa48("75300", "75301", "75302"), options.now || (stryMutAct_9fa48("75303") ? () => undefined : (stryCov_9fa48("75303"), () => Date.now())));
      this.maxSessionAgeMs = stryMutAct_9fa48("75304") ? options.maxSessionAgeMs && DEBUG_DEFAULT.MAX_SESSION_AGE_MS : (stryCov_9fa48("75304"), options.maxSessionAgeMs ?? DEBUG_DEFAULT.MAX_SESSION_AGE_MS);
    }
  }

  /**
   * Resolve active trace session for a service scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveServiceSession(scope = {}) {
    if (stryMutAct_9fa48("75305")) {
      {}
    } else {
      stryCov_9fa48("75305");
      const serviceName = resolveServiceName(scope);
      if (stryMutAct_9fa48("75308") ? false : stryMutAct_9fa48("75307") ? true : stryMutAct_9fa48("75306") ? serviceName : (stryCov_9fa48("75306", "75307", "75308"), !serviceName)) {
        if (stryMutAct_9fa48("75309")) {
          {}
        } else {
          stryCov_9fa48("75309");
          return null;
        }
      }
      const sessions = stryMutAct_9fa48("75310") ? this.getActiveSessions() : (stryCov_9fa48("75310"), this.getActiveSessions().filter(stryMutAct_9fa48("75311") ? () => undefined : (stryCov_9fa48("75311"), session => stryMutAct_9fa48("75314") ? session.serviceName === serviceName || !session.lineageId : stryMutAct_9fa48("75313") ? false : stryMutAct_9fa48("75312") ? true : (stryCov_9fa48("75312", "75313", "75314"), (stryMutAct_9fa48("75316") ? session.serviceName !== serviceName : stryMutAct_9fa48("75315") ? true : (stryCov_9fa48("75315", "75316"), session.serviceName === serviceName)) && (stryMutAct_9fa48("75317") ? session.lineageId : (stryCov_9fa48("75317"), !session.lineageId))))));
      return stryMutAct_9fa48("75320") ? sessions[NUM.ZERO] && null : stryMutAct_9fa48("75319") ? false : stryMutAct_9fa48("75318") ? true : (stryCov_9fa48("75318", "75319", "75320"), sessions[NUM.ZERO] || null);
    }
  }

  /**
   * Resolve active trace session for callback scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveCallbackSession(scope = {}) {
    if (stryMutAct_9fa48("75321")) {
      {}
    } else {
      stryCov_9fa48("75321");
      const lineageId = resolveLineageId(scope);
      if (stryMutAct_9fa48("75324") ? false : stryMutAct_9fa48("75323") ? true : stryMutAct_9fa48("75322") ? lineageId : (stryCov_9fa48("75322", "75323", "75324"), !lineageId)) {
        if (stryMutAct_9fa48("75325")) {
          {}
        } else {
          stryCov_9fa48("75325");
          return null;
        }
      }
      const stageId = normalizeNullableInteger(stryMutAct_9fa48("75326") ? scope.stageId && scope.stage_id : (stryCov_9fa48("75326"), scope.stageId ?? scope.stage_id));
      const serviceName = resolveServiceName(scope);
      const sessions = stryMutAct_9fa48("75327") ? this.getActiveSessions() : (stryCov_9fa48("75327"), this.getActiveSessions().filter(session => {
        if (stryMutAct_9fa48("75328")) {
          {}
        } else {
          stryCov_9fa48("75328");
          if (stryMutAct_9fa48("75331") ? session.lineageId === lineageId : stryMutAct_9fa48("75330") ? false : stryMutAct_9fa48("75329") ? true : (stryCov_9fa48("75329", "75330", "75331"), session.lineageId !== lineageId)) {
            if (stryMutAct_9fa48("75332")) {
              {}
            } else {
              stryCov_9fa48("75332");
              return stryMutAct_9fa48("75333") ? true : (stryCov_9fa48("75333"), false);
            }
          }
          if (stryMutAct_9fa48("75336") ? serviceName || session.serviceName !== serviceName : stryMutAct_9fa48("75335") ? false : stryMutAct_9fa48("75334") ? true : (stryCov_9fa48("75334", "75335", "75336"), serviceName && (stryMutAct_9fa48("75338") ? session.serviceName === serviceName : stryMutAct_9fa48("75337") ? true : (stryCov_9fa48("75337", "75338"), session.serviceName !== serviceName)))) {
            if (stryMutAct_9fa48("75339")) {
              {}
            } else {
              stryCov_9fa48("75339");
              return stryMutAct_9fa48("75340") ? true : (stryCov_9fa48("75340"), false);
            }
          }
          if (stryMutAct_9fa48("75343") ? stageId !== null : stryMutAct_9fa48("75342") ? false : stryMutAct_9fa48("75341") ? true : (stryCov_9fa48("75341", "75342", "75343"), stageId === null)) {
            if (stryMutAct_9fa48("75344")) {
              {}
            } else {
              stryCov_9fa48("75344");
              return stryMutAct_9fa48("75345") ? false : (stryCov_9fa48("75345"), true);
            }
          }
          return stryMutAct_9fa48("75348") ? session.stageId === null && session.stageId === stageId : stryMutAct_9fa48("75347") ? false : stryMutAct_9fa48("75346") ? true : (stryCov_9fa48("75346", "75347", "75348"), (stryMutAct_9fa48("75350") ? session.stageId !== null : stryMutAct_9fa48("75349") ? false : (stryCov_9fa48("75349", "75350"), session.stageId === null)) || (stryMutAct_9fa48("75352") ? session.stageId !== stageId : stryMutAct_9fa48("75351") ? false : (stryCov_9fa48("75351", "75352"), session.stageId === stageId)));
        }
      }));
      return stryMutAct_9fa48("75355") ? sessions[NUM.ZERO] && null : stryMutAct_9fa48("75354") ? false : stryMutAct_9fa48("75353") ? true : (stryCov_9fa48("75353", "75354", "75355"), sessions[NUM.ZERO] || null);
    }
  }

  /**
   * Resolve active session for either service or callback scope.
   * @param {Object} scope
   * @return {Object|null}
   */
  resolveSession(scope = {}) {
    if (stryMutAct_9fa48("75356")) {
      {}
    } else {
      stryCov_9fa48("75356");
      if (stryMutAct_9fa48("75359") ? !scope && typeof scope !== TYPEOF.OBJECT : stryMutAct_9fa48("75358") ? false : stryMutAct_9fa48("75357") ? true : (stryCov_9fa48("75357", "75358", "75359"), (stryMutAct_9fa48("75360") ? scope : (stryCov_9fa48("75360"), !scope)) || (stryMutAct_9fa48("75362") ? typeof scope === TYPEOF.OBJECT : stryMutAct_9fa48("75361") ? false : (stryCov_9fa48("75361", "75362"), typeof scope !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("75363")) {
          {}
        } else {
          stryCov_9fa48("75363");
          throw new Error(DEBUG_ERROR_MSG.TRACE_RESOLVER_SCOPE_REQUIRED);
        }
      }
      const source = stryMutAct_9fa48("75366") ? scope.source && inferSource(scope) : stryMutAct_9fa48("75365") ? false : stryMutAct_9fa48("75364") ? true : (stryCov_9fa48("75364", "75365", "75366"), scope.source || inferSource(scope));
      if (stryMutAct_9fa48("75369") ? source !== DEBUG_TRACE_SOURCE.PARTITION_CALLBACK : stryMutAct_9fa48("75368") ? false : stryMutAct_9fa48("75367") ? true : (stryCov_9fa48("75367", "75368", "75369"), source === DEBUG_TRACE_SOURCE.PARTITION_CALLBACK)) {
        if (stryMutAct_9fa48("75370")) {
          {}
        } else {
          stryCov_9fa48("75370");
          return this.resolveCallbackSession(scope);
        }
      }
      return this.resolveServiceSession(scope);
    }
  }

  /**
   * Cheap active-trace gate for hot paths.
   * @param {Object} scope
   * @return {boolean}
   */
  isTraceActive(scope = {}) {
    if (stryMutAct_9fa48("75371")) {
      {}
    } else {
      stryCov_9fa48("75371");
      return Boolean(this.resolveSession(scope));
    }
  }

  /**
   * Read all active non-stale sessions sorted by recency.
   * @return {Array<Object>}
   */
  getActiveSessions() {
    if (stryMutAct_9fa48("75372")) {
      {}
    } else {
      stryCov_9fa48("75372");
      const now = this.now();
      const rows = this.readSessionRows();
      const sessions = stryMutAct_9fa48("75373") ? ["Stryker was here"] : (stryCov_9fa48("75373"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("75374")) {
          {}
        } else {
          stryCov_9fa48("75374");
          const normalized = normalizeSessionRow(row);
          if (stryMutAct_9fa48("75377") ? false : stryMutAct_9fa48("75376") ? true : stryMutAct_9fa48("75375") ? normalized : (stryCov_9fa48("75375", "75376", "75377"), !normalized)) {
            if (stryMutAct_9fa48("75378")) {
              {}
            } else {
              stryCov_9fa48("75378");
              continue;
            }
          }
          if (stryMutAct_9fa48("75381") ? normalized.status === DEBUG_SESSION_STATUS.ACTIVE : stryMutAct_9fa48("75380") ? false : stryMutAct_9fa48("75379") ? true : (stryCov_9fa48("75379", "75380", "75381"), normalized.status !== DEBUG_SESSION_STATUS.ACTIVE)) {
            if (stryMutAct_9fa48("75382")) {
              {}
            } else {
              stryCov_9fa48("75382");
              continue;
            }
          }
          if (stryMutAct_9fa48("75384") ? false : stryMutAct_9fa48("75383") ? true : (stryCov_9fa48("75383", "75384"), this.isSessionStale(normalized, now))) {
            if (stryMutAct_9fa48("75385")) {
              {}
            } else {
              stryCov_9fa48("75385");
              continue;
            }
          }
          sessions.push(normalized);
        }
      }
      stryMutAct_9fa48("75386") ? sessions : (stryCov_9fa48("75386"), sessions.sort(stryMutAct_9fa48("75387") ? () => undefined : (stryCov_9fa48("75387"), (a, b) => stryMutAct_9fa48("75388") ? (b.updatedAt || NUM.ZERO) + (a.updatedAt || NUM.ZERO) : (stryCov_9fa48("75388"), (stryMutAct_9fa48("75391") ? b.updatedAt && NUM.ZERO : stryMutAct_9fa48("75390") ? false : stryMutAct_9fa48("75389") ? true : (stryCov_9fa48("75389", "75390", "75391"), b.updatedAt || NUM.ZERO)) - (stryMutAct_9fa48("75394") ? a.updatedAt && NUM.ZERO : stryMutAct_9fa48("75393") ? false : stryMutAct_9fa48("75392") ? true : (stryCov_9fa48("75392", "75393", "75394"), a.updatedAt || NUM.ZERO))))));
      return sessions;
    }
  }

  /**
   * @param {Object} session
   * @param {number} now
   * @return {boolean}
   */
  isSessionStale(session, now) {
    if (stryMutAct_9fa48("75395")) {
      {}
    } else {
      stryCov_9fa48("75395");
      if (stryMutAct_9fa48("75399") ? this.maxSessionAgeMs > NUM.ZERO : stryMutAct_9fa48("75398") ? this.maxSessionAgeMs < NUM.ZERO : stryMutAct_9fa48("75397") ? false : stryMutAct_9fa48("75396") ? true : (stryCov_9fa48("75396", "75397", "75398", "75399"), this.maxSessionAgeMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("75400")) {
          {}
        } else {
          stryCov_9fa48("75400");
          return stryMutAct_9fa48("75401") ? true : (stryCov_9fa48("75401"), false);
        }
      }
      if (stryMutAct_9fa48("75404") ? session.updatedAt !== null : stryMutAct_9fa48("75403") ? false : stryMutAct_9fa48("75402") ? true : (stryCov_9fa48("75402", "75403", "75404"), session.updatedAt === null)) {
        if (stryMutAct_9fa48("75405")) {
          {}
        } else {
          stryCov_9fa48("75405");
          return stryMutAct_9fa48("75406") ? true : (stryCov_9fa48("75406"), false);
        }
      }
      return stryMutAct_9fa48("75410") ? now - session.updatedAt <= this.maxSessionAgeMs : stryMutAct_9fa48("75409") ? now - session.updatedAt >= this.maxSessionAgeMs : stryMutAct_9fa48("75408") ? false : stryMutAct_9fa48("75407") ? true : (stryCov_9fa48("75407", "75408", "75409", "75410"), (stryMutAct_9fa48("75411") ? now + session.updatedAt : (stryCov_9fa48("75411"), now - session.updatedAt)) > this.maxSessionAgeMs);
    }
  }

  /**
   * @return {Array<Object>}
   * @private
   */
  readSessionRows() {
    if (stryMutAct_9fa48("75412")) {
      {}
    } else {
      stryCov_9fa48("75412");
      if (stryMutAct_9fa48("75415") ? typeof this.readSessions !== TYPEOF.FUNCTION : stryMutAct_9fa48("75414") ? false : stryMutAct_9fa48("75413") ? true : (stryCov_9fa48("75413", "75414", "75415"), typeof this.readSessions === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("75416")) {
          {}
        } else {
          stryCov_9fa48("75416");
          const rows = this.readSessions();
          return Array.isArray(rows) ? rows : stryMutAct_9fa48("75417") ? ["Stryker was here"] : (stryCov_9fa48("75417"), []);
        }
      }
      if (stryMutAct_9fa48("75420") ? this.systemTableCache || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("75419") ? false : stryMutAct_9fa48("75418") ? true : (stryCov_9fa48("75418", "75419", "75420"), this.systemTableCache && (stryMutAct_9fa48("75422") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("75421") ? true : (stryCov_9fa48("75421", "75422"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("75423")) {
          {}
        } else {
          stryCov_9fa48("75423");
          const rows = this.systemTableCache.getAll(TABLES.DEBUG_SESSIONS);
          return Array.isArray(rows) ? rows : stryMutAct_9fa48("75424") ? ["Stryker was here"] : (stryCov_9fa48("75424"), []);
        }
      }
      return stryMutAct_9fa48("75425") ? ["Stryker was here"] : (stryCov_9fa48("75425"), []);
    }
  }
}

/**
 * @param {Object} scope
 * @return {string|null}
 */
function resolveServiceName(scope) {
  if (stryMutAct_9fa48("75426")) {
    {}
  } else {
    stryCov_9fa48("75426");
    const value = stryMutAct_9fa48("75427") ? (scope.serviceDefinitionId ?? scope.service_definition_id ?? scope.serviceName ?? scope.service_name ?? scope.serviceId ?? scope.service_id) && null : (stryCov_9fa48("75427"), (stryMutAct_9fa48("75428") ? (scope.serviceDefinitionId ?? scope.service_definition_id ?? scope.serviceName ?? scope.service_name ?? scope.serviceId) && scope.service_id : (stryCov_9fa48("75428"), (stryMutAct_9fa48("75429") ? (scope.serviceDefinitionId ?? scope.service_definition_id ?? scope.serviceName ?? scope.service_name) && scope.serviceId : (stryCov_9fa48("75429"), (stryMutAct_9fa48("75430") ? (scope.serviceDefinitionId ?? scope.service_definition_id ?? scope.serviceName) && scope.service_name : (stryCov_9fa48("75430"), (stryMutAct_9fa48("75431") ? (scope.serviceDefinitionId ?? scope.service_definition_id) && scope.serviceName : (stryCov_9fa48("75431"), (stryMutAct_9fa48("75432") ? scope.serviceDefinitionId && scope.service_definition_id : (stryCov_9fa48("75432"), scope.serviceDefinitionId ?? scope.service_definition_id)) ?? scope.serviceName)) ?? scope.service_name)) ?? scope.serviceId)) ?? scope.service_id)) ?? null);
    return normalizeNullableString(value);
  }
}

/**
 * @param {Object} scope
 * @return {string|null}
 */
function resolveLineageId(scope) {
  if (stryMutAct_9fa48("75433")) {
    {}
  } else {
    stryCov_9fa48("75433");
    return normalizeNullableString(stryMutAct_9fa48("75434") ? (scope.lineageId ?? scope.lineage_id) && null : (stryCov_9fa48("75434"), (stryMutAct_9fa48("75435") ? scope.lineageId && scope.lineage_id : (stryCov_9fa48("75435"), scope.lineageId ?? scope.lineage_id)) ?? null));
  }
}

/**
 * @param {Object} scope
 * @return {string}
 */
function inferSource(scope) {
  if (stryMutAct_9fa48("75436")) {
    {}
  } else {
    stryCov_9fa48("75436");
    if (stryMutAct_9fa48("75438") ? false : stryMutAct_9fa48("75437") ? true : (stryCov_9fa48("75437", "75438"), resolveLineageId(scope))) {
      if (stryMutAct_9fa48("75439")) {
        {}
      } else {
        stryCov_9fa48("75439");
        return DEBUG_TRACE_SOURCE.PARTITION_CALLBACK;
      }
    }
    return DEBUG_TRACE_SOURCE.SERVICE;
  }
}

/**
 * @param {Object} row
 * @return {Object|null}
 */
function normalizeSessionRow(row) {
  if (stryMutAct_9fa48("75440")) {
    {}
  } else {
    stryCov_9fa48("75440");
    if (stryMutAct_9fa48("75443") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("75442") ? false : stryMutAct_9fa48("75441") ? true : (stryCov_9fa48("75441", "75442", "75443"), (stryMutAct_9fa48("75444") ? row : (stryCov_9fa48("75444"), !row)) || (stryMutAct_9fa48("75446") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("75445") ? false : (stryCov_9fa48("75445", "75446"), typeof row !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75447")) {
        {}
      } else {
        stryCov_9fa48("75447");
        return null;
      }
    }
    const sessionId = normalizeNullableString(stryMutAct_9fa48("75448") ? (row[SESSION_FIELD.SESSION_ID] ?? row.sessionId) && null : (stryCov_9fa48("75448"), (stryMutAct_9fa48("75449") ? row[SESSION_FIELD.SESSION_ID] && row.sessionId : (stryCov_9fa48("75449"), row[SESSION_FIELD.SESSION_ID] ?? row.sessionId)) ?? null));
    const serviceName = normalizeNullableString(stryMutAct_9fa48("75450") ? (row[SESSION_FIELD.SERVICE_NAME] ?? row.serviceName) && null : (stryCov_9fa48("75450"), (stryMutAct_9fa48("75451") ? row[SESSION_FIELD.SERVICE_NAME] && row.serviceName : (stryCov_9fa48("75451"), row[SESSION_FIELD.SERVICE_NAME] ?? row.serviceName)) ?? null));
    if (stryMutAct_9fa48("75454") ? !sessionId && !serviceName : stryMutAct_9fa48("75453") ? false : stryMutAct_9fa48("75452") ? true : (stryCov_9fa48("75452", "75453", "75454"), (stryMutAct_9fa48("75455") ? sessionId : (stryCov_9fa48("75455"), !sessionId)) || (stryMutAct_9fa48("75456") ? serviceName : (stryCov_9fa48("75456"), !serviceName)))) {
      if (stryMutAct_9fa48("75457")) {
        {}
      } else {
        stryCov_9fa48("75457");
        return null;
      }
    }
    const lineageId = normalizeNullableString(stryMutAct_9fa48("75458") ? (row[SESSION_FIELD.LINEAGE_ID] ?? row.lineageId) && null : (stryCov_9fa48("75458"), (stryMutAct_9fa48("75459") ? row[SESSION_FIELD.LINEAGE_ID] && row.lineageId : (stryCov_9fa48("75459"), row[SESSION_FIELD.LINEAGE_ID] ?? row.lineageId)) ?? null));
    const stageId = normalizeNullableInteger(stryMutAct_9fa48("75460") ? row[SESSION_FIELD.STAGE_ID] && row.stageId : (stryCov_9fa48("75460"), row[SESSION_FIELD.STAGE_ID] ?? row.stageId));
    const updatedAt = normalizeNullableInteger(stryMutAct_9fa48("75461") ? (row[SESSION_FIELD.UPDATED_AT] ?? row.updatedAt ?? row[SESSION_FIELD.CREATED_AT]) && row.createdAt : (stryCov_9fa48("75461"), (stryMutAct_9fa48("75462") ? (row[SESSION_FIELD.UPDATED_AT] ?? row.updatedAt) && row[SESSION_FIELD.CREATED_AT] : (stryCov_9fa48("75462"), (stryMutAct_9fa48("75463") ? row[SESSION_FIELD.UPDATED_AT] && row.updatedAt : (stryCov_9fa48("75463"), row[SESSION_FIELD.UPDATED_AT] ?? row.updatedAt)) ?? row[SESSION_FIELD.CREATED_AT])) ?? row.createdAt));
    const status = stryMutAct_9fa48("75466") ? normalizeNullableString(row[SESSION_FIELD.STATUS] ?? row.status ?? DEBUG_SESSION_STATUS.ACTIVE) && DEBUG_SESSION_STATUS.ACTIVE : stryMutAct_9fa48("75465") ? false : stryMutAct_9fa48("75464") ? true : (stryCov_9fa48("75464", "75465", "75466"), normalizeNullableString(stryMutAct_9fa48("75467") ? (row[SESSION_FIELD.STATUS] ?? row.status) && DEBUG_SESSION_STATUS.ACTIVE : (stryCov_9fa48("75467"), (stryMutAct_9fa48("75468") ? row[SESSION_FIELD.STATUS] && row.status : (stryCov_9fa48("75468"), row[SESSION_FIELD.STATUS] ?? row.status)) ?? DEBUG_SESSION_STATUS.ACTIVE)) || DEBUG_SESSION_STATUS.ACTIVE);
    return stryMutAct_9fa48("75469") ? {} : (stryCov_9fa48("75469"), {
      sessionId,
      serviceName,
      lineageId,
      stageId,
      status,
      updatedAt,
      raw: row
    });
  }
}

/**
 * @param {*} value
 * @return {string|null}
 */
function normalizeNullableString(value) {
  if (stryMutAct_9fa48("75470")) {
    {}
  } else {
    stryCov_9fa48("75470");
    if (stryMutAct_9fa48("75473") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("75472") ? false : stryMutAct_9fa48("75471") ? true : (stryCov_9fa48("75471", "75472", "75473"), typeof value !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("75474")) {
        {}
      } else {
        stryCov_9fa48("75474");
        return null;
      }
    }
    const trimmed = stryMutAct_9fa48("75475") ? value : (stryCov_9fa48("75475"), value.trim());
    return (stryMutAct_9fa48("75479") ? trimmed.length <= NUM.ZERO : stryMutAct_9fa48("75478") ? trimmed.length >= NUM.ZERO : stryMutAct_9fa48("75477") ? false : stryMutAct_9fa48("75476") ? true : (stryCov_9fa48("75476", "75477", "75478", "75479"), trimmed.length > NUM.ZERO)) ? trimmed : null;
  }
}

/**
 * @param {*} value
 * @return {number|null}
 */
function normalizeNullableInteger(value) {
  if (stryMutAct_9fa48("75480")) {
    {}
  } else {
    stryCov_9fa48("75480");
    if (stryMutAct_9fa48("75483") ? value === null && value === undefined : stryMutAct_9fa48("75482") ? false : stryMutAct_9fa48("75481") ? true : (stryCov_9fa48("75481", "75482", "75483"), (stryMutAct_9fa48("75485") ? value !== null : stryMutAct_9fa48("75484") ? false : (stryCov_9fa48("75484", "75485"), value === null)) || (stryMutAct_9fa48("75487") ? value !== undefined : stryMutAct_9fa48("75486") ? false : (stryCov_9fa48("75486", "75487"), value === undefined)))) {
      if (stryMutAct_9fa48("75488")) {
        {}
      } else {
        stryCov_9fa48("75488");
        return null;
      }
    }
    const parsed = Number(value);
    if (stryMutAct_9fa48("75491") ? false : stryMutAct_9fa48("75490") ? true : stryMutAct_9fa48("75489") ? Number.isFinite(parsed) : (stryCov_9fa48("75489", "75490", "75491"), !Number.isFinite(parsed))) {
      if (stryMutAct_9fa48("75492")) {
        {}
      } else {
        stryCov_9fa48("75492");
        return null;
      }
    }
    return Math.trunc(parsed);
  }
}
export { DebugSessionResolver, inferSource, normalizeSessionRow };