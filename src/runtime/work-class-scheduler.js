import {EventEmitter} from 'node:events';
import {NUM} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_SHED = 'shed';
const LOCAL_STR_QUEUED = 'queued';
const LOCAL_STR_STARTED = 'started';
const LOCAL_STR_COMPLETED = 'completed';
const LOCAL_STR_COLON_SPACE = ': ';

const WORK_CLASS = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
});

const WORK_CLASS_SCHEDULER_DEFAULT = Object.freeze({
  MAX_CONCURRENT: NUM.FOUR,
  RESERVED_CLASS_A_SLOTS: 1,
  MAX_CLASS_C_QUEUE_SIZE: NUM.THOUSAND,
});

const WORK_CLASS_SCHEDULER_ERROR = Object.freeze({
  INVALID_WORK_CLASS: 'Invalid work class',
  TASK_REQUIRED: 'Work task must be a function',
  WORK_CLASS_C_SHED: 'WORK_CLASS_C_SHED',
});

/**
 * WorkClassScheduler enforces priority and fairness across A/B/C workload classes.
 */
class WorkClassScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    const maxConcurrent = Number.isFinite(options.maxConcurrent) ?
      Math.floor(options.maxConcurrent) :
      WORK_CLASS_SCHEDULER_DEFAULT.MAX_CONCURRENT;
    const reservedClassASlots = Number.isFinite(options.reservedClassASlots) ?
      Math.floor(options.reservedClassASlots) :
      WORK_CLASS_SCHEDULER_DEFAULT.RESERVED_CLASS_A_SLOTS;
    const maxClassCQueueSize = Number.isFinite(options.maxClassCQueueSize) ?
      Math.floor(options.maxClassCQueueSize) :
      WORK_CLASS_SCHEDULER_DEFAULT.MAX_CLASS_C_QUEUE_SIZE;

    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.reservedClassASlots = Math.max(
      0,
      Math.min(this.maxConcurrent, reservedClassASlots),
    );
    this.maxClassCQueueSize = Math.max(1, maxClassCQueueSize);

    this._queues = new Map([
      [WORK_CLASS.A, []],
      [WORK_CLASS.B, []],
      [WORK_CLASS.C, []],
    ]);
    this._inFlightByClass = new Map([
      [WORK_CLASS.A, 0],
      [WORK_CLASS.B, 0],
      [WORK_CLASS.C, 0],
    ]);
    this._statsByClass = new Map([
      [WORK_CLASS.A, this.createClassStats()],
      [WORK_CLASS.B, this.createClassStats()],
      [WORK_CLASS.C, this.createClassStats()],
    ]);
    this._inFlightTotal = 0;
    this._lastDispatchedNonAClass = null;
  }

  /**
   * Schedule one task for a work class.
   * @param {string} workClass
   * @param {Function} task
   * @return {Promise<*>}
   */
  enqueue(workClass, task) {
    const normalizedWorkClass = this.normalizeWorkClass(workClass);
    if (typeof task !== LOCAL_STR_FUNCTION) {
      throw new Error(WORK_CLASS_SCHEDULER_ERROR.TASK_REQUIRED);
    }

    if (normalizedWorkClass === WORK_CLASS.C &&
        this.getQueueDepth(WORK_CLASS.C) >= this.maxClassCQueueSize) {
      const classCStats = this._statsByClass.get(WORK_CLASS.C);
      classCStats.shedCount += 1;
      const shedError = new Error(WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED);
      shedError.code = WORK_CLASS_SCHEDULER_ERROR.WORK_CLASS_C_SHED;
      this.emit(LOCAL_STR_SHED, {
        workClass: WORK_CLASS.C,
        queueDepth: this.getQueueDepth(WORK_CLASS.C),
      });
      return Promise.reject(shedError);
    }

    return new Promise((resolve, reject) => {
      const classStats = this._statsByClass.get(normalizedWorkClass);
      classStats.enqueuedCount += 1;
      this._queues.get(normalizedWorkClass).push({
        workClass: normalizedWorkClass,
        task,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      });
      this.emit(LOCAL_STR_QUEUED, {
        workClass: normalizedWorkClass,
        queueDepth: this.getQueueDepth(normalizedWorkClass),
      });
      this.drain();
    });
  }

  /**
   * Return scheduler stats and class diagnostics.
   * @return {Object}
   */
  getStats() {
    return {
      maxConcurrent: this.maxConcurrent,
      reservedClassASlots: this.reservedClassASlots,
      maxClassCQueueSize: this.maxClassCQueueSize,
      inFlightTotal: this._inFlightTotal,
      classA: this.buildClassStatsSnapshot(WORK_CLASS.A),
      classB: this.buildClassStatsSnapshot(WORK_CLASS.B),
      classC: this.buildClassStatsSnapshot(WORK_CLASS.C),
    };
  }

  /**
   * Attempt dispatch of queued tasks while capacity is available.
   */
  drain() {
    while (this._inFlightTotal < this.maxConcurrent) {
      const entry = this.selectNextQueuedEntry();
      if (!entry) {
        return;
      }
      this.dispatchEntry(entry);
    }
  }

  /**
   * Select next queued entry honoring A-priority, non-A fairness, and A-reservation.
   * @return {Object|null}
   */
  selectNextQueuedEntry() {
    const classAQueue = this._queues.get(WORK_CLASS.A);
    if (classAQueue.length > 0) {
      return classAQueue.shift();
    }

    const nonAInFlight = this.getInFlightCount(WORK_CLASS.B) +
      this.getInFlightCount(WORK_CLASS.C);
    const nonACapacity = Math.max(
      0,
      this.maxConcurrent - this.reservedClassASlots,
    );

    if (nonAInFlight >= nonACapacity) {
      return null;
    }

    const classBQueue = this._queues.get(WORK_CLASS.B);
    const classCQueue = this._queues.get(WORK_CLASS.C);
    const hasB = classBQueue.length > 0;
    const hasC = classCQueue.length > 0;
    if (!hasB && !hasC) {
      return null;
    }

    if (hasB && hasC) {
      if (this._lastDispatchedNonAClass === WORK_CLASS.B) {
        return classCQueue.shift();
      }
      if (this._lastDispatchedNonAClass === WORK_CLASS.C) {
        return classBQueue.shift();
      }
      return classBQueue.shift();
    }

    return hasB ? classBQueue.shift() : classCQueue.shift();
  }

  /**
   * Dispatch one queued entry.
   * @param {Object} entry
   */
  dispatchEntry(entry) {
    const workClass = entry.workClass;
    this._inFlightTotal += 1;
    this._inFlightByClass.set(
      workClass,
      this.getInFlightCount(workClass) + 1,
    );
    if (workClass !== WORK_CLASS.A) {
      this._lastDispatchedNonAClass = workClass;
    }

    const classStats = this._statsByClass.get(workClass);
    classStats.startedCount += 1;
    classStats.lastQueueLatencyMs = Math.max(
      0,
      Date.now() - entry.enqueuedAt,
    );
    this.emit(LOCAL_STR_STARTED, {
      workClass,
      queueDepth: this.getQueueDepth(workClass),
      queueLatencyMs: classStats.lastQueueLatencyMs,
    });

    Promise.resolve()
      .then(() => entry.task())
      .then((result) => {
        classStats.completedCount += 1;
        entry.resolve(result);
      })
      .catch((error) => {
        classStats.failedCount += 1;
        entry.reject(error);
      })
      .finally(() => {
        this._inFlightTotal -= 1;
        this._inFlightByClass.set(
          workClass,
          this.getInFlightCount(workClass) - 1,
        );
        this.emit(LOCAL_STR_COMPLETED, {
          workClass,
          queueDepth: this.getQueueDepth(workClass),
        });
        this.drain();
      });
  }

  normalizeWorkClass(workClass) {
    if (workClass === WORK_CLASS.A ||
        workClass === WORK_CLASS.B ||
        workClass === WORK_CLASS.C) {
      return workClass;
    }
    throw new Error(
      WORK_CLASS_SCHEDULER_ERROR.INVALID_WORK_CLASS + LOCAL_STR_COLON_SPACE + String(workClass),
    );
  }

  createClassStats() {
    return {
      enqueuedCount: 0,
      startedCount: 0,
      completedCount: 0,
      failedCount: 0,
      shedCount: 0,
      lastQueueLatencyMs: 0,
    };
  }

  buildClassStatsSnapshot(workClass) {
    const stats = this._statsByClass.get(workClass);
    return {
      queueDepth: this.getQueueDepth(workClass),
      inFlight: this.getInFlightCount(workClass),
      enqueuedCount: stats.enqueuedCount,
      startedCount: stats.startedCount,
      completedCount: stats.completedCount,
      failedCount: stats.failedCount,
      shedCount: stats.shedCount,
      lastQueueLatencyMs: stats.lastQueueLatencyMs,
    };
  }

  getQueueDepth(workClass) {
    return this._queues.get(workClass).length;
  }

  getInFlightCount(workClass) {
    return this._inFlightByClass.get(workClass) || 0;
  }
}

export {
  WORK_CLASS,
  WORK_CLASS_SCHEDULER_DEFAULT,
  WORK_CLASS_SCHEDULER_ERROR,
  WorkClassScheduler,
};
