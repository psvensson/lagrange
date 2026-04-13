/**
 * Session-scoped breakpoint manager with source->offset resolution.
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
import { lookupOffsetsForSource } from './dwarf-index-builder.js';
import { BREAKPOINT_MANAGER_DEFAULT as DEF, BREAKPOINT_STEP_ACTION as STEP, BREAKPOINT_MANAGER_ERROR_MSG as ERR } from './breakpoint-manager-constants.js';

/**
 * Manages breakpoints and step control for debug sessions.
 */
class BreakpointManager {
  /**
   * @param {Object} [options]
   * @param {Object} [options.runtimeAdapter] - Runtime adapter.
   * @param {Function} [options.lookupOffsetsForSource] - Source lookup fn.
   * @param {Function} [options.now] - Timestamp provider.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("75668")) {
      {}
    } else {
      stryCov_9fa48("75668");
      this._runtimeAdapter = stryMutAct_9fa48("75671") ? options.runtimeAdapter && null : stryMutAct_9fa48("75670") ? false : stryMutAct_9fa48("75669") ? true : (stryCov_9fa48("75669", "75670", "75671"), options.runtimeAdapter || null);
      this._lookupOffsetsForSource = stryMutAct_9fa48("75674") ? options.lookupOffsetsForSource && lookupOffsetsForSource : stryMutAct_9fa48("75673") ? false : stryMutAct_9fa48("75672") ? true : (stryCov_9fa48("75672", "75673", "75674"), options.lookupOffsetsForSource || lookupOffsetsForSource);
      this._now = stryMutAct_9fa48("75677") ? options.now && (() => Date.now()) : stryMutAct_9fa48("75676") ? false : stryMutAct_9fa48("75675") ? true : (stryCov_9fa48("75675", "75676", "75677"), options.now || (stryMutAct_9fa48("75678") ? () => undefined : (stryCov_9fa48("75678"), () => Date.now())));
      this._sessions = new Map();
    }
  }

  /**
   * Set breakpoints for one session/module/source tuple.
   *
   * Existing breakpoints for the same source file are replaced.
   *
   * @param {Object} request - Set breakpoint request.
   * @param {string} request.sessionId - Debug session id.
   * @param {string} request.moduleRef - Module reference.
   * @param {Object} request.index - Built DWARF index.
   * @param {string} request.sourceFileUrl - Source file URL.
   * @param {Array<Object>} request.breakpoints - Source breakpoints.
   * @return {{breakpoints: Array<Object>}} Resolved breakpoints.
   */
  setBreakpoints(request) {
    if (stryMutAct_9fa48("75679")) {
      {}
    } else {
      stryCov_9fa48("75679");
      validateSetBreakpointsRequest(request);
      const session = this._getOrCreateSession(request.sessionId);
      const moduleStore = this._getOrCreateModuleStore(session, request.moduleRef);
      const records = stryMutAct_9fa48("75680") ? ["Stryker was here"] : (stryCov_9fa48("75680"), []);
      for (const inputBreakpoint of request.breakpoints) {
        if (stryMutAct_9fa48("75681")) {
          {}
        } else {
          stryCov_9fa48("75681");
          if (stryMutAct_9fa48("75684") ? false : stryMutAct_9fa48("75683") ? true : stryMutAct_9fa48("75682") ? isNonNegativeInteger(inputBreakpoint?.lineNumber) : (stryCov_9fa48("75682", "75683", "75684"), !isNonNegativeInteger(stryMutAct_9fa48("75685") ? inputBreakpoint.lineNumber : (stryCov_9fa48("75685"), inputBreakpoint?.lineNumber)))) {
            if (stryMutAct_9fa48("75686")) {
              {}
            } else {
              stryCov_9fa48("75686");
              throw new Error(ERR.LINE_NUMBER_REQUIRED);
            }
          }
          const lineNumber = inputBreakpoint.lineNumber;
          const columnNumber = isNonNegativeInteger(inputBreakpoint.columnNumber) ? inputBreakpoint.columnNumber : DEF.COLUMN_NUMBER;
          let offsetRanges = stryMutAct_9fa48("75687") ? ["Stryker was here"] : (stryCov_9fa48("75687"), []);
          let resolutionError = null;
          try {
            if (stryMutAct_9fa48("75688")) {
              {}
            } else {
              stryCov_9fa48("75688");
              offsetRanges = this._lookupOffsetsForSource(request.index, request.sourceFileUrl, lineNumber);
            }
          } catch (err) {
            if (stryMutAct_9fa48("75689")) {
              {}
            } else {
              stryCov_9fa48("75689");
              resolutionError = stryMutAct_9fa48("75692") ? err.message && String(err) : stryMutAct_9fa48("75691") ? false : stryMutAct_9fa48("75690") ? true : (stryCov_9fa48("75690", "75691", "75692"), err.message || String(err));
            }
          }
          const resolved = stryMutAct_9fa48("75695") ? resolutionError === null && Array.isArray(offsetRanges) || offsetRanges.length > NUM.ZERO : stryMutAct_9fa48("75694") ? false : stryMutAct_9fa48("75693") ? true : (stryCov_9fa48("75693", "75694", "75695"), (stryMutAct_9fa48("75697") ? resolutionError === null || Array.isArray(offsetRanges) : stryMutAct_9fa48("75696") ? true : (stryCov_9fa48("75696", "75697"), (stryMutAct_9fa48("75699") ? resolutionError !== null : stryMutAct_9fa48("75698") ? true : (stryCov_9fa48("75698", "75699"), resolutionError === null)) && Array.isArray(offsetRanges))) && (stryMutAct_9fa48("75702") ? offsetRanges.length <= NUM.ZERO : stryMutAct_9fa48("75701") ? offsetRanges.length >= NUM.ZERO : stryMutAct_9fa48("75700") ? true : (stryCov_9fa48("75700", "75701", "75702"), offsetRanges.length > NUM.ZERO)));
          const record = stryMutAct_9fa48("75703") ? {} : (stryCov_9fa48("75703"), {
            breakpointId: stryMutAct_9fa48("75704") ? session.nextBreakpointId-- : (stryCov_9fa48("75704"), session.nextBreakpointId++),
            sessionId: request.sessionId,
            moduleRef: request.moduleRef,
            sourceFileUrl: request.sourceFileUrl,
            lineNumber,
            columnNumber,
            condition: stryMutAct_9fa48("75707") ? inputBreakpoint.condition && null : stryMutAct_9fa48("75706") ? false : stryMutAct_9fa48("75705") ? true : (stryCov_9fa48("75705", "75706", "75707"), inputBreakpoint.condition || null),
            resolved,
            resolutionError: resolved ? null : stryMutAct_9fa48("75710") ? resolutionError && 'No offsets resolved for source location' : stryMutAct_9fa48("75709") ? false : stryMutAct_9fa48("75708") ? true : (stryCov_9fa48("75708", "75709", "75710"), resolutionError || (stryMutAct_9fa48("75711") ? "" : (stryCov_9fa48("75711"), 'No offsets resolved for source location'))),
            offsetRanges: resolved ? cloneRanges(offsetRanges) : stryMutAct_9fa48("75712") ? ["Stryker was here"] : (stryCov_9fa48("75712"), []),
            createdAt: this._now(),
            hitCount: NUM.ZERO
          });
          records.push(record);
        }
      }
      moduleStore.sourceBreakpoints.set(request.sourceFileUrl, records);
      return stryMutAct_9fa48("75713") ? {} : (stryCov_9fa48("75713"), {
        breakpoints: records.map(stryMutAct_9fa48("75714") ? () => undefined : (stryCov_9fa48("75714"), record => stryMutAct_9fa48("75715") ? {} : (stryCov_9fa48("75715"), {
          ...record
        })))
      });
    }
  }

