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
import { NUM } from '../constants/index.js';
const JOIN_CHECKPOINT = Object.freeze(stryMutAct_9fa48("15205") ? {} : (stryCov_9fa48("15205"), {
  SESSION_CREATED: stryMutAct_9fa48("15206") ? "" : (stryCov_9fa48("15206"), 'SESSION_CREATED'),
  SEED_CONTACTED: stryMutAct_9fa48("15207") ? "" : (stryCov_9fa48("15207"), 'SEED_CONTACTED'),
  JOIN_INFRASTRUCTURE_READY: stryMutAct_9fa48("15208") ? "" : (stryCov_9fa48("15208"), 'JOIN_INFRASTRUCTURE_READY'),
  MEMBERSHIP_WRITTEN: stryMutAct_9fa48("15209") ? "" : (stryCov_9fa48("15209"), 'MEMBERSHIP_WRITTEN'),
  READY_LEASE_ASSIGNED: stryMutAct_9fa48("15210") ? "" : (stryCov_9fa48("15210"), 'READY_LEASE_ASSIGNED'),
  FINALIZED: stryMutAct_9fa48("15211") ? "" : (stryCov_9fa48("15211"), 'FINALIZED')
}));
const JOIN_CHECKPOINT_SEQUENCE = Object.freeze(stryMutAct_9fa48("15212") ? [] : (stryCov_9fa48("15212"), [JOIN_CHECKPOINT.SESSION_CREATED, JOIN_CHECKPOINT.SEED_CONTACTED, JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY, JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN, JOIN_CHECKPOINT.READY_LEASE_ASSIGNED, JOIN_CHECKPOINT.FINALIZED]));
const JOIN_CHECKPOINT_INDEX = Object.freeze(JOIN_CHECKPOINT_SEQUENCE.reduce((accumulator, checkpoint, index) => {
  if (stryMutAct_9fa48("15213")) {
    {}
  } else {
    stryCov_9fa48("15213");
    accumulator[checkpoint] = index;
    return accumulator;
  }
}, {}));
const JOIN_SESSION_DEFAULT = Object.freeze(stryMutAct_9fa48("15214") ? {} : (stryCov_9fa48("15214"), {
  PHASE: stryMutAct_9fa48("15215") ? "" : (stryCov_9fa48("15215"), 'session_created'),
  RETRY_AFTER_MS: 0
}));
const JOIN_SESSION_ERROR = Object.freeze(stryMutAct_9fa48("15216") ? {} : (stryCov_9fa48("15216"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("15217") ? "" : (stryCov_9fa48("15217"), 'nodeId is required'),
  SESSION_ID_REQUIRED: stryMutAct_9fa48("15218") ? "" : (stryCov_9fa48("15218"), 'sessionId is required'),
  INVALID_CHECKPOINT: stryMutAct_9fa48("15219") ? "" : (stryCov_9fa48("15219"), 'invalid join checkpoint'),
  CHECKPOINT_REGRESSION: stryMutAct_9fa48("15220") ? "" : (stryCov_9fa48("15220"), 'checkpoint regression')
}));

/**
 * Durable join-session store keyed by nodeId + sessionId.
 */
class JoinSessionStore {
  constructor(options = {}) {
    if (stryMutAct_9fa48("15221")) {
      {}
    } else {
      stryCov_9fa48("15221");
      this._storage = options.storage instanceof Map ? options.storage : new Map();
      this._now = (stryMutAct_9fa48("15224") ? typeof options.now !== 'function' : stryMutAct_9fa48("15223") ? false : stryMutAct_9fa48("15222") ? true : (stryCov_9fa48("15222", "15223", "15224"), typeof options.now === (stryMutAct_9fa48("15225") ? "" : (stryCov_9fa48("15225"), 'function')))) ? options.now : stryMutAct_9fa48("15226") ? () => undefined : (stryCov_9fa48("15226"), () => Date.now());
    }
  }

