import {test} from '../../src/test-helpers/tap.js';
import {priorityRecoveryDispatchPendingTimeoutReentryTestCases} from
  './priority-recovery-dispatch-pending-timeout-reentry-suite.js';

for (const {name, fn} of priorityRecoveryDispatchPendingTimeoutReentryTestCases) {
  test(name, fn);
}
