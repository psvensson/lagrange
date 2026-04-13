/**
 * Session-scoped breakpoint manager with source->offset resolution.
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  lookupOffsetsForSource,
} from './dwarf-index-builder.js';
import {
  BREAKPOINT_MANAGER_DEFAULT as DEF,
  BREAKPOINT_STEP_ACTION as STEP,
  BREAKPOINT_MANAGER_ERROR_MSG as ERR,
} from './breakpoint-manager-constants.js';

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
    this._runtimeAdapter = options.runtimeAdapter || null;
    this._lookupOffsetsForSource =
      options.lookupOffsetsForSource || lookupOffsetsForSource;
    this._now = options.now || (() => Date.now());
    this._sessions = new Map();
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
    validateSetBreakpointsRequest(request);
    const session = this._getOrCreateSession(request.sessionId);
    const moduleStore = this._getOrCreateModuleStore(
      session,
      request.moduleRef,
    );

    const records = [];
    for (const inputBreakpoint of request.breakpoints) {
      if (!isNonNegativeInteger(inputBreakpoint?.lineNumber)) {
        throw new Error(ERR.LINE_NUMBER_REQUIRED);
      }

      const lineNumber = inputBreakpoint.lineNumber;
      const columnNumber = isNonNegativeInteger(
        inputBreakpoint.columnNumber,
      ) ?
        inputBreakpoint.columnNumber :
        DEF.COLUMN_NUMBER;

      let offsetRanges = [];
      let resolutionError = null;
      try {
        offsetRanges = this._lookupOffsetsForSource(
          request.index,
          request.sourceFileUrl,
          lineNumber,
        );
      } catch (err) {
        resolutionError = err.message || String(err);
      }

      const resolved = resolutionError === null &&
        Array.isArray(offsetRanges) &&
        offsetRanges.length > NUM.ZERO;

      const record = {
        breakpointId: session.nextBreakpointId++,
        sessionId: request.sessionId,
        moduleRef: request.moduleRef,
        sourceFileUrl: request.sourceFileUrl,
        lineNumber,
        columnNumber,
        condition: inputBreakpoint.condition || null,
        resolved,
        resolutionError: resolved ? null : (
          resolutionError || 'No offsets resolved for source location'
        ),
        offsetRanges: resolved ? cloneRanges(offsetRanges) : [],
        createdAt: this._now(),
        hitCount: NUM.ZERO,
      };

      records.push(record);
    }

    moduleStore.sourceBreakpoints.set(
      request.sourceFileUrl,
      records,
    );

    return {
      breakpoints: records.map((record) => ({...record})),
    };
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
    validateSessionModuleRequest(request);
    const session = this._sessions.get(request.sessionId);
    if (!session) {
      return [];
    }
    const moduleStore = session.modules.get(request.moduleRef);
    if (!moduleStore) {
      return [];
    }

    const breakpoints = [];
    for (const records of moduleStore.sourceBreakpoints.values()) {
      for (const record of records) {
        breakpoints.push({...record});
      }
    }
    return breakpoints;
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
    validateHitRequest(request);
    const session = this._sessions.get(request.sessionId);
    if (!session) {
      return {hit: false, breakpoints: []};
    }

    const moduleStore = session.modules.get(request.moduleRef);
    if (!moduleStore) {
      return {hit: false, breakpoints: []};
    }

    const hits = [];
    for (const records of moduleStore.sourceBreakpoints.values()) {
      for (const record of records) {
        if (!record.resolved) {
          continue;
        }
        if (!rangeListContainsOffset(
          record.offsetRanges,
          request.codeOffset,
        )) {
          continue;
        }

        record.hitCount += 1;
        hits.push({...record});
      }
    }

    return {
      hit: hits.length > NUM.ZERO,
      breakpoints: hits,
    };
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
    const hitResult = this.detectBreakpointHit(request);
    const pendingStepAction = this.consumePendingStepAction({
      sessionId: request.sessionId,
    });
    const pauseReason = hitResult.hit ?
      'breakpoint' :
      pendingStepAction ?
        'step' :
        'pause';

    return {
      reason: pauseReason,
      hitBreakpoints: pauseReason === 'breakpoint' ?
        hitResult.breakpoints :
        [],
      stepAction: pauseReason === 'pause' ? null : pendingStepAction,
    };
  }

  /**
   * Continue execution.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async continueExecution(request) {
    return await this._resumeWithStepAction(
      request,
      STEP.CONTINUE,
    );
  }

  /**
   * Step over (next).
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async next(request) {
    return await this._resumeWithStepAction(request, STEP.NEXT);
  }

  /**
   * Step into.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async stepIn(request) {
    return await this._resumeWithStepAction(
      request,
      STEP.STEP_IN,
    );
  }

  /**
   * Step out.
   *
   * @param {Object} request
   * @return {Promise<Object>}
   */
  async stepOut(request) {
    return await this._resumeWithStepAction(
      request,
      STEP.STEP_OUT,
    );
  }

  /**
   * Read pending step action without consuming it.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {string|null}
   */
  getPendingStepAction(request) {
    validateSessionRequest(request);
    const session = this._sessions.get(request.sessionId);
    return session ? session.pendingStepAction : null;
  }

  /**
   * Consume pending step action.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {string|null}
   */
  consumePendingStepAction(request) {
    validateSessionRequest(request);
    const session = this._sessions.get(request.sessionId);
    if (!session) {
      return null;
    }
    const stepAction = session.pendingStepAction;
    session.pendingStepAction = null;
    return stepAction;
  }

  /**
   * Remove all state for a session.
   *
   * @param {Object} request
   * @param {string} request.sessionId
   * @return {boolean}
   */
  clearSession(request) {
    validateSessionRequest(request);
    return this._sessions.delete(request.sessionId);
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
    validateStepRequest(request);
    if (!this._runtimeAdapter ||
      typeof this._runtimeAdapter.resume !== TYPEOF.FUNCTION) {
      throw new Error(ERR.RUNTIME_ADAPTER_REQUIRED);
    }

    const session = this._getOrCreateSession(request.sessionId);
    session.pendingStepAction = stepAction === STEP.CONTINUE ?
      null :
      stepAction;

    const resumeResult = await this._runtimeAdapter.resume({
      instanceHandle: request.instanceHandle,
    });

    return {
      sessionId: request.sessionId,
      action: stepAction,
      status: resumeResult?.status || 'running',
      instanceHandle: request.instanceHandle,
    };
  }

  /**
   * @param {string} sessionId
   * @return {Object}
   * @private
   */
  _getOrCreateSession(sessionId) {
    let session = this._sessions.get(sessionId);
    if (session) {
      return session;
    }

    session = {
      sessionId,
      createdAt: this._now(),
      nextBreakpointId: NUM.ONE,
      pendingStepAction: null,
      modules: new Map(),
    };
    this._sessions.set(sessionId, session);
    return session;
  }

  /**
   * @param {Object} session
   * @param {string} moduleRef
   * @return {Object}
   * @private
   */
  _getOrCreateModuleStore(session, moduleRef) {
    let moduleStore = session.modules.get(moduleRef);
    if (moduleStore) {
      return moduleStore;
    }

    moduleStore = {
      moduleRef,
      sourceBreakpoints: new Map(),
    };
    session.modules.set(moduleRef, moduleStore);
    return moduleStore;
  }
}

