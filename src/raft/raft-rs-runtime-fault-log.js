// The structured log line of a fault the raft-rs runtime observed, written
// at ERROR: a delivered envelope the local-log guard refused (rate limited
// per group and reason, raft-rs-runtime-faults.js), a core trap, a runtime replacement. Before this line
// existed a trap reached only the panic hook's raw stderr. The runtime owner
// is handed this reporter by its port and never imports logging itself
// (restore-path fence).

import {LoggingService} from '../logging/logging-service.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {RAFT_RS_READY_DRAIN_MAX_CYCLES} from './raft-rs-group-constants.js';
import {
  PERSISTENCE_ADMISSION_WAIT,
  RUNTIME_FAULT_REPORT,
} from './raft-rs-runtime-owner-constants.js';

const RAFT_RS_FAULT_SUBSYSTEM = 'raft-rs';
const RAFT_RS_FAULT_LOG_MSG = Object.freeze({
  [RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED]: 'raft-rs inbound step refused',
  [RUNTIME_FAULT_REPORT.CORE_TRAPPED]: 'raft-rs core trapped',
  [RUNTIME_FAULT_REPORT.RUNTIME_REPLACED]: 'raft-rs runtime replaced',
  [RUNTIME_FAULT_REPORT.RESEED_HOLD_WRITE_FAILED]:
    'raft-rs reseed hold not yet durable',
});

// A spent wait bound of the runtime is written as the one wait_bound_spent
// line (logging/wait-bound-spent.js) instead of a fault line.
const RAFT_RS_SPENT_WAIT = Object.freeze({
  [RUNTIME_FAULT_REPORT.READY_DRAIN_BOUND_EXCEEDED]: Object.freeze({
    wait: 'RAFT_RS_READY_DRAIN_MAX_CYCLES',
    awaited: 'the core has no further Ready',
    boundMs: null,
    bound: RAFT_RS_READY_DRAIN_MAX_CYCLES,
  }),
  [RUNTIME_FAULT_REPORT.PERSISTENCE_ADMISSION_BOUND_EXCEEDED]: Object.freeze({
    wait: 'PERSISTENCE_ADMISSION_WAIT.BOUND_MS',
    awaited: 'the store admits durable writes for a taken Ready',
    boundMs: PERSISTENCE_ADMISSION_WAIT.BOUND_MS,
  }),
  [RUNTIME_FAULT_REPORT.INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED]:
    Object.freeze({
      wait: 'PERSISTENCE_ADMISSION_WAIT.BOUND_MS (inbound drain)',
      awaited: 'the store admits durable writes for delivered inbound',
      boundMs: PERSISTENCE_ADMISSION_WAIT.BOUND_MS,
    }),
});

function reportSpentWait(spent, fields) {
  const {groupId, replicaIdentity, peerId, elapsedMs, ...observed} = fields;
  const {bound, ...wait} = spent;
  reportWaitBoundSpent(
    LoggingService.getInstance().forSubsystem(RAFT_RS_FAULT_SUBSYSTEM), {
      ...wait,
      elapsedMs,
      lastObserved: bound === undefined ? observed : {...observed, bound},
      scope: {groupId, replicaIdentity, peerId},
    });
}

/**
 * Write one fault's ERROR line.
 * @param {string} report - A RUNTIME_FAULT_REPORT name.
 * @param {Object} fields - The group (groupId, replicaIdentity, peerId) and
 *   what the fault names.
 */
function reportRaftRsRuntimeFault(report, fields) {
  const spent = RAFT_RS_SPENT_WAIT[report];
  if (spent !== undefined) {
    reportSpentWait(spent, fields);
    return;
  }
  LoggingService.getInstance().forSubsystem(RAFT_RS_FAULT_SUBSYSTEM)
    .error(RAFT_RS_FAULT_LOG_MSG[report], {report, ...fields});
}

export {reportRaftRsRuntimeFault};
