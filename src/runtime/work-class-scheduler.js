import {EventEmitter} from 'node:events';
import {NUM} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_SHED = 'shed';
const LOCAL_STR_QUEUED = 'queued';
const LOCAL_STR_STARTED = 'started';
const LOCAL_STR_COMPLETED = 'completed';
const LOCAL_STR_13EMY = ': ';

const WORK_CLASS = Object.freeze({
  A: 'A',
  B: 'B',
  C: 'C',
});

const WORK_CLASS_SCHEDULER_DEFAULT = Object.freeze({
  MAX_CONCURRENT: NUM.FOUR,
  RESERVED_CLASS_A_SLOTS: NUM.ONE,
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

    this.maxConcurrent = Math.max(NUM.ONE, maxConcurrent);
    this.reservedClassASlots = Math.max(
      NUM.ZERO,
      Math.min(this.maxConcurrent, reservedClassASlots),
    );
    this.maxClassCQueueSize = Math.max(NUM.ONE, maxClassCQueueSize);

    this._queues = new Map([
      [WORK_CLASS.A, []],
      [WORK_CLASS.B, []],
      [WORK_CLASS.C, []],
    ]);
    this._inFlightByClass = new Map([
      [WORK_CLASS.A, NUM.ZERO],
      [WORK_CLASS.B, NUM.ZERO],
      [WORK_CLASS.C, NUM.ZERO],
    ]);
    this._statsByClass = new Map([
      [WORK_CLASS.A, this.createClassStats()],
      [WORK_CLASS.B, this.createClassStats()],
      [WORK_CLASS.C, this.createClassStats()],
    ]);
    this._inFlightTotal = NUM.ZERO;
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
      classCStats.shedCount += LOCAL_NUM_ONE;
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
      classStats.enqueuedCount += LOCAL_NUM_ONE;
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
    if (classAQueue.length > NUM.ZERO) {
      return classAQueue.shift();
    }

    const nonAInFlight = this.getInFlightCount(WORK_CLASS.B) +
      this.getInFlightCount(WORK_CLASS.C);
    const nonACapacity = Math.max(
      NUM.ZERO,
      this.maxConcurrent - this.reservedClassASlots,
    );

    if (nonAInFlight >= nonACapacity) {
      return null;
    }

    const classBQueue = this._queues.get(WORK_CLASS.B);
    const classCQueue = this._queues.get(WORK_CLASS.C);
    const hasB = classBQueue.length > NUM.ZERO;
    const hasC = classCQueue.length > NUM.ZERO;
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
    this._inFlightTotal += LOCAL_NUM_ONE;
    this._inFlightByClass.set(
      workClass,
      this.getInFlightCount(workClass) + LOCAL_NUM_ONE,
    );
    if (workClass !== WORK_CLASS.A) {
      this._lastDispatchedNonAClass = workClass;
    }

    const classStats = this._statsByClass.get(workClass);
    classStats.startedCount += LOCAL_NUM_ONE;
    classStats.lastQueueLatencyMs = Math.max(
      NUM.ZERO,
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
        classStats.completedCount += LOCAL_NUM_ONE;
        entry.resolve(result);
      })
      .catch((error) => {
        classStats.failedCount += LOCAL_NUM_ONE;
        entry.reject(error);
      })
      .finally(() => {
        this._inFlightTotal -= LOCAL_NUM_ONE;
        this._inFlightByClass.set(
          workClass,
          this.getInFlightCount(workClass) - LOCAL_NUM_ONE,
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
      WORK_CLASS_SCHEDULER_ERROR.INVALID_WORK_CLASS + LOCAL_STR_13EMY + String(workClass),
    );
  }

  createClassStats() {
    return {
      enqueuedCount: NUM.ZERO,
      startedCount: NUM.ZERO,
      completedCount: NUM.ZERO,
      failedCount: NUM.ZERO,
      shedCount: NUM.ZERO,
      lastQueueLatencyMs: NUM.ZERO,
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
    return this._inFlightByClass.get(workClass) || NUM.ZERO;
  }
}

export {
  WORK_CLASS,
  WORK_CLASS_SCHEDULER_DEFAULT,
  WORK_CLASS_SCHEDULER_ERROR,
  WorkClassScheduler,
};