  /**
   * Load one session record.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object|null>}
   */
  async loadSession(options = {}) {
    if (stryMutAct_9fa48("15227")) {
      {}
    } else {
      stryCov_9fa48("15227");
      const compositeKey = this.buildCompositeKey(options);
      const record = stryMutAct_9fa48("15230") ? this._storage.get(compositeKey) && null : stryMutAct_9fa48("15229") ? false : stryMutAct_9fa48("15228") ? true : (stryCov_9fa48("15228", "15229", "15230"), this._storage.get(compositeKey) || null);
      return record ? this.cloneRecord(record) : null;
    }
  }

  /**
   * Create or load a session. Existing sessions increment attempt count.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @return {Promise<Object>}
   */
  async createOrLoadSession(options = {}) {
    if (stryMutAct_9fa48("15231")) {
      {}
    } else {
      stryCov_9fa48("15231");
      const compositeKey = this.buildCompositeKey(options);
      const now = this._now();
      const existing = this._storage.get(compositeKey);
      if (stryMutAct_9fa48("15233") ? false : stryMutAct_9fa48("15232") ? true : (stryCov_9fa48("15232", "15233"), existing)) {
        if (stryMutAct_9fa48("15234")) {
          {}
        } else {
          stryCov_9fa48("15234");
          const updated = stryMutAct_9fa48("15235") ? {} : (stryCov_9fa48("15235"), {
            ...existing,
            attemptCount: stryMutAct_9fa48("15236") ? existing.attemptCount - 1 : (stryCov_9fa48("15236"), existing.attemptCount + 1),
            updatedAt: now
          });
          this._storage.set(compositeKey, updated);
          return this.cloneRecord(updated);
        }
      }
      const created = stryMutAct_9fa48("15237") ? {} : (stryCov_9fa48("15237"), {
        nodeId: options.nodeId,
        sessionId: options.sessionId,
        checkpoint: JOIN_CHECKPOINT.SESSION_CREATED,
        phase: JOIN_SESSION_DEFAULT.PHASE,
        attemptCount: 1,
        lastErrorCode: null,
        retryAfterMs: JOIN_SESSION_DEFAULT.RETRY_AFTER_MS,
        terminal: stryMutAct_9fa48("15238") ? true : (stryCov_9fa48("15238"), false),
        retryable: stryMutAct_9fa48("15239") ? false : (stryCov_9fa48("15239"), true),
        createdAt: now,
        updatedAt: now
      });
      this._storage.set(compositeKey, created);
      return this.cloneRecord(created);
    }
  }

