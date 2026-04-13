/**
 * Constants for ProposalQueue module.
 * Requirements: 3.1
 *
 * @module partition/proposal-queue-constants
 */
// @ts-nocheck


/**
 * Default configuration values for the ProposalQueue.
 * @type {Object}
 */function stryNS_9fa48() {
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
const PROPOSAL_QUEUE_DEFAULT = Object.freeze(stryMutAct_9fa48("107627") ? {} : (stryCov_9fa48("107627"), {
  MAX_CAPACITY: 1000
}));

/**
 * Error messages for ProposalQueue operations.
 * @type {Object}
 */
const PROPOSAL_QUEUE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("107628") ? {} : (stryCov_9fa48("107628"), {
  BACKPRESSURE: stryMutAct_9fa48("107629") ? "" : (stryCov_9fa48("107629"), 'Proposal queue at capacity — backpressure applied')
}));

/**
 * Log messages for ProposalQueue operations.
 * @type {Object}
 */
const PROPOSAL_QUEUE_LOG_MSG = Object.freeze(stryMutAct_9fa48("107630") ? {} : (stryCov_9fa48("107630"), {
  ENQUEUE: stryMutAct_9fa48("107631") ? "" : (stryCov_9fa48("107631"), 'Proposal enqueued'),
  RESOLVE: stryMutAct_9fa48("107632") ? "" : (stryCov_9fa48("107632"), 'Proposal resolved'),
  REJECT: stryMutAct_9fa48("107633") ? "" : (stryCov_9fa48("107633"), 'Proposal rejected')
}));
export { PROPOSAL_QUEUE_DEFAULT, PROPOSAL_QUEUE_ERROR_MSG, PROPOSAL_QUEUE_LOG_MSG };