/**
 * Constants for PartitionReplicationHandler.
 * Extracted from partition-service-constants.js for single responsibility.
 * Requirements: 1.1, 1.8, 2.1, 2.5
 *
 * @module partition/partition-replication-handler-constants
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TIME_MS } from '../constants/time.js';

/**
 * Log messages for replication handler operations.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_LOG_MSG = Object.freeze(stryMutAct_9fa48("100918") ? {} : (stryCov_9fa48("100918"), {
  PROPOSE_WRITE_CALLED: stryMutAct_9fa48("100919") ? "" : (stryCov_9fa48("100919"), 'proposeWrite called'),
  FORWARDING_WRITE_TO_LEADER: stryMutAct_9fa48("100920") ? "" : (stryCov_9fa48("100920"), 'Forwarding write to leader'),
  FORWARD_WRITE_SUCCESS: stryMutAct_9fa48("100921") ? "" : (stryCov_9fa48("100921"), 'Forward write succeeded'),
  APPLY_WRITE_CALLED: stryMutAct_9fa48("100922") ? "" : (stryCov_9fa48("100922"), 'applyWrite called'),
  APPLY_WRITE_SINGLE_REPLICA: stryMutAct_9fa48("100923") ? "" : (stryCov_9fa48("100923"), 'applyWrite single-replica direct execution'),
  APPLY_WRITE_MULTI_REPLICA: stryMutAct_9fa48("100924") ? "" : (stryCov_9fa48("100924"), 'applyWrite multi-replica Raft proposal'),
  APPLY_WRITE_SUCCESS: stryMutAct_9fa48("100925") ? "" : (stryCov_9fa48("100925"), 'applyWrite succeeded'),
  RAFT_COMMAND_SENT: stryMutAct_9fa48("100926") ? "" : (stryCov_9fa48("100926"), 'Raft command sent for replication'),
  HANDLING_FORWARD_WRITE: stryMutAct_9fa48("100927") ? "" : (stryCov_9fa48("100927"), 'Handling forwarded write from follower'),
  RESOLVING_LEADER_ADDRESS: stryMutAct_9fa48("100928") ? "" : (stryCov_9fa48("100928"), 'Resolving leader address for write forwarding'),
  LEADER_ADDRESS_RESOLVED: stryMutAct_9fa48("100929") ? "" : (stryCov_9fa48("100929"), 'Leader address resolved'),
  NO_LEADER_AVAILABLE: stryMutAct_9fa48("100930") ? "" : (stryCov_9fa48("100930"), 'No leader available for write'),
  EXECUTE_SQL: stryMutAct_9fa48("100931") ? "" : (stryCov_9fa48("100931"), 'Executing SQL from write entry'),
  CDC_EVENT_GENERATION_FAILED: stryMutAct_9fa48("100932") ? "" : (stryCov_9fa48("100932"), 'CDC event generation failed after write')
}));

/**
 * Error messages for replication handler operations.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("100933") ? {} : (stryCov_9fa48("100933"), {
  NOT_INITIALIZED: stryMutAct_9fa48("100934") ? "" : (stryCov_9fa48("100934"), 'PartitionReplicationHandler not initialized'),
  NO_LEADER_AVAILABLE: stryMutAct_9fa48("100935") ? "" : (stryCov_9fa48("100935"), 'No leader available for write'),
  INVALID_FORWARD_WRITE: stryMutAct_9fa48("100936") ? "" : (stryCov_9fa48("100936"), 'Invalid FORWARD_WRITE message - missing operation'),
  FORWARD_WRITE_FAILED: stryMutAct_9fa48("100937") ? "" : (stryCov_9fa48("100937"), 'Failed to forward write to leader'),
  APPLY_WRITE_FAILED: stryMutAct_9fa48("100938") ? "" : (stryCov_9fa48("100938"), 'Failed to apply write'),
  RAFT_COMMAND_FAILED: stryMutAct_9fa48("100939") ? "" : (stryCov_9fa48("100939"), 'Raft command failed'),
  RAFT_COMMIT_TIMEOUT: stryMutAct_9fa48("100940") ? "" : (stryCov_9fa48("100940"), 'Raft commit timeout'),
  /**
   * Generate error message for forward write failure.
   * @param {string} message - Original error message.
   * @return {string} Formatted error message.
   */
  forwardWriteFailed: stryMutAct_9fa48("100941") ? () => undefined : (stryCov_9fa48("100941"), message => stryMutAct_9fa48("100942") ? `` : (stryCov_9fa48("100942"), `Failed to forward write to leader: ${message}`))
}));

/**
 * Default values for replication handler.
 * @type {Object}
 */
const PARTITION_REPLICATION_HANDLER_DEFAULT = Object.freeze(stryMutAct_9fa48("100943") ? {} : (stryCov_9fa48("100943"), {
  EMPTY_PARAMS: stryMutAct_9fa48("100944") ? ["Stryker was here"] : (stryCov_9fa48("100944"), []),
  RAFT_COMMIT_TIMEOUT_MS: TIME_MS.DEFAULT_RPC_TIMEOUT
}));
export { PARTITION_REPLICATION_HANDLER_LOG_MSG, PARTITION_REPLICATION_HANDLER_ERROR_MSG, PARTITION_REPLICATION_HANDLER_DEFAULT };