  /**
   * Advance checkpoint monotonically.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {string} options.checkpoint
   * @param {string} [options.phase]
   * @return {Promise<Object>}
   */
  async advanceCheckpoint(options = {}) {
    if (stryMutAct_9fa48("15240")) {
      {}
    } else {
      stryCov_9fa48("15240");
      const compositeKey = this.buildCompositeKey(options);
      const nextCheckpoint = this.normalizeCheckpoint(options.checkpoint);
      const existing = this._storage.get(compositeKey);
      if (stryMutAct_9fa48("15243") ? false : stryMutAct_9fa48("15242") ? true : stryMutAct_9fa48("15241") ? existing : (stryCov_9fa48("15241", "15242", "15243"), !existing)) {
        if (stryMutAct_9fa48("15244")) {
          {}
        } else {
          stryCov_9fa48("15244");
          throw new Error((stryMutAct_9fa48("15245") ? "" : (stryCov_9fa48("15245"), 'join session not found: ')) + compositeKey);
        }
      }
      const currentIndex = this.getCheckpointIndex(existing.checkpoint);
      const nextIndex = this.getCheckpointIndex(nextCheckpoint);
      if (stryMutAct_9fa48("15249") ? nextIndex >= currentIndex : stryMutAct_9fa48("15248") ? nextIndex <= currentIndex : stryMutAct_9fa48("15247") ? false : stryMutAct_9fa48("15246") ? true : (stryCov_9fa48("15246", "15247", "15248", "15249"), nextIndex < currentIndex)) {
        if (stryMutAct_9fa48("15250")) {
          {}
        } else {
          stryCov_9fa48("15250");
          throw new Error(JOIN_SESSION_ERROR.CHECKPOINT_REGRESSION + (stryMutAct_9fa48("15251") ? `` : (stryCov_9fa48("15251"), ` (${existing.checkpoint} -> ${nextCheckpoint})`)));
        }
      }
      if (stryMutAct_9fa48("15254") ? nextIndex !== currentIndex : stryMutAct_9fa48("15253") ? false : stryMutAct_9fa48("15252") ? true : (stryCov_9fa48("15252", "15253", "15254"), nextIndex === currentIndex)) {
        if (stryMutAct_9fa48("15255")) {
          {}
        } else {
          stryCov_9fa48("15255");
          return this.cloneRecord(existing);
        }
      }
      const updated = stryMutAct_9fa48("15256") ? {} : (stryCov_9fa48("15256"), {
        ...existing,
        checkpoint: nextCheckpoint,
        phase: (stryMutAct_9fa48("15259") ? typeof options.phase === 'string' || options.phase.length > NUM.ZERO : stryMutAct_9fa48("15258") ? false : stryMutAct_9fa48("15257") ? true : (stryCov_9fa48("15257", "15258", "15259"), (stryMutAct_9fa48("15261") ? typeof options.phase !== 'string' : stryMutAct_9fa48("15260") ? true : (stryCov_9fa48("15260", "15261"), typeof options.phase === (stryMutAct_9fa48("15262") ? "" : (stryCov_9fa48("15262"), 'string')))) && (stryMutAct_9fa48("15265") ? options.phase.length <= NUM.ZERO : stryMutAct_9fa48("15264") ? options.phase.length >= NUM.ZERO : stryMutAct_9fa48("15263") ? true : (stryCov_9fa48("15263", "15264", "15265"), options.phase.length > NUM.ZERO)))) ? options.phase : existing.phase,
        lastErrorCode: null,
        retryAfterMs: JOIN_SESSION_DEFAULT.RETRY_AFTER_MS,
        terminal: stryMutAct_9fa48("15266") ? true : (stryCov_9fa48("15266"), false),
        retryable: stryMutAct_9fa48("15267") ? false : (stryCov_9fa48("15267"), true),
        updatedAt: this._now()
      });
      this._storage.set(compositeKey, updated);
      return this.cloneRecord(updated);
    }
  }