/**
 * @param {Object} request
 */
function validateSetBreakpointsRequest(request) {
  validateSessionModuleRequest(request);
  if (!request.index || typeof request.index !== TYPEOF.OBJECT) {
    throw new Error(ERR.INDEX_REQUIRED);
  }
  if (!isNonEmptyString(request.sourceFileUrl)) {
    throw new Error(ERR.SOURCE_FILE_URL_REQUIRED);
  }
  if (!Array.isArray(request.breakpoints)) {
    throw new Error(ERR.BREAKPOINTS_REQUIRED);
  }
}

/**
 * @param {Object} request
 */
function validateHitRequest(request) {
  validateSessionModuleRequest(request);
  if (!isNonNegativeInteger(request.codeOffset)) {
    throw new Error(ERR.CODE_OFFSET_REQUIRED);
  }
}

/**
 * @param {Object} request
 */
function validateStepRequest(request) {
  validateSessionRequest(request);
  if (!request.instanceHandle ||
    typeof request.instanceHandle !== TYPEOF.OBJECT) {
    throw new Error(ERR.INSTANCE_HANDLE_REQUIRED);
  }
}

/**
 * @param {Object} request
 */
function validateSessionModuleRequest(request) {
  validateSessionRequest(request);
  if (!isNonEmptyString(request.moduleRef)) {
    throw new Error(ERR.MODULE_REF_REQUIRED);
  }
}

/**
 * @param {Object} request
 */
function validateSessionRequest(request) {
  if (!request || typeof request !== TYPEOF.OBJECT) {
    throw new Error(ERR.REQUEST_REQUIRED);
  }
  if (!isNonEmptyString(request.sessionId)) {
    throw new Error(ERR.SESSION_ID_REQUIRED);
  }
}

/**
 * @param {Array<Object>} ranges
 * @return {Array<Object>}
 */
function cloneRanges(ranges) {
  return ranges.map((range) => ({
    sourceFileUrl: range.sourceFileUrl,
    lineNumber: range.lineNumber,
    columnNumber: range.columnNumber,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
  }));
}

/**
 * @param {Array<Object>} ranges
 * @param {number} codeOffset
 * @return {boolean}
 */
function rangeListContainsOffset(ranges, codeOffset) {
  for (const range of ranges) {
    if (codeOffset >= range.startOffset &&
      codeOffset <= range.endOffset) {
      return true;
    }
  }
  return false;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === TYPEOF.STRING &&
    value.trim().length > NUM.ZERO;
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= NUM.ZERO;
}

export {
  BreakpointManager,
};
