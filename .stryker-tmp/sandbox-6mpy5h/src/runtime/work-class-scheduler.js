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
import { NUM } from '../constants/index.js';
const WORK_CLASS = Object.freeze(stryMutAct_9fa48("149536") ? {} : (stryCov_9fa48("149536"), {
  A: stryMutAct_9fa48("149537") ? "" : (stryCov_9fa48("149537"), 'A'),
  B: stryMutAct_9fa48("149538") ? "" : (stryCov_9fa48("149538"), 'B'),
  C: stryMutAct_9fa48("149539") ? "" : (stryCov_9fa48("149539"), 'C')
}));
const WORK_CLASS_SCHEDULER_DEFAULT = Object.freeze(stryMutAct_9fa48("149540") ? {} : (stryCov_9fa48("149540"), {
  MAX_CONCURRENT: NUM.FOUR,
  RESERVED_CLASS_A_SLOTS: NUM.ONE,
  MAX_CLASS_C_QUEUE_SIZE: NUM.THOUSAND
}));
const WORK_CLASS_SCHEDULER_ERROR = Object.freeze(stryMutAct_9fa48("149541") ? {} : (stryCov_9fa48("149541"), {
  INVALID_WORK_CLASS: stryMutAct_9fa48("149542") ? "" : (stryCov_9fa48("149542"), 'Invalid work class'),
  TASK_REQUIRED: stryMutAct_9fa48("149543") ? "" : (stryCov_9fa48("149543"), 'Work task must be a function'),
  WORK_CLASS_C_SHED: stryMutAct_9fa48("149544") ? "" : (stryCov_9fa48("149544"), 'WORK_CLASS_C_SHED')
}));

/**
 * WorkClassScheduler enforces priority and fairness across A/B/C workload classes.
 */
class WorkClassScheduler extends EventEmitter {
  constructor(options = {}) {
    if (stryMutAct_9fa48("149545")) {
      {}
    } else {
      stryCov_9fa48("149545");
      super();
      const maxConcurrent = Number.isFinite(options.maxConcurrent) ? Math.floor(options.maxConcurrent) : WORK_CLASS_SCHEDULER_DEFAULT.MAX_CONCURRENT;
      const reservedClassASlots = Number.isFinite(options.reservedClassASlots) ? Math.floor(options.reservedClassASlots) : WORK_CLASS_SCHEDULER_DEFAULT.RESERVED_CLASS_A_SLOTS;
      const maxClassCQueueSize = Number.isFinite(options.maxClassCQueueSize) ? Math.floor(options.maxClassCQueueSize) : WORK_CLASS_SCHEDULER_DEFAULT.MAX_CLASS_C_QUEUE_SIZE;
      this.maxConcurrent = stryMutAct_9fa48("149546") ? Math.min(NUM.ONE, maxConcurrent) : (stryCov_9fa48("149546"), Math.max(NUM.ONE, maxConcurrent));
      this.reservedClassASlots = stryMutAct_9fa48("149547") ? Math.min(NUM.ZERO, Math.min(this.maxConcurrent, reservedClassASlots)) : (stryCov_9fa48("149547"), Math.max(NUM.ZERO, stryMutAct_9fa48("149548") ? Math.max(this.maxConcurrent, reservedClassASlots) : (stryCov_9fa48("149548"), Math.min(this.maxConcurrent, reservedClassASlots))));
      this.maxClassCQueueSize = stryMutAct_9fa48("149549") ? Math.min(NUM.ONE, maxClassCQueueSize) : (stryCov_9fa48("149549"), Math.max(NUM.ONE, maxClassCQueueSize));
      this._queues = new Map(stryMutAct_9fa48("149550") ? [] : (stryCov_9fa48("149550"), [stryMutAct_9fa48("149551") ? [] : (stryCov_9fa48("149551"), [WORK_CLASS.A, stryMutAct_9fa48("149552") ? ["Stryker was here"] : (stryCov_9fa48("149552"), [])]), stryMutAct_9fa48("149553") ? [] : (stryCov_9fa48("149553"), [WORK_CLASS.B, stryMutAct_9fa48("149554") ? ["Stryker was here"] : (stryCov_9fa48("149554"), [])]), stryMutAct_9fa48("149555") ? [] : (stryCov_9fa48("149555"), [WORK_CLASS.C, stryMutAct_9fa48("149556") ? ["Stryker was here"] : (stryCov_9fa48("149556"), [])])]));
      this._inFlightByClass = new Map(stryMutAct_9fa48("149557") ? [] : (stryCov_9fa48("149557"), [stryMutAct_9fa48("149558") ? [] : (stryCov_9fa48("149558"), [WORK_CLASS.A, NUM.ZERO]), stryMutAct_9fa48("149559") ? [] : (stryCov_9fa48("149559"), [WORK_CLASS.B, NUM.ZERO]), stryMutAct_9fa48("149560") ? [] : (stryCov_9fa48("149560"), [WORK_CLASS.C, NUM.ZERO])]));
      this._statsByClass = new Map(stryMutAct_9fa48("149561") ? [] : (stryCov_9fa48("149561"), [stryMutAct_9fa48("149562") ? [] : (stryCov_9fa48("149562"), [WORK_CLASS.A, this.createClassStats()]), stryMutAct_9fa48("149563") ? [] : (stryCov_9fa48("149563"), [WORK_CLASS.B, this.createClassStats()]), stryMutAct_9fa48("149564") ? [] : (stryCov_9fa48("149564"), [WORK_CLASS.C, this.createClassStats()])]));
      this._inFlightTotal = NUM.ZERO;
      this._lastDispatchedNonAClass = null;
    }
  }