  /**
   * Get all breakpoints for a session/module pair.
   *
   * @param {Object} request - Lookup request.
   * @param {string} request.sessionId - Debug session id.
   * @param {string} request.moduleRef - Module reference.
   * @return {Array<Object>} Breakpoint records.
   */
  getBreakpoints(request) {
    if (stryMutAct_9fa48("75716")) {
      {}
    } else {
      stryCov_9fa48("75716");
      validateSessionModuleRequest(request);
      const session = this._sessions.get(request.sessionId);
      if (stryMutAct_9fa48("75719") ? false : stryMutAct_9fa48("75718") ? true : stryMutAct_9fa48("75717") ? session : (stryCov_9fa48("75717", "75718", "75719"), !session)) {
        if (stryMutAct_9fa48("75720")) {
          {}
        } else {
          stryCov_9fa48("75720");
          return stryMutAct_9fa48("75721") ? ["Stryker was here"] : (stryCov_9fa48("75721"), []);
        }
      }
      const moduleStore = session.modules.get(request.moduleRef);
      if (stryMutAct_9fa48("75724") ? false : stryMutAct_9fa48("75723") ? true : stryMutAct_9fa48("75722") ? moduleStore : (stryCov_9fa48("75722", "75723", "75724"), !moduleStore)) {
        if (stryMutAct_9fa48("75725")) {
          {}
        } else {
          stryCov_9fa48("75725");
          return stryMutAct_9fa48("75726") ? ["Stryker was here"] : (stryCov_9fa48("75726"), []);
        }
      }
      const breakpoints = stryMutAct_9fa48("75727") ? ["Stryker was here"] : (stryCov_9fa48("75727"), []);
      for (const records of moduleStore.sourceBreakpoints.values()) {
        if (stryMutAct_9fa48("75728")) {
          {}
        } else {
          stryCov_9fa48("75728");
          for (const record of records) {
            if (stryMutAct_9fa48("75729")) {
              {}
            } else {
              stryCov_9fa48("75729");
              breakpoints.push(stryMutAct_9fa48("75730") ? {} : (stryCov_9fa48("75730"), {
                ...record
              }));
            }
          }
        }
      }
      return breakpoints;
    }
  }

