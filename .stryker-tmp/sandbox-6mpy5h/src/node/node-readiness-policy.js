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
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { NUM, SERVICE_STATUS, STATE, TYPEOF } from '../constants/index.js';
const REQUIRE_ACTIVE_STATUS_DEFAULT = stryMutAct_9fa48("93025") ? false : (stryCov_9fa48("93025"), true);
function normalizeConnectionState(nodeRow) {
  if (stryMutAct_9fa48("93026")) {
    {}
  } else {
    stryCov_9fa48("93026");
    const rawState = stryMutAct_9fa48("93027") ? (nodeRow?.connection_state ?? nodeRow?.connectionState) && null : (stryCov_9fa48("93027"), (stryMutAct_9fa48("93028") ? nodeRow?.connection_state && nodeRow?.connectionState : (stryCov_9fa48("93028"), (stryMutAct_9fa48("93029") ? nodeRow.connection_state : (stryCov_9fa48("93029"), nodeRow?.connection_state)) ?? (stryMutAct_9fa48("93030") ? nodeRow.connectionState : (stryCov_9fa48("93030"), nodeRow?.connectionState)))) ?? null);
    if (stryMutAct_9fa48("93033") ? typeof rawState === TYPEOF.STRING : stryMutAct_9fa48("93032") ? false : stryMutAct_9fa48("93031") ? true : (stryCov_9fa48("93031", "93032", "93033"), typeof rawState !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("93034")) {
        {}
      } else {
        stryCov_9fa48("93034");
        return null;
      }
    }
    const normalizedState = stryMutAct_9fa48("93035") ? rawState.toUpperCase() : (stryCov_9fa48("93035"), rawState.toLowerCase());
    return (stryMutAct_9fa48("93039") ? normalizedState.length <= NUM.ZERO : stryMutAct_9fa48("93038") ? normalizedState.length >= NUM.ZERO : stryMutAct_9fa48("93037") ? false : stryMutAct_9fa48("93036") ? true : (stryCov_9fa48("93036", "93037", "93038", "93039"), normalizedState.length > NUM.ZERO)) ? normalizedState : null;
  }
}
function getFiniteNumber(value) {
  if (stryMutAct_9fa48("93040")) {
    {}
  } else {
    stryCov_9fa48("93040");
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }
}
function hasOwnField(target, fieldName) {
  if (stryMutAct_9fa48("93041")) {
    {}
  } else {
    stryCov_9fa48("93041");
    return Boolean(stryMutAct_9fa48("93044") ? target && typeof target === TYPEOF.OBJECT || Object.prototype.hasOwnProperty.call(target, fieldName) : stryMutAct_9fa48("93043") ? false : stryMutAct_9fa48("93042") ? true : (stryCov_9fa48("93042", "93043", "93044"), (stryMutAct_9fa48("93046") ? target || typeof target === TYPEOF.OBJECT : stryMutAct_9fa48("93045") ? true : (stryCov_9fa48("93045", "93046"), target && (stryMutAct_9fa48("93048") ? typeof target !== TYPEOF.OBJECT : stryMutAct_9fa48("93047") ? true : (stryCov_9fa48("93047", "93048"), typeof target === TYPEOF.OBJECT)))) && Object.prototype.hasOwnProperty.call(target, fieldName)));
  }
}
function hasExplicitReadyLeaseField(nodeRow) {
  if (stryMutAct_9fa48("93049")) {
    {}
  } else {
    stryCov_9fa48("93049");
    return stryMutAct_9fa48("93052") ? (hasOwnField(nodeRow, 'ready_lease_expires_at') || hasOwnField(nodeRow, 'readyLeaseExpiresAt') || hasOwnField(nodeRow, 'readyLeaseExpiresAtMs')) && hasOwnField(nodeRow, 'readyLeaseExpires') : stryMutAct_9fa48("93051") ? false : stryMutAct_9fa48("93050") ? true : (stryCov_9fa48("93050", "93051", "93052"), (stryMutAct_9fa48("93054") ? (hasOwnField(nodeRow, 'ready_lease_expires_at') || hasOwnField(nodeRow, 'readyLeaseExpiresAt')) && hasOwnField(nodeRow, 'readyLeaseExpiresAtMs') : stryMutAct_9fa48("93053") ? false : (stryCov_9fa48("93053", "93054"), (stryMutAct_9fa48("93056") ? hasOwnField(nodeRow, 'ready_lease_expires_at') && hasOwnField(nodeRow, 'readyLeaseExpiresAt') : stryMutAct_9fa48("93055") ? false : (stryCov_9fa48("93055", "93056"), hasOwnField(nodeRow, stryMutAct_9fa48("93057") ? "" : (stryCov_9fa48("93057"), 'ready_lease_expires_at')) || hasOwnField(nodeRow, stryMutAct_9fa48("93058") ? "" : (stryCov_9fa48("93058"), 'readyLeaseExpiresAt')))) || hasOwnField(nodeRow, stryMutAct_9fa48("93059") ? "" : (stryCov_9fa48("93059"), 'readyLeaseExpiresAtMs')))) || hasOwnField(nodeRow, stryMutAct_9fa48("93060") ? "" : (stryCov_9fa48("93060"), 'readyLeaseExpires')));
  }
}
function getNodeHeartbeatWatermark(nodeRow) {
  if (stryMutAct_9fa48("93061")) {
    {}
  } else {
    stryCov_9fa48("93061");
    if (stryMutAct_9fa48("93064") ? !nodeRow && typeof nodeRow !== TYPEOF.OBJECT : stryMutAct_9fa48("93063") ? false : stryMutAct_9fa48("93062") ? true : (stryCov_9fa48("93062", "93063", "93064"), (stryMutAct_9fa48("93065") ? nodeRow : (stryCov_9fa48("93065"), !nodeRow)) || (stryMutAct_9fa48("93067") ? typeof nodeRow === TYPEOF.OBJECT : stryMutAct_9fa48("93066") ? false : (stryCov_9fa48("93066", "93067"), typeof nodeRow !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("93068")) {
        {}
      } else {
        stryCov_9fa48("93068");
        return null;
      }
    }
    return Object.freeze(stryMutAct_9fa48("93069") ? {} : (stryCov_9fa48("93069"), {
      lastHeartbeat: getFiniteNumber(stryMutAct_9fa48("93070") ? (nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat) && nodeRow.lastHeartbeatAt : (stryCov_9fa48("93070"), (stryMutAct_9fa48("93071") ? nodeRow.last_heartbeat && nodeRow.lastHeartbeat : (stryCov_9fa48("93071"), nodeRow.last_heartbeat ?? nodeRow.lastHeartbeat)) ?? nodeRow.lastHeartbeatAt)),
      readyLeaseExpiresAt: getFiniteNumber(stryMutAct_9fa48("93072") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt ?? nodeRow.readyLeaseExpiresAtMs) && nodeRow.readyLeaseExpires : (stryCov_9fa48("93072"), (stryMutAct_9fa48("93073") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt) && nodeRow.readyLeaseExpiresAtMs : (stryCov_9fa48("93073"), (stryMutAct_9fa48("93074") ? nodeRow.ready_lease_expires_at && nodeRow.readyLeaseExpiresAt : (stryCov_9fa48("93074"), nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt)) ?? nodeRow.readyLeaseExpiresAtMs)) ?? nodeRow.readyLeaseExpires)),
      connectionState: normalizeConnectionState(nodeRow)
    }));
  }
}
function compareNodeHeartbeatWatermarks(previousRow, nextRow) {
  if (stryMutAct_9fa48("93075")) {
    {}
  } else {
    stryCov_9fa48("93075");
    const previous = getNodeHeartbeatWatermark(previousRow);
    const next = getNodeHeartbeatWatermark(nextRow);
    if (stryMutAct_9fa48("93078") ? !previous && !next : stryMutAct_9fa48("93077") ? false : stryMutAct_9fa48("93076") ? true : (stryCov_9fa48("93076", "93077", "93078"), (stryMutAct_9fa48("93079") ? previous : (stryCov_9fa48("93079"), !previous)) || (stryMutAct_9fa48("93080") ? next : (stryCov_9fa48("93080"), !next)))) {
      if (stryMutAct_9fa48("93081")) {
        {}
      } else {
        stryCov_9fa48("93081");
        return NUM.ZERO;
      }
    }
    if (stryMutAct_9fa48("93084") ? previous.lastHeartbeat !== null && next.lastHeartbeat !== null || previous.lastHeartbeat !== next.lastHeartbeat : stryMutAct_9fa48("93083") ? false : stryMutAct_9fa48("93082") ? true : (stryCov_9fa48("93082", "93083", "93084"), (stryMutAct_9fa48("93086") ? previous.lastHeartbeat !== null || next.lastHeartbeat !== null : stryMutAct_9fa48("93085") ? true : (stryCov_9fa48("93085", "93086"), (stryMutAct_9fa48("93088") ? previous.lastHeartbeat === null : stryMutAct_9fa48("93087") ? true : (stryCov_9fa48("93087", "93088"), previous.lastHeartbeat !== null)) && (stryMutAct_9fa48("93090") ? next.lastHeartbeat === null : stryMutAct_9fa48("93089") ? true : (stryCov_9fa48("93089", "93090"), next.lastHeartbeat !== null)))) && (stryMutAct_9fa48("93092") ? previous.lastHeartbeat === next.lastHeartbeat : stryMutAct_9fa48("93091") ? true : (stryCov_9fa48("93091", "93092"), previous.lastHeartbeat !== next.lastHeartbeat)))) {
      if (stryMutAct_9fa48("93093")) {
        {}
      } else {
        stryCov_9fa48("93093");
        return (stryMutAct_9fa48("93097") ? next.lastHeartbeat <= previous.lastHeartbeat : stryMutAct_9fa48("93096") ? next.lastHeartbeat >= previous.lastHeartbeat : stryMutAct_9fa48("93095") ? false : stryMutAct_9fa48("93094") ? true : (stryCov_9fa48("93094", "93095", "93096", "93097"), next.lastHeartbeat > previous.lastHeartbeat)) ? 1 : stryMutAct_9fa48("93098") ? +1 : (stryCov_9fa48("93098"), -1);
      }
    }
    if (stryMutAct_9fa48("93101") ? previous.readyLeaseExpiresAt !== null && next.readyLeaseExpiresAt !== null || previous.readyLeaseExpiresAt !== next.readyLeaseExpiresAt : stryMutAct_9fa48("93100") ? false : stryMutAct_9fa48("93099") ? true : (stryCov_9fa48("93099", "93100", "93101"), (stryMutAct_9fa48("93103") ? previous.readyLeaseExpiresAt !== null || next.readyLeaseExpiresAt !== null : stryMutAct_9fa48("93102") ? true : (stryCov_9fa48("93102", "93103"), (stryMutAct_9fa48("93105") ? previous.readyLeaseExpiresAt === null : stryMutAct_9fa48("93104") ? true : (stryCov_9fa48("93104", "93105"), previous.readyLeaseExpiresAt !== null)) && (stryMutAct_9fa48("93107") ? next.readyLeaseExpiresAt === null : stryMutAct_9fa48("93106") ? true : (stryCov_9fa48("93106", "93107"), next.readyLeaseExpiresAt !== null)))) && (stryMutAct_9fa48("93109") ? previous.readyLeaseExpiresAt === next.readyLeaseExpiresAt : stryMutAct_9fa48("93108") ? true : (stryCov_9fa48("93108", "93109"), previous.readyLeaseExpiresAt !== next.readyLeaseExpiresAt)))) {
      if (stryMutAct_9fa48("93110")) {
        {}
      } else {
        stryCov_9fa48("93110");
        return (stryMutAct_9fa48("93114") ? next.readyLeaseExpiresAt <= previous.readyLeaseExpiresAt : stryMutAct_9fa48("93113") ? next.readyLeaseExpiresAt >= previous.readyLeaseExpiresAt : stryMutAct_9fa48("93112") ? false : stryMutAct_9fa48("93111") ? true : (stryCov_9fa48("93111", "93112", "93113", "93114"), next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt)) ? 1 : stryMutAct_9fa48("93115") ? +1 : (stryCov_9fa48("93115"), -1);
      }
    }
    if (stryMutAct_9fa48("93118") ? previous.lastHeartbeat !== null && next.lastHeartbeat !== null || previous.lastHeartbeat === next.lastHeartbeat : stryMutAct_9fa48("93117") ? false : stryMutAct_9fa48("93116") ? true : (stryCov_9fa48("93116", "93117", "93118"), (stryMutAct_9fa48("93120") ? previous.lastHeartbeat !== null || next.lastHeartbeat !== null : stryMutAct_9fa48("93119") ? true : (stryCov_9fa48("93119", "93120"), (stryMutAct_9fa48("93122") ? previous.lastHeartbeat === null : stryMutAct_9fa48("93121") ? true : (stryCov_9fa48("93121", "93122"), previous.lastHeartbeat !== null)) && (stryMutAct_9fa48("93124") ? next.lastHeartbeat === null : stryMutAct_9fa48("93123") ? true : (stryCov_9fa48("93123", "93124"), next.lastHeartbeat !== null)))) && (stryMutAct_9fa48("93126") ? previous.lastHeartbeat !== next.lastHeartbeat : stryMutAct_9fa48("93125") ? true : (stryCov_9fa48("93125", "93126"), previous.lastHeartbeat === next.lastHeartbeat)))) {
      if (stryMutAct_9fa48("93127")) {
        {}
      } else {
        stryCov_9fa48("93127");
        if (stryMutAct_9fa48("93130") ? previous.readyLeaseExpiresAt !== null || next.readyLeaseExpiresAt === null : stryMutAct_9fa48("93129") ? false : stryMutAct_9fa48("93128") ? true : (stryCov_9fa48("93128", "93129", "93130"), (stryMutAct_9fa48("93132") ? previous.readyLeaseExpiresAt === null : stryMutAct_9fa48("93131") ? true : (stryCov_9fa48("93131", "93132"), previous.readyLeaseExpiresAt !== null)) && (stryMutAct_9fa48("93134") ? next.readyLeaseExpiresAt !== null : stryMutAct_9fa48("93133") ? true : (stryCov_9fa48("93133", "93134"), next.readyLeaseExpiresAt === null)))) {
          if (stryMutAct_9fa48("93135")) {
            {}
          } else {
            stryCov_9fa48("93135");
            if (stryMutAct_9fa48("93138") ? next.connectionState === STATE.CONNECTED && next.connectionState === STATE.READY : stryMutAct_9fa48("93137") ? false : stryMutAct_9fa48("93136") ? true : (stryCov_9fa48("93136", "93137", "93138"), (stryMutAct_9fa48("93140") ? next.connectionState !== STATE.CONNECTED : stryMutAct_9fa48("93139") ? false : (stryCov_9fa48("93139", "93140"), next.connectionState === STATE.CONNECTED)) || (stryMutAct_9fa48("93142") ? next.connectionState !== STATE.READY : stryMutAct_9fa48("93141") ? false : (stryCov_9fa48("93141", "93142"), next.connectionState === STATE.READY)))) {
              if (stryMutAct_9fa48("93143")) {
                {}
              } else {
                stryCov_9fa48("93143");
                return stryMutAct_9fa48("93144") ? +1 : (stryCov_9fa48("93144"), -1);
              }
            }
            if (stryMutAct_9fa48("93147") ? next.connectionState !== STATE.DISCONNECTED : stryMutAct_9fa48("93146") ? false : stryMutAct_9fa48("93145") ? true : (stryCov_9fa48("93145", "93146", "93147"), next.connectionState === STATE.DISCONNECTED)) {
              if (stryMutAct_9fa48("93148")) {
                {}
              } else {
                stryCov_9fa48("93148");
                return 1;
              }
            }
          }
        }
        if (stryMutAct_9fa48("93151") ? previous.readyLeaseExpiresAt === null || next.readyLeaseExpiresAt !== null : stryMutAct_9fa48("93150") ? false : stryMutAct_9fa48("93149") ? true : (stryCov_9fa48("93149", "93150", "93151"), (stryMutAct_9fa48("93153") ? previous.readyLeaseExpiresAt !== null : stryMutAct_9fa48("93152") ? true : (stryCov_9fa48("93152", "93153"), previous.readyLeaseExpiresAt === null)) && (stryMutAct_9fa48("93155") ? next.readyLeaseExpiresAt === null : stryMutAct_9fa48("93154") ? true : (stryCov_9fa48("93154", "93155"), next.readyLeaseExpiresAt !== null)))) {
          if (stryMutAct_9fa48("93156")) {
            {}
          } else {
            stryCov_9fa48("93156");
            return 1;
          }
        }
        if (stryMutAct_9fa48("93159") ? previous.connectionState === STATE.READY || next.connectionState === STATE.CONNECTED : stryMutAct_9fa48("93158") ? false : stryMutAct_9fa48("93157") ? true : (stryCov_9fa48("93157", "93158", "93159"), (stryMutAct_9fa48("93161") ? previous.connectionState !== STATE.READY : stryMutAct_9fa48("93160") ? true : (stryCov_9fa48("93160", "93161"), previous.connectionState === STATE.READY)) && (stryMutAct_9fa48("93163") ? next.connectionState !== STATE.CONNECTED : stryMutAct_9fa48("93162") ? true : (stryCov_9fa48("93162", "93163"), next.connectionState === STATE.CONNECTED)))) {
          if (stryMutAct_9fa48("93164")) {
            {}
          } else {
            stryCov_9fa48("93164");
            return stryMutAct_9fa48("93165") ? +1 : (stryCov_9fa48("93165"), -1);
          }
        }
        if (stryMutAct_9fa48("93168") ? previous.connectionState === STATE.CONNECTED || next.connectionState === STATE.READY : stryMutAct_9fa48("93167") ? false : stryMutAct_9fa48("93166") ? true : (stryCov_9fa48("93166", "93167", "93168"), (stryMutAct_9fa48("93170") ? previous.connectionState !== STATE.CONNECTED : stryMutAct_9fa48("93169") ? true : (stryCov_9fa48("93169", "93170"), previous.connectionState === STATE.CONNECTED)) && (stryMutAct_9fa48("93172") ? next.connectionState !== STATE.READY : stryMutAct_9fa48("93171") ? true : (stryCov_9fa48("93171", "93172"), next.connectionState === STATE.READY)))) {
          if (stryMutAct_9fa48("93173")) {
            {}
          } else {
            stryCov_9fa48("93173");
            return 1;
          }
        }
      }
    }
    return NUM.ZERO;
  }
}
function isNodeHeartbeatWatermarkRegression(previousRow, nextRow) {
  if (stryMutAct_9fa48("93174")) {
    {}
  } else {
    stryCov_9fa48("93174");
    return stryMutAct_9fa48("93178") ? compareNodeHeartbeatWatermarks(previousRow, nextRow) >= NUM.ZERO : stryMutAct_9fa48("93177") ? compareNodeHeartbeatWatermarks(previousRow, nextRow) <= NUM.ZERO : stryMutAct_9fa48("93176") ? false : stryMutAct_9fa48("93175") ? true : (stryCov_9fa48("93175", "93176", "93177", "93178"), compareNodeHeartbeatWatermarks(previousRow, nextRow) < NUM.ZERO);
  }
}

