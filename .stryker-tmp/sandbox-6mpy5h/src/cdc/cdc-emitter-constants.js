/**
 * Constants for CDCEmitter - composable CDC event generation and
 * subscriber management.
 * Encapsulates CDC event creation, subscriber lifecycle, and
 * event delivery.
 *
 * @module cdc/cdc-emitter-constants
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
import { CDC_OPERATION } from '../constants/index.js';

/**
 * CDC operation types for emitted events.
 * Re-exported from shared constants for CDCEmitter consumers.
 */
const CDC_EMITTER_OPERATION = Object.freeze(stryMutAct_9fa48("35400") ? {} : (stryCov_9fa48("35400"), {
  INSERT: CDC_OPERATION.INSERT,
  UPDATE: CDC_OPERATION.UPDATE,
  DELETE: CDC_OPERATION.DELETE
}));

/**
 * CDC event field names used when constructing event objects.
 */
const CDC_EMITTER_FIELD = Object.freeze(stryMutAct_9fa48("35401") ? {} : (stryCov_9fa48("35401"), {
  TABLE_NAME: stryMutAct_9fa48("35402") ? "" : (stryCov_9fa48("35402"), 'tableName'),
  OPERATION: stryMutAct_9fa48("35403") ? "" : (stryCov_9fa48("35403"), 'operation'),
  DATA: stryMutAct_9fa48("35404") ? "" : (stryCov_9fa48("35404"), 'data'),
  TIMESTAMP: stryMutAct_9fa48("35405") ? "" : (stryCov_9fa48("35405"), 'timestamp'),
  SOURCE_PARTITION: stryMutAct_9fa48("35406") ? "" : (stryCov_9fa48("35406"), 'sourcePartition'),
  SOURCE_REPLICA: stryMutAct_9fa48("35407") ? "" : (stryCov_9fa48("35407"), 'sourceReplica')
}));

/**
 * Error messages for CDCEmitter validation and runtime errors.
 */
const CDC_EMITTER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("35408") ? {} : (stryCov_9fa48("35408"), {
  MISSING_OPERATION: stryMutAct_9fa48("35409") ? "" : (stryCov_9fa48("35409"), 'CDCEmitter.emit requires operation'),
  MISSING_DATA: stryMutAct_9fa48("35410") ? "" : (stryCov_9fa48("35410"), 'CDCEmitter.emit requires data'),
  MISSING_PARTITION_ID: stryMutAct_9fa48("35411") ? "" : (stryCov_9fa48("35411"), 'CDCEmitter requires partitionId'),
  MISSING_REPLICA_ID: stryMutAct_9fa48("35412") ? "" : (stryCov_9fa48("35412"), 'CDCEmitter requires replicaId'),
  MISSING_TABLE_NAME: stryMutAct_9fa48("35413") ? "" : (stryCov_9fa48("35413"), 'CDCEmitter requires tableName'),
  MISSING_HLC_CLOCK: stryMutAct_9fa48("35414") ? "" : (stryCov_9fa48("35414"), 'CDCEmitter requires hlcClock'),
  subscriberDeliveryFailed: stryMutAct_9fa48("35415") ? () => undefined : (stryCov_9fa48("35415"), index => stryMutAct_9fa48("35416") ? `` : (stryCov_9fa48("35416"), `CDC subscriber delivery failed at index ${index}`))
}));

/**
 * Log messages emitted by CDCEmitter during lifecycle operations.
 */
const CDC_EMITTER_LOG_MSG = Object.freeze(stryMutAct_9fa48("35417") ? {} : (stryCov_9fa48("35417"), {
  EMITTING_EVENT: stryMutAct_9fa48("35418") ? "" : (stryCov_9fa48("35418"), 'Emitting CDC event'),
  SUBSCRIBER_ADDED: stryMutAct_9fa48("35419") ? "" : (stryCov_9fa48("35419"), 'CDC subscriber added'),
  SUBSCRIBER_REMOVED: stryMutAct_9fa48("35420") ? "" : (stryCov_9fa48("35420"), 'CDC subscriber removed'),
  SUBSCRIBER_DELIVERY_FAILED: stryMutAct_9fa48("35421") ? "" : (stryCov_9fa48("35421"), 'CDC subscriber delivery failed'),
  SHUTDOWN: stryMutAct_9fa48("35422") ? "" : (stryCov_9fa48("35422"), 'CDCEmitter shutting down'),
  SHUTDOWN_COMPLETE: stryMutAct_9fa48("35423") ? "" : (stryCov_9fa48("35423"), 'CDCEmitter shutdown complete')
}));
export { CDC_EMITTER_ERROR_MSG, CDC_EMITTER_FIELD, CDC_EMITTER_LOG_MSG, CDC_EMITTER_OPERATION };