  /**
   * Detect breakpoint hits for a module offset.
   *
   * @param {Object} request - Hit detection request.
   * @param {string} request.sessionId - Debug session id.
   * @param {string} request.moduleRef - Module reference.
   * @param {number} request.codeOffset - Current code offset.
   * @return {{hit: boolean, breakpoints: Array<Object>}} Hit result.
   */
  detectBreakpointHit(request) {
    if (stryMutAct_9fa48("75731")) {
      {}
    } else {
      stryCov_9fa48("75731");
      validateHitRequest(request);
      const session = this._sessions.get(request.sessionId);
      if (stryMutAct_9fa48("75734") ? false : stryMutAct_9fa48("75733") ? true : stryMutAct_9fa48("75732") ? session : (stryCov_9fa48("75732", "75733", "75734"), !session)) {
        if (stryMutAct_9fa48("75735")) {
          {}
        } else {
          stryCov_9fa48("75735");
          return stryMutAct_9fa48("75736") ? {} : (stryCov_9fa48("75736"), {
            hit: stryMutAct_9fa48("75737") ? true : (stryCov_9fa48("75737"), false),
            breakpoints: stryMutAct_9fa48("75738") ? ["Stryker was here"] : (stryCov_9fa48("75738"), [])
          });
        }
      }
      const moduleStore = session.modules.get(request.moduleRef);
      if (stryMutAct_9fa48("75741") ? false : stryMutAct_9fa48("75740") ? true : stryMutAct_9fa48("75739") ? moduleStore : (stryCov_9fa48("75739", "75740", "75741"), !moduleStore)) {
        if (stryMutAct_9fa48("75742")) {
          {}
        } else {
          stryCov_9fa48("75742");
          return stryMutAct_9fa48("75743") ? {} : (stryCov_9fa48("75743"), {
            hit: stryMutAct_9fa48("75744") ? true : (stryCov_9fa48("75744"), false),
            breakpoints: stryMutAct_9fa48("75745") ? ["Stryker was here"] : (stryCov_9fa48("75745"), [])
          });
        }
      }
      const hits = stryMutAct_9fa48("75746") ? ["Stryker was here"] : (stryCov_9fa48("75746"), []);
      for (const records of moduleStore.sourceBreakpoints.values()) {
        if (stryMutAct_9fa48("75747")) {
          {}
        } else {
          stryCov_9fa48("75747");
          for (const record of records) {
            if (stryMutAct_9fa48("75748")) {
              {}
            } else {
              stryCov_9fa48("75748");
              if (stryMutAct_9fa48("75751") ? false : stryMutAct_9fa48("75750") ? true : stryMutAct_9fa48("75749") ? record.resolved : (stryCov_9fa48("75749", "75750", "75751"), !record.resolved)) {
                if (stryMutAct_9fa48("75752")) {
                  {}
                } else {
                  stryCov_9fa48("75752");
                  continue;
                }
              }
              if (stryMutAct_9fa48("75755") ? false : stryMutAct_9fa48("75754") ? true : stryMutAct_9fa48("75753") ? rangeListContainsOffset(record.offsetRanges, request.codeOffset) : (stryCov_9fa48("75753", "75754", "75755"), !rangeListContainsOffset(record.offsetRanges, request.codeOffset))) {
                if (stryMutAct_9fa48("75756")) {
                  {}
                } else {
                  stryCov_9fa48("75756");
                  continue;
                }
              }
              stryMutAct_9fa48("75757") ? record.hitCount -= 1 : (stryCov_9fa48("75757"), record.hitCount += 1);
              hits.push(stryMutAct_9fa48("75758") ? {} : (stryCov_9fa48("75758"), {
                ...record
              }));
            }
          }
        }
      }
      return stryMutAct_9fa48("75759") ? {} : (stryCov_9fa48("75759"), {
        hit: stryMutAct_9fa48("75763") ? hits.length <= NUM.ZERO : stryMutAct_9fa48("75762") ? hits.length >= NUM.ZERO : stryMutAct_9fa48("75761") ? false : stryMutAct_9fa48("75760") ? true : (stryCov_9fa48("75760", "75761", "75762", "75763"), hits.length > NUM.ZERO),
        breakpoints: hits
      });
    }
  }

