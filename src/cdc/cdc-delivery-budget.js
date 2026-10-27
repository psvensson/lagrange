// One CDC receiver/forwarder's local grant. Wire values are durations only;
// the creating clock and an enclosing local invocation fence every use.
import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {assertCdcDeliveryInvocation} from './cdc-delivery-invocation.js';
import {CDC_COMPLETION} from './cdc-delivery-outcome.js';

const CDC_DELIVERY_REMAINING_MS = 'cdcDeliveryRemainingMs';
const objectAssign = Object.assign;
const objectHasOwn = Object.hasOwn;
const objectFreeze = Object.freeze;
const numberIsFinite = Number.isFinite;
const minimum = Math.min;

function cdcDeliveryBudgetError(code = CDC_COMPLETION.UNKNOWN) {
  return objectAssign(new Error(code), {code, deferRetry: true, retryable: false});
}

function checkedCdcRemainingMs(value) {
  if (!numberIsFinite(value)) throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  if (value <= 0) throw cdcDeliveryBudgetError();
  return value;
}

function prepareCdcDeliveryMessage(message, remainingMs) {
  return {...message, [CDC_DELIVERY_REMAINING_MS]: checkedCdcRemainingMs(remainingMs)};
}

function enclosingCdcRemainingMs(options, context, limit) {
  if (context !== null) assertCdcDeliveryInvocation(context);
  options.assertCurrent?.();
  return minimum(limit,
    context === null ? limit : checkedCdcRemainingMs(context.remainingMs()),
    options.remainingMs === undefined ? limit : checkedCdcRemainingMs(options.remainingMs()));
}

function createCdcDeliveryBudget(service, options = {}, startedAtMs = service.timeSource.now()) {
  const context = options.deliveryContext ?? null;
  const clock = service.timeSource;
  const port = service.raft;
  const lifetime = service.cdcCommitLifetime;
  const groupId = service.groupId;
  const parent = {assertCurrent: options.assertCurrent, remainingMs: options.remainingMs};
  const limit = checkedCdcRemainingMs(service.deliveryTimeoutMs);
  const received = objectHasOwn(options, 'receivedRemainingMs') ?
    checkedCdcRemainingMs(options.receivedRemainingMs) : limit;
  const configuredBudgetMs = minimum(received, enclosingCdcRemainingMs(parent, context, limit));
  const now = () => clock.now();
  const budget = createTimeoutBudget({configuredBudgetMs, startedAtMs, now});
  const remainingMs = () => {
    if (service.isShutdown || !service.initialized || service.raft !== port ||
        service.cdcCommitLifetime !== lifetime || service.groupId !== groupId) {
      throw cdcDeliveryBudgetError();
    }
    const parentRemainingMs = enclosingCdcRemainingMs(parent, context, limit);
    return checkedCdcRemainingMs(minimum(getRemainingBudgetMs(budget, {now}),
      parentRemainingMs));
  };
  const assertCurrent = () => {
    remainingMs();
  };
  assertCurrent();
  return objectFreeze({assertCurrent, remainingMs, deliveryContext: context});
}

export {CDC_DELIVERY_REMAINING_MS, cdcDeliveryBudgetError, checkedCdcRemainingMs,
  createCdcDeliveryBudget, prepareCdcDeliveryMessage};