  /**
   * Schedule one task for a work class.
   * @param {string} workClass
   * @param {Function} task
   * @return {Promise<*>}
   */
  enqueue(workClass, task) {
    if (stryMutAct_9fa48("149565")) {
      {}
    } else {
      stryCov_9fa48("149565");
      const normalizedWorkClass = this.normalizeWorkClass(workClass);
      if (stryMutAct_9fa48("149568") ? typeof task === 'function' : stryMutAct_9fa48("149567") ? false : stryMutAct_9fa48("149566") ? true : (stryCov_9fa48("149566", "149567", "149568"), typeof task !== (stryMutAct_9fa48("149569") ? "" : (stryCov_9fa48("149569"), 'function')))) {
        if (stryMutAct_9fa48("149570")) {
          {}
        } else {
          stryCov_9fa48("149570");
          throw new Error(WORK_CLASS_SCHEDULER_ERROR.TASK_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("149573") ? normalizedWorkClass === WORK_CLASS.C || this.getQueueDepth(WORK_CLASS.C) >= this.maxClassCQueueSize : stryMutAct_9fa48("149572") ? false : stryMutAct_9fa48("149571") ? true : (stryCov_9fa48("149571", "149572", "149573"), (stryMutAct_9fa48("149575") ? normalizedWorkClass !== WORK_CLASS.C : stryMutAct_9fa48("149574") ? true : (stryCov_9fa48("149574", "149575"), normalizedWorkClass === WORK_CLASS.C)) && (stryMutAct_9fa48("149578") ? this.getQueueDepth(WORK_CLASS.C) < this.maxClassCQueueSize : stryMutAct_9fa48("149577") ? this.getQueueDepth(WORK_CLASS.C) > this.maxClassCQueueSize : stryMutAct_9fa48("149576") ? true : (stryCov_9fa48("149576", "149577", "149578"), this.getQueueDepth(WORK_CLASS.C) >= this.maxClassCQueueSize)))) {
        if (stryMutAct_9fa48("149579")) {
          {}
        } else {
          stryCov_9fa48("149579");
          const classCStats = this._statsByClass.get(WORK_CLASS.C);
          stryMutAct_9fa48("149580") ? classCStats.shedCount -= 1 : (stryCov_9fa48("149580"), classCStats.shedCount += 1);
          const shedError = new Error(WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED);
          shedError.code = WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED;
          this.emit(stryMutAct_9fa48("149581") ? "" : (stryCov_9fa48("149581"), 'shed'), stryMutAct_9fa48("149582") ? {} : (stryCov_9fa48("149582"), {
            workClass: WORK_CLASS.C,
            queueDepth: this.getQueueDepth(WORK_CLASS.C)
          }));
          return Promise.reject(shedError);
        }
      }
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("149583")) {
          {}
        } else {
          stryCov_9fa48("149583");
          const classStats = this._statsByClass.get(normalizedWorkClass);
          stryMutAct_9fa48("149584") ? classStats.enqueuedCount -= 1 : (stryCov_9fa48("149584"), classStats.enqueuedCount += 1);
          this._queues.get(normalizedWorkClass).push(stryMutAct_9fa48("149585") ? {} : (stryCov_9fa48("149585"), {
            workClass: normalizedWorkClass,
            task,
            resolve,
            reject,
            enqueuedAt: Date.now()
          }));
          this.emit(stryMutAct_9fa48("149586") ? "" : (stryCov_9fa48("149586"), 'queued'), stryMutAct_9fa48("149587") ? {} : (stryCov_9fa48("149587"), {
            workClass: normalizedWorkClass,
            queueDepth: this.getQueueDepth(normalizedWorkClass)
          }));
          this.drain();
        }
      });
    }
  }

  /**
   * Return scheduler stats and class diagnostics.
   * @return {Object}
   */
  getStats() {
    if (stryMutAct_9fa48("149588")) {
      {}
    } else {
      stryCov_9fa48("149588");
      return stryMutAct_9fa48("149589") ? {} : (stryCov_9fa48("149589"), {
        maxConcurrent: this.maxConcurrent,
        reservedClassASlots: this.reservedClassASlots,
        maxClassCQueueSize: this.maxClassCQueueSize,
        inFlightTotal: this._inFlightTotal,
        classA: this.buildClassStatsSnapshot(WORK_CLASS.A),
        classB: this.buildClassStatsSnapshot(WORK_CLASS.B),
        classC: this.buildClassStatsSnapshot(WORK_CLASS.C)
      });
    }
  }

  /**
   * Attempt dispatch of queued tasks while capacity is available.
   */
  drain() {
    if (stryMutAct_9fa48("149590")) {
      {}
    } else {
      stryCov_9fa48("149590");
      while (stryMutAct_9fa48("149593") ? this._inFlightTotal >= this.maxConcurrent : stryMutAct_9fa48("149592") ? this._inFlightTotal <= this.maxConcurrent : stryMutAct_9fa48("149591") ? false : (stryCov_9fa48("149591", "149592", "149593"), this._inFlightTotal < this.maxConcurrent)) {
        if (stryMutAct_9fa48("149594")) {
          {}
        } else {
          stryCov_9fa48("149594");
          const entry = this.selectNextQueuedEntry();
          if (stryMutAct_9fa48("149597") ? false : stryMutAct_9fa48("149596") ? true : stryMutAct_9fa48("149595") ? entry : (stryCov_9fa48("149595", "149596", "149597"), !entry)) {
            if (stryMutAct_9fa48("149598")) {
              {}
            } else {
              stryCov_9fa48("149598");
              return;
            }
          }
          this.dispatchEntry(entry);
        }
      }
    }
  }

  /**
   * Select next queued entry honoring A-priority, non-A fairness, and A-reservation.
   * @return {Object|null}
   */
  selectNextQueuedEntry() {
    if (stryMutAct_9fa48("149599")) {
      {}
    } else {
      stryCov_9fa48("149599");
      const classAQueue = this._queues.get(WORK_CLASS.A);
      if (stryMutAct_9fa48("149603") ? classAQueue.length <= NUM.ZERO : stryMutAct_9fa48("149602") ? classAQueue.length >= NUM.ZERO : stryMutAct_9fa48("149601") ? false : stryMutAct_9fa48("149600") ? true : (stryCov_9fa48("149600", "149601", "149602", "149603"), classAQueue.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("149604")) {
          {}
        } else {
          stryCov_9fa48("149604");
          return classAQueue.shift();
        }
      }
      const nonAInFlight = stryMutAct_9fa48("149605") ? this.getInFlightCount(WORK_CLASS.B) - this.getInFlightCount(WORK_CLASS.C) : (stryCov_9fa48("149605"), this.getInFlightCount(WORK_CLASS.B) + this.getInFlightCount(WORK_CLASS.C));
      const nonACapacity = stryMutAct_9fa48("149606") ? Math.min(NUM.ZERO, this.maxConcurrent - this.reservedClassASlots) : (stryCov_9fa48("149606"), Math.max(NUM.ZERO, stryMutAct_9fa48("149607") ? this.maxConcurrent + this.reservedClassASlots : (stryCov_9fa48("149607"), this.maxConcurrent - this.reservedClassASlots)));
      if (stryMutAct_9fa48("149611") ? nonAInFlight < nonACapacity : stryMutAct_9fa48("149610") ? nonAInFlight > nonACapacity : stryMutAct_9fa48("149609") ? false : stryMutAct_9fa48("149608") ? true : (stryCov_9fa48("149608", "149609", "149610", "149611"), nonAInFlight >= nonACapacity)) {
        if (stryMutAct_9fa48("149612")) {
          {}
        } else {
          stryCov_9fa48("149612");
          return null;
        }
      }
      const classBQueue = this._queues.get(WORK_CLASS.B);
      const classCQueue = this._queues.get(WORK_CLASS.C);
      const hasB = stryMutAct_9fa48("149616") ? classBQueue.length <= NUM.ZERO : stryMutAct_9fa48("149615") ? classBQueue.length >= NUM.ZERO : stryMutAct_9fa48("149614") ? false : stryMutAct_9fa48("149613") ? true : (stryCov_9fa48("149613", "149614", "149615", "149616"), classBQueue.length > NUM.ZERO);
      const hasC = stryMutAct_9fa48("149620") ? classCQueue.length <= NUM.ZERO : stryMutAct_9fa48("149619") ? classCQueue.length >= NUM.ZERO : stryMutAct_9fa48("149618") ? false : stryMutAct_9fa48("149617") ? true : (stryCov_9fa48("149617", "149618", "149619", "149620"), classCQueue.length > NUM.ZERO);
      if (stryMutAct_9fa48("149623") ? !hasB || !hasC : stryMutAct_9fa48("149622") ? false : stryMutAct_9fa48("149621") ? true : (stryCov_9fa48("149621", "149622", "149623"), (stryMutAct_9fa48("149624") ? hasB : (stryCov_9fa48("149624"), !hasB)) && (stryMutAct_9fa48("149625") ? hasC : (stryCov_9fa48("149625"), !hasC)))) {
        if (stryMutAct_9fa48("149626")) {
          {}
        } else {
          stryCov_9fa48("149626");
          return null;
        }
      }
      if (stryMutAct_9fa48("149629") ? hasB || hasC : stryMutAct_9fa48("149628") ? false : stryMutAct_9fa48("149627") ? true : (stryCov_9fa48("149627", "149628", "149629"), hasB && hasC)) {
        if (stryMutAct_9fa48("149630")) {
          {}
        } else {
          stryCov_9fa48("149630");
          if (stryMutAct_9fa48("149633") ? this._lastDispatchedNonAClass !== WORK_CLASS.B : stryMutAct_9fa48("149632") ? false : stryMutAct_9fa48("149631") ? true : (stryCov_9fa48("149631", "149632", "149633"), this._lastDispatchedNonAClass === WORK_CLASS.B)) {
            if (stryMutAct_9fa48("149634")) {
              {}
            } else {
              stryCov_9fa48("149634");
              return classCQueue.shift();
            }
          }
          if (stryMutAct_9fa48("149637") ? this._lastDispatchedNonAClass !== WORK_CLASS.C : stryMutAct_9fa48("149636") ? false : stryMutAct_9fa48("149635") ? true : (stryCov_9fa48("149635", "149636", "149637"), this._lastDispatchedNonAClass === WORK_CLASS.C)) {
            if (stryMutAct_9fa48("149638")) {
              {}
            } else {
              stryCov_9fa48("149638");
              return classBQueue.shift();
            }
          }
          return classBQueue.shift();
        }
      }
      return hasB ? classBQueue.shift() : classCQueue.shift();
    }
  }

  /**
   * Dispatch one queued entry.
   * @param {Object} entry
   */
  dispatchEntry(entry) {
    if (stryMutAct_9fa48("149639")) {
      {}
    } else {
      stryCov_9fa48("149639");
      const workClass = entry.workClass;
      stryMutAct_9fa48("149640") ? this._inFlightTotal -= 1 : (stryCov_9fa48("149640"), this._inFlightTotal += 1);
      this._inFlightByClass.set(workClass, stryMutAct_9fa48("149641") ? this.getInFlightCount(workClass) - 1 : (stryCov_9fa48("149641"), this.getInFlightCount(workClass) + 1));
      if (stryMutAct_9fa48("149644") ? workClass === WORK_CLASS.A : stryMutAct_9fa48("149643") ? false : stryMutAct_9fa48("149642") ? true : (stryCov_9fa48("149642", "149643", "149644"), workClass !== WORK_CLASS.A)) {
        if (stryMutAct_9fa48("149645")) {
          {}
        } else {
          stryCov_9fa48("149645");
          this._lastDispatchedNonAClass = workClass;
        }
      }
      const classStats = this._statsByClass.get(workClass);
      stryMutAct_9fa48("149646") ? classStats.startedCount -= 1 : (stryCov_9fa48("149646"), classStats.startedCount += 1);
      classStats.lastQueueLatencyMs = stryMutAct_9fa48("149647") ? Math.min(NUM.ZERO, Date.now() - entry.enqueuedAt) : (stryCov_9fa48("149647"), Math.max(NUM.ZERO, stryMutAct_9fa48("149648") ? Date.now() + entry.enqueuedAt : (stryCov_9fa48("149648"), Date.now() - entry.enqueuedAt)));
      this.emit(stryMutAct_9fa48("149649") ? "" : (stryCov_9fa48("149649"), 'started'), stryMutAct_9fa48("149650") ? {} : (stryCov_9fa48("149650"), {
        workClass,
        queueDepth: this.getQueueDepth(workClass),
        queueLatencyMs: classStats.lastQueueLatencyMs
      }));
      Promise.resolve().then(stryMutAct_9fa48("149651") ? () => undefined : (stryCov_9fa48("149651"), () => entry.task())).then(result => {
        if (stryMutAct_9fa48("149652")) {
          {}
        } else {
          stryCov_9fa48("149652");
          stryMutAct_9fa48("149653") ? classStats.completedCount -= 1 : (stryCov_9fa48("149653"), classStats.completedCount += 1);
          entry.resolve(result);
        }
      }).catch(error => {
        if (stryMutAct_9fa48("149654")) {
          {}
        } else {
          stryCov_9fa48("149654");
          stryMutAct_9fa48("149655") ? classStats.failedCount -= 1 : (stryCov_9fa48("149655"), classStats.failedCount += 1);
          entry.reject(error);
        }
      }).finally(() => {
        if (stryMutAct_9fa48("149656")) {
          {}
        } else {
          stryCov_9fa48("149656");
          stryMutAct_9fa48("149657") ? this._inFlightTotal += 1 : (stryCov_9fa48("149657"), this._inFlightTotal -= 1);
          this._inFlightByClass.set(workClass, stryMutAct_9fa48("149658") ? this.getInFlightCount(workClass) + 1 : (stryCov_9fa48("149658"), this.getInFlightCount(workClass) - 1));
          this.emit(stryMutAct_9fa48("149659") ? "" : (stryCov_9fa48("149659"), 'completed'), stryMutAct_9fa48("149660") ? {} : (stryCov_9fa48("149660"), {
            workClass,
            queueDepth: this.getQueueDepth(workClass)
          }));
          this.drain();
        }
      });
    }
  }
  normalizeWorkClass(workClass) {
    if (stryMutAct_9fa48("149661")) {
      {}
    } else {
      stryCov_9fa48("149661");
      if (stryMutAct_9fa48("149664") ? (workClass === WORK_CLASS.A || workClass === WORK_CLASS.B) && workClass === WORK_CLASS.C : stryMutAct_9fa48("149663") ? false : stryMutAct_9fa48("149662") ? true : (stryCov_9fa48("149662", "149663", "149664"), (stryMutAct_9fa48("149666") ? workClass === WORK_CLASS.A && workClass === WORK_CLASS.B : stryMutAct_9fa48("149665") ? false : (stryCov_9fa48("149665", "149666"), (stryMutAct_9fa48("149668") ? workClass !== WORK_CLASS.A : stryMutAct_9fa48("149667") ? false : (stryCov_9fa48("149667", "149668"), workClass === WORK_CLASS.A)) || (stryMutAct_9fa48("149670") ? workClass !== WORK_CLASS.B : stryMutAct_9fa48("149669") ? false : (stryCov_9fa48("149669", "149670"), workClass === WORK_CLASS.B)))) || (stryMutAct_9fa48("149672") ? workClass !== WORK_CLASS.C : stryMutAct_9fa48("149671") ? false : (stryCov_9fa48("149671", "149672"), workClass === WORK_CLASS.C)))) {
        if (stryMutAct_9fa48("149673")) {
          {}
        } else {
          stryCov_9fa48("149673");
          return workClass;
        }
      }
      throw new Error(WORK_CLASS_SCHEDULER_ERROR.INVALID_WORK_CLASS + (stryMutAct_9fa48("149674") ? "" : (stryCov_9fa48("149674"), ': ')) + String(workClass));
    }
  }
  createClassStats() {
    if (stryMutAct_9fa48("149675")) {
      {}
    } else {
      stryCov_9fa48("149675");
      return stryMutAct_9fa48("149676") ? {} : (stryCov_9fa48("149676"), {
        enqueuedCount: NUM.ZERO,
        startedCount: NUM.ZERO,
        completedCount: NUM.ZERO,
        failedCount: NUM.ZERO,
        shedCount: NUM.ZERO,
        lastQueueLatencyMs: NUM.ZERO
      });
    }
  }
  buildClassStatsSnapshot(workClass) {
    if (stryMutAct_9fa48("149677")) {
      {}
    } else {
      stryCov_9fa48("149677");
      const stats = this._statsByClass.get(workClass);
      return stryMutAct_9fa48("149678") ? {} : (stryCov_9fa48("149678"), {
        queueDepth: this.getQueueDepth(workClass),
        inFlight: this.getInFlightCount(workClass),
        enqueuedCount: stats.enqueuedCount,
        startedCount: stats.startedCount,
        completedCount: stats.completedCount,
        failedCount: stats.failedCount,
        shedCount: stats.shedCount,
        lastQueueLatencyMs: stats.lastQueueLatencyMs
      });
    }
  }
  getQueueDepth(workClass) {
    if (stryMutAct_9fa48("149679")) {
      {}
    } else {
      stryCov_9fa48("149679");
      return this._queues.get(workClass).length;
    }
  }
  getInFlightCount(workClass) {
    if (stryMutAct_9fa48("149680")) {
      {}
    } else {
      stryCov_9fa48("149680");
      return stryMutAct_9fa48("149683") ? this._inFlightByClass.get(workClass) && NUM.ZERO : stryMutAct_9fa48("149682") ? false : stryMutAct_9fa48("149681") ? true : (stryCov_9fa48("149681", "149682", "149683"), this._inFlightByClass.get(workClass) || NUM.ZERO);
    }
  }
}
export { WORK_CLASS, WORK_CLASS_SCHEDULER_DEFAULT, WORK_CLASS_SCHEDULER_ERROR, WorkClassScheduler };