/**
 * Check if a node record is ready based on lease and state fields.
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {number} options.now - Current timestamp.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when node row is ready.
 */
function isNodeRecordReady(nodeRow, options = {}) {
  if (stryMutAct_9fa48("93179")) {
    {}
  } else {
    stryCov_9fa48("93179");
    if (stryMutAct_9fa48("93182") ? false : stryMutAct_9fa48("93181") ? true : stryMutAct_9fa48("93180") ? nodeRow : (stryCov_9fa48("93180", "93181", "93182"), !nodeRow)) {
      if (stryMutAct_9fa48("93183")) {
        {}
      } else {
        stryCov_9fa48("93183");
        return stryMutAct_9fa48("93184") ? true : (stryCov_9fa48("93184"), false);
      }
    }
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const requireActiveStatus = stryMutAct_9fa48("93185") ? options.requireActiveStatus && REQUIRE_ACTIVE_STATUS_DEFAULT : (stryCov_9fa48("93185"), options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT);
    if (stryMutAct_9fa48("93188") ? requireActiveStatus || nodeRow.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93187") ? false : stryMutAct_9fa48("93186") ? true : (stryCov_9fa48("93186", "93187", "93188"), requireActiveStatus && (stryMutAct_9fa48("93190") ? nodeRow.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93189") ? true : (stryCov_9fa48("93189", "93190"), nodeRow.status !== SERVICE_STATUS.ACTIVE)))) {
      if (stryMutAct_9fa48("93191")) {
        {}
      } else {
        stryCov_9fa48("93191");
        return stryMutAct_9fa48("93192") ? true : (stryCov_9fa48("93192"), false);
      }
    }
    const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
    if (stryMutAct_9fa48("93195") ? !Number.isFinite(leaseExpiry) && leaseExpiry <= now : stryMutAct_9fa48("93194") ? false : stryMutAct_9fa48("93193") ? true : (stryCov_9fa48("93193", "93194", "93195"), (stryMutAct_9fa48("93196") ? Number.isFinite(leaseExpiry) : (stryCov_9fa48("93196"), !Number.isFinite(leaseExpiry))) || (stryMutAct_9fa48("93199") ? leaseExpiry > now : stryMutAct_9fa48("93198") ? leaseExpiry < now : stryMutAct_9fa48("93197") ? false : (stryCov_9fa48("93197", "93198", "93199"), leaseExpiry <= now)))) {
      if (stryMutAct_9fa48("93200")) {
        {}
      } else {
        stryCov_9fa48("93200");
        return stryMutAct_9fa48("93201") ? true : (stryCov_9fa48("93201"), false);
      }
    }
    return stryMutAct_9fa48("93202") ? false : (stryCov_9fa48("93202"), true);
  }
}

