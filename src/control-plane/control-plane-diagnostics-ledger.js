import {NUM, TYPEOF} from '../constants/index.js';

const LOCAL_NUM_128 = 128;

function freezeValue(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeValue(entry)));
  }
  if (value && typeof value === TYPEOF.OBJECT) {
    const frozen = {};
    for (const [key, entry] of Object.entries(value)) {
      frozen[key] = freezeValue(entry);
    }
    return Object.freeze(frozen);
  }
  return value;
}

class ControlPlaneDiagnosticsLedger {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxEntries=128]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.maxEntries = Number.isInteger(options.maxEntries) &&
      options.maxEntries > NUM.ZERO ?
      options.maxEntries :
      LOCAL_NUM_128;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.nextSequence = NUM.ONE;
    this.entries = [];
  }

  /**
   * @param {Object} entry
   * @return {Object}
   */
  append(entry = {}) {
    const recordedAtMs = this.now();
    const normalized = freezeValue({
      sequence: this.nextSequence,
      recordedAtMs,
      recordedAt: new Date(recordedAtMs).toISOString(),
      ...entry,
    });
    this.nextSequence += NUM.ONE;
    this.entries.push(normalized);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
    return normalized;
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getEntries(options = {}) {
    const limit = Number.isInteger(options.limit) && options.limit > NUM.ZERO ?
      options.limit :
      null;
    const entries = limit === null ?
      this.entries :
      this.entries.slice(Math.max(NUM.ZERO, this.entries.length - limit));
    return Object.freeze(entries.map((entry) => entry));
  }

  /**
   * @return {number}
   */
  getSize() {
    return this.entries.length;
  }
}

export {ControlPlaneDiagnosticsLedger};
