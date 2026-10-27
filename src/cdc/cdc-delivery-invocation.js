// Private lifetime of one CDC delivery-owner invocation. The durable debt
// remains in the source ledger; this owns only its current response and actual
// local child cleanup. It is deliberately outside the resettable source lane.
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-key-constants.js';
import {TRANSPORT_CONFIG_KEY, TRANSPORT_DEFAULT} from '../constants/transport.js';
import {MESSAGE_GROUP_SERVICE_DEFAULT} from '../message-group/constants.js';
import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {CDC_COMPLETION} from './cdc-delivery-outcome.js';

const invocationContexts = new WeakSet();
const CDC_CLEANUP_NOTIFICATION_FAILED = 'cdc_invocation_cleanup_notification_failed';
const CDC_CLEANUP_NOTIFICATION_ERROR_UNREADABLE = 'unreadable_cleanup_notification_error';
const CDC_CLEANUP_NOTIFICATION_ERROR_MESSAGE = 'CDC invocation cleanup notification failed';
const CDC_CLEANUP_NOTIFIED = Object.freeze({closed: true, notificationFailure: null});

function describeNotificationError(error) {
  try {
    return String(error?.message ?? error);
  } catch {
    return CDC_CLEANUP_NOTIFICATION_ERROR_UNREADABLE;
  }
}

function failedCleanupNotification(owner, error) {
  const failure = {code: CDC_CLEANUP_NOTIFICATION_FAILED, error};
  try {
    owner.logger.error(CDC_CLEANUP_NOTIFICATION_ERROR_MESSAGE, {
      event: CDC_CLEANUP_NOTIFICATION_FAILED,
      partitionId: owner.partitionId, groupId: owner.groupId,
      error: describeNotificationError(error),
    });
  } catch (reportingError) {
    // Reporting failure remains explicit in the owned terminal result too.
    // Neither observer is allowed to replace the delivery's original answer.
    failure.reportingError = reportingError;
  }
  return Object.freeze({closed: true, notificationFailure: Object.freeze(failure)});
}

function notifyCdcInvocationClosed(owner, onClosed, cleanup) {
  const failed = (error) => cleanup.resolve(failedCleanupNotification(owner, error));
  try {
    // Keep notification settlement on this existing cleanup promise. A
    // returned rejection is consumed as well as a synchronous callback throw.
    Promise.resolve(onClosed()).then(() => cleanup.resolve(CDC_CLEANUP_NOTIFIED), failed);
  } catch (error) {
    failed(error);
  }
}

function invocationError(code = CDC_COMPLETION.UNKNOWN) {
  return Object.assign(new Error(code), {code, deferRetry: true});
}

function configuredInvocationBudget() {
  const config = ConfigurationManager.getInstance();
  return Math.min(
    config.get(CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS) ??
      MESSAGE_GROUP_SERVICE_DEFAULT.DELIVERY_TIMEOUT_MS,
    config.get(TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS) ?? TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
  );
}

function isCdcDeliveryInvocation(context) {
  return invocationContexts.has(context);
}

function assertCdcDeliveryInvocation(context) {
  if (!isCdcDeliveryInvocation(context)) throw invocationError(CDC_COMPLETION.INVALID);
  context.assertCurrent();
}

// Source-owned progress is scoped to the responsible subscriber while sharing
// the same response deadline and actual-child custody. No scope gets a new
// timer, invocation slot or cleanup promise.
function scopeCdcDeliveryInvocation(parent, isCurrent, operations) {
  assertCdcDeliveryInvocation(parent);
  const assertCurrent = () => {
    parent.assertCurrent();
    if (!isCurrent()) {
      const error = invocationError();
      parent.retire(error);
      throw error;
    }
  };
  const context = {
    ...parent,
    assertCurrent,
    remainingMs: () => {
      assertCurrent();
      return parent.remainingMs();
    },
    ownChild: (completion) => {
      assertCurrent();
      return parent.ownChild(completion);
    },
    run: async (operation) => {
      assertCurrent();
      try {
        const answer = await parent.run(() => {
          assertCurrent();
          return operation();
        });
        assertCurrent();
        return answer;
      } catch (error) {
        assertCurrent();
        throw error;
      }
    },
  };
  Object.assign(context, operations(context));
  Object.freeze(context);
  invocationContexts.add(context);
  return context;
}