/**
 * Check whether a node row represented a ready heartbeat when it was written.
 * This avoids reclassifying delayed lease-refresh CDC events as fresh
 * not-ready to ready transitions after wall-clock time has advanced.
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {number} options.now - Current timestamp fallback when heartbeat time
 *   is unavailable.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when the row encoded a ready heartbeat at write time.
 */
function wasNodeRecordReadyWhenWritten(nodeRow, options = {}) {
  if (stryMutAct_9fa48("93203")) {
    {}
  } else {
    stryCov_9fa48("93203");
    if (stryMutAct_9fa48("93206") ? false : stryMutAct_9fa48("93205") ? true : stryMutAct_9fa48("93204") ? nodeRow : (stryCov_9fa48("93204", "93205", "93206"), !nodeRow)) {
      if (stryMutAct_9fa48("93207")) {
        {}
      } else {
        stryCov_9fa48("93207");
        return stryMutAct_9fa48("93208") ? true : (stryCov_9fa48("93208"), false);
      }
    }
    const requireActiveStatus = stryMutAct_9fa48("93209") ? options.requireActiveStatus && REQUIRE_ACTIVE_STATUS_DEFAULT : (stryCov_9fa48("93209"), options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT);
    if (stryMutAct_9fa48("93212") ? requireActiveStatus || nodeRow.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93211") ? false : stryMutAct_9fa48("93210") ? true : (stryCov_9fa48("93210", "93211", "93212"), requireActiveStatus && (stryMutAct_9fa48("93214") ? nodeRow.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93213") ? true : (stryCov_9fa48("93213", "93214"), nodeRow.status !== SERVICE_STATUS.ACTIVE)))) {
      if (stryMutAct_9fa48("93215")) {
        {}
      } else {
        stryCov_9fa48("93215");
        return stryMutAct_9fa48("93216") ? true : (stryCov_9fa48("93216"), false);
      }
    }
    const leaseExpiry = Number(nodeRow.ready_lease_expires_at);
    if (stryMutAct_9fa48("93219") ? false : stryMutAct_9fa48("93218") ? true : stryMutAct_9fa48("93217") ? Number.isFinite(leaseExpiry) : (stryCov_9fa48("93217", "93218", "93219"), !Number.isFinite(leaseExpiry))) {
      if (stryMutAct_9fa48("93220")) {
        {}
      } else {
        stryCov_9fa48("93220");
        return stryMutAct_9fa48("93221") ? true : (stryCov_9fa48("93221"), false);
      }
    }
    const heartbeatAt = Number(nodeRow.last_heartbeat);
    if (stryMutAct_9fa48("93223") ? false : stryMutAct_9fa48("93222") ? true : (stryCov_9fa48("93222", "93223"), Number.isFinite(heartbeatAt))) {
      if (stryMutAct_9fa48("93224")) {
        {}
      } else {
        stryCov_9fa48("93224");
        return stryMutAct_9fa48("93228") ? leaseExpiry <= heartbeatAt : stryMutAct_9fa48("93227") ? leaseExpiry >= heartbeatAt : stryMutAct_9fa48("93226") ? false : stryMutAct_9fa48("93225") ? true : (stryCov_9fa48("93225", "93226", "93227", "93228"), leaseExpiry > heartbeatAt);
      }
    }
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    return stryMutAct_9fa48("93232") ? leaseExpiry <= now : stryMutAct_9fa48("93231") ? leaseExpiry >= now : stryMutAct_9fa48("93230") ? false : stryMutAct_9fa48("93229") ? true : (stryCov_9fa48("93229", "93230", "93231", "93232"), leaseExpiry > now);
  }
}