  /**
   * Record failed attempt metadata without losing checkpoint.
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} options.sessionId
   * @param {string} [options.errorCode]
   * @param {number} [options.retryAfterMs]
   * @param {boolean} [options.retryable]
   * @param {string} [options.phase]
   * @return {Promise<Object>}
   */
  async recordFailure(options = {}) {
    if (stryMutAct_9fa48("15268")) {
      {}
    } else {
      stryCov_9fa48("15268");
      const compositeKey = this.buildCompositeKey(options);
      const existing = this._storage.get(compositeKey);
      if (stryMutAct_9fa48("15271") ? false : stryMutAct_9fa48("15270") ? true : stryMutAct_9fa48("15269") ? existing : (stryCov_9fa48("15269", "15270", "15271"), !existing)) {
        if (stryMutAct_9fa48("15272")) {
          {}
        } else {
          stryCov_9fa48("15272");
          throw new Error((stryMutAct_9fa48("15273") ? "" : (stryCov_9fa48("15273"), 'join session not found: ')) + compositeKey);
        }
      }
      const updated = stryMutAct_9fa48("15274") ? {} : (stryCov_9fa48("15274"), {
        ...existing,
        phase: (stryMutAct_9fa48("15277") ? typeof options.phase === 'string' || options.phase.length > NUM.ZERO : stryMutAct_9fa48("15276") ? false : stryMutAct_9fa48("15275") ? true : (stryCov_9fa48("15275", "15276", "15277"), (stryMutAct_9fa48("15279") ? typeof options.phase !== 'string' : stryMutAct_9fa48("15278") ? true : (stryCov_9fa48("15278", "15279"), typeof options.phase === (stryMutAct_9fa48("15280") ? "" : (stryCov_9fa48("15280"), 'string')))) && (stryMutAct_9fa48("15283") ? options.phase.length <= NUM.ZERO : stryMutAct_9fa48("15282") ? options.phase.length >= NUM.ZERO : stryMutAct_9fa48("15281") ? true : (stryCov_9fa48("15281", "15282", "15283"), options.phase.length > NUM.ZERO)))) ? options.phase : existing.phase,
        lastErrorCode: (stryMutAct_9fa48("15286") ? typeof options.errorCode !== 'string' : stryMutAct_9fa48("15285") ? false : stryMutAct_9fa48("15284") ? true : (stryCov_9fa48("15284", "15285", "15286"), typeof options.errorCode === (stryMutAct_9fa48("15287") ? "" : (stryCov_9fa48("15287"), 'string')))) ? options.errorCode : existing.lastErrorCode,
        retryAfterMs: Number.isFinite(options.retryAfterMs) ? stryMutAct_9fa48("15288") ? Math.min(NUM.ZERO, Math.floor(options.retryAfterMs)) : (stryCov_9fa48("15288"), Math.max(NUM.ZERO, Math.floor(options.retryAfterMs))) : existing.retryAfterMs,
        retryable: stryMutAct_9fa48("15291") ? options.retryable === false : stryMutAct_9fa48("15290") ? false : stryMutAct_9fa48("15289") ? true : (stryCov_9fa48("15289", "15290", "15291"), options.retryable !== (stryMutAct_9fa48("15292") ? true : (stryCov_9fa48("15292"), false))),
        terminal: stryMutAct_9fa48("15295") ? options.retryable !== false : stryMutAct_9fa48("15294") ? false : stryMutAct_9fa48("15293") ? true : (stryCov_9fa48("15293", "15294", "15295"), options.retryable === (stryMutAct_9fa48("15296") ? true : (stryCov_9fa48("15296"), false))),
        updatedAt: this._now()
      });
      this._storage.set(compositeKey, updated);
      return this.cloneRecord(updated);
    }
  }

