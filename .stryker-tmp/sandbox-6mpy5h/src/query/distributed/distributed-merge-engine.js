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
import { StreamingAggregator } from '../streaming-aggregator.js';

/**
 * DistributedMergeEngine wraps StreamingAggregator for canonical
 * distributed SQL global-merge semantics.
 */
class DistributedMergeEngine {
  /**
   * @param {Object} options
   * @param {Function} [options.streamingAggregatorFactory]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("110204")) {
      {}
    } else {
      stryCov_9fa48("110204");
      this.streamingAggregatorFactory = stryMutAct_9fa48("110207") ? options.streamingAggregatorFactory && (() => new StreamingAggregator()) : stryMutAct_9fa48("110206") ? false : stryMutAct_9fa48("110205") ? true : (stryCov_9fa48("110205", "110206", "110207"), options.streamingAggregatorFactory || (stryMutAct_9fa48("110208") ? () => undefined : (stryCov_9fa48("110208"), () => new StreamingAggregator())));
    }
  }

  /**
   * Merge partition results using streaming buffering and global semantics.
   * @param {Object[]} partitionResults - Partition execution results.
   * @param {Object} ast - SELECT AST.
   * @param {Object} queryExecutor - QueryExecutor instance.
   * @return {Object} Aggregated result.
   */
  mergePartitionResults(partitionResults, ast, queryExecutor) {
    if (stryMutAct_9fa48("110209")) {
      {}
    } else {
      stryCov_9fa48("110209");
      const aggregator = this.streamingAggregatorFactory();
      for (const partitionResult of partitionResults) {
        if (stryMutAct_9fa48("110210")) {
          {}
        } else {
          stryCov_9fa48("110210");
          if (stryMutAct_9fa48("110213") ? partitionResult.success || Array.isArray(partitionResult.rows) : stryMutAct_9fa48("110212") ? false : stryMutAct_9fa48("110211") ? true : (stryCov_9fa48("110211", "110212", "110213"), partitionResult.success && Array.isArray(partitionResult.rows))) {
            if (stryMutAct_9fa48("110214")) {
              {}
            } else {
              stryCov_9fa48("110214");
              aggregator.addRows(partitionResult.rows);
            }
          }
        }
      }
      const mergedRows = aggregator.getAllRows();
      return queryExecutor.aggregateSelectResults(stryMutAct_9fa48("110215") ? [] : (stryCov_9fa48("110215"), [stryMutAct_9fa48("110216") ? {} : (stryCov_9fa48("110216"), {
        success: stryMutAct_9fa48("110217") ? false : (stryCov_9fa48("110217"), true),
        rows: mergedRows
      })]), ast);
    }
  }

  /**
   * Merge set-operation fragments through the same canonical merge path.
   * @param {Object[]} partitionResults - Partition execution results.
   * @param {Object} ast - SELECT AST with set operation.
   * @param {Object} queryExecutor - QueryExecutor instance.
   * @return {Object} Aggregated result.
   */
  mergeSetOperationResults(partitionResults, ast, queryExecutor) {
    if (stryMutAct_9fa48("110218")) {
      {}
    } else {
      stryCov_9fa48("110218");
      return this.mergePartitionResults(partitionResults, ast, queryExecutor);
    }
  }
}
export { DistributedMergeEngine };