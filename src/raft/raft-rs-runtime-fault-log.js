// The structured log line of a fault the raft-rs runtime observed, written
// at ERROR: a delivered envelope the local-log guard refused (rate limited
// per group and reason, raft-rs-runtime-faults.js), a core trap, a runtime replacement. Before this line
// existed a trap reached only the panic hook's raw stderr. The runtime owner
// is handed this reporter by its port and never imports logging itself
// (restore-path fence).

import {LoggingService} from '../logging/logging-service.js';
import {RUNTIME_FAULT_REPORT} from './raft-rs-runtime-owner-constants.js';

const RAFT_RS_FAULT_SUBSYSTEM = 'raft-rs';
const RAFT_RS_FAULT_LOG_MSG = Object.freeze({
  [RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED]: 'raft-rs inbound step refused',
  [RUNTIME_FAULT_REPORT.CORE_TRAPPED]: 'raft-rs core trapped',
  [RUNTIME_FAULT_REPORT.RUNTIME_REPLACED]: 'raft-rs runtime replaced',
  [RUNTIME_FAULT_REPORT.RESEED_HOLD_WRITE_FAILED]:
    'raft-rs reseed hold not yet durable',
});

/**
 * Write one fault's ERROR line.
 * @param {string} report - A RUNTIME_FAULT_REPORT name.
 * @param {Object} fields - The group (groupId, replicaIdentity, peerId) and
 *   what the fault names.
 */
function reportRaftRsRuntimeFault(report, fields) {
  LoggingService.getInstance().forSubsystem(RAFT_RS_FAULT_SUBSYSTEM)
    .error(RAFT_RS_FAULT_LOG_MSG[report], {report, ...fields});
}

export {reportRaftRsRuntimeFault};