/**
 * Check whether a node row carries an explicit owner-authored "not ready yet"
 * watermark by clearing the ready lease field entirely.
 *
 * This is distinct from an expired finite lease:
 * - expired finite leases can be stale cache evidence during topology change
 * - an explicit null/cleared lease is a fresh owner signal that readiness was
 *   intentionally revoked and must not be overridden by transport grace
 *
 * @param {Object} nodeRow - Node row from the nodes table.
 * @param {Object} options - Readiness options.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when the owner explicitly cleared the ready lease.
 */
function isNodeReadyLeaseExplicitlyCleared(nodeRow, options = {}) {
  if (stryMutAct_9fa48("93233")) {
    {}
  } else {
    stryCov_9fa48("93233");
    if (stryMutAct_9fa48("93236") ? !nodeRow && !hasExplicitReadyLeaseField(nodeRow) : stryMutAct_9fa48("93235") ? false : stryMutAct_9fa48("93234") ? true : (stryCov_9fa48("93234", "93235", "93236"), (stryMutAct_9fa48("93237") ? nodeRow : (stryCov_9fa48("93237"), !nodeRow)) || (stryMutAct_9fa48("93238") ? hasExplicitReadyLeaseField(nodeRow) : (stryCov_9fa48("93238"), !hasExplicitReadyLeaseField(nodeRow))))) {
      if (stryMutAct_9fa48("93239")) {
        {}
      } else {
        stryCov_9fa48("93239");
        return stryMutAct_9fa48("93240") ? true : (stryCov_9fa48("93240"), false);
      }
    }
    const requireActiveStatus = stryMutAct_9fa48("93241") ? options.requireActiveStatus && REQUIRE_ACTIVE_STATUS_DEFAULT : (stryCov_9fa48("93241"), options.requireActiveStatus ?? REQUIRE_ACTIVE_STATUS_DEFAULT);
    if (stryMutAct_9fa48("93244") ? requireActiveStatus || nodeRow.status !== SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93243") ? false : stryMutAct_9fa48("93242") ? true : (stryCov_9fa48("93242", "93243", "93244"), requireActiveStatus && (stryMutAct_9fa48("93246") ? nodeRow.status === SERVICE_STATUS.ACTIVE : stryMutAct_9fa48("93245") ? true : (stryCov_9fa48("93245", "93246"), nodeRow.status !== SERVICE_STATUS.ACTIVE)))) {
      if (stryMutAct_9fa48("93247")) {
        {}
      } else {
        stryCov_9fa48("93247");
        return stryMutAct_9fa48("93248") ? true : (stryCov_9fa48("93248"), false);
      }
    }
    return stryMutAct_9fa48("93249") ? Number.isFinite(Number(nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt ?? nodeRow.readyLeaseExpiresAtMs ?? nodeRow.readyLeaseExpires)) : (stryCov_9fa48("93249"), !Number.isFinite(Number(stryMutAct_9fa48("93250") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt ?? nodeRow.readyLeaseExpiresAtMs) && nodeRow.readyLeaseExpires : (stryCov_9fa48("93250"), (stryMutAct_9fa48("93251") ? (nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt) && nodeRow.readyLeaseExpiresAtMs : (stryCov_9fa48("93251"), (stryMutAct_9fa48("93252") ? nodeRow.ready_lease_expires_at && nodeRow.readyLeaseExpiresAt : (stryCov_9fa48("93252"), nodeRow.ready_lease_expires_at ?? nodeRow.readyLeaseExpiresAt)) ?? nodeRow.readyLeaseExpiresAtMs)) ?? nodeRow.readyLeaseExpires))));
  }
}

