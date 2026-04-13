/**
 * DebugEmitter builds and emits structured Trace_Event envelopes.
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
import { DEBUG_ERROR_MSG, DEBUG_TRACE_FIELD as TF, DEBUG_TRACE_LEVEL_SET, DEBUG_TRACE_SOURCE } from './debug-constants.js';

/**
 * Emits trace events when debug sessions are active.
 */
class DebugEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.sessionResolver]
   * @param {Object} [options.traceCollector]
   * @param {Function} [options.now]
   * @param {Function} [options.buildTraceEvent]
   * @param {string} [options.nodeId]
   * @param {string} [options.serviceDefinitionId]
   * @param {string} [options.replicaId]
   * @param {string} [options.runtimeKind]
   * @param {string} [options.source]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("75147")) {
      {}
    } else {
      stryCov_9fa48("75147");
      this.sessionResolver = stryMutAct_9fa48("75150") ? options.sessionResolver && null : stryMutAct_9fa48("75149") ? false : stryMutAct_9fa48("75148") ? true : (stryCov_9fa48("75148", "75149", "75150"), options.sessionResolver || null);
      this.traceCollector = stryMutAct_9fa48("75153") ? options.traceCollector && null : stryMutAct_9fa48("75152") ? false : stryMutAct_9fa48("75151") ? true : (stryCov_9fa48("75151", "75152", "75153"), options.traceCollector || null);
      this.now = stryMutAct_9fa48("75156") ? options.now && (() => Date.now()) : stryMutAct_9fa48("75155") ? false : stryMutAct_9fa48("75154") ? true : (stryCov_9fa48("75154", "75155", "75156"), options.now || (stryMutAct_9fa48("75157") ? () => undefined : (stryCov_9fa48("75157"), () => Date.now())));
      this.nodeId = stryMutAct_9fa48("75160") ? options.nodeId && null : stryMutAct_9fa48("75159") ? false : stryMutAct_9fa48("75158") ? true : (stryCov_9fa48("75158", "75159", "75160"), options.nodeId || null);
      this.serviceDefinitionId = stryMutAct_9fa48("75163") ? options.serviceDefinitionId && null : stryMutAct_9fa48("75162") ? false : stryMutAct_9fa48("75161") ? true : (stryCov_9fa48("75161", "75162", "75163"), options.serviceDefinitionId || null);
      this.replicaId = stryMutAct_9fa48("75166") ? options.replicaId && null : stryMutAct_9fa48("75165") ? false : stryMutAct_9fa48("75164") ? true : (stryCov_9fa48("75164", "75165", "75166"), options.replicaId || null);
      this.runtimeKind = stryMutAct_9fa48("75169") ? options.runtimeKind && null : stryMutAct_9fa48("75168") ? false : stryMutAct_9fa48("75167") ? true : (stryCov_9fa48("75167", "75168", "75169"), options.runtimeKind || null);
      this.source = stryMutAct_9fa48("75172") ? options.source && DEBUG_TRACE_SOURCE.SERVICE : stryMutAct_9fa48("75171") ? false : stryMutAct_9fa48("75170") ? true : (stryCov_9fa48("75170", "75171", "75172"), options.source || DEBUG_TRACE_SOURCE.SERVICE);
      this.buildTraceEvent = stryMutAct_9fa48("75175") ? options.buildTraceEvent && buildTraceEvent : stryMutAct_9fa48("75174") ? false : stryMutAct_9fa48("75173") ? true : (stryCov_9fa48("75173", "75174", "75175"), options.buildTraceEvent || buildTraceEvent);
    }
  }

  /**
   * Emit one trace event when trace session is active.
   * @param {Object} request
   * @param {string} request.level
   * @param {string} request.message
   * @param {*} [request.context]
   * @param {Object} [request.scope]
   * @param {Object} [request.metadata]
   * @return {boolean}
   */
  emitTrace(request) {
    if (stryMutAct_9fa48("75176")) {
      {}
    } else {
      stryCov_9fa48("75176");
      if (stryMutAct_9fa48("75179") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("75178") ? false : stryMutAct_9fa48("75177") ? true : (stryCov_9fa48("75177", "75178", "75179"), (stryMutAct_9fa48("75180") ? request : (stryCov_9fa48("75180"), !request)) || (stryMutAct_9fa48("75182") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("75181") ? false : (stryCov_9fa48("75181", "75182"), typeof request !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("75183")) {
          {}
        } else {
          stryCov_9fa48("75183");
          throw new Error(DEBUG_ERROR_MSG.TRACE_EVENT_REQUIRED);
        }
      }
      const level = normalizeLevel(request.level);
      const message = normalizeMessage(request.message);
      const scope = stryMutAct_9fa48("75186") ? request.scope && null : stryMutAct_9fa48("75185") ? false : stryMutAct_9fa48("75184") ? true : (stryCov_9fa48("75184", "75185", "75186"), request.scope || null);
      const metadata = stryMutAct_9fa48("75189") ? request.metadata && null : stryMutAct_9fa48("75188") ? false : stryMutAct_9fa48("75187") ? true : (stryCov_9fa48("75187", "75188", "75189"), request.metadata || null);
      if (stryMutAct_9fa48("75192") ? false : stryMutAct_9fa48("75191") ? true : stryMutAct_9fa48("75190") ? this.isTraceActive(scope) : (stryCov_9fa48("75190", "75191", "75192"), !this.isTraceActive(scope))) {
        if (stryMutAct_9fa48("75193")) {
          {}
        } else {
          stryCov_9fa48("75193");
          return stryMutAct_9fa48("75194") ? true : (stryCov_9fa48("75194"), false);
        }
      }
      if (stryMutAct_9fa48("75197") ? !this.traceCollector && typeof this.traceCollector.emit !== TYPEOF.FUNCTION : stryMutAct_9fa48("75196") ? false : stryMutAct_9fa48("75195") ? true : (stryCov_9fa48("75195", "75196", "75197"), (stryMutAct_9fa48("75198") ? this.traceCollector : (stryCov_9fa48("75198"), !this.traceCollector)) || (stryMutAct_9fa48("75200") ? typeof this.traceCollector.emit === TYPEOF.FUNCTION : stryMutAct_9fa48("75199") ? false : (stryCov_9fa48("75199", "75200"), typeof this.traceCollector.emit !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("75201")) {
          {}
        } else {
          stryCov_9fa48("75201");
          return stryMutAct_9fa48("75202") ? true : (stryCov_9fa48("75202"), false);
        }
      }
      const event = this.buildTraceEvent(stryMutAct_9fa48("75203") ? {} : (stryCov_9fa48("75203"), {
        level,
        message,
        context: stryMutAct_9fa48("75204") ? request.context && null : (stryCov_9fa48("75204"), request.context ?? null),
        timestamp: this.now(),
        scope,
        metadata,
        fallback: stryMutAct_9fa48("75205") ? {} : (stryCov_9fa48("75205"), {
          nodeId: this.nodeId,
          serviceDefinitionId: this.serviceDefinitionId,
          replicaId: this.replicaId,
          runtimeKind: this.runtimeKind,
          source: this.source
        })
      }));
      this.traceCollector.emit(event);
      return stryMutAct_9fa48("75206") ? false : (stryCov_9fa48("75206"), true);
    }
  }

  /**
   * @param {Object|null} scope
   * @return {boolean}
   */
  isTraceActive(scope = null) {
    if (stryMutAct_9fa48("75207")) {
      {}
    } else {
      stryCov_9fa48("75207");
      if (stryMutAct_9fa48("75210") ? !this.sessionResolver && typeof this.sessionResolver.isTraceActive !== TYPEOF.FUNCTION : stryMutAct_9fa48("75209") ? false : stryMutAct_9fa48("75208") ? true : (stryCov_9fa48("75208", "75209", "75210"), (stryMutAct_9fa48("75211") ? this.sessionResolver : (stryCov_9fa48("75211"), !this.sessionResolver)) || (stryMutAct_9fa48("75213") ? typeof this.sessionResolver.isTraceActive === TYPEOF.FUNCTION : stryMutAct_9fa48("75212") ? false : (stryCov_9fa48("75212", "75213"), typeof this.sessionResolver.isTraceActive !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("75214")) {
          {}
        } else {
          stryCov_9fa48("75214");
          return stryMutAct_9fa48("75215") ? true : (stryCov_9fa48("75215"), false);
        }
      }
      return this.sessionResolver.isTraceActive(stryMutAct_9fa48("75218") ? scope && {} : stryMutAct_9fa48("75217") ? false : stryMutAct_9fa48("75216") ? true : (stryCov_9fa48("75216", "75217", "75218"), scope || {}));
    }
  }

  /**
   * Build a stable trace API for runtime contexts.
   * @param {Object} [scope]
   * @param {Object} [metadata]
   * @return {Readonly<Object>}
   */
  createTraceApi(scope = {}, metadata = {}) {
    if (stryMutAct_9fa48("75219")) {
      {}
    } else {
      stryCov_9fa48("75219");
      return Object.freeze(stryMutAct_9fa48("75220") ? {} : (stryCov_9fa48("75220"), {
        trace: stryMutAct_9fa48("75221") ? () => undefined : (stryCov_9fa48("75221"), (level, message, context = null) => this.emitTrace(stryMutAct_9fa48("75222") ? {} : (stryCov_9fa48("75222"), {
          level,
          message,
          context,
          scope,
          metadata
        })))
      }));
    }
  }
}

/**
 * Build the canonical Trace_Event envelope.
 * @param {Object} request
 * @return {Object}
 */
function buildTraceEvent(request) {
  if (stryMutAct_9fa48("75223")) {
    {}
  } else {
    stryCov_9fa48("75223");
    const scope = stryMutAct_9fa48("75226") ? request.scope && {} : stryMutAct_9fa48("75225") ? false : stryMutAct_9fa48("75224") ? true : (stryCov_9fa48("75224", "75225", "75226"), request.scope || {});
    const metadata = stryMutAct_9fa48("75229") ? request.metadata && {} : stryMutAct_9fa48("75228") ? false : stryMutAct_9fa48("75227") ? true : (stryCov_9fa48("75227", "75228", "75229"), request.metadata || {});
    const fallback = stryMutAct_9fa48("75232") ? request.fallback && {} : stryMutAct_9fa48("75231") ? false : stryMutAct_9fa48("75230") ? true : (stryCov_9fa48("75230", "75231", "75232"), request.fallback || {});
    return stryMutAct_9fa48("75233") ? {} : (stryCov_9fa48("75233"), {
      [TF.LEVEL]: request.level,
      [TF.MESSAGE]: request.message,
      [TF.CONTEXT]: stryMutAct_9fa48("75234") ? request.context && null : (stryCov_9fa48("75234"), request.context ?? null),
      [TF.TIMESTAMP]: request.timestamp,
      [TF.LINEAGE_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75235") ? "" : (stryCov_9fa48("75235"), 'lineageId')),
      [TF.STAGE_ID]: resolveNullableInt(resolveField(scope, metadata, stryMutAct_9fa48("75236") ? "" : (stryCov_9fa48("75236"), 'stageId'))),
      [TF.PARTITION_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75237") ? "" : (stryCov_9fa48("75237"), 'partitionId')),
      [TF.NODE_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75238") ? "" : (stryCov_9fa48("75238"), 'nodeId'), fallback.nodeId),
      [TF.SERVICE_DEFINITION_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75239") ? "" : (stryCov_9fa48("75239"), 'serviceDefinitionId'), fallback.serviceDefinitionId),
      [TF.REPLICA_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75240") ? "" : (stryCov_9fa48("75240"), 'replicaId'), fallback.replicaId),
      [TF.RUNTIME_KIND]: resolveField(scope, metadata, stryMutAct_9fa48("75241") ? "" : (stryCov_9fa48("75241"), 'runtimeKind'), fallback.runtimeKind),
      [TF.SOURCE]: resolveField(scope, metadata, stryMutAct_9fa48("75242") ? "" : (stryCov_9fa48("75242"), 'source'), fallback.source),
      [TF.SESSION_ID]: resolveField(scope, metadata, stryMutAct_9fa48("75243") ? "" : (stryCov_9fa48("75243"), 'sessionId'))
    });
  }
}

/**
 * @param {string} level
 * @return {string}
 */
function normalizeLevel(level) {
  if (stryMutAct_9fa48("75244")) {
    {}
  } else {
    stryCov_9fa48("75244");
    if (stryMutAct_9fa48("75247") ? typeof level !== TYPEOF.STRING && !DEBUG_TRACE_LEVEL_SET.has(level) : stryMutAct_9fa48("75246") ? false : stryMutAct_9fa48("75245") ? true : (stryCov_9fa48("75245", "75246", "75247"), (stryMutAct_9fa48("75249") ? typeof level === TYPEOF.STRING : stryMutAct_9fa48("75248") ? false : (stryCov_9fa48("75248", "75249"), typeof level !== TYPEOF.STRING)) || (stryMutAct_9fa48("75250") ? DEBUG_TRACE_LEVEL_SET.has(level) : (stryCov_9fa48("75250"), !DEBUG_TRACE_LEVEL_SET.has(level))))) {
      if (stryMutAct_9fa48("75251")) {
        {}
      } else {
        stryCov_9fa48("75251");
        throw new Error(stryMutAct_9fa48("75252") ? DEBUG_ERROR_MSG.TRACE_LEVEL_INVALID_PREFIX - String(level) : (stryCov_9fa48("75252"), DEBUG_ERROR_MSG.TRACE_LEVEL_INVALID_PREFIX + String(level)));
      }
    }
    return level;
  }
}

/**
 * @param {string} message
 * @return {string}
 */
function normalizeMessage(message) {
  if (stryMutAct_9fa48("75253")) {
    {}
  } else {
    stryCov_9fa48("75253");
    if (stryMutAct_9fa48("75256") ? typeof message !== TYPEOF.STRING && message.length <= NUM.ZERO : stryMutAct_9fa48("75255") ? false : stryMutAct_9fa48("75254") ? true : (stryCov_9fa48("75254", "75255", "75256"), (stryMutAct_9fa48("75258") ? typeof message === TYPEOF.STRING : stryMutAct_9fa48("75257") ? false : (stryCov_9fa48("75257", "75258"), typeof message !== TYPEOF.STRING)) || (stryMutAct_9fa48("75261") ? message.length > NUM.ZERO : stryMutAct_9fa48("75260") ? message.length < NUM.ZERO : stryMutAct_9fa48("75259") ? false : (stryCov_9fa48("75259", "75260", "75261"), message.length <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("75262")) {
        {}
      } else {
        stryCov_9fa48("75262");
        throw new Error(DEBUG_ERROR_MSG.TRACE_MESSAGE_REQUIRED);
      }
    }
    return message;
  }
}

/**
 * @param {Object} scope
 * @param {Object} metadata
 * @param {string} fieldName
 * @param {*} [fallback]
 * @return {*}
 */
function resolveField(scope, metadata, fieldName, fallback = null) {
  if (stryMutAct_9fa48("75263")) {
    {}
  } else {
    stryCov_9fa48("75263");
    if (stryMutAct_9fa48("75266") ? metadata[fieldName] === undefined : stryMutAct_9fa48("75265") ? false : stryMutAct_9fa48("75264") ? true : (stryCov_9fa48("75264", "75265", "75266"), metadata[fieldName] !== undefined)) {
      if (stryMutAct_9fa48("75267")) {
        {}
      } else {
        stryCov_9fa48("75267");
        return metadata[fieldName];
      }
    }
    if (stryMutAct_9fa48("75270") ? scope[fieldName] === undefined : stryMutAct_9fa48("75269") ? false : stryMutAct_9fa48("75268") ? true : (stryCov_9fa48("75268", "75269", "75270"), scope[fieldName] !== undefined)) {
      if (stryMutAct_9fa48("75271")) {
        {}
      } else {
        stryCov_9fa48("75271");
        return scope[fieldName];
      }
    }
    return fallback;
  }
}

/**
 * @param {*} value
 * @return {number|null}
 */
function resolveNullableInt(value) {
  if (stryMutAct_9fa48("75272")) {
    {}
  } else {
    stryCov_9fa48("75272");
    if (stryMutAct_9fa48("75275") ? value === null && value === undefined : stryMutAct_9fa48("75274") ? false : stryMutAct_9fa48("75273") ? true : (stryCov_9fa48("75273", "75274", "75275"), (stryMutAct_9fa48("75277") ? value !== null : stryMutAct_9fa48("75276") ? false : (stryCov_9fa48("75276", "75277"), value === null)) || (stryMutAct_9fa48("75279") ? value !== undefined : stryMutAct_9fa48("75278") ? false : (stryCov_9fa48("75278", "75279"), value === undefined)))) {
      if (stryMutAct_9fa48("75280")) {
        {}
      } else {
        stryCov_9fa48("75280");
        return null;
      }
    }
    const number = Number(value);
    if (stryMutAct_9fa48("75283") ? false : stryMutAct_9fa48("75282") ? true : stryMutAct_9fa48("75281") ? Number.isFinite(number) : (stryCov_9fa48("75281", "75282", "75283"), !Number.isFinite(number))) {
      if (stryMutAct_9fa48("75284")) {
        {}
      } else {
        stryCov_9fa48("75284");
        return null;
      }
    }
    return Math.trunc(number);
  }
}
export { DebugEmitter, buildTraceEvent };