  /**
   * Resolve pause reason from pending step action + breakpoint hits.
   *
   * @param {Object} request - Pause event request.
   * @param {string} request.sessionId - Debug session id.
   * @param {string} request.moduleRef - Module reference.
   * @param {number} request.codeOffset - Current code offset.
   * @return {{reason: string, hitBreakpoints: Array<Object>, stepAction: string|null}}
   */
  handlePause(request) {
    if (stryMutAct_9fa48("75764")) {
      {}
    } else {
      stryCov_9fa48("75764");
      const hitResult = this.detectBreakpointHit(request);
      const pendingStepAction = this.consumePendingStepAction(stryMutAct_9fa48("75765") ? {} : (stryCov_9fa48("75765"), {
        sessionId: request.sessionId
      }));
      const pauseReason = hitResult.hit ? stryMutAct_9fa48("75766") ? "" : (stryCov_9fa48("75766"), 'breakpoint') : pendingStepAction ? stryMutAct_9fa48("75767") ? "" : (stryCov_9fa48("75767"), 'step') : stryMutAct_9fa48("75768") ? "" : (stryCov_9fa48("75768"), 'pause');
      return stryMutAct_9fa48("75769") ? {} : (stryCov_9fa48("75769"), {
        reason: pauseReason,
        hitBreakpoints: (stryMutAct_9fa48("75772") ? pauseReason !== 'breakpoint' : stryMutAct_9fa48("75771") ? false : stryMutAct_9fa48("75770") ? true : (stryCov_9fa48("75770", "75771", "75772"), pauseReason === (stryMutAct_9fa48("75773") ? "" : (stryCov_9fa48("75773"), 'breakpoint')))) ? hitResult.breakpoints : stryMutAct_9fa48("75774") ? ["Stryker was here"] : (stryCov_9fa48("75774"), []),
        stepAction: (stryMutAct_9fa48("75777") ? pauseReason !== 'pause' : stryMutAct_9fa48("75776") ? false : stryMutAct_9fa48("75775") ? true : (stryCov_9fa48("75775", "75776", "75777"), pauseReason === (stryMutAct_9fa48("75778") ? "" : (stryCov_9fa48("75778"), 'pause')))) ? null : pendingStepAction
      });
    }
  }

