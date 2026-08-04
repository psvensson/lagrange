/**
 * Shared throttle for the CDC row-fetch diagnostics (quest
 * movielens-nodes-priority-recovery-escape). These emit inside the
 * stateless SQL-parse/extract helpers (which receive only a logger), so a
 * per-instance throttle cannot reach them; a single module-level throttle
 * keyed per (message, table, replica) collapses the 3300+/run flood observed
 * live while keeping per-table/per-replica attribution. Uses LogThrottle's
 * default window.
 */

import {LogThrottle} from '../logging/log-throttle.js';

const throttle = new LogThrottle();

/**
 * Admit a CDC row-fetch log emit. Returns the suppressed-since-last count
 * when admitted (caller folds it into context), or null to suppress.
 * @param {string} key - e.g. `${message}:${tableName}:${replicaId}`.
 * @return {?number}
 */
function admitCdcRowFetchLog(key) {
  return throttle.admit(key);
}

export {admitCdcRowFetchLog};