// A topology wave closes independently of the enclosing source invocation,
// but every actual local child is also charged to that invocation. A raced
// response cannot release either owner's unfinished child.
function openCdcDeliveryChildScope(parent) {
  assertCdcDeliveryInvocation(parent);
  const cleanup = Promise.withResolvers();
  let accepting = true;
  let children = 0;
  const closeIfSettled = () => {
    if (!accepting && children === 0) cleanup.resolve();
  };
  const assertCurrent = () => {
    parent.assertCurrent();
    if (!accepting) throw invocationError();
  };
  const ownChild = (completion) => {
    assertCurrent();
    parent.ownChild(completion);
    children += 1;
    const settled = () => {
      children -= 1;
      closeIfSettled();
    };
    Promise.resolve(completion).then(settled, settled);
    return completion;
  };
  const context = Object.freeze({
    ...parent,
    assertCurrent,
    ownChild,
    cleanup: cleanup.promise,
    remainingMs: () => {
      assertCurrent();
      return parent.remainingMs();
    },
    run: (operation) => {
      assertCurrent();
      const raw = ownChild(Promise.resolve().then(() => {
        assertCurrent();
        return operation();
      }));
      return parent.run(() => raw);
    },
    finish: () => {
      accepting = false;
      closeIfSettled();
    },
  });
  invocationContexts.add(context);
  return context;
}

function beginCdcDeliveryInvocation(delivery, isCurrent, onClosed = () => {}) {
  if (delivery.activeCdcInvocation) throw invocationError(CDC_COMPLETION.BACKPRESSURE);
  const {owner} = delivery;
  const clock = owner.timeSource;
  const now = () => clock.now();
  const budget = createTimeoutBudget({configuredBudgetMs: configuredInvocationBudget(), now});
  const controller = new AbortController();
  const cleanup = Promise.withResolvers();
  const invocation = {};
  let dispatchClosed = false;
  let childCount = 0;
  let closed = false;
  let refusal = null;
  let timeoutId = null;

  const closeIfSettled = () => {
    if (closed || !dispatchClosed || childCount !== 0) return;
    closed = true;
    if (delivery.activeCdcInvocation === invocation) delivery.activeCdcInvocation = null;
    notifyCdcInvocationClosed(owner, onClosed, cleanup);
  };
  const closeDispatch = () => {
    dispatchClosed = true;
    if (timeoutId !== null) clock.clearTimeout(timeoutId);
    timeoutId = null;
  };
  const retire = (error = invocationError()) => {
    if (refusal !== null) return;
    refusal = error;
    closeDispatch();
    controller.abort(error);
    closeIfSettled();
  };
  const assertCurrent = () => {
    if (refusal !== null) throw refusal;
    if (dispatchClosed || delivery.activeCdcInvocation !== invocation || owner.isShutdown ||
        !isCurrent() || getRemainingBudgetMs(budget, {now}) <= 0) {
      retire();
      throw refusal;
    }
  };
  const ownChild = (completion) => {
    // Acquisition must happen before a caller races the public response. Both
    // handlers consume settlement; no rejected finally tail is detached.
    assertCurrent();
    childCount += 1;
    const settled = () => {
      childCount -= 1;
      closeIfSettled();
    };
    Promise.resolve(completion).then(settled, settled);
    return completion;
  };
  const run = (operation) => {
    assertCurrent();
    const raw = ownChild(Promise.resolve().then(() => {
      assertCurrent();
      return operation();
    }));
    return new Promise((resolve, reject) => {
      function aborted() {
        controller.signal.removeEventListener('abort', aborted);
        reject(refusal);
      }
      const remove = () => controller.signal.removeEventListener('abort', aborted);
      controller.signal.addEventListener('abort', aborted, {once: true});
      raw.then((answer) => {
        remove();
        try {
          assertCurrent();
          resolve(answer);
        } catch (error) {
          reject(error);
        }
      }, (error) => {
        remove();
        try {
          assertCurrent();
          reject(error);
        } catch (expired) {
          reject(expired);
        }
      });
    });
  };
  const context = Object.freeze({
    assertCurrent,
    ownChild,
    run,
    retire,
    signal: controller.signal,
    cleanup: cleanup.promise,
    remainingMs: () => {
      assertCurrent();
      return getRemainingBudgetMs(budget, {now});
    },
    finish: () => retire(),
  });
  invocationContexts.add(context);
  invocation.context = context;
  invocation.retire = retire;
  delivery.activeCdcInvocation = Object.freeze(invocation);
  timeoutId = clock.setTimeout(() => retire(), getRemainingBudgetMs(budget, {now}));
  owner.trackPendingCDCEvent?.(cleanup.promise);
  return context;
}

export {assertCdcDeliveryInvocation, beginCdcDeliveryInvocation, isCdcDeliveryInvocation,
  openCdcDeliveryChildScope, scopeCdcDeliveryInvocation};
