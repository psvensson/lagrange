// One foreground retry wait decision for the source-owned durable wave.
// The prepared wave owns its duration and wait; this owner applies attempt and
// lifecycle bounds before returning the observed decision to the delivery loop.
import {reportCdcPropagationRetryScheduled} from './cdc-group-propagation-retry-wait-report.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE} from
  './cdc-group-propagation-constants.js';

function foregroundRetryState(owner, attempt, maxAttempts) {
  return owner.isPropagationStopped() ? CDC_GROUP_FOREGROUND_RETRY_STATE.STOPPED :
    attempt >= maxAttempts ? CDC_GROUP_FOREGROUND_RETRY_STATE.ATTEMPTS_EXHAUSTED :
      CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE;
}

async function waitForForegroundRetry(owner, wave, attempt, maxAttempts) {
  const state = foregroundRetryState(owner, attempt, maxAttempts);
  if (state !== CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE) return {state};
  const retryDelayMs = owner.computeRetryDelayMs(attempt);
  const wait = wave.prepareWait(retryDelayMs);
  if (wait.state !== CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE) return wait;
  reportCdcPropagationRetryScheduled(owner, {
    ...wave.deliveryLabel, attempt, retryDelayMs,
    failureCount: wave.failureCount(),
  });
  await wave.wait(retryDelayMs);
  return owner.isPropagationStopped() ?
    {state: CDC_GROUP_FOREGROUND_RETRY_STATE.STOPPED} : wait;
}

export {waitForForegroundRetry};
