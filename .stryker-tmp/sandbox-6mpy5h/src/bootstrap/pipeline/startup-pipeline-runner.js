/**
 * Shared startup pipeline runner for seed bootstrap and node join.
 *
 * Cleanup is NOT managed by this runner. Cleanup ownership belongs to
 * dedicated handler modules (SeedCleanupHandler, JoinCleanupHandler)
 * that are invoked by the orchestrator's error handling path. This
 * ensures exactly one active cleanup execution path per flow (D3.2).
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
const STARTUP_PIPELINE_EVENT = Object.freeze(stryMutAct_9fa48("27646") ? {} : (stryCov_9fa48("27646"), {
  PHASE_START: stryMutAct_9fa48("27647") ? "" : (stryCov_9fa48("27647"), 'phaseStart'),
  PHASE_COMPLETE: stryMutAct_9fa48("27648") ? "" : (stryCov_9fa48("27648"), 'phaseComplete'),
  PHASE_FAILED: stryMutAct_9fa48("27649") ? "" : (stryCov_9fa48("27649"), 'phaseFailed')
}));
class StartupPipelineRunner {
  /**
   * @param {Object} options
   * @param {Object} [options.logger]
   * @param {Object} [options.eventSink] - Optional EventEmitter-like sink.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("27650")) {
      {}
    } else {
      stryCov_9fa48("27650");
      this.logger = stryMutAct_9fa48("27653") ? options.logger && console : stryMutAct_9fa48("27652") ? false : stryMutAct_9fa48("27651") ? true : (stryCov_9fa48("27651", "27652", "27653"), options.logger || console);
      this.eventSink = stryMutAct_9fa48("27656") ? options.eventSink && null : stryMutAct_9fa48("27655") ? false : stryMutAct_9fa48("27654") ? true : (stryCov_9fa48("27654", "27655", "27656"), options.eventSink || null);
    }
  }

  /**
   * Run ordered startup phases. On failure the error propagates to
   * the caller which owns cleanup orchestration through the
   * canonical handler (SeedCleanupHandler / JoinCleanupHandler).
   * @param {Object} options
   * @param {Array<{name: string, run: Function}>} options.phases
   * @return {Promise<{completedPhases: string[]}>}
   */
  async run(options = {}) {
    if (stryMutAct_9fa48("27657")) {
      {}
    } else {
      stryCov_9fa48("27657");
      const phases = Array.isArray(options.phases) ? options.phases : stryMutAct_9fa48("27658") ? ["Stryker was here"] : (stryCov_9fa48("27658"), []);
      const completedPhases = stryMutAct_9fa48("27659") ? ["Stryker was here"] : (stryCov_9fa48("27659"), []);
      for (const phase of phases) {
        if (stryMutAct_9fa48("27660")) {
          {}
        } else {
          stryCov_9fa48("27660");
          this.emit(STARTUP_PIPELINE_EVENT.PHASE_START, stryMutAct_9fa48("27661") ? {} : (stryCov_9fa48("27661"), {
            phase: phase.name
          }));
          try {
            if (stryMutAct_9fa48("27662")) {
              {}
            } else {
              stryCov_9fa48("27662");
              await phase.run();
              completedPhases.push(phase.name);
              this.emit(STARTUP_PIPELINE_EVENT.PHASE_COMPLETE, stryMutAct_9fa48("27663") ? {} : (stryCov_9fa48("27663"), {
                phase: phase.name
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("27664")) {
              {}
            } else {
              stryCov_9fa48("27664");
              this.emit(STARTUP_PIPELINE_EVENT.PHASE_FAILED, stryMutAct_9fa48("27665") ? {} : (stryCov_9fa48("27665"), {
                phase: phase.name,
                error: error.message
              }));
              throw error;
            }
          }
        }
      }
      return stryMutAct_9fa48("27666") ? {} : (stryCov_9fa48("27666"), {
        completedPhases
      });
    }
  }

  /**
   * Emit pipeline event on event sink when available.
   * @param {string} eventName
   * @param {Object} payload
   */
  emit(eventName, payload) {
    if (stryMutAct_9fa48("27667")) {
      {}
    } else {
      stryCov_9fa48("27667");
      if (stryMutAct_9fa48("27670") ? !this.eventSink && typeof this.eventSink.emit !== 'function' : stryMutAct_9fa48("27669") ? false : stryMutAct_9fa48("27668") ? true : (stryCov_9fa48("27668", "27669", "27670"), (stryMutAct_9fa48("27671") ? this.eventSink : (stryCov_9fa48("27671"), !this.eventSink)) || (stryMutAct_9fa48("27673") ? typeof this.eventSink.emit === 'function' : stryMutAct_9fa48("27672") ? false : (stryCov_9fa48("27672", "27673"), typeof this.eventSink.emit !== (stryMutAct_9fa48("27674") ? "" : (stryCov_9fa48("27674"), 'function')))))) {
        if (stryMutAct_9fa48("27675")) {
          {}
        } else {
          stryCov_9fa48("27675");
          return;
        }
      }
      this.eventSink.emit(stryMutAct_9fa48("27676") ? `` : (stryCov_9fa48("27676"), `pipeline:${eventName}`), payload);
    }
  }
}
export { StartupPipelineRunner, STARTUP_PIPELINE_EVENT };