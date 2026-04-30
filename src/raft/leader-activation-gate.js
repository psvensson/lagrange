import {NUM} from '../constants/index.js';

const LOCAL_STR_FUNCTION = 'function';

const DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS = 250;

function normalizeHoldoffMs(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS;
}

class LeaderActivationGate {
  constructor(options = {}) {
    this.holdoffMs = normalizeHoldoffMs(options.holdoffMs);
    this.activationScheduler = options.activationScheduler || null;
    this.activationHandle = null;
    this.pendingTerm = null;
    this.activatedTerm = null;
    this.timer = null;
    this.destroyed = false;
  }

  schedule(term, activate, options = {}) {
    if (this.destroyed || typeof activate !== LOCAL_STR_FUNCTION) {
      return false;
    }
    if (this.activatedTerm === term) {
      return false;
    }
    if (this.pendingTerm === term && this.timer) {
      return false;
    }

    this.cancel({clearActivatedTerm: false});
    this.pendingTerm = term;

    const runActivation = () => {
      this.timer = null;
      if (this.destroyed || this.pendingTerm !== term) {
        return;
      }
      const activateNow = () => {
        this.activationHandle = null;
        if (this.destroyed || this.pendingTerm !== term) {
          return;
        }
        const shouldActivate =
          typeof options.shouldActivate === 'function' ?
            options.shouldActivate() :
            true;
        if (shouldActivate !== true) {
          this.pendingTerm = null;
          return;
        }
        this.pendingTerm = null;
        this.activatedTerm = term;
        activate();
      };
      if (this.activationScheduler && options.immediate !== true) {
        this.activationHandle = this.activationScheduler.enqueue(activateNow);
        return;
      }
      activateNow();
    };

    const immediate = options.immediate === true || this.holdoffMs === NUM.ZERO;
    if (immediate) {
      runActivation();
      return true;
    }

    this.timer = setTimeout(runActivation, this.holdoffMs);
    if (typeof this.timer?.unref === LOCAL_STR_FUNCTION) {
      this.timer.unref();
    }
    return true;
  }

  cancel(options = {}) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.activationHandle &&
        typeof this.activationHandle.cancel === LOCAL_STR_FUNCTION) {
      this.activationHandle.cancel();
    }
    this.activationHandle = null;
    this.pendingTerm = null;
    if (options.clearActivatedTerm === true) {
      this.activatedTerm = null;
    }
  }

  shutdown() {
    this.destroyed = true;
    this.cancel({clearActivatedTerm: true});
  }
}

export {
  DEFAULT_LEADER_ACTIVATION_HOLDOFF_MS,
  LeaderActivationGate,
};