  /**
   * Determine whether one checkpoint is already satisfied.
   * @param {string} currentCheckpoint
   * @param {string} targetCheckpoint
   * @return {boolean}
   */
  isCheckpointSatisfied(currentCheckpoint, targetCheckpoint) {
    if (stryMutAct_9fa48("15297")) {
      {}
    } else {
      stryCov_9fa48("15297");
      return stryMutAct_9fa48("15301") ? this.getCheckpointIndex(currentCheckpoint) < this.getCheckpointIndex(targetCheckpoint) : stryMutAct_9fa48("15300") ? this.getCheckpointIndex(currentCheckpoint) > this.getCheckpointIndex(targetCheckpoint) : stryMutAct_9fa48("15299") ? false : stryMutAct_9fa48("15298") ? true : (stryCov_9fa48("15298", "15299", "15300", "15301"), this.getCheckpointIndex(currentCheckpoint) >= this.getCheckpointIndex(targetCheckpoint));
    }
  }
  buildCompositeKey(options = {}) {
    if (stryMutAct_9fa48("15302")) {
      {}
    } else {
      stryCov_9fa48("15302");
      if (stryMutAct_9fa48("15305") ? typeof options.nodeId !== 'string' && options.nodeId.length === 0 : stryMutAct_9fa48("15304") ? false : stryMutAct_9fa48("15303") ? true : (stryCov_9fa48("15303", "15304", "15305"), (stryMutAct_9fa48("15307") ? typeof options.nodeId === 'string' : stryMutAct_9fa48("15306") ? false : (stryCov_9fa48("15306", "15307"), typeof options.nodeId !== (stryMutAct_9fa48("15308") ? "" : (stryCov_9fa48("15308"), 'string')))) || (stryMutAct_9fa48("15310") ? options.nodeId.length !== 0 : stryMutAct_9fa48("15309") ? false : (stryCov_9fa48("15309", "15310"), options.nodeId.length === 0)))) {
        if (stryMutAct_9fa48("15311")) {
          {}
        } else {
          stryCov_9fa48("15311");
          throw new Error(JOIN_SESSION_ERROR.NODE_ID_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("15314") ? typeof options.sessionId !== 'string' && options.sessionId.length === 0 : stryMutAct_9fa48("15313") ? false : stryMutAct_9fa48("15312") ? true : (stryCov_9fa48("15312", "15313", "15314"), (stryMutAct_9fa48("15316") ? typeof options.sessionId === 'string' : stryMutAct_9fa48("15315") ? false : (stryCov_9fa48("15315", "15316"), typeof options.sessionId !== (stryMutAct_9fa48("15317") ? "" : (stryCov_9fa48("15317"), 'string')))) || (stryMutAct_9fa48("15319") ? options.sessionId.length !== 0 : stryMutAct_9fa48("15318") ? false : (stryCov_9fa48("15318", "15319"), options.sessionId.length === 0)))) {
        if (stryMutAct_9fa48("15320")) {
          {}
        } else {
          stryCov_9fa48("15320");
          throw new Error(JOIN_SESSION_ERROR.SESSION_ID_REQUIRED);
        }
      }
      return options.nodeId + (stryMutAct_9fa48("15321") ? "" : (stryCov_9fa48("15321"), '::')) + options.sessionId;
    }
  }
  normalizeCheckpoint(checkpoint) {
    if (stryMutAct_9fa48("15322")) {
      {}
    } else {
      stryCov_9fa48("15322");
      if (stryMutAct_9fa48("15325") ? false : stryMutAct_9fa48("15324") ? true : stryMutAct_9fa48("15323") ? Object.prototype.hasOwnProperty.call(JOIN_CHECKPOINT_INDEX, checkpoint) : (stryCov_9fa48("15323", "15324", "15325"), !Object.prototype.hasOwnProperty.call(JOIN_CHECKPOINT_INDEX, checkpoint))) {
        if (stryMutAct_9fa48("15326")) {
          {}
        } else {
          stryCov_9fa48("15326");
          throw new Error(JOIN_SESSION_ERROR.INVALID_CHECKPOINT + (stryMutAct_9fa48("15327") ? "" : (stryCov_9fa48("15327"), ': ')) + String(checkpoint));
        }
      }
      return checkpoint;
    }
  }
  getCheckpointIndex(checkpoint) {
    if (stryMutAct_9fa48("15328")) {
      {}
    } else {
      stryCov_9fa48("15328");
      const normalized = this.normalizeCheckpoint(checkpoint);
      return JOIN_CHECKPOINT_INDEX[normalized];
    }
  }
  cloneRecord(record) {
    if (stryMutAct_9fa48("15329")) {
      {}
    } else {
      stryCov_9fa48("15329");
      return stryMutAct_9fa48("15330") ? {} : (stryCov_9fa48("15330"), {
        nodeId: record.nodeId,
        sessionId: record.sessionId,
        checkpoint: record.checkpoint,
        phase: record.phase,
        attemptCount: record.attemptCount,
        lastErrorCode: record.lastErrorCode,
        retryAfterMs: record.retryAfterMs,
        retryable: record.retryable,
        terminal: record.terminal,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });
    }
  }
}
export { JOIN_CHECKPOINT, JOIN_CHECKPOINT_INDEX, JOIN_CHECKPOINT_SEQUENCE, JOIN_SESSION_ERROR, JoinSessionStore };