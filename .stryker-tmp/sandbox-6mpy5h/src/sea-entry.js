#!/usr/bin/env node
// @ts-nocheck
/**
 * Single Executable Application Entry Point
 *
 * This entry point handles version/help flags before loading the main module,
 * allowing the SEA to respond to basic commands without requiring native modules.
 */
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
import { ENTRYPOINT_TEXT, ENTRYPOINT_VERSION, ENTRYPOINT_FLAG } from './constants/entrypoint.js';
const VERSION = ENTRYPOINT_VERSION;

/**
 * Check for version flag.
 * @return {boolean} True if version was printed
 */
function checkVersionFlag() {
  if (stryMutAct_9fa48("149721")) {
    {}
  } else {
    stryCov_9fa48("149721");
    const args = stryMutAct_9fa48("149722") ? process.argv : (stryCov_9fa48("149722"), process.argv.slice(2));
    if (stryMutAct_9fa48("149725") ? args.includes(ENTRYPOINT_FLAG.VERSION_LONG) && args.includes(ENTRYPOINT_FLAG.VERSION_SHORT) : stryMutAct_9fa48("149724") ? false : stryMutAct_9fa48("149723") ? true : (stryCov_9fa48("149723", "149724", "149725"), args.includes(ENTRYPOINT_FLAG.VERSION_LONG) || args.includes(ENTRYPOINT_FLAG.VERSION_SHORT))) {
      if (stryMutAct_9fa48("149726")) {
        {}
      } else {
        stryCov_9fa48("149726");
        console.log(ENTRYPOINT_TEXT.versionLine(VERSION));
        return stryMutAct_9fa48("149727") ? false : (stryCov_9fa48("149727"), true);
      }
    }
    if (stryMutAct_9fa48("149730") ? args.includes(ENTRYPOINT_FLAG.HELP_LONG) && args.includes(ENTRYPOINT_FLAG.HELP_SHORT) : stryMutAct_9fa48("149729") ? false : stryMutAct_9fa48("149728") ? true : (stryCov_9fa48("149728", "149729", "149730"), args.includes(ENTRYPOINT_FLAG.HELP_LONG) || args.includes(ENTRYPOINT_FLAG.HELP_SHORT))) {
      if (stryMutAct_9fa48("149731")) {
        {}
      } else {
        stryCov_9fa48("149731");
        console.log(ENTRYPOINT_TEXT.headerLine(VERSION));
        console.log(stryMutAct_9fa48("149732") ? "Stryker was here!" : (stryCov_9fa48("149732"), ''));
        console.log(ENTRYPOINT_TEXT.USAGE_LINE);
        console.log(stryMutAct_9fa48("149733") ? "Stryker was here!" : (stryCov_9fa48("149733"), ''));
        console.log(stryMutAct_9fa48("149734") ? "" : (stryCov_9fa48("149734"), 'Options:'));
        for (const line of ENTRYPOINT_TEXT.OPTIONS_LINES) {
          if (stryMutAct_9fa48("149735")) {
            {}
          } else {
            stryCov_9fa48("149735");
            console.log(line);
          }
        }
        console.log(stryMutAct_9fa48("149736") ? "Stryker was here!" : (stryCov_9fa48("149736"), ''));
        console.log(stryMutAct_9fa48("149737") ? "" : (stryCov_9fa48("149737"), 'Environment Variables:'));
        for (const line of ENTRYPOINT_TEXT.ENVIRONMENT_LINES) {
          if (stryMutAct_9fa48("149738")) {
            {}
          } else {
            stryCov_9fa48("149738");
            console.log(line);
          }
        }
        return stryMutAct_9fa48("149739") ? false : (stryCov_9fa48("149739"), true);
      }
    }
    return stryMutAct_9fa48("149740") ? true : (stryCov_9fa48("149740"), false);
  }
}

// Handle version/help flags early
if (stryMutAct_9fa48("149742") ? false : stryMutAct_9fa48("149741") ? true : (stryCov_9fa48("149741", "149742"), checkVersionFlag())) {
  if (stryMutAct_9fa48("149743")) {
    {}
  } else {
    stryCov_9fa48("149743");
    process.exit(0);
  }
}

// Load the main module (this will fail if native modules are not available)
import(stryMutAct_9fa48("149744") ? "" : (stryCov_9fa48("149744"), './index.js')).catch(err => {
  if (stryMutAct_9fa48("149745")) {
    {}
  } else {
    stryCov_9fa48("149745");
    if (stryMutAct_9fa48("149748") ? err.code !== 'ERR_UNKNOWN_BUILTIN_MODULE' : stryMutAct_9fa48("149747") ? false : stryMutAct_9fa48("149746") ? true : (stryCov_9fa48("149746", "149747", "149748"), err.code === (stryMutAct_9fa48("149749") ? "" : (stryCov_9fa48("149749"), 'ERR_UNKNOWN_BUILTIN_MODULE')))) {
      if (stryMutAct_9fa48("149750")) {
        {}
      } else {
        stryCov_9fa48("149750");
        console.error(ENTRYPOINT_TEXT.SEA_NATIVE_ERROR);
        console.error(stryMutAct_9fa48("149751") ? "Stryker was here!" : (stryCov_9fa48("149751"), ''));
        for (const line of ENTRYPOINT_TEXT.SEA_NATIVE_HELP) {
          if (stryMutAct_9fa48("149752")) {
            {}
          } else {
            stryCov_9fa48("149752");
            console.error(line);
          }
        }
        console.error(stryMutAct_9fa48("149753") ? "Stryker was here!" : (stryCov_9fa48("149753"), ''));
        for (const line of ENTRYPOINT_TEXT.SEA_RUN_INSTRUCTIONS) {
          if (stryMutAct_9fa48("149754")) {
            {}
          } else {
            stryCov_9fa48("149754");
            console.error(line);
          }
        }
        process.exit(1);
      }
    }
    console.error(stryMutAct_9fa48("149755") ? `` : (stryCov_9fa48("149755"), `${ENTRYPOINT_TEXT.FATAL_ERROR_PREFIX}`), err);
    process.exit(1);
  }
});