/**
 * Check node readiness using nodes table + router connection state.
 * @param {Object} options - Readiness options.
 * @param {string} options.nodeId - Node ID.
 * @param {Object} options.systemTableCache - System table cache.
 * @param {Object} options.messageRouter - Message router.
 * @param {number} options.now - Current timestamp.
 * @param {boolean} options.requireActiveStatus - Require status=active.
 * @return {boolean} True when node is ready and connected.
 */
function isNodeReadyWithConnection(options = {}) {
  if (stryMutAct_9fa48("93253")) {
    {}
  } else {
    stryCov_9fa48("93253");
    const nodeId = options.nodeId;
    if (stryMutAct_9fa48("93256") ? false : stryMutAct_9fa48("93255") ? true : stryMutAct_9fa48("93254") ? nodeId : (stryCov_9fa48("93254", "93255", "93256"), !nodeId)) {
      if (stryMutAct_9fa48("93257")) {
        {}
      } else {
        stryCov_9fa48("93257");
        return stryMutAct_9fa48("93258") ? true : (stryCov_9fa48("93258"), false);
      }
    }
    const cache = options.systemTableCache;
    if (stryMutAct_9fa48("93261") ? !cache && typeof cache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("93260") ? false : stryMutAct_9fa48("93259") ? true : (stryCov_9fa48("93259", "93260", "93261"), (stryMutAct_9fa48("93262") ? cache : (stryCov_9fa48("93262"), !cache)) || (stryMutAct_9fa48("93264") ? typeof cache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("93263") ? false : (stryCov_9fa48("93263", "93264"), typeof cache.get !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("93265")) {
        {}
      } else {
        stryCov_9fa48("93265");
        return stryMutAct_9fa48("93266") ? true : (stryCov_9fa48("93266"), false);
      }
    }
    const nodeRow = cache.get(SYSTEM_TABLE_NAME.NODES, nodeId);
    if (stryMutAct_9fa48("93269") ? false : stryMutAct_9fa48("93268") ? true : stryMutAct_9fa48("93267") ? isNodeRecordReady(nodeRow, options) : (stryCov_9fa48("93267", "93268", "93269"), !isNodeRecordReady(nodeRow, options))) {
      if (stryMutAct_9fa48("93270")) {
        {}
      } else {
        stryCov_9fa48("93270");
        return stryMutAct_9fa48("93271") ? true : (stryCov_9fa48("93271"), false);
      }
    }
    const router = options.messageRouter;
    if (stryMutAct_9fa48("93274") ? !router && typeof router.getConnectionState !== TYPEOF.FUNCTION : stryMutAct_9fa48("93273") ? false : stryMutAct_9fa48("93272") ? true : (stryCov_9fa48("93272", "93273", "93274"), (stryMutAct_9fa48("93275") ? router : (stryCov_9fa48("93275"), !router)) || (stryMutAct_9fa48("93277") ? typeof router.getConnectionState === TYPEOF.FUNCTION : stryMutAct_9fa48("93276") ? false : (stryCov_9fa48("93276", "93277"), typeof router.getConnectionState !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("93278")) {
        {}
      } else {
        stryCov_9fa48("93278");
        return stryMutAct_9fa48("93279") ? true : (stryCov_9fa48("93279"), false);
      }
    }
    return stryMutAct_9fa48("93282") ? router.getConnectionState(nodeId) !== STATE.CONNECTED : stryMutAct_9fa48("93281") ? false : stryMutAct_9fa48("93280") ? true : (stryCov_9fa48("93280", "93281", "93282"), router.getConnectionState(nodeId) === STATE.CONNECTED);
  }
}

/**
 * Check node readiness with optional transport-level checks.
 * @param {Object} options - Readiness options.
 * @param {boolean} options.requireOutboundQueue - Require outbound queue.
 * @param {boolean} options.enableReadinessPing - Require ping success.
 * @param {number} options.readinessPingTimeoutMs - Ping timeout.
 * @return {Promise<boolean>} True when node is transport-ready.
 */
async function isNodeReadyWithTransport(options = {}) {
  if (stryMutAct_9fa48("93283")) {
    {}
  } else {
    stryCov_9fa48("93283");
    if (stryMutAct_9fa48("93286") ? false : stryMutAct_9fa48("93285") ? true : stryMutAct_9fa48("93284") ? isNodeReadyWithConnection(options) : (stryCov_9fa48("93284", "93285", "93286"), !isNodeReadyWithConnection(options))) {
      if (stryMutAct_9fa48("93287")) {
        {}
      } else {
        stryCov_9fa48("93287");
        return stryMutAct_9fa48("93288") ? true : (stryCov_9fa48("93288"), false);
      }
    }
    const router = options.messageRouter;
    if (stryMutAct_9fa48("93291") ? options.requireOutboundQueue && typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION || !router.isOutboundQueueAvailable(options.nodeId) : stryMutAct_9fa48("93290") ? false : stryMutAct_9fa48("93289") ? true : (stryCov_9fa48("93289", "93290", "93291"), (stryMutAct_9fa48("93293") ? options.requireOutboundQueue || typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION : stryMutAct_9fa48("93292") ? true : (stryCov_9fa48("93292", "93293"), options.requireOutboundQueue && (stryMutAct_9fa48("93295") ? typeof router.isOutboundQueueAvailable !== TYPEOF.FUNCTION : stryMutAct_9fa48("93294") ? true : (stryCov_9fa48("93294", "93295"), typeof router.isOutboundQueueAvailable === TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("93296") ? router.isOutboundQueueAvailable(options.nodeId) : (stryCov_9fa48("93296"), !router.isOutboundQueueAvailable(options.nodeId))))) {
      if (stryMutAct_9fa48("93297")) {
        {}
      } else {
        stryCov_9fa48("93297");
        return stryMutAct_9fa48("93298") ? true : (stryCov_9fa48("93298"), false);
      }
    }
    if (stryMutAct_9fa48("93301") ? options.enableReadinessPing || typeof router.pingNode === TYPEOF.FUNCTION : stryMutAct_9fa48("93300") ? false : stryMutAct_9fa48("93299") ? true : (stryCov_9fa48("93299", "93300", "93301"), options.enableReadinessPing && (stryMutAct_9fa48("93303") ? typeof router.pingNode !== TYPEOF.FUNCTION : stryMutAct_9fa48("93302") ? true : (stryCov_9fa48("93302", "93303"), typeof router.pingNode === TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("93304")) {
        {}
      } else {
        stryCov_9fa48("93304");
        const pingTimeout = Number.isFinite(options.readinessPingTimeoutMs) ? options.readinessPingTimeoutMs : NUM.ZERO;
        const ok = await router.pingNode(options.nodeId, pingTimeout);
        if (stryMutAct_9fa48("93307") ? false : stryMutAct_9fa48("93306") ? true : stryMutAct_9fa48("93305") ? ok : (stryCov_9fa48("93305", "93306", "93307"), !ok)) {
          if (stryMutAct_9fa48("93308")) {
            {}
          } else {
            stryCov_9fa48("93308");
            return stryMutAct_9fa48("93309") ? true : (stryCov_9fa48("93309"), false);
          }
        }
      }
    }
    return stryMutAct_9fa48("93310") ? false : (stryCov_9fa48("93310"), true);
  }
}
export { compareNodeHeartbeatWatermarks, getNodeHeartbeatWatermark, isNodeHeartbeatWatermarkRegression, isNodeRecordReady, isNodeReadyLeaseExplicitlyCleared, isNodeReadyWithConnection, isNodeReadyWithTransport, wasNodeRecordReadyWhenWritten };