  /**
   * Continue execution.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async continueExecution(request) {
    if (stryMutAct_9fa48("75779")) {
      {}
    } else {
      stryCov_9fa48("75779");
      return await this._resumeWithStepAction(request, STEP.CONTINUE);
    }
  }

  /**
   * Step over (next).
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async next(request) {
    if (stryMutAct_9fa48("75780")) {
      {}
    } else {
      stryCov_9fa48("75780");
      return await this._resumeWithStepAction(request, STEP.NEXT);
    }
  }

  /**
   * Step into.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async stepIn(request) {
    if (stryMutAct_9fa48("75781")) {
      {}
    } else {
      stryCov_9fa48("75781");
      return await this._resumeWithStepAction(request, STEP.STEP_IN);
    }
  }

  /**
   * Step out.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async stepOut(request) {
    if (stryMutAct_9fa48("75782")) {
      {}
    } else {
      stryCov_9fa48("75782");
      return await this._resumeWithStepAction(request, STEP.STEP_OUT);
    }
  }

  /**
   * Read pending step action without consuming it.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {string|null}
   */
  getPendingStepAction(request) {
    if (stryMutAct_9fa48("75783")) {
      {}
    } else {
      stryCov_9fa48("75783");
      validateSessionRequest(request);
      const session = this._sessions.get(request.sessionId);
      return session ? session.pendingStepAction : null;
    }
  }

  /**
   * Consume pending step action.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {string|null}
   */
  consumePendingStepAction(request) {
    if (stryMutAct_9fa48("75784")) {
      {}
    } else {
      stryCov_9fa48("75784");
      validateSessionRequest(request);
      const session = this._sessions.get(request.sessionId);
      if (stryMutAct_9fa48("75787") ? false : stryMutAct_9fa48("75786") ? true : stryMutAct_9fa48("75785") ? session : (stryCov_9fa48("75785", "75786", "75787"), !session)) {
        if (stryMutAct_9fa48("75788")) {
          {}
        } else {
          stryCov_9fa48("75788");
          return null;
        }
      }
      const stepAction = session.pendingStepAction;
      session.pendingStepAction = null;
      return stepAction;
    }
  }

  /**
   * Remove all state for a session.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {boolean}
   */
  clearSession(request) {
    if (stryMutAct_9fa48("75789")) {
      {}
    } else {
      stryCov_9fa48("75789");
      validateSessionRequest(request);
      return this._sessions.delete(request.sessionId);
    }
  }

