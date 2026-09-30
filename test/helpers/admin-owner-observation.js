import {AssertionError} from 'node:assert';
import {setTimeout, clearTimeout} from 'node:timers';

const ADMIN_OWNER_SIGNAL_TIMEOUT_MS = 750;

// Failure-only fixture watchdog. Captured native timers remain independent
// of global product-timer spies and node:test mocked deadline schedules.
async function observeAdminOwner(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new AssertionError({
        message: `Admin fixture owner did not settle: ${label}`,
        operator: 'owner-progress',
      })), ADMIN_OWNER_SIGNAL_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export {observeAdminOwner};
