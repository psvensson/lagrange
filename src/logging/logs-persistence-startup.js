import {READINESS_EVENT} from '../bootstrap/bootstrap-readiness-state-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_FUNCTION = 'function';

const LOGS_TABLE_PERSISTENCE_READY_DELAY_MS = 5000;

function normalizeDelayMs(value) {
  if (!Number.isFinite(value) || value < LOCAL_NUM_ZERO) {
    return LOGS_TABLE_PERSISTENCE_READY_DELAY_MS;
  }
  return Math.floor(value);
}

function removeReadinessTransitionListener(readinessState, listener) {
  if (!readinessState || typeof listener !== LOCAL_STR_FUNCTION) {
    return;
  }
  if (typeof readinessState.off === LOCAL_STR_FUNCTION) {
    readinessState.off(READINESS_EVENT.TRANSITION, listener);
    return;
  }
  if (typeof readinessState.removeListener === LOCAL_STR_FUNCTION) {
    readinessState.removeListener(READINESS_EVENT.TRANSITION, listener);
  }
}

function startLogsTablePersistenceOnReadiness(options = {}) {
  const readinessState = options.readinessState || null;
  const start = typeof options.start === 'function' ? options.start : null;
  const logger = options.logger || null;
  const delayMs = normalizeDelayMs(options.delayMs);

  let connectedService = null;
  let startPromise = null;
  let startTimer = null;
  let settled = false;
  let cancelled = false;
  let resolvePromise = null;

  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const settle = (service) => {
    connectedService = service || null;
    if (!settled) {
      settled = true;
      resolvePromise(connectedService);
    }
    return connectedService;
  };

  const clearStartTimer = () => {
    if (!startTimer) {
      return;
    }
    clearTimeout(startTimer);
    startTimer = null;
  };

  const maybeStart = () => {
    if (cancelled || startPromise || !start) {
      if (!start) {
        settle(null);
      }
      return;
    }

    const snapshot = readinessState?.getSnapshot?.() || null;
    if (snapshot && snapshot.ready !== true) {
      return;
    }

    clearStartTimer();
    removeReadinessTransitionListener(readinessState, handleTransition);
    startPromise = Promise.resolve()
      .then(() => start())
      .then((service) => settle(service))
      .catch((error) => {
        if (typeof logger?.warn === 'function') {
          logger.warn('Deferred logs table persistence startup failed', {
            error: error.message,
          });
        }
        return settle(null);
      });
  };

  const scheduleStart = () => {
    if (cancelled || startPromise || startTimer || !start) {
      return;
    }

    const snapshot = readinessState?.getSnapshot?.() || null;
    if (snapshot && snapshot.ready !== true) {
      return;
    }

    startTimer = setTimeout(() => {
      startTimer = null;
      maybeStart();
    }, delayMs);
    if (typeof startTimer.unref === 'function') {
      startTimer.unref();
    }
  };

  function handleTransition(transition) {
    if (transition?.ready === true) {
      scheduleStart();
      return;
    }
    if (!startPromise) {
      clearStartTimer();
    }
  }

  if (readinessState && typeof readinessState.on === LOCAL_STR_FUNCTION) {
    readinessState.on(READINESS_EVENT.TRANSITION, handleTransition);
    scheduleStart();
  } else {
    maybeStart();
  }

  return {
    getService: () => connectedService,
    promise,
    cancel: () => {
      cancelled = true;
      clearStartTimer();
      removeReadinessTransitionListener(readinessState, handleTransition);
      if (!startPromise) {
        settle(null);
      }
    },
  };
}

export {
  LOGS_TABLE_PERSISTENCE_READY_DELAY_MS,
  startLogsTablePersistenceOnReadiness,
};