  /**
   * Internal helper for continue/step actions.
   *
   * @param {Object} request - Step request.
   * @param {string} stepAction - Step action constant.
   * @return {Promise<Object>} Resume result payload.
   * @private
   */
  async _resumeWithStepAction(request, stepAction) {
    if (stryMutAct_9fa48("75790")) {
      {}
    } else {
      stryCov_9fa48("75790");
      validateStepRequest(request);
      if (stryMutAct_9fa48("75793") ? !this._runtimeAdapter && typeof this._runtimeAdapter.resume !== TYPEOF.FUNCTION : stryMutAct_9fa48("75792") ? false : stryMutAct_9fa48("75791") ? true : (stryCov_9fa48("75791", "75792", "75793"), (stryMutAct_9fa48("75794") ? this._runtimeAdapter : (stryCov_9fa48("75794"), !this._runtimeAdapter)) || (stryMutAct_9fa48("75796") ? typeof this._runtimeAdapter.resume === TYPEOF.FUNCTION : stryMutAct_9fa48("75795") ? false : (stryCov_9fa48("75795", "75796"), typeof this._runtimeAdapter.resume !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("75797")) {
          {}
        } else {
          stryCov_9fa48("75797");
          throw new Error(ERR.RUNTIME_ADAPTER_REQUIRED);
        }
      }
      const session = this._getOrCreateSession(request.sessionId);
      session.pendingStepAction = (stryMutAct_9fa48("75800") ? stepAction !== STEP.CONTINUE : stryMutAct_9fa48("75799") ? false : stryMutAct_9fa48("75798") ? true : (stryCov_9fa48("75798", "75799", "75800"), stepAction === STEP.CONTINUE)) ? null : stepAction;
      const resumeResult = await this._runtimeAdapter.resume(stryMutAct_9fa48("75801") ? {} : (stryCov_9fa48("75801"), {
        instanceHandle: request.instanceHandle
      }));
      return stryMutAct_9fa48("75802") ? {} : (stryCov_9fa48("75802"), {
        sessionId: request.sessionId,
        action: stepAction,
        status: stryMutAct_9fa48("75805") ? resumeResult?.status && 'running' : stryMutAct_9fa48("75804") ? false : stryMutAct_9fa48("75803") ? true : (stryCov_9fa48("75803", "75804", "75805"), (stryMutAct_9fa48("75806") ? resumeResult.status : (stryCov_9fa48("75806"), resumeResult?.status)) || (stryMutAct_9fa48("75807") ? "" : (stryCov_9fa48("75807"), 'running'))),
        instanceHandle: request.instanceHandle
      });
    }
  }

  /**
   * @param {string} sessionId
   * @return {Object}
   * @private
   */
  _getOrCreateSession(sessionId) {
    if (stryMutAct_9fa48("75808")) {
      {}
    } else {
      stryCov_9fa48("75808");
      let session = this._sessions.get(sessionId);
      if (stryMutAct_9fa48("75810") ? false : stryMutAct_9fa48("75809") ? true : (stryCov_9fa48("75809", "75810"), session)) {
        if (stryMutAct_9fa48("75811")) {
          {}
        } else {
          stryCov_9fa48("75811");
          return session;
        }
      }
      session = stryMutAct_9fa48("75812") ? {} : (stryCov_9fa48("75812"), {
        sessionId,
        createdAt: this._now(),
        nextBreakpointId: NUM.ONE,
        pendingStepAction: null,
        modules: new Map()
      });
      this._sessions.set(sessionId, session);
      return session;
    }
  }

  /**
   * @param {Object} session
   * @param {string} moduleRef
   * @return {Object}
   * @private
   */
  _getOrCreateModuleStore(session, moduleRef) {
    if (stryMutAct_9fa48("75813")) {
      {}
    } else {
      stryCov_9fa48("75813");
      let moduleStore = session.modules.get(moduleRef);
      if (stryMutAct_9fa48("75815") ? false : stryMutAct_9fa48("75814") ? true : (stryCov_9fa48("75814", "75815"), moduleStore)) {
        if (stryMutAct_9fa48("75816")) {
          {}
        } else {
          stryCov_9fa48("75816");
          return moduleStore;
        }
      }
      moduleStore = stryMutAct_9fa48("75817") ? {} : (stryCov_9fa48("75817"), {
        moduleRef,
        sourceBreakpoints: new Map()
      });
      session.modules.set(moduleRef, moduleStore);
      return moduleStore;
    }
  }
}

/**
 * @param {Object} request
 */
function validateSetBreakpointsRequest(request) {
  if (stryMutAct_9fa48("75818")) {
    {}
  } else {
    stryCov_9fa48("75818");
    validateSessionModuleRequest(request);
    if (stryMutAct_9fa48("75821") ? !request.index && typeof request.index !== TYPEOF.OBJECT : stryMutAct_9fa48("75820") ? false : stryMutAct_9fa48("75819") ? true : (stryCov_9fa48("75819", "75820", "75821"), (stryMutAct_9fa48("75822") ? request.index : (stryCov_9fa48("75822"), !request.index)) || (stryMutAct_9fa48("75824") ? typeof request.index === TYPEOF.OBJECT : stryMutAct_9fa48("75823") ? false : (stryCov_9fa48("75823", "75824"), typeof request.index !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75825")) {
        {}
      } else {
        stryCov_9fa48("75825");
        throw new Error(ERR.INDEX_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("75828") ? false : stryMutAct_9fa48("75827") ? true : stryMutAct_9fa48("75826") ? isNonEmptyString(request.sourceFileUrl) : (stryCov_9fa48("75826", "75827", "75828"), !isNonEmptyString(request.sourceFileUrl))) {
      if (stryMutAct_9fa48("75829")) {
        {}
      } else {
        stryCov_9fa48("75829");
        throw new Error(ERR.SOURCE_FILE_URL_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("75832") ? false : stryMutAct_9fa48("75831") ? true : stryMutAct_9fa48("75830") ? Array.isArray(request.breakpoints) : (stryCov_9fa48("75830", "75831", "75832"), !Array.isArray(request.breakpoints))) {
      if (stryMutAct_9fa48("75833")) {
        {}
      } else {
        stryCov_9fa48("75833");
        throw new Error(ERR.BREAKPOINTS_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateHitRequest(request) {
  if (stryMutAct_9fa48("75834")) {
    {}
  } else {
    stryCov_9fa48("75834");
    validateSessionModuleRequest(request);
    if (stryMutAct_9fa48("75837") ? false : stryMutAct_9fa48("75836") ? true : stryMutAct_9fa48("75835") ? isNonNegativeInteger(request.codeOffset) : (stryCov_9fa48("75835", "75836", "75837"), !isNonNegativeInteger(request.codeOffset))) {
      if (stryMutAct_9fa48("75838")) {
        {}
      } else {
        stryCov_9fa48("75838");
        throw new Error(ERR.CODE_OFFSET_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateStepRequest(request) {
  if (stryMutAct_9fa48("75839")) {
    {}
  } else {
    stryCov_9fa48("75839");
    validateSessionRequest(request);
    if (stryMutAct_9fa48("75842") ? !request.instanceHandle && typeof request.instanceHandle !== TYPEOF.OBJECT : stryMutAct_9fa48("75841") ? false : stryMutAct_9fa48("75840") ? true : (stryCov_9fa48("75840", "75841", "75842"), (stryMutAct_9fa48("75843") ? request.instanceHandle : (stryCov_9fa48("75843"), !request.instanceHandle)) || (stryMutAct_9fa48("75845") ? typeof request.instanceHandle === TYPEOF.OBJECT : stryMutAct_9fa48("75844") ? false : (stryCov_9fa48("75844", "75845"), typeof request.instanceHandle !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75846")) {
        {}
      } else {
        stryCov_9fa48("75846");
        throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateSessionModuleRequest(request) {
  if (stryMutAct_9fa48("75847")) {
    {}
  } else {
    stryCov_9fa48("75847");
    validateSessionRequest(request);
    if (stryMutAct_9fa48("75850") ? false : stryMutAct_9fa48("75849") ? true : stryMutAct_9fa48("75848") ? isNonEmptyString(request.moduleRef) : (stryCov_9fa48("75848", "75849", "75850"), !isNonEmptyString(request.moduleRef))) {
      if (stryMutAct_9fa48("75851")) {
        {}
      } else {
        stryCov_9fa48("75851");
        throw new Error(ERR.MODULE_REF_REQUIRED);
      }
    }
  }
}

/**
 * @param {Object} request
 */
function validateSessionRequest(request) {
  if (stryMutAct_9fa48("75852")) {
    {}
  } else {
    stryCov_9fa48("75852");
    if (stryMutAct_9fa48("75855") ? !request && typeof request !== TYPEOF.OBJECT : stryMutAct_9fa48("75854") ? false : stryMutAct_9fa48("75853") ? true : (stryCov_9fa48("75853", "75854", "75855"), (stryMutAct_9fa48("75856") ? request : (stryCov_9fa48("75856"), !request)) || (stryMutAct_9fa48("75858") ? typeof request === TYPEOF.OBJECT : stryMutAct_9fa48("75857") ? false : (stryCov_9fa48("75857", "75858"), typeof request !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("75859")) {
        {}
      } else {
        stryCov_9fa48("75859");
        throw new Error(ERR.REQUEST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("75862") ? false : stryMutAct_9fa48("75861") ? true : stryMutAct_9fa48("75860") ? isNonEmptyString(request.sessionId) : (stryCov_9fa48("75860", "75861", "75862"), !isNonEmptyString(request.sessionId))) {
      if (stryMutAct_9fa48("75863")) {
        {}
      } else {
        stryCov_9fa48("75863");
        throw new Error(ERR.SESSION_ID_REQUIRED);
      }
    }
  }
}

/**
 * @param {Array<Object>} ranges
 * @return {Array<Object>}
 */
function cloneRanges(ranges) {
  if (stryMutAct_9fa48("75864")) {
    {}
  } else {
    stryCov_9fa48("75864");
    return ranges.map(stryMutAct_9fa48("75865") ? () => undefined : (stryCov_9fa48("75865"), range => stryMutAct_9fa48("75866") ? {} : (stryCov_9fa48("75866"), {
      sourceFileUrl: range.sourceFileUrl,
      lineNumber: range.lineNumber,
      columnNumber: range.columnNumber,
      startOffset: range.startOffset,
      endOffset: range.endOffset
    })));
  }
}

/**
 * @param {Array<Object>} ranges
 * @param {number} codeOffset
 * @return {boolean}
 */
function rangeListContainsOffset(ranges, codeOffset) {
  if (stryMutAct_9fa48("75867")) {
    {}
  } else {
    stryCov_9fa48("75867");
    for (const range of ranges) {
      if (stryMutAct_9fa48("75868")) {
        {}
      } else {
        stryCov_9fa48("75868");
        if (stryMutAct_9fa48("75871") ? codeOffset >= range.startOffset || codeOffset <= range.endOffset : stryMutAct_9fa48("75870") ? false : stryMutAct_9fa48("75869") ? true : (stryCov_9fa48("75869", "75870", "75871"), (stryMutAct_9fa48("75874") ? codeOffset < range.startOffset : stryMutAct_9fa48("75873") ? codeOffset > range.startOffset : stryMutAct_9fa48("75872") ? true : (stryCov_9fa48("75872", "75873", "75874"), codeOffset >= range.startOffset)) && (stryMutAct_9fa48("75877") ? codeOffset > range.endOffset : stryMutAct_9fa48("75876") ? codeOffset < range.endOffset : stryMutAct_9fa48("75875") ? true : (stryCov_9fa48("75875", "75876", "75877"), codeOffset <= range.endOffset)))) {
          if (stryMutAct_9fa48("75878")) {
            {}
          } else {
            stryCov_9fa48("75878");
            return stryMutAct_9fa48("75879") ? false : (stryCov_9fa48("75879"), true);
          }
        }
      }
    }
    return stryMutAct_9fa48("75880") ? true : (stryCov_9fa48("75880"), false);
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("75881")) {
    {}
  } else {
    stryCov_9fa48("75881");
    return stryMutAct_9fa48("75884") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("75883") ? false : stryMutAct_9fa48("75882") ? true : (stryCov_9fa48("75882", "75883", "75884"), (stryMutAct_9fa48("75886") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("75885") ? true : (stryCov_9fa48("75885", "75886"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("75889") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("75888") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("75887") ? true : (stryCov_9fa48("75887", "75888", "75889"), (stryMutAct_9fa48("75890") ? value.length : (stryCov_9fa48("75890"), value.trim().length)) > NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("75891")) {
    {}
  } else {
    stryCov_9fa48("75891");
    return stryMutAct_9fa48("75894") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("75893") ? false : stryMutAct_9fa48("75892") ? true : (stryCov_9fa48("75892", "75893", "75894"), Number.isInteger(value) && (stryMutAct_9fa48("75897") ? value < NUM.ZERO : stryMutAct_9fa48("75896") ? value > NUM.ZERO : stryMutAct_9fa48("75895") ? true : (stryCov_9fa48("75895", "75896", "75897"), value >= NUM.ZERO)));
  }
}
export { BreakpointManager };